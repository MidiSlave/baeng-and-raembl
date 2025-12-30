/**
 * DX7 Algorithm Routing Configuration
 *
 * The Yamaha DX7 features 32 algorithms that define how 6 operators are connected.
 * Operators are numbered 1-6, where:
 * - Operators at the bottom of the signal chain are CARRIERS (produce audible output)
 * - Operators above carriers are MODULATORS (modulate other operators)
 * - Operators are processed in reverse order (6 down to 1)
 * - Higher-numbered operators can only modulate lower-numbered operators
 *
 * Signal Flow Notation:
 * - carriers: Array of operator numbers that produce audio output
 * - connections: Array of modulation connections [modulator, target]
 * - parallel: Array of parallel stacks/branches that sum together
 * - feedback: Operator number that has self-feedback (if any)
 *
 * Reference: Based on DX7 algorithms diagram showing all 32 algorithm configurations
 */

const DX7_ALGORITHMS = {
  // Algorithm 1: 6->5->4->3 (stack 1) and 2->1 (stack 2)
  // Two parallel stacks
  1: {
    carriers: [3, 1],
    connections: [
      [6, 5],
      [5, 4],
      [4, 3],
      [2, 1]
    ],
    parallel: [[6, 5, 4, 3], [2, 1]],
    feedback: null,
    description: "Two stacks: 4-op and 2-op in parallel"
  },

  // Algorithm 2: 6->5->4->3 (stack 1), 2 and 1 are separate carriers
  2: {
    carriers: [3, 2, 1],
    connections: [
      [6, 5],
      [5, 4],
      [4, 3]
    ],
    parallel: [[6, 5, 4, 3], [2], [1]],
    feedback: null,
    description: "4-op stack with two independent carriers"
  },

  // Algorithm 3: 6->5->4, 3->2, both modulate 1
  3: {
    carriers: [1],
    connections: [
      [6, 5],
      [5, 4],
      [3, 2],
      [4, 1],
      [2, 1]
    ],
    parallel: [[6, 5, 4], [3, 2]],
    feedback: null,
    description: "Two stacks modulating one carrier"
  },

  // Algorithm 4: 6->5->4->3->2->1 (full stack)
  4: {
    carriers: [1],
    connections: [
      [6, 5],
      [5, 4],
      [4, 3],
      [3, 2],
      [2, 1]
    ],
    parallel: [[6, 5, 4, 3, 2, 1]],
    feedback: null,
    description: "Full 6-operator stack"
  },

  // Algorithm 5: 6->5->4->3, 2->1 (parallel stacks)
  5: {
    carriers: [3, 1],
    connections: [
      [6, 5],
      [5, 4],
      [4, 3],
      [2, 1]
    ],
    parallel: [[6, 5, 4, 3], [2, 1]],
    feedback: null,
    description: "4-op and 2-op stacks in parallel"
  },

  // Algorithm 6: 6->5->4->3->2 (stack), 1 separate carrier
  6: {
    carriers: [2, 1],
    connections: [
      [6, 5],
      [5, 4],
      [4, 3],
      [3, 2]
    ],
    parallel: [[6, 5, 4, 3, 2], [1]],
    feedback: null,
    description: "5-op stack with independent carrier"
  },

  // Algorithm 7: 6->5->4, 3->2, 1 separate - all are carriers
  7: {
    carriers: [4, 2, 1],
    connections: [
      [6, 5],
      [5, 4],
      [3, 2]
    ],
    parallel: [[6, 5, 4], [3, 2], [1]],
    feedback: null,
    description: "3-op stack, 2-op stack, and carrier"
  },

  // Algorithm 8: 6->5->4, 3, 2, 1 (3-op stack with 3 carriers)
  8: {
    carriers: [4, 3, 2, 1],
    connections: [
      [6, 5],
      [5, 4]
    ],
    parallel: [[6, 5, 4], [3], [2], [1]],
    feedback: null,
    description: "3-op stack with three independent carriers"
  },

  // Algorithm 9: 6->5, 4->3, 2->1 (three 2-op stacks)
  9: {
    carriers: [5, 3, 1],
    connections: [
      [6, 5],
      [4, 3],
      [2, 1]
    ],
    parallel: [[6, 5], [4, 3], [2, 1]],
    feedback: null,
    description: "Three 2-op stacks in parallel"
  },

  // Algorithm 10: 6->5, 4->3, 2, 1 (two 2-op stacks and two carriers)
  10: {
    carriers: [5, 3, 2, 1],
    connections: [
      [6, 5],
      [4, 3]
    ],
    parallel: [[6, 5], [4, 3], [2], [1]],
    feedback: null,
    description: "Two 2-op stacks with two carriers"
  },

  // Algorithm 11: 6->5->4, 3, 2->1
  11: {
    carriers: [4, 3, 1],
    connections: [
      [6, 5],
      [5, 4],
      [2, 1]
    ],
    parallel: [[6, 5, 4], [3], [2, 1]],
    feedback: null,
    description: "3-op stack, carrier, and 2-op stack"
  },

  // Algorithm 12: 6->5, 4, 3, 2->1
  12: {
    carriers: [5, 4, 3, 1],
    connections: [
      [6, 5],
      [2, 1]
    ],
    parallel: [[6, 5], [4], [3], [2, 1]],
    feedback: null,
    description: "2-op stack, two carriers, 2-op stack"
  },

  // Algorithm 13: 6->5->4, 3->2->1
  13: {
    carriers: [4, 1],
    connections: [
      [6, 5],
      [5, 4],
      [3, 2],
      [2, 1]
    ],
    parallel: [[6, 5, 4], [3, 2, 1]],
    feedback: null,
    description: "3-op and 3-op stacks in parallel"
  },

  // Algorithm 14: 6->5, 4->3->2->1
  14: {
    carriers: [5, 1],
    connections: [
      [6, 5],
      [4, 3],
      [3, 2],
      [2, 1]
    ],
    parallel: [[6, 5], [4, 3, 2, 1]],
    feedback: null,
    description: "2-op stack and 4-op stack"
  },

  // Algorithm 15: 6->5, 4, 3->2->1
  15: {
    carriers: [5, 4, 1],
    connections: [
      [6, 5],
      [3, 2],
      [2, 1]
    ],
    parallel: [[6, 5], [4], [3, 2, 1]],
    feedback: null,
    description: "2-op stack, carrier, 3-op stack"
  },

  // Algorithm 16: 6, 5, 4, 3->2->1
  16: {
    carriers: [6, 5, 4, 1],
    connections: [
      [3, 2],
      [2, 1]
    ],
    parallel: [[6], [5], [4], [3, 2, 1]],
    feedback: null,
    description: "Three carriers and 3-op stack"
  },

  // Algorithm 17: 6->5, 4->3, 2->1 (branch - 6&4&2 all modulate same targets)
  17: {
    carriers: [5, 3, 1],
    connections: [
      [6, 5],
      [4, 3],
      [2, 1]
    ],
    parallel: [[6, 5], [4, 3], [2, 1]],
    feedback: null,
    description: "Three 2-op stacks"
  },

  // Algorithm 18: 6, 5->4, 3->2, 1 (branch configuration)
  18: {
    carriers: [6, 4, 2, 1],
    connections: [
      [5, 4],
      [3, 2]
    ],
    parallel: [[6], [5, 4], [3, 2], [1]],
    feedback: null,
    description: "Carrier, two 2-op stacks, carrier"
  },

  // Algorithm 19: 6, 5, 4->3, 2->1 (rooting)
  19: {
    carriers: [6, 5, 3, 1],
    connections: [
      [4, 3],
      [2, 1]
    ],
    parallel: [[6], [5], [4, 3], [2, 1]],
    feedback: null,
    description: "Two carriers with two 2-op stacks"
  },

  // Algorithm 20: 6, 5, 4, 3, 2->1
  20: {
    carriers: [6, 5, 4, 3, 1],
    connections: [
      [2, 1]
    ],
    parallel: [[6], [5], [4], [3], [2, 1]],
    feedback: null,
    description: "Four carriers and one 2-op stack"
  },

  // Algorithm 21: 6, 5, 4, 3->2, 1
  21: {
    carriers: [6, 5, 4, 2, 1],
    connections: [
      [3, 2]
    ],
    parallel: [[6], [5], [4], [3, 2], [1]],
    feedback: null,
    description: "Three carriers, 2-op stack, carrier"
  },

  // Algorithm 22: 6->5, 4, 3, 2, 1 (one 2-op stack with 4 carriers)
  22: {
    carriers: [5, 4, 3, 2, 1],
    connections: [
      [6, 5]
    ],
    parallel: [[6, 5], [4], [3], [2], [1]],
    feedback: null,
    description: "One 2-op stack with four carriers"
  },

  // Algorithm 23: 6, 5, 4, 3, 2, 1 (all carriers)
  23: {
    carriers: [6, 5, 4, 3, 2, 1],
    connections: [],
    parallel: [[6], [5], [4], [3], [2], [1]],
    feedback: null,
    description: "All six operators as carriers"
  },

  // Algorithm 24: 6->5, 4->3, both modulate 2->1
  24: {
    carriers: [1],
    connections: [
      [6, 5],
      [4, 3],
      [5, 2],
      [3, 2],
      [2, 1]
    ],
    parallel: [[6, 5], [4, 3]],
    feedback: null,
    description: "Two 2-op stacks modulating a 2-op stack"
  },

  // Algorithm 25: 6->5, 4->3, 2 all modulate 1
  25: {
    carriers: [1],
    connections: [
      [6, 5],
      [4, 3],
      [5, 1],
      [3, 1],
      [2, 1]
    ],
    parallel: [[6, 5], [4, 3], [2]],
    feedback: null,
    description: "Three modulators to one carrier"
  },

  // Algorithm 26: 6->5, 4, 3, all modulate 2->1
  26: {
    carriers: [1],
    connections: [
      [6, 5],
      [5, 2],
      [4, 2],
      [3, 2],
      [2, 1]
    ],
    parallel: [[6, 5], [4], [3]],
    feedback: null,
    description: "Three modulators to 2-op stack"
  },

  // Algorithm 27: 6->5, 4, 3, 2 all modulate 1
  27: {
    carriers: [1],
    connections: [
      [6, 5],
      [5, 1],
      [4, 1],
      [3, 1],
      [2, 1]
    ],
    parallel: [[6, 5], [4], [3], [2]],
    feedback: null,
    description: "Four modulators to one carrier"
  },

  // Algorithm 28: 6, 5, 4, 3 all modulate 2->1
  28: {
    carriers: [1],
    connections: [
      [6, 2],
      [5, 2],
      [4, 2],
      [3, 2],
      [2, 1]
    ],
    parallel: [[6], [5], [4], [3]],
    feedback: null,
    description: "Four carriers modulating 2-op stack"
  },

  // Algorithm 29: 6, 5, 4, 3, 2 all modulate 1
  29: {
    carriers: [1],
    connections: [
      [6, 1],
      [5, 1],
      [4, 1],
      [3, 1],
      [2, 1]
    ],
    parallel: [[6], [5], [4], [3], [2]],
    feedback: null,
    description: "Five modulators to one carrier"
  },

  // Algorithm 30: 6->5->4 all modulate 3, 2->1
  30: {
    carriers: [3, 1],
    connections: [
      [6, 5],
      [5, 4],
      [4, 3],
      [2, 1]
    ],
    parallel: [[6, 5, 4, 3], [2, 1]],
    feedback: null,
    description: "4-op stack and 2-op stack"
  },

  // Algorithm 31: 6->5, 4->3, 2, all modulate 1
  31: {
    carriers: [1],
    connections: [
      [6, 5],
      [4, 3],
      [5, 1],
      [3, 1],
      [2, 1]
    ],
    parallel: [[6, 5], [4, 3], [2]],
    feedback: null,
    description: "Two 2-op stacks and modulator to carrier"
  },

  // Algorithm 32: 6, 5, 4, 3, 2, 1 (all independent carriers - classic additive)
  32: {
    carriers: [6, 5, 4, 3, 2, 1],
    connections: [],
    parallel: [[6], [5], [4], [3], [2], [1]],
    feedback: null,
    description: "All six operators as independent carriers"
  }
};

/**
 * Get the algorithm configuration for a given algorithm number
 * @param {number} algorithmNumber - Algorithm number (1-32)
 * @returns {object} Algorithm configuration
 */
function getAlgorithm(algorithmNumber) {
  if (algorithmNumber < 1 || algorithmNumber > 32) {
    throw new Error('Algorithm number must be between 1 and 32');
  }
  return DX7_ALGORITHMS[algorithmNumber];
}

/**
 * Get all carriers for a given algorithm
 * @param {number} algorithmNumber - Algorithm number (1-32)
 * @returns {number[]} Array of carrier operator numbers
 */
function getCarriers(algorithmNumber) {
  return getAlgorithm(algorithmNumber).carriers;
}

/**
 * Get all modulators for a given algorithm
 * @param {number} algorithmNumber - Algorithm number (1-32)
 * @returns {number[]} Array of modulator operator numbers
 */
function getModulators(algorithmNumber) {
  const algorithm = getAlgorithm(algorithmNumber);
  const carriers = new Set(algorithm.carriers);
  const modulators = [];

  for (let i = 1; i <= 6; i++) {
    if (!carriers.has(i)) {
      modulators.push(i);
    }
  }

  return modulators;
}

/**
 * Get the modulation routing for an operator
 * @param {number} algorithmNumber - Algorithm number (1-32)
 * @param {number} operatorNumber - Operator number (1-6)
 * @returns {number[]} Array of operator numbers that this operator modulates
 */
function getModulationTargets(algorithmNumber, operatorNumber) {
  const algorithm = getAlgorithm(algorithmNumber);
  return algorithm.connections
    .filter(conn => conn[0] === operatorNumber)
    .map(conn => conn[1]);
}

/**
 * Get the operators that modulate a given operator
 * @param {number} algorithmNumber - Algorithm number (1-32)
 * @param {number} operatorNumber - Operator number (1-6)
 * @returns {number[]} Array of operator numbers that modulate this operator
 */
function getModulationSources(algorithmNumber, operatorNumber) {
  const algorithm = getAlgorithm(algorithmNumber);
  return algorithm.connections
    .filter(conn => conn[1] === operatorNumber)
    .map(conn => conn[0]);
}

/**
 * Check if an operator is a carrier in the given algorithm
 * @param {number} algorithmNumber - Algorithm number (1-32)
 * @param {number} operatorNumber - Operator number (1-6)
 * @returns {boolean} True if operator is a carrier
 */
function isCarrier(algorithmNumber, operatorNumber) {
  return getAlgorithm(algorithmNumber).carriers.includes(operatorNumber);
}

/**
 * Get routing information for Web Audio API implementation
 * Returns an object describing how to connect oscillator nodes
 * @param {number} algorithmNumber - Algorithm number (1-32)
 * @returns {object} Routing configuration for Web Audio API
 */
function getWebAudioRouting(algorithmNumber) {
  const algorithm = getAlgorithm(algorithmNumber);

  return {
    // Which operators should be connected to output
    outputOperators: algorithm.carriers,

    // How to connect oscillators (FM modulation)
    // Each entry is [modulator_op, target_op]
    modulationConnections: algorithm.connections,

    // Groups of operators that can be processed in parallel
    parallelGroups: algorithm.parallel,

    // Feedback configuration (if any)
    feedback: algorithm.feedback,

    // Human-readable description
    description: algorithm.description
  };
}

/**
 * Algorithm categories based on structure
 */
const ALGORITHM_CATEGORIES = {
  STACKED: [1, 4, 5, 6, 7, 9, 11, 13, 14, 15, 30], // Serial modulation chains
  BRANCHED: [24, 25, 26, 27, 28, 29, 31], // Multiple modulators to one target
  ROOTED: [19, 20, 21, 22], // One modulator to multiple carriers
  ADDITIVE: [23, 32], // All carriers, no modulation
  HYBRID: [2, 3, 8, 10, 12, 16, 17, 18] // Mix of structures
};

/**
 * Get the category of an algorithm
 * @param {number} algorithmNumber - Algorithm number (1-32)
 * @returns {string} Algorithm category
 */
function getAlgorithmCategory(algorithmNumber) {
  for (const [category, algorithms] of Object.entries(ALGORITHM_CATEGORIES)) {
    if (algorithms.includes(algorithmNumber)) {
      return category;
    }
  }
  return 'UNKNOWN';
}

// Export for CommonJS (Node.js/Browserify style)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DX7_ALGORITHMS,
    getAlgorithm,
    getCarriers,
    getModulators,
    getModulationTargets,
    getModulationSources,
    isCarrier,
    getWebAudioRouting,
    getAlgorithmCategory,
    ALGORITHM_CATEGORIES
  };
}

// Export for ES6 modules
// export {
//   DX7_ALGORITHMS,
//   getAlgorithm,
//   getCarriers,
//   getModulators,
//   getModulationTargets,
//   getModulationSources,
//   isCarrier,
//   getWebAudioRouting,
//   getAlgorithmCategory,
//   ALGORITHM_CATEGORIES
// };
