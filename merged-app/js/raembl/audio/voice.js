// File: js/audio/voice.js
// Voice management module - MERGED TRUE POLYPHONY (POLY FILTER/ENV) WITH ORIGINAL FEATURES & DETAILS
import { state } from '../state.js';
import { config } from '../config.js';
import { mapRange, scales, noteNames } from '../utils.js';
import { attachAudioRateModulationsToVoice, sampleParameterForVoice } from '../modules/perParamMod.js';

// --- Constants ---
const MAX_POLY_VOICES = 8; // Maximum simultaneous polyphonic voices
const REFERENCE_FREQ_KEYTRACK = 130.81; // Approx C3 for key tracking reference
const RAMP_TIME_CONSTANT_SHORT = 0.005; // For smooth parameter changes
let GLIDE_SLIDE_END_BUFFER_MS = 75; // Buffer for glide/slide completion timeout - increased
const TRILL_SLIDE_TIME_FACTOR = 0.7;

// Helper to create the comparator curve for PWM
function createPWMCurve() {
    const curve = new Float32Array(2);
    curve[0] = -1; // Input < 0 -> Output -1
    curve[1] = 1;  // Input >= 0 -> Output +1
    return curve;
}
const pwmCurve = createPWMCurve(); // Create once

// --- TRILL HELPER FUNCTIONS ---
function noteToMidi(noteNameStr) {
    const noteRegex = /^([A-G]#?)(-?\d+)$/;
    const match = noteNameStr.match(noteRegex);
    if (!match) return -1;
    const name = match[1];
    const octave = parseInt(match[2], 10);
    const noteIndex = noteNames.indexOf(name);
    if (noteIndex === -1 || isNaN(octave)) return -1;
    return 12 * (octave + 1) + noteIndex;
}

function midiToNote(midiNum) {
    if (midiNum < 0 || midiNum > 127) return "C4";
    const octave = Math.floor(midiNum / 12) - 1;
    const noteIndex = midiNum % 12;
    return `${noteNames[noteIndex]}${octave}`;
}

function findScaleNote(currentNoteStr, direction = 1 ) {
    const currentScaleDef = scales[Math.min(state.scale, scales.length - 1)];
    if (!currentScaleDef || currentScaleDef.intervals.length === 0) return null;

    const currentScaleIntervals = currentScaleDef.intervals;
    const rootNoteOffset = state.root;

    let currentMidi = noteToMidi(currentNoteStr);
    if (currentMidi === -1) return null;

    const currentNoteRelativeToRootC0 = currentMidi - rootNoteOffset;
    const currentIntervalInOctave = (currentNoteRelativeToRootC0 % 12 + 12) % 12; // Ensure positive modulo
    const currentOctaveBase = Math.floor(currentNoteRelativeToRootC0 / 12);

    let currentDegreeIndex = -1;
    for (let i = 0; i < currentScaleIntervals.length; i++) {
        if (currentScaleIntervals[i] === currentIntervalInOctave) {
            currentDegreeIndex = i;
            break;
        }
    }

    if (currentDegreeIndex === -1) {
        return null;
    }

    let nextDegreeIndex = currentDegreeIndex + direction;
    let octaveAdjustment = 0;

    if (nextDegreeIndex >= currentScaleIntervals.length) {
        nextDegreeIndex = 0;
        octaveAdjustment = 1;
    } else if (nextDegreeIndex < 0) {
        nextDegreeIndex = currentScaleIntervals.length - 1;
        octaveAdjustment = -1;
    }

    const nextIntervalInOctave = currentScaleIntervals[nextDegreeIndex];
    const finalOctave = currentOctaveBase + octaveAdjustment;

    let nextMidi = rootNoteOffset + nextIntervalInOctave + (finalOctave * 12);

    const MAX_MIDI_NOTE = 108;
    const MIN_MIDI_NOTE = 21;

    if (direction > 0 && nextMidi > MAX_MIDI_NOTE) {
        return midiToNote(MAX_MIDI_NOTE);
    }
    if (direction < 0 && nextMidi < MIN_MIDI_NOTE) {
        return midiToNote(MIN_MIDI_NOTE);
    }

    nextMidi = Math.max(MIN_MIDI_NOTE, Math.min(MAX_MIDI_NOTE, nextMidi));
    return midiToNote(nextMidi);
}


// --- HELPER: Stop Trill and Restore Pitch ---
// Robust "triple-lock" stopTrill function
export function stopTrill(voice, now, restoreToFinalTarget = true) {
    if (!voice || !voice.isTrilling) {
        // Defensive cleanup of any orphaned timeout
        if (voice && voice.trillTimeoutId) {
            clearTimeout(voice.trillTimeoutId);
            voice.trillTimeoutId = null;
        }
        return;
    }

    const oscNodes = Object.values(voice._internalNodes || {}).filter(n => n && n.frequency);

    if (voice.trillTimeoutId) {
        clearTimeout(voice.trillTimeoutId);
        voice.trillTimeoutId = null;
    }
    voice.isTrilling = false; // Set state flag immediately

    oscNodes.forEach(oscNode => {
        const freqParam = oscNode.frequency;
        let pitchToRestore = -1;

        if (restoreToFinalTarget && typeof oscNode.finalTrillTargetFreq === 'number' && oscNode.finalTrillTargetFreq > 0) {
            pitchToRestore = oscNode.finalTrillTargetFreq;
        } else if (typeof oscNode.authoritativeFreq === 'number' && oscNode.authoritativeFreq > 0) {
            pitchToRestore = oscNode.authoritativeFreq;
        } else if (voice.baseNoteFreq && voice.baseNoteFreq > 0) {
            pitchToRestore = voice.baseNoteFreq;
        }

        if (pitchToRestore > 0) {
            try {
                // Aggressively cancel ALL scheduled values first
                freqParam.cancelScheduledValues(0);
                // Then set current value
                freqParam.setValueAtTime(pitchToRestore, now);
                oscNode.authoritativeFreq = pitchToRestore;
            } catch (e) {
                console.warn(`[stopTrill] Failed to restore frequency for oscillator:`, e.message);
            }
        }
    });
}

// --- HELPER: Prepare Voice for State Change ---
// Comprehensive cleanup before releasing or changing voice state
export function prepareVoiceForStateChange(voice, now) {
    if (!voice || !config.audioContext) return;
    now = now || config.audioContext.currentTime;

    // 1. Stop any active trill and restore pitch
    if (voice.isTrilling) {
        stopTrill(voice, now, true); // true to restore to final trill target
    }

    // 2. Reset state flags
    voice.isTrilling = false;
    voice.isSliding = false;
    voice.isGliding = false;

    // 2.5. Clear all pending timeouts
    if (voice.trillTimeoutId) {
        clearTimeout(voice.trillTimeoutId);
        voice.trillTimeoutId = null;
    }
    if (voice.autoReleaseTimeoutId) {
        clearTimeout(voice.autoReleaseTimeoutId);
        voice.autoReleaseTimeoutId = null;
    }
    if (voice.glideTimeoutId) {
        clearTimeout(voice.glideTimeoutId);
        voice.glideTimeoutId = null;
    }
    if (voice.slideTimeoutId) {
        clearTimeout(voice.slideTimeoutId);
        voice.slideTimeoutId = null;
    }

    // 3. Cancel any scheduled frequency changes
    Object.values(voice._internalNodes || {}).forEach(node => {
        if (node && node.frequency && typeof node.frequency.cancelScheduledValues === 'function') {
            try {
                node.frequency.cancelScheduledValues(now);
                if (typeof node.authoritativeFreq === 'number' && node.authoritativeFreq > 0) {
                    node.frequency.setValueAtTime(node.authoritativeFreq, now);
                }
            } catch(e) {
                console.warn('[prepareVoiceForStateChange] Failed to cancel frequency automations:', e.message);
            }
        }
    });
}


// --- HELPER FUNCTIONS ---

// Function to release a specific voice by ID (useful if slide cancelled or for voice stealing)
export function releaseVoiceById(voiceId) {
    // === Worklet path ===
    if (config.useWorklet && config.workletBridge) {
      config.workletBridge.releaseVoice(voiceId);

      // Remove voice from config.voices array
      const voiceIndex = config.voices.findIndex(v => v && v.id === voiceId);
      if (voiceIndex > -1) {
        config.voices.splice(voiceIndex, 1);
      }
      return;
    }

    // === Web Audio path ===
    if (!config.voices || !config.audioContext) return;
    const voiceIndex = config.voices.findIndex(v => v && v.id === voiceId);
    if (voiceIndex > -1) {
        const voice = config.voices[voiceIndex];
        if (!voice || voice.releaseStartTime) return; // Already releasing, null, or not found

        const now = config.audioContext.currentTime;

        // Prepare voice state before proceeding with release
        prepareVoiceForStateChange(voice, now);

        voice.active = false; // Mark as inactive immediately
        voice.releaseStartTime = now; // Mark when release began
        // isGliding, isSliding, isTrilling are already set to false by prepareVoiceForStateChange


        const isZeroRelease = (state.release <= 0.01); // Consider very small values as zero
        const releaseTime = 0.001 + Math.pow(state.release / 100, 2) * 9.999;

        // For zero-release, stop oscillators quickly to prevent artifacts
        // For normal release, give buffer time for smooth fade
        const stopTime = isZeroRelease
            ? now + 0.01  // 10ms for zero-release (matches 5ms gain ramp + small buffer)
            : now + releaseTime + 0.25; // Normal: release time + 250ms buffer

        // Store release duration on voice for accurate cleanup timing (prevents bug when release param changes during release)
        voice.releaseDuration = releaseTime;

        // console.log(`[releaseVoiceById] Voice: ${voiceId}, Note: ${voice.note}, state.release: ${state.release}%, releaseTime: ${releaseTime.toFixed(3)}s, isZeroRelease: ${isZeroRelease}`);

        // Release Amplitude Gains
        for (const gainNode of Object.values(voice.gains)) {
            if (!gainNode || !gainNode.gain) continue;
            try {
                const currentGain = gainNode.gain.value;
                gainNode.gain.cancelScheduledValues(now);
                gainNode.gain.setValueAtTime(currentGain, now);

                if (isZeroRelease || releaseTime < 0.002) {
                    gainNode.gain.linearRampToValueAtTime(0, now + 0.005);
                } else {
                    const releaseTimeConstant = Math.max(0.001, releaseTime / 4);
                    gainNode.gain.setTargetAtTime(0, now, releaseTimeConstant);
                }
            } catch (e) { console.warn(`Error releasing gain for voice ${voiceId}: ${e.message}`); }
        }

        // --- Release Filter Envelope (AUDIO-RATE: Ramp envelope gain to 0) ---
        if (voice.filterEnvelopeGain && voice.filterEnvData) {
            try {
                const envelopeGain = voice.filterEnvelopeGain.gain;

                // Get current envelope gain value
                const currentGain = envelopeGain.value;

                // Ramp envelope gain from current value to 0 (removes envelope contribution)
                envelopeGain.cancelScheduledValues(now);
                envelopeGain.setValueAtTime(currentGain, now);

                // Apply same zero-release logic as amplitude envelope for consistency
                if (isZeroRelease || releaseTime < 0.002) {
                    // Fast linear ramp for zero-release (5ms, same as amplitude)
                    envelopeGain.linearRampToValueAtTime(0, now + 0.005);
                } else {
                    // Normal exponential decay, but keep minimum of 10ms for filter stability
                    const releaseTimeConstant = Math.max(0.01, releaseTime / 5);
                    envelopeGain.setTargetAtTime(0, now, releaseTimeConstant);
                }

                voice.filterEnvData.inRelease = true;
                voice.filterEnvData.releaseStartTime = now;
            } catch (e) {
                console.warn(`Error releasing POLY filter envelope for voice ${voiceId}: ${e.message}`);
            }
        }

        // --- Filter Audio-Rate Modulation Sources Release ---
        // All filter sources (filterEnvelopeSource, filterBaseCutoffSource, filterLfoOsc)
        // continue running during release and are stopped in cleanupRemainingNodes() after release completes.
        // This ensures the filter modulation remains smooth throughout the entire release phase.
        // Stopping these sources prematurely would cause the filter frequency to collapse,
        // especially noticeable when FILTER MOD is active, resulting in abrupt sound cutoff.
        // --- End Filter Release ---

        // --- MONO Filter Envelope Release (BUG FIX) ---
        // In MONO mode, release the shared filter envelope modulator
        // This prevents high-resonance filter self-oscillation during the cleanup timeout
        if (state.monoMode && config.monoFilterEnvModulator) {
            // Check if this is the last active voice (only reset filter envelope if it is)
            const otherActiveVoices = config.voices.some(v => v && v.active && v.id !== voiceId);

            if (!otherActiveVoices) {
                try {
                    const envModGain = config.monoFilterEnvModulator.gain;
                    const currentGain = envModGain.value;

                    envModGain.cancelScheduledValues(now);
                    envModGain.setValueAtTime(currentGain, now);

                    // Apply same zero-release logic as amplitude/filter envelope for consistency
                    if (isZeroRelease || releaseTime < 0.002) {
                        // Fast linear ramp for zero-release (5ms, same as amplitude)
                        envModGain.linearRampToValueAtTime(0, now + 0.005);
                    } else {
                        // Normal exponential decay, minimum 10ms for filter stability
                        const releaseTimeConstant = Math.max(0.01, releaseTime / 5);
                        envModGain.setTargetAtTime(0, now, releaseTimeConstant);
                    }
                } catch (e) {
                    console.warn(`Error releasing MONO filter envelope for voice ${voiceId}: ${e.message}`);
                }
            }
        }
        // --- End MONO Filter Envelope Release ---


        // Schedule stop/disconnect for internal nodes (oscillators etc.)
        // Use a Set to avoid trying to stop/disconnect the same node multiple times if referenced in multiple places
        const nodesToStop = new Set();
        Object.values(voice._internalNodes || {}).forEach(n => { if(n) nodesToStop.add(n); });
        Object.values(voice.oscillators || {}).forEach(n => { if(n && typeof n.stop === 'function') nodesToStop.add(n); });


        nodesToStop.forEach(node => {
            // If an oscillator was gliding/sliding/trilling, its frequency ramp should be cancelled.
            // prepareVoiceForStateChange already cancels these, but this is an extra safeguard
            if (node.frequency && typeof node.frequency.cancelScheduledValues === 'function') {
                try {
                    // Cancel ALL scheduled values including any lingering trill automations
                    node.frequency.cancelScheduledValues(0);
                } catch(e) {
                    console.warn(`[releaseVoiceById] Failed to cancel frequency automation:`, e.message);
                }
            }
            if (typeof node.stop === 'function') {
                try {
                    node.stop(stopTime);
                } catch (e) {
                    console.warn(`[releaseVoiceById] Error scheduling stop for node:`, e.message);
                }
            }
        });

        // In MONO mode, schedule automatic cleanup since releaseInactiveVoices doesn't run
        if (state.monoMode) {
            const cleanupDelay = (releaseTime + 0.1) * 1000; // Convert to ms, add 100ms buffer

            setTimeout(() => {
                // Check if voice still exists (might have been cleaned by releaseAllVoices)
                const stillExists = config.voices.find(v => v && v.id === voiceId);
                if (stillExists) {
                    cleanupRemainingNodes(stillExists, false);
                    config.voices = config.voices.filter(v => v?.id !== voiceId);
                } else {
                }
            }, cleanupDelay);
        }
    } else {
        // console.warn(`releaseVoiceById: Voice with ID ${voiceId} not found or already released.`);
    }
}

// Function to fully stop and disconnect all nodes associated with a voice immediately
// Exported for potential use in "panic" stop
export function cleanupRemainingNodes(voiceToCleanup, immediate = false) {
    if (!voiceToCleanup || !config.audioContext) return;

    // Skip cleanup for worklet voices (they don't have Web Audio nodes to clean up)
    if (voiceToCleanup.workletVoiceIndex !== undefined) {
        // Just remove from array
        const index = config.voices.findIndex(v => v && v.id === voiceToCleanup.id);
        if (index > -1) {
            config.voices.splice(index, 1);
        }
        return;
    }

    const now = config.audioContext.currentTime;
    const quickStopTime = now + (immediate ? 0.005 : 0.02); // Faster stop if immediate
    const disconnectDelay = immediate ? 5 : 60; // Shorter disconnect delay if immediate, slightly longer otherwise

    // console.log(`[cleanupRemainingNodes] Voice: ${voiceToCleanup.id}, Note: ${voiceToCleanup.note}, immediate: ${immediate}, quickStopTime: ${(quickStopTime - now).toFixed(3)}s`);

    // Prepare voice state before full cleanup
    prepareVoiceForStateChange(voiceToCleanup, now);

    const allNodes = new Set();
    Object.values(voiceToCleanup.gains || {}).forEach(n => { if(n) allNodes.add(n); });
    Object.values(voiceToCleanup._internalNodes || {}).forEach(n => { if(n) allNodes.add(n); });
    Object.values(voiceToCleanup.oscillators || {}).forEach(n => { if(n) allNodes.add(n); });

    if(voiceToCleanup.filterNodes) {
        if(voiceToCleanup.filterNodes.hp) allNodes.add(voiceToCleanup.filterNodes.hp);
        if(voiceToCleanup.filterNodes.lp) allNodes.add(voiceToCleanup.filterNodes.lp);
    }

    // Audio-rate modulation sources (POLY voices)
    if(voiceToCleanup.filterBaseCutoffSource) allNodes.add(voiceToCleanup.filterBaseCutoffSource);
    if(voiceToCleanup.filterEnvelopeSource) allNodes.add(voiceToCleanup.filterEnvelopeSource);
    if(voiceToCleanup.filterEnvelopeGain) allNodes.add(voiceToCleanup.filterEnvelopeGain);
    if(voiceToCleanup.filterLfoOsc) allNodes.add(voiceToCleanup.filterLfoOsc);
    if(voiceToCleanup.filterLfoGain) allNodes.add(voiceToCleanup.filterLfoGain);

    // Clean up any Sample & Hold values for this voice (Mod LFO)
    if (voiceToCleanup.id && window.cleanupVoiceSampleValues) {
        try {
            window.cleanupVoiceSampleValues(voiceToCleanup.id);
        } catch (e) {
            console.warn(`Error cleaning up Mod LFO S&H values for voice ${voiceToCleanup.id}:`, e);
        }
    }

    // Clean up per-parameter modulation state for this voice
    if (voiceToCleanup.id && window.cleanupVoicePerParamModState) {
        try {
            window.cleanupVoicePerParamModState(voiceToCleanup.id);
        } catch (e) {
            console.warn(`Error cleaning up per-param modulation state for voice ${voiceToCleanup.id}:`, e);
        }
    }

    const wasMonoVoice = !voiceToCleanup.filterNodes?.hp && !voiceToCleanup.filterNodes?.lp;
    if (wasMonoVoice && config.monoFilterEnvModulator) { // This is the LFO modulator for MONO filter
        const otherActiveVoices = config.voices.some(v => v && v.active && v.id !== voiceToCleanup.id);
        if (!otherActiveVoices) { // Only reset if this was the last active voice
            try {
                // console.log("Cleaning up MONO filter LFO modulator gain as last active voice is removed");
                config.monoFilterEnvModulator.gain.cancelScheduledValues(now);
                config.monoFilterEnvModulator.gain.setTargetAtTime(0, now, 0.01);
            } catch(e) { console.warn("Error cleaning MONO filter LFO mod gain:", e); }
        }
    }

    allNodes.forEach(node => {
        try {
            if (node.gain && typeof node.gain.cancelScheduledValues === 'function') {
                node.gain.cancelScheduledValues(now);
                node.gain.setValueAtTime(node.gain.value, now); // Hold current value
                node.gain.linearRampToValueAtTime(0, now + (immediate ? 0.003 : 0.01)); // Quick ramp to 0
            }
            // Aggressively cancel ANY frequency automations including trills
            if (node.frequency && typeof node.frequency.cancelScheduledValues === 'function') {
                try {
                    node.frequency.cancelScheduledValues(0); // Cancel ALL scheduled values
                } catch (e) {
                    console.warn(`[cleanupRemainingNodes] Failed to cancel frequency automations:`, e.message);
                }
            }
            if (typeof node.stop === 'function') {
                try {
                    node.stop(quickStopTime);
                } catch (e) {
                    console.warn(`[cleanupRemainingNodes] Error stopping node:`, e.message);
                }
            }
        } catch (e) {
            console.warn(`Cleanup Error processing node (Voice ${voiceToCleanup.id}): ${e.message}`);
        }
    });

    // Disconnect filter nodes and modulation sources immediately for aggressive cleanup
    // This reduces CPU load by freeing up filter nodes as soon as possible
    const disconnectFilterNodes = () => {
        // Disconnect filter nodes immediately
        if (voiceToCleanup.filterNodes) {
            if (voiceToCleanup.filterNodes.lp && typeof voiceToCleanup.filterNodes.lp.disconnect === 'function') {
                try {
                    voiceToCleanup.filterNodes.lp.disconnect();
                } catch (e) {
                    console.warn(`[cleanupRemainingNodes] Error disconnecting LP filter:`, e.message);
                }
            }
            if (voiceToCleanup.filterNodes.hp && typeof voiceToCleanup.filterNodes.hp.disconnect === 'function') {
                try {
                    voiceToCleanup.filterNodes.hp.disconnect();
                } catch (e) {
                    console.warn(`[cleanupRemainingNodes] Error disconnecting HP filter:`, e.message);
                }
            }
        }

        // Disconnect modulation sources immediately
        if (voiceToCleanup.filterEnvelopeSource && typeof voiceToCleanup.filterEnvelopeSource.disconnect === 'function') {
            try {
                voiceToCleanup.filterEnvelopeSource.disconnect();
            } catch (e) {
                console.warn(`[cleanupRemainingNodes] Error disconnecting filterEnvelopeSource:`, e.message);
            }
        }
        if (voiceToCleanup.filterBaseCutoffSource && typeof voiceToCleanup.filterBaseCutoffSource.disconnect === 'function') {
            try {
                voiceToCleanup.filterBaseCutoffSource.disconnect();
            } catch (e) {
                console.warn(`[cleanupRemainingNodes] Error disconnecting filterBaseCutoffSource:`, e.message);
            }
        }
        if (voiceToCleanup.filterLfoGain && typeof voiceToCleanup.filterLfoGain.disconnect === 'function') {
            try {
                voiceToCleanup.filterLfoGain.disconnect();
            } catch (e) {
                console.warn(`[cleanupRemainingNodes] Error disconnecting filterLfoGain:`, e.message);
            }
        }
        if (voiceToCleanup.filterEnvelopeGain && typeof voiceToCleanup.filterEnvelopeGain.disconnect === 'function') {
            try {
                voiceToCleanup.filterEnvelopeGain.disconnect();
            } catch (e) {
                console.warn(`[cleanupRemainingNodes] Error disconnecting filterEnvelopeGain:`, e.message);
            }
        }
    };

    // Disconnect all remaining nodes (oscillators, gains, etc.)
    const disconnectRemainingNodes = () => {
        allNodes.forEach(node => {
            if (typeof node.disconnect === 'function') {
                try {
                    node.disconnect();
                } catch (e) {
                    console.warn(`[cleanupRemainingNodes] Error disconnecting node:`, e.message);
                }
            }
        });
    };

    // Disconnect filter nodes immediately for aggressive cleanup
    disconnectFilterNodes();

    if (immediate) {
        // For MONO mode and panic stops, disconnect everything immediately to prevent hanging notes
        disconnectRemainingNodes();
    } else {
        // For POLY mode, use a slight delay to allow oscillators to fade smoothly
        setTimeout(disconnectRemainingNodes, disconnectDelay);
    }


    // Clear references on the voice object itself
    voiceToCleanup.gains = {};
    voiceToCleanup._internalNodes = {};
    voiceToCleanup.oscillators = {};
    if (voiceToCleanup.filterNodes) {
        voiceToCleanup.filterNodes.hp = null;
        voiceToCleanup.filterNodes.lp = null;
    }

    // Clear audio-rate modulation source references
    voiceToCleanup.filterBaseCutoffSource = null;
    voiceToCleanup.filterEnvelopeSource = null;
    voiceToCleanup.filterEnvelopeGain = null;
    voiceToCleanup.filterLfoOsc = null;
    voiceToCleanup.filterLfoGain = null;

    voiceToCleanup.active = false;
    voiceToCleanup.isGliding = false;
    voiceToCleanup.isSliding = false;
    voiceToCleanup.releaseStartTime = voiceToCleanup.releaseStartTime || now; // Ensure releaseStartTime is set if not already

    // Remove from config.voices array
    const index = config.voices.findIndex(v => v && v.id === voiceToCleanup.id);
    if (index > -1) {
        // console.log(`Removing voice ${voiceToCleanup.id} from array during cleanup.`);
        config.voices.splice(index, 1);
    }
}


// Function to apply temporary filter boost for MONO accent
function applyTemporaryFilterAccent(duration = 0.15) {
     if (!config.monoFilter || !config.audioContext || !state.monoMode) return;
     const now = config.audioContext.currentTime;
     const rampTime = 0.01;

     const originalFreq = config.monoFilter.frequency.value;
     const originalQ = config.monoFilter.Q.value;
     // Use the stored base cutoff which includes key tracking AND envelope for MONO
     const baseLpCutoff = config.baseLpCutoff || originalFreq; // baseLpCutoff should be current target

     const boostedFreq = Math.min(20000, baseLpCutoff * 2.0); // Boost from current (potentially env-affected) cutoff
     const boostedQ = Math.min(30, originalQ * 1.3);

      if (config.isFilterBoosting) {
           // Clear previous timeout if one exists to prevent premature reset
           if (config.filterBoostTimeoutId) {
               clearTimeout(config.filterBoostTimeoutId);
               config.filterBoostTimeoutId = null;
           }
      }
      config.isFilterBoosting = true;

     try {
         config.monoFilter.frequency.cancelScheduledValues(now);
         config.monoFilter.Q.cancelScheduledValues(now);
         config.monoFilter.frequency.setValueAtTime(originalFreq, now); // Ensure we start from actual current value
         config.monoFilter.Q.setValueAtTime(originalQ, now);

         config.monoFilter.frequency.linearRampToValueAtTime(boostedFreq, now + rampTime);
         config.monoFilter.Q.linearRampToValueAtTime(boostedQ, now + rampTime);

         const returnTimeConstant = 0.05;
         // Return to the ongoing target frequency (baseLpCutoff here represents the non-accented target)
         config.monoFilter.frequency.setTargetAtTime(baseLpCutoff, now + duration, returnTimeConstant);
         config.monoFilter.Q.setTargetAtTime(originalQ, now + duration, returnTimeConstant);

         config.filterBoostTimeoutId = setTimeout(() => {
             config.isFilterBoosting = false;
             config.filterBoostTimeoutId = null;
             // Ensure filter returns to its actual target if accent was cut short or for precision
             if (config.monoFilter && config.audioContext) {
                 const currentTime = config.audioContext.currentTime;
                 // Re-evaluate target based on current state, as baseLpCutoff might have changed
                 const currentBaseLpCutoff = config.baseLpCutoff || calculateKeyTrackedBaseCutoff(config.lastActiveNote || 'C3', state.lowPass, state.keyFollow); // Fallback note
                 try {
                    config.monoFilter.frequency.cancelScheduledValues(currentTime);
                    config.monoFilter.frequency.setTargetAtTime(currentBaseLpCutoff, currentTime, 0.01); // Smooth return
                    config.monoFilter.Q.setTargetAtTime(mapRange(Math.pow(state.resonance / 100, 1.5), 0, 1, 0.7, 10), currentTime, 0.01);
                 } catch(e) { console.warn("Error in accent timeout final reset", e); }
             }
         }, (duration + returnTimeConstant * 4) * 1000); // Ensure timeout covers the return ramp
     } catch (e) {
         console.error("Error applying filter accent:", e);
         config.isFilterBoosting = false;
         if (config.filterBoostTimeoutId) {
            clearTimeout(config.filterBoostTimeoutId);
            config.filterBoostTimeoutId = null;
        }
     }
}

// --- VOICE CREATION / MANAGEMENT ---

export function createVoice(note, velocity = 1, isAccented = false, shouldSlide = false, isTrill = false, audioCtxTime, voiceId = null) {
    if (!config.audioContext) {
         console.error("Audio context not available, cannot create voice.");
         return null;
    }
    const now = audioCtxTime || config.audioContext.currentTime;

    let actualShouldSlide = shouldSlide;
    let previousVoice = null;
    let isMonoSlideTakeover = false;

    if (!state.monoMode) {
        actualShouldSlide = false;
    }

    if (!state.monoMode) { // POLY
        releaseInactiveVoices(); // Clean up voices that have finished their release
        const activeVoices = config.voices.filter(v => v && v.active);
        if (activeVoices.length >= MAX_POLY_VOICES) {
            activeVoices.sort((a, b) => (a.audioStartTime || 0) - (b.audioStartTime || 0)); // Sort by audio context start time
            const voiceToSteal = activeVoices[0];
            if (voiceToSteal) {
                 // console.log(`Poly limit: Stealing voice ${voiceToSteal.id} (Note: ${voiceToSteal.note})`);
                 releaseVoiceById(voiceToSteal.id); // Start release of the oldest voice
            }
        }
    } else { // MONO
         if (actualShouldSlide) {
            if (config.voices.length > 0) {
                previousVoice = config.voices[0]; // Get the current (soon to be previous) MONO voice
                if (!previousVoice || !previousVoice.active) { // If no active voice, or it's null
                     previousVoice = null; actualShouldSlide = false;
                } else {
                    if (previousVoice.note === note) { // Sliding to the same note = retrigger, not a pitch slide
                         actualShouldSlide = false;
                         releaseVoiceById(previousVoice.id); // Release old one
                         previousVoice = null;
                    } else { // Different note, prepare for slide
                         previousVoice.active = false; // Mark old voice as inactive
                         previousVoice.markedForCleanup = true; // Custom flag to ensure it's cleaned up after node transfer
                         isMonoSlideTakeover = true;
                    }
                }
            } else { actualShouldSlide = false; } // No previous voice exists for slide
         }

         // If the new note is a trill AND a slide was requested (but not a takeover slide),
         // trill takes precedence. Release any previous voice that was considered for a non-takeover slide.
         if (isTrill && actualShouldSlide && !isMonoSlideTakeover) {
            actualShouldSlide = false;
            if (previousVoice) {
                // Ensure previous voice's trill timeout is cleared before release
                prepareVoiceForStateChange(previousVoice, now);
                releaseVoiceById(previousVoice.id);
                previousVoice = null;
            }
         }
         // If it's just a trill without slide, and there's an existing mono voice,
         // that existing voice needs to be prepared/released before the new trilling voice starts.
         // This is handled if actualShouldSlide is false, and a previousVoice exists.
         else if (isTrill && !actualShouldSlide && config.voices.length > 0 && config.voices[0]?.active) {
            previousVoice = config.voices[0];
            prepareVoiceForStateChange(previousVoice, now);
            releaseVoiceById(previousVoice.id);
            previousVoice = null;
         }
         // If it's not a slide, not a trill, and there's an existing mono voice, release it.
         // This is the standard mono re-trigger case.
         else if (!actualShouldSlide && !isTrill && config.voices.length > 0 && config.voices[0]?.active) {
            previousVoice = config.voices[0];
            prepareVoiceForStateChange(previousVoice, now);
            releaseVoiceById(previousVoice.id);
            previousVoice = null;
         }
    }

    // Skip voice creation if all oscillator levels are zero
    if (state.sawLevel <= 0 && state.squareLevel <= 0 && state.triangleLevel <= 0 && state.subLevel <= 0 && state.noiseLevel <= 0) {
         if (state.monoMode && previousVoice && !actualShouldSlide && !isMonoSlideTakeover && previousVoice.markedForCleanup) {
              // If slide was intended but levels are zero, and it wasn't a takeover, release the previous voice
              releaseVoiceById(previousVoice.id);
         }
        return null;
    }

    // --- Voice Object Initialization ---
    const voice = {
        id: voiceId || (Date.now() + Math.random()),
        note: note,
        baseNoteFreq: getNoteFrequency(note), // Untransposed base frequency of the MIDI note
        oscillators: {}, // Stores main 'output' nodes (osc or comparator) for reference
        gains: {},       // Stores the FINAL amp gain node for envelope control for each osc type
        _internalNodes: {}, // Stores ALL internal nodes (osc, width, sum, gain) for cleanup
        active: true,
        startTime: performance.now(), // For sorting, less critical than audioStartTime
        audioStartTime: now,          // AudioContext time, critical for envelopes
        releaseStartTime: null,
        isAccented: isAccented,
        isSliding: actualShouldSlide && !isTrill, // Slide only if not trilling
        isTrilling: isTrill && state.monoMode,    // Trill only in mono mode
        isGliding: false,             // True if this voice IS a standard glide
        glideStartTime: 0,
        glideDuration: 0,
        glideStartFreq: 0,
        glideTargetFreq: 0,
        trillTimeoutId: null,         // Timeout for trill cleanup
        autoReleaseTimeoutId: null,   // Timeout for sequencer auto-release
        glideTimeoutId: null,         // Timeout for glide completion
        slideTimeoutId: null,         // Timeout for slide completion
        filterNodes: { hp: null, lp: null }, // Per-voice filters for POLY
        filterEnvModulator: null,            // GainNode for POLY filter LFO modulation
        filterModLfoModulator: null,         // Legacy or secondary POLY filter LFO mod
        filterEnvData: null, // Stores { baseCutoff, currentCutoff, sustainCutoff, startTime, attackTime, decayTimeConstant, inRelease } for POLY filter env
        baseCutoff: 0, // Stores the key-tracked, pre-envelope LP cutoff for this POLY voice
    };

    try {
        const freq = voice.baseNoteFreq; // Use the stored untransposed base frequency of the note
        const sourceTypes = ['saw', 'square', 'triangle', 'sub', 'noise'];

        sourceTypes.forEach(type => {
            const level = state[`${type}Level`] || 0;
            if (level > 0) {
                const nodeNames = {
                    osc: `${type}Osc`, // The primary oscillator (e.g. saw, or the saw for PWM)
                    baseFreqStorage: `${type}BaseFrequency`, // Stores untransposed, post-initial-drift freq for *this osc type*
                    gain: `${type}Gain`, // Name for the amp envelope gain node (not used in _internalNodes directly for this)
                    width: `${type}WidthControl`, // For PWM
                    sum: `${type}Summing`        // For PWM
                };
                let reusedNodes = false; let newOscGainNode = null;

                if (isMonoSlideTakeover && previousVoice) {
                    const prevOscNode = previousVoice._internalNodes?.[nodeNames.osc];
                    const prevAmpEnvGainNode = previousVoice.gains?.[type]; // The gain node targeted by amp envelope
                    const prevMixerGainNode = previousVoice.mixerGains?.[type]; // The mixer gain node
                    const prevWidthNode = (type === 'square') ? previousVoice._internalNodes?.[nodeNames.width] : null;
                    const prevSummingNode = (type === 'square') ? previousVoice._internalNodes?.[nodeNames.sum] : null;
                    const prevComparatorNode = (type === 'square') ? previousVoice.oscillators?.square : null;

                    // Check if essential nodes exist for reuse
                    if (prevOscNode && prevAmpEnvGainNode && prevMixerGainNode && (type !== 'square' || (prevWidthNode && prevSummingNode && prevComparatorNode))) {
                         // Transfer nodes to new voice
                         voice._internalNodes[nodeNames.osc] = prevOscNode;
                         voice.gains[type] = prevAmpEnvGainNode; // This is the crucial one for amp envelope

                         // Transfer mixer gain node
                         if (!voice.mixerGains) voice.mixerGains = {};
                         voice.mixerGains[type] = prevMixerGainNode;

                         if (type === 'square') {
                             voice._internalNodes[nodeNames.width] = prevWidthNode;
                             voice._internalNodes[nodeNames.sum] = prevSummingNode;
                             voice.oscillators.square = prevComparatorNode; // This is the WaveShaper
                         } else {
                            voice.oscillators[type] = prevOscNode; // Direct oscillator
                         }
                         // Transfer base frequency storage if it exists (drifted, untransposed)
                         if (previousVoice._internalNodes?.[nodeNames.baseFreqStorage]) {
                            voice._internalNodes[nodeNames.baseFreqStorage] = previousVoice._internalNodes[nodeNames.baseFreqStorage];
                         }

                         // Remove transferred nodes from previousVoice object to prevent double cleanup/control
                         if (previousVoice._internalNodes) {
                            delete previousVoice._internalNodes[nodeNames.osc];
                            if (type === 'square') {
                                delete previousVoice._internalNodes[nodeNames.width];
                                delete previousVoice._internalNodes[nodeNames.sum];
                            }
                         }
                         if (previousVoice.gains) delete previousVoice.gains[type]; // Remove amp env gain from old
                         if (previousVoice.mixerGains) delete previousVoice.mixerGains[type]; // Remove mixer gain from old
                         if (previousVoice.oscillators) delete previousVoice.oscillators[type];


                         if (prevOscNode.frequency) { // This is the oscillator node being reused
                            const slideTime = 0.08; // TB-303 slide time
                            const fromFreqTransposed = prevOscNode.frequency.value; // Current actual frequency of the oscillator
                            let toFreqRatio = (type === 'sub') ? getSubTranspositionRatio() : getMainTranspositionRatio();
                            const toFreqTarget = freq * toFreqRatio; // New note's base freq * current transposition

                            try {
                                prevOscNode.frequency.cancelScheduledValues(now); // CRITICAL: Cancel any pitch mod/transposition targets
                                prevOscNode.frequency.setValueAtTime(fromFreqTransposed, now);
                                prevOscNode.frequency.exponentialRampToValueAtTime(toFreqTarget, now + slideTime);

                                // Set timeout on the NEW voice to clear its isSliding flag and finalize frequency
                                voice.slideTimeoutId = setTimeout(() => {
                                    if (voice && voice.isSliding && voice.audioStartTime === now) { // Check if this is the voice that initiated the slide
                                        try {
                                            // The oscillator (prevOscNode) is now part of the new `voice` object
                                            const currentOscNode = voice._internalNodes[`${type}Osc`];
                                            if (currentOscNode && currentOscNode.frequency) {
                                                const currentTime = config.audioContext.currentTime;
                                                currentOscNode.frequency.cancelScheduledValues(currentTime);
                                                currentOscNode.frequency.setValueAtTime(toFreqTarget, currentTime); // Set precisely to target
                                            }
                                        } catch(e) { console.warn(`Error setting final slide freq on new voice (${type}):`, e); }
                                        voice.isSliding = false; // Clear flag for the NEW voice
                                    }
                                }, slideTime * 1000 + GLIDE_SLIDE_END_BUFFER_MS);

                            } catch (e) { console.error(`Error applying slide ramp to ${type}: ${e.message}`); }
                         }
                         reusedNodes = true;
                    } else {
                        // Failed to reuse essential nodes for slide for this oscillator type.
                        if(previousVoice) previousVoice.markedForCleanup = true; // Ensure old voice is fully cleaned
                        // This specific oscillator type won't slide by takeover. It will be created fresh.
                        // The overall voice.isSliding flag (set at voice init) determines if other types slide.
                    }
                }

                if (!reusedNodes) { // Create new nodes if not reused (or if slide reuse failed for this type)
                     switch(type) {
                          case 'saw': newOscGainNode = createOscillator(voice, type, 'sawtooth', freq, level, velocity, now); break;
                          case 'triangle': newOscGainNode = createOscillator(voice, type, 'triangle', freq, level, velocity, now); break;
                          case 'square': newOscGainNode = createPWMOscillator(voice, 'square', freq, level, velocity, now); break;
                          case 'sub': newOscGainNode = createOscillator(voice, 'sub', 'square', freq, level, velocity, now); break;
                          case 'noise': newOscGainNode = createNoiseSource(voice, level, velocity, now); break;
                     }
                     if(newOscGainNode) {
                        voice.gains[type] = newOscGainNode; // Assign the final amp gain node
                     }
                }
            }
        });

        // --- Filter Setup ---
        if (!state.monoMode) { // POLY filter setup
             voice.filterNodes.hp = config.audioContext.createBiquadFilter();
             voice.filterNodes.hp.type = 'highpass';
             const baseHpCutoff = mapRange(state.highPass, 0, 100, 20, 10000, true);
             const baseResonance = mapRange(Math.pow(state.resonance / 100, 1.5), 0, 1, 0.7, 10);
             const hpResonance = Math.max(0.1, baseResonance * 0.5);
             voice.filterNodes.hp.frequency.setValueAtTime(baseHpCutoff, now);
             voice.filterNodes.hp.Q.setValueAtTime(hpResonance, now);

             voice.filterNodes.lp = config.audioContext.createBiquadFilter();
             voice.filterNodes.lp.type = 'lowpass';
             voice.baseCutoff = calculateKeyTrackedBaseCutoff(voice.note, state.lowPass, state.keyFollow); // Key-tracked, pre-envelope
             voice.filterNodes.lp.Q.setValueAtTime(baseResonance, now);

             // === AUDIO-RATE MODULATION ARCHITECTURE ===
             // Base Cutoff Source (user knob + key tracking)
             voice.filterBaseCutoffSource = config.audioContext.createConstantSource();
             voice.filterBaseCutoffSource.offset.value = voice.baseCutoff;
             voice.filterBaseCutoffSource.connect(voice.filterNodes.lp.frequency);
             voice.filterBaseCutoffSource.start(now);

             // Envelope Modulation (ConstantSource for depth + GainNode for ADSR shape)
             voice.filterEnvelopeSource = config.audioContext.createConstantSource();
             voice.filterEnvelopeGain = config.audioContext.createGain();
             voice.filterEnvelopeGain.gain.value = 0; // Start at 0, will be animated by envelope

             // Envelope depth in Hz (how many Hz the envelope can sweep)
             const envModAmount = state.envAmount / 100;
             const envModFactor = Math.pow(2, envModAmount * 6); // Max 6 octave sweep
             const envDepthHz = voice.baseCutoff * (envModFactor - 1);
             voice.filterEnvelopeSource.offset.value = envDepthHz;

             voice.filterEnvelopeSource.connect(voice.filterEnvelopeGain);
             voice.filterEnvelopeGain.connect(voice.filterNodes.lp.frequency);
             voice.filterEnvelopeSource.start(now);

             // LFO Modulation (OscillatorNode + GainNode for depth)
             voice.filterLfoOsc = config.audioContext.createOscillator();
             voice.filterLfoGain = config.audioContext.createGain();

             // LFO frequency from mod LFO rate
             const lfoRatePercent = state.modLfoRate / 100;
             const lfoFreqHz = 0.1 * Math.pow(20 / 0.1, lfoRatePercent); // 0.1 Hz to 20 Hz
             voice.filterLfoOsc.frequency.value = lfoFreqHz;

             // LFO depth in Hz
             const lfoDepthPercent = state.filterMod / 100;
             const maxModOctaves = 2; // LFO can sweep ±2 octaves
             const lfoDepthHz = voice.baseCutoff * (Math.pow(2, maxModOctaves) - 1) * lfoDepthPercent;
             voice.filterLfoGain.gain.value = lfoDepthHz;

             voice.filterLfoOsc.type = 'sine'; // Default to sine, can be updated based on modLfoWaveform
             voice.filterLfoOsc.connect(voice.filterLfoGain);
             voice.filterLfoGain.connect(voice.filterNodes.lp.frequency);
             voice.filterLfoOsc.start(now);

             // Per-parameter modulation: Create audio-rate LFOs for filter params
             // Import is at top of file - check if modulations are active for filter params
             if (state.perParamModulations) {
                 const audioRateFilterParams = ['filter.lowPass', 'filter.highPass', 'filter.resonance'];
                 for (const paramId of audioRateFilterParams) {
                     const modConfig = state.perParamModulations[paramId];
                     if (modConfig && modConfig.enabled && modConfig.depth > 0) {
                         // Dynamically import and call createFilterParamLFO
                         import('../modules/perParamMod.js').then(module => {
                             module.createFilterParamLFO(voice, paramId, modConfig);
                         });
                     }
                 }
             }

             // Connect oscillator gains (voice.gains[type]) to this voice's filter chain
             Object.values(voice.gains).forEach(oscGainNode => {
                 if (oscGainNode) try { oscGainNode.connect(voice.filterNodes.hp); } catch (e) { /* ignore */ }
             });
             try { voice.filterNodes.hp.connect(voice.filterNodes.lp); } catch(e){ /* ignore */ }

             // Connect this voice's LP filter to effects, master, and dry signal tap
             const finalOutputNode = voice.filterNodes.lp;
             if (config.reverbSendGain) try { finalOutputNode.connect(config.reverbSendGain); } catch(e){ /* ignore */ }
             if (config.delaySendGain) try { finalOutputNode.connect(config.delaySendGain); } catch(e){ /* ignore */ }
             if (config.drySignalTap) try { finalOutputNode.connect(config.drySignalTap); } catch(e){ /* ignore */ }
             try { finalOutputNode.connect(config.masterGain); } catch (e) { console.error("Error connecting per-voice LP to master gain:", e); }

        } else { // MONO: connect oscillator gains to shared filter input
              Object.values(voice.gains).forEach(oscGainNode => {
                 if (oscGainNode && config.monoFilterInput) try { oscGainNode.connect(config.monoFilterInput); } catch (e) { /* ignore */ }
             });
        }

        // Cleanup previous MONO voice if it was marked (e.g. after slide takeover or failed slide)
        if (previousVoice && previousVoice.markedForCleanup) {
            // If slide takeover was successful, its sound nodes are already transferred or unlinked.
            // This cleanup is mainly for its references and removing from array.
            // Pass 'isMonoSlideTakeover' to potentially expedite cleanup if it was a successful takeover.
            cleanupRemainingNodes(previousVoice, isMonoSlideTakeover);
        }


        // Apply Amplitude Envelope (unless it's a slide takeover, where amp env continues on the reused gain node)
        if (!isMonoSlideTakeover) {
             applyAmplitudeEnvelope(voice, now, velocity, isAccented);
        }

        // Apply Filter Envelope (POLY voices only, and not on slide takeover)
        if (!state.monoMode && !isMonoSlideTakeover) { // Filter env for POLY, not on slide
             if (state.envAmount > 0) {
                 applyPolyFilterEnvelope(voice, now, isAccented);
             } else {
                 // Even if envAmount is zero, set baseCutoff and initialize filterEnvData
                 voice.filterNodes.lp.frequency.setValueAtTime(voice.baseCutoff, now);
                 voice.filterEnvData = { // Basic data even if no envelope applied
                    baseCutoff: voice.baseCutoff,
                    currentCutoff: voice.baseCutoff,
                    sustainCutoff: voice.baseCutoff,
                    startTime: now,
                    attackTime: 0,
                    decayTimeConstant: Math.max(0.001, (0.001 + Math.pow(state.decay / 100, 2) * 9.999) / 4), // Store a default decay constant
                    inRelease: false
                 };
             }
        }

        // --- Trill Scheduling ---
        if (voice.isTrilling) { // isTrilling flag is already set based on input and monoMode
            // Validate voice state before scheduling trill
            if (!voice.active || !config.audioContext || config.audioContext.state === 'closed') {
                console.warn('[Trill] Aborting trill - invalid voice or audio context state');
                voice.isTrilling = false;
            } else {
                const originalFreqUntransposed = voice.baseNoteFreq;
                const trillNoteUpStr = findScaleNote(voice.note, 1); // Find note one step up in scale

                if (!trillNoteUpStr) { // Cannot find a note to trill to
                    voice.isTrilling = false; // Abort trill
                } else {
                const trillFreqUpUntransposed = getNoteFrequency(trillNoteUpStr);

                // Use currentMsPerStep from config (set by clock with swing), fallback to BPM calc
                const stepDuration = config.currentMsPerStep ? config.currentMsPerStep / 1000 : 0.125;
                const segmentDuration = Math.max(0.01, stepDuration / 3); // Divide step into 3 parts
                const slidePortion = segmentDuration * TRILL_SLIDE_TIME_FACTOR;
                const holdPortion = segmentDuration * 0.25; // Increased from (1 - TRILL_SLIDE_TIME_FACTOR) to 0.25
                const totalTrillDuration = (holdPortion * 2) + (slidePortion * 2); // Full cycle

                let trillSchedulingSuccessful = true;

                Object.values(voice._internalNodes).forEach(oscNode => {
                    if (!trillSchedulingSuccessful || !oscNode || !oscNode.frequency || !oscNode.baseUntransposedDriftedFreq) return;

                    const oscFreqParam = oscNode.frequency;
                    // Determine transposition for this oscillator
                    const currentTranspositionRatio = (oscNode.oscName && oscNode.oscName.startsWith('sub')) ? getSubTranspositionRatio() : getMainTranspositionRatio();
                    // The base of the trill is the current authoritative frequency
                    const baseOscFreqTransposed = oscNode.authoritativeFreq;

                    // Apply slight drift to the trilled-to note
                    const trillNoteDriftFactor = (oscNode.oscName === 'sub') ? 1 : Math.pow(2, ((Math.random() * 2 - 1) * (state.drift * 0.2)) / 1200);
                    const trillOscFreqUpTransposed = trillFreqUpUntransposed * currentTranspositionRatio * trillNoteDriftFactor;

                    // Store the frequency to return to after trill completes
                    oscNode.finalTrillTargetFreq = baseOscFreqTransposed;

                    try {
                        oscFreqParam.cancelScheduledValues(now); // Clear any previous schedules
                        oscFreqParam.setValueAtTime(baseOscFreqTransposed, now); // Start at base

                        // Hold at base, then ramp to upper trill note
                        oscFreqParam.setValueAtTime(baseOscFreqTransposed, now + holdPortion);
                        oscFreqParam.exponentialRampToValueAtTime(Math.max(0.01, trillOscFreqUpTransposed), now + holdPortion + slidePortion);

                        // Hold at upper note, then ramp back to base
                        oscFreqParam.setValueAtTime(trillOscFreqUpTransposed, now + holdPortion + slidePortion + holdPortion);
                        oscFreqParam.exponentialRampToValueAtTime(Math.max(0.01, baseOscFreqTransposed), now + holdPortion + slidePortion + holdPortion + slidePortion);

                        // Explicitly set final value to ensure it ends correctly
                        oscFreqParam.setValueAtTime(baseOscFreqTransposed, now + totalTrillDuration);
                    } catch (e) {
                        console.warn(`Error scheduling trill for ${oscNode.oscName || 'osc'}:`, e);
                        if (oscFreqParam && baseOscFreqTransposed > 0) try { oscFreqParam.setValueAtTime(baseOscFreqTransposed, now); } catch(e2) {}
                        if (oscNode.finalTrillTargetFreq) delete oscNode.finalTrillTargetFreq;
                        trillSchedulingSuccessful = false;
                    }
                });

                if (!trillSchedulingSuccessful) {
                    voice.isTrilling = false; // Abort trill if scheduling failed for any oscillator
                } else {
                    // Set a timeout to stop the trill and restore pitch if it completes naturally
                    const trillDuration = totalTrillDuration * 1000 + GLIDE_SLIDE_END_BUFFER_MS + 20;
                    voice.trillTimeoutId = setTimeout(() => {
                        const currentVoiceInArray = config.voices.find(v => v && v.id === voice.id);
                        if (currentVoiceInArray &&
                            currentVoiceInArray.id === voice.id &&
                            currentVoiceInArray.audioStartTime === voice.audioStartTime && // Check instance
                            currentVoiceInArray.isTrilling && // Still in trill state
                            config.audioContext &&
                            config.audioContext.state !== 'closed') { // Ensure context is still valid

                            // Validate oscillator nodes still exist
                            const hasValidOscNodes = Object.values(currentVoiceInArray._internalNodes || {})
                                .some(n => n && n.frequency);

                            if (hasValidOscNodes) {
                                stopTrill(currentVoiceInArray, config.audioContext.currentTime, true);
                            } else {
                                console.warn('[Trill timeout] Voice oscillators already cleaned up, clearing trill state');
                                currentVoiceInArray.isTrilling = false;
                            }
                        }
                    }, trillDuration);
                }
            }
            }
        }

        // Store last note frequency (untransposed) and note string
        config.lastNoteFrequency = freq;
        config.lastActiveNote = note; // Store the note string as well for keytracking reference in effects.js

        // Final Voice Array Management
        config.voices = config.voices.filter(v => v != null && v.id !== voice.id); // Remove nulls and any potential duplicate old voice
        
        if (state.monoMode) {
            // In MONO mode, if not sliding, previous voices are cleared by releaseAllVoices in audio.js
            // If sliding, previousVoice was handled. Just add the new one.
            config.voices = [voice];
        } else {
            config.voices.push(voice);
        }

         // Temporary Filter Accent Boost (MONO only)
         if (isAccented && state.monoMode) {
             applyTemporaryFilterAccent(0.15);
         }

        // Attach audio-rate modulations to the new voice
        attachAudioRateModulationsToVoice(voice);

        // Note: gateTriggered event now dispatched in triggerNote() BEFORE voice creation
        // This ensures S&H values are sampled before envelopes are applied

        return voice;

    } catch (e) {
        console.error(`Error creating voice for note ${note}:`, e);
         try { if(voice) cleanupRemainingNodes(voice); } catch (cleanupErr) {} // Attempt cleanup on error
        return null;
    }
}

// --- OSCILLATOR / SOURCE CREATION HELPERS ---

// Creates standard oscillator (Saw, Triangle, Sub), applies drift/glide, returns final GainNode
function createOscillator(voice, name, type, baseFreq, level, velocity, now) { // baseFreq is untransposed note frequency
    if (!config.audioContext) return null;
    const osc = config.audioContext.createOscillator();
    osc.type = type;

    let freqForOscillator = baseFreq; // Start with untransposed note frequency
    let driftOffsetCents = 0;

    if (state.drift > 0 && name !== 'sub') { // Typically don't drift sub
        const maxDriftCents = state.drift * 0.4; // e.g., 100% = 10 cents max
        driftOffsetCents = (Math.random() * 2 - 1) * maxDriftCents; // -maxDrift to +maxDrift cents
        freqForOscillator *= Math.pow(2, driftOffsetCents / 1200);
    }
    // Store this potentially drifted, but still untransposed frequency for this oscillator type
    voice._internalNodes[`${name}BaseFrequency`] = freqForOscillator;

    // Now apply transposition for the oscillator's actual frequency
    let targetFreq = freqForOscillator * ((name === 'sub') ? getSubTranspositionRatio() : getMainTranspositionRatio());

    // Store properties on oscillator node for trill and transposition tracking
    osc.baseUntransposedDriftedFreq = freqForOscillator;
    osc.authoritativeFreq = targetFreq;
    osc.oscName = name;

    let applyStandardGlide = state.glide > 0 && !voice.isSliding && !voice.isTrilling && state.monoMode; // Glide only in MONO, not for TB-slide or trill
    let startFreq = targetFreq;

    // Ensure we only glide if this is NOT the first note played overall, or if there's a valid previous voice.
    const canGlide = config.lastNoteFrequency !== null && (!config.voices[0] || config.voices[0].id !== voice.id || config.voices.length === 0);


    if (applyStandardGlide && canGlide) {
        const previousMonoVoice = config.voices.find(v => v.id !== voice.id && v.active); // Find the *active* previous mono voice
        if (previousMonoVoice && previousMonoVoice._internalNodes[`${name}Osc`]) {
            startFreq = previousMonoVoice._internalNodes[`${name}Osc`].frequency.value; // Glide from actual current freq of prev osc
        } else { // Fallback to theoretical last pitch if no active previous voice or specific osc
            let freqRatio = (name === 'sub') ? getSubTranspositionRatio() : getMainTranspositionRatio();
            startFreq = config.lastNoteFrequency * freqRatio;
        }

        if (Math.abs(startFreq - targetFreq) > 0.5) { // Only glide if notes are different enough
            const glideTime = Math.max(0.001, (state.glide / 100) * 0.5); // Map 0-100% to 0-0.5s
            try {
                osc.frequency.cancelScheduledValues(now); // CRITICAL: cancel any pitch mod targets
                osc.frequency.setValueAtTime(startFreq, now);
                osc.frequency.linearRampToValueAtTime(targetFreq, now + glideTime);
                voice.isGliding = true;
                voice.glideStartTime = now;
                voice.glideDuration = glideTime;
                voice.glideStartFreq = startFreq;
                voice.glideTargetFreq = targetFreq; // Store the target of the glide

                 voice.glideTimeoutId = setTimeout(() => {
                    // Enhanced validation: ensure voice still exists and matches
                    const currentVoice = config.voices.find(v => v && v.id === voice.id);
                    if (currentVoice && currentVoice.isGliding && currentVoice.glideStartTime === now) { // Ensure it's the same glide instance
                        currentVoice.isGliding = false; // Primarily set the flag
                        // Optional: force to target if precision is an issue after ramp.
                        // For now, let the ramp complete. If issues with pitch after glide, uncomment:
                        // const currentTime = config.audioContext.currentTime;
                        // try {
                        //     osc.frequency.cancelScheduledValues(currentTime);
                        //     osc.frequency.setValueAtTime(voice.glideTargetFreq, currentTime);
                        // } catch (e) { console.warn(`Error setting final glide freq for ${name}:`, e); }
                    }
                }, glideTime * 1000 + GLIDE_SLIDE_END_BUFFER_MS);

            } catch (e) {
                console.error(`Error applying glide to ${name}: ${e.message}`);
                osc.frequency.setValueAtTime(targetFreq, now); // Fallback
                voice.isGliding = false;
            }
        } else { // Notes too close, or startFreq is targetFreq
            if (!voice.isSliding && !voice.isTrilling) {
                osc.frequency.cancelScheduledValues(now); // Still cancel to clear prior mod targets
                osc.frequency.setValueAtTime(targetFreq, now);
            }
            voice.isGliding = false;
        }
    } else { // No glide
        if (!voice.isSliding && !voice.isTrilling) { // Set frequency if not sliding/trilling
            osc.frequency.cancelScheduledValues(now); // Clear prior mod targets
            osc.frequency.setValueAtTime(targetFreq, now);
        }
        voice.isGliding = false;
    }

    voice._internalNodes[`${name}Osc`] = osc;
    voice.oscillators[name] = osc; // Reference to the actual oscillator

    // Create mixer gain node (for real-time level control)
    const mixerGain = config.audioContext.createGain();
    const mixerLevel = state[`${name}Level`] || 0;
    mixerGain.gain.value = mixerLevel / 100; // 0-100 -> 0-1

    // Create envelope gain node (for ADSR control)
    const envelopeGain = config.audioContext.createGain();
    envelopeGain.gain.value = 0; // Start silent

    // Store mixer gain reference
    if (!voice.mixerGains) voice.mixerGains = {};
    voice.mixerGains[name] = mixerGain;

    try {
        osc.connect(mixerGain);
        mixerGain.connect(envelopeGain);
        osc.start(now);
        return envelopeGain; // Return the envelope gain node
    } catch (e) { console.error(`Error connecting/starting ${name} oscillator: ${e.message}`); return null; }
}

// Creates PWM oscillator, applies drift/glide to underlying saw, returns final GainNode
function createPWMOscillator(voice, name, baseFreq, level, velocity, now) { // baseFreq is untransposed note frequency
    if (!config.audioContext) return null;
    const ctx = config.audioContext;

    const saw = ctx.createOscillator(); saw.type = 'sawtooth';
    const widthControl = ctx.createConstantSource();
    const comparator = ctx.createWaveShaper(); comparator.curve = pwmCurve;
    const summingNode = ctx.createGain(); summingNode.gain.value = 1.0;

    // Create mixer gain node (for real-time level control)
    const mixerGain = ctx.createGain();
    const mixerLevel = state[`${name}Level`] || 0;
    mixerGain.gain.value = mixerLevel / 100; // 0-100 -> 0-1

    // Create envelope gain node (for ADSR control)
    const envelopeGain = ctx.createGain();
    envelopeGain.gain.value = 0; // Start silent

    voice._internalNodes[`${name}Osc`] = saw; // The underlying saw
    voice._internalNodes[`${name}WidthControl`] = widthControl;
    voice._internalNodes[`${name}Summing`] = summingNode;
    voice.oscillators[name] = comparator; // The PWM output node reference

    // Store mixer gain reference
    if (!voice.mixerGains) voice.mixerGains = {};
    voice.mixerGains[name] = mixerGain;

    let freqForSaw = baseFreq;
    let driftOffsetCents = 0;
    if (state.drift > 0) {
        const maxDriftCents = state.drift * 0.2; // Slightly more drift for square?
        driftOffsetCents = (Math.random() * 2 - 1) * maxDriftCents;
        freqForSaw *= Math.pow(2, driftOffsetCents / 1200);
    }
    voice._internalNodes[`${name}BaseFrequency`] = freqForSaw; // Store drifted, untransposed base for the saw

    let targetFreq = freqForSaw * getMainTranspositionRatio(); // Apply main transposition

    // Store properties on saw oscillator node for trill and transposition tracking
    saw.baseUntransposedDriftedFreq = freqForSaw;
    saw.authoritativeFreq = targetFreq;
    saw.oscName = name;

    let startFreq = targetFreq;
    let applyStandardGlide = state.glide > 0 && !voice.isSliding && !voice.isTrilling && state.monoMode;
    const canGlide = config.lastNoteFrequency !== null && (!config.voices[0] || config.voices[0].id !== voice.id || config.voices.length === 0);


    if (applyStandardGlide && canGlide) {
        const previousMonoVoice = config.voices.find(v => v.id !== voice.id && v.active);
        if (previousMonoVoice && previousMonoVoice._internalNodes[`${name}Osc`]) { // Check for the saw of PWM
            startFreq = previousMonoVoice._internalNodes[`${name}Osc`].frequency.value;
        } else {
            startFreq = config.lastNoteFrequency * getMainTranspositionRatio();
        }

        if (Math.abs(startFreq - targetFreq) > 0.5) { // Threshold
            const glideTime = Math.max(0.001, (state.glide / 100) * 0.5);
            try {
                saw.frequency.cancelScheduledValues(now); // CRITICAL
                saw.frequency.setValueAtTime(startFreq, now);
                saw.frequency.linearRampToValueAtTime(targetFreq, now + glideTime);
                voice.isGliding = true; voice.glideStartTime = now; voice.glideDuration = glideTime;
                voice.glideStartFreq = startFreq; voice.glideTargetFreq = targetFreq;
                 voice.glideTimeoutId = setTimeout(() => {
                    // Enhanced validation: ensure voice still exists and matches
                    const currentVoice = config.voices.find(v => v && v.id === voice.id);
                    if (currentVoice && currentVoice.isGliding && currentVoice.glideStartTime === now) {
                        currentVoice.isGliding = false;
                        // Optional: force to target
                        // const currentTime = config.audioContext.currentTime;
                        // try {
                        //     saw.frequency.cancelScheduledValues(currentTime);
                        //     saw.frequency.setValueAtTime(voice.glideTargetFreq, currentTime);
                        // } catch (e) { console.warn(`Error setting final glide freq for PWM saw:`, e); }
                    }
                }, glideTime * 1000 + GLIDE_SLIDE_END_BUFFER_MS);
            } catch (e) {
                console.error(`Error applying glide to PWM saw: ${e.message}`);
                saw.frequency.setValueAtTime(targetFreq, now); voice.isGliding = false;
            }
        } else { // Notes too close
            if (!voice.isSliding && !voice.isTrilling) {
                saw.frequency.cancelScheduledValues(now); // Still cancel
                saw.frequency.setValueAtTime(targetFreq, now);
            }
            voice.isGliding = false;
        }
    } else { // No glide
        if (!voice.isSliding && !voice.isTrilling) { // Set frequency if not sliding/trilling
            saw.frequency.cancelScheduledValues(now); // Still cancel
            saw.frequency.setValueAtTime(targetFreq, now);
        }
        voice.isGliding = false;
    }

    const initialWidth = Math.max(0.05, Math.min(0.95, state.pulseWidth / 100));
    const initialOffset = (initialWidth * 2) - 1;
    widthControl.offset.setValueAtTime(initialOffset, now);

    try {
        saw.connect(summingNode);
        widthControl.connect(summingNode);
        summingNode.connect(comparator);
        comparator.connect(mixerGain);
        mixerGain.connect(envelopeGain);
        saw.start(now);
        widthControl.start(now);
        return envelopeGain; // Return the envelope gain node
    } catch (e) { console.error(`Error connecting/starting PWM nodes: ${e.message}`); return null; }
}

// Creates Noise source, returns final GainNode
function createNoiseSource(voice, level, velocity, now) {
    if (!config.audioContext || !config.sampleRate) return null;
    try {
        const bufferSize = config.sampleRate; // 1 second buffer is usually enough
        const noiseBuffer = config.audioContext.createBuffer(1, bufferSize, config.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) { output[i] = Math.random() * 2 - 1; } // White noise

        const noise = config.audioContext.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        // Create mixer gain node (for real-time level control)
        const mixerGain = config.audioContext.createGain();
        const mixerLevel = state.noiseLevel || 0;
        mixerGain.gain.value = mixerLevel / 100; // 0-100 -> 0-1

        // Create envelope gain node (for ADSR control)
        const envelopeGain = config.audioContext.createGain();
        envelopeGain.gain.value = 0; // Start silent

        voice._internalNodes.noiseSource = noise; // The BufferSourceNode
        voice.oscillators.noise = noise; // Reference to the source itself for stopping

        // Store mixer gain reference
        if (!voice.mixerGains) voice.mixerGains = {};
        voice.mixerGains.noise = mixerGain;

        noise.connect(mixerGain);
        mixerGain.connect(envelopeGain);
        noise.start(now);
        return envelopeGain; // Return the envelope gain node
    } catch (e) {
        console.error(`Error creating noise source: ${e.message}`);
        return null;
    }
}


// --- ENVELOPE --- Split into Amplitude and Filter parts

// Apply Amplitude Envelope ONLY
function applyAmplitudeEnvelope(voice, now, velocity, isAccented = false) {
     if (!config.audioContext || !voice || !voice.gains) return;

      // Sample modulated ENV values for this voice (S&H values already sampled before voice creation)
      const attackValue = sampleParameterForVoice('envelope.attack', voice.id) ?? state.attack;
      const decayValue = sampleParameterForVoice('envelope.decay', voice.id) ?? state.decay;
      const sustainValue = sampleParameterForVoice('envelope.sustain', voice.id) ?? state.sustain;

      let attackTime = 0.001 + Math.pow(attackValue / 100, 2) * 3.999;
      let decayTime = 0.001 + Math.pow(decayValue / 100, 2) * 9.999;
      let sustainLevel = sustainValue / 100;
      let effectiveVelocity = velocity;

      if (isAccented) {
          effectiveVelocity *= 1.5;
          decayTime = Math.max(0.005, decayTime * 0.5); // Shorten decay, ensure minimum
      }

      for (const [type, gainNode] of Object.entries(voice.gains)) {
         if (!gainNode || !gainNode.gain) continue;

         // Check if mixer level is non-zero (mixer gain handles the level, envelope handles velocity/ADSR)
         let maxLevel = state[`${type}Level`] || 0;
         if (maxLevel <= 0) {
             try { gainNode.gain.cancelScheduledValues(now); gainNode.gain.setValueAtTime(0, now); } catch(e){}
             continue;
         }

         try {
            // Envelope gain only applies velocity and ADSR shape
            // Mixer level is handled by the mixer gain node
            const peakGain = effectiveVelocity;
            const ampGainParam = gainNode.gain;

            ampGainParam.cancelScheduledValues(now);
            ampGainParam.setValueAtTime(0, now);

            if (isAccented && attackTime > 0.003) {
                ampGainParam.linearRampToValueAtTime(peakGain * 1.1, now + 0.003); // Punch
                ampGainParam.linearRampToValueAtTime(peakGain, now + attackTime);
            } else if (attackTime > 0.001) {
                ampGainParam.linearRampToValueAtTime(peakGain, now + attackTime);
            } else { // Instantaneous attack
                 ampGainParam.setValueAtTime(peakGain, now);
            }

            const sustainValue = Math.max(0.0001, peakGain * sustainLevel); // Target sustain gain
            const decayTimeConstant = Math.max(0.001, decayTime / 4); // Time constant for exponential decay
            ampGainParam.setTargetAtTime(sustainValue, now + attackTime, decayTimeConstant);

         } catch (e) { console.error(`Error applying AMP envelope to ${type} for voice ${voice.id}: ${e.message}`); }
     }
}

// Apply Filter Envelope for POLY voices ONLY - AUDIO-RATE VERSION
function applyPolyFilterEnvelope(voice, now, isAccented = false) {
    // Guard clauses: only run for POLY voices with envelope gain
    if (!voice.filterEnvelopeGain || !config.audioContext) {
        return;
    }

    // If envAmount is zero, envelope gain stays at 0 (no modulation)
    if (state.envAmount <= 0) {
        voice.filterEnvelopeGain.gain.setValueAtTime(0, now);
        voice.filterEnvData = {
           baseCutoff: voice.baseCutoff,
           startTime: now,
           attackTime: 0,
           decayTimeConstant: Math.max(0.001, (0.001 + Math.pow(state.decay / 100, 2) * 9.999) / 4),
           inRelease: false,
           sustainLevel: 0, // No envelope
           isAccented: false
        };
        return;
    }

    try {
        // Animate envelope GAIN (0 → 1 → sustain level → 0 on release)
        const envelopeGain = voice.filterEnvelopeGain.gain;

        // Sample modulated ENV values for this voice
        const attackValue = sampleParameterForVoice('envelope.attack', voice.id) ?? state.attack;
        const decayValue = sampleParameterForVoice('envelope.decay', voice.id) ?? state.decay;
        const sustainValuePct = sampleParameterForVoice('envelope.sustain', voice.id) ?? state.sustain;

        let attackTime = 0.001 + Math.pow(attackValue / 100, 2) * 3.999;
        let decayTime = 0.001 + Math.pow(decayValue / 100, 2) * 9.999;
        let sustainLevel = sustainValuePct / 100;

        if (isAccented) {
            decayTime *= 0.5;
            decayTime = Math.max(0.005, decayTime);
        }

        // Attack: 0 → 1 (envelope gain reaches full depth)
        envelopeGain.cancelScheduledValues(now);
        envelopeGain.setValueAtTime(0, now);

        if (attackTime > 0.001) {
            envelopeGain.linearRampToValueAtTime(1, now + attackTime);
        } else {
            envelopeGain.setValueAtTime(1, now);
        }

        // Decay: 1 → sustainLevel (exponential decay to sustain)
        const decayTimeConstant = Math.max(0.001, decayTime / 4);
        envelopeGain.setTargetAtTime(sustainLevel, now + attackTime, decayTimeConstant);

        // Store envelope data for release
        voice.filterEnvData = {
            baseCutoff: voice.baseCutoff,
            startTime: now,
            attackTime: attackTime,
            decayTimeConstant: decayTimeConstant,
            inRelease: false,
            sustainLevel: sustainLevel,
            isAccented: isAccented
        };

    } catch (e) {
        console.error(`Error applying POLY FILTER envelope for voice ${voice.id}: ${e.message}`);
    }
}

// Helper function to calculate key tracking factor.
// Accepts either a note string (e.g., "C4") OR an object like { freq: number }
export function getKeyTrackingFactor(noteOrFreqObject) {
    let noteFreqValue;

    if (typeof noteOrFreqObject === 'string') {
        if (state.keyFollow <= 0) return 1.0;
        noteFreqValue = getNoteFrequency(noteOrFreqObject);
    } else if (typeof noteOrFreqObject === 'object' && noteOrFreqObject !== null && typeof noteOrFreqObject.freq === 'number') {
        if (state.keyFollow <= 0) return 1.0;
        noteFreqValue = noteOrFreqObject.freq;
    } else {
        return 1.0;
    }
    
    if (state.keyFollow <= 0) return 1.0;

    try {
        const keyFollowAmount = state.keyFollow / 100;
        const ratio = noteFreqValue / REFERENCE_FREQ_KEYTRACK;
        return Math.pow(ratio, keyFollowAmount * 1.0);
    } catch (e) {
        console.warn(`Error calculating key tracking factor: ${e.message}`);
        return 1.0;
    }
}

// Helper to calculate base LP cutoff with keytracking (used for POLY voice init)
// Made this function exportable for effects.js
export function calculateKeyTrackedBaseCutoff(note, lowPassSetting, keyFollowSetting) {
    let baseLp = mapRange(lowPassSetting, 0, 100, 20, 20000, true);
    if (keyFollowSetting > 0) {
        const keyFollowFactor = getKeyTrackingFactor(note); // Pass note string
        baseLp = Math.min(20000, baseLp * keyFollowFactor);
    }
    return baseLp;
}


// --- RELEASE / CLEANUP ---

export function releaseAllVoices() {
    // === Worklet path ===
    if (config.useWorklet && config.workletBridge) {
      config.workletBridge.releaseAllVoices();
      return;
    }

    // === Web Audio path ===
    if (!config.voices || !config.voices.length || !config.audioContext) return;
    const voicesToProcess = [...config.voices]; // Iterate over a copy as the array might be modified
    voicesToProcess.forEach(voice => {
        if (!voice) return;
        if (state.monoMode) {
            cleanupRemainingNodes(voice, true); // Immediate cleanup for MONO
        } else if (voice.active) {
            releaseVoiceById(voice.id);
        } else if (!voice.active && !voice.releaseStartTime) { // Orphaned POLY voice
            cleanupRemainingNodes(voice, false); // Standard cleanup
        }
    });
    if (state.monoMode) {
        config.voices = []; // Ensure array is empty after MONO cleanup
         if(config.monoFilterEnvModulator?.gain) { // Reset MONO filter LFO mod gain
             try {
                 const now = config.audioContext.currentTime;
                 config.monoFilterEnvModulator.gain.cancelScheduledValues(now);
                 config.monoFilterEnvModulator.gain.setValueAtTime(0, now); // Ensure it's reset to 0
            } catch(e){ console.warn("Error resetting monoFilterEnvModulator gain on releaseAll (mono):", e); }
         }
    }
}

export function releaseInactiveVoices() {
     if (!config.voices || state.monoMode || !config.audioContext) return; // Primarily for POLY
     const now = config.audioContext.currentTime;
     let cleanedCount = 0;
     config.voices = config.voices.filter(voice => {
         if (!voice) return false;
         if (voice.active) return true; // Keep active voices

         // If inactive but no releaseStartTime, it's an orphaned voice, clean it up.
         if (!voice.releaseStartTime) {
             console.warn(`Found orphaned POLY voice ${voice.id} (Note: ${voice.note}). Cleaning up.`);
             cleanupRemainingNodes(voice, false); // Standard cleanup for orphaned voice
             cleanedCount++;
             return false; // Remove from array
         }

         // Voice is inactive and has a releaseStartTime, check if it's time to clean up
         // Use stored releaseDuration if available (prevents bug when release param changes during release)
         const releaseDuration = voice.releaseDuration ?? (0.001 + Math.pow(state.release / 100, 2) * 9.999);
         const cleanupBuffer = 0.5; // Generous buffer
         const expectedEndTime = voice.releaseStartTime + releaseDuration + cleanupBuffer;
         
         if (now >= expectedEndTime) {
             cleanupRemainingNodes(voice, false); // Standard cleanup
             cleanedCount++;
             return false; // Remove from array
         }
         return true; // Keep voice, still in release phase or buffer period
     });
    //  if (cleanedCount > 0) console.log(`releaseInactiveVoices: Cleaned ${cleanedCount} POLY voices.`);
}

// --- OTHER FUNCTIONS ---

export function updateOscillatorTransposition() {
    // === Worklet path ===
    if (config.useWorklet && config.workletBridge) {
      // Import utility function dynamically
      import('../utils.js').then(utilsModule => {
        const mainSemitones = utilsModule.transpositionToSemitones(state.mainTransposition);
        const subSemitones = utilsModule.transpositionToSemitones(state.subTransposition);

        config.workletBridge.updateAllParameters({
          octaveTranspose: mainSemitones,
          subOctaveTranspose: subSemitones
        });
      }).catch(err => console.error("Error importing utils for transposition:", err));
      return;
    }

    // === Web Audio path ===
    if (!config.voices || !config.voices.length || !config.audioContext) return;
    const now = config.audioContext.currentTime;

    for (const voice of config.voices) {
         if (!voice || !voice.active || voice.isGliding || voice.isSliding || voice.isTrilling) {
            continue; // Skip voices that are not active or currently gliding/sliding/trilling
         }

        const newMainRatio = getMainTranspositionRatio();
        const newSubRatio = getSubTranspositionRatio();

        ['saw', 'triangle', 'square'].forEach(oscTypeName => {
            const oscNode = voice._internalNodes[`${oscTypeName}Osc`];
            const oscTypeBaseFreqUntransposedDrifted = voice._internalNodes[`${oscTypeName}BaseFrequency`] || voice.baseNoteFreq;
            if (oscNode?.frequency && oscTypeBaseFreqUntransposedDrifted) {
                try {
                    const newFreq = oscTypeBaseFreqUntransposedDrifted * newMainRatio;
                    oscNode.frequency.setTargetAtTime(newFreq, now, RAMP_TIME_CONSTANT_SHORT);
                } catch(e){ console.warn(`Error ramping ${oscTypeName} freq for voice ${voice.id}: ${e.message}`)}
            }
        });

        const subOscNode = voice._internalNodes['subOsc'];
        const subOscBaseFreqUntransposedDrifted = voice._internalNodes['subBaseFrequency'] || voice.baseNoteFreq;
        if (subOscNode?.frequency && subOscBaseFreqUntransposedDrifted) {
            try {
                const newFreq = subOscBaseFreqUntransposedDrifted * newSubRatio;
                subOscNode.frequency.setTargetAtTime(newFreq, now, RAMP_TIME_CONSTANT_SHORT);
            } catch(e){ console.warn(`Error ramping SUB freq for voice ${voice.id}: ${e.message}`)}
        }
     }
 }

export function updatePulseWidth() {
    // === Worklet path ===
    if (config.useWorklet && config.workletBridge) {
      const pwmWidth = 0.25 + (state.pulseWidth / 100) * 0.5; // 25-75%
      config.workletBridge.updateAllVoices({ type: 'setOscMix', pwm: pwmWidth });
      return;
    }

    // === Web Audio path ===
    if (!config.voices || !config.voices.length || !config.audioContext) return;
    const now = config.audioContext.currentTime;
    const baseWidthPercent = Math.max(5, Math.min(95, state.pulseWidth));
    const targetOffset = (baseWidthPercent / 100 * 2) - 1;

     for (const voice of config.voices) {
         if (voice?.active && voice._internalNodes?.squareWidthControl?.offset && state.pwmAmount <= 0) {
             try {
                 voice._internalNodes.squareWidthControl.offset.setTargetAtTime(targetOffset, now, RAMP_TIME_CONSTANT_SHORT);
             } catch(e){ console.warn(`Error updating base pulse width for voice ${voice.id}: ${e}`); }
         }
     }
 }

export function updateMixerLevels() {
    // Update mixer gain nodes on all active voices for real-time mixer level modulation
    if (!config.voices || !config.voices.length || !config.audioContext) return;
    const now = config.audioContext.currentTime;
    const MIXER_RAMP_TIME = 0.015; // 15ms smooth transition to avoid clicks

    const oscillatorTypes = ['saw', 'square', 'triangle', 'sub', 'noise'];

    for (const voice of config.voices) {
        if (!voice || !voice.mixerGains) continue;

        for (const type of oscillatorTypes) {
            const mixerGainNode = voice.mixerGains[type];
            if (!mixerGainNode || !mixerGainNode.gain) continue;

            // Get current mixer level from state (may be modulated)
            const mixerLevel = state[`${type}Level`] || 0;
            const targetGain = mixerLevel / 100; // 0-100 -> 0-1

            try {
                // Smooth ramp to avoid clicks/pops
                mixerGainNode.gain.setTargetAtTime(targetGain, now, MIXER_RAMP_TIME);
            } catch (e) {
                console.warn(`Error updating mixer level for ${type} on voice ${voice.id}: ${e}`);
            }
        }
    }
}

export function getMainTranspositionRatio() {
    const transpositionSemitones = [-24, -19, -12, -7, 0, 7, 12, 19, 24];
    const index = Math.max(0, Math.min(state.mainTransposition, transpositionSemitones.length - 1));
    return Math.pow(2, transpositionSemitones[index] / 12);
}

export function getSubTranspositionRatio() {
    const transpositionSemitones = [-24, -19, -12, -7, 0, 7, 12, 19, 24];
    const index = Math.max(0, Math.min(state.subTransposition, transpositionSemitones.length - 1));
    return Math.pow(2, transpositionSemitones[index] / 12);
}

// Export findScaleNote for use by WorkletBridge (trill implementation)
export { findScaleNote };

export function getNoteFrequency(note) {
    if (!note || typeof note !== 'string') {
        console.warn(`Invalid note format provided to getNoteFrequency: ${note}`);
        return 440;
    }
    const noteMap = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11};
    try {
        const noteRegex = /^([A-G]#?)(-?\d+)$/;
        const match = note.match(noteRegex);
        if (!match) {
             console.warn(`Could not parse note string: ${note}`);
             return 440;
        }
        const name = match[1];
        const octave = parseInt(match[2], 10);
        if (noteMap[name] === undefined || isNaN(octave)) {
            console.warn(`Invalid note components parsed: ${name}, ${octave}`);
            return 440;
        }
        const noteIndex = noteMap[name];
        const midiNote = 12 * (octave + 1) + noteIndex;
        return 440 * Math.pow(2, (midiNote - 69) / 12);
    }
    catch (e) {
        console.error(`Error calculating frequency for note ${note}:`, e);
        return 440;
    }
}