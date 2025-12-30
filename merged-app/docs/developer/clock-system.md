# Clock System

**Bæng & Ræmbl Merged Synthesiser Suite**

---

## Overview

The clock system is the timing foundation of Bæng & Ræmbl, providing synchronised playback for both applications through a shared, audio-thread-precise scheduler. Based on Bæng's original 100ms lookahead scheduler, it ensures sample-accurate timing whilst allowing independent pattern lengths and tempo multipliers per app.

### Key Characteristics

- **Audio-thread precision** — Events scheduled using `AudioContext.currentTime` for sample-accurate timing
- **100ms lookahead** — Schedules events in advance to prevent timing jitter from main-thread blocking
- **Publish/subscribe architecture** — Apps subscribe to clock events without tight coupling
- **Polymetric support** — Independent bar lengths for Bæng and Ræmbl (4-128 beats)
- **Shared AudioContext** — Single `AudioContext` ensures zero drift between apps

### Location

**Primary implementation:** `/merged-app/js/shared/clock.js`

**Subscribers:**
- `/merged-app/js/baeng/baengClock.js`
- `/merged-app/js/raembl/raemblClock.js`

**UI integration:** `/merged-app/js/shared/time-strip/index.js`

---

## 100ms Lookahead Scheduler

### Architecture

The scheduler runs on the main JavaScript thread but schedules events **ahead of time** on the audio thread timeline. This prevents jitter caused by garbage collection, UI rendering, or other main-thread tasks.

```javascript
// From js/shared/clock.js

const LOOKAHEAD_TIME = 0.1;    // 100ms lookahead window
const SCHEDULER_INTERVAL = 25;  // Poll every 25ms

let schedulerInterval = null;
let nextStepTime = 0;

function scheduler() {
    const currentTime = sharedAudioContext.currentTime;
    const msPerBeat = 60000 / sharedState.bpm;
    const msPerStep = msPerBeat / sharedState.stepsPerBeat;
    const stepDuration = msPerStep / 1000; // Convert to seconds

    // Schedule all steps within lookahead window
    while (nextStepTime < currentTime + LOOKAHEAD_TIME) {
        sharedState.stepCounter++;

        // Calculate swing offset (off-beats delayed)
        const isOffBeat = (sharedState.stepCounter % 2) === 1;
        const swingRatio = sharedState.swing / 100;
        const swingOffset = isOffBeat ? (stepDuration / 2) * swingRatio : 0;

        // ... polymetric position calculations (see Polymetric Support)

        // Broadcast step event to subscribers
        broadcast({
            type: 'step',
            audioTime: nextStepTime + swingOffset,
            baeng: { /* Bæng-specific position */ },
            raembl: { /* Ræmbl-specific position */ },
            stepIndex: baengStepInBar,  // Legacy
            isBarStart: baengIsBarStart, // Legacy
            stepCounter: sharedState.stepCounter,
            barCounter: sharedState.barCounter
        });

        // Advance time WITHOUT swing drift
        // (swing only affects trigger timing, not step advancement)
        nextStepTime += stepDuration;
    }
}
```

### Why 100ms?

**Too short (<50ms):**
- Main-thread scheduler may miss steps during CPU spikes
- Increased overhead from frequent polling

**Too long (>200ms):**
- Parameter changes feel sluggish
- Increased latency when starting playback

**100ms sweet spot:**
- Sufficient buffer for worst-case main-thread blocking
- Low perceived latency (<1/10th second)
- Proven stable in Bæng's original implementation

### Polling Rate (25ms)

The scheduler polls 4× faster than the lookahead window, ensuring steps are never missed:

```
Lookahead: 100ms
Poll rate: 25ms
Safety margin: 75ms (3 missed polls before failure)
```

---

## Clock Events

### Event Types

The clock broadcasts events via a publish/subscribe system:

| Event Type | Trigger | Payload |
|------------|---------|---------|
| `play` | Transport started | `{ type: 'play' }` |
| `stop` | Transport stopped | `{ type: 'stop' }` |
| `step` | Each sequencer step | `{ type: 'step', audioTime, baeng: {...}, raembl: {...}, ... }` |
| `bpmChange` | BPM parameter changed | `{ type: 'bpmChange', bpm: 120 }` |
| `swingChange` | Swing parameter changed | `{ type: 'swingChange', swing: 50 }` |
| `baengBarLengthChange` | Bæng bar length changed | `{ type: 'baengBarLengthChange', barLength: 4 }` |
| `raemblBarLengthChange` | Ræmbl bar length changed | `{ type: 'raemblBarLengthChange', barLength: 8 }` |

### Step Event Structure

The `step` event contains position data for both apps (polymetric support):

```javascript
{
    type: 'step',
    audioTime: 1.234567,           // AudioContext time for scheduling

    // Bæng-specific position
    baeng: {
        stepIndex: 0,               // Step within bar (0-63 for 16-beat bar)
        isBarStart: true,           // Is this the first step of the bar?
        bar: 1,                     // Bar number (1-indexed)
        beat: 1,                    // Beat number (1-indexed)
        subStep: 1                  // Sub-step within beat (1-4 for 16ths)
    },

    // Ræmbl-specific position
    raembl: {
        stepIndex: 0,               // Step within bar (may differ from Bæng)
        isBarStart: true,
        bar: 1,
        beat: 1,
        subStep: 1
    },

    // Legacy fields (for backwards compatibility)
    stepIndex: 0,                   // Uses Bæng's stepIndex
    isBarStart: true,               // Uses Bæng's bar boundary
    stepCounter: 0,                 // Global step counter
    barCounter: 0                   // Global bar counter (Bæng's bars)
}
```

---

## Timing Parameters

### BPM (Beats Per Minute)

**Range:** 20-300 BPM
**Default:** 120 BPM
**Resolution:** Integer BPM values (no fractional BPM)

```javascript
import { setBPM } from './shared/clock.js';

// Set BPM (clamped to range, broadcasts bpmChange event)
setBPM(140);
```

**Step duration calculation:**

```javascript
const msPerBeat = 60000 / bpm;
const msPerStep = msPerBeat / stepsPerBeat;  // stepsPerBeat = 4 (16th notes)
```

**Examples:**
- 120 BPM → 500ms per beat → 125ms per 16th note
- 140 BPM → 428.6ms per beat → 107.1ms per 16th note
- 90 BPM → 666.7ms per beat → 166.7ms per 16th note

### Swing

**Range:** 0-100%
**Default:** 0% (straight timing)
**Resolution:** Integer percentage

```javascript
import { setSwing } from './shared/clock.js';

// Set swing (0 = straight, 100 = maximum shuffle)
setSwing(60);
```

**Swing implementation:**

Swing delays **off-beat steps** (odd-numbered steps) by a percentage of half the step duration:

```javascript
const isOffBeat = (stepCounter % 2) === 1;
const swingRatio = swing / 100;
const swingOffset = isOffBeat ? (stepDuration / 2) * swingRatio : 0;

const scheduledTime = nextStepTime + swingOffset;
```

**Example at 120 BPM (125ms per step):**
- 0% swing: Steps at 0ms, 125ms, 250ms, 375ms...
- 50% swing: Steps at 0ms, 156.25ms, 250ms, 406.25ms... (off-beats +31.25ms)
- 100% swing: Steps at 0ms, 187.5ms, 250ms, 437.5ms... (off-beats +62.5ms)

**Critical:** Swing offset is **added to trigger time only**, not to `nextStepTime`. This prevents swing drift:

```javascript
// ✅ CORRECT: Swing affects trigger time, not step advancement
broadcast({ audioTime: nextStepTime + swingOffset });
nextStepTime += stepDuration;  // No swing applied here

// ❌ WRONG: Causes cumulative drift
nextStepTime += stepDuration + swingOffset;  // Drift accumulates!
```

### Bar Length (Polymetric)

**Range:** 1-128 beats
**Default:** 4 beats (1 bar)
**Independent per app:** Bæng and Ræmbl can have different bar lengths

```javascript
import { setBaengBarLength, setRaemblBarLength } from './shared/clock.js';

// Set Bæng to 4 beats, Ræmbl to 7 beats (polymetric)
setBaengBarLength(4);
setRaemblBarLength(7);
```

**Polymetric support:**

Each app maintains its own bar boundaries:

```javascript
const baengStepsInBar = stepsPerBeat * sharedState.baengBarLength;
const raemblStepsInBar = stepsPerBeat * sharedState.raemblBarLength;

const baengStepInBar = sharedState.stepCounter % baengStepsInBar;
const raemblStepInBar = sharedState.stepCounter % raemblStepsInBar;

const baengIsBarStart = (baengStepInBar === 0);
const raemblIsBarStart = (raemblStepInBar === 0);
```

**Use case:** Create evolving polyrhythms by setting Bæng to 4 beats and Ræmbl to 7 beats. The pattern repeats every 28 beats (LCM of 4 and 7).

### Steps Per Beat

**Fixed at 4** (16th note resolution)
**Non-configurable** (hardcoded in `sharedState.stepsPerBeat`)

This gives 16 steps per 4-beat bar, matching standard drum machine resolution.

---

## Transport Control

### Play/Stop Toggle

```javascript
import { togglePlay } from './shared/clock.js';

// Toggle playback (starts if stopped, stops if playing)
togglePlay();
```

**Play behaviour:**

1. Resets counters:
   ```javascript
   sharedState.stepCounter = -1;
   sharedState.barCounter = 0;
   ```

2. Sets initial step time:
   ```javascript
   nextStepTime = sharedAudioContext.currentTime;
   ```

3. Starts polling:
   ```javascript
   schedulerInterval = setInterval(scheduler, SCHEDULER_INTERVAL);
   ```

4. Broadcasts `play` event to subscribers

**Stop behaviour:**

1. Clears polling interval:
   ```javascript
   clearInterval(schedulerInterval);
   schedulerInterval = null;
   ```

2. Broadcasts `stop` event to subscribers (apps use this to release voices, reset displays)

### UI Integration (Time Strip)

The time strip provides a unified transport control interface:

```javascript
// From js/shared/time-strip/index.js

import { togglePlay, setBPM, setSwing, setBaengBarLength, setRaemblBarLength, subscribe } from '../clock.js';

// Wire play button
const playBtn = document.getElementById('strip-play-btn');
playBtn.addEventListener('click', togglePlay);

// Wire parameter faders
initSimpleFaders({
    onBpmChange: (v) => setBPM(v),
    onSwingChange: (v) => setSwing(v),
    onBaengLengthChange: (v) => setBaengBarLength(Math.round(v)),
    onRaemblLengthChange: (v) => setRaemblBarLength(Math.round(v))
});

// Subscribe to clock for display updates
subscribe(updateTimeStripDisplay);
```

---

## Subscribing to Clock Events

### Basic Subscription

Apps use a publish/subscribe pattern to receive clock events:

```javascript
// From js/baeng/baengClock.js

import { subscribe } from '../shared/clock.js';

let unsubscribe = null;

export function initBaengClock() {
    unsubscribe = subscribe((event) => {
        try {
            handleClockEvent(event);
        } catch (error) {
            console.error('[BaengClock] Error in clock event handler:', error);
        }
    });
}

export function cleanupBaengClock() {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
}
```

**The `subscribe()` function returns an unsubscribe function** for cleanup.

### Event Handler Pattern

Handle different event types with a switch statement:

```javascript
function handleClockEvent(event) {
    switch (event.type) {
        case 'play':
            handlePlayEvent(event);
            break;
        case 'stop':
            handleStopEvent(event);
            break;
        case 'step':
            handleStepEvent(event);
            break;
        case 'bpmChange':
            handleBPMChange(event);
            break;
        case 'swingChange':
            handleSwingChange(event);
            break;
        case 'baengBarLengthChange':
            handleBaengBarLengthChange(event);
            break;
        case 'raemblBarLengthChange':
            // Ignore Ræmbl events in Bæng clock
            break;
        default:
            // Silently ignore unknown events
    }
}
```

### Handling Step Events

Step events provide the `audioTime` for sample-accurate scheduling:

```javascript
function handleStepEvent(event) {
    const { audioTime, baeng } = event;
    const { stepIndex, isBarStart } = baeng;

    // Check if this step should trigger
    const step = sequence.steps[stepIndex];
    if (step && step.gate) {
        // Probability check
        if (Math.random() * 100 <= step.probability) {
            // Schedule voice trigger at precise audio time
            triggerVoice(voiceIndex, audioTime);
        }
    }

    // Schedule UI update to sync with audio
    const currentTime = sharedAudioContext.currentTime;
    const delayMs = Math.max(0, (audioTime - currentTime) * 1000);

    setTimeout(() => {
        updateStepDisplay(stepIndex);
    }, delayMs);
}
```

**Critical:** Always use `event.audioTime` for audio scheduling, **not** `audioContext.currentTime`. The former is lookahead-adjusted for precise timing.

### Example: Bæng Clock Subscriber

Bæng's clock subscriber handles per-voice sequencing with choke groups:

```javascript
// From js/baeng/baengClock.js

function handleStepEvent(event) {
    const { audioTime, baeng } = event;
    const { stepIndex, isBarStart } = baeng;

    // Reset sequences on bar start if enabled
    if (isBarStart && state.resetSequenceOnBar) {
        for (let voiceIndex = 0; voiceIndex < state.sequences.length; voiceIndex++) {
            const seq = state.sequences[voiceIndex];
            seq.currentStep = seq.length > 0 ? seq.length - 1 : -1;
        }
    }

    // Collect potential triggers across all voices
    let potentialTriggers = [];

    for (let voiceIndex = 0; voiceIndex < state.sequences.length; voiceIndex++) {
        const sequence = state.sequences[voiceIndex];
        sequence.currentStep = (sequence.currentStep + 1) % sequence.length;

        const step = sequence.steps[sequence.currentStep];

        // Check gate, voice probability, step probability
        if (step && step.gate) {
            let shouldTrigger = true;

            if (sequence.probability < 100) {
                shouldTrigger = (Math.random() * 100 <= sequence.probability);
            }

            if (shouldTrigger && step.probability < 100) {
                shouldTrigger = (Math.random() * 100 <= step.probability);
            }

            if (shouldTrigger) {
                potentialTriggers.push({
                    voiceIndex,
                    step: step,
                    stepIndex: sequence.currentStep
                });
            }
        }
    }

    // Apply choke groups (only one voice per group triggers)
    const chokeGroupTriggers = {};
    const finalTriggers = [];

    for (const trigger of potentialTriggers) {
        const voice = state.voices[trigger.voiceIndex];
        const chokeGroup = voice.chokeGroup || 0;

        if (chokeGroup > 0) {
            if (!chokeGroupTriggers[chokeGroup]) {
                chokeGroupTriggers[chokeGroup] = trigger;
                finalTriggers.push(trigger);
            }
        } else {
            finalTriggers.push(trigger);
        }
    }

    // Trigger all final triggers at precise audio time
    for (const trigger of finalTriggers) {
        triggerStepDirect(trigger.voiceIndex, trigger.step, audioTime);
    }

    // Schedule UI update
    const currentTime = sharedAudioContext.currentTime;
    const delayMs = Math.max(0, (audioTime - currentTime) * 1000);

    setTimeout(() => {
        document.dispatchEvent(new CustomEvent('baengStepAdvanced', {
            detail: { stepIndex, isBarStart }
        }));
    }, delayMs);
}
```

### Example: Ræmbl Clock Subscriber

Ræmbl's clock subscriber handles Euclidean pattern triggering and voice release:

```javascript
// From js/raembl/raemblClock.js

function handleStepEvent(event) {
    const { audioTime, raembl } = event;
    const { stepIndex, isBarStart, bar, beat, subStep } = raembl;

    // Update pattern position (using Ræmbl's bar boundary)
    if (isBarStart && state.resetFactorsOnBar) {
        state.factorsPatternPos = 0;
    } else {
        state.factorsPatternPos = (state.factorsPatternPos + 1) % state.gatePattern.length;
    }

    // Update state for UI
    state.currentStepIndex = state.factorsPatternPos;
    state.displayBar = bar;
    state.displayBeat = beat;
    state.displayStep = subStep;

    // Check trigger from Euclidean pattern
    const shouldTrigger = state.gatePattern.length > 0 &&
                         (state.gatePattern[state.currentStepIndex] || false);

    // Handle LFO reset on bar start if enabled
    if (isBarStart && state.resetLfoOnBar) {
        state.lfoStartTime = performance.now();
    }

    // Trigger note if gate is active
    if (shouldTrigger) {
        state.triggerSample = true;
        handleSampleTrigger(audioTime);

        setTimeout(() => {
            state.triggerSample = false;
        }, 0);
    }

    // Schedule UI update
    const currentTime = sharedAudioContext.currentTime;
    const delayMs = Math.max(0, (audioTime - currentTime) * 1000);

    setTimeout(() => {
        const displayBox = document.querySelector('.raembl-app .display-box');
        if (displayBox) {
            displayBox.textContent = `${state.displayBar}.${state.displayBeat}.${state.displayStep}`;
        }

        updatePatternDisplay();

        document.dispatchEvent(new CustomEvent('raemblStepAdvanced', {
            detail: { stepIndex: state.currentStepIndex, isBarStart }
        }));
    }, delayMs);
}

function handleStopEvent(event) {
    // Release all active voices so notes don't hang
    releaseAllVoices();

    // Update pattern display to show stopped state
    updatePatternDisplay();
}
```

---

## Implementation Details

### State Management

Clock state lives in `sharedState` (from `/merged-app/js/state.js`):

```javascript
export const sharedState = {
    isPlaying: false,
    bpm: 120,
    swing: 0,
    baengBarLength: 4,
    raemblBarLength: 4,
    currentStepIndex: -1,
    displayBar: 1,
    displayBeat: 1,
    displayStep: 1,
    isBarStart: false,
    clockRequestId: null,
    lastStepTime: 0,
    stepCounter: -1,
    barCounter: 0,
    stepsPerBeat: 4,
    baengTempoMultiplier: 2.0,   // Future use (Bæng 2× speed)
    raemblTempoMultiplier: 1.0   // Future use (Ræmbl 1× speed)
};
```

**State proxies** allow apps to read shared timing properties:

```javascript
// From js/baeng/state.js
import { sharedState, createStateProxy } from '../state.js';

const baengLocalState = {
    voices: [/* 6 voices */],
    sequences: [/* per-voice sequences */]
    // ... Bæng-specific properties
};

// Proxied state shares timing properties with sharedState
export const state = createStateProxy(baengLocalState, sharedState);

// Reading timing properties reads from sharedState
console.log(state.bpm);         // → sharedState.bpm
console.log(state.isPlaying);   // → sharedState.isPlaying

// Reading app-specific properties reads from local state
console.log(state.voices);      // → baengLocalState.voices
```

### Publish/Subscribe Implementation

The clock maintains a subscriber list and broadcasts events:

```javascript
const subscribers = [];

export function subscribe(callback) {
    subscribers.push(callback);

    // Return unsubscribe function
    return () => {
        const index = subscribers.indexOf(callback);
        if (index > -1) {
            subscribers.splice(index, 1);
        }
    };
}

function broadcast(event) {
    subscribers.forEach(callback => {
        try {
            callback(event);
        } catch (error) {
            console.error('[SharedClock] Error in subscriber callback:', error);
        }
    });
}
```

**Error isolation:** Exceptions in subscriber callbacks are caught and logged, preventing one faulty subscriber from breaking the entire clock.

### Shared AudioContext

Both apps use the same `AudioContext` instance:

```javascript
// From js/shared/audio.js
export const sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();

// From js/baeng/audio.js
import { sharedAudioContext } from '../shared/audio.js';
const audioContext = sharedAudioContext;

// From js/raembl/audio.js
import { sharedAudioContext } from '../shared/audio.js';
const audioContext = sharedAudioContext;
```

**Why shared?**
- Eliminates clock drift (separate contexts run on independent timelines)
- Allows cross-app effects (e.g., sidechain ducking)
- Reduces browser resource usage

### Polymetric Position Calculation

The scheduler calculates separate step positions for each app:

```javascript
// Calculate per-app step positions
const baengStepsInBar = sharedState.stepsPerBeat * sharedState.baengBarLength;
const raemblStepsInBar = sharedState.stepsPerBeat * sharedState.raemblBarLength;

const baengStepInBar = sharedState.stepCounter % baengStepsInBar;
const raemblStepInBar = sharedState.stepCounter % raemblStepsInBar;

const baengIsBarStart = (baengStepInBar === 0);
const raemblIsBarStart = (raemblStepInBar === 0);

// Calculate display positions for each app
const baengBeat = Math.floor(baengStepInBar / sharedState.stepsPerBeat);
const baengSubStep = baengStepInBar % sharedState.stepsPerBeat;
const baengBar = Math.floor(sharedState.stepCounter / baengStepsInBar) + 1;

const raemblBeat = Math.floor(raemblStepInBar / sharedState.stepsPerBeat);
const raemblSubStep = raemblStepInBar % sharedState.stepsPerBeat;
const raemblBar = Math.floor(sharedState.stepCounter / raemblStepsInBar) + 1;
```

**Example (Bæng: 4 beats, Ræmbl: 3 beats):**

| Global Step | Bæng Step | Bæng Bar | Ræmbl Step | Ræmbl Bar |
|-------------|-----------|----------|------------|-----------|
| 0           | 0 (start) | 1        | 0 (start)  | 1         |
| 4           | 4         | 1        | 4          | 1         |
| 8           | 8         | 1        | 8          | 1         |
| 12          | 12 (start)| 2        | 0 (start)  | 2         |
| 16          | 0 (start) | 2        | 4          | 2         |

### Legacy Compatibility Fields

The `step` event includes legacy fields for backwards compatibility:

```javascript
broadcast({
    type: 'step',
    audioTime: nextStepTime + swingOffset,
    baeng: { /* ... */ },
    raembl: { /* ... */ },

    // Legacy fields (use Bæng's position)
    stepIndex: baengStepInBar,
    isBarStart: baengIsBarStart,
    stepCounter: sharedState.stepCounter,
    barCounter: sharedState.barCounter
});
```

**Migration path:** New code should use `event.baeng` or `event.raembl` for polymetric support. Legacy fields will be deprecated in future versions.

---

## Usage Examples

### Starting Playback

```javascript
import { togglePlay } from './shared/clock.js';

// Start playback when user clicks play button
playButton.addEventListener('click', () => {
    togglePlay();
});
```

### Changing Tempo

```javascript
import { setBPM } from './shared/clock.js';

// Set BPM from user input (automatically clamped to 20-300)
bpmSlider.addEventListener('input', (e) => {
    setBPM(parseInt(e.target.value));
});
```

### Subscribing to Clock Events

```javascript
import { subscribe } from './shared/clock.js';

// Subscribe to all clock events
const unsubscribe = subscribe((event) => {
    if (event.type === 'step') {
        console.log(`Step at ${event.audioTime}s`);
    }
});

// Unsubscribe when done
unsubscribe();
```

### Scheduling Audio Events

```javascript
import { subscribe } from './shared/clock.js';
import { sharedAudioContext } from './shared/audio.js';

subscribe((event) => {
    if (event.type === 'step') {
        const { audioTime, baeng } = event;
        const { stepIndex } = baeng;

        // Check if this step should trigger
        if (shouldTrigger(stepIndex)) {
            // Schedule oscillator at precise audio time
            const osc = sharedAudioContext.createOscillator();
            osc.frequency.value = 440;
            osc.connect(sharedAudioContext.destination);
            osc.start(audioTime);
            osc.stop(audioTime + 0.1);
        }
    }
});
```

### Polymetric Sequencing

```javascript
import { setBaengBarLength, setRaemblBarLength } from './shared/clock.js';

// Set Bæng to 4 beats, Ræmbl to 7 beats
setBaengBarLength(4);
setRaemblBarLength(7);

// Pattern repeats every LCM(4, 7) = 28 beats
```

---

## Integration with Architecture

The clock system integrates with other core systems:

### State Management

Clock timing parameters are part of `sharedState` and proxied to app-specific states. See [Architecture: State Management](./architecture.md#state-management).

### Audio Routing

Clock subscribers schedule audio events using the shared AudioContext. See [Architecture: Audio Architecture](./architecture.md#audio-architecture).

### Patch Format

Clock parameters (BPM, swing, bar lengths) are saved in the unified patch format:

```json
{
    "version": "1.2.0",
    "sharedTiming": {
        "bpm": 120,
        "swing": 0,
        "baengBarLength": 4,
        "raemblBarLength": 4
    },
    "baeng": { /* ... */ },
    "raembl": { /* ... */ }
}
```

See [Architecture: Patch Format](./architecture.md#patch-format).

---

## Performance Considerations

### Main-Thread Blocking

The scheduler polls every 25ms. Long-running tasks on the main thread can delay polling:

**Safe (non-blocking):**
- Reading/writing state
- Scheduling audio events via `AudioParam.setValueAtTime()`
- Short DOM updates (<16ms)

**Unsafe (blocking):**
- Synchronous file I/O
- Heavy computation (>50ms)
- Blocking network requests

**Mitigation:** Use `Web Workers` for heavy computation or defer updates to `requestIdleCallback`.

### Subscriber Overhead

Each subscriber callback runs synchronously on every clock event:

**Best practices:**
- Keep subscriber callbacks lightweight (<1ms)
- Avoid allocating objects in hot paths
- Defer heavy work to `requestAnimationFrame` or `setTimeout`

**Example (defer UI updates):**

```javascript
subscribe((event) => {
    if (event.type === 'step') {
        // ✅ Fast: Schedule audio event
        scheduleNote(event.audioTime);

        // ✅ Fast: Defer UI update
        setTimeout(() => updateStepDisplay(event.stepIndex), 0);
    }
});
```

### Memory Leaks

Always unsubscribe when components unmount:

```javascript
let unsubscribe = null;

function init() {
    unsubscribe = subscribe(handleClockEvent);
}

function cleanup() {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
}
```

---

## Related Documentation

- [System Architecture](./architecture.md) — Overview of merged app architecture
- [State Management](./state-management.md) — Shared state and proxies
- [Audio Routing](./audio-routing.md) — Shared AudioContext and signal flow
- [Bæng Sequencer](../engines/baeng-sequencer.md) — Per-voice step sequencer
- [Ræmbl Patterns](../engines/raembl-patterns.md) — Euclidean pattern generator

---

**Document Version:** 1.0.0
**Last Updated:** 2025-12-30
**Author:** Claude Opus 4.5 (MidiSlave)
