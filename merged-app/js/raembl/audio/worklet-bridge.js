/**
 * WorkletBridge - Manages AudioWorkletNode pool, voice allocation, and parameter routing
 *
 * This bridge class manages the communication between the main thread and the
 * AudioWorklet voice processor. It handles:
 * - Pre-allocated pool of 8 AudioWorkletNode instances
 * - Voice allocation/deallocation (mono/poly modes)
 * - Parameter routing via AudioParams and MessagePort
 * - Integration with existing Ræmbl audio routing
 */

import { state } from '../state.js';
import { config } from '../config.js';
import { findScaleNote } from './voice.js';
import {
  generateDriftOffset,
  transpositionToSemitones,
  noteNameToMidi as pitchNoteToMidi,
  calculateFrequency
} from './pitch-preprocessing.js';

export class WorkletBridge {
  constructor(audioContext, destinations) {
    this.audioContext = audioContext;
    // Support both old single destination format and new multiple destinations
    if (destinations.masterGain) {
      // New format: object with masterGain, reverbSend, delaySend, drySignalTap
      this.masterGain = destinations.masterGain;
      this.reverbSend = destinations.reverbSend;
      this.delaySend = destinations.delaySend;
      this.drySignalTap = destinations.drySignalTap;
    } else {
      // Old format: single destination (masterGain only)
      this.masterGain = destinations;
      this.reverbSend = null;
      this.delaySend = null;
      this.drySignalTap = null;
    }
    this.nodes = []; // Array of AudioWorkletNode (8 voices)
    this.voicePool = []; // Voice allocation tracker [{active, releasing, nodeIndex, voiceId, midiNote, startTime, releaseEndTime, autoReleaseEndTime}...]
    this.NUM_VOICES = 8;
  }

  /**
   * Initialise the worklet bridge
   * Creates 8 AudioWorkletNode instances and sets up voice pool
   */
  async init() {

    for (let i = 0; i < this.NUM_VOICES; i++) {
      const node = new AudioWorkletNode(this.audioContext, 'raembl-voice-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: { voiceIndex: i }
      });

      // Connect to master gain and effects sends (parallel routing)
      node.connect(this.masterGain);

      // Connect to reverb and delay sends if available
      if (this.reverbSend) {
        node.connect(this.reverbSend);
      }
      if (this.delaySend) {
        node.connect(this.delaySend);
      }
      // Connect to dry signal tap for visualisations (analyser)
      if (this.drySignalTap) {
        node.connect(this.drySignalTap);
      }

      // Set initial default parameters
      node.parameters.get('gateSignal').value = 0; // Gate closed initially
      node.parameters.get('filterCutoff').value = 10000;
      node.parameters.get('filterResonance').value = 1;
      node.parameters.get('filterEnvAmount').value = 0;
      node.parameters.get('keyTracking').value = 0;
      node.parameters.get('hpfCutoff').value = 20;
      node.parameters.get('lfoRate').value = 4;
      node.parameters.get('lfoWave').value = 0;
      node.parameters.get('lfoToFilter').value = 0;
      node.parameters.get('lfoToPitch').value = 0;
      node.parameters.get('lfoToPWM').value = 0;
      node.parameters.get('pitchEnvAmount').value = 0;
      node.parameters.get('envToPWM').value = 0;
      node.parameters.get('drift').value = 0;
      node.parameters.get('glide').value = 0;
      node.parameters.get('octaveTranspose').value = 0;
      node.parameters.get('subOctaveTranspose').value = 0;
      node.parameters.get('outputLevel').value = 0.25;
      node.parameters.get('frequency').value = 440; // Default frequency (A4)

      this.nodes.push(node);
      this.voicePool.push({
        active: false,
        releasing: false,
        quickReleasing: false, // Fast fade-out before voice steal
        nodeIndex: i,
        voiceId: null,
        midiNote: 0,
        velocity: 1.0, // Track velocity for intelligent voice stealing
        isAccented: false, // Track accent for voice stealing priority
        engineType: 'subtractive', // Engine type: 'subtractive' | 'plaits' | 'rings'
        driftOffset: 0, // Cents offset for pitch drift (from pitch-preprocessing)
        startTime: 0,
        releaseEndTime: 0, // Audio context time when release completes (replaces setTimeout)
        autoReleaseEndTime: 0, // Audio context time when sequencer auto-release triggers (poly mode)
        quickReleaseEndTime: 0, // When quick release completes (for voice stealing)
        // Per-voice articulation tracking (Phase 7)
        shouldSlide: false,
        isTrill: false,
        trillTargetNote: null
      });
    }

  }

  /**
   * Check and clear voices that have finished releasing
   * Uses audio context time for precise, main-thread-independent release detection
   * Also handles sequencer auto-release for poly mode and quick-release for voice stealing
   */
  checkReleasedVoices() {
    const now = this.audioContext.currentTime;
    this.voicePool.forEach(voice => {
      // Check manual release completion
      if (voice.releasing && now >= voice.releaseEndTime) {
        voice.releasing = false;
        voice.voiceId = null;
      }

      // Check quick-release completion (voice stealing fade-out)
      if (voice.quickReleasing && now >= voice.quickReleaseEndTime) {
        voice.quickReleasing = false;
      }

      // Check auto-release scheduling (poly mode sequencer)
      if (voice.active && voice.autoReleaseEndTime > 0 && now >= voice.autoReleaseEndTime) {
        this.releaseVoiceByIndex(voice.nodeIndex);
        voice.autoReleaseEndTime = 0; // Clear scheduled release
      }
    });
  }

  /**
   * Trigger a note on an available voice
   * Handles voice allocation, mono/poly modes, and parameter setup
   */
  triggerNote(note, velocity, isAccented, shouldSlide, isTrill, audioTime, voiceId, stepIndex = -1) {
    // Clear any voices that have finished releasing (audio-thread accurate)
    this.checkReleasedVoices();
    let voiceIndex = -1;

    // MONO mode: Always use first voice
    if (state.monoMode) {
      voiceIndex = 0;

      // Clear any pending release from previous note
      const monoVoice = this.voicePool[0];
      if (monoVoice.releasing) {
        // Simply clear releasing flag (no timeout to cancel)
        monoVoice.releasing = false;
        monoVoice.releaseEndTime = 0;
      }
    }
    // POLY mode: Find available voice, preferring inactive over releasing/quickReleasing
    else {
      // First, try to find a completely inactive voice (not active, not releasing, not quickReleasing)
      let inactiveVoice = this.voicePool.find(v => !v.active && !v.releasing && !v.quickReleasing);

      if (inactiveVoice) {
        voiceIndex = inactiveVoice.nodeIndex;
      } else {
        // No fully inactive voices - try to find a releasing voice (natural fade-out in progress)
        let releasingVoice = this.voicePool.find(v => v.releasing && !v.quickReleasing);

        if (releasingVoice) {
          voiceIndex = releasingVoice.nodeIndex;
          // No timeout to cancel - audio-time tracking handles release completion
        } else {
          // Try to find a quickReleasing voice (steal-fade in progress)
          let quickReleasingVoice = this.voicePool.find(v => v.quickReleasing);

          if (quickReleasingVoice) {
            voiceIndex = quickReleasingVoice.nodeIndex;
          } else {
            // All voices active and sustaining - use intelligent voice stealing
            voiceIndex = this.findVoiceToSteal();
          }
        }
      }
    }

    if (voiceIndex === -1) {
      console.error('[WorkletBridge] No voice available for allocation');
      return null;
    }

    const node = this.nodes[voiceIndex];

    // Convert note name to MIDI number (e.g., "C3" -> 48)
    const midiNote = this.noteNameToMidi(note);
    const targetFreq = 440 * Math.pow(2, (midiNote - 69) / 12);

    // Get frequency AudioParam for pitch control
    const freqParam = node.parameters.get('frequency');

    // Apply accent to velocity if needed
    // Non-accented notes play at 50% velocity, accented at 100% - creates dramatic contrast
    const finalVelocity = isAccented ? velocity : velocity * 0.5;

    // PORTAMENTO: Classic glide between consecutive notes in mono mode
    // Triggers when: (1) explicit slide step from sequencer, OR (2) glide knob > 0
    // Check if voice is active OR releasing (still producing sound)
    const voiceIsProducingSound = this.voicePool[voiceIndex].active || this.voicePool[voiceIndex].releasing;
    const shouldPortamento = state.monoMode && voiceIsProducingSound && (shouldSlide || state.glide > 0);

    if (shouldPortamento) {
      // Use glide parameter from state (0-100) mapped to 0.001-1.0 seconds
      // Default to 80ms if glide is 0 (preserves TB-303 behaviour for sequencer slides)
      const slideTime = state.glide > 0
        ? (state.glide / 100) * 1.0 + 0.001  // 1ms to ~1s
        : 0.080;  // Default 80ms for pure sequencer slides
      const now = this.audioContext.currentTime;

      // Cancel any pending automation and ramp to new frequency
      freqParam.cancelScheduledValues(now);
      freqParam.setValueAtTime(freqParam.value, now); // Anchor current value
      freqParam.exponentialRampToValueAtTime(targetFreq, now + slideTime);


      // DON'T trigger gate - envelope continues from previous note (legato)
      // Gate stays high from previous note, no rising edge = no retrigger
      // DON'T send noteOn - envelope continues from previous note (legato)
      // But we DO need to mark the voice as active again and clear release state
      this.voicePool[voiceIndex].active = true;
      this.voicePool[voiceIndex].releasing = false;
      this.voicePool[voiceIndex].releaseEndTime = 0;
      this.voicePool[voiceIndex].midiNote = note;
      this.voicePool[voiceIndex].voiceId = voiceId;

      // Update lastActiveNote for mono mode filter keytracking
      config.lastActiveNote = note;

      return {
        id: voiceId,
        note: note,
        active: true,
        workletVoiceIndex: voiceIndex,
        isSlide: true
      };
    }

    // POLY MODE SLIDE: "Slide-into" effect (starts slightly flat, bends up to pitch)
    // Different from mono portamento - no previous note to slide from
    if (!state.monoMode && shouldSlide) {
      const now = audioTime || this.audioContext.currentTime;
      const slideIntoTime = 0.040; // 40ms slide-into time (half of mono's 80ms)
      const slideDetuneRatio = 0.97; // Start 3% flat (approx -50 cents)
      const startFreq = targetFreq * slideDetuneRatio;

      // Schedule slide-into: start flat, ramp to target
      freqParam.cancelScheduledValues(now);
      freqParam.setValueAtTime(startFreq, now);
      freqParam.exponentialRampToValueAtTime(targetFreq, now + slideIntoTime);

      // Continue to normal note triggering (don't return early - need gate pulse)
    }

    // TRILL: TB-303 style rapid pitch alternation (MONO and POLY modes)
    // In mono mode: classic TB-303 trill
    // In poly mode: per-voice independent trill
    if (isTrill) {
      // Find the trill target note (next scale degree up)
      const trillNoteStr = this.findScaleNoteForTrill(note);

      if (trillNoteStr) {
        const trillMidi = this.noteNameToMidi(trillNoteStr);
        const trillFreq = 440 * Math.pow(2, (trillMidi - 69) / 12);

        // Get step duration from config (swing-aware)
        const stepDurationSec = (config.currentMsPerStep || 125) / 1000;

        // Detect offbeat (odd step indices have shorter duration with swing)
        const isOffbeat = stepIndex >= 0 ? (stepIndex % 2) === 1 : false;

        // Schedule trill automation
        this.scheduleTrillAutomation(node, targetFreq, trillFreq, audioTime, stepDurationSec, isOffbeat);


        // Check if this is a retrigger (voice already active) - applies to both mono and poly
        const isRetriggerTrill = this.voicePool[voiceIndex].active && !this.voicePool[voiceIndex].releasing;

        // Send noteOn message FIRST to set up velocity/accent BEFORE gate triggers
        node.port.postMessage({
          type: 'noteOn',
          pitch: midiNote,
          velocity: finalVelocity,
          time: audioTime,
          drift: state.drift / 100,
          isTrill: true,
          isAccented: isAccented || false,
          retrigger: isRetriggerTrill // Flag for retriggering (mono and poly)
        });

        // Schedule trigger signal at precise audioTime (sample-accurate)
        // IMPORTANT: This must happen AFTER noteOn message to ensure velocity/accent are set
        const schedTime = audioTime || this.audioContext.currentTime;

        // MUTUAL EXCLUSION: Use retriggerSignal for mono mode, gateSignal for poly mode
        // (Same pattern as normal note path - lines 334-350)
        if (state.monoMode) {
          // MONO MODE: ONLY pulse retriggerSignal
          const retriggerParam = node.parameters.get('retriggerSignal');
          retriggerParam.cancelScheduledValues(this.audioContext.currentTime);
          retriggerParam.setValueAtTime(0, Math.max(0, schedTime - 0.001));
          retriggerParam.setValueAtTime(1, schedTime);
          retriggerParam.setValueAtTime(0, schedTime + 0.002);
        } else {
          // POLY MODE: ONLY pulse gateSignal
          const gateParam = node.parameters.get('gateSignal');
          gateParam.cancelScheduledValues(this.audioContext.currentTime);
          gateParam.setValueAtTime(0, Math.max(0, schedTime - 0.001));
          gateParam.setValueAtTime(1, schedTime);
        }


        // Generate drift offset for trill note
        const trillDriftOffset = generateDriftOffset(state.drift);

        // Update voice pool tracker with trill state
        this.voicePool[voiceIndex] = {
          active: true,
          releasing: false,
          quickReleasing: false,
          nodeIndex: voiceIndex,
          voiceId: voiceId,
          midiNote: note,
          velocity: finalVelocity,
          isAccented: isAccented,
          engineType: state.engineType || 'subtractive',
          driftOffset: trillDriftOffset,
          startTime: audioTime,
          releaseEndTime: 0,
          autoReleaseEndTime: 0,
          quickReleaseEndTime: 0,
          shouldSlide: false,
          isTrill: true,
          trillTargetNote: trillNoteStr
        };


        // Update lastActiveNote for mono mode filter keytracking
        config.lastActiveNote = note;

        return {
          id: voiceId,
          note: note,
          active: true,
          workletVoiceIndex: voiceIndex,
          isTrill: true,
          driftOffset: trillDriftOffset
        };
      } else {
        console.warn(`[WorkletBridge] Could not find trill target for note ${note}, playing normal note`);
        // Fall through to normal note handling
      }
    }

    // NORMAL NOTE (or trill target not found)
    // Schedule frequency change at the SAME TIME as the trigger (not immediately!)
    // This prevents the pitch-before-envelope-reset flam in mono mode
    const schedTime = audioTime || this.audioContext.currentTime;

    // Skip frequency scheduling if poly slide already set up the ramp
    const polySlideApplied = !state.monoMode && shouldSlide;
    if (!polySlideApplied) {
      freqParam.cancelScheduledValues(this.audioContext.currentTime);
      freqParam.setValueAtTime(targetFreq, schedTime); // Frequency changes when trigger fires
    }

    // Send noteOn message FIRST to set up velocity/accent BEFORE trigger
    node.port.postMessage({
      type: 'noteOn',
      pitch: midiNote,
      velocity: finalVelocity,
      time: audioTime,
      drift: state.drift / 100, // Pass current drift (0-1)
      isTrill: isTrill || false,
      isAccented: isAccented || false,
      monoMode: state.monoMode
    });

    // Schedule trigger signal at precise audioTime (sample-accurate)
    // (schedTime already defined above for frequency scheduling)
    const now = this.audioContext.currentTime;

    // MUTUAL EXCLUSION: Only pulse ONE signal per mode to prevent race condition
    // The processor triggers on EITHER rising edge, so only one must be pulsed
    if (state.monoMode) {
      // MONO MODE: ONLY pulse retriggerSignal, NEVER touch gate
      const retriggerParam = node.parameters.get('retriggerSignal');
      retriggerParam.cancelScheduledValues(now);
      // Ensure signal is at 0 before the pulse (5ms before to be safe)
      retriggerParam.setValueAtTime(0, Math.max(now, schedTime - 0.005));
      // Rising edge at schedTime
      retriggerParam.setValueAtTime(1, schedTime);
      // Keep high for 5ms to ensure detection, then return to 0
      retriggerParam.setValueAtTime(0, schedTime + 0.005);
    } else {
      // POLY MODE: ONLY pulse gateSignal, NEVER touch retrigger
      const gateParam = node.parameters.get('gateSignal');
      gateParam.cancelScheduledValues(now);
      gateParam.setValueAtTime(0, Math.max(now, schedTime - 0.005));
      gateParam.setValueAtTime(1, schedTime);
      // Keep high until noteOff (no auto-reset for poly)
    }


    // Generate drift offset using pitch preprocessing
    const driftOffset = generateDriftOffset(state.drift);

    // Update voice pool tracker with full state
    this.voicePool[voiceIndex] = {
      active: true,
      releasing: false,
      quickReleasing: false,
      nodeIndex: voiceIndex,
      voiceId: voiceId,
      midiNote: note,
      velocity: finalVelocity,
      isAccented: isAccented,
      engineType: state.engineType || 'subtractive',
      driftOffset: driftOffset,
      startTime: audioTime,
      releaseEndTime: 0,
      autoReleaseEndTime: 0,
      quickReleaseEndTime: 0,
      shouldSlide: shouldSlide,
      isTrill: isTrill,
      trillTargetNote: null
    };


    // Update lastActiveNote for mono mode filter keytracking
    if (state.monoMode) {
      config.lastActiveNote = note;
    }

    // Return voice object compatible with existing code
    return {
      id: voiceId,
      note: note,
      active: true,
      workletVoiceIndex: voiceIndex,
      driftOffset: driftOffset
    };
  }

  /**
   * Release a voice by ID
   * Sends noteOff message to the worklet and schedules cleanup after release time
   */
  releaseVoice(voiceId, releaseTimeSec) {
    // In mono mode, if the voiceId doesn't match the current voice, just ignore the release
    // This happens when rapid notes retrigger the same voice before previous releases arrive
    const voice = this.voicePool.find(v => v.active && v.voiceId === voiceId);
    if (!voice) {
      // This is normal in mono mode when notes retrigger quickly
      return;
    }

    const node = this.nodes[voice.nodeIndex];
    const now = this.audioContext.currentTime;

    // Send noteOff message
    node.port.postMessage({
      type: 'noteOff',
      time: now
    });

    // Close gate to signal release (falling edge)
    const gateParam = node.parameters.get('gateSignal');
    gateParam.setValueAtTime(0, now);

    // Mark voice as releasing (not active, but not fully inactive yet)
    voice.active = false;
    voice.releasing = true;

    // Calculate release time from state if not provided
    if (releaseTimeSec === undefined) {
      // Map state.release (0-100) to time (0.001-2.0s) using same formula as faderState.js
      const mapRange = (value, inMin, inMax, outMin, outMax) => {
        return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
      };
      releaseTimeSec = mapRange(state.release, 0, 100, 0.001, 2.0);
    }

    // Set audio context time when release will complete (audio-thread accurate)
    voice.releaseEndTime = now + releaseTimeSec + 0.1; // Add 100ms buffer

  }

  /**
   * Release a voice by pool index (for sequencer auto-release)
   * More reliable than voiceId lookup since the pool slot is stable
   */
  releaseVoiceByIndex(voiceIndex) {
    if (voiceIndex < 0 || voiceIndex >= this.voicePool.length) {
      console.warn(`[WorkletBridge] releaseVoiceByIndex: invalid index ${voiceIndex}`);
      return;
    }

    const voice = this.voicePool[voiceIndex];
    if (!voice.active) {
      // Voice already released or was reused - this is expected in fast sequences
      return;
    }

    const node = this.nodes[voiceIndex];
    const now = this.audioContext.currentTime;

    // Send noteOff message
    node.port.postMessage({
      type: 'noteOff',
      time: now
    });

    // Close gate to signal release (falling edge)
    const gateParam = node.parameters.get('gateSignal');
    gateParam.setValueAtTime(0, now);

    // Mark voice as releasing (not active, but not fully inactive yet)
    voice.active = false;
    voice.releasing = true;

    // Calculate release time from state
    const mapRange = (value, inMin, inMax, outMin, outMax) => {
      return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    };
    const releaseTimeSec = mapRange(state.release, 0, 100, 0.001, 2.0);

    // Set audio context time when release will complete (audio-thread accurate)
    voice.releaseEndTime = now + releaseTimeSec + 0.1; // Add 100ms buffer

  }

  /**
   * Schedule auto-release for sequencer (poly mode)
   * Uses audio context time for precise, main-thread-independent scheduling
   * @param {number} voiceIndex - Voice pool index
   * @param {number} audioTime - Audio context time when release should trigger
   */
  scheduleAutoRelease(voiceIndex, audioTime) {
    if (voiceIndex < 0 || voiceIndex >= this.voicePool.length) {
      console.warn(`[WorkletBridge] scheduleAutoRelease: invalid index ${voiceIndex}`);
      return;
    }

    const voice = this.voicePool[voiceIndex];
    voice.autoReleaseEndTime = audioTime;

  }

  /**
   * Release all active voices
   * Used for panic/stop all functionality and mono mode voice changes
   */
  releaseAllVoices() {
    const now = this.audioContext.currentTime;

    // Directly release all voices regardless of state (for panic/stop)
    this.voicePool.forEach((voice, index) => {
      const node = this.nodes[index];

      // Send noteOff message to ensure release
      node.port.postMessage({
        type: 'noteOff',
        time: now
      });

      // Reset BOTH gate signals to ensure clean state
      const gateParam = node.parameters.get('gateSignal');
      const retriggerParam = node.parameters.get('retriggerSignal');
      gateParam.cancelScheduledValues(now);
      gateParam.setValueAtTime(0, now);
      retriggerParam.cancelScheduledValues(now);
      retriggerParam.setValueAtTime(0, now);

      // Cancel any pending frequency automation
      const freqParam = node.parameters.get('frequency');
      freqParam.cancelScheduledValues(now);

      // Mark voice as inactive
      voice.active = false;
      voice.releasing = false; // Not releasing, just stopped
      voice.voiceId = null;
    });
  }

  /**
   * Update global AudioParams across all nodes
   * e.g., filterCutoff, resonance, lfoRate
   */
  updateAllParameters(params) {
    if (!params || typeof params !== 'object') return;

    const now = this.audioContext.currentTime;

    this.nodes.forEach(node => {
      Object.keys(params).forEach(paramName => {
        const audioParam = node.parameters.get(paramName);
        if (audioParam) {
          try {
            // Use setTargetAtTime for smooth parameter changes
            audioParam.setTargetAtTime(params[paramName], now, 0.015);
          } catch (e) {
            console.warn(`[WorkletBridge] Error setting parameter ${paramName}:`, e);
          }
        } else {
          console.warn(`[WorkletBridge] AudioParam '${paramName}' not found on worklet node`);
        }
      });
    });
  }

  /**
   * Send MessagePort update to all nodes
   * e.g., setOscMix, setEnvelope
   */
  updateAllVoices(message) {
    if (!message || typeof message !== 'object') return;

    this.nodes.forEach(node => {
      try {
        node.port.postMessage(message);
      } catch (e) {
        console.warn('[WorkletBridge] Error sending message to worklet:', e);
      }
    });
  }

  /**
   * Update parameters on a specific voice's node by voiceId
   * Used for per-voice modulation in poly mode
   * Includes releasing voices so modulation continues through release phase
   */
  updateVoiceParameters(voiceId, params) {
    if (!params || typeof params !== 'object') return;

    const voice = this.voicePool.find(v => (v.active || v.releasing) && v.voiceId === voiceId);
    if (!voice) return;

    const node = this.nodes[voice.nodeIndex];
    if (!node) return;

    const now = this.audioContext.currentTime;

    Object.keys(params).forEach(paramName => {
      const audioParam = node.parameters.get(paramName);
      if (audioParam) {
        try {
          audioParam.setTargetAtTime(params[paramName], now, 0.005);
        } catch (e) {
          console.warn(`[WorkletBridge] Error setting voice parameter ${paramName}:`, e);
        }
      }
    });
  }

  /**
   * Get array of active/releasing voices with their voiceId and nodeIndex
   * Used for per-voice modulation iteration
   * Includes releasing voices so modulation continues through release phase
   */
  getActiveVoices() {
    return this.voicePool
      .filter(v => v.active || v.releasing)
      .map(v => ({
        voiceId: v.voiceId,
        nodeIndex: v.nodeIndex,
        midiNote: v.midiNote
      }));
  }

  /**
   * Schedule trill automation on frequency AudioParam
   * Creates pitch oscillation between base and trill frequencies
   */
  scheduleTrillAutomation(node, baseFreq, trillFreq, audioTime, stepDurationSec, isOffbeat = false) {
    const freqParam = node.parameters.get('frequency');

    // Trill timing: use 2-fold division for offbeats (shorter), 3-fold for downbeats (longer)
    const numSegments = isOffbeat ? 2 : 3;
    const segmentDuration = stepDurationSec / numSegments;
    const holdPortion = segmentDuration * 0.25;
    const slidePortion = segmentDuration * 0.70;

    // Cancel any existing automation
    freqParam.cancelScheduledValues(audioTime);

    // Schedule trill: base → up → base
    let t = audioTime;

    // 1. Start at base
    freqParam.setValueAtTime(baseFreq, t);

    // 2. Hold at base
    t += holdPortion;
    freqParam.setValueAtTime(baseFreq, t);

    // 3. Ramp to upper note
    t += slidePortion;
    freqParam.exponentialRampToValueAtTime(trillFreq, t);

    // 4. Hold at upper
    t += holdPortion;
    freqParam.setValueAtTime(trillFreq, t);

    // 5. Ramp back to base
    t += slidePortion;
    freqParam.exponentialRampToValueAtTime(baseFreq, t);

    // 6. Settle at base
    freqParam.setValueAtTime(baseFreq, t + 0.001);

  }

  /**
   * Find trill target note (next scale degree up)
   * Uses findScaleNote from voice.js which has access to state.scale and state.root
   */
  findScaleNoteForTrill(noteStr) {
    try {
      return findScaleNote(noteStr, 1); // +1 = next scale degree up
    } catch (e) {
      console.warn('[WorkletBridge] Could not find scale note for trill:', e);
      return null;
    }
  }

  /**
   * Convert note name to MIDI number
   * e.g., "C3" -> 48, "A4" -> 69
   */
  noteNameToMidi(noteName) {
    if (typeof noteName === 'number') return noteName; // Already a MIDI number

    const noteMap = { 'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11 };

    const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
    if (!match) {
      console.warn(`[WorkletBridge] Invalid note name: ${noteName}`);
      return 60; // Default to middle C
    }

    const [, note, octave] = match;
    const midiNote = (parseInt(octave) + 1) * 12 + noteMap[note];
    return midiNote;
  }

  /**
   * Find the best voice to steal using intelligent scoring
   * Considers: age, velocity, accent, and bass note protection
   * @returns {number} Voice index to steal
   */
  findVoiceToSteal() {
    const now = this.audioContext.currentTime;

    // Calculate stealability scores for all active voices
    const scores = this.voicePool
      .filter(v => v.active && !v.releasing && !v.quickReleasing)
      .map(v => {
        const age = now - v.startTime; // Older = more stealable
        const velocityInverse = 1.0 - v.velocity; // Quieter = more stealable
        const accentPenalty = v.isAccented ? -2.0 : 0; // Protect accented notes

        // Bass note protection (MIDI < 48 = below C3)
        const midiNote = this.noteNameToMidi(v.midiNote);
        const bassPenalty = midiNote < 48 ? -0.3 : 0;

        // Weighted score (higher = more stealable)
        const score = (age * 1.0) + (velocityInverse * 0.5) + accentPenalty + bassPenalty;

        return { voice: v, score };
      });

    // Sort by score (highest = most stealable)
    scores.sort((a, b) => b.score - a.score);

    if (scores.length > 0) {
      return scores[0].voice.nodeIndex;
    }

    // Fallback to oldest voice if no scores calculated
    let oldestVoice = this.voicePool[0];
    for (let i = 1; i < this.voicePool.length; i++) {
      if (this.voicePool[i].startTime < oldestVoice.startTime) {
        oldestVoice = this.voicePool[i];
      }
    }
    return oldestVoice.nodeIndex;
  }

  /**
   * Get current engine type for the synth
   * @returns {string} Engine type: 'subtractive' | 'plaits' | 'rings'
   */
  getEngineType() {
    return state.engineType || 'subtractive';
  }

  /**
   * Switch engine type - triggers quick release on all active voices
   * @param {string} engineType - New engine type
   */
  switchEngine(engineType) {
    if (state.engineType === engineType) return;

    // Quick release all active voices before engine switch
    const now = this.audioContext.currentTime;
    const quickReleaseTime = 0.008; // 8ms fade-out

    this.voicePool.forEach((voice, index) => {
      if (voice.active && !voice.releasing) {
        const node = this.nodes[index];
        const outputParam = node.parameters.get('outputLevel');

        // Ramp to zero over 8ms
        outputParam.cancelScheduledValues(now);
        outputParam.setValueAtTime(outputParam.value, now);
        outputParam.linearRampToValueAtTime(0, now + quickReleaseTime);

        // Mark as quick-releasing
        voice.active = false;
        voice.quickReleasing = true;
        voice.quickReleaseEndTime = now + quickReleaseTime;
      }
    });

    // Update state (UI will react to this change)
    state.engineType = engineType;
  }
}
