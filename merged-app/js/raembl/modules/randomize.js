// File: js/modules/randomize.js
// Per-module randomization system

import { parameterDefinitions } from '../state.js';
import { updateParameterById } from '../ui/faderState.js';
import { historyManager } from '../history.js';

// Module parameter filters - defines which parameters to randomize for each module
const moduleParameterFilters = {
    clock: ['clock.bpm', 'clock.swing', 'clock.length'],
    factors: ['factors.steps', 'factors.fills', 'factors.shift', 'factors.accentAmt', 'factors.slideAmt', 'factors.trillAmt', 'factors.gateLength'],
    lfo: ['lfo.amp', 'lfo.freq', 'lfo.waveform', 'lfo.offset'],
    path: ['path.scale', 'path.root', 'path.probability'],
    reverb: ['reverb.mix', 'reverb.preDelay', 'reverb.decay', 'reverb.diffusion', 'reverb.damping'],
    delay: ['delay.mix', 'delay.time', 'delay.feedback', 'delay.wow', 'delay.flutter', 'delay.saturation'],
    mod: ['modLfo.rate', 'modLfo.waveform'],
    oscillator: ['osc.oct', 'osc.subOct', 'osc.drift', 'osc.glide', 'osc.pulseWidth', 'osc.pwmAmount', 'osc.pitchMod'],
    mixer: ['mixer.sawLevel', 'mixer.squareLevel', 'mixer.triangleLevel', 'mixer.subLevel', 'mixer.noiseLevel'],
    filter: ['filter.highPass', 'filter.lowPass', 'filter.resonance', 'filter.keyFollow', 'filter.envAmount', 'filter.mod'],
    envelope: ['envelope.attack', 'envelope.decay', 'envelope.sustain', 'envelope.release'],
    output: ['output.volume']
};

/**
 * Generate a random value for a given parameter ID based on its definition
 * @param {string} paramId - The parameter ID from parameterDefinitions
 * @returns {number} - Random value within the parameter's min/max range, respecting step size
 */
export function generateRandomValue(paramId) {
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) {
        console.warn(`Parameter ID "${paramId}" not found in definitions.`);
        return 0;
    }

    const { min, max, step } = paramDef;
    let randomValue;

    if (step) {
        // For stepped parameters, generate random value aligned to step
        const numSteps = Math.floor((max - min) / step);
        const randomStep = Math.floor(Math.random() * (numSteps + 1));
        randomValue = min + (randomStep * step);
    } else {
        // For continuous parameters, generate random float
        randomValue = min + (Math.random() * (max - min));
    }

    // Ensure value is within bounds
    return Math.max(min, Math.min(max, randomValue));
}

/**
 * Randomize all parameters for a given module
 * CRITICAL: Only randomizes base parameter values, NOT state.perParamModulations
 * @param {string} moduleId - The module ID (e.g., 'clock', 'factors', 'lfo', etc.)
 */
export function randomizeModule(moduleId) {
    const parameterIds = moduleParameterFilters[moduleId];

    if (!parameterIds) {
        console.warn(`No parameter filter defined for module: ${moduleId}`);
        return;
    }


    // Randomize each parameter in the module
    parameterIds.forEach(paramId => {
        const randomValue = generateRandomValue(paramId);
        updateParameterById(paramId, randomValue);
    });


    // Capture snapshot after randomization
    if (typeof historyManager !== 'undefined' && historyManager) {
        historyManager.pushSnapshot();
    }
}
