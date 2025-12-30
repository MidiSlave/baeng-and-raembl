/**
 * FFT Wrapper - Real FFT for Phase Vocoder
 *
 * Cooley-Tukey radix-2 FFT algorithm for real-valued signals.
 * Based on standard FFT implementations, compatible with Clouds STFT.
 *
 * FIXED: Now properly handles complex values during transform.
 * Uses interleaved complex format internally, outputs split format.
 *
 * @class FFT
 */

export class FFT {
  constructor(size = 4096) {
    this.size = size;
    this.halfSize = size / 2;

    // Pre-compute twiddle factors
    this.cosTable = new Float32Array(this.halfSize);
    this.sinTable = new Float32Array(this.halfSize);

    for (let i = 0; i < this.halfSize; i++) {
      const angle = (2.0 * Math.PI * i) / size;
      this.cosTable[i] = Math.cos(angle);
      this.sinTable[i] = Math.sin(angle);
    }

    // Working buffers for complex FFT (interleaved: [re0, im0, re1, im1, ...])
    this.complexBuffer = new Float32Array(size * 2);
  }

  /**
   * Forward real FFT
   * Input: real[0...N-1]
   * Output: [real[0]...real[N/2], imag[0]...imag[N/2]] (split format)
   */
  forward(realIn, output, numPasses) {
    const N = this.size;
    const halfN = this.halfSize;

    // Convert real input to complex (interleaved format)
    for (let i = 0; i < N; i++) {
      this.complexBuffer[i * 2] = realIn[i];     // Real part
      this.complexBuffer[i * 2 + 1] = 0;          // Imaginary part = 0
    }

    // Bit-reverse complex pairs
    this._bitReverseComplex(this.complexBuffer, N);

    // Cooley-Tukey complex FFT
    for (let len = 2; len <= N; len *= 2) {
      const halfLen = len / 2;
      const tableStep = N / len;

      for (let i = 0; i < N; i += len) {
        for (let j = 0; j < halfLen; j++) {
          const k = j * tableStep;
          const cos = this.cosTable[k];
          const sin = -this.sinTable[k]; // Negative for forward FFT

          const evenIdx = (i + j) * 2;
          const oddIdx = (i + j + halfLen) * 2;

          // Complex butterfly operation
          const evenRe = this.complexBuffer[evenIdx];
          const evenIm = this.complexBuffer[evenIdx + 1];
          const oddRe = this.complexBuffer[oddIdx];
          const oddIm = this.complexBuffer[oddIdx + 1];

          // Twiddle factor multiplication: (oddRe + j*oddIm) * (cos + j*sin)
          const tRe = oddRe * cos - oddIm * sin;
          const tIm = oddRe * sin + oddIm * cos;

          // Butterfly
          this.complexBuffer[evenIdx] = evenRe + tRe;
          this.complexBuffer[evenIdx + 1] = evenIm + tIm;
          this.complexBuffer[oddIdx] = evenRe - tRe;
          this.complexBuffer[oddIdx + 1] = evenIm - tIm;
        }
      }
    }

    // Pack into split format [real0...realN/2, imag0...imagN/2]
    // For real-valued input, we only need first half due to conjugate symmetry
    for (let i = 0; i <= halfN; i++) {
      output[i] = this.complexBuffer[i * 2];           // Real parts
      output[i + halfN] = this.complexBuffer[i * 2 + 1]; // Imaginary parts
    }
  }

  /**
   * Inverse real FFT
   * Input: [real[0]...real[N/2], imag[0]...imag[N/2]] (split format)
   * Output: real[0...N-1]
   */
  inverse(input, realOut, numPasses) {
    const N = this.size;
    const halfN = this.halfSize;

    // Unpack from split format to interleaved complex
    // Use conjugate symmetry to reconstruct full spectrum
    // input format: [real[0]...real[N/2], imag[0]...imag[N/2-1]]
    // Note: imag[0] and imag[N/2] are always 0 for real signals
    for (let i = 0; i < halfN; i++) {
      this.complexBuffer[i * 2] = input[i];           // Real part
      this.complexBuffer[i * 2 + 1] = input[i + halfN]; // Imaginary part
    }
    // Handle Nyquist bin (index halfN) - imaginary is 0 for real signals
    this.complexBuffer[halfN * 2] = input[halfN];
    this.complexBuffer[halfN * 2 + 1] = 0;

    // Fill upper half using conjugate symmetry: X[N-k] = X[k]*
    for (let i = 1; i < halfN; i++) {
      this.complexBuffer[(N - i) * 2] = input[i];          // Real part (same)
      this.complexBuffer[(N - i) * 2 + 1] = -input[i + halfN]; // Imaginary part (negated)
    }

    // Bit-reverse complex pairs
    this._bitReverseComplex(this.complexBuffer, N);

    // Cooley-Tukey complex IFFT (conjugated twiddles)
    for (let len = 2; len <= N; len *= 2) {
      const halfLen = len / 2;
      const tableStep = N / len;

      for (let i = 0; i < N; i += len) {
        for (let j = 0; j < halfLen; j++) {
          const k = j * tableStep;
          const cos = this.cosTable[k];
          const sin = this.sinTable[k]; // Positive for inverse FFT

          const evenIdx = (i + j) * 2;
          const oddIdx = (i + j + halfLen) * 2;

          // Complex butterfly operation
          const evenRe = this.complexBuffer[evenIdx];
          const evenIm = this.complexBuffer[evenIdx + 1];
          const oddRe = this.complexBuffer[oddIdx];
          const oddIm = this.complexBuffer[oddIdx + 1];

          // Twiddle factor multiplication: (oddRe + j*oddIm) * (cos + j*sin)
          const tRe = oddRe * cos - oddIm * sin;
          const tIm = oddRe * sin + oddIm * cos;

          // Butterfly
          this.complexBuffer[evenIdx] = evenRe + tRe;
          this.complexBuffer[evenIdx + 1] = evenIm + tIm;
          this.complexBuffer[oddIdx] = evenRe - tRe;
          this.complexBuffer[oddIdx + 1] = evenIm - tIm;
        }
      }
    }

    // Extract real parts and scale
    const scale = 1.0 / N;
    for (let i = 0; i < N; i++) {
      realOut[i] = this.complexBuffer[i * 2] * scale;
    }
  }

  /**
   * Bit-reversal permutation for complex pairs (in-place)
   */
  _bitReverseComplex(data, n) {
    const numBits = Math.log2(n);

    for (let i = 0; i < n; i++) {
      let j = 0;
      for (let bit = 0; bit < numBits; bit++) {
        if (i & (1 << bit)) {
          j |= 1 << (numBits - 1 - bit);
        }
      }

      if (j > i) {
        // Swap complex pairs
        const tempRe = data[i * 2];
        const tempIm = data[i * 2 + 1];
        data[i * 2] = data[j * 2];
        data[i * 2 + 1] = data[j * 2 + 1];
        data[j * 2] = tempRe;
        data[j * 2 + 1] = tempIm;
      }
    }
  }

  /**
   * Initialize (for C++ API compatibility)
   */
  init() {
    // Already initialized in constructor
  }
}
