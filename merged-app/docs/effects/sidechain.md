# Sidechain Ducking

Sidechain ducking allows Bæng drum voices to dynamically reduce (duck) the levels of effects processors in both Bæng and Ræmbl. This creates rhythmic pumping effects and prevents drum hits from being masked by reverb/delay tails.

## Overview

The sidechain system uses an envelope follower approach to detect transients from selected Bæng voices and applies gain reduction to target effects:

- **Bæng Effects**: Reverb, Delay, Clouds
- **Ræmbl Effects**: Reverb, Delay, Clouds

Each effect has independent ducking configuration with per-voice trigger selection, allowing precise control over which drum voices cause ducking on which effects.

## How It Works

### Signal Flow

```
Bæng Voices [0-5] → Voice Panners → Sidechain Tap Gains [0-5]
                                            ↓
                                    Sidechain Sum Node
                                            ↓
                                      AnalyserNode
                                            ↓
                            RAF Envelope Follower (Main Thread)
                                            ↓
                              Ducking Gain Automation
                                            ↓
                        Effect Output → Ducking Gain → Master
```

### Architecture Details

1. **Per-Voice Taps**: Each Bæng voice has a dedicated tap gain (0 or 1) that controls whether it contributes to the sidechain sum
2. **Envelope Follower**: `requestAnimationFrame` loop (main thread) calculates RMS amplitude from the sidechain analyser
3. **Gain Automation**: When sidechain signal exceeds threshold, target effects are attenuated using `setTargetAtTime()` automation
4. **Per-Effect Processing**: Each effect has an independent ducking gain node with separate configuration

**Why Not DynamicsCompressorNode?**
Web Audio's `DynamicsCompressorNode` doesn't support external sidechain inputs (only internal sidechain from the same signal path). The envelope follower approach provides full flexibility for routing any voice to any effect.

## Configuration Modal

Click the **DUCK** button on any effect module to open the sidechain configuration modal.

### Modal Features

- **Draggable**: Click and drag the modal header to reposition
- **Waveform Display**: Real-time visualisation showing:
  - Effect output waveform (theme-coloured envelope)
  - Ducking gain level (theme-coloured line)
  - Threshold marker (dashed line, when enabled)
- **Per-Voice Selection**: Checkboxes for voices 1-6 (T1-T6)
- **Parameter Sliders**: Threshold, Ratio, Attack, Release, Range
- **Enable Toggle**: Master on/off switch for this effect's ducking

### Keyboard Shortcuts

- **Escape**: Close modal

## Parameters

### Enable
**Default**: Off
**Type**: Toggle

Master enable/disable for this effect's ducking. When disabled, the effect plays at full level regardless of sidechain input.

### Trigger Sources (Voices)
**Default**: Voice 1 only
**Type**: Multi-select checkboxes (T1-T6)

Select which Bæng voices trigger ducking for this effect. Multiple voices can be selected simultaneously. Common configurations:

- **Kick only** (T1): Classic sidechain pumping
- **Kick + Snare** (T1 + T2): Rhythmic ducking on downbeats and backbeats
- **All voices**: Full drum mix triggers ducking

### Threshold
**Range**: -60dB to 0dB
**Default**: -36dB (30/100)
**Slider Range**: 0-100

Level at which ducking begins. Lower values trigger more easily (more ducking), higher values require louder transients.

**Mapping**: `(value / 100) × 60 - 60` dB

### Ratio
**Range**: 1:1 to 20:1
**Default**: 16.2:1 (80/100)
**Slider Range**: 0-100

Compression ratio applied when signal exceeds threshold. Higher ratios create more aggressive ducking.

**Mapping**: `1 + (value / 100) × 19`

### Attack
**Range**: 0.1ms to 100ms (exponential)
**Default**: ~2.5ms (10/100)
**Slider Range**: 0-100

How quickly the effect ducks when sidechain signal exceeds threshold. Faster attacks (lower values) create snappier ducking that follows transients closely.

**Mapping**: `0.1 × 1000^(value / 100)` ms

**Common Settings**:
- **0-20**: Fast (< 10ms) - Tight transient following
- **20-50**: Medium (10-30ms) - Balanced
- **50-100**: Slow (30-100ms) - Smooth, less obvious pumping

### Release
**Range**: 10ms to 1000ms (exponential)
**Default**: ~100ms (40/100)
**Slider Range**: 0-100

How quickly the effect returns to full level after sidechain signal drops below threshold. Faster releases (lower values) create rhythmic pumping, slower releases (higher values) create smooth breathing.

**Mapping**: `10 × 100^(value / 100)` ms

**Common Settings**:
- **0-30**: Fast (10-50ms) - Obvious pumping effect
- **30-60**: Medium (50-300ms) - Musical ducking
- **60-100**: Slow (300-1000ms) - Subtle gain riding

### Range
**Range**: 0dB to 40dB
**Default**: 24dB (60/100)
**Slider Range**: 0-100

Maximum attenuation (gain reduction) applied during ducking. Higher values allow deeper ducking.

**Mapping**: `(value / 100) × 40` dB

## Usage Examples

### Classic Kick Sidechain (EDM Pumping)
**Effect**: Ræmbl Reverb
**Voices**: T1 (kick only)
**Threshold**: -40dB
**Ratio**: 20:1
**Attack**: 1ms
**Release**: 150ms
**Range**: 30dB

Creates the classic "pumping" effect where reverb breathes in time with the kick drum.

### Subtle Reverb Ducking (Mix Clarity)
**Effect**: Bæng Reverb
**Voices**: T1, T2 (kick + snare)
**Threshold**: -30dB
**Ratio**: 4:1
**Attack**: 5ms
**Release**: 80ms
**Range**: 12dB

Gently reduces reverb tails during drum hits to maintain clarity without obvious pumping.

### Aggressive Delay Ducking (Rhythmic)
**Effect**: Ræmbl Delay
**Voices**: T1, T2, T3 (kick, snare, hi-hat)
**Threshold**: -36dB
**Ratio**: 16:1
**Attack**: 0.5ms
**Release**: 40ms
**Range**: 24dB

Creates rhythmic gating of delay tails, with delay audible only between drum hits.

## Tips

### Preventing Ducking Artefacts
- Use **moderate ratios** (4:1 to 10:1) for transparent ducking
- Set **attack < 10ms** to avoid missing transient onsets
- Use **release > 50ms** to avoid harsh gain changes
- Adjust **range** to taste—start around 12-18dB and increase if needed

### Musical Release Times
Sync release to tempo for rhythmic effects:
- **16th note**: `(60 / BPM) × 0.25 × 1000` ms
- **8th note**: `(60 / BPM) × 0.5 × 1000` ms
- **Quarter note**: `(60 / BPM) × 1000` ms

At 120 BPM:
- 16th = 125ms
- 8th = 250ms
- Quarter = 500ms

### Combining with Drum Bus
The [Drum Bus](drum-bus.md) compressor and sidechain ducking work in series:

1. Bæng voices → Drum Bus processing → Sidechain taps
2. Processed drum signal triggers ducking

This means heavily compressed drums (via Drum Bus) may trigger ducking more consistently due to reduced dynamic range. Adjust threshold accordingly.

### Per-Effect Strategy
- **Reverb**: Moderate ducking (12-20dB range) to prevent masking
- **Delay**: Aggressive ducking (20-30dB range) for rhythmic effects
- **Clouds**: Subtle ducking (6-12dB range) to preserve texture

## Implementation Details

### Files
- **`merged-app/js/baeng/modules/sidechain.js`**: Core sidechain bus and envelope follower
- **`merged-app/js/baeng/modules/sidechain-modal.js`**: UI modal and waveform visualisation
- **`merged-app/js/baeng/state.js`**: Sidechain configuration storage (lines 274-281)
- **`merged-app/js/raembl/audio/effects.js`**: Ræmbl effect ducking gain connections

### State Structure
```javascript
sidechain: {
    baengReverb: {
        enabled: false,
        voices: [true, false, false, false, false, false], // T1-T6
        threshold: 30,  // 0-100 → -60dB to 0dB
        ratio: 80,      // 0-100 → 1:1 to 20:1
        attack: 10,     // 0-100 → 0.1ms to 100ms (exponential)
        release: 40,    // 0-100 → 10ms to 1000ms (exponential)
        range: 60       // 0-100 → 0dB to 40dB
    },
    // ... (6 effects total: baengReverb, baengDelay, baengClouds,
    //                       raemblReverb, raemblDelay, raemblClouds)
}
```

### Performance
- **Envelope Follower**: Runs at ~60 FPS via `requestAnimationFrame` on main thread
- **CPU Usage**: Negligible (<0.1% on modern hardware)
- **FFT Size**: 256 samples for low-latency response
- **Smoothing**: `smoothingTimeConstant = 0.5` for balanced response

## Known Issues

- **Audible Artefacts**: Some combinations of attack/release/ratio may produce clicking or pumping artefacts, particularly at extreme settings. Under investigation.
  - **Workaround**: Use moderate ratios (4:1 to 10:1) and attack times > 1ms
- **Extreme Feedback**: When using sidechain ducking on effects with high feedback (Clouds, Delay), rapid ducking changes can create metallic ringing
  - **Workaround**: Reduce feedback parameter or use slower attack/release times

---

**Related Documentation**:
- [Drum Bus](drum-bus.md) - Master bus processing (works in series with sidechain)
- [Clouds FX Engine](clouds.md) - Granular processor with ducking support
