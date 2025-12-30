/**
 * AudioWorklet Processor for Analog Hi-Hat
 *
 * Per-voice processor - one instance per voice trigger.
 * Runs on dedicated audio rendering thread for zero-latency processing.
 * Based on Mutable Instruments Plaits analog_hihat architecture.
 * TR-808 style metallic percussion synthesis.
 */

import { AnalogHiHat } from '../modules/analog/analog-hihat.js';

class AnalogHiHatProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Single voice engine
        this.hihat = new AnalogHiHat(sampleRate);
        this.active = false;

        // Sample-accurate timing delay for ratchets
        this.samplesUntilStart = 0;

        // Emergency fadeout to prevent clicks when voice is stopped
        this.fadeoutActive = false;
        this.fadeoutGain = 1.0;
        this.fadeoutCoefficient = 0.99305; // 3ms time constant @ 48kHz - ultra-fast for resonant drums

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
            case 'trigger':
                // Set sample-accurate delay for ratchets and flams (calculated in main thread)
                this.samplesUntilStart = data.delaySamples || 0;

                // Trigger with parameters
                this.hihat.setParameters(
                    data.tone,
                    data.pitch,
                    data.decay,
                    data.noisiness
                );
                this.hihat.trigger(data.velocity);
                this.active = true;
                break;

            case 'updateParameters':
                // Real-time parameter update (for per-parameter modulation)
                this.hihat.updateParameters(
                    data.tone,
                    data.pitch,
                    data.decay,
                    data.noisiness
                );
                break;

            case 'stop':
                // Emergency stop with fadeout to prevent clicks (especially during ratchets)
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
                output[i] = this.hihat.process();

                // Apply emergency fadeout if active (prevents clicks when voice is stopped)
                if (this.fadeoutActive) {
                    output[i] *= this.fadeoutGain;
                    this.fadeoutGain *= this.fadeoutCoefficient;

                    // Check if fadeout is complete (below -96dB threshold)
                    if (this.fadeoutGain < 0.00001) {
                        this.active = false;
                        this.fadeoutActive = false;
                        // Will return false and disconnect on next iteration
                    }
                }
            }
        }

        // Check if finished naturally (envelope ended) or stopped
        if (!this.active || !this.hihat.isActive()) {
            this.active = false;
            // Notify main thread that sound finished
            this.port.postMessage({ type: 'finished' });
            return false; // Stop processing, disconnect node
        }

        // Continue processing
        return true;
    }
}

// Register processor
registerProcessor('analog-hihat-processor', AnalogHiHatProcessor);
