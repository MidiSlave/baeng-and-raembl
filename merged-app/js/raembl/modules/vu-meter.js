/**
 * VU Meter class for input/output level display (dot column style)
 * Used by Clouds module for visual feedback
 */
export class VUMeter {
  constructor(inputContainerId, outputContainerId) {
    this.inputContainer = document.getElementById(inputContainerId);
    this.outputContainer = document.getElementById(outputContainerId);
    this.inputDots = this.inputContainer?.querySelectorAll('.vu-dot') || [];
    this.outputDots = this.outputContainer?.querySelectorAll('.vu-dot') || [];
    this.numDots = this.inputDots.length;

    this.inputLevel = 0;
    this.outputLevel = 0;

    // Decay rate for smooth falloff
    this.decay = 0.92;
  }

  /**
   * Update input level from RMS value
   * @param {number} rms - RMS level (0-1)
   */
  updateInput(rms) {
    const dbLevel = this.rmsToDisplay(rms);

    // Attack/release smoothing
    if (dbLevel > this.inputLevel) {
      this.inputLevel = dbLevel;
    } else {
      this.inputLevel *= this.decay;
    }

    this.updateDots(this.inputDots, this.inputLevel, rms > 0.95);
  }

  /**
   * Update output level from RMS value
   * @param {number} rms - RMS level (0-1)
   */
  updateOutput(rms) {
    const dbLevel = this.rmsToDisplay(rms);

    if (dbLevel > this.outputLevel) {
      this.outputLevel = dbLevel;
    } else {
      this.outputLevel *= this.decay;
    }

    this.updateDots(this.outputDots, this.outputLevel, rms > 0.95);
  }

  /**
   * Update dot column display
   * @param {NodeList} dots - Dot elements
   * @param {number} level - Level 0-1
   * @param {boolean} clipping - True if clipping
   */
  updateDots(dots, level, clipping) {
    const activeDots = Math.floor(level * this.numDots);

    dots.forEach((dot, i) => {
      const isActive = i < activeDots;
      dot.classList.toggle('active', isActive);

      // Top dot gets clip class when clipping
      if (i === this.numDots - 1 && clipping) {
        dot.classList.add('clip');
      } else {
        dot.classList.remove('clip');
      }
    });
  }

  /**
   * Convert RMS to display level (0-1)
   * Uses a quasi-logarithmic scale for better visual response
   */
  rmsToDisplay(rms) {
    if (rms <= 0) return 0;
    return Math.pow(rms, 0.5);
  }

  /**
   * Reset meters to zero
   */
  reset() {
    this.inputLevel = 0;
    this.outputLevel = 0;

    this.inputDots.forEach(dot => {
      dot.classList.remove('active', 'clip');
    });
    this.outputDots.forEach(dot => {
      dot.classList.remove('active', 'clip');
    });
  }
}
