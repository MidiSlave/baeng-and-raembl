// File: js/ui/faders.js
// Core fader functionality
import { state, parameterDefinitions } from '../state.js';
import { updateFaderState } from './faderState.js';
import { updateFaderDisplay } from './faderDisplay.js';
import { updateFillFromState, getParameterRange, applySteppingIfNeeded, updateFaderFill, setupTouchInteraction } from './faderUtils.js';
import { getOrCreateModConfig, isModulatable, isAudioRateParam, createFilterParamLFO, updateFilterParamLFO, removeFilterParamLFO } from '../modules/perParamMod.js';
import { openPPModModal } from '../../shared/ppmod-modal.js';

// Set up all faders in the UI
export function setupFaders() {
    const faders = document.querySelectorAll('.raembl-app .fader-track');

    faders.forEach(fader => {
        const container = fader.closest('.fader-container');
        if (!container) return;

        const labelEl = container.querySelector('.fader-label');
        if (!labelEl) return;

        // Check for data-param-label attribute first (for SVG icons), then fall back to textContent
        const label = labelEl.dataset.paramLabel || labelEl.textContent?.trim();
        if (!label) return;

        const fill = fader.querySelector('.fader-fill');
        const valueDisplay = container.querySelector('.fader-value');
        const parent = container.closest('.module'); // Get the module parent

        if (!parent || !fill) return;

        // Set initial fill values based on state
        updateFillFromState(label, fill, parent);

        // Set up event handlers for mouse interaction
        setupFaderInteraction(fader, fill, valueDisplay, label, parent);

        // Set up modulation click handler if parameter is modulatable
        setupModulationClickHandler(container, label, fill, valueDisplay, parent);
    });
}

// Setup fader interaction events
function setupFaderInteraction(fader, fill, valueDisplay, label, parent) {
    // Get initial min/max for this parameter
    let { min, max } = getParameterRange(label);
    
    // Set up event handlers for mouse interaction
    fader.addEventListener('mousedown', e => {
        e.preventDefault();
        
        // Re-check ranges in case they're dynamic (like FILLS based on STEPS)
        if (label === 'FILLS') {
            const range = getParameterRange('FILLS');
            min = range.min;
            max = range.max;
        }
        
        const rect = fader.getBoundingClientRect();
        const height = rect.height;
        
        const updateValue = y => {
            const percentage = 1 - Math.min(Math.max(0, (y - rect.top) / height), 1);

            // Check if we're in modulation edit mode
            const paramId = getParameterIdFromLabel(label, parent.id);
            const isInModMode = paramId && state.modEditMode.activeParamId === paramId && state.modEditMode.currentPage > 0;

            // Find vertical text element once per drag (not per move)
            const verticalText = fader.querySelector('.fader-modulation-text');

            if (isInModMode) {
                // Update modulation parameter instead of base parameter
                updateModulationParameter(paramId, state.modEditMode.currentPage, percentage, fill, valueDisplay);

                // Update vertical modulation text color (always call if verticalText exists, regardless of display state)
                if (verticalText) {
                    updateVerticalTextColor(verticalText, fill);
                }

                // Reset inactivity timer on fader interaction
                const container = fader.closest('.fader-container');
                const labelEl = container?.querySelector('.fader-label');
                if (labelEl) {
                    resetInactivityTimer(paramId, labelEl, fill, valueDisplay, verticalText);
                }
            } else {
                // Normal mode: update base parameter
                let value = min + percentage * (max - min);

                // Apply stepping for stepped faders
                value = applySteppingIfNeeded(fader, label, value, parent);
                value = Math.max(min, Math.min(max, value));

                // Update fill height
                updateFaderFill(label, value, fill, min, max);

                // Update state and display based on parameter
                updateFaderState(label, value, parent);
                updateFaderDisplay(label, value, valueDisplay);

                // Update vertical modulation text color if present (always call if exists)
                if (verticalText) {
                    updateVerticalTextColor(verticalText, fill);
                }
            }
        };
        
        updateValue(e.clientY);
        
        const handleMouseMove = e => {
            e.preventDefault(); // Prevent scrolling on mobile/touch devices
            
            // Re-check ranges in case they're dynamic (like FILLS based on STEPS)
            if (label === 'FILLS') {
                const range = getParameterRange('FILLS');
                min = range.min;
                max = range.max;
            }
            
            updateValue(e.clientY);
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    // Add touch event handlers with better touch handling
    setupTouchInteraction(fader, fill, valueDisplay, label, parent, min, max);
}

// --- Per-Parameter Modulation Functions ---

async function updateModulationParameter(paramId, page, percentage, fill, valueDisplay) {
    const modConfig = getOrCreateModConfig(paramId);
    let value, displayValue;

    switch(page) {
        case 1: // Waveform (0-5, discrete)
            value = Math.round(percentage * 5);
            modConfig.waveform = value;
            const waveNames = ['SIN', 'TRI', 'SQR', 'SAW', 'NOISE', 'S&H'];
            displayValue = waveNames[value];
            break;

        case 2: // Rate (0.05 - 30 Hz, log scale)
            const minRate = 0.05;
            const maxRate = 30;
            value = minRate * Math.pow(maxRate / minRate, percentage);
            modConfig.rate = value;
            displayValue = value < 1 ? `${value.toFixed(2)}Hz` : `${value.toFixed(1)}Hz`;
            break;

        case 3: // Offset (-100 to +100)
            value = -100 + (percentage * 200);
            modConfig.offset = value;
            displayValue = value >= 0 ? `+${Math.round(value)}%` : `${Math.round(value)}%`;
            break;

        case 4: // Depth (0-100)
            value = percentage * 100;
            modConfig.depth = value;

            // Enable/disable modulation based on depth
            const wasEnabled = modConfig.enabled;
            modConfig.enabled = (value > 0);

            // Store base value when first enabling
            if (modConfig.enabled && !wasEnabled) {
                const paramDef = parameterDefinitions[paramId];
                if (paramDef) {
                    modConfig.baseValue = state[paramDef.statePath];
                }
            }

            // Clear base value when disabling
            if (!modConfig.enabled && wasEnabled) {
                modConfig.baseValue = null;
            }

            displayValue = `${Math.round(value)}%`;
            break;

        case 5: // Reset mode (0-3, discrete)
            value = Math.round(percentage * 3);
            const resetModes = ['off', 'step', 'accent', 'bar'];
            modConfig.resetMode = resetModes[value];
            displayValue = resetModes[value].toUpperCase();
            break;

        default:
            return;
    }

    // Update fill height
    fill.style.height = `${percentage * 100}%`;

    // Update value display
    if (valueDisplay) {
        valueDisplay.textContent = displayValue;
    }


    // Handle audio-rate filter modulation (create/update/remove LFOs)
    if (isAudioRateParam(paramId)) {
        const { config } = await import('../config.js');

        if (modConfig.enabled && modConfig.depth > 0) {
            // Update or create LFOs for all active voices
            if (config.voices) {
                config.voices.forEach(voice => {
                    if (voice.perParamLfoOscs && voice.perParamLfoOscs.has(paramId)) {
                        // Update existing LFO
                        updateFilterParamLFO(voice, paramId, modConfig);
                    } else {
                        // Create new LFO
                        createFilterParamLFO(voice, paramId, modConfig);
                    }
                });
            }
        } else {
            // Remove LFOs when disabled or depth is 0
            if (config.voices) {
                config.voices.forEach(voice => {
                    removeFilterParamLFO(voice, paramId);
                });
            }
        }
    }
}

function getParameterIdFromLabel(label, moduleId) {
    // Find parameter ID from label and module
    for (const [paramId, paramDef] of Object.entries(parameterDefinitions)) {
        if (paramDef.label === label && paramDef.module === moduleId) {
            return paramId;
        }
    }
    return null;
}

function setupModulationClickHandler(container, label, fill, valueDisplay, parent) {
    if (!parent) return;

    const paramId = getParameterIdFromLabel(label, parent.id);
    if (!paramId || !isModulatable(paramId)) return;

    const labelEl = container.querySelector('.fader-label');
    const faderTrack = container.querySelector('.fader-track');
    if (!labelEl || !faderTrack) return;

    // Store original label text
    labelEl.dataset.originalLabel = label;

    // Store original HTML for SVG icons
    if (labelEl.classList.contains('waveform-icon')) {
        labelEl.dataset.originalHtml = labelEl.innerHTML;
    }

    // Mark as modulatable
    labelEl.classList.add('modulatable');
    labelEl.title = 'Click to edit modulation';

    // Create vertical text element inside fader
    const verticalText = document.createElement('div');
    verticalText.className = 'fader-modulation-text';
    verticalText.style.display = 'none'; // Hidden by default
    verticalText.dataset.paramId = paramId; // Store paramId for easy lookup
    faderTrack.appendChild(verticalText);

    // Store reference for updates
    container.dataset.paramId = paramId;

    // Add click event listener
    labelEl.addEventListener('click', (e) => {
        e.stopPropagation();

        if (e.shiftKey) {
            // Shift+Click: Toggle mute
            toggleModulationMute(paramId, labelEl);
        } else {
            // Normal click: Open PPMod modal
            const paramDef = parameterDefinitions[paramId];
            const modConfig = state.perParamModulations[paramId] || null;
            openPPModModal(paramId, 'raembl', modConfig, paramDef);
        }
    });
}

function cycleModulationMode(paramId, labelEl, fill, valueDisplay, verticalText, faderTrack) {
    const editMode = state.modEditMode;
    const paramDef = parameterDefinitions[paramId];

    // Different param? Start fresh at page 1
    if (editMode.activeParamId !== paramId) {
        // Restore previous parameter's UI to normal view before switching
        if (editMode.activeParamId && editMode.activeLabelEl) {
            const prevParamId = editMode.activeParamId;
            const prevParamDef = parameterDefinitions[prevParamId];
            const prevModConfig = getOrCreateModConfig(prevParamId);

            // Restore previous param's label
            if (editMode.activeLabelEl.dataset.originalHtml) {
                editMode.activeLabelEl.innerHTML = editMode.activeLabelEl.dataset.originalHtml;
            } else {
                editMode.activeLabelEl.textContent = editMode.activeLabelEl.dataset.originalLabel || prevParamDef.label;
            }

            // Hide previous param's vertical text
            if (editMode.activeVerticalText) {
                editMode.activeVerticalText.style.display = 'none';
            }

            // Restore previous param's fader to show base value
            const baseValue = prevModConfig.baseValue !== null ? prevModConfig.baseValue : state[prevParamDef.statePath];
            updateFaderFill(prevParamDef.label, baseValue, editMode.activeFill, prevParamDef.min, prevParamDef.max);
            updateFaderDisplay(prevParamDef.label, baseValue, editMode.activeValueDisplay);
        }

        // Clear timer for previous parameter
        if (editMode.inactivityTimer) {
            clearTimeout(editMode.inactivityTimer);
            editMode.inactivityTimer = null;
        }

        editMode.activeParamId = paramId;
        editMode.currentPage = 1; // Jump to waveform

        // Store original HTML for SVG labels
        if (!labelEl.dataset.originalHtml && labelEl.classList.contains('waveform-icon')) {
            labelEl.dataset.originalHtml = labelEl.innerHTML;
        }

        // Store UI element references for this parameter
        editMode.activeLabelEl = labelEl;
        editMode.activeFill = fill;
        editMode.activeValueDisplay = valueDisplay;
        editMode.activeVerticalText = verticalText;
    } else {
        // Same param, cycle forward (0-5 = 6 modes, then back to 0)
        editMode.currentPage = (editMode.currentPage + 1) % 6;
        if (editMode.currentPage === 0) {
            // Back to normal mode
            editMode.activeParamId = null;

            // Clear inactivity timer when manually returning to normal
            if (editMode.inactivityTimer) {
                clearTimeout(editMode.inactivityTimer);
                editMode.inactivityTimer = null;
            }

            // Clear UI element references
            editMode.activeLabelEl = null;
            editMode.activeFill = null;
            editMode.activeValueDisplay = null;
            editMode.activeVerticalText = null;

            // Restore label: use HTML for SVG icons, text for regular labels
            if (labelEl.dataset.originalHtml) {
                labelEl.innerHTML = labelEl.dataset.originalHtml;
            } else {
                labelEl.textContent = labelEl.dataset.originalLabel || paramDef.label;
            }

            verticalText.style.display = 'none';
            return; // Exit early, no need to update UI
        }
    }

    updateModulationUI(paramId, labelEl, fill, valueDisplay, verticalText, faderTrack);

    // Reset inactivity timer after cycling mode
    resetInactivityTimer(paramId, labelEl, fill, valueDisplay, verticalText);
}

function toggleModulationMute(paramId, labelEl) {
    const modConfig = getOrCreateModConfig(paramId);

    // Toggle mute state
    modConfig.muted = !modConfig.muted;

    // Update visual feedback
    if (modConfig.muted) {
        labelEl.classList.add('muted');
    } else {
        labelEl.classList.remove('muted');
    }
}

function updateModulationUI(paramId, labelEl, fill, valueDisplay, verticalText, faderTrack) {
    const page = state.modEditMode.currentPage;
    const paramDef = parameterDefinitions[paramId];
    const modConfig = getOrCreateModConfig(paramId);

    // Ensure baseValue is properly set before entering mod edit mode
    // This prevents state value contamination from affecting the display
    if (modConfig.baseValue === null || modConfig.baseValue === undefined) {
        // If baseValue hasn't been set yet, try to get it from the fader fill
        // (which should reflect the user's setting before modulation started)
        const currentFillPercent = parseFloat(fill.style.height) || 0;
        const calculatedBaseValue = paramDef.min + (currentFillPercent / 100) * (paramDef.max - paramDef.min);
        modConfig.baseValue = calculatedBaseValue;
    }

    const modeNames = [
        '',          // 0: Normal (not used here)
        'WAVEFORM',  // 1: Waveform
        'RATE',      // 2: Rate
        'OFFSET',    // 3: Offset
        'DEPTH',     // 4: Depth
        'RESET'      // 5: Reset
    ];

    // Restore label: use HTML for SVG icons, text for regular labels
    if (labelEl.dataset.originalHtml) {
        labelEl.innerHTML = labelEl.dataset.originalHtml;
    } else {
        labelEl.textContent = labelEl.dataset.originalLabel || paramDef.label;
    }

    // Show vertical text inside fader
    if (page > 0 && page < modeNames.length) {
        verticalText.dataset.text = modeNames[page]; // Store text in data attribute for ::before/::after
        verticalText.style.display = 'block';

        // Set fader to show current modulation value for this mode
        updateFaderForModulationMode(paramId, page, fill, valueDisplay);

        // Update clip-path based on fader position
        updateVerticalTextColor(verticalText, fill);
    } else {
        verticalText.style.display = 'none';
    }

}

function updateFaderForModulationMode(paramId, page, fill, valueDisplay) {
    const modConfig = getOrCreateModConfig(paramId);
    let percentage, displayValue;

    switch(page) {
        case 1: // Waveform
            percentage = modConfig.waveform / 5;
            const waveNames = ['SIN', 'TRI', 'SQR', 'SAW', 'NOISE', 'S&H'];
            displayValue = waveNames[modConfig.waveform];
            break;

        case 2: // Rate
            const minRate = 0.05;
            const maxRate = 30;
            percentage = Math.log(modConfig.rate / minRate) / Math.log(maxRate / minRate);
            const rate = modConfig.rate;
            displayValue = rate < 1 ? `${rate.toFixed(2)}Hz` : `${rate.toFixed(1)}Hz`;
            break;

        case 3: // Offset
            percentage = (modConfig.offset + 100) / 200;
            displayValue = modConfig.offset >= 0 ? `+${Math.round(modConfig.offset)}%` : `${Math.round(modConfig.offset)}%`;
            break;

        case 4: // Depth
            percentage = modConfig.depth / 100;
            displayValue = `${Math.round(modConfig.depth)}%`;
            break;

        case 5: // Reset
            const resetModes = ['off', 'step', 'accent', 'bar'];
            const resetIndex = resetModes.indexOf(modConfig.resetMode);
            percentage = resetIndex / 3;
            displayValue = modConfig.resetMode.toUpperCase();
            break;

        default:
            return;
    }

    // Update fill
    fill.style.height = `${percentage * 100}%`;

    // Update display
    if (valueDisplay) {
        valueDisplay.textContent = displayValue;
    }
}

function updateVerticalTextColor(verticalText, fill) {
    // Get fill height percentage
    const fillPercent = parseFloat(fill.style.height) || 0;

    // Text is rotated -90deg, so it flows from bottom to top (screen space)
    // After rotation: element "right" = screen "top", element "left" = screen "bottom"

    // Yellow text (::before): visible above the fill (unfilled portion)
    // Clip from left X% to show only top (100-X)% of screen
    // inset(top right bottom left) → inset(0 0 0 X%)
    const yellowClip = `inset(0 0 0 ${fillPercent}%)`;

    // Black text (::after): visible in the fill (filled portion)
    // Clip from right (100-X)% to show only bottom X% of screen
    // inset(top right bottom left) → inset(0 (100-X)% 0 0)
    const blackClip = `inset(0 ${100 - fillPercent}% 0 0)`;

    // Set CSS custom properties for pseudo-elements
    verticalText.style.setProperty('--yellow-clip', yellowClip);
    verticalText.style.setProperty('--black-clip', blackClip);
}

// Inactivity timer management for modulation edit mode
function resetInactivityTimer(paramId, labelEl, fill, valueDisplay, verticalText) {
    // Clear existing timer
    if (state.modEditMode.inactivityTimer) {
        clearTimeout(state.modEditMode.inactivityTimer);
        state.modEditMode.inactivityTimer = null;
    }

    // Only set timer if in sub-settings view (currentPage > 0)
    if (state.modEditMode.currentPage > 0 && state.modEditMode.activeParamId === paramId) {
        state.modEditMode.lastInteractionTime = Date.now();
        state.modEditMode.inactivityTimer = setTimeout(() => {
            returnToNormalView(paramId, labelEl, fill, valueDisplay, verticalText);
        }, 10000); // 10 seconds
    }
}

function returnToNormalView(paramId, labelEl, fill, valueDisplay, verticalText) {
    // Guard: only execute if still in sub-settings for this param
    if (!paramId || state.modEditMode.currentPage === 0 || state.modEditMode.activeParamId !== paramId) {
        return;
    }

    const paramDef = parameterDefinitions[paramId];
    const modConfig = getOrCreateModConfig(paramId);

    // Reset mode state
    state.modEditMode.currentPage = 0;
    state.modEditMode.activeParamId = null;
    state.modEditMode.inactivityTimer = null;

    // Clear UI element references
    state.modEditMode.activeLabelEl = null;
    state.modEditMode.activeFill = null;
    state.modEditMode.activeValueDisplay = null;
    state.modEditMode.activeVerticalText = null;

    // Restore label
    if (labelEl.dataset.originalHtml) {
        labelEl.innerHTML = labelEl.dataset.originalHtml;
    } else {
        labelEl.textContent = labelEl.dataset.originalLabel || paramDef.label;
    }

    // Hide vertical text
    if (verticalText) {
        verticalText.style.display = 'none';
    }

    // Restore fader to show base value
    const baseValue = modConfig.baseValue !== null ? modConfig.baseValue : state[paramDef.statePath];
    updateFaderFill(paramDef.label, baseValue, fill, paramDef.min, paramDef.max);
    updateFaderDisplay(paramDef.label, baseValue, valueDisplay);

}

// Prevent default touchmove behavior to stop scrolling on touch devices
document.addEventListener('touchmove', e => {
    if (e.target.closest('.fader-track')) {
        e.preventDefault();
    }
}, { passive: false });