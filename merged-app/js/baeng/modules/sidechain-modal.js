/**
 * Sidechain Ducking Modal UI
 *
 * Draggable modal for configuring per-effect sidechain ducking.
 * Triggered by duck buttons on effect modules.
 */

import { state } from '../state.js';
import { config } from '../config.js';
import { updateSidechainTaps, updateDuckingState } from './sidechain.js';
import { updateEngineParams } from './engine.js';

let currentEffect = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// Waveform animation state
let duckWaveformAnimId = null;

// Effect display names
const EFFECT_NAMES = {
    baengReverb: 'Bæng Reverb',
    baengDelay: 'Bæng Delay',
    baengClouds: 'Bæng Clouds',
    raemblReverb: 'Ræmbl Reverb',
    raemblDelay: 'Ræmbl Delay',
    raemblClouds: 'Ræmbl Clouds'
};

/**
 * Initialise the sidechain modal event handlers
 * Call once on app startup
 */
export function initSidechainModal() {
    const modal = document.getElementById('sidechain-modal');
    const header = document.getElementById('sidechain-modal-header');
    const closeBtn = document.getElementById('sidechain-modal-close-btn');

    if (!modal || !header || !closeBtn) {
        console.warn('[SidechainModal] Modal elements not found');
        return;
    }

    // Close button
    closeBtn.addEventListener('click', closeDuckModal);

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
            closeDuckModal();
        }
    });

    // Dragging handlers
    header.addEventListener('mousedown', startDrag);
    header.addEventListener('touchstart', startDrag, { passive: false });

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });

    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);

    // Enable checkbox
    document.getElementById('duck-enabled')?.addEventListener('change', (e) => {
        if (!currentEffect) return;
        state.sidechain[currentEffect].enabled = e.target.checked;
        updateDuckingState();
        updateDuckButtonVisuals();
    });

    // Voice checkboxes
    modal.querySelectorAll('[data-voice]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (!currentEffect) return;
            const voiceIndex = parseInt(e.target.dataset.voice, 10);
            state.sidechain[currentEffect].voices[voiceIndex] = e.target.checked;
            updateSidechainTaps();
        });
    });

    // Parameter sliders
    setupSlider('duck-threshold', 'threshold', formatThreshold);
    setupSlider('duck-ratio', 'ratio', formatRatio);
    setupSlider('duck-attack', 'attack', formatAttack);
    setupSlider('duck-release', 'release', formatRelease);
    setupSlider('duck-range', 'range', formatRange);

}

function setupSlider(sliderId, paramName, formatFn) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(`${sliderId}-val`);

    if (!slider || !valueDisplay) return;

    slider.addEventListener('input', (e) => {
        if (!currentEffect) return;
        const value = parseInt(e.target.value, 10);
        state.sidechain[currentEffect][paramName] = value;
        valueDisplay.textContent = formatFn(value);
    });
}

// Format functions for parameter displays
function formatThreshold(value) {
    // 0-100 → -60dB to 0dB
    const db = Math.round((value / 100) * 60 - 60);
    return `${db}dB`;
}

function formatRatio(value) {
    // 0-100 → 1:1 to 20:1
    const ratio = (1 + (value / 100) * 19).toFixed(1);
    return `${ratio}:1`;
}

function formatAttack(value) {
    // 0-100 → 0.1ms to 100ms (exponential)
    const ms = (0.1 * Math.pow(1000, value / 100)).toFixed(1);
    return `${ms}ms`;
}

function formatRelease(value) {
    // 0-100 → 10ms to 1000ms (exponential)
    const ms = Math.round(10 * Math.pow(100, value / 100));
    return `${ms}ms`;
}

function formatRange(value) {
    // 0-100 → 0dB to 40dB
    const db = Math.round((value / 100) * 40);
    return `${db}dB`;
}

/**
 * Open the ducking modal for a specific effect
 * @param {string} effectKey - Effect identifier (baengReverb, baengDelay, etc.)
 */
export function openDuckModal(effectKey) {
    currentEffect = effectKey;
    const cfg = state.sidechain[effectKey];

    if (!cfg) {
        console.error(`[SidechainModal] Unknown effect: ${effectKey}`);
        return;
    }

    const modal = document.getElementById('sidechain-modal');
    if (!modal) return;

    // Update title
    const title = document.getElementById('duck-modal-title');
    if (title) {
        title.textContent = `DUCKING: ${EFFECT_NAMES[effectKey] || effectKey}`;
    }

    // Populate enable checkbox
    const enableCheckbox = document.getElementById('duck-enabled');
    if (enableCheckbox) {
        enableCheckbox.checked = cfg.enabled;
    }

    // Populate voice checkboxes
    modal.querySelectorAll('[data-voice]').forEach(checkbox => {
        const voiceIndex = parseInt(checkbox.dataset.voice, 10);
        checkbox.checked = cfg.voices[voiceIndex];
    });

    // Populate sliders
    setSliderValue('duck-threshold', cfg.threshold, formatThreshold);
    setSliderValue('duck-ratio', cfg.ratio, formatRatio);
    setSliderValue('duck-attack', cfg.attack, formatAttack);
    setSliderValue('duck-release', cfg.release, formatRelease);
    setSliderValue('duck-range', cfg.range, formatRange);

    // Position modal near centre if not already positioned
    if (!modal.style.left || modal.style.left === '') {
        modal.style.left = `calc(50% - 140px)`;
        modal.style.top = '100px';
    }

    // Show modal
    modal.classList.remove('hidden');

    // Start waveform animation
    startDuckWaveform();
}

function setSliderValue(sliderId, value, formatFn) {
    const slider = document.getElementById(sliderId);
    const valueDisplay = document.getElementById(`${sliderId}-val`);

    if (slider) slider.value = value;
    if (valueDisplay) valueDisplay.textContent = formatFn(value);
}

/**
 * Close the ducking modal
 */
export function closeDuckModal() {
    const modal = document.getElementById('sidechain-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    currentEffect = null;
    stopDuckWaveform();
}

// Scrolling waveform history buffer
let waveformHistory = [];
let duckLevelHistory = [];
const HISTORY_LENGTH = 248; // Match canvas width

/**
 * Start the waveform animation for the ducked effect output
 * Scrolls right-to-left with ducked level overlay
 */
function startDuckWaveform() {
    if (duckWaveformAnimId) return; // Already running

    // Reset history buffers
    waveformHistory = new Array(HISTORY_LENGTH).fill(0);
    duckLevelHistory = new Array(HISTORY_LENGTH).fill(1);

    // Get theme colour
    let themeColor = getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color').trim() || '#f5a623';
    let frameCount = 0;

    function draw() {
        const canvas = document.getElementById('duck-waveform-canvas');
        if (!canvas || !currentEffect) {
            duckWaveformAnimId = requestAnimationFrame(draw);
            return;
        }

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // Update theme colour periodically
        frameCount++;
        if (frameCount % 60 === 0) {
            themeColor = getComputedStyle(document.documentElement)
                .getPropertyValue('--theme-color').trim() || '#f5a623';
        }

        // Get analyser for current effect
        const analyser = config.duckingAnalysers?.[currentEffect];
        const gainNode = config.duckingGains?.[currentEffect];

        if (analyser) {
            // Get current waveform sample (RMS of buffer)
            const dataArray = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(dataArray);

            // Calculate RMS for this frame
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sum += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sum / dataArray.length);

            // Shift history left, add new sample on right
            waveformHistory.shift();
            waveformHistory.push(rms);
        }

        // Get current ducking gain level
        if (gainNode) {
            const currentGain = gainNode.gain.value;
            duckLevelHistory.shift();
            duckLevelHistory.push(currentGain);
        }

        // Clear with dark background
        ctx.fillStyle = 'rgba(20, 20, 20, 1)';
        ctx.fillRect(0, 0, width, height);

        // Draw centre line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Draw scrolling waveform (RMS envelope) with theme colour
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        for (let i = 0; i < waveformHistory.length; i++) {
            const rms = waveformHistory[i];
            // Scale RMS (typically 0-0.5) to fill canvas height
            const amplitude = Math.min(rms * 4, 1); // Scale up, cap at 1
            const yTop = (height / 2) - (amplitude * (height / 2) * 0.9);
            const yBottom = (height / 2) + (amplitude * (height / 2) * 0.9);

            if (i === 0) {
                ctx.moveTo(i, yTop);
            } else {
                ctx.lineTo(i, yTop);
            }
        }
        // Draw bottom half (mirror)
        for (let i = waveformHistory.length - 1; i >= 0; i--) {
            const rms = waveformHistory[i];
            const amplitude = Math.min(rms * 4, 1);
            const yBottom = (height / 2) + (amplitude * (height / 2) * 0.9);
            ctx.lineTo(i, yBottom);
        }
        ctx.closePath();
        ctx.fillStyle = themeColor + '40'; // Semi-transparent fill
        ctx.fill();
        ctx.stroke();

        // Draw ducked level overlay line (shows gain reduction) - use theme colour
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = 2;
        ctx.beginPath();

        for (let i = 0; i < duckLevelHistory.length; i++) {
            const gain = duckLevelHistory[i];
            // Map gain (0-1) to Y position (top = 1, bottom = 0)
            const y = (1 - gain) * (height * 0.9) + (height * 0.05);

            if (i === 0) {
                ctx.moveTo(i, y);
            } else {
                ctx.lineTo(i, y);
            }
        }
        ctx.stroke();

        // Draw threshold marker line if ducking is enabled
        const cfg = state.sidechain[currentEffect];
        if (cfg?.enabled) {
            // Threshold: 0-100 → -60dB to 0dB, map to Y position
            const thresholdDb = (cfg.threshold / 100) * 60 - 60;
            // Map -60dB to 0dB to canvas height (0dB at top)
            const thresholdY = ((60 + thresholdDb) / 60) * height;

            ctx.strokeStyle = themeColor + '80'; // Theme colour at 50% opacity
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, thresholdY);
            ctx.lineTo(width, thresholdY);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        duckWaveformAnimId = requestAnimationFrame(draw);
    }

    duckWaveformAnimId = requestAnimationFrame(draw);
}

/**
 * Stop the waveform animation
 */
function stopDuckWaveform() {
    if (duckWaveformAnimId) {
        cancelAnimationFrame(duckWaveformAnimId);
        duckWaveformAnimId = null;
    }

    // Clear canvas
    const canvas = document.getElementById('duck-waveform-canvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(20, 20, 20, 1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// Drag handlers
function startDrag(e) {
    const modal = document.getElementById('sidechain-modal');
    if (!modal) return;

    if (e.type === 'touchstart') e.preventDefault();

    isDragging = true;
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

    const rect = modal.getBoundingClientRect();
    dragOffset.x = clientX - rect.left;
    dragOffset.y = clientY - rect.top;

    modal.querySelector('.modal-header').style.cursor = 'grabbing';
}

function onDrag(e) {
    if (!isDragging) return;

    const modal = document.getElementById('sidechain-modal');
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

    const modal = document.getElementById('sidechain-modal');
    if (modal) {
        const header = modal.querySelector('.modal-header');
        if (header) header.style.cursor = 'grab';
    }
}

/**
 * Update duck button visuals to reflect enabled/disabled state
 * Adds/removes 'active' class based on state.sidechain[effectKey].enabled
 */
export function updateDuckButtonVisuals() {
    const effectKeys = ['baengReverb', 'baengDelay', 'baengClouds', 'raemblReverb', 'raemblDelay', 'raemblClouds'];

    effectKeys.forEach(effectKey => {
        const btn = document.querySelector(`.duck-btn[data-effect="${effectKey}"]`);
        if (btn) {
            const isEnabled = state.sidechain[effectKey]?.enabled;
            btn.classList.toggle('active', isEnabled);
        }
    });
}
