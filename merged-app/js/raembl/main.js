// File: js/main.js
// Main entry point for application
import { state, parameterDefinitions } from './state.js';
import { config, colors } from './config.js';
import { setThemeHue, loadThemeHue, saveThemeHue } from './utils/themeColor.js';
import { setupFaders, setupSlidePots, setupResetButtons, setupPlayButton, setupSwitches, setupRandomButtons } from './ui.js';
import { setupMiniFaders } from './ui/miniFaders.js';
// import { initClock, togglePlay } from './modules/clock.js'; // OLD: Using original Ræmbl clock
import { initClock, togglePlay } from '../shared/clock.js'; // NEW: Using shared clock
import { initRaemblClock } from './raemblClock.js'; // NEW: Import Ræmbl clock subscriber
import { initFactors, updateFactorsPattern, cleanupFactors } from './modules/factors.js';
import { initLfo, drawLfo, ensureLfoAnimationRunning as ensureMainLfoRunning } from './modules/lfo.js';
import { initPath, drawPath, getCurrentScaleName } from './modules/path.js';
import { initReverb, drawReverb as drawReverbViz } from './modules/reverb.js';
import { initDelay, drawDelay as drawDelayViz } from './modules/delay.js';
import { attachCloudsEventHandlers, startCloudsAnimation, stopCloudsAnimation, getCloudsState, setCloudsState } from './modules/clouds.js';
import { initAudio, resumeAudio, triggerNote, releaseAllVoices, releaseVoiceById, releaseInactiveVoices, panicStop, switchFxMode } from './audio.js';
import { initModLfo } from './modules/modlfo.js';
import { renderModules } from './components/index.js';
import { initMod } from './modules/mod.js';
import { initPerParamModulation, initModulationVisuals, applyPerParamModulations, updateModulationVisualFeedback } from './modules/perParamMod.js';
import { initTitle } from './modules/title.js';
import { midiNoteToName } from './utils.js';
import { updateParameterById } from './ui/faderState.js';
import { connectMonoPath, disconnectMonoPath } from './ui/controls.js';
import { updateFaderDisplay } from './ui/faderDisplay.js'; // Import for initial display
import { historyManager } from './history.js'; // Import history manager
import { openDuckModal, updateDuckButtonVisuals } from '../baeng/modules/sidechain-modal.js'; // For sidechain ducking UI
import { initPPModModal, openPPModModal } from '../shared/ppmod-modal.js'; // PPMod modal UI
import { SpacerPatternManager } from '../shared/circuit-pattern.js';
import { initEngineSelector } from './modules/engine-selector.js'; // Engine type selector (Plaits/Subtractive)

// --- Keyboard Input State ---
const activeKeyVoices = {};
let currentOctaveOffset = 0;
const MAX_OCTAVE_OFFSET = 2;
const MIN_OCTAVE_OFFSET = -2;

// --- MIDI Input State ---
let midiAccess = null;
const activeMidiNoteVoices = {};
let primaryNoteInputDeviceId = null;
let isMidiLearning = false;
let temporaryMidiLearnHandler = null;
let learnedCCInfo = null;
// --------------------------

// --- PATCH SAVE/LOAD FUNCTIONS ---

function getPatchDataToSave() {
    // Create a temporary copy of state to avoid modifying the live one during processing
    const stateSnapshot = JSON.parse(JSON.stringify(state));

    // List of state keys that should NOT be saved in a patch
    const transientKeys = [
        'isPlaying', 'currentStepIndex', 'factorsPatternPos', 'displayBar', 'displayBeat', 'displayStep',
        'isBarStart', 'clockRequestId', 'lastStepTime', 'stepCounter', 'barCounter', 'stepsPerBeat',
        'lfoValue', // Runtime LFO output
        // 'lfoStartTime', // Keep lfoStartTime to preserve phase if desired, or reset on load
        'modLfoValue', // Runtime Mod LFO output
        'sample', 'prevSample', 'currentNote', 'triggerSample', 'sampleTime', 'isTransitioning'
    ];

    // Also exclude shared timing properties (bpm, swing, bar lengths) as they go in shared section
    const sharedTimingProps = ['bpm', 'swing', 'baengBarLength', 'raemblBarLength'];

    const raemblData = {};
    for (const key in stateSnapshot) {
        if (!transientKeys.includes(key) && !sharedTimingProps.includes(key)) {
            raemblData[key] = stateSnapshot[key]; // Already deep copied by initial stringify/parse
        }
    }

    // Ensure midiCCMappings is always included, even if empty
    raemblData.midiCCMappings = Array.isArray(state.midiCCMappings) ? JSON.parse(JSON.stringify(state.midiCCMappings)) : [];

    // Capture Clouds state if in clouds mode
    if (state.fxMode === 'clouds') {
        const cloudsState = getCloudsState();
        if (cloudsState) {
            raemblData.clouds = cloudsState;
        }
    }

    // Create unified patch format with independent bar lengths
    // v1.2.0: Added engineType, plaitsEngine, ringsModel
    const unifiedPatch = {
        version: '1.2.0',
        timestamp: new Date().toISOString(),
        shared: {
            bpm: state.bpm,
            swing: state.swing,
            baengBarLength: state.baengBarLength,
            raemblBarLength: state.raemblBarLength
        },
        raembl: raemblData
    };

    return unifiedPatch;
}

function handleSavePatch() {
    const patchData = getPatchDataToSave();
    const patchJson = JSON.stringify(patchData, null, 2); // Pretty print JSON
    const blob = new Blob([patchJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    a.download = `rambler_patch_${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const feedbackEl = document.getElementById('raembl-patch-feedback');
    if (feedbackEl) {
        feedbackEl.textContent = 'Patch saved!';
        setTimeout(() => { feedbackEl.textContent = ''; }, 3000);
    }

    // Clear cached patch data after save
    config.loadedPatchData = null;
}

async function applyLoadedPatchData(loadedPatch) {
    const feedbackEl = document.getElementById('raembl-patch-feedback');
    if (typeof loadedPatch !== 'object' || loadedPatch === null) {
        console.error("Invalid patch data format.");
        if (feedbackEl) feedbackEl.textContent = 'Error: Invalid patch file format.';
        return false;
    }

    if (state.isPlaying) {
        togglePlay(); // Stop the clock
    }
    releaseAllVoices();

    // Determine patch format and extract data
    let patchData;
    let sharedData = null;

    if (loadedPatch.version && loadedPatch.raembl) {
        // New unified format
        patchData = loadedPatch.raembl;
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

    // 1. Update the main state object
    for (const key in patchData) {
        if (state.hasOwnProperty(key)) {
            // Deep copy for arrays/objects to prevent reference issues
            if (typeof patchData[key] === 'object' && patchData[key] !== null) {
                state[key] = JSON.parse(JSON.stringify(patchData[key]));
            } else {
                state[key] = patchData[key];
            }
        } else {
            // If the key from the patch doesn't exist in the current state,
            // it might be a new parameter from a newer version or an old, removed one.
            // For now, we'll only update existing keys.
            // If you want to add new keys from the patch, you'd need different logic.
            console.warn(`Loaded patch contains key: ${key} which is not in the current state definition. Skipping.`);
        }
    }
    // Ensure midiCCMappings is an array
    state.midiCCMappings = Array.isArray(state.midiCCMappings) ? state.midiCCMappings : [];
    // Reset LFO start time for consistent phase on load, unless phase is critical to patch
    state.lfoStartTime = performance.now();


    // 2. Update UI and Audio Engine by re-applying all parameters
    // This ensures that all fader fills, text displays, and audio engine params are set correctly.
    for (const paramId in parameterDefinitions) {
        const paramDef = parameterDefinitions[paramId];
        const pathParts = paramDef.statePath.split('.');
        let valueFromState = state;
        try {
            pathParts.forEach(part => { valueFromState = valueFromState[part]; });
            
            if (valueFromState !== undefined) {
                 // Special handling for delay.time to use the correct state variable based on loaded delaySyncEnabled
                if (paramId === 'delay.time') {
                    const actualValue = state.delaySyncEnabled ? state.delayTime : state.delayTimeFree;
                    updateParameterById(paramId, actualValue);
                } else {
                    updateParameterById(paramId, valueFromState);
                }
            } else {
                // If a defined parameter is NOT in the loaded patch (e.g. loading an older patch into a newer app)
                // We should set it to its default value from the current state definition.
                // The current state object already holds these defaults if not overwritten by the patch.
                // So, we can re-apply the current state's value for this paramId.
                let defaultValue = state;
                pathParts.forEach(part => { defaultValue = defaultValue[part]; });
                if (defaultValue !== undefined) {
                    console.warn(`Parameter ${paramId} not found in loaded patch. Applying current default: ${defaultValue}`);
                    updateParameterById(paramId, defaultValue);
                } else {
                    console.error(`Could not find default value for ${paramId} in current state after patch load.`);
                }
            }
        } catch (e) {
            console.error(`Error applying value for ${paramId} from loaded patch:`, e);
        }
    }

    // 4. Restore engine type (v1.2.0)
    // Handle backward compatibility: older patches without engineType default to 'subtractive'
    if (!patchData.engineType) {
        state.engineType = 'subtractive';
        state.plaitsEngine = 0;
        state.ringsModel = 0;
    }

    // Update engine selector UI and audio routing
    const { switchEngine, setPlaitsEngine } = await import('./audio.js');
    switchEngine(state.engineType);
    if (state.engineType === 'plaits' && state.plaitsEngine !== undefined) {
        setPlaitsEngine(state.plaitsEngine);
    }

    // Update engine type buttons in UI
    document.querySelectorAll('.engine-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.engine === state.engineType);
    });

    // 5. Restore Clouds state if present in patch and currently in clouds mode
    if (patchData.clouds && state.fxMode === 'clouds') {
        // Ensure Clouds is initialized before restoring state
        if (!config.cloudsNode) {
            // Trigger FX mode switch to initialize Clouds
            const fxModeCloudsBtn = document.getElementById('fx-mode-clouds');
            if (fxModeCloudsBtn) {
                fxModeCloudsBtn.click(); // This will initialize Clouds
                // Wait for initialization to complete, then restore state
                setTimeout(() => {
                    if (config.cloudsNode) {
                        setCloudsState(patchData.clouds);
                    }
                }, 200);
            }
        } else {
            setCloudsState(patchData.clouds);
        }
    }

    // 5. Explicitly update UI elements and systems not fully covered by updateParameterById's side effects
    updateModeSwitchUIAndAudioPath(); // Handles MONO/POLY switch and audio routing
    updateStandardSwitchesUI();     // Handles PWM/MOD source switches
    updateDelaySyncSwitchUI();      // Handles Delay SYNC/FREE switch UI

    const factorsResetButton = document.querySelector('.raembl-app .seq-reset');
    if (factorsResetButton) factorsResetButton.classList.toggle('active', state.resetFactorsOnBar);
    const lfoResetButton = document.querySelector('.raembl-app .lfo-reset');
    if (lfoResetButton) lfoResetButton.classList.toggle('active', state.resetLfoOnBar);

    updateFactorsPattern(); // Regenerate patterns based on new state
    drawPath();             // Update path visualization
    if (ensureMainLfoRunning) ensureMainLfoRunning(); else drawLfo(); // Redraw/restart LFO vis
    drawReverbViz();        // Update reverb visualization
    drawDelayViz();         // Update delay visualization
    renderMidiMappings();   // Update MIDI CC mappings list in UI
    updateScaleDisplay();   // Update scale name display

    if (feedbackEl) {
        feedbackEl.textContent = 'Patch loaded successfully!';
        setTimeout(() => { feedbackEl.textContent = ''; }, 3000);
    }

    // Capture snapshot after patch load
    if (typeof historyManager !== 'undefined' && historyManager) {
        historyManager.pushSnapshot();
    }

    // Cache loaded patch data for FX mode switching
    config.loadedPatchData = patchData;

    return true;
}


function handleLoadPatch(event) {
    const file = event.target.files[0];
    const feedbackEl = document.getElementById('raembl-patch-feedback');
    if (!file) {
        if (feedbackEl) feedbackEl.textContent = 'No file selected.';
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const patchData = JSON.parse(e.target.result);
            await applyLoadedPatchData(patchData);
        } catch (error) {
            console.error("Error loading or parsing patch file:", error);
            if (feedbackEl) feedbackEl.textContent = 'Error: Could not load patch. Invalid file?';
        }
    };
    reader.onerror = () => {
        console.error("Error reading file.");
        if (feedbackEl) feedbackEl.textContent = 'Error reading file.';
    };
    reader.readAsText(file);
    event.target.value = null; // Reset file input
}

function updateModeSwitchUIAndAudioPath() {
    // Update UI for MONO/POLY switch
    const modeSwitch = document.querySelector('#raembl-oscillator .mode-switch');
    if (modeSwitch) {
        const modeOptions = modeSwitch.querySelectorAll('.switch-option');
        if (modeOptions.length === 2) {
            modeOptions.forEach(option => option.classList.remove('active'));
            if (state.monoMode) {
                modeOptions[0].classList.add('active');
            } else {
                modeOptions[1].classList.add('active');
            }
        }
    }

    // Ensure audio path matches the new state.monoMode
    if (config.initialized) { // Check if audio system is ready
        if (state.monoMode) {
            disconnectMonoPath(); // Ensure poly path (if any) is disconnected
            connectMonoPath();    // Connect mono path
        } else {
            disconnectMonoPath(); // Disconnect mono path
                                  // Poly voices connect themselves on creation
        }
    }
}

function updateStandardSwitchesUI() {
    // PWM Source Switch
    const pwmFaderContainer = document.querySelector('#raembl-oscillator .fader-container.fader-with-switch:nth-child(6)');
    if (pwmFaderContainer) {
        const pwmSwitch = pwmFaderContainer.querySelector('.switch');
        if (pwmSwitch) {
            const options = pwmSwitch.querySelectorAll('.switch-option');
            options.forEach(opt => opt.classList.remove('active'));
            if (options[state.pwmSource]) options[state.pwmSource].classList.add('active');
        }
    }


    // Pitch Mod Source Switch
    const modFaderContainer = document.querySelector('#raembl-oscillator .fader-container.fader-with-switch:nth-child(7)');
     if (modFaderContainer) {
        const modSwitch = modFaderContainer.querySelector('.switch');
        if (modSwitch) {
            const options = modSwitch.querySelectorAll('.switch-option');
            options.forEach(opt => opt.classList.remove('active'));
            if (options[state.modSource]) options[state.modSource].classList.add('active');
        }
    }
}

// Function to update Delay Sync/Free toggle UI based on state
function updateDelaySyncSwitchUI() {
    const delaySyncToggle = document.querySelector('#raembl-delay .delay-sync-toggle');
    if (delaySyncToggle) {
        delaySyncToggle.textContent = state.delaySyncEnabled ? 'SYNC' : 'FREE';
        delaySyncToggle.classList.toggle('active', state.delaySyncEnabled);
    }
}

// Per-parameter modulation animation loop (continuous)
function startPerParamModulationLoop() {
    function modulationLoop() {
        // Apply k-rate modulations and update audio state
        applyPerParamModulations();

        // Update visual feedback (LED indicators and fader overlays)
        updateModulationVisualFeedback();

        // Continue loop
        requestAnimationFrame(modulationLoop);
    }

    // Start the loop
    requestAnimationFrame(modulationLoop);
}

// Set up test modulations for LP and Decay
function setupTestModulations() {

    // Test 1: LP (filter lowpass) - audio-rate modulation
    state.perParamModulations['filter.lowPass'] = {
        enabled: true,
        waveform: 0,        // Sine wave
        rate: 3.0,          // 3 Hz
        depth: 30,          // 30% modulation depth
        offset: 0,          // No DC offset
        resetMode: 'off'    // Free-running
    };

    // Test 2: Decay (envelope) - k-rate modulation
    state.perParamModulations['envelope.decay'] = {
        enabled: true,
        waveform: 0,        // Sine wave
        rate: 2.0,          // 2 Hz
        depth: 50,          // 50% modulation depth
        offset: 0,          // No DC offset
        resetMode: 'off'    // Free-running
    };

}

// --- PPMod Modal Event Handlers ---
function setupPPModEventHandlers() {
    // Handle modulation parameter updates from modal
    document.addEventListener('ppmodUpdate', (event) => {
        const { paramId, app, modParam, value } = event.detail;
        if (app !== 'raembl') return;

        // Get or create modulation config for this parameter
        if (!state.perParamModulations[paramId]) {
            state.perParamModulations[paramId] = {
                mode: 'LFO',
                enabled: true,
                depth: 50,
                offset: 0,
                muted: false,
                baseValue: null,
                // LFO defaults
                lfoWaveform: 0,
                lfoRate: 1.0,
                lfoSync: false,
                resetMode: 'off',
                // v1.1.0 mode-specific defaults
                seqLength: 4,
                seqPattern: [0.5, 0.5, 0.5, 0.5],
                // ENV mode defaults
                envAttackMs: 10,
                envReleaseMs: 200,
                envCurveShape: 'exponential',
                envSource: 'note-on',
                // RND mode defaults
                rndBitLength: 16,
                rndProbability: 100,
                rndSampleRate: 1000,
                // TM mode defaults
                tmLength: 8,
                tmProbability: 50,
                tmPattern: null,  // Generated on first use
                tmCurrentStep: 0,
                // EF mode defaults
                efSource: 'raembl',
                efAttackMs: 10,
                efReleaseMs: 100,
                efSensitivity: 100
            };
        }

        const modConfig = state.perParamModulations[paramId];

        // Map modal param names to state config properties
        switch (modParam) {
            case 'mode':
                modConfig.mode = value;
                modConfig.enabled = true;
                // Ensure depth has a reasonable default if currently 0
                if (!modConfig.depth || modConfig.depth === 0) {
                    modConfig.depth = 50;
                }
                break;
            case 'depth':
                modConfig.depth = value;
                modConfig.enabled = value > 0;
                break;
            case 'offset':
                modConfig.offset = value;
                break;
            // SEQ mode params
            case 'seqLength':
                modConfig.seqLength = value;
                // Resize pattern array
                while (modConfig.seqPattern.length < value) {
                    modConfig.seqPattern.push(0.5);
                }
                modConfig.seqPattern = modConfig.seqPattern.slice(0, value);
                break;
            case 'seqStep':
                // value is { step: index, value: 0-1 }
                if (modConfig.seqPattern && value.step < modConfig.seqPattern.length) {
                    modConfig.seqPattern[value.step] = value.value;
                }
                break;
            // LFO mode params (backward compat)
            case 'lfoRate':
                modConfig.lfoRate = value;
                modConfig.rate = value; // Legacy alias
                break;
            case 'lfoWaveform':
                modConfig.lfoWaveform = value;
                modConfig.waveform = value; // Legacy alias
                break;
            default:
                // Direct assignment for other params
                modConfig[modParam] = value;
                break;
        }

    });

    // Handle modulation reset from modal
    document.addEventListener('ppmodReset', (event) => {
        const { paramId, app } = event.detail;
        if (app !== 'raembl') return;

        // Remove modulation config
        delete state.perParamModulations[paramId];
    });
}

// Open PPMod modal for a parameter (called from fader label click handlers)
export function openPPModForParameter(paramId) {
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) {
        console.warn(`[PPMod] Unknown parameter: ${paramId}`);
        return;
    }

    // Get current modulation config
    const modConfig = state.perParamModulations[paramId] || null;

    // Open modal
    openPPModModal(paramId, 'raembl', modConfig, paramDef);
}

document.addEventListener('DOMContentLoaded', async () => {

    // Initialize theme color early (before any canvas drawing)
    const savedHue = loadThemeHue();
    setThemeHue(savedHue);

    // Load FX mode from localStorage BEFORE rendering modules
    // This ensures modules render with the correct FX type on first load
    const savedFxMode = localStorage.getItem('fxMode') || 'classic';
    state.fxMode = savedFxMode;

    renderModules();

    // Initialize circuit pattern for spacer panel (only exists in Clouds mode)
    const raemblSpacerCanvas = document.getElementById('raembl-spacer-canvas');
    if (raemblSpacerCanvas) {
        window.raemblSpacerPattern = new SpacerPatternManager('raembl-spacer-canvas');
        window.raemblSpacerPattern.init().then(() => {
            window.raemblSpacerPattern.startAnimation();
        });
    }

    await initAudio(); // Initializes audio graph, effects, but LFOs might not start yet
    // initTitle(); // Initialize title oscilloscope visualization - REMOVED (title canvas removed from HTML)

    // Listen for Plaits params added event BEFORE initializing engine selector
    // (event may fire synchronously during init if oscillator module already exists)
    document.addEventListener('plaitsParamsAdded', () => {
      console.log('[Main] Plaits params added, reinitializing slide pots and PPMod visuals');
      setupSlidePots();
      // Re-cache modulation elements to include new Plaits SlidePots
      initModulationVisuals();
    });

    // Listen for Rings params added event
    document.addEventListener('ringsParamsAdded', () => {
      console.log('[Main] Rings params added, reinitializing slide pots and PPMod visuals');
      setupSlidePots();
      // Re-cache modulation elements to include new Rings SlidePots
      initModulationVisuals();
    });

    // Initialize engine selector (Plaits/Subtractive/Rings toggle)
    initEngineSelector();

    const resumeAudioInteraction = () => {
        resumeAudio(); // This will also attempt to start effects LFOs
        document.body.removeEventListener('pointerdown', resumeAudioInteraction);
        document.body.removeEventListener('keydown', resumeAudioInteraction);
    };
    document.body.addEventListener('pointerdown', resumeAudioInteraction, { once: true });
    document.body.addEventListener('keydown', resumeAudioInteraction, { once: true });

    setupFaders(); // Sets up interaction and initial fill based on state (legacy faders)
    setupSlidePots(); // Sets up new SlidePot controls
    setupMiniFaders(); // Sets up new MiniFader controls

    // --- Initialize Fader Text Displays ---
    const allFaderContainers = document.querySelectorAll('.raembl-app .fader-container');
    allFaderContainers.forEach(container => {
        const labelElement = container.querySelector('.fader-label');
        const valueDisplayElement = container.querySelector('.fader-value');
        const parentModuleElement = container.closest('.module');

        if (labelElement && valueDisplayElement && parentModuleElement) {
            const label = labelElement.textContent.trim();
            const parentId = parentModuleElement.id;
            let currentValue;
            try {
                // Find parameter definition more robustly
                const paramDef = Object.values(parameterDefinitions).find(p => {
                    // Special check for MOD faders as their label is just "MOD"
                    if (p.label === "MOD" && p.module === parentId) return true;
                    return p.label === label && p.module === parentId;
                });

                if (paramDef) {
                    const pathParts = paramDef.statePath.split('.');
                    let tempVal = state;
                    pathParts.forEach(part => { tempVal = tempVal[part]; });

                    // Handle specific cases where the displayed value depends on another state
                    if (paramDef.label === 'TIME' && paramDef.module === 'delay') {
                        currentValue = state.delaySyncEnabled ? state.delayTime : state.delayTimeFree;
                    } else if (paramDef.label === 'WAVE' && paramDef.module === 'mod') {
                        // modLfoWaveform is already 0, 25, 50, 75, 100
                        currentValue = state.modLfoWaveform;
                    } else if (paramDef.label === 'WAVE' && paramDef.module === 'lfo') {
                        currentValue = state.lfoWaveform;
                    }
                    else { // General case
                        currentValue = tempVal;
                    }

                    if (currentValue !== undefined) {
                        updateFaderDisplay(label, currentValue, valueDisplayElement);
                    } else {
                         console.warn(`Could not determine initial value for fader: ${label} in ${parentId}`);
                    }
                } else {
                     // This can happen for fader-like structures that aren't direct parameters (e.g. if switches had value displays)
                     // console.warn(`No paramDef found for fader: ${label} in ${parentId} for initial display.`);
                }
            } catch (e) {
                console.error(`Error setting initial display for fader ${label} in ${parentId}:`, e);
            }
        }
    });
    // --- End Initialize Fader Text Displays ---

    setupResetButtons();
    setupPlayButton();
    setupSwitches(); // This will also call setupDelaySyncSwitch which updates its UI
    setupRandomButtons(); // Setup random buttons for all modules

    // Duck buttons - sidechain ducking modal
    document.querySelectorAll('.raembl-app .duck-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const effectKey = btn.dataset.effect;
            if (effectKey) {
                openDuckModal(effectKey);
            }
        });
    });

    // Sync duck button visuals with initial state (in case patches have ducking enabled)
    updateDuckButtonVisuals();

    // initClock(); // OLD: Original Ræmbl clock initialization
    initClock();    // NEW: Initialize shared clock
    initRaemblClock(); // NEW: Initialize Ræmbl clock subscriber
    initFactors();
    initLfo();    // Initializes main LFO logic and starts its drawing loop
    initPath();
    initReverb(); // module/reverb.js for visualization
    initDelay();  // module/delay.js for visualization
    initMod();    // module/mod.js (delegates to modlfo.js, which starts its own loop)
    initPerParamModulation(); // Per-parameter modulation system
    initModulationVisuals();  // Cache DOM elements for modulation visual feedback
    initPPModModal();         // PPMod modal UI
    setupPPModEventHandlers(); // Wire up PPMod modal events
    // setupTestModulations();   // Enable test modulations for LP and Decay

    // Start per-parameter modulation animation loop
    startPerParamModulationLoop();

    initMidi();
    initMidiMappingUI();

    // Initial state applications
    releaseAllVoices(); // Clear any voices from potential previous bad state
    updateFactorsPattern(); // Generate initial pattern
    updateScaleDisplay();   // Set initial scale name display
    updateModeSwitchUIAndAudioPath(); // Set initial MONO/POLY switch and audio path
    updateStandardSwitchesUI();     // Set initial PWM/MOD source switches
    updateDelaySyncSwitchUI();      // Set initial Delay Sync/Free switch

    // Random initialization on load
    // Random BPM between 90-110
    state.bpm = Math.floor(Math.random() * 21) + 90; // 90 to 110

    // Random STEPS (odd numbers > 8)
    const oddStepsOptions = [9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31];
    state.steps = oddStepsOptions[Math.floor(Math.random() * oddStepsOptions.length)];

    // Random FILLS between 50-75% of STEPS
    const minFillsPercent = 0.50;
    const maxFillsPercent = 0.75;
    const fillsPercent = minFillsPercent + (Math.random() * (maxFillsPercent - minFillsPercent));
    state.fills = Math.round(state.steps * fillsPercent);

    // Random SCALE (0-31)
    state.scale = Math.floor(Math.random() * 32); // 0 to 31

    // Random ROOT (0-11)
    state.root = Math.floor(Math.random() * 12); // 0 to 11

    // Random LFO FREQ between 1Hz and 30Hz
    // LFO uses exponential mapping: frequency = 0.05 * Math.pow(600, normalized)
    // Inverse: normalized = log(frequency / 0.05) / log(600)
    const randomLfoFreqHz = 1 + Math.random() * 29; // 1 to 30 Hz
    const normalized = Math.log(randomLfoFreqHz / 0.05) / Math.log(600);
    state.lfoFreq = Math.round(normalized * 100);


    // Update UI for randomized values
    updateParameterById('clock.bpm', state.bpm);
    updateParameterById('factors.steps', state.steps);
    updateParameterById('factors.fills', state.fills);
    updateParameterById('path.scale', state.scale);
    updateParameterById('path.root', state.root);
    updateParameterById('lfo.freq', state.lfoFreq);

    // Initialize history manager with current state
    historyManager.initialize();

    // Ensure LFO visualization is running if not already started by initLfo
    setTimeout(() => {
        if (ensureMainLfoRunning && typeof ensureMainLfoRunning === 'function') {
            if(ensureMainLfoRunning()) {
                // console.log("Main LFO visualization loop (re)started by main.js timeout.");
            }
        }
    }, 200); // Small delay to ensure canvas is ready

    // Prevent scrolling on fader touch
    document.querySelectorAll('.raembl-app .fader-track').forEach(fader => {
        fader.addEventListener('touchmove', e => {
            if (e.target.closest('.fader-track')) {
                 e.preventDefault();
            }
        }, { passive: false });
    });

    // Keyboard input listeners
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    // Double click to toggle fader value visibility
    document.body.addEventListener('dblclick', (e) => {
        // Ignore dblclick on interactive elements
        if (e.target.closest('button, .fader-track, .fader-label, .switch-option, .settings-panel, .settings-gear, input, select, textarea')) {
            return;
        }
        const valueDisplays = document.querySelectorAll('.raembl-app .fader-value');
        let allHidden = Array.from(valueDisplays).every(display => display.style.display === 'none');
        const newDisplay = allHidden ? 'flex' : 'none'; // 'flex' to re-enable centered display
        valueDisplays.forEach(display => {
            display.style.display = newDisplay;
        });
    });

    // Settings Panel Logic (gear icon now in time strip)
    const settingsPanel = document.getElementById('raembl-settings-panel');
    const closeSettingsBtn = document.getElementById('raembl-close-settings-btn');
    const savePatchButton = document.getElementById('raembl-save-patch-button');
    const loadPatchInput = document.getElementById('raembl-load-patch-input');

    if (settingsPanel && closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsPanel.classList.add('hidden');
            if (isMidiLearning) {
                toggleMidiLearnMode(false); // Turn off learn mode if panel is closed
            }
        });

        // Close panel if clicking outside of it (check time strip settings button too)
        document.addEventListener('click', (event) => {
            const timeStripSettingsBtn = document.querySelector('[data-param-id="raembl-settings"]');
            if (!settingsPanel.classList.contains('hidden') &&
                !settingsPanel.contains(event.target) &&
                (!timeStripSettingsBtn || !timeStripSettingsBtn.contains(event.target))) {
                settingsPanel.classList.add('hidden');
                if (isMidiLearning) {
                    toggleMidiLearnMode(false);
                }
            }
        });

        // Close panel with Escape key
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !settingsPanel.classList.contains('hidden')) {
                settingsPanel.classList.add('hidden');
                if (isMidiLearning) {
                    toggleMidiLearnMode(false);
                }
            }
        });
    } else {
        console.warn("Settings panel elements not found. Full functionality might be affected.");
    }

    // Setup Save/Load Patch listeners
    if (savePatchButton) {
        savePatchButton.addEventListener('click', handleSavePatch);
    } else {
        console.warn("Save Patch button not found.");
    }
    if (loadPatchInput) {
        loadPatchInput.addEventListener('change', handleLoadPatch);
    } else {
        console.warn("Load Patch input not found.");
    }

    // Manual Modal Logic
    const rtfmButton = document.getElementById('raembl-rtfm-button');
    const manualModal = document.getElementById('raembl-manual-modal');
    const closeManualBtn = document.getElementById('raembl-close-manual-btn');

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
    } else {
        console.warn("Manual modal elements not found.");
    }

    // Manual sidebar toggle
    const toggleSidebarBtn = document.getElementById('raembl-toggle-manual-sidebar');
    const manualSidebar = document.getElementById('raembl-manual-sidebar');

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
                    // This scrolls the target to the top of its nearest scrollable ancestor
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

    // Display Theme Toggle Logic
    const invertDisplayButton = document.getElementById('raembl-invert-display-button');
    if (invertDisplayButton) {
        // Load saved preference from localStorage
        const savedTheme = localStorage.getItem('displayTheme') || 'dark';
        applyTheme(savedTheme);

        invertDisplayButton.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            applyTheme(newTheme);
            localStorage.setItem('displayTheme', newTheme);
        });
    }

    function applyTheme(theme) {
        if (theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            if (invertDisplayButton) {
                invertDisplayButton.textContent = 'Switch to Dark Mode';
            }
        } else {
            document.documentElement.removeAttribute('data-theme');
            if (invertDisplayButton) {
                invertDisplayButton.textContent = 'Switch to Light Mode';
            }
        }

        // Redraw all canvases with new colors
        redrawAllVisualizations();
    }

    // FX Mode Toggle Logic
    const fxModeClassicBtn = document.getElementById('fx-mode-classic');
    const fxModeCloudsBtn = document.getElementById('fx-mode-clouds');

    if (fxModeClassicBtn && fxModeCloudsBtn) {
        // Sync button states with already-loaded state.fxMode (loaded earlier before renderModules)
        fxModeClassicBtn.classList.toggle('active', state.fxMode === 'classic');
        fxModeCloudsBtn.classList.toggle('active', state.fxMode === 'clouds');

        fxModeClassicBtn.addEventListener('click', () => {
            if (state.fxMode !== 'classic') {
                state.fxMode = 'classic';
                applyFxMode('classic');
                localStorage.setItem('fxMode', 'classic');
            }
        });

        fxModeCloudsBtn.addEventListener('click', () => {
            if (state.fxMode !== 'clouds') {
                state.fxMode = 'clouds';
                applyFxMode('clouds');
                localStorage.setItem('fxMode', 'clouds');
            }
        });
    }

    async function applyFxMode(mode) {
        // Cancel any running animation frames BEFORE clearing DOM
        cleanupFactors();
        stopCloudsAnimation();

        // Update button states
        if (fxModeClassicBtn && fxModeCloudsBtn) {
            fxModeClassicBtn.classList.toggle('active', mode === 'classic');
            fxModeCloudsBtn.classList.toggle('active', mode === 'clouds');
        }

        // Re-render modules FIRST so canvas exists before audio init
        renderModules(true); // Pass true to clear existing modules

        // Now switch audio routing (Clouds needs canvas to exist)
        await switchFxMode(mode);

        // Notify dynamic spacing system that modules have been re-rendered
        document.dispatchEvent(new CustomEvent('modulesRerendered'));

        // Re-initialize modules that need event handlers
        initClock();   // Clock module
        initFactors(); // Factors module
        initLfo();     // LFO module
        initPath();    // Path module

        // Initialize FX modules based on mode
        if (mode === 'classic') {
            initReverb();
            initDelay();
        } else if (mode === 'clouds') {
            // Clouds worklet was initialized in switchFxMode()
            // Now attach UI event handlers and start animation
            attachCloudsEventHandlers();
            startCloudsAnimation();

            // IMPORTANT: Re-initialize Clouds fader visuals after setupFaders() runs
            // (setupFaders sets them to 0 because they're not in the state system)
            setTimeout(() => {
                const cloudsModule = document.getElementById('raembl-clouds');
                if (cloudsModule) {
                    const faderContainers = cloudsModule.querySelectorAll('.fader-container');
                    // CRITICAL: Order must match HTML fader sequence!
                    const paramNames = ['pitch', 'position', 'density', 'size', 'texture', 'dryWet', 'spread', 'feedback', 'reverb'];
                    const cloudParams = {
                        position: { min: 0, max: 1, default: 0.5 },
                        size: { min: 0, max: 1, default: 0.5 },
                        density: { min: 0, max: 1, default: 0.5 },
                        texture: { min: 0, max: 1, default: 0.5 },
                        pitch: { min: -2, max: 2, default: 0 },
                        spread: { min: 0, max: 1, default: 0.5 },
                        feedback: { min: 0, max: 1, default: 0 },
                        reverb: { min: 0, max: 1, default: 0.3 },
                        dryWet: { min: 0, max: 1, default: 1.0 }
                    };

                    faderContainers.forEach((container, index) => {
                        const paramName = paramNames[index];
                        if (!paramName) return;

                        const paramConfig = cloudParams[paramName];
                        const fill = container.querySelector('.fader-fill');
                        if (fill) {
                            const defaultPercent = ((paramConfig.default - paramConfig.min) / (paramConfig.max - paramConfig.min)) * 100;
                            fill.style.height = `${defaultPercent}%`;
                        }
                    });
                }
            }, 100);

            // Sync worklet parameters from state OR cached patch data (prevent desync when switching FX modes)
            setTimeout(() => {
                if (config.cloudsNode) {
                    // Prefer cached patch data if available, otherwise use state
                    if (config.loadedPatchData && config.loadedPatchData.clouds) {
                        // Restore from cached patch
                        setCloudsState(config.loadedPatchData.clouds);
                    } else {
                        // Fallback: sync from state
                        const stateToParamMap = {
                            'cloudsPitch': 'pitch',
                            'cloudsPosition': 'position',
                            'cloudsDensity': 'density',
                            'cloudsSize': 'size',
                            'cloudsTexture': 'texture',
                            'cloudsDryWet': 'dryWet',
                            'cloudsSpread': 'spread',
                            'cloudsFeedback': 'feedback',
                            'cloudsReverb': 'reverb'
                        };

                        Object.entries(stateToParamMap).forEach(([stateKey, paramName]) => {
                            const param = config.cloudsNode.parameters.get(paramName);
                            if (!param) return;

                            let stateValue = state[stateKey];
                            let normalizedValue = paramName === 'pitch'
                                ? (stateValue / 100) * 4 - 2
                                : stateValue / 100;

                            param.value = normalizedValue;
                        });

                    }
                }
            }, 150); // Run after UI reset completes
        }

        initMod();    // Mod module
        initPerParamModulation(); // Per-param modulation

        // Re-attach fader event handlers (CRITICAL - lost during re-render)
        setupFaders();
        setupSlidePots();
        setupMiniFaders();
        setupResetButtons();
        setupSwitches();
        setupRandomButtons();

        // Re-cache DOM elements for modulation visuals (CRITICAL - old cache is stale after module re-render)
        initModulationVisuals();

    }

    // Theme Color Hue Fader Logic
    const themeHueTrack = document.querySelector('.raembl-app .theme-hue-track');
    const themeHueFill = document.querySelector('.raembl-app .theme-hue-fill');
    const themeHueValue = document.querySelector('.raembl-app .theme-hue-value');

    if (themeHueTrack && themeHueFill && themeHueValue) {
        // Load saved hue preference
        const savedHue = loadThemeHue();
        setThemeHue(savedHue);
        updateHueFaderDisplay(savedHue);

        // Mouse drag handler
        let isDragging = false;

        themeHueTrack.addEventListener('mousedown', (e) => {
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

        function updateHueFromMouse(e) {
            const rect = themeHueTrack.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const percentage = x / rect.width;
            const hue = Math.round(percentage * 360);

            setThemeHue(hue);
            saveThemeHue(hue);
            updateHueFaderDisplay(hue);

            // Redraw all canvases and regenerate dice faces
            redrawAllVisualizations();
        }

        function updateHueFaderDisplay(hue) {
            const percentage = (hue / 360) * 100;
            themeHueFill.style.width = `${percentage}%`;
            themeHueValue.textContent = `${hue}°`;
        }
    }

    function redrawAllVisualizations() {
        // Redraw canvases
        if (typeof drawLfo === 'function') drawLfo();
        if (typeof drawPath === 'function') drawPath();
        if (typeof drawReverbViz === 'function') drawReverbViz();
        if (typeof drawDelayViz === 'function') drawDelayViz();
        if (typeof updateFactorsPattern === 'function') updateFactorsPattern();

        // Update dice button colors
        const diceButtons = document.querySelectorAll('.raembl-app .random-button svg circle');
        diceButtons.forEach(circle => {
            circle.setAttribute('fill', colors.yellow);
        });
    }

    // Listen for theme changes and redraw visualizations
    document.addEventListener('themeChanged', () => {
        redrawAllVisualizations();
    });

    // Start periodic POLY voice cleanup timer
    // This ensures inactive voices are cleaned up even if no new notes are triggered
    // Critical fix for hanging notes in POLY mode
    setInterval(() => {
        if (!state.monoMode && config.audioContext) {
            releaseInactiveVoices();
        }
    }, 100); // Check every 100ms

}); // End of DOMContentLoaded

function updateScaleDisplay() {
    const pathModule = document.getElementById('raembl-path');
    if (!pathModule) return;
    // Assuming SCALE fader is the first one in the Path module
    const scaleFaderContainer = pathModule.querySelector('.fader-section .fader-container:nth-child(1)');
    if (scaleFaderContainer) {
        const scaleDisplay = scaleFaderContainer.querySelector('.fader-value');
        if (scaleDisplay) {
            try {
                 scaleDisplay.textContent = getCurrentScaleName();
            } catch (e) {
                 console.error("Error updating scale display:", e);
                 scaleDisplay.textContent = "Err"; // Fallback display
            }
        }
    }
}

// --- Keyboard Note Input ---
const keyboardMap = {
    'a': 'C', 's': 'D', 'd': 'E', 'f': 'F', 'g': 'G', 'h': 'A', 'j': 'B',
    'w': 'C#', 'e': 'D#', 't': 'F#', 'y': 'G#', 'u': 'A#', // Top row for sharps
    // Adding one more octave for common keyboard layouts
    'k': 'C', 'l': 'D', ';': 'E', "'": 'F',             // Higher octave
    'o': 'C#', 'p': 'D#'                                // Higher octave sharps
};
const keyOctaveMap = { // Base octave for each key
    'a': 3, 'w': 3, 's': 3, 'e': 3, 'd': 3, 'f': 3, 't': 3, 'g': 3, 'y': 3, 'h': 3, 'u': 3, 'j': 3,
    'k': 4, 'o': 4, 'l': 4, 'p': 4, ';': 4, "'": 4
};

function handleKeyDown(event) {
    // NOTE: Undo/Redo (Cmd+Z / Cmd+X) is handled by Bæng's keyboard handler
    // using the unified history manager. Don't duplicate here.

    // Ignore if modifier keys are pressed (for other keys) or if it's a repeat event
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;

    // If settings panel is open and an input inside it has focus, don't trigger notes
    const settingsPanel = document.getElementById('raembl-settings-panel');
    if (settingsPanel && !settingsPanel.classList.contains('hidden') && event.target.closest('#settings-panel')) {
        if (['input', 'select', 'button', 'textarea'].includes(event.target.tagName.toLowerCase())) {
             if (event.key === 'Escape') { /* Already handled by panel listener */ }
             else { return; } // Don't process synth keys if focus is on form element
        }
    }


    // Ignore if typing in an input field outside settings panel too
    const targetTagName = event.target.tagName.toLowerCase();
    if (targetTagName === 'input' || targetTagName === 'textarea' || event.target.isContentEditable) return;

    const key = event.key.toLowerCase();

    // Octave shift
    if (key === 'z') {
        currentOctaveOffset = Math.max(MIN_OCTAVE_OFFSET, currentOctaveOffset - 1);
        event.preventDefault(); return;
    }
    if (key === 'x') {
        currentOctaveOffset = Math.min(MAX_OCTAVE_OFFSET, currentOctaveOffset + 1);
        event.preventDefault(); return;
    }

    // If key is already active, don't retrigger (prevents issues with held notes)
    if (activeKeyVoices.hasOwnProperty(key)) return;

    const baseNoteName = keyboardMap[key];
    const baseOctave = keyOctaveMap[key];

    if (baseNoteName && typeof baseOctave !== 'undefined') {
        const targetOctave = baseOctave + currentOctaveOffset;
        // Ensure octave is within a reasonable range (e.g., 0-8 for MIDI notes)
        const finalOctave = Math.max(0, Math.min(8, targetOctave));
        const note = `${baseNoteName}${finalOctave}`;

        const velocity = 1.0; // Standard velocity
        const isAccented = event.shiftKey; // Use Shift key for accent
        const shouldSlide = false; // Keyboard slide not implemented here, could be another key

        const voice = triggerNote(note, velocity, isAccented, shouldSlide);

        if (voice && voice.id) {
            activeKeyVoices[key] = voice.id;
        } else if (!voice && state.monoMode) { // If createVoice returned null (e.g. all levels zero) but was mono
            // Store a placeholder to allow releaseAllVoices to clear it if needed,
            // or for specific key-up release logic for mono if implemented.
            activeKeyVoices[key] = `mono_${note}`;
        }
        event.preventDefault(); // Prevent default browser action for keys like space, arrows etc.
    }
}

function handleKeyUp(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const settingsPanel = document.getElementById('raembl-settings-panel');
     if (settingsPanel && !settingsPanel.classList.contains('hidden') && event.target.closest('#settings-panel')) {
        if (['input', 'select', 'button', 'textarea'].includes(event.target.tagName.toLowerCase())) {
            return; // Don't process synth key up if focus is on form element
        }
    }

    const targetTagName = event.target.tagName.toLowerCase();
    if (targetTagName === 'input' || targetTagName === 'textarea' || event.target.isContentEditable) return;

    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'x') { event.preventDefault(); return; } // Prevent default for octave keys


    if (activeKeyVoices.hasOwnProperty(key)) {
        const voiceIdToRelease = activeKeyVoices[key];

        if (voiceIdToRelease && !String(voiceIdToRelease).startsWith('mono_')) {
             releaseVoiceById(voiceIdToRelease);
        } else if (state.monoMode) { // For mono, release the current sounding voice if any
            // This is a general release for mono on any key up that was playing.
            // More precise mono key tracking would require knowing which key *started* the current mono voice.
            if (config.voices.length > 0 && config.voices[0] && config.voices[0].active) {
                // Check if the note of the active mono voice matches the key being released
                // This is a simplified check; true legato might need more complex tracking
                const activeMonoNoteName = config.voices[0].note.slice(0, -1); // e.g., "C" from "C3"
                const activeMonoOctave = parseInt(config.voices[0].note.slice(-1), 10);
                const releasedKeyBaseNote = keyboardMap[key];
                const releasedKeyBaseOctave = keyOctaveMap[key];
                if (releasedKeyBaseNote && typeof releasedKeyBaseOctave !== 'undefined') {
                    const releasedKeyFinalOctave = releasedKeyBaseOctave + currentOctaveOffset;
                    if (activeMonoNoteName === releasedKeyBaseNote && activeMonoOctave === releasedKeyFinalOctave) {
                         releaseVoiceById(config.voices[0].id);
                    }
                } else { // If no direct match, but a key was released, and it's mono, release current.
                    releaseVoiceById(config.voices[0].id);
                }
            }
        }
        delete activeKeyVoices[key];
        event.preventDefault();
    }
}


// --- MIDI Functions ---
function initMidi() {
    const midiInputSelect = document.getElementById('raembl-midi-input-select');
    if (!midiInputSelect) {
        console.warn("MIDI input select element not found.");
        return;
    }

    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess({ sysex: false })
            .then(onMIDISuccess, onMIDIFailure);
    } else {
        console.warn("WebMIDI is not supported in this browser.");
        midiInputSelect.innerHTML = '<option value="">WebMIDI Not Supported</option>';
    }

    midiInputSelect.addEventListener('change', (event) => {
        primaryNoteInputDeviceId = event.target.value || null;
    });
}

function onMIDISuccess(mAccess) {
    midiAccess = mAccess; // Store midiAccess globally
    populateMidiInputList(); // Populate the dropdown

    midiAccess.inputs.forEach(input => {
        input.onmidimessage = handleMidiMessage;
    });

    midiAccess.onstatechange = (event) => {
        if (event.port.type === "input") {
            if (event.port.state === "connected") {
                event.port.onmidimessage = handleMidiMessage;
            } else if (event.port.state === "disconnected") {
                if (event.port.onmidimessage) {
                    event.port.onmidimessage = null;
                }
                if (primaryNoteInputDeviceId === event.port.id) {
                    primaryNoteInputDeviceId = null;
                }
            }
        }
        populateMidiInputList();
    };
}

function populateMidiInputList() {
    if (!midiAccess) return;
    const midiInputSelect = document.getElementById('raembl-midi-input-select');
    if (!midiInputSelect) return;

    const inputs = midiAccess.inputs.values();
    midiInputSelect.innerHTML = '';
    let count = 0;

    const allOption = document.createElement('option');
    allOption.value = "";
    allOption.textContent = "All Devices (Notes/CC)";
    midiInputSelect.appendChild(allOption);

    for (let input = inputs.next(); input && !input.done; input = inputs.next()) {
        const option = document.createElement('option');
        option.value = input.value.id;
        option.textContent = input.value.name;
        midiInputSelect.appendChild(option);
        count++;
    }

    if (count === 0) {
        allOption.textContent = "No MIDI Inputs Found";
    }

    if (primaryNoteInputDeviceId && midiInputSelect.querySelector(`option[value="${primaryNoteInputDeviceId}"]`)) {
        midiInputSelect.value = primaryNoteInputDeviceId;
    } else {
        midiInputSelect.value = "";
        primaryNoteInputDeviceId = null;
    }
}


function onMIDIFailure(msg) {
    console.error(`Failed to get MIDI access - ${msg}`);
    const midiInputSelect = document.getElementById('raembl-midi-input-select');
    if (midiInputSelect) {
        midiInputSelect.innerHTML = '<option value="">MIDI Access Failed</option>';
    }
}

function handleMidiMessage(event) {
    const commandForLearnCheck = event.data[0] >> 4;
    if (isMidiLearning && commandForLearnCheck === 11) { // CC command
        // Let the dedicated learn handler (temporaryMidiLearnHandler) manage it.
        // This main handler should not process CCs during active learn mode.
        return;
    }

    const port = event.target;
    if (!port) {
        console.error("MIDI Port not found on event target.", event);
        return;
    }
    const portId = port.id;

    const command = event.data[0] >> 4;
    const channel = (event.data[0] & 0xf) + 1;
    const data1 = event.data[1];
    const data2 = event.data[2];

    if (primaryNoteInputDeviceId && portId !== primaryNoteInputDeviceId && (command === 9 || command === 8)) {
         return;
    }

    const noteKey = `${portId}-${channel}-${data1}`;

    switch (command) {
        case 9: // Note On
            if (data2 > 0) {
                const noteName = midiNoteToName(data1);
                const isAccented = data2 > 100;
                const shouldSlide = false;
                const midiVelocityNormalized = data2 / 127.0;

                if (activeMidiNoteVoices.hasOwnProperty(noteKey)) {
                    const oldVoiceInfo = activeMidiNoteVoices[noteKey];
                    if (oldVoiceInfo.voiceId && !String(oldVoiceInfo.voiceId).startsWith('mono_')) {
                        releaseVoiceById(oldVoiceInfo.voiceId);
                    }
                    delete activeMidiNoteVoices[noteKey];
                }
                
                const voice = triggerNote(noteName, midiVelocityNormalized, isAccented, shouldSlide);

                if (voice && voice.id) {
                    activeMidiNoteVoices[noteKey] = { voiceId: voice.id, portId: portId, channel: channel };
                } else if (!voice && state.monoMode) {
                    activeMidiNoteVoices[noteKey] = { voiceId: `mono_${noteName}`, portId: portId, channel: channel };
                }
            } else { // Note On with velocity 0 is equivalent to Note Off
                if (activeMidiNoteVoices.hasOwnProperty(noteKey)) {
                    const voiceInfo = activeMidiNoteVoices[noteKey];
                    if (voiceInfo.voiceId && !String(voiceInfo.voiceId).startsWith('mono_')) {
                        releaseVoiceById(voiceInfo.voiceId);
                    } else if (state.monoMode && config.voices.length > 0 && config.voices[0]) {
                        releaseVoiceById(config.voices[0].id);
                    }
                    delete activeMidiNoteVoices[noteKey];
                } else {
                    console.warn(`[MIDI Note-On vel=0] No active voice found for noteKey: ${noteKey}`);
                }
            }
            break;

        case 8: // Note Off

            // Log all active voices
            const activeVoices = config.voices.filter(v => v && v.active);
            const releasingVoices = config.voices.filter(v => v && !v.active && v.releaseStartTime);
            if (activeVoices.length > 0) {
            }

            if (activeMidiNoteVoices.hasOwnProperty(noteKey)) {
                const voiceInfo = activeMidiNoteVoices[noteKey];
                if (voiceInfo.voiceId && !String(voiceInfo.voiceId).startsWith('mono_')) {
                    releaseVoiceById(voiceInfo.voiceId);
                } else if (state.monoMode && config.voices.length > 0 && config.voices[0]) {
                    releaseVoiceById(config.voices[0].id);
                }
                delete activeMidiNoteVoices[noteKey];
            } else {
                console.warn(`[MIDI Note-Off] No active voice found for noteKey: ${noteKey}`);
            }
            break;

        case 11: // Control Change (CC)
            const ccNumber = data1;
            const ccValue = data2;
            const mapping = state.midiCCMappings.find(m =>
                m.cc === ccNumber &&
                (!m.channel || m.channel === channel) &&
                (!m.portId || m.portId === portId)
            );

            if (mapping) {
                const paramDef = parameterDefinitions[mapping.parameterId];
                if (paramDef) {
                    const outMin = mapping.min !== undefined ? mapping.min : paramDef.min;
                    const outMax = mapping.max !== undefined ? mapping.max : paramDef.max;
                    let scaledValue = ((ccValue / 127.0) * (outMax - outMin)) + outMin;
                    if (paramDef.step) {
                        scaledValue = Math.round(scaledValue / paramDef.step) * paramDef.step;
                    }
                    scaledValue = Math.max(paramDef.min, Math.min(paramDef.max, scaledValue));
                    updateParameterById(mapping.parameterId, scaledValue);

                    // Capture snapshot after MIDI CC update (debounced)
                    if (typeof historyManager !== 'undefined' && historyManager) {
                        historyManager.pushSnapshot(true);
                    }
                }
            }
            break;
    }
}

// --- MIDI Mapping UI Functions ---
function initMidiMappingUI() {
    const parameterSelect = document.getElementById('raembl-midi-parameter-select');
    const ccInput = document.getElementById('raembl-midi-cc-input');
    const channelInput = document.getElementById('raembl-midi-channel-input');
    const learnButton = document.getElementById('raembl-midi-learn-btn');
    const addButton = document.getElementById('raembl-add-midi-mapping-btn');
    const mappingsList = document.getElementById('raembl-midi-mappings-list');

    if (!parameterSelect || !mappingsList || !addButton || !learnButton || !ccInput || !channelInput) {
        console.warn("MIDI Mapping UI elements not found. UI will not be fully initialized.");
        return;
    }

    parameterSelect.innerHTML = '<option value="">-- Select Parameter --</option>';
    const sortedParamIds = Object.keys(parameterDefinitions)
        .filter(id => {
            const def = parameterDefinitions[id];
            return def && def.module && def.label;
        })
        .sort((a, b) => {
            const paramA = parameterDefinitions[a];
            const paramB = parameterDefinitions[b];
            if (paramA.module < paramB.module) return -1;
            if (paramA.module > paramB.module) return 1;
            if (paramA.label < paramB.label) return -1;
            if (paramA.label > paramB.label) return 1;
            return 0;
        });

    for (const paramId of sortedParamIds) {
        const paramDef = parameterDefinitions[paramId];
        // Skip invalid parameter definitions
        if (!paramDef || !paramDef.module || !paramDef.label) {
            console.warn(`[MIDI UI] Skipping invalid parameter definition: ${paramId}`);
            continue;
        }
        const option = document.createElement('option');
        option.value = paramId;
        let friendlyName = `${paramDef.module.charAt(0).toUpperCase() + paramDef.module.slice(1)} - ${paramDef.label}`;
        option.textContent = friendlyName;
        parameterSelect.appendChild(option);
    }

    renderMidiMappings();
    learnButton.disabled = false;
    learnButton.addEventListener('click', () => toggleMidiLearnMode());
    parameterSelect.addEventListener('change', attemptAutoAddMappingAfterLearn);
    addButton.addEventListener('click', handleManualAddMidiMapping);
    mappingsList.addEventListener('click', handleDeleteMidiMappingEvent);
}

function renderMidiMappings() {
    const mappingsList = document.getElementById('raembl-midi-mappings-list');
    if (!mappingsList) return;
    mappingsList.innerHTML = '';

    if (state.midiCCMappings.length === 0) {
        const li = document.createElement('li');
        li.classList.add('no-mappings');
        li.textContent = 'No CC mappings defined.';
        mappingsList.appendChild(li);
        return;
    }

    state.midiCCMappings.forEach((mapping, index) => {
        const li = document.createElement('li');
        const paramDef = parameterDefinitions[mapping.parameterId];
        const paramName = paramDef ? `${paramDef.module.charAt(0).toUpperCase() + paramDef.module.slice(1)} - ${paramDef.label}` : mapping.parameterId;
        let detailsHTML = `<span class="mapping-details">
                             <span class="mapping-param">${paramName}</span>
                             <span class="mapping-arrow">←</span> <span class="mapping-cc">CC ${mapping.cc}</span>`;
        if (mapping.channel) {
            detailsHTML += `<span class="mapping-channel">(Ch ${mapping.channel})</span>`;
        }
        if (mapping.portId && midiAccess && midiAccess.inputs) {
            const port = midiAccess.inputs.get(mapping.portId);
            if (port) {
                 detailsHTML += `<span class="mapping-port">(${(port.name || 'Unknown Port').substring(0,10)+(port.name.length > 10 ? '...' : '')})</span>`;
            }
        }
        detailsHTML += `</span>`;
        const deleteButton = document.createElement('button');
        deleteButton.classList.add('delete-mapping-btn');
        deleteButton.textContent = 'Del';
        deleteButton.title = 'Delete this mapping';
        deleteButton.dataset.index = index;
        li.innerHTML = detailsHTML;
        li.appendChild(deleteButton);
        mappingsList.appendChild(li);
    });
}

function handleManualAddMidiMapping() {
    const parameterSelect = document.getElementById('raembl-midi-parameter-select');
    const ccInput = document.getElementById('raembl-midi-cc-input');
    const channelInput = document.getElementById('raembl-midi-channel-input');
    
    const parameterId = parameterSelect.value;
    const cc = parseInt(ccInput.value, 10);
    const channel = channelInput.value ? parseInt(channelInput.value, 10) : undefined;
    const portId = learnedCCInfo ? learnedCCInfo.portId : undefined;
    const portName = learnedCCInfo ? learnedCCInfo.portName : undefined;

    if (isMidiLearning) {
        toggleMidiLearnMode(false);
    }
    const success = addOrUpdateMapping(parameterId, cc, channel, portId, portName);
    if (success) {
        if (!learnedCCInfo || parameterId) { // If not from learn, or if from learn and param was selected
            ccInput.value = "";
            channelInput.value = "";
            parameterSelect.value = "";
            if (parameterId) learnedCCInfo = null; // Clear learned info if used
        }
    }
}

function addOrUpdateMapping(parameterId, cc, channel, portId, portNameForStatus) {
    const learnStatus = document.getElementById('raembl-midi-learn-status');
    if (!parameterId) {
        learnStatus.textContent = "Error: Please select a parameter.";
        setTimeout(() => { if (learnStatus.textContent.startsWith("Error:")) learnStatus.textContent = ""; }, 3000);
        return false;
    }
    if (isNaN(cc) || cc < 0 || cc > 127) {
        learnStatus.textContent = "Error: Invalid CC number (0-127).";
        setTimeout(() => { if (learnStatus.textContent.startsWith("Error:")) learnStatus.textContent = ""; }, 3000);
        return false;
    }
    if (channel !== undefined && (isNaN(channel) || channel < 1 || channel > 16)) {
        learnStatus.textContent = "Error: Invalid MIDI channel (1-16).";
        setTimeout(() => { if (learnStatus.textContent.startsWith("Error:")) learnStatus.textContent = ""; }, 3000);
        return false;
    }

    const conflictingMappingIndex = state.midiCCMappings.findIndex(m =>
        m.cc === cc &&
        (m.channel === channel || (!m.channel && !channel)) &&
        (m.portId === portId || (!m.portId && !portId)) &&
        m.parameterId !== parameterId
    );
    if (conflictingMappingIndex !== -1) {
        state.midiCCMappings.splice(conflictingMappingIndex, 1);
    }
    state.midiCCMappings = state.midiCCMappings.filter(m => m.parameterId !== parameterId);
    const newMapping = { cc, parameterId };
    if (channel) newMapping.channel = channel;
    if (portId) newMapping.portId = portId;
    state.midiCCMappings.push(newMapping);
    const paramDefForStatus = parameterDefinitions[parameterId];
    const paramNameForStatus = paramDefForStatus ? paramDefForStatus.label : parameterId;
    const portNameToDisplay = portId ? ` on ${ (portNameForStatus || 'learned port').substring(0,15)}` : '';
    learnStatus.textContent = `Mapped: ${paramNameForStatus} to CC ${cc}${channel ? ` Ch ${channel}` : ''}${portNameToDisplay}.`;
    setTimeout(() => { if (learnStatus.textContent.startsWith("Mapped:")) learnStatus.textContent = ""; }, 3000);
    renderMidiMappings();
    return true;
}

function handleDeleteMidiMappingEvent(event) {
    event.stopPropagation();
    if (event.target.classList.contains('delete-mapping-btn')) {
        const mappingIndex = parseInt(event.target.dataset.index, 10);
        if (!isNaN(mappingIndex) && mappingIndex >= 0 && mappingIndex < state.midiCCMappings.length) {
            state.midiCCMappings.splice(mappingIndex, 1);
            renderMidiMappings();
            const learnStatus = document.getElementById('raembl-midi-learn-status');
            if(learnStatus) {
                learnStatus.textContent = "Mapping deleted.";
                setTimeout(() => { if (learnStatus.textContent === "Mapping deleted.") learnStatus.textContent = ""; }, 2000);
            }
        }
    }
}

function toggleMidiLearnMode(forceState) {
    const learnButton = document.getElementById('raembl-midi-learn-btn');
    const learnStatus = document.getElementById('raembl-midi-learn-status');
    const ccInput = document.getElementById('raembl-midi-cc-input');
    const channelInput = document.getElementById('raembl-midi-channel-input');

    if (forceState !== undefined) {
        if (forceState === false && isMidiLearning === false) return;
        isMidiLearning = forceState;
    } else {
        isMidiLearning = !isMidiLearning;
    }

    if (isMidiLearning) {
        learnedCCInfo = null;
        learnButton.textContent = "Learning...";
        learnButton.classList.add('active');
        learnStatus.textContent = "Move a knob/fader on your MIDI controller...";
        ccInput.value = ""; channelInput.value = "";
        if (!temporaryMidiLearnHandler) {
            temporaryMidiLearnHandler = (event) => {
                const port = event.target;
                if (!port) return;
                const command = event.data[0] >> 4;
                const midiChannel = (event.data[0] & 0xf) + 1;
                const data1 = event.data[1];
                if (command === 11) { // Control Change
                    learnedCCInfo = { cc: data1, channel: midiChannel, portId: port.id, portName: port.name };
                    ccInput.value = learnedCCInfo.cc;
                    channelInput.value = learnedCCInfo.channel;
                    learnStatus.textContent = `Learned CC ${learnedCCInfo.cc} (Ch ${learnedCCInfo.channel}) from ${port.name.substring(0,15)}. Select a parameter.`;
                    toggleMidiLearnMode(false); // Turn off learn mode after one CC
                    const parameterSelect = document.getElementById('raembl-midi-parameter-select');
                    if (parameterSelect.value) attemptAutoAddMappingAfterLearn();
                }
            };
        }
        if (midiAccess && midiAccess.inputs) {
            midiAccess.inputs.forEach(input => {
                input.removeEventListener('midimessage', temporaryMidiLearnHandler); // Remove old one just in case
                input.addEventListener('midimessage', temporaryMidiLearnHandler);
            });
        }
    } else { // Turning learn mode OFF
        learnButton.textContent = "Learn";
        learnButton.classList.remove('active');
        if (learnStatus && learnStatus.textContent === "Move a knob/fader on your MIDI controller...") {
             learnStatus.textContent = "";
        }
        if (midiAccess && midiAccess.inputs && temporaryMidiLearnHandler) {
            midiAccess.inputs.forEach(input => {
                input.removeEventListener('midimessage', temporaryMidiLearnHandler);
            });
        }
    }
}

function attemptAutoAddMappingAfterLearn() {
    const parameterSelect = document.getElementById('raembl-midi-parameter-select');
    const learnStatus = document.getElementById('raembl-midi-learn-status');
    if (learnedCCInfo && parameterSelect.value) {
        const success = addOrUpdateMapping(
            parameterSelect.value, learnedCCInfo.cc, learnedCCInfo.channel,
            learnedCCInfo.portId, learnedCCInfo.portName
        );
        if (success) {
            parameterSelect.value = ""; // Clear parameter select
            document.getElementById('raembl-midi-cc-input').value = ""; // Clear CC
            document.getElementById('raembl-midi-channel-input').value = ""; // Clear Channel
            learnedCCInfo = null; // Consume the learned info
        }
        // If not successful, error message is handled by addOrUpdateMapping.
        // learnedCCInfo is kept so user can try selecting another param or fixing input.
    } else if (learnedCCInfo && !parameterSelect.value) {
        // If CC is learned but no parameter is selected yet
        if(learnStatus) learnStatus.textContent = `Learned CC ${learnedCCInfo.cc} (Ch ${learnedCCInfo.channel}). Now select a parameter to complete mapping.`;
    }
}
// --- End MIDI Mapping UI Functions ---