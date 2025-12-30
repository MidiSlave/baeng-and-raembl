// File: js/ui/faderState.js
// Fader state management - UPDATED for Delay Sync/Free
import { state, parameterDefinitions } from '../state.js';
import { config } from '../config.js';
import { updateFactorsPattern } from '../modules/factors.js';
import { drawPath } from '../modules/path.js';
import { drawReverb } from '../modules/reverb.js';
import { drawDelay, startDelayAnimation } from '../modules/delay.js';
import {
    updateFilter,
    updateReverb,
    updateReverbSendLevel,
    updateDelay
} from '../audio/effects.js';
import { setMasterVolume, setPlaitsEngine, updatePlaitsParameter, setRingsModel, updateRingsParameter } from '../audio.js';
import { updateOscillatorTransposition, updatePulseWidth } from '../audio/voice.js';
import { updateFaderDisplay } from './faderDisplay.js';
import { getModulationConfig } from '../modules/perParamMod.js';
import { updateSlidePotRange, syncSlidePotFromState, updateFactorsCascadingRanges } from './slidePots.js';
import { historyManager } from '../history.js';
import { setBPM, setSwing, setRaemblBarLength } from '../../shared/clock.js';
import { mapRange, transpositionToSemitones } from '../utils.js';
import { updateCloudsParameter } from '../modules/clouds.js';

// Update application state based on fader movements
export function updateFaderState(label, value, parent) {
    const rawParentId = parent?.id || '';
    const parentId = rawParentId.replace(/^raembl-/, ''); // Strip namespace prefix for lookups

    // This switch handles updates originating from direct fader interaction
    switch (label) {
        // Clock/Transport
        case 'BPM':
            state.bpm = value;
            setBPM(value); // Broadcast to shared clock (synchronises with Bæng)
            updateDelay(); // BPM affects synced delay time
            drawDelay();
            startDelayAnimation();
            break;
        case 'SWING':
            state.swing = value;
            setSwing(value); // Broadcast to shared clock (synchronises with Bæng)
            break;
        case 'LENGTH':
            state.raemblBarLength = Math.max(1, Math.round(value));
            setRaemblBarLength(state.raemblBarLength); // Broadcast to shared clock
            break;

        // Factors
        case 'STEPS':
            const newSteps = Math.max(1, Math.min(32, Math.round(value)));
            const oldSteps = state.steps;
            state.steps = newSteps;
            if (state.fills > state.steps || oldSteps !== newSteps) {
                 state.fills = Math.min(state.fills, state.steps);
                 // Update SlidePot FILLS range (0 to current steps)
                 updateSlidePotRange('factors.fills', 0, state.steps);
                 syncSlidePotFromState('factors.fills');
                 // Legacy fader system update
                 const fillsFaderContainer = document.querySelector('#raembl-factors .fader-container:nth-child(2)');
                 if (fillsFaderContainer) {
                     const fillsFill = fillsFaderContainer.querySelector('.fader-fill');
                     const fillsValueDisplay = fillsFaderContainer.querySelector('.fader-value');
                     const maxFill = Math.max(1, state.steps);
                     if (fillsFill) { fillsFill.style.height = `${maxFill > 0 ? (state.fills / maxFill) * 100 : 0}%`; }
                     if (fillsValueDisplay) { fillsValueDisplay.textContent = state.fills.toString(); }
                 }
            }
            state.rotation = Math.min(state.rotation, state.steps > 0 ? state.steps - 1 : 0);
            // Update SlidePot SHIFT range (0 to steps-1)
            updateSlidePotRange('factors.shift', 0, Math.max(0, state.steps - 1));
            syncSlidePotFromState('factors.shift');
            // Update cascading ranges (fills changed, so accent/slide/trill need updating)
            updateFactorsCascadingRanges();
            // Legacy fader system update
            const shiftFaderContainer = document.querySelector('#raembl-factors .fader-container:nth-child(3)');
            if(shiftFaderContainer) {
                const shiftFill = shiftFaderContainer.querySelector('.fader-fill');
                const shiftValueDisplay = shiftFaderContainer.querySelector('.fader-value');
                const maxRotation = Math.max(0, state.steps - 1);
                if(shiftFill) { shiftFill.style.height = `${maxRotation > 0 ? (state.rotation / maxRotation) * 100 : 0}%`; }
                 if (shiftValueDisplay) { shiftValueDisplay.textContent = state.rotation.toString(); }
            }
            updateFactorsPattern();
            break;
        case 'FILLS':
            state.fills = Math.max(0, Math.min(state.steps, Math.round(value)));
            updateFactorsCascadingRanges(); // Update accent/slide/trill ranges
            updateFactorsPattern();
            break;
        case 'SHIFT':
             state.rotation = Math.max(0, Math.min(state.steps > 0 ? state.steps - 1 : 0, Math.round(value)));
             updateFactorsPattern();
             break;
        case '>':
            state.accentAmt = Math.round(value);
            updateFactorsCascadingRanges(); // Update slide/trill ranges
            updateFactorsPattern();
            break;
        case 'SLIDE':
            state.slideAmt = Math.round(value);
            updateFactorsCascadingRanges(); // Update accent/trill ranges
            updateFactorsPattern();
            break;
        case 'TR':
            if (parentId === 'factors') {
                state.trillAmt = Math.round(value);
                updateFactorsCascadingRanges(); // Update accent/slide ranges
                updateFactorsPattern();
            }
            break;

        // LFO
        case 'AMP': state.lfoAmp = value; break;
        case 'FREQ': state.lfoFreq = value; break;
        case 'WAVE':
            if (parentId === 'lfo') { state.lfoWaveform = value; }
            else if (parentId === 'mod') {
                const stepVal = Math.round(value / 25);
                state.modLfoWaveform = stepVal * 25;
            }
            break;
        case 'OFFSET': state.lfoOffset = value; break;

        // Path
        case 'SCALE': state.scale = Math.round(value); drawPath(); break;
        case 'ROOT': state.root = Math.round(value); drawPath(); break;
        case 'PROB': state.probability = value; break;

        // Oscillator
        case 'OCT':
            state.mainTransposition = Math.round(value);

            // Update worklet parameter (subtractive)
            if (config.useWorklet && config.workletBridge) {
                const semitones = transpositionToSemitones(value);
                config.workletBridge.updateAllParameters({ octaveTranspose: semitones });
            }

            // Update Plaits pitch bend (octave transpose)
            if (state.engineType === 'plaits' && config.plaitsVoicePool) {
                const semitones = transpositionToSemitones(value);
                config.plaitsVoicePool.setPitchBend(semitones);
            }

            // Update Rings pitch bend (octave transpose) - realtime update
            if (state.engineType === 'rings' && config.ringsVoicePool?.isReady()) {
                const semitones = transpositionToSemitones(value);
                config.ringsVoicePool.setOctaveTranspose(semitones);
            }

            updateOscillatorTransposition();
            break;

        case 'SUB OCT':
            state.subTransposition = Math.round(value);

            // Update worklet parameter
            if (config.useWorklet && config.workletBridge) {
                const semitones = transpositionToSemitones(value);
                config.workletBridge.updateAllParameters({ subOctaveTranspose: semitones });
            }

            updateOscillatorTransposition();
            break;

        case 'DRIFT':
            state.drift = value;

            // Update worklet parameter
            if (config.useWorklet && config.workletBridge) {
                const normalized = value / 100; // 0-100 → 0-1
                config.workletBridge.updateAllParameters({ drift: normalized });
            }
            break;

        // Engine model selection (Plaits or Rings)
        case 'MDL':
            if (state.engineType === 'plaits') {
                // MDL shows 1-24 to user, convert to 0-23 internal index
                const engineIndex = Math.round(value) - 1;
                state.plaitsEngine = Math.max(0, Math.min(23, engineIndex));
                setPlaitsEngine(state.plaitsEngine);
            } else if (state.engineType === 'rings') {
                // MDL shows 1-6 to user, convert to 0-5 internal index
                const modelIndex = Math.round(value) - 1;
                state.ringsModel = Math.max(0, Math.min(5, modelIndex));
                setRingsModel(state.ringsModel);
            }
            break;

        case 'HARM':
            state.plaitsHarmonics = value;
            updatePlaitsParameter('plaits.harmonics', value / 100);
            break;

        case 'TIMB':
            state.plaitsTimbre = value;
            updatePlaitsParameter('plaits.timbre', value / 100);
            break;

        case 'MORPH':
            state.plaitsMorph = value;
            updatePlaitsParameter('plaits.morph', value / 100);
            break;

        case 'DEC':
            state.plaitsLpgDecay = value;
            updatePlaitsParameter('plaits.lpgDecay', value / 100);
            break;

        case 'COL':
            state.plaitsLpgColour = value;
            updatePlaitsParameter('plaits.lpgColour', value / 100);
            break;

        case 'MIX':
            // Plaits OUT/AUX mix control (only in mixer module when Plaits is active)
            if (parentId === 'mixer' && state.engineType === 'plaits') {
                state.plaitsMixOutAux = value;
                updatePlaitsParameter('plaits.mixOutAux', value / 100);
            }
            break;

        // Rings engine parameters
        // Note: MDL is shared with Plaits but handled by parent ID check
        case 'STRUC':
            state.ringsStructure = value;
            updateRingsParameter('rings.structure', value / 100);
            break;

        case 'BRIT':
            state.ringsBrightness = value;
            updateRingsParameter('rings.brightness', value / 100);
            break;

        case 'DAMP':
            // Only handle for Rings - DAMP is also used by Reverb
            if (parentId === 'oscillator') {
                state.ringsDamping = value;
                updateRingsParameter('rings.damping', value / 100);
            } else {
                state.damping = value;
                updateReverb();
                drawReverb();
            }
            break;

        case 'POS':
            // Only handle for Rings when in oscillator - POS is also used by Clouds
            if (parentId === 'oscillator') {
                state.ringsPosition = value;
                updateRingsParameter('rings.position', value / 100);
            } else if (parentId === 'clouds') {
                state.cloudsPosition = value;
                updateCloudsParameter('clouds.position', value);
            }
            break;

        case 'STRM':
            // Rings strum control (in mixer module when Rings is active)
            if (parentId === 'mixer' && state.engineType === 'rings') {
                state.ringsMixStrum = value;
                updateRingsParameter('rings.mixStrum', value / 100);
            }
            break;

        case 'GLIDE':
            state.glide = value;

            // Update worklet parameter
            if (config.useWorklet && config.workletBridge) {
                const glideTimeSec = mapRange(value, 0, 100, 0.001, 1.0, false);
                config.workletBridge.updateAllParameters({ glide: glideTimeSec });
            }
            break;

        case 'WIDTH':
            state.pulseWidth = value;

            // Update worklet parameter
            if (config.useWorklet && config.workletBridge) {
                const pwmWidth = 0.25 + (value / 100) * 0.5; // 25-75%
                config.workletBridge.updateAllVoices({ type: 'setOscMix', pwm: pwmWidth });
            }

            updatePulseWidth();
            break;

        case 'PWM':
            state.pwmAmount = value;

            // Update worklet parameter based on toggle state
            if (config.useWorklet && config.workletBridge) {
                const normalized = value / 100;
                if (state.pwmSource === 1) { // ENV
                    config.workletBridge.updateAllParameters({ envToPWM: normalized, lfoToPWM: 0 });
                } else { // LFO (default)
                    config.workletBridge.updateAllParameters({ lfoToPWM: normalized, envToPWM: 0 });
                }
            }
            break;

        // Mixer
        case '◢': // SAW
            state.sawLevel = value;

            if (config.useWorklet && config.workletBridge) {
                const normalized = value / 100;
                config.workletBridge.updateAllVoices({ type: 'setOscMix', saw: normalized });
            }
            break;

        case '⊓': // SQUARE
            state.squareLevel = value;

            if (config.useWorklet && config.workletBridge) {
                const normalized = value / 100;
                config.workletBridge.updateAllVoices({ type: 'setOscMix', sq: normalized });
            }
            break;

        case '△': // TRIANGLE
            state.triangleLevel = value;

            if (config.useWorklet && config.workletBridge) {
                const normalized = value / 100;
                config.workletBridge.updateAllVoices({ type: 'setOscMix', tri: normalized });
            }
            break;

        case '■': // SUB
            state.subLevel = value;

            if (config.useWorklet && config.workletBridge) {
                const normalized = value / 100;
                config.workletBridge.updateAllVoices({ type: 'setOscMix', sub: normalized });
            }
            break;

        case '≋': // NOISE
            state.noiseLevel = value;

            if (config.useWorklet && config.workletBridge) {
                const normalized = value / 100;
                config.workletBridge.updateAllVoices({ type: 'setOscMix', noise: normalized });
            }
            break;

        // Filter
        case 'HP':
            state.highPass = value;

            if (config.useWorklet && config.workletBridge) {
                const hpfCutoff = mapRange(value, 0, 100, 20, 10000, true);
                config.workletBridge.updateAllParameters({ hpfCutoff: hpfCutoff });
            }

            updateFilter();
            break;

        case 'LP':
            state.lowPass = value;

            if (config.useWorklet && config.workletBridge) {
                const lpCutoff = mapRange(value, 0, 100, 20, 20000, true);
                config.workletBridge.updateAllParameters({ filterCutoff: lpCutoff });
            }

            updateFilter();
            break;

        case 'RES':
            state.resonance = value;

            if (config.useWorklet && config.workletBridge) {
                const q = mapRange(Math.pow(value / 100, 1.5), 0, 1, 0.7, 25);
                config.workletBridge.updateAllParameters({ filterResonance: q });
            }

            updateFilter();
            break;

        case 'KEY':
            state.keyFollow = value;

            if (config.useWorklet && config.workletBridge) {
                const normalized = value / 100;
                config.workletBridge.updateAllParameters({ keyTracking: normalized });
            }

            updateFilter();
            break;

        case 'ENV':
            state.envAmount = value;

            if (config.useWorklet && config.workletBridge) {
                // Worklet expects -1 to +1 bipolar
                const normalized = (value / 100) * 2 - 1; // 0-100 → -1 to +1
                config.workletBridge.updateAllParameters({ filterEnvAmount: normalized });
            }

            updateFilter(); // Env amount change should re-evaluate filter targets
            break;

        case 'MOD':
            if (parentId === 'filter') {
                state.filterMod = value;

                if (config.useWorklet && config.workletBridge) {
                    const normalized = value / 100;
                    config.workletBridge.updateAllParameters({ lfoToFilter: normalized });
                }
            }
            else if (parentId === 'oscillator') {
                state.pitchMod = value;

                // Update worklet parameter based on toggle state
                if (config.useWorklet && config.workletBridge) {
                    const normalized = value / 100;
                    if (state.modSource === 1) { // ENV
                        config.workletBridge.updateAllParameters({ pitchEnvAmount: normalized, lfoToPitch: 0 });
                    } else { // LFO (default)
                        config.workletBridge.updateAllParameters({ lfoToPitch: normalized, pitchEnvAmount: 0 });
                    }
                }
            }
            break;

        // Envelope
        case 'A':
            state.attack = value;

            if (config.useWorklet && config.workletBridge) {
                const timeSec = mapRange(value, 0, 100, 0.001, 2.0, false);
                config.workletBridge.updateAllVoices({
                    type: 'setEnvelope',
                    target: 'amp',
                    attack: timeSec
                });
                config.workletBridge.updateAllVoices({
                    type: 'setEnvelope',
                    target: 'filter',
                    attack: timeSec
                });
            }
            break;

        case 'D':
            state.decay = value;

            if (config.useWorklet && config.workletBridge) {
                const timeSec = mapRange(value, 0, 100, 0.001, 2.0, false);
                config.workletBridge.updateAllVoices({
                    type: 'setEnvelope',
                    target: 'amp',
                    decay: timeSec
                });
                config.workletBridge.updateAllVoices({
                    type: 'setEnvelope',
                    target: 'filter',
                    decay: timeSec
                });
            }
            break;

        case 'S':
            state.sustain = value;

            if (config.useWorklet && config.workletBridge) {
                const normalized = value / 100;
                config.workletBridge.updateAllVoices({
                    type: 'setEnvelope',
                    target: 'amp',
                    sustain: normalized
                });
                // Filter sustain typically 0 for filter envelope in Ræmbl
                config.workletBridge.updateAllVoices({
                    type: 'setEnvelope',
                    target: 'filter',
                    sustain: 0
                });
            }
            break;

        case 'R':
            state.release = value;

            if (config.useWorklet && config.workletBridge) {
                const timeSec = mapRange(value, 0, 100, 0.001, 2.0, false);
                config.workletBridge.updateAllVoices({
                    type: 'setEnvelope',
                    target: 'amp',
                    release: timeSec
                });
                config.workletBridge.updateAllVoices({
                    type: 'setEnvelope',
                    target: 'filter',
                    release: timeSec
                });
            }
            break;

        // Reverb
        case 'SEND':
            if (parentId === 'reverb') {
                state.reverbMix = value;
                updateReverbSendLevel();
                drawReverb();
            } else if (parentId === 'delay') {
                state.delayMix = value;
                updateDelay();
                drawDelay();
                startDelayAnimation();
            }
            break;
        case 'PRED': state.preDelay = value; updateReverb(); drawReverb(); break;
        case 'DEC':
             state.reverbDecay = value;
             updateReverb();
             drawReverb();
             break;
        case 'DIFF': state.diffusion = value; updateReverb(); drawReverb(); break;
        // DAMP is handled earlier - supports both Rings (oscillator) and Reverb

        // Delay
        case 'TIME': // MODIFIED for Delay Sync/Free
            if (parentId === 'delay') {
                if (state.delaySyncEnabled) {
                    state.delayTime = value; // Value for SYNC mode (divisions)
                } else {
                    state.delayTimeFree = value; // Value for FREE mode (ms mapping)
                }
                updateDelay();
                drawDelay();
                startDelayAnimation();
            } else if (parentId === 'mod' && label === 'RATE') { // Assuming RATE fader in MOD module
                 state.modLfoRate = value;
            }
            // Add other 'TIME' or 'RATE' faders here if they exist
            break;
        case 'FDBK':
            state.feedback = value;
            updateDelay();
            drawDelay();
            startDelayAnimation();
            break;
        case 'WOW':
            state.wow = value;
            updateDelay();
            drawDelay();
            startDelayAnimation();
            break;
        case 'FLUT':
            state.flutter = value;
            updateDelay();
            drawDelay();
            startDelayAnimation();
            break;
        case 'SAT':
            state.saturation = value;
            updateDelay();
            drawDelay();
            startDelayAnimation();
            break;

        // Mod LFO (RATE fader is often labeled TIME or FREQ, ensure correct handling)
        case 'RATE': // This is for the MOD LFO module
             if (parentId === 'mod') {
                state.modLfoRate = value;
             }
             break;


        // Output
        case 'VOL':
            state.volume = value;
            setMasterVolume(value);
            break;

        // Clouds parameters
        case 'PITCH':
            if (parentId === 'clouds') {
                state.cloudsPitch = value;
                updateCloudsParameter('clouds.pitch', value);
            }
            break;
        // POS is handled earlier - supports both Rings (oscillator) and Clouds
        case 'DENS':
            state.cloudsDensity = value;
            updateCloudsParameter('clouds.density', value);
            break;
        case 'SIZE':
            state.cloudsSize = value;
            updateCloudsParameter('clouds.size', value);
            break;
        case 'TEX':
            state.cloudsTexture = value;
            updateCloudsParameter('clouds.texture', value);
            break;
        case 'D/W':
            state.cloudsDryWet = value;
            updateCloudsParameter('clouds.dryWet', value);
            break;
        case 'SPRD':
            state.cloudsSpread = value;
            updateCloudsParameter('clouds.spread', value);
            break;
        case 'FB':
            state.cloudsFeedback = value;
            updateCloudsParameter('clouds.feedback', value);
            break;
        case 'VERB':
            state.cloudsReverb = value;
            updateCloudsParameter('clouds.reverb', value);
            break;
        case 'GAIN':
            if (parentId === 'clouds') {
                state.cloudsInputGain = value;
                updateCloudsParameter('clouds.inputGain', value);
            }
            break;

        default:
            console.warn(`Unhandled fader state update: Label=${label}, ParentID=${parentId}, Value=${value}`);
    }

    // Update base value for modulated parameters
    // This ensures the reference line moves when user adjusts the fader
    // NOTE: Use rawParentId (with 'raembl-' prefix) to match parameterDefinitions.module
    const paramId = Object.keys(parameterDefinitions).find(id => {
        const def = parameterDefinitions[id];
        return def.label === label && def.module === rawParentId;
    });

    if (paramId) {
        const modConfig = getModulationConfig(paramId);
        if (modConfig.enabled && modConfig.depth > 0) {
            modConfig.baseValue = value;
        }
    }

    // Capture snapshot after parameter update (debounced to handle rapid fader movements)
    if (typeof historyManager !== 'undefined' && historyManager) {
        historyManager.pushSnapshot(true);
    }
}

export function updateParameterById(parameterId, value) {
    const paramDef = parameterDefinitions[parameterId];
    if (!paramDef) {
        console.warn(`Parameter ID "${parameterId}" not found in definitions.`);
        return;
    }

    const pathParts = paramDef.statePath.split('.');
    let currentStateObject = state;
    for (let i = 0; i < pathParts.length - 1; i++) {
        currentStateObject = currentStateObject[pathParts[i]];
        if (!currentStateObject) {
            console.error(`Invalid state path for ${parameterId}: ${paramDef.statePath}`);
            return;
        }
    }
    let processedValue = value;
    if (paramDef.step) {
        processedValue = Math.round(value / paramDef.step) * paramDef.step;
    }
    processedValue = Math.max(paramDef.min, Math.min(paramDef.max, processedValue));

    // MODIFIED for Delay Time Sync/Free
    if (parameterId === 'delay.time') {
        if (state.delaySyncEnabled) {
            state.delayTime = processedValue;
        } else {
            state.delayTimeFree = processedValue;
        }
    } else {
        const propName = pathParts[pathParts.length - 1];
        currentStateObject[propName] = processedValue;
    }

    // Sync SlidePot UI from state (replaces legacy fader updates)
    syncSlidePotFromState(parameterId);

    // FIX: Handle namespace prefix for module ID
    // Parameter definitions use 'reverb'/'delay', but actual IDs are 'raembl-reverb'/'raembl-delay'
    // Some params (clock) have module: null as they're handled by the time strip
    let faderModuleElement = null;
    if (paramDef.module) {
        faderModuleElement = document.getElementById(paramDef.module);
        if (!faderModuleElement && !paramDef.module.startsWith('raembl-')) {
            faderModuleElement = document.getElementById(`raembl-${paramDef.module}`);
        }
    }

    let faderContainer = null;
    if (faderModuleElement) {
        const fadersInModule = faderModuleElement.querySelectorAll('.fader-container');
        fadersInModule.forEach(fc => {
            const labelEl = fc.querySelector('.fader-label');
            if (labelEl) {
                // Check data-param-label attribute first (for mixer icons)
                const dataLabel = labelEl.getAttribute('data-param-label');
                const textLabel = labelEl.textContent.trim();
                if (dataLabel === paramDef.label || textLabel === paramDef.label) {
                    faderContainer = fc;
                }
            }
        });
    }
    // If paramDef.module is null or not found, skip UI update silently (handled elsewhere, e.g. time strip or SlidePots)

    if (faderContainer) {
        const fill = faderContainer.querySelector('.fader-fill');
        const valueDisplay = faderContainer.querySelector('.fader-value');
        if (fill) {
            const fillPercentage = ((processedValue - paramDef.min) / (paramDef.max - paramDef.min)) * 100;
            if (paramDef.label === 'OFFSET') {
                const zeroPosition = (0 - paramDef.min) / (paramDef.max - paramDef.min) * 100;
                const fillHeight = Math.abs(fillPercentage - zeroPosition);
                const bottom = processedValue >= 0 ? `${zeroPosition}%` : `${fillPercentage}%`;
                fill.style.height = `${fillHeight}%`;
                fill.style.bottom = bottom;
            } else {
                 fill.style.height = `${Math.min(100, Math.max(0, fillPercentage))}%`;
            }
        }
        if (valueDisplay) {
            updateFaderDisplay(paramDef.label, processedValue, valueDisplay);
        }
    }

    switch (parameterId) {
        case 'clock.bpm': updateDelay(); drawDelay(); startDelayAnimation(); break;
        case 'clock.swing': break;
        case 'clock.length': break;
        case 'factors.steps':
        case 'factors.fills':
        case 'factors.shift':
        case 'factors.accentAmt':
        case 'factors.slideAmt':
        case 'factors.trillAmt':
            updateFactorsPattern();
            break;
        case 'lfo.amp': break;
        case 'lfo.freq': break;
        case 'lfo.waveform': break;
        case 'lfo.offset': break;
        case 'path.scale': drawPath(); break;
        case 'path.root': drawPath(); break;
        case 'path.probability': break;
        case 'modLfo.rate': break;
        case 'modLfo.waveform': break;
        case 'filter.highPass': updateFilter(); break;
        case 'filter.lowPass': updateFilter(); break;
        case 'filter.resonance': updateFilter(); break;
        case 'filter.keyFollow': updateFilter(); break;
        case 'filter.envAmount': updateFilter(); break; // Env amount change should re-evaluate filter targets
        case 'filter.mod': break;
        case 'envelope.attack': break;
        case 'envelope.decay': break;
        case 'envelope.sustain': break;
        case 'envelope.release': break;
        case 'osc.oct':
        case 'osc.subOct':
            updateOscillatorTransposition();
            break;
        case 'osc.drift': break;
        case 'osc.glide': break;
        case 'osc.pulseWidth': updatePulseWidth(); break;
        case 'osc.pwmAmount': break;
        case 'osc.pitchMod': break;
        case 'mixer.sawLevel': break;
        case 'mixer.squareLevel': break;
        case 'mixer.triangleLevel': break;
        case 'mixer.subLevel': break;
        case 'mixer.noiseLevel': break;
        case 'delay.mix': updateDelay(); drawDelay(); startDelayAnimation(); break;
        case 'delay.time': updateDelay(); drawDelay(); startDelayAnimation(); break; // Handles both sync/free
        case 'delay.feedback': updateDelay(); drawDelay(); startDelayAnimation(); break;
        case 'delay.wow': updateDelay(); drawDelay(); startDelayAnimation(); break;
        case 'delay.flutter': updateDelay(); drawDelay(); startDelayAnimation(); break;
        case 'delay.saturation': updateDelay(); drawDelay(); startDelayAnimation(); break;
        // delay.syncEnabled is not a fader, handled by switch logic in controls.js
        case 'reverb.mix': updateReverbSendLevel(); drawReverb(); break;
        case 'reverb.preDelay': updateReverb(); drawReverb(); break;
        case 'reverb.decay': updateReverb(); drawReverb(); break;
        case 'reverb.diffusion': updateReverb(); drawReverb(); break;
        case 'reverb.damping': updateReverb(); drawReverb(); break;
        case 'output.volume': setMasterVolume(processedValue); break;
        default:
            break;
    }

    // Capture snapshot after parameter update (debounced to handle rapid fader movements)
    if (typeof historyManager !== 'undefined' && historyManager) {
        historyManager.pushSnapshot(true);
    }
}