# Clouds Granular Effects Engine

**Complete port of Mutable Instruments Clouds with 6 playback modes**

Clouds is a granular/spectral texture processor offering six distinct playback engines. Originally created as a Eurorack module by Mutable Instruments, this is a 100% accurate port to Web Audio API, shared between both Bæng and Ræmbl synthesisers.

## Overview

Clouds transforms audio in real-time by capturing incoming sound into a buffer and applying various DSP techniques - from classic granular synthesis to spectral processing, pitch-shifting, and resonator-based effects. The module includes two additional "Parasites" modes (Oliverb and Resonestor) from the alternative firmware.

**Key Features:**
- 6 playback modes (4 original Clouds + 2 Parasites)
- Shared 5.46s buffer (262,144 samples @ 48kHz)
- Quality presets (HI/MED/LO/XLO) with configurable bit depth and buffer time
- Freeze function to lock buffer content
- Clock-synchronisable triggers for rhythmic effects
- Buffer visualisation with waveform display

## Signal Flow

```
Input → Input Gain → [Feedback Mix] → Buffer Write → Mode Router
                                                           ↓
    Output ← Dry/Wet Mix ← Reverb ← [Feedback Tap] ← Diffuser
```

**Detailed Processing Chain:**
1. **Input Stage** - Input gain (0-200%) applied to dry signal
2. **Feedback Mix** - Previous output mixed with input (high-pass filtered)
3. **Buffer Write** - Audio written to circular buffer (unless frozen)
4. **Mode Router** - Signal routed to active engine (Granular/WSOLA/Looping/Spectral/Oliverb/Resonestor)
5. **Diffuser** - Adds texture/smear (amount controlled by Density or Texture depending on mode)
6. **Feedback Tap** - Output captured for feedback loop (before reverb)
7. **Reverb** - Gemini reverb with LFO modulation (controlled by Reverb param)
8. **Dry/Wet Mix** - Equal-power crossfade between dry and processed signal

**Critical Points:**
- Feedback tap occurs **after** diffuser but **before** reverb
- Feedback is high-pass filtered (20-120Hz cutoff) to prevent rumble
- Dry signal bypasses all processing for clean parallel mixing
- Freeze disables buffer writes and reduces feedback gain to zero

## The 6 Playback Modes

### Mode 0: Granular

**Classic granular synthesis with 64-grain engine**

Chops the buffer into small overlapping grains with controllable duration, density, and texture. The most versatile mode for creating evolving textures, rhythmic stutters, and frozen soundscapes.

**How It Works:**
- 64 simultaneous grains (matching Clouds hardware)
- Window morphing: Texture parameter blends between triangle (0) and Hann (100) windows
- Deterministic mode: Density < 50% triggers grains on exact intervals for rhythmic patterns
- Stochastic mode: Density ≥ 50% randomises grain timing for fluid textures
- Pitch randomisation: Texture parameter adds ±1 semitone variation per grain

**Best For:**
- Ambient textures and pads
- Rhythmic stutters and glitches
- Time-stretching frozen material
- Creating "clouds" of sound (hence the name)

**Parameter Behaviour:**
- **Position**: Playback position in buffer (0-100%)
- **Size**: Grain duration (short grains = grainy, long grains = smooth)
- **Density**: Grain trigger rate + deterministic/stochastic crossfade
- **Texture**: Window shape (< 75%) + diffusion amount (> 75%) + pitch randomisation
- **Pitch**: Playback speed/pitch shift (-24 to +24 semitones)
- **Spread**: Stereo width (grain panning randomisation)

### Mode 1: WSOLA (Pitch-Shifter)

**Waveform-Similarity Overlap-Add for time-stretching**

Time-domain pitch-shifting that preserves transients and formants. Unlike granular mode, WSOLA analyses waveform similarity to find optimal splice points, resulting in cleaner pitch-shifts without the "grainy" artefacts.

**How It Works:**
- Correlation-based analysis finds best splice points
- Overlap-add crossfading smooths transitions
- Preserves waveform phase coherency
- Works best on tonal/harmonic material

**Best For:**
- Clean pitch-shifting of melodic content
- Vocal processing without chipmunk/formant shift
- Time-stretching without changing pitch
- Preserving transient detail during pitch changes

**Parameter Behaviour:**
- **Position**: Buffer read position (0-100%)
- **Size**: Window size for correlation analysis
- **Density**: Overlap amount (higher = smoother but more latency)
- **Texture**: Waveform matching tolerance
- **Pitch**: Pitch shift amount (-24 to +24 semitones)
- **Spread**: Stereo width

**Trigger Behaviour:** Clock sync trigger starts playback from Position parameter (useful for triggered one-shots)

### Mode 2: Looping Delay

**Buffer-based delay line with pitch-shifting**

A tempo-synchronisable delay with adjustable loop points and pitch control. Unlike traditional delays, the loop region can be positioned anywhere in the buffer and locked to clock triggers for rhythmic effects.

**How It Works:**
- Crossfading loop with 64-sample crossfade duration
- Loop start/end calculated from Position + Size parameters
- Trigger sync locks loop duration to clock (e.g., 1 bar, 2 bars)
- Pitch parameter shifts loop playback speed

**Best For:**
- Dub-style delay effects
- Rhythmic loop mangling
- Tempo-synced phrase sampling
- Pitch-shifted echo effects

**Parameter Behaviour:**
- **Position**: Loop start point in buffer (0-100%, squared response for fine control near start)
- **Size**: Loop duration (1-99% of buffer, squared response)
- **Density**: Feedback amount (internal loop feedback, separate from main FB param)
- **Texture**: Loop crossfade character
- **Pitch**: Loop playback speed (-24 to +24 semitones)
- **Spread**: Stereo width

**Trigger Behaviour:** When clock sync enabled, trigger locks loop duration to current write head position (creates bar-locked loops)

### Mode 3: Spectral

**Phase vocoder FFT processing for frequency-domain effects**

Transforms audio into the frequency domain using FFT, allowing independent manipulation of spectral bins. Creates smeared, frozen, and frequency-shifted textures impossible with time-domain processing.

**How It Works:**
- 2048-point FFT with Hann window
- 75% overlap (512-sample hop size)
- Magnitude/phase representation
- Bin-level frequency shifting and smearing

**Best For:**
- Spectral freezing/smearing
- Frequency shifting without time-domain artefacts
- Creating metallic/robotic textures
- Blurring transients into sustained tones

**Parameter Behaviour:**
- **Position**: Spectral bin offset (frequency shift)
- **Size**: FFT window overlap (affects temporal smearing)
- **Density**: Spectral blur amount (averages adjacent bins)
- **Texture**: Phase randomisation amount
- **Pitch**: Spectral shift (-24 to +24 semitones equivalent)
- **Spread**: Stereo spectral decorrelation

### Mode 4: Oliverb

**Parasites reverb mode with pitch-shifting**

A lush reverb algorithm combining diffusion, delay networks, and pitch-shifting. Based on the Parasites firmware alternative, this mode uses the Clouds buffer as a reverb engine with modulated pitch-shifting for evolving spaces.

**How It Works:**
- Multi-tap delay network with cross-feedback
- Pitch-shifter with wet/dry crossfade based on pitch amount
- LFO-modulated delay times for shimmer/chorus
- Tone controls (LP/HP based on Texture parameter)

**Best For:**
- Ambient reverb tails
- Shimmer reverb effects
- Creating vast spaces from short sounds
- Pitched reverb textures

**Parameter Behaviour:**
- **Position**: *(Parameter unused in this mode)*
- **Size**: Reverb size/time (0.05-0.99 scaling)
- **Density**: Decay time (0-130% range)
- **Texture**: Tone control (< 50% = lowpass, > 50% = highpass)
- **Pitch**: Pitch-shift amount in reverb tail (-24 to +24 semitones)
- **Spread**: Diffusion amount (stereo width)
- **Feedback**: Modulation rate (LFO speed for delay time modulation)
- **Reverb**: Modulation depth (0-300 range)

**Freeze Behaviour:** When frozen, input gain = 0, decay = 100%, tone = flat (infinite reverb tail)

### Mode 5: Resonestor

**Parasites modal synthesis resonator**

A bank of tuned comb filters that resonates at harmonic frequencies, transforming audio into sustained, bell-like tones. Based on physical modelling principles, this mode excites a virtual resonator with the input signal.

**How It Works:**
- 8-voice comb filter bank with stereo spreading
- Chord table interpolation (Size parameter selects harmonic intervals)
- Burst generator triggered by Density or clock trigger
- Narrow/wide resonance modes controlled by Density
- Harmonic feedback paths

**Best For:**
- Turning drums into pitched resonances
- Creating bell/gong-like textures
- Harmonic excitation effects
- Drone/sustain generation from transient sources

**Parameter Behaviour:**
- **Position**: *(Parameter unused in this mode)*
- **Size**: Chord selection (interpolates between chord tables for harmonic intervals)
- **Density**: Resonance bandwidth (0.001-0.01 range) + trigger gate
- **Texture**: High-frequency damping (0.3-1.0 range)
- **Pitch**: Root pitch (-24 to +24 semitones from reference)
- **Spread**: Stereo spread of comb filter frequencies
- **Feedback**: Resonator feedback amount (clamped to 0.95 max for stability)

**Trigger Behaviour:** Density > 90% or clock sync trigger activates burst generator (short noise/comb impulse to excite resonators)

## Parameters

Complete parameter reference for all Clouds controls:

| Parameter | UI Label | Range | Default | State Key | Critical? | Description |
|-----------|----------|-------|---------|-----------|-----------|-------------|
| **cloudsPitch** | PITCH | -24 to +24 st | 0st | `cloudsPitch` (0-100) | No | Pitch shift in semitones. 0=no shift, negative=down, positive=up. Mapped from 0-100 state: 0→-24st, 50→0st, 100→+24st |
| **cloudsPosition** | POS | 0-100% | 0% | `cloudsPosition` (0-100) | No | Buffer read position. 0=oldest audio, 100=newest. Modes 0-3 use this; modes 4-5 ignore it |
| **cloudsDensity** | DENS | 0-100% | 50% | `cloudsDensity` (0-100) | No | **Granular:** Grain trigger rate. **WSOLA:** Overlap amount. **Looping:** Internal feedback. **Spectral:** Spectral blur. **Oliverb:** Decay time. **Resonestor:** Resonance bandwidth + trigger gate |
| **cloudsSize** | SIZE | 0-100% | 0% | `cloudsSize` (0-100) | No | **Granular:** Grain duration. **WSOLA:** Analysis window size. **Looping:** Loop duration. **Spectral:** FFT overlap. **Oliverb:** Reverb size. **Resonestor:** Chord selection |
| **cloudsTexture** | TEX | 0-100% | 50% | `cloudsTexture` (0-100) | No | **Granular:** Window shape + diffusion (>75%). **WSOLA:** Waveform matching tolerance. **Looping:** Crossfade character. **Spectral:** Phase randomisation. **Oliverb:** Tone (LP/HP). **Resonestor:** HF damping |
| **cloudsDryWet** | D/W | 0-100% | 100% | `cloudsDryWet` (0-100) | No | Dry/wet mix using equal-power crossfade. 0=100% dry, 50=equal mix, 100=100% wet. Post-gain = 1.2x applied to wet signal |
| **cloudsSpread** | SPRD | 0-100% | 50% | `cloudsSpread` (0-100) | No | Stereo width. **Granular:** Grain panning randomisation. **WSOLA/Looping/Spectral:** Stereo decorrelation. **Oliverb:** Diffusion. **Resonestor:** Comb filter stereo spread |
| **cloudsFeedback** | FB | 0-100% | **0%** | `cloudsFeedback` (0-100) | **YES** | Feedback amount (output fed back to input). **CRITICAL: Must default to 0 to prevent runaway oscillation.** HP filtered (20-120Hz) to remove rumble. Reduced to 0 when frozen |
| **cloudsReverb** | VERB | 0-100% | 30% | `cloudsReverb` (0-100) | **YES** | Post-diffuser reverb amount. Controls both reverb mix (amount) and decay time. **WARNING: High values (>70%) + high feedback (>90%) can cause instability** |
| **cloudsInputGain** | IN | 0-200% | 100% | `cloudsInputGain` (0-100) | No | Input level boost/cut. 0-100 state maps to 0-200%. 0=silence, 50=100% (unity), 100=200% (double) |

**State Mapping:**
- All parameters stored as 0-100 in state (for patch save/load)
- **Pitch**: 0-100 → -24 to +24 semitones (0→-24, 50→0, 100→+24)
- **Input Gain**: 0-100 → 0-200% (0→0%, 50→100%, 100→200%)
- **All others**: 0-100 → 0-1 (linear)

**Processor-Level Bounds Checking:**
All parameters are clamped in the AudioWorklet processor's `process()` method as a final safety layer, even if invalid values are sent from UI.

## Quality Presets

Clouds offers 4 quality presets affecting buffer storage and DSP characteristics:

| Preset | Bit Depth | Stereo | Buffer Time | Memory | Character |
|--------|-----------|--------|-------------|--------|-----------|
| **HI** | 16-bit | Stereo | 1s | 96KB | Clean, full bandwidth, short buffer |
| **MED** | 16-bit | Mono | 2s | 96KB | Clean, mono sum, medium buffer |
| **LO** | 8-bit | Stereo | 4s | 96KB | Lo-fi, crunchy, long buffer |
| **XLO** | 8-bit | Mono | 8s | 96KB | Lo-fi, mono, extra-long buffer |

**How Quality Affects Sound:**
- **16-bit**: Full dynamic range, minimal quantisation noise
- **8-bit**: Audible quantisation noise, vintage sampler character, reduced dynamic range
- **Stereo**: Preserves L/R separation
- **Mono**: Sums L+R input (doubles buffer time for same memory usage)

**Buffer Time Calculation:**
- All presets use same memory (262,144 samples)
- @ 48kHz sample rate: 262,144 / 48,000 = 5.46 seconds (base)
- Mono mode: 5.46s × 2 = 10.92s (L+R summed, single channel stored)
- Lo-fi mode: No time extension (bit depth only affects character, not length)

**Use Cases:**
- **HI**: Default for clean granular processing, short frozen textures
- **MED**: Clean mono sources with longer buffer (great for vocals, mono synths)
- **LO**: Lo-fi character on drums/percussion, vintage sampler vibe
- **XLO**: Maximum buffer time for long evolving drones, ambient loops

## Critical Stability Notes

Clouds uses feedback and reverb in its signal chain, which can cause runaway oscillation if not properly managed.

### Feedback Parameter: MUST Default to 0

**Why Feedback is Critical:**
The feedback parameter routes the processed output back to the input, creating a regenerative loop. If feedback starts at any value > 0 on patch load, you may immediately hear unwanted echoes or runaway oscillation.

**Validation Rules:**
1. **Processor Level** (Final Safety): `feedback` parameter defaults to 0 in AudioWorklet's `parameterDescriptors`
2. **UI Level**: Feedback fader initialises from state (which should be 0 for new patches)
3. **Patch Load**: Feedback value clamped to 0-1 range before sending to processor

**Feedback Signal Path:**
```
Output → [Feedback Tap] → HP Filter (20-120Hz) → Soft Limiter → Mix with Input
```

- Tap point: After diffuser, before reverb
- HP filter cutoff: Dynamic 20-120Hz based on feedback amount (removes DC/rumble)
- Soft limiter: `Math.tanh()` prevents hard clipping
- Freeze mode: Feedback gain forced to 0 (prevents evolution of frozen buffer)

### Reverb + Feedback Interaction

**WARNING:** High reverb (≥ 70%) combined with high feedback (≥ 90%) can cause instability.

**Why This Happens:**
- Reverb adds gain and延erverb decay to the signal
- Feedback loops this enhanced signal back
- Combined gain > 1.0 → exponential growth → oscillation

**Prevention:**
- Keep feedback < 50% for most musical use
- If using high feedback (> 70%), reduce reverb to < 40%
- Monitor output levels when tweaking both parameters simultaneously

**Validation Warnings:**
UI code checks for dangerous combinations and logs warnings (does not prevent, just warns):
```javascript
if (feedback >= 0.9 && reverb >= 0.7) {
  console.warn('[Clouds] STABILITY WARNING: High feedback + reverb detected');
}
```

### Oliverb and Resonestor Feedback Limits

**Oliverb Mode:**
Uses feedback parameter for modulation rate, not regenerative feedback, so runaway is not possible in this mode.

**Resonestor Mode:**
Feedback controls comb filter regeneration, which is **clamped to 0.95 maximum** inside the engine to prevent infinite sustain. Even at 100% UI feedback, the processor limits to 95% internally.

## Bæng vs Ræmbl Differences

Clouds is implemented differently in each synthesiser to match their UI paradigms and signal flow.

### Ræmbl Implementation

**UI Style:** Vertical fader-based interface
**FX Routing:** Serial insert (replaces classic reverb/delay)
**Signal Flow:**
```
Voice Pool → Clouds Input Analyser → Clouds Processor → Clouds Output Analyser → Ducking Gain → Master
```

**Parameters:**
- 10 vertical faders (PITCH, POS, DENS, SIZE, TEX, D/W, SPRD, FB, VERB, IN)
- Values displayed as percentages (pitch as semitones)
- Freeze button (toggles buffer lock)
- Clock sync button (enables tempo-locked triggers)
- Quality toggle (HI → MED → LO → XLO cycle)
- Random button (randomises all params)

**Mode Selection:** Dropdown menu with 6 modes
**Buffer Visualisation:** Canvas shows buffer waveform with write head position

**Key Files:**
- `merged-app/js/raembl/modules/clouds.js` - Module logic
- `merged-app/js/raembl/modules/buffer-viz.js` - Visualisation

### Bæng Implementation

**UI Style:** LED ring knob-based interface
**FX Routing:** Per-voice send routing + global processor
**Signal Flow:**
```
Voice → Dry Path → Master
  └──→ Clouds Send → Clouds Processor → Master
```

**Parameters:**
- 10 LED ring knobs (same params as Ræmbl, different layout)
- Row 1: PITCH, POS, DENS, SIZE, TEX (matches Ræmbl fader order)
- Row 2: D/W, SPRD, FB, VERB, IN
- Bipolar mode for PITCH knob (centre = 0st)
- Values displayed below each knob

**Mode Selection:** Dropdown with short labels (GRAN, WSOLA, LOOP, SPEC, VERB, RESO)
**Quality Presets:** Same 4 presets (HI/MED/LO/XLO) affecting buffer characteristics
**Clock Sync:** Same even-step trigger behaviour as Ræmbl
**Sidechain Ducking:** Duck button opens modal for configuring per-voice ducking

**Key Files:**
- `merged-app/js/baeng/modules/clouds.js` - Module logic + LED knob integration
- Same `buffer-viz.js` as Ræmbl (shared component)

**Unique Features:**
- Per-voice send routing (each voice can have different send levels)
- LED ring knobs provide visual feedback of modulation/animation
- Ducking integration (Bæng voices can duck Clouds output)

## Sound Design Tips

### Creating Ambient Textures (Granular Mode)

**Recipe:**
1. Set Position to 30-50% (mid-buffer for stable material)
2. Size to 60-80% (long grains for smooth texture)
3. Density to 70-90% (stochastic mode for fluid evolution)
4. Texture to 80-100% (activates diffusion for smearing)
5. Pitch to ±5-12 semitones (subtle shift creates new harmonic content)
6. Spread to 80-100% (wide stereo image)
7. Reverb to 50-70% (adds space)
8. Dry/Wet to 100% (full wet for pad sound)

**Freeze Workflow:**
- Play melodic/rhythmic material into Clouds
- Hit Freeze when interesting moment captured
- Adjust Position/Size to explore different sections
- Automate Pitch for evolving drones
- Modulate Texture for breathing motion

### Rhythmic Stutter Effects (Granular Mode)

**Recipe:**
1. Set Density < 50% (activates deterministic mode)
2. Size to 10-30% (short grains)
3. Texture to 0-30% (triangle window for punchy attack)
4. Enable Clock Sync (locks grain triggers to tempo)
5. Automate Position (scans through buffer rhythmically)

**Polyrhythmic Trick:**
- Density at 25% = grains on every 4th subdivision
- Density at 33% = grains on every 3rd subdivision
- Create offset against 4/4 beat for polyrhythm

### Clean Pitch-Shifting (WSOLA Mode)

**Recipe:**
1. Size to 50-70% (balanced window for correlation)
2. Density to 60-80% (enough overlap for smooth transitions)
3. Texture to 40-60% (moderate matching tolerance)
4. Pitch to ±7, ±12, ±19 semitones (musical intervals: 5th, octave, octave+5th)
5. Dry/Wet to 50-80% (blend with dry for natural sound)

**Best Input Material:**
- Tonal/harmonic sounds (vocals, synth leads, bass)
- Avoid percussive/transient material (use Granular mode instead)

### Dub Delay Loops (Looping Mode)

**Recipe:**
1. Enable Clock Sync
2. Position to 10-30% (loop starts near current audio)
3. Size to 40-60% (1-2 bar loop duration)
4. Density to 50-70% (moderate internal feedback)
5. Pitch to 0st (no pitch shift for straight delay)
6. Feedback to 40-60% (regenerative echoes)
7. Reverb to 30-50% (dub-style space)

**Clock Sync Behaviour:**
- Trigger on downbeat locks loop duration to bar length
- Automate Pitch during loop for dub-style pitch-dive

### Spectral Freeze (Spectral Mode)

**Recipe:**
1. Hit Freeze when sustained tone playing
2. Size to 80-100% (maximum overlap for smooth freeze)
3. Density to 70-100% (heavy spectral blur)
4. Texture to 60-90% (phase randomisation for shimmer)
5. Position to 40-60% (subtle frequency shift)
6. Reverb to 60-80% (infinite tail)

**Result:** Frozen, smeared, evolving spectral cloud

### Shimmer Reverb (Oliverb Mode)

**Recipe:**
1. Size to 70-90% (large reverb size)
2. Density to 60-80% (long decay)
3. Pitch to +12 or +19 semitones (octave or octave+5th up)
4. Feedback to 30-50% (modulation rate for shimmer)
5. Reverb to 40-60% (modulation depth)
6. Spread to 70-100% (wide diffusion)
7. Texture to 30-40% (warm tone via lowpass)

**Freeze Tip:** Hitting Freeze in Oliverb mode creates infinite reverb tail (input gain → 0, decay → 100%)

### Drum Resonance (Resonestor Mode)

**Recipe:**
1. Feed percussive material (drums, clicks, impulses)
2. Size to 20-40% (selects harmonic chord intervals)
3. Pitch to match your track's key (e.g., +0st for C, +2st for D, etc.)
4. Density to 40-60% (moderate resonance bandwidth)
5. Texture to 50-70% (balanced damping)
6. Feedback to 60-80% (long resonance sustain, clamped at 95% internally)
7. Spread to 60-80% (stereo comb spread)

**Trigger Trick:**
- Enable Clock Sync
- Density > 90% triggers burst generator on beats
- Creates gated resonance synced to tempo

## Troubleshooting

### No Output (Silent)

**Possible Causes:**
1. **Dry/Wet at 0%** - Set to at least 50% to hear processed signal
2. **Input Gain at 0%** - Check IN parameter is above 0%
3. **Frozen with Position at empty buffer section** - Disable Freeze or adjust Position
4. **WSOLA/Looping mode with no trigger** - These modes may need clock sync trigger to start playback
5. **Reverb mode (Oliverb) frozen** - Frozen Oliverb has input gain = 0; unfreeze or feed pre-freeze material

**Debug Steps:**
1. Check Dry/Wet is > 0% (try 100% full wet)
2. Check Input Gain is at 50% (unity) or higher
3. Disable Freeze button
4. Switch to Granular mode (most forgiving for testing)
5. Check master gain isn't muted

### Feedback Runaway / Oscillation

**Symptoms:**
- Exponentially increasing volume
- Piercing whistles or rumble
- Output clips/distorts even with low input

**Causes:**
1. **Feedback too high** - Feedback > 70% with Reverb > 50%
2. **Resonestor feedback clipping** - Rarely, extreme settings can cause instability

**Solutions:**
1. **Immediately reduce Feedback to 0%**
2. Reduce Reverb to < 40%
3. If Resonestor mode: Reduce Density (resonance bandwidth)
4. Reset buffer (switch modes or reload patch)

**Prevention:**
- Keep Feedback < 50% for most use cases
- If using high Feedback (> 70%), keep Reverb < 40%
- Monitor output levels when adjusting Feedback/Reverb

### CPU Spikes / Audio Glitches

**Symptoms:**
- Crackling, dropouts, stuttering audio
- Browser DevTools shows high CPU usage
- Visualisation stutters or freezes

**Causes:**
1. **Quality preset too high for system** - HI quality uses most CPU
2. **Multiple instances of Clouds** - Both Bæng and Ræmbl running Clouds simultaneously
3. **Other heavy DSP active** - Plaits/Rings engines + Clouds = high load
4. **Browser throttling** - Background tabs or battery-saving mode

**Solutions:**
1. **Lower quality preset**: HI → MED → LO → XLO (reduces CPU)
2. Switch one app to Classic FX (reverb/delay) instead of Clouds
3. Increase browser audio buffer size (if adjustable)
4. Close background tabs, ensure page is focused
5. Use LO or XLO quality for live performance (HI quality for offline rendering)

### Buffer Visualisation Not Updating

**Symptoms:**
- Canvas shows frozen waveform
- Write head indicator not moving

**Causes:**
1. **Freeze button enabled** - Freeze locks buffer writes
2. **No input signal** - Check input routing
3. **Visualisation stopped** - Animation paused when FX mode switched (Bæng only)

**Solutions:**
1. Disable Freeze button
2. Verify audio input reaching Clouds (check VU meters in Ræmbl)
3. Switch away and back to Clouds FX mode (Bæng) to restart visualisation

### Oliverb/Resonestor Modes Sound Wrong

**Symptoms:**
- Oliverb sounds like Granular mode
- Resonestor has no resonance

**Causes:**
1. **Mode not switched in processor** - UI updated but processor still on old mode
2. **Parameters outside useful range** - Some modes have narrow sweet spots

**Solutions:**
1. Re-select mode from dropdown (forces processor update)
2. Try these safe starting points:
   - **Oliverb**: Size=70%, Density=60%, Pitch=+12st, Reverb=50%
   - **Resonestor**: Size=30%, Density=50%, Pitch=0st, Feedback=70%

## Technical Reference

### AudioWorklet Implementation

Clouds runs in an AudioWorklet for audio-rate processing without main-thread blocking.

**File:** `merged-app/js/audio/worklets/clouds-processor.js`

**Key Classes:**
- `CloudsProcessor` - Main processor (extends AudioWorkletProcessor)
- `GrainEngine` - Granular synthesis (64 grains)
- `WSOLAEngine` - Pitch-shifting via WSOLA
- `LoopingDelayEngine` - Loop-based delay
- `SpectralEngine` - FFT phase vocoder
- `OliverbEngine` - Parasites reverb
- `ResonestorEngine` - Parasites resonator

**Shared Components:**
- `CircularBuffer` - Ring buffer (262,144 samples, stereo)
- `Diffuser` - Allpass diffusion network
- `GeminiReverb` - FDN reverb with soft limiting
- `SVFilter` - State-variable filter (for feedback HP)

**Message Protocol:**
```javascript
// Main thread → Worklet
cloudsNode.port.postMessage({ command: 'setMode', value: 0-5 });
cloudsNode.port.postMessage({ command: 'setFreeze', value: true/false });
cloudsNode.port.postMessage({ command: 'trigger' }); // Clock sync
cloudsNode.port.postMessage({ command: 'setBufferQuality', value: 'int16'|'int8' });
cloudsNode.port.postMessage({ command: 'setLofiMode', value: true/false });
cloudsNode.port.postMessage({ command: 'setMonoMode', value: true/false });

// Worklet → Main thread
{ event: 'modeChanged', value: modeIndex }
{ event: 'freezeChanged', value: true/false }
{ event: 'bufferData', value: { waveform: Float32Array, writeHead: int, ... } }
```

### Parameter Update Flow

**Ræmbl (Fader UI):**
```
User drags fader
  → clouds.js event handler updates fader fill height
  → AudioParam.value set directly (bypasses state for real-time)
  → state[key] updated (for patch save)
  → Processor reads param in process() loop
```

**Bæng (LED Ring Knob UI):**
```
User drags knob
  → ledRingKnobs.js updates knob rotation + LED ring
  → state[key] updated via event dispatch
  → updateCloudsParams() called (engine.js)
  → AudioParam.value set
  → Processor reads param in process() loop
```

**Per-Parameter Modulation (Both Apps):**
```
PPMod system calculates modulation
  → updateCloudsParameter(paramId, stateValue) called
  → State value (0-100) mapped to param range
  → AudioParam.setValueAtTime() scheduled
  → Processor reads smoothed param value
```

### Buffer Visualisation

**Component:** `BufferVisualisation` class (`merged-app/js/raembl/modules/buffer-viz.js`)

**Features:**
- Waveform display (800-point downsampled buffer)
- Write head position indicator
- Loop region markers (Looping mode only)
- Freeze state overlay
- Output waveform mode (Oliverb/Resonestor)

**Update Rate:** 15 FPS (60ms interval)

**Data Flow:**
```
Processor generates buffer snapshot (per request)
  → port.postMessage({ event: 'bufferData', value: {...} })
  → clouds.js receives message
  → bufferViz.updateBuffer(data) called
  → Canvas redrawn with new waveform
```

## See Also

- **[Bæng User Guide](../user-guide/baeng.md)** - Complete guide to Bæng drum synthesiser
- **[Ræmbl User Guide](../user-guide/raembl.md)** - Complete guide to Ræmbl synthesiser
- **[Effects Overview](./index.md)** - All effects documentation
- **[Modulation System](../modulation/ppmod.md)** - Per-parameter modulation (PPMod)

---

**Version:** 1.0
**Last Updated:** 2025-12-30
**Clouds Firmware Version:** Mutable Instruments Clouds 1.0 + Parasites (Oliverb/Resonestor)
