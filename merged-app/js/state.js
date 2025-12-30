// File: merged-app/js/state.js
// Merged state management for Bæng & Ræmbl with namespacing
//
// This file will be updated to import from the individual state files
// and create proxies for backward compatibility.
// For now, we export placeholders that the individual apps will replace.

// Timing properties that will be shared between both apps
const SHARED_TIMING_PROPS = [
    'isPlaying',
    'bpm',
    'swing',
    'baengBarLength',
    'raemblBarLength',
    'currentStepIndex',
    'displayBar',
    'displayBeat',
    'displayStep',
    'isBarStart',
    'clockRequestId',
    'lastStepTime',
    'stepCounter',
    'barCounter',
    'stepsPerBeat',
    'baengTempoMultiplier',
    'raemblTempoMultiplier'
];

// Shared state container
export const sharedState = {
    isPlaying: false,
    bpm: 120,
    swing: 0,
    baengBarLength: 4,
    raemblBarLength: 4,
    currentStepIndex: -1,
    displayBar: 1,
    displayBeat: 1,
    displayStep: 1,
    isBarStart: false,
    clockRequestId: null,
    lastStepTime: 0,
    stepCounter: -1,
    barCounter: 0,
    stepsPerBeat: 4,
    baengTempoMultiplier: 2.0,  // Bæng plays at 2× speed
    raemblTempoMultiplier: 1.0  // Ræmbl plays at base tempo
};

// Helper function to create a proxy that shares timing props
export function createStateProxy(appState, sharedState) {
    return new Proxy(appState, {
        get(target, prop) {
            if (SHARED_TIMING_PROPS.includes(prop)) {
                return sharedState[prop];
            }
            return target[prop];
        },
        set(target, prop, value) {
            if (SHARED_TIMING_PROPS.includes(prop)) {
                sharedState[prop] = value;
                return true;
            }
            target[prop] = value;
            return true;
        }
    });
}

// These will be set by the individual apps
export let baengState = null;
export let raemblState = null;

// Functions to be called by each app to register their state
export function registerBaengState(state) {
    baengState = createStateProxy(state, sharedState);
    // Expose to window for PPMod modal access
    window.baengState = baengState;
    return baengState;
}

export function registerRaemblState(state) {
    raemblState = createStateProxy(state, sharedState);
    // Expose to window for PPMod modal access
    window.raemblState = raemblState;
    return raemblState;
}
