/**
 * AllPassFilter - First-order allpass delay
 *
 * Building block for diffusion networks (Diffuser, Reverb).
 * Provides phase rotation without amplitude change.
 *
 * Transfer function: H(z) = (g + z^-N) / (1 + g*z^-N)
 * where N is the delay length and g is the coefficient
 *
 * @class AllPassFilter
 */

export class AllPassFilter {
  /**
   * Create an allpass filter
   * @param {number} size - Delay line size in samples
   */
  constructor(size) {
    this.size = Math.floor(size);
    this.buffer = new Float32Array(this.size);
    this.index = 0;

  }

  /**
   * Process one sample through allpass filter
   * @param {number} input - Input sample
   * @param {number} coefficient - Allpass coefficient (typically -0.7 to +0.7)
   * @returns {number} Output sample
   */
  process(input, coefficient = 0.5) {
    // Read delayed sample from buffer
    const delayed = this.buffer[this.index];

    // Allpass output: delayed - g*input
    const output = delayed - coefficient * input;

    // Write to buffer: input + g*delayed
    this.buffer[this.index] = input + coefficient * delayed;

    // Advance index (circular)
    this.index = (this.index + 1) % this.size;

    return output;
  }

  /**
   * Process with modulated delay (for LFO modulation in reverb)
   * @param {number} input - Input sample
   * @param {number} coefficient - Allpass coefficient
   * @param {number} modulation - Delay modulation in samples (0-10 typical)
   * @returns {number} Output sample
   */
  processModulated(input, coefficient, modulation) {
    // Calculate modulated read position
    const readPos = (this.index - modulation + this.size) % this.size;
    const readIdx = Math.floor(readPos);
    const readFrac = readPos - readIdx;

    // Linear interpolation between samples
    const s1 = this.buffer[readIdx];
    const s2 = this.buffer[(readIdx + 1) % this.size];
    const delayed = s1 + (s2 - s1) * readFrac;

    // Allpass output
    const output = delayed - coefficient * input;

    // Write to buffer
    this.buffer[this.index] = input + coefficient * delayed;

    // Advance index
    this.index = (this.index + 1) % this.size;

    return output;
  }

  /**
   * Clear buffer (zero out)
   */
  clear() {
    this.buffer.fill(0);
    this.index = 0;
  }

  /**
   * Get delay line size
   * @returns {number} Size in samples
   */
  getSize() {
    return this.size;
  }

  /**
   * Resize delay line (clears buffer)
   * @param {number} newSize - New size in samples
   */
  resize(newSize) {
    this.size = Math.floor(newSize);
    this.buffer = new Float32Array(this.size);
    this.index = 0;
  }
}
