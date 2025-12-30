// File: js/ui/faderUtils.js
// Fader utility functions - UPDATED for Delay Sync/Free
// REMOVED problematic querySelector from updateFillFromState
import { state } from '../state.js';
import { scales } from '../utils.js';
import { updateFaderState } from './faderState.js';
import { updateFaderDisplay } from './faderDisplay.js';
// getModLfoWaveformIcon is not directly used here for initial display, faderDisplay.js handles it.

// Get min/max range for a parameter
export function getParameterRange(label, parentId = '') {
    let min = 0;
    let max = 100;

    if (label === 'OCT' || label === 'SUB OCT') {
        min = 0;
        max = 8;
    } else if (label === 'MDL') {
        // Plaits model selector: 1-24 engines
        min = 1;
        max = 24;
    } else if (label === 'SCALE') {
        min = 0;
        max = scales.length - 1;
    } else if (label === 'ROOT') {
        min = 0;
        max = 11;
    } else if (label === 'WIDTH') {
        min = 5;
        max = 95;
    } else if (label === 'OFFSET') {
        min = -100;
        max = 100;
    } else if (label === 'BPM') {
        min = 20;
        max = 300;
    } else if (label === 'LENGTH' || label === 'ℓ') {
        min = 1;
        max = 128;
    } else if (label === 'STEPS') {
        min = 1;
        max = 32;
    } else if (label === 'FILLS') {
        min = 0;
        max = Math.max(1, Math.min(state.steps, 32));
    } else if (label === 'SHIFT') {
        min = 0;
        max = Math.max(0, state.steps > 0 ? state.steps - 1 : 0);
    } else if (label === '>' || label === 'ACCENT') {
        // Accent count can't exceed (fills - slide - trill)
        min = 0;
        const usedByOthers = (state.slideAmt || 0) + (state.trillAmt || 0);
        max = Math.max(0, state.fills - usedByOthers);
    } else if (label === 'SLIDE') {
        // Slide count can't exceed (fills - accent - trill)
        min = 0;
        const usedByOthers = (state.accentAmt || 0) + (state.trillAmt || 0);
        max = Math.max(0, state.fills - usedByOthers);
    } else if (label === 'TR' || label === 'TRILL') {
        // Trill count can't exceed (fills - accent - slide)
        min = 0;
        const usedByOthers = (state.accentAmt || 0) + (state.slideAmt || 0);
        max = Math.max(0, state.fills - usedByOthers);
    } else if (label === 'WAVE' && parentId === 'mod') {
        min = 0;
        max = 100; // Stepping handles discrete values from this 0-100 range
    }
    // TIME fader for delay always has a 0-100 range, its meaning changes.

    return { min, max };
}

// Apply stepping for stepped faders
export function applySteppingIfNeeded(fader, label, value, parent) {
    if (!fader.closest('.stepped')) return value;
    const parentId = parent?.id || '';

    if (label === 'SCALE' || label === 'ROOT' || label === 'OCT' || label === 'SUB OCT') {
        value = Math.round(value);
    } else if (label === 'WAVE' && parentId === 'mod') {
        const stepSize = 25; // For 0, 25, 50, 75, 100
        value = Math.round(value / stepSize) * stepSize;
    }
    return value;
}

// Update fader fill element
export function updateFaderFill(label, value, fill, min, max) {
    if (!fill) return;
    if (max === min) { // Avoid division by zero if min and max are the same
        fill.style.height = (value >= min) ? '100%' : '0%';
        if (label === 'OFFSET') fill.style.bottom = '50%'; // Center for offset
        return;
    }

    if (label === 'OFFSET') {
        const zeroPosition = ((0 - min) / (max - min)) * 100;
        const valuePosition = ((value - min) / (max - min)) * 100;
        const fillHeight = Math.abs(valuePosition - zeroPosition);
        const bottom = value >= 0 ? `${zeroPosition}%` : `${valuePosition}%`;
        fill.style.height = `${fillHeight}%`;
        fill.style.bottom = bottom;
    } else {
        const fillPercentage = ((value - min) / (max - min)) * 100;
        fill.style.height = `${Math.min(100, Math.max(0, fillPercentage))}%`;
        fill.style.bottom = '0%'; // Ensure bottom is reset for non-offset faders
    }
}

// Set up touch interaction for faders
export function setupTouchInteraction(fader, fill, valueDisplay, label, parent, minInitial, maxInitial) {
    let currentMin = minInitial;
    let currentMax = maxInitial;
    const parentId = parent?.id || '';

    fader.addEventListener('touchstart', e => {
        e.preventDefault();
        const rect = fader.getBoundingClientRect();
        const height = rect.height;
        const range = getParameterRange(label, parentId); // Re-check dynamic ranges
        currentMin = range.min;
        currentMax = range.max;

        const updateValue = y => {
            const percentage = 1 - Math.min(Math.max(0, (y - rect.top) / height), 1);
            let value = currentMin + percentage * (currentMax - currentMin);
            value = applySteppingIfNeeded(fader, label, value, parent);
            value = Math.max(currentMin, Math.min(currentMax, value)); // Clamp to current range
            updateFaderFill(label, value, fill, currentMin, currentMax);
            updateFaderState(label, value, parent); // Update actual state
            updateFaderDisplay(label, value, valueDisplay); // Update text display
        };
        updateValue(e.touches[0].clientY);

        const handleTouchMove = e => {
            e.preventDefault();
            const rangeMove = getParameterRange(label, parentId); // Recheck on move too
            currentMin = rangeMove.min;
            currentMax = rangeMove.max;
            updateValue(e.touches[0].clientY);
        };
        const handleTouchEnd = () => {
            fader.removeEventListener('touchmove', handleTouchMove);
            fader.removeEventListener('touchend', handleTouchEnd);
        };
        fader.addEventListener('touchmove', handleTouchMove, { passive: false });
        fader.addEventListener('touchend', handleTouchEnd);
    }, { passive: false });
}

// Update fill position from current state values
export function updateFillFromState(label, fill, parent) {
    if (!fill) return;

    let stateValue;
    // Strip 'raembl-' prefix from parent ID for comparison
    const rawParentId = parent?.id || '';
    const parentId = rawParentId.replace(/^raembl-/, '');
    let { min, max } = getParameterRange(label, rawParentId);

    // Get appropriate value from state
    switch (label) {
        case 'BPM': stateValue = state.bpm; break;
        case 'SWING': stateValue = state.swing; break;
        case 'LENGTH':
        case 'ℓ': stateValue = state.barLength; break;
        case 'STEPS': stateValue = state.steps; break;
        case 'FILLS': stateValue = state.fills; break;
        case 'SHIFT': stateValue = state.rotation; break;
        case '>': stateValue = state.accentAmt; break;
        case 'SLIDE': stateValue = state.slideAmt; break;
        case 'TR':
            if (parentId === 'factors') stateValue = state.trillAmt;
            break;
        case 'AMP': stateValue = state.lfoAmp; break;
        case 'FREQ': stateValue = state.lfoFreq; break;
        case 'WAVE':
            if (parentId === 'lfo') stateValue = state.lfoWaveform;
            else if (parentId === 'mod') stateValue = state.modLfoWaveform;
            break;
        case 'OFFSET': stateValue = state.lfoOffset; break;
        case 'SCALE': stateValue = state.scale; break;
        case 'ROOT': stateValue = state.root; break;
        case 'PROB': stateValue = state.probability; break;
        case 'OCT': stateValue = state.mainTransposition; break;
        case 'SUB OCT': stateValue = state.subTransposition; break;
        case 'DRIFT': stateValue = state.drift; break;
        case 'GLIDE': stateValue = state.glide; break;
        case 'WIDTH': stateValue = state.pulseWidth; break;
        case 'PWM': stateValue = state.pwmAmount; break;
        case '◢': stateValue = state.sawLevel; break;
        case '⊓': stateValue = state.squareLevel; break;
        case '△': stateValue = state.triangleLevel; break;
        case '■': stateValue = state.subLevel; break;
        case '≋': stateValue = state.noiseLevel; break;
        case 'HP': stateValue = state.highPass; break;
        case 'LP': stateValue = state.lowPass; break;
        case 'RES': stateValue = state.resonance; break;
        case 'KEY': stateValue = state.keyFollow; break;
        case 'ENV': stateValue = state.envAmount; break;
        case 'A': stateValue = state.attack; break;
        case 'D': stateValue = state.decay; break;
        case 'S': stateValue = state.sustain; break;
        case 'R': stateValue = state.release; break;
        case 'SEND':
            if (parentId === 'reverb') stateValue = state.reverbMix;
            else if (parentId === 'delay') stateValue = state.delayMix;
            break;
        case 'PRED': stateValue = state.preDelay; break;
        case 'DEC': stateValue = state.reverbDecay; break;
        case 'DIFF': stateValue = state.diffusion; break;
        case 'DAMP': stateValue = state.damping; break;
        case 'TIME':
            if (parentId === 'delay') {
                stateValue = state.delaySyncEnabled ? state.delayTime : state.delayTimeFree;
            }
            break;
        case 'FDBK': stateValue = state.feedback; break;
        case 'WOW': stateValue = state.wow; break;
        case 'FLUT': stateValue = state.flutter; break;
        case 'SAT': stateValue = state.saturation; break;
        case 'VOL': stateValue = state.volume; break;
        case 'RATE':
             if (parentId === 'mod') stateValue = state.modLfoRate;
             break;
        // Clouds parameters
        case 'PITCH':
            if (parentId === 'clouds') stateValue = state.cloudsPitch;
            break;
        case 'POS':
            if (parentId === 'clouds') stateValue = state.cloudsPosition;
            break;
        case 'DENS':
            if (parentId === 'clouds') stateValue = state.cloudsDensity;
            break;
        case 'SIZE':
            if (parentId === 'clouds') stateValue = state.cloudsSize;
            break;
        case 'TEX':
            if (parentId === 'clouds') stateValue = state.cloudsTexture;
            break;
        case 'D/W':
            if (parentId === 'clouds') stateValue = state.cloudsDryWet;
            break;
        case 'SPRD':
            if (parentId === 'clouds') stateValue = state.cloudsSpread;
            break;
        case 'FB':
            if (parentId === 'clouds') stateValue = state.cloudsFeedback;
            break;
        case 'VERB':
            if (parentId === 'clouds') stateValue = state.cloudsReverb;
            break;
        case 'GAIN':
            if (parentId === 'clouds') stateValue = state.cloudsInputGain;
            break;
        default:
            if (parentId === 'filter' && label === 'MOD') stateValue = state.filterMod;
            else if (parentId === 'oscillator' && label === 'MOD') stateValue = state.pitchMod;
            else {
                console.warn(`updateFillFromState: Unhandled label/parent combination: ${label} / ${parentId}`);
                stateValue = 0; // Default to 0 to prevent errors if undefined
            }
            break;
    }
    
    if (stateValue === undefined) {
        console.error(`State value for fader ${label} (parent: ${parentId}) is undefined. Defaulting to min.`);
        stateValue = min; // Default to min to avoid error with fill calculation
    }

    updateFaderFill(label, stateValue, fill, min, max);
    // The problematic querySelector for valueDisplay has been removed.
    // Initial text display is handled by a separate loop in main.js.
}