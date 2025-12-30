/**
 * Diffuser - 4-Stage Allpass Network (Stereo)
 *
 * Creates "cloud-like" smearing/blurring of audio texture.
 * Cascades 4 allpass filters per channel with carefully chosen delay sizes.
 *
 * Used as post-processing in Clouds:
 * - Granular mode: TEXTURE > 0.75 → diffusion amount
 * - Other modes: DENSITY → diffusion amount
 *
 * Delay sizes from Mutable Instruments Clouds firmware.
 *
 * @class Diffuser
 */

import { AllPassFilter } from '../core/allpass-filter.js';

export class Diffuser {
  /**
   * Create a diffuser with stereo allpass cascade
   * @param {number} sampleRate - Sample rate (for scaling delay times)
   */
  constructor(sampleRate = 48000) {
    // Scale delay sizes from Clouds' 32kHz to current sample rate
    const scale = sampleRate / 32000.0;

    // Left channel: 4 cascaded allpass filters
    // Delay sizes: 126, 180, 269, 444 samples @ 32kHz
    this.apL1 = new AllPassFilter(Math.floor(126 * scale));
    this.apL2 = new AllPassFilter(Math.floor(180 * scale));
    this.apL3 = new AllPassFilter(Math.floor(269 * scale));
    this.apL4 = new AllPassFilter(Math.floor(444 * scale));

    // Right channel: 4 cascaded allpass filters (different sizes for stereo width)
    // Delay sizes: 151, 205, 245, 405 samples @ 32kHz
    this.apR1 = new AllPassFilter(Math.floor(151 * scale));
    this.apR2 = new AllPassFilter(Math.floor(205 * scale));
    this.apR3 = new AllPassFilter(Math.floor(245 * scale));
    this.apR4 = new AllPassFilter(Math.floor(405 * scale));

    // Allpass coefficient (CRITICAL: Must be NEGATIVE for correct topology!)
    // Original Clouds uses -0.625 for negative feedback allpass network
    this.coefficient = -0.625;

    // Diffusion amount (0-1)
    this.amount = 0.0;

  }

  /**
   * Process stereo sample through diffuser
   * @param {number} inputL - Left channel input
   * @param {number} inputR - Right channel input
   * @returns {Object} Processed output {l, r}
   */
  process(inputL, inputR) {
    // Left channel: cascade 4 allpass filters
    let wetL = this.apL1.process(inputL, this.coefficient);
    wetL = this.apL2.process(wetL, this.coefficient);
    wetL = this.apL3.process(wetL, this.coefficient);
    wetL = this.apL4.process(wetL, this.coefficient);

    // Right channel: cascade 4 allpass filters
    let wetR = this.apR1.process(inputR, this.coefficient);
    wetR = this.apR2.process(wetR, this.coefficient);
    wetR = this.apR3.process(wetR, this.coefficient);
    wetR = this.apR4.process(wetR, this.coefficient);

    // Mix dry/wet based on amount
    return {
      l: inputL + this.amount * (wetL - inputL),
      r: inputR + this.amount * (wetR - inputR)
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
   * Set diffusion amount
   * @param {number} amount - Diffusion amount (0-1)
   */
  setAmount(amount) {
    this.amount = Math.max(0, Math.min(1, amount));
  }

  /**
   * Get diffusion amount
   * @returns {number} Current amount (0-1)
   */
  getAmount() {
    return this.amount;
  }

  /**
   * Set allpass coefficient
   * @param {number} coeff - Coefficient (-0.9 to +0.9 typical)
   */
  setCoefficient(coeff) {
    this.coefficient = Math.max(-0.9, Math.min(0.9, coeff));
  }

  /**
   * Clear all allpass filter states
   */
  clear() {
    this.apL1.clear();
    this.apL2.clear();
    this.apL3.clear();
    this.apL4.clear();
    this.apR1.clear();
    this.apR2.clear();
    this.apR3.clear();
    this.apR4.clear();
  }
}
