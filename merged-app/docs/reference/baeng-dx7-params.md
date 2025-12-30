# Bæng DX7 Engine Parameter Reference

Complete technical reference for all DX7 FM synthesis engine parameters in Bæng.

---

## About This Reference

This document provides detailed parameter specifications for the DX7 engine, including macro controls, bank selection, operator parameters, and FM-specific settings. For conceptual information about FM synthesis and the DX7 engine architecture, see [DX7 Engine Guide](../engines/baeng/dx7-engine.md).

**Cross-References:**
- [DX7 Engine Guide](../engines/baeng/dx7-engine.md) - Complete guide to DX7 FM synthesis in Bæng
- [Bæng Parameters](baeng-parameters.md) - All Bæng parameters across engines

---

## Parameter Categories

- [Macro Controls](#macro-controls) - Simplified DX7 interface (PATCH, DEPTH, RATE, PITCH)
- [Bank & Patch Selection](#bank--patch-selection) - SysEx bank loading and management
- [Advanced DX7 Parameters](#advanced-dx7-parameters) - Operator-level settings, envelopes, algorithms
- [Polyphony Configuration](#polyphony-configuration) - Mono/poly voice modes
- [PPMod Integration](#ppmod-integration) - Per-parameter modulation support

---

## Macro Controls

Bæng simplifies the DX7's 155+ parameters into 4 macro controls that provide immediate sonic control whilst preserving the underlying patch complexity.

| Macro | State Path | Range | Default | PPMod | Unit | Description |
|-------|------------|-------|---------|-------|------|-------------|
| **PATCH** | `voices[N].macroPatch` | 0–100 | 0 | ✓ | — | Patch index within loaded bank (0–31) |
| **DEPTH** | `voices[N].macroDepth` | 0–100 | 50 | ✓ | % | Operator output level scaling (FM modulation depth) |
| **RATE** | `voices[N].macroRate` | 0–100 | 50 | ✓ | — | Envelope time scaling (attack/decay/sustain/release) |
| **PITCH** | `voices[N].macroPitch` | 0–100 | 50 | ✓ | — | Master pitch offset (-24 to +24 semitones, 50 = neutral) |

**Note**: `[N]` represents voice index (0–5 for voices T1–T6).

### PATCH (Patch Selection)

**Function**: Selects one of the patches from the currently loaded bank.

**Mapping**:
- UI range: 0–100
- Internal range: 0–31 (patch indices within a 32-patch bank)
- Parameter ID: `voice.macroPatch`

**Behaviour**:
- 0–100 UI range is quantised to 0–31 discrete patch indices
- Changing PATCH loads a complete new patch configuration:
  - All 6 operator parameters (21 params × 6 = 126 parameters)
  - Algorithm number (1–32)
  - Feedback setting (0–7)
  - LFO configuration
  - Pitch envelope settings

**PPMod Use Cases**:
- **LFO Mode**: Cycle through patches rhythmically (creates timbral movement)
- **SEQ Mode**: Step through specific patches in sequence
- **TM Mode**: Probabilistic patch switching (glitch effects, variation)
- **RND Mode**: Random patch selection (extreme variation)

**See Also**: [Bank Loading System](#bank--patch-selection)

### DEPTH (Modulation Depth)

**Function**: Scales the output level of all modulator operators, controlling FM modulation depth.

**Mapping**:
- UI range: 0–100
- Internal multiplier: 0.0–2.0 (0 = silent modulators, 50 = neutral, 100 = 2× boost)
- Parameter ID: `voice.macroDepth`

**Behaviour**:
- **0**: No FM (only carrier operators produce sound → pure sine/additive)
- **50**: Neutral (patch's original modulation depth preserved)
- **100**: Maximum modulation (2× original depth → more sidebands, brighter timbre)

**Technical Detail**: Multiplies the `volume` parameter of all modulator operators. This directly affects the modulation index in the FM algorithm, which controls the number and amplitude of frequency sidebands.

**Sonic Impact**:
- **Low (0–30)**: Gentle, pure tones, subtle harmonics
- **Medium (30–70)**: Classic DX7 timbres, balanced brightness
- **High (70–100)**: Aggressive, metallic, bright sounds with complex spectra

**PPMod Use Cases**:
- **ENV Mode**: Brightness follows amplitude envelope (brighter on attack, darker on decay)
- **LFO Mode**: Rhythmic timbral modulation (breathing effect)
- **EF Mode**: Dynamics-sensitive brightness (harder hits = brighter sound)
- **SEQ Mode**: Stepped brightness patterns

**Recommended Ranges by Drum Type**:
- **Kicks**: 40–60 (solid fundamental with controlled harmonics)
- **Snares**: 60–80 (bright, cutting through the mix)
- **Hi-hats**: 80–100 (maximum brightness and shimmer)
- **Toms**: 30–50 (tonal body without excessive brightness)

### RATE (Envelope Speed)

**Function**: Scales the rate parameters of all operator ADSR envelopes, controlling overall envelope timing.

**Mapping**:
- UI range: 0–100
- Internal multiplier: Logarithmic scaling (0 = extremely slow, 50 = neutral, 100 = extremely fast)
- State parameter: `voices[N].dx7EnvTimeScale`
- Parameter ID: `voice.macroRate`

**Behaviour**:
- **0**: Extremely slow envelopes (long, sustained pad-like sounds)
- **50**: Neutral (patch's original envelope times preserved)
- **100**: Extremely fast envelopes (short, percussive, staccato sounds)

**Technical Detail**: Multiplies the ADSR rate parameters (R1–R4) for all 6 operators. In the DX7, higher rate values = faster transitions. This macro preserves the relative envelope shapes whilst scaling the overall timing.

**Sonic Impact**:
- **Low (0–30)**: Slow attack, long decay, pad-like sounds
- **Medium (30–70)**: Balanced percussive response
- **High (70–100)**: Snappy attack, tight decay, very short sounds

**PPMod Use Cases**:
- **ENV Mode**: Envelope speed follows trigger dynamics (uncommon)
- **RND Mode**: Randomise envelope times for natural variation
- **SEQ Mode**: Sequence different envelope lengths (rhythmic timing variations)

**Recommended Ranges by Drum Type**:
- **Kicks**: 60–80 (fast attack, moderate decay)
- **Snares**: 70–90 (snappy attack, short decay)
- **Hi-hats**: 80–100 (instant attack, very short decay)
- **Toms**: 50–70 (moderate attack, sustained decay)

### PITCH (Master Transpose)

**Function**: Master pitch offset applied to all operators, preserving their frequency ratios.

**Mapping**:
- UI range: 0–100
- Internal range: -24 to +24 semitones (50 = 0 semitones, neutral)
- State parameter: `voices[N].dx7Transpose`
- Parameter ID: `voice.macroPitch`

**Behaviour**:
- **0**: -24 semitones (two octaves down)
- **50**: 0 semitones (original pitch, neutral)
- **100**: +24 semitones (two octaves up)

**Technical Detail**: Applies pitch offset to all operator base frequencies whilst preserving their ratios. Fixed-frequency operators are also transposed. Conversion formula: `semitones = (uiValue - 50) × 0.48`

**Sonic Impact**:
- **Negative PITCH**: Lower fundamental, darker timbre, more sub-bass content
- **Zero PITCH**: Original patch tuning
- **Positive PITCH**: Higher fundamental, brighter timbre, less low-end

**PPMod Use Cases**:
- **LFO Mode**: Vibrato, pitch wobble effects
- **ENV Mode**: Pitch envelope (classic percussive pitch sweeps - high to low)
- **SEQ Mode**: Melodic sequences, pitched drum patterns
- **Scale Quantisation**: When enabled, modulated pitch snaps to nearest scale degree

**Recommended Ranges by Drum Type**:
- **Kicks**: -12 to +6 (tune to track's key, typically low)
- **Snares**: -6 to +12 (adjust body resonance)
- **Hi-hats**: +6 to +18 (bright metallic character)
- **Toms**: -24 to +12 (create tom racks with pitch variations)

**Scale Quantisation**: When global scale quantisation is enabled (`scaleQuantizeEnabled = true`), PPMod-driven PITCH values are quantised to the selected scale (`globalScale`, `globalRoot`), ensuring melodic sequences stay in-key. See [DX7 Engine Guide - Scale Quantisation](../engines/baeng/dx7-engine.md#scale-quantisation-dx7-specific).

---

## Bank & Patch Selection

The DX7 engine supports per-voice bank loading via Yamaha DX7 SysEx (.syx) files. Each of Bæng's 6 voices can load an independent bank.

### Bank Management Parameters

| Parameter | State Path | Type | Default | Description |
|-----------|------------|------|---------|-------------|
| `dx7Patch` | `voices[N].dx7Patch` | Object | `null` | Full parsed patch data (155 parameters) |
| `dx7PatchName` | `voices[N].dx7PatchName` | String | `null` | Patch name (10 characters max, from SysEx) |
| `dx7PatchIndex` | `voices[N].dx7PatchIndex` | Number (0–31) | `null` | Patch position within bank |
| `dx7BankSize` | `voices[N].dx7BankSize` | Number | 0 | Total patches in loaded bank (typically 32) |
| `dx7Bank` | `voices[N].dx7Bank` | Array | `null` | Per-voice bank copy (array of 32 patch objects) |
| `dx7BankName` | `voices[N].dx7BankName` | String | `null` | Bank filename (for display/reference) |

### SysEx Bank Formats

The DX7 engine automatically detects and parses two SysEx formats:

#### 1. Bulk Dump Format (VMEM) — Most Common

- **File Size**: 4104 bytes
- **Structure**: `F0 43 00 00 09 20` (6-byte header) + 4096 bytes data + checksum + `F7`
- **Content**: 32 patches in packed format (128 bytes per patch)
- **Encoding**: Operators stored in reverse order (Op 6 → Op 1)
- **Patch Data**: 6 operators × 17 bytes + 102 bytes global params = 128 bytes per patch

**Packed Format Details** (per patch):
- **Bytes 0–101**: 6 operators × 17 bytes each (Op 6, Op 5, Op 4, Op 3, Op 2, Op 1)
- **Bytes 102–109**: Pitch envelope (4 rates + 4 levels)
- **Byte 110**: Algorithm (0–31, displayed as 1–32)
- **Byte 111**: Feedback (bits 0–2), oscillator sync (bit 3)
- **Bytes 112–116**: LFO parameters
- **Bytes 118–127**: Patch name (10 ASCII characters)

#### 2. Single Voice Format (VCED) — Rare

- **File Size**: 155–163 bytes
- **Structure**: `F0 43 00 00 01 1B` (6-byte header) + 155 bytes voice data + `F7`
- **Content**: 1 unpacked patch (21 bytes per operator)
- **Encoding**: Operators in reverse order (Op 6 → Op 1)
- **Use Case**: Individual patch sharing, editing software intermediate format

**Unpacked Format Details**:
- **Bytes 0–125**: 6 operators × 21 bytes each (unpacked/verbose)
- **Bytes 126–143**: Pitch envelope + global params
- **Bytes 144–153**: Patch name (10 characters)

### Operator Parameters (Per Operator, 6 Total)

Each operator has 21 parameters in VCED format (17 in VMEM packed format). These are embedded in the loaded patch and not directly editable via Bæng's UI.

#### Envelope Generator (EG)

| Parameter | Range | Description |
|-----------|-------|-------------|
| `rates[0]` (R1) | 0–99 | Attack rate (higher = faster attack) |
| `rates[1]` (R2) | 0–99 | Decay 1 rate |
| `rates[2]` (R3) | 0–99 | Decay 2 / Sustain rate |
| `rates[3]` (R4) | 0–99 | Release rate |
| `levels[0]` (L1) | 0–99 | Attack level target |
| `levels[1]` (L2) | 0–99 | Decay 1 level target |
| `levels[2]` (L3) | 0–99 | Decay 2 / Sustain level |
| `levels[3]` (L4) | 0–99 | Release level target (typically 0) |

**Note**: DX7 envelopes use 4-stage ADSR with rate-based transitions (not time-based). The RATE macro scales all rates globally.

#### Frequency Configuration

| Parameter | Range | Description |
|-----------|-------|-------------|
| `freqCoarse` | 0–31 | Coarse frequency ratio/multiplier |
| `freqFine` | 0–99 | Fine frequency adjustment |
| `detune` | -7 to +7 | Pitch detune (centred at 0) |
| `oscMode` | 0–1 | 0 = Ratio mode, 1 = Fixed frequency mode |

**Frequency Calculation**:
- **Ratio mode** (`oscMode = 0`): `frequency = baseFreq × ratio × detune`
- **Fixed mode** (`oscMode = 1`): `frequency = fixedHz` (independent of note pitch)

**Common Ratios**:
- 0.5, 1.0, 2.0, 3.0, 4.0 = Harmonic series (octaves and fifths)
- 1.414, 2.236, 3.162 = Inharmonic (√2, √5, √10) for bells/metallic sounds

#### Modulation & Scaling

| Parameter | Range | Description |
|-----------|-------|-------------|
| `volume` | 0–99 | Operator output level (modulation depth for modulators) |
| `velocitySens` | 0–7 | Velocity sensitivity (0 = none, 7 = maximum) |
| `lfoAmpModSens` | 0–3 | LFO amplitude modulation sensitivity |
| `keyScaleBreakpoint` | 0–99 | Keyboard scaling pivot point (MIDI note number) |
| `keyScaleDepthL` | 0–99 | Scaling depth below breakpoint |
| `keyScaleDepthR` | 0–99 | Scaling depth above breakpoint |
| `keyScaleCurveL` | 0–3 | Scaling curve below breakpoint (-LIN, -EXP, +EXP, +LIN) |
| `keyScaleCurveR` | 0–3 | Scaling curve above breakpoint |
| `keyScaleRate` | 0–7 | Envelope rate scaling by keyboard position |

**Keyboard Scaling**: Allows operator level and envelope rates to vary by pitch (e.g., brighter sounds in higher octaves).

### Loading Banks

**Via DX7 Browser**:
1. Click **DX7** button on any voice to open the DX7 bank browser
2. Navigate folder structure (organised by category: Factory, User, etc.)
3. Click bank name to preview patches (32 patch names displayed)
4. Click **Load Bank** to load into the selected voice
5. Use PATCH macro (or `voice.dx7PatchIndex`) to select patches 0–31

**Via File Upload** (future feature):
- Upload .syx files directly
- Automatic format detection (VMEM bulk vs VCED single)
- Validation and error reporting

**Bank Library Structure**:
- Root: `Reference/DX7_AllTheWeb/`
- Manifest: `Reference/dx7-banks-manifest.json`
- Categories: Organised by type (Instruments, Percussion, etc.)
- Total: Thousands of patches across 68,000+ entries

**Favourites System**:
- Star/unstar banks in browser
- Filter by favourites only
- Persisted in localStorage (`baeng_dx7_favorites`)

**Bank Caching**:
- Parsed banks cached in `DX7PatchLibrary` class
- Avoids redundant parsing on reload
- Cache cleared on browser refresh

---

## Advanced DX7 Parameters

Advanced parameters are stored within the loaded patch (`dx7Patch` object) and are not directly editable via Bæng's UI. To modify these, edit the .syx file in an external DX7 editor (e.g., Dexed, DX7 V) and reload the bank.

### Algorithm & Feedback

| Parameter | State Path | Range | Default | Description |
|-----------|------------|-------|---------|-------------|
| `dx7Algorithm` | `voices[N].dx7Algorithm` | 1–32 | 1 | FM algorithm (operator routing topology) |
| `dx7Feedback` | `voices[N].dx7Feedback` | 0–7 | 0 | Operator 6 self-feedback amount |

**Algorithm**: Defines how the 6 operators are connected (carriers, modulators, serial/parallel routing). See [DX7 Engine Guide - The 32 Algorithms](../engines/baeng/dx7-engine.md#the-32-algorithms) for complete algorithm reference.

**Feedback**: Operator 6 can modulate itself, creating additional harmonics and noise-like timbres. Higher values = more extreme feedback distortion.

### Global LFO Parameters

| Parameter | Range | Description |
|-----------|-------|-------------|
| `lfoSpeed` | 0–99 | LFO frequency (rate) |
| `lfoDelay` | 0–99 | LFO fade-in delay time |
| `lfoPitchModDepth` | 0–99 | Vibrato amount |
| `lfoAmpModDepth` | 0–99 | Tremolo amount |
| `lfoPitchModSens` | 0–7 | Vibrato sensitivity to modulation wheel |
| `lfoWaveform` | 0–5 | LFO shape (0=Sine, 1=Square, 2=Triangle, 3=Saw Up, 4=Saw Down, 5=S&H) |
| `lfoSync` | 0–1 | 0 = Free-running, 1 = Reset LFO phase on note-on |

**Note**: These are global LFO settings embedded in the patch. Bæng does not expose these in the UI, but they are preserved when loading/saving patches.

### Pitch Envelope

| Parameter | Range | Description |
|-----------|-------|-------------|
| `pitchEnvelope.rates[0–3]` | 0–99 | Pitch EG rates (R1–R4) |
| `pitchEnvelope.levels[0–3]` | 0–99 | Pitch EG levels (L1–L4) |

**Pitch Envelope**: Modulates pitch over time independently of amplitude envelopes. Useful for percussive pitch sweeps (e.g., kick drum pitch drop).

**Parameter ID**: `dx7PitchEnvDepth` (0–100) scales the pitch envelope amount (not currently exposed in Bæng UI).

### Envelope Scaling (Bæng-Specific Extensions)

These parameters are not part of the original DX7 spec, but are added by Bæng for extended control:

| Parameter | State Path | Range | Default | Description |
|-----------|------------|-------|---------|-------------|
| `dx7EnvTimeScale` | `voices[N].dx7EnvTimeScale` | 0.1–10.0 | 1.0 | Global envelope time multiplier (via RATE macro) |
| `dx7AttackScale` | `voices[N].dx7AttackScale` | 0.1–10.0 | 1.0 | Attack time multiplier (future use) |
| `dx7ReleaseScale` | `voices[N].dx7ReleaseScale` | 0.1–10.0 | 1.0 | Release time multiplier (future use) |
| `dx7PitchEnvDepth` | `voices[N].dx7PitchEnvDepth` | 0–100 | 0 | Pitch envelope depth scaling |

**Note**: `dx7EnvTimeScale` is controlled by the RATE macro. `dx7AttackScale` and `dx7ReleaseScale` are reserved for future per-stage envelope control.

### Fine-Tuning

| Parameter | State Path | Range | Default | Unit | Description |
|-----------|------------|-------|---------|------|-------------|
| `dx7FineTune` | `voices[N].dx7FineTune` | -100 to +100 | 0 | cents | Fine pitch adjustment (±1 semitone) |

**Use Case**: Tuning correction for out-of-tune banks. The DX7 browser includes a tuning analyser that can auto-detect and apply per-bank fine-tune offsets.

**Tuning Cache**: The `tuningCache` system stores per-bank offsets (in cents) and can be toggled on/off per bank in the browser.

---

## Polyphony Configuration

The DX7 engine supports both monophonic and polyphonic voice allocation.

| Parameter | State Path | Range | Default | Description |
|-----------|------------|-------|---------|-------------|
| `polyphonyMode` | `voices[N].polyphonyMode` | 0–8 | 0 | Polyphony (0 = mono, 1–8 = poly voices) |

**Modes**:
- **0 (Mono)**: Strictly monophonic - new notes immediately stop previous notes
- **1–8 (Poly2–Poly8)**: Polyphonic with voice stealing when limit reached

**Voice Allocation**:
- **Monophonic** (mode 0): Each trigger releases previous voice immediately (drum machine behaviour)
- **Polyphonic** (modes 1–8): Voices allocated from pool, oldest voice stolen when limit reached

**Voice Stealing Strategy**:
1. Find voices for this track (`voiceIndex`) that are active
2. If count ≥ polyphony limit, steal oldest voice (first in activeVoices array)
3. Stolen voice receives immediate `noteOff()` to start release phase
4. New voice is allocated and triggered

**Gate & Slide Behaviour** (Mono Mode):
- **GATE < 100%**: Normal monophonic behaviour (retriggering)
- **GATE = 100%**: Enables slide/portamento between notes (80ms glide, TB-303 style)

**Note**: Polyphonic modes are available but rarely used in Bæng's drum machine context. Most drum synthesis is monophonic (kicks, snares, hi-hats). Poly modes may be useful for:
- DX7 as melodic element (sequenced pitched patterns)
- Layered percussion (e.g., drum rolls with overlapping decay)

**Performance Considerations**:
- Each polyphonic voice is a full DX7 voice (6 operators × ~150 params)
- Higher polyphony = higher CPU usage
- Poly4+ can cause audio dropouts on slower systems
- For drum synthesis, mono mode (0) is recommended

---

## PPMod Integration

The DX7 engine fully supports Bæng's Per-Parameter Modulation (PPMod) system. All 4 macro controls are modulatable via PPMod.

### Modulatable Parameters

| Macro | Parameter ID | PPMod Modes | Special Behaviour |
|-------|--------------|-------------|-------------------|
| **PATCH** | `voice.macroPatch` | All (LFO, RND, ENV, EF, TM, SEQ) | Quantised to 0–31 (discrete patch indices) |
| **DEPTH** | `voice.macroDepth` | All | Continuous 0–100 |
| **RATE** | `voice.macroRate` | All | Continuous 0–100 |
| **PITCH** | `voice.macroPitch` | All | Scale quantisation when enabled |

### PPMod Modes for DX7

#### LFO Mode

**PITCH + LFO**: Vibrato, pitch wobble
- **Example**: Sine LFO at 4Hz, depth 10%, creates subtle vibrato
- **Use**: Hi-hat brightness modulation, bass wobble

**DEPTH + LFO**: Rhythmic brightness modulation
- **Example**: Triangle LFO synced to 1/4 notes, creates breathing effect
- **Use**: Evolving pad-like drum sounds

**PATCH + LFO**: Patch cycling (experimental)
- **Example**: Sawtooth LFO at 1/8 notes, cycles through patches rhythmically
- **Use**: Extreme timbral variation, glitch effects

#### RND (Random) Mode

**PITCH + RND**: Humanisation, pitch variation
- **Example**: 8-bit LFSR at 10% probability, subtle pitch detuning per hit
- **Use**: Natural-sounding hi-hats/snares

**DEPTH + RND**: Timbral variation
- **Example**: 16-bit LFSR at 30% probability, brightness varies per hit
- **Use**: Realistic drum variation

**RATE + RND**: Envelope variation
- **Example**: 4-bit LFSR at 50% probability, decay length randomised
- **Use**: Organic-sounding percussion

#### ENV (Envelope) Mode

**DEPTH + ENV**: Brightness follows amplitude
- **Example**: Attack 10ms, release 200ms, depth follows envelope
- **Use**: Classic DX7 electric piano (bright attack, dark decay)

**PITCH + ENV**: Pitch sweep
- **Example**: Attack 5ms, release 150ms, pitch drops -12 semitones
- **Use**: Classic FM kick drum pitch drop, tom pitch decay

#### EF (Envelope Follower) Mode

**DEPTH + EF**: Dynamics-sensitive brightness
- **Example**: Attack 10ms, release 100ms, brightness follows input level
- **Use**: Velocity-sensitive timbral response

#### TM (Turing Machine) Mode

**PATCH + TM**: Probabilistic patch switching
- **Example**: 8-step pattern, 50% mutation, creates evolving patch variations
- **Use**: Generative variation, semi-random timbral evolution

**DEPTH + TM**: Stepped brightness patterns
- **Example**: 4-step pattern [0.3, 0.7, 0.5, 0.9], repeating brightness sequence
- **Use**: Rhythmic brightness patterns

#### SEQ (Step Sequencer) Mode

**PITCH + SEQ**: Melodic sequences
- **Example**: 8-step pattern [0, 3, 7, 12, 7, 3, 0, -5] (major scale degrees)
- **Use**: Melodic drum patterns, pitched sequences
- **Scale Quantisation**: Enabled by default, snaps to selected scale

**DEPTH + SEQ**: Rhythmic timbral patterns
- **Example**: 4-step pattern [0.3, 0.8, 0.5, 0.9], brightness sequence
- **Use**: Rhythmic variation, accented brightness

**PATCH + SEQ**: Sequenced patch morphing
- **Example**: 4-step pattern [0, 8, 16, 24], cycles through specific patches
- **Use**: Controlled timbral evolution

### Scale Quantisation (DX7-Specific)

When PPMod modulates PITCH, the DX7 engine applies scale quantisation:

**Configuration**:
- `scaleQuantizeEnabled` (Boolean): Enable/disable quantisation
- `globalScale` (0–32): Scale index (0 = Chromatic, 1 = Major, 2 = Minor, etc.)
- `globalRoot` (0–11): Root note (0 = C, 1 = C♯, ..., 11 = B)

**Implementation**: `quantizePitchToScale()` in `scaleQuantizer.js` snaps modulated pitch values to the nearest scale degree.

**See Also**: [DX7 Engine Guide - Scale Quantisation](../engines/baeng/dx7-engine.md#scale-quantisation-dx7-specific)

---

## Implementation Details

### Voice Timeout Protection

To prevent infinite voice accumulation from patches with non-zero release levels, the DX7 engine enforces a **10-second maximum release duration**.

**Problem**: DX7 patches with `levels[3] > 0` (non-zero release level) can decay asymptotically to the release level and never reach the `ENV_OFF` state, causing voices to accumulate indefinitely.

**Solution**: After 10 seconds in release phase, the envelope is forcibly advanced to `ENV_OFF` and the voice is marked as finished.

**Implementation**: `envelope-dx7.js` tracks `releaseSampleCount` and compares against `MAX_RELEASE_SAMPLES = 10 * 48000`.

### Denormal Protection

The DX7 engine includes aggressive denormal flushing to prevent 10–100× performance degradation during envelope decay/sustain phases.

**Denormals**: Floating-point values very close to zero (< 1e-15) that cause CPU slowdowns on some architectures.

**Protection Points**:
1. **Operator output** (`operator.js`): Flush `val` to 0 if `|val| < 1e-15`
2. **Envelope output** (`envelope-dx7.js`): Flush envelope level to 0 if `|level| < 1e-10`
3. **Envelope output** (`envelope-dx7.js`): Flush final amplitude to 0 if `|output| < 1e-15`

This eliminates the "after a little while, audio cuts out" symptom caused by denormal accumulation in feedback loops.

### Gain Staging

The DX7 engine applies **-12 dB output attenuation** to match other Bæng engines:

**Rationale**: Analog engines (aKICK, aSNARE, aHIHAT) apply 1.5–2.3× internal boosts to compensate for quiet DSP. DX7 outputs at baseline (1.0×), so we attenuate to match.

**Implementation**: `DX7_OUTPUT_ATTENUATION = 0.25` (in `engine.js`)

---

## Parameter Summary Tables

### Quick Reference: DX7 Macro Controls

| Macro | UI Range | Internal Range | Neutral | PPMod | Description |
|-------|----------|----------------|---------|-------|-------------|
| PATCH | 0–100 | 0–31 (discrete) | 0 | ✓ | Patch index |
| DEPTH | 0–100 | 0.0–2.0× | 50 | ✓ | Modulation depth |
| RATE | 0–100 | 0.1–10.0× (log) | 50 | ✓ | Envelope time |
| PITCH | 0–100 | -24 to +24 semitones | 50 | ✓ | Master transpose |

### Quick Reference: Advanced DX7 Parameters

| Parameter | Range | Default | Editable | Description |
|-----------|-------|---------|----------|-------------|
| `dx7Algorithm` | 1–32 | 1 | Via .syx | Operator routing topology |
| `dx7Feedback` | 0–7 | 0 | Via .syx | Op 6 self-feedback |
| `dx7Transpose` | -24 to +24 | 0 | Via PITCH macro | Coarse pitch |
| `dx7FineTune` | -100 to +100 | 0 | Via tuning cache | Fine pitch (cents) |
| `dx7EnvTimeScale` | 0.1–10.0 | 1.0 | Via RATE macro | Envelope time multiplier |
| `dx7PitchEnvDepth` | 0–100 | 0 | — | Pitch envelope depth |
| `polyphonyMode` | 0–8 | 0 | Via UI | Polyphony (mono/poly) |

### Quick Reference: Operator Parameters (Embedded in Patch)

| Category | Parameters | Count | Total |
|----------|------------|-------|-------|
| Envelope | R1–R4, L1–L4 | 8 | 8 × 6 = 48 |
| Frequency | Coarse, Fine, Detune, Mode | 4 | 4 × 6 = 24 |
| Scaling | Volume, Velocity Sens, LFO Sens, Key Scaling (6 params) | 9 | 9 × 6 = 54 |
| **Total per operator** | — | **21** | — |
| **Total for 6 operators** | — | — | **126** |
| **Global params** | Algorithm, Feedback, LFO (7), Pitch EG (8), Name (10) | **27** | **27** |
| **Grand total per patch** | — | — | **153** |

---

## See Also

**Engine Documentation**:
- [DX7 Engine Guide](../engines/baeng/dx7-engine.md) - Complete DX7 FM synthesis guide
- [Analog Engine](../engines/baeng/analog-engine.md) - Subtractive synthesis engines
- [Sampler Engine](../engines/baeng/sampler-engine.md) - Sample playback engine

**System Documentation**:
- [Bæng Parameters](baeng-parameters.md) - All Bæng parameters across engines
- [PPMod System](../ppmod.md) - Per-parameter modulation reference

**External Resources**:
- [DX7 Sysex Format Documentation](http://homepages.abdn.ac.uk/mth192/pages/dx7/sysex-format.txt)
- [Yamaha DX7 Operating Manual (PDF)](https://usa.yamaha.com/files/download/other_assets/9/333979/DX7E1.pdf)
- [Ken Shirriff's DX7 Chip Reverse Engineering](http://www.righto.com/2021/12/yamaha-dx7-chip-reverse-engineering.html)

---

**Document Version**: 1.0.0
**Last Updated**: 2025-12-30
**Bæng Version**: 1.2.0

*This documentation is part of the Bæng & Ræmbl project. For issues, contributions, or questions, visit the [GitHub repository](https://github.com/MidiSlave/baeng-and-raembl).*
