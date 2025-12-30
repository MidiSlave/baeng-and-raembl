/**
 * Pitch Preprocessing Module
 *
 * Unified pitch calculation for multi-engine support.
 * Handles drift offset generation and octave transpose on main thread,
 * reducing per-sample calculations in AudioWorklet.
 *
 * @module pitch-preprocessing
 */

/**
 * Semitone mapping for Ræmbl transposition indices
 * Index 0-8 maps to: [-24, -19, -12, -7, 0, 7, 12, 19, 24]
 */
const SEMITONE_MAP = [-24, -19, -12, -7, 0, 7, 12, 19, 24];

/**
 * Maximum drift in cents at 100% drift parameter
 * ±40 cents provides subtle but audible pitch variation
 */
const MAX_DRIFT_CENTS = 40;

/**
 * Generate random drift offset for a new note
 * Called once at noteOn time, stored per-voice
 *
 * @param {number} driftAmount - Drift parameter (0-100)
 * @returns {number} Drift offset in cents (±40 cents max)
 */
export function generateDriftOffset(driftAmount) {
  if (driftAmount <= 0) return 0;

  // Normalise 0-100 to 0-1
  const normalisedDrift = Math.min(100, Math.max(0, driftAmount)) / 100;

  // Calculate max drift in cents for this amount
  const maxDriftCents = normalisedDrift * MAX_DRIFT_CENTS;

  // Generate random offset: (Math.random() * 2 - 1) gives range [-1, 1]
  return (Math.random() * 2 - 1) * maxDriftCents;
}

/**
 * Convert transposition UI index to semitones
 *
 * @param {number} transpositionIndex - UI step (0-8)
 * @returns {number} Semitones offset (-24 to +24)
 */
export function transpositionToSemitones(transpositionIndex) {
  const clampedIndex = Math.max(0, Math.min(8, Math.round(transpositionIndex)));
  return SEMITONE_MAP[clampedIndex];
}

/**
 * Convert MIDI note number to frequency
 *
 * @param {number} midiNote - MIDI note number (0-127)
 * @returns {number} Frequency in Hz
 */
export function midiToFrequency(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Convert note name to MIDI number
 * e.g., "C3" -> 48, "A4" -> 69
 *
 * @param {string|number} noteName - Note name or MIDI number
 * @returns {number} MIDI note number
 */
export function noteNameToMidi(noteName) {
  if (typeof noteName === 'number') return noteName;

  const noteMap = {
    'C': 0, 'C#': 1, 'Db': 1,
    'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4,
    'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8,
    'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11
  };

  const match = noteName.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!match) {
    console.warn(`[PitchPreprocessing] Invalid note name: ${noteName}`);
    return 60; // Default to middle C
  }

  const [, note, octave] = match;
  return (parseInt(octave) + 1) * 12 + noteMap[note];
}

/**
 * Calculate final frequency with drift and octave transpose applied
 * This is the main preprocessing function - called once per noteOn
 *
 * @param {number} midiNote - MIDI note number (0-127)
 * @param {number} octaveTransposeSemitones - Semitone offset from transposition
 * @param {number} driftOffsetCents - Drift offset in cents (from generateDriftOffset)
 * @returns {number} Final frequency in Hz
 */
export function calculateFrequency(midiNote, octaveTransposeSemitones = 0, driftOffsetCents = 0) {
  // Base frequency from MIDI note
  const baseFreq = midiToFrequency(midiNote);

  // Apply octave/semitone transpose
  const transposedFreq = baseFreq * Math.pow(2, octaveTransposeSemitones / 12);

  // Apply drift (convert cents to octaves: 1200 cents = 1 octave)
  const driftOctaves = driftOffsetCents / 1200;
  const finalFreq = transposedFreq * Math.pow(2, driftOctaves);

  return finalFreq;
}

/**
 * Calculate frequency for sub oscillator with independent transpose
 *
 * @param {number} midiNote - MIDI note number
 * @param {number} subTransposeSemitones - Sub oscillator semitone offset
 * @param {number} driftOffsetCents - Drift offset in cents (shared with main osc)
 * @returns {number} Sub oscillator frequency in Hz
 */
export function calculateSubFrequency(midiNote, subTransposeSemitones = 0, driftOffsetCents = 0) {
  return calculateFrequency(midiNote, subTransposeSemitones, driftOffsetCents);
}

/**
 * Preprocess pitch for a note trigger
 * Returns all pitch-related values needed by the voice
 *
 * @param {string|number} note - Note name or MIDI number
 * @param {object} state - State object with transposition and drift values
 * @returns {object} Preprocessed pitch data
 */
export function preprocessPitch(note, state) {
  const midiNote = noteNameToMidi(note);

  // Get transposition in semitones
  const mainSemitones = transpositionToSemitones(state.mainTransposition || 4);
  const subSemitones = transpositionToSemitones(state.subTransposition || 2);

  // Generate drift offset (same for both oscillators)
  const driftOffset = generateDriftOffset(state.drift || 0);

  // Calculate final frequencies
  const mainFrequency = calculateFrequency(midiNote, mainSemitones, driftOffset);
  const subFrequency = calculateSubFrequency(midiNote, subSemitones, driftOffset);

  return {
    midiNote,
    mainFrequency,
    subFrequency,
    driftOffset,
    mainSemitones,
    subSemitones
  };
}
