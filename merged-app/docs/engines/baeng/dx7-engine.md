# DX7 FM Synthesis Engine

Complete guide to the DX7 FM synthesis engine in Bæng, featuring all 32 Yamaha DX7 algorithms with per-voice bank loading and comprehensive modulation support.

---

## Table of Contents

1. [Overview](#overview)
2. [What is FM Synthesis?](#what-is-fm-synthesis)
3. [The 32 Algorithms](#the-32-algorithms)
4. [Macro Controls](#macro-controls)
5. [Bank Loading System](#bank-loading-system)
6. [Advanced Parameters](#advanced-parameters)
7. [Polyphony Modes](#polyphony-modes)
8. [PPMod Integration](#ppmod-integration)
9. [Sound Design Guide](#sound-design-guide)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The DX7 engine is a complete implementation of the legendary Yamaha DX7 FM synthesiser, adapted for drum synthesis in Bæng. It provides authentic 6-operator FM synthesis with all 32 original algorithms, per-voice bank loading, and deep integration with Bæng's modulation system.

### Key Features

- **32 Authentic Algorithms** - All original DX7 operator routing configurations
- **6 FM Operators** - Each with independent ADSR envelopes and parameters
- **Per-Voice Banks** - Each of Bæng's 6 voices can load independent .syx banks
- **Extensive Patch Library** - Thousands of DX7 patches organised by category
- **4 Macro Controls** - Simplified interface (PATCH, DEPTH, RATE, PITCH)
- **PPMod Support** - Per-parameter modulation for all macro controls
- **Performance Optimised** - Denormal protection, fast param copying, batched init

### Yamaha DX7 Heritage

The Yamaha DX7, released in 1983, revolutionised electronic music with affordable, programmable FM synthesis. Its sound defined the 1980s and remains iconic for electric pianos, bass, bells, and brass sounds. This implementation maintains the DX7's sonic character whilst adapting it for percussive applications.

---

## What is FM Synthesis?

Frequency Modulation (FM) synthesis creates complex timbres by using one oscillator (the **modulator**) to modulate the frequency of another oscillator (the **carrier**). The result is a spectrum rich in harmonics and inharmonics, ideal for metallic, bell-like, and percussive sounds.

### Core Concepts

#### Carriers and Modulators

- **Carriers** - Operators that produce audible output (connected to the final mix)
- **Modulators** - Operators that modulate other operators (not directly audible)

In a simple 2-operator FM patch:
```
Modulator (Op 2) ──→ Carrier (Op 1) ──→ Output
```

The modulator's output varies the carrier's frequency at audio rates, creating sidebands (new frequency components).

#### Frequency Ratios

Each operator has a **frequency ratio** (or **fixed frequency**) that determines its pitch relative to the fundamental note:

- **Ratio mode**: Frequency = Note × Ratio (e.g., ratio 2.0 = one octave up)
- **Fixed mode**: Frequency = Fixed Hz (e.g., 440Hz regardless of note)

Integer ratios (1, 2, 3, 4...) produce harmonic timbres.
Non-integer ratios (1.5, 2.7, 3.14...) produce inharmonic, bell-like timbres.

#### Modulation Index (Depth)

The **modulation index** controls how much the modulator affects the carrier:

- **Low depth** (0-30): Subtle harmonic enhancement, gentle brightness
- **Medium depth** (30-70): Rich FM timbres, classic DX7 sounds
- **High depth** (70-100): Extreme modulation, aggressive metallic sounds

The DX7's DEPTH macro scales the output levels of all modulator operators.

#### Operators and Algorithms

The DX7 has **6 operators** (numbered 1-6), each a sine wave oscillator with:
- ADSR envelope generator
- Output level control
- Frequency ratio or fixed frequency
- Velocity sensitivity
- Key scaling

**Algorithms** define how these 6 operators are connected. The DX7 provides 32 algorithms covering:
- **Stacked** - Serial modulation chains (6→5→4→3→2→1)
- **Parallel** - Multiple independent stacks summed together
- **Branched** - Multiple modulators feeding one carrier
- **Additive** - All operators as carriers (no FM)
- **Hybrid** - Complex mixed configurations

---

## The 32 Algorithms

The DX7's 32 algorithms define operator routing. Higher-numbered operators can only modulate lower-numbered operators. Algorithms are processed in reverse order (Op 6 → Op 1).

### Algorithm Categories

#### Stacked Algorithms (Serial Modulation)

Operators arranged in series, creating cascading FM depth:

**Algorithm 4** - Full 6-operator stack (maximum FM depth)
```
Op 6 ──→ Op 5 ──→ Op 4 ──→ Op 3 ──→ Op 2 ──→ Op 1 ──→ Output
```
**Use case**: Deep FM bass, aggressive metallic sounds

**Algorithm 1** - Two parallel stacks (4-op + 2-op)
```
Op 6 ──→ Op 5 ──→ Op 4 ──→ Op 3 ──→ Output
Op 2 ──→ Op 1 ──→ Output
```
**Use case**: Classic electric piano (DX7 "E.Piano 1")

**Algorithm 5** - Two parallel stacks (4-op + 2-op)
```
Op 6 ──→ Op 5 ──→ Op 4 ──→ Op 3 ──→ Output
Op 2 ──→ Op 1 ──→ Output
```
**Use case**: Layered sounds, bell tones

#### Branched Algorithms (Multiple Modulators)

Multiple operators modulate a single target, creating complex spectra:

**Algorithm 27** - Four modulators to one carrier
```
Op 6 ──→ Op 5 ┐
Op 4 ──────────┼──→ Op 1 ──→ Output
Op 3 ──────────┤
Op 2 ──────────┘
```
**Use case**: Bells, chimes, metallic percussion

**Algorithm 28** - Four carriers modulate 2-op stack
```
Op 6 ┐
Op 5 ├──→ Op 2 ──→ Op 1 ──→ Output
Op 4 ┤
Op 3 ┘
```
**Use case**: Brass, bright leads

**Algorithm 29** - Five modulators to one carrier (maximum branching)
```
Op 6 ┐
Op 5 ┤
Op 4 ├──→ Op 1 ──→ Output
Op 3 ┤
Op 2 ┘
```
**Use case**: Complex metallic sounds, gongs

#### Rooted Algorithms (One Modulator, Multiple Carriers)

One modulator adds gentle coloration to multiple carriers:

**Algorithm 22** - One 2-op stack with four carriers
```
Op 6 ──→ Op 5 ──→ Output
Op 4 ──→ Output
Op 3 ──→ Output
Op 2 ──→ Output
Op 1 ──→ Output
```
**Use case**: Subtle FM enhancement, layered sounds

#### Additive Algorithms (No FM)

All operators are carriers - pure additive synthesis:

**Algorithm 23** - All six operators as carriers
```
Op 6 ──→ Output
Op 5 ──→ Output
Op 4 ──→ Output
Op 3 ──→ Output
Op 2 ──→ Output
Op 1 ──→ Output
```
**Use case**: Organ sounds, harmonic synthesis

**Algorithm 32** - All six operators as independent carriers
```
Op 6 ──→ Output
Op 5 ──→ Output
Op 4 ──→ Output
Op 3 ──→ Output
Op 2 ──→ Output
Op 1 ──→ Output
```
**Use case**: Pipe organ, drawbar organ emulation

### Complete Algorithm Reference

| Algo | Carriers | Type | Description | Best For |
|------|----------|------|-------------|----------|
| 1 | 2 | Stacked | 4-op + 2-op parallel stacks | Electric piano, layered sounds |
| 2 | 3 | Stacked | 4-op stack + 2 carriers | Bright timbres |
| 3 | 1 | Branched | Two stacks modulate one carrier | Bell-like sounds |
| 4 | 1 | Stacked | Full 6-op stack (max FM) | Deep bass, aggressive FM |
| 5 | 2 | Stacked | 4-op + 2-op parallel | Classic DX7 sounds |
| 6 | 2 | Stacked | 5-op stack + carrier | Rich modulation |
| 7 | 2 | Stacked | 4-op stack + 2-op stack | Layered percussion |
| 8 | 2 | Hybrid | Complex routing | Experimental sounds |
| 9 | 2 | Stacked | 4-op + 2-op with branching | Bright bells |
| 10 | 1 | Branched | Two stacks to one carrier | Metallic tones |
| 11 | 1 | Stacked | 5-op stack variations | Deep modulation |
| 12 | 1 | Branched | Three modulators to carrier | Complex spectra |
| 13 | 1 | Stacked | 4-op + 2-op routing | Percussive sounds |
| 14 | 1 | Stacked | 4-op stack variations | Bass sounds |
| 15 | 3 | Hybrid | Mixed stacks and carriers | Layered sounds |
| 16 | 4 | Hybrid | Three carriers + 3-op stack | Rich harmonics |
| 17 | 3 | Stacked | Three 2-op stacks | Chord-like sounds |
| 18 | 4 | Hybrid | Carriers + 2-op stacks | Layered timbres |
| 19 | 4 | Rooted | Two carriers + two 2-op stacks | Gentle FM |
| 20 | 5 | Rooted | Four carriers + 2-op stack | Subtle coloration |
| 21 | 5 | Rooted | Three carriers + 2-op stack + carrier | Layered sounds |
| 22 | 5 | Rooted | 2-op stack + four carriers | Gentle FM enhancement |
| 23 | 6 | Additive | All carriers (no FM) | Organ sounds |
| 24 | 1 | Branched | Two 2-op stacks modulate 2-op stack | Complex modulation |
| 25 | 1 | Branched | Three modulators to carrier | Bell-like |
| 26 | 1 | Branched | Three modulators to 2-op stack | Bright metallic |
| 27 | 1 | Branched | Four modulators to carrier | Bells, chimes |
| 28 | 1 | Branched | Four carriers to 2-op stack | Brass sounds |
| 29 | 1 | Branched | Five modulators to carrier (max) | Complex metallic |
| 30 | 2 | Stacked | 4-op + 2-op parallel | Electric piano variant |
| 31 | 1 | Branched | Two 2-op stacks + modulator | Complex FM |
| 32 | 6 | Additive | All independent carriers | Classic organ |

### Algorithm Selection Tips

**For percussion:**
- **Kicks**: Algorithms 4, 6 (deep stacks for low-end punch)
- **Snares**: Algorithms 27, 28, 29 (branched for noise-like spectra)
- **Hi-hats**: Algorithms 23, 32 (additive for metallic shimmer)
- **Toms**: Algorithms 1, 5, 30 (parallel stacks for tonal body)
- **Claps**: Algorithms 12, 13, 25 (complex modulation for noise bursts)

**For tonal sounds:**
- **Electric piano**: Algorithms 1, 5, 30
- **Bass**: Algorithms 4, 6, 7
- **Bells**: Algorithms 3, 27, 29
- **Brass**: Algorithms 28, 31
- **Organ**: Algorithms 23, 32

---

## Macro Controls

Bæng's DX7 engine simplifies the DX7's 155 parameters into 4 macro controls. These provide immediate sonic control whilst preserving the underlying complexity of the loaded patch.

### PATCH (0-127)

**Function**: Selects one of up to 128 patches from the currently loaded bank

**Range**: 0-127 (discrete values, bank-dependent)

**Effect**:
- Loads complete operator configuration (6 operators × 21 parameters each)
- Sets algorithm (1-32)
- Configures all envelopes, ratios, levels, and modulation routing
- Updates LFO settings

**Usage**:
- Each voice can load an independent bank (32 patches per bank)
- PATCH selects which of those 32 patches is active
- Banks can contain up to 128 patches (multiple banks concatenated)

**PPMod Application**:
- **LFO Mode**: Cycle through patches rhythmically
- **SEQ Mode**: Step through patches in sequence
- **TM Mode**: Probabilistic patch switching

**Tip**: For drum synthesis, load factory banks like "Yamaha-DX7-Drum-Sounds-Coffeeshopped" which contain percussion-optimised patches.

### DEPTH (0-100)

**Function**: Scales modulation depth (modulator output levels)

**Range**: 0-100

**Effect**:
- **0**: No FM (only carriers produce sound, pure sine/additive)
- **50**: Neutral (patch's original modulation depth)
- **100**: Maximum modulation (2× original depth)

**Technical Detail**: Multiplies the output level of all modulator operators. This affects the modulation index, which determines the number and amplitude of sidebands in the FM spectrum.

**Sonic Impact**:
- **Low DEPTH (0-30)**: Gentle, pure tones, subtle harmonics
- **Medium DEPTH (30-70)**: Classic DX7 timbres, balanced brightness
- **High DEPTH (70-100)**: Aggressive, metallic, bright sounds

**Usage for Drums**:
- **Kicks**: 40-60 (solid fundamental with controlled harmonics)
- **Snares**: 60-80 (bright, cutting through the mix)
- **Hi-hats**: 80-100 (maximum brightness and shimmer)
- **Toms**: 30-50 (tonal body without excessive brightness)

**PPMod Application**:
- **ENV Mode**: Depth follows amplitude envelope (brighter on attack)
- **LFO Mode**: Rhythmic brightness modulation
- **EF Mode**: Depth follows input level (velocity-sensitive brightness)

### RATE (0-100)

**Function**: Scales envelope time (all operator ADSR rates)

**Range**: 0-100

**Effect**:
- **0**: Extremely slow envelopes (long, sustained sounds)
- **50**: Neutral (patch's original envelope times)
- **100**: Extremely fast envelopes (short, percussive sounds)

**Technical Detail**: Multiplies the rate parameters of all 6 operator envelopes (attack, decay, sustain, release rates). Higher RATE = faster envelopes = shorter sounds.

**Sonic Impact**:
- **Low RATE (0-30)**: Slow attack, long decay, pad-like sounds
- **Medium RATE (30-70)**: Balanced percussive response
- **High RATE (70-100)**: Snappy attack, tight decay, staccato sounds

**Usage for Drums**:
- **Kicks**: 60-80 (fast attack, moderate decay)
- **Snares**: 70-90 (snappy attack, short decay)
- **Hi-hats**: 80-100 (instant attack, very short decay)
- **Toms**: 50-70 (moderate attack, sustained decay)

**PPMod Application**:
- **ENV Mode**: Envelope speed follows trigger dynamics
- **RND Mode**: Randomise envelope times for variation
- **SEQ Mode**: Sequence different envelope lengths

### PITCH (-24 to +24 semitones)

**Function**: Master pitch offset for all operators

**Range**: -24 to +24 semitones (UI: 0-100, where 50 = neutral)

**Effect**:
- **-24 semitones**: Two octaves down
- **0 semitones**: Original pitch (UI value 50)
- **+24 semitones**: Two octaves up

**Technical Detail**: Applies pitch offset to all operator frequencies whilst preserving their frequency ratios. Fixed-frequency operators are also affected.

**Sonic Impact**:
- **Negative PITCH**: Lower fundamental, darker timbre
- **Zero PITCH**: Original patch tuning
- **Positive PITCH**: Higher fundamental, brighter timbre

**Usage for Drums**:
- **Kicks**: -12 to +6 (tune to track's key)
- **Snares**: -6 to +12 (adjust body resonance)
- **Hi-hats**: +6 to +18 (adjust brightness and character)
- **Toms**: -24 to +12 (create tom racks with pitch variations)

**PPMod Application**:
- **LFO Mode**: Vibrato, pitch wobble effects
- **ENV Mode**: Pitch envelope (percussive pitch sweeps)
- **SEQ Mode**: Melodic sequences, pitched drum patterns
- **Scale Quantisation**: When enabled, pitch stays within selected scale

**Note**: DX7 PPMod pitch modulation includes scale quantisation - modulated pitch values snap to the nearest scale degree, preventing out-of-key notes.

---

## Bank Loading System

Bæng's DX7 engine supports per-voice bank loading, allowing each of the 6 drum voices to use an independent DX7 sound bank.

### Bank Format

The engine supports two SysEx (.syx) formats:

#### Bulk Dump Format (VMEM)
- **Size**: 4104 bytes
- **Content**: 32 patches in packed format
- **Structure**: 6 bytes header + (128 bytes × 32 patches) + checksum
- **Most common format** - used by virtually all DX7 banks

#### Single Voice Format (VCED)
- **Size**: 155-163 bytes
- **Content**: 1 unpacked patch
- **Structure**: 6 bytes header + 155 bytes voice data
- **Use case**: Individual patch sharing

The engine automatically detects the format and parses accordingly.

### Loading Banks

#### Via DX7 Browser Modal

1. Click the **DX7** button on any voice to open the browser
2. Navigate the bank directory structure (organised by category)
3. Click a bank name to load it (32 patches loaded into that voice)
4. Use the PATCH knob to select one of the 32 patches

#### Via File Upload

1. Click **"Upload .syx file"** in the DX7 browser
2. Select a .syx file from your computer
3. Bank is parsed and loaded into the current voice
4. Use PATCH to select patches from the uploaded bank

### Factory Banks Included

Bæng includes an extensive library of DX7 banks organised by category:

**Percussion-Optimised Banks**:
- `Yamaha-DX7-Drum-Sounds-Coffeeshopped/` - Hand-crafted drum sounds

**General Categories** (from DX7_AllTheWeb archive):
- `!Instruments/` - Keyboard, brass, strings, woodwinds, ethnic
- `The Introvert/` - Algorithm studies, AI-generated patches
- `Jezreel/` - Electric pianos, flutes
- `Aminet/` - Classic DX7 patches from Amiga archives

**Total Patch Count**: Thousands of patches across 68,000+ entries

### Bank Structure

The `dx7-banks-manifest.json` file catalogues all available banks:

```json
{
  "BankCategory": {
    "files": [
      {
        "name": "BANK.SYX",
        "path": "Category/Subcategory/BANK.SYX",
        "size": 4104,
        "modified": "2002-10-10T05:27:00.000Z"
      }
    ]
  }
}
```

The DX7 browser dynamically renders this structure as a navigable tree.

### Per-Voice Independence

Each of Bæng's 6 voices maintains:
- **Independent bank** (32 patches)
- **Independent PATCH selection** (0-31)
- **Independent macro settings** (DEPTH, RATE, PITCH)
- **Independent PPMod configurations**

This allows complex layering:
- Voice 1: Kick patches
- Voice 2: Snare patches
- Voice 3: Hi-hat patches
- Voice 4: Tom patches
- Voice 5: Percussion patches
- Voice 6: FX/melodic patches

### Bank Caching

The `DX7PatchLibrary` class caches loaded banks to avoid redundant parsing:

- Banks are parsed once on first load
- Subsequent loads retrieve from cache
- Cache persists during session
- `clearCache()` available for memory management

---

## Advanced Parameters

Whilst the macro controls provide simplified access, the underlying DX7 engine maintains the full parameter set. These are stored in the patch data and can be edited via the loaded .syx file.

### Operator Parameters (Per Operator)

Each of the 6 operators has 21 parameters:

#### Envelope Generator (EG)
- **Rates** [R1-R4]: Attack, Decay, Sustain, Release rates (0-99)
- **Levels** [L1-L4]: Attack, Decay, Sustain, Release levels (0-99)

#### Frequency
- **Frequency Coarse** (0-31): Integer ratio or fixed frequency base
- **Frequency Fine** (0-99): Fine-tune adjustment
- **Detune** (-7 to +7): Slight pitch offset for chorus/beating

#### Modulation
- **Output Level** (0-99): Operator amplitude (modulators = mod depth)
- **Velocity Sensitivity** (0-7): How much note velocity affects level
- **LFO Amplitude Modulation Sensitivity** (0-3): LFO tremolo amount

#### Key Scaling
- **Key Scale Breakpoint** (0-99): Note where scaling pivots
- **Key Scale Depth Left/Right** (0-99): Scaling amount below/above breakpoint
- **Key Scale Curve Left/Right** (-LIN, -EXP, +EXP, +LIN): Scaling curve shape
- **Key Scale Rate** (0-7): Envelope rate scaling by key

#### Oscillator Mode
- **Mode** (Ratio/Fixed): Ratio mode or fixed Hz mode

### Global Parameters

#### Algorithm
- **Algorithm Number** (1-32): Operator routing configuration
- **Feedback** (0-7): Operator 1 self-feedback amount

#### LFO
- **LFO Speed** (0-99): LFO frequency
- **LFO Delay** (0-99): LFO fade-in time
- **LFO Pitch Mod Depth** (0-99): Vibrato amount
- **LFO Amp Mod Depth** (0-99): Tremolo amount
- **LFO Pitch Mod Sensitivity** (0-7): Vibrato response to mod wheel
- **LFO Waveform** (Sine, Square, Triangle, Saw Up, Saw Down, S&H): LFO shape
- **LFO Sync** (Off/On): Reset LFO phase on note-on

#### Pitch Envelope
- **Pitch EG Rates** [R1-R4]: Pitch envelope times
- **Pitch EG Levels** [L1-L4]: Pitch envelope amounts

### Editing Advanced Parameters

Advanced parameters are embedded in the loaded .syx patch. To edit them:

1. **Export current patch** from Bæng (future feature)
2. **Edit in DX7 editor** (e.g., Dexed, DX7 V)
3. **Re-import .syx file** into Bæng

Alternatively, many DX7 editors can generate .syx files from scratch, allowing complete custom patches.

---

## Polyphony Modes

The DX7 engine in Bæng supports multiple polyphony modes per voice. However, due to the drum machine context, **monophonic mode** is most common.

### Mono Mode (Default)

**Behaviour**:
- One note at a time
- New notes retrigger the voice
- Previous note is immediately stopped

**Use Case**:
- All drum sounds (kicks, snares, hi-hats, etc.)
- Prevents polyphonic "stacking" artefacts

**Gate Functionality**:
- Bæng's gate system prevents accidental polyphony
- Triggering the same voice before envelope completes = immediate stop + retrigger

### Poly Modes (Poly2, Poly3, Poly4)

**Behaviour**:
- Multiple simultaneous notes (2, 3, or 4 voices)
- Voice stealing when polyphony limit reached

**Use Case**:
- Melodic/chordal applications (experimental)
- Layered percussion (e.g., rolls with overlapping hits)

**Note**: Poly modes are available but rarely used in Bæng's drum context. They may be useful for:
- DX7 used as melodic element (sequenced pitched patterns)
- Simulating drum rolls with overlapping decay tails

### Voice Allocation

DX7 voices in Bæng use **pre-allocated voice pools** (similar to Ræmbl's AudioWorklet architecture):

- Voices are created at init, not on-demand
- Voice stealing uses "least recently used" strategy
- Release envelopes complete before voice is reused
- **10-second max release timeout** prevents infinite voices

This prevents the voice accumulation bug (voices stuck in release phase never finishing).

---

## PPMod Integration

The DX7 engine fully supports Bæng's Per-Parameter Modulation (PPMod) system. All 4 macro controls can be modulated using the 6 PPMod modes.

### Modulatable Parameters

- **PATCH** (voice.macroPatch) - Patch selection modulation
- **DEPTH** (voice.macroDepth) - Modulation depth modulation
- **RATE** (voice.macroRate) - Envelope speed modulation
- **PITCH** (voice.macroPitch) - Pitch modulation with scale quantisation

### PPMod Modes for DX7

#### LFO Mode
**Use Cases**:
- **PITCH + LFO**: Vibrato, pitch wobble
- **DEPTH + LFO**: Rhythmic brightness modulation
- **RATE + LFO**: Envelope speed cycling (unusual effect)
- **PATCH + LFO**: Patch cycling (experimental)

**Example**: Hi-hat with DEPTH modulated by slow sine LFO creates "breathing" brightness.

#### RND (Random) Mode
**Use Cases**:
- **PITCH + RND**: Humanisation, subtle pitch variation
- **DEPTH + RND**: Timbral variation per hit
- **RATE + RND**: Envelope variation for realism
- **PATCH + RND**: Random patch selection (glitch effects)

**Example**: Snare with RATE modulated by RND creates natural variation in decay length.

#### ENV (Envelope) Mode
**Use Cases**:
- **DEPTH + ENV**: Brightness follows amplitude (brighter on attack)
- **PITCH + ENV**: Pitch sweep (classic drum pitch drop)
- **RATE + ENV**: Envelope compression (less common)

**Example**: Kick with PITCH modulated by negative ENV creates pitch drop from high to low.

#### EF (Envelope Follower) Mode
**Use Cases**:
- **DEPTH + EF**: Brightness responds to input level (velocity sensitivity)
- **PITCH + EF**: Pitch responds to dynamics

**Example**: Tom with DEPTH following envelope follower - harder hits = brighter sound.

#### TM (Probabilistic Step Sequencer) Mode
**Use Cases**:
- **PATCH + TM**: Probabilistic patch switching (glitchy variation)
- **PITCH + TM**: Stepped pitch sequences
- **DEPTH + TM**: Stepped brightness patterns

**Example**: Hi-hat with DEPTH modulated by TM creates rhythmic brightness variations.

#### SEQ (CV Sequencer) Mode
**Use Cases**:
- **PITCH + SEQ**: Melodic sequences, pitched drum patterns
- **DEPTH + SEQ**: Rhythmic timbral patterns
- **PATCH + SEQ**: Sequenced patch morphing
- **RATE + SEQ**: Stepped envelope variations

**Example**: DX7 voice with PITCH modulated by SEQ creates melodic drum patterns in-key.

### Scale Quantisation (DX7-Specific)

The DX7 engine includes **pitch scale quantisation** for PPMod:

- When PITCH is modulated, output values snap to nearest scale degree
- Prevents out-of-key notes in melodic sequences
- Scales: Major, Minor, Dorian, Phrygian, Lydian, Mixolydian, etc.
- Configurable in Bæng's global settings

**Implementation**: `updateDx7ParameterWithPPMod()` in `perParamMod.js` applies quantisation before sending pitch to DX7 voice.

### Per-Voice Modulation

Each of Bæng's 6 voices can have independent PPMod configurations:

- Voice 1: PITCH modulated by SEQ (melodic kick pattern)
- Voice 2: DEPTH modulated by ENV (dynamic snare brightness)
- Voice 3: RATE modulated by RND (varied hi-hat decay)
- Voice 4: No modulation (static tom sound)
- Voice 5: PATCH modulated by TM (probabilistic percussion variation)
- Voice 6: PITCH modulated by LFO (vibrato FX)

This enables complex, evolving drum patterns with minimal manual intervention.

---

## Sound Design Guide

### Creating Classic DX7 Sounds

#### Electric Piano (Rhodes-Style)

**Algorithm**: 1 or 5 (two parallel stacks)

**Operator Setup**:
- **Stack 1** (Ops 6→5→4→3): Tonal body
  - Op 6: Ratio 1.0 (fundamental)
  - Op 5: Ratio 2.0 (one octave up)
  - Op 4: Ratio 3.0 (perfect fifth)
  - Op 3: Ratio 4.0 (two octaves up, carrier)
- **Stack 2** (Ops 2→1): Bell-like overtones
  - Op 2: Ratio 3.5 (inharmonic modulator)
  - Op 1: Ratio 1.0 (carrier)

**Envelopes**:
- Attack: Fast (80-99)
- Decay: Medium (50-70)
- Sustain: Low (20-40)
- Release: Medium (40-60)

**Macro Settings**:
- DEPTH: 50-60 (moderate FM for bell-like tone)
- RATE: 70-80 (snappy attack, moderate decay)
- PITCH: 50 (neutral, or tune to track)

**Modulation**: DEPTH + ENV for velocity-sensitive brightness

#### FM Bass

**Algorithm**: 4 or 6 (deep stacks)

**Operator Setup**:
- Full 6-op stack (Algorithm 4)
- Ratios: 1.0, 1.0, 1.0, 1.0, 1.0, 1.0 (all at fundamental)
- High output levels on modulators for deep FM

**Envelopes**:
- Attack: Very fast (90-99)
- Decay: Long (30-50)
- Sustain: Medium (50-70)
- Release: Short (10-30)

**Macro Settings**:
- DEPTH: 70-85 (aggressive FM for grit)
- RATE: 65-75 (punchy attack, sustained body)
- PITCH: Tune to track's root note (-12 to +6)

**Modulation**: PITCH + ENV for pitch drop (classic FM bass)

#### Bell/Metallic Tones

**Algorithm**: 27 or 29 (branched, multiple modulators)

**Operator Setup**:
- Multiple modulators feeding single carrier
- **Inharmonic ratios** for bell-like timbre:
  - Op 6: Ratio 1.0
  - Op 5: Ratio 1.414 (√2, inharmonic)
  - Op 4: Ratio 2.236 (√5, inharmonic)
  - Op 3: Ratio 3.162 (√10, inharmonic)
  - Op 2: Ratio 4.472 (√20, inharmonic)
  - Op 1: Ratio 1.0 (carrier)

**Envelopes**:
- Attack: Fast (85-99)
- Decay: Long (20-40)
- Sustain: Very low (0-10)
- Release: Long (50-80)

**Macro Settings**:
- DEPTH: 80-95 (high modulation for complex spectra)
- RATE: 60-75 (moderate envelopes for sustained ring)
- PITCH: Tune to musical intervals

**Modulation**: PITCH + SEQ for melodic bell patterns

#### Organ Sounds

**Algorithm**: 23 or 32 (additive, all carriers)

**Operator Setup**:
- All 6 operators as carriers (no FM)
- **Harmonic series ratios**:
  - Op 1: Ratio 1.0 (fundamental)
  - Op 2: Ratio 2.0 (octave)
  - Op 3: Ratio 3.0 (perfect fifth)
  - Op 4: Ratio 4.0 (two octaves)
  - Op 5: Ratio 5.0 (major third)
  - Op 6: Ratio 6.0 (perfect fifth, higher octave)

**Envelopes**:
- Attack: Instant (99)
- Decay: None (99)
- Sustain: Full (99)
- Release: Short (85-99)

**Macro Settings**:
- DEPTH: 0 (no FM, pure additive)
- RATE: 90-99 (instant attack, fast release)
- PITCH: Tune to track

**Modulation**: DEPTH + LFO for tremolo (classic organ vibrato)

#### Brass Sounds

**Algorithm**: 28 or 31 (multiple carriers to 2-op stack)

**Operator Setup**:
- Multiple carriers feed final 2-op stack
- Ratios close to harmonic series
- High modulation for brightness

**Envelopes**:
- Attack: Slow to medium (40-70)
- Decay: Long (20-40)
- Sustain: High (70-90)
- Release: Medium (40-60)

**Macro Settings**:
- DEPTH: 60-75 (moderate to high FM)
- RATE: 50-65 (slower attack, sustained)
- PITCH: Tune to musical context

**Modulation**: DEPTH + EF for dynamic brightness (breath control simulation)

### Drum-Specific Sound Design

#### DX7 Kick Drum

**Algorithm**: 4, 6, or 7 (deep stacks for low-end punch)

**Operator Setup**:
- Low frequency ratios (0.5, 1.0, 1.5)
- High modulation depth for harmonics
- Fast attack, moderate decay on modulators

**Macro Settings**:
- DEPTH: 50-70 (solid harmonics without harshness)
- RATE: 75-85 (fast attack, moderate decay)
- PITCH: -12 to +6 (tune to track's key)

**Modulation**: PITCH + ENV (pitch sweep from high to low)

**Envelope Shape**: Fast attack (99), fast decay (80), low sustain (10), short release (20)

#### DX7 Snare Drum

**Algorithm**: 27, 28, or 29 (branched for noise-like spectra)

**Operator Setup**:
- Mix of harmonic and inharmonic ratios
- High output levels for brightness
- Fast envelopes for snap

**Macro Settings**:
- DEPTH: 70-90 (bright, cutting timbre)
- RATE: 80-95 (very fast attack and decay)
- PITCH: 0 to +12 (adjust body resonance)

**Modulation**: DEPTH + RND (vary brightness per hit)

**Envelope Shape**: Instant attack (99), fast decay (85), no sustain (0), short release (30)

#### DX7 Hi-Hat

**Algorithm**: 23, 32 (additive for metallic shimmer), or 29 (max branching)

**Operator Setup**:
- Inharmonic ratios for metallic character
- High frequencies (ratios 8, 11, 13, 14)
- Very short envelopes

**Macro Settings**:
- DEPTH: 85-100 (maximum brightness)
- RATE: 95-100 (extremely fast envelopes)
- PITCH: +12 to +24 (bright, sizzling character)

**Modulation**: DEPTH + LFO (breathing brightness for open hi-hat)

**Envelope Shape**: Instant attack (99), very fast decay (95), no sustain (0), very short release (90)

#### DX7 Tom

**Algorithm**: 1, 5, or 30 (parallel stacks for tonal body)

**Operator Setup**:
- Low-to-mid frequency ratios (0.5, 1.0, 2.0)
- Moderate modulation for warm tone
- Medium-length envelopes

**Macro Settings**:
- DEPTH: 40-60 (warm, tonal body without harshness)
- RATE: 60-75 (moderate attack and decay)
- PITCH: -24 to +12 (create tom rack with pitch variations)

**Modulation**: PITCH + SEQ (melodic tom patterns)

**Envelope Shape**: Medium attack (70), medium decay (60), low sustain (20), medium release (50)

---

## Troubleshooting

### Common Issues

#### "No sound from DX7 voice"

**Possible Causes**:
1. **No bank loaded** - PATCH knob has no effect if no bank is loaded
2. **DEPTH set to 0** - No FM modulation, and carriers may have low levels
3. **RATE too high** - Envelopes too fast, sound is extremely short
4. **Algorithm mismatch** - Loaded patch may be silent in certain algorithms

**Solutions**:
- Load a bank via DX7 browser
- Set DEPTH to 50 (neutral)
- Set RATE to 50-70 (moderate)
- Try different PATCH values to find audible patches

#### "Voice cuts out after 8-10 bars"

**Cause**: Voice accumulation bug (voices stuck in release phase)

**Solution**: This issue was resolved in the envelope timeout fix (10-second max release). If still occurring:
- Check console for "[DX7] Voice timeout" warnings
- Verify RATE is not set extremely low (< 10)
- Ensure patches have proper release levels (not stuck at sustain level)

#### "DX7 sounds too bright/harsh"

**Cause**: High DEPTH value or patch with high modulator levels

**Solutions**:
- Reduce DEPTH to 30-50
- Try different patches (some are inherently bright)
- Use PPMod DEPTH + ENV to reduce brightness on sustain

#### "DX7 sounds too dull/quiet"

**Cause**: Low DEPTH, low patch output levels, or wrong algorithm

**Solutions**:
- Increase DEPTH to 60-80
- Check patch's algorithm (Algorithms 23, 32 have no FM by design)
- Increase voice LEVEL knob in Bæng
- Try patches from "bright" categories (bells, brass)

#### "Bank fails to load"

**Possible Causes**:
1. **Invalid .syx format** - File is not a valid DX7 sysex dump
2. **Corrupted file** - File is damaged or incomplete
3. **Wrong sysex type** - File is for a different synth (DX21, DX100, etc.)

**Solutions**:
- Verify file is 4104 bytes (bulk dump) or 155-163 bytes (single voice)
- Check file starts with `F0 43 00` (Yamaha sysex header)
- Use a DX7 editor to verify/repair the .syx file
- Download known-good banks from Bæng's factory library

#### "PATCH knob jumps unpredictably"

**Cause**: PPMod is active on PATCH parameter

**Solution**:
- Check if PATCH has a PPMod assignment (yellow LED indicator)
- Click PATCH knob's PPMod LED to open modal and disable modulation
- Or adjust PPMod depth/offset to constrain range

#### "Pitch modulation sounds out-of-key"

**Cause**: Scale quantisation disabled or wrong scale selected

**Solutions**:
- Enable scale quantisation in Bæng settings
- Select correct scale for your track (Major, Minor, etc.)
- Adjust PPMod PITCH offset to land on scale root

### Performance Issues

#### "DX7 voices cause audio dropouts"

**Cause**: High CPU usage from DX7 FM synthesis

**Solutions**:
- Reduce polyphony (use Mono mode, not Poly4)
- Disable PPMod on unused parameters
- Use simpler algorithms (23, 32 are least CPU-intensive)
- Reduce number of active DX7 voices (use other engines for some tracks)

#### "Clicking/popping on note transitions"

**Cause**: Discontinuities in envelope or phase

**Solutions**:
- Increase attack time in RATE macro (slower attack = smoother onset)
- Check patch envelopes (instant attack can cause clicks on some patches)
- Reduce DEPTH to lower modulation sidebands (can reduce clicks)

### Sonic Issues

#### "DX7 kick lacks low-end punch"

**Solutions**:
- Use Algorithm 4, 6, or 7 (deep stacks for low frequencies)
- Set PITCH to -6 or -12 (lower fundamental)
- Increase DEPTH slightly (adds harmonics for perceived weight)
- Use PITCH + ENV modulation (pitch sweep adds punch)
- Check patch's operator ratios (should include 0.5 or 1.0 for low-end)

#### "DX7 snare sounds too tonal"

**Solutions**:
- Use Algorithm 27, 28, or 29 (branched for inharmonic spectra)
- Increase DEPTH to 80+ (more sidebands = more noise-like)
- Set RATE to 90+ (very fast envelopes reduce tonal character)
- Try patches with inharmonic operator ratios

#### "DX7 hi-hat lacks brightness"

**Solutions**:
- Increase DEPTH to 90-100 (maximum modulation)
- Set PITCH to +12 to +24 (raise fundamental)
- Use Algorithm 23 or 32 (additive, all carriers)
- Check patch has high-frequency operator ratios (8, 11, 13, 14)

---

## Further Reading

### DX7 Resources

**Official Documentation**:
- [Yamaha DX7 Operating Manual](https://usa.yamaha.com/files/download/other_assets/9/333979/DX7E1.pdf)
- [Yamaha DX7 Service Manual](http://www.synthmanuals.com/manuals/yamaha/dx7/yamaha_dx7_sm.pdf)

**Reverse Engineering**:
- [Ken Shirriff's DX7 Chip Reverse Engineering](http://www.righto.com/2021/12/yamaha-dx7-chip-reverse-engineering.html)
- [DX7 Sysex Format Documentation](http://homepages.abdn.ac.uk/mth192/pages/dx7/sysex-format.txt)

**FM Synthesis Theory**:
- [John Chowning - The Synthesis of Complex Audio Spectra by Means of Frequency Modulation (1973)](https://www.jstor.org/stable/3679509)
- [The Theory and Technique of Electronic Music - Miller Puckette](http://msp.ucsd.edu/techniques.htm)

**DX7 Patch Libraries**:
- [DX7 Patch Database (Bobby Blues)](https://dxsysex.com/)
- [Yamaha DX7 Patches Archive](https://homepages.abdn.ac.uk/mth192/pages/dx7/index.html)

### Bæng Documentation

- [Bæng User Guide](../baeng-guide.md) - Complete Bæng documentation
- [PPMod System](../../ppmod.md) - Per-parameter modulation reference
- [Analog Engine](analog-engine.md) - Subtractive synthesis engine
- [Sampler Engine](sampler-engine.md) - Sample playback engine

---

## Version History

**v1.0** (2025-12-30)
- Initial documentation release
- Complete algorithm reference (all 32 algorithms)
- Macro controls documentation
- Bank loading system guide
- PPMod integration details
- Sound design guide with examples
- Troubleshooting section

---

*This documentation is part of the Bæng & Ræmbl project. For issues, contributions, or questions, visit the [GitHub repository](https://github.com/MidiSlave/baeng-and-raembl).*
