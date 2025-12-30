// File: js/modules/clock.js
// Clock module
import { state } from '../state.js';
import { handleSampleTrigger, onPlayStateChange as pathOnPlayStateChange } from './path.js';
import { drawLfo } from './lfo.js';
import { updatePatternDisplay, onPlayStateChange as factorsOnPlayStateChange } from './factors.js';
// Import panicStop from audio.js for immediate all-notes-off on stop
import { panicStop } from '../audio.js';
import { config } from '../config.js';

// Toggle play/stop
export function togglePlay() {
    state.isPlaying = !state.isPlaying;

    if (state.isPlaying) {
        // Reset counters
        state.stepCounter = -1;
        state.barCounter = 0;
        state.lastStepTime = 0;
        state.currentStepIndex = -1;
        state.factorsPatternPos = -1;
        state.displayBar = 1;
        state.displayBeat = 1;
        state.displayStep = 1;
        state.isBarStart = true;

        // Start the clock
        if (!state.clockRequestId) {
            state.clockRequestId = requestAnimationFrame(runClock);
        }

        // Update UI
        const playButton = document.querySelector('.raembl-app .play-button');
        if (playButton) {
            playButton.innerHTML = '■';
            playButton.classList.add('active');
        }

        // Restart animations if in animated mode
        factorsOnPlayStateChange();
        pathOnPlayStateChange();
    } else { // STOPPING
        // Stop the clock
        if (state.clockRequestId) {
            cancelAnimationFrame(state.clockRequestId);
            state.clockRequestId = null;
        }

        // Reset state
        state.currentStepIndex = -1;
        state.factorsPatternPos = -1;
        state.displayBar = 1;
        state.displayBeat = 1;
        state.displayStep = 1;
        state.isBarStart = false;
        state.triggerSample = false;
        state.stepCounter = -1;
        state.barCounter = 0;
        state.lastStepTime = 0;

        // Update UI
        const playButton = document.querySelector('.raembl-app .play-button');
        if (playButton) {
            playButton.innerHTML = '▶';
            playButton.classList.remove('active');
        }

        const displayBox = document.querySelector('.raembl-app .display-box');
        if (displayBox) displayBox.textContent = '---';

        // Stop button: immediately silence all audio (all-notes-off)
        panicStop();

        // Update pattern display
        updatePatternDisplay();

        // Stop animations
        factorsOnPlayStateChange();
        pathOnPlayStateChange();
    }
}

function runClock(timestamp) {
    if (!state.isPlaying) {
        state.clockRequestId = null;
        return;
    }

    // Calculate timing
    const msPerStep = (60000 / state.bpm) / state.stepsPerBeat;
    const stepsPerBar = state.stepsPerBeat * state.barLength;

    if (state.lastStepTime === 0) {
        state.lastStepTime = timestamp;
    }

    const elapsed = timestamp - state.lastStepTime;

    // Calculate next step index
    const nextStepIndex = (state.stepCounter + 1) % stepsPerBar;

    // Check if the next step is an odd-numbered step (for swing)
    // This refers to the step *about to be played*
    const isNextStepOdd = (((state.stepCounter + 1) % state.stepsPerBeat) % 2) === 1;


    // Calculate time to next step, applying swing to both odd and even steps
    let stepThreshold = msPerStep;
    if (state.swing > 0) {
        const swingAmount = (state.swing / 100) * msPerStep * 0.5;
        if (isNextStepOdd) { // If the *next* step is odd, it's delayed
            stepThreshold += swingAmount;
        } else { // If the *next* step is even, it's advanced (current step is shortened)
            stepThreshold = Math.max(msPerStep * 0.5, stepThreshold - swingAmount);
        }
    }

    // Store current step duration for trill timing
    config.currentMsPerStep = stepThreshold;

    // Check if it's time for the next step
    if (elapsed >= stepThreshold) {
        // Advance lastStepTime by the actual duration of the step just completed (stepThreshold)
        state.lastStepTime += stepThreshold;


        // Advance counters
        state.stepCounter = nextStepIndex;
        const currentBarStep = state.stepCounter;

        // Check for bar start
        const barStartSignal = currentBarStep === 0;

        if (barStartSignal && state.stepCounter >= 0) { // Ensure it's not the initial -1 state
            state.barCounter += 1;
        }

        // Update separate pattern position for factors
        if (barStartSignal && state.resetFactorsOnBar) {
            state.factorsPatternPos = 0;
        } else {
            if (state.factorsPatternPos === -1 || state.gatePattern.length === 0) { // Handle empty pattern
                state.factorsPatternPos = 0;
            } else {
                state.factorsPatternPos = (state.factorsPatternPos + 1) % state.gatePattern.length;
            }
        }

        // Update state for UI
        state.currentStepIndex = state.factorsPatternPos;
        state.displayBar = state.barCounter + 1;
        state.displayBeat = Math.floor(currentBarStep / state.stepsPerBeat) + 1;
        state.displayStep = (currentBarStep % state.stepsPerBeat) + 1;

        // Update display
        const displayBox = document.querySelector('.raembl-app .display-box');
        if (displayBox) displayBox.textContent = `${state.displayBar}.${state.displayBeat}.${state.displayStep}`;

        // Check trigger from pattern
        const shouldTrigger = state.gatePattern.length > 0 && (state.gatePattern[state.currentStepIndex] || false);

        // Handle bar start reset
        if (barStartSignal) {
            state.isBarStart = true;
            setTimeout(() => state.isBarStart = false, 0); // Reset after this tick

            if (state.resetLfoOnBar) {
                state.lfoStartTime = performance.now();
                drawLfo(); // Redraw LFO to reflect phase reset
            }
        }

        // Handle sample trigger
        if (shouldTrigger) {
            state.triggerSample = true;
            setTimeout(() => {
                state.triggerSample = false;
            }, 0); // Reset after this tick

            handleSampleTrigger();
        }

        // Update pattern display
        updatePatternDisplay();
    }

    // Request next frame
    if (state.isPlaying) {
        state.clockRequestId = requestAnimationFrame(runClock);
    } else {
        state.clockRequestId = null;
    }
}

// Initialize the clock
export function initClock() {
    // No specific init needed beyond what main.js does,
    // but this function is kept for consistency.
}