// File: js/modules/path.js
// Path module
import { state } from '../state.js';
import { scales, noteNames } from '../utils.js';
import { triggerNote, releaseAllVoices, releaseVoiceById, releaseVoiceByIndex } from '../audio.js';
import { config, colors } from '../config.js';
import { createThemeGradient, isGradientModeActive, getGradientColor1RGB, getGradientColor2RGB } from '../../shared/gradient-utils.js';

// Get the display name of the current scale
export function getCurrentScaleName() {
    return scales[Math.min(state.scale, scales.length - 1)].name;
}

// Get the display name of the current root note
export function getCurrentRootName() {
    return noteNames[state.root];
}

// Map a value to a note in the current scale
export function mapToScale(value) {
    const currentScaleDef = scales[Math.min(state.scale, scales.length - 1)];
    if (!currentScaleDef) return "?";

    const currentScaleIntervals = currentScaleDef.intervals;
    const normalizedValue = value / 100; // 0 to 1
    const octaveRange = 5; // Expanded from 3 octaves to 5 octaves
    const totalSemitones = octaveRange * 12;
    const notePosition = normalizedValue * totalSemitones; // 0 to 60 (semitones above C1)

    const baseOctave = 1; // Lowered from 2 to 1 to expand range on both ends
    const targetSemitone = Math.floor(notePosition); // Target semitone above C2

    let closestNoteInOctave = -1;
    let minDistance = Infinity;
    let finalSemitone = 0;

    // Find the closest scale note
    for (let oct = 0; oct < octaveRange; oct++) {
        for (const interval of currentScaleIntervals) {
            const semitoneInScale = oct * 12 + interval; // Semitone relative to C of base octave
            const distance = Math.abs(targetSemitone - semitoneInScale);
            if (distance < minDistance) {
                minDistance = distance;
                closestNoteInOctave = semitoneInScale;
            }
        }
    }

    finalSemitone = closestNoteInOctave;

    // Apply root note shift
    finalSemitone = finalSemitone + state.root;

    // Calculate final note name and octave
    const finalNoteIndex = finalSemitone % 12;
    const finalOctave = baseOctave + Math.floor(finalSemitone / 12);
    const noteName = noteNames[finalNoteIndex];

    return `${noteName}${finalOctave}`;
}

// Handle a trigger from the sequencer
export function handleSampleTrigger(audioTime = null) {
    // Check main probability first
    if (Math.random() * 100 <= state.probability) {
        // NOTE: gateTriggered event is dispatched in triggerNote() (audio.js:298-301)
        // to avoid double-dispatch which causes S&H to sample twice per note

        // Store previous sample
        state.prevSample = state.sample;

        // Get new sample from LFO
        state.sample = state.lfoValue;

        // Store pitch for this step
        const currentStepIndexForPatterns = state.factorsPatternPos;
        if (currentStepIndexForPatterns >= 0) {
            // Ensure stepPitches array is sized correctly
            while (state.stepPitches.length <= currentStepIndexForPatterns) {
                state.stepPitches.push(50); // Default middle pitch
            }
            state.stepPitches[currentStepIndexForPatterns] = state.lfoValue;
        }

        // Map to scale
        const note = mapToScale(state.sample);
        state.currentNote = note;

        // --- Determine Accent ---
        let isAccented = false;
        // Use factorsPatternPos as the reliable index into accent/slide patterns
        // (already declared above at line 79)

        if (currentStepIndexForPatterns >= 0 && currentStepIndexForPatterns < state.accentPattern.length) {
             // Use the pre-generated pattern (already has probability baked in)
             isAccented = state.accentPattern[currentStepIndexForPatterns];
             if (isAccented) {
            }
        } else {
             console.warn(`Path Trigger: Invalid currentStepIndexForPatterns ${currentStepIndexForPatterns} for accent check.`);
        }


        // --- Determine Slide ---
        // TB-303 convention: slide flag on step N means "slide FROM step N TO step N+1"
        // So we check the PREVIOUS step's slide flag to know if we should slide INTO this step
        let shouldSlide = false;
        const prevStepIndex = (currentStepIndexForPatterns - 1 + state.slidePattern.length) % state.slidePattern.length;
        if (prevStepIndex >= 0 && prevStepIndex < state.slidePattern.length) {
            // Check if previous step had slide enabled AND was gated (had a note)
            const prevWasGated = state.gatePattern[prevStepIndex];
            shouldSlide = prevWasGated && state.slidePattern[prevStepIndex];
            if (shouldSlide) {
            }
        }

        // --- Determine Trill ---
        let isTrill = false;
        if (currentStepIndexForPatterns >= 0 && currentStepIndexForPatterns < state.trillPattern.length) {
            // Trill is determined directly by the pattern, not probability
            isTrill = state.trillPattern[currentStepIndexForPatterns];
            if (isTrill) {
            }
        } else {
            console.warn(`Path Trigger: Invalid currentStepIndexForPatterns ${currentStepIndexForPatterns} for trill check.`);
        }



        // Determine base velocity (Accent might boost this later)
        const baseVelocity = 1.0; // Default velocity

        // Trigger note in audio engine, passing the flags and audioTime
        // Note: triggerNote might call releaseAllVoices internally based on mode/slide
        const voice = triggerNote(note, baseVelocity, isAccented, shouldSlide, isTrill, audioTime, currentStepIndexForPatterns);

        // Auto-release for POLY mode (prevents orphaned voices)
        // Note: shouldSlide and isTrill are mono-only features - ignore them in poly mode
        // FACTOR can set these flags, but they should not prevent auto-release in poly
        // FIX: Use workletVoiceIndex (pool slot) instead of voiceId to avoid stale ID race condition
        if (!state.monoMode && voice && voice.workletVoiceIndex !== undefined) {
            // Calculate gate duration based on sequencer timing
            const msPerStep = (60000 / state.bpm) / state.stepsPerBeat;
            const gateLength = state.gateLength / 100; // Convert 0-100 to 0-1
            const releaseDelayMs = msPerStep * gateLength;
            const releaseDelaySec = releaseDelayMs / 1000;

            // Calculate audio context time when release should trigger
            const autoReleaseTime = audioTime + releaseDelaySec;

            // Schedule auto-release using audio-time tracking (immune to main-thread delays)
            config.workletBridge.scheduleAutoRelease(voice.workletVoiceIndex, autoReleaseTime);

        }

        // Start transition animation
        state.isTransitioning = true;
        state.sampleTime = Date.now();

        // Draw canvas
        drawPath();

    } else {
        // Probability check failed, potentially release voices if desired?
        // releaseAllVoices(); // Optional: uncomment if you want silence on probability fail
    }
}


// Animation state for cylinder visualization
let animationFrameId = null;
let cylinderRotation = 0;
let lastAnimationTime = 0;

// Animation state for slides and trills (firefly effects)
let stepAnimationStates = {}; // Track slide/trill animations per step
const SLIDE_DURATION_MS = 100; // Smooth glide duration
const TRILL_FREQUENCY_HZ = 20; // Rapid darting frequency
const TRILL_AMPLITUDE = 8; // Darting distance in pixels
const FIREFLY_JITTER = 2; // Random position jitter

// Calculate 3D position for a dot on the cylinder
function getCylinderDotPosition(stepIndex, totalSteps, canvasWidth, canvasHeight, pitchValue) {
    // Calculate angle based on step position in pattern
    const angle = (stepIndex / totalSteps) * 2 * Math.PI + cylinderRotation;
    const radius = canvasWidth * 0.35; // Radius of the cylinder
    const centerX = canvasWidth / 2;

    // Calculate 3D position
    const x3d = Math.cos(angle) * radius;
    const z3d = Math.sin(angle) * radius;

    // Project to 2D
    const x2d = centerX + x3d;

    // Calculate Y position based on pitch (inverted: high pitch = top)
    const y = (1 - pitchValue / 100) * canvasHeight;

    // Calculate depth-based scale and alpha
    // z3d ranges from -radius to +radius
    // Normalize to 0-1 where 1 is front (closest to viewer)
    const normalizedZ = (z3d + radius) / (radius * 2);
    const scale = 0.3 + normalizedZ * 0.7; // Scale from 0.3 (back) to 1.0 (front)

    // Fade dots that are on the back half of the cylinder
    const alpha = normalizedZ > 0.3 ? 0.3 + normalizedZ * 0.7 : 0;

    return { x: x2d, y, z: z3d, scale, normalizedZ, alpha };
}

// Draw the path/note visualization
export function drawPath() {
    const canvasEl = document.getElementById('raembl-path-canvas');
    if (!canvasEl) return;

    try {
        const ctx = canvasEl.getContext('2d');
        const width = canvasEl.width;
        const height = canvasEl.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = colors.canvasBg;
        ctx.fillRect(0, 0, width, height);

        // Calculate display Y position based on sample and transition
        const currentSampleY = (1 - state.sample / 100) * height;
        const previousSampleY = (1 - state.prevSample / 100) * height;
        let displayY = currentSampleY;

        if (state.isTransitioning) {
            const now = Date.now();
            const elapsed = now - state.sampleTime;
            const duration = 150; // Animation duration

            if (elapsed < duration) {
                const progress = elapsed / duration;
                displayY = previousSampleY * (1 - progress) + currentSampleY * progress;
                requestAnimationFrame(drawPath);
            } else {
                state.isTransitioning = false;
            }
        }

        if (state.pathAnimationMode === 'static') {
            // Original static visualization
            // Draw sample line (uses gradient in gradient mode)
            ctx.strokeStyle = createThemeGradient(ctx, 0, 0, width, 0);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(0, displayY);
            ctx.lineTo(width, displayY);
            ctx.stroke();

            // Draw note text
            ctx.fillStyle = createThemeGradient(ctx, 0, 0, width, 0);
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            const textY = displayY < 12 ? displayY + 10 : displayY - 5;
            ctx.fillText(state.currentNote, width - 5, textY);
        } else {
            // Cylinder visualization - only show gated steps
            const dots = [];
            const currentTime = Date.now();

            // Only create dots for gated steps
            if (state.gatePattern && state.gatePattern.length > 0) {
                for (let i = 0; i < state.gatePattern.length; i++) {
                    if (state.gatePattern[i]) {
                        // This step is gated, create a dot for it
                        let pitchValue = state.stepPitches[i] || 50; // Use stored pitch or default

                        // Check for slide and trill effects
                        const hasSlide = state.slidePattern && state.slidePattern[i];
                        const hasTrill = state.trillPattern && state.trillPattern[i];
                        const isCurrentStep = i === state.currentStepIndex;

                        // Initialize animation state if needed
                        if (!stepAnimationStates[i]) {
                            stepAnimationStates[i] = {
                                startTime: currentTime,
                                startPitch: pitchValue,
                                targetPitch: pitchValue
                            };
                        }

                        // Apply slide animation (smooth interpolation to next step)
                        if (hasSlide && isCurrentStep && state.isPlaying) {
                            const nextIndex = (i + 1) % state.gatePattern.length;
                            const nextPitch = state.stepPitches[nextIndex] || 50;
                            const elapsed = currentTime - stepAnimationStates[i].startTime;
                            const progress = Math.min(elapsed / SLIDE_DURATION_MS, 1.0);

                            // Smooth interpolation
                            pitchValue = stepAnimationStates[i].startPitch +
                                         (nextPitch - stepAnimationStates[i].startPitch) * progress;

                            // Update target for next iteration
                            if (progress >= 1.0) {
                                stepAnimationStates[i].startTime = currentTime;
                                stepAnimationStates[i].startPitch = nextPitch;
                            }
                        }

                        const pos = getCylinderDotPosition(i, state.gatePattern.length, width, height, pitchValue);

                        if (pos.alpha > 0) { // Only add visible dots
                            // Apply trill firefly darting effect
                            let finalX = pos.x;
                            let finalY = pos.y;
                            let glowing = false;

                            if (hasTrill && isCurrentStep && state.isPlaying) {
                                // Rapid vertical darting
                                const trillPhase = (currentTime % (1000 / TRILL_FREQUENCY_HZ)) / (1000 / TRILL_FREQUENCY_HZ);
                                const dartOffset = Math.sin(trillPhase * Math.PI * 2) * TRILL_AMPLITUDE;
                                finalY += dartOffset;

                                // Firefly jitter on X position
                                finalX += (Math.random() - 0.5) * FIREFLY_JITTER;

                                glowing = true; // Trills glow
                            }

                            dots.push({
                                stepIndex: i,
                                isCurrentStep: isCurrentStep,
                                hasSlide: hasSlide,
                                hasTrill: hasTrill,
                                glowing: glowing,
                                x: finalX,
                                y: finalY,
                                z: pos.z,
                                scale: pos.scale,
                                alpha: pos.alpha,
                                normalizedZ: pos.normalizedZ
                            });
                        }
                    }
                }
            }

            // Sort by z-depth (back to front)
            dots.sort((a, b) => a.z - b.z);

            // Draw dots with slide/trill effects
            for (const dot of dots) {
                const baseRadius = 3;
                let radius = baseRadius * dot.scale;

                // Enlarge trilling dots (firefly effect)
                if (dot.glowing && dot.hasTrill) {
                    radius *= 1.3; // Larger during trill
                }

                ctx.beginPath();
                ctx.arc(dot.x, dot.y, radius, 0, 2 * Math.PI);

                if (dot.isCurrentStep && state.isPlaying) {
                    // Active step with glow (uses gradient in gradient mode)
                    const dotGradient = createThemeGradient(ctx, 0, 0, width, 0);
                    ctx.fillStyle = dotGradient;
                    // Shadow color needs solid color - use first gradient color or theme color
                    if (isGradientModeActive()) {
                        const c1 = getGradientColor1RGB();
                        ctx.shadowColor = `rgb(${c1.r}, ${c1.g}, ${c1.b})`;
                    } else {
                        ctx.shadowColor = colors.yellow;
                    }
                    const glowIntensity = dot.hasTrill ? 15 : 10; // Brighter glow for trills
                    ctx.shadowBlur = glowIntensity * dot.scale;
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    // Add motion trail for trills (firefly streak effect)
                    if (dot.hasTrill) {
                        ctx.globalAlpha = 0.3;
                        ctx.fillStyle = dotGradient;
                        ctx.beginPath();
                        ctx.arc(dot.x, dot.y + 3, radius * 0.6, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.globalAlpha = 1.0;
                    }
                } else {
                    // Inactive dots - use alpha from depth calculation
                    const alpha = dot.hasSlide ? dot.alpha * 1.2 : dot.alpha; // Slightly brighter for slides
                    // Interpolate gradient colors based on x position for gradient mode
                    if (isGradientModeActive()) {
                        const c1 = getGradientColor1RGB();
                        const c2 = getGradientColor2RGB();
                        const t = dot.x / width;
                        const r = Math.round(c1.r + (c2.r - c1.r) * t);
                        const g = Math.round(c1.g + (c2.g - c1.g) * t);
                        const b = Math.round(c1.b + (c2.b - c1.b) * t);
                        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(alpha, 1.0)})`;
                    } else {
                        const { r, g, b } = colors.yellowRGB;
                        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(alpha, 1.0)})`;
                    }
                    ctx.fill();
                }
            }

            // Draw note text for the current step if it's visible
            const currentDot = dots.find(d => d.isCurrentStep);
            if (currentDot) {
                ctx.fillStyle = createThemeGradient(ctx, 0, 0, width, 0);
                ctx.font = '10px monospace';
                ctx.textAlign = 'right';
                const textY = currentDot.y < 12 ? currentDot.y + 10 : currentDot.y - 5;
                ctx.fillText(state.currentNote, width - 5, textY);
            }
        }
    } catch (e) {
        console.error("Error drawing path:", e);
    }
}

// Animation loop for cylinder rotation
function animateCylinder(timestamp) {
    if (state.pathAnimationMode !== 'animated') {
        lastAnimationTime = 0;
        return;
    }

    // Calculate delta time
    if (lastAnimationTime === 0) {
        lastAnimationTime = timestamp;
    }
    const deltaTime = timestamp - lastAnimationTime;
    lastAnimationTime = timestamp;

    // Calculate rotation speed based on BPM only (independent of LENGTH parameter)
    // One full rotation (2π) per 4 beats (matching FACTORS)
    const beatsPerRotation = 4;
    const msPerRotation = (60000 / state.bpm) * beatsPerRotation;
    const rotationPerMs = (Math.PI * 2) / msPerRotation;
    const rotationDelta = rotationPerMs * deltaTime;

    // Rotate cylinder continuously in same direction as FACTORS
    cylinderRotation -= rotationDelta; // Negative for clockwise rotation

    // Update display
    drawPath();

    // Continue animation
    animationFrameId = requestAnimationFrame(animateCylinder);
}

// Start or stop animation based on mode and play state
function updateAnimationState() {
    const shouldAnimate = state.pathAnimationMode === 'animated';

    if (shouldAnimate) {
        if (!animationFrameId) {
            lastAnimationTime = 0; // Reset time tracking
            animationFrameId = requestAnimationFrame(animateCylinder);
        }
    } else {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        lastAnimationTime = 0; // Reset time tracking
        if (state.pathAnimationMode === 'static') {
            cylinderRotation = 0;
        }
        drawPath();
    }
}

// Export function to restart animation when play state changes
export function onPlayStateChange() {
    updateAnimationState();
}

// Toggle visualization mode
function toggleVisualizationMode() {
    const button = document.getElementById('raembl-path-viz-toggle');
    if (!button) return;

    state.pathAnimationMode = state.pathAnimationMode === 'static' ? 'animated' : 'static';

    // Update button appearance
    if (state.pathAnimationMode === 'animated') {
        button.classList.add('active');
        button.textContent = '■';
    } else {
        button.classList.remove('active');
        button.textContent = '▶';
    }

    updateAnimationState();
}

// Initialize path module
export function initPath() {
    // Initial drawing
    drawPath();

    // Setup toggle button
    const toggleButton = document.getElementById('raembl-path-viz-toggle');
    if (toggleButton) {
        toggleButton.addEventListener('click', toggleVisualizationMode);
        // Initialize button state
        if (state.pathAnimationMode === 'static') {
            toggleButton.textContent = '▶';
            toggleButton.classList.remove('active');
        } else {
            toggleButton.textContent = '■';
            toggleButton.classList.add('active');
        }
    }

    updateAnimationState();
}

// --- PPMod Update Functions ---
// These are called by perParamMod.js when modulating PATH parameters

export function updatePathScale(scale) {
    state.scale = Math.max(0, Math.min(31, Math.round(scale)));
}

export function updatePathRoot(root) {
    state.root = Math.max(0, Math.min(11, Math.round(root)));
}

export function updatePathProbability(probability) {
    state.probability = Math.max(0, Math.min(100, probability));
}

export function updatePathGateLength(gateLength) {
    state.gateLength = Math.max(5, Math.min(100, gateLength));
}