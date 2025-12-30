/**
 * Analog Snare Drum Engine
 *
 * Based on Mutable Instruments Plaits analog_snare_drum
 * Architecture: 5 modal resonators + filtered noise
 *
 * Ported from test/analog-drums/snare-test.html
 */

import {
    SVF,
    SineOscillator,
    semitonesToRatio,
    constrain,
    onePole,
    softClip
} from './analog-dsp-utils.js';

export class AnalogSnare {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;

        // 5 modal resonators + oscillators for sustain mode
        this.NUM_MODES = 5;
        this.resonators = [];
        this.oscillators = [];
        for (let i = 0; i < this.NUM_MODES; i++) {
            this.resonators.push(new SVF());
            this.oscillators.push(new SineOscillator());
        }

        // Noise filter
        this.noiseFilter = new SVF();

        // State
        this.pulseRemainingSamples = 0;
        this.pulse = 0.0;
        this.pulseHeight = 0.0;
        this.pulseLp = 0.0;
        this.noiseEnvelope = 0.0;
        this.sustainGain = 0.0;

        // Internal buffer for chunk rendering
        this.renderBuffer = new Float32Array(128);
        this.bufferPos = 0;
        this.bufferSize = 128;

        // Parameters (set by setParameters)
        this.toneParam = 0.5;
        this.pitchParam = 0.5;
        this.decayParam = 0.5;
        this.snapParam = 0.5;
    }

    /**
     * Set parameters from UI (0-100 range)
     * Called by engine.js with macroPatch, macroPitch, macroDepth, macroRate
     */
    setParameters(tone, pitch, decay, snap) {
        // Store as 0-1 normalized values for trigger()
        this.toneParam = tone / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.snapParam = snap / 100;
    }

    /**
     * Update parameters in real-time on an active voice
     * Called by per-parameter modulation system
     * @param {number} tone - Tone parameter (0-100)
     * @param {number} pitch - Pitch parameter (0-100)
     * @param {number} decay - Decay parameter (0-100)
     * @param {number} snap - Snap parameter (0-100)
     */
    updateParameters(tone, pitch, decay, snap) {
        // Update stored normalized parameters
        this.toneParam = tone / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.snapParam = snap / 100;

        // Recalculate derived parameters that affect ongoing sound
        const toneNorm = this.toneParam;
        const pitchNorm = this.pitchParam;
        const decayNorm = this.decayParam;
        const snapNorm = this.snapParam;

        // Map PITCH (0-1) to f0 frequency (100-400 Hz for snare)
        const f0Hz = 100.0 + pitchNorm * 300.0;
        const f0 = f0Hz / this.sampleRate;

        // Decay coefficient with exponential transform
        const decayXt = decayNorm * (1.0 + decayNorm * (decayNorm - 1.0));

        // Resonator Q (higher decay = more resonance)
        const q = 2000.0 * semitonesToRatio(decayXt * 84.0);

        // Noise envelope decay
        const noiseEnvelopeDecay = 1.0 - 0.0017 *
            semitonesToRatio(-decayNorm * (50.0 + snapNorm * 10.0));

        // Exciter leak (how much pulse bleeds through)
        const exciterLeak = snapNorm * (2.0 - snapNorm) * 0.1;

        // Adjust snap parameter
        let snapAdjusted = snapNorm * 1.1 - 0.05;
        snapAdjusted = constrain(snapAdjusted, 0.0, 1.0);

        // Modal frequencies (harmonic ratios)
        const modeFrequencies = [1.00, 2.00, 3.18, 4.16, 5.62];

        // Mode gains based on tone parameter
        const modeGains = new Array(this.NUM_MODES);
        if (toneNorm < 0.666667) {
            // 808-style (2 modes)
            const toneScaled = toneNorm * 1.5;
            modeGains[0] = 1.5 + (1.0 - toneScaled) * (1.0 - toneScaled) * 4.5;
            modeGains[1] = 2.0 * toneScaled + 0.15;
            for (let i = 2; i < this.NUM_MODES; i++) {
                modeGains[i] = 0.0;
            }
        } else {
            // Extended modes
            let toneScaled = (toneNorm - 0.666667) * 3.0;
            modeGains[0] = 1.5 - toneScaled * 0.5;
            modeGains[1] = 2.15 - toneScaled * 0.7;
            for (let i = 2; i < this.NUM_MODES; i++) {
                modeGains[i] = toneScaled;
                toneScaled *= toneScaled;
            }
        }

        // Update resonators (if already initialized)
        if (this.resonators && this.resonators.length === this.NUM_MODES) {
            for (let i = 0; i < this.NUM_MODES; i++) {
                const modeFreq = Math.min(f0 * modeFrequencies[i], 0.499);
                const modeQ = 1.0 + modeFreq * (i === 0 ? q : q * 0.25);
                this.resonators[i].setFQ(modeFreq, modeQ);
            }
        }

        // Update noise filter (if already initialized)
        if (this.noiseFilter) {
            const noiseFreq = constrain(f0 * 16.0, 0.0, 0.499);
            this.noiseFilter.setFQ(noiseFreq, 1.0 + noiseFreq * 1.5);
        }

        // Update real-time parameters
        this.f0 = f0;
        this.f0Hz = f0Hz;
        this.modeFrequencies = modeFrequencies;
        this.modeGains = modeGains;
        this.exciterLeak = exciterLeak;
        this.noiseEnvelopeDecay = noiseEnvelopeDecay;
        this.snapAdjusted = snapAdjusted;
    }

    /**
     * Trigger the snare (called by engine.js)
     * @param {number} accent - Accent level (0-1)
     */
    trigger(accent = 1.0) {
        // Use stored normalized parameters
        const tone = this.toneParam;
        const pitch = this.pitchParam;
        const decay = this.decayParam;
        const snap = this.snapParam;
        const level = 1.0 * accent;

        const kTriggerPulseDuration = Math.floor(0.001 * this.sampleRate); // 1ms

        // Map PITCH (0-1) to f0 frequency (100-400 Hz for snare)
        const f0Hz = 100.0 + pitch * 300.0;
        const f0 = f0Hz / this.sampleRate;

        // Decay coefficient with exponential transform
        const decayXt = decay * (1.0 + decay * (decay - 1.0));

        // Resonator Q (higher decay = more resonance)
        const q = 2000.0 * semitonesToRatio(decayXt * 84.0);

        // Noise envelope decay
        const noiseEnvelopeDecay = 1.0 - 0.0017 *
            semitonesToRatio(-decay * (50.0 + snap * 10.0));

        // Exciter leak (how much pulse bleeds through)
        const exciterLeak = snap * (2.0 - snap) * 0.1;

        // Adjust snap parameter
        let snapAdjusted = snap * 1.1 - 0.05;
        snapAdjusted = constrain(snapAdjusted, 0.0, 1.0);

        // Modal frequencies (harmonic ratios)
        const modeFrequencies = [1.00, 2.00, 3.18, 4.16, 5.62];

        // Mode gains based on tone parameter
        const modeGains = new Array(this.NUM_MODES);
        if (tone < 0.666667) {
            // 808-style (2 modes)
            const toneScaled = tone * 1.5;
            modeGains[0] = 1.5 + (1.0 - toneScaled) * (1.0 - toneScaled) * 4.5;
            modeGains[1] = 2.0 * toneScaled + 0.15;
            for (let i = 2; i < this.NUM_MODES; i++) {
                modeGains[i] = 0.0;
            }
        } else {
            // Extended modes
            let toneScaled = (tone - 0.666667) * 3.0;
            modeGains[0] = 1.5 - toneScaled * 0.5;
            modeGains[1] = 2.15 - toneScaled * 0.7;
            for (let i = 2; i < this.NUM_MODES; i++) {
                modeGains[i] = toneScaled;
                toneScaled *= toneScaled;
            }
        }

        // Setup resonators
        for (let i = 0; i < this.NUM_MODES; i++) {
            const modeFreq = Math.min(f0 * modeFrequencies[i], 0.499);
            const modeQ = 1.0 + modeFreq * (i === 0 ? q : q * 0.25);
            this.resonators[i].setFQ(modeFreq, modeQ);
        }

        // Setup noise filter
        const noiseFreq = constrain(f0 * 16.0, 0.0, 0.499);
        this.noiseFilter.setFQ(noiseFreq, 1.0 + noiseFreq * 1.5);

        // Trigger pulse
        this.pulseRemainingSamples = kTriggerPulseDuration;
        this.pulseHeight = 3.0 + 7.0 * 0.8; // Fixed accent
        this.noiseEnvelope = 2.0;

        // Store parameters
        this.f0 = f0;
        this.f0Hz = f0Hz;
        this.modeFrequencies = modeFrequencies;
        this.modeGains = modeGains;
        this.exciterLeak = exciterLeak;
        this.noiseEnvelopeDecay = noiseEnvelopeDecay;
        this.snapAdjusted = snapAdjusted;
        this.level = level;

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
        const kPulseDecayTime = 0.1e-3 * this.sampleRate; // 0.1ms

        const levelGain = this.level;

        for (let i = 0; i < bufferSize; i++) {
            // Generate pulse exciter
            let pulse = 0.0;
            if (this.pulseRemainingSamples > 0) {
                this.pulseRemainingSamples--;
                pulse = this.pulseRemainingSamples > 0 ?
                    this.pulseHeight : this.pulseHeight - 1.0;
                this.pulse = pulse;
            } else {
                this.pulse *= 1.0 - 1.0 / kPulseDecayTime;
                pulse = this.pulse;
            }

            // Pulse lowpass (0.75 coefficient)
            this.pulseLp = onePole(this.pulseLp, pulse, 0.75);

            // Process all 5 modal resonators
            let shell = 0.0;
            for (let m = 0; m < this.NUM_MODES; m++) {
                // Different excitation for fundamental vs overtones
                const excitation = (m === 0) ?
                    (pulse - this.pulseLp) + 0.006 * pulse :
                    0.026 * pulse;

                // Process resonator and add exciter leak
                const resonatorOut = this.resonators[m].process(excitation);
                shell += this.modeGains[m] *
                    (resonatorOut.bp + excitation * this.exciterLeak);
            }

            // Soft clip shell
            shell = softClip(shell);

            // Generate noise (half-wave rectified)
            let noise = 2.0 * Math.random() - 1.0;
            if (noise < 0.0) noise = 0.0;

            // Apply noise envelope
            this.noiseEnvelope *= this.noiseEnvelopeDecay;
            noise *= this.noiseEnvelope * this.snapAdjusted * 2.0;

            // Filter noise
            const noiseFiltered = this.noiseFilter.process(noise);
            noise = noiseFiltered.bp;

            // Mix shell and noise (snap controls balance)
            this.renderBuffer[i] = (noise + shell * (1.0 - this.snapAdjusted)) * levelGain * 1.5; // Boosted from 0.6 to match other engines
        }
    }

    /**
     * Check if snare is still active (for voice cleanup)
     * @returns {boolean} True if still producing sound
     * Threshold lowered from -80dB (0.00001) to -120dB (0.000001) to prevent
     * cutoff clicks with long decay/high-Q resonator settings
     */
    isActive() {
        return this.noiseEnvelope > 0.000001 ||
               this.pulseRemainingSamples > 0 ||
               Math.abs(this.pulse) > 0.000001;
    }

    /**
     * Get preset values for different snare types
     * @param {string} type - Preset type: '808', '909', 'tight', 'deep'
     * @returns {object} Parameter values {patch, depth, rate}
     */
    static getPreset(type) {
        const presets = {
            '808': { patch: 40, depth: 60, rate: 40 },  // Balanced body and snap
            '909': { patch: 70, depth: 40, rate: 60 },  // Snappy, bright
            'tight': { patch: 80, depth: 25, rate: 50 }, // Very short, crisp
            'deep': { patch: 30, depth: 75, rate: 30 }   // Long, dark
        };
        return presets[type] || presets['808'];
    }
}
