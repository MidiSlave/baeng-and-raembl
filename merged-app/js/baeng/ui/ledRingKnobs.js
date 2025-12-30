/**
 * File: merged-app/js/baeng/ui/ledRingKnobs.js
 * Setup and management for Bæng LED Ring Knob controls
 */

import { LEDRingKnob } from '../../shared/components/LEDRingKnob.js';
import { state, parameterDefinitions, applyParameterToAllVoices, shouldAllowControlAll } from '../state.js';
import { getParameterRange } from '../utils/faderUtils.js';
import { historyManager } from '../history.js';

// Registry for external access (patch load, undo/redo, PPMod)
export const ledRingKnobRegistry = new Map();

/**
 * Setup all LED Ring Knobs in the Bæng app
 * Called on DOMContentLoaded and after module re-renders
 */
export function setupLEDRingKnobs() {
    // Clear existing registry
    ledRingKnobRegistry.forEach(knob => knob.destroy?.());
    ledRingKnobRegistry.clear();

    // Find all LED ring knob containers
    const containers = document.querySelectorAll('.baeng-app .led-ring-knob');

    containers.forEach(container => {
        const paramId = container.dataset.paramId;
        const mode = container.dataset.mode || 'continuous';

        if (!paramId) {
            console.warn('[Bæng] LED Ring Knob missing data-param-id:', container);
            return;
        }

        // Get parameter definition
        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) {
            console.warn(`[Bæng] Unknown parameter: ${paramId}`);
            return;
        }

        // Get current value from state
        const currentValue = getValueFromState(paramId, paramDef);

        // Get dynamic range for euclidean parameters (fills, shift, accent, flam, ratchet)
        // For other parameters, use static definition
        let min = paramDef.min ?? 0;
        let max = paramDef.max ?? 100;

        // Dynamic range for euclidean params EXCEPT steps (steps uses static 1-16 definition)
        if (paramId !== 'euclidean.steps' && paramId.startsWith('euclidean.')) {
            const dynamicRange = getParameterRange(paramId, state);
            min = dynamicRange.min;
            max = dynamicRange.max;
        }

        // Build options
        let formatValue = paramDef.formatValue ?? null;

        // Special formatValue for SLICE knob
        if (container.classList.contains('slice-knob')) {
            formatValue = (value) => {
                const voice = state.voices[state.selectedVoice];
                if (voice?.sliceConfig?.slices) {
                    const sliceCount = voice.sliceConfig.slices.length;
                    // Calculate slice index from value (0-100) using same formula as engines.js
                    const sliceIndex = Math.min(sliceCount - 1, Math.floor((value / 100) * sliceCount));
                    return `${sliceIndex + 1}/${sliceCount}`;
                }
                return Math.round(value).toString();
            };
        }

        // Special formatValue for SAMPLE knob
        if (container.classList.contains('sample-knob')) {
            formatValue = (value) => {
                const sampleCount = window.sampleBankManager?.getSampleCount?.() || 0;
                if (sampleCount > 0) {
                    // Calculate sample index from value (0-127 MIDI note range)
                    // Map to 0-(sampleCount-1)
                    const sampleIndex = Math.min(sampleCount - 1, Math.floor((value / 127) * sampleCount));
                    return `${sampleIndex + 1}/${sampleCount}`;
                }
                return Math.round(value).toString();
            };
        }

        const options = {
            mode: mode,
            min: min,
            max: max,
            value: currentValue,
            step: paramDef.step ?? null,
            paramId: paramId,
            formatValue: formatValue,
            voiceParam: paramDef.voiceParam ?? false,
            onChange: (value, knob) => {
                handleKnobChange(paramId, value, knob);
            },
            onControlAllChange: (value, knob) => {
                handleControlAllChange(paramId, value, knob);
            }
        };

        // Handle discrete options
        if (paramDef.discreteOptions) {
            options.discreteOptions = paramDef.discreteOptions;
        }

        // Create the knob instance
        const knob = new LEDRingKnob(container, options);

        // Store in registry
        ledRingKnobRegistry.set(paramId, knob);
    });

    console.log(`[Bæng] Setup ${ledRingKnobRegistry.size} LED Ring Knobs`);
}

/**
 * Get the current value for a parameter from state
 */
function getValueFromState(paramId, paramDef) {
    const { statePath, voiceParam, voiceIndex } = paramDef;

    if (voiceParam) {
        // Per-voice parameter - statePath is like "voices[selectedVoice].level"
        // Extract the property name after the last dot
        const vi = voiceIndex ?? state.selectedVoice;
        const voice = state.voices[vi];

        // Handle paths like "voices[selectedVoice].level" or "sequences[selectedVoice].euclidean.steps"
        if (statePath.includes('sequences[selectedVoice].euclidean.')) {
            // Euclidean params like "sequences[selectedVoice].euclidean.steps"
            const propName = statePath.split('.').pop();
            const seq = state.sequences[vi];
            return seq?.euclidean?.[propName] ?? paramDef.default ?? 50;
        } else if (statePath.includes('sequences[selectedVoice].')) {
            // Sequence params like "sequences[selectedVoice].probability"
            const propName = statePath.split('.').pop();
            const seq = state.sequences[vi];
            return seq?.[propName] ?? paramDef.default ?? 50;
        } else {
            // Voice params like "voices[selectedVoice].level"
            const propName = statePath.split('.').pop();
            return voice?.[propName] ?? paramDef.default ?? 50;
        }
    }

    if (statePath.includes('.')) {
        // Nested path like 'drumBus.driveAmount'
        const parts = statePath.split('.');
        let value = state;
        for (const part of parts) {
            value = value?.[part];
        }
        return value ?? paramDef.default ?? 50;
    }

    return state[statePath] ?? paramDef.default ?? 50;
}

/**
 * Handle knob value change
 */
function handleKnobChange(paramId, value, knob) {
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) return;

    // Check if we're in PPMod edit mode for this parameter
    const editMode = state.modEditMode;
    if (editMode && editMode.activeParamId === paramId && editMode.currentPage > 0) {
        // In PPMod edit mode - convert value to percentage and dispatch event
        // This avoids circular dependency with perParamModUI.js
        const percentage = (value - paramDef.min) / (paramDef.max - paramDef.min);
        document.dispatchEvent(new CustomEvent('baengPPModDrag', {
            detail: { paramId, percentage }
        }));
        return; // Don't update normal parameter
    }

    // Check if this parameter has active modulation (depth > 0 with baseValue set)
    // If so, update baseValue instead of raw state to shift the modulation centre point
    const modConfig = state.perParamModulations?.[paramId];
    if (modConfig) {
        let hasActiveModulation = false;

        if (modConfig.isVoiceParam) {
            // Voice parameter: check if THIS voice has active modulation
            const voiceConfig = modConfig.voices?.[state.selectedVoice];
            hasActiveModulation = voiceConfig &&
                                 voiceConfig.enabled &&
                                 voiceConfig.depth > 0 &&
                                 voiceConfig.baseValue !== null;

            if (hasActiveModulation) {
                // Update baseValue to shift modulation centre point
                voiceConfig.baseValue = value;

                // Update value display to show base value being set
                updateValueDisplay(knob, value, paramDef);

                // Dispatch event for any listeners
                document.dispatchEvent(new CustomEvent('baengParameterChange', {
                    detail: { paramId, value, isBaseValueUpdate: true }
                }));
                return; // Don't update raw state - modulation will apply offset from new baseValue
            }
        } else {
            // Effect parameter: check global modulation state
            hasActiveModulation = modConfig.enabled &&
                                 modConfig.depth > 0 &&
                                 modConfig.baseValue !== null;

            if (hasActiveModulation) {
                // Update baseValue to shift modulation centre point
                modConfig.baseValue = value;

                // Update value display to show base value being set
                updateValueDisplay(knob, value, paramDef);

                // Dispatch event for any listeners
                document.dispatchEvent(new CustomEvent('baengParameterChange', {
                    detail: { paramId, value, isBaseValueUpdate: true }
                }));
                return; // Don't update raw state - modulation will apply offset from new baseValue
            }
        }
    }

    // Normal mode (no active modulation) - update state directly
    updateState(paramId, value, paramDef);

    // Update value display
    updateValueDisplay(knob, value, paramDef);

    // Dispatch event for audio/visual updates
    document.dispatchEvent(new CustomEvent('baengParameterChange', {
        detail: { paramId, value }
    }));

    // Capture snapshot after knob change (debounced)
    if (historyManager) {
        historyManager.pushSnapshot(true);
    }
}

/**
 * Handle Control All knob value change (applies to all 6 voices)
 */
function handleControlAllChange(paramId, value, knob) {
    // Check if this parameter is excluded from Control All
    if (!shouldAllowControlAll(paramId)) {
        // Excluded - fall back to single voice
        handleKnobChange(paramId, value, knob);
        return;
    }

    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) return;

    // Apply to all 6 voices
    applyParameterToAllVoices(paramId, value);

    // Update value display
    updateValueDisplay(knob, value, paramDef);

    // Dispatch event for audio/visual updates
    document.dispatchEvent(new CustomEvent('baengParameterChange', {
        detail: { paramId, value, controlAll: true }
    }));

    // Capture snapshot after knob change (debounced)
    if (historyManager) {
        historyManager.pushSnapshot(true);
    }
}

/**
 * Update state from knob value
 */
function updateState(paramId, value, paramDef) {
    const { statePath, voiceParam, voiceIndex } = paramDef;

    if (voiceParam) {
        // Per-voice parameter - statePath is like "voices[selectedVoice].level"
        const vi = voiceIndex ?? state.selectedVoice;

        // Handle paths like "voices[selectedVoice].level" or "sequences[selectedVoice].euclidean.steps"
        if (statePath.includes('sequences[selectedVoice].euclidean.')) {
            // Euclidean params like "sequences[selectedVoice].euclidean.steps"
            const propName = statePath.split('.').pop();
            if (state.sequences[vi]?.euclidean) {
                state.sequences[vi].euclidean[propName] = value;
            }
        } else if (statePath.includes('sequences[selectedVoice].')) {
            // Sequence params like "sequences[selectedVoice].probability"
            const propName = statePath.split('.').pop();
            if (state.sequences[vi]) {
                state.sequences[vi][propName] = value;
            }
        } else {
            // Voice params like "voices[selectedVoice].level"
            const propName = statePath.split('.').pop();
            if (state.voices[vi]) {
                state.voices[vi][propName] = value;
            }
        }
        return;
    }

    if (statePath.includes('.')) {
        // Nested path like 'drumBus.driveAmount'
        const parts = statePath.split('.');
        let obj = state;
        for (let i = 0; i < parts.length - 1; i++) {
            obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = value;
        return;
    }

    state[statePath] = value;
}

/**
 * Update value display
 */
function updateValueDisplay(knob, value, paramDef) {
    if (paramDef.formatValue) {
        knob.setDisplayText(paramDef.formatValue(value));
        return;
    }

    // Special handling for SLICE knob - show slice index
    if (knob.container?.classList.contains('slice-knob')) {
        const voice = state.voices[state.selectedVoice];
        if (voice?.sliceConfig?.slices) {
            const sliceCount = voice.sliceConfig.slices.length;
            // Convert 0-100 value to slice index
            const sliceIndex = Math.round((value / 100) * (sliceCount - 1));
            knob.setDisplayText(`${sliceIndex + 1}/${sliceCount}`);
        }
        return;
    }

    // Special handling for SAMPLE knob - show sample index
    if (knob.container?.classList.contains('sample-knob')) {
        const voice = state.voices[state.selectedVoice];
        if (voice) {
            // Import sampleBankManager if needed - it's a global
            const sampleCount = window.sampleBankManager?.getSampleCount?.() || 0;
            if (sampleCount > 0) {
                const sampleIndex = voice.sampleIndex ?? 0;
                knob.setDisplayText(`${sampleIndex + 1}/${sampleCount}`);
            }
        }
        return;
    }
}

/**
 * Sync a specific knob from state (e.g., after patch load)
 */
export function syncLEDRingKnobFromState(paramId) {
    const knob = ledRingKnobRegistry.get(paramId);
    if (!knob) return;

    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) return;

    const value = getValueFromState(paramId, paramDef);
    knob.setValueWithoutCallback(value);
}

/**
 * Sync all knobs from state
 */
export function syncAllLEDRingKnobs() {
    ledRingKnobRegistry.forEach((knob, paramId) => {
        syncLEDRingKnobFromState(paramId);
    });
}

/**
 * Get a knob by parameter ID
 */
export function getLEDRingKnob(paramId) {
    return ledRingKnobRegistry.get(paramId);
}

/**
 * Update a knob's min/max range
 * @param {string} paramId - The parameter ID
 * @param {number} min - New minimum value
 * @param {number} max - New maximum value
 */
export function updateLEDRingKnobRange(paramId, min, max) {
    const knob = ledRingKnobRegistry.get(paramId);
    if (knob) {
        knob.updateRange(min, max);
    }
}

/**
 * Update cascading ranges for euclidean parameters (fills, shift, accent, flam, ratchet)
 * Called when steps, fills, accent, flam, or ratchet changes
 * Enforces: fills ≤ steps, shift < steps, accent+flam+ratchet ≤ fills
 */
export function updateEuclideanCascadingRanges() {
    const voiceIndex = state.selectedVoice;
    if (voiceIndex === null || voiceIndex < 0 || voiceIndex >= state.sequences.length) {
        return;
    }

    const sequence = state.sequences[voiceIndex];
    const eucParams = sequence.euclidean || {};

    const steps = eucParams.steps || 16;
    const fills = eucParams.fills || 0;
    const accentAmt = eucParams.accentAmt || 0;
    const flamAmt = eucParams.flamAmt || 0;
    const ratchetAmt = eucParams.ratchetAmt || 0;

    // Update FILLS range (0 to steps)
    const fillsMax = Math.max(1, Math.min(steps, 16));
    updateLEDRingKnobRange('euclidean.fills', 0, fillsMax);

    // Clamp fills if it exceeds new max
    if (fills > fillsMax) {
        eucParams.fills = fillsMax;
        syncLEDRingKnobFromState('euclidean.fills');
    }

    // Update SHIFT range (0 to steps - 1)
    const shiftMax = Math.max(0, steps - 1);
    updateLEDRingKnobRange('euclidean.shift', 0, shiftMax);

    // Clamp shift if it exceeds new max
    const shift = eucParams.shift || 0;
    if (shift > shiftMax) {
        eucParams.shift = shiftMax;
        syncLEDRingKnobFromState('euclidean.shift');
    }

    // Current fills for accent/flam/ratchet constraints
    const currentFills = eucParams.fills || 0;

    // ACCENT max = fills - flam - ratchet
    const accentMax = Math.max(0, currentFills - flamAmt - ratchetAmt);
    updateLEDRingKnobRange('euclidean.accentAmt', 0, accentMax);

    // Clamp accent if it exceeds new max
    if (accentAmt > accentMax) {
        eucParams.accentAmt = accentMax;
        syncLEDRingKnobFromState('euclidean.accentAmt');
    }

    // FLAM max = fills - accent - ratchet (recalculate with potentially clamped accent)
    const currentAccent = eucParams.accentAmt || 0;
    const flamMax = Math.max(0, currentFills - currentAccent - ratchetAmt);
    updateLEDRingKnobRange('euclidean.flamAmt', 0, flamMax);

    // Clamp flam if it exceeds new max
    if (flamAmt > flamMax) {
        eucParams.flamAmt = flamMax;
        syncLEDRingKnobFromState('euclidean.flamAmt');
    }

    // RATCHET max = fills - accent - flam (recalculate with potentially clamped values)
    const currentFlam = eucParams.flamAmt || 0;
    const ratchetMax = Math.max(0, currentFills - currentAccent - currentFlam);
    updateLEDRingKnobRange('euclidean.ratchetAmt', 0, ratchetMax);

    // Clamp ratchet if it exceeds new max
    if (ratchetAmt > ratchetMax) {
        eucParams.ratchetAmt = ratchetMax;
        syncLEDRingKnobFromState('euclidean.ratchetAmt');
    }
}
