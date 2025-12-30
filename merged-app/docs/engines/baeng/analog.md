# Analog Drum Synthesis Engine

Virtual analogue drum synthesis engines in Bæng, featuring physically-modelled percussion based on Mutable Instruments Plaits. Includes kick, snare, and hi-hat synthesis with authentic 808-style character.

---

## Table of Contents

1. [Overview](#overview)
2. [What is Analog Drum Synthesis?](#what-is-analog-drum-synthesis)
3. [Kick Drum Engine (aKICK)](#kick-drum-engine-akick)
4. [Snare Drum Engine (aSNARE)](#snare-drum-engine-asnare)
5. [Hi-Hat Engine (aHIHAT)](#hi-hat-engine-ahihat)
6. [Common Parameters](#common-parameters)
7. [Sound Design Guide](#sound-design-guide)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The analog drum synthesis engines provide virtual analogue percussion synthesis based on the Mutable Instruments Plaits analog drum models. These engines use physically-inspired DSP to create authentic drum sounds without relying on samples.

### Key Features

- **Physical Modelling** - DSP algorithms simulate analogue drum circuits
- **TR-808 Heritage** - Based on classic Roland TR-808 architectures
- **Real-Time Modulation** - Full PPMod support for all parameters
- **CPU Efficient** - Lightweight DSP with chunk-based rendering
- **Anti-Aliasing** - PolyBLEP oscillators and TPT filters prevent aliasing artefacts

### Available Engines

| Engine | Type | Architecture | Best For |
|--------|------|-------------|----------|
| **aKICK** | Kick Drum | Pulse exciter → Diode shaper → Self-modulating resonator | Sub bass, punchy kicks, 808 booms |
| **aSNARE** | Snare Drum | 5 modal resonators + filtered noise | Tonal snares, rim shots, claps |
| **aHIHAT** | Hi-Hat | 6 square oscillators + clocked noise + swing VCA | Metallic hats, closed/open cymbals |

### Mutable Instruments Heritage

These engines are JavaScript ports of the Plaits Eurorack module's analog drum models. The original C++ DSP code has been carefully translated to maintain sonic accuracy whilst optimising for browser-based audio worklets.

---

## What is Analog Drum Synthesis?

Analog drum synthesis creates percussive sounds by simulating the physical behaviour of resonant systems (membranes, shells, metal) and excitation sources (beaters, noise bursts).

### Physical Modelling Concepts

#### Exciters

**Exciters** are impulse sources that trigger the resonant system:

- **Pulse** - Short voltage spike (kick beater impact)
- **Noise burst** - Filtered white noise (snare wire rattle)
- **Oscillator bank** - Multiple square waves (metallic shimmer)

#### Resonators

**Resonators** are filters that ring at specific frequencies when excited:

- **SVF (State Variable Filter)** - Zero-delay feedback bandpass filter
- **Modal resonators** - Multiple tuned filters (drum shell harmonics)
- **Self-modulation** - Resonator output modulates its own frequency

#### Waveshapers

**Waveshapers** add harmonic distortion and character:

- **Diode clipping** - Asymmetric waveshaping (creates even harmonics)
- **Soft clipping** - Smooth saturation (prevents harshness)
- **Swing VCA** - Asymmetric amplification (808 hi-hat character)

### Advantages Over Samples

**Flexibility:**
- Continuous parameter control (not just switching samples)
- Real-time modulation creates evolving textures
- CPU-efficient (no sample loading or streaming)

**Sound Design:**
- Create impossible sounds (e.g., 10Hz kicks, infinite resonance)
- Smooth transitions between presets
- No phase cancellation issues when layering

**Consistency:**
- Sample-accurate timing (no playback jitter)
- No sample aliasing at extreme pitches
- Perfect loop points and decay tails

---

## Kick Drum Engine (aKICK)

TR-808 style kick drum synthesis featuring self-modulating resonator for deep bass punch.

### Architecture

```
Pulse Exciter → Diode Shaping → Self-Modulating Resonator → Tone LP → Overdrive
    (1ms)            (808)             (Feedback FM)          (Cutoff)   (Optional)
```

**Signal Flow:**
1. **Pulse exciter** - 1ms voltage spike triggers the kick
2. **Diode shaper** - Asymmetric waveshaping adds harmonics
3. **Resonator** - SVF bandpass filter rings at fundamental frequency
4. **Self-modulation** - Resonator output modulates its own frequency (pitch sweep)
5. **Tone lowpass** - Filters high frequencies, blends exciter leak
6. **Overdrive** - Optional saturation at high SWEEP settings

### Parameters

#### TONE (0-100)

**Function**: Lowpass filter cutoff (controls brightness)

**Effect**:
- **0-30**: Dark, sub-heavy kicks (pure fundamental)
- **30-60**: Balanced 808 character
- **60-100**: Bright, punchy kicks with harmonics

**Technical Detail**: Controls tone filter frequency (4× fundamental frequency × semitone scaling). Also affects exciter leak amount (more leak = more click).

**Sound Design Tip**: Lower TONE for deep sub kicks, raise for cutting through dense mixes.

**State Mapping**: `analogKickTone` (0-100)

#### PITCH (0-100)

**Function**: Fundamental frequency (30-80 Hz)

**Effect**:
- **0**: 30 Hz (sub-bass territory)
- **50**: 55 Hz (neutral, classic 808 tuning)
- **100**: 80 Hz (high-tuned kick)

**Technical Detail**: Linear mapping to frequency in Hz. This is the base frequency that the resonator rings at (before pitch envelope modulation).

**Sound Design Tip**: Tune to track's root note for tonal coherence. Use PPMod ENV for pitch drop envelope.

**State Mapping**: `macroPitch` (0-100, shared with all engines)

#### DECAY (0-100)

**Function**: Resonator Q factor (controls sustain and resonance)

**Effect**:
- **0-30**: Tight, punchy kick (minimal resonance)
- **30-70**: Balanced 808 boom
- **70-100**: Long, sustained sub tail (high Q)

**Technical Detail**: Exponentially scaled Q factor (1500 × 2^(decay/15)). Higher Q = longer decay time and more resonance.

**Sound Design Tip**: Lower DECAY for trap-style tight kicks, raise for classic house booms.

**State Mapping**: `analogKickDecay` (0-100)

#### SWEEP (0-100)

**Function**: Pitch envelope depth and FM character

**Effect**:
- **0-25**: Attack FM only (subtle pitch sweep)
- **25-50**: Transition zone (attack FM fades, self-FM increases)
- **50-75**: Self-FM dominant (resonator modulates itself)
- **75-100**: Heavy self-FM + overdrive saturation

**Technical Detail**: Controls two FM sources:
- **Attack FM** (0-25%): 6ms pulse modulates frequency
- **Self FM** (25-100%): Resonator output modulates its own pitch

**Sound Design Tip**: Lower SWEEP for clean 909-style kicks, raise for aggressive FM character.

**State Mapping**: `analogKickSweep` (0-100)

### DSP Implementation

**Exciter Pulse:**
- 1ms duration, 3-10 amplitude
- Anti-click envelope (1ms smoothing on retriggering)
- Output crossfade on retrigger (0.5ms fadeout prevents clicks)

**Resonator (SVF):**
- Zero-delay feedback topology (stable at all frequencies)
- Frequency range: 30-80 Hz base, modulated by FM sources
- Q range: 1500-24000 (exponential scaling)

**Tone Filter:**
- One-pole lowpass (exponential moving average)
- Cutoff: 4× fundamental × semitone scaling
- Exciter leak: 0.08 × (tone + 0.25)

**Overdrive (Optional):**
- Activated at SWEEP > 50%
- Drive amount: (SWEEP × 2 - 1) × max(1 - 16 × f0, 0)
- Rational soft clipper: x(27 + x²)/(27 + 9x²)

### Presets

| Preset | TONE | DECAY | SWEEP | Description |
|--------|------|-------|-------|-------------|
| **808** | 40 | 70 | 70 | Classic boomy 808 kick |
| **909** | 70 | 45 | 50 | Punchy 909-style kick |
| **Sub** | 20 | 80 | 60 | Deep sub-bass kick |
| **Tight** | 85 | 25 | 40 | Short, aggressive kick |

Access presets via: `AnalogKick.getPreset('808')`

---

## Snare Drum Engine (aSNARE)

Modal synthesis snare featuring 5 resonators and filtered noise for tonal body and snap.

### Architecture

```
Pulse Exciter → 5 Modal Resonators → Soft Clip → Mix
                      (Shell modes)                  ↓
Noise Burst → Envelope → Bandpass Filter ───────────┘
   (Snares)
```

**Signal Flow:**
1. **Pulse exciter** - 1ms trigger pulse
2. **Modal resonators** - 5 tuned bandpass filters (drum shell harmonics)
3. **Soft clipper** - Prevents resonator runaway
4. **Noise generator** - Half-wave rectified noise (snare wire simulation)
5. **Noise envelope** - Exponential decay
6. **Noise filter** - 16× fundamental frequency bandpass
7. **Mix** - Balanced blend based on SNAP parameter

### Parameters

#### TONE (0-100)

**Function**: Modal character (808-style vs extended harmonics)

**Effect**:
- **0-30**: Dark 808 character (2 modes only, fundamental + 2nd harmonic)
- **30-66**: Balanced 808-style (2 modes with varying gain)
- **66-100**: Extended modes (all 5 modes active, bright timbre)

**Technical Detail**: Below 66%, only modes 1 and 2 are active (ratios 1.0, 2.0). Above 66%, modes 3-5 fade in (ratios 3.18, 4.16, 5.62) with exponential gain scaling.

**Sound Design Tip**: Lower TONE for classic 808 snare body, raise for complex timbres.

**State Mapping**: `macroPatch` (0-100, labeled "TONE" in UI)

#### PITCH (0-100)

**Function**: Fundamental frequency (100-400 Hz)

**Effect**:
- **0**: 100 Hz (deep tom-like snare)
- **50**: 250 Hz (neutral snare tuning)
- **100**: 400 Hz (high piccolo snare)

**Technical Detail**: Linear mapping to frequency. Modal ratios remain constant (1.0, 2.0, 3.18, 4.16, 5.62), so all modes shift proportionally.

**Sound Design Tip**: Tune to track's key for musical snares, or detune for aggressive character.

**State Mapping**: `macroPitch` (0-100, shared with all engines)

#### DECAY (0-100)

**Function**: Resonance time (Q factor + noise envelope)

**Effect**:
- **0-30**: Tight, short snare (low Q, fast noise decay)
- **30-70**: Balanced sustain
- **70-100**: Long, ringing snare (high Q, slow noise decay)

**Technical Detail**: Controls two parameters:
- **Resonator Q**: 2000 × 2^(decay_xt × 7) where decay_xt = decay(1 + decay(decay - 1))
- **Noise decay**: 1 - 0.0017 × 2^(-decay × (50 + snap × 10) / 12)

**Sound Design Tip**: Lower DECAY for tight trap snares, raise for sustaining rock snares.

**State Mapping**: `macroDepth` (0-100, labeled "DECAY" in UI)

#### SNAP (0-100)

**Function**: Noise amount and attack sharpness

**Effect**:
- **0-30**: Tonal snare (mostly modal resonators, minimal noise)
- **30-70**: Balanced snap (classic snare blend)
- **70-100**: Aggressive snap (noise-dominant, sharp attack)

**Technical Detail**: Controls:
- **Exciter leak**: snap × (2 - snap) × 0.1 (how much pulse bleeds through)
- **Noise mix**: Noise × 2 × snap, Shell × (1 - snap)
- **Noise decay**: Combined with DECAY parameter

**Sound Design Tip**: Lower SNAP for tonal 808 snares, raise for bright 909 character.

**State Mapping**: `macroRate` (0-100, labeled "SNAP" in UI)

### Modal Frequencies

The 5 modal resonators use harmonic ratios tuned to drum shell physics:

| Mode | Ratio | Interval | Q Scaling |
|------|-------|----------|-----------|
| 1 | 1.00 | Fundamental | 1.0 × Q |
| 2 | 2.00 | Octave | 0.25 × Q |
| 3 | 3.18 | ~Perfect 12th | 0.25 × Q |
| 4 | 4.16 | ~2 octaves + 3rd | 0.25 × Q |
| 5 | 5.62 | ~2 octaves + 5th | 0.25 × Q |

**Note**: Only mode 1 (fundamental) gets full Q, overtones get 25% Q for balanced resonance.

### DSP Implementation

**Pulse Generator:**
- 1ms duration, amplitude 3-10
- 0.1ms lowpass filtering
- Different excitation per mode (fundamental gets pulse - pulseLp, overtones get 0.026 × pulse)

**Modal Resonators:**
- SVF bandpass filters (zero-delay feedback)
- Frequency: f0 × mode ratio (clamped to 0.499 Nyquist)
- Q: 1 + frequency × (full Q for mode 1, 0.25 × Q for modes 2-5)

**Noise Generator:**
- White noise (2 × random() - 1)
- Half-wave rectified (negative values → 0)
- Exponential envelope (decay coefficient from DECAY + SNAP)
- 16× fundamental bandpass filter

**Soft Clipper:**
- Prevents resonator runaway: x(27 + x²)/(27 + 9x²)
- Hard limits at ±3

### Presets

| Preset | TONE | DECAY | SNAP | Description |
|--------|------|-------|------|-------------|
| **808** | 40 | 60 | 40 | Balanced body and snap |
| **909** | 70 | 40 | 60 | Snappy, bright character |
| **Tight** | 80 | 25 | 50 | Very short, crisp |
| **Deep** | 30 | 75 | 30 | Long, dark, tonal |

Access presets via: `AnalogSnare.getPreset('808')`

---

## Hi-Hat Engine (aHIHAT)

Metallic hi-hat synthesis using 6 square oscillators, clocked noise, and 808-style swing VCA.

### Architecture

```
6 Square Oscillators → Coloration BPF → Clocked Noise Mix → Swing VCA → HPF
  (Metallic ratios)      (Tone control)    (Noisiness)      (Envelope)  (Cutoff)
```

**Signal Flow:**
1. **Metallic noise** - 6 square oscillators at inharmonic ratios
2. **Coloration filter** - Bandpass filter shapes tone
3. **Clocked noise** - Sample-and-hold noise (controlled randomness)
4. **Swing VCA** - Asymmetric amplifier (808 character)
5. **Two-stage envelope** - Fast decay then slow cutoff
6. **Highpass filter** - Removes low-frequency rumble

### Parameters

#### METAL (0-100)

**Function**: Oscillator spread (tight metallic to washy)

**Effect**:
- **0-30**: Tight, controlled shimmer (narrow bandpass)
- **30-70**: Classic 808 metallic character
- **70-100**: Washy, wide-band shimmer (bright resonance)

**Technical Detail**: Controls coloration filter cutoff frequency (150Hz × 2^(tone × 5)) and Q factor (3 + 3 × tone, clamped to 5).

**Sound Design Tip**: Lower METAL for closed hi-hat, raise for open/sizzle.

**State Mapping**: `macroPatch` (0-100, labeled "METAL" in UI)

#### PITCH (0-100)

**Function**: Base oscillator frequency (200-800 Hz)

**Effect**:
- **0**: 200 Hz (low, dark hat)
- **50**: 500 Hz (neutral 808 tuning)
- **100**: 800 Hz (high, bright hat)

**Technical Detail**: Base frequency for metallic oscillators (actual frequencies are f0 × ratios). Also controls clocked noise frequency (16-32 × f0).

**Sound Design Tip**: Lower PITCH for darker cymbals, raise for bright hats.

**State Mapping**: `macroPitch` (0-100, shared with all engines)

#### DECAY (0-100)

**Function**: Envelope length (two-stage decay)

**Effect**:
- **0-30**: Closed hi-hat (very short decay)
- **30-70**: Semi-open hat
- **70-100**: Open hi-hat (long sustain)

**Technical Detail**: Controls two decay coefficients:
- **Envelope decay**: 1 - 0.003 × 2^(-decay × 7) (used while envelope > 0.5)
- **Cutoff decay**: 1 - 0.0025 × 2^(-decay × 3) (used while envelope ≤ 0.5)

**Sound Design Tip**: Lower DECAY for tight patterns, raise for sustained washes.

**State Mapping**: `macroDepth` (0-100, labeled "DECAY" in UI)

#### BRIGHT (0-100)

**Function**: Clocked noise mix (metallic vs noisy)

**Effect**:
- **0-30**: Pure metallic (square oscillators only)
- **30-70**: Balanced character
- **70-100**: Noisy, washy (high noise content)

**Technical Detail**: Noise mix = noisiness² (squared for perceptual scaling). Clocked noise frequency: f0 × (16 + 16 × (1 - noisiness²)).

**Sound Design Tip**: Lower BRIGHT for pure metallic 808 hats, raise for realistic cymbal noise.

**State Mapping**: `macroRate` (0-100, labeled "BRIGHT" in UI)

### Metallic Oscillator Ratios

The 6 square oscillators use inharmonic ratios for metallic timbre (nominal f0: 414 Hz):

| Oscillator | Ratio | Frequency @ 414Hz |
|------------|-------|-------------------|
| 1 | 1.000 | 414 Hz |
| 2 | 1.304 | 540 Hz |
| 3 | 1.466 | 607 Hz |
| 4 | 1.787 | 740 Hz |
| 5 | 1.932 | 800 Hz |
| 6 | 2.536 | 1050 Hz |

**Note**: These ratios are derived from physical cymbal analysis (bell modes).

### DSP Implementation

**Square Oscillators:**
- 6 independent phase accumulators
- Binary output (MSB extraction: 0 or 1)
- Summed output: 0.33 × count - 1.0 (range: -1.0 to +1.0)

**Coloration Filter (BPF):**
- SVF bandpass (zero-delay feedback)
- Frequency: (150/sampleRate) × 2^(tone × 5) (clamped to 0.40)
- Q: min(3 + 3 × tone, 5)

**Clocked Noise:**
- Phase accumulator triggers sample updates
- Sample-and-hold random values (-0.5 to +0.5)
- Frequency: f0 × (16 + 16 × (1 - noisiness²))

**Swing VCA:**
- Asymmetric clipping: positive × 4, negative × 0.1
- Tanh-like compression: s / (1 + |s|)
- Gain offset: (s + 0.1) × envelope

**Two-Stage Envelope:**
- Fast decay while envelope > 0.5 (envelopeDecay coefficient)
- Slow decay while envelope ≤ 0.5 (cutDecay coefficient)
- Initial trigger level: (1.5 + 0.5(1 - decay)) × (0.3 + 0.7 × accent)

**Highpass Filter:**
- SVF highpass (zero-delay feedback)
- Frequency: same as coloration filter cutoff
- Q: 0.5 (gentle slope)

### Presets

| Preset | METAL | DECAY | BRIGHT | Description |
|--------|-------|-------|--------|-------------|
| **Closed** | 60 | 20 | 15 | Metallic, short, low noise |
| **Open** | 50 | 70 | 25 | Balanced, long, moderate noise |
| **Bright** | 85 | 30 | 10 | Very metallic, short, minimal noise |
| **Dark** | 30 | 40 | 30 | Dark, moderate, more noise |

Access presets via: `AnalogHiHat.getPreset('closed')`

---

## Common Parameters

All three analog engines share these universal parameters:

### PITCH (0-100)

**Function**: Master frequency control

**Mapping**:
- **aKICK**: 30-80 Hz (linear)
- **aSNARE**: 100-400 Hz (linear)
- **aHIHAT**: 200-800 Hz (linear)

**State**: `macroPitch` (shared across all engines)

**PPMod Support**: Full modulation support with scale quantisation when enabled

**Use Cases**:
- Tune drums to track's key
- Create tom racks with pitch variations
- Pitch envelope effects via PPMod ENV mode

### LEVEL (0-100)

**Function**: Voice amplitude

**State**: `level` (per-voice parameter)

**Default Values**:
- **aKICK**: 85 (loud, punchy)
- **aSNARE**: 75 (balanced)
- **aHIHAT**: 70 (slightly quieter)

**PPMod Support**: Full modulation support

### Output Routing

All analog engines support:
- **PAN** (0-100): Stereo positioning (50 = centre)
- **RVB** (0-100): Reverb send amount
- **DLY** (0-100): Delay send amount
- **CLOUD** (0-100): Clouds FX send amount
- **BIT** (0-100): Bit reduction amount
- **DRIVE** (0-100): Saturation amount

### Gate Duration

**Function**: Note length control (0-100%)

**Effect**:
- **0-30**: Very short (staccato)
- **50-80**: Natural decay
- **100**: Full envelope duration

**Note**: Gate primarily affects sample/DX7 engines, analog engines use internal envelopes.

---

## Sound Design Guide

### Creating Classic Drum Sounds

#### 808 Kick

**Settings:**
- **TONE**: 40 (balanced brightness)
- **PITCH**: 50 (55 Hz fundamental)
- **DECAY**: 70 (boomy sustain)
- **SWEEP**: 70 (strong pitch drop)

**Modulation:**
- **PITCH + ENV**: Negative envelope for pitch drop (depth: -30%, attack: 5ms, release: 200ms)
- **DECAY + RND**: Subtle variation (depth: 10%, probability: 50%)

**Tips:**
- Lower TONE for sub-heavy kicks
- Raise SWEEP for aggressive FM character
- Use sidechain ducking on bass for space

#### 909 Kick

**Settings:**
- **TONE**: 70 (bright, punchy)
- **PITCH**: 55 (slightly higher)
- **DECAY**: 45 (tighter)
- **SWEEP**: 50 (moderate pitch drop)

**Modulation:**
- **TONE + ENV**: Brightness follows amplitude (depth: 20%, attack: 2ms, release: 150ms)

**Tips:**
- Higher TONE and PITCH for cutting through mix
- Lower DECAY for tight, punchy response
- Pair with bit reduction (10-20%) for grit

#### 808 Snare

**Settings:**
- **TONE**: 40 (808-style 2-mode character)
- **PITCH**: 50 (250 Hz)
- **DECAY**: 60 (moderate sustain)
- **SNAP**: 40 (balanced body/snap)

**Modulation:**
- **SNAP + RND**: Humanisation (depth: 15%, probability: 60%)
- **PITCH + ENV**: Subtle pitch drop (depth: -10%, release: 100ms)

**Tips:**
- Keep TONE below 66% for pure 808 character
- Balance SNAP to taste (lower = more tonal)
- Layer with reverb for depth

#### 909 Snare

**Settings:**
- **TONE**: 70 (extended modes, brighter)
- **PITCH**: 60 (higher tuning)
- **DECAY**: 40 (tight)
- **SNAP**: 60 (more aggressive)

**Modulation:**
- **TONE + EF**: Brightness follows dynamics (depth: 25%)
- **DECAY + SEQ**: Stepped decay variations

**Tips:**
- Higher TONE for complex timbre
- Raise SNAP for cutting snap
- Use drive (20-40%) for aggression

#### Closed Hi-Hat

**Settings:**
- **METAL**: 60 (controlled shimmer)
- **PITCH**: 50 (500 Hz base)
- **DECAY**: 20 (very short)
- **BRIGHT**: 15 (mostly metallic)

**Modulation:**
- **DECAY + SEQ**: Variation pattern (e.g., [10, 20, 15, 25])
- **METAL + LFO**: Slow wobble (rate: 0.5 Hz, depth: 10%)

**Tips:**
- Keep DECAY low for tight closed hats
- Lower BRIGHT for pure metallic character
- Use choke groups to prevent overlapping

#### Open Hi-Hat

**Settings:**
- **METAL**: 50 (balanced)
- **PITCH**: 50 (neutral)
- **DECAY**: 70 (long sustain)
- **BRIGHT**: 25 (moderate noise)

**Modulation:**
- **METAL + LFO**: Breathing shimmer (rate: 2 Hz, depth: 15%)

**Tips:**
- Raise DECAY for sustained open character
- Balance BRIGHT to taste
- Use opposite choke group from closed hat

### Advanced Techniques

#### Layering Kicks

**Strategy**: Layer aKICK with DX7 or SAMPLE for hybrid character

**Example:**
- **Voice 1 (aKICK)**: Sub-bass layer (TONE: 20, PITCH: 50, DECAY: 80)
- **Voice 4 (DX7)**: Attack/harmonics (Algorithm 4, DEPTH: 60, high pitch)

**Mix**: Voice 1 loud, Voice 4 quieter, blend to taste

#### Snare Variation

**Strategy**: Use PPMod TM mode for probabilistic variation

**Setup:**
- **TONE + TM**: 8-step pattern with probabilities [100, 80, 60, 100, 90, 70, 100, 85]
- **SNAP + RND**: Random variation (depth: 20%, probability: 50%)

**Result**: Every hit has subtle timbral variation

#### Rhythmic Modulation

**Strategy**: Use PPMod SEQ mode for melodic drum patterns

**Setup:**
- **PITCH + SEQ**: 4-step pattern [0, 12, -12, 7] (root, octave up, octave down, fifth)
- **Scale quantisation**: Enabled (force in-key notes)

**Result**: Drums play melodic patterns in sync with sequencer

#### Dynamic Response

**Strategy**: Use PPMod EF mode for velocity-sensitive timbre

**Setup:**
- **TONE + EF**: Brightness follows dynamics (depth: 30%, attack: 5ms, release: 100ms)
- **DECAY + EF**: Harder hits sustain longer (depth: 20%)

**Result**: Natural dynamic variation like acoustic drums

---

## Troubleshooting

### Common Issues

#### "Kick lacks sub-bass weight"

**Possible Causes**:
1. TONE too high (filtering out fundamental)
2. DECAY too low (insufficient resonance)
3. Room has bass traps or poor low-frequency response

**Solutions**:
- Lower TONE to 20-40 (lets fundamental through)
- Raise DECAY to 70-80 (increases Q factor)
- Check mix on multiple systems
- Add subtle drive (10-20%) for harmonic reinforcement

#### "Snare sounds too tonal/synthetic"

**Possible Causes**:
1. SNAP too low (not enough noise)
2. TONE in wrong range (should be < 66% for 808, > 66% for extended)
3. DECAY too high (ringing too long)

**Solutions**:
- Raise SNAP to 50-70 (adds noise content)
- Adjust TONE to 70+ for complex modes
- Lower DECAY to 30-50 for tighter response
- Layer with bit reduction or drive

#### "Hi-hat sounds harsh/aliased"

**Possible Causes**:
1. PITCH too high (approaching Nyquist)
2. METAL too high (excessive resonance)
3. BRIGHT too high (excessive noise)

**Solutions**:
- Lower PITCH to 40-60 (safer frequency range)
- Reduce METAL to 40-60 (controlled resonance)
- Lower BRIGHT to 10-30 (less noise content)
- Use highpass filter to remove aliasing artefacts

#### "Envelope cuts off abruptly"

**Possible Causes**:
1. Voice stealing (polyphony limit reached)
2. Gate parameter too low
3. Choke groups incorrectly configured

**Solutions**:
- Check polyphony mode (should be Mono for drums)
- Raise gate to 80-100% for full envelope
- Verify choke groups (0 = no choking)

#### "Sound disappears when modulating parameters"

**Possible Causes**:
1. Modulation range too extreme (e.g., PITCH modulated to 0 or 100)
2. Resonance instability at extreme settings
3. Filter cutoff modulated beyond stable range

**Solutions**:
- Reduce PPMod depth to 50-70% (safer range)
- Use offset to keep modulation within safe bounds
- Check for NaN in console (indicates DSP instability)

### Performance Issues

#### "Audio glitches when using multiple analog voices"

**Cause**: High CPU usage from DSP processing

**Solutions**:
- Use chunk-based rendering (already implemented)
- Reduce active voice count (use other engines)
- Increase audio buffer size (reduces latency, improves stability)
- Disable unused PPMod assignments

#### "Clicks/pops on fast retriggering"

**Cause**: Discontinuities in filter state

**Solutions**:
- Anti-click measures already implemented (pulseAttackEnv, outputFadeGain)
- If still occurring, reduce DECAY (lower Q = less ringing)
- Add slight attack to gate (5-10ms)

### Sonic Issues

#### "Kick sounds hollow/lacks punch"

**Solutions**:
- Raise SWEEP for more pitch envelope
- Increase DECAY for more body
- Add drive (20-40%) for saturation
- Layer with DX7 or SAMPLE for attack transient

#### "Snare lacks snap/attack"

**Solutions**:
- Raise SNAP to 60-80
- Increase TONE for brighter character
- Lower DECAY for tighter response
- Add bit reduction (10-20%) for digital crunch

#### "Hi-hat sounds too machine-like"

**Solutions**:
- Add DECAY + RND modulation (depth: 15%, probability: 70%)
- Raise BRIGHT slightly (adds organic noise)
- Use different METAL values for closed/open hats
- Layer with subtle reverb for space

---

## Further Reading

### Analog Synthesis Theory

**Physical Modelling**:
- [Julius O. Smith - Physical Audio Signal Processing](https://ccrma.stanford.edu/~jos/pasp/)
- [Vesa Välimäki - Discrete-Time Modelling of Acoustic Tubes](http://lib.tkk.fi/Diss/2001/isbn9512255324/)

**Filter Design**:
- [Vadim Zavalishin - The Art of VA Filter Design](https://www.native-instruments.com/fileadmin/ni_media/downloads/pdf/VAFilterDesign_2.0.0a.pdf)
- [Andy Simper - TPT SVF Filter](https://cytomic.com/files/dsp/SvfLinearTrapOptimised2.pdf)

**Drum Synthesis**:
- [Yamaha - Analog Drum Synthesis Techniques](https://usa.yamaha.com/products/music_production/)
- [Roland - TR-808 Service Manual](https://www.roland.com/us/support/)

### Mutable Instruments Resources

**Plaits Documentation**:
- [Plaits Manual](https://mutable-instruments.net/modules/plaits/manual/)
- [Plaits Source Code](https://github.com/pichenettes/eurorack/tree/master/plaits)

**DSP Utilities**:
- [stmlib - DSP Building Blocks](https://github.com/pichenettes/eurorack/tree/master/stmlib/dsp)

### Bæng Documentation

- [Bæng User Guide](../baeng-guide.md) - Complete Bæng documentation
- [DX7 Engine](dx7-engine.md) - FM synthesis engine
- [PPMod System](../../ppmod.md) - Per-parameter modulation reference
- [Sampler Engine](sampler-engine.md) - Sample playback engine

---

## Version History

**v1.0** (2025-12-30)
- Initial documentation release
- Complete aKICK, aSNARE, aHIHAT parameter reference
- DSP implementation details
- Sound design guide with classic presets
- Troubleshooting section
- Physical modelling overview

---

*This documentation is part of the Bæng & Ræmbl project. For issues, contributions, or questions, visit the [GitHub repository](https://github.com/MidiSlave/baeng-and-raembl).*
