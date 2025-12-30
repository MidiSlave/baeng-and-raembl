# Ræmbl FX Parameters Reference

Complete parameter reference for Ræmbl's effects processing chain.

## Overview

Ræmbl features two FX modes:

- **Classic Mode** - Reverb + Delay send effects (parallel routing)
- **Clouds Mode** - Granular processor (serial insert FX)

Both modes include sidechain ducking capabilities allowing Bæng to duck Ræmbl's output.

---

## Reverb Parameters

### Signal Routing

```
Voice Output → Reverb Send → Dual Convolver → Ducking Gain → Master Out
                                                ↓
                                          Oscilloscope Tap
```

**Architecture:**
- Dual convolver crossfading (20ms transitions, eliminates clicks during parameter changes)
- Send/return topology (parallel processing)
- Sidechain ducking compatible
- Oscilloscope post-reverb waveform visualisation

### Parameters

| Parameter | Range | Default | State Key | Modulation | Description |
|-----------|-------|---------|-----------|------------|-------------|
| **SEND** | 0-100% | 25% | `reverbMix` | Yes | Send level to reverb processor |
| **PRED** | 0-100% | 10% | `preDelay` | Yes | Pre-delay time (0-200ms) |
| **DEC** | 0-100% | 70% | `reverbDecay` | Yes | Decay time (0.1-5.0s) |
| **DIFF** | 0-100% | 60% | `diffusion` | Yes | Diffusion amount (reverb density) |
| **DAMP** | 0-100% | 20% | `damping` | Yes | High-frequency damping |

### Parameter Mappings

**Pre-Delay (PRED)**
- UI: 0-100%
- Audio: 0-200ms linear
- Controls initial delay before reverb onset

**Decay (DEC)**
- UI: 0-100%
- Audio: 0.1-5.0s linear
- Controls reverb tail length
- Influences impulse response buffer size

**Diffusion (DIFF)**
- UI: 0-100%
- Audio: 0-1 normalised
- Controls envelope shape: `Math.pow(1 - t, 2.0 + (diffusion * 2))`
- Higher values = denser reverb

**Damping (DAMP)**
- UI: 0-100%
- Audio: 0-1 normalised
- Exponential high-frequency rolloff: `Math.exp(-t * damping * 5)`
- Simulates acoustic material absorption

### Implementation Notes

- Impulse response regenerated on parameter change
- Crossfading prevents clicks/pops during updates
- Active convolver index toggles between two processors
- Stereo processing (left/right channels decorrelated)

---

## Delay Parameters

### Signal Routing

```
Voice Output → Delay Send → Delay Node → Saturation → Comp Gain → Ducking Gain → Master Out
                                ↑                                        ↓
                            Feedback ←──────────────────────────────────┘
                                ↑
                         Wow + Flutter LFOs
```

**Tap System** (Visualisation Only):
```
Comp Gain → Tap[0] (0×delay) → Analyser[0]
         → Tap[1] (1×delay) → Analyser[1]
         → Tap[2] (2×delay) → Analyser[2]
         ...
```

### Parameters

| Parameter | Range | Default | State Key | Modulation | Description |
|-----------|-------|---------|-----------|------------|-------------|
| **SEND** | 0-100% | 25% | `delayMix` | Yes | Send level to delay |
| **TIME** | Sync: 12 divisions<br>Free: 1-4000ms | 50% (1/4 note) | `delayTime`<br>`delayTimeFree` | Yes | Delay time (sync or free) |
| **FDBK** | 0-100% | 40% | `feedback` | Yes | Feedback amount (max 95%) |
| **WOW** | 0-100% | 10% | `wow` | Yes | Slow pitch modulation (tape wow) |
| **FLUT** | 0-100% | 5% | `flutter` | Yes | Fast pitch modulation (tape flutter) |
| **SAT** | 0-100% | 0% | `saturation` | Yes | Waveshaper saturation |

### Sync Mode Toggle

**SYNC Button** (Active by default)
- State: `delaySyncEnabled` (boolean)
- When active: TIME parameter quantised to tempo divisions
- When inactive: TIME parameter = free-running ms

### Delay Time Divisions (Sync Mode)

12 tempo-locked divisions (shortest to longest):

| Index | Division | Label | Duration @ 120 BPM |
|-------|----------|-------|--------------------|
| 0 | 1/32 | 1/32 | 62.5 ms |
| 1 | 1/16 | 1/16 | 125 ms |
| 2 | 1/12 | 1/16T | 167 ms |
| 3 | 1/8 | 1/8 | 250 ms |
| 4 | 1/6 | 1/8T | 333 ms |
| 5 | 3/16 | 1/16D | 375 ms |
| 6 | 1/4 | 1/4 | 500 ms |
| 7 | 1/3 | 1/4T | 667 ms |
| 8 | 3/8 | 1/8D | 750 ms |
| 9 | 1/2 | 1/2 | 1000 ms |
| 10 | 3/4 | 1/4D | 1500 ms |
| 11 | 1 | 1 | 2000 ms |

**Calculation:**
```javascript
const index = Math.floor(delayTime / (100 / 12)); // Map 0-100 to 12 divisions
const division = delayDivisionsValues[index];
const bps = bpm / 60;
const delayTimeSeconds = division / bps;
```

### Free Mode Time Range

- UI: 0-100%
- Audio: 1-4000ms exponential
- Uses `mapRange()` with exponential scaling for musical feel
- Max delay node capacity: 5.0 seconds

### Wow & Flutter

**Wow** (Slow tape speed variation)
- LFO Type: Sine wave
- Frequency: 0.1-0.5 Hz (maps from wow parameter)
- Depth: 0-5ms modulation of delay time
- Formula: `depth = mapRange(wow, 0, 100, 0, 0.005)`

**Flutter** (Fast tape speed variation)
- LFO Type: Sine wave
- Frequency: 4-8 Hz (maps from flutter parameter)
- Depth: 0-1ms modulation of delay time
- Formula: `depth = mapRange(flutter, 0, 100, 0, 0.001)`

### Saturation

**Waveshaper Curve:**
```javascript
y = ((1 + k) * x) / (1 + k * |x|)
```

**k-value mapping:**
- UI: 0-100%
- k: 0-20 (cubic power curve for gradual onset)
- `k = Math.pow(satAmountNormalized, 3) * 20`

**Compensation Gain:**
- Prevents excessive level boost with feedback
- Compensates 75% of added gain from saturation
- `compensationFactor = 1.0 / (1 + k * 0.75)`

**Bypass Behaviour:**
- Saturation = 0 → Direct connection (delay → comp gain)
- Saturation > 0 → Waveshaper active (delay → saturation → comp gain)

### Visualisation

**Tap System:**
- 8 parallel delay taps for visualisation
- Tap[i] delay time = `i × actualDelayTime`
- Spacing: Logarithmic (5px-15% of canvas width based on delay time)
- Opacity decay: `Math.pow(0.6-0.995, i)` (based on feedback)
- Thickness decay: `Math.pow(0.85-0.998, i)` (based on feedback)

**Wow/Flutter Visualisation:**
- Horizontal waveform displacement
- Spatial modulation: `sin(y * freq + timeOffset) * amount`
- Thickness modulation for flutter effect

**Saturation Visualisation:**
- Horizontal spike distortion
- Line breakup using noise-based gaps
- Distortion pixels (3-5px) at break points

---

## Clouds Parameters

### Signal Routing (Serial Insert)

```
Voice Output → Input Analyser → Clouds Processor → Output Analyser → Ducking Gain → Master Out
                     ↓                                    ↓
               VU Meter (In)                       VU Meter (Out)
                                                    Buffer Visualisation
```

**Architecture:**
- Serial insert FX (replaces classic reverb/delay)
- Dual VU metering (input/output levels)
- Buffer visualisation with waveform display
- Sidechain ducking compatible

### Parameters

| Parameter | Range | Default | State Key | Modulation | Description |
|-----------|-------|---------|-----------|------------|-------------|
| **PITCH** | -24 to +24st | 0st | `cloudsPitch` | Yes | Pitch shift (-2 to +2 octaves) |
| **POS** | 0-100% | 0% | `cloudsPosition` | Yes | Grain position in buffer |
| **DENS** | 0-100% | 50% | `cloudsDensity` | Yes | Grain density/rate |
| **SIZE** | 0-100% | 0% | `cloudsSize` | Yes | Grain size/length |
| **TEX** | 0-100% | 50% | `cloudsTexture` | Yes | Grain texture/shape |
| **D/W** | 0-100% | 0% | `cloudsDryWet` | Yes | Dry/wet mix |
| **SPRD** | 0-100% | 50% | `cloudsSpread` | Yes | Stereo spread |
| **FB** | 0-100% | 0% | `cloudsFeedback` | Yes | Feedback amount |
| **VERB** | 0-100% | 30% | `cloudsReverb` | Yes | Internal reverb amount |
| **GAIN** | 0-200% | 100% | `cloudsInputGain` | Yes | Input gain/drive |

### Pitch Parameter

**Display Format:**
- Range: -24 to +24 semitones
- UI shows: `±XXst` (e.g., "+12st", "0st", "-7st")
- Zero crossing displayed as "0st"

**State Mapping:**
- UI: 0-100%
- Audio: -2 to +2 octaves
- Formula: `octaves = (stateValue / 100) * 4 - 2`
- Semitone conversion for display: `semitones = Math.round(octaves * 12)`

### Input Gain Parameter

**Display Format:**
- Range: 0-200%
- UI shows: `XXX%` (e.g., "100%", "150%", "50%")

**State Mapping:**
- UI: 0-100%
- Audio: 0-2 (linear gain multiplier)
- Formula: `gain = (stateValue / 100) * 2`

### Feedback Stability

**Critical Safety:**
- Default: 0% (prevents runaway feedback loop)
- Warning threshold: Feedback ≥90% AND Reverb ≥70%
- Console warning logged at initialisation if unsafe combination detected

**Recommended Settings:**
- Keep feedback below 80% for stable operation
- Reduce reverb when using high feedback
- Monitor output VU meter for oscillation

### Freeze Function

**Freeze Button:**
- State: `cloudsFreeze` (boolean)
- Active class: `.active`
- Sends `setFreeze` command to processor
- Captures and loops current buffer content

### Clock Sync

**Clock Sync Button:**
- Subscribes to shared clock events
- Filters to even steps only (0, 2, 4, 6...)
- Avoids swung beats (odd steps)
- Sends trigger messages to Clouds worklet

**Use Cases:**
- Rhythmic granular effects
- Tempo-synced buffer manipulation
- Triggered spectral processing

### Processing Modes

6 processing modes selectable via dropdown:

| Mode | Index | Description |
|------|-------|-------------|
| **Granular** | 0 | 64-grain engine with window morphing |
| **Pitch-Shifter** | 1 | WSOLA time-stretching without pitch change |
| **Looping Delay** | 2 | Buffer-based delay with pitch shifting |
| **Spectral** | 3 | Phase vocoder FFT processing |
| **Oliverb** | 4 | Parasites reverb mode |
| **Resonestor** | 5 | Parasites resonator mode |

**Mode Switching:**
- Sends `setMode` command to worklet
- UI updates dropdown selected text
- Mode persisted in patch format

### Quality Presets

4 quality presets affecting buffer characteristics:

| Preset | Label | Description | Settings |
|--------|-------|-------------|----------|
| 0 | HI | 16b/ST/1s | 16-bit, Stereo, 1s buffer |
| 1 | MED | 16b/MO/2s | 16-bit, Mono, 2s buffer |
| 2 | LO | 8b/ST/4s | 8-bit, Stereo, 4s buffer |
| 3 | XLO | 8b/MO/8s | 8-bit, Mono, 8s buffer |

**Quality Toggle:**
- Click to cycle through presets
- Sends commands: `setBufferQuality`, `setLofiMode`, `setMonoMode`
- Lower quality = longer buffer duration
- Trade-off: Fidelity vs. buffer size

### Buffer Visualisation

**VU Meters:**
- Input: Pre-processor RMS level
- Output: Post-processor RMS level
- Rendered inside buffer visualisation canvas
- 30 FPS animation loop

**Buffer Display:**
- Real-time waveform from processor
- Receives `bufferData` messages from worklet
- Canvas ID: `raembl-clouds-canvas` (165×60px)

---

## FX Mode Switching

### Classic Mode

**Active Effects:**
- Reverb (send/return)
- Delay (send/return)

**Signal Path:**
```
Voice → Reverb Send → Reverb → Master
     → Delay Send → Delay → Master
     → Direct → Master
```

### Clouds Mode

**Active Effects:**
- Clouds granular processor (serial insert)

**Signal Path:**
```
Voice → Clouds → Master
```

**Mode State:**
- State key: `fxMode`
- Values: `'classic'` or `'clouds'`

---

## Sidechain Ducking

### Ducking Targets

All Ræmbl FX outputs route through ducking gain nodes:

- `raemblReverb` → Reverb output ducking
- `raemblDelay` → Delay output ducking
- `raemblClouds` → Clouds output ducking

### Configuration

**Duck Button:**
- Located in each module header
- Attribute: `data-effect="raemblReverb|raemblDelay|raemblClouds"`
- Opens sidechain ducking modal

**Ducking Parameters:**
- Threshold (dB)
- Ratio (compression)
- Attack (ms)
- Release (ms)
- Per-voice trigger selection (Bæng voices)

### Implementation

**Ducking Gain Nodes:**
- Created in Bæng config: `baengConfig.duckingGains`
- Inserted before master gain
- Controlled by sidechain compressor

**Fallback:**
- If ducking not initialised → Direct connection to master
- Prevents audio routing failure

---

## Per-Parameter Modulation

All parameters marked "Modulation: Yes" support PPMod (Per-Parameter Modulation) with 6 modes:

- **LFO** - Low-frequency oscillator (Sine/Tri/Square/Saw, 0.1-20Hz)
- **RND** - LFSR-based random (4-32 bit, 0-100% probability)
- **ENV** - AD/ADSR envelope (0.2ms-8s, linear/exp/log curves)
- **EF** - Envelope follower (AnalyserNode peak detection)
- **TM** - Probabilistic step sequencer (1-16 steps, per-step probability)
- **SEQ** - CV sequencer (4-16 step pattern, clock-synced)

**Modulation Architecture:**
- K-rate updates (30 FPS via `requestAnimationFrame`)
- AudioParam automation from main thread
- No audio-rate worklet modifications

**State Storage:**
```javascript
perParamModulations: {
  'reverb.mix': {
    mode: 'LFO',
    enabled: true,
    depth: 60,      // 0-100%
    offset: 0,      // -100 to +100%
    lfoWaveform: 0, // 0=sin, 1=tri, 2=sq, 3=saw
    lfoRate: 2.5,   // Hz
    lfoSync: false,
    resetMode: 'step' // 'off'|'step'|'accent'|'bar'
  }
}
```

---

## Audio Context Parameters

### Timing Constants

```javascript
const RAMP_TIME_CONSTANT_EFFECTS = 0.01; // 10ms for general parameter changes
const REVERB_CROSSFADE_DURATION = 0.02;  // 20ms for reverb IR crossfades
```

**Why 10ms Ramps?**
- Prevents zipper noise
- Fast enough for responsive control
- Smooth parameter transitions

**Why 20ms Reverb Crossfade?**
- Eliminates clicks during IR buffer swaps
- Perceptually instant
- Dual convolver architecture requirement

### Sample Rate Considerations

**Reverb IR Length:**
```javascript
const length = Math.floor(sampleRate * decayTime);
```
- 44.1kHz @ 5s decay = 220,500 samples
- 48kHz @ 5s decay = 240,000 samples

**Delay Max Time:**
- Fixed 5.0s max (Web Audio API DelayNode limit)
- Clamps calculated delay times to 5.0s

---

## State Persistence

### Patch Save Format

**Reverb:**
```json
{
  "reverbMix": 25,
  "preDelay": 10,
  "reverbDecay": 70,
  "diffusion": 60,
  "damping": 20
}
```

**Delay:**
```json
{
  "delayMix": 25,
  "delayTime": 50,
  "delayTimeFree": 50,
  "delaySyncEnabled": true,
  "feedback": 40,
  "wow": 10,
  "flutter": 5,
  "saturation": 0
}
```

**Clouds:**
```json
{
  "cloudsPosition": 0,
  "cloudsSize": 0,
  "cloudsDensity": 50,
  "cloudsTexture": 50,
  "cloudsPitch": 50,
  "cloudsSpread": 50,
  "cloudsFeedback": 0,
  "cloudsReverb": 30,
  "cloudsDryWet": 0,
  "cloudsInputGain": 50,
  "cloudsFreeze": false,
  "fxMode": "classic"
}
```

### Modulation State

Stored in `perParamModulations` object (sparse storage):
```json
{
  "reverb.mix": {
    "mode": "LFO",
    "enabled": true,
    "depth": 60,
    "offset": 0,
    "lfoWaveform": 0,
    "lfoRate": 2.5,
    "lfoSync": false,
    "resetMode": "step"
  }
}
```

---

## Parameter ID Reference

### Reverb

- `reverb.mix` → Send level
- `reverb.preDelay` → Pre-delay time
- `reverb.decay` → Decay time
- `reverb.diffusion` → Diffusion amount
- `reverb.damping` → High-frequency damping

### Delay

- `delay.mix` → Send level
- `delay.time` → Delay time (sync/free)
- `delay.feedback` → Feedback amount
- `delay.wow` → Wow amount
- `delay.flutter` → Flutter amount
- `delay.saturation` → Saturation amount
- `delay.syncEnabled` → Sync toggle (boolean, not a fader)

### Clouds

- `clouds.pitch` → Pitch shift
- `clouds.position` → Grain position
- `clouds.density` → Grain density
- `clouds.size` → Grain size
- `clouds.texture` → Grain texture
- `clouds.dryWet` → Dry/wet mix
- `clouds.spread` → Stereo spread
- `clouds.feedback` → Feedback amount
- `clouds.reverb` → Internal reverb
- `clouds.inputGain` → Input gain

---

## Cross-References

### Related Documentation

- **[Reverb Module](../modules/reverb.md)** - Detailed reverb architecture and impulse response generation
- **[Delay Module](../modules/delay.md)** - Delay visualisation, tap system, and wow/flutter algorithms
- **[Clouds Module](../modules/clouds.md)** - Granular processing modes, buffer management, and DSP internals

### Source Files

**Reverb:**
- `/js/raembl/audio/effects.js` - Reverb initialisation and IR generation
- `/js/raembl/modules/reverb.js` - Reverb visualisation
- `/js/raembl/components/reverb.js` - Reverb UI rendering

**Delay:**
- `/js/raembl/audio/effects.js` - Delay initialisation and signal routing
- `/js/raembl/modules/delay.js` - Delay visualisation and tap rendering
- `/js/raembl/components/delay.js` - Delay UI rendering

**Clouds:**
- `/js/raembl/modules/clouds.js` - Clouds UI and parameter handling
- `/js/audio/worklets/clouds-processor.js` - AudioWorklet processor (shared with Bæng)
- `/js/raembl/modules/cloudsValidation.js` - Parameter validation

### Validation Module

**Clouds Parameter Validation:**
- Centralised validation in `cloudsValidation.js`
- Parameter schema with min/max/default values
- Stability warnings (feedback + reverb thresholds)
- UI-level, state-level, and processor-level validation layers

---

## Notes

### UK/AUS English Spellings

- Visualisation (not Visualization)
- Analysers (not Analyzers)
- Initialisation (not Initialization)
- Normalised (not Normalized)

### Development Considerations

**Reverb Crossfading:**
- Required for click-free parameter updates
- Dual convolver toggles between active/inactive indices
- Initial setup bypasses crossfade (direct buffer assignment)

**Delay Tap System:**
- Visualisation only (no audio output)
- Parallel routing from saturation comp gain
- Tap count limited by `config.maxDelayTaps` (default 8)

**Clouds Processor:**
- Shared AudioWorklet between Ræmbl and Bæng
- Cache-busting query string during development: `?v=${Date.now()}`
- Message passing for commands (setMode, setFreeze, trigger, etc.)

**Saturation Bypass:**
- Dynamic connection switching based on saturation parameter
- Prevents unnecessary processing when saturation = 0
- Comp gain remains in path for consistent routing

### Performance

**Reverb:**
- IR regeneration on every parameter change
- Crossfade prevents audible glitches
- Stereo processing doubles CPU cost

**Delay:**
- Wow/Flutter LFOs run continuously (started once)
- Tap analysers update at visualisation frame rate
- Saturation waveshaper uses 4× oversampling

**Clouds:**
- VU meters update at 30 FPS
- Buffer visualisation refresh rate depends on processor messages
- Quality presets trade fidelity for buffer duration

---

*Last Updated: 2025-12-30*
