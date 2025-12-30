/**
 * RingsVoicePool - Manages Rings AudioWorklet voices
 *
 * This class manages the Rings physical modelling resonator as an alternative
 * engine. The Rings processor handles its own 4-voice polyphony internally,
 * so this pool manages a single AudioWorkletNode.
 *
 * @module rings-voice-pool
 */

import { state } from '../state.js';
import { generateDriftOffset, noteNameToMidi, transpositionToSemitones } from './pitch-preprocessing.js';
import { findScaleNote } from './voice.js';

/**
 * Resonator model definitions
 */
export const RINGS_MODELS = [
  { index: 0, name: 'Modal', description: '64-mode SVF bank resonator' },
  { index: 1, name: 'Sympathetic', description: '8 coupled strings' },
  { index: 2, name: 'String', description: 'Karplus-Strong with dispersion' },
  { index: 3, name: 'FM Voice', description: 'FM synthesis with follower' },
  { index: 4, name: 'Sympathetic Q', description: 'Quantised sympathetic strings' },
  { index: 5, name: 'String+Reverb', description: 'String model + built-in reverb' }
];

/**
 * FX types for Easter Egg mode (Disastrous Peace)
 */
export const RINGS_FX_TYPES = {
  FORMANT: 0,
  CHORUS: 1,
  REVERB: 2,
  FORMANT2: 3,
  ENSEMBLE: 4,
  REVERB2: 5
};

export class RingsVoicePool {
  constructor(audioContext, destinations) {
    this.audioContext = audioContext;
    this.masterGain = destinations.masterGain;
    this.reverbSend = destinations.reverbSend;
    this.delaySend = destinations.delaySend;
    this.drySignalTap = destinations.drySignalTap;

    this.node = null; // Single AudioWorkletNode (processor handles 4 internal voices)
    this.isInitialised = false;
    this.currentModel = 0;
    this.lastNote = null; // For slide tracking
    this.easterEggEnabled = false;

    // Voice tracking (mirrors processor's internal state)
    this.activeNotes = new Map(); // Map<midiNote, {voiceId, startTime, velocity, isAccented}>
  }

  /**
   * Initialise the Rings AudioWorklet
   */
  async init() {
    if (this.isInitialised) return;

    try {
      // Load the Rings processor bundle with cache busting
      await this.audioContext.audioWorklet.addModule(
        `js/audio/worklets/rings-processor.bundle.js?v=${Date.now()}`
      );

      // Create single AudioWorkletNode
      this.node = new AudioWorkletNode(this.audioContext, 'rings-processor', {
        numberOfInputs: 1, // Rings has external excitation input
        numberOfOutputs: 1,
        outputChannelCount: [2],
        processorOptions: {
          sampleRate: this.audioContext.sampleRate
        }
      });

      // Connect to audio routing based on current FX mode
      if (state.fxMode === 'clouds') {
        // In Clouds mode, route to Clouds input
        this.node.connect(this.masterGain);
      } else {
        // Classic mode: connect to master + reverb/delay sends
        this.node.connect(this.masterGain);
        if (this.reverbSend) this.node.connect(this.reverbSend);
        if (this.delaySend) this.node.connect(this.delaySend);
      }
      if (this.drySignalTap) this.node.connect(this.drySignalTap);

      // Set up message handling
      this.node.port.onmessage = (e) => this.handleProcessorMessage(e.data);

      // Set initial model
      this.setModel(state.ringsModel || 0);

      this.isInitialised = true;
      console.log('[RingsVoicePool] Initialised with 6 resonator models');
    } catch (error) {
      console.error('[RingsVoicePool] Failed to initialise:', error);
      throw error;
    }
  }

  /**
   * Handle messages from the processor
   */
  handleProcessorMessage(data) {
    switch (data.event) {
      case 'modelChanged':
        this.currentModel = data.value;
        document.dispatchEvent(new CustomEvent('ringsModelChanged', {
          detail: { model: data.value, name: RINGS_MODELS[data.value]?.name }
        }));
        break;
      case 'polyphonyChanged':
        console.log(`[RingsVoicePool] Polyphony: ${data.value}`);
        break;
      case 'easterEggChanged':
        this.easterEggEnabled = data.value;
        console.log(`[RingsVoicePool] Easter egg: ${data.value ? 'ON' : 'OFF'}`);
        break;
      case 'debug':
        console.log(`[RingsProcessor] ${data.value}`);
        break;
    }
  }

  /**
   * Trigger a note
   * Implements slide/trill using pitchBend via message (Rings doesn't have AudioParam for pitch)
   */
  triggerNote(note, velocity, isAccented, shouldSlide, isTrill, audioTime, voiceId, stepIndex = -1) {
    if (!this.isInitialised) return null;

    const midiNote = noteNameToMidi(note);
    const currentTime = this.audioContext.currentTime;
    const scheduledTime = audioTime || currentTime;

    // Apply accent velocity boost (same as other engines)
    const finalVelocity = isAccented ? Math.min(1.0, velocity * 1.5) : velocity * 0.5;

    // Generate drift offset
    const driftOffset = generateDriftOffset(state.drift);
    const octaveOffset = transpositionToSemitones(state.mainTransposition || 4);
    const basePitchBend = octaveOffset + (driftOffset / 100); // in semitones

    // Calculate step duration for trill timing
    const bpm = state.bpm || 120;
    const stepsPerBar = state.steps || 16;
    const beatsPerBar = state.barLength || 4;
    const stepDurationSec = (60 / bpm) * (beatsPerBar / stepsPerBar);
    const isOffbeat = stepIndex >= 0 && (stepIndex % 2 === 1);

    // Determine if we should do mono-style slide (requires previous note)
    const lastMidiNote = this.lastNote ? noteNameToMidi(this.lastNote) : null;
    const voiceIsProducingSound = this.activeNotes.size > 0 || this.lastNote !== null;
    const shouldMonoSlide = state.monoMode && voiceIsProducingSound && (shouldSlide || state.glide > 0) && lastMidiNote !== null;

    // === TRILL HANDLING ===
    if (isTrill) {
      // Find trill target note (next scale degree up)
      const trillNoteStr = this.findTrillTarget(note);

      if (trillNoteStr) {
        const trillMidiNote = noteNameToMidi(trillNoteStr);
        const trillSemitones = trillMidiNote - midiNote;

        // Schedule trill automation via setTimeout (Rings uses message-based pitch)
        this.scheduleTrillMessages(midiNote, basePitchBend, basePitchBend + trillSemitones, scheduledTime, stepDurationSec, isOffbeat, finalVelocity);
      } else {
        // No trill target found, just play note normally
        this.sendPitchBend(basePitchBend);
        this.scheduleNoteOn(midiNote, finalVelocity, scheduledTime, currentTime);
      }
    }
    // === MONO SLIDE HANDLING ===
    else if (shouldMonoSlide) {
      const semitoneDiff = midiNote - lastMidiNote;
      const slideTime = state.glide > 0 ? (state.glide / 100) * 0.5 : 0.080;

      // Animate pitch bend from previous to new note
      this.scheduleSlideAnimation(basePitchBend - semitoneDiff, basePitchBend, scheduledTime, slideTime);
      this.scheduleNoteOn(midiNote, finalVelocity, scheduledTime, currentTime);
    }
    // === POLY SLIDE (slide-into effect) ===
    else if (!state.monoMode && shouldSlide) {
      const slideIntoTime = 0.040;
      const slideDetuneAmount = -0.5;

      this.scheduleSlideAnimation(basePitchBend + slideDetuneAmount, basePitchBend, scheduledTime, slideIntoTime);
      this.scheduleNoteOn(midiNote, finalVelocity, scheduledTime, currentTime);
    }
    // === NORMAL NOTE ===
    else {
      this.sendPitchBend(basePitchBend);
      this.scheduleNoteOn(midiNote, finalVelocity, scheduledTime, currentTime);
    }

    // Track notes
    this.lastNote = note;
    this.lastMidiNote = midiNote;
    this.activeNotes.set(midiNote, {
      voiceId,
      startTime: scheduledTime,
      velocity: finalVelocity,
      isAccented,
      isTrill
    });

    return {
      id: voiceId,
      note: note,
      active: true,
      engineType: 'rings',
      model: this.currentModel,
      driftOffset,
      isTrill
    };
  }

  /**
   * Schedule trill via message-based pitch bend
   */
  scheduleTrillMessages(midiNote, basePitch, trillPitch, audioTime, stepDurationSec, isOffbeat, velocity) {
    const currentTime = this.audioContext.currentTime;
    const numSegments = isOffbeat ? 2 : 3;
    const segmentDuration = stepDurationSec / numSegments;
    const holdPortion = segmentDuration * 0.25;
    const slidePortion = segmentDuration * 0.70;

    // Schedule the note on first
    this.scheduleNoteOn(midiNote, velocity, audioTime, currentTime);

    // Then schedule pitch changes
    const scheduleAt = (delayMs, pitch) => {
      setTimeout(() => {
        this.sendPitchBend(pitch);
      }, Math.max(0, (audioTime - currentTime) * 1000 + delayMs));
    };

    let t = 0;

    // 1. Start at base
    scheduleAt(t, basePitch);

    // 2. After hold, ramp to upper
    t += holdPortion * 1000;
    scheduleAt(t + slidePortion * 500, trillPitch); // Mid-slide

    t += slidePortion * 1000;
    scheduleAt(t, trillPitch);

    // 3. After hold at upper, ramp back
    t += holdPortion * 1000;
    scheduleAt(t + slidePortion * 500, basePitch); // Mid-slide back

    t += slidePortion * 1000;
    scheduleAt(t, basePitch);
  }

  /**
   * Schedule slide animation via messages
   */
  scheduleSlideAnimation(startPitch, endPitch, audioTime, durationSec) {
    const currentTime = this.audioContext.currentTime;
    const delayMs = (audioTime - currentTime) * 1000;
    const steps = 10;
    const stepDurationMs = (durationSec * 1000) / steps;

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Exponential interpolation
      const pitch = startPitch + (endPitch - startPitch) * (1 - Math.exp(-3 * t));

      setTimeout(() => {
        this.sendPitchBend(pitch);
      }, Math.max(0, delayMs + i * stepDurationMs));
    }
  }

  /**
   * Send pitch bend message
   */
  sendPitchBend(semitones) {
    if (!this.isInitialised) return;

    this.node.port.postMessage({
      type: 'pitchBend',
      value: semitones
    });
  }

  /**
   * Find trill target note (next scale degree up)
   */
  findTrillTarget(noteStr) {
    try {
      return findScaleNote(noteStr, 1); // +1 = next scale degree up
    } catch (e) {
      console.warn('[RingsVoicePool] Could not find scale note for trill:', e);
      return null;
    }
  }

  /**
   * Schedule noteOn message with timing compensation
   */
  scheduleNoteOn(midiNote, velocity, scheduledTime, currentTime) {
    const MESSAGE_LATENCY_COMPENSATION = 0.005; // 5ms
    const targetTime = scheduledTime - MESSAGE_LATENCY_COMPENSATION;
    const delaySeconds = targetTime - currentTime;

    const sendNoteOn = () => {
      this.node.port.postMessage({
        type: 'noteOn',
        note: midiNote,
        velocity: velocity
      });
    };

    if (delaySeconds > 0.002) {
      const delayMs = delaySeconds * 1000;
      setTimeout(() => {
        const target = this.audioContext.currentTime + MESSAGE_LATENCY_COMPENSATION;
        while (this.audioContext.currentTime < target - 0.001) {
          // Spin for precision
        }
        sendNoteOn();
      }, Math.max(0, delayMs - 2));
    } else {
      sendNoteOn();
    }
  }

  /**
   * Trigger strum excitation (Rings-specific)
   */
  strum(velocity = 1.0) {
    if (!this.isInitialised) return;

    this.node.port.postMessage({
      type: 'strum',
      velocity: velocity
    });
  }

  /**
   * Release a note
   */
  releaseNote(note) {
    if (!this.isInitialised) return;

    const midiNote = noteNameToMidi(note);

    this.node.port.postMessage({
      type: 'noteOff',
      note: midiNote
    });

    this.activeNotes.delete(midiNote);
  }

  /**
   * Release all notes
   */
  releaseAllNotes() {
    if (!this.isInitialised) return;

    for (const midiNote of this.activeNotes.keys()) {
      this.node.port.postMessage({
        type: 'noteOff',
        note: midiNote
      });
    }

    this.activeNotes.clear();
  }

  /**
   * Set the resonator model (0-5)
   */
  setModel(modelIndex) {
    if (!this.isInitialised) {
      this.currentModel = modelIndex;
      return;
    }

    modelIndex = Math.max(0, Math.min(5, Math.floor(modelIndex)));
    this.node.port.postMessage({
      type: 'setModel',
      value: modelIndex
    });
    this.currentModel = modelIndex;
    state.ringsModel = modelIndex;
  }

  /**
   * Set polyphony (1-4 voices)
   */
  setPolyphony(count) {
    if (!this.isInitialised) return;

    this.node.port.postMessage({
      type: 'setPolyphony',
      value: Math.max(1, Math.min(4, count))
    });
  }

  /**
   * Toggle Easter Egg mode (Disastrous Peace string synth)
   */
  setEasterEgg(enabled) {
    if (!this.isInitialised) return;

    this.node.port.postMessage({
      type: 'setEasterEgg',
      value: enabled
    });
    this.easterEggEnabled = enabled;
  }

  /**
   * Set FX type for Easter Egg mode
   */
  setFxType(fxType) {
    if (!this.isInitialised) return;

    this.node.port.postMessage({
      type: 'setFxType',
      value: fxType
    });
  }

  /**
   * Update parameters (structure, brightness, damping, position)
   */
  updateParameters(params) {
    if (!this.isInitialised || !this.node) return;

    const now = this.audioContext.currentTime;

    for (const [paramName, value] of Object.entries(params)) {
      const audioParam = this.node.parameters.get(paramName);
      if (audioParam) {
        audioParam.setTargetAtTime(value, now, 0.015);
      }
    }
  }

  /**
   * Update pitch bend in realtime (for octave/drift changes)
   * Called when OCT or DRIFT fader changes
   */
  updatePitchBend() {
    if (!this.isInitialised) return;

    // Recalculate pitch bend with current octave and a base drift (no new random offset)
    const octaveOffset = transpositionToSemitones(state.mainTransposition || 4);
    this.sendPitchBend(octaveOffset);
  }

  /**
   * Set octave transpose (in semitones, for realtime OCT fader changes)
   * @param {number} semitones - Octave offset in semitones
   */
  setOctaveTranspose(semitones) {
    if (!this.isInitialised) return;

    this.sendPitchBend(semitones);
  }

  /**
   * Get model info
   */
  getModelInfo(modelIndex = null) {
    const index = modelIndex ?? this.currentModel;
    return RINGS_MODELS[index] || RINGS_MODELS[0];
  }

  /**
   * Check if pool is ready
   */
  isReady() {
    return this.isInitialised && this.node !== null;
  }

  /**
   * Cleanup
   */
  dispose() {
    if (this.node) {
      this.node.disconnect();
      this.node = null;
    }
    this.isInitialised = false;
    this.activeNotes.clear();
  }
}
