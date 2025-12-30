// File: js/utils/scaleQuantizer.js
// Scale quantization for pitch modulation
// Ported from ræmbL PATH module

// Musical scales with semitone intervals from root
export const scales = [
    // Chromatic and Common Western Scales
    { name: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { name: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
    { name: 'Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
    { name: 'Harm Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
    { name: 'Melo Minor', intervals: [0, 2, 3, 5, 7, 9, 11] },

    // Western Modes
    { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
    { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
    { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
    { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
    { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },

    // Pentatonic and Blues Scales
    { name: 'Maj Penta', intervals: [0, 2, 4, 7, 9] },
    { name: 'Min Penta', intervals: [0, 3, 5, 7, 10] },
    { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },

    // Synthetic/Jazz Scales
    { name: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10] },
    { name: 'Diminished', intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
    { name: 'Altered', intervals: [0, 1, 3, 4, 6, 8, 10] },
    { name: 'Bebop Dom', intervals: [0, 2, 4, 5, 7, 9, 10, 11] },
    { name: 'Bebop Maj', intervals: [0, 2, 4, 5, 7, 8, 9, 11] },
    { name: 'Prometheus', intervals: [0, 2, 4, 6, 9, 10] },

    // Middle Eastern/Arabic Scales
    { name: 'Double Harm', intervals: [0, 1, 4, 5, 7, 8, 11] },
    { name: 'Persian', intervals: [0, 1, 4, 5, 6, 8, 11] },
    { name: 'Hijaz Kar', intervals: [0, 1, 4, 5, 7, 8, 10] },

    // Eastern European Scales
    { name: 'Hung Minor', intervals: [0, 2, 3, 6, 7, 8, 11] },
    { name: 'Ukr Dorian', intervals: [0, 2, 3, 6, 7, 9, 10] },
    { name: 'Neap Major', intervals: [0, 1, 3, 5, 7, 9, 11] },
    { name: 'Neap Minor', intervals: [0, 1, 3, 5, 7, 8, 11] },

    // Japanese/East Asian Scales
    { name: 'Hirajoshi', intervals: [0, 2, 3, 7, 8] },
    { name: 'In', intervals: [0, 1, 5, 7, 10] },
    { name: 'Yo', intervals: [0, 2, 5, 7, 9] },
    { name: 'Iwato', intervals: [0, 1, 5, 6, 10] },
    { name: 'Kumoi', intervals: [0, 2, 3, 7, 9] },

    // Ethiopian/African Scales
    { name: 'Bati Maj', intervals: [0, 2, 4, 6, 9] },
    { name: 'Ambassel', intervals: [0, 2, 4, 5, 9] },
    { name: 'Anchihoye', intervals: [0, 1, 4, 5, 8] }
];

// Note names for display and calculations
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/**
 * Quantize a continuous pitch value (0-100) to the nearest note in a musical scale
 * @param {number} value - Input pitch value (0-100)
 * @param {number} scaleIndex - Index into scales array (0-32)
 * @param {number} rootNote - Root note offset (0-11, representing C-B)
 * @returns {number} MIDI note number
 */
export function quantizePitchToScale(value, scaleIndex, rootNote) {
    // Get the selected scale
    const currentScale = scales[Math.min(scaleIndex, scales.length - 1)];
    if (!currentScale) return 60; // Fallback to middle C

    const currentScaleIntervals = currentScale.intervals;

    // Normalize input value to 0-1 range
    const normalizedValue = value / 100;

    // Define pitch range (3 octaves for drum synthesis, centered around C3)
    const octaveRange = 3;
    const baseOctave = 2; // Start at C2
    const totalSemitones = octaveRange * 12; // 36 semitones

    // Calculate target semitone position
    const notePosition = normalizedValue * totalSemitones;
    const targetSemitone = Math.floor(notePosition);

    // Find the closest note in the scale using minimum distance algorithm
    let closestSemitone = 0;
    let minDistance = Infinity;

    for (let octave = 0; octave < octaveRange; octave++) {
        for (const interval of currentScaleIntervals) {
            const semitoneInScale = octave * 12 + interval;
            const distance = Math.abs(targetSemitone - semitoneInScale);

            if (distance < minDistance) {
                minDistance = distance;
                closestSemitone = semitoneInScale;
            }
        }
    }

    // Apply root note transposition
    const finalSemitone = closestSemitone + rootNote;

    // Convert to MIDI note (C2 = MIDI 36)
    const midiNote = (baseOctave * 12 + 12) + finalSemitone;

    return Math.max(0, Math.min(127, midiNote)); // Clamp to valid MIDI range
}

/**
 * Get the name of a scale by index
 * @param {number} scaleIndex - Index into scales array
 * @returns {string} Scale name
 */
export function getScaleName(scaleIndex) {
    const scale = scales[Math.min(scaleIndex, scales.length - 1)];
    return scale ? scale.name : 'Chromatic';
}

/**
 * Get the name of a root note by index
 * @param {number} rootIndex - Root note index (0-11)
 * @returns {string} Root note name
 */
export function getRootName(rootIndex) {
    return noteNames[rootIndex % 12];
}
