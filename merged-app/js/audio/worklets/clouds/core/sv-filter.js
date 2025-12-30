/**
 * SVFilter - State Variable Filter (TPT Topology)
 *
 * Topology-Preserving Transform implementation providing:
 * - Lowpass
 * - Highpass
 * - Bandpass
 * - Notch
 *
 * Used in feedback path and looping delay mode.
 * Based on Vadim Zavalishin's TPT SVF design.
 *
 * @class SVFilter
 */

export class SVFilter {
  /**
   * Create a state variable filter
   */
  constructor() {
    // Integrator states
    this.ic1eq = 0.0; // Integrator 1 state
    this.ic2eq = 0.0; // Integrator 2 state

    // Coefficients (computed from cutoff and resonance)
    this.g = 0.0;  // Cutoff coefficient
    this.k = 0.0;  // Resonance coefficient
    this.a1 = 0.0;
    this.a2 = 0.0;
    this.a3 = 0.0;

    // Current settings
    this.cutoffFreq = 1000.0;
    this.resonance = 0.5;
    this.sampleRate = 48000;

  }

  /**
   * Set filter coefficients from cutoff and resonance
   * @param {number} cutoffHz - Cutoff frequency in Hz
   * @param {number} resonance - Resonance as Q factor (quality), typically 0.5-10
   * @param {number} sampleRate - Sample rate in Hz
   */
  setCoefficients(cutoffHz, resonance, sampleRate) {
    this.cutoffFreq = cutoffHz;
    // FIXED: Resonance represents Q factor, not 0-1 range!
    // Clamp to prevent instability (Q = 0.5 to 20 typical)
    this.resonance = Math.max(0.5, Math.min(20, resonance));
    this.sampleRate = sampleRate;

    // Clamp cutoff to prevent instability near Nyquist
    const maxCutoff = sampleRate * 0.45;
    const clampedCutoff = Math.min(cutoffHz, maxCutoff);

    // TPT (Topology-Preserving Transform) SVF
    // g = tan(π * fc / fs)
    this.g = Math.tan(Math.PI * clampedCutoff / sampleRate);

    // CRITICAL FIX: k = 2 * damping = 2 / Q (not 2 - 2*res!)
    // Original Clouds uses r = 1/Q for damping
    this.k = 2.0 / this.resonance;

    // Pre-compute coefficients for efficiency
    const g_plus_k = this.g * (this.g + this.k);
    this.a1 = 1.0 / (1.0 + g_plus_k);
    this.a2 = this.g * this.a1;
    this.a3 = this.g * this.a2;
  }

  /**
   * Process highpass filter
   * @param {number} input - Input sample
   * @returns {number} Filtered output
   */
  processHighPass(input) {
    const v3 = input - this.ic2eq;
    const v1 = this.a1 * this.ic1eq + this.a2 * v3;
    const v2 = this.ic2eq + this.a2 * this.ic1eq + this.a3 * v3;

    // Update integrator states
    this.ic1eq = 2.0 * v1 - this.ic1eq;
    this.ic2eq = 2.0 * v2 - this.ic2eq;

    // Highpass = input - k*BP - LP
    return input - this.k * v1 - v2;
  }

  /**
   * Process lowpass filter
   * @param {number} input - Input sample
   * @returns {number} Filtered output
   */
  processLowPass(input) {
    const v3 = input - this.ic2eq;
    const v1 = this.a1 * this.ic1eq + this.a2 * v3;
    const v2 = this.ic2eq + this.a2 * this.ic1eq + this.a3 * v3;

    // Update integrator states
    this.ic1eq = 2.0 * v1 - this.ic1eq;
    this.ic2eq = 2.0 * v2 - this.ic2eq;

    // Lowpass = v2
    return v2;
  }

  /**
   * Process bandpass filter
   * @param {number} input - Input sample
   * @returns {number} Filtered output
   */
  processBandPass(input) {
    const v3 = input - this.ic2eq;
    const v1 = this.a1 * this.ic1eq + this.a2 * v3;
    const v2 = this.ic2eq + this.a2 * this.ic1eq + this.a3 * v3;

    // Update integrator states
    this.ic1eq = 2.0 * v1 - this.ic1eq;
    this.ic2eq = 2.0 * v2 - this.ic2eq;

    // Bandpass = v1
    return v1;
  }

  /**
   * Process notch filter
   * @param {number} input - Input sample
   * @returns {number} Filtered output
   */
  processNotch(input) {
    const v3 = input - this.ic2eq;
    const v1 = this.a1 * this.ic1eq + this.a2 * v3;
    const v2 = this.ic2eq + this.a2 * this.ic1eq + this.a3 * v3;

    // Update integrator states
    this.ic1eq = 2.0 * v1 - this.ic1eq;
    this.ic2eq = 2.0 * v2 - this.ic2eq;

    // Notch = input - k*BP
    return input - this.k * v1;
  }

  /**
   * Process all filter outputs simultaneously
   * @param {number} input - Input sample
   * @returns {Object} All filter outputs {lp, hp, bp, notch}
   */
  processAll(input) {
    const v3 = input - this.ic2eq;
    const v1 = this.a1 * this.ic1eq + this.a2 * v3;
    const v2 = this.ic2eq + this.a2 * this.ic1eq + this.a3 * v3;

    // Update integrator states
    this.ic1eq = 2.0 * v1 - this.ic1eq;
    this.ic2eq = 2.0 * v2 - this.ic2eq;

    return {
      lp: v2,
      hp: input - this.k * v1 - v2,
      bp: v1,
      notch: input - this.k * v1
    };
  }

  /**
   * Reset filter state
   */
  reset() {
    this.ic1eq = 0.0;
    this.ic2eq = 0.0;
  }

  /**
   * Get current cutoff frequency
   * @returns {number} Cutoff in Hz
   */
  getCutoff() {
    return this.cutoffFreq;
  }

  /**
   * Get current resonance
   * @returns {number} Resonance (0-1)
   */
  getResonance() {
    return this.resonance;
  }
}
