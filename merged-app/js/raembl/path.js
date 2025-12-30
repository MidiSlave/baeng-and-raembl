// File: js/path.js
// Path module
import { state } from '../state.js';
import { scales, noteNames } from '../utils.js';
import { triggerNote, releaseAllVoices } from '../audio.js';

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
    const octaveRange = 3;
    const totalSemitones = octaveRange * 12;
    const notePosition = normalizedValue * totalSemitones; // 0 to 36 (semitones above C2)
    
    const baseOctave = 2;
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
export function handleSampleTrigger() {
    if (Math.random() * 100 <= state.probability) {
        // Release any current notes before triggering a new one
        releaseAllVoices();
        
        // Store previous sample
        state.prevSample = state.sample;
        
        // Get new sample from LFO
        state.sample = state.lfoValue;
        
        // Map to scale
        const note = mapToScale(state.sample);
        state.currentNote = note;
        
        
        // Trigger note in audio engine
        triggerNote(note, state.accentPattern[state.currentStepIndex] ? 1.2 : 1.0);
        
        // Start transition animation
        state.isTransitioning = true;
        state.sampleTime = Date.now();
        
        // Draw canvas
        drawPath();
    }
}

// Draw the path/note visualization
export function drawPath() {
    const canvasEl = document.getElementById('raembl-path-canvas');
    if (!canvasEl) return;

    try {
        const ctx = canvasEl.getContext('2d');
        const width = canvasEl.width;
        const height = canvasEl.height;

        // Get theme-aware colours from CSS variables
        const styles = getComputedStyle(document.documentElement);
        const bgCanvas = styles.getPropertyValue('--bg-canvas').trim() || '#222222';
        const gridColor = styles.getPropertyValue('--border-grey-1').trim() || '#333333';
        const centerLineColor = styles.getPropertyValue('--border-grey-2').trim() || '#444444';
        const themeColor = styles.getPropertyValue('--theme-color').trim() || '#FFDC32';

        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = bgCanvas;
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;

        for (let x = 0; x <= width; x += width / 3) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        for (let y = 0; y <= height; y += height / 6) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // Draw center line
        ctx.strokeStyle = centerLineColor;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Calculate display Y position based on sample and transition
        const currentSampleY = (1 - state.sample / 100) * height;
        const previousSampleY = (1 - state.prevSample / 100) * height;
        let displayY = currentSampleY;

        if (state.isTransitioning) {
            const now = Date.now();
            const elapsed = now - state.sampleTime;
            const duration = 150;

            if (elapsed < duration) {
                const progress = elapsed / duration;
                displayY = previousSampleY * (1 - progress) + currentSampleY * progress;
                requestAnimationFrame(drawPath);
            } else {
                state.isTransitioning = false;
            }
        }

        // Draw sample line
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, displayY);
        ctx.lineTo(width, displayY);
        ctx.stroke();

        // Draw note text
        ctx.fillStyle = themeColor;
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        const textY = displayY < 12 ? displayY + 10 : displayY - 5;
        ctx.fillText(state.currentNote, width - 5, textY);
    } catch (e) {
        console.error("Error drawing path:", e);
    }
}

// Initialize path module
export function initPath() {
    // Initial drawing
    drawPath();
}