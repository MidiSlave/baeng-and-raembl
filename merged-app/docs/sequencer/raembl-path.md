# Ræmbl Pitch Path Sequencer

The **PATH** module is Ræmbl's melodic sequencer, providing up to 16 steps of pitch control with intelligent scale quantisation. Combined with the FACTORS Euclidean rhythm generator, it creates expressive melodic sequences with TB-303 inspired performance features.

---

## Table of Contents

1. [Overview](#overview)
2. [Programming Steps](#programming-steps)
3. [Scale Quantisation](#scale-quantisation)
4. [Step Parameters](#step-parameters)
5. [Root Note and Scale Selection](#root-note-and-scale-selection)
6. [Octave Range](#octave-range)
7. [Sync and Timing](#sync-and-timing)
8. [Visualisation Modes](#visualisation-modes)
9. [Tips and Techniques](#tips-and-techniques)

---

## Overview

The Pitch Path sequencer stores **pitch values** (0-100) for each step in the pattern. These values are mapped to musical notes using the current **scale** and **root note** settings, ensuring that all notes are musically coherent.

### Key Features

- **Up to 16 steps**: Matches FACTORS pattern length
- **Scale quantisation**: All pitches mapped to selected scale (33 scales available)
- **Root note selection**: Transpose entire sequence (C-B)
- **5-octave range**: C1 to C6 (expanded from original 3-octave range)
- **Step parameters**: Slide, accent, and trill flags per step
- **Probability control**: Randomise pattern progression
- **Visual feedback**: 3D cylinder visualisation shows pitch path in real-time

### Relationship with FACTORS

PATH and FACTORS work together to create complete musical patterns:

- **FACTORS**: Controls **rhythm** (which steps play, accent/slide/trill flags, gate length)
- **PATH**: Controls **pitch** (what note plays on each step)

**Example**: A 16-step pattern with 8 fills will play 8 notes, with pitches determined by PATH's stored values for those gated steps.

---

## Programming Steps

### Pitch Value Storage

Each step in the pattern stores a **pitch value** from 0-100:

- **0**: Lowest note in range (C1 in default configuration)
- **50**: Middle note (approximately C3)
- **100**: Highest note in range (C6 in default configuration)

### How Pitch Values Are Set

Pitch values are updated by the **Main LFO** during sequencer playback:

1. **FACTORS** triggers a gated step
2. **Main LFO** generates a value (controlled by LFO AMP, FREQ, WAVEFORM parameters)
3. This value is **sampled** and stored for the current step
4. The value is **quantised** to the selected scale
5. The resulting note is triggered

**Result**: The LFO's output over time creates the melodic contour. Different LFO waveforms produce different melodic shapes:

- **Sine**: Smooth, wave-like melodies
- **Triangle**: Linear up/down patterns
- **Square**: Alternating high/low notes
- **Sawtooth**: Rising or falling sequences

### Probability Parameter

**PROB** (Probability, 0-100%) controls pattern advancement behaviour:

- **100%**: Pattern always advances (normal sequencer behaviour)
- **50%**: 50% chance to advance, 50% chance to repeat previous note
- **0%**: Pattern never advances (first note repeats indefinitely)

**Use Cases**:
- **High probability (80-100%)**: Predictable, consistent melodies
- **Medium probability (40-70%)**: Some repetition, creating variation and interest
- **Low probability (10-30%)**: Heavily stuttering, generative behaviour

---

## Scale Quantisation

The PATH sequencer uses **intelligent scale quantisation** to ensure all notes are musically coherent.

### How It Works

1. **Raw pitch value** (0-100) is converted to a semitone position within the 5-octave range
2. The sequencer finds the **closest note** in the selected scale
3. The **root note** is applied (transposition)
4. The final note name and octave are calculated (e.g., "E3", "G#4")

### Example

**Settings**:
- Scale: **Minor Pentatonic** (intervals: 0, 3, 5, 7, 10)
- Root: **E**
- Pitch value: **47%**

**Calculation**:
1. 47% of 5 octaves (60 semitones) = ~28 semitones above C1
2. Closest Minor Pentatonic note: **G** (interval 5 in scale, octave 2)
3. Apply root (E): G + 4 semitones = **B2**
4. Result: Note **B2** is triggered

### Available Scales

Ræmbl includes **33 musical scales** from various traditions:

#### Chromatic and Western Scales
- **Chrom** (Chromatic): All 12 notes
- **Major**: Do-Re-Mi-Fa-Sol-La-Ti
- **Minor** (Natural Minor): La-Ti-Do-Re-Mi-Fa-Sol
- **Harm Min** (Harmonic Minor): Minor with raised 7th
- **Melo Min** (Melodic Minor): Minor with raised 6th and 7th

#### Western Modes
- **Dorian**: Minor with raised 6th (jazzy minor)
- **Phryg** (Phrygian): Dark, Spanish-sounding minor
- **Lydian**: Major with raised 4th (dreamy)
- **Mixo** (Mixolydian): Major with lowered 7th (bluesy)
- **Locrian**: Diminished, unstable

#### Pentatonic and Blues
- **Maj Pent** (Major Pentatonic): 5-note major scale
- **Min Pent** (Minor Pentatonic): Classic blues/rock scale
- **Blues**: Minor Pentatonic + blue note (flat 5)

#### Synthetic/Jazz Scales
- **WhlTone** (Whole Tone): Symmetrical, dreamlike
- **Dim** (Diminished): Symmetrical, tense
- **Altered**: Jazz altered dominant
- **Bop Dom/Maj** (Bebop Dominant/Major): Jazz with chromatic passing tones
- **Prometh** (Prometheus): Mystic, whole-tone-like

#### Middle Eastern/Arabic Scales
- **Dbl Harm** (Double Harmonic): Exotic, Arabic-sounding
- **Persian**: Ancient Persian music
- **Hijaz**: Characteristic Middle Eastern scale

#### Eastern European Scales
- **Hung Min** (Hungarian Minor): Dark, gypsy-influenced
- **Ukr Dor** (Ukrainian Dorian): Dorian with raised 4th
- **Neap Maj/Min** (Neapolitan Major/Minor): Classical, operatic

#### Japanese/East Asian Scales
- **Hirajo**: Traditional Japanese scale
- **In**: Japanese pentatonic (sad, contemplative)
- **Yo**: Japanese pentatonic (bright, joyful)
- **Iwato**: Japanese pentatonic (sparse, ancient)
- **Kumoi**: Japanese pentatonic (versatile)

#### Ethiopian/African Scales
- **Bati**: Ethiopian pentatonic
- **Ambassl** (Ambassel): Ethiopian church music
- **Anchi** (Anchihoye): Ethiopian secular music

See the [Ræmbl User Guide](../user-guide/raembl-guide.md#scale-system) for complete scale interval definitions.

---

## Step Parameters

Each step in the pattern can have **accent**, **slide**, and **trill** flags set by the FACTORS module. These flags modify how notes are triggered.

### Accent

**Effect**: 1.5× velocity boost, snappier decay, attack punch

**How It Works**:
- Velocity is multiplied by 1.5 (louder)
- Envelope decay is shortened (tighter, more percussive)
- Attack is emphasised (transient punch)

**Use Cases**:
- Emphasise downbeats in a sequence
- Create groove and rhythmic interest
- Add dynamic variation to static patterns

**Set via**: FACTORS module **> (Accent Amount)** parameter

### Slide

**Effect**: 80ms TB-303 style glide without envelope retrigger

**How It Works**:
- **Mono Mode**: Existing voice's pitch ramps exponentially over 80ms (authentic TB-303 timing)
- **Poly Mode**: New voice has 40ms "slide-into" effect (gentler)
- Envelope continues from current state (no retrigger)
- Filter cutoff follows pitch if **KEY** (key follow) is enabled

**TB-303 Convention**: Slide flag on step N means "slide FROM step N TO step N+1". The sequencer checks the **previous step's slide flag** to determine if the current note should slide in.

**Use Cases**:
- Create smooth, legato basslines
- Emulate classic TB-303 acid sequences
- Add expressive pitch transitions between notes

**Set via**: FACTORS module **SLIDE (Slide Amount)** parameter

See also: [TB-303 Performance Features](../user-guide/raembl-guide.md#tb-303-performance-features)

### Trill

**Effect**: Pitch oscillation to next scale degree

**How It Works**:
- **Mono Mode**: 70% slide up, 25% hold, 5% gap per trill segment (authentic TB-303 timing)
- **Poly Mode**: Similar timing on newly allocated voice
- **Timing Variation**: 2-note trill on swung offbeats, 3-note trill on downbeats
- **Scale-Aware**: Target note is **next degree** in current scale (respects scale and root)

**Trill Target Selection**:
1. Base note is quantised to current scale
2. Next scale degree is selected (wraps around if at top of scale)
3. Octave boundaries are respected
4. Slide transitions are applied between trill notes

**Example**:
- Scale: **E Minor Pentatonic** (E, G, A, B, D)
- Base note: **E3**
- Trill target: **G3** (next scale degree)
- Result: E3 → G3 → E3 (2-note trill) or E3 → G3 → E3 → G3 (3-note trill on downbeat)

**Use Cases**:
- Add ornamentation to sequences
- Create rhythmic interest and variation
- Emulate classic TB-303 trill behaviour

**Set via**: FACTORS module **TR (Trill Amount)** parameter

See also: [Euclidean Step Decoration](euclidean.md#step-decoration)

---

## Root Note and Scale Selection

### Root Note (ROOT)

The **ROOT** parameter (0-11) sets the root note for the selected scale:

| Value | Note |
|-------|------|
| 0 | C |
| 1 | C# / Db |
| 2 | D |
| 3 | D# / Eb |
| 4 | E |
| 5 | F |
| 6 | F# / Gb |
| 7 | G |
| 8 | G# / Ab |
| 9 | A |
| 10 | A# / Bb |
| 11 | B |

**Effect**: Transposes the entire sequence without changing the melodic contour.

**Example**:
- Scale: **Minor Pentatonic**
- Pattern: C, Eb, F, G, Bb (C Minor Pent)
- Change root to **E**: E, G, A, B, D (E Minor Pent)
- **Same melodic shape, different key**

### Scale Selection (SCALE)

The **SCALE** parameter (0-32) selects from 33 available scales.

**Effect**: Changes the available notes in the sequence while preserving pitch value positions.

**Example**:
- Pitch values: [20%, 40%, 60%, 80%]
- Scale: **Major** → Notes: [D, E, F#, A] (in C Major)
- Change to **Minor** → Notes: [D, Eb, F, Ab] (in C Minor)
- **Same pitch values, different notes**

### Workflow Tips

1. **Compose in C Major/Minor first**: Easier to visualise intervals
2. **Switch scales to explore variations**: Same pattern, different flavour
3. **Transpose with root note**: Move to different keys without re-programming

---

## Octave Range

The PATH sequencer spans **5 octaves** (C1 to C6), expanded from the original 3-octave range.

### Range Mapping

- **0%**: C1 (lowest MIDI note in range)
- **20%**: C2
- **40%**: C3
- **60%**: C4
- **80%**: C5
- **100%**: C6 (highest MIDI note in range)

**Note**: Exact notes depend on scale quantisation—the above values represent approximate positions.

### Why 5 Octaves?

- **Prevents premature range cutoff**: Long melodic phrases don't hit range limits
- **Accommodates all scales**: Some scales (e.g., Japanese pentatonic) have wider intervals
- **Allows extreme pitch variation**: Useful for experimental sequences

### Controlling Range with LFO

The Main LFO's **AMP** (amplitude) parameter controls the effective range:

- **AMP = 100%**: Full 5-octave range (0-100%)
- **AMP = 50%**: ~2.5-octave range centred around LFO **OFFSET**
- **AMP = 25%**: ~1.25-octave range (tight, melodic sequences)

**Use Case**: Reduce AMP for tighter, more predictable melodies. Increase AMP for wide, sweeping sequences.

---

## Sync and Timing

The PATH sequencer is tightly synchronised with the FACTORS Euclidean rhythm generator and the shared Time Strip.

### Step Advancement

1. **FACTORS** generates the gate pattern (which steps are active)
2. On each **gated step**, PATH samples the Main LFO and quantises the result
3. The resulting note is triggered via the audio engine
4. **Gate length** (set in FACTORS) determines note duration

**Result**: PATH and FACTORS work together—FACTORS controls "when" notes play, PATH controls "what" notes play.

### Pattern Length

The PATH pattern length **matches** the FACTORS **STEPS** parameter:

- **STEPS = 16**: 16-step pitch sequence
- **STEPS = 8**: 8-step pitch sequence
- **STEPS = 32**: 32-step pitch sequence (max)

**Note**: Only **gated steps** (determined by FILLS and SHIFT) actually trigger notes.

### Timing with Bæng

Both Ræmbl (PATH + FACTORS) and Bæng share the same clock via the **Time Strip**:

- **BPM**: Controls global tempo for both apps
- **SWING**: Applies swing timing to both apps (% shift of offbeat steps)
- **LENGTH**: Independent bar lengths (Ræmbl and Bæng can have different loop lengths)

**Synchronised playback**: Pressing play in either app starts both in sync. Stopping either app stops both.

See: [Shared Time Strip Documentation](../reference/time-strip.md)

---

## Visualisation Modes

The PATH module features a **3D rotating cylinder visualisation** that displays the pitch sequence in real-time.

### Static Mode (Default)

- Flat 2D visualisation
- Horizontal line indicates current pitch
- Note name displayed (e.g., "E3")
- No rotation or 3D effects

**Best For**: Simple pitch reference during performance

### Animated Mode (3D Cylinder)

**Toggle**: Click the **■** button in PATH module header

**Features**:
- 3D rotating cylinder displays gated steps as dots
- Dot Y-position represents pitch (high = top, low = bottom)
- Current step glows and enlarges
- Rotation speed matches BPM (one full rotation per 4 beats)
- Depth-based perspective (closer dots are larger and brighter)

**Step Effects Visualisation**:
- **Slide**: Gradient line from current step to next (fade-to-transparent)
- **Trill**: Animated bouncing curved path at 18 Hz (firefly effect with glow and motion trail)
- **Accent**: Larger dot with extra glow

**Best For**: Understanding melodic contour, visualising step relationships, performance monitoring

### Visualisation Controls

- **Click to toggle**: Switch between static and animated modes
- **Icon changes**: ▶ (static) ↔ ■ (animated)
- **Rotation persists during playback**: Syncs with BPM automatically

---

## Tips and Techniques

### Creating Melodic Sequences

1. **Start with a simple scale**: Use **Minor Pentatonic** or **Major** for predictable results
2. **Set LFO to Sine or Triangle**: Smooth waveforms create smooth melodies
3. **Adjust LFO AMP**: Lower values (30-50%) create tighter, more melodic sequences
4. **Use LFO OFFSET**: Shift the LFO's centre point to target specific pitch ranges
5. **Set PROB to 100%**: Ensure consistent playback while composing

### Adding Variation

1. **Lower PROB to 70-90%**: Occasional note repeats add interest
2. **Add SLIDE on upward movements**: Classic TB-303 technique (slide from root to fifth)
3. **Add TRILL on downbeats**: Emphasise strong beats with ornamentation
4. **Use ACCENT on syncopated steps**: Create groove and rhythmic tension

### Experimenting with Scales

1. **Start with Chromatic**: All notes available, no quantisation constraints
2. **Switch to exotic scales**: Try **Hijaz**, **Iwato**, or **Persian** for unique flavour
3. **Compare modes**: Play the same pattern in **Dorian** vs **Phrygian** to hear the difference
4. **Layer scales**: Use different scales in Ræmbl and Bæng for polyrhythmic/polytonal textures

### Using Probability Creatively

- **50% probability**: Creates call-and-response patterns (note → repeat → note → repeat)
- **20% probability**: Heavily generative, evolving sequences (almost never advances)
- **80% probability**: Occasional stutters for humanisation

### Combining with PPMod

Modulate PATH parameters for evolving sequences:

1. **PPMod LFO on PROB**: Slow LFO (0.1 Hz) modulates probability over time (tight → loose → tight)
2. **PPMod RND on ROOT**: Random root note changes for unexpected key shifts
3. **PPMod SEQ on SCALE**: Step through different scales (4-step sequence: Major → Dorian → Minor → Phrygian)

See: [PPMod Modes Documentation](../modulation/ppmod-modes.md)

### Performance Techniques

1. **Live scale switching**: Change scales during playback for instant variation
2. **Root note transposition**: Shift to different keys on-the-fly
3. **PROB modulation**: Sweep from predictable (100%) to chaotic (10%) during build-ups
4. **Visualisation mode**: Switch to 3D cylinder for visual feedback during performance

---

## Related Documentation

- **[Ræmbl User Guide](../user-guide/raembl-guide.md)**: Complete Ræmbl synthesiser documentation
- **[Euclidean Sequencing](euclidean.md)**: FACTORS rhythm generator and Bjorklund algorithm
- **[TB-303 Performance Features](../user-guide/raembl-guide.md#tb-303-performance-features)**: Slide, accent, and trill in detail
- **[Scale System](../user-guide/raembl-guide.md#scale-system)**: All 33 scales with interval definitions
- **[PPMod Overview](../modulation/ppmod-overview.md)**: Per-parameter modulation system

---

## Troubleshooting

### Pattern not advancing?

1. **Check FACTORS FILLS**: If FILLS = 0, no steps are gated (no notes play)
2. **Check PROB**: If PROB = 0%, pattern never advances (first note repeats)
3. **Check playback**: Ensure sequencer is playing (press Space or click Play)

### Notes out of range?

1. **Check LFO AMP**: If AMP is too high, notes may exceed comfortable range
2. **Adjust LFO OFFSET**: Shift the centre point to target specific octaves
3. **Change ROOT**: Transpose down if notes are too high (or up if too low)

### Unexpected notes?

1. **Check SCALE**: Ensure the selected scale matches your musical intention
2. **Check ROOT**: Verify root note is correct (e.g., C = 0, E = 4)
3. **Check TRILL**: Trill targets the next scale degree, which may be unexpected in some scales

### Slide/Trill not working?

1. **Check FACTORS**: Ensure SLIDE or TR amounts are above 0
2. **Check FILLS**: Slide and trill only apply to gated steps
3. **Check MONO/POLY mode**: Some effects work differently in poly mode

---

**Next**: Learn about [Euclidean Pattern Generation](euclidean.md) to master the FACTORS rhythm sequencer.
