// File: js/state.js

import { registerRaemblState } from '../state.js';

const localState = {
    // Clock state
    isPlaying: false,
    bpm: 120,
    swing: 0,
    barLength: 4,
    currentStepIndex: -1,
    factorsPatternPos: -1, // Renamed from currentStepIndex for factors pattern
    displayBar: 1,
    displayBeat: 1,
    displayStep: 1,
    isBarStart: false,
    resetFactorsOnBar: false,
    resetLfoOnBar: false,
    clockRequestId: null,
    lastStepTime: 0,
    stepCounter: -1,
    barCounter: 0,
    stepsPerBeat: 4,
    // Factors state
    steps: 16,
    fills: 4,
    rotation: 0,
    accentAmt: 0,    // Number of accents (0 to fills)
    slideAmt: 0,     // Number of slides (0 to fills - accentAmt)
    trillAmt: 0,     // Number of trills (0 to fills - accentAmt - slideAmt)
    gateLength: 80, // Gate length percentage (0-100) for sequencer note duration
    gatePattern: [],
    accentPattern: [],
    slidePattern: [],
    trillPattern: [], // New Trill Pattern
    factorsAnimationMode: 'animated', // 'static' or 'animated' - controls visualization mode
    // LFO state
    lfoAmp: 36,
    lfoFreq: 36,
    lfoWaveform: 0,
    lfoOffset: 0,
    lfoValue: 0,
    lfoStartTime: performance.now(),
    // Mod LFO state
    modLfoRate: 50,
    modLfoWaveform: 0,
    modLfoValue: 0,
    // Path state
    sample: 50,
    prevSample: 30,
    scale: 3, // Default to Pentatonic Major (index 3 if Chromatic is 0, Major 1, Minor 2)
              // Check your scales array in utils.js for correct default index.
              // Assuming Pentatonic Major is a reasonable default.
    root: 0,
    probability: 100,
    currentNote: 'C3',
    triggerSample: false,
    sampleTime: Date.now(),
    isTransitioning: false,
    pathAnimationMode: 'animated', // 'static' or 'animated' - controls visualization mode
    stepPitches: [], // Array of pitch values (0-100) for each step in the sequence
    // Reverb state
    reverbMix: 25,  // 25% send level - audible but subtle
    diffusion: 60,
    preDelay: 10,
    reverbDecay: 70, // Note: Original state.js had 'decay', this is now 'reverbDecay'
    damping: 20,
    // Delay state
    delayMix: 25,   // 25% send level - audible but subtle
    delayTime: 50,      // For SYNC mode (0-100, maps to divisions)
    delayTimeFree: 50,  // For FREE mode (0-100, maps to ms)
    delaySyncEnabled: true, // true for SYNC, false for FREE
    feedback: 40,
    wow: 10,
    flutter: 5,
    saturation: 0,
    // FX Mode state
    fxMode: 'classic', // 'classic' (Reverb + Delay) or 'clouds' (Clouds granular processor)
    // Clouds state
    // Clouds parameters (0-100 UI range, except pitch which is -200 to +200)
    cloudsPosition: 0,
    cloudsSize: 0,
    cloudsDensity: 50,
    cloudsTexture: 50,
    cloudsPitch: 50,     // 0-100 maps to -2 to +2 octaves
    cloudsSpread: 50,    // Stereo spread (0-100 maps to 0-1)
    cloudsFeedback: 0,   // CRITICAL: Default 0 prevents runaway
    cloudsReverb: 30,
    cloudsDryWet: 0,
    cloudsInputGain: 50, // 0-100 maps to 0-2 (0-200%), default 50 = 1.0 (100%)
    cloudsFreeze: false,
    // Engine selection (multi-engine support)
    engineType: 'subtractive', // 'subtractive' | 'plaits' | 'rings'
    plaitsEngine: 0, // Plaits engine index (0-23)
    ringsModel: 0, // Rings model index (0-5)

    // Plaits engine parameters (0-100, mapped to 0-1 in processor)
    plaitsHarmonics: 50, // Primary timbral control
    plaitsTimbre: 50, // Secondary timbral control
    plaitsMorph: 50, // Tertiary control / crossfade
    plaitsLpgDecay: 50, // LPG decay time
    plaitsLpgColour: 50, // LPG VCA↔VCF blend
    plaitsMixOutAux: 0, // OUT/AUX crossfade (0=OUT, 100=AUX)

    // Rings engine parameters (0-100, mapped to 0-1 in processor)
    ringsStructure: 50, // Inharmonicity / string coupling
    ringsBrightness: 50, // High frequency content
    ringsDamping: 50, // Decay time
    ringsPosition: 25, // Excitation position (bow/pluck)
    ringsMixStrum: 50, // Internal excitation intensity
    ringsPolyphony: 4, // 1 = mono, 2 = 2-voice, 4 = 4-voice (max for Rings)

    // Oscillator state (subtractive engine)
    mainTransposition: 4,
    subTransposition: 2,
    drift: 10,
    glide: 0,
    pulseWidth: 50,
    pwmAmount: 0,
    pitchMod: 0,
    pwmSource: 0,
    modSource: 0,
    monoMode: true,
    // Mixer state
    sawLevel: 75,
    squareLevel: 0,
    triangleLevel: 0,
    subLevel: 50,
    noiseLevel: 0,
    // Filter state
    highPass: 0,
    lowPass: 75,
    resonance: 20,
    keyFollow: 0,
    envAmount: 50,
    filterMod: 0,
    // Envelope state
    attack: 0,
    decay: 25,
    sustain: 50,
    release: 75,
    // Output state
    volume: 75,

    // --- MIDI CC Mappings ---
    midiCCMappings: [
        // Example initial mappings (can be empty)
        // { cc: 74, parameterId: 'filter.lowPass' },
        // { cc: 1, parameterId: 'modLfo.rate' }
    ],

    // --- Per-Parameter Modulation System v1.1.0 ---
    // Sparse storage - only store active modulations
    //
    // PATCH FORMAT v1.1.0: Added 'mode' property + mode-specific params
    // Modes: 'LFO' | 'RND' | 'ENV' | 'EF' | 'TM' | 'SEQ'
    // Backward compatible: if 'mode' missing, assume 'LFO'
    perParamModulations: {
        // Example structure v1.1.0:
        // 'filter.lowPass': {
        //     mode: 'LFO',          // v1.1.0: Modulation mode
        //     enabled: true,
        //     depth: 60,            // 0-100% (common to all modes)
        //     offset: 0,            // -100 to +100% (common to all modes)
        //     muted: false,
        //     baseValue: null,
        //
        //     // LFO mode (backward compatible)
        //     lfoWaveform: 0,       // 0=sin, 1=tri, 2=sq, 3=saw, 4=ramp, 5=s&h
        //     lfoRate: 2.5,         // Hz (0.05-30)
        //     lfoSync: false,
        //     resetMode: 'step',    // 'off'|'step'|'accent'|'bar'
        //
        //     // RND mode
        //     rndBitLength: 16, rndProbability: 100, rndSampleRate: 1000,
        //
        //     // ENV mode
        //     envAttackMs: 10, envReleaseMs: 200, envCurveShape: 'exponential',
        //
        //     // EF mode
        //     efAttackMs: 10, efReleaseMs: 100, efSource: 'input',
        //
        //     // TM mode
        //     tmLength: 8, tmProbability: 50, tmPattern: [],
        //
        //     // SEQ mode
        //     seqLength: 4, seqPattern: [0.5, 0.5, 0.5, 0.5]
        // }
    },

    // --- Modulation Edit Mode State ---
    modEditMode: {
        activeParamId: null,  // Which parameter is being edited
        currentPage: 0,       // 0=normal, 1=wave, 2=rate, 3=offset, 4=depth, 5=reset
        inactivityTimer: null,      // Timer reference for auto-return to normal view
        lastInteractionTime: null,   // Timestamp of last interaction
        // UI element references for restoring previous param when switching
        activeLabelEl: null,
        activeFill: null,
        activeValueDisplay: null,
        activeVerticalText: null
    }
};

export const parameterDefinitions = {
    // Clock - handled by shared time strip (no DOM module needed)
    'clock.bpm': { statePath: 'bpm', min: 20, max: 300, module: null, label: 'BPM' },
    'clock.swing': { statePath: 'swing', min: 0, max: 100, module: null, label: 'SWING' },
    'clock.length': { statePath: 'raemblBarLength', min: 1, max: 128, step: 1, module: null, label: 'LENGTH' },
    // Factors
    'factors.steps': { statePath: 'steps', min: 1, max: 32, step: 1, module: 'raembl-factors', label: 'STEPS' },
    'factors.fills': { statePath: 'fills', min: 0, max: 32, step: 1, module: 'raembl-factors', label: 'FILLS' },
    'factors.shift': { statePath: 'rotation', min: 0, max: 31, step: 1, module: 'raembl-factors', label: 'SHIFT' },
    'factors.accentAmt': { statePath: 'accentAmt', min: 0, max: 16, module: 'raembl-factors', label: '>', step: 1 },
    'factors.slideAmt': { statePath: 'slideAmt', min: 0, max: 16, module: 'raembl-factors', label: 'SLIDE', step: 1 },
    'factors.trillAmt': { statePath: 'trillAmt', min: 0, max: 16, module: 'raembl-factors', label: 'TR', step: 1 },
    'factors.gateLength': { statePath: 'gateLength', min: 5, max: 100, module: 'raembl-factors', label: 'GATE' },
    // LFO (Main)
    'lfo.amp': { statePath: 'lfoAmp', min: 0, max: 100, module: 'raembl-lfo', label: 'AMP' },
    'lfo.freq': { statePath: 'lfoFreq', min: 0, max: 100, module: 'raembl-lfo', label: 'FREQ' },
    'lfo.waveform': { statePath: 'lfoWaveform', min: 0, max: 100, module: 'raembl-lfo', label: 'WAVE' },
    'lfo.offset': { statePath: 'lfoOffset', min: -100, max: 100, module: 'raembl-lfo', label: 'OFFSET' },
    // Path
    'path.scale': { statePath: 'scale', min: 0, max: 31, step:1, module: 'raembl-path', label: 'SCALE' }, // Max depends on scales array length
    'path.root': { statePath: 'root', min: 0, max: 11, step:1, module: 'raembl-path', label: 'ROOT' },
    'path.probability': { statePath: 'probability', min: 0, max: 100, module: 'raembl-path', label: 'PROB' },
    // Reverb
    'reverb.mix': { statePath: 'reverbMix', min: 0, max: 100, module: 'raembl-reverb', label: 'SEND', modulatable: true },
    'reverb.preDelay': { statePath: 'preDelay', min: 0, max: 100, module: 'raembl-reverb', label: 'PRED', modulatable: true },
    'reverb.decay': { statePath: 'reverbDecay', min: 0, max: 100, module: 'raembl-reverb', label: 'DEC', modulatable: true },
    'reverb.diffusion': { statePath: 'diffusion', min: 0, max: 100, module: 'raembl-reverb', label: 'DIFF', modulatable: true },
    'reverb.damping': { statePath: 'damping', min: 0, max: 100, module: 'raembl-reverb', label: 'DAMP', modulatable: true },
    // Delay
    'delay.mix': { statePath: 'delayMix', min: 0, max: 100, module: 'raembl-delay', label: 'SEND', modulatable: true },
    'delay.time': { // This ID now refers to either sync or free time based on state.delaySyncEnabled
        statePath: 'delayTime', // Default path, logic in faderState/updateParameterById will handle routing
        min: 0, max: 100, module: 'raembl-delay', label: 'TIME', modulatable: true
    },
    'delay.feedback': { statePath: 'feedback', min: 0, max: 100, module: 'raembl-delay', label: 'FDBK', modulatable: true },
    'delay.wow': { statePath: 'wow', min: 0, max: 100, module: 'raembl-delay', label: 'WOW', modulatable: true },
    'delay.flutter': { statePath: 'flutter', min: 0, max: 100, module: 'raembl-delay', label: 'FLUT', modulatable: true },
    'delay.saturation': { statePath: 'saturation', min: 0, max: 100, module: 'raembl-delay', label: 'SAT', modulatable: true },
    'delay.syncEnabled': { statePath: 'delaySyncEnabled', type: 'boolean', module: 'raembl-delay', label: 'SYNC_TOGGLE' }, // Not a fader
    // Mod LFO
    'modLfo.rate': { statePath: 'modLfoRate', min: 0, max: 100, module: 'raembl-mod', label: 'RATE', modulatable: true },
    'modLfo.waveform': { statePath: 'modLfoWaveform', min: 0, max: 100, step: 25, module: 'raembl-mod', label: 'WAVE', modulatable: true },
    // Oscillator
    'osc.oct': { statePath: 'mainTransposition', min: 0, max: 8, step: 1, module: 'raembl-oscillator', label: 'OCT', modulatable: true },
    'osc.subOct': { statePath: 'subTransposition', min: 0, max: 8, step: 1, module: 'raembl-oscillator', label: 'SUB OCT', modulatable: true },
    'osc.drift': { statePath: 'drift', min: 0, max: 100, module: 'raembl-oscillator', label: 'DRIFT', modulatable: true },
    'osc.glide': { statePath: 'glide', min: 0, max: 100, module: 'raembl-oscillator', label: 'GLIDE', modulatable: true },
    'osc.pulseWidth': { statePath: 'pulseWidth', min: 5, max: 95, module: 'raembl-oscillator', label: 'WIDTH', modulatable: true },
    'osc.pwmAmount': { statePath: 'pwmAmount', min: 0, max: 100, module: 'raembl-oscillator', label: 'PWM', modulatable: true },
    'osc.pitchMod': { statePath: 'pitchMod', min: 0, max: 100, module: 'raembl-oscillator', label: 'MOD', modulatable: true },
    // Mixer
    'mixer.sawLevel': { statePath: 'sawLevel', min: 0, max: 100, module: 'raembl-mixer', label: '◢', modulatable: true },
    'mixer.squareLevel': { statePath: 'squareLevel', min: 0, max: 100, module: 'raembl-mixer', label: '⊓', modulatable: true },
    'mixer.triangleLevel': { statePath: 'triangleLevel', min: 0, max: 100, module: 'raembl-mixer', label: '△', modulatable: true },
    'mixer.subLevel': { statePath: 'subLevel', min: 0, max: 100, module: 'raembl-mixer', label: '■', modulatable: true },
    'mixer.noiseLevel': { statePath: 'noiseLevel', min: 0, max: 100, module: 'raembl-mixer', label: '≋', modulatable: true },
    // Filter
    'filter.highPass': { statePath: 'highPass', min: 0, max: 100, module: 'raembl-filter', label: 'HP', modulatable: true },
    'filter.lowPass': { statePath: 'lowPass', min: 0, max: 100, module: 'raembl-filter', label: 'LP', modulatable: true },
    'filter.resonance': { statePath: 'resonance', min: 0, max: 100, module: 'raembl-filter', label: 'RES', modulatable: true },
    'filter.keyFollow': { statePath: 'keyFollow', min: 0, max: 100, module: 'raembl-filter', label: 'KEY', modulatable: true },
    'filter.envAmount': { statePath: 'envAmount', min: 0, max: 100, module: 'raembl-filter', label: 'ENV', modulatable: true },
    'filter.mod': { statePath: 'filterMod', min: 0, max: 100, module: 'raembl-filter', label: 'MOD', modulatable: true },
    // Envelope
    'envelope.attack': { statePath: 'attack', min: 0, max: 100, module: 'raembl-envelope', label: 'A', modulatable: true },
    'envelope.decay': { statePath: 'decay', min: 0, max: 100, module: 'raembl-envelope', label: 'D', modulatable: true },
    'envelope.sustain': { statePath: 'sustain', min: 0, max: 100, module: 'raembl-envelope', label: 'S', modulatable: true },
    'envelope.release': { statePath: 'release', min: 0, max: 100, module: 'raembl-envelope', label: 'R', modulatable: true },
    // Output
    'output.volume': { statePath: 'volume', min: 0, max: 100, module: 'raembl-output', label: 'VOL' },
    // Clouds (Granular Processor)
    'clouds.pitch': { statePath: 'cloudsPitch', min: 0, max: 100, module: 'raembl-clouds', label: 'PITCH', modulatable: true },
    'clouds.position': { statePath: 'cloudsPosition', min: 0, max: 100, module: 'raembl-clouds', label: 'POS', modulatable: true },
    'clouds.density': { statePath: 'cloudsDensity', min: 0, max: 100, module: 'raembl-clouds', label: 'DENS', modulatable: true },
    'clouds.size': { statePath: 'cloudsSize', min: 0, max: 100, module: 'raembl-clouds', label: 'SIZE', modulatable: true },
    'clouds.texture': { statePath: 'cloudsTexture', min: 0, max: 100, module: 'raembl-clouds', label: 'TEX', modulatable: true },
    'clouds.dryWet': { statePath: 'cloudsDryWet', min: 0, max: 100, module: 'raembl-clouds', label: 'D/W', modulatable: true },
    'clouds.spread': { statePath: 'cloudsSpread', min: 0, max: 100, module: 'raembl-clouds', label: 'SPRD', modulatable: true },
    'clouds.feedback': { statePath: 'cloudsFeedback', min: 0, max: 100, module: 'raembl-clouds', label: 'FB', modulatable: true },
    'clouds.reverb': { statePath: 'cloudsReverb', min: 0, max: 100, module: 'raembl-clouds', label: 'VERB', modulatable: true },
    'clouds.inputGain': { statePath: 'cloudsInputGain', min: 0, max: 100, module: 'raembl-clouds', label: 'GAIN', modulatable: true },
    // Plaits (Multi-Engine Synthesiser)
    'plaits.model': { statePath: 'plaitsEngine', min: 1, max: 24, step: 1, module: 'raembl-oscillator', label: 'MDL', modulatable: true },
    'plaits.harmonics': { statePath: 'plaitsHarmonics', min: 0, max: 100, module: 'raembl-oscillator', label: 'HARM', modulatable: true },
    'plaits.timbre': { statePath: 'plaitsTimbre', min: 0, max: 100, module: 'raembl-oscillator', label: 'TIMB', modulatable: true },
    'plaits.morph': { statePath: 'plaitsMorph', min: 0, max: 100, module: 'raembl-oscillator', label: 'MORPH', modulatable: true },
    'plaits.lpgDecay': { statePath: 'plaitsLpgDecay', min: 0, max: 100, module: 'raembl-oscillator', label: 'DEC', modulatable: true },
    'plaits.lpgColour': { statePath: 'plaitsLpgColour', min: 0, max: 100, module: 'raembl-oscillator', label: 'COL', modulatable: true },
    'plaits.mixOutAux': { statePath: 'plaitsMixOutAux', min: 0, max: 100, module: 'raembl-mixer', label: 'MIX', modulatable: true },
    // Rings (Physical Modelling Resonator)
    'rings.model': { statePath: 'ringsModel', min: 0, max: 5, step: 1, module: 'raembl-oscillator', label: 'MDL', modulatable: false },
    'rings.polyphony': { statePath: 'ringsPolyphony', min: 1, max: 4, step: 1, module: 'raembl-oscillator', label: 'POLY', modulatable: false },
    'rings.structure': { statePath: 'ringsStructure', min: 0, max: 100, module: 'raembl-oscillator', label: 'STRUC', modulatable: true },
    'rings.brightness': { statePath: 'ringsBrightness', min: 0, max: 100, module: 'raembl-oscillator', label: 'BRIT', modulatable: true },
    'rings.damping': { statePath: 'ringsDamping', min: 0, max: 100, module: 'raembl-oscillator', label: 'DAMP', modulatable: true },
    'rings.position': { statePath: 'ringsPosition', min: 0, max: 100, module: 'raembl-oscillator', label: 'POS', modulatable: true },
    'rings.mixStrum': { statePath: 'ringsMixStrum', min: 0, max: 100, module: 'raembl-mixer', label: 'STRM', modulatable: true },
};

// Register state with merged state manager and export the proxy
export const state = registerRaemblState(localState);

// Note: parameterDefinitions uses the exported state proxy for all operations.