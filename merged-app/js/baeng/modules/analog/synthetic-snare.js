/**
 * Synthetic Snare Drum Engine (909-style)
 *
 * Based on Mutable Instruments Plaits synthetic_snare_drum
 * 909-style snare: two coupled oscillators (1.47× ratio) + filtered noise
 *
 * This is the AUX output for the Snare Drum engine (dual-output architecture)
 * OUT = AnalogSnare (808-style)
 * AUX = SyntheticSnare (909-style)
 */

import { SVF, constrain, onePole } from './analog-dsp-utils.js';

// =============================================================================
// DSP Utilities
// =============================================================================

/**
 * PRNG for noise generation
 */
class Random {
    constructor() {
        this.state = (Date.now() & 0x7fffffff) | 1;
    }

    getFloat() {
        this.state = (1103515245 * this.state + 12345) & 0x7fffffff;
        return this.state / 0x7fffffff;
    }
}

/**
 * OnePole filter for drum and snare filtering
 */
class OnePole {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;
        this.state = 0;
        this.coefficient = 0;
    }

    reset() {
        this.state = 0;
    }

    setCutoff(frequency) {
        const normalised = Math.min(frequency / this.sampleRate, 0.499);
        this.coefficient = normalised * 2.0; // Simple one-pole approximation
    }

    process(input) {
        this.state += this.coefficient * (input - this.state);
        return this.state;
    }

    processHighpass(input) {
        this.state += this.coefficient * (input - this.state);
        return input - this.state;
    }
}

// =============================================================================
// Main Synthetic Snare Class
// =============================================================================

export class SyntheticSnare {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;

        // Dual oscillators (909 ratio: 1.47×)
        this.phase = [0, 0];
        this.drumAmplitude = 0;
        this.snareAmplitude = 0;
        this.fm = 0;
        this.holdCounter = 0;

        // Filters
        this.drumLP = new OnePole(sampleRate);
        this.snareHP = new OnePole(sampleRate);
        this.snareLPF = new SVF();
        this.snareLPF.setFQ(0.25, 1.0);

        // Noise generator
        this.random = new Random();

        // Output envelope smoothing for click-free retriggering
        this.outputLp = 0;

        // Internal buffer for chunk rendering
        this.renderBuffer = new Float32Array(128);
        this.bufferPos = 0;
        this.bufferSize = 128;

        // Parameters (set by setParameters)
        this.toneParam = 0.5;  // Maps to FM amount for 909
        this.pitchParam = 0.5;
        this.decayParam = 0.6;
        this.snapParam = 0.5;
        this.levelParam = 0.85;

        // Track if triggered
        this.hasBeenTriggered = false;
    }

    /**
     * Set parameters from UI (0-100 range)
     */
    setParameters(tone, pitch, decay, snap) {
        this.toneParam = tone / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.snapParam = snap / 100;
        this.levelParam = 0.85;
    }

    /**
     * Update parameters in real-time
     */
    updateParameters(tone, pitch, decay, snap) {
        this.toneParam = tone / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.snapParam = snap / 100;
    }

    /**
     * Distorted sine wave (triangle-based soft saturation)
     */
    distortedSine(phase) {
        const triangle = (phase < 0.5 ? phase : 1.0 - phase) * 4.0 - 1.3;
        return 2.0 * triangle / (1.0 + Math.abs(triangle));
    }

    /**
     * Trigger the snare
     */
    trigger(accent = 1.0) {
        const fmAmount = this.toneParam;  // TONE → FM amount for 909
        const pitch = this.pitchParam;
        const decay = this.decayParam;
        const snappy = this.snapParam;
        const level = this.levelParam * accent;

        // Map PITCH (0-1) to f0 frequency (150-350 Hz) - snare is higher than kick
        const f0Hz = 150.0 + pitch * 200.0;
        const f0 = f0Hz / this.sampleRate;

        // Store parameters for render
        this.f0 = f0;
        this.f0Hz = f0Hz;
        this.fmAmount = fmAmount;
        this.decay = decay;
        this.snappy = snappy;
        this.level = level;

        // Trigger envelopes
        this.drumAmplitude = this.snareAmplitude = 0.3 + 0.7 * accent;
        this.fm = 1.0;
        this.phase[0] = this.phase[1] = 0.0;
        this.holdCounter = Math.floor((0.04 + decay * 0.03) * this.sampleRate);

        // Reset on first trigger
        if (!this.hasBeenTriggered) {
            this.drumLP.reset();
            this.snareHP.reset();
            this.snareLPF.reset();
            this.hasBeenTriggered = true;
        }

        // Force buffer render on next process() call
        this.bufferPos = this.bufferSize;
    }

    /**
     * Process one sample
     */
    process() {
        if (this.bufferPos >= this.bufferSize) {
            this.renderChunk(this.bufferSize);
            this.bufferPos = 0;
        }
        return this.renderBuffer[this.bufferPos++];
    }

    /**
     * Render a chunk of samples
     */
    renderChunk(bufferSize) {
        const decay = this.decay;
        const snappy = this.snappy;
        const fmAmount = this.fmAmount;
        const levelGain = this.level;

        const decayXT = decay * (1.0 + decay * (decay - 1.0));
        const fmAmountSquared = fmAmount * fmAmount;

        // Normalised f0 for phase calculations
        const f0Norm = this.f0;

        // Envelope decay coefficients
        const drumDecay = 1.0 - (1.0 / (0.015 * this.sampleRate)) *
            Math.pow(2, (-decayXT * 72.0 - fmAmountSquared * 12.0 + snappy * 7.0) / 12);
        const snareDecay = 1.0 - (1.0 / (0.01 * this.sampleRate)) *
            Math.pow(2, (-decay * 60.0 - snappy * 7.0) / 12);
        const fmDecay = 1.0 - 1.0 / (0.007 * this.sampleRate);

        // Snappy adjustment
        let snappyAdjusted = snappy * 1.1 - 0.05;
        snappyAdjusted = Math.max(0, Math.min(1, snappyAdjusted));

        const drumLevel = Math.sqrt(1.0 - snappyAdjusted);
        const snareLevel = Math.sqrt(snappyAdjusted);

        // Filter setup
        const snareFMin = Math.min(10.0 * this.f0Hz, this.sampleRate * 0.5);
        const snareFMax = Math.min(35.0 * this.f0Hz, this.sampleRate * 0.5);

        this.snareHP.setCutoff(snareFMin);
        this.snareLPF.setFQ(snareFMax / this.sampleRate, 0.5 + 2.0 * snappyAdjusted);
        this.drumLP.setCutoff(3.0 * this.f0Hz);

        for (let i = 0; i < bufferSize; i++) {
            // Drum envelope (long tail)
            this.drumAmplitude *= (this.drumAmplitude > 0.03 || !(i & 1))
                ? drumDecay
                : 1.0;

            // Snare envelope (hold stage then decay)
            if (this.holdCounter > 0) {
                this.holdCounter--;
            } else {
                this.snareAmplitude *= snareDecay;
            }

            this.fm *= fmDecay;

            // 909 reset noise coupling
            let resetNoise = 0.0;
            let resetNoiseAmount = (0.125 - f0Norm) * 8.0;
            resetNoiseAmount = Math.max(0, Math.min(1, resetNoiseAmount));
            resetNoiseAmount *= resetNoiseAmount;
            resetNoiseAmount *= fmAmountSquared;

            resetNoise += this.phase[0] > 0.5 ? -1.0 : 1.0;
            resetNoise += this.phase[1] > 0.5 ? -1.0 : 1.0;
            resetNoise *= resetNoiseAmount * 0.025;

            // Update oscillator phases (using normalised frequency)
            const freqModulated = f0Norm * (1.0 + fmAmountSquared * (4.0 * this.fm));
            this.phase[0] += freqModulated;
            this.phase[1] += freqModulated * 1.47; // 909 ratio

            // Phase wrap with reset noise
            if (resetNoiseAmount > 0.1) {
                if (this.phase[0] >= 1.0 + resetNoise) {
                    this.phase[0] = 1.0 - this.phase[0];
                }
                if (this.phase[1] >= 1.0 + resetNoise) {
                    this.phase[1] = 1.0 - this.phase[1];
                }
            } else {
                if (this.phase[0] >= 1.0) {
                    this.phase[0] -= 1.0;
                }
                if (this.phase[1] >= 1.0) {
                    this.phase[1] -= 1.0;
                }
            }

            // Generate drum signal (two distorted oscillators)
            let drum = -0.1;
            drum += this.distortedSine(this.phase[0]) * 0.60;
            drum += this.distortedSine(this.phase[1]) * 0.25;
            drum *= this.drumAmplitude * drumLevel;
            drum = this.drumLP.process(drum);

            // Generate snare signal (filtered noise)
            let noise = this.random.getFloat();
            let snare = this.snareLPF.process(noise).lp;
            snare = this.snareHP.processHighpass(snare);
            snare = (snare + 0.1) * (this.snareAmplitude + this.fm) * snareLevel;

            // Mix with output smoothing to prevent clicks on fast retriggering (~0.3ms rise time)
            const output = (snare + drum) * 2.0 * levelGain;
            this.outputLp += 0.2 * (output - this.outputLp);
            this.renderBuffer[i] = this.outputLp;
        }
    }

    /**
     * Check if snare is still active
     */
    isActive() {
        return this.drumAmplitude > 0.00001 ||
               this.snareAmplitude > 0.00001 ||
               this.holdCounter > 0;
    }

    /**
     * Get preset values
     */
    static getPreset(type) {
        const presets = {
            '909': { tone: 50, decay: 50, snap: 60 },
            'tight': { tone: 70, decay: 30, snap: 70 },
            'fat': { tone: 30, decay: 70, snap: 40 },
            'crisp': { tone: 80, decay: 40, snap: 80 }
        };
        return presets[type] || presets['909'];
    }
}
