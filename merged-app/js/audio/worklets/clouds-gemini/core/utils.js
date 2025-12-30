/**
 * Utility functions ported from Mutable Instruments stmlib
 * ES Module version for AudioWorklet
 */

/**
 * Linear interpolation on a lookup table
 * @param {Float32Array} table - Lookup table
 * @param {number} index - Normalised index (0-1)
 * @param {number} size - Table size
 * @returns {number} Interpolated value
 */
export function Interpolate(table, index, size) {
  index *= size;
  const integral = Math.floor(index);
  const fractional = index - integral;
  const a = table[integral];
  const b = table[integral + 1 < table.length ? integral + 1 : table.length - 1];
  return a + (b - a) * fractional;
}

/**
 * Polynomial soft limiter - prevents audio clipping gracefully
 * CRITICAL: This is what prevents reverb feedback explosion!
 * @param {number} x - Input sample
 * @returns {number} Soft-limited output (-1 to +1)
 */
export function SoftLimit(x) {
  if (x < -1.5) return -1.0;
  if (x > 1.5) return 1.0;
  return x * (27.0 + x * x) / (27.0 + 9.0 * x * x);
}

/**
 * Convert float to int16 with soft limiting
 * @param {number} x - Input float (-1 to +1 nominal)
 * @returns {number} Soft-limited int16 value
 */
export function SoftConvert(x) {
  let v = SoftLimit(x);
  v *= 32768.0;
  if (v > 32767) v = 32767;
  if (v < -32768) v = -32768;
  return Math.floor(v);
}

/**
 * Constrain value to range
 * @param {number} x - Input value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Constrained value
 */
export function CONSTRAIN(x, min, max) {
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

/**
 * Convert semitones to frequency ratio
 * @param {number} semitones - Semitone offset
 * @returns {number} Frequency ratio
 */
export function SemitonesToRatio(semitones) {
  return Math.pow(2.0, semitones / 12.0);
}

/**
 * Clamp to 16-bit integer range
 * @param {number} x - Input value
 * @returns {number} Clamped value
 */
export function Clip16(x) {
  if (x > 32767) return 32767;
  if (x < -32768) return -32768;
  return x;
}

/**
 * One-pole lowpass filter (equivalent to C++ ONE_POLE macro)
 * @param {number} currentValue - Current filter state
 * @param {number} targetValue - Target value
 * @param {number} coefficient - Filter coefficient (0-1)
 * @returns {number} New filter state
 */
export function ONE_POLE_FILTER(currentValue, targetValue, coefficient) {
  return currentValue + (targetValue - currentValue) * coefficient;
}

/**
 * Linear crossfade between two values
 * @param {number} a - First value (fader=0)
 * @param {number} b - Second value (fader=1)
 * @param {number} fader - Crossfade position (0-1)
 * @returns {number} Crossfaded value
 */
export function Crossfade(a, b, fader) {
  return a * (1.0 - fader) + b * fader;
}

/**
 * Plateau interpolation constant
 * Controls the width of the plateau region
 */
const PLATEAU = 2.0;

/**
 * Interpolate with plateau regions (for chord tables, etc.)
 * Provides stable regions at table values with smooth transitions between
 * Used by Resonestor for chord table lookup
 * @param {Float32Array} table - Lookup table
 * @param {number} index - Normalised index (0-1)
 * @param {number} size - Number of segments (table.length - 1)
 * @returns {number} Interpolated value with plateau
 */
export function InterpolatePlateau(table, index, size) {
  index *= size;
  const index_integral = Math.floor(index);
  const index_fractional = index - index_integral;
  const a = table[index_integral];
  const b = table[Math.min(index_integral + 1, size)];

  if (index_fractional < 1.0 / PLATEAU) {
    return a + (b - a) * index_fractional * PLATEAU;
  } else {
    return b;
  }
}
