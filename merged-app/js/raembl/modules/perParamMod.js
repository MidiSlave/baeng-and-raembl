// File: js/modules/perParamMod.js
// Per-Parameter Modulation System
import { state, parameterDefinitions } from '../state.js';
import { config } from '../config.js';
import { updateParameterById } from '../ui/faderState.js';
import { updateFilter, updateReverb, updateReverbSendLevel, updateDelay } from '../audio/effects.js';
import { updatePulseWidth, updateOscillatorTransposition, updateMixerLevels, calculateKeyTrackedBaseCutoff as calculateKeyTrackedBaseCutoffFromVoice } from '../audio/voice.js';
import { drawDelay, startDelayAnimation } from './delay.js';
import { drawReverb } from './reverb.js';
import { updateFactorsPattern } from './factors.js';
import { drawLfo } from './lfo.js';
import { drawPath } from './path.js';
import { mapRange } from '../utils.js';
import { updateCloudsParameter } from './clouds.js';
import { updatePlaitsParameter, updateRingsParameter } from '../audio.js';
import { updateModulationLED, slidePotRegistry } from '../ui/slidePots.js';
import { SeqPattern, ADEnvelope, EnvelopeCurves, LFSR } from '../../shared/modulation-utils.js';
import { getCurrentParamId } from '../../shared/ppmod-modal.js';

// Phase accumulators for k-rate modulation
const phaseAccumulators = new Map();

// S&H held values (sampled on gate trigger)
const sampleAndHoldValues = new Map();

// SEQ pattern instances (keyed by paramId)
const seqPatterns = new Map();

// ENV envelope instances (keyed by paramId)
const envEnvelopes = new Map();

// RND (LFSR) instances and state (keyed by paramId)
const rndGenerators = new Map();
const rndLastSampleTime = new Map();
const rndCurrentValues = new Map();

// TM (Turing Machine) state (keyed by paramId)
const tmCurrentSteps = new Map();

// Track last triggered voice for visual feedback (persists after voices release)
let lastTriggeredVoiceId = null;

// EF (Envelope Follower) state
const efAnalysers = new Map(); // source -> AnalyserNode
const efSmoothedValues = new Map(); // paramId -> smoothed envelope value
const efLastTime = new Map(); // paramId -> last update time
let efDataArray = null; // Shared Uint8Array for analyser data

// Cached DOM elements for visual feedback
const cachedElements = new Map();

// Timing for throttled k-rate updates (30 FPS)
let lastKRateUpdate = 0;
const K_RATE_INTERVAL = 1000 / 30; // ~33ms

// Default modulation config
const DEFAULT_MOD_CONFIG = {
    enabled: false,
    waveform: 0,      // 0=sin, 1=tri, 2=sq, 3=saw, 4=noise, 5=s&h
    rate: 1.0,        // Hz (0.05-30)
    depth: 0,         // 0-100%
    offset: 0,        // -100 to +100%
    resetMode: 'off', // 'off'|'step'|'accent'|'bar' (legacy - use triggerSource/resetSource)
    triggerSource: 'none', // 'none'|'T1'-'T6'|'SUM'|'bar'|'noteOn'
    resetSource: 'none',   // 'none'|'T1'-'T6'|'SUM'|'bar'|'noteOn'
    baseValue: null,  // Stored base value (set when modulation enabled)
    muted: false      // Mute state for temporary disable
};

// --- Dangerous Parameter Registry ---
// Parameters that can cause audio issues or silence when modulated to extreme values
const PPMOD_DANGEROUS_PARAMS = {
    'factors.steps': {
        severity: 'WARN',
        minSafe: 1,
        reason: 'Modulating to 0 silences pattern'
    },
    'factors.fills': {
        severity: 'WARN',
        minSafe: 1,
        reason: '0 fills prevents all triggers'
    },
    'factors.gateLength': {
        severity: 'DANGER',
        minSafe: 5,
        maxSafe: 95,
        reason: '<5% risks trigger loss, >95% stuck gates'
    }
};

// Audio-rate parameter IDs (use per-voice oscillators)
// Currently empty - all params use k-rate modulation for reliability in both MONO/POLY modes
// Audio-rate would require separate handling for MONO (shared filter) vs POLY (per-voice filters)
const AUDIO_RATE_PARAMS = new Set([
    // 'filter.lowPass',  // Moved to k-rate for MONO/POLY compatibility
    // 'filter.highPass'  // Moved to k-rate for MONO/POLY compatibility
]);

// --- Waveform Calculation ---

function calculateWaveValue(phase, waveform, paramId = null, voiceId = null) {
    // phase: 0-1
    // waveform: 0=sin, 1=tri, 2=sq, 3=saw, 4=noise, 5=s&h
    // paramId: optional, required for S&H to retrieve held value
    // voiceId: optional, required for per-voice S&H in POLY mode
    // returns: -1 to +1

    switch (waveform) {
        case 0: // Sine
            return Math.sin(phase * Math.PI * 2);

        case 1: // Triangle
            return phase < 0.5
                ? -1 + 4 * phase
                : 3 - 4 * phase;

        case 2: // Square
            return phase < 0.5 ? 1 : -1;

        case 3: // Sawtooth
            return 1 - 2 * phase;

        case 4: // Noise (pseudo-random based on phase)
            return Math.sin(phase * 12345.6789) * 0.8; // Pseudo-random

        case 5: // S&H (sample and hold - gate triggered)
            // Use per-voice key in POLY mode, global key in MONO mode
            const key = (voiceId && !state.monoMode) ? `${voiceId}:${paramId}` : paramId;

            // Return stored held value, or sample new one if not yet set
            if (key && sampleAndHoldValues.has(key)) {
                return sampleAndHoldValues.get(key);
            } else {
                // Initialize with random value
                const randomValue = (Math.random() * 2) - 1; // -1 to +1
                if (key) {
                    sampleAndHoldValues.set(key, randomValue);
                }
                return randomValue;
            }

        default:
            return Math.sin(phase * Math.PI * 2);
    }
}

// --- Helper Functions ---

export function getModulationConfig(paramId) {
    return state.perParamModulations[paramId] || { ...DEFAULT_MOD_CONFIG };
}

export function getOrCreateModConfig(paramId) {
    if (!state.perParamModulations[paramId]) {
        state.perParamModulations[paramId] = { ...DEFAULT_MOD_CONFIG };
    }
    return state.perParamModulations[paramId];
}

export function isAudioRateParam(paramId) {
    return AUDIO_RATE_PARAMS.has(paramId);
}

export function isModulatable(paramId) {
    const paramDef = parameterDefinitions[paramId];
    return paramDef && paramDef.modulatable === true;
}

// --- Audio-Rate Filter Modulation ---

export function createFilterParamLFO(voice, paramId, modConfig) {
    if (!config.audioContext || !voice) return;

    // Create oscillator and gain nodes
    const osc = config.audioContext.createOscillator();
    const gain = config.audioContext.createGain();

    // Set LFO frequency
    osc.frequency.value = modConfig.rate;

    // Set waveform type
    const waveformTypes = ['sine', 'triangle', 'square', 'sawtooth', 'sine', 'sine'];
    osc.type = waveformTypes[Math.min(modConfig.waveform, 3)]; // Noise/S&H need special handling

    // Calculate depth in Hz
    const paramDef = parameterDefinitions[paramId];
    const baseValue = state[paramDef.statePath];

    let depthHz = 0;
    if (paramId === 'filter.lowPass' || paramId === 'filter.highPass') {
        // Frequency parameters - use exponential scaling
        const baseCutoff = voice.baseCutoff || 1000;
        const depthOctaves = (modConfig.depth / 100) * 2; // Max ±2 octaves
        depthHz = baseCutoff * (Math.pow(2, depthOctaves) - 1);
    } else if (paramId === 'filter.resonance') {
        // Resonance - linear Hz scaling
        depthHz = (modConfig.depth / 100) * 50; // Max ±50 Hz swing
    }

    gain.gain.value = depthHz;

    // Connect: Osc → Gain → filter.frequency (or filter.Q)
    osc.connect(gain);

    if (paramId === 'filter.lowPass' && voice.filterNodes?.lp) {
        gain.connect(voice.filterNodes.lp.frequency);
    } else if (paramId === 'filter.highPass' && voice.filterNodes?.hp) {
        gain.connect(voice.filterNodes.hp.frequency);
    } else if (paramId === 'filter.resonance' && voice.filterNodes?.lp) {
        gain.connect(voice.filterNodes.lp.Q);
    }

    osc.start();

    // Store reference for updates/cleanup
    if (!voice.perParamLfoOscs) {
        voice.perParamLfoOscs = new Map();
    }
    voice.perParamLfoOscs.set(paramId, { osc, gain, paramId });

}

export function updateFilterParamLFO(voice, paramId, modConfig) {
    if (!voice || !voice.perParamLfoOscs) return;

    const lfoNodes = voice.perParamLfoOscs.get(paramId);
    if (!lfoNodes) return;

    const now = config.audioContext.currentTime;

    // Update frequency
    lfoNodes.osc.frequency.setTargetAtTime(modConfig.rate, now, 0.01);

    // Update depth
    const paramDef = parameterDefinitions[paramId];
    let depthHz = 0;

    if (paramId === 'filter.lowPass' || paramId === 'filter.highPass') {
        const baseCutoff = voice.baseCutoff || 1000;
        const depthOctaves = (modConfig.depth / 100) * 2;
        depthHz = baseCutoff * (Math.pow(2, depthOctaves) - 1);
    } else if (paramId === 'filter.resonance') {
        depthHz = (modConfig.depth / 100) * 50;
    }

    lfoNodes.gain.gain.setTargetAtTime(depthHz, now, 0.01);
}

export function removeFilterParamLFO(voice, paramId) {
    if (!voice || !voice.perParamLfoOscs) return;

    const lfoNodes = voice.perParamLfoOscs.get(paramId);
    if (!lfoNodes) return;

    try {
        lfoNodes.osc.stop();
        lfoNodes.osc.disconnect();
        lfoNodes.gain.disconnect();
    } catch (e) {
        console.warn(`Error cleaning up LFO for ${paramId}:`, e);
    }

    voice.perParamLfoOscs.delete(paramId);
}

// --- K-Rate Modulation Loop ---

export function applyPerParamModulations() {
    const now = performance.now();

    // Throttle to 30 FPS for k-rate params
    if (now - lastKRateUpdate < K_RATE_INTERVAL) return;
    lastKRateUpdate = now;

    // Check for bar reset
    if (state.isBarStart) {
        resetPhasesWithMode('bar');
    }

    // POLY MODE: Apply per-voice modulation for filter parameters
    // Check worklet bridge for active voices, or fall back to config.voices for Web Audio path
    const hasActiveVoices = (config.useWorklet && config.workletBridge)
        ? config.workletBridge.getActiveVoices().length > 0
        : (config.voices && config.voices.length > 0);

    if (!state.monoMode && hasActiveVoices) {
        applyPolyVoiceModulations(now);
    }

    // PLAITS POLY MODE: Apply per-voice modulation when Plaits engine is active
    if (state.engineType === 'plaits' && config.plaitsVoicePool?.isReady() && !state.monoMode) {
        applyPlaitsPolyVoiceModulations(now);
    }

    // MONO MODE or non-filter parameters: Apply global modulation
    // Iterate through active modulations
    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        if (!modConfig.enabled || modConfig.depth === 0 || modConfig.muted) continue;

        // Skip audio-rate params (handled by oscillators)
        if (isAudioRateParam(paramId)) continue;

        // In POLY mode, skip filter parameters (handled by applyPolyVoiceModulations)
        if (!state.monoMode && paramId.startsWith('filter.')) continue;

        // In POLY mode with Plaits, skip Plaits parameters (handled by applyPlaitsPolyVoiceModulations)
        // Model is global (same engine for all voices), so it's still handled here
        if (!state.monoMode && state.engineType === 'plaits' && paramId.startsWith('plaits.') && paramId !== 'plaits.model') continue;

        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) continue;

        // --- SEQ Mode ---
        if (modConfig.mode === 'SEQ') {
            // Get or create SeqPattern instance
            let seqPattern = seqPatterns.get(paramId);
            if (!seqPattern) {
                seqPattern = new SeqPattern(
                    modConfig.seqLength || 4,
                    modConfig.seqPattern || null
                );
                seqPatterns.set(paramId, seqPattern);
            }

            // Sync pattern config if changed
            if (modConfig.seqLength && seqPattern.length !== modConfig.seqLength) {
                seqPattern.setLength(modConfig.seqLength);
            }
            if (modConfig.seqPattern) {
                seqPattern.setValues(modConfig.seqPattern);
            }

            // Get current step value (0-1)
            const seqValue = seqPattern.getValue();

            // Map 0-1 to -1 to +1 for consistency with LFO modes
            const waveValue = (seqValue * 2) - 1;

            // Apply depth and offset
            const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;

            // Get base parameter value
            const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];

            // Calculate modulated value
            const range = paramDef.max - paramDef.min;
            const modulatedValue = baseValue + (modAmount / 100) * range;
            const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

            // Apply to audio engine
            applyModulatedValue(paramId, clampedValue, baseValue);
            continue;
        }

        // --- ENV Mode ---
        if (modConfig.mode === 'ENV') {
            // Get or create ADEnvelope instance
            let envelope = envEnvelopes.get(paramId);
            if (!envelope) {
                envelope = new ADEnvelope(
                    modConfig.envAttackMs || 10,
                    modConfig.envReleaseMs || 200,
                    modConfig.envCurveShape || 'exponential'
                );
                envEnvelopes.set(paramId, envelope);
            }

            // Sync envelope params if changed
            envelope.setParams(
                modConfig.envAttackMs || 10,
                modConfig.envReleaseMs || 200,
                modConfig.envCurveShape || 'exponential'
            );

            // Get current envelope value (0-1)
            const envValue = envelope.getValue(now);

            // Map 0-1 to -1 to +1 for consistency with other modes
            // (envelope goes 0→1→0, so we map to -1→1→-1 for bipolar modulation)
            const waveValue = (envValue * 2) - 1;

            // Apply depth and offset
            const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;

            // Get base parameter value
            const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];

            // Calculate modulated value
            const range = paramDef.max - paramDef.min;
            const modulatedValue = baseValue + (modAmount / 100) * range;
            const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

            // Apply to audio engine
            applyModulatedValue(paramId, clampedValue, baseValue);
            continue;
        }

        // --- RND Mode (LFSR-based random) ---
        if (modConfig.mode === 'RND') {
            // Get or create LFSR instance
            let lfsr = rndGenerators.get(paramId);
            const bitLength = modConfig.rndBitLength || 16;

            // Recreate LFSR if bit length changed
            if (!lfsr || lfsr.bitLength !== bitLength) {
                lfsr = new LFSR(bitLength);
                rndGenerators.set(paramId, lfsr);
                rndCurrentValues.set(paramId, lfsr.nextNormalised());
            }

            // Check if it's time to sample a new value based on rate
            const sampleRateHz = modConfig.rndSampleRate || 1000;
            const sampleIntervalMs = 1000 / sampleRateHz;
            const lastSample = rndLastSampleTime.get(paramId) || 0;

            if (now - lastSample >= sampleIntervalMs) {
                // Sample new value with probability
                const probability = (modConfig.rndProbability ?? 100) / 100;
                if (Math.random() < probability) {
                    rndCurrentValues.set(paramId, lfsr.nextNormalised());
                }
                rndLastSampleTime.set(paramId, now);
            }

            // Get current random value (0-1)
            const rndValue = rndCurrentValues.get(paramId) ?? 0.5;

            // Map 0-1 to -1 to +1 for consistency with other modes
            const waveValue = (rndValue * 2) - 1;

            // Apply depth and offset
            const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;

            // Get base parameter value
            const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];

            // Calculate modulated value
            const range = paramDef.max - paramDef.min;
            const modulatedValue = baseValue + (modAmount / 100) * range;
            const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

            // Apply to audio engine
            applyModulatedValue(paramId, clampedValue, baseValue);
            continue;
        }

        // --- TM Mode (Turing Machine - probabilistic step sequencer) ---
        if (modConfig.mode === 'TM') {
            // Get or initialize pattern
            let pattern = modConfig.tmPattern;
            const length = modConfig.tmLength || 8;

            if (!pattern || pattern.length === 0) {
                // Generate initial random pattern
                pattern = [];
                for (let i = 0; i < length; i++) {
                    pattern.push(Math.random());
                }
                modConfig.tmPattern = pattern;
            }

            // Ensure pattern length matches
            while (pattern.length < length) {
                pattern.push(Math.random());
            }
            if (pattern.length > length) {
                pattern = pattern.slice(0, length);
                modConfig.tmPattern = pattern;
            }

            // Get current step (advanced by clock events)
            const currentStep = tmCurrentSteps.get(paramId) ?? 0;

            // Get value at current step (0-1)
            const tmValue = pattern[currentStep] ?? 0.5;

            // Map 0-1 to -1 to +1 for consistency with other modes
            const waveValue = (tmValue * 2) - 1;

            // Apply depth and offset
            const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;

            // Get base parameter value
            const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];

            // Calculate modulated value
            const range = paramDef.max - paramDef.min;
            const modulatedValue = baseValue + (modAmount / 100) * range;
            const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

            // Apply to audio engine
            applyModulatedValue(paramId, clampedValue, baseValue);
            continue;
        }

        // --- EF Mode (Envelope Follower) ---
        if (modConfig.mode === 'EF') {
            // Get the envelope follower value
            const source = modConfig.efSource || 'raembl';
            const attackMs = modConfig.efAttackMs || 10;
            const releaseMs = modConfig.efReleaseMs || 100;
            const sensitivity = (modConfig.efSensitivity || 100) / 100;

            // Get raw level from analyser
            const rawLevel = getEnvelopeFollowerLevel(source);

            // Apply attack/release smoothing
            const lastTime = efLastTime.get(paramId) || now;
            const deltaMs = now - lastTime;
            efLastTime.set(paramId, now);

            let smoothedValue = efSmoothedValues.get(paramId) ?? 0;

            if (rawLevel > smoothedValue) {
                // Attack phase - level is rising
                const attackCoef = 1 - Math.exp(-deltaMs / attackMs);
                smoothedValue += (rawLevel - smoothedValue) * attackCoef;
            } else {
                // Release phase - level is falling
                const releaseCoef = 1 - Math.exp(-deltaMs / releaseMs);
                smoothedValue += (rawLevel - smoothedValue) * releaseCoef;
            }

            efSmoothedValues.set(paramId, smoothedValue);

            // Apply sensitivity and clamp to 0-1
            const efValue = Math.min(1, smoothedValue * sensitivity);

            // Update the meter in the UI (if EF panel is visible)
            updateEFMeter(efValue);

            // Map 0-1 to -1 to +1 for consistency with other modes
            const waveValue = (efValue * 2) - 1;

            // Apply depth and offset
            const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;

            // Get base parameter value
            const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];

            // Calculate modulated value
            const range = paramDef.max - paramDef.min;
            const modulatedValue = baseValue + (modAmount / 100) * range;
            const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

            // Apply to audio engine
            applyModulatedValue(paramId, clampedValue, baseValue);
            continue;
        }

        // --- LFO Mode (and legacy mode without explicit mode property) ---
        // Get or initialize phase (global phase for MONO mode)
        if (!phaseAccumulators.has(paramId)) {
            phaseAccumulators.set(paramId, {
                phase: 0,
                lastTime: now
            });
        }

        const phaseData = phaseAccumulators.get(paramId);

        // Advance phase based on rate
        const deltaTime = (now - phaseData.lastTime) / 1000; // seconds
        phaseData.phase = (phaseData.phase + (modConfig.rate || modConfig.lfoRate || 1.0) * deltaTime) % 1.0;
        phaseData.lastTime = now;

        // Calculate waveform value (-1 to +1)
        const waveValue = calculateWaveValue(phaseData.phase, modConfig.waveform ?? modConfig.lfoWaveform ?? 0, paramId, null);

        // Apply depth and offset
        // Depth is scaled by 0.5 so it represents peak-to-peak swing (100% depth = ±50% range)
        const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;

        // Get base parameter value (use stored baseValue if available, fallback to state)
        const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];

        // Calculate modulated value
        const range = paramDef.max - paramDef.min;
        const modulatedValue = baseValue + (modAmount / 100) * range;
        const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

        // Apply to audio engine (this will trigger audio parameter updates)
        applyModulatedValue(paramId, clampedValue, baseValue);
    }
}

// Apply per-voice modulation for POLY mode filter parameters
function applyPolyVoiceModulations(now) {
    if (!config.audioContext) return;

    // When using AudioWorklet, apply per-voice filter modulation
    if (config.useWorklet && config.workletBridge) {
        const activeVoices = config.workletBridge.getActiveVoices();
        if (activeVoices.length === 0) return;

        // Process each active voice with independent modulation phase
        for (const voice of activeVoices) {
            for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
                if (!modConfig.enabled || modConfig.depth === 0 || modConfig.muted) continue;
                if (!paramId.startsWith('filter.')) continue;

                const paramDef = parameterDefinitions[paramId];
                if (!paramDef) continue;

                // Get wave value based on mode (use global state for non-LFO modes)
                let waveValue;
                const mode = modConfig.mode || 'LFO';

                switch (mode) {
                    case 'SEQ': {
                        // Per-voice SEQ: each voice gets independent step position
                        const seqKey = `${voice.voiceId}:${paramId}`;

                        let seqPattern = seqPatterns.get(seqKey);
                        const patternExisted = !!seqPattern;
                        if (!seqPattern) {
                            // Create per-voice pattern with shared VALUES but independent step
                            seqPattern = new SeqPattern(
                                modConfig.seqLength || 4,
                                modConfig.seqPattern || null
                            );
                            // Offset each voice's starting step using nodeIndex (0-7) for spread
                            const voiceOffset = (voice.nodeIndex || 0) % (modConfig.seqLength || 4);
                            for (let i = 0; i < voiceOffset; i++) {
                                seqPattern.advance();
                            }
                            seqPatterns.set(seqKey, seqPattern);
                        }

                        const seqValue = seqPattern.getValue();
                        waveValue = (seqValue * 2) - 1;
                        break;
                    }
                    case 'ENV': {
                        // Get or create ADEnvelope on-demand
                        let envelope = envEnvelopes.get(paramId);
                        if (!envelope) {
                            envelope = new ADEnvelope(
                                modConfig.envAttackMs || 10,
                                modConfig.envReleaseMs || 200,
                                modConfig.envCurveShape || 'exponential'
                            );
                            envEnvelopes.set(paramId, envelope);
                        }
                        const envValue = envelope.getValue(now);
                        waveValue = (envValue * 2) - 1;
                        break;
                    }
                    case 'RND': {
                        // Per-voice RND: each voice gets independent LFSR state
                        const rndKey = `${voice.voiceId}:${paramId}`;

                        // Lazy-init per-voice LFSR if needed
                        let lfsr = rndGenerators.get(rndKey);
                        if (!lfsr) {
                            const bitLength = modConfig.rndBitLength || 16;
                            lfsr = new LFSR(bitLength);
                            rndGenerators.set(rndKey, lfsr);
                            rndCurrentValues.set(rndKey, lfsr.nextNormalised());
                        }

                        const rndValue = rndCurrentValues.get(rndKey) ?? 0.5;
                        waveValue = (rndValue * 2) - 1;
                        break;
                    }
                    case 'TM': {
                        // Per-voice TM: each voice gets independent step position
                        const tmKey = `${voice.voiceId}:${paramId}`;

                        // Lazy-init per-voice pattern if needed
                        let pattern = modConfig.tmPattern;
                        if (!pattern || pattern.length === 0) {
                            const length = modConfig.tmLength || 8;
                            pattern = [];
                            for (let i = 0; i < length; i++) {
                                pattern.push(Math.random());
                            }
                            modConfig.tmPattern = pattern;
                        }

                        // Lazy-init per-voice step counter using nodeIndex (0-7) for offset spread
                        if (!tmCurrentSteps.has(tmKey)) {
                            const voiceOffset = (voice.nodeIndex || 0) % (modConfig.tmLength || 8);
                            tmCurrentSteps.set(tmKey, voiceOffset);
                        }

                        const currentStep = tmCurrentSteps.get(tmKey) ?? 0;
                        const tmValue = pattern[currentStep] ?? 0.5;
                        waveValue = (tmValue * 2) - 1;
                        break;
                    }
                    case 'EF': {
                        const efValue = efSmoothedValues.get(paramId) ?? 0;
                        const sensitivity = (modConfig.efSensitivity || 100) / 100;
                        const scaledValue = Math.min(1, efValue * sensitivity);
                        waveValue = (scaledValue * 2) - 1;
                        break;
                    }
                    case 'LFO':
                    default: {
                        // Use per-voice phase key for independent LFO phase per voice
                        const phaseKey = `${voice.voiceId}:${paramId}`;

                        if (!phaseAccumulators.has(phaseKey)) {
                            // Add per-voice phase offset for polyphonic spread (8 voices, 0.125 spacing)
                            const voiceOffset = (voice.voiceId % 8) * 0.125;
                            phaseAccumulators.set(phaseKey, {
                                phase: voiceOffset,
                                lastTime: now
                            });
                        }

                        const phaseData = phaseAccumulators.get(phaseKey);
                        const deltaTime = (now - phaseData.lastTime) / 1000;
                        phaseData.phase = (phaseData.phase + (modConfig.rate || modConfig.lfoRate || 1.0) * deltaTime) % 1.0;
                        phaseData.lastTime = now;

                        // Pass voiceId for S&H waveform
                        waveValue = calculateWaveValue(phaseData.phase, modConfig.waveform ?? modConfig.lfoWaveform ?? 0, paramId, voice.voiceId);
                        break;
                    }
                }

                const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;
                const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];
                const range = paramDef.max - paramDef.min;
                const modulatedValue = baseValue + (modAmount / 100) * range;
                const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

                // Send to specific voice via worklet bridge
                sendFilterModulationToVoice(voice.voiceId, paramId, clampedValue);
            }
        }
        return;
    }

    // Web Audio path: per-voice filter modulation
    const audioNow = config.audioContext.currentTime;
    const rampTime = 0.005; // Smooth ramp for modulation changes

    for (const voice of config.voices) {
        if (!voice || !voice.active) continue;

        // Apply modulations to each voice independently
        for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
            if (!modConfig.enabled || modConfig.depth === 0 || modConfig.muted) continue;

            // Only process filter parameters in this function
            if (!paramId.startsWith('filter.')) continue;

            const paramDef = parameterDefinitions[paramId];
            if (!paramDef) continue;

            // Get wave value based on mode (use global state for non-LFO modes)
            let waveValue;
            const mode = modConfig.mode || 'LFO';

            switch (mode) {
                case 'SEQ': {
                    // Per-voice SEQ: each voice gets independent step position
                    const seqKey = `${voice.id}:${paramId}`;

                    let seqPattern = seqPatterns.get(seqKey);
                    if (!seqPattern) {
                        // Create per-voice pattern with shared VALUES but independent step
                        seqPattern = new SeqPattern(
                            modConfig.seqLength || 4,
                            modConfig.seqPattern || null
                        );
                        // Offset each voice's starting step for spread
                        const voiceOffset = voice.id % (modConfig.seqLength || 4);
                        for (let i = 0; i < voiceOffset; i++) {
                            seqPattern.advance();
                        }
                        seqPatterns.set(seqKey, seqPattern);
                    }

                    const seqValue = seqPattern.getValue();
                    waveValue = (seqValue * 2) - 1;
                    break;
                }
                case 'ENV': {
                    // Get or create ADEnvelope on-demand
                    let envelope = envEnvelopes.get(paramId);
                    if (!envelope) {
                        envelope = new ADEnvelope(
                            modConfig.envAttackMs || 10,
                            modConfig.envReleaseMs || 200,
                            modConfig.envCurveShape || 'exponential'
                        );
                        envEnvelopes.set(paramId, envelope);
                    }
                    const envValue = envelope.getValue(now);
                    waveValue = (envValue * 2) - 1;
                    break;
                }
                case 'RND': {
                    // Per-voice RND: each voice gets independent LFSR state
                    const rndKey = `${voice.id}:${paramId}`;

                    // Lazy-init per-voice LFSR if needed
                    let lfsr = rndGenerators.get(rndKey);
                    if (!lfsr) {
                        const bitLength = modConfig.rndBitLength || 16;
                        lfsr = new LFSR(bitLength);
                        rndGenerators.set(rndKey, lfsr);
                        rndCurrentValues.set(rndKey, lfsr.nextNormalised());
                    }

                    const rndValue = rndCurrentValues.get(rndKey) ?? 0.5;
                    waveValue = (rndValue * 2) - 1;
                    break;
                }
                case 'TM': {
                    // Per-voice TM: each voice gets independent step position
                    const tmKey = `${voice.id}:${paramId}`;

                    // Lazy-init per-voice pattern if needed
                    let pattern = modConfig.tmPattern;
                    if (!pattern || pattern.length === 0) {
                        const length = modConfig.tmLength || 8;
                        pattern = [];
                        for (let i = 0; i < length; i++) {
                            pattern.push(Math.random());
                        }
                        modConfig.tmPattern = pattern;
                    }

                    // Lazy-init per-voice step counter with offset for spread
                    if (!tmCurrentSteps.has(tmKey)) {
                        const voiceOffset = voice.id % (modConfig.tmLength || 8);
                        tmCurrentSteps.set(tmKey, voiceOffset);
                    }

                    const currentStep = tmCurrentSteps.get(tmKey) ?? 0;
                    const tmValue = pattern[currentStep] ?? 0.5;
                    waveValue = (tmValue * 2) - 1;
                    break;
                }
                case 'EF': {
                    const efValue = efSmoothedValues.get(paramId) ?? 0;
                    const sensitivity = (modConfig.efSensitivity || 100) / 100;
                    const scaledValue = Math.min(1, efValue * sensitivity);
                    waveValue = (scaledValue * 2) - 1;
                    break;
                }
                case 'LFO':
                default: {
                    // Use per-voice phase key: voiceId:paramId
                    const phaseKey = `${voice.id}:${paramId}`;

                    // Get or initialize phase for this voice with per-voice offset
                    if (!phaseAccumulators.has(phaseKey)) {
                        // Add per-voice phase offset for polyphonic spread (8 voices, 0.125 spacing)
                        const voiceOffset = (voice.id % 8) * 0.125;
                        phaseAccumulators.set(phaseKey, {
                            phase: voiceOffset,
                            lastTime: now
                        });
                    }

                    const phaseData = phaseAccumulators.get(phaseKey);

                    // Advance phase based on rate
                    const deltaTime = (now - phaseData.lastTime) / 1000;
                    phaseData.phase = (phaseData.phase + (modConfig.rate || modConfig.lfoRate || 1.0) * deltaTime) % 1.0;
                    phaseData.lastTime = now;

                    // Calculate waveform value (-1 to +1) - pass voiceId for S&H
                    waveValue = calculateWaveValue(phaseData.phase, modConfig.waveform ?? modConfig.lfoWaveform ?? 0, paramId, voice.id);
                    break;
                }
            }

            // Apply depth and offset
            const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;

            // Get base parameter value
            const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];

            // Calculate modulated value
            const range = paramDef.max - paramDef.min;
            const modulatedValue = baseValue + (modAmount / 100) * range;
            const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

            // Apply modulation directly to this voice's filter nodes
            applyPolyVoiceFilterModulation(voice, paramId, clampedValue, baseValue, audioNow, rampTime);
        }
    }
}

// Apply modulated value to a specific voice's filter nodes in POLY mode
function applyPolyVoiceFilterModulation(voice, paramId, modulatedValue, baseValue, audioNow, rampTime) {
    if (!voice.filterNodes) return;

    try {
        switch(paramId) {
            case 'filter.envAmount':
                // Modulate the envelope depth for this voice
                if (voice.filterEnvelopeSource && voice.baseCutoff) {
                    const envModAmount = modulatedValue / 100;
                    const envModFactor = Math.pow(2, envModAmount * 6); // Max 6 octave sweep
                    const envDepthHz = voice.baseCutoff * (envModFactor - 1);
                    voice.filterEnvelopeSource.offset.setTargetAtTime(envDepthHz, audioNow, rampTime);
                }
                break;

            case 'filter.lowPass':
                // Modulate the base cutoff for this voice
                if (voice.filterBaseCutoffSource) {
                    const keyTrackedCutoff = calculateKeyTrackedBaseCutoff(voice.note, modulatedValue, state.keyFollow);
                    voice.filterBaseCutoffSource.offset.setTargetAtTime(keyTrackedCutoff, audioNow, rampTime);
                    voice.baseCutoff = keyTrackedCutoff; // Update cached value
                }
                break;

            case 'filter.highPass':
                if (voice.filterNodes.hp) {
                    const hpCutoff = mapRange(modulatedValue, 0, 100, 20, 10000, true);
                    voice.filterNodes.hp.frequency.setTargetAtTime(hpCutoff, audioNow, rampTime);
                }
                break;

            case 'filter.resonance':
                if (voice.filterNodes.lp) {
                    const resonance = mapRange(Math.pow(modulatedValue / 100, 1.5), 0, 1, 0.7, 25);
                    voice.filterNodes.lp.Q.setTargetAtTime(resonance, audioNow, rampTime);
                    if (voice.filterNodes.hp) {
                        const hpResonance = Math.max(0.1, resonance * 0.5);
                        voice.filterNodes.hp.Q.setTargetAtTime(hpResonance, audioNow, rampTime);
                    }
                }
                break;

            case 'filter.mod':
                // Modulate the LFO depth for this voice
                if (voice.filterLfoGain && voice.baseCutoff) {
                    const lfoDepthPercent = modulatedValue / 100;
                    const maxModOctaves = 2;
                    const lfoDepthHz = voice.baseCutoff * (Math.pow(2, maxModOctaves) - 1) * lfoDepthPercent;
                    voice.filterLfoGain.gain.setTargetAtTime(lfoDepthHz, audioNow, rampTime);
                }
                break;

            // Note: filter.keyFollow is not typically modulated per-voice as it's a global setting
        }
    } catch (e) {
        console.warn(`Error applying per-voice modulation for ${paramId} on voice ${voice.id}:`, e);
    }
}

// Use the imported function from voice.js
function calculateKeyTrackedBaseCutoff(note, lowPassSetting, keyFollowSetting) {
    return calculateKeyTrackedBaseCutoffFromVoice(note, lowPassSetting, keyFollowSetting);
}

// Send filter modulation directly to worklet bridge (bypasses updateFilter which early-returns for worklet mode)
// Used for MONO mode where all voices share the same modulation value
function sendFilterModulationToWorklet(paramId, value) {
    if (!config.workletBridge) return;

    switch(paramId) {
        case 'filter.lowPass':
            const lpCutoff = mapRange(value, 0, 100, 20, 20000, true);
            config.workletBridge.updateAllParameters({ filterCutoff: lpCutoff });
            break;
        case 'filter.highPass':
            const hpCutoff = mapRange(value, 0, 100, 20, 10000, true);
            config.workletBridge.updateAllParameters({ hpfCutoff: hpCutoff });
            break;
        case 'filter.resonance':
            const q = mapRange(Math.pow(value / 100, 1.5), 0, 1, 0.7, 25);
            config.workletBridge.updateAllParameters({ filterResonance: q });
            break;
        case 'filter.keyFollow':
            const keyTrack = value / 100;
            config.workletBridge.updateAllParameters({ keyTracking: keyTrack });
            break;
        case 'filter.envAmount':
            const envAmt = (value / 100) * 2 - 1; // 0-100 → -1 to +1
            config.workletBridge.updateAllParameters({ filterEnvAmount: envAmt });
            break;
        case 'filter.mod':
            const lfoToFilter = value / 100;
            config.workletBridge.updateAllParameters({ lfoToFilter: lfoToFilter });
            break;
    }
}

// Send filter modulation to a specific voice (for POLY mode per-voice modulation)
function sendFilterModulationToVoice(voiceId, paramId, value) {
    if (!config.workletBridge) return;

    let params = {};

    switch(paramId) {
        case 'filter.lowPass':
            params.filterCutoff = mapRange(value, 0, 100, 20, 20000, true);
            break;
        case 'filter.highPass':
            params.hpfCutoff = mapRange(value, 0, 100, 20, 10000, true);
            break;
        case 'filter.resonance':
            params.filterResonance = mapRange(Math.pow(value / 100, 1.5), 0, 1, 0.7, 25);
            break;
        case 'filter.keyFollow':
            params.keyTracking = value / 100;
            break;
        case 'filter.envAmount':
            params.filterEnvAmount = (value / 100) * 2 - 1; // 0-100 → -1 to +1
            break;
        case 'filter.mod':
            params.lfoToFilter = value / 100;
            break;
        default:
            return;
    }

    config.workletBridge.updateVoiceParameters(voiceId, params);
}

// Send Plaits modulation to a specific voice (for POLY mode per-voice modulation)
function sendPlaitsModulationToVoice(voiceIndex, paramId, value) {
    if (!config.plaitsVoicePool || !config.plaitsVoicePool.isReady()) return;

    const paramMap = {
        'plaits.harmonics': 'harmonics',
        'plaits.timbre': 'timbre',
        'plaits.morph': 'morph',
        'plaits.lpgDecay': 'lpgDecay',
        'plaits.lpgColour': 'lpgColour'
    };

    const processorParam = paramMap[paramId];
    if (!processorParam) return;

    // Value comes in 0-100, normalise to 0-1
    const normalisedValue = Math.max(0, Math.min(1, value / 100));

    config.plaitsVoicePool.updateVoiceParameters(voiceIndex, {
        [processorParam]: normalisedValue
    });
}

// Apply per-voice Plaits modulation for POLY mode
function applyPlaitsPolyVoiceModulations(now) {
    if (!config.plaitsVoicePool || !config.plaitsVoicePool.isReady()) return;

    // Update voice states (check for released voices)
    config.plaitsVoicePool.checkReleasedVoices();

    // Get active voices from the pool
    const activeVoices = config.plaitsVoicePool.getActiveVoices();
    if (activeVoices.length === 0) return;

    // Process each active voice with independent modulation
    for (const voice of activeVoices) {
        for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
            if (!modConfig.enabled || modConfig.depth === 0 || modConfig.muted) continue;
            if (!paramId.startsWith('plaits.')) continue;
            if (paramId === 'plaits.model') continue; // Model is global

            const paramDef = parameterDefinitions[paramId];
            if (!paramDef) continue;

            // Get wave value based on mode with per-voice phase
            let waveValue;
            const mode = modConfig.mode || 'LFO';

            switch (mode) {
                case 'SEQ': {
                    // Use global sequential step for all voices
                    // Get or create the global pattern
                    let seqPattern = seqPatterns.get(paramId);
                    if (!seqPattern) {
                        seqPattern = new SeqPattern(
                            modConfig.seqLength || 4,
                            modConfig.seqPattern || null
                        );
                        seqPatterns.set(paramId, seqPattern);
                    }
                    // Use the global display step to get current value
                    const currentStep = modConfig.seqDisplayStep ?? 0;
                    const seqValue = seqPattern.getStepValue(currentStep);
                    waveValue = (seqValue * 2) - 1;
                    break;
                }
                case 'ENV': {
                    let envelope = envEnvelopes.get(paramId);
                    if (!envelope) {
                        envelope = new ADEnvelope(
                            modConfig.envAttackMs || 10,
                            modConfig.envReleaseMs || 200,
                            modConfig.envCurveShape || 'exponential'
                        );
                        envEnvelopes.set(paramId, envelope);
                    }
                    const envValue = envelope.getValue(now);
                    waveValue = (envValue * 2) - 1;
                    break;
                }
                case 'RND': {
                    const rndKey = `${voice.voiceId}:${paramId}`;
                    let lfsr = rndGenerators.get(rndKey);
                    if (!lfsr) {
                        const bitLength = modConfig.rndBitLength || 16;
                        lfsr = new LFSR(bitLength);
                        rndGenerators.set(rndKey, lfsr);
                        rndCurrentValues.set(rndKey, lfsr.nextNormalised());
                    }
                    const rndValue = rndCurrentValues.get(rndKey) ?? 0.5;
                    waveValue = (rndValue * 2) - 1;
                    break;
                }
                case 'TM': {
                    // Use global sequential step (set by stepModAdvance handler)
                    // This ensures all voices use the same step, advancing in order
                    let pattern = modConfig.tmPattern;
                    if (!pattern || pattern.length === 0) {
                        const length = modConfig.tmLength || 8;
                        pattern = [];
                        for (let i = 0; i < length; i++) {
                            pattern.push(Math.random());
                        }
                        modConfig.tmPattern = pattern;
                    }
                    // Read from global key for sequential stepping
                    const currentStep = tmCurrentSteps.get(paramId) ?? 0;
                    const tmValue = pattern[currentStep] ?? 0.5;
                    waveValue = (tmValue * 2) - 1;
                    break;
                }
                case 'EF': {
                    const efValue = efSmoothedValues.get(paramId) ?? 0;
                    const sensitivity = (modConfig.efSensitivity || 100) / 100;
                    const scaledValue = Math.min(1, efValue * sensitivity);
                    waveValue = (scaledValue * 2) - 1;
                    break;
                }
                case 'LFO':
                default: {
                    // Use per-voice phase key for independent LFO phase per voice
                    const phaseKey = `${voice.voiceId}:${paramId}`;

                    if (!phaseAccumulators.has(phaseKey)) {
                        // Add per-voice phase offset for polyphonic spread (8 voices, 0.125 spacing)
                        const voiceOffset = (voice.nodeIndex || 0) * 0.125;
                        phaseAccumulators.set(phaseKey, {
                            phase: voiceOffset,
                            lastTime: now
                        });
                    }

                    const phaseData = phaseAccumulators.get(phaseKey);
                    const deltaTime = (now - phaseData.lastTime) / 1000;
                    phaseData.phase = (phaseData.phase + (modConfig.rate || modConfig.lfoRate || 1.0) * deltaTime) % 1.0;
                    phaseData.lastTime = now;

                    waveValue = calculateWaveValue(phaseData.phase, modConfig.waveform ?? modConfig.lfoWaveform ?? 0, paramId, voice.voiceId);
                    break;
                }
            }

            const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;
            const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];
            const range = paramDef.max - paramDef.min;
            const modulatedValue = baseValue + (modAmount / 100) * range;
            const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

            // Send to specific voice via Plaits voice pool
            sendPlaitsModulationToVoice(voice.nodeIndex, paramId, clampedValue);
        }
    }
}

function applyModulatedValue(paramId, modulatedValue, baseValue) {
    // This function applies the modulated value to the audio engine
    // The modulated value is kept in state so envelope/audio engine can use it
    // The base value is preserved so faders show the user's setting

    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) return;

    // --- Dangerous Parameter Bounds Enforcement ---
    const dangerousConfig = PPMOD_DANGEROUS_PARAMS[paramId];
    if (dangerousConfig) {
        if (dangerousConfig.minSafe !== undefined && modulatedValue < dangerousConfig.minSafe) {
            console.warn(`[PPMod] ${paramId} clamped to ${dangerousConfig.minSafe}: ${dangerousConfig.reason}`);
            modulatedValue = dangerousConfig.minSafe;
        }
        if (dangerousConfig.maxSafe !== undefined && modulatedValue > dangerousConfig.maxSafe) {
            console.warn(`[PPMod] ${paramId} clamped to ${dangerousConfig.maxSafe}: ${dangerousConfig.reason}`);
            modulatedValue = dangerousConfig.maxSafe;
        }
    }

    // Round integer params to prevent decimal display values
    if (paramId === 'osc.oct' || paramId === 'osc.subOct' ||
        paramId === 'factors.steps' || paramId === 'factors.fills' ||
        paramId === 'factors.shift' || paramId === 'factors.accentAmt' ||
        paramId === 'factors.slideAmt' || paramId === 'factors.trillAmt' ||
        paramId === 'path.scale' || paramId === 'path.root') {
        modulatedValue = Math.round(modulatedValue);
    }

    // Directly update state value - this affects audio
    // EXCEPT for Clouds params which send directly to worklet and don't need state updates
    // (Writing to state causes value drift as modulation compounds on itself)
    if (!paramId.startsWith('clouds.')) {
        state[paramDef.statePath] = modulatedValue;
    }

    // Call appropriate side-effect functions based on parameter type
    // This ensures audio updates and visualizations are triggered
    switch(paramId) {
        // Filter parameters
        case 'filter.highPass':
        case 'filter.lowPass':
        case 'filter.resonance':
        case 'filter.keyFollow':
        case 'filter.envAmount':
        case 'filter.mod':
            // Send directly to worklet if active (updateFilter early-returns for worklet mode)
            if (config.useWorklet && config.workletBridge) {
                sendFilterModulationToWorklet(paramId, modulatedValue);
            } else {
                updateFilter();
            }
            break;

        // Reverb parameters
        // Note: drawReverb() removed - handled by main animation loop
        case 'reverb.mix':
            updateReverbSendLevel();
            break;
        case 'reverb.preDelay':
        case 'reverb.decay':
        case 'reverb.diffusion':
        case 'reverb.damping':
            updateReverb();
            break;

        // Delay parameters
        case 'delay.mix':
        case 'delay.time':
        case 'delay.feedback':
        case 'delay.wow':
        case 'delay.flutter':
        case 'delay.saturation':
            updateDelay();
            drawDelay();
            startDelayAnimation();
            break;

        // Oscillator parameters
        case 'osc.pulseWidth':
            updatePulseWidth();
            break;
        case 'osc.oct':
        case 'osc.subOct':
            updateOscillatorTransposition();
            break;

        // Mixer parameters (real-time level modulation)
        case 'mixer.sawLevel':
        case 'mixer.squareLevel':
        case 'mixer.triangleLevel':
        case 'mixer.subLevel':
        case 'mixer.noiseLevel':
            updateMixerLevels();
            break;

        // Clouds parameters (granular processor)
        case 'clouds.pitch':
        case 'clouds.position':
        case 'clouds.density':
        case 'clouds.size':
        case 'clouds.texture':
        case 'clouds.dryWet':
        case 'clouds.spread':
        case 'clouds.feedback':
        case 'clouds.reverb':
        case 'clouds.inputGain':
            updateCloudsParameter(paramId, modulatedValue);
            break;

        // Plaits parameters (multi-engine synthesiser)
        case 'plaits.model':
            // Model is special - it sets the engine index (0-23)
            updatePlaitsParameter(paramId, modulatedValue);
            // Update model display
            document.dispatchEvent(new CustomEvent('plaitsModelChanged', {
              detail: { model: Math.round(modulatedValue) }
            }));
            break;
        case 'plaits.harmonics':
        case 'plaits.timbre':
        case 'plaits.morph':
        case 'plaits.lpgDecay':
        case 'plaits.lpgColour':
            // Normalise 0-100 to 0-1 range for Plaits AudioParams
            updatePlaitsParameter(paramId, modulatedValue / 100);
            break;

        // Rings parameters (physical modelling resonator)
        case 'rings.structure':
        case 'rings.brightness':
        case 'rings.damping':
        case 'rings.position':
            // Normalise 0-100 to 0-1 range for Rings AudioParams
            updateRingsParameter(paramId, modulatedValue / 100);
            break;

        // FACTORS parameters (Euclidean pattern generator)
        case 'factors.steps':
        case 'factors.fills':
        case 'factors.shift':
        case 'factors.accentAmt':
        case 'factors.slideAmt':
        case 'factors.trillAmt':
            // State already rounded and updated above - regenerate pattern
            updateFactorsPattern();
            break;

        case 'factors.gateLength':
            // Gate length doesn't regenerate pattern, just affects note duration
            // State already updated above
            break;

        // LFO parameters (main LFO that drives PATH sampling)
        case 'lfo.amp':
        case 'lfo.freq':
        case 'lfo.waveform':
        case 'lfo.offset':
            // LFO values are read directly from state in updateLfoValue()
            // Animation loop redraws continuously
            break;

        // PATH parameters (scale quantisation and triggering)
        case 'path.scale':
        case 'path.root':
            // State already rounded and updated above
            // Redraw path visualisation
            drawPath();
            break;

        case 'path.probability':
            // Probability is read directly from state in handleSampleTrigger()
            break;

        // Envelope, Mod LFO parameters don't need update calls
        // They're read directly from state when needed
        default:
            break;
    }

    // Note: Fader UI updates are handled by updateModulationVisualFeedback()
    // which runs in the modulation loop and updates fader fills in real-time
}

// --- Audio-Rate Voice Attachment ---

export function attachAudioRateModulationsToVoice(voice) {
    // Check for active audio-rate modulations and create LFOs on the new voice
    if (!voice || !config.audioContext) return;

    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        // Skip if not enabled, no depth, or muted
        if (!modConfig.enabled || modConfig.depth === 0 || modConfig.muted) continue;

        // Only process audio-rate params
        if (!isAudioRateParam(paramId)) continue;

        // Create LFO for this param on this voice
        createFilterParamLFO(voice, paramId, modConfig);
    }
}

// --- Reset Handlers ---

export function resetPhasesWithMode(mode) {
    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        if (modConfig.resetMode !== mode) continue;

        // Reset k-rate phase
        const phaseData = phaseAccumulators.get(paramId);
        if (phaseData) {
            phaseData.phase = 0;
        }

        // Reset audio-rate oscillator phase
        // Note: Web Audio API doesn't allow phase reset on running oscillators
        // We'd need to stop/restart, which causes clicks
        // For now, audio-rate LFOs run continuously without reset
        // TODO: Implement click-free phase reset if needed
    }
}

function handleGateTrigger(event) {
    // Sample new random values for all S&H modulations
    const voiceId = event?.detail?.voiceId || null;
    const now = performance.now();

    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        if (!modConfig.enabled || modConfig.depth === 0 || modConfig.muted) continue;

        // --- S&H waveform handling ---
        if (modConfig.waveform === 5) { // S&H waveform
            // Sample new random value
            const randomValue = (Math.random() * 2) - 1; // -1 to +1

            // Use per-voice key in POLY mode, global key in MONO mode
            if (voiceId && !state.monoMode) {
                // POLY mode: Store under BOTH per-voice key (for filter params) AND global key (for non-filter params)
                const key = `${voiceId}:${paramId}`;
                sampleAndHoldValues.set(key, randomValue);
                // Also store under global key so non-filter params can retrieve it
                sampleAndHoldValues.set(paramId, randomValue);
                // console.log(`Per-param S&H POLY: Voice ${voiceId}, param ${paramId}, value ${randomValue.toFixed(3)}`);
            } else {
                // MONO mode or no voiceId - use global key
                sampleAndHoldValues.set(paramId, randomValue);
                // console.log(`Per-param S&H MONO: param ${paramId}, value ${randomValue.toFixed(3)}`);
            }
        }

        // --- ENV mode envelope triggering ---
        if (modConfig.mode === 'ENV' && modConfig.envSource === 'note-on') {
            const envelope = envEnvelopes.get(paramId);
            if (envelope) {
                envelope.trigger(now);
            }
        }

        // --- RND mode advancement on trigger ---
        if (modConfig.mode === 'RND') {
            if (voiceId && !state.monoMode) {
                // POLY: handled by stepModAdvance event (needs nodeIndex)
                // Do nothing here
            } else {
                // MONO: global RND
                let lfsr = rndGenerators.get(paramId);
                if (!lfsr) {
                    const bitLength = modConfig.rndBitLength || 16;
                    lfsr = new LFSR(bitLength);
                    rndGenerators.set(paramId, lfsr);
                }
                const newValue = lfsr.nextNormalised();
                rndCurrentValues.set(paramId, newValue);
            }
        }

        // --- SEQ mode advancement on trigger ---
        if (modConfig.mode === 'SEQ') {
            if (voiceId && !state.monoMode) {
                // POLY: handled by stepModAdvance event (needs nodeIndex for offset)
                // Do nothing here
            } else {
                // MONO: global SEQ step
                let seqPattern = seqPatterns.get(paramId);
                if (!seqPattern) {
                    seqPattern = new SeqPattern(
                        modConfig.seqLength || 4,
                        modConfig.seqPattern || null
                    );
                    seqPatterns.set(paramId, seqPattern);
                }
                seqPattern.advance();
                modConfig.seqCurrentStep = seqPattern.currentStep;
                updateSeqEditorHighlight(paramId, seqPattern.currentStep);
            }
        }

        // --- TM mode advancement on trigger ---
        if (modConfig.mode === 'TM') {
            const length = modConfig.tmLength || 8;

            if (voiceId && !state.monoMode) {
                // POLY: handled by stepModAdvance event (needs nodeIndex for offset)
                // Do nothing here
            } else {
                // MONO: global TM step
                const prevStep = tmCurrentSteps.get(paramId) ?? 0;
                let currentStep = (prevStep + 1) % length;
                tmCurrentSteps.set(paramId, currentStep);
                modConfig.tmCurrentStep = currentStep;

                const pattern = modConfig.tmPattern;

                // Probabilistic mutation
                const probability = (modConfig.tmProbability ?? 50) / 100;
                if (Math.random() < probability) {
                    if (modConfig.tmPattern && modConfig.tmPattern[currentStep] !== undefined) {
                        modConfig.tmPattern[currentStep] = Math.random();
                    }
                }
                updateTMPatternHighlight(paramId, currentStep, modConfig.tmPattern);
            }
        }
    }
}

/**
 * Sample current modulated value for a parameter at voice creation time
 * Used to get S&H or modulated values BEFORE applying envelopes
 */
export function sampleParameterForVoice(paramId, voiceId = null) {
    const modConfig = state.perParamModulations[paramId];

    if (!modConfig || !modConfig.enabled || modConfig.depth === 0 || modConfig.muted) {
        // No modulation (or muted) - return base state value
        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) return null;
        const baseValue = state[paramDef.statePath];
        // console.log(`sampleParameterForVoice: ${paramId} (voiceId=${voiceId}) - NO MODULATION, returning base: ${baseValue}`);
        return baseValue;
    }


    // Get phase data for this voice/param
    const phaseKey = (voiceId && !state.monoMode) ? `${voiceId}:${paramId}` : paramId;

    // Get or initialize phase accumulator
    let phaseData = phaseAccumulators.get(phaseKey);
    if (!phaseData) {
        // Initialize phase for new voice
        // For S&H, start at 0 (value will be sampled on gate)
        // For other waveforms, use current global phase to get varied values per note
        let initialPhase = 0;
        if (modConfig.waveform !== 5) { // Not S&H
            // Try to get global phase for this parameter (non-voice-specific)
            const globalPhaseData = phaseAccumulators.get(paramId);
            if (globalPhaseData) {
                initialPhase = globalPhaseData.phase; // Inherit current global phase
            } else {
                initialPhase = Math.random(); // Random starting phase if no global
            }
        }

        phaseData = {
            phase: initialPhase,
            lastTime: performance.now()
        };
        phaseAccumulators.set(phaseKey, phaseData);
    }

    const waveValue = calculateWaveValue(
        phaseData.phase,
        modConfig.waveform,
        paramId,
        voiceId
    );

    // Apply depth and offset
    const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;

    // Get base parameter value
    const paramDef = parameterDefinitions[paramId];
    const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];

    // Calculate modulated value
    const range = paramDef.max - paramDef.min;
    const modulatedValue = baseValue + (modAmount / 100) * range;
    const clampedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));


    // Update fader to show the last note's modulated value (visual feedback in poly mode)
    updateParameterById(paramId, clampedValue);

    return clampedValue;
}

function handleStepReset() {
    resetPhasesWithMode('step');
}

function handleAccentReset(event) {
    if (!event.detail) return;
    resetPhasesWithMode('accent');
}

// --- Cleanup Functions ---

// Clean up per-voice modulation state when a voice is released
export function cleanupVoiceModulationState(voiceId) {
    if (!voiceId) return;

    // Remove per-voice S&H values
    for (const [key] of sampleAndHoldValues.entries()) {
        if (key.startsWith(`${voiceId}:`)) {
            sampleAndHoldValues.delete(key);
        }
    }

    // Remove per-voice phase accumulators
    for (const [key] of phaseAccumulators.entries()) {
        if (key.startsWith(`${voiceId}:`)) {
            phaseAccumulators.delete(key);
        }
    }

    // Remove per-voice RND state
    for (const [key] of rndGenerators.entries()) {
        if (key.startsWith(`${voiceId}:`)) {
            rndGenerators.delete(key);
        }
    }
    for (const [key] of rndCurrentValues.entries()) {
        if (key.startsWith(`${voiceId}:`)) {
            rndCurrentValues.delete(key);
        }
    }

    // Remove per-voice TM state
    for (const [key] of tmCurrentSteps.entries()) {
        if (key.startsWith(`${voiceId}:`)) {
            tmCurrentSteps.delete(key);
        }
    }

    // Remove per-voice SEQ state
    for (const [key] of seqPatterns.entries()) {
        if (key.startsWith(`${voiceId}:`)) {
            seqPatterns.delete(key);
        }
    }

    // console.log(`Cleaned up modulation state for voice ${voiceId}`);
}

// Clean up mode-specific phase accumulators and S&H values when switching modes
export function cleanupModeSwitch(switchingToPoly) {
    if (switchingToPoly) {
        // Switching to POLY - clear all global (non-voice-prefixed) state for fresh per-voice init

        // Clear global phase accumulators
        for (const [key] of phaseAccumulators.entries()) {
            if (!key.includes(':')) {
                phaseAccumulators.delete(key);
            }
        }

        // Clear global S&H values
        for (const [key] of sampleAndHoldValues.entries()) {
            if (!key.includes(':')) {
                sampleAndHoldValues.delete(key);
            }
        }

        // Clear global RND state
        for (const [key] of rndGenerators.entries()) {
            if (!key.includes(':')) {
                rndGenerators.delete(key);
            }
        }
        for (const [key] of rndCurrentValues.entries()) {
            if (!key.includes(':')) {
                rndCurrentValues.delete(key);
            }
        }

        // Clear global TM state
        for (const [key] of tmCurrentSteps.entries()) {
            if (!key.includes(':')) {
                tmCurrentSteps.delete(key);
            }
        }

        // Clear global SEQ state
        for (const [key] of seqPatterns.entries()) {
            if (!key.includes(':')) {
                seqPatterns.delete(key);
            }
        }

    } else {
        // Switching to MONO - clear all per-voice state

        // Clear per-voice phase accumulators
        for (const [key] of phaseAccumulators.entries()) {
            if (key.includes(':')) {
                phaseAccumulators.delete(key);
            }
        }

        // Clear per-voice S&H values
        for (const [key] of sampleAndHoldValues.entries()) {
            if (key.includes(':')) {
                sampleAndHoldValues.delete(key);
            }
        }

        // Clear per-voice RND state
        for (const [key] of rndGenerators.entries()) {
            if (key.includes(':')) {
                rndGenerators.delete(key);
            }
        }
        for (const [key] of rndCurrentValues.entries()) {
            if (key.includes(':')) {
                rndCurrentValues.delete(key);
            }
        }

        // Clear per-voice TM state
        for (const [key] of tmCurrentSteps.entries()) {
            if (key.includes(':')) {
                tmCurrentSteps.delete(key);
            }
        }

        // Clear per-voice SEQ state
        for (const [key] of seqPatterns.entries()) {
            if (key.includes(':')) {
                seqPatterns.delete(key);
            }
        }

        // Clear last triggered voice (only relevant in POLY mode)
        lastTriggeredVoiceId = null;

        // Reset display step counters for visual feedback
        for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
            if (modConfig.seqDisplayStep !== undefined) {
                modConfig.seqDisplayStep = 0;
            }
            if (modConfig.tmDisplayStep !== undefined) {
                modConfig.tmDisplayStep = 0;
            }
        }
    }
}

// --- Initialization ---

export function initPerParamModulation() {

    // Set up event listeners for reset modes and S&H triggers
    document.addEventListener('sequencerStep', handleStepReset);
    document.addEventListener('sequencerAccent', handleAccentReset);
    document.addEventListener('gateTriggered', handleGateTrigger);

    // Set up step advancement listener for SEQ/TM modes in POLY mode
    // This fires AFTER voice allocation so we have access to nodeIndex
    document.addEventListener('stepModAdvance', handleStepModAdvance);

    // Set up clock step listener for SEQ pattern advancement
    document.addEventListener('raemblStepAdvanced', handleSeqClockStep);
    document.addEventListener('clockTick', handleSeqClockStep); // Also listen for shared clock

    // Bar boundary triggers (separate for each app's bar length)
    document.addEventListener('raemblStepAdvanced', handleRaemblBarTrigger);
    document.addEventListener('baengStepAdvanced', handleBaengBarTrigger);

    // Cross-app triggers: Ræmbl can respond to Bæng voice triggers
    document.addEventListener('trackTriggered', handleBaengTrigger);

    // Expose cleanup function globally (similar to modlfo.js pattern)
    window.cleanupVoicePerParamModState = cleanupVoiceModulationState;

}

// --- Bar Boundary Trigger Handlers ---

/**
 * Handle Ræmbl bar boundary triggers
 * Check if any modulations have triggerSource='raemblBar' or resetSource='raemblBar'
 */
function handleRaemblBarTrigger(event) {
    const isBarStart = event.detail?.isBarStart;
    if (!isBarStart) return;

    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        if (!modConfig.enabled) continue;

        // Handle trigger on Ræmbl bar
        if (modConfig.triggerSource === 'raemblBar') {
            handleModTriggerAction(paramId, modConfig);
        }

        // Handle reset on Ræmbl bar
        if (modConfig.resetSource === 'raemblBar') {
            handleModResetAction(paramId, modConfig);
        }
    }
}

/**
 * Handle Bæng bar boundary triggers
 * Check if any modulations have triggerSource='baengBar' or resetSource='baengBar'
 */
function handleBaengBarTrigger(event) {
    const isBarStart = event.detail?.isBarStart;
    if (!isBarStart) return;

    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        if (!modConfig.enabled) continue;

        // Handle trigger on Bæng bar
        if (modConfig.triggerSource === 'baengBar') {
            handleModTriggerAction(paramId, modConfig);
        }

        // Handle reset on Bæng bar
        if (modConfig.resetSource === 'baengBar') {
            handleModResetAction(paramId, modConfig);
        }
    }
}

// --- Cross-App Trigger Handler (Bæng → Ræmbl) ---

/**
 * Handle Bæng voice triggers (cross-app)
 * Allows Ræmbl modulations to sync to Bæng drum triggers
 */
function handleBaengTrigger(event) {
    const trackIndex = event.detail?.trackIndex;
    const trackName = `T${(trackIndex ?? 0) + 1}`;

    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        if (!modConfig.enabled) continue;

        // Check if this param uses Bæng triggers
        const triggerSource = modConfig.triggerSource || 'none';
        const resetSource = modConfig.resetSource || 'none';

        // Handle trigger
        const shouldTrigger =
            triggerSource === trackName ||
            triggerSource === 'SUM' ||
            (['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].includes(triggerSource) && triggerSource === trackName);

        if (shouldTrigger) {
            handleModTriggerAction(paramId, modConfig);
        }

        // Handle reset
        const shouldReset =
            resetSource === trackName ||
            resetSource === 'SUM' ||
            (['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].includes(resetSource) && resetSource === trackName);

        if (shouldReset) {
            handleModResetAction(paramId, modConfig);
        }
    }
}

// --- Modulation Trigger/Reset Action Handlers ---

/**
 * Handle modulation trigger action (advance pattern, re-trigger envelope, etc.)
 */
function handleModTriggerAction(paramId, modConfig) {
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
            // Advance step with mutation
            advanceTMStepWithMutation(paramId, modConfig);
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
function handleModResetAction(paramId, modConfig) {
    const mode = modConfig.mode || 'LFO';

    switch (mode) {
        case 'SEQ':
            // Return to step 0
            const seqPattern = seqPatterns.get(paramId);
            if (seqPattern) seqPattern.currentStep = 0;
            break;
        case 'TM':
            // Return to step 0, restore initial pattern
            const tmState = tmCurrentSteps.get(paramId);
            if (tmState) {
                tmState.currentStep = 0;
                if (tmState.initialPattern) {
                    tmState.pattern = [...tmState.initialPattern];
                }
            }
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
            // Re-seed and zero
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
 * Advance TM step with probabilistic mutation
 */
function advanceTMStepWithMutation(paramId, modConfig) {
    let tmState = tmCurrentSteps.get(paramId);
    if (!tmState) {
        tmState = { currentStep: 0, pattern: [], initialPattern: [] };
        tmCurrentSteps.set(paramId, tmState);
    }

    // Advance step
    tmState.currentStep = (tmState.currentStep + 1) % Math.max(1, tmState.pattern.length);

    // Probabilistic mutation
    const mutationChance = (modConfig.tmMutationRate || 10) / 100;
    if (Math.random() < mutationChance && tmState.pattern.length > 0) {
        const stepToMutate = Math.floor(Math.random() * tmState.pattern.length);
        tmState.pattern[stepToMutate] = Math.random();
    }
}

// --- SEQ/TM Step Advancement Handler (POLY mode) ---
// This is called AFTER voice allocation so we have access to nodeIndex

/**
 * Handle step modulation advancement for SEQ/TM modes in POLY mode
 * Called after voice allocation with nodeIndex available
 */
function handleStepModAdvance(event) {
    const voiceId = event?.detail?.voiceId;
    const nodeIndex = event?.detail?.nodeIndex ?? 0;

    if (!voiceId) return;

    // Track last triggered voice for visual feedback (persists after release)
    lastTriggeredVoiceId = voiceId;

    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        if (!modConfig.enabled || modConfig.depth === 0 || modConfig.muted) continue;

        // --- SEQ mode: create pattern with offset and advance ---
        if (modConfig.mode === 'SEQ') {
            const seqKey = `${voiceId}:${paramId}`;
            let seqPattern = seqPatterns.get(seqKey);

            if (!seqPattern) {
                // Create pattern with voice offset
                seqPattern = new SeqPattern(
                    modConfig.seqLength || 4,
                    modConfig.seqPattern || null
                );
                // Apply voice offset based on nodeIndex (0-7)
                const voiceOffset = nodeIndex % (modConfig.seqLength || 4);
                for (let i = 0; i < voiceOffset; i++) {
                    seqPattern.advance();
                }
                seqPatterns.set(seqKey, seqPattern);
            }

            // Now advance the pattern
            seqPattern.advance();

            // Visual update - use sequential display step (not per-voice offset step)
            // This keeps visual feedback consistent while audio uses per-voice offsets
            const seqLength = modConfig.seqLength || 4;
            if (modConfig.seqDisplayStep === undefined) {
                modConfig.seqDisplayStep = 0;
            }
            modConfig.seqDisplayStep = (modConfig.seqDisplayStep + 1) % seqLength;
            modConfig.seqCurrentStep = modConfig.seqDisplayStep; // For compatibility
            updateSeqEditorHighlight(paramId, modConfig.seqDisplayStep);
        }

        // --- TM mode: create step counter with offset and advance ---
        if (modConfig.mode === 'TM') {
            const length = modConfig.tmLength || 8;
            const tmKey = `${voiceId}:${paramId}`;

            // Initialise pattern if needed
            let pattern = modConfig.tmPattern;
            if (!pattern || pattern.length === 0) {
                pattern = [];
                for (let i = 0; i < length; i++) {
                    pattern.push(Math.random());
                }
                modConfig.tmPattern = pattern;
            }

            // Get or create step counter with offset
            const isNew = !tmCurrentSteps.has(tmKey);
            if (isNew) {
                const voiceOffset = nodeIndex % length;
                tmCurrentSteps.set(tmKey, voiceOffset);
            }

            // Advance global sequential step (for all voices to use)
            if (modConfig.tmDisplayStep === undefined) {
                modConfig.tmDisplayStep = 0;
            }
            const prevDisplayStep = modConfig.tmDisplayStep;
            modConfig.tmDisplayStep = (modConfig.tmDisplayStep + 1) % length;
            modConfig.tmCurrentStep = modConfig.tmDisplayStep; // For compatibility

            // Set global key to sequential step (used by applyPlaitsPolyVoiceModulations)
            tmCurrentSteps.set(paramId, modConfig.tmDisplayStep);

            // Probabilistic mutation
            const probability = (modConfig.tmProbability ?? 50) / 100;
            if (Math.random() < probability) {
                if (pattern[modConfig.tmDisplayStep] !== undefined) {
                    pattern[modConfig.tmDisplayStep] = Math.random();
                }
            }
            updateTMPatternHighlight(paramId, modConfig.tmDisplayStep, pattern);
        }

        // --- RND mode: advance LFSR on trigger ---
        if (modConfig.mode === 'RND') {
            const rndKey = `${voiceId}:${paramId}`;
            let lfsr = rndGenerators.get(rndKey);
            if (!lfsr) {
                const bitLength = modConfig.rndBitLength || 16;
                lfsr = new LFSR(bitLength);
                rndGenerators.set(rndKey, lfsr);
            }
            const newValue = lfsr.nextNormalised();
            rndCurrentValues.set(rndKey, newValue);
        }
    }
}

// --- SEQ Clock Step Handler ---
// NOTE: SEQ and TM modes now advance on note triggers (via handleStepModAdvance),
// not on clock steps. This function is kept for potential future clock-synced modes.

/**
 * Handle clock step events (currently unused - SEQ/TM advance on triggers instead)
 */
function handleSeqClockStep(event) {
    // SEQ and TM modes now advance via stepModAdvance event
    // This handler is kept for potential future clock-synced modulation modes
}

/**
 * Update the TM pattern display in the modal (if open)
 */
function updateTMPatternHighlight(paramId, currentStep, pattern) {
    const modal = document.getElementById('ppmod-modal');
    if (!modal || modal.classList.contains('hidden')) return;

    // Only update if this is the currently displayed param
    const currentModalParam = getCurrentParamId();
    if (currentModalParam !== paramId) return;

    // Only update if TM tab is active
    const tmPanel = document.getElementById('ppmod-panel-tm');
    if (!tmPanel || tmPanel.classList.contains('hidden')) return;

    // Update step bars and highlights
    const container = document.getElementById('ppmod-tm-pattern');
    if (!container) return;

    const steps = container.querySelectorAll('.ppmod-tm-step');
    steps.forEach((step, index) => {
        step.classList.toggle('active', index === currentStep);

        // Update bar height if pattern value changed
        if (pattern && pattern[index] !== undefined) {
            const bar = step.querySelector('.ppmod-tm-step-bar');
            if (bar) {
                bar.style.height = `${pattern[index] * 100}%`;
            }
        }
    });
}

/**
 * Update the current step highlight in the SEQ editor modal
 */
function updateSeqEditorHighlight(paramId, currentStep) {
    const modal = document.getElementById('ppmod-modal');
    if (!modal || !modal.classList.contains('active')) return;

    // Only update if this is the currently displayed param
    const currentModalParam = getCurrentParamId();
    if (currentModalParam !== paramId) return;

    // Clear previous highlights
    const steps = modal.querySelectorAll('.ppmod-seq-step');
    steps.forEach((step, i) => {
        step.classList.toggle('active', i === currentStep);
    });
}

/**
 * Reset SEQ patterns (on bar start or explicit reset)
 */
export function resetSeqPatterns() {
    for (const seqPattern of seqPatterns.values()) {
        seqPattern.reset();
    }
}

// --- Visual Feedback ---

export function initModulationVisuals() {
    // Clear stale cache first (critical when FX mode changes and modules are re-rendered)
    // Remove overlay/baseLine elements that we created, then clear the cache
    for (const [paramId, elements] of cachedElements.entries()) {
        if (elements.overlay?.parentNode) {
            elements.overlay.remove();
        }
        if (elements.baseLine?.parentNode) {
            elements.baseLine.remove();
        }
    }
    cachedElements.clear();

    // Cache DOM elements for modulated parameters
    for (const paramId of Object.keys(parameterDefinitions)) {
        if (!isModulatable(paramId)) continue;

        const paramDef = parameterDefinitions[paramId];
        const moduleEl = document.getElementById(paramDef.module);
        if (!moduleEl) continue;

        const faderContainers = moduleEl.querySelectorAll('.fader-container');
        for (const container of faderContainers) {
            const labelEl = container.querySelector('.fader-label');
            if (!labelEl) continue;

            // Check data-param-label first (for SVG icons), then fall back to textContent
            const labelText = labelEl.dataset.paramLabel || labelEl.textContent.trim();
            if (labelText !== paramDef.label) continue;

            const fill = container.querySelector('.fader-fill');
            const track = container.querySelector('.fader-track');
            const valueDisplay = container.querySelector('.fader-value');

            if (!fill || !track) continue;

            // Create modulation overlay
            const overlay = document.createElement('div');
            overlay.className = 'fader-fill-modulated';
            overlay.style.height = '0%';
            track.appendChild(overlay);

            // Create base value reference line
            const baseLine = document.createElement('div');
            baseLine.className = 'fader-base-line';
            track.appendChild(baseLine);

            // Cache elements
            cachedElements.set(paramId, {
                container,
                label: labelEl,
                fill,
                overlay,
                baseLine,
                valueDisplay
            });

            break;
        }
    }

    // Also cache SlidePot-based parameters (new fader system)
    // SlidePots don't need legacy fader elements - they have their own LED brightness API
    for (const paramId of Object.keys(parameterDefinitions)) {
        if (!isModulatable(paramId)) continue;
        if (cachedElements.has(paramId)) continue; // Already cached via legacy fader

        const slidePot = slidePotRegistry.get(paramId);
        if (slidePot) {
            // Cache with slidePot reference for LED updates
            cachedElements.set(paramId, {
                slidePot: slidePot
            });
        }
    }
}

/**
 * Get the current wave value for a given mode and parameter
 * Returns a value from -1 to +1 for visual feedback
 */
function getWaveValueForMode(paramId, modConfig) {
    const mode = modConfig.mode || 'LFO';
    const now = performance.now();

    // For POLY mode visual feedback, prefer lastTriggeredVoiceId since that matches
    // the keying used by handleStepModAdvance() when patterns are created/advanced.
    // This ensures visual feedback shows the most recently triggered voice's state,
    // not just the first active voice (which may have stale pattern values).
    let firstActiveVoiceId = null;
    if (!state.monoMode) {
        // Prefer last triggered voice for visual feedback (matches handleStepModAdvance keying)
        if (lastTriggeredVoiceId !== null) {
            firstActiveVoiceId = lastTriggeredVoiceId;
        } else if (config.useWorklet && config.workletBridge) {
            // Fall back to first active worklet voice if no recent triggers
            const activeVoices = config.workletBridge.getActiveVoices();
            if (activeVoices.length > 0) {
                firstActiveVoiceId = activeVoices[0].voiceId;
            }
        } else if (config.voices && config.voices.length > 0) {
            // Fall back to first active Web Audio voice
            const firstActive = config.voices.find(v => v && v.active);
            if (firstActive) {
                firstActiveVoiceId = firstActive.id;
            }
        }
    }

    switch (mode) {
        case 'SEQ': {
            // Try per-voice key first, fall back to global key
            const perVoiceKey = (firstActiveVoiceId !== null) ? `${firstActiveVoiceId}:${paramId}` : null;
            let seqPattern = perVoiceKey ? seqPatterns.get(perVoiceKey) : null;
            if (!seqPattern) {
                // Fall back to global pattern
                seqPattern = seqPatterns.get(paramId);
            }
            if (!seqPattern) {
                // Create pattern from modConfig values
                seqPattern = new SeqPattern(
                    modConfig.seqLength || 4,
                    modConfig.seqPattern || null
                );
                seqPatterns.set(paramId, seqPattern);
            }
            const seqValue = seqPattern.getValue();
            return (seqValue * 2) - 1; // Map 0-1 to -1 to +1
        }

        case 'ENV': {
            // Get or create ADEnvelope on-demand for visual feedback
            let envelope = envEnvelopes.get(paramId);
            if (!envelope) {
                envelope = new ADEnvelope(
                    modConfig.envAttackMs || 10,
                    modConfig.envReleaseMs || 200,
                    modConfig.envCurveShape || 'exponential'
                );
                envEnvelopes.set(paramId, envelope);
            }
            const envValue = envelope.getValue(now);
            return (envValue * 2) - 1; // Map 0-1 to -1 to +1
        }

        case 'RND': {
            // Try per-voice key first, fall back to global key
            const perVoiceKey = (firstActiveVoiceId !== null) ? `${firstActiveVoiceId}:${paramId}` : null;
            let rndValue = perVoiceKey ? rndCurrentValues.get(perVoiceKey) : undefined;
            if (rndValue === undefined) {
                // Fall back to global value
                rndValue = rndCurrentValues.get(paramId) ?? 0.5;
            }
            return (rndValue * 2) - 1; // Map 0-1 to -1 to +1
        }

        case 'TM': {
            const pattern = modConfig.tmPattern;
            if (pattern && pattern.length > 0) {
                // Try per-voice key first, fall back to global key
                const perVoiceKey = (firstActiveVoiceId !== null) ? `${firstActiveVoiceId}:${paramId}` : null;
                let currentStep = perVoiceKey ? tmCurrentSteps.get(perVoiceKey) : undefined;
                if (currentStep === undefined) {
                    // Fall back to global step
                    currentStep = tmCurrentSteps.get(paramId) ?? 0;
                }
                const tmValue = pattern[currentStep] ?? 0.5;
                return (tmValue * 2) - 1; // Map 0-1 to -1 to +1
            }
            return 0;
        }

        case 'EF': {
            const efValue = efSmoothedValues.get(paramId) ?? 0;
            const sensitivity = (modConfig.efSensitivity || 100) / 100;
            const scaledValue = Math.min(1, efValue * sensitivity);
            return (scaledValue * 2) - 1; // Map 0-1 to -1 to +1
        }

        case 'LFO':
        default: {
            // LFO mode - try per-voice key first, fall back to global key
            // Per-voice keys exist for filter params (handled by applyPolyVoiceModulations)
            // Global keys exist for non-filter params like Plaits (handled by main loop)
            const perVoiceKey = (firstActiveVoiceId !== null) ? `${firstActiveVoiceId}:${paramId}` : null;
            const globalKey = paramId;

            // Try per-voice first, then global fallback
            let phaseData = perVoiceKey ? phaseAccumulators.get(perVoiceKey) : null;
            if (!phaseData) {
                phaseData = phaseAccumulators.get(globalKey);
            }

            if (phaseData) {
                return calculateWaveValue(phaseData.phase, modConfig.waveform ?? modConfig.lfoWaveform ?? 0, paramId, firstActiveVoiceId);
            }
            return 0;
        }
    }
}

export function updateModulationVisualFeedback() {
    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
        const elements = cachedElements.get(paramId);
        if (!elements) continue;

        // Check if this is a SlidePot-only entry (no legacy fader elements)
        const isSlidePotOnly = elements.slidePot && !elements.label;

        // Check if we're in automation edit mode for this parameter
        const inEditMode = state.modEditMode.activeParamId === paramId && state.modEditMode.currentPage > 0;

        if (!modConfig.enabled || modConfig.depth === 0 || modConfig.muted || inEditMode) {
            // Clear modulation visualization (disabled, no depth, muted, or editing automation)
            if (isSlidePotOnly) {
                // Reset SlidePot LED to normal value-based brightness
                elements.slidePot.setModulating(false);
            } else {
                elements.label.classList.remove('modulated');
                elements.label.style.removeProperty('--led-opacity');
                elements.overlay.style.height = '0%';
                elements.overlay.style.bottom = '0%';
                elements.baseLine.classList.remove('active');
                elements.fill.classList.remove('modulation-active');

                // Add muted visual indicator if muted (but still enabled with depth > 0)
                if (modConfig.muted && modConfig.enabled && modConfig.depth > 0) {
                    elements.label.classList.add('muted');
                } else {
                    elements.label.classList.remove('muted');
                }
            }
            continue;
        }

        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) continue;

        // Get wave value based on current mode (-1 to +1)
        const waveValue = getWaveValueForMode(paramId, modConfig);

        // Calculate LED opacity from wave value
        // Map -1 to +1 wave to 0.3 to 1.0 opacity (always visible, pulses brighter)
        const opacity = 0.3 + (waveValue + 1) * 0.35;

        if (isSlidePotOnly) {
            // SlidePot-only: update LED brightness and value display text
            elements.slidePot.setModulating(true);
            elements.slidePot.setLedBrightness(opacity);

            // Calculate modulated value for display
            const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];
            const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;
            const range = paramDef.max - paramDef.min;
            let modulatedValue = baseValue + (modAmount / 100) * range;
            modulatedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

            // Round integer params
            if (paramDef.step === 1 || paramId.startsWith('factors.') ||
                paramId === 'path.scale' || paramId === 'path.root') {
                modulatedValue = Math.round(modulatedValue);
            }

            // Update ONLY the value text display (not knob position)
            const valueEl = elements.slidePot.container?.querySelector('.slide-pot-value');
            if (valueEl) {
                // Use SlidePot's formatter if available
                const formatted = elements.slidePot.options?.formatValue
                    ? elements.slidePot.options.formatValue(modulatedValue)
                    : modulatedValue;
                valueEl.textContent = formatted;
            }
        } else {
            // Legacy fader: full visual feedback

            // Remove muted class when modulation is active
            elements.label.classList.remove('muted');

            // Get base value (use stored baseValue if available, fallback to state)
            const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];

            // Calculate modulated value
            const modAmount = (waveValue * modConfig.depth * 0.5) + modConfig.offset;
            const range = paramDef.max - paramDef.min;
            let modulatedValue = baseValue + (modAmount / 100) * range;
            modulatedValue = Math.max(paramDef.min, Math.min(paramDef.max, modulatedValue));

            // Update overlay position to show modulation direction
            const basePercent = ((baseValue - paramDef.min) / (paramDef.max - paramDef.min)) * 100;
            const modulatedPercent = ((modulatedValue - paramDef.min) / (paramDef.max - paramDef.min)) * 100;

            // Update fader fill to show modulated value in real-time
            elements.fill.style.height = `${Math.min(100, Math.max(0, modulatedPercent))}%`;
            elements.fill.classList.add('modulation-active');

            // Update value display text if available
            if (elements.valueDisplay) {
                // Round integer params for display
                const displayValue = (paramDef.step === 1 || paramId.startsWith('factors.') ||
                    paramId === 'path.scale' || paramId === 'path.root')
                    ? Math.round(modulatedValue)
                    : modulatedValue.toFixed(0);
                elements.valueDisplay.textContent = displayValue;
            }

            // Show reference line at base value
            elements.baseLine.classList.add('active');
            elements.baseLine.style.bottom = `${basePercent}%`;

            // Show semi-transparent overlay from bottom to modulated value
            elements.overlay.style.bottom = '0%';
            elements.overlay.style.height = `${modulatedPercent}%`;

            // Add modulated class for pulsing yellow LED indicator
            elements.label.classList.add('modulated');
            elements.label.style.setProperty('--led-opacity', opacity);

            // Also update SlidePot LED if available (hybrid case)
            updateModulationLED(paramId, opacity);
        }
    }
}

// --- Envelope Follower Helpers ---

/**
 * Get the current peak level from an audio source for envelope following
 * @param {string} source - 'raembl' | 'baeng' | 'master'
 * @returns {number} Peak level (0-1)
 */
function getEnvelopeFollowerLevel(source) {
    // Get or create analyser for this source
    let analyser = efAnalysers.get(source);

    if (!analyser) {
        analyser = createAnalyserForSource(source);
        if (analyser) {
            efAnalysers.set(source, analyser);
        } else {
            return 0;
        }
    }

    // Ensure we have a data array
    if (!efDataArray || efDataArray.length !== analyser.frequencyBinCount) {
        efDataArray = new Uint8Array(analyser.frequencyBinCount);
    }

    // Get time domain data
    analyser.getByteTimeDomainData(efDataArray);

    // Find peak (deviation from centre 128)
    let peak = 0;
    for (let i = 0; i < efDataArray.length; i++) {
        const deviation = Math.abs(efDataArray[i] - 128);
        if (deviation > peak) {
            peak = deviation;
        }
    }

    // Normalise to 0-1 (max deviation is 128)
    return peak / 128;
}

/**
 * Create an AnalyserNode connected to the specified audio source
 * @param {string} source - 'raembl' | 'baeng' | 'master'
 * @returns {AnalyserNode|null}
 */
function createAnalyserForSource(source) {
    // Get the audio context
    const audioContext = window.raemblAudioContext || window.audioContext;
    if (!audioContext) {
        console.warn('[EF] No audio context available');
        return null;
    }

    // Create analyser
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256; // Small for low latency
    analyser.smoothingTimeConstant = 0; // No smoothing - we do our own

    // Connect to appropriate source
    let sourceNode = null;

    switch (source) {
        case 'raembl':
            // Connect to Ræmbl master output
            sourceNode = window.raemblMasterGain || window.raemblOutput;
            break;
        case 'baeng':
            // Connect to Bæng master output
            sourceNode = window.baengMasterGain || window.baengOutput;
            break;
        case 'master':
            // Connect to combined master output
            sourceNode = window.masterGain || window.masterOutput;
            break;
        default:
            console.warn(`[EF] Unknown source: ${source}`);
            return null;
    }

    if (sourceNode) {
        try {
            sourceNode.connect(analyser);
        } catch (e) {
            console.warn(`[EF] Failed to connect to ${source}:`, e);
            return null;
        }
    } else {
        console.warn(`[EF] Source node not found for ${source}`);
        return null;
    }

    return analyser;
}

/**
 * Update the EF meter display in the modal
 * @param {number} level - Current envelope level (0-1)
 */
function updateEFMeter(level) {
    const meterFill = document.getElementById('ppmod-ef-meter-fill');
    if (!meterFill) return;

    // Only update if EF panel is visible
    const efPanel = document.getElementById('ppmod-panel-ef');
    if (!efPanel || efPanel.classList.contains('hidden')) return;

    meterFill.style.width = `${Math.min(100, level * 100)}%`;
}

/**
 * Clean up envelope follower analysers
 * Called when audio context changes or on cleanup
 */
export function cleanupEnvelopeFollowers() {
    for (const [source, analyser] of efAnalysers.entries()) {
        try {
            analyser.disconnect();
        } catch (e) {
            // Ignore disconnect errors
        }
    }
    efAnalysers.clear();
    efSmoothedValues.clear();
    efLastTime.clear();
    efDataArray = null;
}
