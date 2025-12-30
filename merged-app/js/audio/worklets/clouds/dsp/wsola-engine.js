/**
 * WSOLA Engine - Waveform Similarity Overlap-Add Time-Stretching
 *
 * Implements pitch-independent time-stretching using waveform similarity
 * to find optimal splice points. This is the "Stretch" mode from Clouds.
 *
 * Algorithm:
 * - Two overlapping synthesis windows
 * - Correlator finds best splice points based on waveform similarity
 * - Cross-fade between windows for seamless stretching
 * - Independent control of pitch (playback rate) and time (overlap)
 *
 * Based on Mutable Instruments Clouds wsola_sample_player implementation.
 *
 * @class WSOLAEngine
 */

import { CircularBuffer } from '../core/circular-buffer.js';
import { Correlator } from './correlator.js';
import { K_MULT_DIVS, K_MULT_DIV_STEPS } from './resources.js';
import { CONSTRAIN, SemitonesToRatio } from '../../clouds-gemini/core/utils.js';
import { SVFilter } from '../core/sv-filter.js';

// Maximum WSOLA window size (from C++)
const kMaxWSOLASize = 4096;

/**
 * WSOLA Synthesis Window
 * C++ reference: clouds/dsp/window.h
 *
 * Uses triangular envelope (0→1→0) with 50% overlap triggering.
 * New window is scheduled when current reaches halfway point (peak).
 */
class WSOLAWindow {
  constructor() {
    this.active = false;
    this.firstSample = 0;       // Start position in buffer (C++: first_sample_)
    this.phase = 0;             // Fixed-point phase (16.16 format)
    this.phaseIncrement = 65536; // Fixed-point pitch ratio (1.0 = 65536)
    this.envelopePhaseIncrement = 0; // Envelope speed (C++: envelope_phase_increment_)

    // Regeneration flags (C++: window.h lines 102-104)
    this.done = true;
    this.half = false;
    this.regenerated = false;
  }

  /**
   * Start window at given position
   * C++ reference: window.h lines 59-69
   * @param {number} bufferSize - Total buffer size
   * @param {number} start - Start position (can be negative, wraps)
   * @param {number} width - Window size in samples
   * @param {number} phaseIncrement - Fixed-point pitch ratio (65536 = 1.0)
   */
  start(bufferSize, start, width, phaseIncrement) {
    // Wrap start position to valid range
    this.firstSample = ((start % bufferSize) + bufferSize) % bufferSize;
    this.phaseIncrement = phaseIncrement;
    this.phase = 0;
    this.regenerated = false;
    this.done = false;
    this.half = false;

    // Envelope goes 0→2 over window duration, giving triangle 0→1→0
    this.envelopePhaseIncrement = 2.0 / width;
  }

  /**
   * Check if window needs a partner window scheduled
   * C++ reference: window.h line 103
   * Triggers at halfway point (peak of triangle)
   * @returns {boolean} True if new window should start
   */
  needsRegeneration() {
    return this.half && !this.regenerated;
  }

  /**
   * Mark that partner window has been scheduled
   */
  markAsRegenerated() {
    this.regenerated = true;
  }

  /**
   * Process one sample from this window
   * C++ reference: window.h lines 72-100
   * @param {CircularBuffer} buffer - Audio buffer
   * @param {number} bufferSize - Buffer size
   * @returns {{l: number, r: number}|null} Sample with envelope, or null if done
   */
  processSample(buffer, bufferSize) {
    if (this.done) {
      return null;
    }

    // Calculate current position (fixed-point 16.16)
    const phaseIntegral = this.phase >>> 16;
    const phaseFractional = (this.phase & 0xFFFF) / 65536.0;
    const sampleIndex = (this.firstSample + phaseIntegral) % bufferSize;

    // Calculate triangular envelope (C++: lines 83-88)
    const envelopePhase = phaseIntegral * this.envelopePhaseIncrement;
    this.done = envelopePhase >= 2.0;
    this.half = envelopePhase >= 1.0;

    // Triangle envelope: ramp up to 1.0 at halfway, then down to 0
    const gain = envelopePhase >= 1.0
      ? 2.0 - envelopePhase
      : envelopePhase;

    // Read with linear interpolation
    const l = buffer.readInterpolated(sampleIndex + phaseFractional, 0) * gain;
    const r = buffer.readInterpolated(sampleIndex + phaseFractional, 1) * gain;

    // Advance phase
    this.phase += this.phaseIncrement;

    return { l, r };
  }
}

export class WSOLAEngine {
  /**
   * Create WSOLA engine
   * @param {number} sampleRate - Sample rate
   * @param {number} bufferSize - Buffer size in samples
   */
  constructor(sampleRate = 48000, bufferSize = 262144) {
    this.sampleRate = sampleRate;

    // Circular buffer for source material
    this.buffer = new CircularBuffer(bufferSize, 2);

    // Correlator for finding optimal splice points
    this.correlator = new Correlator();

    // Pre-allocate correlator buffers (Gemini pattern)
    // kMaxWSOLASize / 32 words + padding
    const correlatorBlockSize = Math.ceil(kMaxWSOLASize / 32) + 2;
    this.correlatorSource = new Uint32Array(correlatorBlockSize);
    this.correlatorDest = new Uint32Array(correlatorBlockSize * 2); // Dest is 2x size
    this.correlator.Init(this.correlatorSource, this.correlatorDest);

    // Two overlapping synthesis windows (C++: Window windows_[2])
    this.windows = [
      new WSOLAWindow(),
      new WSOLAWindow()
    ];

    // WSOLA parameters
    this.position = 0.5;       // Buffer read position (0-1)
    this.size = 0.5;           // Window size (0-1)
    this.density = 0.5;        // Overlap amount / time stretch (0-1)
    this.texture = 0.5;        // Cross-fade shape (0-1)
    this.pitch = 0.0;          // Pitch shift in semitones
    this.frozen = false;

    // Correlator state (Gemini: wsola_sample_player.h)
    this.correlatorLoaded = true;   // Start true, set false after using result
    this.searchSource = 0;          // Position of last window (for correlation)
    this.searchTarget = 0;          // Target position for next window
    this.nextPitchRatio = 1.0;      // Pitch ratio for next window

    // Sync state (for external trigger)
    this.tapDelay = 0;
    this.tapDelayCounter = 0;
    this.synchronized = false;

    // Window sizing (C++ uses kMaxWSOLASize = 4096)
    this.minWindowSize = 256;   // Practical minimum for smooth overlap-add
    this.maxWindowSize = 4096;  // kMaxWSOLASize from C++
    this.currentWindowSize = 2048; // Smoothed window size

    // Pitch smoothing (C++ lines 228-237)
    this.smoothedPitch = 0.0;

    // Envelope/trigger state (C++: wsola_sample_player.h)
    // This controls playback animation - position interpolates toward 1.0 when triggered
    this.envPhase = 1.0;              // Envelope phase (0-1), starts at 1 (no animation)
    this.envPhaseIncrement = 0.0;     // Phase increment per sample
    this.elapsed = 0;                  // Samples since last trigger
    this.prevTrigger = false;          // For edge detection

    // Texture filter (LP/HP controlled by TEXTURE parameter)
    this.filterL = new SVFilter();
    this.filterR = new SVFilter();
    this.filterL.setCoefficients(10000, 0.5, sampleRate);
    this.filterR.setCoefficients(10000, 0.5, sampleRate);

  }

  /**
   * Set external buffer reference (for shared buffer architecture)
   * @param {CircularBuffer} buffer - Shared circular buffer
   */
  setBuffer(buffer) {
    this.buffer = buffer;
  }

  /**
   * Calculate window size from SIZE parameter
   * C++ reference: wsola_sample_player.h line 239
   * Uses SemitonesToRatio((size - 1) * 60) * kMaxWSOLASize
   * @param {number} size - Size parameter (0-1)
   * @returns {number} Window size in samples
   */
  calculateWindowSize(size) {
    // C++ mapping: SemitonesToRatio((size - 1.0) * 60.0) * 4096
    // size=0: ratio = 2^(-60/12) = 2^-5 = 0.03125 → ~128 samples
    // size=0.5: ratio = 2^(-30/12) = 2^-2.5 ≈ 0.177 → ~724 samples
    // size=1: ratio = 2^0 = 1.0 → 4096 samples
    const semitones = (size - 1.0) * 60.0;
    const sizeFactor = Math.pow(2.0, semitones / 12.0);
    const windowSize = Math.floor(sizeFactor * this.maxWindowSize);

    // Apply gradual smoothing to avoid sudden changes (C++ line 241-244)
    const delta = windowSize - this.currentWindowSize;
    if (Math.abs(delta) > 64) {
      const error = Math.floor(delta / 32);
      this.currentWindowSize = this.currentWindowSize + error;
      this.currentWindowSize = this.currentWindowSize - (this.currentWindowSize % 4);
    } else {
      this.currentWindowSize = windowSize;
    }

    return Math.max(256, Math.min(this.maxWindowSize, this.currentWindowSize));
  }

  /**
   * Read sign bits from buffer into packed Uint32Array
   * Gemini reference: wsola_sample_player.js ReadSignBits()
   * @param {number} phaseIncrement - Fixed-point increment (65536 = 1.0)
   * @param {number} source - Start position in buffer
   * @param {number} size - Number of samples to read
   * @param {Uint32Array} destination - Output bit-packed array
   * @returns {number} Number of samples processed
   */
  ReadSignBits(phaseIncrement, source, size, destination) {
    const bufferSize = this.buffer.getSize();
    let phase = 0;
    let bits = 0;
    let bitCounter = 0;
    let numSamples = 0;

    // Wrap negative source
    if (source < 0) {
      source = ((source % bufferSize) + bufferSize) % bufferSize;
    }

    while ((phase >> 16) < size) {
      const integral = source + (phase >> 16);
      const fractional = (phase & 0xFFFF) / 65536.0;

      // Read interpolated sample (sum L+R channels)
      let s = this.buffer.readInterpolated(integral % bufferSize + fractional, 0);
      s += this.buffer.readInterpolated(integral % bufferSize + fractional, 1);

      // Pack sign bit (positive = 1, matching Gemini)
      bits |= (s > 0.0 ? 1 : 0);

      if ((bitCounter & 0x1f) === 0x1f) {
        destination[bitCounter >> 5] = bits;
        numSamples += 32;
      }
      bitCounter++;
      bits = (bits << 1) | 0; // Force 32-bit integer
      phase += phaseIncrement;
    }

    // Pad remaining bits
    while (bitCounter & 0x1f) {
      if ((bitCounter & 0x1f) === 0x1f) {
        destination[bitCounter >> 5] = bits;
        numSamples += 32;
      }
      bitCounter++;
      bits = (bits << 1) | 0;
    }

    return numSamples;
  }

  /**
   * Load correlator buffers for next splice search
   * Gemini reference: wsola_sample_player.js LoadCorrelator()
   * Called once per window regeneration cycle
   */
  LoadCorrelator() {
    if (this.correlatorLoaded) {
      return; // Already loaded
    }

    const windowSize = this.currentWindowSize;

    // Calculate stride (accounts for window size and pitch)
    let stride = windowSize / 2048.0;
    stride = Math.max(1.0, Math.min(2.0, stride));
    stride *= 65536.0;

    const increment = Math.floor(
      stride * (this.nextPitchRatio < 1.25 ? 1.25 : this.nextPitchRatio)
    );

    // Read source region (current window end)
    const numSamples = this.ReadSignBits(
      increment,
      this.searchSource,
      windowSize,
      this.correlator.source()
    );

    // Read destination region (target position +/- windowSize)
    this.ReadSignBits(
      increment,
      this.searchTarget - windowSize,
      windowSize * 2,
      this.correlator.destination()
    );

    // Start correlation search
    this.correlator.StartSearch(
      numSamples,
      this.searchTarget - windowSize + (windowSize >> 1),
      increment
    );

    this.correlatorLoaded = true;
  }

  /**
   * Process audio through WSOLA engine
   * Gemini reference: wsola_sample_player.js Play() method
   * @param {Float32Array} inputL - Left input
   * @param {Float32Array} inputR - Right input
   * @param {Float32Array} outputL - Left output
   * @param {Float32Array} outputR - Right output
   * @param {Object} params - Engine parameters
   */
  process(inputL, inputR, outputL, outputR, params) {
    const frameCount = outputL.length;
    const bufferSize = this.buffer.getSize();

    // Update parameters
    this.size = params.size;
    this.pitch = params.pitch ?? 0.0;
    this.texture = params.texture ?? 0.5;
    this.frozen = params.freeze || false;

    // CRITICAL: Sync buffer freeze state (prevents buffer overwrite when frozen)
    this.buffer.setFreeze(this.frozen);

    // Calculate filter cutoff from TEXTURE parameter
    // 0.0 = strong LP, 0.5 = bypass (no filter), 1.0 = strong HP
    let cutoffHz, useHighpass, filterMix;
    if (this.texture < 0.5) {
      // Lowpass region: 0→0.5 maps to strong LP → bypass
      useHighpass = false;
      const t = this.texture * 2.0;  // 0→1
      cutoffHz = 100 + t * t * 19900;  // 100Hz → 20kHz
      filterMix = 1.0 - t;  // 1→0 (fully filtered → bypass)
    } else {
      // Highpass region: 0.5→1.0 maps to bypass → strong HP
      useHighpass = true;
      const t = (this.texture - 0.5) * 2.0;  // 0→1
      cutoffHz = 20 + t * t * 4980;  // 20Hz → 5kHz
      filterMix = t;  // 0→1 (bypass → fully filtered)
    }
    this.filterL.setCoefficients(cutoffHz, 0.5, this.sampleRate);
    this.filterR.setCoefficients(cutoffHz, 0.5, this.sampleRate);

    // Reset filter state when crossing the 50% boundary to prevent clicks
    // from accumulated filter energy when switching LP↔HP
    if (useHighpass !== this.useHighpass) {
      this.filterL.reset();
      this.filterR.reset();
    }

    this.useHighpass = useHighpass;
    this.filterMix = filterMix;

    // *** TAP SYNC HANDLING (Gemini lines 81-94) ***
    const maxDelay = bufferSize - 2 * this.currentWindowSize;
    this.tapDelayCounter += frameCount;
    if (this.tapDelayCounter > maxDelay) {
      this.tapDelay = 0;
      this.tapDelayCounter = 0;
      this.synchronized = false;
    }

    // Handle trigger input for tap sync
    const trigger = params.trigger || false;
    if (trigger && !this.frozen) {
      if (this.tapDelayCounter > 128) {
        this.synchronized = true;
        this.tapDelay = this.tapDelayCounter;
      }
      this.tapDelayCounter = 0;
    }

    // Handle trigger for envelope animation (Gemini lines 96-99)
    this.elapsed++;
    if (trigger && !this.prevTrigger) {
      this.envPhase = 0.0;
      this.envPhaseIncrement = 1.0 / this.elapsed;
      this.envPhaseIncrement = Math.max(0.0001, Math.min(0.1, this.envPhaseIncrement));
      this.elapsed = 0;
    }
    this.prevTrigger = trigger;

    // Advance envelope (Gemini lines 96-99)
    this.envPhase += this.envPhaseIncrement;
    if (this.envPhase >= 1.0) {
      this.envPhase = 1.0;
    }

    // Apply position interpolation (Gemini lines 100-101)
    let position = params.position;
    position += (1.0 - this.envPhase) * (1.0 - position);
    this.position = position;

    // *** DRIVE CORRELATOR (called each frame) ***
    this.LoadCorrelator();
    this.correlator.EvaluateSomeCandidates();

    // Buffer writing is now handled centrally by CloudsProcessor
    // (shared buffer architecture ensures frozen content persists across mode switches)

    // Zero output buffers
    outputL.fill(0);
    outputR.fill(0);

    const windowSize = this.calculateWindowSize(this.size);

    // If both windows are done, schedule first window (C++: lines 106-109)
    if (this.windows[0].done && this.windows[1].done) {
      this.windows[1].markAsRegenerated();
      this.scheduleAlignedWindow(0, windowSize);
    }

    // Process each sample
    for (let i = 0; i < frameCount; i++) {
      // Sum both windows (C++: lines 112-116)
      for (let w = 0; w < 2; w++) {
        const sample = this.windows[w].processSample(this.buffer, bufferSize);
        if (sample) {
          outputL[i] += sample.l;
          outputR[i] += sample.r;
        }
      }

      // Check for regeneration (C++: lines 118-125)
      for (let w = 0; w < 2; w++) {
        if (this.windows[w].needsRegeneration()) {
          this.windows[w].markAsRegenerated();
          // Schedule the OTHER window
          this.scheduleAlignedWindow(1 - w, windowSize);
          // Process the new window's first sample immediately
          const sample = this.windows[1 - w].processSample(this.buffer, bufferSize);
          if (sample) {
            outputL[i] += sample.l;
            outputR[i] += sample.r;
          }
        }
      }

      // Apply texture filter with dry/wet mix (0.5 = bypass)
      if (this.filterMix > 0.001) {
        const filteredL = this.useHighpass ?
          this.filterL.processHighPass(outputL[i]) :
          this.filterL.processLowPass(outputL[i]);
        const filteredR = this.useHighpass ?
          this.filterR.processHighPass(outputR[i]) :
          this.filterR.processLowPass(outputR[i]);
        outputL[i] = outputL[i] * (1.0 - this.filterMix) + filteredL * this.filterMix;
        outputR[i] = outputR[i] * (1.0 - this.filterMix) + filteredR * this.filterMix;
      }
    }
  }

  /**
   * Schedule a window at the aligned position
   * Gemini reference: wsola_sample_player.js ScheduleAlignedWindow()
   * Uses correlator to find optimal splice points
   * @param {number} windowIndex - Which window to schedule (0 or 1)
   * @param {number} windowSize - Current window size
   */
  scheduleAlignedWindow(windowIndex, windowSize) {
    const bufferSize = this.buffer.getSize();

    // *** USE CORRELATOR RESULT ***
    const nextWindowPosition = this.correlator.best_match();
    this.correlatorLoaded = false; // Request reload for next cycle

    // Start window at correlated position
    this.windows[windowIndex].start(
      bufferSize,
      nextWindowPosition - (windowSize >> 1),
      windowSize,
      Math.floor(this.nextPitchRatio * 65536)
    );

    // *** SMOOTH PITCH FOR NEXT WINDOW ***
    // Limit pitch change to 1 octave per window (Gemini lines 228-237)
    // Note: pitch param is in OCTAVES (-2 to +2), not semitones
    let pitchError = this.pitch - this.smoothedPitch;
    const pitchErrorSign = pitchError < 0 ? -1 : 1;
    pitchError = Math.abs(pitchError);
    if (pitchError >= 1.0) {
      pitchError = 1.0; // Max 1 octave change per window
    }
    this.smoothedPitch += pitchError * pitchErrorSign;

    // Semitones to ratio (pitch is in semitones, use 2^(pitch/12))
    const pitchRatio = Math.pow(2.0, this.smoothedPitch / 12.0);
    const invPitchRatio = Math.pow(2.0, -this.smoothedPitch / 12.0);
    this.nextPitchRatio = pitchRatio;

    // *** CALCULATE TARGET FOR NEXT SEARCH ***
    // Apply gradual window size smoothing (Gemini lines 239-244)
    const sizeFactor = SemitonesToRatio((this.size - 1.0) * 60.0);
    let newWindowSize = Math.floor(sizeFactor * kMaxWSOLASize);
    if (Math.abs(newWindowSize - this.currentWindowSize) > 64) {
      const error = (newWindowSize - this.currentWindowSize) >> 5;
      newWindowSize = this.currentWindowSize + error;
      this.currentWindowSize = newWindowSize - (newWindowSize % 4);
    }

    // Calculate position limit (Gemini lines 246-252)
    let limit = bufferSize;
    limit -= Math.floor(2.0 * this.currentWindowSize * invPitchRatio);
    limit -= 2 * this.currentWindowSize;
    if (limit < 0) limit = 0;

    // Calculate target position (Gemini lines 254-265)
    let position = limit * this.position;

    // Handle tap sync (Gemini lines 256-265)
    if (this.synchronized && K_MULT_DIVS && K_MULT_DIV_STEPS) {
      let index = Math.round(this.position * K_MULT_DIV_STEPS);
      index = Math.max(0, Math.min(K_MULT_DIV_STEPS - 1, index));
      do {
        position = K_MULT_DIVS[index--] * this.tapDelay;
      } while (position > limit && index >= 0);

      position -= this.currentWindowSize * 2;
      if (position < 0) position = 0;
    }

    const head = this.buffer.getWriteHead();
    let targetPosition = head - Math.floor(position) - this.currentWindowSize;

    // *** SET UP NEXT SEARCH ***
    this.searchSource = nextWindowPosition;
    this.searchTarget = targetPosition;
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
   * Clear all window states
   */
  clear() {
    for (let window of this.windows) {
      window.done = true;
      window.half = false;
      window.regenerated = false;
      window.phase = 0;
    }
    this.searchInProgress = false;

    // Reset envelope state
    this.envPhase = 1.0;
    this.envPhaseIncrement = 0.0;
    this.elapsed = 0;
    this.prevTrigger = false;

    // Reset pitch smoothing
    this.smoothedPitch = 0.0;
    this.currentWindowSize = 2048;
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
