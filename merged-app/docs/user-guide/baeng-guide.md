# Bæng Drum Machine User Guide

## Table of Contents

1. [Overview](#overview)
2. [Interface Layout](#interface-layout)
3. [Synthesis Engines](#synthesis-engines)
4. [Step Sequencer](#step-sequencer)
5. [Step Parameters](#step-parameters)
6. [Per-Voice Controls](#per-voice-controls)
7. [Per-Parameter Modulation (PPMod)](#per-parameter-modulation-ppmod)
8. [Effects](#effects)
9. [Keyboard Shortcuts](#keyboard-shortcuts)
10. [Sound Design Tips](#sound-design-tips)
11. [Patch Management](#patch-management)

---

## Overview

**Bæng** is a sophisticated 6-voice drum machine integrated into the Bæng & Ræmbl suite. Each voice features independent synthesis engines, step sequencing, and comprehensive modulation capabilities. Bæng synchronises seamlessly with Ræmbl, sharing transport controls and timing whilst maintaining separate audio routing.

### Key Features

- **6 Independent Voices** - Each voice can use a different synthesis engine
- **Multiple Synthesis Engines** - DX7 FM, Analog (Kick/Snare/Hi-Hat), Sample Player, Slice Player
- **Per-Voice Step Sequencer** - Up to 64 steps per voice with independent sequence lengths
- **Advanced Step Parameters** - Gate, accent, ratchet, probability, deviation, flam
- **Euclidean Pattern Generator** - Algorithmic pattern creation with fills, shifts, and accents
- **Per-Parameter Modulation** - 6 modulation modes (LFO, RND, ENV, EF, TM, SEQ) for any parameter
- **Global Effects** - Reverb, Delay, Clouds granular processor
- **Drum Bus Processing** - Ableton-inspired master bus with Drive, Crunch, Transients, Boom, Compression, Dampen
- **Choke Groups** - Mutual exclusion for realistic hi-hat articulation

![Bæng Interface](../images/ui/baeng-overview.png)

---

## Interface Layout

Bæng's interface is organised into several modules arranged horizontally:

### TIME Module (Shared Time Strip)

Located at the top of the interface, the TIME module controls global timing shared between Bæng and Ræmbl:

- **Play/Stop Button** - Start/stop transport (Space bar shortcut)
- **Position Display** - Shows current bar.beat.step position
- **BPM** - Tempo control (20-300 BPM)
- **SWING** - Groove control (0-100%, applies to 16th note offbeats)
- **LENGTH** - Pattern length in beats (1-128 beats)

> **Note:** Changes to timing parameters affect both Bæng and Ræmbl simultaneously.

### VOICES Module

The VOICES module is the central hub for programming patterns and managing voice settings:

#### Voice Selection
- **Voice Buttons (1-6)** - Click to select a voice or press number keys 1-6
- Active voice is highlighted with accent colour
- Clicking a voice button triggers a preview of that voice

#### Step Grid
- **16-Step Visual Sequencer** - Edit patterns for the selected voice
- Steps display gate states: Off (dark), Gate ON (yellow), Accent ON (yellow + orange border)
- Click steps to cycle through states: Off → Gate ON → Accent ON → Off
- Grid shows current playback position with moving highlight

#### Sequence Controls
- **SEQ LEN** - Active sequence length (1-64 steps, controlled by Euclidean STEPS parameter)
- **CHOKE** - Choke group assignment (0-4, 0=none)
- **LEVEL** - Voice output level (0-100)
- **PAN** - Stereo positioning (0=left, 50=centre, 100=right)

#### Effect Sends
- **RVB** - Reverb send amount (0-100)
- **DLY** - Delay send amount (0-100)
- **CLOUD** - Clouds granular processor send amount (0-100, visible when FX Mode = Clouds)

#### Processing
- **BIT** - Bit reduction for lo-fi effects (0-100, higher = more degradation)
- **DRIVE** - Distortion/saturation (0-100)

#### Euclidean Controls
- **STEPS** - Pattern length (1-16 steps)
- **FILLS** - Number of active pulses (0-16)
- **SHIFT** - Pattern rotation/offset (0-15)
- **ACCENT** - Number of accented steps (0-16)
- **FLAM** - Number of flammed steps (grace notes, 0-16)
- **RATCHET** - Number of ratcheted steps (0-16)
- **R-SPD** - Ratchet speed multiplier (1-8x)
- **DEV** - Deviation amount (0-100%, timing variation)

### ENGINE Module

The ENGINE module controls synthesis parameters for the selected voice. The interface adapts based on the selected engine type.

#### Engine Selection
- **Engine Dropdown** - Select synthesis engine for the current voice
- Available engines: DX7, aKICK, aSNARE, aHIHAT, SAMPLE, SLICE

#### Macro Controls

Macro controls provide intuitive access to the most important synthesis parameters. The labels change based on the selected engine:

**DX7 FM Synthesis:**
- **PATCH** - DX7 patch selection (0-31 from loaded bank)
- **DEPTH** - FM modulation depth
- **RATE** - Modulator frequency ratio
- **PITCH** - Overall pitch offset

**aKICK (Analog Kick):**
- **PATCH** - Preset selection
- **DEPTH** - Tone control (brightness)
- **RATE** - Decay time
- **PITCH** - Pitch sweep amount

**aSNARE (Analog Snare):**
- **PATCH** - Preset selection
- **DEPTH** - Tone control
- **RATE** - Decay time
- **PITCH** - Snap amount (transient sharpness)

**aHIHAT (Analog Hi-Hat):**
- **PATCH** - Preset selection
- **DEPTH** - Metallic character
- **RATE** - Decay time
- **PITCH** - Brightness

**SAMPLE (Sample Player):**
- **SAMPLE** - Sample selection from loaded kit
- **DECAY** - Amplitude decay (0-100)
- **FILTER** - Lowpass filter cutoff
- **PITCH** - Pitch shift in semitones

**SLICE (Beat Slicer):**
- **SLICE** - Slice selection from loaded loop
- **DECAY** - Decay as percentage of slice length (10-110%)
- **FILTER** - Lowpass filter cutoff
- **PITCH** - Pitch shift in semitones

#### Additional Controls
- **LEVEL** - Voice output level (duplicated from VOICES module for convenience)
- **PAN** - Stereo positioning
- **GATE** - Note duration (0-100%, 100% enables slide for DX7 in mono mode)

### REVERB Module (Classic FX Mode)

Global convolution reverb effect:

- **DEC** - Decay time (0-100, longer = more sustain)
- **DAMP** - High-frequency damping (0-100, higher = darker reverb)
- **DIFF** - Diffusion amount (0-100, controls density)
- **PRED** - Pre-delay time (0-100, early reflections)

> **Mix Control:** The global reverb mix is set to 100%. Control the amount of reverb per voice using the RVB send in the VOICES module.

### DELAY Module (Classic FX Mode)

Global delay effect with tape emulation:

- **TIME** - Delay time (clock-synced or free-running)
- **FDBK** - Feedback amount (0-100, higher = more repeats)
- **SYNC** - Toggle between clock-synced and free-running time
- **WOW** - Tape wow modulation (0-100, slow pitch variation)
- **FLUT** - Tape flutter (0-100, fast pitch variation)
- **SAT** - Tape saturation/distortion (0-100)
- **FILT** - Filter cutoff frequency (0-100, 50 = no filtering)

### CLOUDS Module (Clouds FX Mode)

Mutable Instruments Clouds granular processor with 6 playback modes:

- **MODE** - Playback mode selector:
  - 0: Granular (64-grain engine)
  - 1: WSOLA (time-stretching)
  - 2: Looping Delay
  - 3: Spectral (phase vocoder)
  - 4: Oliverb (reverb, Parasites firmware)
  - 5: Resonestor (resonator, Parasites firmware)

- **POS** - Buffer position (0-100)
- **SIZE** - Grain/window size (0-100)
- **DENS** - Grain density (0-100)
- **TEX** - Grain texture/shape (0-100)
- **PITCH** - Pitch shift (-24 to +24 semitones)
- **SPRD** - Stereo spread (0-100)
- **FB** - Feedback amount (0-100, **default 0 to prevent runaway**)
- **VERB** - Internal reverb amount (0-100)
- **D/W** - Dry/wet mix (0-100)
- **IN** - Input gain (0-200%, 50 = 100%)
- **FREEZE** - Buffer freeze toggle
- **QUAL** - Quality preset (HI/MED/LO/XLO, affects CPU usage)

> **FX Mode Toggle:** Click the FX MODE button to switch between Classic (Reverb/Delay) and Clouds mode. Only one mode is active at a time.

### DRUM BUS Module (Master Output)

Ableton Drum Buss-inspired master bus processing. Signal chain: Input → Drive → Crunch → Transients → Boom → Compressor → Dampen → Dry/Wet → Output

- **TRIM** - Input gain staging (-12dB to +12dB, 50 = 0dB)
- **DRIVE** - Waveshaper saturation with mode selector (SOFT/MED/HARD)
- **CRUNCH** - Mid-high frequency saturation (0-100)
- **TRANS** - Bipolar transient shaper (0-100, 50 = neutral, <50 = less, >50 = more)
- **DAMP** - Lowpass filter (500Hz-30kHz, 100 = 30kHz/bypass)
- **BOOM** - Sub-bass generator triggered by transients:
  - **Amount** - Boom level (0-100)
  - **Freq** - Boom frequency (30-90Hz, 33 ≈ 50Hz)
  - **Decay** - Boom envelope decay (0-100)
- **COMP** - Simple compressor enable/disable
- **D/W** - Dry/wet parallel blend (0-100, 100 = fully wet)
- **OUT** - Output gain (-12dB to +12dB, 75 ≈ +6dB)

---

## Synthesis Engines

Bæng features six synthesis engines, each optimised for different drum sounds. Each voice can use any engine independently.

### DX7 FM Synthesis

Authentic Yamaha DX7 FM synthesis with 32 algorithms and 6 operators. Ideal for metallic percussion, toms, and tuned drums.

**Macro Controls:**
- **PATCH (0-31)** - DX7 patch selection from loaded bank (.syx files)
- **DEPTH (0-100)** - FM modulation depth multiplier
- **RATE (0-100)** - Modulator frequency ratio
- **PITCH (0-100)** - Overall pitch offset

**Features:**
- 32 authentic DX7 algorithms
- Per-voice bank loading (each voice can load different .syx banks)
- Slide/portamento support (enable with GATE = 100% in mono mode)
- Scale quantisation for pitched modulation

**Browser:** Click the PATCH knob to open the DX7 browser. Navigate banks and patches using cursor keys, trigger patches with number keys 1-6.

**Sound Design Tips:**
- Algorithms 4, 5, 6 (parallel carriers) work well for toms and percussion
- Algorithms 12-15 (carrier-modulator pairs) create bell-like tones
- High DEPTH values create aggressive, noisy timbres perfect for snares
- Use PITCH modulation with LFO for pitch-shifting hi-hats

### aKICK (Analog Kick Drum)

808-style analog kick drum synthesis with pitch sweep and tone shaping.

**Macro Controls:**
- **PATCH (0-100)** - Preset variations
- **DEPTH (0-100)** - Tone/brightness control
- **RATE (0-100)** - Decay time
- **PITCH (0-100)** - Pitch sweep amount

**Features:**
- Dual-oscillator design (sine + noise)
- Pitch envelope with variable sweep
- OUT/AUX output modes (808 vs 909 character)
- Low CPU usage

**Sound Design Tips:**
- Short decay + high pitch sweep = tight dance kicks
- Long decay + low tone = deep sub kicks
- Mid decay + high tone = 808 classic sound
- Add bit reduction (30-50) for vintage lo-fi character

### aSNARE (Analog Snare Drum)

808-style analog snare with tone control and snap transient shaping.

**Macro Controls:**
- **PATCH (0-100)** - Preset variations
- **DEPTH (0-100)** - Tone control (body vs rattle balance)
- **RATE (0-100)** - Decay time
- **PITCH (0-100)** - Snap amount (transient sharpness)

**Features:**
- Dual-oscillator design (body + noise)
- Independent snap envelope for transient control
- OUT/AUX output modes
- Adjustable noise colour

**Sound Design Tips:**
- High snap + short decay = crisp electronic snare
- Low snap + long decay = loose acoustic-style snare
- Add drive (40-60) for aggressive character
- Use reverb send (20-40) for room ambience

### aHIHAT (Analog Hi-Hat)

808/909-style analog hi-hat synthesis with metallic character control.

**Macro Controls:**
- **PATCH (0-100)** - Preset variations
- **DEPTH (0-100)** - Metallic character (inharmonicity)
- **RATE (0-100)** - Decay time
- **PITCH (0-100)** - Brightness

**Features:**
- Six-oscillator square wave bank for metallic timbre
- Bandpass filter for tone shaping
- OUT/AUX modes (808 vs 909 metallic)
- Choke group support for open/closed hi-hat articulation

**Sound Design Tips:**
- Short decay + low metal = closed hi-hat
- Long decay + high metal = open hi-hat
- Assign closed and open hats to same choke group (1-4)
- Pan slightly off-centre (40 or 60) for realism

### SAMPLE (Sample Player)

Multi-sample playback engine with decay and filter control. Supports per-voice sample bank loading.

**Macro Controls:**
- **SAMPLE (0-127)** - Sample selection from loaded kit
- **DECAY (0-100)** - Amplitude envelope decay
- **FILTER (0-100)** - Lowpass filter cutoff (50 = no filtering)
- **PITCH (0-100)** - Pitch shift in semitones

**Features:**
- Per-voice kit loading (each voice can load independent sample banks)
- Supports WAV/MP3 formats
- Smooth cut groups (10ms crossfade when retriggered)
- MIDI note mapping (samples can be mapped to specific MIDI notes)

**Browser:** Click the SAMPLE knob to open the kit browser. Select from available sample banks or load custom kits.

**Sound Design Tips:**
- Layer sampled kicks with analog kicks for hybrid sounds
- Use FILTER modulation (LFO) for moving timbres
- PITCH modulation (ENV) creates pitch drops on impacts
- Short DECAY values create tight, controlled hits

### SLICE (Beat Slicer)

Beat slicing engine that divides loops into rhythmic slices. Ideal for breakbeats and glitchy percussion.

**Macro Controls:**
- **SLICE (0-N)** - Slice selection from loaded loop
- **DECAY (10-110)** - Decay as percentage of slice length
- **FILTER (0-100)** - Lowpass filter cutoff
- **PITCH (0-100)** - Pitch shift (affects playback rate and decay)

**Features:**
- Automatic beat detection and slicing
- Decay scales with slice length and playback rate
- Smooth retriggering with cut groups
- Supports tempo-synced and free-running playback

**Editor:** Click the SLICE knob to open the slice editor. Adjust slice markers, preview slices, and configure detection settings.

**Sound Design Tips:**
- Use Euclidean fills to create rhythmic variations from breaks
- PITCH modulation creates tape-stop effects
- Combine multiple SLICE voices with different loop sections
- DECAY < 50 creates tight, gated slices; >100 allows slices to ring out

---

## Step Sequencer

Bæng's step sequencer allows independent pattern programming for each voice with lengths up to 64 steps.

### Programming Patterns

1. **Select a Voice** - Click voice buttons 1-6 or press number keys
2. **Toggle Steps** - Click on the 16-step grid to cycle through states:
   - **Off** (dark grey) - Step is inactive
   - **Gate ON** (yellow) - Step triggers at normal velocity
   - **Accent ON** (yellow + orange left border) - Step triggers at maximum velocity (1.5x boost)
3. **Adjust Sequence Length** - Use the Euclidean STEPS parameter (1-64 steps)

> **Tip:** The 16-step grid always shows the first 16 steps. For longer sequences, the grid scrolls to follow playback.

### Euclidean Pattern Generation

The Euclidean generator creates algorithmic patterns by distributing pulses evenly across steps:

#### Basic Parameters
- **STEPS (1-16)** - Total pattern length
- **FILLS (0-16)** - Number of active pulses to distribute
- **SHIFT (0-15)** - Rotate pattern by N steps

#### Advanced Parameters
- **ACCENT (0-16)** - Number of steps to accent (selected from filled steps)
- **FLAM (0-16)** - Number of steps with grace notes
- **RATCHET (0-16)** - Number of steps with retriggering
- **R-SPD (1-8)** - Ratchet speed multiplier (1=double, 2=triple, etc.)
- **DEV (0-100%)** - Deviation amount (timing variation)

#### Examples

**Classic Four-on-the-Floor Kick:**
- STEPS: 16, FILLS: 4, SHIFT: 0
- Result: Triggers on steps 1, 5, 9, 13

**Afro-Cuban Tresillo:**
- STEPS: 8, FILLS: 3, SHIFT: 0
- Result: Triggers on steps 1, 4, 7 (3+3+2 pattern)

**Euclidean Hi-Hat with Variation:**
- STEPS: 16, FILLS: 11, SHIFT: 2, ACCENT: 4, DEV: 30
- Result: Busy hi-hat pattern with accents and timing variation

### Polyrhythmic Sequencing

Each voice can have a different sequence length, creating evolving polyrhythmic patterns:

**Example Setup:**
- Voice 1 (Kick): STEPS = 4
- Voice 2 (Snare): STEPS = 3
- Voice 3 (Hats): STEPS = 7
- Pattern repeats every 84 steps (LCM of 4, 3, 7)

> **Tip:** Start with simple polyrhythms (3 against 4, 5 against 4) before exploring complex ratios.

---

## Step Parameters

Bæng provides fine-grained control over each step's behaviour through advanced step parameters.

### Gate (0-100%)

Controls note duration for the step. Longer gates create sustained sounds; shorter gates create tight, clipped hits.

- **0-25%** - Very short, staccato
- **25-50%** - Short, tight
- **50-75%** - Medium, punchy
- **75-95%** - Long, sustained
- **100%** - Full step length (enables slide/portamento for DX7 in mono mode)

**Access:** Controlled via the GATE parameter in the VOICES or ENGINE module.

### Accent (0-15)

Boosts velocity and sharpens envelope for the step. Accented steps are 1.5x louder with snappier attack and decay.

- **0** - No accent (normal velocity)
- **1-15** - Accent levels (higher = more emphasis)

**Access:** Click a step twice to toggle accent (step shows orange left border when accented).

### Ratchet (0-7, maps to 1-8 triggers)

Creates rapid retriggering within a single step. Useful for drum rolls, flams, and buzzing effects.

- **0** - No ratcheting (1 trigger)
- **1** - Double-time (2 triggers)
- **2** - Triple-time (3 triggers)
- **3-7** - Quad through 8x retriggering

**Access:** Hold **R** key and drag vertically on a step to adjust ratchet amount.

**Sound Design Tips:**
- Use ratchet=2 on snares for realistic flams
- Ratchet=3-4 on hi-hats creates double-time patterns
- Ratchet=7-8 creates extreme buzzing/rolls

### Probability (0-100%)

Sets the chance that a step will trigger. Adds organic variation and evolving patterns.

- **100%** - Always triggers
- **75%** - Triggers 3 out of 4 times
- **50%** - Random triggering (coin flip)
- **25%** - Occasional ghost notes
- **0%** - Never triggers

**Access:** Hold **/** or **?** key and drag vertically on a step to adjust probability.

**Visual Feedback:** Steps with probability <100% appear semi-transparent (opacity matches probability).

**Sound Design Tips:**
- Use 75-90% on hi-hats for humanisation
- Use 25-50% for ghost notes and subtle variation
- Combine with deviation for maximum organic feel

### Deviation (0-100%)

Adds timing variation by probabilistically triggering adjacent steps instead of the programmed step.

- **0%** - No deviation (strict timing)
- **33%** - Slight early/late variation
- **66%** - Moderate shuffle
- **100%** - Maximum timing looseness

**Access:** Hold **N** key and drag vertically on a step to adjust deviation.

**Modes:**
- **Early (0)** - Can only trigger early
- **Late (1)** - Can only trigger late
- **Both (2)** - Can trigger early or late

**Sound Design Tips:**
- Use 20-40% on hi-hats for shuffle grooves
- Use 50-100% on percussion for loose, human feel
- Combine with swing for advanced groove programming

### Flam

Grace note effect that adds a quiet pre-hit shortly before the main trigger. Creates realistic drum flam articulation.

**Access:** Controlled via Euclidean FLAM parameter (selects N steps to receive flams).

**Timing:** Flam pre-hit occurs ~30ms before main trigger.

---

## Per-Voice Controls

Each voice has independent processing and routing controls located in the VOICES and ENGINE modules.

### Voice Settings

- **LEVEL (0-100)** - Output level for the voice
- **PAN (0-100)** - Stereo positioning (0=left, 50=centre, 100=right)
- **CHOKE (0-4)** - Choke group assignment (0=none, 1-4=group)
- **GATE (0-100%)** - Note duration (100% enables slide for DX7)
- **Mute Toggle** - Solo/mute buttons for each voice (in voice selection area)

### Effect Sends

Control how much of each voice is sent to global effects:

- **RVB (0-100)** - Reverb send amount
- **DLY (0-100)** - Delay send amount
- **CLOUD (0-100)** - Clouds granular processor send (visible in Clouds FX mode)

> **Tip:** Global effect mix parameters are set to 100%. Use per-voice sends to control effect balance.

### Processing

Per-voice processing applied before effect sends:

- **BIT (0-100)** - Bit reduction/degradation
  - 0 = No reduction (full 24-bit)
  - 30-50 = Vintage lo-fi character
  - 70+ = Heavy digital distortion

- **DRIVE (0-100)** - Distortion/saturation
  - 0 = Clean
  - 20-40 = Warmth and harmonic richness
  - 60+ = Aggressive distortion

### Choke Groups

Choke groups provide mutual exclusion between voices, essential for realistic hi-hat articulation:

1. Select first voice (e.g., closed hi-hat)
2. Set CHOKE to group 1-4
3. Select second voice (e.g., open hi-hat)
4. Set CHOKE to same group number
5. When either voice triggers, the other is immediately silenced

**Common Uses:**
- Closed/open hi-hats (choke group 1)
- Muted/open percussion (choke group 2)
- Layered sounds that shouldn't overlap (choke group 3-4)

---

## Per-Parameter Modulation (PPMod)

Bæng's PPMod system allows you to modulate any parameter with six different modulation sources. Each parameter can have independent modulation settings.

> **Detailed Documentation:** See [Per-Parameter Modulation Guide](ppmod-guide.md) for comprehensive information.

### Quick Start

1. **Enable Modulation** - Click any parameter's label (it turns accent colour)
2. **Configure Modal Opens** - Modal shows modulation settings:
   - Mode selector (LFO/RND/ENV/EF/TM/SEQ)
   - Depth (0-100%) - modulation amount
   - Offset (-100 to +100%) - DC bias
   - Mode-specific parameters
3. **Adjust Settings** - Modify depth, rate, waveform, etc.
4. **Close Modal** - Modulation activates automatically

### Modulation Modes

| Mode | Description | Use Cases |
|------|-------------|-----------|
| **LFO** | Low-frequency oscillator | Tremolo, vibrato, parameter sweeps |
| **RND** | LFSR-based random | Stochastic variation, generative patterns |
| **ENV** | Envelope follower | Dynamics-based modulation |
| **EF** | Envelope follower (amplitude) | Ducking, level-dependent effects |
| **TM** | Turing machine (probabilistic sequencer) | Evolving patterns |
| **SEQ** | Step sequencer | Precise parameter automation |

### Per-Voice vs Global Modulation

**Per-Voice Parameters** (voice-specific):
- Voice engine macros (PATCH, DEPTH, RATE, PITCH)
- Level, Pan, FX sends
- Euclidean parameters
- Each voice has independent modulation settings

**Global Effect Parameters** (effect-wide):
- Reverb parameters (DEC, DAMP, DIFF, PRED)
- Delay parameters (TIME, FDBK, WOW, etc.)
- Clouds parameters (POS, SIZE, DENS, etc.)
- Trigger source selection (triggered by specific voices or sum)

### Visual Feedback

- **Active Modulation** - Parameter label shows accent colour
- **Modulation Indicator** - Small dot next to parameter name
- **Value Display** - Shows current modulated value in real-time

### Muting Modulation

To temporarily disable modulation without losing settings:
1. Click the parameter label to open modal
2. Click the mute button (speaker icon)
3. Modulation is paused but configuration is preserved

---

## Effects

Bæng provides two FX modes: Classic (Reverb + Delay) and Clouds (granular processor). Toggle between modes using the FX MODE button.

### Classic FX Mode

#### Reverb

Convolution-based reverb with adjustable decay, damping, diffusion, and pre-delay.

**Parameters:**
- **DEC (0-100)** - Decay time (longer = more sustain)
- **DAMP (0-100)** - High-frequency damping (higher = darker reverb)
- **DIFF (0-100)** - Diffusion/density (higher = smoother tail)
- **PRED (0-100)** - Pre-delay time (early reflections)

**Sound Design Tips:**
- Use short decay (20-40) for room ambience
- Use long decay (70-90) for hall/cathedral spaces
- High damping (70+) creates warm, vintage reverb
- Low damping (0-30) creates bright, metallic reverb
- Pre-delay (30-50) separates dry signal from reverb tail

#### Delay

Tape-style delay with clock sync, feedback, and tape emulation effects.

**Parameters:**
- **TIME (0-100)** - Delay time (synced to BPM or free-running)
- **FDBK (0-100)** - Feedback amount (more repeats)
- **SYNC** - Toggle clock sync (on = synced, off = free time)
- **WOW (0-100)** - Slow pitch modulation (tape wow)
- **FLUT (0-100)** - Fast pitch modulation (tape flutter)
- **SAT (0-100)** - Tape saturation/distortion
- **FILT (0-100)** - Tone control (50 = neutral, <50 = darker, >50 = brighter)

**Clock-Synced Time Values:**
- TIME translates to note divisions (1/16, 1/8, 1/4, dotted, triplet, etc.)
- Automatically adjusts to BPM changes

**Sound Design Tips:**
- Sync to clock for rhythmic delay patterns
- Use free mode for ambient/textural delays
- Combine wow + flutter for realistic tape character
- High feedback (60-85) creates infinite delay builds
- Filter <50 creates darker, vintage delays

### Clouds FX Mode

Full Mutable Instruments Clouds granular processor with 6 playback modes.

> **Detailed Documentation:** See [Clouds FX Guide](../effects/clouds-guide.md) for comprehensive information.

#### Modes

**0: Granular** - 64-grain engine with window morphing
- Classic granular synthesis
- TEXTURE controls grain window shape
- SIZE controls grain length

**1: WSOLA** - Time-stretching without pitch change
- Pitch-independent time manipulation
- SIZE controls window size
- DENSITY controls overlap

**2: Looping Delay** - Buffer-based delay with pitch shifting
- Delay with granular character
- PITCH shifts delayed signal
- SIZE controls loop length

**3: Spectral** - Phase vocoder FFT processing
- Frequency-domain processing
- TEXTURE controls spectral blur
- PITCH shifts spectrum

**4: Oliverb** - Parasites reverb mode
- Shimmer reverb variant
- PITCH adds octave shifts
- REVERB controls decay

**5: Resonestor** - Parasites resonator mode
- Resonant comb filter bank
- PITCH controls resonance frequency
- TEXTURE controls feedback

#### Common Parameters

- **POS (0-100)** - Buffer read position
- **SIZE (0-100)** - Grain/window size
- **DENS (0-100)** - Grain density/overlap
- **TEX (0-100)** - Texture/timbre control
- **PITCH (0-100)** - Pitch shift (-24 to +24 semitones, 50 = 0)
- **SPRD (0-100)** - Stereo spread
- **FB (0-100)** - Feedback amount (**CAUTION: start at 0**)
- **VERB (0-100)** - Internal reverb
- **D/W (0-100)** - Dry/wet mix
- **IN (0-100)** - Input gain (50 = 100%)
- **FREEZE** - Buffer freeze toggle
- **QUAL** - Quality preset (HI/MED/LO/XLO)

**Sound Design Tips:**
- Start with FB=0 to avoid runaway feedback
- Granular mode: High DENS + small SIZE = smooth textures
- WSOLA mode: Extreme time-stretching without artifacts
- Spectral mode: TEX creates spectral smearing/blur
- Use FREEZE to capture and manipulate buffer content
- Lower QUAL settings reduce CPU usage on complex material

**Quality Presets:**
- **HI** - Full resolution, highest CPU
- **MED** - Balanced quality/performance
- **LO** - Lower resolution, reduced CPU
- **XLO** - Minimal processing, lowest CPU

---

## Keyboard Shortcuts

Bæng supports extensive keyboard shortcuts for efficient workflow.

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| **Space** | Play/Stop transport |
| **Cmd+Z** (Mac) / **Ctrl+Z** (Win) | Undo |
| **Cmd+X** (Mac) / **Ctrl+X** (Win) | Redo |
| **Esc** | Close active modal/browser |

### Voice Selection & Triggering

| Shortcut | Action |
|----------|--------|
| **1-6** | Select voice + trigger preview |
| **Click voice button** | Select voice + trigger preview |

### Step Programming

| Shortcut | Action |
|----------|--------|
| **Click step** | Cycle: Off → Gate → Accent → Off |
| **R + drag** | Edit ratchet amount (vertical drag) |
| **/ or ?** + drag | Edit probability (vertical drag) |
| **N + drag** | Edit deviation (vertical drag) |

### Parameter Control

| Shortcut | Action |
|----------|--------|
| **Cmd/Ctrl + drag knob/fader** | Control All (apply to all voices) |
| **Click parameter label** | Open modulation modal |

### Browser Navigation

| Shortcut | Action |
|----------|--------|
| **Arrow keys** | Navigate patches/samples |
| **Enter** | Load selected item |
| **Esc** | Close browser |
| **1-6** | Trigger preview (DX7 browser) |

---

## Sound Design Tips

### Creating Drum Sounds

#### Kick Drums

**Analog Kick (aKICK):**
- Short decay (20-40) + high pitch sweep = tight dance kicks
- Long decay (70-90) + low tone = deep sub kicks
- Mid decay (50) + high tone = 808 classic
- Add bit reduction (30-50) for vintage character

**DX7 FM Kick:**
- Use Algorithm 4-6 (parallel carriers)
- Sine waves only (operators 1-4)
- High feedback on carrier for aggressive punch
- Pitch envelope with fast decay for "thump"
- DEPTH modulation (ENV) for dynamic timbral variation

**Layering:**
- Layer aKICK (sub) + SAMPLE (click) for hybrid kick
- Layer DX7 (body) + analog kick (transient)

#### Snare Drums

**Analog Snare (aSNARE):**
- High snap (70+) + short decay (30) = electronic snare
- Low snap (20-30) + long decay (60) = loose acoustic snare
- Add drive (40-60) for aggressive bite
- Reverb send (20-40) for room ambience

**DX7 FM Snare:**
- Use Algorithm 12-15 (carrier-modulator pairs)
- Mix of sine + square waves for body + rattle
- High DEPTH for noisy character
- RATE modulation (LFO) for pitch wobble

**SAMPLE Snare:**
- Layer multiple samples with different FX sends
- Use FILTER modulation (ENV) for dynamic brightness
- PITCH modulation (ENV) creates tuned/detuned variation

#### Hi-Hats

**Analog Hi-Hat (aHIHAT):**
- Short decay (10-30) + low metal = closed hi-hat
- Long decay (60-80) + high metal = open hi-hat
- Assign closed/open to same choke group
- Pan slightly off-centre (40 or 60)

**DX7 FM Hi-Hat:**
- Use Algorithm 32 (all modulators)
- Square waves on all operators
- High frequency ratios (14:1, 21:1)
- DEPTH modulation (RND) for shimmer

**Sequencing:**
- Closed hats on offbeats (steps 3, 7, 11, 15)
- Open hats on downbeats (steps 1, 5, 9, 13)
- Use probability (75%) for variation
- Add deviation (20-30) for shuffle

#### Toms

**DX7 FM Toms:**
- Algorithm 4-6 with sine waves
- PITCH parameter controls tuning
- Envelope with medium-long decay (40-70)
- Reverb send (30-50) for depth

**Analog Kick as Tom:**
- Use aKICK with medium decay (40-60)
- PITCH controls tuning
- Add saturation for warmth

**Pitched Sequencing:**
- Use PITCH modulation (SEQ) for tom fills
- Create descending tom patterns (high → mid → low)

#### Percussion & Claps

**Analog Snare as Clap:**
- Short decay (20-30)
- Use ratchet=3-4 for realistic clap texture
- Add reverb send (20-40) for room ambience

**SLICE for Percussion:**
- Load breakbeat loops
- Isolate single hits via slice selection
- DECAY <50 for tight, controlled hits
- Use Euclidean fills for rhythmic variation

### Effect Tips

#### Reverb

- **Kicks:** Use sparingly (5-15%), short decay (20-40)
- **Snares/Claps:** Moderate amount (20-40%), medium decay (40-60)
- **Hi-Hats:** Minimal (0-15%), short decay (20-30)
- **Toms:** Generous (30-50%), long decay (60-80)

**Ducking:** Use sidechain ducking to clear reverb when kick hits (prevents muddiness).

#### Delay

- **Synced Delays:** Use TIME synced to 1/8 or 1/16 for rhythmic echoes
- **Feedback:** 40-60% for controlled repeats, 70-85% for infinite builds
- **Filter:** <50 for vintage tape delays, >50 for bright digital delays

**Creative Uses:**
- Delay on hi-hats with low feedback (20-30) for depth
- Delay on claps with high feedback (70+) for crowd effect

#### Clouds Granular

- **Granular Mode:** Great for textural percussion beds
- **WSOLA Mode:** Time-stretch breaks without pitch change
- **Looping Mode:** Rhythmic delays with granular character
- **Spectral Mode:** Smear/blur attack transients

**Sound Design:**
- Freeze buffer on interesting moment, manipulate frozen content
- Use PITCH modulation for shifting granular clouds
- Combine with reverb for massive ambient percussion

### Modulation Tips

#### LFO Modulation

- **PITCH (Sine, 0.5-2Hz):** Vibrato/wobble on toms
- **FILTER (Triangle, 1-4Hz):** Wah effect on percussion
- **PAN (Sine, 0.2-1Hz):** Auto-pan for movement

#### Envelope Modulation

- **PITCH (ENV, fast attack):** Pitch drop on kicks/toms
- **FILTER (ENV, medium attack):** Dynamic brightness
- **DEPTH (ENV, fast attack):** Timbral variation on FM sounds

#### Random Modulation

- **PITCH (RND, 10-30%):** Slight pitch variation per hit
- **SAMPLE (RND, 100%):** Random sample selection
- **DECAY (RND, 20-40%):** Organic length variation

#### Sequencer Modulation

- **PITCH (SEQ):** Melodic tom patterns
- **FILTER (SEQ):** Rhythmic filter sweeps
- **PAN (SEQ):** Panning patterns

---

## Patch Management

Bæng supports two types of patch saving: Global Patches (complete session) and Voice Presets (individual voice settings).

### Global Patches

Save and load complete Bæng sessions including all voices, sequences, effects, and modulation settings.

**To Save:**
1. Click the settings icon (⚙) in the top bar
2. Navigate to "Patches" tab
3. Click "Save Global Patch"
4. Enter patch name
5. Patch downloads as JSON file

**To Load:**
1. Click settings icon (⚙)
2. Navigate to "Patches" tab
3. Click "Load Global Patch"
4. Select saved JSON file
5. All settings are restored

**Global Patch Contents:**
- All 6 voice settings (synthesis parameters)
- All 6 sequence patterns (steps, euclidean settings)
- Timing parameters (BPM, swing, length) - shared with Ræmbl
- Effect settings (reverb, delay, clouds)
- Drum bus settings
- All modulation configurations

### Voice Presets

Save and load individual voice settings without affecting sequences or other voices.

**To Save Voice Preset:**
1. Select the voice you want to save
2. Click the save icon (💾) in the ENGINE module
3. Enter preset name
4. Preset downloads as JSON file

**To Load Voice Preset:**
1. Select the target voice
2. Click the load icon (📂) in the ENGINE module
3. Select saved preset JSON file
4. Voice synthesis settings are loaded

**Voice Preset Contents:**
- Engine type (DX7, aKICK, aSNARE, etc.)
- All macro parameters (PATCH, DEPTH, RATE, PITCH)
- Engine-specific settings
- Processing settings (bit reduction, drive)
- Effect sends (reverb, delay, clouds)
- Level, pan, choke group
- Gate setting
- Modulation configurations (if enabled)

> **Note:** Voice presets do NOT include sequence patterns. Sequences are saved in global patches only.

### DX7 Banks

Load Yamaha DX7 SysEx (.syx) banks for FM synthesis.

**To Load Bank:**
1. Select a voice with DX7 engine
2. Click the PATCH knob to open DX7 browser
3. Click "Load Bank" button
4. Select .syx file (32 or 64 voices)
5. Bank appears in browser

**Per-Voice Banks:**
Each voice can load its own independent DX7 bank. This allows mixing different banks across voices.

**Browser Navigation:**
- Use arrow keys to navigate patches
- Press number keys 1-6 to trigger preview
- Press Enter to load selected patch
- Click patch name to load immediately

### Sample Kits

Load sample kits for the SAMPLE engine.

**To Load Kit:**
1. Select a voice with SAMPLE engine
2. Click the SAMPLE knob to open kit browser
3. Click "Load Kit" button
4. Select folder containing WAV/MP3 files
5. Kit appears in browser

**Per-Voice Kits:**
Each voice can load independent sample kits, allowing hybrid drum kits.

### Slice Loops

Load and edit audio loops for the SLICE engine.

**To Load Loop:**
1. Select a voice with SLICE engine
2. Click the SLICE knob to open slice editor
3. Click "Load Loop" button
4. Select WAV/MP3 file
5. Automatic beat detection creates slices

**Slice Editor:**
- Adjust slice markers manually
- Preview individual slices
- Configure detection sensitivity
- Save slice configuration

### Backup and Organisation

**Recommended Workflow:**
1. Create project folders for each track/session
2. Save global patches frequently during production
3. Export voice presets for reusable sounds (e.g., "Kick - Deep Sub", "Snare - Crispy")
4. Organise DX7 banks by style (e.g., "Percussion Banks", "Tonal Banks")
5. Keep sample kits organised by category (e.g., "Kicks", "Snares", "Percussion")

**Version Control:**
Global patches include version numbers for backward compatibility. Patches saved in newer versions may not load correctly in older versions, but older patches will load in newer versions with fallback to default values for new features.

---

## Troubleshooting

### No Sound

**Check:**
- Master volume (DRUM BUS → OUT) is up
- Voice LEVEL is up
- Voice is not muted (M button not active)
- Browser window has been clicked (Web Audio requires user interaction)
- Audio context is resumed (some browsers auto-suspend)

**If using DX7:**
- Ensure a patch is loaded (PATCH knob shows name)
- Check DX7 bank loaded successfully

**If using SAMPLE/SLICE:**
- Ensure kit/loop is loaded
- Check sample index is valid

### Steps Not Triggering

**Check:**
- Step is ON (yellow, not grey)
- Probability is not too low (<25%)
- Sequence length (STEPS parameter) includes the step
- Voice is not in a choke group being triggered by another voice
- Transport is playing (press Space)

### Choppy/Glitchy Audio

**Solutions:**
- Close other browser tabs/applications
- Reduce Clouds quality (HI → MED → LO → XLO)
- Disable unused modulation sources
- Reduce number of active voices
- Increase browser audio buffer size (browser settings)

### Modulation Not Working

**Check:**
- Modulation is enabled (parameter label is accent colour)
- Modulation is not muted (speaker icon in modal)
- Depth is not zero
- LFO rate is not too slow (try increasing rate)
- For ENV/EF modes, ensure source signal exists

### Patches Not Loading

**Check:**
- JSON file is valid (not corrupted)
- Patch version is compatible (older patches load, newer may not)
- Required assets are available (DX7 banks, sample kits, slice loops)
- Browser has file access permissions

### Browser/Modal Not Opening

**Solutions:**
- Ensure asset is loaded (DX7 bank, sample kit, slice loop)
- Check browser console for errors (F12 → Console tab)
- Try reloading page (Cmd+R / Ctrl+R)

---

## Appendix: Parameter Reference

### Per-Voice Parameters (Modulatable)

All parameters marked **(M)** are modulatable via PPMod.

#### Voice Processing
- **LEVEL (0-100)** **(M)** - Voice output level
- **PAN (0-100)** **(M)** - Stereo positioning
- **GATE (0-100%)** **(M)** - Note duration
- **BIT (0-100)** **(M)** - Bit reduction amount
- **DRIVE (0-100)** **(M)** - Distortion/saturation

#### Effect Sends
- **RVB (0-100)** **(M)** - Reverb send
- **DLY (0-100)** **(M)** - Delay send
- **CLOUD (0-100)** **(M)** - Clouds send

#### DX7 Engine
- **PATCH (0-31)** **(M)** - Patch selection
- **DEPTH (0-100)** **(M)** - FM depth
- **RATE (0-100)** **(M)** - Modulator ratio
- **PITCH (0-100)** **(M)** - Pitch offset

#### Analog Engines (aKICK, aSNARE, aHIHAT)
- **PATCH (0-100)** **(M)** - Preset variation
- **DEPTH (0-100)** **(M)** - Tone/character
- **RATE (0-100)** **(M)** - Decay time
- **PITCH (0-100)** **(M)** - Engine-specific (sweep, snap, brightness)

#### Sample/Slice Engines
- **SAMPLE/SLICE (0-N)** **(M)** - Sample/slice selection
- **DECAY (0-100)** **(M)** - Amplitude decay
- **FILTER (0-100)** **(M)** - Lowpass filter cutoff
- **PITCH (0-100)** **(M)** - Pitch shift

#### Euclidean Parameters
- **STEPS (1-16)** **(M)** - Pattern length
- **FILLS (0-16)** **(M)** - Active pulses
- **SHIFT (0-15)** **(M)** - Pattern rotation
- **ACCENT (0-16)** **(M)** - Accent amount
- **FLAM (0-16)** **(M)** - Flam amount
- **RATCHET (0-16)** **(M)** - Ratchet amount
- **R-SPD (1-8)** **(M)** - Ratchet speed
- **DEV (0-100%)** **(M)** - Deviation amount

### Global Effect Parameters (Modulatable with Trigger Source)

All global effect parameters support trigger source selection (none, T1-T6, or sum).

#### Reverb
- **DEC (0-100)** **(M)** - Decay time
- **DAMP (0-100)** **(M)** - High-frequency damping
- **DIFF (0-100)** **(M)** - Diffusion amount
- **PRED (0-100)** **(M)** - Pre-delay time

#### Delay
- **TIME (0-100)** **(M)** - Delay time (synced or free)
- **FDBK (0-100)** **(M)** - Feedback amount
- **WOW (0-100)** **(M)** - Tape wow
- **FLUT (0-100)** **(M)** - Tape flutter
- **SAT (0-100)** **(M)** - Saturation
- **FILT (0-100)** **(M)** - Tone control

#### Clouds
- **POS (0-100)** **(M)** - Buffer position
- **SIZE (0-100)** **(M)** - Grain/window size
- **DENS (0-100)** **(M)** - Grain density
- **TEX (0-100)** **(M)** - Texture/timbre
- **PITCH (0-100)** **(M)** - Pitch shift (-24 to +24 semitones)
- **SPRD (0-100)** **(M)** - Stereo spread
- **FB (0-100)** **(M)** - Feedback amount
- **VERB (0-100)** **(M)** - Internal reverb
- **D/W (0-100)** **(M)** - Dry/wet mix
- **IN (0-100)** **(M)** - Input gain

### Drum Bus Parameters (Not Modulatable)

- **TRIM (0-100)** - Input gain (-12dB to +12dB)
- **DRIVE (0-100)** - Saturation amount
- **CRUNCH (0-100)** - Mid-high saturation
- **TRANS (0-100)** - Transient shaper (50 = neutral)
- **DAMP (0-100)** - Lowpass filter frequency
- **BOOM (0-100)** - Sub-bass amount
- **FREQ (0-100)** - Boom frequency
- **DECAY (0-100)** - Boom decay
- **COMP** - Compressor enable/disable
- **D/W (0-100)** - Dry/wet mix
- **OUT (0-100)** - Output gain (-12dB to +12dB)

---

## Credits

**Bæng** is part of the Bæng & Ræmbl merged synthesiser suite.

Developed by naenae.

Inspired by the KORG Volca Drum, Elektron sequencing workflow, and Mutable Instruments Eurorack modules.

Built with the Web Audio API and modern web technologies.

---

**For more information:**
- [Ræmbl Synthesiser Guide](raembl-guide.md)
- [Per-Parameter Modulation Guide](ppmod-guide.md)
- [Effects Reference](../effects/effects-guide.md)
- [GitHub Repository](https://github.com/MidiSlave/baeng-and-raembl)
- [Live Application](https://midislave.github.io/baeng-and-raembl/)
