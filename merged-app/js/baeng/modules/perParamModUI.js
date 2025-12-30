// File: perParamModUI.js
// UI controls for per-parameter modulation system

import { state, parameterDefinitions, getParameterValue, setParameterValue, setParameterValueForVoice } from '../state.js';
import { getModulationConfig, updateModulationParameter, toggleModulationMute, clearPhaseAccumulators } from './perParamMod.js';
import { ENGINE_MACROS } from './engines.js';
import { ledRingKnobRegistry, syncLEDRingKnobFromState } from '../ui/ledRingKnobs.js';
import { openPPModModal } from '../../shared/ppmod-modal.js';

// Timeout duration for auto-return to normal mode (10 seconds)
const INACTIVITY_TIMEOUT = 10000;

// Waveform names for display
const WAVEFORM_NAMES = ['SIN', 'TRI', 'SQR', 'SAW', 'NOISE', 'S&H'];

// Trigger source names for display (effects only)
const TRIGGER_SOURCES = ['NONE', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'SUM'];

// Reset mode names for display (voice params only)
const RESET_MODES = ['OFF', 'STEP', 'ACCENT', 'BAR'];

/**
 * Setup modulation click handlers for all modulatable parameters
 */
export function setupModulationClickHandlers() {

    // Find all fader and knob labels (including LED Ring Knobs and old-style knobs)
    // Exclude engine header button explicitly
    const allLabels = document.querySelectorAll('.baeng-app .fader-label, .baeng-app .knob-label');

    let modulatableCount = 0;

    allLabels.forEach(labelElement => {
        // Skip engine header button and module headers
        if (labelElement.classList.contains('engine-header-button')) return;
        if (labelElement.classList.contains('module-header')) return;
        if (labelElement.closest('.module-header')) return;

        const container = labelElement.closest('.fader-container, .knob-container');
        if (!container) return;

        const moduleElement = labelElement.closest('.module');
        if (!moduleElement) return;

        const moduleId = moduleElement.id;

        // Try to get label text from the knob/fader control's data-label attribute first,
        // otherwise fall back to the label element's text content
        const controlElement = container.querySelector('.led-ring-knob, .knob, .fader-fill');
        const labelText = controlElement?.getAttribute('data-label') ||
                         labelElement.getAttribute('data-label') ||
                         labelElement.textContent.trim();
        const paramId = findParameterId(moduleId, labelText);

        if (!paramId) return;

        const paramDef = parameterDefinitions[paramId];
        if (!paramDef || !paramDef.modulatable) return;

        modulatableCount++;

        // Make label clickable
        labelElement.classList.add('modulatable');
        labelElement.title = 'Click to edit modulation';

        // Skip if handler already attached (prevent duplicate handlers)
        if (labelElement.hasAttribute('data-mod-handler-attached')) {
            return;
        }
        labelElement.setAttribute('data-mod-handler-attached', 'true');

        // Add click handler
        labelElement.addEventListener('click', (e) => {
            e.stopPropagation();

            // Check for command/ctrl key (reset modulation for selected voice)
            if (e.metaKey || e.ctrlKey) {
                handleModulationReset(paramId, labelElement);
                return;
            }

            // Check for shift key (mute toggle)
            if (e.shiftKey) {
                handleMuteToggle(paramId, labelElement);
                return;
            }

            // Open PPMod modal instead of cycling modes
            const modConfig = getModulationConfig(paramId);
            const isVoiceParam = modConfig.isVoiceParam;
            const voiceIndex = state.selectedVoice;

            // Get the config for this specific voice (or global config for effects)
            const activeConfig = isVoiceParam
                ? modConfig.voices[voiceIndex]
                : modConfig;

            openPPModModal(paramId, 'baeng', activeConfig, paramDef, voiceIndex, isVoiceParam);
        });
    });

    // Add global click handler to exit edit mode when clicking outside modulatable parameters
    document.addEventListener('click', (e) => {
        const editMode = state.modEditMode;

        // If not in edit mode, nothing to do
        if (!editMode.activeParamId || editMode.currentPage === 0) return;

        // Check if the click was on a modulatable label
        const clickedElement = e.target;
        const clickedLabel = clickedElement.closest('.fader-label.modulatable, .knob-label.modulatable');

        // Check if the click was on a knob or fader control element (dragging to adjust modulation value)
        const clickedControl = clickedElement.closest('.led-ring-knob, .knob, .fader-fill, .knob-container, .fader-container');

        // If clicked on a modulatable label, let its handler deal with it (it has stopPropagation)
        // Since stopPropagation was called, we won't reach here for modulatable label clicks
        // Also don't exit if clicking on control elements (knobs/faders) - user is adjusting values
        // So if we're here, user clicked outside - exit edit mode
        if (!clickedLabel && !clickedControl) {
            returnToNormalMode(editMode.activeParamId);
        }
    });

    // Listen for PPMod drag events from LED Ring Knobs
    // This avoids circular dependency between ledRingKnobs.js and this module
    document.addEventListener('baengPPModDrag', (e) => {
        const { paramId, percentage } = e.detail;
        updateModulationValueFromDrag(paramId, percentage);
    });

}

/**
 * Find parameter ID from module and label
 * For ENGINE module, checks ENGINE_MACROS FIRST to handle engine-specific labels
 */
function findParameterId(moduleId, labelText) {
    // For ENGINE module, check engine-specific label mappings FIRST
    if (moduleId === 'baeng-engine') {
        const voice = state.voices[state.selectedVoice];
        if (voice && voice.engine) {
            const engineType = voice.engine;
            const engineMacros = ENGINE_MACROS ? ENGINE_MACROS[engineType] : null;

            if (engineMacros) {
                // Special case for DX7 PATCH - use dx7PatchIndex instead of macroPatch
                if (engineType === 'DX7' && labelText === 'PATCH') {
                    return 'voice.dx7PatchIndex';
                }

                // Check PATCH, DEPTH, RATE (for 3-knob engines)
                if (engineMacros.PATCH && engineMacros.PATCH.label === labelText) {
                    return 'voice.macroPatch';
                }
                if (engineMacros.DEPTH && engineMacros.DEPTH.label === labelText) {
                    return 'voice.macroDepth';
                }
                if (engineMacros.RATE && engineMacros.RATE.label === labelText) {
                    return 'voice.macroRate';
                }

                // Also handle PITCH and LEVEL (always the same)
                if (labelText === 'PITCH') {
                    return 'voice.macroPitch';
                }
                if (labelText === 'LEVEL') {
                    return 'voice.level';
                }
            }
        }
    }

    // Then try direct parameter label match
    for (const [paramId, def] of Object.entries(parameterDefinitions)) {
        if (def.module === moduleId && def.label === labelText) {
            return paramId;
        }
    }
    return null;
}

/**
 * Handle modulation reset (Command/Ctrl+Click)
 * Clears modulation for the currently selected voice
 */
function handleModulationReset(paramId, labelElement) {
    const modConfig = getModulationConfig(paramId);
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) return;

    if (modConfig.isVoiceParam) {
        // Voice parameter: clear THIS voice's config
        const voiceConfig = modConfig.voices[state.selectedVoice];
        if (voiceConfig && voiceConfig.baseValue !== null) {
            // Restore to base value before clearing
            setParameterValueForVoice(paramId, voiceConfig.baseValue, state.selectedVoice);

            // Clear this voice's modulation
            voiceConfig.baseValue = null;
            voiceConfig.enabled = false;
            voiceConfig.depth = 0;

            // Clear phase accumulator for this voice
            clearPhaseAccumulators(paramId, state.selectedVoice);

            // Remove visual indicators
            labelElement.classList.remove('mod-active');
            const container = labelElement.closest('.knob-container, .fader-container');
            if (container) {
                const ledRingKnob = container.querySelector('.led-ring-knob');
                if (ledRingKnob) {
                    ledRingKnob.classList.remove('modulated');
                    // Clear modulation on the knob instance
                    const knobInstance = ledRingKnobRegistry.get(paramId);
                    if (knobInstance) {
                        knobInstance.clearModulation();
                    }
                } else {
                    const controlElement = container.querySelector('.knob, .fader-fill');
                    if (controlElement) {
                        controlElement.classList.remove('modulated');
                    }
                }
            }

        }
    } else {
        // Effect parameter: disable modulation entirely
        if (modConfig.baseValue !== null) {
            setParameterValue(paramId, modConfig.baseValue);
        }
        modConfig.enabled = false;
        modConfig.depth = 0;
        modConfig.baseValue = null;

        // Clear phase accumulators
        clearPhaseAccumulators(paramId);

        // Remove visual indicators
        labelElement.classList.remove('mod-active');
        const container = labelElement.closest('.knob-container, .fader-container');
        if (container) {
            const ledRingKnob = container.querySelector('.led-ring-knob');
            if (ledRingKnob) {
                ledRingKnob.classList.remove('modulated');
                // Clear modulation on the knob instance
                const knobInstance = ledRingKnobRegistry.get(paramId);
                if (knobInstance) {
                    knobInstance.clearModulation();
                }
            } else {
                const controlElement = container.querySelector('.knob, .fader-fill');
                if (controlElement) {
                    controlElement.classList.remove('modulated');
                }
            }
        }

    }

    // Capture snapshot after clearing modulation (immediate, not debounced)
    if (typeof window.historyManager !== 'undefined' && window.historyManager) {
        window.historyManager.pushSnapshot(false); // false = immediate
    }
}

/**
 * Handle mute toggle (Shift+Click)
 */
function handleMuteToggle(paramId, labelElement) {
    const isMuted = toggleModulationMute(paramId);

    if (isMuted) {
        labelElement.classList.add('mod-muted');
    } else {
        labelElement.classList.remove('mod-muted');
    }
}

/**
 * Cycle through modulation edit modes
 */
function cycleModulationMode(paramId, labelElement, container) {

    // Safety check: never modulate engine header button
    if (labelElement.classList.contains('engine-header-button') ||
        labelElement.closest('.module-header')) {
        console.warn('⚠️ Blocked modulation cycle for engine header button');
        return;
    }

    const paramDef = parameterDefinitions[paramId];
    const modConfig = getModulationConfig(paramId); // Shared config for all voices (like ræmbL)
    const editMode = state.modEditMode;


    // If editing a different parameter, restore the previous one first
    if (editMode.activeParamId && editMode.activeParamId !== paramId) {
        returnToNormalMode(editMode.activeParamId);
    }

    // If this is the first click on this parameter, start at mode 1
    if (editMode.activeParamId !== paramId) {
        // Capture snapshot BEFORE entering edit mode so we can undo back to this state
        if (typeof window.historyManager !== 'undefined' && window.historyManager) {
            window.historyManager.pushSnapshot(false); // Immediate, not debounced
        }

        editMode.activeParamId = paramId; // Store raw paramId (like ræmbL)
        editMode.currentPage = 1;

        // Store UI element references (like ræmbL approach)
        editMode.activeLabelElement = labelElement;
        editMode.activeContainer = container;
        editMode.activeValueDisplay = container.querySelector('.knob-value, .fader-value');

        // CRITICAL FIX: Store the original label text to restore later
        // This is needed because RVB/DLY params have different display text than paramDef.label
        // E.g., label shows "PRED" but paramDef.label is "RVB PRED"
        editMode.originalLabelText = labelElement.textContent.trim();

        // Store control element reference for later use - check for LED Ring Knob first
        const ledRingKnob = container.querySelector('.led-ring-knob');
        if (ledRingKnob) {
            editMode.activeControlElement = ledRingKnob;
            editMode.isLEDRingKnob = true;
        } else {
            const controlElement = container.querySelector('.knob, .fader-fill');
            if (controlElement) {
                editMode.activeControlElement = controlElement;
            }
            editMode.isLEDRingKnob = false;
        }

        // CRITICAL FIX: Do NOT store baseValue here when entering edit mode!
        // BaseValue should only be stored when user actually sets depth > 0
        // This prevents voices from being marked as "modulated" just by clicking the label
        // The baseValue will be captured in updateModulationParameter() when depth is set
    } else {
        // Cycle to next mode
        // Both voice params and effect params have 5 pages: WAVE, RATE, OFFSET, DEPTH, (RESET or TRIG)
        const maxPage = 5;
        const oldPage = editMode.currentPage;
        editMode.currentPage = (editMode.currentPage + 1) % (maxPage + 1);

        // If back to mode 0, return to normal
        if (editMode.currentPage === 0) {
            returnToNormalMode(paramId);
            return;
        }
    }

    // Update UI for current mode
    updateModulationModeUI(paramId, labelElement, container);

    // Reset inactivity timer
    resetInactivityTimer(paramId);
}

/**
 * Update UI to show current modulation mode
 */
function updateModulationModeUI(paramId, labelElement, container) {
    const editMode = state.modEditMode;
    const modConfig = getModulationConfig(paramId);
    const paramDef = parameterDefinitions[paramId];

    // Get control element (LED Ring Knob, old-style knob, or fader fill)
    const ledRingKnob = container.querySelector('.led-ring-knob');
    const controlElement = ledRingKnob || container.querySelector('.knob, .fader-fill');
    const valueDisplay = container.querySelector('.knob-value, .fader-value');
    if (!controlElement || !valueDisplay) {
        console.warn(`[updateModulationModeUI] Missing elements - controlElement=${!!controlElement}, valueDisplay=${!!valueDisplay}`);
        return;
    }

    // Check if this is a LED Ring Knob
    const isLEDRingKnob = !!ledRingKnob;

    // CRITICAL FIX: Do NOT auto-store baseValue here!
    // BaseValue should ONLY be stored when user sets depth > 0
    // This safety check was causing contamination by storing baseValues prematurely

    // Change label appearance to indicate edit mode (inverted colors)
    // Debug: prevent mod-editing from being added to engine header
    if (labelElement.classList.contains('engine-header-button') ||
        labelElement.closest('.module-header')) {
        console.warn('⚠️ Attempted to add mod-editing to engine header button, skipping');
        return;
    }
    labelElement.classList.add('mod-editing');

    // Get the correct config based on param type
    const config = modConfig.isVoiceParam
        ? modConfig.voices[state.selectedVoice]
        : modConfig;

    // Calculate base value percentage for LED ring edit mode display
    // Base value is the centre point for modulation
    const getBaseValuePercent = () => {
        const baseValue = config.baseValue;
        if (baseValue === null || baseValue === undefined) {
            // No base value set yet - use current param value as reference
            const currentValue = getParameterValue(paramId);
            const knobInstance = ledRingKnobRegistry.get(paramId);
            if (knobInstance) {
                const knobMin = knobInstance.options.min;
                const knobMax = knobInstance.options.max;
                return (currentValue - knobMin) / (knobMax - knobMin);
            }
            return 0.5; // Default to centre if unknown
        }
        // BaseValue is stored in original param range, convert to 0-1
        const knobInstance = ledRingKnobRegistry.get(paramId);
        if (knobInstance) {
            const knobMin = knobInstance.options.min;
            const knobMax = knobInstance.options.max;
            return (baseValue - knobMin) / (knobMax - knobMin);
        }
        return 0.5;
    };

    // Helper to update control visual (supports both LED Ring Knobs and old-style knobs)
    const updateControlVisual = (percent) => {
        if (isLEDRingKnob) {
            // For LED Ring Knobs, use edit mode rendering (single LED for edit value)
            const knobInstance = ledRingKnobRegistry.get(paramId);
            if (knobInstance) {
                // Use setEditMode for visual feedback showing single LED at edit value
                const basePercent = getBaseValuePercent();
                knobInstance.setEditMode(percent, basePercent);
            }
        } else {
            // Old-style CSS rotation for legacy knobs
            const rotation = -135 + (percent * 270);
            controlElement.style.setProperty('--knob-rotation', `${rotation}deg`);
        }
    };

    // Update label text and value display based on mode
    // Order: WAVE → RATE → DEPTH → OFFSET → RESET/TRIG
    switch (editMode.currentPage) {
        case 1: // Waveform
            labelElement.textContent = 'WAVE';
            valueDisplay.textContent = WAVEFORM_NAMES[config.waveform] || 'SIN';
            // Update knob visual (waveform 0-5)
            updateControlVisual(config.waveform / 5);
            break;

        case 2: // Rate
            labelElement.textContent = 'RATE';
            const rateHz = config.rate.toFixed(2);
            valueDisplay.textContent = rateHz < 1 ? `${rateHz}Hz` : `${config.rate.toFixed(1)}Hz`;
            // Update knob visual (rate 0.05-30 Hz, log scale)
            const minRate = 0.05;
            const maxRate = 30;
            const ratePercent = Math.log(config.rate / minRate) / Math.log(maxRate / minRate);
            updateControlVisual(ratePercent);
            break;

        case 3: // Depth (swapped with Offset)
            labelElement.textContent = 'DEPTH';
            valueDisplay.textContent = `${Math.round(config.depth)}%`;
            // Update knob visual (depth 0-100%)
            updateControlVisual(config.depth / 100);
            break;

        case 4: // Offset (swapped with Depth)
            labelElement.textContent = 'OFFSET';
            const offsetVal = Math.round(config.offset);
            valueDisplay.textContent = offsetVal >= 0 ? `+${offsetVal}%` : `${offsetVal}%`;
            // Update knob visual (offset -100 to +100%)
            updateControlVisual((config.offset + 100) / 200);
            break;

        case 5: // Trigger Source (effects) or Reset Mode (voice params)
            if (paramDef.effectParam) {
                // Effect parameter: show trigger source
                labelElement.textContent = 'TRIG';
                const sourceIndex = TRIGGER_SOURCES.indexOf(config.triggerSource.toUpperCase());
                valueDisplay.textContent = TRIGGER_SOURCES[Math.max(0, sourceIndex)];
                // Update knob visual (trigger source 0-7)
                updateControlVisual(Math.max(0, sourceIndex) / (TRIGGER_SOURCES.length - 1));
            } else {
                // Voice parameter: show reset mode
                labelElement.textContent = 'RESET';
                const resetIndex = RESET_MODES.indexOf(config.resetMode.toUpperCase());
                valueDisplay.textContent = RESET_MODES[Math.max(0, resetIndex)];
                // Update knob visual (reset mode 0-3)
                updateControlVisual(Math.max(0, resetIndex) / (RESET_MODES.length - 1));
            }
            break;
    }
}

/**
 * Return to normal mode (restore original label)
 * Uses stored UI element references (ræmbL approach)
 * @param {string} paramId - Raw parameter ID (like ræmbL)
 */
function returnToNormalMode(paramId) {
    if (!paramId) return;

    const editMode = state.modEditMode;
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) {
        // Always clear state even if paramDef not found
        clearEditModeState();
        return;
    }

    // Use stored UI element references
    const labelElement = editMode.activeLabelElement;
    const container = editMode.activeContainer;
    const controlElement = editMode.activeControlElement;
    const valueDisplay = editMode.activeValueDisplay;

    // Restore UI if references exist
    if (labelElement) {
        // Restore original label text from stored value (not paramDef.label)
        // This fixes RVB/DLY params where display text differs from paramDef.label
        // E.g., "PRED" vs "RVB PRED", "TIME" vs "DLY TIME"
        const originalText = editMode.originalLabelText || paramDef.label;
        labelElement.textContent = originalText;

        // Remove inline styles and edit mode class (CSS handles default styling)
        labelElement.style.color = '';
        labelElement.classList.remove('mod-editing');
    }

    // Restore baseValue back to the parameter (if modulation was active)
    const modConfig = getModulationConfig(paramId);
    if (modConfig && controlElement) {
        let baseValueToRestore = null;

        if (modConfig.isVoiceParam) {
            // Voice parameter: restore from per-voice config
            const voiceConfig = modConfig.voices[state.selectedVoice];
            if (voiceConfig && voiceConfig.baseValue !== null) {
                baseValueToRestore = voiceConfig.baseValue;
            }
        } else {
            // Effect parameter: restore from global baseValue
            if (modConfig.baseValue !== null) {
                baseValueToRestore = modConfig.baseValue;
            }
        }

        if (baseValueToRestore !== null) {
            // Restore the parameter to its base value
            // CRITICAL FIX: Use setParameterValueForVoice for voice parameters
            if (modConfig.isVoiceParam) {
                setParameterValueForVoice(paramId, baseValueToRestore, state.selectedVoice);
            } else {
                setParameterValue(paramId, baseValueToRestore);
            }

            // Restore knob/fader visuals to match baseValue
            const percentage = (baseValueToRestore - paramDef.min) / (paramDef.max - paramDef.min);

            if (editMode.isLEDRingKnob) {
                // Restore LED Ring Knob via registry
                const knobInstance = ledRingKnobRegistry.get(paramId);
                if (knobInstance) {
                    // Clear edit mode first (restores normal LED ring display)
                    knobInstance.clearEditMode();
                    knobInstance.setValueWithoutCallback(baseValueToRestore);
                }
            } else if (controlElement.classList.contains('knob')) {
                // Restore old-style knob rotation
                const rotation = -135 + (percentage * 270);
                controlElement.style.setProperty('--knob-rotation', `${rotation}deg`);
            } else {
                // Restore fader fill
                controlElement.style.height = `${percentage * 100}%`;
            }
        } else if (editMode.isLEDRingKnob) {
            // No base value to restore, but still need to clear edit mode
            const knobInstance = ledRingKnobRegistry.get(paramId);
            if (knobInstance) {
                knobInstance.clearEditMode();
            }
        }
    }

    // Restore value display
    if (valueDisplay) {
        const currentValue = getParameterValue(paramId);
        if (currentValue !== null) {
            valueDisplay.textContent = formatParameterValue(currentValue, paramDef);
        }
    }

    // Always clear edit mode state
    clearEditModeState();

    // Capture snapshot after exiting modulation edit mode (captures final configuration)
    if (typeof window.historyManager !== 'undefined' && window.historyManager) {
        window.historyManager.pushSnapshot(false); // Immediate, not debounced
    }

    // Timer already cleared in clearEditModeState
}

/**
 * Clear all edit mode state (helper function)
 */
function clearEditModeState() {
    const editMode = state.modEditMode;

    // Clear timer first
    if (editMode.inactivityTimer) {
        clearTimeout(editMode.inactivityTimer);
        editMode.inactivityTimer = null;
    }

    // Clear all state
    editMode.activeParamId = null;
    editMode.currentPage = 0;
    editMode.lastInteractionTime = null;

    // Clear UI element references
    editMode.activeLabelElement = null;
    editMode.activeContainer = null;
    editMode.activeControlElement = null;
    editMode.activeValueDisplay = null;
    editMode.originalLabelText = null;
    editMode.isLEDRingKnob = false;
}

/**
 * Reset inactivity timer
 */
function resetInactivityTimer(paramId) {
    const editMode = state.modEditMode;

    // Clear existing timer
    if (editMode.inactivityTimer) {
        clearTimeout(editMode.inactivityTimer);
    }

    // Set new timer
    editMode.inactivityTimer = setTimeout(() => {
        returnToNormalMode(paramId);
    }, INACTIVITY_TIMEOUT);

    editMode.lastInteractionTime = performance.now();
}

/**
 * Handle drag/update in modulation edit mode
 */
export function updateModulationValueFromDrag(paramId, percentage) {
    const editMode = state.modEditMode;
    if (editMode.activeParamId !== paramId || editMode.currentPage === 0) {
        return false; // Not in edit mode
    }

    const modConfig = getModulationConfig(paramId);
    const paramDef = parameterDefinitions[paramId];

    // Reset inactivity timer
    resetInactivityTimer(paramId);

    // Update the appropriate modulation parameter based on mode
    // Order: WAVE → RATE → DEPTH → OFFSET → RESET/TRIG
    switch (editMode.currentPage) {
        case 1: // Waveform (0-5, discrete)
            const waveform = Math.round(percentage * 5);
            updateModulationParameter(paramId, 'waveform', waveform);
            break;

        case 2: // Rate (0.05-30 Hz, log scale)
            const minRate = 0.05;
            const maxRate = 30;
            const rate = minRate * Math.pow(maxRate / minRate, percentage);
            updateModulationParameter(paramId, 'rate', rate);
            break;

        case 3: // Depth (0-100) - swapped with Offset
            const depth = percentage * 100;
            updateModulationParameter(paramId, 'depth', depth);
            break;

        case 4: // Offset (-100 to +100) - swapped with Depth
            const offset = -100 + (percentage * 200);
            updateModulationParameter(paramId, 'offset', offset);
            break;

        case 5: // Trigger Source (effects) or Reset Mode (voice params)
            if (paramDef.effectParam) {
                // Effect parameter: update trigger source
                const sourceIndex = Math.round(percentage * (TRIGGER_SOURCES.length - 1));
                const triggerSource = TRIGGER_SOURCES[sourceIndex].toLowerCase();
                updateModulationParameter(paramId, 'triggerSource', triggerSource);
            } else {
                // Voice parameter: update reset mode
                const resetIndex = Math.round(percentage * (RESET_MODES.length - 1));
                const resetMode = RESET_MODES[resetIndex].toLowerCase();
                updateModulationParameter(paramId, 'resetMode', resetMode);
            }
            break;
    }

    // Update UI to reflect new value - use stored element references if available
    // editMode already declared at top of function
    if (editMode.activeLabelElement && editMode.activeContainer) {
        // Use stored references for faster lookup
        updateModulationModeUI(paramId, editMode.activeLabelElement, editMode.activeContainer);
    } else {
        // Fallback: search for the element
        const allLabels = document.querySelectorAll('.baeng-app .fader-label, .knob-label');
        for (const labelElement of allLabels) {
            const container = labelElement.closest('.fader-container, .knob-container');
            if (!container) continue;

            const moduleElement = labelElement.closest('.module');
            if (!moduleElement) continue;

            const moduleId = moduleElement.id;
            const labelText = labelElement.getAttribute('data-label');
            const foundParamId = findParameterId(moduleId, labelText);

            if (foundParamId === paramId) {
                updateModulationModeUI(paramId, labelElement, container);
                break;
            }
        }
    }

    return true; // Handled in edit mode
}

/**
 * Format parameter value for display
 */
function formatParameterValue(value, paramDef) {
    if (value === null || value === undefined) return '—';

    // Handle special parameter types
    if (paramDef.label === 'PAN') {
        if (value === 50) return 'C';
        return value < 50 ? `L${Math.round(50 - value)}` : `R${Math.round(value - 50)}`;
    }

    if (paramDef.label === 'CHOKE') {
        return value === 0 ? 'OFF' : value.toString();
    }

    // Default formatting
    if (paramDef.step && paramDef.step >= 1) {
        return Math.round(value).toString();
    }

    return value.toFixed(1);
}
