// File: js/main.js
// Main entry point for Bæng application

import { state, parameterDefinitions, getParameterValue, setParameterValue, applyParameterToAllVoices, shouldAllowControlAll, setDX7Patch } from './state.js';
import { config } from './config.js';
import { initAudio, resumeAudio } from './audio.js';
// import { initTime, togglePlay } from './modules/time.js'; // OLD: Using original Bæng clock
import { initClock, togglePlay, setBPM, setSwing, setBaengBarLength, setRaemblBarLength } from '../shared/clock.js'; // NEW: Using shared clock
import { initTimeStrip, syncTimeStripFromState } from '../shared/time-strip/index.js'; // NEW: Shared time strip
import { initSettingsTabs, resetSettingsTab } from '../shared/settings-tabs.js'; // Settings tabs
import { initBaengClock } from './baengClock.js'; // NEW: Import Bæng clock subscriber
import dx7Library from './modules/dx7Loader.js';
import { updateModulatedParameterBaseValue } from './modules/perParamMod.js';
import {
    initSequence,
    toggleStepGate as sequenceToggleStepGate,
    setStepAccent as sequenceSetStepAccent,
    setStepRatchet as sequenceSetStepRatchet,
    setStepDeviation as sequenceSetStepDeviation,
    setStepProbability
} from './modules/sequence.js';
import {
    setEuclideanSteps,
    setEuclideanFills,
    setEuclideanShift,
    setAccentAmount,
    setFlamAmount,
    setRatchetAmount,
    setRatchetSpeed,
    setDeviation
} from './modules/euclidean.js';
import { initEngine, updateEngineParams, triggerVoice, releaseAllVoices, releaseAllVoicesForTrack, setVoiceTriggerCallback, updateVoiceEnvelope, updateDrumBusParams, startBusVisualization, stopBusVisualization, updateDX7Level, updateFXMode, updateVoiceCloudsRouting } from './modules/engine.js';
import { sampleBankManager } from './modules/sampler/sampler-engine.js';
import { SliceEditor } from './modules/slice/slice-editor.js';
import { loadSliceConfig } from './modules/slice/slice-config-storage.js';
import { SampleBrowser } from './modules/browsers/sample-browser.js';
import { DX7Browser } from './modules/browsers/dx7-browser.js';
import { KitBrowser } from './modules/browsers/kit-browser.js';
import { applyAllMacros, ENGINE_DEFAULTS, ENGINE_CYCLE_ORDER, ENGINE_MACROS } from './modules/engines.js';
import { initModulation, applyPerTrackModulation } from './modules/modulation.js';
import { initPerParamModulation, applyPerParamModulations } from './modules/perParamMod.js';
import { setupModulationClickHandlers, updateModulationValueFromDrag } from './modules/perParamModUI.js';
import { renderModules, renderEngineModule, renderVoicesModule } from './components/index.js';
import { updateCloudsVisibility, updateBaengSpacer } from './modules/clouds.js';
import { setupLEDRingKnobs, updateEuclideanCascadingRanges, syncAllLEDRingKnobs } from './ui/ledRingKnobs.js';
import { setupEngineDropdown } from './components/engine-dropdown.js';
import { deepClone } from './utils.js'; // For patch loading
import { setThemeHue, loadThemeHue, saveThemeHue, applyTheme, loadThemePreference, saveThemePreference, setThemeGradient, loadThemeGradient, saveThemeGradient, isGradientModeEnabled, setGradientMode, initializeTheme } from './utils/themeColor.js';
import { getParameterRange } from './utils/faderUtils.js';
import { initReverb, startReverbAnimation } from './modules/visualizations/reverb.js';
import { initDelay, startDelayAnimation } from './modules/visualizations/delay.js';
import { initEngine as initEngineVisualization, startEngineAnimation } from './modules/visualizations/engine.js';
import { historyManager } from './history.js';
import { applyRandomFont } from './utils/randomFont.js';
import { ensureBankAnalysed, getTuningCache } from './modules/tuning/index.js';
import { initSidechainModal, openDuckModal, updateDuckButtonVisuals } from './modules/sidechain-modal.js';
import { updateDuckingState } from './modules/sidechain.js';
import { SpacerPatternManager } from '../shared/circuit-pattern.js';

// --- Keyboard Handler Variables ---
let dragState = {
    active: false,
    type: null, // 'ratchet', 'probability', or 'deviation'
    voiceIndex: null,
    stepIndex: null,
    startY: null,
    startValue: null,
    controlAllActive: false // Track Control All state for parameter drags
};

// Store engine dropdown cleanup function to prevent listener leaks
let engineDropdownCleanup = null;

// shouldAllowControlAll imported from state.js

// --- Modulation Animation Loop ---
function modulationLoop() {
    // Apply per-track LFO modulation to all voices (macro modulation)
    applyPerTrackModulation();

    // Apply per-parameter modulation to all modulatable parameters
    applyPerParamModulations();

    // Continue loop
    requestAnimationFrame(modulationLoop);
}

// --- Keyboard Voice Triggering & Selection ---
function setupKeyboardVoiceTriggers() {
    document.addEventListener('keydown', (event) => {
        // PRIORITY 1: Global keyboard shortcuts (Undo/Redo)
        // Handle these FIRST before any other key processing
        const isMac = /Mac/.test(navigator.platform);
        const modKey = isMac ? event.metaKey : event.ctrlKey;

        // Handle Undo/Redo shortcuts (unified history for both Bæng & Ræmbl)
        if (modKey && !event.shiftKey && !event.altKey) {
            const key = event.key.toLowerCase();

            if (key === 'z') {
                event.preventDefault();
                if (historyManager && typeof historyManager.undo === 'function') {
                    historyManager.undo();
                }
                return;
            }
            if (key === 'x') {
                event.preventDefault();
                if (historyManager && typeof historyManager.redo === 'function') {
                    historyManager.redo();
                }
                return;
            }
        }

        // Ignore if typing in an input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'TEXTAREA') {
            return;
        }

        // Ignore if modifier keys are pressed (for other keys) or if it's a repeat event for non-voice keys
        if ((event.metaKey || event.ctrlKey || event.altKey) && !(event.key >= '1' && event.key <= '6')) {
            return;
        }

        if (event.key >= '1' && event.key <= '6') {
            // Prevent repeated triggers when holding the key
            if (event.repeat) return;

            const voiceIndex = parseInt(event.key) - 1;

            // Check if DX7 browser is open
            const dx7Modal = document.getElementById('baeng-dx7-browser-modal');
            if (dx7Modal && dx7Modal.classList.contains('active') && window.dx7Browser) {
                // Route to DX7 browser for patch triggering
                window.dx7Browser.handleKeyPress(event);
                return;
            }

            // Check if slice editor is open (let it handle its own keys)
            const sliceModal = document.getElementById('baeng-slice-modal');
            if (sliceModal && sliceModal.classList.contains('active')) {
                // Slice editor will handle this with preventDefault
                return;
            }

            // Normal voice selection and triggering
            if (voiceIndex >= 0 && voiceIndex < config.MAX_VOICES) {
                selectVoice(voiceIndex); // Select the voice
                triggerVoicePreview(voiceIndex); // Trigger preview

                // Visual feedback on voice selector (NEW: simplified for stacked view)
                const voiceSelector = document.querySelector(`.voice-selector[data-index="${voiceIndex}"]`);
                if (voiceSelector) {
                    voiceSelector.style.transform = 'scale(1.2)';
                    setTimeout(() => {
                        voiceSelector.style.transform = '';
                    }, 100);
                }
            }
        } else if (event.code === 'Space' && !state.isPlaying) { // Space to play/stop
             event.preventDefault(); // Prevent page scroll
             togglePlay();
        } else if (event.code === 'Space' && state.isPlaying) {
             event.preventDefault();
             togglePlay();
        } else if (event.key === 'r' || event.key === 'R') {
            // Ratchet mode
            state.tempEditMode = 'ratchet';
            updateEditModeDisplay();
        } else if (event.key === '/' || event.key === '?') {
            // Probability mode
            state.tempEditMode = 'probability';
            updateEditModeDisplay();
        } else if (event.key === 'n' || event.key === 'N') {
            // Deviation mode
            state.tempEditMode = 'deviation';
            updateEditModeDisplay();
        }
    });
    
    document.addEventListener('keyup', (event) => {
        // Reset temporary edit mode when key is released
        if ((event.key === 'r' || event.key === 'R') && state.tempEditMode === 'ratchet') {
            state.tempEditMode = null;
            updateEditModeDisplay();
        } else if ((event.key === '/' || event.key === '?') && state.tempEditMode === 'probability') {
            state.tempEditMode = null;
            updateEditModeDisplay();
        } else if ((event.key === 'n' || event.key === 'N') && state.tempEditMode === 'deviation') {
            state.tempEditMode = null;
            updateEditModeDisplay();
        }
    });
}

// Update display to show current edit mode
function updateEditModeDisplay() {
    const displayMode = state.tempEditMode || state.editMode;

    // Update toggle buttons
    document.querySelectorAll('.baeng-app .edit-mode-toggle .toggle-button').forEach(button => {
        button.classList.toggle('active', button.dataset.mode === displayMode);
    });

    // Update body class for CSS targeting
    document.body.className = document.body.className.replace(/\bmode-\S+/g, '');
    document.body.classList.add(`mode-${displayMode}`);
}

// Helper function to reset modulation edit mode and re-setup UI after renderModules()
function resetModulationStateAfterRender() {
    // Reset modulation edit mode since DOM elements were destroyed
    state.modEditMode.activeParamId = null;
    state.modEditMode.currentPage = 0;
    state.modEditMode.activeLabelElement = null;
    state.modEditMode.activeContainer = null;
    state.modEditMode.activeValueDisplay = null;

    // Re-setup modulation click handlers with new DOM elements
    setupModulationClickHandlers();
}

function triggerVoicePreview(voiceIndex) {
    // Dispatch track trigger event for per-parameter modulation (S&H sampling)
    const trackTriggerEvent = new CustomEvent('trackTriggered', {
        detail: {
            trackIndex: voiceIndex,
            accentLevel: 0,  // No accent for keyboard triggers
            isBarStart: false  // Not a bar start
        }
    });
    document.dispatchEvent(trackTriggerEvent);

    // Call the engine's triggerVoice function directly with default preview settings
    // These match the defaults used by the sequencer to ensure consistent sound
    if (typeof triggerVoice === 'function') {
        // Use consistent parameters to match sequencer behavior:
        // Accent level of 0 (no accent)
        // Ratchet count of 1 (single trigger)
        // Step duration of 0.25 (standard 16th note)
        // No deviation
        // Default deviation mode (1 - Late)
        triggerVoice(voiceIndex, 0, 1, 0.25, false, 1);
    } else {
    }
}

// --- Sample Bank Initialization ---
async function initSampleBanks() {
    // Set audio context
    if (!config.audioContext) {
        console.error('[initSampleBanks] AudioContext not initialized');
        return;
    }

    sampleBankManager.setAudioContext(config.audioContext);

    // Load TR-909 bank
    try {
        const tr909Response = await fetch('samples/banks/factory/tr-909-manifest.json');
        const tr909Manifest = await tr909Response.json();
        await sampleBankManager.loadBank('TR-909', tr909Manifest);
    } catch (error) {
        console.error('[initSampleBanks] Failed to load TR-909 bank:', error);
    }

    // Load CR-78 bank
    try {
        const cr78Response = await fetch('samples/banks/factory/cr-78-manifest.json');
        const cr78Manifest = await cr78Response.json();
        await sampleBankManager.loadBank('CR-78', cr78Manifest);
    } catch (error) {
        console.error('[initSampleBanks] Failed to load CR-78 bank:', error);
    }

    // Load MS-20 bank
    try {
        const ms20Response = await fetch('samples/banks/factory/ms20-manifest.json');
        const ms20Manifest = await ms20Response.json();
        await sampleBankManager.loadBank('MS20', ms20Manifest);
    } catch (error) {
        console.error('[initSampleBanks] Failed to load MS-20 bank:', error);
    }

    // Expose sample bank manager globally for use in engines.js
    window.sampleBankManager = sampleBankManager;
}

/**
 * Auto-load default slice sample (Amen Break) with pre-configured 32 slices
 * This provides a ready-to-use sample on app startup
 */
async function autoLoadDefaultSliceSample() {
    const AUTO_LOAD_ENABLED = true;
    if (!AUTO_LOAD_ENABLED) return;

    const samplePath = 'test/slice-editor/Winstons - Amen, Brother (ver.1).wav';
    const slicesConfigPath = 'Winstons - Amen, Brother (ver.1).slices.json';

    try {
        // Fetch the audio file
        const audioResponse = await fetch(samplePath);
        if (!audioResponse.ok) {
            return;
        }

        const audioArrayBuffer = await audioResponse.arrayBuffer();
        const audioBuffer = await config.audioContext.decodeAudioData(audioArrayBuffer);

        // Fetch the slices configuration
        const configResponse = await fetch(slicesConfigPath);
        if (!configResponse.ok) {
            return;
        }

        const sliceConfig = await configResponse.json();

        // Apply to the current voice
        const voice = state.voices[state.selectedVoice];
        voice.sliceBuffer = audioBuffer;
        voice.sliceConfig = sliceConfig;


    } catch (error) {
    }
}

// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {

    // Initialize theme early (before rendering)
    initializeTheme();
    const savedTheme = loadThemePreference();
    applyTheme(savedTheme);

    // Apply random font to title - REMOVED (h1 no longer exists)
    // applyRandomFont('h1');

    // Load fxMode early (before rendering) so Engine module shows correct send knobs
    const savedFxMode = localStorage.getItem('baeng-fxMode') || 'classic';
    state.fxMode = savedFxMode;

    renderModules(); // Render UI first
    setupLEDRingKnobs(); // Initialize LED Ring Knob controls
    initTimeStrip(); // Initialize shared time strip (only call once from Bæng)

    // Initialize circuit pattern for spacer panel
    const baengSpacerCanvas = document.getElementById('baeng-spacer-canvas');
    if (baengSpacerCanvas) {
        window.baengSpacerPattern = new SpacerPatternManager('baeng-spacer-canvas');
        window.baengSpacerPattern.init().then(() => {
            window.baengSpacerPattern.startAnimation();
        });
    }

    initAudio();    // Initializes engine, creates AudioContext
    // initTime(); // OLD: Original Bæng clock initialization
    initClock();    // NEW: Initialize shared clock
    initBaengClock(); // NEW: Initialize Bæng clock subscriber
    initSequence();

    // Listen for step advance events from clock
    document.addEventListener('baengStepAdvanced', (event) => {
        if (typeof updateSequenceUI === 'function') {
            updateSequenceUI();
        }
    });

    // Listen for LED Ring Knob parameter changes
    document.addEventListener('baengParameterChange', (event) => {
        const { paramId, value } = event.detail;
        handleLEDRingKnobChange(paramId, value);
    });

    initModulation(); // Initialize per-track LFO modulation system
    initPerParamModulation(); // Initialize per-parameter modulation system
    initSidechainModal(); // Initialize sidechain ducking modal
    // initEngine() is called by initAudio()

    // Initialize sample banks
    await initSampleBanks();

    // Initialize slice editor
    const sliceModal = document.getElementById('baeng-slice-modal');
    if (sliceModal) {
        window.sliceEditor = new SliceEditor(sliceModal, config.audioContext);

        // Set up onDone callback to save slice config to current voice
        window.sliceEditor.onDone = (sliceConfig) => {
            const voice = state.voices[state.selectedVoice];
            voice.sliceConfig = sliceConfig;
        };

        // Auto-load default slice sample (Amen Break with 32 slices)
        await autoLoadDefaultSliceSample();
    }

    // Initialize sample browser
    const sampleBrowserModal = document.getElementById('baeng-sample-browser-modal');
    if (sampleBrowserModal) {
        window.sampleBrowser = new SampleBrowser(sampleBrowserModal, config.audioContext);

        // Set up onLoad callback to load sample into current voice
        window.sampleBrowser.onLoad = (audioBuffer, sampleName) => {
            try {
                const voice = state.voices[state.selectedVoice];
                voice.sliceBuffer = audioBuffer;

                // Try to load saved slice config first
                const savedConfig = loadSliceConfig(audioBuffer, sampleName);

                if (savedConfig) {
                    console.log(`[Bæng] Loaded saved slice config: ${savedConfig.slices?.length || 0} slices`);
                    voice.sliceConfig = savedConfig;
                } else {
                    // Create default slice config (single slice = full sample)
                    console.log('[Bæng] No saved config, using default single slice');
                    voice.sliceConfig = {
                        version: '1.0',
                        sampleName: sampleName,
                        sampleRate: audioBuffer.sampleRate,
                        bufferLength: audioBuffer.length,
                        slices: [{
                            id: 0,
                            start: 0,
                            end: audioBuffer.length,
                            method: 'manual'
                        }]
                    };
                }

                voice.sliceIndex = 0;


                // Update engine parameters (this updates the worklet)
                updateEngineParams(state.selectedVoice);

                // Re-render the engine module UI
                setTimeout(() => {
                    const mainRow = document.querySelector('.baeng-app .main-row');
                    if (mainRow) {
                        // Remove existing engine module before re-rendering
                        const existingEngine = document.getElementById('baeng-engine');
                        if (existingEngine) {
                            existingEngine.remove();
                        }

                        // Insert ENGINE module at correct position (after VOICES, before REVERB)
                        // Order: TIME → VOICES → ENGINE → REVERB → DELAY → OUTPUT
                        const reverbModule = document.getElementById('reverb-fx');
                        const tempContainer = document.createElement('div');
                        renderEngineModule(tempContainer);
                        const newEngineModule = tempContainer.firstChild;
                        // Insert before Clouds (if visible) or Reverb
                        const cloudsModule = document.getElementById('baeng-clouds-fx');
                        const insertBeforeModule = cloudsModule || reverbModule;
                        if (insertBeforeModule && newEngineModule) {
                            mainRow.insertBefore(newEngineModule, insertBeforeModule);
                        } else {
                            // Fallback: append if neither found (shouldn't happen)
                            renderEngineModule(mainRow);
                        }

                        // Ensure spacer is positioned after ENGINE module
                        updateBaengSpacer();

                        setupLEDRingKnobs(); // Re-initialize LED Ring Knobs for ENGINE module
                        setupEngineModuleListeners();
                        setupKnobs(); // Re-attach knob drag handlers for ENGINE module
                        setupModulationClickHandlers(); // Re-attach modulation click handlers
                    }
                }, 0);

            } catch (error) {
                console.error('[Sample Browser] Error loading sample:', error);
                alert(`Failed to load sample: ${error.message}`);
            }
        };
    }

    // Initialize DX7 bank browser
    const dx7BrowserModal = document.getElementById('baeng-dx7-browser-modal');
    if (dx7BrowserModal) {
        window.dx7Browser = new DX7Browser(dx7BrowserModal, dx7Library);

        // Set up onLoad callback to load bank into current voice
        window.dx7Browser.onLoad = async (patches, bankName) => {
            try {
                const voice = state.voices[state.selectedVoice];

                // Store the bank copy
                voice.dx7Bank = dx7Library.getBankCopy();


                // Run tuning analysis if not already cached
                // Uses parsed patch data for offline DX7 rendering
                const parsedPatches = patches.map(p => p.parsed);

                try {
                    await ensureBankAnalysed(bankName, parsedPatches, (i, total) => {
                    });
                } catch (tuningError) {
                    console.error(`[Tuning] Analysis failed:`, tuningError);
                }

                // Get tuning offset for first patch and apply to voice
                const tuningCache = getTuningCache();
                const fineTuneOffset = tuningCache.getOffsetCents(bankName, 0);
                voice.dx7FineTune = fineTuneOffset;
                voice.dx7BankPath = bankName; // Store bank path for future patch changes

                // Update DX7 patch - load first patch from bank
                const patchData = patches[0];
                const patchIndex = 0;
                const bankSize = patches.length;
                const bankCopy = voice.dx7Bank;
                setDX7Patch(state.selectedVoice, patchData, patchIndex, bankSize, bankCopy, bankName);

                // Update engine parameters
                updateEngineParams(state.selectedVoice);

                // Re-render the engine module UI
                setTimeout(() => {
                    const mainRow = document.querySelector('.baeng-app .main-row');
                    if (mainRow) {
                        // Remove existing engine module before re-rendering
                        const existingEngine = document.getElementById('baeng-engine');
                        if (existingEngine) {
                            existingEngine.remove();
                        }

                        // Insert ENGINE module at correct position (after VOICES, before CLOUDS/REVERB)
                        // Order: TIME → VOICES → ENGINE → CLOUDS → REVERB → DELAY → OUTPUT
                        const reverbModule = document.getElementById('reverb-fx');
                        const cloudsModule = document.getElementById('baeng-clouds-fx');
                        const tempContainer = document.createElement('div');
                        renderEngineModule(tempContainer);
                        const newEngineModule = tempContainer.firstChild;
                        const insertBeforeModule = cloudsModule || reverbModule;
                        if (insertBeforeModule && newEngineModule) {
                            mainRow.insertBefore(newEngineModule, insertBeforeModule);
                        } else {
                            // Fallback: append if neither found (shouldn't happen)
                            renderEngineModule(mainRow);
                        }

                        // Ensure spacer is positioned after ENGINE module
                        updateBaengSpacer();

                        setupLEDRingKnobs(); // Re-initialize LED Ring Knobs for ENGINE module
                        setupEngineModuleListeners();
                        setupKnobs(); // Re-attach knob drag handlers for ENGINE module
                        setupModulationClickHandlers(); // Re-attach modulation click handlers
                    }
                }, 0);

            } catch (error) {
                console.error('[DX7 Browser] Error loading bank:', error);
                alert(`Failed to load bank: ${error.message}`);
            }
        };
    }

    // Initialize kit browser
    const kitBrowserModal = document.getElementById('baeng-kit-browser-modal');
    if (kitBrowserModal) {
        window.kitBrowser = new KitBrowser(kitBrowserModal, config.audioContext);

        // Set up onLoad callback to load kit into current voice
        window.kitBrowser.onLoad = async (manifest, kitName) => {
            try {
                // Load samples directly into per-voice buffer (SLICE pattern)
                const voice = state.voices[state.selectedVoice];
                if (voice.engine === 'SAMPLE') {
                    const sampleArray = [];

                    // Convert MIDI note manifest to ordered sample array
                    const sortedNotes = Object.keys(manifest.samples)
                        .map(n => parseInt(n))
                        .sort((a, b) => a - b);

                    for (const midiNote of sortedNotes) {
                        const sampleUrl = manifest.samples[midiNote];
                        try {
                            const response = await fetch(sampleUrl);
                            const arrayBuffer = await response.arrayBuffer();
                            const audioBuffer = await config.audioContext.decodeAudioData(arrayBuffer);

                            // Get name from manifest mapping or filename
                            const name = manifest.mapping?.[midiNote] ||
                                sampleUrl.split('/').pop().replace('.wav', '');

                            sampleArray.push({ name, buffer: audioBuffer });
                        } catch (error) {
                            console.error(`[Kit Load] Failed to load sample ${midiNote}:`, error);
                        }
                    }

                    // Store per-voice buffer array
                    voice.samplerBuffer = sampleArray;
                    voice.samplerBank = kitName;
                    voice.samplerManifest = manifest;
                    voice.sampleIndex = 0;
                    voice.macroPatch = 0;

                    console.log(`[Kit Loaded] Voice ${state.selectedVoice}: ${kitName} (${sampleArray.length} samples)`);
                }


                // Update engine parameters
                updateEngineParams(state.selectedVoice);

                // Re-render the engine module UI
                setTimeout(() => {
                    const mainRow = document.querySelector('.baeng-app .main-row');
                    if (mainRow) {
                        // Remove existing engine module before re-rendering
                        const existingEngine = document.getElementById('baeng-engine');
                        if (existingEngine) {
                            existingEngine.remove();
                        }

                        // Insert ENGINE module at correct position (after VOICES, before CLOUDS/REVERB)
                        const reverbModule = document.getElementById('reverb-fx');
                        const cloudsModule = document.getElementById('baeng-clouds-fx');
                        const tempContainer = document.createElement('div');
                        renderEngineModule(tempContainer);
                        const newEngineModule = tempContainer.firstChild;
                        const insertBeforeModule = cloudsModule || reverbModule;
                        if (insertBeforeModule && newEngineModule) {
                            mainRow.insertBefore(newEngineModule, insertBeforeModule);
                        } else {
                            // Fallback: append if neither found (shouldn't happen)
                            renderEngineModule(mainRow);
                        }

                        // Ensure spacer is positioned after ENGINE module
                        updateBaengSpacer();

                        setupLEDRingKnobs(); // Re-initialize LED Ring Knobs for ENGINE module
                        setupEngineModuleListeners();
                        setupKnobs(); // Re-attach knob drag handlers for ENGINE module
                        setupModulationClickHandlers(); // Re-attach modulation click handlers
                    }
                }, 0);

            } catch (error) {
                console.error('[Kit Browser] Failed to load kit:', error);
                alert(`Failed to load kit: ${error.message}`);
            }
        };
    }

    // Initialize visualizations
    initEngineVisualization();
    initReverb();
    initDelay();
    startEngineAnimation();
    startReverbAnimation();
    startDelayAnimation();

    // Bus visualisation starts automatically when worklet loads (see createDrumBusNode in engine.js)

    // Start modulation loop
    requestAnimationFrame(modulationLoop);

    // Resume audio on first user interaction
    const resumeHandler = () => {
        resumeAudio();
        document.body.removeEventListener('pointerdown', resumeHandler);
        document.body.removeEventListener('keydown', resumeHandler);
        document.body.removeEventListener('touchstart', resumeHandler);
    };
    document.body.addEventListener('pointerdown', resumeHandler, { once: true });
    document.body.addEventListener('keydown', resumeHandler, { once: true });
    document.body.addEventListener('touchstart', resumeHandler, { once: true });


    setupUIEventListeners();
    initSettingsPanel(); // For global patch save/load
    initSettingsTabs(); // Initialize settings tab switching
    setupKeyboardVoiceTriggers();

    // Make functions globally available for history manager
    window.updateAllUI = updateAllUI;
    window.setupModulationClickHandlers = setupModulationClickHandlers;

    // Initialize DX7 patch library
    dx7Library.initialize();

    // Set up voice trigger callback for UI updates during playback
    setVoiceTriggerCallback((voiceIndex) => {
        // Add visual feedback to the voice selector button (brief flash when triggered)
        const voiceSelector = document.querySelector(`.voice-selector[data-index="${voiceIndex}"]`);
        if (voiceSelector) {
            voiceSelector.classList.add('playing');
            // Remove the playing class after a short duration
            setTimeout(() => {
                voiceSelector.classList.remove('playing');
            }, 100);
        }

        // Note: We do NOT change state.selectedVoice here to keep the ENGINE visualization
        // and parameter displays "sticky" to the user's manually selected voice.
        // This prevents the UI from jumping around during playback.
    });

    // Expose triggerVoice for direct keyboard triggering/preview
    window.triggerVoiceFromEngine = triggerVoice; 

    // Create hidden file input for voice patch loading
    const voicePatchLoadInput = document.createElement('input');
    voicePatchLoadInput.type = 'file';
    voicePatchLoadInput.id = 'load-voice-patch-input-hidden';
    voicePatchLoadInput.accept = '.json';
    voicePatchLoadInput.style.display = 'none';
    voicePatchLoadInput.addEventListener('change', handleLoadVoicePatch);
    document.body.appendChild(voicePatchLoadInput);


    updateAllUI(); // Ensure UI reflects initial state after all setup

    // DISABLED: Auto-loading DX7 patches on startup
    // This was overriding the modern engine defaults (aKICK, aSNARE, aHIHAT, DX7, SAMPLE, SLICE)
    // Users can manually load DX7 banks via the DX7 browser if needed
    // await loadDefaultVoicePatches();

    // CRITICAL: Apply macros to all voices AFTER patches are loaded
    // This ensures DX7 patches are set before macros are applied
    // This is necessary for AudioWorklet to work correctly on first load
    for (let i = 0; i < state.voices.length; i++) {
        if (typeof applyAllMacros === 'function') {
            applyAllMacros(state.voices[i]);
        }
    }

    // Initialize history manager AFTER patches are loaded and macros applied
    // This ensures the initial snapshot includes all DX7 properties
    if (historyManager) {
        historyManager.initialize();
    }

    // Initialize dice button animations
    setupDiceButtons();
});

// Set up UI event listeners

// Get step value for the specified parameter type
function getStepValueByType(voiceIndex, stepIndex, type) {
    const step = state.sequences[voiceIndex].steps[stepIndex];
    switch (type) {
        case 'ratchet':
            return step.ratchet;
        case 'probability':
            return step.probability;
        case 'deviation':
            return step.deviation;
        default:
            return 0;
    }
}

// Start drag operation for a step
function startStepDrag(event, voiceIndex, stepIndex, type) {
    // Only allow dragging on steps with gate enabled
    if (!state.sequences[voiceIndex].steps[stepIndex].gate) {
        return;
    }
    
    event.preventDefault();
    const startY = event.clientY;
    const startX = event.clientX; // Track horizontal position for mode changes
    const startValue = getStepValueByType(voiceIndex, stepIndex, type);
    
    state.isDragging = true;
    dragState = {
        active: true,
        type,
        voiceIndex,
        stepIndex,
        startY,
        startX,
        startValue
    };
    
    document.addEventListener('mousemove', handleStepDrag);
    document.addEventListener('mouseup', endStepDrag);
}

// Handle drag movement
function handleStepDrag(event) {
    if (!dragState.active) return;
    
    event.preventDefault();
    const deltaY = dragState.startY - event.clientY;
    const deltaX = event.clientX - dragState.startX; // Add horizontal tracking
    let newValue;
    
    switch (dragState.type) {
        case 'ratchet':
            // 0-7 (for 1-8 triggers) - each 10px = 1 ratchet increase
            newValue = Math.min(7, Math.max(0, Math.floor(dragState.startValue + deltaY / 10)));
            sequenceSetStepRatchet(dragState.voiceIndex, dragState.stepIndex, newValue);
            break;
            
        case 'probability':
            // 0-100% - decrease from top to bottom
            newValue = Math.min(100, Math.max(0, Math.round(dragState.startValue + deltaY / 2)));
            setStepProbability(dragState.voiceIndex, dragState.stepIndex, newValue);
            break;
            
        case 'deviation':
            // 0-100% - increase from bottom to top for amount
            newValue = Math.min(100, Math.max(0, Math.round(dragState.startValue + deltaY / 2)));
            
            // Get the current step data
            const step = state.sequences[dragState.voiceIndex].steps[dragState.stepIndex];
            let currentMode = step.deviationMode;
            
            // Apply just the deviation amount, no need for mode
            sequenceSetStepDeviation(dragState.voiceIndex, dragState.stepIndex, newValue);
            break;
    }
    
    updateSequenceUI();
}

// End drag operation
function endStepDrag() {
    dragState.active = false;
    state.isDragging = false;
    document.removeEventListener('mousemove', handleStepDrag);
    document.removeEventListener('mouseup', endStepDrag);
}

function setupUIEventListeners() {
    const playButton = document.querySelector('.baeng-app .play-button');
    if (playButton) playButton.addEventListener('click', togglePlay);

    const voicesModule = document.getElementById('voices');
    if (voicesModule) {
        // Voice selection buttons (NEW: using .voice-selector instead of .voice-button)
        voicesModule.querySelectorAll('.voice-selector').forEach(button => {
            button.addEventListener('click', (e) => {
                const voiceIndex = parseInt(button.dataset.index, 10);

                // Shift+click to toggle mute
                if (e.shiftKey) {
                    const voice = state.voices[voiceIndex];
                    if (voice) {
                        voice.muted = !voice.muted;
                        button.classList.toggle('muted', voice.muted);

                        // Capture snapshot for undo
                        if (historyManager) {
                            historyManager.pushSnapshot(true);
                        }
                    }
                } else {
                    // Normal click: select voice
                    selectVoice(voiceIndex);
                }
            });
        });
        
        // Edit mode toggle buttons
        const editModeToggle = voicesModule.querySelector('.edit-mode-toggle');
        if (editModeToggle) {
            editModeToggle.querySelectorAll('.toggle-button').forEach(button => {
                button.addEventListener('click', () => {
                    state.editMode = button.dataset.mode;
                    updateEditModeDisplay();
                    updateSequenceUI();
                });
            });
        }

        // DISABLED: Manual step editing - Use Euclidean parameters only
        // Manual editing is intentionally disabled to keep the workflow focused on Euclidean rhythm generation
        // All step parameters (gates, ratchets, accents, flams) are controlled via Euclidean faders in VOICES module

        // Voice Patch Save/Load buttons
        const saveVoiceBtn = voicesModule.querySelector('.save-voice-patch-button');
        if (saveVoiceBtn) saveVoiceBtn.addEventListener('click', handleSaveVoicePatch);

        const loadVoiceBtn = voicesModule.querySelector('.load-voice-patch-button');
        if (loadVoiceBtn) {
            loadVoiceBtn.addEventListener('click', () => {
                document.getElementById('baeng-load-voice-patch-input-hidden').click();
            });
        }

        // Voices randomize button
        voicesModule.querySelector('.randomize-button')?.addEventListener('click', (e) => randomizeVoiceParameters(e.currentTarget));

        // SEQ Reset button (resets all sequences to step 0 on bar boundary)
        const seqResetButton = voicesModule.querySelector('.seq-reset');
        if (seqResetButton && !seqResetButton.dataset.listenerAttached) {
            seqResetButton.dataset.listenerAttached = 'true';
            seqResetButton.addEventListener('click', () => {
                state.resetSequenceOnBar = !state.resetSequenceOnBar;
                seqResetButton.classList.toggle('active', state.resetSequenceOnBar);
            });
        }
    }

    // Setup engine module listeners
    setupEngineModuleListeners();

    // Persistent engine file input change handler (set up once, never destroyed)
    const persistentFileInput = document.getElementById('baeng-persistent-engine-file-input');
    if (persistentFileInput && !persistentFileInput.dataset.changeListenerAttached) {
        persistentFileInput.dataset.changeListenerAttached = 'true';

        persistentFileInput.addEventListener('change', (e) => {
            const currentEngine = state.voices[state.selectedVoice].engine;

            if (currentEngine === 'DX7') {
                handleDX7FileLoad(e);
            } else if (currentEngine === 'SAMPLE') {
                handleSampleFolderLoad(e);
            } else if (currentEngine === 'SLICE') {
                handleSliceFileLoad(e);
            }
        });
    } else if (!persistentFileInput) {
        console.error('[setupUIEventListeners] persistent-engine-file-input element not found!');
    } else {
    }

    // Reverb randomize button
    const reverbModule = document.getElementById('reverb-fx');
    if (reverbModule) {
        reverbModule.querySelector('.randomize-button')?.addEventListener('click', randomizeReverbParameters);
    }

    // Delay randomize button and SYNC toggle handler
    const delayModule = document.getElementById('delay-fx');
    if (delayModule) {
        delayModule.querySelector('.randomize-button')?.addEventListener('click', randomizeDelayParameters);
    }

    const delaySyncToggle = document.querySelector('.baeng-app .delay-sync-toggle');
    if (delaySyncToggle) {
        delaySyncToggle.addEventListener('click', () => {
            const wasSync = state.delaySyncEnabled;
            state.delaySyncEnabled = !state.delaySyncEnabled;

            // Transfer modulation configuration between sync and free parameters
            const oldParamId = wasSync ? 'effects.delayTime' : 'effects.delayTimeFree';
            const newParamId = wasSync ? 'effects.delayTimeFree' : 'effects.delayTime';

            // Check if old parameter has modulation
            if (state.perParamModulations && state.perParamModulations[oldParamId]) {
                const oldModConfig = state.perParamModulations[oldParamId];

                // Only transfer if modulation is actually enabled
                if (oldModConfig.enabled || oldModConfig.depth !== 0) {
                    // Transfer the entire modulation config to the new parameter
                    if (!state.perParamModulations[newParamId]) {
                        state.perParamModulations[newParamId] = {};
                    }

                    // Copy all properties
                    Object.assign(state.perParamModulations[newParamId], oldModConfig);

                    // Update base value to match the new parameter's current value
                    state.perParamModulations[newParamId].baseValue = getParameterValue(newParamId);

                    // Clear the old parameter's modulation
                    state.perParamModulations[oldParamId] = {
                        enabled: false,
                        waveform: 0,
                        rate: 1.0,
                        depth: 0,
                        offset: 0,
                        triggerSource: 'none',
                        baseValue: null,
                        muted: false,
                        isVoiceParam: false
                    };
                }
            }

            setParameterValue('effects.delaySyncEnabled', state.delaySyncEnabled);
            renderModules(); // Re-render to update button and TIME fader source
            setupLEDRingKnobs(); // Re-initialize LED Ring Knob controls after re-render
            setupUIEventListeners(); // Re-attach event listeners after re-render
            resetModulationStateAfterRender(); // Reset modulation state and re-attach handlers
            updateEngineParams(); // Update delay parameters
        });
    }

    // Settings Panel - close button (gear icon now in time strip)
    const settingsPanel = document.getElementById('baeng-settings-panel');
    const closeSettingsBtn = document.getElementById('baeng-close-settings-btn');

    if (settingsPanel && closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsPanel.classList.add('hidden');
        });
    }

    // BUS module - Drive type toggle (cycles SOFT → MED → HARD)
    const driveTypeBtn = document.querySelector('.baeng-app #bus-drive-type');
    if (driveTypeBtn) {
        driveTypeBtn.addEventListener('click', () => {
            state.drumBus.driveType = (state.drumBus.driveType + 1) % 3;
            const types = ['SOFT', 'MED', 'HARD'];
            driveTypeBtn.textContent = types[state.drumBus.driveType];
            driveTypeBtn.dataset.type = state.drumBus.driveType;
            updateDrumBusParams();
        });
    }

    // BUS module - Compressor toggle
    const compToggleBtn = document.querySelector('.baeng-app #bus-comp-toggle');
    if (compToggleBtn) {
        compToggleBtn.addEventListener('click', () => {
            state.drumBus.compEnabled = !state.drumBus.compEnabled;
            compToggleBtn.classList.toggle('active', state.drumBus.compEnabled);
            updateDrumBusParams();
        });
    }

    // Duck buttons - sidechain ducking modal
    document.querySelectorAll('.baeng-app .duck-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const effectKey = btn.dataset.effect;
            if (effectKey) {
                openDuckModal(effectKey);
            }
        });
    });

    // Sync duck button visuals with initial state (in case patches have ducking enabled)
    updateDuckButtonVisuals();

    setupFaders();
    setupKnobs(); // Setup rotary knobs for ENGINE module
    setupModulationClickHandlers(); // Setup per-parameter modulation UI
    // Prevent page scroll on touchmove for faders (already in setupFaders via passive:false)
}

function setupFaders() {
    const faderTracks = document.querySelectorAll('.baeng-app .fader-track');
    faderTracks.forEach(track => {
        const container = track.closest('.fader-container');
        if (!container) return;

        const fill = track.querySelector('.baeng-app .fader-fill');
        const valueDisplay = container.querySelector('.baeng-app .fader-value');
        const moduleElement = track.closest('.module');
        if (!moduleElement) return;

        const moduleId = moduleElement.id;
        const labelElement = container.querySelector('.baeng-app .fader-label');
        if (!labelElement || !fill || !valueDisplay) return;

        const labelText = labelElement.getAttribute('data-label') || labelElement.textContent.trim();
        const paramId = findParameterId(moduleId, labelText);

        if (!paramId) {
            // console.warn(`Fader setup: Could not find paramId for module '${moduleId}' - label '${labelText}'`);
            return;
        }

        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) {
            // console.warn(`Fader setup: ParamDef not found for paramId: ${paramId}`);
            return;
        }
        
        let currentValue = getParameterValue(paramId);
        updateFaderVisuals(track, fill, valueDisplay, currentValue, paramDef);

        let isDragging = false;

        function startDrag(e) {
            if (e.type === 'touchstart') e.preventDefault(); // Prevent scroll on touch

            isDragging = true;

            // Track which parameter is being dragged (to pause modulation for it)
            // Use compound key for voice params to avoid pausing other voices
            if (paramDef.voiceParam) {
                // Voice parameter: include voice index to target specific voice
                state.modEditMode.draggedParamId = `${state.selectedVoice}:${paramId}`;
            } else {
                // Effect/global parameter: use plain paramId
                state.modEditMode.draggedParamId = paramId;
            }

            // Detect Control All modifier (Cmd on Mac, Ctrl on Windows/Linux)
            const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform);
            dragState.controlAllActive = (isMac ? e.metaKey : e.ctrlKey) || false;

            // Visual feedback for Control All
            if (dragState.controlAllActive && paramDef.voiceParam && shouldAllowControlAll(paramId)) {
                document.body.classList.add('control-all-active');
                document.body.style.cursor = 'crosshair';
                track.classList.add('control-all-dragging');
            } else {
                document.body.style.cursor = 'ns-resize'; // Vertical resize cursor
            }

            document.body.style.userSelect = 'none'; // Prevent text selection

            updateValueOnEvent(e); // Update on initial click/touch

            document.addEventListener('mousemove', updateValueOnEvent);
            document.addEventListener('touchmove', updateValueOnEvent, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }

        function updateValueOnEvent(e) {
            if (!isDragging && (e.type === 'mousemove' || e.type === 'touchmove')) return;
            if (e.type === 'touchmove' || (e.type === 'mousemove' && isDragging)) e.preventDefault();

            const rect = track.getBoundingClientRect();
            let clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

            let relativeY = clientY - rect.top;
            relativeY = Math.max(0, Math.min(rect.height, relativeY)); // Clamp to track bounds
            const percent = 100 - (relativeY / rect.height * 100); // Invert: top is 100%, bottom is 0%

            // Get dynamic range for euclidean parameters
            let min = paramDef.min;
            let max = paramDef.max;
            if (paramId.startsWith('euclidean.')) {
                const range = getParameterRange(paramId, state);
                min = range.min;
                max = range.max;
            }

            let newValue;
            if (paramDef.step && paramDef.step !== 0) {
                const numSteps = (max - min) / paramDef.step;
                const stepIndex = Math.round(percent / 100 * numSteps);
                newValue = min + stepIndex * paramDef.step;
            } else {
                newValue = min + (percent / 100) * (max - min);
            }
            // Clamp to dynamic min/max
            newValue = Math.max(min, Math.min(max, newValue));

            // Round for display and state, especially for continuous params
            if (!paramDef.step || paramDef.step === 0) {
                if (Math.abs(max - min) <= 1 && (max - min) !== 0) newValue = parseFloat(newValue.toFixed(3));
                else if (Math.abs(max - min) <= 10) newValue = parseFloat(newValue.toFixed(2));
                else newValue = parseFloat(newValue.toFixed(1));
            }
            newValue = parseFloat(newValue); // Ensure it's a number
            if (isNaN(newValue)) return;

            // Check if we're in modulation edit mode for this parameter
            const percentage = percent / 100;
            if (updateModulationValueFromDrag(paramId, percentage)) {
                // Handled by modulation edit mode - still need to update fader visuals
                fill.style.height = `${percent}%`;
                return;
            }

            // Check if Control All is active
            const controlAllActive = dragState.controlAllActive;
            const isVoiceParam = paramDef.voiceParam;

            if (isVoiceParam && controlAllActive && shouldAllowControlAll(paramId)) {
                // Control All: Apply to all voices
                if (applyParameterToAllVoices(paramId, newValue)) {
                    currentValue = getParameterValue(paramId); // Get value for selected voice
                    updateFaderVisuals(track, fill, valueDisplay, currentValue, paramDef, paramId);

                    // Update modulation baseValue for all voices if applicable
                    updateModulatedParameterBaseValue(paramId, newValue);

                    // Handle euclidean parameter updates for all voices
                    if (paramId.startsWith('euclidean.')) {
                        for (let v = 0; v < state.voices.length; v++) {
                            const origVoice = state.selectedVoice;
                            state.selectedVoice = v;
                            handleEuclideanParameterChange(paramId, newValue);
                            state.selectedVoice = origVoice;
                        }
                        updateDependentFaders(paramId);
                    }

                    // Handle macro control updates for all voices
                    if (paramId.startsWith('voice.macro')) {
                        for (let v = 0; v < state.voices.length; v++) {
                            applyAllMacros(state.voices[v]);
                        }
                    }

                    updateEngineParams();
                }
            } else {
                // Normal parameter update (single voice or global parameter)
                if (setParameterValue(paramId, newValue)) {
                    currentValue = getParameterValue(paramId);
                    updateFaderVisuals(track, fill, valueDisplay, currentValue, paramDef, paramId);

                    // Update modulation baseValue if this parameter is being modulated
                    updateModulatedParameterBaseValue(paramId, newValue);

                    // Handle euclidean parameter updates
                    if (paramId.startsWith('euclidean.')) {
                        handleEuclideanParameterChange(paramId, newValue);
                        // Update dependent faders after euclidean parameter changes
                        updateDependentFaders(paramId);
                    }

                    // Handle macro control updates - apply macros to underlying parameters
                    if (paramId.startsWith('voice.macro')) {
                        const voiceIndex = state.selectedVoice;
                        if (voiceIndex !== null && voiceIndex >= 0 && voiceIndex < state.voices.length) {
                            applyAllMacros(state.voices[voiceIndex]);
                        }
                    }

                    updateEngineParams();
                }
            }
        }

        function stopDrag() {
            if (!isDragging) return;
            isDragging = false;

            // Clear dragged parameter tracking
            state.modEditMode.draggedParamId = null;

            // CRITICAL FIX: Update fader visual to show baseValue position
            // This prevents the modulation animation from immediately overwriting the user's adjustment
            const modConfig = state.perParamModulations?.[paramId];
            if (modConfig) {
                let hasActiveModulation = false;
                let baseValueToShow = null;

                if (modConfig.isVoiceParam) {
                    const voiceConfig = modConfig.voices?.[state.selectedVoice];
                    hasActiveModulation = voiceConfig?.enabled &&
                                         voiceConfig?.depth !== 0 &&
                                         !voiceConfig?.muted &&
                                         voiceConfig?.baseValue !== null;
                    baseValueToShow = voiceConfig?.baseValue;
                } else {
                    hasActiveModulation = modConfig.enabled &&
                                         modConfig.depth !== 0 &&
                                         !modConfig.muted &&
                                         modConfig.baseValue !== null;
                    baseValueToShow = modConfig.baseValue;
                }

                // If modulation is active, update fader to show baseValue position
                if (hasActiveModulation && baseValueToShow !== null) {
                    const basePercentage = ((baseValueToShow - paramDef.min) / (paramDef.max - paramDef.min)) * 100;
                    fill.style.height = `${basePercentage}%`;
                }
            }

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.classList.remove('control-all-active');
            track.classList.remove('control-all-dragging');
            dragState.controlAllActive = false;
            document.removeEventListener('mousemove', updateValueOnEvent);
            document.removeEventListener('touchmove', updateValueOnEvent);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);

            // Capture snapshot after fader change (debounced)
            if (historyManager) {
                historyManager.pushSnapshot(true);
            }
        }

        track.addEventListener('mousedown', startDrag);
        track.addEventListener('touchstart', startDrag, { passive: false });
    });
}

// Setup rotary knobs (similar to faders but for knob controls)
function setupKnobs() {
    // Special handler for DX7 patch selector knob
    const patchKnob = document.querySelector('.baeng-app .dx7-patch-knob');
    if (patchKnob) {
        const container = patchKnob.closest('.knob-container');
        const valueDisplay = container?.querySelector('.baeng-app .knob-value');

        const min = parseInt(patchKnob.dataset.min) || 0;
        const max = parseInt(patchKnob.dataset.max) || 31;

        let isDragging = false;
        let startY = 0;
        let startValue = 0;

        function startDrag(e) {
            if (e.type === 'touchstart') e.preventDefault();

            const voice = state.voices[state.selectedVoice];
            if (!voice || voice.dx7BankSize === undefined || voice.dx7BankSize === 0) {
                return;
            }

            isDragging = true;
            startY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

            // Track which parameter is being dragged (to pause modulation for it)
            const paramId = 'voice.dx7PatchIndex';
            // Use compound key for voice param to avoid pausing other voices
            state.modEditMode.draggedParamId = `${state.selectedVoice}:${paramId}`;

            // Check if we're in modulation edit mode for voice.dx7PatchIndex
            const editMode = state.modEditMode;
            if (editMode.activeParamId === paramId && editMode.currentPage > 0) {
                // In edit mode - start value should be 0-1 percentage based on current rotation
                const currentRotation = parseFloat(patchKnob.style.getPropertyValue('--knob-rotation')) || 0;
                startValue = (currentRotation + 135) / 270; // Convert -135 to +135 deg → 0 to 1
            } else {
                // Normal mode - use patch index
                startValue = voice.dx7PatchIndex || 0;
            }

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';

            document.addEventListener('mousemove', updateValue);
            document.addEventListener('touchmove', updateValue, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }

        function updateValue(e) {
            if (!isDragging) return;
            if (e.type === 'touchmove' || e.type === 'mousemove') e.preventDefault();

            const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
            const deltaY = startY - clientY;

            // Check if we're in modulation edit mode
            const editMode = state.modEditMode;
            const paramId = 'voice.dx7PatchIndex';
            const isInEditMode = editMode.activeParamId === paramId && editMode.currentPage > 0;

            if (isInEditMode) {
                // In edit mode - work with 0-1 percentage
                const sensitivity = 0.005; // Adjust sensitivity for 0-1 range
                const percentageDelta = deltaY * sensitivity;
                let newPercentage = startValue + percentageDelta;
                newPercentage = Math.max(0, Math.min(1, newPercentage));

                // Update the modulation config value
                updateModulationValueFromDrag(paramId, newPercentage, patchKnob, container);
                return;
            }

            // Normal mode - change patches
            const voice = state.voices[state.selectedVoice];
            const sensitivity = 0.1; // Slower for precise patch selection
            const valueDelta = deltaY * sensitivity;

            let newValue = Math.round(startValue + valueDelta);
            newValue = Math.max(min, Math.min(max, newValue));

            if (newValue !== voice.dx7PatchIndex) {
                // Select new patch from voice's own bank (if available) or global bank
                try {
                    let patchData;
                    if (voice.dx7Bank && voice.dx7Bank.length > 0) {
                        // Use per-voice bank
                        const patchIndex = Math.max(0, Math.min(newValue, voice.dx7Bank.length - 1));
                        patchData = voice.dx7Bank[patchIndex];

                        // Update directly without going through global library
                        const bankCopy = voice.dx7Bank; // Already a copy
                        const bankName = voice.dx7BankName;
                        setDX7Patch(state.selectedVoice, patchData, patchIndex, voice.dx7Bank.length, bankCopy, bankName);

                        // Update tuning offset for the new patch
                        if (voice.dx7BankPath) {
                            const tuningCache = getTuningCache();
                            voice.dx7FineTune = tuningCache.getOffsetCents(voice.dx7BankPath, patchIndex);
                        }

                        // Update UI
                        renderModules();
                        setupLEDRingKnobs();
                        setupUIEventListeners();
                        resetModulationStateAfterRender();
                        updateEngineParams();
                    } else {
                        // Fall back to global bank (for backwards compatibility)
                        patchData = dx7Library.selectPatch(newValue);
                        applyDX7PatchToCurrentVoice(patchData);
                    }
                } catch (error) {
                }
            }
        }

        function stopDrag() {
            if (!isDragging) return;
            isDragging = false;

            // Clear dragged parameter tracking
            state.modEditMode.draggedParamId = null;

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', updateValue);
            document.removeEventListener('touchmove', updateValue);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);
        }

        patchKnob.addEventListener('mousedown', startDrag);
        patchKnob.addEventListener('touchstart', startDrag, { passive: false });
    }

    // Special handler for SAMPLE selector knob
    const sampleKnob = document.querySelector('.baeng-app .sample-knob');
    if (sampleKnob) {
        const container = sampleKnob.closest('.knob-container');
        const valueDisplay = container?.querySelector('.baeng-app .knob-value');

        let isDragging = false;
        let startY = 0;
        let startIndex = 0;

        function startDrag(e) {
            if (e.type === 'touchstart') e.preventDefault();

            isDragging = true;
            startY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

            // Track which parameter is being dragged (to pause modulation for it)
            // Use compound key for voice param to avoid pausing other voices
            state.modEditMode.draggedParamId = `${state.selectedVoice}:voice.macroPatch`;

            // Check if we're in modulation edit mode for this parameter
            const editMode = state.modEditMode;
            const isEditingThisParam = editMode.activeParamId === 'voice.macroPatch' && editMode.currentPage > 0;

            if (isEditingThisParam) {
                // In modulation edit mode - don't change sample, just adjust modulation value
                // Get current knob rotation as start value
                const currentRotation = parseFloat(sampleKnob.style.getPropertyValue('--knob-rotation')) || 0;
                startIndex = (currentRotation + 135) / 270; // Convert -135 to +135 deg → 0 to 1
            } else {
                // Normal mode - changing sample selection
                const voice = state.voices[state.selectedVoice];
                const voiceSampleBank = voice?.samplerBuffer;
                const sampleCount = voiceSampleBank?.length || 0;
                if (!voice || sampleCount === 0) {
                    isDragging = false;
                    return;
                }

                // Get current 0-based sample index
                const currentSampleIndex = voice.sampleIndex !== undefined ? voice.sampleIndex : 0;
                startIndex = currentSampleIndex; // Store 0-based index
            }

            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';

            document.addEventListener('mousemove', updateValue);
            document.addEventListener('touchmove', updateValue, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }

        function updateValue(e) {
            if (!isDragging) return;
            if (e.type === 'touchmove' || e.type === 'mousemove') e.preventDefault();

            const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
            const deltaY = startY - clientY;

            // Check if we're in modulation edit mode
            const editMode = state.modEditMode;
            const isEditingThisParam = editMode.activeParamId === 'voice.macroPatch' && editMode.currentPage > 0;

            if (isEditingThisParam) {
                // Modulation edit mode - update modulation parameter
                const sensitivity = 0.002;
                const valueDelta = deltaY * sensitivity;
                let newValue = startIndex + valueDelta;
                newValue = Math.max(0, Math.min(1, newValue));

                // Update using the shared modulation update function
                updateModulationValueFromDrag('voice.macroPatch', newValue, sampleKnob, container);
            } else {
                // Normal mode - change sample selection
                const voice = state.voices[state.selectedVoice];
                const voiceSampleBank = voice?.samplerBuffer;
                const sampleCount = voiceSampleBank?.length || 0;
                if (sampleCount === 0) return;

                const sensitivity = 0.05; // Slower for precise sample selection
                const indexDelta = deltaY * sensitivity;

                // Work with 0-based index
                let newIndex = Math.round(startIndex + indexDelta);
                newIndex = Math.max(0, Math.min(sampleCount - 1, newIndex));

                if (newIndex !== voice.sampleIndex) {
                    // Update sample index
                    voice.sampleIndex = newIndex;

                    // CRITICAL: Update macroPatch to match sample index
                    // Map 0-based index (0 to N-1) to macroPatch (0-100)
                    voice.macroPatch = sampleCount > 1 ? Math.round((newIndex / (sampleCount - 1)) * 100) : 0;

                    // Update display
                    if (valueDisplay) {
                        const sampleName = voiceSampleBank[newIndex]?.name || `Sample ${newIndex + 1}`;
                        // Display index-only format for compact display
                        valueDisplay.textContent = `${newIndex + 1}/${sampleCount}`;
                        // Add tooltip with full name for reference
                        valueDisplay.title = `${sampleName} (${newIndex + 1}/${sampleCount})`;
                    }

                    // Update knob rotation based on 0-based index
                    const percent = sampleCount > 1 ? newIndex / (sampleCount - 1) : 0;
                    const knobRotation = -135 + (percent * 270);
                    sampleKnob.style.setProperty('--knob-rotation', `${knobRotation}deg`);
                }
            }
        }

        function stopDrag() {
            if (!isDragging) return;
            isDragging = false;

            // Clear dragged parameter tracking
            state.modEditMode.draggedParamId = null;

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', updateValue);
            document.removeEventListener('touchmove', updateValue);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);
        }

        sampleKnob.addEventListener('mousedown', startDrag);
        sampleKnob.addEventListener('touchstart', startDrag, { passive: false });
    }

    const knobs = document.querySelectorAll('.baeng-app .knob');
    knobs.forEach(knob => {
        // Skip the DX7 patch knob and sample knob (already handled above)
        if (knob.classList.contains('dx7-patch-knob')) return;
        if (knob.classList.contains('sample-knob')) return;

        try {
            const container = knob.closest('.knob-container');
            if (!container) return;

            const valueDisplay = container.querySelector('.knob-value');
            const moduleElement = knob.closest('.module');
            if (!moduleElement) return;

            const moduleId = moduleElement.id;
            const labelElement = container.querySelector('.knob-label');
            if (!labelElement || !valueDisplay) return;

            // Use data-label attribute from knob if present, otherwise use label text
            const labelText = knob.getAttribute('data-label') || labelElement.textContent.trim();
            const paramId = findParameterId(moduleId, labelText);

            if (!paramId) {
                console.warn(`[setupKnobs] Could not find paramId for module '${moduleId}', label '${labelText}'`);
                return;
            }

        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) return;

        let currentValue = getParameterValue(paramId);
        updateKnobVisuals(knob, valueDisplay, currentValue, paramDef, paramId);

        let isDragging = false;
        let startY = 0;
        let startValue = 0;

        function startDrag(e) {
            if (e.type === 'touchstart') e.preventDefault();

            isDragging = true;
            startY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;

            // Track which parameter is being dragged (to pause modulation for it)
            // Use compound key for voice params to avoid pausing other voices
            if (paramDef.voiceParam) {
                // Voice parameter: include voice index to target specific voice
                state.modEditMode.draggedParamId = `${state.selectedVoice}:${paramId}`;
            } else {
                // Effect/global parameter: use plain paramId
                state.modEditMode.draggedParamId = paramId;
            }

            // Detect Control All modifier (Cmd on Mac, Ctrl on Windows/Linux)
            const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform);
            dragState.controlAllActive = (isMac ? e.metaKey : e.ctrlKey) || false;

            // Check if we're in modulation edit mode - if so, get current knob rotation as start value
            const editMode = state.modEditMode;
            if (editMode.activeParamId === paramId && editMode.currentPage > 0) {
                // In edit mode - start value should be 0-1 percentage based on current rotation
                const currentRotation = parseFloat(knob.style.getPropertyValue('--knob-rotation')) || 0;
                startValue = (currentRotation + 135) / 270; // Convert -135 to +135 deg → 0 to 1
            } else {
                // Normal mode
                startValue = getParameterValue(paramId);
            }

            // Visual feedback for Control All
            if (dragState.controlAllActive && paramDef.voiceParam && shouldAllowControlAll(paramId)) {
                document.body.classList.add('control-all-active');
                document.body.style.cursor = 'crosshair';
                knob.classList.add('control-all-dragging');
            } else {
                document.body.style.cursor = 'ns-resize';
            }

            document.body.style.userSelect = 'none';

            document.addEventListener('mousemove', updateValueOnEvent);
            document.addEventListener('touchmove', updateValueOnEvent, { passive: false });
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchend', stopDrag);
        }

        function updateValueOnEvent(e) {
            if (!isDragging && (e.type === 'mousemove' || e.type === 'touchmove')) return;
            if (e.type === 'touchmove' || (e.type === 'mousemove' && isDragging)) e.preventDefault();

            const clientY = e.type.startsWith('touch') ? e.touches[0].clientY : e.clientY;
            const deltaY = startY - clientY; // Inverted: drag up = increase

            // Check if we're in modulation edit mode for this parameter
            const editMode = state.modEditMode;
            const isInEditMode = editMode.activeParamId === paramId && editMode.currentPage > 0;

            if (isInEditMode) {
                // In edit mode - work with 0-1 percentage
                const sensitivity = 0.005; // Adjust sensitivity for 0-1 range
                const percentageDelta = deltaY * sensitivity;
                let newPercentage = startValue + percentageDelta;
                newPercentage = Math.max(0, Math.min(1, newPercentage));

                // Update knob rotation immediately for visual feedback
                const knobRotation = -135 + (newPercentage * 270);
                knob.style.setProperty('--knob-rotation', `${knobRotation}deg`);

                // Update the modulation config value
                updateModulationValueFromDrag(paramId, newPercentage);
                return;
            }

            // Normal mode
            const sensitivity = 0.5; // Adjust sensitivity
            const valueDelta = deltaY * sensitivity;

            let min = paramDef.min;
            let max = paramDef.max;

            // Dynamic max for euclidean parameters based on constraints
            if (paramId.startsWith('euclidean.')) {
                const voiceIndex = state.selectedVoice;
                const sequence = state.sequences[voiceIndex];
                if (sequence && sequence.euclidean) {
                    const eucParams = sequence.euclidean;
                    const steps = eucParams.steps || 16;
                    const fills = eucParams.fills || 0;

                    if (paramId === 'euclidean.fills') {
                        max = steps; // FILLS can't exceed STEPS
                    } else if (paramId === 'euclidean.shift') {
                        max = steps - 1; // SHIFT is 0 to STEPS-1
                    } else if (paramId === 'euclidean.accentAmt') {
                        // ACCENT limited by fills and other decorations
                        const flamAmt = eucParams.flamAmt || 0;
                        const ratchetAmt = eucParams.ratchetAmt || 0;
                        max = fills - flamAmt - ratchetAmt;
                    } else if (paramId === 'euclidean.flamAmt') {
                        // FLAM limited by fills and other decorations
                        const accentAmt = eucParams.accentAmt || 0;
                        const ratchetAmt = eucParams.ratchetAmt || 0;
                        max = fills - accentAmt - ratchetAmt;
                    } else if (paramId === 'euclidean.ratchetAmt') {
                        // RATCHET limited by fills and other decorations
                        const accentAmt = eucParams.accentAmt || 0;
                        const flamAmt = eucParams.flamAmt || 0;
                        max = fills - accentAmt - flamAmt;
                    }
                }
            }

            let newValue = startValue + valueDelta;
            newValue = Math.max(min, Math.min(max, newValue));

            if (paramDef.step && paramDef.step !== 0) {
                newValue = Math.round(newValue / paramDef.step) * paramDef.step;
            } else {
                newValue = Math.round(newValue);
            }

            // Check if Control All is active
            const controlAllActive = dragState.controlAllActive;
            const isVoiceParam = paramDef.voiceParam;

            if (isVoiceParam && controlAllActive && shouldAllowControlAll(paramId)) {
                // Control All: Apply to all voices
                if (applyParameterToAllVoices(paramId, newValue)) {
                    currentValue = getParameterValue(paramId);
                    updateKnobVisuals(knob, valueDisplay, currentValue, paramDef, paramId);

                    // Update modulation baseValue for all voices
                    updateModulatedParameterBaseValue(paramId, newValue);

                    // Handle macro control updates for all voices
                    // Apply only the specific macro that changed (don't re-apply all macros)
                    if (paramId.startsWith('voice.macro')) {
                        import('./modules/engines.js').then(module => {
                            for (let v = 0; v < state.voices.length; v++) {
                                module.applySingleMacro(paramId, state.voices[v]);
                            }
                        });

                        // For analog/sampler engines, update active voice instances in real-time
                        import('./modules/engine.js').then(engineModule => {
                            for (let v = 0; v < state.voices.length; v++) {
                                const voice = state.voices[v];
                                if (voice && (voice.engine === 'aKICK' || voice.engine === 'aSNARE' || voice.engine === 'aHIHAT' || voice.engine === 'SAMPLE' || voice.engine === 'SLICE')) {
                                    engineModule.updateAnalogEngineParams(v, voice);
                                }
                            }
                        });
                    }

                    // Handle euclidean parameter updates for all voices
                    if (paramId.startsWith('euclidean.')) {
                        for (let v = 0; v < state.voices.length; v++) {
                            import('./modules/euclidean.js').then(module => {
                                module.updateEuclideanSequence(v);
                                updateSequenceUI();
                            });
                        }
                    } else {
                        updateEngineParams();
                    }
                }
            } else {
                // Normal parameter update
                // Update modulation baseValue BEFORE setting parameter to prevent timing issues
                updateModulatedParameterBaseValue(paramId, newValue);

                if (setParameterValue(paramId, newValue)) {
                    currentValue = getParameterValue(paramId);
                    updateKnobVisuals(knob, valueDisplay, currentValue, paramDef, paramId);

                    // Handle decay parameter updates - update active voices in real-time
                    if ((paramId === 'voice.layerADecay' || paramId === 'voice.layerBDecay') && state.selectedVoice !== null) {
                        const decayParams = {};
                        if (paramId === 'voice.layerADecay') {
                            decayParams.layerADecay = newValue;
                        } else if (paramId === 'voice.layerBDecay') {
                            decayParams.layerBDecay = newValue;
                        }
                        updateVoiceEnvelope(state.selectedVoice, decayParams);
                    }

                    // Handle macro control updates
                    // Apply only the specific macro that changed (don't re-apply all macros)
                    if (paramId.startsWith('voice.macro')) {
                        const voiceIndex = state.selectedVoice;
                        if (voiceIndex !== null && voiceIndex >= 0 && voiceIndex < state.voices.length) {
                            import('./modules/engines.js').then(module => {
                                module.applySingleMacro(paramId, state.voices[voiceIndex]);
                            });

                            // For analog/sampler engines, update active voice instances in real-time
                            const voice = state.voices[voiceIndex];
                            if (voice && (voice.engine === 'aKICK' || voice.engine === 'aSNARE' || voice.engine === 'aHIHAT' || voice.engine === 'SAMPLE' || voice.engine === 'SLICE')) {
                                import('./modules/engine.js').then(module => {
                                    module.updateAnalogEngineParams(voiceIndex, voice);
                                });
                            }
                        }
                    }

                    // Handle euclidean parameter updates
                    if (paramId.startsWith('euclidean.')) {
                        const voiceIndex = state.selectedVoice;
                        if (voiceIndex !== null && voiceIndex >= 0 && voiceIndex < state.voices.length) {
                            import('./modules/euclidean.js').then(module => {
                                module.updateEuclideanSequence(voiceIndex);
                                updateSequenceUI();
                            });
                        }
                        // Don't call updateEngineParams for euclidean params - they only affect sequencer
                    } else if (paramId.startsWith('effects.')) {
                        // Only update engine params for effects
                        updateEngineParams();
                    } else if (paramId.startsWith('bus.')) {
                        // Update drum bus params for BUS module knobs
                        updateDrumBusParams();
                    }
                }
            }
        }

        function stopDrag() {
            if (!isDragging) return;
            isDragging = false;

            // Clear dragged parameter tracking
            state.modEditMode.draggedParamId = null;

            // CRITICAL FIX: Update knob visual to show baseValue position
            // This prevents the modulation animation from immediately overwriting the user's adjustment
            const modConfig = state.perParamModulations?.[paramId];
            if (modConfig) {
                let hasActiveModulation = false;
                let baseValueToShow = null;

                if (modConfig.isVoiceParam) {
                    const voiceConfig = modConfig.voices?.[state.selectedVoice];
                    hasActiveModulation = voiceConfig?.enabled &&
                                         voiceConfig?.depth !== 0 &&
                                         !voiceConfig?.muted &&
                                         voiceConfig?.baseValue !== null;
                    baseValueToShow = voiceConfig?.baseValue;
                } else {
                    hasActiveModulation = modConfig.enabled &&
                                         modConfig.depth !== 0 &&
                                         !modConfig.muted &&
                                         modConfig.baseValue !== null;
                    baseValueToShow = modConfig.baseValue;
                }

                // If modulation is active, update knob to show baseValue position
                if (hasActiveModulation && baseValueToShow !== null) {
                    const basePercentage = (baseValueToShow - paramDef.min) / (paramDef.max - paramDef.min);
                    const baseRotation = -135 + (basePercentage * 270);
                    knob.style.setProperty('--knob-rotation', `${baseRotation}deg`);
                }
            }

            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.classList.remove('control-all-active');
            knob.classList.remove('control-all-dragging');
            dragState.controlAllActive = false;
            document.removeEventListener('mousemove', updateValueOnEvent);
            document.removeEventListener('touchmove', updateValueOnEvent);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchend', stopDrag);

            // Capture snapshot after knob change (debounced)
            if (historyManager) {
                historyManager.pushSnapshot(true);
            }
        }

            knob.addEventListener('mousedown', startDrag);
            knob.addEventListener('touchstart', startDrag, { passive: false });
        } catch (error) {
            console.error(`[setupKnobs] Error setting up knob:`, error);
        }
    });
}

function updateKnobVisuals(knob, valueDisplay, value, paramDef, paramId = null) {
    if (value === null || value === undefined || !paramDef) return;

    let min = paramDef.min;
    let max = paramDef.max;
    const percent = ((value - min) / (max - min)) * 100;

    // Calculate rotation: -135deg to +135deg (270 degree range)
    const rotation = -135 + (percent / 100) * 270;
    knob.style.setProperty('--knob-rotation', `${rotation}deg`);

    // Format value for display
    let displayValue = value;
    if (paramId) {
        const currentParamId = paramId || Object.keys(parameterDefinitions).find(id => parameterDefinitions[id] === paramDef);

        if (paramDef.step && Number.isInteger(paramDef.step) && paramDef.step !== 0) {
            displayValue = Math.round(value / paramDef.step) * paramDef.step;
            displayValue = parseFloat(displayValue.toFixed(5));
            if (displayValue % 1 === 0) displayValue = parseInt(displayValue);
        }

        // Special formatting for specific params
        if (currentParamId === 'voice.pan') {
            displayValue = value === 50 ? 'C' : (value < 50 ? 'L' + Math.round((50 - value) * 2) : 'R' + Math.round((value - 50) * 2));
        } else if (currentParamId === 'voice.chokeGroup') {
            displayValue = value === 0 ? 'OFF' : value;
        }
    }

    valueDisplay.textContent = displayValue;
}

// Update all knobs in the UI to reflect current voice parameters
function updateAllKnobs() {
    // Update regular knobs (ENGINE, VOICES, TIME, REVERB, DELAY modules)
    // Exclude special knobs that have custom update logic
    const knobs = document.querySelectorAll('.baeng-app .knob:not(.dx7-patch-knob):not(.sample-knob):not(.slice-knob)');

    knobs.forEach(knob => {
        const container = knob.closest('.knob-container');
        if (!container) return;

        const labelEl = container.querySelector('.baeng-app .knob-label');
        const valueDisplay = container.querySelector('.baeng-app .knob-value');
        if (!labelEl || !valueDisplay) return;

        const labelText = knob.getAttribute('data-label') || labelEl.textContent.trim();
        const moduleElement = knob.closest('.module');
        if (!moduleElement) return;

        const moduleId = moduleElement.id;
        const paramId = findParameterId(moduleId, labelText);

        if (!paramId) return;

        const paramDef = parameterDefinitions[paramId];
        if (!paramDef) return;

        // Skip updating if this parameter has active modulation
        // This prevents UI updates from overwriting modulation visuals during undo/redo
        const modConfig = state.perParamModulations?.[paramId];
        if (modConfig) {
            let hasActiveModulation = false;

            if (modConfig.isVoiceParam) {
                const voiceConfig = modConfig.voices?.[state.selectedVoice];
                hasActiveModulation = voiceConfig?.enabled &&
                                     voiceConfig?.depth > 0 &&
                                     !voiceConfig?.muted &&
                                     voiceConfig?.baseValue !== null;
            } else {
                hasActiveModulation = modConfig.enabled &&
                                     modConfig.depth > 0 &&
                                     !modConfig.muted &&
                                     modConfig.baseValue !== null;
            }

            // Let modulation system handle visual updates for modulated params
            if (hasActiveModulation) {
                return; // Skip this knob
            }
        }

        let value = getParameterValue(paramId);
        updateKnobVisuals(knob, valueDisplay, value, paramDef, paramId);
    });

    // Update special knobs separately (have custom display logic)
    updateDX7PatchKnob();
    updateSampleKnob();
    updateSliceKnob();

    // Update LED ring knobs from state
    syncAllLEDRingKnobs();
}

// Update DX7 patch knob to reflect current voice's patch
function updateDX7PatchKnob() {
    const patchKnob = document.querySelector('.baeng-app .dx7-patch-knob');
    if (!patchKnob) return;

    const voice = state.voices[state.selectedVoice];
    if (!voice) return;

    const container = patchKnob.closest('.knob-container');
    const valueDisplay = container?.querySelector('.baeng-app .knob-value');
    const patchNameEl = document.querySelector('.baeng-app .dx7-patch-name');

    if (voice.dx7PatchIndex !== undefined && voice.dx7BankSize) {
        const min = 0;
        const max = voice.dx7BankSize - 1;
        const rotation = -135 + ((voice.dx7PatchIndex / Math.max(1, max)) * 270);
        patchKnob.style.setProperty('--knob-rotation', `${rotation}deg`);

        if (valueDisplay) {
            valueDisplay.textContent = voice.dx7PatchIndex + 1;
        }

        if (patchNameEl && voice.dx7PatchName) {
            patchNameEl.textContent = voice.dx7PatchName;
        }
    }
}

// Update sample knob to reflect current voice's sample selection
function updateSampleKnob() {
    const sampleKnob = document.querySelector('.baeng-app .sample-knob');
    if (!sampleKnob) return; // Not in SAMPLE engine mode

    const voice = state.voices[state.selectedVoice];
    if (!voice) return;

    const container = sampleKnob.closest('.knob-container');
    const valueDisplay = container?.querySelector('.knob-value');

    const sampleIndex = voice.sampleIndex !== undefined ? voice.sampleIndex : 0;

    // Use per-voice buffer array (NOT global manager)
    const voiceSampleBank = voice.samplerBuffer;
    const sampleCount = voiceSampleBank?.length || 0;

    if (sampleCount > 0) {
        // Calculate knob rotation based on 0-based index
        const percent = sampleCount > 1 ? sampleIndex / (sampleCount - 1) : 0;
        const rotation = -135 + (percent * 270);
        sampleKnob.style.setProperty('--knob-rotation', `${rotation}deg`);

        if (valueDisplay) {
            const sampleName = voiceSampleBank[sampleIndex]?.name || `Sample ${sampleIndex + 1}`;
            // Display: "X/N" where X is 1-based for display (index-only mode)
            valueDisplay.textContent = `${sampleIndex + 1}/${sampleCount}`;
            // Add tooltip with full name for reference
            valueDisplay.title = `${sampleName} (${sampleIndex + 1}/${sampleCount})`;
        }
    }
}

// Update slice knob to reflect current voice's slice selection
function updateSliceKnob() {
    const sliceKnob = document.querySelector('.baeng-app .slice-knob');
    if (!sliceKnob) return; // Not in SLICE engine mode

    const voice = state.voices[state.selectedVoice];
    if (!voice || !voice.sliceConfig) return;

    const container = sliceKnob.closest('.knob-container');
    const valueDisplay = container?.querySelector('.knob-value');

    const sliceIndex = voice.sliceIndex !== undefined ? voice.sliceIndex : 0;
    const sliceCount = voice.sliceConfig.slices?.length || 1;

    if (sliceCount > 0) {
        // Calculate knob rotation based on 0-based index
        const percent = sliceCount > 1 ? sliceIndex / (sliceCount - 1) : 0;
        const rotation = -135 + (percent * 270);
        sliceKnob.style.setProperty('--knob-rotation', `${rotation}deg`);

        if (valueDisplay) {
            // Display: "X/N" where X is 1-based for display
            valueDisplay.textContent = `${sliceIndex + 1}/${sliceCount}`;
        }
    }
}

function updateFaderVisuals(track, fill, valueDisplay, value, paramDef, paramId = null) {
    if (value === null || value === undefined || !paramDef) {
        // console.warn("updateFaderVisuals: Missing value or paramDef", value, paramDef, track);
        return;
    }

    // Get dynamic range for euclidean parameters
    let min = paramDef.min;
    let max = paramDef.max;
    if (paramId && paramId.startsWith('euclidean.')) {
        const range = getParameterRange(paramId, state);
        min = range.min;
        max = range.max;
    }

    const percent = ((value - min) / (max - min)) * 100;
    fill.style.height = `${Math.max(0, Math.min(100, percent))}%`;

    let displayValue = value;
    // Use paramId from paramDef for consistency in formatting decisions
    const currentParamId = paramId || Object.keys(parameterDefinitions).find(id => parameterDefinitions[id] === paramDef);

    if (paramDef.step && Number.isInteger(paramDef.step) && paramDef.step !== 0) {
        displayValue = Math.round(value / paramDef.step) * paramDef.step;
        displayValue = parseFloat(displayValue.toFixed(5));
        if (displayValue % 1 === 0) displayValue = parseInt(displayValue);
    } else if (typeof value === 'number') {
        if (value % 1 === 0) {
            // displayValue = value; // No change
        } else {
            if (currentParamId === "voice.layerBPitchRatio") displayValue = value.toFixed(1);
            else if (Math.abs(max - min) <= 1 && (max - min) !== 0) displayValue = value.toFixed(3);
            else if (Math.abs(max - min) <= 10) displayValue = value.toFixed(2);
            else displayValue = value.toFixed(1);
        }
    }

    if (currentParamId === "voice.chokeGroup") {
        displayValue = value === 0 ? 'OFF' : `GRP ${Math.round(value)}`;
    } else if (currentParamId && (currentParamId.endsWith('Waveform') || currentParamId.endsWith('waveguideType'))) {
        const typesArray = currentParamId.endsWith('Waveform') ? config.WAVEFORM_TYPES : config.WAVEGUIDE_TYPES;
        displayValue = typesArray[Math.round(value)] || 'N/A';
    } else if (currentParamId === "voice.pan") {
        const panVal = Math.round(value);
        if (panVal === 50) displayValue = 'C';
        else if (panVal < 50) displayValue = `L${Math.round((50 - panVal) * 2)}`;
        else displayValue = `R${Math.round((panVal - 50) * 2)}`;
    } else if (paramDef.unit) {
        displayValue = `${displayValue}${paramDef.unit}`;
    }

    valueDisplay.textContent = displayValue;
}


function findParameterId(moduleId, label) {
    // For ENGINE module, check engine-specific label mappings FIRST
    // This prevents conflicts where labels like "DECAY" match wrong parameters
    if (moduleId === 'baeng-engine') {
        const voice = state.voices[state.selectedVoice];
        if (voice && voice.engine) {
            const engineType = voice.engine;
            const engineMacros = ENGINE_MACROS ? ENGINE_MACROS[engineType] : null;

            if (engineMacros) {
                // Map engine-specific labels back to macro parameter IDs
                // Check PATCH, DEPTH, RATE (for 3-knob engines like aKICK, SAMPLE)
                if (engineMacros.PATCH && engineMacros.PATCH.label === label) {
                    return 'voice.macroPatch';
                }
                if (engineMacros.DEPTH && engineMacros.DEPTH.label === label) {
                    return 'voice.macroDepth';
                }
                if (engineMacros.RATE && engineMacros.RATE.label === label) {
                    return 'voice.macroRate';
                }
                // PITCH is special - some engines use it for pitch shift
                if (label === 'PITCH' && engineMacros.PITCH) {
                    return 'voice.macroPitch';
                }
            }
        }
    }

    // Then try direct parameter label match
    for (const id in parameterDefinitions) {
        const paramDef = parameterDefinitions[id];
        if (paramDef.module === moduleId && paramDef.label === label) {
            return id;
        }
    }

    // console.warn(`findParameterId: Not found for module '${moduleId}', label '${label}'`);
    return null;
}

function handleEuclideanParameterChange(paramId, newValue) {
    const voiceIndex = state.selectedVoice;

    switch (paramId) {
        case 'euclidean.steps':
            setEuclideanSteps(voiceIndex, newValue);
            // updateSequenceUI() (called below) handles updating the step boxes
            // No need to re-render entire module - that destroys the knob mid-drag
            break;
        case 'euclidean.fills':
            setEuclideanFills(voiceIndex, newValue);
            break;
        case 'euclidean.shift':
            setEuclideanShift(voiceIndex, newValue);
            break;
        case 'euclidean.accentAmt':
            setAccentAmount(voiceIndex, newValue);
            break;
        case 'euclidean.flamAmt':
            setFlamAmount(voiceIndex, newValue);
            break;
        case 'euclidean.ratchetAmt':
            setRatchetAmount(voiceIndex, newValue);
            break;
        case 'euclidean.ratchetSpeed':
            setRatchetSpeed(voiceIndex, newValue);
            break;
        case 'euclidean.deviation':
            setDeviation(voiceIndex, newValue);
            break;
    }

    // Update cascading ranges for dependent euclidean parameters
    // (fills ≤ steps, shift < steps, accent+flam+ratchet ≤ fills)
    updateEuclideanCascadingRanges();

    // Update the sequence UI to reflect the new pattern
    updateSequenceUI();
}

/**
 * Handle LED Ring Knob parameter changes
 * Routes changes to appropriate handlers based on paramId prefix
 */
function handleLEDRingKnobChange(paramId, value) {
    // Route to appropriate handler based on parameter type
    if (paramId.startsWith('euclidean.')) {
        handleEuclideanParameterChange(paramId, value);
        updateDependentFaders(paramId);
    } else if (paramId.startsWith('time.')) {
        // Time parameters (BPM, swing, barLength)
        handleTimeParameterChange(paramId, value);
    } else if (paramId.startsWith('voice.')) {
        // Per-voice parameters (level, pan, sends, etc.)
        handleVoiceParameterChange(paramId, value);
    } else if (paramId.startsWith('sequence.')) {
        // Sequence parameters (probability)
        handleSequenceParameterChange(paramId, value);
    } else if (paramId.startsWith('effects.')) {
        // Effects parameters (reverb, delay)
        handleEffectsParameterChange(paramId, value);
    } else if (paramId.startsWith('bus.')) {
        // Drum bus parameters
        handleBusParameterChange(paramId, value);
    }

    // Update UI displays
    updateParameterDisplays();
}

/**
 * Handle time parameter changes (BPM, swing, barLength)
 * Uses shared clock functions to ensure both apps stay in sync
 */
function handleTimeParameterChange(paramId, value) {
    switch (paramId) {
        case 'time.bpm':
            setBPM(value);
            break;
        case 'time.swing':
            setSwing(value);
            break;
        case 'time.length':
            setBaengBarLength(value);
            break;
    }
}

/**
 * Handle per-voice parameter changes
 */
function handleVoiceParameterChange(paramId, value) {
    const voiceIndex = state.selectedVoice;
    const voice = state.voices[voiceIndex];
    if (!voice) return;

    const paramName = paramId.replace('voice.', '');

    switch (paramName) {
        case 'level':
            voice.level = value;
            updateEngineParams(voiceIndex);
            // Real-time update for DX7 voices currently playing
            if (voice.engine === 'DX7') {
                updateDX7Level(voiceIndex, value);
            }
            break;
        case 'pan':
            voice.pan = value;
            updateEngineParams(voiceIndex);
            break;
        case 'reverbSend':
            voice.reverbSend = value;
            updateEngineParams(voiceIndex);
            break;
        case 'delaySend':
            voice.delaySend = value;
            updateEngineParams(voiceIndex);
            break;
        case 'cloudsSend':
            voice.cloudsSend = value;
            // Update Clouds routing crossfade based on per-voice send levels
            updateVoiceCloudsRouting(voiceIndex);
            break;
        case 'bitReduction':
            voice.bitReduction = value;
            updateEngineParams(voiceIndex);
            break;
        case 'drive':
            voice.drive = value;
            updateEngineParams(voiceIndex);
            break;
        case 'gate':
            voice.gate = value;
            break;
        case 'chokeGroup':
            voice.chokeGroup = value;
            break;
        case 'macroPatch':
        case 'macroPitch':
        case 'macroDepth':
        case 'macroRate':
            voice[paramName] = value;
            applyAllMacros(voice);
            updateEngineParams(voiceIndex);
            // For analog/sampler engines, also update active voice instances in real-time
            if (voice.engine === 'aKICK' || voice.engine === 'aSNARE' || voice.engine === 'aHIHAT' || voice.engine === 'SAMPLE' || voice.engine === 'SLICE') {
                import('./modules/engine.js').then(module => {
                    module.updateAnalogEngineParams(voiceIndex, voice);
                });
            }
            break;
        case 'dx7PatchIndex':
            voice.dx7PatchIndex = value;
            updateEngineParams(voiceIndex);
            break;
        case 'samplerNote':
            voice.samplerNote = value;
            updateEngineParams(voiceIndex);
            break;
        case 'samplerDecay':
        case 'samplerFilter':
            // SAMPLE/SLICE engine parameters - update active voices in real-time
            voice[paramName] = value;
            import('./modules/engine.js').then(module => {
                module.updateAnalogEngineParams(voiceIndex, voice);
            });
            break;
        case 'analogKickTone':
        case 'analogKickDecay':
        case 'analogKickSweep':
        case 'analogSnareTone':
        case 'analogSnareDecay':
        case 'analogSnareSnap':
        case 'analogHihatMetal':
        case 'analogHihatDecay':
        case 'analogHihatBright':
            // Analog engine parameters - update active voices in real-time
            voice[paramName] = value;
            import('./modules/engine.js').then(module => {
                module.updateAnalogEngineParams(voiceIndex, voice);
            });
            break;
    }
}

/**
 * Handle sequence parameter changes (probability)
 */
function handleSequenceParameterChange(paramId, value) {
    const voiceIndex = state.selectedVoice;
    const sequence = state.sequences[voiceIndex];
    if (!sequence) return;

    if (paramId === 'sequence.probability') {
        sequence.probability = value;
    }
}

/**
 * Handle effects parameter changes (reverb, delay)
 */
function handleEffectsParameterChange(paramId, value) {
    const paramName = paramId.replace('effects.', '');

    // Update state
    state[paramName] = value;

    // Update audio parameters
    updateEngineParams();
}

/**
 * Handle drum bus parameter changes
 */
function handleBusParameterChange(paramId, value) {
    const paramName = paramId.replace('bus.', '');

    // Update drum bus state
    if (state.drumBus) {
        state.drumBus[paramName] = value;
        updateDrumBusParams();
    }
}

function updateDependentFaders(paramId) {
    // When STEPS changes, update FILLS and SHIFT fader displays
    if (paramId === 'euclidean.steps') {
        updateParameterDisplays();
    }
    // When FILLS changes, update ACCENT/FLAM/RATCHET fader displays
    else if (paramId === 'euclidean.fills') {
        updateParameterDisplays();
    }
}

// Update ENGINE header display to show current voice's engine type
function updateEngineHeaderDisplay() {
    const voice = state.voices[state.selectedVoice];
    const engineHeaderButton = document.querySelector('.baeng-app .engine-header-button');

    if (engineHeaderButton && voice) {
        // Import the helper function from components/index.js isn't available here
        // So we'll duplicate the display name logic
        const displayNames = {
            'DX7': 'DX7',
            'SAMPLE': 'SMPL',
            'aKICK': 'aKCK',
            'aSNARE': 'aSNR',
            'aHIHAT': 'aHAT',
            'KICK': 'KICK',
            'SNARE': 'SNR',
            'TOM': 'TOM',
            'CLAP': 'CLAP',
            'HAT': 'HAT',
            'CYMBAL': 'CYM',
            'SHAKE': 'SHK',
            'PERC': 'PRC'
        };

        engineHeaderButton.textContent = displayNames[voice.engine] || voice.engine;

        // Also update load button title
        const loadButton = document.querySelector('.baeng-app .dx7-load-button');
        if (loadButton) {
            const loadTitles = {
                'DX7': 'Load DX7 Bank',
                'SAMPLE': 'Load Sample Folder',
                'aKICK': 'Load Bank',
                'aSNARE': 'Load Bank',
                'aHIHAT': 'Load Bank'
            };
            loadButton.title = loadTitles[voice.engine] || 'Load Bank';
        }
    }
}

function selectVoice(index) {
    if (index < 0 || index >= state.voices.length) return;

    // Check if same voice is already selected
    const wasAlreadySelected = (state.selectedVoice === index);

    state.selectedVoice = index;

    // Update voice selector buttons AND voice rows
    document.querySelectorAll('#voices .voice-selector').forEach((button, i) => {
        button.classList.toggle('active', i === index);
        // Sync muted state with voice data
        const voice = state.voices[i];
        if (voice) {
            button.classList.toggle('muted', voice.muted || false);
        }
    });
    document.querySelectorAll('#voices .voice-row').forEach((row, i) => {
        row.classList.toggle('selected', i === index);
    });

    // Update titles for save/load voice patch buttons
    const voicesModule = document.getElementById('voices');
    if (voicesModule) {
        const saveBtn = voicesModule.querySelector('.save-voice-patch-button');
        if (saveBtn) saveBtn.title = `Save Voice ${index + 1} Patch`;
        const loadBtn = voicesModule.querySelector('.load-voice-patch-button');
        if (loadBtn) loadBtn.title = `Load Patch to Voice ${index + 1}`;
    }

    // Re-render ENGINE module ONLY if we need to (engine type changed or first selection)
    // This prevents unnecessary DOM re-rendering and visual repositioning
    if (!wasAlreadySelected) {
        const mainRow = document.getElementById('baeng-main-row');
        if (mainRow) {
            const oldEngineModule = document.getElementById('baeng-engine');
            if (oldEngineModule) {
                oldEngineModule.remove();
            }

            // Render the new ENGINE module (will be appended to mainRow)
            renderEngineModule(mainRow);
            const newEngineModule = document.getElementById('baeng-engine');

            // Insert ENGINE module in correct position (after VOICES, before CLOUDS/REVERB)
            // Module order: TIME → VOICES → ENGINE → CLOUDS → REVERB → DELAY → OUTPUT
            const reverbModule = document.getElementById('reverb-fx');
            const cloudsModule = document.getElementById('baeng-clouds-fx');
            const insertBeforeModule = cloudsModule || reverbModule;
            if (insertBeforeModule && newEngineModule) {
                // Move ENGINE before CLOUDS or REVERB module
                mainRow.insertBefore(newEngineModule, insertBeforeModule);
            }
            // If neither exists or newEngineModule wasn't created,
            // it stays appended at the end (which is wrong, but shouldn't happen)

            // Ensure spacer is positioned after ENGINE module (fixes spacer position bug)
            updateBaengSpacer();

            // Re-attach event listeners for the re-rendered ENGINE module
            setupLEDRingKnobs(); // Re-initialize LED Ring Knobs for ENGINE module
            setupEngineModuleListeners();
            setupKnobs(); // Re-attach knob drag handlers
            setupModulationClickHandlers(); // Re-attach modulation click handlers
        }
    }

    updateParameterDisplays(); // Update faders in ENGINE and VOICES (choke, level etc.)
    updateSequenceUI();      // Update sequence grid display
    updateEngineHeaderDisplay(); // Update ENGINE header to show selected voice's engine type
}

function selectEngine(engineType) {
    const voiceIndex = state.selectedVoice;
    if (voiceIndex === null || voiceIndex < 0 || voiceIndex >= state.voices.length) return;

    const voice = state.voices[voiceIndex];

    // DEBUG: Track engine changes

    // Update engine type
    voice.engine = engineType;

    // DEBUG: Check state after assignment

    // Clear engine-specific parameters when switching away from engines
    if (engineType !== 'DX7') {
        voice.dx7Patch = null;
        voice.dx7PatchIndex = null;
        voice.dx7BankSize = null;
    }
    if (engineType !== 'SAMPLE') {
        voice.sampleBank = null;
        voice.sampleIndex = null;
    }

    // Apply engine defaults if available
    if (ENGINE_DEFAULTS[engineType]) {
        const defaults = ENGINE_DEFAULTS[engineType];
        // Apply macro defaults (3-knob system: PATCH, DEPTH, RATE)
        if (defaults.macroPatch !== undefined) voice.macroPatch = defaults.macroPatch;
        if (defaults.macroDepth !== undefined) voice.macroDepth = defaults.macroDepth;
        if (defaults.macroRate !== undefined) voice.macroRate = defaults.macroRate;

        // Apply macros to underlying parameters
        applyAllMacros(voice);
    }

    // CRITICAL FIX: Lock macroPitch at 50 for SAMPLE engine
    // SAMPLE engine should always play samples at original pitch (no transpose)
    // This prevents inherited macroPitch values from other engines causing pitch shifts
    if (engineType === 'SAMPLE') {
        voice.macroPitch = 50;

        // Validate sampleIndex after macro application (use per-voice buffer)
        const voiceSampleBank = voice.samplerBuffer;
        const bankSampleCount = voiceSampleBank?.length || 0;
        if (bankSampleCount > 0) {
            // Ensure sampleIndex is valid
            if (voice.sampleIndex === undefined || voice.sampleIndex < 0 || voice.sampleIndex >= bankSampleCount) {
                voice.sampleIndex = 0;  // Default to first sample
                voice.macroPatch = 0;   // Reset macro to match
            }
        }
    }

    // Force DX7 default macros when switching to DX7 engine
    // This ensures consistent behavior regardless of previous engine type
    if (engineType === 'DX7') {
        // ENGINE_DEFAULTS already applied above, but ensure they're set even if undefined
        if (voice.macroDepth === undefined) voice.macroDepth = 50;
        if (voice.macroRate === undefined) voice.macroRate = 50;
        if (voice.macroPitch === undefined) voice.macroPitch = 50;

        // Reconstruct DX7 patch if we have a patch name but no patch object
        // This handles the case where user switched away from DX7 and back
        if (voice.dx7PatchName &&
            !voice.dx7Patch &&
            dx7Library.currentBank &&
            dx7Library.currentBank.length > 0) {


            // Try to get patch from bank by index first (if available)
            if (voice.dx7PatchIndex !== null && voice.dx7PatchIndex !== undefined &&
                voice.dx7PatchIndex >= 0 && voice.dx7PatchIndex < dx7Library.currentBank.length) {
                voice.dx7Patch = dx7Library.currentBank[voice.dx7PatchIndex];
                voice.dx7BankSize = dx7Library.currentBank.length;
            } else {
                // Fallback: search by name
                const patchName = voice.dx7PatchName.trim();
                const patchData = dx7Library.currentBank.find(p => {
                    const candidateName = (p.metadata?.voiceName || p.name || '').trim();
                    return candidateName.toLowerCase() === patchName.toLowerCase() ||
                           candidateName.toLowerCase().startsWith(patchName.toLowerCase());
                });

                if (patchData) {
                    const newIndex = dx7Library.currentBank.indexOf(patchData);
                    voice.dx7Patch = patchData;
                    voice.dx7PatchIndex = newIndex;
                    voice.dx7BankSize = dx7Library.currentBank.length;
                } else {
                    console.warn(`  ✗ Could not find patch "${patchName}" in current bank`);
                    console.warn('  Available patches:', dx7Library.currentBank.map(p => p.metadata?.voiceName || p.name));
                    // Clear inconsistent state
                    voice.dx7PatchName = null;
                    voice.dx7PatchIndex = null;
                    voice.dx7BankSize = 0;
                }
            }
        }
    }

    // Update engine parameters
    updateEngineParams();

    // TARGETED RE-RENDER: Only re-render ENGINE module to avoid side effects on other voices
    // Previously used renderModules() which destroyed ALL modules and could cause state corruption
    const mainRow = document.getElementById('baeng-main-row');
    const oldEngineModule = document.getElementById('baeng-engine');
    if (oldEngineModule) oldEngineModule.remove();

    // Insert ENGINE module at correct position (after VOICES, before CLOUDS or REVERB)
    // Order: TIME → VOICES → ENGINE → CLOUDS → REVERB → DELAY → OUTPUT
    const cloudsModule = document.getElementById('baeng-clouds-fx');
    const reverbModule = document.getElementById('reverb-fx');
    const insertBeforeModule = cloudsModule || reverbModule;
    const tempContainer = document.createElement('div');
    renderEngineModule(tempContainer);
    const newEngineModule = tempContainer.firstChild;
    if (insertBeforeModule && newEngineModule) {
        mainRow.insertBefore(newEngineModule, insertBeforeModule);
    } else {
        // Fallback: append if neither clouds nor reverb found (shouldn't happen)
        renderEngineModule(mainRow);
    }

    // Ensure spacer is positioned after ENGINE module (fixes spacer position bug)
    updateBaengSpacer();

    setupLEDRingKnobs(); // Re-initialize LED Ring Knobs for ENGINE module
    setupEngineModuleListeners();
    setupKnobs(); // Re-attach knob drag handlers for ENGINE module
    setupModulationClickHandlers(); // Re-attach modulation click handlers
}

function toggleStepGate(voiceIndex, stepIndex) {
    // voiceIndex is already state.selectedVoice due to event handler logic
    sequenceToggleStepGate(voiceIndex, stepIndex);
    updateSequenceUI();
}

// New function to implement the 3-state cycle: OFF -> Gate ON -> Accent ON -> OFF
function cycleThroughStepStates(voiceIndex, stepIndex) {
    const sequence = state.sequences[voiceIndex];
    const step = sequence.steps[stepIndex];
    
    if (!step.gate) {
        // If Gate is OFF, turn it ON
        step.gate = true;
        step.accent = 0;
    } else if (step.gate && step.accent === 0) {
        // If Gate is ON but Accent is OFF, turn Accent ON
        step.accent = 10; // Default accent value
    } else {
        // If Gate is ON and Accent is ON, turn Gate OFF
        step.gate = false;
        step.accent = 0;
    }
    
    updateSequenceUI();
}

function toggleStepAccent(voiceIndex, stepIndex) {
    const sequence = state.sequences[voiceIndex];
    const currentAccent = sequence.steps[stepIndex].accent;
    const accentLevels = [0, 5, 10, 15]; // Cycle through these levels
    const currentIndex = accentLevels.indexOf(currentAccent);
    const nextIndex = (currentIndex + 1) % accentLevels.length;
    sequenceSetStepAccent(voiceIndex, stepIndex, accentLevels[nextIndex]);
    updateSequenceUI();
}

function toggleStepRatchet(voiceIndex, stepIndex) {
    const sequence = state.sequences[voiceIndex];
    // Ratchet state is 0-7 (for 1x to 8x triggers).
    // We cycle 0 (1x), 1 (2x), 2 (3x), 3 (4x), 7 (8x)
    const ratchetCycleValues = [0, 1, 2, 3, 7]; 
    let currentCycleIndex = ratchetCycleValues.indexOf(sequence.steps[stepIndex].ratchet);
    if (currentCycleIndex === -1) currentCycleIndex = 0; // Default to 0 if current not in cycle

    const nextCycleIndex = (currentCycleIndex + 1) % ratchetCycleValues.length;
    sequenceSetStepRatchet(voiceIndex, stepIndex, ratchetCycleValues[nextCycleIndex]);
    updateSequenceUI();
}

function toggleStepDeviation(voiceIndex, stepIndex) {
    const sequence = state.sequences[voiceIndex];
    const step = sequence.steps[stepIndex];
    
    const deviationLevels = [0, 33, 66, 100]; // Percentage levels
    
    let currentLevelIndex = deviationLevels.indexOf(step.deviation);

    if (step.deviation === 0) { // If off, turn on to first level
        sequenceSetStepDeviation(voiceIndex, stepIndex, deviationLevels[1]);
    } else if (currentLevelIndex !== -1 && currentLevelIndex < deviationLevels.length - 1) {
        // If on and not max level, increase level
        sequenceSetStepDeviation(voiceIndex, stepIndex, deviationLevels[currentLevelIndex + 1]);
    } else {
        // If on max level, turn off
        sequenceSetStepDeviation(voiceIndex, stepIndex, 0);
    }
    updateSequenceUI();
}


// Set deviation mode and amount for a step - wraps the sequenceSetStepDeviation function
function setStepDeviation(voiceIndex, stepIndex, amount, mode) {
    // This function wraps the sequenceSetStepDeviation function from sequence.js
    // to ensure consistent usage throughout the codebase
    sequenceSetStepDeviation(voiceIndex, stepIndex, amount, mode);
    updateSequenceUI();
}



// Helper function to generate sub-steps HTML
function generateSubStepsHTML(stepData, voiceIdx, stepIdx, isActive) {
    const hasGate = stepData.gate;
    const hasAccent = stepData.accent > 0;
    const hasRatchet = stepData.ratchet > 0;
    const hasDeviation = stepData.deviation > 0;
    const isFlam = stepData.deviation === 20 && stepData.deviationMode === 0;

    // Determine pattern type and sub-step count
    let patternType = 'no-accent';
    let subStepCount = 1;

    if (isFlam) {
        patternType = 'flam';
        subStepCount = 2;
    } else if (hasAccent && !hasRatchet) {
        patternType = 'accent';
        subStepCount = 1;
    } else if (hasRatchet) {
        patternType = `r${stepData.ratchet + 1}`;
        subStepCount = stepData.ratchet + 1;
    }

    // Generate sub-steps
    let subStepsHTML = '';
    for (let i = 0; i < subStepCount; i++) {
        let subStepClass = 'sub-step';
        if (patternType === 'accent') subStepClass += ' accent-box';
        if (patternType === 'flam' && i === 0) subStepClass += ' small-flam';
        if (patternType === 'flam' && i === 1) subStepClass += ' large-flam';
        if (patternType === 'no-accent') subStepClass += ' no-accent-box';

        subStepsHTML += `<div class="${subStepClass}"></div>`;
    }

    // Tooltip
    let tooltipParts = [];
    if (hasGate) {
        tooltipParts.push('Gate: ON');
        if (hasAccent) tooltipParts.push(`Accent: ${stepData.accent}`);
        if (hasRatchet) tooltipParts.push(`Ratchet: ${stepData.ratchet + 1}x`);
        if (isFlam) tooltipParts.push('Flam');
        else if (hasDeviation) tooltipParts.push(`Dev: ${stepData.deviation}%`);
        tooltipParts.push(`Prob: ${stepData.probability}%`);
    } else {
        tooltipParts.push('Gate: OFF');
    }

    // Build container
    return `
        <div class="step-container
                    ${isActive ? 'active' : ''}
                    ${hasGate ? 'gate' : ''}
                    ${hasAccent ? 'accented' : ''}
                    ${hasRatchet ? 'ratchet' : ''}
                    ${hasDeviation && !isFlam ? 'deviated' : ''}
                    ${isFlam ? 'flam' : ''}"
             data-pattern="${patternType}"
             data-voice="${voiceIdx}"
             data-step="${stepIdx}"
             data-probability="${stepData.probability}"
             data-ratchet="${stepData.ratchet}"
             data-deviation="${stepData.deviation}"
             data-deviation-mode="${stepData.deviationMode}"
             style="--probability: ${stepData.probability}; --ratchet-count: ${stepData.ratchet + 1}; --deviation-amount: ${stepData.deviation}"
             title="${tooltipParts.join(' | ')}">
            ${subStepsHTML}
        </div>`;
}

export function updateSequenceUI() {
    const voicesModule = document.getElementById('voices');
    if (!voicesModule) return;

    // NEW: Handle stacked layout (all voices visible)
    const sequenceGridContainer = voicesModule.querySelector('.sequence-grid.stacked');
    if (!sequenceGridContainer) {
        console.warn('Stacked sequence grid not found');
        return;
    }

    // Update all 6 voice rows
    for (let voiceIdx = 0; voiceIdx < state.voices.length; voiceIdx++) {
        const sequence = state.sequences[voiceIdx];
        const voiceRow = sequenceGridContainer.querySelector(`.voice-row[data-voice="${voiceIdx}"]`);
        if (!voiceRow) continue;

        const sequenceRow = voiceRow.querySelector('.sequence-row');
        if (!sequenceRow) continue;

        const stepsToDisplay = Math.min(16, sequence.euclidean ? sequence.euclidean.steps : 16);

        // REBUILD all steps HTML (more efficient than selectively updating)
        let stepsHTML = '';
        for (let stepIdx = 0; stepIdx < stepsToDisplay; stepIdx++) {
            const stepData = stepIdx < sequence.steps.length ? sequence.steps[stepIdx] :
                { gate: false, accent: 0, ratchet: 0, deviation: 0, deviationMode: 1, probability: 100 };
            const isActive = state.isPlaying && sequence.currentStep === stepIdx;
            stepsHTML += generateSubStepsHTML(stepData, voiceIdx, stepIdx, isActive);
        }
        sequenceRow.innerHTML = stepsHTML;
    }
}


function updateParameterDisplays() {
    // Update faders
    for (const paramId in parameterDefinitions) {
        const paramDef = parameterDefinitions[paramId];

        // Skip updating if this parameter has active modulation
        // This prevents UI updates from overwriting modulation visuals during undo/redo
        const modConfig = state.perParamModulations?.[paramId];
        if (modConfig) {
            let hasActiveModulation = false;

            if (modConfig.isVoiceParam) {
                const voiceConfig = modConfig.voices?.[state.selectedVoice];
                hasActiveModulation = voiceConfig?.enabled &&
                                     voiceConfig?.depth > 0 &&
                                     !voiceConfig?.muted &&
                                     voiceConfig?.baseValue !== null;
            } else {
                hasActiveModulation = modConfig.enabled &&
                                     modConfig.depth > 0 &&
                                     !modConfig.muted &&
                                     modConfig.baseValue !== null;
            }

            // Let modulation system handle visual updates for modulated params
            if (hasActiveModulation) {
                continue; // Skip this fader
            }
        }

        // Get regular parameter value
        let value = getParameterValue(paramId); // This resolves [selectedVoice]

        const moduleElement = document.getElementById(paramDef.module);
        if (!moduleElement) continue;

        // Find fader container by data-label
        const faderLabels = moduleElement.querySelectorAll('.baeng-app .fader-container .fader-label');
        let container = null;
        for (const labelEl of faderLabels) {
            if (labelEl.getAttribute('data-label') === paramDef.label) {
                container = labelEl.closest('.fader-container');
                break;
            }
        }

        if (container) {
            const track = container.querySelector('.baeng-app .fader-track');
            const fill = track.querySelector('.baeng-app .fader-fill');
            const valueDisplay = container.querySelector('.baeng-app .fader-value');
            if (track && fill && valueDisplay) {
                updateFaderVisuals(track, fill, valueDisplay, value, paramDef, paramId);
            }
        }
    }

    // Update knobs
    updateAllKnobs();
}

function initSettingsPanel() {
    const settingsPanel = document.getElementById('baeng-settings-panel');
    const settingsGearIcon = document.getElementById('baeng-settings-gear-icon');
    const savePatchButton = document.getElementById('baeng-save-patch-button'); // Global patch
    const loadPatchInput = document.getElementById('baeng-load-patch-input'); // For global patch (the visible button triggers this)
    const loadPatchFileTrigger = document.getElementById('baeng-load-patch-button');

    // Document-level listeners (set up once, never removed)
    // These need to be set up only once to avoid multiple handlers
    if (!window.__settingsDocumentListenersInitialized) {
        // Close panel if clicking outside (check time strip settings button too)
        document.addEventListener('click', (event) => {
            const panel = document.getElementById('baeng-settings-panel');
            const timeStripSettingsBtn = document.querySelector('[data-param-id="baeng-settings"]');
            if (panel &&
                !panel.classList.contains('hidden') &&
                !panel.contains(event.target) &&
                (!timeStripSettingsBtn || !timeStripSettingsBtn.contains(event.target))) {
                panel.classList.add('hidden');
            }
        });

        // Close panel with Escape key
        document.addEventListener('keydown', (event) => {
            const panel = document.getElementById('baeng-settings-panel');
            if (panel && event.key === 'Escape' && !panel.classList.contains('hidden')) {
                panel.classList.add('hidden');
            }
        });

        window.__settingsDocumentListenersInitialized = true;
    }
    if (savePatchButton) savePatchButton.addEventListener('click', handleSaveGlobalPatch);
    if (loadPatchInput && loadPatchFileTrigger) {
         loadPatchFileTrigger.addEventListener('click', () => loadPatchInput.click());
         loadPatchInput.addEventListener('change', handleLoadGlobalPatch);
    }

    // Theme Toggle Button
    const invertDisplayButton = document.getElementById('baeng-invert-display-button');
    if (invertDisplayButton) {
        const savedTheme = loadThemePreference();
        updateThemeButtonText(invertDisplayButton, savedTheme);

        invertDisplayButton.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
            saveThemePreference(newTheme);
            updateThemeButtonText(invertDisplayButton, newTheme);
        });
    }

    // ============================================
    // FX Mode Toggle (Classic / Clouds)
    // ============================================
    const fxModeClassicBtn = document.getElementById('baeng-fx-mode-classic');
    const fxModeCloudsBtn = document.getElementById('baeng-fx-mode-clouds');

    if (fxModeClassicBtn && fxModeCloudsBtn) {
        // Load saved FX mode from localStorage
        const savedFxMode = localStorage.getItem('baeng-fxMode') || 'classic';
        state.fxMode = savedFxMode;

        // Sync button states with loaded state
        fxModeClassicBtn.classList.toggle('active', state.fxMode === 'classic');
        fxModeCloudsBtn.classList.toggle('active', state.fxMode === 'clouds');

        // Sync actual module visibility with loaded state
        if (typeof updateCloudsVisibility === 'function') {
            updateCloudsVisibility();
        }

        fxModeClassicBtn.addEventListener('click', () => {
            if (state.fxMode !== 'classic') {
                state.fxMode = 'classic';
                localStorage.setItem('baeng-fxMode', 'classic');
                updateFXModeUI('classic');
            }
        });

        fxModeCloudsBtn.addEventListener('click', () => {
            if (state.fxMode !== 'clouds') {
                state.fxMode = 'clouds';
                localStorage.setItem('baeng-fxMode', 'clouds');
                updateFXModeUI('clouds');
            }
        });

        // Update FX mode UI and audio routing
        function updateFXModeUI(mode) {
            fxModeClassicBtn.classList.toggle('active', mode === 'classic');
            fxModeCloudsBtn.classList.toggle('active', mode === 'clouds');

            // Update audio routing
            if (typeof updateFXMode === 'function') {
                updateFXMode(mode);
            }

            // Update module visibility
            if (typeof updateCloudsVisibility === 'function') {
                updateCloudsVisibility();
            }

            // Re-render engine module to update send knobs
            const mainRow = document.getElementById('baeng-main-row');
            if (mainRow) {
                // Stop visualisation before destroying canvas DOM
                stopBusVisualization();

                renderModules();
                setupLEDRingKnobs();
                setupModulationClickHandlers();

                // Restart visualisation with new canvas element
                startBusVisualization();
            }

            console.log(`[Bæng] FX Mode: ${mode}`);
        }
    }

    // ============================================
    // Gradient Mode Toggle and Theme Controls
    // ============================================

    const gradientModeToggle = document.getElementById('baeng-gradient-mode-toggle');
    const singleColorControls = document.getElementById('baeng-single-color-controls');
    const gradientColorControls = document.getElementById('baeng-gradient-color-controls');

    // Initialize gradient mode state
    if (gradientModeToggle) {
        gradientModeToggle.checked = isGradientModeEnabled();
        toggleGradientControls(gradientModeToggle.checked);

        gradientModeToggle.addEventListener('change', (e) => {
            const enabled = e.target.checked;
            setGradientMode(enabled);
            toggleGradientControls(enabled);

            // Re-apply theme based on mode
            if (enabled) {
                const { hue1, hue2, rotation } = loadThemeGradient();
                setThemeGradient(hue1, hue2, rotation);
            } else {
                const hue = loadThemeHue();
                setThemeHue(hue);
            }
        });
    }

    function toggleGradientControls(gradientEnabled) {
        if (gradientEnabled) {
            singleColorControls.style.display = 'none';
            gradientColorControls.style.display = 'block';
        } else {
            singleColorControls.style.display = 'block';
            gradientColorControls.style.display = 'none';
        }
    }

    // ============================================
    // Single Color Mode - Hue Fader
    // ============================================

    const singleHueFader = document.getElementById('baeng-single-hue-fader');
    const singleHueFill = document.getElementById('baeng-single-hue-fill');
    const singleHueValue = document.getElementById('baeng-single-hue-value');

    if (singleHueFader && singleHueFill && singleHueValue) {
        const savedHue = loadThemeHue();
        updateSingleHueFaderDisplay(savedHue);

        let isDragging = false;

        function updateHueFromMouse(e) {
            const rect = singleHueFader.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const percentage = x / rect.width;
            const hue = Math.round(percentage * 360);

            setThemeHue(hue);
            saveThemeHue(hue);
            updateSingleHueFaderDisplay(hue);
        }

        function updateSingleHueFaderDisplay(hue) {
            const percentage = (hue / 360) * 100;
            singleHueFill.style.width = `${percentage}%`;
            singleHueValue.textContent = `${hue}°`;
        }

        singleHueFader.addEventListener('mousedown', (e) => {
            isDragging = true;
            updateHueFromMouse(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                updateHueFromMouse(e);
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    // ============================================
    // Gradient Mode - Dual Hue Faders
    // ============================================

    const gradientHueFader1 = document.getElementById('baeng-gradient-hue-fader-1');
    const gradientHueFill1 = document.getElementById('baeng-gradient-hue-fill-1');
    const gradientHueValue1 = document.getElementById('baeng-gradient-hue-value-1');

    const gradientHueFader2 = document.getElementById('baeng-gradient-hue-fader-2');
    const gradientHueFill2 = document.getElementById('baeng-gradient-hue-fill-2');
    const gradientHueValue2 = document.getElementById('baeng-gradient-hue-value-2');

    let currentGradientHues = { hue1: 45, hue2: 180, rotation: 90 };

    if (gradientHueFader1 && gradientHueFader2) {
        const { hue1, hue2, rotation } = loadThemeGradient();
        currentGradientHues = { hue1, hue2, rotation };
        updateGradientHueFaderDisplay(1, hue1);
        updateGradientHueFaderDisplay(2, hue2);

        // Setup fader 1
        setupGradientFader(gradientHueFader1, 1);

        // Setup fader 2
        setupGradientFader(gradientHueFader2, 2);

        function setupGradientFader(fader, index) {
            let isDragging = false;

            function updateHueFromMouse(e) {
                const rect = fader.getBoundingClientRect();
                const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
                const percentage = x / rect.width;
                const hue = Math.round(percentage * 360);

                if (index === 1) {
                    currentGradientHues.hue1 = hue;
                } else {
                    currentGradientHues.hue2 = hue;
                }

                setThemeGradient(currentGradientHues.hue1, currentGradientHues.hue2, currentGradientHues.rotation);
                saveThemeGradient(currentGradientHues.hue1, currentGradientHues.hue2, currentGradientHues.rotation);
                updateGradientHueFaderDisplay(index, hue);
            }

            fader.addEventListener('mousedown', (e) => {
                isDragging = true;
                updateHueFromMouse(e);
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    updateHueFromMouse(e);
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });
        }

        function updateGradientHueFaderDisplay(index, hue) {
            const percentage = (hue / 360) * 100;
            const fill = index === 1 ? gradientHueFill1 : gradientHueFill2;
            const value = index === 1 ? gradientHueValue1 : gradientHueValue2;

            fill.style.width = `${percentage}%`;
            value.textContent = `${hue}°`;
        }
    }

    // ============================================
    // Gradient Rotation Fader
    // ============================================

    const gradientRotationFader = document.getElementById('baeng-gradient-rotation-fader');
    const gradientRotationFill = document.getElementById('baeng-gradient-rotation-fill');
    const gradientRotationValue = document.getElementById('baeng-gradient-rotation-value');

    if (gradientRotationFader && gradientRotationFill && gradientRotationValue) {
        const { rotation } = loadThemeGradient();
        currentGradientHues.rotation = rotation;
        updateRotationFaderDisplay(rotation);

        let isDragging = false;

        function updateRotationFromMouse(e) {
            const rect = gradientRotationFader.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const percentage = x / rect.width;
            const rotation = Math.round(percentage * 360);

            currentGradientHues.rotation = rotation;
            setThemeGradient(currentGradientHues.hue1, currentGradientHues.hue2, rotation);
            saveThemeGradient(currentGradientHues.hue1, currentGradientHues.hue2, rotation);
            updateRotationFaderDisplay(rotation);
        }

        function updateRotationFaderDisplay(rotation) {
            const percentage = (rotation / 360) * 100;
            gradientRotationFill.style.width = `${percentage}%`;
            gradientRotationValue.textContent = `${rotation}°`;
        }

        gradientRotationFader.addEventListener('mousedown', (e) => {
            isDragging = true;
            updateRotationFromMouse(e);
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                updateRotationFromMouse(e);
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    // ============================================
    // Gradient Preset Buttons
    // ============================================

    const presetButtons = document.querySelectorAll('.baeng-app .gradient-preset-btn');
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const hue1 = parseInt(btn.dataset.hue1);
            const hue2 = parseInt(btn.dataset.hue2);

            currentGradientHues.hue1 = hue1;
            currentGradientHues.hue2 = hue2;

            setThemeGradient(hue1, hue2, currentGradientHues.rotation);
            saveThemeGradient(hue1, hue2, currentGradientHues.rotation);

            updateGradientHueFaderDisplay(1, hue1);
            updateGradientHueFaderDisplay(2, hue2);
        });
    });

    // Scale Quantization Controls
    initScaleQuantizationControls();

    // ============================================
    // Manual Modal
    // ============================================
    const rtfmButton = document.getElementById('baeng-rtfm-button');
    const manualModal = document.getElementById('baeng-manual-modal');
    const closeManualBtn = document.getElementById('baeng-close-manual-btn');

    if (rtfmButton && manualModal && closeManualBtn) {
        // Open manual modal
        rtfmButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent click from bubbling to document handler
            // Close settings panel first to avoid overlap
            if (settingsPanel) {
                settingsPanel.classList.add('hidden');
            }
            // Open manual modal
            manualModal.classList.remove('hidden');
        });

        // Close manual modal via close button
        closeManualBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            manualModal.classList.add('hidden');
        });

        // Close manual modal when clicking outside
        document.addEventListener('click', (event) => {
            if (!manualModal.classList.contains('hidden') &&
                !manualModal.contains(event.target) &&
                !rtfmButton.contains(event.target)) {
                manualModal.classList.add('hidden');
            }
        });

        // Close manual modal with Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !manualModal.classList.contains('hidden')) {
                manualModal.classList.add('hidden');
            }
        });
    }

    // Manual sidebar toggle
    const toggleSidebarBtn = document.getElementById('baeng-toggle-manual-sidebar');
    const manualSidebar = document.getElementById('baeng-manual-sidebar');

    if (toggleSidebarBtn && manualSidebar) {
        toggleSidebarBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent click from bubbling
            manualSidebar.classList.toggle('hidden');
        });
    }

    // Manual sidebar navigation - smooth scroll to sections
    if (manualSidebar && manualModal) {
        const sidebarLinks = manualSidebar.querySelectorAll('a[href^="#"]');
        const scrollContainer = manualModal.querySelector('.manual-main-content');

        sidebarLinks.forEach(link => {
            link.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation(); // Prevent click bubbling to document listener that closes modal
                const targetId = link.getAttribute('href').substring(1);
                const targetElement = document.getElementById(targetId);

                if (targetElement && scrollContainer) {
                    // Use native scrollIntoView for reliable positioning
                    targetElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                        inline: 'nearest'
                    });

                    // Update active link
                    sidebarLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                }
            });
        });
    }
}

function initScaleQuantizationControls() {
    const scaleQuantizeCheckbox = document.getElementById('baeng-scale-quantize-enabled');
    const scaleSelect = document.getElementById('baeng-scale-select');
    const rootSelect = document.getElementById('baeng-root-select');

    // Populate scale select with all scales
    if (scaleSelect) {
        import('./utils/scaleQuantizer.js').then(({ scales }) => {
            scaleSelect.innerHTML = '';
            scales.forEach((scale, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = scale.name;
                scaleSelect.appendChild(option);
            });
            scaleSelect.value = state.globalScale;
        });
    }

    // Initialize checkbox state
    if (scaleQuantizeCheckbox) {
        scaleQuantizeCheckbox.checked = state.scaleQuantizeEnabled;
        scaleQuantizeCheckbox.addEventListener('change', (e) => {
            state.scaleQuantizeEnabled = e.target.checked;
        });
    }

    // Initialize scale select
    if (scaleSelect) {
        scaleSelect.addEventListener('change', (e) => {
            state.globalScale = parseInt(e.target.value, 10);
        });
    }

    // Initialize root select
    if (rootSelect) {
        rootSelect.value = state.globalRoot;
        rootSelect.addEventListener('change', (e) => {
            state.globalRoot = parseInt(e.target.value, 10);
        });
    }
}

function updateThemeButtonText(button, theme) {
    if (theme === 'light') {
        button.textContent = 'Switch to Dark Mode';
    } else {
        button.textContent = 'Switch to Light Mode';
    }
}

function handleSaveGlobalPatch() {
    const patchData = getPatchDataToSave();
    const patchJson = JSON.stringify(patchData, null, 2);
    const blob = new Blob([patchJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    a.download = `baeng_patch_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const feedbackEl = document.getElementById('baeng-patch-feedback');
    if (feedbackEl) {
        feedbackEl.textContent = 'Global Patch saved!';
        setTimeout(() => { feedbackEl.textContent = ''; }, 3000);
    }
}

function getPatchDataToSave() {
    // Create a deep clone to avoid modifying the live state object
    const patchClone = deepClone(state);

    // List of runtime state properties that shouldn't be saved in a patch
    const runtimeProps = [
        'isPlaying', 'currentStepIndex', 'displayBar', 'displayBeat', 'displayStep',
        'isBarStart', 'clockRequestId', 'lastStepTime', 'stepCounter', 'barCounter',
        'stepsPerBeat'
    ];

    // Remove runtime properties from clone
    runtimeProps.forEach(prop => delete patchClone[prop]);

    // Also remove shared timing properties (bpm, swing, bar lengths) as they go in shared section
    const sharedTimingProps = ['bpm', 'swing', 'baengBarLength', 'raemblBarLength'];
    sharedTimingProps.forEach(prop => delete patchClone[prop]);

    // Create unified patch format with independent bar lengths
    const unifiedPatch = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        shared: {
            bpm: state.bpm,
            swing: state.swing,
            baengBarLength: state.baengBarLength,
            raemblBarLength: state.raemblBarLength
        },
        baeng: patchClone
    };

    return unifiedPatch;
}

function handleLoadGlobalPatch(event) {
    const file = event.target.files[0];
    const feedbackEl = document.getElementById('baeng-patch-feedback');
    if (!file) {
        if (feedbackEl) feedbackEl.textContent = 'No file selected.';
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loadedPatch = JSON.parse(e.target.result);
            applyLoadedPatchData(loadedPatch); 
            if (feedbackEl) {
                feedbackEl.textContent = 'Global Patch loaded!';
                setTimeout(() => { feedbackEl.textContent = ''; }, 3000);
            }
        } catch (error) {
            if (feedbackEl) feedbackEl.textContent = 'Error: Could not load patch.';
        }
    };
    reader.readAsText(file);
    event.target.value = null; // Reset file input to allow loading the same file again
}

function applyLoadedPatchData(loadedPatch) {
    const wasPlaying = state.isPlaying;
    if (wasPlaying) togglePlay(); // Stop playback

    // Determine patch format and extract data
    let patchData;
    let sharedData = null;

    if (loadedPatch.version && loadedPatch.baeng) {
        // New unified format
        patchData = loadedPatch.baeng;
        sharedData = loadedPatch.shared;
    } else {
        // Old format (backward compatibility)
        patchData = loadedPatch;
    }

    // Update shared timing parameters if present
    if (sharedData) {
        if (typeof sharedData.bpm === 'number') state.bpm = sharedData.bpm;
        if (typeof sharedData.swing === 'number') state.swing = sharedData.swing;

        // Handle bar lengths with backwards compatibility
        if (typeof sharedData.barLength === 'number') {
            // Legacy format: apply same length to both apps
            state.baengBarLength = sharedData.barLength;
            state.raemblBarLength = sharedData.barLength;
        } else {
            // New format: separate lengths
            if (typeof sharedData.baengBarLength === 'number') state.baengBarLength = sharedData.baengBarLength;
            if (typeof sharedData.raemblBarLength === 'number') state.raemblBarLength = sharedData.raemblBarLength;
        }
    }

    // Carefully merge patchData into state
    for (const key in state) {
        if (patchData.hasOwnProperty(key)) {
            // For voices and sequences, we need to be careful about array lengths and object structures
            if (key === 'voices' && Array.isArray(patchData[key])) {
                for (let i = 0; i < state.voices.length; i++) {
                    if (patchData.voices[i]) {
                        // Merge each voice object individually
                        Object.assign(state.voices[i], patchData.voices[i]);

                        // MIGRATION: waveguideSend → cloudsSend (v1.1.0 → v1.2.0)
                        if (patchData.voices[i].waveguideSend !== undefined && state.voices[i].cloudsSend === undefined) {
                            state.voices[i].cloudsSend = patchData.voices[i].waveguideSend;
                        }
                        // Clean up old property if it was migrated
                        if (state.voices[i].waveguideSend !== undefined) {
                            delete state.voices[i].waveguideSend;
                        }
                    }
                }
            } else if (key === 'sequences' && Array.isArray(patchData[key])) {
                 for (let i = 0; i < state.sequences.length; i++) {
                    if (patchData.sequences[i]) {
                        // Merge sequence properties like length, currentStep
                        state.sequences[i].length = patchData.sequences[i].length || 16;
                        state.sequences[i].currentStep = patchData.sequences[i].currentStep || -1;
                        // Deep copy steps array
                        if (Array.isArray(patchData.sequences[i].steps)) {
                            for(let j=0; j < state.sequences[i].steps.length; j++) {
                                if(patchData.sequences[i].steps[j]) {
                                    state.sequences[i].steps[j] = deepClone(patchData.sequences[i].steps[j]);
                                } else { // if loaded patch has fewer steps, fill with default
                                     state.sequences[i].steps[j] = { gate: false, accent: 0, ratchet: 0, probability: 100, deviation: 0, deviationMode: 1, paramLocks: {} };
                                }
                            }
                        }
                    }
                }
            } else if (typeof state[key] === 'object' && state[key] !== null && !Array.isArray(state[key])) {
                // For simple objects, merge
                Object.assign(state[key], patchData[key]);
            } else {
                // For primitive types or if state[key] is an array not handled above
                state[key] = patchData[key];
            }
        }
    }

    // Ensure selectedVoice is valid after loading
    if (state.selectedVoice >= state.voices.length || state.selectedVoice < 0 || isNaN(state.selectedVoice)) {
        state.selectedVoice = 0;
    }

    // CRITICAL: Clear per-voice sample buffers after patch load
    // AudioBuffers can't be serialised to JSON, so they're lost on patch load
    // User must reload sample kits for SAMPLE engine voices
    for (let i = 0; i < state.voices.length; i++) {
        const voice = state.voices[i];
        if (voice.engine === 'SAMPLE') {
            voice.samplerBuffer = null;
            voice.samplerManifest = null;
            if (voice.samplerBank) {
                console.warn(`[Patch Load] Voice ${i + 1}: SMPL engine - please reload kit "${voice.samplerBank}"`);
            }
        }
    }

    updateAllUI(); // Refresh UI to reflect loaded state
    // if (wasPlaying) togglePlay(); // Optionally restart playback
}


// --- Individual Voice Patch Save/Load ---
function getVoicePatchDataToSave() {
    const voiceIndex = state.selectedVoice;
    if (voiceIndex < 0 || voiceIndex >= state.voices.length) return null;
    
    const voiceState = state.voices[voiceIndex];
    // Create a new object with only the specified voice sound parameters
    return {
        layerAWaveform: voiceState.layerAWaveform,
        layerAPitch: voiceState.layerAPitch,
        layerAAttack: voiceState.layerAAttack,
        layerADecay: voiceState.layerADecay,
        layerASustain: voiceState.layerASustain,
        layerBWaveform: voiceState.layerBWaveform,
        layerBPitchRatio: voiceState.layerBPitchRatio,
        layerBModAmount: voiceState.layerBModAmount,
        layerBAttack: voiceState.layerBAttack,
        layerBDecay: voiceState.layerBDecay,
        layerBSustain: voiceState.layerBSustain,
        layerMix: voiceState.layerMix,
        bitReduction: voiceState.bitReduction,
        drive: voiceState.drive,
        pan: voiceState.pan,
        level: voiceState.level,
        chokeGroup: voiceState.chokeGroup,
        reverbSend: voiceState.reverbSend,
        delaySend: voiceState.delaySend,
        cloudsSend: voiceState.cloudsSend
        // Does NOT include sequence data (length, steps, etc.)
    };
}

function handleSaveVoicePatch() {
    const voicePatchData = getVoicePatchDataToSave();
    if (!voicePatchData) {
        return;
    }

    const patchJson = JSON.stringify(voicePatchData, null, 2);
    const blob = new Blob([patchJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
    a.download = `baeng_voice_${state.selectedVoice + 1}_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    // Add UI feedback if desired
}

function handleLoadVoicePatch(event) { // Called by change event on hidden file input
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loadedVoiceData = JSON.parse(e.target.result);
            applyLoadedVoicePatchData(loadedVoiceData);
        } catch (error) {
            alert(`Error loading voice patch: ${error.message}`);
        }
    };
    reader.readAsText(file);
    event.target.value = null; // Reset file input
}

function applyLoadedVoicePatchData(loadedVoiceData) {
    const voiceIndex = state.selectedVoice;
    if (voiceIndex < 0 || voiceIndex >= state.voices.length) {
        return;
    }

    const targetVoice = state.voices[voiceIndex];
    // Apply only the parameters defined in getVoicePatchDataToSave
    const allowedKeys = Object.keys(getVoicePatchDataToSave(0) || {}); // Get keys from a dummy call

    for (const key of allowedKeys) {
        if (loadedVoiceData.hasOwnProperty(key)) {
            targetVoice[key] = loadedVoiceData[key];
        }
    }

    // ========== DX7 PATCH AUTO-RECONSTRUCTION ==========
    // If this is a DX7 voice with a patch name but no patch object or index,
    // attempt to reconstruct from the current bank
    if (targetVoice.engine === 'DX7' &&
        targetVoice.dx7PatchName &&
        (!targetVoice.dx7Patch || targetVoice.dx7PatchIndex === null || targetVoice.dx7PatchIndex === undefined)) {


        // Try to find the patch in current bank by name
        if (dx7Library.currentBank && dx7Library.currentBank.length > 0) {
            const patchName = targetVoice.dx7PatchName.trim();

            const patchData = dx7Library.currentBank.find(p => {
                const candidateName = (p.metadata?.voiceName || p.name || '').trim();
                return candidateName.toLowerCase() === patchName.toLowerCase() ||
                       candidateName.toLowerCase().startsWith(patchName.toLowerCase());
            });

            if (patchData) {
                const patchIndex = dx7Library.currentBank.indexOf(patchData);

                // Reconstruct complete DX7 state
                targetVoice.dx7Patch = patchData;
                targetVoice.dx7PatchIndex = patchIndex;
                targetVoice.dx7BankSize = dx7Library.currentBank.length;


                // Initialize macro modifiers if not present
                if (targetVoice.dx7AlgorithmOffset === undefined) {
                    targetVoice.dx7AlgorithmOffset = 0;
                    targetVoice.dx7VolumeBoost = 0;
                    targetVoice.dx7FreqMultiplier = 1.0;
                    targetVoice.dx7Transpose = 0;
                    targetVoice.dx7EnvTimeScale = 1.0;
                    targetVoice.dx7PitchEnvScale = 0;
                    targetVoice.dx7AttackScale = 1.0;
                    targetVoice.dx7ReleaseScale = 1.0;
                }

                if (patchData.parsed && patchData.parsed.algorithm !== undefined) {
                    targetVoice.dx7Algorithm = patchData.parsed.algorithm;
                }
            } else {
                console.warn(`  ✗ Patch "${patchName}" not found in current bank`);
                console.warn('  Available patches:', dx7Library.currentBank.map(p => p.metadata?.voiceName || p.name));

                // Clear inconsistent state
                targetVoice.dx7Patch = null;
                targetVoice.dx7PatchName = null;
                targetVoice.dx7PatchIndex = null;
                targetVoice.dx7BankSize = 0;
            }
        } else {
            console.warn(`  ✗ No DX7 bank loaded, cannot reconstruct patch`);

            // Clear inconsistent state
            targetVoice.dx7Patch = null;
            targetVoice.dx7PatchName = null;
            targetVoice.dx7PatchIndex = null;
            targetVoice.dx7BankSize = 0;
        }
    }
    // ========== END DX7 PATCH AUTO-RECONSTRUCTION ==========

    // CRITICAL: Clear sample buffer if this is a SAMPLE engine voice
    // AudioBuffers can't be serialised to JSON
    if (targetVoice.engine === 'SAMPLE') {
        targetVoice.samplerBuffer = null;
        targetVoice.samplerManifest = null;
        if (targetVoice.samplerBank) {
            console.warn(`[Voice Patch Load] Voice ${voiceIndex + 1}: SMPL engine - please reload kit "${targetVoice.samplerBank}"`);
        }
    }

    updateAllUI(); // Update faders and engine params
    // Add UI feedback if desired
}

// --- Dice Animation Functions ---

// Generate dice dot positions for faces 1-6
function getDiceDots(faceValue) {
    const positions = {
        1: [{ cx: 7, cy: 7 }], // Center
        2: [{ cx: 4, cy: 4 }, { cx: 10, cy: 10 }], // Diagonal
        3: [{ cx: 4, cy: 4 }, { cx: 7, cy: 7 }, { cx: 10, cy: 10 }], // Diagonal with center
        4: [{ cx: 4, cy: 4 }, { cx: 10, cy: 4 }, { cx: 4, cy: 10 }, { cx: 10, cy: 10 }], // Four corners
        5: [{ cx: 4, cy: 4 }, { cx: 10, cy: 4 }, { cx: 7, cy: 7 }, { cx: 4, cy: 10 }, { cx: 10, cy: 10 }], // Four corners + center
        6: [{ cx: 4, cy: 4 }, { cx: 10, cy: 4 }, { cx: 4, cy: 7 }, { cx: 10, cy: 7 }, { cx: 4, cy: 10 }, { cx: 10, cy: 10 }] // Two columns of 3
    };
    return positions[faceValue] || positions[6];
}

// Update dice button with random face and rotation
function updateDiceFace(button) {
    const svg = button.querySelector('.baeng-app svg');
    if (!svg) return;

    // Random face (1-6)
    const randomFace = Math.floor(Math.random() * 6) + 1;

    // Random rotation (0°, 90°, 180°, 270°)
    const rotations = [0, 90, 180, 270];
    const randomRotation = rotations[Math.floor(Math.random() * rotations.length)];

    // Get dots for this face
    const dots = getDiceDots(randomFace);

    // Clear existing circles
    const circles = svg.querySelectorAll('.baeng-app circle');
    circles.forEach(circle => circle.remove());

    // Add new dots
    dots.forEach(dot => {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', dot.cx);
        circle.setAttribute('cy', dot.cy);
        circle.setAttribute('r', '0.8');
        circle.setAttribute('fill', 'currentColor');
        svg.appendChild(circle);
    });

    // Apply rotation to the SVG
    svg.style.transform = `rotate(${randomRotation}deg)`;
}

// Initialize dice faces on page load
function setupDiceButtons() {
    requestAnimationFrame(() => {
        const randomButtons = document.querySelectorAll('.baeng-app .randomize-button');
        randomButtons.forEach(button => {
            updateDiceFace(button);
        });
    });
}

// --- Randomization Functions ---

// Randomize voice parameters (Euclidean rhythm and sequencing)
function randomizeVoiceParameters(clickedButton) {
    if (state.selectedVoice === null || state.selectedVoice < 0 || state.selectedVoice >= state.voices.length) return;

    const voiceIndex = state.selectedVoice;
    const sequence = state.sequences[voiceIndex];

    // Use the button that was clicked for dice animation
    if (clickedButton) {
        updateDiceFace(clickedButton);
        clickedButton.classList.add('rolling');
        setTimeout(() => {
            clickedButton.classList.remove('rolling');
        }, 200);
    }

    // Randomize euclidean parameters
    const euclidean = sequence.euclidean;

    // STEP 1: Randomize independent parameters
    // STEPS: Bias toward 4-16 for more interesting patterns
    euclidean.steps = Math.floor(4 + Math.random() * 13);

    // STEP 2: FILLS with density bias (50-90% for rhythmic interest)
    const fillDensity = 0.5 + Math.random() * 0.4;
    euclidean.fills = Math.floor(euclidean.steps * fillDensity);
    euclidean.fills = Math.max(1, Math.min(euclidean.fills, euclidean.steps));

    // STEP 3: SHIFT (rotation) - independent
    euclidean.shift = Math.floor(Math.random() * euclidean.steps);

    // STEP 4: Distribute decorations with constraint awareness
    // Critical constraint: accentAmt + flamAmt + ratchetAmt ≤ fills
    const decorationBudget = euclidean.fills;

    // Choose a dominant decoration strategy for musical variety
    const strategy = Math.random();
    let accent, flam, ratchet;

    if (strategy < 0.35) {
        // Accent-dominant: 35% chance
        const accentRatio = 0.5 + Math.random() * 0.4; // 50-90%
        accent = Math.floor(decorationBudget * accentRatio);
        const remaining = decorationBudget - accent;
        flam = Math.floor(Math.random() * (remaining + 1));
        ratchet = remaining - flam;
    } else if (strategy < 0.65) {
        // Ratchet-dominant: 30% chance
        const ratchetRatio = 0.5 + Math.random() * 0.4; // 50-90%
        ratchet = Math.floor(decorationBudget * ratchetRatio);
        const remaining = decorationBudget - ratchet;
        accent = Math.floor(Math.random() * (remaining + 1));
        flam = remaining - accent;
    } else if (strategy < 0.85) {
        // Flam-dominant: 20% chance
        const flamRatio = 0.5 + Math.random() * 0.4; // 50-90%
        flam = Math.floor(decorationBudget * flamRatio);
        const remaining = decorationBudget - flam;
        accent = Math.floor(Math.random() * (remaining + 1));
        ratchet = remaining - accent;
    } else {
        // Balanced mix: 15% chance
        accent = Math.floor(decorationBudget / 3);
        flam = Math.floor(decorationBudget / 3);
        ratchet = decorationBudget - accent - flam;
    }

    euclidean.accentAmt = Math.max(0, accent);
    euclidean.flamAmt = Math.max(0, flam);
    euclidean.ratchetAmt = Math.max(0, ratchet);

    // Safety check (should always pass with above logic)
    const sum = euclidean.accentAmt + euclidean.flamAmt + euclidean.ratchetAmt;
    if (sum > decorationBudget) {
        console.warn(`Constraint violation: sum=${sum}, budget=${decorationBudget}`);
        // Fallback scaling
        const scale = decorationBudget / sum;
        euclidean.accentAmt = Math.floor(euclidean.accentAmt * scale);
        euclidean.flamAmt = Math.floor(euclidean.flamAmt * scale);
        euclidean.ratchetAmt = decorationBudget - euclidean.accentAmt - euclidean.flamAmt;
    }

    // STEP 5: Independent parameters
    // RATCHET SPEED: 1-8 (subdivision multiplier)
    euclidean.ratchetSpeed = Math.floor(1 + Math.random() * 8);

    // DEVIATION: 0-100% (timing randomization)
    euclidean.deviation = Math.floor(Math.random() * 101);

    // PROBABILITY: 50-100% (favor triggering)
    sequence.probability = Math.floor(50 + Math.random() * 51);

    // STEP 6: Regenerate pattern and update UI
    import('./modules/euclidean.js').then(module => {
        module.updateEuclideanSequence(voiceIndex);
        updateAllUI(); // Refresh UI and engine parameters

        // Capture snapshot after randomize
        if (historyManager) {
            historyManager.pushSnapshot();
        }
    });
}

// Randomize engine parameters (DX7 patch, macros, effects)
function randomizeEngineParameters(clickedButton) {
    if (state.selectedVoice === null || state.selectedVoice < 0 || state.selectedVoice >= state.voices.length) return;

    const voiceIndex = state.selectedVoice;
    const voice = state.voices[voiceIndex];

    // Use the button that was clicked for dice animation
    if (clickedButton) {
        updateDiceFace(clickedButton);
        clickedButton.classList.add('rolling');
        setTimeout(() => {
            clickedButton.classList.remove('rolling');
        }, 200);
    }

    // Randomize DX7 patch if using DX7 engine and bank is loaded
    if (voice.engine === 'DX7' && voice.dx7BankSize > 0) {
        voice.dx7PatchIndex = Math.floor(Math.random() * voice.dx7BankSize);
        // Load the new patch
        if (dx7Library.currentBank && dx7Library.currentBank[voice.dx7PatchIndex]) {
            const patchData = dx7Library.currentBank[voice.dx7PatchIndex];
            voice.dx7Patch = patchData;
            voice.dx7PatchName = patchData.metadata?.voiceName || patchData.name;
            if (patchData.parsed && patchData.parsed.algorithm) {
                voice.dx7Algorithm = patchData.parsed.algorithm;
            }
            // Update tuning offset for the new patch
            if (voice.dx7BankPath) {
                const tuningCache = getTuningCache();
                voice.dx7FineTune = tuningCache.getOffsetCents(voice.dx7BankPath, voice.dx7PatchIndex);
            }
        }
    }

    // Randomize macro controls (0-100 range)
    // 3-knob system: PATCH, DEPTH, RATE
    voice.macroPatch = Math.floor(Math.random() * 101);
    voice.macroDepth = Math.floor(Math.random() * 101);
    voice.macroRate = Math.floor(Math.random() * 101);

    // Randomize effect sends
    voice.reverbSend = Math.floor(Math.random() * 101);
    voice.delaySend = Math.floor(Math.random() * 101);

    // Randomize processing effects
    voice.bitReduction = Math.floor(Math.random() * 51); // 0-50 (moderate range)
    voice.drive = Math.floor(Math.random() * 51);        // 0-50 (moderate range)

    updateAllUI(); // Refresh UI and engine parameters

    // Capture snapshot after randomize
    if (historyManager) {
        historyManager.pushSnapshot();
    }
}

// Randomize reverb parameters
function randomizeReverbParameters() {
    const reverbModule = document.getElementById('baeng-reverb-fx');
    const randomizeButton = reverbModule ? reverbModule.querySelector('.baeng-app .randomize-button') : null;

    if (randomizeButton) {
        // Update dice face before animation
        updateDiceFace(randomizeButton);

        // Add rolling animation class
        randomizeButton.classList.add('rolling');
        setTimeout(() => {
            randomizeButton.classList.remove('rolling');
        }, 200);
    }

    // Randomize reverb parameters
    state.reverbPreDelay = Math.floor(Math.random() * 101); // 0-100
    state.reverbDecay = Math.floor(20 + Math.random() * 81); // 20-100 (avoid very short decays)
    state.reverbDamping = Math.floor(Math.random() * 101); // 0-100
    state.reverbDiffusion = Math.floor(40 + Math.random() * 61); // 40-100 (avoid low diffusion)

    updateAllUI(); // Refresh UI and engine parameters

    // Capture snapshot after randomize (immediate)
    if (historyManager) {
        historyManager.pushSnapshot();
    }
}

// Randomize delay parameters
function randomizeDelayParameters() {
    const delayModule = document.getElementById('baeng-delay-fx');
    const randomizeButton = delayModule ? delayModule.querySelector('.baeng-app .randomize-button') : null;

    if (randomizeButton) {
        // Update dice face before animation
        updateDiceFace(randomizeButton);

        // Add rolling animation class
        randomizeButton.classList.add('rolling');
        setTimeout(() => {
            randomizeButton.classList.remove('rolling');
        }, 200);
    }

    // Randomize delay parameters
    if (state.delaySyncEnabled) {
        state.delayTime = Math.floor(Math.random() * 101); // 0-100
    } else {
        state.delayTimeFree = Math.floor(Math.random() * 101); // 0-100
    }
    state.delayFeedback = Math.floor(Math.random() * 81); // 0-80 (avoid extreme feedback)
    state.delayFilter = Math.floor(Math.random() * 101); // 0-100
    state.delayWow = Math.floor(Math.random() * 51); // 0-50
    state.delayFlutter = Math.floor(Math.random() * 51); // 0-50
    state.delaySaturation = Math.floor(Math.random() * 101); // 0-100

    updateAllUI(); // Refresh UI and engine parameters

    // Capture snapshot after randomize (immediate)
    if (historyManager) {
        historyManager.pushSnapshot();
    }
}

function updateAllUI() {
    // Update active voice selector buttons AND voice rows
    document.querySelectorAll('#voices .voice-selector').forEach((button, i) => {
        button.classList.toggle('active', i === state.selectedVoice);
        // Sync muted state with voice data
        const voice = state.voices[i];
        if (voice) {
            button.classList.toggle('muted', voice.muted || false);
        }
    });
    document.querySelectorAll('#voices .voice-row').forEach((row, i) => {
        row.classList.toggle('selected', i === state.selectedVoice);
    });

    updateSequenceUI(); // Update sequence grid for all voices
    updateParameterDisplays(); // Update all faders

    // Update reset sequence button state (in VOICES module header)
    const resetSequenceButton = document.querySelector('#voices .seq-reset');
    if (resetSequenceButton) {
        resetSequenceButton.classList.toggle('active', state.resetSequenceOnBar);
    }

    // Update scale quantization UI
    updateScaleQuantizationUI();

    updateEngineParams(); // Send updated params to audio engine
}

function updateScaleQuantizationUI() {
    const scaleQuantizeCheckbox = document.getElementById('baeng-scale-quantize-enabled');
    const scaleSelect = document.getElementById('baeng-scale-select');
    const rootSelect = document.getElementById('baeng-root-select');

    if (scaleQuantizeCheckbox) {
        scaleQuantizeCheckbox.checked = state.scaleQuantizeEnabled;
    }
    if (scaleSelect) {
        scaleSelect.value = state.globalScale;
    }
    if (rootSelect) {
        rootSelect.value = state.globalRoot;
    }
}

// --- Engine Module Event Listeners Setup ---
function setupEngineModuleListeners() {
    const engineModule = document.getElementById('baeng-engine');
    if (!engineModule) {
        console.warn('[setupEngineModuleListeners] Engine module not found');
        return;
    }

    // Clean up previous engine dropdown listeners to prevent leaks
    if (engineDropdownCleanup) {
        engineDropdownCleanup();
        engineDropdownCleanup = null;
    }

    // Engine Dropdown - Setup dropdown selector
    const engineDropdownContainer = engineModule.querySelector('.engine-dropdown-container');
    if (engineDropdownContainer) {
        engineDropdownCleanup = setupEngineDropdown(engineDropdownContainer, (newEngine) => {
            selectEngine(newEngine);
        });
    } else {
        console.warn('[setupEngineModuleListeners] Dropdown container not found');
    }

    // DX7 Patch Loader - Use event delegation on engineModule (which doesn't get recreated)
    // This ensures the listener persists even if child elements are recreated
    if (!engineModule.dataset.loadListenerAttached) {
        engineModule.dataset.loadListenerAttached = 'true';

        // Use event delegation - listen on parent that doesn't get recreated
        engineModule.addEventListener('click', (e) => {
            // Check if click was on the load button/label
            const loadLabel = e.target.closest('.dx7-load-button');
            if (!loadLabel) return; // Not our button


            // Get persistent file input (never destroyed)
            const persistentFileInput = document.getElementById('baeng-persistent-engine-file-input');

            if (!persistentFileInput) {
                console.error('[Load label] Persistent file input not found!');
                e.preventDefault();
                return;
            }

            const currentEngine = state.voices[state.selectedVoice].engine;

            // Configure file input based on engine type BEFORE browser opens picker
            if (currentEngine === 'DX7') {
                persistentFileInput.accept = '.syx';
                persistentFileInput.removeAttribute('webkitdirectory');
                persistentFileInput.removeAttribute('directory');
                persistentFileInput.removeAttribute('multiple');
            } else if (currentEngine === 'SAMPLE') {
                persistentFileInput.accept = '';
                persistentFileInput.setAttribute('webkitdirectory', '');
                persistentFileInput.setAttribute('directory', '');
                persistentFileInput.removeAttribute('multiple');
            } else if (currentEngine === 'SLICE') {
                persistentFileInput.accept = '.wav,.mp3,.ogg,.slices.json';
                persistentFileInput.removeAttribute('webkitdirectory');
                persistentFileInput.removeAttribute('directory');
                persistentFileInput.setAttribute('multiple', '');
            } else {
                // Analog engines - don't open file picker
                e.preventDefault();
                return;
            }

            // Don't prevent default - let the label's natural behavior trigger the file input
        }, true); // Use capture phase to intercept early
    } else {
    }

    // Scissors button (SLICE editor)
    const sliceEditButton = engineModule.querySelector('.slice-edit-button');
    if (sliceEditButton) {
        sliceEditButton.addEventListener('click', () => {
            const voice = state.voices[state.selectedVoice];
            if (voice.sliceBuffer && window.sliceEditor) {
                window.sliceEditor.open(voice.sliceBuffer, voice.sliceConfig, voice.sliceConfig?.sampleName || 'sample.wav', state.selectedVoice);
            } else {
                console.warn('[Slice Editor] No sample loaded or slice editor not initialized');
                alert('Please load a sample first');
            }
        });
    }

    // Sample browse button (SLICE engine)
    const sampleBrowseButton = engineModule.querySelector('.sample-browse-button');
    if (sampleBrowseButton) {
        sampleBrowseButton.addEventListener('click', () => {
            if (window.sampleBrowser) {
                window.sampleBrowser.open();
            } else {
                console.warn('[Sample Browser] Sample browser not initialized');
            }
        });
    }

    // DX7 browse button (DX7 engine)
    const dx7BrowseButton = engineModule.querySelector('.dx7-browse-button');
    if (dx7BrowseButton) {
        dx7BrowseButton.addEventListener('click', () => {
            if (window.dx7Browser) {
                window.dx7Browser.open();
            } else {
                console.warn('[DX7 Browser] DX7 browser not initialized');
            }
        });
    }

    // Kit browse button (SAMPLE engine)
    const kitBrowseButton = engineModule.querySelector('.kit-browse-button');
    if (kitBrowseButton) {
        kitBrowseButton.addEventListener('click', () => {
            if (window.kitBrowser) {
                window.kitBrowser.open();
            } else {
                console.warn('[Kit Browser] Kit browser not initialized');
            }
        });
    }

    // Randomize button
    engineModule.querySelector('.randomize-button')?.addEventListener('click', (e) => randomizeEngineParameters(e.currentTarget));

    // Polyphony button (for DX7 and SAMPLE engines)
    engineModule.querySelector('.polyphony-button')?.addEventListener('click', (e) => {
        const button = e.currentTarget;
        const voice = state.voices[state.selectedVoice];

        // Cycle through modes: M (0) -> P2 (1) -> P3 (2) -> P4 (3) -> M (0)
        const modes = [0, 1, 2, 3];
        const currentMode = voice.polyphonyMode || 0;
        const nextModeIndex = (modes.indexOf(currentMode) + 1) % modes.length;
        const nextMode = modes[nextModeIndex];

        // When switching TO mono (mode 0), clear all poly voices immediately
        if (nextMode === 0 && currentMode > 0) {
            releaseAllVoicesForTrack(state.selectedVoice);
        }

        // Update state
        voice.polyphonyMode = nextMode;

        // Update UI
        const labels = ['M', 'P2', 'P3', 'P4'];
        const modeNames = ['Mono', '2-voice', '3-voice', '4-voice'];
        button.textContent = labels[nextMode];
        button.dataset.mode = nextMode;
        button.classList.toggle('active', nextMode > 0);
        button.title = `Polyphony: ${modeNames[nextMode]}`;

        // Log for user feedback
    });

    // Output mode button (for Analog engines: aKICK, aSNARE, aHIHAT)
    engineModule.querySelector('.output-mode-button')?.addEventListener('click', (e) => {
        const button = e.currentTarget;
        const voice = state.voices[state.selectedVoice];

        // Toggle between OUT and AUX
        const newMode = voice.outputMode === 'OUT' ? 'AUX' : 'OUT';
        voice.outputMode = newMode;

        // Update UI
        button.textContent = newMode;
        button.dataset.mode = newMode;
        button.classList.toggle('active', newMode === 'AUX');
        button.title = `Output Mode: ${newMode === 'AUX' ? '909-style (AUX)' : '808-style (OUT)'}`;

        console.log(`[Bæng] Voice ${state.selectedVoice + 1} output mode: ${newMode}`);
    });
}

// --- Engine Switching (via dropdown) ---
// Note: selectEngine function is defined earlier in the file (line ~1734)

// --- Sample Folder Loading ---
async function handleSampleFolderLoad(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
        // Filter audio files
        const audioFiles = Array.from(files).filter(file =>
            file.type.startsWith('audio/') ||
            /\.(wav|mp3|ogg|flac)$/i.test(file.name)
        );

        if (audioFiles.length === 0) {
            alert('No audio files found. Please select .wav, .mp3, or .ogg files.');
            event.target.value = '';
            return;
        }

        // Load samples directly into per-voice buffer (SLICE pattern)
        const voice = state.voices[state.selectedVoice];
        if (voice.engine === 'SAMPLE') {
            const sampleArray = [];

            for (const file of audioFiles) {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const audioBuffer = await config.audioContext.decodeAudioData(arrayBuffer);

                    sampleArray.push({
                        name: file.name.replace(/\.(wav|mp3|ogg|flac)$/i, ''),
                        buffer: audioBuffer
                    });
                } catch (error) {
                    console.error(`[Custom Kit] Failed to load ${file.name}:`, error);
                }
            }

            const bankName = `Custom-${Date.now()}`;
            voice.samplerBuffer = sampleArray;
            voice.samplerBank = bankName;
            voice.samplerManifest = null; // Custom folder has no manifest
            voice.sampleIndex = 0;
            voice.macroPatch = 0;

            console.log(`[Custom Kit] Voice ${state.selectedVoice}: ${bankName} (${sampleArray.length} samples)`);
        }

        // Refresh UI
        renderModules();
        setupLEDRingKnobs();

        // Re-setup all module event listeners after re-render
        setupUIEventListeners();
        setupEngineModuleListeners();
        resetModulationStateAfterRender();
        setupFaders();
        setupKnobs();
        setupModulationClickHandlers();

        updateParameterDisplays();


    } catch (error) {
        console.error('[Sample Loading] Error loading samples:', error);
        alert(`Error loading samples: ${error.message}`);
    }

    // Reset file input
    event.target.value = '';
}

// --- Slice File Loading ---
async function handleSliceFileLoad(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    try {
        // Separate audio files and JSON files
        const audioFiles = [];
        let sliceConfigFile = null;

        for (const file of Array.from(files)) {
            if (file.name.endsWith('.slices.json')) {
                sliceConfigFile = file;
            } else if (file.type.startsWith('audio/') || /\.(wav|mp3|ogg)$/i.test(file.name)) {
                audioFiles.push(file);
            }
        }

        if (audioFiles.length === 0) {
            alert('No audio files found. Please select a .wav, .mp3, or .ogg file.');
            event.target.value = '';
            return;
        }

        if (audioFiles.length > 1) {
            alert('Please select only one audio file at a time for SLICE engine.');
            event.target.value = '';
            return;
        }

        const audioFile = audioFiles[0];

        // Load audio buffer
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioBuffer = await config.audioContext.decodeAudioData(arrayBuffer);

        // Load slice config if provided
        let sliceConfig = null;
        if (sliceConfigFile) {
            const configText = await sliceConfigFile.text();
            sliceConfig = JSON.parse(configText);
        }

        // Update current voice
        const voice = state.voices[state.selectedVoice];
        voice.sliceBuffer = audioBuffer;
        voice.sliceConfig = sliceConfig;
        voice.sliceIndex = 0;
        voice.macroPatch = 0;

        // Refresh UI
        renderModules();
        setupLEDRingKnobs();

        // Re-setup all module event listeners after re-render
        setupUIEventListeners();
        setupEngineModuleListeners();
        resetModulationStateAfterRender();
        setupFaders();
        setupKnobs();
        setupModulationClickHandlers();
        updateParameterDisplays();


        // If no slice config was provided, offer to open the slice editor
        if (!sliceConfig && window.sliceEditor) {
            const openEditor = confirm(`No slice configuration found for "${audioFile.name}".\n\nWould you like to create slices now?`);
            if (openEditor) {
                window.sliceEditor.open(audioBuffer, null, audioFile.name, state.selectedVoice);
            }
        }

    } catch (error) {
        console.error('[Slice Loading] Error loading slice files:', error);
        alert(`Error loading slice files: ${error.message}`);
    }

    // Reset file input
    event.target.value = '';
}

// --- DX7 Patch Loading Handlers ---
async function handleDX7FileLoad(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    try {
        const firstPatch = await dx7Library.loadPatchFromFile(file);

        // Apply bank to ONLY the currently selected voice (per-voice bank support)
        const voiceIndex = state.selectedVoice;
        const bankSize = dx7Library.currentBank.length;
        const bankName = file.name;

        // Get the first patch from the bank
        const patchIndex = 0;
        const patchData = dx7Library.currentBank[patchIndex];

        // Get per-voice copy of the bank
        const bankCopy = dx7Library.getBankCopy();

        // Use atomic setter to ensure all DX7 properties are set correctly
        const success = setDX7Patch(voiceIndex, patchData, patchIndex, bankSize, bankCopy, bankName);

        if (!success) {
            console.error(`[handleDX7FileLoad] Failed to set DX7 patch for voice ${voiceIndex}`);
        } else {
        }

        // Update UI - DON'T call renderModules() as it destroys the file input
        // Just update the patch name display
        const patchNameElement = document.querySelector('.baeng-app .dx7-patch-name');
        if (patchNameElement) {
            patchNameElement.textContent = patchData.metadata?.voiceName || patchData.name || 'Unknown';
        }

        // Push to history
        if (window.historyManager) {
            historyManager.pushSnapshot();
        }

        // Sync audio engine
        updateEngineParams();

    } catch (error) {
        alert(`Error loading DX7 bank: ${error.message}`);
    }

    // Reset file input
    event.target.value = '';
}

function applyDX7PatchToCurrentVoice(patchData) {
    const voiceIndex = state.selectedVoice;
    if (voiceIndex === null || voiceIndex < 0 || voiceIndex >= state.voices.length) {
        return;
    }

    // Get bank copy for per-voice storage
    const bankCopy = dx7Library.getBankCopy();
    const bankName = null; // Could be derived from file name if needed

    // Use atomic setter to ensure all DX7 properties are set correctly
    const success = setDX7Patch(
        voiceIndex,
        patchData,
        dx7Library.currentPatchIndex,
        dx7Library.currentBank.length,
        bankCopy,
        bankName
    );

    if (!success) {
        console.error(`[applyDX7PatchToCurrentVoice] Failed to set DX7 patch for voice ${voiceIndex}`);
        return;
    }

    // Update UI
    renderModules();
    setupLEDRingKnobs();
    setupUIEventListeners();
    resetModulationStateAfterRender();
    updateEngineParams();

}

// Function to load default DX7 drum sounds from Coffeeshopped bank
async function loadDefaultVoicePatches() {
    try {

        // Fetch the DX7 drum voices bank
        const response = await fetch('Reference/Yamaha-DX7-Drum-Sounds-Coffeeshopped/DX7-Cfshpd-Drum-Voices.syx');
        if (!response.ok) {
            throw new Error(`Failed to fetch default DX7 bank: ${response.status} ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);


        // Parse the bank using dx7Library (returns array of patches directly)
        const patches = await dx7Library.parseSysexData(uint8Array, 'DX7-Cfshpd-Drum-Voices.syx');


        if (!patches || patches.length === 0) {
            throw new Error('Failed to parse DX7 bank - no patches found');
        }

        // Default patch names to load (in order for voices 0-5)
        const defaultPatchNames = [
            'Buffkick',
            'MildSnare',
            'VeloBongo',
            'Wump',
            'HolloHat',
            'SquirtShk'
        ];

        // Find and apply specific patches by name
        for (let i = 0; i < 6; i++) {
            const voice = state.voices[i];
            const desiredPatchName = defaultPatchNames[i];

            // Find patch by name (case-insensitive, trim whitespace)
            const patch = patches.find(p => {
                const patchName = (p.metadata?.voiceName || p.name || '').trim();
                return patchName.toLowerCase().startsWith(desiredPatchName.toLowerCase());
            });

            if (patch) {
                const patchIndex = patches.indexOf(patch);

                // Create per-voice copy of the bank
                const bankCopy = JSON.parse(JSON.stringify(patches));
                const bankName = 'DX7-Cfshpd-Drum-Voices.syx';

                // Use atomic setter to ensure all DX7 properties are set correctly
                const success = setDX7Patch(i, patch, patchIndex, patches.length, bankCopy, bankName);

                if (!success) {
                    console.error(`[loadDefaultVoicePatches] Voice ${i}: Failed to set DX7 patch "${desiredPatchName}"`);
                }

                // NOTE: applyAllMacros() is now called AFTER loadDefaultVoicePatches() completes
                // (see main.js startup sequence around line 357)

            } else {
                console.warn(`[loadDefaultVoicePatches] Voice ${i}: Failed to find patch "${desiredPatchName}"`);
            }
        }

        // Store bank in library for patch browsing
        dx7Library.currentBank = patches;
        dx7Library.currentPatchIndex = 0;

        // Re-render modules to show DX7 engine controls (patch knob, etc.)
        renderModules();
        setupLEDRingKnobs();
        setupUIEventListeners();
        resetModulationStateAfterRender();
        updateEngineParams(); // Initialize DX7 engine parameters

    } catch (error) {

        // Fallback to basic FM patches if DX7 loading fails
        const kickPatch = {
          "layerAWaveform": 0, "layerAPitch": 14, "layerAAttack": 0, "layerADecay": 12, "layerASustain": 0,
          "layerBWaveform": 0, "layerBPitchRatio": 2.3, "layerBModAmount": 56, "layerBAttack": 0,
          "layerBDecay": 9, "layerBSustain": 0, "layerMix": 0, "bitReduction": 0, "drive": 28,
          "pan": 50, "level": 85, "chokeGroup": 0, "reverbSend": 0, "delaySend": 0
        };

        const snarePatch = {
          "layerAWaveform": 4, "layerAPitch": 50, "layerAAttack": 1, "layerADecay": 4, "layerASustain": 0,
          "layerBWaveform": 4, "layerBPitchRatio": 1, "layerBModAmount": 0, "layerBAttack": 0,
          "layerBDecay": 25, "layerBSustain": 0, "layerMix": 0, "bitReduction": 0, "drive": 0,
          "pan": 50, "level": 75, "chokeGroup": 0, "reverbSend": 0, "delaySend": 0
        };

        Object.assign(state.voices[0], kickPatch);
        Object.assign(state.voices[1], snarePatch);
        updateAllUI();
    }
}