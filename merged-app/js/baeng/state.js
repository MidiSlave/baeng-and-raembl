// File: state.js
// Shared application state for Bæng

import { registerBaengState } from '../state.js';
import { setBPM, setSwing, setBaengBarLength } from '../shared/clock.js';

const localState = {
    // Edit modes and selection
    editMode: 'edit', // 'edit' or 'select'
    tempEditMode: null, // For R, /, N key interactions
    isDragging: false, // Track if user is currently dragging
    
    // Clock/TIME state
    isPlaying: false,
    bpm: 120,
    swing: 0,
    barLength: 4, // In beats (quarter notes), was previously in bars
    currentStepIndex: -1, // Global step index within the current bar (0 to stepsPerBar - 1)
    displayBar: 1,
    displayBeat: 1,
    displayStep: 1,
    isBarStart: false,
    resetSequenceOnBar: true,
    clockRequestId: null,
    lastStepTime: 0, // in milliseconds
    stepCounter: -1, // Global step counter, resets based on barLength
    barCounter: 0,   // Increments each time a full pattern (defined by barLength) completes
    stepsPerBeat: 4, // Typically 16th notes
    deviatedTriggers: [], // Tracks which steps are triggered due to deviation
    
    // Add temporary debug info
    lastDiagnostic: {
        deviationChecked: false,
        deviationRoll: 0,
        shouldDeviate: false,
        actuallyDeviated: false
    },

    selectedVoice: 0,

    // Per-voice LFO modulation state
    // Each voice has its own LFO for macro control modulation
    // Initialized by modulation.js
    voiceLFOs: null, // Will be initialized as array of LFO configs

    // Per-parameter modulation system v1.1.0
    // Sparse storage - only active modulations are stored
    // Config storage uses RAW paramId (like ræmbL)
    // Per-voice differentiation happens at phase accumulator level AND baseValues
    //
    // PATCH FORMAT v1.1.0: Added 'mode' property + mode-specific params
    // Modes: 'LFO' | 'RND' | 'ENV' | 'EF' | 'TM' | 'SEQ'
    // Backward compatible: if 'mode' missing, assume 'LFO'
    perParamModulations: {
        // Example structure v1.1.0 (created dynamically when modulation enabled):
        //
        // 'voice.dx7PatchIndex': {
        //     mode: 'LFO',          // v1.1.0: Modulation mode
        //     enabled: false,
        //     depth: 50,            // 0-100% (common to all modes)
        //     offset: 0,            // -100 to +100% (common to all modes)
        //     muted: false,         // Mute state for temporary disable
        //     baseValue: null,      // Stored base value for global params
        //     baseValues: [],       // Per-voice base values [v0, v1, v2, v3, v4, v5]
        //
        //     // LFO mode params (backward compatible with v1.0.0)
        //     lfoWaveform: 0,       // 0=sin, 1=tri, 2=sq, 3=saw, 4=ramp, 5=s&h
        //     lfoRate: 1.0,         // Hz (0.05-30)
        //     lfoSync: false,       // Sync to clock
        //     resetMode: 'off',     // 'off'|'step'|'accent'|'bar' (voice params)
        //     triggerSource: 'none', // 'none'|'T1'-'T6'|'sum' (effect params)
        //
        //     // RND mode params
        //     rndBitLength: 16,     // LFSR bits: 4, 8, 16, 32
        //     rndProbability: 100,  // 0-100%
        //     rndSampleRate: 1000,  // Hz (100-10000)
        //
        //     // ENV mode params
        //     envAttackMs: 10,      // Attack time (0.2-8000ms)
        //     envReleaseMs: 200,    // Release/decay time (0.2-8000ms)
        //     envCurveShape: 'exponential', // 'linear'|'exponential'|'logarithmic'|'sCurve'
        //     envSource: 'noteOn',  // 'noteOn'|'filter'|'amp'|'manual'
        //
        //     // EF mode params
        //     efAttackMs: 10,       // Follower attack (1-1000ms)
        //     efReleaseMs: 100,     // Follower release (1-1000ms)
        //     efSource: 'input',    // 'input'|'filter'|'amp'
        //
        //     // TM mode params
        //     tmLength: 8,          // Pattern length (1-16)
        //     tmProbability: 50,    // Mutation probability (0-100%)
        //     tmPattern: [],        // Current pattern values
        //     tmLfsrState: null,    // LFSR state for determinism
        //
        //     // SEQ mode params
        //     seqLength: 4,         // Pattern length (1-16)
        //     seqPattern: [0.5, 0.5, 0.5, 0.5], // Step values (0-1)
        // }
    },

    // Edit mode state for per-param modulation UI
    modEditMode: {
        activeParamId: null,           // Which parameter is being edited
        currentPage: 0,                // 0=normal, 1=wave, 2=rate, 3=offset, 4=depth, 5=trigger
        inactivityTimer: null,         // Timer reference for auto-return
        lastInteractionTime: null,     // Timestamp of last interaction
        // Store UI element references for active parameter (like ræmbL)
        activeLabelElement: null,      // Reference to the label element
        activeContainer: null,         // Reference to the container element
        activeControlElement: null,    // Reference to knob or fader-fill element
        activeValueDisplay: null,      // Reference to the value display element
        draggedParamId: null           // Which parameter is currently being dragged (to pause modulation)
    },

    // Voice settings (array of 6 voice objects)
    // Modern synthesis engines only (legacy FM engines removed)
    voices: [
        // Voice 1: Analog Kick (808-style)
        {
            engine: 'aKICK',
            outputMode: 'OUT', // 'OUT' (808-style) or 'AUX' (909-style) - for Analog engines only
            polyphonyMode: 0, // All voices support polyphony when engine changed to DX7/SAMPLE
            macroPatch: 50, macroDepth: 50, macroRate: 50, macroPitch: 50,
            analogKickTone: 50, analogKickDecay: 50, analogKickSweep: 50,
            gate: 80, // Gate duration (0-100%): controls note length
            pan: 50, level: 85, bitReduction: 0, drive: 0, chokeGroup: 1,
            muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
        },
        // Voice 2: Analog Snare (808-style)
        {
            engine: 'aSNARE',
            outputMode: 'OUT', // 'OUT' (808-style) or 'AUX' (909-style) - for Analog engines only
            polyphonyMode: 0,
            macroPatch: 40, macroDepth: 60, macroRate: 40, macroPitch: 50,
            analogSnareTone: 40, analogSnareDecay: 60, analogSnareSnap: 40,
            gate: 80, // Gate duration (0-100%): controls note length
            pan: 50, level: 75, bitReduction: 0, drive: 20, chokeGroup: 0,
            muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
        },
        // Voice 3: Analog Hi-Hat (closed)
        {
            engine: 'aHIHAT',
            outputMode: 'OUT', // 'OUT' (808-style) or 'AUX' (909-style/metallic) - for Analog engines only
            polyphonyMode: 0,
            macroPatch: 30, macroDepth: 10, macroRate: 60, macroPitch: 50,
            analogHihatMetal: 30, analogHihatDecay: 10, analogHihatBright: 60,
            gate: 80, // Gate duration (0-100%): controls note length
            pan: 50, level: 70, bitReduction: 0, drive: 0, chokeGroup: 2,
            muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
        },
        // Voice 4: DX7 FM Synth (melodic)
        {
            engine: 'DX7',
            outputMode: 'OUT', // Not used for DX7, but preserved for engine switching
            polyphonyMode: 0,
            macroPatch: 0, macroDepth: 50, macroRate: 50, macroPitch: 50,
            dx7Patch: null, dx7Algorithm: 1, dx7Feedback: 0, dx7Transpose: 0, dx7FineTune: 0,
            dx7EnvTimeScale: 1.0, dx7PitchEnvDepth: 0, dx7AttackScale: 1.0, dx7ReleaseScale: 1.0,
            gate: 80, // Gate duration (0-100%): controls note length, 100% enables slide in mono mode
            pan: 50, level: 75, bitReduction: 0, drive: 0, chokeGroup: 0,
            muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
        },
        // Voice 5: Sample Player
        {
            engine: 'SAMPLE',
            outputMode: 'OUT', // Not used for SAMPLE, but preserved for engine switching
            polyphonyMode: 0,
            macroPatch: 0, macroDepth: 100, macroRate: 50, macroPitch: 50,
            sampleIndex: 0, samplerDecay: 100, samplerFilter: 50, samplerPitch: 0,
            samplerBank: null,      // Bank name (for UI display)
            samplerBuffer: null,    // Array of {name, buffer} for this voice's kit
            samplerManifest: null,  // Full kit manifest
            gate: 80, // Gate duration (0-100%): controls note length
            pan: 50, level: 100, bitReduction: 0, drive: 0, chokeGroup: 0,
            muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
        },
        // Voice 6: Slice Player
        {
            engine: 'SLICE',
            outputMode: 'OUT', // Not used for SLICE, but preserved for engine switching
            polyphonyMode: 0,
            macroPatch: 0, macroDepth: 100, macroRate: 50, macroPitch: 50,
            sliceIndex: 0, sliceConfig: null, sliceBuffer: null,
            samplerDecay: 100, samplerFilter: 50, samplerPitch: 0,
            gate: 80, // Gate duration (0-100%): controls note length
            pan: 50, level: 100, bitReduction: 0, drive: 0, chokeGroup: 0,
            muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
        }
    ],

    // Sequences: 6 sequences, each with up to 64 steps.
    // Actual active length is controlled by euclidean.steps
    sequences: Array(6).fill(null).map(() => ({
        length: 16, // Active sequence length (controlled by euclidean STEPS)
        probability: 100, // Per-voice probability (0-100%)
        currentStep: -1, // Current step index for this voice's sequence
        steps: Array(64).fill(null).map(() => ({
            gate: false,
            accent: 0,      // 0-15
            ratchet: 0,     // 0-7 (maps to 1-8 triggers)
            probability: 100, // 0-100%
            deviation: 0,   // 0-100%
            deviationMode: 1 // 0: Early, 1: Late, 2: Both
        })),
        euclidean: {
            steps: 16,         // Number of steps in euclidean pattern (1-16)
            fills: 0,          // Number of active pulses (0-steps)
            shift: 0,          // Rotation/offset (0-steps-1)
            accentAmt: 0,      // Number of accents (0-fills)
            flamAmt: 0,        // Number of flams (0-fills)
            ratchetAmt: 0,     // Number of ratchets (0-fills)
            ratchetSpeed: 1,   // Ratchet speed (1-8): 1=double, 2=triple, etc.
            deviation: 0       // Deviation amount for accented steps (0-100%)
        }
    })),

    // Global EFFECTS state (defaults to no audible effect)
    reverbMix: 100, // Set to 100 - per-voice sends control amount (no UI fader)
    reverbDecay: 50,
    reverbDamping: 50, // 0-100, higher values mean more damping (darker reverb)
    reverbDiffusion: 60, // Controls impulse density/complexity
    reverbPreDelay: 10, // Early reflections timing (0-200ms)
    delayMix: 100, // Set to 100 - per-voice sends control amount (no UI fader)
    delayTime: 25, // 0-100, maps to a time range (e.g., 0-2s)
    delayFeedback: 0,
    delayTimeFree: 50, // Free mode delay time (1-4000ms)
    delaySyncEnabled: true, // Sync vs free mode toggle
    delayWow: 10, // Tape wow amount (0-100)
    delayFlutter: 5, // Tape flutter amount (0-100)
    delaySaturation: 0, // Tape saturation/distortion (0-100)
    delayFilter: 50, // Filter cutoff frequency (0-100, 50 = no filter)
    waveguideType: 0,  // 0: Off, 1: Tube, 2: String
    waveguideMix: 0,
    waveguideDecay: 50,
    waveguideBody: 50,
    waveguideTune: 50,

    // Drum Bus processor settings (replaces separate COMP + OUT modules)
    drumBus: {
        enabled: true,           // Overall bypass (via dryWet)
        driveType: 0,            // 0=SOFT, 1=MED, 2=HARD
        driveAmount: 0,          // 0-100
        crunch: 0,               // 0-100
        transients: 50,          // 0-100 (50 = neutral)
        boomAmount: 0,           // 0-100
        boomFreq: 33,            // 0-100 (maps to 30-90Hz, 33 ≈ 50Hz)
        boomDecay: 50,           // 0-100
        compEnabled: false,      // Compressor section enable
        dampenFreq: 100,         // 0-100 (maps to 500Hz-30kHz, 100 = 30kHz)
        trimGain: 50,            // 0-100 (50 = 0dB, range -12dB to +12dB)
        outputGain: 75,          // 0-100 (50 = 0dB) - replaces masterVolume (75 ≈ +6dB)
        dryWet: 100              // 0-100 (100 = fully wet)
    },

    // FX Mode: 'classic' (reverb/delay sends) or 'clouds' (granular processor)
    fxMode: 'classic',

    // Clouds FX Engine parameters (used when fxMode === 'clouds')
    cloudsPosition: 50,      // 0-100 (buffer position)
    cloudsSize: 50,          // 0-100 (grain size)
    cloudsDensity: 50,       // 0-100 (grain density)
    cloudsTexture: 50,       // 0-100 (grain texture/shape)
    cloudsPitch: 50,         // 0-100 (maps to -24 to +24 semitones, 50 = 0)
    cloudsSpread: 0,         // 0-100 (stereo spread)
    cloudsFeedback: 0,       // 0-100 (CRITICAL: default 0 prevents runaway)
    cloudsReverb: 0,         // 0-100 (internal reverb amount)
    cloudsDryWet: 0,         // 0-100 (dry/wet mix, default dry)
    cloudsInputGain: 50,     // 0-100 (maps to 0-200%, 50 = 100%)
    cloudsFreeze: false,     // Freeze buffer toggle
    cloudsMode: 0,           // 0=Granular, 1=WSOLA, 2=Looping, 3=Spectral
    cloudsQuality: 0,        // 0=High, 1=Medium, 2=Low, 3=XLow

    // Sidechain ducking configuration (for per-effect ducking triggered by drum voices)
    sidechain: {
        baengReverb: { enabled: false, voices: [true, false, false, false, false, false], threshold: 30, ratio: 80, attack: 10, release: 40, range: 60 },
        baengDelay: { enabled: false, voices: [true, false, false, false, false, false], threshold: 30, ratio: 80, attack: 10, release: 40, range: 60 },
        baengClouds: { enabled: false, voices: [true, false, false, false, false, false], threshold: 30, ratio: 80, attack: 10, release: 40, range: 60 },
        raemblReverb: { enabled: false, voices: [true, false, false, false, false, false], threshold: 30, ratio: 80, attack: 10, release: 40, range: 60 },
        raemblDelay: { enabled: false, voices: [true, false, false, false, false, false], threshold: 30, ratio: 80, attack: 10, release: 40, range: 60 },
        raemblClouds: { enabled: false, voices: [true, false, false, false, false, false], threshold: 30, ratio: 80, attack: 10, release: 40, range: 60 }
    },

    // Scale quantization settings
    scaleQuantizeEnabled: false, // Global enable/disable for scale quantization
    globalScale: 0,              // Index into scales array (0-32), 0 = Chromatic
    globalRoot: 0                // Root note (0-11, representing C-B)
};

// Parameter definitions for UI controls and MIDI mapping
// 'module' indicates which UI module hosts the primary control for this parameter.
// 'label' is the user-facing label on the fader/control.
// 'statePath' is the dot-notation path to the value in the `state` object.
// '[selectedVoice]' in statePath will be dynamically replaced with the current `state.selectedVoice`.
export const parameterDefinitions = {
    // TIME parameters
    "time.bpm": { module: "time", label: "BPM", statePath: "bpm", min: 20, max: 300, default: 120, step: 1 },
    "time.swing": { module: "time", label: "SWING", statePath: "swing", min: 0, max: 100, default: 0, unit: "%", step: 1 },
    "time.length": { module: "time", label: "LENGTH", statePath: "barLength", min: 1, max: 128, default: 4, unit: " beats", step: 1 },

    // MACRO CONTROLS (ENGINE module) - modulatable per-voice
    // For non-DX7 engines: COLOR, SHAPE, PITCH, DECAY, SWEEP, CONTOUR
    "voice.macroColor": { module: "baeng-engine", label: "COLOR", statePath: "voices[selectedVoice].macroColor", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    "voice.macroShape": { module: "baeng-engine", label: "SHAPE", statePath: "voices[selectedVoice].macroShape", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    "voice.macroPitch": { module: "baeng-engine", label: "PITCH", statePath: "voices[selectedVoice].macroPitch", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    "voice.macroDecay": { module: "baeng-engine", label: "DECAY", statePath: "voices[selectedVoice].macroDecay", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    "voice.macroSweep": { module: "baeng-engine", label: "SWEEP", statePath: "voices[selectedVoice].macroSweep", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    "voice.macroContour": { module: "baeng-engine", label: "CONTOUR", statePath: "voices[selectedVoice].macroContour", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    // For DX7 and analog engines: PATCH, DEPTH, RATE, PITCH
    "voice.macroPatch": { module: "baeng-engine", label: "PATCH", statePath: "voices[selectedVoice].macroPatch", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    "voice.macroDepth": { module: "baeng-engine", label: "DEPTH", statePath: "voices[selectedVoice].macroDepth", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    "voice.macroRate": { module: "baeng-engine", label: "RATE", statePath: "voices[selectedVoice].macroRate", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    // For sampler engine: SAMPLE (note number)
    "voice.samplerNote": { module: "baeng-engine", label: "SAMPLE", statePath: "voices[selectedVoice].samplerNote", min: 0, max: 127, default: 36, step: 1, modulatable: true, voiceParam: true },
    "voice.samplerDecay": { module: "baeng-engine", label: "DECAY", statePath: "voices[selectedVoice].samplerDecay", min: 0, max: 100, default: 100, step: 1, modulatable: true, voiceParam: true },
    "voice.samplerFilter": { module: "baeng-engine", label: "FILTER", statePath: "voices[selectedVoice].samplerFilter", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    // Note: SLICE engine uses voice.macroPatch for slice selection (handled by ENGINE_MACROS system)

    // VOICE parameters - Layer A (ENGINE module - controlled by macros) - all modulatable
    "voice.layerAWaveform": { module: "baeng-engine", label: "WAVE A", statePath: "voices[selectedVoice].layerAWaveform", min: 0, max: 4, default: 0, step: 1, modulatable: true, voiceParam: true },
    "voice.layerAPitch": { module: "baeng-engine", label: "PITCH A", statePath: "voices[selectedVoice].layerAPitch", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    "voice.layerAAttack": { module: "baeng-engine", label: "ATK A", statePath: "voices[selectedVoice].layerAAttack", min: 0, max: 100, default: 0, step: 1, modulatable: true, voiceParam: true },
    "voice.layerADecay": { module: "baeng-engine", label: "DEC A", statePath: "voices[selectedVoice].layerADecay", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    "voice.layerASustain": { module: "baeng-engine", label: "SUS A", statePath: "voices[selectedVoice].layerASustain", min: 0, max: 100, default: 0, step: 1, modulatable: true, voiceParam: true },

    // VOICE parameters - Layer B (ENGINE module - controlled by macros) - all modulatable
    "voice.layerBWaveform": { module: "baeng-engine", label: "WAVE B", statePath: "voices[selectedVoice].layerBWaveform", min: 0, max: 4, default: 0, step: 1, modulatable: true, voiceParam: true },
    "voice.layerBPitchRatio": { module: "baeng-engine", label: "RATIO B", statePath: "voices[selectedVoice].layerBPitchRatio", min: 0.1, max: 16.0, default: 1.0, step: 0.1, modulatable: true, voiceParam: true },
    "voice.layerBModAmount": { module: "baeng-engine", label: "MOD", statePath: "voices[selectedVoice].layerBModAmount", min: 0, max: 100, default: 0, step: 1, modulatable: true, voiceParam: true },
    "voice.layerBAttack": { module: "baeng-engine", label: "ATK B", statePath: "voices[selectedVoice].layerBAttack", min: 0, max: 100, default: 0, step: 1, modulatable: true, voiceParam: true },
    "voice.layerBDecay": { module: "baeng-engine", label: "DEC B", statePath: "voices[selectedVoice].layerBDecay", min: 0, max: 100, default: 30, step: 1, modulatable: true, voiceParam: true },
    "voice.layerBSustain": { module: "baeng-engine", label: "SUS B", statePath: "voices[selectedVoice].layerBSustain", min: 0, max: 100, default: 0, step: 1, modulatable: true, voiceParam: true },

    // VOICE parameters - Mix (ENGINE module - controlled by macros) - modulatable
    "voice.layerMix": { module: "baeng-engine", label: "MIX", statePath: "voices[selectedVoice].layerMix", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },

    // VOICE parameters - Processing & Sends (now in ENGINE module as knobs) - all modulatable
    "voice.level": { module: "baeng-engine", label: "LEVEL", statePath: "voices[selectedVoice].level", min: 0, max: 100, default: 100, step: 1, modulatable: true, voiceParam: true },
    "voice.pan": { module: "baeng-engine", label: "PAN", statePath: "voices[selectedVoice].pan", min: 0, max: 100, default: 50, step: 1, modulatable: true, voiceParam: true },
    "voice.chokeGroup": { module: "voices", label: "CHOKE", statePath: "voices[selectedVoice].chokeGroup", min: 0, max: 4, default: 0, step: 1, modulatable: true, voiceParam: true },
    "voice.reverbSend": { module: "baeng-engine", label: "RVB", statePath: "voices[selectedVoice].reverbSend", min: 0, max: 100, default: 0, step: 1, modulatable: true, voiceParam: true },
    "voice.delaySend": { module: "baeng-engine", label: "DLY", statePath: "voices[selectedVoice].delaySend", min: 0, max: 100, default: 0, step: 1, modulatable: true, voiceParam: true },
    "voice.cloudsSend": { module: "baeng-engine", label: "CLOUD", statePath: "voices[selectedVoice].cloudsSend", min: 0, max: 100, default: 0, step: 1, modulatable: true, voiceParam: true },
    "voice.bitReduction": { module: "baeng-engine", label: "BIT", statePath: "voices[selectedVoice].bitReduction", min: 0, max: 100, default: 0, step: 1, modulatable: true, voiceParam: true },
    "voice.drive": { module: "baeng-engine", label: "DRIVE", statePath: "voices[selectedVoice].drive", min: 0, max: 100, default: 0, step: 1, modulatable: true, voiceParam: true },

    // DX7 PATCH selection (modulatable - will cycle through patches)
    "voice.dx7PatchIndex": { module: "baeng-engine", label: "PATCH", statePath: "voices[selectedVoice].dx7PatchIndex", min: 0, max: 31, default: 0, step: 1, modulatable: true, voiceParam: true },
    // GATE (controls note duration for all engines, 100% enables slide for DX7 in mono mode)
    "voice.gate": { module: "voices", label: "GATE", statePath: "voices[selectedVoice].gate", min: 0, max: 100, default: 80, step: 1, unit: "%", modulatable: true, voiceParam: true },

    // SEQUENCE parameters (VOICES module UI) - now modulatable per-voice
    "sequence.probability": { module: "voices", label: "PROB", statePath: "sequences[selectedVoice].probability", min: 0, max: 100, default: 100, step: 1, unit: "%", modulatable: true, voiceParam: true },

    // EUCLIDEAN parameters (VOICES module UI) - now modulatable per-voice
    "euclidean.steps": { module: "voices", label: "STEPS", statePath: "sequences[selectedVoice].euclidean.steps", min: 1, max: 16, default: 16, step: 1, modulatable: true, voiceParam: true },
    "euclidean.fills": { module: "voices", label: "FILLS", statePath: "sequences[selectedVoice].euclidean.fills", min: 0, max: 16, default: 0, step: 1, modulatable: true, voiceParam: true },
    "euclidean.shift": { module: "voices", label: "SHIFT", statePath: "sequences[selectedVoice].euclidean.shift", min: 0, max: 15, default: 0, step: 1, modulatable: true, voiceParam: true },
    "euclidean.accentAmt": { module: "voices", label: "ACCENT", statePath: "sequences[selectedVoice].euclidean.accentAmt", min: 0, max: 16, default: 0, step: 1, modulatable: true, voiceParam: true },
    "euclidean.flamAmt": { module: "voices", label: "FLAM", statePath: "sequences[selectedVoice].euclidean.flamAmt", min: 0, max: 16, default: 0, step: 1, modulatable: true, voiceParam: true },
    "euclidean.ratchetAmt": { module: "voices", label: "RATCHET", statePath: "sequences[selectedVoice].euclidean.ratchetAmt", min: 0, max: 16, default: 0, step: 1, modulatable: true, voiceParam: true },
    "euclidean.ratchetSpeed": { module: "voices", label: "R-SPD", statePath: "sequences[selectedVoice].euclidean.ratchetSpeed", min: 1, max: 8, default: 1, step: 1, modulatable: true, voiceParam: true },
    "euclidean.deviation": { module: "voices", label: "DEV", statePath: "sequences[selectedVoice].euclidean.deviation", min: 0, max: 100, default: 0, step: 1, unit: "%", modulatable: true, voiceParam: true },

    // GLOBAL EFFECTS parameters (all modulatable with trigger source selection)
    // Labels match HTML knob labels in components/index.js
    "effects.reverbDecay": { module: "reverb-fx", label: "DEC", statePath: "reverbDecay", min: 0, max: 100, default: 50, step: 1, modulatable: true, effectParam: true },
    "effects.reverbDamping": { module: "reverb-fx", label: "DAMP", statePath: "reverbDamping", min: 0, max: 100, default: 50, step: 1, modulatable: true, effectParam: true },
    "effects.reverbDiffusion": { module: "reverb-fx", label: "DIFF", statePath: "reverbDiffusion", min: 0, max: 100, default: 60, step: 1, modulatable: true, effectParam: true },
    "effects.reverbPreDelay": { module: "reverb-fx", label: "PRED", statePath: "reverbPreDelay", min: 0, max: 100, default: 10, step: 1, modulatable: true, effectParam: true },

    "effects.delayTime": { module: "delay-fx", label: "TIME", statePath: "delayTime", min: 0, max: 100, default: 25, step: 1, modulatable: true, effectParam: true },
    "effects.delayFeedback": { module: "delay-fx", label: "FDBK", statePath: "delayFeedback", min: 0, max: 100, default: 0, step: 1, modulatable: true, effectParam: true },
    "effects.delayTimeFree": { module: "delay-fx", label: "TIME", statePath: "delayTimeFree", min: 0, max: 100, default: 50, step: 1, modulatable: true, effectParam: true },
    "effects.delaySyncEnabled": { module: "delay-fx", label: "SYNC", statePath: "delaySyncEnabled", type: "boolean", default: true },
    "effects.delayWow": { module: "delay-fx", label: "WOW", statePath: "delayWow", min: 0, max: 100, default: 10, step: 1, modulatable: true, effectParam: true },
    "effects.delayFlutter": { module: "delay-fx", label: "FLUT", statePath: "delayFlutter", min: 0, max: 100, default: 5, step: 1, modulatable: true, effectParam: true },
    "effects.delaySaturation": { module: "delay-fx", label: "SAT", statePath: "delaySaturation", min: 0, max: 100, default: 0, step: 1, modulatable: true, effectParam: true },
    "effects.delayFilter": { module: "delay-fx", label: "FILT", statePath: "delayFilter", min: 0, max: 100, default: 50, step: 1, modulatable: true, effectParam: true },

    // Clouds FX parameters (replaces waveguide)
    "effects.fxMode": { module: "baeng-clouds-fx", label: "FX MODE", statePath: "fxMode", type: "enum", options: ["classic", "clouds"], default: "classic" },
    "effects.cloudsPosition": { module: "baeng-clouds-fx", label: "POS", statePath: "cloudsPosition", min: 0, max: 100, default: 50, step: 1, modulatable: true, effectParam: true },
    "effects.cloudsSize": { module: "baeng-clouds-fx", label: "SIZE", statePath: "cloudsSize", min: 0, max: 100, default: 50, step: 1, modulatable: true, effectParam: true },
    "effects.cloudsDensity": { module: "baeng-clouds-fx", label: "DENS", statePath: "cloudsDensity", min: 0, max: 100, default: 50, step: 1, modulatable: true, effectParam: true },
    "effects.cloudsTexture": { module: "baeng-clouds-fx", label: "TEX", statePath: "cloudsTexture", min: 0, max: 100, default: 50, step: 1, modulatable: true, effectParam: true },
    "effects.cloudsPitch": { module: "baeng-clouds-fx", label: "PITCH", statePath: "cloudsPitch", min: 0, max: 100, default: 50, step: 1, modulatable: true, effectParam: true },
    "effects.cloudsSpread": { module: "baeng-clouds-fx", label: "SPRD", statePath: "cloudsSpread", min: 0, max: 100, default: 0, step: 1, modulatable: true, effectParam: true },
    "effects.cloudsFeedback": { module: "baeng-clouds-fx", label: "FB", statePath: "cloudsFeedback", min: 0, max: 100, default: 0, step: 1, modulatable: true, effectParam: true },
    "effects.cloudsReverb": { module: "baeng-clouds-fx", label: "VERB", statePath: "cloudsReverb", min: 0, max: 100, default: 0, step: 1, modulatable: true, effectParam: true },
    "effects.cloudsDryWet": { module: "baeng-clouds-fx", label: "D/W", statePath: "cloudsDryWet", min: 0, max: 100, default: 0, step: 1, modulatable: true, effectParam: true },
    "effects.cloudsInputGain": { module: "baeng-clouds-fx", label: "IN", statePath: "cloudsInputGain", min: 0, max: 100, default: 50, step: 1, modulatable: true, effectParam: true },
    "effects.cloudsFreeze": { module: "baeng-clouds-fx", label: "FREEZE", statePath: "cloudsFreeze", type: "boolean", default: false },
    "effects.cloudsMode": { module: "baeng-clouds-fx", label: "MODE", statePath: "cloudsMode", min: 0, max: 3, default: 0, step: 1 },
    "effects.cloudsQuality": { module: "baeng-clouds-fx", label: "QUAL", statePath: "cloudsQuality", min: 0, max: 3, default: 0, step: 1 },

    // DRUM BUS parameters (replaces COMP + OUT modules)
    "bus.trimGain": { module: "bus", label: "bus-trim", statePath: "drumBus.trimGain", min: 0, max: 100, default: 50, step: 1 },
    "bus.driveAmount": { module: "bus", label: "bus-drive", statePath: "drumBus.driveAmount", min: 0, max: 100, default: 0, step: 1 },
    "bus.crunch": { module: "bus", label: "bus-crunch", statePath: "drumBus.crunch", min: 0, max: 100, default: 0, step: 1 },
    "bus.transients": { module: "bus", label: "bus-trans", statePath: "drumBus.transients", min: 0, max: 100, default: 50, step: 1 },
    "bus.dampenFreq": { module: "bus", label: "bus-damp", statePath: "drumBus.dampenFreq", min: 0, max: 100, default: 100, step: 1 },
    "bus.boomAmount": { module: "bus", label: "bus-boom", statePath: "drumBus.boomAmount", min: 0, max: 100, default: 0, step: 1 },
    "bus.boomFreq": { module: "bus", label: "bus-freq", statePath: "drumBus.boomFreq", min: 0, max: 100, default: 33, step: 1 },
    "bus.boomDecay": { module: "bus", label: "bus-decay", statePath: "drumBus.boomDecay", min: 0, max: 100, default: 50, step: 1 },
    "bus.dryWet": { module: "bus", label: "bus-dw", statePath: "drumBus.dryWet", min: 0, max: 100, default: 100, step: 1 },
    "bus.outputGain": { module: "bus", label: "bus-out", statePath: "drumBus.outputGain", min: 0, max: 100, default: 75, step: 1 }
};

// Function to resolve parameter paths that depend on the selected voice
export function resolveParameterPath(paramDef) {
    if (!paramDef || !paramDef.statePath) {
        // console.warn("resolveParameterPath: Invalid paramDef received:", paramDef);
        return null;
    }
    if (paramDef.statePath.includes('[selectedVoice]')) {
        if (state.selectedVoice === null || state.selectedVoice === undefined || state.selectedVoice < 0 || state.selectedVoice >= state.voices.length) {
            // console.warn(`resolveParameterPath: Invalid selectedVoice (${state.selectedVoice}) for path ${paramDef.statePath}`);
            // Fallback to a default or handle error appropriately
            return paramDef.statePath.replace('[selectedVoice]', `[0]`); // Or return null / throw error
        }
        return paramDef.statePath.replace('[selectedVoice]', `[${state.selectedVoice}]`);
    }
    return paramDef.statePath;
}

// Function to get a parameter value using its definition
export function getParameterValue(paramId) {
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) {
        // console.warn(`getParameterValue: Parameter definition not found for ID: ${paramId}`);
        return null;
    }
    const path = resolveParameterPath(paramDef);
    if (!path) {
        // console.warn(`getParameterValue: Could not resolve path for paramId: ${paramId}`);
        return paramDef.default !== undefined ? paramDef.default : null;
    }

    const pathParts = path.split('.');
    let value = state;
    try {
        for (const part of pathParts) {
            if (part.includes('[') && part.includes(']')) {
                const arrayName = part.substring(0, part.indexOf('['));
                const indexStr = part.substring(part.indexOf('[') + 1, part.indexOf(']'));
                const index = parseInt(indexStr, 10);

                if (!value[arrayName] || index < 0 || index >= value[arrayName].length) {
                    // console.warn(`Path ${path} invalid: array '${arrayName}' or index '${index}' out of bounds for paramId ${paramId}.`);
                    return paramDef.default !== undefined ? paramDef.default : null;
                }
                value = value[arrayName][index];
            } else {
                if (value[part] === undefined) {
                     // console.warn(`Path ${path} resulted in undefined value at part '${part}' for paramId ${paramId}`);
                    return paramDef.default !== undefined ? paramDef.default : null;
                }
                value = value[part];
            }
        }
    } catch (error) {
        // console.error(`Error getting parameter ${paramId} at path ${path}:`, error);
        return paramDef.default !== undefined ? paramDef.default : null;
    }
    return value;
}

export function setParameterValue(paramId, newValue) {
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) {
        return false;
    }

    // Apply constraints (min, max, step)
    let value = newValue;
    if (typeof value === 'number') { // Ensure value is a number before applying constraints
        if (paramDef.min !== undefined) value = Math.max(paramDef.min, value);
        if (paramDef.max !== undefined) value = Math.min(paramDef.max, value);
        if (paramDef.step && paramDef.step !== 0) {
            value = Math.round(value / paramDef.step) * paramDef.step;
            // Fix potential floating point inaccuracies for decimal steps
            if (paramDef.step.toString().includes('.')) {
                 const decimals = paramDef.step.toString().split('.')[1].length;
                 value = parseFloat(value.toFixed(decimals));
            }
        }
    }


    const path = resolveParameterPath(paramDef);
    if (!path) {
        return false;
    }

    const pathParts = path.split('.');
    let target = state;
    try {
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (part.includes('[') && part.includes(']')) {
                const arrayName = part.substring(0, part.indexOf('['));
                const indexStr = part.substring(part.indexOf('[') + 1, part.indexOf(']'));
                const index = parseInt(indexStr, 10);

                if (!target[arrayName] || index < 0 || index >= target[arrayName].length) {
                    return false;
                }
                target = target[arrayName][index];
            } else {
                 if (target[part] === undefined) {
                }
                target = target[part];
            }
            if (typeof target !== 'object' || target === null) {
            }
        }

        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart.includes('[') && lastPart.includes(']')) {
            const arrayName = lastPart.substring(0, lastPart.indexOf('['));
            const indexStr = lastPart.substring(lastPart.indexOf('[') + 1, lastPart.indexOf(']'));
            const index = parseInt(indexStr, 10);
            if (!target[arrayName] || index < 0 || index >= target[arrayName].length) {
            }
            target[arrayName][index] = value;
        } else {
            if (target === undefined || target === null) {
            }

            // For timing parameters, use shared clock functions instead of direct state update
            // This ensures proper broadcasting to both apps
            if (paramId === 'time.bpm') {
                setBPM(value);
                return true; // Don't set state directly - shared clock will update it
            } else if (paramId === 'time.swing') {
                setSwing(value);
                return true; // Don't set state directly - shared clock will update it
            } else if (paramId === 'time.barLength') {
                setBaengBarLength(value);
                return true; // Don't set state directly - shared clock will update it
            }

            target[lastPart] = value;

            // Debug logging for reverb-related parameters
            if (paramId.includes('reverb') || paramId.includes('ratchet')) {
            }
        }
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Set parameter value for a specific voice without changing selectedVoice
 * This is a safer alternative to temporarily modifying state.selectedVoice
 * @param {string} paramId - Parameter identifier
 * @param {number} newValue - New parameter value
 * @param {number} voiceIndex - Target voice index (0-5)
 * @returns {boolean} Success status
 */
export function setParameterValueForVoice(paramId, newValue, voiceIndex) {
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) {
        console.warn(`Parameter ${paramId} not found`);
        return false;
    }

    if (!paramDef.voiceParam) {
        console.warn(`Parameter ${paramId} is not a voice parameter`);
        return false;
    }

    if (voiceIndex < 0 || voiceIndex >= state.voices.length) {
        console.warn(`Invalid voice index: ${voiceIndex}`);
        return false;
    }

    // Temporarily set selectedVoice in a safe, isolated way
    const originalVoice = state.selectedVoice;
    try {
        state.selectedVoice = voiceIndex;
        const success = setParameterValue(paramId, newValue);
        return success;
    } finally {
        // Always restore, even if error occurs
        state.selectedVoice = originalVoice;
    }
}

// ========== CONTROL ALL HELPERS ==========

// Parameters excluded from Control All by default
const CONTROL_ALL_EXCLUSIONS = [
    'voice.chokeGroup',      // Individual voice routing
    'voice.pan',             // Stereo positioning
    'voice.dx7PatchIndex'    // DX7 patch selection
];

/**
 * Check if a parameter should allow Control All
 * @param {string} paramId - Parameter identifier
 * @returns {boolean} True if Control All should be allowed
 */
export function shouldAllowControlAll(paramId) {
    return !CONTROL_ALL_EXCLUSIONS.includes(paramId);
}

/**
 * Apply parameter value to all voices (Control All feature)
 * Used when Command/Ctrl is held while adjusting a parameter
 * @param {string} paramId - Parameter identifier
 * @param {number} newValue - Value to apply
 * @returns {boolean} Success status
 */
export function applyParameterToAllVoices(paramId, newValue) {
    const paramDef = parameterDefinitions[paramId];

    // Only works for voice parameters
    if (!paramDef || !paramDef.voiceParam) {
        console.warn(`Cannot apply Control All to non-voice parameter: ${paramId}`);
        return false;
    }

    // Apply constraints once
    let value = newValue;
    if (typeof value === 'number') {
        if (paramDef.min !== undefined) value = Math.max(paramDef.min, value);
        if (paramDef.max !== undefined) value = Math.min(paramDef.max, value);
        if (paramDef.step && paramDef.step !== 0) {
            value = Math.round(value / paramDef.step) * paramDef.step;
            if (paramDef.step.toString().includes('.')) {
                const decimals = paramDef.step.toString().split('.')[1].length;
                value = parseFloat(value.toFixed(decimals));
            }
        }
    }

    // Apply to all voices using safe setter
    let successCount = 0;
    for (let voiceIndex = 0; voiceIndex < state.voices.length; voiceIndex++) {
        if (setParameterValueForVoice(paramId, value, voiceIndex)) {
            successCount++;
        }
    }

    return successCount === state.voices.length;
}

// ========== DX7 PATCH MANAGEMENT HELPERS ==========

/**
 * Set DX7 patch for a voice (atomic operation)
 * Either sets ALL properties or NONE
 * @param {number} voiceIndex - Voice index (0-5)
 * @param {Object} patchData - Full patch object from dx7Library
 * @param {number} patchIndex - Index in currentBank (0-31)
 * @param {number} bankSize - Total patches in bank
 * @param {Array} bankCopy - Optional: Deep copy of bank for per-voice storage
 * @param {string} bankName - Optional: Name of the bank file
 * @returns {boolean} Success status
 */
export function setDX7Patch(voiceIndex, patchData, patchIndex, bankSize, bankCopy = null, bankName = null) {
    if (voiceIndex < 0 || voiceIndex >= state.voices.length) {
        console.error(`[setDX7Patch] Invalid voice index: ${voiceIndex}`);
        return false;
    }

    // Validate arguments
    if (!patchData) {
        console.error('[setDX7Patch] patchData is null/undefined');
        return false;
    }

    if (!patchData.parsed || !patchData.parsed.operators || patchData.parsed.operators.length !== 6) {
        console.error('[setDX7Patch] patchData missing required structure (parsed.operators[6])');
        return false;
    }

    if (patchIndex === null || patchIndex === undefined || patchIndex < 0) {
        console.error(`[setDX7Patch] Invalid patchIndex: ${patchIndex}`);
        return false;
    }

    if (!bankSize || patchIndex >= bankSize) {
        console.error(`[setDX7Patch] patchIndex ${patchIndex} out of bounds (bank size: ${bankSize})`);
        return false;
    }

    const voice = state.voices[voiceIndex];

    // ATOMIC UPDATE - all or nothing
    try {
        voice.engine = 'DX7';
        voice.dx7Patch = patchData;
        voice.dx7PatchName = patchData.metadata?.voiceName || patchData.name || `Patch ${patchIndex + 1}`;
        voice.dx7PatchIndex = patchIndex;
        voice.dx7BankSize = bankSize;

        // Store per-voice bank copy if provided
        if (bankCopy) {
            voice.dx7Bank = bankCopy;
            voice.dx7BankName = bankName;
        }

        // Initialize macro modifiers to neutral if not already set
        if (voice.dx7AlgorithmOffset === undefined) voice.dx7AlgorithmOffset = 0;
        if (voice.dx7VolumeBoost === undefined) voice.dx7VolumeBoost = 0;
        if (voice.dx7FreqMultiplier === undefined) voice.dx7FreqMultiplier = 1.0;
        if (voice.dx7Transpose === undefined) voice.dx7Transpose = 0;
        if (voice.dx7FineTune === undefined) voice.dx7FineTune = 0;
        if (voice.dx7EnvTimeScale === undefined) voice.dx7EnvTimeScale = 1.0;
        if (voice.dx7PitchEnvScale === undefined) voice.dx7PitchEnvScale = 0;
        if (voice.dx7AttackScale === undefined) voice.dx7AttackScale = 1.0;
        if (voice.dx7ReleaseScale === undefined) voice.dx7ReleaseScale = 1.0;

        if (patchData.parsed && patchData.parsed.algorithm !== undefined) {
            voice.dx7Algorithm = patchData.parsed.algorithm;
        }

        return true;

    } catch (error) {
        console.error('[setDX7Patch] Failed to set patch:', error);

        // Rollback - clear ALL DX7 state
        voice.dx7Patch = null;
        voice.dx7PatchName = null;
        voice.dx7PatchIndex = null;
        voice.dx7BankSize = 0;

        return false;
    }
}

/**
 * Clear DX7 patch from voice
 * @param {number} voiceIndex - Voice index (0-5)
 */
export function clearDX7Patch(voiceIndex) {
    if (voiceIndex < 0 || voiceIndex >= state.voices.length) return;

    const voice = state.voices[voiceIndex];
    voice.dx7Patch = null;
    voice.dx7PatchName = null;
    voice.dx7PatchIndex = null;
    voice.dx7BankSize = 0;

}

// ========== END DX7 PATCH MANAGEMENT HELPERS ==========

// Register state with merged state manager and export the proxy
export const state = registerBaengState(localState);

// Note: Helper functions above use 'state' which is properly initialized here.
// They will work correctly since functions are called after this export runs.