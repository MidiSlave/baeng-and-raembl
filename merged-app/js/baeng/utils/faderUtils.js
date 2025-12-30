// File: js/utils/faderUtils.js
// Dynamic fader range utilities for Bæng
// Provides dynamic min/max ranges for euclidean parameters

import { parameterDefinitions } from '../state.js';

/**
 * Get dynamic min/max range for a parameter
 * @param {string} paramId - The parameter ID (e.g., 'euclidean.fills')
 * @param {object} appState - The application state
 * @returns {object} - Object with min and max properties
 */
export function getParameterRange(paramId, appState) {
    // Start with static definition from state.js as fallback
    const paramDef = parameterDefinitions[paramId];
    let min = paramDef?.min ?? 0;
    let max = paramDef?.max ?? 100;

    const voiceIndex = appState?.selectedVoice;
    if (voiceIndex === null || voiceIndex === undefined || voiceIndex < 0 || !appState?.sequences || voiceIndex >= appState.sequences.length) {
        // No valid voice selected - return static definition
        return { min, max };
    }

    const sequence = appState.sequences[voiceIndex];
    const eucParams = sequence?.euclidean || {};

    // Override with dynamic ranges for specific euclidean parameters
    switch (paramId) {
        case 'euclidean.fills':
            min = 0;
            max = Math.max(1, Math.min(eucParams.steps || 16, 16));
            break;
        case 'euclidean.shift':
            min = 0;
            max = Math.max(0, (eucParams.steps || 16) - 1);
            break;
        case 'euclidean.accentAmt':
            // Accent max = fills - flam - ratchet
            min = 0;
            const flamForAccent = eucParams.flamAmt || 0;
            const ratchetForAccent = eucParams.ratchetAmt || 0;
            max = Math.max(0, (eucParams.fills || 0) - flamForAccent - ratchetForAccent);
            break;
        case 'euclidean.flamAmt':
            // Flam max = fills - accent - ratchet
            min = 0;
            const accentForFlam = eucParams.accentAmt || 0;
            const ratchetForFlam = eucParams.ratchetAmt || 0;
            max = Math.max(0, (eucParams.fills || 0) - accentForFlam - ratchetForFlam);
            break;
        case 'euclidean.ratchetAmt':
            // Ratchet max = fills - accent - flam
            min = 0;
            const accentForRatchet = eucParams.accentAmt || 0;
            const flamForRatchet = eucParams.flamAmt || 0;
            max = Math.max(0, (eucParams.fills || 0) - accentForRatchet - flamForRatchet);
            break;
        // For euclidean.steps and other params, use the static definition already set above
    }

    return { min, max };
}
