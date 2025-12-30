/**
 * Resonestor - Modal Synthesis Engine (Parasites Mode 5)
 * Ported from Mutable Instruments Clouds Parasites firmware
 * ES Module version for AudioWorklet
 *
 * Architecture:
 * - Dual voice system (ping-pong on trigger)
 * - 4 comb filters per voice tuned to chord intervals
 * - SVF filters for damping (lowpass + bandpass per comb)
 * - Burst noise exciter for plucked sounds
 * - Stereo spread via delayed comb taps
 *
 * Modal synthesis creates bell-like, plucked, and resonant tones
 * by feeding noise/input through a bank of tuned resonators.
 */

import { FxEngine, Context } from '../../clouds-gemini/dsp/fx-engine.js?v=3';
import { SoftLimit, SemitonesToRatio, InterpolatePlateau } from '../../clouds-gemini/core/utils.js';
import { CHORD_TABLES } from './resources.js';
import { Svf, OnePole } from './svf-simple.js?v=4';

// VERSION IDENTIFIER - Change this to verify code is loading!
const RESONESTOR_VERSION = 'v9-input-gain-2025-12-08';
console.log(`[ResonestorEngine] Module loaded: ${RESONESTOR_VERSION}`);

const MAX_COMB = 1000;
const BASE_PITCH = 261.626; // C4 in Hz

/**
 * Resonestor Engine
 * Modal synthesis with comb filter bank and chord tables
 */
export class ResonestorEngine {
  constructor() {
    this.engine_ = new FxEngine(16384); // 16KB delay line buffer

    // Delay lines (allocated in Init)
    this.c00 = null; // Voice 0, comb 0
    this.c10 = null; // Voice 0, comb 1
    this.c20 = null; // Voice 0, comb 2
    this.c30 = null; // Voice 0, comb 3
    this.bc = null;  // Burst comb
    this.bd0 = null; // Burst delay 0 (stereo spread)
    this.bd1 = null; // Burst delay 1 (stereo spread)
    this.c01 = null; // Voice 1, comb 0
    this.c11 = null; // Voice 1, comb 1
    this.c21 = null; // Voice 1, comb 2
    this.c31 = null; // Voice 1, comb 3

    // Per-voice parameters [voice0, voice1]
    this.feedback_ = [0.0, 0.0];
    this.pitch_ = [0.0, 0.0];
    this.chord_ = [0.0, 0.0];
    this.narrow_ = [0.0, 0.0];
    this.damp_ = [0.0, 0.0];
    this.harmonicity_ = [1.0, 1.0];
    this.distortion_ = [0.0, 0.0];

    // Global parameters
    this.spread_amount_ = 0.0;
    this.stereo_ = 0.0;
    this.separation_ = 0.0;
    this.burst_time_ = 0.0;
    this.burst_damp_ = 0.0;
    this.burst_comb_ = 0.0;
    this.burst_duration_ = 0.0;
    this.trigger_ = 0;
    this.previous_trigger_ = 0;
    this.freeze_ = 0;
    this.previous_freeze_ = 0;
    this.voice_ = 0; // Active voice (0 or 1)
    this.input_gain_ = 1.0; // External input level into resonators

    // Stereo spread delays (randomised per trigger)
    this.spread_delay_ = [0.0, 0.0, 0.0];

    // Per-comb, per-voice state [comb][voice]
    this.comb_period_ = Array(4).fill(0).map(() => [0.0, 0.0]);
    this.comb_feedback_ = Array(4).fill(0).map(() => [0.0, 0.0]);
    this.hp_ = Array(4).fill(0).map(() => [0.0, 0.0]);

    // SVF filters [comb][voice]
    this.lp_ = Array(4).fill(0).map(() => [new Svf(), new Svf()]);
    this.bp_ = Array(4).fill(0).map(() => [new Svf(), new Svf()]);

    // Burst noise filters
    this.burst_lp_ = new Svf();
    this.rand_lp_ = new Svf();
    this.rand_hp_ = new OnePole();
  }

  /**
   * Initialise engine with buffer
   * @param {Float32Array} buffer - Pre-allocated delay line buffer
   */
  Init(buffer) {
    this.engine_.Init(buffer);

    // Allocate delay lines from FxEngine buffer
    this.c00 = this.engine_.AllocateDelayLine(MAX_COMB);
    this.c10 = this.engine_.AllocateDelayLine(MAX_COMB);
    this.c20 = this.engine_.AllocateDelayLine(MAX_COMB);
    this.c30 = this.engine_.AllocateDelayLine(MAX_COMB);
    this.bc = this.engine_.AllocateDelayLine(200);
    this.bd0 = this.engine_.AllocateDelayLine(4000);
    this.bd1 = this.engine_.AllocateDelayLine(4000);
    this.c01 = this.engine_.AllocateDelayLine(MAX_COMB);
    this.c11 = this.engine_.AllocateDelayLine(MAX_COMB);
    this.c21 = this.engine_.AllocateDelayLine(MAX_COMB);
    this.c31 = this.engine_.AllocateDelayLine(MAX_COMB);

    // Initialise per-voice parameters
    for (let v = 0; v < 2; v++) {
      this.pitch_[v] = 0.0;
      this.chord_[v] = 0.0;
      this.feedback_[v] = 0.0;
      this.narrow_[v] = 0.001;
      this.damp_[v] = 1.0;
      this.harmonicity_[v] = 1.0;
      this.distortion_[v] = 0.0;
    }

    // Initialise global parameters
    this.spread_amount_ = 0.0;
    this.stereo_ = 0.0;
    this.separation_ = 0.0;
    this.burst_time_ = 0.0;
    this.burst_damp_ = 1.0;
    this.burst_comb_ = 1.0;
    this.burst_duration_ = 0.0;
    this.trigger_ = 0;
    this.previous_trigger_ = 0;
    this.freeze_ = 0;
    this.previous_freeze_ = 0;
    this.voice_ = 0;

    // Randomise spread delays
    for (let i = 0; i < 3; i++) {
      this.spread_delay_[i] = Math.random() * 3999;
    }

    // Initialise filters
    this.burst_lp_.Init();
    this.rand_lp_.Init();
    this.rand_hp_.Init();
    this.rand_hp_.set_f(1.0 / 32000.0);

    for (let v = 0; v < 2; v++) {
      for (let p = 0; p < 4; p++) {
        this.lp_[p][v].Init();
        this.bp_[p][v].Init();
        this.hp_[p][v] = 0.0;
        this.comb_period_[p][v] = 0.0;
        this.comb_feedback_[p][v] = 0.0;
      }
    }
  }

  /**
   * Main processing loop
   * @param {Float32Array} inputL - Left input buffer
   * @param {Float32Array} inputR - Right input buffer
   * @param {Float32Array} outputL - Left output buffer
   * @param {Float32Array} outputR - Right output buffer
   * @param {Object} params - Engine parameters
   */
  process(inputL, inputR, outputL, outputR, params) {
    const size = inputL.length;
    const c = new Context();

    // DEBUG: Log feedback value once
    if (this.feedback_[this.voice_] > 0 && !this._fbLogged) {
      console.log(`[Resonestor] feedback=${this.feedback_[this.voice_].toFixed(4)}, narrow=${this.narrow_[this.voice_].toFixed(6)}`);
      this._fbLogged = true;
    }

    // Voice switching on trigger (when not frozen)
    if (this.trigger_ && !this.previous_trigger_ && !this.freeze_) {
      this.voice_ = this.voice_ === 0 ? 1 : 0;
    }

    // Voice switching on freeze toggle
    if (this.freeze_ && !this.previous_freeze_) {
      this.previous_freeze_ = this.freeze_;
      this.voice_ = this.voice_ === 0 ? 1 : 0;
    }

    // Set comb filter pitches (root note from pitch parameter)
    this.comb_period_[0][this.voice_] = 32000.0 / BASE_PITCH / SemitonesToRatio(this.pitch_[this.voice_]);
    this.comb_period_[0][this.voice_] = Math.max(0, Math.min(this.comb_period_[0][this.voice_], MAX_COMB));

    // Set remaining comb pitches from chord tables
    for (let p = 1; p < 4; p++) {
      let pitch = InterpolatePlateau(CHORD_TABLES[p - 1], this.chord_[this.voice_], 16);
      this.comb_period_[p][this.voice_] = this.comb_period_[0][this.voice_] / SemitonesToRatio(pitch);
      this.comb_period_[p][this.voice_] = Math.max(0, Math.min(this.comb_period_[p][this.voice_], MAX_COMB));
    }

    // Configure LP/BP filters and feedback per comb
    for (let p = 0; p < 4; p++) {
      let freq = 1.0 / this.comb_period_[p][this.voice_];
      this.bp_[p][this.voice_].set_f_q(freq, this.narrow_[this.voice_]);
      let lp_freq = (2.0 * freq + 1.0) * this.damp_[this.voice_];
      lp_freq = Math.max(0.0, Math.min(lp_freq, 1.0));
      this.lp_[p][this.voice_].set_f_q(lp_freq, 0.4);

      // Feedback coefficient: pow(feedback, period/32000) gives per-sample decay
      // C++ does NOT clamp - relies on SoftLimit + BP_NORMALIZED filter dynamics
      // With SVF BAND_PASS_NORMALIZED now correctly implemented, natural decay should work
      this.comb_feedback_[p][this.voice_] = Math.pow(
        this.feedback_[this.voice_],
        this.comb_period_[p][this.voice_] / 32000.0
      );
    }

    // Initiate burst on trigger
    if (this.trigger_ && !this.previous_trigger_) {
      this.previous_trigger_ = this.trigger_;
      this.burst_time_ = this.comb_period_[0][this.voice_];
      this.burst_time_ *= 2.0 * this.burst_duration_;

      // Randomise spread delays on each trigger
      for (let i = 0; i < 3; i++) {
        this.spread_delay_[i] = Math.random() * (this.bd0.length - 1);
      }
    }

    // Configure random noise lowpass for distortion
    this.rand_lp_.set_f_q(this.distortion_[this.voice_] * 0.4, 1.0);

    // Process each sample
    for (let i = 0; i < size; i++) {
      this.engine_.Start(c);

      // Burst envelope countdown
      this.burst_time_--;
      let burst_gain = this.burst_time_ > 0.0 ? 1.0 : 0.0;

      // Generate random noise sample
      let random_sample = Math.random() * 2.0 - 1.0;

      // Burst noise generation (comb-filtered white noise)
      c.Read(random_sample, burst_gain);
      const comb_fb = 0.6 - this.burst_comb_ * 0.4;
      let comb_del = this.burst_comb_ * this.bc.length;
      if (comb_del <= 1.0) comb_del = 1.0;
      c.InterpolateHermite(this.bc, comb_del, comb_fb);
      c.Write(this.bc, 1.0);
      let burst_val = c.Read();
      burst_val = this.burst_lp_.Process(burst_val, Svf.FILTER_MODE_LOW_PASS);
      c.Load(burst_val);
      let burst_output = c.Read();

      // Write burst to stereo delay lines with input mix
      // input_gain_ controls how much of the external input goes into the resonators
      // This allows dry/wet to work properly (at 100% wet, input_gain_ can be reduced)
      c.Load(burst_output);
      c.Read(inputL[i], this.input_gain_);
      c.Write(this.bd0, 0.0);

      // DEBUG: Log first non-zero input
      if (Math.abs(inputL[i]) > 0.01 && !this._inputLogged) {
        console.log(`[Resonestor] First input: inputL=${inputL[i].toFixed(6)}, burst_output=${burst_output.toFixed(6)}, input_gain=${this.input_gain_.toFixed(2)}`);
        this._inputLogged = true;
      }

      c.Load(burst_output);
      c.Read(inputR[i], this.input_gain_);
      c.Write(this.bd1, 0.0);

      // Prepare random sample for comb modulation
      let amplitude = this.distortion_[this.voice_];
      amplitude = 1.0 - amplitude;
      amplitude *= 0.3;
      amplitude *= amplitude;
      random_sample *= amplitude;
      random_sample = this.rand_lp_.Process(random_sample, Svf.FILTER_MODE_LOW_PASS);
      random_sample = this.rand_hp_.Process(random_sample);

      // COMB macro - processes one comb filter
      const COMB = (pre, part, voice, vol) => {
        c.Load(0.0);
        const bd_delay_line = (voice === 0) ? this.bd0 : this.bd1;
        c.Read(bd_delay_line, pre * this.spread_amount_, vol);

        // Select comb delay line
        let comb_delay_line;
        if (part === 0 && voice === 0) comb_delay_line = this.c00;
        else if (part === 1 && voice === 0) comb_delay_line = this.c10;
        else if (part === 2 && voice === 0) comb_delay_line = this.c20;
        else if (part === 3 && voice === 0) comb_delay_line = this.c30;
        else if (part === 0 && voice === 1) comb_delay_line = this.c01;
        else if (part === 1 && voice === 1) comb_delay_line = this.c11;
        else if (part === 2 && voice === 1) comb_delay_line = this.c21;
        else if (part === 3 && voice === 1) comb_delay_line = this.c31;

        // Read from comb with random modulation (detuning)
        let tap = this.comb_period_[part][voice] * (1.0 + random_sample);
        c.InterpolateHermite(comb_delay_line, tap, this.comb_feedback_[part][voice] * 0.7);
        c.InterpolateHermite(comb_delay_line, tap * this.harmonicity_[voice], this.comb_feedback_[part][voice] * 0.3);

        let acc = c.Read();
        const acc_after_comb = acc;  // DEBUG
        // Apply LP and BP damping filters
        acc = this.lp_[part][voice].Process(acc, Svf.FILTER_MODE_LOW_PASS);
        const acc_after_lp = acc;  // DEBUG
        acc = this.bp_[part][voice].Process(acc, Svf.FILTER_MODE_BAND_PASS_NORMALIZED);
        const acc_after_bp = acc;  // DEBUG
        c.Load(acc);

        // High-pass filter (DC blocking)
        this.hp_[part][voice] = c.Hp(this.hp_[part][voice], 10.0 / 32000.0);

        // CRITICAL: SoftLimit in feedback path prevents runaway!
        // Original C++ stores accumulator to acc variable, then scales - JS doesn't have that
        // So we manually scale, limit, then scale back
        acc = c.Read() * 0.5;  // Read current accumulator, scale by 0.5
        const acc_before_limit = acc;  // DEBUG
        c.Load(SoftLimit(acc));  // Apply soft limit and load back
        acc = c.Read() * 2.0;  // Scale by 2.0
        const acc_after_limit = acc;  // DEBUG
        c.Load(acc);  // Load the result back
        c.Write(comb_delay_line, 0.0);  // Write to delay line

        // DEBUG: Log explosion detection
        if (!isFinite(acc) || Math.abs(acc) > 10) {
          if (!this._explosionLogged) {
            console.error(`[COMB] EXPLOSION at part=${part} voice=${voice}: comb=${acc_after_comb.toFixed(4)}, lp=${acc_after_lp.toFixed(4)}, bp=${acc_after_bp.toFixed(4)}, before_limit=${acc_before_limit.toFixed(4)}, after_limit=${acc_after_limit.toFixed(4)}`);
            console.error(`[COMB] bp filter: g_=${this.bp_[part][voice].g_?.toFixed(6)}, r_=${this.bp_[part][voice].r_?.toFixed(2)}, h_=${this.bp_[part][voice].h_?.toFixed(6)}`);
            this._explosionLogged = true;
          }
        }
      };

      // Process all 8 comb filters (4 per voice)
      // Voice 0
      COMB(0, 0, 0, (this.voice_ === 0) ? 1.0 : 0.0);
      COMB(this.spread_delay_[0], 1, 0, (this.voice_ === 0) ? 1.0 : 0.0);
      COMB(this.spread_delay_[1], 2, 0, (this.voice_ === 0) ? 1.0 : 0.0);
      COMB(this.spread_delay_[2], 3, 0, (this.voice_ === 0) ? 1.0 : 0.0);

      // Voice 1
      COMB(0, 0, 1, (this.voice_ === 1) ? 1.0 : 0.0);
      COMB(this.spread_delay_[0], 1, 1, (this.voice_ === 1) ? 1.0 : 0.0);
      COMB(this.spread_delay_[1], 2, 1, (this.voice_ === 1) ? 1.0 : 0.0);
      COMB(this.spread_delay_[2], 3, 1, (this.voice_ === 1) ? 1.0 : 0.0);

      // Mix left channel (with stereo spread)
      c.Load(0.0); // Reset accumulator for L channel
      c.Read(this.c00, (1.0 + 0.5 * this.narrow_[0]) * 0.25 * (1.0 - this.stereo_) * (1.0 - this.separation_));
      c.Read(this.c10, (1.0 + 0.5 * this.narrow_[0]) * (0.25 + 0.25 * this.stereo_) * (1.0 - this.separation_));
      c.Read(this.c20, (1.0 + 0.5 * this.narrow_[0]) * (0.25 * (1.0 - this.stereo_)) * (1.0 - this.separation_));
      c.Read(this.c30, (1.0 + 0.5 * this.narrow_[0]) * (0.25 + 0.25 * this.stereo_) * (1.0 - this.separation_));
      c.Read(this.c01, (1.0 + 0.5 * this.narrow_[1]) * (0.25 + 0.25 * this.stereo_));
      c.Read(this.c11, (1.0 + 0.5 * this.narrow_[1]) * 0.25 * (1.0 - this.stereo_));
      c.Read(this.c21, (1.0 + 0.5 * this.narrow_[1]) * (0.25 + 0.25 * this.stereo_));
      c.Read(this.c31, (1.0 + 0.5 * this.narrow_[1]) * 0.25 * (1.0 - this.stereo_));
      const rawL = c.Read();
      outputL[i] = SoftLimit(rawL);

      // DEBUG: Log first non-zero output
      if (Math.abs(rawL) > 0.001 && !this._outputLogged) {
        console.log(`[Resonestor] First output: rawL=${rawL.toFixed(6)}, voice=${this.voice_}, burst_time=${this.burst_time_.toFixed(0)}`);
        this._outputLogged = true;
      }

      // DEBUG: Detect explosion source
      if ((Math.abs(rawL) > 2 || !isFinite(rawL)) && !this._outputExplosion) {
        console.error(`[Resonestor] OUTPUT EXPLOSION L: raw=${rawL}, i=${i}`);
        this._outputExplosion = true;
      }
      // NaN/Infinity guard - if something goes wrong, output silence rather than crash
      if (!isFinite(outputL[i])) outputL[i] = 0.0;
      // Hard clamp as last resort
      outputL[i] = Math.max(-1.0, Math.min(1.0, outputL[i]));

      // Mix right channel (with stereo spread)
      c.Load(0.0); // Reset accumulator for R channel
      c.Read(this.c00, (1.0 + 0.5 * this.narrow_[0]) * (0.25 + 0.25 * this.stereo_));
      c.Read(this.c10, (1.0 + 0.5 * this.narrow_[0]) * 0.25 * (1.0 - this.stereo_));
      c.Read(this.c20, (1.0 + 0.5 * this.narrow_[0]) * (0.25 + 0.25 * this.stereo_));
      c.Read(this.c30, (1.0 + 0.5 * this.narrow_[0]) * 0.25 * (1.0 - this.stereo_));
      c.Read(this.c01, (1.0 + 0.5 * this.narrow_[1]) * 0.25 * (1.0 - this.stereo_) * (1.0 - this.separation_));
      c.Read(this.c11, (1.0 + 0.5 * this.narrow_[1]) * (0.25 + 0.25 * this.stereo_) * (1.0 - this.separation_));
      c.Read(this.c21, (1.0 + 0.5 * this.narrow_[1]) * 0.25 * (1.0 - this.stereo_) * (1.0 - this.separation_));
      c.Read(this.c31, (1.0 + 0.5 * this.narrow_[1]) * (0.25 + 0.25 * this.stereo_) * (1.0 - this.separation_));
      const rawR = c.Read();
      outputR[i] = SoftLimit(rawR);
      // NaN/Infinity guard
      if (!isFinite(outputR[i])) outputR[i] = 0.0;
      // Hard clamp as last resort
      outputR[i] = Math.max(-1.0, Math.min(1.0, outputR[i]));
    }

    // Update trigger state
    this.previous_trigger_ = this.trigger_;
    this.previous_freeze_ = this.freeze_;
  }

  // ===== Parameter Setters =====

  set_pitch(pitch) {
    this.pitch_[this.voice_] = pitch;
  }

  set_chord(chord) {
    this.chord_[this.voice_] = chord;
  }

  set_feedback(feedback) {
    this.feedback_[this.voice_] = feedback;
  }

  set_narrow(narrow) {
    this.narrow_[this.voice_] = narrow;
  }

  set_damp(damp) {
    this.damp_[this.voice_] = damp;
  }

  set_distortion(distortion) {
    distortion *= distortion * distortion;
    this.distortion_[this.voice_] = distortion;
  }

  set_trigger(trigger) {
    this.previous_trigger_ = this.trigger_;
    this.trigger_ = trigger ? 1 : 0;
  }

  set_burst_damp(burst_damp) {
    this.burst_lp_.set_f_q(burst_damp * burst_damp * 0.5, 0.8);
  }

  set_burst_comb(burst_comb) {
    this.burst_comb_ = burst_comb;
  }

  set_burst_duration(burst_duration) {
    this.burst_duration_ = burst_duration;
  }

  set_spread_amount(spread_amount) {
    this.spread_amount_ = spread_amount;
  }

  set_stereo(stereo) {
    this.stereo_ = stereo;
  }

  set_separation(separation) {
    this.separation_ = separation;
  }

  set_freeze(freeze) {
    this.previous_freeze_ = this.freeze_;
    this.freeze_ = freeze ? 1 : 0;
  }

  set_harmonicity(harmonicity) {
    this.harmonicity_[this.voice_] = harmonicity;
  }

  set_input_gain(input_gain) {
    this.input_gain_ = input_gain;
  }
}
