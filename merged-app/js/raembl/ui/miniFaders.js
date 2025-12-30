/**
 * File: merged-app/js/raembl/ui/miniFaders.js
 * MiniFader setup and management for Ræmbl
 *
 * Replaces SlidePot with compact canvas-based MiniFader component
 */

import { MiniFader } from '../../shared/components/MiniFader.js';
import { state, parameterDefinitions } from '../state.js';
import { updateFaderState } from './faderState.js';
import { getOrCreateModConfig, isModulatable, isAudioRateParam, createFilterParamLFO, updateFilterParamLFO, removeFilterParamLFO } from '../modules/perParamMod.js';
import { openPPModModal } from '../../shared/ppmod-modal.js';

// Registry for external access (patch load, mod feedback, undo/redo)
export const miniFaderRegistry = new Map();

/**
 * Setup all MiniFaders in the Ræmbl app
 */
export function setupMiniFaders() {
    // Clear existing registry
    miniFaderRegistry.forEach(fader => fader.destroy?.());
    miniFaderRegistry.clear();

    const containers = document.querySelectorAll('.raembl-app .mini-fader');

    containers.forEach(container => {
        const parentContainer = container.closest('.mini-fader-container');
        const paramId = parentContainer?.dataset.paramId;
        if (!paramId) {
            console.warn('[MiniFader] Container missing data-param-id:', container);
            return;
        }

        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) {
            console.warn('[MiniFader] Unknown parameter:', paramId);
            return;
        }

        const labelEl = parentContainer.querySelector('.mini-fader-label');
        const label = labelEl?.dataset.paramLabel || labelEl?.textContent?.trim() || paramDef.label;

        // Get initial value from state
        const initialValue = state[paramDef.statePath] ?? paramDef.default ?? paramDef.min ?? 0;

        // Determine if stepped (for discrete params like waveform selectors)
        const step = paramDef.step ?? null;

        // Determine if bipolar (centre = zero)
        const bipolar = parentContainer.dataset.bipolar === 'true' || paramDef.bipolar === true;

        // Create MiniFader instance
        const fader = new MiniFader(container, {
            min: paramDef.min ?? 0,
            max: paramDef.max ?? 100,
            value: initialValue,
            step: step,
            bipolar: bipolar,
            paramId: paramId,
            formatValue: (value) => formatParamValue(paramDef, value),
            onChange: (value) => {
                handleMiniFaderChange(paramId, paramDef, label, value, parentContainer);
            }
        });

        // Store in registry
        miniFaderRegistry.set(paramId, fader);

        // Setup modulation click handler if parameter is modulatable
        if (isModulatable(paramId) && labelEl) {
            setupModulationClickHandler(parentContainer, paramId, paramDef, labelEl, fader);
        }
    });

    console.log(`[Ræmbl] Setup ${miniFaderRegistry.size} MiniFaders`);
}

/**
 * Handle MiniFader value change
 */
function handleMiniFaderChange(paramId, paramDef, label, value, container) {
    // Check if we're in modulation edit mode
    const isInModMode = state.modEditMode.activeParamId === paramId && state.modEditMode.currentPage > 0;

    if (isInModMode) {
        // Update modulation parameter instead of base parameter
        updateModulationParameter(paramId, state.modEditMode.currentPage, value, paramDef);

        // Reset inactivity timer on interaction
        const labelEl = container.querySelector('.mini-fader-label');
        if (labelEl) {
            resetInactivityTimer(paramId, labelEl);
        }
    } else {
        // Normal mode: update base parameter
        const parent = container.closest('.module');
        updateFaderState(label, value, parent);
    }
}

/**
 * Format parameter value for display
 */
function formatParamValue(paramDef, value) {
    const label = paramDef.label;

    switch (label) {
        case 'BPM':
            return Math.round(value).toString();
        case 'SWING':
        case 'HP':
        case 'LP':
        case 'RES':
        case 'KEY':
        case 'ENV':
        case 'MOD':
        case 'PROB':
        case 'ACCENT':
        case 'SLIDE':
        case 'TRILL':
        case 'GATE':
            return `${Math.round(value)}%`;
        case 'STEPS':
        case 'FILLS':
        case 'SHIFT':
        case 'LENGTH':
            return Math.round(value).toString();
        case 'ATK':
        case 'DEC':
        case 'SUS':
        case 'REL':
            if (value < 10) return value.toFixed(1);
            return Math.round(value).toString();
        case 'OCT':
            const octValue = Math.round(value) - 2;
            return octValue >= 0 ? `+${octValue}` : octValue.toString();
        default:
            const range = (paramDef.max ?? 100) - (paramDef.min ?? 0);
            if (range <= 1) return value.toFixed(2);
            if (range <= 10) return value.toFixed(1);
            return Math.round(value).toString();
    }
}

/**
 * Sync a single MiniFader from state (for patch load, undo/redo)
 */
export function syncMiniFaderFromState(paramId) {
    const fader = miniFaderRegistry.get(paramId);
    if (!fader) return;

    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) return;

    const value = state[paramDef.statePath];
    if (value !== undefined) {
        fader.setValueWithoutCallback(value);
    }
}

/**
 * Sync all MiniFaders from state
 */
export function syncAllMiniFaders() {
    for (const paramId of miniFaderRegistry.keys()) {
        syncMiniFaderFromState(paramId);
    }
}

/**
 * Update a MiniFader's range dynamically (e.g., FILLS based on STEPS)
 */
export function updateMiniFaderRange(paramId, min, max) {
    const fader = miniFaderRegistry.get(paramId);
    if (fader) {
        fader.updateRange(min, max);
    }
}

/**
 * Setup modulation click handler for a MiniFader label
 */
function setupModulationClickHandler(container, paramId, paramDef, labelEl, fader) {
    // Store original label text/HTML
    labelEl.dataset.originalLabel = labelEl.textContent?.trim() || paramDef.label;
    if (labelEl.classList.contains('waveform-icon')) {
        labelEl.dataset.originalHtml = labelEl.innerHTML;
    }

    // Mark as modulatable
    labelEl.classList.add('modulatable');
    labelEl.title = 'Click to edit modulation';

    // Add click event listener
    labelEl.addEventListener('click', (e) => {
        e.stopPropagation();

        if (e.shiftKey) {
            // Shift+Click: Toggle mute
            toggleModulationMute(paramId, labelEl);
        } else {
            // Normal click: Open PPMod modal
            const modConfig = state.perParamModulations[paramId] || null;
            openPPModModal(paramId, 'raembl', modConfig, paramDef);
        }
    });
}

/**
 * Cycle through modulation edit modes
 */
function cycleModulationMode(paramId, paramDef, labelEl, fader) {
    const editMode = state.modEditMode;

    // Different param? Start fresh at page 1
    if (editMode.activeParamId !== paramId) {
        // Restore previous parameter's UI to normal
        if (editMode.activeParamId && editMode.activeLabelEl) {
            restorePreviousParamUI(editMode);
        }

        // Clear timer for previous parameter
        if (editMode.inactivityTimer) {
            clearTimeout(editMode.inactivityTimer);
            editMode.inactivityTimer = null;
        }

        editMode.activeParamId = paramId;
        editMode.currentPage = 1;

        // Store UI element references
        editMode.activeLabelEl = labelEl;
        editMode.activeFader = fader;
    } else {
        // Same param, cycle forward (0-5 = 6 modes, then back to 0)
        editMode.currentPage = (editMode.currentPage + 1) % 6;
        if (editMode.currentPage === 0) {
            // Back to normal mode
            returnToNormalView(paramId, paramDef, labelEl, fader);
            return;
        }
    }

    updateModulationUI(paramId, paramDef, labelEl, fader);
    resetInactivityTimer(paramId, labelEl);
}

/**
 * Restore previous parameter's UI to normal
 */
function restorePreviousParamUI(editMode) {
    const prevParamId = editMode.activeParamId;
    const prevParamDef = parameterDefinitions[prevParamId];
    const prevLabelEl = editMode.activeLabelEl;
    const prevFader = editMode.activeFader;

    if (prevLabelEl) {
        // Restore label
        if (prevLabelEl.dataset.originalHtml) {
            prevLabelEl.innerHTML = prevLabelEl.dataset.originalHtml;
        } else {
            prevLabelEl.textContent = prevLabelEl.dataset.originalLabel || prevParamDef?.label;
        }
        prevLabelEl.classList.remove('mod-editing');
    }

    // Restore fader to show base value
    if (prevFader && prevParamDef) {
        const modConfig = getOrCreateModConfig(prevParamId);
        const baseValue = modConfig.baseValue ?? state[prevParamDef.statePath];
        prevFader.updateRange(prevParamDef.min ?? 0, prevParamDef.max ?? 100);
        prevFader.setValueWithoutCallback(baseValue);
        prevFader.clearModulation();
    }
}

/**
 * Update UI for current modulation edit page
 */
function updateModulationUI(paramId, paramDef, labelEl, fader) {
    const page = state.modEditMode.currentPage;
    const modConfig = getOrCreateModConfig(paramId);

    const modeNames = ['', 'WAVE', 'RATE', 'OFFSET', 'DEPTH', 'RESET'];

    // Update label to show mode name
    if (page > 0 && page < modeNames.length) {
        labelEl.textContent = modeNames[page];
        labelEl.classList.add('mod-editing');
    }

    // Update fader for modulation mode
    updateFaderForModulationMode(paramId, page, fader, modConfig, paramDef);
}

/**
 * Update fader position for modulation mode
 */
function updateFaderForModulationMode(paramId, page, fader, modConfig, paramDef) {
    let displayValue;

    switch (page) {
        case 1: // Waveform (0-5)
            const waveNames = ['SIN', 'TRI', 'SQR', 'SAW', 'NOISE', 'S&H'];
            fader.updateRange(0, 5);
            fader.setValueWithoutCallback(modConfig.waveform);
            fader.setDisplayText(waveNames[modConfig.waveform]);
            break;

        case 2: // Rate (0.05-30 Hz, mapped 0-100)
            fader.updateRange(0, 100);
            const minRate = 0.05, maxRate = 30;
            const ratePercent = Math.log(modConfig.rate / minRate) / Math.log(maxRate / minRate) * 100;
            fader.setValueWithoutCallback(ratePercent);
            displayValue = modConfig.rate < 1 ? `${modConfig.rate.toFixed(2)}Hz` : `${modConfig.rate.toFixed(1)}Hz`;
            fader.setDisplayText(displayValue);
            break;

        case 3: // Offset (-100 to +100, mapped 0-100)
            fader.updateRange(0, 100);
            fader.setValueWithoutCallback((modConfig.offset + 100) / 2);
            displayValue = modConfig.offset >= 0 ? `+${Math.round(modConfig.offset)}%` : `${Math.round(modConfig.offset)}%`;
            fader.setDisplayText(displayValue);
            break;

        case 4: // Depth (0-100)
            fader.updateRange(0, 100);
            fader.setValueWithoutCallback(modConfig.depth);
            fader.setDisplayText(`${Math.round(modConfig.depth)}%`);
            break;

        case 5: // Reset (0-3)
            const resetModes = ['OFF', 'STEP', 'ACCENT', 'BAR'];
            const resetIndex = ['off', 'step', 'accent', 'bar'].indexOf(modConfig.resetMode);
            fader.updateRange(0, 3);
            fader.setValueWithoutCallback(resetIndex >= 0 ? resetIndex : 0);
            fader.setDisplayText(resetModes[resetIndex >= 0 ? resetIndex : 0]);
            break;
    }
}

/**
 * Update modulation parameter from fader change
 */
async function updateModulationParameter(paramId, page, value, paramDef) {
    const modConfig = getOrCreateModConfig(paramId);
    let displayValue;

    switch (page) {
        case 1: // Waveform
            const waveIndex = Math.round(value);
            modConfig.waveform = waveIndex;
            const waveNames = ['SIN', 'TRI', 'SQR', 'SAW', 'NOISE', 'S&H'];
            displayValue = waveNames[waveIndex];
            break;

        case 2: // Rate (log scale)
            const minRate = 0.05, maxRate = 30;
            const percentage = value / 100;
            const rate = minRate * Math.pow(maxRate / minRate, percentage);
            modConfig.rate = rate;
            displayValue = rate < 1 ? `${rate.toFixed(2)}Hz` : `${rate.toFixed(1)}Hz`;
            break;

        case 3: // Offset
            const offset = (value * 2) - 100;
            modConfig.offset = offset;
            displayValue = offset >= 0 ? `+${Math.round(offset)}%` : `${Math.round(offset)}%`;
            break;

        case 4: // Depth
            modConfig.depth = value;
            const wasEnabled = modConfig.enabled;
            modConfig.enabled = (value > 0);

            // Store base value when first enabling
            if (modConfig.enabled && !wasEnabled) {
                modConfig.baseValue = state[paramDef.statePath];
            }
            if (!modConfig.enabled && wasEnabled) {
                modConfig.baseValue = null;
            }
            displayValue = `${Math.round(value)}%`;
            break;

        case 5: // Reset mode
            const resetModes = ['off', 'step', 'accent', 'bar'];
            const resetIndex = Math.round(value);
            modConfig.resetMode = resetModes[resetIndex];
            displayValue = resetModes[resetIndex].toUpperCase();
            break;

        default:
            return;
    }

    // Update display text
    const fader = miniFaderRegistry.get(paramId);
    if (fader) {
        fader.setDisplayText(displayValue);
    }

    // Handle audio-rate filter modulation
    if (isAudioRateParam(paramId)) {
        const { config } = await import('../config.js');
        if (modConfig.enabled && modConfig.depth > 0) {
            if (config.voices) {
                config.voices.forEach(voice => {
                    if (voice.perParamLfoOscs?.has(paramId)) {
                        updateFilterParamLFO(voice, paramId, modConfig);
                    } else {
                        createFilterParamLFO(voice, paramId, modConfig);
                    }
                });
            }
        } else {
            if (config.voices) {
                config.voices.forEach(voice => {
                    removeFilterParamLFO(voice, paramId);
                });
            }
        }
    }
}

/**
 * Toggle modulation mute
 */
function toggleModulationMute(paramId, labelEl) {
    const modConfig = getOrCreateModConfig(paramId);
    modConfig.muted = !modConfig.muted;

    if (modConfig.muted) {
        labelEl.classList.add('mod-muted');
    } else {
        labelEl.classList.remove('mod-muted');
    }
}

/**
 * Return to normal view after modulation edit
 */
function returnToNormalView(paramId, paramDef, labelEl, fader) {
    const editMode = state.modEditMode;
    const modConfig = getOrCreateModConfig(paramId);

    // Reset mode state
    editMode.currentPage = 0;
    editMode.activeParamId = null;
    editMode.inactivityTimer = null;
    editMode.activeLabelEl = null;
    editMode.activeFader = null;

    // Restore label
    if (labelEl.dataset.originalHtml) {
        labelEl.innerHTML = labelEl.dataset.originalHtml;
    } else {
        labelEl.textContent = labelEl.dataset.originalLabel || paramDef.label;
    }
    labelEl.classList.remove('mod-editing');

    // Restore fader to normal mode with base value
    fader.updateRange(paramDef.min ?? 0, paramDef.max ?? 100);
    const baseValue = modConfig.baseValue ?? state[paramDef.statePath];
    fader.setValueWithoutCallback(baseValue);
    fader.clearModulation();
}

/**
 * Reset inactivity timer
 */
function resetInactivityTimer(paramId, labelEl) {
    const editMode = state.modEditMode;

    if (editMode.inactivityTimer) {
        clearTimeout(editMode.inactivityTimer);
        editMode.inactivityTimer = null;
    }

    if (editMode.currentPage > 0 && editMode.activeParamId === paramId) {
        editMode.lastInteractionTime = Date.now();
        editMode.inactivityTimer = setTimeout(() => {
            const paramDef = parameterDefinitions[paramId];
            const fader = miniFaderRegistry.get(paramId);
            if (paramDef && fader) {
                returnToNormalView(paramId, paramDef, labelEl, fader);
            }
        }, 10000); // 10 seconds
    }
}

/**
 * Destroy all MiniFaders (for cleanup)
 */
export function destroyAllMiniFaders() {
    for (const fader of miniFaderRegistry.values()) {
        fader.destroy();
    }
    miniFaderRegistry.clear();
}

/**
 * Get MiniFader instance by paramId
 */
export function getMiniFader(paramId) {
    return miniFaderRegistry.get(paramId);
}
