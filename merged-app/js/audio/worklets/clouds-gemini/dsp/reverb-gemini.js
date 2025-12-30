/**
 * GeminiReverb - Griesinger topology reverb
 * Ported from Mutable Instruments Clouds (via Gemini port)
 * ES Module version for AudioWorklet
 *
 * CRITICAL: Added SoftLimit calls to prevent feedback explosion!
 * This was missing in the original Gemini port.
 */

import { FxEngine, Context } from './fx-engine.js?v=2';

/**
 * FloatFrame - Stereo audio frame
 */
export class FloatFrame {
  constructor(l = 0, r = 0) {
    this.l = l;
    this.r = r;
  }
}

/**
 * GeminiReverb - Griesinger parallel-feedback reverberator
 */
export class GeminiReverb {
  constructor() {
    this.engine_ = new FxEngine(16384);
    this.amount_ = 0.0;
    this.input_gain_ = 0.2;
    this.reverb_time_ = 0.7;
    this.diffusion_ = 0.625;
    this.lp_ = 0.7;
    this.lp_decay_1_ = 0.0;
    this.lp_decay_2_ = 0.0;

    // Delay line metadata (base + length)
    // Total: 113+162+241+399+1653+2038+3411+1913+1663+4782 = 16,375 samples
    this.ap1 = { base: 0, length: 113 };
    this.ap2 = { base: 114, length: 162 };
    this.ap3 = { base: 277, length: 241 };
    this.ap4 = { base: 519, length: 399 };
    this.dap1a = { base: 919, length: 1653 };
    this.dap1b = { base: 2573, length: 2038 };
    this.del1 = { base: 4612, length: 3411 };
    this.dap2a = { base: 8024, length: 1913 };
    this.dap2b = { base: 9938, length: 1663 };
    this.del2 = { base: 11602, length: 4782 };

    // Pre-allocated context for processing
    this.context_ = new Context();
  }

  /**
   * Initialise reverb with buffer
   * @param {Float32Array} buffer - Pre-allocated buffer (16384 samples)
   */
  Init(buffer) {
    this.engine_.Init(buffer);
    this.engine_.SetLFOFrequency(0, 0.5 / 32000.0); // LFO_1
    this.engine_.SetLFOFrequency(1, 0.3 / 32000.0); // LFO_2
    this.lp_ = 0.7;
    this.diffusion_ = 0.625;
  }

  /**
   * Process stereo audio through reverb
   * @param {FloatFrame[]} in_out - Array of stereo frames (modified in place)
   * @param {number} size - Number of frames to process
   */
  Process(in_out, size) {
    const c = this.context_;

    const kap = this.diffusion_;
    const klp = this.lp_;
    const krt = this.reverb_time_;
    const amount = this.amount_;
    const gain = this.input_gain_;

    let lp_1 = this.lp_decay_1_;
    let lp_2 = this.lp_decay_2_;

    for (let i = 0; i < size; ++i) {
      let wet;
      let apout = 0.0;
      this.engine_.Start(c);

      // Smear AP1 inside the loop with LFO modulation
      c.Interpolate(this.ap1, 10.0, c.lfo_value_[0], 60.0, 1.0);
      c.Write(this.ap1, 100, 0.0);

      // Read input
      c.Read(in_out[i].l + in_out[i].r, gain);

      // Diffuse through 4 allpasses
      c.Read(this.ap1, -1, kap);
      c.WriteAllPass(this.ap1, -kap);
      c.Read(this.ap2, -1, kap);
      c.WriteAllPass(this.ap2, -kap);
      c.Read(this.ap3, -1, kap);
      c.WriteAllPass(this.ap3, -kap);
      c.Read(this.ap4, -1, kap);
      c.WriteAllPass(this.ap4, -kap);
      wet = c.Write(1.0);
      apout = wet;

      // ===== LEFT TANK =====
      c.Load(apout);
      c.Interpolate(this.del2, 4680.0, c.lfo_value_[1], 100.0, krt);

      // Lowpass filter in feedback path
      lp_1 = c.Lp(lp_1, klp);

      // CRITICAL: SoftLimit to prevent feedback explosion!
      c.SoftLimit();

      // Diffusion allpasses
      c.Read(this.dap1a, -1, -kap);
      c.WriteAllPass(this.dap1a, kap);
      c.Read(this.dap1b, -1, kap);
      c.WriteAllPass(this.dap1b, -kap);
      c.Write(this.del1, 2.0);
      wet = c.Write(0.0);

      in_out[i].l += (wet - in_out[i].l) * amount;

      // ===== RIGHT TANK =====
      c.Load(apout);
      c.Read(this.del1, -1, krt);

      // Lowpass filter in feedback path
      lp_2 = c.Lp(lp_2, klp);

      // CRITICAL: SoftLimit to prevent feedback explosion!
      c.SoftLimit();

      // Diffusion allpasses
      c.Read(this.dap2a, -1, kap);
      c.WriteAllPass(this.dap2a, -kap);
      c.Read(this.dap2b, -1, -kap);
      c.WriteAllPass(this.dap2b, kap);
      c.Write(this.del2, 2.0);
      wet = c.Write(0.0);

      in_out[i].r += (wet - in_out[i].r) * amount;
    }

    this.lp_decay_1_ = lp_1;
    this.lp_decay_2_ = lp_2;
  }

  /**
   * Process single stereo sample (convenience method)
   * @param {number} inputL - Left input
   * @param {number} inputR - Right input
   * @returns {Object} {l, r} output
   */
  processSample(inputL, inputR) {
    // Guard against NaN/Infinity input - prevents feedback explosion
    if (!isFinite(inputL)) inputL = 0;
    if (!isFinite(inputR)) inputR = 0;

    const frame = [new FloatFrame(inputL, inputR)];
    this.Process(frame, 1);

    // Guard output as well
    let outL = frame[0].l;
    let outR = frame[0].r;
    if (!isFinite(outL)) outL = inputL;
    if (!isFinite(outR)) outR = inputR;

    return { l: outL, r: outR };
  }

  // ===== Setters (snake_case - Gemini style) =====

  set_amount(amount) {
    this.amount_ = Math.max(0, Math.min(1, amount));
  }

  set_input_gain(input_gain) {
    this.input_gain_ = Math.max(0, Math.min(1, input_gain));
  }

  set_time(reverb_time) {
    // Clamp to 0.99 max to prevent infinite feedback
    this.reverb_time_ = Math.max(0, Math.min(0.99, reverb_time));
  }

  set_diffusion(diffusion) {
    this.diffusion_ = Math.max(0, Math.min(1, diffusion));
  }

  set_lp(lp) {
    this.lp_ = Math.max(0, Math.min(1, lp));
  }

  // ===== Setters (camelCase - CloudsReverb compatibility) =====

  setAmount(amount) { this.set_amount(amount); }
  setTime(time) { this.set_time(time); }
  setInputGain(gain) { this.set_input_gain(gain); }

  // Direct property for lp (CloudsReverb compatibility)
  get lp() { return this.lp_; }
  set lp(value) { this.set_lp(value); }

  // ===== Getters =====

  get_amount() { return this.amount_; }
  get_time() { return this.reverb_time_; }
  get_diffusion() { return this.diffusion_; }
  get_lp() { return this.lp_; }
  getAmount() { return this.amount_; }
  getTime() { return this.reverb_time_; }

  /**
   * Process single stereo sample (CloudsReverb compatibility)
   * @param {number} inputL - Left input
   * @param {number} inputR - Right input
   * @returns {Object} {l, r} output
   */
  process(inputL, inputR) {
    return this.processSample(inputL, inputR);
  }

  /**
   * Clear reverb state
   */
  clear() {
    this.engine_.Clear();
    this.lp_decay_1_ = 0.0;
    this.lp_decay_2_ = 0.0;
  }
}
