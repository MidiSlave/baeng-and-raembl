# Analog Engine Parameter Reference

Complete parameter reference for Bæng's Analog synthesis engines (aKICK, aSNARE, aHIHAT), including detailed parameter ranges, behaviour, and sound design guidance.

---

## Table of Contents

1. [Overview](#overview)
2. [Common Voice Parameters](#common-voice-parameters)
3. [aKICK Parameters](#akick-parameters)
4. [aSNARE Parameters](#asnare-parameters)
5. [aHIHAT Parameters](#ahihat-parameters)
6. [Output Mode](#output-mode)
7. [Parameter Modulation](#parameter-modulation)
8. [Preset Values](#preset-values)

---

## Overview

Bæng's Analog engines are based on Mutable Instruments Plaits synthesis algorithms, porting TR-808 style drum synthesis to JavaScript with per-sample DSP accuracy. Each engine features:

- **Authentic vintage character** - Modelled after classic TR-808 circuits
- **Real-time parameter updates** - Modulate parameters during voice playback
- **Monophonic retriggering** - Smooth voice stealing without clicks
- **Multiple output modes** - 808-style (OUT) or 909-style (AUX) routing per voice
- **PPMod integration** - All parameters support per-parameter modulation (LFO, RND, ENV, EF, TM, SEQ)

### Engine Types

| Engine | Name | Description | Circuit Model |
|--------|------|-------------|---------------|
| **aKICK** | Analog Kick | TR-808 bass drum synthesis | Pulse exciter → Diode shaper → Self-modulating resonator → Tone LP |
| **aSNARE** | Analog Snare | 5 modal resonators + filtered noise | Modal synthesis + noise generator |
| **aHIHAT** | Analog Hi-Hat | 6 square wave oscillators + clocked noise | Metallic partials + swing VCA |

### Architecture Notes

**aKICK**: Based on `plaits/dsp/drums/analog_bass_drum.cc`
- Pulse exciter (Q39/Q40 from 808 schematic)
- Diode waveshaping (C40/R163/R162/D83)
- SVF resonator with FM (Q43)
- Frequency-dependent overdrive at high sweep values

**aSNARE**: Based on `plaits/dsp/drums/analog_snare_drum.cc`
- 5 modal filters with harmonic ratios [1.00, 2.00, 3.18, 4.16, 5.62]
- Half-wave rectified noise source
- Dual envelope decay (fast attack, slower tail)

**aHIHAT**: Based on `plaits/dsp/drums/analog_hihat.cc`
- 6 square oscillators for metallic timbre
- Swing VCA (asymmetric clipping)
- Clocked noise generator
- Two-stage envelope (fast then slow decay)

---

## Common Voice Parameters

All Analog engines share these common voice parameters:

### Level (LEVEL)
| Range | Default | Modulation |
|-------|---------|------------|
| 0-100 | 85 (kick), 75 (snare), 70 (hihat) | Yes |

**Description:** Master output level for the voice. Does not affect internal DSP saturation characteristics.

**Sound Design:**
- Lower levels reduce likelihood of clipping in dense mixes
- Level does not change tone character (unlike Drive)
- Use with PPMod ENV for accent-driven dynamics

---

### Pitch (PITCH)
| Engine | Range | Default | Unit | Modulation |
|--------|-------|---------|------|------------|
| aKICK | 30-80 Hz | 50 (~55 Hz) | Hertz | Yes |
| aSNARE | 100-400 Hz | 50 (~250 Hz) | Hertz | Yes |
| aHIHAT | 200-800 Hz | 50 (~500 Hz) | Hertz | Yes |

**Description:** Fundamental frequency (f0) of the drum voice. Affects all oscillators/resonators proportionally.

**Sound Design:**
- **Kick:** Lower = sub-bass thump (30-40 Hz), higher = tonal/melodic (60-80 Hz)
- **Snare:** Lower = deep/snappy (100-150 Hz), higher = piccolo/rimshot (300-400 Hz)
- **Hi-hat:** Lower = dark/trashy (200-400 Hz), higher = bright/crisp (600-800 Hz)
- **Tip:** Pitch can be modulated via PPMod SEQ for melodic drum patterns

---

### Pan (PAN)
| Range | Default | Centre | Modulation |
|-------|---------|--------|------------|
| 0-100 | 50 | 50 = centre | Yes |

**Description:** Stereo position. 0 = hard left, 50 = centre, 100 = hard right.

**Sound Design:**
- Use PPMod LFO for auto-panning effects
- Spread voices across stereo field for wider mix

---

### Gate (GATE)
| Range | Default | Unit | Modulation |
|-------|---------|------|------------|
| 0-100 | 80 | % | Yes |

**Description:** Controls note duration as a percentage of the full decay envelope. Prevents accidental polyphony by cutting notes early.

**Behaviour:**
- 100% = Full natural decay (envelope rings out completely)
- 80% = Cuts note at 80% of decay time
- 0% = Instant gate (very short burst)

**Sound Design:**
- **Short gates (10-30%):** Staccato, tight drums
- **Medium gates (50-80%):** Punchy with controlled tail
- **Full gates (90-100%):** Natural ring-out, may cause voice overlap

---

### Choke Group (CHOKE)
| Range | Options | Default | Modulation |
|-------|---------|---------|------------|
| 0-4 | 0=Off, 1-4=Groups | 0 (kick), 2 (hihat) | Yes |

**Description:** Voice stealing group. Voices in the same choke group will cut each other off when triggered.

**Common Setups:**
- **Choke 2:** Closed + open hi-hats (realistic cymbal behaviour)
- **Choke 1:** Kick variations (prevents sub-bass buildup)
- **Choke 0:** Independent voices (no choking)

---

### Bit Reduction (BIT)
| Range | Default | Effect | Modulation |
|-------|---------|--------|------------|
| 0-100 | 0 | Sample rate + bit depth reduction | Yes |

**Description:** Lo-fi degradation effect. Reduces effective sample rate and bit depth.

**Sound Design:**
- 0 = Clean (48kHz, 32-bit float)
- 50 = Gritty (aliasing + quantisation noise)
- 100 = Extreme degradation (8-bit style)
- Works well with PPMod RND for glitchy textures

---

### Drive (DRIVE)
| Range | Default | Effect | Modulation |
|-------|---------|--------|------------|
| 0-100 | 0-20 | Waveshaper saturation | Yes |

**Description:** Soft saturation/overdrive. Adds harmonic distortion and compression.

**Sound Design:**
- Kick: Adds punch and sub-harmonic content (recommended 0-30)
- Snare: Brightens snap, increases sustain (recommended 10-40)
- Hi-hat: Adds grit and metallic edge (recommended 0-20)
- **Caution:** High drive (>70) can cause inter-sample clipping

---

### FX Sends
| Send | Range | Default | Modulation |
|------|-------|---------|------------|
| Reverb (RVB) | 0-100 | 0 | Yes |
| Delay (DLY) | 0-100 | 0 | Yes |
| Clouds (CLOUD) | 0-100 | 0 | Yes |

**Description:** Per-voice send levels to global FX processors. 0 = dry, 100 = fully wet.

**Sound Design:**
- **Reverb:** Add space to snares/claps (20-40), subtle room to kicks (5-15)
- **Delay:** Rhythmic echoes on hi-hats (30-60), ping-pong on snares (20-40)
- **Clouds:** Granular textures, spectral smearing (experimental)

---

## aKICK Parameters

### Tone (TONE)
| Param ID | UI Label | Range | Default | Modulation |
|----------|----------|-------|---------|------------|
| `analogKickTone` | PATCH | 0-100 | 50 | Yes |

**Description:** Final lowpass filter cutoff frequency. Controls brightness and harmonic content.

**Internal Mapping:**
```
toneF = min(4 * f0 * semitonesToRatio(tone * 108), 1.0)
exciterLeak = 0.08 * (tone + 0.25)
```

**Sound Design:**
- **0-30:** Dark, sub-focused kick (filters out mid-range punch)
- **30-60:** Balanced 808 character (classic thump)
- **60-80:** Bright, clicky attack (more beater/transient)
- **80-100:** Maximum brightness (full harmonic spectrum)
- **Tip:** Lower tone for sub-bass styles, higher tone for cutting through dense mixes

---

### Decay (DECAY)
| Param ID | UI Label | Range | Default | Modulation |
|----------|----------|-------|---------|------------|
| `analogKickDecay` | DEPTH | 0-100 | 50 | Yes |

**Description:** Resonator Q (quality factor). Controls how long the kick rings out.

**Internal Mapping:**
```
q = 1500 * semitonesToRatio(decay * 80)
```

**Sound Design:**
- **0-20:** Tight, punchy kick (minimal resonance)
- **20-50:** Balanced sustain (808-style)
- **50-70:** Long, boomy tail (sub-bass emphasis)
- **70-100:** Extreme resonance (can cause clipping at high levels)
- **Warning:** Very high decay (>80) + high level may cause runaway resonance

---

### Sweep (SWEEP)
| Param ID | UI Label | Range | Default | Modulation |
|----------|----------|-------|---------|------------|
| `analogKickSweep` | RATE | 0-100 | 70 | Yes |

**Description:** Pitch envelope depth and overdrive amount. Creates the characteristic "pitch drop" of 808 kicks.

**Internal Mapping:**
```
attackFMAmount = min(sweep * 4, 1.0)        // Saturates at sweep=0.25
selfFMAmount = max(min(sweep * 4 - 1, 1.0), 0.0)  // Kicks in after sweep=0.25
drive = max(sweep * 2 - 1, 0) * max(1 - 16*f0, 0)  // Overdrive at sweep>0.5
```

**Sound Design:**
- **0-25:** Minimal sweep (tonal kick, attack FM only)
- **25-50:** Classic 808 sweep (attack FM + self FM blend)
- **50-75:** Aggressive sweep with overdrive (saturated attack)
- **75-100:** Extreme FM + heavy saturation (distorted, aggressive)
- **Tip:** Use 60-70 for classic 808, 80-100 for industrial/gabber kicks

---

### Preset Values

**aKICK Presets** (from `analog-kick.js`):

| Type | Tone (PATCH) | Decay (DEPTH) | Sweep (RATE) | Character |
|------|--------------|---------------|--------------|-----------|
| **808** | 40 | 70 | 70 | Classic TR-808: boomy, strong sweep |
| **909** | 70 | 45 | 50 | Punchy TR-909 style: bright, moderate sweep |
| **Sub** | 20 | 80 | 60 | Sub kick: dark, long decay |
| **Tight** | 85 | 25 | 40 | Tight kick: bright, short, minimal sweep |

---

## aSNARE Parameters

### Tone (TONE)
| Param ID | UI Label | Range | Default | Modulation |
|----------|----------|-------|---------|------------|
| `analogSnareTone` | PATCH | 0-100 | 40 | Yes |

**Description:** Modal filter distribution. Controls the harmonic content and timbre of the snare body.

**Internal Mapping:**
```
if (tone < 0.666667) {
    // 808-style (2 modes: fundamental + harmonic)
    modeGains[0] = 1.5 + (1 - tone*1.5)^2 * 4.5
    modeGains[1] = 2 * tone*1.5 + 0.15
    modeGains[2-4] = 0
} else {
    // Extended modes (all 5 resonators active)
    modeGains[0-4] = progressive scaling
}
```

**Sound Design:**
- **0-30:** Deep, dark snare (fundamental-heavy, 808-like)
- **30-60:** Balanced body (fundamental + first harmonic)
- **60-80:** Extended harmonics (brighter, more complex)
- **80-100:** Full modal spectrum (all 5 resonators, metallic)
- **Tip:** Use <66 for 808 snares, >66 for metallic/complex tones

---

### Decay (DECAY)
| Param ID | UI Label | Range | Default | Modulation |
|----------|----------|-------|---------|------------|
| `analogSnareDecay` | DEPTH | 0-100 | 60 | Yes |

**Description:** Resonator Q and noise envelope decay. Controls sustain of both the tonal body and noise.

**Internal Mapping:**
```
decayXt = decay * (1 + decay * (decay - 1))  // Exponential transform
q = 2000 * semitonesToRatio(decayXt * 84)
noiseEnvelopeDecay = 1 - 0.0017 * semitonesToRatio(-decay * (50 + snap*10))
```

**Sound Design:**
- **0-30:** Tight, short snare (minimal ring)
- **30-60:** Balanced decay (808-style)
- **60-80:** Long, resonant tail (909-like)
- **80-100:** Extreme sustain (gated snare effect)
- **Tip:** Lower decay for punchy grooves, higher decay for sparse patterns

---

### Snap (SNAP)
| Param ID | UI Label | Range | Default | Modulation |
|----------|----------|-------|---------|------------|
| `analogSnareSnap` | RATE | 0-100 | 40 | Yes |

**Description:** Noise-to-body balance and exciter leak. Controls the "snappiness" vs tonal character.

**Internal Mapping:**
```
snapAdjusted = constrain(snap * 1.1 - 0.05, 0, 1)
exciterLeak = snap * (2 - snap) * 0.1
mix = noise + shell * (1 - snapAdjusted)
```

**Sound Design:**
- **0-20:** Tonal snare (body-heavy, minimal noise)
- **20-50:** Balanced snap (classic 808 ratio)
- **50-75:** Snappy, bright (noise-forward)
- **75-100:** Pure noise (no tonal body, hi-hat-like)
- **Tip:** Use 30-40 for classic snares, 60+ for rim shots

---

### Preset Values

**aSNARE Presets** (from `analog-snare.js`):

| Type | Tone (PATCH) | Decay (DEPTH) | Snap (RATE) | Character |
|------|--------------|---------------|-------------|-----------|
| **808** | 40 | 60 | 40 | Balanced body and snap |
| **909** | 70 | 40 | 60 | Snappy, bright |
| **Tight** | 80 | 25 | 50 | Very short, crisp |
| **Deep** | 30 | 75 | 30 | Long, dark |

---

## aHIHAT Parameters

### Tone (TONE)
| Param ID | UI Label | Range | Default | Modulation |
|----------|----------|-------|---------|------------|
| `analogHihatMetal` | PATCH | 0-100 | 30 | Yes |

**Description:** Coloration bandpass filter cutoff and Q. Controls brightness and metallic character.

**Internal Mapping:**
```
cutoff = constrain((150/sampleRate) * semitonesToRatio(tone * 60), 0, 0.40)
colorationQ = min(3 + 3*tone, 5.0)
```

**Sound Design:**
- **0-30:** Dark, trashy hi-hat (low-mid emphasis)
- **30-60:** Balanced metallic tone (808-style)
- **60-80:** Bright, crisp (909-like)
- **80-100:** Maximum brightness (high-frequency emphasis)
- **Warning:** Very high tone (>90) + high Q may cause filter instability

---

### Decay (DECAY)
| Param ID | UI Label | Range | Default | Modulation |
|----------|----------|-------|---------|------------|
| `analogHihatDecay` | DEPTH | 0-100 | 10 | Yes |

**Description:** Two-stage envelope decay coefficients. Controls sustain of hi-hat ring.

**Internal Mapping:**
```
envelopeDecay = 1 - 0.003 * semitonesToRatio(-decay * 84)
cutDecay = 1 - 0.0025 * semitonesToRatio(-decay * 36)
// Envelope uses envelopeDecay above 0.5, cutDecay below
```

**Sound Design:**
- **0-20:** Closed hi-hat (very short, tight)
- **20-50:** Semi-open (moderate sustain)
- **50-70:** Open hi-hat (long ring)
- **70-100:** Extreme sustain (cymbal-like)
- **Tip:** Use choke groups (CHOKE=2) for closed/open on same group

---

### Noisiness (BRIGHT)
| Param ID | UI Label | Range | Default | Modulation |
|----------|----------|-------|---------|------------|
| `analogHihatBright` | RATE | 0-100 | 60 | Yes |

**Description:** Clocked noise frequency and mix balance. Controls metallic vs noisy character.

**Internal Mapping:**
```
noisinessSquared = noisiness * noisiness
noiseF = constrain(f0 * (16 + 16*(1 - noisinessSquared)), 0, 0.5)
mix = tempBuffer + noisiness * (noiseSample - tempBuffer)
```

**Sound Design:**
- **0-30:** Pure metallic (6 square oscillators only)
- **30-60:** Balanced mix (classic 808 character)
- **60-80:** Noisy, trashy (clocked noise emphasis)
- **80-100:** Maximum noise (white noise character)
- **Tip:** Lower for clean hats, higher for lo-fi/vintage vibe

---

### Preset Values

**aHIHAT Presets** (from `analog-hihat.js`):

| Type | Tone (PATCH) | Decay (DEPTH) | Noisiness (RATE) | Character |
|------|--------------|---------------|------------------|-----------|
| **Closed** | 60 | 20 | 15 | Metallic, short, low noise |
| **Open** | 50 | 70 | 25 | Balanced, long, moderate noise |
| **Bright** | 85 | 30 | 10 | Very metallic, short, very low noise |
| **Dark** | 30 | 40 | 30 | Dark, moderate, more noise |

---

## Output Mode

All Analog engines support two output routing modes:

### OUT Mode (808-style)
**Description:** Voice connects directly to master bus (standard routing).

**Signal Path:**
```
Voice → Drive → Bit Reduction → FX Sends → Master Bus → Drum Bus → Output
```

**Use Cases:**
- Standard drum synthesis
- Full frequency range required
- Using global FX (reverb/delay/clouds)

---

### AUX Mode (909-style)
**Description:** Voice routes to auxiliary bus with highpass filtering (not yet implemented in current version).

**Planned Signal Path:**
```
Voice → Drive → Bit Reduction → HPF (200Hz) → FX Sends → AUX Bus → Output
```

**Use Cases:**
- Layering with external bass (avoid sub-frequency clash)
- Creating space in mix for kick fundamentals
- Sidechain ducking recipient

**Note:** AUX mode currently behaves identically to OUT mode. Highpass filtering will be added in future update.

---

## Parameter Modulation

All Analog engine parameters support the PPMod (Per-Parameter Modulation) system with 6 modes:

### Modulation Modes

| Mode | Description | Best Use Cases |
|------|-------------|----------------|
| **LFO** | Sine/Tri/Square/Saw oscillator, 0.1-20 Hz | Rhythmic pitch/tone sweeps, auto-pan |
| **RND** | LFSR random (4-32 bit), 0-100% probability | Humanisation, glitchy textures |
| **ENV** | AD/ADSR envelope, 0.2ms-8s times | Accent-driven dynamics, filter sweeps |
| **EF** | Envelope follower (analyser-based) | Dynamic response to voice amplitude |
| **TM** | Probabilistic step sequencer, 1-16 steps | Rhythmic parameter changes |
| **SEQ** | CV sequencer, 4-16 step pattern | Melodic patterns, rhythmic variation |

### Real-Time Updates

Analog engines support real-time parameter updates during voice playback via the `updateParameters()` method. This enables:

- **Smooth modulation** during sustained notes
- **No clicks or discontinuities** on parameter changes
- **K-rate updates** (30 FPS via `requestAnimationFrame`)
- **Efficient CPU usage** (<1% overhead for all modes)

### Example Modulation Setups

**Kick Pitch Wobble:**
- Parameter: PITCH
- Mode: LFO
- Waveform: Sine
- Rate: 4 Hz
- Depth: 30%
- **Result:** Classic dubstep-style sub wobble

**Snare Humanisation:**
- Parameter: SNAP
- Mode: RND
- Bit Length: 16
- Probability: 40%
- Depth: 15%
- **Result:** Subtle snap variation per hit

**Hi-Hat Accent Dynamics:**
- Parameter: TONE
- Mode: ENV
- Attack: 1 ms
- Release: 50 ms
- Depth: 60%
- Trigger: Accent
- **Result:** Brighter tone on accented hits

---

## Cross-References

### Related Documentation

- [Analog Engine Overview](../engines/baeng/analog.md) *(to be created)*
- [Bæng Parameter Reference](./baeng-parameters.md) - Complete parameter list
- [PPMod System Guide](../modulation/ppmod.md) *(to be created)*
- [Drum Bus FX](../effects/drum-bus.md) *(to be created)*

### Source Code References

- `/js/baeng/modules/analog/analog-kick.js` - Kick engine implementation
- `/js/baeng/modules/analog/analog-snare.js` - Snare engine implementation
- `/js/baeng/modules/analog/analog-hihat.js` - Hi-hat engine implementation
- `/js/baeng/modules/analog/analog-dsp-utils.js` - Shared DSP blocks (SVF, oscillators)
- `/js/baeng/state.js` - Parameter definitions (lines 118-149)

---

**Last Updated:** 2025-12-30
**Version:** 1.0.0
**Engines Covered:** aKICK, aSNARE, aHIHAT
