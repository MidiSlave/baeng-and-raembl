// File: js/modules/engine.js
// FM synthesis engine for Bæng
//
// ═══════════════════════════════════════════════════════════════════
// AudioWorklet Migration Status: ✅ COMPLETE
// ═══════════════════════════════════════════════════════════════════
//
// All engines have been migrated from deprecated ScriptProcessorNode
// to modern AudioWorkletNode for improved performance and zero-latency
// audio processing on dedicated audio thread.
//
// Migrated Engines:
//   ✅ Analog Kick (aKICK)     → js/processors/analog-kick-processor.js
//   ✅ Analog Snare (aSNARE)   → js/processors/analog-snare-processor.js
//   ✅ Analog Hi-Hat (aHIHAT)  → js/processors/analog-hihat-processor.js
//   ✅ Sampler (SAMPLE)        → js/processors/sampler-processor.js
//   ✅ DX7 FM Synth (DX7)      → js/processors/dx7-processor.js
//
// Architecture:
//   - Per-voice AudioWorkletNode instances (one node per trigger)
//   - Each node has full effects chain (level, pan, bitcrush, drive)
//   - Automatic fallback to ScriptProcessorNode if AudioWorklet unavailable
//   - Modules loaded once at startup via initializeAudioWorklets()
//
// Benefits:
//   - Zero additional latency (runs on audio rendering thread)
//   - No UI jank from audio processing
//   - Better timing precision (sample-accurate)
//   - Eliminates main thread blocking
//   - Future-proof (ScriptProcessorNode deprecated since 2017)
//
// ═══════════════════════════════════════════════════════════════════

import { state } from '../state.js';
import { config } from '../config.js';
import { randomFloat, levelToGain } from '../utils.js'; // For deviation timing and perceptual volume
import { quantizePitchToScale } from '../utils/scaleQuantizer.js';
import { getMaxVoicesForMode } from './engines.js'; // For polyphony voice count calculation
import { sharedAudioContext, connectToFinalLimiter } from '../../shared/audio.js'; // Shared audio context for merged app
import { initSidechainBus, connectVoiceToSidechain, updateDuckingState } from './sidechain.js'; // Sidechain ducking system
import { createThemeGradient } from '../../shared/gradient-utils.js'; // Theme-aware canvas gradients

// Callback for when a voice is triggered (used for UI updates)
let voiceTriggerCallback = null;

export function setVoiceTriggerCallback(callback) {
    voiceTriggerCallback = callback;
}

// DX7 Synth imports
import dx7Config, { setSampleRate } from './dx7/config.js';
import FMVoice, { ALGORITHMS } from './dx7/voice-dx7.js';
import Synth from './dx7/synth.js';

// Analog engine imports
import { AnalogKick } from './analog/analog-kick.js';
import { AnalogSnare } from './analog/analog-snare.js';
import { AnalogHiHat } from './analog/analog-hihat.js';

// Sampler engine imports
import { SamplerEngine, sampleBankManager } from './sampler/sampler-engine.js';

// ═══════════════════════════════════════════════════════════════════
// Gain Staging Constants
// ═══════════════════════════════════════════════════════════════════

// DX7 output attenuation to match other engines
// Analog engines apply 1.5-2.3x internal boosts to compensate for quiet DSP
// DX7 outputs at baseline (1.0x) so we attenuate to match
// 0.25 = -12 dB attenuation (reduced from 0.435 as DX7 was too loud)
const DX7_OUTPUT_ATTENUATION = 0.25;

// Collection of active voice instances (for reference and management)
const activeVoices = [];

// MONOPHONIC ENFORCEMENT: Track last triggered voice per track (6 tracks)
// Ensures each track has maximum 1 voice (or N ratchet substeps)
// Professional drum machines (Elektron, Roland) are strictly monophonic per track
const lastTriggeredVoice = new Array(6).fill(null);

// DX7 LEGATO STATE: Separate tracking for slide detection
// CRITICAL: Do NOT use voiceInstance.active for slide detection!
// The active flag gets cleared by releaseSpecificVoice() IMMEDIATELY when release starts,
// but the workletNode is still playing. This causes new voices to be created instead of sliding.
// This separate state only gets cleared when the processor sends 'finished' message.
const dx7LegatoState = new Array(6).fill(null); // { node: workletNode, note: midiNote, voiceInstance: ref }

// DX7 SAMPLED PITCH: Sample-and-hold pitch for PPMod
// When PPMod modulates pitch, we sample the value ONCE per step (not per frame)
// This prevents multiple pitch changes within a single step when gate is also modulated
const dx7SampledPitch = new Array(6).fill(null); // { pitch: number, stepIndex: number }

// CUT GROUPS: Smooth voice transitions for slice/sample playback
// When a new slice triggers, previous slice fades smoothly (10ms) whilst continuing to play
// This prevents clicks and allows slices to play their full duration
// Based on Strudel's proven cut groups pattern
const cutGroups = new Map(); // voiceIndex -> { voice, gainNode, fadeScheduled }

// PERFORMANCE MONITORING: Track active voice count
setInterval(() => {
    const dx7Count = activeVoices.filter(v => v.engine === 'DX7').length;
    const totalCount = activeVoices.length;
    if (totalCount > 0) {
    }
}, 2000); // Log every 2 seconds

// AudioWorklet state management
let workletModulesLoaded = false;

// Feature detection
const supportsAudioWorklet = (ctx) => {
    return typeof ctx?.audioWorklet !== 'undefined';
};

// Delay tempo sync divisions (12 options)
const DELAY_DIVISIONS = [
    { label: '1/32', value: 1/32 },
    { label: '1/16', value: 1/16 },
    { label: '1/12', value: 1/12 },  // 1/16T triplet
    { label: '1/8',  value: 1/8 },
    { label: '1/6',  value: 1/6 },   // 1/8T triplet
    { label: '3/16', value: 3/16 },  // 1/16 dotted
    { label: '1/4',  value: 1/4 },
    { label: '1/3',  value: 1/3 },   // 1/4T triplet
    { label: '3/8',  value: 3/8 },   // 1/8 dotted
    { label: '1/2',  value: 1/2 },
    { label: '3/4',  value: 3/4 },   // 1/4 dotted
    { label: '1',    value: 1 }      // Whole note
];

// Throttling for parameter updates (prevent too-frequent updates from UI)
let lastReverbImpulseUpdate = 0;
const REVERB_IMPULSE_THROTTLE = 300; // ms - longer to reduce CPU load and allow smooth crossfades
let isReverbCrossfading = false;
let pendingReverbUpdate = false;

// Generate saturation curve (based on ræmbL)
function makeSaturationCurve(amount) {
    const samples = 4096;
    const curve = new Float32Array(samples);
    const k = Math.pow(amount / 100, 3) * 20; // Power curve for gradual onset

    for (let i = 0; i < samples; i++) {
        const x = (i / samples) * 2 - 1; // -1 to 1
        curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }

    return curve;
}

// Trigger a voice with the given parameters
export function triggerVoice(
    voiceIndex,
    accentLevel = 0,
    ratchetCount = 1,
    stepDurationInBeats = 0.25, // Nominal duration of the step, currently not heavily used by engine for timing
    isDeviated = false,
    deviationMode = 1, // 0: Early, 1: Late, 2: Both
    fixedTimingOffset = 0, // Fixed timing offset in seconds (for flams)
    velocityMultiplier = 1.0, // Velocity multiplier (for flam grace notes)
    skipVoiceRelease = false, // Skip monophonic voice release (for flam layering)
    scheduledTime = null, // Optional: pre-scheduled time from audio-thread scheduler
    melodicMidiNote = null // Optional: MIDI note for melodic keyboard input (overrides macroPitch)
) {
    if (!config.audioContext || !config.initialized) {
        console.warn('[triggerVoice] Audio not initialized');
        return;
    }

    if (voiceIndex < 0 || voiceIndex >= state.voices.length) {
        return;
    }

    // Check if voice is muted
    const voice = state.voices[voiceIndex];
    if (voice && voice.muted) {
        return; // Skip playback for muted tracks
    }

    // ===== POLYPHONY / MONOPHONIC ENFORCEMENT =====
    // Determine if this engine supports polyphony (DX7 and SAMPLE only)
    const isPolyphonicEngine = (voice.engine === 'DX7' || voice.engine === 'SAMPLE');
    const polyphonyEnabled = isPolyphonicEngine && (voice.polyphonyMode > 0);

    if (polyphonyEnabled) {
        // POLYPHONIC PATH: Voice stealing when max polyphony limit reached
        // Only steal voices for single triggers (not ratchets) and when not layering (flams)
        if (ratchetCount === 1 && !skipVoiceRelease) {
            const maxVoices = getMaxVoicesForMode(voice.polyphonyMode);
            const activeVoicesForTrack = activeVoices.filter(
                v => v.voiceIndex === voiceIndex && v.active
            );

            // Steal oldest voice if at polyphony limit
            if (activeVoicesForTrack.length >= maxVoices) {
                stealOldestVoice(voiceIndex);
            }
        }
    } else {
        // MONOPHONIC PATH: Kill previous voice from last trigger
        // This ensures each track is monophonic (max 1 voice, or N ratchet substeps)
        // CRITICAL FIX: Without this, voices stack infinitely (BUG: i > 0 condition only
        // releases ratchet substeps, not voices between steps)
        // SKIP for flams - we want both grace note and primary note to layer

        // USE CUT GROUPS for slice/sample engines (smooth transitions, no clicks)
        // Use standard voice release for other engines
        const usesCutGroups = (voice.engine === 'SLICE' || voice.engine === 'SAMPLE');

        // DX7 SLIDE CHECK: Skip voice release if we're about to slide
        // Slide condition: Gate>=100% in MONO mode with active previous voice
        // Use MODULATED gate value so PPMod can dynamically trigger slides
        // CRITICAL: Use dx7LegatoState NOT lastTriggeredVoice.active!
        // The active flag gets cleared too early (when release starts, not when envelope finishes)
        const gateForSlide = voice.gate ?? 80;  // Modulated value (PPMod applied)
        const legatoVoice = dx7LegatoState[voiceIndex];
        const dx7WillSlide = (voice.engine === 'DX7') &&
                             (gateForSlide >= 100) &&
                             (voice.polyphonyMode === 0) && // MUST be mono mode
                             legatoVoice?.node; // Use legato state, not active flag

        if (!skipVoiceRelease && lastTriggeredVoice[voiceIndex] && !dx7WillSlide) {
            if (usesCutGroups) {
                // CUT GROUP FADE: Smooth 10ms transition (Strudel pattern)
                // Previous slice continues playing whilst fading to silence
                applyCutGroupFade(voiceIndex, lastTriggeredVoice[voiceIndex]);
            } else {
                // STANDARD VOICE RELEASE: Immediate fadeout for analog/DX7 engines
                releaseSpecificVoice(lastTriggeredVoice[voiceIndex], 0.001); // 1ms fadeout
            }
        }
    }

    // Note: Voice release within ratchet loop handles substep monophony (i > 0 logic)
    // Note: Choke group logic is now handled at the sequencer level in time.js

    // Notify UI that this voice is being triggered (only once per trigger, not per ratchet)
    if (voiceTriggerCallback && state.isPlaying) {
        voiceTriggerCallback(voiceIndex);
    }

    // Use scheduled time if provided, otherwise use current time (for immediate playback)
    const baseTime = scheduledTime !== null ? scheduledTime : config.audioContext.currentTime;
    // config.currentMsPerStep already includes swing adjustments from time.js
    const actualMsPerStep = config.currentMsPerStep;

    // Scheduling buffer is now handled by the audio-thread scheduler
    // No need for additional buffer when using scheduled time
    const schedulingBuffer = scheduledTime !== null ? 0 : 0.050; // 50ms only for immediate triggers

    // Track voice instances for monophonic ratchet behavior
    // This prevents the race condition where releaseVoice() releases ALL voices for a voiceIndex
    let previousVoiceInstance = null;

    // ===== SAMPLE-ACCURATE RATCHET SCHEDULING FOR ANALOG KICK =====
    // If this is analog kick with ratchets and AudioWorklet is available,
    // use sample-accurate scheduling to eliminate voice overlap and clicks
    const voiceSettings = state.voices[voiceIndex];
    // DISABLED: Sample-accurate ratchet scheduling caused audio to break completely
    // The legacy loop (below) creates separate voice instances per substep and works correctly.
    // Root cause unknown - possibly scheduleRatchet message handling or processor timing issues.
    // See thoughts/PROGRESS.md 2025-12-26 entries for investigation details.
    if (false && voiceSettings.engine === 'aKICK' && ratchetCount > 1 && workletModulesLoaded) {
        // Pre-calculate all trigger times upfront
        const triggerTimesArray = [];

        for (let i = 0; i < ratchetCount; i++) {
            let triggerTime = baseTime + schedulingBuffer + (i * (actualMsPerStep / ratchetCount) / 1000);

            // Apply fixed timing offset first (for flams)
            if (fixedTimingOffset !== 0) {
                triggerTime -= fixedTimingOffset;
            }

            // Apply deviation to first ratchet hit only
            if (isDeviated && i === 0) {
                const deviationAmount = voiceSettings.deviation || 0;

                if (deviationAmount > 0) {
                    const deviationOccurs = Math.random() * 100 <= deviationAmount;

                    if (deviationOccurs) {
                        const maxOffsetSeconds = (actualMsPerStep / 1000) * 0.5;
                        const scaleFactor = (Math.random() * deviationAmount) / 100;
                        const actualOffset = maxOffsetSeconds * scaleFactor;

                        if (deviationMode === 0) { // Early
                            triggerTime -= actualOffset;
                        } else if (deviationMode === 1) { // Late
                            triggerTime += actualOffset;
                        } else if (deviationMode === 2) { // Both
                            triggerTime += (Math.random() < 0.5 ? -1 : 1) * actualOffset;
                        }

                        triggerTime = Math.max(baseTime, triggerTime);
                    }
                }
            }

            triggerTimesArray.push({
                time: triggerTime,
                velocity: velocityMultiplier // Per-trigger velocity (for flam variation)
            });
        }


        // Create SINGLE worklet node that handles all ratchets internally
        const voiceInstance = createAnalogKickVoiceAudioWorklet(
            voiceIndex,
            null, // startTime not used in ratchet mode
            accentLevel,
            velocityMultiplier,
            triggerTimesArray // Pass all trigger times upfront
        );

        // Store voice for monophonic enforcement - allows next step to release this voice
        // BUG FIX: Without this, ratchet voices stack up (previous voice never released)
        lastTriggeredVoice[voiceIndex] = voiceInstance;

        // Early return - skip the legacy loop
        return;
    }
    // ===== END SAMPLE-ACCURATE RATCHET SCHEDULING =====

    // ===== AUTOMATIC GAIN COMPENSATION FOR POLYPHONY =====
    // Calculate ONCE before the loop (not per ratchet substep!)
    // Apply square root compensation to prevent volume increase with multiple voices
    // Formula: gain = baseGain / sqrt(activeVoiceCount)
    // This maintains perceived loudness when multiple notes play simultaneously
    let effectiveVelocityMultiplier = velocityMultiplier;

    if (polyphonyEnabled) {
        // Count active voices AFTER voice stealing has occurred
        const activeVoicesForTrack = activeVoices.filter(
            v => v.voiceIndex === voiceIndex && v.active
        );
        // For single triggers, we just stole a voice if at limit, so count stays at max
        // For ratchets, all substeps share the same gain compensation
        const activeCount = activeVoicesForTrack.length + 1;
        const polyphonyGainCompensation = 1.0 / Math.sqrt(Math.max(1, activeCount));
        effectiveVelocityMultiplier = velocityMultiplier * polyphonyGainCompensation;
    }

    for (let i = 0; i < ratchetCount; i++) {
        let triggerTime = baseTime + schedulingBuffer + (i * (actualMsPerStep / ratchetCount) / 1000); // Convert ms to seconds

        // Apply fixed timing offset first (for flams)
        if (fixedTimingOffset !== 0) {
            triggerTime -= fixedTimingOffset; // Subtract to make grace note earlier
            // console.log(`🥁 Flam timing: baseTime=${baseTime.toFixed(3)}, offset=${fixedTimingOffset.toFixed(3)}, triggerTime=${triggerTime.toFixed(3)}, velocity=${velocityMultiplier}`);
        }

        if (isDeviated && i === 0) { // Apply deviation only to the first ratchet hit
            const voiceParams = state.voices[voiceIndex];
            const deviationAmount = voiceParams.deviation || 0;

            if (deviationAmount > 0) {
                // First, determine if deviation occurs at all based on deviation amount
                // deviationAmount (0-100) is treated as a percentage chance
                const deviationOccurs = Math.random() * 100 <= deviationAmount;

                if (deviationOccurs) {
                    // Max deviation is 50% of a single (non-ratcheted) step's duration
                    const maxOffsetSeconds = (actualMsPerStep / 1000) * 0.5;

                    // Random scale factor between 0 and the deviation amount percentage
                    const scaleFactor = (Math.random() * deviationAmount) / 100;

                    // Apply the scale factor to determine the actual offset
                    const actualOffset = maxOffsetSeconds * scaleFactor;

                    // Use the deviationMode to determine the direction
                    if (deviationMode === 0) { // Early
                        triggerTime -= actualOffset;
                    } else if (deviationMode === 1) { // Late
                        triggerTime += actualOffset;
                    } else if (deviationMode === 2) { // Both
                        triggerTime += (Math.random() < 0.5 ? -1 : 1) * actualOffset;
                    }

                    // Ensure trigger time is not in the past
                    triggerTime = Math.max(baseTime, triggerTime);
                }
            }
        }

        // Route to appropriate engine and store the returned voice instance
        let currentVoiceInstance;
        if (voiceSettings.engine === 'DX7') {
            // ===== DX7 SAMPLE-AND-HOLD PITCH =====
            // Sample pitch ONCE per step to prevent multiple pitch changes when PPMod modulates both pitch and gate
            // Without this, PPMod updates macroPitch every frame (~30fps), causing multiple pitchSlide messages per step
            // KEYBOARD FIX: Keyboard triggers (scheduledTime === null) always sample fresh pitch
            // so each keypress captures the current modulated value (matching sequencer behaviour)
            const currentStepIndex = state.currentStepIndex;
            const isKeyboardTrigger = scheduledTime === null;

            // Keyboard triggers always sample fresh; sequencer uses cache per step
            if (isKeyboardTrigger || !dx7SampledPitch[voiceIndex] || dx7SampledPitch[voiceIndex].stepIndex !== currentStepIndex) {
                dx7SampledPitch[voiceIndex] = {
                    pitch: voiceSettings.macroPitch ?? 50,
                    stepIndex: currentStepIndex
                };
            }
            const sampledPitch = dx7SampledPitch[voiceIndex].pitch;

            // ===== DX7 GATE & SLIDE LOGIC =====
            const gatePercent = voiceSettings.gate ?? 80;  // Modulated value (PPMod applied)
            // Default to mono mode (0) if polyphonyMode is undefined (e.g., when DX7 assigned to a drum voice slot)
            const polyphonyMode = voiceSettings.polyphonyMode ?? 0;
            const isMonoMode = polyphonyMode === 0;

            // CRITICAL FIX: Use dx7LegatoState for slide detection, NOT lastTriggeredVoice.active!
            // The active flag gets cleared too early (when release starts), but we need to know
            // if a voice is still capable of receiving slide messages (node still exists).
            const legatoVoice = dx7LegatoState[voiceIndex];
            const canSlide = legatoVoice?.node; // Node exists = can receive slide messages

            // SLIDE: Gate>=100% in mono mode with legato-capable previous voice
            // Use MODULATED gate value so PPMod can dynamically trigger slides when gate reaches 100%
            const shouldSlide = (gatePercent >= 100) && isMonoMode && canSlide && !skipVoiceRelease;

            if (shouldSlide) {
                // TB-303 style slide: glide pitch, don't retrigger envelope
                // Send pitchSlide message to existing voice
                const fineTune = voiceSettings.dx7FineTune !== undefined ? voiceSettings.dx7FineTune : 0;

                let targetMidiNote;
                if (melodicMidiNote !== null) {
                    // Melodic keyboard input - use MIDI note directly
                    targetMidiNote = melodicMidiNote;
                } else {
                    // Use SAMPLED pitch (S&H) - not voiceSettings.macroPitch which changes every frame
                    const pitchParam = sampledPitch;
                    if (state.scaleQuantizeEnabled) {
                        targetMidiNote = quantizePitchToScale(pitchParam, state.globalScale, state.globalRoot);
                    } else {
                        targetMidiNote = Math.floor(48 + ((pitchParam - 50) / 50) * 24);
                    }
                }
                targetMidiNote += (fineTune / 100);

                // Send slide message to existing voice via legato state
                legatoVoice.node.port.postMessage({
                    type: 'pitchSlide',
                    note: targetMidiNote,
                    glideTimeMs: 80 // TB-303 style 80ms glide
                });

                // Update legato state with new note
                legatoVoice.note = targetMidiNote;

                // Reuse the existing voice instance
                currentVoiceInstance = legatoVoice.voiceInstance;

                // Don't release previous voice or create new one
            } else {
                // Normal DX7 trigger - release any previous voice first (since we skipped it above for potential slide)
                if (!skipVoiceRelease && lastTriggeredVoice[voiceIndex]) {
                    releaseSpecificVoice(lastTriggeredVoice[voiceIndex], 0.001);
                }

                // Clear previous legato state (new voice will set its own)
                dx7LegatoState[voiceIndex] = null;

                // Use AudioWorklet if available, otherwise fallback to ScriptProcessorNode
                // Pass sampledPitch for S&H behaviour (PPMod pitch doesn't change mid-step)
                // Pass melodicMidiNote if provided (keyboard melodic input overrides pitch calculation)
                if (workletModulesLoaded) {
                    currentVoiceInstance = createDX7VoiceAudioWorklet(voiceIndex, triggerTime, accentLevel, effectiveVelocityMultiplier, sampledPitch, melodicMidiNote);
                } else {
                    currentVoiceInstance = createDX7Voice(voiceIndex, triggerTime, accentLevel, effectiveVelocityMultiplier, sampledPitch, melodicMidiNote);
                }

                // Set legato state for new voice (enables slide on next trigger)
                if (currentVoiceInstance?.workletNode) {
                    const fineTune = voiceSettings.dx7FineTune !== undefined ? voiceSettings.dx7FineTune : 0;
                    let initialNote;
                    if (melodicMidiNote !== null) {
                        // Melodic keyboard input - use MIDI note directly
                        initialNote = melodicMidiNote;
                    } else {
                        // Use SAMPLED pitch (S&H) - not voiceSettings.macroPitch which changes every frame
                        const pitchParam = sampledPitch;
                        if (state.scaleQuantizeEnabled) {
                            initialNote = quantizePitchToScale(pitchParam, state.globalScale, state.globalRoot);
                        } else {
                            initialNote = Math.floor(48 + ((pitchParam - 50) / 50) * 24);
                        }
                    }
                    initialNote += (fineTune / 100);

                    dx7LegatoState[voiceIndex] = {
                        node: currentVoiceInstance.workletNode,
                        note: initialNote,
                        voiceInstance: currentVoiceInstance
                    };
                }

                // Schedule noteOff based on gate duration (only if gate < 100%)
                // Gate=100% means legato - note holds until next trigger
                if (currentVoiceInstance && gatePercent < 100) {
                    const gateDurationMs = actualMsPerStep * (gatePercent / 100);
                    const releaseTime = triggerTime + (gateDurationMs / 1000);
                    const delayMs = Math.max(0, (releaseTime - config.audioContext.currentTime) * 1000);

                    setTimeout(() => {
                        if (currentVoiceInstance.workletNode && currentVoiceInstance.active) {
                            currentVoiceInstance.workletNode.port.postMessage({ type: 'noteOff' });
                        }
                    }, delayMs);
                }
            }
        } else if (voiceSettings.engine === 'SAMPLE') {
            // Use AudioWorklet if available, otherwise fallback to ScriptProcessorNode
            if (workletModulesLoaded) {
                currentVoiceInstance = createSamplerVoiceAudioWorklet(voiceIndex, triggerTime, accentLevel, effectiveVelocityMultiplier);
            } else {
                currentVoiceInstance = createSamplerVoice(voiceIndex, triggerTime, accentLevel, effectiveVelocityMultiplier);
            }
        } else if (voiceSettings.engine === 'SLICE') {
            // SLICE engine: plays slices from a loaded sample buffer
            // Use AudioWorklet if available, otherwise fallback to ScriptProcessorNode
            if (workletModulesLoaded) {
                currentVoiceInstance = createSliceVoiceAudioWorklet(voiceIndex, triggerTime, accentLevel, velocityMultiplier);
            } else {
                // TODO: Implement ScriptProcessorNode fallback for SLICE engine
                console.warn('[triggerVoice] SLICE engine requires AudioWorklet (fallback not implemented)');
            }
        } else if (voiceSettings.engine === 'aKICK') {
            // Use AudioWorklet if available, otherwise fallback to ScriptProcessorNode
            if (workletModulesLoaded) {
                // Check output mode: OUT = 808-style (AnalogKick), AUX = 909-style (SyntheticKick)
                if (voiceSettings.outputMode === 'AUX') {
                    currentVoiceInstance = createSyntheticKickVoiceAudioWorklet(voiceIndex, triggerTime, accentLevel, velocityMultiplier);
                } else {
                    currentVoiceInstance = createAnalogKickVoiceAudioWorklet(voiceIndex, triggerTime, accentLevel, velocityMultiplier);
                }
            } else {
                currentVoiceInstance = createAnalogKickVoice(voiceIndex, triggerTime, accentLevel, velocityMultiplier);
            }
        } else if (voiceSettings.engine === 'aSNARE') {
            // Use AudioWorklet if available, otherwise fallback to ScriptProcessorNode
            if (workletModulesLoaded) {
                // Check output mode: OUT = 808-style (AnalogSnare), AUX = 909-style (SyntheticSnare)
                if (voiceSettings.outputMode === 'AUX') {
                    currentVoiceInstance = createSyntheticSnareVoiceAudioWorklet(voiceIndex, triggerTime, accentLevel, velocityMultiplier);
                } else {
                    currentVoiceInstance = createAnalogSnareVoiceAudioWorklet(voiceIndex, triggerTime, accentLevel, velocityMultiplier);
                }
            } else {
                currentVoiceInstance = createAnalogSnareVoice(voiceIndex, triggerTime, accentLevel, velocityMultiplier);
            }
        } else if (voiceSettings.engine === 'aHIHAT') {
            // Use AudioWorklet if available, otherwise fallback to ScriptProcessorNode
            if (workletModulesLoaded) {
                // Check output mode: OUT = 808-style (SquareNoise), AUX = 909-style (RingMod)
                if (voiceSettings.outputMode === 'AUX') {
                    currentVoiceInstance = createRingModHiHatVoiceAudioWorklet(voiceIndex, triggerTime, accentLevel, velocityMultiplier);
                } else {
                    currentVoiceInstance = createAnalogHiHatVoiceAudioWorklet(voiceIndex, triggerTime, accentLevel, velocityMultiplier);
                }
            } else {
                currentVoiceInstance = createAnalogHiHatVoice(voiceIndex, triggerTime, accentLevel, velocityMultiplier);
            }
        } else {
            console.error(`[triggerVoice] Unknown engine type: ${voiceSettings.engine}`);
            return null;
        }

        // Make voices strictly monophonic - release SPECIFIC previous voice instance AFTER new voice triggers
        // This prevents the race condition where releaseVoice() releases ALL voices for a voiceIndex
        // SKIP for flams - we want both grace note and primary note to layer
        if (!skipVoiceRelease && i > 0 && previousVoiceInstance) {
            const now = config.audioContext.currentTime;
            // Schedule release to happen exactly when new voice triggers (or immediately if in past)
            const releaseDelayMs = Math.max(0, (triggerTime - now) * 1000);

            // Capture the previous instance in a closure to avoid it being overwritten in the next iteration
            const instanceToRelease = previousVoiceInstance;

            setTimeout(() => {
                releaseSpecificVoice(instanceToRelease, 0.001); // Instant cutoff (works with instant stop in processors)
            }, releaseDelayMs);
        }

        // Store current voice instance for next iteration
        previousVoiceInstance = currentVoiceInstance;
    }

    // ===== STORE LAST VOICE FOR NEXT TRIGGER =====
    // This enables monophonic enforcement across triggers (step-to-step)
    // For ratchets, this stores the LAST substep (previous substeps are already killed by i > 0 logic)
    // For flams, skipVoiceRelease=true prevents storage (allows layering)
    // For polyphonic engines, we use voice stealing instead of lastTriggeredVoice tracking
    if (!skipVoiceRelease && previousVoiceInstance && !polyphonyEnabled) {
        lastTriggeredVoice[voiceIndex] = previousVoiceInstance;
    }
}

/**
 * Get carrier operators for a DX7 algorithm
 * Carriers are operators that output directly to audio
 * @param {number} algorithm - Algorithm number (1-32)
 * @returns {Array<number>} Array of carrier operator indices
 */
function getAlgorithmCarriers(algorithm) {
    const algoIndex = algorithm - 1; // DX7 uses 1-indexed algorithms
    if (algoIndex < 0 || algoIndex >= ALGORITHMS.length) {
        return [0]; // Fallback to operator 0 if invalid
    }
    return ALGORITHMS[algoIndex].outputMix;
}

/**
 * Apply DX7 macro modifiers to a patch
 * Uses algorithm-aware DEPTH control and exponential RATE scaling
 */
function applyDX7MacroModifiers(patchData, voiceSettings) {
    // Deep clone the patch to avoid modifying the original
    const modifiedPatch = JSON.parse(JSON.stringify(patchData));

    // Apply DEPTH (modulator intensity / FM depth)
    // macroDepth is 0-100 in state, normalise to 0-1
    if (voiceSettings.macroDepth !== undefined) {
        const depthNorm = voiceSettings.macroDepth / 100;  // 0-100 → 0-1
        // brightness parameter: (depth - 0.5) * 32 gives ±16 level units
        const brightness = (depthNorm - 0.5) * 32;

        // Get carriers for this algorithm to identify modulators
        const algorithm = modifiedPatch.algorithm || 1;
        const carriers = getAlgorithmCarriers(algorithm);
        const carrierSet = new Set(carriers);

        // Apply brightness ONLY to modulators (not carriers)
        // Based on voice.h:219-225: level += 0.125f * brightness
        for (let i = 0; i < 6; i++) {
            if (!carrierSet.has(i)) {  // Is modulator
                const currentLevel = modifiedPatch.operators[i].volume || 99;
                // Direct application: level change proportional to brightness
                const newLevel = currentLevel + brightness;
                modifiedPatch.operators[i].volume = Math.min(99, Math.max(0, Math.round(newLevel)));
            }
        }
    }

    // Apply RATE (envelope speed control)
    // macroRate is 0-100 in state, normalise to 0-1
    if (voiceSettings.macroRate !== undefined) {
        const envControl = voiceSettings.macroRate / 100;  // 0-100 → 0-1

        // Exponential scaling for musical response
        // AD scale: faster at low values, slower at high values
        const adScale = Math.pow(2, (0.5 - envControl) * 8.0);

        // R scale: bell curve - fastest at 30%, slower at extremes
        const rScale = Math.pow(2, -Math.abs(envControl - 0.3) * 8.0);

        for (let i = 0; i < 6; i++) {
            const op = modifiedPatch.operators[i];
            if (op.rates && op.rates.length === 4) {
                // Scale attack and decay (R1, R2) - note: DX7 rates are inverted (higher = faster)
                op.rates[0] = Math.min(99, Math.max(0, Math.round(op.rates[0] * adScale))); // Attack
                op.rates[1] = Math.min(99, Math.max(0, Math.round(op.rates[1] * adScale))); // Decay

                // Scale release (R4) with bell curve
                op.rates[3] = Math.min(99, Math.max(0, Math.round(op.rates[3] * rScale))); // Release
            }
        }
    }

    // NOTE: PITCH transpose is now handled via macroPitch directly in the MIDI note calculation
    // (see createDX7Voice). We no longer modify patch.transpose as it was double-counting.

    return modifiedPatch;
}

// Create a DX7 FM synthesis voice
function createDX7Voice(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0, sampledPitchOverride = null, melodicMidiNoteOverride = null) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Check if DX7 patch is loaded
    if (!voiceSettings.dx7Patch) {
        // Fall back to standard FM synthesis
        createFMVoice(voiceIndex, startTime, accentLevel);
        return;
    }

    // Set up DX7 voice parameters from patch
    const patchData = voiceSettings.dx7Patch.parsed || voiceSettings.dx7Patch;

    // Validate patch data structure
    if (!patchData.algorithm || !patchData.operators || patchData.operators.length !== 6) {
        createFMVoice(voiceIndex, startTime, accentLevel);
        return;
    }

    // Apply macro modifiers to patch before loading
    const modifiedPatch = applyDX7MacroModifiers(patchData, voiceSettings);

    // IMPORTANT: Set params FIRST to initialize operators array
    FMVoice.setParams(modifiedPatch);

    // Set up frequency ratios for operators
    for (let i = 0; i < 6; i++) {
        FMVoice.updateFrequency(i);
        FMVoice.setPan(i, modifiedPatch.operators[i].pan || 0);
        FMVoice.setOutputLevel(i, modifiedPatch.operators[i].volume || 99);
    }

    // Set feedback
    FMVoice.setFeedback(modifiedPatch.feedback || 0);

    // Update LFO
    FMVoice.updateLFO();

    // Create output nodes
    const dx7Output = ctx.createGain();
    const voicePanner = ctx.createStereoPanner();

    // Effect sends
    const reverbSendGain = ctx.createGain();
    const delaySendGain = ctx.createGain();

    // Set voice level (with accent and velocity multiplier for flams)
    const level = voiceSettings.level !== undefined ? voiceSettings.level : 75;
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    const accentedLevel = level * accentMultiplier * velocityMultiplier;
    dx7Output.gain.setValueAtTime(levelToGain(accentedLevel) * DX7_OUTPUT_ATTENUATION, startTime);

    // Set pan
    const pan = voiceSettings.pan !== undefined ? voiceSettings.pan : 50;
    voicePanner.pan.setValueAtTime((pan - 50) / 50, startTime);

    // Effect send levels
    const reverbSendLevel = voiceSettings.reverbSend || 0;
    const delaySendLevel = voiceSettings.delaySend || 0;

    // Connect audio graph (connection from dx7Output to voicePanner is now handled after effects in createDX7Voice)
    // Per-voice crossfade routing for Clouds
    voicePanner.connect(config.cloudsDirectGains[voiceIndex]);
    voicePanner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to voice analyser for visualization
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        voicePanner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(voicePanner, voiceIndex);

    // Effect sends - ONLY create connections if send level > 0 to prevent audio bleeding
    if (reverbSendLevel > 0) {
        reverbSendGain.gain.value = reverbSendLevel / 100;
        voicePanner.connect(reverbSendGain);
        if (config.reverbNode) reverbSendGain.connect(config.reverbNode);
    }

    if (delaySendLevel > 0) {
        delaySendGain.gain.value = delaySendLevel / 100;
        voicePanner.connect(delaySendGain);
        if (config.delayNode) delaySendGain.connect(config.delayNode);
    }

    // Create DX7 voice instance
    // Calculate MIDI note from pitch macro (mapping 0-100 to MIDI note range)
    const fineTune = voiceSettings.dx7FineTune !== undefined ? voiceSettings.dx7FineTune : 0;

    // Calculate base MIDI note
    let baseMidiNote;
    if (melodicMidiNoteOverride !== null) {
        // Melodic keyboard input - use MIDI note directly (no pitch calculation)
        baseMidiNote = melodicMidiNoteOverride;
    } else {
        // Use sampledPitchOverride if provided (S&H behavior for PPMod), otherwise read from state
        const pitchParam = sampledPitchOverride !== null ? sampledPitchOverride : (voiceSettings.macroPitch ?? 50);

        // NOTE: dx7Transpose is NOT used here because it's derived from macroPitch via the PITCH macro.
        // Using both would double-count the pitch offset. The pitchParam (macroPitch) is the single
        // source of truth for pitch, either quantised to scale or mapped linearly.
        if (state.scaleQuantizeEnabled) {
            // Use scale quantization - pitchParam (0-100) maps to notes within the selected scale
            // No transpose added here as that would push notes out of scale
            baseMidiNote = quantizePitchToScale(pitchParam, state.globalScale, state.globalRoot);
        } else {
            // Linear pitch mapping: pitch 50 = C3 (MIDI 48), ±2 octaves range
            baseMidiNote = Math.floor(48 + ((pitchParam - 50) / 50) * 24); // MIDI 24-72 (C1-C5)
        }
    }

    // Apply fine tune offset (cents to fractional semitones)
    const midiNote = baseMidiNote + (fineTune / 100);

    const baseVelocity = accentLevel > 0 ? 0.8 : 0.5;
    const velocity = baseVelocity * velocityMultiplier; // Apply velocity multiplier for flam grace notes

    const dx7Voice = new FMVoice(midiNote, velocity);

    // Create audio processing using ScriptProcessorNode for DX7 rendering
    // TODO: Migrate to AudioWorkletNode to remove deprecation warning
    // ScriptProcessorNode is deprecated but still functional - requires full DX7 engine rewrite for AudioWorklet
    const bufferSize = dx7Config.bufferSize || 1024;
    const scriptNode = ctx.createScriptProcessor(bufferSize, 0, 2);

    let voiceActive = true; // Keep active by default
    let sampleCount = 0;
    const maxDuration = 10.0; // Max 10 seconds safety limit
    const maxSamples = maxDuration * ctx.sampleRate;

    // Calculate when to start rendering (for ratchet timing)
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    const delaySamples = Math.floor(delaySeconds * ctx.sampleRate);
    let samplesUntilStart = delaySamples;

    let firstRender = true;
    scriptNode.onaudioprocess = function(audioProcessingEvent) {
        const outputBufferL = audioProcessingEvent.outputBuffer.getChannelData(0);
        const outputBufferR = audioProcessingEvent.outputBuffer.getChannelData(1);

        // Check if voice should stop
        if (!voiceActive || sampleCount > maxSamples || dx7Voice.isFinished()) {
            voiceActive = false;
            scriptNode.disconnect();
            dx7Output.disconnect();
            voicePanner.disconnect();
            return;
        }

        // Handle delayed start for ratchets
        if (samplesUntilStart > 0) {
            const samplesToSkip = Math.min(samplesUntilStart, bufferSize);

            // Output silence for delayed samples
            for (let sample = 0; sample < samplesToSkip; sample++) {
                outputBufferL[sample] = 0;
                outputBufferR[sample] = 0;
            }

            samplesUntilStart -= samplesToSkip;

            // If we've finished waiting, render remaining samples in this buffer
            if (samplesUntilStart === 0 && samplesToSkip < bufferSize) {
                for (let sample = samplesToSkip; sample < bufferSize; sample++) {
                    const output = dx7Voice.render();
                    outputBufferL[sample] = output[0];
                    outputBufferR[sample] = output[1];
                    sampleCount++;
                }
            }
            return;
        }

        // Normal rendering (no delay or delay finished)
        for (let sample = 0; sample < bufferSize; sample++) {
            const output = dx7Voice.render();
            outputBufferL[sample] = output[0];
            outputBufferR[sample] = output[1];
            sampleCount++;
        }
    };

    scriptNode.connect(dx7Output);

    // Apply bit reduction and drive effects
    let currentNode = dx7Output;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    // Apply bit reduction
    if (bitReduction > 0) {
        const bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    // Apply drive
    if (drive > 0) {
        const distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';

        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect to panner
    currentNode.connect(voicePanner);

    // Store voice instance for management
    const voiceInstance = {
        voiceIndex,
        chokeGroup: voiceSettings.chokeGroup,
        startTime,
        active: true,
        dx7Voice: dx7Voice,
        nodes: {
            scriptNode,
            dx7Output,
            panner: voicePanner,
            reverbSendGain,
            delaySendGain,
            bitCrusher: bitReduction > 0 ? currentNode : null,
            distortion: drive > 0 ? currentNode : null
        },
        noteOff: function() {
            if (dx7Voice) {
                dx7Voice.noteOff();
            }
        }
    };

    activeVoices.push(voiceInstance);

    // Auto cleanup after max duration
    setTimeout(() => {
        if (voiceInstance.active) {
            voiceActive = false;
            cleanupVoice(voiceInstance);
        }
    }, (maxDuration + 0.5) * 1000);

    return voiceInstance;
}

/**
 * AudioWorklet version for DX7 FM Synthesis
 * Creates per-voice AudioWorkletNode with stereo output and full effects chain
 */
function createDX7VoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0, sampledPitchOverride = null, melodicMidiNoteOverride = null) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Check if DX7 patch is loaded
    if (!voiceSettings.dx7Patch) {
        console.error('[createDX7VoiceAudioWorklet] No DX7 patch loaded - please load a DX7 bank first');
        console.error('  Voice state:', {
            engine: voiceSettings.engine,
            dx7PatchName: voiceSettings.dx7PatchName,
            dx7PatchIndex: voiceSettings.dx7PatchIndex,
            macroPatch: voiceSettings.macroPatch,
            macroDepth: voiceSettings.macroDepth,
            macroRate: voiceSettings.macroRate
        });
        return; // Cannot create DX7 voice without a patch
    }

    // Set up DX7 voice parameters from patch
    const patchData = voiceSettings.dx7Patch.parsed || voiceSettings.dx7Patch;

    // Validate patch data structure
    if (!patchData.algorithm || !patchData.operators || patchData.operators.length !== 6) {
        console.error('[createDX7VoiceAudioWorklet] Invalid DX7 patch data structure');
        console.error('  Validation failed:', {
            hasAlgorithm: !!patchData.algorithm,
            hasOperators: !!patchData.operators,
            operatorCount: patchData.operators?.length
        });
        return; // Cannot create DX7 voice with invalid patch
    }

    // Apply macro modifiers to patch before loading
    const modifiedPatch = applyDX7MacroModifiers(patchData, voiceSettings);

    // Get DX7-specific parameters
    const fineTune = voiceSettings.dx7FineTune !== undefined ? voiceSettings.dx7FineTune : 0;

    // Calculate base MIDI note
    let baseMidiNote;
    if (melodicMidiNoteOverride !== null) {
        // Melodic keyboard input - use MIDI note directly (no pitch calculation)
        baseMidiNote = melodicMidiNoteOverride;
    } else {
        // Use sampledPitchOverride if provided (S&H behavior for PPMod), otherwise read from state
        const pitchParam = sampledPitchOverride !== null ? sampledPitchOverride : (voiceSettings.macroPitch ?? 50);

        // Calculate base MIDI note (same logic as ScriptProcessorNode version)
        // NOTE: dx7Transpose is NOT used - it's derived from macroPitch and would double-count
        if (state.scaleQuantizeEnabled) {
            // Scale quantization - notes stays within selected scale
            baseMidiNote = quantizePitchToScale(pitchParam, state.globalScale, state.globalRoot);
        } else {
            // Linear pitch mapping: pitch 50 = C3 (MIDI 48), ±2 octaves range
            baseMidiNote = Math.floor(48 + ((pitchParam - 50) / 50) * 24); // MIDI 24-72 (C1-C5)
        }
    }

    // Apply fine tune offset (cents to fractional semitones)
    const midiNote = baseMidiNote + (fineTune / 100);

    // Calculate velocity (matches all other engines)
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    const velocity = accentMultiplier * velocityMultiplier;

    // Create per-voice AudioWorkletNode with stereo output
    const workletNode = new AudioWorkletNode(ctx, 'dx7-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [2] // Stereo output
    });

    // Add error listeners for debugging
    workletNode.onprocessorerror = (event) => {
        console.error('[DX7Voice] Processor error:', event);
    };
    workletNode.port.onmessageerror = (event) => {
        console.error('[DX7Voice] Message error:', event);
    };

    // REMOVED: Debug message handler was creating a memory leak
    // The listener was never cleared, preventing garbage collection
    // If debug logging is needed, use finite-lifetime listeners or cleanup properly

    // CRITICAL: Send parameters to processor BEFORE triggering
    // This initializes the global DX7 params that FMVoice needs
    workletNode.port.postMessage({
        type: 'setParams',
        params: modifiedPatch
    });

    // Calculate sample-accurate delay for ratchets and flams
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    const delaySamples = Math.floor(delaySeconds * ctx.sampleRate);

    // Send trigger message to processor
    workletNode.port.postMessage({
        type: 'trigger',
        note: midiNote,
        velocity,
        delaySamples: delaySamples
    });

    // Create stereo gain node for DX7 output
    const dx7Output = ctx.createGain();
    // CRITICAL FIX: Apply voice level (like all other AudioWorklet engines)
    const level = levelToGain(voiceSettings.level); // Power curve for perceptual volume control
    dx7Output.gain.value = level * DX7_OUTPUT_ATTENUATION; // Apply -7.2dB attenuation to match other engines

    // Create effects chain
    const voicePanner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    voicePanner.pan.setValueAtTime(panValue, startTime);

    // Effect send gains
    const reverbSendGain = ctx.createGain();
    const delaySendGain = ctx.createGain();
    const reverbSendLevel = parseFloat(voiceSettings.reverbSend);
    const delaySendLevel = parseFloat(voiceSettings.delaySend);

    // Connect worklet to dx7Output
    workletNode.connect(dx7Output);

    // Apply bit reduction and drive effects
    let currentNode = dx7Output;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    // Apply bit reduction
    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    // Apply drive
    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect to panner
    currentNode.connect(voicePanner);

    // Per-voice crossfade routing for Clouds
    voicePanner.connect(config.cloudsDirectGains[voiceIndex]);
    voicePanner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        voicePanner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(voicePanner, voiceIndex);

    // Effect sends - ONLY create connections if send level > 0 to prevent audio bleeding
    if (reverbSendLevel > 0) {
        reverbSendGain.gain.value = reverbSendLevel / 100;
        voicePanner.connect(reverbSendGain);
        if (config.reverbNode) reverbSendGain.connect(config.reverbNode);
    }

    if (delaySendLevel > 0) {
        delaySendGain.gain.value = delaySendLevel / 100;
        voicePanner.connect(delaySendGain);
        if (config.delayNode) delaySendGain.connect(config.delayNode);
    }

    // Listen for completion from AudioWorklet
    workletNode.port.onmessage = (event) => {
        if (event.data.type === 'finished') {
            // CRITICAL FIX: Clear event listener to prevent memory leak
            // This breaks circular reference that prevents garbage collection
            workletNode.port.onmessage = null;

            // Clear legato state if this voice was the legato voice
            // This is the ONLY place legato state should be cleared (when envelope truly finishes)
            if (dx7LegatoState[voiceIndex]?.node === workletNode) {
                dx7LegatoState[voiceIndex] = null;
            }

            // Disconnect nodes after a brief delay to avoid clicks
            setTimeout(() => {
                workletNode.disconnect();
                dx7Output.disconnect();
                voicePanner.disconnect();
                if (bitCrusherNode) bitCrusherNode.disconnect();
                if (distortionNode) distortionNode.disconnect();
            }, 50);

            cleanupVoiceInstance(voiceInstance);
        } else if (event.data.type === 'error') {
            console.error('[DX7Worklet] Error:', event.data.message);
        } else if (event.data.type === 'dropout') {
            // PERFORMANCE MONITORING: Dropout detected in AudioWorklet
            const severity = event.data.severity;
            const prefix = severity === 'CRITICAL' ? '[PERF-CRITICAL]' : '[PERF-WARN]';
            console.warn(`${prefix} DX7 Dropout detected!`, {
                severity: event.data.severity,
                renderTime: event.data.renderTime + 'ms',
                deadline: event.data.deadline + 'ms',
                cpuOverhead: event.data.cpuOverhead + '%',
                timestamp: event.data.timestamp.toFixed(3) + 's',
                voiceIndex: voiceIndex
            });
        } else if (event.data.type === 'performance-stats') {
            // PERFORMANCE MONITORING: Periodic stats from AudioWorklet
            // (logging removed)
        }
    };

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        engine: 'DX7', // CRITICAL: Track engine type for voice count monitoring
        chokeGroup: voiceSettings.chokeGroup,
        startTime,
        active: true,
        audioWorklet: true, // CRITICAL FIX: Flag for real-time parameter updates
        workletNode, // Store worklet node reference
        nodes: {
            processor: workletNode,
            dx7Output,
            panner: voicePanner,
            reverbSendGain,
            delaySendGain,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        },
        noteOff: function() {
            // Send noteOff message to processor
            if (this.workletNode) {
                this.workletNode.port.postMessage({ type: 'noteOff' });
            }
        }
    };

    activeVoices.push(voiceInstance);
    return voiceInstance;
}


// --- Sampler Engine ---
function createSamplerVoice(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Create sampler engine instance
    const sampler = new SamplerEngine(ctx.sampleRate);

    // Get parameters from voice settings (applied by applyMacroToVoice)
    let sampleIndex = Math.floor(voiceSettings.sampleIndex !== undefined ? voiceSettings.sampleIndex : 0);
    const decay = voiceSettings.samplerDecay !== undefined ? voiceSettings.samplerDecay : 50;  // DECAY
    const filter = voiceSettings.samplerFilter !== undefined ? voiceSettings.samplerFilter : 50;  // FILTER

    // Use per-voice buffer array (SLICE pattern)
    const voiceSampleBank = voiceSettings.samplerBuffer;

    if (!voiceSampleBank || !Array.isArray(voiceSampleBank) || voiceSampleBank.length === 0) {
        console.warn(`[createSamplerVoice] No samples loaded for voice ${voiceIndex}, using FM fallback`);
        return createFMVoice(voiceIndex, startTime, accentLevel, velocityMultiplier);
    }

    const bankSampleCount = voiceSampleBank.length;

    // Validate sample index - if out of range, use first sample
    if (sampleIndex < 0 || sampleIndex >= bankSampleCount) {
        console.warn(`[createSamplerVoice] Invalid sample index ${sampleIndex}, resetting to 0 (${bankSampleCount} samples available)`);
        sampleIndex = 0;
        voiceSettings.sampleIndex = sampleIndex;

        // Also update in state.voices to ensure persistence
        if (state.voices && state.voices[voiceIndex]) {
            state.voices[voiceIndex].sampleIndex = sampleIndex;
        }
    }

    // Load sample buffer from per-voice array (NOT global manager)
    const buffer = voiceSampleBank[sampleIndex]?.buffer;
    if (!buffer) {
        console.warn(`[createSamplerVoice] No buffer found at index ${sampleIndex}, using FM fallback`);
        return createFMVoice(voiceIndex, startTime, accentLevel, velocityMultiplier);
    }

    sampler.loadBuffer(buffer);

    // Set sampler parameters
    sampler.setParameters(sampleIndex, decay, filter);

    // Calculate pitch offset from PITCH parameter (macroPitch: 0-100 → -24 to +24 semitones)
    const macroPitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;
    const pitchOffset = ((macroPitch - 50) / 50) * 24; // 0=−24st, 50=0st, 100=+24st

    // Sample name for debug
    const sampleName = voiceSampleBank[sampleIndex]?.name || `Sample ${sampleIndex + 1}`;

    // Trigger the sampler
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    sampler.trigger(accentMultiplier * velocityMultiplier, pitchOffset);

    // Create ScriptProcessorNode for audio rendering
    const bufferSize = 1024;
    const processor = ctx.createScriptProcessor(bufferSize, 0, 1);

    // Calculate timing
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    let samplesUntilStart = Math.floor(delaySeconds * ctx.sampleRate);
    let sampleCount = 0;
    const maxDuration = 10.0; // 10 second max for samples
    const maxSamples = maxDuration * ctx.sampleRate;

    let firstBuffer = true;
    let maxAmplitude = 0;
    let firstSamples = [];
    processor.onaudioprocess = function(event) {
        const output = event.outputBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            if (samplesUntilStart > 0) {
                output[i] = 0;
                samplesUntilStart--;
            } else {
                output[i] = sampler.process();

                // [DEBUG] Track amplitude for first 10 samples
                if (sampleCount < 10) {
                    firstSamples.push(output[i]);
                }
                maxAmplitude = Math.max(maxAmplitude, Math.abs(output[i]));

                sampleCount++;

                // Stop if sampler is no longer active or max duration reached
                if (sampleCount > maxSamples || !sampler.isActive()) {
                    // [DEBUG] Log final amplitude statistics
                    // console.log(`[SAMPLE-END] index=${sampleIndex}, name="${sampleName}", samples=${sampleCount}, maxAmp=${maxAmplitude.toFixed(6)}, first10=${firstSamples.map(s => s.toFixed(4)).join(',')}`);

                    processor.disconnect();
                    masterGain.disconnect();
                    panner.disconnect();
                    cleanupVoiceInstance(voiceInstance);
                    return;
                }
            }
        }
    };

    // Create effects chain
    const masterGain = ctx.createGain();
    const level = voiceSettings.level / 100; // velocityMultiplier already applied in engine trigger()
    masterGain.gain.setValueAtTime(level, startTime);

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    panner.pan.setValueAtTime(panValue, startTime);

    // Connect processor to masterGain first
    processor.connect(masterGain);

    // Apply bit reduction and drive effects
    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    // Apply bit reduction
    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    // Apply drive
    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect final node to panner
    currentNode.connect(panner);

    // Connect to master output (via Clouds crossfade routing)
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to effects sends
    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.value = voiceSettings.reverbSend / 100;
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.value = voiceSettings.delaySend / 100;
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(panner, voiceIndex);

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        nodes: {
            processor,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        },
        sampler // Store sampler instance
    };

    activeVoices.push(voiceInstance);

    return voiceInstance;
}

/**
 * AudioWorklet version for Sampler Engine
 * Creates per-voice AudioWorkletNode with full effects chain
 */
function createSamplerVoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Get parameters from voice settings
    let sampleIndex = Math.floor(voiceSettings.sampleIndex !== undefined ? voiceSettings.sampleIndex : 0);
    const decay = voiceSettings.samplerDecay !== undefined ? voiceSettings.samplerDecay : 50;  // DECAY
    const filter = voiceSettings.samplerFilter !== undefined ? voiceSettings.samplerFilter : 50;  // FILTER

    // Use per-voice buffer array (SLICE pattern)
    const voiceSampleBank = voiceSettings.samplerBuffer;

    if (!voiceSampleBank || !Array.isArray(voiceSampleBank) || voiceSampleBank.length === 0) {
        console.warn(`[createSamplerVoiceAudioWorklet] No samples loaded for voice ${voiceIndex}, using DX7 fallback`);
        return createDX7VoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier);
    }

    const bankSampleCount = voiceSampleBank.length;

    // Validate sample index
    if (sampleIndex < 0 || sampleIndex >= bankSampleCount) {
        console.warn(`[createSamplerVoiceAudioWorklet] Invalid sample index ${sampleIndex}, resetting to 0`);
        sampleIndex = 0;
        voiceSettings.sampleIndex = sampleIndex;
        if (state.voices && state.voices[voiceIndex]) {
            state.voices[voiceIndex].sampleIndex = sampleIndex;
        }
    }

    // Load sample buffer from per-voice array (NOT global manager)
    const buffer = voiceSampleBank[sampleIndex]?.buffer;
    if (!buffer) {
        console.warn(`[createSamplerVoiceAudioWorklet] No buffer found at index ${sampleIndex}, using DX7 fallback`);
        return createDX7VoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier);
    }

    // Calculate pitch offset from PITCH parameter (macroPitch: 0-100 → -24 to +24 semitones)
    const macroPitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;
    const pitchOffset = ((macroPitch - 50) / 50) * 24; // 0=−24st, 50=0st, 100=+24st

    // Calculate accent
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    const accent = accentMultiplier * velocityMultiplier;

    // Map decay parameter (0-100 → 0-0.99 for engine)
    const decayNormalized = decay / 100 * 0.99;

    // Map filter parameter: LPF (0-49), Bypass (50), HPF (51-100)
    // 0 = fully closed LPF (200Hz), 50 = bypass, 100 = fully open HPF (4kHz)
    let filterCutoff, filterMode, useFilter;
    if (filter < 50) {
        // Lowpass mode: 4kHz down to 200Hz (exponential)
        filterMode = 'lp';
        const lpNorm = (50 - filter) / 50; // 0 at 50, 1 at 0
        filterCutoff = 4000 * Math.pow(0.05, lpNorm); // 4kHz → 200Hz
        useFilter = true;
    } else if (filter > 50) {
        // Highpass mode: 200Hz up to 4kHz (exponential)
        filterMode = 'hp';
        const hpNorm = (filter - 50) / 50; // 0 at 50, 1 at 100
        filterCutoff = 200 * Math.pow(20, hpNorm); // 200Hz → 4kHz
        useFilter = true;
    } else {
        // Bypass mode at exactly 50
        filterMode = 'none';
        filterCutoff = 1000; // Arbitrary, not used
        useFilter = false;
    }

    // Create per-voice AudioWorkletNode
    const workletNode = new AudioWorkletNode(ctx, 'sampler-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1] // Mono
    });

    // Extract sample data for worklet
    // Mix to mono if stereo - always create a copy for transfer
    let bufferData;
    if (buffer.numberOfChannels === 1) {
        // Create copy of mono channel for transfer
        const sourceData = buffer.getChannelData(0);
        bufferData = new Float32Array(sourceData.length);
        bufferData.set(sourceData);
    } else {
        // Mix stereo to mono
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        bufferData = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
            bufferData[i] = (left[i] + right[i]) * 0.5;
        }
    }

    // Transfer buffer to worklet (zero-copy transfer)
    workletNode.port.postMessage({
        type: 'loadBuffer',
        bufferData: bufferData
    }, [bufferData.buffer]); // Transferable - zero-copy

    // Calculate sample-accurate delay for ratchets and flams
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    const delaySamples = Math.floor(delaySeconds * ctx.sampleRate);

    // Send trigger message
    workletNode.port.postMessage({
        type: 'trigger',
        accent,
        pitchOffset,
        decay: decayNormalized,
        filterCutoff,
        filterMode,
        useFilter,
        delaySamples: delaySamples
    });

    // Create effects chain (same as analog engines)
    const masterGain = ctx.createGain();
    const level = levelToGain(voiceSettings.level); // Power curve for perceptual volume control
    // Set gain immediately - AudioWorklet starts processing right away
    masterGain.gain.value = level;

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    // Set pan immediately - AudioWorklet starts processing right away
    panner.pan.value = panValue;

    // Connect worklet to masterGain
    workletNode.connect(masterGain);

    // Apply bit reduction and drive effects
    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    // Apply bit reduction
    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    // Apply drive
    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect final node to panner
    currentNode.connect(panner);

    // Connect to master output (via Clouds crossfade routing)
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to effects sends
    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.value = voiceSettings.reverbSend / 100;
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.value = voiceSettings.delaySend / 100;
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(panner, voiceIndex);

    // Listen for completion from AudioWorklet
    workletNode.port.onmessage = (event) => {
        if (event.data.type === 'finished') {
            // CRITICAL FIX: Clear event listener to prevent memory leak
            // This breaks circular reference that prevents garbage collection
            workletNode.port.onmessage = null;

            // Disconnect nodes after a brief delay to avoid clicks
            setTimeout(() => {
                workletNode.disconnect();
                masterGain.disconnect();
                panner.disconnect();
                if (bitCrusherNode) bitCrusherNode.disconnect();
                if (distortionNode) distortionNode.disconnect();
            }, 50);

            cleanupVoiceInstance(voiceInstance);
        } else if (event.data.type === 'error') {
            console.error('[SamplerWorklet] Error:', event.data.message);
        }
    };

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        audioWorklet: true, // CRITICAL FIX: Flag for real-time parameter updates
        workletNode, // Store worklet node reference
        nodes: {
            processor: workletNode,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        }
    };

    activeVoices.push(voiceInstance);
    return voiceInstance;
}

/**
 * Create a SLICE engine voice using AudioWorklet
 * Plays a specific slice from a loaded sample buffer
 *
 * @param {number} voiceIndex - Voice index (0-5)
 * @param {number} startTime - AudioContext time to start
 * @param {number} accentLevel - Accent level (0 or 1)
 * @param {number} velocityMultiplier - Velocity scaling (for flams)
 */
function createSliceVoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Get slice configuration from voice state
    const sliceConfig = voiceSettings.sliceConfig;
    const sliceBuffer = voiceSettings.sliceBuffer;
    const sliceIndex = Math.floor(voiceSettings.sliceIndex !== undefined ? voiceSettings.sliceIndex : 0);

    // Validate slice configuration
    if (!sliceConfig || !sliceConfig.slices || sliceConfig.slices.length === 0) {
        console.warn(`[createSliceVoiceAudioWorklet] No slice configuration found for voice ${voiceIndex}`);
        return;
    }

    if (!sliceBuffer) {
        console.warn(`[createSliceVoiceAudioWorklet] No buffer loaded for voice ${voiceIndex}`);
        return;
    }

    // Get current slice (clamp to valid range)
    const clampedIndex = Math.max(0, Math.min(sliceConfig.slices.length - 1, sliceIndex));
    const slice = sliceConfig.slices[clampedIndex];

    if (!slice) {
        console.warn(`[createSliceVoiceAudioWorklet] Invalid slice index ${clampedIndex} for voice ${voiceIndex}`);
        return;
    }

    // Get parameters from voice settings
    const decay = voiceSettings.samplerDecay !== undefined ? voiceSettings.samplerDecay : 50;  // DECAY
    const filter = voiceSettings.samplerFilter !== undefined ? voiceSettings.samplerFilter : 50;  // FILTER
    const macroPitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;  // PITCH

    // Calculate pitch offset (0-100 → -24 to +24 semitones)
    const pitchOffset = ((macroPitch - 50) / 50) * 24;

    // Calculate accent
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    const accent = accentMultiplier * velocityMultiplier;

    // Map decay parameter (0-100 → 0-0.99 for engine)
    const decayNormalized = decay / 100 * 0.99;

    // Map filter parameter: LPF (0-49), Bypass (50), HPF (51-100)
    let filterCutoff, filterMode, useFilter;
    if (filter < 50) {
        // Lowpass mode: 4kHz down to 200Hz (exponential)
        filterMode = 'lp';
        const lpNorm = (50 - filter) / 50;
        filterCutoff = 4000 * Math.pow(0.05, lpNorm);
        useFilter = true;
    } else if (filter > 50) {
        // Highpass mode: 200Hz up to 4kHz (exponential)
        filterMode = 'hp';
        const hpNorm = (filter - 50) / 50;
        filterCutoff = 200 * Math.pow(20, hpNorm);
        useFilter = true;
    } else {
        // Bypass mode at exactly 50
        filterMode = 'none';
        filterCutoff = 1000;
        useFilter = false;
    }

    // Create per-voice AudioWorkletNode
    const workletNode = new AudioWorkletNode(ctx, 'sampler-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1] // Mono
    });

    // Extract sample data for worklet (mix to mono if stereo)
    let bufferData;
    if (sliceBuffer.numberOfChannels === 1) {
        // Create copy of mono channel for transfer
        const sourceData = sliceBuffer.getChannelData(0);
        bufferData = new Float32Array(sourceData.length);
        bufferData.set(sourceData);
    } else {
        // Mix stereo to mono
        const left = sliceBuffer.getChannelData(0);
        const right = sliceBuffer.getChannelData(1);
        bufferData = new Float32Array(left.length);
        for (let i = 0; i < left.length; i++) {
            bufferData[i] = (left[i] + right[i]) * 0.5;
        }
    }

    // Transfer buffer to worklet with slice bounds (zero-copy)
    workletNode.port.postMessage({
        type: 'loadBuffer',
        bufferData: bufferData,
        sliceStart: slice.start,    // Slice start sample index
        sliceEnd: slice.end          // Slice end sample index
    }, [bufferData.buffer]);

    // Calculate sample-accurate delay for ratchets and flams
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    const delaySamples = Math.floor(delaySeconds * ctx.sampleRate);

    // Send trigger message
    workletNode.port.postMessage({
        type: 'trigger',
        accent,
        pitchOffset,
        decay: decayNormalized,
        filterCutoff,
        filterMode,
        useFilter,
        delaySamples: delaySamples
    });

    // Create effects chain (identical to sampler engine)
    const masterGain = ctx.createGain();
    const level = levelToGain(voiceSettings.level); // Power curve for perceptual volume control
    masterGain.gain.value = level;

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    panner.pan.value = panValue;

    workletNode.connect(masterGain);

    // Apply bit reduction and drive effects
    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    // Apply bit reduction
    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    // Apply drive
    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect final node to panner
    currentNode.connect(panner);

    // Connect to master output (via Clouds crossfade routing)
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to effects sends
    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.value = voiceSettings.reverbSend / 100;
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.value = voiceSettings.delaySend / 100;
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(panner, voiceIndex);

    // Notify slice editor when slice triggers (for visual highlighting)
    if (window.sliceEditor?.modal.classList.contains('active') &&
        window.sliceEditor.currentVoiceIndex === voiceIndex) {
        window.sliceEditor.setPlayingSlice(clampedIndex);
    }

    // Listen for completion from AudioWorklet
    workletNode.port.onmessage = (event) => {
        if (event.data.type === 'finished') {
            // Clear event listener to prevent memory leak
            workletNode.port.onmessage = null;

            // Clear slice editor highlighting when playback ends
            if (window.sliceEditor?.currentVoiceIndex === voiceIndex) {
                window.sliceEditor.setPlayingSlice(-1);
            }

            // Disconnect nodes after a brief delay to avoid clicks
            setTimeout(() => {
                workletNode.disconnect();
                masterGain.disconnect();
                panner.disconnect();
                if (bitCrusherNode) bitCrusherNode.disconnect();
                if (distortionNode) distortionNode.disconnect();
            }, 50);

            cleanupVoiceInstance(voiceInstance);
        } else if (event.data.type === 'position') {
            // Forward position updates to slice editor for playhead rendering
            if (window.sliceEditor?.modal.classList.contains('active') &&
                window.sliceEditor.currentVoiceIndex === voiceIndex) {
                window.sliceEditor.updatePlayheadPosition(event.data.position);
            }
        } else if (event.data.type === 'error') {
            console.error('[SliceWorklet] Error:', event.data.message);
        }
    };

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        audioWorklet: true,
        workletNode,
        nodes: {
            processor: workletNode,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        }
    };

    activeVoices.push(voiceInstance);
    return voiceInstance;
}

// --- Analog Kick Engine ---

/**
 * AudioWorklet version - runs on dedicated audio thread
 * Creates per-voice AudioWorkletNode with full effects chain
 * Eliminates main thread blocking and timing conflicts
 */
function createAnalogKickVoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0, triggerTimesArray = null) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Get parameters from voice settings (applied by applyMacroToVoice)
    const tone = voiceSettings.analogKickTone !== undefined ? voiceSettings.analogKickTone : 50;  // TONE
    const pitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;  // PITCH (always available)
    const decay = voiceSettings.analogKickDecay !== undefined ? voiceSettings.analogKickDecay : 60;  // DECAY
    const sweep = voiceSettings.analogKickSweep !== undefined ? voiceSettings.analogKickSweep : 70;    // SWEEP

    // Calculate velocity
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    const velocity = accentMultiplier * velocityMultiplier;

    // Create per-voice AudioWorkletNode
    const workletNode = new AudioWorkletNode(ctx, 'analog-kick-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1] // Mono
    });

    // Explicitly start the message port (required for bidirectional communication)
    workletNode.port.start();

    // Choose between ratchet mode (multiple scheduled triggers) or single-trigger mode
    if (triggerTimesArray && triggerTimesArray.length > 0) {
        // Sample-accurate ratchet mode - send all trigger times upfront
        const messageData = {
            type: 'scheduleRatchet',
            triggerTimes: triggerTimesArray.map(t => ({
                time: t.time,
                params: {
                    tone,
                    pitch,
                    decay,
                    sweep,
                    velocity: t.velocity || velocity // Allow per-trigger velocity variation
                }
            }))
        };
        workletNode.port.postMessage(messageData);
    } else {
        // Legacy single-trigger mode (for non-ratcheted hits or flams)
        // Calculate sample-accurate delay for flams
        const currentTime = ctx.currentTime;
        const delaySeconds = Math.max(0, startTime - currentTime);
        const delaySamples = Math.floor(delaySeconds * ctx.sampleRate);

        // Send trigger message to processor
        workletNode.port.postMessage({
            type: 'trigger',
            tone,
            pitch,
            decay,
            sweep,
            velocity,
            delaySamples: delaySamples
        });
    }

    // Create effects chain (same as ScriptProcessorNode version)
    const masterGain = ctx.createGain();
    const level = levelToGain(voiceSettings.level); // Power curve for perceptual volume control
    // Set gain immediately - AudioWorklet starts processing right away
    masterGain.gain.value = level;

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    // Set pan immediately - AudioWorklet starts processing right away
    panner.pan.value = panValue;

    // Connect worklet to masterGain
    workletNode.connect(masterGain);

    // Apply bit reduction and drive effects
    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    // Apply bit reduction
    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    // Apply drive
    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect final node to panner
    currentNode.connect(panner);

    // Connect to master output (via Clouds crossfade routing)
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to effects sends
    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.value = voiceSettings.reverbSend / 100;
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.value = voiceSettings.delaySend / 100;
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(panner, voiceIndex);

    // Listen for completion from AudioWorklet
    workletNode.port.onmessage = (event) => {
        if (event.data.type === 'finished') {

            // CRITICAL FIX: Clear event listener to prevent memory leak
            workletNode.port.onmessage = null;

            // FIX: Apply exponential gain fadeout BEFORE disconnect to prevent click
            // The click was caused by instantaneous gain discontinuity on disconnect
            const fadeoutMs = 50;
            const now = ctx.currentTime;
            try {
                masterGain.gain.cancelScheduledValues(now);
                masterGain.gain.setValueAtTime(masterGain.gain.value, now);
                masterGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeoutMs / 1000);
            } catch (e) {
                // Gain node may already be disconnected, ignore
            }

            // Disconnect nodes AFTER fadeout completes
            setTimeout(() => {
                try {
                    workletNode.disconnect();
                    masterGain.disconnect();
                    panner.disconnect();
                    if (bitCrusherNode) bitCrusherNode.disconnect();
                    if (distortionNode) distortionNode.disconnect();
                } catch (e) {
                    // Already disconnected, ignore
                }
            }, fadeoutMs + 10); // +10ms safety margin

            cleanupVoiceInstance(voiceInstance);
        }
    };

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        audioWorklet: true,
        nodes: {
            processor: workletNode,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        }
    };

    activeVoices.push(voiceInstance);

    return voiceInstance;
}

/**
 * AudioWorklet version for Synthetic Kick (909-style)
 * Creates per-voice AudioWorkletNode with full effects chain
 * This is the AUX output for the Bass Drum engine (dual-output architecture)
 */
function createSyntheticKickVoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0, triggerTimesArray = null) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Get parameters from voice settings (same as analog kick - TONE, PITCH, DECAY, SWEEP)
    const tone = voiceSettings.analogKickTone !== undefined ? voiceSettings.analogKickTone : 50;
    const pitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;
    const decay = voiceSettings.analogKickDecay !== undefined ? voiceSettings.analogKickDecay : 60;
    const sweep = voiceSettings.analogKickSweep !== undefined ? voiceSettings.analogKickSweep : 70;

    // Calculate velocity
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56;
    const velocity = accentMultiplier * velocityMultiplier;

    // Create per-voice AudioWorkletNode
    const workletNode = new AudioWorkletNode(ctx, 'synthetic-kick-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1] // Mono
    });

    // Explicitly start the message port
    workletNode.port.start();

    // Choose between ratchet mode or single-trigger mode
    if (triggerTimesArray && triggerTimesArray.length > 0) {
        // Sample-accurate ratchet mode
        const messageData = {
            type: 'scheduleRatchet',
            triggerTimes: triggerTimesArray.map(t => ({
                time: t.time,
                params: {
                    tone,
                    pitch,
                    decay,
                    sweep,
                    velocity: t.velocity || velocity
                }
            }))
        };
        workletNode.port.postMessage(messageData);
    } else {
        // Single-trigger mode
        const currentTime = ctx.currentTime;
        const delaySeconds = Math.max(0, startTime - currentTime);
        const delaySamples = Math.floor(delaySeconds * ctx.sampleRate);

        workletNode.port.postMessage({
            type: 'trigger',
            tone,
            pitch,
            decay,
            sweep,
            velocity,
            delaySamples: delaySamples
        });
    }

    // Create effects chain (same as analog kick)
    const masterGain = ctx.createGain();
    const level = levelToGain(voiceSettings.level);
    masterGain.gain.value = level;

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    panner.pan.value = panValue;

    // Connect worklet to masterGain
    workletNode.connect(masterGain);

    // Apply bit reduction and drive effects
    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect final node to panner
    currentNode.connect(panner);

    // Connect to master output (via Clouds crossfade routing)
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to effects sends
    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.value = voiceSettings.reverbSend / 100;
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.value = voiceSettings.delaySend / 100;
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(panner, voiceIndex);

    // Listen for completion from AudioWorklet
    workletNode.port.onmessage = (event) => {
        if (event.data.type === 'finished') {
            workletNode.port.onmessage = null;

            // FIX: Apply exponential gain fadeout BEFORE disconnect to prevent click
            // The click was caused by instantaneous gain discontinuity on disconnect
            const fadeoutMs = 50;
            const now = ctx.currentTime;
            try {
                masterGain.gain.cancelScheduledValues(now);
                masterGain.gain.setValueAtTime(masterGain.gain.value, now);
                masterGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeoutMs / 1000);
            } catch (e) {
                // Gain node may already be disconnected, ignore
            }

            // Disconnect nodes AFTER fadeout completes
            setTimeout(() => {
                try {
                    workletNode.disconnect();
                    masterGain.disconnect();
                    panner.disconnect();
                    if (bitCrusherNode) bitCrusherNode.disconnect();
                    if (distortionNode) distortionNode.disconnect();
                } catch (e) {
                    // Already disconnected, ignore
                }
            }, fadeoutMs + 10); // +10ms safety margin

            cleanupVoiceInstance(voiceInstance);
        }
    };

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        audioWorklet: true,
        nodes: {
            processor: workletNode,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        }
    };

    activeVoices.push(voiceInstance);

    return voiceInstance;
}

/**
 * AudioWorklet version for Analog Snare
 * Creates per-voice AudioWorkletNode with full effects chain
 */
function createAnalogSnareVoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Get parameters from voice settings
    const tone = voiceSettings.macroPatch !== undefined ? voiceSettings.macroPatch : 40;  // TONE
    const pitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;  // PITCH
    const decay = voiceSettings.macroDepth !== undefined ? voiceSettings.macroDepth : 50;  // DECAY
    const snap = voiceSettings.macroRate !== undefined ? voiceSettings.macroRate : 60;    // SNAP

    // Calculate velocity
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    const velocity = accentMultiplier * velocityMultiplier;

    // Create per-voice AudioWorkletNode
    const workletNode = new AudioWorkletNode(ctx, 'analog-snare-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1] // Mono
    });

    // Calculate sample-accurate delay for ratchets and flams
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    const delaySamples = Math.floor(delaySeconds * ctx.sampleRate);

    // Send trigger message
    workletNode.port.postMessage({
        type: 'trigger',
        tone,
        pitch,
        decay,
        snap,
        velocity,
        delaySamples: delaySamples
    });

    // Create effects chain (same as kick)
    const masterGain = ctx.createGain();
    const level = levelToGain(voiceSettings.level); // Power curve for perceptual volume control
    masterGain.gain.setValueAtTime(level, startTime);

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    panner.pan.setValueAtTime(panValue, startTime);

    workletNode.connect(masterGain);

    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    currentNode.connect(panner);
    // Clouds crossfade routing
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.setValueAtTime(voiceSettings.reverbSend / 100, startTime);
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.setValueAtTime(voiceSettings.delaySend / 100, startTime);
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    workletNode.port.onmessage = (event) => {
        if (event.data.type === 'finished') {
            // CRITICAL FIX: Clear event listener to prevent memory leak
            workletNode.port.onmessage = null;

            // FIX: Apply exponential gain fadeout BEFORE disconnect to prevent click
            // The click was caused by instantaneous gain discontinuity on disconnect
            const fadeoutMs = 50;
            const now = ctx.currentTime;
            try {
                masterGain.gain.cancelScheduledValues(now);
                masterGain.gain.setValueAtTime(masterGain.gain.value, now);
                masterGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeoutMs / 1000);
            } catch (e) {
                // Gain node may already be disconnected, ignore
            }

            // Disconnect nodes AFTER fadeout completes
            setTimeout(() => {
                try {
                    workletNode.disconnect();
                    masterGain.disconnect();
                    panner.disconnect();
                    if (bitCrusherNode) bitCrusherNode.disconnect();
                    if (distortionNode) distortionNode.disconnect();
                } catch (e) {
                    // Already disconnected, ignore
                }
            }, fadeoutMs + 10); // +10ms safety margin

            cleanupVoiceInstance(voiceInstance);
        }
    };

    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        audioWorklet: true,
        nodes: {
            processor: workletNode,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        }
    };

    activeVoices.push(voiceInstance);
    return voiceInstance;
}

/**
 * AudioWorklet version for Synthetic Snare (909-style)
 * Creates per-voice AudioWorkletNode with full effects chain
 * This is the AUX output for the Snare Drum engine (dual-output architecture)
 */
function createSyntheticSnareVoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Get parameters from voice settings (same as analog snare - TONE, PITCH, DECAY, SNAP)
    const tone = voiceSettings.macroPatch !== undefined ? voiceSettings.macroPatch : 40;
    const pitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;
    const decay = voiceSettings.macroDepth !== undefined ? voiceSettings.macroDepth : 50;
    const snap = voiceSettings.macroRate !== undefined ? voiceSettings.macroRate : 60;

    // Calculate velocity
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56;
    const velocity = accentMultiplier * velocityMultiplier;

    // Create per-voice AudioWorkletNode
    const workletNode = new AudioWorkletNode(ctx, 'synthetic-snare-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1] // Mono
    });

    // Explicitly start the message port
    workletNode.port.start();

    // Calculate sample-accurate delay
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    const delaySamples = Math.floor(delaySeconds * ctx.sampleRate);

    // Send trigger message
    workletNode.port.postMessage({
        type: 'trigger',
        tone,
        pitch,
        decay,
        snap,
        velocity,
        delaySamples: delaySamples
    });

    // Create effects chain (same as analog snare)
    const masterGain = ctx.createGain();
    const level = levelToGain(voiceSettings.level);
    masterGain.gain.setValueAtTime(level, startTime);

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    panner.pan.setValueAtTime(panValue, startTime);

    // Connect worklet to masterGain
    workletNode.connect(masterGain);

    // Apply bit reduction and drive effects
    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect final node to panner
    currentNode.connect(panner);

    // Connect to master output (via Clouds crossfade routing)
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to effects sends
    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.setValueAtTime(voiceSettings.reverbSend / 100, startTime);
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.setValueAtTime(voiceSettings.delaySend / 100, startTime);
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(panner, voiceIndex);

    // Listen for completion from AudioWorklet
    workletNode.port.onmessage = (event) => {
        if (event.data.type === 'finished') {
            workletNode.port.onmessage = null;

            // FIX: Apply exponential gain fadeout BEFORE disconnect to prevent click
            // The click was caused by instantaneous gain discontinuity on disconnect
            const fadeoutMs = 50;
            const now = ctx.currentTime;
            try {
                masterGain.gain.cancelScheduledValues(now);
                masterGain.gain.setValueAtTime(masterGain.gain.value, now);
                masterGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeoutMs / 1000);
            } catch (e) {
                // Gain node may already be disconnected, ignore
            }

            // Disconnect nodes AFTER fadeout completes
            setTimeout(() => {
                try {
                    workletNode.disconnect();
                    masterGain.disconnect();
                    panner.disconnect();
                    if (bitCrusherNode) bitCrusherNode.disconnect();
                    if (distortionNode) distortionNode.disconnect();
                } catch (e) {
                    // Already disconnected, ignore
                }
            }, fadeoutMs + 10); // +10ms safety margin

            cleanupVoiceInstance(voiceInstance);
        }
    };

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        audioWorklet: true,
        nodes: {
            processor: workletNode,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        }
    };

    activeVoices.push(voiceInstance);

    return voiceInstance;
}

/**
 * AudioWorklet version for Analog Hi-Hat
 * Creates per-voice AudioWorkletNode with full effects chain
 */
function createAnalogHiHatVoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Get parameters from voice settings
    const tone = voiceSettings.macroPatch !== undefined ? voiceSettings.macroPatch : 60;  // TONE
    const pitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;  // PITCH
    const decay = voiceSettings.macroDepth !== undefined ? voiceSettings.macroDepth : 30;  // DECAY
    const noisiness = voiceSettings.macroRate !== undefined ? voiceSettings.macroRate : 20;    // NOISINESS

    // Calculate velocity
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    const velocity = accentMultiplier * velocityMultiplier;

    // Create per-voice AudioWorkletNode
    const workletNode = new AudioWorkletNode(ctx, 'analog-hihat-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1] // Mono
    });

    // Calculate sample-accurate delay for ratchets and flams
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    const delaySamples = Math.floor(delaySeconds * ctx.sampleRate);

    // Send trigger message
    workletNode.port.postMessage({
        type: 'trigger',
        tone,
        pitch,
        decay,
        noisiness,
        velocity,
        delaySamples: delaySamples
    });

    // Create effects chain (same as kick/snare)
    const masterGain = ctx.createGain();
    const level = levelToGain(voiceSettings.level); // Power curve for perceptual volume control
    masterGain.gain.setValueAtTime(level, startTime);

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    panner.pan.setValueAtTime(panValue, startTime);

    workletNode.connect(masterGain);

    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    currentNode.connect(panner);
    // Clouds crossfade routing
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.setValueAtTime(voiceSettings.reverbSend / 100, startTime);
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.setValueAtTime(voiceSettings.delaySend / 100, startTime);
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    workletNode.port.onmessage = (event) => {
        if (event.data.type === 'finished') {
            // CRITICAL FIX: Clear event listener to prevent memory leak
            workletNode.port.onmessage = null;

            setTimeout(() => {
                workletNode.disconnect();
                masterGain.disconnect();
                panner.disconnect();
                if (bitCrusherNode) bitCrusherNode.disconnect();
                if (distortionNode) distortionNode.disconnect();
            }, 50);
            cleanupVoiceInstance(voiceInstance);
        }
    };

    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        audioWorklet: true,
        nodes: {
            processor: workletNode,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        }
    };

    activeVoices.push(voiceInstance);
    return voiceInstance;
}

/**
 * AudioWorklet version for RingMod Hi-Hat (909-style metallic)
 * Creates per-voice AudioWorkletNode with full effects chain
 * This is the AUX output for the Hi-Hat engine (dual-output architecture)
 */
function createRingModHiHatVoiceAudioWorklet(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Get parameters from voice settings (same as analog hi-hat - METAL, PITCH, DECAY, BRIGHT)
    const metal = voiceSettings.macroPatch !== undefined ? voiceSettings.macroPatch : 60;
    const pitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;
    const decay = voiceSettings.macroDepth !== undefined ? voiceSettings.macroDepth : 30;
    const bright = voiceSettings.macroRate !== undefined ? voiceSettings.macroRate : 20;

    // Calculate velocity
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56;
    const velocity = accentMultiplier * velocityMultiplier;

    // Create per-voice AudioWorkletNode
    const workletNode = new AudioWorkletNode(ctx, 'ringmod-hihat-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1] // Mono
    });

    // Explicitly start the message port
    workletNode.port.start();

    // Calculate sample-accurate delay
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    const delaySamples = Math.floor(delaySeconds * ctx.sampleRate);

    // Send trigger message
    workletNode.port.postMessage({
        type: 'trigger',
        metal,
        pitch,
        decay,
        bright,
        velocity,
        delaySamples: delaySamples
    });

    // Create effects chain (same as analog hi-hat)
    const masterGain = ctx.createGain();
    const level = levelToGain(voiceSettings.level);
    masterGain.gain.setValueAtTime(level, startTime);

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    panner.pan.setValueAtTime(panValue, startTime);

    // Connect worklet to masterGain
    workletNode.connect(masterGain);

    // Apply bit reduction and drive effects
    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect final node to panner
    currentNode.connect(panner);

    // Connect to master output (via Clouds crossfade routing)
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to effects sends
    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.setValueAtTime(voiceSettings.reverbSend / 100, startTime);
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.setValueAtTime(voiceSettings.delaySend / 100, startTime);
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(panner, voiceIndex);

    // Listen for completion from AudioWorklet
    workletNode.port.onmessage = (event) => {
        if (event.data.type === 'finished') {
            workletNode.port.onmessage = null;

            // FIX: Apply exponential gain fadeout BEFORE disconnect to prevent click
            // The click was caused by instantaneous gain discontinuity on disconnect
            const fadeoutMs = 50;
            const now = ctx.currentTime;
            try {
                masterGain.gain.cancelScheduledValues(now);
                masterGain.gain.setValueAtTime(masterGain.gain.value, now);
                masterGain.gain.exponentialRampToValueAtTime(0.0001, now + fadeoutMs / 1000);
            } catch (e) {
                // Gain node may already be disconnected, ignore
            }

            // Disconnect nodes AFTER fadeout completes
            setTimeout(() => {
                try {
                    workletNode.disconnect();
                    masterGain.disconnect();
                    panner.disconnect();
                    if (bitCrusherNode) bitCrusherNode.disconnect();
                    if (distortionNode) distortionNode.disconnect();
                } catch (e) {
                    // Already disconnected, ignore
                }
            }, fadeoutMs + 10); // +10ms safety margin

            cleanupVoiceInstance(voiceInstance);
        }
    };

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        audioWorklet: true,
        nodes: {
            processor: workletNode,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        }
    };

    activeVoices.push(voiceInstance);

    return voiceInstance;
}

/**
 * ScriptProcessorNode version (legacy fallback)
 */
function createAnalogKickVoice(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Create analog kick synthesizer instance
    const kick = new AnalogKick(ctx.sampleRate);

    // Get parameters from voice settings (applied by applyMacroToVoice)
    const tone = voiceSettings.analogKickTone !== undefined ? voiceSettings.analogKickTone : 50;  // TONE
    const pitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;  // PITCH (always available)
    const decay = voiceSettings.analogKickDecay !== undefined ? voiceSettings.analogKickDecay : 60;  // DECAY
    const sweep = voiceSettings.analogKickSweep !== undefined ? voiceSettings.analogKickSweep : 70;    // SWEEP

    // Set kick parameters
    kick.setParameters(tone, pitch, decay, sweep);

    // Trigger the kick
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    kick.trigger(accentMultiplier * velocityMultiplier);

    // Create ScriptProcessorNode for audio rendering
    const bufferSize = 1024;
    const processor = ctx.createScriptProcessor(bufferSize, 0, 1);

    // Calculate timing
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    let samplesUntilStart = Math.floor(delaySeconds * ctx.sampleRate);
    let sampleCount = 0;
    const maxDuration = 5.0; // 5 second max
    const maxSamples = maxDuration * ctx.sampleRate;

    let firstBuffer = true;
    processor.onaudioprocess = function(event) {
        const output = event.outputBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            if (samplesUntilStart > 0) {
                output[i] = 0;
                samplesUntilStart--;
            } else {
                output[i] = kick.process();

                sampleCount++;

                // Stop if kick is no longer active or max duration reached
                if (sampleCount > maxSamples || !kick.isActive()) {
                    processor.disconnect();
                    masterGain.disconnect();
                    panner.disconnect();
                    cleanupVoiceInstance(voiceInstance);
                    return;
                }
            }
        }
    };

    // Create effects chain
    const masterGain = ctx.createGain();
    const level = voiceSettings.level / 100; // velocityMultiplier already applied in engine trigger()
    masterGain.gain.setValueAtTime(level, startTime);

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    panner.pan.setValueAtTime(panValue, startTime);

    // Connect processor to masterGain first
    processor.connect(masterGain);

    // Apply bit reduction and drive effects
    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    // Apply bit reduction
    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    // Apply drive
    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect final node to panner
    currentNode.connect(panner);

    // Connect to master output (via Clouds crossfade routing)
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to effects sends
    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.value = voiceSettings.reverbSend / 100;
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.value = voiceSettings.delaySend / 100;
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(panner, voiceIndex);

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        nodes: {
            processor,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        },
        kick // Store synthesizer instance
    };

    activeVoices.push(voiceInstance);

    return voiceInstance;
}

function cleanupVoiceInstance(voiceInstance) {
    const index = activeVoices.indexOf(voiceInstance);
    if (index > -1) {
        activeVoices.splice(index, 1);
    }
    voiceInstance.active = false;

    // NOTE: Do NOT clear port.onmessage here!
    // The message handler must stay alive so the processor can send 'finished' message.
    // The 'finished' handler (in createDX7VoiceAudioWorklet) will clear it after receiving the message.
    // If we clear it here, the 'finished' message never arrives, workletNode never disconnects,
    // and nodes accumulate causing cutouts after ~6 bars.
}

// --- Analog Snare Engine ---
function createAnalogSnareVoice(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Create analog snare synthesizer instance
    const snare = new AnalogSnare(ctx.sampleRate);

    // Get parameters from voice settings (applied by applyMacroToVoice)
    // Use nullish coalescing to allow 0 values (avoid || operator which treats 0 as falsy)
    const tone = voiceSettings.macroPatch !== undefined ? voiceSettings.macroPatch : 40;   // TONE (modal character)
    const pitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;  // PITCH (f0 frequency)
    const decay = voiceSettings.macroDepth !== undefined ? voiceSettings.macroDepth : 50;  // DECAY (resonance time)
    const snap = voiceSettings.macroRate !== undefined ? voiceSettings.macroRate : 60;    // SNAP (noise amount)

    // Set snare parameters (tone, pitch, decay, snap)
    snare.setParameters(tone, pitch, decay, snap);

    // Trigger the snare
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    snare.trigger(accentMultiplier * velocityMultiplier);

    // Create ScriptProcessorNode for audio rendering
    const bufferSize = 1024;
    const processor = ctx.createScriptProcessor(bufferSize, 0, 1);

    // Calculate timing
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    let samplesUntilStart = Math.floor(delaySeconds * ctx.sampleRate);
    let sampleCount = 0;
    const maxDuration = 5.0; // 5 second max
    const maxSamples = maxDuration * ctx.sampleRate;

    let firstBuffer = true;
    processor.onaudioprocess = function(event) {
        const output = event.outputBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            if (samplesUntilStart > 0) {
                output[i] = 0;
                samplesUntilStart--;
            } else {
                output[i] = snare.process();

                sampleCount++;

                // Stop if snare is no longer active or max duration reached
                if (sampleCount > maxSamples || !snare.isActive()) {
                    processor.disconnect();
                    masterGain.disconnect();
                    panner.disconnect();
                    cleanupVoiceInstance(voiceInstance);
                    return;
                }
            }
        }
    };

    // Create effects chain
    const masterGain = ctx.createGain();
    const level = voiceSettings.level / 100; // velocityMultiplier already applied in engine trigger()
    masterGain.gain.setValueAtTime(level, startTime);

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    panner.pan.setValueAtTime(panValue, startTime);

    // Connect processor to masterGain first
    processor.connect(masterGain);

    // Apply bit reduction and drive effects
    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    // Apply bit reduction
    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    // Apply drive
    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect final node to panner
    currentNode.connect(panner);

    // Connect to master output (via Clouds crossfade routing)
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to effects sends
    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.value = voiceSettings.reverbSend / 100;
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.value = voiceSettings.delaySend / 100;
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(panner, voiceIndex);

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        nodes: {
            processor,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        },
        snare // Store synthesizer instance
    };

    activeVoices.push(voiceInstance);

    return voiceInstance;
}

// --- Analog Hi-Hat Engine ---
function createAnalogHiHatVoice(voiceIndex, startTime, accentLevel, velocityMultiplier = 1.0) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const voiceSettings = state.voices[voiceIndex];

    // Create analog hi-hat synthesizer instance
    const hihat = new AnalogHiHat(ctx.sampleRate);

    // Get parameters from voice settings (applied by applyMacroToVoice)
    // Use nullish coalescing to allow 0 values (avoid || operator which treats 0 as falsy)
    const tone = voiceSettings.macroPatch !== undefined ? voiceSettings.macroPatch : 60;   // TONE (filter cutoff)
    const pitch = voiceSettings.macroPitch !== undefined ? voiceSettings.macroPitch : 50;  // PITCH (f0 frequency)
    const decay = voiceSettings.macroDepth !== undefined ? voiceSettings.macroDepth : 30;  // DECAY (envelope time)
    const noisiness = voiceSettings.macroRate !== undefined ? voiceSettings.macroRate : 20; // NOISINESS (clocked noise mix)

    // Set hi-hat parameters (tone, pitch, decay, noisiness)
    hihat.setParameters(tone, pitch, decay, noisiness);

    // Trigger the hi-hat
    const accentMultiplier = accentLevel > 0 ? 1.0 : 0.56; // 0.56 = 20% decrease from 0.7
    hihat.trigger(accentMultiplier * velocityMultiplier);

    // Create ScriptProcessorNode for audio rendering
    const bufferSize = 1024;
    const processor = ctx.createScriptProcessor(bufferSize, 0, 1);

    // Calculate timing
    const currentTime = ctx.currentTime;
    const delaySeconds = Math.max(0, startTime - currentTime);
    let samplesUntilStart = Math.floor(delaySeconds * ctx.sampleRate);
    let sampleCount = 0;
    const maxDuration = 5.0; // 5 second max
    const maxSamples = maxDuration * ctx.sampleRate;

    let firstBuffer = true;
    processor.onaudioprocess = function(event) {
        const output = event.outputBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            if (samplesUntilStart > 0) {
                output[i] = 0;
                samplesUntilStart--;
            } else {
                output[i] = hihat.process();

                sampleCount++;

                // Stop if hi-hat is no longer active or max duration reached
                if (sampleCount > maxSamples || !hihat.isActive()) {
                    processor.disconnect();
                    masterGain.disconnect();
                    panner.disconnect();
                    cleanupVoiceInstance(voiceInstance);
                    return;
                }
            }
        }
    };

    // Create effects chain
    const masterGain = ctx.createGain();
    const level = voiceSettings.level / 100; // velocityMultiplier already applied in engine trigger()
    masterGain.gain.setValueAtTime(level, startTime);

    const panner = ctx.createStereoPanner();
    const panValue = (voiceSettings.pan - 50) / 50;
    panner.pan.setValueAtTime(panValue, startTime);

    // Connect processor to masterGain first
    processor.connect(masterGain);

    // Apply bit reduction and drive effects
    let currentNode = masterGain;
    let bitCrusherNode = null;
    let distortionNode = null;

    const bitReduction = parseFloat(voiceSettings.bitReduction);
    const drive = parseFloat(voiceSettings.drive);

    // Apply bit reduction
    if (bitReduction > 0) {
        bitCrusherNode = applyBitReduction(ctx, currentNode, bitReduction);
        if (bitCrusherNode !== currentNode) {
            currentNode = bitCrusherNode;
        }
    }

    // Apply drive
    if (drive > 0) {
        distortionNode = ctx.createWaveShaper();
        const amount = drive / 100;
        const k = amount * 200;
        const numSamples = ctx.sampleRate > 48000 ? 4096 : 2048;
        const curve = new Float32Array(numSamples);
        for (let i = 0; i < numSamples; ++i) {
            const x = (i * 2) / numSamples - 1;
            curve[i] = (Math.PI + k) * x / (Math.PI + k * Math.abs(x));
        }
        distortionNode.curve = curve;
        distortionNode.oversample = '4x';
        currentNode.connect(distortionNode);
        currentNode = distortionNode;
    }

    // Connect final node to panner
    currentNode.connect(panner);

    // Connect to master output (via Clouds crossfade routing)
    panner.connect(config.cloudsDirectGains[voiceIndex]);
    panner.connect(config.cloudsSendGains[voiceIndex]);

    // Connect to effects sends
    if (voiceSettings.reverbSend > 0 && config.reverbNode) {
        const reverbSend = ctx.createGain();
        reverbSend.gain.value = voiceSettings.reverbSend / 100;
        panner.connect(reverbSend);
        reverbSend.connect(config.reverbNode);
    }

    if (voiceSettings.delaySend > 0 && config.delayNode) {
        const delaySend = ctx.createGain();
        delaySend.gain.value = voiceSettings.delaySend / 100;
        panner.connect(delaySend);
        delaySend.connect(config.delayNode);
    }

    // Connect to voice analyzer
    if (config.voiceAnalysers && config.voiceAnalysers[voiceIndex]) {
        panner.connect(config.voiceAnalysers[voiceIndex]);
    }

    // Connect to sidechain tap for ducking
    connectVoiceToSidechain(panner, voiceIndex);

    // Store voice instance
    const voiceInstance = {
        voiceIndex,
        startTime,
        active: true,
        nodes: {
            processor,
            masterGain,
            panner,
            bitCrusher: bitCrusherNode,
            distortion: distortionNode
        },
        hihat // Store synthesizer instance
    };

    activeVoices.push(voiceInstance);

    return voiceInstance;
}

/**
 * Update the decay envelope of active voices in real-time
 * This allows modulation of decay parameters to affect currently playing voices
 * @param {number} voiceIndex - The voice index to update
 * @param {object} newDecayParams - Object containing new decay parameters: { layerADecay, layerBDecay }
 */
export function updateVoiceEnvelope(voiceIndex, newDecayParams) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;

    // Update state so NEW voices triggered after this will inherit the modulated decay values
    if (newDecayParams.layerADecay !== undefined && state.voices[voiceIndex]) {
        state.voices[voiceIndex].layerADecay = newDecayParams.layerADecay;
    }
    if (newDecayParams.layerBDecay !== undefined && state.voices[voiceIndex]) {
        state.voices[voiceIndex].layerBDecay = newDecayParams.layerBDecay;
    }

    // Find all active voices with matching voiceIndex and update their envelopes in real-time
    for (const voiceInstance of activeVoices) {
        if (voiceInstance.voiceIndex !== voiceIndex || !voiceInstance.active) continue;

        const { nodes, envelope, startTime } = voiceInstance;
        if (!nodes || !envelope) continue;

        // Calculate how far we are into the envelope
        const timeElapsed = now - startTime;

        // Only update if we're past or at the attack phase (otherwise let the attack finish naturally)
        const inCarrierDecay = timeElapsed >= envelope.attackTimeA;
        const inModulatorDecay = timeElapsed >= envelope.attackTimeB;

        // Update Layer A (Carrier) decay if new value provided and we're in decay phase
        if (newDecayParams.layerADecay !== undefined && inCarrierDecay && nodes.carrierGain) {
            const newDecayTimeA = (newDecayParams.layerADecay / 100) * 3.0;

            // Cancel existing envelope automation and reschedule
            nodes.carrierGain.gain.cancelScheduledValues(now);

            // Set current value and ramp to sustain with new decay time
            const currentGain = nodes.carrierGain.gain.value;
            nodes.carrierGain.gain.setValueAtTime(currentGain, now);
            nodes.carrierGain.gain.setTargetAtTime(envelope.sustainLevelA, now, newDecayTimeA / 4 + 0.001);

            // Update stored envelope data
            envelope.decayTimeA = newDecayTimeA;
        }

        // Update Layer B (Modulator) decay if new value provided and we're in decay phase
        if (newDecayParams.layerBDecay !== undefined && inModulatorDecay) {
            const newDecayTimeB = (newDecayParams.layerBDecay / 100) * 3.0;

            // Update modulator gain (FM modulation depth)
            if (nodes.modulatorGain) {
                nodes.modulatorGain.gain.cancelScheduledValues(now);
                const currentModGain = nodes.modulatorGain.gain.value;
                nodes.modulatorGain.gain.setValueAtTime(currentModGain, now);
                nodes.modulatorGain.gain.setTargetAtTime(envelope.modIndex * envelope.sustainLevelB, now, newDecayTimeB / 4 + 0.001);
            }

            // Update Layer B audio envelope (preMixGainB)
            if (nodes.preMixGainB) {
                nodes.preMixGainB.gain.cancelScheduledValues(now);
                const currentMixGain = nodes.preMixGainB.gain.value;
                nodes.preMixGainB.gain.setValueAtTime(currentMixGain, now);
                nodes.preMixGainB.gain.setTargetAtTime((envelope.layerMix / 100.0) * envelope.sustainLevelB, now, newDecayTimeB / 4 + 0.001);
            }

            // Update stored envelope data
            envelope.decayTimeB = newDecayTimeB;
        }
    }
}

/**
 * Update analog engine parameters in real-time for active voices
 * Called by per-parameter modulation system
 * @param {number} voiceIndex - Voice index to update
 * @param {object} voiceParams - Current voice parameters from state
 */
export function updateAnalogEngineParams(voiceIndex, voiceParams) {
    if (!config.audioContext) return;

    // Get engine type for this voice
    const voice = state.voices[voiceIndex];
    if (!voice) return;

    // For AudioWorklet voices, send parameter update message to each active voice's processor
    if (workletModulesLoaded) {
        for (const voiceInstance of activeVoices) {
            if (voiceInstance.voiceIndex !== voiceIndex || !voiceInstance.active) continue;
            if (!voiceInstance.audioWorklet) continue; // Skip ScriptProcessorNode voices

            // Send update to this specific voice's AudioWorklet processor
            const processor = voiceInstance.nodes?.processor;
            if (!processor) continue;

            if (voice.engine === 'aKICK') {
                const tone = voiceParams.analogKickTone !== undefined ? voiceParams.analogKickTone : 50;
                const pitch = voiceParams.macroPitch !== undefined ? voiceParams.macroPitch : 50;
                const decay = voiceParams.analogKickDecay !== undefined ? voiceParams.analogKickDecay : 60;
                const sweep = voiceParams.analogKickSweep !== undefined ? voiceParams.analogKickSweep : 70;

                processor.port.postMessage({
                    type: 'updateParameters',
                    tone,
                    pitch,
                    decay,
                    sweep
                });
            } else if (voice.engine === 'aSNARE') {
                const tone = voiceParams.macroPatch !== undefined ? voiceParams.macroPatch : 40;
                const pitch = voiceParams.macroPitch !== undefined ? voiceParams.macroPitch : 50;
                const decay = voiceParams.macroDepth !== undefined ? voiceParams.macroDepth : 50;
                const snap = voiceParams.macroRate !== undefined ? voiceParams.macroRate : 60;

                processor.port.postMessage({
                    type: 'updateParameters',
                    tone,
                    pitch,
                    decay,
                    snap
                });
            } else if (voice.engine === 'aHIHAT') {
                const tone = voiceParams.macroPatch !== undefined ? voiceParams.macroPatch : 60;
                const pitch = voiceParams.macroPitch !== undefined ? voiceParams.macroPitch : 50;
                const decay = voiceParams.macroDepth !== undefined ? voiceParams.macroDepth : 30;
                const noisiness = voiceParams.macroRate !== undefined ? voiceParams.macroRate : 20;

                processor.port.postMessage({
                    type: 'updateParameters',
                    tone,
                    pitch,
                    decay,
                    noisiness
                });
            } else if (voice.engine === 'SAMPLE' || voice.engine === 'SLICE') {
                // Map decay parameter (0-100 → 0-0.99 for engine)
                const decayRaw = voiceParams.samplerDecay !== undefined ? voiceParams.samplerDecay : 100;
                const decay = (decayRaw / 100) * 0.99;

                // Map filter parameter: LPF (0-49), Bypass (50), HPF (51-100)
                const filter = voiceParams.samplerFilter !== undefined ? voiceParams.samplerFilter : 50;
                let filterCutoff, filterMode, useFilter;
                if (filter < 50) {
                    // Lowpass mode: 4kHz down to 200Hz (exponential)
                    filterMode = 'lp';
                    const lpNorm = (50 - filter) / 50; // 0 at 50, 1 at 0
                    filterCutoff = 4000 * Math.pow(0.05, lpNorm); // 4kHz → 200Hz
                    useFilter = true;
                } else if (filter > 50) {
                    // Highpass mode: 200Hz up to 4kHz (exponential)
                    filterMode = 'hp';
                    const hpNorm = (filter - 50) / 50; // 0 at 50, 1 at 100
                    filterCutoff = 200 * Math.pow(20, hpNorm); // 200Hz → 4kHz
                    useFilter = true;
                } else {
                    // Bypass mode at exactly 50
                    filterMode = 'none';
                    filterCutoff = 1000;
                    useFilter = false;
                }

                processor.port.postMessage({
                    type: 'updateParameters',
                    decay,
                    filterCutoff,
                    filterMode,
                    useFilter
                });
            }
        }
    }

    // For ScriptProcessorNode voices (fallback), find and update active voice instances
    for (const voiceInstance of activeVoices) {
        if (voiceInstance.voiceIndex !== voiceIndex || !voiceInstance.active) continue;
        if (voiceInstance.audioWorklet) continue; // Skip AudioWorklet voices (handled above)

        // Check engine type and update accordingly
        if (voiceInstance.kick) {
            // Analog Kick - update tone, pitch, decay, sweep
            const tone = voiceParams.analogKickTone !== undefined ? voiceParams.analogKickTone : 50;
            const pitch = voiceParams.macroPitch !== undefined ? voiceParams.macroPitch : 50;
            const decay = voiceParams.analogKickDecay !== undefined ? voiceParams.analogKickDecay : 60;
            const sweep = voiceParams.analogKickSweep !== undefined ? voiceParams.analogKickSweep : 70;
            voiceInstance.kick.updateParameters(tone, pitch, decay, sweep);
        } else if (voiceInstance.snare) {
            // Analog Snare - update tone, pitch, decay, snap
            const tone = voiceParams.macroPatch !== undefined ? voiceParams.macroPatch : 40;
            const pitch = voiceParams.macroPitch !== undefined ? voiceParams.macroPitch : 50;
            const decay = voiceParams.macroDepth !== undefined ? voiceParams.macroDepth : 50;
            const snap = voiceParams.macroRate !== undefined ? voiceParams.macroRate : 60;
            voiceInstance.snare.updateParameters(tone, pitch, decay, snap);
        } else if (voiceInstance.hihat) {
            // Analog Hi-Hat - update tone, pitch, decay, noisiness
            const tone = voiceParams.macroPatch !== undefined ? voiceParams.macroPatch : 60;
            const pitch = voiceParams.macroPitch !== undefined ? voiceParams.macroPitch : 50;
            const decay = voiceParams.macroDepth !== undefined ? voiceParams.macroDepth : 30;
            const noisiness = voiceParams.macroRate !== undefined ? voiceParams.macroRate : 20;
            voiceInstance.hihat.updateParameters(tone, pitch, decay, noisiness);
        }
    }
}

/**
 * Update DX7 voice pitch via transpose (for PPMod real-time modulation)
 * Uses dx7LegatoState to send setTranspose messages to active DX7 voices
 * @param {number} voiceIndex - Voice index (0-5)
 * @param {number} semitones - Transpose in semitones (-24 to +24)
 */
export function updateDX7Transpose(voiceIndex, semitones) {
    const legatoVoice = dx7LegatoState[voiceIndex];
    if (!legatoVoice?.node) return;

    // Send setTranspose message to the active DX7 processor
    legatoVoice.node.port.postMessage({
        type: 'setTranspose',
        semitones: semitones
    });
}

/**
 * Update DX7 voice level in real-time (for knob changes during playback)
 * @param {number} voiceIndex - Voice index (0-5)
 * @param {number} level - Level value (0-100)
 */
export function updateDX7Level(voiceIndex, level) {
    const gain = levelToGain(level) * DX7_OUTPUT_ATTENUATION;

    // Update all active DX7 voices for this voice index
    activeVoices.forEach(voice => {
        if (voice.voiceIndex === voiceIndex &&
            voice.engine === 'DX7' &&
            voice.active &&
            voice.nodes?.dx7Output) {
            voice.nodes.dx7Output.gain.setTargetAtTime(
                gain,
                config.audioContext.currentTime,
                0.01  // 10ms smoothing to prevent clicks
            );
        }
    });
}

// Release a voice (stop playing with a short fade out)
export function releaseVoice(voiceIndexToRelease, releaseTime = 0.05) {
    if (!config.audioContext || !config.initialized) return;
    const now = config.audioContext.currentTime;

    for (let i = activeVoices.length - 1; i >= 0; i--) {
        const voiceInstance = activeVoices[i];
        if (voiceInstance.voiceIndex === voiceIndexToRelease && voiceInstance.active) {
            voiceInstance.active = false; // Mark as inactive immediately

            // AudioWorklet voices - trigger fadeout and schedule cleanup
            if (voiceInstance.audioWorklet) {
                // Send 'stop' message to trigger emergency fadeout in processor
                // Processor will fade out and disconnect itself by returning false
                if (voiceInstance.workletNode && voiceInstance.workletNode.port) {
                    voiceInstance.workletNode.port.postMessage({ type: 'stop' });
                }

                // Calculate fadeout duration: varies by engine
                // Sampler/DX7: 15-20ms time constant = ~100ms total fade
                // Analog drums: instant cutoff (0ms)
                const fadeoutDuration = 0.100; // 100ms for 99.3% fade completion (sampler/DX7)
                const cleanupDelay = (fadeoutDuration + 0.010) * 1000; // Add 10ms safety margin (reduced from 25ms)

                // Schedule cleanup after fadeout completes
                setTimeout(() => {
                    if (voiceInstance.workletNode) {
                        // Clear message handler to prevent memory leaks
                        voiceInstance.workletNode.port.onmessage = null;
                        // Disconnect node (may already be disconnected by processor returning false)
                        try {
                            voiceInstance.workletNode.disconnect();
                        } catch (e) {
                            // Already disconnected, ignore
                        }
                    }

                    // Disconnect all audio nodes in the chain
                    if (voiceInstance.nodes) {
                        try {
                            if (voiceInstance.nodes.dx7Output) voiceInstance.nodes.dx7Output.disconnect();
                            if (voiceInstance.nodes.panner) voiceInstance.nodes.panner.disconnect();
                            if (voiceInstance.nodes.bitCrusher) voiceInstance.nodes.bitCrusher.disconnect();
                            if (voiceInstance.nodes.distortion) voiceInstance.nodes.distortion.disconnect();
                        } catch (e) {
                            // Already disconnected, ignore
                        }
                    }

                    // Remove from activeVoices
                    cleanupVoiceInstance(voiceInstance);
                }, cleanupDelay);

                continue;
            }

            // ScriptProcessorNode voices - fade out the main output gain
            if (voiceInstance.nodes && voiceInstance.nodes.postMixGain) {
                voiceInstance.nodes.postMixGain.gain.cancelScheduledValues(now);
                voiceInstance.nodes.postMixGain.gain.setTargetAtTime(0, now, releaseTime); // Exponential fade with proper time constant
            }
            // Also fade carrier and modulator gains if they exist (might be redundant but safe)
            if (voiceInstance.nodes && voiceInstance.nodes.carrierGain) {
                 voiceInstance.nodes.carrierGain.gain.cancelScheduledValues(now);
                 voiceInstance.nodes.carrierGain.gain.setTargetAtTime(0, now, releaseTime);
            }
            if (voiceInstance.nodes && voiceInstance.nodes.modulatorGain) {
                 voiceInstance.nodes.modulatorGain.gain.cancelScheduledValues(now);
                 voiceInstance.nodes.modulatorGain.gain.setTargetAtTime(0, now, releaseTime);
            }

            const cleanupDelay = (releaseTime + 0.1) * 1000; // JS timeout after audio fade
            setTimeout(() => cleanupVoice(voiceInstance), cleanupDelay);
        }
    }
}

/**
 * Steal the oldest voice for a given track (oldest-note-first algorithm)
 * Used for polyphonic voice management when max polyphony limit is reached
 * @param {number} voiceIndex - Track index to steal from (0-5)
 */
function stealOldestVoice(voiceIndex) {
    // Find all active voices for this track, sorted by start time
    const voicesForTrack = activeVoices
        .filter(v => v.voiceIndex === voiceIndex && v.active)
        .sort((a, b) => a.startTime - b.startTime);

    if (voicesForTrack.length === 0) {
        console.warn(`[stealOldestVoice] No active voices found for track ${voiceIndex}`);
        return;
    }

    // Steal the oldest voice (first in sorted array)
    const voiceToSteal = voicesForTrack[0];
    const stealTime = config.audioContext.currentTime;

    // Mark as inactive immediately to prevent double-stealing
    voiceToSteal.active = false;

    // Trigger note-off if available (for DX7 envelope release)
    if (voiceToSteal.noteOff && typeof voiceToSteal.noteOff === 'function') {
        try {
            voiceToSteal.noteOff();
        } catch (e) {
            console.warn('[stealOldestVoice] Error calling noteOff:', e);
        }
    }

    // Schedule gain ramp down for click-free stealing (5ms fade)
    if (voiceToSteal.nodes && voiceToSteal.nodes.gain) {
        try {
            const gain = voiceToSteal.nodes.gain;
            gain.gain.cancelScheduledValues(stealTime);
            gain.gain.setValueAtTime(gain.gain.value, stealTime);
            gain.gain.linearRampToValueAtTime(0, stealTime + 0.005); // 5ms fade
        } catch (e) {
            console.warn('[stealOldestVoice] Error ramping gain:', e);
        }
    }

    // Disconnect all nodes after fade completes
    setTimeout(() => {
        cleanupVoiceInstance(voiceToSteal);
    }, 10); // 10ms delay for 5ms fade + margin
}

/**
 * Apply cut group fade to previous voice (Strudel pattern)
 * Previous slice continues playing whilst fading to silence over 10ms
 * This allows slices to play their full duration without clicks
 * @param {number} voiceIndex - Voice/track index (0-5)
 * @param {Object} previousVoice - Previous voice instance to fade
 */
function applyCutGroupFade(voiceIndex, previousVoice) {
    if (!config.audioContext || !config.initialized) return;
    if (!previousVoice || !previousVoice.active) return;

    const now = config.audioContext.currentTime;
    const fadeTime = 0.01; // 10ms linear fade (Strudel default)

    // Get the master gain node from the voice instance
    const gainNode = previousVoice.nodes?.masterGain;

    // Check if this voice has a gain node we can fade
    if (gainNode) {
        // Cancel any scheduled changes
        gainNode.gain.cancelScheduledValues(now);

        // Set current value and schedule linear ramp to zero
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + fadeTime);

        // Don't mark voice as inactive yet - let it fade whilst playing
        // Schedule cleanup after fade completes (plus margin for safety)
        setTimeout(() => {
            cleanupVoiceInstance(previousVoice);
        }, (fadeTime + 0.005) * 1000); // 15ms total (10ms fade + 5ms margin)
    } else {
        // Fallback: no gain node, use standard voice release
        // This shouldn't happen for slice/sample engines, but safety first
        console.warn('[applyCutGroupFade] No master gain node found, using standard release');
        releaseSpecificVoice(previousVoice, fadeTime);
    }

    // Store in cut groups map (for future reference if needed)
    cutGroups.set(voiceIndex, {
        voice: previousVoice,
        gainNode: gainNode,
        fadeScheduled: now + fadeTime
    });
}

/**
 * Release a specific voice instance (used for monophonic ratchet behavior)
 * Unlike releaseVoice(), this releases ONLY the provided instance, not all voices matching a voiceIndex
 * This prevents the race condition where newly created ratchet substeps get cut off
 * @param {Object} voiceInstance - The specific voice instance to release
 * @param {number} releaseTime - Fade out time in seconds (default 0.001 for instant cutoff)
 */
export function releaseSpecificVoice(voiceInstance, releaseTime = 0.001) {
    if (!config.audioContext || !config.initialized) return;
    if (!voiceInstance || !voiceInstance.active) return;

    const now = config.audioContext.currentTime;

    // Mark as inactive immediately
    voiceInstance.active = false;

    // AudioWorklet voices - trigger fadeout and schedule cleanup
    if (voiceInstance.audioWorklet) {
        // Send 'stop' message to trigger emergency fadeout in processor
        // Processor will fade out and disconnect itself by returning false
        // NOTE: workletNode can be at voiceInstance.workletNode OR voiceInstance.nodes.processor
        const workletNode = voiceInstance.workletNode || voiceInstance.nodes?.processor;
        if (workletNode && workletNode.port) {
            workletNode.port.postMessage({ type: 'stop' });
        }

        // FIX: Apply exponential gain fadeout on masterGain to prevent click
        // The click was caused by instantaneous gain discontinuity on disconnect
        const fadeoutMs = Math.max(releaseTime * 1000, 50); // At least 50ms fadeout
        if (voiceInstance.nodes && voiceInstance.nodes.masterGain) {
            try {
                voiceInstance.nodes.masterGain.gain.cancelScheduledValues(now);
                voiceInstance.nodes.masterGain.gain.setValueAtTime(
                    voiceInstance.nodes.masterGain.gain.value, now
                );
                voiceInstance.nodes.masterGain.gain.exponentialRampToValueAtTime(
                    0.0001, now + fadeoutMs / 1000
                );
            } catch (e) {
                // Gain node may already be disconnected, ignore
            }
        }

        // Calculate cleanup delay: fadeout + safety margin
        const cleanupDelay = fadeoutMs + 10; // +10ms safety margin

        // Schedule cleanup after fadeout completes
        setTimeout(() => {
            // Get worklet node from either location
            const workletNode = voiceInstance.workletNode || voiceInstance.nodes?.processor;
            if (workletNode) {
                // Clear message handler to prevent memory leaks
                if (workletNode.port) workletNode.port.onmessage = null;
                // Disconnect node (may already be disconnected by processor returning false)
                try {
                    workletNode.disconnect();
                } catch (e) {
                    // Already disconnected, ignore
                }
            }

            // Disconnect all audio nodes in the chain
            if (voiceInstance.nodes) {
                try {
                    if (voiceInstance.nodes.processor) voiceInstance.nodes.processor.disconnect();
                    if (voiceInstance.nodes.masterGain) voiceInstance.nodes.masterGain.disconnect();
                    if (voiceInstance.nodes.dx7Output) voiceInstance.nodes.dx7Output.disconnect();
                    if (voiceInstance.nodes.panner) voiceInstance.nodes.panner.disconnect();
                    if (voiceInstance.nodes.bitCrusher) voiceInstance.nodes.bitCrusher.disconnect();
                    if (voiceInstance.nodes.distortion) voiceInstance.nodes.distortion.disconnect();
                } catch (e) {
                    // Already disconnected, ignore
                }
            }

            // Remove from activeVoices
            cleanupVoiceInstance(voiceInstance);
        }, cleanupDelay);

        return;
    }

    // ScriptProcessorNode voices - fade out the main output gain
    if (voiceInstance.nodes && voiceInstance.nodes.postMixGain) {
        voiceInstance.nodes.postMixGain.gain.cancelScheduledValues(now);
        voiceInstance.nodes.postMixGain.gain.setTargetAtTime(0, now, releaseTime);
    }
    // Also fade carrier and modulator gains if they exist
    if (voiceInstance.nodes && voiceInstance.nodes.carrierGain) {
        voiceInstance.nodes.carrierGain.gain.cancelScheduledValues(now);
        voiceInstance.nodes.carrierGain.gain.setTargetAtTime(0, now, releaseTime);
    }
    if (voiceInstance.nodes && voiceInstance.nodes.modulatorGain) {
        voiceInstance.nodes.modulatorGain.gain.cancelScheduledValues(now);
        voiceInstance.nodes.modulatorGain.gain.setTargetAtTime(0, now, releaseTime);
    }

    const cleanupDelay = (releaseTime + 0.1) * 1000; // JS timeout after audio fade
    setTimeout(() => cleanupVoice(voiceInstance), cleanupDelay);
}

export function releaseAllVoices() {
    if (!config.audioContext || !config.initialized) return;
    // Iterate over a copy because releaseVoice can modify activeVoices
    [...activeVoices].forEach(voiceInstance => {
        if (voiceInstance.active) {
            releaseVoice(voiceInstance.voiceIndex);
        }
    });

    // Clear all DX7 legato states
    for (let i = 0; i < 6; i++) {
        dx7LegatoState[i] = null;
    }
}

/**
 * Release all voices for a specific track (voice index)
 * Used when switching from poly to mono mode - immediately clears all poly voices
 * @param {number} voiceIndex - Track index (0-5)
 */
export function releaseAllVoicesForTrack(voiceIndex) {
    if (!config.audioContext || !config.initialized) return;

    // Find and release all active voices for this track
    activeVoices
        .filter(v => v.voiceIndex === voiceIndex && v.active)
        .forEach(v => {
            if (v.workletNode) {
                // Send stop message to AudioWorklet (triggers fadeout)
                v.workletNode.port.postMessage({ type: 'stop' });
            }
            v.active = false;
        });

    // Clear the last triggered voice tracking for this track
    lastTriggeredVoice[voiceIndex] = null;

    // Clear DX7 legato state for this track
    dx7LegatoState[voiceIndex] = null;
}

function cleanupVoice(voiceInstance) {
    if (!voiceInstance) return;

    // Ensure it's marked inactive
    voiceInstance.active = false;

    try {
        // Stop oscillators first if they haven't been auto-stopped
        if (voiceInstance.nodes.carrierOsc && typeof voiceInstance.nodes.carrierOsc.stop === 'function') {
            try { voiceInstance.nodes.carrierOsc.stop(config.audioContext.currentTime + 0.01); } catch (e) {/* already stopped */}
        }
        if (voiceInstance.nodes.modulatorOsc && typeof voiceInstance.nodes.modulatorOsc.stop === 'function') {
            try { voiceInstance.nodes.modulatorOsc.stop(config.audioContext.currentTime + 0.01); } catch (e) {/* already stopped */}
        }

        // Disconnect all nodes stored in voiceInstance.nodes
        for (const nodeKey in voiceInstance.nodes) {
            const node = voiceInstance.nodes[nodeKey];
            if (node && typeof node.disconnect === 'function') {
                node.disconnect();
            }
        }
        voiceInstance.nodes = {}; // Clear nodes
    } catch (e) {
        // Error during cleanup - silently continue
    }

    const index = activeVoices.indexOf(voiceInstance);
    if (index !== -1) {
        activeVoices.splice(index, 1);
    }
}

function createOscillator(ctx, waveformType) {
    waveformType = parseInt(waveformType); // Ensure it's a number
    if (waveformType === 4 || config.WAVEFORM_TYPES[waveformType] === 'Noise') { // Noise
        return createNoiseGenerator(ctx);
    }

    const osc = ctx.createOscillator();
    switch (waveformType) {
        case 0: osc.type = 'sine'; break;
        case 1: osc.type = 'triangle'; break;
        case 2: osc.type = 'sawtooth'; break;
        case 3: osc.type = 'square'; break;
        default: osc.type = 'sine';
    }
    return osc;
}

function createNoiseGenerator(ctx) {
    const bufferSize = ctx.sampleRate * 2; // 2 seconds of noise
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1; // White noise
    }

    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;
    
    // Mimic OscillatorNode interface for frequency for compatibility, though it does nothing for noise.
    whiteNoise.frequency = {
        value: 0, // Not applicable
        setValueAtTime: () => {},
        linearRampToValueAtTime: () => {},
        setTargetAtTime: () => {},
        cancelScheduledValues: () => {},
        connect: () => { // This is the critical part for the FM connection check
            return null; // Indicate that direct connection to 'frequency' is not possible
        }
    };
    whiteNoise.isNoiseGenerator = true; // Custom flag
    return whiteNoise;
}


function scalePitchParam(pitchValue) { // 0-100 input
    const minFreq = 20;
    const maxFreq = 12000; // Adjusted max for more musical drum synth range
    // Exponential scaling:
    // norm = pitchValue / 100
    // freq = minFreq * (maxFreq/minFreq)^norm
    if (pitchValue <= 0) return minFreq;
    if (pitchValue >= 100) return maxFreq;

    const normValue = pitchValue / 100;
    // A common formula for exponential frequency mapping:
    // return minFreq * Math.pow(2, normValue * Math.log2(maxFreq / minFreq));
    // Or simpler power curve:
    const exponent = 3.5; // Higher exponent gives more resolution at lower end
    return minFreq + Math.pow(normValue, exponent) * (maxFreq - minFreq);
}

export function initEngine() {
    if (config.initialized) return;

    if (!config.audioContext) {
        try {
            config.audioContext = sharedAudioContext;

            // Set up DX7 config with the actual sample rate
            setSampleRate(config.audioContext);

            config.masterGain = config.audioContext.createGain();
            // Initial headroom - drum bus will handle final output level
            config.masterGain.gain.value = 0.5656; // -4.94dB headroom for merged app

            // Create dry signal analyser for delay visualization
            config.drySignalAnalyser = config.audioContext.createAnalyser();
            config.drySignalAnalyser.fftSize = 512;
            config.drySignalAnalyser.smoothingTimeConstant = 0;
            // Connect master gain through analyser (passive tap - doesn't affect audio)
            config.masterGain.connect(config.drySignalAnalyser);

            // Create per-voice analysers for engine visualization
            config.voiceAnalysers = [];
            for (let i = 0; i < config.MAX_VOICES; i++) {
                const analyser = config.audioContext.createAnalyser();
                analyser.fftSize = 512;
                analyser.smoothingTimeConstant = 0.3; // Smoother for visualization
                config.voiceAnalysers.push(analyser);
            }

            config.limiter = config.audioContext.createDynamicsCompressor();
            config.limiter.threshold.value = -1.0;
            config.limiter.knee.value = 0.0;
            config.limiter.ratio.value = 20.0;
            config.limiter.attack.value = 0.001;
            config.limiter.release.value = 0.1;

            // Initialise sidechain bus (before effects so ducking gains are ready)
            initSidechainBus(config.audioContext);

            // Create analyser for drum bus output metering + waveform visualisation
            config.busOutputAnalyser = config.audioContext.createAnalyser();
            config.busOutputAnalyser.fftSize = 2048;
            config.busOutputAnalyser.smoothingTimeConstant = 0.3;

            // Temporary direct route until worklet loads: masterGain → analyser → limiter
            config.masterGain.connect(config.busOutputAnalyser);
            config.busOutputAnalyser.connect(config.limiter);
            connectToFinalLimiter(config.limiter); // Connect to shared final limiter instead of destination

            initEffects(); // Initialize global effects chain

            // Initialize AudioWorklet processors (async, but tracked)
            initializeAudioWorklets(config.audioContext).then(() => {
                // AudioWorklet modules loaded successfully - now create drum bus and clouds
                createDrumBusNode();
                initCloudsProcessor();
            }).catch(err => {
                console.warn('AudioWorklet initialization failed, drum bus/clouds unavailable:', err);
            });

            config.initialized = true;

        } catch (e) {
            alert("Failed to initialize audio. Your browser might not support the Web Audio API or it's disabled.");
            return;
        }
    } else {
        // If context exists but not fully initialized (e.g. effects missing)
        if (!config.reverbNode) initEffects(); // Check one effect node
    }
}

/**
 * Initialize AudioWorklet processors (replaces ScriptProcessorNode)
 * Runs asynchronously - falls back to ScriptProcessorNode if it fails
 */
async function initializeAudioWorklets(audioContext) {
    if (!supportsAudioWorklet(audioContext)) {
        console.warn('AudioWorklet not supported, using ScriptProcessorNode fallback');
        return;
    }

    if (workletModulesLoaded) {
        return; // Already loaded
    }

    try {
        // Load AudioWorklet modules for all engines
        // Note: We load modules once, then create per-voice AudioWorkletNodes on demand
        // Cache-busting: Add timestamp to force reload during development
        const cacheBust = `?v=${Date.now()}`;

        await audioContext.audioWorklet.addModule(`js/baeng/processors/analog-kick-processor.js${cacheBust}`);

        await audioContext.audioWorklet.addModule(`js/baeng/processors/synthetic-kick-processor.js${cacheBust}`);

        await audioContext.audioWorklet.addModule(`js/baeng/processors/analog-snare-processor.js${cacheBust}`);

        await audioContext.audioWorklet.addModule(`js/baeng/processors/synthetic-snare-processor.js${cacheBust}`);

        await audioContext.audioWorklet.addModule(`js/baeng/processors/analog-hihat-processor.js${cacheBust}`);

        await audioContext.audioWorklet.addModule(`js/baeng/processors/ringmod-hihat-processor.js${cacheBust}`);

        await audioContext.audioWorklet.addModule(`js/baeng/processors/sampler-processor.js${cacheBust}`);

        await audioContext.audioWorklet.addModule(`js/baeng/processors/dx7-processor.js${cacheBust}`);

        // Load Drum Bus processor for master bus processing
        await audioContext.audioWorklet.addModule(`js/audio/worklets/drum-bus-processor.js${cacheBust}`);

        // Load Clouds processor for granular FX
        await audioContext.audioWorklet.addModule(`js/audio/worklets/clouds-processor.js${cacheBust}`);

        workletModulesLoaded = true;

    } catch (error) {
        console.error('Failed to load AudioWorklet modules:', error);
        workletModulesLoaded = false;
        throw error; // Propagate to caller for fallback handling
    }
}

function initEffects() {
    if (!config.audioContext) return;
    const ctx = config.audioContext;

    // --- Reverb with Dual-Convolver Crossfading ---
    const reverbInputGain = ctx.createGain(); // Entry point from voices
    const reverbWetGain = ctx.createGain();
    const reverbOutputGain = ctx.createGain();

    // Create dual convolver system for smooth parameter changes
    config.reverbConvolver1 = ctx.createConvolver();
    config.reverbConvolver2 = ctx.createConvolver();
    config.reverbGain1 = ctx.createGain();
    config.reverbGain2 = ctx.createGain();
    config.reverbGain1.gain.value = 1.0; // Active
    config.reverbGain2.gain.value = 0.0; // Inactive
    config.activeReverbConvolver = 1; // Track which convolver is active (1 or 2)

    // Connect both convolvers through their gain nodes
    reverbInputGain.connect(config.reverbConvolver1);
    reverbInputGain.connect(config.reverbConvolver2);
    config.reverbConvolver1.connect(config.reverbGain1);
    config.reverbConvolver2.connect(config.reverbGain2);
    config.reverbGain1.connect(reverbWetGain);
    config.reverbGain2.connect(reverbWetGain);

    // Create reverb analyser tap for visualization
    config.reverbTap = ctx.createGain();
    config.reverbTap.gain.value = 1.0;
    config.reverbAnalyser = ctx.createAnalyser();
    config.reverbAnalyser.fftSize = 512;
    config.reverbAnalyser.smoothingTimeConstant = 0;

    // Connect reverb output through analyser tap to master
    reverbWetGain.connect(config.reverbTap);
    config.reverbTap.connect(config.reverbAnalyser);
    config.reverbTap.connect(reverbOutputGain);
    // Insert ducking gain between reverb output and master
    reverbOutputGain.connect(config.duckingGains.baengReverb);
    config.duckingGains.baengReverb.connect(config.masterGain);

    config.reverbNode = reverbInputGain; // Voices send to this
    config.reverbWetGain = reverbWetGain; // Controlled by state.reverbMix
    config.reverbOutputGain = reverbOutputGain;

    // Function to update reverb impulse with crossfading
    config.updateReverbImpulse = function() {
        // If already crossfading, queue this update for later
        if (isReverbCrossfading) {
            pendingReverbUpdate = true;
            return;
        }

        // Mark that we're crossfading
        isReverbCrossfading = true;
        pendingReverbUpdate = false;

        // Generate new impulse synchronously (simpler, more reliable)
        const newImpulse = createReverbImpulse(
            state.reverbDecay,
            state.reverbDiffusion,
            state.reverbPreDelay,
            state.reverbDamping
        );

        if (!newImpulse) {
            isReverbCrossfading = false;
            return;
        }

        // Crossfade to inactive convolver
        const inactiveConvolver = config.activeReverbConvolver === 1 ? 2 : 1;
        const inactiveGain = config.activeReverbConvolver === 1 ? config.reverbGain2 : config.reverbGain1;
        const activeGain = config.activeReverbConvolver === 1 ? config.reverbGain1 : config.reverbGain2;

        // Load new impulse into inactive convolver
        if (inactiveConvolver === 1) {
            config.reverbConvolver1.buffer = newImpulse;
        } else {
            config.reverbConvolver2.buffer = newImpulse;
        }

        // Longer crossfade with simple linear ramps for reliability
        const now = ctx.currentTime;
        const fadeDuration = 0.25; // 250ms - much longer to mask any brief hiccups

        // Simple linear crossfade - most reliable across browsers
        // Active convolver fades out
        activeGain.gain.cancelScheduledValues(now);
        activeGain.gain.setValueAtTime(activeGain.gain.value, now);
        activeGain.gain.linearRampToValueAtTime(0.0, now + fadeDuration);

        // Inactive convolver fades in
        inactiveGain.gain.cancelScheduledValues(now);
        inactiveGain.gain.setValueAtTime(inactiveGain.gain.value, now);
        inactiveGain.gain.linearRampToValueAtTime(1.0, now + fadeDuration);

        // Swap active convolver
        config.activeReverbConvolver = inactiveConvolver;

        // After crossfade completes, check for pending updates
        setTimeout(() => {
            isReverbCrossfading = false;

            // If there was a pending update request, execute it now
            if (pendingReverbUpdate) {
                config.updateReverbImpulse();
            }
        }, fadeDuration * 1000 + 10); // Add 10ms buffer
    };

    // Initialize with initial parameters
    const initialImpulse = createReverbImpulse(
        state.reverbDecay,
        state.reverbDiffusion,
        state.reverbPreDelay,
        state.reverbDamping
    );
    if (initialImpulse) {
        config.reverbConvolver1.buffer = initialImpulse;
    }


    // --- Delay with Tap System for Visualization ---
    // Create main delay line (no feedback - using tap system instead)
    config.delayProcessor = ctx.createDelay(5.0); // Max 5s delay
    config.delayProcessor.delayTime.value = state.delayTime / 100 * 2.0; // 0-2s

    // Create wow LFO (slow pitch modulation)
    config.delayWowLFO = ctx.createOscillator();
    config.delayWowGain = ctx.createGain();
    config.delayWowLFO.type = 'sine';
    config.delayWowLFO.frequency.value = 0.3; // 0.1-0.5 Hz range
    config.delayWowGain.gain.value = 0; // Modulation depth in seconds
    config.delayWowLFO.connect(config.delayWowGain);
    config.delayWowGain.connect(config.delayProcessor.delayTime);
    config.delayWowLFO.start();

    // Create flutter LFO (fast pitch modulation)
    config.delayFlutterLFO = ctx.createOscillator();
    config.delayFlutterGain = ctx.createGain();
    config.delayFlutterLFO.type = 'sine';
    config.delayFlutterLFO.frequency.value = 6; // 4-8 Hz range
    config.delayFlutterGain.gain.value = 0; // Modulation depth in seconds
    config.delayFlutterLFO.connect(config.delayFlutterGain);
    config.delayFlutterGain.connect(config.delayProcessor.delayTime);
    config.delayFlutterLFO.start();

    // Dual saturation WaveShapers for crossfading (tape emulation)
    config.delaySaturation1 = ctx.createWaveShaper();
    config.delaySaturation1.curve = makeSaturationCurve(0); // Initial: no saturation
    config.delaySaturation1.oversample = '4x';

    config.delaySaturation2 = ctx.createWaveShaper();
    config.delaySaturation2.curve = makeSaturationCurve(0); // Initial: no saturation
    config.delaySaturation2.oversample = '4x';

    // Gain nodes for crossfading between saturation curves
    config.delaySaturationGain1 = ctx.createGain();
    config.delaySaturationGain1.gain.value = 1.0; // Start with saturation1 active

    config.delaySaturationGain2 = ctx.createGain();
    config.delaySaturationGain2.gain.value = 0.0; // Start with saturation2 inactive

    // Track which saturation is active (1 or 2)
    config.activeSaturation = 1;

    // Saturation compensation gain (after crossfade mix)
    config.delaySaturationComp = ctx.createGain();
    config.delaySaturationComp.gain.value = 1.0;

    config.delayFilter = ctx.createBiquadFilter(); // For tape-like echo damping
    config.delayFilter.type = 'lowpass';
    config.delayFilter.frequency.value = 3000;
    config.delayFilter.Q.value = 0.7;

    const delayInputGain = ctx.createGain(); // This is `config.delayNode`
    const delayWetGain = ctx.createGain();   // Controlled by state.delayMix
    const delayOutputGain = ctx.createGain(); // Final output for delay to connect to master

    // Main path: input -> delay -> saturation -> filter
    delayInputGain.connect(config.delayProcessor);

    // Split to both saturations for crossfading
    config.delayProcessor.connect(config.delaySaturation1);
    config.delayProcessor.connect(config.delaySaturation2);

    // Each saturation goes through its gain node
    config.delaySaturation1.connect(config.delaySaturationGain1);
    config.delaySaturation2.connect(config.delaySaturationGain2);

    // Both gain nodes sum into compensation gain
    config.delaySaturationGain1.connect(config.delaySaturationComp);
    config.delaySaturationGain2.connect(config.delaySaturationComp);

    // Continue to filter
    config.delaySaturationComp.connect(config.delayFilter);

    // Create tap system for visualization
    // Each tap is connected in parallel from the filter output to capture each delay repeat
    config.delayTaps = [];
    config.delayTapAnalysers = [];
    config.delayTapGains = [];

    // Feedback gain node (connects back to create the delay repeats)
    config.delayFeedbackGain = ctx.createGain();
    config.delayFeedbackGain.gain.value = state.delayFeedback / 100 * 0.85;

    // Create parallel taps from filter output (for visualization only)
    // These taps don't affect the audio - they just visualize it
    for (let i = 0; i < config.maxDelayTaps; i++) {
        const tap = ctx.createDelay(5.0);
        const tapGain = ctx.createGain();
        const tapAnalyser = ctx.createAnalyser();

        // Configure analyser for oscilloscope visualization
        tapAnalyser.fftSize = 256; // Smaller for performance
        tapAnalyser.smoothingTimeConstant = 0;

        // Calculate tap delay time (cumulative: tap[0]=0ms for 1st repeat, tap[1]=1×delay for 2nd repeat, etc.)
        const tapDelayTime = (state.delayTime / 100 * 2.0) * i;
        tap.delayTime.value = Math.min(tapDelayTime, 5.0); // Clamp to max

        // Set tap gain to 1.0 (not affecting audio, just for visualization)
        tapGain.gain.value = 1.0;

        // Connect: filter -> tap -> tapGain -> analyser (visualization only, no audio output)
        config.delayFilter.connect(tap);
        tap.connect(tapGain);
        tapGain.connect(tapAnalyser); // For visualization only

        config.delayTaps.push(tap);
        config.delayTapGains.push(tapGain);
        config.delayTapAnalysers.push(tapAnalyser);
    }

    // Main delay output: filter -> wet gain -> output
    config.delayFilter.connect(delayWetGain);

    // Feedback path: filter -> feedback gain -> input (creates the repeats)
    config.delayFilter.connect(config.delayFeedbackGain);
    config.delayFeedbackGain.connect(delayInputGain);

    delayWetGain.connect(delayOutputGain);
    // Insert ducking gain between delay output and master
    delayOutputGain.connect(config.duckingGains.baengDelay);
    config.duckingGains.baengDelay.connect(config.masterGain);

    config.delayNode = delayInputGain; // Voices send to this
    config.delayWetGain = delayWetGain; // Controlled by state.delayMix
    config.delayOutputGain = delayOutputGain;


    // --- Global Waveguide Resonator ---
    // This is a send effect. `state.waveguideType` enables/disables it.
    const waveguideInputGain = ctx.createGain(); // This is `config.waveguideNode`
    config.waveguideProcessor = createGlobalWaveguideResonator(
        ctx, state.waveguideType, state.waveguideDecay, state.waveguideBody, state.waveguideTune
    );
    const waveguideWetGain = ctx.createGain(); // Controlled by state.waveguideMix
    const waveguideOutputGain = ctx.createGain();

    if (config.waveguideProcessor) { // If type > 0, processor is created
        waveguideInputGain.connect(config.waveguideProcessor.input);
        config.waveguideProcessor.output.connect(waveguideWetGain);
    } else { // If type is 0 (Off), create a dummy path for waveguideInputGain
        const dummy = ctx.createGain();
        waveguideInputGain.connect(dummy); // Absorb signal
        dummy.connect(waveguideWetGain); // Still connect to wet gain, which will be 0
    }
    waveguideWetGain.connect(waveguideOutputGain);
    waveguideOutputGain.connect(config.masterGain);

    config.waveguideNode = waveguideInputGain; // Voices send to this
    config.waveguideWetGain = waveguideWetGain; // Controlled by state.waveguideMix
    config.waveguideOutputGain = waveguideOutputGain;

    // --- Clouds FX Engine (Per-Voice Crossfade Routing) ---
    // Each voice has independent crossfade control:
    //   voice[i] → cloudsDirectGains[i] → masterGain (bypass)
    //   voice[i] → cloudsSendGains[i] → cloudsInputAnalyser → cloudsNode → masterGain (effect)
    // Equal-power crossfade per voice: direct = cos(θ), clouds = sin(θ)

    // VU metering analysers for Clouds (shared across all voices)
    config.cloudsInputAnalyser = ctx.createAnalyser();
    config.cloudsInputAnalyser.fftSize = 256;
    config.cloudsInputAnalyser.smoothingTimeConstant = 0.3;

    config.cloudsOutputAnalyser = ctx.createAnalyser();
    config.cloudsOutputAnalyser.fftSize = 256;
    config.cloudsOutputAnalyser.smoothingTimeConstant = 0.3;

    // Per-voice gain node arrays (6 voices)
    config.cloudsDirectGains = [];
    config.cloudsSendGains = [];

    for (let i = 0; i < 6; i++) {
        // Path A: Direct to master (bypass Clouds)
        config.cloudsDirectGains[i] = ctx.createGain();
        config.cloudsDirectGains[i].gain.value = 1.0; // Default: 100% direct (classic mode)
        config.cloudsDirectGains[i].connect(config.masterGain);

        // Path B: To Clouds processor (all sends merge at inputAnalyser)
        config.cloudsSendGains[i] = ctx.createGain();
        config.cloudsSendGains[i].gain.value = 0.0; // Default: 0% to Clouds
        config.cloudsSendGains[i].connect(config.cloudsInputAnalyser);
    }

    // Clouds processor will be created when worklet is loaded (async)
    // For now, connect input analyser directly to output analyser as passthrough
    config.cloudsInputAnalyser.connect(config.cloudsOutputAnalyser);
    // Insert ducking gain between Clouds output and master (like reverb/delay)
    config.cloudsOutputAnalyser.connect(config.duckingGains.baengClouds);
    config.duckingGains.baengClouds.connect(config.masterGain);

    // Flag to track if Clouds processor is ready
    config.cloudsReady = false;

    updateEngineParams(); // Apply initial state values to effects

    // Note: initCloudsProcessor() is called from initializeAudioWorklets().then()
    // after the clouds-processor.js worklet module is loaded
}

/**
 * Initialize Clouds AudioWorklet processor
 * Called from initEffects after worklet modules are loaded
 */
function initCloudsProcessor() {
    if (!config.audioContext || config.cloudsReady) return;
    const ctx = config.audioContext;

    try {
        // Create Clouds AudioWorklet node
        config.cloudsNode = new AudioWorkletNode(ctx, 'clouds-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        // Disconnect the passthrough connection
        config.cloudsInputAnalyser.disconnect(config.cloudsOutputAnalyser);

        // Connect through Clouds: inputAnalyser → cloudsNode → outputAnalyser
        config.cloudsInputAnalyser.connect(config.cloudsNode);
        config.cloudsNode.connect(config.cloudsOutputAnalyser);

        // Handle messages from Clouds processor
        config.cloudsNode.port.onmessage = (e) => {
            const { type, message, event, value } = e.data;
            if (type === 'debug') {
                console.log('[Bæng Clouds]', message);
            }
            // Forward bufferData to visualisation callback if set
            if (event === 'bufferData' && config.cloudsBufferCallback) {
                config.cloudsBufferCallback(value);
            }
        };

        // Initialize Clouds parameters from state
        updateCloudsParams();

        config.cloudsReady = true;
        console.log('[Bæng] Clouds processor initialised');

    } catch (error) {
        console.error('[Bæng] Failed to initialise Clouds processor:', error);
        config.cloudsReady = false;
    }
}

/**
 * Update Clouds processor parameters from state
 */
function updateCloudsParams() {
    if (!config.cloudsNode || !config.cloudsReady) return;

    const params = config.cloudsNode.parameters;
    const now = config.audioContext.currentTime;

    // Map state values (0-100) to processor parameter ranges
    // Position: 0-100 → 0-1
    const position = state.cloudsPosition / 100;
    params.get('position')?.setValueAtTime(position, now);

    // Size: 0-100 → 0-1
    const size = state.cloudsSize / 100;
    params.get('size')?.setValueAtTime(size, now);

    // Density: 0-100 → 0-1
    const density = state.cloudsDensity / 100;
    params.get('density')?.setValueAtTime(density, now);

    // Texture: 0-100 → 0-1
    const texture = state.cloudsTexture / 100;
    params.get('texture')?.setValueAtTime(texture, now);

    // Pitch: 0-100 → -2 to +2 octaves (bipolar, 50 = 0)
    // AudioWorklet expects octaves, not semitones
    const pitchOctaves = ((state.cloudsPitch - 50) / 50) * 2;
    params.get('pitch')?.setValueAtTime(pitchOctaves, now);

    // Spread: 0-100 → 0-1
    const spread = state.cloudsSpread / 100;
    params.get('spread')?.setValueAtTime(spread, now);

    // Feedback: 0-100 → 0-1 (CRITICAL: default 0)
    const feedback = state.cloudsFeedback / 100;
    params.get('feedback')?.setValueAtTime(feedback, now);

    // Reverb: 0-100 → 0-1
    const reverb = state.cloudsReverb / 100;
    params.get('reverb')?.setValueAtTime(reverb, now);

    // Dry/Wet: 0-100 → 0-1
    const dryWet = state.cloudsDryWet / 100;
    params.get('dryWet')?.setValueAtTime(dryWet, now);

    // Input Gain: 0-100 → 0-2 (50 = 1.0 = unity gain)
    const inputGain = (state.cloudsInputGain / 50);
    params.get('inputGain')?.setValueAtTime(inputGain, now);

    // Freeze: boolean
    if (config.cloudsNode.port) {
        config.cloudsNode.port.postMessage({
            command: 'setFreeze',
            value: state.cloudsFreeze
        });
    }

    // Mode: 0-3
    if (config.cloudsNode.port) {
        config.cloudsNode.port.postMessage({
            command: 'setMode',
            value: state.cloudsMode
        });
    }

    // Check for stability warning
    if (feedback >= 0.9 && reverb >= 0.7) {
        console.warn('[Bæng Clouds] STABILITY WARNING: High feedback + reverb may cause oscillation');
    }
}

/**
 * Update FX mode routing (classic vs clouds)
 * @param {string} mode - 'classic' or 'clouds'
 */
export function updateFXMode(mode) {
    if (!config.audioContext) return;

    const fxMode = mode || state.fxMode;
    const now = config.audioContext.currentTime;

    if (fxMode === 'clouds') {
        // Clouds mode: Enable crossfade routing based on per-voice cloudsSend
        // The actual crossfade happens per-voice in updateVoiceCloudsRouting()
        console.log('[Bæng] FX Mode: CLOUDS');

        // Update all active voice routings
        updateAllVoiceCloudsRouting();

    } else {
        // Classic mode: 100% direct, 0% Clouds for all voices
        for (let i = 0; i < 6; i++) {
            config.cloudsDirectGains[i].gain.setTargetAtTime(1.0, now, 0.02);
            config.cloudsSendGains[i].gain.setTargetAtTime(0.0, now, 0.02);
        }
        console.log('[Bæng] FX Mode: CLASSIC');
    }
}

/**
 * Update Clouds routing for all voices based on their individual cloudsSend values
 * Uses equal-power crossfade per voice: direct = cos(θ), clouds = sin(θ)
 */
function updateAllVoiceCloudsRouting() {
    if (!config.audioContext || state.fxMode !== 'clouds') return;

    const now = config.audioContext.currentTime;

    // Update each voice's crossfade independently
    for (let i = 0; i < 6; i++) {
        const cloudsSend = state.voices[i]?.cloudsSend || 0;

        // Equal-power crossfade for this voice
        const t = cloudsSend / 100;
        const directLevel = Math.cos(t * Math.PI / 2);
        const cloudsLevel = Math.sin(t * Math.PI / 2);

        config.cloudsDirectGains[i].gain.setTargetAtTime(directLevel, now, 0.02);
        config.cloudsSendGains[i].gain.setTargetAtTime(cloudsLevel, now, 0.02);
    }
}

/**
 * Update Clouds send for a specific voice (called when cloudsSend parameter changes)
 * @param {number} voiceIndex - Voice index (0-5)
 */
export function updateVoiceCloudsRouting(voiceIndex) {
    if (!config.audioContext || state.fxMode !== 'clouds') return;
    if (voiceIndex < 0 || voiceIndex >= 6) return;

    const now = config.audioContext.currentTime;
    const cloudsSend = state.voices[voiceIndex]?.cloudsSend || 0;

    // Equal-power crossfade for this voice
    const t = cloudsSend / 100;
    const directLevel = Math.cos(t * Math.PI / 2);
    const cloudsLevel = Math.sin(t * Math.PI / 2);

    config.cloudsDirectGains[voiceIndex].gain.setTargetAtTime(directLevel, now, 0.02);
    config.cloudsSendGains[voiceIndex].gain.setTargetAtTime(cloudsLevel, now, 0.02);
}

function createReverbImpulse(decayParam, diffusionParam, preDelayParam, dampingParam) {
    const ctx = config.audioContext;
    if (!ctx) return null;

    // Map parameters
    const decayTime = 0.1 + (decayParam / 100) * 4.0;
    const diffusion = diffusionParam / 100;
    const preDelayTime = (preDelayParam / 100) * 0.2;
    const damping = dampingParam / 100;

    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * decayTime);
    const preDelaySamples = Math.floor(sampleRate * preDelayTime);
    const totalLength = length + preDelaySamples;

    const impulse = ctx.createBuffer(2, totalLength, sampleRate);
    const dataL = impulse.getChannelData(0);
    const dataR = impulse.getChannelData(1);

    // Generate noise-based impulse with envelopes
    for (let i = 0; i < totalLength; i++) {
        if (i < preDelaySamples) {
            dataL[i] = 0;
            dataR[i] = 0;
        } else {
            const t = (i - preDelaySamples) / length;
            const decayEnv = Math.pow(1 - t, 2.0 + (diffusion * 2.0));
            const dampingEnv = Math.exp(-t * damping * 5.0);
            const env = decayEnv * dampingEnv;
            dataL[i] = (Math.random() * 2 - 1) * env;
            dataR[i] = (Math.random() * 2 - 1) * env;
        }
    }

    return impulse;
}

function createGlobalWaveguideResonator(ctx, type, decay, body, tune) {
    if (type === 0 || config.WAVEGUIDE_TYPES[type] === 'Off') {
        // Return a pass-through structure if type is 'Off'
        const input = ctx.createGain();
        const output = ctx.createGain();
        input.connect(output); // Direct pass-through
        return { input, output, currentType: 0 };
    }

    const input = ctx.createGain();
    const output = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const delay = ctx.createDelay(0.5); // Max delay time
    const feedbackGain = ctx.createGain();
    const preFilter = ctx.createBiquadFilter(); // HPF to clean input

    preFilter.type = 'highpass';
    preFilter.frequency.value = 80; // Cut sub-bass mud

    // Tune: 0-100 -> delay time (e.g., 0.001s to 0.1s for typical resonances)
    // Body: 0-100 -> filter Q or characteristics
    // Decay: 0-100 -> feedback amount (0.0 to ~0.98)

    const delayTime = 0.001 + (tune / 100) * 0.05; // 1ms to 51ms
    delay.delayTime.value = delayTime;

    feedbackGain.gain.value = (decay / 100) * 0.98; // Max feedback just below 1.0

    if (type === 1) { // Tube
        filter.type = 'lowpass';
        // Body: 0-100 -> filter freq (e.g., 500Hz to 5000Hz)
        filter.frequency.value = 500 + (body / 100) * 4500;
        filter.Q.value = 1 + (tune / 100) * 5; // Tune can also affect Q slightly
    } else if (type === 2) { // String
        filter.type = 'bandpass';
        // Tune: 0-100 -> filter freq (e.g., 100Hz to 3000Hz)
        filter.frequency.value = 100 + (tune / 100) * 2900;
        // Body: 0-100 -> filter Q (e.g., 5 to 50 for sharp resonance)
        filter.Q.value = 5 + (body / 100) * 45;
    }

    input.connect(preFilter);
    preFilter.connect(filter);
    filter.connect(delay);
    delay.connect(feedbackGain);
    feedbackGain.connect(filter); // Feedback loop (resonator core)
    delay.connect(output); // Output from the delay line

    return { input, output, filter, delay, feedbackGain, preFilter, currentType: type };
}

// Handle reverb parameter changes
function handleReverbParameterChange(paramId, value) {
    if (!config.audioContext) return;
    const now = config.audioContext.currentTime;

    // Update mix/wet gain with smoothing (50ms for smoother transitions)
    if (paramId === 'effects.reverbMix') {
        if (config.reverbWetGain) {
            config.reverbWetGain.gain.cancelScheduledValues(now);
            config.reverbWetGain.gain.setValueAtTime(config.reverbWetGain.gain.value, now);
            config.reverbWetGain.gain.linearRampToValueAtTime(value / 100, now + 0.05);
        }
    }

    // Regenerate impulse response (with crossfading and throttling for real-time updates)
    if (config.updateReverbImpulse &&
        (paramId === 'effects.reverbDecay' ||
         paramId === 'effects.reverbDiffusion' ||
         paramId === 'effects.reverbPreDelay' ||
         paramId === 'effects.reverbDamping')) {

        // Throttle impulse regeneration for real-time updates
        const now_ms = performance.now();
        if (now_ms - lastReverbImpulseUpdate >= REVERB_IMPULSE_THROTTLE) {
            lastReverbImpulseUpdate = now_ms;
            config.updateReverbImpulse();
        }
    }
}

// Update delay time based on sync/free mode
function updateDelayTime() {
    if (!config.delayProcessor) return;

    const ctx = config.audioContext;
    const now = ctx.currentTime;

    let delayTimeSeconds;

    if (state.delaySyncEnabled) {
        // SYNC mode: use tempo and division
        const bpm = state.bpm || 120;
        const divisionIndex = Math.floor((state.delayTime / 100) * (DELAY_DIVISIONS.length - 1));
        const division = DELAY_DIVISIONS[divisionIndex].value;
        const beatDuration = 60 / bpm;
        delayTimeSeconds = division * (4 * beatDuration); // 4 beats = 1 bar
    } else {
        // FREE mode: use delayTimeFree (1ms-4000ms exponential)
        const normalized = state.delayTimeFree / 100;
        const delayTimeMs = 1 + Math.pow(normalized, 2) * 3999; // Exponential curve
        delayTimeSeconds = delayTimeMs / 1000;
    }

    // Clamp to max delay time
    delayTimeSeconds = Math.min(delayTimeSeconds, 5.0);

    // Set delay time with smoothing to avoid pitch glitches (200ms for smooth tape-like pitch shift)
    config.delayProcessor.delayTime.cancelScheduledValues(now);
    config.delayProcessor.delayTime.setValueAtTime(config.delayProcessor.delayTime.value, now);
    config.delayProcessor.delayTime.linearRampToValueAtTime(delayTimeSeconds, now + 0.2);

    // Update all delay taps to be multiples of the base delay time
    if (config.delayTaps && config.delayTaps.length > 0) {
        for (let i = 0; i < config.delayTaps.length; i++) {
            const tapDelayTime = delayTimeSeconds * i; // tap[0]=0ms, tap[1]=1×, tap[2]=2×, etc.
            const clampedTapTime = Math.min(tapDelayTime, 5.0);

            config.delayTaps[i].delayTime.cancelScheduledValues(now);
            config.delayTaps[i].delayTime.setValueAtTime(config.delayTaps[i].delayTime.value, now);
            config.delayTaps[i].delayTime.linearRampToValueAtTime(clampedTapTime, now + 0.2);
        }
    }
}

// Handle delay parameter changes
function handleDelayParameterChange(paramId, value) {
    const ctx = config.audioContext;
    if (!ctx) return;

    const now = ctx.currentTime;

    switch (paramId) {
        case 'effects.delayMix':
            if (config.delayWetGain) {
                config.delayWetGain.gain.cancelScheduledValues(now);
                config.delayWetGain.gain.setValueAtTime(config.delayWetGain.gain.value, now);
                config.delayWetGain.gain.linearRampToValueAtTime(value / 100, now + 0.05);
            }
            break;

        case 'effects.delayTime':
        case 'effects.delayTimeFree':
        case 'effects.delaySyncEnabled':
            updateDelayTime();
            break;

        case 'effects.delayFeedback':
            if (config.delayFeedbackGain) {
                const feedback = Math.min(value / 100 * 0.85, 0.85);
                config.delayFeedbackGain.gain.cancelScheduledValues(now);
                config.delayFeedbackGain.gain.setValueAtTime(config.delayFeedbackGain.gain.value, now);
                config.delayFeedbackGain.gain.linearRampToValueAtTime(feedback, now + 0.1);
            }
            break;

        case 'effects.delayWow':
            // Update wow LFO depth and frequency (200ms for smooth modulation changes)
            if (config.delayWowGain && config.delayWowLFO) {
                const wowDepth = (value / 100) * 0.005; // 0-5ms
                const wowFreq = 0.1 + (value / 100) * 0.4; // 0.1-0.5 Hz
                config.delayWowGain.gain.cancelScheduledValues(now);
                config.delayWowGain.gain.setValueAtTime(config.delayWowGain.gain.value, now);
                config.delayWowGain.gain.linearRampToValueAtTime(wowDepth, now + 0.2);
                config.delayWowLFO.frequency.cancelScheduledValues(now);
                config.delayWowLFO.frequency.setValueAtTime(config.delayWowLFO.frequency.value, now);
                config.delayWowLFO.frequency.linearRampToValueAtTime(wowFreq, now + 0.2);
            }
            break;

        case 'effects.delayFlutter':
            // Update flutter LFO depth and frequency (200ms for smooth modulation changes)
            if (config.delayFlutterGain && config.delayFlutterLFO) {
                const flutterDepth = (value / 100) * 0.001; // 0-1ms
                const flutterFreq = 4 + (value / 100) * 4; // 4-8 Hz
                config.delayFlutterGain.gain.cancelScheduledValues(now);
                config.delayFlutterGain.gain.setValueAtTime(config.delayFlutterGain.gain.value, now);
                config.delayFlutterGain.gain.linearRampToValueAtTime(flutterDepth, now + 0.2);
                config.delayFlutterLFO.frequency.cancelScheduledValues(now);
                config.delayFlutterLFO.frequency.setValueAtTime(config.delayFlutterLFO.frequency.value, now);
                config.delayFlutterLFO.frequency.linearRampToValueAtTime(flutterFreq, now + 0.2);
            }
            break;

        case 'effects.delaySaturation':
            // Update saturation curve with crossfading (prevents glitches)
            if (config.delaySaturation1 && config.delaySaturation2 && config.delaySaturationComp) {
                const newCurve = makeSaturationCurve(value);

                // Determine which saturation to update (the inactive one)
                const inactiveSaturation = config.activeSaturation === 1 ? 2 : 1;
                const inactiveGain = config.activeSaturation === 1 ? config.delaySaturationGain2 : config.delaySaturationGain1;
                const activeGain = config.activeSaturation === 1 ? config.delaySaturationGain1 : config.delaySaturationGain2;

                // Load new curve into inactive WaveShaper
                if (inactiveSaturation === 1) {
                    config.delaySaturation1.curve = newCurve;
                } else {
                    config.delaySaturation2.curve = newCurve;
                }

                // Crossfade (50ms for smooth transition)
                activeGain.gain.cancelScheduledValues(now);
                activeGain.gain.setValueAtTime(1.0, now);
                activeGain.gain.linearRampToValueAtTime(0.0, now + 0.05);

                inactiveGain.gain.cancelScheduledValues(now);
                inactiveGain.gain.setValueAtTime(0.0, now);
                inactiveGain.gain.linearRampToValueAtTime(1.0, now + 0.05);

                // Swap active saturation
                config.activeSaturation = inactiveSaturation;

                // Update compensation gain with smoothing (100ms)
                const k = Math.pow(value / 100, 3) * 20;
                const compGain = 1.0 / (1 + k * 0.75);
                config.delaySaturationComp.gain.cancelScheduledValues(now);
                config.delaySaturationComp.gain.setValueAtTime(config.delaySaturationComp.gain.value, now);
                config.delaySaturationComp.gain.linearRampToValueAtTime(compGain, now + 0.1);
            }
            break;

        case 'effects.delayFilter':
            // Update delay filter (tape-like damping) with 100ms smoothing
            if (config.delayFilter) {
                // Map 0-100 to frequency range (200Hz - 20kHz, logarithmic)
                const minFreq = 200;
                const maxFreq = 20000;
                const normalized = value / 100;
                const freq = minFreq * Math.pow(maxFreq / minFreq, normalized);

                config.delayFilter.frequency.cancelScheduledValues(now);
                config.delayFilter.frequency.setValueAtTime(config.delayFilter.frequency.value, now);
                config.delayFilter.frequency.exponentialRampToValueAtTime(freq, now + 0.1);
            }
            break;
    }
}


/**
 * Create and connect the drum bus AudioWorklet node
 * Called after worklets have been loaded
 */
function createDrumBusNode() {
    if (!config.audioContext || config.drumBusNode) return;

    try {
        // Create the drum bus worklet node
        config.drumBusNode = new AudioWorkletNode(config.audioContext, 'drum-bus-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        // Disconnect the temporary direct route
        config.masterGain.disconnect(config.busOutputAnalyser);

        // Reconnect with drum bus in the chain:
        // masterGain → drumBusNode → busOutputAnalyser → limiter
        config.masterGain.connect(config.drumBusNode);
        config.drumBusNode.connect(config.busOutputAnalyser);

        // Apply initial state
        updateDrumBusParams();

        // Start visualisation
        startBusVisualization();


    } catch (error) {
        console.error('[Bæng] Failed to create drum bus node:', error);
        // Keep the direct route as fallback
    }
}

/**
 * Update drum bus processor parameters from state
 * Called at init and when bus settings change
 */
export function updateDrumBusParams() {
    if (!config.drumBusNode) return;

    const db = state.drumBus;
    const ctx = config.audioContext;
    const time = ctx ? ctx.currentTime : 0;
    const tc = 0.01; // 10ms time constant for smooth transitions

    // Set all parameters with smooth transitions (normalised 0-1 values)
    config.drumBusNode.parameters.get('driveType').setTargetAtTime(db.driveType, time, tc);
    config.drumBusNode.parameters.get('driveAmount').setTargetAtTime(db.driveAmount / 100, time, tc);
    config.drumBusNode.parameters.get('crunch').setTargetAtTime(db.crunch / 100, time, tc);
    config.drumBusNode.parameters.get('transients').setTargetAtTime(db.transients / 100, time, tc);
    config.drumBusNode.parameters.get('boomAmount').setTargetAtTime(db.boomAmount / 100, time, tc);
    config.drumBusNode.parameters.get('boomFreq').setTargetAtTime(db.boomFreq / 100, time, tc);
    config.drumBusNode.parameters.get('boomDecay').setTargetAtTime(db.boomDecay / 100, time, tc);
    config.drumBusNode.parameters.get('compressEnabled').setTargetAtTime(db.compEnabled ? 1 : 0, time, tc);
    config.drumBusNode.parameters.get('dampenFreq').setTargetAtTime(db.dampenFreq / 100, time, tc);
    config.drumBusNode.parameters.get('trimGain').setTargetAtTime(db.trimGain / 100, time, tc);
    config.drumBusNode.parameters.get('outputGain').setTargetAtTime(db.outputGain / 100, time, tc);
    config.drumBusNode.parameters.get('dryWet').setTargetAtTime(db.dryWet / 100, time, tc);
}

// Bus visualisation animation
let busAnimationId = null;

/**
 * Start the bus visualisation animation loop
 * Draws waveform oscilloscope with boom VU meter strip at bottom
 */
export function startBusVisualization() {
    if (busAnimationId) return; // Already running

    const canvas = document.getElementById('bus-canvas');
    if (!canvas || !config.busOutputAnalyser) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const boomMeterHeight = 8; // Height for boom VU strip at bottom

    const waveformData = new Uint8Array(config.busOutputAnalyser.frequencyBinCount);
    const freqData = new Uint8Array(config.busOutputAnalyser.frequencyBinCount);

    // Get theme colour and update periodically
    const styles = getComputedStyle(document.documentElement);
    let themeColor = styles.getPropertyValue('--theme-color').trim() || '#FFDC32';
    let bgModule = styles.getPropertyValue('--bg-module').trim() || '#111111';
    let frameCount = 0;

    function draw() {
        busAnimationId = requestAnimationFrame(draw);

        // Safety check - stop animation if canvas/analyser become invalid
        if (!canvas.isConnected || !config.busOutputAnalyser) {
            console.warn('[Bæng] BUS visualisation stopped - canvas or analyser unavailable');
            stopBusVisualization();
            return;
        }

        try {
            // Update theme colours every 60 frames (~1 second)
            frameCount++;
            if (frameCount % 60 === 0) {
                const styles = getComputedStyle(document.documentElement);
                themeColor = styles.getPropertyValue('--theme-color').trim() || '#FFDC32';
                bgModule = styles.getPropertyValue('--bg-module').trim() || '#111111';
            }

            // Get time-domain data for waveform
            config.busOutputAnalyser.getByteTimeDomainData(waveformData);
            // Get frequency data for boom meter (sub-bass region)
            config.busOutputAnalyser.getByteFrequencyData(freqData);

        // Clear canvas (theme-aware background, matches other Bæng visualisations)
        ctx.fillStyle = bgModule;
        ctx.fillRect(0, 0, width, height);

        // Draw waveform (oscilloscope) with theme gradient
        const waveHeight = height - boomMeterHeight - 2;
        ctx.lineWidth = 1;
        ctx.strokeStyle = createThemeGradient(ctx, 0, 0, width, 0);
        ctx.beginPath();

        const sliceWidth = width / waveformData.length;
        let x = 0;

        for (let i = 0; i < waveformData.length; i++) {
            const v = waveformData[i] / 128.0;
            const y = (v * waveHeight) / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            x += sliceWidth;
        }
        ctx.stroke();

        // Draw boom meter (VU strip at bottom)
        // Calculate sub-bass level from frequency data (approx 30-100Hz bins)
        const nyquist = config.audioContext.sampleRate / 2;
        const binWidth = nyquist / config.busOutputAnalyser.frequencyBinCount;
        const subBassEnd = Math.ceil(100 / binWidth);
        let subBassLevel = 0;

        for (let i = 0; i < subBassEnd && i < freqData.length; i++) {
            subBassLevel += freqData[i];
        }
        subBassLevel = subBassEnd > 0 ? (subBassLevel / subBassEnd) / 255 : 0;

        // Scale by boom amount to show how much is being added
        const boomContribution = subBassLevel * (state.drumBus.boomAmount / 100);

        // Draw meter background (theme-aware)
        const isLightMode = document.documentElement.getAttribute('data-theme') === 'light';
        ctx.fillStyle = isLightMode ? '#d0d0d0' : '#111111';
        ctx.fillRect(0, height - boomMeterHeight, width, boomMeterHeight);

        // Draw meter fill (proportional to boom contribution) with theme gradient
        if (boomContribution > 0) {
            ctx.fillStyle = createThemeGradient(ctx, 0, 0, width, 0);
            ctx.fillRect(0, height - boomMeterHeight, width * Math.min(1, boomContribution * 2), boomMeterHeight);
        }
        } catch (err) {
            console.error('[Bæng] BUS visualisation error:', err);
            stopBusVisualization();
        }
    }

    draw();
}

/**
 * Stop the bus visualisation animation
 */
export function stopBusVisualization() {
    if (busAnimationId) {
        cancelAnimationFrame(busAnimationId);
        busAnimationId = null;
    }
    const canvas = document.getElementById('bus-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        const bgModule = getComputedStyle(document.documentElement)
            .getPropertyValue('--bg-module').trim() || '#111111';
        ctx.fillStyle = bgModule;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

export function updateEngineParams() {
    if (!config.audioContext || !config.initialized) return;
    const ctx = config.audioContext;
    const now = ctx.currentTime;

    // Note: Master volume is now controlled by drum bus outputGain parameter
    // updateDrumBusParams() should be called separately for BUS module changes

    // Reverb - Use new parameter handler for all reverb params
    if (config.reverbWetGain) {
        handleReverbParameterChange('effects.reverbMix', state.reverbMix);
        handleReverbParameterChange('effects.reverbDecay', state.reverbDecay);
        handleReverbParameterChange('effects.reverbDiffusion', state.reverbDiffusion);
        handleReverbParameterChange('effects.reverbPreDelay', state.reverbPreDelay);
        handleReverbParameterChange('effects.reverbDamping', state.reverbDamping);
    }

    // Delay - Use new parameter handler for all delay params
    if (config.delayNode && config.delayWetGain && config.delayProcessor && config.delayFeedbackGain) {
        handleDelayParameterChange('effects.delayMix', state.delayMix);
        handleDelayParameterChange('effects.delayTime', state.delayTime);
        handleDelayParameterChange('effects.delayFeedback', state.delayFeedback);
        handleDelayParameterChange('effects.delayWow', state.delayWow);
        handleDelayParameterChange('effects.delayFlutter', state.delayFlutter);
        handleDelayParameterChange('effects.delaySaturation', state.delaySaturation);
        handleDelayParameterChange('effects.delayFilter', state.delayFilter);
    }

    // Waveguide
    if (config.waveguideNode && config.waveguideWetGain && config.waveguideOutputGain) {
        config.waveguideWetGain.gain.setTargetAtTime(state.waveguideMix / 100, now, 0.02);

        const currentWGType = config.waveguideProcessor ? config.waveguideProcessor.currentType : 0;
        if (state.waveguideType !== currentWGType) {
            // Type changed, need to recreate
            if (config.waveguideProcessor && config.waveguideProcessor.input && typeof config.waveguideProcessor.input.disconnect === 'function') {
                try { config.waveguideNode.disconnect(config.waveguideProcessor.input); } catch(e){}
                try { config.waveguideProcessor.output.disconnect(config.waveguideWetGain); } catch(e){}
            }
            
            config.waveguideProcessor = createGlobalWaveguideResonator(
                ctx, state.waveguideType, state.waveguideDecay, state.waveguideBody, state.waveguideTune
            );

            if (config.waveguideProcessor) {
                config.waveguideNode.connect(config.waveguideProcessor.input);
                config.waveguideProcessor.output.connect(config.waveguideWetGain);
            }
        } else if (config.waveguideProcessor && config.waveguideProcessor.filter && state.waveguideType > 0) {
            // Type is the same, just update params
            const wg = config.waveguideProcessor;
            const delayTime = 0.001 + (state.waveguideTune / 100) * 0.05;
            wg.delay.delayTime.setTargetAtTime(delayTime, now, 0.02);
            wg.feedbackGain.gain.setTargetAtTime((state.waveguideDecay / 100) * 0.98, now, 0.02);

            if (state.waveguideType === 1) { // Tube
                wg.filter.type = 'lowpass';
                wg.filter.frequency.setTargetAtTime(500 + (state.waveguideBody / 100) * 4500, now, 0.02);
                wg.filter.Q.setTargetAtTime(1 + (state.waveguideTune / 100) * 5, now, 0.02);
            } else if (state.waveguideType === 2) { // String
                wg.filter.type = 'bandpass';
                wg.filter.frequency.setTargetAtTime(100 + (state.waveguideTune / 100) * 2900, now, 0.02);
                wg.filter.Q.setTargetAtTime(5 + (state.waveguideBody / 100) * 45, now, 0.02);
            }
        } else if (state.waveguideType === 0 && config.waveguideProcessor && config.waveguideProcessor.currentType !== 0) {
            // Switched to OFF, ensure processor is the pass-through version
             if (config.waveguideProcessor && config.waveguideProcessor.input && typeof config.waveguideProcessor.input.disconnect === 'function') {
                try { config.waveguideNode.disconnect(config.waveguideProcessor.input); } catch(e){}
                try { config.waveguideProcessor.output.disconnect(config.waveguideWetGain); } catch(e){}
            }
            config.waveguideProcessor = createGlobalWaveguideResonator(ctx, 0, 0,0,0); // Create OFF version
            config.waveguideNode.connect(config.waveguideProcessor.input);
            config.waveguideProcessor.output.connect(config.waveguideWetGain);
        }
    }

    // Clouds FX - Update processor parameters and crossfade routing
    if (config.cloudsReady) {
        updateCloudsParams();
        updateAllVoiceCloudsRouting();
    }
}

// Simplified waveguide for per-voice insert (placeholder, not currently used by spec for main WG effect)
function createWaveguideResonator(ctx, type, decay, body, tune) {
    if (type === 0) return null; 

    const input = ctx.createGain();
    const output = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const delay = ctx.createDelay(0.1); 
    const feedback = ctx.createGain();

    const delayTimeVal = 0.001 + (tune / 100) * 0.03; // 1ms to 31ms
    delay.delayTime.value = delayTimeVal;
    feedback.gain.value = (decay / 100) * 0.95;

    if (type === 1) { // Tube
        filter.type = 'lowpass';
        filter.frequency.value = 800 + (body / 100) * 4000;
        filter.Q.value = 0.5 + (tune / 100) * 4;
    } else { // String
        filter.type = 'bandpass';
        filter.frequency.value = 200 + (tune / 100) * 2000;
        filter.Q.value = 2 + (body / 100) * 20;
    }

    input.connect(filter);
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(filter); 
    delay.connect(output);
    
    return { input, output, filter, delay, feedback }; // Return all nodes for potential external control/cleanup
}

function applyBitReduction(ctx, inputNode, amount) { // amount 0-100
    if (amount <= 0) return inputNode; // No effect, return original node

    const bitDepth = Math.max(1, Math.floor(16 - (amount / 100) * 15)); // 16-bit down to 1-bit
    const steps = Math.pow(2, bitDepth);
    
    const bitCrusherNode = ctx.createWaveShaper();
    const curve = new Float32Array(65536); // Standard curve size
    
    for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1; // Map i from 0..len-1 to x from -1..1
        if (steps === 1) { // 1-bit (effectively a comparator)
            curve[i] = x > 0 ? 1 : -1;
        } else {
            curve[i] = Math.round(x * (steps / 2)) / (steps / 2);
        }
    }
    bitCrusherNode.curve = curve;
    // No oversample for bitcrusher, aliasing is part of the sound.

    inputNode.connect(bitCrusherNode);
    return bitCrusherNode; // Return the new end of the chain
}

// Export constants and handlers for UI
export { DELAY_DIVISIONS, handleDelayParameterChange, handleReverbParameterChange, updateCloudsParams };