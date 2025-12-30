/**
 * RandomOscillator - Smoothed random LFO for modulation
 * Ported from Mutable Instruments Parasites firmware
 * ES Module version for AudioWorklet
 *
 * Used by Oliverb for delay line modulation (9 instances)
 * Produces smoothly interpolated random values using raised cosine curve
 */

import { Interpolate } from '../../clouds-gemini/core/utils.js';
import { LUT_RAISED_COS, LUT_RAISED_COS_SIZE } from './resources.js';

const kOscillationMinimumGap = 0.3;

export class RandomOscillator {
  constructor() {
    this.phase_ = 0.0;
    this.phase_increment_ = 0.0;
    this.value_ = 0.0;
    this.next_value_ = 0.0;
    this.direction_ = false;
  }

  /**
   * Initialise oscillator with random starting point
   */
  Init() {
    this.value_ = 0.0;
    this.next_value_ = Math.random() * 2.0 - 1.0;
    this.phase_ = 0.0;
    this.direction_ = false;
  }

  /**
   * Set the slope (speed) of oscillation
   * Higher slope = faster oscillation
   * @param {number} slope - Oscillation rate
   */
  set_slope(slope) {
    this.phase_increment_ = 1.0 / Math.abs(this.next_value_ - this.value_) * slope;
    if (this.phase_increment_ > 1.0) {
      this.phase_increment_ = 1.0;
    }
  }

  /**
   * Generate next sample
   * Uses raised cosine interpolation for smooth transitions
   * @returns {number} Output value (-1 to +1)
   */
  Next() {
    this.phase_ += this.phase_increment_;

    if (this.phase_ > 1.0) {
      this.phase_ -= 1.0;
      this.value_ = this.next_value_;
      this.direction_ = !this.direction_;

      // Generate next target value with minimum gap
      const rnd = (1.0 - kOscillationMinimumGap) * Math.random() + kOscillationMinimumGap;
      this.next_value_ = this.direction_
        ? this.value_ + (1.0 - this.value_) * rnd
        : this.value_ - (1.0 + this.value_) * rnd;
    }

    // Use raised cosine for smooth interpolation
    const sin = Interpolate(LUT_RAISED_COS, this.phase_, LUT_RAISED_COS_SIZE - 1);
    return this.value_ + (this.next_value_ - this.value_) * sin;
  }
}
