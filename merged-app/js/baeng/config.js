// File: js/config.js
// Configuration and shared resources

export const config = {
    // Audio context
    audioContext: null,
    masterGain: null,
    limiter: null,

    // Drum bus processor (replaces compressor + output)
    drumBusNode: null,
    busOutputAnalyser: null,

    // Sidechain ducking infrastructure
    sidechainTapGains: [],      // 6 GainNodes (0/1 per voice) for sidechain routing
    sidechainSumNode: null,     // GainNode summing selected voice taps
    sidechainAnalyser: null,    // AnalyserNode for envelope following
    duckingGains: {             // Per-effect ducking GainNodes
        baengReverb: null,
        baengDelay: null,
        raemblReverb: null,
        raemblDelay: null,
        raemblClouds: null
    },

    // Effects (input nodes for global effects)
    reverbNode: null,
    delayNode: null,
    waveguideNode: null,

    // Delay tap system for visualization
    delayTaps: [], // Array of DelayNodes for each repeat
    delayTapAnalysers: [], // Array of AnalyserNodes for each tap
    delayTapGains: [], // Array of GainNodes for each tap
    delayFeedbackGain: null, // Feedback gain node
    maxDelayTaps: 32, // Maximum number of delay taps to visualize (increased for high feedback + short delays)

    // Analysers for visualization
    voiceAnalysers: null, // Per-voice analysers for engine visualization
    
    // Current timing info (used by envelope generators, ratchet timing, etc.)
    currentMsPerStep: 125, // Default based on 120 BPM, 4 steps per beat, will be updated by time.js
    
    // Note: Choke group logic is now handled at the sequencer level
    
    // Initialization flag
    initialized: false,
    
    // Constants
    MAX_VOICES: 6,
    
    // Waveguide resonator types (index maps to value)
    // Used for UI display and logic in engine.js
    WAVEGUIDE_TYPES: ['Off', 'Tube', 'String'],
    
    // Waveform types (index maps to value)
    // Used for UI display and logic in engine.js
    WAVEFORM_TYPES: ['Sine', 'Triangle', 'Saw', 'Square', 'Noise']
};