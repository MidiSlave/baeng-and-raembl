# Bæng Step Sequencer

Complete guide to Bæng's 6-voice step sequencer with Euclidean pattern generation, per-step parameters, and advanced timing features.

---

## Table of Contents

1. [Overview](#overview)
2. [Step Grid](#step-grid)
3. [Voice Selection](#voice-selection)
4. [Step Parameters](#step-parameters)
5. [Euclidean Pattern Generator](#euclidean-pattern-generator)
6. [Pattern Operations](#pattern-operations)
7. [Timing & Synchronisation](#timing--synchronisation)
8. [Tips & Techniques](#tips--techniques)

---

## Overview

Bæng features a powerful 6-voice step sequencer designed for rhythm programming. Each voice has an independent 16-step pattern with per-step control over gate, accent, ratchet, and probability parameters.

**Key Features:**
- 6 independent voices with stacked visual layout
- Up to 16 steps per voice (adjustable via Euclidean STEPS parameter)
- Per-step gate, accent, ratchet, and probability control
- Algorithmic Euclidean rhythm generator
- Pattern copy/paste between voices
- Synchronised to shared clock with swing support
- Visual step indicators with real-time playback feedback

**Related Documentation:**
- [Euclidean Patterns](euclidean-patterns.md) - Algorithm details and pattern theory
- [Step Parameters](step-parameters.md) - Deep dive into accent, ratchet, deviation
- [Bæng User Guide](../user-guide/baeng-guide.md) - Complete Bæng documentation

---

## Step Grid

The step grid displays all 6 voices simultaneously in a stacked layout, providing visual feedback for pattern programming and playback.

### Grid Layout

```
┌──────────────────────────────────────────────┐
│ ○  □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □  (Voice 1) │
│ △  □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □  (Voice 2) │
│ ▢  □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □  (Voice 3) │
│ ▱  □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □  (Voice 4) │
│ ◇  □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □  (Voice 5) │
│ ⬡  □ □ □ □ □ □ □ □ □ □ □ □ □ □ □ □  (Voice 6) │
└──────────────────────────────────────────────┘
```

Each row represents a single voice, with the voice selector icon on the left and 16 step slots to the right.

### Voice Icons

| Icon | Voice | Default Engine |
|------|-------|----------------|
| ○ Circle | Voice 1 | Analog Kick (aKICK) |
| △ Triangle | Voice 2 | Analog Snare (aSNARE) |
| ▢ Square | Voice 3 | Analog Hi-Hat (aHIHAT) |
| ▱ Trapezoid | Voice 4 | DX7 FM Synth |
| ◇ Diamond | Voice 5 | Sample Player (SAMPLE) |
| ⬡ Hexagon | Voice 6 | Slice Player (SLICE) |

### Step Visual States

Steps display different visual patterns based on their configuration:

| Visual | State | Description |
|--------|-------|-------------|
| Empty box | Gate OFF | Step is inactive |
| Small box | Gate ON (no accent) | Standard trigger |
| Large box | Gate ON + Accent | Accented trigger (1.5× velocity) |
| Double boxes (small+large) | Flam | Grace note + accented primary note (15ms apart) |
| Multiple boxes | Ratchet | Multiple triggers (2-8×) within step duration |
| Faded opacity | Low probability | Step trigger chance < 100% |
| Yellow highlight | Active step | Currently playing step (during playback) |

### Programming the Grid

**Mouse Interactions:**
- **Click step** - Toggle gate ON/OFF
- **Drag across steps** - Paint gates (all ON or all OFF)
- **Shift + Click** - Add accent to step
- **Ctrl/Cmd + Click** - Add ratchet to step
- **Alt + Click** - Adjust probability

**Keyboard Shortcuts:**
- `1-6` - Select voice (direct access)
- `Space` - Toggle play/stop
- `Shift + Click step` - Hold Shift and click to edit step parameters

> **Note:** Step parameter editing requires selecting a voice first. The selected voice row is highlighted.

---

## Voice Selection

### Selecting Voices

Click the voice icon on the left of each row to select that voice for editing. The selected voice is indicated by:
- Highlighted row background
- Active state on voice selector button
- Parameter controls (STEPS, FILLS, etc.) update to show selected voice values

**Quick Selection:**
- Press `1-6` on keyboard for direct voice access
- Click voice selector icons on the left side of the grid
- Use up/down arrow keys to navigate voices (when grid has focus)

### Voice Muting

Each voice can be muted independently:
- Click the voice selector button while holding `M` key
- Muted voices show dimmed icon
- Muted voices do not trigger during playback
- Pattern editing still works when muted (silent editing)

### Voice-Specific Settings

Each voice maintains independent settings:
- **Pattern length** - 1-16 steps (STEPS parameter)
- **Euclidean configuration** - Fills, shift, accent/flam/ratchet distribution
- **Gate duration** - 0-100% (GATE parameter in VOICES module)
- **Probability** - 0-100% voice-wide trigger chance (PROB parameter)
- **Choke group** - 0-4, mutes other voices in same group (CHOKE parameter)

---

## Step Parameters

Each step supports multiple parameters that control trigger behaviour. All parameters can be edited via the step grid or Euclidean generator controls.

### Gate

**Range:** ON/OFF
**Default:** OFF

Enables/disables the trigger for this step.
- Gate ON - Step triggers on every cycle (subject to probability)
- Gate OFF - Step is silent

**Editing:**
- Click step to toggle gate
- Drag across multiple steps to paint gates

### Accent

**Range:** 0-15
**Default:** 0

Boosts velocity and tightens envelope for punchy, emphasised hits.

**Effect on playback:**
- Velocity multiplier: `1.0 + (accent / 10) × 0.5` (0 = 1.0×, 10 = 1.5×, 15 = 1.75×)
- Attack shortened by 30% (snappier transient)
- Decay shortened by 20% (tighter punch)

**Editing:**
- Shift + Click step - Add accent (level 10)
- Use ACCENT knob in Euclidean controls - Distribute accents across fills algorithmically

**Use Cases:**
- Emphasise downbeats (steps 1, 5, 9, 13)
- Create dynamic variation in hi-hat patterns
- Add punch to snare backbeats

### Ratchet

**Range:** 0-7 (displays as 1-8 triggers)
**Default:** 0 (single trigger)

Divides the step into multiple rapid-fire triggers, creating rolls and fills.

**Trigger Distribution:**
- Ratchet value = number of **additional** triggers
- `ratchet = 0` → 1 trigger (normal)
- `ratchet = 1` → 2 triggers (double)
- `ratchet = 3` → 4 triggers (quad)
- `ratchet = 7` → 8 triggers (fastest)

**Timing:**
- Triggers evenly spaced within step duration
- Example: at 120 BPM (16th note = 125ms), ratchet=3 → 4 triggers @ 31.25ms intervals

**Editing:**
- Ctrl/Cmd + Click step - Add ratchet (speed determined by R-SPD parameter)
- RATCHET knob - Distribute ratchets across fills
- R-SPD knob - Set ratchet speed (1-8) for Euclidean-generated ratchets

**Use Cases:**
- Snare rolls at end of phrases
- Hi-hat triplet fills
- Kick drum stutter effects

### Probability

**Range:** 0-100%
**Default:** 100%

Sets the chance that a gated step will trigger.

**Two Probability Layers:**
1. **Per-Voice Probability** (PROB knob) - Applied to entire voice
2. **Per-Step Probability** - Individual step override

Both probabilities must pass for trigger to occur. Example:
- Voice PROB = 80%
- Step probability = 50%
- **Final trigger chance = 40%** (0.8 × 0.5)

**Editing:**
- Alt + Click step - Cycle through probability presets (100%, 66%, 33%, 0%)
- Visual indicator: low probability steps appear faded/translucent

**Use Cases:**
- Add humanisation to hi-hat patterns (90-95% probability)
- Create evolving drum patterns (mix 100%, 66%, 33% steps)
- Ghost notes (20-40% probability on accented steps)

### Deviation (Legacy)

**Range:** 0-100%
**Default:** 0
**Modes:** Early (0), Late (1), Both (2)

> **Note:** Deviation is a legacy parameter from earlier Bæng versions. It adds timing micro-variations to triggers but is **not actively used in current Euclidean workflow**. Flam (grace note + accent) is the preferred method for creating timing variations.

**Effect:**
- Shifts trigger timing slightly before/after beat
- Amount scales with deviation percentage
- Mode determines early/late/bidirectional shift

---

## Euclidean Pattern Generator

Bæng includes a powerful Euclidean rhythm generator based on Bjorklund's algorithm, allowing you to create mathematically distributed patterns with a few knob turns.

### Euclidean Algorithm

The algorithm distributes a given number of **fills** (active steps) across a specified number of **steps** as evenly as possible. This creates rhythmically interesting patterns found in traditional music worldwide.

**Example:**
- **STEPS = 16, FILLS = 5** → `[X . . X . . X . . X . . X . . . ]`
- **STEPS = 8, FILLS = 3** → `[X . . X . . X . ]` (Cuban tresillo)
- **STEPS = 16, FILLS = 4** → `[X . . . X . . . X . . . X . . . ]` (Four-on-the-floor)

For detailed theory and examples, see [Euclidean Patterns Documentation](euclidean-patterns.md).

### Euclidean Controls

Located in the VOICES module, these controls generate and modify patterns for the selected voice.

#### STEPS (1-16)

Sets the pattern length.

**Behaviour:**
- Pattern wraps at STEPS value, regardless of global bar length
- Steps beyond STEPS value are inactive (gates OFF)
- Changing STEPS redistributes fills using Euclidean algorithm

**Use Cases:**
- Polyrhythmic patterns: Voice 1 @ 16 steps, Voice 2 @ 12 steps
- Odd-time grooves: 7, 9, 11, 13 steps for asymmetric feels

#### FILLS (0-STEPS)

Number of active gates in the pattern.

**Behaviour:**
- Fills distributed evenly across STEPS using Bjorklund's algorithm
- FILLS = 0 → empty pattern (all gates OFF)
- FILLS = STEPS → every step ON (solid pattern)
- Changing FILLS regenerates entire pattern

**Constraint:** ACCENT + FLAM + RATCHET must be ≤ FILLS
If decorations exceed fills, they are proportionally reduced.

**Use Cases:**
- Quick pattern sketching: set STEPS, adjust FILLS to taste
- Variation generation: increment/decrement FILLS for subtle changes

#### SHIFT (0-STEPS-1)

Rotates the pattern clockwise (positive) or anticlockwise (negative).

**Behaviour:**
- SHIFT = 0 → no rotation (original Euclidean pattern)
- SHIFT = 1 → pattern rotated 1 step to the right
- SHIFT wraps at STEPS value
- Rotation applied **after** fill/accent/ratchet distribution

**Use Cases:**
- Find best downbeat placement (rotate pattern to align with beat 1)
- Create variations without regenerating pattern
- Sync multiple voices with different phase relationships

#### ACCENT (0-FILLS)

Distributes accent markings across filled steps using Euclidean algorithm.

**Behaviour:**
- Accents applied to subset of fills (Euclidean distribution within fills)
- Priority order: **Ratchet > Flam > Accent** (mutual exclusion)
- Accent value set to 10 (1.5× velocity boost) for Euclidean-generated accents

**Example:**
- FILLS = 8, ACCENT = 2 → 2 out of 8 fills are accented
- Distribution: `[X . X . X . X . X . X . X . X . ]` → `[X̂ . X . X . X . X̂ . X . X . X . ]`

**Use Cases:**
- Automatic downbeat emphasis
- Dynamic hi-hat patterns (accented off-beats)
- Layered rhythmic complexity

#### FLAM (0-FILLS)

Distributes flam markings across filled steps.

**Behaviour:**
- Flam = grace note (quiet, 15ms early) + primary note (accented, on-beat)
- Mutual exclusion: step cannot have both flam and ratchet
- Priority: **Ratchet > Flam > Accent**

**Technical Implementation:**
- Grace note: 18% velocity, -15ms timing offset
- Primary note: Full velocity with accent (1.5×), on-beat
- Both notes layer without voice release (creates tight "flam" texture)

**Example:**
- FILLS = 4, FLAM = 2 → 2 out of 4 fills become flams
- Visual: Small box (grace note) + Large box (primary note)

**Use Cases:**
- Humanised snare hits
- Hi-hat "drag" effects
- Jazz/funk drum fills

#### RATCHET (0-FILLS)

Distributes ratchet markings across filled steps.

**Behaviour:**
- Highest priority decoration (applied before flam/accent)
- Ratchet speed controlled by R-SPD parameter (1-8 triggers)
- Steps with ratchet cannot have flam or accent (mutual exclusion)

**Example:**
- FILLS = 8, RATCHET = 2, R-SPD = 4 → 2 fills become quad-ratchets (4 triggers each)

**Use Cases:**
- Snare roll buildups
- Kick drum stutters
- Hi-hat triplet patterns

#### R-SPD (Ratchet Speed: 1-8)

Sets the number of triggers for Euclidean-generated ratchets.

**Values:**
- 1 = double (2 triggers)
- 2 = triple (3 triggers)
- 3 = quad (4 triggers)
- ...
- 7 = octuple (8 triggers)

**Note:** R-SPD only affects ratchets created by the RATCHET parameter. Manually-added ratchets (Ctrl+Click) use a separate per-step ratchet value.

#### GATE (0-100%)

Controls note duration for the selected voice.

**Behaviour:**
- 0% = very short gate (staccato)
- 50% = half step duration
- 100% = full step duration (legato)
- Special case (DX7 only): 100% gate in mono mode enables portamento slide

**Note:** GATE is a voice-wide parameter, not per-step. It applies to all triggers from the selected voice.

**Use Cases:**
- Staccato hi-hats (10-20% gate)
- Sustained pads (80-100% gate)
- Melodic slides (DX7 @ 100% gate, mono mode)

#### PROB (Probability: 0-100%)

Voice-wide trigger probability.

**Behaviour:**
- Applied to all steps in the voice
- Multiplies with per-step probability if set
- 100% = deterministic playback
- 0% = voice effectively muted

**Use Cases:**
- Sparse percussion layers (30-60%)
- Evolving patterns (combine with per-step probability)
- Controlled randomness

#### CHOKE (Choke Group: 0-4)

Assigns voice to a choke group for mutually exclusive triggering.

**Behaviour:**
- 0 = no choke (voice plays freely)
- 1-4 = choke group number
- When a voice in group N triggers, all other voices in group N are stopped

**Example - Hi-Hat Choke:**
- Voice 3 (Closed Hat) → CHOKE = 2
- Voice 5 (Open Hat) → CHOKE = 2
- **Result:** Closed hat cuts off open hat (realistic hi-hat behaviour)

**Use Cases:**
- Realistic hi-hat voicing (closed chokes open)
- Percussion group management (congas, bongos)
- Creative rhythmic gating effects

---

## Pattern Operations

### Copy Pattern

Copy a sequence from one voice to another.

**Steps:**
1. Select source voice (click voice icon)
2. Hold `Shift` + click destination voice icon
3. Pattern is copied instantly (gates, accents, ratchets, probability)

**What's Copied:**
- All 64 step data (gate, accent, ratchet, probability, deviation)
- Pattern length (STEPS value)
- Voice probability (PROB value)
- Euclidean parameters (FILLS, SHIFT, ACCENT, FLAM, RATCHET, R-SPD)

**What's NOT Copied:**
- Voice-specific parameters (engine settings, FX sends, level, pan)
- Choke group assignment
- Currently playing step position

**Use Cases:**
- Create variations by copying pattern then modifying
- Build layered rhythms (copy kick to snare, shift by 4 steps)
- Backup patterns before experimentation

### Clear Pattern

Reset all steps in a voice to default (gates OFF).

**Steps:**
1. Select voice to clear
2. Hold `Shift` + click voice selector button twice (double-click with Shift held)
3. Pattern is cleared instantly

**What's Cleared:**
- All gates set to OFF
- All accents reset to 0
- All ratchets reset to 0
- All probability reset to 100%
- All deviation reset to 0

**What's Preserved:**
- Pattern length (STEPS)
- Euclidean parameters (for quick regeneration)
- Voice settings (engine, FX, level)

**Undo:** Not available - use Save Voice Patch before clearing for safety

### Save/Load Voice Patches

Preserve entire voice configuration (pattern + settings) to file.

**Save Voice Patch:**
1. Select voice to save
2. Click "Save Voice Patch" button (floppy disk icon in VOICES module header)
3. Choose location and filename
4. Saved as `.baeng-voice.json` file

**What's Saved:**
- Complete 64-step sequence data
- Euclidean parameters
- Voice settings (engine, level, pan, FX sends)
- Engine-specific parameters (DX7 patch, sample bank, analog settings)
- Per-parameter modulation configurations (PPMod)

**Load Voice Patch:**
1. Select destination voice
2. Click "Load Voice Patch" button (download icon in VOICES module header)
3. Select `.baeng-voice.json` file
4. Voice settings and pattern are restored

**Use Cases:**
- Build personal sound library
- Share patterns with collaborators
- A/B comparison (save version A, edit, load version A to compare)

---

## Timing & Synchronisation

### Clock Synchronisation

Bæng's sequencer is driven by a shared audio-thread scheduler with 100ms lookahead, ensuring sample-accurate timing synchronised with Ræmbl.

**Clock Architecture:**
- Scheduler runs at 25ms polling rate
- 100ms lookahead window schedules triggers in audio time
- Swing applied as timing offset (not quantisation)
- Per-app polymetric support (Bæng and Ræmbl can have different bar lengths)

**Related:** See [Shared Clock Documentation](../reference/clock-system.md) for technical details.

### Tempo (BPM)

**Range:** 20-300 BPM
**Default:** 120 BPM
**Location:** Shared time strip at bottom of interface

Controls global tempo for both Bæng and Ræmbl.

**Note Timing:**
- Quarter note = 60000ms / BPM
- 16th note (step duration) = quarter note / 4
- Example at 120 BPM: 16th note = 125ms

### Swing

**Range:** 0-100%
**Default:** 0%
**Location:** Shared time strip

Delays off-beat (odd-numbered) steps to create shuffle feel.

**Swing Calculation:**
- 0% = straight timing (no swing)
- 50% = moderate swing (classic hip-hop feel)
- 100% = maximum swing (approaching dotted rhythm)
- Formula: `swingOffset = (stepDuration / 2) × (swing / 100)`

**Which Steps Are Swung:**
- Even steps (0, 2, 4, 6...) = on-beat, no offset
- Odd steps (1, 3, 5, 7...) = off-beat, delayed by swingOffset

**Use Cases:**
- 30-40% swing: subtle groove (house, techno)
- 50-60% swing: pronounced shuffle (hip-hop, R&B)
- 65-75% swing: heavy swing (J Dilla, boom-bap)

### Bar Length

**Range:** 1-128 beats
**Default:** 4 beats (1 bar of 4/4)
**Location:** Shared time strip (LENGTH parameter)

Sets the loop point for Bæng's sequencer.

**Behaviour:**
- Bar length independent of pattern length (STEPS)
- Patterns wrap and loop based on STEPS, not bar length
- Bar length affects SEQ RESET behaviour (see below)

**Polymetric Operation:**
- Bæng and Ræmbl can have different bar lengths
- Example: Bæng @ 4 beats, Ræmbl @ 6 beats → polymetric loop every 12 beats

**Use Cases:**
- Short loops: 1-2 beats (drill, trap)
- Standard loops: 4 beats (house, techno, pop)
- Extended loops: 8-16 beats (progressive, breakbeat)
- Experimental: odd lengths (3, 5, 7 beats) for asymmetric grooves

### Sequence Reset Behaviour

**SEQ Button** (VOICES module header) controls sequence reset mode.

**Active (ON) - Default:**
- All voice sequences reset to step 0 when bar restarts
- Synchronised playback (all voices aligned to bar boundary)
- Predictable loop behaviour

**Inactive (OFF):**
- Voice sequences free-run (no reset on bar start)
- Polyrhythmic phasing (voices drift if STEPS ≠ bar length)
- Generative/evolving patterns

**Example - Polyrhythmic Phasing:**
1. Set Voice 1 STEPS = 16, Voice 2 STEPS = 12
2. Set bar length = 16 beats
3. Disable SEQ RESET
4. **Result:** Voice 1 loops every 16 steps, Voice 2 every 12 steps → pattern repeats every 48 steps (LCM of 16 and 12)

---

## Tips & Techniques

### Euclidean Workflow

**Quick Pattern Sketch:**
1. Select voice
2. Set STEPS (pattern length)
3. Adjust FILLS (density)
4. Use SHIFT to find best downbeat placement
5. Add ACCENT (2-3 for subtle emphasis)
6. Optionally add FLAM or RATCHET for variation

**Variation Generation:**
- Copy pattern to another voice
- Increment/decrement FILLS by 1-2
- Adjust SHIFT to create complementary rhythm

### Polyrhythmic Patterns

Create evolving, generative rhythms using different STEPS values across voices:

**Example Setup:**
- Voice 1 (Kick): STEPS = 16
- Voice 2 (Snare): STEPS = 12
- Voice 3 (Hat): STEPS = 9
- **Result:** Pattern repeats every 144 steps (LCM of 16, 12, 9) ≈ 9 bars at 16 steps/bar

**Tips:**
- Use prime numbers (7, 11, 13) for longer cycle times
- Disable SEQ RESET for full polyrhythmic effect
- Use coprime numbers (e.g., 9 & 16) for maximum variation

### Humanisation Techniques

**Probability-Based:**
- Hi-hats: 90-95% voice probability (subtle variation)
- Ghost notes: 30-50% per-step probability on accented steps
- Percussion layers: mix 100%, 66%, 33% probability steps

**Accent-Based:**
- Vary accent levels (5, 10, 15) for dynamic expression
- Euclidean ACCENT parameter for automatic emphasis
- Combine with swing for groove feel

**Timing-Based:**
- 30-50% swing for natural shuffle
- Flam on snare backbeats (steps 5, 13) for "lazy" feel
- Slight tempo variation (±2-3 BPM) during performance

### Advanced Techniques

**Ratchet Fills:**
- Programme 16-step kick pattern
- Set RATCHET = 1, R-SPD = 3 (triple ratchet)
- **Result:** Last kick becomes fill (step 16 ratchets 3×)

**Layered Accents:**
- Voice 1: FILLS = 4 (kick every 4 steps)
- Voice 2: Copy Voice 1, set ACCENT = 2
- Voice 2 level -6dB
- **Result:** Layered kick with accented hits (Gqom/Amapiano style)

**Probability Cascades:**
- Voice 1: 100% probability (solid groove)
- Voice 2: 75% probability (variation layer)
- Voice 3: 50% probability (sparse texture)
- **Result:** Evolving rhythmic density

**Gate Duration Expression:**
- Closed hat: 10-15% gate (tight, staccato)
- Open hat: 60-80% gate (sustained)
- Choke group = 2 for both
- **Result:** Realistic hi-hat voicing

---

## Related Documentation

- **[Euclidean Patterns](euclidean-patterns.md)** - Algorithm theory, examples, rhythm database
- **[Step Parameters](step-parameters.md)** - Deep dive into accent, ratchet, deviation, probability
- **[Bæng User Guide](../user-guide/baeng-guide.md)** - Complete Bæng documentation
- **[Shared Clock System](../reference/clock-system.md)** - Timing architecture and synchronisation
- **[PPMod System](../modulation/ppmod-overview.md)** - Per-parameter modulation for sequence parameters

---

## Technical Reference

### Sequencer State Structure

```javascript
sequences: [
  {
    length: 16,              // Active pattern length (1-16)
    probability: 100,        // Voice-wide probability (0-100%)
    currentStep: -1,         // Current playback position
    steps: [                 // Array of 64 step objects
      {
        gate: false,         // Gate ON/OFF
        accent: 0,           // Accent level (0-15)
        ratchet: 0,          // Ratchet count (0-7 → 1-8 triggers)
        probability: 100,    // Per-step probability (0-100%)
        deviation: 0,        // Timing deviation (0-100%)
        deviationMode: 1,    // 0=Early, 1=Late, 2=Both
        paramLocks: {}       // Parameter lock data (future feature)
      },
      // ... 63 more steps
    ],
    euclidean: {
      steps: 16,             // Pattern length (1-16)
      fills: 0,              // Number of active steps (0-steps)
      shift: 0,              // Pattern rotation (0-steps-1)
      accentAmt: 0,          // Accent count (0-fills)
      flamAmt: 0,            // Flam count (0-fills)
      ratchetAmt: 0,         // Ratchet count (0-fills)
      ratchetSpeed: 1,       // Ratchet speed (1-8)
      deviation: 0           // Deviation for accented steps (0-100%)
    }
  },
  // ... 5 more voices
]
```

### Parameter Ranges

| Parameter | Min | Max | Default | Unit | Notes |
|-----------|-----|-----|---------|------|-------|
| STEPS | 1 | 16 | 16 | steps | Pattern length |
| FILLS | 0 | STEPS | 0 | fills | Active gates |
| SHIFT | 0 | STEPS-1 | 0 | steps | Pattern rotation |
| ACCENT | 0 | FILLS | 0 | count | Euclidean accent distribution |
| FLAM | 0 | FILLS | 0 | count | Euclidean flam distribution |
| RATCHET | 0 | FILLS | 0 | count | Euclidean ratchet distribution |
| R-SPD | 1 | 8 | 1 | triggers | Ratchet speed |
| GATE | 0 | 100 | 80 | % | Voice-wide gate duration |
| PROB | 0 | 100 | 100 | % | Voice-wide probability |
| CHOKE | 0 | 4 | 0 | group | Choke group (0=none) |

### Event API

Sequencer broadcasts custom events for integration with other modules:

```javascript
// Track triggered (for per-parameter modulation)
document.addEventListener('trackTriggered', (event) => {
  const { trackIndex, accentLevel, isBarStart } = event.detail;
  // Handle trigger event
});

// Step advanced (visual feedback)
document.addEventListener('baengStepAdvanced', (event) => {
  const { voiceIndex, stepIndex } = event.detail;
  // Update step indicators
});
```

---

**Last Updated:** 2025-12-30
**Document Version:** 1.0
**Software Version:** Bæng & Ræmbl v1.2.0
