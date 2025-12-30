// File: js/modules/engines.js
// Drum machine engine definitions with macro controls

/**
 * Engine Types (modern synthesis engines only)
 */
export const ENGINE_TYPES = {
    DX7: 'DX7',
    SAMPLE: 'SAMPLE',
    SLICE: 'SLICE',
    ANALOG_KICK: 'aKICK',
    ANALOG_SNARE: 'aSNARE',
    ANALOG_HIHAT: 'aHIHAT'
};

/**
 * Engine cycling order for UI
 */
export const ENGINE_CYCLE_ORDER = ['DX7', 'SAMPLE', 'SLICE', 'aKICK', 'aSNARE', 'aHIHAT'];

/**
 * Macro Control Definitions for Each Engine
 * Based on Model:Cycles User Manual Pages 35-36
 *
 * Each macro maps to multiple underlying synthesis parameters
 * Values are 0-100 range
 */
export const ENGINE_MACROS = {
    DX7: {
        DEPTH: {
            label: 'DEPTH',
            description: 'Modulator intensity (FM depth)',
            params: {
                dx7Depth: { min: 0, max: 100, type: 'linear' }
            }
        },
        RATE: {
            label: 'RATE',
            description: 'Envelope speed (attack/decay/release)',
            params: {
                dx7EnvelopeControl: { min: 0, max: 100, type: 'linear' }
            }
        },
        PITCH: {
            label: 'PITCH',
            description: 'Master tuning offset',
            params: {
                dx7Transpose: { min: -24, max: 24, type: 'linear' } // Semitones
            }
        }
    },

    // Analog Kick Engine (3-knob control: PATCH → TONE, DEPTH → DECAY, RATE → SWEEP)
    aKICK: {
        PATCH: {
            label: 'TONE',
            description: 'Lowpass filter cutoff (brightness)',
            params: {
                analogKickTone: { min: 0, max: 100, type: 'linear' }
            }
        },
        DEPTH: {
            label: 'DECAY',
            description: 'Resonance and decay time',
            params: {
                analogKickDecay: { min: 0, max: 100, type: 'linear' }
            }
        },
        RATE: {
            label: 'SWEEP',
            description: 'Pitch sweep amount (10-30 semitones)',
            params: {
                analogKickSweep: { min: 0, max: 100, type: 'linear' }
            }
        }
    },

    // Analog Snare Engine (4-knob control: PATCH → TONE, PITCH, DEPTH → DECAY, RATE → SNAP)
    aSNARE: {
        PATCH: {
            label: 'TONE',
            description: 'Modal character (808-style to extended modes)',
            params: {
                analogSnareTone: { min: 0, max: 100, type: 'linear' }
            }
        },
        DEPTH: {
            label: 'DECAY',
            description: 'Resonance decay time',
            params: {
                analogSnareDecay: { min: 0, max: 100, type: 'linear' }
            }
        },
        RATE: {
            label: 'SNAP',
            description: 'Noise amount and attack sharpness',
            params: {
                analogSnareSnap: { min: 0, max: 100, type: 'linear' }
            }
        }
    },

    // Analog Hi-Hat Engine (3-knob control: PATCH → METAL, DEPTH → DECAY, RATE → BRIGHT)
    aHIHAT: {
        PATCH: {
            label: 'METAL',
            description: 'Oscillator spread (tight to washy)',
            params: {
                analogHihatMetal: { min: 0, max: 100, type: 'linear' }
            }
        },
        DEPTH: {
            label: 'DECAY',
            description: 'Decay time (closed to open)',
            params: {
                analogHihatDecay: { min: 0, max: 100, type: 'linear' }
            }
        },
        RATE: {
            label: 'BRIGHT',
            description: 'Highpass filter cutoff (brightness)',
            params: {
                analogHihatBright: { min: 0, max: 100, type: 'linear' }
            }
        }
    },

    // Sampler Engine (4-knob control: PATCH → SAMPLE, DEPTH → DECAY, RATE → FILTER, PITCH → PITCH)
    SAMPLE: {
        PATCH: {
            label: 'SAMPLE',
            description: 'Sample selection (0-indexed)',
            params: {
                sampleIndex: { min: 0, max: 127, type: 'discrete' }
            }
        },
        DEPTH: {
            label: 'DECAY',
            description: 'Envelope decay time',
            params: {
                samplerDecay: { min: 0, max: 100, type: 'linear' }
            }
        },
        RATE: {
            label: 'FILTER',
            description: 'Lowpass filter cutoff',
            params: {
                samplerFilter: { min: 0, max: 100, type: 'linear' }
            }
        },
        PITCH: {
            label: 'PITCH',
            description: 'Pitch shift in semitones',
            params: {
                samplerPitch: { min: -24, max: 24, type: 'linear' }
            }
        }
    },

    // Slice Engine (4-knob control: PATCH → SLICE, DEPTH → DECAY, RATE → FILTER, PITCH → PITCH)
    SLICE: {
        PATCH: {
            label: 'SLICE',
            description: 'Slice selection (0-indexed)',
            params: {
                sliceIndex: { min: 0, max: 127, type: 'discrete' }
            }
        },
        DEPTH: {
            label: 'DECAY',
            description: 'Envelope decay time',
            params: {
                samplerDecay: { min: 0, max: 100, type: 'linear' }
            }
        },
        RATE: {
            label: 'FILTER',
            description: 'Lowpass filter cutoff',
            params: {
                samplerFilter: { min: 0, max: 100, type: 'linear' }
            }
        },
        PITCH: {
            label: 'PITCH',
            description: 'Pitch shift in semitones',
            params: {
                samplerPitch: { min: -24, max: 24, type: 'linear' }
            }
        }
    }
};

/**
 * Default voice settings for each engine type
 */
export const ENGINE_DEFAULTS = {
    DX7: {
        engine: 'DX7',
        polyphonyMode: 0, // 0=Mono, 1=P2, 2=P3, 3=P4 (selective polyphony for melodic use)
        macroPatch: 0,   // PATCH (DX7 patch selection - not used for macro control)
        macroDepth: 50,  // DEPTH (modulator intensity)
        macroRate: 50,   // RATE (envelope speed)
        macroPitch: 50,  // PITCH (master tuning offset)
        // DX7-specific parameters (will be populated from loaded patch)
        dx7Patch: null, // Will hold loaded DX7 patch data
        dx7Algorithm: 1,
        dx7Feedback: 0,
        dx7Transpose: 0,
        dx7EnvTimeScale: 1.0,
        dx7PitchEnvDepth: 0,
        dx7AttackScale: 1.0,
        dx7ReleaseScale: 1.0,
        // Voice-level parameters
        pan: 50,
        level: 75,
        bitReduction: 0,
        drive: 0,
        chokeGroup: 0,
        reverbSend: 0,
        delaySend: 0,
        cloudsSend: 0
    },

    // Analog Kick Defaults (808-style preset)
    aKICK: {
        engine: 'aKICK',
        macroPatch: 50,  // TONE (balanced)
        macroDepth: 60,  // DECAY (moderate boom)
        macroRate: 70,   // SWEEP (strong pitch drop)
        macroPitch: 50,  // PITCH (neutral/no pitch shift)
        // Analog kick parameters
        analogKickTone: 50,
        analogKickDecay: 60,
        analogKickSweep: 70,
        // Voice-level parameters
        pan: 50,
        level: 85,
        bitReduction: 0,
        drive: 0,
        chokeGroup: 1,  // Kicks choke each other
        reverbSend: 0,
        delaySend: 0,
        cloudsSend: 0
    },

    // Analog Snare Defaults (808-style preset)
    aSNARE: {
        engine: 'aSNARE',
        macroPatch: 40,  // TONE (808-style modal character)
        macroDepth: 60,  // DECAY (moderate resonance)
        macroRate: 40,   // SNAP (balanced noise/attack)
        macroPitch: 50,  // PITCH (neutral frequency)
        // Analog snare parameters
        analogSnareTone: 40,
        analogSnareDecay: 60,
        analogSnareSnap: 40,
        // Voice-level parameters
        pan: 50,
        level: 75,
        bitReduction: 0,
        drive: 20,
        chokeGroup: 0,
        reverbSend: 0,
        delaySend: 0,
        cloudsSend: 0
    },

    // Analog Hi-Hat Defaults (closed hat)
    aHIHAT: {
        engine: 'aHIHAT',
        macroPatch: 30,  // METAL (tight, controlled)
        macroDepth: 10,  // DECAY (short, closed)
        macroRate: 60,   // BRIGHT (moderate brightness)
        macroPitch: 50,  // PITCH (neutral/no pitch shift)
        // Analog hi-hat parameters
        analogHihatMetal: 30,
        analogHihatDecay: 10,
        analogHihatBright: 60,
        // Voice-level parameters
        pan: 50,
        level: 70,
        bitReduction: 0,
        drive: 0,
        chokeGroup: 2,  // Hats choke each other
        reverbSend: 0,
        delaySend: 0,
        cloudsSend: 0
    },

    // Sampler Defaults
    SAMPLE: {
        engine: 'SAMPLE',
        polyphonyMode: 0, // 0=Mono, 1=P2, 2=P3, 3=P4 (selective polyphony for melodic use)
        macroPatch: 0,       // SAMPLE (0-indexed, first sample)
        macroDepth: 100,     // DECAY (full sample playback)
        macroRate: 50,       // FILTER (50 = no filter)
        macroPitch: 50,      // PITCH (50 = no pitch shift, 0-100 = -24 to +24 semitones)
        // Sampler parameters
        sampleIndex: 0,      // Default to first sample (0-indexed)
        samplerDecay: 100,   // Should match macroDepth
        samplerFilter: 50,   // No filter by default
        samplerPitch: 0,     // No pitch shift
        samplerBank: null,   // Current sample bank (set at runtime)
        // Voice-level parameters
        pan: 50,
        level: 100,
        bitReduction: 0,
        drive: 0,
        chokeGroup: 0,
        reverbSend: 0,
        delaySend: 0,
        cloudsSend: 0
    },

    // Slice Engine Defaults
    SLICE: {
        engine: 'SLICE',
        macroPatch: 0,       // SLICE (0-indexed, first slice)
        macroDepth: 100,     // DECAY (full sample playback)
        macroRate: 50,       // FILTER (50 = no filter)
        macroPitch: 50,      // PITCH (50 = no pitch shift, 0-100 = -24 to +24 semitones)
        // Slice-specific parameters
        sliceIndex: 0,       // Current slice selection (0-indexed)
        sliceConfig: null,   // Slice configuration object (saved in patches)
        sliceBuffer: null,   // AudioBuffer reference (runtime only, not saved)
        // Sampler parameters (shared with SAMPLE engine)
        samplerDecay: 100,   // Should match macroDepth
        samplerFilter: 50,   // No filter by default
        samplerPitch: 0,     // No pitch shift
        // Voice-level parameters
        pan: 50,
        level: 100,
        bitReduction: 0,
        drive: 0,
        chokeGroup: 0,
        reverbSend: 0,
        delaySend: 0,
        cloudsSend: 0
    }
};

/**
 * Apply macro control to voice parameters
 * @param {string} engineType - Engine type (KICK, SNARE, etc.)
 * @param {string} macroName - Macro name (COLOR, SHAPE, SWEEP, CONTOUR)
 * @param {number} macroValue - Macro value (0-100)
 * @param {object} voiceParams - Voice parameters object to modify
 */
export function applyMacroToVoice(engineType, macroName, macroValue, voiceParams) {
    const engineMacros = ENGINE_MACROS[engineType];
    if (!engineMacros) {
        return;
    }

    const macro = engineMacros[macroName];
    if (!macro) {
        return;
    }

    // Special handling for DX7 engine
    if (engineType === 'DX7') {
        applyDX7Macro(macroName, macroValue, voiceParams);
        return;
    }

    // Special handling for SAMPLE engine PATCH macro - direct 0-indexed mapping
    // Use per-voice buffer array (NOT global manager)
    if (engineType === 'SAMPLE' && macroName === 'PATCH') {
        const voiceSampleBank = voiceParams.samplerBuffer;
        const sampleCount = voiceSampleBank?.length || 0;

        if (sampleCount > 0) {
            // Map macroPatch (0-100) to sample index (0 to N-1)
            // E.g., 11 samples: 0-9→0, 10-18→1, 19-27→2, ..., 91-100→10
            const sampleIndex = Math.floor((macroValue / 100) * sampleCount);
            const clampedIndex = Math.max(0, Math.min(sampleCount - 1, sampleIndex));

            voiceParams.sampleIndex = clampedIndex;
        }
        return;
    }

    // Special handling for SLICE engine PATCH macro - map to slice index
    if (engineType === 'SLICE' && macroName === 'PATCH') {
        const sliceConfig = voiceParams.sliceConfig;
        if (!sliceConfig || !sliceConfig.slices) {
            // No slice config yet, default to slice 0
            voiceParams.sliceIndex = 0;
            return;
        }

        const sliceCount = sliceConfig.slices.length;

        if (sliceCount > 0) {
            // Map macroPatch (0-100) to slice index (0 to N-1)
            // E.g., 8 slices: 0-12→0, 13-25→1, 26-37→2, ..., 88-100→7
            const sliceIndex = Math.floor((macroValue / 100) * sliceCount);
            const clampedIndex = Math.max(0, Math.min(sliceCount - 1, sliceIndex));

            voiceParams.sliceIndex = clampedIndex;
        } else {
            voiceParams.sliceIndex = 0;
        }
        return;
    }

    // Apply each parameter mapping for other engines
    for (const [paramName, paramConfig] of Object.entries(macro.params)) {
        const normalizedValue = macroValue / 100; // 0-1 range

        if (paramConfig.type === 'linear') {
            // Linear interpolation
            const value = paramConfig.min + (paramConfig.max - paramConfig.min) * normalizedValue;
            voiceParams[paramName] = value;
        } else if (paramConfig.type === 'discrete') {
            // Discrete steps (for sample/waveform selection)
            // Use Math.round for symmetric mapping with reverse direction
            const range = paramConfig.max - paramConfig.min;
            const step = Math.round(normalizedValue * range);
            voiceParams[paramName] = Math.min(paramConfig.min + step, paramConfig.max);
        }
    }
}

/**
 * Apply macro control to DX7 patch
 * Stores macro values in voiceParams for application by engine.js
 */
function applyDX7Macro(macroName, macroValue, voiceParams) {
    if (!voiceParams.dx7Patch || !voiceParams.dx7Patch.parsed) {
        return;
    }

    // Store macro values (0-100 range from UI, convert to 0-1 for processing)
    const normalizedValue = macroValue / 100; // 0-1 range

    switch (macroName) {
        case 'DEPTH':
            // Store depth value for modulator intensity control
            voiceParams.dx7Depth = normalizedValue;
            break;

        case 'RATE':
            // Store envelope control value for attack/decay/release scaling
            voiceParams.dx7EnvelopeControl = normalizedValue;
            break;

        case 'PITCH':
            // Master transpose in semitones (-24 to +24)
            const transpose = Math.round(-24 + normalizedValue * 48);
            voiceParams.dx7Transpose = transpose;
            break;
    }
}

/**
 * Apply a single macro for a voice (without affecting other macros)
 * @param {string} paramId - Parameter ID (e.g., 'voice.macroDepth')
 * @param {object} voiceParams - Voice parameters with macro values
 */
export function applySingleMacro(paramId, voiceParams) {
    const engineType = voiceParams.engine;
    if (!engineType || !ENGINE_MACROS[engineType]) {
        return;
    }

    // Map paramId to macro name
    const macroMap = {
        'voice.macroPatch': 'PATCH',
        'voice.macroDepth': 'DEPTH',
        'voice.macroRate': 'RATE',
        'voice.macroPitch': 'PITCH',
        'voice.macroColor': 'COLOR',
        'voice.macroShape': 'SHAPE',
        'voice.macroDecay': 'DECAY',
        'voice.macroSweep': 'SWEEP',
        'voice.macroContour': 'CONTOUR'
    };

    const macroName = macroMap[paramId];
    if (!macroName) return;

    // Get macro value from voiceParams (use ?? to allow 0 as valid value)
    const macroValue = voiceParams[paramId.replace('voice.', '')] ?? 50;

    // Apply only this specific macro
    if ((engineType === 'SAMPLE' || engineType === 'SLICE') && macroName === 'PATCH') {
        const oldSamplerNote = voiceParams.samplerNote;
        applyMacroToVoice(engineType, macroName, macroValue, voiceParams);
        // [CRITICAL DEBUG] Sample/Slice selection - applySingleMacro()
        // console.log(`[applySingleMacro] ${engineType} ${macroName}: ${macroValue} → samplerNote ${oldSamplerNote} → ${voiceParams.samplerNote}`);
    } else {
        applyMacroToVoice(engineType, macroName, macroValue, voiceParams);
    }
}

/**
 * Apply all macros for a voice
 * @param {object} voiceParams - Voice parameters with macro values
 */
export function applyAllMacros(voiceParams) {
    const engineType = voiceParams.engine;
    if (!engineType || !ENGINE_MACROS[engineType]) {
        return;
    }

    // All modern engines use 3-knob system: PATCH, DEPTH, RATE
    // Use ?? instead of || to allow 0 as valid value
    if (engineType === 'SAMPLE' || engineType === 'SLICE') {
        const oldSamplerNote = voiceParams.samplerNote;
        applyMacroToVoice(engineType, 'PATCH', voiceParams.macroPatch ?? 50, voiceParams);
        // [CRITICAL DEBUG] Sample/Slice selection - applyAllMacros()
        // console.log(`[applyAllMacros] ${engineType}: macroPatch=${voiceParams.macroPatch}, samplerNote ${oldSamplerNote} → ${voiceParams.samplerNote}`);
    } else {
        applyMacroToVoice(engineType, 'PATCH', voiceParams.macroPatch ?? 50, voiceParams);
    }
    applyMacroToVoice(engineType, 'DEPTH', voiceParams.macroDepth ?? 50, voiceParams);
    applyMacroToVoice(engineType, 'RATE', voiceParams.macroRate ?? 50, voiceParams);
}

/**
 * Get SVG icon for engine type
 * @param {string} engineType - Engine type
 * @returns {string} SVG markup
 */
export function getEngineSVGIcon(engineType) {
    const icons = {
        DX7: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M 4 12 Q 8 6 12 12 T 20 12" stroke-linecap="round"/>
            <path d="M 4 16 Q 8 10 12 16 T 20 16" stroke-linecap="round" opacity="0.6"/>
            <path d="M 4 8 Q 8 2 12 8 T 20 8" stroke-linecap="round" opacity="0.6"/>
        </svg>`
        // Modern analog engines (aKICK, aSNARE, aHIHAT) and sampler engines (SAMPLE, SLICE)
        // don't use SVG icons - they use text labels in the UI
    };

    return icons[engineType] || '';
}

/**
 * Convert polyphony mode to maximum voice count
 * Used for selective polyphony implementation (DX7 and SAMPLE engines only)
 * @param {number} polyphonyMode - Polyphony mode (0=M, 1=P2, 2=P3, 3=P4)
 * @returns {number} Maximum number of simultaneous voices (1-4)
 */
export function getMaxVoicesForMode(polyphonyMode) {
    const modes = [1, 2, 3, 4]; // M, P2, P3, P4
    return modes[polyphonyMode] || 1;
}
