// File: js/audio/effects.js
// Audio effects processing - Corrected import and usage of getKeyTrackingFactor & LFO start logic
// UPDATED FOR: Delay Saturation Curve, Reverb Crossfading, Delay Sync/Free Toggle
import { state } from '../state.js';
import { config } from '../config.js'; // config.effectsLfosStarted will be used
import { config as baengConfig } from '../../baeng/config.js'; // For sidechain ducking gains
import { mapRange } from '../utils.js';
// Import calculateKeyTrackedBaseCutoff from voice.js
import { getNoteFrequency, getKeyTrackingFactor, calculateKeyTrackedBaseCutoff } from './voice.js';

const REFERENCE_FREQ_KEYTRACK = 130.81; // Approx C3 for key tracking reference
const RAMP_TIME_CONSTANT_EFFECTS = 0.01; // General ramp time for effect parameter changes
const REVERB_CROSSFADE_DURATION = 0.02; // 20ms for reverb crossfade

// Delay Time Divisions (sorted shortest to longest)
export const delayDivisionsValues = [
    1/32,      // 62.5 ms   @ 120 BPM - 1/32
    1/16,      // 125 ms              - 1/16
    1/12,      // 167 ms              - 1/16T (triplet)
    1/8,       // 250 ms              - 1/8
    1/6,       // 333 ms              - 1/8T (triplet)
    3/16,      // 375 ms              - 1/16D (dotted)
    1/4,       // 500 ms              - 1/4
    1/3,       // 667 ms              - 1/4T (triplet)
    3/8,       // 750 ms              - 1/8D (dotted)
    1/2,       // 1000 ms             - 1/2
    3/4,       // 1500 ms             - 1/4D (dotted)
    1          // 2000 ms             - 1 (whole note)
];


// Saturation Curve function - MODIFIED to take k_val directly
function makeSaturationCurve(k_val) {
    const n_samples = 4096;
    const curve = new Float32Array(n_samples);
    const gainAtOrigin = 1 + k_val; // Gain for small signals

    for (let i = 0; i < n_samples; ++i) {
        let x = i * 2 / n_samples - 1;
        // Formula with gain: y = ( (1+k)*x ) / ( 1 + k*Math.abs(x) )
        // To avoid division by zero if k_val is -1 (though we control k_val to be >= 0)
        const denominator = 1 + k_val * Math.abs(x);
        if (Math.abs(denominator) < 1e-6) { // Avoid division by zero or very small numbers
            curve[i] = x > 0 ? 1 : (x < 0 ? -1 : 0); // Hard clip if denominator is too small
        } else {
            curve[i] = (gainAtOrigin * x) / denominator;
        }
    }
    return curve;
}


// Initialize reverb - MODIFIED for crossfading
export function initReverb() {
    if (!config.audioContext || !config.masterGain) { console.error("Audio context or masterGain not available for reverb."); return; }

    config.reverbSendGain = config.audioContext.createGain();
    config.reverbSendGain.gain.value = 0;

    // Create two convolvers and their respective wet gain nodes
    config.convolvers = [
        config.audioContext.createConvolver(),
        config.audioContext.createConvolver()
    ];
    config.convolverWetGains = [
        config.audioContext.createGain(),
        config.audioContext.createGain()
    ];

    config.activeConvolverIndex = 0; // Start with the first convolver

    // Connect send to both convolvers
    config.reverbSendGain.connect(config.convolvers[0]);
    config.reverbSendGain.connect(config.convolvers[1]);

    // Connect convolvers to their respective wet gains
    config.convolvers[0].connect(config.convolverWetGains[0]);
    config.convolvers[1].connect(config.convolverWetGains[1]);

    // Connect wet gains through ducking gain to master gain
    if (baengConfig.duckingGains?.raemblReverb) {
        config.convolverWetGains[0].connect(baengConfig.duckingGains.raemblReverb);
        config.convolverWetGains[1].connect(baengConfig.duckingGains.raemblReverb);
        baengConfig.duckingGains.raemblReverb.connect(config.masterGain);
    } else {
        // Fallback: direct connection if ducking not initialised
        config.convolverWetGains[0].connect(config.masterGain);
        config.convolverWetGains[1].connect(config.masterGain);
    }

    // Connect wet gains to reverb analyser tap for oscilloscope visualization
    if (config.reverbTap) {
        config.convolverWetGains[0].connect(config.reverbTap);
        config.convolverWetGains[1].connect(config.reverbTap);
    } else {
        console.warn("reverbTap not available - oscilloscope will show no signal");
    }

    // Initialize gains: one active, one silent
    config.convolverWetGains[0].gain.value = 1.0; // Active one
    config.convolverWetGains[1].gain.value = 0.0; // Inactive one

    updateReverbImpulseResponse(true); // Pass true for initial setup
    updateReverbSendLevel();
    // console.log("Reverb initialized with crossfading.");
}

// MODIFIED for crossfading
export function updateReverbImpulseResponse(isInitialSetup = false) {
    if (!config.convolvers || !config.audioContext) return;

    const now = config.audioContext.currentTime;

    const sampleRate = config.audioContext.sampleRate;
    const decayTime = mapRange(state.reverbDecay, 0, 100, 0.1, 5);
    const preDelayTime = mapRange(state.preDelay, 0, 100, 0, 0.2);
    const diffusion = state.diffusion / 100;
    const damping = state.damping / 100;

    const length = Math.max(1, Math.floor(sampleRate * decayTime));
    if (length <= 1 && !isInitialSetup) { // Only create tiny buffer if not initial setup and length is too small
        try {
            const dummyBuffer = config.audioContext.createBuffer(2, 1, sampleRate);
            config.convolvers[0].buffer = dummyBuffer; // Set on both to be safe
            config.convolvers[1].buffer = dummyBuffer;
        } catch(e){}
        return;
    }
    const impulse = config.audioContext.createBuffer(2, length, sampleRate);
    const left = impulse.getChannelData(0);
    const right = impulse.getChannelData(1);
    const preDelaySamples = Math.floor(preDelayTime * sampleRate);

    for (let i = 0; i < length; i++) {
        if (i < preDelaySamples) {
            left[i] = 0;
            right[i] = 0;
        } else {
            const t = (i - preDelaySamples) / Math.max(1, length - preDelaySamples);
            const envelope = Math.pow(1 - t, 2.0 + (diffusion * 2));

            let noiseL = (Math.random() * 2 - 1) * envelope;
            let noiseR = (Math.random() * 2 - 1) * envelope;

            const dampingEffect = Math.exp(-t * damping * 5);
            noiseL *= dampingEffect;
            noiseR *= dampingEffect;

            left[i] = noiseL;
            right[i] = (noiseR + (Math.random() * 0.1 - 0.05) * envelope) * 0.95;
        }
    }

    const inactiveIndex = 1 - config.activeConvolverIndex;
    const targetConvolver = config.convolvers[inactiveIndex];
    
    try {
        targetConvolver.buffer = impulse;
    } catch (e) {
        console.error("Error setting reverb buffer:", e);
        try { targetConvolver.buffer = config.audioContext.createBuffer(2, 1, sampleRate); } catch(e2) {}
        return;
    }

    if (!isInitialSetup) {
        const activeGainNode = config.convolverWetGains[config.activeConvolverIndex].gain;
        const inactiveGainNode = config.convolverWetGains[inactiveIndex].gain;

        activeGainNode.cancelScheduledValues(now);
        activeGainNode.setValueAtTime(activeGainNode.value, now);
        activeGainNode.linearRampToValueAtTime(0, now + REVERB_CROSSFADE_DURATION);

        inactiveGainNode.cancelScheduledValues(now);
        inactiveGainNode.setValueAtTime(0, now);
        inactiveGainNode.linearRampToValueAtTime(1.0, now + REVERB_CROSSFADE_DURATION);
        
        config.activeConvolverIndex = inactiveIndex;
    } else {
        // For initial setup, just set the buffer on the initially active convolver
        config.convolvers[config.activeConvolverIndex].buffer = impulse;
    }
}


export function updateReverbSendLevel() {
    if (!config.reverbSendGain || !config.audioContext) return;
    const sendLevel = state.reverbMix / 100;
    const now = config.audioContext.currentTime;
    try {
        config.reverbSendGain.gain.setTargetAtTime(sendLevel, now, RAMP_TIME_CONSTANT_EFFECTS);
    } catch(e) { console.error("Error setting reverb send level:", e); }
}

export function updateReverb() {
    if (!config.convolvers || !config.audioContext) return;
    updateReverbImpulseResponse();
    updateReverbSendLevel();
}

// MODIFIED for saturation compensation gain
export function initDelay() {
    if (!config.audioContext || !config.masterGain) { console.error("Audio context or masterGain not available for delay."); return; }

    config.delay = config.audioContext.createDelay(5.0); // Max delay time 5s
    config.delayFeedback = config.audioContext.createGain();
    config.saturation = config.audioContext.createWaveShaper();
    try { config.saturation.curve = makeSaturationCurve(0); } catch(e){} // Initial curve with k=0
    config.saturation.oversample = '4x';

    // Saturation compensation gain
    config.saturationCompGain = config.audioContext.createGain();
    config.saturationCompGain.gain.value = 1.0;

    config.wowLFO = config.audioContext.createOscillator();
    config.wowGain = config.audioContext.createGain();
    config.flutterLFO = config.audioContext.createOscillator();
    config.flutterGain = config.audioContext.createGain();

    config.delaySendGain = config.audioContext.createGain();
    config.delaySendGain.gain.value = 0;
    config.delayWetGain = config.audioContext.createGain();
    config.delayWetGain.gain.value = 1.0;

    // Connections
    config.delaySendGain.connect(config.delay);
    config.delay.connect(config.saturation);
    config.saturation.connect(config.saturationCompGain); // Saturation output to comp gain
    config.saturationCompGain.connect(config.delayWetGain); // Comp gain to wet output
    // Connect through ducking gain to master gain
    if (baengConfig.duckingGains?.raemblDelay) {
        config.delayWetGain.connect(baengConfig.duckingGains.raemblDelay);
        baengConfig.duckingGains.raemblDelay.connect(config.masterGain);
    } else {
        // Fallback: direct connection if ducking not initialised
        config.delayWetGain.connect(config.masterGain);
    }

    config.saturationCompGain.connect(config.delayFeedback); // Comp gain to feedback input
    config.delayFeedback.connect(config.delay);      // Feedback connects back to delay input

    config.wowLFO.type = 'sine'; config.wowLFO.frequency.value = 0.2;
    config.wowGain.gain.value = 0;
    config.wowLFO.connect(config.wowGain);
    try { config.wowGain.connect(config.delay.delayTime); } catch (e) { console.warn("Could not connect wowLFO to delayTime", e); }

    config.flutterLFO.type = 'sine'; config.flutterLFO.frequency.value = 6;
    config.flutterGain.gain.value = 0;
    config.flutterLFO.connect(config.flutterGain);
    try { config.flutterGain.connect(config.delay.delayTime); } catch (e) { console.warn("Could not connect flutterLFO to delayTime", e); }

    config.isSaturationBypassed = undefined;

    // Create tap system for visualization
    // Each tap is connected in parallel from the saturation comp output to capture each delay repeat
    config.delayTaps = [];
    config.delayTapAnalysers = [];
    config.delayTapGains = [];

    // Create parallel taps from saturation comp output (for visualization only)
    // These taps don't affect the audio - they just visualize it
    for (let i = 0; i < config.maxDelayTaps; i++) {
        const tap = config.audioContext.createDelay(5.0);
        const tapGain = config.audioContext.createGain();
        const tapAnalyser = config.audioContext.createAnalyser();

        // Configure analyser for oscilloscope visualization
        tapAnalyser.fftSize = 256; // Smaller for performance
        tapAnalyser.smoothingTimeConstant = 0;

        // Calculate tap delay time (cumulative: tap[0]=0ms for 1st repeat, tap[1]=1×delay for 2nd repeat, etc.)
        // Will be updated in updateDelay()
        tap.delayTime.value = 0;

        // Set tap gain to 1.0 (not affecting audio, just for visualization)
        tapGain.gain.value = 1.0;

        // Connect: saturationCompGain -> tap -> tapGain -> analyser (visualization only, no audio output)
        config.saturationCompGain.connect(tap);
        tap.connect(tapGain);
        tapGain.connect(tapAnalyser); // For visualization only

        config.delayTaps.push(tap);
        config.delayTapGains.push(tapGain);
        config.delayTapAnalysers.push(tapAnalyser);
    }

    updateDelay();
    // LFOs will be started by startEffectsLFOs()
    // console.log("Delay initialized (LFOs not started yet).");
}

export function startEffectsLFOs() {
    if (config.audioContext && config.audioContext.state === 'running' && !config.effectsLfosStarted) {
        if (config.wowLFO) {
            try { config.wowLFO.start(); }
            catch (e) { if (e.name !== 'InvalidStateError') console.error("Error starting Wow LFO:", e); }
        }
        if (config.flutterLFO) {
            try { config.flutterLFO.start(); }
            catch (e) { if (e.name !== 'InvalidStateError') console.error("Error starting Flutter LFO:", e); }
        }
        config.effectsLfosStarted = true;
    }
}

// MODIFIED for new saturation curve, compensation, and sync/free toggle
export function updateDelay() {
    if (!config.delay || !config.delayFeedback || !config.delaySendGain || !config.delayWetGain || !config.audioContext) return;
    const now = config.audioContext.currentTime; const rampTime = RAMP_TIME_CONSTANT_EFFECTS;

    let actualDelayTimeSeconds;
    if (state.delaySyncEnabled) {
        const index = Math.min(Math.floor(state.delayTime / (100 / delayDivisionsValues.length)), delayDivisionsValues.length - 1);
        const division = delayDivisionsValues[index];
        const bps = state.bpm / 60;
        const beatDuration = (bps > 0) ? 1 / bps : Infinity; // Avoid division by zero if BPM is 0
        actualDelayTimeSeconds = (beatDuration === Infinity) ? 5.0 : division * beatDuration; // Max delay if BPM is 0
    } else {
        const minMs = 1;  // 1ms
        const maxMs = 4000; // 4 seconds
        const freeMs = mapRange(state.delayTimeFree, 0, 100, minMs, maxMs, true); // Exponential mapping for better feel
        actualDelayTimeSeconds = freeMs / 1000.0;
    }
    actualDelayTimeSeconds = Math.max(0.001, Math.min(5.0, actualDelayTimeSeconds)); // Clamp to delay node's capabilities

    try {
        config.delay.delayTime.cancelScheduledValues(now);
        config.delay.delayTime.setValueAtTime(config.delay.delayTime.value, now);
        config.delay.delayTime.linearRampToValueAtTime(actualDelayTimeSeconds, now + 0.2);
    } catch(e){ console.error("Error setting delay time:", e); }

    // Update tap delay times for visualization
    if (config.delayTaps && config.delayTaps.length > 0) {
        for (let i = 0; i < config.delayTaps.length; i++) {
            const tapDelayTime = actualDelayTimeSeconds * i;
            const clampedTapTime = Math.min(tapDelayTime, 5.0); // Clamp to max
            try {
                config.delayTaps[i].delayTime.cancelScheduledValues(now);
                config.delayTaps[i].delayTime.setValueAtTime(config.delayTaps[i].delayTime.value, now);
                config.delayTaps[i].delayTime.linearRampToValueAtTime(clampedTapTime, now + 0.2);
            } catch(e) {
                console.error(`Error setting tap ${i} delay time:`, e);
            }
        }
    }

    const wowDepth = mapRange(state.wow, 0, 100, 0, 0.005);
    const flutterDepth = mapRange(state.flutter, 0, 100, 0, 0.001);

    try {
        config.wowLFO.frequency.cancelScheduledValues(now);
        config.wowLFO.frequency.setValueAtTime(config.wowLFO.frequency.value, now);
        config.wowLFO.frequency.linearRampToValueAtTime(0.1 + (state.wow / 100) * 0.4, now + 0.2);
    } catch(e) {}
    try {
        config.wowGain.gain.cancelScheduledValues(now);
        config.wowGain.gain.setValueAtTime(config.wowGain.gain.value, now);
        config.wowGain.gain.linearRampToValueAtTime(wowDepth, now + 0.2);
    } catch(e) {}
    try {
        config.flutterLFO.frequency.cancelScheduledValues(now);
        config.flutterLFO.frequency.setValueAtTime(config.flutterLFO.frequency.value, now);
        config.flutterLFO.frequency.linearRampToValueAtTime(4 + (state.flutter / 100) * 4, now + 0.2);
    } catch(e) {}
    try {
        config.flutterGain.gain.cancelScheduledValues(now);
        config.flutterGain.gain.setValueAtTime(config.flutterGain.gain.value, now);
        config.flutterGain.gain.linearRampToValueAtTime(flutterDepth, now + 0.2);
    } catch(e) {}

    // --- Saturation Update ---
    const satAmountNormalized = state.saturation / 100;
    const MAX_K_FOR_SHAPE = 20; // Max k-value for saturation "hardness"
    const k_shape_factor = Math.pow(satAmountNormalized, 3) * MAX_K_FOR_SHAPE; // Power curve for gradual onset

    const isSaturationActive = state.saturation > 0;

    if (isSaturationActive) {
        if (config.isSaturationBypassed !== false) { // Switching to active or first time active
            try { config.delay.disconnect(config.saturationCompGain); } catch(e) { /* NOP, might not be connected if bypass was active */ }
            try { config.delay.disconnect(config.delayWetGain); } catch(e) { /* NOP */ }
            try { config.delay.disconnect(config.delayFeedback); } catch(e) { /* NOP */ }
            
            try {
                config.delay.connect(config.saturation); // delay -> saturation
                // saturation -> saturationCompGain -> delayWetGain (already connected in init)
                // saturation -> saturationCompGain -> delayFeedback (already connected in init)
            } catch(e) { console.warn("Error connecting saturation path during update", e); }
            config.isSaturationBypassed = false;
        }
        if (config.saturation) {
            config.saturation.curve = makeSaturationCurve(k_shape_factor);
        }
    } else { // Saturation is zero (bypassed)
        if (config.isSaturationBypassed !== true) { // Switching to bypassed or first time bypassed
            try { config.delay.disconnect(config.saturation); } catch(e) { /* NOP */ }
            // saturationCompGain is still in the path, but saturation node itself is bypassed
            // We need to connect delay directly to saturationCompGain if saturation is bypassed
            try {
                config.delay.connect(config.saturationCompGain); // delay -> saturationCompGain (bypass saturation node)
            } catch(e) { console.warn("Error connecting saturation bypass path during update", e); }
            config.isSaturationBypassed = true;
        }
        // When bypassed, the saturation curve doesn't matter, but comp gain should be 1
    }
    
    // Saturation Compensation Gain
    if (config.saturationCompGain) {
        let compensationFactor = 1.0;
        if (isSaturationActive) {
            const addedGainFactor = k_shape_factor; // The 'k' part of (1+k)
            // Compensate for a portion of the added gain to prevent excessive level boost with feedback
            // Compensate 75% of the k_shape_factor part of the gain.
            // If k_shape_factor is 0, compFactor is 1. If k_shape_factor is high, compFactor reduces gain.
            compensationFactor = 1.0 / (1 + addedGainFactor * 0.75);
        }
        config.saturationCompGain.gain.setTargetAtTime(compensationFactor, now, rampTime);
    }
    // --- End Saturation Update ---

    const feedback = mapRange(state.feedback, 0, 100, 0, 0.95); // Max feedback 95% to avoid trivial infinite loops without saturation
    try { config.delayFeedback.gain.setTargetAtTime(feedback, now, rampTime); } catch(e) {}

    const sendLevel = state.delayMix / 100;
    try { config.delaySendGain.gain.setTargetAtTime(sendLevel, now, rampTime); } catch(e) {}
}


export function initFilter() {
    if (!config.audioContext || !config.masterGain) { console.error("Audio context or masterGain not available for filter init."); return; }

    config.monoFilterInput = config.audioContext.createGain();
    config.monoFilterInput.gain.value = 1.0;

    config.monoHighPassFilter = config.audioContext.createBiquadFilter();
    config.monoHighPassFilter.type = 'highpass';
    config.monoHighPassFilter.frequency.value = 20;
    config.monoHighPassFilter.Q.value = 0.707;

    config.monoFilter = config.audioContext.createBiquadFilter();
    config.monoFilter.type = 'lowpass';
    config.monoFilter.frequency.value = 20000;
    config.monoFilter.Q.value = 1;

    config.monoFilterEnvModulator = config.audioContext.createGain();
    config.monoFilterEnvModulator.gain.value = 0;
    try {
        config.monoFilterEnvModulator.connect(config.monoFilter.frequency);
    } catch (e) {
        console.error("Error connecting MONO filter LFO modulator:", e);
    }

    config.monoFilterInput.connect(config.monoHighPassFilter);
    config.monoHighPassFilter.connect(config.monoFilter);

    // Connections to effects sends and master gain are handled by connectMonoPath/disconnectMonoPath in controls.js
    // and initially in main.js or audio.js after all nodes are created.

    updateFilter();
    // console.log("Shared Filter nodes initialized for MONO path.");
}


export function updateFilter() {
    if (!config.audioContext) return;
    const now = config.audioContext.currentTime;
    const rampTime = RAMP_TIME_CONSTANT_EFFECTS;

    const baseHpCutoff = mapRange(state.highPass, 0, 100, 20, 10000, true);
    const baseLpCutoffGlobal = mapRange(state.lowPass, 0, 100, 20, 20000, true);
    const resonance = mapRange(Math.pow(state.resonance / 100, 1.5), 0, 1, 0.7, 25);
    const hpResonance = Math.max(0.1, resonance * 0.5);

    if (state.monoMode) {
        if (!config.monoFilter || !config.monoHighPassFilter) return;

        try { config.monoHighPassFilter.frequency.setTargetAtTime(baseHpCutoff, now, rampTime); } catch(e){}
        try { config.monoHighPassFilter.Q.setTargetAtTime(hpResonance, now, rampTime); } catch(e){}

        let keyTrackedLpCutoff = baseLpCutoffGlobal;
        if (state.keyFollow > 0 && config.lastActiveNote) {
             const keyFollowFactor = getKeyTrackingFactor(config.lastActiveNote);
             keyTrackedLpCutoff = Math.min(20000, baseLpCutoffGlobal * keyFollowFactor);
        }

        let finalMonoLpTargetCutoff = keyTrackedLpCutoff;
        const envModAmount = state.envAmount / 100;

        if (envModAmount > 0 && config.voices.length > 0 && config.voices[0]?.active) {
            const envModFactor = Math.pow(2, envModAmount * 3);
            const peakTarget = Math.min(20000, keyTrackedLpCutoff * envModFactor);
            finalMonoLpTargetCutoff = keyTrackedLpCutoff + (peakTarget - keyTrackedLpCutoff) * (state.sustain / 100);
            finalMonoLpTargetCutoff = Math.min(20000, Math.max(20, finalMonoLpTargetCutoff));
        }

        config.baseLpCutoff = finalMonoLpTargetCutoff;

        try {
            if (!config.isFilterBoosting) {
                 config.monoFilter.frequency.setTargetAtTime(finalMonoLpTargetCutoff, now, rampTime);
            }
        } catch(e){}
        try { config.monoFilter.Q.setTargetAtTime(resonance, now, rampTime); } catch(e){}

    } else { // POLY MODE
        // === Skip Web Audio voice filter updates if using worklet ===
        if (config.useWorklet) {
            // Worklet handles filter updates via AudioParams
            // Global parameters already updated in faderState.js
            return;
        }

        // === Web Audio path ===
        config.voices.forEach(voice => {
            if (voice?.filterNodes?.lp && voice.filterNodes?.hp) {
                try {
                    voice.filterNodes.hp.frequency.setTargetAtTime(baseHpCutoff, now, rampTime);
                    voice.filterNodes.hp.Q.setTargetAtTime(hpResonance, now, rampTime);

                    // Update baseCutoff for reference
                    voice.baseCutoff = calculateKeyTrackedBaseCutoff(voice.note, state.lowPass, state.keyFollow);
                    voice.filterNodes.lp.Q.setTargetAtTime(resonance, now, rampTime);

                    // AUDIO-RATE ARCHITECTURE: Update modulation sources, not filter.frequency directly
                    if (voice.filterBaseCutoffSource) {
                        // Update base cutoff source (user knob + key tracking)
                        voice.filterBaseCutoffSource.offset.setTargetAtTime(voice.baseCutoff, now, rampTime);
                    }

                    if (voice.filterEnvelopeSource) {
                        // Update envelope depth based on new envAmount
                        const envModAmount = state.envAmount / 100;
                        const envModFactor = Math.pow(2, envModAmount * 6);
                        const envDepthHz = voice.baseCutoff * (envModFactor - 1);
                        voice.filterEnvelopeSource.offset.setTargetAtTime(envDepthHz, now, rampTime);
                    }

                    if (voice.filterLfoGain) {
                        // Update LFO depth based on new filterMod setting
                        const lfoDepthPercent = state.filterMod / 100;
                        const maxModOctaves = 2;
                        const lfoDepthHz = voice.baseCutoff * (Math.pow(2, maxModOctaves) - 1) * lfoDepthPercent;
                        voice.filterLfoGain.gain.setTargetAtTime(lfoDepthHz, now, rampTime);
                    }
                } catch (e) { console.warn(`Error updating POLY filter for voice ${voice.id}: ${e.message}`); }
            }
        });
    }
}