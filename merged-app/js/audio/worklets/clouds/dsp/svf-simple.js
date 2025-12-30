/**
 * SVF - State Variable Filter
 * Ported from Mutable Instruments stmlib
 * ES Module version for AudioWorklet
 *
 * TPT (Topology-Preserving Transform) state variable filter
 * This is the CORRECT implementation matching C++ stmlib/dsp/filter.h
 */

// VERSION IDENTIFIER - Change this to verify code is loading!
const SVF_VERSION = 'v4-NaN-guards-2025-12-08';
console.log(`[SVF] Module loaded: ${SVF_VERSION}`);

/**
 * OnePole - Single-pole lowpass/highpass filter
 */
export class OnePole {
  constructor() {
    this.f_ = 0.0;
    this.out_ = 0.0;
  }

  Init() {
    this.f_ = 0.0;
    this.out_ = 0.0;
  }

  set_f(f) {
    this.f_ = f;
  }

  Process(in_value) {
    this.out_ += this.f_ * (in_value - this.out_);
    return this.out_;
  }
}

/**
 * Svf - TPT State Variable Filter
 *
 * Key coefficients:
 * - g_ = tan(π·f) - frequency coefficient
 * - r_ = 1/resonance - damping coefficient
 * - h_ = 1/(1 + r·g + g²) - stability coefficient
 *
 * The h_ coefficient is CRITICAL for stability at high resonance.
 * Without it, the filter state explodes before output limiting can help.
 */
export class Svf {
  constructor() {
    this.g_ = 0;      // tan(π·f) - frequency coefficient
    this.r_ = 0;      // 1/resonance - damping coefficient
    this.h_ = 0;      // 1/(1 + r·g + g²) - stability coefficient
    this.state_1_ = 0;
    this.state_2_ = 0;
  }

  Init() {
    this.state_1_ = 0;
    this.state_2_ = 0;
  }

  /**
   * Set frequency and Q using FREQUENCY_FAST approximation
   * Matches C++ set_f_q<FREQUENCY_FAST>(f, resonance)
   *
   * @param {number} f - Normalised frequency (0-1, where 1 = Nyquist)
   * @param {number} resonance - Q factor (higher = more resonant)
   */
  set_f_q(f, resonance) {
    // FREQUENCY_FAST tan approximation from C++
    // Optimised for 16Hz-16kHz at 48kHz sample rate
    // const a = 3.260e-01 * PI³
    // const b = 1.823e-01 * PI⁵
    // g = f * (PI + f² * (a + b * f²))
    const PI = Math.PI;
    const PI_POW_3 = PI * PI * PI;
    const PI_POW_5 = PI_POW_3 * PI * PI;
    const a = 3.260e-01 * PI_POW_3;
    const b = 1.823e-01 * PI_POW_5;
    const f2 = f * f;
    this.g_ = f * (PI + f2 * (a + b * f2));

    // r_ = 1/resonance (damping factor)
    this.r_ = 1.0 / resonance;

    // h_ = stability coefficient - THIS IS CRITICAL
    // Without this, the filter explodes at high resonance
    this.h_ = 1.0 / (1.0 + this.r_ * this.g_ + this.g_ * this.g_);

    // DEBUG: Log coefficients once per filter setup
    if (!this._logged) {
      console.log(`[SVF] f=${f.toFixed(6)}, res=${resonance.toFixed(6)}, g_=${this.g_.toFixed(6)}, r_=${this.r_.toFixed(2)}, h_=${this.h_.toFixed(6)}`);
      this._logged = true;
    }
  }

  /**
   * Copy coefficients from another filter
   * @param {Svf} other - Source filter
   */
  set(other) {
    this.g_ = other.g_;
    this.r_ = other.r_;
    this.h_ = other.h_;
  }

  /**
   * Process single sample - TPT SVF state update
   * Matches C++ Process<mode>(float in)
   *
   * @param {number} inSample - Input sample
   * @param {string} mode - Filter mode constant
   * @returns {number} Filtered output
   */
  Process(inSample, mode) {
    // NaN/Infinity guard on input - reset filter if bad input
    if (!isFinite(inSample)) {
      this.state_1_ = 0;
      this.state_2_ = 0;
      return 0;
    }

    // TPT SVF state update equations from C++ stmlib
    // The h_ coefficient provides stability at high resonance
    const hp = (inSample - this.r_ * this.state_1_ - this.g_ * this.state_1_ - this.state_2_) * this.h_;
    const bp = this.g_ * hp + this.state_1_;
    this.state_1_ = this.g_ * hp + bp;
    const lp = this.g_ * bp + this.state_2_;
    this.state_2_ = this.g_ * bp + lp;

    // State explosion guard - if state gets too large, reset
    if (!isFinite(this.state_1_) || !isFinite(this.state_2_) ||
        Math.abs(this.state_1_) > 1e6 || Math.abs(this.state_2_) > 1e6) {
      console.error('[SVF] State explosion! Resetting filter.');
      this.state_1_ = 0;
      this.state_2_ = 0;
      return 0;
    }

    switch (mode) {
      case Svf.FILTER_MODE_LOW_PASS:
        return lp;
      case Svf.FILTER_MODE_BAND_PASS:
        return bp;
      case Svf.FILTER_MODE_BAND_PASS_NORMALIZED:
        // r_ = 1/Q, so this scales bandpass by inverse of resonance
        return bp * this.r_;
      case Svf.FILTER_MODE_HIGH_PASS:
        return hp;
      case Svf.FILTER_MODE_NOTCH:
        return inSample - bp;
      default:
        return lp;
    }
  }
}

// Filter mode constants
Svf.FILTER_MODE_LOW_PASS = 'low_pass';
Svf.FILTER_MODE_HIGH_PASS = 'high_pass';
Svf.FILTER_MODE_BAND_PASS = 'band_pass';
Svf.FILTER_MODE_BAND_PASS_NORMALIZED = 'band_pass_normalized';
Svf.FILTER_MODE_NOTCH = 'notch';
Svf.FREQUENCY_FAST = 0;
Svf.FREQUENCY_ACCURATE = 1;
