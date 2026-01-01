/**
 * Sidechain Ducking System
 *
 * Provides sidechain ducking for effects (reverb, delay, Clouds) triggered by Bæng drum voices.
 * Uses envelope follower approach since Web Audio's DynamicsCompressorNode doesn't support
 * external sidechain input.
 *
 * Architecture:
 * Voice Panners [0-5] → sidechainTapGains[i] (0/1) → sidechainSumNode → AnalyserNode
 *                                                                           ↓
 *                                                              RAF envelope follower
 *                                                                           ↓
 *                                                              duckingGain.gain automation
 *                                                                           ↓
 * Effect Output → duckingGainNode → masterGain
 */

import { config } from '../config.js';
import { state } from '../state.js';

let duckingLoopId = null;
let duckingLoopRunning = false;

/**
 * Initialise the sidechain bus (6 tap gains + sum node + analyser)
 * Call this during initEngine() before effects are created
 * @param {AudioContext} ctx - The audio context
 */
export function initSidechainBus(ctx) {
    // Create 6 tap gains (default 0 = not contributing to sidechain)
    config.sidechainTapGains = [];
    for (let i = 0; i < 6; i++) {
        const tap = ctx.createGain();
        tap.gain.value = 0; // Default: voice doesn't contribute to sidechain
        config.sidechainTapGains.push(tap);
    }

    // Sum node collects all selected voice taps
    config.sidechainSumNode = ctx.createGain();
    config.sidechainTapGains.forEach(tap => tap.connect(config.sidechainSumNode));

    // Analyser for envelope following (small FFT for fast response)
    config.sidechainAnalyser = ctx.createAnalyser();
    config.sidechainAnalyser.fftSize = 256;
    config.sidechainAnalyser.smoothingTimeConstant = 0.5;
    config.sidechainSumNode.connect(config.sidechainAnalyser);

    // Initialise ducking gain nodes for each effect (will be connected in initEffects)
    config.duckingGains = {
        baengReverb: ctx.createGain(),
        baengDelay: ctx.createGain(),
        baengClouds: ctx.createGain(),
        raemblReverb: ctx.createGain(),
        raemblDelay: ctx.createGain(),
        raemblClouds: ctx.createGain()
    };

    // Initialise per-effect analysers for ducked output waveform visualisation
    config.duckingAnalysers = {
        baengReverb: ctx.createAnalyser(),
        baengDelay: ctx.createAnalyser(),
        baengClouds: ctx.createAnalyser(),
        raemblReverb: ctx.createAnalyser(),
        raemblDelay: ctx.createAnalyser(),
        raemblClouds: ctx.createAnalyser()
    };

    // Configure analysers (small FFT for responsive waveform)
    Object.values(config.duckingAnalysers).forEach(analyser => {
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
    });

    // Connect ducking gains to their analysers (analysers tap the signal passively)
    // The analysers will show the ducked output waveform
    Object.keys(config.duckingGains).forEach(key => {
        config.duckingGains[key].connect(config.duckingAnalysers[key]);
    });

}

/**
 * Update which voices contribute to the sidechain sum
 * Called when ducking voice selection changes in UI
 */
export function updateSidechainTaps() {
    if (!config.sidechainTapGains || config.sidechainTapGains.length === 0) return;

    const ctx = config.audioContext;
    const now = ctx ? ctx.currentTime : 0;

    // For each voice, check if ANY enabled ducking effect needs it
    for (let i = 0; i < 6; i++) {
        const isNeeded = Object.values(state.sidechain).some(
            cfg => cfg.enabled && cfg.voices[i]
        );

        // Smooth transition to avoid clicks
        config.sidechainTapGains[i].gain.setTargetAtTime(isNeeded ? 1 : 0, now, 0.01);
    }
}

/**
 * Connect a voice panner to its sidechain tap
 * Call this when creating voice instances in triggerVoice()
 * @param {GainNode} panner - The voice's panner node
 * @param {number} voiceIndex - Voice index (0-5)
 */
export function connectVoiceToSidechain(panner, voiceIndex) {
    if (config.sidechainTapGains && config.sidechainTapGains[voiceIndex]) {
        panner.connect(config.sidechainTapGains[voiceIndex]);
    }
}

/**
 * Start the envelope follower loop for ducking
 * Uses requestAnimationFrame for main thread operation
 */
export function startDuckingLoop() {
    if (duckingLoopRunning) return;
    duckingLoopRunning = true;

    const dataArray = new Float32Array(config.sidechainAnalyser.fftSize);

    function loop() {
        if (!duckingLoopRunning) return;

        const ctx = config.audioContext;
        if (!ctx || !config.sidechainAnalyser) {
            duckingLoopRunning = false;
            return;
        }

        const now = ctx.currentTime;

        // Get time-domain data from sidechain sum
        config.sidechainAnalyser.getFloatTimeDomainData(dataArray);

        // Calculate RMS amplitude
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        // Convert to dB (with floor to avoid -Infinity)
        const dbLevel = 20 * Math.log10(Math.max(rms, 0.00001));

        // Apply ducking to each enabled effect
        Object.entries(state.sidechain).forEach(([effectKey, cfg]) => {
            if (!cfg.enabled) return;

            const gainNode = config.duckingGains[effectKey];
            if (!gainNode) return;

            // Map state values (0-100) to actual parameters
            // Threshold: 0-100 → -60dB to 0dB
            const thresholdDb = (cfg.threshold / 100) * 60 - 60;
            // Ratio: 0-100 → 1:1 to 20:1
            const ratio = 1 + (cfg.ratio / 100) * 19;
            // Attack: 0-100 → 0.1ms to 100ms (exponential)
            const attackSec = (0.1 * Math.pow(1000, cfg.attack / 100)) / 1000;
            // Release: 0-100 → 10ms to 1000ms (exponential)
            const releaseSec = (10 * Math.pow(100, cfg.release / 100)) / 1000;
            // Range: 0-100 → 0dB to 40dB max attenuation
            const rangeDb = (cfg.range / 100) * 40;

            // Calculate gain reduction
            const overThreshold = dbLevel - thresholdDb;

            if (overThreshold > 0) {
                // Signal above threshold - apply compression/ducking
                const reductionDb = overThreshold * (1 - 1 / ratio);
                const clampedReduction = Math.min(reductionDb, rangeDb);
                const targetGain = Math.pow(10, -clampedReduction / 20);

                // Fast attack
                gainNode.gain.setTargetAtTime(targetGain, now, attackSec);
            } else {
                // Signal below threshold - release back to unity
                gainNode.gain.setTargetAtTime(1, now, releaseSec);
            }
        });

        duckingLoopId = requestAnimationFrame(loop);
    }

    loop();
}

/**
 * Stop the envelope follower loop
 */
export function stopDuckingLoop() {
    duckingLoopRunning = false;
    if (duckingLoopId) {
        cancelAnimationFrame(duckingLoopId);
        duckingLoopId = null;
    }

    // Reset all ducking gains to unity
    if (config.duckingGains) {
        Object.values(config.duckingGains).forEach(gainNode => {
            if (gainNode) {
                gainNode.gain.setTargetAtTime(1, config.audioContext?.currentTime || 0, 0.01);
            }
        });
    }

}

/**
 * Check if any ducking is enabled
 * @returns {boolean} True if any effect has ducking enabled
 */
export function isDuckingEnabled() {
    return Object.values(state.sidechain).some(cfg => cfg.enabled);
}

/**
 * Start or stop ducking loop based on current state
 */
export function updateDuckingState() {
    if (isDuckingEnabled()) {
        updateSidechainTaps();
        startDuckingLoop();
    } else {
        stopDuckingLoop();
    }
}
