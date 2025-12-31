// File: perParamMod.js
// Per-parameter modulation system for Bæng
// Allows any modulatable parameter to have its own LFO modulation
// Supports 6 modes: LFO, RND, ENV, EF, TM, SEQ

import { state, parameterDefinitions, getParameterValue, setParameterValue, setParameterValueForVoice } from '../state.js';
import { handleDelayParameterChange, handleReverbParameterChange, updateVoiceEnvelope, updateAnalogEngineParams, updateCloudsParams } from './engine.js';
import { applySingleMacro, ENGINE_MACROS } from './engines.js';
import { ledRingKnobRegistry } from '../ui/ledRingKnobs.js';

// Import shared modulation utilities
import {
    LFSR,
    EnvelopeCurves,
    ADEnvelope,
    SeqPattern,
    TMPattern,
    EnvelopeFollower,
    mapModulationValue
} from '../../shared/modulation-utils.js';

// ============================================================================
// Mode-specific State Storage
// ============================================================================

// Each mode has its own state storage, keyed by `${voiceIndex}:${paramId}` for voice params
// or just `paramId` for global effect params

const seqPatterns = new Map();      // SEQ mode patterns
const envEnvelopes = new Map();     // ENV mode AD envelopes
const rndGenerators = new Map();    // RND mode LFSR generators
const rndCurrentValues = new Map(); // RND mode current values
const tmPatterns = new Map();       // TM mode Turing patterns
const tmCurrentSteps = new Map();   // TM mode current step positions
const efSmoothedValues = new Map(); // EF mode smoothed envelope values

/**
 * Get the actual DOM display label for a parameter, accounting for engine-specific macro mappings
 * This is the reverse of findParameterId() in main.js
 * @param {string} paramId - Parameter ID (e.g., 'voice.macroDepth')
 * @param {string} moduleId - Module ID (e.g., 'engine')
 * @returns {string} The actual label used in the DOM (e.g., 'DECAY', 'FILTER', etc.)
 */
function getDisplayLabelForParam(paramId, moduleId) {
    // For ENGINE module with macro parameters, check engine-specific labels
    if (moduleId === 'baeng-engine' && paramId.startsWith('voice.macro')) {
        const voice = state.voices[state.selectedVoice];
        if (voice && voice.engine) {
            const engineType = voice.engine;
            const engineMacros = ENGINE_MACROS?.[engineType];

            if (engineMacros) {
                // Map macro parameter IDs back to engine-specific labels
                if (paramId === 'voice.macroPatch' && engineMacros.PATCH) {
                    return engineMacros.PATCH.label;
                }
                if (paramId === 'voice.macroDepth' && engineMacros.DEPTH) {
                    return engineMacros.DEPTH.label;
                }
                if (paramId === 'voice.macroRate' && engineMacros.RATE) {
                    return engineMacros.RATE.label;
                }
                if (paramId === 'voice.macroPitch' && engineMacros.PITCH) {
                    return 'PITCH'; // PITCH is always PITCH
                }
                if (paramId === 'voice.macroColor' && engineMacros.COLOR) {
                    return engineMacros.COLOR.label;
                }
                if (paramId === 'voice.macroShape' && engineMacros.SHAPE) {
                    return engineMacros.SHAPE.label;
                }
                if (paramId === 'voice.macroDecay' && engineMacros.DECAY) {
                    return engineMacros.DECAY.label;
                }
                if (paramId === 'voice.macroSweep' && engineMacros.SWEEP) {
                    return engineMacros.SWEEP.label;
                }
                if (paramId === 'voice.macroContour' && engineMacros.CONTOUR) {
                    return engineMacros.CONTOUR.label;
                }
            }
        }
    }

    // For non-macro parameters or if no engine-specific mapping found, use parameter definition label
    const paramDef = parameterDefinitions[paramId];
    return paramDef?.label || null;
}

// Phase accumulators for each modulated parameter
// Key format:
// - Global params (effects): paramId
// - Per-voice params: `voiceIndex:paramId`
const phaseAccumulators = new Map();

// Sample & Hold values stored per parameter/voice
const sampleAndHoldValues = new Map();

// Held pitch values for analog engines (captured at trigger time)
// Key format: `voiceIndex:voice.macroPitch`
// Value: { value: number, timestamp: number }
const heldPitchValues = new Map();

// Hold duration for analog pitch (in ms) - should cover typical drum decay times
const ANALOG_PITCH_HOLD_DURATION = 5000; // 5 seconds

// Crossfade duration when pitch hold expires (in ms)
const PITCH_HOLD_CROSSFADE_DURATION = 100; // 100ms smooth transition

// Pitch hold crossfade state tracking
// Key format: `voiceIndex:paramId`
// Value: { startTime: number, startValue: number, targetValue: number, duration: number }
const pitchHoldCrossfades = new Map();

// Parameter smoothing time (in seconds) for audio-rate ramping
const PARAMETER_SMOOTHING_TIME = 0.015; // 15ms - perceptually instant but eliminates clicks

// Previous parameter values for smoothing (to detect jumps)
// Key format: `voiceIndex:paramId` or just `paramId` for global params
// Value: last applied parameter value
const previousParameterValues = new Map();

// K-rate update throttling (30 FPS)
let lastKRateUpdate = 0;
const K_RATE_INTERVAL = 1000 / 30; // ~33ms

// Throttling for euclidean sequence updates (prevent too-frequent regeneration)
const lastEuclideanUpdate = new Map(); // Key: voiceIndex, Value: timestamp
const EUCLIDEAN_UPDATE_THROTTLE = 50; // ms - max 20 updates per second

// Default modulation configuration for PER-VOICE params (per voice config)
const DEFAULT_VOICE_MOD_CONFIG = {
    enabled: false,
    waveform: 0,      // 0=sin, 1=tri, 2=sq, 3=saw, 4=noise, 5=s&h
    rate: 1.0,        // Hz (0.05-30)
    depth: 0,         // 0-100%
    offset: 0,        // -100 to +100%
    resetMode: 'off', // 'off'|'step'|'accent'|'bar' (legacy - use triggerSource/resetSource)
    triggerSource: 'self', // 'none'|'self'|'T1'-'T6'|'SUM'|'bar'|'noteOn'
    resetSource: 'none',   // 'none'|'self'|'T1'-'T6'|'SUM'|'bar'|'noteOn'
    baseValue: null,  // Stored base value for THIS voice
    muted: false
};

// Default modulation configuration for EFFECT params (global config)
const DEFAULT_EFFECT_MOD_CONFIG = {
    enabled: false,
    waveform: 0,      // 0=sin, 1=tri, 2=sq, 3=saw, 4=noise, 5=s&h
    rate: 1.0,        // Hz (0.05-30)
    depth: 0,         // 0-100%
    offset: 0,        // -100 to +100%
    triggerSource: 'none', // 'none'|'T1'-'T6'|'SUM'|'bar'|'noteOn'
    resetSource: 'none',   // 'none'|'T1'-'T6'|'SUM'|'bar'|'noteOn'
    baseValue: null,  // Stored base value (global)
    muted: false
};

/**
 * Calculate waveform value at given phase
 * @param {number} phase - Phase (0-1)
 * @param {number} waveform - Waveform type (0-5)
 * @param {string} paramId - Parameter ID
 * @param {number|null} voiceIndex - Voice index for per-voice S&H
 * @returns {number} Value (-1 to +1)
 */
function calculateWaveValue(phase, waveform, paramId, voiceIndex = null) {
    switch (waveform) {
        case 0: // Sine
            return Math.sin(phase * Math.PI * 2);

        case 1: // Triangle
            return phase < 0.5
                ? (phase * 4) - 1  // Rising: -1 to +1
                : 3 - (phase * 4); // Falling: +1 to -1

        case 2: // Square
            return phase < 0.5 ? 1 : -1;

        case 3: // Sawtooth
            return 1 - (phase * 2); // Ramp down from +1 to -1

        case 4: // Noise (pseudo-random)
            return Math.sin(phase * 12345.6789) * 0.8;

        case 5: // Sample & Hold
            const key = voiceIndex !== null ? `${voiceIndex}:${paramId}` : paramId;
            if (sampleAndHoldValues.has(key)) {
                return sampleAndHoldValues.get(key);
            } else {
                // Initialize with random value
                const randomValue = (Math.random() * 2) - 1;
                sampleAndHoldValues.set(key, randomValue);
                return randomValue;
            }

        default:
            return 0;
    }
}

/**
 * Get wave value based on modulation mode
 * Returns -1 to +1 for consistent range across all modes
 * @param {string} mode - Modulation mode ('LFO', 'SEQ', 'ENV', 'RND', 'TM', 'EF')
 * @param {object} config - Voice or effect modulation config
 * @param {string} paramId - Parameter ID
 * @param {number|null} voiceIndex - Voice index for per-voice params
 * @param {number} now - Current timestamp (performance.now())
 * @returns {number} Wave value (-1 to +1)
 */
function getWaveValueForMode(mode, config, paramId, voiceIndex, now) {
    const key = voiceIndex !== null ? `${voiceIndex}:${paramId}` : paramId;

    switch (mode) {
        case 'LFO':
        default: {
            // LFO mode uses phase accumulators (handled by existing code)
            // This is a fallback - actual LFO calculation uses phaseAccumulators
            const phaseData = phaseAccumulators.get(key);
            if (phaseData) {
                return calculateWaveValue(phaseData.phase, config.waveform ?? 0, paramId, voiceIndex);
            }
            return 0;
        }

        case 'SEQ': {
            // Step sequencer mode
            let pattern = seqPatterns.get(key);
            if (!pattern) {
                // Create pattern from config
                pattern = new SeqPattern(
                    config.seqLength || 4,
                    config.seqPattern || null
                );
                seqPatterns.set(key, pattern);
            }
            // Sync pattern config if changed (user edited via modal)
            if (config.seqLength && pattern.length !== config.seqLength) {
                pattern.setLength(config.seqLength);
            }
            if (config.seqPattern) {
                pattern.setValues(config.seqPattern);
            }
            // Get current step value (0-1) and map to (-1 to +1)
            const seqValue = pattern.getValue();
            return (seqValue * 2) - 1;
        }

        case 'ENV': {
            // Envelope mode (AD envelope triggered on voice/effect trigger)
            let envelope = envEnvelopes.get(key);
            if (!envelope) {
                envelope = new ADEnvelope(
                    config.envAttackMs || 10,
                    config.envReleaseMs || 200,
                    config.envCurveShape || 'exponential'
                );
                envEnvelopes.set(key, envelope);
            }
            // Get envelope value (0-1) and map to (-1 to +1)
            const envValue = envelope.getValue(now);
            return (envValue * 2) - 1;
        }

        case 'RND': {
            // Random (LFSR) mode
            let generator = rndGenerators.get(key);
            if (!generator) {
                generator = new LFSR(config.rndBitLength || 16);
                rndGenerators.set(key, generator);
            }
            // Get current random value (cached between updates)
            const rndValue = rndCurrentValues.get(key) ?? 0.5;
            return (rndValue * 2) - 1;
        }

        case 'TM': {
            // Turing Machine mode (probabilistic pattern)
            // Get or create pattern from tmPatterns Map (not config - Map holds live mutations)
            let tmPattern = tmPatterns.get(key);
            if (!tmPattern) {
                const length = config.tmLength || 8;
                const initialValues = config.tmPattern ||
                    new Array(length).fill(0).map(() => Math.random());
                tmPattern = { values: initialValues, step: 0 };
                tmPatterns.set(key, tmPattern);
            }
            const currentStep = tmCurrentSteps.get(key) ?? tmPattern.step ?? 0;
            const tmValue = tmPattern.values[currentStep] ?? 0.5;
            return (tmValue * 2) - 1;
        }

        case 'EF': {
            // Envelope Follower mode
            const efValue = efSmoothedValues.get(key) ?? 0;
            const sensitivity = (config.efSensitivity || 100) / 100;
            const scaledValue = Math.min(1, efValue * sensitivity);
            return (scaledValue * 2) - 1;
        }
    }
}

/**
 * Set parameter value with audio-rate smoothing to prevent clicks/pops
 * This wrapper adds linear ramping for parameters that support it
 * @param {string} paramId - Parameter ID
 * @param {number} newValue - Target value
 * @param {number|null} voiceIndex - Voice index for per-voice params, null for global
 * @param {number} smoothingTime - Smoothing duration in seconds (default: PARAMETER_SMOOTHING_TIME)
 */
function setParameterValueSmoothed(paramId, newValue, voiceIndex = null, smoothingTime = PARAMETER_SMOOTHING_TIME) {
    const key = voiceIndex !== null ? `${voiceIndex}:${paramId}` : paramId;

    // Get previous value to detect jumps
    const previousValue = previousParameterValues.get(key);

    // Calculate jump size if we have a previous value
    const paramDef = parameterDefinitions[paramId];
    if (previousValue !== undefined && paramDef) {
        const range = paramDef.max - paramDef.min;
        const jumpSize = Math.abs(newValue - previousValue);
        const jumpPercentage = (jumpSize / range) * 100;

        // If jump is very small (< 0.1% of range), apply directly without smoothing overhead
        if (jumpPercentage < 0.1) {
            if (voiceIndex !== null) {
                setParameterValueForVoice(paramId, newValue, voiceIndex);
            } else {
                setParameterValue(paramId, newValue);
            }
            previousParameterValues.set(key, newValue);
            return;
        }
    }

    // Apply the parameter value
    if (voiceIndex !== null) {
        setParameterValueForVoice(paramId, newValue, voiceIndex);
    } else {
        setParameterValue(paramId, newValue);
    }

    // Store this value for next comparison
    previousParameterValues.set(key, newValue);

    // Store smoothing metadata for future use by audio engine
    // This could be used by engine.js to apply audio-rate ramping
    if (!state.parameterSmoothingMetadata) {
        state.parameterSmoothingMetadata = new Map();
    }

    state.parameterSmoothingMetadata.set(key, {
        previousValue: previousValue,
        targetValue: newValue,
        smoothingTime: smoothingTime,
        timestamp: performance.now()
    });
}

/**
 * Get or create modulation configuration for a parameter
 * CRITICAL: Returns different structures for voice params vs effect params
 *
 * Voice params: { isVoiceParam: true, voices: [config0, config1, ...] }
 * Effect params: { isVoiceParam: false, enabled, waveform, rate, ... }
 *
 * @param {string} paramId - Parameter ID
 * @returns {object} Modulation configuration
 */
export function getModulationConfig(paramId) {
    if (!state.perParamModulations[paramId]) {
        const paramDef = parameterDefinitions[paramId];

        if (paramDef && paramDef.voiceParam) {
            // VOICE PARAMETER: Create per-voice config structure
            state.perParamModulations[paramId] = {
                isVoiceParam: true,
                voices: Array(state.voices.length).fill(null).map(() => ({
                    ...DEFAULT_VOICE_MOD_CONFIG
                }))
            };
        } else {
            // EFFECT PARAMETER: Create global config structure
            state.perParamModulations[paramId] = {
                isVoiceParam: false,
                ...DEFAULT_EFFECT_MOD_CONFIG
            };
        }
    }
    return state.perParamModulations[paramId];
}

/**
 * Initialize per-parameter modulation system
 */
export function initPerParamModulation() {

    // Set up event listeners for track triggers
    document.addEventListener('trackTriggered', handleTrackTrigger);
    document.addEventListener('sequencerStep', handleStepTrigger);

    // Bar boundary trigger (shared clock broadcasts step events with isBarStart flag)
    document.addEventListener('baengStepAdvanced', handleBarTrigger);

    // Cross-app triggers: Bæng can respond to Ræmbl note events
    document.addEventListener('raemblNoteOn', handleRaemblNoteTrigger);

    // Set up PPMod modal event handlers
    document.addEventListener('ppmodUpdate', handlePPModUpdate);
    document.addEventListener('ppmodVoiceChange', handlePPModVoiceChange);
}

/**
 * Handle bar boundary triggers
 * Check if any modulations have triggerSource='bar' or resetSource='bar'
 */
function handleBarTrigger(event) {
    const isBarStart = event.detail?.isBarStart;
    if (!isBarStart) return;

    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        if (!modConfig.enabled) continue;

        // Handle trigger on bar
        if (modConfig.triggerSource === 'bar') {
            handleModTrigger(paramId, modConfig);
        }

        // Handle reset on bar
        if (modConfig.resetSource === 'bar') {
            handleModReset(paramId, modConfig);
        }

        // Per-voice params: check each voice's config
        if (modConfig.isVoiceParam && modConfig.voices) {
            for (let voiceIndex = 0; voiceIndex < modConfig.voices.length; voiceIndex++) {
                const voiceConfig = modConfig.voices[voiceIndex];
                if (!voiceConfig?.enabled) continue;

                if (voiceConfig.triggerSource === 'bar') {
                    handleModTriggerForVoice(paramId, voiceConfig, voiceIndex);
                }
                if (voiceConfig.resetSource === 'bar') {
                    handleModResetForVoice(paramId, voiceConfig, voiceIndex);
                }
            }
        }
    }
}

/**
 * Handle Ræmbl note triggers (cross-app)
 * Allows Bæng modulations to sync to Ræmbl note events
 */
function handleRaemblNoteTrigger(event) {
    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        if (!modConfig.enabled) continue;

        // Handle trigger on Ræmbl noteOn
        if (modConfig.triggerSource === 'noteOn') {
            handleModTrigger(paramId, modConfig);
        }

        // Handle reset on Ræmbl noteOn
        if (modConfig.resetSource === 'noteOn') {
            handleModReset(paramId, modConfig);
        }
    }
}

/**
 * Handle modulation trigger action (advance pattern, re-trigger envelope, etc.)
 */
function handleModTrigger(paramId, modConfig) {
    const mode = modConfig.mode || 'LFO';

    switch (mode) {
        case 'SEQ':
            // Advance to next step
            const seqPattern = seqPatterns.get(paramId);
            if (seqPattern) {
                seqPattern.currentStep = (seqPattern.currentStep + 1) % seqPattern.steps.length;
            }
            break;
        case 'TM':
            // Advance step with probabilistic mutation
            advanceTMStep(paramId, modConfig);
            break;
        case 'ENV':
            // Re-trigger envelope from attack
            const envelope = envEnvelopes.get(paramId);
            if (envelope) {
                envelope.triggerTime = performance.now();
                envelope.phase = 'attack';
            }
            break;
        case 'RND':
            // Sample new random value
            sampleAndHoldValues.set(paramId, (Math.random() * 2) - 1);
            break;
        case 'LFO':
            // Reset phase to 0
            const phaseData = phaseAccumulators.get(paramId);
            if (phaseData) phaseData.phase = 0;
            break;
    }
}

/**
 * Handle modulation reset action (return to initial state)
 */
function handleModReset(paramId, modConfig) {
    const mode = modConfig.mode || 'LFO';

    switch (mode) {
        case 'SEQ':
            // Return to step 0
            const seqPattern = seqPatterns.get(paramId);
            if (seqPattern) seqPattern.currentStep = 0;
            break;
        case 'TM':
            // Return to step 0, restore initial pattern
            resetTMToInitial(paramId, modConfig);
            break;
        case 'ENV':
            // Force envelope to zero
            const envelope = envEnvelopes.get(paramId);
            if (envelope) {
                envelope.phase = 'idle';
                envelope.currentValue = 0;
            }
            break;
        case 'RND':
            // Re-seed LFSR to initial state
            const lfsr = rndLFSRs.get(paramId);
            if (lfsr) lfsr.state = lfsr.initialState || 0xACE1;
            sampleAndHoldValues.set(paramId, 0);
            break;
        case 'LFO':
            // Reset phase to 0
            const phaseData = phaseAccumulators.get(paramId);
            if (phaseData) phaseData.phase = 0;
            break;
        case 'EF':
            // Zero smoothed output
            efSmoothedValues.set(paramId, 0);
            break;
    }
}

/**
 * Handle modulation trigger for a specific voice
 */
function handleModTriggerForVoice(paramId, voiceConfig, voiceIndex) {
    const key = `${voiceIndex}:${paramId}`;
    const mode = voiceConfig.mode || 'LFO';

    switch (mode) {
        case 'SEQ':
            const seqPattern = seqPatterns.get(key);
            if (seqPattern) {
                seqPattern.currentStep = (seqPattern.currentStep + 1) % seqPattern.steps.length;
            }
            break;
        case 'TM':
            advanceTMStep(key, voiceConfig);
            break;
        case 'ENV':
            const envelope = envEnvelopes.get(key);
            if (envelope) {
                envelope.triggerTime = performance.now();
                envelope.phase = 'attack';
            }
            break;
        case 'RND':
            sampleAndHoldValues.set(key, (Math.random() * 2) - 1);
            break;
        case 'LFO':
            const phaseData = phaseAccumulators.get(key);
            if (phaseData) phaseData.phase = 0;
            break;
    }
}

/**
 * Handle modulation reset for a specific voice
 */
function handleModResetForVoice(paramId, voiceConfig, voiceIndex) {
    const key = `${voiceIndex}:${paramId}`;
    const mode = voiceConfig.mode || 'LFO';

    switch (mode) {
        case 'SEQ':
            const seqPattern = seqPatterns.get(key);
            if (seqPattern) seqPattern.currentStep = 0;
            break;
        case 'TM':
            resetTMToInitial(key, voiceConfig);
            break;
        case 'ENV':
            const envelope = envEnvelopes.get(key);
            if (envelope) {
                envelope.phase = 'idle';
                envelope.currentValue = 0;
            }
            break;
        case 'RND':
            const lfsr = rndLFSRs.get(key);
            if (lfsr) lfsr.state = lfsr.initialState || 0xACE1;
            sampleAndHoldValues.set(key, 0);
            break;
        case 'LFO':
            const phaseData = phaseAccumulators.get(key);
            if (phaseData) phaseData.phase = 0;
            break;
        case 'EF':
            efSmoothedValues.set(key, 0);
            break;
    }
}

/**
 * Reset TM pattern to initial state
 */
function resetTMToInitial(key, modConfig) {
    const tmState = tmCurrentSteps.get(key);
    if (tmState) {
        tmState.currentStep = 0;
        // Restore initial pattern if stored
        if (tmState.initialPattern) {
            tmState.pattern = [...tmState.initialPattern];
        }
    }
}

/**
 * Advance TM step with probabilistic mutation
 */
function advanceTMStep(key, modConfig) {
    let tmState = tmCurrentSteps.get(key);
    if (!tmState) {
        tmState = { currentStep: 0, pattern: [], initialPattern: [] };
        tmCurrentSteps.set(key, tmState);
    }

    // Advance step
    tmState.currentStep = (tmState.currentStep + 1) % Math.max(1, tmState.pattern.length);

    // Probabilistic mutation (simple for now)
    const mutationChance = (modConfig.tmMutationRate || 10) / 100;
    if (Math.random() < mutationChance && tmState.pattern.length > 0) {
        const stepToMutate = Math.floor(Math.random() * tmState.pattern.length);
        tmState.pattern[stepToMutate] = Math.random();
    }
}

/**
 * Handle modulation parameter updates from PPMod modal
 */
function handlePPModUpdate(event) {
    const { paramId, app, modParam, value, voiceIndex, isVoiceParam } = event.detail;
    if (app !== 'baeng') return;

    // Get or create modulation config for this parameter
    let modConfig = state.perParamModulations[paramId];
    if (!modConfig) {
        // Create new modulation config
        modConfig = createDefaultModConfig(paramId, isVoiceParam);
        state.perParamModulations[paramId] = modConfig;
    }

    // Get the target config (per-voice or global)
    let targetConfig;
    if (isVoiceParam && voiceIndex !== null && modConfig.voices) {
        targetConfig = modConfig.voices[voiceIndex];
        if (!targetConfig) {
            targetConfig = createDefaultVoiceConfig();
            modConfig.voices[voiceIndex] = targetConfig;
        }
    } else {
        targetConfig = modConfig;
    }

    // Map modal param names to state config properties
    switch (modParam) {
        case 'mode':
            targetConfig.mode = value;
            targetConfig.enabled = true;
            break;
        case 'depth':
            targetConfig.depth = value;
            targetConfig.enabled = value > 0;
            // Store baseValue if not already set
            if (value > 0 && targetConfig.baseValue === null) {
                const paramDef = parameterDefinitions[paramId];
                if (paramDef) {
                    if (isVoiceParam && voiceIndex !== null) {
                        // Get value directly from voice object
                        const voice = state.voices[voiceIndex];
                        if (voice && paramDef.statePath) {
                            targetConfig.baseValue = voice[paramDef.statePath] ?? paramDef.default ?? 0;
                        }
                    } else {
                        targetConfig.baseValue = getParameterValue(paramId);
                    }
                }
            }
            break;
        case 'offset':
            targetConfig.offset = value;
            break;
        // LFO mode
        case 'lfoWaveform':
            targetConfig.waveform = value;
            break;
        case 'lfoRate':
            targetConfig.rate = value;
            break;
        // SEQ mode
        case 'seqLength':
            targetConfig.seqLength = value;
            if (!targetConfig.seqPattern) targetConfig.seqPattern = [];
            while (targetConfig.seqPattern.length < value) {
                targetConfig.seqPattern.push(0.5);
            }
            targetConfig.seqPattern = targetConfig.seqPattern.slice(0, value);
            break;
        case 'seqStep':
            if (!targetConfig.seqPattern) targetConfig.seqPattern = [0.5, 0.5, 0.5, 0.5];
            if (value.step < targetConfig.seqPattern.length) {
                targetConfig.seqPattern[value.step] = value.value;
            }
            break;
        // ENV mode
        case 'envAttackMs':
            targetConfig.envAttackMs = value;
            break;
        case 'envReleaseMs':
            targetConfig.envReleaseMs = value;
            break;
        case 'envCurveShape':
            targetConfig.envCurveShape = value;
            break;
        // RND mode
        case 'rndBitLength':
            targetConfig.rndBitLength = value;
            break;
        case 'rndProbability':
            targetConfig.rndProbability = value;
            break;
        case 'rndSampleRate':
            targetConfig.rndSampleRate = value;
            break;
        // TM mode
        case 'tmLength':
            targetConfig.tmLength = value;
            break;
        case 'tmProbability':
            targetConfig.tmProbability = value;
            break;
        case 'tmStep':
            if (!targetConfig.tmPattern) {
                targetConfig.tmPattern = Array(targetConfig.tmLength || 8).fill(0).map(() => Math.random());
            }
            if (value.step < targetConfig.tmPattern.length) {
                targetConfig.tmPattern[value.step] = value.value;
            }
            break;
        // EF mode
        case 'efAttackMs':
            targetConfig.efAttackMs = value;
            break;
        case 'efReleaseMs':
            targetConfig.efReleaseMs = value;
            break;
        case 'efSensitivity':
            targetConfig.efSensitivity = value;
            break;
        // Reset mode (voice params)
        case 'resetMode':
            targetConfig.resetMode = value;
            break;
        // Trigger source
        case 'triggerSource':
            targetConfig.triggerSource = value;
            break;
        // Reset source
        case 'resetSource':
            targetConfig.resetSource = value;
            break;
        default:
            console.warn(`[Bæng PPMod] Unknown modParam: ${modParam}`);
    }
}

/**
 * Handle voice change from PPMod modal
 */
function handlePPModVoiceChange(event) {
    const { paramId, app, voiceIndex } = event.detail;
    if (app !== 'baeng') return;

    // The modal requests new modConfig for this voice
    // This will be handled by the modal reopening with new config
}

/**
 * Create default modulation config for a parameter
 */
function createDefaultModConfig(paramId, isVoiceParam) {
    if (isVoiceParam) {
        return {
            isVoiceParam: true,
            voices: Array(6).fill(null).map(() => createDefaultVoiceConfig())
        };
    } else {
        return {
            isVoiceParam: false,
            mode: 'LFO',
            enabled: false,
            waveform: 0,
            rate: 1.0,
            depth: 0,
            offset: 0,
            resetMode: 'off',
            triggerSource: 'none',
            muted: false,
            baseValue: null,
            // Mode-specific defaults
            seqLength: 4,
            seqPattern: [0.5, 0.5, 0.5, 0.5],
            envAttackMs: 10,
            envReleaseMs: 200,
            envCurveShape: 'exponential',
            rndBitLength: 16,
            rndProbability: 100,
            rndSampleRate: 1000,
            tmLength: 8,
            tmProbability: 50,
            tmPattern: null,
            efAttackMs: 10,
            efReleaseMs: 100,
            efSensitivity: 100
        };
    }
}

/**
 * Create default per-voice modulation config
 */
function createDefaultVoiceConfig() {
    return {
        mode: 'LFO',
        enabled: false,
        waveform: 0,
        rate: 1.0,
        depth: 0,
        offset: 0,
        resetMode: 'off',
        muted: false,
        baseValue: null,
        // Mode-specific defaults
        seqLength: 4,
        seqPattern: [0.5, 0.5, 0.5, 0.5],
        envAttackMs: 10,
        envReleaseMs: 200,
        envCurveShape: 'exponential',
        rndBitLength: 16,
        rndProbability: 100,
        rndSampleRate: 1000,
        tmLength: 8,
        tmProbability: 50,
        tmPattern: null,
        efAttackMs: 10,
        efReleaseMs: 100,
        efSensitivity: 100
    };
}

/**
 * Handle track trigger events for S&H sampling and phase reset
 * @param {CustomEvent} event - Track trigger event
 */
function handleTrackTrigger(event) {
    const trackIndex = event.detail?.trackIndex;
    if (trackIndex === undefined) return;

    const trackName = `T${trackIndex + 1}`;
    const accentLevel = event.detail?.accentLevel || 0;
    const isBarStart = event.detail?.isBarStart || false;

    // Process all active modulations
    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        // Handle voice parameters (per-voice modulation)
        if (modConfig.isVoiceParam) {
            // Voice parameters have per-voice configuration
            if (!modConfig.voices || !modConfig.voices[trackIndex]) continue;

            const voiceConfig = modConfig.voices[trackIndex];

            // --- Mode-specific trigger handling (patterns advance regardless of depth) ---
            const mode = voiceConfig.mode || 'LFO';
            const key = `${trackIndex}:${paramId}`;

            // SEQ mode: Advance pattern step (always advance when triggered)
            if (mode === 'SEQ') {
                let seqPattern = seqPatterns.get(key);
                if (!seqPattern) {
                    seqPattern = new SeqPattern(
                        voiceConfig.seqLength || 4,
                        voiceConfig.seqPattern || null
                    );
                    seqPatterns.set(key, seqPattern);
                }
                seqPattern.advance();
                // Sync to state for modal visualization
                voiceConfig.seqCurrentStep = seqPattern.currentStep;
            }

            // TM mode: Advance step with probabilistic mutation (always advance when triggered)
            if (mode === 'TM') {
                let tmPattern = tmPatterns.get(key);
                if (!tmPattern) {
                    const length = voiceConfig.tmLength || 8;
                    const initialValues = voiceConfig.tmPattern ||
                        new Array(length).fill(0).map(() => Math.random());
                    tmPattern = { values: initialValues, step: 0 };
                    tmPatterns.set(key, tmPattern);
                }
                tmPattern.step = (tmPattern.step + 1) % tmPattern.values.length;
                tmCurrentSteps.set(key, tmPattern.step);
                const probability = (voiceConfig.tmProbability ?? 50) / 100;
                if (Math.random() < probability) {
                    tmPattern.values[tmPattern.step] = Math.random();
                }
                // Sync to state for modal visualization
                voiceConfig.tmPattern = tmPattern.values;
                voiceConfig.tmCurrentStep = tmPattern.step;
            }

            // ENV mode: Trigger envelope (only when enabled - envelope tracks note events)
            if (mode === 'ENV' && voiceConfig.enabled) {
                let envelope = envEnvelopes.get(key);
                if (!envelope) {
                    envelope = new ADEnvelope(
                        voiceConfig.envAttackMs || 10,
                        voiceConfig.envReleaseMs || 200,
                        voiceConfig.envCurveShape || 'exponential'
                    );
                    envEnvelopes.set(key, envelope);
                }
                envelope.trigger(performance.now());
            }

            // RND mode: Sample new random value (always sample when triggered)
            if (mode === 'RND') {
                const rndValue = Math.random(); // 0-1
                rndCurrentValues.set(key, rndValue);
            }

            // Check basic conditions for audio modulation (S&H sampling, phase reset, etc.)
            if (!voiceConfig.enabled || voiceConfig.depth === 0 || voiceConfig.muted) continue;

            // Sample new S&H value based on resetMode
            if (voiceConfig.waveform === 5) { // S&H waveform
                let shouldSample = false;

                switch (voiceConfig.resetMode) {
                    case 'step':
                        // Always sample on this voice's trigger
                        shouldSample = true;
                        break;
                    case 'accent':
                        // Sample only if step has accent
                        shouldSample = accentLevel > 0;
                        break;
                    case 'bar':
                        // Sample at bar start
                        shouldSample = isBarStart;
                        break;
                    case 'off':
                    default:
                        // Continuous LFO, don't resample
                        shouldSample = false;
                        break;
                }

                if (shouldSample) {
                    // Sample new random value for this voice
                    const key = `${trackIndex}:${paramId}`;
                    const randomValue = (Math.random() * 2) - 1;
                    sampleAndHoldValues.set(key, randomValue);
                }
            }

            // Special handling for PITCH modulation on analog engines:
            // Calculate and set the modulated value NOW (sample-and-hold at trigger time)
            const isAnalogEngine = ['aKICK', 'aSNARE', 'aHIHAT'].includes(state.voices[trackIndex]?.engine);
            const isPitchParam = paramId === 'voice.macroPitch';

            if (isAnalogEngine && isPitchParam) {
                // Calculate the current modulated value based on LFO phase
                const phaseKey = `${trackIndex}:${paramId}`;
                const phaseData = phaseAccumulators.get(phaseKey);

                if (phaseData && voiceConfig.baseValue !== null) {
                    const paramDef = parameterDefinitions[paramId];
                    const waveValue = calculateWaveValue(phaseData.phase, voiceConfig.waveform, paramId, trackIndex);
                    const range = paramDef.max - paramDef.min;
                    const modAmount = (waveValue * voiceConfig.depth * 0.5) + voiceConfig.offset;
                    const modulatedValue = voiceConfig.baseValue + (modAmount / 100) * range;
                    const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

                    // Set this value in state NOW and mark it as held with timestamp
                    setParameterValueForVoice(paramId, clampedValue, trackIndex);
                    const holdKey = `${trackIndex}:${paramId}`;
                    heldPitchValues.set(holdKey, {
                        value: clampedValue,
                        timestamp: performance.now()
                    });
                }
            }

            // Reset phase if resetMode requires it
            if (voiceConfig.resetMode === 'step' ||
                (voiceConfig.resetMode === 'accent' && accentLevel > 0) ||
                (voiceConfig.resetMode === 'bar' && isBarStart)) {
                const phaseKey = `${trackIndex}:${paramId}`;
                if (phaseAccumulators.has(phaseKey)) {
                    phaseAccumulators.get(phaseKey).phase = 0;
                }
            }

            continue; // Move to next parameter
        }

        // Handle effect parameters (global modulation)
        // Check if this effect parameter modulation should respond to this trigger
        // Use case-insensitive comparison to handle 'T1' vs 't1' variations
        const triggerSourceUpper = (modConfig.triggerSource || '').toUpperCase();
        const shouldTrigger = triggerSourceUpper === trackName || triggerSourceUpper === 'SUM';
        if (!shouldTrigger) continue;

        // --- Mode-specific trigger handling (patterns advance regardless of depth) ---
        const mode = modConfig.mode || 'LFO';

        // SEQ mode: Advance pattern step (always advance when triggered)
        if (mode === 'SEQ') {
            let seqPattern = seqPatterns.get(paramId);
            if (!seqPattern) {
                seqPattern = new SeqPattern(
                    modConfig.seqLength || 4,
                    modConfig.seqPattern || null
                );
                seqPatterns.set(paramId, seqPattern);
            }
            seqPattern.advance();
            // Sync to state for modal visualization
            modConfig.seqCurrentStep = seqPattern.currentStep;
        }

        // TM mode: Advance step with probabilistic mutation (always advance when triggered)
        if (mode === 'TM') {
            let tmPattern = tmPatterns.get(paramId);
            if (!tmPattern) {
                const length = modConfig.tmLength || 8;
                const initialValues = modConfig.tmPattern ||
                    new Array(length).fill(0).map(() => Math.random());
                tmPattern = { values: initialValues, step: 0 };
                tmPatterns.set(paramId, tmPattern);
            }
            tmPattern.step = (tmPattern.step + 1) % tmPattern.values.length;
            tmCurrentSteps.set(paramId, tmPattern.step);
            const probability = (modConfig.tmProbability ?? 50) / 100;
            if (Math.random() < probability) {
                tmPattern.values[tmPattern.step] = Math.random();
            }
            // Sync to state for modal visualization
            modConfig.tmPattern = tmPattern.values;
            modConfig.tmCurrentStep = tmPattern.step;
        }

        // ENV mode: Trigger envelope (only when enabled)
        if (mode === 'ENV' && modConfig.enabled) {
            let envelope = envEnvelopes.get(paramId);
            if (!envelope) {
                envelope = new ADEnvelope(
                    modConfig.envAttackMs || 10,
                    modConfig.envReleaseMs || 200,
                    modConfig.envCurveShape || 'exponential'
                );
                envEnvelopes.set(paramId, envelope);
            }
            envelope.trigger(performance.now());
        }

        // RND mode: Sample new random value (always sample when triggered)
        if (mode === 'RND') {
            const rndValue = Math.random(); // 0-1
            rndCurrentValues.set(paramId, rndValue);
        }

        // Check basic conditions for audio modulation (S&H sampling, phase reset)
        if (!modConfig.enabled || modConfig.depth === 0 || modConfig.muted) continue;

        // Sample new S&H value if using S&H waveform
        if (modConfig.waveform === 5) {
            // Effect parameter: single global sample
            const randomValue = (Math.random() * 2) - 1;
            sampleAndHoldValues.set(paramId, randomValue);
        }

        // Reset phase if trigger source matches
        resetPhaseForParameter(paramId);
    }
}

/**
 * Handle step trigger for 'step' reset mode
 */
function handleStepTrigger() {
    // Not implemented yet - placeholder for future step-based reset
}

/**
 * Reset phase accumulator for a parameter
 * @param {string} paramId - Parameter ID
 */
function resetPhaseForParameter(paramId) {
    const paramDef = parameterDefinitions[paramId];

    if (paramDef && paramDef.voiceParam) {
        // Reset all per-voice phases
        for (let v = 0; v < state.voices.length; v++) {
            const key = `${v}:${paramId}`;
            const phaseData = phaseAccumulators.get(key);
            if (phaseData) {
                phaseData.phase = 0;
            }
        }
    } else {
        // Reset global phase
        const phaseData = phaseAccumulators.get(paramId);
        if (phaseData) {
            phaseData.phase = 0;
        }
    }
}

/**
 * Apply per-parameter modulations (called every frame)
 */
export function applyPerParamModulations() {
    const now = performance.now();

    // Throttle to 30 FPS for k-rate params
    if (now - lastKRateUpdate < K_RATE_INTERVAL) return;
    lastKRateUpdate = now;

    // Process each active modulation (includes lazy-init of baseValue)
    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) continue;

        // Check if ANY voice has modulation enabled (for voice params) or if global param is enabled
        // Note: Don't check baseValue here - lazy-init will capture it in applyPerVoiceModulation
        let hasActiveModulation = false;
        if (modConfig.isVoiceParam) {
            // Voice param: check if ANY voice has enabled modulation
            hasActiveModulation = modConfig.voices && modConfig.voices.some(v => v.enabled && v.depth > 0 && !v.muted);
        } else {
            // Effect param: check global enabled state
            hasActiveModulation = modConfig.enabled && modConfig.depth > 0 && !modConfig.muted;
        }

        if (!hasActiveModulation) continue;

        // Determine if this is a per-voice parameter
        if (paramDef.voiceParam) {
            // Apply per-voice modulation
            applyPerVoiceModulation(paramId, modConfig, paramDef, now);
        } else {
            // Apply global modulation
            applyGlobalModulation(paramId, modConfig, paramDef, now);
        }
    }

    // Update knob and fader visuals AFTER modulation loop (so lazy-init baseValue is captured)
    updateModulatedKnobVisuals();
    updateModulatedFaderVisuals();
}

/**
 * Apply modulation to a per-voice parameter
 * CRITICAL: Each voice has completely independent modulation settings
 * @param {string} paramId - Parameter ID
 * @param {object} modConfig - Modulation configuration (isVoiceParam=true, voices array)
 * @param {object} paramDef - Parameter definition
 * @param {number} now - Current timestamp
 */
function applyPerVoiceModulation(paramId, modConfig, paramDef, now) {
    // Sanity check: ensure we have per-voice structure
    if (!modConfig.isVoiceParam || !modConfig.voices) {
        console.error(`❌ applyPerVoiceModulation called with wrong structure for ${paramId}`);
        return;
    }

    // Apply modulation to each voice independently with PER-VOICE settings
    for (let voiceIndex = 0; voiceIndex < state.voices.length; voiceIndex++) {
        const voiceConfig = modConfig.voices[voiceIndex];

        // Skip if THIS voice doesn't have modulation enabled
        if (!voiceConfig.enabled || voiceConfig.depth === 0 || voiceConfig.muted) {
            continue;
        }

        // Skip modulation if user is actively dragging THIS VOICE's parameter
        // Use compound key to check specific voice
        const compoundKey = `${voiceIndex}:${paramId}`;
        if (state.modEditMode?.draggedParamId === compoundKey) {
            continue;
        }

        // Lazy-init baseValue if not captured yet (enables TM/SEQ/ENV/RND modes to work)
        if (voiceConfig.baseValue === null || voiceConfig.baseValue === undefined) {
            const voice = state.voices[voiceIndex];
            if (voice && paramDef.statePath) {
                voiceConfig.baseValue = voice[paramDef.statePath] ?? paramDef.default ?? 0;
                console.warn(`⚠️ Lazy init: baseValue for ${paramId} voice ${voiceIndex} captured during modulation. Value: ${voiceConfig.baseValue}`);
            } else {
                continue; // Can't modulate without base value
            }
        }

        // For SAMPLE engine macroPatch, use center value (50) as base for full range modulation
        let baseValue = voiceConfig.baseValue;
        if (paramId === 'voice.macroPatch' && state.voices[voiceIndex].engine === 'SAMPLE') {
            baseValue = 50; // Center of 0-100 range for symmetrical modulation
        }

        // Use per-voice phase key
        const phaseKey = `${voiceIndex}:${paramId}`;

        // Get modulation mode (default to LFO for backward compatibility)
        const mode = voiceConfig.mode || 'LFO';
        let waveValue;

        if (mode === 'LFO') {
            // LFO mode: Use phase accumulators
            if (!phaseAccumulators.has(phaseKey)) {
                phaseAccumulators.set(phaseKey, {
                    phase: 0,
                    lastTime: now
                });
            }

            const phaseData = phaseAccumulators.get(phaseKey);

            // Advance phase with THIS voice's rate
            const deltaTime = (now - phaseData.lastTime) / 1000; // seconds
            phaseData.phase = (phaseData.phase + (voiceConfig.rate || 1.0) * deltaTime) % 1.0;
            phaseData.lastTime = now;

            // Calculate waveform value with THIS voice's waveform
            waveValue = calculateWaveValue(phaseData.phase, voiceConfig.waveform ?? 0, paramId, voiceIndex);
        } else {
            // Other modes: Use getWaveValueForMode
            waveValue = getWaveValueForMode(mode, voiceConfig, paramId, voiceIndex, now);
        }

        // Calculate modulated value with THIS voice's depth and offset
        let range = paramDef.max - paramDef.min;
        let modulatedValue;

        // Special handling for SAMPLE engine macroPatch - modulate across full sample range
        // Use per-voice buffer array (NOT global manager)
        const voice = state.voices[voiceIndex];
        if (paramId === 'voice.macroPatch' && voice.engine === 'SAMPLE') {
            const voiceSampleBank = voice.samplerBuffer;
            const sampleCount = voiceSampleBank?.length || 0;
            if (sampleCount > 0) {
                // For samples, depth % should represent % of total sample range
                // depth 100% = full range (all samples), depth 50% = half range
                // Map samples evenly across 0-100 range: each sample gets 100/sampleCount macroPatch units
                const macroPatchPerSample = 100 / sampleCount;
                range = 100; // Keep using 0-100 range
                const modAmount = (waveValue * voiceConfig.depth * 0.5) + voiceConfig.offset;
                modulatedValue = baseValue + (modAmount / 100) * range;

            } else {
                const modAmount = (waveValue * voiceConfig.depth * 0.5) + voiceConfig.offset;
                modulatedValue = baseValue + (modAmount / 100) * range;
            }
        } else {
            const modAmount = (waveValue * voiceConfig.depth * 0.5) + voiceConfig.offset;
            modulatedValue = baseValue + (modAmount / 100) * range;
        }

        const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

        // Special handling for analog engine PITCH: Hold value after trigger
        // This prevents pitch sweeping during the drum sound
        const isAnalogEngine = ['aKICK', 'aSNARE', 'aHIHAT'].includes(state.voices[voiceIndex]?.engine);
        const isPitchParam = paramId === 'voice.macroPitch';

        if (isAnalogEngine && isPitchParam) {
            const holdKey = `${voiceIndex}:${paramId}`;
            const holdData = heldPitchValues.get(holdKey);
            const crossfadeData = pitchHoldCrossfades.get(holdKey);

            // If we have a held value and it's still within the hold duration, use it
            if (holdData && (now - holdData.timestamp < ANALOG_PITCH_HOLD_DURATION)) {
                // Keep using the held value, don't update with new modulation
                continue;
            }

            // Hold expired - initiate or continue crossfade
            if (holdData && (now - holdData.timestamp >= ANALOG_PITCH_HOLD_DURATION)) {
                // Check if we need to start a new crossfade
                if (!crossfadeData) {
                    // Start crossfade from held value to modulated value
                    pitchHoldCrossfades.set(holdKey, {
                        startTime: now,
                        startValue: holdData.value,
                        targetValue: clampedValue,
                        duration: PITCH_HOLD_CROSSFADE_DURATION
                    });
                    heldPitchValues.delete(holdKey); // Clear hold data

                    // Use the start value for this frame
                    setParameterValueSmoothed(paramId, holdData.value, voiceIndex, PARAMETER_SMOOTHING_TIME);
                    continue;
                }
            }

            // If we're in a crossfade, interpolate between start and target
            if (crossfadeData) {
                const elapsed = now - crossfadeData.startTime;

                if (elapsed < crossfadeData.duration) {
                    // Still crossfading - interpolate
                    const progress = elapsed / crossfadeData.duration;
                    const smoothProgress = progress; // Linear for now, could use easing
                    const interpolatedValue = crossfadeData.startValue +
                        (clampedValue - crossfadeData.startValue) * smoothProgress;

                    setParameterValueSmoothed(paramId, interpolatedValue, voiceIndex, PARAMETER_SMOOTHING_TIME);
                    continue;
                } else {
                    // Crossfade complete - clear it and allow normal modulation
                    pitchHoldCrossfades.delete(holdKey);
                    // Fall through to normal modulation below
                }
            }
        }

        // Apply to this specific voice using smoothed setter to prevent clicks/pops
        // CRITICAL FIX: Use setParameterValueForVoice instead of temporarily changing selectedVoice
        setParameterValueSmoothed(paramId, clampedValue, voiceIndex, PARAMETER_SMOOTHING_TIME);

        // Special handling for decay parameters - update active voices in real-time
        if (paramId === 'voice.layerADecay' || paramId === 'voice.layerBDecay') {
            const decayParams = {};
            if (paramId === 'voice.layerADecay') {
                decayParams.layerADecay = clampedValue;
            } else if (paramId === 'voice.layerBDecay') {
                decayParams.layerBDecay = clampedValue;
            }
            updateVoiceEnvelope(voiceIndex, decayParams);
        }

        // Special handling for macro parameters - apply macros to underlying parameters
        // Apply only the specific macro that changed (don't re-apply all macros)
        if (paramId.startsWith('voice.macro')) {
            applySingleMacro(paramId, state.voices[voiceIndex]);

            // For analog engines, also update active voice instances in real-time
            const voice = state.voices[voiceIndex];
            if (voice && (voice.engine === 'aKICK' || voice.engine === 'aSNARE' || voice.engine === 'aHIHAT')) {
                updateAnalogEngineParams(voiceIndex, voice);
            }

            // NOTE: For DX7 PITCH modulation, we do NOT update in real-time.
            // Pitch changes should only happen on note triggers (sample-and-hold style).
            // The modulated macroPitch value in state.voices[voiceIndex].macroPitch will be
            // read by engine.js when triggering the next note.
            // When gate = 100%, the engine handles sliding to the new pitch.
        }

        // Special handling for SLICE engine PATCH macro - already handled by applySingleMacro()
        // which maps macroPatch (0-100) to sliceIndex (0 to sliceCount-1)
        // No additional handling needed here

        // Special handling for DX7 patch index changes
        if (paramId === 'voice.dx7PatchIndex') {
            handleDX7PatchChangeForVoice(voiceIndex, clampedValue);
        }

        // Special handling for euclidean parameters - regenerate sequence when modulated
        if (paramId.startsWith('euclidean.') || paramId === 'sequence.probability') {
            handleEuclideanParameterChange(voiceIndex);
        }
    }
}

/**
 * Handle euclidean parameter change from per-voice modulation
 * Triggers sequence regeneration and UI update (throttled)
 * @param {number} voiceIndex - Voice index
 */
function handleEuclideanParameterChange(voiceIndex) {
    // Throttle updates to prevent too-frequent regeneration
    const now = performance.now();
    const lastUpdate = lastEuclideanUpdate.get(voiceIndex) || 0;

    if (now - lastUpdate < EUCLIDEAN_UPDATE_THROTTLE) {
        return; // Skip this update, too soon since last one
    }

    lastEuclideanUpdate.set(voiceIndex, now);

    // Import euclidean module dynamically to avoid circular dependencies
    import('./euclidean.js').then(module => {
        module.updateEuclideanSequence(voiceIndex);

        // Also trigger UI update to show the new pattern
        import('../main.js').then(mainModule => {
            if (typeof mainModule.updateSequenceUI === 'function') {
                mainModule.updateSequenceUI();
            }
        }).catch(err => {
            console.error('Error updating sequence UI:', err);
        });
    }).catch(err => {
        console.error('Error updating euclidean sequence:', err);
    });
}

/**
 * Handle DX7 patch index change from per-voice modulation
 * @param {number} voiceIndex - Voice index
 * @param {number} newIndex - New patch index
 */
function handleDX7PatchChangeForVoice(voiceIndex, newIndex) {
    // Import dx7Library dynamically to avoid circular dependencies
    import('../modules/dx7Loader.js').then(module => {
        const dx7Library = module.default;
        try {
            const patchIndex = Math.round(newIndex);
            const patchData = dx7Library.selectPatch(patchIndex);

            if (!patchData || !state.voices[voiceIndex]) return;

            const voice = state.voices[voiceIndex];

            // Apply patch to this specific voice (not selectedVoice)
            voice.engine = 'DX7';
            voice.dx7Patch = patchData;
            voice.dx7PatchName = patchData.metadata?.voiceName || patchData.name;
            voice.dx7PatchIndex = patchIndex;
            voice.dx7BankSize = dx7Library.currentBank.length;

            // Extract algorithm from parsed patch
            if (patchData.parsed && patchData.parsed.algorithm) {
                voice.dx7Algorithm = patchData.parsed.algorithm;
            }

            // Trigger audio engine update for this voice
            import('../audio.js').then(audioModule => {
                if (audioModule.updateEngineParams) {
                    audioModule.updateEngineParams();
                }
            });
        } catch (error) {
            console.warn(`Failed to load DX7 patch from modulation for voice ${voiceIndex}:`, error);
        }
    }).catch(err => {
        console.error('Failed to import dx7Loader:', err);
    });
}

/**
 * Apply modulation to a global parameter (effects)
 * @param {string} paramId - Parameter ID
 * @param {object} modConfig - Modulation configuration
 * @param {object} paramDef - Parameter definition
 * @param {number} now - Current timestamp
 */
function applyGlobalModulation(paramId, modConfig, paramDef, now) {
    // Skip modulation if user is actively dragging this parameter
    if (state.modEditMode?.draggedParamId === paramId) {
        return;
    }

    // Get modulation mode (default to LFO for backward compatibility)
    const mode = modConfig.mode || 'LFO';
    let waveValue;

    if (mode === 'LFO') {
        // LFO mode: Use phase accumulators
        if (!phaseAccumulators.has(paramId)) {
            phaseAccumulators.set(paramId, {
                phase: 0,
                lastTime: now
            });
        }

        const phaseData = phaseAccumulators.get(paramId);

        // Advance phase
        const deltaTime = (now - phaseData.lastTime) / 1000; // seconds
        phaseData.phase = (phaseData.phase + (modConfig.rate || 1.0) * deltaTime) % 1.0;
        phaseData.lastTime = now;

        // Calculate waveform value
        waveValue = calculateWaveValue(phaseData.phase, modConfig.waveform ?? 0, paramId);
    } else {
        // Other modes: Use getWaveValueForMode (null voiceIndex for global params)
        waveValue = getWaveValueForMode(mode, modConfig, paramId, null, now);
    }

    // Get base value (store if not stored yet)
    // WARNING: This should rarely execute - baseValue should be set when entering edit mode
    if (modConfig.baseValue === null) {
        const currentValue = getParameterValue(paramId);
        if (currentValue !== null) {
            modConfig.baseValue = currentValue;
            console.warn(`⚠️ Lazy init: baseValue for ${paramId} captured during modulation (global). This may cause incorrect modulation if state is already modulated. Value: ${currentValue}`);
        } else {
            return; // Can't modulate without base value
        }
    }

    // Calculate modulated value
    const range = paramDef.max - paramDef.min;
    const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;
    const modulatedValue = modConfig.baseValue + (modAmount / 100) * range;
    const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

    // Apply to state with smoothing to prevent clicks/pops
    setParameterValueSmoothed(paramId, clampedValue, null, PARAMETER_SMOOTHING_TIME);

    // Special handling for DX7 patch index changes
    if (paramId === 'voice.dx7PatchIndex') {
        handleDX7PatchChange(clampedValue);
    }

    // Propagate effect parameter changes to audio engine
    if (paramDef.effectParam) {
        if (paramId.startsWith('effects.delay')) {
            handleDelayParameterChange(paramId, clampedValue);
        } else if (paramId.startsWith('effects.reverb')) {
            handleReverbParameterChange(paramId, clampedValue);
        } else if (paramId.startsWith('effects.clouds')) {
            // Update Clouds parameters via updateCloudsParams()
            updateCloudsParams();
        }
    }
}

/**
 * Handle DX7 patch index change from modulation
 * @param {number} newIndex - New patch index
 */
function handleDX7PatchChange(newIndex) {
    // Import dx7Library dynamically to avoid circular dependencies
    import('../modules/dx7Loader.js').then(module => {
        const dx7Library = module.default;
        try {
            const patchData = dx7Library.selectPatch(Math.round(newIndex));
            if (patchData) {
                // This will trigger the DX7 patch update
            }
        } catch (error) {
            console.warn('Failed to load DX7 patch from modulation:', error);
        }
    }).catch(err => {
        console.error('Failed to import dx7Loader:', err);
    });
}

/**
 * Update a modulation parameter
 * @param {string} paramId - Parameter ID to modulate
 * @param {string} modParam - Modulation parameter name
 * @param {*} value - New value
 */
export function updateModulationParameter(paramId, modParam, value) {
    const modConfig = getModulationConfig(paramId);
    const paramDef = parameterDefinitions[paramId];

    if (modConfig.isVoiceParam) {
        // VOICE PARAMETER: Update for selected voice
        const voiceConfig = modConfig.voices[state.selectedVoice];
        voiceConfig[modParam] = value;

        // Auto-enable when depth is set > 0
        if (modParam === 'depth' && value > 0) {
            if (voiceConfig.baseValue === null) {
                const currentValue = getParameterValue(paramId);
                if (currentValue !== null) {
                    voiceConfig.baseValue = currentValue;
                }
            }
            voiceConfig.enabled = true;
        }

        // Disable when depth is set to 0
        if (modParam === 'depth' && value === 0) {
            if (voiceConfig.baseValue !== null) {
                setParameterValueForVoice(paramId, voiceConfig.baseValue, state.selectedVoice);
            }
            voiceConfig.baseValue = null;
            voiceConfig.enabled = false;
        }
    } else {
        // EFFECT PARAMETER: Update global config
        modConfig[modParam] = value;

        // Auto-enable when depth is set > 0
        if (modParam === 'depth' && value > 0) {
            if (modConfig.baseValue === null) {
                const currentValue = getParameterValue(paramId);
                if (currentValue !== null) {
                    modConfig.baseValue = currentValue;
                }
            }
            modConfig.enabled = true;
        }

        // Disable when depth is set to 0
        if (modParam === 'depth' && value === 0) {
            if (modConfig.baseValue !== null) {
                setParameterValue(paramId, modConfig.baseValue);
            }
            modConfig.baseValue = null;
            modConfig.enabled = false;
        }
    }

    // Don't capture snapshot here - it's handled when exiting modulation edit mode
    // This prevents creating too many intermediate snapshots during drag operations
}

/**
 * Update base value when user manually adjusts a modulated parameter
 * This allows the user to shift the center point of modulation
 * @param {string} paramId - Parameter ID
 * @param {number} newValue - New base value
 */
export function updateModulatedParameterBaseValue(paramId, newValue) {
    const modConfig = getModulationConfig(paramId);
    if (!modConfig) return;

    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) return;

    if (paramDef.voiceParam) {
        // Voice parameter: update baseValue for selected voice
        const voiceConfig = modConfig.voices[state.selectedVoice];
        if (voiceConfig && voiceConfig.enabled && voiceConfig.baseValue !== null) {
            voiceConfig.baseValue = newValue;
        }
    } else {
        // Global parameter: update single baseValue
        if (modConfig.enabled && modConfig.baseValue !== null) {
            modConfig.baseValue = newValue;
        }
    }
}

/**
 * Toggle modulation mute state
 * @param {string} paramId - Parameter ID
 */
export function toggleModulationMute(paramId) {
    const modConfig = getModulationConfig(paramId);
    const paramDef = parameterDefinitions[paramId];

    if (modConfig.isVoiceParam) {
        // Voice parameter: toggle mute for THIS voice
        const voiceConfig = modConfig.voices[state.selectedVoice];
        voiceConfig.muted = !voiceConfig.muted;

        // If muting, restore base value immediately
        if (voiceConfig.muted && voiceConfig.baseValue !== null) {
            setParameterValueForVoice(paramId, voiceConfig.baseValue, state.selectedVoice);
        }

        // Capture snapshot after toggling mute (immediate)
        if (typeof window.historyManager !== 'undefined' && window.historyManager) {
            window.historyManager.pushSnapshot(false);
        }

        return voiceConfig.muted;
    } else {
        // Effect parameter: toggle global mute
        modConfig.muted = !modConfig.muted;

        // If muting, restore base value immediately
        if (modConfig.muted && modConfig.baseValue !== null) {
            setParameterValue(paramId, modConfig.baseValue);
        }

        // Capture snapshot after toggling mute (immediate)
        if (typeof window.historyManager !== 'undefined' && window.historyManager) {
            window.historyManager.pushSnapshot(false);
        }

        return modConfig.muted;
    }
}

/**
 * Update knob visuals to reflect modulated values
 * Similar to how ræmbL updates faders in real-time
 * Handles both standard knobs and LED ring knobs
 */
function updateModulatedKnobVisuals() {
    // Find all knobs with active modulation
    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) continue;

        // Skip visual updates if user is actively dragging this parameter
        // For voice params, check compound key; for effect params, check plain paramId
        const draggedKey = state.modEditMode?.draggedParamId;
        if (draggedKey) {
            if (modConfig.isVoiceParam) {
                // Voice parameter: check compound key for current voice
                const compoundKey = `${state.selectedVoice}:${paramId}`;
                if (draggedKey === compoundKey) {
                    continue;
                }
            } else {
                // Effect parameter: check plain paramId
                if (draggedKey === paramId) {
                    continue;
                }
            }
        }

        // Check if this is an LED ring knob first (by paramId)
        const ledRingKnob = ledRingKnobRegistry.get(paramId);
        if (ledRingKnob) {
            updateLEDRingKnobModulation(paramId, modConfig, paramDef, ledRingKnob);
            continue;
        }

        // Get the actual DOM label for this parameter (accounting for engine-specific macros)
        const displayLabel = getDisplayLabelForParam(paramId, paramDef.module);
        if (!displayLabel) continue;

        // Find the knob element for this parameter using the display label
        const knob = document.querySelector(`.knob[data-label="${displayLabel}"]`);
        if (!knob) continue;

        const container = knob.closest('.knob-container');
        const label = container?.querySelector('.baeng-app .knob-label');

        // Check if this voice/parameter has modulation active
        let hasModulation = false;
        if (modConfig.isVoiceParam) {
            // Voice parameter: check if THIS voice has modulation enabled
            const voiceConfig = modConfig.voices?.[state.selectedVoice];
            hasModulation = voiceConfig &&
                           voiceConfig.enabled &&
                           voiceConfig.depth !== 0 &&
                           !voiceConfig.muted &&
                           voiceConfig.baseValue !== null;
        } else {
            // Effect parameter: check if modulation is enabled globally
            hasModulation = modConfig.enabled &&
                           modConfig.depth !== 0 &&
                           !modConfig.muted &&
                           modConfig.baseValue !== null;
        }

        // If modulation is inactive for this voice, clear modulated state
        if (!hasModulation) {
            knob.classList.remove('modulated');
            // Skip if label is being hovered (to prevent interfering with click handlers)
            if (label && !label.matches(':hover')) label.classList.remove('mod-active');

            // Restore to base value if available
            let baseValueToRestore = null;
            if (modConfig.isVoiceParam) {
                // Voice parameter: use per-voice baseValue
                const voiceConfig = modConfig.voices?.[state.selectedVoice];
                baseValueToRestore = voiceConfig?.baseValue ?? null;
            } else {
                // Effect parameter: use global baseValue
                baseValueToRestore = modConfig.baseValue;
            }

            if (baseValueToRestore !== null) {
                const basePercentage = (baseValueToRestore - paramDef.min) / (paramDef.max - paramDef.min);
                const baseRotation = -135 + (basePercentage * 270);
                knob.style.setProperty('--knob-rotation', `${baseRotation}deg`);
            }
            continue;
        }

        // Skip if in edit mode for this parameter (don't interfere with editing)
        if (state.modEditMode.activeParamId === paramId && state.modEditMode.currentPage > 0) continue;

        // Get config for this voice/effect
        const config = modConfig.isVoiceParam
            ? modConfig.voices[state.selectedVoice]
            : modConfig;

        const baseValue = config.baseValue;
        if (baseValue === null) continue;

        // Calculate current modulated value based on mode (LFO, SEQ, ENV, RND, TM, EF)
        const mode = config.mode || 'LFO';
        const voiceIndex = modConfig.isVoiceParam ? state.selectedVoice : null;
        const now = performance.now();

        // Get wave value for current mode (-1 to +1)
        const waveValue = getWaveValueForMode(mode, config, paramId, voiceIndex, now);

        // Apply depth and offset
        const modAmount = (waveValue * config.depth * 0.5) + config.offset;
        const range = paramDef.max - paramDef.min;
        let modulatedValue = baseValue + (modAmount / 100) * range;
        modulatedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

        // Calculate base value rotation (solid line)
        const basePercentage = (baseValue - paramDef.min) / (paramDef.max - paramDef.min);
        const baseRotation = -135 + (basePercentage * 270);

        // Calculate modulated value rotation (dashed line)
        const modulatedPercentage = (modulatedValue - paramDef.min) / (paramDef.max - paramDef.min);
        const modulatedRotation = -135 + (modulatedPercentage * 270);

        // Enable dual indicator mode
        knob.classList.add('modulated');
        knob.style.setProperty('--knob-rotation', `${baseRotation}deg`);
        knob.style.setProperty('--knob-modulated-rotation', `${modulatedRotation}deg`);

        // Add label brightness effect based on modulated value
        // Map modulated value to opacity: 0.3 to 1.0 range
        // Skip if label is being hovered (to prevent interfering with click handlers)
        if (label && !label.classList.contains('mod-editing') && !label.matches(':hover')) {
            label.classList.add('mod-active');

            // Calculate intensity based on modulated value position in range
            const valuePercentage = (modulatedValue - paramDef.min) / (paramDef.max - paramDef.min);
            const intensity = 0.3 + (valuePercentage * 0.7); // 0.3 to 1.0 range
            label.style.setProperty('--mod-intensity', intensity.toFixed(3));
        }

        // Update value display to show modulated value
        if (container) {
            const valueDisplay = container.querySelector('.baeng-app .knob-value');
            if (valueDisplay) {
                // Format value for display
                let displayValue;
                if (paramId === 'voice.dx7PatchIndex') {
                    displayValue = Math.round(modulatedValue) + 1; // 1-indexed for user
                } else if (paramDef.step && paramDef.step >= 1) {
                    displayValue = Math.round(modulatedValue);
                } else {
                    displayValue = modulatedValue.toFixed(1);
                }
                valueDisplay.textContent = displayValue;
            }
        }
    }
}

/**
 * Update LED ring knob modulation visuals
 * @param {string} paramId - Parameter ID
 * @param {object} modConfig - Modulation configuration
 * @param {object} paramDef - Parameter definition
 * @param {LEDRingKnob} ledRingKnob - LED ring knob instance
 */
function updateLEDRingKnobModulation(paramId, modConfig, paramDef, ledRingKnob) {
    // Check if this voice/parameter has modulation active
    let hasModulation = false;
    let voiceConfig = null;

    if (modConfig.isVoiceParam) {
        // Voice parameter: check if THIS voice has modulation enabled
        voiceConfig = modConfig.voices?.[state.selectedVoice];
        hasModulation = voiceConfig &&
                       voiceConfig.enabled &&
                       voiceConfig.depth !== 0 &&
                       !voiceConfig.muted &&
                       voiceConfig.baseValue !== null;
    } else {
        // Effect parameter: check if modulation is enabled globally
        hasModulation = modConfig.enabled &&
                       modConfig.depth !== 0 &&
                       !modConfig.muted &&
                       modConfig.baseValue !== null;
    }

    // If modulation is inactive for this voice, clear modulated state
    if (!hasModulation) {
        ledRingKnob.clearModulation();
        return;
    }

    // Skip if in edit mode for this parameter (don't interfere with editing)
    if (state.modEditMode.activeParamId === paramId && state.modEditMode.currentPage > 0) return;

    // If user is dragging this knob, show baseValue position (not modulated)
    // This gives clear feedback that they're adjusting the centre point
    if (ledRingKnob.isDragging) {
        const config = modConfig.isVoiceParam ? voiceConfig : modConfig;
        const baseValue = config.baseValue;
        if (baseValue !== null) {
            // Show knob at baseValue position while dragging
            ledRingKnob.setValueWithoutCallback(baseValue);
            // Keep modulated class but don't animate during drag
            ledRingKnob.container.classList.add('modulated', 'dragging-base');
        }
        return;
    } else {
        // Remove dragging-base class when not dragging
        ledRingKnob.container.classList.remove('dragging-base');
    }

    // Get config for this voice/effect
    const config = modConfig.isVoiceParam
        ? modConfig.voices[state.selectedVoice]
        : modConfig;

    const baseValue = config.baseValue;
    if (baseValue === null) return;

    // Calculate current modulated value based on mode (LFO, SEQ, ENV, RND, TM, EF)
    let modulatedValue;
    const mode = config.mode || 'LFO';
    const voiceIndex = modConfig.isVoiceParam ? state.selectedVoice : null;
    const now = performance.now();

    // Get wave value for current mode (-1 to +1)
    const waveValue = getWaveValueForMode(mode, config, paramId, voiceIndex, now);

    // Apply depth and offset
    const modAmount = (waveValue * config.depth * 0.5) + config.offset;
    const range = paramDef.max - paramDef.min;
    modulatedValue = baseValue + (modAmount / 100) * range;
    modulatedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue))

    // Update LED ring knob with modulation state
    ledRingKnob.setModulation(baseValue, modulatedValue, config.depth);

    // Also update the label brightness for the knob container
    const container = ledRingKnob.container?.closest('.knob-container');
    const label = container?.querySelector('.knob-label');
    if (label && !label.classList.contains('mod-editing') && !label.matches(':hover')) {
        label.classList.add('mod-active');
        // Calculate intensity based on modulated value position in range
        const valuePercentage = (modulatedValue - paramDef.min) / (paramDef.max - paramDef.min);
        const intensity = 0.3 + (valuePercentage * 0.7); // 0.3 to 1.0 range
        label.style.setProperty('--mod-intensity', intensity.toFixed(3));
    }
}

/**
 * Update fader visuals to reflect modulated values
 * Adds dual indicators for faders (base line + modulated fill)
 */
function updateModulatedFaderVisuals() {
    // Find all faders with active modulation
    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) continue;

        // Skip visual updates if user is actively dragging this parameter
        // For voice params, check compound key; for effect params, check plain paramId
        const draggedKey = state.modEditMode?.draggedParamId;
        if (draggedKey) {
            if (modConfig.isVoiceParam) {
                // Voice parameter: check compound key for current voice
                const compoundKey = `${state.selectedVoice}:${paramId}`;
                if (draggedKey === compoundKey) {
                    continue;
                }
            } else {
                // Effect parameter: check plain paramId
                if (draggedKey === paramId) {
                    continue;
                }
            }
        }

        // Find the fader element for this parameter using module and label
        const moduleElement = document.getElementById(paramDef.module);
        if (!moduleElement) continue;

        const faderLabel = moduleElement.querySelector(`.fader-label[data-label="${paramDef.label}"]`);
        if (!faderLabel) continue;

        const container = faderLabel.closest('.fader-container');
        if (!container) continue;

        const faderTrack = container.querySelector('.baeng-app .fader-track');
        const faderFill = container.querySelector('.baeng-app .fader-fill');
        const label = container.querySelector('.baeng-app .fader-label');

        if (!faderTrack || !faderFill) continue;

        // Check if this voice/parameter has modulation active
        let hasModulation = false;
        if (modConfig.isVoiceParam) {
            // Voice parameter: check if THIS voice has modulation enabled
            const voiceConfig = modConfig.voices?.[state.selectedVoice];
            hasModulation = voiceConfig &&
                           voiceConfig.enabled &&
                           voiceConfig.depth !== 0 &&
                           !voiceConfig.muted &&
                           voiceConfig.baseValue !== null;
        } else {
            // Effect parameter: check if modulation is enabled globally
            hasModulation = modConfig.enabled &&
                           modConfig.depth !== 0 &&
                           !modConfig.muted &&
                           modConfig.baseValue !== null;
        }

        // If modulation is inactive for this voice, clear modulated state
        if (!hasModulation) {
            faderTrack.classList.remove('modulated');
            if (label) label.classList.remove('mod-active');

            // Remove modulation overlay elements
            const baseLine = faderTrack.querySelector('.baeng-app .fader-base-line');
            const modFill = faderTrack.querySelector('.baeng-app .fader-fill-modulated');
            if (baseLine) baseLine.remove();
            if (modFill) modFill.remove();

            // Restore to base value if available
            let baseValueToRestore = null;
            if (modConfig.isVoiceParam) {
                const voiceConfig = modConfig.voices?.[state.selectedVoice];
                baseValueToRestore = voiceConfig?.baseValue ?? null;
            } else {
                baseValueToRestore = modConfig.baseValue;
            }

            if (baseValueToRestore !== null) {
                const basePercentage = ((baseValueToRestore - paramDef.min) / (paramDef.max - paramDef.min)) * 100;
                faderFill.style.height = `${basePercentage}%`;
            }
            continue;
        }

        // Skip if in edit mode for this parameter
        if (state.modEditMode.activeParamId === paramId && state.modEditMode.currentPage > 0) continue;

        // Get config for this voice/effect
        const config = modConfig.isVoiceParam
            ? modConfig.voices[state.selectedVoice]
            : modConfig;

        const baseValue = config.baseValue;
        if (baseValue === null) continue;

        // Calculate current modulated value based on mode (LFO, SEQ, ENV, RND, TM, EF)
        const mode = config.mode || 'LFO';
        const voiceIndex = modConfig.isVoiceParam ? state.selectedVoice : null;
        const now = performance.now();

        // Get wave value for current mode (-1 to +1)
        const waveValue = getWaveValueForMode(mode, config, paramId, voiceIndex, now);

        // Apply depth and offset
        const modAmount = (waveValue * config.depth * 0.5) + config.offset;
        const range = paramDef.max - paramDef.min;
        let modulatedValue = baseValue + (modAmount / 100) * range;
        modulatedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

        // Calculate percentages for display
        const basePercentage = ((baseValue - paramDef.min) / (paramDef.max - paramDef.min)) * 100;
        const modulatedPercentage = ((modulatedValue - paramDef.min) / (paramDef.max - paramDef.min)) * 100;

        // Enable dual indicator mode
        faderTrack.classList.add('modulated');

        // Update base fill to show base value
        faderFill.style.height = `${basePercentage}%`;

        // Create or update base line indicator
        let baseLine = faderTrack.querySelector('.baeng-app .fader-base-line');
        if (!baseLine) {
            baseLine = document.createElement('div');
            baseLine.className = 'fader-base-line';
            faderTrack.appendChild(baseLine);
        }
        baseLine.style.bottom = `${basePercentage}%`;

        // Create or update modulated fill overlay
        let modFill = faderTrack.querySelector('.baeng-app .fader-fill-modulated');
        if (!modFill) {
            modFill = document.createElement('div');
            modFill.className = 'fader-fill-modulated';
            faderTrack.appendChild(modFill);
        }
        modFill.style.height = `${modulatedPercentage}%`;

        // Add label brightness effect based on modulated value
        // Map modulated value to opacity: 0.3 to 1.0 range
        // Skip if label is being hovered (to prevent interfering with click handlers)
        if (label && !label.classList.contains('mod-editing') && !label.matches(':hover')) {
            label.classList.add('mod-active');

            // Calculate intensity based on modulated value position in range
            const valuePercentage = (modulatedValue - paramDef.min) / (paramDef.max - paramDef.min);
            const intensity = 0.3 + (valuePercentage * 0.7); // 0.3 to 1.0 range
            label.style.setProperty('--mod-intensity', intensity.toFixed(3));
        }

        // Update value display to show modulated value
        const valueDisplay = container.querySelector('.baeng-app .fader-value');
        if (valueDisplay) {
            let displayValue;
            if (paramDef.step && paramDef.step >= 1) {
                displayValue = Math.round(modulatedValue);
            } else {
                displayValue = modulatedValue.toFixed(1);
            }
            valueDisplay.textContent = displayValue;
        }
    }
}

/**
 * Clear modulation state for cleanup
 */
export function clearModulationState() {
    phaseAccumulators.clear();
    sampleAndHoldValues.clear();
    heldPitchValues.clear();
    pitchHoldCrossfades.clear();
    previousParameterValues.clear();
}

/**
 * Reset only phase accumulators (for undo/redo)
 * Preserves other state like sample-and-hold values
 */
export function resetPhaseAccumulators() {
    phaseAccumulators.clear();
}

/**
 * Clear phase accumulators for a specific parameter
 * @param {string} paramId - Parameter identifier
 * @param {number|null} voiceIndex - Specific voice index, or null for all voices/global
 */
export function clearPhaseAccumulators(paramId, voiceIndex = null) {
    const paramDef = parameterDefinitions[paramId];

    if (paramDef && paramDef.voiceParam) {
        // Per-voice parameter
        if (voiceIndex !== null) {
            // Clear specific voice
            const key = `${voiceIndex}:${paramId}`;
            phaseAccumulators.delete(key);
            sampleAndHoldValues.delete(key);
        } else {
            // Clear all voices
            for (let v = 0; v < state.voices.length; v++) {
                const key = `${v}:${paramId}`;
                phaseAccumulators.delete(key);
                sampleAndHoldValues.delete(key);
            }
        }
    } else {
        // Global parameter
        phaseAccumulators.delete(paramId);
        sampleAndHoldValues.delete(paramId);
    }
}
