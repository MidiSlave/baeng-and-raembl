// File: js/config.js - UPDATED for Clarity and MONO nodes
// Audio engine configuration
export const config = {
  // Audio settings
  audioContext: null,
  masterGain: null,
  limiter: null,
  sampleRate: 44100,

  // Analysers
  analyser: null, // Legacy reference
  analyserLeft: null,
  analyserRight: null,
  channelSplitter: null,
  drySignalAnalyser: null, // For effects visualizations
  drySignalTap: null, // Zero-gain tap for analyser (independent of effect sends)
  reverbAnalyser: null, // For reverb oscilloscope visualization
  reverbTap: null, // Unity gain tap for reverb analyser

  // Synth parameters
  voices: [],
  useWorklet: true, // Feature flag for AudioWorklet engine
  workletBridge: null, // WorkletBridge instance managing voice pool
  workletVoicePool: null, // Voice allocation tracker (managed by WorkletBridge)
  lastNoteFrequency: null,
  lastActiveNote: null, // Added for effects.js keytracking reference

  // --- MONO Mode Shared Nodes ---
  monoFilterInput: null,
  monoHighPassFilter: null,
  monoFilter: null,
  monoFilterEnvModulator: null,

  // --- Effects Nodes (Common to both MONO/POLY outputs) ---
  reverbSendGain: null,
  reverbWetGain: null,
  reverb: null,
  delaySendGain: null,
  delayWetGain: null,
  delay: null,
  delayFeedback: null,
  saturation: null,
  saturationCompGain: null, // Saturation compensation gain
  wowLFO: null,
  wowGain: null,
  flutterLFO: null,
  flutterGain: null,
  effectsLfosStarted: false,
  isSaturationBypassed: undefined, // For delay saturation bypass state

  // Delay tap system for visualization
  delayTaps: [], // Array of DelayNodes for each repeat
  delayTapAnalysers: [], // Array of AnalyserNodes for each tap
  delayTapGains: [], // Array of GainNodes for each tap
  maxDelayTaps: 47, // Maximum number of delay taps to visualize (increased for full canvas coverage)

  // Other state needed by audio modules
  baseLpCutoff: 20000, // For MONO filter target, updated by updateFilter
  isFilterBoosting: false, // For MONO filter accent
  filterBoostTimeoutId: null, // Timeout ID for filter accent reset

  // Init flag
  initialized: false
};

// Colors configuration for theme-aware rendering
export const colors = {
    get canvasBg() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? '#f5f5f5' : '#0A0A0A';
    },
    get canvasBgAlt() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? '#f0f0f0' : '#0A0A0A';
    },
    get yellow() {
        // Get current theme color from CSS variable
        const hex = getComputedStyle(document.documentElement)
            .getPropertyValue('--theme-color').trim();
        return hex || '#FFDC32';
    },
    get yellowRGB() {
        // Get RGB values for canvas rendering with alpha
        const r = parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--theme-color-r').trim()) || 255;
        const g = parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--theme-color-g').trim()) || 220;
        const b = parseInt(getComputedStyle(document.documentElement)
            .getPropertyValue('--theme-color-b').trim()) || 50;
        return { r, g, b };
    },
    get oscilloscope() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? '#ffffff' : '#000000';
    },
    get grid1() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? '#cccccc' : '#333333';
    },
    get grid2() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? '#bbbbbb' : '#444444';
    },
    get grid3() {
        return document.documentElement.getAttribute('data-theme') === 'light' ? '#aaaaaa' : '#555555';
    }
};