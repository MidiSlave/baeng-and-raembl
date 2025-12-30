# SLICE Breakbeat Slicer Engine

Complete guide to the SLICE breakbeat slicer engine in Bæng, featuring automatic beat detection, re-sequencing capabilities, and intelligent decay behaviour.

---

## Table of Contents

1. [Overview](#overview)
2. [Loading Loops](#loading-loops)
3. [The Slice Editor](#the-slice-editor)
4. [Slice Selection](#slice-selection)
5. [Pitch Shifting](#pitch-shifting)
6. [Decay Behaviour](#decay-behaviour)
7. [Re-sequencing Techniques](#re-sequencing-techniques)
8. [Sound Design Tips](#sound-design-tips)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The SLICE engine is a breakbeat slicing tool that divides audio loops into rhythmic segments (slices) which can be individually triggered, pitched, and re-sequenced. It's ideal for creating glitchy percussion, chopped breaks, and rhythmic variations from drum loops.

### Key Features

- **Automatic Beat Detection** - Transient analysis automatically identifies slice points
- **Manual Editing** - Full waveform editor for precise slice marker placement
- **Per-Slice Playback** - Each voice can trigger a different slice from the same loop
- **Pitch-Aware Decay** - Decay time scales with slice length and playback rate
- **Grid Slicing** - Automatic grid-based slicing (2-64 equal divisions)
- **Re-sequencing** - Use Euclidean patterns and step sequencer to create new rhythms
- **Smooth Retriggering** - Crossfade-based cut groups prevent clicks

### Typical Workflow

1. Load a breakbeat or loop sample
2. Automatically detect transients or manually edit slice markers
3. Assign different slices to different voices
4. Program new patterns using the step sequencer
5. Add pitch variation and effects for creative sound design

---

## Loading Loops

### Supported Formats

The SLICE engine supports the following audio formats:
- **WAV** (preferred, lossless)
- **MP3** (lossy compression)
- **OGG** (lossy compression)

**Recommended:** Use WAV files for best audio quality and slice detection accuracy.

### Loading a Loop

1. **Select a voice** with the SLICE engine (or switch an existing voice to SLICE)
2. **Click the SLICE knob** in the ENGINE module to open the slice editor
3. **Click "Load Loop"** button in the editor
4. **Select your audio file** from the file picker
5. **Automatic detection runs** - the editor will automatically detect transient peaks and create slice markers
6. **Preview and edit** - listen to individual slices and adjust markers as needed
7. **Click "Done"** to apply the slice configuration to the voice

### What Makes a Good Loop?

**Best:**
- Breakbeats with clear transient peaks (Amen Break, Apache, Funky Drummer)
- Drum loops with distinct hits
- Percussive loops with rhythmic variation
- Pre-trimmed loops (no silence at start/end)

**Challenging:**
- Heavily compressed loops (transients are difficult to detect)
- Ambient/pad material (no clear peaks)
- Loops with excessive reverb tails (detection may trigger on reverb)

---

## The Slice Editor

The slice editor provides comprehensive tools for preparing breakbeats for re-sequencing.

### Editor Layout

#### Waveform Display
- **Waveform View** - Visual representation of the loaded audio
- **Slice Markers** - Vertical red lines indicating slice boundaries
- **Playhead** - Shows current playback position during preview
- **Trim Markers** - Yellow handles at start/end for sample trimming
- **Hover Highlighting** - Slices highlight on mouseover

#### Transport Controls
- **Play Button** - Preview the entire loop
- **Slice Playback** - Click individual slices to preview them
- **Stop** - Stop playback

#### Detection Controls
- **DETECT** - Run automatic transient detection
- **THRESHOLD** - Sensitivity for transient detection (0-100)
  - Higher values = only detect strong transients
  - Lower values = detect subtle transients (may create too many slices)
- **CLEAR ALL** - Remove all slice markers

#### Grid Controls
- **GRID SLIDER** - Create evenly-spaced slices (2-64 divisions)
- Useful for loops without clear transients or for creating regular divisions

#### Sample Controls
- **ROTATION** - Rotate sample content (shift start point)
- **TRIM START** - Drag yellow handle to trim loop start
- **TRIM END** - Drag yellow handle to trim loop end

#### Navigation
- **Zoom In/Out** - Mouse wheel on waveform
- **Scroll** - Drag scrollbar thumb at bottom of waveform
- **Scrollbar Edges** - Drag edges to adjust zoom level

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Space** | Play/stop preview |
| **Scroll Wheel** | Zoom in/out |
| **Double-click** | Add slice marker at position |
| **Click marker** | Select marker |
| **Delete/Backspace** | Delete selected marker |
| **Shift** | Fine mode for rotation slider |
| **Escape** | Close editor |

---

## Slice Selection

### Macro Controls

The SLICE knob in the ENGINE module controls which slice is triggered when the voice fires.

**SLICE (0-N)** - Slice index selection
- **0** - First slice
- **1** - Second slice
- **N-1** - Last slice (where N = total number of slices)

### Modulation for Dynamic Selection

Use PPMod to dynamically change which slice is triggered:

**LFO Modulation:**
```
Mode: LFO
Waveform: Triangle or Saw
Rate: Synced to clock (1/4, 1/8, etc.)
Depth: 100%
```
Result: Slices cycle through the loop rhythmically

**Random Modulation:**
```
Mode: RND
Probability: 100%
Depth: 100%
```
Result: Random slice selection on each trigger

**Sequencer Modulation:**
```
Mode: SEQ
Pattern: Custom slice sequence
Length: 4-16 steps
```
Result: Precise slice programming for rhythmic patterns

---

## Pitch Shifting

### PITCH Control

The PITCH knob transposes slices in semitones via playback rate adjustment.

**Range:** -24 to +24 semitones (2 octaves down/up)
- **0** - Original pitch (no transposition)
- **+12** - One octave up (2x playback speed)
- **-12** - One octave down (0.5x playback speed)

### Pitch and Slice Length

**Important:** Pitch shifting affects both pitch AND slice duration:
- **Positive pitch** (+12 semitones) = 2x faster playback = **shorter slice**
- **Negative pitch** (-12 semitones) = 0.5x slower playback = **longer slice**

The decay envelope automatically compensates for this (see [Decay Behaviour](#decay-behaviour)).

### Creative Uses

**Tape-Stop Effect:**
```
Modulation: ENV
Target: PITCH
Attack: 5ms
Decay: 200ms
Depth: -100% (drops from 0 to -24 semitones)
```
Result: Classic tape-stop pitch dive

**Randomised Pitch Variation:**
```
Modulation: RND
Target: PITCH
Depth: 20-30%
Probability: 100%
```
Result: Slight pitch variation per hit (organic, human feel)

**Rhythmic Pitch Sequence:**
```
Modulation: SEQ
Target: PITCH
Pattern: [0, +3, +7, +12] (root, minor 3rd, 5th, octave)
Length: 4 steps
```
Result: Melodic slice pattern

---

## Decay Behaviour

The SLICE engine features an innovative **percentage-based decay system** that ensures consistent envelope behaviour across different slice lengths and playback rates.

### How It Works

**Traditional sampler decay:** Fixed time in milliseconds (e.g., 500ms)
- Problem: Short slices get cut off before natural end
- Problem: Long slices ring out longer than envelope

**SLICE decay:** Percentage of slice length (10%-110%)
- **10%** - Very short decay (tight, gated slice)
- **50%** - Decay reaches halfway through slice
- **100%** - Decay matches slice natural length
- **110%** - Decay extends slightly beyond slice boundary

### Technical Implementation

From `sampler-engine.js` (lines 113-134):

```javascript
// Calculate decay relative to slice length (pitch-aware)
const sliceLengthSamples = (this.playbackEnd - this.playbackStart) / this.playbackRate;
const sliceDurationMs = (sliceLengthSamples / this.sampleRate) * 1000;

// Map decay (0-0.99) to percentage of slice duration (10%-110%)
const decayPercentage = 0.1 + (this.decay / 0.99) * 1.0;
const targetDecayMs = sliceDurationMs * decayPercentage;
```

### Practical Examples

**DECAY = 10 (tight, gated)**
- Short slice (50ms): Decay = 5ms → punchy, clipped
- Long slice (500ms): Decay = 50ms → still punchy, scales proportionally

**DECAY = 50 (mid-length)**
- Short slice (50ms): Decay = 30ms → short tail
- Long slice (500ms): Decay = 300ms → medium tail

**DECAY = 100 (full slice)**
- Short slice (50ms): Decay = 55ms → rings out completely
- Long slice (500ms): Decay = 550ms → full duration

### Pitch Compensation

The decay calculation accounts for pitch shift:

**Example:** Slice is 100ms at original pitch
- **PITCH = +12 semitones** (2x speed)
  - Actual playback duration = 50ms
  - DECAY = 50 → envelope decay = 30ms (proportional to new length)
- **PITCH = -12 semitones** (0.5x speed)
  - Actual playback duration = 200ms
  - DECAY = 50 → envelope decay = 120ms (proportional to new length)

**Result:** Decay envelope feels consistent regardless of pitch transposition.

### FILTER Control

**FILTER (0-100)** - Lowpass filter cutoff frequency
- **0-49** - Lowpass mode (darker, removes high frequencies)
- **50** - No filtering (bypass)
- **51-100** - Highpass mode (brighter, removes low frequencies)

**Use Cases:**
- **Lowpass (0-40)** - Muffled, lo-fi character
- **Highpass (60-100)** - Thin, crispy character
- **Modulation** - Automate filter for timbral variation

---

## Re-sequencing Techniques

The true power of the SLICE engine lies in re-sequencing breaks into new rhythmic patterns.

### Basic Re-sequencing

1. **Load a breakbeat** (e.g., Amen Break, Apache)
2. **Assign slices to voices:**
   - Voice 1: Slice 0 (kick)
   - Voice 2: Slice 2 (snare)
   - Voice 3: Slice 1 (hi-hat)
3. **Program patterns** using the step sequencer
4. **Result:** Original break re-arranged into new groove

### Euclidean Slicing

Use Euclidean fills to create algorithmic re-sequences:

**Voice 1 (Kick Slice):**
```
STEPS: 16
FILLS: 4
SHIFT: 0
Result: Four-on-the-floor kick pattern
```

**Voice 2 (Snare Slice):**
```
STEPS: 16
FILLS: 3
SHIFT: 2
Result: Offset snare hits (creates polyrhythm)
```

**Voice 3 (Hi-Hat Slice):**
```
STEPS: 16
FILLS: 11
SHIFT: 0
DEVIATION: 30%
Result: Busy hi-hat with timing variation
```

### Glitch Techniques

**Slice Stuttering:**
```
Voice settings:
- SLICE: 5 (mid-break slice)
- RATCHET: 7 (8x retriggering)
- DECAY: 20 (short, tight)
Result: Rapid-fire glitch stutter
```

**Random Slice Triggering:**
```
Modulation on SLICE parameter:
- Mode: RND
- Depth: 100%
- Probability: 100%
Step probability: 50%
Result: Unpredictable glitchy percussion
```

**Trill on Slices:**
```
Voice settings:
- SLICE: 3
- PITCH: +7 semitones
- Sequencer: Enable TRILL on specific steps
Result: Rapid alternation between slice 3 and adjacent pitch
```

### Multi-Voice Layering

Create complex breaks by layering multiple SLICE voices:

**Setup:**
- Voice 1: SLICE engine → Full break (low slices)
- Voice 2: SLICE engine → Same break (mid slices)
- Voice 3: SLICE engine → Same break (high slices)
- Voice 4: aSNARE → Synthetic snare overlay
- Voice 5: aHIHAT → Synthetic hi-hat overlay

**Result:** Hybrid acoustic/synthetic breaks with maximum control.

### Polyrhythmic Slicing

Use different sequence lengths per voice for evolving patterns:

**Voice 1 (Kick Slice):**
- STEPS: 4 (short loop)

**Voice 2 (Snare Slice):**
- STEPS: 3 (creates 3:4 polyrhythm)

**Voice 3 (Hi-Hat Slice):**
- STEPS: 7 (odd rhythm, creates long-form variation)

**Result:** Pattern repeats every 84 steps (LCM of 4, 3, 7).

---

## Sound Design Tips

### Creating Tight, Punchy Slices

- **DECAY:** 10-30 (short, gated)
- **FILTER:** 50 (no filtering) or 60-70 (slight highpass for clarity)
- **DRIVE:** 30-50 (add harmonic richness)
- **REVERB SEND:** 0-10 (minimal ambience)

### Creating Loose, Ambient Slices

- **DECAY:** 80-110 (long, sustained)
- **FILTER:** 30-40 (lowpass for warmth)
- **REVERB SEND:** 40-70 (lush tail)
- **DELAY SEND:** 20-40 (rhythmic echoes)

### Glitchy, Stuttering Effects

- **RATCHET:** 5-7 (6x-8x retriggering)
- **DECAY:** 10-20 (very short)
- **PITCH MODULATION:** RND mode, 20-40% depth
- **BIT REDUCTION:** 40-70 (digital degradation)

### Classic Breakbeat Sound

- **DECAY:** 60-80 (medium-long)
- **FILTER:** 50 (neutral) or 45 (slight warmth)
- **DRUM BUS PROCESSING:**
  - DRIVE: 20-30 (warmth)
  - CRUNCH: 15-25 (grit)
  - BOOM: 20 (sub reinforcement)
  - COMP: ON (glue)

### Pitched Melodic Slicing

1. **Select a tonal slice** (kick, tom, or bass-heavy slice)
2. **Enable PITCH modulation:**
   - Mode: SEQ
   - Pattern: [0, +3, +7, +12] (minor chord)
   - Length: 4 steps
3. **Adjust DECAY:** 40-60 (medium sustain)
4. **Add REVERB:** 30-50 (spacious)

**Result:** Slice becomes a melodic instrument.

---

## Troubleshooting

### Slice Detection Issues

**Problem:** Too many slices detected
- **Solution:** Increase THRESHOLD slider (detect only strong transients)
- **Solution:** Use CLEAR ALL and manually add slices via double-click
- **Solution:** Try GRID mode for evenly-spaced divisions

**Problem:** Not enough slices detected
- **Solution:** Decrease THRESHOLD slider (detect subtle transients)
- **Solution:** Manually add slices via double-click on waveform

**Problem:** Slices cut off transients
- **Solution:** Manually drag slice markers earlier in the waveform
- **Solution:** Add slight pre-roll by positioning markers 5-10ms before peak

### Playback Issues

**Problem:** Slices sound clicky/abrupt
- **Solution:** The engine includes automatic 32-sample fadeout (< 1ms at 48kHz)
- **Solution:** Increase DECAY to allow smoother tail
- **Solution:** Add REVERB SEND (10-20) for natural blending

**Problem:** Slices too short/cut off
- **Solution:** Increase DECAY parameter (10-110%)
- **Solution:** Check that slice markers aren't too close together
- **Solution:** Use longer slices (merge markers if necessary)

**Problem:** Pitch shifting sounds wrong
- **Solution:** Extreme pitch shifts (+/-24 semitones) create artefacts
- **Solution:** Stay within +/-12 semitones for natural results
- **Solution:** Use FILTER to tame harsh frequencies from pitch shifting

### Editor Issues

**Problem:** Can't see entire waveform
- **Solution:** Zoom out using mouse scroll wheel
- **Solution:** Drag scrollbar edges to adjust zoom

**Problem:** Slice markers won't delete
- **Solution:** Click marker to select (turns yellow)
- **Solution:** Press Delete or Backspace key
- **Solution:** Use CLEAR ALL to remove all markers

**Problem:** Preview playback doesn't work
- **Solution:** Ensure browser audio is enabled (click window first)
- **Solution:** Check browser console for errors (F12)
- **Solution:** Try reloading the loop

---

## Related Documentation

- [Bæng User Guide](../../user-guide/baeng-guide.md) - Complete Bæng documentation
- [DX7 Engine Guide](dx7-engine.md) - DX7 FM synthesis engine
- [Per-Parameter Modulation Guide](../../user-guide/ppmod-guide.md) - PPMod system

---

## Credits

The SLICE engine is part of the **Bæng & Ræmbl** merged synthesiser suite.

Developed by naenae.

Inspired by classic hardware samplers (Akai MPC, E-mu SP-1200) and modern slicing tools (Ableton Simpler, Native Instruments Battery).

Built with the Web Audio API.

---

**For more information:**
- [GitHub Repository](https://github.com/MidiSlave/baeng-and-raembl)
- [Live Application](https://midislave.github.io/baeng-and-raembl/)
