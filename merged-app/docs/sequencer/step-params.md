# Per-Step Sequencer Parameters

This document describes the per-step parameters available in the Bæng and Ræmbl sequencers. Each step in a sequence can have independent settings that control note triggering, articulation, and expression.

## Overview

Both Bæng (drum sequencer) and Ræmbl (pitch sequencer) share some common step parameters, whilst each app has specialised parameters for their specific synthesis needs.

**Common Parameters:**
- **Gate** - Step on/off (note trigger enable)
- **Accent** - Velocity and envelope boost

**Bæng-Specific Parameters:**
- **Ratchet** - Note repetitions within a step
- **Probability** - Chance for step to trigger (per-step and per-voice)
- **Deviation** - Timing humanisation (removed in current implementation)

**Ræmbl-Specific Parameters:**
- **Slide** - TB-303 style pitch glide between notes
- **Trill** - Pitch oscillation to next scale degree

---

## Gate (Step On/Off)

The gate parameter determines whether a step will trigger a note. This is the fundamental on/off switch for each step in the sequence.

### Behaviour

- **Enabled (true)**: Step will attempt to trigger when the sequencer reaches this position
- **Disabled (false)**: Step is silent, sequencer advances without triggering

Gate is checked **before** all other per-step parameters. If gate is disabled, accent, ratchet, slide, and trill settings are ignored.

### Implementation

**Bæng** (`js/baeng/modules/sequence.js`):
```javascript
// Gate check at line 108-110
if (!step.gate) {
    return;  // Early exit if gate is disabled
}
```

**Ræmbl** (`js/raembl/modules/path.js`):
Gate pattern is pre-calculated and checked during step trigger via the `gatePattern` array.

### UI Control

- **Bæng**: Per-step gate buttons in the step sequencer grid
- **Ræmbl**: Gate pattern generated via FACTORS Euclidean pattern generator

---

## Accent (Velocity and Envelope Boost)

Accent adds emphasis to individual steps by increasing velocity and tightening the envelope attack and decay times. This creates punchy, articulated notes that cut through the mix.

### Behaviour

**Velocity Boost**: 1.5× velocity multiplier
**Envelope Changes**:
- Snappier attack (more punch at note onset)
- Faster decay (tighter, more percussive sound)

From CLAUDE.md (lines 45):
> **Accent working** (1.5× velocity boost, snappier decay, attack punch)

### Level Range

**Bæng**: 0-15 (16 levels of accent intensity)
**Ræmbl**: Boolean (on/off) determined by accent pattern

### Implementation

**Bæng** (`js/baeng/modules/sequence.js`):
```javascript
// Accent level stored per-step (line 151)
triggerVoice(
    voiceIndex,
    step.accent,      // Accent level (0-15)
    ratchetCount,
    stepDuration,
    isDeviated,
    step.deviationMode
);

// Accent setter with validation (lines 212-218)
export function setStepAccent(voiceIndex, stepIndex, level) {
    sequence.steps[stepIndex].accent = Math.max(0, Math.min(15, Math.round(level)));
}
```

**Ræmbl** (`js/raembl/modules/path.js`):
```javascript
// Accent check using factorsPatternPos index (lines 89-101)
let isAccented = false;
if (currentStepIndexForPatterns >= 0 && currentStepIndexForPatterns < state.accentPattern.length) {
    // Use pre-generated pattern (probability already applied)
    isAccented = state.accentPattern[currentStepIndexForPatterns];
}

// Pass to audio engine (line 135)
const voice = triggerNote(note, baseVelocity, isAccented, shouldSlide, isTrill, audioTime, currentStepIndexForPatterns);
```

### UI Control

- **Bæng**: Per-step accent level (0-15) in step editor
- **Ræmbl**: Accent pattern probability in FACTORS module

---

## Ratchet (Note Repeats)

**Bæng Only**

Ratchet subdivides a step into multiple equally-spaced triggers, creating rapid note repeats within a single step. Useful for creating rolls, flams, and rhythmic complexity.

### Behaviour

The ratchet parameter stores values **0-7**, which map to **1-8 triggers** per step:
- Ratchet = 0 → 1 trigger (normal)
- Ratchet = 1 → 2 triggers (8th notes if step is 16th)
- Ratchet = 7 → 8 triggers (64th notes if step is 16th)

Ratchet triggers are **evenly spaced** within the step duration:
```
Step duration: 250ms
Ratchet = 3 (4 triggers)
Triggers at: 0ms, 62.5ms, 125ms, 187.5ms
```

### Implementation

**Bæng** (`js/baeng/modules/sequence.js`):
```javascript
// Ratchet count calculated (lines 23, 132)
const ratchetCount = step.ratchet + 1;  // 0-7 → 1-8 triggers

// Setter with bounds checking (lines 221-227)
export function setStepRatchet(voiceIndex, stepIndex, ratchetValue) {
    sequence.steps[stepIndex].ratchet = Math.max(0, Math.min(7, Math.round(ratchetValue)));
}
```

### Interaction with Other Parameters

- **Accent**: Applied to **all** ratchet triggers
- **Probability**: Checked once per step (not per ratchet trigger)
- **Flam Mode**: Overrides ratchet behaviour (see Special Case below)

### Special Case: Flam Mode

When `deviation = 20` and `deviationMode = 0`, the step enters **flam mode**, which triggers **exactly 2 notes** regardless of ratchet setting:
1. Grace note (quiet, 15ms early)
2. Primary note (accented, on-beat)

This creates the classic "flam" rudiment where a ghost note precedes the main hit.

---

## Probability (Chance to Trigger)

**Bæng Only**

Probability adds randomness to step triggering, with two levels of control:
1. **Per-voice probability** (applies to all steps in a voice)
2. **Per-step probability** (applies to individual steps)

### Behaviour

Probability is expressed as a percentage (0-100):
- **100%**: Step always triggers (deterministic)
- **50%**: Step triggers 50% of the time on average
- **0%**: Step never triggers

Both probability checks must pass for a step to trigger:
```javascript
// Per-voice probability check (lines 113-115)
if (sequence.probability < 100) {
    if (Math.random() * 100 > sequence.probability) return;
}

// Per-step probability check (lines 118-120)
if (step.probability < 100) {
    if (Math.random() * 100 > step.probability) return;
}
```

### Combined Probabilities

When both per-voice and per-step probabilities are set, the **effective probability is the product**:
```
Voice Probability = 80%
Step Probability = 50%
Effective Probability = 0.8 × 0.5 = 40%
```

### Implementation

**Bæng** (`js/baeng/modules/sequence.js`):
```javascript
// Step probability setter (lines 244-250)
export function setStepProbability(voiceIndex, stepIndex, probability) {
    sequence.steps[stepIndex].probability = Math.max(0, Math.min(100, Math.round(probability)));
}
```

**Ræmbl**: Uses a global `state.probability` parameter that applies to all steps (line 65 in `path.js`).

---

## Slide (TB-303 Style Glide)

**Ræmbl Only**

Slide creates smooth pitch glides between notes, inspired by the Roland TB-303 bass synthesiser. When slide is enabled, the pitch glides from the previous note to the current note over a fixed duration.

### Behaviour

**Glide Duration**:
- **Mono mode**: 80ms (classic TB-303 timing)
- **Poly mode**: 40ms (slide-into effect, shorter to avoid voice overlap artefacts)

From CLAUDE.md (line 46):
> **Slide working** (80ms TB-303 style glide via AudioParam automation; poly mode has 40ms slide-into effect)

### TB-303 Convention

Following the TB-303 pattern, slide uses a **look-back system**:
- Slide flag on step N means "slide **FROM** step N **TO** step N+1"
- To slide **INTO** the current step, we check if the **previous** step had slide enabled

```javascript
// Check previous step's slide flag (lines 107-115 in path.js)
const prevStepIndex = (currentStepIndexForPatterns - 1 + state.slidePattern.length) % state.slidePattern.length;
if (prevStepIndex >= 0 && prevStepIndex < state.slidePattern.length) {
    const prevWasGated = state.gatePattern[prevStepIndex];
    shouldSlide = prevWasGated && state.slidePattern[prevStepIndex];
}
```

### Implementation

**Ræmbl** (`js/raembl/modules/path.js`):
Slide is determined by the `slidePattern` array and passed to `triggerNote()` as a boolean flag (line 135).

The actual pitch automation is handled via `AudioParam.exponentialRampToValueAtTime()` on the main thread (not in the AudioWorklet), following the Critical Footgun guidance from CLAUDE.md (lines 260-273):

> **🔫 DON'T: Use Per-Sample JavaScript in AudioWorklet**
> Use AudioParam automation from main thread

### Interaction with Other Parameters

- **Mono mode**: Slide works as expected, creating smooth legato phrases
- **Poly mode**: Each voice has independent slide (40ms slide-into)
- **Trill**: Slide and trill are **mutually exclusive** behaviours (trill takes precedence in mono mode)

---

## Trill (Pitch Oscillation)

**Ræmbl Only**

Trill rapidly oscillates the pitch to the next degree in the current scale, creating a rapid alternation between two notes. The trill adapts to the sequencer's swing setting for musical timing.

### Behaviour

Trill oscillates between:
1. **Base note**: The step's assigned pitch
2. **Trill note**: Next degree in the current scale (respects scale and root settings)

**Trill Pattern**:
- **Downbeat steps** (step 0, 4, 8, 12 in a 16-step pattern): **3-note trill**
- **Swung offbeat steps**: **2-note trill** (to fit within swung timing without rushing)

From CLAUDE.md (line 47, 61):
> **Trill working** (pitch oscillation to next scale degree, mono and poly modes)
> **Trill offbeat fix** (2-note trills on swung offbeats, 3-note on downbeats)

### Implementation

**Ræmbl** (`js/raembl/modules/path.js`):
```javascript
// Trill check (lines 118-126)
let isTrill = false;
if (currentStepIndexForPatterns >= 0 && currentStepIndexForPatterns < state.trillPattern.length) {
    // Trill determined directly by pattern (not probability)
    isTrill = state.trillPattern[currentStepIndexForPatterns];
}

// Pass to audio engine (line 135)
const voice = triggerNote(note, baseVelocity, isAccented, shouldSlide, isTrill, audioTime, currentStepIndexForPatterns);
```

### Visualisation

In the animated cylinder path visualisation, trilling notes display a "firefly effect":
- Rapid vertical darting (20Hz oscillation)
- Horizontal position jitter (±2px)
- Enhanced glow (1.3× radius, brighter shadow)
- Motion trail effect (ghost dot 3px below)

(See `path.js` lines 275-383 for visualisation code)

### Interaction with Other Parameters

- **Mono mode**: Trill works on sustained notes
- **Poly mode**: Each voice can trill independently
- **Slide**: In mono mode, trill and slide are mutually exclusive (implementation prioritises appropriate behaviour)
- **Accent**: Trill notes inherit the accent state of the step

---

## Cross-References

- **Bæng Sequencer**: (Documentation to be created: `baeng-sequencer.md`)
- **Ræmbl Path Sequencer**: (Documentation to be created: `raembl-path.md`)
- **Euclidean Pattern Generator**: See FACTORS documentation for gate/accent/slide/trill pattern generation
- **Per-Parameter Modulation (PPMod)**: See `docs/modulation/ppmod.md` for parameter modulation per step via TM mode

---

## Technical Notes

### State Storage

**Bæng** step data structure (`js/baeng/modules/sequence.js` lines 170-173):
```javascript
sequence.steps[j] = {
    gate: false,
    accent: 0,           // 0-15
    ratchet: 0,          // 0-7 (maps to 1-8 triggers)
    probability: 100,    // 0-100%
    deviation: 0,        // Deprecated (placeholder for backward compatibility)
    deviationMode: 1,    // Deprecated
    paramLocks: {}       // Future: per-step parameter locks
};
```

**Ræmbl** uses pre-generated pattern arrays stored in state:
- `state.gatePattern[]` - Gate on/off per step
- `state.accentPattern[]` - Accent on/off per step
- `state.slidePattern[]` - Slide on/off per step
- `state.trillPattern[]` - Trill on/off per step
- `state.stepPitches[]` - Pitch value (0-100) per step

### Audio-Thread Scheduling

Per-step parameters are evaluated on the **main thread** during clock tick events, then passed to the audio engine with precise `audioTime` values for sample-accurate triggering.

Bæng uses a **100ms lookahead scheduler** to ensure timing precision even under heavy CPU load (see CLAUDE.md lines 17, 29).

### Backward Compatibility

The `deviation` and `deviationMode` parameters are **deprecated** but retained in the state structure for backward compatibility with older patches. Setting `deviation = 20` and `deviationMode = 0` triggers the special **flam mode** behaviour.

---

## See Also

- **Timing & Transport**: See main documentation for BPM, swing, and bar length settings
- **Voice Architecture**: See engine documentation for how these parameters interact with synthesis engines
- **Patch Format**: See developer documentation for how step parameters are stored in patch files
