// Ræmbl AudioWorklet Voice Processor
// Handles oscillators, filters, envelopes, and modulation for a single voice

class RaemblVoiceProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            // Global parameters (shared across voices via AudioParam)
            { name: 'gateSignal', defaultValue: 0, minValue: 0, maxValue: 1 }, // Gate trigger for sample-accurate envelope timing
            { name: 'retriggerSignal', defaultValue: 0, minValue: 0, maxValue: 1 }, // Mono mode retrigger (sample-accurate)
            { name: 'filterCutoff', defaultValue: 1000, minValue: 20, maxValue: 20000 },
            { name: 'filterResonance', defaultValue: 1, minValue: 0.1, maxValue: 25 },
            { name: 'filterEnvAmount', defaultValue: 0, minValue: -1, maxValue: 1 },
            { name: 'keyTracking', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'hpfCutoff', defaultValue: 20, minValue: 20, maxValue: 10000 },
            { name: 'lfoRate', defaultValue: 4, minValue: 0.1, maxValue: 20 },
            { name: 'lfoWave', defaultValue: 0, minValue: 0, maxValue: 2 }, // 0=sine, 1=tri, 2=square
            { name: 'lfoToFilter', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'lfoToPitch', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'lfoToPWM', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'pitchEnvAmount', defaultValue: 0, minValue: 0, maxValue: 1 }, // Pitch mod from filter env
            { name: 'envToPWM', defaultValue: 0, minValue: 0, maxValue: 1 }, // PWM mod from filter env
            { name: 'drift', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'glide', defaultValue: 0, minValue: 0, maxValue: 1 }, // Glide time in seconds
            { name: 'octaveTranspose', defaultValue: 0, minValue: -24, maxValue: 24 }, // Main osc semitone transposition
            { name: 'subOctaveTranspose', defaultValue: 0, minValue: -24, maxValue: 24 }, // Sub osc semitone transposition
            { name: 'outputLevel', defaultValue: 0.5, minValue: 0, maxValue: 2 },
            { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000 } // Base frequency for AudioParam automation (slide/glide)
        ];
    }

    constructor(options) {
        super();

        this.voiceIndex = options.processorOptions?.voiceIndex || 0;
        this.sampleRate = sampleRate;

        // Voice state
        this.active = false;
        this.frequency = 440;
        this.targetFrequency = 440; // For glide
        this.velocity = 1.0;
        this.driftOffset = 0; // Per-note random pitch offset (cents)

        // Glide/Slide state
        this.isGliding = false;
        this.glideStartTime = 0;
        this.glideStartFreq = 0;
        this.glideTargetFreq = 0;
        this.glideDuration = 0;

        // Trill state
        this.isTrilling = false;
        this.trillStartTime = 0;
        this.trillBaseFreq = 0;
        this.trillUpperFreq = 0;
        this.trillCycleTime = 0.15; // 150ms per cycle (adjustable)

        // Oscillator phases (5 oscillators)
        this.sawPhase = 0;
        this.triPhase = 0;
        this.sqPhase = 0;
        this.subPhase = 0;
        this.noiseCounter = 0;

        // Oscillator mix levels (0-1)
        this.sawLevel = 1.0;
        this.triLevel = 0.0;
        this.sqLevel = 0.0;
        this.subLevel = 0.0;
        this.noiseLevel = 0.0;
        this.pwmWidth = 0.5; // Pulse width for square wave

        // TPT Filter state (separate lowpass and highpass)
        this.lpfState = { ic1eq: 0, ic2eq: 0 }; // Lowpass integrator states
        this.hpfState = { ic1eq: 0, ic2eq: 0 }; // Highpass integrator states

        // Envelope states
        // retriggerFade: quick fade on retrigger (mimics original's voice crossfade)
        this.ampEnv = { value: 0, stage: 'idle', releaseStartValue: 0, releaseTime: 0, retriggerFade: 0, retriggerStart: 0 };
        this.filterEnv = { value: 0, stage: 'idle', releaseStartValue: 0, releaseTime: 0, retriggerFade: 0, retriggerStart: 0 };

        // Envelope parameters (in samples)
        this.ampAttack = 0.01 * sampleRate;
        this.ampDecay = 0.1 * sampleRate;
        this.ampSustain = 0.7;
        this.ampRelease = 0.2 * sampleRate;

        this.filterAttack = 0.01 * sampleRate;
        this.filterDecay = 0.3 * sampleRate;
        this.filterSustain = 0.0;
        this.filterRelease = 0.5 * sampleRate;

        // LFO state
        this.lfoPhase = 0;

        // Accent state
        this.isAccented = false;
        this.originalAmpDecay = 0.1 * sampleRate; // Store original decay for restoration
        this.originalFilterDecay = 0.3 * sampleRate; // Store original filter decay for restoration

        // Gate signal tracking for rising edge detection
        this.lastGateValue = 0;

        // Retrigger signal tracking for rising edge detection (mono mode)
        this.lastRetriggerValue = 0;

        // Mode tracking (mono vs poly) - determines which signal triggers envelope
        this.monoMode = false;

        // Pending note queue for scheduled sequencer notes
        // When noteOn arrives with a future time, we queue the params here
        // and apply them when the trigger signal rises
        this.pendingNoteParams = null;

        // Message handling
        this.port.onmessage = (e) => this.handleMessage(e.data);
    }

    handleMessage(data) {
        const { type } = data;

        if (type === 'noteOn') {
            // Queue the note parameters - they'll be applied when the trigger signal rises
            // This prevents race conditions when multiple noteOn messages arrive before triggers
            // (especially important for sequencer lookahead scheduling)
            const newFreq = this.mtof(data.pitch);

            // Calculate drift now (random value should be captured at noteOn time)
            const driftAmount = data.drift || 0;
            let driftOffset = 0;
            if (driftAmount > 0) {
                const maxDriftCents = driftAmount * 40; // 100% = ±40 cents
                driftOffset = (Math.random() * 2 - 1) * maxDriftCents;
            }

            // Store pending params to be applied when trigger fires
            this.pendingNoteParams = {
                frequency: newFreq,
                velocity: data.velocity || 1.0,
                isAccented: data.isAccented || false,
                driftOffset: driftOffset,
                monoMode: data.monoMode || false
            };

            // Also set frequency immediately via AudioParam (for slide/glide)
            // The worklet just receives the frequency via the 'frequency' AudioParam
            // which is smoothly interpolated by the Web Audio API during slides
            this.targetFrequency = newFreq;

            // Note: Other params (velocity, accent) are NOT applied immediately
            // They're queued in pendingNoteParams and applied when trigger rises

        } else if (type === 'noteOff') {
            this.active = false;

            // Snapshot envelope values and release times at noteOff
            // This ensures parameter changes don't affect voices already in release
            this.ampEnv.releaseStartValue = this.ampEnv.value;
            this.ampEnv.releaseTime = this.ampRelease;
            this.ampEnv.stage = 'release';

            this.filterEnv.releaseStartValue = this.filterEnv.value;
            this.filterEnv.releaseTime = this.filterRelease;
            this.filterEnv.stage = 'release';

        } else if (type === 'setOscMix') {
            // Update oscillator mix levels
            this.sawLevel = data.saw ?? this.sawLevel;
            this.triLevel = data.tri ?? this.triLevel;
            this.sqLevel = data.sq ?? this.sqLevel;
            this.subLevel = data.sub ?? this.subLevel;
            this.noiseLevel = data.noise ?? this.noiseLevel;
            this.pwmWidth = data.pwm ?? this.pwmWidth;

        } else if (type === 'setEnvelope') {
            // Update only the envelope parameters that are provided
            // Don't use defaults - preserves existing values when only one param changes
            if (data.target === 'amp') {
                if (data.attack !== undefined) {
                    this.ampAttack = data.attack * this.sampleRate;
                }
                if (data.decay !== undefined) {
                    this.originalAmpDecay = data.decay * this.sampleRate;
                    this.ampDecay = this.isAccented ? this.originalAmpDecay * 0.5 : this.originalAmpDecay;
                }
                if (data.sustain !== undefined) {
                    this.ampSustain = data.sustain;
                }
                if (data.release !== undefined) {
                    this.ampRelease = data.release * this.sampleRate;
                }
            } else if (data.target === 'filter') {
                if (data.attack !== undefined) {
                    this.filterAttack = data.attack * this.sampleRate;
                }
                if (data.decay !== undefined) {
                    this.originalFilterDecay = data.decay * this.sampleRate;
                    this.filterDecay = this.isAccented ? this.originalFilterDecay * 0.5 : this.originalFilterDecay;
                }
                if (data.sustain !== undefined) {
                    this.filterSustain = data.sustain;
                }
                if (data.release !== undefined) {
                    this.filterRelease = data.release * this.sampleRate;
                }
            }
        }
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output || !output[0]) return true;

        const channel0 = output[0];
        const channel1 = output[1];
        const blockSize = channel0.length;
        const currentTime = this.currentTime;

        // Get global parameters (can be modulated per-sample)
        const cutoffValues = parameters.filterCutoff;
        const resonanceValues = parameters.filterResonance;
        const envAmountValues = parameters.filterEnvAmount;
        const keyTrackingValues = parameters.keyTracking;
        const hpfCutoffValues = parameters.hpfCutoff;
        const lfoRateValues = parameters.lfoRate;
        const lfoWaveValues = parameters.lfoWave;
        const lfoToFilterValues = parameters.lfoToFilter;
        const lfoToPitchValues = parameters.lfoToPitch;
        const lfoToPWMValues = parameters.lfoToPWM;
        const pitchEnvAmountValues = parameters.pitchEnvAmount;
        const envToPWMValues = parameters.envToPWM;
        const glideValues = parameters.glide;
        const octaveTransposeValues = parameters.octaveTranspose;
        const subOctaveTransposeValues = parameters.subOctaveTranspose;
        const outputLevelValues = parameters.outputLevel;
        const frequencyValues = parameters.frequency; // Base frequency via AudioParam (for slide/glide automation)
        const gateValues = parameters.gateSignal; // Gate signal for sample-accurate envelope triggering
        const retriggerValues = parameters.retriggerSignal; // Mono mode retrigger signal

        for (let i = 0; i < blockSize; i++) {
            // Get current trigger signal values
            const currentGate = gateValues.length === 1 ? gateValues[0] : gateValues[i];
            const currentRetrigger = retriggerValues.length === 1 ? retriggerValues[0] : retriggerValues[i];

            // Envelope triggering: respond to EITHER gate OR retrigger rising edge
            // MUTUAL EXCLUSION on main thread ensures only ONE signal is ever pulsed:
            // - Mono mode: only retrigger is pulsed
            // - Poly mode: only gate is pulsed
            // So we simply trigger on whichever rising edge occurs - no race condition
            const gateRising = currentGate > 0.5 && this.lastGateValue <= 0.5;
            const retriggerRising = currentRetrigger > 0.5 && this.lastRetriggerValue <= 0.5;

            if (gateRising || retriggerRising) {
                // Apply pending note params NOW (sample-accurate with trigger)
                // This ensures velocity/accent match the correct note, not a later one
                if (this.pendingNoteParams) {
                    const params = this.pendingNoteParams;
                    this.frequency = params.frequency;
                    this.velocity = params.velocity;
                    this.driftOffset = params.driftOffset;
                    this.monoMode = params.monoMode;

                    // Handle accent - modify envelope behaviour (TB-303 style)
                    this.isAccented = params.isAccented;
                    if (this.isAccented) {
                        // Halve the decay time for snappier accented notes
                        this.ampDecay = this.originalAmpDecay * 0.5;
                        // Boost filter envelope for brighter, more aggressive tone
                        this.filterDecay = this.originalFilterDecay * 0.5;
                    } else {
                        // Restore original decay values
                        this.ampDecay = this.originalAmpDecay;
                        this.filterDecay = this.originalFilterDecay;
                    }

                    // Clear pending params (consumed)
                    this.pendingNoteParams = null;
                }

                // Quick fade approach (mimics original's voice crossfade)
                // Original Ræmbl: releases old voice with 5ms fade while new voice starts
                // We can't overlap, but we can do a very quick fade-to-attack transition
                const RETRIGGER_FADE_SAMPLES = Math.floor(0.002 * this.sampleRate); // 2ms fade

                // If envelope has significant value, do a quick fade first
                if (this.ampEnv.value > 0.01) {
                    // Start retrigger fade - this will fade to 0 then start attack
                    this.ampEnv.retriggerFade = RETRIGGER_FADE_SAMPLES;
                    this.ampEnv.retriggerStart = this.ampEnv.value;
                    this.ampEnv.stage = 'retrigger_fade';

                    this.filterEnv.retriggerFade = RETRIGGER_FADE_SAMPLES;
                    this.filterEnv.retriggerStart = this.filterEnv.value;
                    this.filterEnv.stage = 'retrigger_fade';
                } else {
                    // Value already near 0, just start attack immediately
                    this.ampEnv.value = 0;
                    this.ampEnv.stage = 'attack';
                    this.filterEnv.value = 0;
                    this.filterEnv.stage = 'attack';
                }

                // DON'T reset filter states on retrigger - they provide continuity
                // (Resetting creates transients; original creates new filters but they
                // start processing fresh signal, not mid-stream like ours)

                // Ensure voice is marked active when gate/retrigger rises
                this.active = true;

                // DON'T output silence - let the fade handle the transition smoothly
                this.lastGateValue = currentGate;
                this.lastRetriggerValue = currentRetrigger;
                // Continue processing this sample normally (with current envelope value)
            }

            // Always track both values for edge detection
            this.lastGateValue = currentGate;
            this.lastRetriggerValue = currentRetrigger;

            if (!this.active && this.ampEnv.value <= 0) {
                // Voice silent - output zero
                channel0[i] = 0;
                channel1[i] = 0;
                continue;
            }

            // Update envelopes (pass accent flag for amp envelope punch effect)
            this.updateEnvelope(this.ampEnv, this.ampAttack, this.ampDecay, this.ampSustain, this.ampRelease, this.isAccented, true);
            this.updateEnvelope(this.filterEnv, this.filterAttack, this.filterDecay, this.filterSustain, this.filterRelease, false, false);

            // Get parameter values for this sample
            const lfoRate = lfoRateValues.length === 1 ? lfoRateValues[0] : lfoRateValues[i];
            const lfoToFilter = lfoToFilterValues.length === 1 ? lfoToFilterValues[0] : lfoToFilterValues[i];
            const lfoToPitch = lfoToPitchValues.length === 1 ? lfoToPitchValues[0] : lfoToPitchValues[i];
            const lfoToPWM = lfoToPWMValues.length === 1 ? lfoToPWMValues[0] : lfoToPWMValues[i];
            const pitchEnvAmount = pitchEnvAmountValues.length === 1 ? pitchEnvAmountValues[0] : pitchEnvAmountValues[i];
            const octaveTranspose = Math.round(octaveTransposeValues.length === 1 ? octaveTransposeValues[0] : octaveTransposeValues[i]); // Main osc semitones
            const subOctaveTranspose = Math.round(subOctaveTransposeValues.length === 1 ? subOctaveTransposeValues[0] : subOctaveTransposeValues[i]); // Sub osc semitones

            // LFO with waveform selection
            const lfoWave = Math.round(lfoWaveValues.length === 1 ? lfoWaveValues[0] : lfoWaveValues[i]);
            const lfoPhaseNorm = this.lfoPhase / (2 * Math.PI); // 0-1
            let lfoValue;
            if (lfoWave === 0) {
                // Sine
                lfoValue = Math.sin(this.lfoPhase);
            } else if (lfoWave === 1) {
                // Triangle
                lfoValue = lfoPhaseNorm < 0.5 ? (lfoPhaseNorm * 4) - 1 : 3 - (lfoPhaseNorm * 4);
            } else {
                // Square
                lfoValue = lfoPhaseNorm < 0.5 ? 1 : -1;
            }
            this.lfoPhase += (2 * Math.PI * lfoRate) / this.sampleRate;
            if (this.lfoPhase >= 2 * Math.PI) this.lfoPhase -= 2 * Math.PI;

            // Drift (per-note random offset applied at noteOn)
            const driftValue = this.driftOffset / 1200; // Convert cents to octaves

            // Get base frequency from AudioParam (handles slide/glide automation natively)
            // When sliding, the Web Audio API interpolates this value automatically
            // Fall back to this.targetFrequency if AudioParam not available (safety)
            let baseFreq = this.targetFrequency;
            if (frequencyValues && frequencyValues.length > 0) {
                baseFreq = frequencyValues.length === 1 ? frequencyValues[0] : frequencyValues[i];
            }

            // Pitch modulation (from filter envelope or LFO only)
            // Envelope: 0 to +2 octaves, LFO: ±1 semitone (vibrato)
            const pitchModFromEnv = this.filterEnv.value * pitchEnvAmount * 2; // 0 to +2 octaves
            const pitchModFromLFO = lfoValue * lfoToPitch * (1/12); // ±1 semitone
            const totalPitchMod = pitchModFromEnv + pitchModFromLFO + driftValue;

            // Apply main oscillator transpose (baseFreq comes from AudioParam)
            const mainFreq = baseFreq * Math.pow(2, octaveTranspose / 12);

            // Modulated frequency for main oscillators (with pitch mod)
            const modulatedMainFreq = mainFreq * Math.pow(2, totalPitchMod);

            // Apply sub oscillator transpose (independent, baseFreq from AudioParam)
            const subFreq = baseFreq * Math.pow(2, subOctaveTranspose / 12);
            const modulatedSubFreq = subFreq * Math.pow(2, totalPitchMod);

            // PWM modulation from LFO or ENV
            const envToPWM = envToPWMValues.length === 1 ? envToPWMValues[0] : envToPWMValues[i];
            const pwmModFromLFO = lfoValue * lfoToPWM * 0.4; // ±40% max
            const pwmModFromEnv = this.filterEnv.value * envToPWM * 0.4; // 0 to +40%
            const modulatedPWM = Math.max(0.05, Math.min(0.95, this.pwmWidth + pwmModFromLFO + pwmModFromEnv));

            // Generate oscillators with independent transposition
            const sawSample = this.generateSaw(modulatedMainFreq);
            const triSample = this.generateTriangle(modulatedMainFreq);
            const sqSample = this.generateSquare(modulatedMainFreq, modulatedPWM);
            const subSample = this.generateSub(modulatedSubFreq);
            const noiseSample = this.generateNoise();

            // Mix oscillators
            let oscMix =
                sawSample * this.sawLevel +
                triSample * this.triLevel +
                sqSample * this.sqLevel +
                subSample * this.subLevel +
                noiseSample * this.noiseLevel;

            // Calculate filter cutoff with modulation
            const baseCutoff = cutoffValues.length === 1 ? cutoffValues[0] : cutoffValues[i];
            const envAmount = envAmountValues.length === 1 ? envAmountValues[0] : envAmountValues[i];
            const keyTracking = keyTrackingValues.length === 1 ? keyTrackingValues[0] : keyTrackingValues[i];
            const hpfCutoff = hpfCutoffValues.length === 1 ? hpfCutoffValues[0] : hpfCutoffValues[i];
            const outputLevel = outputLevelValues.length === 1 ? outputLevelValues[0] : outputLevelValues[i];

            // Key tracking: scale filter cutoff by note frequency (1V/oct tracking)
            const keyTrackRatio = modulatedMainFreq / 440; // Pitch ratio relative to A4
            const keyTrackAmount = 1 + (keyTracking * (keyTrackRatio - 1));

            // Filter modulation from envelope and LFO
            // EnvAmount bipolar: -1 = -2 octaves, 0 = no change, +1 = +4 octaves
            const filterModFromEnv = this.filterEnv.value * envAmount * (envAmount >= 0 ? 4 : 2);
            const filterModFromLFO = lfoValue * lfoToFilter; // ±1 range from normalized LFO
            let cutoff = baseCutoff * keyTrackAmount * Math.pow(2, filterModFromEnv + filterModFromLFO);

            // Clamp cutoff to safe range to prevent filter instability
            cutoff = Math.max(20, Math.min(20000, cutoff));

            const resonance = resonanceValues.length === 1 ? resonanceValues[0] : resonanceValues[i];


            // Apply filters (highpass with variable cutoff, then lowpass)
            const hpfOut = this.processTPFHighpass(oscMix, hpfCutoff, 0.7, this.hpfState);
            const lpfOut = this.processTPFLowpass(hpfOut, cutoff, resonance, this.lpfState);

            // Apply amplitude envelope and output level
            const outputSample = lpfOut * this.ampEnv.value * this.velocity * outputLevel;

            channel0[i] = outputSample;
            channel1[i] = outputSample;
        }

        // Keep processor alive
        return true;
    }

    // === Oscillator Generators (PolyBLEP Band-Limited) ===

    generateSaw(freq) {
        const phaseIncrement = (2 * Math.PI * freq) / this.sampleRate;
        const t = this.sawPhase / (2 * Math.PI); // Normalize to 0-1
        const dt = phaseIncrement / (2 * Math.PI); // Normalized increment

        // Naive sawtooth
        let saw = (t * 2.0) - 1.0; // -1 to +1

        // Apply PolyBLEP correction
        saw -= this.polyBLEP(t, dt);

        // Advance phase
        this.sawPhase += phaseIncrement;
        if (this.sawPhase >= 2 * Math.PI) {
            this.sawPhase -= 2 * Math.PI;
        }

        return saw;
    }

    generateTriangle(freq) {
        const phaseIncrement = (2 * Math.PI * freq) / this.sampleRate;
        const t = this.triPhase / (2 * Math.PI); // Normalise to 0-1
        const dt = phaseIncrement / (2 * Math.PI); // Normalised increment

        // Naive triangle wave
        let tri = t < 0.5
            ? (t * 4.0) - 1.0       // Rising: -1 to +1
            : 3.0 - (t * 4.0);      // Falling: +1 to -1

        // Triangle has slope discontinuities at t=0 and t=0.5
        // Apply PolyBLAMP correction (handles slope changes, not amplitude jumps)
        // Scale factor accounts for slope magnitude (rising: +4, falling: -4)
        const blamScale = 4.0 * dt;
        tri -= this.polyBLAMP(t, dt) * blamScale;
        tri += this.polyBLAMP((t + 0.5) % 1.0, dt) * blamScale;

        // Advance phase
        this.triPhase += phaseIncrement;
        if (this.triPhase >= 2 * Math.PI) {
            this.triPhase -= 2 * Math.PI;
        }

        return tri;
    }

    generateSquare(freq, pwmWidth) {
        const phaseIncrement = (2 * Math.PI * freq) / this.sampleRate;
        const t = this.sqPhase / (2 * Math.PI); // Normalize to 0-1
        const dt = phaseIncrement / (2 * Math.PI); // Normalized increment

        // Naive square wave
        let square = t < pwmWidth ? 1.0 : -1.0;

        // Apply PolyBLEP at rising edge (t = 0)
        square += this.polyBLEP(t, dt);

        // Apply PolyBLEP at falling edge (t = pwmWidth)
        square -= this.polyBLEP((t - pwmWidth + 1.0) % 1.0, dt);

        // Advance phase
        this.sqPhase += phaseIncrement;
        if (this.sqPhase >= 2 * Math.PI) {
            this.sqPhase -= 2 * Math.PI;
        }

        return square;
    }

    generateSub(freq) {
        // Simple sine wave sub oscillator
        const sub = Math.sin(this.subPhase);

        const phaseIncrement = (2 * Math.PI * freq) / this.sampleRate;
        this.subPhase += phaseIncrement;
        if (this.subPhase >= 2 * Math.PI) this.subPhase -= 2 * Math.PI;

        return sub;
    }

    generateNoise() {
        // Simple white noise (Math.random is not ideal but sufficient for now)
        return (Math.random() * 2) - 1;
    }


    // === TPT Filter Implementation ===

    processTPFLowpass(input, cutoff, resonance, state) {
        // TPT one-pole lowpass (Zavalishin topology-preserving transform)
        // Stable at all cutoff/resonance values, zero-delay feedback

        const g = Math.tan(Math.PI * cutoff / this.sampleRate);
        const k = 2 - (2 * resonance / 25); // Map resonance 0-25 to damping

        const a1 = 1 / (1 + g * (g + k));
        const a2 = g * a1;
        const a3 = g * a2;

        const v3 = input - state.ic2eq;
        const v1 = a1 * state.ic1eq + a2 * v3;
        const v2 = state.ic2eq + a2 * state.ic1eq + a3 * v3;

        state.ic1eq = 2 * v1 - state.ic1eq;
        state.ic2eq = 2 * v2 - state.ic2eq;

        return v2; // Lowpass output
    }

    processTPFHighpass(input, cutoff, resonance, state) {
        // TPT one-pole highpass (derived from lowpass)

        const g = Math.tan(Math.PI * cutoff / this.sampleRate);
        const k = 2 - (2 * resonance / 25);

        const a1 = 1 / (1 + g * (g + k));
        const a2 = g * a1;
        const a3 = g * a2;

        const v3 = input - state.ic2eq;
        const v1 = a1 * state.ic1eq + a2 * v3;
        const v2 = state.ic2eq + a2 * state.ic1eq + a3 * v3;

        state.ic1eq = 2 * v1 - state.ic1eq;
        state.ic2eq = 2 * v2 - state.ic2eq;

        return input - v2; // Highpass output (input - lowpass)
    }

    // === Envelope Generator ===

    updateEnvelope(env, attack, decay, sustain, release, isAccented = false, isAmpEnv = false) {
        switch (env.stage) {
            case 'attack':
                // Accent punch: faster attack (2x speed) to create snappier transient
                const attackRate = (isAccented && isAmpEnv) ? 2 / attack : 1 / attack;
                env.value += attackRate;
                if (env.value >= 1.0) {
                    env.value = 1.0;
                    env.stage = 'decay';
                }
                break;

            case 'decay':
                env.value -= (1.0 - sustain) / decay;
                if (env.value <= sustain) {
                    env.value = sustain;
                    env.stage = 'sustain';
                }
                break;

            case 'sustain':
                env.value = sustain;
                if (!this.active) {
                    // Snapshot before transitioning to release (defensive - noteOff normally handles this)
                    env.releaseStartValue = env.value;
                    env.releaseTime = release;
                    env.stage = 'release';
                }
                break;

            case 'release':
                // Use snapshotted values from noteOff - immune to parameter changes
                env.value -= env.releaseStartValue / env.releaseTime;
                if (env.value <= 0) {
                    env.value = 0;
                    env.stage = 'idle';
                }
                break;

            case 'idle':
                env.value = 0;
                break;

            case 'retrigger_fade':
                // Quick fade to 0 before starting new attack (mimics voice crossfade)
                // This prevents the abrupt discontinuity that causes the "flam" sound
                env.retriggerFade--;
                if (env.retriggerFade <= 0) {
                    // Fade complete, start attack
                    env.value = 0;
                    env.stage = 'attack';
                } else {
                    // Linear fade toward 0
                    const fadeRate = env.retriggerStart / (0.002 * this.sampleRate);
                    env.value -= fadeRate;
                    if (env.value < 0) env.value = 0;
                }
                break;
        }

        // Clamp to valid range
        env.value = Math.max(0, Math.min(1.0, env.value));
    }

    // === Utility ===

    mtof(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    // === PolyBLEP Anti-Aliasing ===

    polyBLEP(t, dt) {
        // t: current phase position (normalized 0-1)
        // dt: phase increment per sample (normalized)

        // Polynomial approximation of band-limited step
        // Corrects discontinuities to reduce aliasing

        if (t < dt) {
            // Discontinuity at t = 0 (rising edge)
            t = t / dt;
            return t + t - t * t - 1.0;
        } else if (t > 1.0 - dt) {
            // Discontinuity at t = 1 (wrapping)
            t = (t - 1.0) / dt;
            return t * t + t + t + 1.0;
        }

        return 0.0;
    }

    polyBLAMP(t, dt) {
        // PolyBLAMP: integrated PolyBLEP for slope discontinuities
        // t: current phase position (normalised 0-1)
        // dt: phase increment per sample (normalised)
        //
        // Unlike PolyBLEP which handles amplitude discontinuities (step functions),
        // PolyBLAMP handles slope discontinuities (corners) like in triangle waves.

        if (t < dt) {
            t = t / dt;
            // Integral of PolyBLEP polynomial for slope correction
            return (t * t * t / 3.0) - (t * t / 2.0) + t - (1.0 / 3.0);
        } else if (t > 1.0 - dt) {
            t = (t - 1.0) / dt;
            return (t * t * t / 3.0) + (t * t / 2.0) + t + (1.0 / 3.0);
        }

        return 0.0;
    }
}

registerProcessor('raembl-voice-processor', RaemblVoiceProcessor);
