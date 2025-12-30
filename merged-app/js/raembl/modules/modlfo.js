// File: js/modules/modlfo.js
// ModLFO module implementation - REVISED FOR TRUE POLYPHONY FILTER MOD & GLIDE/PITCH MOD FIX
// UPDATED to export getWaveformIcon
import { state } from '../state.js';
import { getNoteFrequency, getMainTranspositionRatio, getSubTranspositionRatio } from '../audio/voice.js';
import { config } from '../config.js'; // Import config for audioContext time and voices array
import { applyPerParamModulations, updateModulationVisualFeedback } from './perParamMod.js';

const RAMP_TIME_CONSTANT_MOD = 0.005; // For smooth modulation changes

// --- getWaveformIcon function ---
export function getWaveformIcon(waveIndex) {
    const svgIcons = [
        // SIN
        `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,6 C4,2 8,2 12,6 C16,10 20,10 23,6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        // RAMP
        `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,10 L12,2 L12,10 L23,2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        // SQUARE
        `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,10 L1,10 L7,10 L7,2 L17,2 L17,10 L23,10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        // NOISE
        `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,5 L4,8 L6,3 L9,11 L11,4 L14,9 L16,2 L19,7 L23,6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
        // S&H
        `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,4 L4,4 L4,8 L8,8 L8,2 L12,2 L12,10 L16,10 L16,6 L20,6 L20,4 L23,4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    ];
    const index = Math.max(0, Math.min(waveIndex, svgIcons.length - 1));
    return svgIcons[index];
}

// --- Noise Buffer & S&H State ---
const persistentState = {
    noiseBuffer: [],
    noiseBufferSize: 4096,
    currentSampleValue: 0, // Global S&H value (for MONO mode or fallback)
    voiceSampleValues: new Map(), // Per-voice S&H values (for POLY mode)
    lastGateTime: 0,
    initialized: false
};

function initializeNoiseBuffer(){
    if(persistentState.initialized) return;
    persistentState.noiseBuffer = new Float32Array(persistentState.noiseBufferSize);
    for(let i=0; i < persistentState.noiseBufferSize; i++) {
        persistentState.noiseBuffer[i] = Math.random() * 2 - 1; // -1 to +1
    }
    // Simple low-pass filter on noise buffer for smoother continuous noise
    let prev = persistentState.noiseBuffer[0];
    for (let i = 1; i < persistentState.noiseBufferSize; i++) {
         persistentState.noiseBuffer[i] = 0.7 * persistentState.noiseBuffer[i] + 0.3 * prev;
         prev = persistentState.noiseBuffer[i];
    }
    persistentState.initialized = true;
    persistentState.currentSampleValue = persistentState.noiseBuffer[0];
    // console.log("MOD LFO Noise Buffer Initialized");
}

function getNoiseValue(phase){ // Phase 0-1
    if (!persistentState.initialized) initializeNoiseBuffer();
    const index = Math.floor(phase * persistentState.noiseBufferSize) % persistentState.noiseBufferSize;
    return persistentState.noiseBuffer[index];
}

// Handle gate trigger with voice ID
function handleGateTrigger(voiceId = null){ // voiceId is from the newly created/triggered voice
    if (!persistentState.initialized) initializeNoiseBuffer();
    persistentState.lastGateTime = performance.now();

    const waveIndex = Math.round(state.modLfoWaveform / 25);
    if (waveIndex === 4) { // S&H
        const randomIndex = Math.floor(Math.random() * persistentState.noiseBufferSize);
        const newSampleValue = persistentState.noiseBuffer[randomIndex]; // Value from -1 to 1

        if (!state.monoMode && voiceId) {
            persistentState.voiceSampleValues.set(voiceId, newSampleValue);
            // console.log(`POLY S&H: Voice ${voiceId} new sample ${newSampleValue.toFixed(3)}`);
        } else { // MONO mode or no voiceId (global trigger)
            persistentState.currentSampleValue = newSampleValue;
            // console.log(`MONO/Global S&H: New sample ${newSampleValue.toFixed(3)}`);
        }
    }
}

function documentGateTriggerHandler(event) {
    handleGateTrigger();
}

export { handleGateTrigger, documentGateTriggerHandler };


export function calculateModWaveValue(phase, voiceId = null){ // phase 0 to 1
    if (!persistentState.initialized) initializeNoiseBuffer();
    const waveIndex = Math.round(state.modLfoWaveform / 25);

    let value; // Will be in -1 to +1 range
    switch(waveIndex){
        case 0: value = Math.sin(phase * Math.PI * 2); break; // Sine
        case 1: value = 1 - 2 * phase; break; // Ramp (Saw Down)
        case 2: value = phase < 0.5 ? 1 : -1; break; // Square
        case 3: value = getNoiseValue(phase); break; // Noise (continuous smoothed)
        case 4: // S&H
            if (!state.monoMode && voiceId) {
                if (persistentState.voiceSampleValues.has(voiceId)) {
                    value = persistentState.voiceSampleValues.get(voiceId);
                } else {
                    const randomIndex = Math.floor(Math.random() * persistentState.noiseBufferSize);
                    const newInitialSampleValue = persistentState.noiseBuffer[randomIndex];
                    persistentState.voiceSampleValues.set(voiceId, newInitialSampleValue);
                    value = newInitialSampleValue;
                }
            } else {
                value = persistentState.currentSampleValue;
            }
            break;
        default: value = Math.sin(phase * Math.PI * 2); break;
    }
    return value;
}

const lfoState = {
    lastUpdateTime: performance.now(),
    accumulatedPhase: 0,
    // voicePhases: new Map(), // Not currently used, global phase for non-S&H
};

export function updateModLfoValue(voiceId = null){
    const now = performance.now();
    const deltaTime = now - lfoState.lastUpdateTime;
    lfoState.lastUpdateTime = now;

    const waveIndex = Math.round(state.modLfoWaveform / 25);
    const isSampleAndHold = (waveIndex === 4);

    if (!isSampleAndHold) {
        const ratePercentage = state.modLfoRate / 100;
        const minFreq = 0.1; const maxFreq = 20;
        const frequencyHz = minFreq * Math.pow(maxFreq / minFreq, ratePercentage);
        const periodMs = frequencyHz > 0.001 ? 1000 / frequencyHz : Infinity;

        if(periodMs === Infinity){
            lfoState.accumulatedPhase = 0;
        } else {
            lfoState.accumulatedPhase += (deltaTime / periodMs);
            lfoState.accumulatedPhase %= 1;
        }
    }

    const currentPhase = lfoState.accumulatedPhase;
    const rawLfoValue = calculateModWaveValue(currentPhase, voiceId);
    state.modLfoValue = 50 * (rawLfoValue + 1);

    // Update MOD rate LED
    updateModRateLed(currentPhase);

    return rawLfoValue;
}

function updateModRateLed(phase) {
    const led = document.getElementById('mod-rate-led');
    if (!led) return;

    // Calculate LED brightness based on LFO phase (pulse once per cycle)
    // Use sine wave for smooth pulsing: 0.3 (dim) to 1.0 (bright)
    const pulseBrightness = 0.3 + 0.7 * Math.sin(phase * Math.PI * 2);
    led.style.opacity = pulseBrightness;
}


function calculateEnvelopeValue(voice){
    if (!voice || !voice.audioStartTime || !config.audioContext) return 0;

    const now = config.audioContext.currentTime;
    const timeSinceStart = now - voice.audioStartTime;

    if (timeSinceStart < 0) return 0;

    const attackS = 0.001 + Math.pow(state.attack / 100, 2) * 3.999;
    const decayS = 0.001 + Math.pow(state.decay / 100, 2) * 9.999;
    const sustainLevel = state.sustain / 100;

    // Handle release phase
    if (voice.releaseStartTime) {
        const releaseS = 0.001 + Math.pow(state.release / 100, 2) * 9.999;
        const timeSinceRelease = now - voice.releaseStartTime;

        if (timeSinceRelease < 0) return 0; // Safety check

        // Calculate the envelope value at the moment release started
        const timeSinceStartAtRelease = voice.releaseStartTime - voice.audioStartTime;
        let releaseStartValue = 0;

        if (timeSinceStartAtRelease < attackS) {
            releaseStartValue = attackS > 0.001 ? Math.min(1.0, timeSinceStartAtRelease / attackS) : 1.0;
        } else {
            const timeIntoDecay = timeSinceStartAtRelease - attackS;
            const decayTimeConstant = Math.max(0.001, decayS / 4);
            releaseStartValue = sustainLevel + (1.0 - sustainLevel) * Math.exp(-timeIntoDecay / decayTimeConstant);
        }

        // Exponentially decay from releaseStartValue to 0
        const releaseTimeConstant = Math.max(0.001, releaseS / 4);
        const envelopeValue = releaseStartValue * Math.exp(-timeSinceRelease / releaseTimeConstant);
        return Math.max(0, Math.min(1, envelopeValue));
    }

    // Not in release - normal A-D-S calculation
    if (!voice.active) return 0; // Only return 0 if not active AND not in release

    let envelopeValue = 0;

    if (timeSinceStart < attackS) {
        envelopeValue = attackS > 0.001 ? Math.min(1.0, timeSinceStart / attackS) : 1.0;
    } else {
        const timeIntoDecay = timeSinceStart - attackS;
        const decayTimeConstant = Math.max(0.001, decayS / 4);
        envelopeValue = sustainLevel + (1.0 - sustainLevel) * Math.exp(-timeIntoDecay / decayTimeConstant);
    }
    return Math.max(0, Math.min(1, envelopeValue));
}


export function applyPwmModulation() {
    if (!config?.voices || !config?.audioContext || state.pwmAmount <= 0) {
        if (state.pwmAmount <= 0 && config.voices) {
            const now = config.audioContext.currentTime;
            const baseWidthPercent = Math.max(5, Math.min(95, state.pulseWidth));
            const baseOffset = (baseWidthPercent / 100 * 2) - 1;
            config.voices.forEach(voice => {
                if (voice?.active && voice._internalNodes?.squareWidthControl?.offset) {
                    try {
                        voice._internalNodes.squareWidthControl.offset.setTargetAtTime(baseOffset, now, RAMP_TIME_CONSTANT_MOD);
                    } catch (e) {}
                }
            });
        }
        return;
    }

    const voices = config.voices;
    if (!voices.length) return;
    const now = config.audioContext.currentTime;

    voices.forEach(voice => {
        if (!voice || (!voice.active && !voice.releaseStartTime)) return;

        const widthControl = voice._internalNodes?.squareWidthControl;
        if (widthControl?.offset) {
            try {
                const widthParam = widthControl.offset;
                const baseWidthPercent = Math.max(5, Math.min(95, state.pulseWidth));
                const baseOffset = (baseWidthPercent / 100 * 2) - 1;

                let modSourceValue;
                const pwmSourceIsLfo = state.pwmSource === 0;
                const pwmIntensity = state.pwmAmount / 100;

                if (pwmSourceIsLfo) {
                    modSourceValue = updateModLfoValue(voice.id);
                } else {
                    modSourceValue = calculateEnvelopeValue(voice);
                }

                let modulatedOffset;
                if (pwmSourceIsLfo) {
                    modulatedOffset = baseOffset + (modSourceValue * pwmIntensity * 0.9);
                } else {
                    const bipolarEnv = (modSourceValue * 2) -1;
                    modulatedOffset = baseOffset + (bipolarEnv * pwmIntensity * 0.9);
                }
                
                const targetOffset = Math.max(-0.9, Math.min(0.9, modulatedOffset));
                widthParam.setTargetAtTime(targetOffset, now, RAMP_TIME_CONSTANT_MOD);

            } catch (e) {
                console.warn(`Error applying PWM for voice ${voice.id}:`, e);
            }
        }
    });
}


export function applyFilterModulation() {
    // AUDIO-RATE ARCHITECTURE: Filter LFO now handled by per-voice OscillatorNodes
    // This function is kept for MONO mode compatibility and updating LFO frequencies

    if (!config?.audioContext) return;
    const now = config.audioContext.currentTime;

    // Calculate LFO frequency from modLfoRate
    const lfoRatePercent = state.modLfoRate / 100;
    const lfoFreqHz = 0.1 * Math.pow(20 / 0.1, lfoRatePercent); // 0.1 Hz to 20 Hz

    if (state.monoMode) {
        // MONO mode still uses k-rate modulation (TODO: migrate to audio-rate)
        if (!config.monoFilter) return;
        try {
            const filterNode = config.monoFilter;
            const lfoValueNormalized = updateModLfoValue(null);
            const currentTargetCutoff = config.baseLpCutoff || filterNode.frequency.value;
            const modDepth = state.filterMod / 100;
            const maxModOctaves = 5;
            const modOctaves = lfoValueNormalized * modDepth * maxModOctaves;
            const modulatedCutoff = Math.max(20, Math.min(20000, currentTargetCutoff * Math.pow(2, modOctaves)));

            // Rate-adaptive smoothing: Use longer time constants for slower LFO rates
            // At low rates (0.1 Hz), use ~10ms smoothing; at high rates (20 Hz), use ~5ms
            const adaptiveTimeConstant = Math.max(0.005, 0.01 * (1 - lfoRatePercent));
            filterNode.frequency.setTargetAtTime(modulatedCutoff, now, adaptiveTimeConstant);
        } catch (e) {
            console.warn("Error applying MONO filter LFO modulation:", e);
        }
    } else {
        // POLY mode: Update per-voice LFO oscillator frequencies
        if (!config.voices) return;
        config.voices.forEach(voice => {
            if (voice?.filterLfoOsc) {
                try {
                    voice.filterLfoOsc.frequency.setTargetAtTime(lfoFreqHz, now, 0.01);
                } catch (e) {
                    // Ignore errors from stopped oscillators
                }
            }
        });
    }
}


export function applyPitchModulation() {
    if (!config?.voices || !config?.audioContext || state.pitchMod <= 0) return;

    const voices = config.voices;
    if (!voices.length) return;
    const now = config.audioContext.currentTime;

    try {
        voices.forEach(voice => {
            if (!voice || (!voice.active && !voice.releaseStartTime) || voice.isGliding || voice.isSliding) {
                return;
            }

            let modSourceValue;
            const modSourceIsLfo = state.modSource === 0;

            if (modSourceIsLfo) {
                modSourceValue = updateModLfoValue(voice.id);
            } else {
                const envelopeValue = calculateEnvelopeValue(voice);
                modSourceValue = (envelopeValue * 2) - 1;
            }

            const maxSemitonesMod = 2;
            const pitchModIntensity = state.pitchMod / 100;
            const modSemitones = modSourceValue * pitchModIntensity * maxSemitonesMod;
            const pitchModRatio = Math.pow(2, modSemitones / 12);

            const oscTypesToModulate = ['saw', 'square', 'triangle'];

            oscTypesToModulate.forEach(oscTypeName => {
                const oscNode = voice._internalNodes[`${oscTypeName}Osc`];
                const freqParam = oscNode?.frequency;

                if (freqParam) {
                    const oscBaseFreqUntransposedDrifted = voice._internalNodes[`${oscTypeName}BaseFrequency`] || voice.baseNoteFreq;
                    if (!oscBaseFreqUntransposedDrifted) return;
                    const currentTranspositionRatio = getMainTranspositionRatio();
                    const currentTransposedFreq = oscBaseFreqUntransposedDrifted * currentTranspositionRatio;
                    let finalFreq = currentTransposedFreq * pitchModRatio;
                    finalFreq = Math.max(10, Math.min(config.audioContext.sampleRate / 2, finalFreq));
                    freqParam.setTargetAtTime(finalFreq, now, RAMP_TIME_CONSTANT_MOD);
                }
            });
        });
    } catch (e) {
        console.warn("Error in applyPitchModulation loop:", e);
    }
}


export function applyAllModulations(){
    applyPwmModulation();
    applyFilterModulation();
    applyPitchModulation();
}

export function initModLfo(){
    initializeNoiseBuffer();
    document.addEventListener("gateTriggered", documentGateTriggerHandler);

    window.cleanupVoiceSampleValues = function(voiceId) {
        if (voiceId && persistentState.voiceSampleValues.has(voiceId)) {
            persistentState.voiceSampleValues.delete(voiceId);
        }
    };

    let modLfoAnimationFrameId = null;

    function modLoop() {
        updateModLfoValue(); // Update global state.modLfoValue for UI
        applyAllModulations();
        applyPerParamModulations(); // Per-parameter modulation system (k-rate, 30 FPS throttled)
        updateModulationVisualFeedback(); // Update visual feedback for modulated parameters
        window._modLfoAnimationFrameId = requestAnimationFrame(modLoop);
        modLfoAnimationFrameId = window._modLfoAnimationFrameId;
    }

    if (window._modLfoAnimationFrameId) {
        try {
            cancelAnimationFrame(window._modLfoAnimationFrameId);
        } catch (e) { /* ignore */ }
    }
    modLoop();
}