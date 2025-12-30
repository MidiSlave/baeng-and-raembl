/**
 * Pitch Detection Module
 *
 * Harmonic Product Spectrum (HPS) algorithm for detecting fundamental frequency
 * of DX7 patches. Used to calculate tuning offsets for patches that are
 * inherently detuned from A=440 equal temperament.
 */

import FMVoice from '../dx7/voice-dx7.js';

// Constants
const SAMPLE_RATE = 44100;
const FFT_SIZE = 4096;
const REFERENCE_NOTE = 60; // C4 (Middle C)
const REFERENCE_FREQ = 261.63; // C4 in Hz
const MIN_FREQ = 20;
const MAX_FREQ = 4000;
const SKIP_TRANSIENT_MS = 50; // Skip attack transient
const ANALYSIS_WINDOW_MS = 100; // Analysis window duration

/**
 * PitchDetector - Harmonic Product Spectrum pitch detection
 */
export class PitchDetector {
    constructor(sampleRate = SAMPLE_RATE) {
        this.sampleRate = sampleRate;
        this.fftSize = FFT_SIZE;
        this.halfSize = FFT_SIZE / 2;

        // Pre-compute twiddle factors for FFT
        this.cosTable = new Float32Array(this.halfSize);
        this.sinTable = new Float32Array(this.halfSize);

        for (let i = 0; i < this.halfSize; i++) {
            const angle = (2.0 * Math.PI * i) / this.fftSize;
            this.cosTable[i] = Math.cos(angle);
            this.sinTable[i] = Math.sin(angle);
        }

        // Working buffers
        this.complexBuffer = new Float32Array(this.fftSize * 2);
        this.magnitudeSpectrum = new Float32Array(this.halfSize);
        this.hpsSpectrum = new Float32Array(this.halfSize);
        this.hannWindow = new Float32Array(this.fftSize);

        // Pre-compute Hann window
        for (let i = 0; i < this.fftSize; i++) {
            this.hannWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (this.fftSize - 1)));
        }
    }

    /**
     * Detect pitch from audio buffer
     * @param {Float32Array} audioData - Audio samples (mono)
     * @returns {Object} { frequency, midiNote, cents, confidence, detected }
     */
    detect(audioData) {
        // Skip transient and extract analysis window
        const skipSamples = Math.floor(SKIP_TRANSIENT_MS * this.sampleRate / 1000);
        const windowSamples = Math.min(
            Math.floor(ANALYSIS_WINDOW_MS * this.sampleRate / 1000),
            this.fftSize
        );

        if (audioData.length < skipSamples + windowSamples) {
            return { frequency: 0, midiNote: 0, cents: 0, confidence: 0, detected: false };
        }

        // Apply Hann window to analysis segment
        const windowed = new Float32Array(this.fftSize);
        for (let i = 0; i < windowSamples; i++) {
            windowed[i] = audioData[skipSamples + i] * this.hannWindow[i];
        }

        // Compute FFT
        this._forward(windowed);

        // Compute magnitude spectrum
        for (let i = 0; i < this.halfSize; i++) {
            const re = this.complexBuffer[i * 2];
            const im = this.complexBuffer[i * 2 + 1];
            this.magnitudeSpectrum[i] = Math.sqrt(re * re + im * im);
        }

        // Harmonic Product Spectrum
        // Multiply spectrum with downsampled versions (harmonics 2, 3, 4, 5)
        for (let i = 0; i < this.halfSize; i++) {
            this.hpsSpectrum[i] = this.magnitudeSpectrum[i];
        }

        const harmonics = [2, 3, 4, 5];
        for (const h of harmonics) {
            for (let i = 0; i < Math.floor(this.halfSize / h); i++) {
                this.hpsSpectrum[i] *= this.magnitudeSpectrum[i * h];
            }
        }

        // Find peak in valid frequency range
        const minBin = Math.floor(MIN_FREQ * this.fftSize / this.sampleRate);
        const maxBin = Math.floor(MAX_FREQ * this.fftSize / this.sampleRate);

        let peakBin = minBin;
        let peakValue = 0;

        for (let i = minBin; i < maxBin && i < this.halfSize; i++) {
            if (this.hpsSpectrum[i] > peakValue) {
                peakValue = this.hpsSpectrum[i];
                peakBin = i;
            }
        }

        // Parabolic interpolation for sub-bin accuracy
        let exactBin = peakBin;
        if (peakBin > 0 && peakBin < this.halfSize - 1) {
            const alpha = this.hpsSpectrum[peakBin - 1];
            const beta = this.hpsSpectrum[peakBin];
            const gamma = this.hpsSpectrum[peakBin + 1];

            if (beta > 0) {
                const p = 0.5 * (alpha - gamma) / (alpha - 2 * beta + gamma);
                exactBin = peakBin + p;
            }
        }

        // Convert bin to frequency
        const frequency = exactBin * this.sampleRate / this.fftSize;

        // Calculate confidence from peak prominence
        let totalEnergy = 0;
        for (let i = minBin; i < maxBin && i < this.halfSize; i++) {
            totalEnergy += this.hpsSpectrum[i];
        }

        const confidence = totalEnergy > 0 ? peakValue / totalEnergy : 0;

        // Convert to MIDI note
        const midiNote = this._frequencyToMidi(frequency);
        const cents = (midiNote - Math.round(midiNote)) * 100;

        return {
            frequency,
            midiNote: Math.round(midiNote),
            cents: Math.round(cents * 10) / 10,
            confidence: Math.round(confidence * 1000) / 1000,
            detected: confidence > 0.05 && frequency >= MIN_FREQ && frequency <= MAX_FREQ
        };
    }

    /**
     * Forward FFT (real input)
     * @private
     */
    _forward(realIn) {
        const N = this.fftSize;

        // Convert real input to complex (interleaved format)
        for (let i = 0; i < N; i++) {
            this.complexBuffer[i * 2] = realIn[i];
            this.complexBuffer[i * 2 + 1] = 0;
        }

        // Bit-reverse complex pairs
        this._bitReverseComplex(N);

        // Cooley-Tukey complex FFT
        for (let len = 2; len <= N; len *= 2) {
            const halfLen = len / 2;
            const tableStep = N / len;

            for (let i = 0; i < N; i += len) {
                for (let j = 0; j < halfLen; j++) {
                    const k = j * tableStep;
                    const cos = this.cosTable[k];
                    const sin = -this.sinTable[k]; // Negative for forward FFT

                    const evenIdx = (i + j) * 2;
                    const oddIdx = (i + j + halfLen) * 2;

                    const evenRe = this.complexBuffer[evenIdx];
                    const evenIm = this.complexBuffer[evenIdx + 1];
                    const oddRe = this.complexBuffer[oddIdx];
                    const oddIm = this.complexBuffer[oddIdx + 1];

                    const tRe = oddRe * cos - oddIm * sin;
                    const tIm = oddRe * sin + oddIm * cos;

                    this.complexBuffer[evenIdx] = evenRe + tRe;
                    this.complexBuffer[evenIdx + 1] = evenIm + tIm;
                    this.complexBuffer[oddIdx] = evenRe - tRe;
                    this.complexBuffer[oddIdx + 1] = evenIm - tIm;
                }
            }
        }
    }

    /**
     * Bit-reversal permutation for complex pairs (in-place)
     * @private
     */
    _bitReverseComplex(n) {
        const numBits = Math.log2(n);

        for (let i = 0; i < n; i++) {
            let j = 0;
            for (let bit = 0; bit < numBits; bit++) {
                if (i & (1 << bit)) {
                    j |= 1 << (numBits - 1 - bit);
                }
            }

            if (j > i) {
                const tempRe = this.complexBuffer[i * 2];
                const tempIm = this.complexBuffer[i * 2 + 1];
                this.complexBuffer[i * 2] = this.complexBuffer[j * 2];
                this.complexBuffer[i * 2 + 1] = this.complexBuffer[j * 2 + 1];
                this.complexBuffer[j * 2] = tempRe;
                this.complexBuffer[j * 2 + 1] = tempIm;
            }
        }
    }

    /**
     * Convert frequency to MIDI note number (with fractional part)
     * @private
     */
    _frequencyToMidi(frequency) {
        if (frequency <= 0) return 0;
        return 69 + 12 * Math.log2(frequency / 440);
    }
}

/**
 * Render DX7 patch offline (synchronous, no AudioContext)
 * Uses FMVoice directly for sample-by-sample synthesis
 *
 * @param {Object} patchData - Parsed DX7 patch parameters
 * @param {number} midiNote - MIDI note to render (default 60 = C4)
 * @param {number} duration - Duration in seconds (default 0.3)
 * @param {number} sampleRate - Sample rate (default 44100)
 * @returns {Float32Array} Mono audio buffer
 */
export function renderDX7Offline(patchData, midiNote = REFERENCE_NOTE, duration = 0.3, sampleRate = SAMPLE_RATE) {
    const numSamples = Math.floor(duration * sampleRate);
    const output = new Float32Array(numSamples);

    // Set global params for FMVoice
    FMVoice.setParams(patchData);
    FMVoice.initializeAllOperators(patchData);

    // Reset static state
    FMVoice.bend = 0;
    FMVoice.mod = 0;
    FMVoice.aftertouch = 0;

    // Create voice instance
    const voice = new FMVoice(midiNote, 1.0); // Full velocity

    // Render sample by sample
    for (let i = 0; i < numSamples; i++) {
        const [left, right] = voice.render();
        output[i] = (left + right) * 0.5; // Mix to mono
    }

    return output;
}

/**
 * Calculate tuning offset in cents
 *
 * Returns the full offset including octave differences.
 * If a patch plays an octave high, the offset will be ~-1200 cents.
 *
 * @param {number} detectedHz - Detected frequency in Hz
 * @param {number} expectedHz - Expected frequency in Hz (default 261.63 for C4)
 * @returns {number} Offset in cents (positive = sharp/flat, negative = sharp/high)
 */
export function calculateTuningOffset(detectedHz, expectedHz = REFERENCE_FREQ) {
    if (detectedHz <= 0 || expectedHz <= 0) return 0;
    return 1200 * Math.log2(expectedHz / detectedHz);
}

/**
 * Convert cents offset to frequency multiplier
 *
 * @param {number} cents - Cents offset
 * @returns {number} Frequency multiplier
 */
export function centsToMultiplier(cents) {
    return Math.pow(2, cents / 1200);
}

/**
 * Convert MIDI note to frequency (A4 = 440 Hz)
 *
 * @param {number} midiNote - MIDI note number
 * @returns {number} Frequency in Hz
 */
export function midiToFrequency(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

// Export constants for external use
export const TUNING_CONSTANTS = {
    SAMPLE_RATE,
    FFT_SIZE,
    REFERENCE_NOTE,
    REFERENCE_FREQ,
    MIN_FREQ,
    MAX_FREQ
};
