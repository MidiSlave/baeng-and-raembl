# Rings Physical Modelling Resonator

**6 resonator models + Easter Egg mode - realistic plucked, struck, and bowed sounds**

Rings is a physical modelling resonator offering six distinct resonator models for creating realistic strings, bells, drums, and FM synthesis. Originally created as a Eurorack module by Mutable Instruments, this is a complete JavaScript port to Web Audio API, integrated into Ræmbl as an alternative engine alongside the classic subtractive synthesiser and Plaits macro oscillator.

## Overview

Rings uses physical modelling to simulate resonant structures (strings, plates, membranes) rather than traditional oscillator-filter synthesis. Instead of shaping harmonics with filters, Rings models the actual physics of vibrating objects - how they're excited, how energy propagates through them, and how they decay over time.

**Key Features:**
- 6 resonator models (modal, sympathetic string, string, FM voice, quantised sympathetic string, string with reverb)
- 4-voice polyphony (M/P2/P4 modes) handled internally by the processor
- Physical modelling parameters: STRUCTURE, BRIGHTNESS, DAMPING, POSITION
- Internal excitation via STRUM parameter
- Per-parameter modulation via PPMod system (global only)
- Accent, slide, and trill support
- Easter Egg mode: Disastrous Peace (12-voice polysynth with 6 FX types)

## The 6 Resonator Models

Each model simulates a different type of physical resonator with unique timbral characteristics.

### Model 0: Modal Resonator

**64-mode SVF bank resonator**

Simulates resonant bodies (bells, bars, plates, bowls) by summing 64 separate resonant modes. Each mode is a bandpass filter tuned to a specific frequency with independent decay time. The interaction between modes creates complex, inharmonic timbres.

**Physical Model:**
- 64 parallel state variable filters (SVF)
- Each mode has frequency, amplitude, and Q-factor
- Modes tuned to inharmonic ratios for metallic/bell-like sounds

**Macro Controls:**
- **STRUCTURE (0-100%):** Mode frequency ratios / inharmonicity
  - Low (0-30%): Harmonic ratios (pitched, musical)
  - Mid (40-60%): Slightly inharmonic (bell-like)
  - High (70-100%): Strongly inharmonic (metallic, chaotic)
- **BRIGHTNESS:** High-frequency mode amplitude
- **DAMPING:** Decay time (all modes)
- **POSITION:** Excitation spectrum (which modes are triggered)

**Sound Design:**
- Tubular bells: STRUCTURE 40%, BRIGHTNESS 60%, DAMPING 80%
- Metallic gongs: STRUCTURE 85%, BRIGHTNESS 70%, DAMPING 90%
- Wooden bars: STRUCTURE 20%, BRIGHTNESS 40%, DAMPING 50%
- Glass bottles: STRUCTURE 55%, BRIGHTNESS 80%, DAMPING 70%

**Stability Warning:**
At high STRUCTURE values (>95%), the Modal resonator can become numerically unstable due to unbounded Q-factor growth in the SVF filters. The validation system automatically clamps STRUCTURE to 95% for this model. If you hear distortion or runaway resonance, reduce STRUCTURE below 90%.

**Status:** Ready (with stability clamping)

### Model 1: Sympathetic String

**8 coupled strings with harmonic coupling**

Models eight strings tuned to related pitches that vibrate sympathetically when one is excited. Energy transfers between strings via coupling, creating rich, evolving timbres reminiscent of sitar, tanpura, or piano sympathetic resonance.

**Physical Model:**
- 8 Karplus-Strong waveguides
- Strings tuned to harmonic series (1×, 2×, 3×, 4×, etc.)
- Bidirectional coupling allows energy transfer between strings

**Macro Controls:**
- **STRUCTURE (0-100%):** Coupling strength between strings
  - Low (0-30%): Minimal coupling (clean, focused)
  - Mid (40-60%): Moderate coupling (sympathetic shimmer)
  - High (70-100%): Strong coupling (complex, evolving)
- **BRIGHTNESS:** High-frequency damping in strings
- **DAMPING:** Overall decay time
- **POSITION:** Excitation position (bridge ↔ centre)

**Sound Design:**
- Sitar drone: STRUCTURE 75%, BRIGHTNESS 60%, DAMPING 85%
- Piano sustain pedal: STRUCTURE 50%, BRIGHTNESS 70%, DAMPING 70%
- Harp harmonics: STRUCTURE 40%, BRIGHTNESS 80%, DAMPING 60%
- Tanpura: STRUCTURE 80%, BRIGHTNESS 50%, DAMPING 90%

**Stability Warning:**
High STRUCTURE values (>90%) can cause excessive coupling and runaway feedback. The validation system clamps STRUCTURE to 90% for this model.

**Status:** Ready

### Model 2: String

**Karplus-Strong waveguide with dispersion**

Classic Karplus-Strong plucked string synthesis with refinements for realistic guitar, bass, and harp tones. Includes dispersion (frequency-dependent propagation speed) and allpass filtering for inharmonicity.

**Physical Model:**
- Delay line (waveguide) storing travelling wave
- Lowpass filter for damping (energy loss)
- Allpass filter for dispersion (inharmonicity)
- Feedback loop sustains oscillation

**Macro Controls:**
- **STRUCTURE (0-100%):** Inharmonicity / dispersion
  - Low (0-20%): Perfect harmonics (synthetic, organ-like)
  - Mid (30-60%): Subtle inharmonicity (guitar, piano)
  - High (70-100%): Strong inharmonicity (sitar, banjo, bells)
- **BRIGHTNESS:** High-frequency damping
- **DAMPING:** Decay time
- **POSITION:** Pluck position (bridge ↔ centre)

**Sound Design:**
- Acoustic guitar: STRUCTURE 35%, BRIGHTNESS 65%, DAMPING 60%, POSITION 20%
- Electric bass: STRUCTURE 15%, BRIGHTNESS 40%, DAMPING 50%, POSITION 10%
- Harp: STRUCTURE 40%, BRIGHTNESS 80%, DAMPING 70%, POSITION 30%
- Sitar: STRUCTURE 85%, BRIGHTNESS 60%, DAMPING 75%, POSITION 25%

**Position Parameter:**
- Bridge (0-20%): Bright, trebly tone (all harmonics present)
- Centre (80-100%): Muted, mellow tone (suppresses even harmonics)

**Status:** Ready

### Model 3: FM Voice

**FM synthesis with envelope follower**

Not a physical model but a 2-operator FM synthesiser with built-in envelope follower. The follower tracks the input (or internal excitation) and uses it to modulate the FM index, creating dynamic, expressive FM tones.

**Synthesis Method:**
- Carrier oscillator (pitch)
- Modulator oscillator (ratio controlled by STRUCTURE)
- Envelope follower tracks excitation amplitude
- FM index modulated by envelope follower

**Macro Controls:**
- **STRUCTURE (0-100%):** Modulator frequency ratio
  - Integer ratios (0%, 25%, 50%, 75%, 100%): Harmonic FM
  - Non-integer ratios (in between): Inharmonic bells/metallic
- **BRIGHTNESS:** High-frequency content / harmonics
- **DAMPING:** Envelope decay time
- **POSITION:** FM feedback amount

**Sound Design:**
- Electric piano: STRUCTURE 25% (1:2 ratio), BRIGHTNESS 70%, DAMPING 60%
- Bell tones: STRUCTURE 37% (1:3.5 ratio), BRIGHTNESS 80%, DAMPING 75%
- Bass: STRUCTURE 50% (1:4 ratio), BRIGHTNESS 40%, DAMPING 50%
- Metallic percussion: STRUCTURE 67% (non-integer), BRIGHTNESS 85%, DAMPING 40%

**Why It's Called "Voice":**
The envelope follower creates dynamic, "breathing" FM sounds that respond to playing dynamics, making it expressive like a human voice.

**Status:** Ready

### Model 4: Sympathetic String Quantised

**8 coupled strings with pitch quantisation**

Similar to Model 1 (Sympathetic String) but with stricter pitch quantisation - strings are tuned to exact harmonic ratios with less inharmonicity. Creates cleaner, more tonal sympathetic resonances.

**Physical Model:**
- 8 Karplus-Strong waveguides
- Strings quantised to exact harmonic series (no detuning)
- Coupling with reduced bandwidth (less chaotic interaction)

**Macro Controls:**
- **STRUCTURE (0-100%):** Coupling strength (stricter limits than Model 1)
  - Low (0-30%): Isolated strings (clean harmonics)
  - Mid (40-60%): Gentle coupling (subtle shimmer)
  - High (70-100%): Strong coupling (rich overtones)
- **BRIGHTNESS:** High-frequency damping
- **DAMPING:** Overall decay time
- **POSITION:** Excitation position

**Sound Design:**
- Harmonium: STRUCTURE 60%, BRIGHTNESS 50%, DAMPING 80%
- Orchestral strings (section): STRUCTURE 45%, BRIGHTNESS 65%, DAMPING 70%
- Choir pad: STRUCTURE 55%, BRIGHTNESS 55%, DAMPING 85%

**Difference from Model 1:**
Model 4 has tighter pitch quantisation and more controlled coupling, making it better for tonal/harmonic material. Model 1 allows more inharmonicity and chaotic coupling for expressive, evolving textures.

**Stability Warning:**
High STRUCTURE values (>85%) can cause coupling instability. The validation system clamps STRUCTURE to 85% for this model.

**Status:** Ready

### Model 5: String and Reverb

**String model with built-in reverb**

Combines Model 2 (String) with an integrated diffusion reverb. The reverb is part of the resonator itself, not a send effect, creating intimate, lush string tones with natural space.

**Physical Model:**
- Karplus-Strong string (same as Model 2)
- Diffusion reverb network (allpass filters + feedback delays)
- Reverb tuned specifically for string resonance

**Macro Controls:**
- **STRUCTURE:** Inharmonicity (same as Model 2)
- **BRIGHTNESS:** String damping + reverb tone
- **DAMPING:** String decay + reverb decay time
- **POSITION:** Dry/wet blend (pluck ↔ reverb)

**Sound Design:**
- Ambient guitar: STRUCTURE 40%, BRIGHTNESS 70%, DAMPING 85%, POSITION 70%
- Harp with room: STRUCTURE 35%, BRIGHTNESS 75%, DAMPING 75%, POSITION 50%
- Pad strings: STRUCTURE 50%, BRIGHTNESS 60%, DAMPING 90%, POSITION 80%

**When to Use:**
Model 5 is ideal for ambient, atmospheric sounds where the reverb is integral to the timbre (not just a send effect). The integrated reverb is tuned for string resonance and sounds more "inside" the instrument than external reverb.

**Status:** Ready

## Easter Egg Mode: Disastrous Peace

**12-voice polyphonic synthesiser with 6 FX types**

Hidden within Rings is "Disastrous Peace," a full-featured string synthesiser with PolyBLEP anti-aliased oscillators and six internal effects. This Easter Egg mode replaces the six resonator models with a traditional subtractive polysynth.

**How to Access:**
The Easter Egg can be enabled programmatically via the Rings voice pool:
```javascript
ringsVoicePool.setEasterEgg(true); // Enable Easter Egg mode
ringsVoicePool.setEasterEgg(false); // Disable (return to resonators)
```

**Note:** There is currently no UI control for the Easter Egg in the production app. It's accessible only via console/code.

### Easter Egg Synthesis

**Architecture:**
- 12-voice polyphonic (vs 4-voice in resonator mode)
- PolyBLEP oscillators (sawtooth, square, triangle, sine)
- ADSR envelope
- Multi-mode filter
- 6 internal FX types

**Oscillators:**
- PolyBLEP anti-aliasing eliminates aliasing at all frequencies
- Classic waveforms: saw, square, triangle, sine
- Sub-oscillator available (1 octave down)

**FX Types:**

| FX Type | Index | Description |
|---------|-------|-------------|
| **Formant** | 0 | Vocal formant filtering |
| **Chorus** | 1 | Classic chorus (detuned copies) |
| **Reverb** | 2 | Diffusion reverb |
| **Formant 2** | 3 | Alternate formant algorithm |
| **Ensemble** | 4 | Wide stereo ensemble (chorus + reverb) |
| **Reverb 2** | 5 | Alternate reverb algorithm |

**Setting FX Type:**
```javascript
ringsVoicePool.setFxType(0-5); // Select FX type
```

### Easter Egg Controls

When Easter Egg mode is enabled, the Rings parameters take on new meanings:

| Rings Param | Easter Egg Function |
|-------------|---------------------|
| **STRUCTURE** | Filter cutoff |
| **BRIGHTNESS** | Filter resonance |
| **DAMPING** | Envelope decay time |
| **POSITION** | FX mix (dry ↔ wet) |

**Sound Design in Easter Egg Mode:**
- Classic string pad: STRUCTURE 60%, BRIGHTNESS 40%, DAMPING 80%, FX: Ensemble
- Formant lead: STRUCTURE 70%, BRIGHTNESS 60%, DAMPING 50%, FX: Formant
- Lush pad: STRUCTURE 50%, BRIGHTNESS 30%, DAMPING 90%, FX: Reverb 2

### Why "Disastrous Peace"?

"Disastrous Peace" is a humorous reference to Rings' dual nature - it's a physical modelling resonator on the surface, but hiding beneath is a full string synthesiser that has nothing to do with physical modelling. The name is an in-joke among Mutable Instruments users.

**When to Use Easter Egg Mode:**
- Need more than 4-voice polyphony (12 voices available)
- Want traditional subtractive synthesis instead of physical modelling
- Exploring vintage string machine sounds
- Experimenting with formant/ensemble effects

**Production Note:**
The Easter Egg is a hidden feature in the original Eurorack module and this port. It's fully functional but not intended as the primary use case for Rings. For traditional synthesis, consider using Ræmbl's Subtractive or Plaits engines instead.

## Parameters

All Rings parameters are stored as 0-100 in state and mapped to 0-1 for the AudioWorklet processor.

### STRUCTURE

**Inharmonicity / coupling / mode ratios**

The most important timbral control. Its meaning varies by resonator model:
- **Modal (0):** Mode frequency ratios (harmonic ↔ inharmonic)
- **Sympathetic String (1):** Coupling strength between strings
- **String (2):** Inharmonicity / dispersion amount
- **FM Voice (3):** Modulator frequency ratio
- **Sympathetic String Q (4):** Coupling strength (quantised)
- **String + Reverb (5):** Inharmonicity

**Range:** 0-100%
**State Key:** `ringsStructure`
**Modulatable:** Yes (global only)
**Safe Limits:** Model-specific (see Stability Warnings)

**Sound Design:**
- Start with 50% and sweep to hear each model's timbral range
- Low values (0-30%): More harmonic, tonal, musical
- High values (70-100%): More inharmonic, chaotic, percussive
- Modulate with slow LFO for evolving timbres

### BRIGHTNESS

**High-frequency content / damping**

Controls the brightness of the resonator by adjusting high-frequency damping. Low values create dark, muted tones; high values create bright, sizzling tones.

**Range:** 0-100%
**State Key:** `ringsBrightness`
**Modulatable:** Yes (global only)

**Sound Design:**
- Muted/mellow: 0-30%
- Natural/balanced: 40-60%
- Bright/sizzling: 70-100%
- Modulate with envelope for filter-like sweeps

### DAMPING

**Decay time / resonance time**

Controls how long the resonator rings after being excited. Low values create short, staccato sounds; high values create long, sustained drones.

**Range:** 0-100%
**State Key:** `ringsDamping`
**Modulatable:** Yes (global only)

**Sound Design:**
- Staccato/percussive: 0-30%
- Balanced/musical: 40-60%
- Sustained/drone: 70-100%
- Modulate with random for rhythmic variation

**Note:** DAMPING affects both amplitude and brightness decay (like a low-pass gate). Sounds decay naturally rather than abruptly cutting off.

### POSITION

**Excitation position / pluck position**

Controls where the resonator is excited (struck, plucked, or bowed). Position affects which harmonics are present in the initial excitation.

**Physical Meaning:**
- Bridge (0%): Excite near the bridge → bright, all harmonics present
- Centre (50%): Excite at centre → balanced harmonic content
- Antinode (100%): Excite at antinode → muted, even harmonics suppressed

**Range:** 0-100%
**State Key:** `ringsPosition`
**Modulatable:** Yes (global only)

**Sound Design:**
- Bright/twangy: 0-20% (bridge)
- Balanced: 40-60% (centre)
- Muted/mellow: 80-100% (antinode)

### STRUM

**Internal excitation mix**

Controls the level of internal excitation (noise burst) mixed with external excitation. Rings can excite itself without external input - useful for triggering drones or using it as a self-contained voice.

**Range:** 0-100%
**State Key:** `ringsMixStrum`
**Modulatable:** Yes (global only)

**How It Works:**
- 0%: Only external excitation (note triggers)
- 50%: Mix of external + internal
- 100%: Only internal excitation (self-triggering)

**Sound Design:**
- Use 0% for normal operation (notes trigger sound)
- Use 50-80% for added attack/noise burst on notes
- Use 100% for continuous drone (no note triggers needed)

**Trigger Method:**
Internal strum can be triggered manually via the voice pool:
```javascript
ringsVoicePool.strum(velocity); // Trigger internal excitation
```

## Polyphony Modes

Rings handles polyphony internally in the AudioWorklet processor, unlike Plaits (8 separate nodes) or Subtractive (8-voice worklet). The processor can run in three polyphony modes.

### M (Mono) - 1 Voice

**Single-voice mode**

Only one note plays at a time. New notes immediately replace previous notes. Ideal for monophonic lead lines, bass, and expressive solos.

**Behaviour:**
- New note kills previous note instantly (no release phase)
- Slide works in mono mode (pitch glides between notes)
- Lower CPU usage than poly modes

**When to Use:**
- Bass lines
- Lead melodies
- Expressive solos with slide/trill

### P2 (Poly 2) - 2 Voices

**Two-voice polyphony**

Two notes can play simultaneously. Voice stealing occurs if a third note is triggered (oldest voice is stolen).

**Behaviour:**
- Up to 2 simultaneous notes
- Voice stealing on 3rd note (oldest voice stolen)
- Each voice has independent STRUCTURE/BRIGHTNESS/DAMPING/POSITION
- Moderate CPU usage

**When to Use:**
- Dyads (two-note chords)
- Arpeggios with overlapping notes
- Balance between polyphony and CPU

### P4 (Poly 4) - 4 Voices

**Four-voice polyphony (maximum)**

Four notes can play simultaneously. This is the maximum polyphony for Rings (hardware limitation from the original Eurorack module).

**Behaviour:**
- Up to 4 simultaneous notes
- Voice stealing on 5th note (oldest voice stolen)
- Each voice has independent parameters
- Higher CPU usage

**When to Use:**
- Chords (triads, 7ths, etc.)
- Polyphonic pads
- Ambient textures
- Maximum polyphony needed

**Why Only 4 Voices?**

The original Rings hardware module was limited to 4 voices due to DSP constraints. This port preserves that limitation for authenticity and CPU efficiency. If you need more voices, consider:
- **Plaits engine:** 8-voice polyphony
- **Subtractive engine:** 8-voice polyphony
- **Easter Egg mode:** 12-voice polyphony (but different synthesis method)

## PPMod Integration

Rings parameters are integrated with Ræmbl's per-parameter modulation (PPMod) system, allowing LFO, envelope, random, and sequencer modulation.

**Important Limitation:** Rings PPMod is currently **global only** (not per-voice). All voices share the same modulation values because Rings handles polyphony internally in the AudioWorklet processor, and the main thread cannot address individual voices.

### Modulatable Parameters

| Parameter | Param ID | Range | Use Cases |
|-----------|----------|-------|-----------|
| **STRUCTURE** | `rings.structure` | 0-100% | Inharmonicity sweeps, mode evolution, FM ratio shifts |
| **BRIGHTNESS** | `rings.brightness` | 0-100% | Filter-like sweeps, timbral motion |
| **DAMPING** | `rings.damping` | 0-100% | Decay time variation, rhythmic gating |
| **POSITION** | `rings.position` | 0-100% | Pluck position sweeps, harmonic variation |

**Note:** STRUM is not currently modulatable via PPMod (no param ID assigned).

### Global Modulation Only

**Why Global?**

Rings uses a single AudioWorkletNode with internal 4-voice polyphony. The main thread cannot address individual voices within the processor, so all modulation is global (affects all voices equally).

**Contrast with Plaits:**
- **Plaits:** 8 separate AudioWorkletNodes → per-voice PPMod possible (compound keys: `voiceId:plaits.harmonics`)
- **Rings:** 1 AudioWorkletNode with 4 internal voices → global PPMod only (keys: `rings.structure`)

**What This Means:**
- LFO modulation affects all voices equally (unison effect)
- Envelope modulation triggers globally (not per-voice)
- Random modulation changes all voices at once
- No per-voice phase offsets (all voices in sync)

### K-Rate Modulation

Rings PPMod runs at k-rate (30 FPS, ~33ms updates) on the main thread, NOT audio-rate in the worklet.

**Implementation:**
```javascript
// Modulation calculated at 30 FPS
requestAnimationFrame(() => {
  const modValue = calculateModulation(mod, now);
  audioParam.setTargetAtTime(modValue, now, 0.015); // Smooth 15ms slew
});
```

**Why K-Rate:**
- Human perception of modulation changes is ~50ms (30 FPS is sufficient)
- Avoids expensive per-sample calculations in worklet
- <1% CPU overhead vs audio-rate modulation

**What This Means:**
- LFO/envelope modulation is smooth but not sample-accurate
- Perfect for musical modulation (filter sweeps, vibrato, timbral evolution)
- Not suitable for audio-rate FM (use FM Voice model instead)

### Modulation Examples

**Slow Inharmonicity Sweep (Modal Resonator):**
```javascript
// LFO mode
mode: 'LFO'
param: 'rings.structure'
depth: 60%
waveform: Sine
rate: 0.2 Hz
```
Creates slow evolution from harmonic to inharmonic tones (bell → metallic gong).

**Filter-Like Brightness Sweep (String Model):**
```javascript
// ENV mode
mode: 'ENV'
param: 'rings.brightness'
depth: 70%
attackMs: 50
releaseMs: 800
curve: exponential
```
Brightness decays exponentially after each note (like a lowpass filter envelope).

**Rhythmic Decay Variation (Sympathetic String):**
```javascript
// RND mode
mode: 'RND'
param: 'rings.damping'
depth: 40%
bitLength: 8
probability: 60%
sampleRate: 2 Hz
```
Decay time randomly varies on each note (organic, human-like variation).

**Pluck Position Sequence (String Model):**
```javascript
// SEQ mode
mode: 'SEQ'
param: 'rings.position'
depth: 80%
length: 8
pattern: [10, 30, 50, 70, 90, 70, 50, 30]
```
Pluck position sweeps through the string on each step (rhythmic timbral motion).

## Accent, Slide, and Trill

Rings supports Ræmbl's performance features for expressive sequencing.

### Accent

**1.5× velocity boost**

When a note is marked as accented in the sequencer:
1. Velocity multiplied by 1.5× (max 1.0)
2. Note sounds louder and more prominent
3. Accent is applied at trigger time (no envelope shaping)

**Sound Design Tip:** Use accent on downbeats or key rhythmic hits to add groove and emphasis.

### Slide

**TB-303 style pitch glide between notes**

Slide creates smooth pitch transitions between notes using pitch bend automation.

**Implementation:**
Rings doesn't have an `AudioParam` for pitch (notes are discrete messages), so slide is implemented via pitch bend messages with interpolated steps:

```javascript
// 10-step exponential interpolation over 80ms (mono slide)
for (let i = 0; i <= 10; i++) {
  const t = i / 10;
  const pitch = startPitch + (endPitch - startPitch) * (1 - Math.exp(-3 * t));
  setTimeout(() => sendPitchBend(pitch), delayMs + i * 8); // 8ms per step
}
```

**Mono Mode (TB-303 Style):**
- Pitch glides from previous note to current note
- Glide time: 80ms (default) or controlled by `glide` parameter (0-500ms)
- Only works if a previous note exists (mono voice continuity)

**Poly Mode (Slide-Into Effect):**
- Note starts -0.5 semitones flat and slides up over 40ms
- Creates subtle pitch bend-in effect
- Works even without previous note

**Sound Design Tip:**
- Use slide on adjacent scale notes for expressive string/bell lines
- Combine with sympathetic string models for rich, evolving slides

### Trill

**Rapid pitch oscillation to next scale degree**

Trill rapidly alternates between the main note and the next note in the current scale (set in PATH module).

**Implementation:**
- 2-note trill on offbeats (swung 16ths)
- 3-note trill on downbeats (even 16ths)
- Pitch automation via message-based pitch bend (10-step interpolation)

**Trill Timing:**
```javascript
const stepDurationSec = (60 / bpm) * (beatsPerBar / stepsPerBar);
const numSegments = isOffbeat ? 2 : 3;
const segmentDuration = stepDurationSec / numSegments;
```

**Segments:**
1. **Hold:** Note starts at base pitch (25% of segment)
2. **Slide:** Pitch ramps to trill target (70% of segment)
3. **Hold:** Note holds at trill pitch (remainder)
4. **Repeat:** Cycle back to base pitch

**Sound Design Tip:**
- Works beautifully with String model for realistic guitar/mandolin trills
- Combine with Modal resonator for expressive bell/glockenspiel tremolos

## Sound Design Tips

Practical recipes and starting points for getting musical results from Rings models.

### Plucked Acoustic Guitar (Model 2: String)

**Recipe:**
1. Set STRUCTURE to 35% (subtle inharmonicity)
2. Set BRIGHTNESS to 65% (natural guitar brightness)
3. Set DAMPING to 60% (moderate sustain)
4. Set POSITION to 20% (near bridge pluck)
5. Set polyphony to P2 or P4 (for arpeggios/chords)
6. Add subtle reverb (20-30% send)

**Why It Works:** Moderate STRUCTURE adds realistic string inharmonicity. Bridge POSITION creates bright attack. DAMPING matches acoustic guitar decay.

### Sympathetic Sitar Drone (Model 1: Sympathetic String)

**Recipe:**
1. Set STRUCTURE to 75% (strong sympathetic coupling)
2. Set BRIGHTNESS to 60% (balanced tone)
3. Set DAMPING to 85% (long sustain)
4. Set POSITION to 25% (moderate pluck position)
5. Set STRUM to 30% (add internal excitation)
6. Modulate STRUCTURE with slow LFO (0.15Hz sine, 20% depth)

**Why It Works:** High STRUCTURE creates sympathetic shimmer. High DAMPING sustains drone. LFO modulation adds organic evolution. STRUM adds continuous excitation.

### Tubular Bells (Model 0: Modal)

**Recipe:**
1. Set STRUCTURE to 40% (bell-like inharmonicity)
2. Set BRIGHTNESS to 60% (clear, ringing tone)
3. Set DAMPING to 80% (long decay)
4. Set POSITION to 50% (balanced excitation)
5. Set polyphony to P4 (for chords)
6. Add reverb (40-60% send)

**Why It Works:** Moderate STRUCTURE creates bell-like inharmonic ratios. High DAMPING = long ring. Reverb adds concert hall space.

### Electric Piano (Model 3: FM Voice)

**Recipe:**
1. Set STRUCTURE to 25% (1:2 harmonic ratio)
2. Set BRIGHTNESS to 70% (bright, clear tone)
3. Set DAMPING to 60% (electric piano decay)
4. Set POSITION to 30% (moderate FM feedback)
5. Set polyphony to P4 (for chords)
6. Add subtle chorus (via external FX)

**Why It Works:** Harmonic FM ratio (1:2) creates tonal, musical sound. Moderate DAMPING matches EP decay. Chorus adds width.

### Gong/Cymbal (Model 0: Modal)

**Recipe:**
1. Set STRUCTURE to 85% (strongly inharmonic)
2. Set BRIGHTNESS to 70% (bright, metallic)
3. Set DAMPING to 90% (very long decay)
4. Set POSITION to 60% (complex excitation)
5. Modulate STRUCTURE with random (RND mode, 16-bit, 40% depth, 0.5Hz)
6. Add reverb (60-80% send)

**Why It Works:** High STRUCTURE = chaotic inharmonic modes (metallic). Long DAMPING = gong-like sustain. Random modulation adds shimmer.

### Harp Glissando (Model 2: String)

**Recipe:**
1. Set STRUCTURE to 40% (subtle string inharmonicity)
2. Set BRIGHTNESS to 80% (bright, clear)
3. Set DAMPING to 70% (moderate decay)
4. Set POSITION to 30% (balanced pluck)
5. Set polyphony to P4
6. Use sequencer with fast arpeggios (32nd notes)
7. Add reverb (30-40% send)

**Why It Works:** Bright BRIGHTNESS = harp-like clarity. Fast arpeggios simulate glissando. Polyphony allows notes to overlap and ring out.

### Bowed String Pad (Model 5: String + Reverb)

**Recipe:**
1. Set STRUCTURE to 50% (moderate inharmonicity)
2. Set BRIGHTNESS to 60% (warm, mellow)
3. Set DAMPING to 90% (long sustain)
4. Set POSITION to 70% (high reverb mix)
5. Set polyphony to P4 (for chords)
6. Modulate BRIGHTNESS with slow LFO (0.1Hz sine, 30% depth)

**Why It Works:** High DAMPING + built-in reverb = sustained pad. High POSITION = wet reverb mix (intimate sound). LFO adds slow timbral evolution.

### Kalimba/Mbira (Model 0: Modal)

**Recipe:**
1. Set STRUCTURE to 20% (more harmonic)
2. Set BRIGHTNESS to 40% (mellow, woody)
3. Set DAMPING to 50% (moderate decay)
4. Set POSITION to 40% (balanced excitation)
5. Set polyphony to P2 or P4

**Why It Works:** Low STRUCTURE = pitched, musical tones (not chaotic). Moderate BRIGHTNESS/DAMPING matches kalimba character.

## Comparison with Plaits and Subtractive

Ræmbl offers three synthesis engines. Here's when to use each:

### Subtractive Engine

**Best For:**
- Classic analogue-style sounds (bass, leads, pads)
- Filter sweeps and resonance effects
- Learning synthesis fundamentals
- CPU-efficient polyphony

**Strengths:**
- Familiar subtractive workflow (osc → filter → env)
- Independent amp + filter envelopes (ADSR)
- Polyphonic (8 voices)
- Low CPU usage

**Limitations:**
- Single synthesis type (VA subtractive only)
- No physical modelling or complex timbres

### Plaits Engine

**Best For:**
- Exploring diverse synthesis techniques
- Creating complex, evolving timbres
- Percussive and physical modelling sounds (limited realism)
- One-knob sound design (macro controls)

**Strengths:**
- 24 synthesis engines in one interface
- Macro controls offer immediate musicality
- OUT/AUX dual outputs
- 8-voice polyphony
- Great for happy accidents and exploration

**Limitations:**
- Less realistic physical modelling than Rings
- Single decay envelope (no sustain stage)
- Higher CPU usage than subtractive

### Rings Engine

**Best For:**
- Realistic plucked/struck sounds (strings, bells, mallets)
- Sympathetic resonances and complex decay
- Pitched percussion with realistic sustain
- Inharmonic/metallic timbres

**Strengths:**
- Most realistic physical modelling in Ræmbl
- Sympathetic string coupling (unique to Rings)
- Six distinct resonator models
- Natural decay behaviour (amplitude + brightness)

**Limitations:**
- Lower polyphony (4 voices max vs 8 for others)
- No per-voice PPMod (global modulation only)
- Specific to resonant/struck timbres (not versatile for all sounds)
- Slightly higher CPU than subtractive (less than Plaits)

**Which Rings Model vs Plaits Engine?**

| Sound Type | Rings Model | Plaits Engine | Winner |
|------------|-------------|---------------|--------|
| Plucked guitar | Model 2 (String) | Engine 11 (String) | **Rings** (more realistic) |
| Struck bell | Model 0 (Modal) | Engine 12 (Modal) | **Rings** (richer harmonics) |
| Electric piano | Model 3 (FM Voice) | Engine 2 (FM) | **Plaits** (more FM control) |
| Bass drum | N/A | Engine 13 (Bass Drum) | **Plaits** (dedicated model) |
| Sympathetic strings | Model 1/4 | N/A | **Rings** (unique to Rings) |
| Granular/speech | N/A | Engines 3/7 | **Plaits** (not in Rings) |

**Rule of Thumb:**
- **Subtractive:** Traditional synth sounds, learning, CPU efficiency
- **Plaits:** Diverse timbres, experimentation, macro control, 8-voice poly
- **Rings:** Realistic physical modelling, plucked/struck sounds, sympathetic resonances

**Combining Engines:**
You can only use one engine at a time in Ræmbl, but you can:
- Layer multiple Ræmbl instances (requires external routing)
- Use Bæng (drum machine) + Ræmbl (melodic synth) together
- Switch engines mid-performance via engine selector UI

## Troubleshooting

### Audio Distortion / Runaway Resonance (Modal Model)

**Symptom:** Harsh distortion, runaway feedback, or piercing resonance when using Modal resonator (Model 0)

**Cause:** STRUCTURE value too high (>95%) causes Q-factor instability in SVF filters

**Solution:**
1. Reduce STRUCTURE below 90%
2. The validation system should auto-clamp to 95%, but manual reduction is safer
3. If distortion persists, reduce BRIGHTNESS as well

### Sympathetic String Instability (Models 1/4)

**Symptom:** Chaotic, runaway coupling between strings

**Cause:** STRUCTURE too high (>85-90% depending on model)

**Solution:**
1. Reduce STRUCTURE below 80%
2. Model 4 (Sympathetic String Q) is stricter - keep below 75% for stability

### No Sound on Note Trigger

**Check:**
1. Is DAMPING > 0? (If DAMPING = 0, notes decay instantly)
2. Is BRIGHTNESS > 0? (Very low brightness can be nearly inaudible)
3. Is STRUM at 100%? (If yes, only internal strum triggers sound - set to 0% for normal operation)
4. Is polyphony set correctly? (M/P2/P4)

### Slide/Trill Not Working

**Check:**
1. Is mono mode enabled? (Slide requires previous note in mono mode)
2. Is scale set correctly in PATH module? (Trill needs valid scale)
3. Are notes adjacent in the scale? (Slide works best with adjacent notes)

### PPMod Not Affecting Individual Voices

**Expected Behaviour:** Rings PPMod is **global only** (not per-voice)

**Why:** Rings uses internal 4-voice polyphony in a single AudioWorklet processor. The main thread cannot address individual voices, so all modulation is global.

**Workaround:** Use Plaits or Subtractive engines for per-voice modulation (both have 8 separate voice nodes).

### Choppy/Glitchy Slide

**Symptom:** Slide pitch automation sounds steppy or glitchy

**Cause:** Message-based pitch bend uses 10-step interpolation (not smooth AudioParam automation)

**Solution:**
1. This is expected behaviour (Rings doesn't have AudioParam for pitch)
2. For smoother slides, reduce slide time (faster slides hide steppiness)
3. For ultra-smooth slides, use Subtractive or Plaits engines (they use `exponentialRampToValueAtTime()`)

### CPU Usage Higher Than Expected

**Check:**
1. Which polyphony mode? (P4 uses 4× CPU of M)
2. Is Easter Egg enabled? (12 voices = 3× CPU of P4 resonator mode)
3. Are you modulating all parameters at once? (Each PPMod adds 30 FPS calculations)

**Optimisation:**
- Use M or P2 instead of P4 if you don't need 4 voices
- Disable unused PPMod modulations
- Reduce reverb/delay send levels (FX add CPU overhead)

## Technical Reference

### AudioWorklet Architecture

Rings is implemented as a single AudioWorkletNode with internal 4-voice polyphony (or 12 voices in Easter Egg mode).

**File:** `merged-app/js/audio/worklets/rings-processor.bundle.js` (bundled from source)

**Voice Pool Manager:** `merged-app/js/raembl/audio/rings-voice-pool.js`

**Key Components:**
- `RingsVoicePool` - Manages single AudioWorkletNode, handles note triggering
- `rings-processor` - AudioWorklet processor with 6 resonator models + Easter Egg
- Resonator implementations (modal, sympathetic string, FM, etc.)

**Message Protocol:**
```javascript
// Main thread → Worklet
node.port.postMessage({ type: 'noteOn', note: 60, velocity: 0.8 });
node.port.postMessage({ type: 'noteOff', note: 60 });
node.port.postMessage({ type: 'setModel', value: 0-5 }); // Resonator model
node.port.postMessage({ type: 'setPolyphony', value: 1|2|4 }); // M/P2/P4
node.port.postMessage({ type: 'setEasterEgg', value: true|false });
node.port.postMessage({ type: 'setFxType', value: 0-5 }); // Easter Egg FX
node.port.postMessage({ type: 'strum', velocity: 0.8 }); // Internal excitation
node.port.postMessage({ type: 'pitchBend', value: semitonesOffset }); // Slide/trill

// Worklet → Main thread
{ event: 'modelChanged', value: modelIndex }
{ event: 'polyphonyChanged', value: voiceCount }
{ event: 'easterEggChanged', value: true|false }
{ event: 'debug', value: 'message' }
```

**Note on Pitch Control:**
Rings uses message-based pitch bend (not `AudioParam`) because notes are discrete MIDI events internally, not continuous frequency values. Slide/trill are implemented via interpolated pitch bend messages (10 steps over slide duration).

### Parameter Mapping

Rings parameters are stored as 0-100 in state but mapped to 0-1 for the AudioWorklet processor.

| State Key | Range (State) | Range (Processor) | Mapping |
|-----------|---------------|-------------------|---------|
| `ringsModel` | 0-5 (discrete) | 0-5 (int) | Direct |
| `ringsStructure` | 0-100 | 0.0-1.0 | Linear with model-specific clamping |
| `ringsBrightness` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `ringsDamping` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `ringsPosition` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `ringsMixStrum` | 0-100 | 0.0-1.0 | Linear (0-100 → 0-1) |
| `ringsPolyphony` | 1, 2, or 4 | 1, 2, or 4 | Direct |
| `ringsEasterEgg` | boolean | boolean | Direct |
| `ringsFxType` | 0-5 (discrete) | 0-5 (int) | Direct (Easter Egg only) |

**Validation Layer:**
STRUCTURE parameter has model-specific safe limits enforced by `ringsValidation.js`:

| Model | Safe Max | Reason |
|-------|----------|--------|
| 0 (Modal) | 95% | SVF Q-factor stability |
| 1 (Sympathetic) | 90% | Coupling stability |
| 2 (String) | 100% | Karplus-Strong stable |
| 3 (FM Voice) | 100% | FM stable |
| 4 (Sympathetic Q) | 85% | Stricter coupling limits |
| 5 (String + Reverb) | 100% | Stable |

**Update Flow:**
```javascript
// UI → State → Audio
faderValue (0-100) → state.ringsStructure (0-100) → validated → audioParam.value (0-1)

// State → UI (patch load)
state.ringsStructure (0-100) → faderValue (0-100) → fader visual position
```

### FX Routing

Rings voices connect to the same FX chain as other Ræmbl engines:

**Classic Mode (Reverb + Delay):**
```
Rings Node → Master Gain
         └→ Reverb Send
         └→ Delay Send
         └→ Dry Signal Tap (for sidechain)
```

**Clouds Mode:**
```
Rings Node → Clouds Input Analyser → Clouds Processor → Master
```

FX mode switching is handled by `audio.js:switchFxMode()`, which reconnects the Rings node.

### Patch Format

Rings parameters are saved in the unified patch format v1.2.0+:

```json
{
  "version": "1.2.0",
  "raembl": {
    "engineType": "rings",
    "ringsModel": 2,
    "ringsStructure": 40,
    "ringsBrightness": 65,
    "ringsDamping": 60,
    "ringsPosition": 20,
    "ringsMixStrum": 0,
    "ringsPolyphony": 4,
    "modulations": {
      "rings.brightness": {
        "mode": "ENV",
        "enabled": true,
        "depth": 70,
        "envAttackMs": 50,
        "envReleaseMs": 800,
        "envCurveShape": "exponential"
      }
    }
  }
}
```

**Backward Compatibility:**
- Patches without `engineType` default to `'subtractive'`
- Rings parameters ignored if engine isn't Rings
- Missing Rings params use defaults (50 for most, 0 for strum)

**Easter Egg in Patches:**
Easter Egg mode is NOT saved in patches (intentionally hidden feature). It must be re-enabled manually after patch load.

## See Also

- **[Ræmbl User Guide](../../user-guide/raembl-guide.md)** - Complete guide to Ræmbl synthesiser
- **[Plaits Engine](./plaits-engine.md)** - Macro oscillator with 24 synthesis engines
- **[Subtractive Engine](./subtractive-engine.md)** - Classic VA synthesis engine
- **[PPMod System](../../modulation/ppmod-modes.md)** - Per-parameter modulation
- **[Ræmbl Parameters Reference](../../reference/raembl-parameters.md)** - All Ræmbl parameters

---

**Version:** 1.0
**Last Updated:** 2025-12-30
**Rings Firmware Version:** Mutable Instruments Rings 1.0 (C++ → JavaScript port)
**Easter Egg:** Disastrous Peace (12-voice polysynth)
