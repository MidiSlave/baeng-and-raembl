// Clouds Prototype - AudioWorklet Processor (Grain Engine)

class CloudsPrototypeProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'position', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'size', defaultValue: 0.3, minValue: 0, maxValue: 1 },
            { name: 'density', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'texture', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'pitch', defaultValue: 0, minValue: -12, maxValue: 12 },
            { name: 'feedback', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'reverb', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'dryWet', defaultValue: 1.0, minValue: 0, maxValue: 1 },
            { name: 'stereoSpread', defaultValue: 0.5, minValue: 0, maxValue: 1 }
        ];
    }

    constructor(options) {
        super();

        // Mode (granular, stretch, looping-delay, spectral)
        this.mode = 'granular';

        // Buffer management
        this.BUFFER_SIZE = 262144; // 2^18 = 5.46 seconds @ 48kHz
        this.buffer_l = new Float32Array(this.BUFFER_SIZE);
        this.buffer_r = new Float32Array(this.BUFFER_SIZE);
        this.writeHead = 0;
        this.freeze = false;

        // Feedback high-pass filter state (one-pole TPT filter)
        this.hpf_s1_l = 0.0; // Filter state left
        this.hpf_s1_r = 0.0; // Filter state right
        this.hpf_g = 0.0;    // Filter coefficient (updated per-frame)

        // Griesinger/Dattorro reverb topology (from Clouds reference)
        // Delay times from clouds/dsp/fx/reverb.h, scaled to sample rate
        const scale = sampleRate / 32000.0; // Clouds uses 32kHz

        // Input diffusers: 4 allpass filters
        this.ap1_size = Math.floor(113 * scale);
        this.ap2_size = Math.floor(162 * scale);
        this.ap3_size = Math.floor(241 * scale);
        this.ap4_size = Math.floor(399 * scale);

        // Left tank: 2 allpass + 1 delay
        this.dap1a_size = Math.floor(1653 * scale);
        this.dap1b_size = Math.floor(2038 * scale);
        this.del1_size = Math.floor(3411 * scale);

        // Right tank: 2 allpass + 1 delay
        this.dap2a_size = Math.floor(1913 * scale);
        this.dap2b_size = Math.floor(1663 * scale);
        this.del2_size = Math.floor(4782 * scale);

        // Create delay line buffers
        this.ap1 = new Float32Array(this.ap1_size);
        this.ap2 = new Float32Array(this.ap2_size);
        this.ap3 = new Float32Array(this.ap3_size);
        this.ap4 = new Float32Array(this.ap4_size);
        this.dap1a = new Float32Array(this.dap1a_size);
        this.dap1b = new Float32Array(this.dap1b_size);
        this.del1 = new Float32Array(this.del1_size);
        this.dap2a = new Float32Array(this.dap2a_size);
        this.dap2b = new Float32Array(this.dap2b_size);
        this.del2 = new Float32Array(this.del2_size);

        // Indices for circular buffers
        this.ap1_idx = 0;
        this.ap2_idx = 0;
        this.ap3_idx = 0;
        this.ap4_idx = 0;
        this.dap1a_idx = 0;
        this.dap1b_idx = 0;
        this.del1_idx = 0;
        this.dap2a_idx = 0;
        this.dap2b_idx = 0;
        this.del2_idx = 0;

        // Lowpass filter state for tank decay
        this.lp_decay_1 = 0.0;
        this.lp_decay_2 = 0.0;

        // Grain pool initialisation
        this.maxGrains = 16;
        this.grains = [];
        for (let i = 0; i < this.maxGrains; i++) {
            this.grains.push({
                active: false,
                phase: 0.0,           // Envelope phase (0.0 - 1.0)
                position: 0,          // Buffer read position (samples)
                increment: 1.0,       // Pitch shift ratio (1.0 = no shift)
                gain_l: 0.5,          // Left channel gain
                gain_r: 0.5,          // Right channel gain
                duration: 2048,       // Grain length in samples
                age: 0                // Samples elapsed since grain start
            });
        }

        // Grain scheduling
        this.grainTriggerPhase = 0.0;

        // Window lookup table (Hann window)
        this.WINDOW_SIZE = 1024;
        this.windowTable = new Float32Array(this.WINDOW_SIZE);
        for (let i = 0; i < this.WINDOW_SIZE; i++) {
            this.windowTable[i] = 0.5 * (1.0 - Math.cos(2.0 * Math.PI * i / (this.WINDOW_SIZE - 1)));
        }

        // Message handling
        this.port.onmessage = (e) => this.handleMessage(e.data);

    }

    handleMessage(data) {
        if (data.type === 'freeze') {
            this.freeze = data.value;
            this.port.postMessage({
                type: 'bufferStatus',
                frozen: this.freeze,
                writeHead: this.writeHead
            });
        } else if (data.type === 'setMode') {
            this.mode = data.value;
        } else if (data.type === 'setGrainCount') {
            const newCount = data.value;

            // Resize grain pool (deactivate all grains first to avoid glitches)
            this.grains.forEach(g => g.active = false);

            if (newCount > this.maxGrains) {
                // Add grains
                for (let i = this.maxGrains; i < newCount; i++) {
                    this.grains.push({
                        active: false,
                        phase: 0.0,
                        position: 0,
                        increment: 1.0,
                        gain_l: 0.5,
                        gain_r: 0.5,
                        duration: 2048,
                        age: 0
                    });
                }
            } else if (newCount < this.maxGrains) {
                // Remove grains
                this.grains.length = newCount;
            }

            this.maxGrains = newCount;
        }
    }

    triggerGrain(position, size, density, texture, pitch, stereoSpread) {
        // Find inactive grain
        const grain = this.grains.find(g => !g.active);
        if (!grain) {
            return; // All grains busy
        }

        // Map size parameter (0-1) to grain duration (1ms - 1000ms)
        const minDuration = sampleRate * 0.001; // 1ms
        const maxDuration = sampleRate * 1.0;   // 1000ms
        const sizeFactor = size * size; // Exponential mapping for better control
        const baseDuration = minDuration + sizeFactor * (maxDuration - minDuration);

        // Add texture randomisation to duration (±20%)
        const durationJitter = 1.0 + (Math.random() - 0.5) * 0.4 * texture;
        grain.duration = Math.floor(baseDuration * durationJitter);

        // Map position parameter (0-1) to buffer read position
        const basePosition = position * this.BUFFER_SIZE;

        // Add texture randomisation to position (±10% of buffer)
        const positionJitter = (Math.random() - 0.5) * 0.2 * texture * this.BUFFER_SIZE;
        grain.position = (basePosition + positionJitter) & (this.BUFFER_SIZE - 1);

        // Pitch shift: combine pitch parameter with texture randomisation
        // Pitch parameter is in semitones (-12 to +12)
        // Texture adds additional randomisation (±2 semitones scaled by texture)
        const pitchJitter = (Math.random() - 0.5) * 4.0 * texture; // ±2 semitones when texture=1
        const totalPitch = pitch + pitchJitter; // Combine pitch shift + randomisation
        grain.increment = Math.pow(2.0, totalPitch / 12.0); // Convert semitones to ratio

        // Stereo spread (random panning per grain)
        const pan = (Math.random() - 0.5) * 2.0 * stereoSpread; // -stereoSpread to +stereoSpread
        const panAngle = (pan + 1.0) * 0.25 * Math.PI; // Map to 0 to π/2
        grain.gain_l = Math.cos(panAngle);
        grain.gain_r = Math.sin(panAngle);

        // Activate grain
        grain.active = true;
        grain.phase = 0.0;
        grain.age = 0;
    }

    processGrain(grain, outputL, outputR, frameCount) {
        for (let i = 0; i < frameCount; i++) {
            if (!grain.active) break;

            // Calculate envelope amplitude from phase (Hann window lookup)
            const windowIndex = grain.phase * (this.WINDOW_SIZE - 1);
            const idx = Math.floor(windowIndex);
            const frac = windowIndex - idx;
            const window = this.windowTable[idx] * (1.0 - frac) +
                           this.windowTable[Math.min(idx + 1, this.WINDOW_SIZE - 1)] * frac;

            // Read from buffer (linear interpolation)
            const pos = grain.position;
            const posInt = Math.floor(pos) & (this.BUFFER_SIZE - 1);
            const posFrac = pos - Math.floor(pos);
            const posNext = (posInt + 1) & (this.BUFFER_SIZE - 1);

            const sampleL = this.buffer_l[posInt] * (1.0 - posFrac) + this.buffer_l[posNext] * posFrac;
            const sampleR = this.buffer_r[posInt] * (1.0 - posFrac) + this.buffer_r[posNext] * posFrac;

            // Apply envelope and pan
            outputL[i] += sampleL * window * grain.gain_l;
            outputR[i] += sampleR * window * grain.gain_r;

            // Advance grain
            grain.position = (grain.position + grain.increment);
            if (grain.position >= this.BUFFER_SIZE) {
                grain.position -= this.BUFFER_SIZE;
            }

            grain.age++;
            grain.phase = grain.age / grain.duration;

            // Deactivate grain when complete
            if (grain.phase >= 1.0) {
                grain.active = false;
            }
        }
    }

    // One-pole TPT high-pass filter (prevents low-frequency buildup in feedback)
    processHighPass(input) {
        // TPT one-pole HP: y = input - s1, s1 += g * (input + y)
        const v = this.hpf_g * (input - this.hpf_s1_l);
        const y = v + this.hpf_s1_l;
        this.hpf_s1_l = y + v;
        return input - y; // High-pass output
    }

    processHighPassStereo(inputL, inputR) {
        // Left channel
        const vL = this.hpf_g * (inputL - this.hpf_s1_l);
        const yL = vL + this.hpf_s1_l;
        this.hpf_s1_l = yL + vL;

        // Right channel
        const vR = this.hpf_g * (inputR - this.hpf_s1_r);
        const yR = vR + this.hpf_s1_r;
        this.hpf_s1_r = yR + vR;

        return {
            l: inputL - yL, // High-pass output left
            r: inputR - yR  // High-pass output right
        };
    }

    // Griesinger/Dattorro reverb (from Clouds reference)
    // Processes one sample through the reverb tank
    processReverb(inputL, inputR, reverbAmount) {
        if (reverbAmount < 0.001) {
            return { l: inputL, r: inputR };
        }

        // Constants from Clouds reference
        const kap = 0.625;  // Diffusion (allpass gain)
        const klp = 0.7;    // Lowpass coefficient
        const krt = reverbAmount * 0.85; // Reverb time (0 to 0.85 for stability)
        const gain = 0.5;   // Input gain (reduced for stability)

        // Mono sum of input
        const mono = (inputL + inputR) * gain;

        // Input diffusers: 4 series allpass filters
        let diffused = mono;

        // AP1 - read from TAIL (oldest sample)
        let tail_idx = this.ap1_idx;
        let delayed = this.ap1[tail_idx];
        let output = -diffused * kap + delayed;
        this.ap1[tail_idx] = diffused + delayed * kap;
        this.ap1_idx = (this.ap1_idx + 1) % this.ap1_size;
        diffused = output;

        // AP2
        tail_idx = this.ap2_idx;
        delayed = this.ap2[tail_idx];
        output = -diffused * kap + delayed;
        this.ap2[tail_idx] = diffused + delayed * kap;
        this.ap2_idx = (this.ap2_idx + 1) % this.ap2_size;
        diffused = output;

        // AP3
        tail_idx = this.ap3_idx;
        delayed = this.ap3[tail_idx];
        output = -diffused * kap + delayed;
        this.ap3[tail_idx] = diffused + delayed * kap;
        this.ap3_idx = (this.ap3_idx + 1) % this.ap3_size;
        diffused = output;

        // AP4
        tail_idx = this.ap4_idx;
        delayed = this.ap4[tail_idx];
        output = -diffused * kap + delayed;
        this.ap4[tail_idx] = diffused + delayed * kap;
        this.ap4_idx = (this.ap4_idx + 1) % this.ap4_size;
        const apout = output;

        // Left tank: apout + feedback from RIGHT tank (read from tail)
        tail_idx = this.del2_idx;
        let tank_in = apout + this.del2[tail_idx] * krt;

        // Lowpass filter
        this.lp_decay_1 += (tank_in - this.lp_decay_1) * klp;
        tank_in = this.lp_decay_1;

        // DAP1a
        tail_idx = this.dap1a_idx;
        delayed = this.dap1a[tail_idx];
        output = -tank_in * kap + delayed;
        this.dap1a[tail_idx] = tank_in + delayed * kap;
        this.dap1a_idx = (this.dap1a_idx + 1) % this.dap1a_size;
        tank_in = output;

        // DAP1b
        tail_idx = this.dap1b_idx;
        delayed = this.dap1b[tail_idx];
        output = tank_in * kap + delayed;
        this.dap1b[tail_idx] = tank_in - delayed * kap;
        this.dap1b_idx = (this.dap1b_idx + 1) % this.dap1b_size;
        tank_in = output;

        // DEL1 - write and tap for output
        this.del1[this.del1_idx] = tank_in;
        const wet_l = tank_in * 0.5;  // Reduced gain for stability
        this.del1_idx = (this.del1_idx + 1) % this.del1_size;

        // Right tank: apout + feedback from LEFT tank (read from tail)
        tail_idx = this.del1_idx;
        tank_in = apout + this.del1[tail_idx] * krt;

        // Lowpass filter
        this.lp_decay_2 += (tank_in - this.lp_decay_2) * klp;
        tank_in = this.lp_decay_2;

        // DAP2a
        tail_idx = this.dap2a_idx;
        delayed = this.dap2a[tail_idx];
        output = tank_in * kap + delayed;
        this.dap2a[tail_idx] = tank_in - delayed * kap;
        this.dap2a_idx = (this.dap2a_idx + 1) % this.dap2a_size;
        tank_in = output;

        // DAP2b
        tail_idx = this.dap2b_idx;
        delayed = this.dap2b[tail_idx];
        output = -tank_in * kap + delayed;
        this.dap2b[tail_idx] = tank_in + delayed * kap;
        this.dap2b_idx = (this.dap2b_idx + 1) % this.dap2b_size;
        tank_in = output;

        // DEL2 - write and tap for output
        this.del2[this.del2_idx] = tank_in;
        const wet_r = tank_in * 0.5;  // Reduced gain for stability
        this.del2_idx = (this.del2_idx + 1) % this.del2_size;

        // Mix dry + wet
        return {
            l: inputL + (wet_l - inputL) * reverbAmount,
            r: inputR + (wet_r - inputR) * reverbAmount
        };
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];

        if (!input || !input[0]) {
            return true;
        }

        const inputL = input[0];
        const inputR = input[1] || input[0];
        const outputL = output[0];
        const outputR = output[1];
        const frameCount = outputL.length;

        // Read parameters (sample-accurate if automated, otherwise constant)
        const position = parameters.position.length > 1 ?
            parameters.position[0] : parameters.position[0];
        const size = parameters.size.length > 1 ?
            parameters.size[0] : parameters.size[0];
        const density = parameters.density.length > 1 ?
            parameters.density[0] : parameters.density[0];
        const texture = parameters.texture.length > 1 ?
            parameters.texture[0] : parameters.texture[0];
        const pitch = parameters.pitch.length > 1 ?
            parameters.pitch[0] : parameters.pitch[0];
        const feedback = parameters.feedback.length > 1 ?
            parameters.feedback[0] : parameters.feedback[0];
        const reverb = parameters.reverb.length > 1 ?
            parameters.reverb[0] : parameters.reverb[0];
        const dryWet = parameters.dryWet.length > 1 ?
            parameters.dryWet[0] : parameters.dryWet[0];
        const stereoSpread = parameters.stereoSpread.length > 1 ?
            parameters.stereoSpread[0] : parameters.stereoSpread[0];

        // Calculate grain trigger rate (density: 0 = 1 grain/sec, 1 = 100 grains/sec)
        const minRate = 1.0;
        const maxRate = 100.0;
        const grainTriggerRate = minRate + density * (maxRate - minRate);

        // Calculate HP filter coefficient for feedback (cutoff: 20Hz + 100Hz × feedback²)
        const feedbackCutoff = 20.0 + 100.0 * feedback * feedback;
        const wc = 2.0 * Math.PI * feedbackCutoff / sampleRate;
        this.hpf_g = wc / (1.0 + wc); // TPT coefficient

        // Write input to buffer (if not frozen)
        for (let i = 0; i < frameCount; i++) {
            if (!this.freeze) {
                this.buffer_l[this.writeHead] = inputL[i];
                this.buffer_r[this.writeHead] = inputR[i];
                this.writeHead = (this.writeHead + 1) & (this.BUFFER_SIZE - 1);
            }
        }

        // Zero output buffers
        outputL.fill(0);
        outputR.fill(0);

        // Grain scheduling (per-frame to allow parameter modulation)
        for (let i = 0; i < frameCount; i++) {
            this.grainTriggerPhase += grainTriggerRate / sampleRate;

            if (this.grainTriggerPhase >= 1.0) {
                this.grainTriggerPhase -= 1.0;
                this.triggerGrain(position, size, density, texture, pitch, stereoSpread);
            }
        }

        // Process all active grains
        for (let g = 0; g < this.grains.length; g++) {
            if (this.grains[g].active) {
                this.processGrain(this.grains[g], outputL, outputR, frameCount);
            }
        }

        // Normalise output (prevent clipping with many grains)
        const normFactor = 1.0 / Math.sqrt(this.maxGrains);

        // Apply feedback loop with HP filtering (before dry/wet mix)
        if (feedback > 0.001 && !this.freeze) {
            for (let i = 0; i < frameCount; i++) {
                // Normalise and scale by feedback amount
                const wetL = outputL[i] * normFactor * feedback * 0.7; // Scale to prevent runaway
                const wetR = outputR[i] * normFactor * feedback * 0.7;

                // Apply HP filter to prevent low-frequency buildup
                const filtered = this.processHighPassStereo(wetL, wetR);

                // Mix filtered feedback back into input buffer (circular buffer)
                const feedbackWriteHead = (this.writeHead + i) & (this.BUFFER_SIZE - 1);
                this.buffer_l[feedbackWriteHead] += filtered.l;
                this.buffer_r[feedbackWriteHead] += filtered.r;
            }
        }

        // Dry/wet mix
        for (let i = 0; i < frameCount; i++) {
            const dry = inputL[i] * (1.0 - dryWet);
            const wet = outputL[i] * normFactor * dryWet;
            outputL[i] = dry + wet;

            const dryR = inputR[i] * (1.0 - dryWet);
            const wetR = outputR[i] * normFactor * dryWet;
            outputR[i] = dryR + wetR;
        }

        // Apply reverb (processes both dry and wet signal)
        if (reverb > 0.001) {
            for (let i = 0; i < frameCount; i++) {
                const reverbOut = this.processReverb(outputL[i], outputR[i], reverb);
                outputL[i] = reverbOut.l;
                outputR[i] = reverbOut.r;
            }
        }

        return true;
    }
}

registerProcessor('clouds-prototype', CloudsPrototypeProcessor);
