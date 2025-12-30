// File: js/components/index.js
// Component rendering functions

import { state, parameterDefinitions } from '../state.js';
import { config } from '../config.js';
import { ENGINE_MACROS } from '../modules/engines.js';
import { sampleBankManager } from '../modules/sampler/sampler-engine.js';
import { generateEngineDropdownHTML } from './engine-dropdown.js';
import { renderCloudsModuleHTML, setupCloudsEventHandlers, updateCloudsVisibility } from '../modules/clouds.js';
import { updateFXMode } from '../modules/engine.js';

// Helper function to get display name for engine type
function getEngineDisplayName(engineType) {
    const displayNames = {
        'DX7': 'DX7',
        'SAMPLE': 'SMPL',
        'SLICE': 'SLCE',
        'aKICK': 'aKCK',
        'aSNARE': 'aSNR',
        'aHIHAT': 'aHAT'
    };
    return displayNames[engineType] || engineType;
}

// Helper function to get knob labels for engine type
function getEngineKnobLabels(engineType) {
    // Check if engine has macros defined
    const engineMacros = ENGINE_MACROS[engineType];


    if (engineMacros) {
        // Return labels from ENGINE_MACROS
        // PATCH, DEPTH, RATE are engine-specific
        // PITCH and LEVEL are always the same
        const labels = {
            patch: engineMacros.PATCH?.label || 'PATCH',
            pitch: 'PITCH', // Always PITCH, never changes
            depth: engineMacros.DEPTH?.label || 'DEPTH',
            rate: engineMacros.RATE?.label || 'RATE'
        };
        return labels;
    }

    // Default labels for engines without specific macros
    return {
        patch: 'PATCH',
        pitch: 'PITCH',
        depth: 'DEPTH',
        rate: 'RATE'
    };
}

// Helper function to get voice shape SVG icon
function getVoiceIconSVG(voiceIdx) {
    const icons = [
        `<svg class="voice-icon" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5"/></svg>`,
        `<svg class="voice-icon" viewBox="0 0 14 14"><polygon points="7,2 2,11.5 12,11.5"/></svg>`,
        `<svg class="voice-icon" viewBox="0 0 14 14"><rect x="2" y="2" width="10" height="10"/></svg>`,
        `<svg class="voice-icon" viewBox="0 0 14 14"><polygon points="3.5,2 12,2 10.5,12 2,12"/></svg>`,
        `<svg class="voice-icon" viewBox="0 0 14 14"><polygon points="7,2 12,7 7,12 2,7"/></svg>`,
        `<svg class="voice-icon" viewBox="0 0 14 14"><polygon points="7,2 11.3,4.5 11.3,9.5 7,12 2.7,9.5 2.7,4.5"/></svg>`
    ];
    return icons[voiceIdx] || icons[0];
}

// Helper function to get load button title based on engine
function getLoadButtonTitle(engineType) {
    if (engineType === 'DX7') return 'DX7 Bank';
    if (engineType === 'SAMPLE') return 'Sample Folder';
    if (engineType === 'SLICE') return 'Sample + Slices';
    return 'Bank'; // Analog engines
}

// Render all modules
export function renderModules() {
    const mainRow = document.getElementById('baeng-main-row');
    if (!mainRow) {
        return;
    }

    mainRow.innerHTML = ''; // Clear existing content

    // TIME module removed - now using shared time strip at bottom
    renderVoicesModule(mainRow);
    renderEngineModule(mainRow);
    renderCloudsModule(mainRow);
    renderReverbModule(mainRow);
    renderDelayModule(mainRow);
    renderBusModule(mainRow);

    // Update visibility based on fxMode
    updateCloudsVisibility();
}

// TIME module removed - timing controls now in shared time strip at bottom of page

// Render VOICES module
export function renderVoicesModule(container) {
    const module = document.createElement('div');
    module.id = 'voices';
    module.className = 'module';

    // Build stacked sequencer grid - all 6 voices visible
    let stackedSequencerHTML = '';

    for (let voiceIdx = 0; voiceIdx < state.voices.length; voiceIdx++) {
        const sequence = state.sequences[voiceIdx];
        const isSelected = voiceIdx === state.selectedVoice;
        const stepsToShow = sequence.euclidean ? sequence.euclidean.steps : 16;

        // Build steps for this voice
        let stepsHTML = '';
        for (let stepIdx = 0; stepIdx < stepsToShow; stepIdx++) {
            const stepData = stepIdx < sequence.steps.length ? sequence.steps[stepIdx] :
                { gate: false, accent: 0, ratchet: 0, deviation: 0, deviationMode: 1, probability: 100 };
            const isActive = state.isPlaying && sequence.currentStep === stepIdx;
            const hasGate = stepData.gate;
            const hasAccent = stepData.accent > 0;
            const hasRatchet = stepData.ratchet > 0;
            const hasDeviation = stepData.deviation > 0;
            // Flam is represented as deviation=20 with deviationMode=0 (early)
            const hasFlam = stepData.deviation === 20 && stepData.deviationMode === 0;

            let tooltipParts = [];
            if (hasGate) {
                tooltipParts.push('Gate: ON');
                if (hasAccent) tooltipParts.push(`Accent: ${stepData.accent}`);
                if (hasRatchet) tooltipParts.push(`Ratchet: ${stepData.ratchet + 1}x`);
                if (hasFlam) tooltipParts.push('Flam');
                if (hasDeviation) {
                    const mode = ['Early', 'Late', 'Both'][stepData.deviationMode];
                    tooltipParts.push(`Dev: ${stepData.deviation}% (${mode})`);
                }
                tooltipParts.push(`Prob: ${stepData.probability}%`);
            } else {
                tooltipParts.push('Gate: OFF');
            }

            const ratchetCount = stepData.ratchet + 1;
            const probabilityValue = stepData.probability;
            const deviationValue = stepData.deviation;

            // Determine pattern type and sub-step count
            let patternType = 'no-accent';
            let subStepCount = 1;

            if (hasFlam) {
                patternType = 'flam';
                subStepCount = 2;
            } else if (hasAccent && !hasRatchet) {
                patternType = 'accent';
                subStepCount = 1;
            } else if (hasRatchet) {
                patternType = `r${stepData.ratchet + 1}`;
                subStepCount = stepData.ratchet + 1;
            }

            // Debug logging for all voices to see ratchet values
            if (hasGate && hasRatchet) {
            }

            // Generate sub-steps
            let subStepsHTML = '';
            for (let i = 0; i < subStepCount; i++) {
                let subStepClass = 'sub-step';
                if (patternType === 'accent') subStepClass += ' accent-box';
                // Flam: first box is small, second is large
                if (patternType === 'flam' && i === 0) subStepClass += ' small-flam';
                if (patternType === 'flam' && i === 1) subStepClass += ' large-flam';
                // No-accent: make it smaller than accent
                if (patternType === 'no-accent') subStepClass += ' no-accent-box';

                subStepsHTML += `<div class="${subStepClass}"></div>`;
            }

            // Build container
            stepsHTML += `
                <div class="step-container
                            ${isActive ? 'active' : ''}
                            ${hasGate ? 'gate' : ''}
                            ${hasAccent ? 'accented' : ''}
                            ${hasRatchet ? 'ratchet' : ''}
                            ${hasDeviation ? 'deviated' : ''}
                            ${hasFlam ? 'flam' : ''}"
                     data-pattern="${patternType}"
                     data-voice="${voiceIdx}"
                     data-step="${stepIdx}"
                     data-probability="${probabilityValue}"
                     data-ratchet="${stepData.ratchet}"
                     data-deviation="${deviationValue}"
                     data-deviation-mode="${stepData.deviationMode}"
                     style="--probability: ${probabilityValue}; --ratchet-count: ${ratchetCount}; --deviation-amount: ${deviationValue}"
                     title="${tooltipParts.join(' | ')}">
                    ${subStepsHTML}
                </div>`;
        }

        stackedSequencerHTML += `
            <div class="voice-row ${isSelected ? 'selected' : ''}" data-voice="${voiceIdx}">
                <button class="voice-selector ${isSelected ? 'active' : ''} ${state.voices[voiceIdx]?.muted ? 'muted' : ''}"
                        data-index="${voiceIdx}"
                        title="Voice ${voiceIdx + 1}">
                    ${getVoiceIconSVG(voiceIdx)}
                </button>
                <div class="sequence-row">${stepsHTML}</div>
            </div>`;
    }

    // Get selected voice params for controls below
    const voiceIndex = state.selectedVoice;
    const sequence = state.sequences[voiceIndex];
    const eucParams = sequence.euclidean || { steps: 16, fills: 0, shift: 0, accentAmt: 0, flamAmt: 0, ratchetAmt: 0, ratchetSpeed: 1, deviation: 0 };

    module.innerHTML = `
        <div class="module-header-container">
            <button class="randomize-button" data-module="voices" data-info-id="baeng-voices-randomize" title="Randomize Voice Parameters">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
                    <circle cx="3.5" cy="3.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="3.5" r="0.8" fill="currentColor"/>
                    <circle cx="3.5" cy="7" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="7" r="0.8" fill="currentColor"/>
                    <circle cx="3.5" cy="10.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="10.5" r="0.8" fill="currentColor"/>
                </svg>
            </button>
            <button class="toggle-button seq-reset square ${state.resetSequenceOnBar ? 'active' : ''}" data-info-id="baeng-voices-seq-reset" title="Reset Sequence on Bar">SEQ</button>
            <div class="module-header" data-info-id="baeng-module-voices">VOICES</div>
            <div class="voice-patch-controls">
                <button class="voice-patch-button save-voice-patch-button" data-info-id="baeng-voices-save" title="Save Voice Patch">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                </button>
                <button class="voice-patch-button load-voice-patch-button" data-info-id="baeng-voices-load" title="Load Voice Patch">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
            </div>
        </div>

        <!-- NEW: Stacked sequencer showing all 6 voices -->
        <div class="sequence-grid stacked">${stackedSequencerHTML}</div>

        <!-- Row 1: STEPS, FILLS, SHIFT, ACCENT, FLAM -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-voices-steps">
                <div class="knob-label">STEPS</div>
                <div class="led-ring-knob" data-mode="discrete" data-param-id="euclidean.steps">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${eucParams.steps}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-voices-fills">
                <div class="knob-label">FILLS</div>
                <div class="led-ring-knob" data-mode="discrete" data-param-id="euclidean.fills">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${eucParams.fills}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-voices-shift">
                <div class="knob-label">SHIFT</div>
                <div class="led-ring-knob" data-mode="discrete" data-param-id="euclidean.shift">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${eucParams.shift}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-voices-accent">
                <div class="knob-label">ACCENT</div>
                <div class="led-ring-knob" data-mode="discrete" data-param-id="euclidean.accentAmt">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${eucParams.accentAmt}/${eucParams.fills}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-voices-flam">
                <div class="knob-label">FLAM</div>
                <div class="led-ring-knob" data-mode="discrete" data-param-id="euclidean.flamAmt">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${eucParams.flamAmt}/${eucParams.fills}</div>
            </div>
        </div>

        <!-- Row 2: RATCHET, R-SPD, GATE, PROB, CHOKE -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-voices-ratchet">
                <div class="knob-label">RATCHET</div>
                <div class="led-ring-knob" data-mode="discrete" data-param-id="euclidean.ratchetAmt">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${eucParams.ratchetAmt}/${eucParams.fills}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-voices-rspd">
                <div class="knob-label">R-SPD</div>
                <div class="led-ring-knob" data-mode="discrete" data-param-id="euclidean.ratchetSpeed">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${eucParams.ratchetSpeed}x</div>
            </div>
            <div class="knob-container" data-info-id="baeng-voices-gate">
                <div class="knob-label">GATE</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="voice.gate">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.voices[voiceIndex].gate ?? 80}%</div>
            </div>
            <div class="knob-container" data-info-id="baeng-voices-prob">
                <div class="knob-label">PROB</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="sequence.probability">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${sequence.probability}%</div>
            </div>
            <div class="knob-container" data-info-id="baeng-voices-choke">
                <div class="knob-label">CHOKE</div>
                <div class="led-ring-knob" data-mode="discrete" data-param-id="voice.chokeGroup">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.voices[voiceIndex].chokeGroup === 0 ? 'OFF' : 'GRP ' + state.voices[voiceIndex].chokeGroup}</div>
            </div>
        </div>
    `;
    container.appendChild(module);
}

// Render ENGINE module
export function renderEngineModule(container) {
    const module = document.createElement('div');
    module.id = 'baeng-engine';
    module.className = 'module';
    const voice = state.voices[state.selectedVoice];

    // Get current DX7 patch info if loaded
    const patchName = voice.dx7PatchName || 'No Patch';
    const patchNum = voice.dx7PatchIndex !== undefined ? voice.dx7PatchIndex : 0;
    const bankSize = voice.dx7BankSize || 32;

    // Get engine-specific knob labels
    const knobLabels = getEngineKnobLabels(voice.engine);

    // Helper function to calculate knob rotation (-135deg to +135deg for 0-100 range)
    const getKnobRotation = (value) => {
        const percent = value / 100;
        const degrees = -135 + (percent * 270); // -135° to +135° = 270° range
        return degrees;
    };

    // Calculate sample knob values for SAMPLE engine
    let sampleKnobRotation = 0;
    let sampleKnobName = '0/0';
    if (voice.engine === 'SAMPLE') {
        // Use per-voice buffer array (NOT global manager)
        const voiceSampleBank = voice.samplerBuffer;
        const bankSampleCount = voiceSampleBank?.length || 0;
        const sampleIndex = voice.sampleIndex !== undefined ? voice.sampleIndex : 0;
        const percent = bankSampleCount > 1 ? sampleIndex / (bankSampleCount - 1) : 0;
        sampleKnobRotation = -135 + (percent * 270);
        // Display index-only format for compact display
        sampleKnobName = `${sampleIndex + 1}/${bankSampleCount}`;
    }

    // Calculate slice knob values for SLICE engine
    let sliceKnobRotation = 0;
    let sliceKnobName = '0/0';
    if (voice.engine === 'SLICE' && voice.sliceConfig && voice.sliceConfig.slices) {
        const sliceCount = voice.sliceConfig.slices.length;
        const sliceIndex = Math.floor(voice.sliceIndex !== undefined ? voice.sliceIndex : 0);
        const percent = sliceCount > 1 ? sliceIndex / (sliceCount - 1) : 0;
        sliceKnobRotation = -135 + (percent * 270);
        sliceKnobName = `${sliceIndex}/${sliceCount - 1}`;
    }

    module.innerHTML = `
        <div class="module-header-container">
            <button class="randomize-button" data-info-id="baeng-engine-randomize" title="Randomize Voice Parameters">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
                    <circle cx="3.5" cy="3.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="3.5" r="0.8" fill="currentColor"/>
                    <circle cx="3.5" cy="7" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="7" r="0.8" fill="currentColor"/>
                    <circle cx="3.5" cy="10.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="10.5" r="0.8" fill="currentColor"/>
                </svg>
            </button>
            ${(voice.engine === 'DX7' || voice.engine === 'SAMPLE') ? `
            <button class="polyphony-button ${(voice.polyphonyMode > 0) ? 'active' : ''}"
                    data-mode="${voice.polyphonyMode || 0}"
                    data-info-id="baeng-engine-poly"
                    title="Polyphony: ${['Mono', '2-voice', '3-voice', '4-voice'][voice.polyphonyMode || 0]}">
                ${['M', 'P2', 'P3', 'P4'][voice.polyphonyMode || 0]}
            </button>
            ` : ''}
            ${(voice.engine === 'aKICK' || voice.engine === 'aSNARE' || voice.engine === 'aHIHAT') ? `
            <button class="output-mode-button ${voice.outputMode === 'AUX' ? 'active' : ''}"
                    data-mode="${voice.outputMode || 'OUT'}"
                    data-info-id="baeng-engine-output"
                    title="Output Mode: ${voice.outputMode === 'AUX' ? '909-style (AUX)' : '808-style (OUT)'}">
                ${voice.outputMode || 'OUT'}
            </button>
            ` : ''}
            <div class="module-header" data-info-id="baeng-module-engine">
                ${generateEngineDropdownHTML(voice.engine)}
            </div>
            ${voice.engine === 'SLICE' ? `
            <button class="sample-browse-button" data-info-id="baeng-engine-browse" title="Browse Samples">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                </svg>
            </button>
            <button class="slice-edit-button" data-info-id="baeng-engine-slice-edit" title="Edit Slices">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="6" cy="6" r="3"/>
                    <circle cx="6" cy="18" r="3"/>
                    <line x1="20" y1="4" x2="8.12" y2="15.88"/>
                    <line x1="14.47" y1="14.48" x2="20" y2="20"/>
                    <line x1="8.12" y1="8.12" x2="12" y2="12"/>
                </svg>
            </button>
            ` : voice.engine === 'DX7' ? `
            <button class="dx7-browse-button" data-info-id="baeng-engine-dx7-browse" title="Browse DX7 Banks">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                </svg>
            </button>
            ` : voice.engine === 'SAMPLE' ? `
            <button class="kit-browse-button" data-info-id="baeng-engine-kit-browse" title="Browse Sample Kits">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                </svg>
            </button>
            ` : ''}
            <label for="persistent-engine-file-input" class="dx7-load-button" title="Load ${getLoadButtonTitle(voice.engine)}" style="cursor: pointer; ${voice.engine === 'SAMPLE' ? 'display: none;' : ''}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                    <polyline points="13 2 13 9 20 9"/>
                </svg>
            </label>
        </div>

        <!-- Oscilloscope - matches knob row width (5×38 + 4×4 = 206px) -->
        <canvas id="baeng-engine-oscilloscope" width="206" height="100"></canvas>

        <!-- Row 1: PATCH, PITCH, DEPTH, RATE, LEVEL -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-engine-tone">
                <div class="knob-label">${knobLabels.patch}</div>
                ${voice.engine === 'DX7'
                    ? `<div class="led-ring-knob dx7-patch-knob" data-mode="continuous" data-param-id="voice.dx7PatchIndex">
                        <canvas width="100" height="100"></canvas>
                    </div>
                    <div class="knob-value dx7-patch-name">${patchName}</div>`
                    : voice.engine === 'SAMPLE'
                    ? `<div class="led-ring-knob sample-knob" data-mode="continuous" data-param-id="voice.samplerNote">
                        <canvas width="100" height="100"></canvas>
                    </div>
                    <div class="knob-value sample-name">${sampleKnobName}</div>`
                    : voice.engine === 'SLICE'
                    ? `<div class="led-ring-knob slice-knob" data-mode="continuous" data-param-id="voice.macroPatch">
                        <canvas width="100" height="100"></canvas>
                    </div>
                    <div class="knob-value slice-name">${sliceKnobName}</div>`
                    : `<div class="led-ring-knob" data-mode="continuous" data-param-id="voice.macroPatch">
                        <canvas width="100" height="100"></canvas>
                    </div>
                    <div class="knob-value">${voice.macroPatch !== undefined ? voice.macroPatch : 50}</div>`
                }
            </div>
            <div class="knob-container" data-info-id="baeng-engine-pitch">
                <div class="knob-label">${knobLabels.pitch}</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="voice.macroPitch">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${voice.macroPitch !== undefined ? voice.macroPitch : 50}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-engine-decay">
                <div class="knob-label">${knobLabels.depth}</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="voice.macroDepth">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${voice.macroDepth !== undefined ? voice.macroDepth : 50}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-engine-sweep">
                <div class="knob-label">${knobLabels.rate}</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="voice.macroRate">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${voice.macroRate !== undefined ? voice.macroRate : 50}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-engine-level">
                <div class="knob-label">LEVEL</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="voice.level">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${voice.level}</div>
            </div>
        </div>

        <!-- Row 2: Voice Parameters (sends change based on FX mode) -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-engine-pan">
                <div class="knob-label">PAN</div>
                <div class="led-ring-knob" data-mode="bipolar" data-param-id="voice.pan">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${voice.pan === 50 ? 'C' : (voice.pan < 50 ? 'L' + Math.round((50 - voice.pan) * 2) : 'R' + Math.round((voice.pan - 50) * 2))}</div>
            </div>
            ${state.fxMode === 'clouds' ? `
            <!-- Clouds mode: single CLOUD send knob -->
            <div class="knob-container" data-info-id="baeng-engine-cloud">
                <div class="knob-label">CLOUD</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="voice.cloudsSend">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${voice.cloudsSend}</div>
            </div>
            ` : `
            <!-- Classic mode: RVB and DLY send knobs -->
            <div class="knob-container" data-info-id="baeng-engine-rvb">
                <div class="knob-label">RVB</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="voice.reverbSend">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${voice.reverbSend}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-engine-dly">
                <div class="knob-label">DLY</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="voice.delaySend">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${voice.delaySend}</div>
            </div>
            `}
            <div class="knob-container" data-info-id="baeng-engine-bit">
                <div class="knob-label">BIT</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="voice.bitReduction">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${voice.bitReduction}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-engine-drive">
                <div class="knob-label">DRIVE</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="voice.drive">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${voice.drive}</div>
            </div>
        </div>
    `;
    container.appendChild(module);
}

// Render REVERB module
function renderReverbModule(container) {
    const module = document.createElement('div');
    module.id = 'reverb-fx';
    module.className = 'module';

    module.innerHTML = `
        <div class="module-header-container">
            <button class="randomize-button" data-module="reverb" data-info-id="baeng-rvb-randomize" title="Randomize Reverb Parameters">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
                    <circle cx="3.5" cy="3.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="3.5" r="0.8" fill="currentColor"/>
                    <circle cx="3.5" cy="7" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="7" r="0.8" fill="currentColor"/>
                    <circle cx="3.5" cy="10.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="10.5" r="0.8" fill="currentColor"/>
                </svg>
            </button>
            <div class="module-header" data-info-id="baeng-module-reverb">RVB</div>
            <button class="duck-btn" data-effect="baengReverb" data-info-id="baeng-rvb-duck" title="Sidechain Ducking">
                <svg width="14" height="14" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.406,25.591c0,0 2.059,0.83 1.986,2.891c-0.072,2.062 -6.66,2.957 -6.66,11.094c0,8.137 9.096,14.532 19.217,14.532c10.12,0 23.872,-5.932 23.872,-17.83c0,-19.976 -1.513,-6.134 -17.276,-6.134c-5.235,0 -6.169,-1.787 -5.342,-2.806c3.91,-4.811 5.342,-17.446 -7.42,-17.446c-8.327,0.173 -10.338,6.946 -10.325,8.587c0.008,1.153 -1.204,1.543 -7.308,1.308c-1.536,5.619 9.256,5.804 9.256,5.804Zm3.77,-10.366c1.104,0 2,0.897 2,2c0,1.104 -0.896,2 -2,2c-1.103,0 -2,-0.896 -2,-2c0,-1.103 0.897,-2 2,-2Z"/>
                </svg>
            </button>
        </div>
        <!-- Canvas matches knob row width -->
        <canvas id="baeng-reverb-canvas" width="80" height="100"></canvas>

        <!-- Row 1: PRED, DEC -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-rvb-pred">
                <div class="knob-label">PRED</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.reverbPreDelay">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.reverbPreDelay}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-rvb-dec">
                <div class="knob-label">DEC</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.reverbDecay">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.reverbDecay}</div>
            </div>
        </div>

        <!-- Row 2: DIFF, DAMP -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-rvb-diff">
                <div class="knob-label">DIFF</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.reverbDiffusion">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.reverbDiffusion}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-rvb-damp">
                <div class="knob-label">DAMP</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.reverbDamping">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.reverbDamping}</div>
            </div>
        </div>
    `;
    container.appendChild(module);
}

// Render DELAY module
function renderDelayModule(container) {
    const module = document.createElement('div');
    module.id = 'delay-fx';
    module.className = 'module';

    const syncLabel = state.delaySyncEnabled ? 'SYNC' : 'FREE';
    const timeValue = state.delaySyncEnabled ? state.delayTime : state.delayTimeFree;

    module.innerHTML = `
        <div class="module-header-container">
            <button class="randomize-button" data-module="delay" data-info-id="baeng-dly-randomize" title="Randomize Delay Parameters">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
                    <circle cx="3.5" cy="3.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="3.5" r="0.8" fill="currentColor"/>
                    <circle cx="3.5" cy="7" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="7" r="0.8" fill="currentColor"/>
                    <circle cx="3.5" cy="10.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="10.5" r="0.8" fill="currentColor"/>
                </svg>
            </button>
            <div class="module-header" data-info-id="baeng-module-delay">DLY</div>
            <button class="duck-btn" data-effect="baengDelay" data-info-id="baeng-dly-duck" title="Sidechain Ducking">
                <svg width="14" height="14" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.406,25.591c0,0 2.059,0.83 1.986,2.891c-0.072,2.062 -6.66,2.957 -6.66,11.094c0,8.137 9.096,14.532 19.217,14.532c10.12,0 23.872,-5.932 23.872,-17.83c0,-19.976 -1.513,-6.134 -17.276,-6.134c-5.235,0 -6.169,-1.787 -5.342,-2.806c3.91,-4.811 5.342,-17.446 -7.42,-17.446c-8.327,0.173 -10.338,6.946 -10.325,8.587c0.008,1.153 -1.204,1.543 -7.308,1.308c-1.536,5.619 9.256,5.804 9.256,5.804Zm3.77,-10.366c1.104,0 2,0.897 2,2c0,1.104 -0.896,2 -2,2c-1.103,0 -2,-0.896 -2,-2c0,-1.103 0.897,-2 2,-2Z"/>
                </svg>
            </button>
            <button class="delay-sync-toggle ${state.delaySyncEnabled ? 'active' : ''}"
                    title="Toggle Sync/Free Mode" data-info-id="baeng-dly-sync">${syncLabel}</button>
        </div>
        <canvas id="baeng-delay-canvas" width="120" height="100"></canvas>

        <!-- Row 1: TIME, FDBK, FILT -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-dly-time">
                <div class="knob-label">TIME</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="${state.delaySyncEnabled ? 'effects.delayTime' : 'effects.delayTimeFree'}">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${timeValue}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-dly-fdbk">
                <div class="knob-label">FDBK</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.delayFeedback">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.delayFeedback}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-dly-filt">
                <div class="knob-label">FILT</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.delayFilter">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.delayFilter}</div>
            </div>
        </div>

        <!-- Row 2: WOW, FLUT, SAT -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-dly-wow">
                <div class="knob-label">WOW</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.delayWow">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.delayWow}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-dly-flut">
                <div class="knob-label">FLUT</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.delayFlutter">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.delayFlutter}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-dly-sat">
                <div class="knob-label">SAT</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.delaySaturation">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.delaySaturation}</div>
            </div>
        </div>
    `;
    container.appendChild(module);
}

// Render CLOUDS module (granular processor - replaces RVB/DLY when fxMode === 'clouds')
function renderCloudsModule(container) {
    const module = document.createElement('div');
    module.id = 'baeng-clouds-fx';
    module.className = 'module hidden'; // Hidden by default, shown via updateCloudsVisibility()

    module.innerHTML = renderCloudsModuleHTML();
    container.appendChild(module);

    // Setup event handlers after module is in DOM
    setupCloudsEventHandlers();
}

// Render WAVEGUIDE module
function renderWaveguideModule(container) {
    const module = document.createElement('div');
    module.id = 'waveguide-fx';
    module.className = 'module';
    module.innerHTML = `
        <div class="module-header-container"><div class="module-header" data-info-id="baeng-module-waveguide">WG</div></div>
        <div class="fader-section">
            <div class="fader-container">
                <div class="fader-label" data-label="WG TYPE">TYPE</div>
                <div class="fader"><div class="fader-track stepped"><div class="fader-fill" style="height: ${(state.waveguideType / 2) * 100}%"></div><div class="step-notch step-notch-1"></div></div></div>
                <div class="fader-value">${config.WAVEGUIDE_TYPES[state.waveguideType]}</div>
            </div>
            <div class="fader-container">
                <div class="fader-label" data-label="WG MIX">MIX</div>
                <div class="fader"><div class="fader-track"><div class="fader-fill" style="height: ${state.waveguideMix}%"></div></div></div>
                <div class="fader-value">${state.waveguideMix}</div>
            </div>
            <div class="fader-container">
                <div class="fader-label" data-label="WG DECAY">DECAY</div>
                <div class="fader"><div class="fader-track"><div class="fader-fill" style="height: ${state.waveguideDecay}%"></div></div></div>
                <div class="fader-value">${state.waveguideDecay}</div>
            </div>
            <div class="fader-container">
                <div class="fader-label" data-label="WG BODY">BODY</div>
                <div class="fader"><div class="fader-track"><div class="fader-fill" style="height: ${state.waveguideBody}%"></div></div></div>
                <div class="fader-value">${state.waveguideBody}</div>
            </div>
            <div class="fader-container">
                <div class="fader-label" data-label="WG TUNE">TUNE</div>
                <div class="fader"><div class="fader-track"><div class="fader-fill" style="height: ${state.waveguideTune}%"></div></div></div>
                <div class="fader-value">${state.waveguideTune}</div>
            </div>
        </div>
    `;
    container.appendChild(module);
}

// Render BUS module (Drum Bus processor - replaces COMP + OUT)
function renderBusModule(container) {
    const module = document.createElement('div');
    module.id = 'bus';
    module.className = 'module';

    // Get drum bus state
    const db = state.drumBus;

    // Format display values
    const trimDb = ((db.trimGain - 50) * 0.24).toFixed(1);
    const outDb = ((db.outputGain - 50) * 0.24).toFixed(1);
    const dampFreq = 500 * Math.pow(60, db.dampenFreq / 100);
    const dampStr = dampFreq >= 1000 ? `${(dampFreq / 1000).toFixed(1)}kHz` : `${Math.round(dampFreq)}Hz`;
    const boomHz = Math.round(30 + db.boomFreq * 0.6);
    const transVal = Math.round((db.transients - 50) * 2);
    const transStr = transVal >= 0 ? `+${transVal}` : `${transVal}`;

    const driveTypes = ['SOFT', 'MED', 'HARD'];

    module.innerHTML = `
        <div class="module-header-container">
            <button class="header-toggle" id="bus-drive-type" data-type="${db.driveType}" title="Drive Type" data-info-id="baeng-bus-soft">
                ${driveTypes[db.driveType]}
            </button>
            <div class="module-header" data-info-id="baeng-module-bus">BUS</div>
            <button class="header-toggle ${db.compEnabled ? 'active' : ''}" id="bus-comp-toggle" title="Enable Compressor" data-info-id="baeng-bus-comp">
                COMP
            </button>
        </div>

        <canvas id="bus-canvas" width="200" height="100"></canvas>

        <!-- Row 1: TRIM, DRIVE, CRUNCH, TRANS, DAMP -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-bus-trim">
                <div class="knob-label">TRIM</div>
                <div class="led-ring-knob" data-mode="bipolar" data-param-id="bus.trimGain">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${trimDb >= 0 ? '+' : ''}${trimDb}dB</div>
            </div>
            <div class="knob-container" data-info-id="baeng-bus-drive">
                <div class="knob-label">DRIVE</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="bus.driveAmount">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${db.driveAmount}%</div>
            </div>
            <div class="knob-container" data-info-id="baeng-bus-crunch">
                <div class="knob-label">CRUNCH</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="bus.crunch">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${db.crunch}%</div>
            </div>
            <div class="knob-container" data-info-id="baeng-bus-trans">
                <div class="knob-label">TRANS</div>
                <div class="led-ring-knob" data-mode="bipolar" data-param-id="bus.transients">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${transStr}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-bus-damp">
                <div class="knob-label">DAMP</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="bus.dampenFreq">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${dampStr}</div>
            </div>
        </div>

        <!-- Row 2: BOOM, FREQ, DECAY, D/W, OUT -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-bus-boom">
                <div class="knob-label">BOOM</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="bus.boomAmount">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${db.boomAmount}%</div>
            </div>
            <div class="knob-container" data-info-id="baeng-bus-freq">
                <div class="knob-label">FREQ</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="bus.boomFreq">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${boomHz}Hz</div>
            </div>
            <div class="knob-container" data-info-id="baeng-bus-decay">
                <div class="knob-label">DECAY</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="bus.boomDecay">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${db.boomDecay}%</div>
            </div>
            <div class="knob-container" data-info-id="baeng-bus-dw">
                <div class="knob-label">D/W</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="bus.dryWet">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${db.dryWet}%</div>
            </div>
            <div class="knob-container" data-info-id="baeng-bus-out">
                <div class="knob-label">OUT</div>
                <div class="led-ring-knob" data-mode="bipolar" data-param-id="bus.outputGain">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${outDb >= 0 ? '+' : ''}${outDb}dB</div>
            </div>
        </div>
    `;
    container.appendChild(module);
}

// Note: The DOMContentLoaded listener that was here for old effects tab setup is removed
// as it's no longer needed. General UI setup is handled by main.js.