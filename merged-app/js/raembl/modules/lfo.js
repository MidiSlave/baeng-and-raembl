// File: js/modules/lfo.js
// LFO module
import { state } from '../state.js';
import { colors } from '../config.js';
import { createThemeGradient } from '../../shared/gradient-utils.js';

// Get frequency in Hertz from normalized value
export function getFrequencyHz() {
    // Use exponential mapping for better frequency perception
    // Range: 0.05 Hz (very slow) to 30 Hz (very fast) - approximately 9-10 octaves
    // Previously: 0.1 Hz to 10 Hz (linear)
    
    // Convert 0-100 to 0-1
    const normalized = state.lfoFreq / 100;
    
    // Exponential mapping: min * (max/min)^normalized
    // This creates a curve where the frequency doubles with each octave
    const minFreq = 0.05; // Slower minimum (1 cycle per 20 seconds)
    const maxFreq = 30;   // Faster maximum (30 cycles per second)
    
    const frequency = minFreq * Math.pow(maxFreq / minFreq, normalized);
    
    // Round to 2 decimal places for display purposes
    return Math.round(frequency * 100) / 100;
}

// Calculate wave value at a specific cycle position
export function calculateWaveValue(cyclePosition) {
    const numShapes = 4;
    const clampedValue = Math.min(state.lfoWaveform, 99.999);
    const shapeIndex1 = Math.floor(clampedValue / (100 / numShapes));
    const rangeStart = shapeIndex1 * (100 / numShapes);
    const morphAmount = (state.lfoWaveform - rangeStart) / (100 / numShapes);
    
    const getShapeValue = (index, pos) => {
        switch (index) {
            case 0: return Math.sin(pos * Math.PI * 2);  // Sine
            case 1: return 1 - 4 * Math.abs(Math.round(pos) - pos);  // Triangle
            case 2: return pos < 0.5 ? 1 : -1;  // Square
            case 3: return 2 * (pos - Math.floor(0.5 + pos));  // Sawtooth
            default: return Math.sin(pos * Math.PI * 2);
        }
    };
    
    const value1 = getShapeValue(shapeIndex1, cyclePosition);
    const value2 = getShapeValue((shapeIndex1 + 1) % numShapes, cyclePosition);
    return value1 * (1 - morphAmount) + value2 * morphAmount;
}

// Update the current LFO value based on time
export function updateLfoValue() {
    const now = performance.now();
    const elapsedMs = now - state.lfoStartTime;
    const frequencyHz = getFrequencyHz();
    const period = frequencyHz > 0.001 ? 1000 / frequencyHz : Infinity;
    const normalizedOffset = state.lfoOffset / 100;
    // Expand amplitude range to allow for more dramatic modulations
    // Map 0-100 to 0-2 (200% of original) to allow for more extreme modulation effects
    const normalizedAmp = (state.lfoAmp / 100) * 2;
    
    let currentLfoOutput = 0;
    
    if (period !== Infinity) {
        const currentCyclePosition = (elapsedMs % period) / period;
        const rawLfoValue = calculateWaveValue(currentCyclePosition);
        currentLfoOutput = Math.max(0, Math.min(100, ((rawLfoValue * normalizedAmp + normalizedOffset) + 1) * 50));
    } else {
        currentLfoOutput = Math.max(0, Math.min(100, (normalizedOffset + 1) * 50));
    }
    
    state.lfoValue = currentLfoOutput;
    
    return currentLfoOutput;
}

// Store animation frame ID for management
let lfoAnimationFrameId = null;

// Draw the LFO waveform on the canvas
export function drawLfo() {
    const canvasEl = document.getElementById('raembl-lfo-canvas');
    if (!canvasEl) return;
    
    try {
        const ctx = canvasEl.getContext('2d');
        const width = canvasEl.width;
        const height = canvasEl.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = colors.canvasBg;
        ctx.fillRect(0, 0, width, height);

        // Calculate values
        const now = performance.now();
        const elapsedMs = now - state.lfoStartTime;
        const frequencyHz = getFrequencyHz();
        const period = frequencyHz > 0.001 ? 1000 / frequencyHz : Infinity;
        const normalizedOffset = state.lfoOffset / 100;
        // Use increased amplitude range in drawing function to match audio output
        const normalizedAmp = (state.lfoAmp / 100) * 2;
        
        // Calculate and update LFO value
        let currentLfoOutput = updateLfoValue();
        
        // Draw waveform (uses gradient in gradient mode)
        ctx.strokeStyle = createThemeGradient(ctx, 0, 0, width, 0);
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let x = 0; x < width; x++) {
            const timePoint = (x / width) * (period === Infinity ? 1000 : period);
            const cyclePosition = period === Infinity ? 0 : ((elapsedMs + timePoint) % period) / period;
            let value = calculateWaveValue(cyclePosition);
            value = value * normalizedAmp + normalizedOffset;
            const y = height / 2 - (value * height / 2);
            
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Request animation frame with better management
        // Cancel any existing animation frame first
        if (lfoAnimationFrameId) {
            cancelAnimationFrame(lfoAnimationFrameId);
        }
        
        // Request a new frame
        lfoAnimationFrameId = requestAnimationFrame(drawLfo);
    } catch (e) {
        console.error("Error drawing LFO:", e);
        // Even on error, try to keep the animation loop going
        lfoAnimationFrameId = requestAnimationFrame(drawLfo);
    }
}

// Initialize LFO module
export function initLfo() {
    state.lfoStartTime = performance.now();
    
    // Ensure any existing animation is cancelled
    if (lfoAnimationFrameId) {
        cancelAnimationFrame(lfoAnimationFrameId);
        lfoAnimationFrameId = null;
    }
    
    // Start the LFO animation with a new frame request
    lfoAnimationFrameId = requestAnimationFrame(drawLfo);
    
}

// Utility function to check if LFO animation is running
export function isLfoAnimationRunning() {
    return !!lfoAnimationFrameId;
}

// Utility function to restart LFO animation if needed
export function ensureLfoAnimationRunning() {
    if (!lfoAnimationFrameId) {
        lfoAnimationFrameId = requestAnimationFrame(drawLfo);
        return true;
    }
    return false;
}

// --- PPMod Update Functions ---
// These are called by perParamMod.js when modulating LFO parameters

export function updateLfoRate(rate) {
    state.lfoFreq = Math.max(0, Math.min(100, rate));
}

export function updateLfoDepth(depth) {
    state.lfoAmp = Math.max(0, Math.min(100, depth));
}

export function updateLfoWaveform(waveform) {
    state.lfoWaveform = Math.max(0, Math.min(100, waveform));
}

export function updateLfoOffset(offset) {
    state.lfoOffset = Math.max(-100, Math.min(100, offset));
}
