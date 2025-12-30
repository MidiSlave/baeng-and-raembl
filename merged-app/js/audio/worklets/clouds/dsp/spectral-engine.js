/**
 * Spectral Engine - FFT-Based Phase Vocoder
 *
 * ACCURATE PORT from Mutable Instruments Clouds phase vocoder.
 * Full FFT-based spectral processing with:
 * - Pitch shifting (independent of time)
 * - Spectral warping (formant shift)
 * - Magnitude quantization (frequency snapping)
 * - Phase randomization (shimmer/diffusion)
 * - Glitch algorithms (4 types)
 * - Freeze/spectral texture buffering
 *
 * Based on Clouds dsp/pvoc/*.cc implementation.
 *
 * @class SpectralEngine
 */

import { CircularBuffer } from '../core/circular-buffer.js';
import { PhaseVocoder } from './pvoc/phase-vocoder.js?v=7';
import { LUT_SINE_WINDOW_4096 } from '../resources/sine-window-lut.js';

export class SpectralEngine {
  /**
   * Create spectral engine
   * @param {number} sampleRate - Sample rate
   * @param {number} bufferSize - Buffer size in samples
   */
  constructor(sampleRate = 48000, bufferSize = 262144) {
    this.sampleRate = sampleRate;

    // Circular buffer for spectral material
    this.buffer = new CircularBuffer(bufferSize, 2);

    // Phase vocoder (FFT-based spectral processing)
    this.phaseVocoder = new PhaseVocoder();
    this.phaseVocoder.init(LUT_SINE_WINDOW_4096, 4096, 2, sampleRate);

    // Parameters
    this.position = 0.5;
    this.size = 0.5;          // Not used in spectral mode (always 4096 FFT)
    this.density = 0.5;       // Phase randomization / refresh rate
    this.texture = 0.5;       // Warp amount (formant shift)
    this.pitch = 0.0;         // Pitch shift in semitones
    this.stereoSpread = 0.5;  // Not used in spectral mode
    this.frozen = false;

    // Spectral parameters (mapped from main parameters)
    this.spectralParams = {
      position: 0.5,
      pitch: 0.0,
      freeze: false,
      gate: false, // Glitch trigger
      spectral: {
        refreshRate: 0.0,       // From density (freeze refresh)
        warp: 0.0,              // From texture (formant shift)
        quantization: 0.5,      // From size (frequency quantization)
        phaseRandomization: 0.0 // From density (shimmer)
      }
    };

  }

  /**
   * Set external buffer reference (for shared buffer architecture)
   * @param {CircularBuffer} buffer - Shared circular buffer
   */
  setBuffer(buffer) {
    this.buffer = buffer;
  }

  /**
   * Process audio through spectral engine
   * @param {Float32Array} inputL - Left channel input
   * @param {Float32Array} inputR - Right channel input
   * @param {Float32Array} outputL - Left channel output
   * @param {Float32Array} outputR - Right channel output
   * @param {Object} params - Engine parameters
   */
  process(inputL, inputR, outputL, outputR, params) {
    const frameCount = outputL.length;

    // Update parameters
    this.position = params.position;
    this.size = params.size;
    this.density = params.density;
    this.texture = params.texture;
    this.pitch = params.pitch ?? 0.0;
    this.frozen = params.freeze || false;

    // Map parameters to spectral processing parameters
    this.spectralParams.position = this.position;
    this.spectralParams.pitch = this.pitch;
    this.spectralParams.freeze = this.frozen;
    this.spectralParams.gate = false; // Could be mapped to trigger input

    // DENSITY → Phase randomization + refresh rate
    // Low density: Lower refresh (spectral freeze effect), low randomization
    // High density: Higher refresh (more real-time), higher randomization
    // CRITICAL: refreshRate must be >= 0.5 for textures to fill, otherwise silence!
    // Value 0.5 = gradual fill, 1.0 = instant fill
    if (this.density < 0.5) {
      this.spectralParams.spectral.phaseRandomization = this.density * 2.0;
      // Map 0-0.5 → 0.5-0.7 (always enough refresh to hear something)
      this.spectralParams.spectral.refreshRate = 0.5 + this.density * 0.4;
    } else {
      this.spectralParams.spectral.phaseRandomization = (this.density - 0.5) * 2.0;
      // Map 0.5-1.0 → 0.7-1.0 (higher refresh for more real-time)
      this.spectralParams.spectral.refreshRate = 0.7 + (this.density - 0.5) * 0.6;
    }

    // SIZE → Spectral warping (formant shift)
    // C++ reference: granular_processor.cc lines 132-151
    // Cubic transformation: 4.0 * (size - 0.5)^3 + 0.5
    // This gives more resolution near center (0.5) and stronger effect at extremes
    const warpInput = this.size - 0.5;  // -0.5 to 0.5
    this.spectralParams.spectral.warp = 4.0 * warpInput * warpInput * warpInput + 0.5;

    // TEXTURE → Frequency quantization (magnitude scaling/warping)
    // < 0.5: Quantize down (fewer bins, bit-crushing effect)
    // > 0.5: Warp magnitudes (emphasise quieter partials)
    this.spectralParams.spectral.quantization = this.texture;

    // Buffer writing is now handled centrally by CloudsProcessor
    // (shared buffer architecture ensures frozen content persists across mode switches)

    // Process through phase vocoder
    this.phaseVocoder.process(
      this.spectralParams,
      inputL,
      inputR,
      outputL,
      outputR,
      frameCount
    );

    // Trigger FFT/IFFT computation
    this.phaseVocoder.buffer();
  }

  /**
   * Set freeze state
   * @param {boolean} frozen - Freeze flag
   */
  setFreeze(frozen) {
    this.frozen = frozen;
    this.buffer.setFreeze(frozen);
  }

  /**
   * Clear spectral state
   */
  clear() {
    // Phase vocoder maintains its own state
    // Could add reset method if needed
  }

  /**
   * Get buffer write head position
   * @returns {number} Write head position
   */
  getWriteHead() {
    return this.buffer.getWriteHead();
  }

  /**
   * Get buffer size
   * @returns {number} Buffer size in samples
   */
  getBufferSize() {
    return this.buffer.getSize();
  }
}
