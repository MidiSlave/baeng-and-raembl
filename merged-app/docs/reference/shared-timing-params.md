# Shared Timing Parameters Reference

This document provides a complete technical reference for the shared timing parameters that synchronise Bæng and Ræmbl. These parameters form the foundation of the unified clock system and are managed via the Time Strip interface.

For user-facing documentation about how to use these controls, see the **[Shared Controls (Time Strip)](../user-guide/shared-controls.md)** guide.

---

## Overview

All timing parameters are stored in the `sharedState` object (`merged-app/js/state.js`) and managed by the shared clock system (`merged-app/js/shared/clock.js`). Both apps access these parameters through state proxies that ensure synchronisation.

**Architecture:**
- **Single source of truth**: All timing properties live in `sharedState`
- **Proxy-based access**: Individual app states proxy timing props to `sharedState`
- **Broadcast updates**: Clock system broadcasts events when timing parameters change
- **Audio-thread precision**: 100ms lookahead scheduler with 25ms polling rate

---

## Parameter Reference

### BPM (Beats Per Minute)

Master tempo for both synthesisers.

| Property | Value |
|----------|-------|
| **State Key** | `sharedState.bpm` |
| **Type** | Number (Integer) |
| **Range** | 20–300 BPM |
| **Default** | 120 BPM |
| **UI Control** | Time Strip BPM fader |
| **Update Function** | `setBPM(bpm)` in `clock.js` |
| **Broadcast Event** | `bpmChange` |

**Calculation:**
- Milliseconds per beat: `msPerBeat = 60000 / bpm`
- Milliseconds per step: `msPerStep = msPerBeat / stepsPerBeat`
- Step duration (seconds): `stepDuration = msPerStep / 1000`

**Validation:**
```javascript
// Clamped to valid range on update
const newBPM = Math.max(20, Math.min(300, bpm));
```

**Notes:**
- Changes take effect immediately on the next scheduled step
- Both apps share the same BPM (independent tempo not supported)
- Affects swing offset calculation (see below)

---

### Swing (Groove Offset)

Rhythmic groove percentage that delays off-beat steps.

| Property | Value |
|----------|-------|
| **State Key** | `sharedState.swing` |
| **Type** | Number (Integer) |
| **Range** | 0–100% |
| **Default** | 0% (straight timing) |
| **UI Control** | Time Strip SWING fader |
| **Update Function** | `setSwing(swing)` in `clock.js` |
| **Broadcast Event** | `swingChange` |

**Calculation:**
```javascript
// Applied only to off-beat steps (stepCounter % 2 === 1)
const isOffBeat = (sharedState.stepCounter % 2) === 1;
const swingRatio = sharedState.swing / 100;
const swingOffset = isOffBeat ? (stepDuration / 2) * swingRatio : 0;

// Trigger time for step
const triggerTime = nextStepTime + swingOffset;
```

**Swing Timing Examples (at 120 BPM, 4 steps per beat):**

| Swing % | Off-Beat Delay | Feel |
|---------|----------------|------|
| 0% | 0ms | Straight (quantised) |
| 25% | 31ms | Subtle groove |
| 50% | 62ms | Classic swing/shuffle |
| 75% | 94ms | Heavy swing |
| 100% | 125ms | Extreme (dotted feel) |

**Validation:**
```javascript
const newSwing = Math.max(0, Math.min(100, swing));
```

**Notes:**
- Only affects **off-beat steps** (steps 2, 4, 6, 8, etc.)
- Downbeat steps (1, 3, 5, 7, 9, etc.) always play on-time
- Scheduler advances at straight time—only trigger times are delayed
- Both apps share the same swing setting

---

### Bar Length (Pattern Length)

Number of bars before the pattern loops. **Each app has independent bar length**, enabling polymetric compositions.

#### Bæng Bar Length

| Property | Value |
|----------|-------|
| **State Key** | `sharedState.baengBarLength` |
| **Type** | Number (Integer) |
| **Range** | 1–128 bars |
| **Default** | 4 bars |
| **UI Control** | Time Strip LEFT LENGTH fader |
| **Update Function** | `setBaengBarLength(barLength)` in `clock.js` |
| **Broadcast Event** | `baengBarLengthChange` |

#### Ræmbl Bar Length

| Property | Value |
|----------|-------|
| **State Key** | `sharedState.raemblBarLength` |
| **Type** | Number (Integer) |
| **Range** | 1–128 bars |
| **Default** | 4 bars |
| **UI Control** | Time Strip RIGHT LENGTH fader |
| **Update Function** | `setRaemblBarLength(barLength)` in `clock.js` |
| **Broadcast Event** | `raemblBarLengthChange` |

**Polymetric Cycling:**

When bar lengths differ, patterns cycle independently and realign at the **Least Common Multiple (LCM)** of both lengths:

| Bæng Length | Ræmbl Length | Cycle Period (Bars) |
|-------------|--------------|---------------------|
| 3 | 4 | 12 |
| 5 | 7 | 35 |
| 3 | 5 | 15 |
| 4 | 4 | 4 (no polymetric offset) |

**Calculation:**
```javascript
// Steps in a complete pattern
const baengStepsInBar = sharedState.stepsPerBeat * sharedState.baengBarLength;
const raemblStepsInBar = sharedState.stepsPerBeat * sharedState.raemblBarLength;

// Current step within pattern
const baengStepInBar = sharedState.stepCounter % baengStepsInBar;
const raemblStepInBar = sharedState.stepCounter % raemblStepsInBar;

// Bar start detection
const baengIsBarStart = (baengStepInBar === 0);
const raemblIsBarStart = (raemblStepInBar === 0);
```

**Validation:**
```javascript
const newBarLength = Math.max(1, Math.min(128, barLength));
```

**Notes:**
- Each app tracks its own bar/step position
- Bar length does **not** affect steps per bar (controlled per voice)
- Pattern loops back to step 0 when reaching end of bar length

---

### Transport State

Current playback state (playing/stopped).

| Property | Value |
|----------|-------|
| **State Key** | `sharedState.isPlaying` |
| **Type** | Boolean |
| **Range** | `true` (playing) / `false` (stopped) |
| **Default** | `false` |
| **UI Control** | Time Strip PLAY button |
| **Update Function** | `togglePlay()` in `clock.js` |
| **Broadcast Events** | `play` / `stop` |

**Behaviour:**

**When Starting (`isPlaying = true`):**
1. Resets `stepCounter` to -1
2. Resets `barCounter` to 0
3. Sets `nextStepTime` to current audio context time
4. Starts scheduler interval (25ms polling)
5. Broadcasts `{ type: 'play' }` event

**When Stopping (`isPlaying = false`):**
1. Clears scheduler interval
2. Broadcasts `{ type: 'stop' }` event
3. Calls `releaseAllVoices()` in both apps (notes ring out with decay)

**Notes:**
- Both apps **always** start and stop together
- Independent playback per app is not supported
- Space bar keyboard shortcut toggles playback

---

### Step Counter (Global)

Absolute step count since playback started (never resets until stopped).

| Property | Value |
|----------|-------|
| **State Key** | `sharedState.stepCounter` |
| **Type** | Number (Integer) |
| **Range** | -1 to ∞ |
| **Default** | -1 (stopped) |
| **Update** | Incremented by scheduler on each step |

**Usage:**
- Modulo operation with pattern length determines position within pattern
- Used for polymetric calculations (see Bar Length above)
- Off-beat detection: `isOffBeat = (stepCounter % 2) === 1`

**Example:**
```javascript
// At stepCounter = 47, stepsPerBeat = 4, baengBarLength = 4
const baengStepsInBar = 4 * 4; // 16
const baengStepInBar = 47 % 16; // 15 (last step of bar 2)
const baengBar = Math.floor(47 / 16) + 1; // Bar 3
```

---

### Bar Counter

Number of bars completed (increments when Bæng reaches bar start).

| Property | Value |
|----------|-------|
| **State Key** | `sharedState.barCounter` |
| **Type** | Number (Integer) |
| **Range** | 0 to ∞ |
| **Default** | 0 |
| **Update** | Incremented when `baengIsBarStart === true` |

**Notes:**
- Legacy counter based on Bæng's bar position for backwards compatibility
- Increments only when Bæng completes a bar (not Ræmbl)
- Useful for tracking overall playback duration

---

### Current Step Index (Display)

Current step position within the bar (0-indexed).

| Property | Value |
|----------|-------|
| **State Key** | `sharedState.currentStepIndex` |
| **Type** | Number (Integer) |
| **Range** | 0 to `(stepsPerBeat * baengBarLength) - 1` |
| **Default** | -1 (stopped) |
| **Update** | Set by scheduler on each step |

**Notes:**
- Legacy field using Bæng's step position
- Per-app positions available in step event broadcasts (see Scheduler Events)

---

### Display Position (Bar.Beat.Step)

Human-readable position display in `BAR.BEAT.STEP` format.

| Property | Value |
|----------|-------|
| **State Keys** | `sharedState.displayBar`<br>`sharedState.displayBeat`<br>`sharedState.displayStep` |
| **Type** | Number (Integer) |
| **Format** | `BAR.BEAT.STEP` (e.g., `2.3.4`) |
| **Default** | `1.1.1` (stopped) |
| **Update** | Calculated by scheduler on each step |

**Calculation:**
```javascript
// Using Bæng's position for legacy display
const baengBeat = Math.floor(baengStepInBar / sharedState.stepsPerBeat);
const baengSubStep = baengStepInBar % sharedState.stepsPerBeat;
const baengBar = Math.floor(sharedState.stepCounter / baengStepsInBar) + 1;

sharedState.displayBar = baengBar;        // 1-indexed
sharedState.displayBeat = baengBeat + 1;  // 1-indexed
sharedState.displayStep = baengSubStep + 1; // 1-indexed
```

**Example Display:**
- `1.1.1` = Bar 1, Beat 1, Step 1 (first step)
- `2.3.4` = Bar 2, Beat 3, Step 4 (12th step of bar 2)

**Notes:**
- All values are **1-indexed** for display (unlike internal 0-indexed counters)
- Legacy display uses Bæng's position
- Per-app displays available in step event broadcasts

---

### Bar Start Flag

Boolean flag indicating if the current step is the start of a bar.

| Property | Value |
|----------|-------|
| **State Key** | `sharedState.isBarStart` |
| **Type** | Boolean |
| **Range** | `true` / `false` |
| **Default** | `false` |
| **Update** | Set by scheduler on each step |

**Usage:**
- Triggers per-bar actions (e.g., reset pattern counters)
- Used for visual feedback (bar start indicators)
- Legacy field based on Bæng's bar position

**Notes:**
- Per-app bar start flags available in step event broadcasts (see below)

---

### Steps Per Beat

Subdivision resolution (fixed at 16th notes).

| Property | Value |
|----------|-------|
| **State Key** | `sharedState.stepsPerBeat` |
| **Type** | Number (Integer) |
| **Range** | Fixed at 4 |
| **Default** | 4 (16th note subdivision in 4/4 time) |

**Notes:**
- Currently hardcoded to 4 (16th notes)
- Future versions may support configurable subdivisions
- Affects step duration calculation (see BPM section)

---

### Tempo Multipliers

Per-app tempo scaling factors (currently unused in main codebase).

| Property | Value |
|----------|-------|
| **Bæng Multiplier** | `sharedState.baengTempoMultiplier` (default: 2.0) |
| **Ræmbl Multiplier** | `sharedState.raemblTempoMultiplier` (default: 1.0) |
| **Type** | Number (Float) |

**Notes:**
- Reserved for future per-app tempo scaling feature
- Currently not applied in scheduler calculations
- Both apps play at the same tempo (BPM)

---

## Scheduler Events

The clock system broadcasts events to all subscribers (via `subscribe(callback)` in `clock.js`). Each event contains timing information and per-app position data.

### Event Types

#### `play` Event

Broadcast when playback starts.

```javascript
{
  type: 'play'
}
```

**Subscriber Actions:**
- Reset voice states
- Initialise visualisations
- Prepare audio engines

---

#### `stop` Event

Broadcast when playback stops.

```javascript
{
  type: 'stop'
}
```

**Subscriber Actions:**
- Release all active voices (with decay)
- Stop visualisation animations
- Reset sequencer positions

---

#### `step` Event

Broadcast on every step (core timing event).

```javascript
{
  type: 'step',
  audioTime: 1.234,  // Precise audio context time for trigger

  // Per-app positions (for polymetric support)
  baeng: {
    stepIndex: 0,      // 0-indexed step within bar
    isBarStart: true,  // true if first step of bar
    bar: 1,            // 1-indexed bar number
    beat: 1,           // 1-indexed beat within bar
    subStep: 1         // 1-indexed step within beat
  },

  raembl: {
    stepIndex: 0,
    isBarStart: true,
    bar: 1,
    beat: 1,
    subStep: 1
  },

  // Legacy fields (based on Bæng's position, for backwards compat)
  stepIndex: 0,
  isBarStart: true,
  stepCounter: 0,
  barCounter: 0
}
```

**Usage:**
```javascript
import { subscribe } from './js/shared/clock.js';

subscribe((event) => {
  if (event.type === 'step') {
    // Schedule note triggers at event.audioTime
    scheduleNote(event.audioTime, note);

    // Update UI with per-app position
    updateStepIndicator(event.baeng.stepIndex);
  }
});
```

**Notes:**
- `audioTime` is the **precise audio context time** for triggering events
- Includes swing offset (off-beats are delayed)
- Per-app positions enable polymetric pattern handling
- Subscribers should **never** use `Date.now()` or `performance.now()` for audio scheduling

---

#### `bpmChange` Event

Broadcast when BPM is updated.

```javascript
{
  type: 'bpmChange',
  bpm: 140
}
```

**Subscriber Actions:**
- Recalculate step durations
- Update BPM displays
- Adjust LFO rates (if tempo-synced)

---

#### `swingChange` Event

Broadcast when swing is updated.

```javascript
{
  type: 'swingChange',
  swing: 50
}
```

**Subscriber Actions:**
- Recalculate swing offsets
- Update swing displays

---

#### `baengBarLengthChange` Event

Broadcast when Bæng's bar length is updated.

```javascript
{
  type: 'baengBarLengthChange',
  barLength: 8
}
```

---

#### `raemblBarLengthChange` Event

Broadcast when Ræmbl's bar length is updated.

```javascript
{
  type: 'raemblBarLengthChange',
  barLength: 4
}
```

---

## Scheduler Implementation Details

### Lookahead Architecture

The scheduler uses a **100ms lookahead window** with **25ms polling** for sample-accurate timing.

**Key Constants:**
```javascript
const LOOKAHEAD_TIME = 0.1;      // 100ms lookahead
const SCHEDULER_INTERVAL = 25;   // 25ms polling rate
```

**Scheduler Loop (Simplified):**
```javascript
function scheduler() {
  const currentTime = sharedAudioContext.currentTime;
  const stepDuration = (60000 / sharedState.bpm / sharedState.stepsPerBeat) / 1000;

  // Schedule all steps within lookahead window
  while (nextStepTime < currentTime + LOOKAHEAD_TIME) {
    sharedState.stepCounter++;

    // Calculate swing offset
    const isOffBeat = (sharedState.stepCounter % 2) === 1;
    const swingRatio = sharedState.swing / 100;
    const swingOffset = isOffBeat ? (stepDuration / 2) * swingRatio : 0;

    // Calculate per-app positions
    const baengStepInBar = sharedState.stepCounter % (sharedState.stepsPerBeat * sharedState.baengBarLength);
    const raemblStepInBar = sharedState.stepCounter % (sharedState.stepsPerBeat * sharedState.raemblBarLength);

    // Broadcast step event
    broadcast({
      type: 'step',
      audioTime: nextStepTime + swingOffset,
      baeng: { stepIndex: baengStepInBar, /* ... */ },
      raembl: { stepIndex: raemblStepInBar, /* ... */ }
    });

    // Advance time (no swing drift)
    nextStepTime += stepDuration;
  }
}
```

**Why This Works:**
- **Audio-thread precision**: Uses `AudioContext.currentTime` (sample-accurate)
- **No drift**: Swing only affects trigger times, not step advancement
- **Lookahead prevents underruns**: Even if UI lags, audio events are pre-scheduled
- **Polymetric support**: Per-app positions calculated independently

---

## State Access Patterns

### Reading Timing Parameters

**From Main App State Files:**
```javascript
import { sharedState } from '../state.js';

console.log(sharedState.bpm);        // 120
console.log(sharedState.swing);      // 50
console.log(sharedState.isPlaying);  // true
```

**From Individual App States (via Proxy):**
```javascript
import { baengState } from '../state.js';

// Timing props proxied to sharedState
console.log(baengState.bpm);  // Same as sharedState.bpm
```

---

### Updating Timing Parameters

**Always use clock.js update functions (triggers events):**
```javascript
import { setBPM, setSwing, setBaengBarLength, setRaemblBarLength } from './js/shared/clock.js';

setBPM(140);                  // Updates sharedState.bpm + broadcasts bpmChange
setSwing(50);                 // Updates sharedState.swing + broadcasts swingChange
setBaengBarLength(8);         // Updates sharedState.baengBarLength + broadcasts event
setRaemblBarLength(4);        // Updates sharedState.raemblBarLength + broadcasts event
```

**Do NOT modify sharedState directly:**
```javascript
// WRONG: No event broadcast, subscribers won't update
sharedState.bpm = 140;

// CORRECT: Uses clock.js function, broadcasts to all subscribers
setBPM(140);
```

---

### Subscribing to Clock Events

**Subscribe to all clock events:**
```javascript
import { subscribe } from './js/shared/clock.js';

const unsubscribe = subscribe((event) => {
  switch (event.type) {
    case 'play':
      console.log('Playback started');
      break;

    case 'stop':
      console.log('Playback stopped');
      break;

    case 'step':
      console.log(`Step at audioTime: ${event.audioTime}`);
      scheduleNoteAtTime(event.audioTime);
      break;

    case 'bpmChange':
      console.log(`BPM changed to: ${event.bpm}`);
      break;

    case 'swingChange':
      console.log(`Swing changed to: ${event.swing}%`);
      break;
  }
});

// Cleanup when component unmounts
// unsubscribe();
```

---

## Cross-References

**User Documentation:**
- **[Shared Controls (Time Strip)](../user-guide/shared-controls.md)** – User guide for Time Strip interface

**Developer Documentation:**
- **[Clock System Architecture](../developer/architecture.md#clock-system)** – Audio-thread scheduler design
- **[State Management](../developer/architecture.md#state-management)** – How shared state proxies work

**Parameter References:**
- **[Bæng Parameters](./baeng-parameters.md)** – Complete Bæng parameter reference
- **[Ræmbl Parameters](./raembl-parameters.md)** – Complete Ræmbl parameter reference

**Source Files:**
- `merged-app/js/state.js` – Shared state container
- `merged-app/js/shared/clock.js` – Clock system implementation
- `merged-app/js/shared/audio.js` – Shared AudioContext

---

## Summary

The shared timing system provides sample-accurate synchronisation between Bæng and Ræmbl through:

1. **Centralised state** (`sharedState` in `state.js`)
2. **Unified clock** (audio-thread scheduler in `clock.js`)
3. **Event broadcasting** (pub/sub system for timing events)
4. **Polymetric support** (independent bar lengths with per-app position tracking)

**Key Principles:**
- **BPM** and **Swing** are always shared (no independent tempo)
- **Bar Length** is independent per app (enables polymetric patterns)
- **Transport state** (`isPlaying`) controls both apps simultaneously
- **Audio-time scheduling** ensures zero jitter (100ms lookahead, 25ms polling)
- **Always use clock.js update functions** to trigger event broadcasts

This architecture ensures both apps play in perfect sync whilst maintaining the flexibility for polymetric compositions and independent pattern lengths.
