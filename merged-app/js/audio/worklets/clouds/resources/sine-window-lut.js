/**
 * Sine Window LUT for Phase Vocoder
 *
 * 4096-entry raised sine window used by STFT.
 * Formula: sin²(π * n / (N-1)) for n = 0...N-1
 *
 * This matches lut_sine_window_4096 from Clouds resources.cc
 *
 * @constant {Float32Array}
 */

const LUT_SIZE = 4096;

export const LUT_SINE_WINDOW_4096 = new Float32Array(LUT_SIZE);

// Generate raised sine window: sin²(π * n / (N-1))
for (let i = 0; i < LUT_SIZE; i++) {
  const phase = (Math.PI * i) / (LUT_SIZE - 1);
  const sinVal = Math.sin(phase);
  LUT_SINE_WINDOW_4096[i] = sinVal * sinVal;
}

export const LUT_SINE_WINDOW_4096_SIZE = LUT_SIZE;
