/**
 * Analog Kick Drum Engine
 *
 * Based on Mutable Instruments Plaits analog_bass_drum
 * TR-808 style kick drum synthesis:
 * - Pulse exciter → Diode shaping → Self-modulating resonator → Tone LP
 *
 * Ported from test/analog-drums/kick-test.html
 */

import {
    SVF,
    SineOscillator,
    semitonesToRatio,
    constrain,
    diode,
    onePole
} from './analog-dsp-utils.js';

// =============================================================================
// DSP Utilities (from stmlib/dsp/dsp.h)
// =============================================================================

/**
 * SoftLimit - Rational soft limiter
 * x * (27 + x²) / (27 + 9x²)
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
// Overdrive FX (from plaits/dsp/fx/overdrive.h)
// =============================================================================

/**
 * Overdrive processor with interpolated pre/post gain
 * Used on AnalogBassDrum (808) output for aggressive character
 */
class Overdrive {
    constructor() {
        this.preGain = 0.0;
        this.postGain = 0.0;
    }

    init() {
        this.preGain = 0.0;
        this.postGain = 0.0;
    }

    /**
     * Process audio buffer with drive-dependent saturation
     * @param {number} drive - Drive amount (0.5 = clean, 1.0 = saturated)
     * @param {Float32Array} buffer - Audio buffer (modified in place)
     * @param {number} size - Buffer size
     */
    process(drive, buffer, size) {
        const drive2 = drive * drive;

        // Pre-gain calculation (from C++ overdrive.h:51-53)
        const preGainA = drive * 0.5;
        const preGainB = drive2 * drive2 * drive * 24.0;
        const preGain = preGainA + (preGainB - preGainA) * drive2;

        // Post-gain compensation (from C++ overdrive.h:54-56)
        const driveSquashed = drive * (2.0 - drive);
        const postGain = 1.0 / softClip(0.33 + driveSquashed * (preGain - 0.33));

        // Parameter interpolation (smooth gain changes)
        const preGainIncr = (preGain - this.preGain) / size;
        const postGainIncr = (postGain - this.postGain) / size;

        let currentPreGain = this.preGain;
        let currentPostGain = this.postGain;

        for (let i = 0; i < size; i++) {
            currentPreGain += preGainIncr;
            currentPostGain += postGainIncr;

            const pre = currentPreGain * buffer[i];
            buffer[i] = softClip(pre) * currentPostGain;
        }

        this.preGain = preGain;
        this.postGain = postGain;
    }
}

export class AnalogKick {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;

        // State variables
        this.pulseRemainingSamples = 0;
        this.fmPulseRemainingSamples = 0;
        this.pulse = 0.0;
        this.pulseHeight = 0.0;
        this.pulseLp = 0.0;
        this.fmPulseLp = 0.0;
        this.retrigPulse = 0.0;
        this.lpOut = 0.0;
        this.toneLp = 0.0;
        this.sustainGain = 0.0;

        // Anti-click attack envelope (matches Plaits design)
        // Smooths pulse discontinuity on fast retriggering to prevent clicks
        this.pulseAttackEnv = 0.0;
        this.pulseAttackCoeff = Math.exp(-1.0 / (0.001 * this.sampleRate)); // 1ms time constant

        // Output crossfade on retrigger (fade out old tail before new attack)
        this.outputFadeGain = 1.0;
        this.outputFadeActive = false;
        this.outputFadeCoeff = Math.exp(-1.0 / (0.0005 * this.sampleRate)); // 0.5ms fadeout
        this.fadingTail = 0.0;  // Captured tail energy being faded out

        // DSP components
        this.resonator = new SVF();
        this.oscillator = new SineOscillator();
        this.overdrive = new Overdrive();

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

        // Track if this is the first trigger (for initialization)
        this.hasBeenTriggered = false;
    }

    /**
     * Set parameters from UI (0-100 range)
     * Called by engine.js with analogKickTone, macroPitch, analogKickDecay, analogKickSweep
     */
    setParameters(tone, pitch, decay, sweep) {
        // Store as 0-1 normalized values for trigger()
        this.toneParam = tone / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.sweepParam = sweep / 100;
        this.levelParam = 0.85; // Fixed level
    }

    /**
     * Update parameters in real-time on an active voice
     * Called by per-parameter modulation system
     * @param {number} tone - Tone parameter (0-100)
     * @param {number} pitch - Pitch parameter (0-100)
     * @param {number} decay - Decay parameter (0-100)
     * @param {number} sweep - Sweep parameter (0-100)
     */
    updateParameters(tone, pitch, decay, sweep) {
        // Update stored normalized parameters
        this.toneParam = tone / 100;
        this.pitchParam = pitch / 100;
        this.decayParam = decay / 100;
        this.sweepParam = sweep / 100;

        // Recalculate derived parameters that affect ongoing sound
        const toneNorm = this.toneParam;
        const pitchNorm = this.pitchParam;
        const decayNorm = this.decayParam;
        const sweepNorm = this.sweepParam;

        // Map PITCH (0-1) to f0 frequency (30-80 Hz)
        const f0Hz = 30.0 + pitchNorm * 50.0;
        const f0 = f0Hz / this.sampleRate;

        // Map SWEEP (0-1) to FM amounts using Plaits crossfade curve
        // Attack FM saturates at sweep=0.25, then self FM kicks in
        const attackFMAmount = Math.min(sweepNorm * 4.0, 1.0);
        const selfFMAmount = Math.max(Math.min(sweepNorm * 4.0 - 1.0, 1.0), 0.0);

        // Calculate parameters (using normalized frequency)
        const scale = 0.001 / f0;
        const q = 1500.0 * semitonesToRatio(decayNorm * 80.0);
        const toneF = Math.min(
            4.0 * f0 * semitonesToRatio(toneNorm * 108.0),
            1.0
        );
        const exciterLeak = 0.08 * (toneNorm + 0.25);

        // Update real-time parameters (these affect the ongoing sound)
        this.f0 = f0;
        this.f0Hz = f0Hz;
        this.scale = scale;
        this.q = q;
        this.toneF = toneF;
        this.exciterLeak = exciterLeak;
        this.attackFMAmount = attackFMAmount;
        this.selfFMAmount = selfFMAmount;
    }

    /**
     * Trigger the kick (called by engine.js)
     * @param {number} accent - Accent level (0-1)
     */
    trigger(accent = 1.0) {
        // Use stored normalized parameters
        const tone = this.toneParam;
        const pitch = this.pitchParam;
        const decay = this.decayParam;
        const sweep = this.sweepParam;
        const level = this.levelParam * accent;

        // Constants (scaled to sample rate)
        const kTriggerPulseDuration = Math.floor(0.001 * this.sampleRate); // 1ms
        const kFMPulseDuration = Math.floor(0.006 * this.sampleRate);      // 6ms

        // Map PITCH (0-1) to f0 frequency (30-80 Hz)
        const f0Hz = 30.0 + pitch * 50.0;
        const f0 = f0Hz / this.sampleRate;

        // Map SWEEP (0-1) to FM amounts using Plaits crossfade curve
        // Attack FM saturates at sweep=0.25, then self FM kicks in
        const attackFMAmount = Math.min(sweep * 4.0, 1.0);
        const selfFMAmount = Math.max(Math.min(sweep * 4.0 - 1.0, 1.0), 0.0);

        // Calculate parameters (using normalized frequency)
        const scale = 0.001 / f0;
        const q = 1500.0 * semitonesToRatio(decay * 80.0);
        const toneF = Math.min(
            4.0 * f0 * semitonesToRatio(tone * 108.0),
            1.0
        );
        const exciterLeak = 0.08 * (tone + 0.25);

        // Store parameters for render
        this.f0 = f0;
        this.f0Hz = f0Hz;
        this.scale = scale;
        this.q = q;
        this.toneF = toneF;
        this.exciterLeak = exciterLeak;
        this.attackFMAmount = attackFMAmount;
        this.selfFMAmount = selfFMAmount;
        this.level = level;

        // Smooth monophonic retriggering strategy:
        // - FIRST trigger: Reset everything (initialize DSP state)
        // - SUBSEQUENT triggers: Only reset exciter, let resonator ring
        // This prevents NaN on first trigger and clicks on retriggering

        if (!this.hasBeenTriggered) {
            // First trigger: Initialize all DSP state
            this.resonator.reset();
            this.oscillator.reset();
            this.lpOut = 0.0;
            this.toneLp = 0.0;
            this.hasBeenTriggered = true;
        }

        // Reset exciter pulse generator (creates new attack)
        // Note: pulseLp, fmPulseLp, and retrigPulse are NOT reset - let them
        // naturally track/decay to avoid discontinuity clicks on fast retriggering
        this.pulse = 0.0;
        this.pulseHeight = 3.0 + 7.0 * 0.7; // Fixed accent

        // Reset attack envelope for anti-click (smooth 1ms rise instead of instant jump)
        this.pulseAttackEnv = 0.0;

        // Fade internal filter states toward zero on retrigger (prevents old+new amplitude spike)
        // This matches Plaits' lp_out_ = 0.0 reset, but done smoothly
        if (Math.abs(this.toneLp) > 0.001) {
            this.outputFadeActive = true;
            this.outputFadeGain = 1.0;
            // Capture the current tail energy to fade it out separately
            this.fadingTail = this.toneLp;
            this.toneLp = 0.0;  // Reset main filter (new attack starts clean)
            this.lpOut = 0.0;   // Reset punch calculator too
        }

        // Trigger pulses
        this.pulseRemainingSamples = kTriggerPulseDuration;
        this.fmPulseRemainingSamples = kFMPulseDuration;

        // Force buffer render on next process() call by setting position beyond size
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
        const kPulseDecayTime = 0.0002 * this.sampleRate;    // 0.2ms
        const kPulseFilterTime = 0.0001 * this.sampleRate;   // 0.1ms
        const kRetrigPulseDuration = 0.025 * this.sampleRate; // 25ms (reduced from 50ms to shift inflection zone earlier)

        const attackFMAmount = this.attackFMAmount;
        const selfFMAmount = this.selfFMAmount;
        const levelGain = this.level;

        for (let i = 0; i < bufferSize; i++) {
            // Generate pulse exciter (Q39/Q40 in 808 schematic)
            let pulse = 0.0;
            if (this.pulseRemainingSamples > 0) {
                this.pulseRemainingSamples--;
                pulse = this.pulseRemainingSamples > 0 ? this.pulseHeight : this.pulseHeight - 1.0;
                this.pulse = pulse;
            } else {
                this.pulse *= (1.0 - 1.0 / kPulseDecayTime);
                pulse = this.pulse;
            }

            // Apply attack envelope for anti-click (smooths discontinuity on fast retriggering)
            // This matches Plaits' kPulseFilterTime anti-click approach
            this.pulseAttackEnv += (1.0 - this.pulseAttackEnv) * (1.0 - this.pulseAttackCoeff);
            pulse *= this.pulseAttackEnv;

            // Filter and shape pulse (C40/R163/R162/D83)
            this.pulseLp = onePole(this.pulseLp, pulse, 1.0 / kPulseFilterTime);
            pulse = diode((pulse - this.pulseLp) + pulse * 0.044);

            // FM pulse for attack (Q41/Q42)
            let fmPulse = 0.0;
            if (this.fmPulseRemainingSamples > 0) {
                this.fmPulseRemainingSamples--;
                fmPulse = 1.0;
                // Set retrigPulse spike ONLY at the very end of FM pulse
                // (don't force to 0 during pulse - causes clicks on fast retriggering)
                if (this.fmPulseRemainingSamples === 0) {
                    this.retrigPulse = -0.8;
                }
            }
            // Always apply natural decay (prevents discontinuity on retriggering)
            this.retrigPulse *= (1.0 - 1.0 / kRetrigPulseDuration);
            this.fmPulseLp = onePole(this.fmPulseLp, fmPulse, 1.0 / kPulseFilterTime);

            // Calculate punch (Q43/R170)
            const punch = 0.7 + diode(10.0 * this.lpOut - 1.0);

            // Frequency modulation (Q43/R165)
            const attackFM = this.fmPulseLp * 1.7 * attackFMAmount;
            const selfFM = punch * 0.08 * selfFMAmount;
            const f = constrain(this.f0 * (1.0 + attackFM + selfFM), 0.0, 0.4);

            // Process through resonator
            this.resonator.setFQ(f, 1.0 + this.q * f);
            const resonatorInput = (pulse - this.retrigPulse * 0.2) * this.scale;
            const resonatorOut = this.resonator.process(resonatorInput);

            this.lpOut = resonatorOut.lp;

            // Final tone lowpass (mixes exciter + resonator)
            this.toneLp = onePole(
                this.toneLp,
                pulse * this.exciterLeak + resonatorOut.bp,
                this.toneF
            );

            // Blend fading tail (old energy) with new kick output
            let output = this.toneLp * 2.3 * levelGain;
            if (this.outputFadeActive) {
                // Add fading tail (captured old energy, fading out)
                output += this.fadingTail * 2.3 * levelGain * this.outputFadeGain;
                this.outputFadeGain *= this.outputFadeCoeff;
                if (this.outputFadeGain < 0.001) {
                    this.outputFadeActive = false;
                    this.fadingTail = 0.0;
                }
            }

            this.renderBuffer[i] = output;
        }

        // Apply overdrive based on sweep parameter (from Plaits bass_drum_engine.cc:75-78)
        // Drive is frequency-dependent: disabled at high frequencies via max(1 - 16*f0, 0)
        // At sweep > 0.5, progressive overdrive saturation is applied
        const drive = Math.max(this.sweepParam * 2.0 - 1.0, 0.0) * Math.max(1.0 - 16.0 * this.f0, 0.0);
        if (drive > 0.01) {
            this.overdrive.process(0.5 + 0.5 * drive, this.renderBuffer, bufferSize);
        }
    }

    /**
     * Check if kick is still active (for voice cleanup)
     * @returns {boolean} True if still producing sound
     * Threshold lowered from -80dB (0.00001) to -120dB (0.000001) to prevent
     * cutoff clicks with long decay/high-Q resonator settings
     */
    isActive() {
        return Math.abs(this.toneLp) > 0.000001 ||
               this.pulseRemainingSamples > 0 ||
               this.fmPulseRemainingSamples > 0;
    }

    /**
     * Get preset values for different kick types
     * @param {string} type - Preset type: '808', '909', 'sub', 'tight'
     * @returns {object} Parameter values {patch, depth, rate}
     */
    static getPreset(type) {
        const presets = {
            '808': { patch: 40, depth: 70, rate: 70 },  // Classic 808: boomy, strong sweep
            '909': { patch: 70, depth: 45, rate: 50 },  // Punchy 909: bright, moderate sweep
            'sub': { patch: 20, depth: 80, rate: 60 },  // Sub kick: dark, long decay
            'tight': { patch: 85, depth: 25, rate: 40 } // Tight kick: bright, short, minimal sweep
        };
        return presets[type] || presets['808'];
    }
}
