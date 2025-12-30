# PPMod Modes Reference

**Per-Parameter Modulation (PPMod) System**
Comprehensive reference for all 6 modulation modes in Bæng & Ræmbl

---

## Overview

PPMod is a per-parameter modulation system that allows any modulatable parameter to have its own independent modulation source. Each parameter can be modulated by one of six modes, providing everything from rhythmic LFO movement to probabilistic sequences.

### K-Rate Modulation Architecture

**Critical**: PPMod runs at **k-rate** (30 FPS), not audio-rate. This means modulation values are calculated on the main thread via `requestAnimationFrame()` and applied using `AudioParam.setValueAtTime()`.

**Why k-rate?**
- Human perception of modulation changes is ~50ms
- Audio-rate would add CPU overhead with zero perceptual benefit
- Measured CPU usage: <1% for all modes combined
- No AudioWorklet changes required
- Smooth transitions via AudioParam automation

**Implementation:**
```javascript
requestAnimationFrame(() => {
  const modValue = calculateModValue(mod, now);
  audioParam.setValueAtTime(modValue, now);
});
```

---

## Common Parameters

All modulation modes share these common parameters:

| Parameter | Type | Range | Description |
|-----------|------|-------|-------------|
| `enabled` | boolean | - | Enable/disable modulation |
| `mode` | string | 'LFO'/'RND'/'ENV'/'EF'/'TM'/'SEQ' | Active modulation mode |
| `depth` | number | 0-100% | Modulation intensity |
| `offset` | number | -100 to +100% | DC offset applied to modulation |
| `muted` | boolean | - | Temporary mute (preserves settings) |
| `baseValue` | number | - | Original parameter value (stored when enabled) |

**Per-Voice (Bæng):**
- `baseValues`: Array of 6 values (one per voice)
- `isVoiceParam`: Boolean indicating per-voice configuration
- `voices`: Array of 6 voice configs (each with independent mode/depth/offset)

**MONO vs POLY (Ræmbl):**
- MONO mode: Global keys (`paramId`)
- POLY mode: Per-voice keys (`${voiceId}:${paramId}`)
- Voice offsets in POLY: `(voiceId % 8) * 0.125` prevents unison

---

## Mode 1: LFO (Low-Frequency Oscillator)

Periodic waveform modulation at sub-audio rates.

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `lfoWaveform` | number | 0-5 | 0 | Waveform type (see table below) |
| `lfoRate` | number | 0.05-30 Hz | 1.0 | LFO frequency |
| `lfoSync` | boolean | - | false | Sync to clock (when true, rate is multiplier) |
| `lfoResetMode` | string | - | 'off' | Reset behaviour (voice params only) |
| `lfoTriggerSource` | string | - | 'none' | Trigger source (effect params only) |

### Waveforms

| Value | Type | Shape | Use Case |
|-------|------|-------|----------|
| 0 | Sine | Smooth bipolar | Natural vibrato, filter sweeps |
| 1 | Triangle | Linear bipolar | Gentler modulation than square |
| 2 | Square | Step bipolar | Rhythmic switching between values |
| 3 | Saw | Ramp down | Rising/falling patterns |
| 4 | Ramp | Ramp up | Opposite of saw |
| 5 | S&H | Random steps | Sample & hold (gate-triggered) |

### Reset Modes (Voice Parameters)

| Mode | Trigger | Behaviour |
|------|---------|-----------|
| `'off'` | - | Free-running LFO (never resets) |
| `'step'` | Any step active | Reset phase to 0 when any sequencer step triggers |
| `'accent'` | Accent flag | Reset phase to 0 when accent is active |
| `'bar'` | Bar start | Reset phase to 0 at start of each bar |

### Trigger Sources (Effect Parameters)

| Source | Behaviour |
|--------|-----------|
| `'none'` | Free-running (no trigger) |
| `'T1'`-`'T6'` | Triggered by specific voice (T1-T6) |
| `'SUM'` | Triggered when any voice plays |

### Implementation Details

**Phase Accumulation:**
```javascript
// Phase advances based on rate and delta time
phase += (lfoRate * deltaTime);
phase = phase % 1.0; // Wrap 0-1

// Calculate waveform value
const waveValue = LFOWaveforms[waveform](phase);
```

**Clock Sync:**
When `lfoSync` is enabled, rate becomes a clock multiplier:
```javascript
const beatsPerSecond = bpm / 60;
const actualRate = lfoRate * beatsPerSecond;
```

### Visual Feedback

LFO mode shows waveform animation on the control. For slide pot controls with LEDs, the LED brightness pulses according to the waveform shape:
- Sine/Triangle: Smooth brightness modulation
- Square: On/off flashing
- Saw/Ramp: Rising/falling brightness
- S&H: Random brightness on each step

---

## Mode 2: RND (LFSR Random)

Deterministic pseudo-random modulation using Linear Feedback Shift Registers.

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `rndBitLength` | number | 4/8/16/32 | 16 | LFSR register size |
| `rndProbability` | number | 0-100% | 50% | Probability of value change |
| `rndSampleRate` | number | 100-10000 Hz | 1000 | Sample rate (values/second) |
| `rndSeed` | number | 0-max | max | Initial LFSR state |

### Bit Lengths & Patterns

| Bit Length | Max Value | Pattern Length | Character |
|------------|-----------|----------------|-----------|
| 4 | 15 | 15 | Very short loops, rhythmic |
| 8 | 255 | 255 | Short melodic patterns |
| 16 | 65535 | 65535 | Long evolving sequences |
| 32 | 4,294,967,295 | ~4.3B | Near-infinite variation |

### LFSR Taps (Maximal Length Sequences)

```javascript
const taps = {
  4:  [3, 2],           // x^4 + x^3 + 1
  8:  [7, 5, 4, 3],     // x^8 + x^6 + x^5 + x^4 + 1
  16: [15, 14, 12, 3],  // x^16 + x^15 + x^13 + x^4 + 1
  32: [31, 21, 1, 0]    // x^32 + x^22 + x^2 + x^1 + 1
};
```

### Implementation Details

**LFSR Step:**
```javascript
next() {
  let feedback = 0;
  for (const tap of taps[bitLength]) {
    feedback ^= (state >> tap) & 1;
  }
  state = ((state << 1) | feedback) & maxValue;

  // Prevent stuck at zero
  if (state === 0) state = 1;

  return state;
}
```

**Probability Gating:**
```javascript
// Only update value if probability threshold met
if (Math.random() < rndProbability) {
  currentValue = lfsr.nextNormalised(); // 0-1
}
```

### Determinism

RND mode is **deterministic** - same seed produces same sequence. This allows:
- Repeatable "random" patterns across patch loads
- Synchronised randomness across multiple parameters
- Patch compatibility

### Use Cases

- Generative melodies (8/16-bit, 50-80% probability)
- Rhythmic variation (4-bit, 100% probability)
- Evolving timbres (16/32-bit, 20-40% probability)
- Controlled chaos (32-bit, high probability)

---

## Mode 3: ENV (Envelope Generator)

Attack-Decay envelope triggered on note events.

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `envAttackMs` | number | 0.2-8000 ms | 10 | Attack time |
| `envReleaseMs` | number | 0.2-8000 ms | 200 | Release (decay) time |
| `envCurveShape` | string | - | 'exponential' | Envelope curve |
| `envSource` | string | - | 'noteOn' | Trigger source |

### Curve Shapes

| Shape | Attack | Release | Use Case |
|-------|--------|---------|----------|
| `linear` | Constant rate | Constant rate | Mechanical, predictable |
| `exponential` | Fast start, slow end | Natural decay | Percussive, natural |
| `logarithmic` | Slow start, fast end | Quick fade | Swells, reverse percussion |
| `sCurve` | Smooth both ends | Smooth both ends | Musical, organic |

### Envelope Phases

**AD Envelope (Bæng):**
1. **Attack** (0 → 1): Rise from 0 to peak over `envAttackMs`
2. **Decay** (1 → 0): Fall from peak to 0 over `envReleaseMs`
3. **Idle**: Envelope complete, value = 0

**ADSR Envelope (Available but not currently used):**
1. **Attack**: 0 → 1
2. **Decay**: 1 → sustain level
3. **Sustain**: Hold at sustain level
4. **Release**: Sustain → 0 (on note-off)

### Trigger Sources

| Source | Trigger Event |
|--------|---------------|
| `noteOn` | MIDI note-on or sequencer trigger |
| `filter` | Filter envelope (shared with filter) |
| `amp` | Amplitude envelope (shared with amp) |
| `manual` | Manually triggered via API |

### Implementation Details

**Phase Detection:**
```javascript
getValue(currentTimeMs) {
  const elapsed = currentTimeMs - startTime;

  if (elapsed < attackMs) {
    // Attack phase
    const t = elapsed / attackMs;
    return curveFn(t);
  } else {
    // Decay phase
    const decayElapsed = elapsed - attackMs;
    if (decayElapsed >= releaseMs) {
      phase = 'idle';
      return 0;
    }
    const t = decayElapsed / releaseMs;
    return 1 - curveFn(t);
  }
}
```

### Use Cases

- Pitch envelopes (exponential, fast attack, medium decay)
- Filter sweeps (logarithmic, slow attack, fast decay)
- Amplitude modulation (exponential, percussive feel)
- Time-synced effects (linear, predictable timing)

---

## Mode 4: EF (Envelope Follower)

Tracks audio amplitude using AnalyserNode-based peak detection.

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `efAttackMs` | number | 1-1000 ms | 10 | Rise time (smoothing) |
| `efReleaseMs` | number | 1-1000 ms | 100 | Fall time (smoothing) |
| `efSource` | string | - | 'input' | Audio source to follow |

### Audio Sources

| Source | Follows | Use Case |
|--------|---------|----------|
| `input` | Pre-FX dry signal | Ducking, dynamics |
| `filter` | Filter output | Filter-based modulation |
| `amp` | Amplitude envelope | Envelope tracking |

### Implementation Details

**Smoothing Algorithm:**
```javascript
process(input) {
  const absInput = Math.abs(input);

  if (absInput > envelope) {
    // Attack - rising
    envelope = attackCoef * envelope + (1 - attackCoef) * absInput;
  } else {
    // Release - falling
    envelope = releaseCoef * envelope + (1 - releaseCoef) * absInput;
  }

  return envelope;
}
```

**Coefficients:**
```javascript
// Based on k-rate sample rate (30 FPS)
const samplePeriodMs = 1000 / 30;
attackCoef = Math.exp(-samplePeriodMs / attackMs);
releaseCoef = Math.exp(-samplePeriodMs / releaseMs);
```

### AnalyserNode Integration

```javascript
// Create analyser for audio source
const analyser = audioContext.createAnalyser();
analyser.fftSize = 128; // Small FFT for peak detection
source.connect(analyser);

// Read peak value at k-rate (30 FPS)
const dataArray = new Uint8Array(analyser.fftSize);
analyser.getByteTimeDomainData(dataArray);

// Find peak sample
const peak = Math.max(...dataArray.map(v => Math.abs(v - 128))) / 128;
```

### Use Cases

- Sidechain compression (Bæng triggers duck Ræmbl reverb)
- Auto-wah (filter follows input amplitude)
- Dynamic FX intensity (reverb/delay scale with input)
- Amplitude-based vibrato

---

## Mode 5: TM (Turing Machine)

Probabilistic step sequencer with controllable randomness.

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `tmLength` | number | 1-16 steps | 8 | Pattern length |
| `tmProbability` | number | 0-100% | 50% | Mutation probability per step |
| `tmPattern` | array | [0-1, ...] | [0.5, ...] | Current step values |
| `tmLfsrState` | number | - | - | LFSR state for determinism |

### Probability Behaviour

| Probability | Behaviour | Character |
|-------------|-----------|-----------|
| 0% | Locked pattern | Repeating sequence |
| 25% | Slow evolution | Gradual variation |
| 50% | Balanced chaos | Organic randomness |
| 75% | Fast mutation | Frequent surprises |
| 100% | Pure random | Maximum entropy |

### Implementation Details

**Step Advancement with Mutation:**
```javascript
advance() {
  currentStep = (currentStep + 1) % length;

  // Probabilistically mutate current step
  if (Math.random() < probability) {
    pattern[currentStep] = lfsr.nextNormalised();
  }

  return pattern[currentStep];
}
```

**Clock Sync:**
TM mode advances on clock ticks (step, beat, or bar depending on configuration).

### UI: Probability Scale (0-9)

The modal UI shows probability on a 0-9 scale for easier control:
```javascript
// Convert 0-9 to 0-1
probability = scale09 / 9;

// Convert 0-1 to 0-9
scale09 = Math.round(probability * 9);
```

| Scale | Probability | Visual |
|-------|-------------|--------|
| 0 | 0% | Fully locked |
| 3 | 33% | Occasional change |
| 5 | 56% | Half chaos |
| 7 | 78% | Mostly random |
| 9 | 100% | Pure chaos |

### Use Cases

- Evolving melodies (8-16 steps, 30-50% probability)
- Rhythmic variation (4-8 steps, 60-80% probability)
- Timbre drift (16 steps, 10-30% probability)
- Controlled randomness with memory

---

## Mode 6: SEQ (CV Sequencer)

Traditional step sequencer with clock-synced playback.

### Parameters

| Parameter | Type | Range | Default | Description |
|-----------|------|-------|---------|-------------|
| `seqLength` | number | 4-16 steps | 4 | Pattern length |
| `seqPattern` | array | [0-1, ...] | [0.5, ...] | Step values |

### Implementation Details

**Step Advancement:**
```javascript
advance() {
  currentStep = (currentStep + 1) % length;
  return values[currentStep];
}
```

**Clock Sync:**
SEQ mode advances on clock ticks, synchronised to the shared transport.

**Pattern Editing:**
Each step can be set individually:
```javascript
setStepValue(step, value) {
  values[step % length] = clamp(value, 0, 1);
}
```

### Length Changes

When pattern length changes:
- **Extend**: New steps initialised to 0.5 (centre)
- **Shorten**: Excess steps discarded
- **Playhead**: Wraps to new length if beyond range

### Use Cases

- Repeating melodies (8-16 steps)
- Rhythmic filter sweeps (4-8 steps)
- Timbral sequences (4-16 steps)
- Stepped parameter automation

### Visual Pattern Editor

The modal provides a visual step editor:
- Each step is a vertical fader (0-1 range)
- Current step highlighted during playback
- Steps can be edited while playing
- Pattern updates immediately

---

## Per-Voice Modulation

### Bæng (6 Drum Voices)

**Compound Keys:**
Per-voice parameters use compound keys: `${voiceIndex}:${paramId}`

**Dual Configuration:**
```javascript
modConfig = {
  isVoiceParam: true,
  voices: [
    { enabled: true, mode: 'LFO', depth: 50, waveform: 0, rate: 2, ... }, // T1
    { enabled: false, ... }, // T2
    { enabled: true, mode: 'ENV', ... }, // T3
    // ... T4, T5, T6
  ]
};
```

**Independent State:**
```javascript
// Each voice has separate phase, S&H values, patterns, etc.
phaseAccumulators.get('0:voice.macroPitch');  // T1 LFO phase
sampleAndHoldValues.get('1:voice.macroDepth'); // T2 S&H value
seqPatterns.get('2:voice.pan');                // T3 SEQ pattern
tmCurrentSteps.get('3:voice.level');           // T4 TM step
```

**Trigger Routing (Effect Params):**
Effect parameters can be triggered by individual voices:
```javascript
triggerSource: 'none' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'SUM'
```

### Ræmbl (8 Poly Voices)

**MONO vs POLY Keying:**

```javascript
// MONO mode: Global keys (single instance)
const key = paramId;

// POLY mode: Per-voice keys (8 independent instances)
const key = `${voiceId}:${paramId}`;
```

**Voice Phase Offset:**
In POLY mode, voices start with staggered phases to prevent unison:
```javascript
const voiceOffset = (voiceId % 8) * 0.125; // 0, 0.125, 0.25, ..., 0.875
phaseAccumulators.set(key, { phase: voiceOffset });
```

**Engine-Specific Handlers:**

| Engine | Voice Pool | PPMod Handler | Per-Voice? |
|--------|-----------|---------------|------------|
| Subtractive | 8-voice worklet | `applyPolyVoiceModulations()` | Yes |
| Plaits | 8-voice pool | `applyPlaitsPolyVoiceModulations()` | Yes |
| Rings | Internal 4-voice | ⚠️ Not implemented | No (global only) |

**Voice Cleanup:**
When voices are released, their modulation state is cleaned up:
```javascript
cleanupVoiceModulationState(voiceId) {
  // Remove per-voice S&H, phase accumulators, RND, TM, SEQ state
  for (const [key] of sampleAndHoldValues.entries()) {
    if (key.startsWith(`${voiceId}:`)) {
      sampleAndHoldValues.delete(key);
    }
  }
}
```

**Mode Switch Cleanup:**
When switching between MONO and POLY:
- **To POLY**: Clears global (non-voice-prefixed) state
- **To MONO**: Clears per-voice (colon-prefixed) state

---

## Visual Feedback

### LED Ring Knobs (Bæng)

Modulation is visualised on LED ring knobs:
- **LFO**: Ring animates with waveform shape
- **RND**: Random LED brightness changes
- **ENV**: Ring fills during attack, empties during decay
- **EF**: Ring tracks audio amplitude
- **TM/SEQ**: Ring position shows current step value

### Slide Pots (Ræmbl)

Modulation is shown via LED in slider knob:
- **LFO**: LED brightness pulses with waveform
- **RND**: Random brightness flicker
- **ENV**: LED brightness follows envelope
- **EF**: LED brightness tracks audio
- **TM/SEQ**: LED brightness shows step value

### Fader Automation

Faders do **not** move during modulation (value applied internally). This prevents:
- Visual distraction
- Accidental user interference
- UI update overhead

---

## Best Practices

### When to Use Each Mode

| Mode | Best For | Avoid For |
|------|----------|-----------|
| **LFO** | Vibrato, filter sweeps, rhythmic movement | Static values, one-shot events |
| **RND** | Generative sequences, controlled chaos | Predictable patterns, smooth changes |
| **ENV** | Percussive modulation, attack transients | Sustained modulation, drones |
| **EF** | Dynamics response, ducking | Static sources, predictable behaviour |
| **TM** | Evolving patterns, organic variation | Repeating sequences, stable values |
| **SEQ** | Melodic patterns, stepped automation | Smooth modulation, continuous changes |

### Depth & Offset Guidelines

**Depth (0-100%):**
- **0-25%**: Subtle variation, mix enhancement
- **25-50%**: Noticeable movement, musical effect
- **50-75%**: Dramatic modulation, feature effect
- **75-100%**: Extreme range, special effects

**Offset (-100 to +100%):**
- **Negative**: Shifts modulation downward
- **0%**: Centred modulation (bipolar)
- **Positive**: Shifts modulation upward
- Use to bias modulation toward specific range

### CPU Considerations

**K-rate at 30 FPS is efficient:**
- Single parameter: <0.1% CPU
- 10 parameters: <1% CPU
- 50+ parameters: Still <5% CPU

**Optimisation tips:**
- Use `muted: true` to temporarily disable without losing settings
- Prefer simpler waveforms (sine/triangle) over complex modes when possible
- Use longer `seqLength` and `tmLength` values sparingly

### Patch Compatibility

**Serialisation:**
All modes serialise to JSON for patch save/load:
```json
{
  "perParamModulations": {
    "filter.lowPass": {
      "enabled": true,
      "mode": "LFO",
      "depth": 50,
      "offset": 0,
      "lfoWaveform": 0,
      "lfoRate": 2.5,
      "lfoSync": true
    }
  }
}
```

**Backward compatibility:**
- New modes default to safe values if patch is older
- Missing parameters filled with defaults
- `enabled: false` ensures no surprise modulation on old patches

---

## Related Documentation

- **Bæng User Guide**: `/docs/baeng-guide.md`
- **Ræmbl User Guide**: `/docs/raembl-guide.md`
- **PPMod Modal UI**: `/merged-app/js/shared/ppmod-modal.js`
- **Modulation Utilities**: `/merged-app/js/shared/modulation-utils.js`
- **Bæng Implementation**: `/merged-app/js/baeng/modules/perParamMod.js`
- **Ræmbl Implementation**: `/merged-app/js/raembl/modules/perParamMod.js`

---

## Troubleshooting

### Modulation Not Audible

**Check:**
1. Is `enabled: true`?
2. Is `depth > 0`?
3. Is `muted: false`?
4. Is parameter modulatable? (Check `parameterDefinitions`)
5. Is base value in valid range?

### Choppy/Glitchy Modulation

**Cause**: Likely audio-rate parameter conflict (legacy code)

**Solution**: Verify k-rate implementation (all params should use `setValueAtTime()`)

### ENV Mode Not Triggering

**Check:**
1. Is `envSource` correct for your context?
2. Are notes/triggers actually being sent?
3. Is attack/release time reasonable? (Too short = imperceptible)

### POLY Mode Voice Cleanup Issues

**Symptom**: Memory buildup, stuttering

**Solution**: Ensure `cleanupVoiceModulationState()` is called on voice release

---

**Last Updated**: 2025-12-30
**PPMod Version**: 1.0 (6-mode modal system)
**Patch Format**: v1.2.0
