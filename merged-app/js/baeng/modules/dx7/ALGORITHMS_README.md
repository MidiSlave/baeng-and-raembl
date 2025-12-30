# DX7 Algorithms Documentation

## Overview

The Yamaha DX7 synthesizer features **32 algorithms** that define how its 6 operators are connected through FM (Frequency Modulation) synthesis. This document explains each algorithm and how to implement them using the Web Audio API.

## Fundamental Concepts

### Operators
- The DX7 has **6 operators** (numbered 1-6)
- Each operator is a sine wave oscillator
- Operators can be either **carriers** or **modulators**

### Carriers vs Modulators
- **Carriers**: Operators that produce audible output (connected to the audio output)
- **Modulators**: Operators that modulate the frequency of other operators (not directly audible)

### Signal Flow Rules
1. Operators are processed in **reverse order** (6 → 5 → 4 → 3 → 2 → 1)
2. Higher-numbered operators can **only modulate** lower-numbered operators
3. Multiple operators can be summed together (parallel processing)
4. Some algorithms support **feedback** (operator modulates itself)

## Algorithm Categories

### 1. Stacked Algorithms (Serial Modulation)
Operators connected in series, creating rich harmonic content.

**Examples**: Algorithms 1, 4, 5, 6, 7, 9, 11, 13, 14, 15, 30

**Algorithm 4** - Full 6-operator stack:
```
6 → 5 → 4 → 3 → 2 → 1 (output)
```
This creates the most complex FM timbres with deep modulation chains.

### 2. Branched Algorithms (Multiple Modulators)
Multiple operators modulating a single target, creating complex spectral combinations.

**Examples**: Algorithms 24, 25, 26, 27, 28, 29, 31

**Algorithm 29** - Five modulators to one carrier:
```
6 ─┐
5 ─┤
4 ─┼→ 1 (output)
3 ─┤
2 ─┘
```
Creates very bright, metallic timbres.

### 3. Rooted Algorithms (Multiple Carriers)
One or more modulators connected to multiple carriers, good for bell-like sounds.

**Examples**: Algorithms 19, 20, 21, 22

**Algorithm 22** - One modulator with four carriers:
```
6 → 5 (output)
    4 (output)
    3 (output)
    2 (output)
    1 (output)
```

### 4. Additive Algorithms (All Carriers)
All operators produce output with no FM modulation, pure additive synthesis.

**Examples**: Algorithms 23, 32

**Algorithm 32** - All independent carriers:
```
6 (output)
5 (output)
4 (output)
3 (output)
2 (output)
1 (output)
```

### 5. Hybrid Algorithms
Mix of stacked, branched, and carrier configurations.

**Examples**: Algorithms 2, 3, 8, 10, 12, 16, 17, 18

## Detailed Algorithm Specifications

### Algorithm 1: Two Parallel Stacks
- **Carriers**: 3, 1
- **Signal Flow**:
  - Stack 1: 6 → 5 → 4 → 3 (output)
  - Stack 2: 2 → 1 (output)
- **Use Case**: Classic DX7 electric piano sound

### Algorithm 4: Full Stack
- **Carriers**: 1
- **Signal Flow**: 6 → 5 → 4 → 3 → 2 → 1 (output)
- **Use Case**: Complex bass sounds, evolving pads

### Algorithm 5: Two Stacks (4-op + 2-op)
- **Carriers**: 3, 1
- **Signal Flow**: Same as Algorithm 1
- **Use Case**: Layered sounds, split timbres

### Algorithm 23: All Carriers (Additive)
- **Carriers**: 6, 5, 4, 3, 2, 1
- **Signal Flow**: All parallel to output
- **Use Case**: Organ sounds, additive synthesis

### Algorithm 32: All Independent Carriers
- **Carriers**: 6, 5, 4, 3, 2, 1
- **Signal Flow**: All parallel to output (identical to 23)
- **Use Case**: Organ tones, harmonic stacking

## Web Audio API Implementation

### Basic Usage

```javascript
const algorithms = require('./algorithms.js');

// Get algorithm configuration
const algo = algorithms.getAlgorithm(1);
console.log(algo);
// Output:
// {
//   carriers: [3, 1],
//   connections: [[6,5], [5,4], [4,3], [2,1]],
//   parallel: [[6,5,4,3], [2,1]],
//   feedback: null,
//   description: "Two stacks: 4-op and 2-op in parallel"
// }
```

### Creating Web Audio Connections

```javascript
// Create 6 oscillator nodes (operators)
const audioContext = new AudioContext();
const operators = [];

for (let i = 0; i < 6; i++) {
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  operators.push({ osc, gain, output: gain });
}

// Get routing for algorithm 1
const routing = algorithms.getWebAudioRouting(1);

// Connect modulators to their targets
routing.modulationConnections.forEach(([modulator, target]) => {
  // In Web Audio, FM is done by connecting to the frequency parameter
  const modIdx = modulator - 1; // Convert to 0-based index
  const targetIdx = target - 1;

  // Create a gain node for modulation index control
  const modGain = audioContext.createGain();
  modGain.gain.value = 100; // Modulation index

  operators[modIdx].output.connect(modGain);
  modGain.connect(operators[targetIdx].osc.frequency);
});

// Connect carriers to output
const masterGain = audioContext.createGain();
masterGain.connect(audioContext.destination);

routing.outputOperators.forEach(carrierNum => {
  const carrierIdx = carrierNum - 1;
  operators[carrierIdx].output.connect(masterGain);
});
```

### Helper Functions

```javascript
// Check if operator 3 is a carrier in algorithm 1
algorithms.isCarrier(1, 3); // true

// Get all carriers for algorithm 1
algorithms.getCarriers(1); // [3, 1]

// Get all modulators for algorithm 1
algorithms.getModulators(1); // [6, 5, 4, 2]

// Get what operator 5 modulates in algorithm 1
algorithms.getModulationTargets(1, 5); // [4]

// Get what modulates operator 4 in algorithm 1
algorithms.getModulationSources(1, 4); // [5]

// Get algorithm category
algorithms.getAlgorithmCategory(1); // "STACKED"
```

### Complete Voice Implementation Example

```javascript
class DX7Voice {
  constructor(audioContext, algorithmNumber) {
    this.ctx = audioContext;
    this.algorithmNumber = algorithmNumber;
    this.operators = [];

    // Create 6 operators
    for (let i = 0; i < 6; i++) {
      this.operators.push(this.createOperator());
    }

    // Setup routing based on algorithm
    this.setupRouting();
  }

  createOperator() {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const modGain = this.ctx.createGain();

    osc.type = 'sine';
    gain.gain.value = 1.0;
    modGain.gain.value = 0; // Modulation index

    osc.connect(gain);

    return {
      oscillator: osc,
      outputGain: gain,
      modulationGain: modGain,
      frequency: 440,
      ratio: 1.0
    };
  }

  setupRouting() {
    const routing = algorithms.getWebAudioRouting(this.algorithmNumber);

    // Connect FM modulation paths
    routing.modulationConnections.forEach(([modulator, target]) => {
      const modOp = this.operators[modulator - 1];
      const targetOp = this.operators[target - 1];

      // Connect modulator output through mod gain to target frequency
      modOp.outputGain.connect(modOp.modulationGain);
      modOp.modulationGain.connect(targetOp.oscillator.frequency);
    });

    // Create master output
    this.output = this.ctx.createGain();
    this.output.gain.value = 1.0 / routing.outputOperators.length; // Normalize

    // Connect carriers to output
    routing.outputOperators.forEach(carrierNum => {
      const carrier = this.operators[carrierNum - 1];
      carrier.outputGain.connect(this.output);
    });
  }

  setFrequency(freq) {
    this.operators.forEach((op, i) => {
      op.oscillator.frequency.value = freq * op.ratio;
    });
  }

  setOperatorRatio(operatorNum, ratio) {
    this.operators[operatorNum - 1].ratio = ratio;
  }

  setModulationIndex(operatorNum, index) {
    this.operators[operatorNum - 1].modulationGain.gain.value = index;
  }

  start(time) {
    this.operators.forEach(op => op.oscillator.start(time));
  }

  stop(time) {
    this.operators.forEach(op => op.oscillator.stop(time));
  }

  connect(destination) {
    this.output.connect(destination);
  }
}

// Usage
const voice = new DX7Voice(audioContext, 1); // Algorithm 1
voice.setFrequency(440); // A4
voice.setOperatorRatio(6, 2.0); // Operator 6 at 2x frequency
voice.setModulationIndex(6, 500); // Set modulation amount
voice.connect(audioContext.destination);
voice.start(audioContext.currentTime);
```

## Algorithm Selection Guide

### For Electric Piano Sounds
- **Algorithm 1, 5**: Two parallel stacks, classic EP sound
- **Algorithm 7**: Three-operator stack with carriers

### For Bass Sounds
- **Algorithm 4**: Full 6-operator stack for complex bass
- **Algorithm 6**: 5-operator stack with carrier

### For Pads
- **Algorithm 13, 14**: Two 3-operator stacks
- **Algorithm 23, 32**: All carriers for smooth pads

### For Bells and Metallic Sounds
- **Algorithm 25, 27, 29**: Multiple modulators to one carrier
- **Algorithm 28**: Four carriers modulating a stack

### For Organ Sounds
- **Algorithm 23, 32**: All carriers (additive synthesis)
- **Algorithm 20, 22**: Multiple carriers with minimal modulation

### For Brass
- **Algorithm 3**: Two stacks modulating one carrier
- **Algorithm 24**: Complex branching structure

## Technical Notes

### Modulation Index
The modulation index controls the amount of FM modulation:
- Low values (50-200): Subtle harmonic coloring
- Medium values (200-1000): Rich FM timbres
- High values (1000+): Extreme, inharmonic tones

### Frequency Ratios
Operator frequency ratios determine harmonic relationships:
- **Integer ratios** (1:1, 2:1, 3:1): Harmonic tones
- **Non-integer ratios** (1.41, 3.14): Inharmonic, bell-like tones

### Envelope Control
Each operator should have its own envelope (ADSR):
- **Modulator envelopes**: Control brightness over time
- **Carrier envelopes**: Control overall amplitude

### Performance Considerations
- Algorithm 32 (all carriers) uses least CPU
- Algorithm 4 (full stack) uses most CPU due to deep modulation chain
- Parallel stacks can be optimized using Web Audio's AudioWorklet

## References

- Original DX7 algorithms diagram: `/tmp/dx7-synth-js/algorithms.png`
- Yamaha DX7 Technical Documentation
- Web Audio API Specification: https://www.w3.org/TR/webaudio/
- FM Synthesis Theory: John Chowning, Stanford University (1973)

## License

This documentation and code are provided for educational and development purposes.
