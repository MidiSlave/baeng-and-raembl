/**
 * CosineOscillator - LFO generator for modulation effects
 * Ported from Mutable Instruments stmlib
 * ES Module version for AudioWorklet
 */

export class CosineOscillator {
  constructor() {
    this.phase_ = 0.0;
    this.frequency_ = 0.0;
  }

  /**
   * Initialise oscillator with frequency
   * @param {number} frequency - Normalised frequency (cycles per sample)
   */
  Init(frequency) {
    this.phase_ = 0.0;
    this.frequency_ = frequency;
  }

  /**
   * Advance phase and return next sample
   * @returns {number} Cosine value (-1 to +1)
   */
  Next() {
    this.phase_ += this.frequency_;
    if (this.phase_ >= 1.0) this.phase_ -= 1.0;
    return Math.cos(this.phase_ * 2.0 * Math.PI);
  }

  /**
   * Get current value without advancing phase
   * @returns {number} Cosine value (-1 to +1)
   */
  value() {
    return Math.cos(this.phase_ * 2.0 * Math.PI);
  }

  /**
   * Reset phase to zero
   */
  reset() {
    this.phase_ = 0.0;
  }

  /**
   * Set frequency
   * @param {number} frequency - Normalised frequency
   */
  setFrequency(frequency) {
    this.frequency_ = frequency;
  }
}
