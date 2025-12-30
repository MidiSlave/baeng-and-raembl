/**
 * Looping Delay Engine - Accurate Port of Parasites looping_sample_player
 *
 * TWO COMPLETELY SEPARATE MODES:
 * 1. TAPE SCRUB (freeze OFF): Delay chasing with variable-rate pitch
 * 2. LOOPING (freeze ON): Phase-based loop playback
 *
 * Reference: parasites/clouds-js/clouds/dsp/looping_sample_player.js
 *
 * @class LoopingDelayEngine
 */

import { CircularBuffer } from '../core/circular-buffer.js';
import { SVFilter } from '../core/sv-filter.js';

// Crossfade duration at loop boundaries (prevents clicks)
const kCrossfadeDuration = 64.0;

export class LoopingDelayEngine {
  /**
   * Create looping delay engine
   * @param {number} sampleRate - Sample rate
   * @param {number} bufferSize - Buffer size in samples
   */
  constructor(sampleRate = 48000, bufferSize = 262144) {
    this.sampleRate = sampleRate;

    // Circular buffer for delay
    this.buffer = new CircularBuffer(bufferSize, 2);

    // Filters for output
    this.filterL = new SVFilter();
    this.filterR = new SVFilter();
    this.filterL.setCoefficients(10000, 0.5, sampleRate);
    this.filterR.setCoefficients(10000, 0.5, sampleRate);

    // Maximum delay time
    this.maxDelay = this.buffer.getSize() - kCrossfadeDuration;

    // === NON-FROZEN STATE (Tape Scrub) ===
    this.currentDelay = 0.0;      // Smoothed delay time (chases target)

    // === FROZEN STATE (Phase-Based Looping) ===
    this.phase = 0.0;             // Current phase within loop (0 to loopDuration)
    this.loopPoint = 0.0;         // Where loop starts in buffer
    this.loopDuration = 0.0;      // How long the loop is
    this.tailStart = 0.0;         // Start of crossfade tail (previous loop end)
    this.tailDuration = 1.0;      // Duration of crossfade tail
    this.loopReset = 0.0;         // Phase at which loop reset was triggered

    // === TRIGGER SYNC STATE ===
    this.tapDelay = 0;
    this.tapDelayCounter = 0;
    this.smoothedTapDelay = 0.0;
    this.synchronized = false;

    // Parameters
    this.position = 0.5;
    this.size = 0.5;
    this.texture = 0.5;
    this.pitch = 0.0;
    this.feedback = 0.0;
    this.frozen = false;

  }

  /**
   * Set external buffer reference (for shared buffer architecture)
   * @param {CircularBuffer} buffer - Shared circular buffer
   */
  setBuffer(buffer) {
    this.buffer = buffer;
    // Update maxDelay based on new buffer size
    this.maxDelay = this.buffer.getSize() - kCrossfadeDuration;
  }

  /**
   * Process audio through looping delay
   * Reference: looping_sample_player.js Play() method
   */
  process(inputL, inputR, outputL, outputR, params) {
    const size = outputL.length;
    const maxDelay = this.maxDelay;

    // Update parameters
    this.position = params.position;
    this.size_ = params.size;
    this.texture = params.texture;
    this.pitch = params.pitch ?? 0.0;
    this.feedback = params.feedback ?? 0.0;
    this.frozen = params.freeze || false;

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

    this.filterMix = filterMix;
    this.useHighpass = useHighpass;

    // === TRIGGER SYNC HANDLING (lines 45-74) ===
    this.tapDelayCounter += size;
    if (this.tapDelayCounter > maxDelay) {
      this.tapDelay = 0;
      this.tapDelayCounter = 0;
      this.synchronized = false;
    }

    if (params.trigger) {
      if (this.tapDelayCounter > 128) {
        this.synchronized = true;
        this.tapDelay = this.tapDelayCounter;
        this.loopReset = this.phase;
        this.phase = 0.0;
      }
      this.tapDelayCounter = 0;
    }

    if (this.synchronized) {
      this.smoothedTapDelay += 0.01 * (this.tapDelay - this.smoothedTapDelay);
    }

    // Minimum position of 3% prevents artefacts at very low delay values
    // (hardware pots never reach exactly zero; digital UI can)
    const minPosition = 0.03;
    const clampedPosition = Math.max(minPosition, this.position);

    // Calculate target delay (squared position mapping - Parasites style)
    let targetDelay = clampedPosition * clampedPosition * maxDelay;

    // === MODE SPLIT: NON-FROZEN vs FROZEN ===
    if (!this.frozen) {
      // ==========================================
      // NON-FROZEN MODE: TAPE SCRUB (lines 77-138)
      // ==========================================
      // Delay chases target with spring physics
      // Variable playback rate creates pitch bend

      // Capture write head ONCE before the loop
      // buffer.getWriteHead() returns position AFTER the block has been written
      // (CloudsProcessor writes to sharedBuffer BEFORE calling engine.process)
      const writeHeadAfterBlock = this.buffer.getWriteHead();
      const bufferSize = this.buffer.getSize();

      for (let i = 0; i < size; i++) {
        // Spring-based delay smoothing (coefficient 0.0005 from original!)
        const error = targetDelay - this.currentDelay;
        this.currentDelay += 0.0005 * error;

        // Calculate read position relative to write head
        // Original: delay_int = (buffer.head() - 4 - (size - 1 - i) + buffer.size()) << 12
        // buffer.head() in original points to END of written block
        // Adding bufferSize ensures position never goes negative (wraps correctly)
        const offset = size - 1 - i;  // Process oldest to newest
        const readPos = (writeHeadAfterBlock - 4 + bufferSize) - offset - this.currentDelay;

        // Read from buffer with Hermite interpolation
        let l = this.buffer.readHermite(readPos, 0);
        let r = this.buffer.readHermite(readPos, 1);

        // Apply texture filter with dry/wet mix (0.5 = bypass)
        if (this.filterMix > 0.001) {
          const filteredL = this.useHighpass ?
            this.filterL.processHighPass(l) :
            this.filterL.processLowPass(l);
          const filteredR = this.useHighpass ?
            this.filterR.processHighPass(r) :
            this.filterR.processLowPass(r);
          l = l * (1.0 - this.filterMix) + filteredL * this.filterMix;
          r = r * (1.0 - this.filterMix) + filteredR * this.filterMix;
        }

        outputL[i] = l;
        outputR[i] = r;

        // Buffer writing is now handled centrally by CloudsProcessor
        // (shared buffer architecture ensures frozen content persists across mode switches)
        // Feedback is no longer written back to the shared buffer
      }

      // Reset phase when not frozen (line 138)
      this.phase = 0.0;

    } else {
      // ==========================================
      // FROZEN MODE: PHASE-BASED LOOPING (lines 139-227)
      // ==========================================
      // Buffer is static - reads from a looping region
      // PITCH controls playback speed via phase increment

      // Calculate loop parameters
      let loopPoint = this.position * maxDelay * (15.0 / 16.0);
      loopPoint += kCrossfadeDuration;

      const d = this.size_;
      let loopDuration = (0.01 + 0.99 * d * d) * maxDelay;

      // Handle trigger sync for loop duration
      if (this.synchronized) {
        loopDuration = this.smoothedTapDelay;
      }

      // Clamp loop to buffer bounds
      if (loopPoint + loopDuration >= maxDelay) {
        loopPoint = maxDelay - loopDuration;
      }

      // Phase increment from PITCH parameter (semitones to ratio)
      // Pitch param is in semitones (-24 to +24), convert to playback ratio
      const phaseIncrement = this.synchronized ? 1.0 : Math.pow(2.0, this.pitch / 12.0);

      // Get write head position (frozen, so this is constant)
      const writeHead = this.buffer.getWriteHead();
      const bufferSize = this.buffer.getSize();

      for (let i = 0; i < size; i++) {
        // Smooth tap delay (line 162)
        if (this.synchronized) {
          this.smoothedTapDelay += 0.00001 * (this.tapDelay - this.smoothedTapDelay);
        }

        // Check for loop wrap (lines 164-178)
        if (this.phase >= this.loopDuration || this.phase === 0.0) {
          if (this.phase >= this.loopDuration) {
            this.loopReset = this.loopDuration;
          }
          if (this.loopReset >= this.loopDuration) {
            this.loopReset = this.loopDuration;
          }
          // Set up crossfade from previous loop end
          this.tailStart = this.loopDuration - this.loopReset + this.loopPoint;
          this.phase = 0.0;
          this.tailDuration = Math.min(kCrossfadeDuration, kCrossfadeDuration * phaseIncrement);
          this.loopPoint = loopPoint;
          this.loopDuration = loopDuration;
        }

        // Advance phase by pitch-controlled increment
        this.phase += phaseIncrement;

        // Calculate crossfade gain (lines 181-185)
        let gain = 1.0;
        if (this.tailDuration !== 0.0) {
          gain = this.phase / this.tailDuration;
          gain = Math.max(0.0, Math.min(1.0, gain));
        }

        // Calculate read position within loop (line 193)
        // Original: delay_int = (buffer.head() - 4 + buffer.size()) << 12
        // position = delay_int - (loop_duration - phase + loop_point) * 4096
        // Adding bufferSize ensures position never goes negative (wraps correctly)
        const ph = this.phase;  // Could add reverse support here
        const position = (writeHead - 4 + bufferSize) - (this.loopDuration - ph + this.loopPoint);

        // Read from loop position
        let l = this.buffer.readHermite(position, 0);
        let r = this.buffer.readHermite(position, 1);

        // Apply gain (fade in new loop)
        let outL = l * gain;
        let outR = r * gain;

        // Crossfade with previous loop end (lines 209-223)
        if (gain < 1.0) {
          const tailGain = 1.0 - gain;
          const tailPosition = (writeHead - 4 + bufferSize) - (-this.phase + this.tailStart);

          const tailL = this.buffer.readHermite(tailPosition, 0);
          const tailR = this.buffer.readHermite(tailPosition, 1);

          outL += tailL * tailGain;
          outR += tailR * tailGain;
        }

        // Apply texture filter with dry/wet mix (0.5 = bypass)
        if (this.filterMix > 0.001) {
          const filteredL = this.useHighpass ?
            this.filterL.processHighPass(outL) :
            this.filterL.processLowPass(outL);
          const filteredR = this.useHighpass ?
            this.filterR.processHighPass(outR) :
            this.filterR.processLowPass(outR);
          outL = outL * (1.0 - this.filterMix) + filteredL * this.filterMix;
          outR = outR * (1.0 - this.filterMix) + filteredR * this.filterMix;
        }

        outputL[i] = outL;
        outputR[i] = outR;

        // NO BUFFER WRITES WHEN FROZEN - buffer is completely static!
      }
    }
  }

  /**
   * Set freeze state
   */
  setFreeze(frozen) {
    this.frozen = frozen;
    this.buffer.setFreeze(frozen);  // Sync buffer freeze - stops write head when frozen
  }

  /**
   * Clear all state (engine-specific only, NOT shared buffer)
   */
  clear() {
    // Do NOT clear shared buffer - it's shared across all engines
    // Buffer clearing is handled centrally by CloudsProcessor.resetBuffer
    this.filterL.reset();
    this.filterR.reset();

    this.currentDelay = 0.0;
    this.phase = 0.0;
    this.loopPoint = 0.0;
    this.loopDuration = 0.0;
    this.tailStart = 0.0;
    this.tailDuration = 1.0;
    this.loopReset = 0.0;

    this.tapDelay = 0;
    this.tapDelayCounter = 0;
    this.smoothedTapDelay = 0.0;
    this.synchronized = false;
  }

  /**
   * Get buffer write head position
   */
  getWriteHead() {
    return this.buffer.getWriteHead();
  }

  /**
   * Get buffer size
   */
  getBufferSize() {
    return this.buffer.getSize();
  }
}
