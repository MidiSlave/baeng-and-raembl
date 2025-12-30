/**
 * Lookup tables for Clouds DSP
 * Ported from Mutable Instruments Clouds / Parasites
 * ES Module version for AudioWorklet
 */

// ===== Crossfade Tables =====
export const LUT_XFADE_IN = new Float32Array(17);
export const LUT_XFADE_OUT = new Float32Array(17);

(function generateXFade() {
  const size = 17;
  const scale = 1 / Math.sqrt(2);
  for (let i = 0; i < size; i++) {
    let t = i / (size - 1);
    t = 1.04 * t - 0.02;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    t *= Math.PI / 2;
    LUT_XFADE_IN[i] = Math.sin(t) * scale;
    LUT_XFADE_OUT[i] = Math.cos(t) * scale;
  }
})();

// ===== Grain Size Table =====
export const LUT_GRAIN_SIZE = new Float32Array(257);

(function generateGrainSize() {
  const TABLE_SIZE = 256;
  for (let i = 0; i <= TABLE_SIZE; i++) {
    const scale = (i / TABLE_SIZE) * 5;
    LUT_GRAIN_SIZE[i] = Math.floor(512 * Math.pow(2, scale));
  }
})();

// ===== Sine Table =====
export const LUT_SIN = new Float32Array(1281);
export const LUT_SIN_SIZE = 1281;

(function generateSin() {
  const size = 1024;
  for (let i = 0; i < size + size / 4 + 1; i++) {
    const t = (i / size) * Math.PI * 2;
    LUT_SIN[i] = Math.sin(t);
  }
})();

// ===== Sine Window (4096 samples for STFT) =====
export const LUT_SINE_WINDOW_4096 = new Float32Array(4096);

(function generateSineWindow4096() {
  const window_size = 4096;
  const t_array = new Float32Array(window_size);
  for (let i = 0; i < window_size; i++) {
    t_array[i] = i / window_size;
  }

  let power = new Float32Array(window_size);
  for (let i = 0; i < window_size; i++) {
    power[i] = Math.pow(1.0 - Math.pow((2 * t_array[i] - 1.0), 2.0), 1.25);
  }

  function sum_window(window_array, steps) {
    const n = window_array.length;
    const stride = n / steps;
    let s = new Float32Array(stride);
    s.fill(0);
    for (let i = 0; i < steps; i++) {
      const start = i * stride;
      for (let j = 0; j < stride; j++) {
        s[j] += Math.pow(window_array[start + j], 2);
      }
    }
    return s;
  }

  const compensation_part = sum_window(power, 2);
  let compensation = new Float32Array(window_size);
  for (let i = 0; i < window_size; i++) {
    compensation[i] = compensation_part[i % compensation_part.length];
  }

  for (let i = 0; i < window_size; i++) {
    LUT_SINE_WINDOW_4096[i] = power[i] / Math.sqrt(compensation[i]);
  }
})();

// ===== Window Table (Raised Cosine / Hann) =====
export const LUT_WINDOW = new Float32Array(4097);
export const LUT_WINDOW_SIZE = 4097;

(function generateWindow() {
  const size = 4096;
  for (let i = 0; i <= size; i++) {
    const t = i / size;
    LUT_WINDOW[i] = 1.0 - (Math.cos(t * Math.PI) + 1) / 2;
  }
})();

// ===== Raised Cosine (for RandomOscillator smoothing) =====
export const LUT_RAISED_COS = new Float32Array(257);
export const LUT_RAISED_COS_SIZE = 257;

(function generateRaisedCos() {
  const size = 256;
  for (let i = 0; i <= size; i++) {
    const t = i / size;
    LUT_RAISED_COS[i] = 1.0 - (Math.cos(t * Math.PI) + 1) / 2;
  }
})();

// ===== Quantized Pitch Table =====
export const LUT_QUANTIZED_PITCH = new Float32Array(1025);

(function generateQuantizedPitch() {
  const PITCH_TABLE_SIZE = 1025;
  const notches = [-24, -12, -7, -4, -3, -1, -0.1, 0, 0.1, 1, 3, 4, 7, 12, 12, 24];
  const n = notches.length - 1;
  let pitch_idx = 0;

  for (let i = 0; i < n; i++) {
    const start_index = Math.floor(i / n * PITCH_TABLE_SIZE);
    const end_index = Math.floor((i + 1) / n * PITCH_TABLE_SIZE);
    const length = end_index - start_index;

    for (let j = 0; j < length; j++) {
      const x = j / (length - 1 || 1);
      const raised_cosine = 0.5 - 0.5 * Math.cos(x * Math.PI);
      const xfade = 0.8 * raised_cosine + 0.2 * x;
      if (pitch_idx < PITCH_TABLE_SIZE) {
        LUT_QUANTIZED_PITCH[pitch_idx++] = notches[i] + (notches[i + 1] - notches[i]) * xfade;
      }
    }
  }
})();

// ===== Filter Cutoff Table =====
export const LUT_CUTOFF = new Float32Array(257);

(function generateCutoff() {
  const TABLE_SIZE = 256;
  for (let i = 0; i <= TABLE_SIZE; i++) {
    const cutoff = i / TABLE_SIZE;
    LUT_CUTOFF[i] = 0.49 * Math.pow(2, -6 * (1 - cutoff));
  }
})();

// ===== Sample Rate Converter FIR Filter =====
export const SRC_FILTER_1X_2_45 = new Float32Array([
  -6.928606892e-04, -5.894682972e-03,  4.393903915e-04,  5.352009980e-03,
   1.833575577e-03, -7.103853054e-03, -5.275577768e-03,  7.999060050e-03,
   1.029879712e-02, -7.191125897e-03, -1.675763381e-02,  3.628265970e-03,
   2.423749384e-02,  4.020326715e-03, -3.208822586e-02, -1.775516900e-02,
   3.947412082e-02,  4.200610725e-02, -4.553678524e-02, -9.270618476e-02,
   4.952442102e-02,  3.157869177e-01,  4.528032253e-01,  3.157869177e-01,
   4.952442102e-02, -9.270618476e-02, -4.553678524e-02,  4.200610725e-02,
   3.947412082e-02, -1.775516900e-02, -3.208822586e-02,  4.020326715e-03,
   2.423749384e-02,  3.628265970e-03, -1.675763381e-02, -7.191125897e-03,
   1.029879712e-02,  7.999060050e-03, -5.275577768e-03, -7.103853054e-03,
   1.833575577e-03,  5.352009980e-03,  4.393903915e-04, -5.894682972e-03,
  -6.928606892e-04,
]);

// ===== Delay Time Multipliers/Dividers =====
export const K_MULT_DIV_STEPS = 16;
export const K_MULT_DIVS = new Float32Array([
  1.0/16.0, 3.0/32.0, 1.0/8.0, 3.0/16.0,
  1.0/4.0, 3.0/8.0, 1.0/2.0, 3.0/4.0,
  1.0,
  3.0/2.0, 2.0/1.0, 3.0/1.0, 4.0/1.0,
  6.0/1.0, 8.0/1.0, 12.0/1.0
]);

// ===== Chord Tables for Resonestor =====
// Each table defines semitone offsets for 4 comb filters
// Entries 0-4: Fine tuning (fractions of semitones)
// Entries 5-17: Chord intervals in semitones
export const CHORD_TABLES = [
  // Table 0: Minor/major transformations (close harmonics, 3rds, 4ths)
  new Float32Array([
    0.0, 4.0 / 128.0, 16.0 / 128.0, 4.0 / 128.0, 4.0 / 128.0,
    12.0, 12.0, 4.0, 4.0,
    3.0, 3.0, 2.0, 4.0,
    3.0, 4.0, 3.0, 4.0,
    4.0
  ]),
  // Table 1: 5ths and octaves (open/power chord character)
  new Float32Array([
    0.0, 8.0 / 128.0, 32.0 / 128.0, 7.0, 12.0,
    24.0, 7.0, 7.0, 7.0,
    7.0, 7.0, 7.0, 7.0,
    7.0, 7.0, 7.0, 7.0,
    7.0
  ]),
  // Table 2: Wide intervals (orchestral/spread character)
  new Float32Array([
    0.0, 12.0 / 128.0, 48.0 / 128.0, 7.0 + 4.0 / 128.0, 12.0 + 4.0 / 128.0,
    36.0, 19.0, 12.0, 11.0,
    10.0, 12.0, 12.0, 12.0,
    14.0, 14.0, 16.0, 16.0,
    16.0
  ])
];
