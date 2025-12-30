/**
 * File: merged-app/js/raembl/ui/slidePots.js
 * SlidePot setup and management for Ræmbl
 *
 * Replaces the old faders.js with SlidePot component integration
 */

import { SlidePot } from '../../shared/components/SlidePot.js';
import { state, parameterDefinitions } from '../state.js';
import { updateFaderState } from './faderState.js';
import { updateFaderDisplay } from './faderDisplay.js';
import { getParameterRange, applySteppingIfNeeded } from './faderUtils.js';
import { getOrCreateModConfig, isModulatable, isAudioRateParam, createFilterParamLFO, updateFilterParamLFO, removeFilterParamLFO } from '../modules/perParamMod.js';
import { scales, noteNames } from '../utils.js';
import { getFrequencyHz } from '../modules/lfo.js';
import { openPPModModal } from '../../shared/ppmod-modal.js';
import { getWaveformIcon as getModLfoWaveformIcon } from '../modules/modlfo.js';
import { delayDivisionsValues } from '../audio/effects.js';
import { mapRange } from '../utils.js';

// Registry for external access (patch load, mod feedback, undo/redo)
export const slidePotRegistry = new Map();

/**
 * Setup all SlidePots in the Ræmbl app
 */
export function setupSlidePots() {
    const containers = document.querySelectorAll('.raembl-app .slide-pot-container');

    containers.forEach(container => {
        const paramId = container.dataset.paramId;
        if (!paramId) {
            console.warn('[SlidePot] Container missing data-param-id:', container);
            return;
        }

        // Skip if already set up (prevents duplicate handlers on re-init)
        if (slidePotRegistry.has(paramId)) {
            return;
        }

        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) {
            console.warn('[SlidePot] Unknown parameter:', paramId);
            return;
        }

        const labelEl = container.querySelector('.slide-pot-label');
        const label = labelEl?.dataset.paramLabel || labelEl?.textContent?.trim() || paramDef.label;

        // Get initial value from state
        const initialValue = state[paramDef.statePath] ?? paramDef.min ?? 0;

        // Determine if stepped (for discrete params like waveform selectors)
        const step = paramDef.step ?? null;

        // Get dynamic range (for params like FILLS, ACCENT, SLIDE, TRILL that have constraints)
        const dynamicRange = getParameterRange(label, container.closest('.module')?.id || '');
        const min = dynamicRange.min ?? paramDef.min ?? 0;
        const max = dynamicRange.max ?? paramDef.max ?? 100;

        // Create SlidePot instance
        const pot = new SlidePot(container, {
            min: min,
            max: max,
            value: Math.min(initialValue, max), // Clamp to current max
            step: step,
            paramId: paramId,
            formatValue: (value) => formatParamValue(paramDef.label, value),
            onChange: (value) => {
                handleSlidePotChange(paramId, paramDef, label, value, container);
            }
        });

        // Store in registry
        slidePotRegistry.set(paramId, pot);

        // Setup modulation click handler if parameter is modulatable
        if (isModulatable(paramId) && labelEl) {
            setupModulationClickHandler(container, paramId, paramDef, labelEl, pot);
        }
    });
}

/**
 * Handle SlidePot value change
 */
function handleSlidePotChange(paramId, paramDef, label, value, container) {
    // Check if we're in modulation edit mode
    const isInModMode = state.modEditMode.activeParamId === paramId && state.modEditMode.currentPage > 0;

    if (isInModMode) {
        // Update modulation parameter instead of base parameter
        updateModulationParameter(paramId, state.modEditMode.currentPage, value, paramDef);

        // Reset inactivity timer on interaction
        const labelEl = container.querySelector('.slide-pot-label');
        if (labelEl) {
            resetInactivityTimer(paramId, labelEl);
        }
    } else {
        // Normal mode: update base parameter
        const parent = container.closest('.module');
        updateFaderState(label, value, parent);
    }
}

// Transposition display options for OCT and SUB OCT
const TRANSPOSITION_OPTIONS = ['-2o', '-1.5o', '-1o', '-.7o', '0', '+.7o', '+1o', '+1.5o', '+2o'];

// LFO waveform names (for main LFO with morphing)
const LFO_WAVEFORM_NAMES = ['Sin', 'Tri', 'Sqr', 'Saw'];

// Mod LFO waveform names
const MOD_LFO_WAVEFORM_NAMES = ['SIN', 'TRI', 'SQR', 'SAW', 'RND', 'S&H'];

// Clouds playback mode names
const CLOUDS_MODE_NAMES = ['Granular', 'WSOLA', 'Looping', 'Spectral'];

/**
 * Format parameter value for display
 */
function formatParamValue(label, value) {
    switch (label) {
        // Timing parameters
        case 'BPM':
            return Math.round(value).toString();
        case 'SWING':
        case 'PROB':
        case 'GATE':
            return `${Math.round(value)}%`;
        case 'LENGTH':
        case 'STEPS':
        case 'SHIFT':
            return Math.max(1, Math.round(value)).toString();
        case 'FILLS':
            return Math.max(0, Math.round(value)).toString();
        case '>':
            // Accent: show value/fills format
            return `${Math.round(value)}/${state.fills}`;
        case 'SLIDE':
            // Slide: show value/fills format
            return `${Math.round(value)}/${state.fills}`;
        case 'TR':
        case 'TRILL':
            // Trill: show value/fills format
            return `${Math.round(value)}/${state.fills}`;

        // Scale and pitch parameters
        case 'SCALE':
            const scaleIndex = Math.min(Math.round(value), scales.length - 1);
            return scales[scaleIndex]?.name || 'Major';
        case 'ROOT':
            const rootIndex = Math.round(value) % 12;
            return noteNames[rootIndex] || 'C';
        case 'OCT':
        case 'SUB OCT':
            const transIndex = Math.round(value);
            return TRANSPOSITION_OPTIONS[transIndex] || '0';

        // LFO parameters
        case 'AMP':
        case 'OFFSET':
            return Math.round(value).toString();
        case 'FREQ':
            return `${Math.round(getFrequencyHz() * 10) / 10}Hz`;
        case 'WAVE':
            // Main LFO uses morphing waveforms
            const numShapes = 4;
            const clampedValue = Math.min(value, 99.999);
            const shapeIndex = Math.floor(clampedValue / (100 / numShapes));
            return LFO_WAVEFORM_NAMES[Math.min(shapeIndex, LFO_WAVEFORM_NAMES.length - 1)];
        case 'RATE':
            return `${Math.round(value)}%`;

        // Mod LFO parameters (discrete waveform selection)
        case 'MOD WAVE':
            const modWaveIndex = Math.round(value / 20); // 0-100 maps to 0-5
            return MOD_LFO_WAVEFORM_NAMES[Math.min(modWaveIndex, MOD_LFO_WAVEFORM_NAMES.length - 1)];

        // Delay parameters
        case 'TIME':
            if (state.delaySyncEnabled) {
                const delayDivDescriptions = [
                    '1/32', '1/16', '1/16T', '1/8', '1/8T', '1/16D',
                    '1/4', '1/4T', '1/8D', '1/2', '1/4D', '1'
                ];
                const index = Math.min(Math.floor(value / (100 / delayDivisionsValues.length)), delayDivisionsValues.length - 1);
                let displayValue = delayDivDescriptions[index] || 'Div';
                if (index >= 0 && index < delayDivisionsValues.length && delayDivisionsValues[index] === 1) {
                    const bpm = state?.bpm || 120;
                    const ms = (bpm > 0) ? Math.round(60000 / bpm) : 0;
                    displayValue = `1 (${ms}ms)`;
                }
                return displayValue;
            } else {
                const minMs = 1;
                const maxMs = 4000;
                const freeMs = mapRange(value, 0, 100, minMs, maxMs, true);
                return `${Math.round(freeMs)}ms`;
            }
        case 'FDBK':
        case 'WOW':
        case 'FLUT':
        case 'SAT':
            return `${Math.round(value)}%`;

        // Reverb parameters
        case 'PRED':
            const maxPreDelayMs = 200;
            const msPred = Math.round((value / 100) * maxPreDelayMs);
            return `${msPred}ms`;
        case 'DEC':
        case 'DIFF':
        case 'DAMP':
            return `${Math.round(value)}%`;

        // Clouds parameters
        case 'MODE':
            const modeIndex = Math.round(value);
            return CLOUDS_MODE_NAMES[modeIndex] || 'Granular';
        case 'POS':
        case 'SIZE':
        case 'DENS':
        case 'TEX':
        case 'SPRD':
        case 'FB':
        case 'VERB':
        case 'D/W':
        case 'IN':
            return `${Math.round(value)}%`;
        case 'PITCH':
            // Clouds pitch: 0-100 maps to -24 to +24 semitones
            const semitones = Math.round(((value - 50) / 50) * 24);
            if (semitones === 0) return '0st';
            return semitones > 0 ? `+${semitones}st` : `${semitones}st`;

        // Oscillator parameters
        case 'DRIFT':
        case 'GLIDE':
        case 'WIDTH':
        case 'PWM':
            return `${Math.round(value)}%`;

        // Mixer parameters (waveform levels)
        case '◢':  // Saw
        case '⊓':  // Square
        case '△':  // Triangle
        case '■':  // Sub
        case '≋':  // Noise
            return `${Math.round(value)}%`;

        // Filter parameters
        case 'HP':
        case 'LP':
        case 'RES':
        case 'KEY':
        case 'ENV':
        case 'MOD':
            return `${Math.round(value)}%`;

        // Envelope parameters
        case 'A':
        case 'D':
        case 'S':
        case 'R':
        case 'ATK':
        case 'REL':
            if (value < 10) return value.toFixed(1);
            return `${Math.round(value)}%`;

        // Volume
        case 'VOL':
            return `${Math.round(value)}%`;

        // Default formatting
        default:
            return Math.round(value).toString();
    }
}

/**
 * Sync a single SlidePot from state (for patch load, undo/redo)
 */
export function syncSlidePotFromState(paramId) {
    const pot = slidePotRegistry.get(paramId);
    if (!pot) return;

    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) return;

    const value = state[paramDef.statePath];
    if (value !== undefined) {
        pot.setValueWithoutCallback(value);
    }
}

/**
 * Sync all SlidePots from state
 */
export function syncAllSlidePots() {
    for (const paramId of slidePotRegistry.keys()) {
        syncSlidePotFromState(paramId);
    }
}

/**
 * Update a SlidePot's range dynamically (e.g., FILLS based on STEPS)
 */
export function updateSlidePotRange(paramId, min, max) {
    const pot = slidePotRegistry.get(paramId);
    if (pot) {
        pot.updateRange(min, max);
    }
}

/**
 * Update FACTORS cascading ranges (accent, slide, trill constrained by fills and each other)
 * Call this whenever fills, accentAmt, slideAmt, or trillAmt changes
 */
export function updateFactorsCascadingRanges() {
    const fills = state.fills || 0;
    const accentAmt = state.accentAmt || 0;
    const slideAmt = state.slideAmt || 0;
    const trillAmt = state.trillAmt || 0;

    // Accent max = fills - slide - trill
    const accentMax = Math.max(0, fills - slideAmt - trillAmt);
    updateSlidePotRange('factors.accentAmt', 0, accentMax);

    // Clamp accent if it exceeds new max
    if (accentAmt > accentMax) {
        state.accentAmt = accentMax;
        syncSlidePotFromState('factors.accentAmt');
    }

    // Slide max = fills - accent - trill
    const slideMax = Math.max(0, fills - state.accentAmt - trillAmt);
    updateSlidePotRange('factors.slideAmt', 0, slideMax);

    // Clamp slide if it exceeds new max
    if (slideAmt > slideMax) {
        state.slideAmt = slideMax;
        syncSlidePotFromState('factors.slideAmt');
    }

    // Trill max = fills - accent - slide
    const trillMax = Math.max(0, fills - state.accentAmt - state.slideAmt);
    updateSlidePotRange('factors.trillAmt', 0, trillMax);

    // Clamp trill if it exceeds new max
    if (trillAmt > trillMax) {
        state.trillAmt = trillMax;
        syncSlidePotFromState('factors.trillAmt');
    }
}

/**
 * Setup modulation click handler for a SlidePot label
 */
function setupModulationClickHandler(container, paramId, paramDef, labelEl, pot) {
    // Skip if already set up (check for marker attribute)
    if (labelEl.dataset.modHandlerSetup) {
        return;
    }
    labelEl.dataset.modHandlerSetup = 'true';

    // Store original label text/HTML
    labelEl.dataset.originalLabel = labelEl.textContent?.trim() || paramDef.label;
    if (labelEl.classList.contains('waveform-icon')) {
        labelEl.dataset.originalHtml = labelEl.innerHTML;
    }

    // Mark as modulatable
    labelEl.classList.add('modulatable');
    labelEl.title = 'Click to edit modulation, Shift+Click to mute';

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
function cycleModulationMode(paramId, paramDef, labelEl, pot) {
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
        editMode.activePot = pot;
    } else {
        // Same param, cycle forward (0-5 = 6 modes, then back to 0)
        editMode.currentPage = (editMode.currentPage + 1) % 6;
        if (editMode.currentPage === 0) {
            // Back to normal mode
            returnToNormalView(paramId, paramDef, labelEl, pot);
            return;
        }
    }

    updateModulationUI(paramId, paramDef, labelEl, pot);
    resetInactivityTimer(paramId, labelEl);
}

/**
 * Restore previous parameter's UI to normal
 */
function restorePreviousParamUI(editMode) {
    const prevParamId = editMode.activeParamId;
    const prevParamDef = parameterDefinitions[prevParamId];
    const prevLabelEl = editMode.activeLabelEl;
    const prevPot = editMode.activePot;

    if (prevLabelEl) {
        // Restore label
        if (prevLabelEl.dataset.originalHtml) {
            prevLabelEl.innerHTML = prevLabelEl.dataset.originalHtml;
        } else {
            prevLabelEl.textContent = prevLabelEl.dataset.originalLabel || prevParamDef?.label;
        }
    }

    // Restore pot to show base value
    if (prevPot && prevParamDef) {
        const modConfig = getOrCreateModConfig(prevParamId);
        const baseValue = modConfig.baseValue ?? state[prevParamDef.statePath];
        prevPot.setValueWithoutCallback(baseValue);
        prevPot.setModulating(false);
    }
}

/**
 * Update UI for current modulation edit page
 */
function updateModulationUI(paramId, paramDef, labelEl, pot) {
    const page = state.modEditMode.currentPage;
    const modConfig = getOrCreateModConfig(paramId);

    const modeNames = ['', 'WAVE', 'RATE', 'OFFSET', 'DEPTH', 'RESET'];

    // Update label to show mode name
    if (page > 0 && page < modeNames.length) {
        labelEl.textContent = modeNames[page];
    }

    // Set pot to show current modulation value
    pot.setModulating(true);
    updatePotForModulationMode(paramId, page, pot, modConfig, paramDef);
}

/**
 * Update pot position for modulation mode
 */
function updatePotForModulationMode(paramId, page, pot, modConfig, paramDef) {
    let value, displayValue;

    switch (page) {
        case 1: // Waveform (0-5)
            const waveNames = ['SIN', 'TRI', 'SQR', 'SAW', 'NOISE', 'S&H'];
            pot.updateRange(0, 5);
            pot.setValueWithoutCallback(modConfig.waveform);
            pot.setDisplayText(waveNames[modConfig.waveform]);
            break;

        case 2: // Rate (0.05-30 Hz, mapped 0-100 for pot)
            pot.updateRange(0, 100);
            const minRate = 0.05, maxRate = 30;
            const ratePercent = Math.log(modConfig.rate / minRate) / Math.log(maxRate / minRate) * 100;
            pot.setValueWithoutCallback(ratePercent);
            displayValue = modConfig.rate < 1 ? `${modConfig.rate.toFixed(2)}Hz` : `${modConfig.rate.toFixed(1)}Hz`;
            pot.setDisplayText(displayValue);
            break;

        case 3: // Offset (-100 to +100, mapped 0-100)
            pot.updateRange(0, 100);
            pot.setValueWithoutCallback((modConfig.offset + 100) / 2);
            displayValue = modConfig.offset >= 0 ? `+${Math.round(modConfig.offset)}%` : `${Math.round(modConfig.offset)}%`;
            pot.setDisplayText(displayValue);
            break;

        case 4: // Depth (0-100)
            pot.updateRange(0, 100);
            pot.setValueWithoutCallback(modConfig.depth);
            pot.setDisplayText(`${Math.round(modConfig.depth)}%`);
            break;

        case 5: // Reset (0-3)
            const resetModes = ['OFF', 'STEP', 'ACCENT', 'BAR'];
            const resetIndex = ['off', 'step', 'accent', 'bar'].indexOf(modConfig.resetMode);
            pot.updateRange(0, 3);
            pot.setValueWithoutCallback(resetIndex >= 0 ? resetIndex : 0);
            pot.setDisplayText(resetModes[resetIndex >= 0 ? resetIndex : 0]);
            break;
    }
}

/**
 * Update modulation parameter from pot change
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
    const pot = slidePotRegistry.get(paramId);
    if (pot) {
        pot.setDisplayText(displayValue);
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
        labelEl.classList.add('muted');
    } else {
        labelEl.classList.remove('muted');
    }
}

/**
 * Return to normal view after modulation edit
 */
function returnToNormalView(paramId, paramDef, labelEl, pot) {
    const editMode = state.modEditMode;
    const modConfig = getOrCreateModConfig(paramId);

    // Reset mode state
    editMode.currentPage = 0;
    editMode.activeParamId = null;
    editMode.inactivityTimer = null;
    editMode.activeLabelEl = null;
    editMode.activePot = null;

    // Restore label
    if (labelEl.dataset.originalHtml) {
        labelEl.innerHTML = labelEl.dataset.originalHtml;
    } else {
        labelEl.textContent = labelEl.dataset.originalLabel || paramDef.label;
    }

    // Restore pot to normal mode with base value
    pot.updateRange(paramDef.min ?? 0, paramDef.max ?? 100);
    const baseValue = modConfig.baseValue ?? state[paramDef.statePath];
    pot.setValueWithoutCallback(baseValue);
    pot.setModulating(false);
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
            const pot = slidePotRegistry.get(paramId);
            if (paramDef && pot) {
                returnToNormalView(paramId, paramDef, labelEl, pot);
            }
        }, 10000); // 10 seconds
    }
}

/**
 * Update modulation LED animation (called from perParamMod.js)
 * NOTE: This is called from the PPMod animation loop only for parameters with active modulation,
 * so we don't need to check isModulating() - that check was preventing LED updates when
 * modulation was active but user wasn't in edit mode.
 */
export function updateModulationLED(paramId, brightness) {
    const pot = slidePotRegistry.get(paramId);
    if (pot) {
        pot.setLedBrightness(brightness);
    }
}

/**
 * Destroy all SlidePots (for cleanup)
 */
export function destroyAllSlidePots() {
    for (const pot of slidePotRegistry.values()) {
        pot.destroy();
    }
    slidePotRegistry.clear();
}
