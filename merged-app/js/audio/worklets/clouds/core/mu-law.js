/**
 * MuLawCodec - ITU-T G.711 µ-law Compression/Decompression
 *
 * Port of Clouds audio_buffer.h quality mode
 *
 * µ-law provides ~38dB SNR with 8-bit samples, giving a
 * characteristic "telephony" warmth and compression character.
 *
 * Features:
 * - Pre-computed encode/decode LUTs for fast processing
 * - 8-bit storage (doubles buffer time vs 16-bit)
 * - Logarithmic quantisation (better dynamic range than linear 8-bit)
 *
 * @class MuLawCodec
 */

export class MuLawCodec {
  constructor() {
    // Pre-compute encode/decode LUTs (256 entries each)
    this.encodeLUT = new Uint8Array(256);
    this.decodeLUT = new Float32Array(256);
    this.generateLUTs();
  }

  /**
   * Generate encode/decode lookup tables
   * Uses ITU-T G.711 µ-law algorithm with µ=255
   */
  generateLUTs() {
    const MU = 255; // Standard µ-law compression factor

    // Build encode LUT (linear -> µ-law)
    for (let i = 0; i < 256; i++) {
      // Convert index to -1..+1 range
      const linear = (i / 127.5) - 1.0;
      const sign = linear < 0 ? 0x80 : 0x00;
      const absLinear = Math.abs(linear);

      // µ-law compression: F(x) = sgn(x) * ln(1 + µ|x|) / ln(1 + µ)
      const compressed = Math.log(1 + MU * absLinear) / Math.log(1 + MU);

      // Quantise to 7 bits (0-127) + sign bit
      const quantised = Math.floor(compressed * 127);
      this.encodeLUT[i] = sign | Math.min(127, quantised);
    }

    // Build decode LUT (µ-law -> linear)
    for (let i = 0; i < 256; i++) {
      const sign = (i & 0x80) ? -1 : 1;
      const magnitude = i & 0x7F;

      // Inverse µ-law: F^-1(y) = sgn(y) * (1/µ) * ((1 + µ)^|y| - 1)
      const normalised = magnitude / 127.0;
      const expanded = (Math.pow(1 + MU, normalised) - 1) / MU;

      this.decodeLUT[i] = sign * expanded;
    }
  }

  /**
   * Compress a linear sample to µ-law
   * @param {number} sample - Linear sample (-1 to +1)
   * @returns {number} µ-law encoded byte (0-255)
   */
  compress(sample) {
    // Clamp input to valid range
    const clamped = Math.max(-1, Math.min(1, sample));

    // Convert -1..+1 to 0..255 index
    const index = Math.floor((clamped + 1.0) * 127.5);
    return this.encodeLUT[Math.max(0, Math.min(255, index))];
  }

  /**
   * Decompress a µ-law byte to linear sample
   * @param {number} byte - µ-law encoded byte (0-255)
   * @returns {number} Linear sample (-1 to +1)
   */
  decompress(byte) {
    return this.decodeLUT[byte & 0xFF];
  }

  /**
   * Compress a block of samples
   * @param {Float32Array} input - Linear samples
   * @param {Uint8Array} output - µ-law encoded bytes
   */
  compressBlock(input, output) {
    const len = Math.min(input.length, output.length);
    for (let i = 0; i < len; i++) {
      output[i] = this.compress(input[i]);
    }
  }

  /**
   * Decompress a block of samples
   * @param {Uint8Array} input - µ-law encoded bytes
   * @param {Float32Array} output - Linear samples
   */
  decompressBlock(input, output) {
    const len = Math.min(input.length, output.length);
    for (let i = 0; i < len; i++) {
      output[i] = this.decompress(input[i]);
    }
  }
}
