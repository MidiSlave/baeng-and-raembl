// File: js/modules/time.js
// Clock/timing module for Bæng

import { state } from '../state.js';
import { config } from '../config.js';
import { triggerStep, triggerStepDirect } from './sequence.js';
import { releaseAllVoices } from './engine.js';
import { updateSequenceUI } from '../main.js'; // Import from main.js

// Audio-thread scheduler configuration
const LOOKAHEAD_TIME = 0.1; // Schedule 100ms ahead (in seconds)
const SCHEDULE_INTERVAL = 25; // Check every 25ms for steps to schedule
let nextStepTime = 0; // When the next step should fire (in audio context time)
let schedulerIntervalId = null;

// Toggle play/stop
export function togglePlay() {
    state.isPlaying = !state.isPlaying;

    const playButton = document.querySelector('.baeng-app .play-button');

    if (state.isPlaying) {
        // Reset counters and sequence positions if starting from a fully stopped state
        // or if it's the very first play.
        // If resuming from a pause, we might want to keep the current position.
        // For now, let's always reset on play for simplicity, like a tape machine.

        state.stepCounter = -1; // Will advance to 0 on the first step
        state.barCounter = 0;   // Overall bar count for the entire pattern
        state.currentStepIndex = -1; // Will be updated to reflect the global step

        state.displayBar = 1;
        state.displayBeat = 1;
        state.displayStep = 1;
        state.isBarStart = true; // Mark true for the immediate first step if applicable

        // Reset sequence positions for all voices to their respective start points
        for (let i = 0; i < state.sequences.length; i++) {
            const seq = state.sequences[i];
            // Set to length-1 so it wraps to 0 on the first triggerStep call
            seq.currentStep = seq.length > 0 ? seq.length - 1 : -1;
        }

        // Initialize audio-thread scheduler
        if (config.audioContext) {
            // Set next step time to slightly in the future (50ms) to give time for first schedule
            nextStepTime = config.audioContext.currentTime + 0.05;
        }

        config.currentMsPerStep = (60000 / state.bpm) / state.stepsPerBeat; // Initial calculation

        // Start the audio-thread scheduler
        if (!schedulerIntervalId) {
            schedulerIntervalId = setInterval(scheduler, SCHEDULE_INTERVAL);
        }

        if (playButton) {
            playButton.innerHTML = '■'; // Square for stop
            playButton.classList.add('active');
        }
    } else { // STOPPING
        // Stop the audio-thread scheduler
        if (schedulerIntervalId) {
            clearInterval(schedulerIntervalId);
            schedulerIntervalId = null;
        }

        // state.currentStepIndex remains to show where it stopped.
        // Reset display to a neutral state or last known position.
        // state.displayBar = 1; // Or show last known position
        // state.displayBeat = 1;
        // state.displayStep = 1;
        state.isBarStart = false;

        if (playButton) {
            playButton.innerHTML = '▶'; // Triangle for play
            playButton.classList.remove('active');
        }

        const displayBox = document.querySelector('#time .display-box');
        if (displayBox) displayBox.textContent = '---';

        releaseAllVoices(); // Release any held sounds from engine.js

        // Update sequence UI to show current step (no longer active if stopped)
        // Pass false to indicate playback has stopped for UI updates.
        if (typeof updateSequenceUI === 'function') {
            updateSequenceUI();
        }
    }
}

// Audio-thread scheduler with lookahead
// This is called every SCHEDULE_INTERVAL ms to check if we need to schedule upcoming steps
function scheduler() {
    if (!state.isPlaying || !config.audioContext) {
        return;
    }

    const currentTime = config.audioContext.currentTime;

    // Schedule all steps that fall within the lookahead window
    while (nextStepTime < currentTime + LOOKAHEAD_TIME) {
        // Increment step counter FIRST (before calculating swing)
        state.stepCounter++;

        // Handle pattern looping
        const stepsPerPattern = state.barLength * state.stepsPerBeat;
        if (state.stepCounter >= stepsPerPattern) {
            state.stepCounter = 0;
            state.barCounter++;
            state.isBarStart = true;
        } else {
            state.isBarStart = false;
        }

        // NOW calculate swing offset for the step we're about to schedule
        const msPerStepBase = (60000 / state.bpm) / state.stepsPerBeat;
        const stepDuration = msPerStepBase / 1000; // Convert to seconds

        let swingOffset = 0;
        if (state.swing > 0) {
            const swingRatio = state.swing / 100;
            // stepCounter is now 0, 1, 2, 3... so odd steps (1, 3, 5...) are off-beats
            const isOffBeat = state.stepCounter % 2 === 1;

            if (isOffBeat) {
                // Delay off-beats - standard drum machine swing
                // Max delay is 50% of a step for 100% swing
                swingOffset = (stepDuration / 2) * swingRatio;
            }
        }

        // Store for use by engine (e.g. ratchet timing)
        config.currentMsPerStep = msPerStepBase;

        // Schedule the step at the swung time (base time + swing offset)
        scheduleStep(nextStepTime + swingOffset);

        // Advance clock by BASE step duration (no swing) to maintain steady tempo
        nextStepTime += stepDuration;
    }
}

// Schedule a single step to fire at the specified audio time
function scheduleStep(audioTime) {
    const stepsPerPattern = state.barLength * state.stepsPerBeat;
    const currentGlobalStepInBar = state.stepCounter;

    // Reset sequences on bar start if enabled
    if (state.isBarStart && state.resetSequenceOnBar) {
        for (let voiceIndex = 0; voiceIndex < state.sequences.length; voiceIndex++) {
            const seq = state.sequences[voiceIndex];
            seq.currentStep = seq.length > 0 ? seq.length - 1 : -1;
        }
    }

    // PHASE 1: Collect all potential triggers for this global step
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
                let deviationHappened = false;

                if (step.gate && step.deviation > 0 && sequence.length > 1) {
                    // Store diagnostic info
                    state.lastDiagnostic = {
                        deviationChecked: true,
                        deviationAmount: step.deviation,
                        voiceIndex,
                        stepIndex,
                        shouldDeviate: false,
                        actuallyDeviated: false
                    };

                    // FORCE deviation to always happen with 100%
                    if (step.deviation === 100) {
                        deviationHappened = true;

                        // Update diagnostic info
                        state.lastDiagnostic.shouldDeviate = true;
                        state.lastDiagnostic.actuallyDeviated = true;

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
                            deviationHappened = true;
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
                        }
                    }
                }

                // Store this potential trigger with deviation info
                potentialTriggers.push({
                    voiceIndex,
                    step: actualStepToTrigger,
                    stepIndex: actualStepIndex,
                    chokeGroup: state.voices[voiceIndex].chokeGroup || 0,
                    originalStep: step,
                    originalStepIndex: stepIndex,
                    deviated: deviationHappened
                });
            }
        }
    }

    // PHASE 2: Apply choke group rules
    const chokeGroups = new Map();
    const finalTriggers = [];

    // First, add all voices that don't belong to a choke group
    potentialTriggers.forEach(trigger => {
        if (trigger.chokeGroup === 0) {
            finalTriggers.push(trigger);
        } else {
            // For choke groups, store in map for further processing
            if (!chokeGroups.has(trigger.chokeGroup)) {
                chokeGroups.set(trigger.chokeGroup, []);
            }
            chokeGroups.get(trigger.chokeGroup).push(trigger);
        }
    });

    // For each choke group, only keep the highest priority voice (lowest index)
    chokeGroups.forEach((triggers, chokeGroupId) => {
        // Sort by voice index (priority) - lower index = higher priority
        triggers.sort((a, b) => a.voiceIndex - b.voiceIndex);
        // Add only the highest priority voice to final triggers
        if (triggers.length > 0) {
            finalTriggers.push(triggers[0]);
        }
    });

    // PHASE 3: Trigger the final list of voices at the specified audio time
    finalTriggers.forEach(trigger => {
        // Call our direct trigger function that bypasses gate/probability checks
        // If this is a deviated step, merge parameter locks from original step
        if (trigger.deviated) {
            // Create a new step object with merged parameter locks
            const combinedStep = { ...trigger.step };
            combinedStep.gate = true;
            combinedStep.deviation = trigger.originalStep ? trigger.originalStep.deviation : 0;
            combinedStep.deviationMode = trigger.originalStep ? trigger.originalStep.deviationMode : 1;

            // Keep the accent from the original step
            if (trigger.originalStep) {
                combinedStep.accent = trigger.originalStep.accent;
            }

            // TRIGGER at specified audio time
            triggerStepDirect(trigger.voiceIndex, combinedStep, audioTime);
        } else {
            // Normal trigger (not deviated)
            triggerStepDirect(trigger.voiceIndex, trigger.step, audioTime);
        }
    });

    // Schedule UI update to happen at the right time
    // We need to delay this to sync with the audio
    const delayMs = (audioTime - config.audioContext.currentTime) * 1000;
    setTimeout(() => {
        if (!state.isPlaying) return; // Don't update if stopped

        // Update display state
        state.currentStepIndex = currentGlobalStepInBar;

        // Store any deviated step information for UI feedback
        state.deviatedTriggers = finalTriggers
            .filter(t => t.deviated)
            .map(t => ({
                voiceIndex: t.voiceIndex,
                originalStepIndex: t.originalStepIndex,
                actualStepIndex: t.stepIndex
            }));

        // Display bar should reflect the barCounter for the main pattern
        state.displayBar = state.barCounter + 1;
        state.displayBeat = Math.floor(currentGlobalStepInBar / state.stepsPerBeat) + 1;
        state.displayStep = (currentGlobalStepInBar % state.stepsPerBeat) + 1;

        const displayBox = document.querySelector('#time .display-box');
        if (displayBox) {
            displayBox.textContent = `${state.displayBar}.${state.displayBeat}.${state.displayStep}`;
        }

        if (typeof updateSequenceUI === 'function') {
            updateSequenceUI();
        }
    }, Math.max(0, delayMs));
}

// Initialize the clock
export function initTime() {
    // Initial calculation, will be updated dynamically by runClock if BPM/Swing changes
    config.currentMsPerStep = (60000 / state.bpm) / state.stepsPerBeat;
}

// Diagnostic function to check deviation
window.diagnoseDeviation = function() {
    
    // Check for steps with deviation enabled
    let stepsWithDeviation = [];
    for (let i = 0; i < state.sequences.length; i++) {
        const seq = state.sequences[i];
        for (let j = 0; j < seq.steps.length; j++) {
            if (seq.steps[j].gate && seq.steps[j].deviation > 0) {
                stepsWithDeviation.push({
                    voiceIndex: i,
                    stepIndex: j,
                    deviation: seq.steps[j].deviation
                });
            }
        }
    }
    
    
    return {
        diagnostic: state.lastDiagnostic,
        deviatedTriggers: state.deviatedTriggers,
        stepsWithDeviation
    };
};

// Force setting 100% deviation on a specific step for testing
window.forceDeviation = function(voiceIndex, stepIndex) {
    if (voiceIndex >= 0 && voiceIndex < state.sequences.length &&
        stepIndex >= 0 && stepIndex < state.sequences[voiceIndex].steps.length) {
        
        // Ensure the step has gate ON
        state.sequences[voiceIndex].steps[stepIndex].gate = true;
        // Set 100% deviation
        state.sequences[voiceIndex].steps[stepIndex].deviation = 100;
        
        return true;
    }
    
    return false;
};