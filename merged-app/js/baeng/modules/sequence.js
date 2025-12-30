// File: js/modules/sequence.js
// Sequencer module for Bæng

import { state } from '../state.js';
import { config } from '../config.js';
import { triggerVoice } from './engine.js';
import { initEuclidean } from './euclidean.js';

// Direct trigger function for use with choke group handling
export function triggerStepDirect(voiceIndex, step, scheduledTime = null) {

    // Ensure step has required properties
    if (!step) {
        return;
    }

    // Make sure step has gate enabled
    if (!step.gate) {
        step.gate = true;
    }

    // Ratchet count (number of triggers for this step)
    const ratchetCount = step.ratchet + 1;

    // Step duration in seconds
    const stepDuration = config.currentMsPerStep / 1000;

    // Check if this is a flam (deviation=20, mode=0)
    const isFlam = step.deviation === 20 && step.deviationMode === 0;

    // Dispatch track trigger event for per-parameter modulation
    const trackTriggerEvent = new CustomEvent('trackTriggered', {
        detail: {
            trackIndex: voiceIndex,
            accentLevel: step.accent || 0,
            isBarStart: state.isBarStart || false
        }
    });
    document.dispatchEvent(trackTriggerEvent);

    if (isFlam) {

        // Flam: trigger TWO notes - grace note (quiet, early) + primary note (accented, on-beat)
        const graceNoteLag = 0.015; // 15ms offset - tight flam timing (discovered via isolated test)

        // Grace note - quiet, early (plays BEFORE primary)
        triggerVoice(
            voiceIndex,
            0,  // No accent on grace note
            1,  // Single trigger
            stepDuration,
            false, // Not deviated
            0, // Deviation mode doesn't matter
            graceNoteLag, // 15ms EARLY via fixedTimingOffset (now works with scheduling buffer!)
            0.18, // Velocity multiplier: 0.56 accent × 0.18 velocity = ~10% final volume (discovered via isolated test)
            true, // Skip voice release - allow grace note to continue
            scheduledTime // Pass through scheduled time from audio-thread scheduler
        );

        // Primary note - accented, on-beat (plays AFTER grace note)
        triggerVoice(
            voiceIndex,
            10,  // Full accent on primary note
            1,  // Single trigger
            stepDuration,
            false, // Not deviated (on-beat)
            1, // Deviation mode doesn't matter
            0, // NO OFFSET - plays on the beat
            1.0, // Full velocity
            true, // Skip voice release - layer with grace note
            scheduledTime // Pass through scheduled time from audio-thread scheduler
        );
    } else {
        // Normal trigger or ratchet
        triggerVoice(
            voiceIndex,
            step.accent || 0,  // Default to 0 if undefined
            ratchetCount,
            stepDuration,
            step.deviation > 0, // Set isDeviated flag based on step.deviation
            step.deviationMode || 1, // Use step's deviationMode or default to Late (1)
            0, // No fixed timing offset
            1.0, // Full velocity
            false, // Don't skip voice release
            scheduledTime // Pass through scheduled time from audio-thread scheduler
        );
    }
}

// Trigger a step for a specific voice
export function triggerStep(voiceIndex, stepIndexToTrigger) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) {
        return;
    }

    const sequence = state.sequences[voiceIndex];
    // stepIndexToTrigger is the actual index within the sequence.steps array
    if (stepIndexToTrigger < 0 || stepIndexToTrigger >= sequence.length) {
        return;
    }

    const step = sequence.steps[stepIndexToTrigger];
    if (!step) {
        return;
    }

    // Check if this step should trigger (gate and probability)
    if (!step.gate) {
        return;
    }

    // Apply per-voice probability
    if (sequence.probability < 100) {
        if (Math.random() * 100 > sequence.probability) return;
    }

    // Apply per-step probability
    if (step.probability < 100) {
        if (Math.random() * 100 > step.probability) return;
    }

    // Deviation flag (actual timing handled by engine)
    let isDeviated = false;
    if (step.deviation > 0) {
        // The engine will decide if this specific trigger instance is deviated
        // based on probability and mode. We just signal that deviation is possible.
        isDeviated = true; 
    }

    // Ratchet count (number of triggers for this step)
    // state.ratchet stores 0-7, mapping to 1-8 triggers.
    const ratchetCount = step.ratchet + 1;

    // Step duration is not directly used by triggerVoice for ratchet timing,
    // as triggerVoice uses config.currentMsPerStep.
    // It's more of a conceptual value if needed elsewhere.
    const stepDuration = config.currentMsPerStep / 1000; // Duration of a single (non-ratcheted) step in seconds

    // Dispatch track trigger event for per-parameter modulation
    const trackTriggerEvent = new CustomEvent('trackTriggered', {
        detail: {
            trackIndex: voiceIndex,
            accentLevel: step.accent || 0,
            isBarStart: state.isBarStart || false
        }
    });
    document.dispatchEvent(trackTriggerEvent);

    triggerVoice(
        voiceIndex,
        step.accent,      // Accent level (0-15)
        ratchetCount,     // Number of triggers
        stepDuration,     // Base duration of the step slot
        isDeviated,       // Boolean flag if deviation is active for this step
        step.deviationMode // Pass the actual deviation mode from the step
    );
}

// Initialize the sequencer
export function initSequence() {
    // Initialize euclidean parameters first
    initEuclidean();

    for (let i = 0; i < state.sequences.length; i++) {
        const sequence = state.sequences[i];

        // Ensure all 64 steps are initialized
        for (let j = 0; j < 64; j++) {
            if (!sequence.steps[j]) { // If a step object doesn't exist
                sequence.steps[j] = {
                    gate: false, accent: 0, ratchet: 0, probability: 100,
                    deviation: 0, deviationMode: 1, paramLocks: {}
                };
            } else { // If it exists, ensure all properties are there
                sequence.steps[j].gate = sequence.steps[j].gate || false;
                sequence.steps[j].accent = sequence.steps[j].accent || 0;
                sequence.steps[j].ratchet = sequence.steps[j].ratchet || 0;
                sequence.steps[j].probability = sequence.steps[j].probability === undefined ? 100 : sequence.steps[j].probability;
                sequence.steps[j].deviation = sequence.steps[j].deviation || 0;
                // Keep deviationMode for backward compatibility but it's not used anymore
                sequence.steps[j].deviationMode = 1;
                sequence.steps[j].paramLocks = sequence.steps[j].paramLocks || {};
            }
        }

        // Apply default patterns based on active length
        const initialLength = sequence.length || 16;
        for (let j = 0; j < initialLength; j++) {
            if (i === 0 && j % 4 === 0) { // Voice 0 (Kick): 1, 5, 9, 13
                sequence.steps[j].gate = true;
            } else if (i === 1 && (j === 4 || j === 12)) { // Voice 1 (Snare): 5, 13
                sequence.steps[j].gate = true;
            } else if (i === 4 && j % 2 === 0) { // Voice 4 (Closed Hat): every other step (8ths)
                sequence.steps[j].gate = true;
            }
        }
        // Set currentStep to be ready for the first tick (advances to 0)
        sequence.currentStep = sequence.length > 0 ? sequence.length - 1 : -1;
    }
}

// Toggle gate for a step
export function toggleStepGate(voiceIndex, stepIndex) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;
    const sequence = state.sequences[voiceIndex];
    if (stepIndex < 0 || stepIndex >= sequence.steps.length) return; // Check against physical array length (64)

    sequence.steps[stepIndex].gate = !sequence.steps[stepIndex].gate;
}

// Set accent level for a step
export function setStepAccent(voiceIndex, stepIndex, level) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;
    const sequence = state.sequences[voiceIndex];
    if (stepIndex < 0 || stepIndex >= sequence.steps.length) return;

    sequence.steps[stepIndex].accent = Math.max(0, Math.min(15, Math.round(level)));
}

// Set ratchet count for a step (state stores 0-7 for 1-8 triggers)
export function setStepRatchet(voiceIndex, stepIndex, ratchetValue) { // ratchetValue is 0-7
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;
    const sequence = state.sequences[voiceIndex];
    if (stepIndex < 0 || stepIndex >= sequence.steps.length) return;

    sequence.steps[stepIndex].ratchet = Math.max(0, Math.min(7, Math.round(ratchetValue)));
}

// Set deviation for a step - simplified to just amount, no modes
export function setStepDeviation(voiceIndex, stepIndex, amount) { // amount 0-100
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;
    const sequence = state.sequences[voiceIndex];
    if (stepIndex < 0 || stepIndex >= sequence.steps.length) return;

    // Round to specific values: 0, 33, 66, 100 for better visual consistency
    const roundedAmount = amount === 0 ? 0 :
                         amount < 40 ? 33 :
                         amount < 75 ? 66 : 100;
    
    sequence.steps[stepIndex].deviation = roundedAmount;
}

// Set probability for a step
export function setStepProbability(voiceIndex, stepIndex, probability) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;
    const sequence = state.sequences[voiceIndex];
    if (stepIndex < 0 || stepIndex >= sequence.steps.length) return;

    sequence.steps[stepIndex].probability = Math.max(0, Math.min(100, Math.round(probability)));
}


// Copy a sequence from one voice to another
export function copySequence(sourceVoiceIndex, destVoiceIndex) {
    if (sourceVoiceIndex < 0 || sourceVoiceIndex >= state.sequences.length) return;
    if (destVoiceIndex < 0 || destVoiceIndex >= state.sequences.length) return;
    if (sourceVoiceIndex === destVoiceIndex) return;

    const sourceSeq = state.sequences[sourceVoiceIndex];
    const destSeq = state.sequences[destVoiceIndex];

    // Copy length and probability
    destSeq.length = sourceSeq.length;
    destSeq.probability = sourceSeq.probability;
    // currentStep will be managed by the clock for the destination voice independently.

    // Deep copy all 64 steps
    for (let i = 0; i < 64; i++) {
        const sourceStep = sourceSeq.steps[i];
        // Ensure sourceStep exists, though it should if initSequence ran correctly
        if (sourceStep) {
            destSeq.steps[i] = {
                gate: sourceStep.gate,
                accent: sourceStep.accent,
                ratchet: sourceStep.ratchet,
                probability: sourceStep.probability,
                deviation: sourceStep.deviation,
                deviationMode: sourceStep.deviationMode,
                paramLocks: JSON.parse(JSON.stringify(sourceStep.paramLocks || {})) // Deep copy locks
            };
        } else { // Fallback if a source step is missing (should not happen)
            destSeq.steps[i] = {
                gate: false, accent: 0, ratchet: 0, probability: 100,
                deviation: 0, deviationMode: 1, paramLocks: {}
            };
        }
    }
}

// Clear a sequence (resets all steps to default for the specified voice)
export function clearSequence(voiceIndex) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;

    const sequence = state.sequences[voiceIndex];
    for (let i = 0; i < 64; i++) { // Clear all 64 possible steps
        sequence.steps[i].gate = false;
        sequence.steps[i].accent = 0;
        sequence.steps[i].ratchet = 0;
        sequence.steps[i].probability = 100;
        sequence.steps[i].deviation = 0;
        sequence.steps[i].deviationMode = 1;
        sequence.steps[i].paramLocks = {};
    }
    // sequence.currentStep is not reset here; clock will manage it.
}