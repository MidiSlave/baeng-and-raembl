/**
 * WindowTable - Pre-computed window functions for grain envelopes
 *
 * Provides Hann, Hamming, and Sine windows with interpolated lookup.
 * Used by grain engine and WSOLA for smooth envelopes.
 *
 * @class WindowTable
 */

export class WindowTable {
  /**
   * Create pre-computed window lookup tables
   * @param {number} size - Table size (default 1024)
   */
  constructor(size = 1024) {
    this.size = size;

    // Allocate tables
    this.hann = new Float32Array(size);
    this.hamming = new Float32Array(size);
    this.sine = new Float32Array(size);
    this.triangle = new Float32Array(size);

    // Pre-compute all windows
    this.computeWindows();

  }

  /**
   * Compute all window functions
   */
  computeWindows() {
    for (let i = 0; i < this.size; i++) {
      const phase = i / (this.size - 1); // 0 to 1

      // Hann window: 0.5 * (1 - cos(2π * phase))
      this.hann[i] = 0.5 * (1.0 - Math.cos(2.0 * Math.PI * phase));

      // Hamming window: 0.54 - 0.46 * cos(2π * phase)
      this.hamming[i] = 0.54 - 0.46 * Math.cos(2.0 * Math.PI * phase);

      // Sine window: sin(π * phase)
      this.sine[i] = Math.sin(Math.PI * phase);

      // Triangle window: 1 - |2 * phase - 1|
      this.triangle[i] = 1.0 - Math.abs(2.0 * phase - 1.0);
    }
  }

  /**
   * Look up window value with linear interpolation
   * @param {Float32Array} table - Window table (hann, hamming, sine, triangle)
   * @param {number} phase - Phase (0-1)
   * @returns {number} Window value
   */
  lookup(table, phase) {
    // Clamp phase to [0, 1]
    phase = Math.max(0, Math.min(1, phase));

    const idx = phase * (this.size - 1);
    const idx_int = Math.floor(idx);
    const idx_frac = idx - idx_int;

    const s1 = table[idx_int];
    const s2 = table[Math.min(idx_int + 1, this.size - 1)];

    // Linear interpolation
    return s1 + (s2 - s1) * idx_frac;
  }

  /**
   * Get Hann window value
   * @param {number} phase - Phase (0-1)
   * @returns {number} Window value
   */
  hann(phase) {
    return this.lookup(this.hann, phase);
  }

  /**
   * Get Hamming window value
   * @param {number} phase - Phase (0-1)
   * @returns {number} Window value
   */
  hamming(phase) {
    return this.lookup(this.hamming, phase);
  }

  /**
   * Get Sine window value
   * @param {number} phase - Phase (0-1)
   * @returns {number} Window value
   */
  sine(phase) {
    return this.lookup(this.sine, phase);
  }

  /**
   * Get Triangle window value
   * @param {number} phase - Phase (0-1)
   * @returns {number} Window value
   */
  triangle(phase) {
    return this.lookup(this.triangle, phase);
  }

  /**
   * Morphable window - blends between triangle and Hann based on smoothness
   * (From Clouds firmware - texture parameter controls envelope shape)
   * @param {number} phase - Phase (0-1)
   * @param {number} smoothness - Smoothness (0-1): 0=triangle, 1=Hann
   * @returns {number} Window value
   */
  morphable(phase, smoothness) {
    const tri = this.lookup(this.triangle, phase);
    const hann = this.lookup(this.hann, phase);

    // Linear blend between triangle and Hann
    return tri + (hann - tri) * smoothness;
  }

  /**
   * Get window table size
   * @returns {number} Table size in samples
   */
  getSize() {
    return this.size;
  }
}
