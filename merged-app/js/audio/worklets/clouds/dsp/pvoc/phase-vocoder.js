/**
 * PhaseVocoder - FFT-based Spectral Processing
 *
 * Accurate port from Clouds dsp/pvoc/phase_vocoder.cc
 *
 * Manages stereo STFT processing with frequency-domain transformations.
 *
 * @class PhaseVocoder
 */

import { FFT } from '../../core/fft.js?v=2';
import { STFT } from './stft.js?v=5';
import { FrameTransformation } from './frame-transformation.js?v=2';

export class PhaseVocoder {
  constructor() {
    this.fft = null;
    this.stft = [null, null]; // Stereo
    this.frameTransformation = [null, null]; // Stereo
    this.numChannels = 2;
  }

  /**
   * Initialize phase vocoder
   * @param {Float32Array} largeWindowLut - Window LUT (lut_sine_window_4096)
   * @param {number} largestFftSize - FFT size (4096)
   * @param {number} numChannels - 1=mono, 2=stereo
   * @param {number} sampleRate - Sample rate
   */
  init(largeWindowLut, largestFftSize, numChannels, sampleRate) {
    this.numChannels = numChannels;

    const fftSize = largestFftSize;
    const hopRatio = 4;
    const hopSize = fftSize / hopRatio;

    // Create FFT instance
    this.fft = new FFT(fftSize);

    // Calculate texture parameters
    const numTextures = 7; // kMaxNumTextures
    const textureSize = (fftSize >> 1) - 16; // kHighFrequencyTruncation

    // Allocate buffers for each channel (separate buffers to avoid overwriting)
    for (let i = 0; i < numChannels; i++) {
      // FFT buffers (per-channel to prevent stereo crosstalk)
      const fftBuffer = new Float32Array(fftSize);
      const ifftBuffer = new Float32Array(fftSize);

      // Analysis/synthesis buffer (16-bit integers for efficiency)
      const anaSynBufferSize = (fftSize + hopSize) * 2;
      const anaSynBuffer = new Int16Array(anaSynBufferSize);

      // Texture buffer
      const textureBuffer = new Float32Array(numTextures * textureSize);

      // Create STFT instance
      this.stft[i] = new STFT();

      // Create FrameTransformation instance
      this.frameTransformation[i] = new FrameTransformation();
      this.frameTransformation[i].init(textureBuffer, fftSize, numTextures);

      // Initialize STFT
      this.stft[i].init(
        this.fft,
        fftSize,
        hopSize,
        fftBuffer,
        ifftBuffer,
        largeWindowLut,
        anaSynBuffer,
        this.frameTransformation[i]
      );
    }

  }

  /**
   * Process audio through phase vocoder
   * @param {Object} parameters - Processing parameters
   * @param {Float32Array} inputL - Left channel input
   * @param {Float32Array} inputR - Right channel input
   * @param {Float32Array} outputL - Left channel output
   * @param {Float32Array} outputR - Right channel output
   * @param {number} size - Number of samples
   */
  process(parameters, inputL, inputR, outputL, outputR, size) {
    if (this.numChannels === 2) {
      // Stereo: interleave input
      const interleavedInput = new Float32Array(size * 2);
      const interleavedOutput = new Float32Array(size * 2);

      for (let i = 0; i < size; i++) {
        interleavedInput[i * 2] = inputL[i];
        interleavedInput[i * 2 + 1] = inputR[i];
      }

      // Process each channel
      this.stft[0].process(parameters, interleavedInput, interleavedOutput, size, 2);
      this.stft[1].process(parameters, interleavedInput.subarray(1), interleavedOutput.subarray(1), size, 2);

      // De-interleave output
      for (let i = 0; i < size; i++) {
        outputL[i] = interleavedOutput[i * 2];
        outputR[i] = interleavedOutput[i * 2 + 1];
      }
    } else {
      // Mono
      this.stft[0].process(parameters, inputL, outputL, size, 1);
      for (let i = 0; i < size; i++) {
        outputR[i] = outputL[i];
      }
    }
  }

  /**
   * Buffer STFT frames (call after process())
   * This triggers the FFT/IFFT computation
   */
  buffer() {
    for (let i = 0; i < this.numChannels; i++) {
      this.stft[i].buffer();
    }
  }
}
