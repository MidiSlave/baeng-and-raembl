/**
 * PlaitsVoicePool - Manages Plaits AudioWorklet voices
 *
 * REFACTORED: 8 separate AudioWorkletNodes (one per voice)
 * Following the SUB engine pattern from worklet-bridge.js
 * Enables per-voice PPMod routing via compound keys
 *
 * @module plaits-voice-pool
 */

import { state } from '../state.js';
import { generateDriftOffset, noteNameToMidi, calculateFrequency, transpositionToSemitones } from './pitch-preprocessing.js';
import { findScaleNote } from './voice.js';

/**
 * Engine bank definitions
 */
export const PLAITS_BANKS = {
  GREEN: { start: 0, end: 7, name: 'Pitched/Harmonic' },
  RED: { start: 8, end: 15, name: 'Noise/Physical' },
  ORANGE: { start: 16, end: 23, name: 'Classic/FM' }
};

/**
 * Engine names and status
 */
export const PLAITS_ENGINES = [
  // GREEN (0-7)
  { index: 0, name: 'Virtual Analog', bank: 'GREEN', status: 'experimental' },
  { index: 1, name: 'Waveshaping', bank: 'GREEN', status: 'experimental' },
  { index: 2, name: 'FM', bank: 'GREEN', status: 'ready' },
  { index: 3, name: 'Grain', bank: 'GREEN', status: 'ready' },
  { index: 4, name: 'Additive', bank: 'GREEN', status: 'ready' },
  { index: 5, name: 'Wavetable', bank: 'GREEN', status: 'experimental' },
  { index: 6, name: 'Chord', bank: 'GREEN', status: 'ready' },
  { index: 7, name: 'Speech', bank: 'GREEN', status: 'ready' },
  // RED (8-15)
  { index: 8, name: 'Swarm', bank: 'RED', status: 'ready' },
  { index: 9, name: 'Noise', bank: 'RED', status: 'ready' },
  { index: 10, name: 'Particle', bank: 'RED', status: 'ready' },
  { index: 11, name: 'String', bank: 'RED', status: 'ready' },
  { index: 12, name: 'Modal', bank: 'RED', status: 'partial' },
  { index: 13, name: 'Bass Drum', bank: 'RED', status: 'partial' },
  { index: 14, name: 'Snare Drum', bank: 'RED', status: 'ready' },
  { index: 15, name: 'Hi-Hat', bank: 'RED', status: 'ready' },
  // ORANGE (16-23)
  { index: 16, name: 'VA-VCF', bank: 'ORANGE', status: 'experimental' },
  { index: 17, name: 'Phase Distortion', bank: 'ORANGE', status: 'ready' },
  { index: 18, name: 'Six-Op FM 1', bank: 'ORANGE', status: 'partial' },
  { index: 19, name: 'Six-Op FM 2', bank: 'ORANGE', status: 'partial' },
  { index: 20, name: 'Six-Op FM 3', bank: 'ORANGE', status: 'experimental' },
  { index: 21, name: 'Wave Terrain', bank: 'ORANGE', status: 'ready' },
  { index: 22, name: 'String Machine', bank: 'ORANGE', status: 'ready' },
  { index: 23, name: 'Chiptune', bank: 'ORANGE', status: 'ready' }
];

export class PlaitsVoicePool {
  constructor(audioContext, destinations) {
    this.audioContext = audioContext;
    this.masterGain = destinations.masterGain;
    this.reverbSend = destinations.reverbSend;
    this.delaySend = destinations.delaySend;
    this.drySignalTap = destinations.drySignalTap;

    // 8 separate AudioWorkletNodes (one per voice)
    this.nodes = [];
    this.voicePool = [];
    this.NUM_VOICES = 8;

    this.isInitialised = false;
    this.currentEngine = 0;
    this.lastNote = null; // For slide tracking
  }

  /**
   * Initialise the Plaits AudioWorklet with 8 voice nodes
   */
  async init() {
    if (this.isInitialised) return;

    try {
      // Load the Plaits processor bundle with cache busting (once, shared by all nodes)
      await this.audioContext.audioWorklet.addModule(
        `js/audio/worklets/plaits-processor.bundle.js?v=${Date.now()}`
      );

      // Create 8 AudioWorkletNodes (one per voice)
      for (let i = 0; i < this.NUM_VOICES; i++) {
        const node = new AudioWorkletNode(this.audioContext, 'plaits-processor', {
          numberOfInputs: 0,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          processorOptions: {
            voiceIndex: i,
            sampleRate: this.audioContext.sampleRate
          }
        });

        // Connect to FX sends + master (based on current FX mode)
        if (state.fxMode === 'clouds') {
          // In Clouds mode, just connect to master - switchFxMode will reroute
          node.connect(this.masterGain);
        } else {
          // Classic mode: connect to master + reverb/delay sends
          node.connect(this.masterGain);
          if (this.reverbSend) node.connect(this.reverbSend);
          if (this.delaySend) node.connect(this.delaySend);
        }
        if (this.drySignalTap) node.connect(this.drySignalTap);

        // Set up message handling for this node
        node.port.onmessage = (e) => this.handleProcessorMessage(e.data, i);

        this.nodes.push(node);

        // Voice state tracking
        this.voicePool.push({
          active: false,
          releasing: false,
          quickReleasing: false,
          nodeIndex: i,
          voiceId: null,
          note: null,
          midiNote: 0,
          velocity: 1.0,
          isAccented: false,
          isTrill: false,
          startTime: 0,
          releaseEndTime: 0,
          quickReleaseEndTime: 0
        });
      }

      // Set initial engine on all nodes
      this.setEngine(state.plaitsEngine || 0);

      this.isInitialised = true;
      console.log('[PlaitsVoicePool] Initialised with 8 voice nodes, 24 engines');
    } catch (error) {
      console.error('[PlaitsVoicePool] Failed to initialise:', error);
      throw error;
    }
  }

  /**
   * Handle messages from processors
   */
  handleProcessorMessage(data, voiceIndex) {
    switch (data.event) {
      case 'engineChanged':
        this.currentEngine = data.value;
        document.dispatchEvent(new CustomEvent('plaitsEngineChanged', {
          detail: { engine: data.value, name: PLAITS_ENGINES[data.value]?.name }
        }));
        break;
      case 'voiceReleased':
        // Voice finished releasing - mark as available
        const voice = this.voicePool[voiceIndex];
        if (voice) {
          voice.releasing = false;
          voice.quickReleasing = false;
          voice.voiceId = null;
        }
        break;
      case 'debug':
        console.log(`[PlaitsProcessor:${voiceIndex}] ${data.value}`);
        break;
    }
  }

  /**
   * Check and update voice release states
   * Call this periodically or before voice allocation
   */
  checkReleasedVoices() {
    const now = this.audioContext.currentTime;
    this.voicePool.forEach(voice => {
      if (voice.releasing && now >= voice.releaseEndTime) {
        voice.releasing = false;
        voice.voiceId = null;
      }
      if (voice.quickReleasing && now >= voice.quickReleaseEndTime) {
        voice.quickReleasing = false;
      }
    });
  }

  /**
   * Three-tier voice allocation (following SUB engine pattern)
   * Tier 1: Free voices (not active, not releasing)
   * Tier 2: Oldest releasing voice
   * Tier 3: Voice stealing (oldest active)
   */
  allocateVoice() {
    // Update voice states first
    this.checkReleasedVoices();

    // Tier 1: Find completely free voice
    let voice = this.voicePool.find(v => !v.active && !v.releasing && !v.quickReleasing);
    if (voice) return voice;

    // Tier 2: Find oldest releasing voice
    const releasingVoices = this.voicePool
      .filter(v => v.releasing && !v.quickReleasing)
      .sort((a, b) => a.releaseEndTime - b.releaseEndTime);
    if (releasingVoices.length > 0) {
      return releasingVoices[0];
    }

    // Tier 3: Voice stealing (oldest active)
    const activeVoices = this.voicePool
      .filter(v => v.active)
      .sort((a, b) => a.startTime - b.startTime);
    if (activeVoices.length > 0) {
      voice = activeVoices[0];
      // Trigger quick release on stolen voice
      this.nodes[voice.nodeIndex].port.postMessage({ type: 'quickRelease' });
      voice.quickReleasing = true;
      voice.quickReleaseEndTime = this.audioContext.currentTime + 0.025; // 25ms fade
      console.log(`[PlaitsVoicePool] Voice stealing: ${voice.nodeIndex}`);
      return voice;
    }

    // Fallback: first voice
    return this.voicePool[0];
  }

  /**
   * Trigger a note
   * Allocates a voice and implements slide/trill using pitchBend AudioParam automation
   */
  triggerNote(note, velocity, isAccented, shouldSlide, isTrill, audioTime, voiceId, stepIndex = -1) {
    if (!this.isInitialised) return null;

    const midiNote = noteNameToMidi(note);
    const currentTime = this.audioContext.currentTime;
    const scheduledTime = audioTime || currentTime;

    // Allocate a voice
    const voice = this.allocateVoice();
    const node = this.nodes[voice.nodeIndex];

    // Apply accent velocity boost (same as subtractive engine)
    const finalVelocity = isAccented ? Math.min(1.0, velocity * 1.5) : velocity * 0.5;

    // Generate drift offset
    const driftOffset = generateDriftOffset(state.drift);
    const octaveOffset = transpositionToSemitones(state.mainTransposition || 4);
    const basePitchBend = octaveOffset + (driftOffset / 100); // in semitones

    // Get pitch bend param for THIS voice's node
    const pitchBendParam = node.parameters.get('pitchBend');

    // Calculate step duration for trill timing
    const bpm = state.bpm || 120;
    const stepsPerBar = state.steps || 16;
    const beatsPerBar = state.barLength || 4;
    const stepDurationSec = (60 / bpm) * (beatsPerBar / stepsPerBar);
    const isOffbeat = stepIndex >= 0 && (stepIndex % 2 === 1);

    // Determine if we should do mono-style slide (requires previous note)
    const lastMidiNote = this.lastNote ? noteNameToMidi(this.lastNote) : null;
    const voiceIsProducingSound = this.voicePool.some(v => v.active || v.releasing) || this.lastNote !== null;
    const shouldMonoSlide = state.monoMode && voiceIsProducingSound && (shouldSlide || state.glide > 0) && lastMidiNote !== null;

    // === TRILL HANDLING (takes priority over slide) ===
    if (isTrill && pitchBendParam) {
      const trillNoteStr = this.findTrillTarget(note);

      if (trillNoteStr) {
        const trillMidiNote = noteNameToMidi(trillNoteStr);
        const trillSemitones = trillMidiNote - midiNote;
        this.scheduleTrillAutomation(pitchBendParam, basePitchBend, basePitchBend + trillSemitones, scheduledTime, stepDurationSec, isOffbeat);
      } else {
        pitchBendParam.cancelScheduledValues(scheduledTime);
        pitchBendParam.setValueAtTime(basePitchBend, scheduledTime);
      }
    }
    // === MONO SLIDE HANDLING ===
    else if (shouldMonoSlide && pitchBendParam) {
      const semitoneDiff = midiNote - lastMidiNote;
      const slideTime = state.glide > 0 ? (state.glide / 100) * 0.5 : 0.080;

      pitchBendParam.cancelScheduledValues(scheduledTime);
      pitchBendParam.setValueAtTime(basePitchBend - semitoneDiff, scheduledTime);
      pitchBendParam.exponentialRampToValueAtTime(
        Math.max(0.001, basePitchBend),
        scheduledTime + slideTime
      );
    }
    // === POLY SLIDE HANDLING (slide-into effect) ===
    else if (!state.monoMode && shouldSlide && pitchBendParam) {
      const slideIntoTime = 0.040;
      const slideDetuneAmount = -0.5;

      pitchBendParam.cancelScheduledValues(scheduledTime);
      pitchBendParam.setValueAtTime(basePitchBend + slideDetuneAmount, scheduledTime);
      pitchBendParam.linearRampToValueAtTime(basePitchBend, scheduledTime + slideIntoTime);
    }
    // === NORMAL NOTE ===
    else if (pitchBendParam) {
      pitchBendParam.cancelScheduledValues(scheduledTime);
      pitchBendParam.setValueAtTime(basePitchBend, scheduledTime);
    }

    // Update voice state
    voice.active = true;
    voice.releasing = false;
    voice.quickReleasing = false;
    voice.voiceId = voiceId;
    voice.note = note;
    voice.midiNote = midiNote;
    voice.velocity = finalVelocity;
    voice.isAccented = isAccented;
    voice.isTrill = isTrill;
    voice.startTime = currentTime;

    // Schedule noteOn message to this voice's node
    this.scheduleNoteOn(node, midiNote, finalVelocity, scheduledTime, currentTime);

    // Track last note for slide
    this.lastNote = note;

    // NOTE: stepModAdvance is dispatched by audio.js after voice allocation (for all engines)
    // Do not dispatch here to avoid double-advancement

    return {
      id: voiceId,
      note: note,
      active: true,
      engineType: 'plaits',
      engine: this.currentEngine,
      workletVoiceIndex: voice.nodeIndex,  // Use workletVoiceIndex for consistency with audio.js
      driftOffset,
      isTrill
    };
  }

  /**
   * Schedule trill automation on pitchBend AudioParam
   */
  scheduleTrillAutomation(pitchBendParam, basePitch, trillPitch, audioTime, stepDurationSec, isOffbeat = false) {
    const numSegments = isOffbeat ? 2 : 3;
    const segmentDuration = stepDurationSec / numSegments;
    const holdPortion = segmentDuration * 0.25;
    const slidePortion = segmentDuration * 0.70;

    pitchBendParam.cancelScheduledValues(audioTime);

    let t = audioTime;
    pitchBendParam.setValueAtTime(basePitch, t);
    t += holdPortion;
    pitchBendParam.setValueAtTime(basePitch, t);
    t += slidePortion;
    pitchBendParam.linearRampToValueAtTime(trillPitch, t);
    t += holdPortion;
    pitchBendParam.setValueAtTime(trillPitch, t);
    t += slidePortion;
    pitchBendParam.linearRampToValueAtTime(basePitch, t);
    pitchBendParam.setValueAtTime(basePitch, t + 0.001);
  }

  /**
   * Find trill target note (next scale degree up)
   */
  findTrillTarget(noteStr) {
    try {
      return findScaleNote(noteStr, 1);
    } catch (e) {
      console.warn('[PlaitsVoicePool] Could not find scale note for trill:', e);
      return null;
    }
  }

  /**
   * Schedule noteOn message with timing compensation
   */
  scheduleNoteOn(node, midiNote, velocity, scheduledTime, currentTime) {
    const MESSAGE_LATENCY_COMPENSATION = 0.005;
    const targetTime = scheduledTime - MESSAGE_LATENCY_COMPENSATION;
    const delaySeconds = targetTime - currentTime;

    const sendNoteOn = () => {
      node.port.postMessage({
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
   * Release a note
   */
  releaseNote(note) {
    if (!this.isInitialised) return;

    const midiNote = noteNameToMidi(note);

    // Find voice playing this note
    const voice = this.voicePool.find(v => v.active && v.midiNote === midiNote);
    if (!voice) return;

    const node = this.nodes[voice.nodeIndex];
    node.port.postMessage({ type: 'noteOff', note: midiNote });

    voice.active = false;
    voice.releasing = true;

    // Calculate release end time from LPG decay
    const lpgDecay = state.plaitsLpgDecay ?? 50;
    const releaseTimeSec = (lpgDecay / 100) * 2.0 + 0.1; // 0-2s + 100ms buffer
    voice.releaseEndTime = this.audioContext.currentTime + releaseTimeSec;
  }

  /**
   * Release all notes
   */
  releaseAllNotes() {
    if (!this.isInitialised) return;

    this.voicePool.forEach((voice, idx) => {
      if (voice.active) {
        const node = this.nodes[idx];
        node.port.postMessage({ type: 'noteOff', note: -1 });

        voice.active = false;
        voice.releasing = true;

        const lpgDecay = state.plaitsLpgDecay ?? 50;
        const releaseTimeSec = (lpgDecay / 100) * 2.0 + 0.1;
        voice.releaseEndTime = this.audioContext.currentTime + releaseTimeSec;
      }
    });
  }

  /**
   * Set the engine (0-23) - broadcasts to all nodes
   */
  setEngine(engineIndex) {
    engineIndex = Math.max(0, Math.min(23, Math.floor(engineIndex)));
    this.currentEngine = engineIndex;
    state.plaitsEngine = engineIndex;

    if (!this.isInitialised) return;

    // Broadcast to all nodes
    this.nodes.forEach(node => {
      node.port.postMessage({
        type: 'setEngine',
        value: engineIndex
      });
    });
  }

  /**
   * Set LPG bypass - broadcasts to all nodes
   */
  setLPGBypass(bypassed) {
    if (!this.isInitialised) return;

    this.nodes.forEach(node => {
      node.port.postMessage({
        type: 'setLPGBypass',
        value: bypassed
      });
    });
  }

  /**
   * Set output mode (out, aux, mix) - broadcasts to all nodes
   */
  setOutputMode(mode) {
    if (!this.isInitialised) return;

    const validModes = ['out', 'aux', 'mix'];
    if (!validModes.includes(mode)) {
      console.warn(`[PlaitsVoicePool] Invalid output mode: ${mode}`);
      return;
    }

    this.nodes.forEach(node => {
      node.port.postMessage({
        type: 'setOutputMode',
        value: mode
      });
    });
  }

  /**
   * Update parameters (harmonics, timbre, morph, lpgDecay, lpgColour)
   * Broadcasts to all nodes (for global parameter changes)
   */
  updateParameters(params) {
    if (!this.isInitialised) return;

    const now = this.audioContext.currentTime;

    this.nodes.forEach(node => {
      for (const [paramName, value] of Object.entries(params)) {
        const audioParam = node.parameters.get(paramName);
        if (audioParam) {
          audioParam.setTargetAtTime(value, now, 0.015);
        }
      }
    });
  }

  /**
   * Update parameters for a specific voice (for PPMod per-voice modulation)
   */
  updateVoiceParameters(voiceIndex, params) {
    if (!this.isInitialised) return;
    if (voiceIndex < 0 || voiceIndex >= this.NUM_VOICES) return;

    const node = this.nodes[voiceIndex];
    const now = this.audioContext.currentTime;

    for (const [paramName, value] of Object.entries(params)) {
      const audioParam = node.parameters.get(paramName);
      if (audioParam) {
        audioParam.setTargetAtTime(value, now, 0.015);
      }
    }
  }

  /**
   * Set pitch bend - broadcasts to all nodes
   */
  setPitchBend(semitones) {
    if (!this.isInitialised) return;

    const now = this.audioContext.currentTime;
    this.nodes.forEach(node => {
      const pitchBendParam = node.parameters.get('pitchBend');
      if (pitchBendParam) {
        pitchBendParam.setTargetAtTime(semitones, now, 0.005);
      }
    });
  }

  /**
   * Get engine info
   */
  getEngineInfo(engineIndex = null) {
    const index = engineIndex ?? this.currentEngine;
    return PLAITS_ENGINES[index] || PLAITS_ENGINES[0];
  }

  /**
   * Get all engines in a bank
   */
  getEnginesInBank(bankName) {
    const bank = PLAITS_BANKS[bankName];
    if (!bank) return [];
    return PLAITS_ENGINES.filter(e => e.bank === bankName);
  }

  /**
   * Get active voices (for PPMod iteration)
   */
  getActiveVoices() {
    return this.voicePool.filter(v => v.active || v.releasing);
  }

  /**
   * Check if pool is ready
   */
  isReady() {
    return this.isInitialised && this.nodes.length === this.NUM_VOICES;
  }

  /**
   * Set polyphony (no-op for 8-node architecture)
   * With 8 separate AudioWorkletNodes, polyphony is fixed at 8.
   * This method exists for API compatibility with audio.js switchEngine().
   */
  setPolyphony(count) {
    // No-op: polyphony is fixed at 8 with the 8-node architecture
    console.log(`[PlaitsVoicePool] setPolyphony(${count}) - ignored, polyphony fixed at 8`);
  }

  /**
   * Cleanup
   */
  dispose() {
    this.nodes.forEach(node => {
      try {
        node.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    });
    this.nodes = [];
    this.voicePool = [];
    this.isInitialised = false;
  }
}
