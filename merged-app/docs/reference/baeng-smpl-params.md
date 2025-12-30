# Bæng SMPL Engine Parameters

Complete reference for the SAMPLE engine in Bæng's per-voice synthesis system.

## Overview

The SAMPLE engine is a flexible sample player with independent per-voice banks, pitch shifting, envelope control, and filtering. Each voice can load a different sample bank, allowing simultaneous playback of multiple kits (e.g., Voice 1 = 808, Voice 2 = 909, Voice 3 = Acoustic).

**Key Features:**
- Per-voice sample bank selection
- Independent sample banks per voice (SLICE pattern)
- Pitch shifting via playback rate (−24 to +24 semitones)
- Decay envelope with percentage-based scaling
- Bi-directional filter (lowpass/highpass with centre bypass)
- Polyphony support (mono/P2/P4 modes)

---

## 1. Sample Selection

### 1.1 Sample Index

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| sampleIndex | 0–127 | 0 | ✓ | Currently selected sample within the voice's bank |

**Implementation:**
- Controlled by the `PATCH` macro knob (0–100 maps to bank sample count)
- Index is 0-based (first sample = 0)
- If index exceeds bank size, wraps to first sample
- PPMod can cycle through samples dynamically

**Bank Selection:**
- Each voice stores its own `samplerBuffer` array (independent banks)
- Banks are loaded via the sample loader UI
- Bank name displayed in voice settings
- Banks persist in patch files (manifest stored, buffers reloaded)

---

## 2. Pitch & Tuning

### 2.1 Pitch Shift

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| macroPitch | 0–100 | 50 | ✓ | Pitch shift control (50 = no shift) |

**Pitch Mapping:**
- 0–100 maps to −24 to +24 semitones (exponential)
- 50 = original pitch (1.0× playback rate)
- Implemented via playback rate adjustment: `rate = 2^(semitones/12)`

**Notes:**
- Pitch shift affects sample duration (higher pitch = shorter, lower = longer)
- Decay envelope compensates for pitch changes (see Decay section)
- PPMod can create pitch sequences or vibrato effects

---

## 3. Amplitude Control

### 3.1 Decay Envelope

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| samplerDecay | 0–100 | 100 | ✓ | Amplitude decay amount |

**Decay Behaviour:**
- 0–99: Exponential decay envelope applied
- 100: No envelope (full sample playback)
- Decay time scales with sample length (not absolute time)

**Decay Percentage Calculation:**
- Decay value maps to 10%–110% of sample duration
- 0 = 10% (very punchy, cuts sample short)
- 50 = 60% (moderate decay)
- 99 = 110% (extends slightly beyond natural sample end)

**Pitch-Aware Scaling:**
The decay envelope compensates for pitch shift to maintain consistent perceived decay regardless of playback rate:
```
sliceLengthSamples = sampleLength / playbackRate
sliceDurationMs = (sliceLengthSamples / sampleRate) × 1000
decayPercentage = 0.1 + (decay / 99) × 1.0
targetDecayMs = sliceDurationMs × decayPercentage
```

**Example:**
- 1000ms sample at +12 semitones (2× speed) = 500ms playback
- Decay = 50 → 60% of 500ms = 300ms decay time
- Same sample at original pitch = 600ms decay time

---

## 4. Filter

### 4.1 Tone Filter

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| samplerFilter | 0–100 | 50 | ✓ | Bi-directional filter control |

**Filter Modes:**

| Range | Mode | Cutoff Frequency | Description |
|-------|------|------------------|-------------|
| 0–49 | Lowpass | 4000 Hz → 200 Hz | Darker tone, removes highs |
| 50 | Bypass | — | No filtering (transparent) |
| 51–100 | Highpass | 200 Hz → 4000 Hz | Brighter tone, removes lows |

**Cutoff Mapping:**
- **Lowpass (0–49):**
  - `norm = (50 − filter) / 50`
  - `cutoff = 4000 × 0.05^norm` (exponential, 4kHz down to 200Hz)
- **Highpass (51–100):**
  - `norm = (filter − 50) / 50`
  - `cutoff = 200 × 20^norm` (exponential, 200Hz up to 4kHz)

**Filter Type:**
- State Variable Filter (SVF) with Q = 0.5 (gentle rolloff)
- 12dB/octave slope
- No resonance (designed for tonal shaping, not synthesis)

---

## 5. Playback & Polyphony

### 5.1 Voice Management

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| polyphonyMode | 0–2 | 0 | — | Polyphony setting (0=MONO, 1=P2, 2=P4) |

**Polyphony Modes:**
- **MONO (0)**: Monophonic (one voice at a time, previous voice released)
- **P2 (1)**: 2-voice polyphony (up to 2 simultaneous samples)
- **P4 (2)**: 4-voice polyphony (up to 4 simultaneous samples)

**Voice Stealing:**
- When polyphony limit reached, oldest voice is stolen
- Stolen voices fade out smoothly (no clicks)
- Ratchets do not trigger voice stealing (all substeps play)

### 5.2 Gate Duration

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| gate | 0–100 | 80 | ✓ | Note duration control (0–100%) |

**Gate Behaviour:**
- Controls how long the sample plays before forced cutoff
- 0 = immediate cutoff (click/perc sound)
- 100 = full sample duration (natural decay)
- In MONO mode, gate < 100 creates staccato articulation
- Gate ≥ 100 in MONO mode does NOT trigger slide (unlike DX7 engine)

---

## 6. Effects Sends

### 6.1 Global FX Routing

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| level | 0–100 | 100 | ✓ | Voice master level |
| pan | 0–100 | 50 | ✓ | Stereo pan position (0=left, 50=centre, 100=right) |
| reverbSend | 0–100 | 0 | ✓ | Reverb send amount |
| delaySend | 0–100 | 0 | ✓ | Delay send amount |
| cloudsSend | 0–100 | 0 | ✓ | Clouds FX send amount |

**FX Modes:**
- **Classic Mode**: Independent reverb + delay sends
- **Clouds Mode**: Granular/spectral processing (replaces reverb/delay)

### 6.2 Processing

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| bitReduction | 0–100 | 0 | ✓ | Bit depth reduction (0=16-bit, 100=1-bit) |
| drive | 0–100 | 0 | ✓ | Saturation/distortion amount |

**Bit Reduction:**
- 0 = 16-bit (clean)
- 50 = 4-bit (lo-fi)
- 100 = 1-bit (extreme distortion)

**Drive:**
- Soft/medium/hard waveshaper modes available
- Adds harmonic saturation and compression

---

## 7. Sample Banks

### 7.1 Bank Structure

**Per-Voice Bank Storage:**
```javascript
voice.samplerBuffer = [
  { name: "Kick", buffer: AudioBuffer },
  { name: "Snare", buffer: AudioBuffer },
  { name: "Hat", buffer: AudioBuffer },
  // ... up to 128 samples
]
```

**Bank Metadata:**
- `samplerBank`: Bank name (string, for UI display)
- `samplerManifest`: Original manifest (for patch serialisation)
- `samplerBuffer`: Array of `{name, buffer}` objects

### 7.2 Loading Samples

**Methods:**
1. **Drag & Drop**: Drop audio files directly onto voice
2. **File Browser**: Select bank manifest JSON file
3. **Preset Banks**: Load built-in kits (808, 909, etc.)

**Supported Formats:**
- WAV (recommended)
- MP3
- OGG

**Bank Manifest Format:**
```json
{
  "name": "TR-808",
  "samples": {
    "0": "path/to/kick.wav",
    "1": "path/to/snare.wav",
    "2": "path/to/hat.wav"
  },
  "mapping": {
    "0": "Bass Drum",
    "1": "Snare Drum",
    "2": "Closed Hat"
  }
}
```

---

## 8. Patch Storage

### 8.1 Saved Parameters

**Per-Voice Settings (saved in patches):**
- `sampleIndex` — Current sample selection
- `samplerDecay` — Decay amount
- `samplerFilter` — Filter position
- `samplerPitch` — Pitch offset (DEPRECATED: use macroPitch)
- `samplerBank` — Bank name
- `samplerManifest` — Bank manifest (samples reloaded on patch load)

**NOT Saved:**
- `samplerBuffer` — AudioBuffer references (runtime only, regenerated from manifest)

### 8.2 Patch Loading

**Behaviour:**
1. Manifest loaded from patch JSON
2. Sample files fetched from URLs
3. Audio decoded and stored in `samplerBuffer` array
4. If samples unavailable, voice remains silent (no error)

---

## 9. PPMod Integration

All SAMPLE engine parameters marked with ✓ support per-parameter modulation (PPMod).

**Modulatable Parameters:**
- `sampleIndex` — Cycle through samples (LFO/SEQ modes)
- `macroPitch` — Pitch modulation (LFO for vibrato, ENV for pitch sweeps)
- `samplerDecay` — Dynamic envelope shaping
- `samplerFilter` — Filter sweeps (LFO/ENV modes)
- `level` — Tremolo/ducking effects
- `pan` — Auto-panning
- All FX sends — Rhythmic effect modulation

**Modulation Modes:**
- **LFO**: Sine/Triangle/Square/Saw waveforms (0.1–20 Hz)
- **RND**: LFSR-based random modulation
- **ENV**: AD/ADSR envelopes (attack/release)
- **EF**: Envelope follower (tracks audio amplitude)
- **TM**: Probabilistic step sequencer
- **SEQ**: CV sequencer (4–16 steps)

**Per-Voice vs Global:**
- Voice parameters (e.g., `sampleIndex`) = per-voice modulation (independent LFO per voice)
- Effect parameters (e.g., `reverbDecay`) = global modulation with trigger source selection

---

## 10. Related Documentation

- **[Bæng Parameters](./baeng-parameters.md)** — Complete parameter reference
- **[SMPL Engine](../engines/smpl.md)** — Engine architecture and implementation
- **[PPMod System](../modulation/ppmod.md)** — Per-parameter modulation guide
- **[Sample Banks](../assets/sample-banks.md)** — Available preset banks

---

## 11. Technical Notes

### 11.1 Decay Coefficient Calculation

The exponential envelope uses a decay coefficient calculated to reach silence threshold (0.00001) at the target decay time:

```javascript
targetSamples = (targetDecayMs / 1000) × sampleRate
threshold = 0.00001
decayCoeff = exp(ln(threshold) / targetSamples)
decayCoeff = clamp(decayCoeff, 0.5, 0.99999)
```

### 11.2 Anti-Click Fadeout

A 32-sample fadeout is applied near the end of playback to prevent clicks:

```javascript
samplesFromEnd = bufferEnd - playbackPosition
fadeoutSamples = 32
if (samplesFromEnd < fadeoutSamples) {
  fadeMultiplier = samplesFromEnd / fadeoutSamples
  sample *= fadeMultiplier
}
```

### 11.3 Linear Interpolation

Sample playback uses linear interpolation for smooth pitch shifting:

```javascript
index = floor(playbackPosition)
frac = playbackPosition - index
sample = bufferData[index] + (bufferData[index + 1] - bufferData[index]) × frac
playbackPosition += playbackRate
```

---

**Last Updated**: 2025-12-30
