# AudioWorklet Voice Pool Pattern

**Developer Guide for Bæng & Ræmbl AudioWorklet Architecture**

This guide documents the voice pool pattern used throughout the codebase for managing polyphonic AudioWorklet processors with pre-allocated voices, efficient CPU usage, and proper envelope release behaviour.

---

## Table of Contents

1. [Why AudioWorklet?](#why-audioworklet)
2. [Voice Pool Architecture](#voice-pool-architecture)
3. [Voice Allocation Algorithm](#voice-allocation-algorithm)
4. [Release Tracking](#release-tracking)
5. [Voice Stealing](#voice-stealing)
6. [AudioParam vs MessagePort](#audioparam-vs-messageport)
7. [Processor Implementation Pattern](#processor-implementation-pattern)
8. [Common Patterns](#common-patterns)
9. [Performance Considerations](#performance-considerations)
10. [Related Documentation](#related-documentation)

---

## Why AudioWorklet?

AudioWorklet provides significant advantages over ScriptProcessorNode and traditional Web Audio approaches:

### Latency
- **Runs on audio thread** - zero scheduler latency
- **Sample-accurate timing** - trigger envelopes precisely with audio clock
- **128-sample blocks** - consistent, predictable processing chunks

### Performance
- **No main thread blocking** - audio processing isolated from UI
- **Efficient DSP** - JavaScript JIT-compiled on audio thread
- **Zero garbage collection** - pre-allocated buffers, no dynamic allocation

### Architecture
- **Clean separation** - main thread handles UI/scheduling, audio thread handles DSP
- **Message passing** - structured communication via `MessagePort`
- **AudioParam automation** - smooth parameter changes with Web Audio scheduling

**Example use cases in this project:**
- **Ræmbl Subtractive Engine** - 8 PolyBLEP oscillators, TPT filters, ADSR envelopes
- **Plaits Engine** - 24 synthesis engines with per-voice LPG envelopes
- **Rings Resonator** - Physical modelling with 4 internal voices
- **Clouds Granular** - 64-grain granular synthesis with spectral processing
- **Drum Bus** - Master bus saturation, transient shaping, compression

---

## Voice Pool Architecture

### The Problem

Traditional Web Audio approach: create/destroy nodes dynamically per note.

```javascript
// ❌ ANTI-PATTERN: Dynamic node creation
function playNote(note) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.connect(env).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1.0);
  // Memory leak: nodes never garbage collected until stopped
}
```

**Problems:**
- **40+ node allocations** for 8-voice polyphony creates GC pressure
- **Envelope cutoff** when stealing active voices (no release phase)
- **Poly mode dropouts** when allocation fails during note bursts
- **CPU spikes** during node construction

### The Solution: Pre-Allocated Voice Pool

Pre-allocate a fixed number of AudioWorkletNode instances at initialisation, reuse them for the lifetime of the application.

```javascript
// ✅ CORRECT PATTERN: Pre-allocated voice pool
class VoicePool {
  async init() {
    // Load processor once (shared by all voices)
    await ctx.audioWorklet.addModule('voice-processor.js');

    // Pre-allocate 8 voices
    for (let i = 0; i < 8; i++) {
      const node = new AudioWorkletNode(ctx, 'voice-processor', {
        processorOptions: { voiceIndex: i }
      });

      // Connect permanently (never disconnected)
      node.connect(masterGain);
      node.connect(reverbSend);
      node.connect(delaySend);

      this.voicePool.push({
        node,                    // AudioWorkletNode instance
        active: false,           // Currently playing (gate high)
        releasing: false,        // In release phase (gate low, envelope > 0)
        note: null,              // MIDI note number
        voiceId: null,           // Unique ID for this allocation
        startTime: 0,            // When note started (for stealing)
        releaseEndTime: 0        // When release finishes
      });
    }
  }
}
```

**Benefits:**
- **Zero allocation overhead** - nodes created once, reused forever
- **Prevents envelope cutoff** - releasing voices excluded from allocation
- **Eliminates poly dropouts** - fixed pool, no dynamic creation
- **Predictable CPU usage** - 8 voices always running (silent when inactive)

**Trade-off:** Hard polyphony limit (8 voices in this project).

---

## Voice Allocation Algorithm

### Three-Tier Allocation Strategy

Voice allocation follows a strict priority hierarchy to balance voice availability with audio quality.

```javascript
/**
 * Three-tier voice allocation
 * Tier 1: Free voices (not active, not releasing)
 * Tier 2: Oldest releasing voice (steal with grace)
 * Tier 3: Oldest active voice (steal with quick fade)
 */
allocateVoice() {
  // Update release tracking first
  this.checkReleasedVoices();

  // TIER 1: Find completely free voice
  let voice = this.voicePool.find(v =>
    !v.active && !v.releasing && !v.quickReleasing
  );
  if (voice) return voice;

  // TIER 2: Find oldest releasing voice (softer steal)
  const releasingVoices = this.voicePool
    .filter(v => v.releasing && !v.quickReleasing)
    .sort((a, b) => a.releaseEndTime - b.releaseEndTime);
  if (releasingVoices.length > 0) {
    return releasingVoices[0];
  }

  // TIER 3: Voice stealing (oldest active gets quick-released)
  const activeVoices = this.voicePool
    .filter(v => v.active)
    .sort((a, b) => a.startTime - b.startTime);
  if (activeVoices.length > 0) {
    const voice = activeVoices[0];

    // Trigger 20ms quick-release on processor
    this.nodes[voice.nodeIndex].port.postMessage({
      type: 'quickRelease'
    });

    voice.quickReleasing = true;
    voice.quickReleaseEndTime = this.audioContext.currentTime + 0.020;

    console.log(`[VoicePool] Voice stealing: ${voice.nodeIndex}`);
    return voice;
  }

  // Fallback: first voice (should never reach here)
  return this.voicePool[0];
}
```

### Tier Rationale

| Tier | Target | Audio Impact | Reasoning |
|------|--------|--------------|-----------|
| **1** | Free voices | None | Zero artefacts, ideal case |
| **2** | Releasing voices | Minimal | Envelope already decaying, steal is subtle |
| **3** | Active voices | Quick fade | 20ms fade prevents click, but truncates note |

**Critical rule:** Never allocate `!active` voices without checking `releasing` flag. This causes envelope cutoff glitches.

```javascript
// ❌ WRONG: Cuts off decaying notes
voice = voicePool.find(v => !v.active);

// ✅ CORRECT: Skip releasing voices
voice = voicePool.find(v => !v.active && !v.releasing);
```

---

## Release Tracking

### The Problem: Envelope Cutoff

When a note stops, the amplitude envelope enters its **release phase**. During this time, the voice is no longer "active" but still produces audio as the envelope decays to zero.

If we mark a voice as available immediately on `noteOff`, the next `noteOn` will interrupt the release, causing audible clicks or cut-off tails.

### The Solution: Release Tracking

Track when voices finish their release phase using time-based scheduling.

```javascript
/**
 * Release a note
 * Mark voice inactive but keep it unavailable until envelope finishes
 */
releaseNote(note) {
  const voice = this.voicePool.find(v =>
    v.active && v.note === note
  );

  if (!voice) return;

  // Send noteOff to processor
  this.nodes[voice.nodeIndex].port.postMessage({
    type: 'noteOff',
    note: voice.note
  });

  // Mark voice as releasing (not active, not available)
  voice.active = false;
  voice.releasing = true;

  // Schedule cleanup after release time
  const releaseTime = this.getReleaseTime(); // e.g., 0.5 seconds
  voice.releaseEndTime = this.audioContext.currentTime + releaseTime;

  // Processor will send 'voiceReleased' event when envelope reaches 0
  // But we also track with timer as fallback
  setTimeout(() => {
    voice.releasing = false;
    voice.voiceId = null;
  }, releaseTime * 1000);
}

/**
 * Check and update voice release states
 * Called before voice allocation to ensure accurate availability
 */
checkReleasedVoices() {
  const now = this.audioContext.currentTime;
  this.voicePool.forEach(voice => {
    if (voice.releasing && now >= voice.releaseEndTime) {
      voice.releasing = false;
      voice.voiceId = null;
    }
    if (voice.quickReleasing && now >= voice.quickReleaseEndTime) {
      voice.quickReleasing = false;
    }
  });
}
```

### Processor-Side Implementation

The AudioWorklet processor tracks its own envelope state and notifies the main thread when release completes.

```javascript
// Inside RaemblVoiceProcessor.process()
if ((voice.releasing || voice.quickReleasing) && voice.lpgEnvLevel < 0.0001) {
  voice.releasing = false;
  voice.quickReleasing = false;

  // Notify main thread
  this.port.postMessage({
    event: 'voiceReleased',
    value: this.voiceIndex
  });

  return true; // Keep processor alive
}
```

**Why both timer and event?**
- **Timer** - Fallback if processor message is lost or delayed
- **Event** - Precise notification when envelope actually reaches zero
- **Redundancy** - Ensures voices never get "stuck" in releasing state

---

## Voice Stealing

When all voices are busy (active or releasing), we must **steal** an existing voice to play a new note. The goal is to minimise audible artefacts while respecting musical priority.

### Stealability Scoring (Plaits Implementation)

Some implementations use a scoring system to choose the "least important" voice to steal.

```javascript
/**
 * Calculate how "stealable" a voice is
 * Lower score = more stealable
 */
calculateStealability(voice) {
  const now = this.audioContext.currentTime;
  const age = now - voice.startTime;

  let score = 0;

  // Age penalty: older = more stealable
  score += age * 10;

  // Accent protection: accented notes less stealable
  if (voice.isAccented) score -= 50;

  // Trill protection: trilling notes less stealable
  if (voice.isTrill) score -= 30;

  // Velocity: quieter = more stealable
  score += (1.0 - voice.velocity) * 20;

  return score;
}

// Find least important active voice
const activeVoices = this.voicePool
  .filter(v => v.active)
  .map(v => ({ voice: v, score: this.calculateStealability(v) }))
  .sort((a, b) => b.score - a.score); // Highest score = least stealable

const voiceToSteal = activeVoices[activeVoices.length - 1].voice;
```

### Quick Release Fade

When stealing an active voice (Tier 3), we trigger a fast fade-out to prevent clicks.

```javascript
// Processor-side quick release envelope
if (voice.lpgEnvStage === 'quickRelease') {
  // Fast decay: ~20ms fade-out for voice stealing
  const quickReleaseRate = Math.exp(-1 / (this.sampleRate * 0.020));
  voice.lpgEnvLevel *= quickReleaseRate;

  if (voice.lpgEnvLevel < 0.0001) {
    // Fade complete, mark available
    voice.quickReleasing = false;
    this.port.postMessage({ event: 'voiceReleased', value: this.voiceIndex });
  }
}
```

**Duration choice:**
- **Too short (<10ms):** Audible click artefacts
- **Too long (>50ms):** Noticeable "choke" effect
- **20ms sweet spot:** Perceptually masked by attack transient of new note

---

## AudioParam vs MessagePort

AudioWorklet processors communicate with the main thread via two mechanisms. Understanding when to use each is critical for performance.

### AudioParam (Preferred for Continuous Parameters)

**Use for:**
- Smooth, continuous parameter changes (filter cutoff, pitch bend, LFO rate)
- Sample-accurate modulation (envelopes, automation curves)
- Web Audio scheduling (ramps, curves, timed events)

**Advantages:**
- **Natively interpolated** by Web Audio API (no JavaScript overhead)
- **A-rate or K-rate** - per-sample or per-block updates
- **Scheduling** - `setValueAtTime()`, `linearRampToValueAtTime()`, `exponentialRampToValueAtTime()`

**Example: Filter cutoff modulation**

```javascript
// Main thread: Schedule smooth cutoff sweep
const cutoffParam = workletNode.parameters.get('filterCutoff');
cutoffParam.cancelScheduledValues(audioContext.currentTime);
cutoffParam.setValueAtTime(200, audioContext.currentTime);
cutoffParam.exponentialRampToValueAtTime(2000, audioContext.currentTime + 0.5);

// Processor: Read interpolated values per-sample
process(inputs, outputs, parameters) {
  const cutoffValues = parameters.filterCutoff;

  for (let i = 0; i < blockSize; i++) {
    // Web Audio API interpolates cutoff automatically
    const cutoff = cutoffValues.length === 1
      ? cutoffValues[0]   // K-rate: single value for block
      : cutoffValues[i];  // A-rate: per-sample array

    // Use cutoff for filter calculation
    this.filter.setCutoff(cutoff);
    outputs[0][0][i] = this.filter.process(inputs[0][0][i]);
  }
}
```

**Slide/Glide Example (TB-303 style portamento)**

```javascript
// Main thread: Exponential pitch glide
const freqParam = workletNode.parameters.get('frequency');
freqParam.cancelScheduledValues(audioContext.currentTime);
freqParam.setValueAtTime(220, audioContext.currentTime); // Start at A3
freqParam.exponentialRampToValueAtTime(440, audioContext.currentTime + 0.080); // Glide to A4 over 80ms

// Processor: Read smoothly interpolated frequency
const frequencyValues = parameters.frequency;
const baseFreq = frequencyValues.length === 1
  ? frequencyValues[0]
  : frequencyValues[i];

// Apply to oscillator (Web Audio handles smooth transition)
const phaseIncrement = (2 * Math.PI * baseFreq) / this.sampleRate;
```

### MessagePort (Required for Discrete Events)

**Use for:**
- Note on/off events (discrete triggers)
- Engine/mode changes (switch algorithms)
- Configuration updates (oscillator mix, envelope params)
- Debug/status messages

**Advantages:**
- **Structured data** - JSON objects, not just floats
- **Bidirectional** - processor can respond with status
- **Event-based** - trigger changes, not continuous streams

**Example: Note on/off handling**

```javascript
// Main thread: Send note event
workletNode.port.postMessage({
  type: 'noteOn',
  pitch: 60,           // MIDI note number
  velocity: 0.8,
  isAccented: true,
  monoMode: false,
  drift: 0.3
});

// Processor: Handle message
this.port.onmessage = (e) => {
  const { type } = e.data;

  if (type === 'noteOn') {
    // Queue parameters for sample-accurate trigger
    // (Applied when gate signal rises, not immediately)
    this.pendingNoteParams = {
      frequency: this.mtof(e.data.pitch),
      velocity: e.data.velocity,
      isAccented: e.data.isAccented,
      driftOffset: this.calculateDrift(e.data.drift),
      monoMode: e.data.monoMode
    };
  }
};
```

**Example: Processor status updates**

```javascript
// Processor: Send status to main thread
this.port.postMessage({
  event: 'voiceAllocated',
  value: this.voiceIndex,
  data: { note: 60, velocity: 0.8 }
});

// Main thread: Handle processor events
workletNode.port.onmessage = (e) => {
  const { event, value, data } = e.data;

  if (event === 'voiceAllocated') {
    console.log(`Voice ${value} allocated: ${data.note}`);
    this.updateVoiceIndicator(value, true);
  }
};
```

### Hybrid Approach: Pending Parameters + Gate Signal

For sample-accurate timing with structured data, use both mechanisms:

1. **MessagePort** sends note parameters (MIDI note, velocity, accent)
2. **AudioParam gate signal** triggers envelope at exact audio sample
3. **Processor queues params** in `pendingNoteParams`, applies when gate rises

```javascript
// Main thread: Send parameters + schedule gate pulse
workletNode.port.postMessage({
  type: 'noteOn',
  pitch: 60,
  velocity: 0.8,
  isAccented: true
});

// Schedule sample-accurate gate pulse
const gateParam = workletNode.parameters.get('gateSignal');
gateParam.setValueAtTime(0, scheduledTime);
gateParam.setValueAtTime(1, scheduledTime);           // Gate high
gateParam.setValueAtTime(1, scheduledTime + 0.001);   // Hold 1ms
gateParam.setValueAtTime(0, scheduledTime + 0.002);   // Gate low

// Processor: Detect gate rising edge
const currentGate = gateValues.length === 1
  ? gateValues[0]
  : gateValues[i];

const gateRising = currentGate > 0.5 && this.lastGateValue <= 0.5;

if (gateRising) {
  // Apply pending params NOW (sample-accurate)
  if (this.pendingNoteParams) {
    this.frequency = this.pendingNoteParams.frequency;
    this.velocity = this.pendingNoteParams.velocity;
    this.isAccented = this.pendingNoteParams.isAccented;
    this.pendingNoteParams = null;
  }

  // Trigger envelope
  this.ampEnv.stage = 'attack';
  this.ampEnv.value = 0;
}

this.lastGateValue = currentGate;
```

**Why this pattern?**
- **MessagePort** can't guarantee sample-accurate timing (queued on audio thread)
- **AudioParam** can't carry structured data (only floats)
- **Combined** - structured params + precise timing

---

## Processor Implementation Pattern

### Minimal Template

Every AudioWorklet processor follows this structure:

```javascript
class MinimalVoiceProcessor extends AudioWorkletProcessor {
  // 1. Declare AudioParams (static)
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000 },
      { name: 'gateSignal', defaultValue: 0, minValue: 0, maxValue: 1 }
    ];
  }

  // 2. Constructor - initialise state
  constructor(options) {
    super();

    this.sampleRate = sampleRate;
    this.voiceIndex = options.processorOptions?.voiceIndex || 0;

    // Voice state
    this.active = false;
    this.frequency = 440;
    this.velocity = 1.0;

    // DSP state (oscillator, filters, envelopes)
    this.phase = 0;
    this.ampEnv = { value: 0, stage: 'idle' };

    // Message handling
    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  // 3. Message handler - discrete events
  handleMessage(data) {
    const { type } = data;

    if (type === 'noteOn') {
      this.pendingNoteParams = {
        frequency: this.mtof(data.pitch),
        velocity: data.velocity
      };
    } else if (type === 'noteOff') {
      this.active = false;
      this.ampEnv.stage = 'release';
    }
  }

  // 4. Process function - DSP loop (called ~375 times/sec at 48kHz)
  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const channel0 = output[0];
    const channel1 = output[1];
    const blockSize = channel0.length; // Always 128 samples

    const frequencyValues = parameters.frequency;
    const gateValues = parameters.gateSignal;

    for (let i = 0; i < blockSize; i++) {
      // Detect gate rising edge
      const currentGate = gateValues.length === 1 ? gateValues[0] : gateValues[i];
      if (currentGate > 0.5 && this.lastGateValue <= 0.5) {
        // Apply pending params
        if (this.pendingNoteParams) {
          this.frequency = this.pendingNoteParams.frequency;
          this.velocity = this.pendingNoteParams.velocity;
          this.pendingNoteParams = null;
        }

        // Trigger envelope
        this.active = true;
        this.ampEnv.stage = 'attack';
        this.ampEnv.value = 0;
      }
      this.lastGateValue = currentGate;

      // Skip processing if silent
      if (!this.active && this.ampEnv.value <= 0) {
        channel0[i] = 0;
        channel1[i] = 0;
        continue;
      }

      // Update envelope
      this.updateEnvelope();

      // Generate audio
      const freq = frequencyValues.length === 1 ? frequencyValues[0] : frequencyValues[i];
      const phaseInc = (2 * Math.PI * freq) / this.sampleRate;
      const sample = Math.sin(this.phase) * this.ampEnv.value * this.velocity;

      this.phase += phaseInc;
      if (this.phase >= 2 * Math.PI) this.phase -= 2 * Math.PI;

      // Output stereo
      channel0[i] = sample;
      channel1[i] = sample;
    }

    // Keep processor alive
    return true;
  }

  // 5. Helper methods
  updateEnvelope() {
    // Envelope state machine
    switch (this.ampEnv.stage) {
      case 'attack':
        this.ampEnv.value += 1 / (0.01 * this.sampleRate);
        if (this.ampEnv.value >= 1.0) {
          this.ampEnv.value = 1.0;
          this.ampEnv.stage = 'sustain';
        }
        break;
      case 'sustain':
        this.ampEnv.value = 0.7;
        break;
      case 'release':
        this.ampEnv.value -= 0.7 / (0.2 * this.sampleRate);
        if (this.ampEnv.value <= 0) {
          this.ampEnv.value = 0;
          this.ampEnv.stage = 'idle';
          this.port.postMessage({ event: 'voiceReleased', value: this.voiceIndex });
        }
        break;
      case 'idle':
        this.ampEnv.value = 0;
        break;
    }
  }

  mtof(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
}

registerProcessor('minimal-voice-processor', MinimalVoiceProcessor);
```

### Critical Implementation Details

#### 1. Envelope Release Snapshot

When a note is released, **snapshot the envelope value and release time** immediately. This prevents parameter changes from affecting notes already in release.

```javascript
// ❌ WRONG: Release time change affects all releasing voices
handleMessage(data) {
  if (data.type === 'noteOff') {
    this.ampEnv.stage = 'release'; // Uses current this.ampRelease
  } else if (data.type === 'setEnvelope') {
    this.ampRelease = data.release * this.sampleRate; // Changes mid-release!
  }
}

// ✅ CORRECT: Snapshot release params at noteOff
handleMessage(data) {
  if (data.type === 'noteOff') {
    this.ampEnv.releaseStartValue = this.ampEnv.value;  // Snapshot current value
    this.ampEnv.releaseTime = this.ampRelease;          // Snapshot release time
    this.ampEnv.stage = 'release';
  }
}

updateEnvelope() {
  if (this.ampEnv.stage === 'release') {
    // Use snapshotted values - immune to parameter changes
    this.ampEnv.value -= this.ampEnv.releaseStartValue / this.ampEnv.releaseTime;
    if (this.ampEnv.value <= 0) {
      this.ampEnv.value = 0;
      this.ampEnv.stage = 'idle';
    }
  }
}
```

#### 2. Retrigger Fade (Mono Mode)

When retriggering a voice in mono mode, the envelope may have a non-zero value from the previous note. Jumping directly to attack creates a discontinuity (audible as "flam" or double-attack).

```javascript
// ❌ WRONG: Discontinuity causes flam
if (gateRising) {
  this.ampEnv.value = 0;      // Jump to 0 = click!
  this.ampEnv.stage = 'attack';
}

// ✅ CORRECT: Quick fade before attack
if (gateRising) {
  if (this.ampEnv.value > 0.01) {
    // Start 2ms fade to 0, then attack
    this.ampEnv.retriggerFade = Math.floor(0.002 * this.sampleRate);
    this.ampEnv.retriggerStart = this.ampEnv.value;
    this.ampEnv.stage = 'retrigger_fade';
  } else {
    // Already near 0, start attack immediately
    this.ampEnv.value = 0;
    this.ampEnv.stage = 'attack';
  }
}

updateEnvelope() {
  if (this.ampEnv.stage === 'retrigger_fade') {
    this.ampEnv.retriggerFade--;
    if (this.ampEnv.retriggerFade <= 0) {
      // Fade complete, start attack
      this.ampEnv.value = 0;
      this.ampEnv.stage = 'attack';
    } else {
      // Linear fade toward 0
      const fadeRate = this.ampEnv.retriggerStart / (0.002 * this.sampleRate);
      this.ampEnv.value -= fadeRate;
      if (this.ampEnv.value < 0) this.ampEnv.value = 0;
    }
  }
}
```

#### 3. Filter State Persistence

Do **not** reset filter states on retrigger. Resetting creates transient clicks. Let the filter state evolve continuously.

```javascript
// ❌ WRONG: Creates transient on retrigger
if (gateRising) {
  this.filterState = { ic1eq: 0, ic2eq: 0 }; // Click!
}

// ✅ CORRECT: Preserve filter state
if (gateRising) {
  // DON'T reset filter - let it evolve smoothly
  // The envelope fade handles amplitude discontinuity
}
```

---

## Common Patterns

### Pattern 1: Voice Pool Initialisation

```javascript
class SubtractiveVoicePool {
  async init() {
    if (this.isInitialised) return;

    try {
      // Load processor with cache busting
      await this.audioContext.audioWorklet.addModule(
        `js/audio/worklets/raembl-voice-processor.js?v=${Date.now()}`
      );

      // Pre-allocate 8 voices
      for (let i = 0; i < 8; i++) {
        const node = new AudioWorkletNode(this.audioContext, 'raembl-voice-processor', {
          processorOptions: { voiceIndex: i }
        });

        // Permanent connections (never disconnected)
        node.connect(this.masterGain);
        node.connect(this.reverbSend);
        node.connect(this.delaySend);

        // Message handling
        node.port.onmessage = (e) => this.handleProcessorMessage(e.data, i);

        this.nodes.push(node);
        this.voicePool.push({
          node,
          active: false,
          releasing: false,
          note: null,
          voiceId: null
        });
      }

      this.isInitialised = true;
      console.log('[SubtractiveVoicePool] Initialised with 8 voices');
    } catch (error) {
      console.error('[SubtractiveVoicePool] Failed to initialise:', error);
      throw error;
    }
  }
}
```

### Pattern 2: Sample-Accurate Note Triggering

```javascript
triggerNote(note, velocity, isAccented, shouldSlide, isTrill, audioTime, voiceId) {
  if (!this.isInitialised) return null;

  const midiNote = noteNameToMidi(note);
  const currentTime = this.audioContext.currentTime;
  const scheduledTime = audioTime || currentTime;

  // Allocate voice
  const voice = this.allocateVoice();
  const node = this.nodes[voice.nodeIndex];

  // Send note parameters via MessagePort
  node.port.postMessage({
    type: 'noteOn',
    pitch: midiNote,
    velocity: velocity,
    isAccented: isAccented,
    monoMode: this.monoMode,
    drift: this.drift
  });

  // Schedule sample-accurate gate pulse via AudioParam
  const gateParam = node.parameters.get('gateSignal');
  gateParam.cancelScheduledValues(scheduledTime);
  gateParam.setValueAtTime(0, scheduledTime);
  gateParam.setValueAtTime(1, scheduledTime);           // Gate rising edge
  gateParam.setValueAtTime(1, scheduledTime + 0.001);   // Hold 1ms
  gateParam.setValueAtTime(0, scheduledTime + 0.002);   // Gate falling edge

  // Update voice state
  voice.active = true;
  voice.releasing = false;
  voice.note = midiNote;
  voice.voiceId = voiceId;
  voice.startTime = scheduledTime;

  return voice;
}
```

### Pattern 3: Slide/Glide with AudioParam Automation

```javascript
// TB-303 style portamento (exponential frequency glide)
const lastMidiNote = this.lastNote ? noteNameToMidi(this.lastNote) : null;
const shouldMonoSlide = this.monoMode && this.lastNote && (shouldSlide || this.glide > 0);

if (shouldMonoSlide) {
  const semitoneDiff = midiNote - lastMidiNote;
  const slideTime = this.glide > 0 ? (this.glide / 100) * 0.5 : 0.080; // 80ms default

  const freqParam = node.parameters.get('frequency');
  freqParam.cancelScheduledValues(scheduledTime);

  // Start at previous note's frequency
  const startFreq = this.mtof(lastMidiNote);
  freqParam.setValueAtTime(startFreq, scheduledTime);

  // Glide to new frequency
  const endFreq = this.mtof(midiNote);
  freqParam.exponentialRampToValueAtTime(
    Math.max(0.001, endFreq), // Clamp to prevent exponentialRamp error
    scheduledTime + slideTime
  );
}
```

### Pattern 4: Trill Automation

```javascript
// Oscillate between base note and scale degree above
if (isTrill) {
  const trillNoteStr = this.findTrillTarget(note); // Next scale degree up

  if (trillNoteStr) {
    const trillMidiNote = noteNameToMidi(trillNoteStr);
    const trillSemitones = trillMidiNote - midiNote;

    const pitchBendParam = node.parameters.get('pitchBend');
    const bpm = this.bpm || 120;
    const stepsPerBar = this.steps || 16;
    const beatsPerBar = this.barLength || 4;
    const stepDurationSec = (60 / bpm) * (beatsPerBar / stepsPerBar);

    // Offbeat: 2 segments (base → upper → base)
    // Downbeat: 3 segments (base → upper → base → upper → base)
    const numSegments = isOffbeat ? 2 : 3;
    const segmentDuration = stepDurationSec / numSegments;
    const holdPortion = segmentDuration * 0.25;  // 25% hold
    const slidePortion = segmentDuration * 0.70; // 70% slide

    let t = scheduledTime;

    // Segment 1: Base → Upper
    pitchBendParam.setValueAtTime(basePitchBend, t);
    t += holdPortion;
    pitchBendParam.linearRampToValueAtTime(basePitchBend + trillSemitones, t + slidePortion);
    t += slidePortion;

    // Segment 2: Upper → Base
    pitchBendParam.setValueAtTime(basePitchBend + trillSemitones, t);
    t += holdPortion;
    pitchBendParam.linearRampToValueAtTime(basePitchBend, t + slidePortion);
    t += slidePortion;

    // Segment 3 (downbeat only): Base → Upper
    if (!isOffbeat) {
      pitchBendParam.setValueAtTime(basePitchBend, t);
      t += holdPortion;
      pitchBendParam.linearRampToValueAtTime(basePitchBend + trillSemitones, t + slidePortion);
    }
  }
}
```

### Pattern 5: Voice Release with Cleanup

```javascript
releaseNote(note) {
  const midiNote = noteNameToMidi(note);
  const voice = this.voicePool.find(v => v.active && v.note === midiNote);

  if (!voice) return;

  // Send noteOff to processor
  this.nodes[voice.nodeIndex].port.postMessage({
    type: 'noteOff',
    note: midiNote
  });

  // Mark voice as releasing
  voice.active = false;
  voice.releasing = true;

  // Calculate release end time
  const releaseTime = this.getReleaseTime(); // e.g., 0.5 seconds
  voice.releaseEndTime = this.audioContext.currentTime + releaseTime;

  // Schedule cleanup (timer fallback)
  setTimeout(() => {
    voice.releasing = false;
    voice.voiceId = null;

    // Optional: cleanup per-voice modulation state
    this.cleanupVoiceModulationState(voice.nodeIndex);
  }, releaseTime * 1000);
}

// Optional: cleanup per-voice PPMod state
cleanupVoiceModulationState(voiceId) {
  // Remove per-voice modulation accumulators
  for (const [key] of this.phaseAccumulators.entries()) {
    if (key.startsWith(`${voiceId}:`)) {
      this.phaseAccumulators.delete(key);
    }
  }

  for (const [key] of this.sampleAndHoldValues.entries()) {
    if (key.startsWith(`${voiceId}:`)) {
      this.sampleAndHoldValues.delete(key);
    }
  }
}
```

### Pattern 6: FX Mode Switching (Clouds vs Classic)

```javascript
// Switch between Clouds (serial insert) and Classic (reverb/delay sends)
switchFxMode(newMode) {
  if (newMode === this.currentFxMode) return;

  // Disconnect all voices from current routing
  this.nodes.forEach(node => {
    node.disconnect();
  });

  if (newMode === 'clouds') {
    // Clouds: voices → Clouds input → master
    this.nodes.forEach(node => {
      node.connect(this.cloudsInputGain);
    });
    this.cloudsNode.connect(this.masterGain);
  } else {
    // Classic: voices → master + reverb/delay sends
    this.nodes.forEach(node => {
      node.connect(this.masterGain);
      node.connect(this.reverbSend);
      node.connect(this.delaySend);
    });
  }

  this.currentFxMode = newMode;
}
```

---

## Performance Considerations

### CPU Efficiency

**AudioWorklet Golden Rule:** Keep the audio thread lean. Avoid expensive JavaScript operations in `process()`.

#### ✅ Cheap Operations (Safe)
- Simple arithmetic: `+`, `-`, `*`, `/`
- Array access: `outputs[0][0][i]`
- Comparisons: `<`, `>`, `===`
- Loops (if bounded and predictable)
- Bitwise operations: `&`, `|`, `^`, `<<`, `>>`

#### ⚠️ Moderate Operations (Use Sparingly)
- `Math.sin()`, `Math.cos()` - OK if infrequent (e.g., LFO once per block)
- `Math.sqrt()`, `Math.abs()` - Generally fine
- `Math.max()`, `Math.min()` - Cheap, but prefer ternary for single comparisons

#### ❌ Expensive Operations (Avoid Per-Sample)
- `Math.exp()`, `Math.pow()`, `Math.log()` - Use lookup tables or AudioParam automation
- String operations - Never in `process()`
- Object allocation - Pre-allocate everything in constructor
- Function calls (if avoidable) - Inline critical DSP code
- Array allocation - Use pre-allocated buffers

### Example: Exponential Envelope (Good vs Bad)

```javascript
// ❌ BAD: Math.exp() per sample = 6,144 calls/block
updateEnvelope() {
  if (this.ampEnv.stage === 'decay') {
    const decayRate = Math.exp(-1 / (this.sampleRate * this.decayTime)); // SLOW!
    this.ampEnv.value *= decayRate;
  }
}

// ✅ GOOD: Pre-compute coefficient once per parameter change
handleMessage(data) {
  if (data.type === 'setEnvelope') {
    // Compute once, cache result
    this.decayCoeff = Math.exp(-1 / (this.sampleRate * data.decay));
  }
}

updateEnvelope() {
  if (this.ampEnv.stage === 'decay') {
    this.ampEnv.value *= this.decayCoeff; // Fast multiply
  }
}
```

### Memory Allocation

**Rule:** Never allocate in `process()`. Pre-allocate everything in the constructor.

```javascript
// ❌ BAD: Allocation per block (375 allocs/sec → GC pressure)
process(inputs, outputs, parameters) {
  const buffer = new Float32Array(128); // NEVER DO THIS
  // ... use buffer
}

// ✅ GOOD: Pre-allocate in constructor
constructor(options) {
  super();
  this.tempBuffer = new Float32Array(128); // Allocate once
}

process(inputs, outputs, parameters) {
  const buffer = this.tempBuffer; // Reuse
  buffer.fill(0); // Clear if needed
  // ... use buffer
}
```

### Block Size Assumptions

**Always assume 128-sample blocks.** While the spec allows variable block sizes, Web Audio implementations consistently use 128.

```javascript
// Safe assumption (spec-compliant)
const blockSize = channel0.length; // Always 128 in practice

// Even safer (defensive)
const blockSize = Math.min(channel0.length, 128);

// Pre-allocate buffers for 128 samples
constructor(options) {
  super();
  this.outBuffer = new Float32Array(128);
  this.auxBuffer = new Float32Array(128);
}
```

### K-Rate vs A-Rate Parameters

**K-rate** (control-rate) - single value per 128-sample block (~375 Hz at 48kHz)
**A-rate** (audio-rate) - per-sample array (48,000 Hz at 48kHz)

Use K-rate when possible to reduce interpolation overhead.

```javascript
static get parameterDescriptors() {
  return [
    // A-rate: needs per-sample precision (filter cutoff modulation)
    { name: 'filterCutoff', defaultValue: 1000, automationRate: 'a-rate' },

    // K-rate: block-rate is sufficient (LFO rate, envelope times)
    { name: 'lfoRate', defaultValue: 4, automationRate: 'k-rate' },
    { name: 'lpgDecay', defaultValue: 0.5, automationRate: 'k-rate' }
  ];
}

process(inputs, outputs, parameters) {
  // A-rate: check array length
  const cutoffValues = parameters.filterCutoff;
  const cutoff = cutoffValues.length === 1
    ? cutoffValues[0]   // Constant (not modulated)
    : cutoffValues[i];  // Modulated per-sample

  // K-rate: always single value
  const lfoRate = parameters.lfoRate[0]; // Always length 1
}
```

### Modulation Strategy: K-Rate from Main Thread

Per-parameter modulation (PPMod) in this project is **K-rate by design** - calculated on the main thread at 30 FPS using `requestAnimationFrame`, then applied via `AudioParam.setValueAtTime()`.

**Why not audio-rate in the processor?**
- Human perception of modulation changes: ~50ms (20 Hz)
- 30 FPS updates: ~33ms (perceptually indistinguishable from audio-rate)
- CPU savings: <1% measured overhead vs 10-20% for audio-rate LFO

```javascript
// Main thread: K-rate modulation loop (30 FPS)
function modulationLoop() {
  const now = audioContext.currentTime;

  // Calculate modulation value (LFO, envelope follower, random, etc.)
  const modValue = calculateLFOValue(now);

  // Apply via AudioParam (Web Audio interpolates smoothly)
  const baseValue = 1000;
  const depth = 0.5;
  const modulatedValue = baseValue * (1 + modValue * depth);

  cutoffParam.setValueAtTime(modulatedValue, now);

  requestAnimationFrame(modulationLoop); // ~30 FPS
}
```

**Avoid per-sample modulation in the processor:**

```javascript
// ❌ WRONG: Audio-rate modulation in worklet (CPU death)
process(inputs, outputs) {
  for (let i = 0; i < 128; i++) {
    // Recalculate LFO per sample = 6,144 calls/block
    const lfoPhase = this.lfoPhase + this.lfoRate / this.sampleRate;
    const lfoValue = Math.sin(2 * Math.PI * lfoPhase); // Expensive!
    this.frequency += lfoValue * this.lfoDepth;
    // ... generate audio
  }
}

// ✅ CORRECT: K-rate from main thread
// Main thread: Update frequency AudioParam at 30 FPS
requestAnimationFrame(() => {
  const lfoValue = Math.sin(2 * Math.PI * this.lfoPhase);
  const modulatedFreq = baseFreq * (1 + lfoValue * depth);
  freqParam.setValueAtTime(modulatedFreq, audioContext.currentTime);
  this.lfoPhase += this.lfoRate / 30; // 30 FPS update
});

// Processor: Just read the interpolated value
process(inputs, outputs, parameters) {
  const freq = parameters.frequency[0]; // Web Audio interpolates smoothly
  // ... use freq
}
```

### Cache Busting During Development

Browsers aggressively cache AudioWorklet modules. Always cache-bust during development.

```javascript
// ❌ BAD: Stale processor cached indefinitely
await audioContext.audioWorklet.addModule('voice-processor.js');

// ✅ GOOD: Cache-bust with timestamp
await audioContext.audioWorklet.addModule(
  `voice-processor.js?v=${Date.now()}`
);

// Production: Use build hash
await audioContext.audioWorklet.addModule(
  `voice-processor.js?v=${BUILD_HASH}`
);
```

---

## Related Documentation

- **[Architecture Overview](./architecture.md)** - System design, signal flow, engine overview
- **[CLAUDE.md (Project Root)](../../CLAUDE.md)** - Critical footguns, architecture decisions, codebase conventions
- **[Plaits Test Harness](../../tests/plaits-test/CLAUDE.md)** - 24-engine synthesis validation, engine audit status
- **[Rings Test Harness](../../tests/rings-test/CLAUDE.md)** - Physical modelling resonator, 6 models + Easter Egg

### Key Source Files

| Component | Path | Description |
|-----------|------|-------------|
| **Ræmbl Subtractive** | `js/raembl/audio/worklets/raembl-voice-processor.js` | 8-voice PolyBLEP oscillators, TPT filters, ADSR |
| **Ræmbl Voice Pool** | `js/raembl/audio/voice.js` | 8-voice allocation, release tracking, slide/trill |
| **Plaits Processor** | `tests/plaits-test/js/audio/worklets/plaits-processor.js` | 24 synthesis engines, LPG envelope |
| **Plaits Voice Pool** | `js/raembl/audio/plaits-voice-pool.js` | 8-voice allocation, engine switching, stealability |
| **Rings Processor** | `js/audio/worklets/rings-processor.bundle.js` | Physical modelling, 4 internal voices, 6 models |
| **Rings Voice Pool** | `js/raembl/audio/rings-voice-pool.js` | Single-node pool, message-based pitch, Easter Egg |
| **Clouds Processor** | `js/audio/worklets/clouds-processor.js` | Granular synthesis, 6 playback modes, 64 grains |
| **Drum Bus** | `js/audio/worklets/drum-bus-processor.js` | Master bus saturation, transient shaping, compression |

---

## Glossary

| Term | Definition |
|------|------------|
| **Voice** | Single playable note instance (oscillator + filter + envelope) |
| **Voice Pool** | Pre-allocated array of AudioWorkletNode instances for polyphony |
| **Active Voice** | Voice currently playing (gate high, envelope attacking/sustaining) |
| **Releasing Voice** | Voice in release phase (gate low, envelope decaying to zero) |
| **Voice Stealing** | Forcibly stopping an active voice to free it for a new note |
| **Quick Release** | Fast fade-out (~20ms) when stealing an active voice |
| **Stealability Score** | Metric for choosing which voice to steal (age, accent, velocity) |
| **Gate Signal** | AudioParam trigger (0 → 1 edge) for sample-accurate envelope timing |
| **Pending Params** | Note parameters queued in processor, applied when gate rises |
| **A-rate** | Audio-rate parameter (per-sample array, 48,000 values/sec) |
| **K-rate** | Control-rate parameter (per-block value, ~375 values/sec) |
| **PolyBLEP** | Polynomial Band-Limited Step - anti-aliasing for oscillators |
| **TPT Filter** | Topology-Preserving Transform - stable, zero-delay filter |
| **LPG** | Low Pass Gate - Buchla-style VCA/VCF combination |
| **PPMod** | Per-Parameter Modulation - LFO/ENV/RND applied to any parameter |
| **Slide/Glide** | Portamento - smooth pitch transition between notes |
| **Trill** | Pitch oscillation to next scale degree (TB-303 style) |
| **Drift** | Per-note random pitch offset (analogue instability simulation) |

---

**Last Updated:** 2025-12-30
**Maintainer:** MidiSlave
**Project:** Bæng & Ræmbl - Merged Web Audio Synthesiser Suite
