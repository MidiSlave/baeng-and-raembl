# State Management

Bæng & Ræmbl uses a three-namespace state architecture to manage the merged application while maintaining clear separation between apps.

## Overview

The application state is divided into three namespaces:

- **`sharedState`** - Timing and transport properties shared between both apps
- **`baengState`** - Bæng-specific state (voices, sequences, effects, per-param modulations)
- **`raemblState`** - Ræmbl-specific state (oscillator, filter, envelope, effects, per-param modulations)

This architecture ensures:
- **Synchronised transport** - Both apps share the same clock, BPM, and swing
- **Independent operation** - Each app maintains its own synthesis parameters and effects
- **Clean namespacing** - No parameter ID collisions between apps

## State Structure

### Shared State (`merged-app/js/state.js`)

Located at `/merged-app/js/state.js`, the shared state container holds timing properties synchronised between both apps:

```javascript
export const sharedState = {
    // Transport state
    isPlaying: false,
    bpm: 120,
    swing: 0,

    // Bar length (separate for each app)
    baengBarLength: 4,      // Bæng pattern length in beats
    raemblBarLength: 4,     // Ræmbl pattern length in beats

    // Clock position
    currentStepIndex: -1,
    displayBar: 1,
    displayBeat: 1,
    displayStep: 1,
    isBarStart: false,

    // Scheduler state
    clockRequestId: null,
    lastStepTime: 0,
    stepCounter: -1,
    barCounter: 0,
    stepsPerBeat: 4,

    // Tempo multipliers (Bæng plays at 2× speed)
    baengTempoMultiplier: 2.0,
    raemblTempoMultiplier: 1.0
};
```

**Implementation Notes:**
- Bar lengths are separate to allow independent pattern lengths
- Tempo multipliers enable Bæng to play at double-time whilst sharing the same clock
- Both apps receive clock events but interpret them differently based on their multiplier

### State Proxy System

Each app's state is wrapped in a proxy that automatically routes timing properties to `sharedState`:

```javascript
export function createStateProxy(appState, sharedState) {
    return new Proxy(appState, {
        get(target, prop) {
            if (SHARED_TIMING_PROPS.includes(prop)) {
                return sharedState[prop];
            }
            return target[prop];
        },
        set(target, prop, value) {
            if (SHARED_TIMING_PROPS.includes(prop)) {
                sharedState[prop] = value;
                return true;
            }
            target[prop] = value;
            return true;
        }
    });
}
```

**Benefits:**
- Apps can access `state.bpm` naturally without knowing it's shared
- Changes to timing properties automatically synchronise
- No manual routing logic required in app code

### Bæng State (`merged-app/js/baeng/state.js`)

Contains all Bæng-specific state:

```javascript
const localState = {
    // Edit modes
    editMode: 'edit',           // 'edit' or 'select'
    selectedVoice: 0,           // Currently selected voice (0-5)

    // Voice settings (6 voices)
    voices: [
        {
            engine: 'aKICK',    // 'aKICK', 'aSNARE', 'aHIHAT', 'DX7', 'SAMPLE', 'SLICE'
            outputMode: 'OUT',  // 'OUT' or 'AUX' (analog engines only)
            polyphonyMode: 0,   // Polyphony setting (engine-dependent)

            // Macro controls (engine-dependent)
            macroPatch: 50,
            macroDepth: 50,
            macroRate: 50,
            macroPitch: 50,

            // Processing
            gate: 80,           // Gate duration (0-100%)
            pan: 50,
            level: 85,
            bitReduction: 0,
            drive: 0,
            chokeGroup: 1,

            // FX sends
            reverbSend: 0,
            delaySend: 0,
            cloudsSend: 0,

            // Mute state
            muted: false
        }
        // ... 5 more voices
    ],

    // Sequences (6 sequences, 64 steps each)
    sequences: Array(6).fill(null).map(() => ({
        length: 16,             // Active sequence length
        probability: 100,       // Per-voice probability (0-100%)
        currentStep: -1,
        steps: Array(64).fill(null).map(() => ({
            gate: false,
            accent: 0,          // 0-15
            ratchet: 0,         // 0-7 (maps to 1-8 triggers)
            probability: 100,   // 0-100%
            deviation: 0,       // 0-100%
            deviationMode: 1    // 0: Early, 1: Late, 2: Both
        })),
        euclidean: {
            steps: 16,
            fills: 0,
            shift: 0,
            accentAmt: 0,
            flamAmt: 0,
            ratchetAmt: 0,
            ratchetSpeed: 1,
            deviation: 0
        }
    })),

    // Global effects
    reverbMix: 100,             // Per-voice sends control amount
    reverbDecay: 50,
    reverbDamping: 50,
    reverbDiffusion: 60,
    reverbPreDelay: 10,

    delayMix: 100,
    delayTime: 25,
    delayFeedback: 0,
    delayTimeFree: 50,
    delaySyncEnabled: true,
    delayWow: 10,
    delayFlutter: 5,
    delaySaturation: 0,
    delayFilter: 50,

    // Drum Bus processor
    drumBus: {
        enabled: true,
        driveType: 0,           // 0=SOFT, 1=MED, 2=HARD
        driveAmount: 0,
        crunch: 0,
        transients: 50,         // 50 = neutral
        boomAmount: 0,
        boomFreq: 33,
        boomDecay: 50,
        compEnabled: false,
        dampenFreq: 100,
        trimGain: 50,
        outputGain: 75,
        dryWet: 100
    },

    // FX mode
    fxMode: 'classic',          // 'classic' or 'clouds'

    // Clouds parameters (when fxMode === 'clouds')
    cloudsPosition: 50,
    cloudsSize: 50,
    cloudsDensity: 50,
    cloudsTexture: 50,
    cloudsPitch: 50,
    cloudsSpread: 0,
    cloudsFeedback: 0,          // CRITICAL: default 0 prevents runaway
    cloudsReverb: 0,
    cloudsDryWet: 0,
    cloudsInputGain: 50,
    cloudsFreeze: false,
    cloudsMode: 0,              // 0=Granular, 1=WSOLA, 2=Looping, 3=Spectral
    cloudsQuality: 0,           // 0=High, 1=Medium, 2=Low, 3=XLow

    // Per-parameter modulations (sparse storage, v1.1.0)
    perParamModulations: {
        // Example:
        // 'voice.dx7PatchIndex': {
        //     mode: 'LFO',
        //     enabled: false,
        //     depth: 50,
        //     offset: 0,
        //     muted: false,
        //     baseValue: null,    // Global param base value
        //     baseValues: [],     // Per-voice base values [v0...v5]
        //
        //     // LFO mode params
        //     lfoWaveform: 0,
        //     lfoRate: 1.0,
        //     lfoSync: false,
        //     resetMode: 'off',
        //     triggerSource: 'none'
        // }
    },

    // Modulation edit mode
    modEditMode: {
        activeParamId: null,
        currentPage: 0,
        inactivityTimer: null,
        lastInteractionTime: null,
        activeLabelElement: null,
        activeContainer: null,
        activeControlElement: null,
        activeValueDisplay: null,
        draggedParamId: null
    },

    // Scale quantisation
    scaleQuantizeEnabled: false,
    globalScale: 0,              // Index into scales array (0-32)
    globalRoot: 0                // Root note (0-11, C-B)
};

// Register with state manager
export const state = registerBaengState(localState);
```

### Ræmbl State (`merged-app/js/raembl/state.js`)

Contains all Ræmbl-specific state:

```javascript
const localState = {
    // Factors (Euclidean sequencer)
    steps: 16,
    fills: 4,
    rotation: 0,
    accentAmt: 0,
    slideAmt: 0,
    trillAmt: 0,
    gateLength: 80,
    gatePattern: [],
    accentPattern: [],
    slidePattern: [],
    trillPattern: [],
    factorsAnimationMode: 'animated',

    // LFO
    lfoAmp: 36,
    lfoFreq: 36,
    lfoWaveform: 0,
    lfoOffset: 0,
    lfoValue: 0,
    lfoStartTime: performance.now(),

    // Mod LFO
    modLfoRate: 50,
    modLfoWaveform: 0,
    modLfoValue: 0,

    // Path (pitch sequencer)
    sample: 50,
    prevSample: 30,
    scale: 3,                    // Scale index
    root: 0,                     // Root note (0-11)
    probability: 100,
    currentNote: 'C3',
    stepPitches: [],             // Pitch values per step
    pathAnimationMode: 'animated',

    // Reverb
    reverbMix: 25,
    diffusion: 60,
    preDelay: 10,
    reverbDecay: 70,
    damping: 20,

    // Delay
    delayMix: 25,
    delayTime: 50,               // SYNC mode (0-100, maps to divisions)
    delayTimeFree: 50,           // FREE mode (0-100, maps to ms)
    delaySyncEnabled: true,
    feedback: 40,
    wow: 10,
    flutter: 5,
    saturation: 0,

    // FX mode
    fxMode: 'classic',           // 'classic' or 'clouds'

    // Clouds parameters
    cloudsPosition: 0,
    cloudsSize: 0,
    cloudsDensity: 50,
    cloudsTexture: 50,
    cloudsPitch: 50,
    cloudsSpread: 50,
    cloudsFeedback: 0,           // CRITICAL: default 0
    cloudsReverb: 30,
    cloudsDryWet: 0,
    cloudsInputGain: 50,
    cloudsFreeze: false,

    // Engine selection
    engineType: 'subtractive',   // 'subtractive', 'plaits', 'rings'
    plaitsEngine: 0,             // Plaits engine index (0-23)
    ringsModel: 0,               // Rings model index (0-5)

    // Plaits parameters (0-100, mapped to 0-1)
    plaitsHarmonics: 50,
    plaitsTimbre: 50,
    plaitsMorph: 50,
    plaitsLpgDecay: 50,
    plaitsLpgColour: 50,
    plaitsMixOutAux: 0,

    // Rings parameters (0-100, mapped to 0-1)
    ringsStructure: 50,
    ringsBrightness: 50,
    ringsDamping: 50,
    ringsPosition: 25,
    ringsMixStrum: 50,
    ringsPolyphony: 4,           // 1, 2, or 4

    // Oscillator (subtractive engine)
    mainTransposition: 4,
    subTransposition: 2,
    drift: 10,
    glide: 0,
    pulseWidth: 50,
    pwmAmount: 0,
    pitchMod: 0,
    pwmSource: 0,
    modSource: 0,
    monoMode: true,

    // Mixer
    sawLevel: 75,
    squareLevel: 0,
    triangleLevel: 0,
    subLevel: 50,
    noiseLevel: 0,

    // Filter
    highPass: 0,
    lowPass: 75,
    resonance: 20,
    keyFollow: 0,
    envAmount: 50,
    filterMod: 0,

    // Envelope
    attack: 0,
    decay: 25,
    sustain: 50,
    release: 75,

    // Output
    volume: 75,

    // MIDI CC mappings
    midiCCMappings: [],

    // Per-parameter modulations (v1.1.0, sparse storage)
    perParamModulations: {
        // Example:
        // 'filter.lowPass': {
        //     mode: 'LFO',
        //     enabled: true,
        //     depth: 60,
        //     offset: 0,
        //     muted: false,
        //     baseValue: null,
        //
        //     // LFO mode
        //     lfoWaveform: 0,
        //     lfoRate: 2.5,
        //     lfoSync: false,
        //     resetMode: 'step'
        // }
    },

    // Modulation edit mode
    modEditMode: {
        activeParamId: null,
        currentPage: 0,
        inactivityTimer: null,
        lastInteractionTime: null,
        activeLabelEl: null,
        activeFill: null,
        activeValueDisplay: null,
        activeVerticalText: null
    }
};

// Register with state manager
export const state = registerRaemblState(localState);
```

## Parameter Definitions

Both apps define a `parameterDefinitions` object that maps parameter IDs to state paths, UI labels, and constraints:

```javascript
export const parameterDefinitions = {
    // Example Bæng parameter
    "time.bpm": {
        module: "time",
        label: "BPM",
        statePath: "bpm",        // Shared timing property
        min: 20,
        max: 300,
        default: 120,
        step: 1
    },

    // Example voice parameter with dynamic path
    "voice.macroPatch": {
        module: "baeng-engine",
        label: "PATCH",
        statePath: "voices[selectedVoice].macroPatch",
        min: 0,
        max: 100,
        default: 50,
        step: 1,
        modulatable: true,
        voiceParam: true
    },

    // Example Ræmbl parameter
    "filter.lowPass": {
        module: "raembl-filter",
        label: "LP",
        statePath: "lowPass",
        min: 0,
        max: 100,
        default: 75,
        modulatable: true
    }
};
```

**Properties:**
- **`module`** - DOM element ID that hosts this control (for UI lookups)
- **`label`** - User-facing label on the control
- **`statePath`** - Dot-notation path to value in state object
- **`min/max/default/step`** - Value constraints
- **`modulatable`** - Whether parameter supports per-param modulation
- **`voiceParam`** - Whether parameter is per-voice (Bæng only)
- **`effectParam`** - Whether parameter is a global effect (Bæng only)

**Dynamic Paths:**
- Paths containing `[selectedVoice]` are resolved dynamically based on `state.selectedVoice`
- Example: `"voices[selectedVoice].pan"` → `"voices[0].pan"` when voice 0 is selected

## getParamValue() Pattern

The `getParamValue()` function provides safe parameter value lookups with fallback to defaults.

### Bæng Implementation

```javascript
export function getParameterValue(paramId) {
    const paramDef = parameterDefinitions[paramId];
    if (!paramDef) {
        return null;
    }

    const path = resolveParameterPath(paramDef);
    if (!path) {
        return paramDef.default !== undefined ? paramDef.default : null;
    }

    const pathParts = path.split('.');
    let value = state;

    try {
        for (const part of pathParts) {
            if (part.includes('[') && part.includes(']')) {
                // Handle array access: voices[0]
                const arrayName = part.substring(0, part.indexOf('['));
                const indexStr = part.substring(part.indexOf('[') + 1, part.indexOf(']'));
                const index = parseInt(indexStr, 10);

                if (!value[arrayName] || index < 0 || index >= value[arrayName].length) {
                    return paramDef.default !== undefined ? paramDef.default : null;
                }
                value = value[arrayName][index];
            } else {
                // Handle object property access
                if (value[part] === undefined) {
                    return paramDef.default !== undefined ? paramDef.default : null;
                }
                value = value[part];
            }
        }
    } catch (error) {
        return paramDef.default !== undefined ? paramDef.default : null;
    }

    return value;
}
```

### Helper: resolveParameterPath()

Resolves dynamic paths containing `[selectedVoice]`:

```javascript
export function resolveParameterPath(paramDef) {
    if (!paramDef || !paramDef.statePath) {
        return null;
    }

    if (paramDef.statePath.includes('[selectedVoice]')) {
        if (state.selectedVoice === null || state.selectedVoice < 0 ||
            state.selectedVoice >= state.voices.length) {
            // Fallback to voice 0 on invalid selection
            return paramDef.statePath.replace('[selectedVoice]', `[0]`);
        }
        return paramDef.statePath.replace('[selectedVoice]', `[${state.selectedVoice}]`);
    }

    return paramDef.statePath;
}
```

### Usage Example

```javascript
// Get BPM (shared timing)
const bpm = getParameterValue('time.bpm');

// Get current voice's pan (resolves [selectedVoice] dynamically)
const pan = getParameterValue('voice.pan');

// Get filter cutoff (Ræmbl)
const cutoff = getParameterValue('filter.lowPass');
```

**Benefits:**
- **Type safety** - Returns null for invalid parameters
- **Graceful degradation** - Falls back to defaults on errors
- **Array support** - Handles voice arrays and dynamic indices
- **Error recovery** - Doesn't crash on missing state properties

## updateParameterById() Pattern

The `updateParameterById()` function updates state, audio parameters, and UI in response to user interactions or patch loading.

### Bæng Implementation

Located in `/merged-app/js/baeng/utils/parameterUpdater.js`:

```javascript
export function updateParameterById(paramId, value) {
    // Set the parameter value
    if (!setParameterValue(paramId, value)) {
        console.warn(`Failed to set parameter ${paramId} to ${value}`);
        return false;
    }

    // Visual elements updated by main updateAllUI()
    // Individual parameter UI updates are complex and best left to full UI update

    return true;
}
```

### Ræmbl Implementation

Located in `/merged-app/js/raembl/ui/faderState.js` (more complex due to legacy fader system):

```javascript
export function updateParameterById(parameterId, value) {
    const paramDef = parameterDefinitions[parameterId];
    if (!paramDef) {
        console.warn(`Parameter ID "${parameterId}" not found in definitions.`);
        return;
    }

    // Navigate to state property via path
    const pathParts = paramDef.statePath.split('.');
    let currentStateObject = state;
    for (let i = 0; i < pathParts.length - 1; i++) {
        currentStateObject = currentStateObject[pathParts[i]];
        if (!currentStateObject) {
            console.error(`Invalid state path for ${parameterId}: ${paramDef.statePath}`);
            return;
        }
    }

    // Apply constraints
    let processedValue = value;
    if (paramDef.step) {
        processedValue = Math.round(value / paramDef.step) * paramDef.step;
    }
    processedValue = Math.max(paramDef.min, Math.min(paramDef.max, processedValue));

    // Special handling for delay time (sync vs free mode)
    if (parameterId === 'delay.time') {
        if (state.delaySyncEnabled) {
            state.delayTime = processedValue;
        } else {
            state.delayTimeFree = processedValue;
        }
    } else {
        // Standard property update
        const propName = pathParts[pathParts.length - 1];
        currentStateObject[propName] = processedValue;
    }

    // Update UI (SlidePots)
    syncSlidePotFromState(parameterId);

    // Update legacy fader UI
    let faderModuleElement = null;
    if (paramDef.module) {
        faderModuleElement = document.getElementById(paramDef.module);
        if (!faderModuleElement && !paramDef.module.startsWith('raembl-')) {
            faderModuleElement = document.getElementById(`raembl-${paramDef.module}`);
        }
    }

    // ... UI update code ...

    // Trigger audio/visual updates based on parameter type
    switch (parameterId) {
        case 'clock.bpm':
            updateDelay();
            drawDelay();
            startDelayAnimation();
            break;
        case 'filter.lowPass':
            updateFilter();
            break;
        // ... more cases ...
    }

    // Capture snapshot for undo/redo
    if (typeof historyManager !== 'undefined' && historyManager) {
        historyManager.pushSnapshot(true);
    }
}
```

### Key Differences

**Bæng:**
- Simpler implementation - relies on `updateAllUI()` for visual updates
- Used primarily by undo/redo system
- Delegates to `setParameterValue()` for state updates

**Ræmbl:**
- Handles legacy fader UI updates directly
- Integrates with SlidePot UI system
- More granular control over audio parameter updates
- Special-case handling for dual-mode parameters (delay sync/free)

### Usage Example

```javascript
// Update BPM (both apps will see this change via sharedState)
updateParameterById('time.bpm', 140);

// Update Bæng voice pan
updateParameterById('voice.pan', 75);

// Update Ræmbl filter cutoff (triggers updateFilter() + UI update)
updateParameterById('filter.lowPass', 60);
```

## Timing Parameter Routing

Timing parameters (BPM, swing, bar length) require special handling to ensure proper synchronisation.

### Direct State Updates (Incorrect)

```javascript
// ❌ WRONG: Direct state mutation bypasses shared clock
state.bpm = 140;
```

### Shared Clock Functions (Correct)

```javascript
import { setBPM, setSwing, setBaengBarLength, setRaemblBarLength }
    from '../../shared/clock.js';

// ✅ CORRECT: Use shared clock functions
setBPM(140);                    // Updates sharedState.bpm + broadcasts event
setSwing(50);                   // Updates sharedState.swing + broadcasts event
setBaengBarLength(8);           // Updates sharedState.baengBarLength
setRaemblBarLength(16);         // Updates sharedState.raemblBarLength
```

### Implementation in setParameterValue()

Bæng's `setParameterValue()` automatically routes timing updates:

```javascript
export function setParameterValue(paramId, newValue) {
    // ... constraint application ...

    // Special handling for timing parameters
    if (paramId === 'time.bpm') {
        setBPM(value);
        return true; // Don't set state directly - shared clock will update it
    } else if (paramId === 'time.swing') {
        setSwing(value);
        return true;
    } else if (paramId === 'time.barLength') {
        setBaengBarLength(value);
        return true;
    }

    // Normal state update for other parameters
    target[lastPart] = value;
    return true;
}
```

**Why This Matters:**
- Shared clock functions dispatch events to both apps
- Ensures visualisations update in sync (waveforms, clock displays)
- Prevents race conditions when both apps try to update timing

## Event-Driven Updates

State changes trigger custom events to synchronise UI and audio across the application.

### Clock Events

```javascript
// Emitted by shared clock on every step
document.dispatchEvent(new CustomEvent('clockTick', {
    detail: {
        stepIndex: 0,
        isBarStart: true,
        bar: 1,
        beat: 1,
        step: 1
    }
}));

// Emitted when BPM changes
document.dispatchEvent(new CustomEvent('bpmChanged', {
    detail: { bpm: 140 }
}));
```

### App-Specific Events

**Bæng:**
```javascript
// Step advanced in sequence
document.dispatchEvent(new CustomEvent('baengStepAdvanced', {
    detail: { voiceIndex: 0, stepIndex: 4 }
}));

// Voice triggered
document.dispatchEvent(new CustomEvent('baengVoiceTrigger', {
    detail: { voiceIndex: 0, note: 60, velocity: 127 }
}));
```

**Ræmbl:**
```javascript
// Note on/off
document.dispatchEvent(new CustomEvent('raemblNoteOn', {
    detail: { note: 60, velocity: 100 }
}));

document.dispatchEvent(new CustomEvent('raemblNoteOff', {
    detail: { note: 60 }
}));
```

### Event Listeners

Both apps subscribe to clock events:

```javascript
// Bæng sequencer listens for clock ticks
document.addEventListener('clockTick', (e) => {
    const { stepIndex, isBarStart } = e.detail;
    advanceSequence(stepIndex, isBarStart);
});

// Ræmbl factors module listens for clock ticks
document.addEventListener('clockTick', (e) => {
    const { stepIndex } = e.detail;
    if (euclideanPattern[stepIndex]) {
        triggerNote();
    }
});
```

## Patch Save/Load Interaction

Patches are saved in a unified format that includes state from both apps.

### Patch Format (v1.2.0)

```json
{
    "version": "1.2.0",
    "sharedTiming": {
        "bpm": 120,
        "swing": 50,
        "baengBarLength": 4,
        "raemblBarLength": 16
    },
    "baeng": {
        "voices": [ /* 6 voice objects */ ],
        "sequences": [ /* 6 sequence objects */ ],
        "reverbMix": 100,
        "reverbDecay": 50,
        "drumBus": { /* drum bus settings */ },
        "fxMode": "classic",
        "modulations": {
            "voice.pan": {
                "mode": "LFO",
                "enabled": true,
                "depth": 50,
                "offset": 0,
                "lfoWaveform": 0,
                "lfoRate": 1.0,
                "lfoSync": false,
                "resetMode": "step"
            }
        }
    },
    "raembl": {
        "engineType": "plaits",
        "plaitsEngine": 5,
        "mainTransposition": 4,
        "sawLevel": 75,
        "lowPass": 60,
        "attack": 10,
        "modulations": {
            "filter.lowPass": {
                "mode": "ENV",
                "enabled": true,
                "depth": 60,
                "offset": 0,
                "envAttackMs": 10,
                "envReleaseMs": 200,
                "envCurveShape": "exponential"
            }
        }
    }
}
```

### Selective Parameter Loading

When loading a patch, only **timing parameters** are shared between apps:

```javascript
function loadPatch(patchData) {
    // 1. Load shared timing (affects both apps)
    if (patchData.sharedTiming) {
        setBPM(patchData.sharedTiming.bpm);
        setSwing(patchData.sharedTiming.swing);
        setBaengBarLength(patchData.sharedTiming.baengBarLength);
        setRaemblBarLength(patchData.sharedTiming.raemblBarLength);
    }

    // 2. Load Bæng state (independent)
    if (patchData.baeng) {
        Object.assign(baengState.voices, patchData.baeng.voices);
        Object.assign(baengState.sequences, patchData.baeng.sequences);
        baengState.reverbMix = patchData.baeng.reverbMix;
        // ... more Bæng parameters ...

        // Load per-param modulations
        baengState.perParamModulations = patchData.baeng.modulations || {};
    }

    // 3. Load Ræmbl state (independent)
    if (patchData.raembl) {
        raemblState.engineType = patchData.raembl.engineType;
        raemblState.mainTransposition = patchData.raembl.mainTransposition;
        raemblState.lowPass = patchData.raembl.lowPass;
        // ... more Ræmbl parameters ...

        // Load per-param modulations
        raemblState.perParamModulations = patchData.raembl.modulations || {};
    }

    // 4. Update all UI and audio
    updateAllUI();
}
```

**Key Principles:**
- Loading a **Bæng patch** updates `sharedState.bpm/swing/baengBarLength` only
- Loading a **Ræmbl patch** updates `sharedState.bpm/swing/raemblBarLength` only
- Each app maintains independent synthesis parameters
- Modulations are stored per-app with mode information (v1.1.0+)

### Backward Compatibility

Patches without `modulations` or `mode` properties load successfully:

```javascript
// v1.0.0 patch (no modulations)
if (patchData.baeng.modulations) {
    // Load modulations
} else {
    // Skip modulation loading - all params use base values
}

// v1.1.0 modulation without mode (defaults to LFO)
const modConfig = patchData.baeng.modulations['voice.pan'];
const mode = modConfig.mode || 'LFO';  // Backward compatible default
```

## Common Patterns

### Checking Shared State

```javascript
// Both apps can check if playing
if (state.isPlaying) {
    // Transport is running
}

// Get current BPM
const currentBPM = state.bpm;  // Proxied to sharedState.bpm
```

### Per-Voice Operations (Bæng)

```javascript
// Get current voice's level
const level = getParameterValue('voice.level');

// Update current voice's pan
updateParameterById('voice.pan', 75);

// Apply parameter to all voices (Control All)
applyParameterToAllVoices('voice.level', 100);
```

### Safe Voice-Specific Updates

```javascript
// Update specific voice without changing selection
setParameterValueForVoice('voice.pan', 25, 3);  // Set voice 3 pan to 25

// Original selection preserved
console.log(state.selectedVoice);  // Still 0
```

### Module-Specific Parameters (Ræmbl)

```javascript
// Disambiguate parameters with same label (DAMP exists in reverb + Rings)
const paramDef = parameterDefinitions['reverb.damping'];  // Reverb DAMP
const paramDef2 = parameterDefinitions['rings.damping'];  // Rings DAMP

// Label lookup requires parent module ID
updateFaderState('DAMP', 50, document.getElementById('raembl-reverb'));  // Reverb
updateFaderState('DAMP', 70, document.getElementById('raembl-oscillator'));  // Rings
```

## Best Practices

### ✅ Do

- **Use shared clock functions** for BPM/swing/bar length updates
- **Use `getParameterValue()`** for safe parameter lookups
- **Use `updateParameterById()`** for UI-triggered changes (handles state + audio + visualisation)
- **Check `paramDef.voiceParam`** before applying Control All
- **Store modulation configs per-app** in `perParamModulations` with mode information
- **Include `version` in patch format** for future compatibility

### ❌ Don't

- **Don't mutate `sharedState` directly** - use clock functions
- **Don't access `state.voices[state.selectedVoice]` directly** - use `getParameterValue()` + resolved paths
- **Don't update timing via `setParameterValue()`** without clock function routing
- **Don't assume parameter labels are unique** - always check module context (Ræmbl)
- **Don't forget to update base values** when modulated parameters change

## Related Documentation

- [Architecture Overview](/merged-app/docs/developer/architecture.md) - System design and component interaction
- [Footguns & Common Mistakes](/merged-app/docs/developer/footguns.md) - Critical anti-patterns to avoid
- [Bæng Parameters Reference](/merged-app/docs/reference/baeng-parameters.md) - Complete Bæng parameter listing
- [Ræmbl Parameters Reference](/merged-app/docs/reference/raembl-parameters.md) - Complete Ræmbl parameter listing

## Code Locations

### Shared State
- `/merged-app/js/state.js` - State proxy system and shared container
- `/merged-app/js/shared/clock.js` - Shared clock functions (setBPM, setSwing, etc.)

### Bæng State
- `/merged-app/js/baeng/state.js` - Bæng state object and parameter definitions
- `/merged-app/js/baeng/utils/parameterUpdater.js` - updateParameterById() implementation

### Ræmbl State
- `/merged-app/js/raembl/state.js` - Ræmbl state object and parameter definitions
- `/merged-app/js/raembl/ui/faderState.js` - updateParameterById() and updateFaderState() implementation
