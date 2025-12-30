// File: js/raembl/modules/clouds.js
// Clouds granular processor module logic
import { config } from '../config.js';
import { config as baengConfig } from '../../baeng/config.js'; // For sidechain ducking gains
import { state } from '../state.js';
import { subscribe as subscribeToSharedClock } from '../../shared/clock.js';
import { BufferVisualisation } from './buffer-viz.js';
import { updateParameterById } from '../ui/faderState.js';
import { historyManager } from '../history.js';
let cloudsNode = null;
let bufferViz = null;
let inputAnalyser = null;
let outputAnalyser = null;
let vuAnimationId = null;
let isFrozen = false;
let currentMode = 0; // 0=Granular, 1=WSOLA, 2=Looping, 3=Spectral
let clockSyncEnabled = false;
let clockUnsubscribe = null;
let currentQualityIndex = 0;

// Quality presets: [label, description, settings]
// Settings: { quality: 'int16'|'int8', lofi: bool, mono: bool }
const QUALITY_PRESETS = [
    { label: 'HI',   desc: '16b/ST/1s',  quality: 'int16', lofi: false, mono: false },
    { label: 'MED',  desc: '16b/MO/2s',  quality: 'int16', lofi: false, mono: true },
    { label: 'LO',   desc: '8b/ST/4s',   quality: 'int8',  lofi: true,  mono: false },
    { label: 'XLO',  desc: '8b/MO/8s',   quality: 'int8',  lofi: true,  mono: true },
];

// Clouds parameters with their ranges
const cloudParams = {
    position: { min: 0, max: 1, default: 0 },
    size: { min: 0, max: 1, default: 0 },
    density: { min: 0, max: 1, default: 0.5 },
    texture: { min: 0, max: 1, default: 0.5 },
    pitch: { min: -2, max: 2, default: 0 }, // octaves (converted from semitones for display)
    spread: { min: 0, max: 1, default: 0.5 }, // stereo_spread in original
    feedback: { min: 0, max: 1, default: 0 }, // IMPORTANT: Must default to 0 to prevent runaway
    reverb: { min: 0, max: 1, default: 0.3 },
    dryWet: { min: 0, max: 1, default: 1.0 },
    inputGain: { min: 0, max: 2, default: 1.0 } // 0-200%, default 100%
};

// Mode name mapping
const MODE_NAMES = ['Granular', 'Pitch-Shifter', 'Looping Delay', 'Spectral', 'Oliverb', 'Resonestor'];

/**
 * Handle clock step events from shared clock
 * Filters to even steps only (no swing) and sends trigger to Clouds worklet
 * @param {Object} event - Clock event with stepCounter, audioTime, etc.
 */
function handleClockStep(event) {
    if (event.type !== 'step') return;

    // Only process even step counts (0, 2, 4, 6...)
    // This avoids swung beats (odd steps have swing offset applied)
    const isEvenStep = (event.stepCounter % 2) === 0;

    if (isEvenStep && cloudsNode) {
        // Send trigger message to Clouds worklet
        // This will be used by engines that support trigger input
        cloudsNode.port.postMessage({
            command: 'trigger',
            audioTime: event.audioTime
        });
    }
}

// Initialize Clouds worklet and insert into audio chain
export async function initClouds() {
    if (!config.audioContext) {
        console.error('[Clouds] AudioContext not available');
        return;
    }

    try {
        await config.audioContext.audioWorklet.addModule(
            `js/audio/worklets/clouds-processor.js?v=${Date.now()}`
        );

        cloudsNode = new AudioWorkletNode(config.audioContext, 'clouds-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        // Message listener for worklet → main thread
        cloudsNode.port.onmessage = (e) => {
            const { type, message, event, value } = e.data;
            // DEBUG: Log any debug messages from worklet
            if (type === 'debug') {
                console.log('[Clouds Worklet]', message);
                return;
            }
            if (event === 'modeChanged') {
            } else if (event === 'freezeChanged') {
            } else if (event === 'bufferData') {
                // Update buffer visualisation with data from processor
                bufferViz?.updateBuffer(value);
            }
        };

        // Store in config for access
        config.cloudsNode = cloudsNode;

        // Create analysers for VU metering
        inputAnalyser = config.audioContext.createAnalyser();
        inputAnalyser.fftSize = 256;
        inputAnalyser.smoothingTimeConstant = 0.3;

        outputAnalyser = config.audioContext.createAnalyser();
        outputAnalyser.fftSize = 256;
        outputAnalyser.smoothingTimeConstant = 0.3;

        // Store input analyser in config so audio.js can route voices through it
        config.cloudsInputAnalyser = inputAnalyser;

        // Connect: inputAnalyser → Clouds → outputAnalyser → (duckingGain) → masterGain
        inputAnalyser.connect(cloudsNode);
        cloudsNode.connect(outputAnalyser);
        // Connect through ducking gain to master gain
        if (baengConfig.duckingGains?.raemblClouds) {
            outputAnalyser.connect(baengConfig.duckingGains.raemblClouds);
            baengConfig.duckingGains.raemblClouds.connect(config.masterGain);
        } else {
            // Fallback: direct connection if ducking not initialised
            outputAnalyser.connect(config.masterGain);
        }

        // Initialise buffer visualisation (VU meters are now drawn inside this canvas)
        bufferViz = new BufferVisualisation('raembl-clouds-canvas', cloudsNode);

        // Initialize AudioWorklet parameters from STATE (not hard-coded defaults!)
        // Map state keys to worklet parameter names
        const stateToParamMap = {
            'cloudsPitch': 'pitch',
            'cloudsPosition': 'position',
            'cloudsDensity': 'density',
            'cloudsSize': 'size',
            'cloudsTexture': 'texture',
            'cloudsDryWet': 'dryWet',
            'cloudsSpread': 'spread',
            'cloudsFeedback': 'feedback',
            'cloudsReverb': 'reverb',
            'cloudsInputGain': 'inputGain'
        };

        // Initialize from STATE, not hard-coded defaults
        Object.entries(stateToParamMap).forEach(([stateKey, paramName]) => {
            const param = cloudsNode.parameters.get(paramName);
            if (!param) {
                console.error(`[Clouds] Init: Parameter '${paramName}' not found in worklet!`);
                return;
            }

            // Get value from state (0-100 range for most params)
            let stateValue = state[stateKey];

            if (stateValue === undefined || stateValue === null) {
                console.error(`[Clouds] Init: state.${stateKey} is ${stateValue}! Using 0.`);
                stateValue = 0;
            }

            // Normalize to correct range based on parameter
            let normalizedValue;
            if (paramName === 'pitch') {
                // Pitch: state is 0-100, maps to -2 to +2 octaves
                normalizedValue = (stateValue / 100) * 4 - 2; // 0→-2, 50→0, 100→+2
            } else if (paramName === 'inputGain') {
                // InputGain: state is 0-100, maps to 0-2 (0-200%)
                normalizedValue = (stateValue / 100) * 2; // 0→0, 50→1.0, 100→2.0
            } else {
                // All others: state is 0-100, maps to 0-1
                normalizedValue = stateValue / 100;
            }

            // Clamp value to parameter range (processor also has bounds checking)
            const paramConfig = cloudParams[paramName];
            const clampedValue = Math.max(paramConfig.min, Math.min(paramConfig.max, normalizedValue));

            // Set the parameter
            param.value = clampedValue;

        });

        // Check feedback + reverb stability at init
        const fb = cloudsNode.parameters.get('feedback').value;
        const rev = cloudsNode.parameters.get('reverb').value;
        if (fb >= 0.9 && rev >= 0.7) {
            console.warn(`[Clouds] INIT STABILITY WARNING: High feedback (${fb}) + reverb (${rev}) detected from state`);
        }
        if (fb > 0.5 || rev > 0.5) {
            console.warn(`[Clouds] High parameter values detected: feedback=${fb}, reverb=${rev} - monitor for oscillation`);
        }


        // Attach UI event handlers (only if module is in DOM)
        const cloudsModule = document.getElementById('raembl-clouds');
        if (cloudsModule) {
            attachCloudsEventHandlers();
            startCloudsAnimation();
        } else {
        }

    } catch (e) {
        console.error('[Clouds] Failed to initialize:', e);
    }
}

// Attach event handlers to Clouds UI elements
export function attachCloudsEventHandlers() {
    const module = document.getElementById('raembl-clouds');
    if (!module) {
        console.warn('[Clouds] Module not found in DOM');
        return;
    }

    // Setup mode dropdown
    setupModeDropdown();

    // Get all fader containers
    const faderContainers = module.querySelectorAll('.fader-container');
    // CRITICAL: Order must match HTML fader sequence!
    // HTML order: PITCH, POSITION, DENSITY, SIZE, TEXTURE, DRY/WET, SPREAD, FEEDBACK, REVERB, INPUT GAIN
    const paramNames = ['pitch', 'position', 'density', 'size', 'texture', 'dryWet', 'spread', 'feedback', 'reverb', 'inputGain'];

    faderContainers.forEach((container, index) => {
        const paramName = paramNames[index];
        if (!paramName) return;

        const fader = container.querySelector('.fader');
        const fill = container.querySelector('.fader-fill');
        const valueDisplay = container.querySelector('.fader-value');

        if (!fader || !fill || !valueDisplay) return;

        // Map param names to state keys
        const stateKeyMap = {
            'position': 'cloudsPosition',
            'size': 'cloudsSize',
            'density': 'cloudsDensity',
            'texture': 'cloudsTexture',
            'pitch': 'cloudsPitch',
            'dryWet': 'cloudsDryWet',
            'spread': 'cloudsSpread',
            'feedback': 'cloudsFeedback',
            'reverb': 'cloudsReverb',
            'inputGain': 'cloudsInputGain'
        };

        // Initialize value from STATE (not hardcoded defaults!)
        // This ensures fader UI matches actual parameter values after patch load
        const paramConfig = cloudParams[paramName];
        const stateKey = stateKeyMap[paramName];
        const stateValue = state[stateKey]; // 0-100 range in state

        // Use state value if available, otherwise fall back to default
        let initPercent;
        if (stateValue !== undefined && stateValue !== null) {
            initPercent = stateValue; // State already in 0-100 range
        } else {
            // Fall back to default (convert from param range to 0-100)
            initPercent = ((paramConfig.default - paramConfig.min) / (paramConfig.max - paramConfig.min)) * 100;
        }

        fill.style.height = `${initPercent}%`;

        // Calculate the actual parameter value for display formatting
        const paramValue = paramConfig.min + (initPercent / 100) * (paramConfig.max - paramConfig.min);

        // Special formatting for pitch (semitones) and inputGain (0-200%)
        if (paramName === 'pitch') {
            const semitones = Math.round(paramValue * 12);
            valueDisplay.textContent = semitones === 0 ? '0st' : `${semitones > 0 ? '+' : ''}${semitones}st`;
        } else if (paramName === 'inputGain') {
            // InputGain: display 0-200% (maps to 0-2 internally)
            const gainPercent = Math.round(paramValue * 100);
            valueDisplay.textContent = `${gainPercent}%`;
        } else {
            valueDisplay.textContent = `${Math.round(initPercent)}%`;
        }

        // Mouse down to start drag
        fader.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const updateFader = (clientY) => {
                const rect = fader.getBoundingClientRect();
                const y = rect.bottom - clientY;
                const height = rect.height;
                const percent = Math.max(0, Math.min(100, (y / height) * 100));

                fill.style.height = `${percent}%`;

                // Map percent to parameter range
                const value = paramConfig.min + (percent / 100) * (paramConfig.max - paramConfig.min);

                // Special formatting for pitch (octaves, displayed as semitones)
                if (paramName === 'pitch') {
                    const semitones = Math.round(value * 12); // Convert octaves to semitones for display
                    valueDisplay.textContent = semitones === 0 ? '0st' : `${semitones > 0 ? '+' : ''}${semitones}st`;
                } else if (paramName === 'inputGain') {
                    // InputGain: display 0-200% (maps to 0-2 internally)
                    const gainPercent = Math.round(value * 100);
                    valueDisplay.textContent = `${gainPercent}%`;
                } else {
                    valueDisplay.textContent = `${Math.round(percent)}%`;
                }

                // Update worklet parameter
                if (cloudsNode && cloudsNode.parameters) {
                    cloudsNode.parameters.get(paramName).value = value;
                }

                // Sync state for patch save/load (store as 0-100 percent)
                const stateKeyMap = {
                    'position': 'cloudsPosition',
                    'size': 'cloudsSize',
                    'density': 'cloudsDensity',
                    'texture': 'cloudsTexture',
                    'pitch': 'cloudsPitch',
                    'dryWet': 'cloudsDryWet',
                    'spread': 'cloudsSpread',
                    'feedback': 'cloudsFeedback',
                    'reverb': 'cloudsReverb',
                    'inputGain': 'cloudsInputGain'
                };
                const stateKey = stateKeyMap[paramName];
                if (stateKey) {
                    state[stateKey] = percent; // Store as 0-100
                }
            };

            const onMouseMove = (e) => updateFader(e.clientY);
            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            updateFader(e.clientY);
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });

    // Freeze button
    const freezeBtn = document.getElementById('clouds-freeze-button');
    if (freezeBtn) {
        freezeBtn.addEventListener('click', () => {
            isFrozen = !isFrozen;
            state.cloudsFreeze = isFrozen; // Sync with global state for patch save/load
            freezeBtn.classList.toggle('active', isFrozen);

            if (cloudsNode) {
                cloudsNode.port.postMessage({
                    command: 'setFreeze',
                    value: isFrozen
                });
            }

        });
    }

    // Clock sync toggle button - use event delegation on module container
    // This ensures clicks work even if button element is recreated after handler attachment
    if (!module.dataset.clockSyncHandlerAttached) {
        module.dataset.clockSyncHandlerAttached = 'true';
        module.addEventListener('click', (e) => {
            // Check if click target is the clock sync button or its children
            const clockSyncBtn = e.target.closest('#clouds-clock-sync-button');
            if (!clockSyncBtn) return;

            console.log('[Clouds] Clock sync button clicked via delegation!');
            clockSyncEnabled = !clockSyncEnabled;
            clockSyncBtn.classList.toggle('active', clockSyncEnabled);

            // Subscribe or unsubscribe from clock
            if (clockSyncEnabled) {
                clockUnsubscribe = subscribeToSharedClock(handleClockStep);
                console.log('[Clouds] Clock sync enabled, subscribed to clock');
            } else {
                if (clockUnsubscribe) {
                    clockUnsubscribe();
                    clockUnsubscribe = null;
                }
                console.log('[Clouds] Clock sync disabled');
            }
        });
        console.log('[Clouds] Clock sync handler attached via delegation on module');
    } else {
        console.log('[Clouds] Clock sync handler already attached, skipping');
    }

    // Random button
    const randomBtn = document.getElementById('clouds-random');
    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            randomizeClouds();
        });
    }

    // Quality toggle button
    setupQualityButton();

}

/**
 * Setup quality toggle button
 * Cycles through 4 quality presets: HI → MED → LO → XLO
 */
function setupQualityButton() {
    const qualityBtn = document.getElementById('clouds-quality-button');
    const qualityLabel = document.getElementById('clouds-quality-label');

    if (!qualityBtn || !qualityLabel) {
        console.warn('[Clouds] Quality button elements not found');
        return;
    }

    // Update button label and tooltip
    const updateQualityDisplay = () => {
        const preset = QUALITY_PRESETS[currentQualityIndex];
        qualityLabel.textContent = preset.label;
        qualityBtn.title = `Buffer Quality: ${preset.desc}\nClick to cycle`;
    };

    // Apply quality settings to processor
    const applyQuality = () => {
        const preset = QUALITY_PRESETS[currentQualityIndex];

        if (!cloudsNode) return;

        // Send quality mode
        cloudsNode.port.postMessage({ command: 'setBufferQuality', value: preset.quality });

        // Send lofi mode
        cloudsNode.port.postMessage({ command: 'setLofiMode', value: preset.lofi });

        // Send mono mode
        cloudsNode.port.postMessage({ command: 'setMonoMode', value: preset.mono });

    };

    // Click handler - cycle through presets
    qualityBtn.addEventListener('click', () => {
        currentQualityIndex = (currentQualityIndex + 1) % QUALITY_PRESETS.length;
        updateQualityDisplay();
        applyQuality();
    });

    // Set initial display
    updateQualityDisplay();
}

// Setup mode dropdown event handlers
function setupModeDropdown() {
    const module = document.getElementById('raembl-clouds');
    if (!module) return;

    const dropdownButton = module.querySelector('.clouds-mode-dropdown-button');
    const dropdownMenu = module.querySelector('.clouds-mode-dropdown-menu');
    const selectedText = dropdownButton?.querySelector('.dropdown-selected-text');
    const options = module.querySelectorAll('.dropdown-option');

    if (!dropdownButton || !dropdownMenu) return;

    let isOpen = false;

    // Toggle dropdown
    const toggleDropdown = () => {
        isOpen = !isOpen;
        dropdownMenu.classList.toggle('hidden', !isOpen);
        dropdownButton.setAttribute('aria-expanded', isOpen.toString());
    };

    dropdownButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (isOpen && !module.contains(e.target)) {
            toggleDropdown();
        }
    });

    // Handle mode selection
    options.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const newModeStr = option.getAttribute('data-mode');

            // Convert mode string to number
            const modeMap = { 'granular': 0, 'wsola': 1, 'looping': 2, 'spectral': 3, 'oliverb': 4, 'resonestor': 5 };
            const newMode = modeMap[newModeStr] !== undefined ? modeMap[newModeStr] : parseInt(newModeStr);

            // Validate mode is a valid number
            if (isNaN(newMode) || newMode < 0 || newMode > 5) {
                console.error('[Clouds] Invalid mode value:', newModeStr);
                return;
            }

            if (newMode !== currentMode) {
                currentMode = newMode;

                // Update UI
                options.forEach(opt => opt.setAttribute('aria-selected', 'false'));
                option.setAttribute('aria-selected', 'true');
                if (selectedText) {
                    selectedText.textContent = option.textContent.trim();
                }

                // Send mode change to worklet
                if (cloudsNode) {
                    cloudsNode.port.postMessage({
                        command: 'setMode',
                        value: newMode
                    });
                }

            }

            toggleDropdown();
        });
    });

}

// Randomize all Clouds parameters
function randomizeClouds() {
    // Clouds parameter IDs (0-100 range in parameterDefinitions)
    const cloudsParamIds = [
        'clouds.pitch',
        'clouds.position',
        'clouds.density',
        'clouds.size',
        'clouds.texture',
        'clouds.dryWet',
        'clouds.spread',
        'clouds.feedback',
        'clouds.reverb',
        'clouds.inputGain'
    ];

    cloudsParamIds.forEach(paramId => {
        // Generate random value 0-100
        const randomValue = Math.random() * 100;
        // Use updateParameterById which updates state, syncs SlidePots, and triggers audio updates
        updateParameterById(paramId, randomValue);
    });

    // Capture snapshot immediately after all params updated
    // (updateParameterById uses debounced snapshots which wait 300ms)
    if (historyManager) {
        historyManager.pushSnapshot();
    }
}

// VU meter animation loop
function updateVUMeter() {
    if (!inputAnalyser || !outputAnalyser) return;

    const inputData = new Float32Array(inputAnalyser.fftSize);
    const outputData = new Float32Array(outputAnalyser.fftSize);

    // Get time domain data for RMS calculation
    inputAnalyser.getFloatTimeDomainData(inputData);
    outputAnalyser.getFloatTimeDomainData(outputData);

    // Calculate RMS for input
    let inputSum = 0;
    for (let i = 0; i < inputData.length; i++) {
        inputSum += inputData[i] * inputData[i];
    }
    const inputRMS = Math.sqrt(inputSum / inputData.length);

    // Calculate RMS for output
    let outputSum = 0;
    for (let i = 0; i < outputData.length; i++) {
        outputSum += outputData[i] * outputData[i];
    }
    const outputRMS = Math.sqrt(outputSum / outputData.length);

    // Update VU meter display (now drawn inside bufferViz canvas)
    bufferViz?.updateInputLevel(inputRMS);
    bufferViz?.updateOutputLevel(outputRMS);

    vuAnimationId = requestAnimationFrame(updateVUMeter);
}

// Start buffer visualisation and VU meter
export function startCloudsAnimation() {
    // Recreate bufferViz if it was cleaned up (e.g., after FX mode switch)
    if (!bufferViz && cloudsNode) {
        bufferViz = new BufferVisualisation('raembl-clouds-canvas', cloudsNode);
    }
    bufferViz?.start();
    if (!vuAnimationId) {
        updateVUMeter();
    }
}

// Stop buffer visualisation and VU meter
export function stopCloudsAnimation() {
    bufferViz?.stop();
    bufferViz = null;
    if (vuAnimationId) {
        cancelAnimationFrame(vuAnimationId);
        vuAnimationId = null;
    }
}

/**
 * Get the current Clouds mode index
 * @returns {number} Mode index (0=Granular, 1=WSOLA, 2=Looping, 3=Spectral, 4=Oliverb, 5=Resonestor)
 */
export function getCurrentCloudsMode() {
    return currentMode;
}

/**
 * Get the current Clouds mode name
 * @returns {string} Mode name (e.g., 'granular', 'wsola', etc.)
 */
export function getCurrentCloudsModeName() {
    const modeNames = ['granular', 'wsola', 'looping', 'spectral', 'oliverb', 'resonestor'];
    return modeNames[currentMode] || 'granular';
}

// Get Clouds state for patch save/load
export function getCloudsState() {
    if (!cloudsNode) return null;

    return {
        position: cloudsNode.parameters.get('position').value,
        size: cloudsNode.parameters.get('size').value,
        density: cloudsNode.parameters.get('density').value,
        texture: cloudsNode.parameters.get('texture').value,
        pitch: cloudsNode.parameters.get('pitch').value,
        spread: cloudsNode.parameters.get('spread').value,
        feedback: cloudsNode.parameters.get('feedback').value,
        reverb: cloudsNode.parameters.get('reverb').value,
        dryWet: cloudsNode.parameters.get('dryWet').value,
        inputGain: cloudsNode.parameters.get('inputGain').value,
        frozen: isFrozen,
        mode: currentMode
    };
}

// Set Clouds state for patch load
export function setCloudsState(cloudsState) {
    if (!cloudsNode || !cloudsState) return;

    const module = document.getElementById('raembl-clouds');
    if (!module) return;

    // CRITICAL: Order must match HTML fader sequence!
    // HTML order: PITCH, POSITION, DENSITY, SIZE, TEXTURE, DRY/WET, SPREAD, FEEDBACK, REVERB, INPUT GAIN
    const paramNames = ['pitch', 'position', 'density', 'size', 'texture', 'dryWet', 'spread', 'feedback', 'reverb', 'inputGain'];
    const faderContainers = module.querySelectorAll('.fader-container');

    paramNames.forEach((paramName, index) => {
        const value = cloudsState[paramName];
        if (value === undefined) return;

        // Clamp value to parameter range (processor also has bounds checking)
        const paramConfig = cloudParams[paramName];
        const clampedValue = Math.max(paramConfig.min, Math.min(paramConfig.max, value));

        // Update worklet parameter
        cloudsNode.parameters.get(paramName).value = clampedValue;

        // Update UI
        const container = faderContainers[index];
        if (!container) return;

        const fill = container.querySelector('.fader-fill');
        const valueDisplay = container.querySelector('.fader-value');

        if (fill && valueDisplay) {
            const percent = ((clampedValue - paramConfig.min) / (paramConfig.max - paramConfig.min)) * 100;
            fill.style.height = `${percent}%`;

            // Special formatting for pitch (octaves, displayed as semitones) and inputGain (0-200%)
            if (paramName === 'pitch') {
                const semitones = Math.round(clampedValue * 12);
                valueDisplay.textContent = semitones === 0 ? '0st' : `${semitones > 0 ? '+' : ''}${semitones}st`;
            } else if (paramName === 'inputGain') {
                // InputGain: display 0-200% (maps to 0-2 internally)
                const gainPercent = Math.round(clampedValue * 100);
                valueDisplay.textContent = `${gainPercent}%`;
            } else {
                valueDisplay.textContent = `${Math.round(percent)}%`;
            }
        }
    });

    // Set mode
    if (cloudsState.mode !== undefined) {
        // Ensure mode is a valid number (handle legacy string modes)
        let modeNum = cloudsState.mode;
        if (typeof modeNum === 'string') {
            const modeMap = { 'granular': 0, 'wsola': 1, 'looping': 2, 'spectral': 3, 'oliverb': 4, 'resonestor': 5 };
            modeNum = modeMap[modeNum] !== undefined ? modeMap[modeNum] : parseInt(modeNum);
        }

        // Validate mode
        if (isNaN(modeNum) || modeNum < 0 || modeNum > 5) {
            console.warn('[Clouds] Invalid mode in patch, defaulting to 0:', cloudsState.mode);
            modeNum = 0;
        }

        currentMode = modeNum;

        // Update dropdown UI
        const selectedText = module.querySelector('.dropdown-selected-text');
        const options = module.querySelectorAll('.dropdown-option');

        // Convert mode number to string for attribute comparison
        const modeStr = ['granular', 'wsola', 'looping', 'spectral', 'oliverb', 'resonestor'][modeNum];

        options.forEach(opt => {
            const optMode = opt.getAttribute('data-mode');
            if (optMode === modeStr) {
                opt.setAttribute('aria-selected', 'true');
                if (selectedText) {
                    selectedText.textContent = opt.textContent.trim();
                }
            } else {
                opt.setAttribute('aria-selected', 'false');
            }
        });

        // Send to worklet
        cloudsNode.port.postMessage({
            command: 'setMode',
            value: currentMode
        });
    }

    // Set freeze state
    if (cloudsState.frozen !== undefined) {
        isFrozen = cloudsState.frozen;
        state.cloudsFreeze = isFrozen; // Sync with global state
        const freezeBtn = document.getElementById('clouds-freeze-button');
        if (freezeBtn) {
            freezeBtn.classList.toggle('active', isFrozen);
        }
        cloudsNode.port.postMessage({
            command: 'setFreeze',
            value: isFrozen
        });
    }

}

/**
 * Update a single Clouds parameter from external source (e.g., per-param modulation)
 * Maps state value (0-100) to worklet parameter range
 * @param {string} paramId - The full parameter ID (e.g., 'clouds.pitch')
 * @param {number} stateValue - Value in state range (0-100)
 */
export function updateCloudsParameter(paramId, stateValue) {
    if (!cloudsNode) return;

    // Extract the worklet parameter name from paramId
    const paramName = paramId.replace('clouds.', '');

    // Map state value to worklet parameter range
    let normalizedValue;
    const paramConfig = cloudParams[paramName];

    if (!paramConfig) {
        console.warn(`[Clouds] Unknown parameter: ${paramName}`);
        return;
    }

    if (paramName === 'pitch') {
        // Pitch: state is 0-100, maps to -2 to +2 octaves
        normalizedValue = (stateValue / 100) * 4 - 2; // 0→-2, 50→0, 100→+2
    } else if (paramName === 'inputGain') {
        // InputGain: state is 0-100, maps to 0-2 (0-200%)
        normalizedValue = (stateValue / 100) * 2; // 0→0, 50→1.0, 100→2.0
    } else {
        // All others: state is 0-100, maps to 0-1
        normalizedValue = stateValue / 100;
    }

    // Clamp value to parameter range
    const clampedValue = Math.max(paramConfig.min, Math.min(paramConfig.max, normalizedValue));

    // Update worklet parameter
    const param = cloudsNode.parameters.get(paramName);
    if (param) {
        param.value = clampedValue;
    }
}
