# SMPL Sample Playback Engine

Complete guide to the SMPL (Sample) playback engine in Bæng, featuring per-voice sample bank loading, pitch-shifting playback, and integrated filtering.

---

## Table of Contents

1. [Overview](#overview)
2. [Bank Selection](#bank-selection)
3. [Playback Parameters](#playback-parameters)
4. [Sample Library](#sample-library)
5. [Performance Considerations](#performance-considerations)
6. [PPMod Integration](#ppmod-integration)
7. [Tips and Techniques](#tips-and-techniques)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The SMPL engine provides authentic drum machine sample playback with pitch-shifting, filtering, and decay envelope control. Each of Bæng's 6 voices can load an independent sample bank, allowing you to build custom drum kits from factory sounds or your own samples.

### Key Features

- **Per-Voice Sample Banks** - Each voice loads an independent kit (up to 128 samples)
- **20 Factory Kits** - Classic drum machines (TR-808, TR-909, LinnDrum, etc.)
- **Pitch-Shifting** - Transpose samples ±24 semitones via playback rate
- **Filter Control** - Lowpass/highpass filter with centre-detent (50 = bypass)
- **Decay Envelope** - Amplitude envelope for controlling sample length
- **Anti-Click Fadeout** - Short fadeout at sample end prevents clicks
- **PPMod Support** - Per-parameter modulation for all controls
- **Drag & Drop Loading** - Load custom samples via file drag & drop

### Use Cases

- **Classic Drum Kits** - Authentic emulation of vintage machines (808, 909, LinnDrum)
- **Custom Kits** - Build unique drum kits from your own samples
- **Pitched Samples** - Create melodic percussion via pitch modulation
- **Layered Sounds** - Combine SMPL voices with Analog/DX7 engines

---

## Bank Selection

### Factory Banks

Bæng includes 20 factory sample banks organised by drum machine:

| Bank | Description | Sample Count |
|------|-------------|--------------|
| **TR-808** | Roland TR-808 Rhythm Composer | 11 |
| **TR-909** | Roland TR-909 Drum Machine | 11 |
| **TR-606** | Roland TR-606 Drumatix | 7 |
| **TR-707** | Roland TR-707 Rhythm Composer | 15 |
| **TR-727** | Roland TR-727 Latin Percussion | 11 |
| **CR-78** | Roland CompuRhythm CR-78 | 10 |
| **LinnDrum** | Linn Electronics LinnDrum | 15 |
| **DMX** | Oberheim DMX Drum Machine | 11 |
| **RZ-1** | Casio RZ-1 Sampling Drum | 12 |
| **SR-16** | Alesis SR-16 Drum Machine | 12 |
| **SR-18** | Alesis SR-18 Drum Machine | 12 |
| **HR-16B** | Alesis HR-16B Drum Machine | 11 |
| **Minipops** | Korg Mini Pops | 8 |
| **MS20 Kit** | Korg MS20 Synth Percussion | 8 |
| **MS20 Broken** | Korg MS20 Glitch/Noise Kit | 8 |
| **MS20 Deep** | Korg MS20 Low-End Kit | 8 |
| **MS20 Discord** | Korg MS20 Dissonant Kit | 8 |
| **MS20 Grain** | Korg MS20 Granular Kit | 8 |
| **MS20 Metals** | Korg MS20 Metallic Kit | 8 |

### Bank Structure

Sample banks use a **MIDI note-based mapping** system:

- **MIDI Note 36-127**: Sample assignments (standard General MIDI drum mapping)
- **Manifest File**: JSON file defining sample paths and names
- **Per-Voice Independence**: Each voice can load a different bank

#### Example: TR-909 Manifest

```json
{
  "name": "TR-909",
  "description": "Roland TR-909 drum machine samples",
  "type": "factory",
  "samples": {
    "36": "samples/banks/factory/tr-909/kick.wav",
    "38": "samples/banks/factory/tr-909/snare.wav",
    "40": "samples/banks/factory/tr-909/rim.wav",
    "42": "samples/banks/factory/tr-909/clhat.wav"
  },
  "mapping": {
    "36": "Bass Drum",
    "38": "Snare Drum",
    "40": "Rim Shot",
    "42": "Closed Hi-Hat"
  }
}
```

### Loading Banks

#### Via Engine Module UI

1. Select **SMPL** engine for the target voice
2. Click the **bank selector** button (displays current bank name)
3. Choose from available factory banks
4. Bank loads into that voice only (other voices unaffected)

#### Via Drag & Drop (Custom Samples)

1. Select **SMPL** engine for the target voice
2. Drag one or more audio files (WAV, MP3, OGG) onto the Bæng interface
3. Samples are loaded as a custom bank for that voice
4. Use **SAMPLE** knob to select between loaded samples

**Supported Formats**: WAV, MP3, OGG (any format supported by Web Audio API)

### Per-Voice Independence

Each of Bæng's 6 voices maintains:

- **Independent sample bank** (different kits per voice)
- **Independent SAMPLE selection** (different sample per voice)
- **Independent playback parameters** (DECAY, FILTER, PITCH)
- **Independent PPMod configurations**

Example setup:
- Voice 1: TR-909 Kick (MIDI note 36)
- Voice 2: TR-808 Snare (MIDI note 38)
- Voice 3: LinnDrum Closed Hat (MIDI note 42)
- Voice 4: Custom sample (user-loaded)
- Voice 5: TR-909 Crash (MIDI note 51)
- Voice 6: MS20 Metals Tom (MIDI note 47)

---

## Playback Parameters

The SMPL engine provides 3 macro controls for simplified sample manipulation.

### SAMPLE (PATCH Knob)

**Function**: Selects which sample from the loaded bank to play

**Range**: 0-127 (MIDI note number style)

**Effect**:
- Scrolls through available samples in the current bank
- Each bank has different samples at different note numbers
- UI displays sample name when selection changes

**Usage**:
- **Factory Banks**: Use standard MIDI drum note mapping (36=kick, 38=snare, 42=hat, etc.)
- **Custom Banks**: Samples are mapped sequentially as loaded

**Technical Detail**: Sample selection happens at voice creation time. The SAMPLE knob sets which `AudioBuffer` from the bank's sample array will be loaded into the `SamplerEngine` instance.

**PPMod Application**:
- **SEQ Mode**: Sequence through different samples rhythmically
- **RND Mode**: Random sample selection per trigger (variation)
- **TM Mode**: Probabilistic sample switching

**Note**: SAMPLE selection is quantised to integer values (discrete steps, not continuous).

### DECAY (DEPTH Knob)

**Function**: Controls amplitude envelope decay amount

**Range**: 0-100

**Effect**:
- **0-98**: Applies exponential decay envelope to sample
- **99-100**: No envelope (plays full sample to end)

**Decay Calculation**: The decay time is NOT absolute - it scales as a percentage of the sample's natural length. This prevents premature cutoff and adapts to pitch-shifting.

**Formula**:
```
decayPercentage = 0.1 + (decayValue / 99) * 1.0
targetDecayMs = sampleDuration * decayPercentage
```

**Sonic Impact**:
- **Low DECAY (0-30)**: Very short, punchy sounds (10%-40% of sample length)
- **Medium DECAY (30-70)**: Balanced percussive decay (40%-80% of sample length)
- **High DECAY (70-98)**: Extended decay, near-full sample (80%-110% of sample length)
- **Maximum DECAY (99-100)**: Full sample playback, no envelope

**Pitch-Aware**: Decay scales with playback rate. A sample pitched down 12 semitones (2× slower) will have 2× longer decay time at the same DECAY knob position.

**PPMod Application**:
- **ENV Mode**: Decay follows trigger dynamics (harder hits = longer decay)
- **RND Mode**: Randomise decay length for variation
- **SEQ Mode**: Sequenced decay patterns

**Technical Detail**: The `SamplerEngine` calculates decay coefficient based on sample length divided by playback rate, ensuring consistent envelope shape regardless of pitch.

### FILTER (RATE Knob)

**Function**: Lowpass/highpass filter with centre-detent bypass

**Range**: 0-100

**Effect**:
- **0-50**: Lowpass filter (4kHz down to 200Hz)
- **50**: No filter (bypass)
- **50-100**: Highpass filter (200Hz up to 4kHz)

**Filter Type**: State Variable Filter (SVF) with gentle resonance (0.5)

**Cutoff Frequency Mapping**:

| Knob Value | Mode | Cutoff Frequency | Effect |
|------------|------|------------------|--------|
| 0 | Lowpass | 200Hz | Extreme muffling, bass only |
| 25 | Lowpass | 900Hz | Dull, vintage character |
| 50 | Bypass | N/A | Original sample tone |
| 75 | Highpass | 900Hz | Bright, thin character |
| 100 | Highpass | 4kHz | Extreme thinning, hi-end only |

**Sonic Impact**:
- **Lowpass (0-50)**: Darkens the sample, removes high-frequency content (useful for "vintage" or "muffled" sounds)
- **Bypass (50)**: Original sample tone (no filtering applied)
- **Highpass (50-100)**: Brightens the sample, removes low-frequency content (useful for "thin" or "tinny" sounds)

**PPMod Application**:
- **ENV Mode**: Filter opens with amplitude envelope (brighter on attack)
- **LFO Mode**: Rhythmic filter sweeps (auto-wah effect)
- **EF Mode**: Filter follows input level (velocity-sensitive tone)

**Technical Detail**: The filter is implemented using the `StateVariableFilter` class from `dsp-blocks.js`, which provides simultaneous lowpass, highpass, and bandpass outputs. Only LP and HP are used in SMPL engine.

### PITCH (Implicit via Playback Rate)

**Note**: Whilst there's no explicit PITCH knob in the SMPL engine UI, pitch is controlled via:

1. **PPMod PITCH Parameter** (`voice.macroPitch`) - When modulated, shifts playback rate
2. **Sample Selection** - Different samples have different inherent pitches
3. **Sequencer Pitch** - Pattern-based pitch control (future feature)

**Pitch Range**: -24 to +24 semitones (via playback rate adjustment)

**Playback Rate Formula**:
```javascript
playbackRate = Math.pow(2, pitchInSemitones / 12)
```

**Effect on Sample**:
- **Negative Pitch**: Slower playback, lower pitch, longer duration
- **Zero Pitch**: Original sample (1.0× playback rate)
- **Positive Pitch**: Faster playback, higher pitch, shorter duration

**Side Effects**:
- **Duration Change**: Pitched samples play faster/slower (natural tape-style behaviour)
- **Timbre Change**: Formants shift with pitch (unlike time-stretching algorithms)
- **Decay Scaling**: DECAY knob scales proportionally to playback speed

---

## Sample Library

### Factory Kits Organisation

Factory samples are organised in `/merged-app/samples/banks/factory/`:

```
samples/
├── banks/
│   └── factory/
│       ├── tr-808/
│       ├── tr-909/
│       ├── tr-606/
│       ├── linndrum/
│       ├── dmx/
│       └── ...
└── factory-kits-manifest.json  # Master manifest
```

Each kit has:
- **Manifest File**: `{kit-name}-manifest.json` (defines MIDI mapping)
- **Sample Files**: Individual WAV files (one per drum sound)
- **Mapping**: MIDI note → sample name mapping

### General MIDI Drum Mapping (Standard Note Numbers)

| MIDI Note | Name | Common Use |
|-----------|------|------------|
| 35 | Acoustic Bass Drum | Soft kick |
| 36 | Bass Drum 1 | Standard kick |
| 37 | Side Stick | Rim click |
| 38 | Acoustic Snare | Standard snare |
| 39 | Hand Clap | Clap |
| 40 | Electric Snare | Snare variation |
| 41 | Low Floor Tom | Tom 1 |
| 42 | Closed Hi-Hat | Closed hat |
| 43 | High Floor Tom | Tom 2 |
| 44 | Pedal Hi-Hat | Foot hat |
| 45 | Low Tom | Tom 3 |
| 46 | Open Hi-Hat | Open hat |
| 47 | Low-Mid Tom | Tom 4 |
| 48 | Hi-Mid Tom | Tom 5 |
| 49 | Crash Cymbal 1 | Crash |
| 50 | High Tom | Tom 6 |
| 51 | Ride Cymbal 1 | Ride |
| 52 | Chinese Cymbal | Crash variation |
| 53 | Ride Bell | Ride bell |

Factory banks may not use all note numbers, but they generally follow this standard where applicable.

### Loading Custom Samples

#### Drag & Drop Method

1. Set voice to **SMPL** engine
2. Drag audio files onto Bæng interface
3. Samples are loaded sequentially (first file = index 0, second = index 1, etc.)
4. Use **SAMPLE** knob to select between loaded samples

**File Naming Tips**:
- Name files descriptively (`kick.wav`, `snare.wav`, etc.)
- Sort alphabetically for predictable ordering
- Use leading numbers for manual ordering (`01_kick.wav`, `02_snare.wav`)

#### Creating Custom Manifests (Advanced)

For permanent custom kits, create a manifest JSON file:

```json
{
  "name": "My Custom Kit",
  "description": "User-created drum kit",
  "type": "custom",
  "samples": {
    "36": "path/to/kick.wav",
    "38": "path/to/snare.wav",
    "42": "path/to/hat.wav"
  },
  "mapping": {
    "36": "Custom Kick",
    "38": "Custom Snare",
    "42": "Custom Hat"
  }
}
```

Place the manifest and samples in `/merged-app/samples/banks/custom/` and refresh the app.

---

## Performance Considerations

### Memory Usage

**Sample Loading**:
- Samples are decoded into `AudioBuffer` objects (uncompressed PCM)
- Memory usage = sample rate × channels × duration × 4 bytes
- Example: 1-second stereo 48kHz sample = 384KB RAM

**Per-Voice Buffers**:
- Each voice stores its own bank in memory (independent buffers)
- Multiple voices loading the same bank = duplicated memory
- Recommendation: Use different kits per voice to avoid waste

### CPU Usage

**Playback Overhead**:
- Sample playback is very CPU-efficient (simple buffer reading)
- Linear interpolation for pitch-shifting adds minimal overhead
- Filter processing adds ~5% CPU per active voice
- Decay envelope adds <1% CPU per active voice

**Optimisations**:
- Pre-allocated voice pool (no node creation overhead)
- Short anti-click fadeout (32 samples, <1ms)
- Filter bypass when FILTER=50 (no processing)
- Decay bypass when DECAY=99-100 (no envelope calculation)

### Voice Polyphony

The SMPL engine supports **polyphonic mode** (Poly2, Poly3, Poly4):

- Polyphony allows overlapping sample playback (e.g., rolls, layered hits)
- Each poly voice is a separate `SamplerEngine` instance
- Voice stealing uses "least recently used" strategy
- Maximum polyphony = 4 voices per track

**Polyphony Memory Impact**:
- Mono mode: 1 SamplerEngine per voice
- Poly4 mode: 4 SamplerEngine instances per voice
- Total memory = base sample buffer + (poly count × minimal overhead)

---

## PPMod Integration

The SMPL engine fully supports Bæng's Per-Parameter Modulation (PPMod) system. All 3 macro controls can be modulated using the 6 PPMod modes.

### Modulatable Parameters

- **SAMPLE** (voice.samplerNote) - Sample selection modulation
- **DECAY** (voice.samplerDecay) - Decay length modulation
- **FILTER** (voice.samplerFilter) - Filter cutoff modulation

### PPMod Modes for SMPL

#### LFO Mode

**Use Cases**:
- **FILTER + LFO**: Auto-wah filter sweeps
- **DECAY + LFO**: Rhythmic decay variation
- **SAMPLE + LFO**: Cycling through samples (experimental glitch effect)

**Example**: Closed hat with FILTER modulated by fast triangle LFO creates rhythmic brightness modulation.

#### RND (Random) Mode

**Use Cases**:
- **SAMPLE + RND**: Random sample selection (round-robin variation)
- **DECAY + RND**: Humanisation via decay variation
- **FILTER + RND**: Timbral variation per hit

**Example**: Snare with SAMPLE modulated by RND (50% probability) alternates between two different snare samples for realistic variation.

#### ENV (Envelope) Mode

**Use Cases**:
- **FILTER + ENV**: Filter opens with amplitude (brighter on attack, darker on decay)
- **DECAY + ENV**: Decay length follows dynamics (harder hits sustain longer)

**Example**: Tom with FILTER modulated by ENV creates natural brightness sweep (bright attack, dark tail).

#### EF (Envelope Follower) Mode

**Use Cases**:
- **FILTER + EF**: Filter follows input level (velocity-sensitive tone)
- **DECAY + EF**: Decay responds to dynamics

**Example**: Kick with DECAY following envelope follower - harder hits ring longer.

#### TM (Probabilistic Step Sequencer) Mode

**Use Cases**:
- **SAMPLE + TM**: Probabilistic sample switching (glitchy variation)
- **FILTER + TM**: Stepped filter patterns
- **DECAY + TM**: Rhythmic decay variations

**Example**: Hi-hat with SAMPLE modulated by TM creates probabilistic variation between closed/open hat samples.

#### SEQ (CV Sequencer) Mode

**Use Cases**:
- **SAMPLE + SEQ**: Sequenced sample selection (programmed variation)
- **FILTER + SEQ**: Rhythmic filter patterns
- **DECAY + SEQ**: Sequenced decay variations

**Example**: Kick with FILTER modulated by SEQ creates rhythmic tone variations (every 4 steps = bright, others = dark).

---

## Tips and Techniques

### Classic Drum Machine Emulation

#### TR-808 Emulation

**Bank**: Factory TR-808 kit

**Voice Setup**:
- Voice 1 (Kick): SAMPLE=36, DECAY=60, FILTER=50
- Voice 2 (Snare): SAMPLE=38, DECAY=40, FILTER=55
- Voice 3 (Hi-Hat): SAMPLE=42, DECAY=20, FILTER=65

**Modulation**:
- Kick DECAY + ENV (longer decay on accents)
- Snare FILTER + RND (subtle timbral variation)
- Hi-Hat DECAY + SEQ (varying lengths for groove)

#### TR-909 Emulation

**Bank**: Factory TR-909 kit

**Voice Setup**:
- Voice 1 (Kick): SAMPLE=36, DECAY=50, FILTER=50
- Voice 2 (Snare): SAMPLE=38, DECAY=35, FILTER=60
- Voice 3 (Closed Hat): SAMPLE=42, DECAY=15, FILTER=70
- Voice 4 (Open Hat): SAMPLE=46, DECAY=80, FILTER=60

**Modulation**:
- Kick FILTER + ENV (pitch-like filter sweep)
- Open Hat DECAY + RND (natural variation)

### Creating Tonal Percussion

**Technique**: Use pitched samples with SEQ mode for melodic patterns

**Setup**:
1. Load a tonal sample (tom, bell, pitched kick)
2. Enable PPMod on SAMPLE or use external pitch control
3. Create 4-8 step sequence with pitch values
4. Enable scale quantisation for in-key melodies

**Example**: LinnDrum tom with SAMPLE modulated by SEQ (C-E-G-C pattern) creates melodic tom fills.

### Layering SMPL with Other Engines

**Technique**: Combine SMPL with Analog or DX7 engines for hybrid sounds

**Setup**:
- Voice 1: SMPL TR-909 Kick (transient)
- Voice 2: Analog Kick (body/sustain)
- Sequence both voices on same steps
- Adjust DECAY on SMPL for tight attack, Analog for body

**Result**: Layered kick with sampled transient + synthesised body (like modern hybrid drum machines).

### Round-Robin Variation

**Technique**: Use RND mode to alternate between multiple samples

**Setup**:
1. Load multiple variations of the same sound (e.g., 3 snare samples at notes 38, 40, 41)
2. Enable PPMod RND on SAMPLE parameter
3. Set RND depth to cycle between the 3 notes
4. Set probability to 100% for consistent variation

**Result**: Natural-sounding snare hits without machine-gun repetition (like MPC/Akai samplers).

### Reverse Samples

**Limitation**: The SMPL engine does not natively support reverse playback.

**Workaround**:
1. Pre-process samples with reverse effect (external audio editor)
2. Load reversed samples into custom bank
3. Use SAMPLE knob to select reversed version

### Looping Samples

**Limitation**: The SMPL engine is designed for one-shot percussion, not looping.

**Workaround for Sustained Sounds**:
- Set DECAY to 99-100 (full sample playback)
- Use samples with natural sustain/reverb tail
- For infinite loops, use SLICE engine instead (supports loop points)

---

## Troubleshooting

### Common Issues

#### "No sound from SMPL voice"

**Possible Causes**:
1. **No bank loaded** - SAMPLE knob has no effect
2. **DECAY set to 0** - Envelope kills sound immediately
3. **Wrong SAMPLE index** - Selected note has no sample in bank
4. **FILTER extreme setting** - Filter removes all audible content

**Solutions**:
- Load a factory bank via engine selector
- Set DECAY to 50-70 (moderate decay)
- Check bank manifest for available MIDI notes
- Set FILTER to 50 (bypass)

#### "Sample sounds wrong/distorted"

**Cause**: Corrupted sample file or decoding error

**Solutions**:
- Try different sample from same bank
- Re-download factory banks if corrupted
- For custom samples, verify file integrity in audio editor
- Check browser console for decoding errors

#### "Sample playback is choppy/glitchy"

**Cause**: High CPU usage or buffer underruns

**Solutions**:
- Reduce polyphony (use Mono mode instead of Poly4)
- Disable PPMod on unused parameters
- Close other browser tabs/applications
- Increase audio buffer size in browser settings (if available)

#### "Custom samples won't load"

**Possible Causes**:
1. **Unsupported file format** - Browser can't decode file
2. **File path incorrect** - Manifest points to wrong location
3. **CORS restrictions** - Local file access blocked

**Solutions**:
- Use WAV format for maximum compatibility
- Verify file paths in manifest are correct (relative to manifest location)
- Serve files via local web server (not `file://` protocol)
- Use drag & drop method instead of manifest

#### "Sample pitch is wrong after PPMod"

**Cause**: PPMod PITCH depth/offset misconfigured

**Solutions**:
- Check PPMod PITCH offset (50 = neutral, 0dB pitch)
- Verify PPMod depth isn't excessive (>100% can cause extreme shifts)
- For melodic sequences, enable scale quantisation
- Reset PPMod to default values and reconfigure

### Performance Issues

#### "High memory usage with SMPL voices"

**Cause**: Large sample buffers loaded into RAM

**Solutions**:
- Use shorter samples (trim silence/reverb tails)
- Convert stereo samples to mono (50% memory reduction)
- Use lower sample rates (24kHz is sufficient for many drum sounds)
- Don't load duplicate banks across multiple voices

#### "SMPL voices cause audio dropouts"

**Cause**: High CPU usage from filtering or polyphony

**Solutions**:
- Set FILTER to 50 (bypass) when not needed
- Reduce polyphony to Mono or Poly2
- Use DECAY=99-100 to bypass envelope processing (if not needed)
- Close other CPU-intensive applications

### Sonic Issues

#### "Sample sounds too bright/harsh"

**Solutions**:
- Reduce FILTER value (0-49 for lowpass darkening)
- Try different sample from bank (some are naturally bright)
- Use PPMod FILTER + ENV to darken sustain phase
- Layer with darker Analog engine voice

#### "Sample sounds too dull/muffled"

**Solutions**:
- Increase FILTER value (51-100 for highpass brightening)
- Try different sample from bank
- Check original sample quality (may be low-fidelity)
- Add Drive/Saturation from voice processing chain

#### "Sample decays too quickly"

**Solutions**:
- Increase DECAY value (99-100 for full sample playback)
- Check sample's natural length (may be inherently short)
- Use polyphony mode to allow overlapping decays
- Layer with Analog engine for extended tail

---

## Further Reading

### Related Documentation

- [Bæng User Guide](../../user-guide/baeng-guide.md) - Complete Bæng documentation
- [DX7 Engine](dx7-engine.md) - FM synthesis engine reference
- [Analog Engine](analog-engine.md) - Subtractive synthesis engine reference
- [SLICE Engine](slice-engine.md) - Advanced sample slicer with loop points
- [PPMod System](../../ppmod.md) - Per-parameter modulation reference

### External Resources

**Sample Packs**:
- [99Sounds Free Drum Kits](http://99sounds.org/drum-samples/)
- [MusicRadar Free Samples](https://www.musicradar.com/news/tech/free-music-samples-royalty-free-loops-hits-and-multis-to-download)
- [r/Drumkits](https://www.reddit.com/r/Drumkits/) - Community-shared drum samples

**Sample Processing**:
- [Audacity](https://www.audacityteam.org/) - Free audio editor for trimming/processing samples
- [Wavosaur](https://www.wavosaur.com/) - Lightweight WAV editor

---

## Version History

**v1.0** (2025-12-30)
- Initial documentation release
- Complete parameter reference
- Factory bank catalogue
- PPMod integration details
- Sound design techniques
- Troubleshooting section

---

*This documentation is part of the Bæng & Ræmbl project. For issues, contributions, or questions, visit the [GitHub repository](https://github.com/MidiSlave/baeng-and-raembl).*
