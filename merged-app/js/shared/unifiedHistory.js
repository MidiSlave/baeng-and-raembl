// File: merged-app/js/shared/unifiedHistory.js
// Unified Undo/Redo History Manager for Bæng & Ræmbl
// Single history stack tracking changes across both apps

import { sharedState } from '../state.js';

class UnifiedHistoryManager {
    constructor() {
        this.history = [];
        this.currentIndex = -1;
        this.maxHistorySize = 100;

        // References to app-specific state and restore functions
        this.baengState = null;
        this.raemblState = null;
        this.baengRestoreCallback = null;
        this.raemblRestoreCallback = null;

        // Transient properties to exclude from snapshots (timing, playback, UI runtime)
        this.transientProperties = [
            // Shared timing (runtime state)
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

            // Bæng runtime
            'isDragging',
            'editMode',
            'tempEditMode',
            'deviatedTriggers',
            'lastDiagnostic',
            'modEditMode',
            'voiceLFOs',
            'parameterSmoothingMetadata',

            // Ræmbl runtime
            'factorsPatternPos',
            'lfoValue',
            'modLfoValue',
            'sample',
            'prevSample',
            'currentNote',
            'triggerSample',
            'sampleTime',
            'isTransitioning',
            'lfoStartTime',
            'gatePattern',
            'accentPattern',
            'slidePattern',
            'trillPattern'
        ];

        // Debounce timer for rapid updates
        this.debounceTimer = null;
        this.debounceDelay = 300; // ms

        // Track which app made the last change (for debugging)
        this.lastChangeSource = null;
    }

    /**
     * Register Bæng state and restore callback
     */
    registerBaeng(state, restoreCallback) {
        this.baengState = state;
        this.baengRestoreCallback = restoreCallback;
    }

    /**
     * Register Ræmbl state and restore callback
     */
    registerRaembl(state, restoreCallback) {
        this.raemblState = state;
        this.raemblRestoreCallback = restoreCallback;
    }

    /**
     * Create a snapshot of a state object, filtering out transient properties
     */
    createAppSnapshot(appState, appName) {
        if (!appState) return null;

        const snapshot = {};

        for (const key in appState) {
            if (this.transientProperties.includes(key)) {
                continue; // Skip transient properties
            }

            // Special handling for sequences (exclude currentStep)
            if (key === 'sequences' && Array.isArray(appState.sequences)) {
                snapshot.sequences = appState.sequences.map(seq => {
                    const seqSnapshot = JSON.parse(JSON.stringify(seq));
                    delete seqSnapshot.currentStep; // Runtime property
                    return seqSnapshot;
                });
                continue;
            }

            // Special handling for voices array (exclude dx7Patch objects)
            if (key === 'voices' && Array.isArray(appState.voices)) {
                snapshot.voices = appState.voices.map(voice => {
                    const voiceSnapshot = {};
                    for (const prop in voice) {
                        // Exclude dx7Patch object (contains non-serializable Uint8Array)
                        if (prop === 'dx7Patch') continue;
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
            const value = appState[key];
            if (typeof value === 'object' && value !== null) {
                try {
                    snapshot[key] = JSON.parse(JSON.stringify(value));
                } catch (e) {
                    // Skip non-serialisable properties
                    console.warn(`[Unified History] Skipping non-serialisable property: ${appName}.${key}`);
                }
            } else {
                snapshot[key] = value;
            }
        }

        return snapshot;
    }

    /**
     * Create a unified snapshot of both apps
     */
    createSnapshot() {
        return {
            baeng: this.createAppSnapshot(this.baengState, 'baeng'),
            raembl: this.createAppSnapshot(this.raemblState, 'raembl'),
            sharedTiming: {
                bpm: sharedState.bpm,
                swing: sharedState.swing,
                baengBarLength: sharedState.baengBarLength,
                raemblBarLength: sharedState.raemblBarLength,
                stepsPerBeat: sharedState.stepsPerBeat,
                baengTempoMultiplier: sharedState.baengTempoMultiplier,
                raemblTempoMultiplier: sharedState.raemblTempoMultiplier
            }
        };
    }

    /**
     * Push a new snapshot to the history stack
     * @param {boolean} debounced - Whether to debounce rapid changes
     * @param {string} source - Which app triggered the change ('baeng' | 'raembl' | 'shared')
     */
    pushSnapshot(debounced = false, source = 'unknown') {
        if (debounced) {
            // Clear existing debounce timer
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            // Set new debounce timer
            this.debounceTimer = setTimeout(() => {
                this.pushSnapshot(false, source);
            }, this.debounceDelay);
            return;
        }

        const snapshot = this.createSnapshot();

        // Check if snapshot is different from current state
        if (this.currentIndex >= 0) {
            const currentSnapshot = this.history[this.currentIndex];
            const currentStr = JSON.stringify(currentSnapshot);
            const newStr = JSON.stringify(snapshot);
            if (currentStr === newStr) {
                // No change, don't push
                return;
            }
        }

        // Remove any redo history
        this.history = this.history.slice(0, this.currentIndex + 1);

        // Add new snapshot
        this.history.push(snapshot);
        this.currentIndex++;
        this.lastChangeSource = source;

        // Enforce max history size
        if (this.history.length > this.maxHistorySize) {
            this.history.shift();
            this.currentIndex--;
        }
    }

    /**
     * Check if undo is possible
     */
    canUndo() {
        return this.currentIndex > 0;
    }

    /**
     * Check if redo is possible
     */
    canRedo() {
        return this.currentIndex < this.history.length - 1;
    }

    /**
     * Undo to previous snapshot
     */
    undo() {
        if (!this.canUndo()) {
            return false;
        }

        // If we're at the latest state, save it before going back
        if (this.currentIndex === this.history.length - 1) {
            const currentSnapshot = this.createSnapshot();
            if (JSON.stringify(this.history[this.currentIndex]) !== JSON.stringify(currentSnapshot)) {
                this.history.push(currentSnapshot);
            }
        }

        this.currentIndex--;
        this.restoreSnapshot(this.history[this.currentIndex]);
        return true;
    }

    /**
     * Redo to next snapshot
     */
    redo() {
        if (!this.canRedo()) {
            return false;
        }

        this.currentIndex++;
        this.restoreSnapshot(this.history[this.currentIndex]);
        return true;
    }

    /**
     * Restore a unified snapshot
     */
    restoreSnapshot(snapshot) {
        if (!snapshot) {
            console.error('[Unified History] Invalid snapshot');
            return;
        }

        // Restore shared timing
        if (snapshot.sharedTiming) {
            Object.assign(sharedState, snapshot.sharedTiming);
        }

        // Restore Bæng state
        if (snapshot.baeng && this.baengState && this.baengRestoreCallback) {
            this.restoreAppState(this.baengState, snapshot.baeng);
            this.baengRestoreCallback();
        }

        // Restore Ræmbl state
        if (snapshot.raembl && this.raemblState && this.raemblRestoreCallback) {
            this.restoreAppState(this.raemblState, snapshot.raembl);
            this.raemblRestoreCallback();
        }
    }

    /**
     * Restore state for a single app
     */
    restoreAppState(appState, snapshot) {
        for (const key in snapshot) {
            if (appState.hasOwnProperty(key)) {
                const newValue = snapshot[key];

                // Deep copy for objects/arrays
                if (typeof newValue === 'object' && newValue !== null) {
                    appState[key] = JSON.parse(JSON.stringify(newValue));
                } else {
                    appState[key] = newValue;
                }
            }
        }
    }

    /**
     * Initialise with current state
     */
    initialize() {
        this.pushSnapshot(false, 'init');
    }

    /**
     * Clear all history
     */
    clear() {
        this.history = [];
        this.currentIndex = -1;
    }
}

// Create and export singleton instance
export const unifiedHistoryManager = new UnifiedHistoryManager();

// Also expose on window for keyboard handlers
if (typeof window !== 'undefined') {
    window.unifiedHistoryManager = unifiedHistoryManager;
}
