// File: js/modules/euclidean.js
// Euclidean rhythm generation module for Bæng
// Ported from ræmbL factors.js

import { state } from '../state.js';

/**
 * Generate a euclidean rhythm pattern using Bjorklund's algorithm
 * @param {number} steps - Total number of steps in the pattern (1-64)
 * @param {number} fills - Number of active steps/pulses (0-steps)
 * @returns {boolean[]} - Array of boolean values (true = gate on, false = gate off)
 */
export function generateEuclideanRhythm(steps, fills) {
    if (steps <= 0) return [];
    if (fills >= steps) return Array(steps).fill(true);
    if (fills <= 0) return Array(steps).fill(false);

    steps = Math.max(1, Math.min(steps, 64));
    fills = Math.max(0, Math.min(fills, steps));

    let pattern = Array(steps).fill(false);
    const stepSize = steps / fills;

    for (let i = 0; i < fills; i++) {
        pattern[Math.floor(i * stepSize)] = true;
    }

    return pattern;
}

/**
 * Rotate a pattern by a given number of steps
 * @param {boolean[]} pattern - The pattern to rotate
 * @param {number} rotation - Number of steps to rotate (can be negative)
 * @returns {boolean[]} - Rotated pattern
 */
export function rotatePattern(pattern, rotation) {
    if (!pattern || pattern.length === 0) return [];
    const length = pattern.length;
    if (length === 0) return [];

    const normalizedRotation = ((rotation % length) + length) % length;
    if (normalizedRotation === 0) return [...pattern];

    const rotated = [...pattern];
    for (let i = 0; i < length; i++) {
        rotated[i] = pattern[(i + normalizedRotation) % length];
    }

    return rotated;
}

/**
 * Generate indices of filled steps from a gate pattern
 * @param {boolean[]} gatePattern - Pattern of gates
 * @returns {number[]} - Array of indices where gates are active
 */
function getFilledIndices(gatePattern) {
    const indices = [];
    for (let i = 0; i < gatePattern.length; i++) {
        if (gatePattern[i]) {
            indices.push(i);
        }
    }
    return indices;
}

/**
 * Distribute a certain amount of features across filled steps using euclidean algorithm
 * Similar to ræmbL's approach: generate euclidean pattern for number of fills, then map to filled indices
 * @param {number} fills - Total number of filled steps
 * @param {number} amount - Number of features to distribute (e.g., accents)
 * @returns {number[]} - Array of indices (relative to fills) where features should be placed
 */
function distributeAcrossFills(fills, amount) {
    if (fills <= 0 || amount <= 0) return [];
    amount = Math.min(amount, fills); // Cap at fills

    // Generate euclidean pattern for the filled steps
    const pattern = generateEuclideanRhythm(fills, amount);

    // Return indices where pattern is true
    const indices = [];
    for (let i = 0; i < pattern.length; i++) {
        if (pattern[i]) {
            indices.push(i);
        }
    }
    return indices;
}

/**
 * Update a sequence to use euclidean rhythm generation
 * @param {number} voiceIndex - Index of the voice/sequence to update
 */
export function updateEuclideanSequence(voiceIndex) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) {
        return;
    }

    const sequence = state.sequences[voiceIndex];
    const eucParams = sequence.euclidean;

    if (!eucParams) {
        return;
    }


    // Ensure parameters are within valid ranges
    const currentSteps = Math.max(1, Math.min(eucParams.steps, 16));
    const currentFills = Math.max(0, Math.min(eucParams.fills, currentSteps));
    const currentShift = Math.max(0, Math.min(eucParams.shift, currentSteps - 1));

    // Update sequence length to match euclidean steps
    sequence.length = currentSteps;

    // Update fills if it exceeds steps (like ræmbL)
    if (eucParams.fills > currentSteps) {
        eucParams.fills = currentSteps;
    }

    // Cap accent/flam/ratchet amounts at fills
    eucParams.accentAmt = Math.min(eucParams.accentAmt, currentFills);
    eucParams.flamAmt = Math.min(eucParams.flamAmt, currentFills);
    eucParams.ratchetAmt = Math.min(eucParams.ratchetAmt, currentFills);

    // Generate the base gate pattern using euclidean rhythm (WITHOUT rotation yet)
    const unrotatedGatePattern = generateEuclideanRhythm(currentSteps, currentFills);

    // Get indices of filled steps in unrotated pattern
    const filledIndices = getFilledIndices(unrotatedGatePattern);

    // Distribute ratchet/flam/accent sequentially across available fills
    // Start with all filled indices available
    let availableFillIndices = [...Array(currentFills).keys()];

    // Step 1: Distribute ratchets first (highest priority)
    const ratchetIndices = distributeAcrossFills(availableFillIndices.length, eucParams.ratchetAmt);
    const unrotatedRatchetSet = new Set(ratchetIndices.map(i => filledIndices[availableFillIndices[i]]));
    availableFillIndices = availableFillIndices.filter((_, idx) => !ratchetIndices.includes(idx));

    // Step 2: Distribute flams from remaining fills
    const flamRelativeIndices = distributeAcrossFills(availableFillIndices.length, eucParams.flamAmt);
    const unrotatedFlamSet = new Set(flamRelativeIndices.map(i => filledIndices[availableFillIndices[i]]));
    availableFillIndices = availableFillIndices.filter((_, idx) => !flamRelativeIndices.includes(idx));

    // Step 3: Distribute accents from remaining fills
    const accentRelativeIndices = distributeAcrossFills(availableFillIndices.length, eucParams.accentAmt);
    const unrotatedAccentSet = new Set(accentRelativeIndices.map(i => filledIndices[availableFillIndices[i]]));

    // Create decoration arrays that will be rotated along with the gate pattern
    const ratchetPattern = Array(currentSteps).fill(false);
    const flamPattern = Array(currentSteps).fill(false);
    const accentPattern = Array(currentSteps).fill(false);

    for (let i = 0; i < currentSteps; i++) {
        if (unrotatedRatchetSet.has(i)) ratchetPattern[i] = true;
        if (unrotatedFlamSet.has(i)) flamPattern[i] = true;
        if (unrotatedAccentSet.has(i)) accentPattern[i] = true;
    }

    // NOW rotate ALL patterns together (gates and decorations)
    const gatePattern = rotatePattern(unrotatedGatePattern, currentShift);
    const rotatedRatchetPattern = rotatePattern(ratchetPattern, currentShift);
    const rotatedFlamPattern = rotatePattern(flamPattern, currentShift);
    const rotatedAccentPattern = rotatePattern(accentPattern, currentShift);

    // Apply the rotated patterns to the sequence steps
    for (let i = 0; i < currentSteps; i++) {
        if (!sequence.steps[i]) {
            sequence.steps[i] = {
                gate: false,
                accent: 0,
                ratchet: 0,
                probability: 100,
                deviation: 0,
                deviationMode: 1
            };
        }

        // Apply gate pattern
        sequence.steps[i].gate = gatePattern[i];

        // Reset modifiers
        sequence.steps[i].accent = 0;
        sequence.steps[i].ratchet = 0;
        sequence.steps[i].deviation = 0;

        // Only apply modifiers to gated steps
        if (sequence.steps[i].gate) {
            // Priority 1: Ratchet (highest priority)
            if (rotatedRatchetPattern[i]) {
                const ratchetValue = Math.max(0, Math.min(7, eucParams.ratchetSpeed - 1));
                sequence.steps[i].ratchet = ratchetValue;
            }
            // Priority 2: Flam (if not ratcheted)
            else if (rotatedFlamPattern[i]) {
                sequence.steps[i].deviation = 20;
                sequence.steps[i].deviationMode = 0; // Early deviation for flam
            }
            // Priority 3: Accent (if not ratcheted or flammed)
            else if (rotatedAccentPattern[i]) {
                sequence.steps[i].accent = 10;
                sequence.steps[i].deviation = eucParams.deviation || 0;
                sequence.steps[i].deviationMode = 1; // Late deviation for accents
            }
        }
    }

    // Clear any steps beyond the active length
    for (let i = currentSteps; i < 64; i++) {
        if (sequence.steps[i]) {
            sequence.steps[i].gate = false;
            sequence.steps[i].accent = 0;
            sequence.steps[i].ratchet = 0;
            sequence.steps[i].deviation = 0;
        }
    }
}

/**
 * Initialize euclidean parameters for all sequences
 * This should be called during app initialization
 */
export function initEuclidean() {
    // Initialize euclidean parameters for each sequence if not already present
    for (let i = 0; i < state.sequences.length; i++) {
        const sequence = state.sequences[i];

        if (!sequence.euclidean) {
            sequence.euclidean = {
                steps: sequence.length || 16,  // Match current sequence length
                fills: 0,               // Start with no fills (all gates off)
                shift: 0,               // No rotation
                accentAmt: 0,           // No accents by default
                flamAmt: 0,             // No flams by default
                ratchetAmt: 0,          // No ratchets by default
                ratchetSpeed: 1,        // Double-trigger speed
                deviation: 0            // No deviation by default
            };
        }
    }
}

/**
 * Set euclidean steps for a sequence
 * @param {number} voiceIndex - Voice/sequence index
 * @param {number} steps - Number of steps (1-16)
 */
export function setEuclideanSteps(voiceIndex, steps) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;

    const sequence = state.sequences[voiceIndex];
    if (!sequence.euclidean) return;

    steps = Math.max(1, Math.min(16, Math.round(steps)));
    sequence.euclidean.steps = steps;

    // Constrain fills if it exceeds new steps
    if (sequence.euclidean.fills > steps) {
        sequence.euclidean.fills = steps;
    }

    // Regenerate pattern
    updateEuclideanSequence(voiceIndex);
}

/**
 * Set euclidean fills for a sequence
 * @param {number} voiceIndex - Voice/sequence index
 * @param {number} fills - Number of fills (0-steps)
 */
export function setEuclideanFills(voiceIndex, fills) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;

    const sequence = state.sequences[voiceIndex];
    if (!sequence.euclidean) return;

    const maxFills = sequence.euclidean.steps;
    fills = Math.max(0, Math.min(maxFills, Math.round(fills)));
    sequence.euclidean.fills = fills;

    // Constrain decorations if they exceed new fills
    const totalDecorations = (sequence.euclidean.accentAmt || 0) +
                            (sequence.euclidean.flamAmt || 0) +
                            (sequence.euclidean.ratchetAmt || 0);

    if (totalDecorations > fills) {
        // Proportionally reduce decorations to fit within fills
        const scale = fills / totalDecorations;
        sequence.euclidean.accentAmt = Math.floor((sequence.euclidean.accentAmt || 0) * scale);
        sequence.euclidean.flamAmt = Math.floor((sequence.euclidean.flamAmt || 0) * scale);
        sequence.euclidean.ratchetAmt = Math.floor((sequence.euclidean.ratchetAmt || 0) * scale);
    }

    // Regenerate pattern
    updateEuclideanSequence(voiceIndex);
}

/**
 * Set euclidean shift/rotation for a sequence
 * @param {number} voiceIndex - Voice/sequence index
 * @param {number} shift - Rotation amount (0-steps)
 */
export function setEuclideanShift(voiceIndex, shift) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;

    const sequence = state.sequences[voiceIndex];
    if (!sequence.euclidean) return;

    const maxShift = sequence.euclidean.steps - 1;
    shift = Math.max(0, Math.min(maxShift, Math.round(shift)));
    sequence.euclidean.shift = shift;

    // Regenerate pattern
    updateEuclideanSequence(voiceIndex);
}

/**
 * Set accent amount for a sequence
 * @param {number} voiceIndex - Voice/sequence index
 * @param {number} amount - Number of accents (0-fills)
 */
export function setAccentAmount(voiceIndex, amount) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;

    const sequence = state.sequences[voiceIndex];
    if (!sequence.euclidean) return;

    const fills = sequence.euclidean.fills || 0;
    const flamAmt = sequence.euclidean.flamAmt || 0;
    const ratchetAmt = sequence.euclidean.ratchetAmt || 0;

    // Constrain: accent + flam + ratchet ≤ fills
    const maxAccent = fills - flamAmt - ratchetAmt;
    amount = Math.max(0, Math.min(maxAccent, Math.round(amount)));
    sequence.euclidean.accentAmt = amount;

    // Regenerate pattern
    updateEuclideanSequence(voiceIndex);
}

/**
 * Set flam amount for a sequence
 * @param {number} voiceIndex - Voice/sequence index
 * @param {number} amount - Number of flams (0-fills)
 */
export function setFlamAmount(voiceIndex, amount) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;

    const sequence = state.sequences[voiceIndex];
    if (!sequence.euclidean) return;

    const fills = sequence.euclidean.fills || 0;
    const accentAmt = sequence.euclidean.accentAmt || 0;
    const ratchetAmt = sequence.euclidean.ratchetAmt || 0;

    // Constrain: accent + flam + ratchet ≤ fills
    const maxFlam = fills - accentAmt - ratchetAmt;
    amount = Math.max(0, Math.min(maxFlam, Math.round(amount)));
    sequence.euclidean.flamAmt = amount;

    // Regenerate pattern
    updateEuclideanSequence(voiceIndex);
}

/**
 * Set ratchet amount for a sequence
 * @param {number} voiceIndex - Voice/sequence index
 * @param {number} amount - Number of ratchets (0-fills)
 */
export function setRatchetAmount(voiceIndex, amount) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;

    const sequence = state.sequences[voiceIndex];
    if (!sequence.euclidean) return;

    const fills = sequence.euclidean.fills || 0;
    const accentAmt = sequence.euclidean.accentAmt || 0;
    const flamAmt = sequence.euclidean.flamAmt || 0;

    // Constrain: accent + flam + ratchet ≤ fills
    const maxRatchet = fills - accentAmt - flamAmt;
    amount = Math.max(0, Math.min(maxRatchet, Math.round(amount)));
    sequence.euclidean.ratchetAmt = amount;

    // Regenerate pattern
    updateEuclideanSequence(voiceIndex);
}

/**
 * Set ratchet speed for a sequence
 * @param {number} voiceIndex - Voice/sequence index
 * @param {number} speed - Ratchet speed (1-8): 1=double, 2=triple, etc.
 */
export function setRatchetSpeed(voiceIndex, speed) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;

    const sequence = state.sequences[voiceIndex];
    if (!sequence.euclidean) return;

    speed = Math.max(1, Math.min(8, Math.round(speed)));
    sequence.euclidean.ratchetSpeed = speed;

    // Regenerate pattern
    updateEuclideanSequence(voiceIndex);
}

/**
 * Set deviation amount for accented steps
 * @param {number} voiceIndex - Voice/sequence index
 * @param {number} deviation - Deviation percentage (0-100)
 */
export function setDeviation(voiceIndex, deviation) {
    if (voiceIndex < 0 || voiceIndex >= state.sequences.length) return;

    const sequence = state.sequences[voiceIndex];
    if (!sequence.euclidean) return;

    deviation = Math.max(0, Math.min(100, Math.round(deviation)));
    sequence.euclidean.deviation = deviation;

    // Regenerate pattern
    updateEuclideanSequence(voiceIndex);
}
