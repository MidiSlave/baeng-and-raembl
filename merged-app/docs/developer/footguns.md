# Critical Footguns – Common Mistakes to Avoid

## Introduction

This document catalogues critical mistakes that have caused production bugs, performance issues, or required code rollbacks during Bæng & Ræmbl development. These aren't theoretical concerns—they're **battle scars** from real implementation attempts.

⚠️ **Read this before:**
- Implementing new AudioWorklet processors
- Adding modulation systems
- Modifying voice allocation logic
- Creating new UI modules
- Integrating third-party audio engines

Cross-references:
- [AudioWorklet Development Guide](./audioworklet-guide.md) – Best practices for worklet implementation
- [Architecture Overview](./architecture.md) – System design and data flow

---

## 🔫 AudioWorklet Performance Footguns

### Per-Sample JavaScript Operations

**The Problem**: AudioWorklets run on the audio rendering thread at 48,000 samples/second. Any expensive JavaScript operation executed per-sample causes audio thread starvation, resulting in dropouts, glitches, or complete synthesis failure.

**Real-World Example**: An early slide/trill implementation attempted to calculate exponential pitch curves using `Math.exp()` for every sample. At 48kHz sample rate, this meant **48,000 exponential calculations per second**, which overwhelmed the audio thread and caused complete synthesis failure.

#### What's Safe vs Dangerous on the Audio Thread

✅ **SAFE** – Fast operations (use freely):
```javascript
// Simple arithmetic
const gain = value * 0.5;
const offset = baseValue + modAmount;
const mix = (a * 0.7) + (b * 0.3);

// Array access and loops
for (let i = 0; i < 128; i++) {
    outputs[0][0][i] = buffer[i] * gain;
}

// Bitwise operations
const intValue = phase & 0xFFFF;
const wrapped = index % bufferLength;
```

⚠️ **USE SPARINGLY** – Expensive but sometimes necessary:
```javascript
// Trigonometric functions (keep to ~1x per buffer, not per sample)
const lfoValue = Math.sin(this.lfoPhase); // Once per process() call

// sqrt (use for occasional calculations like envelope curves)
const curve = Math.sqrt(linearValue); // Not per-sample
```

❌ **DANGEROUS** – Audio thread killers (never use per-sample):
```javascript
// WRONG: Exponential functions per sample
for (let i = 0; i < 128; i++) {
    const freq = baseFreq * Math.exp(envelope[i]); // ← CPU DEATH
    phase += freq / sampleRate;
}

// WRONG: Logarithms per sample
for (let i = 0; i < 128; i++) {
    const db = 20 * Math.log10(amplitude[i]); // ← NO!
}

// WRONG: Power functions per sample
for (let i = 0; i < 128; i++) {
    const curved = Math.pow(value, 2.5); // ← BAD
}

// WRONG: String operations
console.log(`Sample ${i}: ${value}`); // ← NEVER LOG IN WORKLET

// WRONG: Object allocation
const obj = { sample: i, value: sample }; // ← GC PRESSURE
```

#### The Correct Approach: Use AudioParam Automation

For pitch modulation, filter sweeps, or any parameter that needs smooth changes, use **AudioParam automation from the main thread**:

```javascript
// ❌ WRONG: Exponential pitch curve in worklet per-sample
process(inputs, outputs) {
    for (let i = 0; i < outputs[0][0].length; i++) {
        // Math.exp() 48,000 times per second = audio thread death
        this.frequency = this.baseFreq * Math.exp(this.slideAmount);
        // ... generate sample with frequency
    }
}

// ✅ CORRECT: AudioParam automation from main thread
function scheduleSlide(workletNode, startFreq, endFreq, duration) {
    const now = audioContext.currentTime;
    const freqParam = workletNode.parameters.get('frequency');

    freqParam.setValueAtTime(startFreq, now);
    freqParam.exponentialRampToValueAtTime(endFreq, now + duration);
    // Web Audio API handles interpolation efficiently in native code
}
```

**Why This Works**:
- AudioParam interpolation runs in optimised native code (not JavaScript)
- Supports linear, exponential, and custom curves
- Sample-accurate timing
- Zero JavaScript overhead on audio thread

**Reference Implementation**: See `/merged-app/js/raembl/audio/worklets/raembl-voice-processor.js:27` – the `frequency` AudioParam receives slide/glide automation, while the worklet just reads the smoothly-interpolated value.

---

## 🔫 Voice Management Footguns

### Stealing Releasing Voices

**The Problem**: Voices in the release phase of their envelope are still producing audio (the decay tail). Stealing them mid-release causes audible glitches and cuts off the natural envelope decay.

**The Bug**:
```javascript
// ❌ WRONG: Steals voices that are still ringing out
function allocateVoice() {
    // Finds ANY inactive voice, including ones in release
    const voice = voicePool.find(v => !v.active);

    if (voice) {
        voice.active = true;
        voice.note = newNote;
        triggerNoteOn(voice); // ← Glitch! Previous note cut off mid-decay
    }
}
```

**The Fix**:
```javascript
// ✅ CORRECT: Skip voices that are releasing
function allocateVoice() {
    // Only allocate voices that are completely silent
    const voice = voicePool.find(v => !v.active && !v.releasing);

    if (voice) {
        voice.active = true;
        voice.note = newNote;
        triggerNoteOn(voice);
    } else {
        // No free voices - implement voice stealing with priority
        stealOldestVoice();
    }
}

// When releasing a voice, schedule cleanup AFTER envelope completes
function releaseVoice(voice, releaseTimeSeconds) {
    voice.active = false;
    voice.releasing = true; // Mark as "still producing audio"

    // Clear releasing flag after envelope completes
    setTimeout(() => {
        voice.releasing = false;
    }, releaseTimeSeconds * 1000);
}
```

**Voice Pool Pattern** (from `CLAUDE.md:228-254`):
```javascript
// 1. Pre-allocate fixed pool at init
for (let i = 0; i < 8; i++) {
    const node = new AudioWorkletNode(ctx, 'raembl-voice-processor', {
        processorOptions: { voiceIndex: i }
    });

    // Connect to FX sends + master
    node.connect(reverbSend);
    node.connect(delaySend);
    node.connect(masterGain);

    voicePool.push({
        node,
        active: false,
        releasing: false, // ← Critical flag
        note: null
    });
}

// 2. Allocate voice (skip releasing)
const voice = voicePool.find(v => !v.active && !v.releasing);

// 3. Release voice (schedule cleanup)
voice.active = false;
voice.releasing = true;
setTimeout(() => {
    voice.releasing = false;
}, releaseTime * 1000);
```

**Why This Matters**: Without release tracking, polyphonic playing causes voice dropouts, stuck notes, and audible glitches. This was a critical bug during AudioWorklet voice processor development.

---

## 🔫 Development Workflow Footguns

### AudioWorklet Cache Busting

**The Problem**: Browsers **aggressively cache** AudioWorklet processor code. During development, changes to worklet files may not load, leading to frustrating debugging sessions where your code changes appear to have no effect.

**Symptoms**:
- Code changes don't reflect in audio behaviour
- Console logs from old code still appear
- Bug fixes don't work despite correct code

**The Fix**:
```javascript
// ❌ WRONG: Browser caches this forever
await audioContext.audioWorklet.addModule(
    'js/audio/worklets/raembl-voice-processor.js'
);

// ✅ CORRECT: Cache-bust during development
await audioContext.audioWorklet.addModule(
    `js/audio/worklets/raembl-voice-processor.js?v=${Date.now()}`
);

// ✅ PRODUCTION: Use version-based cache busting
await audioContext.audioWorklet.addModule(
    `js/audio/worklets/raembl-voice-processor.js?v=${APP_VERSION}`
);
```

**Additional Debugging**:
1. Open DevTools → Network tab → Disable cache checkbox
2. Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)
3. Add timestamp-based logging inside worklet to verify which version is running:
```javascript
constructor() {
    console.log('[Worklet] Loaded at:', new Date().toISOString());
}
```

---

### Premature AudioWorklet Integration

**The Problem**: Integrating a complex AudioWorklet processor directly into the main application before thorough testing leads to catastrophic failures that require rollbacks, wasting days of work.

**What Happened**: Early Ræmbl AudioWorklet attempts integrated the voice processor into the main app before validating basic synthesis. The result: broken audio, debugging nightmares, and a full rollback.

**The Correct Workflow**:

#### Phase 1-3: Isolated Test Harness
Create a standalone HTML file (see `/tests/` directory for examples):
```html
<!-- standalone-worklet-test.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Voice Processor Test Harness</title>
</head>
<body>
    <h1>AudioWorklet Test (Isolated)</h1>
    <button id="test-note">Trigger Note</button>
    <script type="module">
        // Minimal test environment - NO main app dependencies
        const ctx = new AudioContext();

        await ctx.audioWorklet.addModule('raembl-voice-processor.js');
        const testNode = new AudioWorkletNode(ctx, 'raembl-voice-processor');
        testNode.connect(ctx.destination);

        // Test basic note triggering
        document.getElementById('test-note').addEventListener('click', () => {
            testNode.port.postMessage({
                type: 'noteOn',
                pitch: 60,
                velocity: 1.0
            });
        });
    </script>
</body>
</html>
```

#### Phase 4-6: Validate Core Functionality
- ✅ Oscillators generate correct waveforms
- ✅ Envelopes trigger and release properly
- ✅ Filters respond to cutoff/resonance
- ✅ No audio glitches or dropouts
- ✅ CPU usage acceptable (<5% for single voice)

#### Phase 7-8: Integration
**Only after** all test harness phases pass:
1. Create integration branch: `git checkout -b feature/worklet-integration`
2. Add worklet to main app with feature flag
3. Test in production environment
4. Monitor for regressions

**Reference**: The Plaits and Rings integrations followed this pattern (see `/tests/plaits-test/` and `/tests/rings-test/`).

---

## 🔫 Modulation System Footguns

### Per-Sample PPMod Calculations in AudioWorklet

**The Problem**: Per-parameter modulation (PPMod) was designed as a **k-rate system** (30 FPS updates from main thread). Attempting to add audio-rate modulation inside AudioWorklet processors adds massive complexity with **zero perceptual benefit**.

**Why K-Rate is Sufficient**:
- Human perception of modulation changes: ~50ms (20 Hz)
- K-rate update interval: 33ms (30 FPS)
- Nyquist frequency of k-rate: 15 Hz (well above perceptual threshold)
- CPU cost: <1% for all modulation modes

**PPMod Architecture** (from `CLAUDE.md:513-517`):
```javascript
// K-rate modulation loop (30 FPS on main thread)
requestAnimationFrame(() => {
    const now = audioContext.currentTime;
    const modValue = calculateModValue(mod, now); // LFO/RND/ENV/etc.

    // Update via AudioParam (smoothly interpolated by Web Audio API)
    audioParam.setValueAtTime(modValue, now);
});
```

#### What NOT to Do

```javascript
// ❌ WRONG: Audio-rate modulation in worklet
class MyWorkletProcessor extends AudioWorkletProcessor {
    process(inputs, outputs) {
        for (let i = 0; i < outputs[0][0].length; i++) {
            // Per-sample LFO calculation = 48,000 calculations/second
            this.lfoPhase += this.lfoRate / this.sampleRate;
            const lfoValue = Math.sin(this.lfoPhase * Math.PI * 2);

            // Per-sample modulation application
            this.frequency += lfoValue * this.depth; // ← CPU DEATH

            // ... generate sample
        }
    }
}
```

#### The Correct Approach

```javascript
// ✅ CORRECT: K-rate modulation from main thread
class PPModSystem {
    update() {
        const now = performance.now();

        // Throttle to 30 FPS
        if (now - this.lastUpdate < 33) return;
        this.lastUpdate = now;

        // Calculate modulation value
        const lfoPhase = (now * modConfig.rate) % 1.0;
        const lfoValue = Math.sin(lfoPhase * Math.PI * 2);
        const modAmount = lfoValue * modConfig.depth;

        // Update AudioParam (Web Audio API interpolates smoothly)
        this.workletNode.parameters.get('frequency')
            .setValueAtTime(baseValue + modAmount, audioCtx.currentTime);
    }
}

// Start k-rate loop
function startModulationLoop() {
    function update() {
        ppModSystem.update();
        requestAnimationFrame(update);
    }
    update();
}
```

**Reference Implementation**: See `/merged-app/js/raembl/modules/perParamMod.js:242-266` – k-rate loop with 30 FPS throttling.

**Benefits**:
- Zero AudioWorklet code changes required
- Works in both MONO and POLY modes
- <1% CPU overhead
- Smooth parameter transitions
- Easy to debug (main thread)

---

## 🔫 UI/State Management Footguns

### Module Rendering Without Cleanup

**The Problem**: When re-rendering UI modules (switching FX engines, changing voice modes, etc.), failing to remove old DOM elements and event listeners causes memory leaks, duplicate event handlers, and UI glitches.

**The Bug**:
```javascript
// ❌ WRONG: Leaves old module in DOM, doubles event handlers
function switchToGranularFX() {
    const fxContainer = document.getElementById('fx-container');

    // Renders new HTML but doesn't remove old module
    fxContainer.innerHTML = generateGranularHTML();

    // Event listeners attached to BOTH old and new modules!
    setupFXKnobs(); // ← Duplicate handlers
}
```

**The Fix**:
```javascript
// ✅ CORRECT: Remove old module before rendering new one
function switchToGranularFX() {
    const fxContainer = document.getElementById('fx-container');
    const oldModule = fxContainer.querySelector('.fx-module');

    // Remove old module (and its event listeners)
    oldModule?.remove();

    // Render new module
    fxContainer.insertAdjacentHTML('beforeend', generateGranularHTML());

    // Attach fresh event listeners
    setupFXKnobs();
}
```

**Pattern for Safe Module Rendering**:
```javascript
function renderModule(containerId, htmlGenerator, setupFunction) {
    const container = document.getElementById(containerId);

    // 1. Remove old content
    const oldModule = container.querySelector('.module');
    if (oldModule) {
        oldModule.remove();
    }

    // 2. Render new content
    const html = htmlGenerator();
    container.insertAdjacentHTML('beforeend', html);

    // 3. Re-attach event listeners
    if (setupFunction) {
        setupFunction();
    }
}

// Usage
renderModule('fx-container', generateCloudsHTML, setupCloudsKnobs);
```

**Why This Matters**: Without proper cleanup, switching between FX engines or voice modes causes:
- Memory leaks (old DOM nodes never garbage collected)
- Event handler multiplication (each click fires multiple times)
- State desynchronisation (old handlers update stale references)

---

### Console Message Namespacing

**The Problem**: In a merged app with 2+ synthesisers, debugging becomes impossible when console messages don't indicate which app/module generated them.

**The Bug**:
```javascript
// ❌ WRONG: Which app? Which module? Unknown!
console.log('Reverb decay changed to:', value);
console.warn('Failed to load patch');
console.error('Voice allocation failed');
```

**The Fix**:
```javascript
// ✅ CORRECT: Namespace ALL console output
console.log('[Ræmbl/Reverb] Decay changed to:', value);
console.warn('[Bæng/Patch] Failed to load patch:', filename);
console.error('[Ræmbl/Voices] Allocation failed, pool exhausted');

// Even better: Use consistent prefix format
const LOG_PREFIX = '[Ræmbl/PerParamMod]';
console.log(`${LOG_PREFIX} LFO rate:`, lfoRate);
console.warn(`${LOG_PREFIX} Invalid depth value:`, depth);
```

**Recommended Namespace Format**:
```
[App/Module/Function] Message
```

Examples:
```javascript
console.log('[Bæng/DX7/noteOn] Triggering voice 2, pitch 60');
console.warn('[Ræmbl/Clouds/setMode] Invalid mode, defaulting to Granular');
console.error('[Shared/Clock] Scheduler drift detected: +15ms');
```

**Helper Function**:
```javascript
// Create module-specific logger
function createLogger(namespace) {
    return {
        log: (...args) => console.log(`[${namespace}]`, ...args),
        warn: (...args) => console.warn(`[${namespace}]`, ...args),
        error: (...args) => console.error(`[${namespace}]`, ...args)
    };
}

// Usage
const log = createLogger('Ræmbl/Voices');
log.warn('Pool exhausted, stealing oldest voice');
```

---

## Quick Reference Checklist

Before committing code, verify:

### AudioWorklet
- [ ] No per-sample `Math.exp()`, `Math.pow()`, `Math.log()`
- [ ] No string operations or object allocation in `process()`
- [ ] No console logging in audio thread
- [ ] AudioParam automation used for smooth parameter changes
- [ ] Cache-busting query param during development
- [ ] Tested in isolated harness BEFORE main app integration

### Voice Management
- [ ] Voice stealing checks `!v.active && !v.releasing`
- [ ] Release cleanup scheduled after envelope duration
- [ ] Voice pool pre-allocated (no dynamic node creation)

### Modulation
- [ ] PPMod uses k-rate (30 FPS), not audio-rate
- [ ] `requestAnimationFrame` loop for modulation updates
- [ ] `setValueAtTime()` for AudioParam updates

### UI/State
- [ ] Old modules removed before re-render (`oldModule?.remove()`)
- [ ] Event listeners re-attached after DOM changes
- [ ] Console messages namespace-prefixed (`[App/Module]`)

---

## Further Reading

- **[AudioWorklet Best Practices](https://developer.chrome.com/blog/audio-worklet/)** – Official Chrome guide
- **[Web Audio API Spec](https://www.w3.org/TR/webaudio/)** – Authoritative reference
- **[CLAUDE.md](/CLAUDE.md)** – Project-specific patterns and decisions
- **[Architecture Overview](./architecture.md)** – System design and data flow
- **[AudioWorklet Guide](./audioworklet-guide.md)** – Detailed worklet development guide

---

**Last Updated**: 2025-12-30
**Maintained By**: Development team (update when new footguns discovered)
