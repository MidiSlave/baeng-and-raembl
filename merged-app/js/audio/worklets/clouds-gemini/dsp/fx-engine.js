/**
 * FxEngine - Delay line infrastructure for effects
 * Ported from Mutable Instruments Clouds
 * ES Module version for AudioWorklet
 *
 * Provides circular buffer management and DSP operations for reverb/delay effects.
 */

import { CosineOscillator } from '../core/cosine-oscillator.js';
import { SoftLimit } from '../core/utils.js';

/**
 * Context - Accumulator-based DSP context for processing
 * Used within FxEngine.Start() blocks
 */
export class Context {
  constructor() {
    this.accumulator_ = 0.0;
    this.previous_read_ = 0.0;
    this.lfo_value_ = [0.0, 0.0];
    this.buffer_ = null;
    this.write_ptr_ = 0;
    this.size_ = 0;
  }

  /**
   * Load a value into the accumulator
   * @param {number} value - Value to load
   */
  Load(value) {
    // NaN/Infinity guard
    if (!isFinite(value)) {
      console.error('[Context] Load: Invalid value, using 0');
      this.accumulator_ = 0;
    } else {
      this.accumulator_ = value;
    }
  }

  /**
   * Read from delay line or add scaled value to accumulator
   * Overloaded: Read() or Read(value, scale) or Read(delay_line, offset, scale)
   */
  Read(arg1, arg2, arg3) {
    if (arg1 === undefined) {
      // Read() - return current accumulator value
      return this.accumulator_;
    } else if (typeof arg1 === 'number') {
      // Read(value, scale)
      const scale = arg2 !== undefined ? arg2 : 1.0;
      this.accumulator_ += arg1 * scale;
    } else {
      // Read(delay_line, offset, scale)
      let d = arg1;
      let offset = arg2;
      let scale = arg3;
      if (arg3 === undefined) {
        // Read(delay_line, scale) - offset defaults to 0
        offset = 0;
        scale = arg2;
      }

      let index;
      if (offset === -1) { // TAIL
        index = (this.write_ptr_ + d.base + d.length - 1) & (this.size_ - 1);
      } else {
        index = (this.write_ptr_ + d.base + offset) & (this.size_ - 1);
      }

      let r = this.buffer_[index];
      this.previous_read_ = r;
      this.accumulator_ += r * scale;
    }
  }

  /**
   * Write accumulator to delay line or return scaled value
   * Overloaded: Write(scale) or Write(delay_line, offset, scale)
   */
  Write(arg1, arg2, arg3) {
    if (typeof arg1 === 'object') {
      // Write(delay_line, offset, scale)
      let d = arg1;
      let offset = arg2;
      let scale = arg3;
      if (arg3 === undefined) {
        offset = 0;
        scale = arg2;
      }

      let index;
      if (offset === -1) {
        index = (this.write_ptr_ + d.base + d.length - 1) & (this.size_ - 1);
      } else {
        index = (this.write_ptr_ + d.base + offset) & (this.size_ - 1);
      }

      // NaN/Infinity guard - don't write bad values to delay line
      if (!isFinite(this.accumulator_)) {
        console.error('[Context] Write: Invalid accumulator, writing 0');
        this.buffer_[index] = 0;
        this.accumulator_ = 0;
      } else {
        // Hard clamp to prevent extreme values in delay line
        const clamped = Math.max(-10.0, Math.min(10.0, this.accumulator_));
        if (clamped !== this.accumulator_ && !this._clampWarned) {
          console.warn('[Context] Write: Clamping extreme value:', this.accumulator_);
          this._clampWarned = true;
        }
        this.buffer_[index] = clamped;
      }
      this.accumulator_ *= scale;
    } else {
      // Write(scale) -> returns accumulator value
      let val = this.accumulator_;
      // NaN/Infinity guard for scalar return
      if (!isFinite(val)) {
        val = 0;
        this.accumulator_ = 0;
      } else {
        this.accumulator_ *= arg1;
      }
      return val;
    }
  }

  /**
   * Write to delay line with allpass topology
   * Writes accumulator, multiplies by scale, adds previous read
   */
  WriteAllPass(d, offset, scale) {
    if (typeof scale === 'undefined') {
      scale = offset;
      offset = 0;
    }

    let index;
    if (offset === -1) {
      index = (this.write_ptr_ + d.base + d.length - 1) & (this.size_ - 1);
    } else {
      index = (this.write_ptr_ + d.base + offset) & (this.size_ - 1);
    }
    this.buffer_[index] = this.accumulator_;
    this.accumulator_ *= scale;
    this.accumulator_ += this.previous_read_;
  }

  /**
   * One-pole lowpass filter
   * @param {number} state - Current filter state
   * @param {number} coefficient - Filter coefficient
   * @returns {number} New state
   */
  Lp(state, coefficient) {
    let s = state + coefficient * (this.accumulator_ - state);
    this.accumulator_ = s;
    return s;
  }

  /**
   * One-pole highpass filter
   * @param {number} state - Current filter state
   * @param {number} coefficient - Filter coefficient
   * @returns {number} New state
   */
  Hp(state, coefficient) {
    let s = state + coefficient * (this.accumulator_ - state);
    this.accumulator_ -= s;
    return s;
  }

  /**
   * Apply soft limiting to accumulator
   * CRITICAL: Prevents feedback explosion!
   */
  SoftLimit() {
    this.accumulator_ = SoftLimit(this.accumulator_);
  }

  /**
   * Interpolated read from delay line with optional LFO modulation
   * Overloaded: Interpolate(d, offset, scale) or Interpolate(d, offset, lfo_value, lfo_amplitude, scale)
   */
  Interpolate(d, offset_value, arg3, arg4, arg5) {
    let offset = offset_value;
    let scale;

    if (arg5 === undefined) {
      // Interpolate(d, offset, scale)
      scale = arg3;
    } else {
      // Interpolate(d, offset, lfo_value, lfo_amplitude, scale)
      const lfo_value = arg3;
      const lfo_amplitude = arg4;
      offset += lfo_value * lfo_amplitude;
      scale = arg5;
    }

    let index_integral = Math.floor(offset);
    let index_fractional = offset - index_integral;

    let index = (this.write_ptr_ + d.base + index_integral) & (this.size_ - 1);
    let index_next = (index + 1) & (this.size_ - 1);

    let a = this.buffer_[index];
    let b = this.buffer_[index_next];
    let x = a + (b - a) * index_fractional;

    this.previous_read_ = x;
    this.accumulator_ += x * scale;
  }

  /**
   * Hermite-interpolated read from delay line
   * Higher quality than linear interpolation
   */
  InterpolateHermite(d, offset_value, arg3, arg4, arg5) {
    let offset = offset_value;
    let scale;

    if (arg5 === undefined) {
      scale = arg3;
    } else {
      const lfo_value = arg3;
      const lfo_amplitude = arg4;
      offset += lfo_value * lfo_amplitude;
      scale = arg5;
    }

    let index_integral = Math.floor(offset);
    let index_fractional = offset - index_integral;

    let base = this.write_ptr_ + d.base + index_integral;
    let size_mask = this.size_ - 1;

    let xm1 = this.buffer_[(base - 1) & size_mask];
    let x0 = this.buffer_[(base + 0) & size_mask];
    let x1 = this.buffer_[(base + 1) & size_mask];
    let x2 = this.buffer_[(base + 2) & size_mask];

    const c_val = (x1 - xm1) * 0.5;
    const v_val = x0 - x1;
    const w_val = c_val + v_val;
    const a_val = w_val + v_val + (x2 - x0) * 0.5;
    const b_neg = w_val + a_val;
    const t = index_fractional;
    let x = (((a_val * t) - b_neg) * t + c_val) * t + x0;

    // NaN/Infinity guard
    if (!isFinite(x)) {
      console.error('[Context] InterpolateHermite: Invalid result, using 0');
      x = 0;
    }

    this.previous_read_ = x;
    this.accumulator_ += x * scale;
  }
}

/**
 * DelayLine - Metadata wrapper for delay line allocation
 */
export class DelayLine {
  constructor(length) {
    this.length = length;
    this.base = 0; // Set by FxEngine during allocation
  }
}

/**
 * FxEngine - Main effects engine managing delay buffer and LFOs
 */
export class FxEngine {
  /**
   * Create FxEngine with specified buffer size
   * @param {number} size - Buffer size (must be power of 2)
   */
  constructor(size) {
    this.size_ = size;
    this.buffer_ = null;
    this.write_ptr_ = 0;
    this.lfo_ = [new CosineOscillator(), new CosineOscillator()];
    this.delay_lines_allocated = 0;
  }

  /**
   * Initialise with buffer
   * @param {Float32Array} buffer - Pre-allocated buffer
   */
  Init(buffer) {
    this.buffer_ = buffer;
    this.Clear();
    this.delay_lines_allocated = 0;
  }

  /**
   * Clear buffer (zero out)
   */
  Clear() {
    if (this.buffer_) this.buffer_.fill(0);
    this.write_ptr_ = 0;
  }

  /**
   * Set LFO frequency
   * @param {number} index - LFO index (0 or 1)
   * @param {number} frequency - Normalised frequency
   */
  SetLFOFrequency(index, frequency) {
    // Clouds multiplies by 32 internally
    this.lfo_[index].Init(frequency * 32.0);
  }

  /**
   * Start processing context for one sample
   * @param {Context} c - Context to initialise
   */
  Start(c) {
    this.write_ptr_--;
    if (this.write_ptr_ < 0) {
      this.write_ptr_ += this.size_;
    }
    c.accumulator_ = 0.0;
    c.previous_read_ = 0.0;
    c.buffer_ = this.buffer_;
    c.write_ptr_ = this.write_ptr_;
    c.size_ = this.size_;

    // Update LFOs every 32 samples for efficiency
    if ((this.write_ptr_ & 31) === 0) {
      c.lfo_value_[0] = this.lfo_[0].Next();
      c.lfo_value_[1] = this.lfo_[1].Next();
    } else {
      c.lfo_value_[0] = this.lfo_[0].value();
      c.lfo_value_[1] = this.lfo_[1].value();
    }
  }

  /**
   * Allocate a delay line from the buffer
   * @param {number} length - Delay length in samples
   * @returns {DelayLine} Allocated delay line
   */
  AllocateDelayLine(length) {
    const dl = new DelayLine(length);
    dl.base = this.delay_lines_allocated;
    this.delay_lines_allocated += length;
    if (this.delay_lines_allocated > this.size_) {
      console.warn('[FxEngine] Delay line memory exhausted!');
    }
    return dl;
  }
}
