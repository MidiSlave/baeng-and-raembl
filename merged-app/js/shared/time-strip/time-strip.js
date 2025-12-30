/**
 * File: merged-app/js/shared/time-strip/time-strip.js
 * Time strip component with simple faders
 */

// Fader definitions - LENGTH range is 1-128 (not 1-16 as in prototype)
const FADERS = {
    'shared-bpm': {
        label: 'BPM',
        min: 20,
        max: 300,
        default: 120,
        format: (v) => Math.round(v).toString()
    },
    'shared-swing': {
        label: 'SWING',
        min: 0,
        max: 100,
        default: 0,
        format: (v) => `${Math.round(v)}%`
    },
    'baeng-length': {
        label: 'LENGTH',
        min: 1,
        max: 128,
        default: 4,
        format: (v) => Math.round(v).toString()
    },
    'raembl-length': {
        label: 'LENGTH',
        min: 1,
        max: 128,
        default: 4,
        format: (v) => Math.round(v).toString()
    }
};

// Module state
let callbacks = {};
let activeFader = null;

/**
 * Render the time strip into a container
 */
export function renderTimeStrip(container) {
    const html = `
        <div class="time-strip">
            <!-- Left section: Bæng -->
            <div class="strip-section left">
                <span class="strip-label">BÆNG</span>
                <button class="strip-btn strip-settings-btn" data-param-id="baeng-settings" title="Bæng Settings">
                    ${gearIcon()}
                </button>
                <span class="strip-display" id="baeng-display">1.1.1</span>
                ${renderFader('baeng-length')}
            </div>

            <!-- Centre section: Shared controls -->
            <div class="strip-section centre">
                ${renderFader('shared-bpm')}
                <button class="strip-btn strip-play-btn" id="strip-play-btn" data-param-id="shared-play" title="Play/Stop">
                    ▶
                </button>
                <button class="strip-btn strip-info-btn" id="strip-info-btn" data-param-id="info-button" title="Parameter Info">
                    i
                </button>
                ${renderFader('shared-swing')}
            </div>

            <!-- Right section: Ræmbl -->
            <div class="strip-section right">
                ${renderFader('raembl-length')}
                <span class="strip-display" id="raembl-display">1.1.1</span>
                <button class="strip-btn strip-settings-btn" data-param-id="raembl-settings" title="Ræmbl Settings">
                    ${gearIcon()}
                </button>
                <span class="strip-label">RÆMBL</span>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * Render a simple fader
 */
function renderFader(id) {
    const config = FADERS[id];
    if (!config) return '';

    const position = valueToPosition(config.default, config.min, config.max);

    return `
        <div class="simple-fader-container" data-fader-id="${id}" data-param-id="${id}">
            <span class="simple-fader-label">${config.label}</span>
            <div class="simple-fader-track" style="--fader-position: ${position}">
                <div class="simple-fader-fill"></div>
                <div class="simple-fader-thumb"></div>
            </div>
            <span class="simple-fader-value">${config.format(config.default)}</span>
        </div>
    `;
}

/**
 * Gear icon SVG
 */
function gearIcon() {
    return `
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.31-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"/>
        </svg>
    `;
}

/**
 * Convert value to fader position (0-100)
 */
function valueToPosition(value, min, max) {
    return ((value - min) / (max - min)) * 100;
}

/**
 * Convert fader position (0-100) to value
 */
function positionToValue(position, min, max) {
    return min + (position / 100) * (max - min);
}

/**
 * Initialise fader interactions
 */
export function initSimpleFaders(cbs) {
    callbacks = cbs || {};

    // Find all fader containers
    const faders = document.querySelectorAll('.simple-fader-container');

    faders.forEach(container => {
        const track = container.querySelector('.simple-fader-track');
        if (!track) return;

        // Mouse events
        track.addEventListener('mousedown', (e) => startFaderDrag(e, container));

        // Touch events
        track.addEventListener('touchstart', (e) => startFaderDrag(e, container), { passive: false });
    });

    // Global move and up handlers
    document.addEventListener('mousemove', onFaderDrag);
    document.addEventListener('mouseup', endFaderDrag);
    document.addEventListener('touchmove', onFaderDrag, { passive: false });
    document.addEventListener('touchend', endFaderDrag);

    console.log('[TimeStrip] Faders initialised');
}

/**
 * Start fader drag
 */
function startFaderDrag(e, container) {
    e.preventDefault();

    const faderId = container.dataset.faderId;
    const config = FADERS[faderId];
    if (!config) return;

    const track = container.querySelector('.simple-fader-track');
    const rect = track.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;

    // Get current position from CSS custom property
    const currentPosition = parseFloat(track.style.getPropertyValue('--fader-position')) || 50;

    activeFader = {
        container,
        track,
        faderId,
        config,
        // For fine control (Shift+drag)
        startX: clientX,
        startPosition: currentPosition,
        trackWidth: rect.width
    };

    container.classList.add('dragging');
    updateFaderFromEvent(e);
}

/**
 * Handle fader drag
 */
function onFaderDrag(e) {
    if (!activeFader) return;
    e.preventDefault();
    updateFaderFromEvent(e);
}

/**
 * End fader drag
 */
function endFaderDrag() {
    if (!activeFader) return;

    activeFader.container.classList.remove('dragging');
    activeFader = null;
}

/**
 * Update fader from mouse/touch event
 * Supports Shift+drag for fine control (10x precision)
 */
function updateFaderFromEvent(e) {
    if (!activeFader) return;

    const { track, config, faderId, container, startX, startPosition, trackWidth } = activeFader;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;

    let position;

    // Shift+drag = fine control (10x precision)
    if (e.shiftKey) {
        const deltaX = clientX - startX;
        const deltaPct = (deltaX / trackWidth) * 100;
        // Divide by 10 for fine control
        position = startPosition + (deltaPct / 10);
    } else {
        // Normal drag = absolute position
        const rect = track.getBoundingClientRect();
        position = ((clientX - rect.left) / rect.width) * 100;
        // Update start position for seamless Shift transitions
        activeFader.startX = clientX;
        activeFader.startPosition = position;
    }

    // Clamp position
    position = Math.max(0, Math.min(100, position));

    // Convert to value
    const value = positionToValue(position, config.min, config.max);

    // Update UI
    track.style.setProperty('--fader-position', position);

    const valueEl = container.querySelector('.simple-fader-value');
    if (valueEl) {
        valueEl.textContent = config.format(value);
    }

    // Fire callback
    fireCallback(faderId, value);
}

/**
 * Fire callback for fader change
 */
function fireCallback(faderId, value) {
    switch (faderId) {
        case 'shared-bpm':
            if (callbacks.onBpmChange) callbacks.onBpmChange(value);
            break;
        case 'shared-swing':
            if (callbacks.onSwingChange) callbacks.onSwingChange(value);
            break;
        case 'baeng-length':
            if (callbacks.onBaengLengthChange) callbacks.onBaengLengthChange(value);
            break;
        case 'raembl-length':
            if (callbacks.onRaemblLengthChange) callbacks.onRaemblLengthChange(value);
            break;
    }
}

/**
 * Programmatically update a fader value
 */
export function updateFaderValue(faderId, value) {
    const container = document.querySelector(`[data-fader-id="${faderId}"]`);
    if (!container) return;

    const config = FADERS[faderId];
    if (!config) return;

    const track = container.querySelector('.simple-fader-track');
    const valueEl = container.querySelector('.simple-fader-value');

    // Clamp value
    value = Math.max(config.min, Math.min(config.max, value));

    // Update position
    const position = valueToPosition(value, config.min, config.max);
    if (track) {
        track.style.setProperty('--fader-position', position);
    }

    // Update value display
    if (valueEl) {
        valueEl.textContent = config.format(value);
    }
}
