/**
 * AudioWorklet Processor for Analog Snare Drum
 *
 * Per-voice processor - one instance per voice trigger.
 * Runs on dedicated audio rendering thread for zero-latency processing.
 * Based on Mutable Instruments Plaits analog_snare_drum architecture.
 */

import { AnalogSnare } from '../modules/analog/analog-snare.js';

class AnalogSnareProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Single voice engine
        this.snare = new AnalogSnare(sampleRate);
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
                this.snare.setParameters(
                    data.tone,
                    data.pitch,
                    data.decay,
                    data.snap
                );
                this.snare.trigger(data.velocity);
                this.active = true;
                break;

            case 'updateParameters':
                // Real-time parameter update (for per-parameter modulation)
                this.snare.updateParameters(
                    data.tone,
                    data.pitch,
                    data.decay,
                    data.snap
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
                output[i] = this.snare.process();

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
        // FIX: Trigger fadeout instead of immediate stop to prevent clicks
        if (!this.active) {
            // Manual stop - already handled by fadeout trigger in message handler
            this.port.postMessage({ type: 'finished' });
            return false;
        }

        if (!this.snare.isActive() && !this.fadeoutActive) {
            // Natural envelope end - trigger fadeout to prevent click
            this.fadeoutActive = true;
            this.fadeoutGain = 1.0;
        }

        // Only stop when fadeout is complete
        if (this.fadeoutActive && this.fadeoutGain < 0.00001) {
            this.active = false;
            this.fadeoutActive = false;
            this.port.postMessage({ type: 'finished' });
            return false;
        }

        // Continue processing
        return true;
    }
}

// Register processor
registerProcessor('analog-snare-processor', AnalogSnareProcessor);
