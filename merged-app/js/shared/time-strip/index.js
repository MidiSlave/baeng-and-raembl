/**
 * File: merged-app/js/shared/time-strip/index.js
 * Main entry point for time strip initialisation
 */

import { renderTimeStrip, initSimpleFaders, updateFaderValue } from './time-strip.js';
import { initInfoModal, toggleInfoModal, setLastEditedParam } from './info-modal.js';
import { togglePlay, setBPM, setSwing, setBaengBarLength, setRaemblBarLength, subscribe } from '../clock.js';
import { sharedState } from '../../state.js';
import { resetSettingsTab } from '../settings-tabs.js';

/**
 * Initialise the time strip
 */
export function initTimeStrip() {
    const container = document.getElementById('time-strip-container');
    if (!container) {
        console.error('[TimeStrip] Container not found');
        return;
    }

    // Render the time strip HTML
    renderTimeStrip(container);

    // Initialise fader interactions with callbacks
    initSimpleFaders({
        onBpmChange: (v) => {
            setBPM(v);
            setLastEditedParam('shared-bpm');
        },
        onSwingChange: (v) => {
            setSwing(v);
            setLastEditedParam('shared-swing');
        },
        onBaengLengthChange: (v) => {
            setBaengBarLength(Math.round(v));
            setLastEditedParam('baeng-length');
        },
        onRaemblLengthChange: (v) => {
            setRaemblBarLength(Math.round(v));
            setLastEditedParam('raembl-length');
        }
    });

    // Initialise info modal
    initInfoModal();

    // Wire play button
    const playBtn = document.getElementById('strip-play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', togglePlay);
    }

    // Wire info button
    const infoBtn = document.getElementById('strip-info-btn');
    if (infoBtn) {
        infoBtn.addEventListener('click', toggleInfoModal);
    }

    // Wire settings buttons to open existing panels
    const baengSettingsBtn = document.querySelector('[data-param-id="baeng-settings"]');
    if (baengSettingsBtn) {
        baengSettingsBtn.addEventListener('click', () => {
            const panel = document.getElementById('baeng-settings-panel');
            if (panel) {
                resetSettingsTab('baeng'); // Reset to PATCH tab
                panel.classList.remove('hidden');
            }
        });
    }

    const raemblSettingsBtn = document.querySelector('[data-param-id="raembl-settings"]');
    if (raemblSettingsBtn) {
        raemblSettingsBtn.addEventListener('click', () => {
            const panel = document.getElementById('raembl-settings-panel');
            if (panel) {
                resetSettingsTab('raembl'); // Reset to PATCH tab
                panel.classList.remove('hidden');
            }
        });
    }

    // Subscribe to clock for display updates
    subscribe(updateTimeStripDisplay);

    // Set initial fader values from state
    updateFaderValue('shared-bpm', sharedState.bpm);
    updateFaderValue('shared-swing', sharedState.swing);
    updateFaderValue('baeng-length', sharedState.baengBarLength);
    updateFaderValue('raembl-length', sharedState.raemblBarLength);

    // Listen for dynamic spacing width changes to sync time strip width
    document.addEventListener('rowWidthChanged', (event) => {
        syncTimeStripWidth(event.detail.width);
    });

    // Get initial width if already calculated
    if (typeof window.getRowWidth === 'function') {
        const initialWidth = window.getRowWidth();
        if (initialWidth > 0) {
            syncTimeStripWidth(initialWidth);
        }
    }

    console.log('[TimeStrip] Initialised');
}

/**
 * Update time strip displays from clock events
 */
function updateTimeStripDisplay(event) {
    if (event.type === 'step') {
        // Update Bæng display
        const baengDisplay = document.getElementById('baeng-display');
        if (baengDisplay && event.baeng) {
            baengDisplay.textContent = `${event.baeng.bar}.${event.baeng.beat}.${event.baeng.subStep}`;
        }

        // Update Ræmbl display
        const raemblDisplay = document.getElementById('raembl-display');
        if (raemblDisplay && event.raembl) {
            raemblDisplay.textContent = `${event.raembl.bar}.${event.raembl.beat}.${event.raembl.subStep}`;
        }
    }

    if (event.type === 'play' || event.type === 'stop') {
        const playBtn = document.getElementById('strip-play-btn');
        if (playBtn) {
            playBtn.classList.toggle('active', sharedState.isPlaying);
            playBtn.textContent = sharedState.isPlaying ? '■' : '▶';
        }
    }
}

/**
 * Update time strip faders from external state changes (e.g., patch load)
 */
export function syncTimeStripFromState() {
    updateFaderValue('shared-bpm', sharedState.bpm);
    updateFaderValue('shared-swing', sharedState.swing);
    updateFaderValue('baeng-length', sharedState.baengBarLength);
    updateFaderValue('raembl-length', sharedState.raemblBarLength);
}

/**
 * Sync time strip width to match dynamic spacing row width
 * @param {number} width - Target width in pixels
 */
function syncTimeStripWidth(width) {
    const timeStrip = document.querySelector('.time-strip');
    if (timeStrip && width > 0) {
        timeStrip.style.width = `${width}px`;
        timeStrip.style.maxWidth = `${width}px`;
    }
}
