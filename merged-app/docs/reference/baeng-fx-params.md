# Bæng FX Parameters Reference

**Complete parameter reference for all Bæng effects processors**

This document provides detailed parameter specifications for all FX processors in Bæng (6-voice drum machine). For conceptual overviews and usage guides, see the individual effect documentation pages.

---

## Table of Contents

- [Reverb Parameters](#reverb-parameters)
- [Delay Parameters](#delay-parameters)
- [Clouds Parameters](#clouds-parameters)
- [Drum Bus Parameters](#drum-bus-parameters)

---

## Reverb Parameters

Global algorithmic convolution reverb with per-voice send routing. Each of the 6 voices has an independent send control.

### Global Reverb Controls

| Parameter | UI Label | State Key | Range | Default | Unit | Description |
|-----------|----------|-----------|-------|---------|------|-------------|
| **Decay** | DEC | `reverbDecay` | 0-100 | 50 | - | Reverb tail length (0.1s-5.0s exponential mapping) |
| **Damping** | DAMP | `reverbDamping` | 0-100 | 50 | - | High-frequency absorption (0=bright, 100=dark) |
| **Diffusion** | DIFF | `reverbDiffusion` | 0-100 | 60 | - | Impulse density/complexity (0=discrete echoes, 100=smooth reverb) |
| **Pre-Delay** | PRED | `reverbPreDelay` | 0-100 | 10 | - | Early reflections timing (0-200ms linear mapping) |

**Note:** The global mix parameter (`reverbMix`) is fixed at 100% and not exposed in the UI. Per-voice send levels control the amount of signal entering the reverb processor.

### Per-Voice Reverb Sends

Each voice has an independent reverb send control (0-100%):

| Voice | Parameter ID | State Key | Default |
|-------|--------------|-----------|---------|
| Voice 1 | `voice.reverbSend` | `voices[0].reverbSend` | 0% |
| Voice 2 | `voice.reverbSend` | `voices[1].reverbSend` | 0% |
| Voice 3 | `voice.reverbSend` | `voices[2].reverbSend` | 0% |
| Voice 4 | `voice.reverbSend` | `voices[3].reverbSend` | 0% |
| Voice 5 | `voice.reverbSend` | `voices[4].reverbSend` | 0% |
| Voice 6 | `voice.reverbSend` | `voices[5].reverbSend` | 0% |

**Implementation:** Send controls are LED ring knobs in the ENGINE module, labelled "RVB".

### Parameter Mappings

**Decay (0-100 → 0.1-5.0 seconds):**
```
decayTime = 0.1 + (param/100) × 4.9
```
Exponential scaling provides fine control at shorter decay times while allowing long cathedral-style tails.

**Damping (0-100 → 0-1):**
```
dampingFactor = param / 100
envelope = envelope × exp(-t × damping × 5)
```
Applied as exponential high-frequency decay within the impulse response.

**Diffusion (0-100 → 0-1):**
```
diffusionFactor = param / 100
envelopeShape = pow(1 - t, 2.0 + (diffusion × 2))
```
Controls impulse envelope shape (low = discrete echoes, high = smooth tail).

**Pre-Delay (0-100 → 0-200ms):**
```
preDelayTime = (param/100) × 0.2
```
Linear mapping from 0ms (no pre-delay) to 200ms (maximum early reflection timing).

### Modulation Support

All global reverb parameters are modulatable via the PPMod system with **trigger source selection** (effect parameters):

- **Trigger Sources:** `none`, `T1`, `T2`, `T3`, `T4`, `T5`, `T6`, `sum`
- **Modulation Modes:** LFO, RND, ENV, EF, TM, SEQ
- **Parameter ID Format:** `effects.reverbDecay`, `effects.reverbDamping`, etc.

**Example:** Modulate decay with ENV mode triggered by voice 1 (kick drum) for dynamic reverb tails that follow kick envelope.

### Related Documentation

- [Reverb Effect Overview](../effects/reverb.md)
- [Sidechain Ducking](../effects/sidechain.md) (reverb can be ducked by drum voices)
- [PPMod System](../modulation/ppmod-overview.md)

---

## Delay Parameters

Tempo-synchronised or free-running delay with per-voice send routing. Includes tape-style modulation (wow/flutter) and saturation distortion.

### Global Delay Controls

| Parameter | UI Label | State Key | Range | Default | Unit | Description |
|-----------|----------|-----------|-------|---------|------|-------------|
| **Time** | TIME | `delayTime` | 0-100 | 25 | - | Delay time (sync divisions or 1-4000ms in free mode) |
| **Feedback** | FDBK | `delayFeedback` | 0-100 | 0 | % | Feedback amount (max 95% internal clamp) |
| **Sync** | SYNC | `delaySyncEnabled` | Toggle | On | - | Tempo sync vs free mode |
| **Wow** | WOW | `delayWow` | 0-100 | 10 | - | Tape wow modulation (slow pitch variation, 0.1-0.5Hz) |
| **Flutter** | FLUT | `delayFlutter` | 0-100 | 5 | - | Tape flutter modulation (fast pitch variation, 4-8Hz) |
| **Saturation** | SAT | `delaySaturation` | 0-100 | 0 | - | Saturation distortion amount (k=0 to k=20) |
| **Filter** | FILT | `delayFilter` | 0-100 | 50 | - | Filter cutoff (50=bypass, <50=lowpass 500Hz-30kHz) |

**Note:** The global mix parameter (`delayMix`) is fixed at 100% and not exposed in the UI. Per-voice send levels control the amount of signal entering the delay processor.

### Per-Voice Delay Sends

Each voice has an independent delay send control (0-100%):

| Voice | Parameter ID | State Key | Default |
|-------|--------------|-----------|---------|
| Voice 1 | `voice.delaySend` | `voices[0].delaySend` | 0% |
| Voice 2 | `voice.delaySend` | `voices[1].delaySend` | 0% |
| Voice 3 | `voice.delaySend` | `voices[2].delaySend` | 0% |
| Voice 4 | `voice.delaySend` | `voices[3].delaySend` | 0% |
| Voice 5 | `voice.delaySend` | `voices[4].delaySend` | 0% |
| Voice 6 | `voice.delaySend` | `voices[5].delaySend` | 0% |

**Implementation:** Send controls are LED ring knobs in the ENGINE module, labelled "DLY".

### Sync Mode Time Mappings

When sync is enabled (`delaySyncEnabled: true`), the TIME parameter selects from 12 musical divisions:

| TIME Value | Division | Ratio  | Time @ 120 BPM |
|------------|----------|--------|----------------|
| 0-8        | 1/32     | 1/32   | 62.5 ms        |
| 9-16       | 1/16     | 1/16   | 125 ms         |
| 17-24      | 1/16T    | 1/12   | 167 ms         |
| 25-33      | 1/8      | 1/8    | 250 ms         |
| 34-41      | 1/8T     | 1/6    | 333 ms         |
| 42-49      | 1/16D    | 3/16   | 375 ms         |
| 50-58      | 1/4      | 1/4    | 500 ms         |
| 59-66      | 1/4T     | 1/3    | 667 ms         |
| 67-74      | 1/8D     | 3/8    | 750 ms         |
| 75-83      | 1/2      | 1/2    | 1000 ms        |
| 84-91      | 1/4D     | 3/4    | 1500 ms        |
| 92-100     | 1 (whole)| 1      | 2000 ms        |

### Free Mode Time Mapping

When sync is disabled (`delaySyncEnabled: false`), the TIME parameter maps exponentially to milliseconds:

```
delayTimeMs = 1 + (param/100)^2 × 3999
```

This provides fine control at short delays (1-100ms for slapback/doubling) while allowing long delays up to 4 seconds.

**Alternate mapping (used in `delayTimeFree` state key):**
```
delayTimeMs = param × 40  // Linear 0-4000ms
```

### Tape Modulation Characteristics

**Wow (Slow Pitch Variation):**
- Frequency: `0.1 + (param/100) × 0.4` Hz (0.1-0.5Hz)
- Depth: `(param/100) × 5` ms
- Character: Slow, gentle pitch warble (simulates tape speed variations)

**Flutter (Fast Pitch Variation):**
- Frequency: `4 + (param/100) × 4` Hz (4-8Hz)
- Depth: `(param/100) × 1` ms
- Character: Fast, subtle pitch fluctuation (simulates transport irregularities)

### Saturation Characteristics

**Waveshaper Formula:**
```
k = (param/100)^3 × 20  // Cubic curve, k=0 to k=20
y = (1 + k) × x / (1 + k × |x|)
compensationGain = 1.0 / (1 + k × 0.75)
```

**Automatic Gain Compensation:**
Saturation includes 75% compensation to prevent runaway feedback:
- At SAT=0: gain=1.0 (unity)
- At SAT=50: compensation reduces gain by ~40%
- At SAT=100: compensation reduces gain by ~60%

### Filter Mapping

**Filter Cutoff (0-100 → 500Hz-30kHz):**
```
if (param === 50) {
  // Bypass (30kHz, above audible range)
  cutoff = 30000
} else if (param < 50) {
  // Lowpass 500Hz-30kHz (exponential)
  cutoff = 500 × pow(60, param/50)
} else {
  // Highpass mode (reserved for future implementation)
  cutoff = 500 × pow(60, (param-50)/50)
}
```

At 50% (default), the filter is effectively bypassed (30kHz cutoff). Values below 50% progressively reduce high frequencies for vintage tape/dub effects.

### Modulation Support

All delay parameters (except SYNC toggle) are modulatable via the PPMod system with **trigger source selection**:

- **Trigger Sources:** `none`, `T1`, `T2`, `T3`, `T4`, `T5`, `T6`, `sum`
- **Modulation Modes:** LFO, RND, ENV, EF, TM, SEQ
- **Parameter ID Format:** `effects.delayTime`, `effects.delayFeedback`, etc.

**Example:** Modulate delay time with LFO for pitch-shifting repeats, or use ENV mode triggered by voice 2 (snare) for dynamic delay tails.

### Related Documentation

- [Delay Effect Overview](../effects/delay.md)
- [Sidechain Ducking](../effects/sidechain.md) (delay can be ducked by drum voices)
- [PPMod System](../modulation/ppmod-overview.md)

---

## Clouds Parameters

Granular/spectral texture processor with 6 playback modes. Unlike reverb/delay, Clouds uses a global processor with per-voice send routing.

### FX Mode Toggle

| Parameter | UI Element | State Key | Options | Default | Description |
|-----------|------------|-----------|---------|---------|-------------|
| **FX Mode** | Toggle | `fxMode` | `classic`, `clouds` | `classic` | Switches between Classic FX (reverb/delay) and Clouds processor |

When `fxMode === 'clouds'`, the Clouds processor replaces the classic reverb/delay routing. Per-voice sends route to Clouds instead of reverb/delay.

### Global Clouds Controls

| Parameter | UI Label | State Key | Range | Default | Unit | Description |
|-----------|----------|-----------|-------|---------|------|-------------|
| **Position** | POS | `cloudsPosition` | 0-100 | 50 | % | Buffer read position (0=oldest, 100=newest). Unused in Oliverb/Resonestor modes |
| **Size** | SIZE | `cloudsSize` | 0-100 | 50 | % | **Granular:** Grain duration. **WSOLA:** Window size. **Looping:** Loop duration. **Spectral:** FFT overlap. **Oliverb:** Reverb size. **Resonestor:** Chord selection |
| **Density** | DENS | `cloudsDensity` | 0-100 | 50 | % | **Granular:** Grain rate. **WSOLA:** Overlap. **Looping:** Internal feedback. **Spectral:** Spectral blur. **Oliverb:** Decay time. **Resonestor:** Resonance bandwidth |
| **Texture** | TEX | `cloudsTexture` | 0-100 | 50 | % | **Granular:** Window shape + diffusion (>75%). **WSOLA:** Matching tolerance. **Looping:** Crossfade character. **Spectral:** Phase randomisation. **Oliverb:** Tone (LP/HP). **Resonestor:** HF damping |
| **Pitch** | PITCH | `cloudsPitch` | 0-100 | 50 | st | Pitch shift (-24 to +24 semitones). 0→-24st, 50→0st, 100→+24st. Bipolar mapping |
| **Dry/Wet** | D/W | `cloudsDryWet` | 0-100 | 0 | % | Dry/wet mix (0=100% dry, 100=100% wet). Equal-power crossfade. **Default 0 to prevent unexpected processing** |
| **Spread** | SPRD | `cloudsSpread` | 0-100 | 0 | % | Stereo width. **Granular:** Grain panning. **WSOLA/Looping/Spectral:** Stereo decorrelation. **Oliverb:** Diffusion. **Resonestor:** Comb filter spread |
| **Feedback** | FB | `cloudsFeedback` | 0-100 | **0** | % | **CRITICAL:** Output fed back to input. **MUST default to 0 to prevent runaway oscillation.** HP filtered (20-120Hz) to remove rumble |
| **Reverb** | VERB | `cloudsReverb` | 0-100 | 0 | % | Post-diffuser reverb amount. Controls both mix and decay time. **WARNING: High values (>70%) + high feedback (>90%) can cause instability** |
| **Input Gain** | IN | `cloudsInputGain` | 0-100 | 50 | % | Input level boost/cut. 0-100 state → 0-200% gain. 0=silence, 50=100% (unity), 100=200% |

### Per-Voice Clouds Sends

Each voice has an independent Clouds send control (0-100%):

| Voice | Parameter ID | State Key | Default |
|-------|--------------|-----------|---------|
| Voice 1 | `voice.cloudsSend` | `voices[0].cloudsSend` | 0% |
| Voice 2 | `voice.cloudsSend` | `voices[1].cloudsSend` | 0% |
| Voice 3 | `voice.cloudsSend` | `voices[2].cloudsSend` | 0% |
| Voice 4 | `voice.cloudsSend` | `voices[3].cloudsSend` | 0% |
| Voice 5 | `voice.cloudsSend` | `voices[4].cloudsSend` | 0% |
| Voice 6 | `voice.cloudsSend` | `voices[5].cloudsSend` | 0% |

**Implementation:** Send controls are LED ring knobs in the ENGINE module, labelled "CLOUD".

### Playback Modes

| Mode Index | Mode Name | State Key | Description |
|------------|-----------|-----------|-------------|
| 0 | **Granular** | `cloudsMode` | Classic granular synthesis (64-grain engine) |
| 1 | **WSOLA** | `cloudsMode` | Pitch-shifting via Waveform-Similarity Overlap-Add |
| 2 | **Looping Delay** | `cloudsMode` | Buffer-based delay with pitch-shifting |
| 3 | **Spectral** | `cloudsMode` | Phase vocoder FFT processing |
| 4 | **Oliverb** | `cloudsMode` | Parasites reverb mode with pitch-shifting |
| 5 | **Resonestor** | `cloudsMode` | Parasites modal synthesis resonator |

**UI:** Dropdown selector with short labels (GRAN, WSOLA, LOOP, SPEC, VERB, RESO).

### Quality Presets

| Preset Index | Preset Name | Bit Depth | Stereo | Buffer Time | Character |
|--------------|-------------|-----------|--------|-------------|-----------|
| 0 | **HI** | 16-bit | Stereo | 1s | Clean, full bandwidth, short buffer |
| 1 | **MED** | 16-bit | Mono | 2s | Clean, mono sum, medium buffer |
| 2 | **LO** | 8-bit | Stereo | 4s | Lo-fi, crunchy, long buffer |
| 3 | **XLO** | 8-bit | Mono | 8s | Lo-fi, mono, extra-long buffer |

**State Key:** `cloudsQuality` (0-3)

**UI:** Cycle button (HI → MED → LO → XLO)

### Additional Controls

| Parameter | UI Element | State Key | Type | Default | Description |
|-----------|------------|-----------|------|---------|-------------|
| **Freeze** | Button | `cloudsFreeze` | Boolean | `false` | Locks buffer content (disables writes, reduces feedback to 0) |
| **Clock Sync** | Button | *(Not in state, trigger-based)* | Trigger | - | Enables tempo-locked grain/loop triggers on even steps |

### Critical Parameter Notes

**Feedback Must Default to 0:**

The `cloudsFeedback` parameter creates a regenerative loop. If it starts at any value > 0 on patch load, unwanted echoes or runaway oscillation may occur immediately.

**Validation Rules:**
1. Processor level: Default value is 0 in AudioWorklet `parameterDescriptors`
2. State level: `cloudsFeedback: 0` in Bæng state initialisation
3. UI level: Knob initialises to 0 position
4. Patch load: Value clamped to 0-1 range before sending to processor

**Feedback + Reverb Stability:**

High reverb (≥ 70%) combined with high feedback (≥ 90%) can cause instability due to cumulative gain in the feedback loop.

**Prevention:**
- Keep feedback < 50% for most musical use
- If using high feedback (> 70%), reduce reverb to < 40%
- Monitor output levels when adjusting both parameters simultaneously

**Validation Warnings:**
```javascript
if (feedback >= 0.9 && reverb >= 0.7) {
  console.warn('[Clouds] STABILITY WARNING: High feedback + reverb detected');
}
```

### Parameter Mappings

**Pitch (0-100 → -24 to +24 semitones):**
```
semitones = (param - 50) × 0.48  // 0→-24st, 50→0st, 100→+24st
pitchRatio = pow(2, semitones / 12)
```

**Input Gain (0-100 → 0-200%):**
```
gain = param / 50  // 0→0%, 50→100%, 100→200%
```

**All Other Parameters (0-100 → 0-1):**
```
normalised = param / 100
```

### Modulation Support

All Clouds parameters (except Freeze and Mode) are modulatable via the PPMod system with **trigger source selection**:

- **Trigger Sources:** `none`, `T1`, `T2`, `T3`, `T4`, `T5`, `T6`, `sum`
- **Modulation Modes:** LFO, RND, ENV, EF, TM, SEQ
- **Parameter ID Format:** `effects.cloudsPosition`, `effects.cloudsDensity`, etc.

**Example:** Modulate position with SEQ mode for rhythmic buffer scanning, or texture with LFO for evolving grain shapes.

### Related Documentation

- [Clouds Effect Overview](../effects/clouds.md)
- [Sidechain Ducking](../effects/sidechain.md) (Clouds can be ducked by drum voices)
- [PPMod System](../modulation/ppmod-overview.md)

---

## Drum Bus Parameters

Ableton Drum Buss-inspired AudioWorklet master channel processor. Provides drive, crunch, transient shaping, sub-bass enhancement, compression, and tone control optimised for drum material.

### Drive Section

| Parameter | UI Label | State Key | Range | Default | Description |
|-----------|----------|-----------|-------|---------|-------------|
| **Drive Amount** | DRIVE | `drumBus.driveAmount` | 0-100 | 0 | Saturation intensity (waveshaper amount) |
| **Drive Type** | *(Selector)* | `drumBus.driveType` | 0-2 | 0 | Waveshaper curve: 0=Soft (1.5x tanh), 1=Med (3.0x tanh), 2=Hard (8.0x clip) |

**AudioParam IDs:** `driveAmount` (0-1), `driveType` (0-2)

**Implementation:** Pre-computed 8192-sample lookup tables with linear interpolation. Drive amount blends dry/wet, drive type selects curve.

### Crunch Section

| Parameter | UI Label | State Key | Range | Default | Description |
|-----------|----------|-----------|-------|---------|-------------|
| **Crunch** | CRUNCH | `drumBus.crunch` | 0-100 | 0 | Mid-high frequency saturation (500Hz+ content isolated and saturated) |

**AudioParam ID:** `crunch` (0-1)

**Implementation:** One-pole highpass at 500Hz isolates mids/highs, fast tanh approximation (`x / (1 + |x|)`), drive scaled 1-5× based on amount.

### Transient Section

| Parameter | UI Label | State Key | Range | Default | Description |
|-----------|----------|-----------|-------|---------|-------------|
| **Transients** | TRANS | `drumBus.transients` | 0-100 | 50 | Bipolar transient shaper (50%=neutral, <50%=less attack, >50%=more attack) |

**AudioParam ID:** `transients` (0-1, 0.5=neutral)

**Implementation:** SPL differential envelope follower (fast env: 1ms attack/20ms release, slow env: 15ms attack/20ms release). Weighted gain applied based on transient/sustain ratio.

**Gain Mapping:**
- **More transients (>50%):**
  - Attack: 0dB to +12dB (boost)
  - Sustain: 0dB to -6dB (reduce)
- **Less transients (<50%):**
  - Attack: 0dB to -6dB (reduce)
  - Sustain: 0dB to +3dB (boost)

### Boom Section

| Parameter | UI Label | State Key | Range | Default | Description |
|-----------|----------|-----------|-------|---------|-------------|
| **Boom Amount** | BOOM | `drumBus.boomAmount` | 0-100 | 0 | Sub-bass level (resonant lowpass output mix) |
| **Boom Freq** | FREQ | `drumBus.boomFreq` | 0-100 | 33 | Resonant frequency (0-100 → 30-90Hz, 33≈50Hz) |
| **Boom Decay** | DECAY | `drumBus.boomDecay` | 0-100 | 50 | Resonance/Q (0=low Q ~2, 100=high Q ~80) |

**AudioParam IDs:** `boomAmount` (0-1), `boomFreq` (0-1), `boomDecay` (0-1)

**Implementation:** State-variable filter (SVF) in resonant lowpass mode, excited by input signal. Mono processing (left channel only) for phase coherence. Gain compensation applied to prevent distortion at high Q.

**Frequency Mapping:**
```
freqHz = 30 + (param/100) × 60  // 30-90Hz
```

**Q Mapping:**
```
q = 2 + (param/100) × 78  // Q range: 2-80
damp = 1 / q
```

### Compressor Section

| Parameter | UI Label | State Key | Range | Default | Description |
|-----------|----------|-----------|-------|---------|-------------|
| **Compressor** | COMP | `drumBus.compEnabled` | Toggle | Off | Enables fixed-ratio compression (on/off only) |

**AudioParam ID:** `compressEnabled` (0-1, 0=off, 1=on)

**Fixed Parameters:**
- Threshold: -12dB (0.25 linear)
- Ratio: 3:1
- Attack: 10ms
- Release: 100ms
- Makeup Gain: ~3.5dB (1.5× linear)

**Implementation:** Simple feed-forward design with per-channel envelope followers. Linear-domain gain reduction (avoids log/pow per sample). Automatic makeup gain compensates for level loss.

### Dampen Section

| Parameter | UI Label | State Key | Range | Default | Description |
|-----------|----------|-----------|-------|---------|-------------|
| **Dampen Freq** | DAMP | `drumBus.dampenFreq` | 0-100 | 100 | Lowpass cutoff (0-100 → 500Hz-30kHz exponential, 100=30kHz bypass) |

**AudioParam ID:** `dampenFreq` (0-1)

**Implementation:** One-pole lowpass filter (6dB/oct roll-off). Exponential frequency mapping provides natural feel.

**Frequency Mapping:**
```
freqHz = 500 × pow(60, param)  // 500Hz-30kHz exponential
```

At 100% (default), the filter is effectively bypassed (30kHz cutoff, above audible range).

### Gain Staging

| Parameter | UI Label | State Key | Range | Default | Description |
|-----------|----------|-----------|-------|---------|-------------|
| **Trim Gain** | TRIM | `drumBus.trimGain` | 0-100 | 50 | Input gain (-12dB to +12dB, 50=0dB unity) |
| **Output Gain** | OUT | `drumBus.outputGain` | 0-100 | 75 | Output level (0-100 → 0-4× gain via perceptual curve, 75≈0dB) |
| **Dry/Wet** | D/W | `drumBus.dryWet` | 0-100 | 100 | Parallel blend (0=100% dry, 100=100% wet) |

**AudioParam IDs:** `trimGain` (0-1), `outputGain` (0-1), `dryWet` (0-1)

**Trim Gain Mapping:**
```
gainLinear = lookupGain(param, -12dB, +12dB)  // Lookup table for dB→linear
```

**Output Gain Mapping:**
```
gain = (param)^2 × 2  // Perceptual quadratic curve
// 0% → silence
// 75% → 0dB (unity gain)
// 100% → +6dB (2× gain)
```

**Dry/Wet Mixing:**
```
output = (dry × (1 - dryWet) + wet × dryWet) × outputGain
```

Mixing happens **before** output gain (correct parallel workflow).

### Parameter Summary Table

Complete reference of all Drum Bus parameters:

| Section | Parameter | State Key | AudioParam ID | Range | Default | Modulation |
|---------|-----------|-----------|---------------|-------|---------|------------|
| **Drive** | Amount | `drumBus.driveAmount` | `driveAmount` | 0-100 | 0 | No |
| **Drive** | Type | `drumBus.driveType` | `driveType` | 0-2 | 0 (Soft) | No |
| **Crunch** | Amount | `drumBus.crunch` | `crunch` | 0-100 | 0 | No |
| **Transients** | Amount | `drumBus.transients` | `transients` | 0-100 | 50 | No |
| **Boom** | Amount | `drumBus.boomAmount` | `boomAmount` | 0-100 | 0 | No |
| **Boom** | Freq | `drumBus.boomFreq` | `boomFreq` | 0-100 | 33 | No |
| **Boom** | Decay | `drumBus.boomDecay` | `boomDecay` | 0-100 | 50 | No |
| **Compressor** | Enabled | `drumBus.compEnabled` | `compressEnabled` | Toggle | Off | No |
| **Dampen** | Freq | `drumBus.dampenFreq` | `dampenFreq` | 0-100 | 100 | No |
| **Gain** | Trim | `drumBus.trimGain` | `trimGain` | 0-100 | 50 | No |
| **Gain** | Output | `drumBus.outputGain` | `outputGain` | 0-100 | 75 | No |
| **Gain** | Dry/Wet | `drumBus.dryWet` | `dryWet` | 0-100 | 100 | No |

**Note:** Drum Bus parameters are **not currently modulatable** via the PPMod system. They are master-level processing controls intended for global bus character, not per-step modulation.

### Related Documentation

- [Drum Bus Overview](../effects/drum-bus.md)
- [Bæng User Guide](../user-guide/baeng-guide.md)

---

## Parameter ID Reference

Complete list of Bæng FX parameter IDs for MIDI mapping, automation, and programmatic control.

### Reverb Parameter IDs

| UI Label | Parameter ID | State Key | Type |
|----------|--------------|-----------|------|
| DEC | `effects.reverbDecay` | `reverbDecay` | Global |
| DAMP | `effects.reverbDamping` | `reverbDamping` | Global |
| DIFF | `effects.reverbDiffusion` | `reverbDiffusion` | Global |
| PRED | `effects.reverbPreDelay` | `reverbPreDelay` | Global |
| RVB (per-voice) | `voice.reverbSend` | `voices[n].reverbSend` | Voice |

### Delay Parameter IDs

| UI Label | Parameter ID | State Key | Type |
|----------|--------------|-----------|------|
| TIME | `effects.delayTime` | `delayTime` | Global |
| FDBK | `effects.delayFeedback` | `delayFeedback` | Global |
| SYNC | `effects.delaySyncEnabled` | `delaySyncEnabled` | Global |
| WOW | `effects.delayWow` | `delayWow` | Global |
| FLUT | `effects.delayFlutter` | `delayFlutter` | Global |
| SAT | `effects.delaySaturation` | `delaySaturation` | Global |
| FILT | `effects.delayFilter` | `delayFilter` | Global |
| DLY (per-voice) | `voice.delaySend` | `voices[n].delaySend` | Voice |

### Clouds Parameter IDs

| UI Label | Parameter ID | State Key | Type |
|----------|--------------|-----------|------|
| POS | `effects.cloudsPosition` | `cloudsPosition` | Global |
| SIZE | `effects.cloudsSize` | `cloudsSize` | Global |
| DENS | `effects.cloudsDensity` | `cloudsDensity` | Global |
| TEX | `effects.cloudsTexture` | `cloudsTexture` | Global |
| PITCH | `effects.cloudsPitch` | `cloudsPitch` | Global |
| D/W | `effects.cloudsDryWet` | `cloudsDryWet` | Global |
| SPRD | `effects.cloudsSpread` | `cloudsSpread` | Global |
| FB | `effects.cloudsFeedback` | `cloudsFeedback` | Global |
| VERB | `effects.cloudsReverb` | `cloudsReverb` | Global |
| IN | `effects.cloudsInputGain` | `cloudsInputGain` | Global |
| MODE | `effects.cloudsMode` | `cloudsMode` | Global |
| QUAL | `effects.cloudsQuality` | `cloudsQuality` | Global |
| FREEZE | `effects.cloudsFreeze` | `cloudsFreeze` | Global |
| CLOUD (per-voice) | `voice.cloudsSend` | `voices[n].cloudsSend` | Voice |

### Drum Bus Parameter IDs

| UI Label | Parameter ID | State Key | Type |
|----------|--------------|-----------|------|
| DRIVE | `bus.driveAmount` | `drumBus.driveAmount` | Global |
| *(Type selector)* | *(No param ID)* | `drumBus.driveType` | Global |
| CRUNCH | `bus.crunch` | `drumBus.crunch` | Global |
| TRANS | `bus.transients` | `drumBus.transients` | Global |
| BOOM | `bus.boomAmount` | `drumBus.boomAmount` | Global |
| FREQ | `bus.boomFreq` | `drumBus.boomFreq` | Global |
| DECAY | `bus.boomDecay` | `drumBus.boomDecay` | Global |
| COMP | *(No param ID)* | `drumBus.compEnabled` | Global |
| DAMP | `bus.dampenFreq` | `drumBus.dampenFreq` | Global |
| TRIM | `bus.trimGain` | `drumBus.trimGain` | Global |
| OUT | `bus.outputGain` | `drumBus.outputGain` | Global |
| D/W | `bus.dryWet` | `drumBus.dryWet` | Global |

---

## State Access Patterns

Examples of accessing FX parameters in code:

### Reading Parameter Values

```javascript
import { getParameterValue } from '/merged-app/js/baeng/state.js';

// Global reverb parameter
const reverbDecay = getParameterValue('effects.reverbDecay');

// Per-voice send (uses currently selected voice)
const reverbSend = getParameterValue('voice.reverbSend');

// Drum Bus parameter
const driveAmount = getParameterValue('bus.driveAmount');
```

### Setting Parameter Values

```javascript
import { setParameterValue } from '/merged-app/js/baeng/state.js';

// Update global parameter
setParameterValue('effects.delayFeedback', 60);

// Update per-voice parameter (affects currently selected voice)
setParameterValue('voice.cloudsSend', 40);

// Update Drum Bus parameter
setParameterValue('bus.transients', 70);
```

### Direct State Access

```javascript
import { state } from '/merged-app/js/baeng/state.js';

// Read global reverb parameters
const decay = state.reverbDecay;        // 0-100
const damping = state.reverbDamping;    // 0-100

// Read per-voice sends (direct array access)
const voice1ReverbSend = state.voices[0].reverbSend;  // 0-100

// Read Drum Bus parameters (nested object)
const trimGain = state.drumBus.trimGain;        // 0-100
const outputGain = state.drumBus.outputGain;    // 0-100
```

---

## See Also

- [Bæng Parameters Reference](baeng-parameters.md) - Voice and sequencer parameters
- [Reverb Effect](../effects/reverb.md) - Reverb overview and usage
- [Delay Effect](../effects/delay.md) - Delay overview and usage
- [Clouds Effect](../effects/clouds.md) - Clouds overview and usage
- [Drum Bus](../effects/drum-bus.md) - Drum Bus overview and usage
- [PPMod System](../modulation/ppmod-overview.md) - Per-parameter modulation
- [Sidechain Ducking](../effects/sidechain.md) - Ducking configuration

---

**Version:** 1.0
**Last Updated:** 2025-12-30
**Application:** Bæng (6-voice drum machine)
