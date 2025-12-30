/**
 * Bæng Clouds FX Module
 *
 * Granular processor with LED ring knob interface.
 * Replaces waveguide module when fxMode === 'clouds'.
 *
 * Parameters (10 total, 5 rows of 2 knobs):
 * - Row 1: TEX, POS
 * - Row 2: SIZE, DENS
 * - Row 3: PITCH (bipolar), SPRD
 * - Row 4: FB, VERB
 * - Row 5: D/W, IN
 */

import { state } from '../state.js';
import { config } from '../config.js';
import { updateFXMode, updateCloudsParams } from './engine.js';
import { setupLEDRingKnobs } from '../ui/ledRingKnobs.js';
import { BufferVisualisation } from '../../raembl/modules/buffer-viz.js';
import { subscribe as subscribeToSharedClock } from '../../shared/clock.js';
import { openDuckModal } from './sidechain-modal.js';

// Mode definitions (6 modes total - 4 original Clouds + 2 parasites)
const CLOUDS_MODES = [
    { index: 0, label: 'GRANULAR', short: 'GRAN' },
    { index: 1, label: 'PITCH-SHIFT', short: 'WSOLA' },
    { index: 2, label: 'LOOPING', short: 'LOOP' },
    { index: 3, label: 'SPECTRAL', short: 'SPEC' },
    { index: 4, label: 'OLIVERB', short: 'VERB' },
    { index: 5, label: 'RESONESTOR', short: 'RESO' }
];

// Quality presets
const QUALITY_PRESETS = [
    { index: 0, label: 'HI', desc: '16b/ST/1s' },
    { index: 1, label: 'MED', desc: '16b/MO/2s' },
    { index: 2, label: 'LO', desc: '8b/ST/4s' },
    { index: 3, label: 'XLO', desc: '8b/MO/8s' }
];

let isFrozen = false;
let currentQualityIndex = 0;
let bufferViz = null;
let clockSyncEnabled = false;
let clockUnsubscribe = null;

/**
 * Handle clock step events for tempo-synced granular effects
 * @param {Object} event - Clock event with stepCounter, audioTime, etc.
 */
function handleClockStep(event) {
    if (event.type !== 'step') return;

    // Only process even step counts (0, 2, 4, 6...)
    // This avoids swung beats (odd steps have swing offset applied)
    const isEvenStep = (event.stepCounter % 2) === 0;

    if (isEvenStep && config.cloudsNode) {
        // Send trigger message to Clouds worklet
        // This will be used by engines that support trigger input
        config.cloudsNode.port.postMessage({
            command: 'trigger',
            audioTime: event.audioTime
        });
    }
}

/**
 * Render Clouds module HTML
 * @returns {string} HTML string for the module
 */
export function renderCloudsModuleHTML() {
    const currentMode = CLOUDS_MODES[state.cloudsMode] || CLOUDS_MODES[0];
    const currentQuality = QUALITY_PRESETS[state.cloudsQuality] || QUALITY_PRESETS[0];

    return `
        <div class="module-header-container">
            <button class="randomize-button" data-module="clouds" data-info-id="baeng-clouds-randomize" title="Randomise Clouds Parameters">
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

            <div class="clouds-mode-dropdown" data-info-id="baeng-clouds-mode">
                <button class="clouds-mode-btn" id="baeng-clouds-mode-btn" aria-haspopup="listbox" aria-expanded="false">
                    <span class="mode-label">${currentMode.short}</span>
                    <svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6">
                        <path d="M1 1 L4 4 L7 1" stroke="currentColor" fill="none" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </button>
                <div class="clouds-mode-menu hidden" id="baeng-clouds-mode-menu" role="listbox">
                    ${CLOUDS_MODES.map(m => `
                        <button class="mode-option ${m.index === state.cloudsMode ? 'selected' : ''}"
                                role="option"
                                data-mode="${m.index}"
                                aria-selected="${m.index === state.cloudsMode}">
                            ${m.label}
                        </button>
                    `).join('')}
                </div>
            </div>

            <button class="clouds-quality-btn" id="baeng-clouds-quality-btn" data-info-id="baeng-clouds-quality" title="Buffer Quality: ${currentQuality.desc}">
                ${currentQuality.label}
            </button>

            <button class="clouds-freeze-btn ${isFrozen ? 'active' : ''}" id="baeng-clouds-freeze-btn" data-info-id="baeng-clouds-freeze" title="Freeze Buffer">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="12 23.5 12 17.75 12 15.32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="12 8.68 12 6.25 12 0.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="15.83 2.42 12 6.25 8.17 2.42" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="8.17 21.58 12 17.75 15.83 21.58" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="21.96 17.75 16.98 14.88 14.88 13.66" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="9.13 10.34 7.02 9.13 2.04 6.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="5.62 3.89 7.02 9.13 1.78 10.53" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="18.38 20.11 16.98 14.88 22.22 13.47" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="2.04 17.75 7.02 14.88 9.13 13.66" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="14.88 10.34 16.98 9.13 21.96 6.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="18.38 3.89 16.98 9.13 22.22 10.53" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="5.62 20.11 7.02 14.88 1.78 13.47" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polygon points="14.88 10.34 14.88 13.66 12 15.32 9.13 13.66 9.13 10.34 12 8.68 14.88 10.34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                </svg>
            </button>

            <button class="clouds-sync-btn ${clockSyncEnabled ? 'active' : ''}" id="baeng-clouds-sync-btn" data-info-id="baeng-clouds-sync" title="Clock Sync">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 17V12H15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>

            <button class="duck-btn" data-effect="baengClouds" data-info-id="baeng-clouds-duck" title="Sidechain Ducking">
                <svg width="14" height="14" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.406,25.591c0,0 2.059,0.83 1.986,2.891c-0.072,2.062 -6.66,2.957 -6.66,11.094c0,8.137 9.096,14.532 19.217,14.532c10.12,0 23.872,-5.932 23.872,-17.83c0,-19.976 -1.513,-6.134 -17.276,-6.134c-5.235,0 -6.169,-1.787 -5.342,-2.806c3.91,-4.811 5.342,-17.446 -7.42,-17.446c-8.327,0.173 -10.338,6.946 -10.325,8.587c0.008,1.153 -1.204,1.543 -7.308,1.308c-1.536,5.619 9.256,5.804 9.256,5.804Zm3.77,-10.366c1.104,0 2,0.897 2,2c0,1.104 -0.896,2 -2,2c-1.103,0 -2,-0.896 -2,-2c0,-1.103 0.897,-2 2,-2Z"/>
                </svg>
            </button>
        </div>

        <!-- Canvas for buffer visualisation -->
        <canvas id="baeng-clouds-canvas" width="200" height="100"></canvas>

        <!-- Row 1: PITCH, POS, DENS, SIZE, TEX (same order as Ræmbl) -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-clouds-pitch">
                <div class="knob-label">PITCH</div>
                <div class="led-ring-knob" data-mode="bipolar" data-param-id="effects.cloudsPitch">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${formatPitchValue(state.cloudsPitch)}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-clouds-pos">
                <div class="knob-label">POS</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.cloudsPosition">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.cloudsPosition}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-clouds-dens">
                <div class="knob-label">DENS</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.cloudsDensity">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.cloudsDensity}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-clouds-size">
                <div class="knob-label">SIZE</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.cloudsSize">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.cloudsSize}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-clouds-tex">
                <div class="knob-label">TEX</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.cloudsTexture">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.cloudsTexture}</div>
            </div>
        </div>

        <!-- Row 2: D/W, SPRD, FB, VERB, IN (same order as Ræmbl) -->
        <div class="knob-section">
            <div class="knob-container" data-info-id="baeng-clouds-dw">
                <div class="knob-label">D/W</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.cloudsDryWet">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.cloudsDryWet}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-clouds-sprd">
                <div class="knob-label">SPRD</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.cloudsSpread">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.cloudsSpread}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-clouds-fb">
                <div class="knob-label">FB</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.cloudsFeedback">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.cloudsFeedback}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-clouds-verb">
                <div class="knob-label">VERB</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.cloudsReverb">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${state.cloudsReverb}</div>
            </div>
            <div class="knob-container" data-info-id="baeng-clouds-in">
                <div class="knob-label">IN</div>
                <div class="led-ring-knob" data-mode="continuous" data-param-id="effects.cloudsInputGain">
                    <canvas width="100" height="100"></canvas>
                </div>
                <div class="knob-value">${formatInputGainValue(state.cloudsInputGain)}</div>
            </div>
        </div>
    `;
}

/**
 * Format pitch value for display (0-100 → -24 to +24 semitones)
 */
function formatPitchValue(value) {
    const semitones = Math.round(((value - 50) / 50) * 24);
    if (semitones === 0) return '0st';
    return semitones > 0 ? `+${semitones}st` : `${semitones}st`;
}

/**
 * Format input gain value for display (0-100 → 0-200%)
 */
function formatInputGainValue(value) {
    const percent = Math.round((value / 50) * 100);
    return `${percent}%`;
}

/**
 * Setup Clouds module event handlers
 * Called after the module is rendered
 */
export function setupCloudsEventHandlers() {
    // Mode dropdown toggle
    const modeBtn = document.getElementById('baeng-clouds-mode-btn');
    const modeMenu = document.getElementById('baeng-clouds-mode-menu');

    if (modeBtn && modeMenu) {
        modeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = modeBtn.getAttribute('aria-expanded') === 'true';
            modeBtn.setAttribute('aria-expanded', !isExpanded);
            modeMenu.classList.toggle('hidden', isExpanded);
        });

        // Mode option selection
        modeMenu.querySelectorAll('.mode-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const newMode = parseInt(option.dataset.mode);
                state.cloudsMode = newMode;

                // Update UI
                modeMenu.querySelectorAll('.mode-option').forEach(opt => {
                    opt.classList.toggle('selected', parseInt(opt.dataset.mode) === newMode);
                    opt.setAttribute('aria-selected', parseInt(opt.dataset.mode) === newMode);
                });

                const modeLabel = modeBtn.querySelector('.mode-label');
                if (modeLabel) {
                    modeLabel.textContent = CLOUDS_MODES[newMode].short;
                }

                // Close menu
                modeBtn.setAttribute('aria-expanded', 'false');
                modeMenu.classList.add('hidden');

                // Send to processor
                if (config.cloudsNode && config.cloudsNode.port) {
                    config.cloudsNode.port.postMessage({
                        command: 'setMode',
                        value: newMode
                    });
                }
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!modeBtn.contains(e.target) && !modeMenu.contains(e.target)) {
                modeBtn.setAttribute('aria-expanded', 'false');
                modeMenu.classList.add('hidden');
            }
        });
    }

    // Quality button
    const qualityBtn = document.getElementById('baeng-clouds-quality-btn');
    if (qualityBtn) {
        qualityBtn.addEventListener('click', () => {
            currentQualityIndex = (currentQualityIndex + 1) % QUALITY_PRESETS.length;
            state.cloudsQuality = currentQualityIndex;

            const preset = QUALITY_PRESETS[currentQualityIndex];
            qualityBtn.textContent = preset.label;
            qualityBtn.title = `Buffer Quality: ${preset.desc}`;

            // Send quality settings to processor
            if (config.cloudsNode && config.cloudsNode.port) {
                const isLofi = currentQualityIndex >= 2;
                const isMono = currentQualityIndex === 1 || currentQualityIndex === 3;

                config.cloudsNode.port.postMessage({ command: 'setLofiMode', value: isLofi });
                config.cloudsNode.port.postMessage({ command: 'setMonoMode', value: isMono });
            }
        });
    }

    // Freeze button
    const freezeBtn = document.getElementById('baeng-clouds-freeze-btn');
    if (freezeBtn) {
        freezeBtn.addEventListener('click', () => {
            isFrozen = !isFrozen;
            state.cloudsFreeze = isFrozen;
            freezeBtn.classList.toggle('active', isFrozen);

            if (config.cloudsNode && config.cloudsNode.port) {
                config.cloudsNode.port.postMessage({
                    command: 'setFreeze',
                    value: isFrozen
                });
            }
        });
    }

    // Clock sync button
    const syncBtn = document.getElementById('baeng-clouds-sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            clockSyncEnabled = !clockSyncEnabled;
            syncBtn.classList.toggle('active', clockSyncEnabled);

            // Subscribe or unsubscribe from clock
            if (clockSyncEnabled) {
                clockUnsubscribe = subscribeToSharedClock(handleClockStep);
            } else {
                if (clockUnsubscribe) {
                    clockUnsubscribe();
                    clockUnsubscribe = null;
                }
            }
        });
    }

    // Randomise button
    const randomBtn = document.querySelector('#baeng-clouds-fx .randomize-button');
    if (randomBtn) {
        randomBtn.addEventListener('click', () => {
            randomiseCloudsParams();
        });
    }

    // Duck button (sidechain ducking modal)
    const duckBtn = document.querySelector('.duck-btn[data-effect="baengClouds"]');
    if (duckBtn) {
        duckBtn.addEventListener('click', () => {
            openDuckModal('baengClouds');
        });
    }

    // Initialize buffer visualisation
    initCloudsVisualisation();
}

/**
 * Initialize Clouds buffer visualisation
 */
function initCloudsVisualisation() {
    // Wait for Clouds processor to be ready
    if (!config.cloudsNode || !config.cloudsReady) {
        // Retry after a short delay if processor isn't ready yet
        setTimeout(initCloudsVisualisation, 100);
        return;
    }

    // Stop existing visualisation if any
    if (bufferViz) {
        bufferViz.stop();
        bufferViz = null;
    }

    // Create new visualisation instance
    bufferViz = new BufferVisualisation('baeng-clouds-canvas', config.cloudsNode);

    // Set up callback to receive buffer data from engine.js message handler
    config.cloudsBufferCallback = (data) => {
        if (bufferViz) {
            bufferViz.updateBuffer(data);
        }
    };

    bufferViz.start();

    console.log('[Bæng Clouds] Buffer visualisation started');
}

/**
 * Start Clouds visualisation (called when FX mode switches to clouds)
 */
export function startCloudsVisualisation() {
    if (bufferViz) {
        bufferViz.start();
    } else {
        initCloudsVisualisation();
    }
}

/**
 * Stop Clouds visualisation (called when FX mode switches away from clouds)
 */
export function stopCloudsVisualisation() {
    if (bufferViz) {
        bufferViz.stop();
    }
}

/**
 * Randomise Clouds parameters
 */
function randomiseCloudsParams() {
    // Randomise main parameters (not feedback - keep it safe)
    state.cloudsPosition = Math.floor(Math.random() * 100);
    state.cloudsSize = Math.floor(Math.random() * 100);
    state.cloudsDensity = Math.floor(Math.random() * 100);
    state.cloudsTexture = Math.floor(Math.random() * 100);
    state.cloudsPitch = Math.floor(Math.random() * 100);
    state.cloudsSpread = Math.floor(Math.random() * 100);
    state.cloudsReverb = Math.floor(Math.random() * 60); // Keep reverb moderate
    state.cloudsDryWet = 30 + Math.floor(Math.random() * 70); // At least some wet
    state.cloudsInputGain = 40 + Math.floor(Math.random() * 30); // Keep around unity

    // Keep feedback low for safety
    state.cloudsFeedback = Math.floor(Math.random() * 40);

    // Randomise mode
    state.cloudsMode = Math.floor(Math.random() * CLOUDS_MODES.length);

    // Update processor
    updateCloudsParams();

    // Update UI - re-render the module
    const module = document.getElementById('baeng-clouds-fx');
    if (module) {
        module.innerHTML = renderCloudsModuleHTML();
        setupCloudsEventHandlers();

        // Re-initialise LED ring knobs
        setupLEDRingKnobs();
    }
}

/**
 * Update Clouds module visibility based on fxMode
 */
export function updateCloudsVisibility() {
    const cloudsModule = document.getElementById('baeng-clouds-fx');
    const reverbModule = document.getElementById('reverb-fx');
    const delayModule = document.getElementById('delay-fx');

    if (state.fxMode === 'clouds') {
        cloudsModule?.classList.remove('hidden');
        reverbModule?.classList.add('hidden');
        delayModule?.classList.add('hidden');

        // Start visualisation when Clouds is visible
        startCloudsVisualisation();
    } else {
        cloudsModule?.classList.add('hidden');
        reverbModule?.classList.remove('hidden');
        delayModule?.classList.remove('hidden');

        // Stop visualisation when Clouds is hidden
        stopCloudsVisualisation();
    }

    // Update Bæng spacer panel
    updateBaengSpacer();

    // Reinitialise circuit pattern on FX mode change
    // Destroy existing and create fresh to ensure clean state
    setTimeout(() => {
        const canvas = document.getElementById('baeng-spacer-canvas');
        if (!canvas) return;

        // Destroy existing pattern manager
        if (window.baengSpacerPattern) {
            window.baengSpacerPattern.destroy();
            window.baengSpacerPattern = null;
        }

        // Create fresh pattern manager with new random source
        import('../../shared/circuit-pattern.js').then(({ SpacerPatternManager }) => {
            window.baengSpacerPattern = new SpacerPatternManager('baeng-spacer-canvas');
            window.baengSpacerPattern.init().then(() => {
                window.baengSpacerPattern.startAnimation();
                console.log('[Bæng] Circuit pattern reinitialised on FX mode change');
            });
        });
    }, 100);
}

/**
 * Update Bæng spacer panel (between engine and FX modules)
 * Always shows 1 spacer regardless of FX mode
 */
export function updateBaengSpacer() {
    const mainRow = document.getElementById('baeng-main-row');
    const engineModule = document.getElementById('baeng-engine');
    if (!mainRow || !engineModule) return;

    // Check if spacer already exists
    let spacer = document.getElementById('baeng-spacer-1');

    if (!spacer) {
        // Create spacer
        spacer = document.createElement('div');
        spacer.id = 'baeng-spacer-1';
        spacer.className = 'module spacer-panel';

        // Add canvas for circuit pattern
        const canvas = document.createElement('canvas');
        canvas.id = 'baeng-spacer-canvas';
        spacer.appendChild(canvas);
    }

    // Always ensure spacer is positioned immediately after ENGINE module
    // (fixes bug where spacer stays in wrong position when ENGINE is re-inserted)
    if (spacer.previousElementSibling !== engineModule) {
        engineModule.insertAdjacentElement('afterend', spacer);
    }
}
