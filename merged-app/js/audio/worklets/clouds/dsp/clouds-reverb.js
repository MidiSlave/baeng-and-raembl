/**
 * CloudsReverb - LFO-Modulated Griesinger Reverb
 *
 * Griesinger topology with LFO modulation on delay lines.
 * Creates the signature "shimmer" effect from Clouds.
 *
 * Structure:
 * - Input diffusion (4 allpass filters)
 * - Dual tank (L/R) with diffusion allpass + delay
 * - LFO modulation for shimmer/chorus
 * - One-pole lowpass in feedback
 *
 * Based on Mutable Instruments Clouds reverb implementation.
 *
 * @class CloudsReverb
 */

import { AllPassFilter } from '../core/allpass-filter.js';

export class CloudsReverb {
  /**
   * Create LFO-modulated reverb
   * @param {number} sampleRate - Sample rate
   */
  constructor(sampleRate = 48000) {
    // Scale delay sizes from Clouds' 32kHz to current sample rate
    const scale = sampleRate / 32000.0;
    this.sampleRate = sampleRate;

    // Input diffusion (4 allpass filters)
    // Delay sizes from Clouds: 113, 162, 241, 399 samples @ 32kHz
    this.inputAp1 = new AllPassFilter(Math.floor(113 * scale));
    this.inputAp2 = new AllPassFilter(Math.floor(162 * scale));
    this.inputAp3 = new AllPassFilter(Math.floor(241 * scale));
    this.inputAp4 = new AllPassFilter(Math.floor(399 * scale));

    // Left tank
    // Diffusion allpass: 1653, 2038 samples
    this.dap1a = new AllPassFilter(Math.floor(1653 * scale));
    this.dap1b = new AllPassFilter(Math.floor(2038 * scale));
    // Delay line: 3411 samples
    this.del1_size = Math.floor(3411 * scale);
    this.del1 = new Float32Array(this.del1_size);
    this.del1_idx = 0;

    // Right tank
    // Diffusion allpass: 1913, 1663 samples
    this.dap2a = new AllPassFilter(Math.floor(1913 * scale));
    this.dap2b = new AllPassFilter(Math.floor(1663 * scale));
    // Delay line: 4782 samples
    this.del2_size = Math.floor(4782 * scale);
    this.del2 = new Float32Array(this.del2_size);
    this.del2_idx = 0;

    // LFO for modulation (creates shimmer effect)
    // CRITICAL: Original Clouds multiplies by 32 in SetLFOFrequency()!
    // This creates the correct shimmer rate.
    this.lfo1_phase = 0.0;
    this.lfo1_freq = (0.5 / 32000.0) * 32.0; // 0.5 Hz (with 32x factor from original)
    this.lfo2_phase = 0.0;
    this.lfo2_freq = (0.3 / 32000.0) * 32.0; // 0.3 Hz (with 32x factor from original)

    // One-pole lowpass filter states (in feedback path)
    this.lp1 = 0.0;
    this.lp2 = 0.0;

    // Parameters
    this.amount = 0.5; // Reverb amount (0-1)
    this.time = 0.7;   // Decay time (0-1)
    this.inputGain = 0.2; // Input diffusion gain
    this.lp = 0.7;     // Lowpass coefficient (0-1)

  }

  /**
   * Process stereo sample through reverb
   * @param {number} inputL - Left channel input
   * @param {number} inputR - Right channel input
   * @returns {Object} Processed output {l, r}
   */
  process(inputL, inputR) {
    // Input diffusion (4 cascaded allpass)
    // CRITICAL: Coefficient must be NEGATIVE (-0.625) for anti-resonant diffusion
    // Positive coefficients cause constructive interference → exponential buildup
    // C++ uses fixed input gain (0.2), amount only affects OUTPUT crossfade
    const diffused = (inputL + inputR) * 0.5 * this.inputGain;
    let input = this.inputAp1.process(diffused, -0.625);
    input = this.inputAp2.process(input, -0.625);
    input = this.inputAp3.process(input, -0.625);
    input = this.inputAp4.process(input, -0.625);

    // Update LFOs (sine waves for modulation)
    this.lfo1_phase += this.lfo1_freq;
    this.lfo2_phase += this.lfo2_freq;
    if (this.lfo1_phase > 1.0) this.lfo1_phase -= 1.0;
    if (this.lfo2_phase > 1.0) this.lfo2_phase -= 1.0;

    const lfo1 = Math.sin(2.0 * Math.PI * this.lfo1_phase);
    const lfo2 = Math.sin(2.0 * Math.PI * this.lfo2_phase);

    // Modulation depth (10 samples typical, scaled)
    const mod1 = lfo1 * 10.0 * (this.sampleRate / 32000.0);
    const mod2 = lfo2 * 10.0 * (this.sampleRate / 32000.0);

    // LEFT TANK: Crossfeed from right delay
    // Read del2 with LFO modulation AND time scaling (like C++ krt)
    const del2_readPos = (this.del2_idx - 1.0 + mod2 + this.del2_size) % this.del2_size;
    const del2_idx_int = Math.floor(del2_readPos);
    const del2_frac = del2_readPos - del2_idx_int;
    const del2_s1 = this.del2[del2_idx_int];
    const del2_s2 = this.del2[(del2_idx_int + 1) % this.del2_size];
    const del2_read = (del2_s1 + (del2_s2 - del2_s1) * del2_frac) * this.time; // CRITICAL: time at READ!

    // Accumulator: input + crossfeed
    let acc1 = input + del2_read;

    // One-pole lowpass BEFORE diffusion (like C++ line 112)
    // Coefficient controlled by feedback parameter (0.6 + 0.37 * feedback)
    this.lp1 = this.lp1 + this.lp * (acc1 - this.lp1);
    acc1 = this.lp1;

    // Diffusion allpass cascade
    acc1 = this.dap1a.process(acc1, -0.625);
    acc1 = this.dap1b.process(acc1, 0.625);

    // Write diffuser output to delay line (no scaling at write stage)
    // Feedback loop gain controlled by 'time' parameter at read stage only (like C++ original)
    this.del1[this.del1_idx] = acc1;
    this.del1_idx = (this.del1_idx + 1) % this.del1_size;

    // RIGHT TANK: Crossfeed from left delay
    // Read del1 WITHOUT modulation but WITH time scaling (like C++ krt)
    const del1_readPos = (this.del1_idx - 1.0 + this.del1_size) % this.del1_size;
    const del1_idx_int = Math.floor(del1_readPos);
    const del1_frac = del1_readPos - del1_idx_int;
    const del1_s1 = this.del1[del1_idx_int];
    const del1_s2 = this.del1[(del1_idx_int + 1) % this.del1_size];
    const del1_read = (del1_s1 + (del1_s2 - del1_s1) * del1_frac) * this.time; // CRITICAL: time at READ!

    // Accumulator: input + crossfeed
    let acc2 = input + del1_read;

    // One-pole lowpass BEFORE diffusion
    this.lp2 = this.lp2 + this.lp * (acc2 - this.lp2);
    acc2 = this.lp2;

    // Diffusion allpass cascade
    acc2 = this.dap2a.process(acc2, -0.625);
    acc2 = this.dap2b.process(acc2, 0.625);

    // Write diffuser output to delay line (no scaling at write stage)
    // Feedback loop gain controlled by 'time' parameter at read stage only (like C++ original)
    this.del2[this.del2_idx] = acc2;
    this.del2_idx = (this.del2_idx + 1) % this.del2_size;

    // Tank outputs with 2.0x amplification (matches C++ c.Write(del1, 2.0f) → c.Write(wet, 0.0f))
    // The 2.0x is for output gain, NOT feedback gain (feedback controlled by 'time' at read stage)
    // No crossfeed at output stage - crossfeed happens internally via delay line reads
    const wetL = acc1 * 2.0;
    const wetR = acc2 * 2.0;

    // VERB fader crossfade: engine output (inputL/R) vs tank output (wetL/R)
    // This is NOT redundant with D/W fader - they control different things:
    // - VERB: Controls reverb intensity on the processed signal
    // - D/W: Controls blend of original synth vs Clouds-processed output
    return {
      l: inputL * (1.0 - this.amount) + wetL * this.amount,
      r: inputR * (1.0 - this.amount) + wetR * this.amount
    };
  }

  /**
   * Process mono sample (duplicated to stereo)
   * @param {number} input - Mono input
   * @returns {Object} Processed stereo output {l, r}
   */
  processMono(input) {
    return this.process(input, input);
  }

  /**
   * Set reverb amount (wet/dry mix)
   * @param {number} amount - Amount (0-1)
   */
  setAmount(amount) {
    this.amount = Math.max(0, Math.min(1, amount));
  }

  /**
   * Set decay time
   * @param {number} time - Decay time (0-1)
   */
  setTime(time) {
    this.time = Math.max(0, Math.min(0.99, time)); // Max 0.99 to prevent infinite feedback
  }

  /**
   * Set LFO frequency (for shimmer rate)
   * @param {number} freqHz - Frequency in Hz
   * @param {number} lfoNum - LFO number (1 or 2)
   */
  setLFOFrequency(freqHz, lfoNum = 1) {
    if (lfoNum === 1) {
      this.lfo1_freq = freqHz / this.sampleRate;
    } else {
      this.lfo2_freq = freqHz / this.sampleRate;
    }
  }

  /**
   * Set input diffusion gain
   * @param {number} gain - Input gain (0-1)
   */
  setInputGain(gain) {
    this.inputGain = Math.max(0, Math.min(1, gain));
  }

  /**
   * Clear reverb state (zeros delay lines and filters)
   */
  clear() {
    this.del1.fill(0);
    this.del2.fill(0);
    this.del1_idx = 0;
    this.del2_idx = 0;
    this.lp1 = 0.0;
    this.lp2 = 0.0;
    this.lfo1_phase = 0.0;
    this.lfo2_phase = 0.0;

    this.inputAp1.clear();
    this.inputAp2.clear();
    this.inputAp3.clear();
    this.inputAp4.clear();
    this.dap1a.clear();
    this.dap1b.clear();
    this.dap2a.clear();
    this.dap2b.clear();
  }

  /**
   * Get current reverb amount
   * @returns {number} Amount (0-1)
   */
  getAmount() {
    return this.amount;
  }

  /**
   * Get current decay time
   * @returns {number} Time (0-1)
   */
  getTime() {
    return this.time;
  }
}
