/**
 * Analog DSP Utilities
 *
 * Shared DSP building blocks for analog drum synthesis engines
 * Based on Mutable Instruments Plaits architecture
 * Ported from test/analog-drums/*.html
 */

export const TWO_PI = 2.0 * Math.PI;
export const UINT32_MAX = 4294967296;

/**
 * Convert semitones to frequency ratio
 * @param {number} semitones - Semitones (12 = one octave)
 * @returns {number} Frequency ratio
 */
export function semitonesToRatio(semitones) {
    return Math.pow(2.0, semitones / 12.0);
}

/**
 * Constrain value to range
 * @param {number} value - Input value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Constrained value
 */
export function constrain(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Diode clipper (808-style asymmetric waveshaping)
 * Creates even harmonics
 * @param {number} x - Input signal
 * @returns {number} Shaped signal
 */
export function diode(x) {
    if (x >= 0.0) {
        return x;
    } else {
        x *= 2.0;
        return 0.7 * x / (1.0 + Math.abs(x));
    }
}

/**
 * One-pole lowpass filter (exponential moving average)
 * @param {number} state - Current filter state
 * @param {number} input - Input sample
 * @param {number} coefficient - Filter coefficient (0-1, higher = slower)
 * @returns {number} Filtered value
 */
export function onePole(state, input, coefficient) {
    return state + coefficient * (input - state);
}

/**
 * Soft clipping (cubic approximation)
 * @param {number} x - Input signal
 * @returns {number} Clipped signal (-1 to 1)
 */
export function softClip(x) {
    if (x < -3.0) return -1.0;
    if (x > 3.0) return 1.0;
    return x * (27.0 + x * x) / (27.0 + 9.0 * x * x);
}

/**
 * State Variable Filter (TPT/Zavalishin topology)
 * Zero-delay feedback design - inherently stable at all frequencies
 * Replaces Chamberlin topology which becomes unstable at high cutoffs
 *
 * Based on stmlib/dsp/filter.h (Mutable Instruments)
 */
export class SVF {
    constructor() {
        // Filter coefficients
        this.g = 0;   // tan(π * frequency)
        this.r = 1;   // 1 / Q (damping)
        this.h = 0;   // normalisation factor

        // State variables (integrator outputs)
        this.state1 = 0;
        this.state2 = 0;

        // Output storage
        this.lp = 0;
        this.hp = 0;
        this.bp = 0;
    }

    /**
     * Set filter frequency and Q
     * @param {number} frequency - Normalised frequency (0-0.5)
     * @param {number} q - Resonance (Q factor, 0.5+)
     */
    setFQ(frequency, q) {
        // Clamp frequency to safe range (TPT stable up to Nyquist, but clamp for safety)
        frequency = Math.max(0.0001, Math.min(0.49, frequency));
        q = Math.max(0.5, q);

        // TPT coefficients
        this.g = Math.tan(Math.PI * frequency);
        this.r = 1.0 / q;
        this.h = 1.0 / (1.0 + this.r * this.g + this.g * this.g);
    }

    /**
     * Process one sample
     * @param {number} input - Input sample
     * @returns {{lp: number, bp: number, hp: number}} Filter outputs
     */
    process(input) {
        // Zero-delay feedback topology
        this.hp = (input - this.r * this.state1 - this.g * this.state1 - this.state2) * this.h;
        this.bp = this.g * this.hp + this.state1;
        this.state1 = this.g * this.hp + this.bp;
        this.lp = this.g * this.bp + this.state2;
        this.state2 = this.g * this.bp + this.lp;

        return {
            lp: this.lp,
            bp: this.bp,
            hp: this.hp
        };
    }

    /**
     * Reset filter state
     */
    reset() {
        this.state1 = 0;
        this.state2 = 0;
        this.lp = 0;
        this.hp = 0;
        this.bp = 0;
    }
}

/**
 * Sine wave oscillator
 * Phase accumulator with normalized frequency
 */
export class SineOscillator {
    constructor() {
        this.phase = 0.0;
    }

    /**
     * Generate next sample
     * @param {number} frequency - Normalized frequency (0-0.5)
     * @returns {number} Sine wave sample (-1 to 1)
     */
    next(frequency) {
        const sample = Math.sin(TWO_PI * this.phase);
        this.phase += frequency;
        if (this.phase >= 1.0) {
            this.phase -= 1.0;
        }
        return sample;
    }

    /**
     * Reset oscillator phase
     */
    reset() {
        this.phase = 0.0;
    }
}

/**
 * Metallic noise source (6 square wave oscillators)
 * Used for hi-hat synthesis
 */
export class SquareNoise {
    constructor() {
        this.phases = new Uint32Array(6);
        for (let i = 0; i < 6; i++) {
            this.phases[i] = 0;
        }
    }

    /**
     * Render a buffer of metallic noise
     * @param {number} f0 - Base frequency (normalized)
     * @param {Float32Array} output - Output buffer to fill
     */
    render(f0, output) {
        // Ratios for metallic timbre (nominal f0: 414 Hz)
        const ratios = [1.0, 1.304, 1.466, 1.787, 1.932, 2.536];

        // Calculate increments
        const increments = new Uint32Array(6);
        for (let i = 0; i < 6; i++) {
            let f = f0 * ratios[i];
            if (f >= 0.499) f = 0.499;
            increments[i] = Math.floor(f * UINT32_MAX);
        }

        // Render
        for (let s = 0; s < output.length; s++) {
            let noise = 0;
            for (let i = 0; i < 6; i++) {
                this.phases[i] = (this.phases[i] + increments[i]) >>> 0;
                noise += (this.phases[i] >>> 31); // Extract MSB (sign bit)
            }
            output[s] = 0.33 * noise - 1.0;
        }
    }

    /**
     * Reset all oscillator phases
     */
    reset() {
        for (let i = 0; i < 6; i++) {
            this.phases[i] = 0;
        }
    }
}
