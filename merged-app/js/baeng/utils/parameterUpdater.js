// File: js/utils/parameterUpdater.js
// Centralized parameter update utility for undo/redo and other operations

import { state, parameterDefinitions, setParameterValue } from '../state.js';
import { updateEngineParams } from '../modules/engine.js';

/**
 * Update a parameter and its UI representation
 * Used by undo/redo system and other bulk parameter updates
 * @param {string} paramId - Parameter identifier
 * @param {*} value - New value
 * @returns {boolean} Success status
 */
export function updateParameterById(paramId, value) {
    // Set the parameter value
    if (!setParameterValue(paramId, value)) {
        console.warn(`Failed to set parameter ${paramId} to ${value}`);
        return false;
    }

    // Update visual elements will be handled by main updateAllUI()
    // Individual parameter UI updates are complex and best left to the full UI update

    return true;
}

/**
 * Get parameter value from state path
 * @param {string} paramId - Parameter identifier
 * @returns {*} Parameter value
 */
export function getParameterValueFromState(paramId) {
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) return null;

    let path = paramDef.statePath;
    if (path.includes('[selectedVoice]')) {
        path = path.replace('[selectedVoice]', state.selectedVoice);
    }

    const pathParts = path.split('.');
    let value = state;

    for (const part of pathParts) {
        if (part.includes('[') && part.includes(']')) {
            const arrayName = part.substring(0, part.indexOf('['));
            const indexStr = part.substring(part.indexOf('[') + 1, part.indexOf(']'));
            const index = parseInt(indexStr, 10);
            value = value[arrayName][index];
        } else {
            value = value[part];
        }
    }

    return value;
}
