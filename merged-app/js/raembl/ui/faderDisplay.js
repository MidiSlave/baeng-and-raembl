// File: js/ui/faderDisplay.js
// Fader display management - UPDATED for Delay Sync/Free and Mod LFO Wave Icons
// CORRECTED import for delayDivisionsValues
import { getFrequencyHz } from '../modules/lfo.js';
import { getCurrentScaleName, getCurrentRootName } from '../modules/path.js';
import { getWaveformIcon as getModLfoWaveformIcon } from '../modules/modlfo.js';
import { state } from '../state.js';
import { mapRange } from '../utils.js';
import { delayDivisionsValues } from '../audio/effects.js'; // Import the actual values from effects.js

// Helper function to get main LFO waveform SVG icons (if you want to use SVGs for main LFO too)
// For now, main LFO uses text/morphing description. This is a placeholder if you change that.
function getMainLfoWaveformIcon(waveValue) {
    // This is a simplified example. Your actual main LFO morphs.
    // You might need more complex logic or a different display approach for the main LFO.
    const numShapes = 4; // Sin, Tri, Sqr, Saw
    const shapeIndex = Math.floor((waveValue / 100) * numShapes);
    const icons = [
        `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,6 C4,2 8,2 12,6 C16,10 20,10 23,6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`, // SIN
        `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,7 L7,2 L12,7 L17,12 L23,7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`, // TRI (example)
        `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,10 L1,10 L7,10 L7,2 L17,2 L17,10 L23,10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`, // SQR
        `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,10 L12,2 L12,10 L23,2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`  // SAW (example)
    ];
    return icons[Math.min(shapeIndex, icons.length - 1)] || "Wave";
}


// Update fader value display
export function updateFaderDisplay(label, value, element) {
    if (!element) return;

    // Format display based on parameter
    switch (label) {
        case 'BPM': element.textContent = Math.round(value); break;
        case 'SWING': element.textContent = `${Math.round(value)}%`; break;
        case 'LENGTH': element.textContent = Math.max(1, Math.round(value)); break;

        case 'STEPS': element.textContent = Math.max(1, Math.round(value)); break;
        case 'FILLS': element.textContent = Math.max(0, Math.round(value)); break;
        case 'SHIFT': element.textContent = Math.max(0, Math.round(value)); break;
        case '>': element.textContent = `${Math.round(value)}%`; break;
        case 'SLIDE': element.textContent = `${Math.round(value)}%`; break;

        case 'AMP': element.textContent = Math.round(value); break;
        case 'FREQ':
            element.textContent = `${Math.round(getFrequencyHz() * 10) / 10}Hz`;
            break;
        case 'WAVE':
            if (element.closest('#raembl-mod')) {
                const waveIndex = Math.round(value / 25);
                element.innerHTML = getModLfoWaveformIcon(waveIndex);
                element.classList.add('waveform-icon');
            } else if (element.closest('#raembl-lfo')) {
                const numShapes = 4;
                const clampedValue = Math.min(value, 99.999);
                const shapeIndex1 = Math.floor(clampedValue / (100 / numShapes));
                const shapes = ["Sin", "Tri", "Sqr", "Saw"];
                element.textContent = shapes[shapeIndex1];
                element.classList.remove('waveform-icon');
            }
            break;

        case 'OFFSET': element.textContent = Math.round(value); break;

        case 'SCALE': element.textContent = getCurrentScaleName(); break;
        case 'ROOT': element.textContent = getCurrentRootName(); break;
        case 'PROB': element.textContent = `${Math.round(value)}%`; break;

        case 'OCT':
        case 'SUB OCT':
            const transpositionOptions = ['-2o', '-1.5o', '-1o', '-.7o', '0', '+.7o', '+1o', '+1.5o', '+2o'];
            element.textContent = transpositionOptions[Math.round(value)];
            break;

        case 'PRED':
            const maxPreDelayMs = 200;
            const msPred = Math.round((value / 100) * maxPreDelayMs);
            element.textContent = `${msPred}ms`;
            break;

        case 'TIME':
            if (element.closest('#raembl-delay')) {
                if (state.delaySyncEnabled) {
                    const delayDivDescriptions = [
                        "1/32", "1/16", "1/16T", "1/8", "1/8T", "1/16D",
                        "1/4", "1/4T", "1/8D", "1/2", "1/4D", "1"
                    ];
                    const index = Math.min(Math.floor(value / (100 / delayDivisionsValues.length)), delayDivisionsValues.length - 1);
                    let displayValue = delayDivDescriptions[index] || "Div";

                    if (index >= 0 && index < delayDivisionsValues.length && delayDivisionsValues[index] === 1) {
                        const bpm = state?.bpm || 120;
                        const ms = (bpm > 0) ? Math.round(60000 / bpm) : 0;
                        displayValue = `1 (${ms}ms)`;
                    }
                    element.textContent = displayValue;
                } else {
                    const minMs = 1;
                    const maxMs = 4000;
                    const freeMs = mapRange(value, 0, 100, minMs, maxMs, true);
                    element.textContent = `${Math.round(freeMs)}ms`;
                }
            }
            break;

        case 'RATE':
            if (element.closest('#raembl-mod')) {
                element.textContent = `${Math.round(value)}%`;
            }
            break;

        default:
            if (element.closest('#raembl-reverb') || element.closest('#raembl-delay') ||
                ['WIDTH', 'DRIFT', 'GLIDE', 'PWM', 'MOD', '◢', '⊓', '△', '■', '≋',
                 'HP', 'LP', 'RES', 'KEY', 'ENV', 'A', 'D', 'S', 'R', 'VOL', 'FDBK', 'WOW', 'FLUT', 'SAT', 'DEC', 'DIFF', 'DAMP'].includes(label)) {
                element.textContent = `${Math.round(value)}%`;
            } else {
                element.textContent = Math.round(value);
            }
    }
}