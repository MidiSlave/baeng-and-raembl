/**
 * Per-Parameter Modulation Modal UI
 *
 * Draggable modal for configuring per-parameter modulation.
 * Replaces the click-cycling UI with a tabbed modal interface.
 *
 * Modes: LFO | RND | ENV | EF | TM | SEQ
 */

import {
    LFSR,
    EnvelopeCurves,
    ADEnvelope,
    ADSREnvelope,
    SeqPattern,
    TMPattern,
    EnvelopeFollower,
    LFOWaveforms,
    mapModulationValue
} from './modulation-utils.js';

// ============================================================================
// State
// ============================================================================

let currentParamId = null;
let currentApp = null; // 'baeng' or 'raembl'
let currentVoiceIndex = null; // For Bæng per-voice params (0-5), null for global
let currentIsVoiceParam = false; // Whether current param is per-voice
let currentMode = 'LFO'; // Current mode selection
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// Modal position persistence key
const POSITION_KEY = 'ppmod-modal-position';

// Mode definitions
const MODES = ['LFO', 'RND', 'ENV', 'EF', 'TM', 'SEQ'];
const MODE_DESCRIPTIONS = {
    LFO: 'Low Frequency Oscillator',
    RND: 'Random (LFSR)',
    ENV: 'Envelope',
    EF: 'Envelope Follower',
    TM: 'Turing Machine',
    SEQ: 'Step Sequencer'
};

// LFO waveform names
const LFO_WAVEFORMS = ['SIN', 'TRI', 'SQR', 'SAW', 'RAMP', 'S&H'];

// Envelope curve shapes
const ENV_CURVES = ['linear', 'exponential', 'logarithmic', 'sCurve'];
const ENV_CURVE_NAMES = ['LIN', 'EXP', 'LOG', 'S'];

// Animation frame ID for visualisation
let animFrameId = null;

// ============================================================================
// Initialisation
// ============================================================================

/**
 * Initialise the PPMod modal event handlers
 * Call once on app startup
 */
export function initPPModModal() {
    const modal = document.getElementById('ppmod-modal');
    const header = document.getElementById('ppmod-modal-header');
    const closeBtn = document.getElementById('ppmod-modal-close-btn');

    if (!modal || !header || !closeBtn) {
        console.warn('[PPModModal] Modal elements not found');
        return;
    }

    // Close button
    closeBtn.addEventListener('click', closePPModModal);

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closePPModModal();
        }
    });

    // Dragging handlers
    header.addEventListener('mousedown', startDrag);
    header.addEventListener('touchstart', startDrag, { passive: false });

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });

    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);

    // Mode tab clicks
    modal.querySelectorAll('.ppmod-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const mode = e.target.dataset.mode;
            if (mode) {
                selectMode(mode);
            }
        });
    });

    // Voice selector button clicks (for Bæng per-voice params)
    const voiceSelector = document.getElementById('ppmod-voice-selector');
    if (voiceSelector) {
        voiceSelector.querySelectorAll('.ppmod-voice-btn').forEach((btn, i) => {
            btn.addEventListener('click', () => handleVoiceSelect(i));
        });
    }

    // Reset button
    document.getElementById('ppmod-reset-btn')?.addEventListener('click', handleReset);

    // Common controls
    setupCommonControls();

    // Restore position from localStorage
    restoreModalPosition();
}

/**
 * Restore modal position from localStorage
 */
function restoreModalPosition() {
    const modal = document.getElementById('ppmod-modal');
    if (!modal) return;

    try {
        const saved = localStorage.getItem(POSITION_KEY);
        if (saved) {
            const { left, top } = JSON.parse(saved);
            modal.style.left = `${left}px`;
            modal.style.top = `${top}px`;
        }
    } catch (e) {
        console.warn('[PPModModal] Failed to restore position:', e);
    }
}

/**
 * Save modal position to localStorage
 */
function saveModalPosition() {
    const modal = document.getElementById('ppmod-modal');
    if (!modal) return;

    try {
        const rect = modal.getBoundingClientRect();
        localStorage.setItem(POSITION_KEY, JSON.stringify({
            left: rect.left,
            top: rect.top
        }));
    } catch (e) {
        console.warn('[PPModModal] Failed to save position:', e);
    }
}

// ============================================================================
// Common Controls Setup
// ============================================================================

function setupCommonControls() {
    // Depth slider
    setupSlider('ppmod-depth', 'depth', (v) => `${Math.round(v)}%`, 0, 100);

    // Offset slider
    setupSlider('ppmod-offset', 'offset', (v) => {
        const val = Math.round(v);
        return val >= 0 ? `+${val}%` : `${val}%`;
    }, -100, 100);
}

function setupSlider(sliderId, paramName, formatFn, min = 0, max = 100) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(`${sliderId}-val`);

    if (!slider || !valueDisplay) return;

    slider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        valueDisplay.textContent = formatFn(value);
        updateModulationParam(paramName, value);
    });
}

// ============================================================================
// Open/Close Modal
// ============================================================================

/**
 * Open the PPMod modal for a specific parameter
 * @param {string} paramId - Parameter identifier
 * @param {string} app - 'baeng' or 'raembl'
 * @param {Object} modConfig - Current modulation config for this parameter
 * @param {Object} paramDef - Parameter definition (min, max, label, etc.)
 * @param {number} [voiceIndex] - For Bæng per-voice params (0-5), undefined for global
 * @param {boolean} [isVoiceParam] - Whether this is a per-voice parameter
 */
export function openPPModModal(paramId, app, modConfig, paramDef, voiceIndex = null, isVoiceParam = false) {
    currentParamId = paramId;
    currentApp = app;
    currentVoiceIndex = voiceIndex;
    currentIsVoiceParam = isVoiceParam;

    const modal = document.getElementById('ppmod-modal');
    if (!modal) return;

    // Update title
    const title = document.getElementById('ppmod-modal-title');
    if (title) {
        const label = paramDef?.label || paramId;
        // For Bæng voice params, show voice number
        if (app === 'baeng' && isVoiceParam && voiceIndex !== null) {
            title.textContent = `MOD: ${label} [V${voiceIndex + 1}]`;
        } else {
            title.textContent = `MOD: ${label}`;
        }
    }

    // Show/hide voice selector for Bæng per-voice params
    updateVoiceSelector(app, isVoiceParam, voiceIndex);

    // Populate controls from modConfig
    populateControls(modConfig);

    // Select the current mode tab
    const currentMode = modConfig?.mode || 'LFO';
    selectMode(currentMode);

    // Position modal near centre if not already positioned
    if (!modal.style.left || modal.style.left === '') {
        modal.style.left = `calc(50% - 190px)`;
        modal.style.top = '80px';
    }

    // Show modal
    modal.classList.remove('hidden');

    // Start visualisation
    startVisualisation();
}

/**
 * Close the PPMod modal
 */
export function closePPModModal() {
    const modal = document.getElementById('ppmod-modal');
    if (modal) {
        modal.classList.add('hidden');
    }

    // Save position
    saveModalPosition();

    // Stop visualisation
    stopVisualisation();

    // Clear state
    currentParamId = null;
    currentApp = null;
}

/**
 * Check if modal is currently open
 */
export function isPPModModalOpen() {
    const modal = document.getElementById('ppmod-modal');
    return modal && !modal.classList.contains('hidden');
}

/**
 * Get current parameter being edited
 */
export function getCurrentParamId() {
    return currentParamId;
}

/**
 * Get current voice index (for Bæng per-voice params)
 */
export function getCurrentVoiceIndex() {
    return currentVoiceIndex;
}

/**
 * Update voice selector visibility and state
 * For Bæng per-voice params, shows 6 voice buttons
 */
function updateVoiceSelector(app, isVoiceParam, voiceIndex) {
    const voiceSelector = document.getElementById('ppmod-voice-selector');
    if (!voiceSelector) return;

    if (app === 'baeng' && isVoiceParam) {
        voiceSelector.classList.remove('hidden');

        // Update button states
        const buttons = voiceSelector.querySelectorAll('.ppmod-voice-btn');
        buttons.forEach((btn, i) => {
            btn.classList.toggle('active', i === voiceIndex);
        });
    } else {
        voiceSelector.classList.add('hidden');
    }
}

/**
 * Handle voice button click
 */
function handleVoiceSelect(newVoiceIndex) {
    if (newVoiceIndex === currentVoiceIndex) return;

    currentVoiceIndex = newVoiceIndex;

    // Update button states
    const voiceSelector = document.getElementById('ppmod-voice-selector');
    if (voiceSelector) {
        const buttons = voiceSelector.querySelectorAll('.ppmod-voice-btn');
        buttons.forEach((btn, i) => {
            btn.classList.toggle('active', i === newVoiceIndex);
        });
    }

    // Update title
    const title = document.getElementById('ppmod-modal-title');
    if (title && currentIsVoiceParam) {
        // Extract param label from current title
        const match = title.textContent.match(/^MOD: (.+?)(?:\s*\[V\d\])?$/);
        const label = match ? match[1] : currentParamId;
        title.textContent = `MOD: ${label} [V${newVoiceIndex + 1}]`;
    }

    // Dispatch event to request new modConfig for this voice
    const event = new CustomEvent('ppmodVoiceChange', {
        detail: {
            paramId: currentParamId,
            app: currentApp,
            voiceIndex: newVoiceIndex
        }
    });
    document.dispatchEvent(event);
}

// ============================================================================
// Mode Selection
// ============================================================================

function selectMode(mode) {
    if (!MODES.includes(mode)) {
        console.warn(`[PPModModal] Unknown mode: ${mode}`);
        return;
    }

    // Update module-level state
    currentMode = mode;

    // Update tab visuals
    document.querySelectorAll('.ppmod-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Hide all mode panels
    document.querySelectorAll('.ppmod-mode-panel').forEach(panel => {
        panel.classList.add('hidden');
    });

    // Show selected mode panel
    const panel = document.getElementById(`ppmod-panel-${mode.toLowerCase()}`);
    if (panel) {
        panel.classList.remove('hidden');
    }

    // Update modulation config
    updateModulationParam('mode', mode);
}

// ============================================================================
// Populate Controls
// ============================================================================

function populateControls(modConfig) {
    // Common controls - use defaults if no modConfig
    setSliderValue('ppmod-depth', modConfig?.depth ?? 50, (v) => `${Math.round(v)}%`);
    setSliderValue('ppmod-offset', modConfig?.offset ?? 0, (v) => {
        const val = Math.round(v);
        return val >= 0 ? `+${val}%` : `${val}%`;
    });

    // Mode-specific controls - always set up handlers even with null modConfig
    // Pass modConfig (may be null/undefined, handlers will use defaults)
    populateLFOControls(modConfig);
    populateRNDControls(modConfig);
    populateENVControls(modConfig);
    populateEFControls(modConfig);
    populateTMControls(modConfig);
    populateSEQControls(modConfig);
}

function setSliderValue(sliderId, value, formatFn) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(`${sliderId}-val`);

    if (slider) slider.value = value;
    if (valueDisplay && formatFn) valueDisplay.textContent = formatFn(value);
}

// ============================================================================
// Mode-Specific Control Population (Stubs for Phase 1)
// ============================================================================

function populateLFOControls(modConfig) {
    // LFO: waveform, rate, sync
    const waveform = modConfig?.lfoWaveform ?? 0;
    const rate = modConfig?.lfoRate ?? 1;
    const sync = modConfig?.lfoSync ?? false;

    // Setup waveform selector buttons
    setupLFOWaveformSelector(waveform);

    // Setup rate slider
    setupLFORateSlider(rate);
}

/**
 * Setup the LFO waveform selector (SIN | TRI | SQR | SAW | RAMP | S&H)
 */
function setupLFOWaveformSelector(currentWaveform) {
    const container = document.getElementById('ppmod-lfo-wave-btns');
    if (!container) return;

    const buttons = container.querySelectorAll('.ppmod-selector-btn');
    buttons.forEach(btn => {
        const value = parseInt(btn.dataset.value, 10);
        btn.classList.toggle('active', value === currentWaveform);

        // Remove previous handler if any
        if (btn._lfoWaveHandler) {
            btn.removeEventListener('click', btn._lfoWaveHandler);
        }

        btn._lfoWaveHandler = () => {
            // Update active state
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Update modulation param
            updateModulationParam('lfoWaveform', value);
        };

        btn.addEventListener('click', btn._lfoWaveHandler);
    });
}

/**
 * Setup the LFO rate slider
 */
function setupLFORateSlider(rate) {
    const slider = document.getElementById('ppmod-lfo-rate');
    const valueDisplay = document.getElementById('ppmod-lfo-rate-val');

    if (!slider || !valueDisplay) return;

    slider.value = rate;
    valueDisplay.textContent = `${rate.toFixed(2)}Hz`;

    // Remove previous handler if any
    if (slider._lfoRateHandler) {
        slider.removeEventListener('input', slider._lfoRateHandler);
    }

    slider._lfoRateHandler = (e) => {
        const value = parseFloat(e.target.value);
        valueDisplay.textContent = `${value.toFixed(2)}Hz`;
        updateModulationParam('lfoRate', value);
    };

    slider.addEventListener('input', slider._lfoRateHandler);
}

function populateRNDControls(modConfig) {
    // RND: bit length, probability, sample rate
    const bitLength = modConfig?.rndBitLength ?? 16;
    const probability = modConfig?.rndProbability ?? 100;
    const sampleRateHz = modConfig?.rndSampleRate ?? 1000;

    // Setup bit length selector buttons
    setupRNDBitSelector(bitLength);

    // Setup probability slider
    setupRNDProbSlider(probability);

    // Setup rate slider (logarithmic: 100Hz - 10kHz)
    setupRNDRateSlider(sampleRateHz);
}

/**
 * Setup the RND bit length selector (4 | 8 | 16 | 32)
 */
function setupRNDBitSelector(currentBitLength) {
    const container = document.getElementById('ppmod-rnd-bits-btns');
    if (!container) return;

    const buttons = container.querySelectorAll('.ppmod-selector-btn');
    buttons.forEach(btn => {
        const value = parseInt(btn.dataset.value, 10);
        btn.classList.toggle('active', value === currentBitLength);

        // Remove previous handler if any
        if (btn._rndBitsHandler) {
            btn.removeEventListener('click', btn._rndBitsHandler);
        }

        btn._rndBitsHandler = () => {
            // Update active state
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Update modulation param
            updateModulationParam('rndBitLength', value);
        };

        btn.addEventListener('click', btn._rndBitsHandler);
    });
}

/**
 * Setup the RND probability slider
 */
function setupRNDProbSlider(probability) {
    const slider = document.getElementById('ppmod-rnd-prob');
    const valueDisplay = document.getElementById('ppmod-rnd-prob-val');

    if (!slider || !valueDisplay) return;

    slider.value = probability;
    valueDisplay.textContent = `${Math.round(probability)}%`;

    // Remove previous handler if any
    if (slider._rndProbHandler) {
        slider.removeEventListener('input', slider._rndProbHandler);
    }

    slider._rndProbHandler = (e) => {
        const value = parseFloat(e.target.value);
        valueDisplay.textContent = `${Math.round(value)}%`;
        updateModulationParam('rndProbability', value);
    };

    slider.addEventListener('input', slider._rndProbHandler);
}

/**
 * Setup RND rate slider with logarithmic scaling (100Hz - 10kHz)
 * Slider range: 0-100, maps to 100Hz - 10000Hz logarithmically
 */
function setupRNDRateSlider(rateHz) {
    const slider = document.getElementById('ppmod-rnd-rate');
    const valueDisplay = document.getElementById('ppmod-rnd-rate-val');

    if (!slider || !valueDisplay) return;

    // Convert Hz to slider position (0-100)
    const sliderPos = rateHzToSliderPos(rateHz);
    slider.value = sliderPos;
    valueDisplay.textContent = formatRateHz(rateHz);

    // Remove previous handler if any
    if (slider._rndRateHandler) {
        slider.removeEventListener('input', slider._rndRateHandler);
    }

    slider._rndRateHandler = (e) => {
        const pos = parseFloat(e.target.value);
        const hz = sliderPosToRateHz(pos);
        valueDisplay.textContent = formatRateHz(hz);
        updateModulationParam('rndSampleRate', hz);
    };

    slider.addEventListener('input', slider._rndRateHandler);
}

/**
 * Convert Hz to slider position (0-100)
 * Logarithmic scale: 100Hz at 0, 10000Hz at 100
 */
function rateHzToSliderPos(hz) {
    const minHz = 100;
    const maxHz = 10000;
    const clampedHz = Math.max(minHz, Math.min(maxHz, hz));
    const logMin = Math.log(minHz);
    const logMax = Math.log(maxHz);
    const logValue = Math.log(clampedHz);
    return ((logValue - logMin) / (logMax - logMin)) * 100;
}

/**
 * Convert slider position (0-100) to Hz
 * Logarithmic scale: 100Hz at 0, 10000Hz at 100
 */
function sliderPosToRateHz(pos) {
    const minHz = 100;
    const maxHz = 10000;
    const clampedPos = Math.max(0, Math.min(100, pos));
    const logMin = Math.log(minHz);
    const logMax = Math.log(maxHz);
    const logValue = logMin + (clampedPos / 100) * (logMax - logMin);
    return Math.exp(logValue);
}

/**
 * Format rate in Hz with appropriate units
 */
function formatRateHz(hz) {
    if (hz >= 1000) {
        return `${(hz / 1000).toFixed(1)}kHz`;
    }
    return `${Math.round(hz)}Hz`;
}

function populateENVControls(modConfig) {
    // ENV: source, attack, decay/release, curve shape
    const source = modConfig?.envSource ?? 'note-on';
    const attackMs = modConfig?.envAttackMs ?? 10;
    const releaseMs = modConfig?.envReleaseMs ?? 200;
    const curve = modConfig?.envCurveShape ?? 'exponential';

    // Setup source selector buttons
    setupENVSourceSelector(source);

    // Setup curve selector buttons
    setupENVCurveSelector(curve);

    // Setup attack slider (logarithmic: 0.2ms - 8000ms)
    setupENVTimeSlider('ppmod-env-attack', attackMs, 'envAttackMs');

    // Setup release slider (logarithmic: 0.2ms - 8000ms)
    setupENVTimeSlider('ppmod-env-release', releaseMs, 'envReleaseMs');
}

/**
 * Setup the ENV source selector (note-on | amp | filter)
 */
function setupENVSourceSelector(currentSource) {
    const container = document.getElementById('ppmod-env-source-btns');
    if (!container) return;

    const buttons = container.querySelectorAll('.ppmod-selector-btn');
    buttons.forEach(btn => {
        const value = btn.dataset.value;
        btn.classList.toggle('active', value === currentSource);

        // Remove previous handler if any
        if (btn._envSourceHandler) {
            btn.removeEventListener('click', btn._envSourceHandler);
        }

        btn._envSourceHandler = () => {
            // Update active state
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Update modulation param
            updateModulationParam('envSource', value);
        };

        btn.addEventListener('click', btn._envSourceHandler);
    });
}

/**
 * Setup the ENV curve selector (linear | exponential | logarithmic | sCurve)
 */
function setupENVCurveSelector(currentCurve) {
    const container = document.getElementById('ppmod-env-curve-btns');
    if (!container) return;

    const buttons = container.querySelectorAll('.ppmod-selector-btn');
    buttons.forEach(btn => {
        const value = btn.dataset.value;
        btn.classList.toggle('active', value === currentCurve);

        // Remove previous handler if any
        if (btn._envCurveHandler) {
            btn.removeEventListener('click', btn._envCurveHandler);
        }

        btn._envCurveHandler = () => {
            // Update active state
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Update modulation param
            updateModulationParam('envCurveShape', value);
        };

        btn.addEventListener('click', btn._envCurveHandler);
    });
}

/**
 * Setup ENV time slider with logarithmic scaling (0.2ms - 8000ms)
 * Slider range: 0-100, maps to 0.2ms - 8000ms logarithmically
 */
function setupENVTimeSlider(sliderId, valueMs, paramName) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(`${sliderId}-val`);

    if (!slider || !valueDisplay) return;

    // Convert ms to slider position (0-100)
    const sliderPos = msToSliderPos(valueMs);
    slider.value = sliderPos;
    valueDisplay.textContent = formatTimeMs(valueMs);

    // Remove previous handler if any
    if (slider._envTimeHandler) {
        slider.removeEventListener('input', slider._envTimeHandler);
    }

    slider._envTimeHandler = (e) => {
        const pos = parseFloat(e.target.value);
        const ms = sliderPosToMs(pos);
        valueDisplay.textContent = formatTimeMs(ms);
        updateModulationParam(paramName, ms);
    };

    slider.addEventListener('input', slider._envTimeHandler);
}

/**
 * Convert milliseconds to slider position (0-100)
 * Logarithmic scale: 0.2ms at 0, 8000ms at 100
 */
function msToSliderPos(ms) {
    const minMs = 0.2;
    const maxMs = 8000;
    const clampedMs = Math.max(minMs, Math.min(maxMs, ms));
    // Logarithmic mapping
    const logMin = Math.log(minMs);
    const logMax = Math.log(maxMs);
    const logValue = Math.log(clampedMs);
    return ((logValue - logMin) / (logMax - logMin)) * 100;
}

/**
 * Convert slider position (0-100) to milliseconds
 * Logarithmic scale: 0.2ms at 0, 8000ms at 100
 */
function sliderPosToMs(pos) {
    const minMs = 0.2;
    const maxMs = 8000;
    const clampedPos = Math.max(0, Math.min(100, pos));
    // Logarithmic mapping
    const logMin = Math.log(minMs);
    const logMax = Math.log(maxMs);
    const logValue = logMin + (clampedPos / 100) * (logMax - logMin);
    return Math.exp(logValue);
}

function populateEFControls(modConfig) {
    // EF: source, attack, release, sensitivity
    const source = modConfig?.efSource ?? 'raembl';
    const attackMs = modConfig?.efAttackMs ?? 10;
    const releaseMs = modConfig?.efReleaseMs ?? 100;
    const sensitivity = modConfig?.efSensitivity ?? 100;

    // Setup source selector
    setupEFSourceSelector(source);

    // Setup attack slider (logarithmic: 1ms - 1000ms)
    setupEFTimeSlider('ppmod-ef-attack', attackMs, 'efAttackMs');

    // Setup release slider (logarithmic: 1ms - 1000ms)
    setupEFTimeSlider('ppmod-ef-release', releaseMs, 'efReleaseMs');

    // Setup sensitivity slider
    setupEFSensitivitySlider(sensitivity);

    // Reset meter
    const meterFill = document.getElementById('ppmod-ef-meter-fill');
    if (meterFill) {
        meterFill.style.width = '0%';
    }
}

/**
 * Setup the EF source selector (raembl | baeng | master)
 */
function setupEFSourceSelector(currentSource) {
    const container = document.getElementById('ppmod-ef-source-btns');
    if (!container) return;

    const buttons = container.querySelectorAll('.ppmod-selector-btn');
    buttons.forEach(btn => {
        const value = btn.dataset.value;
        btn.classList.toggle('active', value === currentSource);

        if (btn._efSourceHandler) {
            btn.removeEventListener('click', btn._efSourceHandler);
        }

        btn._efSourceHandler = () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            updateModulationParam('efSource', value);
        };

        btn.addEventListener('click', btn._efSourceHandler);
    });
}

/**
 * Setup EF time slider with logarithmic scaling (1ms - 1000ms)
 */
function setupEFTimeSlider(sliderId, valueMs, paramName) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(`${sliderId}-val`);

    if (!slider || !valueDisplay) return;

    // Convert ms to slider position (0-100)
    const sliderPos = efMsToSliderPos(valueMs);
    slider.value = sliderPos;
    valueDisplay.textContent = formatTimeMs(valueMs);

    if (slider._efTimeHandler) {
        slider.removeEventListener('input', slider._efTimeHandler);
    }

    slider._efTimeHandler = (e) => {
        const pos = parseFloat(e.target.value);
        const ms = efSliderPosToMs(pos);
        valueDisplay.textContent = formatTimeMs(ms);
        updateModulationParam(paramName, ms);
    };

    slider.addEventListener('input', slider._efTimeHandler);
}

/**
 * Convert milliseconds to slider position (0-100)
 * Logarithmic scale: 1ms at 0, 1000ms at 100
 */
function efMsToSliderPos(ms) {
    const minMs = 1;
    const maxMs = 1000;
    const clampedMs = Math.max(minMs, Math.min(maxMs, ms));
    const logMin = Math.log(minMs);
    const logMax = Math.log(maxMs);
    const logValue = Math.log(clampedMs);
    return ((logValue - logMin) / (logMax - logMin)) * 100;
}

/**
 * Convert slider position (0-100) to milliseconds
 * Logarithmic scale: 1ms at 0, 1000ms at 100
 */
function efSliderPosToMs(pos) {
    const minMs = 1;
    const maxMs = 1000;
    const clampedPos = Math.max(0, Math.min(100, pos));
    const logMin = Math.log(minMs);
    const logMax = Math.log(maxMs);
    const logValue = logMin + (clampedPos / 100) * (logMax - logMin);
    return Math.exp(logValue);
}

/**
 * Setup EF sensitivity slider (0-200%)
 */
function setupEFSensitivitySlider(sensitivity) {
    const slider = document.getElementById('ppmod-ef-sensitivity');
    const valueDisplay = document.getElementById('ppmod-ef-sensitivity-val');

    if (!slider || !valueDisplay) return;

    slider.value = sensitivity;
    valueDisplay.textContent = `${Math.round(sensitivity)}%`;

    if (slider._efSensHandler) {
        slider.removeEventListener('input', slider._efSensHandler);
    }

    slider._efSensHandler = (e) => {
        const value = parseFloat(e.target.value);
        valueDisplay.textContent = `${Math.round(value)}%`;
        updateModulationParam('efSensitivity', value);
    };

    slider.addEventListener('input', slider._efSensHandler);
}

function populateTMControls(modConfig) {
    // TM: length, probability, pattern
    const length = modConfig?.tmLength ?? 8;
    const probability = modConfig?.tmProbability ?? 50;
    const pattern = modConfig?.tmPattern ?? generateTMPattern(length);

    // Setup length slider
    setupTMLengthSlider(length);

    // Setup probability slider
    setupTMProbSlider(probability);

    // Render pattern display
    renderTMPatternDisplay(pattern, modConfig?.tmCurrentStep ?? 0);

    // Setup randomise button
    setupTMRandomiseButton(length);
}

/**
 * Setup TM length slider
 */
function setupTMLengthSlider(length) {
    const slider = document.getElementById('ppmod-tm-length');
    const valueDisplay = document.getElementById('ppmod-tm-length-val');

    if (!slider || !valueDisplay) return;

    slider.value = length;
    valueDisplay.textContent = `${length} steps`;

    if (slider._tmLengthHandler) {
        slider.removeEventListener('input', slider._tmLengthHandler);
    }

    slider._tmLengthHandler = (e) => {
        const newLength = parseInt(e.target.value, 10);
        valueDisplay.textContent = `${newLength} steps`;
        updateModulationParam('tmLength', newLength);

        // Get current pattern and resize
        const modConfig = currentApp === 'raembl'
            ? window.raemblState?.perParamModulations?.[currentParamId]
            : null;
        let pattern = modConfig?.tmPattern ?? [];

        // Resize pattern
        while (pattern.length < newLength) {
            pattern.push(Math.random());
        }
        pattern = pattern.slice(0, newLength);
        updateModulationParam('tmPattern', pattern);

        // Re-render display
        renderTMPatternDisplay(pattern, modConfig?.tmCurrentStep ?? 0);
    };

    slider.addEventListener('input', slider._tmLengthHandler);
}

/**
 * Setup TM probability slider
 */
function setupTMProbSlider(probability) {
    const slider = document.getElementById('ppmod-tm-prob');
    const valueDisplay = document.getElementById('ppmod-tm-prob-val');

    if (!slider || !valueDisplay) return;

    slider.value = probability;
    valueDisplay.textContent = `${Math.round(probability)}%`;

    if (slider._tmProbHandler) {
        slider.removeEventListener('input', slider._tmProbHandler);
    }

    slider._tmProbHandler = (e) => {
        const value = parseFloat(e.target.value);
        valueDisplay.textContent = `${Math.round(value)}%`;
        updateModulationParam('tmProbability', value);
    };

    slider.addEventListener('input', slider._tmProbHandler);
}

/**
 * Render TM pattern display (read-only visualisation)
 */
function renderTMPatternDisplay(pattern, currentStep = 0) {
    const container = document.getElementById('ppmod-tm-pattern');
    if (!container) return;

    container.innerHTML = '';

    pattern.forEach((value, index) => {
        const step = document.createElement('div');
        step.className = 'ppmod-tm-step';
        if (index === currentStep) {
            step.classList.add('active');
        }

        const bar = document.createElement('div');
        bar.className = 'ppmod-tm-step-bar';
        bar.style.height = `${value * 100}%`;

        const label = document.createElement('div');
        label.className = 'ppmod-tm-step-label';
        label.textContent = index + 1;

        step.appendChild(bar);
        step.appendChild(label);
        container.appendChild(step);
    });
}

/**
 * Setup TM randomise button
 */
function setupTMRandomiseButton(length) {
    const button = document.getElementById('ppmod-tm-randomise');
    if (!button) return;

    if (button._tmRandomiseHandler) {
        button.removeEventListener('click', button._tmRandomiseHandler);
    }

    button._tmRandomiseHandler = () => {
        const modConfig = currentApp === 'raembl'
            ? window.raemblState?.perParamModulations?.[currentParamId]
            : null;
        const currentLength = modConfig?.tmLength ?? length;

        // Generate new random pattern
        const newPattern = generateTMPattern(currentLength);
        updateModulationParam('tmPattern', newPattern);

        // Re-render display
        renderTMPatternDisplay(newPattern, modConfig?.tmCurrentStep ?? 0);
    };

    button.addEventListener('click', button._tmRandomiseHandler);
}

/**
 * Generate a random TM pattern
 */
function generateTMPattern(length) {
    const pattern = [];
    for (let i = 0; i < length; i++) {
        pattern.push(Math.random());
    }
    return pattern;
}

function populateSEQControls(modConfig) {
    // SEQ: length, pattern
    const length = modConfig?.seqLength ?? 4;
    const pattern = modConfig?.seqPattern ?? new Array(length).fill(0.5);

    setSliderValue('ppmod-seq-length', length, (v) => `${Math.round(v)} steps`);

    // Render step editor
    renderSEQStepEditor(length, pattern);

    // Setup length slider change handler
    const lengthSlider = document.getElementById('ppmod-seq-length');
    if (lengthSlider) {
        // Remove previous handler if any (using a stored reference)
        if (lengthSlider._seqHandler) {
            lengthSlider.removeEventListener('input', lengthSlider._seqHandler);
        }

        lengthSlider._seqHandler = (e) => {
            const newLength = parseInt(e.target.value, 10);
            // Get current pattern from state if available (support both Ræmbl and Bæng)
            let currentPattern = [];
            if (currentParamId) {
                const modConfig = currentApp === 'raembl'
                    ? window.raemblState?.perParamModulations?.[currentParamId]
                    : window.baengState?.perParamModulations?.[currentParamId];

                if (currentIsVoiceParam && currentVoiceIndex !== null && modConfig?.voices) {
                    currentPattern = modConfig.voices[currentVoiceIndex]?.seqPattern || [];
                } else {
                    currentPattern = modConfig?.seqPattern || [];
                }
            }

            // Extend or truncate pattern
            const updatedPattern = [...currentPattern];
            while (updatedPattern.length < newLength) {
                updatedPattern.push(0.5);
            }
            const finalPattern = updatedPattern.slice(0, newLength);

            // Update slider display
            document.getElementById('ppmod-seq-length-val').textContent = `${newLength} steps`;

            // Update state
            updateModulationParam('seqLength', newLength);

            // Re-render step editor
            renderSEQStepEditor(newLength, finalPattern);
        };

        lengthSlider.addEventListener('input', lengthSlider._seqHandler);
    }
}

/**
 * Render the SEQ step editor with draggable step bars
 */
function renderSEQStepEditor(length, pattern) {
    const container = document.getElementById('ppmod-seq-editor');
    if (!container) return;

    // Clear existing content
    container.innerHTML = '';

    // Create step bars
    for (let i = 0; i < length; i++) {
        const stepValue = pattern[i] ?? 0.5;

        const stepContainer = document.createElement('div');
        stepContainer.className = 'ppmod-seq-step';
        stepContainer.dataset.step = i;
        stepContainer.title = 'Drag up/down to set step value';

        const stepBar = document.createElement('div');
        stepBar.className = 'ppmod-seq-step-bar';
        stepBar.style.height = `${stepValue * 100}%`;

        const stepLabel = document.createElement('div');
        stepLabel.className = 'ppmod-seq-step-label';
        stepLabel.textContent = i + 1;

        stepContainer.appendChild(stepBar);
        stepContainer.appendChild(stepLabel);
        container.appendChild(stepContainer);

        // Add drag interaction
        setupStepDragHandler(stepContainer, stepBar, i);
    }
}

/**
 * Setup drag handler for individual SEQ step
 */
function setupStepDragHandler(container, bar, stepIndex) {
    let isDragging = false;

    const updateStepValue = (e) => {
        const rect = container.getBoundingClientRect();
        // Calculate value (0 at bottom, 1 at top)
        const y = e.clientY ?? e.touches?.[0]?.clientY;
        if (y === undefined) return;

        const relY = rect.bottom - y;
        const height = rect.height - 20; // Account for label area
        const value = Math.max(0, Math.min(1, relY / height));

        // Update visual
        bar.style.height = `${value * 100}%`;

        // Update state
        updateModulationParam('seqStep', { step: stepIndex, value: value });
    };

    const startDrag = (e) => {
        if (e.target.classList.contains('ppmod-seq-step-label')) return;
        e.preventDefault();
        isDragging = true;
        updateStepValue(e);
    };

    const onDrag = (e) => {
        if (!isDragging) return;
        e.preventDefault();
        updateStepValue(e);
    };

    const stopDrag = () => {
        isDragging = false;
    };

    // Mouse events
    container.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);

    // Touch events
    container.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);
}

// ============================================================================
// Format Helpers
// ============================================================================

function formatTimeMs(ms) {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Apply envelope curve shape to normalised time (0-1)
 * @param {number} t - Normalised time (0-1)
 * @param {string} curveShape - 'linear' | 'exponential' | 'logarithmic' | 'sCurve'
 * @returns {number} Shaped value (0-1)
 */
function applyEnvCurve(t, curveShape) {
    t = Math.max(0, Math.min(1, t));
    const curvature = 3;

    switch (curveShape) {
        case 'linear':
            return t;
        case 'exponential':
            return 1 - Math.exp(-curvature * t) / (1 - Math.exp(-curvature));
        case 'logarithmic':
            if (t === 0) return 0;
            return Math.log(1 + t * (Math.exp(curvature) - 1)) / curvature;
        case 'sCurve':
            return t * t * (3 - 2 * t);
        default:
            return t;
    }
}

// ============================================================================
// Update Modulation Parameter
// ============================================================================

function updateModulationParam(paramName, value) {
    if (!currentParamId || !currentApp) return;

    // Dispatch event for the appropriate app to handle
    const event = new CustomEvent('ppmodUpdate', {
        detail: {
            paramId: currentParamId,
            app: currentApp,
            modParam: paramName,
            value: value,
            voiceIndex: currentVoiceIndex,
            isVoiceParam: currentIsVoiceParam
        }
    });
    document.dispatchEvent(event);
}

// ============================================================================
// Reset Handler
// ============================================================================

function handleReset() {
    if (!currentParamId || !currentApp) return;

    // Dispatch reset event
    const event = new CustomEvent('ppmodReset', {
        detail: {
            paramId: currentParamId,
            app: currentApp
        }
    });
    document.dispatchEvent(event);

    // Reset UI to defaults
    populateControls(null);
    selectMode('LFO');
}

// ============================================================================
// Visualisation
// ============================================================================

function startVisualisation() {
    if (animFrameId) return; // Already running

    const canvas = document.getElementById('ppmod-visualisation');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Get theme colour
    let themeColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color').trim() || '#f5a623';

    let frameCount = 0;
    let phase = 0;

    function draw() {
        // Update theme colour periodically
        frameCount++;
        if (frameCount % 60 === 0) {
            themeColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--theme-color').trim() || '#f5a623';
        }

        // Clear
        ctx.fillStyle = 'rgba(20, 20, 20, 1)';
        ctx.fillRect(0, 0, width, height);

        // Draw centre line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Draw modulation waveform preview based on current mode
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (currentMode === 'SEQ') {
            // Draw step pattern (support both Ræmbl and Bæng, including per-voice params)
            const modConfig = currentApp === 'raembl'
                ? window.raemblState?.perParamModulations?.[currentParamId]
                : window.baengState?.perParamModulations?.[currentParamId];

            let pattern, currentStep;
            if (currentIsVoiceParam && currentVoiceIndex !== null && modConfig?.voices) {
                pattern = modConfig.voices[currentVoiceIndex]?.seqPattern ?? [0.5, 0.5, 0.5, 0.5];
                currentStep = modConfig.voices[currentVoiceIndex]?.seqCurrentStep ?? 0;
            } else {
                pattern = modConfig?.seqPattern ?? [0.5, 0.5, 0.5, 0.5];
                currentStep = modConfig?.seqCurrentStep ?? 0;
            }
            const stepCount = pattern.length;
            const stepWidth = width / stepCount;
            const amp = height / 2 - 10;

            for (let i = 0; i < stepCount; i++) {
                const stepValue = (pattern[i] * 2 - 1); // Map 0-1 to -1 to +1
                const y = height / 2 - stepValue * amp;
                const x1 = i * stepWidth;
                const x2 = (i + 1) * stepWidth;

                if (i === 0) {
                    ctx.moveTo(x1, y);
                } else {
                    ctx.lineTo(x1, y);
                }
                ctx.lineTo(x2, y);
            }
            ctx.stroke();

            // Draw step markers
            ctx.fillStyle = `${themeColor}40`;
            for (let i = 1; i < stepCount; i++) {
                const x = i * stepWidth;
                ctx.fillRect(x - 0.5, 0, 1, height);
            }

            // Highlight current step (playhead)
            ctx.fillStyle = `${themeColor}60`;
            const currentX = currentStep * stepWidth;
            ctx.fillRect(currentX, 0, stepWidth, height);
        } else if (currentMode === 'ENV') {
            // Draw AD envelope shape
            const modConfig = currentApp === 'raembl'
                ? window.raemblState?.perParamModulations?.[currentParamId]
                : null;
            const attackMs = modConfig?.envAttackMs ?? 10;
            const releaseMs = modConfig?.envReleaseMs ?? 200;
            const curveShape = modConfig?.envCurveShape ?? 'exponential';
            const totalMs = attackMs + releaseMs;
            const attackRatio = attackMs / totalMs;
            const amp = height / 2 - 10;

            // Draw envelope shape (static, not animated)
            for (let x = 0; x < width; x++) {
                const t = x / width;
                let envValue;

                if (t < attackRatio) {
                    // Attack phase (0 to 1)
                    const attackT = t / attackRatio;
                    envValue = applyEnvCurve(attackT, curveShape);
                } else {
                    // Decay/Release phase (1 to 0)
                    const releaseT = (t - attackRatio) / (1 - attackRatio);
                    envValue = 1 - applyEnvCurve(releaseT, curveShape);
                }

                // Map 0-1 envelope to canvas (0 at bottom, 1 at top relative to centre)
                // Since we're bipolar, map 0→centre, 1→top
                const y = height / 2 - envValue * amp;

                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // Draw attack/release divider
            ctx.strokeStyle = `${themeColor}40`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(width * attackRatio, 0);
            ctx.lineTo(width * attackRatio, height);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label attack/release phases
            ctx.fillStyle = `${themeColor}80`;
            ctx.font = '8px sans-serif';
            ctx.fillText('ATK', 4, 12);
            ctx.fillText('REL', width * attackRatio + 4, 12);
        } else if (currentMode === 'RND') {
            // Draw sample-and-hold style random waveform
            const modConfig = currentApp === 'raembl'
                ? window.raemblState?.perParamModulations?.[currentParamId]
                : null;
            const sampleRateHz = modConfig?.rndSampleRate ?? 1000;

            // Calculate number of samples to show (based on rate, showing ~0.5 seconds)
            const displayDurationMs = 500;
            const numSamples = Math.max(4, Math.min(64, Math.round(sampleRateHz * displayDurationMs / 1000)));
            const stepWidth = width / numSamples;
            const amp = height / 2 - 10;

            // Use seeded random for consistent visualisation (changes each frame slightly)
            const seed = Math.floor(phase * 10);

            for (let i = 0; i < numSamples; i++) {
                // Pseudo-random value based on seed and index
                const randomValue = Math.sin((seed + i * 127.1) * 43758.5453) % 1;
                const y = height / 2 - randomValue * amp;
                const x1 = i * stepWidth;
                const x2 = (i + 1) * stepWidth;

                if (i === 0) {
                    ctx.moveTo(x1, y);
                } else {
                    ctx.lineTo(x1, y);
                }
                ctx.lineTo(x2, y);
            }
            ctx.stroke();

            // Draw sample markers (subtle)
            ctx.fillStyle = `${themeColor}30`;
            for (let i = 1; i < numSamples; i++) {
                const x = i * stepWidth;
                ctx.fillRect(x - 0.5, 0, 1, height);
            }
        } else if (currentMode === 'TM') {
            // Draw TM step pattern (similar to SEQ but with current step marker)
            const modConfig = currentApp === 'raembl'
                ? window.raemblState?.perParamModulations?.[currentParamId]
                : window.baengState?.perParamModulations?.[currentParamId];

            // For Bæng per-voice params, get the voice-specific config
            let pattern, currentStep;
            if (currentIsVoiceParam && currentVoiceIndex !== null && modConfig?.voices) {
                const voiceConfig = modConfig.voices[currentVoiceIndex];
                pattern = voiceConfig?.tmPattern ?? [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
                currentStep = voiceConfig?.tmCurrentStep ?? 0;
            } else {
                pattern = modConfig?.tmPattern ?? [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
                currentStep = modConfig?.tmCurrentStep ?? 0;
            }
            const stepCount = pattern.length;
            const stepWidth = width / stepCount;
            const amp = height / 2 - 10;

            for (let i = 0; i < stepCount; i++) {
                const stepValue = (pattern[i] * 2 - 1); // Map 0-1 to -1 to +1
                const y = height / 2 - stepValue * amp;
                const x1 = i * stepWidth;
                const x2 = (i + 1) * stepWidth;

                if (i === 0) {
                    ctx.moveTo(x1, y);
                } else {
                    ctx.lineTo(x1, y);
                }
                ctx.lineTo(x2, y);
            }
            ctx.stroke();

            // Draw step markers
            ctx.fillStyle = `${themeColor}40`;
            for (let i = 1; i < stepCount; i++) {
                const x = i * stepWidth;
                ctx.fillRect(x - 0.5, 0, 1, height);
            }

            // Highlight current step with brighter colour
            ctx.fillStyle = `${themeColor}60`;
            const highlightX = currentStep * stepWidth;
            ctx.fillRect(highlightX, 0, stepWidth, height);
        } else if (currentMode === 'EF') {
            // Draw envelope follower - shows a level meter style visualisation
            const amp = height / 2 - 10;

            // Get the current smoothed EF value from state (if available)
            const modConfig = currentApp === 'raembl'
                ? window.raemblState?.perParamModulations?.[currentParamId]
                : null;

            // Show a stylised envelope follower waveform
            // Draw a dynamic waveform that responds to a simulated input
            const simLevel = (Math.sin(phase * 3) + 1) / 2 * 0.7 + 0.15; // Simulated level

            // Draw background waveform hint
            ctx.strokeStyle = `${themeColor}30`;
            ctx.lineWidth = 1;
            for (let x = 0; x < width; x++) {
                const t = x / width;
                const wave = Math.sin((t * 8 + phase * 2) * Math.PI * 2) * 0.3;
                const y = height / 2 - wave * amp;
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();

            // Draw envelope follower output as a filled area
            ctx.fillStyle = `${themeColor}40`;
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            for (let x = 0; x < width; x++) {
                const t = x / width;
                // Envelope that follows the peaks of the waveform
                const envValue = Math.abs(Math.sin((t * 8 + phase * 2) * Math.PI * 2)) * simLevel;
                const y = height / 2 - envValue * amp;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(width, height / 2);
            ctx.closePath();
            ctx.fill();

            // Draw the smoothed envelope line
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let x = 0; x < width; x++) {
                const t = x / width;
                const envValue = Math.abs(Math.sin((t * 8 + phase * 2) * Math.PI * 2)) * simLevel;
                const y = height / 2 - envValue * amp;
                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        } else {
            // Draw LFO-style waveform based on selected waveform type
            const modConfig = currentApp === 'raembl'
                ? window.raemblState?.perParamModulations?.[currentParamId]
                : null;
            const waveformIndex = modConfig?.lfoWaveform ?? 0;
            const amp = height / 2 - 10;

            for (let x = 0; x < width; x++) {
                const t = x / width;
                const phaseT = (t + phase) % 1; // Normalised 0-1 phase
                const cycles = 2; // Show 2 cycles
                const cycleT = ((t * cycles + phase) % 1); // Position within current cycle
                let waveValue;

                switch (waveformIndex) {
                    case 0: // SIN
                        waveValue = Math.sin((t * cycles + phase) * Math.PI * 2);
                        break;
                    case 1: // TRI
                        waveValue = 1 - 4 * Math.abs(cycleT - 0.5);
                        break;
                    case 2: // SQR
                        waveValue = cycleT < 0.5 ? 1 : -1;
                        break;
                    case 3: // SAW (down)
                        waveValue = 1 - 2 * cycleT;
                        break;
                    case 4: // RAMP (up)
                        waveValue = -1 + 2 * cycleT;
                        break;
                    case 5: // S&H
                        // Sample and hold - step changes at regular intervals
                        const sampleIndex = Math.floor((t * cycles + phase) * 8);
                        const seed = sampleIndex * 127.1;
                        waveValue = (Math.sin(seed * 43758.5453) % 1) * 2 - 1;
                        break;
                    default:
                        waveValue = Math.sin((t * cycles + phase) * Math.PI * 2);
                }

                const y = height / 2 - waveValue * amp;

                if (x === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.stroke();
        }

        // Animate phase (only for LFO, RND, and EF modes)
        if (currentMode !== 'SEQ' && currentMode !== 'ENV' && currentMode !== 'TM') {
            // Get LFO rate from current modConfig
            let lfoRate = 1;
            const modConfig = currentApp === 'raembl'
                ? window.raemblState?.perParamModulations?.[currentParamId]
                : window.baengState?.perParamModulations?.[currentParamId];

            if (modConfig) {
                if (currentIsVoiceParam && currentVoiceIndex !== null && modConfig.voices) {
                    // Bæng per-voice param
                    lfoRate = modConfig.voices[currentVoiceIndex]?.lfoRate ?? modConfig.voices[currentVoiceIndex]?.rate ?? 1;
                } else {
                    // Global param (Ræmbl or Bæng effect)
                    lfoRate = modConfig.lfoRate ?? modConfig.rate ?? 1;
                }
            }

            // Scale phase by rate (0.01 base at rate=1 gives ~0.6 cycles/sec at 60fps)
            phase += 0.01 * lfoRate;
        }

        animFrameId = requestAnimationFrame(draw);
    }

    animFrameId = requestAnimationFrame(draw);
}

function stopVisualisation() {
    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }

    // Clear canvas
    const canvas = document.getElementById('ppmod-visualisation');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(20, 20, 20, 1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// ============================================================================
// Drag Handlers
// ============================================================================

function startDrag(e) {
    const modal = document.getElementById('ppmod-modal');
    if (!modal) return;

    if (e.type === 'touchstart') e.preventDefault();

    isDragging = true;
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

    const rect = modal.getBoundingClientRect();
    dragOffset.x = clientX - rect.left;
    dragOffset.y = clientY - rect.top;

    const header = modal.querySelector('.ppmod-modal-header');
    if (header) header.style.cursor = 'grabbing';
}

function onDrag(e) {
    if (!isDragging) return;

    const modal = document.getElementById('ppmod-modal');
    if (!modal) return;

    if (e.type === 'touchmove') e.preventDefault();

    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

    // Calculate new position
    let newX = clientX - dragOffset.x;
    let newY = clientY - dragOffset.y;

    // Constrain to viewport
    const maxX = window.innerWidth - modal.offsetWidth;
    const maxY = window.innerHeight - modal.offsetHeight;
    newX = Math.max(0, Math.min(newX, maxX));
    newY = Math.max(0, Math.min(newY, maxY));

    modal.style.left = `${newX}px`;
    modal.style.top = `${newY}px`;
}

function stopDrag() {
    if (!isDragging) return;
    isDragging = false;

    const modal = document.getElementById('ppmod-modal');
    if (modal) {
        const header = modal.querySelector('.ppmod-modal-header');
        if (header) header.style.cursor = 'grab';

        // Save position
        saveModalPosition();
    }
}

// ============================================================================
// Exports
// ============================================================================

export {
    MODES,
    MODE_DESCRIPTIONS,
    LFO_WAVEFORMS,
    ENV_CURVES,
    ENV_CURVE_NAMES
};
