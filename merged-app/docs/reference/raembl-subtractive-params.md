# Ræmbl Subtractive Engine Parameters

**Complete parameter reference for the SUB synthesis engine**

The Subtractive (SUB) engine is Ræmbl's classic virtual analogue synthesis engine, offering traditional subtractive synthesis with PolyBLEP anti-aliased oscillators, TPT filters, and dual ADSR envelopes. This document provides detailed technical specifications for all SUB engine parameters.

## Overview

The SUB engine implements a traditional signal flow familiar from classic analogue synthesisers:

```
Oscillators → Mixer → Highpass Filter → Lowpass Filter → Amp Envelope → Output
                          ↑                    ↑              ↑
                    Filter Env         Filter Env      Velocity
```

**Key Features:**
- 5 oscillators: Saw, Triangle, Square, Sub (sine), Noise
- PolyBLEP anti-aliasing (eliminates aliasing artefacts)
- TPT (Topology-Preserving Transform) filters (stable at all settings)
- Dual ADSR envelopes (independent amp + filter)
- 8-voice polyphony with intelligent voice allocation
- Independent OCT and SUB OCT transposition
- Per-parameter modulation via PPMod system
- Mono/poly mode switching

**Active When:** `engineType` is set to `'subtractive'` (default)

---

## 1. Oscillator Parameters

The oscillator section generates raw waveforms before filtering. All oscillators support independent pitch transposition and modulation.

### Main Oscillator Controls

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **OCT** (`osc.oct`) | 0-8 | 4 | ✓ | Main oscillator octave transposition (0 = -24 semitones, 4 = 0 semitones, 8 = +24 semitones) |
| **SUB OCT** (`osc.subOct`) | 0-8 | 2 | ✓ | Sub oscillator octave transposition (independent of main OCT, 0 = -24 semitones, 2 = -12 semitones, 8 = +24 semitones) |
| **DRIFT** (`osc.drift`) | 0-100 | 10 | ✓ | Pitch instability/drift amount (emulates analogue oscillator instability, applies per-note random offset) |
| **GLIDE** (`osc.glide`) | 0-100 | 0 | ✓ | Portamento/glide time (0 = instant pitch changes, 100 = 5 second glide) |

**State Keys:**
- `mainTransposition`: Internal value (0-8)
- `subTransposition`: Internal value (0-8)
- `drift`: Internal value (0-100)
- `glide`: Internal value (0-100)

**Technical Details:**

**OCT Transposition:**
- Applies to saw, triangle, square oscillators
- Mapped to semitones: `semitones = (octValue - 4) * 12`
- Applied as frequency multiplier: `freq *= 2^(semitones/12)`
- Independent from SUB OCT (allows complex detuning)

**SUB OCT Transposition:**
- Applies only to sub oscillator (sine wave)
- Independent transposition allows classic bass layering (e.g., main at 0, sub at -12 semitones)
- Mapped identically to OCT: `semitones = (subOctValue - 4) * 12`

**DRIFT Behaviour:**
- Per-note random pitch offset calculated at note-on
- Maximum drift: ±40 cents at 100%
- Offset stored in worklet: `driftOffset = (Math.random() * 2 - 1) * (driftAmount * 40)`
- Applied as octave shift: `2^(driftOffset/1200)`

**GLIDE Implementation:**
- Uses AudioParam exponential ramping (not per-sample worklet code)
- Mono mode: glides from previous note to current note
- Poly mode: no glide (instant pitch changes)
- Mapping: `0% = 0ms, 50% = 250ms, 100% = 5000ms`

### Pulse Width Modulation

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **WIDTH** (`osc.pulseWidth`) | 5-95 | 50 | ✓ | Pulse width for square wave (5% = narrow pulse, 50% = perfect square, 95% = inverted narrow pulse) |
| **PWM** (`osc.pwmAmount`) | 0-100 | 0 | ✓ | Pulse width modulation depth (from LFO or filter envelope) |

**State Keys:**
- `pulseWidth`: Base pulse width (5-95)
- `pwmAmount`: Modulation depth (0-100)
- `pwmSource`: Source selector (0-100, determines LFO vs ENV)

**Technical Details:**

**Base Pulse Width:**
- Controls duty cycle of square wave oscillator
- 50% = symmetrical square wave (odd harmonics only)
- <50% = narrow pulse (thin, nasal tone)
- >50% = wide pulse (inverted narrow, similar spectrum)
- Range limited to 5-95% to prevent DC offset

**PWM Modulation:**
- Sources: Mod LFO or filter envelope (selected via `pwmSource`)
- Modulation range: ±40% maximum
- Applied in worklet: `modulatedPWM = pulseWidth + (lfoValue * pwmAmount * 0.4)`
- Clamped to safe range: `Math.max(0.05, Math.min(0.95, modulatedPWM))`

**Classic Uses:**
- Static 50%: Classic square bass/lead (hollow, odd harmonics)
- Static 25%/75%: Clarinet-like nasal tones
- LFO PWM: Chorus-like movement (classic PWM sweep)
- ENV PWM: Filter-like timbral evolution

### Pitch Modulation

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **MOD** (`osc.pitchMod`) | 0-100 | 0 | ✓ | Pitch modulation depth (from Mod LFO or filter envelope) |

**State Keys:**
- `pitchMod`: Modulation depth (0-100)
- `modSource`: Source selector (0-100, determines LFO vs ENV)

**Technical Details:**

**Modulation Sources:**
- **Mod LFO**: Vibrato (±1 semitone range at 100% depth)
- **Filter Envelope**: Upward pitch sweep (0 to +2 octaves at 100% depth)

**Modulation Calculation:**
```javascript
const pitchModFromLFO = lfoValue * pitchMod * (1/12); // ±1 semitone
const pitchModFromEnv = filterEnv.value * pitchMod * 2; // 0 to +2 octaves
const totalPitchMod = pitchModFromLFO + pitchModFromEnv + driftValue;
const finalFreq = baseFreq * Math.pow(2, totalPitchMod);
```

**Classic Uses:**
- LFO pitch mod (10-30%): Subtle vibrato for leads
- ENV pitch mod (50-100%): Percussion/drum pitch envelopes (toms, kicks)
- Combined LFO + ENV: Evolving timbral sweeps

---

## 2. Mixer Parameters

The mixer section controls the level of each oscillator before filtering.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **◢ (SAW)** (`mixer.sawLevel`) | 0-100 | 75 | ✓ | Sawtooth oscillator level (bright, full harmonic spectrum) |
| **⊓ (SQR)** (`mixer.squareLevel`) | 0-100 | 0 | ✓ | Square/pulse oscillator level (hollow, odd harmonics only) |
| **△ (TRI)** (`mixer.triangleLevel`) | 0-100 | 0 | ✓ | Triangle oscillator level (warm, soft tone) |
| **■ (SUB)** (`mixer.subLevel`) | 0-100 | 50 | ✓ | Sub oscillator level (pure sine wave, independent octave control) |
| **≋ (NOISE)** (`mixer.noiseLevel`) | 0-100 | 0 | ✓ | White noise level (for breath, texture, percussion) |

**State Keys:**
- `sawLevel`: Saw level (0-100)
- `squareLevel`: Square level (0-100)
- `triangleLevel`: Triangle level (0-100)
- `subLevel`: Sub level (0-100)
- `noiseLevel`: Noise level (0-100)

**Technical Details:**

**Oscillator Types:**

**Sawtooth (◢):**
- PolyBLEP band-limited sawtooth
- Full harmonic spectrum (all harmonics present)
- Bright, cutting tone
- Classic for: Leads, bass, pads

**Square (⊓):**
- PolyBLEP band-limited square wave
- Odd harmonics only (1st, 3rd, 5th, 7th...)
- Hollow, reedy tone
- Pulse width controlled by `osc.pulseWidth`
- Classic for: Bass, hollow leads, PWM pads

**Triangle (△):**
- PolyBLAMP anti-aliased triangle wave
- Odd harmonics with steep rolloff
- Warm, soft tone (similar to lowpass filtered saw)
- Classic for: Mellow bass, soft pads

**Sub (■):**
- Pure sine wave (single fundamental, no harmonics)
- Independent octave transposition via `osc.subOct`
- Sub-bass reinforcement (typically 1-2 octaves below main)
- Classic for: 808-style bass layering, deep sub-bass

**Noise (≋):**
- White noise generator (Math.random-based)
- Full spectrum noise
- Classic for: Hi-hats, breath, texture, wind

**Mixing Strategy:**

**Typical Mixes:**
- **Bass**: Saw 70% + Sub 80% (bright + deep)
- **Lead**: Saw 100% (bright, cutting)
- **Pad**: Saw 50% + Triangle 50% (warm blend)
- **Hollow Lead**: Square 100% + PWM (reedy, vocal-like)
- **Percussion**: Noise 80% + Pitch ENV (hi-hat, snare)

**Voice Combining:**
All oscillators are summed before filtering:
```javascript
const oscMix =
  sawSample * sawLevel +
  triSample * triLevel +
  sqSample * sqLevel +
  subSample * subLevel +
  noiseSample * noiseLevel;
```

---

## 3. Filter Parameters

The SUB engine uses dual TPT (Topology-Preserving Transform) filters: highpass → lowpass serial routing.

### Filter Cutoff and Resonance

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **HP** (`filter.highPass`) | 0-100 | 0 | ✓ | Highpass filter cutoff frequency (0 = 20Hz/bypassed, 100 = 10kHz) |
| **LP** (`filter.lowPass`) | 0-100 | 75 | ✓ | Lowpass filter cutoff frequency (0 = 20Hz/closed, 100 = 20kHz/open) |
| **RES** (`filter.resonance`) | 0-100 | 20 | ✓ | Filter resonance/Q factor (0 = no resonance, 100 = self-oscillation) |

**State Keys:**
- `highPass`: HP cutoff (0-100)
- `lowPass`: LP cutoff (0-100)
- `resonance`: Resonance amount (0-100)

**Technical Details:**

**Highpass Filter:**
- Applied first in signal chain (removes sub-bass/rumble)
- Frequency mapping: Logarithmic 20Hz - 10kHz
- Mapping formula: `freq = 20 * 2^(hpValue * 8.966)`
- Fixed resonance: 0.7 (gentle slope, no self-oscillation)
- Use cases: Remove muddiness, thin out bass, create "telephone" effect

**Lowpass Filter:**
- Applied after highpass (classic subtractive filter)
- Frequency mapping: Logarithmic 20Hz - 20kHz
- Mapping formula: `freq = 20 * 2^(lpValue * 9.966)`
- Variable resonance: 0.1 - 25 (controlled by RES parameter)
- Self-oscillates at high RES (creates pure sine at cutoff frequency)

**Resonance Behaviour:**
- 0-30%: Gentle emphasis at cutoff (subtle brightness)
- 30-60%: Moderate resonance (classic filter "honk")
- 60-90%: Aggressive resonance (screaming peaks)
- 90-100%: Self-oscillation (pure sine tone at cutoff frequency)

**TPT Filter Benefits:**
- Zero-delay feedback (stable at all settings)
- No instability at high resonance + low cutoff
- Accurate at all sample rates
- Smooth parameter changes (no zipper noise)

### Filter Modulation

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **KEY** (`filter.keyFollow`) | 0-100 | 0 | ✓ | Keyboard tracking amount (0 = fixed filter, 100 = 1:1 note tracking) |
| **ENV** (`filter.envAmount`) | 0-100 | 50 | ✓ | Filter envelope modulation depth (bipolar: 0-50 = negative, 50 = off, 50-100 = positive) |
| **MOD** (`filter.mod`) | 0-100 | 0 | ✓ | Filter modulation depth from Mod LFO (±1 octave sweep) |

**State Keys:**
- `keyFollow`: Keyboard tracking (0-100)
- `envAmount`: Envelope depth (0-100, bipolar)
- `filterMod`: LFO modulation depth (0-100)

**Technical Details:**

**Keyboard Tracking:**
- Scales filter cutoff by note frequency
- 0%: Filter frequency stays constant regardless of pitch (classic for bass)
- 100%: Filter tracks pitch 1:1 (maintains brightness across range)
- Calculation: `keyTrackAmount = 1 + (keyFollow * (pitchRatio - 1))`
- Reference pitch: A4 (440Hz)

**Envelope Amount (Bipolar):**
- 0-49%: Negative modulation (-2 to 0 octaves from base cutoff)
- 50%: No modulation (base cutoff only)
- 51-100%: Positive modulation (0 to +4 octaves from base cutoff)
- Calculation:
  ```javascript
  const envAmount = (uiValue - 50) / 50; // -1 to +1
  const octaves = filterEnv.value * envAmount * (envAmount >= 0 ? 4 : 2);
  cutoff = baseCutoff * Math.pow(2, octaves);
  ```

**LFO Modulation:**
- Source: Mod LFO (sine/tri/square waveform)
- Range: ±1 octave from base cutoff
- Calculation: `cutoff *= Math.pow(2, lfoValue * filterMod)`

**Combined Modulation:**
All modulation sources are summed in octaves before applying:
```javascript
const keyTrackOctaves = Math.log2(keyTrackAmount);
const envOctaves = filterEnv.value * envAmount * (envAmount >= 0 ? 4 : 2);
const lfoOctaves = lfoValue * filterMod;
const finalCutoff = baseCutoff * Math.pow(2, keyTrackOctaves + envOctaves + lfoOctaves);
```

---

## 4. Envelope Parameters

The SUB engine uses dual ADSR envelopes: amplitude and filter. Both are independent 4-stage envelopes.

### Amp Envelope

Controls the amplitude (volume) contour of each note.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **A** (`envelope.attack`) | 0-100 | 0 | ✓ | Attack time (0 = 0.2ms, 100 = 8 seconds) |
| **D** (`envelope.decay`) | 0-100 | 25 | ✓ | Decay time (0 = 0.2ms, 100 = 8 seconds) |
| **S** (`envelope.sustain`) | 0-100 | 50 | ✓ | Sustain level (0 = silent, 100 = full level) |
| **R** (`envelope.release`) | 0-100 | 75 | ✓ | Release time (0 = 0.2ms, 100 = 8 seconds) |

**State Keys:**
- `attack`: Attack time (0-100)
- `decay`: Decay time (0-100)
- `sustain`: Sustain level (0-100)
- `release`: Release time (0-100)

**Technical Details:**

**Time Mapping (Exponential Curve):**
```javascript
// UI value (0-100) → milliseconds
const mapEnvTime = (value) => {
  if (value === 0) return 0.2; // Minimum 0.2ms
  return 0.2 * Math.pow(1000, value / 100); // 0.2ms to 8000ms (exponential)
};
```

**Envelope Stages:**

1. **Attack**: Ramps from 0 to 1.0
   - Rate: `1 / attackSamples` per sample
   - Transitions to Decay when value >= 1.0

2. **Decay**: Ramps from 1.0 to sustain level
   - Rate: `(1.0 - sustain) / decaySamples` per sample
   - Transitions to Sustain when value <= sustain

3. **Sustain**: Holds at sustain level
   - Remains constant while note is held
   - Transitions to Release on note-off

4. **Release**: Ramps from current value to 0
   - Uses snapshotted value + time at note-off (parameter changes don't affect releasing voices)
   - Rate: `releaseStartValue / releaseSamples` per sample
   - Transitions to Idle when value <= 0

**Accent Behaviour:**
When a note is accented (via Factors sequencer):
- Velocity multiplied by 1.5× (max 1.0)
- Attack time halved (2× faster, punchier transient)
- Decay time halved (snappier, tighter envelope)
- Original times restored on non-accented notes

**Independent Parameter Changes:**
Attack and release times are fully independent. Changing attack during a note's release phase does NOT affect the release timing (values are snapshotted at note-off).

### Filter Envelope

Controls the filter cutoff modulation contour. Uses identical ADSR structure to amp envelope but with independent timing and sustain level.

**State Keys:**
- Same as amp envelope (`attack`, `decay`, `sustain`, `release`)
- Separate internal worklet state: `filterEnv` vs `ampEnv`

**Technical Details:**

**Independent Timing:**
The filter envelope has separate attack/decay/sustain/release parameters, allowing:
- Fast filter attack (10ms) + slow amp attack (500ms) = plucky filter sweep with fade-in
- Slow filter release (2s) + fast amp release (50ms) = filter "trail" after note ends

**Filter Envelope Output:**
- Output range: 0.0 to 1.0 (normalised)
- Applied to filter cutoff via `filter.envAmount` (see Filter Modulation section)
- Can modulate pitch via `osc.pitchMod` (percussion pitch envelopes)
- Can modulate PWM via PWM source routing (timbral evolution)

**Typical Settings:**

**Percussive (Pluck/Piano):**
- A: 0-5%, D: 20-40%, S: 0%, R: 20-50%
- Fast attack, moderate decay, no sustain

**Pad/String:**
- A: 30-60%, D: 40-60%, S: 60-80%, R: 50-80%
- Slow attack and release, high sustain

**Brass/Lead:**
- A: 0-10%, D: 10-30%, S: 70-90%, R: 10-30%
- Fast attack, quick decay to high sustain

**Classic TB-303 Acid:**
- A: 0%, D: 30-50%, S: 0%, R: 5-10%
- Instant attack, moderate decay, no sustain, fast release

---

## 5. LFO Parameters

The SUB engine has two LFO systems: Main LFO (for sequencer/pitch modulation) and Mod LFO (for filter/PWM/pitch modulation).

### Mod LFO (Filter/PWM/Pitch Modulation)

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **RATE** (`modLfo.rate`) | 0-100 | 50 | ✓ | Mod LFO frequency (0 = 0.1Hz, 100 = 20Hz) |
| **WAVE** (`modLfo.waveform`) | 0-100 | 0 | ✓ | Mod LFO waveform (0 = sine, 50 = triangle, 100 = square) |

**State Keys:**
- `modLfoRate`: LFO rate (0-100)
- `modLfoWaveform`: Waveform selector (0-100)

**Technical Details:**

**Rate Mapping:**
```javascript
// UI value (0-100) → Hz
const mapLfoRate = (value) => {
  return 0.1 + (value / 100) * 19.9; // 0.1Hz to 20Hz (linear)
};
```

**Waveform Mapping:**
- 0-24: Sine wave
- 25-49: Triangle wave
- 50-74: Square wave
- 75-100: (Reserved for future waveforms)

**Worklet Implementation:**
The LFO runs continuously at audio rate in the worklet:
```javascript
const lfoPhaseNorm = this.lfoPhase / (2 * Math.PI); // 0-1
let lfoValue;
if (lfoWave === 0) {
  lfoValue = Math.sin(this.lfoPhase); // Sine: -1 to +1
} else if (lfoWave === 1) {
  lfoValue = lfoPhaseNorm < 0.5 ? (lfoPhaseNorm * 4) - 1 : 3 - (lfoPhaseNorm * 4); // Triangle
} else {
  lfoValue = lfoPhaseNorm < 0.5 ? 1 : -1; // Square
}
this.lfoPhase += (2 * Math.PI * lfoRate) / this.sampleRate;
```

**Modulation Targets:**
- **Filter Cutoff**: Via `filter.mod` parameter (±1 octave sweep)
- **Pitch**: Via `osc.pitchMod` parameter (±1 semitone vibrato)
- **PWM**: Via `osc.pwmAmount` parameter (±40% pulse width)

**Classic Uses:**
- **Vibrato**: Pitch mod (10-30%), sine wave, slow rate (4-6Hz)
- **Tremolo**: (Not directly supported, use amp envelope mod via PPMod)
- **Filter Wobble**: Filter mod (50-80%), sine/triangle, medium rate (2-8Hz)
- **PWM Chorus**: PWM amount (60-80%), triangle wave, slow rate (0.5-2Hz)

---

## 6. Voice Architecture

The SUB engine uses a pre-allocated 8-voice AudioWorklet architecture for polyphonic synthesis.

### Voice Pool

**Pre-Allocation:**
- 8 voices created at initialisation
- Each voice is a separate `RaemblVoiceProcessor` AudioWorkletNode
- Voices never destroyed (zero allocation overhead during playback)

**Voice States:**
```javascript
{
  node: AudioWorkletNode,
  active: false,        // Currently playing a note
  releasing: false,     // In release phase (still audible)
  note: null,          // MIDI note number
  engineType: 'subtractive'
}
```

**Voice Allocation:**

**Tier 1 (Preferred): Free Voices**
```javascript
voice = voicePool.find(v => !v.active && !v.releasing);
```
- Voice is silent and available
- Zero glitching, instant allocation

**Tier 2: Releasing Voices**
```javascript
voice = voicePool.find(v => v.releasing);
// Oldest releasing voice chosen first
```
- Voice is in release phase but still audible
- Minimal glitching (tail cutoff)

**Tier 3: Voice Stealing**
```javascript
voice = voicePool.find(v => v.active);
// Oldest active voice stolen
// Quick 2ms fade applied to prevent clicks
```
- No free or releasing voices available
- Steals oldest playing voice
- Sample-accurate fade prevents clicks

### Release Tracking

Voices remain in "releasing" state after note-off until amplitude envelope reaches zero.

**Release Time Calculation:**
```javascript
const releaseTimeSec = mapEnvTime(state.release) / 1000; // Convert ms to seconds
setTimeout(() => {
  voice.releasing = false; // Voice now fully free
}, releaseTimeSec * 1000 + 100); // Add 100ms buffer
```

**Why This Matters:**
- Prevents premature envelope cutoff (notes ring out fully)
- Allows natural voice allocation (releasing voices are lower priority)
- Eliminates "voice stealing glitches" in poly mode

### Mono vs Poly Mode

**Mono Mode (`monoMode: true`):**
- Single voice used (voice 0)
- Glide/slide works (pitch glides from previous note)
- Retriggering uses 2ms fade (prevents "flam" artefact)
- Envelope retriggers on each note

**Poly Mode (`monoMode: false`):**
- 8 voices active (polyphonic)
- No glide (instant pitch changes)
- Voice allocation per tier system
- Each voice has independent envelope

**Retrigger Fade (Mono Mode):**
When a new note arrives while previous note is still sounding:
1. Current envelope value fades to 0 over 2ms
2. Attack phase starts from 0 after fade completes
3. Prevents abrupt discontinuity ("double-attack" glitch)

---

## 7. Performance Features

The SUB engine supports Ræmbl's performance features for expressive sequencing.

### Accent

**Implementation:**
- Velocity multiplied by 1.5× (capped at 1.0)
- Amp attack time halved (2× faster, punchier)
- Amp decay time halved (snappier, tighter)
- Filter decay time halved (brighter, more aggressive)

**Trigger:**
Set via Factors sequencer (accent pattern generated from `accentAmt` parameter).

**Worklet Handling:**
```javascript
if (isAccented) {
  this.ampDecay = this.originalAmpDecay * 0.5;
  this.filterDecay = this.originalFilterDecay * 0.5;
} else {
  this.ampDecay = this.originalAmpDecay;
  this.filterDecay = this.originalFilterDecay;
}
```

**Classic Uses:**
- TB-303 style acid bass (accents on offbeats)
- Groove emphasis (accent downbeats)
- Dynamic variation (avoid machine-gun repetition)

### Slide

**TB-303 Style Pitch Glide:**

**Mono Mode (Classic Slide):**
- Pitch glides from previous note to current note
- Glide time: 80ms (default) or controlled by `glide` parameter
- Exponential ramp (musical pitch transition)
- Only works if previous note exists

**Poly Mode (Slide-Into Effect):**
- Note starts -0.5 semitones flat
- Slides up to correct pitch over 40ms
- Works even without previous note
- Subtle pitch bend-in effect

**Implementation (Mono Mode):**
```javascript
// AudioParam automation (main thread, NOT worklet)
const pitchParam = workletNode.parameters.get('frequency');
pitchParam.setValueAtTime(prevFreq, time);
pitchParam.exponentialRampToValueAtTime(currentFreq, time + 0.080); // 80ms
```

**Trigger:**
Set via Factors sequencer (slide pattern generated from `slideAmt` parameter).

### Trill

**Rapid Pitch Oscillation:**

Trill rapidly alternates between main note and next note in current scale (set in PATH module).

**Implementation:**
- 2-note trill on offbeats (swung 16ths)
- 3-note trill on downbeats (even 16ths)
- Pitch automation via `pitchBend` AudioParam (not worklet per-sample)

**Trigger:**
Set via Factors sequencer (trill pattern generated from `trillAmt` parameter).

**Classic Uses:**
- Acid bass ornamentation
- Melodic fills
- Expressive sequencer variation

---

## 8. PPMod Integration

All parameters marked with ✓ in the PPMod column are fully modulatable via Ræmbl's per-parameter modulation system.

### Modulatable Parameters (SUB Engine)

| Category | Parameters |
|----------|-----------|
| **Oscillator** | OCT, SUB OCT, DRIFT, GLIDE, WIDTH, PWM, MOD |
| **Mixer** | SAW, SQR, TRI, SUB, NOISE |
| **Filter** | HP, LP, RES, KEY, ENV, MOD |
| **Envelope** | A, D, S, R (both amp and filter) |
| **Mod LFO** | RATE, WAVE |

### Poly Mode PPMod

In poly mode, modulations are applied per-voice using compound keys:

```javascript
// Voice 0 modulating filter cutoff
const key = `0:filter.lowPass`;

// Voice 3 modulating saw level
const key = `3:mixer.sawLevel`;
```

**Per-Voice Phase Offsets:**
Each voice receives a phase offset to prevent unison:
```javascript
const voiceOffset = (voiceId % 8) * 0.125; // 0, 0.125, 0.25, ..., 0.875
```

**Why Per-Voice Matters:**
- Independent LFO phases prevent "supersaw" unison effect
- Envelope followers track per-voice dynamics
- Random modulation creates natural variation

### Mono Mode PPMod

In mono mode, a single global modulation key is used:
```javascript
const key = `filter.lowPass`; // No voice index prefix
```

All modulation values apply to the single mono voice.

### K-Rate Modulation

PPMod updates occur at **30 FPS** on the main thread via `requestAnimationFrame`.

**Why K-Rate:**
- Human perception of modulation changes is ~50ms
- Audio-rate would add complexity with zero perceptual benefit
- Uses `AudioParam.setValueAtTime()` for smooth transitions

**What This Means:**
- LFO/envelope modulation is smooth but not sample-accurate
- Perfect for musical modulation (filter sweeps, vibrato, tremolo)
- Not suitable for audio-rate FM (use Plaits FM engines instead)

---

## 9. Sound Design Recipes

Practical starting points for common synthesis tasks.

### Classic TB-303 Acid Bass

**Recipe:**
1. Oscillator: SAW 100%, all others 0%
2. Filter: LP 30-60%, RES 60-80%, ENV 70-90%
3. Amp Envelope: A 0%, D 20-40%, S 0%, R 5-10%
4. Filter Envelope: A 0%, D 30-50%, S 0%, R 5-10%
5. Mono mode enabled
6. Use slide and accent in Factors sequencer

**Why It Works:** Sawtooth + aggressive filter resonance + plucky envelope = classic acid. Slide creates signature glide. Accent adds dynamics.

### Warm Analogue Pad

**Recipe:**
1. Oscillator: SAW 60%, TRI 40%, SUB 30%
2. Filter: LP 60%, RES 10-20%, ENV 40%
3. Amp Envelope: A 40-60%, D 30-50%, S 70%, R 60-80%
4. Filter Envelope: A 30-50%, D 40-60%, S 50%, R 50-70%
5. Add PWM: WIDTH 50%, PWM 60%, LFO sine 0.3Hz
6. Poly mode, 8 voices

**Why It Works:** Mixed oscillators create thickness. Slow attack/release = pad texture. Subtle PWM adds movement. Moderate filter prevents harshness.

### Punchy Synth Lead

**Recipe:**
1. Oscillator: SAW 100%, SUB 20%
2. Filter: LP 70-85%, RES 30-50%, ENV 80%
3. Amp Envelope: A 0-5%, D 15-30%, S 60%, R 20-40%
4. Filter Envelope: A 0%, D 20-40%, S 30%, R 30-50%
5. Add vibrato: MOD 20%, LFO sine 5Hz
6. Mono mode

**Why It Works:** Bright saw + snappy envelope = cutting lead. Filter envelope adds "honk". Vibrato adds expressiveness.

### Sub Bass

**Recipe:**
1. Oscillator: SUB OCT 2 (−12 semitones), SUB 100%, all others 0%
2. Filter: LP 40-50% (remove highs), RES 0-10%
3. Amp Envelope: A 0%, D 30-50%, S 80%, R 30-50%
4. Filter Envelope: A 0%, D 10%, S 0%, R 10% (minimal movement)
5. Mono mode

**Why It Works:** Pure sine wave sub oscillator = clean sub-bass. Low filter cutoff removes any high frequency content. Simple envelope.

### Percussive Pluck

**Recipe:**
1. Oscillator: SAW 70%, NOISE 30%
2. Filter: LP 60-80%, RES 40-60%, ENV 90%
3. Amp Envelope: A 0%, D 30-50%, S 0%, R 10-20%
4. Filter Envelope: A 0%, D 20-40%, S 0%, R 5-15%
5. Optional: Pitch ENV via `osc.pitchMod` 50% (tom-like pitch drop)

**Why It Works:** Noise adds attack transient. Fast decay = plucky. High filter ENV creates "snap". Zero sustain = staccato.

### Detuned Supersaw

**Recipe:**
1. Oscillator: SAW 100%, all others 0%
2. Filter: LP 75-90%, RES 10-20%
3. Amp Envelope: A 20-40%, D 40-60%, S 70%, R 50-70%
4. Add drift: DRIFT 30-50%
5. Poly mode, 8 voices
6. Play chords

**Why It Works:** Multiple detuned voices (via DRIFT) create "supersaw" chorus. Poly mode stacks voices. Moderate filter keeps it warm.

---

## 10. Comparison with Plaits and Rings

### When to Use SUB Engine

**Best For:**
- Classic analogue-style sounds (bass, leads, pads)
- Learning synthesis fundamentals
- Filter sweeps and resonance effects
- CPU-efficient polyphony
- Subtractive workflow (osc → filter → env)

**Strengths:**
- Familiar subtractive synthesis paradigm
- Dual ADSR envelopes (independent amp + filter)
- 8-voice polyphony (most of the three engines)
- Lowest CPU usage
- Precise control over individual parameters

**Limitations:**
- Single synthesis type (VA subtractive only)
- No physical modelling or FM
- No multi-engine flexibility

### vs Plaits Engine

**Use Plaits When:**
- Exploring diverse synthesis techniques
- Creating complex, evolving timbres
- Percussive/physical modelling sounds
- One-knob "macro" sound design

**Use SUB When:**
- Traditional synth sounds (bass, leads, pads)
- Precise filter control needed
- Learning synthesis fundamentals
- CPU efficiency matters

### vs Rings Engine

**Use Rings When:**
- Realistic plucked/struck sounds
- Physical modelling resonances
- Sympathetic string effects
- Pitched percussion

**Use SUB When:**
- Electronic (not acoustic) timbres
- Full polyphony needed (8 vs 4 voices)
- Precise envelope control (ADSR vs decay-only)
- CPU efficiency matters

---

## 11. Technical Reference

### AudioWorklet Architecture

**File:** `merged-app/js/raembl/audio/worklets/raembl-voice-processor.js`

**Voice Pool Manager:** `merged-app/js/raembl/audio/voice.js`

**Key Components:**
- `RaemblVoiceProcessor` - AudioWorklet processor (one instance per voice)
- `voicePool` - Array of 8 pre-allocated voice nodes
- Voice allocation logic in `voice.js:allocateVoice()`

**Message Protocol:**

**Main thread → Worklet:**
```javascript
voiceNode.port.postMessage({
  type: 'noteOn',
  pitch: 60,
  velocity: 0.8,
  isAccented: false,
  drift: 0.1,
  monoMode: false
});

voiceNode.port.postMessage({ type: 'noteOff' });

voiceNode.port.postMessage({
  type: 'setOscMix',
  saw: 0.75,
  tri: 0.0,
  sq: 0.0,
  sub: 0.5,
  noise: 0.0,
  pwm: 0.5
});

voiceNode.port.postMessage({
  type: 'setEnvelope',
  target: 'amp',
  attack: 0.01,
  decay: 0.1,
  sustain: 0.7,
  release: 0.2
});

voiceNode.port.postMessage({
  type: 'setEnvelope',
  target: 'filter',
  attack: 0.01,
  decay: 0.3,
  sustain: 0.0,
  release: 0.5
});
```

**Worklet → Main thread:**
(Currently no messages sent back)

### AudioParam Descriptors

All global parameters are exposed as AudioParams for sample-accurate automation:

```javascript
{ name: 'filterCutoff', defaultValue: 1000, minValue: 20, maxValue: 20000 }
{ name: 'filterResonance', defaultValue: 1, minValue: 0.1, maxValue: 25 }
{ name: 'filterEnvAmount', defaultValue: 0, minValue: -1, maxValue: 1 }
{ name: 'keyTracking', defaultValue: 0, minValue: 0, maxValue: 1 }
{ name: 'hpfCutoff', defaultValue: 20, minValue: 20, maxValue: 10000 }
{ name: 'lfoRate', defaultValue: 4, minValue: 0.1, maxValue: 20 }
{ name: 'lfoWave', defaultValue: 0, minValue: 0, maxValue: 2 }
{ name: 'lfoToFilter', defaultValue: 0, minValue: 0, maxValue: 1 }
{ name: 'lfoToPitch', defaultValue: 0, minValue: 0, maxValue: 1 }
{ name: 'lfoToPWM', defaultValue: 0, minValue: 0, maxValue: 1 }
{ name: 'pitchEnvAmount', defaultValue: 0, minValue: 0, maxValue: 1 }
{ name: 'envToPWM', defaultValue: 0, minValue: 0, maxValue: 1 }
{ name: 'drift', defaultValue: 0, minValue: 0, maxValue: 1 }
{ name: 'glide', defaultValue: 0, minValue: 0, maxValue: 1 }
{ name: 'octaveTranspose', defaultValue: 0, minValue: -24, maxValue: 24 }
{ name: 'subOctaveTranspose', defaultValue: 0, minValue: -24, maxValue: 24 }
{ name: 'outputLevel', defaultValue: 0.5, minValue: 0, maxValue: 2 }
{ name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000 }
{ name: 'gateSignal', defaultValue: 0, minValue: 0, maxValue: 1 }
{ name: 'retriggerSignal', defaultValue: 0, minValue: 0, maxValue: 1 }
```

### Parameter Mapping

SUB parameters are stored as 0-100 in state but mapped to various ranges for the AudioWorklet processor.

| State Key | Range (State) | Range (Processor) | Mapping Function |
|-----------|---------------|-------------------|------------------|
| `mainTransposition` | 0-8 | -24 to +24 semitones | `(value - 4) * 12` |
| `subTransposition` | 0-8 | -24 to +24 semitones | `(value - 4) * 12` |
| `drift` | 0-100 | 0-1 | `value / 100` |
| `glide` | 0-100 | 0-5 seconds | `value / 100 * 5` |
| `pulseWidth` | 5-95 | 0.05-0.95 | `value / 100` |
| `sawLevel` | 0-100 | 0-1 | `value / 100` |
| `lowPass` | 0-100 | 20Hz-20kHz | `20 * 2^(value * 9.966)` |
| `resonance` | 0-100 | 0.1-25 | `0.1 + (value / 100) * 24.9` |
| `attack` | 0-100 | 0.2ms-8000ms | `0.2 * 1000^(value/100)` |

### FX Routing

SUB voices connect to the same FX chain as Plaits/Rings voices:

**Classic Mode (Reverb + Delay):**
```
Voice Node → Master Gain
         └→ Reverb Send
         └→ Delay Send
         └→ Dry Signal Tap (for sidechain)
```

**Clouds Mode:**
```
Voice Node → Clouds Input Analyser → Clouds Processor → Master
```

FX mode switching handled by `audio.js:switchFxMode()`, which reconnects all voice nodes.

### Patch Format

SUB parameters are saved in the unified patch format v1.2.0+:

```json
{
  "version": "1.2.0",
  "raembl": {
    "engineType": "subtractive",
    "mainTransposition": 4,
    "subTransposition": 2,
    "drift": 10,
    "glide": 0,
    "pulseWidth": 50,
    "pwmAmount": 0,
    "pitchMod": 0,
    "sawLevel": 75,
    "squareLevel": 0,
    "triangleLevel": 0,
    "subLevel": 50,
    "noiseLevel": 0,
    "highPass": 0,
    "lowPass": 75,
    "resonance": 20,
    "keyFollow": 0,
    "envAmount": 50,
    "filterMod": 0,
    "attack": 0,
    "decay": 25,
    "sustain": 50,
    "release": 75,
    "modLfoRate": 50,
    "modLfoWaveform": 0,
    "modulations": {
      "filter.lowPass": {
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
- Missing SUB params use defaults

---

## See Also

- **[Ræmbl User Guide](../user-guide/raembl-guide.md)** - Complete guide to Ræmbl synthesiser
- **[Plaits Engine](../engines/raembl/plaits-engine.md)** - Multi-engine synthesis (24 engines)
- **[Rings Engine](../engines/raembl/rings-engine.md)** - Physical modelling resonator
- **[PPMod System](../modulation/ppmod-overview.md)** - Per-parameter modulation
- **[Ræmbl Parameters Reference](./raembl-parameters.md)** - All Ræmbl parameters (all engines)

---

**Version:** 1.0
**Last Updated:** 2025-12-30
**Engine:** Subtractive (SUB) - Virtual analogue synthesis with PolyBLEP oscillators and TPT filters
