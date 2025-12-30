# PPMod Overview

Per-Parameter Modulation (PPMod) allows you to add movement and expression to any modulatable parameter in Bæng & Ræmbl. Instead of static values, parameters can be animated using LFOs, envelopes, random generators, and step sequencers.

## What is PPMod?

PPMod is a comprehensive modulation system that lets you assign independent modulation sources to individual parameters. Each parameter can have its own modulation configuration, including:

- **Modulation source** - Which type of modulation (LFO, envelope, sequencer, etc.)
- **Depth** - How much the parameter moves from its base value (0-100%)
- **Offset** - Bias the modulation range up or down (-100% to +100%)
- **Source-specific settings** - Waveform, rate, envelope curves, pattern length, etc.

When you enable PPMod on a parameter, the original value becomes the **base value** - the centre point around which modulation occurs. Adjusting the knob/fader whilst modulation is active shifts this centre point, allowing you to reshape the modulation range in real-time.

## Available Modes

PPMod supports 6 distinct modulation modes:

| Mode | Description | Use Cases |
|------|-------------|-----------|
| **LFO** | Low-frequency oscillator with 6 waveforms (Sine, Triangle, Square, Sawtooth, Ramp, S&H) | Cyclic movement, vibrato, tremolo, filter sweeps |
| **RND** | LFSR-based pseudo-random generator with configurable bit depth and sample rate | Randomised patterns, generative sequences, controlled chaos |
| **ENV** | AD envelope triggered on note/step events with 4 curve shapes (Linear, Exponential, Logarithmic, S-Curve) | Accent modulation, dynamic parameter changes, note-synchronised sweeps |
| **EF** | Envelope follower that tracks amplitude from Ræmbl, Bæng, or master output | Dynamics-responsive effects, ducking, auto-wah |
| **TM** | Turing Machine - probabilistic step sequencer with per-step mutation | Evolving patterns, generative sequences, controlled randomness |
| **SEQ** | CV-style step sequencer with manually drawn step values | Rhythmic modulation, custom waveforms, synchronised changes |

For detailed parameter reference and usage tips for each mode, see [PPMod Modes Reference](ppmod-modes.md).

## Assigning Modulation

### Opening the Modal

To assign modulation to a parameter:

1. **Hover** over the parameter label (knob or fader label)
2. **Click** the label when it highlights
3. The PPMod modal opens showing the current modulation settings

### Modal Interface

The modal is divided into sections:

- **Header** - Shows the parameter name (e.g., "MOD: FILTER [V1]" for per-voice params)
- **Mode tabs** - Click to switch between LFO, RND, ENV, EF, TM, SEQ modes
- **Common controls** - Depth and Offset sliders (shared across all modes)
- **Mode-specific panel** - Controls specific to the active mode
- **Visualisation canvas** - Real-time waveform/pattern preview
- **Reset button** - Clears all modulation and restores default settings

### Voice Selector (Bæng Only)

For per-voice parameters in Bæng, a voice selector appears below the header showing buttons **1-6**. Each voice has completely independent modulation settings. Click a voice button to edit that voice's modulation configuration.

### Basic Workflow

1. **Open the modal** by clicking a parameter label
2. **Select a mode** (LFO, RND, ENV, etc.) using the tabs
3. **Adjust depth** - Start with 30-50% and adjust to taste
4. **Configure mode settings** - Waveform, rate, envelope times, etc.
5. **Fine-tune offset** - Shift the modulation range if needed
6. **Close the modal** - Click the X or press Escape

The parameter immediately begins modulating. You'll see visual feedback on the knob/fader and label.

## K-Rate vs Audio-Rate

PPMod operates at **k-rate** (control rate), updating parameter values at **30 FPS** (~33ms intervals). This is a deliberate design choice:

### Why K-Rate?

- **Perceptual threshold** - Human perception of modulation changes is approximately 50ms. Updates at 30 FPS are perceptually identical to audio-rate for control parameters.
- **CPU efficiency** - K-rate modulation uses <1% CPU across all 6 modes. Audio-rate would require per-sample calculations (48,000 times/second) with no perceptual benefit.
- **Reliability** - K-rate updates use `AudioParam.setValueAtTime()` for sample-accurate scheduling without audio thread complexity.
- **Compatibility** - Works consistently in both mono and polyphonic modes without special handling.

### When Audio-Rate Would Matter

Audio-rate modulation is only necessary when modulating:
- FM synthesis carrier/modulator frequencies (produces sidebands)
- Waveshaping/distortion parameters (creates harmonic content)
- Ring modulation (affects spectrum)

For standard synthesis parameters (filter cutoff, LFO rate, envelope times, etc.), k-rate is optimal.

### Smooth Transitions

Despite running at 30 FPS, PPMod provides click-free parameter changes through:
- **Linear ramping** - `setValueAtTime()` creates smooth transitions between updates
- **Jump detection** - Large parameter jumps trigger 15ms crossfades to prevent pops
- **Parameter smoothing metadata** - Tracked for future audio-thread optimisations

## Bæng vs Ræmbl Differences

Whilst both apps use the same PPMod modal and share core modulation utilities, they differ in architecture and voice handling:

### Bæng (6 Drum Voices)

- **Per-voice configuration** - Each of 6 voices has independent modulation settings
- **Compound keys** - Voice state stored as `voiceIndex:paramId` (e.g., `0:voice.macroPitch`)
- **Trigger-based** - Envelopes, S&H, and patterns respond to drum triggers (`trackTriggered` events)
- **Voice selector UI** - Modal shows buttons 1-6 for switching between voice configurations
- **Effect params** - Global modulation with optional trigger routing (T1-T6, SUM)

**Example**: Voice 1 can have Sine LFO at 2Hz on PITCH whilst Voice 3 has Square LFO at 0.5Hz on the same parameter.

### Ræmbl (8-Voice Polyphonic)

- **Mono vs Poly keying** - MONO mode uses global keys (`paramId`), POLY mode uses per-voice keys (`voiceId:paramId`)
- **Voice pool** - 8 pre-allocated AudioWorklet voices with per-voice modulation in POLY mode
- **Phase offset** - Poly voices initialise with staggered LFO phases (0, 0.125, 0.25... 0.875) to prevent unison
- **Unified configuration** - Single modulation config per parameter (applied globally in MONO, per-voice in POLY)
- **Engine-specific handlers** - Separate poly modulation functions for Subtractive and Plaits engines

**Example**: In POLY mode, each of 8 voices has independent LFO phase for filter cutoff modulation, creating evolving polyphonic textures.

### Key Architectural Differences

| Aspect | Bæng | Ræmbl |
|--------|------|-------|
| **Config structure** | `{ isVoiceParam: true, voices: [{...}, {...}] }` | `{ enabled, depth, rate, ... }` |
| **Voice independence** | Always per-voice (6 voices) | Depends on MONO/POLY mode (8 voices) |
| **Trigger routing** | Per-voice + global (T1-T6, SUM) | Note-on/gate events |
| **State cleanup** | Per-voice (on voice change) | Per-voice (on note release) |
| **Modal UI** | Voice selector (1-6 buttons) | No voice selector |

For detailed per-voice behaviour and polyphonic modulation strategies, see [Per-Voice Modulation Guide](per-voice.md).

## Visual Feedback

When PPMod is active on a parameter, you'll see:

- **Knob/fader indicator** - Shows base value (solid line) and modulated value (animated dashed line/fill)
- **Label brightness** - Pulses with modulation intensity (brighter = higher value, dimmer = lower value)
- **Waveform visualisation** - Modal canvas shows real-time modulation waveform/pattern
- **Step highlighting** - SEQ and TM modes highlight the current active step

The visual feedback persists even when the modal is closed, providing at-a-glance insight into active modulations.

## Next Steps

- **[PPMod Modes Reference](ppmod-modes.md)** - Detailed parameter documentation for all 6 modes
- **[Per-Voice Modulation](per-voice.md)** - Advanced per-voice techniques for polyphonic modulation
- **[Modulation Recipes](modulation-recipes.md)** - Preset configurations and sound design tips
