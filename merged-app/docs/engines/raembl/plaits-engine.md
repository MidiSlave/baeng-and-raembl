# Plaits Macro Oscillator Engine

**24 synthesis engines across 3 banks - the ultimate multi-engine synthesiser**

Plaits is a comprehensive synthesis platform offering 24 distinct synthesis engines organised into three banks. Originally created as a Eurorack module by Mutable Instruments, this is a complete JavaScript port to Web Audio API, integrated into Ræmbl as an alternative engine alongside the classic subtractive synthesiser and Rings physical modelling.

## Overview

Plaits embodies the "macro oscillator" concept - a single interface controlling vastly different synthesis algorithms. Rather than tweaking dozens of low-level parameters, you manipulate a small set of high-level "macro" controls (HARMONICS, TIMBRE, MORPH) that have musically meaningful effects tailored to each engine.

**Key Features:**
- 24 synthesis engines (pitched, physical modelling, FM, noise, granular, wavetable, and more)
- 3 banks: GREEN (pitched/harmonic), RED (noise/physical), ORANGE (classic/FM)
- 6 macro controls per engine (HARMONICS, TIMBRE, MORPH, LPG DECAY, LPG COLOUR, OUT/AUX)
- 8-voice polyphony with intelligent voice stealing
- Dual outputs (OUT + AUX) with per-engine routing
- Low-pass gate (LPG) with decay envelope
- Per-parameter modulation via PPMod system
- Accent, slide, and trill support

## The 3 Banks

Engines are organised into three colour-coded banks representing different synthesis families.

### GREEN Bank (0-7): Pitched/Harmonic

Tonal engines optimised for melodic content, harmonic synthesis, and pitched textures.

| # | Engine Name | Best For |
|---|-------------|----------|
| 0 | Virtual Analogue | Classic subtractive waveforms |
| 1 | Waveshaping | Distortion-based timbral morphing |
| 2 | FM | Two-operator frequency modulation |
| 3 | Grain | Granular formant synthesis |
| 4 | Additive | Harmonic series synthesis |
| 5 | Wavetable | Digital waveform morphing |
| 6 | Chord | Polyphonic chord engine |
| 7 | Speech | Vowel/formant synthesis |

### RED Bank (8-15): Noise/Physical Modelling

Percussive, noisy, and physically modelled engines for drums, impacts, and textural sounds.

| # | Engine Name | Best For |
|---|-------------|----------|
| 8 | Swarm | Particle/granular clouds |
| 9 | Noise | Filtered noise generator |
| 10 | Particle | Physical particle simulation |
| 11 | String | Karplus-Strong plucked string |
| 12 | Modal | Resonant body modelling |
| 13 | Bass Drum | Physical kick drum model |
| 14 | Snare Drum | Noise + resonance drum |
| 15 | Hi-Hat | Metallic cymbal synthesis |

### ORANGE Bank (16-23): Classic/FM

Vintage digital synthesis, multi-operator FM, and classic synthesis techniques.

| # | Engine Name | Best For |
|---|-------------|----------|
| 16 | VA-VCF | Analogue filter emulation |
| 17 | Phase Distortion | Casio CZ-style synthesis |
| 18 | Six-Op FM 1 | Multi-operator FM (Algorithm 1) |
| 19 | Six-Op FM 2 | Multi-operator FM (Algorithm 2) |
| 20 | Six-Op FM 3 | Multi-operator FM (Algorithm 3) |
| 21 | Wave Terrain | Wavetable terrain mapping |
| 22 | String Machine | Mellotron/ensemble strings |
| 23 | Chiptune | 8-bit retro synthesis |

## The 24 Synthesis Engines

Complete descriptions of each engine's synthesis method, macro control behaviour, and sound design applications.

### GREEN Bank: Pitched/Harmonic Engines

#### 0. Virtual Analogue

**Classic subtractive synthesis waveforms**

Generates traditional analogue-style waveforms (sawtooth, square, triangle) with continuously variable waveshaping. Emulates the core oscillator section of vintage analogue synthesisers.

**Macro Controls:**
- **HARMONICS:** Waveform selection (saw → square → triangle)
- **TIMBRE:** Pulse width / waveshaper amount
- **MORPH:** Waveform sub-oscillator blend
- **AUX Output:** Sub-oscillator only

**Sound Design:**
- Set HARMONICS low (0-30%) for bright sawtooth leads
- Set HARMONICS mid (40-60%) for square bass tones
- Set HARMONICS high (70-100%) for triangle pads
- Modulate TIMBRE for PWM-style movement

**Status:** Experimental (some aliasing at high frequencies)

#### 1. Waveshaping

**Timbral morphing via distortion and waveshaping**

Applies increasingly aggressive waveshaping distortion to transform a sine wave into complex harmonic spectra. Creates everything from subtle warmth to harsh, metallic timbres.

**Macro Controls:**
- **HARMONICS:** Harmonic content (sine → complex)
- **TIMBRE:** Waveshaper curve selection
- **MORPH:** Asymmetry amount (even/odd harmonic balance)
- **AUX Output:** Pre-waveshaper sine

**Sound Design:**
- Low HARMONICS (0-20%) for warm, tube-like saturation
- High HARMONICS (80-100%) for aggressive, metallic tones
- Sweep TIMBRE for evolving timbral motion
- Use MORPH for odd harmonic emphasis (clarinet-like)

**Status:** Experimental

#### 2. FM

**Two-operator frequency modulation synthesis**

Classic two-operator FM with continuously variable modulation index and ratio. The foundation of digital synthesis from the DX7 era, capable of bell tones, metallic percussion, and evolving pads.

**Macro Controls:**
- **HARMONICS:** Modulation index (brightness)
- **TIMBRE:** Frequency ratio (harmonic relationship)
- **MORPH:** Feedback amount
- **AUX Output:** Modulator only (raw FM carrier)

**Sound Design:**
- TIMBRE at integer ratios (25%, 50%, 75%) for harmonic tones
- TIMBRE at non-integer ratios for inharmonic bells
- Low HARMONICS (0-30%) for pure tones, high (70-100%) for complex spectra
- Modulate HARMONICS for filter-like sweeps
- Add MORPH for chaotic, unstable timbres

**Status:** Ready

#### 3. Grain

**Granular formant synthesis**

Generates pitch by triggering overlapping grains of windowed noise, filtered through formant filters. Creates vocal-like textures, breathy pads, and evolving clouds of pitched grains.

**Macro Controls:**
- **HARMONICS:** Formant frequency
- **TIMBRE:** Formant width/resonance
- **MORPH:** Grain density
- **AUX Output:** Raw grain cloud (no formant filtering)

**Sound Design:**
- Sweep HARMONICS for vowel-like motion (a → e → i → o → u)
- Low TIMBRE (0-30%) for narrow, whistle-like formants
- High TIMBRE (70-100%) for breathy, airy textures
- High MORPH (80-100%) for dense clouds
- Works well with reverb for ambient pads

**Status:** Ready

#### 4. Additive

**Harmonic series synthesis with individual partial control**

Synthesises sound by summing individual sine wave harmonics. The fundamental building block of Fourier synthesis, offering precise control over harmonic content.

**Macro Controls:**
- **HARMONICS:** Number of harmonics (1-16)
- **TIMBRE:** Harmonic amplitude slope (bright ↔ dark)
- **MORPH:** Even/odd harmonic balance
- **AUX Output:** Fundamental only

**Sound Design:**
- Low HARMONICS (0-20%) for pure sine/organ tones
- High HARMONICS (80-100%) for sawtooth-like brightness
- TIMBRE low (0-30%) for bright, harmonic-rich tones
- TIMBRE high (70-100%) for dark, muted tones
- MORPH at 0% for saw-like (all harmonics), 100% for square-like (odd only)

**Status:** Ready

#### 5. Wavetable

**Digital waveform morphing and interpolation**

Crossfades between stored waveforms in a wavetable, providing smooth timbral motion. Offers both classic digital synthesis waveforms and more complex spectral shapes.

**Macro Controls:**
- **HARMONICS:** Wavetable position (waveform selection)
- **TIMBRE:** Waveform interpolation (smooth ↔ stepped)
- **MORPH:** Phase distortion amount
- **AUX Output:** Sub-oscillator

**Sound Design:**
- Sweep HARMONICS for smooth wavetable scans
- Low TIMBRE (0-30%) for aliased, lo-fi stepping through tables
- High TIMBRE (70-100%) for smooth interpolation
- Add MORPH for aggressive phase distortion (Casio CZ-style)

**Status:** Experimental

#### 6. Chord

**Polyphonic chord generator**

Generates up to 6-note chords from a single input note. Chord voicing is determined by the macro controls, offering everything from simple triads to complex jazz voicings.

**Macro Controls:**
- **HARMONICS:** Chord type selection (major, minor, 7th, 9th, etc.)
- **TIMBRE:** Chord inversion/voicing
- **MORPH:** Chord spread (tight ↔ wide voicing)
- **AUX Output:** Root note only

**Sound Design:**
- Sweep HARMONICS to morph between chord types
- Low TIMBRE (0-30%) for root position chords
- High TIMBRE (70-100%) for inverted voicings
- High MORPH (80-100%) for wide, pad-like voicings
- Instant "one-finger" chord progressions

**Status:** Ready

#### 7. Speech

**Vowel and formant synthesis**

Models the human vocal tract using formant filters. Creates vowel sounds, choir-like textures, and vocal synthesis without requiring samples.

**Macro Controls:**
- **HARMONICS:** Vowel selection (a → e → i → o → u)
- **TIMBRE:** Formant shift (male ↔ female voice)
- **MORPH:** Excitation type (voiced ↔ unvoiced/breathy)
- **AUX Output:** Raw excitation signal

**Sound Design:**
- Sweep HARMONICS for talking/singing effects
- Low TIMBRE (0-30%) for deep male voice
- High TIMBRE (70-100%) for high female voice
- Low MORPH (0-30%) for pitched vocal tones
- High MORPH (70-100%) for breathy, whispered sounds

**Status:** Ready

### RED Bank: Noise/Physical Modelling Engines

#### 8. Swarm

**Particle/granular cloud synthesis**

Generates clouds of overlapping grains with randomised parameters. Creates buzzing, swarming textures reminiscent of insects, digital glitches, or evolving drones.

**Macro Controls:**
- **HARMONICS:** Swarm density (number of grains)
- **TIMBRE:** Grain pitch randomisation
- **MORPH:** Grain duration
- **AUX Output:** Single grain (no swarm)

**Sound Design:**
- Low HARMONICS (0-30%) for sparse, individual grains
- High HARMONICS (80-100%) for dense swarm
- High TIMBRE (70-100%) for chaotic pitch clouds
- Short MORPH (0-30%) for buzzing/granular
- Long MORPH (70-100%) for smooth overlaps

**Status:** Ready

#### 9. Noise

**Filtered noise generator**

Generates white noise filtered through resonant bandpass/lowpass filters. The foundation for wind, breath, percussion, and textural sounds.

**Macro Controls:**
- **HARMONICS:** Filter frequency
- **TIMBRE:** Filter resonance
- **MORPH:** Filter type (LP ↔ BP ↔ HP)
- **AUX Output:** Unfiltered white noise

**Sound Design:**
- Sweep HARMONICS for filter sweeps
- Low TIMBRE (0-30%) for gentle filtering
- High TIMBRE (70-100%) for self-oscillating resonance
- MORPH at 0% for lowpass (sub bass rumble)
- MORPH at 50% for bandpass (snare buzz)
- MORPH at 100% for highpass (hi-hat)

**Status:** Ready

#### 10. Particle

**Physical particle collision simulation**

Simulates bouncing particles in a resonant space. Creates metallic impacts, membrane resonances, and evolving pitched noise textures.

**Macro Controls:**
- **HARMONICS:** Particle count
- **TIMBRE:** Resonance frequency
- **MORPH:** Decay time
- **AUX Output:** Raw particle excitation

**Sound Design:**
- Low HARMONICS (0-30%) for single particle (simple tone)
- High HARMONICS (80-100%) for multi-particle chaos
- Sweep TIMBRE for pitched metallic impacts
- Long MORPH (70-100%) for gong-like sustain

**Status:** Ready

#### 11. String

**Karplus-Strong plucked string model**

Physical modelling of plucked strings using waveguide synthesis. The classic algorithm for guitar, bass, and harp-like tones with realistic decay and inharmonicity.

**Macro Controls:**
- **HARMONICS:** Inharmonicity (perfect ↔ detuned partials)
- **TIMBRE:** Pluck position (bridge ↔ centre)
- **MORPH:** Decay time
- **AUX Output:** Excitation burst only

**Sound Design:**
- Low HARMONICS (0-20%) for pure, bell-like tones
- High HARMONICS (80-100%) for sitar/banjo-like inharmonicity
- Low TIMBRE (0-30%) for bright, bridge-plucked tone
- High TIMBRE (70-100%) for muted, centre-plucked tone
- Short MORPH (0-30%) for staccato plucks
- Long MORPH (70-100%) for sustained resonance

**Status:** Ready

#### 12. Modal

**Resonant body modelling via modal synthesis**

Models vibrating objects (bells, bars, plates) by summing resonant modes. Creates metallic percussion, struck idiophones, and complex inharmonic tones.

**Macro Controls:**
- **HARMONICS:** Material type (wood → glass → metal)
- **TIMBRE:** Mode frequency ratios
- **MORPH:** Decay time
- **AUX Output:** Impact excitation only

**Sound Design:**
- Low HARMONICS (0-30%) for wooden, marimba-like tones
- High HARMONICS (80-100%) for bright, metallic bells
- Sweep TIMBRE for evolving resonances
- Short MORPH (0-30%) for damped, dead tones
- Long MORPH (70-100%) for ringing, sustained bells

**Status:** Partial (some modal ratios missing)

#### 13. Bass Drum

**Physical modelling of kick drum**

Models a bass drum using resonant lowpass filter + pitch envelope + noise burst. Creates 808-style kicks, acoustic bass drums, and sub-bass impacts.

**Macro Controls:**
- **HARMONICS:** Pitch (sub-bass ↔ high tom)
- **TIMBRE:** Tone (bright ↔ dark)
- **MORPH:** Decay time
- **AUX Output:** Click/impact only

**Sound Design:**
- Low HARMONICS (0-20%) for sub-bass 808 kicks
- High HARMONICS (60-80%) for tom/floor tom sounds
- Low TIMBRE (0-30%) for dark, subby kicks
- High TIMBRE (70-100%) for bright, snappy kicks
- Short MORPH (0-30%) for tight, punchy kicks
- Long MORPH (70-100%) for boomy, sustained kicks

**Status:** Partial (pitch envelope needs tuning)

#### 14. Snare Drum

**Physical snare drum model with noise + resonance**

Models a snare drum using pitched resonator + filtered noise burst. Adjustable snare tension, body resonance, and noise character.

**Macro Controls:**
- **HARMONICS:** Snare tension (pitch)
- **TIMBRE:** Snare buzz amount
- **MORPH:** Decay time
- **AUX Output:** Body resonance only (no snare)

**Sound Design:**
- Low HARMONICS (0-30%) for low-tuned, reggae-style snares
- High HARMONICS (70-100%) for tight, piccolo snares
- Low TIMBRE (0-30%) for minimal snare buzz (tom-like)
- High TIMBRE (70-100%) for aggressive snare rattle
- Short MORPH (0-30%) for tight, gated snares
- Long MORPH (70-100%) for live, ringing snares

**Status:** Ready

#### 15. Hi-Hat

**Metallic cymbal synthesis**

Models hi-hats using tuned square waves + bandpass noise. Creates closed hats, open hats, and ride cymbal tones with adjustable brightness and decay.

**Macro Controls:**
- **HARMONICS:** Tone (dark ↔ bright)
- **TIMBRE:** Metallic character
- **MORPH:** Decay time (closed ↔ open)
- **AUX Output:** Square wave component only

**Sound Design:**
- Low HARMONICS (0-30%) for dark, muted hats
- High HARMONICS (80-100%) for bright, sizzling hats
- Low TIMBRE (0-30%) for pure, clean hats
- High TIMBRE (70-100%) for trashy, distorted cymbals
- Short MORPH (0-20%) for closed hats
- Long MORPH (70-100%) for open hats/rides

**Status:** Ready

### ORANGE Bank: Classic/FM Engines

#### 16. VA-VCF

**Virtual analogue with filter emphasis**

Emulates classic analogue synth oscillator + filter combinations. Focus on resonant filter sweeps and classic subtractive tones.

**Macro Controls:**
- **HARMONICS:** Oscillator waveform
- **TIMBRE:** Filter cutoff
- **MORPH:** Filter resonance
- **AUX Output:** Pre-filter oscillator

**Sound Design:**
- Sweep TIMBRE for filter sweeps (classic acid bass)
- High MORPH (70-100%) for self-oscillating filter screams
- Low HARMONICS (0-30%) for saw bass
- High HARMONICS (70-100%) for triangle/sine pads

**Status:** Experimental

#### 17. Phase Distortion

**Casio CZ-style phase distortion synthesis**

Implements Casio's phase distortion technique - warping the phase of a sine wave to create harmonics. Distinct from FM, offering metallic, glassy tones.

**Macro Controls:**
- **HARMONICS:** Distortion amount
- **TIMBRE:** Resonance frequency
- **MORPH:** Distortion type/curve
- **AUX Output:** Undistorted sine

**Sound Design:**
- Low HARMONICS (0-20%) for pure sine
- High HARMONICS (80-100%) for aggressive harmonics
- Sweep TIMBRE for formant-like sweeps
- Modulate MORPH for evolving timbral motion

**Status:** Ready

#### 18-20. Six-Op FM 1/2/3

**Multi-operator FM synthesis (3 algorithms)**

Full six-operator FM synthesis with three different algorithms. The power of the DX7 and beyond, capable of complex, evolving timbres.

**Macro Controls (All Algorithms):**
- **HARMONICS:** Overall modulation index
- **TIMBRE:** Operator ratio selection
- **MORPH:** Algorithm-specific routing/feedback
- **AUX Output:** Carrier only (no modulation)

**Algorithm Differences:**
- **FM 1:** Stacked operators (bright, aggressive)
- **FM 2:** Parallel carriers (warm, bell-like)
- **FM 3:** Hybrid stack/parallel (versatile)

**Sound Design:**
- Low HARMONICS (0-20%) for pure, simple FM tones
- High HARMONICS (80-100%) for complex, evolving spectra
- Sweep TIMBRE for harmonic/inharmonic transitions
- Add MORPH for feedback chaos

**Status:** Partial (operator ratios need expansion)

#### 21. Wave Terrain

**Wavetable terrain mapping and scanning**

Reads wavetables using 2D X/Y scanning. Creates evolving, metallic, and unpredictable timbres by navigating wavetable "terrain."

**Macro Controls:**
- **HARMONICS:** X-axis scan position
- **TIMBRE:** Y-axis scan position
- **MORPH:** Scan speed/trajectory
- **AUX Output:** 1D wavetable scan (X-axis only)

**Sound Design:**
- Sweep HARMONICS/TIMBRE together for diagonal scans
- High MORPH (80-100%) for fast, LFO-modulated scanning
- Creates unique, unpredictable timbres
- Excellent for evolving pads and textures

**Status:** Ready

#### 22. String Machine

**Mellotron/ensemble string emulation**

Emulates vintage string machines (Solina, Mellotron) using multiple detuned sawtooth oscillators with ensemble chorus.

**Macro Controls:**
- **HARMONICS:** Registration (8', 16', mix)
- **TIMBRE:** Ensemble chorus depth
- **MORPH:** Detune amount
- **AUX Output:** Single oscillator (no ensemble)

**Sound Design:**
- Low HARMONICS (0-30%) for pure 8' strings
- High HARMONICS (70-100%) for thick, 16' blend
- High TIMBRE (70-100%) for lush ensemble chorus
- High MORPH (70-100%) for wide, detuned pad

**Status:** Ready

#### 23. Chiptune

**8-bit retro synthesis (NES/C64 style)**

Emulates classic 8-bit game console sound chips. Square waves, triangle waves, and noise channels with characteristic lo-fi aliasing.

**Macro Controls:**
- **HARMONICS:** Pulse width (for square wave channel)
- **TIMBRE:** Channel mix (square ↔ triangle ↔ noise)
- **MORPH:** Bit reduction / aliasing amount
- **AUX Output:** Square wave only

**Sound Design:**
- Low HARMONICS (0-30%) / High (70-100%) for PWM effect
- TIMBRE at 0% for pure square (lead)
- TIMBRE at 50% for triangle (bass)
- TIMBRE at 100% for noise (drums)
- High MORPH (80-100%) for aggressive lo-fi crunch

**Status:** Ready

## The Macro Control System

Unlike traditional synthesisers with dozens of parameters, Plaits uses six "macro" controls that have musically meaningful, engine-specific behaviours.

### Primary Timbral Controls

#### HARMONICS

**Primary timbral control - the most important parameter**

HARMONICS is the first control you should reach for when exploring a new engine. It typically controls:
- Harmonic content / brightness (additive engines)
- Waveform selection (VA engines)
- Modulation index (FM engines)
- Formant frequency (speech/grain engines)
- Pitch/resonance (physical modelling engines)

**Range:** 0-100%
**State Key:** `plaitsHarmonics`
**Modulatable:** Yes

**Sound Design Tip:** Sweep HARMONICS first to understand an engine's timbral range before adjusting other parameters.

#### TIMBRE

**Secondary timbral control - refines the sound**

TIMBRE provides secondary timbral shaping. Common behaviours:
- Frequency ratio (FM engines)
- Filter cutoff (VA-VCF)
- Pulse width / waveshaper curve (waveshaping)
- Formant width (grain/speech)
- Resonance / tone (physical modelling)

**Range:** 0-100%
**State Key:** `plaitsTimbre`
**Modulatable:** Yes

**Sound Design Tip:** Use TIMBRE to fine-tune brightness, resonance, or harmonic character after setting HARMONICS.

#### MORPH

**Tertiary control - crossfades and special functions**

MORPH typically handles:
- Crossfades between sub-engines or waveforms
- Feedback amount (FM/distortion engines)
- Decay time (percussion engines)
- Even/odd harmonic balance (additive)
- Chord spread / voicing (chord engine)

**Range:** 0-100%
**State Key:** `plaitsMorph`
**Modulatable:** Yes

**Sound Design Tip:** MORPH often controls subtle variations - experiment with extreme values (0% and 100%) to hear the full range.

### Envelope and Output Controls

#### LPG DECAY

**Low-pass gate decay time**

Controls the decay time of the built-in low-pass gate (LPG). The LPG is a combined VCA + VCF that closes over time, creating a natural, organic amplitude and brightness decay.

**Range:** 0-100% (maps to ~10ms - 2s decay)
**State Key:** `plaitsLpgDecay`
**Modulatable:** Yes

**Sound Design:**
- Short decay (0-30%) for percussive, plucky sounds
- Medium decay (40-60%) for rhythmic, gated sounds
- Long decay (70-100%) for sustained pads and drones
- With accent enabled, decay is shortened for snappier attacks

**LPG vs ADSR:** Unlike the subtractive engine's separate amp + filter envelopes, the LPG is a single decay-only envelope affecting both amplitude and tone.

#### LPG COLOUR

**VCA ↔ VCF blend**

Adjusts the character of the low-pass gate from pure amplitude control (VCA) to combined amplitude + filter (VCF).

**Range:** 0-100% (0% = pure VCA, 100% = VCA+VCF)
**State Key:** `plaitsLpgColour`
**Modulatable:** Yes

**Sound Design:**
- Low colour (0-30%): Pure amplitude decay (brightness stays constant)
- High colour (70-100%): Brightness decays with amplitude (organic, natural)
- Use low colour for percussive sounds where brightness should remain constant
- Use high colour for emulating acoustic instruments (plucks, mallets)

#### OUT/AUX MIX

**Main output vs auxiliary output crossfade**

Most Plaits engines generate two outputs:
- **OUT:** The main engine output (fully processed)
- **AUX:** An auxiliary output (often a sub-component, raw signal, or alternate processing)

This control blends between them.

**Range:** 0-100% (0% = OUT only, 100% = AUX only)
**State Key:** `plaitsMixOutAux`
**Modulatable:** Yes

**Examples:**
- **FM engine:** OUT = FM sound, AUX = modulator only
- **Additive:** OUT = full harmonic series, AUX = fundamental only
- **Chord:** OUT = full chord, AUX = root note only
- **Physical models:** OUT = full resonance, AUX = excitation burst only

**Sound Design Tip:** Blend AUX output for layering possibilities - e.g., chord root + full chord for reinforced bass.

## Voice Allocation and Polyphony

Plaits uses an 8-voice architecture with intelligent voice stealing. Unlike the subtractive engine (which shares a single 8-voice worklet), Plaits pre-allocates 8 separate AudioWorkletNodes - one per voice.

### Three-Tier Voice Allocation

When a new note is triggered, the system searches for an available voice in this order:

**Tier 1: Free Voices**
- Voices that are not active and not releasing
- Preferred allocation target (zero glitching)

**Tier 2: Releasing Voices**
- Voices in release phase (still producing audio)
- Oldest releasing voice is chosen first (minimises audible cutoff)

**Tier 3: Voice Stealing**
- Active voices (still playing)
- Oldest active voice is stolen
- Quick 25ms fade applied to prevent clicks

**Why This Matters:**
- Ensures smooth polyphony up to 8 voices
- Minimises audible glitches when exceeding voice count
- Prioritises musical playability over strict voice limits

### Release Tracking

Voices remain in "releasing" state after note-off until their LPG decay envelope completes. This prevents:
- Premature release cutoff (sustain/decay phases ring out fully)
- Glitchy voice stealing (releasing voices are lower priority than free voices)

**Release Time Calculation:**
```javascript
releaseTimeSec = (plaitsLpgDecay / 100) * 2.0 + 0.1; // 0-2s + 100ms buffer
```

### Per-Voice Engine Tracking

Each voice in the pool tracks which Plaits engine it's currently using:
```javascript
voice.engineType = 'plaits';
voice.engine = 0-23; // Current Plaits engine index
```

This enables:
- Per-voice PPMod routing (compound keys: `voiceIndex:plaits.harmonics`)
- Engine switching without note cutoff (all voices switch together)
- Diagnostic info (which voices are playing which engines)

## PPMod Integration

Plaits parameters are fully integrated with Ræmbl's per-parameter modulation (PPMod) system, allowing LFO, envelope, random, and sequencer modulation.

### Modulatable Parameters

| Parameter | Param ID | Range | Use Cases |
|-----------|----------|-------|-----------|
| **HARMONICS** | `plaits.harmonics` | 0-100% | Filter sweeps, timbral evolution, vowel morphing |
| **TIMBRE** | `plaits.timbre` | 0-100% | FM ratio sweeps, resonance wobbles, formant motion |
| **MORPH** | `plaits.morph` | 0-100% | Crossfade automation, decay wobbles, feedback sweeps |
| **LPG DECAY** | `plaits.lpgDecay` | 0-100% | Rhythmic gating, decay randomisation |
| **LPG COLOUR** | `plaits.lpgColour` | 0-100% | Brightness envelope modulation |
| **OUT/AUX** | `plaits.mixOutAux` | 0-100% | Output routing modulation, layer crossfades |

### Poly Mode PPMod

In poly mode, PPMod modulations are applied per-voice using compound keys:
```javascript
// Voice 0 modulating HARMONICS
const key = `0:plaits.harmonics`;

// Voice 3 modulating TIMBRE
const key = `3:plaits.timbre`;
```

**Why Per-Voice Matters:**
- Each voice can have independent LFO phase offsets (prevents unison)
- Envelope followers track per-voice dynamics
- Random modulation creates natural variation between notes

### Mono Mode PPMod

In mono mode, a single global modulation key is used:
```javascript
const key = `plaits.harmonics`; // No voice index prefix
```

All voices share the same modulation values, creating unified timbral motion.

### K-Rate Modulation

Plaits PPMod runs at k-rate (30 FPS, ~33ms updates) on the main thread, NOT audio-rate in the worklet.

**Implementation:**
```javascript
// Modulation calculated at 30 FPS
requestAnimationFrame(() => {
  const modValue = calculateModulation(mod, now);
  audioParam.setTargetAtTime(modValue, now, 0.015); // Smooth 15ms slew
});
```

**Why K-Rate:**
- Human perception of modulation changes is ~50ms (30 FPS is sufficient)
- Avoids expensive per-sample calculations (Math.sin, etc.) in worklet
- <1% CPU overhead vs audio-rate modulation

**What This Means:**
- LFO/envelope modulation is smooth but not sample-accurate
- Perfect for musical modulation (filter sweeps, vibrato, tremolo)
- Not suitable for audio-rate FM (use engine's internal FM instead)

## Accent, Slide, and Trill

Plaits supports Ræmbl's performance features for expressive sequencing.

### Accent

**1.5× velocity boost with snappier decay**

When a note is marked as accented in the sequencer:
1. Velocity multiplied by 1.5× (max 1.0)
2. LPG attack is slightly shortened (punchier)
3. Note stands out in the sequence

**Sound Design Tip:** Use accent on downbeats or key rhythmic hits to add groove and emphasis.

### Slide

**TB-303 style pitch glide between notes**

Slide creates smooth pitch transitions between notes using exponential pitch ramping.

**Mono Mode (TB-303 Style):**
- Pitch glides from previous note to current note
- Glide time: 80ms (default) or controlled by `glide` parameter (0-500ms)
- Only works if a previous note exists (mono voice continuity)

**Poly Mode (Slide-Into Effect):**
- Note starts -0.5 semitones flat and slides up over 40ms
- Creates subtle pitch bend-in effect
- Works even without previous note

**Implementation:**
```javascript
// Mono slide
pitchBendParam.setValueAtTime(prevPitch, time);
pitchBendParam.exponentialRampToValueAtTime(currentPitch, time + 0.080);

// Poly slide-into
pitchBendParam.setValueAtTime(currentPitch - 0.5, time);
pitchBendParam.linearRampToValueAtTime(currentPitch, time + 0.040);
```

**Sound Design Tip:** Use slide on adjacent scale notes for acid bass lines (mono mode) or subtle pitch bends (poly mode).

### Trill

**Rapid pitch oscillation to next scale degree**

Trill rapidly alternates between the main note and the next note in the current scale (set in PATH module).

**Implementation:**
- 2-note trill on offbeats (swung 16ths)
- 3-note trill on downbeats (even 16ths)
- Pitch automation via `pitchBend` AudioParam (not per-sample worklet code)

**Trill Timing:**
```javascript
const stepDurationSec = (60 / bpm) * (beatsPerBar / stepsPerBar);
const numSegments = isOffbeat ? 2 : 3;
const segmentDuration = stepDurationSec / numSegments;
```

**Sound Design Tip:** Combine trill + slide for wild, expressive acid sequences.

## Sound Design Tips

Practical recipes and starting points for getting musical results from Plaits engines.

### Warm FM Bass (Engine 2: FM)

**Recipe:**
1. Set HARMONICS to 40-60% (moderate modulation index)
2. Set TIMBRE to 25% (1:2 ratio for harmonic FM)
3. Set MORPH to 10-20% (subtle feedback)
4. Set LPG DECAY to 30-40% (punchy decay)
5. Set LPG COLOUR to 80-100% (tone decays with amplitude)
6. Enable mono mode
7. Add slide on key notes for TB-303 style bassline

**Why It Works:** Harmonic FM ratios create warm, tonal bass. High LPG COLOUR ensures brightness decays naturally. Short decay keeps it punchy.

### Vowel Pad (Engine 7: Speech)

**Recipe:**
1. Set HARMONICS to 50% (neutral vowel)
2. Set TIMBRE to 70% (female vocal range)
3. Set MORPH to 30% (voiced excitation)
4. Set LPG DECAY to 90% (long sustain)
5. Set LPG COLOUR to 60% (moderate tone decay)
6. Modulate HARMONICS with slow LFO (0.2Hz sine, 40% depth) for vowel morphing
7. Add reverb (50-70% send)

**Why It Works:** Speech engine's formant filters create vocal-like tones. LFO modulation of HARMONICS sweeps through vowel positions (a → e → i → o → u).

### Granular Texture (Engine 3: Grain)

**Recipe:**
1. Set HARMONICS to 60% (mid-formant)
2. Set TIMBRE to 80% (wide, breathy formant)
3. Set MORPH to 90% (dense grain cloud)
4. Set LPG DECAY to 95% (long sustain)
5. Set LPG COLOUR to 40% (tone stays bright)
6. Modulate MORPH with random (RND mode, 16-bit LFSR, 60% depth)
7. Modulate HARMONICS with LFO (0.1Hz triangle, 30% depth)

**Why It Works:** High grain density (MORPH) creates lush texture. Random MORPH modulation adds organic variation. Slow HARMONICS sweep creates evolving formant motion.

### 808 Kick (Engine 13: Bass Drum)

**Recipe:**
1. Set HARMONICS to 10-15% (sub-bass pitch)
2. Set TIMBRE to 20% (dark, subby tone)
3. Set MORPH to 25-35% (punchy decay)
4. Set LPG DECAY to 30% (adds extra envelope)
5. Set LPG COLOUR to 90% (tone decays quickly)
6. Use mono mode to prevent overlapping kicks

**Why It Works:** Low HARMONICS = sub-bass pitch. Low TIMBRE = dark tone. Short MORPH = tight decay. High LPG COLOUR = natural brightness decay.

### Metallic Bell (Engine 12: Modal)

**Recipe:**
1. Set HARMONICS to 80-90% (metallic material)
2. Set TIMBRE to 50-60% (bell-like mode ratios)
3. Set MORPH to 70-90% (long, ringing decay)
4. Set LPG DECAY to 80% (slow fade)
5. Set LPG COLOUR to 70% (natural brightness decay)
6. Add reverb (40-60% send)

**Why It Works:** High HARMONICS selects metallic mode ratios. Long MORPH + LPG DECAY = sustained ringing. Reverb adds space and depth.

### Acid Lead (Engine 17: Phase Distortion)

**Recipe:**
1. Set HARMONICS to 60-80% (aggressive distortion)
2. Set TIMBRE to 40-70% (resonant formant)
3. Set MORPH to 20-40% (moderate distortion curve)
4. Set LPG DECAY to 40-50% (percussive)
5. Set LPG COLOUR to 80% (filter-like decay)
6. Modulate TIMBRE with envelope (ENV mode, 200ms attack, 500ms release, 70% depth)
7. Enable slide for glide effects

**Why It Works:** Phase distortion creates bright, metallic tones. TIMBRE modulation via envelope = filter sweep. Slide = TB-303 style portamento.

### Detuned Supersaw (Engine 0: Virtual Analogue)

**Recipe:**
1. Set HARMONICS to 10-20% (sawtooth waveform)
2. Set TIMBRE to 50% (neutral waveshaping)
3. Set MORPH to 60% (sub-oscillator blend)
4. Set LPG DECAY to 80% (sustained)
5. Set LPG COLOUR to 30% (brightness stays constant)
6. Enable poly mode (8 voices)
7. Modulate HARMONICS with LFO (0.3Hz sine, 10% depth) for slow detune wobble

**Why It Works:** Sawtooth waveform (low HARMONICS) = bright, full spectrum. Poly mode + subtle LFO detune = wide, chorus-like pad.

### Glitchy Swarm (Engine 8: Swarm)

**Recipe:**
1. Set HARMONICS to 70-90% (dense swarm)
2. Set TIMBRE to 80-100% (chaotic pitch randomisation)
3. Set MORPH to 20-40% (short grain duration)
4. Set LPG DECAY to 50-70% (rhythmic gating)
5. Modulate MORPH with SEQ mode (8-step pattern, values: 20, 80, 30, 90, 40, 70, 50, 60)
6. Modulate HARMONICS with TM mode (16 steps, 50% probability)

**Why It Works:** High density + pitch randomisation = chaotic swarm. Sequenced MORPH creates rhythmic grain bursts. Probabilistic HARMONICS adds variation.

## Comparison with Subtractive and Rings

Ræmbl offers three synthesis engines. Here's when to use each:

### Subtractive Engine

**Best For:**
- Classic analogue-style sounds (bass, leads, pads)
- Filter sweeps and resonance effects
- Learning synthesis fundamentals
- CPU-efficient polyphony

**Strengths:**
- Familiar subtractive workflow (osc → filter → env)
- Independent amp + filter envelopes (ADSR)
- Polyphonic (8 voices)
- Low CPU usage

**Limitations:**
- Single synthesis type (VA subtractive only)
- No physical modelling or FM

### Plaits Engine

**Best For:**
- Exploring diverse synthesis techniques
- Creating complex, evolving timbres
- Percussive and physical modelling sounds
- One-knob sound design (macro controls)

**Strengths:**
- 24 synthesis engines in one interface
- Macro controls offer immediate musicality
- OUT/AUX dual outputs
- Great for happy accidents and exploration

**Limitations:**
- Less control over individual parameters (macro paradigm)
- Single decay envelope (no sustain stage)
- Higher CPU usage than subtractive

### Rings Engine

**Best For:**
- Realistic plucked/struck sounds (strings, bells, mallets)
- Physical modelling resonances
- Pitched percussion
- Sympathetic string effects

**Strengths:**
- Most realistic physical modelling
- Sympathetic string coupling (unique timbres)
- Excitation position control
- Polyphony up to 4 voices

**Limitations:**
- Specific to resonant/struck timbres
- Limited to 6 models (vs Plaits' 24 engines)
- Lower polyphony (4 vs 8)

**Rule of Thumb:**
- **Subtractive:** Traditional synth sounds, learning, CPU efficiency
- **Plaits:** Diverse timbres, experimentation, macro control
- **Rings:** Realistic physical modelling, plucked/struck sounds

## Technical Reference

### AudioWorklet Architecture

Plaits is implemented as 8 separate AudioWorkletNodes (one per voice), following the same pattern as the subtractive engine.

**File:** `merged-app/js/audio/worklets/plaits-processor.bundle.js` (bundled from source)

**Voice Pool Manager:** `merged-app/js/raembl/audio/plaits-voice-pool.js`

**Key Components:**
- `PlaitsVoicePool` - Manages 8 voice nodes, handles allocation/stealing
- `plaits-processor` - AudioWorklet processor (one instance per voice)
- Engine implementations (24 separate DSP engines in C++ port)

**Message Protocol:**
```javascript
// Main thread → Worklet
voiceNode.port.postMessage({ type: 'noteOn', note: 60, velocity: 0.8 });
voiceNode.port.postMessage({ type: 'noteOff', note: 60 });
voiceNode.port.postMessage({ type: 'setEngine', value: 0-23 });
voiceNode.port.postMessage({ type: 'quickRelease' }); // 25ms fade for voice stealing
voiceNode.port.postMessage({ type: 'setLPGBypass', value: true/false });
voiceNode.port.postMessage({ type: 'setOutputMode', value: 'out'|'aux'|'mix' });

// Worklet → Main thread
{ event: 'engineChanged', value: engineIndex }
{ event: 'voiceReleased' } // Voice finished release
{ event: 'debug', value: 'message' }
```

### Parameter Mapping

Plaits parameters are stored as 0-100 in state but mapped to 0-1 for the AudioWorklet processor.

| State Key | Range (State) | Range (Processor) | Mapping |
|-----------|---------------|-------------------|---------|
| `plaitsEngine` | 0-23 (discrete) | 0-23 (int) | Direct |
| `plaitsHarmonics` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `plaitsTimbre` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `plaitsMorph` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `plaitsLpgDecay` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `plaitsLpgColour` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `plaitsMixOutAux` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |

**Update Flow:**
```javascript
// UI → State → Audio
faderValue (0-100) → state.plaitsHarmonics (0-100) → audioParam.value (0-1)

// State → UI (patch load)
state.plaitsHarmonics (0-100) → faderValue (0-100) → fader visual position
```

### FX Routing

Plaits voices connect to the same FX chain as subtractive voices:

**Classic Mode (Reverb + Delay):**
```
Plaits Voice Node → Master Gain
                 └→ Reverb Send
                 └→ Delay Send
                 └→ Dry Signal Tap (for sidechain)
```

**Clouds Mode:**
```
Plaits Voice Node → Clouds Input Analyser → Clouds Processor → Master
```

FX mode switching is handled by `audio.js:switchFxMode()`, which reconnects all voice nodes.

### Patch Format

Plaits parameters are saved in the unified patch format v1.2.0+:

```json
{
  "version": "1.2.0",
  "raembl": {
    "engineType": "plaits",
    "plaitsEngine": 2,
    "plaitsHarmonics": 60,
    "plaitsTimbre": 45,
    "plaitsMorph": 30,
    "plaitsLpgDecay": 50,
    "plaitsLpgColour": 70,
    "plaitsMixOutAux": 0,
    "modulations": {
      "plaits.harmonics": {
        "mode": "LFO",
        "enabled": true,
        "depth": 40,
        "lfoWaveform": 0,
        "lfoRate": 2.5
      }
    }
  }
}
```

**Backward Compatibility:**
- Patches without `engineType` default to `'subtractive'`
- Plaits parameters ignored if engine isn't Plaits
- Missing Plaits params use defaults (50 for most, 0 for mixOutAux)

## See Also

- **[Ræmbl User Guide](../../user-guide/raembl-guide.md)** - Complete guide to Ræmbl synthesiser
- **[Subtractive Engine](./subtractive-engine.md)** - Classic VA synthesis engine
- **[Rings Engine](./rings-engine.md)** - Physical modelling resonator
- **[PPMod System](../../modulation/ppmod.md)** - Per-parameter modulation
- **[Ræmbl Parameters Reference](../../reference/raembl-parameters.md)** - All Ræmbl parameters

---

**Version:** 1.0
**Last Updated:** 2025-12-30
**Plaits Firmware Version:** Mutable Instruments Plaits 1.2 (C++ → JavaScript port)
