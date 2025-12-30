// File: js/utils.js
// Utility functions for Bæng

// Scale a value from one range to another
export function scaleValue(value, inMin, inMax, outMin, outMax) {
    // Avoid division by zero if inMin and inMax are the same
    if (inMin === inMax) {
        return outMin; // Or handle as an error, or return average of outMin/outMax
    }
    return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

// Clamp a value between min and max
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// Generate a unique ID (simple version)
export function generateId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Format a time in milliseconds to a string (MM:SS:MS) - MS is centiseconds
export function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((ms % 1000) / 10); // Display centiseconds for brevity
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${centiseconds.toString().padStart(2, '0')}`;
}

// Convert a frequency to a MIDI note number
export function freqToMidi(frequency) {
    if (frequency <= 0) return 0; // Avoid log(0) or log(negative)
    return Math.round(69 + 12 * Math.log2(frequency / 440));
}

// Convert a MIDI note number to a frequency
export function midiToFreq(midiNote) {
    return 440 * Math.pow(2, (midiNote - 69) / 12);
}

// Convert a MIDI note number to a note name (e.g., 60 -> "C4") - Standard C4=MIDI 60
export function midiToNoteName(midiNote) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const octave = Math.floor(midiNote / 12) - 1; // MIDI note 0-11 is octave -1, 12-23 is octave 0, etc. C4 is 60.
    const noteIndex = midiNote % 12;
    
    return notes[noteIndex] + octave;
}

// Convert a note name to a MIDI note number (e.g., "C4" -> 60)
export function noteNameToMidi(noteName) {
    const notes = { 'C': 0, 'C#': 1, 'DB': 1, 'D': 2, 'D#': 3, 'EB': 3, 'E': 4, 'F': 5, 'F#': 6, 'GB': 6, 'G': 7, 'G#': 8, 'AB': 8, 'A': 9, 'A#': 10, 'BB': 10, 'B': 11 };
    
    const noteMatch = noteName.toUpperCase().match(/^([A-G][#B]?)(-?\d+)$/);
    if (!noteMatch) {
        return null;
    }

    const note = noteMatch[1];
    const octave = parseInt(noteMatch[2], 10);

    if (notes[note] === undefined) {
        return null;
    }
    
    return (octave + 1) * 12 + notes[note];
}

// Debounce function to limit how often a function can be called
export function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Deep clone an object (simple JSON-based method, careful with Dates, Functions, undefined, etc.)
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    // Handle Date objects
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    // Handle Array objects
    if (Array.isArray(obj)) {
        return obj.map(item => deepClone(item));
    }
    // Handle other objects
    const clonedObj = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            clonedObj[key] = deepClone(obj[key]);
        }
    }
    return clonedObj;
}

// Get a random integer between min and max (inclusive)
export function randomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Get a random float between min and max
export function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

// Map a value from one range to another with optional exponential scaling
export function mapRange(value, inMin, inMax, outMin, outMax, exponential = false) {
    // Clamp input value to input range
    value = Math.max(inMin, Math.min(inMax, value));

    if (exponential && outMin > 0 && outMax > 0) {
        // Use exponential mapping for better frequency scaling
        const normalizedValue = (value - inMin) / (inMax - inMin);
        return outMin * Math.pow(outMax / outMin, normalizedValue);
    } else {
        // Linear mapping (original behavior)
        return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
    }
}

// Simple pseudorandom noise function
export function simpleNoise(x, y, seed = 1) {
    const highPrime1 = 73856093;
    const highPrime2 = 19349663;
    const highPrime3 = 83492791;
    let n = x * highPrime1 + y * highPrime2 + seed * highPrime3;
    n = (n << 13) ^ n;
    n = (n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff;
    return 1.0 - n / 1073741824.0;
}

/**
 * Convert a level parameter (0-100) to a gain value with perceptual scaling
 *
 * Human hearing perceives volume logarithmically, but gain is linear.
 * This function applies a power curve (x²) to create a natural-feeling fader response.
 *
 * Scaling comparison:
 *   Linear (x):    50% level = -6.0 dB   (feels too quiet at midpoint)
 *   Power2 (x²):   50% level = -12.0 dB  (feels natural - "half volume")
 *   Power3 (x³):   50% level = -18.1 dB  (too aggressive)
 *
 * @param {number} level - Level parameter (0-100)
 * @param {string} curve - Curve type: 'linear', 'power2' (default), 'power3'
 * @returns {number} Gain value (0.0-1.0)
 *
 * @example
 * levelToGain(100) // 1.0 (0 dB)
 * levelToGain(50)  // 0.25 (-12 dB) - "half volume" feeling
 * levelToGain(25)  // 0.0625 (-24 dB)
 * levelToGain(0)   // 0.0 (-∞ dB / silence)
 */
export function levelToGain(level, curve = 'power2') {
    // Normalize to 0.0-1.0
    const normalized = Math.max(0, Math.min(100, level)) / 100;

    switch (curve) {
        case 'linear':
            return normalized;
        case 'power3':
            return normalized * normalized * normalized;
        case 'power2':
        default:
            return normalized * normalized; // x² power curve (recommended)
    }
}