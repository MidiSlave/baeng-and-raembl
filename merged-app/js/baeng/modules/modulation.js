// File: js/modules/modulation.js
// Per-Track LFO Modulation System for Bæng Drum Synthesizer
//
// This module provides per-voice LFO modulation for 4 macro controls:
// - COLOR: Modulates waveform characteristics (Layer A/B waveform, pitch ratio)
// - SHAPE: Modulates envelope parameters (attack, decay, sustain)
// - SWEEP: Modulates pitch and modulation amount (pitch, FM depth)
// - CONTOUR: Modulates mix and dynamics (layer mix, drive, level)

import { state } from '../state.js';
import { config } from '../config.js';
import { updateEngineParams, updateVoiceEnvelope } from './engine.js';

// LFO waveform types
export const LFO_WAVEFORMS = {
    SINE: 0,
    TRIANGLE: 1,
    SQUARE: 2,
    SAWTOOTH: 3,
    RANDOM: 4,
    SAMPLE_HOLD: 5
};

// LFO waveform names for UI
export const LFO_WAVEFORM_NAMES = ['SIN', 'TRI', 'SQR', 'SAW', 'RND', 'S&H'];

// Macro control destinations - maps each macro to voice parameters
export const MACRO_DESTINATIONS = {
    COLOR: {
        name: 'COLOR',
        description: 'Modulates timbral characteristics',
        targets: [
            { param: 'layerAWaveform', depth: 0.3, range: [0, 4] },
            { param: 'layerBWaveform', depth: 0.3, range: [0, 4] },
            { param: 'layerBPitchRatio', depth: 0.5, range: [0.1, 16.0] }
        ]
    },
    SHAPE: {
        name: 'SHAPE',
        description: 'Modulates envelope shape',
        targets: [
            { param: 'layerAAttack', depth: 0.4, range: [0, 100] },
            { param: 'layerADecay', depth: 0.6, range: [0, 100] },
            { param: 'layerBAttack', depth: 0.4, range: [0, 100] },
            { param: 'layerBDecay', depth: 0.6, range: [0, 100] }
        ]
    },
    SWEEP: {
        name: 'SWEEP',
        description: 'Modulates pitch and modulation',
        targets: [
            { param: 'layerAPitch', depth: 0.7, range: [0, 100] },
            { param: 'layerBModAmount', depth: 0.6, range: [0, 100] }
        ]
    },
    CONTOUR: {
        name: 'CONTOUR',
        description: 'Modulates mix and dynamics',
        targets: [
            { param: 'layerMix', depth: 0.5, range: [0, 100] },
            { param: 'drive', depth: 0.4, range: [0, 100] },
            { param: 'level', depth: 0.3, range: [0, 100] }
        ]
    }
};

// Default LFO configuration for each voice
const DEFAULT_LFO_CONFIG = {
    enabled: false,
    waveform: LFO_WAVEFORMS.SINE,
    rate: 1.0,          // Hz (0.05-30 Hz)
    depth: 0,           // 0-100%
    macro: 'COLOR',     // Which macro control to modulate
    phase: 0,           // Current phase (0-1)
    lastUpdateTime: 0,  // For phase advancement
    resetMode: 'off',   // 'off', 'step', 'bar'
    sync: false,        // Tempo sync
    syncRate: '1/4',    // '1/16', '1/8', '1/4', '1/2', '1/1', '2/1', '4/1'
    bipolar: true,      // Bipolar (-1 to +1) or unipolar (0 to 1)
    offset: 0,          // -100 to +100%
    muted: false        // Temporary mute
};

// Tempo sync rate divisions (in beats)
const SYNC_RATES = {
    '1/16': 1/4,    // 16th note (1/4 of a beat)
    '1/8': 1/2,     // 8th note
    '1/4': 1,       // Quarter note
    '1/2': 2,       // Half note
    '1/1': 4,       // Whole note
    '2/1': 8,       // 2 bars
    '4/1': 16       // 4 bars
};

// Phase accumulators for each voice's LFOs
const voiceLFOPhases = new Map();

// Sample & Hold values for each voice
const sampleHoldValues = new Map();

// Last k-rate update time (30 FPS throttling)
let lastKRateUpdate = 0;
const K_RATE_INTERVAL = 1000 / 30; // ~33ms

/**
 * Initialize modulation system
 */
export function initModulation() {

    // Initialize LFO state for each voice if not already present
    if (!state.voiceLFOs) {
        state.voiceLFOs = state.voices.map(() => ({ ...DEFAULT_LFO_CONFIG }));
    }

    // Initialize phase accumulators
    for (let i = 0; i < state.voices.length; i++) {
        if (!voiceLFOPhases.has(i)) {
            voiceLFOPhases.set(i, {
                phase: 0,
                lastTime: performance.now()
            });
        }
    }

    // Listen for sequencer events for LFO reset modes
    document.addEventListener('sequencerStep', handleStepReset);
    document.addEventListener('barStart', handleBarReset);

}

/**
 * Calculate LFO waveform value at given phase
 * @param {number} phase - Current phase (0-1)
 * @param {number} waveform - Waveform type (0-5)
 * @param {number} voiceIndex - Voice index for S&H
 * @returns {number} LFO value (-1 to +1)
 */
function calculateLFOValue(phase, waveform, voiceIndex) {
    switch (waveform) {
        case LFO_WAVEFORMS.SINE:
            return Math.sin(phase * Math.PI * 2);

        case LFO_WAVEFORMS.TRIANGLE:
            return phase < 0.5
                ? -1 + 4 * phase
                : 3 - 4 * phase;

        case LFO_WAVEFORMS.SQUARE:
            return phase < 0.5 ? 1 : -1;

        case LFO_WAVEFORMS.SAWTOOTH:
            return 1 - 2 * phase;

        case LFO_WAVEFORMS.RANDOM:
            // Smooth random (pseudo-random based on phase)
            return Math.sin(phase * 12345.6789) * 0.8;

        case LFO_WAVEFORMS.SAMPLE_HOLD:
            // Return stored S&H value
            const key = `v${voiceIndex}`;
            if (sampleHoldValues.has(key)) {
                return sampleHoldValues.get(key);
            } else {
                const randomValue = (Math.random() * 2) - 1;
                sampleHoldValues.set(key, randomValue);
                return randomValue;
            }

        default:
            return Math.sin(phase * Math.PI * 2);
    }
}

/**
 * Get effective LFO rate (considering tempo sync)
 * @param {object} lfoConfig - LFO configuration
 * @returns {number} Rate in Hz
 */
function getEffectiveLFORate(lfoConfig) {
    if (!lfoConfig.sync) {
        return lfoConfig.rate;
    }

    // Calculate tempo-synced rate
    const bpm = state.bpm;
    const beatsPerSecond = bpm / 60;
    const syncBeats = SYNC_RATES[lfoConfig.syncRate] || 1;
    const rateHz = beatsPerSecond / syncBeats;

    return rateHz;
}

/**
 * Apply per-track modulation to all voices
 * Called from animation loop or audio callback
 */
export function applyPerTrackModulation() {
    const now = performance.now();

    // Throttle to 30 FPS
    if (now - lastKRateUpdate < K_RATE_INTERVAL) return;
    lastKRateUpdate = now;

    // Process each voice's LFO
    for (let voiceIndex = 0; voiceIndex < state.voices.length; voiceIndex++) {
        const lfoConfig = state.voiceLFOs[voiceIndex];

        // Skip if LFO is disabled or muted
        if (!lfoConfig || !lfoConfig.enabled || lfoConfig.muted || lfoConfig.depth === 0) {
            continue;
        }

        // Get or initialize phase data
        if (!voiceLFOPhases.has(voiceIndex)) {
            voiceLFOPhases.set(voiceIndex, {
                phase: 0,
                lastTime: now
            });
        }

        const phaseData = voiceLFOPhases.get(voiceIndex);

        // Advance phase based on rate
        const deltaTime = (now - phaseData.lastTime) / 1000; // seconds
        const effectiveRate = getEffectiveLFORate(lfoConfig);
        phaseData.phase = (phaseData.phase + effectiveRate * deltaTime) % 1.0;
        phaseData.lastTime = now;

        // Calculate LFO value
        let lfoValue = calculateLFOValue(phaseData.phase, lfoConfig.waveform, voiceIndex);

        // Apply bipolar/unipolar mode
        if (!lfoConfig.bipolar) {
            lfoValue = (lfoValue + 1) * 0.5; // Convert -1..1 to 0..1
        }

        // Apply depth scaling
        const scaledValue = lfoValue * (lfoConfig.depth / 100);

        // Apply offset
        const finalValue = scaledValue + (lfoConfig.offset / 100);

        // Apply modulation to macro control targets
        applyMacroModulation(voiceIndex, lfoConfig.macro, finalValue);
    }
}

/**
 * Apply modulation to a specific macro control's targets
 * @param {number} voiceIndex - Voice index
 * @param {string} macroName - Macro control name ('COLOR', 'SHAPE', 'SWEEP', 'CONTOUR')
 * @param {number} modValue - Modulation value (-1 to +1 or 0 to 1)
 */
function applyMacroModulation(voiceIndex, macroName, modValue) {
    const macro = MACRO_DESTINATIONS[macroName];
    if (!macro) return;

    const voice = state.voices[voiceIndex];
    if (!voice) return;

    // Track if decay parameters were updated for real-time envelope updates
    const decayParams = {};

    // Apply modulation to each target parameter
    for (const target of macro.targets) {
        const { param, depth, range } = target;

        // Get base value (stored when modulation was first enabled)
        const baseKey = `${voiceIndex}_${param}_base`;
        let baseValue = voice[`${param}_base`];

        // If base value not stored, use current value
        if (baseValue === undefined) {
            baseValue = voice[param];
            voice[`${param}_base`] = baseValue;
        }

        // Calculate modulation amount
        const [min, max] = range;
        const paramRange = max - min;
        const modAmount = modValue * depth * paramRange;

        // Calculate modulated value
        let modulatedValue = baseValue + modAmount;

        // Clamp to parameter range
        modulatedValue = Math.max(min, Math.min(max, modulatedValue));

        // Apply rounding for discrete parameters
        if (param.includes('Waveform')) {
            modulatedValue = Math.round(modulatedValue);
        }

        // Update voice parameter
        voice[param] = modulatedValue;

        // Track decay parameter changes for real-time envelope updates
        if (param === 'layerADecay') {
            decayParams.layerADecay = modulatedValue;
        } else if (param === 'layerBDecay') {
            decayParams.layerBDecay = modulatedValue;
        }
    }

    // Update active voice envelopes if decay parameters were modulated
    if (decayParams.layerADecay !== undefined || decayParams.layerBDecay !== undefined) {
        updateVoiceEnvelope(voiceIndex, decayParams);
    }

    // NOTE: Removed updateEngineParams() call as it only handles effects, not voice parameters
    // Voice parameter changes are now applied directly to state and active voices
}

/**
 * Reset LFO phases based on reset mode
 * @param {string} mode - Reset mode ('step', 'bar')
 */
function resetLFOPhases(mode) {
    for (let i = 0; i < state.voiceLFOs.length; i++) {
        const lfoConfig = state.voiceLFOs[i];

        if (lfoConfig.resetMode === mode) {
            const phaseData = voiceLFOPhases.get(i);
            if (phaseData) {
                phaseData.phase = 0;
                phaseData.lastTime = performance.now();
            }

            // Resample S&H if applicable
            if (lfoConfig.waveform === LFO_WAVEFORMS.SAMPLE_HOLD) {
                const key = `v${i}`;
                const randomValue = (Math.random() * 2) - 1;
                sampleHoldValues.set(key, randomValue);
            }
        }
    }
}

/**
 * Handle step reset event
 */
function handleStepReset() {
    resetLFOPhases('step');
}

/**
 * Handle bar reset event
 */
function handleBarReset() {
    resetLFOPhases('bar');
}

/**
 * Get LFO configuration for a voice
 * @param {number} voiceIndex - Voice index
 * @returns {object} LFO configuration
 */
export function getVoiceLFO(voiceIndex) {
    if (!state.voiceLFOs || voiceIndex < 0 || voiceIndex >= state.voiceLFOs.length) {
        return null;
    }
    return state.voiceLFOs[voiceIndex];
}

/**
 * Update LFO parameter for a voice
 * @param {number} voiceIndex - Voice index
 * @param {string} param - Parameter name
 * @param {*} value - New value
 */
export function updateVoiceLFOParam(voiceIndex, param, value) {
    if (!state.voiceLFOs || voiceIndex < 0 || voiceIndex >= state.voiceLFOs.length) {
        return;
    }

    const lfoConfig = state.voiceLFOs[voiceIndex];

    // Store base values when enabling modulation
    if (param === 'enabled' && value === true && !lfoConfig.enabled) {
        const voice = state.voices[voiceIndex];
        const macro = MACRO_DESTINATIONS[lfoConfig.macro];

        if (macro) {
            for (const target of macro.targets) {
                voice[`${target.param}_base`] = voice[target.param];
            }
        }
    }

    // Clear base values when disabling modulation
    if (param === 'enabled' && value === false && lfoConfig.enabled) {
        const voice = state.voices[voiceIndex];
        const macro = MACRO_DESTINATIONS[lfoConfig.macro];

        if (macro) {
            for (const target of macro.targets) {
                // Restore base values
                const baseValue = voice[`${target.param}_base`];
                if (baseValue !== undefined) {
                    voice[target.param] = baseValue;
                    delete voice[`${target.param}_base`];
                }
            }
        }
    }

    // Update macro destination when changed
    if (param === 'macro' && value !== lfoConfig.macro) {
        const voice = state.voices[voiceIndex];

        // Clear old macro base values
        const oldMacro = MACRO_DESTINATIONS[lfoConfig.macro];
        if (oldMacro) {
            for (const target of oldMacro.targets) {
                const baseValue = voice[`${target.param}_base`];
                if (baseValue !== undefined) {
                    voice[target.param] = baseValue;
                    delete voice[`${target.param}_base`];
                }
            }
        }

        // Store new macro base values
        const newMacro = MACRO_DESTINATIONS[value];
        if (newMacro && lfoConfig.enabled) {
            for (const target of newMacro.targets) {
                voice[`${target.param}_base`] = voice[target.param];
            }
        }
    }

    lfoConfig[param] = value;
}

/**
 * Toggle LFO mute for a voice
 * @param {number} voiceIndex - Voice index
 */
export function toggleVoiceLFOMute(voiceIndex) {
    if (!state.voiceLFOs || voiceIndex < 0 || voiceIndex >= state.voiceLFOs.length) {
        return;
    }

    const lfoConfig = state.voiceLFOs[voiceIndex];
    lfoConfig.muted = !lfoConfig.muted;

}

/**
 * Reset LFO to default configuration
 * @param {number} voiceIndex - Voice index
 */
export function resetVoiceLFO(voiceIndex) {
    if (!state.voiceLFOs || voiceIndex < 0 || voiceIndex >= state.voiceLFOs.length) {
        return;
    }

    // Clear base values
    const voice = state.voices[voiceIndex];
    const oldConfig = state.voiceLFOs[voiceIndex];
    const oldMacro = MACRO_DESTINATIONS[oldConfig.macro];

    if (oldMacro) {
        for (const target of oldMacro.targets) {
            const baseValue = voice[`${target.param}_base`];
            if (baseValue !== undefined) {
                voice[target.param] = baseValue;
                delete voice[`${target.param}_base`];
            }
        }
    }

    // Reset to defaults
    state.voiceLFOs[voiceIndex] = { ...DEFAULT_LFO_CONFIG };

    // Reset phase
    const phaseData = voiceLFOPhases.get(voiceIndex);
    if (phaseData) {
        phaseData.phase = 0;
        phaseData.lastTime = performance.now();
    }

}

/**
 * Get current LFO value for visualization
 * @param {number} voiceIndex - Voice index
 * @returns {number} Current LFO value (-1 to +1 or 0 to 1)
 */
export function getCurrentLFOValue(voiceIndex) {
    const lfoConfig = state.voiceLFOs?.[voiceIndex];
    if (!lfoConfig || !lfoConfig.enabled) {
        return 0;
    }

    const phaseData = voiceLFOPhases.get(voiceIndex);
    if (!phaseData) {
        return 0;
    }

    let lfoValue = calculateLFOValue(phaseData.phase, lfoConfig.waveform, voiceIndex);

    // Apply bipolar/unipolar mode
    if (!lfoConfig.bipolar) {
        lfoValue = (lfoValue + 1) * 0.5;
    }

    return lfoValue;
}

/**
 * Cleanup function for voice reset
 * @param {number} voiceIndex - Voice index
 */
export function cleanupVoiceModulation(voiceIndex) {
    // Clear phase data
    voiceLFOPhases.delete(voiceIndex);

    // Clear S&H values
    const key = `v${voiceIndex}`;
    sampleHoldValues.delete(key);
}
