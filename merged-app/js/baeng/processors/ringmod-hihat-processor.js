/**
 * AudioWorklet Processor for RingMod Hi-Hat (909-style metallic)
 *
 * Per-voice processor - one instance per voice trigger.
 * This is the AUX output for the Hi-Hat engine.
 * OUT = SquareNoise Hi-Hat (808-style)
 * AUX = RingModNoise Hi-Hat (909-style metallic)
 */

import { RingModHiHat } from '../modules/analog/ringmod-hihat.js';

class RingModHiHatProcessor extends AudioWorkletProcessor {
    constructor() {
        super();

        // Single voice engine
        this.hihat = new RingModHiHat(sampleRate);
        this.active = false;

        // Sample-accurate timing delay for ratchets
        this.samplesUntilStart = 0;

        // Sample-accurate ratchet scheduling
        this.scheduledTriggers = [];
        this.isRatchetMode = false;

        // Emergency fadeout to prevent clicks
        this.fadeoutActive = false;
        this.fadeoutGain = 1.0;
        this.fadeoutCoefficient = 0.99305; // 3ms time constant @ 48kHz

        // Set up message handler
        this.port.onmessage = (event) => {
            this.handleMessage(event.data);
        };

        this.port.start();
    }

    /**
     * Handle messages from main thread
     */
    handleMessage(data) {
        switch (data.type) {
            case 'trigger':
                this.samplesUntilStart = data.delaySamples || 0;
                this.hihat.setParameters(
                    data.metal,
                    data.pitch,
                    data.decay,
                    data.bright
                );
                this.hihat.trigger(data.velocity);
                this.active = true;
                this.isRatchetMode = false;
                break;

            case 'scheduleRatchet':
                this.scheduledTriggers = data.triggerTimes.map(t => ({
                    time: t.time,
                    params: t.params
                }));
                this.scheduledTriggers.sort((a, b) => a.time - b.time);
                this.active = true;
                this.isRatchetMode = true;
                this.fadeoutActive = false;
                break;

            case 'updateParameters':
                this.hihat.updateParameters(
                    data.metal,
                    data.pitch,
                    data.decay,
                    data.bright
                );
                break;

            case 'stop':
                this.fadeoutActive = true;
                this.fadeoutGain = 1.0;
                break;
        }
    }

    /**
     * Process audio
     */
    process(inputs, outputs, parameters) {
        const output = outputs[0][0];

        if (!this.active) {
            return true;
        }

        if (this.isRatchetMode) {
            const blockTime = currentTime;

            for (let i = 0; i < output.length; i++) {
                const sampleTime = blockTime + (i / sampleRate);

                while (this.scheduledTriggers.length > 0 &&
                       sampleTime >= this.scheduledTriggers[0].time) {
                    const trigger = this.scheduledTriggers.shift();
                    this.hihat.setParameters(
                        trigger.params.metal,
                        trigger.params.pitch,
                        trigger.params.decay,
                        trigger.params.bright
                    );
                    this.hihat.trigger(trigger.params.velocity);
                }

                output[i] = this.hihat.process();
            }

            if (this.scheduledTriggers.length === 0 && !this.hihat.isActive()) {
                this.active = false;
                this.isRatchetMode = false;
                this.port.postMessage({ type: 'finished' });
                return false;
            }

        } else {
            for (let i = 0; i < output.length; i++) {
                if (this.samplesUntilStart > 0) {
                    output[i] = 0;
                    this.samplesUntilStart--;
                } else {
                    output[i] = this.hihat.process();

                    if (this.fadeoutActive) {
                        output[i] *= this.fadeoutGain;
                        this.fadeoutGain *= this.fadeoutCoefficient;

                        if (this.fadeoutGain < 0.00001) {
                            this.active = false;
                            this.fadeoutActive = false;
                        }
                    }
                }
            }

            if (!this.active || !this.hihat.isActive()) {
                this.active = false;
                this.port.postMessage({ type: 'finished' });
                return false;
            }
        }

        return true;
    }
}

registerProcessor('ringmod-hihat-processor', RingModHiHatProcessor);
