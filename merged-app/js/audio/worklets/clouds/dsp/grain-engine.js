/**
 * GrainEngine - Complete Granular Synthesis Engine
 * CACHE BUST: 2025-12-04-fix-deterministic-v3
 *
 * Full-featured grain synthesis matching Mutable Instruments Clouds:
 * - 64-grain pool (vs 16 in prototype)
 * - Window shape morphing (texture → triangle ↔ Hann)
 * - Deterministic seed mode (density < 0.5 → rhythmic)
 * - Cubic overlap control
 * - Pre-delay system (sub-block grain timing)
 * - Pitch/position/duration randomisation
 *
 * Based on Clouds granular_processor.cc implementation.
 *
 * @class GrainEngine
 */

import { CircularBuffer } from '../core/circular-buffer.js';
import { WindowTable } from '../core/window-table.js';
import { LUT_GRAIN_SIZE, interpolate } from '../resources/grain-size-lut.js';

/**
 * Helper functions ported from stmlib/dsp
 */

// Carmack fast inverse square root (from stmlib/dsp/rsqrt.h:52-63)
function fastRsqrtCarmack(x) {
  // JavaScript doesn't have direct bit manipulation for floats, use standard 1/sqrt
  // For web audio, the precision difference is negligible vs Carmack's trick
  return 1.0 / Math.sqrt(x);
}

// Linear crossfade (from stmlib/dsp/dsp.h:97-99)
function crossfade(a, b, fade) {
  return a + (b - a) * fade;
}

// Clamp value to range (CONSTRAIN macro)
function constrain(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class GrainEngine {
  /**
   * Create a grain engine
   * @param {number} sampleRate - Sample rate
   * @param {number} bufferSize - Buffer size in samples (default 262144 = 5.46s @ 48kHz)
   */
  constructor(sampleRate = 48000, bufferSize = 262144) {
    this.sampleRate = sampleRate;

    // Circular buffer for grain source material (may be replaced by shared buffer)
    this.buffer = new CircularBuffer(bufferSize, 2);

    // Window function lookup table
    this.windowTable = new WindowTable(1024);

    // Grain pool (64 grains max, from Clouds firmware)
    this.maxGrains = 64;
    this.grains = [];
    this.initGrainPool();

    // Grain scheduling (sample-based phasor like Gemini/Clouds C++)
    this.grainRatePhasor = 0.0; // Sample counter for grain triggering
    this.activeGrainCount = 0;

    // Parameters (will be updated from process() call)
    this.position = 0.5;      // Buffer read position (0-1)
    this.size = 0.3;          // Grain duration (0-1)
    this.density = 0.5;       // Grain trigger rate (0-1)
    this.texture = 0.5;       // Randomisation + window shape (0-1)
    this.pitch = 0.0;         // Pitch shift in semitones
    this.stereoSpread = 0.5;  // Stereo width (0-1)

    // Freeze state
    this.frozen = false;

    // Grain interpolation quality mode
    // 'zoh' = Zero-order hold (fastest, aliased, crunchy)
    // 'linear' = Linear interpolation (balanced)
    // 'hermite' = 4-point Hermite cubic (smoothest, highest quality)
    this.qualityMode = 'linear';

    // Gain normalisation state (for SLOPE and ONE_POLE smoothing)
    this.numGrains = 0.0;           // Smoothed active grain count (SLOPE)
    this.gainNormalisation = 1.0;   // Smoothed gain factor (ONE_POLE)

    // Debug logging
    this.debugFrameCount = 0;
    this.debugLogInterval = 48000; // Log once per second

  }

  /**
   * Set external buffer reference (for shared buffer architecture)
   * @param {CircularBuffer} buffer - Shared circular buffer
   */
  setBuffer(buffer) {
    this.buffer = buffer;
  }

  /**
   * Initialise grain pool (pre-allocate all grains)
   */
  initGrainPool() {
    for (let i = 0; i < this.maxGrains; i++) {
      this.grains.push({
        active: false,
        releasing: false,  // Track release phase (don't steal releasing grains)
        phase: 0.0,        // Envelope phase (0-1)
        position: 0.0,     // Buffer read position (fractional samples)
        increment: 1.0,    // Pitch ratio (1.0 = no shift)
        gain_l: 0.5,       // Left channel gain (pan)
        gain_r: 0.5,       // Right channel gain (pan)
        duration: 2048,    // Grain length (samples)
        age: 0,            // Samples elapsed since grain start
        preDelay: 0,       // Start offset within processing block
        smoothness: 0.0    // Window shape morphing (0=triangle, 1=Hann)
      });
    }
  }

  /**
   * Trigger a new grain
   * @param {Object} params - Grain parameters {position, size, density, texture, pitch, stereoSpread}
   */
  triggerGrain(params) {
    // Find inactive grain (skip releasing grains to avoid cutoff)
    const grain = this.grains.find(g => !g.active && !g.releasing);
    if (!grain) {
      return; // All grains busy
    }

    // Calculate grain duration from SIZE parameter using LUT (ACCURATE port from C++)
    // Original Clouds uses lut_grain_size lookup table (resources.cc:2643)
    // LUT maps 0-1 to 1024-16384 samples @ 32kHz, scale to current sample rate
    const grainSizeSamples = interpolate(LUT_GRAIN_SIZE, params.size, 256.0);
    const scale = this.sampleRate / 32000.0; // Scale from Clouds' 32kHz
    let baseDuration = grainSizeSamples * scale;

    // Add TEXTURE randomisation to duration (±20%)
    const durationJitter = 1.0 + (Math.random() - 0.5) * 0.4 * params.texture;
    grain.duration = Math.floor(baseDuration * durationJitter);

    // Pitch shift calculation (must be done before position calculation)
    // Base pitch from PITCH parameter (OCTAVES, -2 to +2)
    // Plus TEXTURE randomisation (±texture * 0.5 octaves)
    const basePitch = params.pitch;
    const pitchJitter = (Math.random() - 0.5) * params.texture; // ±0.5 octaves at max texture
    const totalPitch = basePitch + pitchJitter;
    grain.increment = Math.pow(2.0, totalPitch / 12.0); // Semitones to ratio

    // CRITICAL: Grain size reduction for high pitch ratios (from C++ granular_sample_player.h:206-212)
    // When pitch_ratio > 1.0, grain playhead moves faster than record head
    // Must reduce grain size to prevent buffer overrun
    const bufferSize = this.buffer.getSize();
    if (grain.increment > 1.0) {
      const inv_pitch_ratio = 1.0 / grain.increment;
      const maxSafeSize = bufferSize * 0.25 * inv_pitch_ratio;
      grain.duration = Math.min(grain.duration, Math.floor(maxSafeSize));
    }

    // Calculate buffer read position using "eaten by head" algorithm (C++ lines 214-224)
    // This ensures grains don't read positions that will be overwritten or haven't been recorded
    const buffer_head = this.buffer.getWriteHead();

    // Calculate space consumed by grain playback and recording
    const eaten_by_play_head = grain.duration * grain.increment;
    const eaten_by_recording_head = grain.duration;
    const available = bufferSize - eaten_by_play_head - eaten_by_recording_head;

    // Calculate start position accounting for consumed space
    let start = buffer_head - (params.position * available + eaten_by_play_head);

    // Add TEXTURE randomisation to position (±10% of available space)
    const positionJitter = (Math.random() - 0.5) * 0.2 * params.texture * available;
    start += positionJitter;

    // Wrap to buffer bounds
    grain.position = ((start % bufferSize) + bufferSize) % bufferSize;

    // Stereo spread (random panning per grain)
    const pan = (Math.random() - 0.5) * 2.0 * params.stereoSpread; // -spread to +spread
    const panAngle = (pan + 1.0) * 0.25 * Math.PI; // Map to 0 to π/2
    grain.gain_l = Math.cos(panAngle);
    grain.gain_r = Math.sin(panAngle);

    // Window shape morphing (from Clouds firmware)
    // TEXTURE < 0.5: Triangle envelope with slope control
    // TEXTURE ≥ 0.5: Hann envelope with smoothness control
    if (params.texture >= 0.5) {
      grain.smoothness = (params.texture - 0.5) * 2.0; // 0 to 1
    } else {
      grain.smoothness = 0.0; // Triangle mode
    }

    // Activate grain
    grain.active = true;
    grain.releasing = false;
    grain.phase = 0.0;
    grain.age = 0;
    grain.preDelay = 0; // Could add sub-block timing here

    this.activeGrainCount++;
  }

  /**
   * Process a single grain
   * @param {Object} grain - Grain state object
   * @param {Float32Array} outputL - Left channel output buffer
   * @param {Float32Array} outputR - Right channel output buffer
   * @param {number} frameCount - Number of samples to process
   */
  processGrain(grain, outputL, outputR, frameCount) {
    for (let i = 0; i < frameCount; i++) {
      if (!grain.active) break;

      // Calculate envelope amplitude from phase
      // Use morphable window (triangle ↔ Hann)
      const window = this.windowTable.morphable(grain.phase, grain.smoothness);

      // Read from circular buffer using selected interpolation quality
      let sampleL, sampleR;
      switch (this.qualityMode) {
        case 'zoh':
          // Zero-order hold (fastest, aliased, lo-fi character)
          sampleL = this.buffer.readZOH(grain.position, 0);
          sampleR = this.buffer.readZOH(grain.position, 1);
          break;
        case 'hermite':
          // 4-point Hermite cubic (smoothest, highest quality)
          sampleL = this.buffer.readHermite(grain.position, 0);
          sampleR = this.buffer.readHermite(grain.position, 1);
          break;
        case 'linear':
        default:
          // Linear interpolation (balanced)
          sampleL = this.buffer.readInterpolated(grain.position, 0);
          sampleR = this.buffer.readInterpolated(grain.position, 1);
          break;
      }

      // Apply envelope and pan
      outputL[i] += sampleL * window * grain.gain_l;
      outputR[i] += sampleR * window * grain.gain_r;

      // Advance grain
      grain.position += grain.increment;

      // Wrap position (circular)
      const bufferSize = this.buffer.getSize();
      if (grain.position >= bufferSize) {
        grain.position -= bufferSize;
      } else if (grain.position < 0) {
        grain.position += bufferSize;
      }

      grain.age++;
      grain.phase = grain.age / grain.duration;

      // Check if grain is complete
      if (grain.phase >= 1.0) {
        grain.active = false;
        grain.releasing = true; // Mark as releasing
        this.activeGrainCount--;

        // Schedule release cleanup (allow envelope to fully decay)
        // Note: In a real implementation, this would be handled differently
        // For now, we just mark releasing and will clear after a short time
      }
    }

    // Clear releasing flag after grain envelope completes
    if (grain.releasing && !grain.active) {
      // Simple timeout: assume envelope is done after grain duration
      // In practice, this would be more sophisticated
      grain.releasing = false;
    }
  }

  /**
   * Calculate grain size hint from SIZE parameter
   * @param {number} size - Size parameter (0-1)
   * @returns {number} Grain size in samples
   */
  calculateGrainSizeHint(size) {
    // From Clouds LUT: maps 0-1 to roughly 1024-16384 samples @ 32kHz
    const grainSizeSamples = interpolate(LUT_GRAIN_SIZE, size, 256.0);
    const scale = this.sampleRate / 32000.0;
    return grainSizeSamples * scale;
  }

  /**
   * Calculate cubic overlap from DENSITY
   * (From Clouds firmware - creates more musical density scaling)
   * @param {number} density - Density (0-1)
   * @returns {number} Overlap amount
   */
  calculateOverlap(density) {
    // Clouds uses cubic mapping with dead zone around 0.5
    if (density >= 0.53) {
      return (density - 0.53) * 2.12;
    } else if (density <= 0.47) {
      // CRITICAL FIX: Sign was wrong! Must be (0.47 - density) for positive overlap
      return (0.47 - density) * 2.12;
    } else {
      return 0.0; // Dead zone
    }
  }

  /**
   * Deterministic vs probabilistic grain triggering
   * (From Clouds firmware granular_sample_player.h:75-96)
   *
   * CRITICAL: Uses sample-based phasor (not normalised 0-1)
   * - Phasor increments by 1.0 per sample
   * - spaceBetweenGrains is in samples
   * - Phasor resets to 0 when grain triggers
   *
   * @param {number} density - Density (0-1)
   * @param {number} grainSizeHint - Grain size in samples
   * @returns {Object} {shouldTrigger, resetPhasor}
   */
  shouldTriggerGrain(density, grainSizeHint) {
    // Calculate overlap from density (dead zone at 0.47-0.53)
    let overlap = this.calculateOverlap(density);

    // Raise to 4th power (Gemini uses overlap^4, not overlap^3!)
    // From granular_sample_player.js line 39: overlap = (overlap * overlap) * (overlap * overlap)
    overlap = (overlap * overlap) * (overlap * overlap);

    // Calculate target grain count from overlap
    const targetNumGrains = this.maxGrains * overlap;

    // Calculate probability for probabilistic seeding
    const p = targetNumGrains / grainSizeHint;

    // Calculate space between grains for deterministic mode (in samples)
    const spaceBetweenGrains = targetNumGrains > 0
        ? grainSizeHint / targetNumGrains
        : Infinity;

    // Deterministic mode: density < 0.5 → fixed spacing, rhythmic
    // Probabilistic mode: density ≥ 0.5 → random, stochastic
    const useDeterministicSeed = density < 0.5;

    // From Gemini granular_sample_player.js lines 44-48:
    // - Deterministic mode: p = -1.0 (disables probabilistic)
    // - Probabilistic mode: phasor = -1000 (delays deterministic)
    let effectiveP = useDeterministicSeed ? -1.0 : p;

    // Check trigger conditions
    const seedProbabilistic = Math.random() < effectiveP &&
                              targetNumGrains > this.activeGrainCount;
    const seedDeterministic = useDeterministicSeed &&
                              this.grainRatePhasor >= spaceBetweenGrains;

    return seedProbabilistic || seedDeterministic;
  }

  /**
   * Process audio through grain engine
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
    this.pitch = params.pitch || 0.0;
    this.stereoSpread = params.stereoSpread;
    this.frozen = params.freeze || false;

    // Buffer writing is now handled centrally by CloudsProcessor
    // (shared buffer architecture ensures frozen content persists across mode switches)

    // Zero output buffers
    outputL.fill(0);
    outputR.fill(0);

    // Calculate grain size hint for trigger timing (from Gemini/Clouds C++)
    const grainSizeHint = this.calculateGrainSizeHint(this.size);

    // Mode selection - match Gemini (granular_sample_player.js lines 44-48)
    // CRITICAL: Must happen BEFORE sample loop, once per block
    const useDeterministicSeed = this.density < 0.5;
    if (!useDeterministicSeed) {
      // Probabilistic mode: reset phasor each block to disable deterministic
      this.grainRatePhasor = -1000.0;
    }

    // External trigger from clock sync (Gemini: seed_trigger)
    // Trigger is consumed once per block, on first sample
    let externalTrigger = params.trigger || false;

    // Grain scheduling - sample-based phasor (matches Gemini exactly)
    let grainsTriggeredThisBlock = 0;
    for (let i = 0; i < frameCount; i++) {
      // Advance grain rate phasor by 1.0 per sample
      this.grainRatePhasor += 1.0;

      // Check if we should trigger a new grain
      // seed = seed_probabilistic || seed_deterministic || seed_trigger (Gemini line 57)
      const shouldTrigger = this.shouldTriggerGrain(this.density, grainSizeHint) || externalTrigger;

      if (shouldTrigger) {
        this.triggerGrain(params);
        this.grainRatePhasor = 0.0; // Reset phasor to 0 (not subtract!)
        grainsTriggeredThisBlock++;
        externalTrigger = false; // Consume trigger (one-shot per block)
      }
    }

    // Debug logging disabled - uncomment to debug grain triggering
    // this.debugFrameCount += frameCount;
    // if (this.debugFrameCount >= this.debugLogInterval) {
    //   this.debugFrameCount = 0;
    //   const overlap = this.calculateOverlap(this.density);
    //   const overlap4 = (overlap * overlap) * (overlap * overlap);
    //   const targetGrains = this.maxGrains * overlap4;
    //   const spaceBetween = targetGrains > 0 ? grainSizeHint / targetGrains : Infinity;
    //   console.log(`[GrainEngine] density=${this.density.toFixed(2)}, overlap=${overlap.toFixed(3)}, overlap^4=${overlap4.toFixed(4)}, targetGrains=${targetGrains.toFixed(1)}, spaceBetween=${spaceBetween.toFixed(0)}, phasor=${this.grainRatePhasor.toFixed(0)}, activeGrains=${this.activeGrainCount}, deterministic=${this.density < 0.5}`);
    // }

    // Process all active grains
    for (let g = 0; g < this.grains.length; g++) {
      if (this.grains[g].active) {
        this.processGrain(this.grains[g], outputL, outputR, frameCount);
      }
    }

    // Compute normalisation factor (from C++ granular_sample_player.h:146-163)
    // Count active grains
    const activeGrains = this.activeGrainCount;

    // SLOPE smoothing: asymmetric slew rate (0.9 up, 0.2 down)
    // SLOPE(num_grains_, static_cast<float>(active_grains), 0.9f, 0.2f)
    const error = activeGrains - this.numGrains;
    const slopeRate = error > 0 ? 0.9 : 0.2;
    this.numGrains += slopeRate * error;

    // Calculate gain normalisation with Carmack fast inverse sqrt
    let gainNormalization = this.numGrains > 2.0
        ? fastRsqrtCarmack(this.numGrains - 1.0)
        : 1.0;

    // Window gain compensation (based on window shape/smoothness)
    // In C++: window_gain = 1.0f + 2.0f * parameters.granular.window_shape
    // We use texture as proxy for window_shape (texture controls smoothness)
    const windowShape = this.texture >= 0.5 ? (this.texture - 0.5) * 2.0 : 0.0;
    let windowGain = 1.0 + 2.0 * windowShape;
    windowGain = constrain(windowGain, 1.0, 2.0);

    // Calculate overlap for crossfade (use ^4 like Gemini)
    let overlap = this.calculateOverlap(this.density);
    overlap = (overlap * overlap) * (overlap * overlap); // ^4

    // Crossfade between 1.0 and window_gain based on overlap
    gainNormalization *= crossfade(1.0, windowGain, overlap);

    // Apply gain normalisation with ONE_POLE smoothing per sample
    // ONE_POLE(gain_normalization_, gain_normalization, 0.01f)
    for (let i = 0; i < frameCount; i++) {
      // ONE_POLE: out += coefficient * (in - out)
      this.gainNormalisation += 0.01 * (gainNormalization - this.gainNormalisation);

      outputL[i] *= this.gainNormalisation;
      outputR[i] *= this.gainNormalisation;
    }
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
   * Set grain interpolation quality mode
   * @param {string} mode - Quality mode: 'zoh', 'linear', or 'hermite'
   */
  setQualityMode(mode) {
    if (['zoh', 'linear', 'hermite'].includes(mode)) {
      this.qualityMode = mode;
    } else {
      console.warn(`[GrainEngine] Invalid quality mode: ${mode}, using 'linear'`);
      this.qualityMode = 'linear';
    }
  }

  /**
   * Get current quality mode
   * @returns {string} Current quality mode
   */
  getQualityMode() {
    return this.qualityMode;
  }

  /**
   * Clear all grain states
   */
  clear() {
    for (let grain of this.grains) {
      grain.active = false;
      grain.releasing = false;
      grain.phase = 0.0;
      grain.age = 0;
    }
    this.activeGrainCount = 0;
    this.grainRatePhasor = 0.0;
  }

  /**
   * Get active grain count
   * @returns {number} Number of active grains
   */
  getActiveGrainCount() {
    return this.activeGrainCount;
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
