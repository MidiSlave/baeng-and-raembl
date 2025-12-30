/**
 * STFT - Short-Time Fourier Transform with Overlap-Add
 *
 * Accurate port from Clouds dsp/pvoc/stft.cc
 *
 * Implements windowed FFT analysis and overlap-add synthesis
 * for phase vocoder processing.
 *
 * @class STFT
 */

import { FFT } from '../../core/fft.js';

// Helper: 16-bit clipping
function clip16(x) {
  if (x < -32768) return -32768;
  if (x > 32767) return 32767;
  return Math.floor(x);
}

export class STFT {
  constructor() {
    this.fft = null;
    this.fftSize = 0;
    this.fftNumPasses = 0;
    this.hopSize = 0;
    this.bufferSize = 0;

    // FFT buffers
    this.fftIn = null;
    this.fftOut = null;
    this.ifftIn = null;
    this.ifftOut = null;

    // Window
    this.window = null;
    this.windowStride = 0;

    // Analysis/synthesis buffers (16-bit for efficiency, like C++)
    this.analysis = null;
    this.synthesis = null;

    // State
    this.bufferPtr = 0;
    this.processPtr = 0;
    this.blockSize = 0;
    this.ready = 0;
    this.done = 0;

    this.parameters = null;
    this.modifier = null; // FrameTransformation instance
  }

  /**
   * Initialize STFT
   * @param {FFT} fft - FFT instance
   * @param {number} fftSize - FFT size (power of 2)
   * @param {number} hopSize - Hop size (overlap = fftSize - hopSize)
   * @param {Float32Array} fftBuffer - FFT input/output buffer
   * @param {Float32Array} ifftBuffer - IFFT input/output buffer
   * @param {Float32Array} windowLut - Window lookup table
   * @param {Int16Array} analysisSynthesisBuffer - Analysis/synthesis buffer
   * @param {Object} modifier - FrameTransformation instance
   */
  init(fft, fftSize, hopSize, fftBuffer, ifftBuffer, windowLut, analysisSynthesisBuffer, modifier) {
    this.fftSize = fftSize;
    this.hopSize = hopSize;

    // Calculate number of FFT passes
    this.fftNumPasses = 0;
    for (let t = fftSize; t > 1; t >>= 1) {
      this.fftNumPasses++;
    }

    this.bufferSize = fftSize + hopSize;

    this.fft = fft;
    this.fft.init();

    // Split analysis/synthesis buffer
    this.analysis = analysisSynthesisBuffer.subarray(0, this.bufferSize);
    this.synthesis = analysisSynthesisBuffer.subarray(this.bufferSize, this.bufferSize * 2);

    // FFT/IFFT buffers (shared)
    this.fftIn = this.ifftIn = fftBuffer;
    this.fftOut = this.ifftOut = ifftBuffer;

    // Window
    this.window = windowLut;
    this.windowStride = 4096 / fftSize; // LUT_SINE_WINDOW_4096_SIZE

    this.modifier = modifier;
    this.parameters = null;

    this.reset();
  }

  /**
   * Reset STFT state
   */
  reset() {
    this.bufferPtr = 0;
    this.processPtr = (2 * this.hopSize) % this.bufferSize;
    this.blockSize = 0;

    this.analysis.fill(0);
    this.synthesis.fill(0);

    this.ready = 0;
    this.done = 0;
  }

  /**
   * Process audio samples (push samples through STFT pipeline)
   * @param {Object} parameters - Processing parameters
   * @param {Float32Array} input - Input audio
   * @param {Float32Array} output - Output audio
   * @param {number} size - Number of samples to process
   * @param {number} stride - Channel stride (1=mono, 2=stereo)
   */
  process(parameters, input, output, size, stride) {
    this.parameters = parameters;
    let inputPtr = 0;
    let outputPtr = 0;

    while (size > 0) {
      const processed = Math.min(size, this.hopSize - this.blockSize);

      for (let i = 0; i < processed; i++) {
        // Write input to analysis buffer (convert float → int16)
        const sample = input[inputPtr] * 32768.0;
        this.analysis[this.bufferPtr + i] = clip16(sample);

        // Read from synthesis buffer (convert int16 → float)
        // Use 32768 for proper int16 to float conversion
        output[outputPtr] = this.synthesis[this.bufferPtr + i] / 32768.0;

        inputPtr += stride;
        outputPtr += stride;
      }

      this.blockSize += processed;
      size -= processed;
      this.bufferPtr += processed;

      if (this.bufferPtr >= this.bufferSize) {
        this.bufferPtr -= this.bufferSize;
      }

      if (this.blockSize >= this.hopSize) {
        this.blockSize -= this.hopSize;
        this.ready++;
      }
    }
  }

  /**
   * Buffer one STFT frame (call this after process() to compute FFT/IFFT)
   * This is where the actual FFT processing happens
   */
  buffer() {
    if (this.ready === this.done) {
      return; // No frames ready
    }

    // Copy block to FFT buffer and apply window
    let sourcePtr = this.processPtr;
    let w = 0; // Window index

    for (let i = 0; i < this.fftSize; i++) {
      this.fftIn[i] = this.window[w] * this.analysis[sourcePtr];

      sourcePtr++;
      if (sourcePtr >= this.bufferSize) {
        sourcePtr -= this.bufferSize;
      }

      w += this.windowStride;
    }

    // Compute FFT (fftIn → fftOut)
    if (this.fftSize !== 4096) {
      this.fft.forward(this.fftIn, this.fftOut, this.fftNumPasses);
    } else {
      this.fft.forward(this.fftIn, this.fftOut);
    }

    // Process in frequency domain (modifier = FrameTransformation)
    if (this.modifier !== null && this.parameters !== null) {
      this.modifier.process(this.parameters, this.fftOut, this.ifftIn);
    } else {
      // No processing: copy fftOut → ifftIn
      for (let i = 0; i < this.fftSize; i++) {
        this.ifftIn[i] = this.fftOut[i];
      }
    }

    // Compute IFFT (ifftIn → ifftOut)
    if (this.fftSize !== 4096) {
      this.fft.inverse(this.ifftIn, this.ifftOut, this.fftNumPasses);
    } else {
      this.fft.inverse(this.ifftIn, this.ifftOut);
    }

    // Overlap-add synthesis with windowing
    let destinationPtr = this.processPtr;
    // For 4x overlap (hopSize = fftSize/4) with raised sine window:
    // - Each sample gets added 4 times
    // - Raised sine squared window has average gain of 0.5
    // - So total gain is 4 * 0.5 = 2, need to divide by 2
    // - Also account for IFFT scaling (already done in fft.js with /N)
    // Simplified: inverseWindowSize = hopSize / fftSize / 2 * gain_adjustment
    const inverseWindowSize = this.hopSize / this.fftSize * 2.0;

    w = 0;
    for (let i = 0; i < this.fftSize; i++) {
      const s = this.ifftOut[i] * this.window[w] * inverseWindowSize;

      let x = Math.floor(s);

      if (i < this.fftSize - this.hopSize) {
        // Overlap-add
        x += this.synthesis[destinationPtr];
      }

      this.synthesis[destinationPtr] = clip16(x);

      destinationPtr++;
      if (destinationPtr >= this.bufferSize) {
        destinationPtr -= this.bufferSize;
      }

      w += this.windowStride;
    }

    this.done++;
    this.processPtr += this.hopSize;
    if (this.processPtr >= this.bufferSize) {
      this.processPtr -= this.bufferSize;
    }
  }
}
