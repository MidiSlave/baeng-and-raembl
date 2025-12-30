// File: js/audio.js
// Audio engine implementation - CORRECTED INIT ORDER FOR MONO FX SENDS & MONO FILTER ENV & LFO START
import { state } from './state.js';
import { config } from './config.js';
import { sharedAudioContext, connectToFinalLimiter } from '../shared/audio.js'; // Shared audio context for merged app
import {
    initFilter,
    updateFilter,
    initReverb,
    initDelay,
    startEffectsLFOs
} from './audio/effects.js';
import { initClouds } from './modules/clouds.js';
// Import cleanupRemainingNodes for the panic stop functionality
import { createVoice, releaseAllVoices as releaseVoicesCommand, releaseVoiceById as releaseSingleVoiceById, releaseInactiveVoices as cleanupReleasedPolyVoices, cleanupRemainingNodes as actualCleanupRemainingNodes } from './audio/voice.js';
// Import WorkletBridge for AudioWorklet voice engine
import { WorkletBridge } from './audio/worklet-bridge.js';
// Import PlaitsVoicePool for Plaits engine
import { PlaitsVoicePool } from './audio/plaits-voice-pool.js';
// Import RingsVoicePool for Rings engine
import { RingsVoicePool } from './audio/rings-voice-pool.js';

// Re-export cleanupRemainingNodes so it can be imported by clock.js
export const cleanupRemainingNodes = actualCleanupRemainingNodes;

// Helper to map 0-100 state values to seconds for envelope times
function mapEnvelopeTime(value) {
  return ((value - 0) * (2.0 - 0.001)) / (100 - 0) + 0.001;
}

// Sync initial envelope parameters from state to worklet on startup
function syncInitialEnvelopeParams() {
  if (!config.useWorklet || !config.workletBridge) return;

  const attackSec = mapEnvelopeTime(state.attack);
  const decaySec = mapEnvelopeTime(state.decay);
  const sustainNorm = state.sustain / 100;
  const releaseSec = mapEnvelopeTime(state.release);

  // Send all ADSR params for amp envelope
  config.workletBridge.updateAllVoices({
    type: 'setEnvelope',
    target: 'amp',
    attack: attackSec,
    decay: decaySec,
    sustain: sustainNorm,
    release: releaseSec
  });

  // Send all ADSR params for filter envelope (sustain typically 0)
  config.workletBridge.updateAllVoices({
    type: 'setEnvelope',
    target: 'filter',
    attack: attackSec,
    decay: decaySec,
    sustain: 0,
    release: releaseSec
  });

}

// Initialize the audio context and main audio graph
export async function initAudio() {
  if (config.initialized) return;

  try {
    config.audioContext = sharedAudioContext;
    config.sampleRate = config.audioContext.sampleRate;
    window.config = config; // Make config global for easy debugging if needed

    config.masterGain = config.audioContext.createGain();
    const defaultVolume = state.volume || 75;
    config.masterGain.gain.value = (defaultVolume / 100) * 0.2121; // -13.46dB headroom for merged app

    // Create stereo analysers for X-Y oscilloscope visualization
    config.channelSplitter = config.audioContext.createChannelSplitter(2);
    config.analyserLeft = config.audioContext.createAnalyser();
    config.analyserRight = config.audioContext.createAnalyser();

    config.analyserLeft.fftSize = 2048;
    config.analyserLeft.smoothingTimeConstant = 0.7;
    config.analyserRight.fftSize = 2048;
    config.analyserRight.smoothingTimeConstant = 0.7;

    // Connect master gain to splitter, then each channel to its analyser
    config.masterGain.connect(config.channelSplitter);
    config.channelSplitter.connect(config.analyserLeft, 0); // Left channel
    config.channelSplitter.connect(config.analyserRight, 1); // Right channel

    // Keep legacy analyser reference for compatibility
    config.analyser = config.analyserLeft;

    // Create dry signal analyser for effects visualizations (onset detection)
    // Will be connected after effects are initialized
    config.drySignalAnalyser = config.audioContext.createAnalyser();
    config.drySignalAnalyser.fftSize = 512; // Smaller FFT for faster response
    config.drySignalAnalyser.smoothingTimeConstant = 0.3; // Lower smoothing for onset detection

    config.limiter = config.audioContext.createDynamicsCompressor();
    config.limiter.threshold.setValueAtTime(-0.5, config.audioContext.currentTime);
    config.limiter.knee.setValueAtTime(0, config.audioContext.currentTime);
    config.limiter.ratio.setValueAtTime(20, config.audioContext.currentTime);
    config.limiter.attack.setValueAtTime(0.001, config.audioContext.currentTime);
    config.limiter.release.setValueAtTime(0.05, config.audioContext.currentTime);

    config.masterGain.connect(config.limiter);
    connectToFinalLimiter(config.limiter); // Connect to shared final limiter instead of destination

    // === Effects initialisation (MUST happen before WorkletBridge) ===
    // Create reverb analyser for oscilloscope visualization BEFORE initReverb
    // so that initReverb can connect to it
    config.reverbAnalyser = config.audioContext.createAnalyser();
    config.reverbAnalyser.fftSize = 512; // Smaller FFT for waveform display
    config.reverbAnalyser.smoothingTimeConstant = 0; // No smoothing for raw oscilloscope

    config.reverbTap = config.audioContext.createGain();
    config.reverbTap.gain.value = 1.0; // Unity gain
    config.reverbTap.connect(config.reverbAnalyser);

    initReverb();
    initDelay();

    // Create dedicated dry signal tap for visualization analyser
    // This passes signal to the analyser but doesn't connect to audio output,
    // making it independent of effect send levels or master volume
    config.drySignalTap = config.audioContext.createGain();
    config.drySignalTap.gain.value = 1.0; // Unity gain - passes signal through
    config.drySignalTap.connect(config.drySignalAnalyser);
    // Note: NOT connected to destination, so no audio output from this path

    // === AudioWorklet initialisation (after effects chains exist) ===
    if (config.useWorklet) {
      try {
        // Add cache-busting timestamp to force reload during development
        await config.audioContext.audioWorklet.addModule(`js/raembl/audio/worklets/raembl-voice-processor.js?v=${Date.now()}`);

        // Effects chains already initialised above, WorkletBridge can now connect to sends
        config.workletBridge = new WorkletBridge(config.audioContext, {
          masterGain: config.masterGain,
          reverbSend: config.reverbSendGain,
          delaySend: config.delaySendGain,
          drySignalTap: config.drySignalTap
        });
        await config.workletBridge.init();

        // Sync initial envelope parameters from state to worklet
        syncInitialEnvelopeParams();

        // === Plaits engine initialisation ===
        try {
          config.plaitsVoicePool = new PlaitsVoicePool(config.audioContext, {
            masterGain: config.masterGain,
            reverbSend: config.reverbSendGain,
            delaySend: config.delaySendGain,
            drySignalTap: config.drySignalTap
          });
          await config.plaitsVoicePool.init();
          console.log('[Ræmbl] Plaits engine initialised with 24 engines');

          // If already in Clouds mode, reroute Plaits to Clouds
          if (state.fxMode === 'clouds' && config.cloudsNode) {
            const cloudsInput = config.cloudsInputAnalyser || config.cloudsNode;
            // Iterate all 8 Plaits nodes
            config.plaitsVoicePool.nodes.forEach(plaitsNode => {
              try { plaitsNode.disconnect(config.masterGain); } catch (e) {}
              try { plaitsNode.connect(cloudsInput); } catch (e) {}
            });
          }
        } catch (plaitsError) {
          console.warn('[Ræmbl] Plaits engine failed to initialise:', plaitsError);
          config.plaitsVoicePool = null;
        }

        // === Rings engine initialisation ===
        try {
          config.ringsVoicePool = new RingsVoicePool(config.audioContext, {
            masterGain: config.masterGain,
            reverbSend: config.reverbSendGain,
            delaySend: config.delaySendGain,
            drySignalTap: config.drySignalTap
          });
          await config.ringsVoicePool.init();

          // Sync polyphony from state
          config.ringsVoicePool.setPolyphony(state.ringsPolyphony || 4);

          console.log('[Ræmbl] Rings engine initialised with 6 resonator models');

          // If already in Clouds mode, reroute Rings to Clouds
          if (state.fxMode === 'clouds' && config.cloudsNode) {
            const cloudsInput = config.cloudsInputAnalyser || config.cloudsNode;
            const ringsNode = config.ringsVoicePool.node;
            try { ringsNode.disconnect(config.masterGain); } catch (e) {}
            try { ringsNode.connect(cloudsInput); } catch (e) {}
          }
        } catch (ringsError) {
          console.warn('[Ræmbl] Rings engine failed to initialise:', ringsError);
          config.ringsVoicePool = null;
        }

      } catch (e) {
        console.error('[Ræmbl] AudioWorklet initialisation failed, falling back to Web Audio:', e);
        config.useWorklet = false; // Disable worklet on error
      }
    }

    // If worklet disabled or failed, use Web Audio fallback
    if (!config.useWorklet) {
    }

    initFilter();

    if (!config.monoFilter || !config.monoHighPassFilter || !config.monoFilterInput) {
      console.error("MONO Filter system initialization failed!");
    }
    if (!config.reverbSendGain || !config.delaySendGain) {
        console.error("Effects send gains not initialized prior to filter connection!");
    }

    // Initialize effects based on fxMode
    if (state.fxMode === 'clouds') {
        await initClouds();
        connectCloudsRouting();
    } else {
        // Classic mode: reverb and delay are already initialized
        connectClassicRouting();
    }

    config.voices = [];
    setMasterVolume(state.volume); // Set initial volume based on state
    config.initialized = true;

    // Attempt to start effects LFOs if context is already running (e.g. dev tools auto-resume)
    // The main start will happen on user gesture via resumeAudio()
    if (config.audioContext.state === 'running') {
        startEffectsLFOs();
    }

  } catch (e) {
    console.error("Failed to initialize audio system", e);
    alert("Failed to initialize Web Audio API. Please use a modern browser.");
  }
}

export function resumeAudio() {
  if (config.audioContext && config.audioContext.state === 'suspended') {
    config.audioContext.resume().then(() => {
        startEffectsLFOs(); // Start LFOs now that context is running
    }).catch(e => console.error("Error resuming audio context:", e));
  } else if (config.audioContext && config.audioContext.state === 'running') {
    // If already running (e.g. dev tools auto-resumed, or called multiple times),
    // ensure LFOs are started if they haven't been.
    startEffectsLFOs();
  }
}

export function setMasterVolume(volume) {
  if (config.audioContext && config.masterGain) {
    const gainValue = (volume / 100) * 0.2121; // -13.46dB headroom for merged app
    try {
        config.masterGain.gain.setTargetAtTime(gainValue, config.audioContext.currentTime, 0.01);
    } catch (e) { console.error("Error setting master volume:", e); }
  }
}

export const releaseAllVoices = () => {
  // Release subtractive engine voices
  releaseVoicesCommand();

  // Release Plaits engine voices
  if (config.plaitsVoicePool?.isReady()) {
    config.plaitsVoicePool.releaseAllNotes();
  }

  // Release Rings engine voices
  if (config.ringsVoicePool?.isReady()) {
    config.ringsVoicePool.releaseAllNotes();
  }
};
export const releaseVoiceById = releaseSingleVoiceById;
export const releaseInactiveVoices = cleanupReleasedPolyVoices;

/**
 * Switch synth engine type
 * @param {string} engineType - 'subtractive' | 'plaits' | 'rings'
 */
export function switchEngine(engineType) {
  if (!config.initialized) {
    console.warn('[Audio] Cannot switch engine - audio not initialized');
    return;
  }

  const previousEngine = state.engineType;
  state.engineType = engineType;

  // Quick release on subtractive if switching away
  if (previousEngine === 'subtractive' && engineType !== 'subtractive') {
    if (config.workletBridge) {
      config.workletBridge.switchEngine(engineType);
    }
  }

  // Quick release on Plaits if switching away
  if (previousEngine === 'plaits' && engineType !== 'plaits') {
    if (config.plaitsVoicePool?.isReady()) {
      config.plaitsVoicePool.releaseAllNotes();
    }
  }

  // Quick release on Rings if switching away
  if (previousEngine === 'rings' && engineType !== 'rings') {
    if (config.ringsVoicePool?.isReady()) {
      config.ringsVoicePool.releaseAllNotes();
    }
  }

  // Sync Plaits polyphony when switching TO Plaits
  if (engineType === 'plaits' && config.plaitsVoicePool?.isReady()) {
    config.plaitsVoicePool.setPolyphony(state.monoMode ? 1 : 8);
  }

  // Sync Rings polyphony when switching TO Rings
  if (engineType === 'rings' && config.ringsVoicePool?.isReady()) {
    config.ringsVoicePool.setPolyphony(state.ringsPolyphony || 4);
  }

  // Dispatch event for UI updates
  document.dispatchEvent(new CustomEvent('engineChanged', {
    detail: { engineType, previousEngine }
  }));

  console.log(`[Audio] Switched engine: ${previousEngine} → ${engineType}`);
}

/**
 * Set Plaits engine index (0-23)
 * @param {number} engineIndex - Engine index
 */
export function setPlaitsEngine(engineIndex) {
  if (config.plaitsVoicePool?.isReady()) {
    config.plaitsVoicePool.setEngine(engineIndex);
  }
  state.plaitsEngine = engineIndex;
}

/**
 * Get current Plaits engine info
 */
export function getPlaitsEngineInfo() {
  if (config.plaitsVoicePool) {
    return config.plaitsVoicePool.getEngineInfo();
  }
  return null;
}

/**
 * Set Plaits polyphony (1 = mono, 8 = full poly)
 * @param {number} count - Voice count (1-8)
 */
export function setPlaitsPolyphony(count) {
  if (config.plaitsVoicePool?.isReady()) {
    config.plaitsVoicePool.setPolyphony(count);
  }
}

/**
 * Set Plaits pitch bend (for octave transpose)
 * @param {number} semitones - Pitch offset in semitones
 */
export function setPlaitsPitchBend(semitones) {
  if (config.plaitsVoicePool?.isReady()) {
    config.plaitsVoicePool.setPitchBend(semitones);
  }
}

/**
 * Update a Plaits parameter (for PPMod integration)
 * @param {string} paramId - Parameter ID (e.g., 'plaits.harmonics')
 * @param {number} value - Value (0-100 for most params, 0-23 for model)
 */
export function updatePlaitsParameter(paramId, value) {
  // Handle model parameter specially - it sets the engine index
  // Value comes in as 1-24, convert to 0-23 internal index
  if (paramId === 'plaits.model') {
    const engineIndex = Math.round(Math.max(0, Math.min(23, value - 1)));
    setPlaitsEngine(engineIndex);
    return;
  }

  if (!config.plaitsVoicePool || !config.plaitsVoicePool.isReady()) return;

  // Handle OUT/AUX mix specially - it's message-based, not an AudioParam
  // Value already normalised to 0-1 by faderState.js
  // 0-0.33 = out, 0.34-0.66 = mix, 0.67-1.0 = aux
  if (paramId === 'plaits.mixOutAux') {
    let mode;
    if (value < 0.34) {
      mode = 'out';
    } else if (value < 0.67) {
      mode = 'mix';
    } else {
      mode = 'aux';
    }
    config.plaitsVoicePool.setOutputMode(mode);
    return;
  }

  // Map parameter ID to Plaits processor parameter
  const paramMap = {
    'plaits.harmonics': 'harmonics',
    'plaits.timbre': 'timbre',
    'plaits.morph': 'morph',
    'plaits.lpgDecay': 'lpgDecay',
    'plaits.lpgColour': 'lpgColour'
  };

  const processorParam = paramMap[paramId];
  if (!processorParam) return;

  // Value already normalised to 0-1 by faderState.js - use directly
  const normalisedValue = Math.max(0, Math.min(1, value));

  // Update via voice pool
  config.plaitsVoicePool.updateParameters({
    [processorParam]: normalisedValue
  });
}

/**
 * Set Rings resonator model (0-5)
 * @param {number} modelIndex - Model index
 */
export function setRingsModel(modelIndex) {
  if (config.ringsVoicePool?.isReady()) {
    config.ringsVoicePool.setModel(modelIndex);
  }
  state.ringsModel = modelIndex;
}

/**
 * Get current Rings model info
 */
export function getRingsModelInfo() {
  if (config.ringsVoicePool) {
    return config.ringsVoicePool.getModelInfo();
  }
  return null;
}

/**
 * Set Rings polyphony (1 = mono, 4 = full poly)
 * @param {number} count - Voice count (1-4)
 */
export function setRingsPolyphony(count) {
  if (config.ringsVoicePool?.isReady()) {
    config.ringsVoicePool.setPolyphony(count);
  }
}

/**
 * Toggle Rings Easter Egg mode (Disastrous Peace)
 * @param {boolean} enabled - Whether to enable Easter Egg
 */
export function setRingsEasterEgg(enabled) {
  if (config.ringsVoicePool?.isReady()) {
    config.ringsVoicePool.setEasterEgg(enabled);
  }
}

/**
 * Update a Rings parameter (for PPMod integration)
 * @param {string} paramId - Parameter ID (e.g., 'rings.structure')
 * @param {number} value - Value (0-100 for most params, 0-5 for model)
 */
export function updateRingsParameter(paramId, value) {
  // Handle model parameter specially - it sets the model index
  // Value comes in as 1-6, convert to 0-5 internal index
  if (paramId === 'rings.model') {
    const modelIndex = Math.round(Math.max(0, Math.min(5, value - 1)));
    setRingsModel(modelIndex);
    return;
  }

  if (!config.ringsVoicePool || !config.ringsVoicePool.isReady()) return;

  // Handle strum control specially
  if (paramId === 'rings.mixStrum') {
    // Strum on value change (trigger excitation)
    if (value > 0.5) {
      config.ringsVoicePool.strum(value);
    }
    return;
  }

  // Map parameter ID to Rings processor parameter
  const paramMap = {
    'rings.structure': 'structure',
    'rings.brightness': 'brightness',
    'rings.damping': 'damping',
    'rings.position': 'position'
  };

  const processorParam = paramMap[paramId];
  if (!processorParam) return;

  // Value already normalised to 0-1 by faderState.js - use directly
  const normalisedValue = Math.max(0, Math.min(1, value));

  // Update via voice pool
  config.ringsVoicePool.updateParameters({
    [processorParam]: normalisedValue
  });
}

// Release voice by pool index (for sequencer auto-release - more reliable than voiceId)
export function releaseVoiceByIndex(voiceIndex) {
  if (config.useWorklet && config.workletBridge) {
    config.workletBridge.releaseVoiceByIndex(voiceIndex);
  }
}

// Panic: Emergency stop all audio immediately
// Forcibly cleans up all voices with immediate disconnect, bypassing graceful release
export function panicStop() {
  console.warn("PANIC STOP: Forcibly stopping all audio");

  if (!config.audioContext || !config.voices) return;

  // Clone the voices array to avoid modification during iteration
  const voicesToCleanup = [...config.voices];

  // Force immediate cleanup of all voices
  voicesToCleanup.forEach(voice => {
    if (voice) {
      actualCleanupRemainingNodes(voice, true); // true = immediate disconnect
    }
  });

  // Clear the voices array
  config.voices = [];

  // Reset MONO filter envelope if it exists
  if (config.monoFilterEnvModulator && config.audioContext) {
    try {
      const now = config.audioContext.currentTime;
      config.monoFilterEnvModulator.gain.cancelScheduledValues(now);
      config.monoFilterEnvModulator.gain.setValueAtTime(0, now);
    } catch (e) {
      console.warn("Error resetting MONO filter envelope during panic:", e);
    }
  }

}

export function triggerNote(note, velocity = 1.0, isAccented = false, shouldSlide = false, isTrill = false, audioTime = null, stepIndex = -1) {
  if (!config.initialized) {
    console.warn("Audio not initialized, attempting to init now.");
    initAudio(); // This will also try to start LFOs if context becomes running
    if (!config.initialized) {
        console.error("Cannot trigger note: Audio system failed to initialize.");
        return null;
    }
  }
  resumeAudio(); // Ensure context is running AND attempts to start effects LFOs
  if (!config.audioContext) { console.error("Cannot trigger note: Audio context not available."); return null; }

  // Use provided audioTime if available, otherwise use current time
  const audioCtxTime = audioTime !== null ? audioTime : config.audioContext.currentTime;

  // Release voices ONLY for Web Audio fallback path
  // Worklet bridge handles voice lifecycle via gate signal
  if (!config.useWorklet) {
    if (state.monoMode && !shouldSlide) {
         releaseAllVoices();
    } else if (!state.monoMode) {
         releaseInactiveVoices();
    }
  }

  if (state.sawLevel <= 0 && state.squareLevel <= 0 && state.triangleLevel <= 0 && state.subLevel <= 0 && state.noiseLevel <= 0) {
    // If in mono mode and a previous voice was marked for cleanup (e.g. from a slide attempt that's now cancelled by zero levels)
    // ensure it's cleaned. This is a bit of an edge case.
    if (state.monoMode && config.voices.length > 0 && config.voices[0] && config.voices[0].markedForCleanup) {
        // Check if cleanupRemainingNodes is available before calling
        if (typeof actualCleanupRemainingNodes === 'function') {
            actualCleanupRemainingNodes(config.voices[0], true);
        } else {
            console.warn("cleanupRemainingNodes not available for zero-level mono cleanup.");
        }
    }
    return null;
  }

  // Generate voiceId early and trigger S&H BEFORE creating voice
  // This ensures envelope parameters get correct S&H-sampled values
  const voiceId = Date.now() + Math.random();

  // Trigger S&H for per-parameter modulation
  const gateEvent = new CustomEvent('gateTriggered', {
    detail: { source: 'trigger', voiceId: voiceId }
  });
  document.dispatchEvent(gateEvent);

  // === Worklet path ===
  if (config.useWorklet && config.workletBridge) {
    let voice = null;

    // Route to appropriate engine based on engineType
    if (state.engineType === 'plaits' && config.plaitsVoicePool?.isReady()) {
      // === Plaits engine ===
      voice = config.plaitsVoicePool.triggerNote(
        note,
        velocity,
        isAccented,
        shouldSlide,
        isTrill,
        audioCtxTime,
        voiceId
      );
    } else if (state.engineType === 'rings' && config.ringsVoicePool?.isReady()) {
      // === Rings engine ===
      voice = config.ringsVoicePool.triggerNote(
        note,
        velocity,
        isAccented,
        shouldSlide,
        isTrill,
        audioCtxTime,
        voiceId,
        stepIndex
      );
    } else {
      // === Subtractive engine (default) ===
      voice = config.workletBridge.triggerNote(
        note,
        velocity,
        isAccented,
        shouldSlide,
        isTrill,
        audioCtxTime,
        voiceId,
        stepIndex
      );
    }

    if (voice) {
      // Add voice to config.voices array for tracking
      config.voices.push(voice);

      // State updates for mono mode (filter keytracking)
      if (state.monoMode) {
        config.lastActiveNote = note;
        updateFilter(); // Update MONO filter settings (keytracking, envelope target)
      }

      // S&H trigger for Mod LFO
      if (Math.round(state.modLfoWaveform / 25) === 4) { // S&H
        import('./modules/modlfo.js').then(modlfoModule => {
          const s_h_voice_id = state.monoMode ? null : voice.id;
          modlfoModule.handleGateTrigger(s_h_voice_id);
        }).catch(err => console.error("Error importing modlfo for S&H trigger:", err));
      }

      // Dispatch step advancement event for SEQ/TM modes (needs nodeIndex after voice allocation)
      // This is separate from gateTriggered because S&H must sample BEFORE voice creation
      if (!state.monoMode) {
        const stepEvent = new CustomEvent('stepModAdvance', {
          detail: { voiceId: voiceId, nodeIndex: voice.workletVoiceIndex }
        });
        document.dispatchEvent(stepEvent);
      }
    }
    return voice;
  }

  // === Web Audio fallback path ===
  const voice = createVoice(note, velocity, isAccented, shouldSlide, isTrill, audioCtxTime, voiceId, stepIndex);

  if (voice) {
    if (state.monoMode) {
        updateFilter(); // Update MONO filter settings (keytracking, envelope target)
    }
    // S&H trigger for Mod LFO
    if (Math.round(state.modLfoWaveform / 25) === 4) { // S&H
        import('./modules/modlfo.js').then(modlfoModule => {
            const s_h_voice_id = state.monoMode ? null : voice.id;
            modlfoModule.handleGateTrigger(s_h_voice_id);
        }).catch(err => console.error("Error importing modlfo for S&H trigger:", err));
    }

    // Dispatch step advancement event for SEQ/TM modes (Web Audio path)
    if (!state.monoMode) {
      // Web Audio voices use voice.id directly; get index from voice array position
      const voiceIndex = config.voices.findIndex(v => v && v.id === voice.id);
      const stepEvent = new CustomEvent('stepModAdvance', {
        detail: { voiceId: voice.id, nodeIndex: voiceIndex >= 0 ? voiceIndex : 0 }
      });
      document.dispatchEvent(stepEvent);
    }
  }
  return voice;
}

// ======================================
// FX Mode Audio Routing Functions
// ======================================

/**
 * Connect Classic mode routing (Voices → Master + Reverb/Delay sends)
 */
function connectClassicRouting() {
  if (!config.workletBridge || !config.masterGain) {
    console.warn('[Audio] Cannot connect classic routing - worklet bridge or master gain not available');
    return;
  }

  const nodes = config.workletBridge.nodes;
  nodes.forEach(voiceNode => {
    try {
      // Connect voice directly to masterGain (dry signal)
      voiceNode.connect(config.masterGain);
    } catch (e) {
      // Ignore if already connected
    }

    // Reconnect to parallel effect sends (may have been disconnected for Clouds mode)
    try {
      if (config.reverbSendGain) voiceNode.connect(config.reverbSendGain);
    } catch (e) { /* Ignore if already connected */ }
    try {
      if (config.delaySendGain) voiceNode.connect(config.delaySendGain);
    } catch (e) { /* Ignore if already connected */ }
  });

  // Also reconnect Plaits nodes if present (8 nodes)
  if (config.plaitsVoicePool?.isReady()) {
    config.plaitsVoicePool.nodes.forEach(plaitsNode => {
      try {
        plaitsNode.connect(config.masterGain);
      } catch (e) { /* Ignore if already connected */ }
      try {
        if (config.reverbSendGain) plaitsNode.connect(config.reverbSendGain);
      } catch (e) { /* Ignore if already connected */ }
      try {
        if (config.delaySendGain) plaitsNode.connect(config.delaySendGain);
      } catch (e) { /* Ignore if already connected */ }
    });
  }

  // Also reconnect Rings node if present
  if (config.ringsVoicePool?.node) {
    const ringsNode = config.ringsVoicePool.node;
    try {
      ringsNode.connect(config.masterGain);
    } catch (e) { /* Ignore if already connected */ }
    try {
      if (config.reverbSendGain) ringsNode.connect(config.reverbSendGain);
    } catch (e) { /* Ignore if already connected */ }
    try {
      if (config.delaySendGain) ringsNode.connect(config.delaySendGain);
    } catch (e) { /* Ignore if already connected */ }
  }
}

/**
 * Connect Clouds mode routing (Voices → Clouds → Master)
 */
function connectCloudsRouting() {
  if (!config.workletBridge || !config.masterGain || !config.cloudsNode) {
    console.warn('[Audio] Cannot connect clouds routing - missing nodes');
    return;
  }

  const cloudsInput = config.cloudsInputAnalyser || config.cloudsNode;

  const nodes = config.workletBridge.nodes;
  nodes.forEach(voiceNode => {
    try {
      // Disconnect voice from masterGain (dry path)
      voiceNode.disconnect(config.masterGain);
    } catch (e) {
      // Ignore if not connected
    }

    // CRITICAL: Also disconnect from parallel effect sends!
    // Otherwise dry signal leaks through reverb/delay paths
    try {
      if (config.reverbSendGain) voiceNode.disconnect(config.reverbSendGain);
    } catch (e) { /* Ignore if not connected */ }
    try {
      if (config.delaySendGain) voiceNode.disconnect(config.delaySendGain);
    } catch (e) { /* Ignore if not connected */ }

    try {
      // Connect voice to Clouds input analyser (for VU metering)
      // If analyser exists, route through it; otherwise connect directly
      voiceNode.connect(cloudsInput);
    } catch (e) {
      console.error('[Audio] Error connecting voice to Clouds:', e);
    }
  });

  // Also route Plaits nodes to Clouds if present (8 nodes)
  if (config.plaitsVoicePool?.isReady()) {
    config.plaitsVoicePool.nodes.forEach(plaitsNode => {
      try {
        plaitsNode.disconnect(config.masterGain);
      } catch (e) { /* Ignore if not connected */ }
      try {
        if (config.reverbSendGain) plaitsNode.disconnect(config.reverbSendGain);
      } catch (e) { /* Ignore if not connected */ }
      try {
        if (config.delaySendGain) plaitsNode.disconnect(config.delaySendGain);
      } catch (e) { /* Ignore if not connected */ }
      try {
        plaitsNode.connect(cloudsInput);
      } catch (e) {
        console.error('[Audio] Error connecting Plaits to Clouds:', e);
      }
    });
  }

  // Also route Rings node to Clouds if present
  if (config.ringsVoicePool?.node) {
    const ringsNode = config.ringsVoicePool.node;
    try {
      ringsNode.disconnect(config.masterGain);
    } catch (e) { /* Ignore if not connected */ }
    try {
      if (config.reverbSendGain) ringsNode.disconnect(config.reverbSendGain);
    } catch (e) { /* Ignore if not connected */ }
    try {
      if (config.delaySendGain) ringsNode.disconnect(config.delaySendGain);
    } catch (e) { /* Ignore if not connected */ }
    try {
      ringsNode.connect(cloudsInput);
    } catch (e) {
      console.error('[Audio] Error connecting Rings to Clouds:', e);
    }
  }

  // Clouds output is already connected to masterGain during initClouds
}

/**
 * Switch between FX modes (called when user toggles FX mode)
 * @param {string} newMode - 'classic' or 'clouds'
 */
export async function switchFxMode(newMode) {
  if (!config.initialized) {
    console.warn('[Audio] Cannot switch FX mode - audio not initialized');
    return;
  }


  if (newMode === 'clouds') {
    // Initialize Clouds if not already done
    if (!config.cloudsNode) {
      await initClouds();
    }

    // Disconnect classic routing, connect clouds routing
    connectCloudsRouting();
  } else if (newMode === 'classic') {
    // Disconnect clouds routing, connect classic routing
    if (config.cloudsNode) {
      const cloudsInput = config.cloudsInputAnalyser || config.cloudsNode;

      // Disconnect subtractive voices from Clouds
      if (config.workletBridge) {
        const nodes = config.workletBridge.nodes;
        nodes.forEach(voiceNode => {
          try {
            voiceNode.disconnect(cloudsInput);
          } catch (e) {
            // Ignore if not connected
          }
        });
      }

      // Disconnect Plaits nodes from Clouds (8 nodes)
      if (config.plaitsVoicePool?.isReady()) {
        config.plaitsVoicePool.nodes.forEach(plaitsNode => {
          try {
            plaitsNode.disconnect(cloudsInput);
          } catch (e) {
            // Ignore if not connected
          }
        });
      }

      // Disconnect Rings from Clouds
      if (config.ringsVoicePool?.node) {
        try {
          config.ringsVoicePool.node.disconnect(cloudsInput);
        } catch (e) {
          // Ignore if not connected
        }
      }
    }

    connectClassicRouting();
  }

}