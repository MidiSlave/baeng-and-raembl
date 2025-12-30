// File: js/modules/analog/dsp-blocks.js
// Shared DSP building blocks for analog drum synthesis

/**
 * Exponential Decay Envelope Generator
 * Used for analog-style transient generation and amplitude envelopes
 * Based on Mutable Instruments Peaks architecture
 */
export class ExponentialEnvelope {
    constructor() {
        this.state = 0;
        this.decay = 0.999; // Decay coefficient (0.9-0.9999)
        this.level = 0;
    }

    /**
     * Trigger the envelope with a given level
     * @param {number} level - Initial level (can be positive or negative)
     */
    trigger(level) {
        this.state = Math.abs(level);
        this.level = level;
    }

    /**
     * Process one sample
     * @returns {number} Current envelope value
     */
    process() {
        this.state *= this.decay;
        return this.level < 0 ? -this.state : this.state;
    }

    /**
     * Set decay time
     * @param {number} decay - Decay coefficient (0-1) maps to (0.9-0.9999)
     */
    setDecay(decay) {
        // Map 0-1 to exponential decay range
        // Lower values = faster decay, higher values = slower decay
        this.decay = 0.9 + decay * 0.0999;
    }

    /**
     * Set decay coefficient directly (bypass mapping)
     * @param {number} coefficient - Direct decay coefficient (0.9-0.99999)
     */
    setDecayDirect(coefficient) {
        this.decay = Math.max(0.0001, Math.min(0.99999, coefficient));
    }

    /**
     * Check if envelope is still active
     * @returns {boolean} True if envelope is above threshold
     */
    isActive() {
        return this.state > 0.00001; // Lower threshold for longer tails
    }
}

/**
 * State Variable Filter (SVF)
 * Provides simultaneous LP/BP/HP outputs with resonance control
 * Based on Chamberlin/Hal Chamberlin topology
 */
export class StateVariableFilter {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;
        this.lp = 0;  // Lowpass state
        this.bp = 0;  // Bandpass state
        this.f = 0.1; // Frequency coefficient
        this.q = 0.7; // Q/resonance (inverted: lower = more resonance)
        this.punch = 0; // Punch amount for nonlinear behavior
    }

    /**
     * Process one sample through the filter
     * @param {number} input - Input sample
     * @param {string} mode - Output mode: 'lp', 'bp', or 'hp'
     * @returns {number} Filtered sample
     */
    process(input, mode = 'bp') {
        // Apply punch (frequency modulation based on lowpass state)
        const punchMod = this.punch * this.lp;
        const effectiveF = Math.max(0.001, Math.min(0.99, this.f + punchMod * 0.1));

        // SVF topology
        const notch = input - this.bp * this.q;
        this.lp += effectiveF * this.bp;

        // Soft clipping to prevent runaway
        this.lp = Math.max(-1.5, Math.min(1.5, this.lp));

        const hp = notch - this.lp;
        this.bp += effectiveF * hp;

        // Soft clipping on bandpass
        this.bp = Math.max(-1.5, Math.min(1.5, this.bp));

        // Return requested output
        switch (mode) {
            case 'lp': return this.lp;
            case 'hp': return hp;
            case 'bp':
            default: return this.bp;
        }
    }

    /**
     * Set filter frequency
     * @param {number} freq - Frequency in Hz
     */
    setFrequency(freq) {
        // Convert frequency to coefficient
        // f = 2 * sin(π * freq / sampleRate)
        const clampedFreq = Math.max(10, Math.min(this.sampleRate * 0.49, freq));
        this.f = 2 * Math.sin(Math.PI * clampedFreq / this.sampleRate);
    }

    /**
     * Set filter resonance
     * @param {number} q - Q value (0.5-20 typical)
     */
    setResonance(q) {
        // Invert Q for SVF topology (lower internal value = more resonance)
        this.q = 1 / Math.max(0.5, Math.min(20, q));
    }

    /**
     * Set punch amount (808-style kick transient shaping)
     * @param {number} amount - Punch amount (0-1)
     */
    setPunch(amount) {
        this.punch = Math.max(0, Math.min(1, amount));
    }

    /**
     * Reset filter state
     */
    reset() {
        this.lp = 0;
        this.bp = 0;
    }
}

/**
 * White Noise Generator
 * Provides uniform white noise for snare and cymbal synthesis
 */
export class WhiteNoise {
    /**
     * Generate one sample of white noise
     * @returns {number} White noise sample (-1 to 1)
     */
    generate() {
        return Math.random() * 2 - 1;
    }

    /**
     * Process one sample (alias for generate)
     * @returns {number} White noise sample (-1 to 1)
     */
    process() {
        return Math.random() * 2 - 1;
    }
}

/**
 * Square Wave Oscillator
 * Used for cymbal/hi-hat metallic timbres
 */
export class SquareOscillator {
    constructor(frequency, sampleRate = 48000) {
        this.phase = Math.random(); // Random initial phase for detuning
        this.phaseIncrement = frequency / sampleRate;
        this.frequency = frequency;
        this.sampleRate = sampleRate;
    }

    /**
     * Process one sample
     * @returns {number} Square wave output (±1)
     */
    process() {
        this.phase += this.phaseIncrement;
        if (this.phase >= 1.0) this.phase -= 1.0;
        return this.phase < 0.5 ? 1.0 : -1.0;
    }

    /**
     * Set oscillator frequency
     * @param {number} freq - Frequency in Hz
     */
    setFrequency(freq) {
        this.frequency = freq;
        this.phaseIncrement = freq / this.sampleRate;
    }

    /**
     * Reset phase
     */
    reset() {
        this.phase = Math.random(); // Random phase for each trigger
    }
}

/**
 * Sine Oscillator
 * Used for kick drum fundamental and tonal components
 */
export class SineOscillator {
    constructor(frequency, sampleRate = 48000) {
        this.phase = 0;
        this.phaseIncrement = frequency / sampleRate;
        this.frequency = frequency;
        this.sampleRate = sampleRate;
    }

    /**
     * Process one sample
     * @returns {number} Sine wave output (-1 to 1)
     */
    process() {
        this.phase += this.phaseIncrement;
        if (this.phase >= 1.0) this.phase -= 1.0;
        return Math.sin(this.phase * 2 * Math.PI);
    }

    /**
     * Set oscillator frequency
     * @param {number} freq - Frequency in Hz
     */
    setFrequency(freq) {
        this.frequency = freq;
        this.phaseIncrement = freq / this.sampleRate;
    }

    /**
     * Reset phase
     */
    reset() {
        this.phase = 0;
    }
}

/**
 * Triangle Wave Oscillator
 * Generates a triangle wave with anti-aliased transitions
 */
export class TriangleOscillator {
    constructor(frequency, sampleRate = 48000) {
        this.phase = 0;
        this.phaseIncrement = frequency / sampleRate;
        this.frequency = frequency;
        this.sampleRate = sampleRate;
    }

    /**
     * Process one sample
     * @returns {number} Triangle wave output (-1 to 1)
     */
    process() {
        this.phase += this.phaseIncrement;
        if (this.phase >= 1.0) this.phase -= 1.0;

        // Triangle wave: ramps from -1 to 1 and back
        // phase 0-0.5: -1 to 1 (upward ramp)
        // phase 0.5-1.0: 1 to -1 (downward ramp)
        let output;
        if (this.phase < 0.5) {
            output = -1 + (this.phase * 4); // -1 to 1
        } else {
            output = 3 - (this.phase * 4); // 1 to -1
        }

        return output;
    }

    /**
     * Set oscillator frequency
     * @param {number} freq - Frequency in Hz
     */
    setFrequency(freq) {
        this.frequency = freq;
        this.phaseIncrement = freq / this.sampleRate;
    }

    /**
     * Reset phase
     */
    reset() {
        this.phase = 0;
    }
}

/**
 * Utility: Convert MIDI note to frequency
 * @param {number} midiNote - MIDI note number (0-127)
 * @returns {number} Frequency in Hz
 */
export function midiToFreq(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Utility: Convert semitones to frequency ratio
 * @param {number} semitones - Semitone interval
 * @returns {number} Frequency ratio
 */
export function semitonesToRatio(semitones) {
    return Math.pow(2, semitones / 12);
}
