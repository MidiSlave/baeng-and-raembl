/**
 * AudioWorklet Processor for Sample Playback Engine
 *
 * Per-voice processor - one instance per voice trigger.
 * Runs on dedicated audio rendering thread for zero-latency processing.
 * Replaces ScriptProcessorNode implementation from engine.js (line ~821).
 */

import { SamplerEngine } from '../modules/sampler/sampler-engine.js';

class SamplerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Single voice sampler engine
        this.sampler = new SamplerEngine(sampleRate);
        this.active = false;

        // Sample-accurate timing delay for ratchets
        this.samplesUntilStart = 0;

        // Emergency fadeout to prevent clicks when voice is stopped
        this.fadeoutActive = false;
        this.fadeoutGain = 1.0;
        this.fadeoutCoefficient = 0.9794; // 1ms time constant @ 48kHz - instant for ratchets, preserves transients

        // Position reporting for slice editor playhead (throttled to 30fps)
        this.positionReportCounter = 0;
        this.positionReportInterval = Math.floor(sampleRate / 30); // ~1600 samples @ 48kHz

        // Set up message handler for main thread communication
        this.port.onmessage = (event) => {
            this.handleMessage(event.data);
        };
    }

    /**
     * Handle messages from main thread
     * @param {object} data - Message data
     */
    handleMessage(data) {
        switch (data.type) {
            case 'loadBuffer':
                // Receive sample buffer data from main thread
                // Note: bufferData is transferred (zero-copy) via Transferable
                if (data.bufferData) {
                    // Check if slice bounds are provided
                    if (data.sliceStart !== undefined && data.sliceEnd !== undefined) {
                        // Slice mode: load with bounds
                        const tempBuffer = {
                            numberOfChannels: 1,
                            length: data.bufferData.length,
                            getChannelData: (channel) => data.bufferData
                        };
                        this.sampler.loadBuffer(tempBuffer, data.sliceStart, data.sliceEnd);
                    } else {
                        // Full buffer mode (existing behavior)
                        this.sampler.bufferData = data.bufferData;
                        this.sampler.buffer = { length: data.bufferData.length };
                        this.sampler.sliceMode = false;
                        this.sampler.playbackStart = 0;
                        this.sampler.playbackEnd = data.bufferData.length;
                    }
                }
                break;

            case 'trigger':
                // Trigger sample playback
                if (!this.sampler.bufferData) {
                    console.warn('[SamplerProcessor] No buffer loaded, cannot trigger');
                    this.port.postMessage({ type: 'error', message: 'No buffer loaded' });
                    return;
                }

                // Set sample-accurate delay for ratchets and flams (calculated in main thread)
                this.samplesUntilStart = data.delaySamples || 0;

                // Set parameters
                this.sampler.decay = data.decay;
                this.sampler.filterCutoff = data.filterCutoff;
                this.sampler.filterMode = data.filterMode;
                this.sampler.useFilter = data.useFilter;

                // Trigger playback with pitch offset
                this.sampler.trigger(data.accent, data.pitchOffset);
                this.active = true;
                break;

            case 'updateParameters':
                // Real-time parameter update (for per-parameter modulation)
                this.sampler.decay = data.decay;
                this.sampler.filterCutoff = data.filterCutoff;
                this.sampler.filterMode = data.filterMode;
                this.sampler.useFilter = data.useFilter;
                break;

            case 'stop':
                // Emergency stop with fadeout to prevent clicks
                // Don't stop immediately - start fadeout instead
                this.fadeoutActive = true;
                this.fadeoutGain = 1.0; // Start at full gain
                // Note: this.active stays true until fadeout completes
                break;
        }
    }

    /**
     * Process audio (called by audio rendering thread)
     * @param {Array} inputs - Input audio buffers
     * @param {Array} outputs - Output audio buffers
     * @param {Object} parameters - AudioParam values
     * @returns {boolean} Keep processor alive
     */
    process(inputs, outputs, parameters) {
        const output = outputs[0][0]; // Mono output

        if (!this.active) {
            // Silent - output buffer is already zeroed by Web Audio
            return true; // Keep alive briefly for potential triggers
        }

        // Process each sample
        for (let i = 0; i < output.length; i++) {
            // Output silence during delay period (for ratchets and flams)
            if (this.samplesUntilStart > 0) {
                output[i] = 0;
                this.samplesUntilStart--;
            } else {
                // Normal audio generation
                output[i] = this.sampler.process();

                // Apply emergency fadeout if active (prevents clicks when voice is stopped)
                if (this.fadeoutActive) {
                    output[i] *= this.fadeoutGain;
                    this.fadeoutGain *= this.fadeoutCoefficient;

                    // Check if fadeout is complete (below -96dB threshold)
                    if (this.fadeoutGain < 0.00001) {
                        this.active = false;
                        this.sampler.isPlaying = false;
                        this.fadeoutActive = false;
                        return false; // Stop processing, disconnect node
                    }
                }
            }
        }

        // Throttled position reporting for slice editor playhead (only in slice mode)
        if (this.sampler.isPlaying && this.sampler.sliceMode) {
            this.positionReportCounter++;
            if (this.positionReportCounter >= this.positionReportInterval) {
                this.positionReportCounter = 0;

                // Calculate normalised position within slice (0-1)
                const sliceLength = this.sampler.playbackEnd - this.sampler.playbackStart;
                if (sliceLength > 0) {
                    const positionInSlice = this.sampler.playbackPosition - this.sampler.playbackStart;
                    const normalisedPosition = Math.max(0, Math.min(1, positionInSlice / sliceLength));

                    this.port.postMessage({
                        type: 'position',
                        position: normalisedPosition
                    });
                }
            }
        }

        // Check if finished naturally (sample or envelope ended)
        if (!this.sampler.isPlaying && !this.fadeoutActive) {
            this.active = false;
            // Notify main thread that sample finished
            this.port.postMessage({ type: 'finished' });
            return false; // Stop processing, disconnect node
        }

        // Continue processing
        return true;
    }
}

// Register processor
registerProcessor('sampler-processor', SamplerProcessor);
