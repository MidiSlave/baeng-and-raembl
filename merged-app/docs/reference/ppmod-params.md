# PPMod Parameter Reference

Complete parameter reference for the Per-Parameter Modulation (PPMod) system in Bæng & Ræmbl.

---

## Overview

This document provides detailed parameter specifications for all six PPMod modulation modes. Each mode has its own set of parameters that control its behaviour, along with common parameters shared across all modes.

For conceptual information about how each mode works, see [PPMod Modes Reference](../modulation/ppmod-modes.md).

---

## Common Parameters

All modulation modes share these parameters regardless of the selected mode:

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `enabled` | boolean | - | `false` | Enable/disable modulation for this parameter |
| `mode` | string | See table | `'LFO'` | Active modulation mode |
| `depth` | number | 0-100% | 50 | Modulation intensity/amount |
| `offset` | number | -100 to +100% | 0 | DC offset applied to modulation output |
| `muted` | boolean | - | `false` | Temporary mute (preserves all settings) |
| `baseValue` | number | Varies | - | Original parameter value (stored when modulation enabled) |

### Mode Values

| Value | Mode Name | Description |
|-------|-----------|-------------|
| `'LFO'` | Low-Frequency Oscillator | Periodic waveform modulation |
| `'RND'` | LFSR Random | Pseudo-random deterministic sequences |
| `'ENV'` | Envelope Generator | Attack-Decay envelope triggered on note events |
| `'EF'` | Envelope Follower | Audio amplitude tracking |
| `'TM'` | Turing Machine | Probabilistic step sequencer |
| `'SEQ'` | CV Sequencer | Traditional step sequencer |

### Per-Voice Parameters (Bæng)

For Bæng voice parameters, modulation supports independent per-voice configuration:

| Parameter | Type | Description |
|-----------|------|-------------|
| `isVoiceParam` | boolean | Indicates this is a per-voice parameter |
| `baseValues` | array[6] | Original values for each of the 6 voices |
| `voices` | array[6] | Independent modulation configs per voice (see structure below) |

**Voice Config Structure:**
```javascript
voices: [
  {
    enabled: true,
    mode: 'LFO',
    depth: 50,
    offset: 0,
    // ... mode-specific parameters
  },
  // ... 5 more voices (T1-T6)
]
```

### Per-Voice Parameters (Ræmbl)

Ræmbl uses keying to differentiate between MONO and POLY voice modulation:

| Mode | Key Format | Behaviour |
|------|------------|-----------|
| MONO | `paramId` | Single global modulation instance |
| POLY | `${voiceId}:${paramId}` | Independent modulation per voice (up to 8) |

**Voice Phase Offset (POLY mode):**
```javascript
const voiceOffset = (voiceId % 8) * 0.125; // Prevents unison
```

---

## Mode 1: LFO (Low-Frequency Oscillator)

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `lfoWaveform` | number | 0-5 | 0 | Waveform type (see waveform table) |
| `lfoRate` | number | 0.05-30 Hz | 1.0 | LFO frequency in Hz |
| `lfoSync` | boolean | - | `false` | Sync LFO to clock (rate becomes multiplier) |
| `lfoResetMode` | string | See table | `'off'` | Phase reset behaviour (voice params only) |
| `lfoTriggerSource` | string | See table | `'none'` | Trigger source (effect params only) |

### Waveform Values

| Value | Name | Shape | Output Range | Use Case |
|-------|------|-------|--------------|----------|
| 0 | Sine | Smooth bipolar | -1 to +1 | Natural vibrato, smooth sweeps |
| 1 | Triangle | Linear bipolar | -1 to +1 | Gentler than square, predictable |
| 2 | Square | Step bipolar | -1 to +1 | Rhythmic switching, hard transitions |
| 3 | Saw | Ramp down | -1 to +1 | Falling patterns, downward sweeps |
| 4 | Ramp | Ramp up | -1 to +1 | Rising patterns, upward sweeps |
| 5 | S&H | Random steps | -1 to +1 | Sample & hold, gate-triggered randomness |

### Reset Mode Values (Voice Parameters)

| Value | Trigger | Behaviour |
|-------|---------|-----------|
| `'off'` | None | Free-running LFO, never resets phase |
| `'step'` | Sequencer step | Reset phase to 0 when any step triggers |
| `'accent'` | Accent flag | Reset phase to 0 when accent is active |
| `'bar'` | Bar start | Reset phase to 0 at start of each bar |

### Trigger Source Values (Effect Parameters)

| Value | Description |
|-------|-------------|
| `'none'` | Free-running, no trigger |
| `'T1'` | Triggered by voice 1 (Bæng) |
| `'T2'` | Triggered by voice 2 (Bæng) |
| `'T3'` | Triggered by voice 3 (Bæng) |
| `'T4'` | Triggered by voice 4 (Bæng) |
| `'T5'` | Triggered by voice 5 (Bæng) |
| `'T6'` | Triggered by voice 6 (Bæng) |
| `'SUM'` | Triggered when any voice plays |

### Rate Ranges

| Sync Mode | Rate Meaning | Practical Range |
|-----------|--------------|-----------------|
| `lfoSync: false` | Frequency in Hz | 0.05 Hz (20s cycle) - 30 Hz |
| `lfoSync: true` | Clock multiplier | 0.05× (very slow) - 30× (very fast) |

---

## Mode 2: RND (LFSR Random)

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `rndBitLength` | number | 4, 8, 16, 32 | 16 | LFSR register size in bits |
| `rndProbability` | number | 0-100% | 50 | Probability of value change per sample |
| `rndSampleRate` | number | 100-10000 Hz | 1000 | Sample rate (values generated per second) |
| `rndSeed` | number | 0 to maxValue | maxValue | Initial LFSR state (for determinism) |

### Bit Length Values

| Value | Max Value | Pattern Length | Character | Typical Use |
|-------|-----------|----------------|-----------|-------------|
| 4 | 15 | 15 steps | Very short loops | Rhythmic patterns |
| 8 | 255 | 255 steps | Short sequences | Melodic phrases |
| 16 | 65,535 | 65,535 steps | Long evolution | Evolving textures |
| 32 | 4,294,967,295 | ~4.3 billion | Near-infinite | Maximum variation |

### Probability Guidelines

| Percentage | Behaviour | Character |
|------------|-----------|-----------|
| 0-20% | Rare changes | Mostly stable, occasional surprise |
| 30-40% | Slow drift | Gradual evolution |
| 50-60% | Balanced | Equal stability and chaos |
| 70-80% | Fast mutation | Frequent variation |
| 90-100% | Maximum chaos | Near-constant randomness |

### Sample Rate Guidelines

| Frequency | Update Speed | Character |
|-----------|--------------|-----------|
| 100-500 Hz | Slow | Gentle random drift |
| 500-2000 Hz | Medium | Rhythmic stepping |
| 2000-5000 Hz | Fast | Buzzy, granular texture |
| 5000-10000 Hz | Very fast | Near-continuous noise |

### LFSR Tap Configurations

These are hardcoded for maximal-length sequences (do not modify):

| Bit Length | Taps | Polynomial |
|------------|------|------------|
| 4 | [3, 2] | x^4 + x^3 + 1 |
| 8 | [7, 5, 4, 3] | x^8 + x^6 + x^5 + x^4 + 1 |
| 16 | [15, 14, 12, 3] | x^16 + x^15 + x^13 + x^4 + 1 |
| 32 | [31, 21, 1, 0] | x^32 + x^22 + x^2 + x^1 + 1 |

---

## Mode 3: ENV (Envelope Generator)

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `envAttackMs` | number | 0.2-8000 ms | 10 | Attack time (rise from 0 to peak) |
| `envReleaseMs` | number | 0.2-8000 ms | 200 | Release/decay time (fall from peak to 0) |
| `envCurveShape` | string | See table | `'exponential'` | Envelope curve shape |
| `envSource` | string | See table | `'noteOn'` | Envelope trigger source |

### Curve Shape Values

| Value | Attack Characteristic | Release Characteristic | Use Case |
|-------|----------------------|------------------------|----------|
| `'linear'` | Constant rate rise | Constant rate fall | Mechanical, predictable |
| `'exponential'` | Fast start, slow approach | Natural decay curve | Percussive, organic |
| `'logarithmic'` | Slow start, fast finish | Quick fade out | Swells, reverse effects |
| `'sCurve'` | Smooth acceleration/deceleration | Smooth both ends | Musical, flowing |

### Trigger Source Values

| Value | Trigger Event | Use Case |
|-------|---------------|----------|
| `'noteOn'` | MIDI note-on or sequencer trigger | Note-triggered envelopes |
| `'filter'` | Shares filter envelope timing | Linked to filter envelope |
| `'amp'` | Shares amplitude envelope timing | Linked to amp envelope |
| `'manual'` | Manual trigger via API | Programmatic control |

### Time Range Guidelines

| Time | Character | Typical Use |
|------|-----------|-------------|
| 0.2-10 ms | Instant | Clicks, percussive transients |
| 10-100 ms | Fast | Punchy attacks, snappy decays |
| 100-500 ms | Medium | Musical envelopes, plucks |
| 500-2000 ms | Slow | Pads, sweeps, evolving sounds |
| 2000-8000 ms | Very slow | Drones, atmospheric effects |

### Logarithmic Slider Mapping

Time sliders use logarithmic scaling for musical feel:

```javascript
// Slider position (0-100) to milliseconds
const minMs = 0.2;
const maxMs = 8000;
const logMin = Math.log(minMs);
const logMax = Math.log(maxMs);
const logValue = logMin + (sliderPos / 100) * (logMax - logMin);
const timeMs = Math.exp(logValue);
```

---

## Mode 4: EF (Envelope Follower)

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `efAttackMs` | number | 1-1000 ms | 10 | Rise time (follower attack/smoothing) |
| `efReleaseMs` | number | 1-1000 ms | 100 | Fall time (follower release/smoothing) |
| `efSensitivity` | number | 0-200% | 100 | Input gain/sensitivity multiplier |
| `efSource` | string | See table | `'raembl'` | Audio source to follow |

### Audio Source Values

| Value | Follows | Use Case |
|-------|---------|----------|
| `'raembl'` | Ræmbl master output | Ræmbl dynamics control |
| `'baeng'` | Bæng master output | Bæng dynamics control |
| `'master'` | Final master mix | Overall dynamics response |

### Time Characteristics

| Attack Time | Rise Speed | Use Case |
|-------------|------------|----------|
| 1-10 ms | Instant tracking | Fast transients, tight following |
| 10-50 ms | Fast response | Rhythmic following, percussive |
| 50-200 ms | Medium smooth | Musical envelope tracking |
| 200-1000 ms | Slow smooth | Averaged dynamics, gentle swell |

| Release Time | Fall Speed | Use Case |
|--------------|------------|----------|
| 1-10 ms | Instant drop | Tight gating, hard ducking |
| 10-50 ms | Fast decay | Punchy compression |
| 50-200 ms | Medium decay | Natural dynamics |
| 200-1000 ms | Slow decay | Smooth averaging, ambient |

### Sensitivity Guidelines

| Percentage | Behaviour |
|------------|-----------|
| 0-50% | Low sensitivity, requires loud signals |
| 50-100% | Normal sensitivity, balanced response |
| 100-150% | High sensitivity, responds to quiet signals |
| 150-200% | Maximum sensitivity, may saturate easily |

### K-Rate Smoothing Coefficients

Envelope follower uses exponential smoothing at 30 FPS (k-rate):

```javascript
const samplePeriodMs = 1000 / 30; // ~33.33ms
attackCoef = Math.exp(-samplePeriodMs / efAttackMs);
releaseCoef = Math.exp(-samplePeriodMs / efReleaseMs);
```

---

## Mode 5: TM (Turing Machine)

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `tmLength` | number | 1-16 steps | 8 | Pattern length in steps |
| `tmProbability` | number | 0-100% | 50 | Mutation probability per step advance |
| `tmPattern` | array[number] | [0-1, ...] | [0.5, ...] | Current step values (0-1 range) |
| `tmCurrentStep` | number | 0 to length-1 | 0 | Current playback step (read-only) |
| `tmLfsrState` | number | - | - | Internal LFSR state for deterministic randomness |

### Pattern Length Guidelines

| Length | Character | Musical Use |
|--------|-----------|-------------|
| 1-4 steps | Very short | Rapid variation, glitchy |
| 4-8 steps | Short | Rhythmic phrases, loops |
| 8-12 steps | Medium | Melodic sequences, evolving |
| 12-16 steps | Long | Complex patterns, slow evolution |

### Probability Behaviour

| Percentage | Stability | Description |
|------------|-----------|-------------|
| 0% | Locked | Pattern never changes (pure sequencer) |
| 10-20% | Highly stable | Rare mutations, mostly repeating |
| 30-40% | Semi-stable | Gradual evolution, recognisable |
| 50-60% | Balanced | Half predictable, half chaotic |
| 70-80% | Semi-chaotic | Frequent surprises, some continuity |
| 90-100% | Fully random | Maximum entropy, near-unpredictable |

### Pattern Value Range

Each step value is stored as a normalised float:

| Value | Output | Typical Mapping |
|-------|--------|-----------------|
| 0.0 | Minimum | Bottom of parameter range |
| 0.5 | Centre | Middle of parameter range |
| 1.0 | Maximum | Top of parameter range |

### UI Probability Scale (0-9)

The modal UI presents probability on a 0-9 scale for easier interaction:

| Scale | Probability | Visual Cue |
|-------|-------------|-----------|
| 0 | 0% | Fully locked |
| 1 | 11% | Very rare change |
| 2 | 22% | Rare change |
| 3 | 33% | Occasional change |
| 4 | 44% | Semi-frequent |
| 5 | 56% | Balanced chaos |
| 6 | 67% | Frequent change |
| 7 | 78% | Very frequent |
| 8 | 89% | Near-constant |
| 9 | 100% | Pure chaos |

**Conversion:**
```javascript
// 0-9 scale to 0-1 probability
probability = scale09 / 9;

// 0-1 probability to 0-9 scale
scale09 = Math.round(probability * 9);
```

---

## Mode 6: SEQ (CV Sequencer)

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `seqLength` | number | 4-16 steps | 4 | Pattern length in steps |
| `seqPattern` | array[number] | [0-1, ...] | [0.5, ...] | Step values (0-1 normalised) |
| `seqCurrentStep` | number | 0 to length-1 | 0 | Current playback step (read-only) |

### Pattern Length Guidelines

| Length | Character | Musical Use |
|--------|-----------|-------------|
| 4 steps | Very short | Simple rhythms, ostinatos |
| 6 steps | Short odd | Polyrhythmic, odd meter |
| 8 steps | Standard | Common phrase length |
| 12 steps | Medium odd | Complex patterns, triplet feel |
| 16 steps | Long | Extended sequences, evolving |

### Step Value Range

Each step stores a normalised value (0-1) that maps to the target parameter's range:

| Value | Output | Typical Mapping |
|-------|--------|-----------------|
| 0.0 | Minimum | Bottom of parameter range |
| 0.25 | Low | 25% of range |
| 0.5 | Centre | Middle of parameter range |
| 0.75 | High | 75% of range |
| 1.0 | Maximum | Top of parameter range |

### Pattern Editing

Steps can be edited in real-time via the modal UI:

**UI Interaction:**
- Drag vertically on step bar to set value
- Value updates immediately (even during playback)
- Current step highlighted during playback

**Programmatic Access:**
```javascript
// Set individual step
setStepValue(step, value) {
  values[step % length] = clamp(value, 0, 1);
}

// Set entire pattern
setValues(newPattern) {
  values = newPattern.slice(0, length);
}
```

### Length Change Behaviour

When `seqLength` is modified:

| Operation | Behaviour |
|-----------|-----------|
| **Extend** | New steps initialised to 0.5 (centre) |
| **Shorten** | Excess steps discarded (pattern truncated) |
| **Playhead** | Wraps to new length if beyond range (`currentStep % newLength`) |

---

## Parameter Validation

### Depth & Offset Clamping

All common parameters are clamped to valid ranges:

```javascript
depth = Math.max(0, Math.min(100, depth));    // 0-100%
offset = Math.max(-100, Math.min(100, offset)); // -100 to +100%
```

### Mode-Specific Validation

Each mode validates its parameters on load and update:

| Mode | Critical Validations |
|------|---------------------|
| LFO | `lfoWaveform` ∈ [0,5], `lfoRate` ∈ [0.05, 30] |
| RND | `rndBitLength` ∈ {4,8,16,32}, `rndSampleRate` ∈ [100, 10000] |
| ENV | `envAttackMs` ∈ [0.2, 8000], `envReleaseMs` ∈ [0.2, 8000] |
| EF | `efAttackMs` ∈ [1, 1000], `efReleaseMs` ∈ [1, 1000] |
| TM | `tmLength` ∈ [1, 16], `tmProbability` ∈ [0, 100] |
| SEQ | `seqLength` ∈ [4, 16], pattern values ∈ [0, 1] |

### Fallback Defaults

If a parameter is missing or invalid during patch load:

1. **Mode-specific param**: Uses mode default from tables above
2. **Common param**: Uses common default (depth=50, offset=0)
3. **Invalid mode**: Falls back to `'LFO'` mode
4. **Missing config**: Creates fresh default config

---

## Serialisation Format

### JSON Patch Structure

Modulation configs are stored under `perParamModulations` in patch JSON:

**Global Parameter (Ræmbl MONO / Bæng Effect):**
```json
{
  "perParamModulations": {
    "filter.lowPass": {
      "enabled": true,
      "mode": "LFO",
      "depth": 50,
      "offset": 0,
      "baseValue": 80,
      "lfoWaveform": 0,
      "lfoRate": 2.5,
      "lfoSync": true
    }
  }
}
```

**Per-Voice Parameter (Bæng):**
```json
{
  "perParamModulations": {
    "voice.macroPitch": {
      "isVoiceParam": true,
      "baseValues": [50, 50, 50, 50, 50, 50],
      "voices": [
        {
          "enabled": true,
          "mode": "ENV",
          "depth": 75,
          "offset": 0,
          "envAttackMs": 5,
          "envReleaseMs": 150,
          "envCurveShape": "exponential",
          "envSource": "noteOn"
        },
        // ... 5 more voice configs
      ]
    }
  }
}
```

**POLY Parameter (Ræmbl):**
POLY mode stores per-voice configs with colon-prefixed keys:
```json
{
  "perParamModulations": {
    "0:filter.lowPass": { /* Voice 0 config */ },
    "1:filter.lowPass": { /* Voice 1 config */ },
    // ... up to voice 7
  }
}
```

---

## Related Documentation

- **[PPMod Modes Reference](../modulation/ppmod-modes.md)** - Conceptual overview of each mode
- **[Ræmbl User Guide](../user-guide/raembl-guide.md)** - Ræmbl interface and workflow
- **[Bæng User Guide](../user-guide/baeng-guide.md)** - Bæng interface and workflow
- **[Ræmbl Parameters](raembl-parameters.md)** - Full Ræmbl parameter listing
- **[Bæng Parameters](baeng-parameters.md)** - Full Bæng parameter listing

---

**Last Updated**: 2025-12-30
**PPMod Version**: 1.0 (6-mode modal system)
**Patch Format**: v1.2.0
