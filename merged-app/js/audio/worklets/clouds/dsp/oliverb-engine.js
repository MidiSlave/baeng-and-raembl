/**
 * Oliverb Engine - Parasites Reverb Mode (Mode 4)
 * Ported from Mutable Instruments Parasites firmware
 * ES Module version for AudioWorklet
 *
 * Architecture: Griesinger/Dattorro reverb topology
 * - 4 input allpass diffusers (113, 162, 241, 399 samples)
 * - Left tank: dap1a (1253) + dap1b (1738) + del1 (3411)
 * - Right tank: dap2a (1513) + dap2b (1363) + del2 (4782)
 * - 9 RandomOscillators for delay line modulation
 * - Integrated pitch shifter using dual-head window crossfade
 * - Total buffer: ~16KB (16384 samples)
 */

import { FxEngine, Context, DelayLine } from '../../clouds-gemini/dsp/fx-engine.js?v=2';
import { SoftLimit, Interpolate, SemitonesToRatio, ONE_POLE_FILTER } from '../../clouds-gemini/core/utils.js';
import { RandomOscillator } from './random-oscillator.js';
import { LUT_WINDOW, LUT_WINDOW_SIZE } from './resources.js';

export class OliverbEngine {
  constructor() {
    // FxEngine with 16KB delay buffer
    this.engine_ = new FxEngine(16384);

    // Parameters
    this.input_gain_ = 0.0;
    this.decay_ = 0.0;
    this.diffusion_ = 0.0;
    this.lp_ = 0.0;
    this.hp_ = 0.0;
    this.size_ = 0.0;
    this.smooth_size_ = 0.0;
    this.mod_amount_ = 0.0;
    this.mod_rate_ = 0.0;
    this.pitch_shift_amount_ = 0.0;

    // Filter state (one-pole LP/HP in feedback path)
    this.lp_decay_1_ = 0.0;
    this.lp_decay_2_ = 0.0;
    this.hp_decay_1_ = 0.0;
    this.hp_decay_2_ = 0.0;

    // Pitch shifter state
    this.phase_ = 0.0;
    this.ratio_ = 0.0;
    this.level_ = 0.0;

    // 9 LFOs for modulation (used across all delay lines)
    this.lfo_ = [];
    for (let i = 0; i < 9; i++) {
      this.lfo_.push(new RandomOscillator());
    }

    // Delay line allocation tracking
    this.delayLinesAllocated_ = false;
  }

  /**
   * Initialise with buffer
   * @param {Float32Array} buffer - Pre-allocated 16KB buffer
   */
  Init(buffer) {
    this.engine_.Init(buffer);

    // Default parameter values
    this.diffusion_ = 0.625;
    this.size_ = 0.5;
    this.smooth_size_ = this.size_;
    this.mod_amount_ = 0.0;
    this.mod_rate_ = 0.0;
    this.input_gain_ = 1.0;
    this.decay_ = 0.5;
    this.lp_ = 1.0;
    this.hp_ = 0.0;
    this.phase_ = 0.0;
    this.ratio_ = 0.0;
    this.pitch_shift_amount_ = 1.0;
    this.level_ = 0.0;

    // Initialise filter state
    this.lp_decay_1_ = 0.0;
    this.lp_decay_2_ = 0.0;
    this.hp_decay_1_ = 0.0;
    this.hp_decay_2_ = 0.0;

    // Initialise LFOs
    for (let i = 0; i < 9; i++) {
      this.lfo_[i].Init();
    }
  }

  /**
   * Process audio block
   * Griesinger topology: 4 AP diffusers → 2x (2AP+1Delay) tanks
   * @param {Float32Array} inputL - Left input (mono summed to both channels)
   * @param {Float32Array} inputR - Right input (ignored, uses L only)
   * @param {Float32Array} outputL - Left output
   * @param {Float32Array} outputR - Right output
   * @param {Object} params - Oliverb parameters
   */
  process(inputL, inputR, outputL, outputR, params) {
    const frameCount = inputL.length;

    // Allocate delay lines on first call (done once per lifetime)
    // CRITICAL: Must happen AFTER Init() has been called with buffer
    if (!this.delayLinesAllocated_) {
      const c = new Context();
      this.ap1 = this.engine_.AllocateDelayLine(113);
      this.ap2 = this.engine_.AllocateDelayLine(162);
      this.ap3 = this.engine_.AllocateDelayLine(241);
      this.ap4 = this.engine_.AllocateDelayLine(399);
      this.dap1a = this.engine_.AllocateDelayLine(1253);
      this.dap1b = this.engine_.AllocateDelayLine(1738);
      this.del1 = this.engine_.AllocateDelayLine(3411);
      this.dap2a = this.engine_.AllocateDelayLine(1513);
      this.dap2b = this.engine_.AllocateDelayLine(1363);
      this.del2 = this.engine_.AllocateDelayLine(4782);
      this.delayLinesAllocated_ = true;
    }

    const c = new Context();
    const kap = this.diffusion_;

    // Local filter state (updated per frame)
    let lp_1 = this.lp_decay_1_;
    let lp_2 = this.lp_decay_2_;
    let hp_1 = this.hp_decay_1_;
    let hp_2 = this.hp_decay_2_;

    // Set LFO frequency (mod_rate cubed for musical scaling)
    let slope = this.mod_rate_ * this.mod_rate_;
    slope *= slope * slope;
    slope /= 200.0;
    for (let i = 0; i < 9; i++) {
      this.lfo_[i].set_slope(slope);
    }

    // Process each sample
    for (let i = 0; i < frameCount; i++) {
      this.engine_.Start(c);

      // Smooth size parameter to prevent zipper noise in delay lines
      this.smooth_size_ = ONE_POLE_FILTER(this.smooth_size_, this.size_, 0.01);

      // Compute windowing info for pitch shifter (dual-head crossfade)
      // Window size: 128 → 3410 samples based on reverb size
      let ps_size = 128.0 + (3410.0 - 128.0) * this.smooth_size_;
      this.phase_ += (1.0 - this.ratio_) / ps_size;
      if (this.phase_ >= 1.0) this.phase_ -= 1.0;
      if (this.phase_ <= 0.0) this.phase_ += 1.0;

      // Triangular window for crossfade (raised cosine interpolated)
      let tri = 2.0 * (this.phase_ >= 0.5 ? 1.0 - this.phase_ : this.phase_);
      tri = Interpolate(LUT_WINDOW, tri, LUT_WINDOW_SIZE - 1);

      // Dual read heads (180° phase offset)
      let phase = this.phase_ * ps_size;
      let half = phase + ps_size * 0.5;
      if (half >= ps_size) half -= ps_size;

      // Helper: Interpolate delay line with LFO modulation
      const INTERPOLATE_LFO = (del, lfo_idx, gain) => {
        let offset = (del.length - 1) * this.smooth_size_;
        offset += this.lfo_[lfo_idx].Next() * this.mod_amount_;
        offset = Math.max(1.0, Math.min(offset, del.length - 1));
        c.InterpolateHermite(del, offset, gain);
      };

      // Helper: Interpolate delay line without LFO
      const INTERPOLATE = (del, gain) => {
        let offset = (del.length - 1) * this.smooth_size_;
        offset = Math.max(1.0, Math.min(offset, del.length - 1));
        c.InterpolateHermite(del, offset, gain);
      };

      // Smear AP1 inside the loop (additional modulation for texture)
      c.Interpolate(this.ap1, 10.0, this.lfo_[0].Next(), 60.0, 1.0);
      c.Write(this.ap1, 100, 0.0);

      // Input: Mono sum (L+R) with gain
      c.Read(inputL[i] + inputR[i], this.input_gain_);

      // Diffuse through 4 input allpasses
      INTERPOLATE_LFO(this.ap1, 1, kap);
      c.WriteAllPass(this.ap1, -kap);
      INTERPOLATE_LFO(this.ap2, 2, kap);
      c.WriteAllPass(this.ap2, -kap);
      INTERPOLATE_LFO(this.ap3, 3, kap);
      c.WriteAllPass(this.ap3, -kap);
      INTERPOLATE_LFO(this.ap4, 4, kap);
      c.WriteAllPass(this.ap4, -kap);

      // Store diffused input (fed to both tanks)
      let apout = c.Write(0.0);

      // ===== LEFT TANK =====
      // Read from right tank delay (cross-coupling)
      INTERPOLATE_LFO(this.del2, 5, this.decay_ * (1.0 - this.pitch_shift_amount_));

      // Blend in pitch-shifted feedback (dual-head window crossfade)
      c.InterpolateHermite(this.del2, phase, tri * this.decay_ * this.pitch_shift_amount_);
      c.InterpolateHermite(this.del2, half, (1.0 - tri) * this.decay_ * this.pitch_shift_amount_);

      // Tone shaping filters
      lp_1 = c.Lp(lp_1, this.lp_);
      hp_1 = c.Hp(hp_1, this.hp_);

      // CRITICAL: Soft limiting prevents feedback explosion!
      c.SoftLimit();

      // Diffusion allpasses
      INTERPOLATE_LFO(this.dap1a, 6, -kap);
      c.WriteAllPass(this.dap1a, kap);
      INTERPOLATE(this.dap1b, kap);
      c.WriteAllPass(this.dap1b, -kap);

      // Write to left tank delay
      c.Write(this.del1, 2.0);

      // Left output (accumulator value)
      outputL[i] = c.accumulator_;

      // ===== RIGHT TANK =====
      // Reload diffused input
      c.Load(apout);

      // Read from left tank delay (cross-coupling)
      INTERPOLATE_LFO(this.del1, 7, this.decay_ * (1.0 - this.pitch_shift_amount_));

      // Blend in pitch-shifted feedback
      c.InterpolateHermite(this.del1, phase, tri * this.decay_ * this.pitch_shift_amount_);
      c.InterpolateHermite(this.del1, half, (1.0 - tri) * this.decay_ * this.pitch_shift_amount_);

      // Tone shaping filters
      lp_2 = c.Lp(lp_2, this.lp_);
      hp_2 = c.Hp(hp_2, this.hp_);

      // CRITICAL: Soft limiting prevents feedback explosion!
      c.SoftLimit();

      // Diffusion allpasses
      INTERPOLATE_LFO(this.dap2a, 8, kap);
      c.WriteAllPass(this.dap2a, -kap);
      INTERPOLATE(this.dap2b, -kap);
      c.WriteAllPass(this.dap2b, kap);

      // Write to right tank delay
      c.Write(this.del2, 2.0);

      // Right output (accumulator value)
      outputR[i] = c.accumulator_;
    }

    // Store filter state for next frame
    this.lp_decay_1_ = lp_1;
    this.lp_decay_2_ = lp_2;
    this.hp_decay_1_ = hp_1;
    this.hp_decay_2_ = hp_2;
  }

  // ===== Parameter Setters (from granular_processor.js mapping) =====

  set_input_gain(input_gain) {
    this.input_gain_ = input_gain;
  }

  set_decay(decay) {
    this.decay_ = decay;
  }

  set_diffusion(diffusion) {
    this.diffusion_ = diffusion;
  }

  set_lp(lp) {
    this.lp_ = lp;
  }

  set_hp(hp) {
    this.hp_ = hp;
  }

  set_size(size) {
    this.size_ = size;
  }

  set_mod_amount(mod_amount) {
    this.mod_amount_ = mod_amount;
  }

  set_mod_rate(mod_rate) {
    this.mod_rate_ = mod_rate;
  }

  set_ratio(ratio) {
    this.ratio_ = ratio;
  }

  set_pitch_shift_amount(pitch_shift_amount) {
    this.pitch_shift_amount_ = pitch_shift_amount;
  }
}
