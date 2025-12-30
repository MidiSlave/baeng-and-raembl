/**
 * Analog Hi-Hat Engine
 *
 * Based on Mutable Instruments Plaits analog_hihat
 * TR-808 style metallic percussion synthesis:
 * - 6 square wave oscillators (metallic partials)
 * - Clocked noise generator
 * - Swing VCA (asymmetric amplifier)
 * - Two-stage envelope decay
 *
 * Ported from test/analog-drums/hihat-test.html
 */

import {
    SVF,
    SquareNoise,
    semitonesToRatio,
    constrain
} from './analog-dsp-utils.js';

/**
 * Swing VCA (808-style asymmetric VCA)
 * Creates the characteristic "swing" of the 808 hi-hat
 * @param {number} s - Input signal
 * @param {number} gain - Gain/envelope level
 * @returns {number} Shaped output
 */
function swingVCA(s, gain) {
    s *= s > 0.0 ? 4.0 : 0.1;
    s = s / (1.0 + Math.abs(s));
    return (s + 0.1) * gain;
}

export class AnalogHiHat {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;

        // Metallic noise source (6 square oscillators)
        this.metallicNoise = new SquareNoise();

        // Filters
        this.colorationFilter = new SVF(); // BPF for tone shaping
        this.hpf = new SVF();              // HPF for final output

        // State
        this.envelope = 0.0;
        this.noiseClock = 0.0;
        this.noiseSample = 0.0;

        // Internal buffer for chunk rendering
        this.renderBuffer = new Float32Array(128);
        this.bufferPos = 0;
        this.bufferSize = 128;

        // Parameters (set by setParameters)
        this.toneParam = 0.5;
        this.pitchParam = 0.5;
        this.decayParam = 0.3;
        this.noisinessParam = 0.2;
    }

    /**
     * Set parameters from UI (0-100 range)
     * Called by engine.js with macroPatch, macroPitch, macroDepth, macroRate
     */
    setParameters(tone, pitch, decay, noisiness) {
        // Store as 0-1 normalized values for trigger()
        this.toneParam = tone / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.noisinessParam = noisiness / 100;
    }

    /**
     * Update parameters in real-time on an active voice
     * Called by per-parameter modulation system
     * @param {number} tone - Tone parameter (0-100)
     * @param {number} pitch - Pitch parameter (0-100)
     * @param {number} decay - Decay parameter (0-100)
     * @param {number} noisiness - Noisiness parameter (0-100)
     */
    updateParameters(tone, pitch, decay, noisiness) {
        // Update stored normalized parameters
        this.toneParam = tone / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.noisinessParam = noisiness / 100;

        // Recalculate derived parameters that affect ongoing sound
        const toneNorm = this.toneParam;
        const pitchNorm = this.pitchParam;
        const decayNorm = this.decayParam;
        const noisinessNorm = this.noisinessParam;

        // Map PITCH (0-1) to f0 frequency (200-800 Hz for hi-hat)
        const f0Hz = 200.0 + pitchNorm * 600.0;
        const f0 = f0Hz / this.sampleRate;

        // Envelope decay coefficients
        const envelopeDecay = 1.0 - 0.003 * semitonesToRatio(-decayNorm * 84.0);
        const cutDecay = 1.0 - 0.0025 * semitonesToRatio(-decayNorm * 36.0);

        // Coloration filter cutoff (tone control)
        const cutoff = constrain(
            (150.0 / this.sampleRate) * semitonesToRatio(toneNorm * 60.0),
            0.0,
            0.40
        );

        // Coloration filter Q (with resonance)
        const colorationQ = Math.min(3.0 + 3.0 * toneNorm, 5.0);

        // Noise frequency (clocked noise)
        const noisinessSquared = noisinessNorm * noisinessNorm;
        const noiseF = constrain(
            f0 * (16.0 + 16.0 * (1.0 - noisinessSquared)),
            0.0,
            0.5
        );

        // Update real-time parameters
        this.f0 = f0;
        this.f0Hz = f0Hz;
        this.envelopeDecay = envelopeDecay;
        this.cutDecay = cutDecay;
        this.cutoff = cutoff;
        this.colorationQ = colorationQ;
        this.noisiness = noisinessSquared;
        this.noiseF = noiseF;
    }

    /**
     * Trigger the hi-hat (called by engine.js)
     * @param {number} accent - Accent level (0-1)
     */
    trigger(accent = 1.0) {
        // Use stored normalized parameters
        const tone = this.toneParam;
        const pitch = this.pitchParam;
        const decay = this.decayParam;
        const noisiness = this.noisinessParam;
        const level = 1.0 * accent;

        // Map PITCH (0-1) to f0 frequency (200-800 Hz for hi-hat)
        const f0Hz = 200.0 + pitch * 600.0;
        const f0 = f0Hz / this.sampleRate;

        // Envelope decay coefficients
        const envelopeDecay = 1.0 - 0.003 * semitonesToRatio(-decay * 84.0);
        const cutDecay = 1.0 - 0.0025 * semitonesToRatio(-decay * 36.0);

        // Trigger envelope
        const accentLevel = 0.8; // Fixed accent
        this.envelope = (1.5 + 0.5 * (1.0 - decay)) * (0.3 + 0.7 * accentLevel);

        // Coloration filter cutoff (tone control)
        // Reduce the semitone range to prevent extreme values
        // Map tone 0-1 to 0-60 semitones instead of 0-72
        const cutoff = constrain(
            (150.0 / this.sampleRate) * semitonesToRatio(tone * 60.0),
            0.0,
            0.40
        );

        // Coloration filter Q (with resonance)
        // Clamp Q to prevent instability at high frequencies
        const colorationQ = Math.min(3.0 + 3.0 * tone, 5.0);

        // Noise frequency (clocked noise)
        const noisinessSquared = noisiness * noisiness;
        const noiseF = constrain(
            f0 * (16.0 + 16.0 * (1.0 - noisinessSquared)),
            0.0,
            0.5
        );

        // Store parameters
        this.f0 = f0;
        this.f0Hz = f0Hz;
        this.envelopeDecay = envelopeDecay;
        this.cutDecay = cutDecay;
        this.cutoff = cutoff;
        this.colorationQ = colorationQ;
        this.noisiness = noisinessSquared;
        this.noiseF = noiseF;
        this.level = level;

        // Reset metallic noise
        this.metallicNoise.reset();

        // Force buffer render on next process() call
        this.bufferPos = this.bufferSize;
    }

    /**
     * Process one sample (called by engine.js ScriptProcessorNode)
     * Renders in chunks for efficiency
     * @returns {number} Audio sample
     */
    process() {
        // Refill buffer if empty
        if (this.bufferPos >= this.bufferSize) {
            this.renderChunk(this.bufferSize);
            this.bufferPos = 0;
        }

        return this.renderBuffer[this.bufferPos++];
    }

    /**
     * Render a chunk of samples (internal, from test engine)
     * @param {number} bufferSize - Number of samples to render
     */
    renderChunk(bufferSize) {
        const tempBuffer = new Float32Array(bufferSize);

        const levelGain = this.level;

        // Render metallic noise (6 square oscillators)
        this.metallicNoise.render(2.0 * this.f0, tempBuffer);

        // Apply coloration bandpass filter
        this.colorationFilter.setFQ(this.cutoff, this.colorationQ);
        for (let i = 0; i < bufferSize; i++) {
            const filtered = this.colorationFilter.process(tempBuffer[i]);
            tempBuffer[i] = filtered.bp;
        }

        // Add clocked noise (for variety)
        for (let i = 0; i < bufferSize; i++) {
            this.noiseClock += this.noiseF;
            if (this.noiseClock >= 1.0) {
                this.noiseClock -= 1.0;
                this.noiseSample = Math.random() - 0.5;
            }
            // Mix in noise
            tempBuffer[i] += this.noisiness * (this.noiseSample - tempBuffer[i]);
        }

        // Apply VCA with envelope
        for (let i = 0; i < bufferSize; i++) {
            // Two-stage envelope decay
            this.envelope *= (this.envelope > 0.5) ?
                this.envelopeDecay : this.cutDecay;

            // Swing VCA (asymmetric clipping)
            this.renderBuffer[i] = swingVCA(tempBuffer[i], this.envelope);
        }

        // Apply highpass filter
        this.hpf.setFQ(this.cutoff, 0.5);
        for (let i = 0; i < bufferSize; i++) {
            const filtered = this.hpf.process(this.renderBuffer[i]);
            this.renderBuffer[i] = filtered.hp * levelGain * 1.5; // Boosted from 0.8 to match other engines
        }
    }

    /**
     * Check if hi-hat is still active (for voice cleanup)
     * @returns {boolean} True if still producing sound
     */
    isActive() {
        return this.envelope > 0.00001;
    }

    /**
     * Get preset values for different hi-hat types
     * @param {string} type - Preset type: 'closed', 'open', 'bright', 'dark'
     * @returns {object} Parameter values {patch, depth, rate}
     */
    static getPreset(type) {
        const presets = {
            'closed': { patch: 60, depth: 20, rate: 15 },  // Metallic, short, low noise
            'open':   { patch: 50, depth: 70, rate: 25 },  // Balanced, long, moderate noise
            'bright': { patch: 85, depth: 30, rate: 10 },  // Very metallic, short, very low noise
            'dark':   { patch: 30, depth: 40, rate: 30 }   // Dark, moderate, more noise
        };
        return presets[type] || presets['closed'];
    }
}
