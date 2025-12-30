/**
 * FrameTransformation - Spectral Processing for Phase Vocoder
 *
 * Accurate port from Clouds dsp/pvoc/frame_transformation.cc
 *
 * Applies transformations to STFT frames:
 * - Pitch shifting
 * - Spectral warping (formant shift)
 * - Magnitude quantization
 * - Phase randomization
 * - Glitch algorithms
 * - Freeze/texture buffering
 *
 * @class FrameTransformation
 */

const kMaxNumTextures = 7;
const kHighFrequencyTruncation = 16;

// Warp polynomials for formant shifting (from C++ frame_transformation.cc:231-238)
const kWarpPolynomials = [
  [10.5882, -14.8824, 5.29412, 0.0],
  [-7.3333, 9.0, -1.79167, 0.125],
  [0.0, 0.0, 1.0, 0.0],
  [0.0, 0.5, 0.5, 0.0],
  [-7.3333, 9.5, -2.416667, 0.25],
  [-7.3333, 9.5, -2.416667, 0.25]
];

// Helper: Linear crossfade
function crossfade(a, b, fade) {
  return a + (b - a) * fade;
}

// Helper: Linear interpolation in table
function interpolate(table, index, size) {
  const scaledIndex = index * size;
  const i = Math.floor(scaledIndex);
  const frac = scaledIndex - i;

  const i0 = Math.max(0, Math.min(table.length - 1, i));
  const i1 = Math.max(0, Math.min(table.length - 1, i + 1));

  return table[i0] + (table[i1] - table[i0]) * frac;
}

// Helper: Semitones to frequency ratio
function semitonesToRatio(semitones) {
  return Math.pow(2.0, semitones / 12.0);
}

// Helper: Constrain value
function constrain(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Helper: Fast atan2 with magnitude (approximation)
function fastAtan2WithMag(y, x) {
  const mag = Math.sqrt(x * x + y * y);
  let angle = Math.atan2(y, x);

  // Convert to 16-bit phase (0-65535)
  angle = (angle + Math.PI) / (2.0 * Math.PI); // Normalize to 0-1
  const phase = Math.floor(angle * 65536) & 0xFFFF;

  return { magnitude: mag, phase };
}

// Sine LUT (1024 entries to match C++ implementation)
// C++ uses 1024-entry table with 10-bit angle indexing
const lut_sin = new Float32Array(1024);
for (let i = 0; i < 1024; i++) {
  lut_sin[i] = Math.sin((2.0 * Math.PI * i) / 1024.0);
}

export class FrameTransformation {
  constructor() {
    this.fftSize = 0;
    this.numTextures = 0;
    this.size = 0; // (fftSize / 2) - kHighFrequencyTruncation

    // Magnitude texture buffers (for freeze/spectral effects)
    this.textures = [];

    // Phase tracking
    this.phases = null;
    this.phasesDelta = null;

    // Texture priming: track frames until textures are sufficiently filled
    this.framesPrimed = 0;
    this.kPrimingFrames = 8; // Need ~8 frames to fill textures

    this.glitchAlgorithm = 0;
  }

  /**
   * Initialize
   * @param {Float32Array} buffer - Texture buffer memory
   * @param {number} fftSize - FFT size
   * @param {number} numTextures - Number of magnitude texture buffers
   */
  init(buffer, fftSize, numTextures) {
    this.fftSize = fftSize;
    this.size = (fftSize >> 1) - kHighFrequencyTruncation;

    // Allocate texture buffers
    for (let i = 0; i < numTextures; i++) {
      this.textures[i] = buffer.subarray(i * this.size, (i + 1) * this.size);
    }

    // Last texture is repurposed for phase storage
    const phaseBuffer = this.textures[numTextures - 1];
    this.phases = new Uint16Array(phaseBuffer.buffer, phaseBuffer.byteOffset, this.size);
    this.phasesDelta = new Uint16Array(phaseBuffer.buffer, phaseBuffer.byteOffset + this.size * 2, this.size);

    this.numTextures = numTextures - 1;

    this.glitchAlgorithm = 0;
    this.reset();
  }

  /**
   * Reset texture buffers
   */
  reset() {
    for (let i = 0; i < this.numTextures; i++) {
      this.textures[i].fill(0.0);
    }
    this.framesPrimed = 0; // Reset priming counter
  }

  /**
   * Process one STFT frame (main entry point)
   * @param {Object} parameters - Processing parameters
   * @param {Float32Array} fftOut - FFT output (will be modified)
   * @param {Float32Array} ifftIn - IFFT input (output of this function)
   */
  process(parameters, fftOut, ifftIn) {
    // Zero DC and Nyquist
    fftOut[0] = 0.0;
    fftOut[this.fftSize >> 1] = 0.0;

    const freeze = parameters.freeze || false;
    const glitch = parameters.gate || false;
    const pitchRatio = semitonesToRatio(parameters.pitch || 0.0);

    // Analysis: convert rectangular → polar, store magnitudes
    if (!freeze) {
      this.rectangularToPolar(fftOut);
      this.storeMagnitudes(
        fftOut,
        parameters.position || 0.5,
        parameters.spectral?.refreshRate || 0.0
      );
    }

    // Use fftOut as temp buffer
    const temp = fftOut;

    // Synthesis: replay magnitudes, apply transformations
    // Always use replayMagnitudes - during priming it will blend current frame
    // with near-zero textures, which still produces valid output
    this.replayMagnitudes(ifftIn, parameters.position || 0.5);

    this.warpMagnitudes(ifftIn, temp, parameters.spectral?.warp || 0.0);
    this.shiftMagnitudes(temp, ifftIn, pitchRatio);

    if (glitch) {
      this.addGlitch(ifftIn);
    }

    this.quantizeMagnitudes(ifftIn, parameters.spectral?.quantization || 0.5);
    this.setPhases(ifftIn, parameters.spectral?.phaseRandomization || 0.0, pitchRatio);
    this.polarToRectangular(ifftIn);

    if (!glitch) {
      // Pick next glitch algorithm randomly
      this.glitchAlgorithm = Math.floor(Math.random() * 4);
    }

    // Zero DC and Nyquist
    ifftIn[0] = 0.0;
    ifftIn[this.fftSize >> 1] = 0.0;
  }

  /**
   * Convert rectangular (real/imag) to polar (magnitude/phase)
   */
  rectangularToPolar(fftData) {
    const halfSize = this.fftSize >> 1;
    const real = fftData.subarray(0, halfSize);
    const imag = fftData.subarray(halfSize, this.fftSize);
    const magnitude = fftData.subarray(0, halfSize);

    for (let i = 1; i < this.size; i++) {
      const result = fastAtan2WithMag(imag[i], real[i]);
      magnitude[i] = result.magnitude;

      const phaseDelta = (result.phase - this.phases[i]) & 0xFFFF;
      this.phasesDelta[i] = phaseDelta;
      this.phases[i] = result.phase;
    }
  }

  /**
   * Set synthesis phases (with pitch shift and randomization)
   */
  setPhases(destination, phaseRandomization, pitchRatio) {
    const halfSize = this.fftSize >> 1;
    const synthesisPhase = new Uint32Array(destination.buffer, destination.byteOffset + halfSize * 4, this.size);

    for (let i = 0; i < this.size; i++) {
      synthesisPhase[i] = this.phases[i];
      this.phases[i] = (this.phases[i] + Math.floor(this.phasesDelta[i] * pitchRatio)) & 0xFFFF;
    }

    // Phase randomization
    let r = (phaseRandomization - 0.05) * 1.06;
    r = constrain(r, 0.0, 1.0);
    r = r * r;
    const amount = Math.floor(r * 32768.0);

    for (let i = 0; i < this.size; i++) {
      const randomPhase = Math.floor(Math.random() * 32768) * amount >> 14;
      synthesisPhase[i] = (synthesisPhase[i] + randomPhase) & 0xFFFF;
    }
  }

  /**
   * Convert polar (magnitude/phase) to rectangular (real/imag)
   * Uses 1024-entry sine LUT with 10-bit angle indexing
   */
  polarToRectangular(fftData) {
    const halfSize = this.fftSize >> 1;
    const real = fftData.subarray(0, halfSize);
    const imag = fftData.subarray(halfSize, this.fftSize);
    const magnitude = fftData.subarray(0, halfSize);
    const angle = new Uint32Array(fftData.buffer, fftData.byteOffset + halfSize * 4, halfSize);

    for (let i = 1; i < this.size; i++) {
      const a = (angle[i] >> 6) & 1023; // 10-bit angle (0-1023)
      const mag = magnitude[i];

      // Sine LUT is 1024 entries: sin[a] and cos[a] = sin[a + 256]
      real[i] = mag * lut_sin[(a + 256) & 1023]; // cos (90° phase shift)
      imag[i] = mag * lut_sin[a & 1023];         // sin
    }

    // Zero high frequencies
    for (let i = this.size; i < halfSize; i++) {
      real[i] = 0.0;
      imag[i] = 0.0;
    }
  }

  /**
   * Add glitch effects (4 algorithms from C++ lines 153-207)
   */
  addGlitch(xfPolar) {
    const x = xfPolar;

    switch (this.glitchAlgorithm) {
      case 0:
        // Spectral hold and blow
        {
          let held = 0.0;
          for (let i = 0; i < this.size; i++) {
            if ((Math.floor(Math.random() * 16)) === 0) {
              held = x[i];
            }
            x[i] = held;
            held *= 1.01;
          }
        }
        break;

      case 1:
        // Spectral shift up with aliasing
        {
          const factor = 1.0 + (Math.floor(Math.random() * 8)) / 4.0;
          let source = 0.0;
          for (let i = 0; i < this.size; i++) {
            source += factor;
            if (source >= this.size) {
              source = 0.0;
            }
            x[i] = x[Math.floor(source)];
          }
        }
        break;

      case 2:
        // Kill largest harmonic and boost second largest
        {
          let maxIdx = 0;
          let maxVal = 0;
          for (let i = 0; i < this.size; i++) {
            if (x[i] > maxVal) {
              maxVal = x[i];
              maxIdx = i;
            }
          }
          x[maxIdx] = 0.0;

          // Find second max
          maxVal = 0;
          for (let i = 0; i < this.size; i++) {
            if (x[i] > maxVal) {
              maxVal = x[i];
              maxIdx = i;
            }
          }
          x[maxIdx] *= 8.0;
        }
        break;

      case 3:
        // Nasty high-pass
        for (let i = 0; i < this.size; i++) {
          const random = Math.floor(Math.random() * 16);
          if (random === 0) {
            x[i] *= i / 16.0;
          }
        }
        break;
    }
  }

  /**
   * Quantize magnitudes (from C++ lines 209-229)
   */
  quantizeMagnitudes(xfPolar, amount) {
    if (amount <= 0.48) {
      amount = amount * 2.0;
      const scaleDown = 0.5 * semitonesToRatio(-108.0 * (1.0 - amount * amount)) / this.fftSize;
      const scaleUp = 1.0 / scaleDown;

      for (let i = 0; i < this.size; i++) {
        xfPolar[i] = scaleUp * Math.floor(scaleDown * xfPolar[i]);
      }
    } else if (amount >= 0.52) {
      amount = (amount - 0.52) * 2.0;

      let norm = 0;
      for (let i = 0; i < this.size; i++) {
        if (xfPolar[i] > norm) norm = xfPolar[i];
      }

      const invNorm = 1.0 / (norm + 0.0001);
      for (let i = 1; i < this.size; i++) {
        const x = xfPolar[i] * invNorm;
        const warped = 4.0 * x * (1.0 - x) * (1.0 - x) * (1.0 - x);
        xfPolar[i] = (x + (warped - x) * amount) * norm;
      }
    }
  }

  /**
   * Warp magnitudes (formant shift, C++ lines 240-267)
   */
  warpMagnitudes(source, xfPolar, amount) {
    const binWidth = 1.0 / this.size;
    let f = 0.0;

    // Interpolate warp polynomial coefficients
    amount *= 4.0;
    const amountIntegral = Math.floor(amount);
    const amountFractional = amount - amountIntegral;

    const coefficients = [];
    for (let i = 0; i < 4; i++) {
      coefficients[i] = crossfade(
        kWarpPolynomials[amountIntegral][i],
        kWarpPolynomials[Math.min(amountIntegral + 1, 5)][i],
        amountFractional
      );
    }

    const [a, b, c, d] = coefficients;

    for (let i = 1; i < this.size; i++) {
      f += binWidth;
      const wf = (d + f * (c + f * (b + a * f))) * this.size;
      xfPolar[i] = interpolate(source, wf, 1.0);
    }
  }

  /**
   * Shift magnitudes (pitch shift, C++ lines 269-296)
   */
  shiftMagnitudes(source, xfPolar, pitchRatio) {
    const destination = xfPolar.subarray(0, this.size);
    const temp = xfPolar.subarray(this.size, this.size * 2);

    if (pitchRatio === 1.0) {
      for (let i = 0; i < this.size; i++) {
        temp[i] = source[i];
      }
    } else if (pitchRatio > 1.0) {
      let index = 1.0;
      const increment = 1.0 / pitchRatio;

      for (let i = 1; i < this.size; i++) {
        temp[i] = interpolate(source, index, 1.0);
        index += increment;
      }
    } else {
      temp.fill(0.0);
      let index = 1.0;
      const increment = pitchRatio;

      for (let i = 1; i < this.size; i++) {
        const indexIntegral = Math.floor(index);
        const indexFractional = index - indexIntegral;

        if (indexIntegral < this.size) {
          temp[indexIntegral] += (1.0 - indexFractional) * source[i];
        }
        if (indexIntegral + 1 < this.size) {
          temp[indexIntegral + 1] += indexFractional * source[i];
        }

        index += increment;
      }
    }

    for (let i = 0; i < this.size; i++) {
      destination[i] = temp[i];
    }
  }

  /**
   * Store magnitudes to texture buffers (C++ lines 298-348)
   */
  storeMagnitudes(xfPolar, position, feedback) {
    const indexFloat = position * (this.numTextures - 1);
    const indexInt = Math.floor(indexFloat);
    const indexFractional = indexFloat - indexInt;
    let gainA = 1.0 - indexFractional;
    let gainB = indexFractional;

    const a = this.textures[indexInt];
    const b = this.textures[indexInt + (position === 1.0 ? 0 : 1)];

    if (feedback >= 0.5) {
      feedback = 2.0 * (feedback - 0.5);

      if (feedback < 0.5) {
        gainA *= 1.0 - feedback;
        gainB *= 1.0 - feedback;

        for (let i = 0; i < this.size; i++) {
          const x = xfPolar[i];
          a[i] = crossfade(a[i], x, gainA);
          b[i] = crossfade(b[i], x, gainB);
        }
      } else {
        const t = (feedback - 0.5) * 0.7 + 0.5;
        const gainNew = t - 0.5;
        const gainNewSq = gainNew * gainNew * 2.0 + 0.5;
        const gainNewA = gainA * gainNewSq;
        const gainNewB = gainB * gainNewSq;
        const gainOldA = 1.0 - gainA * (1.0 - t);
        const gainOldB = 1.0 - gainB * (1.0 - t);

        for (let i = 0; i < this.size; i++) {
          const x = xfPolar[i];
          a[i] = a[i] * gainOldA + x * gainNewA;
          b[i] = b[i] * gainOldB + x * gainNewB;
        }
      }
    } else {
      feedback *= 2.0;
      feedback *= feedback;
      const threshold = feedback * 65535.0;

      for (let i = 0; i < this.size; i++) {
        const x = xfPolar[i];
        const gain = (Math.random() * 65536) <= threshold ? 1.0 : 0.0;
        a[i] = crossfade(a[i], x, gainA * gain);
        b[i] = crossfade(b[i], x, gainB * gain);
      }
    }

    // Track priming progress
    if (this.framesPrimed < this.kPrimingFrames) {
      this.framesPrimed++;
    }
  }

  /**
   * Replay magnitudes from texture buffers (C++ lines 350-359)
   */
  replayMagnitudes(xfPolar, position) {
    const indexFloat = position * (this.numTextures - 1);
    const indexInt = Math.floor(indexFloat);
    const indexFractional = indexFloat - indexInt;

    const a = this.textures[indexInt];
    const b = this.textures[indexInt + (position === 1.0 ? 0 : 1)];

    for (let i = 0; i < this.size; i++) {
      xfPolar[i] = crossfade(a[i], b[i], indexFractional);
    }
  }
}
