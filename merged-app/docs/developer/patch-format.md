# Patch Format Specification

**Version**: 1.2.0
**Last Updated**: 2025-12-30

This document provides a complete technical specification of the unified patch format used by Bæng & Ræmbl. Patches are JSON files containing synthesiser state, sequences, effects, and modulations.

---

## Overview

The unified patch format enables saving and loading complete synthesiser sessions with both Bæng (drum machine) and Ræmbl (synth) configurations. Patches are **human-readable JSON** with semantic structure for easy manual editing and version control.

### Design Principles

- **Unified Structure**: Single file contains both apps + shared timing
- **Selective Loading**: Each app loads only its own section
- **Backward Compatibility**: Newer versions gracefully handle older patches
- **Forward Compatibility**: Older apps ignore unknown properties
- **Sparse Modulation Storage**: Only active modulations are serialised

### What's NOT Saved

Patches **do not** include:
- Audio buffers (DX7 banks, sample kits, slice audio)
- Runtime state (playback position, clock phase)
- UI preferences (theme, module visibility)
- Browser localStorage settings
- AudioContext or AudioWorklet instances

---

## Version History

### v1.0.0 (Initial Release)
- Unified `baeng` and `raembl` sections
- `shared` object with timing parameters (BPM, swing, bar lengths)
- Complete voice, sequence, and effects state
- **Limitations**: No per-parameter modulation support

### v1.1.0 (PPMod Release)
- Added `perParamModulations` object to both apps
- Backward compatible: missing modulations default to disabled
- Introduced `mode` property for modulation types (LFO, RND, ENV, EF, TM, SEQ)

### v1.2.0 (Multi-Engine Release)
- Added `engineType` property to Ræmbl (`subtractive` | `plaits` | `rings`)
- Added `plaitsEngine` and `ringsModel` indices
- Enhanced modulation storage with per-mode parameters
- **Current version** used by Ræmbl's `savePatch()`
- Bæng still saves v1.0.0 (to be updated)

---

## Schema Structure

### Root Object

```json
{
  "version": "1.2.0",
  "timestamp": "2025-01-28T14:30:00.000Z",
  "shared": { /* Shared Timing Object */ },
  "baeng": { /* Bæng State Object */ },
  "raembl": { /* Ræmbl State Object */ }
}
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `version` | String | Yes | Patch format version (SemVer) |
| `timestamp` | String | Yes | ISO 8601 timestamp of save |
| `shared` | Object | Yes | Shared timing parameters |
| `baeng` | Object | Optional | Bæng app state (omit if Ræmbl-only patch) |
| `raembl` | Object | Optional | Ræmbl app state (omit if Bæng-only patch) |

**Loading Behavior**:
- If `version` and `baeng`/`raembl` sections exist → Unified format
- Otherwise → Legacy single-app format (backward compatibility)

---

## Shared Timing Object

Controls synchronised timing across both apps.

```json
{
  "shared": {
    "bpm": 128,
    "swing": 55,
    "baengBarLength": 4,
    "raemblBarLength": 8
  }
}
```

| Property | Type | Range | Default | Description |
|----------|------|-------|---------|-------------|
| `bpm` | Number | 20-300 | 120 | Tempo in beats per minute |
| `swing` | Number | 0-100 | 0 | Swing amount (0 = straight, 100 = max shuffle) |
| `baengBarLength` | Number | 1-128 | 4 | Bæng pattern length in beats (quarter notes) |
| `raemblBarLength` | Number | 1-128 | 4 | Ræmbl pattern length in beats |

**Backward Compatibility**:
- v1.0.0 patches may use `barLength` (singular) → applied to both apps
- Newer format uses `baengBarLength` and `raemblBarLength` independently

---

## Bæng State Object

Complete state for the 6-voice drum machine.

### Top-Level Structure

```json
{
  "baeng": {
    "selectedVoice": 0,
    "editMode": "edit",
    "voices": [ /* 6 Voice Objects */ ],
    "sequences": [ /* 6 Sequence Objects */ ],
    "perParamModulations": { /* Modulation Configs */ },
    "reverbMix": 100,
    "reverbDecay": 50,
    "reverbDamping": 50,
    "reverbDiffusion": 60,
    "reverbPreDelay": 10,
    "delayMix": 100,
    "delayTime": 25,
    "delayFeedback": 0,
    "delayTimeFree": 50,
    "delaySyncEnabled": true,
    "delayWow": 10,
    "delayFlutter": 5,
    "delaySaturation": 0,
    "delayFilter": 50,
    "fxMode": "classic",
    "cloudsPosition": 50,
    "cloudsSize": 50,
    "cloudsDensity": 50,
    "cloudsTexture": 50,
    "cloudsPitch": 50,
    "cloudsSpread": 0,
    "cloudsFeedback": 0,
    "cloudsReverb": 0,
    "cloudsDryWet": 0,
    "cloudsInputGain": 50,
    "cloudsFreeze": false,
    "cloudsMode": 0,
    "cloudsQuality": 0,
    "drumBus": { /* Drum Bus Object */ },
    "sidechain": { /* Sidechain Object */ },
    "scaleQuantizeEnabled": false,
    "globalScale": 0,
    "globalRoot": 0
  }
}
```

### Voice Object (6 per patch)

```json
{
  "engine": "DX7",
  "outputMode": "OUT",
  "polyphonyMode": 0,
  "macroPatch": 0,
  "macroDepth": 50,
  "macroRate": 50,
  "macroPitch": 50,
  "dx7Patch": null,
  "dx7Algorithm": 1,
  "dx7Feedback": 0,
  "dx7Transpose": 0,
  "dx7FineTune": 0,
  "dx7EnvTimeScale": 1.0,
  "dx7PitchEnvDepth": 0,
  "dx7AttackScale": 1.0,
  "dx7ReleaseScale": 1.0,
  "dx7PatchName": "BRASS1",
  "dx7PatchIndex": 0,
  "dx7BankSize": 32,
  "gate": 80,
  "pan": 50,
  "level": 75,
  "bitReduction": 0,
  "drive": 0,
  "chokeGroup": 0,
  "muted": false,
  "reverbSend": 0,
  "delaySend": 0,
  "cloudsSend": 0
}
```

**Engine-Specific Properties**:

| Engine | Required Properties |
|--------|---------------------|
| `DX7` | `dx7PatchIndex`, `dx7BankSize`, `dx7Algorithm` |
| `SAMPLE` | `sampleIndex`, `samplerBank`, `samplerDecay`, `samplerFilter`, `samplerPitch` |
| `SLICE` | `sliceIndex`, `samplerDecay`, `samplerFilter`, `samplerPitch` |
| `aKICK`, `aSNARE`, `aHIHAT` | `analogKickTone`, `analogKickDecay`, etc. (engine-specific) |

**Important**: `dx7Patch` is serialised metadata only. AudioBuffers cannot be saved to JSON—users must reload DX7 banks after patch load.

### Sequence Object (6 per patch)

```json
{
  "length": 16,
  "probability": 100,
  "currentStep": -1,
  "steps": [
    {
      "gate": true,
      "accent": 8,
      "ratchet": 0,
      "probability": 100,
      "deviation": 0,
      "deviationMode": 1
    }
    // ... 63 more steps (64 total)
  ],
  "euclidean": {
    "steps": 16,
    "fills": 4,
    "shift": 0,
    "accentAmt": 0,
    "flamAmt": 0,
    "ratchetAmt": 0,
    "ratchetSpeed": 1,
    "deviation": 0
  }
}
```

### Drum Bus Object

```json
{
  "enabled": true,
  "driveType": 0,
  "driveAmount": 0,
  "crunch": 0,
  "transients": 50,
  "boomAmount": 0,
  "boomFreq": 33,
  "boomDecay": 50,
  "compEnabled": false,
  "dampenFreq": 100,
  "trimGain": 50,
  "outputGain": 75,
  "dryWet": 100
}
```

### Sidechain Object

```json
{
  "baengReverb": {
    "enabled": false,
    "voices": [true, false, false, false, false, false],
    "threshold": 30,
    "ratio": 80,
    "attack": 10,
    "release": 40,
    "range": 60
  },
  "baengDelay": { /* same structure */ },
  "baengClouds": { /* same structure */ },
  "raemblReverb": { /* same structure */ },
  "raemblDelay": { /* same structure */ },
  "raemblClouds": { /* same structure */ }
}
```

---

## Ræmbl State Object

Complete state for the monophonic/polyphonic synthesiser.

### Top-Level Structure

```json
{
  "raembl": {
    "engineType": "plaits",
    "plaitsEngine": 7,
    "ringsModel": 0,
    "steps": 16,
    "fills": 4,
    "rotation": 0,
    "accentAmt": 0,
    "slideAmt": 0,
    "trillAmt": 0,
    "gateLength": 80,
    "gatePattern": [],
    "accentPattern": [],
    "slidePattern": [],
    "trillPattern": [],
    "factorsAnimationMode": "animated",
    "lfoAmp": 36,
    "lfoFreq": 36,
    "lfoWaveform": 0,
    "lfoOffset": 0,
    "modLfoRate": 50,
    "modLfoWaveform": 0,
    "sample": 50,
    "prevSample": 30,
    "scale": 3,
    "root": 0,
    "probability": 100,
    "currentNote": "C3",
    "pathAnimationMode": "animated",
    "stepPitches": [],
    "reverbMix": 25,
    "diffusion": 60,
    "preDelay": 10,
    "reverbDecay": 70,
    "damping": 20,
    "delayMix": 25,
    "delayTime": 50,
    "delayTimeFree": 50,
    "delaySyncEnabled": true,
    "feedback": 40,
    "wow": 10,
    "flutter": 5,
    "saturation": 0,
    "fxMode": "classic",
    "cloudsPosition": 0,
    "cloudsSize": 0,
    "cloudsDensity": 50,
    "cloudsTexture": 50,
    "cloudsPitch": 50,
    "cloudsSpread": 50,
    "cloudsFeedback": 0,
    "cloudsReverb": 30,
    "cloudsDryWet": 0,
    "cloudsInputGain": 50,
    "cloudsFreeze": false,
    "mainTransposition": 4,
    "subTransposition": 2,
    "drift": 10,
    "glide": 0,
    "pulseWidth": 50,
    "pwmAmount": 0,
    "pitchMod": 0,
    "pwmSource": 0,
    "modSource": 0,
    "monoMode": true,
    "sawLevel": 75,
    "squareLevel": 0,
    "triangleLevel": 0,
    "subLevel": 50,
    "noiseLevel": 0,
    "highPass": 0,
    "lowPass": 75,
    "resonance": 20,
    "keyFollow": 0,
    "envAmount": 50,
    "filterMod": 0,
    "attack": 0,
    "decay": 25,
    "sustain": 50,
    "release": 75,
    "volume": 75,
    "plaitsHarmonics": 50,
    "plaitsTimbre": 50,
    "plaitsMorph": 50,
    "plaitsLpgDecay": 50,
    "plaitsLpgColour": 50,
    "plaitsMixOutAux": 0,
    "ringsStructure": 50,
    "ringsBrightness": 50,
    "ringsDamping": 50,
    "ringsPosition": 25,
    "ringsMixStrum": 50,
    "ringsPolyphony": 4,
    "perParamModulations": { /* Modulation Configs */ },
    "midiCCMappings": []
  }
}
```

### Engine Type Property (v1.2.0)

```json
{
  "engineType": "plaits",
  "plaitsEngine": 7,
  "ringsModel": 0
}
```

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `engineType` | String | `subtractive`, `plaits`, `rings` | Active synthesis engine |
| `plaitsEngine` | Number | 0-23 | Plaits model index (GREEN/RED/ORANGE banks) |
| `ringsModel` | Number | 0-5 | Rings resonator model (Modal/String/FM/etc.) |

**Backward Compatibility**:
- Missing `engineType` defaults to `subtractive`
- `plaitsEngine` and `ringsModel` ignored unless engine matches

---

## Modulation Format

Per-parameter modulation system (PPMod) added in **v1.1.0**.

### Storage Structure

Modulations are stored as **sparse objects**—only active modulations are serialised.

```json
{
  "perParamModulations": {
    "filter.lowPass": {
      "mode": "LFO",
      "enabled": true,
      "depth": 60,
      "offset": 0,
      "muted": false,
      "baseValue": 75,
      "lfoWaveform": 0,
      "lfoRate": 2.5,
      "lfoSync": false,
      "resetMode": "step"
    },
    "envelope.decay": {
      "mode": "ENV",
      "enabled": true,
      "depth": 50,
      "offset": 0,
      "muted": false,
      "baseValue": 25,
      "envAttackMs": 10,
      "envReleaseMs": 200,
      "envCurveShape": "exponential",
      "envSource": "noteOn"
    }
  }
}
```

### Common Modulation Properties

All modes share these base properties:

| Property | Type | Range | Default | Description |
|----------|------|-------|---------|-------------|
| `mode` | String | `LFO`, `RND`, `ENV`, `EF`, `TM`, `SEQ` | `LFO` | Modulation type |
| `enabled` | Boolean | - | `false` | Modulation active state |
| `depth` | Number | 0-100 | 50 | Modulation amount (%) |
| `offset` | Number | -100 to 100 | 0 | DC offset (%) |
| `muted` | Boolean | - | `false` | Temporary mute (preserves config) |
| `baseValue` | Number/Array | varies | `null` | Unmodulated parameter value |

**Bæng Per-Voice Modulation**:
- `baseValue` → Single number for global params
- `baseValues` → Array `[v0, v1, v2, v3, v4, v5]` for per-voice params

### Mode-Specific Properties

#### LFO Mode

```json
{
  "mode": "LFO",
  "lfoWaveform": 0,
  "lfoRate": 1.0,
  "lfoSync": false,
  "resetMode": "off",
  "triggerSource": "none"
}
```

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `lfoWaveform` | Number | 0-5 | 0=sine, 1=tri, 2=square, 3=saw, 4=ramp, 5=S&H |
| `lfoRate` | Number | 0.05-30 | LFO frequency (Hz) |
| `lfoSync` | Boolean | - | Sync to clock divisions |
| `resetMode` | String | `off`, `step`, `accent`, `bar` | Phase reset trigger (Bæng voice params) |
| `triggerSource` | String | `none`, `T1`-`T6`, `sum` | Trigger source (Bæng effect params) |

#### RND Mode (LFSR Random)

```json
{
  "mode": "RND",
  "rndBitLength": 16,
  "rndProbability": 100,
  "rndSampleRate": 1000
}
```

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `rndBitLength` | Number | 4, 8, 16, 32 | LFSR shift register length |
| `rndProbability` | Number | 0-100 | Output probability (%) |
| `rndSampleRate` | Number | 100-10000 | Sample rate (Hz) |

#### ENV Mode (Envelope)

```json
{
  "mode": "ENV",
  "envAttackMs": 10,
  "envReleaseMs": 200,
  "envCurveShape": "exponential",
  "envSource": "noteOn"
}
```

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `envAttackMs` | Number | 0.2-8000 | Attack time (ms) |
| `envReleaseMs` | Number | 0.2-8000 | Release/decay time (ms) |
| `envCurveShape` | String | `linear`, `exponential`, `logarithmic`, `sCurve` | Envelope curve |
| `envSource` | String | `noteOn`, `filter`, `amp`, `manual` | Trigger source |

#### EF Mode (Envelope Follower)

```json
{
  "mode": "EF",
  "efAttackMs": 10,
  "efReleaseMs": 100,
  "efSource": "input",
  "efSensitivity": 100
}
```

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `efAttackMs` | Number | 1-1000 | Follower attack (ms) |
| `efReleaseMs` | Number | 1-1000 | Follower release (ms) |
| `efSource` | String | `input`, `filter`, `amp` | Analysis source |
| `efSensitivity` | Number | 0-200 | Input gain (%) |

#### TM Mode (Turing Machine)

```json
{
  "mode": "TM",
  "tmLength": 8,
  "tmProbability": 50,
  "tmPattern": [0.2, 0.8, 0.5, 0.3, 0.9, 0.1, 0.6, 0.4],
  "tmLfsrState": 42
}
```

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `tmLength` | Number | 1-16 | Pattern length (steps) |
| `tmProbability` | Number | 0-100 | Mutation probability (%) |
| `tmPattern` | Array | 0-1 floats | Current pattern values |
| `tmLfsrState` | Number | 0-65535 | LFSR seed (for determinism) |

#### SEQ Mode (CV Sequencer)

```json
{
  "mode": "SEQ",
  "seqLength": 4,
  "seqPattern": [0.5, 0.75, 0.25, 1.0]
}
```

| Property | Type | Values | Description |
|----------|------|--------|-------------|
| `seqLength` | Number | 1-16 | Pattern length (steps) |
| `seqPattern` | Array | 0-1 floats | Step values |

---

## Backward Compatibility

### Loading v1.0.0 in v1.2.0

**Missing Properties**:
- `perParamModulations` → Defaults to empty object `{}`
- `engineType` → Defaults to `subtractive` (Ræmbl) or current engine (Bæng)

**Result**: Patch loads successfully with no modulations active.

### Loading v1.1.0 in v1.2.0

**Missing Properties**:
- `engineType` → Defaults to `subtractive`
- `plaitsEngine`, `ringsModel` → Ignored (not applicable)

**Result**: Modulations restored correctly, engine reverts to subtractive.

### Loading v1.2.0 in v1.1.0

**Unknown Properties**:
- `engineType`, `plaitsEngine`, `ringsModel` → Ignored (forward compatibility)

**Result**: Patch loads with subtractive engine, modulations work.

### Migration: `waveguideSend` → `cloudsSend`

Older Bæng patches may contain `waveguideSend` (removed in v1.2.0):

```javascript
// Automatic migration in applyLoadedPatchData()
if (patchData.voices[i].waveguideSend !== undefined) {
  state.voices[i].cloudsSend = patchData.voices[i].waveguideSend;
}
```

### Legacy `barLength` Handling

```json
// v1.0.0 format
{
  "shared": {
    "barLength": 8
  }
}

// Loaded as:
// state.baengBarLength = 8
// state.raemblBarLength = 8
```

---

## Example Patches

### Minimal Unified Patch (v1.2.0)

```json
{
  "version": "1.2.0",
  "timestamp": "2025-12-30T12:00:00.000Z",
  "shared": {
    "bpm": 128,
    "swing": 55,
    "baengBarLength": 4,
    "raemblBarLength": 8
  },
  "baeng": {
    "selectedVoice": 0,
    "voices": [
      {
        "engine": "aKICK",
        "outputMode": "OUT",
        "polyphonyMode": 0,
        "macroPatch": 50,
        "macroDepth": 50,
        "macroRate": 50,
        "macroPitch": 50,
        "analogKickTone": 50,
        "analogKickDecay": 50,
        "analogKickSweep": 50,
        "gate": 80,
        "pan": 50,
        "level": 85,
        "bitReduction": 0,
        "drive": 0,
        "chokeGroup": 1,
        "muted": false,
        "reverbSend": 0,
        "delaySend": 0,
        "cloudsSend": 0
      }
      // ... 5 more voices
    ],
    "sequences": [
      {
        "length": 16,
        "probability": 100,
        "currentStep": -1,
        "steps": [
          {
            "gate": true,
            "accent": 0,
            "ratchet": 0,
            "probability": 100,
            "deviation": 0,
            "deviationMode": 1
          }
          // ... 63 more steps
        ],
        "euclidean": {
          "steps": 16,
          "fills": 4,
          "shift": 0,
          "accentAmt": 0,
          "flamAmt": 0,
          "ratchetAmt": 0,
          "ratchetSpeed": 1,
          "deviation": 0
        }
      }
      // ... 5 more sequences
    ],
    "perParamModulations": {},
    "reverbMix": 100,
    "reverbDecay": 50,
    "reverbDamping": 50,
    "reverbDiffusion": 60,
    "reverbPreDelay": 10,
    "delayMix": 100,
    "delayTime": 25,
    "delayFeedback": 0,
    "fxMode": "classic",
    "drumBus": {
      "enabled": true,
      "driveType": 0,
      "driveAmount": 0,
      "crunch": 0,
      "transients": 50,
      "boomAmount": 0,
      "boomFreq": 33,
      "boomDecay": 50,
      "compEnabled": false,
      "dampenFreq": 100,
      "trimGain": 50,
      "outputGain": 75,
      "dryWet": 100
    }
  },
  "raembl": {
    "engineType": "plaits",
    "plaitsEngine": 7,
    "steps": 16,
    "fills": 4,
    "rotation": 0,
    "accentAmt": 0,
    "slideAmt": 0,
    "trillAmt": 0,
    "gateLength": 80,
    "scale": 3,
    "root": 0,
    "monoMode": true,
    "mainTransposition": 4,
    "subTransposition": 2,
    "plaitsHarmonics": 50,
    "plaitsTimbre": 50,
    "plaitsMorph": 50,
    "plaitsLpgDecay": 50,
    "plaitsLpgColour": 50,
    "plaitsMixOutAux": 0,
    "lowPass": 75,
    "resonance": 20,
    "attack": 0,
    "decay": 25,
    "sustain": 50,
    "release": 75,
    "volume": 75,
    "perParamModulations": {
      "plaits.timbre": {
        "mode": "LFO",
        "enabled": true,
        "depth": 40,
        "offset": 0,
        "muted": false,
        "baseValue": 50,
        "lfoWaveform": 0,
        "lfoRate": 0.5,
        "lfoSync": true,
        "resetMode": "bar"
      }
    }
  }
}
```

### Bæng-Only Patch (v1.0.0)

```json
{
  "version": "1.0.0",
  "timestamp": "2025-12-30T12:00:00.000Z",
  "shared": {
    "bpm": 140,
    "swing": 0,
    "baengBarLength": 4,
    "raemblBarLength": 4
  },
  "baeng": {
    "selectedVoice": 0,
    "voices": [ /* ... */ ],
    "sequences": [ /* ... */ ],
    "perParamModulations": {}
  }
}
```

**Note**: When loading Bæng-only patch, Ræmbl state is unaffected (except shared timing).

### Ræmbl-Only Patch with Modulation (v1.2.0)

```json
{
  "version": "1.2.0",
  "timestamp": "2025-12-30T12:00:00.000Z",
  "shared": {
    "bpm": 120,
    "swing": 50,
    "baengBarLength": 4,
    "raemblBarLength": 16
  },
  "raembl": {
    "engineType": "rings",
    "ringsModel": 2,
    "ringsPolyphony": 4,
    "ringsStructure": 60,
    "ringsBrightness": 70,
    "ringsDamping": 40,
    "ringsPosition": 25,
    "ringsMixStrum": 50,
    "perParamModulations": {
      "rings.brightness": {
        "mode": "ENV",
        "enabled": true,
        "depth": 80,
        "offset": 0,
        "muted": false,
        "baseValue": 70,
        "envAttackMs": 5,
        "envReleaseMs": 150,
        "envCurveShape": "exponential",
        "envSource": "noteOn"
      }
    }
  }
}
```

---

## Manual Editing Guidelines

Patches are human-readable JSON and can be manually edited for:
- Batch parameter changes across voices
- Modulation template creation
- Version control diff comparisons

### Safe Editing Practices

1. **Validate JSON syntax** before loading (use [jsonlint.com](https://jsonlint.com))
2. **Preserve array lengths**:
   - `voices` → exactly 6 objects (Bæng)
   - `sequences` → exactly 6 objects (Bæng)
   - `steps` → exactly 64 objects per sequence (Bæng)
3. **Respect parameter ranges** (see `parameterDefinitions` in state.js)
4. **Don't edit AudioBuffer references** (`dx7Patch`, `samplerBuffer`, etc.)

### Example: Batch Voice Level Adjustment

```bash
# Reduce all Bæng voice levels by 10dB
jq '.baeng.voices[].level -= 10' patch.json > patch_quieter.json
```

### Example: Template Modulation Creation

```json
// Save this as modulation-template.json
{
  "mode": "LFO",
  "enabled": true,
  "depth": 50,
  "offset": 0,
  "muted": false,
  "lfoWaveform": 0,
  "lfoRate": 2.0,
  "lfoSync": false,
  "resetMode": "off"
}

// Merge into patch manually or via script
```

---

## Implementation Notes

### Patch Save (Bæng)

```javascript
// File: merged-app/js/baeng/main.js:3418
function getPatchDataToSave() {
  const patchClone = JSON.parse(JSON.stringify(state));

  // Remove runtime properties
  const runtimeProps = ['isPlaying', 'currentStepIndex', 'displayBar', /* ... */];
  runtimeProps.forEach(prop => delete patchClone[prop]);

  // Create unified format
  return {
    version: '1.0.0', // TODO: Update to 1.2.0
    timestamp: new Date().toISOString(),
    shared: {
      bpm: state.bpm,
      swing: state.swing,
      baengBarLength: state.baengBarLength,
      raemblBarLength: state.raemblBarLength
    },
    baeng: patchClone
  };
}
```

### Patch Load (Ræmbl)

```javascript
// File: merged-app/js/raembl/main.js:128
async function applyLoadedPatchData(loadedPatch) {
  // Detect format
  let patchData, sharedData;
  if (loadedPatch.version && loadedPatch.raembl) {
    patchData = loadedPatch.raembl;
    sharedData = loadedPatch.shared;
  } else {
    patchData = loadedPatch; // Legacy format
  }

  // Update shared timing
  if (sharedData) {
    if (typeof sharedData.bpm === 'number') state.bpm = sharedData.bpm;
    if (typeof sharedData.swing === 'number') state.swing = sharedData.swing;

    // Backward compat: barLength vs. baengBarLength/raemblBarLength
    if (typeof sharedData.barLength === 'number') {
      state.baengBarLength = sharedData.barLength;
      state.raemblBarLength = sharedData.barLength;
    } else {
      if (typeof sharedData.baengBarLength === 'number')
        state.baengBarLength = sharedData.baengBarLength;
      if (typeof sharedData.raemblBarLength === 'number')
        state.raemblBarLength = sharedData.raemblBarLength;
    }
  }

  // Restore engine type (v1.2.0)
  if (!patchData.engineType) {
    state.engineType = 'subtractive';
  }

  // Apply all parameters via updateParameterById()
  // ...
}
```

---

## See Also

- [Patch Management (User Guide)](../user-guide/patch-management.md) – How to save/load patches
- [Unified Time System](./clock-system.md) – Shared timing synchronisation
- [Per-Parameter Modulation](../user-guide/ppmod.md) – Modulation system documentation
- [Architecture Overview](./architecture.md) – Merged app state management

---

**Contributors**: MidiSlave
**License**: Same as main project
**Feedback**: Open an issue on [GitHub](https://github.com/MidiSlave/baeng-and-raembl)
