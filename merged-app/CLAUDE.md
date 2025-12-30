# Bæng & Ræmbl v2 - PPMod System Rework

## Project Goal

Rework the per-parameter modulation (PPMod) system in the merged Bæng & Ræmbl synthesiser suite, replacing the click-cycling UI with a **modal-based interface** supporting 6 modulation modes.

This is a fork of `merged-app` specifically for this feature development.

## Current Focus

**PPMod System Implementation** - Modal-based per-parameter modulation with 6 modes:

| Mode | Description | Implementation |
|------|-------------|----------------|
| **LFO** | Low-frequency oscillator | Already exists, needs modal UI |
| **RND** | LFSR-based random | 4-32 bit, 0-100% probability |
| **ENV** | AD/ADSR envelope | 0.2ms-8s times, curve shapes |
| **EF** | Envelope follower | AnalyserNode-based peak detection |
| **TM** | Probabilistic step seq | 1-16 steps, per-step probability (0-9) |
| **SEQ** | CV sequencer | 4-16 step pattern |

## Architecture Decisions

### K-Rate Modulation (NOT Audio-Rate)
- **30 FPS** updates on main thread via `requestAnimationFrame`
- **<1% CPU** measured for all modes
- No AudioWorklet changes required
- Use `AudioParam.setValueAtTime()` / `exponentialRampToValueAtTime()` for smooth transitions

**Rationale**: Human perception of modulation changes is ~50ms. Audio-rate would add complexity with zero perceptual benefit.

### Separate Architectures + Shared Utilities
- **DO NOT unify** Bæng and Ræmbl modulation systems
- Both systems are production-tested with different models:
  - **Bæng**: Dual-config (per-voice + global), trigger-based routing
  - **Ræmbl**: Unified model, audio-rate filter modulation
- Create `/js/shared/modulation-utils.js` for common mode logic

### Draggable Modal UI
- **380x500px** base size (expandable)
- **localStorage** position persistence
- **Click header** to open (replaces click-cycling)
- **Tabs**: LFO | RND | ENV | EF | TM | SEQ (always visible)
- Extends existing `sidechain-modal` draggable pattern

### SLICE Engine Decay Calculation (Fixed 2025-12-21)

Decay envelope is calculated as a **percentage of slice length**, not absolute time.

**Before**: Decay parameter (0-100) mapped to 10ms-2000ms absolute
**After**: Decay parameter maps to 10%-110% of slice duration

**Benefits**:
- Prevents premature slice cutoff (long slices no longer cut short)
- Pitch-shift aware (decay scales with playback rate)
- Musically intuitive (decay proportional to material)

**Implementation**: `js/baeng/modules/sampler/sampler-engine.js:110-139`

### Patch Format v1.1.0
```json
{
  "version": "1.1.0",
  "sharedTiming": { "bpm": 120, "swing": 50, "barLength": 4 },
  "baeng": {
    "modulations": {
      "paramId": {
        "mode": "ENV",
        "depth": 0.5,
        "offset": 0.0,
        "envSource": "filter",
        "envAttackMs": 50,
        "envReleaseMs": 200
      }
    }
  },
  "raembl": { "modulations": { /* ... */ } }
}
```
- Backward compatible: v1.0.0 patches load without modulation
- Forward compatible: v1.1.0 in old app falls back to base values

## Implementation Phases

### Phase 1: Foundation
**Files to create:**
- `/js/shared/modulation-utils.js` - LFSR, envelope curves, pattern storage
- `/js/shared/ppmod-modal.js` - Modal UI base component
- `/js/shared/ppmod-modal.css` - Modal styling

**Files to modify:**
- State files for v1.1.0 patch format

### Phase 2: SEQ Mode (Simplest First)
- 4-16 step pattern editor
- Clock sync
- Test with 5 parameters (3 Ræmbl, 2 Bæng)

### Phase 3: ENV Mode
- Envelope source selector (filter, amp, note-on)
- Attack/Release sliders (0.2ms-8s)
- Curve shape selector (linear, exponential, logarithmic)

### Phase 4: RND Mode
- LFSR generator (4-32 bit)
- Probability slider (0-100%)
- Sample rate control (100Hz-10kHz)

### Phase 5: TM Mode
- 1-16 step probabilistic sequencer
- Per-step probability (0-9 scale)
- Clock sync + manual trigger

### Phase 6: EF Mode
- AnalyserNode envelope follower
- Attack/Release times (1ms-1s)
- Peak detector with smoothing

### Phase 7: Full Parameter Rollout
- **Bæng**: 63 unique params (275 per-voice targets)
- **Ræmbl**: 30 modulatable params
- **Total**: 93 unique, 305 targets

## Parameter Scope

| App | Unique Params | Total Targets |
|-----|---------------|---------------|
| Bæng (per-voice) | 34 | 204 (34 x 6) |
| Bæng (global FX) | 17 | 17 |
| Bæng (sequencer) | 9 | 54 (9 x 6) |
| Ræmbl (synth) | 18 | 18 |
| Ræmbl (FX) | 12 | 12 |
| **Total** | **93** | **305** |

**Excluded from modulation**: FACTORS, LFO, PATH parameters

## Key Constraints

1. **One mod source per parameter** - NOT stackable
2. **8-voice polyphony limit** (Ræmbl) - ENV/EF limited to 8 simultaneous envelopes in poly mode
3. **K-rate latency** - 33ms between updates (acceptable for all modes)
4. **AnalyserNode latency** - ~2.7ms (128 samples @ 48kHz)

## Code Patterns

### Modulation Update Loop
```javascript
// K-rate modulation at 30 FPS
function modulationLoop() {
  const now = audioContext.currentTime;

  for (const [paramId, mod] of Object.entries(activeModulations)) {
    const value = calculateModValue(mod, now);
    const audioParam = getAudioParam(paramId);
    audioParam.setValueAtTime(value, now);
  }

  requestAnimationFrame(modulationLoop);
}
```

### Modal Trigger Pattern
```javascript
// Click header to open modal (replaces click-cycling)
knobHeader.addEventListener('click', () => {
  openPPModModal(paramId, currentValue, modConfig);
});
```

### Shared Utility Usage
```javascript
import { generateLFSR, calculateEnvelope, advanceSeqPattern } from './shared/modulation-utils.js';
```

## Critical Footguns

### Don't: Add per-sample PPMod calculations to AudioWorklet
PPMod is k-rate by design. Use AudioParam automation from main thread, not worklet-side modulation.

### Don't: Steal Releasing Voices
Existing voice pool rules still apply - skip `releasing` voices.

### Don't: Unify Modulation Architectures
Keep Bæng and Ræmbl separate. Shared utilities only.

## Files to Create

```
/js/shared/
  modulation-utils.js       # LFSR, envelopes, patterns
  ppmod-modal.js            # Modal UI component
  ppmod-modal.css           # Modal styling
  modes/
    seq-mode.js             # SEQ implementation
    env-mode.js             # ENV implementation
    rnd-mode.js             # RND implementation
    tm-mode.js              # TM implementation
    ef-mode.js              # EF implementation
```

## Files to Modify

- `/js/state.js` - Add modulations persistence
- `/js/patch-loader.js` - v1.1.0 compatibility
- `/js/audio/worklets/raembl-voice-processor.js` - ENV snapshot message (optional)
- All UI module files (reverb, delay, filter, clouds, etc.)

## Reference Documentation

- Synthesis: `~/.claude/meta-output/20241217-143200-b7e4/004_synthesis.md`
- Plan: `~/.claude/plans/zesty-napping-phoenix.md`
- Parent project: `../merged-app/CLAUDE.md`

## Progress Tracking

Use `/progress` to log implementation progress to `thoughts/PROGRESS.md`.
