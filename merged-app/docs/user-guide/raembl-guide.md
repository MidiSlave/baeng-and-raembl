# Ræmbl Synthesiser User Guide

Welcome to **Ræmbl**, a polyphonic synthesiser inspired by the Roland TB-303 with modern multi-engine synthesis, Euclidean sequencing, and deep modulation capabilities. This guide covers everything you need to create expressive basslines, acid sequences, lush pads, and experimental textures.

---

## Table of Contents

1. [Overview](#overview)
2. [Interface Layout](#interface-layout)
3. [Synthesis Engines](#synthesis-engines)
4. [Polyphony Modes](#polyphony-modes)
5. [Sequencing](#sequencing)
6. [TB-303 Performance Features](#tb-303-performance-features)
7. [Scale System](#scale-system)
8. [Per-Parameter Modulation (PPMod)](#per-parameter-modulation-ppmod)
9. [Effects](#effects)
10. [Keyboard Shortcuts](#keyboard-shortcuts)
11. [Sound Design Tips](#sound-design-tips)
12. [Patch Management](#patch-management)

---

## Overview

**Ræmbl** (pronounced "ramble") is a polyphonic synthesiser integrated with Bæng in a unified web application. It combines:

- **3 synthesis engines**: Subtractive (SUB), Plaits (PLT), and Rings (RNG)
- **8-voice polyphony**: Pre-allocated AudioWorklet voices with intelligent allocation
- **Euclidean pattern generator**: Algorithmic rhythm creation using the Bjorklund algorithm
- **Pitch path sequencer**: Up to 16-step melodic patterns with scale quantisation
- **TB-303 inspired features**: Slide (glide), trill, and accent for expressive performance
- **Per-parameter modulation**: 6 modulation modes (LFO, Random, Envelope, etc.) for any parameter
- **Dual FX modes**: Classic reverb/delay or Clouds granular processor

Ræmbl synchronises perfectly with Bæng via the shared Time Strip, allowing you to create cohesive drum + bass productions.

![Ræmbl Interface](../images/ui/raembl-overview.png)

---

## Interface Layout

Ræmbl's interface is organised into modules, each controlling a different aspect of synthesis:

### Engine Selector (Top Left)

Located in the oscillator module header:

- **Dropdown menu** with 3 engine options: **SUBTRACTIVE**, **PLAITS**, **RINGS**
- Click to switch engines on-the-fly (no audio interruption)
- Engine-specific parameters appear below when selected

### FACTORS Module (Euclidean Sequencer)

Controls the rhythmic pattern using Euclidean distribution:

- **STEPS** (1–32): Total number of steps in the pattern
- **FILLS** (0–32): Number of active steps (distributed evenly using Bjorklund algorithm)
- **SHIFT** (0–31): Rotate the pattern by N steps
- **>** (Accent Amount): Number of steps with accent (velocity boost + envelope punch)
- **SLIDE** (Slide Amount): Number of steps with slide (80ms glide without envelope retrigger)
- **TR** (Trill Amount): Number of steps with trill (pitch oscillation to next scale degree)
- **GATE** (5–100%): Note duration as percentage of step length

### PATH Module (Pitch Sequencer)

Controls melodic content:

- **Graphical step editor**: Click to draw pitch values (0–100, mapped to scale)
- **SCALE**: Select from 33 musical scales (Chromatic, Major, Minor, Dorian, Pentatonic, etc.)
- **ROOT**: Set the root note (C–B)
- **PROB** (Probability): Likelihood of pattern advancing vs repeating previous note (0–100%)
- **Visualisation**: 3D cylinder shows current pitch path

### LFO Module (Main LFO)

Global LFO for pitch and filter modulation:

- **AMP** (0–100): Modulation depth
- **FREQ** (0–100): LFO rate (0.1–20 Hz)
- **WAVE** (0–100): Waveform selection (Sine → Triangle → Square → Sawtooth)
- **OFFSET** (-100–+100): DC offset for asymmetric modulation

### OSCILLATOR Module

Controls pitch and waveform generation. **Parameters vary by engine**:

#### Subtractive Engine (SUB)
- **OCT** (0–8): Main oscillator octave transposition
- **SUB OCT** (0–8): Sub-oscillator octave (independent from main)
- **DRIFT** (0–100): Pitch instability/detuning amount
- **GLIDE** (0–100): Portamento time between notes
- **WIDTH** (5–95%): Pulse wave duty cycle
- **PWM** (0–100): Pulse width modulation depth (modulated by Mod LFO)
- **MOD** (0–100): Pitch modulation depth (modulated by Mod LFO)

#### Plaits Engine (PLT)
- **Bank Selector**: GREEN (Pitched/Harmonic), RED (Noise/Physical), ORANGE (Classic/FM)
- **Engine Dropdown**: 24 synthesis engines across 3 banks (see [Synthesis Engines](#synthesis-engines))
- **HARM** (Harmonics, 0–100): Primary timbral control (varies by engine)
- **TIMB** (Timbre, 0–100): Secondary timbral control
- **MORPH** (0–100): Tertiary control or crossfade between modes
- **DEC** (LPG Decay, 0–100): Low-pass gate decay time
- **COL** (LPG Colour, 0–100): Blend between VCA (0%) and VCF (100%) behaviour

#### Rings Engine (RNG)
- **Model Selector**: 6 resonator models (see [Synthesis Engines](#synthesis-engines))
- **POLY** (M/P2/P4): Internal polyphony mode (Mono, 2-voice, 4-voice)
- **STRUC** (Structure, 0–100): Inharmonicity / string coupling
- **BRIT** (Brightness, 0–100): High-frequency content
- **DAMP** (Damping, 0–100): Decay time
- **POS** (Position, 0–100): Excitation position (bow/pluck point)

### MIXER Module

Blend oscillator waveforms. **Parameters vary by engine**:

#### Subtractive Engine (SUB)
- **◢** (Saw, 0–100): Sawtooth level
- **⊓** (Square, 0–100): Square/pulse wave level
- **△** (Triangle, 0–100): Triangle wave level
- **■** (Sub, 0–100): Sub-oscillator level
- **≋** (Noise, 0–100): Noise generator level

#### Plaits Engine (PLT)
- **MIX** (0–100): OUT/AUX crossfade (varies by engine—some engines use this to blend internal signals)

#### Rings Engine (RNG)
- **STRM** (Strum, 0–100): Internal excitation intensity (mixes with external trigger)

### FILTER Module

**Note**: Only active in Subtractive (SUB) mode. Plaits and Rings have internal filtering.

- **HP** (High-pass, 0–100): High-pass filter cutoff (20 Hz–20 kHz)
- **LP** (Low-pass, 0–100): Low-pass filter cutoff (20 Hz–20 kHz)
- **RES** (Resonance, 0–100): Filter resonance/Q
- **KEY** (Key Follow, 0–100): Amount of keyboard tracking (0% = fixed, 100% = 1:1 pitch tracking)
- **ENV** (Env Amount, 0–100): Filter envelope depth (bipolar: 0% = no mod, 50% = neutral, 100% = max positive)
- **MOD** (0–100): Filter modulation depth from Mod LFO

### ENVELOPE Module

**Note**: In Subtractive mode, this controls both amplitude and filter envelopes. In Plaits/Rings, it controls the LPG/internal envelope.

- **A** (Attack, 0–100): Attack time (0.2 ms–8 s, exponential)
- **D** (Decay, 0–100): Decay time (0.2 ms–8 s, exponential)
- **S** (Sustain, 0–100): Sustain level (0–100%)
- **R** (Release, 0–100): Release time (0.2 ms–8 s, exponential)

**Important**: Envelope parameters are independent—changing attack does not affect release.

### MOD (Mod LFO) Module

Secondary LFO for modulation routing:

- **RATE** (0–100): LFO frequency (0.1–20 Hz)
- **WAVE** (Sine/Tri/Square/Saw): Waveform selector (click to cycle)

This LFO modulates pitch (via **OSC → MOD**), pulse width (via **OSC → PWM**), and filter cutoff (via **FILTER → MOD**).

### DELAY Module (Classic FX Mode)

Tape-style delay with wow/flutter modulation:

- **SEND** (0–100): Delay send level
- **TIME** (0–100): Delay time (SYNC mode: 1/32–4 bars; FREE mode: 1 ms–2000 ms)
- **SYNC/FREE Toggle**: Clock-synced vs free-running time
- **FDBK** (Feedback, 0–100): Delay feedback amount
- **WOW** (0–100): Slow pitch modulation (tape warble)
- **FLUT** (Flutter, 0–100): Fast random pitch modulation
- **SAT** (Saturation, 0–100): Tape-style saturation/distortion

### REVERB Module (Classic FX Mode)

Algorithmic reverb with pre-delay and damping:

- **SEND** (0–100): Reverb send level
- **PRED** (Pre-delay, 0–100): Early reflections delay (0–200 ms)
- **DEC** (Decay, 0–100): Reverb decay time
- **DIFF** (Diffusion, 0–100): Echo density
- **DAMP** (Damping, 0–100): High-frequency absorption

### CLOUDS Module (Clouds FX Mode)

Granular processor with 6 playback modes (replaces reverb/delay when active):

- **MODE Selector**: GRAN (Granular), WSOLA, LOOP (Looping Delay), SPEC (Spectral), OLIV (Oliverb), RESO (Resonestor)
- **PITCH** (-200–+200 cents): Pitch shift (-2 to +2 octaves)
- **POS** (Position, 0–100): Grain position in buffer
- **DENS** (Density, 0–100): Grain triggering rate
- **SIZE** (0–100): Grain size
- **TEX** (Texture, 0–100): Grain envelope morphing
- **D/W** (Dry/Wet, 0–100): Dry/wet mix
- **SPRD** (Spread, 0–100): Stereo spread
- **FB** (Feedback, 0–100): Feedback amount (**Critical**: defaults to 0 to prevent runaway)
- **VERB** (Reverb, 0–100): Internal reverb amount
- **GAIN** (Input Gain, 0–100): Input level (0–200%, default 100%)

**Warning**: High feedback (≥90%) + high reverb (≥70%) can cause instability. The UI will warn you.

See [Clouds FX documentation](../effects/clouds.md) for detailed mode descriptions.

### OUTPUT Module

- **VOL** (Volume, 0–100): Master output level

---

## Synthesis Engines

Ræmbl features **3 distinct synthesis engines**, each with unique sound character and parameters.

### Subtractive (SUB)

**Classic virtual analogue synthesis** with anti-aliased oscillators and TPT filters.

**Sound Character**: Warm, rich, classic subtractive tones. Ideal for basslines, leads, pads, and traditional synthesis.

**Signal Path**:
1. **Oscillators**: 5 waveforms (saw, square, triangle, sub-oscillator, noise) with PolyBLEP anti-aliasing
2. **Mixer**: Blend waveforms to taste
3. **Filter**: TPT (Topology-Preserving Transform) highpass + lowpass with resonance
4. **Envelope**: Independent amp and filter ADSR envelopes
5. **LFO Modulation**: Pitch, pulse width, and filter modulation

**Best For**:
- TB-303 style acid basslines
- Classic analogue leads
- Warm pads with filter sweeps
- Traditional subtractive synthesis

**Modulatable Parameters**: All oscillator, mixer, filter, and envelope parameters support PPMod.

---

### Plaits (PLT)

**24-engine macro oscillator** ported from Mutable Instruments Plaits Eurorack module.

**Sound Character**: Incredibly diverse—everything from classic analogue to granular textures, FM bells, physical modelling, and percussion.

**Engine Banks**:

#### GREEN (Pitched/Harmonic, Engines 0–7)
| # | Engine | Description |
|---|--------|-------------|
| 0 | **Virtual Analog** | Classic VA oscillators with sync and fold |
| 1 | **Waveshaping** | Wavefolding and phase distortion |
| 2 | **FM** | 2-operator FM synthesis |
| 3 | **Grain** | Granular synthesis with formant generation |
| 4 | **Additive** | Harmonic additive synthesis |
| 5 | **Wavetable** | Wavetable scanning and interpolation |
| 6 | **Chord** | Chord generator with inversions |
| 7 | **Speech** | Vowel synthesis and formants |

#### RED (Noise/Physical, Engines 8–15)
| # | Engine | Description |
|---|--------|-------------|
| 8 | **Swarm** | Swarming oscillators (bees, crickets) |
| 9 | **Noise** | Filtered noise with dust/crackle modes |
| 10 | **Particle** | Particle noise with variable density |
| 11 | **String** | Inharmonic string physical model |
| 12 | **Modal** | Modal resonator bank |
| 13 | **Bass Drum** | Analogue bass drum synthesis |
| 14 | **Snare Drum** | Analogue snare drum synthesis |
| 15 | **Hi-Hat** | Analogue hi-hat synthesis |

#### ORANGE (Classic/FM, Engines 16–23)
| # | Engine | Description |
|---|--------|-------------|
| 16 | **VA-VCF** | Virtual analogue with low-pass gate |
| 17 | **Phase Distortion** | Casio CZ-style phase distortion |
| 18 | **Six-Op FM 1** | DX7-style 6-operator FM (algorithm 1) |
| 19 | **Six-Op FM 2** | 6-operator FM (algorithm 2) |
| 20 | **Six-Op FM 3** | 6-operator FM (algorithm 3) |
| 21 | **Wave Terrain** | Wave terrain navigation synthesis |
| 22 | **String Machine** | String ensemble (chorus strings) |
| 23 | **Chiptune** | NES/Game Boy style pulse waves |

**Macro Parameters** (vary by engine):
- **HARM** (Harmonics): Primary timbral control (e.g., waveform in VA, feedback in FM, formant in Speech)
- **TIMB** (Timbre): Secondary control (e.g., filter cutoff, grain density, operator ratio)
- **MORPH**: Tertiary control or crossfade (e.g., sync amount, waveshape, algorithm blend)
- **DEC** (LPG Decay): Low-pass gate decay time (affects both amplitude and brightness)
- **COL** (LPG Colour): VCA ↔ VCF blend (0% = pure VCA, 100% = pure VCF)
- **MIX**: OUT/AUX crossfade (varies by engine—some use this for internal signal blending)

**Best For**:
- Experimental textures and soundscapes
- FM bells and metallic tones
- Percussion (use RED bank engines 13–15)
- Granular pads
- Vowel sounds and formants

**Modulatable Parameters**: All Plaits macro parameters (HARM, TIMB, MORPH, DEC, COL, MIX) support PPMod.

---

### Rings (RNG)

**Physical modelling resonator** ported from Mutable Instruments Rings Eurorack module.

**Sound Character**: Organic, acoustic, and resonant. Simulates strings, bells, membranes, and metallic surfaces with realistic physical behaviour.

**Resonator Models**:

| # | Model | Description | Sound Character |
|---|-------|-------------|-----------------|
| 0 | **Modal** | 64-mode SVF bank resonator | Metallic bells, gongs, chimes |
| 1 | **Sympathetic String** | 8 coupled strings | Sitar, tampura, resonant strings |
| 2 | **String** | Karplus-Strong with dispersion | Guitar, bass, plucked strings |
| 3 | **FM Voice** | FM synthesis with envelope follower | FM bells with organic decay |
| 4 | **Sympathetic String Quantised** | Quantised sympathetic strings | Pitched, harmonic string ensemble |
| 5 | **String and Reverb** | String model + built-in reverb | Lush, spacious plucked strings |

**Easter Egg**: **Disastrous Peace** (12-voice polysynth mode, accessed via hidden UI interaction—see Rings documentation)

**Parameters**:
- **POLY** (M/P2/P4): Polyphony mode (Mono, 2-voice, 4-voice max)
- **STRUC** (Structure): Inharmonicity (0% = harmonic, 100% = bell-like/inharmonic) or string coupling
- **BRIT** (Brightness): High-frequency content and bow pressure
- **DAMP** (Damping): Decay time (0% = infinite, 100% = very short)
- **POS** (Position): Excitation position (0% = bridge, 100% = centre; affects timbre)
- **STRM** (Strum): Internal excitation intensity (mixes with external note trigger)

**Best For**:
- Acoustic instrument emulation (guitar, bass, bells)
- Organic textures and soundscapes
- Resonant drones
- Physical modelling experimentation

**Modulatable Parameters**: STRUC, BRIT, DAMP, POS support PPMod. **Note**: Rings uses internal 4-voice polyphony; main thread cannot address individual voices, so all modulation is global (not per-voice).

---

## Polyphony Modes

Ræmbl supports **8 simultaneous voices** with intelligent voice allocation.

### Voice Modes

Switch between modes using the **M/POLY** toggle in the oscillator module:

- **MONO (M)**: Monophonic mode—one note at a time
  - **Legato**: Notes played while holding another note do not retrigger the envelope
  - **Glide**: Smooth pitch transitions between notes (controlled by GLIDE parameter)
  - **Slide**: TB-303 style glide without envelope retrigger (triggered by SLIDE flag in sequencer)

- **POLY2 (P2)**: 2-voice polyphonic mode
  - Up to 2 simultaneous notes
  - Voice stealing uses oldest note when limit exceeded

- **POLY4 (P4)**: 4-voice polyphonic mode (default)
  - Up to 4 simultaneous notes
  - Ideal for chords and harmonies

- **POLY8 (full polyphony)**: 8-voice polyphonic mode
  - Maximum polyphony
  - Note: Exceeding 8 voices triggers voice stealing (oldest non-releasing voice is stolen)

**Note**: Rings engine has **internal polyphony** controlled by the **POLY** parameter (M/P2/P4 max). This is separate from the global voice mode.

### Voice Allocation Strategy

Ræmbl uses **intelligent voice stealing** with a scoring system:

1. **Prefer inactive, non-releasing voices** (cleanest allocation)
2. If none available, steal based on **stealability score**:
   - **Age**: Older voices are more stealable
   - **Velocity**: Quieter voices are more stealable
   - **Accent/Trill**: Accented or trilled notes are less stealable
   - **Engine**: Plaits voices have engine-specific stealability (percussive engines more stealable)

**Result**: Critical notes (accented, recent, loud) are protected from voice stealing.

---

## Sequencing

Ræmbl features two complementary sequencers: **FACTORS** (Euclidean rhythm) and **PATH** (pitch sequencer).

### Euclidean Rhythm Generator (FACTORS)

Based on the **Bjorklund algorithm**, FACTORS distributes active steps evenly across the pattern.

**How It Works**:
- **STEPS**: Total pattern length (1–32)
- **FILLS**: Number of active steps (0–32)
- **SHIFT**: Rotate pattern (0–31)

**Example**: `STEPS=16, FILLS=5` produces: `[x . . x . . x . . x . . x . . .]`

This creates **maximally even** rhythmic patterns used in traditional music worldwide (West African djembe patterns, Cuban clave, etc.).

**Visualisation**: The FACTORS module shows the current pattern with active steps highlighted.

### Per-Step Effects

Each active step can have **accent**, **slide**, and/or **trill** flags:

- **> (Accent Amount)**: Number of steps with accent (0–fills)
  - **Effect**: 1.5× velocity boost, snappier decay, attack punch
  - **Use**: Emphasise downbeats, create groove

- **SLIDE (Slide Amount)**: Number of steps with slide (0–fills)
  - **Effect**: 80 ms TB-303 style glide without envelope retrigger
  - **Mono Mode**: Smooth pitch transition on active voice
  - **Poly Mode**: 40 ms "slide-into" effect on note trigger
  - **Use**: Create legato basslines, smooth melodic transitions

- **TR (Trill Amount)**: Number of steps with trill (0–fills)
  - **Effect**: Pitch oscillation to next scale degree
  - **Timing**: 2-note trill on swung offbeats, 3-note trill on downbeats
  - **Scale-aware**: Targets next note in current scale
  - **Use**: Add ornamentation, create rhythmic interest

**Gate Length**: Controls note duration as percentage of step length (5–100%). At 100%, notes sustain until the next step (legato). At lower values, notes have space between them (staccato).

### Pitch Path Sequencer (PATH)

A **graphical step sequencer** for melodic content:

1. **Draw pitches**: Click in the PATH visualisation to set pitch values (0–100)
2. **Scale quantisation**: Pitches are mapped to the selected scale (e.g., C Minor, E Dorian)
3. **Step length**: Matches FACTORS step count (up to 16 steps)
4. **Probability**: Controls likelihood of pattern advancing vs repeating previous note

**Interaction**:
- Click and drag to draw smooth pitch curves
- Each step's pitch is quantised to the nearest note in the selected scale
- Combine with FACTORS for complex rhythmic + melodic patterns

**Visualisation**: 3D rotating cylinder displays the pitch path in real-time.

---

## TB-303 Performance Features

Ræmbl faithfully recreates the Roland TB-303's iconic performance features:

### Slide (Glide)

**What It Is**: Smooth pitch transition between notes without retriggering the envelope.

**How It Works**:
- In **MONO mode**: Existing voice's pitch ramps exponentially over **80 ms** (authentic TB-303 timing)
- In **POLY mode**: New voice has **40 ms slide-into** effect (gentler)
- Envelope continues from current state (no retrigger)
- Filter cutoff follows pitch if **KEY** (key follow) is enabled

**How to Use**:
1. Enable **SLIDE** flags in FACTORS sequencer (or manually via step editor)
2. Notes with slide flag will glide from previous note
3. Adjust **GLIDE** parameter for different slide times (0 = instant, 100 = slow portamento)

**Tip**: Classic acid basslines use slide on upward pitch movements (e.g., root → fifth).

### Trill

**What It Is**: Rapid pitch oscillation to the next note in the current scale.

**How It Works**:
- **Mono mode**: 70% slide up, 25% hold, 5% gap per trill segment (authentic TB-303 timing)
- **Poly mode**: Similar timing on newly allocated voice
- **Timing variation**: 2-note trill on swung offbeats, 3-note trill on downbeats
- **Scale-aware**: Target note is next scale degree (respects current scale and root)

**How to Use**:
1. Enable **TR** (trill) flags in FACTORS sequencer
2. Set scale (e.g., Minor Pentatonic) and root (e.g., E)
3. Trilled notes will oscillate to next scale degree (e.g., E → G in E Minor Pent)

**Tip**: Use sparingly for emphasis—trills on every step can sound chaotic.

### Accent

**What It Is**: Velocity boost with snappier envelope for punchy emphasis.

**How It Works**:
- **1.5× velocity boost** (louder)
- **Snappier decay** (tighter envelope)
- **Attack punch** (percussive transient)

**How to Use**:
1. Enable **>** (accent) flags in FACTORS sequencer
2. Accented steps will cut through the mix with extra punch

**Tip**: Place accents on downbeats or syncopated offbeats for groove.

---

## Scale System

Ræmbl features **33 musical scales** from around the world, enabling intelligent pitch generation.

### How It Works

1. **Select a scale** (e.g., Minor, Major, Dorian, Hijaz)
2. **Set the root note** (C–B)
3. **Draw pitches** in the PATH sequencer (0–100)
4. Ræmbl **quantises pitches** to the nearest note in the selected scale

**Example**:
- Scale: **E Minor** (E, F#, G, A, B, C, D)
- Root: **E**
- Pitch value: **47%**
- Result: **B** (fifth of E Minor)

### Available Scales

Ræmbl includes 33 scales across multiple categories:

#### Chromatic and Western Scales
- **Chrom** (Chromatic): All 12 notes
- **Major**: Do-Re-Mi-Fa-Sol-La-Ti
- **Minor** (Natural Minor): La-Ti-Do-Re-Mi-Fa-Sol
- **Harm Min** (Harmonic Minor): Minor with raised 7th
- **Melo Min** (Melodic Minor): Minor with raised 6th and 7th

#### Western Modes
- **Dorian**: Minor with raised 6th (jazzy minor)
- **Phryg** (Phrygian): Dark, Spanish-sounding minor
- **Lydian**: Major with raised 4th (dreamy)
- **Mixo** (Mixolydian): Major with lowered 7th (bluesy)
- **Locrian**: Diminished, unstable (rarely used melodically)

#### Pentatonic and Blues
- **Maj Pent** (Major Pentatonic): 5-note major scale (no 4th or 7th)
- **Min Pent** (Minor Pentatonic): 5-note minor scale (classic blues/rock)
- **Blues**: Minor Pentatonic + blue note (flat 5)

#### Synthetic/Jazz Scales
- **WhlTone** (Whole Tone): Symmetrical, dreamlike (all whole steps)
- **Dim** (Diminished): Symmetrical, tense (half-whole pattern)
- **Altered**: Jazz altered dominant (superlocrian)
- **Bop Dom/Maj** (Bebop Dominant/Major): Jazz scales with chromatic passing tones
- **Prometh** (Prometheus): Mystic, whole-tone-like

#### Middle Eastern/Arabic Scales
- **Dbl Harm** (Double Harmonic): Exotic, Arabic-sounding (raised 3rd and 7th)
- **Persian**: Similar to Double Harmonic, ancient Persian music
- **Hijaz**: Characteristic Middle Eastern scale (flat 2, raised 3)

#### Eastern European Scales
- **Hung Min** (Hungarian Minor): Dark, gypsy-influenced minor
- **Ukr Dor** (Ukrainian Dorian): Dorian with raised 4th
- **Neap Maj/Min** (Neapolitan Major/Minor): Classical, operatic

#### Japanese/East Asian Scales
- **Hirajo**: Traditional Japanese scale
- **In**: Japanese pentatonic (sad, contemplative)
- **Yo**: Japanese pentatonic (bright, joyful)
- **Iwato**: Japanese pentatonic (sparse, ancient)
- **Kumoi**: Japanese pentatonic (versatile)

#### Ethiopian/African Scales
- **Bati**: Ethiopian pentatonic
- **Ambassl** (Ambassel): Ethiopian church music
- **Anchi** (Anchihoye): Ethiopian secular music

### Trill Target Selection

When a trill is triggered, Ræmbl intelligently selects the **next note in the current scale**:

- Finds the base note in the scale
- Selects the next scale degree (wraps around to root if at top)
- Respects octave boundaries

**Example**: E Minor Pentatonic (E, G, A, B, D)
- Base note: **E**
- Trill target: **G** (next scale degree)

---

## Per-Parameter Modulation (PPMod)

Ræmbl's **PPMod system** allows you to modulate any parameter with 6 different modulation sources.

### Quick Overview

- **6 modulation modes**: LFO, RND (Random), ENV (Envelope), EF (Envelope Follower), TM (Turing Machine), SEQ (Sequencer)
- **Per-parameter**: Each parameter can have independent modulation
- **K-rate updates**: 30 FPS on main thread (not audio-rate) for CPU efficiency
- **Depth + Offset**: Bipolar depth control (-100–+100%) and offset (-100–+100%)

### Accessing PPMod

1. **Right-click** (or **Shift+Click**) on any parameter label (e.g., "LP" for low-pass filter)
2. **PPMod modal** opens with modulation settings
3. **Select mode** (LFO, RND, ENV, EF, TM, SEQ)
4. **Adjust parameters** for the selected mode
5. **Enable modulation** and close modal

**Indicator**: Modulated parameters show a **blue dot** or **blue border** on the fader.

### Modulation Modes

| Mode | Description | Best For |
|------|-------------|----------|
| **LFO** | Low-frequency oscillator | Cyclic filter sweeps, vibrato, tremolo |
| **RND** | LFSR-based random | Unpredictable pitch/filter modulation, generative sequences |
| **ENV** | AD/ADSR envelope | Note-triggered modulation (filter sweeps, pitch bends) |
| **EF** | Envelope follower | Dynamics-responsive modulation (auto-wah, side-chain-like effects) |
| **TM** | Turing Machine (probabilistic step sequencer) | Generative melodies, evolving patterns |
| **SEQ** | CV sequencer | Rhythmic modulation, stepped filter sweeps |

For detailed documentation on each mode, see [PPMod Modes](../modulation/ppmod-modes.md).

### MONO vs POLY Behaviour

- **MONO mode**: Global modulation (single modulation instance for all notes)
- **POLY mode**: Per-voice modulation (8 independent instances, one per voice)
  - Each voice has its own LFO phase, random state, envelope, etc.
  - **Phase offset**: Voices start at different LFO phases to prevent unison (0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°)

**Example**: In POLY mode with filter cutoff LFO modulation, each voice's filter sweeps independently.

### Engine-Specific PPMod Support

| Engine | PPMod Support | Notes |
|--------|---------------|-------|
| **Subtractive** | Full per-voice | All oscillator, mixer, filter, envelope params |
| **Plaits** | Full per-voice | HARM, TIMB, MORPH, DEC, COL, MIX params |
| **Rings** | Global only | Main thread cannot address individual Rings voices |

---

## Effects

Ræmbl has **two FX modes**: Classic (reverb + delay) and Clouds (granular processor).

### Classic FX Mode

Traditional reverb and delay with wow/flutter modulation.

#### Reverb
- **Algorithmic reverb** with pre-delay, decay, diffusion, and damping
- **Send-based**: Adjust SEND level to taste
- See [Reverb documentation](../effects/reverb.md) for detailed parameters

#### Delay
- **Tape-style delay** with wow (slow pitch modulation) and flutter (fast random modulation)
- **SYNC mode**: Clock-synced delay times (1/32–4 bars)
- **FREE mode**: Free-running delay (1 ms–2000 ms)
- **Saturation**: Tape-style distortion for warmth
- See [Delay documentation](../effects/delay.md) for detailed parameters

### Clouds FX Mode

**Granular processor** ported from Mutable Instruments Clouds Eurorack module with 6 playback modes.

#### Modes

1. **GRAN (Granular)**: 64-grain engine with window morphing, deterministic seed
2. **WSOLA**: Time-stretching without pitch change (phase vocoder-like)
3. **LOOP (Looping Delay)**: Buffer-based delay with pitch shifting
4. **SPEC (Spectral)**: Phase vocoder FFT processing
5. **OLIV (Oliverb)**: Parasites reverb mode (lush, diffuse)
6. **RESO (Resonestor)**: Parasites resonator mode (pitched resonances)

#### Key Parameters

- **PITCH**: Pitch shift (-2 to +2 octaves)
- **POS** (Position): Grain position in buffer
- **DENS** (Density): Grain triggering rate
- **SIZE**: Grain size (short = glitchy, long = smooth)
- **TEX** (Texture): Grain envelope morphing
- **FB** (Feedback): **Critical parameter**—defaults to 0 to prevent runaway

**Warning**: High feedback (≥90%) + high reverb (≥70%) can cause audio instability. The UI will display a warning if this combination is detected.

See [Clouds FX documentation](../effects/clouds.md) for comprehensive mode descriptions and sound design tips.

### Switching FX Modes

1. Click the **FX MODE** toggle (Classic ↔ Clouds)
2. Audio routing automatically updates:
   - **Classic mode**: Dry → Reverb/Delay sends → Master
   - **Clouds mode**: Dry → Clouds (serial insert) → Master
3. Previous FX settings are preserved when switching back

---

## Keyboard Shortcuts

Ræmbl-specific shortcuts (global shortcuts like Space for Play/Stop are in [Getting Started](getting-started.md)):

| Key | Action |
|-----|--------|
| **Z-M** (bottom 2 rows) | Play notes (piano keyboard mapping) |
| **Q-]** (top 2 rows) | Play notes (black keys) |
| **Shift + Click** | Open PPMod modal for parameter |
| **Right-click** | Open PPMod modal for parameter (alternative) |
| **Esc** | Close PPMod modal or other dialogs |

### Virtual Keyboard Mapping

Ræmbl's computer keyboard uses a piano-style layout:

```
Black keys:  Q  W  E     T  Y  U     O  P  [  ]
White keys:   A  S  D  F  G  H  J  K  L  ;  '
              C  D  E  F  G  A  B  C  D  E  F
```

- **Bottom row** (A-') = White keys (C-F)
- **Top row** (Q-]) = Black keys (C#, D#, F#, etc.)

---

## Sound Design Tips

### Creating Classic TB-303 Acid Basslines

1. **Engine**: Use **Subtractive (SUB)**
2. **Waveform**: 100% **Saw** (◢), or 50% Saw + 50% Square (⊓)
3. **Filter**: **LP** at 30–50%, **RES** (resonance) at 60–80%
4. **Envelope**: **A=0**, **D=40**, **S=0**, **R=20** (short, punchy)
5. **Filter Envelope**: **ENV** at 70% (positive filter modulation)
6. **Sequencing**:
   - **STEPS=16**, **FILLS=8–12**
   - Add **SLIDE** on upward pitch movements
   - Add **ACCENT** on downbeats and syncopated notes
   - Use **Minor Pentatonic** or **Minor** scale
7. **Effects**: Delay at 25%, Reverb at 10–20%

**Tip**: Modulate **LP** (filter cutoff) with **PPMod LFO** (slow rate, 30%) for evolving sweeps.

---

### Creating Lush Pads

1. **Engine**: Use **Plaits (PLT)** engine 4 (Additive) or 22 (String Machine)
2. **Polyphony**: **POLY4** or **POLY8** for full chords
3. **Envelope**: **A=60**, **D=40**, **S=80**, **R=70** (slow attack, long release)
4. **LPG**: **DEC=50**, **COL=70** (more VCF for warmth)
5. **Modulation**:
   - **PPMod LFO** on **TIMB** (slow rate, 20% depth) for movement
   - **PPMod LFO** on **HARM** (very slow rate, 10% depth) for shimmer
6. **Effects**: **Clouds OLIV mode** at 60% D/W, **VERB=80**, **SIZE=70**

**Tip**: Use **Major**, **Lydian**, or **Maj Pent** scale for bright, uplifting pads.

---

### Creating Plucked Strings (Rings)

1. **Engine**: Use **Rings (RNG)** model 2 (String)
2. **Polyphony**: **P2** or **P4** for chords
3. **Parameters**:
   - **STRUC=40** (slightly inharmonic for realism)
   - **BRIT=60** (bright attack)
   - **DAMP=50** (medium decay)
   - **POS=30** (near bridge for twang)
4. **Envelope**: **A=0**, **D=30**, **S=0**, **R=40** (pluck-like)
5. **Effects**: **Reverb** at 30%, **Pre-delay=10 ms**

**Tip**: Use **PPMod RND** on **POS** (low probability, 20% depth) for natural variation in pluck position.

---

### Creating FM Bells

1. **Engine**: Use **Plaits (PLT)** engine 2 (FM) or 18–20 (Six-Op FM)
2. **Polyphony**: **POLY4** for chords
3. **Parameters**:
   - **HARM=60** (high modulation index for bright timbre)
   - **TIMB=40** (carrier/modulator ratio)
   - **MORPH=50** (algorithm blend)
   - **DEC=40** (quick LPG decay for percussive attack)
   - **COL=30** (more VCA for clean envelope)
4. **Envelope**: **A=0**, **D=50**, **S=0**, **R=60** (bell-like decay)
5. **Effects**: **Reverb** at 40%, **Decay=80**, **Damping=20**

**Tip**: Use **Pentatonic** scales (Maj Pent or Min Pent) for gamelan-like bell patterns.

---

### Creating Evolving Textures

1. **Engine**: Use **Plaits (PLT)** engine 3 (Grain) or **Clouds GRAN mode**
2. **Polyphony**: **MONO** or **POLY2** for simplicity
3. **PPMod Routing**:
   - **TM mode** on **HARM** (8 steps, 60% probability, 40% depth)
   - **LFO mode** on **TIMB** (very slow rate 0.1 Hz, 50% depth)
   - **RND mode** on **POS** (Clouds, 16-bit LFSR, 80% probability, 30% depth)
4. **Sequencing**: Long **GATE** (90%), slow **BPM** (60–80)
5. **Effects**: **Clouds GRAN mode**, **FB=40**, **DENS=70**, **SIZE=80**

**Tip**: Let the patch evolve over time—Turing Machine and Random modulation create ever-changing textures.

---

## Patch Management

Ræmbl's state is saved as part of the **unified patch format** (v1.2.0) which includes both Bæng and Ræmbl.

### Saving Patches

1. Click **SAVE** button in the patch manager (top right)
2. Enter a patch name
3. Patch is saved to browser localStorage (includes timing, Bæng, Ræmbl, and all modulation settings)

**Patch Format**: JSON file with:
- **Shared timing**: BPM, swing, bar length
- **Ræmbl state**: All synthesis parameters, sequencer state, modulation configs
- **Bæng state**: All drum voices and patterns
- **Version**: v1.2.0 (backward compatible with v1.0.0 and v1.1.0)

### Loading Patches

1. Click **LOAD** button
2. Select a patch from the list
3. Patch loads instantly (updates all parameters, timing, and modulation)

**Note**: Loading a patch updates **shared timing** (BPM, swing, length) for both Bæng and Ræmbl.

### Exporting/Importing Patches

1. **Export**: Click **EXPORT** → downloads JSON file
2. **Import**: Click **IMPORT** → select JSON file from disk

**Use Cases**:
- Share patches with other users
- Backup patches outside browser localStorage
- Migrate patches between browsers/devices

### Default Patch

The default patch is a basic TB-303 style acid preset:

- **Engine**: Subtractive
- **Sequencer**: 16 steps, 8 fills, Minor Pentatonic scale
- **Filter**: Lowpass at 75%, Resonance at 20%
- **Effects**: Reverb and Delay at 25% each

---

## Next Steps

Now that you understand Ræmbl's synthesis engines, sequencing, and modulation, explore these advanced topics:

- **[PPMod Overview](../modulation/ppmod-overview.md)**: Deep dive into per-parameter modulation
- **[PPMod Modes](../modulation/ppmod-modes.md)**: Detailed guide to all 6 modulation modes
- **[Clouds FX](../effects/clouds.md)**: Comprehensive Clouds granular processor guide
- **[Plaits Engine Reference](../engines/plaits.md)**: Detailed parameters for all 24 Plaits engines
- **[Rings Engine Reference](../engines/rings.md)**: Physical modelling resonator guide
- **[Euclidean Patterns](../sequencer/euclidean.md)**: Algorithmic rhythm generation theory
- **[MIDI Control](../reference/midi.md)**: MIDI CC mapping and external controller setup

---

## Troubleshooting

### No sound from Ræmbl?

1. **Check volume**: Ensure **OUTPUT → VOL** is above 0%
2. **Check engine**: Some engines (Rings) require specific settings—try switching to SUB
3. **Check polyphony**: Ensure you're not exceeding 8 voices (voice stealing may cause dropouts)
4. **Check FX routing**: If in Clouds mode, ensure **D/W** (dry/wet) is above 0%
5. **Check master meters**: Are they showing signal when you play notes?

### Voice stealing/dropouts?

1. **Reduce polyphony**: Switch from POLY8 to POLY4 or POLY2
2. **Check release time**: Long **R** (release) values mean voices stay "releasing" longer, reducing available voices
3. **Check accent/trill**: These flags make voices less stealable—too many can cause voice allocation issues

### Modulation not working?

1. **Check enabled**: Ensure modulation is **enabled** in PPMod modal (toggle in top-right)
2. **Check depth**: Ensure **Depth** is above 0% (or below 0% for negative modulation)
3. **Check mode**: Some modes (ENV, EF) require note triggers to produce output
4. **Check MONO/POLY**: In POLY mode, modulation is per-voice—you may need to play multiple notes to hear the effect

### Clouds FX sounds unstable?

1. **Check feedback**: Reduce **FB** below 70%
2. **Check reverb**: If **FB** is high, reduce **VERB** below 50%
3. **Check input gain**: Reduce **GAIN** to prevent clipping
4. **Check mode**: Some modes (SPEC, RESO) are more sensitive to feedback than others

---

Enjoy creating music with Ræmbl! For more help, see the [full documentation index](../index.md) or [report issues on GitHub](https://github.com/MidiSlave/baeng-and-raembl/issues).
