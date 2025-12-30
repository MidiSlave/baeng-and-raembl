# SLICE Engine Parameter Reference

Complete technical reference for all parameters in Bæng's SLICE breakbeat slicer engine.

---

## Table of Contents

1. [Overview](#overview)
2. [Macro Control Parameters](#macro-control-parameters)
3. [Slice Selection](#slice-selection)
4. [Pitch Shifting](#pitch-shifting)
5. [Decay Envelope](#decay-envelope)
6. [Filter Control](#filter-control)
7. [Voice Processing & Routing](#voice-processing--routing)
8. [Internal Parameters](#internal-parameters)
9. [Parameter Interactions](#parameter-interactions)
10. [PPMod Integration](#ppmod-integration)

---

## Overview

The SLICE engine is a breakbeat slicing tool that divides audio loops into rhythmic segments for individual triggering, pitch shifting, and re-sequencing. All user-facing controls are accessed via the standard 4-macro system (PATCH, DEPTH, RATE, PITCH) with additional voice processing parameters.

### Core Principles

- **Percentage-Based Decay** — Decay calculated as percentage of slice length, not absolute time
- **Pitch-Aware Playback** — Decay envelope compensates for playback rate changes
- **Macro Unified Control** — All engine parameters accessible via 4 macros
- **Full PPMod Support** — All macros modulatable via 6-mode PPMod system

---

## Macro Control Parameters

The SLICE engine uses the standard 4-macro control system. Each macro maps to a specific SLICE parameter.

### Parameter Table

| Macro | State Key | Range | Default | PPMod | Unit | Description |
|-------|-----------|-------|---------|-------|------|-------------|
| **PATCH** | `sliceIndex` | 0–N | 0 | ✓ | — | Slice selection (N = total slices - 1) |
| **DEPTH** | `samplerDecay` | 0–100 | 100 | ✓ | % | Decay envelope (10–110% of slice length) |
| **RATE** | `samplerFilter` | 0–100 | 50 | ✓ | — | Filter cutoff frequency |
| **PITCH** | `samplerPitch` | 0–100 | 50 | ✓ | semitones | Playback pitch shift (-24 to +24 semitones) |

### Macro Mapping

The SLICE engine shares parameter keys with the SAMPLE engine (`samplerDecay`, `samplerFilter`, `samplerPitch`) but interprets them differently:

**SAMPLE Engine:**
- Decay percentage applies to full sample length
- Filter affects entire sample playback

**SLICE Engine:**
- Decay percentage applies to individual slice length
- Filter affects only triggered slice segment
- PATCH macro selects slice index (not sample index)

---

## Slice Selection

### PATCH Macro (Slice Index)

Controls which slice from the loaded buffer is triggered when the voice fires.

#### Technical Details

| Property | Value |
|----------|-------|
| **State Key** | `sliceIndex` |
| **UI Label** | SLICE |
| **Range** | 0 to (N - 1) where N = total number of slices |
| **Default** | 0 (first slice) |
| **PPMod** | Supported (all 6 modes) |
| **Precision** | Integer (rounded) |

#### Slice Numbering

Slices are numbered sequentially from the start of the audio buffer:

- **0** — First slice (leftmost marker)
- **1** — Second slice
- **N-1** — Last slice (rightmost marker)

#### Dynamic Selection Range

The maximum value for `sliceIndex` is determined at runtime based on the number of slices in the loaded buffer:

```javascript
const maxSliceIndex = sliceConfig.slices.length - 1;
```

If `sliceIndex` exceeds the available slices, it wraps to the last available slice.

#### Use Cases

**Static Selection:**
- Set PATCH knob to fixed value (e.g., 5 = always trigger slice 5)

**LFO Cycling:**
- Modulate PATCH with LFO (triangle wave, clock-synced)
- Cycles through slices rhythmically

**Random Selection:**
- Modulate PATCH with RND mode
- Random slice on each trigger (glitchy percussion)

**Sequenced Selection:**
- Modulate PATCH with SEQ mode
- Programmed slice sequence (e.g., [0, 2, 4, 1] for kick-snare-tom pattern)

---

## Pitch Shifting

### PITCH Macro (Playback Rate)

Transposes the slice via playback rate adjustment. Higher pitch = faster playback, lower pitch = slower playback.

#### Technical Details

| Property | Value |
|----------|-------|
| **State Key** | `samplerPitch` |
| **UI Label** | PITCH |
| **Range** | 0–100 (maps to -24 to +24 semitones) |
| **Default** | 50 (0 semitones, original pitch) |
| **PPMod** | Supported (all 6 modes) |
| **Resolution** | 1 semitone steps |

#### Pitch Mapping

The 0-100 parameter range maps to semitone transposition:

| Parameter | Semitones | Ratio | Effect |
|-----------|-----------|-------|--------|
| 0 | -24 | 0.25× | Two octaves down (4× slower) |
| 25 | -12 | 0.5× | One octave down (2× slower) |
| 50 | 0 | 1.0× | Original pitch (no transposition) |
| 75 | +12 | 2.0× | One octave up (2× faster) |
| 100 | +24 | 4.0× | Two octaves up (4× faster) |

#### Playback Rate Calculation

Pitch shift is applied via sample rate conversion:

```javascript
// From sampler-engine.js (line 105)
this.playbackRate = Math.pow(2, pitch / 12);
```

**Examples:**
- `pitch = 0` (original) → `playbackRate = 1.0`
- `pitch = +12` (octave up) → `playbackRate = 2.0`
- `pitch = -12` (octave down) → `playbackRate = 0.5`

#### Pitch and Slice Duration

**Critical**: Pitch shifting affects both pitch AND slice playback duration:

| Pitch | Playback Rate | Duration Change |
|-------|---------------|-----------------|
| -24 semitones | 0.25× | 4× longer slice |
| -12 semitones | 0.5× | 2× longer slice |
| 0 semitones | 1.0× | Original duration |
| +12 semitones | 2.0× | 0.5× shorter slice |
| +24 semitones | 4.0× | 0.25× shorter slice |

**Decay Compensation:** The decay envelope automatically compensates for playback rate changes (see [Decay Envelope](#decay-envelope)).

#### Artefacts and Limitations

**Sample Rate Conversion Artefacts:**
- Extreme transpositions (+/-24 semitones) may introduce aliasing/distortion
- Recommended range: +/-12 semitones for natural results

**No Formant Preservation:**
- Pitch shifting is achieved via speed change, not formant-preserving algorithms
- This is intentional for classic sampler character

---

## Decay Envelope

### DEPTH Macro (Decay Percentage)

Controls the amplitude decay envelope as a **percentage of slice length**, not absolute time. This ensures consistent envelope behaviour across different slice lengths and playback rates.

#### Technical Details

| Property | Value |
|----------|-------|
| **State Key** | `samplerDecay` |
| **UI Label** | DECAY |
| **Range** | 0–100 |
| **Default** | 100 (full slice duration) |
| **PPMod** | Supported (all 6 modes) |
| **Calculation** | Percentage of slice length (10–110%) |

#### Decay Percentage Mapping

The 0-100 parameter maps to a percentage of the slice's natural duration:

| Parameter | Decay % | Description |
|-----------|---------|-------------|
| 0 | 10% | Very short, gated (tight, punchy) |
| 25 | 32.5% | Short decay (clipped tail) |
| 50 | 55% | Mid-length decay (half slice) |
| 75 | 77.5% | Long decay (sustains most of slice) |
| 100 | 110% | Full duration (extends slightly beyond slice) |

#### Implementation Details

From `sampler-engine.js` (lines 113-134):

```javascript
// Calculate decay relative to slice length (pitch-aware)
const sliceLengthSamples = (this.playbackEnd - this.playbackStart) / this.playbackRate;
const sliceDurationMs = (sliceLengthSamples / this.sampleRate) * 1000;

// Map decay (0-0.99) to percentage of slice duration (10%-110%)
const decayPercentage = 0.1 + (this.decay / 0.99) * 1.0;
const targetDecayMs = sliceDurationMs * decayPercentage;

// Calculate exponential decay coefficient
const targetSamples = (targetDecayMs / 1000) * this.sampleRate;
const threshold = 0.00001; // Envelope silence threshold
const decayCoeff = Math.exp(Math.log(threshold) / targetSamples);
const clampedCoeff = Math.max(0.5, Math.min(0.99999, decayCoeff));

this.ampEnv.setDecayDirect(clampedCoeff);
```

#### Why Percentage-Based Decay?

**Problem with Fixed-Time Decay:**
- Short slices (50ms) with 500ms decay → cut off prematurely
- Long slices (500ms) with 100ms decay → unnatural clipping

**Solution with Percentage-Based Decay:**
- Decay scales proportionally with slice length
- 50% decay on 50ms slice = 30ms envelope
- 50% decay on 500ms slice = 300ms envelope
- Result: Consistent feel regardless of slice duration

#### Pitch Compensation

The decay calculation includes playback rate compensation:

**Example: 100ms slice at original pitch (DECAY = 50)**

| Pitch | Playback Rate | Actual Duration | Decay Time |
|-------|---------------|-----------------|------------|
| +12 semitones | 2.0× | 50ms | 30ms (55% of 50ms) |
| 0 semitones | 1.0× | 100ms | 60ms (55% of 100ms) |
| -12 semitones | 0.5× | 200ms | 120ms (55% of 200ms) |

**Result:** Decay envelope feels consistent regardless of pitch transposition.

#### Special Cases

**DECAY = 99-100 (Full Duration):**
- Envelope disabled (`useDecay = false`)
- Slice plays to natural boundary without amplitude shaping
- Useful for full loops or sustained sounds

**Very Short Slices (< 1ms):**
- Minimum decay coefficient (0.9) applied
- Prevents calculation errors with zero-length slices

---

## Filter Control

### RATE Macro (Filter Cutoff)

Lowpass/highpass filter for timbral shaping of triggered slices.

#### Technical Details

| Property | Value |
|----------|-------|
| **State Key** | `samplerFilter` |
| **UI Label** | FILTER |
| **Range** | 0–100 |
| **Default** | 50 (no filtering) |
| **PPMod** | Supported (all 6 modes) |
| **Filter Type** | State Variable Filter (SVF) |

#### Filter Mode Mapping

The filter behaviour changes based on parameter value:

| Range | Mode | Cutoff Range | Description |
|-------|------|--------------|-------------|
| **0-49** | Lowpass | 4000Hz → 200Hz | Darker, muffled tone (removes highs) |
| **50** | Bypass | — | No filtering applied |
| **51-100** | Highpass | 200Hz → 4000Hz | Brighter, thinner tone (removes lows) |

#### Cutoff Frequency Calculation

From `sampler-engine.js` (lines 234-250):

```javascript
if (filter < 50) {
    // Lowpass mode
    this.filterMode = 'lp';
    const lpNorm = (50 - filter) / 50; // 0 at 50, 1 at 0
    this.filterCutoff = 4000 * Math.pow(0.05, lpNorm); // 4kHz to 200Hz
    this.useFilter = true;
} else if (filter > 50) {
    // Highpass mode
    this.filterMode = 'hp';
    const hpNorm = (filter - 50) / 50; // 0 at 50, 1 at 100
    this.filterCutoff = 200 * Math.pow(20, hpNorm); // 200Hz to 4kHz
    this.useFilter = true;
} else {
    // No filter at 50
    this.filterMode = 'none';
    this.useFilter = false;
}
```

#### Practical Examples

**Lowpass (Muffled/Warm):**
- `FILTER = 0` → 200Hz cutoff (extreme lowpass, bass-heavy)
- `FILTER = 20` → ~800Hz cutoff (telephone/lo-fi tone)
- `FILTER = 40` → ~2kHz cutoff (gentle warmth)

**Highpass (Bright/Thin):**
- `FILTER = 60` → ~500Hz cutoff (remove low rumble)
- `FILTER = 80` → ~2kHz cutoff (crispy, snappy)
- `FILTER = 100` → 4kHz cutoff (extreme highpass, tinny)

#### Resonance

**Fixed:** Resonance is set to 0.5 (gentle rolloff) and not user-adjustable.
- This prevents self-oscillation at extreme cutoff values
- Provides smooth, musical filtering without harshness

#### Use Cases

**Lo-fi Drum Breaks:**
- `FILTER = 20-30` (lowpass)
- Combines well with BIT REDUCTION for classic sampler texture

**Crispy Hi-Hats:**
- `FILTER = 70-90` (highpass)
- Removes low-end mud, emphasises transients

**Dynamic Filtering:**
- Modulate FILTER with LFO (sweeping wah effect)
- Modulate FILTER with ENV (filter envelope follower)

---

## Voice Processing & Routing

Standard per-voice parameters available to all Bæng voices (not engine-specific).

### Processing Parameters

| Parameter | State Key | Range | Default | PPMod | Unit | Description |
|-----------|-----------|-------|---------|-------|------|-------------|
| **LEVEL** | `level` | 0–100 | 100 | ✓ | % | Voice output level |
| **PAN** | `pan` | 0–100 | 50 | ✓ | L/R | Stereo pan (0 = hard L, 50 = centre, 100 = hard R) |
| **GATE** | `gate` | 0–100 | 80 | ✓ | % | Note duration (0 = instant, 100 = full step) |
| **CHOKE** | `chokeGroup` | 0–4 | 0 | ✓ | — | Choke group (0 = none, 1–4 = mutual choke) |
| **BIT** | `bitReduction` | 0–100 | 0 | ✓ | — | Bit reduction amount |
| **DRIVE** | `drive` | 0–100 | 0 | ✓ | — | Saturation/distortion |

### Effects Sends

| Parameter | State Key | Range | Default | PPMod | Unit | Description |
|-----------|-----------|-------|---------|-------|------|-------------|
| **RVB** | `reverbSend` | 0–100 | 0 | ✓ | % | Reverb send amount |
| **DLY** | `delaySend` | 0–100 | 0 | ✓ | % | Delay send amount |
| **CLOUD** | `cloudsSend` | 0–100 | 0 | ✓ | % | Clouds FX send (when fxMode = 'clouds') |

**Note:** Global reverb/delay mix is fixed at 100% — per-voice sends control signal routing amount.

### Polyphony

| Parameter | State Key | Range | Default | Description |
|-----------|-----------|-------|---------|-------------|
| **Polyphony Mode** | `polyphonyMode` | 0–8 | 0 | Number of simultaneous voices (0 = mono) |

**Note:** SLICE engine supports polyphony (1-8 voices) when multiple notes are triggered within the GATE period. Mono mode (0) enforces single-voice retriggering.

---

## Internal Parameters

Parameters not directly user-accessible but stored in state for engine operation.

### Slice Configuration

| Parameter | State Key | Type | Description |
|-----------|-----------|------|-------------|
| **Slice Config** | `sliceConfig` | Object | Slice metadata (markers, BPM, sample rate) |
| **Slice Buffer** | `sliceBuffer` | AudioBuffer | Full source audio buffer |
| **Slice Count** | `sliceConfig.slices.length` | Number | Total number of slices |

#### Slice Config Structure

```javascript
sliceConfig = {
    slices: [
        { start: 0, end: 4800 },       // Slice 0
        { start: 4800, end: 9600 },    // Slice 1
        // ... additional slices
    ],
    bpm: 140,                          // Detected/user-set BPM
    sampleRate: 48000,                 // Original sample rate
    totalSamples: 120000               // Total buffer length
}
```

### Playback State (Internal)

These parameters are managed by the `SamplerEngine` class and not exposed in state:

| Parameter | Type | Description |
|-----------|------|-------------|
| `playbackPosition` | Number | Current sample position within slice |
| `playbackRate` | Number | Calculated from PITCH parameter |
| `playbackStart` | Number | Slice start position (sample index) |
| `playbackEnd` | Number | Slice end position (sample index) |
| `isPlaying` | Boolean | Playback active state |
| `sliceMode` | Boolean | true = slice mode, false = full buffer |

---

## Parameter Interactions

How SLICE parameters interact with each other and affect sound.

### PITCH × DECAY Interaction

**Relationship:** Decay envelope compensates for pitch-shifted playback duration.

**Example:**
- Slice natural duration: 200ms
- DECAY = 50 (55% of slice length)

| PITCH | Playback Rate | Actual Duration | Decay Time | Result |
|-------|---------------|-----------------|------------|--------|
| 0 (original) | 1.0× | 200ms | 110ms | Natural decay |
| +12 (octave up) | 2.0× | 100ms | 55ms | Decay scales down |
| -12 (octave down) | 0.5× | 400ms | 220ms | Decay scales up |

**Outcome:** The decay envelope *feels* the same regardless of pitch transposition.

### FILTER × PITCH Interaction

**Relationship:** Independent (no automatic compensation).

**Considerations:**
- Highpass filter + low pitch = thin, weak sound
- Lowpass filter + high pitch = muffled, dull sound

**Recommendation:** Use complementary settings:
- Low pitch (-12 to -24) + lowpass filter (20-40) = warm, deep tone
- High pitch (+12 to +24) + highpass filter (60-80) = bright, crispy tone

### SLICE × DECAY Interaction

**Relationship:** Decay percentage applies to *selected slice's duration*, not entire buffer.

**Example:**
- Slice 0 = 50ms, Slice 3 = 200ms
- DECAY = 50 (55% of slice)

| Selected Slice | Slice Duration | Decay Time |
|----------------|----------------|------------|
| Slice 0 | 50ms | 27.5ms |
| Slice 3 | 200ms | 110ms |

**Outcome:** Each slice gets proportionally scaled decay based on its individual length.

### LEVEL × DRIVE Interaction

**Signal Chain:** Sample playback → Decay envelope → Filter → Drive → Level

**Consideration:** High LEVEL + high DRIVE = potential clipping/distortion.

**Recommendation:**
- Reduce LEVEL when using high DRIVE (60+)
- Or reduce DRIVE when boosting LEVEL
- Monitor Drum Bus output meter for clipping

---

## PPMod Integration

All four SLICE macros support full PPMod (per-parameter modulation) with 6 available modes.

### Modulatable Parameters

| Macro | State Key | PPMod Modes | Common Uses |
|-------|-----------|-------------|-------------|
| **PATCH** | `sliceIndex` | LFO, RND, SEQ, TM, ENV, EF | Cycling slices, random selection, sequenced patterns |
| **DEPTH** | `samplerDecay` | LFO, ENV, EF, RND | Dynamic decay, envelope-based shaping |
| **RATE** | `samplerFilter` | LFO, ENV, EF, RND | Filter sweeps, wah effects, envelope following |
| **PITCH** | `samplerPitch` | LFO, SEQ, ENV, RND | Melodic sequences, pitch wobble, tape-stop effects |

### PPMod Examples

#### Cycling Slices (PATCH + LFO)

```
Target: PATCH (sliceIndex)
Mode: LFO
Waveform: Triangle
Rate: 1/4 (clock-synced)
Depth: 100%
Offset: 0%
```
**Result:** Cycles through all slices every 4 beats (smooth transition).

#### Random Slice Triggering (PATCH + RND)

```
Target: PATCH (sliceIndex)
Mode: RND
Bit Length: 16
Probability: 100%
Depth: 100%
```
**Result:** Random slice selection on each trigger (glitchy, unpredictable).

#### Tape-Stop Effect (PITCH + ENV)

```
Target: PITCH (samplerPitch)
Mode: ENV
Attack: 5ms
Release: 200ms
Curve: Exponential
Depth: -100% (drops from 0 to -24 semitones)
```
**Result:** Classic tape-stop pitch dive on each trigger.

#### Filter Sweep (RATE + LFO)

```
Target: RATE (samplerFilter)
Mode: LFO
Waveform: Sine
Rate: 2Hz (free-running)
Depth: 80%
Offset: 50% (centres around bypass point)
```
**Result:** Sweeping lowpass/highpass filter (wah effect).

#### Dynamic Decay (DEPTH + ENV)

```
Target: DEPTH (samplerDecay)
Mode: ENV
Attack: 1ms
Release: 150ms
Depth: -60% (shortens decay on each hit)
```
**Result:** Accent-like envelope shaping (tight attack, longer natural decay).

#### Melodic Slice Sequence (PITCH + SEQ)

```
Target: PITCH (samplerPitch)
Mode: SEQ
Pattern: [0, +3, +7, +12] (root, minor 3rd, 5th, octave)
Length: 4 steps
Depth: 100%
```
**Result:** Slice becomes a melodic instrument playing a minor chord arpeggio.

### Per-Voice vs Global

SLICE parameters are **per-voice** parameters:
- Each voice can modulate independently
- PPMod config stored per-voice in `perParamModulations`
- Example: `perParamModulations['voice.macroPitch']` with per-voice depth/waveform settings

**Global Effects** (reverb, delay, Clouds) use different PPMod architecture with trigger source selection.

---

## Related Documentation

- [SLICE Engine User Guide](../engines/baeng/slice.md) — Complete workflow and techniques
- [Bæng Parameter Reference](baeng-parameters.md) — All Bæng parameters
- [PPMod Overview](../modulation/ppmod-overview.md) — Per-parameter modulation system
- [PPMod Modes](../modulation/ppmod-modes.md) — Detailed mode documentation

---

## Changelog

**Version 1.0.0** (2025-12-30)
- Initial parameter reference for SLICE engine
- Documented percentage-based decay system
- Added pitch compensation details
- Included PPMod integration examples

---

**Document Version**: 1.0.0
**Last Updated**: 2025-12-30
**Bæng Version**: 1.2.0
**SLICE Engine**: sampler-engine.js (lines 1-461)
