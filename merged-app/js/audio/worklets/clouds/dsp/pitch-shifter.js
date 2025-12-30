/**
 * PitchShifter - Dual-head granular pitch shifter
 *
 * Uses two crossfading read heads to achieve pitch transposition
 * without changing the duration. This is the pitch shifter used
 * in Clouds' Looping Delay mode.
 *
 * Algorithm:
 * - Two delay lines (left/right) of 2047 samples each
 * - Phase advances based on pitch ratio
 * - Two read heads separated by half window size
 * - Triangular crossfade between heads
 * - Window size controlled by 'size' parameter (128-2047 samples)
 *
 * Based on Mutable Instruments Clouds pitch_shifter.h
 *
 * @class PitchShifter
 */

export class PitchShifter {
  /**
   * Create pitch shifter
   * @param {number} sampleRate - Sample rate (not used, operates at native rate)
   */
  constructor(sampleRate = 48000) {
    // Dual delay lines (2047 samples each, matching C++ Reserve<2047, Reserve<2047>>)
    this.delaySize = 2047;
    this.leftBuffer = new Float32Array(this.delaySize);
    this.rightBuffer = new Float32Array(this.delaySize);
    this.writeIndex = 0;

    // Pitch shifter state
    this.phase = 0.0;        // Phase accumulator (0-1)
    this.ratio = 1.0;        // Pitch ratio (1.0 = no shift)
    this.size = 2047.0;      // Window size (128-2047)

  }

  /**
   * Process stereo sample through pitch shifter
   * @param {number} inputL - Left channel input
   * @param {number} inputR - Right channel input
   * @returns {Object} Pitch-shifted output {l, r}
   */
  process(inputL, inputR) {
    // Write input to delay buffers (C++: c.Read(input, 1.0f); c.Write(left, 0.0f))
    this.leftBuffer[this.writeIndex] = inputL;
    this.rightBuffer[this.writeIndex] = inputR;

    // Advance phase based on pitch ratio (C++ line 68-74)
    // When ratio < 1.0 (pitch down), phase advances faster
    // When ratio > 1.0 (pitch up), phase advances slower
    this.phase += (1.0 - this.ratio) / this.size;

    // Wrap phase to [0, 1] range
    if (this.phase >= 1.0) {
      this.phase -= 1.0;
    }
    if (this.phase <= 0.0) {
      this.phase += 1.0;
    }

    // Create triangular crossfade window (C++ line 75)
    // Triangle goes 0 → 1 → 0 over phase 0 → 0.5 → 1
    const tri = 2.0 * (this.phase >= 0.5 ? 1.0 - this.phase : this.phase);

    // Calculate two read positions separated by half window (C++ lines 76-80)
    const phase1 = this.phase * this.size;           // First read head
    let phase2 = phase1 + this.size * 0.5;           // Second read head (half window ahead)
    if (phase2 >= this.size) {
      phase2 -= this.size;
    }

    // Read from left delay with crossfaded dual heads (C++ lines 84-85)
    const leftOut = this.interpolateRead(this.leftBuffer, phase1) * tri +
                    this.interpolateRead(this.leftBuffer, phase2) * (1.0 - tri);

    // Read from right delay with crossfaded dual heads (C++ lines 90-91)
    const rightOut = this.interpolateRead(this.rightBuffer, phase1) * tri +
                     this.interpolateRead(this.rightBuffer, phase2) * (1.0 - tri);

    // Advance write index
    this.writeIndex = (this.writeIndex + 1) % this.delaySize;

    return {
      l: leftOut,
      r: rightOut
    };
  }

  /**
   * Interpolated read from delay buffer
   * @param {Float32Array} buffer - Delay buffer
   * @param {number} position - Read position (float, for interpolation)
   * @returns {number} Interpolated sample
   */
  interpolateRead(buffer, position) {
    // Calculate read position relative to write index (reading backwards in time)
    // C++ FxEngine::Interpolate reads forward from write_ptr, we read backwards
    const readPos = (this.writeIndex - position + this.delaySize) % this.delaySize;

    const idx1 = Math.floor(readPos);
    const idx2 = (idx1 + 1) % this.delaySize;
    const frac = readPos - idx1;

    // Linear interpolation
    return buffer[idx1] + (buffer[idx2] - buffer[idx1]) * frac;
  }

  /**
   * Process mono sample (duplicated to stereo)
   * @param {number} input - Mono input
   * @returns {Object} Pitch-shifted stereo output {l, r}
   */
  processMono(input) {
    return this.process(input, input);
  }

  /**
   * Set pitch ratio
   * @param {number} ratio - Pitch ratio (0.5 = down octave, 2.0 = up octave)
   */
  setRatio(ratio) {
    this.ratio = Math.max(0.25, Math.min(4.0, ratio)); // Clamp to reasonable range
  }

  /**
   * Set window size (affects grain size and transposition quality)
   * @param {number} size - Size parameter (0-1)
   */
  setSize(size) {
    // C++ line 100: 128 + (2047 - 128) * size^3
    // Cubic mapping for more control at small sizes
    const targetSize = 128.0 + (2047.0 - 128.0) * size * size * size;

    // One-pole smoothing (C++ ONE_POLE macro, coefficient 0.05)
    this.size = this.size + 0.05 * (targetSize - this.size);
  }

  /**
   * Clear delay buffers
   */
  clear() {
    this.leftBuffer.fill(0);
    this.rightBuffer.fill(0);
    this.writeIndex = 0;
    this.phase = 0.0;
  }
}
