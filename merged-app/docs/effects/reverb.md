# Reverb Effect

**Algorithmic convolution reverb with independent routing per synthesiser**

Both Bæng and Ræmbl feature high-quality algorithmic reverb implemented using Web Audio API convolution with real-time impulse response generation. Each synthesiser maintains its own independent reverb signal path, allowing different spatial characteristics for drums and melodic content.

## Overview

The reverb effect uses a dual-convolver crossfading system to allow parameter changes without audio glitches. When you adjust reverb parameters, the system generates a new impulse response and seamlessly crossfades between the old and new reverb tails over 20-250ms (depending on implementation).

**Key Features:**
- Dual-convolver crossfading for glitch-free parameter changes
- Real-time impulse response generation
- Independent routing per synthesiser
- Separate send levels per voice (Bæng) or global send (Ræmbl)
- Sidechain ducking support (optional)
- Visualisation via oscilloscope display

## Signal Flow

### Bæng (Drum Machine)
```
Voice Output → Pan → Send Gain (per-voice) → Reverb Input
                                                    ↓
                               Convolver 1 → Gain 1 ┐
                               Convolver 2 → Gain 2 ├→ Wet Gain → [Ducking] → Master
                                                    ┘
```

**Per-Voice Sends:**
- Each of the 6 voices has an independent reverb send control (0-100%)
- Send connections are only created when send level > 0 to prevent audio bleeding
- Voices route through panner before reverb send for correct stereo imaging

### Ræmbl (Melodic Synthesiser)
```
Voice Pool → Send Gain (global) → Reverb Input
                                       ↓
                  Convolver 1 → Gain 1 ┐
                  Convolver 2 → Gain 2 ├→ Wet Gain → [Ducking] → Master
                                       ┘
```

**Global Send:**
- Single reverb send control affects all voices (0-100%)
- Send level controls the amount of signal entering the reverb processor
- Wet/dry mix handled by send level (100% wet output from reverb)

## Parameters

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| **Send** (Ræmbl) | 0-100% | 25% | Global send level to reverb processor |
| **Send** (Bæng per-voice) | 0-100% | 0% | Per-voice send level to reverb processor |
| **Decay** | 0-100 | 50 (Bæng)<br>70 (Ræmbl) | Reverb tail length (0.1s-5.0s) |
| **Damping** | 0-100 | 50 (Bæng)<br>20 (Ræmbl) | High-frequency absorption (0 = bright, 100 = dark) |
| **Diffusion** | 0-100 | 60 | Impulse density/complexity (0 = discrete echoes, 100 = smooth reverb) |
| **Pre-Delay** | 0-100 | 10 | Early reflections timing (0-200ms) |

### Parameter Mapping Details

**Decay (0-100 → 0.1-5.0 seconds):**
- Maps exponentially from 0.1s (small room) to 5.0s (cathedral)
- Controls the length of the generated impulse response buffer
- Formula: `decayTime = 0.1 + (param/100) × 4.9`

**Damping (0-100 → 0-1):**
- Controls exponential high-frequency decay within the impulse response
- Higher values simulate absorption by soft materials (carpets, curtains)
- Applied as `envelope × exp(-t × damping × 5)` per sample

**Diffusion (0-100 → 0-1):**
- Controls impulse envelope shape: `pow(1 - t, 2.0 + (diffusion × 2))`
- Low diffusion (0-30): Discrete early reflections (useful for rhythmic effects)
- Medium diffusion (30-70): Balanced room reverb
- High diffusion (70-100): Dense, smooth reverb tail

**Pre-Delay (0-100 → 0-200ms):**
- Delays the start of the reverb tail relative to the dry signal
- Simulates distance between sound source and nearest reflective surface
- Creates separation between dry signal and reverb onset
- Formula: `preDelayTime = (param/100) × 0.2` seconds

## Implementation Details

### Impulse Response Generation

The reverb uses algorithmic impulse response generation rather than convolution with recorded spaces. This allows real-time parameter control with the following characteristics:

**Stereo Impulse Structure:**
1. Pre-delay period (silence) at the start
2. Envelope-shaped noise burst with:
   - Diffusion-controlled decay curve
   - Damping-controlled high-frequency roll-off
   - Slight left/right channel decorrelation for width

**Crossfading Behaviour:**
- **Bæng**: 250ms linear crossfade between old and new impulse
- **Ræmbl**: 20ms linear crossfade between old and new impulse
- Prevents clicks/glitches when adjusting parameters during playback
- Uses dual-convolver architecture: one active, one loading

### CPU Considerations

Convolution reverb is relatively CPU-intensive:
- Buffer length varies from 4,800 samples (0.1s @ 48kHz) to 240,000 samples (5.0s @ 48kHz)
- Longer decay times increase CPU usage
- Crossfading briefly uses double CPU (two convolvers active)
- Per-voice sends (Bæng) add minimal overhead (simple gain nodes)

## Usage Tips

### Basic Reverb Settings

**Small Room / Studio:**
- Decay: 20-40
- Damping: 40-60
- Diffusion: 50-70
- Pre-Delay: 0-10

**Concert Hall:**
- Decay: 60-80
- Damping: 20-40
- Diffusion: 70-90
- Pre-Delay: 10-30

**Cathedral / Large Space:**
- Decay: 80-100
- Damping: 10-30
- Diffusion: 80-100
- Pre-Delay: 20-50

**Special Effects (Rhythmic):**
- Decay: 30-60
- Damping: 60-80
- Diffusion: 0-30 (low for discrete echoes)
- Pre-Delay: 20-80 (exaggerated for rhythmic bounce)

### Mixing Guidelines

**Bæng (Drum Machine):**
- Kick drum: 0-20% send (too much reverb muddies low end)
- Snare: 20-50% send (sweet spot for body and depth)
- Hi-hats: 10-40% send (shimmer without wash)
- Toms/percussion: 30-60% send (create space and dimension)
- Use low send + high decay for subtle space, or high send + short decay for ambience

**Ræmbl (Melodic Synthesiser):**
- Default 25% send provides audible but subtle space
- Increase send to 40-60% for ambient/pad sounds
- Reduce send to 10-20% for upfront, dry lead sounds
- Experiment with high diffusion (80-100) for smooth pad reverb
- Use low diffusion (20-40) for rhythmic textures on arpeggios

### Creative Techniques

**Reverse Reverb Effect:**
1. Freeze a reverb tail by stopping the sequence with high decay
2. Use Bæng's per-voice sends to "paint" reverb onto specific hits
3. Adjust pre-delay for rhythmic timing

**Rhythmic Reverb:**
1. Set diffusion low (0-30) for discrete echoes
2. Match pre-delay to tempo (e.g., 30-40 for 120 BPM 16th note gap)
3. Use moderate decay (40-60) to hear echo pattern without excess tail

**Shimmer Reverb:**
1. Set damping low (0-20) for bright, sustained highs
2. Long decay (80-100) for extended tail
3. High diffusion (80-100) for smooth texture
4. Works especially well with Ræmbl's sub oscillator or noise layer

**Gated Reverb (80s Drum Sound):**
1. Set short decay (10-30) for truncated tail
2. High diffusion (70-90) for dense burst
3. Use Bæng's accent modulation to vary reverb send per hit
4. Combine with bit reduction for vintage digital reverb character

## Sidechain Ducking

Both synthesisers support optional sidechain ducking, allowing Bæng drum hits to "duck" (reduce) the reverb output. This creates rhythmic pumping and prevents reverb tails from muddying the mix during busy drum patterns.

**Configuration:**
- Access via Bæng's sidechain modal
- Select which voices trigger ducking (typically kick drum)
- Adjust threshold, ratio, attack, and release
- Enable independently for Bæng reverb and/or Ræmbl reverb

**Ducking Parameters:**
- **Threshold**: Level at which ducking activates (0-100%)
- **Ratio**: Amount of gain reduction (0-100%)
- **Attack**: How quickly ducking engages (1-100ms)
- **Release**: How quickly reverb recovers after hit (10-500ms)
- **Range**: Maximum gain reduction in dB (0-60dB)

See [Sidechain Ducking Documentation](../features/sidechain.md) for full details.

## Comparison with Other Effects

### Reverb vs. Delay

**When to use Reverb:**
- Creating spatial depth and room simulation
- Smoothing harsh transients
- Adding body to thin sounds
- Ambient/pad textures

**When to use Delay:**
- Rhythmic echoes synced to tempo
- Distinct repeats (not smooth tail)
- Creating stereo width via ping-pong patterns
- Dub/reggae echo effects

**Using Both Together:**
- Delay → Reverb (classic chain): Discrete echoes feed into smooth space
- Parallel routing: Each effect has independent character
- Use Bæng's per-voice sends to route drums to delay, synth voices to reverb

### Reverb vs. Clouds

**When to use Reverb:**
- Transparent spatial enhancement
- Natural room/hall simulation
- Predictable, traditional reverb sound
- Low CPU usage for long tails

**When to use Clouds (Oliverb mode):**
- Experimental/textured reverb
- Modulated pitch-shifting reverb
- Granular diffusion effects
- When you need feedback routing

See [Clouds FX Engine Documentation](clouds.md) for Oliverb mode details.

## Technical Notes

### Browser Compatibility

Convolution reverb is supported in all modern browsers via the Web Audio API `ConvolverNode`. Performance is generally excellent on desktop and recent mobile devices.

**Performance Tips:**
- Longer decay times increase CPU usage (more convolution samples)
- Crossfading briefly doubles CPU load (two convolvers active)
- Per-voice sends (Bæng) add minimal overhead compared to impulse generation

### Sample Rate Considerations

Impulse responses are generated at the audio context sample rate (typically 48kHz). Buffer lengths scale proportionally:
- At 44.1kHz: 5s decay = 220,500 samples
- At 48kHz: 5s decay = 240,000 samples

### Visualisation

Both implementations feature real-time oscilloscope visualisation:

**Bæng:** Vertical cascade display showing reverb tail decay
- Multiple instances drawn at increasing horizontal offsets
- Opacity/line width fade over time (simulating decay)
- Diffusion visualised via pixel dropout probability
- Damping visualised via amplitude reduction

**Ræmbl:** Horizontal waveform display
- Post-reverb time-domain waveform
- Analyser connected after convolver output
- Yellow gradient colour coding

## Related Documentation

- [Delay Effect](delay.md) - Companion time-based effect
- [Clouds FX Engine](clouds.md) - Alternative granular/reverb processor
- [Drum Bus](drum-bus.md) - Bæng master processing (includes compression)
- [Sidechain Ducking](../features/sidechain.md) - Rhythmic reverb reduction

---

*Part of the Bæng & Ræmbl merged synthesiser suite*
