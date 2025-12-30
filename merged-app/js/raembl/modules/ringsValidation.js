/**
 * Rings parameter validation - prevents instability at extreme values
 *
 * The Modal resonator (model 0) becomes numerically unstable at high STRUCTURE
 * values due to unbounded Q-factor growth in the SVF bandpass filter bank.
 *
 * This validation layer provides model-specific safe limits as a defence layer
 * on top of the DSP-level fixes in the processor.
 */

export const ringsParams = {
  structure: {
    min: 0.0,
    max: 1.0,
    default: 0.5,
    safeMax: {
      0: 0.95,  // Modal - SVF Q-factor stability
      1: 0.90,  // Sympathetic String - harmonic coupling
      2: 1.0,   // String - Karplus-Strong stable
      3: 1.0,   // FM Voice - stable
      4: 0.85,  // Sympathetic String Quantised - stricter coupling
      5: 1.0    // String + Reverb - stable
    },
    critical: true
  },
  brightness: { min: 0.0, max: 1.0, default: 0.5 },
  damping: { min: 0.0, max: 1.0, default: 0.3 },
  position: { min: 0.0, max: 1.0, default: 0.5 }
};

/**
 * Validate a Rings parameter value, applying model-specific safe limits
 *
 * @param {string} paramId - Parameter identifier (structure, brightness, damping, position)
 * @param {number} value - Raw parameter value (0-1)
 * @param {number} modelId - Current resonator model (0-5)
 * @returns {number} Validated parameter value
 */
export function validateRingsParam(paramId, value, modelId = 0) {
  const param = ringsParams[paramId];
  if (!param) return value;

  let clamped = Math.max(param.min, Math.min(param.max, value));

  if (param.safeMax && param.safeMax[modelId] !== undefined) {
    const safe = param.safeMax[modelId];
    if (clamped > safe) {
      console.warn(`[Rings] ${paramId} clamped to ${safe} for model ${modelId}`);
      clamped = safe;
    }
  }

  return clamped;
}

/**
 * Get the safe maximum value for a parameter given the current model
 *
 * @param {string} paramId - Parameter identifier
 * @param {number} modelId - Current resonator model (0-5)
 * @returns {number} Safe maximum value
 */
export function getSafeMax(paramId, modelId = 0) {
  const param = ringsParams[paramId];
  if (!param) return 1.0;

  if (param.safeMax && param.safeMax[modelId] !== undefined) {
    return param.safeMax[modelId];
  }

  return param.max;
}
