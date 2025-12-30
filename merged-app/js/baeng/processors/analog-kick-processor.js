/**
 * AudioWorklet Processor for Analog Kick Drum
 *
 * Per-voice processor - one instance per voice trigger.
 * Runs on dedicated audio rendering thread for zero-latency processing.
 * Replaces ScriptProcessorNode implementation from engine.js (line 960).
 */

import { AnalogKick } from '../modules/analog/analog-kick.js';

class AnalogKickProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Single voice engine
        this.kick = new AnalogKick(sampleRate);
        this.active = false;

        // Sample-accurate timing delay for ratchets (legacy single-trigger mode)
        this.samplesUntilStart = 0;

        // Sample-accurate ratchet scheduling
        this.scheduledTriggers = []; // Queue of {time, params} objects
        this.isRatchetMode = false;  // True when using scheduled triggers

        // Emergency fadeout to prevent clicks when voice is stopped manually
        // NOTE: Not used for ratchets - instant retrigger is click-free for percussive sounds
        this.fadeoutActive = false;
        this.fadeoutGain = 1.0;
        this.fadeoutCoefficient = 0.99305; // 3ms time constant @ 48kHz - ultra-fast for resonant drums

        // Set up message handler for main thread communication
        this.port.onmessage = (event) => {
            this.handleMessage(event.data);
        };

        // Explicitly start the message port (required for bidirectional communication)
        this.port.start();

    }

    /**
     * Handle messages from main thread
     * @param {object} data - Message data
     */
    handleMessage(data) {

        switch (data.type) {
            case 'trigger':
                // Legacy single-trigger mode (for non-ratcheted hits or flams)
                // Set sample-accurate delay for flams (calculated in main thread)
                this.samplesUntilStart = data.delaySamples || 0;

                // Trigger with parameters
                this.kick.setParameters(
                    data.tone,
                    data.pitch,
                    data.decay,
                    data.sweep
                );
                this.kick.trigger(data.velocity);
                this.active = true;
                this.isRatchetMode = false;
                break;

            case 'scheduleRatchet':
                // Sample-accurate ratchet mode - receive all trigger times upfront
                // data.triggerTimes: array of {time (AudioContext time), params {tone, pitch, decay, sweep, velocity}}
                this.scheduledTriggers = data.triggerTimes.map(t => ({
                    time: t.time,
                    params: t.params
                }));
                // Sort by time (should already be sorted, but ensure it)
                this.scheduledTriggers.sort((a, b) => a.time - b.time);
                this.active = true;
                this.isRatchetMode = true;
                // Disable fadeout for ratchet mode (instant retrigger is click-free)
                this.fadeoutActive = false;

                break;

            case 'updateParameters':
                // Real-time parameter update (for per-parameter modulation)
                this.kick.updateParameters(
                    data.tone,
                    data.pitch,
                    data.decay,
                    data.sweep
                );
                break;

            case 'stop':
                // Emergency stop with fadeout to prevent clicks (for manual stops only)
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

        // Sample-accurate ratchet mode - check for scheduled triggers
        if (this.isRatchetMode) {
            const blockTime = currentTime; // AudioWorkletGlobalScope currentTime

            for (let i = 0; i < output.length; i++) {
                const sampleTime = blockTime + (i / sampleRate);

                // Check if any scheduled triggers should fire at this sample
                while (this.scheduledTriggers.length > 0 &&
                       sampleTime >= this.scheduledTriggers[0].time) {
                    const trigger = this.scheduledTriggers.shift();

                    // Instantly retrigger with new parameters (no fadeout - click-free for percussive sounds)
                    this.kick.setParameters(
                        trigger.params.tone,
                        trigger.params.pitch,
                        trigger.params.decay,
                        trigger.params.sweep
                    );
                    this.kick.trigger(trigger.params.velocity);
                }

                // Render audio sample
                output[i] = this.kick.process();
            }

            // Check if finished (all triggers processed and envelope ended)
            if (this.scheduledTriggers.length === 0 && !this.kick.isActive()) {
                this.active = false;
                this.isRatchetMode = false;
                this.port.postMessage({ type: 'finished' });
                return false; // Stop processing, disconnect node
            }

            return true; // Keep processing ratchets
        } else {
            // Legacy single-trigger mode (for non-ratcheted hits or flams)
            for (let i = 0; i < output.length; i++) {
                // Output silence during delay period (for flams)
                if (this.samplesUntilStart > 0) {
                    output[i] = 0;
                    this.samplesUntilStart--;
                } else {
                    // Normal audio generation
                    output[i] = this.kick.process();

                    // Apply emergency fadeout if active (prevents clicks when voice is stopped manually)
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

            if (!this.kick.isActive() && !this.fadeoutActive) {
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
        }

        // Continue processing
        return true;
    }
}

// Register processor
registerProcessor('analog-kick-processor', AnalogKickProcessor);
