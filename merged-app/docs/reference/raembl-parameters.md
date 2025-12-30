# Ræmbl Parameter Reference

This document provides a complete technical reference for all parameters available in the Ræmbl synthesiser engine. Each parameter is documented with its range, default value, PPMod compatibility, and description.

## Reference Format

Each parameter table includes:
- **Parameter**: UI label and internal name
- **Range**: Minimum and maximum values (0-100 unless noted)
- **Default**: Initial value on patch reset
- **PPMod**: ✓ = Modulatable via Per-Parameter Modulation system
- **Description**: Functional description and behaviour

---

## 1. Clock Parameters

Shared timing controls managed by the unified time strip (synchronised between Bæng and Ræmbl).

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **BPM** (`clock.bpm`) | 20-300 | 120 | | Master tempo in beats per minute |
| **SWING** (`clock.swing`) | 0-100 | 0 | | Swing percentage (0 = straight, 100 = maximum swing) |
| **LENGTH** (`clock.length`) | 1-128 | 4 | | Pattern length in steps |

---

## 2. Oscillator Parameters (Subtractive Engine)

Controls for the subtractive synthesis oscillator section. Active when `engineType` is set to `'subtractive'`.

**See also:** [Complete Subtractive Engine Parameter Reference](./raembl-subtractive-params.md) for detailed technical documentation including sound design recipes, voice architecture, and worklet implementation details.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **OCT** (`osc.oct`) | 0-8 | 4 | ✓ | Main oscillator octave transposition (0 = lowest, 4 = C3, 8 = highest) |
| **SUB OCT** (`osc.subOct`) | 0-8 | 2 | ✓ | Sub oscillator octave transposition (independent of main OCT) |
| **DRIFT** (`osc.drift`) | 0-100 | 10 | ✓ | Pitch instability/drift amount (emulates analogue oscillator drift) |
| **GLIDE** (`osc.glide`) | 0-100 | 0 | ✓ | Portamento time (0 = instant, 100 = 5 seconds) |
| **WIDTH** (`osc.pulseWidth`) | 5-95 | 50 | ✓ | Pulse width for square wave (5% = narrow, 50% = square, 95% = wide) |
| **PWM** (`osc.pwmAmount`) | 0-100 | 0 | ✓ | Pulse width modulation depth |
| **MOD** (`osc.pitchMod`) | 0-100 | 0 | ✓ | Pitch modulation depth (from Mod LFO) |
| **PWM Source** (`osc.pwmSource`) | 0-100 | 0 | | PWM modulation source selector |
| **Mod Source** (`osc.modSource`) | 0-100 | 0 | | Pitch modulation source selector |

---

## 3. Mixer Parameters (Subtractive Engine)

Oscillator level controls for the subtractive synthesis engine.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **◢ (SAW)** (`mixer.sawLevel`) | 0-100 | 75 | ✓ | Sawtooth oscillator level |
| **⊓ (SQR)** (`mixer.squareLevel`) | 0-100 | 0 | ✓ | Square/pulse oscillator level |
| **△ (TRI)** (`mixer.triangleLevel`) | 0-100 | 0 | ✓ | Triangle oscillator level |
| **■ (SUB)** (`mixer.subLevel`) | 0-100 | 50 | ✓ | Sub oscillator level (square wave 1-2 octaves below) |
| **≋ (NOISE)** (`mixer.noiseLevel`) | 0-100 | 0 | ✓ | White noise level |

---

## 4. Filter Parameters (Subtractive Engine)

TPT (Topology-Preserving Transform) filter controls with lowpass and highpass modes.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **HP** (`filter.highPass`) | 0-100 | 0 | ✓ | Highpass filter cutoff frequency (0 = 20Hz, 100 = 20kHz) |
| **LP** (`filter.lowPass`) | 0-100 | 75 | ✓ | Lowpass filter cutoff frequency (0 = 20Hz, 100 = 20kHz) |
| **RES** (`filter.resonance`) | 0-100 | 20 | ✓ | Filter resonance/Q factor (self-oscillates at high values) |
| **KEY** (`filter.keyFollow`) | 0-100 | 0 | ✓ | Keyboard tracking amount (0 = fixed, 100 = 1:1 note tracking) |
| **ENV** (`filter.envAmount`) | 0-100 | 50 | ✓ | Filter envelope modulation depth |
| **MOD** (`filter.mod`) | 0-100 | 0 | ✓ | Filter modulation depth (from Mod LFO) |

---

## 5. Envelope Parameters

ADSR envelope controls (applied to both amplitude and filter).

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **A** (`envelope.attack`) | 0-100 | 0 | ✓ | Attack time (0 = 0.2ms, 100 = 8 seconds) |
| **D** (`envelope.decay`) | 0-100 | 25 | ✓ | Decay time (0 = 0.2ms, 100 = 8 seconds) |
| **S** (`envelope.sustain`) | 0-100 | 50 | ✓ | Sustain level (0 = silent, 100 = full level) |
| **R** (`envelope.release`) | 0-100 | 75 | ✓ | Release time (0 = 0.2ms, 100 = 8 seconds) |

**Note**: Attack and release parameters are independent. Changes to attack do not affect release timing.

---

## 6. LFO Parameters (Main)

Primary LFO for pitch and PWM modulation in the sequencer/path section.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **AMP** (`lfo.amp`) | 0-100 | 36 | | LFO amplitude/depth |
| **FREQ** (`lfo.freq`) | 0-100 | 36 | | LFO frequency/rate |
| **WAVE** (`lfo.waveform`) | 0-100 | 0 | | LFO waveform selector (0 = sine, 25 = tri, 50 = square, 75 = saw) |
| **OFFSET** (`lfo.offset`) | -100 to +100 | 0 | | LFO DC offset (bipolar control) |

---

## 7. Mod LFO Parameters

Secondary modulation LFO for filter and oscillator modulation.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **RATE** (`modLfo.rate`) | 0-100 | 50 | ✓ | Mod LFO frequency (0 = 0.1Hz, 100 = 20Hz) |
| **WAVE** (`modLfo.waveform`) | 0-100 | 0 | ✓ | Mod LFO waveform (0 = sine, 25 = tri, 50 = square, 75 = saw, stepped) |

---

## 8. Factors (Euclidean) Parameters

Euclidean rhythm pattern generator with accent, slide, and trill controls.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **STEPS** (`factors.steps`) | 1-32 | 16 | | Total number of steps in pattern |
| **FILLS** (`factors.fills`) | 0-32 | 4 | | Number of active notes (distributed evenly via Euclidean algorithm) |
| **SHIFT** (`factors.shift`) | 0-31 | 0 | | Pattern rotation offset |
| **> (ACCENT)** (`factors.accentAmt`) | 0-16 | 0 | | Number of accented steps (1.5x velocity, snappier decay) |
| **SLIDE** (`factors.slideAmt`) | 0-16 | 0 | | Number of slide/glide steps (80ms TB-303 style portamento) |
| **TR (TRILL)** (`factors.trillAmt`) | 0-16 | 0 | | Number of trill steps (pitch oscillation to next scale degree) |
| **GATE** (`factors.gateLength`) | 5-100 | 80 | | Gate length as percentage of step duration |

**Pattern Distribution**: Accent, slide, and trill are allocated in priority order (accents first, slides second, trills third) among the filled steps.

---

## 9. Path (Pitch Sequencer) Parameters

Pitch path sequencer with scale quantisation and probability controls.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **SCALE** (`path.scale`) | 0-31 | 3 | | Scale selection (0 = Chromatic, 1 = Major, 2 = Minor, 3 = Pentatonic Major, etc.) |
| **ROOT** (`path.root`) | 0-11 | 0 | | Root note (0 = C, 1 = C#, 2 = D, ... 11 = B) |
| **PROB** (`path.probability`) | 0-100 | 100 | | Probability of pitch change occurring (100 = always, 0 = never) |

**Step Pitches**: Each sequencer step stores a pitch value (0-100). Values are quantised to the selected scale when triggered.

---

## 10. Plaits Engine Parameters

Mutable Instruments Plaits synthesis engine parameters. Active when `engineType` is set to `'plaits'`.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **MDL (Model)** (`plaits.model`) | 1-24 | 1 | ✓ | Engine selection (1-8 = GREEN, 9-16 = RED, 17-24 = ORANGE banks) |
| **HARM** (`plaits.harmonics`) | 0-100 | 50 | ✓ | Primary timbral control (harmonics/timbre parameter) |
| **TIMB** (`plaits.timbre`) | 0-100 | 50 | ✓ | Secondary timbral control (varies by engine) |
| **MORPH** (`plaits.morph`) | 0-100 | 50 | ✓ | Tertiary control/crossfade parameter (varies by engine) |
| **DEC** (`plaits.lpgDecay`) | 0-100 | 50 | ✓ | Low-Pass Gate decay time |
| **COL** (`plaits.lpgColour`) | 0-100 | 50 | ✓ | Low-Pass Gate VCA↔VCF blend (0 = VCA, 100 = VCF) |
| **MIX** (`plaits.mixOutAux`) | 0-100 | 0 | ✓ | OUT/AUX output crossfade (0 = OUT only, 100 = AUX only) |

**Engine Banks**:
- **GREEN (1-8)**: Pitched/Harmonic engines (Virtual Analog, Waveshaping, FM, Granular, Additive, Wavetable, Chord, Speech)
- **RED (9-16)**: Noise/Physical modelling engines (Swarm, Noise, Particle, String, Modal, Bass Drum, Snare Drum, Hi-Hat)
- **ORANGE (17-24)**: Classic/FM engines (VA-VCF, Phase Distortion, Six-Op FM ×3, Wave Terrain, String Machine, Chiptune)

---

## 11. Rings Engine Parameters

Mutable Instruments Rings physical modelling resonator parameters. Active when `engineType` is set to `'rings'`.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **MDL (Model)** (`rings.model`) | 0-5 | 0 | | Resonator model (0 = Modal, 1 = Sympathetic String, 2 = String, 3 = FM Voice, 4 = Sympathetic String Quantised, 5 = String+Reverb) |
| **POLY** (`rings.polyphony`) | 1, 2, or 4 | 4 | | Polyphony mode (1 = mono, 2 = 2-voice, 4 = 4-voice max) |
| **STRUC** (`rings.structure`) | 0-100 | 50 | ✓ | Inharmonicity/string coupling amount |
| **BRIT** (`rings.brightness`) | 0-100 | 50 | ✓ | High-frequency content/brightness |
| **DAMP** (`rings.damping`) | 0-100 | 50 | ✓ | Decay time/damping amount |
| **POS** (`rings.position`) | 0-100 | 25 | ✓ | Excitation position (bow/pluck point along string) |
| **STRM** (`rings.mixStrum`) | 0-100 | 50 | ✓ | Internal excitation/strum intensity |

**Resonator Models**:
- **0 - Modal**: 64-mode SVF bank resonator (bell-like tones)
- **1 - Sympathetic String**: 8 coupled strings (sitar-like)
- **2 - String**: Karplus-Strong with dispersion filter (plucked string)
- **3 - FM Voice**: FM synthesis with envelope follower
- **4 - Sympathetic String Quantised**: Quantised sympathetic strings (harmonic series)
- **5 - String and Reverb**: String model with built-in reverb

**Easter Egg**: Model 6+ unlocks "Disastrous Peace" - a 12-voice polysynth with PolyBLEP oscillators.

---

## 12. Reverb Parameters (Classic FX Mode)

Algorithmic reverb processor. Active when `fxMode` is set to `'classic'`.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **SEND** (`reverb.mix`) | 0-100 | 25 | ✓ | Reverb send level (dry/wet mix) |
| **PRED** (`reverb.preDelay`) | 0-100 | 10 | ✓ | Pre-delay time before reverb onset (0 = 0ms, 100 = 500ms) |
| **DEC** (`reverb.decay`) | 0-100 | 70 | ✓ | Reverb decay time/RT60 (0 = short, 100 = infinite) |
| **DIFF** (`reverb.diffusion`) | 0-100 | 60 | ✓ | Diffusion amount (0 = discrete echoes, 100 = smooth wash) |
| **DAMP** (`reverb.damping`) | 0-100 | 20 | ✓ | High-frequency damping (0 = bright, 100 = dark) |

---

## 13. Delay Parameters (Classic FX Mode)

Tape-style delay with wow/flutter. Active when `fxMode` is set to `'classic'`.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **SEND** (`delay.mix`) | 0-100 | 25 | ✓ | Delay send level (dry/wet mix) |
| **TIME** (`delay.time`) | 0-100 | 50 | ✓ | Delay time (SYNC mode: divisions, FREE mode: 0-2000ms) |
| **FDBK** (`delay.feedback`) | 0-100 | 40 | ✓ | Feedback amount (0 = single repeat, 100 = infinite) |
| **WOW** (`delay.wow`) | 0-100 | 10 | ✓ | Tape wow modulation depth (slow pitch variation) |
| **FLUT** (`delay.flutter`) | 0-100 | 5 | ✓ | Tape flutter modulation depth (fast pitch variation) |
| **SAT** (`delay.saturation`) | 0-100 | 0 | ✓ | Tape saturation/distortion amount |
| **SYNC Toggle** (`delay.syncEnabled`) | Boolean | true | | SYNC (clock-synced) vs FREE (millisecond) time mode |

**Sync Divisions** (when `delaySyncEnabled` is `true`): Maps TIME parameter (0-100) to musical divisions (1/64 to 2 bars).

**Free Time** (when `delaySyncEnabled` is `false`): Maps TIME parameter (0-100) to 0-2000ms.

---

## 14. Clouds Parameters (Clouds FX Mode)

Mutable Instruments Clouds granular processor. Active when `fxMode` is set to `'clouds'`. Serial insert routing (replaces classic reverb/delay).

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **PITCH** (`clouds.pitch`) | 0-100 | 50 | ✓ | Pitch shift (-2 to +2 octaves, 50 = 0 cents) |
| **POS** (`clouds.position`) | 0-100 | 0 | ✓ | Grain position in buffer (playback position) |
| **DENS** (`clouds.density`) | 0-100 | 50 | ✓ | Grain density/rate (0 = sparse, 100 = dense) |
| **SIZE** (`clouds.size`) | 0-100 | 0 | ✓ | Grain size/duration (0 = short, 100 = long) |
| **TEX** (`clouds.texture`) | 0-100 | 50 | ✓ | Grain texture/window morphing (0 = smooth, 100 = rough) |
| **D/W** (`clouds.dryWet`) | 0-100 | 0 | ✓ | Dry/wet mix (0 = 100% dry, 100 = 100% wet) |
| **SPRD** (`clouds.spread`) | 0-100 | 50 | ✓ | Stereo spread amount (0 = mono, 100 = wide stereo) |
| **FB** (`clouds.feedback`) | 0-100 | 0 | ✓ | Feedback amount (**CRITICAL**: default 0 prevents runaway) |
| **VERB** (`clouds.reverb`) | 0-100 | 30 | ✓ | Integrated reverb amount |
| **GAIN** (`clouds.inputGain`) | 0-100 | 50 | ✓ | Input gain (0 = 0%, 50 = 100%, 100 = 200%) |
| **FREEZE** (`clouds.freeze`) | Boolean | false | | Freeze buffer (stops recording, loops current buffer) |

**Playback Modes** (selected via mode switch):
- **Granular**: 64-grain engine with window morphing
- **WSOLA**: Time-stretching without pitch change
- **Looping Delay**: Buffer-based delay with pitch shifting
- **Spectral**: Phase vocoder FFT processing
- **Oliverb**: Parasites reverb mode
- **Resonestor**: Parasites resonator mode

**Stability Warning**: Feedback ≥90 AND Reverb ≥70 may cause runaway feedback. Monitor levels carefully.

---

## 15. Output Parameters

Master output controls.

| Parameter | Range | Default | PPMod | Description |
|-----------|-------|---------|-------|-------------|
| **VOL** (`output.volume`) | 0-100 | 75 | | Master output volume |

---

## 16. Per-Parameter Modulation (PPMod) Configuration

Per-parameter modulation system supporting 6 modulation modes. Any parameter marked with ✓ in the PPMod column can be modulated.

### Common Parameters (All Modes)

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `enabled` | Boolean | false | Modulation enabled/disabled |
| `depth` | 0-100 | 60 | Modulation depth percentage |
| `offset` | -100 to +100 | 0 | DC offset (bipolar) |
| `muted` | Boolean | false | Temporarily mute modulation without disabling |
| `baseValue` | 0-100 | null | Parameter's unmodulated base value (cached) |

### Mode-Specific Parameters

#### LFO Mode (`mode: 'LFO'`)

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `lfoWaveform` | 0-5 | 0 | Waveform (0 = sine, 1 = tri, 2 = square, 3 = saw, 4 = ramp, 5 = S&H) |
| `lfoRate` | 0.05-30 Hz | 2.5 | LFO frequency |
| `lfoSync` | Boolean | false | Clock-sync enabled (syncs to BPM) |
| `resetMode` | String | 'step' | Phase reset trigger ('off', 'step', 'accent', 'bar') |

#### RND Mode (`mode: 'RND'`)

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `rndBitLength` | 4-32 | 16 | LFSR shift register bit length (affects pattern complexity) |
| `rndProbability` | 0-100 | 100 | Probability of bit flip (100 = maximum randomness) |
| `rndSampleRate` | 1-1000 Hz | 100 | Sample-and-hold rate (higher = faster changes) |

#### ENV Mode (`mode: 'ENV'`)

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `envAttackMs` | 0.2-8000 ms | 10 | Attack time |
| `envReleaseMs` | 0.2-8000 ms | 200 | Release time |
| `envCurveShape` | String | 'exponential' | Envelope curve ('linear', 'exponential', 'logarithmic') |

#### EF Mode (`mode: 'EF'`)

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `efAttackMs` | 1-1000 ms | 10 | Envelope follower attack time |
| `efReleaseMs` | 1-1000 ms | 100 | Envelope follower release time |
| `efSource` | String | 'input' | Audio source to follow ('input', 'output') |

#### TM Mode (`mode: 'TM'`)

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `tmLength` | 1-16 | 8 | Pattern length in steps |
| `tmProbability` | 0-100 | 50 | Global step probability percentage |
| `tmPattern` | Array | [] | Per-step probability values (0-9, where 0 = 0%, 9 = 100%) |

#### SEQ Mode (`mode: 'SEQ'`)

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `seqLength` | 4-16 | 4 | Sequence length in steps |
| `seqPattern` | Array | [0.5, 0.5, 0.5, 0.5] | Per-step CV values (0-1 normalised) |

---

## 17. Mode Selection

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| `engineType` | String | 'subtractive' | Synthesis engine ('subtractive', 'plaits', 'rings') |
| `fxMode` | String | 'classic' | Effect routing mode ('classic' = reverb+delay, 'clouds' = granular) |
| `monoMode` | Boolean | true | Monophonic (true) vs polyphonic (false) mode |

---

## 18. Internal State (Non-Modulatable)

These parameters are used internally for sequencer and modulation state management.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `isPlaying` | Boolean | false | Transport play state |
| `currentStepIndex` | Number | -1 | Current step position in sequence |
| `factorsPatternPos` | Number | -1 | Factors pattern position |
| `displayBar`, `displayBeat`, `displayStep` | Number | 1 | Display counters for UI |
| `isBarStart` | Boolean | false | Flag indicating bar boundary |
| `resetFactorsOnBar` | Boolean | false | Reset Euclidean pattern on bar |
| `resetLfoOnBar` | Boolean | false | Reset LFO phase on bar |
| `gatePattern` | Array | [] | Computed Euclidean gate pattern |
| `accentPattern` | Array | [] | Computed accent pattern |
| `slidePattern` | Array | [] | Computed slide pattern |
| `trillPattern` | Array | [] | Computed trill pattern |
| `stepPitches` | Array | [] | Per-step pitch values (0-100) |
| `factorsAnimationMode` | String | 'animated' | Factors visualisation mode ('static'/'animated') |
| `pathAnimationMode` | String | 'animated' | Path visualisation mode ('static'/'animated') |

---

## Notes

### PPMod Polyphonic Behaviour

**Mono Mode**: Single modulation instance per parameter (global key).

**Poly Mode**: 8 independent modulation instances per parameter (per-voice keys: `${voiceId}:${paramId}`).

Voice allocation uses per-voice phase offsets to prevent unison:
```javascript
const voiceOffset = (voiceId % 8) * 0.125; // 0, 0.125, 0.25, ... 0.875
```

**Engine-Specific Handlers**:
- **Subtractive**: `applyPolyVoiceModulations()` - per-voice filter modulation
- **Plaits**: `applyPlaitsPolyVoiceModulations()` - per-voice engine param modulation
- **Rings**: No per-voice handler (internal 4-voice polyphony, modulation is global only)

### K-Rate Modulation Architecture

All PPMod updates occur at **30 FPS** on the main thread via `requestAnimationFrame`. This is a **k-rate** (control-rate) system, not audio-rate.

**Rationale**: Human perception of modulation changes is approximately 50ms. Audio-rate modulation would add significant complexity with zero perceptual benefit.

**Implementation**: Uses `AudioParam.setValueAtTime()` for smooth parameter transitions without audio-thread calculations.

### Patch Format Compatibility

**Current Version**: v1.2.0 (includes engine type + per-parameter modulations)

**Backward Compatibility**: v1.0.0 patches load without modulation data (falls back to defaults).

**Forward Compatibility**: v1.2.0 patches in older apps ignore unknown properties (graceful degradation).

---

## Related Documentation

- [Subtractive Engine Parameters](./raembl-subtractive-params.md) - Detailed SUB engine parameter reference with sound design recipes
- [Plaits Engine Guide](../engines/raembl/plaits-engine.md) - Detailed Plaits engine reference
- [Rings Engine Guide](../engines/raembl/rings-engine.md) - Detailed Rings engine reference
- [PPMod System](../modulation/ppmod-overview.md) - Per-parameter modulation system documentation
- [Clouds FX Engine](../effects/clouds.md) - Clouds granular processor documentation
- [Patch Format Specification](../developer/patch-format.md) - JSON patch structure and versioning

---

*Last Updated: 2025-12-30*
