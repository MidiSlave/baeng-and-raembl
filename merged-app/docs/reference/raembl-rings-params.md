# Ræmbl Rings Engine - Parameter Reference

**Complete technical reference for Mutable Instruments Rings physical modelling resonator parameters**

This document provides a comprehensive parameter reference for the Rings engine in Ræmbl. For conceptual information about the resonator models, sound design recipes, and usage guidelines, see the [Rings Engine Guide](../engines/raembl/rings-engine.md).

---

## Overview

The Rings engine uses physical modelling to simulate resonant structures (strings, plates, membranes) rather than traditional oscillator-filter synthesis. Parameters control physical properties like inharmonicity, excitation position, and decay time.

**Key Characteristics:**
- 6 resonator models + Easter Egg mode (Disastrous Peace polysynth)
- Internal 4-voice polyphony (M/P2/P4 modes)
- Model-specific parameter behaviour
- Stability validation for critical parameters
- Global PPMod only (no per-voice modulation)

---

## Parameter Summary Table

| Parameter | UI Label | State Key | Range | Default | PPMod | Description |
|-----------|----------|-----------|-------|---------|-------|-------------|
| Model | MDL | `ringsModel` | 0-5 | 0 | ✗ | Resonator model selection |
| Polyphony | POLY | `ringsPolyphony` | 1, 2, 4 | 4 | ✗ | Voice count (M/P2/P4) |
| Structure | STRUC | `ringsStructure` | 0-100 | 50 | ✓ | Inharmonicity/coupling/mode ratios |
| Brightness | BRIT | `ringsBrightness` | 0-100 | 50 | ✓ | High-frequency content |
| Damping | DAMP | `ringsDamping` | 0-100 | 50 | ✓ | Decay time/sustain |
| Position | POS | `ringsPosition` | 0-100 | 25 | ✓ | Excitation position (bow/pluck point) |
| Strum Mix | STRM | `ringsMixStrum` | 0-100 | 50 | ✓ | Internal excitation intensity |

**PPMod Note:** All modulatable Rings parameters use **global modulation only** (not per-voice). See [PPMod Integration](#ppmod-integration) for details.

---

## 1. Model Selection

### Parameter: `ringsModel`

**UI Label:** MDL
**Range:** 0-5 (discrete)
**Default:** 0 (Modal Resonator)
**Modulatable:** No
**Param ID:** `rings.model`

Selects the active resonator model. Each model uses a different physical modelling algorithm with unique timbral characteristics.

**Resonator Models:**

| Value | Model Name | Description | Physical Model |
|-------|------------|-------------|----------------|
| **0** | Modal Resonator | Bell/gong/bar tones | 64-mode SVF bank |
| **1** | Sympathetic String | Coupled string resonances | 8 Karplus-Strong strings |
| **2** | String | Plucked string synthesis | Karplus-Strong + dispersion |
| **3** | FM Voice | FM with envelope follower | 2-operator FM |
| **4** | Sympathetic String Quantised | Harmonic sympathetic strings | 8 quantised strings |
| **5** | String and Reverb | String + integrated reverb | Karplus-Strong + diffusion |

**Easter Egg Mode:**
Models 6+ (if accessible) enable "Disastrous Peace" - a 12-voice polyphonic synthesiser with PolyBLEP oscillators and 6 FX types. This mode is a hidden feature and not the primary use case for Rings.

**Model-Specific Behaviour:**
Each model interprets the STRUCTURE parameter differently (see [Structure Parameter](#3-structure) for details).

**Switching Models:**
Model changes are instant and affect all active voices. No audio glitches or cutoffs occur during model switching.

**Related Documentation:**
See [Rings Engine Guide: The 6 Resonator Models](../engines/raembl/rings-engine.md#the-6-resonator-models) for detailed model descriptions.

---

## 2. Polyphony Mode

### Parameter: `ringsPolyphony`

**UI Label:** POLY
**Range:** 1, 2, 4 (discrete)
**Default:** 4
**Modulatable:** No
**Param ID:** `rings.polyphony`

Controls the number of simultaneous voices available in the Rings processor. Polyphony is handled internally by the AudioWorklet processor, not via separate voice nodes.

**Polyphony Modes:**

| Value | Mode | Description | CPU Impact |
|-------|------|-------------|------------|
| **1** | M (Mono) | Single voice, new notes replace old | Low |
| **2** | P2 (Poly 2) | Two-voice polyphony, voice stealing on 3rd note | Medium |
| **4** | P4 (Poly 4) | Four-voice polyphony (maximum), voice stealing on 5th note | High |

**Voice Stealing:**
When polyphony is exceeded, the oldest active voice is stolen (replaced by the new note). Voice stealing uses a quick fade to prevent clicks.

**Mono Mode Behaviour:**
In mono mode (M), notes do not ring out - new notes immediately replace previous notes with no release phase. Slide works only in mono mode (pitch glides from previous note).

**Poly Mode Behaviour:**
In poly modes (P2/P4), notes can overlap and ring out naturally. Slide creates a "slide-into" effect (note starts -0.5 semitones flat and slides up over 40ms).

**Why Only 4 Voices?**
The original Rings Eurorack module was limited to 4 voices due to DSP constraints. This port preserves that limitation for authenticity and CPU efficiency.

**Comparison with Other Engines:**
- Subtractive engine: 8 voices (shared AudioWorklet)
- Plaits engine: 8 voices (8 separate AudioWorkletNodes)
- Rings engine: 4 voices (internal polyphony in single AudioWorkletNode)

**Easter Egg Mode:**
When Easter Egg mode is enabled, polyphony increases to 12 voices regardless of this setting.

---

## 3. Structure

### Parameter: `ringsStructure`

**UI Label:** STRUC
**Range:** 0-100
**Default:** 50
**Modulatable:** Yes (global only)
**Param ID:** `rings.structure`
**State Key:** `ringsStructure`

The primary timbral control for Rings. Its meaning varies significantly by resonator model. Controls inharmonicity, string coupling, mode ratios, or FM ratio depending on the selected model.

**Model-Specific Behaviour:**

| Model | STRUCTURE Controls | Low (0-30%) | Mid (40-60%) | High (70-100%) |
|-------|-------------------|-------------|--------------|----------------|
| **0 - Modal** | Mode frequency ratios | Harmonic (pitched) | Bell-like | Metallic/chaotic |
| **1 - Sympathetic** | Coupling strength | Minimal coupling | Moderate shimmer | Strong coupling |
| **2 - String** | Inharmonicity/dispersion | Perfect harmonics | Guitar/piano | Sitar/banjo |
| **3 - FM Voice** | Modulator ratio | Integer (harmonic) | Mid ratios | Inharmonic/bells |
| **4 - Sympathetic Q** | Coupling (quantised) | Isolated strings | Gentle coupling | Rich overtones |
| **5 - String + Reverb** | Inharmonicity | Harmonic | Moderate | Inharmonic |

**Stability Validation:**
STRUCTURE has model-specific safe maximum values to prevent numerical instability:

| Model | Safe Maximum | Reason |
|-------|-------------|--------|
| **0** | 95% | SVF Q-factor stability (unbounded growth above 95%) |
| **1** | 90% | Coupling stability (runaway feedback above 90%) |
| **2** | 100% | Karplus-Strong is stable at all values |
| **3** | 100% | FM is stable at all values |
| **4** | 85% | Stricter coupling limits (quantised harmonics) |
| **5** | 100% | String + reverb is stable |

**Validation Layer:**
The validation system (defined in `ringsValidation.js`) automatically clamps STRUCTURE to safe limits. If you set STRUCTURE to 98% on Modal resonator (model 0), it will be clamped to 95%.

**Instability Symptoms:**
- **Modal (0):** Harsh distortion, runaway resonance, piercing feedback
- **Sympathetic (1/4):** Chaotic coupling, excessive energy transfer between strings

**If Instability Occurs:**
Reduce STRUCTURE below 90% for all models. If distortion persists, also reduce BRIGHTNESS.

**Sound Design Tips:**
- Start at 50% and sweep to hear each model's timbral range
- Low values: More harmonic, tonal, musical
- High values: More inharmonic, chaotic, percussive
- Modulate with slow LFO (0.1-0.5Hz) for evolving timbres

**PPMod Use Cases:**
- **LFO mode:** Slow inharmonicity sweeps (modal bells evolving from harmonic to chaotic)
- **ENV mode:** Structure decays over time (sympathetic string coupling fades)
- **RND mode:** Random mode ratio shifts (unpredictable modal resonances)

**Related Documentation:**
See [Rings Engine Guide: STRUCTURE](../engines/raembl/rings-engine.md#structure) for detailed model-by-model descriptions.

---

## 4. Brightness

### Parameter: `ringsBrightness`

**UI Label:** BRIT
**Range:** 0-100
**Default:** 50
**Modulatable:** Yes (global only)
**Param ID:** `rings.brightness`
**State Key:** `ringsBrightness`

Controls the high-frequency content of the resonator by adjusting high-frequency damping. Low values create dark, muted tones; high values create bright, sizzling tones.

**Physical Behaviour:**
Brightness acts as a lowpass filter on the resonator's energy. It doesn't attenuate existing frequencies (like a traditional filter) - instead, it controls how quickly high-frequency modes decay.

**Timbral Range:**

| Range | Description | Use Cases |
|-------|-------------|-----------|
| **0-30%** | Dark, muted, mellow | Warm bass, subdued bells, wooden mallets |
| **40-60%** | Natural, balanced | Acoustic guitar, piano, general-purpose |
| **70-100%** | Bright, sizzling, trebly | Glass, metallic percussion, harpsichord |

**Model-Specific Behaviour:**
- **Modal (0):** Controls high-frequency mode amplitude
- **String (2/5):** High-frequency damping in waveguide
- **Sympathetic (1/4):** String brightness (affects all coupled strings)
- **FM Voice (3):** High-frequency content / harmonic brightness

**Interaction with DAMPING:**
BRIGHTNESS and DAMPING work together to shape decay behaviour. High BRIGHTNESS + low DAMPING = bright but short tones. Low BRIGHTNESS + high DAMPING = dark, sustained drones.

**Sound Design Tips:**
- Use low BRIGHTNESS (20-40%) for warm, intimate sounds
- Use high BRIGHTNESS (70-90%) for cutting, present tones
- Modulate with envelope for filter-like sweeps (envelope decays brightness after attack)

**PPMod Use Cases:**
- **ENV mode:** Brightness decays exponentially (like a lowpass filter envelope)
- **LFO mode:** Slow brightness wobble (evolving timbral motion)
- **SEQ mode:** Step-sequenced brightness pattern (rhythmic timbral variation)

**Note:**
Unlike STRUCTURE, BRIGHTNESS has no stability issues and can safely be set to any value (0-100%).

---

## 5. Damping

### Parameter: `ringsDamping`

**UI Label:** DAMP
**Range:** 0-100
**Default:** 50
**Modulatable:** Yes (global only)
**Param ID:** `rings.damping`
**State Key:** `ringsDamping`

Controls how long the resonator rings after being excited. Low values create short, staccato sounds; high values create long, sustained drones.

**Physical Behaviour:**
DAMPING controls energy loss in the resonator. Low damping means energy dissipates quickly (short decay). High damping means energy is sustained (long decay, drone-like).

**Decay Time Range:**

| Range | Description | Approx. Decay | Use Cases |
|-------|-------------|---------------|-----------|
| **0-30%** | Staccato, percussive | 50-200ms | Drums, mallets, pizzicato |
| **40-60%** | Balanced, musical | 500ms-2s | Guitar, piano, balanced tones |
| **70-100%** | Sustained, drone-like | 3-10s+ | Bowed strings, gongs, ambient pads |

**DAMPING vs LPG Decay:**
In other engines (like Plaits), decay is controlled by the LPG (Low-Pass Gate). Rings has no LPG - DAMPING is the primary decay control.

**Amplitude + Brightness Decay:**
Unlike a simple VCA, DAMPING affects **both amplitude and brightness**. Sounds decay naturally (like a low-pass gate) rather than abruptly cutting off. This is physically accurate - real resonators lose high frequencies faster than low frequencies as they decay.

**Model-Specific Behaviour:**
- **Modal (0):** Global decay time for all 64 modes
- **String (2/5):** Feedback amount in waveguide (more feedback = longer decay)
- **Sympathetic (1/4):** Decay time for all coupled strings
- **FM Voice (3):** Envelope decay time

**Sound Design Tips:**
- Set to 0-20% for tight, percussive sounds (drums, mallets)
- Set to 50-70% for realistic plucked/struck instruments (guitar, piano)
- Set to 80-100% for ambient drones and pads
- Modulate with random for organic rhythmic variation

**PPMod Use Cases:**
- **RND mode:** Random decay variation on each note (human-like performance variation)
- **SEQ mode:** Rhythmic decay pattern (staccato on some steps, sustained on others)
- **LFO mode:** Breathing decay (slow pulsating sustain)

**No Instability:**
DAMPING has no stability issues and can safely be set to any value (0-100%).

---

## 6. Position

### Parameter: `ringsPosition`

**UI Label:** POS
**Range:** 0-100
**Default:** 25
**Modulatable:** Yes (global only)
**Param ID:** `rings.position`
**State Key:** `ringsPosition`

Controls where the resonator is excited (struck, plucked, or bowed). Position affects which harmonics are present in the initial excitation.

**Physical Meaning:**
Strings and membranes have nodes (stationary points) and antinodes (maximum displacement points). Exciting near a node suppresses harmonics with an antinode at that position. Exciting near an antinode emphasises those harmonics.

**Excitation Positions:**

| Range | Position | Harmonic Content | Timbral Character |
|-------|----------|------------------|-------------------|
| **0-20%** | Bridge (near edge) | All harmonics present | Bright, twangy, full spectrum |
| **40-60%** | Centre (midpoint) | Balanced harmonic mix | Natural, balanced tone |
| **80-100%** | Antinode (far point) | Even harmonics suppressed | Muted, hollow, mellow |

**Model-Specific Behaviour:**

| Model | POSITION Controls |
|-------|-------------------|
| **0 - Modal** | Excitation spectrum (which modes are triggered) |
| **1/4 - Sympathetic** | Excitation position along strings |
| **2 - String** | Pluck position (0% = bridge, 100% = centre) |
| **3 - FM Voice** | FM feedback amount |
| **5 - String + Reverb** | Dry/wet blend (pluck ↔ reverb) |

**Guitar/String Analogy:**
- **Bridge (0-20%):** Like plucking near the bridge on a guitar - bright, metallic tone
- **Centre (80-100%):** Like plucking over the soundhole - warm, muted tone

**Sound Design Tips:**
- Use 10-30% (bridge) for bright, cutting tones (harpsichord, banjo)
- Use 40-60% (centre) for balanced, natural tones (acoustic guitar)
- Use 70-90% (antinode) for warm, muted tones (fingerstyle bass)
- Sweep POSITION for timbral variation without changing pitch

**PPMod Use Cases:**
- **SEQ mode:** Step-sequenced pluck position (rhythmic timbral motion)
- **LFO mode:** Slow position sweep (evolving harmonic content)
- **ENV mode:** Position shifts during decay (attack is bright, decay is mellow)

**No Instability:**
POSITION has no stability issues and can safely be set to any value (0-100%).

---

## 7. Strum Mix

### Parameter: `ringsMixStrum`

**UI Label:** STRM
**Range:** 0-100
**Default:** 50
**Modulatable:** Yes (global only)
**Param ID:** `rings.mixStrum`
**State Key:** `ringsMixStrum`

Controls the level of internal excitation (noise burst) mixed with external excitation. Rings can excite itself without external input - useful for triggering drones or using it as a self-contained voice.

**Excitation Mixing:**

| Range | Description | Use Cases |
|-------|-------------|-----------|
| **0%** | Only external excitation (note triggers) | Normal operation (notes trigger sound) |
| **50%** | Mix of external + internal | Add attack/noise burst to notes |
| **100%** | Only internal excitation | Continuous drone (no note triggers needed) |

**How It Works:**
At 0%, notes must be triggered externally (via MIDI, sequencer, or keyboard). At 100%, the resonator continuously excites itself with internal noise bursts, creating a drone. Values in between blend both excitation types.

**Internal Strum Trigger:**
Internal strum can be triggered manually via the voice pool API:
```javascript
ringsVoicePool.strum(velocity); // Trigger internal excitation
```

This allows for programmatic triggering of drones or accents without sending MIDI notes.

**Sound Design Tips:**
- Use 0% for normal note-triggered operation
- Use 10-30% to add attack noise/pluck character to notes
- Use 50-80% for self-triggering drones with note influence
- Use 100% for continuous drone (no notes needed)

**Drone Mode Workflow:**
1. Set STRUM to 100%
2. Set DAMPING to 80-100% (long sustain)
3. Trigger once (or use internal strum trigger)
4. Resonator drones continuously
5. Modulate STRUCTURE/BRIGHTNESS for evolving timbre

**PPMod Use Cases:**
- **SEQ mode:** Step-sequenced strum mix (alternating note-triggered and drone steps)
- **LFO mode:** Pulsating drone intensity
- **ENV mode:** Strum fades in after note trigger

**No Instability:**
STRUM has no stability issues and can safely be set to any value (0-100%).

---

## PPMod Integration

All modulatable Rings parameters (`rings.structure`, `rings.brightness`, `rings.damping`, `rings.position`) support per-parameter modulation (PPMod) with 6 modulation modes: LFO, RND, ENV, EF, TM, SEQ.

**Critical Limitation: Global Modulation Only**

Rings PPMod is **global only** (not per-voice). All voices share the same modulation values because Rings handles polyphony internally in a single AudioWorkletNode, and the main thread cannot address individual voices.

**Contrast with Other Engines:**
- **Subtractive:** 8 separate voice nodes → per-voice PPMod possible
- **Plaits:** 8 separate voice nodes → per-voice PPMod possible (compound keys: `voiceId:plaits.harmonics`)
- **Rings:** 1 AudioWorkletNode with 4 internal voices → **global PPMod only**

**What This Means:**
- LFO modulation affects all voices equally (unison effect)
- Envelope modulation triggers globally (not per-voice)
- Random modulation changes all voices at once
- No per-voice phase offsets (all voices in sync)

**Workaround:**
If per-voice modulation is required, use Subtractive or Plaits engines instead. Both have 8 separate voice nodes allowing per-voice PPMod routing.

### K-Rate Modulation (30 FPS)

Rings PPMod runs at **k-rate** (30 FPS, ~33ms updates) on the main thread via `requestAnimationFrame`, NOT audio-rate in the worklet.

**Why K-Rate:**
- Human perception of modulation changes is ~50ms (30 FPS is sufficient)
- Avoids expensive per-sample calculations (`Math.exp()`, `Math.sin()`, etc.) in worklet
- <1% CPU overhead vs audio-rate modulation

**What This Means:**
- LFO/envelope modulation is smooth but not sample-accurate
- Perfect for musical modulation (filter sweeps, vibrato, timbral evolution)
- Not suitable for audio-rate FM (use FM Voice model instead)

**Implementation:**
```javascript
// Modulation calculated at 30 FPS
requestAnimationFrame(() => {
  const modValue = calculateModulation(mod, now);
  audioParam.setTargetAtTime(modValue, now, 0.015); // Smooth 15ms slew
});
```

### Modulatable Parameters

| Parameter | Param ID | Use Cases |
|-----------|----------|-----------|
| **STRUCTURE** | `rings.structure` | Inharmonicity sweeps, mode evolution, FM ratio shifts |
| **BRIGHTNESS** | `rings.brightness` | Filter-like sweeps, timbral motion |
| **DAMPING** | `rings.damping` | Decay time variation, rhythmic gating |
| **POSITION** | `rings.position` | Pluck position sweeps, harmonic variation |

**Note:** STRUM is not currently exposed to PPMod (no param ID assigned).

### PPMod Mode Examples

**Slow Inharmonicity Sweep (Modal Resonator):**
```javascript
// LFO mode
param: 'rings.structure'
mode: 'LFO'
depth: 60%
waveform: Sine
rate: 0.2 Hz
```
Creates slow evolution from harmonic to inharmonic tones (bell → metallic gong).

**Filter-Like Brightness Sweep (String Model):**
```javascript
// ENV mode
param: 'rings.brightness'
mode: 'ENV'
depth: 70%
attackMs: 50
releaseMs: 800
curve: exponential
```
Brightness decays exponentially after each note (like a lowpass filter envelope).

**Rhythmic Decay Variation (Sympathetic String):**
```javascript
// RND mode
param: 'rings.damping'
mode: 'RND'
depth: 40%
bitLength: 8
probability: 60%
sampleRate: 2 Hz
```
Decay time randomly varies on each note (organic, human-like variation).

**Pluck Position Sequence (String Model):**
```javascript
// SEQ mode
param: 'rings.position'
mode: 'SEQ'
depth: 80%
length: 8
pattern: [10, 30, 50, 70, 90, 70, 50, 30]
```
Pluck position sweeps through the string on each step (rhythmic timbral motion).

---

## Easter Egg Mode Parameters

When Easter Egg mode is enabled (`ringsEasterEgg = true`), Rings parameters take on new meanings:

| Rings Param | Easter Egg Function |
|-------------|---------------------|
| **STRUCTURE** | Filter cutoff |
| **BRIGHTNESS** | Filter resonance |
| **DAMPING** | Envelope decay time |
| **POSITION** | FX mix (dry ↔ wet) |

**Additional Easter Egg Parameters:**

| Parameter | State Key | Range | Description |
|-----------|-----------|-------|-------------|
| FX Type | `ringsFxType` | 0-5 | Effect selector (Formant, Chorus, Reverb, Formant 2, Ensemble, Reverb 2) |
| Easter Egg Enabled | `ringsEasterEgg` | Boolean | Enable/disable Easter Egg mode |

**Polyphony in Easter Egg Mode:**
Easter Egg mode provides **12 voices** (vs 4 voices in resonator mode), regardless of the `ringsPolyphony` setting.

**Note:**
Easter Egg mode is a hidden feature in the original Eurorack module and this port. It's fully functional but not intended as the primary use case for Rings. For traditional synthesis, consider using Ræmbl's Subtractive or Plaits engines instead.

**Access:**
Easter Egg mode is currently only accessible via console/code (no UI control):
```javascript
ringsVoicePool.setEasterEgg(true); // Enable Easter Egg
ringsVoicePool.setEasterEgg(false); // Disable (return to resonators)
```

---

## Parameter Mapping

Rings parameters are stored as **0-100** in state but mapped to **0.0-1.0** for the AudioWorklet processor.

| State Key | Range (State) | Range (Processor) | Mapping |
|-----------|---------------|-------------------|---------|
| `ringsModel` | 0-5 (discrete) | 0-5 (int) | Direct |
| `ringsPolyphony` | 1, 2, 4 | 1, 2, 4 | Direct |
| `ringsStructure` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) with model-specific clamping |
| `ringsBrightness` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `ringsDamping` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `ringsPosition` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `ringsMixStrum` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |

**Update Flow:**
```javascript
// UI → State → Audio
faderValue (0-100) → state.ringsStructure (0-100) → validated → audioParam.value (0-1)

// State → UI (patch load)
state.ringsStructure (0-100) → faderValue (0-100) → fader visual position
```

**Validation Layer:**
STRUCTURE parameter passes through `validateRingsParam()` before being sent to the processor. This ensures model-specific safe limits are enforced.

---

## Patch Format

Rings parameters are saved in the unified patch format v1.2.0+:

```json
{
  "version": "1.2.0",
  "raembl": {
    "engineType": "rings",
    "ringsModel": 2,
    "ringsPolyphony": 4,
    "ringsStructure": 40,
    "ringsBrightness": 65,
    "ringsDamping": 60,
    "ringsPosition": 20,
    "ringsMixStrum": 0,
    "modulations": {
      "rings.brightness": {
        "mode": "ENV",
        "enabled": true,
        "depth": 70,
        "offset": 0,
        "envAttackMs": 50,
        "envReleaseMs": 800,
        "envCurveShape": "exponential"
      }
    }
  }
}
```

**Backward Compatibility:**
- Patches without `engineType` default to `'subtractive'`
- Rings parameters ignored if engine isn't Rings
- Missing Rings params use defaults (50 for most, 0 for strum)

**Easter Egg in Patches:**
Easter Egg mode is **not saved** in patches (intentionally hidden feature). It must be re-enabled manually after patch load.

---

## Performance Features

Rings supports Ræmbl's performance features for expressive sequencing:

### Accent

**1.5× velocity boost**

When a note is marked as accented in the sequencer:
1. Velocity multiplied by 1.5× (max 1.0)
2. Note sounds louder and more prominent
3. Accent is applied at trigger time (no envelope shaping)

### Slide

**TB-303 style pitch glide between notes**

Slide creates smooth pitch transitions using pitch bend automation.

**Mono Mode (TB-303 Style):**
- Pitch glides from previous note to current note
- Glide time: 80ms (default) or controlled by `glide` parameter (0-500ms)
- Only works if a previous note exists (mono voice continuity)

**Poly Mode (Slide-Into Effect):**
- Note starts -0.5 semitones flat and slides up over 40ms
- Creates subtle pitch bend-in effect
- Works even without previous note

**Implementation:**
Rings doesn't have an `AudioParam` for pitch (notes are discrete messages), so slide is implemented via pitch bend messages with interpolated steps (10-step exponential interpolation over 80ms).

### Trill

**Rapid pitch oscillation to next scale degree**

Trill rapidly alternates between the main note and the next note in the current scale (set in PATH module).

**Implementation:**
- 2-note trill on offbeats (swung 16ths)
- 3-note trill on downbeats (even 16ths)
- Pitch automation via message-based pitch bend (10-step interpolation)

---

## Troubleshooting

### No Sound on Note Trigger

**Check:**
1. Is DAMPING > 0? (If DAMPING = 0, notes decay instantly)
2. Is BRIGHTNESS > 0? (Very low brightness can be nearly inaudible)
3. Is STRUM at 100%? (If yes, only internal strum triggers sound - set to 0% for normal operation)
4. Is polyphony set correctly? (M/P2/P4)

### Audio Distortion / Runaway Resonance

**Symptom:** Harsh distortion, runaway feedback, or piercing resonance

**Cause:** STRUCTURE value too high for selected model

**Solution:**
1. Reduce STRUCTURE below model's safe maximum (see [Structure Parameter](#3-structure))
2. Modal (0): Below 90%
3. Sympathetic (1): Below 80%
4. Sympathetic Q (4): Below 75%

### Choppy/Glitchy Slide

**Symptom:** Slide pitch automation sounds steppy or glitchy

**Cause:** Message-based pitch bend uses 10-step interpolation (not smooth AudioParam automation)

**Solution:**
1. This is expected behaviour (Rings doesn't have AudioParam for pitch)
2. For smoother slides, reduce slide time (faster slides hide steppiness)
3. For ultra-smooth slides, use Subtractive or Plaits engines (they use `exponentialRampToValueAtTime()`)

---

## See Also

- **[Rings Engine Guide](../engines/raembl/rings-engine.md)** - Conceptual overview, resonator models, sound design recipes
- **[Ræmbl Parameter Reference](./raembl-parameters.md)** - Complete parameter reference for all Ræmbl engines
- **[PPMod System](../modulation/ppmod-modes.md)** - Per-parameter modulation system documentation
- **[Plaits Engine Parameters](./raembl-plaits-params.md)** - Plaits parameter reference (alternative engine)

---

**Version:** 1.0
**Last Updated:** 2025-12-30
**Rings Firmware Version:** Mutable Instruments Rings 1.0 (C++ → JavaScript port)
