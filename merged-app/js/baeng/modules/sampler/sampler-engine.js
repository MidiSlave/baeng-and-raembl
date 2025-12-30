// File: js/modules/sampler/sampler-engine.js
// Sample playback engine for Bæng
// Manages sample loading, playback, and processing

import { StateVariableFilter, ExponentialEnvelope } from '../analog/dsp-blocks.js';

/**
 * Sample Playback Engine
 *
 * Features:
 * - Buffer-based sample playback
 * - Pitch shifting via playback rate
 * - Lowpass filter for tone control
 * - Amplitude decay envelope
 *
 * Parameters (3-knob control):
 * - SAMPLE (PATCH): Sample selection (0-127 MIDI note style)
 * - DECAY (DEPTH): Amplitude decay amount (0-100)
 * - FILTER (RATE): Lowpass filter cutoff (0-100)
 */
export class SamplerEngine {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;

        // Sample buffer (loaded externally)
        this.buffer = null;
        this.bufferData = null; // Float32Array of sample data

        // Playback state
        this.playbackPosition = 0;
        this.playbackRate = 1.0;
        this.isPlaying = false;

        // Slice support (Phase 2: AudioWorklet Integration)
        this.sliceMode = false;      // true = slice mode, false = full buffer
        this.playbackStart = 0;      // Start position (sample index)
        this.playbackEnd = 0;        // End position (sample index)

        // Envelope for decay control
        this.ampEnv = new ExponentialEnvelope();

        // Lowpass filter for tone shaping
        this.lpFilter = new StateVariableFilter(sampleRate);

        // Parameters (set via setParameters method)
        this.decay = 0.5;        // Decay amount (0-1)
        this.filterCutoff = 8000; // Filter cutoff (Hz)
        this.filterMode = 'none'; // 'lp', 'hp', or 'none'
        this.useFilter = false;  // Whether to apply filter
        this.useDecay = true;    // Whether to apply decay envelope
        this.accentLevel = 1.0;  // Accent scaling (matches analog engines)
    }

    /**
     * Load a sample buffer
     * @param {AudioBuffer} buffer - Web Audio API AudioBuffer
     * @param {number} sliceStart - Optional slice start position (sample index)
     * @param {number} sliceEnd - Optional slice end position (sample index)
     */
    loadBuffer(buffer, sliceStart = null, sliceEnd = null) {
        this.buffer = buffer;
        // Extract mono channel data (mix down if stereo)
        if (buffer.numberOfChannels === 1) {
            this.bufferData = buffer.getChannelData(0);
        } else {
            // Mix stereo to mono
            const left = buffer.getChannelData(0);
            const right = buffer.getChannelData(1);
            this.bufferData = new Float32Array(left.length);
            for (let i = 0; i < left.length; i++) {
                this.bufferData[i] = (left[i] + right[i]) * 0.5;
            }
        }

        // Configure slice bounds
        if (sliceStart !== null && sliceEnd !== null) {
            // Slice mode: set playback boundaries
            this.sliceMode = true;
            this.playbackStart = Math.max(0, Math.min(this.bufferData.length - 1, sliceStart));
            this.playbackEnd = Math.max(this.playbackStart + 1, Math.min(this.bufferData.length, sliceEnd));
        } else {
            // Full buffer mode (existing behavior)
            this.sliceMode = false;
            this.playbackStart = 0;
            this.playbackEnd = this.bufferData.length;
        }
    }

    /**
     * Trigger sample playback
     * @param {number} accent - Accent level (0-1)
     * @param {number} pitch - Pitch in semitones relative to original (0 = original pitch)
     */
    trigger(accent = 1.0, pitch = 0) {
        if (!this.bufferData) {
            console.warn('[SamplerEngine] No buffer loaded');
            return;
        }

        // Reset playback position to slice start (or 0 for full buffer mode)
        this.playbackPosition = this.playbackStart;
        this.isPlaying = true;

        // Set playback rate based on pitch (semitones to ratio)
        this.playbackRate = Math.pow(2, pitch / 12);
        // [CRITICAL DEBUG] Silence mystery - where playbackRate is set
        // console.log(`[SamplerEngine.trigger] playbackRate=${this.playbackRate}, pitch=${pitch}`);

        // Trigger amplitude envelope
        if (this.decay < 0.99) {
            this.useDecay = true;
            this.ampEnv.trigger(1.0);

            // SLICE BUG FIX: Calculate decay relative to slice length (pitch-aware)
            const sliceLengthSamples = (this.playbackEnd - this.playbackStart) / this.playbackRate;
            const sliceDurationMs = (sliceLengthSamples / this.sampleRate) * 1000;

            if (sliceDurationMs < 1) {
                console.warn('[SamplerEngine] Slice duration too short, using minimum decay');
                this.ampEnv.setDecayDirect(0.9);
            } else {
                // Map decay (0-0.99) to percentage of slice duration (10%-110%)
                // 0 = 10% of slice (punchy), 0.99 = 110% (extends beyond slice)
                const decayPercentage = 0.1 + (this.decay / 0.99) * 1.0;
                const targetDecayMs = sliceDurationMs * decayPercentage;

                // Calculate coefficient: coeff = exp(ln(threshold) / samples)
                const targetSamples = (targetDecayMs / 1000) * this.sampleRate;
                const threshold = 0.00001; // Match ExponentialEnvelope.isActive() threshold
                const decayCoeff = Math.exp(Math.log(threshold) / targetSamples);
                const clampedCoeff = Math.max(0.5, Math.min(0.99999, decayCoeff));

                this.ampEnv.setDecayDirect(clampedCoeff);
            }
        } else {
            // No decay envelope (99-100% = full sample playback)
            this.useDecay = false;
        }

        // Reset and configure lowpass filter
        this.lpFilter.reset();
        this.lpFilter.setFrequency(this.filterCutoff);
        this.lpFilter.setResonance(0.5); // Gentle rolloff

        // Store accent for output scaling (matches analog engine behavior)
        this.accentLevel = accent;
    }

    /**
     * Process one sample
     * @returns {number} Output sample
     */
    process() {
        if (!this.isPlaying || !this.bufferData) {
            return 0;
        }

        // Check if we've reached the slice end (or buffer end in full mode)
        if (this.playbackPosition >= this.playbackEnd) {
            this.isPlaying = false;
            return 0;
        }

        // Get current sample via linear interpolation
        const index = Math.floor(this.playbackPosition);
        const frac = this.playbackPosition - index;

        let sample = 0;
        // Ensure interpolation stays within slice bounds
        if (index < this.playbackEnd - 1) {
            // Linear interpolation between current and next sample
            const current = this.bufferData[index];
            const next = this.bufferData[index + 1];
            sample = current + (next - current) * frac;
        } else if (index < this.playbackEnd) {
            // Last sample, no interpolation
            sample = this.bufferData[index];
        } else {
            // End of slice
            this.isPlaying = false;
            return 0;
        }

        // Apply short fadeout near end of slice/buffer to prevent clicks
        const samplesFromEnd = this.playbackEnd - this.playbackPosition;
        const fadeoutSamples = 32; // Very short fadeout (less than 1ms at 48kHz)
        if (samplesFromEnd < fadeoutSamples && samplesFromEnd > 0) {
            const fadeMultiplier = samplesFromEnd / fadeoutSamples;
            sample *= fadeMultiplier;
        }

        // Apply filter (if enabled)
        if (this.useFilter) {
            sample = this.lpFilter.process(sample, this.filterMode);
        }

        // Apply amplitude envelope if enabled
        if (this.useDecay) {
            const amp = this.ampEnv.process();
            sample *= amp;
            // SLICE BUG FIX: Envelope stop check removed - slice plays to natural boundary
            // (Decay now coupled to slice length, so envelope shapes amplitude without cutoff)
        }

        // [CRITICAL DEBUG] Silence mystery - sample rendering loop (first 10 samples only)
        // if (this.playbackPosition < 10) {
        //     console.log(`[SamplerEngine.process] pos=${this.playbackPosition.toFixed(2)}, sample=${sample.toFixed(4)}, rate=${this.playbackRate.toFixed(4)}`);
        // }

        // Advance playback position
        this.playbackPosition += this.playbackRate;

        // Apply accent scaling (matches analog engine behavior)
        return sample * this.accentLevel;
    }

    /**
     * Set sampler parameters from UI (3-knob control)
     * @param {number} sampleIndex - Sample number (0-127)
     * @param {number} decay - DECAY knob (0-100)
     * @param {number} filter - FILTER knob (0-100)
     */
    setParameters(sampleIndex, decay, filter) {
        // SAMPLE index is handled externally during voice creation
        // (different samples are loaded per voice)

        // DEPTH → DECAY: Amplitude decay amount
        this.decay = decay / 100;

        // RATE → FILTER: LP/None/HP with 50 as center (no filter)
        // 0-50: Lowpass (4kHz down to 200Hz)
        // 50: No filter (bypass)
        // 50-100: Highpass (200Hz up to 4kHz)
        if (filter < 50) {
            // Lowpass mode
            this.filterMode = 'lp';
            const lpNorm = (50 - filter) / 50; // 0 at 50, 1 at 0
            this.filterCutoff = 4000 * Math.pow(0.05, lpNorm); // 4kHz to 200Hz
            this.useFilter = true;
        } else if (filter > 50) {
            // Highpass mode
            this.filterMode = 'hp';
            const hpNorm = (filter - 50) / 50; // 0 at 50, 1 at 100
            this.filterCutoff = 200 * Math.pow(20, hpNorm); // 200Hz to 4kHz
            this.useFilter = true;
        } else {
            // No filter at 50
            this.filterMode = 'none';
            this.useFilter = false;
        }
    }

    /**
     * Check if sampler is still playing
     * @returns {boolean} True if playback is active
     */
    isActive() {
        return this.isPlaying;
    }

    /**
     * Stop playback immediately
     */
    stop() {
        this.isPlaying = false;
    }
}

/**
 * Sample Bank Manager
 * Handles loading and organizing sample banks
 */
export class SampleBankManager {
    constructor() {
        this.banks = new Map(); // bank name → Array of {name, buffer}
        this.currentBank = null;
        this.audioContext = null;
    }

    /**
     * Set the audio context for decoding samples
     * @param {AudioContext} ctx - Web Audio API context
     */
    setAudioContext(ctx) {
        this.audioContext = ctx;
    }

    /**
     * Load a sample bank from a manifest (legacy format with MIDI notes)
     * @param {string} bankName - Name of the bank (e.g., 'TR-909')
     * @param {Object} manifest - Bank manifest with sample URLs
     * @returns {Promise<void>}
     */
    async loadBank(bankName, manifest) {
        if (!this.audioContext) {
            throw new Error('AudioContext not set. Call setAudioContext() first.');
        }

        const sampleArray = [];

        // Convert MIDI note manifest to simple array
        const sortedNotes = Object.keys(manifest.samples)
            .map(n => parseInt(n))
            .sort((a, b) => a - b);

        for (const midiNote of sortedNotes) {
            const sampleUrl = manifest.samples[midiNote];
            try {
                const response = await fetch(sampleUrl);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                // Get name from manifest mapping or filename
                const name = manifest.mapping?.[midiNote] || sampleUrl.split('/').pop().replace('.wav', '');

                sampleArray.push({ name, buffer: audioBuffer });
            } catch (error) {
                console.error(`[SampleBankManager] Failed to load sample ${midiNote} from ${sampleUrl}:`, error);
            }
        }

        this.banks.set(bankName, sampleArray);

        // Set as current bank if it's the first one loaded
        if (!this.currentBank) {
            this.currentBank = bankName;
        }

        // console.log(`[SampleBankManager] Loaded bank "${bankName}" with ${sampleArray.length} samples`);
    }

    /**
     * Load samples from an array of files (drag & drop support)
     * @param {string} bankName - Name for the new bank
     * @param {File[]} files - Array of audio files
     * @returns {Promise<void>}
     */
    async loadBankFromFiles(bankName, files) {
        if (!this.audioContext) {
            throw new Error('AudioContext not set. Call setAudioContext() first.');
        }

        const sampleArray = [];

        for (const file of files) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                sampleArray.push({ name: file.name.replace(/\.(wav|mp3|ogg)$/i, ''), buffer: audioBuffer });
            } catch (error) {
                console.error(`[SampleBankManager] Failed to load ${file.name}:`, error);
            }
        }

        this.banks.set(bankName, sampleArray);
        this.currentBank = bankName;

        // console.log(`[SampleBankManager] Loaded bank "${bankName}" from files with ${sampleArray.length} samples`);
    }

    /**
     * Switch to a different sample bank
     * @param {string} bankName - Name of the bank to switch to
     */
    setCurrentBank(bankName) {
        if (!this.banks.has(bankName)) {
            console.error(`[SampleBankManager] Bank not found: ${bankName}`);
            return;
        }
        this.currentBank = bankName;
    }

    /**
     * Get a sample buffer from the current bank by index
     * @param {number} index - Array index (0 to N-1)
     * @returns {AudioBuffer|null} The audio buffer, or null if not found
     */
    getSample(index) {
        if (!this.currentBank) {
            console.error('[SampleBankManager] No current bank set');
            return null;
        }

        const bank = this.banks.get(this.currentBank);
        if (!bank || !Array.isArray(bank)) {
            console.error(`[SampleBankManager] Current bank not loaded: ${this.currentBank}`);
            return null;
        }

        if (index < 0 || index >= bank.length) {
            console.warn(`[SampleBankManager] Index ${index} out of range (0-${bank.length - 1})`);
            return null;
        }

        return bank[index].buffer;
    }

    /**
     * Get sample name by index
     * @param {number} index - Array index (0 to N-1)
     * @returns {string|null} Sample name
     */
    getSampleName(index) {
        if (!this.currentBank) return null;

        const bank = this.banks.get(this.currentBank);
        if (!bank || !Array.isArray(bank)) return null;

        if (index < 0 || index >= bank.length) return null;

        return bank[index].name;
    }

    /**
     * Get list of available banks
     * @returns {Array<string>} Array of bank names
     */
    getBankList() {
        return Array.from(this.banks.keys());
    }

    /**
     * Get the current bank name
     * @returns {string|null} Current bank name
     */
    getCurrentBank() {
        return this.currentBank;
    }

    /**
     * Get the count of available samples in the current bank
     * @returns {number} Number of samples loaded
     */
    getSampleCount() {
        if (!this.currentBank) return 0;

        const bank = this.banks.get(this.currentBank);
        if (!bank || !Array.isArray(bank)) return 0;

        return bank.length;
    }

    /**
     * Get all sample names in the current bank
     * @returns {Array<string>} Array of sample names
     */
    getAllSampleNames() {
        if (!this.currentBank) return [];

        const bank = this.banks.get(this.currentBank);
        if (!bank || !Array.isArray(bank)) return [];

        return bank.map(s => s.name);
    }

}

// Global sample bank manager instance
export const sampleBankManager = new SampleBankManager();
