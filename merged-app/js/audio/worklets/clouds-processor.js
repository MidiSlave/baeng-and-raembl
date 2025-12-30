/**
 * Clouds Processor - Main AudioWorklet Processor
 *
 * Mutable Instruments Clouds - 100% Accurate Port
 * Phase 6: System Integration
 *
 * Signal Flow:
 * Input → Buffer → Mode Router (4 engines) → Diffuser →
 * Reverb (LFO-modulated) → Feedback Loop (HP filtered) →
 * Dry/Wet Mix (equal-power) → Output
 *
 * @class CloudsProcessor
 * @extends AudioWorkletProcessor
 */

console.log('[CloudsProcessor] Module loading - START');

// Import core utilities
import { CircularBuffer } from './clouds/core/circular-buffer.js';
import { SVFilter } from './clouds/core/sv-filter.js';
import { SampleRateConverter } from './clouds/core/fir-filter.js';

// Import DSP building blocks
import { Diffuser } from './clouds/dsp/diffuser.js';
// import { CloudsReverb } from './clouds/dsp/clouds-reverb.js'; // OLD - feedback explosion bug
import { GeminiReverb } from './clouds-gemini/dsp/reverb-gemini.js'; // NEW - with SoftLimit protection

// Import playback engines
import { GrainEngine } from './clouds/dsp/grain-engine.js?v=6';
import { WSOLAEngine } from './clouds/dsp/wsola-engine.js?v=5';
import { LoopingDelayEngine } from './clouds/dsp/looping-delay-engine.js?v=14';
import { SpectralEngine } from './clouds/dsp/spectral-engine.js?v=10';
import { OliverbEngine } from './clouds/dsp/oliverb-engine.js?v=1';
import { ResonestorEngine } from './clouds/dsp/resonestor-engine.js?v=10';

console.log('[CloudsProcessor] All imports successful');

class CloudsProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // DEBUG: Post message to main thread (will appear in console)
    this.port.postMessage({ type: 'debug', message: '[CloudsProcessor] constructor started' });

    // Sample rate and block size
    this.sampleRate = globalThis.sampleRate || 48000;
    this.blockSize = 128; // AudioWorklet default block size

    // Shared input buffer for all engines (5.46s @ 48kHz)
    const bufferSize = 262144; // Power of 2
    this.inputBuffer = new CircularBuffer(bufferSize, 2);

    // Initialize all 5 playback engines
    // Note: Engines 0-3 create internal buffers, then receive shared buffer via setBuffer()
    this.grainEngine = new GrainEngine(this.sampleRate, bufferSize);
    this.wsolaEngine = new WSOLAEngine(this.sampleRate, bufferSize);
    this.loopingDelayEngine = new LoopingDelayEngine(this.sampleRate);
    this.spectralEngine = new SpectralEngine(this.sampleRate, bufferSize);

    // Inject shared buffer to all buffer-based engines (modes 0-3)
    // This ensures frozen content is preserved when switching modes
    this.grainEngine.setBuffer(this.inputBuffer);
    this.wsolaEngine.setBuffer(this.inputBuffer);
    this.loopingDelayEngine.setBuffer(this.inputBuffer);
    this.spectralEngine.setBuffer(this.inputBuffer);

    // Oliverb engine (Mode 4) - Parasites reverb mode
    this.oliverbBuffer = new Float32Array(16384); // 16KB buffer for reverb delay lines
    this.oliverbEngine = new OliverbEngine();
    this.oliverbEngine.Init(this.oliverbBuffer);

    // Resonestor engine (Mode 5) - Parasites modal synthesis
    this.resonestorBuffer = new Float32Array(16384); // 16KB buffer for comb filter delay lines
    this.resonestorEngine = new ResonestorEngine();
    this.resonestorEngine.Init(this.resonestorBuffer);

    // Post-processing chain
    this.diffuser = new Diffuser(this.sampleRate);

    // Gemini reverb with FxEngine (requires buffer allocation)
    this.reverbBuffer = new Float32Array(16384); // 16KB buffer for delay lines
    this.reverb = new GeminiReverb();
    this.reverb.Init(this.reverbBuffer);

    // Feedback path high-pass filter (removes DC drift/rumble)
    this.feedbackFilterL = new SVFilter();
    this.feedbackFilterR = new SVFilter();
    this.feedbackFilterL.setCoefficients(200, 0.3, this.sampleRate); // 200Hz HP, resonance=0.3
    this.feedbackFilterR.setCoefficients(200, 0.3, this.sampleRate);

    // Current mode (0=Granular, 1=WSOLA, 2=Looping, 3=Spectral, 4=Oliverb, 5=Resonestor)
    this.mode = 0;
    this.freeze = false;
    this.freeze_lp = 0.0; // One-pole smoothed freeze state (0.0005 coefficient = 62.5ms @ 32kHz)

    // Current position parameter value (0-1) for visualisation
    this.currentPosition = 0.5;

    // Trigger state for WSOLA playback animation (consumed after one frame)
    this.triggerActive = false;

    // Lo-fi mode (2x downsampling/upsampling for vintage character)
    this.lofiMode = false;
    this.sampleRateConverter = new SampleRateConverter();

    // Mono mode (sums L+R input, doubles effective buffer time)
    this.monoMode = false;

    // Temporary buffers for lo-fi processing
    this.lofiInputL = new Float32Array(this.blockSize / 2);
    this.lofiInputR = new Float32Array(this.blockSize / 2);
    this.lofiOutputL = new Float32Array(this.blockSize / 2);
    this.lofiOutputR = new Float32Array(this.blockSize / 2);

    // Processing buffers (pre-allocated for efficiency)
    this.tempInputL = new Float32Array(this.blockSize);
    this.tempInputR = new Float32Array(this.blockSize);
    this.tempOutputL = new Float32Array(this.blockSize);
    this.tempOutputR = new Float32Array(this.blockSize);

    // Feedback buffers (full block, not just single sample)
    this.feedbackBufferL = new Float32Array(this.blockSize);
    this.feedbackBufferR = new Float32Array(this.blockSize);

    // Output history for Oliverb/Resonestor visualisation (ring buffer)
    this.outputHistorySize = 2048; // ~42ms at 48kHz - good for visualisation
    this.outputHistory = new Float32Array(this.outputHistorySize);
    this.outputHistoryHead = 0;

    // Message handler for mode/freeze changes
    this.port.onmessage = this.handleMessage.bind(this);

  }

  /**
   * Parameter descriptors for Web Audio API
   * All parameters are a-rate (audio-rate) for smooth automation
   */
  static get parameterDescriptors() {
    return [
      {
        name: 'position',
        defaultValue: 0,  // Was 0.5 - caused timing issues when setting to 0
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'size',
        defaultValue: 0,  // Was 0.5 - caused timing issues when setting to 0
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'density',
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'texture',
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'pitch',
        defaultValue: 0,
        minValue: -2,
        maxValue: 2,
        automationRate: 'a-rate'
      },
      {
        name: 'spread',
        defaultValue: 0.5,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'feedback',
        defaultValue: 0,  // CRITICAL: Must match clouds.js default to prevent runaway
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'dryWet',
        defaultValue: 1.0,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'reverb',
        defaultValue: 0.3,
        minValue: 0,
        maxValue: 1,
        automationRate: 'a-rate'
      },
      {
        name: 'inputGain',
        defaultValue: 1.0,
        minValue: 0,
        maxValue: 2,
        automationRate: 'a-rate'
      },
    ];
  }

  /**
   * Main audio processing loop
   * Called once per render quantum (128 samples by default)
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    // Handle no input case (generate silence)
    if (!input || !input[0]) {
      return true;
    }


    const frameCount = input[0].length;
    const inputL = input[0];
    const inputR = input[1] || input[0]; // Mono → Stereo if needed

    // Ensure output channels exist
    if (!output[0] || !output[1]) {
      console.error('[CloudsProcessor] Output channels missing!');
      return true;
    }

    // Get parameter values (use first sample if a-rate, else k-rate constant)
    // Clamp all parameters to valid ranges (defensive programming)
    const position = Math.max(0, Math.min(1, parameters.position[0]));
    const size = Math.max(0, Math.min(1, parameters.size[0]));
    const density = Math.max(0, Math.min(1, parameters.density[0]));
    const texture = Math.max(0, Math.min(1, parameters.texture[0]));
    const pitch = Math.max(-2, Math.min(2, parameters.pitch[0]));
    const spread = Math.max(0, Math.min(1, parameters.spread[0]));
    const feedback = Math.max(0, Math.min(1, parameters.feedback[0]));
    const dryWet = Math.max(0, Math.min(1, parameters.dryWet[0]));
    const reverbAmount = Math.max(0, Math.min(1, parameters.reverb[0]));
    const inputGain = Math.max(0, Math.min(2, parameters.inputGain[0]));

    // Store position for visualisation
    this.currentPosition = position;

    // Store original input for dry signal (BEFORE feedback or processing)
    // This matches C++ which uses original input for dry path
    const originalInputL = new Float32Array(frameCount);
    const originalInputR = new Float32Array(frameCount);

    // Apply input gain to original input
    for (let i = 0; i < frameCount; i++) {
      originalInputL[i] = inputL[i] * inputGain;
      originalInputR[i] = inputR[i] * inputGain;
    }

    // Clear temp buffers
    this.tempOutputL.fill(0);
    this.tempOutputR.fill(0);

    // Update freeze_lp one-pole filter FIRST (C++ granular_processor.cc:321)
    // CRITICAL: Must happen BEFORE feedback calculation so fb_gain uses current frame's value
    // ONE_POLE(freeze_lp_, parameters_.freeze ? 1.0f : 0.0f, 0.0005f)
    const freeze_target = this.freeze ? 1.0 : 0.0;
    this.freeze_lp += 0.0005 * (freeze_target - this.freeze_lp);

    // 1. Apply feedback with nonlinear soft limiting (like original Clouds)
    // Dynamic HP filter cutoff based on feedback amount (20-120 Hz range)
    // CRITICAL: SVFilter expects Hz, not normalized frequency!
    // Q = 1.0 (flat response, matches original)
    const cutoffHz = 20 + 100 * feedback * feedback;
    this.feedbackFilterL.setCoefficients(cutoffHz, 1.0, this.sampleRate);
    this.feedbackFilterR.setCoefficients(cutoffHz, 1.0, this.sampleRate);

    // High-pass filter the feedback buffers BEFORE applying
    for (let i = 0; i < frameCount; i++) {
      this.feedbackBufferL[i] = this.feedbackFilterL.processHighPass(this.feedbackBufferL[i]);
      this.feedbackBufferR[i] = this.feedbackFilterR.processHighPass(this.feedbackBufferR[i]);
    }

    // Apply feedback with nonlinear soft limiting to prevent runaway
    // CRITICAL: Feedback is reduced when frozen (C++ granular_processor.cc:327)
    // Parabolic curve (2.0 - feedback) peaks at fb=0.5, providing musical scaling
    const fb_gain = feedback * (2.0 - feedback) * (1.0 - this.freeze_lp); // Feedback disabled when frozen
    const fb_scale = fb_gain * 1.4;

    for (let i = 0; i < frameCount; i++) {
      // Left channel - nonlinear feedback formula from original Clouds
      const mixedL = fb_scale * this.feedbackBufferL[i] + originalInputL[i];
      const limitedL = Math.tanh(mixedL); // SoftLimit approximation
      const wetContribL = limitedL - originalInputL[i];
      this.tempInputL[i] = originalInputL[i] + fb_gain * wetContribL;

      // Right channel
      const mixedR = fb_scale * this.feedbackBufferR[i] + originalInputR[i];
      const limitedR = Math.tanh(mixedR);
      const wetContribR = limitedR - originalInputR[i];
      this.tempInputR[i] = originalInputR[i] + fb_gain * wetContribR;
    }

    // 2. Route to active engine based on mode
    const params = {
      position,
      size,
      density,
      texture,
      pitch,
      stereoSpread: spread, // Stereo spread parameter
      freeze: this.freeze,
      trigger: this.triggerActive,  // For WSOLA playback animation
      feedback,  // For Oliverb mode
      reverbAmount,  // For Oliverb mode
      dryWet  // For Resonestor distortion
    };

    // Consume trigger state (one-shot per frame)
    this.triggerActive = false;

    // Write input to shared buffer (all engines read from this)
    // Only write when not frozen - frozen state preserves buffer content
    if (!this.freeze) {
      const frameCount = this.tempInputL.length;
      for (let i = 0; i < frameCount; i++) {
        this.inputBuffer.writeSample(this.tempInputL[i], this.tempInputR[i]);
      }
    }

    this.routeMode(
      this.tempInputL,
      this.tempInputR,
      this.tempOutputL,
      this.tempOutputR,
      params
    );

    // 3. Post-processing: Diffuser → Reverb (per-sample processing)

    // Set diffusion amount based on mode (granular uses texture > 0.75, others use density)
    const diffusionAmount = this.mode === 0 ?
      Math.max(0, (texture - 0.75) * 4.0) : // Granular: texture > 0.75
      density; // Other modes: density

    this.diffuser.amount = diffusionAmount;

    // NOTE: freeze_lp is now updated at start of process() before feedback calculation
    // This ensures fb_gain uses the current frame's freeze state, not the previous frame's

    // Use raw reverb amount - no feedback-based boost (matches C++ original)
    // Feedback only affects reverb tone (lowpass), not amount
    const modifiedReverbAmount = reverbAmount * 0.95;

    this.reverb.setAmount(modifiedReverbAmount * 0.54);            // Scaled to prevent time > 0.98
    this.reverb.setTime(0.35 + 0.63 * modifiedReverbAmount);      // Time scales with MODIFIED amount
    this.reverb.lp = 0.6 + 0.37 * feedback;                       // Lowpass controlled by feedback (0.6-0.97)

    for (let i = 0; i < frameCount; i++) {
      // Diffuser (smears texture)
      const diffused = this.diffuser.process(this.tempOutputL[i], this.tempOutputR[i]);
      this.tempOutputL[i] = diffused.l;
      this.tempOutputR[i] = diffused.r;
    }

    // 4. Store feedback buffer BEFORE reverb (like original Clouds)
    // CRITICAL: Feedback tap is AFTER diffuser but BEFORE reverb!
    // "This is what is fed back. Reverb is not fed back." - granular_processor.cc:260
    // FIX: Gate on fb_gain (not raw feedback) so buffer clears immediately when frozen
    if (fb_gain > 0.001) {
      for (let i = 0; i < frameCount; i++) {
        this.feedbackBufferL[i] = this.tempOutputL[i];
        this.feedbackBufferR[i] = this.tempOutputR[i];
      }
    } else {
      // Clear feedback buffer when frozen or feedback is essentially 0
      // This prevents ghost echoes from persisting and stops frozen buffer evolution
      this.feedbackBufferL.fill(0);
      this.feedbackBufferR.fill(0);
    }

    // 5. Equal-power dry/wet crossfade FIRST
    // Wet signal gets post_gain = 1.2 (like C++)
    const post_gain = 1.2;

    // Equal-power crossfade using sin/cos
    // fade_out (dry): 0.7071 → 0.0 as dryWet goes 0 → 1
    // fade_in (wet): 0.0 → 0.7071 as dryWet goes 0 → 1
    const fade_in = Math.sin(dryWet * Math.PI * 0.5) * 0.7071067812;
    const fade_out = Math.cos(dryWet * Math.PI * 0.5) * 0.7071067812;

    for (let i = 0; i < frameCount; i++) {
      // Dry signal: Original input * fade_out
      let outL = originalInputL[i] * fade_out;
      let outR = originalInputR[i] * fade_out;

      // Wet signal: Engine output * post_gain * fade_in
      outL += this.tempOutputL[i] * post_gain * fade_in;
      outR += this.tempOutputR[i] * post_gain * fade_in;

      output[0][i] = outL;
      output[1][i] = outR;
    }

    // 6. Apply reverb AFTER D/W crossfade (reverb audible at all D/W positions)
    for (let i = 0; i < frameCount; i++) {
      const reverbed = this.reverb.process(output[0][i], output[1][i]);
      output[0][i] = reverbed.l;
      output[1][i] = reverbed.r;

      // Capture output for Oliverb/Resonestor visualisation
      if (this.mode === 4 || this.mode === 5) {
        this.outputHistory[this.outputHistoryHead] = (reverbed.l + reverbed.r) * 0.5;
        this.outputHistoryHead = (this.outputHistoryHead + 1) % this.outputHistorySize;
      }
    }

    return true; // Keep processor alive
  }

  /**
   * Route to active playback engine
   * @param {Float32Array} inputL - Left input channel
   * @param {Float32Array} inputR - Right input channel
   * @param {Float32Array} outputL - Left output channel
   * @param {Float32Array} outputR - Right output channel
   * @param {Object} params - Engine parameters
   */
  routeMode(inputL, inputR, outputL, outputR, params) {
    switch (this.mode) {
      case 0: // Granular
        this.grainEngine.process(inputL, inputR, outputL, outputR, params);
        break;

      case 1: // WSOLA (time-stretching)
        this.wsolaEngine.process(inputL, inputR, outputL, outputR, params);
        break;

      case 2: // Looping Delay
        this.loopingDelayEngine.process(inputL, inputR, outputL, outputR, params);
        break;

      case 3: // Spectral
        this.spectralEngine.process(inputL, inputR, outputL, outputR, params);
        break;

      case 4: // Oliverb (Parasites reverb mode)
        // Convert pitch from octaves (-2 to +2) to semitones (-24 to +24)
        const pitchSemitones = params.pitch * 12.0;

        // Map Clouds parameters to Oliverb controls (from granular_processor.js:244-277)
        this.oliverbEngine.set_diffusion(0.3 + 0.5 * params.stereoSpread);
        this.oliverbEngine.set_size(0.05 + 0.94 * params.size);
        this.oliverbEngine.set_mod_rate(params.feedback);
        this.oliverbEngine.set_mod_amount(params.reverbAmount * 300.0);
        this.oliverbEngine.set_ratio(this.semitonesToRatio(pitchSemitones));

        // Pitch shift wet amount (crossfade based on pitch offset)
        // Wet = 1.0 when pitch is extreme (±0.7 octaves), 0.0 when centred
        const x = params.pitch;  // In octaves
        const limit = 0.7;
        const slew = 0.4;
        let wet =
          x < -limit ? 1.0 :
          x < -limit + slew ? 1.0 - (x + limit) / slew :
          x < limit - slew ? 0.0 :
          x < limit ? 1.0 + (x - limit) / slew :
          1.0;
        this.oliverbEngine.set_pitch_shift_amount(wet);

        // Freeze mode: Stop input, max decay, flat EQ
        if (params.freeze) {
          this.oliverbEngine.set_input_gain(0.0);
          this.oliverbEngine.set_decay(1.0);
          this.oliverbEngine.set_lp(1.0);
          this.oliverbEngine.set_hp(0.0);
        } else {
          // Normal mode: Density controls decay, texture controls tone
          // Original uses pitchSemitones / 24.0 (range 0-2 for ±48 semitones)
          this.oliverbEngine.set_decay(params.density * 1.3 + 0.15 * Math.abs(pitchSemitones) / 24.0);
          this.oliverbEngine.set_input_gain(0.5);

          // Texture: LP filter when < 0.5, HP filter when > 0.5
          let lp = params.texture < 0.5 ? params.texture * 2.0 : 1.0;
          let hp = params.texture > 0.5 ? (params.texture - 0.5) * 2.0 : 0.0;
          this.oliverbEngine.set_lp(0.03 + 0.9 * lp);
          this.oliverbEngine.set_hp(0.01 + 0.2 * hp);
        }

        // Process audio
        this.oliverbEngine.process(inputL, inputR, outputL, outputR, params);
        break;

      case 5: // Resonestor (Parasites modal synthesis)
        // Map Clouds parameters to Resonestor controls
        // pitch → set_pitch() (root note in semitones, -24 to +24)
        this.resonestorEngine.set_pitch(params.pitch * 12); // Convert octaves to semitones

        // size → set_chord() (chord table interpolation, 0-1)
        this.resonestorEngine.set_chord(params.size);

        // density → set_narrow() (resonance bandwidth/Q)
        // Original Parasites uses narrow=0.001 default - keep in safe range to prevent
        // output gain compensation (1.0 + 0.5 * narrow) from causing instability
        this.resonestorEngine.set_narrow(0.001 + params.density * 0.009); // 0.001 to 0.01 range

        // texture → set_damp() (high frequency damping)
        this.resonestorEngine.set_damp(0.3 + params.texture * 0.7); // 0.3-1.0 range

        // spread → set_spread_amount() (stereo spread of comb filters)
        this.resonestorEngine.set_spread_amount(params.stereoSpread);

        // feedback → set_feedback() - CLAMPED TO 0.95 MAX in engine!
        this.resonestorEngine.set_feedback(params.feedback);

        // freeze → set_freeze() (freeze voice switching)
        this.resonestorEngine.set_freeze(params.freeze);

        // trigger → set_trigger() (voice switch / burst trigger)
        // Use trigger parameter if available, otherwise use density > 0.9 as gate
        const triggerActive = params.trigger || (params.density > 0.9);
        this.resonestorEngine.set_trigger(triggerActive);

        // Additional parameters with sensible defaults
        this.resonestorEngine.set_burst_damp(0.5 + params.texture * 0.5); // Tie to texture
        this.resonestorEngine.set_burst_comb(0.7); // Fixed for consistent character
        this.resonestorEngine.set_burst_duration(0.3); // 30% of comb period
        this.resonestorEngine.set_stereo(params.stereoSpread); // Stereo width
        this.resonestorEngine.set_separation(0.0); // No L/R separation by default
        this.resonestorEngine.set_harmonicity(1.0); // Perfect harmonics
        this.resonestorEngine.set_distortion(0.0); // Clean by default

        // Input gain: Always feed input to resonators at full level
        // The dry/wet mix in the main processor controls what you hear
        this.resonestorEngine.set_input_gain(1.0);

        // Process audio
        this.resonestorEngine.process(inputL, inputR, outputL, outputR, params);
        break;

      default:
        // Fallback: silence (shouldn't happen)
        outputL.fill(0);
        outputR.fill(0);
        console.warn('[CloudsProcessor] Invalid mode:', this.mode);
    }
  }

  /**
   * Convert semitones to frequency ratio
   * @param {number} semitones - Semitone offset
   * @returns {number} Frequency ratio
   */
  semitonesToRatio(semitones) {
    return Math.pow(2.0, semitones / 12.0);
  }

  /**
   * Handle messages from main thread
   * @param {MessageEvent} event - Message event
   */
  handleMessage(event) {
    const { command, value } = event.data;

    switch (command) {
      case 'setMode':
        // Validate and set mode (0-5: Granular, WSOLA, Looping, Spectral, Oliverb, Resonestor)
        const newMode = Math.min(5, Math.max(0, Math.floor(value)));
        if (newMode !== this.mode) {
          this.mode = newMode;

          // Notify main thread of mode change
          this.port.postMessage({ event: 'modeChanged', value: newMode });
        }
        break;

      case 'setFreeze':
        // Toggle freeze state
        this.freeze = value === true;

        // CRITICAL: Clear feedback buffer immediately when freezing
        // This prevents feedback tail from playing during the slow freeze_lp transition
        // (coefficient 0.0005 takes several seconds to reach 1.0)
        if (this.freeze) {
          this.feedbackBufferL.fill(0);
          this.feedbackBufferR.fill(0);
        }

        // Freeze shared buffer directly (prevents writes in process())
        this.inputBuffer.setFreeze(this.freeze);

        // Notify engines that support freeze (updates internal frozen state)
        // Note: All engines share inputBuffer, so buffer.setFreeze is called multiple times
        // (redundant but harmless - CircularBuffer.setFreeze is idempotent)
        if (this.grainEngine.setFreeze) {
          this.grainEngine.setFreeze(this.freeze);
        }
        if (this.wsolaEngine.setFreeze) {
          this.wsolaEngine.setFreeze(this.freeze);
        }
        if (this.loopingDelayEngine.setFreeze) {
          this.loopingDelayEngine.setFreeze(this.freeze);
        }
        if (this.spectralEngine.setFreeze) {
          this.spectralEngine.setFreeze(this.freeze);
        }

        // Notify main thread
        this.port.postMessage({ event: 'freezeChanged', value: this.freeze });
        break;

      case 'resetBuffer':
        // Clear input buffer (fresh start)
        this.inputBuffer.clear();
        this.feedbackBufferL.fill(0);
        this.feedbackBufferR.fill(0);
        break;

      case 'trigger':
        // Clock sync trigger from main thread
        // For looping delay: locks loop duration to current write head (C++: looping_sample_player.h:62-68)
        // For WSOLA: triggers playback animation (C++: wsola_sample_player.h)
        if (this.loopingDelayEngine && this.loopingDelayEngine.trigger) {
          this.loopingDelayEngine.trigger();
        }
        // Set trigger state for WSOLA engine (consumed in next process frame)
        this.triggerActive = true;
        break;

      case 'setTriggerSync':
        // Enable/disable trigger sync mode for looping delay
        if (this.loopingDelayEngine && this.loopingDelayEngine.setTriggerEnabled) {
          this.loopingDelayEngine.setTriggerEnabled(value === true);
        }
        break;

      case 'setGrainQuality':
        // Set grain interpolation quality mode (zoh/linear/hermite)
        if (this.grainEngine && this.grainEngine.setQualityMode) {
          this.grainEngine.setQualityMode(value);
        }
        break;

      case 'setBufferQuality':
        // Set buffer storage quality mode (float32/int16/int8/mulaw)
        // This affects all engines that use the shared input buffer
        // WARNING: This will clear the buffer!
        if (this.inputBuffer && this.inputBuffer.setQuality) {
          this.inputBuffer.setQuality(value);
          // Also update any engines that have their own buffers
          if (this.grainEngine && this.grainEngine.buffer && this.grainEngine.buffer.setQuality) {
            this.grainEngine.buffer.setQuality(value);
          }
          if (this.loopingDelayEngine && this.loopingDelayEngine.buffer && this.loopingDelayEngine.buffer.setQuality) {
            this.loopingDelayEngine.buffer.setQuality(value);
          }
          // Notify main thread
          this.port.postMessage({ event: 'bufferQualityChanged', value: value });
        }
        break;

      case 'setLofiMode':
        // Enable/disable lo-fi mode (2x downsampling/upsampling)
        // Gives vintage, lo-fi character with reduced bandwidth
        this.lofiMode = value === true;
        if (this.lofiMode) {
          this.sampleRateConverter.reset();
        }
        this.port.postMessage({ event: 'lofiModeChanged', value: this.lofiMode });
        break;

      case 'setMonoMode':
        // Enable/disable mono mode (sums L+R, doubles buffer time)
        this.monoMode = value === true;
        this.port.postMessage({ event: 'monoModeChanged', value: this.monoMode });
        break;

      case 'getBufferData':
        // Return buffer data for visualisation
        this.sendBufferData();
        break;

      default:
        console.warn('[CloudsProcessor] Unknown command:', command);
    }
  }

  /**
   * Send buffer data to main thread for visualisation
   * Downsamples buffer to ~800 points for efficient transfer
   */
  sendBufferData() {
    const targetPoints = 800;
    let buffer = null;
    let writeHead = 0;
    let bufferSize = 0;
    let loopStart = 0;
    let loopEnd = 0;

    // Get buffer from active engine based on mode
    switch (this.mode) {
      case 0: // Granular
        if (this.grainEngine?.buffer) {
          buffer = this.grainEngine.buffer;
          writeHead = buffer.getWriteHead?.() || 0;
          bufferSize = buffer.getSize?.() || 262144;
        }
        break;

      case 1: // WSOLA
        if (this.wsolaEngine?.buffer) {
          buffer = this.wsolaEngine.buffer;
          writeHead = buffer.getWriteHead?.() || 0;
          bufferSize = buffer.getSize?.() || 262144;
        }
        break;

      case 2: // Looping delay
        if (this.loopingDelayEngine) {
          buffer = this.loopingDelayEngine.buffer;
          writeHead = this.loopingDelayEngine.getWriteHead?.() || 0;
          bufferSize = this.loopingDelayEngine.getBufferSize?.() || 262144;

          // Get loop region info
          const position = this.loopingDelayEngine.position ?? 0.5;
          const size = this.loopingDelayEngine.size_ ?? 0.5;
          const maxDelay = bufferSize - 64; // kCrossfadeDuration

          loopStart = position * position * maxDelay * (15.0 / 16.0) + 64;
          const loopDuration = (0.01 + 0.99 * size * size) * maxDelay;
          loopEnd = loopStart + loopDuration;
        }
        break;

      case 3: // Spectral
        if (this.spectralEngine?.buffer) {
          buffer = this.spectralEngine.buffer;
          writeHead = buffer.getWriteHead?.() || 0;
          bufferSize = buffer.getSize?.() || 262144;
        }
        break;

      case 4: // Oliverb
      case 5: // Resonestor
        // Send output waveform history instead of buffer
        {
          const targetPoints = 400;
          const waveform = new Float32Array(targetPoints);
          const step = this.outputHistorySize / targetPoints;

          // Read from ring buffer, starting from oldest sample
          for (let i = 0; i < targetPoints; i++) {
            const idx = (this.outputHistoryHead + Math.floor(i * step)) % this.outputHistorySize;
            waveform[i] = this.outputHistory[idx];
          }

          this.port.postMessage({
            event: 'bufferData',
            value: {
              waveform: Array.from(waveform),
              writeHead: 0,
              bufferSize: this.outputHistorySize,
              loopStart: 0,
              loopEnd: 0,
              frozen: this.freeze,
              isOutputWaveform: true, // Flag for visualisation styling
              modeName: this.mode === 4 ? 'OLIVERB' : 'RESONESTOR'
            }
          });
        }
        return;

      default:
        break;
    }

    // Mode name mapping for visualisation
    const modeNames = ['granular', 'wsola', 'looping', 'spectral', 'oliverb', 'resonestor'];
    const modeName = modeNames[this.mode] || 'granular';

    if (!buffer) {
      this.port.postMessage({
        event: 'bufferData',
        value: {
          waveform: [],
          writeHead: 0,
          bufferSize: 262144,
          loopStart: 0,
          loopEnd: 0,
          frozen: this.freeze,
          position: this.currentPosition ?? 0.5,
          modeName
        }
      });
      return;
    }

    // Downsample buffer for visualisation
    const waveform = new Float32Array(targetPoints);
    const step = bufferSize / targetPoints;

    for (let i = 0; i < targetPoints; i++) {
      const sampleIndex = Math.floor(i * step);
      // Read from left channel (channel 0)
      waveform[i] = buffer.readLinear?.(sampleIndex, 0) || buffer.read?.(sampleIndex, 0) || 0;
    }

    this.port.postMessage({
      event: 'bufferData',
      value: {
        waveform: Array.from(waveform), // Convert to regular array for transfer
        writeHead,
        bufferSize,
        loopStart,
        loopEnd,
        frozen: this.freeze,
        position: this.currentPosition ?? 0.5,
        modeName
      }
    });
  }
}

// Register processor with AudioWorklet (wrap in try-catch for hot reload)
try {
  registerProcessor('clouds-processor', CloudsProcessor);
} catch (e) {
  // Already registered - this happens during hot reload with cache busting
}
