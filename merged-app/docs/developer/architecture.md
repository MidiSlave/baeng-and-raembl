# System Architecture

**Bæng & Ræmbl Merged Synthesiser Suite**

---

## Overview

Bæng & Ræmbl is a unified web application combining two independent synthesisers:

- **Bæng** — 6-voice drum machine with multiple synthesis engines (DX7 FM, Analog, Sampler)
- **Ræmbl** — Monophonic/polyphonic synthesiser with multiple engines (Subtractive, Plaits, Rings)

Both applications run synchronously within a single browser window, sharing a unified clock system and AudioContext whilst maintaining separate audio routing and state management.

### Core Architecture Principles

1. **Synchronised Timing** — Shared clock controls tempo, swing, and transport for both apps
2. **Separate Audio Routing** — Each app maintains independent effects chains and master outputs
3. **Namespace Separation** — Strict naming conventions prevent conflicts (`baengState`, `raemblState`, `sharedState`)
4. **Event-Driven Communication** — Apps communicate via custom DOM events
5. **Modular Design** — Clear separation between audio engine, UI, and state management

---

## Project Structure

```
merged-app/
├── index.html                      # Single-page application entry point
│
├── css/                            # Stylesheets
│   ├── shared-base.css             # Shared layout and typography
│   ├── baeng.css                   # Bæng-specific styles
│   ├── raembl.css                  # Ræmbl-specific styles
│   ├── ppmod-modal.css             # Per-parameter modulation modal
│   ├── settings-tabs.css           # Settings panel tabs
│   └── components/                 # Reusable UI components
│       ├── led-ring-knob.css       # LED ring knob (Bæng)
│       ├── slide-pot.css           # Slide potentiometer (Ræmbl)
│       ├── mini-fader.css          # Mini fader component
│       └── time-strip.css          # Unified time strip (BPM/Swing/Length)
│
├── js/                             # JavaScript modules
│   ├── state.js                    # Shared state management (proxies)
│   │
│   ├── shared/                     # Shared modules
│   │   ├── audio.js                # Shared AudioContext & final limiter
│   │   ├── clock.js                # 100ms lookahead scheduler (Bæng-based)
│   │   ├── modulation-utils.js     # PPMod utilities (LFSR, envelopes, etc.)
│   │   ├── ppmod-modal.js          # PPMod modal UI
│   │   ├── time-strip/             # Unified time controls
│   │   ├── settings-tabs.js        # Settings panel
│   │   └── components/             # Shared UI components
│   │       ├── MiniFader.js
│   │       └── index.js
│   │
│   ├── baeng/                      # Bæng drum machine
│   │   ├── main.js                 # Entry point
│   │   ├── state.js                # Bæng state management
│   │   ├── audio.js                # Bæng audio initialisation
│   │   ├── baengClock.js           # Clock subscriber
│   │   ├── config.js               # Configuration constants
│   │   ├── history.js              # Undo/redo history
│   │   ├── utils.js                # Utility functions
│   │   │
│   │   ├── modules/                # Feature modules
│   │   │   ├── engine.js           # Voice management & synthesis
│   │   │   ├── sequence.js         # Step sequencer
│   │   │   ├── euclidean.js        # Euclidean pattern generator
│   │   │   ├── perParamMod.js      # Per-parameter modulation
│   │   │   ├── clouds.js           # Clouds FX engine UI
│   │   │   ├── dx7/                # DX7 FM synthesis
│   │   │   ├── sampler/            # Sample engine
│   │   │   ├── slice/              # Slice editor
│   │   │   └── browsers/           # Kit/sample/DX7 browsers
│   │   │
│   │   ├── ui/                     # UI components
│   │   │   └── ledRingKnobs.js     # LED ring knob controls
│   │   │
│   │   ├── components/             # React-like components
│   │   │   ├── index.js            # Module rendering
│   │   │   └── engine-dropdown.js  # Engine selector
│   │   │
│   │   └── processors/             # AudioWorklet processors
│   │       ├── analog-hihat-processor.js
│   │       └── sampler-processor.js
│   │
│   ├── raembl/                     # Ræmbl synthesiser
│   │   ├── main.js                 # Entry point
│   │   ├── state.js                # Ræmbl state management
│   │   ├── audio.js                # Ræmbl audio initialisation
│   │   ├── raemblClock.js          # Clock subscriber
│   │   ├── config.js               # Configuration constants
│   │   ├── history.js              # Undo/redo history
│   │   ├── utils.js                # Utility functions
│   │   │
│   │   ├── modules/                # Feature modules
│   │   │   ├── perParamMod.js      # Per-parameter modulation
│   │   │   ├── clouds.js           # Clouds FX engine UI
│   │   │   ├── engine-selector.js  # Engine type selector
│   │   │   ├── factors.js          # Euclidean pattern generator
│   │   │   ├── path.js             # Pitch sequencer
│   │   │   ├── lfo.js              # LFO visualisation
│   │   │   ├── reverb.js           # Reverb UI
│   │   │   └── delay.js            # Delay UI
│   │   │
│   │   ├── ui/                     # UI components
│   │   │   ├── faders.js           # Fader controls
│   │   │   └── miniFaders.js       # Mini fader controls
│   │   │
│   │   └── components/             # React-like components
│   │       └── index.js            # Module rendering
│   │
│   └── audio/worklets/             # Shared AudioWorklet processors
│       ├── raembl-voice-processor.js       # Ræmbl subtractive synth (8 voices)
│       ├── plaits-processor.js             # Mutable Instruments Plaits (24 engines)
│       ├── rings-processor.js              # Mutable Instruments Rings (6 models)
│       ├── clouds-processor.js             # Mutable Instruments Clouds (6 modes)
│       ├── drum-bus-processor.js           # Ableton-style drum bus
│       └── clouds/                         # Clouds engine components
│           ├── core/                       # Core DSP (filters, FFT, buffers)
│           └── dsp/                        # Playback modes (granular, WSOLA, spectral)
│
├── samples/                        # Factory sample kits
│   ├── kit-manifest.json           # Sample library index
│   └── [kit-name]/                 # Sample kits
│
├── assets/                         # Static assets
│   └── icons/                      # SVG icons for UI
│
├── docs/                           # Documentation
│   ├── developer/                  # Developer documentation
│   ├── user-guide/                 # User guides
│   ├── engines/                    # Engine documentation
│   ├── effects/                    # Effects documentation
│   ├── modulation/                 # Modulation documentation
│   └── reference/                  # Parameter reference
│
└── tests/                          # Isolated component tests
    ├── rings-test/                 # Rings synthesis test harness
    ├── plaits-test/                # Plaits synthesis test harness
    ├── led-ring-test/              # LED ring knob test
    └── slide-pot-test/             # Slide potentiometer test
```

---

## State Management

### Three-Tier State Architecture

The application uses a three-tier state system with namespace separation:

```javascript
// Shared timing state (synchronised between apps)
sharedState = {
    isPlaying: false,
    bpm: 120,
    swing: 0,
    baengBarLength: 4,
    raemblBarLength: 4,
    stepCounter: -1,
    barCounter: 0,
    // ... timing-related properties
}

// Bæng-specific state
baengState = {
    voices: [/* 6 drum voices */],
    sequence: [/* step data */],
    euclidean: {/* pattern settings */},
    modulations: {/* PPMod configs */},
    drumBus: {/* master processing */},
    // ... not proxied to sharedState
}

// Ræmbl-specific state
raemblState = {
    filter: {/* filter parameters */},
    envelope: {/* ADSR settings */},
    lfo: {/* LFO settings */},
    factors: {/* Euclidean pattern */},
    path: {/* pitch sequencer */},
    modulations: {/* PPMod configs */},
    // ... not proxied to sharedState
}
```

### State Proxies

Individual app states are proxied to share timing properties automatically:

```javascript
// From js/state.js
export function createStateProxy(appState, sharedState) {
    return new Proxy(appState, {
        get(target, prop) {
            if (SHARED_TIMING_PROPS.includes(prop)) {
                return sharedState[prop];  // Read from shared
            }
            return target[prop];
        },
        set(target, prop, value) {
            if (SHARED_TIMING_PROPS.includes(prop)) {
                sharedState[prop] = value;  // Write to shared
                return true;
            }
            target[prop] = value;
            return true;
        }
    });
}

// Apps register their state on initialisation
baengState = createStateProxy(baengLocalState, sharedState);
raemblState = createStateProxy(raemblLocalState, sharedState);
```

### Parameter Access Patterns

**Read parameter values:**

```javascript
// From app-specific modules
import { getParameterValue } from './state.js';

const resonance = getParameterValue('filter', 'resonance');  // App-specific
const bpm = getParameterValue('bpm');                         // Shared timing
```

**Update parameter values (with UI sync):**

```javascript
// From UI event handlers
import { updateParameterById } from './ui/faderUtils.js';

// Updates state + audio + visualisation
updateParameterById('filter-cutoff', newValue);
```

---

## Audio Architecture

### Signal Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    Shared AudioContext                       │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┴──────────────────┐
        │                                     │
   ┌────▼────┐                          ┌────▼────┐
   │  Bæng   │                          │ Ræmbl   │
   │ Master  │                          │ Master  │
   │ (-3dB)  │                          │ (-3dB)  │
   └────┬────┘                          └────┬────┘
        │                                     │
   ┌────▼─────────────┐                 ┌────▼─────────────┐
   │ Drum Bus         │                 │ Engine Output    │
   │ (Drive/Crunch/   │                 │ (Subtractive/    │
   │  Transients/     │                 │  Plaits/Rings)   │
   │  Boom/Comp)      │                 │                  │
   └────┬─────────────┘                 └────┬─────────────┘
        │                                     │
   ┌────▼─────────────┐                 ┌────▼─────────────┐
   │ Voice Mix        │                 │ Voice Pool       │
   │ (6 voices)       │                 │ (8 voices)       │
   └────┬─────────────┘                 └────┬─────────────┘
        │                                     │
   ┌────▼─────────────┐                 ┌────▼─────────────┐
   │ Per-Voice FX     │                 │ Filter + Env     │
   │ • Clouds Send    │                 │ • Cutoff         │
   │ • Reverb Send    │                 │ • Resonance      │
   │ • Delay Send     │                 │ • ADSR           │
   └────┬─────────────┘                 └────┬─────────────┘
        │                                     │
   ┌────▼─────────────┐                 ┌────▼─────────────┐
   │ Engines          │                 │ Clouds FX        │
   │ • DX7 (6-op FM)  │                 │ (Serial Insert)  │
   │ • Analog         │                 │                  │
   │ • SLICE/SMPL     │                 │                  │
   └──────────────────┘                 └────┬─────────────┘
                                              │
                                         ┌────▼─────────────┐
                                         │ Reverb/Delay     │
                                         │ (Legacy FX)      │
                                         └──────────────────┘
        │                                     │
        └──────────────────┬──────────────────┘
                           │
                    ┌──────▼──────┐
                    │ Final       │
                    │ Limiter     │
                    │ (-0.1dB)    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Destination │
                    └─────────────┘
```

### Shared AudioContext

Both apps use a single `AudioContext` to ensure sample-accurate synchronisation:

```javascript
// From js/shared/audio.js
export const sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();

// Bæng audio initialisation
import { sharedAudioContext } from '../shared/audio.js';
audioContext = sharedAudioContext;

// Ræmbl audio initialisation
import { sharedAudioContext } from '../shared/audio.js';
audioContext = sharedAudioContext;
```

### Master Gain Chains

Each app maintains an independent master gain node at -3dB for headroom:

```javascript
// Bæng master (js/baeng/audio.js)
masterGain = audioContext.createGain();
masterGain.gain.value = 0.707;  // -3dB
connectToFinalLimiter(masterGain);

// Ræmbl master (js/raembl/audio.js)
masterGain = audioContext.createGain();
masterGain.gain.value = 0.707;  // -3dB
connectToFinalLimiter(masterGain);
```

### AudioWorklet Voice Pool Pattern

Ræmbl uses a **pre-allocated voice pool** to eliminate node creation overhead during polyphonic playback:

```javascript
// From js/raembl/audio.js
const VOICE_COUNT = 8;
const voicePool = [];

// Pre-allocate 8 voices at initialisation
for (let i = 0; i < VOICE_COUNT; i++) {
    const node = new AudioWorkletNode(audioContext, 'raembl-voice-processor', {
        processorOptions: { voiceIndex: i }
    });

    // Connect to reverb/delay sends + master
    node.connect(reverbSend);
    node.connect(delaySend);
    node.connect(masterGain);

    voicePool.push({
        node,
        active: false,      // Currently playing?
        releasing: false,   // In release phase?
        note: null         // MIDI note number
    });
}

// Voice allocation (skip releasing voices to prevent cutoff)
function allocateVoice(note) {
    const voice = voicePool.find(v => !v.active && !v.releasing);
    if (!voice) {
        // Voice stealing: find least important active voice
        return stealVoice(note);
    }
    voice.active = true;
    voice.note = note;
    return voice;
}

// Voice release (schedule cleanup after envelope)
function releaseVoice(voice, releaseTime) {
    voice.active = false;
    voice.releasing = true;
    setTimeout(() => {
        voice.releasing = false;
        voice.note = null;
    }, releaseTime * 1000);
}
```

**Benefits:**
- Zero node creation overhead during playback
- Prevents envelope cutoff (never steal releasing voices)
- Eliminates poly mode dropouts (40+ nodes → 1 processor)
- Hard 8-voice polyphony limit (acceptable trade-off)

---

## Clock System

### Shared Clock Architecture

The clock is based on Bæng's original 100ms lookahead scheduler, adapted for use by both apps:

```javascript
// From js/shared/clock.js

const LOOKAHEAD_TIME = 0.1;    // 100ms lookahead
const SCHEDULER_INTERVAL = 25;  // 25ms polling rate

function scheduler() {
    const currentTime = sharedAudioContext.currentTime;

    // Schedule all steps within lookahead window
    while (nextStepTime < currentTime + LOOKAHEAD_TIME) {
        scheduleStep(nextStepTime);
        nextStepTime += calculateStepDuration();
    }
}

function scheduleStep(time) {
    // Broadcast to subscribers
    broadcast({
        type: 'step',
        time: time,
        stepIndex: sharedState.stepCounter,
        barIndex: sharedState.barCounter
    });

    sharedState.stepCounter++;
}
```

### Clock Subscribers

Each app subscribes to clock events:

```javascript
// Bæng clock subscriber (js/baeng/baengClock.js)
import { subscribe } from '../shared/clock.js';

subscribe((event) => {
    if (event.type === 'step') {
        // Schedule Bæng voices at 2× tempo
        if (shouldPlayBaengStep(event.stepIndex)) {
            scheduleVoices(event.time);
        }
    }
});

// Ræmbl clock subscriber (js/raembl/raemblClock.js)
import { subscribe } from '../shared/clock.js';

subscribe((event) => {
    if (event.type === 'step') {
        // Schedule Ræmbl notes at 1× tempo
        if (shouldPlayRaemblStep(event.stepIndex)) {
            scheduleNote(event.time);
        }
    }
});
```

### Tempo Multipliers

Apps can run at different tempo multipliers:

```javascript
sharedState.baengTempoMultiplier = 2.0;   // Bæng plays at 2× speed
sharedState.raemblTempoMultiplier = 1.0;  // Ræmbl plays at base tempo
```

---

## Namespacing Conventions

### DOM Element IDs

Prefix all IDs with app namespace to prevent conflicts:

```html
<!-- Bæng elements -->
<div id="baeng-reverb-module">
<button id="baeng-play-button">
<input id="baeng-voice-0-level">

<!-- Ræmbl elements -->
<div id="raembl-filter-module">
<button id="raembl-play-button">
<input id="raembl-lfo-rate">

<!-- Shared elements -->
<div id="shared-time-strip">
<button id="shared-play-button">
<input id="shared-bpm-input">
```

### CSS Classes

Scope app-specific styles with parent classes:

```css
/* Bæng styles */
.baeng-app .module {
    background: var(--baeng-module-bg);
}

.baeng-app .led-ring-knob {
    /* Bæng-specific knob styling */
}

/* Ræmbl styles */
.raembl-app .module {
    background: var(--raembl-module-bg);
}

.raembl-app .slide-pot {
    /* Ræmbl-specific fader styling */
}

/* Shared styles */
.time-strip {
    /* Shared time strip styling */
}
```

### Custom Events

Event names follow `{namespace}{EventName}` camelCase pattern:

```javascript
// Bæng events
document.dispatchEvent(new CustomEvent('baengStepAdvanced', {
    detail: { stepIndex: 0, voiceIndex: 3 }
}));

document.dispatchEvent(new CustomEvent('baengVoiceTriggered', {
    detail: { voiceIndex: 2, velocity: 127 }
}));

// Ræmbl events
document.dispatchEvent(new CustomEvent('raemblNoteOn', {
    detail: { note: 60, velocity: 100 }
}));

document.dispatchEvent(new CustomEvent('raemblNoteOff', {
    detail: { note: 60 }
}));

// Shared clock events
document.dispatchEvent(new CustomEvent('clockTick', {
    detail: { stepIndex: 0, time: 0.123 }
}));
```

### Console Logging

Prefix console messages with namespace for debugging:

```javascript
// Bæng
console.log('[Bæng] Initialising audio engine');
console.warn('[Bæng] Engine module not found for voice 3');
console.error('[Bæng] Failed to load DX7 patch:', error);

// Ræmbl
console.log('[Ræmbl] Voice pool initialised (8 voices)');
console.warn('[Ræmbl] Voice stealing: stealability score low');
console.error('[Ræmbl] Failed to connect Plaits processor:', error);

// Shared
console.log('[SharedClock] Started at BPM 120');
console.warn('[SharedClock] Subscriber callback error:', error);
```

---

## Module Organisation

### Entry Points

Each app has a dedicated entry point that initialises its subsystems:

**Bæng (`js/baeng/main.js`):**
```javascript
import { state } from './state.js';
import { initAudio } from './audio.js';
import { initClock } from '../shared/clock.js';
import { initBaengClock } from './baengClock.js';
import { initEngine } from './modules/engine.js';
import { initSequence } from './modules/sequence.js';
// ... other modules

async function init() {
    await initAudio();
    initClock();
    initBaengClock();
    initEngine();
    initSequence();
    // ... initialise other modules
}
```

**Ræmbl (`js/raembl/main.js`):**
```javascript
import { state } from './state.js';
import { initAudio } from './audio.js';
import { initClock } from '../shared/clock.js';
import { initRaemblClock } from './raemblClock.js';
import { initPath } from './modules/path.js';
import { initFactors } from './modules/factors.js';
// ... other modules

async function init() {
    await initAudio();
    initClock();
    initRaemblClock();
    initPath();
    initFactors();
    // ... initialise other modules
}
```

### Module Categories

**Bæng Modules:**
- **Engine** (`modules/engine.js`) — Voice management, synthesis, Drum Bus
- **Sequence** (`modules/sequence.js`) — 16-step sequencer per voice
- **Euclidean** (`modules/euclidean.js`) — Euclidean pattern generator
- **PerParamMod** (`modules/perParamMod.js`) — Per-parameter modulation (6 modes)
- **Clouds** (`modules/clouds.js`) — Clouds FX engine UI
- **DX7** (`modules/dx7/`) — 6-operator FM synthesis
- **Sampler** (`modules/sampler/`) — Sample playback (SLICE/SMPL modes)
- **Browsers** (`modules/browsers/`) — Kit/sample/DX7 patch browsers

**Ræmbl Modules:**
- **Path** (`modules/path.js`) — Pitch sequencer (16-step CV)
- **Factors** (`modules/factors.js`) — Euclidean pattern generator
- **LFO** (`modules/lfo.js`) — Main LFO visualisation
- **PerParamMod** (`modules/perParamMod.js`) — Per-parameter modulation (6 modes)
- **Clouds** (`modules/clouds.js`) — Clouds FX engine UI
- **Engine Selector** (`modules/engine-selector.js`) — SUB/PLT/RNG engine toggle
- **Reverb/Delay** (`modules/reverb.js`, `modules/delay.js`) — Legacy effects UI

**Shared Modules:**
- **Clock** (`shared/clock.js`) — 100ms lookahead scheduler
- **Audio** (`shared/audio.js`) — AudioContext management
- **Modulation Utils** (`shared/modulation-utils.js`) — LFSR, envelope curves, pattern storage
- **PPMod Modal** (`shared/ppmod-modal.js`) — Per-parameter modulation UI
- **Time Strip** (`shared/time-strip/`) — Unified BPM/Swing/Length controls

---

## Key Files Reference

| File Path | Purpose |
|-----------|---------|
| **Shared** | |
| `js/state.js` | Shared state management with proxies |
| `js/shared/audio.js` | Shared AudioContext and final limiter |
| `js/shared/clock.js` | 100ms lookahead scheduler (pub/sub) |
| `js/shared/modulation-utils.js` | PPMod utilities (LFSR, envelopes, S&H) |
| `js/shared/ppmod-modal.js` | PPMod modal UI component |
| `js/shared/time-strip/index.js` | Unified time controls |
| **Bæng** | |
| `js/baeng/main.js` | Bæng entry point |
| `js/baeng/state.js` | Bæng state management |
| `js/baeng/audio.js` | Bæng audio initialisation |
| `js/baeng/baengClock.js` | Bæng clock subscriber |
| `js/baeng/modules/engine.js` | Voice management & synthesis |
| `js/baeng/modules/sequence.js` | Step sequencer |
| `js/baeng/modules/euclidean.js` | Euclidean pattern generator |
| `js/baeng/modules/perParamMod.js` | Per-parameter modulation (Bæng) |
| `js/baeng/modules/dx7/synth.js` | DX7 FM synthesis engine |
| `js/baeng/modules/sampler/sampler-engine.js` | Sample playback engine |
| **Ræmbl** | |
| `js/raembl/main.js` | Ræmbl entry point |
| `js/raembl/state.js` | Ræmbl state management |
| `js/raembl/audio.js` | Ræmbl audio initialisation (voice pool) |
| `js/raembl/raemblClock.js` | Ræmbl clock subscriber |
| `js/raembl/modules/perParamMod.js` | Per-parameter modulation (Ræmbl) |
| `js/raembl/modules/path.js` | Pitch sequencer |
| `js/raembl/modules/factors.js` | Euclidean pattern generator |
| `js/raembl/modules/engine-selector.js` | Engine type selector (SUB/PLT/RNG) |
| **AudioWorklet Processors** | |
| `js/audio/worklets/raembl-voice-processor.js` | Subtractive synth (8 voices, PolyBLEP) |
| `js/audio/worklets/plaits-processor.js` | Mutable Instruments Plaits (24 engines) |
| `js/audio/worklets/rings-processor.js` | Mutable Instruments Rings (6 models) |
| `js/audio/worklets/clouds-processor.js` | Mutable Instruments Clouds (6 modes) |
| `js/audio/worklets/drum-bus-processor.js` | Ableton-style drum bus processor |
| **UI Components** | |
| `js/baeng/ui/ledRingKnobs.js` | LED ring knob controls (Bæng) |
| `js/raembl/ui/faders.js` | Fader controls (Ræmbl) |
| `js/shared/components/MiniFader.js` | Mini fader component |
| **CSS** | |
| `css/shared-base.css` | Shared layout and typography |
| `css/baeng.css` | Bæng-specific styles |
| `css/raembl.css` | Ræmbl-specific styles |
| `css/ppmod-modal.css` | PPMod modal styles |
| `css/components/led-ring-knob.css` | LED ring knob styles |
| `css/components/slide-pot.css` | Slide potentiometer styles |

---

## Build & Development

### No Build Step Required

The application uses native ES modules loaded directly in the browser:

```html
<!-- index.html -->
<script type="module" src="js/baeng/main.js"></script>
<script type="module" src="js/raembl/main.js"></script>
```

**Advantages:**
- Instant reloads during development
- No transpilation or bundling required
- Simpler debugging (source maps not needed)

**Disadvantages:**
- More HTTP requests (mitigated by HTTP/2)
- No tree-shaking or minification
- Requires modern browser with ES module support

### Cache Busting

AudioWorklet modules are cache-busted during development:

```javascript
// During development
await audioContext.audioWorklet.addModule(
    `js/audio/worklets/raembl-voice-processor.js?v=${Date.now()}`
);

// In production (comment out cache-bust parameter)
await audioContext.audioWorklet.addModule(
    'js/audio/worklets/raembl-voice-processor.js'
);
```

### Development Server

Use any static file server. Examples:

```bash
# Python 3
python3 -m http.server 8000

# Node.js (http-server)
npx http-server -p 8000

# PHP
php -S localhost:8000
```

Navigate to `http://localhost:8000/merged-app/index.html`

### Browser Compatibility

**Minimum Requirements:**
- ES6 modules support
- Web Audio API
- AudioWorklet API (not ScriptProcessor)
- CSS Grid and Flexbox
- `requestAnimationFrame`

**Tested Browsers:**
- Chrome 91+ (recommended)
- Edge 91+
- Safari 14.1+
- Firefox 89+ (limited testing)

---

## Critical Design Patterns

### AudioWorklet Golden Rule

**Never perform expensive operations per-sample in AudioWorklet:**

```javascript
// ❌ WRONG: Math.exp() 48,000 times/second
process(inputs, outputs) {
    for (let i = 0; i < outputs[0][0].length; i++) {
        frequency = baseFreq * Math.exp(lfoValue);  // CPU death
    }
}

// ✅ CORRECT: Use AudioParam automation from main thread
// Main thread:
workletNode.parameters.get('frequency')
    .exponentialRampToValueAtTime(targetFreq, time);
```

**Allowed in AudioWorklet:**
- Simple arithmetic (`+`, `-`, `*`, `/`)
- Array access, loops
- Infrequent `Math.sin()`, `Math.cos()` (e.g., LFO once per buffer)

**Forbidden:**
- `Math.exp()`, `Math.pow()`, `Math.log()` per sample
- String operations
- Object allocation
- DOM access

### Voice Pool Release Tracking

**Never steal voices in release phase:**

```javascript
// ❌ WRONG: Cuts off decay
const voice = voicePool.find(v => !v.active);

// ✅ CORRECT: Skip releasing voices
const voice = voicePool.find(v => !v.active && !v.releasing);
```

Voices in release phase still produce audio. Stealing them creates glitches.

### Module Re-Rendering

**Always remove old module before re-rendering:**

```javascript
// ❌ WRONG: Event listeners duplicated
moduleContainer.innerHTML = newHTML;

// ✅ CORRECT: Remove old module, re-attach listeners
const oldModule = document.getElementById('module-id');
oldModule?.remove();
moduleContainer.insertAdjacentHTML('beforebegin', newHTML);
setupEventListeners();  // Re-attach listeners!
```

### K-Rate Modulation (Not Audio-Rate)

PPMod uses **k-rate updates** (30 FPS) from main thread:

```javascript
// ✅ CORRECT: K-rate modulation
requestAnimationFrame(() => {
    const modValue = calculateModValue(mod, now);
    audioParam.setValueAtTime(modValue, now);
});
```

**Rationale:** Human perception of modulation changes is ~50ms. Audio-rate (48kHz) would add complexity with zero perceptual benefit. Measured CPU usage: <1% for all PPMod modes.

---

## Patch Format

### Unified Patch Format v1.2.0

Patches store both apps' settings plus shared timing:

```json
{
    "version": "1.2.0",
    "timestamp": "2025-12-30T12:34:56.789Z",

    "sharedTiming": {
        "bpm": 120,
        "swing": 0,
        "baengBarLength": 4,
        "raemblBarLength": 4
    },

    "baeng": {
        "voices": [
            {
                "engineType": "DX7",
                "level": 0.8,
                "pan": 0.5,
                "sequence": [/* 16 steps */],
                "euclidean": {/* pattern */},
                "modulations": {
                    "voice.level": {
                        "mode": "LFO",
                        "depth": 0.5,
                        "waveform": 0,
                        "rate": 2.0
                    }
                }
            }
            // ... 5 more voices
        ],
        "drumBus": {/* master processing */},
        "clouds": {/* Clouds FX settings */}
    },

    "raembl": {
        "engineType": "SUB",  // SUB | PLT | RNG
        "filter": {/* cutoff, resonance */},
        "envelope": {/* ADSR */},
        "lfo": {/* LFO settings */},
        "factors": {/* Euclidean pattern */},
        "path": {/* pitch sequence */},
        "modulations": {
            "filter.cutoff": {
                "mode": "ENV",
                "depth": 0.8,
                "envAttackMs": 50,
                "envReleaseMs": 200
            }
        },
        "clouds": {/* Clouds FX settings */}
    }
}
```

**Version History:**
- **v1.0.0** — Initial unified format (separate apps merged)
- **v1.1.0** — Added per-parameter modulation support
- **v1.2.0** — Added engine type selection (Plaits/Rings integration)

**Backward Compatibility:** v1.0.0 patches load without modulation. Forward compatibility: v1.2.0 patches in old apps fall back to default engine.

---

## Related Documentation

- [Getting Started Guide](../user-guide/getting-started.md) — User onboarding
- [Bæng User Guide](../user-guide/baeng-guide.md) — Drum machine features
- [Ræmbl User Guide](../user-guide/raembl-guide.md) — Synthesiser features
- [PPMod Modes](../modulation/ppmod-modes.md) — Per-parameter modulation reference
- [Clouds FX Engine](../effects/clouds.md) — Granular/spectral processing
- [Bæng Parameters](../reference/baeng-parameters.md) — Complete parameter reference
- [Ræmbl Parameters](../reference/raembl-parameters.md) — Complete parameter reference

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-30
**Author:** Claude Opus 4.5 (MidiSlave)
