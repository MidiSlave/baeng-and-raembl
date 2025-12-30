// File: merged-app/js/shared/clock.js
// Shared clock for Bæng & Ræmbl synchronisation
// Based on Bæng's precise audio-thread scheduler (100ms lookahead)

import { sharedState } from '../state.js';
import { sharedAudioContext } from './audio.js';

const subscribers = [];
let schedulerInterval = null;
let nextStepTime = 0;

const LOOKAHEAD_TIME = 0.1; // 100ms lookahead
const SCHEDULER_INTERVAL = 25; // 25ms polling rate

// Pub/Sub system for clock events
export function subscribe(callback) {
    subscribers.push(callback);

    // Return unsubscribe function
    return () => {
        const index = subscribers.indexOf(callback);
        if (index > -1) {
            subscribers.splice(index, 1);
        }
    };
}

function broadcast(event) {
    subscribers.forEach(callback => {
        try {
            callback(event);
        } catch (error) {
            console.error('[SharedClock] Error in subscriber callback:', error);
        }
    });
}

// Clock control functions
export function togglePlay() {
    sharedState.isPlaying = !sharedState.isPlaying;

    if (sharedState.isPlaying) {
        // Reset counters and start playback
        sharedState.stepCounter = -1;
        sharedState.barCounter = 0;
        nextStepTime = sharedAudioContext.currentTime;

        schedulerInterval = setInterval(scheduler, SCHEDULER_INTERVAL);

        broadcast({ type: 'play' });
    } else {
        // Stop playback
        if (schedulerInterval) {
            clearInterval(schedulerInterval);
            schedulerInterval = null;
        }

        broadcast({ type: 'stop' });
    }
}

export function setBPM(bpm) {
    const newBPM = Math.max(20, Math.min(300, bpm));
    sharedState.bpm = newBPM;
    broadcast({ type: 'bpmChange', bpm: newBPM });
}

export function setSwing(swing) {
    const newSwing = Math.max(0, Math.min(100, swing));
    sharedState.swing = newSwing;
    broadcast({ type: 'swingChange', swing: newSwing });
}

export function setBaengBarLength(barLength) {
    const newBarLength = Math.max(1, Math.min(128, barLength));
    sharedState.baengBarLength = newBarLength;
    broadcast({ type: 'baengBarLengthChange', barLength: newBarLength });
}

export function setRaemblBarLength(barLength) {
    const newBarLength = Math.max(1, Math.min(128, barLength));
    sharedState.raemblBarLength = newBarLength;
    broadcast({ type: 'raemblBarLengthChange', barLength: newBarLength });
}

// Audio-thread scheduler (100ms lookahead)
// This is the core timing engine - schedules note triggers precisely in audio time
function scheduler() {
    const currentTime = sharedAudioContext.currentTime;
    const msPerBeat = 60000 / sharedState.bpm;
    const msPerStep = msPerBeat / sharedState.stepsPerBeat;
    const stepDuration = msPerStep / 1000; // Convert to seconds

    // Schedule all steps that fall within the lookahead window
    while (nextStepTime < currentTime + LOOKAHEAD_TIME) {
        sharedState.stepCounter++;

        // Calculate swing offset (off-beats delayed)
        const isOffBeat = (sharedState.stepCounter % 2) === 1;
        const swingRatio = sharedState.swing / 100;
        const swingOffset = isOffBeat ? (stepDuration / 2) * swingRatio : 0;

        // Calculate per-app step positions (polymetric support)
        const baengStepsInBar = sharedState.stepsPerBeat * sharedState.baengBarLength;
        const raemblStepsInBar = sharedState.stepsPerBeat * sharedState.raemblBarLength;

        const baengStepInBar = sharedState.stepCounter % baengStepsInBar;
        const raemblStepInBar = sharedState.stepCounter % raemblStepsInBar;

        const baengIsBarStart = (baengStepInBar === 0);
        const raemblIsBarStart = (raemblStepInBar === 0);

        // Calculate display positions for each app
        const baengBeat = Math.floor(baengStepInBar / sharedState.stepsPerBeat);
        const baengSubStep = baengStepInBar % sharedState.stepsPerBeat;
        const baengBar = Math.floor(sharedState.stepCounter / baengStepsInBar) + 1;

        const raemblBeat = Math.floor(raemblStepInBar / sharedState.stepsPerBeat);
        const raemblSubStep = raemblStepInBar % sharedState.stepsPerBeat;
        const raemblBar = Math.floor(sharedState.stepCounter / raemblStepsInBar) + 1;

        // Update shared state (legacy - uses Bæng's position for backwards compat)
        sharedState.currentStepIndex = baengStepInBar;
        sharedState.isBarStart = baengIsBarStart;
        sharedState.displayBar = baengBar;
        sharedState.displayBeat = baengBeat + 1;
        sharedState.displayStep = baengSubStep + 1;

        if (baengIsBarStart) {
            sharedState.barCounter++;
        }

        // Broadcast step event to all subscribers
        broadcast({
            type: 'step',
            audioTime: nextStepTime + swingOffset,
            // Per-app positions for polymetric support
            baeng: {
                stepIndex: baengStepInBar,
                isBarStart: baengIsBarStart,
                bar: baengBar,
                beat: baengBeat + 1,
                subStep: baengSubStep + 1
            },
            raembl: {
                stepIndex: raemblStepInBar,
                isBarStart: raemblIsBarStart,
                bar: raemblBar,
                beat: raemblBeat + 1,
                subStep: raemblSubStep + 1
            },
            // Legacy fields for backwards compat
            stepIndex: baengStepInBar,
            isBarStart: baengIsBarStart,
            stepCounter: sharedState.stepCounter,
            barCounter: sharedState.barCounter
        });

        // Advance time (no swing drift - swing only affects trigger timing, not step advancement)
        nextStepTime += stepDuration;
    }
}

// Initialise clock
export function initClock() {
}

// Get current state (for UI updates)
export function getPlayState() {
    return {
        isPlaying: sharedState.isPlaying,
        bpm: sharedState.bpm,
        swing: sharedState.swing,
        baengBarLength: sharedState.baengBarLength,
        raemblBarLength: sharedState.raemblBarLength,
        currentStepIndex: sharedState.currentStepIndex,
        displayBar: sharedState.displayBar,
        displayBeat: sharedState.displayBeat,
        displayStep: sharedState.displayStep
    };
}
