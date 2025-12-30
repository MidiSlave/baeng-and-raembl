// File: js/audio.js
// Audio initialization and management for Bæng

import { state } from './state.js';
import { config } from './config.js';
import { initEngine, releaseAllVoices, updateEngineParams, updateDrumBusParams } from './modules/engine.js';

// Initialize the audio system
export function initAudio() {
    
    // initEngine will create AudioContext, masterGain, limiter, and effects nodes
    // if they don't already exist.
    initEngine(); 
    
    // Set up audio context resuming on user interaction
    // This is important for browsers that block audio until user interaction.
    setupAudioContextResume();
}

// Resume audio context (needed due to autoplay policy)
export function resumeAudio() {
    if (config.audioContext) {
        if (config.audioContext.state === 'suspended') {
            config.audioContext.resume().then(() => {
                // After resuming, it might be good to ensure parameters are up-to-date
                // if any state changes happened while suspended.
                updateEngineParams();
            }).catch(err => {
            });
        } else if (config.audioContext.state === 'running') {
            // console.log('AudioContext already running.');
        }
    } else {
        // Attempt to initialize if called before main init sequence
        initAudio();
        if (config.audioContext && config.audioContext.state === 'suspended') {
             config.audioContext.resume().then(() => {
                updateEngineParams();
            }).catch(err => {
            });
        }
    }
}

// Set up event listeners to resume audio context on user interaction
function setupAudioContextResume() {
    const resumeEvents = ['pointerdown', 'keydown', 'touchstart']; // Common interaction events
    
    let hasResumed = false;

    const resumeOnInteraction = () => {
        if (hasResumed) return;

        if (config.audioContext && config.audioContext.state === 'suspended') {
            resumeAudio(); // resumeAudio handles the actual resume logic
        } else if (!config.audioContext) {
            // If audio context isn't even there yet, try to init and resume
            initAudio(); // This will call initEngine which creates the context
            resumeAudio();
        }
        
        // Check if successfully resumed or already running
        if (config.audioContext && config.audioContext.state === 'running') {
            hasResumed = true;
            // Remove event listeners once audio is resumed or confirmed running
            resumeEvents.forEach(eventType => {
                document.body.removeEventListener(eventType, resumeOnInteraction);
            });
        }
    };
    
    // Add event listeners to the body for broader capture
    resumeEvents.forEach(eventType => {
        document.body.addEventListener(eventType, resumeOnInteraction, { once: false, capture: true });
    });
}

// Update master volume via drum bus output gain
export function updateMasterVolume(volume) { // volume is 0-100
    const newVolume = Math.max(0, Math.min(100, volume));
    state.drumBus.outputGain = newVolume;

    // Update the drum bus processor's output gain parameter
    if (config.drumBusNode && config.audioContext) {
        config.drumBusNode.parameters.get('outputGain')
            .setTargetAtTime(newVolume / 100, config.audioContext.currentTime, 0.01);
    }
}

// Clean up audio resources when closing/refreshing
export function cleanupAudio() {
    
    // Release all voices gracefully
    if (config.audioContext && config.initialized) {
        releaseAllVoices(); // engine.js function
    }
    
    // Close audio context if it exists and is not already closed
    if (config.audioContext) {
        if (config.audioContext.state !== 'closed') {
            config.audioContext.close().then(() => {
                config.audioContext = null; // Nullify to prevent reuse
                config.initialized = false;
            }).catch(err => {
            });
        } else {
            config.audioContext = null;
            config.initialized = false;
        }
    }
}

// Add window beforeunload event listener to clean up audio
// This helps release resources if the user closes the tab/browser.
window.addEventListener('beforeunload', cleanupAudio);