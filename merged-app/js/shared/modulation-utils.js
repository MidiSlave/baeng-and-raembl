/**
 * Shared modulation utilities for PPMod system
 * Used by both Bæng and Ræmbl for common mode logic
 */

// ============================================================================
// LFSR Random Generator (RND mode)
// ============================================================================

/**
 * Linear Feedback Shift Register for deterministic random sequences
 * @param {number} bitLength - LFSR bit length (4, 8, 16, or 32)
 * @param {number} seed - Initial seed value (defaults to max value for bit length)
 */
export class LFSR {
    constructor(bitLength = 16, seed = null) {
        this.bitLength = Math.min(32, Math.max(4, bitLength));
        this.maxValue = (1 << this.bitLength) - 1;
        this.state = seed !== null ? (seed & this.maxValue) : this.maxValue;

        // Feedback taps for different bit lengths (maximal length sequences)
        this.taps = {
            4: [3, 2],           // x^4 + x^3 + 1
            8: [7, 5, 4, 3],     // x^8 + x^6 + x^5 + x^4 + 1
            16: [15, 14, 12, 3], // x^16 + x^15 + x^13 + x^4 + 1
            32: [31, 21, 1, 0]   // x^32 + x^22 + x^2 + x^1 + 1
        };
    }

    /**
     * Advance LFSR by one step
     * @returns {number} New state (0 to maxValue)
     */
    next() {
        const taps = this.taps[this.bitLength] || this.taps[16];
        let feedback = 0;

        for (const tap of taps) {
            feedback ^= (this.state >> tap) & 1;
        }

        this.state = ((this.state << 1) | feedback) & this.maxValue;

        // Prevent stuck at zero
        if (this.state === 0) {
            this.state = 1;
        }

        return this.state;
    }

    /**
     * Get normalised value (0-1)
     * @returns {number} Value between 0 and 1
     */
    nextNormalised() {
        return this.next() / this.maxValue;
    }

    /**
     * Reset to seed
     * @param {number} seed - New seed value
     */
    reset(seed = null) {
        this.state = seed !== null ? (seed & this.maxValue) : this.maxValue;
    }

    /**
     * Get current state without advancing
     * @returns {number} Current state
     */
    peek() {
        return this.state;
    }
}

// ============================================================================
// Envelope Curve Shapes (ENV mode)
// ============================================================================

/**
 * Envelope curve shape functions
 * All take normalised time (0-1) and return normalised value (0-1)
 */
export const EnvelopeCurves = {
    /**
     * Linear curve
     * @param {number} t - Normalised time (0-1)
     * @returns {number} Value (0-1)
     */
    linear(t) {
        return Math.max(0, Math.min(1, t));
    },

    /**
     * Exponential curve (fast attack, slow decay feel)
     * @param {number} t - Normalised time (0-1)
     * @param {number} curvature - Curve steepness (default 3)
     * @returns {number} Value (0-1)
     */
    exponential(t, curvature = 3) {
        t = Math.max(0, Math.min(1, t));
        return 1 - Math.exp(-curvature * t) / (1 - Math.exp(-curvature));
    },

    /**
     * Logarithmic curve (slow attack, fast decay feel)
     * @param {number} t - Normalised time (0-1)
     * @param {number} curvature - Curve steepness (default 3)
     * @returns {number} Value (0-1)
     */
    logarithmic(t, curvature = 3) {
        t = Math.max(0, Math.min(1, t));
        if (t === 0) return 0;
        return Math.log(1 + t * (Math.exp(curvature) - 1)) / curvature;
    },

    /**
     * S-curve (smooth start and end)
     * @param {number} t - Normalised time (0-1)
     * @returns {number} Value (0-1)
     */
    sCurve(t) {
        t = Math.max(0, Math.min(1, t));
        return t * t * (3 - 2 * t);
    },

    /**
     * Inverted exponential (for release phases)
     * @param {number} t - Normalised time (0-1)
     * @param {number} curvature - Curve steepness (default 3)
     * @returns {number} Value (1-0, decreasing)
     */
    exponentialDecay(t, curvature = 3) {
        t = Math.max(0, Math.min(1, t));
        return Math.exp(-curvature * t);
    }
};

/**
 * AD envelope generator (Attack-Decay)
 */
export class ADEnvelope {
    constructor(attackMs = 10, decayMs = 200, curveShape = 'exponential') {
        this.attackMs = attackMs;
        this.decayMs = decayMs;
        this.curveShape = curveShape;
        this.startTime = null;
        this.phase = 'idle'; // 'attack', 'decay', 'idle'
    }

    /**
     * Trigger envelope
     * @param {number} currentTimeMs - Current time in milliseconds
     */
    trigger(currentTimeMs) {
        this.startTime = currentTimeMs;
        this.phase = 'attack';
    }

    /**
     * Get current envelope value
     * @param {number} currentTimeMs - Current time in milliseconds
     * @returns {number} Envelope value (0-1)
     */
    getValue(currentTimeMs) {
        if (this.phase === 'idle' || this.startTime === null) {
            return 0;
        }

        const elapsed = currentTimeMs - this.startTime;
        const curveFn = EnvelopeCurves[this.curveShape] || EnvelopeCurves.linear;

        if (elapsed < this.attackMs) {
            // Attack phase
            const t = elapsed / this.attackMs;
            return curveFn(t);
        } else {
            // Decay phase
            const decayElapsed = elapsed - this.attackMs;
            if (decayElapsed >= this.decayMs) {
                this.phase = 'idle';
                return 0;
            }
            const t = decayElapsed / this.decayMs;
            return 1 - curveFn(t);
        }
    }

    /**
     * Check if envelope is active
     * @returns {boolean}
     */
    isActive() {
        return this.phase !== 'idle';
    }

    /**
     * Update parameters
     */
    setParams(attackMs, decayMs, curveShape) {
        this.attackMs = attackMs;
        this.decayMs = decayMs;
        this.curveShape = curveShape;
    }
}

/**
 * ADSR envelope generator (Attack-Decay-Sustain-Release)
 */
export class ADSREnvelope {
    constructor(attackMs = 10, decayMs = 100, sustain = 0.7, releaseMs = 200, curveShape = 'exponential') {
        this.attackMs = attackMs;
        this.decayMs = decayMs;
        this.sustain = sustain;
        this.releaseMs = releaseMs;
        this.curveShape = curveShape;
        this.startTime = null;
        this.releaseTime = null;
        this.releaseValue = 0;
        this.phase = 'idle'; // 'attack', 'decay', 'sustain', 'release', 'idle'
    }

    /**
     * Trigger envelope (note on)
     */
    trigger(currentTimeMs) {
        this.startTime = currentTimeMs;
        this.releaseTime = null;
        this.phase = 'attack';
    }

    /**
     * Release envelope (note off)
     */
    release(currentTimeMs) {
        if (this.phase !== 'idle') {
            this.releaseValue = this.getValue(currentTimeMs);
            this.releaseTime = currentTimeMs;
            this.phase = 'release';
        }
    }

    /**
     * Get current envelope value
     */
    getValue(currentTimeMs) {
        if (this.phase === 'idle' || this.startTime === null) {
            return 0;
        }

        const curveFn = EnvelopeCurves[this.curveShape] || EnvelopeCurves.linear;

        if (this.phase === 'release' && this.releaseTime !== null) {
            const releaseElapsed = currentTimeMs - this.releaseTime;
            if (releaseElapsed >= this.releaseMs) {
                this.phase = 'idle';
                return 0;
            }
            const t = releaseElapsed / this.releaseMs;
            return this.releaseValue * (1 - curveFn(t));
        }

        const elapsed = currentTimeMs - this.startTime;

        if (elapsed < this.attackMs) {
            // Attack phase
            this.phase = 'attack';
            const t = elapsed / this.attackMs;
            return curveFn(t);
        } else if (elapsed < this.attackMs + this.decayMs) {
            // Decay phase
            this.phase = 'decay';
            const decayElapsed = elapsed - this.attackMs;
            const t = decayElapsed / this.decayMs;
            return 1 - (1 - this.sustain) * curveFn(t);
        } else {
            // Sustain phase
            this.phase = 'sustain';
            return this.sustain;
        }
    }

    isActive() {
        return this.phase !== 'idle';
    }

    setParams(attackMs, decayMs, sustain, releaseMs, curveShape) {
        this.attackMs = attackMs;
        this.decayMs = decayMs;
        this.sustain = sustain;
        this.releaseMs = releaseMs;
        this.curveShape = curveShape;
    }
}

// ============================================================================
// SEQ Pattern Utilities (SEQ mode)
// ============================================================================

/**
 * Step sequencer pattern for modulation
 */
export class SeqPattern {
    constructor(length = 4, values = null) {
        this.length = Math.min(16, Math.max(1, length));
        this.values = values || new Array(this.length).fill(0.5);
        this.currentStep = 0;
    }

    /**
     * Advance to next step
     * @returns {number} Current step value (0-1)
     */
    advance() {
        this.currentStep = (this.currentStep + 1) % this.length;
        return this.values[this.currentStep];
    }

    /**
     * Get current step value without advancing
     * @returns {number} Current step value (0-1)
     */
    getValue() {
        return this.values[this.currentStep];
    }

    /**
     * Get value at specific step
     * @param {number} step - Step index
     * @returns {number} Step value (0-1)
     */
    getStepValue(step) {
        return this.values[step % this.length];
    }

    /**
     * Set value at specific step
     * @param {number} step - Step index
     * @param {number} value - Value (0-1)
     */
    setStepValue(step, value) {
        this.values[step % this.length] = Math.max(0, Math.min(1, value));
    }

    /**
     * Set all values
     * @param {number[]} values - Array of values (0-1)
     */
    setValues(values) {
        this.values = values.slice(0, this.length).map(v => Math.max(0, Math.min(1, v)));
        while (this.values.length < this.length) {
            this.values.push(0.5);
        }
    }

    /**
     * Set pattern length
     * @param {number} length - New length (1-16)
     */
    setLength(length) {
        const newLength = Math.min(16, Math.max(1, length));
        if (newLength > this.length) {
            // Extend with 0.5 values
            while (this.values.length < newLength) {
                this.values.push(0.5);
            }
        } else {
            this.values = this.values.slice(0, newLength);
        }
        this.length = newLength;
        this.currentStep = this.currentStep % this.length;
    }

    /**
     * Reset to step 0
     */
    reset() {
        this.currentStep = 0;
    }

    /**
     * Serialise for patch save
     * @returns {Object}
     */
    toJSON() {
        return {
            length: this.length,
            values: [...this.values]
        };
    }

    /**
     * Deserialise from patch
     * @param {Object} data
     */
    static fromJSON(data) {
        const pattern = new SeqPattern(data.length || 4);
        if (data.values) {
            pattern.setValues(data.values);
        }
        return pattern;
    }
}

// ============================================================================
// TM Probability Utilities (TM mode)
// ============================================================================

/**
 * Probabilistic step sequencer (Turing Machine style)
 */
export class TMPattern {
    constructor(length = 8, probability = 0.5) {
        this.length = Math.min(16, Math.max(1, length));
        this.probability = Math.max(0, Math.min(1, probability));
        this.pattern = new Array(this.length).fill(0.5);
        this.currentStep = 0;
        this.lfsr = new LFSR(16);
    }

    /**
     * Advance to next step with probabilistic mutation
     * @returns {number} Current step value (0-1)
     */
    advance() {
        this.currentStep = (this.currentStep + 1) % this.length;

        // Probabilistically mutate current step
        if (Math.random() < this.probability) {
            this.pattern[this.currentStep] = this.lfsr.nextNormalised();
        }

        return this.pattern[this.currentStep];
    }

    /**
     * Get current step value without advancing
     * @returns {number}
     */
    getValue() {
        return this.pattern[this.currentStep];
    }

    /**
     * Set probability (0 = locked, 1 = fully random)
     * @param {number} prob - Probability (0-1)
     */
    setProbability(prob) {
        this.probability = Math.max(0, Math.min(1, prob));
    }

    /**
     * Set pattern length
     * @param {number} length - New length (1-16)
     */
    setLength(length) {
        const newLength = Math.min(16, Math.max(1, length));
        if (newLength > this.length) {
            while (this.pattern.length < newLength) {
                this.pattern.push(this.lfsr.nextNormalised());
            }
        } else {
            this.pattern = this.pattern.slice(0, newLength);
        }
        this.length = newLength;
        this.currentStep = this.currentStep % this.length;
    }

    /**
     * Reset pattern with new random values
     */
    randomise() {
        for (let i = 0; i < this.length; i++) {
            this.pattern[i] = this.lfsr.nextNormalised();
        }
        this.currentStep = 0;
    }

    /**
     * Reset to step 0
     */
    reset() {
        this.currentStep = 0;
    }

    /**
     * Serialise for patch save
     */
    toJSON() {
        return {
            length: this.length,
            probability: this.probability,
            pattern: [...this.pattern],
            lfsrState: this.lfsr.peek()
        };
    }

    /**
     * Deserialise from patch
     */
    static fromJSON(data) {
        const tm = new TMPattern(data.length || 8, data.probability || 0.5);
        if (data.pattern) {
            tm.pattern = data.pattern.slice(0, tm.length);
        }
        if (data.lfsrState) {
            tm.lfsr.reset(data.lfsrState);
        }
        return tm;
    }
}

// ============================================================================
// EF Envelope Follower Utilities (EF mode)
// ============================================================================

/**
 * Simple peak detector for envelope following
 */
export class EnvelopeFollower {
    constructor(attackMs = 10, releaseMs = 100, sampleRateHz = 30) {
        this.attackMs = attackMs;
        this.releaseMs = releaseMs;
        this.sampleRateHz = sampleRateHz;
        this.envelope = 0;

        this._updateCoefficients();
    }

    _updateCoefficients() {
        // Convert ms to coefficient based on sample rate
        const samplePeriodMs = 1000 / this.sampleRateHz;
        this.attackCoef = Math.exp(-samplePeriodMs / this.attackMs);
        this.releaseCoef = Math.exp(-samplePeriodMs / this.releaseMs);
    }

    /**
     * Process input sample (call at k-rate, ~30Hz)
     * @param {number} input - Input value (typically 0-1 from AnalyserNode)
     * @returns {number} Smoothed envelope value (0-1)
     */
    process(input) {
        const absInput = Math.abs(input);

        if (absInput > this.envelope) {
            // Attack - rising
            this.envelope = this.attackCoef * this.envelope + (1 - this.attackCoef) * absInput;
        } else {
            // Release - falling
            this.envelope = this.releaseCoef * this.envelope + (1 - this.releaseCoef) * absInput;
        }

        return this.envelope;
    }

    /**
     * Get current envelope value
     * @returns {number}
     */
    getValue() {
        return this.envelope;
    }

    /**
     * Reset envelope to zero
     */
    reset() {
        this.envelope = 0;
    }

    /**
     * Update parameters
     */
    setParams(attackMs, releaseMs) {
        this.attackMs = attackMs;
        this.releaseMs = releaseMs;
        this._updateCoefficients();
    }
}

// ============================================================================
// LFO Utilities (LFO mode - extends existing implementation)
// ============================================================================

/**
 * LFO waveform generators
 * All return value in range -1 to +1
 */
export const LFOWaveforms = {
    sine(phase) {
        return Math.sin(phase * 2 * Math.PI);
    },

    triangle(phase) {
        const p = phase % 1;
        return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    },

    square(phase) {
        return phase % 1 < 0.5 ? 1 : -1;
    },

    saw(phase) {
        return 2 * (phase % 1) - 1;
    },

    ramp(phase) {
        return 1 - 2 * (phase % 1);
    },

    sampleHold(phase, lfsr) {
        // Returns current LFSR value, only changes on phase wrap
        return lfsr.nextNormalised() * 2 - 1;
    }
};

// ============================================================================
// Modulation Value Mapping
// ============================================================================

/**
 * Map modulation value to parameter range
 * @param {number} modValue - Modulation value (-1 to +1 for bipolar, 0-1 for unipolar)
 * @param {number} baseValue - Base parameter value
 * @param {number} depth - Modulation depth (0-1)
 * @param {number} offset - Modulation offset (-1 to +1)
 * @param {number} min - Parameter minimum
 * @param {number} max - Parameter maximum
 * @param {boolean} bipolar - Whether modulation is bipolar
 * @returns {number} Final parameter value (clamped to min/max)
 */
export function mapModulationValue(modValue, baseValue, depth, offset, min, max, bipolar = true) {
    const range = max - min;

    // Apply offset
    let value = modValue + offset;

    // Apply depth
    if (bipolar) {
        // Bipolar: modulates around base value
        value = baseValue + (value * depth * range * 0.5);
    } else {
        // Unipolar: modulates from base value upward
        value = baseValue + (value * depth * range);
    }

    // Clamp to parameter range
    return Math.max(min, Math.min(max, value));
}

/**
 * Convert 0-9 probability scale to 0-1
 * (Used by TM mode UI)
 */
export function probabilityFromScale(scale09) {
    return Math.max(0, Math.min(9, scale09)) / 9;
}

/**
 * Convert 0-1 probability to 0-9 scale
 */
export function probabilityToScale(prob01) {
    return Math.round(Math.max(0, Math.min(1, prob01)) * 9);
}
