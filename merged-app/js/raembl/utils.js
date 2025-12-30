// File: js/utils.js
// Utility functions used across modules

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

// Scales data (names abbreviated to ~8 chars max for UI consistency)
export const scales = [
    // Chromatic and Common Western Scales
    { name: 'Chrom', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
    { name: 'Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
    { name: 'Harm Min', intervals: [0, 2, 3, 5, 7, 8, 11] },
    { name: 'Melo Min', intervals: [0, 2, 3, 5, 7, 9, 11] },

    // Western Modes
    { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
    { name: 'Phryg', intervals: [0, 1, 3, 5, 7, 8, 10] },
    { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
    { name: 'Mixo', intervals: [0, 2, 4, 5, 7, 9, 10] },
    { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },

    // Pentatonic and Blues Scales
    { name: 'Maj Pent', intervals: [0, 2, 4, 7, 9] },
    { name: 'Min Pent', intervals: [0, 3, 5, 7, 10] },
    { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },

    // Synthetic/Jazz Scales
    { name: 'WhlTone', intervals: [0, 2, 4, 6, 8, 10] },
    { name: 'Dim', intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
    { name: 'Altered', intervals: [0, 1, 3, 4, 6, 8, 10] },
    { name: 'Bop Dom', intervals: [0, 2, 4, 5, 7, 9, 10, 11] },
    { name: 'Bop Maj', intervals: [0, 2, 4, 5, 7, 8, 9, 11] },
    { name: 'Prometh', intervals: [0, 2, 4, 6, 9, 10] },

    // Middle Eastern/Arabic Scales
    { name: 'Dbl Harm', intervals: [0, 1, 4, 5, 7, 8, 11] },
    { name: 'Persian', intervals: [0, 1, 4, 5, 6, 8, 11] },
    { name: 'Hijaz', intervals: [0, 1, 4, 5, 7, 8, 10] },

    // Eastern European Scales
    { name: 'Hung Min', intervals: [0, 2, 3, 6, 7, 8, 11] },
    { name: 'Ukr Dor', intervals: [0, 2, 3, 6, 7, 9, 10] },
    { name: 'Neap Maj', intervals: [0, 1, 3, 5, 7, 9, 11] },
    { name: 'Neap Min', intervals: [0, 1, 3, 5, 7, 8, 11] },

    // Japanese/East Asian Scales
    { name: 'Hirajo', intervals: [0, 2, 3, 7, 8] },
    { name: 'In', intervals: [0, 1, 5, 7, 10] },
    { name: 'Yo', intervals: [0, 2, 5, 7, 9] },
    { name: 'Iwato', intervals: [0, 1, 5, 6, 10] },
    { name: 'Kumoi', intervals: [0, 2, 3, 7, 9] },

    // Ethiopian/African Scales
    { name: 'Bati', intervals: [0, 2, 4, 6, 9] },
    { name: 'Ambassl', intervals: [0, 2, 4, 5, 9] },
    { name: 'Anchi', intervals: [0, 1, 4, 5, 8] }
];

export const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Converts a MIDI note number to a note name string (e.g., 60 -> "C4").
 * @param {number} midiNote - The MIDI note number (0-127).
 * @returns {string} The note name string.
 */
export function midiNoteToName(midiNote) {
    if (midiNote < 0 || midiNote > 127) {
        console.warn(`Invalid MIDI note: ${midiNote}. Returning C4.`);
        return 'C4';
    }
    const octave = Math.floor(midiNote / 12) - 1;
    const noteIndex = midiNote % 12;
    return `${noteNames[noteIndex]}${octave}`;
}

/**
 * Converts Ræmbl transposition index to semitones for AudioWorklet
 * @param {number} transpositionIndex - Transposition index (0-8)
 * @returns {number} Semitones offset (-24 to +24)
 */
export function transpositionToSemitones(transpositionIndex) {
    // Ræmbl transposition indices map to semitones
    // Index 0-8 maps to: [-24, -19, -12, -7, 0, 7, 12, 19, 24]
    const semitoneMap = [-24, -19, -12, -7, 0, 7, 12, 19, 24];
    const clampedIndex = Math.max(0, Math.min(8, Math.round(transpositionIndex)));
    return semitoneMap[clampedIndex];
}