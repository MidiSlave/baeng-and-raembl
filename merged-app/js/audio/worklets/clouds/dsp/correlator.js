/**
 * Correlator - Waveform Similarity Engine
 *
 * Finds optimal splice points for WSOLA (Waveform Similarity Overlap-Add)
 * time-stretching by maximising waveform similarity.
 *
 * Uses sign-bit correlation (XOR 32 samples at once) for efficiency.
 * Ported from Mutable Instruments Clouds / Gemini implementation.
 *
 * CRITICAL: This is a bit-level correlator, NOT word-level.
 * The offset and candidate values are in BITS, not words.
 *
 * @class Correlator
 */

export class Correlator {
  constructor() {
    // Pre-allocated buffers (set via Init)
    this.source_ = null;      // Uint32Array - source sign bits
    this.destination_ = null; // Uint32Array - destination sign bits

    // Search state
    this.offset_ = 0;         // Starting offset in samples
    this.increment_ = 0;      // Fixed-point increment (16.16)
    this.size_ = 0;           // Search size in samples
    this.candidate_ = 0;      // Current candidate (in bits/samples)
    this.best_score_ = 0;     // Best correlation score
    this.best_match_ = 0;     // Best match position (in bits)
    this.done_ = true;        // Search complete flag
  }

  /**
   * Initialise with pre-allocated buffers
   * @param {Uint32Array} source - Source sign-bit buffer
   * @param {Uint32Array} destination - Destination sign-bit buffer
   */
  Init(source, destination) {
    this.source_ = source;
    this.destination_ = destination;
    this.offset_ = 0;
    this.best_match_ = 0;
    this.done_ = true;
  }

  /**
   * Evaluate next candidate position
   * Uses bit-level alignment for precise correlation
   */
  EvaluateNextCandidate() {
    if (this.done_) {
      return;
    }

    const num_words = this.size_ >> 5;  // size / 32
    const offset_words = this.candidate_ >> 5;  // candidate / 32
    const offset_bits = this.candidate_ & 0x1f; // candidate % 32

    let xcorr = 0;

    for (let i = 0; i < num_words; ++i) {
      const source_bits = this.source_[i];
      let destination_bits = 0;

      const d0 = this.destination_[offset_words + i] || 0;
      const d1 = this.destination_[offset_words + i + 1] || 0;

      if (offset_bits === 0) {
        destination_bits = d0;
      } else {
        // Bit-level alignment: shift d0 left, OR with d1 shifted right
        // This aligns the destination bits with source bits
        destination_bits = (d0 << offset_bits) | (d1 >>> (32 - offset_bits));
      }

      // XOR and count MATCHING bits (NOT XOR = bits that match)
      let count = ~(source_bits ^ destination_bits);

      // Popcount using parallel bit-counting algorithm
      // This is faster than Brian Kernighan's loop for dense bit patterns
      count = count - ((count >>> 1) & 0x55555555);
      count = (count & 0x33333333) + ((count >>> 2) & 0x33333333);
      count = (((count + (count >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;

      xcorr += count;
    }

    if (xcorr > this.best_score_) {
      this.best_match_ = this.candidate_;
      this.best_score_ = xcorr;
    }

    this.candidate_++;
    this.done_ = this.candidate_ >= this.size_;
  }

  /**
   * Start a new correlation search
   * @param {number} size - Search size in samples
   * @param {number} offset - Starting offset for result calculation
   * @param {number} increment - Fixed-point increment for result scaling (16.16 format)
   */
  StartSearch(size, offset, increment) {
    this.offset_ = offset;
    this.increment_ = increment;
    this.best_score_ = 0;
    this.best_match_ = 0;
    this.candidate_ = 0;
    this.size_ = size;
    this.done_ = false;
  }

  /**
   * Get best match position with fixed-point scaling
   * Returns the optimal splice point in samples
   * @returns {number} Best match position
   */
  best_match() {
    // Fixed-point calculation: offset + (best_match * (increment >> 4)) >> 12
    return this.offset_ + ((this.best_match_ * (this.increment_ >> 4)) >> 12);
  }

  /**
   * Evaluate multiple candidates (batch processing)
   * Limits CPU load by processing a fixed number of candidates per call
   */
  EvaluateSomeCandidates() {
    // Process (size/4 + 16) candidates per call
    // This spreads the work across multiple audio frames
    let num_candidates = (this.size_ >> 2) + 16;
    while (num_candidates > 0 && !this.done_) {
      this.EvaluateNextCandidate();
      num_candidates--;
    }
  }

  /**
   * Get source buffer (for external filling)
   * @returns {Uint32Array} Source buffer
   */
  source() {
    return this.source_;
  }

  /**
   * Get destination buffer (for external filling)
   * @returns {Uint32Array} Destination buffer
   */
  destination() {
    return this.destination_;
  }

  /**
   * Get current candidate position
   * @returns {number} Current candidate
   */
  candidate() {
    return this.candidate_;
  }

  /**
   * Check if search is complete
   * @returns {boolean} True if done
   */
  done() {
    return this.done_;
  }

  /**
   * Get best score (for debugging)
   * @returns {number} Best correlation score
   */
  getBestScore() {
    return this.best_score_;
  }
}
