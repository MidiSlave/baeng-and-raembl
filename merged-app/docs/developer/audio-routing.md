# Audio Routing Architecture

Complete technical reference for Bæng & Ræmbl's signal flow and audio routing architecture.

## Overview

Bæng & Ræmbl uses a **separate routing architecture** where each app maintains independent audio chains that merge at a shared final limiter. This design provides clean signal separation, -3dB headroom per app, and simplified gain staging.

**Key Principles:**
- Shared `AudioContext` with separate master gain chains
- Independent effects routing per app
- Dedicated headroom (-4.94dB Bæng, -13.46dB Ræmbl)
- Shared final safety limiter (-0.1dB threshold)
- Optional sidechain ducking between apps

**Related Documentation:**
- [Architecture Overview](./architecture.md)
- [Footguns](./footguns.md) - Critical routing pitfalls to avoid

---

## Shared AudioContext

Both apps share a single `AudioContext` instance created in `js/shared/audio.js`:

```javascript
// File: js/shared/audio.js
export const sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
```

**Benefits:**
- Single audio graph reduces CPU overhead
- Synchronised sample-accurate timing
- Shared final limiter prevents clipping
- Unified AudioWorklet module loading

**Final Limiter Chain:**
```
Bæng Limiter ──┐
               ├──→ Final Limiter (−0.1dB, 20:1) ──→ AudioContext.destination
Ræmbl Limiter ─┘
```

**Implementation:**
```javascript
// js/shared/audio.js
export function createFinalLimiter() {
    finalLimiter = sharedAudioContext.createDynamicsCompressor();
    finalLimiter.threshold.value = -0.1;  // Very gentle
    finalLimiter.ratio.value = 20;
    finalLimiter.attack.value = 0.001;
    finalLimiter.release.value = 0.05;
    finalLimiter.connect(sharedAudioContext.destination);
    return finalLimiter;
}
```

---

## Bæng Signal Path

### Voice-Level Routing

Each of the 6 voices follows this per-voice signal chain:

```
┌─────────────────────────────────────────────────────────────────┐
│ VOICE SYNTHESIS (DX7/Analog/Sampler/SMPL/SLICE)                  │
│  ├─ Engine Output (AudioWorkletNode or Web Audio nodes)          │
│  └─ Master Gain (level × accent × velocity)                      │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
                  ┌─────────┐
                  │ Panner  │ (stereo position)
                  └────┬────┘
                       │
         ┌─────────────┼─────────────┬──────────────┬──────────────┐
         ▼             ▼             ▼              ▼              ▼
  Voice Analyser  Sidechain Tap  Clouds Direct  Clouds Send   Classic FX Sends
   (visual)       (ducking)      (0-100%)       (0-100%)      (Reverb/Delay)
         │             │             │              │              │
         └─ passive    └─ ducking    │              │              │
                       analyser      │              │              │
                                     ▼              ▼              ▼
                              Master Gain  Clouds Processor   FX Processors
```

**Key Files:**
- `js/baeng/modules/engine.js` - Voice synthesis and routing (lines 700-760+)
- `js/baeng/modules/sidechain.js` - Sidechain tap connections

**Per-Voice Connections:**
```javascript
// Effect sends (only connected if send level > 0)
if (reverbSendLevel > 0) {
    reverbSendGain.gain.value = reverbSendLevel / 100;
    voicePanner.connect(reverbSendGain);
    if (config.reverbNode) reverbSendGain.connect(config.reverbNode);
}

// Clouds routing (per-voice crossfade)
voicePanner.connect(config.cloudsDirectGains[voiceIndex]);  // 0-100% dry
voicePanner.connect(config.cloudsSendGains[voiceIndex]);    // 0-100% wet

// Sidechain tap for ducking (passive analyser connection)
connectVoiceToSidechain(voicePanner, voiceIndex);
```

### Master Bus Chain

After per-voice routing, signals converge at the master bus:

```
All Voices ──→ Master Gain (−4.94dB) ──→ Drum Bus ──→ Analyser ──→ Limiter ──→ Final Limiter
                                        (AudioWorklet)
```

**Drum Bus Processor** (Ableton-inspired master bus processing):
```
Input ──→ Drive ──→ Crunch ──→ Transients ──→ Boom ──→ Comp ──→ Dampen ──→ Dry/Wet ──→ Output
```

**Implementation:**
```javascript
// js/baeng/modules/engine.js (lines 4073-4076)
config.masterGain = config.audioContext.createGain();
config.masterGain.gain.value = 0.5656; // -4.94dB headroom for merged app

// After worklet loads (lines 4997-4998)
config.masterGain.connect(config.drumBusNode);
config.drumBusNode.connect(config.busOutputAnalyser);
config.busOutputAnalyser.connect(config.limiter);
connectToFinalLimiter(config.limiter);
```

### Global Effects Routing

#### Reverb Chain
```
Voice Panner ──→ Reverb Send Gain ──→ Convolver (dual crossfade) ──→ Ducking Gain ──→ Master Gain
                                                                      (optional)
```

**Crossfading Implementation:**
- Two convolvers for glitch-free impulse response changes
- 20ms linear crossfade when reverb parameters change
- Prevents clicks when updating decay/damping/diffusion

```javascript
// js/baeng/modules/engine.js (lines 4225-4226)
reverbOutputGain.connect(config.duckingGains.baengReverb);
config.duckingGains.baengReverb.connect(config.masterGain);
```

#### Delay Chain
```
Voice Panner ──→ Delay Send ──→ Delay ──→ Saturation ──→ Comp Gain ──→ Ducking Gain ──→ Master Gain
                                              │               │         (optional)
                                              │               │
                                              └──→ Feedback ──┘

WOW LFO ──→ Delay Time (subtle modulation)
Flutter LFO ──→ Delay Time (tape flutter)
```

**Saturation Compensation:**
- Waveshaper node with k-value curve control
- Automatic gain compensation prevents level buildup with feedback
- Bypassed when saturation = 0 (direct connection)

```javascript
// js/baeng/modules/engine.js (lines 4432-4433)
delayOutputGain.connect(config.duckingGains.baengDelay);
config.duckingGains.baengDelay.connect(config.masterGain);
```

#### Clouds Routing

**Per-Voice Send/Return Architecture:**
```
Voice[0] ──┬──→ cloudsDirectGains[0] (0-100%) ──→ Master Gain
           └──→ cloudsSendGains[0] (0-100%) ──┐
Voice[1] ──┬──→ cloudsDirectGains[1] ────────────┤
           └──→ cloudsSendGains[1] ──────────────┤
     ...                                         ├──→ Clouds Input ──→ Clouds ──→ Master Gain
Voice[5] ──┬──→ cloudsDirectGains[5] ────────────┤              Analyser   Processor
           └──→ cloudsSendGains[5] ──────────────┘
```

**Key Features:**
- Per-voice dry/wet crossfade (100% dry = classic mode, 100% wet = full Clouds)
- Shared global Clouds processor (6 modes: Granular, WSOLA, Looping Delay, Spectral, Oliverb, Resonestor)
- Clock sync option for rhythmic granulation
- Quality presets (HI/MED/LO/XLO) adjust buffer size and grain count

**Implementation:**
```javascript
// js/baeng/modules/engine.js (lines 4480-4492)
for (let i = 0; i < 6; i++) {
    config.cloudsDirectGains[i] = ctx.createGain();
    config.cloudsDirectGains[i].gain.value = 1.0; // Default: 100% direct
    config.cloudsDirectGains[i].connect(config.masterGain);

    config.cloudsSendGains[i] = ctx.createGain();
    config.cloudsSendGains[i].gain.value = 0.0; // Default: 0% to Clouds
    config.cloudsSendGains[i].connect(config.cloudsInputAnalyser);
}
```

---

## Ræmbl Signal Path

### Voice-Level Routing

Ræmbl uses a **pre-allocated AudioWorklet voice pool** (8 voices) with three engine types:

```
┌──────────────────────────────────────────────────────────────────┐
│ VOICE SYNTHESIS (SUB/Plaits/Rings engines)                        │
│  ├─ SUB: AudioWorklet (raembl-voice-processor.js)                 │
│  ├─ PLT: Plaits voice pool (8 nodes, 24 engines)                  │
│  └─ RGS: Rings voice pool (polyphony-aware)                       │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
         ┌─────────────┴─────────────┬──────────────┐
         ▼                           ▼              ▼
    Master Gain (dry)          Reverb Send     Delay Send
         │                           │              │
         │                           ▼              ▼
         │                    Convolver (×2)   Delay Chain
         │                     crossfade      (sat/feedback)
         │                           │              │
         │                     Ducking Gain   Ducking Gain
         │                      (optional)     (optional)
         │                           │              │
         └───────────────┬───────────┴──────────────┘
                         ▼
                   Master Gain (−13.46dB) ──→ Limiter ──→ Final Limiter
```

**Headroom Calculation:**
```javascript
// js/raembl/audio.js (lines 71-73)
config.masterGain = config.audioContext.createGain();
const defaultVolume = state.volume || 75;
config.masterGain.gain.value = (defaultVolume / 100) * 0.2121; // -13.46dB headroom
```

### FX Send/Return Architecture

**Classic Mode (Reverb + Delay):**
```javascript
// js/raembl/audio.js (lines 718-729)
// Connect voice directly to masterGain (dry signal)
voiceNode.connect(config.masterGain);

// Effect sends (parallel routing)
if (config.reverbSendGain) voiceNode.connect(config.reverbSendGain);
if (config.delaySendGain) voiceNode.connect(config.delaySendGain);
```

**Reverb Implementation:**
```javascript
// js/raembl/audio/effects.js (lines 57-88)
config.reverbSendGain = config.audioContext.createGain();
config.reverbSendGain.gain.value = 0;

// Dual convolver crossfade system (prevents clicks)
config.convolvers[0].connect(config.convolverWetGains[0]);
config.convolvers[1].connect(config.convolverWetGains[1]);

// Connect through ducking gain to master
if (baengConfig.duckingGains?.raemblReverb) {
    config.convolverWetGains[0].connect(baengConfig.duckingGains.raemblReverb);
    config.convolverWetGains[1].connect(baengConfig.duckingGains.raemblReverb);
    baengConfig.duckingGains.raemblReverb.connect(config.masterGain);
} else {
    config.convolverWetGains[0].connect(config.masterGain);
    config.convolverWetGains[1].connect(config.masterGain);
}
```

**Delay Implementation:**
```javascript
// js/raembl/audio/effects.js (lines 224-236)
config.delay.connect(config.saturation);
config.saturation.connect(config.saturationCompGain);
config.saturationCompGain.connect(config.delayWetGain);

// Connect through ducking gain to master
if (baengConfig.duckingGains?.raemblDelay) {
    config.delayWetGain.connect(baengConfig.duckingGains.raemblDelay);
    baengConfig.duckingGains.raemblDelay.connect(config.masterGain);
} else {
    config.delayWetGain.connect(config.masterGain);
}

config.saturationCompGain.connect(config.delayFeedback);
config.delayFeedback.connect(config.delay);
```

### Clouds Mode Routing

When Clouds is enabled, Ræmbl uses a **serial insert architecture** (unlike Bæng's send/return):

```
Voice ──→ Clouds Input ──→ Clouds Processor ──→ Clouds Output ──→ Ducking Gain ──→ Master Gain
         Analyser                              Analyser          (optional)

(Reverb/Delay bypassed in Clouds mode)
```

**Mode Switching:**
```javascript
// js/raembl/audio.js (lines 767-840)
// CLOUDS MODE: Disconnect from classic FX, route through Clouds
voiceNode.disconnect(config.masterGain);
voiceNode.disconnect(config.reverbSendGain);
voiceNode.disconnect(config.delaySendGain);
voiceNode.connect(config.cloudsNode); // Serial insert

// CLASSIC MODE: Restore parallel FX sends
voiceNode.connect(config.masterGain);
voiceNode.connect(config.reverbSendGain);
voiceNode.connect(config.delaySendGain);
```

**Clouds Output Routing:**
```javascript
// js/raembl/modules/clouds.js (lines 118-127)
// Connect: inputAnalyser → Clouds → outputAnalyser → (duckingGain) → masterGain
if (baengConfig.duckingGains?.raemblClouds) {
    outputAnalyser.connect(baengConfig.duckingGains.raemblClouds);
    baengConfig.duckingGains.raemblClouds.connect(config.masterGain);
} else {
    outputAnalyser.connect(config.masterGain);
}
```

---

## Sidechain Routing

**Architecture:**
Bæng voices can duck Ræmbl effects (reverb, delay, Clouds) using an envelope follower system. Web Audio's `DynamicsCompressorNode` doesn't support external sidechain input, so this uses analyser-based envelope following.

### Sidechain Bus Structure

```
Voice Panner[0] ──→ sidechainTapGains[0] (0/1) ──┐
Voice Panner[1] ──→ sidechainTapGains[1] (0/1) ──┤
     ...                                          ├──→ sidechainSumNode ──→ sidechainAnalyser
Voice Panner[5] ──→ sidechainTapGains[5] (0/1) ──┘                               │
                                                                                  ▼
                                                                        RAF Envelope Follower
                                                                                  │
                     ┌────────────────────────────────────────────────────────────┘
                     │
                     ▼
          duckingGain.gain automation (per effect)
                     │
    ┌────────────────┴────────────────┬─────────────────┬─────────────────┐
    ▼                                 ▼                 ▼                 ▼
baengReverb                    baengDelay         raemblReverb     raemblClouds
duckingGain                    duckingGain        duckingGain      duckingGain
```

**Implementation:**
```javascript
// js/baeng/modules/sidechain.js (lines 30-76)
export function initSidechainBus(ctx) {
    // Create 6 tap gains (default 0 = not contributing to sidechain)
    config.sidechainTapGains = [];
    for (let i = 0; i < 6; i++) {
        const tap = ctx.createGain();
        tap.gain.value = 0; // Default: voice doesn't contribute to sidechain
        config.sidechainTapGains.push(tap);
    }

    // Sum node collects all selected voice taps
    config.sidechainSumNode = ctx.createGain();
    config.sidechainTapGains.forEach(tap => tap.connect(config.sidechainSumNode));

    // Analyser for envelope following (small FFT for fast response)
    config.sidechainAnalyser = ctx.createAnalyser();
    config.sidechainAnalyser.fftSize = 256;
    config.sidechainAnalyser.smoothingTimeConstant = 0.5;
    config.sidechainSumNode.connect(config.sidechainAnalyser);

    // Initialise ducking gain nodes for each effect
    config.duckingGains = {
        baengReverb: ctx.createGain(),
        baengDelay: ctx.createGain(),
        raemblReverb: ctx.createGain(),
        raemblDelay: ctx.createGain(),
        raemblClouds: ctx.createGain()
    };
}
```

### Envelope Follower Loop

**Signal Flow:**
1. Selected voice panners → sidechain taps (0 or 1 gain)
2. Taps sum → analyser (time-domain RMS calculation)
3. `requestAnimationFrame` loop reads RMS, calculates dB level
4. Per-effect threshold/ratio/attack/release/range applied
5. Ducking gain automation scheduled via `setTargetAtTime()`

**Key Parameters:**
- **Threshold:** 0-100 → -60dB to 0dB (signal level to trigger ducking)
- **Ratio:** 0-100 → 1:1 to 20:1 (amount of compression)
- **Attack:** 0-100 → 0.1ms to 100ms (how fast ducking engages)
- **Release:** 0-100 → 10ms to 1000ms (how fast ducking releases)
- **Range:** 0-100 → 0dB to 40dB (maximum attenuation)

```javascript
// js/baeng/modules/sidechain.js (lines 134-180)
function loop() {
    config.sidechainAnalyser.getFloatTimeDomainData(dataArray);

    // Calculate RMS amplitude
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const dbLevel = 20 * Math.log10(Math.max(rms, 0.00001));

    // Apply ducking to each enabled effect
    Object.entries(state.sidechain).forEach(([effectKey, cfg]) => {
        if (!cfg.enabled) return;

        const overThreshold = dbLevel - thresholdDb;
        if (overThreshold > 0) {
            const reductionDb = overThreshold * (1 - 1 / ratio);
            const clampedReduction = Math.min(reductionDb, rangeDb);
            const targetGain = Math.pow(10, -clampedReduction / 20);
            gainNode.gain.setTargetAtTime(targetGain, now, attackSec);
        } else {
            gainNode.gain.setTargetAtTime(1, now, releaseSec);
        }
    });
}
```

---

## Master Output

### Final Signal Chain

```
┌──────────────────────────────────────────────────────────────────┐
│ BÆNG                                                              │
│  Voices → Master Gain (−4.94dB) → Drum Bus → Limiter ────────┐   │
│  Effects → (Ducking Gains) → Master Gain ─────────────────────┤   │
└───────────────────────────────────────────────────────────────┼───┘
                                                                │
┌───────────────────────────────────────────────────────────────┼───┐
│ RÆMBL                                                         │   │
│  Voices → Master Gain (−13.46dB) → Limiter ──────────────────┤   │
│  Effects → (Ducking Gains) → Master Gain ─────────────────────┘   │
└───────────────────────────────────────────────────────────────┼───┘
                                                                │
                                                                ▼
                                                         Final Limiter
                                                       (−0.1dB, 20:1)
                                                                │
                                                                ▼
                                                    AudioContext.destination
```

### Headroom Strategy

**Per-App Headroom:**
- **Bæng:** -4.94dB (0.5656 linear gain) — Drum bus output typically louder
- **Ræmbl:** -13.46dB (0.2121 linear gain) — Synth voices with longer release times

**Final Limiter:**
- Threshold: -0.1dB (gentle catch-all)
- Ratio: 20:1 (near-brick-wall limiting)
- Attack: 1ms (fast transient response)
- Release: 50ms (quick recovery)

**Why Separate Chains?**
1. **Independent level control** — Each app can adjust output without affecting the other
2. **Simplified gain staging** — No complex bus routing or dependency chains
3. **Cleaner signal flow** — Easier to debug and visualise
4. **Better CPU utilisation** — Less cross-app routing complexity

---

## Visualisation Taps

Both apps include **passive analyser taps** for waveform visualisation that don't affect audio routing:

**Bæng:**
- Per-voice analysers (6 channels)
- Drum bus output analyser (master waveform)
- Reverb/delay tap analysers (effect visualisation)
- Clouds input/output analysers
- Sidechain analyser (ducking envelope)

**Ræmbl:**
- Stereo channel splitter analysers (X-Y oscilloscope)
- Dry signal analyser (onset detection)
- Reverb tap analyser (waveform)
- Delay tap analysers (multiple taps for repeat visualisation)
- Clouds input/output analysers

**Connection Pattern:**
```javascript
// Passive tap - doesn't affect audio output
const tapGain = ctx.createGain();
tapGain.gain.value = 1.0;
sourceNode.connect(tapGain);
tapGain.connect(analyserNode); // Analyser doesn't connect to destination
```

---

## Performance Considerations

### CPU Optimisation

**AudioWorklet Processors:**
- Bæng: Drum bus (1 processor), Clouds (1 processor), DX7 worklet (per-voice), Sampler (per-voice)
- Ræmbl: Voice pool (8 pre-allocated processors), Plaits (8 processors), Rings (1 processor), Clouds (1 processor)

**Why Pre-Allocation?**
- Zero overhead during note triggering (no node creation lag)
- Prevents polyphonic dropouts (40+ node creation → 1 message to processor)
- Trade-off: Hard polyphony limits (8 voices Ræmbl SUB/Plaits, 4-12 voices Rings)

**Effect Optimisation:**
- Reverb uses dual crossfading convolvers (prevents IR update clicks)
- Delay saturation bypassed when not in use (direct connection)
- Sidechain uses RAF loop (60 FPS max) instead of audio-rate processing

### Memory Usage

**AudioWorklet Buffers:**
- Clouds: 1-8 seconds buffer (configurable via quality preset)
- Reverb: 100ms-5s impulse response (varies with decay parameter)
- Delay: Up to 5s delay buffer (configurable)

**Node Count:**
- Bæng: ~40-60 nodes (depends on active voices + effects)
- Ræmbl: ~30-50 nodes (pre-allocated voice pool reduces dynamic allocation)

---

## Routing Diagram Placeholders

### Bæng Complete Signal Flow
```
[TODO: Generate comprehensive Bæng routing diagram showing:
 - 6 voice lanes with engine types
 - Per-voice Clouds send/direct gains
 - Reverb/delay send architecture
 - Drum bus chain
 - Sidechain tap connections
 - Master output path]
```

### Ræmbl Complete Signal Flow
```
[TODO: Generate comprehensive Ræmbl routing diagram showing:
 - 8-voice AudioWorklet pool
 - Plaits/Rings engine routing
 - Classic FX sends (reverb/delay)
 - Clouds serial insert mode
 - Ducking gain insertion points
 - Master output path]
```

### Sidechain Architecture
```
[TODO: Generate sidechain routing diagram showing:
 - 6 Bæng voice taps
 - Sidechain sum and analyser
 - RAF envelope follower loop
 - 5 ducking gain nodes
 - Effect routing paths]
```

---

## Related Documentation

- [Architecture Overview](./architecture.md) - High-level system design
- [Footguns](./footguns.md) - Critical routing pitfalls
- [Clouds FX](../effects/clouds.md) - Clouds routing specifics
- [Drum Bus](../effects/drum-bus.md) - Master bus processing
- [Sidechain](../effects/sidechain.md) - Ducking configuration

---

**Last Updated:** 2025-12-30
**Applies to Version:** 1.2.0+
