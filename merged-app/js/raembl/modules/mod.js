// File: js/modules/mod.js
// Mod module (delegates to modlfo.js implementation)
import { initModLfo } from './modlfo.js';

// Initialize mod module
export function initMod() {
    // Delegate to the new implementation
    initModLfo();
}