// File: js/ui/controls.js - UPDATED for Polyphony Routing, Patch Load, Delay Sync Switch, and Random Buttons
import { state } from '../state.js';
import { togglePlay } from '../modules/clock.js';
import { releaseAllVoices, setPlaitsPolyphony } from '../audio.js';
import { config, colors } from '../config.js';
// Import audio/UI update functions needed for switch actions
import { updateDelay } from '../audio/effects.js';
import { drawDelay, startDelayAnimation } from '../modules/delay.js'; // Visualization
import { updateFaderDisplay } from './faderDisplay.js';
import { historyManager } from '../history.js';
import { randomizeModule } from '../modules/randomize.js';


// --- Helper functions for Audio Routing on Mode Switch ---

export function connectMonoPath() {
    if (!config.monoFilter || !config.masterGain || !config.reverbSendGain || !config.delaySendGain) {
        console.error("Cannot connect MONO path: Required audio nodes missing in config.");
        return;
    }
    try {
        if (config.masterGain) {
             try { config.monoFilter.disconnect(config.masterGain); } catch(e){}
        }
        if (config.reverbSendGain) {
             try { config.monoFilter.disconnect(config.reverbSendGain); } catch(e){}
        }
        if (config.delaySendGain) {
             try { config.monoFilter.disconnect(config.delaySendGain); } catch(e){}
        }

        config.monoFilter.connect(config.masterGain);
        config.monoFilter.connect(config.reverbSendGain);
        config.monoFilter.connect(config.delaySendGain);
        if (config.drySignalTap) {
            config.monoFilter.connect(config.drySignalTap);
        }
        // console.log("MONO path connected.");
    } catch (e) {
        console.error("Error connecting MONO path:", e);
    }
}

export function disconnectMonoPath() {
    if (!config.monoFilter) {
         return;
    }
     try {
        if (config.masterGain) {
             try { config.monoFilter.disconnect(config.masterGain); } catch(e){}
        }
        if (config.reverbSendGain) {
             try { config.monoFilter.disconnect(config.reverbSendGain); } catch(e){}
        }
        if (config.delaySendGain) {
             try { config.monoFilter.disconnect(config.delaySendGain); } catch(e){}
        }
        // console.log("MONO path disconnected.");
     } catch (e) {
        console.warn("Error during MONO path disconnection:", e.message);
     }
}


export function setupPlayButton() {
    // Play button removed from CLOCK module - now handled by shared time strip
    // This function is kept for backwards compatibility but is now a no-op
}

export function setupResetButtons() {
    // Reset buttons now in their respective module headers
    const factorsResetButton = document.querySelector('#raembl-factors .seq-reset');
    const lfoResetButton = document.querySelector('#raembl-lfo .lfo-reset');

    if (factorsResetButton) {
        factorsResetButton.classList.toggle('active', state.resetFactorsOnBar);
        factorsResetButton.addEventListener('click', () => {
            state.resetFactorsOnBar = !state.resetFactorsOnBar;
            factorsResetButton.classList.toggle('active', state.resetFactorsOnBar);

            // Capture snapshot after toggle
            if (typeof historyManager !== 'undefined' && historyManager) {
                historyManager.pushSnapshot();
            }
        });
    } else {
        console.warn("SEQ reset button not found.");
    }

    if (lfoResetButton) {
        lfoResetButton.classList.toggle('active', state.resetLfoOnBar);
        lfoResetButton.addEventListener('click', () => {
            state.resetLfoOnBar = !state.resetLfoOnBar;
            lfoResetButton.classList.toggle('active', state.resetLfoOnBar);

            // Capture snapshot after toggle
            if (typeof historyManager !== 'undefined' && historyManager) {
                historyManager.pushSnapshot();
            }
        });
    } else {
        console.warn("LFO reset button not found.");
    }
}

export function setupSwitches() {
    // --- Setup standard switches (PWM Source, Pitch MOD Source) ---
    const standardSwitches = document.querySelectorAll('.raembl-app .switch:not(.mode-switch):not(.delay-sync-switch) .switch-option');
    standardSwitches.forEach(switchOption => {
        const switchContainer = switchOption.closest('.switch');
        if (!switchContainer) return;
        const faderContainer = switchContainer.closest('.fader-container');
        if (!faderContainer) return;
        const labelElement = faderContainer.querySelector('.fader-label');
        const parentModule = faderContainer.closest('.module');

        if (!labelElement || !parentModule) return;

        const label = labelElement.textContent.trim();
        const parentId = parentModule.id;
        let isActive = false;
        const switchIndex = Array.from(switchContainer.querySelectorAll('.switch-option')).indexOf(switchOption);

        if (label === 'PWM' && parentId === 'oscillator') {
            isActive = (state.pwmSource === switchIndex);
        } else if (label === 'MOD' && parentId === 'oscillator') {
            isActive = (state.modSource === switchIndex);
        }

        switchOption.classList.toggle('active', isActive);

        switchOption.addEventListener('click', () => {
            const options = switchContainer.querySelectorAll('.raembl-app .switch-option');
            const clickedIndex = Array.from(options).indexOf(switchOption);
            options.forEach(option => option.classList.remove('active'));
            switchOption.classList.add('active');

            if (label === 'PWM' && parentId === 'oscillator') {
                state.pwmSource = clickedIndex;
            } else if (label === 'MOD' && parentId === 'oscillator') {
                state.modSource = clickedIndex;
            }

            // Capture snapshot after switch change
            if (typeof historyManager !== 'undefined' && historyManager) {
                historyManager.pushSnapshot();
            }
        });
    });

    // --- Setup switch icons (SVG toggle switches) ---
    setupSwitchIcons();

    // --- Setup the MONO/POLY mode switch ---
    setupModeSwitch();

    // --- Setup the Delay SYNC/FREE switch ---
    setupDelaySyncSwitch();
}

/**
 * Setup SVG-based switch icons (LFO/ENV toggles)
 */
function setupSwitchIcons() {
    const switchIcons = document.querySelectorAll('.raembl-app .switch-icon');

    switchIcons.forEach(icon => {
        const faderContainer = icon.closest('.slide-pot-container');
        if (!faderContainer) return;

        const labelElement = faderContainer.querySelector('.slide-pot-label');
        const parentModule = faderContainer.closest('.module');
        if (!labelElement || !parentModule) return;

        const label = labelElement.dataset.paramLabel || labelElement.textContent?.trim();
        const parentId = parentModule.id.replace(/^raembl-/, '');

        // Set initial state from state object
        let currentState = 'lfo'; // Default to LFO (0)
        if (label === 'PWM' && parentId === 'oscillator') {
            currentState = state.pwmSource === 1 ? 'env' : 'lfo';
        } else if (label === 'MOD' && parentId === 'oscillator') {
            currentState = state.modSource === 1 ? 'env' : 'lfo';
        }
        icon.dataset.state = currentState;

        // Click handler to toggle state
        icon.addEventListener('click', () => {
            const newState = icon.dataset.state === 'lfo' ? 'env' : 'lfo';
            icon.dataset.state = newState;
            const stateIndex = newState === 'env' ? 1 : 0;

            if (label === 'PWM' && parentId === 'oscillator') {
                state.pwmSource = stateIndex;
                // Re-route current PWM amount to new modulation source
                if (config.useWorklet && config.workletBridge) {
                    const normalized = state.pwmAmount / 100;
                    if (stateIndex === 1) { // ENV
                        config.workletBridge.updateAllParameters({ envToPWM: normalized, lfoToPWM: 0 });
                    } else { // LFO
                        config.workletBridge.updateAllParameters({ lfoToPWM: normalized, envToPWM: 0 });
                    }
                }
            } else if (label === 'MOD' && parentId === 'oscillator') {
                state.modSource = stateIndex;
                // Re-route current PITCH MOD amount to new modulation source
                if (config.useWorklet && config.workletBridge) {
                    const normalized = state.pitchMod / 100;
                    if (stateIndex === 1) { // ENV
                        config.workletBridge.updateAllParameters({ pitchEnvAmount: normalized, lfoToPitch: 0 });
                    } else { // LFO
                        config.workletBridge.updateAllParameters({ lfoToPitch: normalized, pitchEnvAmount: 0 });
                    }
                }
            }

            // Capture snapshot after switch change
            if (typeof historyManager !== 'undefined' && historyManager) {
                historyManager.pushSnapshot();
            }
        });
    });
}

function setupModeSwitch() {
    const modeToggle = document.querySelector('#raembl-oscillator .mode-toggle');
    if (!modeToggle) {
        console.warn("MONO/POLY mode toggle not found in DOM");
        return;
    }

    updateModeSwitchUI();

    modeToggle.addEventListener('click', () => {
        const newModeIsMono = !state.monoMode; // Toggle current mode
        releaseAllVoices();
        setTimeout(() => {
            try {
                 state.monoMode = newModeIsMono;

                 // Update Plaits polyphony if in Plaits mode
                 if (state.engineType === 'plaits') {
                     setPlaitsPolyphony(newModeIsMono ? 1 : 8);
                 }

                 // Clean up stale modulation state from previous mode
                 import('../modules/perParamMod.js').then(module => {
                     if (module.cleanupModeSwitch) {
                         module.cleanupModeSwitch(!newModeIsMono); // true if switching to POLY
                     }
                 }).catch(e => console.warn('Could not cleanup modulation state on mode switch:', e));

                 if (state.monoMode) {
                     disconnectPolyPath();
                     connectMonoPath();
                 } else {
                     disconnectMonoPath();
                 }
                 updateModeSwitchUI();

                 // Capture snapshot after mode switch
                 if (typeof historyManager !== 'undefined' && historyManager) {
                     historyManager.pushSnapshot();
                 }
            } catch (e) {
                 console.error("Error during mode switch audio routing:", e);
            }
        }, 50);
    });

     if (config.initialized) {
         if (state.monoMode) {
             connectMonoPath();
         } else {
             disconnectMonoPath();
         }
     } else {
         console.warn("setupModeSwitch: Audio not initialized yet, initial path connection deferred.");
     }
}

function setupDelaySyncSwitch() {
    const delaySyncToggle = document.querySelector('#raembl-delay .delay-sync-toggle');
    if (!delaySyncToggle) {
        // Expected when fxMode is 'clouds' - delay module not rendered
        return;
    }

    // Set initial UI based on state.delaySyncEnabled
    updateDelaySyncToggleUI(delaySyncToggle);

    delaySyncToggle.addEventListener('click', () => {
        // Toggle the state
        state.delaySyncEnabled = !state.delaySyncEnabled;
        updateDelaySyncToggleUI(delaySyncToggle);

        // Update audio engine and visualization
        if (typeof updateDelay === 'function') updateDelay();
        if (typeof drawDelay === 'function') drawDelay();
        if (typeof startDelayAnimation === 'function') startDelayAnimation();

        // Update fader display for TIME fader
        const timeFaderContainer = document.querySelector('#raembl-delay .fader-section .fader-container:nth-child(2)');
        if (timeFaderContainer) {
            const timeValueDisplay = timeFaderContainer.querySelector('.fader-value');
            const currentValue = state.delaySyncEnabled ? state.delayTime : state.delayTimeFree;
            if (timeValueDisplay && typeof updateFaderDisplay === 'function') {
                updateFaderDisplay('TIME', currentValue, timeValueDisplay);
            } else {
                console.warn("Could not update TIME fader display for delay.");
            }
        }

        // Capture snapshot after delay sync toggle
        if (typeof historyManager !== 'undefined' && historyManager) {
            historyManager.pushSnapshot();
        }
    });
}

export function updateDelaySyncToggleUI(toggle) {
    if (!toggle) {
        toggle = document.querySelector('#raembl-delay .delay-sync-toggle');
    }
    if (toggle) {
        toggle.textContent = state.delaySyncEnabled ? 'SYNC' : 'FREE';
        toggle.classList.toggle('active', state.delaySyncEnabled);
    }
}


function disconnectPolyPath() {
    if (!config.voices || config.voices.length === 0) return;
    config.voices.forEach(voice => {
        if (voice && voice.filterNodes?.lp) {
             const finalOutputNode = voice.filterNodes.lp;
             try {
                 if (config.masterGain) finalOutputNode.disconnect(config.masterGain);
                 if (config.reverbSendGain) finalOutputNode.disconnect(config.reverbSendGain);
                 if (config.delaySendGain) finalOutputNode.disconnect(config.delaySendGain);
             } catch (e) {
                 // console.warn(`Minor error disconnecting poly voice ${voice.id}:`, e.message);
             }
        }
    });
}

function updateModeSwitchUI() {
    const modeToggle = document.querySelector('#raembl-oscillator .mode-toggle');
    if (!modeToggle) return;
    modeToggle.textContent = state.monoMode ? 'MONO' : 'POLY';
    modeToggle.classList.toggle('active', state.monoMode);
}

// Generate dice dot positions for faces 1-6
function getDiceDots(faceValue) {
    // Using better padding: positions from 3 to 11 (instead of 3.5 to 10.5)
    // with radius 0.8, gives us 2.2-11.8 range (2.2px from edge instead of 1.7px)
    const positions = {
        1: [{ cx: 7, cy: 7 }], // Center
        2: [{ cx: 4, cy: 4 }, { cx: 10, cy: 10 }], // Diagonal
        3: [{ cx: 4, cy: 4 }, { cx: 7, cy: 7 }, { cx: 10, cy: 10 }], // Diagonal with center
        4: [{ cx: 4, cy: 4 }, { cx: 10, cy: 4 }, { cx: 4, cy: 10 }, { cx: 10, cy: 10 }], // Four corners
        5: [{ cx: 4, cy: 4 }, { cx: 10, cy: 4 }, { cx: 7, cy: 7 }, { cx: 4, cy: 10 }, { cx: 10, cy: 10 }], // Four corners + center
        6: [{ cx: 4, cy: 4 }, { cx: 10, cy: 4 }, { cx: 4, cy: 7 }, { cx: 10, cy: 7 }, { cx: 4, cy: 10 }, { cx: 10, cy: 10 }] // Two columns of 3
    };
    return positions[faceValue] || positions[6];
}

// Update dice button with random face and rotation
function updateDiceFace(button) {
    const svg = button.querySelector('.raembl-app svg');
    if (!svg) return;

    // Random face (1-6)
    const randomFace = Math.floor(Math.random() * 6) + 1;

    // Random rotation (0°, 90°, 180°, 270°)
    const rotations = [0, 90, 180, 270];
    const randomRotation = rotations[Math.floor(Math.random() * rotations.length)];

    // Get dots for this face
    const dots = getDiceDots(randomFace);

    // Clear existing circles
    const circles = svg.querySelectorAll('.raembl-app circle');
    circles.forEach(circle => circle.remove());

    // Add new dots
    dots.forEach(dot => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', dot.cx);
        circle.setAttribute('cy', dot.cy);
        circle.setAttribute('r', '0.8');
        circle.setAttribute('fill', colors.yellow);
        svg.appendChild(circle);
    });

    // Apply rotation to the SVG
    svg.style.transform = `rotate(${randomRotation}deg)`;
}

export function setupRandomButtons() {
    const randomButtons = document.querySelectorAll('.raembl-app .random-button');

    randomButtons.forEach(button => {
        // Set initial random dice face
        updateDiceFace(button);

        button.addEventListener('click', () => {
            // Extract module ID from button ID (e.g., "clock-random" -> "clock")
            const moduleId = button.id.replace('-random', '');

            // Generate new random dice face before animation
            updateDiceFace(button);

            // Add rolling animation class
            button.classList.add('rolling');

            // Disable button during animation
            button.disabled = true;

            // Randomize the module
            randomizeModule(moduleId);

            // Remove animation class and re-enable button after animation completes
            setTimeout(() => {
                button.classList.remove('rolling');
                button.disabled = false;
            }, 200); // Match animation duration in CSS
        });
    });

}