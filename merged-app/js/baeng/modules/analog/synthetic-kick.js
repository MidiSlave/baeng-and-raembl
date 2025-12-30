/**
 * Synthetic Kick Drum Engine (909-style)
 *
 * Based on Mutable Instruments Plaits synthetic_bass_drum
 * 909-style kick: FM sine with pitch envelope, click + noise transients
 *
 * This is the AUX output for the Bass Drum engine (dual-output architecture)
 * OUT = AnalogKick (808-style)
 * AUX = SyntheticKick (909-style)
 */

import {
    SVF,
    semitonesToRatio,
    constrain,
    onePole
} from './analog-dsp-utils.js';

// =============================================================================
// DSP Utilities
// =============================================================================

/**
 * SoftLimit - Rational soft limiter
 */
function softLimit(x) {
    return x * (27.0 + x * x) / (27.0 + 9.0 * x * x);
}

/**
 * SoftClip - Soft clipper with hard limits at ±3
 */
function softClip(x) {
    if (x < -3.0) {
        return -1.0;
    } else if (x > 3.0) {
        return 1.0;
    } else {
        return softLimit(x);
    }
}

// =============================================================================
// Click Processor (bandpass-filtered slope detector)
// =============================================================================

class SyntheticKickClick {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;
        this.lp = 0;
        this.hp = 0;
        this.filter = new SVF();
        this.filter.setFQ(5000 / sampleRate, 2.0);
    }

    reset() {
        this.lp = 0;
        this.hp = 0;
        this.filter.reset();
    }

    process(input) {
        // SLOPE macro: asymmetric one-pole (0.5 up, 0.1 down)
        const targetDiff = input - this.lp;
        const coeff = targetDiff > 0 ? 0.5 : 0.1;
        this.lp += coeff * targetDiff;

        // Highpass removes DC
        this.hp += 0.04 * (this.lp - this.hp);

        // Bandpass filter the difference
        const filterOut = this.filter.process(this.lp - this.hp);
        return filterOut.lp;
    }
}

// =============================================================================
// Attack Noise Generator
// =============================================================================

class SyntheticKickAttackNoise {
    constructor() {
        this.lp = 0;
        this.hp = 0;
    }

    reset() {
        this.lp = 0;
        this.hp = 0;
    }

    render() {
        // White noise
        const sample = Math.random() * 2 - 1;

        // Lowpass filter
        this.lp += 0.05 * (sample - this.lp);

        // Highpass filter
        this.hp += 0.005 * (this.lp - this.hp);

        return this.lp - this.hp;
    }
}

// =============================================================================
// Main Synthetic Kick Class
// =============================================================================

export class SyntheticKick {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;

        // Oscillator state
        this.phase = 0;
        this.phaseNoise = 0;
        this.f0Current = 0;

        // FM and envelopes
        this.fm = 0;
        this.fmLp = 0;
        this.bodyEnv = 0;
        this.bodyEnvLp = 0;
        this.transientEnv = 0;
        this.transientEnvLp = 0;

        // Tone lowpass
        this.toneLp = 0;

        // Output envelope smoothing for click-free retriggering
        this.outputLp = 0;

        // Pulse width counters
        this.bodyEnvPulseWidth = 0;
        this.fmPulseWidth = 0;

        // Transient generators
        this.click = new SyntheticKickClick(sampleRate);
        this.noise = new SyntheticKickAttackNoise();

        // Internal buffer for chunk rendering
        this.renderBuffer = new Float32Array(128);
        this.bufferPos = 0;
        this.bufferSize = 128;

        // Parameters (set by setParameters)
        this.toneParam = 0.5;
        this.pitchParam = 0.5;
        this.decayParam = 0.6;
        this.sweepParam = 0.7;
        this.levelParam = 0.85;

        // Track if triggered
        this.hasBeenTriggered = false;
    }

    /**
     * Set parameters from UI (0-100 range)
     */
    setParameters(tone, pitch, decay, sweep) {
        this.toneParam = tone / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.sweepParam = sweep / 100;
        this.levelParam = 0.85;
    }

    /**
     * Update parameters in real-time
     */
    updateParameters(tone, pitch, decay, sweep) {
        this.toneParam = tone / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.sweepParam = sweep / 100;
    }

    /**
     * Distorted sine waveshaper
     * Morphs between triangle-approximated sine and pure sine based on dirtiness
     */
    distortedSine(phase, phaseNoise, dirtiness) {
        // Add phase noise
        phase += phaseNoise * dirtiness;

        // Wrap to 0-1 range
        phase = phase - Math.floor(phase);

        // Triangle approximation of sine
        const triangle = (phase < 0.5 ? phase : 1.0 - phase) * 4.0 - 1.0;
        const approxSine = 2.0 * triangle / (1.0 + Math.abs(triangle));

        // Pure sine
        const cleanSine = Math.sin(2 * Math.PI * (phase + 0.75));

        // Crossfade based on dirtiness
        return approxSine + (1.0 - dirtiness) * (cleanSine - approxSine);
    }

    /**
     * Transistor VCA model
     */
    transistorVCA(s, gain) {
        s = (s - 0.6) * gain;
        return 3.0 * s / (2.0 + Math.abs(s)) + gain * 0.3;
    }

    /**
     * Trigger the kick
     */
    trigger(accent = 1.0) {
        const tone = this.toneParam;
        const pitch = this.pitchParam;
        const decay = this.decayParam;
        const sweep = this.sweepParam;
        const level = this.levelParam * accent;

        // Map PITCH (0-1) to f0 frequency (30-80 Hz) - normalised
        const f0Hz = 30.0 + pitch * 50.0;
        const f0 = f0Hz / this.sampleRate;

        // Store parameters for render
        this.f0 = f0;
        this.f0Hz = f0Hz;
        this.tone = tone;
        this.decay = decay;
        this.sweep = sweep;
        this.level = level;

        // Trigger envelopes
        this.fm = 1.0;
        this.bodyEnv = this.transientEnv = 0.3 + 0.7 * accent;
        this.bodyEnvPulseWidth = Math.floor(this.sampleRate * 0.001);  // 1ms
        this.fmPulseWidth = Math.floor(this.sampleRate * 0.0013);      // 1.3ms

        // Reset on first trigger
        if (!this.hasBeenTriggered) {
            this.click.reset();
            this.noise.reset();
            this.phase = 0;
            this.phaseNoise = 0;
            this.toneLp = 0;
            this.fmLp = 0;
            this.bodyEnvLp = 0;
            this.transientEnvLp = 0;
            this.f0Current = f0;
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
        const decay = this.decay * this.decay; // Square for exponential response
        const sweep = this.sweep;
        const levelGain = this.level;

        // Calculate dirtiness - reduce at higher frequencies
        let dirtiness = 0.4 - 0.25 * decay * decay;
        dirtiness *= Math.max(1.0 - 8.0 * this.f0, 0.0);

        // FM envelope parameters
        const fmEnvelopeAmount = Math.min(sweep * 2.0, 1.0);
        const fmEnvelopeDecay = Math.max(sweep * 2.0 - 1.0, 1.0);
        const fmDecay = 1.0 - 1.0 / (0.008 * (1.0 + fmEnvelopeDecay * 4.0) * this.sampleRate);

        // Body envelope decay (pitch-dependent)
        const bodyEnvDecay = 1.0 - 1.0 / (0.02 * this.sampleRate) *
            semitonesToRatio(-decay * 60.0);

        // Transient envelope (fast)
        const transientEnvDecay = 1.0 - 1.0 / (0.005 * this.sampleRate);

        // Tone filter frequency
        const toneF = Math.min(
            4.0 * this.f0 * semitonesToRatio(tone * 108.0),
            1.0
        );

        const transientLevel = tone;

        // Frequency interpolation
        const f0Incr = (this.f0 - this.f0Current) / bufferSize;
        let currentF0 = this.f0Current;

        for (let i = 0; i < bufferSize; i++) {
            currentF0 += f0Incr;

            // Phase noise (slow random walk)
            this.phaseNoise += 0.0005 * ((Math.random() - 0.5) - this.phaseNoise);

            // FM pulse width handling
            if (this.fmPulseWidth) {
                this.fmPulseWidth--;
                this.phase = 0.25; // Reset phase to 90 degrees during FM pulse
            } else {
                // FM envelope decay
                this.fm *= fmDecay;

                // FM modulation (pitch drops from high to fundamental)
                const fmMod = 1.0 + fmEnvelopeAmount * 3.5 * this.fmLp;
                this.phase += Math.min(currentF0 * fmMod, 0.5);

                if (this.phase >= 1.0) {
                    this.phase -= 1.0;
                }
            }

            // Envelope pulse widths
            if (this.bodyEnvPulseWidth) {
                this.bodyEnvPulseWidth--;
            } else {
                this.bodyEnv *= bodyEnvDecay;
                this.transientEnv *= transientEnvDecay;
            }

            // Envelope lowpass smoothing
            const envelopeLpF = 0.1;
            this.bodyEnvLp += envelopeLpF * (this.bodyEnv - this.bodyEnvLp);
            this.transientEnvLp += envelopeLpF * (this.transientEnv - this.transientEnvLp);
            this.fmLp += envelopeLpF * (this.fm - this.fmLp);

            // Body tone (main oscillator)
            const body = this.distortedSine(this.phase, this.phaseNoise, dirtiness);

            // Transient (click + noise)
            const clickInput = this.bodyEnvPulseWidth ? 0.0 : 1.0;
            const transient = this.click.process(clickInput) + this.noise.render();

            // Mix body and transient
            let mix = 0;
            mix -= this.transistorVCA(body, this.bodyEnvLp);
            mix -= transient * this.transientEnvLp * transientLevel;

            // Tone control (one-pole lowpass)
            this.toneLp += toneF * (mix - this.toneLp);

            // Output smoothing to prevent clicks on fast retriggering (~0.3ms rise time)
            const output = this.toneLp * 2.3 * levelGain;
            this.outputLp += 0.2 * (output - this.outputLp);
            this.renderBuffer[i] = this.outputLp;
        }

        this.f0Current = currentF0;
    }

    /**
     * Check if kick is still active
     */
    isActive() {
        return this.bodyEnvLp > 0.00001 ||
               this.transientEnvLp > 0.00001 ||
               this.bodyEnvPulseWidth > 0 ||
               this.fmPulseWidth > 0;
    }

    /**
     * Get preset values
     */
    static getPreset(type) {
        const presets = {
            '909': { patch: 70, depth: 45, rate: 50 },
            'punchy': { patch: 80, depth: 30, rate: 60 },
            'soft': { patch: 50, depth: 60, rate: 40 },
            'attack': { patch: 90, depth: 20, rate: 70 }
        };
        return presets[type] || presets['909'];
    }
}
