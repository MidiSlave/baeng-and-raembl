# Euclidean Rhythm Generation

**Algorithmic pattern creation using the Bjorklund algorithm**

Euclidean rhythms are a mathematically-derived method for distributing a given number of pulses (beats) as evenly as possible across a fixed number of steps. This technique, based on Bjorklund's algorithm (originally used in nuclear physics), produces natural-sounding rhythmic patterns found in traditional music from around the world.

## Overview

Bæng's Euclidean pattern generator transforms each voice's step sequencer into an algorithmic rhythm programmer. Instead of manually programming each step, you specify:

1. **Total number of steps** (pattern length)
2. **Number of pulses** (active beats to distribute)
3. **Rotation offset** (pattern shift)

The algorithm then distributes the pulses as evenly as possible across the steps, creating patterns that sound musically coherent despite being mathematically generated.

**Key Benefits:**
- Rapidly create complex polyrhythmic patterns
- Generate musically interesting rhythms with minimal parameters
- Explore traditional world music rhythms
- Layer multiple voices with different Euclidean patterns for evolving polyrhythms
- Automatic distribution of accents, flams, and ratchets across filled steps

---

## What Are Euclidean Rhythms?

Euclidean rhythms are patterns that maximise the evenness of pulse distribution across a cycle. They appear naturally in traditional music worldwide and can be generated algorithmically using Euclidean geometry principles.

### The Mathematical Principle

Given **k** pulses to distribute across **n** steps, the Euclidean algorithm finds the pattern that spaces pulses as evenly as possible. This is equivalent to finding the greatest common divisor (GCD) of two numbers using Euclid's algorithm—hence the name.

**Example: E(3,8) - 3 pulses in 8 steps**

```
Step:    1  2  3  4  5  6  7  8
Pattern: X  .  .  X  .  .  X  .
Gaps:    [2] [2] [2]
```

The algorithm distributes 3 pulses across 8 steps with gaps of `[3, 3, 2]` steps between pulses—as even as possible given the constraints.

### Real-World Examples

Many traditional rhythms are Euclidean:

- **Tresillo (3,8)** - Afro-Cuban clave pattern: `X..X..X.`
- **Cinquillo (5,8)** - Habanera rhythm: `X.XX.XX.`
- **Bossa Nova (5,16)** - Brazilian rhythmic foundation
- **Shiko (7,16)** - West African bell pattern
- **Soukous (3,4)** - Congolese dance rhythm

Euclidean rhythms feel natural because they mirror patterns humans have developed across cultures for centuries.

---

## The Bjorklund Algorithm

Bæng uses **Bjorklund's algorithm**, a computationally efficient method for generating Euclidean rhythms.

### How It Works

The algorithm distributes `k` pulses (fills) across `n` steps using simple division:

1. Calculate step size: `stepSize = n / k`
2. For each pulse `i` from 0 to k-1:
   - Place pulse at position `floor(i × stepSize)`

**Example: E(5,16) - 5 pulses in 16 steps**

```
stepSize = 16 / 5 = 3.2

Pulse 0: floor(0 × 3.2) = 0  → Step 1
Pulse 1: floor(1 × 3.2) = 3  → Step 4
Pulse 2: floor(2 × 3.2) = 6  → Step 7
Pulse 3: floor(3 × 3.2) = 9  → Step 10
Pulse 4: floor(4 × 3.2) = 12 → Step 13

Result: X..X..X..X..X...
        1  4  7  10 13
```

### Edge Cases

**All Pulses (k = n):**
Every step is filled: `XXXXXXXX`

**No Pulses (k = 0):**
All steps empty: `........`

**Single Pulse (k = 1):**
Pulse on first step only: `X.......`

---

## Euclidean Parameters in Bæng

Bæng's Euclidean controls are located in the **VOICES** module beneath the step grid. When you adjust these parameters, the step pattern updates automatically.

### Basic Parameters

#### STEPS (1-16)
**Total pattern length**

Defines how many steps the sequence contains. This also sets the sequence length (`SEQ LEN` display updates to match).

- **1-4 steps**: Very short loops (useful for kick/bass patterns)
- **8 steps**: Half-bar patterns
- **16 steps**: Full bar patterns (most common)

**Range:** 1-16 steps
**Default:** 16

> **Note:** The 16-step grid always displays, but only the first `STEPS` steps are active. The grid scrolls during playback for sequences longer than 16 steps (if this feature is implemented in future versions).

#### FILLS (0-16)
**Number of active pulses**

How many beats (gates) to distribute across the pattern. The algorithm spaces these as evenly as possible.

- **0 fills**: Silent sequence (all steps off)
- **Low fills (1-4)**: Sparse rhythms (kick drums, bass)
- **Medium fills (5-8)**: Moderate density (snares, claps)
- **High fills (9-16)**: Busy patterns (hi-hats, shakers)

**Range:** 0 to `STEPS` (automatically capped)
**Default:** 0

**Visual Feedback:** Steps with gates appear yellow in the step grid.

#### SHIFT (0-15)
**Pattern rotation/offset**

Rotates the entire pattern by the specified number of steps. This allows you to explore variations of the same Euclidean pattern by changing where it starts.

- **SHIFT = 0**: Pattern starts on beat 1
- **SHIFT = 1**: Pattern rotated 1 step right
- **SHIFT = 4**: Pattern rotated 1 beat right (in 16ths)

**Range:** 0 to `STEPS - 1`
**Default:** 0

**Example: E(5,8) with rotation**
```
SHIFT 0: X..X.X.X  (original)
SHIFT 1: .X..X.X.X (rotated 1 step)
SHIFT 2: X.X..X.X. (rotated 2 steps)
```

---

### Advanced Parameters

Bæng extends the basic Euclidean algorithm with parameters for distributing **step modifiers** (accents, flams, ratchets) across the filled steps.

#### ACCENT (0-16)
**Number of accented steps**

Distributes accent modifiers across filled steps using a nested Euclidean algorithm. Accented steps trigger at 1.5× velocity with snappier envelopes.

- Selects `ACCENT` steps from the `FILLS` active steps
- Uses Euclidean distribution for musical spacing
- Visual feedback: Accented steps show orange left border

**Range:** 0 to `FILLS` (automatically capped)
**Default:** 0

**Modifier Constraint:** `ACCENT + FLAM + RATCHET ≤ FILLS`

**Example:** E(7,16) with 3 accents distributes accents evenly across the 7 filled steps.

#### FLAM (0-16)
**Number of flammed steps**

Distributes flam modifiers (grace notes) across filled steps. Flammed steps trigger a quiet pre-hit ~30ms before the main trigger, creating realistic drum flam articulation.

- Selects `FLAM` steps from remaining fills (after ratchets allocated)
- Uses Euclidean distribution
- Visual feedback: Flammed steps appear with slightly offset timing

**Range:** 0 to `FILLS` (automatically capped)
**Default:** 0

**Modifier Constraint:** `ACCENT + FLAM + RATCHET ≤ FILLS`

#### RATCHET (0-16)
**Number of ratcheted steps**

Distributes ratchet modifiers across filled steps. Ratcheted steps retrigger multiple times within a single step (2-8 triggers depending on `R-SPD`).

- **Highest priority** modifier (allocated first)
- Selects `RATCHET` steps from filled steps
- Uses Euclidean distribution
- Visual feedback: Ratcheted steps show multiple triggers

**Range:** 0 to `FILLS` (automatically capped)
**Default:** 0

**Modifier Constraint:** `ACCENT + FLAM + RATCHET ≤ FILLS`

#### R-SPD (1-8)
**Ratchet speed multiplier**

Controls how many triggers occur within each ratcheted step.

- **1**: Double-time (2 triggers)
- **2**: Triple-time (3 triggers)
- **3-7**: Quad through 8× retriggering

**Range:** 1-8
**Default:** 1 (double-time)

**Example:** Ratchet on step 5 with R-SPD=3 triggers the voice 4 times during step 5.

#### DEV (0-100%)
**Deviation percentage**

Adds timing variation to accented steps by probabilistically triggering adjacent steps instead of the programmed step. Creates humanisation and shuffle grooves.

- **0%**: No deviation (strict timing)
- **33%**: Slight early/late variation
- **66%**: Moderate shuffle
- **100%**: Maximum timing looseness

**Range:** 0-100%
**Default:** 0

**Deviation Modes:**
- **Early (0)**: Can only trigger early
- **Late (1)**: Can only trigger late (used for accents)
- **Both (2)**: Can trigger early or late

> **Note:** Deviation mode is controlled internally. Accents use Late mode; flams use Early mode.

---

## Using Euclidean Patterns in Bæng

### Activating Euclidean Mode

Euclidean generation is always active in Bæng. Simply adjust the `STEPS` and `FILLS` parameters to generate a pattern.

**Quick Start:**
1. Select a voice (press 1-6 or click voice button)
2. Set `STEPS` to desired pattern length (e.g., 16)
3. Set `FILLS` to number of pulses (e.g., 4 for kick drum)
4. Adjust `SHIFT` to rotate pattern
5. Add `ACCENT`, `FLAM`, or `RATCHET` for variation

**Visual Feedback:**
The 16-step grid updates immediately to show the generated pattern. Yellow steps = gates, orange borders = accents.

### Modifier Priority System

When distributing modifiers across filled steps, Bæng uses a priority system to prevent overlaps:

**Priority Order (highest to lowest):**
1. **RATCHET** - Allocated first
2. **FLAM** - Allocated from remaining fills
3. **ACCENT** - Allocated from remaining fills

This ensures modifiers don't conflict. For example, a step cannot be both ratcheted and flammed.

**Example Allocation:**
```
STEPS = 8, FILLS = 5
RATCHET = 2, FLAM = 1, ACCENT = 2

Step 1: Filled (ratchet)
Step 2: Empty
Step 3: Filled (flam)
Step 4: Empty
Step 5: Filled (accent)
Step 6: Empty
Step 7: Filled (accent)
Step 8: Empty
```

### Pattern Rotation Behaviour

**All patterns rotate together:**
When you adjust `SHIFT`, the gate pattern and all modifier patterns (accent/flam/ratchet) rotate in unison. This preserves the relationship between modifiers and gates.

**Example:**
```
Original:  X..X..X.X (gates)
           A.....R.A (accents + ratchet)

SHIFT +1:  .X..X..X.X
           .A.....R.A
```

Modifiers stay attached to their original gates after rotation.

---

## Classic Euclidean Patterns

Here are musically useful Euclidean patterns with their traditional names and applications:

| Pattern | Steps | Fills | Name | Origin | Use In Bæng |
|---------|-------|-------|------|--------|-------------|
| **E(2,3)** | 3 | 2 | Tresillo (half) | Cuba | Minimal bass pattern |
| **E(3,4)** | 4 | 3 | Soukous | Congo | Four-on-floor variation |
| **E(3,8)** | 8 | 3 | Tresillo | Cuba | Classic clave pattern |
| **E(4,9)** | 9 | 4 | Aksak | Turkey | Odd-meter pattern |
| **E(5,8)** | 8 | 5 | Cinquillo | Cuba | Habanera rhythm |
| **E(5,12)** | 12 | 5 | Venda | South Africa | Polyrhythmic layer |
| **E(5,16)** | 16 | 5 | Bossa Nova | Brazil | Syncopated snare pattern |
| **E(7,16)** | 16 | 7 | Gahu | Ghana | Busy hi-hat pattern |
| **E(9,16)** | 16 | 9 | - | - | Dense offbeat pattern |
| **E(11,16)** | 16 | 11 | - | - | Very busy hats/shakers |
| **E(13,16)** | 16 | 13 | - | - | Almost-full pattern |

### Suggested Voice Assignments

**Kick Drums:**
- E(4,16) - Four-on-floor
- E(3,8) - Tresillo kick
- E(5,12) - Syncopated kick

**Snare/Claps:**
- E(2,8) - Backbeat (steps 5, 9 in 16ths)
- E(5,16) - Bossa nova snare
- E(3,7) - Odd-meter snare

**Hi-Hats (Closed):**
- E(8,16) - Straight 8ths
- E(7,16) - Gahu bell pattern
- E(11,16) - Busy hats

**Hi-Hats (Open):**
- E(2,8) - Offbeat open hats
- E(3,8) - Tresillo open hats

**Percussion/Shakers:**
- E(5,8) - Cinquillo shaker
- E(9,16) - Dense shaker pattern
- E(7,12) - Triplet feel

---

## Creative Applications

### Polyrhythmic Layering

Layer multiple voices with different Euclidean patterns to create evolving polyrhythms.

**Example Setup:**
```
Voice 1 (Kick): E(4,16) - Four-on-floor
Voice 2 (Snare): E(5,16) - Bossa nova
Voice 3 (Closed Hat): E(7,16) - Gahu pattern
Voice 4 (Open Hat): E(3,8) + SHIFT 2 - Tresillo offset
Voice 5 (Perc): E(5,12) - Polyrhythmic layer
```

**Result:** Complex, evolving rhythm that repeats every 48 steps (LCM of 16, 8, 12).

### Accent Distribution

Use the `ACCENT` parameter to create dynamic variation within a pattern.

**Example: Busy Hi-Hat with Dynamic Variation**
```
STEPS = 16, FILLS = 11, ACCENT = 4, DEV = 20

Result: 11 hi-hat triggers with 4 evenly-spaced accents and slight timing variation
```

The Euclidean algorithm distributes accents musically, creating natural emphasis points.

### Ratchet Patterns

Distribute ratchets across filled steps for rapid-fire drum rolls.

**Example: Snare with Occasional Rolls**
```
STEPS = 16, FILLS = 4, RATCHET = 2, R-SPD = 3

Result: 4 snare hits, 2 of which trigger 4 times (rapid rolls)
```

Euclidean distribution ensures ratchets occur at musically sensible intervals.

### Flam Articulation

Euclidean flam distribution creates realistic grace note patterns.

**Example: Snare with Flams**
```
STEPS = 8, FILLS = 3, FLAM = 2, ACCENT = 1

Result: 3 snare hits - 2 with flam grace notes, 1 accented
```

### Shift Exploration

Use `SHIFT` to explore variations of the same pattern without changing the core rhythm.

**Workflow:**
1. Generate a pattern (e.g., E(5,16))
2. Play it back and listen
3. Increment `SHIFT` by 1 step at a time
4. Find the rotation that best fits your groove

**Tip:** Shifting by multiples of 4 (in 16th patterns) creates beat-aligned variations.

### Combining with Manual Editing

Euclidean patterns can be manually edited after generation:

1. Generate Euclidean pattern
2. Click individual steps to toggle gates/accents
3. Use keyboard shortcuts (`R` + drag, `/` + drag) to adjust step parameters
4. Hybrid approach: Euclidean foundation + manual tweaks

**Note:** Changing Euclidean parameters regenerates the pattern, overwriting manual edits.

### Modulating Euclidean Parameters

Use **Per-Parameter Modulation (PPMod)** to animate Euclidean parameters:

**Example 1: Evolving Fill Density**
```
FILLS parameter:
- Mode: LFO (Sine wave, 0.1 Hz)
- Depth: 60%
- Offset: 50%

Result: Fill count oscillates between 2 and 10 fills (if STEPS=16)
```

**Example 2: Random Pattern Shift**
```
SHIFT parameter:
- Mode: RND (Random, 8-bit LFSR)
- Depth: 100%
- Offset: 0%

Result: Pattern rotation changes randomly every few bars
```

**Example 3: Accent Automation**
```
ACCENT parameter:
- Mode: SEQ (Step sequencer, 4 steps)
- Pattern: [0, 2, 4, 6]

Result: Accent count increases over 4 bars, then resets
```

---

## Euclidean vs Manual Programming

### When to Use Euclidean

**Best for:**
- Rapid pattern generation
- Exploring polyrhythmic ideas
- Creating even/natural-sounding grooves
- World music rhythm emulation
- Generative/algorithmic composition

**Example:** You want a 7-against-4 polyrhythm - Euclidean instantly generates E(7,16) and E(4,16).

### When to Use Manual

**Best for:**
- Specific rhythmic ideas or transcriptions
- Asymmetric/intentionally uneven patterns
- Complex syncopation with precise ghost notes
- Drum fills and breakdowns
- Exact reproduction of existing grooves

**Example:** Programming a specific breakbeat fill requires manual step-by-step control.

### Hybrid Approach

**Workflow:**
1. Start with Euclidean pattern (E(5,16))
2. Manually adjust 2-3 steps for variation
3. Lock pattern (don't change Euclidean params)
4. Perform or record

**Warning:** Changing Euclidean parameters overwrites manual edits.

---

## Technical Details

### Algorithm Implementation

Bæng's Euclidean generator is implemented in `merged-app/js/baeng/modules/euclidean.js`:

**Core Functions:**
- `generateEuclideanRhythm(steps, fills)` - Returns boolean array of gate pattern
- `rotatePattern(pattern, rotation)` - Rotates pattern by N steps
- `updateEuclideanSequence(voiceIndex)` - Regenerates sequence from parameters

**Pattern Generation Flow:**
1. Validate parameters (cap fills at steps, shift at steps-1)
2. Generate base gate pattern using `generateEuclideanRhythm()`
3. Identify filled step indices
4. Distribute ratchets across fills (priority 1)
5. Distribute flams across remaining fills (priority 2)
6. Distribute accents across remaining fills (priority 3)
7. Rotate all patterns together by `SHIFT` steps
8. Apply to sequence steps (set gate, accent, ratchet, deviation, probability)

### Modifier Allocation Algorithm

```javascript
// Pseudo-code for modifier allocation
filledIndices = getFilledIndices(gatePattern);
availableFills = [0, 1, 2, ..., fills-1];

// Step 1: Ratchets (highest priority)
ratchetIndices = distributeEuclidean(fills, ratchetAmt);
availableFills = remove(ratchetIndices);

// Step 2: Flams
flamIndices = distributeEuclidean(availableFills.length, flamAmt);
availableFills = remove(flamIndices);

// Step 3: Accents (lowest priority)
accentIndices = distributeEuclidean(availableFills.length, accentAmt);
```

This prevents overlapping modifiers while maintaining Euclidean distribution for each type.

### Performance Notes

- Euclidean generation is CPU-efficient (O(n) complexity)
- Pattern regeneration occurs only when parameters change
- No impact on audio thread (runs on main thread during UI updates)
- Supports sequences up to 64 steps (though UI shows 16-step grid)

---

## Troubleshooting

### Pattern Not Changing
**Symptom:** Adjusting `FILLS` or `SHIFT` doesn't update the step grid.

**Possible Causes:**
1. Parameters haven't changed (already at that value)
2. Voice not selected (ensure correct voice is active)
3. UI not refreshing (browser rendering issue)

**Solutions:**
1. Verify voice selection (press 1-6 to select)
2. Change parameter to different value, then back
3. Refresh browser (Cmd/Ctrl+R)

### Modifiers Not Appearing
**Symptom:** `ACCENT`, `FLAM`, or `RATCHET` set to >0 but steps don't show modifiers.

**Possible Causes:**
1. `FILLS` too low (modifiers need filled steps to attach to)
2. Sum of modifiers exceeds fills (automatically capped)
3. Visual feedback not obvious (accents shown as subtle orange border)

**Solutions:**
1. Increase `FILLS` to at least match modifier count
2. Check sum: `ACCENT + FLAM + RATCHET ≤ FILLS`
3. Click accented step - should show accent in step details

### Pattern Sounds Wrong
**Symptom:** Pattern doesn't sound like expected traditional rhythm.

**Possible Causes:**
1. Incorrect steps/fills combination (e.g., E(3,7) instead of E(3,8))
2. `SHIFT` offset is wrong (pattern rotated)
3. Probability <100% causing random triggering
4. Deviation adding timing variation

**Solutions:**
1. Double-check steps/fills against reference table
2. Set `SHIFT` to 0 (default rotation)
3. Ensure probability = 100% (check individual steps)
4. Set `DEV` to 0 (no timing variation)

---

## See Also

- **[Bæng Sequencer Overview](baeng-sequencer.md)** - Complete sequencer documentation
- **[Step Parameters](step-parameters.md)** - Detailed step parameter reference
- **[Per-Parameter Modulation](../modulation/ppmod-modes.md)** - Modulating Euclidean parameters
- **[Bæng User Guide](../user-guide/baeng-guide.md)** - Complete Bæng guide

---

## Further Reading

**Academic References:**
- Toussaint, G. (2005). "The Euclidean Algorithm Generates Traditional Musical Rhythms"
- Demaine, E. et al. (2009). "The Distance Geometry of Music"

**Online Resources:**
- [Euclidean Rhythm Generator](https://euclideanrhythms.com/) - Interactive visualisation
- [Bjorklund's Original Paper](https://cgm.cs.mcgill.ca/~godfried/publications/banff.pdf) - Algorithm explanation

**Traditional Music:**
- Listen to Cuban son, Brazilian bossa nova, West African drumming to hear Euclidean patterns in context

---

**Version:** 1.0
**Last Updated:** 2025-12-30
**Algorithm:** Bjorklund (1997, 2003)
