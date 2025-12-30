// File: js/history.js
// Undo/Redo history manager for Ræmbl
// Now delegates to unified history manager for cross-app undo/redo

import { state, parameterDefinitions } from './state.js';
import { updateParameterById } from './ui/faderState.js';
import { syncSlidePotFromState } from './ui/slidePots.js';
import { unifiedHistoryManager } from '../shared/unifiedHistory.js';

class UndoRedoManager {
    constructor() {
        this.history = [];
        this.currentIndex = -1;
        this.maxHistorySize = 100;

        // Transient properties to exclude from snapshots
        this.transientProperties = [
            'isPlaying',
            'currentStepIndex',
            'factorsPatternPos',
            'displayBar',
            'displayBeat',
            'displayStep',
            'isBarStart',
            'clockRequestId',
            'lastStepTime',
            'stepCounter',
            'barCounter',
            'lfoValue',
            'modLfoValue',
            'sample',
            'prevSample',
            'currentNote',
            'triggerSample',
            'sampleTime',
            'isTransitioning',
            'lfoStartTime',
            'modEditMode',
            'gatePattern',
            'accentPattern',
            'slidePattern',
            'trillPattern'
        ];

        // Debounce timer for rapid updates
        this.debounceTimer = null;
        this.debounceDelay = 300; // ms
    }

    /**
     * Create a snapshot of the current state, filtering out transient properties
     */
    createSnapshot() {
        const snapshot = {};

        for (const key in state) {
            if (!this.transientProperties.includes(key)) {
                // Deep clone the value to prevent reference issues
                const value = state[key];
                if (typeof value === 'object' && value !== null) {
                    snapshot[key] = JSON.parse(JSON.stringify(value));
                } else {
                    snapshot[key] = value;
                }
            }
        }

        return snapshot;
    }

    /**
     * Push a new snapshot to the unified history stack
     * Delegates to unifiedHistoryManager for cross-app undo/redo
     */
    pushSnapshot(debounced = false) {
        // Delegate to unified history manager
        unifiedHistoryManager.pushSnapshot(debounced, 'raembl');
    }

    /**
     * Undo to previous snapshot - delegates to unified manager
     */
    undo() {
        return unifiedHistoryManager.undo();
    }

    /**
     * Redo to next snapshot - delegates to unified manager
     */
    redo() {
        return unifiedHistoryManager.redo();
    }

    /**
     * Check if undo is possible
     */
    canUndo() {
        return unifiedHistoryManager.canUndo();
    }

    /**
     * Check if redo is possible
     */
    canRedo() {
        return unifiedHistoryManager.canRedo();
    }

    /**
     * Restore a snapshot to the current state
     */
    restoreSnapshot(snapshot) {
        if (!snapshot) {
            console.error('History: Invalid snapshot');
            return;
        }

        // Track changed parameters for batch updates
        const changedParams = new Set();

        // Apply snapshot to state
        for (const key in snapshot) {
            if (state.hasOwnProperty(key)) {
                const oldValue = state[key];
                const newValue = snapshot[key];

                // Deep copy for objects/arrays
                if (typeof newValue === 'object' && newValue !== null) {
                    state[key] = JSON.parse(JSON.stringify(newValue));
                } else {
                    state[key] = newValue;
                }

                // Track which parameters changed for UI updates
                if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
                    // Find parameter definitions that reference this state property
                    for (const paramId in parameterDefinitions) {
                        const paramDef = parameterDefinitions[paramId];
                        if (paramDef.statePath === key || paramDef.statePath.startsWith(key + '.')) {
                            changedParams.add(paramId);
                        }
                    }
                }
            }
        }

        // Update UI and audio for all changed parameters
        changedParams.forEach(paramId => {
            const paramDef = parameterDefinitions[paramId];
            if (!paramDef) return;

            const pathParts = paramDef.statePath.split('.');
            let value = state;
            try {
                pathParts.forEach(part => { value = value[part]; });

                if (value !== undefined) {
                    // Special handling for delay.time based on sync mode
                    if (paramId === 'delay.time') {
                        const actualValue = state.delaySyncEnabled ? state.delayTime : state.delayTimeFree;
                        updateParameterById(paramId, actualValue);
                    } else {
                        updateParameterById(paramId, value);
                    }
                    // Sync SlidePot visual (Ræmbl uses SlidePots, not faders)
                    syncSlidePotFromState(paramId);
                }
            } catch (e) {
                console.error(`History: Error restoring parameter ${paramId}:`, e);
            }
        });

        // Update specific UI elements that aren't covered by updateParameterById
        this.updateSpecialUIElements();
    }

    /**
     * Update UI elements that require special handling
     */
    updateSpecialUIElements() {
        // Update mode switch (MONO/POLY)
        const modeSwitch = document.querySelector('#raembl-oscillator .mode-switch');
        if (modeSwitch) {
            const modeOptions = modeSwitch.querySelectorAll('.raembl-app .switch-option');
            if (modeOptions.length === 2) {
                modeOptions.forEach(option => option.classList.remove('active'));
                if (state.monoMode) {
                    modeOptions[0].classList.add('active');
                } else {
                    modeOptions[1].classList.add('active');
                }
            }
        }

        // Update PWM source switch
        const pwmFaderContainer = document.querySelector('#raembl-oscillator .fader-container.fader-with-switch:nth-child(6)');
        if (pwmFaderContainer) {
            const pwmSwitch = pwmFaderContainer.querySelector('.raembl-app .switch');
            if (pwmSwitch) {
                const options = pwmSwitch.querySelectorAll('.raembl-app .switch-option');
                options.forEach(opt => opt.classList.remove('active'));
                if (options[state.pwmSource]) options[state.pwmSource].classList.add('active');
            }
        }

        // Update Pitch Mod source switch
        const modFaderContainer = document.querySelector('#raembl-oscillator .fader-container.fader-with-switch:nth-child(7)');
        if (modFaderContainer) {
            const modSwitch = modFaderContainer.querySelector('.raembl-app .switch');
            if (modSwitch) {
                const options = modSwitch.querySelectorAll('.raembl-app .switch-option');
                options.forEach(opt => opt.classList.remove('active'));
                if (options[state.modSource]) options[state.modSource].classList.add('active');
            }
        }

        // Update delay sync toggle
        const delaySyncToggle = document.querySelector('#raembl-delay .delay-sync-toggle');
        if (delaySyncToggle) {
            delaySyncToggle.textContent = state.delaySyncEnabled ? 'SYNC' : 'FREE';
            delaySyncToggle.classList.toggle('active', state.delaySyncEnabled);
        }

        // Update reset buttons
        const factorsResetButton = document.querySelector('.raembl-app .seq-reset');
        if (factorsResetButton) {
            factorsResetButton.classList.toggle('active', state.resetFactorsOnBar);
        }

        const lfoResetButton = document.querySelector('.raembl-app .lfo-reset');
        if (lfoResetButton) {
            lfoResetButton.classList.toggle('active', state.resetLfoOnBar);
        }
    }

    /**
     * Initialize and register with unified history manager
     */
    initialize() {

        // Register Ræmbl's state and restore callback with unified manager
        unifiedHistoryManager.registerRaembl(state, () => {
            // Restore callback - called when unified manager restores state
            // Update UI for all changed parameters
            for (const paramId in parameterDefinitions) {
                const paramDef = parameterDefinitions[paramId];
                if (!paramDef) continue;

                const pathParts = paramDef.statePath.split('.');
                let value = state;
                try {
                    pathParts.forEach(part => { value = value[part]; });

                    if (value !== undefined) {
                        // Special handling for delay.time based on sync mode
                        if (paramId === 'delay.time') {
                            const actualValue = state.delaySyncEnabled ? state.delayTime : state.delayTimeFree;
                            updateParameterById(paramId, actualValue);
                        } else {
                            updateParameterById(paramId, value);
                        }
                        // Sync SlidePot visual
                        syncSlidePotFromState(paramId);
                    }
                } catch (e) {
                    // Ignore errors for nested paths that don't exist
                }
            }

            // Update special UI elements
            this.updateSpecialUIElements();
        });

        // Initialise unified history after both apps registered
        // Check if Bæng is already registered before initialising
        setTimeout(() => {
            if (unifiedHistoryManager.baengState && unifiedHistoryManager.raemblState) {
                unifiedHistoryManager.initialize();
            }
        }, 100);

    }

    /**
     * Clear all history
     */
    clear() {
        unifiedHistoryManager.clear();
    }
}

// Create and export singleton instance
export const historyManager = new UndoRedoManager();
