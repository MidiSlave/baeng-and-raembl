# Per-Voice Modulation

**Independent modulation for each voice in polyphonic systems**

Per-voice modulation allows each synthesiser voice to have completely independent modulation settings, enabling rich polyphonic textures and complex soundscapes.

---

## Overview

### What is Per-Voice Modulation?

Per-voice modulation means that each voice in a polyphonic synthesiser can have its own independent modulation configuration. Instead of all voices sharing a single LFO or envelope, each voice can have:

- **Independent waveforms** - Voice 1 uses sine, Voice 2 uses square, etc.
- **Independent rates** - Different LFO speeds per voice
- **Independent depths** - Varying modulation intensity
- **Independent modes** - Voice 1 uses LFO, Voice 2 uses ENV, Voice 3 uses RND, etc.

This creates **polyphonic richness** where each voice evolves independently, preventing the "unison" sound of global modulation.

### Why Per-Voice?

**Global modulation** (single LFO for all voices):
```
Voice 1: [~~~~~] ← All voices modulate identically
Voice 2: [~~~~~] ← Sounds like a single thick voice
Voice 3: [~~~~~]
```

**Per-voice modulation** (independent LFOs):
```
Voice 1: [~~~~~]     ← Each voice has unique movement
Voice 2:   [~~~]     ← Creates evolving, organic texture
Voice 3: [~~~~~~~]   ← Sounds like 3 separate voices
```

---

## Bæng: Dual Configuration System

Bæng uses a **dual configuration** system to support both per-voice and global modulation on the same parameter.

### Per-Voice vs Global Parameters

**Per-Voice Parameters** (e.g., `voice.macroPitch`, `voice.layerADecay`):
- Each of the 6 drum voices has independent modulation settings
- Modulation config stored in `modConfig.voices[]` array (6 entries)
- Each voice can use different modes, depths, rates, etc.

**Global Effect Parameters** (e.g., `effects.reverbTime`, `effects.delayTime`):
- Single modulation config shared across all voices
- Can be triggered by specific voices (T1-T6) or all voices (SUM)
- Modulation config stored directly in `modConfig` object

### Dual Configuration Structure

```javascript
// Per-voice parameter (e.g., voice.macroPitch)
perParamModulations['voice.macroPitch'] = {
  isVoiceParam: true,
  voices: [
    { // T1 (Voice 0)
      enabled: true,
      mode: 'LFO',
      depth: 50,
      waveform: 0, // Sine
      rate: 2.0,
      offset: 0,
      baseValue: 60 // Stored when modulation enabled
    },
    { // T2 (Voice 1)
      enabled: true,
      mode: 'ENV',
      depth: 30,
      envAttackMs: 10,
      envReleaseMs: 200,
      baseValue: 55
    },
    { // T3 (Voice 2)
      enabled: false,
      depth: 0,
      baseValue: null
    },
    // ... T4, T5, T6
  ]
};

// Global effect parameter (e.g., effects.reverbTime)
perParamModulations['effects.reverbTime'] = {
  isVoiceParam: false,
  enabled: true,
  mode: 'LFO',
  depth: 40,
  waveform: 0,
  rate: 0.5,
  offset: 0,
  triggerSource: 'T1', // Triggered by Voice 1
  baseValue: 2.5
};
```

### Compound Keys for State Storage

Per-voice parameters use **compound keys** to separate state for each voice:

```javascript
// Format: `${voiceIndex}:${paramId}`

// Voice 0's pitch LFO phase
phaseAccumulators.get('0:voice.macroPitch');

// Voice 2's decay S&H value
sampleAndHoldValues.get('2:voice.layerADecay');

// Voice 4's filter SEQ pattern
seqPatterns.get('4:voice.macroColor');

// Voice 5's TM current step
tmCurrentSteps.get('5:voice.pan');
```

**Global parameters** use plain keys:
```javascript
// Reverb time LFO phase (no voice prefix)
phaseAccumulators.get('effects.reverbTime');
```

### Independent Voice Settings

Each voice has **complete independence**:

```javascript
// T1: Slow sine LFO
modConfig.voices[0] = {
  enabled: true,
  mode: 'LFO',
  waveform: 0, // Sine
  rate: 0.5,   // Slow
  depth: 60
};

// T2: Fast square LFO
modConfig.voices[1] = {
  enabled: true,
  mode: 'LFO',
  waveform: 2, // Square
  rate: 8.0,   // Fast
  depth: 40
};

// T3: Envelope follower
modConfig.voices[2] = {
  enabled: true,
  mode: 'EF',
  efAttackMs: 5,
  efReleaseMs: 50,
  depth: 80
};

// T4: Random LFSR
modConfig.voices[3] = {
  enabled: true,
  mode: 'RND',
  rndBitLength: 16,
  rndProbability: 70,
  depth: 50
};
```

### Trigger-Based Routing (Effect Parameters)

Global effect parameters can be **triggered by specific voices**:

| Trigger Source | Behaviour |
|---------------|-----------|
| `'none'` | Free-running (no trigger) |
| `'T1'` | Triggered by Voice 1 only |
| `'T2'` | Triggered by Voice 2 only |
| `'T3'` | Triggered by Voice 3 only |
| `'T4'` | Triggered by Voice 4 only |
| `'T5'` | Triggered by Voice 5 only |
| `'T6'` | Triggered by Voice 6 only |
| `'SUM'` | Triggered by any voice |

**Example**: Reverb time envelope triggered by kick drum
```javascript
perParamModulations['effects.reverbTime'] = {
  isVoiceParam: false,
  enabled: true,
  mode: 'ENV',
  depth: 50,
  envAttackMs: 10,
  envReleaseMs: 500,
  triggerSource: 'T1', // Kick drum on T1
  baseValue: 2.0
};
```

When T1 plays, the reverb time envelope triggers, creating a ducking effect.

### Implementation Files

**Bæng Per-Voice Implementation:**
- `/merged-app/js/baeng/modules/perParamMod.js` - Dual-config system
- `/merged-app/js/baeng/state.js` - Voice state storage
- `/merged-app/js/baeng/modules/engine.js` - Voice parameter application

**Key Functions:**
```javascript
// Get modulation config (returns dual structure for voice params)
getModulationConfig(paramId)

// Apply per-voice modulation (each voice independently)
applyPerVoiceModulation(paramId, modConfig, paramDef, now)

// Apply global modulation (single config)
applyGlobalModulation(paramId, modConfig, paramDef, now)

// Handle track trigger (advances SEQ/TM, triggers ENV/RND)
handleTrackTrigger(event)
```

---

## Ræmbl: Polyphonic Modulation

Ræmbl uses a **unified modulation model** that adapts to MONO or POLY mode automatically.

### MONO vs POLY Mode

**MONO Mode** (single voice):
- Global modulation keys (`paramId`)
- Single phase accumulator per parameter
- Single S&H value, SEQ pattern, etc.

**POLY Mode** (8 voices):
- Per-voice modulation keys (`${voiceId}:${paramId}`)
- 8 independent phase accumulators per parameter
- 8 independent S&H values, SEQ patterns, etc.

### Key Format

```javascript
// MONO mode: Global keys (no voice prefix)
const key = paramId;
phaseAccumulators.get('filter.lowPass');

// POLY mode: Per-voice keys (compound format)
const key = `${voiceId}:${paramId}`;
phaseAccumulators.get('3:filter.lowPass'); // Voice 3's filter LFO
```

The system **automatically switches** between modes based on `state.monoMode`:

```javascript
// Key generation logic
const key = (!state.monoMode && voiceId !== null)
  ? `${voiceId}:${paramId}`  // POLY mode: per-voice key
  : paramId;                  // MONO mode: global key
```

### Voice Phase Offset (Polyphonic Spread)

In POLY mode, voices start with **staggered phases** to prevent unison:

```javascript
// Voice offset calculation (8 voices, 0.125 spacing)
const voiceOffset = (voiceId % 8) * 0.125;

// Voice phase initialisation
phaseAccumulators.set(`${voiceId}:${paramId}`, {
  phase: voiceOffset,  // 0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875
  lastTime: now
});
```

**Result:**
```
Voice 0: [~~~~~]     Phase 0.000 (start at trough)
Voice 1:  [~~~~~]    Phase 0.125 (start 1/8 ahead)
Voice 2:   [~~~~~]   Phase 0.250 (start 1/4 ahead)
Voice 3:    [~~~~~]  Phase 0.375 (start 3/8 ahead)
Voice 4:     [~~~~~] Phase 0.500 (start at peak)
Voice 5:   [~~~~~]   Phase 0.625
Voice 6:  [~~~~~]    Phase 0.750
Voice 7: [~~~~~]     Phase 0.875
```

This creates a **stereo-wide, chorusing effect** without additional processing.

### Per-Voice Filter Modulation

Ræmbl applies **per-voice filter modulation** in POLY mode:

```javascript
// applyPolyVoiceModulations() - called at 30 FPS
function applyPolyVoiceModulations(now) {
  const activeVoices = config.workletBridge.getActiveVoices();

  for (const voice of activeVoices) {
    for (const [paramId, modConfig] of Object.entries(state.perParamModulations)) {
      if (!paramId.startsWith('filter.')) continue; // Filter params only

      // Use per-voice phase key
      const phaseKey = `${voice.voiceId}:${paramId}`;

      // Calculate per-voice modulation value
      const waveValue = calculateWaveValue(phaseData.phase, modConfig.waveform, paramId, voice.voiceId);

      // Send to specific voice via worklet bridge
      sendFilterModulationToVoice(voice.voiceId, paramId, clampedValue);
    }
  }
}
```

**Per-Voice SEQ Pattern Example:**
```javascript
// Each voice gets independent step position
const seqKey = `${voice.voiceId}:filter.lowPass`;

// Create per-voice pattern with shared VALUES but independent step
let seqPattern = seqPatterns.get(seqKey);
if (!seqPattern) {
  seqPattern = new SeqPattern(4, [0.2, 0.5, 0.8, 0.3]);

  // Offset each voice's starting step for spread
  const voiceOffset = voice.voiceId % 4;
  for (let i = 0; i < voiceOffset; i++) {
    seqPattern.advance(); // Advance to different step
  }

  seqPatterns.set(seqKey, seqPattern);
}
```

**Result:**
```
Voice 0: [0.2][0.5][0.8][0.3] - starts at step 0
Voice 1: [0.5][0.8][0.3][0.2] - starts at step 1
Voice 2: [0.8][0.3][0.2][0.5] - starts at step 2
Voice 3: [0.3][0.2][0.5][0.8] - starts at step 3
```

### Voice-Specific Envelope Followers

Envelope follower (EF) mode can track **per-voice amplitude**:

```javascript
// Each voice has independent envelope follower state
const efKey = `${voiceId}:${paramId}`;

// Per-voice smoothed envelope value
efSmoothedValues.set(efKey, rawLevel);

// Attack/release smoothing (per voice)
if (rawLevel > smoothedValue) {
  smoothedValue += (rawLevel - smoothedValue) * attackCoef;
} else {
  smoothedValue += (rawLevel - smoothedValue) * releaseCoef;
}
```

This allows complex dynamics:
- Voice 1's filter opens when Voice 1 is loud
- Voice 2's filter stays closed when Voice 2 is quiet
- Each voice responds to its own amplitude independently

### Engine-Specific Handlers

Ræmbl supports **multiple engines** with per-voice modulation:

| Engine | Voice Pool | PPMod Handler | Per-Voice? |
|--------|-----------|---------------|------------|
| **Subtractive** | 8-voice AudioWorklet | `applyPolyVoiceModulations()` | Yes (filter params) |
| **Plaits** | 8-voice pool | `applyPlaitsPolyVoiceModulations()` | Yes (HARMONICS, TIMBRE, MORPH, LPG) |
| **Rings** | Internal 4-voice | N/A | No (global only) |

**Plaits Per-Voice Modulation:**
```javascript
function applyPlaitsPolyVoiceModulations(now) {
  const activePlaitsVoices = config.plaitsVoicePool.getActiveVoices();

  for (const voice of activePlaitsVoices) {
    // Per-voice HARMONICS modulation
    const harmonicsKey = `${voice.id}:plaits.harmonics`;
    const harmonicsPhase = phaseAccumulators.get(harmonicsKey);
    // ... calculate and apply

    // Per-voice TIMBRE modulation
    const timbreKey = `${voice.id}:plaits.timbre`;
    const timbrePhase = phaseAccumulators.get(timbreKey);
    // ... calculate and apply
  }
}
```

### Voice Cleanup

When voices are released, their modulation state is **cleaned up**:

```javascript
// cleanupVoiceModulationState() - called on voice release
function cleanupVoiceModulationState(voiceId) {
  // Remove per-voice S&H values
  for (const [key] of sampleAndHoldValues.entries()) {
    if (key.startsWith(`${voiceId}:`)) {
      sampleAndHoldValues.delete(key);
    }
  }

  // Remove per-voice phase accumulators
  for (const [key] of phaseAccumulators.entries()) {
    if (key.startsWith(`${voiceId}:`)) {
      phaseAccumulators.delete(key);
    }
  }

  // Remove per-voice SEQ patterns
  for (const [key] of seqPatterns.entries()) {
    if (key.startsWith(`${voiceId}:`)) {
      seqPatterns.delete(key);
    }
  }

  // ... RND, TM, EF state
}
```

**Why?** Prevents memory buildup and ensures fresh state when voice is reused.

### Mode Switch Cleanup

When switching between MONO and POLY modes:

**To POLY Mode:**
- Clears global (non-prefixed) keys
- Initialises per-voice keys with phase offsets

**To MONO Mode:**
- Clears per-voice (colon-prefixed) keys
- Initialises single global key

```javascript
// switchToPolyMode()
function switchToPolyMode() {
  // Clear global keys
  for (const [key] of phaseAccumulators.entries()) {
    if (!key.includes(':')) {
      phaseAccumulators.delete(key);
    }
  }

  // Initialise per-voice keys
  for (let voiceId = 0; voiceId < 8; voiceId++) {
    const voiceOffset = (voiceId % 8) * 0.125;
    phaseAccumulators.set(`${voiceId}:filter.lowPass`, {
      phase: voiceOffset,
      lastTime: performance.now()
    });
  }
}
```

### Implementation Files

**Ræmbl Per-Voice Implementation:**
- `/merged-app/js/raembl/modules/perParamMod.js` - Unified MONO/POLY model
- `/merged-app/js/raembl/state.js` - Voice state storage
- `/merged-app/js/raembl/audio.js` - Voice allocation and cleanup

**Key Functions:**
```javascript
// Apply per-voice filter modulation (POLY mode)
applyPolyVoiceModulations(now)

// Apply per-voice Plaits modulation (POLY mode)
applyPlaitsPolyVoiceModulations(now)

// Cleanup voice modulation state on release
cleanupVoiceModulationState(voiceId)

// Send filter modulation to specific voice
sendFilterModulationToVoice(voiceId, paramId, value)
```

---

## Practical Examples

### Example 1: Bæng Kick Drum Pitch Envelope

**Goal**: Pitch drops on kick drum attack

```javascript
// Per-voice parameter: voice.macroPitch for T1 (kick)
perParamModulations['voice.macroPitch'] = {
  isVoiceParam: true,
  voices: [
    { // T1 (Kick)
      enabled: true,
      mode: 'ENV',
      depth: 80,        // 80% pitch sweep
      offset: 0,        // Centred modulation
      envAttackMs: 1,   // Instant attack
      envReleaseMs: 150,// 150ms decay
      envCurveShape: 'exponential',
      baseValue: 55     // Base pitch
    },
    // T2-T6 (other voices) - no pitch modulation
    { enabled: false },
    { enabled: false },
    { enabled: false },
    { enabled: false },
    { enabled: false }
  ]
};
```

**Result:** When T1 triggers, pitch sweeps from high to low over 150ms (classic kick drum pitch envelope).

### Example 2: Ræmbl Poly Filter LFO with Spread

**Goal**: Each poly voice has independent filter LFO for chorusing effect

```javascript
// POLY mode: filter.lowPass with per-voice LFO
perParamModulations['filter.lowPass'] = {
  enabled: true,
  mode: 'LFO',
  depth: 40,        // 40% filter sweep
  waveform: 0,      // Sine wave
  rate: 3.0,        // 3 Hz
  offset: 0,
  baseValue: 1200   // 1200 Hz centre frequency
};

// When chord is played:
// Voice 0: LFO phase 0.000
// Voice 1: LFO phase 0.125
// Voice 2: LFO phase 0.250
// Voice 3: LFO phase 0.375
// ... creates evolving chorusing filter effect
```

**Result:** Rich, evolving filter movement with each voice slightly out of phase, creating a wide stereo image.

### Example 3: Bæng Reverb Ducking via Envelope Follower

**Goal**: Reverb time ducks when kick drum plays

```javascript
// Global effect parameter triggered by T1 (kick)
perParamModulations['effects.reverbTime'] = {
  isVoiceParam: false,
  enabled: true,
  mode: 'EF',
  depth: -60,         // Negative depth = ducking
  offset: 0,
  efSource: 'input',  // Follow input amplitude
  efAttackMs: 5,      // Fast response
  efReleaseMs: 200,   // Slow release
  triggerSource: 'T1',// Triggered by kick
  baseValue: 3.0      // 3 second reverb normally
};
```

**Result:** When kick plays (T1), reverb time drops to ~1.2 seconds, then slowly returns to 3 seconds. Creates tight, punchy drums with reverb that doesn't wash out the mix.

### Example 4: Ræmbl Plaits Timbre Per-Voice SEQ

**Goal**: Each Plaits voice cycles through different timbres

```javascript
// POLY mode: plaits.timbre with per-voice SEQ
perParamModulations['plaits.timbre'] = {
  enabled: true,
  mode: 'SEQ',
  depth: 80,
  offset: 0,
  seqLength: 4,
  seqPattern: [0.2, 0.5, 0.8, 0.3], // 4-step pattern
  baseValue: 0.5
};

// When chord is played:
// Voice 0: starts at step 0 [0.2, 0.5, 0.8, 0.3]
// Voice 1: starts at step 1 [0.5, 0.8, 0.3, 0.2]
// Voice 2: starts at step 2 [0.8, 0.3, 0.2, 0.5]
// Voice 3: starts at step 3 [0.3, 0.2, 0.5, 0.8]
```

**Result:** Each voice in the chord has a different timbral evolution, creating a complex, evolving texture.

---

## Tips & Best Practices

### When to Use Per-Voice Modulation

**Use per-voice when:**
- Creating polyphonic pads with evolving texture
- Making each drum voice unique in character
- Building complex generative patterns
- Preventing "unison" sound in chords
- Creating stereo width without effects

**Use global when:**
- Modulating master effects (reverb, delay)
- Creating unified rhythmic movement
- Conserving CPU (single modulation instance)
- Simplifying patch editing

### CPU Considerations

**Per-voice modulation is more CPU intensive:**
- Bæng: 6 voices × parameters = 6× calculations
- Ræmbl POLY: 8 voices × parameters = 8× calculations

**Optimisation:**
- Use `muted: true` to temporarily disable without losing settings
- Prefer simpler modes (LFO) over complex modes (TM/SEQ) when possible
- Limit per-voice modulation to critical parameters (filter, pitch)
- Use global modulation for non-critical parameters (FX sends)

### Patch Design

**For rich polyphonic textures:**
1. Start with global LFO on filter
2. Add per-voice phase offset (automatic in Ræmbl POLY)
3. Layer per-voice ENV on filter for dynamics
4. Add per-voice RND on harmonics/timbre for variation

**For rhythmic drum patterns:**
1. Use per-voice ENV on decay for dynamic articulation
2. Add global LFO on reverb send for movement
3. Use per-voice SEQ on pitch for melodic drums
4. Add per-voice TM on pan for spatial movement

### Common Pitfalls

**Forgetting to set baseValue:**
- Per-voice modulation requires `baseValue` to be set when enabled
- If `baseValue` is null, modulation won't apply
- Set manually or allow system to lazy-init on first modulation

**Not cleaning up voice state:**
- In POLY mode, voice state must be cleaned up on release
- Forgetting to cleanup causes memory buildup and stuttering
- Use `cleanupVoiceModulationState()` in voice release handler

**Switching MONO/POLY without cleanup:**
- Stale keys from previous mode can cause glitches
- Always clear opposite mode's keys when switching
- Use mode-specific cleanup functions

---

## Related Documentation

- [PPMod Modes Reference](ppmod-modes.md) - Detailed mode documentation
- [PPMod Overview](ppmod-overview.md) - System architecture and concepts
- [Modulation Utilities](/merged-app/js/shared/modulation-utils.js) - Shared code
- [Bæng Implementation](/merged-app/js/baeng/modules/perParamMod.js) - Dual-config system
- [Ræmbl Implementation](/merged-app/js/raembl/modules/perParamMod.js) - Unified MONO/POLY model

---

**Last Updated**: 2025-12-30
**PPMod Version**: 1.0 (6-mode modal system)
**Patch Format**: v1.2.0
