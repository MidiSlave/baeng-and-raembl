/**
 * Web Audio API Implementation Example for DX7 Algorithms
 *
 * This file demonstrates how to use the algorithms.js module to create
 * a complete DX7-style FM synthesizer voice using the Web Audio API.
 */

// Import the algorithms module
const algorithms = require('./algorithms.js');

/**
 * DX7 Operator Class
 * Represents a single DX7 operator with Web Audio nodes
 */
class DX7Operator {
  constructor(audioContext, operatorNumber) {
    this.ctx = audioContext;
    this.operatorNumber = operatorNumber;

    // Create Web Audio nodes
    this.oscillator = this.ctx.createOscillator();
    this.oscillator.type = 'sine'; // DX7 uses sine waves

    // Output gain (amplitude control)
    this.outputGain = this.ctx.createGain();
    this.outputGain.gain.value = 1.0;

    // Modulation gain (controls FM modulation amount)
    this.modulationGain = this.ctx.createGain();
    this.modulationGain.gain.value = 0; // Start with no modulation

    // Connect oscillator to output gain
    this.oscillator.connect(this.outputGain);

    // For FM: oscillator output can also go through mod gain to other osc frequencies
    this.oscillator.connect(this.modulationGain);

    // Parameters
    this.baseFrequency = 440;
    this.frequencyRatio = 1.0;
    this.detune = 0;
    this.level = 1.0;
  }

  /**
   * Set the base frequency of the operator
   */
  setFrequency(freq) {
    this.baseFrequency = freq;
    this.updateFrequency();
  }

  /**
   * Set the frequency ratio (e.g., 1.0, 2.0, 3.5)
   */
  setRatio(ratio) {
    this.frequencyRatio = ratio;
    this.updateFrequency();
  }

  /**
   * Set detune in cents
   */
  setDetune(cents) {
    this.detune = cents;
    this.oscillator.detune.value = cents;
  }

  /**
   * Update the actual oscillator frequency
   */
  updateFrequency() {
    this.oscillator.frequency.setValueAtTime(
      this.baseFrequency * this.frequencyRatio,
      this.ctx.currentTime
    );
  }

  /**
   * Set the output level (0.0 to 1.0)
   */
  setLevel(level) {
    this.level = level;
    this.outputGain.gain.setValueAtTime(level, this.ctx.currentTime);
  }

  /**
   * Set the modulation index (amount of FM modulation this operator applies)
   */
  setModulationIndex(index) {
    this.modulationGain.gain.setValueAtTime(index, this.ctx.currentTime);
  }

  /**
   * Start the oscillator
   */
  start(time = this.ctx.currentTime) {
    this.oscillator.start(time);
  }

  /**
   * Stop the oscillator
   */
  stop(time = this.ctx.currentTime) {
    this.oscillator.stop(time);
  }

  /**
   * Clean up resources
   */
  dispose() {
    try {
      this.oscillator.stop();
    } catch (e) {
      // Oscillator may already be stopped
    }
    this.oscillator.disconnect();
    this.outputGain.disconnect();
    this.modulationGain.disconnect();
  }
}

/**
 * DX7 Voice Class
 * Represents a complete DX7 voice with 6 operators configured by an algorithm
 */
class DX7Voice {
  constructor(audioContext, algorithmNumber = 1) {
    this.ctx = audioContext;
    this.algorithmNumber = algorithmNumber;
    this.operators = [];
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3; // Start at moderate level

    // Create 6 operators
    for (let i = 1; i <= 6; i++) {
      this.operators.push(new DX7Operator(audioContext, i));
    }

    // Setup routing based on algorithm
    this.setupAlgorithm(algorithmNumber);
  }

  /**
   * Configure the voice to use a specific algorithm
   */
  setupAlgorithm(algorithmNumber) {
    this.algorithmNumber = algorithmNumber;

    // Disconnect everything first
    this.masterGain.disconnect();
    this.operators.forEach(op => {
      op.modulationGain.disconnect();
      op.outputGain.disconnect();
    });

    // Get routing configuration
    const routing = algorithms.getWebAudioRouting(algorithmNumber);

    // Connect FM modulation paths
    routing.modulationConnections.forEach(([modulatorNum, targetNum]) => {
      const modulator = this.operators[modulatorNum - 1];
      const target = this.operators[targetNum - 1];

      // Connect modulator's output (through modulation gain) to target's frequency
      modulator.modulationGain.connect(target.oscillator.frequency);
    });

    // Connect carriers to master output
    routing.outputOperators.forEach(carrierNum => {
      const carrier = this.operators[carrierNum - 1];
      carrier.outputGain.connect(this.masterGain);
    });

    console.log(`Algorithm ${algorithmNumber} configured: ${routing.description}`);
  }

  /**
   * Set the base frequency for all operators
   */
  setFrequency(freq) {
    this.operators.forEach(op => op.setFrequency(freq));
  }

  /**
   * Set the frequency ratio for a specific operator
   */
  setOperatorRatio(operatorNum, ratio) {
    if (operatorNum < 1 || operatorNum > 6) {
      throw new Error('Operator number must be 1-6');
    }
    this.operators[operatorNum - 1].setRatio(ratio);
  }

  /**
   * Set the level for a specific operator
   */
  setOperatorLevel(operatorNum, level) {
    if (operatorNum < 1 || operatorNum > 6) {
      throw new Error('Operator number must be 1-6');
    }
    this.operators[operatorNum - 1].setLevel(level);
  }

  /**
   * Set the modulation index for a specific operator
   */
  setOperatorModulation(operatorNum, index) {
    if (operatorNum < 1 || operatorNum > 6) {
      throw new Error('Operator number must be 1-6');
    }
    this.operators[operatorNum - 1].setModulationIndex(index);
  }

  /**
   * Set detune for a specific operator
   */
  setOperatorDetune(operatorNum, cents) {
    if (operatorNum < 1 || operatorNum > 6) {
      throw new Error('Operator number must be 1-6');
    }
    this.operators[operatorNum - 1].setDetune(cents);
  }

  /**
   * Set master output level
   */
  setMasterLevel(level) {
    this.masterGain.gain.setValueAtTime(level, this.ctx.currentTime);
  }

  /**
   * Connect the voice to a destination (usually audioContext.destination)
   */
  connect(destination) {
    this.masterGain.connect(destination);
  }

  /**
   * Start all operators
   */
  start(time = this.ctx.currentTime) {
    this.operators.forEach(op => op.start(time));
  }

  /**
   * Stop all operators
   */
  stop(time = this.ctx.currentTime) {
    this.operators.forEach(op => op.stop(time));
  }

  /**
   * Clean up all resources
   */
  dispose() {
    this.operators.forEach(op => op.dispose());
    this.masterGain.disconnect();
  }
}

/**
 * Preset factory functions for common DX7 sounds
 */
class DX7Presets {
  /**
   * Classic DX7 Electric Piano (Algorithm 1)
   */
  static electricPiano(voice) {
    voice.setupAlgorithm(1);

    // Stack 1: 6->5->4->3
    voice.setOperatorRatio(6, 14.0);
    voice.setOperatorRatio(5, 1.0);
    voice.setOperatorRatio(4, 1.0);
    voice.setOperatorRatio(3, 1.0);

    voice.setOperatorModulation(6, 300);
    voice.setOperatorModulation(5, 500);
    voice.setOperatorModulation(4, 400);

    voice.setOperatorLevel(6, 1.0);
    voice.setOperatorLevel(5, 0.8);
    voice.setOperatorLevel(4, 0.6);
    voice.setOperatorLevel(3, 1.0); // Carrier

    // Stack 2: 2->1
    voice.setOperatorRatio(2, 1.0);
    voice.setOperatorRatio(1, 1.0);

    voice.setOperatorModulation(2, 300);

    voice.setOperatorLevel(2, 0.8);
    voice.setOperatorLevel(1, 0.8); // Carrier

    voice.setMasterLevel(0.3);
  }

  /**
   * Deep FM Bass (Algorithm 4)
   */
  static fmBass(voice) {
    voice.setupAlgorithm(4);

    // Full stack: 6->5->4->3->2->1
    voice.setOperatorRatio(6, 1.0);
    voice.setOperatorRatio(5, 1.0);
    voice.setOperatorRatio(4, 1.0);
    voice.setOperatorRatio(3, 1.0);
    voice.setOperatorRatio(2, 0.5); // Sub-bass
    voice.setOperatorRatio(1, 1.0);

    voice.setOperatorModulation(6, 800);
    voice.setOperatorModulation(5, 1000);
    voice.setOperatorModulation(4, 800);
    voice.setOperatorModulation(3, 600);
    voice.setOperatorModulation(2, 400);

    voice.setOperatorLevel(6, 1.0);
    voice.setOperatorLevel(5, 0.9);
    voice.setOperatorLevel(4, 0.8);
    voice.setOperatorLevel(3, 0.7);
    voice.setOperatorLevel(2, 0.6);
    voice.setOperatorLevel(1, 1.0); // Carrier

    voice.setMasterLevel(0.4);
  }

  /**
   * Bright Bell (Algorithm 27)
   */
  static bell(voice) {
    voice.setupAlgorithm(27);

    // Four modulators to one carrier
    // Using non-harmonic ratios for bell-like sound
    voice.setOperatorRatio(6, 1.0);
    voice.setOperatorRatio(5, 2.73);
    voice.setOperatorRatio(4, 4.21);
    voice.setOperatorRatio(3, 6.84);
    voice.setOperatorRatio(2, 3.14);
    voice.setOperatorRatio(1, 1.0);

    voice.setOperatorModulation(6, 600);
    voice.setOperatorModulation(5, 800);
    voice.setOperatorModulation(4, 500);
    voice.setOperatorModulation(3, 400);
    voice.setOperatorModulation(2, 700);

    voice.setOperatorLevel(1, 1.0); // Single carrier

    voice.setMasterLevel(0.3);
  }

  /**
   * Organ Sound (Algorithm 32)
   */
  static organ(voice) {
    voice.setupAlgorithm(32);

    // All carriers (additive synthesis)
    // Drawbar-style harmonic series: 16', 8', 5⅓', 4', 2⅔', 2'
    voice.setOperatorRatio(6, 0.5); // 16' (sub-octave)
    voice.setOperatorRatio(5, 1.0); // 8' (fundamental)
    voice.setOperatorRatio(4, 1.5); // 5⅓' (fifth)
    voice.setOperatorRatio(3, 2.0); // 4' (octave)
    voice.setOperatorRatio(2, 3.0); // 2⅔' (twelfth)
    voice.setOperatorRatio(1, 4.0); // 2' (fifteenth)

    // Set drawbar levels
    voice.setOperatorLevel(6, 0.5);
    voice.setOperatorLevel(5, 0.8);
    voice.setOperatorLevel(4, 0.4);
    voice.setOperatorLevel(3, 0.6);
    voice.setOperatorLevel(2, 0.3);
    voice.setOperatorLevel(1, 0.2);

    // No modulation (pure additive)
    for (let i = 1; i <= 6; i++) {
      voice.setOperatorModulation(i, 0);
    }

    voice.setMasterLevel(0.4);
  }

  /**
   * Brass (Algorithm 28)
   */
  static brass(voice) {
    voice.setupAlgorithm(28);

    // Four carriers modulating a 2-op stack
    voice.setOperatorRatio(6, 1.0);
    voice.setOperatorRatio(5, 2.0);
    voice.setOperatorRatio(4, 3.0);
    voice.setOperatorRatio(3, 4.0);
    voice.setOperatorRatio(2, 1.0);
    voice.setOperatorRatio(1, 1.0);

    voice.setOperatorModulation(6, 400);
    voice.setOperatorModulation(5, 500);
    voice.setOperatorModulation(4, 400);
    voice.setOperatorModulation(3, 300);
    voice.setOperatorModulation(2, 800);

    voice.setOperatorLevel(6, 0.6);
    voice.setOperatorLevel(5, 0.7);
    voice.setOperatorLevel(4, 0.5);
    voice.setOperatorLevel(3, 0.4);
    voice.setOperatorLevel(2, 0.8);
    voice.setOperatorLevel(1, 1.0); // Carrier

    voice.setMasterLevel(0.35);
  }
}

/**
 * Example usage
 */
function example() {
  // Create audio context
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();

  // Create a voice with algorithm 1 (electric piano)
  const voice = new DX7Voice(audioContext, 1);

  // Apply electric piano preset
  DX7Presets.electricPiano(voice);

  // Set the note frequency (A4 = 440Hz)
  voice.setFrequency(440);

  // Connect to output
  voice.connect(audioContext.destination);

  // Play for 2 seconds
  const now = audioContext.currentTime;
  voice.start(now);
  voice.stop(now + 2.0);

  // Clean up after the sound finishes
  setTimeout(() => {
    voice.dispose();
  }, 2500);

  console.log('Playing electric piano sound...');
}

/**
 * Interactive example - play different algorithms
 */
function playAlgorithmComparison() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const frequency = 220; // A3

  // Play each algorithm type
  const demonstrations = [
    { algo: 1, name: 'Electric Piano', preset: DX7Presets.electricPiano },
    { algo: 4, name: 'FM Bass', preset: DX7Presets.fmBass },
    { algo: 27, name: 'Bell', preset: DX7Presets.bell },
    { algo: 32, name: 'Organ', preset: DX7Presets.organ },
    { algo: 28, name: 'Brass', preset: DX7Presets.brass }
  ];

  let currentTime = audioContext.currentTime;

  demonstrations.forEach((demo, index) => {
    setTimeout(() => {
      console.log(`Playing: ${demo.name} (Algorithm ${demo.algo})`);

      const voice = new DX7Voice(audioContext, demo.algo);
      demo.preset(voice);
      voice.setFrequency(frequency);
      voice.connect(audioContext.destination);

      const startTime = audioContext.currentTime;
      voice.start(startTime);
      voice.stop(startTime + 1.5);

      setTimeout(() => voice.dispose(), 2000);
    }, index * 2000);
  });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DX7Operator,
    DX7Voice,
    DX7Presets,
    example,
    playAlgorithmComparison
  };
}

// For browser usage
if (typeof window !== 'undefined') {
  window.DX7Voice = DX7Voice;
  window.DX7Presets = DX7Presets;
  window.playDX7Example = example;
  window.playAlgorithmComparison = playAlgorithmComparison;
}
