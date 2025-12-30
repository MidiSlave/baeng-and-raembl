/**
 * CircularBuffer - Power-of-2 circular buffer with freeze support
 *
 * Used by all Clouds playback modes for audio buffering.
 * Power-of-2 sizing enables fast modulo via bitwise AND.
 *
 * Quality Modes (from C++ audio_buffer.h):
 * - 'float32': Full precision (4 bytes/sample) - default
 * - 'int16': 16-bit precision (2 bytes/sample) - same quality, half memory
 * - 'int8': 8-bit precision (1 byte/sample) - lo-fi character, 4x buffer time
 * - 'mulaw': µ-law compressed (1 byte/sample) - telephony warmth, 4x buffer time
 *
 * @class CircularBuffer
 */

import { MuLawCodec } from './mu-law.js';

export class CircularBuffer {
  /**
   * Create a circular buffer
   * @param {number} sizeInSamples - Desired buffer size (will be rounded to power-of-2)
   * @param {number} numChannels - Number of channels (1=mono, 2=stereo)
   * @param {string} quality - Quality mode: 'float32', 'int16', 'int8', 'mulaw'
   */
  constructor(sizeInSamples, numChannels = 2, quality = 'float32') {
    // Round up to next power-of-2 for fast modulo (bitwise AND)
    this.size = this.nextPowerOfTwo(sizeInSamples);
    this.mask = this.size - 1; // For fast modulo: idx & mask === idx % size
    this.numChannels = numChannels;
    this.quality = quality;

    // µ-law codec (only instantiate if needed)
    this.muLaw = (quality === 'mulaw') ? new MuLawCodec() : null;

    // Allocate channel buffers based on quality mode
    this.channels = [];
    for (let i = 0; i < numChannels; i++) {
      this.channels.push(this.allocateBuffer(this.size, quality));
    }

    this.writeHead = 0;
    this.frozen = false;

    const bytesPerSample = this.getBytesPerSample();
    const memoryUsage = (this.size * numChannels * bytesPerSample / 1024 / 1024).toFixed(2);
  }

  /**
   * Allocate buffer based on quality mode
   * @param {number} size - Buffer size in samples
   * @param {string} quality - Quality mode
   * @returns {TypedArray} Allocated buffer
   */
  allocateBuffer(size, quality) {
    switch (quality) {
      case 'int16':
        return new Int16Array(size);
      case 'int8':
        return new Int8Array(size);
      case 'mulaw':
        return new Uint8Array(size);
      case 'float32':
      default:
        return new Float32Array(size);
    }
  }

  /**
   * Get bytes per sample for current quality mode
   * @returns {number} Bytes per sample
   */
  getBytesPerSample() {
    switch (this.quality) {
      case 'int16': return 2;
      case 'int8': return 1;
      case 'mulaw': return 1;
      case 'float32':
      default: return 4;
    }
  }

  /**
   * Encode a linear sample to storage format
   * @param {number} sample - Linear sample (-1 to +1)
   * @returns {number} Encoded sample
   */
  encode(sample) {
    switch (this.quality) {
      case 'int16':
        return Math.floor(Math.max(-1, Math.min(1, sample)) * 32767);
      case 'int8':
        return Math.floor(Math.max(-1, Math.min(1, sample)) * 127);
      case 'mulaw':
        return this.muLaw.compress(sample);
      case 'float32':
      default:
        return sample;
    }
  }

  /**
   * Decode a stored sample to linear format
   * @param {number} encoded - Encoded sample
   * @returns {number} Linear sample (-1 to +1)
   */
  decode(encoded) {
    switch (this.quality) {
      case 'int16':
        return encoded / 32767;
      case 'int8':
        return encoded / 127;
      case 'mulaw':
        return this.muLaw.decompress(encoded);
      case 'float32':
      default:
        return encoded;
    }
  }

  /**
   * Get current quality mode
   * @returns {string} Quality mode
   */
  getQuality() {
    return this.quality;
  }

  /**
   * Change quality mode (will clear buffer!)
   * @param {string} newQuality - New quality mode: 'float32', 'int16', 'int8', 'mulaw'
   */
  setQuality(newQuality) {
    if (newQuality === this.quality) return;

    const validModes = ['float32', 'int16', 'int8', 'mulaw'];
    if (!validModes.includes(newQuality)) {
      console.warn(`[CircularBuffer] Invalid quality mode: ${newQuality}, keeping ${this.quality}`);
      return;
    }


    this.quality = newQuality;
    this.muLaw = (newQuality === 'mulaw') ? new MuLawCodec() : null;

    // Reallocate channel buffers
    this.channels = [];
    for (let i = 0; i < this.numChannels; i++) {
      this.channels.push(this.allocateBuffer(this.size, newQuality));
    }

    // Reset write head
    this.writeHead = 0;

    const bytesPerSample = this.getBytesPerSample();
    const memoryUsage = (this.size * this.numChannels * bytesPerSample / 1024 / 1024).toFixed(2);
  }

  /**
   * Round up to next power of 2
   * @param {number} n - Input number
   * @returns {number} Next power of 2
   */
  nextPowerOfTwo(n) {
    let p = 1;
    while (p < n) {
      p <<= 1;
    }
    return p;
  }

  /**
   * Write samples to buffer (respects freeze state)
   * @param {Float32Array[]} samples - Array of channel samples
   * @param {boolean} freeze - Freeze flag (if true, skip write)
   */
  write(samples, freeze = this.frozen) {
    if (freeze) return; // Frozen: skip write

    for (let ch = 0; ch < this.numChannels; ch++) {
      if (samples[ch] !== undefined) {
        this.channels[ch][this.writeHead] = this.encode(samples[ch]);
      }
    }

    this.writeHead = (this.writeHead + 1) & this.mask; // Fast modulo
  }

  /**
   * Write a single sample (all channels) to buffer
   * @param {number} sampleL - Left channel sample
   * @param {number} sampleR - Right channel sample (optional)
   */
  writeSample(sampleL, sampleR = sampleL) {
    if (this.frozen) return;

    this.channels[0][this.writeHead] = this.encode(sampleL);
    if (this.numChannels > 1) {
      this.channels[1][this.writeHead] = this.encode(sampleR || sampleL);
    }

    this.writeHead = (this.writeHead + 1) & this.mask;
  }

  /**
   * Read sample at integer position (no interpolation)
   * @param {number} position - Sample position (will be wrapped via modulo)
   * @param {number} channel - Channel index
   * @returns {number} Sample value
   */
  read(position, channel = 0) {
    const idx = Math.floor(position) & this.mask;
    return this.decode(this.channels[channel][idx]);
  }

  /**
   * Read sample with linear interpolation
   * @param {number} position - Fractional sample position
   * @param {number} channel - Channel index
   * @returns {number} Interpolated sample value
   */
  readInterpolated(position, channel = 0) {
    const pos = position & this.mask; // Wrap position
    const idx_int = Math.floor(pos);
    const idx_frac = pos - idx_int;

    const s1 = this.decode(this.channels[channel][idx_int & this.mask]);
    const s2 = this.decode(this.channels[channel][(idx_int + 1) & this.mask]);

    // Linear interpolation: s1 + (s2 - s1) * frac
    return s1 + (s2 - s1) * idx_frac;
  }

  /**
   * Read sample with zero-order hold (nearest sample)
   * Produces aliased, crunchy, lo-fi character
   * @param {number} position - Fractional sample position
   * @param {number} channel - Channel index
   * @returns {number} Nearest sample value
   */
  readZOH(position, channel = 0) {
    const idx = Math.round(position) & this.mask;
    return this.decode(this.channels[channel][idx]);
  }

  /**
   * Read sample with 4-point Hermite cubic interpolation
   * Produces smooth, anti-aliased output (highest quality)
   * @param {number} position - Fractional sample position
   * @param {number} channel - Channel index
   * @returns {number} Hermite interpolated sample value
   */
  readHermite(position, channel = 0) {
    const idx = Math.floor(position) & this.mask;
    const frac = position - Math.floor(position);

    // Get 4 samples: y[-1], y[0], y[1], y[2] - decode each from storage format
    const y0 = this.decode(this.channels[channel][(idx - 1 + this.size) & this.mask]);
    const y1 = this.decode(this.channels[channel][idx]);
    const y2 = this.decode(this.channels[channel][(idx + 1) & this.mask]);
    const y3 = this.decode(this.channels[channel][(idx + 2) & this.mask]);

    // Hermite cubic interpolation coefficients
    const c0 = y1;
    const c1 = 0.5 * (y2 - y0);
    const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);

    // Evaluate polynomial: ((c3*frac + c2)*frac + c1)*frac + c0
    return ((c3 * frac + c2) * frac + c1) * frac + c0;
  }

  /**
   * Read sample relative to write head
   * @param {number} samplesBack - How many samples back from write head (positive number)
   * @param {number} channel - Channel index
   * @returns {number} Sample value
   */
  readRelative(samplesBack, channel = 0) {
    const position = this.writeHead - samplesBack;
    return this.readInterpolated(position, channel);
  }

  /**
   * Set freeze state
   * @param {boolean} frozen - Freeze flag
   */
  setFreeze(frozen) {
    this.frozen = frozen;
  }

  /**
   * Get freeze state
   * @returns {boolean} Current freeze state
   */
  isFrozen() {
    return this.frozen;
  }

  /**
   * Clear all buffers (zero out)
   */
  clear() {
    for (let ch = 0; ch < this.numChannels; ch++) {
      this.channels[ch].fill(0);
    }
    this.writeHead = 0;
  }

  /**
   * Get current write head position
   * @returns {number} Write head index
   */
  getWriteHead() {
    return this.writeHead;
  }

  /**
   * Get buffer size
   * @returns {number} Buffer size in samples
   */
  getSize() {
    return this.size;
  }

  /**
   * Get buffer size in seconds
   * @param {number} sampleRate - Sample rate
   * @returns {number} Buffer size in seconds
   */
  getSizeInSeconds(sampleRate) {
    return this.size / sampleRate;
  }
}
