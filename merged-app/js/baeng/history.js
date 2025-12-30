// File: js/history.js
// Undo/Redo History Manager for Bæng
// Now delegates to unified history manager for cross-app undo/redo

import { state, parameterDefinitions, getParameterValue } from './state.js';
import { updateEngineParams } from './modules/engine.js';
import { updateParameterById } from './utils/parameterUpdater.js';
import { resetPhaseAccumulators } from './modules/perParamMod.js';
import { unifiedHistoryManager } from '../shared/unifiedHistory.js';

class UndoRedoManager {
    constructor() {
        this.history = [];
        this.currentIndex = -1;
        this.maxHistorySize = 100;

        // Transient properties to exclude from snapshots
        this.transientProperties = [
            // Playback state
            'isPlaying',
            'currentStepIndex',
            'displayBar',
            'displayBeat',
            'displayStep',
            'isBarStart',
            'clockRequestId',
            'lastStepTime',
            'stepCounter',
            'barCounter',

            // UI state
            'isDragging',
            'editMode',
            'tempEditMode',

            // Runtime data
            'deviatedTriggers',
            'lastDiagnostic',

            // Modulation edit mode (entire object is UI state)
            'modEditMode',

            // Voice LFO runtime (if contains phase accumulators)
            'voiceLFOs',

            // Parameter smoothing metadata (Map object, runtime only)
            'parameterSmoothingMetadata',
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
            if (this.transientProperties.includes(key)) {
                continue; // Skip transient properties
            }

            // Special handling for sequences (exclude currentStep)
            if (key === 'sequences') {
                snapshot.sequences = state.sequences.map(seq => {
                    const seqSnapshot = JSON.parse(JSON.stringify(seq));
                    delete seqSnapshot.currentStep; // Runtime property
                    return seqSnapshot;
                });
                continue;
            }

            // Special handling for voices array (exclude dx7Patch objects)
            if (key === 'voices') {
                snapshot.voices = state.voices.map(voice => {
                    const voiceSnapshot = {};
                    for (const prop in voice) {
                        // Exclude dx7Patch object (contains non-serializable Uint8Array)
                        // Keep dx7PatchName and dx7PatchIndex for reconstruction
                        if (prop === 'dx7Patch') {
                            continue;
                        }
                        // Copy other properties
                        const value = voice[prop];
                        if (typeof value === 'object' && value !== null) {
                            voiceSnapshot[prop] = JSON.parse(JSON.stringify(value));
                        } else {
                            voiceSnapshot[prop] = value;
                        }
                    }
                    return voiceSnapshot;
                });
                continue;
            }

            // Deep clone the value to prevent reference issues
            const value = state[key];
            if (typeof value === 'object' && value !== null) {
                snapshot[key] = JSON.parse(JSON.stringify(value));
            } else {
                snapshot[key] = value;
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
        unifiedHistoryManager.pushSnapshot(debounced, 'baeng');
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

        // Check if sequencer is currently playing BEFORE restoration
        const wasPlaying = state.isPlaying;

        // Preserve currentStep values if sequencer is playing
        let preservedCurrentSteps = null;
        if (wasPlaying && state.sequences) {
            preservedCurrentSteps = [];
            for (let i = 0; i < state.sequences.length; i++) {
                preservedCurrentSteps[i] = state.sequences[i] ? state.sequences[i].currentStep : undefined;
            }
        }

        // Apply snapshot to state
        for (const key in snapshot) {
            if (state.hasOwnProperty(key)) {
                const newValue = snapshot[key];

                // Deep copy for objects/arrays
                if (typeof newValue === 'object' && newValue !== null) {
                    state[key] = JSON.parse(JSON.stringify(newValue));
                } else {
                    state[key] = newValue;
                }
            }
        }

        // Restore currentStep values ONLY if:
        // 1. Sequencer was playing before restoration
        // 2. We have preserved steps
        // 3. Sequences array exists after restoration
        // 4. Array lengths match (safety check)
        if (wasPlaying && preservedCurrentSteps && state.sequences &&
            preservedCurrentSteps.length === state.sequences.length) {
            for (let i = 0; i < state.sequences.length; i++) {
                if (state.sequences[i] && typeof preservedCurrentSteps[i] === 'number') {
                    state.sequences[i].currentStep = preservedCurrentSteps[i];
                }
            }
        }

        // ========== DX7 PATCH RECONSTRUCTION AFTER UNDO/REDO ==========
        // Reconstruct dx7Patch objects from bank for any DX7 voices
        // (dx7Patch was excluded from snapshot due to non-serializable Uint8Array)
        if (state.voices) {
            for (let i = 0; i < state.voices.length; i++) {
                const voice = state.voices[i];

                // Only reconstruct for DX7 voices that have a name/index but no patch object
                if (voice.engine === 'DX7' &&
                    voice.dx7PatchName &&
                    !voice.dx7Patch &&
                    voice.dx7PatchIndex !== null &&
                    voice.dx7PatchIndex !== undefined) {

                    // Determine which bank to use: per-voice bank or global bank
                    let bankToUse = null;
                    let bankSource = '';

                    if (voice.dx7Bank && Array.isArray(voice.dx7Bank) && voice.dx7Bank.length > 0) {
                        // Use per-voice bank if available
                        bankToUse = voice.dx7Bank;
                        bankSource = `per-voice bank "${voice.dx7BankName || 'unknown'}"`;
                    } else if (window.dx7Library && window.dx7Library.currentBank) {
                        // Fall back to global bank
                        bankToUse = window.dx7Library.currentBank;
                        bankSource = 'global bank';
                    }

                    if (!bankToUse) {
                        console.warn(`[History] No bank available to reconstruct DX7 patch for voice ${i}: "${voice.dx7PatchName}"`);
                        continue;
                    }

                    // Try to get patch from bank by index
                    const patchIndex = voice.dx7PatchIndex;
                    if (patchIndex >= 0 && patchIndex < bankToUse.length) {
                        voice.dx7Patch = bankToUse[patchIndex];
                    } else {
                        // Fallback: search by name if index is out of bounds
                        const patchName = voice.dx7PatchName.trim();
                        const patchData = bankToUse.find(p => {
                            const candidateName = (p.metadata?.voiceName || p.name || '').trim();
                            return candidateName.toLowerCase() === patchName.toLowerCase() ||
                                   candidateName.toLowerCase().startsWith(patchName.toLowerCase());
                        });

                        if (patchData) {
                            const newIndex = bankToUse.indexOf(patchData);
                            voice.dx7Patch = patchData;
                            voice.dx7PatchIndex = newIndex;
                        } else {
                            console.warn(`[History] Could not reconstruct DX7 patch for voice ${i}: "${voice.dx7PatchName}" in ${bankSource}`);
                        }
                    }
                }
            }
        }
        // ========== END DX7 PATCH RECONSTRUCTION ==========

        // ========== SYNC MODULATION BASEVALUES AFTER UNDO ==========
        // CRITICAL FIX: Sync baseValues with restored parameter values
        // This fixes the issue where baseValues become stale after undo
        this.syncModulationBaseValues();

        // Update UI components
        this.updateUI();

        // Reset modulation phase accumulators only (preserve sample-and-hold values)
        // This allows modulation to restart cleanly without losing configuration
        resetPhaseAccumulators();

        // Re-attach modulation click handlers (in case DOM was modified)
        if (typeof window.setupModulationClickHandlers === 'function') {
            window.setupModulationClickHandlers();
        }

        // Sync audio engine with restored state
        updateEngineParams();
    }

    /**
     * Sync modulation baseValues with restored parameter values
     * Call this after restoring snapshot to fix baseValue staleness
     */
    syncModulationBaseValues() {
        if (!state.perParamModulations) return;

        for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
            const paramDef = parameterDefinitions[paramId];
            if (!paramDef) continue;

            if (modConfig.isVoiceParam) {
                // Voice parameter: sync each voice's baseValue
                for (let voiceIndex = 0; voiceIndex < state.voices.length; voiceIndex++) {
                    const voiceConfig = modConfig.voices[voiceIndex];

                    // Only sync if modulation is actually enabled
                    if (voiceConfig && voiceConfig.enabled && voiceConfig.baseValue !== null) {
                        const currentValue = getParameterValue(paramId);
                        if (currentValue !== null) {
                            voiceConfig.baseValue = currentValue;
                        }
                    }
                }
            } else {
                // Effect parameter: sync global baseValue
                if (modConfig.enabled && modConfig.baseValue !== null) {
                    const currentValue = getParameterValue(paramId);
                    if (currentValue !== null) {
                        modConfig.baseValue = currentValue;
                    }
                }
            }
        }
    }

    /**
     * Update UI after restoring a snapshot
     */
    updateUI() {
        // This will be filled in when integrated with main.js
        // For now, trigger a full UI update
        if (typeof window.updateAllUI === 'function') {
            window.updateAllUI();
        }

        // Update special UI elements
        this.updateSpecialUIElements();
    }

    /**
     * Update UI elements that require special handling
     */
    updateSpecialUIElements() {
        // Update engine selector buttons
        const engineModule = document.getElementById('baeng-engine');
        if (engineModule && state.selectedVoice >= 0 && state.selectedVoice < state.voices.length) {
            const selectedVoice = state.voices[state.selectedVoice];
            engineModule.querySelectorAll('.baeng-app .engine-button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.engine === selectedVoice.engine);
            });
        }

        // Update edit mode buttons
        const editModeButtons = document.querySelectorAll('.baeng-app .edit-mode-toggle .toggle-button');
        editModeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === state.editMode);
        });

        // Update delay sync toggle
        const delaySyncToggle = document.querySelector('.baeng-app .delay-sync-toggle');
        if (delaySyncToggle) {
            const syncLabel = state.delaySyncEnabled ? 'SYNC' : 'FREE';
            delaySyncToggle.textContent = syncLabel;
            delaySyncToggle.classList.toggle('active', state.delaySyncEnabled);
        }

        // Update reset sequence button
        const resetBtn = document.querySelector('.baeng-app .seq-reset');
        if (resetBtn) {
            resetBtn.classList.toggle('active', state.resetSequenceOnBar);
        }

        // Update voice selector buttons
        document.querySelectorAll('.baeng-app .voice-selector').forEach((btn, i) => {
            btn.classList.toggle('active', i === state.selectedVoice);
        });

        document.querySelectorAll('.baeng-app .voice-row').forEach((row, i) => {
            row.classList.toggle('selected', i === state.selectedVoice);
        });
    }

    /**
     * Initialize and register with unified history manager
     */
    initialize() {

        // Register Bæng's state and restore callback with unified manager
        unifiedHistoryManager.registerBaeng(state, () => {
            // Restore callback - called when unified manager restores state
            this.syncModulationBaseValues();
            this.updateUI();
            resetPhaseAccumulators();

            // Re-attach modulation click handlers
            if (typeof window.setupModulationClickHandlers === 'function') {
                window.setupModulationClickHandlers();
            }

            // Sync audio engine
            updateEngineParams();
        });

        // Initialise unified history after both apps registered
        // Check if Ræmbl is already registered before initialising
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
