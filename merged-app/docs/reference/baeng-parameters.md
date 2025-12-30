# Bæng Parameter Reference

Complete technical reference for all parameters in the Bæng 6-voice drum machine.

## About This Reference

This document provides comprehensive tables of every controllable parameter in Bæng. Parameters are organised by functional area with their ranges, defaults, and PPMod (per-parameter modulation) support indicated.

**Legend:**
- **Range**: Valid value range for the parameter
- **Default**: Initial/reset value
- **PPMod**: ✓ = Modulatable via PPMod system, — = Not modulatable
- **Unit**: Display unit (%, ms, Hz, semitones, etc.)

---

## 1. Transport & Timing

Global timing parameters shared between Bæng and Ræmbl.

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| BPM | 20–300 | 120 | — | bpm | Tempo (beats per minute) |
| SWING | 0–100 | 0 | — | % | Timing swing amount (0 = straight, 100 = maximum shuffle) |
| LENGTH | 1–128 | 4 | — | beats | Pattern length in quarter note beats |

**Note**: Timing parameters are managed by the shared clock system and synchronise both Bæng and Ræmbl.

---

## 2. Per-Voice Parameters

Each of Bæng's 6 voices has independent parameter sets. The available parameters depend on the selected engine.

### 2.1 Engine Selection

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| engine | String enum | See defaults | Synthesis engine type |

**Available Engines:**
- **aKICK** — Analog kick drum (808-style)
- **aSNARE** — Analog snare drum (808-style)
- **aHIHAT** — Analog hi-hat (closed)
- **DX7** — 6-operator FM synthesis (Yamaha DX7)
- **SAMPLE** — Sample player with independent per-voice banks
- **SLICE** — Slice player (loops, breaks)

**Default Engine Assignment:**
- Voice 1 (T1): aKICK
- Voice 2 (T2): aSNARE
- Voice 3 (T3): aHIHAT
- Voice 4 (T4): DX7
- Voice 5 (T5): SAMPLE
- Voice 6 (T6): SLICE

### 2.2 Macro Controls (All Engines)

Macro controls provide unified parameter access across different engines. The macro mapping changes based on the selected engine.

#### 2.2.1 Analog Engine Macros (aKICK, aSNARE, aHIHAT)

| Macro | Range | Default | PPMod | Description |
|-------|-------|---------|-------|-------------|
| PATCH | 0–100 | 50 | ✓ | Engine-specific timbral control |
| DEPTH | 0–100 | 50 | ✓ | Engine-specific modulation depth |
| RATE | 0–100 | 50 | ✓ | Engine-specific envelope/time control |
| PITCH | 0–100 | 50 | ✓ | Pitch/tuning control |

**aKICK Macro Mappings:**
- PATCH → analogKickTone (pitch character)
- DEPTH → analogKickDecay (envelope length)
- RATE → analogKickSweep (pitch envelope amount)
- PITCH → Fundamental frequency

**aSNARE Macro Mappings:**
- PATCH → analogSnareTone (noise/tone balance)
- DEPTH → analogSnareDecay (envelope length)
- RATE → analogSnareSnap (attack transient)
- PITCH → Fundamental frequency

**aHIHAT Macro Mappings:**
- PATCH → analogHihatMetal (metallic character)
- DEPTH → analogHihatDecay (envelope length)
- RATE → analogHihatBright (high-frequency content)
- PITCH → Fundamental frequency

#### 2.2.2 DX7 Engine Macros

| Macro | Range | Default | PPMod | Description |
|-------|-------|---------|-------|-------------|
| PATCH | 0–100 | 0 | ✓ | Patch index (0–31 within current bank) |
| DEPTH | 0–100 | 50 | ✓ | Operator volume scaling |
| RATE | 0–100 | 50 | ✓ | Envelope time scaling |
| PITCH | 0–100 | 50 | ✓ | Transpose (-24 to +24 semitones) |

#### 2.2.3 Sample Engine Macros

| Macro | Range | Default | PPMod | Description |
|-------|-------|---------|-------|-------------|
| PATCH | 0–100 | 0 | ✓ | Sample index within loaded bank |
| DEPTH | 0–100 | 100 | ✓ | Decay time (10–110% of sample length) |
| RATE | 0–100 | 50 | ✓ | Filter cutoff frequency |
| PITCH | 0–100 | 50 | ✓ | Playback pitch (-24 to +24 semitones) |

#### 2.2.4 Slice Engine Macros

| Macro | Range | Default | PPMod | Description |
|-------|-------|---------|-------|-------------|
| PATCH | 0–100 | 0 | ✓ | Slice index within loaded buffer |
| DEPTH | 0–100 | 100 | ✓ | Decay time (10–110% of slice length) |
| RATE | 0–100 | 50 | ✓ | Filter cutoff frequency |
| PITCH | 0–100 | 50 | ✓ | Playback pitch (-24 to +24 semitones) |

**Note**: SLICE decay is calculated as a percentage of slice duration, not absolute time. This ensures decay scales proportionally with slice length and playback rate.

### 2.3 Voice Processing & Routing

Per-voice output processing and effects routing.

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| LEVEL | 0–100 | Varies | ✓ | % | Voice output level |
| PAN | 0–100 | 50 | ✓ | L/R | Stereo pan position (0 = hard L, 50 = centre, 100 = hard R) |
| GATE | 0–100 | 80 | ✓ | % | Note duration (0 = instant, 100 = full step; 100% enables slide for DX7 mono mode) |
| CHOKE | 0–4 | Varies | ✓ | — | Choke group (0 = none, 1–4 = mutual choke groups) |
| BIT | 0–100 | 0 | ✓ | — | Bit reduction amount (0 = clean, 100 = extreme degradation) |
| DRIVE | 0–100 | 0 | ✓ | — | Saturation/distortion amount |

**Default LEVEL by voice:**
- T1 (Kick): 85
- T2 (Snare): 75
- T3 (Hi-hat): 70
- T4 (DX7): 75
- T5 (Sample): 100
- T6 (Slice): 100

**Default CHOKE by voice:**
- T1: Group 1 (kick self-choke)
- T2: None (0)
- T3: Group 2 (hi-hat choke)
- T4–T6: None (0)

### 2.4 Effects Sends

Per-voice send amounts to global effects processors.

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| RVB | 0–100 | 0 | ✓ | % | Reverb send amount |
| DLY | 0–100 | 0 | ✓ | % | Delay send amount |
| CLOUD | 0–100 | 0 | ✓ | % | Clouds FX send amount (when fxMode = 'clouds') |

**Note**: Global reverb/delay mix parameters are fixed at 100% — per-voice sends control the amount of signal routed to effects.

### 2.5 Analog Engine-Specific Parameters

#### 2.5.1 aKICK (Analog Kick)

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| analogKickTone | 0–100 | 50 | Via PATCH | Pitch character/timbre |
| analogKickDecay | 0–100 | 50 | Via DEPTH | Envelope decay time |
| analogKickSweep | 0–100 | 50 | Via RATE | Pitch envelope sweep amount |
| outputMode | OUT/AUX | OUT | — | 808-style (OUT) vs 909-style (AUX) routing |

#### 2.5.2 aSNARE (Analog Snare)

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| analogSnareTone | 0–100 | 40 | Via PATCH | Noise/tone balance |
| analogSnareDecay | 0–100 | 60 | Via DEPTH | Envelope decay time |
| analogSnareSnap | 0–100 | 40 | Via RATE | Attack transient sharpness |
| outputMode | OUT/AUX | OUT | — | 808-style (OUT) vs 909-style (AUX) routing |

#### 2.5.3 aHIHAT (Analog Hi-Hat)

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| analogHihatMetal | 0–100 | 30 | Via PATCH | Metallic character |
| analogHihatDecay | 0–100 | 10 | Via DEPTH | Envelope decay time |
| analogHihatBright | 0–100 | 60 | Via RATE | High-frequency brightness |
| outputMode | OUT/AUX | OUT | — | Standard (OUT) vs metallic (AUX) routing |

### 2.6 DX7 Engine-Specific Parameters

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| dx7Patch | Object | null | — | — | Full DX7 patch data (parsed SysEx) |
| dx7PatchName | String | — | — | — | Display name of loaded patch |
| dx7PatchIndex | 0–31 | null | ✓ | — | Patch position within bank |
| dx7Algorithm | 1–32 | 1 | — | — | FM algorithm (operator routing topology) |
| dx7Feedback | 0–7 | 0 | — | — | Operator 6 feedback amount |
| dx7Transpose | -24 to +24 | 0 | Via PITCH | semitones | Coarse pitch adjustment |
| dx7FineTune | -100 to +100 | 0 | — | cents | Fine pitch adjustment (±1 semitone) |
| dx7EnvTimeScale | 0.1–10.0 | 1.0 | Via RATE | × | Global envelope time multiplier |
| dx7PitchEnvDepth | 0–100 | 0 | — | — | Pitch envelope modulation depth |
| dx7AttackScale | 0.1–10.0 | 1.0 | — | × | Attack time multiplier |
| dx7ReleaseScale | 0.1–10.0 | 1.0 | — | × | Release time multiplier |
| dx7BankSize | 1–128 | 0 | — | — | Total patches in loaded bank |
| dx7Bank | Array | null | — | — | Per-voice bank copy (for independent banks) |
| dx7BankName | String | null | — | — | Loaded bank filename |
| polyphonyMode | 0–8 | 0 | — | voices | Polyphony (0 = mono, 1–8 = poly) |

**DX7 Macro Integration:**
- PATCH macro: Cycles through patches (0–31 via dx7PatchIndex)
- DEPTH macro: Scales operator output levels
- RATE macro: Scales envelope times (via dx7EnvTimeScale)
- PITCH macro: Transpose (-24 to +24 semitones via dx7Transpose)

**Note**: When GATE = 100% in mono mode (polyphonyMode = 0), slide/portamento is enabled between notes.

### 2.7 Sample Engine-Specific Parameters

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| sampleIndex | 0–127 | 0 | Via PATCH | — | Sample position within bank |
| samplerDecay | 0–100 | 100 | Via DEPTH | % | Decay envelope (10–110% of sample length) |
| samplerFilter | 0–100 | 50 | Via RATE | — | Lowpass filter cutoff frequency |
| samplerPitch | -24 to +24 | 0 | Via PITCH | semitones | Playback pitch shift |
| samplerBank | String | null | — | — | Loaded bank name (display) |
| samplerBuffer | Array | null | — | — | Array of {name, buffer} audio buffers |
| samplerManifest | Object | null | — | — | Full kit manifest with metadata |
| polyphonyMode | 0–8 | 0 | — | voices | Polyphony (0 = mono, 1–8 = poly) |

**Per-Voice Sample Banks**: Each voice can load an independent sample bank, following the same pattern as SLICE voices.

### 2.8 Slice Engine-Specific Parameters

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| sliceIndex | 0–N | 0 | Via PATCH | — | Slice position within buffer |
| sliceConfig | Object | null | — | — | Slice metadata (markers, BPM, etc.) |
| sliceBuffer | AudioBuffer | null | — | — | Full source audio buffer |
| samplerDecay | 0–100 | 100 | Via DEPTH | % | Decay envelope (10–110% of slice length) |
| samplerFilter | 0–100 | 50 | Via RATE | — | Lowpass filter cutoff frequency |
| samplerPitch | -24 to +24 | 0 | Via PITCH | semitones | Playback pitch shift |
| polyphonyMode | 0–8 | 0 | — | voices | Polyphony (0 = mono, 1–8 = poly) |

**SLICE Decay Behaviour**: Decay is calculated as percentage of slice duration (not absolute time), ensuring proportional scaling with slice length and playback rate.

---

## 3. Sequence Parameters

Each voice has a 64-step sequence with per-step parameters. Active length is controlled by euclidean.steps.

### 3.1 Per-Step Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| gate | Boolean | false | Step active/inactive |
| accent | 0–15 | 0 | Accent level (boosts velocity) |
| ratchet | 0–7 | 0 | Ratchet count (0 = single trigger, 1–7 = 2–8 triggers) |
| probability | 0–100 | 100 | Trigger probability (%) |
| deviation | 0–100 | 0 | Timing deviation amount (%) |
| deviationMode | 0–2 | 1 | Deviation direction (0 = Early, 1 = Late, 2 = Both) |

**Step Array**: Each sequence contains 64 step objects (sequences[voiceIndex].steps[0–63]), though only the first `euclidean.steps` are active.

### 3.2 Voice Sequence Parameters

Per-voice sequence-level controls.

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| length | 1–64 | 16 | — | steps | Sequence length (set by euclidean.steps) |
| probability | 0–100 | 100 | ✓ | % | Voice-wide probability multiplier |
| currentStep | -1 to 63 | -1 | — | — | Currently playing step index |

---

## 4. Euclidean Pattern Generator

Per-voice Euclidean pattern controls for algorithmic rhythm generation.

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| STEPS | 1–16 | 16 | ✓ | steps | Pattern length (total steps) |
| FILLS | 0–16 | 0 | ✓ | steps | Active pulses distributed across pattern |
| SHIFT | 0–15 | 0 | ✓ | steps | Pattern rotation/offset |
| ACCENT | 0–16 | 0 | ✓ | steps | Number of accented steps |
| FLAM | 0–16 | 0 | ✓ | steps | Number of flammed steps (double-strike) |
| RATCHET | 0–16 | 0 | ✓ | steps | Number of ratcheted steps |
| R-SPD | 1–8 | 1 | ✓ | — | Ratchet speed multiplier (1 = double, 8 = 9× triggers) |
| DEV | 0–100 | 0 | ✓ | % | Deviation amount for accented steps |

**Euclidean Algorithm**: Distributes FILLS pulses as evenly as possible across STEPS positions using Bresenham's line algorithm, then rotates by SHIFT amount.

---

## 5. Global Effects

### 5.1 FX Mode Selection

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| fxMode | classic, clouds | classic | Effects routing mode |

**Classic Mode**: Traditional reverb + delay send/return architecture
**Clouds Mode**: Granular processor replaces reverb/delay

### 5.2 Reverb (Classic Mode)

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| MIX | — | 100 | — | % | Fixed at 100% (per-voice sends control amount) |
| DEC | 0–100 | 50 | ✓ | — | Decay time/tail length |
| DAMP | 0–100 | 50 | ✓ | — | High-frequency damping (0 = bright, 100 = dark) |
| DIFF | 0–100 | 60 | ✓ | — | Diffusion (impulse density/complexity) |
| PRED | 0–100 | 10 | ✓ | ms | Pre-delay time (early reflections, 0–200ms) |

### 5.3 Delay (Classic Mode)

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| MIX | — | 100 | — | % | Fixed at 100% (per-voice sends control amount) |
| TIME | 0–100 | 25 | ✓ | — | Delay time (sync mode: beat divisions, free mode: ms) |
| FDBK | 0–100 | 0 | ✓ | % | Feedback amount |
| SYNC | Boolean | true | — | — | Clock-sync vs free-running time |
| TIME (Free) | 1–4000 | 50 | ✓ | ms | Delay time in free mode |
| WOW | 0–100 | 10 | ✓ | — | Tape-style wow (slow pitch fluctuation) |
| FLUT | 0–100 | 5 | ✓ | — | Tape-style flutter (fast pitch fluctuation) |
| SAT | 0–100 | 0 | ✓ | — | Tape saturation/distortion |
| FILT | 0–100 | 50 | ✓ | — | Filter cutoff (50 = no filter, <50 = lowpass, >50 = highpass) |

### 5.4 Clouds Granular FX (Clouds Mode)

Full Mutable Instruments Clouds port with 6 playback modes (4 original + 2 Parasites).

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| MODE | 0–5 | 0 | — | — | Playback mode (see table below) |
| QUAL | 0–3 | 0 | — | — | Quality preset (0 = HI, 1 = MED, 2 = LO, 3 = XLO) |
| POS | 0–100 | 50 | ✓ | — | Buffer read position |
| SIZE | 0–100 | 50 | ✓ | — | Grain size/window length |
| DENS | 0–100 | 50 | ✓ | — | Grain density/trigger rate |
| TEX | 0–100 | 50 | ✓ | — | Grain texture/shape morphing |
| PITCH | 0–100 | 50 | ✓ | semitones | Pitch shift (-24 to +24 semitones, 50 = 0) |
| SPRD | 0–100 | 0 | ✓ | — | Stereo spread amount |
| FB | 0–100 | 0 | ✓ | % | Feedback amount (CRITICAL: default 0) |
| VERB | 0–100 | 0 | ✓ | — | Internal reverb amount (CRITICAL with FB) |
| D/W | 0–100 | 0 | ✓ | % | Dry/wet mix |
| IN | 0–100 | 50 | ✓ | % | Input gain (50 = 100%, 0–200% range) |
| FREEZE | Boolean | false | — | — | Freeze buffer toggle |

**Clouds Modes:**

| Index | Mode | Description |
|-------|------|-------------|
| 0 | Granular | 64-grain engine with window morphing |
| 1 | WSOLA | Time-stretching without pitch change |
| 2 | Looping Delay | Buffer-based delay with pitch shifting |
| 3 | Spectral | Phase vocoder FFT processing |
| 4 | Oliverb | Parasites reverb mode |
| 5 | Resonestor | Parasites resonator mode |

**Quality Presets:**
- HI (0): Full resolution, lowest latency
- MED (1): Balanced quality/performance
- LO (2): Lower resolution, faster processing
- XLO (3): Minimal quality, maximum performance

**Critical Stability Warning**:
- Feedback must default to 0 to prevent runaway feedback loops
- Warn if FB ≥ 90 AND VERB ≥ 70 (unstable combination)

---

## 6. Drum Bus (Master Processing)

Ableton Drum Buss-inspired master bus processor. Signal chain: Input → Drive → Crunch → Transients → Boom → Compressor → Dampen → Dry/Wet → Output.

| Parameter | Range | Default | PPMod | Unit | Description |
|-----------|-------|---------|-------|------|-------------|
| TRIM | 0–100 | 50 | — | dB | Input gain (-12 to +12dB, 50 = 0dB) |
| DRIVE | 0–100 | 0 | — | — | Waveshaper saturation amount |
| Drive Type | 0–2 | 0 | — | — | Saturation mode (0 = SOFT, 1 = MED, 2 = HARD) |
| CRUNCH | 0–100 | 0 | — | — | Mid-high frequency saturation |
| TRANS | 0–100 | 50 | — | — | Transient shaping (0 = less, 50 = neutral, 100 = more) |
| BOOM | 0–100 | 0 | — | — | Sub-bass sine generator amount |
| FREQ | 0–100 | 33 | — | Hz | Boom frequency (30–90Hz, 33 ≈ 50Hz) |
| DECAY | 0–100 | 50 | — | — | Boom envelope decay time |
| COMP | Boolean | false | — | — | Compressor enable/disable |
| DAMP | 0–100 | 100 | — | Hz | Dampen filter cutoff (500Hz–30kHz, 100 = 30kHz/no filtering) |
| D/W | 0–100 | 100 | — | % | Dry/wet parallel blend (100 = fully wet) |
| OUT | 0–100 | 75 | — | dB | Output gain (-12 to +12dB, 50 = 0dB, 75 ≈ +6dB) |

**Boom Generator**: Sine wave triggered by transient detection, adds sub-bass weight to kick/snare hits.

---

## 7. Sidechain Ducking

Compressor-based ducking allowing Bæng voices to duck effects (both Bæng and Ræmbl).

### 7.1 Duckable Targets

Each target has independent configuration:

- **baengReverb** — Bæng reverb bus
- **baengDelay** — Bæng delay bus
- **baengClouds** — Bæng Clouds FX bus
- **raemblReverb** — Ræmbl reverb bus
- **raemblDelay** — Ræmbl delay bus
- **raemblClouds** — Ræmbl Clouds FX bus

### 7.2 Per-Target Parameters

| Parameter | Range | Default | Unit | Description |
|-----------|-------|---------|------|-------------|
| enabled | Boolean | false | — | Enable ducking for this target |
| voices | Boolean[6] | [T, F, F, F, F, F] | — | Per-voice trigger enable (T1–T6) |
| threshold | 0–100 | 30 | — | Ducking threshold |
| ratio | 0–100 | 80 | — | Compression ratio |
| attack | 0–100 | 10 | ms | Attack time |
| release | 0–100 | 40 | ms | Release time |
| range | 0–100 | 60 | dB | Maximum gain reduction |

**Default Configuration**: Only T1 (kick) triggers ducking by default on all targets.

---

## 8. Scale Quantisation

Global scale quantisation system for DX7 PPMod pitch modulation.

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| scaleQuantizeEnabled | Boolean | false | Enable/disable scale quantisation |
| globalScale | 0–32 | 0 | Scale index (0 = Chromatic) |
| globalRoot | 0–11 | 0 | Root note (0 = C, 1 = C♯, ..., 11 = B) |

**Purpose**: When enabled, PPMod pitch modulation on DX7 voices is quantised to stay within the selected scale, preventing out-of-scale notes.

---

## 9. PPMod Configuration Structure

Per-parameter modulation system supporting 6 modes. Configuration stored in `perParamModulations` object keyed by paramId.

### 9.1 Common Parameters (All Modes)

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| mode | String enum | 'LFO' | Modulation mode (LFO, RND, ENV, EF, TM, SEQ) |
| enabled | Boolean | false | Enable/disable modulation |
| depth | 0–100 | 50 | Modulation depth (%) |
| offset | -100 to +100 | 0 | Modulation offset (%) |
| muted | Boolean | false | Temporary mute (preserves config) |
| baseValue | Number | null | Stored base value (global params) |
| baseValues | Array[6] | [] | Per-voice base values (voice params) |

### 9.2 Mode-Specific Parameters

#### 9.2.1 LFO Mode

| Parameter | Range | Default | Unit | Description |
|-----------|-------|---------|------|-------------|
| lfoWaveform | 0–5 | 0 | — | Waveform (0 = sine, 1 = tri, 2 = square, 3 = saw, 4 = ramp, 5 = S&H) |
| lfoRate | 0.05–30.0 | 1.0 | Hz | LFO frequency |
| lfoSync | Boolean | false | — | Sync to clock (beat divisions) |
| resetMode | String enum | 'off' | — | Reset trigger ('off', 'step', 'accent', 'bar' for voice params) |
| triggerSource | String enum | 'none' | — | Trigger source ('none', 'T1'–'T6', 'sum' for effect params) |

#### 9.2.2 RND Mode (Random)

| Parameter | Range | Default | Unit | Description |
|-----------|-------|---------|------|-------------|
| rndBitLength | 4, 8, 16, 32 | 16 | bits | LFSR shift register length |
| rndProbability | 0–100 | 100 | % | Bit flip probability |
| rndSampleRate | 100–10000 | 1000 | Hz | Update rate |

#### 9.2.3 ENV Mode (Envelope)

| Parameter | Range | Default | Unit | Description |
|-----------|-------|---------|------|-------------|
| envAttackMs | 0.2–8000 | 10 | ms | Attack time |
| envReleaseMs | 0.2–8000 | 200 | ms | Release/decay time |
| envCurveShape | String enum | 'exponential' | — | Curve type ('linear', 'exponential', 'logarithmic', 'sCurve') |
| envSource | String enum | 'noteOn' | — | Trigger source ('noteOn', 'filter', 'amp', 'manual') |

#### 9.2.4 EF Mode (Envelope Follower)

| Parameter | Range | Default | Unit | Description |
|-----------|-------|---------|------|-------------|
| efAttackMs | 1–1000 | 10 | ms | Follower attack time |
| efReleaseMs | 1–1000 | 100 | ms | Follower release time |
| efSource | String enum | 'input' | — | Analysis source ('input', 'filter', 'amp') |

#### 9.2.5 TM Mode (Turing Machine)

| Parameter | Range | Default | Unit | Description |
|-----------|-------|---------|------|-------------|
| tmLength | 1–16 | 8 | steps | Pattern length |
| tmProbability | 0–100 | 50 | % | Mutation probability |
| tmPattern | Array | [] | — | Current pattern values |
| tmLfsrState | Object | null | — | LFSR state for determinism |

#### 9.2.6 SEQ Mode (Step Sequencer)

| Parameter | Range | Default | Unit | Description |
|-----------|-------|---------|------|-------------|
| seqLength | 1–16 | 4 | steps | Pattern length |
| seqPattern | Array | [0.5, ...] | — | Step values (0–1) |

### 9.3 Per-Voice PPMod (Bæng-Specific)

For voice parameters, PPMod configs can have per-voice settings:

```javascript
perParamModulations['voice.macroPitch'] = {
    mode: 'LFO',
    isVoiceParam: true,
    voices: [
        { enabled: true, depth: 50, waveform: 0, rate: 2.0, ... }, // T1
        { enabled: false, ... }, // T2
        // ... T3–T6
    ]
}
```

**Per-Voice State Tracking**: Phase accumulators, S&H values, and pattern positions use compound keys: `${voiceIndex}:${paramId}`

---

## 10. Edit Modes & UI State

Application-level edit mode state (not audio parameters).

| State | Values | Default | Description |
|-------|--------|---------|-------------|
| editMode | 'edit', 'select' | 'edit' | Primary edit mode |
| tempEditMode | String/null | null | Temporary mode for key interactions (R, /, N) |
| isDragging | Boolean | false | User currently dragging a control |
| selectedVoice | 0–5 | 0 | Currently selected voice (T1–T6) |
| isPlaying | Boolean | false | Transport playing state |
| resetSequenceOnBar | Boolean | true | Reset sequence position on bar boundary |

---

## Appendix A: Parameter Path Reference

All parameters use dot-notation paths in state object:

**Timing**: `bpm`, `swing`, `barLength`

**Voice Parameters**: `voices[0–5].{paramName}`
- Example: `voices[0].macroPitch`

**Sequence Parameters**: `sequences[0–5].{paramName}`
- Example: `sequences[2].probability`

**Euclidean Parameters**: `sequences[0–5].euclidean.{paramName}`
- Example: `sequences[1].euclidean.fills`

**Step Parameters**: `sequences[0–5].steps[0–63].{paramName}`
- Example: `sequences[3].steps[8].accent`

**Global Effects**: `{effectParamName}`
- Example: `reverbDecay`, `delayFeedback`, `cloudsPitch`

**Drum Bus**: `drumBus.{paramName}`
- Example: `drumBus.driveAmount`

**Sidechain**: `sidechain.{targetName}.{paramName}`
- Example: `sidechain.baengReverb.threshold`

---

## Appendix B: PPMod Modulatable Parameters

Complete list of parameters supporting PPMod (indicated by `modulatable: true` in parameterDefinitions):

### Voice Parameters (Per-Voice PPMod)
- All macro controls (PATCH, DEPTH, RATE, PITCH or COLOR, SHAPE, DECAY, SWEEP, CONTOUR, PITCH)
- LEVEL, PAN, GATE, CHOKE
- BIT, DRIVE
- RVB, DLY, CLOUD (effect sends)
- dx7PatchIndex (cycles through patches)
- samplerDecay, samplerFilter (SAMPLE engine)

### Sequence Parameters (Per-Voice PPMod)
- probability
- All Euclidean params (STEPS, FILLS, SHIFT, ACCENT, FLAM, RATCHET, R-SPD, DEV)

### Effect Parameters (Global PPMod with Trigger Source Selection)
**Reverb:**
- DEC, DAMP, DIFF, PRED

**Delay:**
- TIME, FDBK, WOW, FLUT, SAT, FILT

**Clouds:**
- POS, SIZE, DENS, TEX, PITCH, SPRD, FB, VERB, D/W, IN

**Note**: Effect parameters support `triggerSource` selection ('none', 'T1'–'T6', 'sum') for envelope/gate-based modulation.

---

## Appendix C: Engine-Macro Mapping Table

Quick reference for how macros map to engine-specific parameters.

| Engine | PATCH → | DEPTH → | RATE → | PITCH → |
|--------|---------|---------|--------|---------|
| **aKICK** | analogKickTone | analogKickDecay | analogKickSweep | Frequency |
| **aSNARE** | analogSnareTone | analogSnareDecay | analogSnareSnap | Frequency |
| **aHIHAT** | analogHihatMetal | analogHihatDecay | analogHihatBright | Frequency |
| **DX7** | dx7PatchIndex (0–31) | Operator volume | dx7EnvTimeScale | dx7Transpose |
| **SAMPLE** | sampleIndex | samplerDecay | samplerFilter | samplerPitch |
| **SLICE** | sliceIndex | samplerDecay (% of slice) | samplerFilter | samplerPitch |

---

## Appendix D: Default Voice Configurations

Complete default state for all 6 voices as initialised in state.js:

```javascript
// Voice 1 (T1): Analog Kick
{
    engine: 'aKICK', outputMode: 'OUT', polyphonyMode: 0,
    macroPatch: 50, macroDepth: 50, macroRate: 50, macroPitch: 50,
    analogKickTone: 50, analogKickDecay: 50, analogKickSweep: 50,
    gate: 80, pan: 50, level: 85, bitReduction: 0, drive: 0, chokeGroup: 1,
    muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
}

// Voice 2 (T2): Analog Snare
{
    engine: 'aSNARE', outputMode: 'OUT', polyphonyMode: 0,
    macroPatch: 40, macroDepth: 60, macroRate: 40, macroPitch: 50,
    analogSnareTone: 40, analogSnareDecay: 60, analogSnareSnap: 40,
    gate: 80, pan: 50, level: 75, bitReduction: 0, drive: 20, chokeGroup: 0,
    muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
}

// Voice 3 (T3): Analog Hi-Hat
{
    engine: 'aHIHAT', outputMode: 'OUT', polyphonyMode: 0,
    macroPatch: 30, macroDepth: 10, macroRate: 60, macroPitch: 50,
    analogHihatMetal: 30, analogHihatDecay: 10, analogHihatBright: 60,
    gate: 80, pan: 50, level: 70, bitReduction: 0, drive: 0, chokeGroup: 2,
    muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
}

// Voice 4 (T4): DX7 FM Synth
{
    engine: 'DX7', polyphonyMode: 0,
    macroPatch: 0, macroDepth: 50, macroRate: 50, macroPitch: 50,
    dx7Patch: null, dx7Algorithm: 1, dx7Feedback: 0, dx7Transpose: 0, dx7FineTune: 0,
    dx7EnvTimeScale: 1.0, dx7PitchEnvDepth: 0, dx7AttackScale: 1.0, dx7ReleaseScale: 1.0,
    gate: 80, pan: 50, level: 75, bitReduction: 0, drive: 0, chokeGroup: 0,
    muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
}

// Voice 5 (T5): Sample Player
{
    engine: 'SAMPLE', polyphonyMode: 0,
    macroPatch: 0, macroDepth: 100, macroRate: 50, macroPitch: 50,
    sampleIndex: 0, samplerDecay: 100, samplerFilter: 50, samplerPitch: 0,
    samplerBank: null, samplerBuffer: null, samplerManifest: null,
    gate: 80, pan: 50, level: 100, bitReduction: 0, drive: 0, chokeGroup: 0,
    muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
}

// Voice 6 (T6): Slice Player
{
    engine: 'SLICE', polyphonyMode: 0,
    macroPatch: 0, macroDepth: 100, macroRate: 50, macroPitch: 50,
    sliceIndex: 0, sliceConfig: null, sliceBuffer: null,
    samplerDecay: 100, samplerFilter: 50, samplerPitch: 0,
    gate: 80, pan: 50, level: 100, bitReduction: 0, drive: 0, chokeGroup: 0,
    muted: false, reverbSend: 0, delaySend: 0, cloudsSend: 0
}
```

---

**Document Version**: 1.0.0
**Last Updated**: 2025-12-30
**Bæng Version**: 1.2.0
