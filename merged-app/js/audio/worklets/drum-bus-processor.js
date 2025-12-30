/**
 * Drum Bus Processor - AudioWorklet for Ableton Drum Buss-inspired processing
 *
 * Signal Chain:
 * Input → Drive → Crunch → Transients → Boom → Compressor → Dampen → Dry/Wet → Output
 *
 * @class DrumBusProcessor
 * @extends AudioWorkletProcessor
 */

class DrumBusProcessor extends AudioWorkletProcessor {

    static get parameterDescriptors() {
        return [
            // Drive section
            { name: 'driveAmount', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'driveType', defaultValue: 0, minValue: 0, maxValue: 2 },  // 0=soft, 1=med, 2=hard

            // Crunch (mid-high saturation)
            { name: 'crunch', defaultValue: 0, minValue: 0, maxValue: 1 },

            // Transient shaper (single bipolar control like Ableton)
            // 0.5 = neutral, <0.5 = less transients, >0.5 = more transients
            { name: 'transients', defaultValue: 0.5, minValue: 0, maxValue: 1 },

            // Boom (sub-bass sine generator triggered by transients)
            { name: 'boomAmount', defaultValue: 0, minValue: 0, maxValue: 1 },   // 0-100% boom level
            { name: 'boomFreq', defaultValue: 0.33, minValue: 0, maxValue: 1 },  // 30-90Hz, default ~50Hz
            { name: 'boomDecay', defaultValue: 0.5, minValue: 0, maxValue: 1 },  // Envelope decay time

            // Compressor
            { name: 'compressEnabled', defaultValue: 0, minValue: 0, maxValue: 1 },

            // Dampen (low-pass filter) - 500Hz to 30kHz
            { name: 'dampenFreq', defaultValue: 1, minValue: 0, maxValue: 1 },  // 500Hz-30kHz

            // Trim (input gain) and Output gain
            { name: 'trimGain', defaultValue: 0.5, minValue: 0, maxValue: 1 },   // -12dB to +12dB input
            { name: 'outputGain', defaultValue: 0.5, minValue: 0, maxValue: 1 }, // -12dB to +12dB output
            { name: 'dryWet', defaultValue: 1, minValue: 0, maxValue: 1 }
        ];
    }

    constructor() {
        super();

        this.sampleRate = globalThis.sampleRate || 48000;

        // ============================================
        // DRIVE: Precomputed waveshaper lookup tables
        // ============================================
        this.softCurve = this.generateCurve(1.5, 'tanh');
        this.medCurve = this.generateCurve(3.0, 'tanh');
        this.hardCurve = this.generateCurve(8.0, 'clip');
        this.currentCurve = this.softCurve;
        this.lastDriveType = 0;

        // ============================================
        // CRUNCH: High-pass filter state for mid-high isolation
        // ============================================
        // One-pole HP at 500Hz
        const hpFc = 500 / this.sampleRate;
        this.crunchHPCoeff = Math.exp(-2 * Math.PI * hpFc);
        this.crunchHPStateL = 0;
        this.crunchHPStateR = 0;
        this.crunchLPStateL = 0;
        this.crunchLPStateR = 0;

        // ============================================
        // TRANSIENTS: SPL differential envelope followers
        // ============================================
        // Fast envelope: 1ms attack, 20ms release
        this.fastAttackCoeff = 1 - Math.exp(-1 / (0.001 * this.sampleRate));
        this.fastReleaseCoeff = 1 - Math.exp(-1 / (0.020 * this.sampleRate));

        // Slow envelope: 15ms attack, 20ms release
        this.slowAttackCoeff = 1 - Math.exp(-1 / (0.015 * this.sampleRate));
        this.slowReleaseCoeff = 1 - Math.exp(-1 / (0.020 * this.sampleRate));

        this.fastEnvL = 0;
        this.fastEnvR = 0;
        this.slowEnvL = 0;
        this.slowEnvR = 0;

        // ============================================
        // PARAMETER SMOOTHING: Prevents clicks/artifacts when adjusting knobs
        // ============================================
        // Smoothing is applied per-block (128 samples), so adjust coefficient accordingly
        // Target: ~10ms smoothing time at 48kHz with 128-sample blocks (~375 blocks/sec)
        this.paramSmoothCoeff = 0.25;  // Fast but smooth (~10ms response)
        // Smoothed parameter values
        this.driveAmountSmoothed = 0;
        this.crunchSmoothed = 0;
        this.transientsSmoothed = 0.5;
        this.boomAmountSmoothed = 0;
        this.boomFreqSmoothed = 50;
        this.boomResonanceSmoothed = 0.5;
        this.dampenFreqSmoothed = 30000;
        this.trimGainSmoothed = 1;
        this.outputGainSmoothed = 1;
        this.dryWetSmoothed = 1;

        // ============================================
        // BOOM: Resonant lowpass filter for sub-bass enhancement
        // Like Ableton Drum Buss - resonant filter excited by input
        // Freq sets the resonant frequency, Decay sets the Q/resonance
        // ============================================
        // State-variable filter states (for resonant LP)
        this.boomLP = 0;
        this.boomBP = 0;
        this.lastBoomOutput = 0;  // Cache for stereo consistency

        // ============================================
        // COMPRESSOR: Fixed settings, envelope state
        // ============================================
        this.compThresholdLin = 0.25;  // -12dB
        this.compRatio = 3;
        this.compAttackCoeff = 1 - Math.exp(-1 / (0.010 * this.sampleRate));
        this.compReleaseCoeff = 1 - Math.exp(-1 / (0.100 * this.sampleRate));
        this.compEnvL = 0;
        this.compEnvR = 0;
        this.compMakeupGain = 1.5;  // ~3.5dB compensation

        // ============================================
        // DAMPEN: One-pole lowpass state
        // ============================================
        this.dampenStateL = 0;
        this.dampenStateR = 0;
        this.dampenCoeff = 1;  // Will be updated per block

        // ============================================
        // GAIN MAPPING: Precomputed lookup tables
        // ============================================
        // For transient attack/sustain gain mapping (avoid per-sample Math.pow)
        this.gainLUT = this.generateGainLUT(256, -24, 24);
    }

    /**
     * Generate waveshaper curve
     * @param {number} amount - Distortion intensity
     * @param {string} type - 'tanh' or 'clip'
     * @returns {Float32Array} Lookup table
     */
    generateCurve(amount, type) {
        const samples = 8192;
        const curve = new Float32Array(samples);

        for (let i = 0; i < samples; i++) {
            const x = (i / (samples - 1)) * 2 - 1;  // -1 to +1

            if (type === 'tanh') {
                // Tanh saturation
                curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
            } else {
                // Hard clipping with soft knee
                const threshold = 1 / amount;
                if (x > threshold) {
                    curve[i] = 1 - (1 - threshold) * Math.exp(-(x - threshold) * amount);
                } else if (x < -threshold) {
                    curve[i] = -1 + (1 - threshold) * Math.exp(-(-x - threshold) * amount);
                } else {
                    curve[i] = x * amount * threshold;
                }
                curve[i] = Math.max(-1, Math.min(1, curve[i]));
            }
        }

        return curve;
    }

    /**
     * Generate gain lookup table for dB to linear conversion
     * @param {number} size - Table size
     * @param {number} minDb - Minimum dB value
     * @param {number} maxDb - Maximum dB value
     * @returns {Float32Array} Lookup table
     */
    generateGainLUT(size, minDb, maxDb) {
        const lut = new Float32Array(size);
        const range = maxDb - minDb;

        for (let i = 0; i < size; i++) {
            const db = minDb + (i / (size - 1)) * range;
            lut[i] = Math.pow(10, db / 20);
        }

        return lut;
    }

    /**
     * Look up gain from LUT (0-1 normalised input)
     * @param {number} normalised - 0-1 value
     * @param {number} minDb - Minimum dB for this parameter
     * @param {number} maxDb - Maximum dB for this parameter
     * @returns {number} Linear gain
     */
    lookupGain(normalised, minDb, maxDb) {
        // Map normalised 0-1 to our LUT which covers -24 to +24 dB
        const lutMinDb = -24;
        const lutMaxDb = 24;
        const lutRange = lutMaxDb - lutMinDb;

        // Map the requested range to LUT index
        const db = minDb + normalised * (maxDb - minDb);
        const lutIndex = ((db - lutMinDb) / lutRange) * (this.gainLUT.length - 1);
        const idx = Math.max(0, Math.min(this.gainLUT.length - 1, Math.round(lutIndex)));

        return this.gainLUT[idx];
    }

    /**
     * Apply waveshaper drive using lookup table with linear interpolation
     * (interpolation prevents bitcrushing artefacts)
     */
    applyDrive(sample, amount) {
        if (amount < 0.001) return sample;

        const curve = this.currentCurve;
        const tableSize = curve.length;

        // Map sample (-1 to +1) to LUT index
        const normalised = (sample + 1) * 0.5;
        const indexFloat = normalised * (tableSize - 1);

        // Linear interpolation between adjacent table entries
        const indexLow = Math.floor(indexFloat);
        const indexHigh = Math.min(indexLow + 1, tableSize - 1);
        const frac = indexFloat - indexLow;

        const clampedLow = Math.max(0, Math.min(tableSize - 1, indexLow));
        const clampedHigh = Math.max(0, Math.min(tableSize - 1, indexHigh));

        const shaped = curve[clampedLow] + (curve[clampedHigh] - curve[clampedLow]) * frac;

        // Blend dry/wet based on amount
        return sample + (shaped - sample) * amount;
    }

    /**
     * Apply crunch (mid-high frequency saturation)
     */
    applyCrunch(sample, channel, amount) {
        if (amount < 0.001) return sample;

        // One-pole highpass to isolate mids/highs
        let hpState, lpState;
        if (channel === 0) {
            hpState = this.crunchHPStateL;
            lpState = this.crunchLPStateL;
        } else {
            hpState = this.crunchHPStateR;
            lpState = this.crunchLPStateR;
        }

        // HP filter: y[n] = x[n] - LP[n], LP[n] = LP[n-1] * coeff + x[n] * (1-coeff)
        lpState = lpState * this.crunchHPCoeff + sample * (1 - this.crunchHPCoeff);
        const hp = sample - lpState;

        // Soft-clip the high content (using simple approximation)
        const drive = 1 + amount * 4;
        const driven = hp * drive;
        // Fast tanh approximation: x / (1 + |x|)
        const saturated = driven / (1 + Math.abs(driven));

        // Store state back
        if (channel === 0) {
            this.crunchLPStateL = lpState;
        } else {
            this.crunchLPStateR = lpState;
        }

        // Blend saturated highs back with dry lows
        return lpState + hp * (1 - amount) + saturated * amount;
    }

    /**
     * Apply transient shaping using SPL differential envelope method
     */
    applyTransients(sample, channel, attackGain, sustainGain) {
        // Both at unity = no processing needed
        if (Math.abs(attackGain - 1) < 0.001 && Math.abs(sustainGain - 1) < 0.001) {
            return sample;
        }

        const rectified = Math.abs(sample);

        let fastEnv, slowEnv;
        if (channel === 0) {
            fastEnv = this.fastEnvL;
            slowEnv = this.slowEnvL;
        } else {
            fastEnv = this.fastEnvR;
            slowEnv = this.slowEnvR;
        }

        // Fast envelope follower
        const fastCoeff = rectified > fastEnv ? this.fastAttackCoeff : this.fastReleaseCoeff;
        fastEnv += (rectified - fastEnv) * fastCoeff;

        // Slow envelope follower
        const slowCoeff = rectified > slowEnv ? this.slowAttackCoeff : this.slowReleaseCoeff;
        slowEnv += (rectified - slowEnv) * slowCoeff;

        // Store state back
        if (channel === 0) {
            this.fastEnvL = fastEnv;
            this.slowEnvL = slowEnv;
        } else {
            this.fastEnvR = fastEnv;
            this.slowEnvR = slowEnv;
        }

        // Differential detection: transient = fast - slow (normalised)
        const diff = fastEnv - slowEnv;
        const transient = Math.max(0, diff) / (fastEnv + 0.0001);
        const sustain = 1 - transient;

        // Apply weighted gains
        const gain = transient * attackGain + sustain * sustainGain;

        return sample * gain;
    }

    /**
     * Apply boom - resonant lowpass filter for sub-bass enhancement
     * Like Ableton Drum Buss: resonant filter excited by input signal
     * Freq sets the resonant frequency (30-90Hz), Decay controls Q/resonance
     * The filter naturally responds to low-frequency content (kicks)
     * Note: Parameters are pre-smoothed in the process() function
     */
    applyBoom(sample, channel, amount, freq, resonance) {
        // Skip if boom amount is effectively zero
        if (amount < 0.001) return sample;

        // Only process on left channel (mono sub-bass), cache for right
        if (channel === 0) {
            // State-variable filter (resonant lowpass)
            // Calculate coefficients from frequency and resonance
            const f = 2 * Math.sin(Math.PI * freq / this.sampleRate);
            // Resonance: 0 = low Q (~2), 1 = very high Q (~80) for long decay
            const q = 2 + resonance * 78;
            const damp = 1 / q;

            // SVF update equations
            this.boomLP += f * this.boomBP;
            const hp = sample - this.boomLP - damp * this.boomBP;
            this.boomBP += f * hp;

            // Output is the resonant lowpass, scaled down to prevent distortion
            // High Q boosts the resonance significantly, so we compensate
            const gainComp = 1 / (1 + resonance * 2);
            this.lastBoomOutput = this.boomLP * gainComp;
        }

        // Mix resonant low-end with original signal
        // Amount controls how much of the resonant filter output is added
        // Scale down further to keep levels reasonable
        return sample + this.lastBoomOutput * amount * 0.5;
    }

    /**
     * Apply compression (fixed Drum Buss style)
     */
    applyCompressor(sample, channel, enabled) {
        if (!enabled) return sample;

        const inputLevel = Math.abs(sample) + 0.0001;

        // Gain reduction calculation (in linear domain to avoid log/pow)
        // Using piece-wise linear approximation
        let gainReduction = 1;
        if (inputLevel > this.compThresholdLin) {
            const over = inputLevel / this.compThresholdLin;
            // Approximate ratio compression in linear domain
            // For 3:1, output = threshold + (input - threshold) / 3
            // Gain = output / input
            const outputLevel = this.compThresholdLin + (inputLevel - this.compThresholdLin) / this.compRatio;
            gainReduction = outputLevel / inputLevel;
        }

        // Envelope follower for smooth gain changes
        let compEnv;
        if (channel === 0) {
            compEnv = this.compEnvL;
        } else {
            compEnv = this.compEnvR;
        }

        const coeff = gainReduction < compEnv ? this.compAttackCoeff : this.compReleaseCoeff;
        compEnv += (gainReduction - compEnv) * coeff;

        if (channel === 0) {
            this.compEnvL = compEnv;
        } else {
            this.compEnvR = compEnv;
        }

        // Apply gain reduction + makeup
        return sample * compEnv * this.compMakeupGain;
    }

    /**
     * Apply dampen (lowpass filter)
     */
    applyDampen(sample, channel) {
        let state;
        if (channel === 0) {
            state = this.dampenStateL;
        } else {
            state = this.dampenStateR;
        }

        // One-pole lowpass
        state += (sample - state) * this.dampenCoeff;

        if (channel === 0) {
            this.dampenStateL = state;
        } else {
            this.dampenStateR = state;
        }

        return state;
    }

    /**
     * Update dampen coefficient from frequency
     */
    updateDampenCoeff(freq) {
        const w = 2 * Math.PI * freq / this.sampleRate;
        this.dampenCoeff = Math.min(1, w / (1 + w));
    }

    /**
     * Main process function
     */
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || !input[0]) return true;

        const blockSize = input[0].length;

        // Get parameters (k-rate - read once per block)
        const driveAmountTarget = parameters.driveAmount[0] ?? 0;
        const driveType = Math.round(parameters.driveType[0] ?? 0);
        const crunchTarget = parameters.crunch[0] ?? 0;
        const transientsTarget = parameters.transients[0] ?? 0.5;

        // Boom params
        const boomAmountTarget = parameters.boomAmount[0] ?? 0;
        const boomFreqNorm = parameters.boomFreq[0] ?? 0.33;
        const boomFreqTarget = 30 + boomFreqNorm * 60;  // 30-90Hz
        const boomResonanceTarget = parameters.boomDecay[0] ?? 0.5;

        const compressEnabled = (parameters.compressEnabled[0] ?? 0) > 0.5;

        // Dampen freq: 0-1 → 500Hz-30kHz (exponential)
        const dampenFreqNorm = parameters.dampenFreq[0] ?? 1;
        const dampenFreqTarget = 500 * Math.pow(60, dampenFreqNorm);

        // Trim gain: 0-1 → -12dB to +12dB (input level)
        const trimGainNorm = parameters.trimGain[0] ?? 0.5;
        const trimGainTarget = this.lookupGain(trimGainNorm, -12, 12);

        // Output gain: 0-1 → silence to +12dB (volume fader behaviour)
        // Use x^2 curve for perceptual volume control, with 0 = silence
        const outputGainNorm = parameters.outputGain[0] ?? 0.5;
        // At 0.75 (75%), output should be ~0dB (gain=1), at 1.0 output is +6dB
        const outputGainTarget = outputGainNorm * outputGainNorm * 2;

        const dryWetTarget = parameters.dryWet[0] ?? 1;

        // Use AudioParam values directly (already smoothed by setTargetAtTime)
        // Only smooth filter frequencies to prevent coefficient discontinuities
        this.dampenFreqSmoothed += (dampenFreqTarget - this.dampenFreqSmoothed) * this.paramSmoothCoeff;
        this.boomFreqSmoothed += (boomFreqTarget - this.boomFreqSmoothed) * this.paramSmoothCoeff;

        // Calculate transient gains directly from param value
        let transientAttack, transientSustain;
        if (transientsTarget >= 0.5) {
            const amount = (transientsTarget - 0.5) * 2;
            transientAttack = this.lookupGain(0.5 + amount * 0.5, -12, 12);
            transientSustain = this.lookupGain(0.5 - amount * 0.5, -12, 12);
        } else {
            const amount = (0.5 - transientsTarget) * 2;
            transientAttack = this.lookupGain(0.5 - amount * 0.5, -12, 12);
            transientSustain = this.lookupGain(0.5 + amount * 0.25, -12, 12);
        }

        // Update dampen coefficient with smoothed frequency
        this.updateDampenCoeff(this.dampenFreqSmoothed);

        // Update drive curve if type changed
        if (driveType !== this.lastDriveType) {
            switch (driveType) {
                case 0: this.currentCurve = this.softCurve; break;
                case 1: this.currentCurve = this.medCurve; break;
                case 2: this.currentCurve = this.hardCurve; break;
            }
            this.lastDriveType = driveType;
        }

        // Process interleaved (both channels per sample) for proper stereo boom
        const numChannels = Math.min(input.length, output.length);
        const inputL = input[0];
        const inputR = input[1] || input[0];
        const outputL = output[0];
        const outputR = output[1] || output[0];

        for (let i = 0; i < blockSize; i++) {
            // Process left channel (using direct param values - AudioParams handle smoothing)
            const dryL = inputL[i];
            let wetL = dryL * trimGainTarget;
            wetL = this.applyDrive(wetL, driveAmountTarget);
            wetL = this.applyCrunch(wetL, 0, crunchTarget);
            wetL = this.applyTransients(wetL, 0, transientAttack, transientSustain);
            wetL = this.applyBoom(wetL, 0, boomAmountTarget, this.boomFreqSmoothed, boomResonanceTarget);
            wetL = this.applyCompressor(wetL, 0, compressEnabled);
            wetL = this.applyDampen(wetL, 0);
            // Mix dry/wet first, then apply output gain to entire signal
            outputL[i] = (dryL * (1 - dryWetTarget) + wetL * dryWetTarget) * outputGainTarget;
            if (outputL[i] > 1) outputL[i] = 1;
            if (outputL[i] < -1) outputL[i] = -1;

            // Process right channel (boom uses cached values from left)
            if (numChannels > 1) {
                const dryR = inputR[i];
                let wetR = dryR * trimGainTarget;
                wetR = this.applyDrive(wetR, driveAmountTarget);
                wetR = this.applyCrunch(wetR, 1, crunchTarget);
                wetR = this.applyTransients(wetR, 1, transientAttack, transientSustain);
                wetR = this.applyBoom(wetR, 1, boomAmountTarget, this.boomFreqSmoothed, boomResonanceTarget);
                wetR = this.applyCompressor(wetR, 1, compressEnabled);
                wetR = this.applyDampen(wetR, 1);
                // Mix dry/wet first, then apply output gain to entire signal
                outputR[i] = (dryR * (1 - dryWetTarget) + wetR * dryWetTarget) * outputGainTarget;
                if (outputR[i] > 1) outputR[i] = 1;
                if (outputR[i] < -1) outputR[i] = -1;
            }
        }

        return true;
    }
}

registerProcessor('drum-bus-processor', DrumBusProcessor);
