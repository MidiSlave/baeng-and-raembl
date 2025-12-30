// File: js/raembl/raemblClock.js
// Ræmbl clock subscriber - handles step events from shared clock

import { subscribe } from '../shared/clock.js';
import { state } from './state.js';
import { config } from './config.js';
import { handleSampleTrigger } from './modules/path.js';
import { updatePatternDisplay } from './modules/factors.js';
import { sharedAudioContext } from '../shared/audio.js';
import { releaseAllVoices } from './audio.js';

let unsubscribe = null;

// Initialize Ræmbl clock subscriber
export function initRaemblClock() {

    // Subscribe to shared clock events
    unsubscribe = subscribe((event) => {
        try {
            handleClockEvent(event);
        } catch (error) {
            console.error('[RaemblClock] Error in clock event handler:', error);
        }
    });
}

// Cleanup function (for potential future use)
export function cleanupRaemblClock() {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
}

// Handle clock events
function handleClockEvent(event) {
    switch (event.type) {
        case 'play':
            handlePlayEvent(event);
            break;
        case 'stop':
            handleStopEvent(event);
            break;
        case 'step':
            handleStepEvent(event);
            break;
        case 'bpmChange':
            handleBPMChange(event);
            break;
        case 'swingChange':
            handleSwingChange(event);
            break;
        case 'raemblBarLengthChange':
            handleRaemblBarLengthChange(event);
            break;
        case 'baengBarLengthChange':
            // Ignore Bæng bar length changes in Ræmbl clock
            break;
        default:
            // Silently ignore unknown event types (could be for other apps)
    }
}

// Handle play event
function handlePlayEvent(event) {

    // Reset factors pattern position to -1 (will advance to 0 on first step)
    state.factorsPatternPos = -1;
}

// Handle stop event
function handleStopEvent(event) {

    // Release all active voices so notes don't hang
    releaseAllVoices();

    // Update pattern display to show stopped state
    updatePatternDisplay();
}

// Handle step event
function handleStepEvent(event) {
    const { audioTime, stepCounter, barCounter } = event;

    // Use Ræmbl-specific position data from polymetric clock
    const raemblData = event.raembl || { stepIndex: event.stepIndex, isBarStart: event.isBarStart, bar: barCounter + 1, beat: 1, subStep: 1 };
    const { stepIndex, isBarStart, bar, beat, subStep } = raemblData;

    // Calculate swing-adjusted step duration for trill timing
    const msPerStep = (60000 / state.bpm) / state.stepsPerBeat;
    const isCurrentStepOffbeat = (stepIndex % 2) === 1;
    let adjustedMsPerStep = msPerStep;

    if (state.swing > 0) {
        const swingAmount = (state.swing / 100) * msPerStep * 0.5;
        if (isCurrentStepOffbeat) {
            adjustedMsPerStep = Math.max(msPerStep * 0.5, msPerStep - swingAmount);
        } else {
            adjustedMsPerStep = msPerStep + swingAmount;
        }
    }

    config.currentMsPerStep = adjustedMsPerStep;

    // Calculate current bar step (within the bar) using Ræmbl's bar length
    const stepsPerBar = state.stepsPerBeat * state.raemblBarLength;
    const currentBarStep = stepIndex;

    // Update separate pattern position for factors (using Ræmbl's bar boundary)
    if (isBarStart && state.resetFactorsOnBar) {
        state.factorsPatternPos = 0;
    } else {
        if (state.factorsPatternPos === -1 || state.gatePattern.length === 0) {
            // Handle empty pattern
            state.factorsPatternPos = 0;
        } else {
            state.factorsPatternPos = (state.factorsPatternPos + 1) % state.gatePattern.length;
        }
    }

    // Update state for UI (using Ræmbl's per-app display data)
    state.currentStepIndex = state.factorsPatternPos;
    state.displayBar = bar;
    state.displayBeat = beat;
    state.displayStep = subStep;
    state.isBarStart = isBarStart;

    // Check trigger from pattern
    const shouldTrigger = state.gatePattern.length > 0 &&
                         (state.gatePattern[state.currentStepIndex] || false);

    // Handle bar start reset for LFO if enabled
    if (isBarStart) {
        if (state.resetLfoOnBar) {
            state.lfoStartTime = performance.now();
            // Redraw LFO to reflect phase reset (if draw function is available)
            import('./modules/lfo.js').then(lfoModule => {
                if (typeof lfoModule.drawLfo === 'function') {
                    lfoModule.drawLfo();
                }
            }).catch(err => console.error('[RaemblClock] Error importing lfo module:', err));
        }
    }

    // Handle sample trigger if gate is active
    if (shouldTrigger) {
        state.triggerSample = true;

        // Call handleSampleTrigger with audioTime parameter
        handleSampleTrigger(audioTime);

        // Reset trigger flag after this tick
        setTimeout(() => {
            state.triggerSample = false;
        }, 0);
    }

    // Schedule UI update to sync with audio time
    const currentTime = sharedAudioContext.currentTime;
    const delayMs = Math.max(0, (audioTime - currentTime) * 1000);

    setTimeout(() => {
        // Update display
        const displayBox = document.querySelector('.raembl-app .display-box');
        if (displayBox) {
            displayBox.textContent = `${state.displayBar}.${state.displayBeat}.${state.displayStep}`;
        }

        // Update pattern display
        updatePatternDisplay();

        // Dispatch event to notify UI of step change
        const stepEvent = new CustomEvent('raemblStepAdvanced', {
            detail: { stepIndex: state.currentStepIndex, isBarStart }
        });
        document.dispatchEvent(stepEvent);
    }, delayMs);
}

// Handle BPM change event
function handleBPMChange(event) {
    // Update local state (shared state is updated by proxy)
    state.bpm = event.bpm;
    // Time strip handles its own display updates
}

// Handle SWING change event
function handleSwingChange(event) {
    // Update local state (shared state is updated by proxy)
    state.swing = event.swing;
    // Time strip handles its own display updates
}

// Handle Ræmbl bar length change event
function handleRaemblBarLengthChange(event) {
    // Update local state (shared state is updated by proxy)
    state.raemblBarLength = event.barLength;
    // Time strip handles its own display updates
}
