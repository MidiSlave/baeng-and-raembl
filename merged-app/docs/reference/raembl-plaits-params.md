# Ræmbl Plaits Engine Parameter Reference

This document provides a complete technical reference for all parameters available when using the **Plaits multi-engine synthesiser** in Ræmbl. Plaits offers 24 synthesis engines across 3 colour-coded banks, controlled via a unified set of macro parameters.

For detailed information about each synthesis engine, see **[Plaits Engine Documentation](../engines/raembl/plaits-engine.md)**.

---

## Overview

The Plaits engine follows the "macro oscillator" paradigm, where a small set of high-level controls (HARMONICS, TIMBRE, MORPH) have musically meaningful, engine-specific behaviours. Unlike traditional synthesisers with dozens of low-level parameters, Plaits emphasises immediate musicality and exploration.

**Key Concepts:**
- **24 synthesis engines** organised into 3 banks (GREEN, RED, ORANGE)
- **6 macro controls** per engine (HARMONICS, TIMBRE, MORPH, LPG DECAY, LPG COLOUR, OUT/AUX)
- **Engine-specific parameter behaviour** - HARMONICS means different things for different engines
- **8-voice polyphony** with intelligent voice stealing
- **Dual outputs** - OUT (main) + AUX (sub-component or alternate processing)

---

## Reference Format

Each parameter table includes:
- **Parameter**: UI label and internal parameter ID
- **Range**: Minimum and maximum values (0-100 unless noted)
- **Default**: Initial value on patch reset
- **PPMod**: ✓ = Modulatable via Per-Parameter Modulation system
- **Description**: Functional description and behaviour

---

## 1. Engine Selection

Controls which synthesis engine and bank are active. Changing engines updates all voice nodes simultaneously.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **Engine Type** (`engineType`) | 'subtractive' \| 'plaits' \| 'rings' | 'subtractive' | | Master engine selector (switches between synthesis engines) |
| **Bank** | GREEN \| RED \| ORANGE | GREEN | | Engine bank selector (visual grouping, sets background colour) |
| **Model** (`plaits.model`) | 1-24 | 1 | ✓ | Active Plaits engine (1-24 mapped to internal 0-23) |

**Engine Banks:**
- **GREEN (0-7)**: Pitched/Harmonic engines (VA, Waveshaping, FM, Grain, Additive, Wavetable, Chord, Speech)
- **RED (8-15)**: Noise/Physical engines (Swarm, Noise, Particle, String, Modal, Bass Drum, Snare Drum, Hi-Hat)
- **ORANGE (16-23)**: Classic/FM engines (VA-VCF, Phase Distortion, Six-Op FM ×3, Wave Terrain, String Machine, Chiptune)

**State Keys:**
- `engineType` - `'plaits'` to activate Plaits engine
- `plaitsEngine` - Internal engine index (0-23)

**Notes:**
- Engine changes are applied to all active voices immediately
- Each voice tracks its current engine for proper PPMod routing
- See [Plaits Engine Documentation](../engines/raembl/plaits-engine.md) for complete engine descriptions

---

## 2. Primary Timbral Controls

The three main macro controls that shape the sound. Their exact behaviour varies per engine.

### HARMONICS

**Primary timbral control - the most important parameter**

HARMONICS is the first control you should adjust when exploring a new engine. It typically controls harmonic content, brightness, waveform selection, or modulation index depending on the engine.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **HARMONICS** (`plaits.harmonics`) | 0-100 | 50 | ✓ | Primary timbral control (engine-specific behaviour) |

**State Key:** `plaitsHarmonics` (0-100 in state, mapped to 0.0-1.0 for processor)

**Common Behaviours by Engine Type:**
- **Harmonic/Additive**: Harmonic content / brightness (Additive, VA, Grain)
- **FM**: Modulation index (FM, Six-Op FM)
- **Physical**: Pitch / resonance / material type (String, Modal, Drums)
- **Speech/Grain**: Formant frequency (Speech, Grain)
- **Waveform**: Waveform selection (VA, Wavetable)

**Examples:**
- **Engine 2 (FM)**: Modulation index (0% = pure sine, 100% = complex spectrum)
- **Engine 4 (Additive)**: Number of harmonics (0% = sine, 100% = 16 harmonics)
- **Engine 7 (Speech)**: Vowel selection (sweeps through a → e → i → o → u)
- **Engine 13 (Bass Drum)**: Pitch (0% = sub-bass kick, 100% = high tom)

---

### TIMBRE

**Secondary timbral control - refines the sound**

TIMBRE provides secondary timbral shaping. Often controls filter cutoff, frequency ratios, resonance, or waveshaper curves.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **TIMBRE** (`plaits.timbre`) | 0-100 | 50 | ✓ | Secondary timbral control (engine-specific behaviour) |

**State Key:** `plaitsTimbre` (0-100 in state, mapped to 0.0-1.0 for processor)

**Common Behaviours:**
- **FM**: Frequency ratio (0% = 1:1, 25% = 1:2, 50% = 1:3, etc.)
- **VA/Filter**: Filter cutoff frequency
- **Waveshaping**: Waveshaper curve selection
- **Physical**: Tone / brightness / resonance
- **Grain/Speech**: Formant width / resonance

**Examples:**
- **Engine 2 (FM)**: Frequency ratio (25% = 1:2 harmonic FM, non-integers for bells)
- **Engine 9 (Noise)**: Filter resonance (0% = gentle, 100% = self-oscillating)
- **Engine 7 (Speech)**: Formant shift (0% = male voice, 100% = female voice)
- **Engine 16 (VA-VCF)**: Filter cutoff (classic acid bass sweeps)

---

### MORPH

**Tertiary control - crossfades and special functions**

MORPH typically handles crossfades between sub-engines, feedback amounts, decay times, or harmonic balance.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **MORPH** (`plaits.morph`) | 0-100 | 50 | ✓ | Tertiary control / crossfade (engine-specific behaviour) |

**State Key:** `plaitsMorph` (0-100 in state, mapped to 0.0-1.0 for processor)

**Common Behaviours:**
- **Percussion**: Decay time (short ↔ long)
- **FM/Distortion**: Feedback amount
- **Additive**: Even/odd harmonic balance
- **Chord**: Chord spread / voicing (tight ↔ wide)
- **Granular**: Grain density

**Examples:**
- **Engine 2 (FM)**: Feedback amount (0% = clean, 100% = chaotic)
- **Engine 4 (Additive)**: Harmonic balance (0% = all harmonics, 100% = odd only)
- **Engine 6 (Chord)**: Chord spread (0% = tight, 100% = wide voicing)
- **Engine 13 (Bass Drum)**: Decay time (0% = tight kick, 100% = boomy sustain)

---

## 3. Low-Pass Gate (LPG) Controls

The LPG is a combined VCA + VCF envelope that creates organic, natural-sounding amplitude and brightness decay. Unlike the subtractive engine's separate amp + filter envelopes, the LPG uses a single decay-only envelope.

### LPG DECAY

**Decay envelope time**

Controls the decay time of the low-pass gate envelope. Affects both amplitude and brightness (depending on LPG COLOUR setting).

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **LPG DECAY** (`plaits.lpgDecay`) | 0-100 | 50 | ✓ | LPG decay time (0% ≈ 10ms, 100% ≈ 2 seconds) |

**State Key:** `plaitsLpgDecay` (0-100 in state, mapped to 0.0-1.0 for processor)

**Behaviour:**
- Short decay (0-30%): Percussive, plucky sounds
- Medium decay (40-60%): Rhythmic, gated sounds
- Long decay (70-100%): Sustained pads and drones
- **With accent enabled**: Decay is shortened for snappier attacks

**Automation Rate:** k-rate (control-rate updates)

**Internal Mapping:**
```
releaseTimeSec = (plaitsLpgDecay / 100) * 2.0 + 0.1
```

**Notes:**
- Accent reduces decay time by ~30% for punchier attacks
- Voices remain in "releasing" state until LPG decay completes (prevents premature cutoff)
- In poly mode, releasing voices are lower priority for stealing than free voices

---

### LPG COLOUR

**VCA ↔ VCF blend**

Adjusts the character of the low-pass gate from pure amplitude control (VCA) to combined amplitude + filter (VCF).

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **LPG COLOUR** (`plaits.lpgColour`) | 0-100 | 50 | ✓ | LPG character (0% = VCA only, 100% = VCA+VCF) |

**State Key:** `plaitsLpgColour` (0-100 in state, mapped to 0.0-1.0 for processor)

**Behaviour:**
- **Low colour (0-30%)**: Pure amplitude decay (brightness stays constant during decay)
- **High colour (70-100%)**: Brightness decays with amplitude (organic, natural)

**Use Cases:**
- **Low colour**: Percussive sounds where brightness should remain constant (hi-hats, claps)
- **High colour**: Emulating acoustic instruments where tone darkens with decay (plucks, mallets, strings)
- **Mid colour**: Gentle brightness envelope without complete darkness

**Automation Rate:** k-rate (control-rate updates)

---

## 4. Output Routing

Controls the blend between the main output (OUT) and auxiliary output (AUX). Most engines generate two outputs with different signal content.

### OUT/AUX MIX

**Main output vs auxiliary output crossfade**

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **OUT/AUX MIX** (`plaits.mixOutAux`) | 0-100 | 0 | ✓ | Output crossfade (0% = OUT only, 100% = AUX only) |

**State Key:** `plaitsMixOutAux` (0-100 in state, mapped to 0.0-1.0 for processor)

**Output Types by Engine:**

| Engine | OUT Output | AUX Output |
|--------|------------|------------|
| **FM (2)** | Full FM sound | Modulator only (raw carrier) |
| **Additive (4)** | Full harmonic series | Fundamental only (sine) |
| **Chord (6)** | Full chord | Root note only |
| **Speech (7)** | Formant-filtered speech | Raw excitation signal |
| **Noise (9)** | Filtered noise | Unfiltered white noise |
| **String (11)** | Full string resonance | Excitation burst only |
| **Modal (12)** | Full modal resonance | Impact excitation only |

**Use Cases:**
- **Layering**: Blend AUX output for reinforced bass (e.g., Chord root + full chord)
- **Parallel processing**: Send OUT to reverb, AUX to dry signal
- **Exploration**: Many engines have musically useful AUX outputs worth exploring

**Automation Rate:** a-rate (audio-rate updates, smoothed internally)

---

## 5. Performance Controls

Special performance features inherited from Ræmbl's sequencer system.

| Parameter | Description |
|-----------|-------------|
| **Accent** | 1.5× velocity boost with snappier LPG decay (~30% shorter) |
| **Slide** | TB-303 style pitch glide (80ms mono, 40ms poly slide-into effect) |
| **Trill** | Rapid pitch oscillation to next scale degree (2-note offbeat, 3-note downbeat) |

**Accent Behaviour:**
- Velocity multiplied by 1.5× (capped at 1.0)
- LPG attack slightly shortened for punchier transient
- LPG decay reduced by ~30% for tighter envelope
- Use on downbeats or key rhythmic hits for groove emphasis

**Slide Behaviour:**
- **Mono Mode**: Pitch glides from previous note to current note over 80ms (TB-303 style)
  - Only works if a previous note exists (mono voice continuity)
  - Glide time can be extended via `glide` parameter (0-500ms)
- **Poly Mode**: Note starts -0.5 semitones flat and slides up over 40ms
  - Creates subtle pitch bend-in effect
  - Works even without previous note

**Trill Behaviour:**
- Alternates between main note and next scale note (determined by PATH module scale)
- 2-note trill on swung offbeats (16ths)
- 3-note trill on downbeats (even 16ths)
- Implemented via `pitchBend` AudioParam automation (not per-sample worklet code)

---

## 6. PPMod Integration

All Plaits parameters (except Model selection) support per-parameter modulation via Ræmbl's PPMod system.

### Modulatable Parameters

| Parameter | Param ID | Modulation Use Cases |
|-----------|----------|----------------------|
| **HARMONICS** | `plaits.harmonics` | Filter sweeps, timbral evolution, vowel morphing, brightness automation |
| **TIMBRE** | `plaits.timbre` | FM ratio sweeps, resonance wobbles, formant motion, cutoff LFOs |
| **MORPH** | `plaits.morph` | Crossfade automation, decay wobbles, feedback sweeps, harmonic shifts |
| **LPG DECAY** | `plaits.lpgDecay` | Rhythmic gating, decay randomisation, dynamic envelope times |
| **LPG COLOUR** | `plaits.lpgColour` | Brightness envelope modulation, dynamic tone shaping |
| **OUT/AUX** | `plaits.mixOutAux` | Output routing modulation, layer crossfades, dynamic blending |

### Modulation Modes

PPMod supports 6 modulation modes (all k-rate, 30 FPS updates):

| Mode | Description | Best For |
|------|-------------|----------|
| **LFO** | Low-frequency oscillator | Filter sweeps, vibrato, tremolo, cyclic motion |
| **RND** | LFSR-based random | Randomised brightness, sample-and-hold textures |
| **ENV** | AD/ADSR envelope | Attack sweeps, decay modulation, dynamic response |
| **EF** | Envelope follower | Dynamics-based modulation, auto-wah effects |
| **TM** | Probabilistic step sequencer | Rhythmic gating, pattern-based modulation |
| **SEQ** | CV sequencer | Stepped sequences, quantised modulation |

### Poly Mode PPMod

In poly mode, PPMod modulations are applied **per-voice** using compound keys:
```javascript
// Voice 0 modulating HARMONICS
const key = `0:plaits.harmonics`;

// Voice 3 modulating TIMBRE
const key = `3:plaits.timbre`;
```

**Benefits:**
- Each voice has independent LFO phase offsets (prevents unison)
- Envelope followers track per-voice dynamics
- Random modulation creates natural variation between notes

### Mono Mode PPMod

In mono mode, a single global modulation key is used:
```javascript
const key = `plaits.harmonics`; // No voice index prefix
```

All voices share the same modulation values, creating unified timbral motion.

### K-Rate vs Audio-Rate

Plaits PPMod runs at **k-rate (30 FPS, ~33ms updates)** on the main thread, NOT audio-rate in the worklet.

**Why K-Rate:**
- Human perception of modulation changes is ~50ms (30 FPS is sufficient)
- Avoids expensive per-sample calculations (Math.sin, Math.exp) in worklet
- <1% CPU overhead vs audio-rate modulation

**What This Means:**
- LFO/envelope modulation is smooth but not sample-accurate
- Perfect for musical modulation (filter sweeps, vibrato, tremolo)
- Not suitable for audio-rate FM (use engine's internal FM instead)

**Implementation:**
```javascript
// Modulation calculated at 30 FPS on main thread
requestAnimationFrame(() => {
  const modValue = calculateModulation(mod, now);
  audioParam.setTargetAtTime(modValue, now, 0.015); // 15ms slew
});
```

---

## 7. Voice Allocation and Polyphony

Plaits uses an 8-voice architecture with intelligent voice stealing and release tracking.

### Voice Pool Architecture

- **8 pre-allocated AudioWorkletNodes** (one per voice)
- Each voice is a separate `plaits-processor` AudioWorklet instance
- Voices persist for the entire session (no node creation overhead)

### Three-Tier Allocation Strategy

When a new note is triggered, the system searches for an available voice in this order:

**Tier 1: Free Voices**
- Voices that are not active and not releasing
- Preferred allocation target (zero glitching)

**Tier 2: Releasing Voices**
- Voices in release phase (still producing audio)
- Oldest releasing voice is chosen first (minimises audible cutoff)
- 25ms quick-release fade applied to prevent clicks

**Tier 3: Voice Stealing**
- Active voices (still playing)
- Oldest active voice is stolen
- 25ms quick-release fade applied to prevent clicks

**Benefits:**
- Smooth polyphony up to 8 voices
- Minimal audible glitches when exceeding voice count
- Prioritises musical playability over strict voice limits

### Release Tracking

Voices remain in "releasing" state after note-off until their LPG decay envelope completes.

**Release Time Calculation:**
```javascript
releaseTimeSec = (plaitsLpgDecay / 100) * 2.0 + 0.1; // 0.1-2.1 seconds
```

**Why This Matters:**
- Prevents premature release cutoff (decay phases ring out fully)
- Releasing voices are lower priority than free voices (better voice stealing)
- Ensures natural envelope decay behaviour

### Per-Voice Engine Tracking

Each voice in the pool tracks which Plaits engine it's currently using:
```javascript
voice.engineType = 'plaits';
voice.engine = 0-23; // Current Plaits engine index
```

**Benefits:**
- Per-voice PPMod routing (compound keys: `voiceIndex:plaits.harmonics`)
- Engine switching without note cutoff (all voices switch together)
- Diagnostic info (which voices are playing which engines)

---

## 8. Parameter Mapping

Plaits parameters are stored as 0-100 in state but mapped to 0-1 for the AudioWorklet processor.

| State Key | State Range | Processor Range | Mapping Type |
|-----------|-------------|-----------------|--------------|
| `plaitsEngine` | 0-23 (discrete) | 0-23 (int) | Direct (no scaling) |
| `plaitsHarmonics` | 0-100 | 0.0-1.0 | Linear (divide by 100) |
| `plaitsTimbre` | 0-100 | 0.0-1.0 | Linear (divide by 100) |
| `plaitsMorph` | 0-100 | 0.0-1.0 | Linear (divide by 100) |
| `plaitsLpgDecay` | 0-100 | 0.0-1.0 | Linear (divide by 100) |
| `plaitsLpgColour` | 0-100 | 0.0-1.0 | Linear (divide by 100) |
| `plaitsMixOutAux` | 0-100 | 0.0-1.0 | Linear (divide by 100) |

**Update Flow:**
```
UI Fader (0-100) → State (0-100) → AudioParam (0-1)
Patch Load (0-100) → State (0-100) → UI Fader (0-100) + AudioParam (0-1)
```

**AudioParam Automation Rates:**
- `harmonics`, `timbre`, `morph`, `pitchBend`: **a-rate** (audio-rate)
- `lpgDecay`, `lpgColour`: **k-rate** (control-rate)

---

## 9. FX Routing

Plaits voices connect to the same FX chain as subtractive voices, with mode-dependent routing.

### Classic Mode (Reverb + Delay)

```
Plaits Voice Node → Master Gain
                 └→ Reverb Send (parallel)
                 └→ Delay Send (parallel)
                 └→ Dry Signal Tap (for sidechain)
```

### Clouds Mode

```
Plaits Voice Node → Clouds Input Analyser → Clouds Processor → Master
```

**FX Mode Switching:**
- Handled by `audio.js:switchFxMode()`
- Disconnects and reconnects all voice nodes
- Preserves active voices (no note cutoff on mode change)

---

## 10. Patch Format

Plaits parameters are saved in the unified patch format v1.2.0+.

### Complete Plaits Patch Example

```json
{
  "version": "1.2.0",
  "sharedTiming": {
    "bpm": 120,
    "swing": 50,
    "barLength": 4
  },
  "raembl": {
    "engineType": "plaits",
    "plaitsEngine": 2,
    "plaitsHarmonics": 60,
    "plaitsTimbre": 45,
    "plaitsMorph": 30,
    "plaitsLpgDecay": 50,
    "plaitsLpgColour": 70,
    "plaitsMixOutAux": 0,
    "monoMode": true,
    "volume": 75,
    "modulations": {
      "plaits.harmonics": {
        "mode": "LFO",
        "enabled": true,
        "depth": 40,
        "offset": 0,
        "lfoWaveform": 0,
        "lfoRate": 2.5,
        "lfoSync": false,
        "resetMode": "off"
      },
      "plaits.timbre": {
        "mode": "ENV",
        "enabled": true,
        "depth": 60,
        "offset": 0,
        "envAttackMs": 50,
        "envReleaseMs": 200,
        "envCurveShape": "exponential"
      }
    }
  }
}
```

### Backward Compatibility

- Patches without `engineType` default to `'subtractive'`
- Plaits parameters are ignored if engine isn't Plaits
- Missing Plaits params use defaults (50 for most, 0 for `mixOutAux`)
- Modulations without `mode` property default to `'LFO'` (v1.0.0 compatibility)

---

## 11. Sound Design Quick Reference

Practical parameter starting points for common sounds using Plaits engines.

### Warm FM Bass (Engine 2: FM)

| Parameter | Value | Reason |
|-----------|-------|--------|
| HARMONICS | 40-60% | Moderate modulation index for warmth |
| TIMBRE | 25% | 1:2 ratio for harmonic FM |
| MORPH | 10-20% | Subtle feedback adds body |
| LPG DECAY | 30-40% | Punchy bass decay |
| LPG COLOUR | 80-100% | Tone decays with amplitude (natural) |

Add mono mode + slide for TB-303 style basslines.

### Vowel Pad (Engine 7: Speech)

| Parameter | Value | Reason |
|-----------|-------|--------|
| HARMONICS | 50% | Neutral vowel starting point |
| TIMBRE | 70% | Female vocal range |
| MORPH | 30% | Voiced excitation (not breathy) |
| LPG DECAY | 90% | Long sustain for pads |
| LPG COLOUR | 60% | Moderate tone decay |

Modulate HARMONICS with slow LFO (0.2Hz sine, 40% depth) for vowel morphing.

### 808 Kick (Engine 13: Bass Drum)

| Parameter | Value | Reason |
|-----------|-------|--------|
| HARMONICS | 10-15% | Sub-bass pitch range |
| TIMBRE | 20% | Dark, subby tone |
| MORPH | 25-35% | Punchy decay time |
| LPG DECAY | 30% | Additional envelope shaping |
| LPG COLOUR | 90% | Brightness decays quickly |

Use mono mode to prevent overlapping kicks.

### Metallic Bell (Engine 12: Modal)

| Parameter | Value | Reason |
|-----------|-------|--------|
| HARMONICS | 80-90% | Metallic material type |
| TIMBRE | 50-60% | Bell-like mode ratios |
| MORPH | 70-90% | Long, ringing decay |
| LPG DECAY | 80% | Slow fade for sustain |
| LPG COLOUR | 70% | Natural brightness decay |

Add reverb (40-60% send) for space and depth.

### Granular Texture (Engine 3: Grain)

| Parameter | Value | Reason |
|-----------|-------|--------|
| HARMONICS | 60% | Mid-formant frequency |
| TIMBRE | 80% | Wide, breathy formant |
| MORPH | 90% | Dense grain cloud |
| LPG DECAY | 95% | Long sustain for texture |
| LPG COLOUR | 40% | Brightness stays constant |

Modulate MORPH with RND (16-bit LFSR, 60% depth) for organic variation.

---

## See Also

- **[Plaits Engine Documentation](../engines/raembl/plaits-engine.md)** - Complete guide to all 24 synthesis engines
- **[Ræmbl Parameters Reference](./raembl-parameters.md)** - All Ræmbl parameters (subtractive, Rings, etc.)
- **[Ræmbl User Guide](../user-guide/raembl-guide.md)** - Complete Ræmbl synthesiser guide
- **[PPMod System](../modulation/ppmod.md)** - Per-parameter modulation system
- **[Rings Engine](../engines/raembl/rings-engine.md)** - Physical modelling resonator alternative

---

**Version:** 1.0
**Last Updated:** 2025-12-30
**Plaits Firmware Version:** Mutable Instruments Plaits 1.2 (C++ → JavaScript port)
