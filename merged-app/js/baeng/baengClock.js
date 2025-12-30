// File: js/baeng/baengClock.js
// Bæng clock subscriber - handles step events from shared clock

import { subscribe } from '../shared/clock.js';
import { state, parameterDefinitions } from './state.js';
import { triggerStepDirect } from './modules/sequence.js';
import { sharedAudioContext } from '../shared/audio.js';

let unsubscribe = null;

// Initialize Bæng clock subscriber
export function initBaengClock() {

    // Subscribe to shared clock events
    unsubscribe = subscribe((event) => {
        try {
            handleClockEvent(event);
        } catch (error) {
            console.error('[BaengClock] Error in clock event handler:', error);
        }
    });
}

// Cleanup function (for potential future use)
export function cleanupBaengClock() {
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
        case 'baengBarLengthChange':
            handleBaengBarLengthChange(event);
            break;
        case 'raemblBarLengthChange':
            // Ignore Ræmbl bar length changes in Bæng clock
            break;
        default:
            // Silently ignore unknown event types (could be for other apps)
    }
}

// Handle play event
function handlePlayEvent(event) {

    // Reset sequence positions for all voices to their respective start points
    for (let i = 0; i < state.sequences.length; i++) {
        const seq = state.sequences[i];
        // Set to length-1 so it wraps to 0 on the first step
        seq.currentStep = seq.length > 0 ? seq.length - 1 : -1;
    }
}

// Handle stop event
function handleStopEvent(event) {
}

// Handle step event
function handleStepEvent(event) {
    const { audioTime, stepCounter, barCounter } = event;

    // Use Bæng-specific position data from polymetric clock
    const baengData = event.baeng || { stepIndex: event.stepIndex, isBarStart: event.isBarStart };
    const { stepIndex, isBarStart } = baengData;

    // Update local state for UI
    state.currentStepIndex = stepIndex;
    state.isBarStart = isBarStart;
    state.stepCounter = stepCounter;
    state.barCounter = barCounter;

    // Reset sequences on bar start if enabled (using Bæng's bar boundary)
    if (isBarStart && state.resetSequenceOnBar) {
        for (let voiceIndex = 0; voiceIndex < state.sequences.length; voiceIndex++) {
            const seq = state.sequences[voiceIndex];
            seq.currentStep = seq.length > 0 ? seq.length - 1 : -1;
        }
    }

    // Collect all potential triggers for this global step
    let potentialTriggers = [];

    for (let voiceIndex = 0; voiceIndex < state.sequences.length; voiceIndex++) {
        const sequence = state.sequences[voiceIndex];

        // Update the current step for this voice's sequence
        sequence.currentStep = (sequence.currentStep + 1) % sequence.length;

        // Get the step data for this voice's current position
        const stepIndex = sequence.currentStep;
        const step = sequence.steps[stepIndex];

        // Check if this step should trigger (gate and probability)
        if (step && step.gate) {
            // Apply per-voice probability first
            let shouldTrigger = true;
            if (sequence.probability < 100) {
                shouldTrigger = (Math.random() * 100 <= sequence.probability);
            }

            // Then apply per-step probability
            if (shouldTrigger && step.probability < 100) {
                shouldTrigger = (Math.random() * 100 <= step.probability);
            }

            if (shouldTrigger) {
                // Check for deviation - should we trigger a different step instead?
                let actualStepToTrigger = step;
                let actualStepIndex = stepIndex;

                if (step.gate && step.deviation > 0 && sequence.length > 1) {
                    // FORCE deviation to always happen with 100%
                    if (step.deviation === 100) {
                        // Randomly choose earlier or later step
                        const goEarlier = Math.random() < 0.5;

                        if (goEarlier) {
                            // Trigger previous step
                            const prevIndex = (stepIndex - 1 + sequence.length) % sequence.length;
                            actualStepIndex = prevIndex;
                            actualStepToTrigger = sequence.steps[prevIndex];
                        } else {
                            // Trigger next step
                            const nextIndex = (stepIndex + 1) % sequence.length;
                            actualStepIndex = nextIndex;
                            actualStepToTrigger = sequence.steps[nextIndex];
                        }
                    } else {
                        // For other percentages, use probability
                        const deviationRoll = Math.random() * 100;
                        const shouldDeviate = deviationRoll <= step.deviation;

                        if (shouldDeviate) {
                            // Randomly choose earlier or later step
                            const goEarlier = Math.random() < 0.5;

                            if (goEarlier) {
                                const prevIndex = (stepIndex - 1 + sequence.length) % sequence.length;
                                actualStepIndex = prevIndex;
                                actualStepToTrigger = sequence.steps[prevIndex];
                            } else {
                                const nextIndex = (stepIndex + 1) % sequence.length;
                                actualStepIndex = nextIndex;
                                actualStepToTrigger = sequence.steps[nextIndex];
                            }
                        }
                    }
                }

                // Store this potential trigger
                potentialTriggers.push({
                    voiceIndex,
                    step: actualStepToTrigger,
                    stepIndex: actualStepIndex
                });
            }
        }
    }

    // Process choke groups to ensure only one voice per group triggers
    const chokeGroupTriggers = {};
    const finalTriggers = [];

    for (const trigger of potentialTriggers) {
        const voice = state.voices[trigger.voiceIndex];
        const chokeGroup = voice.chokeGroup || 0;

        if (chokeGroup > 0) {
            // If this choke group hasn't been triggered yet, use this trigger
            if (!chokeGroupTriggers[chokeGroup]) {
                chokeGroupTriggers[chokeGroup] = trigger;
                finalTriggers.push(trigger);
            }
            // Otherwise, skip this trigger (choke group already triggered)
        } else {
            // No choke group, always trigger
            finalTriggers.push(trigger);
        }
    }

    // Trigger all final triggers at the precise audio time
    for (const trigger of finalTriggers) {
        triggerStepDirect(trigger.voiceIndex, trigger.step, audioTime);
    }

    // Schedule UI update to sync with audio time
    const currentTime = sharedAudioContext.currentTime;
    const delayMs = Math.max(0, (audioTime - currentTime) * 1000);

    setTimeout(() => {
        // UI update will be handled by the main app
        // Dispatch event to notify UI of step change
        const stepEvent = new CustomEvent('baengStepAdvanced', {
            detail: { stepIndex, isBarStart }
        });
        document.dispatchEvent(stepEvent);
    }, delayMs);
}

// Handle BPM change event
function handleBPMChange(event) {
    // Update local state (shared state is updated by proxy)
    state.bpm = event.bpm;
    // Update UI - find BPM knob and update its display
    updateTimingKnobDisplay('BPM', event.bpm);
}

// Handle SWING change event
function handleSwingChange(event) {
    // Update local state (shared state is updated by proxy)
    state.swing = event.swing;
    // Update UI - find SWING knob and update its display
    updateTimingKnobDisplay('SWING', event.swing);
}

// Handle Bæng bar length change event
function handleBaengBarLengthChange(event) {
    // Update local state (shared state is updated by proxy)
    state.baengBarLength = event.barLength;
    // TIME module removed - time strip handles its own display updates
}

// Helper function to update timing knob displays
function updateTimingKnobDisplay(label, value) {
    // Find the TIME module
    const timeModule = document.getElementById('time');
    if (!timeModule) return;

    // Find the knob with matching data-label
    const knob = timeModule.querySelector(`.knob[data-label="${label}"]`);
    if (!knob) return;

    // Find the container and value display
    const container = knob.closest('.knob-container');
    if (!container) return;

    const valueDisplay = container.querySelector('.knob-value');
    if (!valueDisplay) return;

    // Get parameter definition for this label
    const paramId = `time.${label.toLowerCase()}`;
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) return;

    // Calculate knob rotation
    const min = paramDef.min || 0;
    const max = paramDef.max || 100;
    const normalised = (value - min) / (max - min);
    const rotation = -135 + (normalised * 270);

    // Update knob visual
    knob.style.setProperty('--knob-rotation', `${rotation}deg`);

    // Update value display (round to integer if step is 1, otherwise use appropriate precision)
    const unit = paramDef.unit || '';
    const displayValue = (paramDef.step && paramDef.step >= 1) ? Math.round(value) : value;
    valueDisplay.textContent = `${displayValue}${unit}`;
}
