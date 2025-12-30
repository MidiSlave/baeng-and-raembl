/**
 * RingMod Hi-Hat Engine (909-style metallic)
 *
 * Based on Mutable Instruments Plaits hi_hat_2
 * 909-style: 3 pairs of ring-modulated oscillators (square × saw)
 * with linear VCA, low resonance, and two-stage envelope
 *
 * This is the AUX output for the Hi-Hat engine (dual-output architecture)
 * OUT = SquareNoise Hi-Hat (808-style)
 * AUX = RingModNoise Hi-Hat (909-style metallic)
 */

import { SVF, constrain } from './analog-dsp-utils.js';

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
 * Variable Shape Oscillator (PolyBLEP anti-aliased)
 */
class VariableShapeOscillator {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;
        this.phase = 0;
        this.frequency = 0;
        this.highState = false;
        this.previousPhase = 0;
    }

    init() {
        this.phase = 0;
        this.highState = false;
        this.previousPhase = 0;
    }

    /**
     * PolyBLEP for anti-aliasing
     */
    polyBLEP(t, dt) {
        if (t < dt) {
            t /= dt;
            return t + t - t * t - 1.0;
        } else if (t > 1.0 - dt) {
            t = (t - 1.0) / dt;
            return t * t + t + t + 1.0;
        }
        return 0.0;
    }

    /**
     * Render oscillator
     * @param {number} freq - Normalised frequency (0-0.5)
     * @param {number} pw - Pulse width (0-1)
     * @param {number} waveshape - 0=saw, 0.5=saw, 1.0=square
     * @param {Float32Array} output - Output buffer
     * @param {number} size - Buffer size
     */
    render(freq, pw, waveshape, output, size) {
        const f = Math.min(freq, 0.499);
        const dt = f; // Phase increment per sample

        for (let i = 0; i < size; i++) {
            this.phase += f;
            if (this.phase >= 1.0) {
                this.phase -= 1.0;
            }

            let sample;

            if (waveshape >= 0.99) {
                // Square wave
                sample = this.phase < pw ? 1.0 : -1.0;
                // Apply PolyBLEP
                sample += this.polyBLEP(this.phase, dt);
                sample -= this.polyBLEP((this.phase + 1.0 - pw) % 1.0, dt);
            } else {
                // Saw wave
                sample = 2.0 * this.phase - 1.0;
                // Apply PolyBLEP
                sample -= this.polyBLEP(this.phase, dt);
            }

            output[i] = sample;
        }
    }
}

/**
 * Ring Modulation Metallic Noise Source
 * 3 pairs of ring-modulated oscillators (square × saw)
 */
class RingModNoise {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;
        // 6 oscillators: 3 pairs (square + saw each)
        this.oscillators = [];
        for (let i = 0; i < 6; i++) {
            this.oscillators.push(new VariableShapeOscillator(sampleRate));
        }
        // Temp buffers
        this.tempSquare = new Float32Array(128);
        this.tempSaw = new Float32Array(128);
    }

    init() {
        for (let i = 0; i < 6; i++) {
            this.oscillators[i].init();
        }
    }

    /**
     * Render ring-modulated metallic noise
     */
    render(f0, output, size) {
        // Frequency ratio scaling
        const ratio = f0 / (0.01 + f0);

        // Frequency pairs (from Plaits reference)
        const f1a = (200.0 / this.sampleRate) * ratio;
        const f1b = (7530.0 / this.sampleRate) * ratio;
        const f2a = (510.0 / this.sampleRate) * ratio;
        const f2b = (8075.0 / this.sampleRate) * ratio;
        const f3a = (730.0 / this.sampleRate) * ratio;
        const f3b = (10500.0 / this.sampleRate) * ratio;

        // Clear output buffer
        output.fill(0.0);

        // Render 3 pairs of ring-modulated oscillators
        this.renderPair(0, f1a, f1b, output, size);
        this.renderPair(2, f2a, f2b, output, size);
        this.renderPair(4, f3a, f3b, output, size);
    }

    /**
     * Render one pair of ring-modulated oscillators
     */
    renderPair(oscIndex, freqA, freqB, output, size) {
        // Render square wave
        this.oscillators[oscIndex].render(freqA, 0.5, 1.0, this.tempSquare, size);

        // Render saw wave
        this.oscillators[oscIndex + 1].render(freqB, 0.5, 0.5, this.tempSaw, size);

        // Ring modulation: multiply and accumulate
        for (let i = 0; i < size; i++) {
            output[i] += this.tempSquare[i] * this.tempSaw[i];
        }
    }
}

// =============================================================================
// Main RingMod Hi-Hat Class
// =============================================================================

export class RingModHiHat {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;

        // Envelope with smoothing for click-free retriggering
        this.envelope = 0;
        this.envelopeTarget = 0;
        this.envelopeLp = 0;  // Smoothed envelope to prevent clicks

        // Clocked noise generator
        this.noiseClock = 0;
        this.noiseSample = 0;

        // Metallic noise (ring-modulated oscillators)
        this.metallicNoise = new RingModNoise(sampleRate);

        // Filters - use SVF for bandpass and highpass
        this.noiseColorationSVF = new SVF();
        this.hpf = new SVF();

        // Random for clocked noise
        this.random = new Random();

        // Internal buffer for chunk rendering
        this.renderBuffer = new Float32Array(128);
        this.bufferPos = 0;
        this.bufferSize = 128;

        // Parameters
        this.metalParam = 0.5;  // Tone/brightness
        this.pitchParam = 0.5;
        this.decayParam = 0.5;
        this.brightParam = 0.3;  // Noisiness
        this.levelParam = 0.85;

        // Track if triggered
        this.hasBeenTriggered = false;
    }

    /**
     * Set parameters from UI (0-100 range)
     */
    setParameters(metal, pitch, decay, bright) {
        this.metalParam = metal / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.brightParam = bright / 100;
        this.levelParam = 0.85;
    }

    /**
     * Update parameters in real-time
     */
    updateParameters(metal, pitch, decay, bright) {
        this.metalParam = metal / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.brightParam = bright / 100;
    }

    /**
     * Trigger the hi-hat
     */
    trigger(accent = 1.0) {
        const tone = this.metalParam;
        const pitch = this.pitchParam;
        const decay = this.decayParam;
        const noisiness = this.brightParam;
        const level = this.levelParam * accent;

        // Map PITCH (0-1) to f0 frequency (300-600 Hz) - hi-hat is high-pitched
        const f0Hz = 300.0 + pitch * 300.0;
        const f0 = f0Hz / this.sampleRate;

        // Store parameters for render
        this.f0 = f0;
        this.f0Hz = f0Hz;
        this.tone = tone;
        this.decay = decay;
        this.noisiness = noisiness;
        this.level = level;

        // Trigger envelope (set target, let smoothing handle the transition)
        this.envelopeTarget = (1.5 + 0.5 * (1.0 - decay)) * (0.3 + 0.7 * accent);
        this.envelope = this.envelopeTarget;

        // Reset on first trigger
        if (!this.hasBeenTriggered) {
            this.metallicNoise.init();
            this.noiseColorationSVF.reset();
            this.hpf.reset();
            this.noiseClock = 0;
            this.noiseSample = 0;
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
        const tone = this.tone;
        const decay = this.decay;
        const noisiness = this.noisiness;
        const levelGain = this.level;

        // Envelope decay rates (two-stage: fast initial, slow tail)
        const envelopeDecay = 1.0 - 0.003 * Math.pow(2, (-decay * 84.0) / 12);
        const cutDecay = 1.0 - 0.0025 * Math.pow(2, (-decay * 36.0) / 12);

        // Render metallic noise (ring-modulated oscillators)
        this.metallicNoise.render(2.0 * this.f0, this.renderBuffer, bufferSize);

        // Bandpass filter parameters (TPT SVF is stable at all frequencies)
        const cutoff = 150.0 / this.sampleRate * Math.pow(2, (tone * 72.0) / 12);
        // Clamp just below Nyquist for audio quality (TPT SVF handles this gracefully)
        const cutoffClamped = Math.max(0.001, Math.min(0.48, cutoff));

        // RingMod hi-hat uses fixed low resonance (Q=1.0)
        const resonance = 1.0;

        this.noiseColorationSVF.setFQ(cutoffClamped, resonance);

        // Apply bandpass filter
        for (let i = 0; i < bufferSize; i++) {
            const filterOut = this.noiseColorationSVF.process(this.renderBuffer[i]);
            this.renderBuffer[i] = filterOut.bp;
        }

        // Add clocked noise (for variety)
        const noisinessSquared = noisiness * noisiness;
        const noiseFreq = this.f0 * (16.0 + 16.0 * (1.0 - noisinessSquared));
        const noiseFreqClamped = Math.max(0, Math.min(0.5, noiseFreq));

        for (let i = 0; i < bufferSize; i++) {
            this.noiseClock += noiseFreqClamped;
            if (this.noiseClock >= 1.0) {
                this.noiseClock -= 1.0;
                this.noiseSample = this.random.getFloat() - 0.5;
            }
            this.renderBuffer[i] += noisinessSquared * (this.noiseSample - this.renderBuffer[i]);
        }

        // Two-stage envelope: fast attack + slow tail
        // Attack smoothing coefficient (~0.5ms rise time at 48kHz)
        const attackSmooth = 0.15;

        for (let i = 0; i < bufferSize; i++) {
            if (this.envelope > 0.5) {
                this.envelope *= envelopeDecay;
            } else {
                this.envelope *= cutDecay;
            }

            // Smooth envelope to prevent clicks on fast retriggering
            this.envelopeLp += attackSmooth * (this.envelope - this.envelopeLp);

            // Linear VCA (simple multiplication for 909 style)
            this.renderBuffer[i] = this.renderBuffer[i] * this.envelopeLp * 2.0 * levelGain;
        }

        // Highpass filter to remove low-end rumble
        this.hpf.setFQ(cutoffClamped, 0.5);
        for (let i = 0; i < bufferSize; i++) {
            const filterOut = this.hpf.process(this.renderBuffer[i]);
            this.renderBuffer[i] = filterOut.hp;
        }
    }

    /**
     * Check if hi-hat is still active
     */
    isActive() {
        return this.envelope > 0.00001;
    }

    /**
     * Get preset values
     */
    static getPreset(type) {
        const presets = {
            '909': { metal: 50, decay: 40, bright: 30 },
            'closed': { metal: 40, decay: 20, bright: 20 },
            'open': { metal: 60, decay: 70, bright: 40 },
            'trashy': { metal: 70, decay: 50, bright: 80 }
        };
        return presets[type] || presets['909'];
    }
}
