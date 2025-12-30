# Delay Effect

## Overview

The delay effect provides tempo-synchronised or free-running echo/repeat processing for both Bæng and Ræmbl. Each application maintains independent delay routing with unique control sets, though both share the same underlying architecture: a feedback delay line with tape-style modulation (wow/flutter) and optional saturation distortion.

The delay features a real-time oscilloscope visualisation showing each delay tap as it decays through the feedback path, with visual feedback for wow, flutter, and saturation parameters.

**Key Features:**
- Tempo-synchronised or free-running delay time
- Adjustable feedback (0-95%)
- Tape-style modulation (wow & flutter)
- Saturation distortion with automatic gain compensation
- Multi-tap oscilloscope visualisation
- Independent routing per application
- Sidechain ducking support (triggered by Bæng voices)

---

## Architecture

Both applications use the same delay architecture but with different parameter sets:

### Signal Flow
```
Input → Send Gain → Delay Line → Saturation (optional) → Comp Gain → Wet Output
                          ↑                                      ↓
                          └────────── Feedback Gain ─────────────┘
```

### Tempo Sync Divisions
When sync is enabled, delay time is quantised to musical divisions:

| Division | Ratio  | Time @ 120 BPM |
|----------|--------|----------------|
| 1/32     | 1/32   | 62.5 ms        |
| 1/16     | 1/16   | 125 ms         |
| 1/16T    | 1/12   | 167 ms         |
| 1/8      | 1/8    | 250 ms         |
| 1/8T     | 1/6    | 333 ms         |
| 1/16D    | 3/16   | 375 ms         |
| 1/4      | 1/4    | 500 ms         |
| 1/4T     | 1/3    | 667 ms         |
| 1/8D     | 3/8    | 750 ms         |
| 1/2      | 1/2    | 1000 ms        |
| 1/4D     | 3/4    | 1500 ms        |
| 1 (whole)| 1      | 2000 ms        |

---

## Bæng Delay

Bæng's delay uses per-voice send controls, allowing individual drum voices to route different amounts to the global delay processor.

### Parameters

| Parameter    | Range  | Default | Description |
|--------------|--------|---------|-------------|
| **TIME**     | 0-100  | 25      | Delay time (sync divisions or ms) |
| **FDBK**     | 0-100  | 0       | Feedback amount (max 95%) |
| **SYNC**     | Toggle | On      | Tempo sync vs free mode |
| **WOW**      | 0-100  | 10      | Tape wow modulation (slow pitch variation) |
| **FLUT**     | 0-100  | 5       | Tape flutter modulation (fast pitch variation) |
| **SAT**      | 0-100  | 0       | Saturation distortion amount |
| **FILT**     | 0-100  | 50      | Filter cutoff (50 = bypass) |
| **Send**     | 0-100  | 0       | Per-voice delay send level |

**Per-Voice Send Controls:**
Each of Bæng's 6 voices has an independent delay send control (knob in ENGINE module). This allows precise control over which drums are affected by the delay:
- Voice 1-6: Individual send levels (0-100%)
- Global processor: Single delay instance shared by all voices

**Implementation Details:**
- **SYNC mode**: TIME parameter selects from 12 musical divisions
- **FREE mode**: TIME parameter maps 1ms-4000ms (exponential scaling)
- **WOW**: 0.1-0.5 Hz sine LFO on delay time (0-5ms depth)
- **FLUT**: 4-8 Hz sine LFO on delay time (0-1ms depth)
- **SAT**: Soft saturation waveshaper (k=0 to k=20 curve)
- **FILT**: Lowpass 500Hz-30kHz (50 = 30kHz bypass)

---

## Ræmbl Delay

Ræmbl's delay uses a global send control with additional tape-style modulation parameters.

### Parameters

| Parameter    | Range  | Default | Description |
|--------------|--------|---------|-------------|
| **SEND**     | 0-100  | 25      | Global delay send level |
| **TIME**     | 0-100  | 50      | Delay time (sync divisions or ms) |
| **FDBK**     | 0-100  | 40      | Feedback amount (max 95%) |
| **SYNC**     | Toggle | On      | Tempo sync vs free mode |
| **WOW**      | 0-100  | 10      | Tape wow modulation (slow pitch variation) |
| **FLUT**     | 0-100  | 5       | Tape flutter modulation (fast pitch variation) |
| **SAT**      | 0-100  | 0       | Saturation distortion amount |

**Global Send Control:**
Unlike Bæng's per-voice routing, Ræmbl uses a single send fader controlling the overall delay send level. This affects all notes/voices equally.

**Implementation Details:**
- Same delay divisions as Bæng (12 musical values)
- FREE mode: 1ms-4000ms range with exponential scaling
- Saturation includes automatic gain compensation to prevent runaway feedback
- Visualisation shows up to 8 delay taps (based on feedback amount)

---

## Tempo Sync vs Free Mode

**SYNC Mode (Default):**
- Delay time locked to tempo (BPM-aware)
- Automatically adjusts when BPM changes
- TIME parameter selects musical division (1/32 to whole note)
- Ideal for rhythmic echoes and musical delays

**FREE Mode:**
- Delay time in absolute milliseconds (1-4000ms)
- Independent of tempo
- Exponential scaling for fine control at short delays
- Useful for slapback, doubling, and special effects

**Switching Modes:**
Toggle the SYNC button to switch between modes. The current TIME value is preserved but interpreted differently (division index vs millisecond value).

---

## Tape-Style Modulation

### Wow (Slow Pitch Variation)
Simulates tape speed variations from mechanical instability:
- **Frequency**: 0.1-0.5 Hz (adjusts with parameter)
- **Depth**: 0-5ms delay time modulation
- **Character**: Slow, gentle pitch warble
- **Use Cases**: Vintage tape warmth, lo-fi aesthetics

### Flutter (Fast Pitch Variation)
Simulates high-frequency tape transport irregularities:
- **Frequency**: 4-8 Hz (adjusts with parameter)
- **Depth**: 0-1ms delay time modulation
- **Character**: Fast, subtle pitch fluctuation
- **Use Cases**: Tape saturation, detuning effects, movement

**Visualisation:**
Both wow and flutter are visible in the oscilloscope display as:
- **Wow**: Slow horizontal waving of the waveform
- **Flutter**: Fast horizontal vibration + line thickness modulation

---

## Saturation

The saturation stage emulates tape/analogue distortion with automatic gain compensation to prevent runaway feedback.

### Characteristics
- **Type**: Soft saturation waveshaper (hyperbolic tangent curve)
- **Range**: k=0 (clean) to k=20 (heavily saturated)
- **Compensation**: 75% automatic gain reduction at high saturation values
- **Bypass**: Automatically bypassed when SAT=0 (CPU optimisation)

### Saturation Curve
The waveshaper uses the formula:
```
y = (1 + k) × x / (1 + k × |x|)
```

Where `k` is the saturation factor (0-20), derived from the SAT parameter using a cubic curve for gradual onset.

### Visual Feedback
In the oscilloscope visualisation, saturation is shown as:
- Horizontal spikes/distortion in the waveform
- Breakup of the oscilloscope line (gaps appear)
- Grey distortion pixels where the line breaks up
- More pronounced on later taps (cumulative distortion)

**Use Cases:**
- Tape-style warmth and harmonic richness
- Aggressive distorted echoes
- Lo-fi degradation effects
- Feedback path limiting

---

## Sidechain Ducking

Both Bæng and Ræmbl delay processors support sidechain ducking, allowing Bæng drum voices to trigger gain reduction in the delay wet signal.

**Configuration:**
- Per-effect ducking settings in Bæng sidechain modal
- Selectable trigger voices (any combination of 6 voices)
- Threshold, ratio, attack, release, and range controls
- Independent ducking for Bæng delay, Ræmbl delay, reverb, and Clouds

**Typical Use Cases:**
- Duck delay on kick drum hits (rhythmic pumping)
- Clear space for snare transients
- Prevent delay wash from obscuring drums

**Implementation:**
Signal path includes ducking gain node between wet output and master gain:
```
Delay Wet → Ducking Gain → Master Gain
                ↑
        Sidechain Trigger (Bæng voices)
```

---

## Visualisation

Both applications feature real-time oscilloscope visualisation of the delay taps.

### Display Characteristics
- **Orientation**: Vertical oscilloscope (rotated 90°)
- **Taps**: Up to 8 delay taps shown
- **Spacing**: Logarithmic based on delay time (1ms-5s range)
- **Opacity**: Decreases with each tap based on feedback amount
- **Colour**: Theme gradient (interpolates between gradient colours in gradient mode)

### Visual Features
- **Wow**: Slow sinusoidal horizontal displacement
- **Flutter**: Fast horizontal vibration + line thickness modulation
- **Saturation**: Horizontal spikes, line breakup, grey distortion pixels
- **Centre Line**: Subtle axis reference for each tap

### Performance
- Animation runs at display refresh rate (typically 60 FPS)
- Automatically starts/stops based on send level
- FFT size: 256 samples (optimised for performance)
- Smoothing: Disabled for real-time response

---

## Usage Tips

### Rhythmic Delays
1. Enable SYNC mode
2. Set TIME to musical division (1/4, 1/8, etc.)
3. Adjust FDBK for desired number of repeats
4. Add subtle WOW (5-15) for analogue character

### Slapback Echo
1. Disable SYNC mode (FREE)
2. Set TIME to 50-150ms
3. FDBK to 0-20% (single repeat)
4. Boost SAT for vintage tape slapback

### Infinite Repeats / Feedback Loop
1. Set FDBK to 80-95%
2. Add SAT (30-60) to prevent runaway
3. Use WOW/FLUT for evolving textures
4. Modulate TIME parameter (PPMod) for pitch-shifting effects

### Tape Delay Emulation
1. SYNC mode with 1/4 or 1/8 division
2. FDBK: 50-70%
3. WOW: 15-25
4. FLUT: 8-15
5. SAT: 20-40
6. Creates classic tape echo character

### Doubling / Thickening
1. FREE mode, TIME: 15-30ms
2. FDBK: 0%
3. WOW: 0-5 (slight detuning)
4. FLUT: 3-8
5. Creates natural doubling effect

### Per-Voice Routing (Bæng Only)
- Send only kick/snare to delay for focused rhythm
- Send hi-hats at lower levels to avoid clutter
- Use different send levels to create depth (closer/farther sounds)
- Combine with reverb sends for dimensional mixing

---

## Cross-References

- **[Reverb](reverb.md)**: Reverb effect documentation (when created)
- **[Clouds](clouds.md)**: Alternative granular FX processor
- **[Drum Bus](drum-bus.md)**: Bæng master bus processing

---

## Technical Notes

### Maximum Delay Time
Both delay nodes support up to 5 seconds maximum delay time. The FREE mode is clamped to 4 seconds to provide headroom for modulation.

### Feedback Limiting
Feedback is clamped to 95% maximum to prevent trivial infinite loops. The saturation stage provides additional limiting when enabled.

### LFO Start Logic
The wow and flutter LFOs are started once during audio context initialisation via `startEffectsLFOs()`. This ensures they're already running when delay is first used, preventing clicks.

### Compensation Gain
The saturation compensation gain reduces output by up to 75% of the added gain factor. This prevents excessive level boost when using high saturation with feedback, which would otherwise cause runaway distortion.

**Formula:**
```
compensationFactor = 1.0 / (1 + k_shape_factor × 0.75)
```

### Crossfade Ramping
All delay parameter changes use exponential ramping (`setTargetAtTime`) with a 10ms time constant for smooth, click-free transitions. Delay time changes use a longer 200ms linear ramp to prevent pitch artifacts.

---

## Common Issues

**Issue**: Delay time jumps when switching between SYNC/FREE modes
**Solution**: This is expected behaviour. SYNC interprets the TIME value as a division index, while FREE interprets it as milliseconds. Adjust TIME after switching modes.

**Issue**: Excessive volume with high feedback + saturation
**Solution**: The compensation gain should prevent this, but if it occurs, reduce either FDBK or SAT. The combination of high feedback (>80%) and high saturation (>60%) can create extreme resonances.

**Issue**: Delay visualisation not showing
**Solution**: Ensure send level is >0. The animation automatically stops when send=0 for performance. Also verify the canvas element is visible in the UI.

**Issue**: Clicking/popping when adjusting delay time
**Solution**: This can occur with very short delay times (<10ms) and high feedback. The system uses linear ramping to minimise this, but extreme settings may still produce artifacts. Temporarily reduce feedback while adjusting time.

---

## Version History

- **v1.2.0** (2025-12-28): Documented unified delay system with tempo sync/free toggle
- **v1.1.0** (2025-12-15): Added saturation compensation gain
- **v1.0.0** (2025-12-01): Initial delay implementation with wow/flutter
