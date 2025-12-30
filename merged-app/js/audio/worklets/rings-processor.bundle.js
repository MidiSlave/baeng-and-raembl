(() => {
  // js/audio/worklets/rings/core/units.js
  var lutPitchRatioHigh = null;
  var lutPitchRatioLow = null;
  function semitonesToRatio(semitones) {
    if (!lutPitchRatioHigh || !lutPitchRatioLow) {
      return Math.pow(2, semitones / 12);
    }
    const pitch = semitones + 128;
    const { integral, fractional } = makeIntegralFractional(pitch);
    const highIdx = Math.max(0, Math.min(256, integral));
    const lowIdx = Math.max(0, Math.min(255, Math.trunc(fractional * 256)));
    return lutPitchRatioHigh[highIdx] * lutPitchRatioLow[lowIdx];
  }
  var a3 = 440 / 48e3;

  // js/audio/worklets/rings/core/dsp.js
  function makeIntegralFractional(x) {
    const integral = Math.trunc(x);
    const fractional = x - integral;
    return { integral, fractional };
  }
  function interpolate(table, index, size) {
    index *= size;
    const { integral, fractional } = makeIntegralFractional(index);
    const a = table[integral];
    const b = table[integral + 1];
    return a + (b - a) * fractional;
  }
  function constrain(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }
  function crossfade(a, b, fade) {
    return a + (b - a) * fade;
  }
  function softLimit(x) {
    return x * (27 + x * x) / (27 + 9 * x * x);
  }
  function sqrt(x) {
    return Math.sqrt(x);
  }

  // js/audio/worklets/rings/core/svf.js
  var FilterMode = {
    LOW_PASS: 0,
    BAND_PASS: 1,
    BAND_PASS_NORMALIZED: 2,
    HIGH_PASS: 3
  };
  var SvfMode = FilterMode;
  var FrequencyApproximation = {
    EXACT: 0,
    ACCURATE: 1,
    FAST: 2,
    DIRTY: 3
  };
  var M_PI = Math.PI;
  var M_PI_POW_2 = M_PI * M_PI;
  var M_PI_POW_3 = M_PI_POW_2 * M_PI;
  var M_PI_POW_5 = M_PI_POW_3 * M_PI_POW_2;
  var M_PI_POW_7 = M_PI_POW_5 * M_PI_POW_2;
  var M_PI_POW_9 = M_PI_POW_7 * M_PI_POW_2;
  var M_PI_POW_11 = M_PI_POW_9 * M_PI_POW_2;
  function tanApprox(f, approximation = FrequencyApproximation.DIRTY) {
    if (approximation === FrequencyApproximation.EXACT) {
      f = f < 0.497 ? f : 0.497;
      return Math.tan(M_PI * f);
    } else if (approximation === FrequencyApproximation.DIRTY) {
      const a = 0.3736 * M_PI_POW_3;
      return f * (M_PI + a * f * f);
    } else if (approximation === FrequencyApproximation.FAST) {
      const a = 0.326 * M_PI_POW_3;
      const b = 0.1823 * M_PI_POW_5;
      const f2 = f * f;
      return f * (M_PI + f2 * (a + b * f2));
    } else if (approximation === FrequencyApproximation.ACCURATE) {
      const a = 0.3333314036 * M_PI_POW_3;
      const b = 0.1333923995 * M_PI_POW_5;
      const c = 0.0533740603 * M_PI_POW_7;
      const d = 2900525e-9 * M_PI_POW_9;
      const e = 0.0095168091 * M_PI_POW_11;
      const f2 = f * f;
      return f * (M_PI + f2 * (a + f2 * (b + f2 * (c + f2 * (d + f2 * e)))));
    }
    return f * M_PI;
  }
  var Svf = class {
    constructor() {
      this.g = 0;
      this.r = 0;
      this.h = 1;
      this.state1 = 0;
      this.state2 = 0;
    }
    init() {
      this.setFQ(0.01, 100, FrequencyApproximation.DIRTY);
      this.reset();
    }
    reset() {
      this.state1 = 0;
      this.state2 = 0;
    }
    /**
     * Copy settings from another SVF
     */
    set(other) {
      this.g = other.g;
      this.r = other.r;
      this.h = other.h;
    }
    /**
     * Set all parameters from precomputed values (LUT)
     */
    setGRH(g, r, h) {
      this.g = g;
      this.r = r;
      this.h = h;
    }
    /**
     * Set frequency and resonance coefficients from LUT
     */
    setGR(g, r) {
      this.g = g;
      this.r = r;
      this.h = 1 / (1 + this.r * this.g + this.g * this.g);
    }
    /**
     * Set frequency from LUT, resonance in true units
     */
    setGQ(g, resonance) {
      this.g = g;
      this.r = 1 / resonance;
      this.h = 1 / (1 + this.r * this.g + this.g * this.g);
    }
    /**
     * Set frequency and resonance from true units
     */
    setFQ(f, resonance, approximation = FrequencyApproximation.DIRTY) {
      this.g = tanApprox(f, approximation);
      this.r = 1 / resonance;
      this.h = 1 / (1 + this.r * this.g + this.g * this.g);
    }
    /**
     * Process single sample
     */
    process(input, mode = FilterMode.LOW_PASS) {
      const hp = (input - this.r * this.state1 - this.g * this.state1 - this.state2) * this.h;
      const bp = this.g * hp + this.state1;
      this.state1 = this.g * hp + bp;
      const lp = this.g * bp + this.state2;
      this.state2 = this.g * bp + lp;
      switch (mode) {
        case FilterMode.LOW_PASS:
          return lp;
        case FilterMode.BAND_PASS:
          return bp;
        case FilterMode.BAND_PASS_NORMALIZED:
          return bp * this.r;
        case FilterMode.HIGH_PASS:
          return hp;
        default:
          return lp;
      }
    }
    /**
     * Process and return multiple outputs
     */
    processMulti(input) {
      const hp = (input - this.r * this.state1 - this.g * this.state1 - this.state2) * this.h;
      const bp = this.g * hp + this.state1;
      this.state1 = this.g * hp + bp;
      const lp = this.g * bp + this.state2;
      this.state2 = this.g * bp + lp;
      return { lp, bp, hp, bpNorm: bp * this.r };
    }
    /**
     * Process block and add to output with gain
     */
    processBlockAdd(input, output, size, mode, gain) {
      let state1 = this.state1;
      let state2 = this.state2;
      for (let i = 0; i < size; i++) {
        const hp = (input[i] - this.r * state1 - this.g * state1 - state2) * this.h;
        const bp = this.g * hp + state1;
        state1 = this.g * hp + bp;
        const lp = this.g * bp + state2;
        state2 = this.g * bp + lp;
        let value;
        switch (mode) {
          case FilterMode.LOW_PASS:
            value = lp;
            break;
          case FilterMode.BAND_PASS:
            value = bp;
            break;
          case FilterMode.BAND_PASS_NORMALIZED:
            value = bp * this.r;
            break;
          case FilterMode.HIGH_PASS:
            value = hp;
            break;
          default:
            value = lp;
        }
        output[i] += gain * value;
      }
      this.state1 = state1;
      this.state2 = state2;
    }
    /**
     * Process multimode filter (morphable LP -> BP -> HP)
     */
    processMultimode(input, output, size, mode) {
      let state1 = this.state1;
      let state2 = this.state2;
      const hpGain = mode < 0.5 ? -mode * 2 : -2 + mode * 2;
      const lpGain = mode < 0.5 ? 1 - mode * 2 : 0;
      const bpGain = mode < 0.5 ? 0 : mode * 2 - 1;
      for (let i = 0; i < size; i++) {
        const hp = (input[i] - this.r * state1 - this.g * state1 - state2) * this.h;
        const bp = this.g * hp + state1;
        state1 = this.g * hp + bp;
        const lp = this.g * bp + state2;
        state2 = this.g * bp + lp;
        output[i] = hpGain * hp + bpGain * bp + lpGain * lp;
      }
      this.state1 = state1;
      this.state2 = state2;
    }
    /**
     * Process buffer in-place (alias: processBlock)
     */
    processBlock(input, output, size, mode = FilterMode.LOW_PASS) {
      this.processBuffer(input, output, size, mode);
    }
    /**
     * Process buffer in-place
     */
    processBuffer(input, output, size, mode = FilterMode.LOW_PASS) {
      let state1 = this.state1;
      let state2 = this.state2;
      for (let i = 0; i < size; i++) {
        const hp = (input[i] - this.r * state1 - this.g * state1 - state2) * this.h;
        const bp = this.g * hp + state1;
        state1 = this.g * hp + bp;
        const lp = this.g * bp + state2;
        state2 = this.g * bp + lp;
        switch (mode) {
          case FilterMode.LOW_PASS:
            output[i] = lp;
            break;
          case FilterMode.BAND_PASS:
            output[i] = bp;
            break;
          case FilterMode.BAND_PASS_NORMALIZED:
            output[i] = bp * this.r;
            break;
          case FilterMode.HIGH_PASS:
            output[i] = hp;
            break;
          default:
            output[i] = lp;
        }
      }
      this.state1 = state1;
      this.state2 = state2;
    }
    getG() {
      return this.g;
    }
    getR() {
      return this.r;
    }
    getH() {
      return this.h;
    }
  };

  // js/audio/worklets/rings/core/dc-blocker.js
  var DCBlocker = class {
    /**
     * @param {number} pole - Filter pole (default 0.995 for ~35Hz cutoff at 48kHz)
     */
    constructor(pole = 0.995) {
      this.pole = pole;
      this.x = 0;
      this.y = 0;
    }
    /**
     * Initialize/reset the blocker
     * @param {number} pole - Filter pole (optional, keeps current if not specified)
     */
    init(pole) {
      if (pole !== void 0) {
        this.pole = pole;
      }
      this.x = 0;
      this.y = 0;
    }
    /**
     * Reset state to zero
     */
    reset() {
      this.x = 0;
      this.y = 0;
    }
    /**
     * Process single sample
     * @param {number} input - Input sample
     * @returns {number} Output sample with DC removed
     */
    process(input) {
      const oldX = this.x;
      this.x = input;
      this.y = this.y * this.pole + this.x - oldX;
      return this.y;
    }
    /**
     * Process a block of samples in-place
     * @param {Float32Array} buffer - Audio buffer to process
     * @param {number} size - Number of samples to process
     */
    processBlock(buffer, size) {
      let x = this.x;
      let y = this.y;
      const pole = this.pole;
      for (let i = 0; i < size; i++) {
        const oldX = x;
        x = buffer[i];
        y = y * pole + x - oldX;
        buffer[i] = y;
      }
      this.x = x;
      this.y = y;
    }
    /**
     * Process a block from input to output buffer
     * @param {Float32Array} input - Input buffer
     * @param {Float32Array} output - Output buffer
     * @param {number} size - Number of samples to process
     */
    processBlockSeparate(input, output, size) {
      let x = this.x;
      let y = this.y;
      const pole = this.pole;
      for (let i = 0; i < size; i++) {
        const oldX = x;
        x = input[i];
        y = y * pole + x - oldX;
        output[i] = y;
      }
      this.x = x;
      this.y = y;
    }
    /**
     * Set the pole value
     * Higher values = lower cutoff frequency
     * 0.995 ≈ 35Hz at 48kHz
     * 0.999 ≈ 7Hz at 48kHz
     * @param {number} pole - New pole value (0-1)
     */
    setPole(pole) {
      this.pole = pole;
    }
    /**
     * Set cutoff frequency
     * @param {number} frequency - Cutoff frequency in Hz
     * @param {number} sampleRate - Sample rate (default 48000)
     */
    setCutoff(frequency, sampleRate = 48e3) {
      this.pole = Math.exp(-2 * Math.PI * frequency / sampleRate);
    }
  };

  // js/audio/worklets/rings/core/delay-line.js
  var DelayLine = class {
    /**
     * @param {number} maxDelay - Maximum delay in samples
     */
    constructor(maxDelay) {
      this.maxDelay = maxDelay;
      this.line = new Float32Array(maxDelay);
      this.writePtr = 0;
      this.delay = 1;
    }
    init() {
      this.reset();
    }
    reset() {
      this.line.fill(0);
      this.writePtr = 0;
      this.delay = 1;
    }
    setDelay(delay) {
      this.delay = delay;
    }
    /**
     * Write a sample to the delay line
     * C++: Write(sample)
     */
    write(sample) {
      this.line[this.writePtr] = sample;
      this.writePtr = (this.writePtr - 1 + this.maxDelay) % this.maxDelay;
    }
    /**
     * Allpass filter embedded in delay line
     * C++: Allpass(sample, delay, coefficient)
     * Note: delay is truncated to integer (C++ uses size_t)
     */
    allpass(sample, delay, coefficient) {
      const intDelay = Math.trunc(delay);
      const read = this.line[(this.writePtr + intDelay) % this.maxDelay];
      const write = sample + coefficient * read;
      this.write(write);
      return -write * coefficient + read;
    }
    /**
     * Write sample and return delayed output
     * C++: WriteRead(sample, delay)
     */
    writeRead(sample, delay) {
      this.write(sample);
      return this.readFloat(delay);
    }
    /**
     * Read at fixed delay (integer)
     * C++: Read() const
     */
    read() {
      return this.line[(this.writePtr + this.delay) % this.maxDelay];
    }
    /**
     * Read at specified integer delay
     * C++: Read(size_t delay) const
     * Note: delay is truncated to integer (C++ uses size_t)
     */
    readInt(delay) {
      const intDelay = Math.trunc(delay);
      return this.line[(this.writePtr + intDelay) % this.maxDelay];
    }
    /**
     * Read with linear interpolation
     * C++: Read(float delay) const
     */
    readFloat(delay) {
      const integral = Math.trunc(delay);
      const fractional = delay - integral;
      const a = this.line[(this.writePtr + integral) % this.maxDelay];
      const b = this.line[(this.writePtr + integral + 1) % this.maxDelay];
      return a + (b - a) * fractional;
    }
    /**
     * Read with Hermite (4-point cubic) interpolation
     * C++: ReadHermite(float delay) const
     * Critical for high-quality pitch shifting and string synthesis
     */
    readHermite(delay) {
      const integral = Math.trunc(delay);
      const fractional = delay - integral;
      const t = this.writePtr + integral + this.maxDelay;
      const xm1 = this.line[(t - 1) % this.maxDelay];
      const x0 = this.line[t % this.maxDelay];
      const x1 = this.line[(t + 1) % this.maxDelay];
      const x2 = this.line[(t + 2) % this.maxDelay];
      const c = (x1 - xm1) * 0.5;
      const v = x0 - x1;
      const w = c + v;
      const a = w + v + (x2 - x0) * 0.5;
      const bNeg = w + a;
      const f = fractional;
      return ((a * f - bNeg) * f + c) * f + x0;
    }
    /**
     * Get raw access to buffer at index
     */
    at(index) {
      return this.line[(this.writePtr + index) % this.maxDelay];
    }
    /**
     * Set value at index
     */
    setAt(index, value) {
      this.line[(this.writePtr + index) % this.maxDelay] = value;
    }
  };

  // js/audio/worklets/rings/core/cosine-oscillator.js
  var M_PI2 = Math.PI;
  var CosineOscillatorMode = {
    APPROXIMATE: 0,
    EXACT: 1
  };
  var CosineOscillator = class {
    constructor() {
      this.y0 = 0;
      this.y1 = 0;
      this.iirCoefficient = 0;
      this.initialAmplitude = 0;
    }
    /**
     * Initialize with frequency (normalised to sample rate)
     * @param {number} frequency - Normalised frequency (0-0.5)
     * @param {number} mode - APPROXIMATE or EXACT
     */
    init(frequency, mode = CosineOscillatorMode.APPROXIMATE) {
      if (mode === CosineOscillatorMode.APPROXIMATE) {
        this.initApproximate(frequency);
      } else {
        this.iirCoefficient = 2 * Math.cos(2 * M_PI2 * frequency);
        this.initialAmplitude = this.iirCoefficient * 0.25;
      }
      this.start();
    }
    /**
     * Approximate initialization (faster, good for low frequencies)
     * C++: InitApproximate(frequency)
     */
    initApproximate(frequency) {
      let sign = 16;
      frequency -= 0.25;
      if (frequency < 0) {
        frequency = -frequency;
      } else {
        if (frequency > 0.5) {
          frequency -= 0.5;
        } else {
          sign = -16;
        }
      }
      this.iirCoefficient = sign * frequency * (1 - 2 * frequency);
      this.initialAmplitude = this.iirCoefficient * 0.25;
    }
    /**
     * Reset oscillator to initial state
     */
    start() {
      this.y1 = this.initialAmplitude;
      this.y0 = 0.5;
    }
    /**
     * Get current value (0.0 to 1.0)
     */
    value() {
      return this.y1 + 0.5;
    }
    /**
     * Generate next sample and return value (0.0 to 1.0)
     */
    next() {
      const temp = this.y0;
      this.y0 = this.iirCoefficient * this.y0 - this.y1;
      this.y1 = temp;
      return temp + 0.5;
    }
  };

  // js/audio/worklets/rings/core/parameter-interp.js
  var ParameterInterpolator = class _ParameterInterpolator {
    /**
     * Create interpolator
     * @param {number} currentValue - Current parameter value
     * @param {number} newValue - Target parameter value
     * @param {number} size - Number of samples to interpolate over
     */
    constructor(currentValue, newValue, size) {
      this.value = currentValue;
      this.increment = (newValue - currentValue) / size;
      this.targetValue = newValue;
    }
    /**
     * Alternative constructor with step size instead of sample count
     * @param {number} currentValue - Current parameter value
     * @param {number} newValue - Target parameter value
     * @param {number} step - Step multiplier (1/size)
     */
    static withStep(currentValue, newValue, step) {
      const interp = new _ParameterInterpolator(currentValue, newValue, 1);
      interp.value = currentValue;
      interp.increment = (newValue - currentValue) * step;
      interp.targetValue = newValue;
      return interp;
    }
    /**
     * Get next interpolated value
     */
    next() {
      this.value += this.increment;
      return this.value;
    }
    /**
     * Get subsample value at fractional position t
     * @param {number} t - Fractional position (0-1)
     */
    subsample(t) {
      return this.value + this.increment * t;
    }
    /**
     * Get current value without advancing
     */
    current() {
      return this.value;
    }
    /**
     * Get final target value
     */
    target() {
      return this.targetValue;
    }
    /**
     * Finish interpolation and return final value
     * Call this at the end of your render block to get the value
     * that should be stored as the new "current" value
     */
    finish() {
      return this.value;
    }
  };

  // js/audio/worklets/rings/core/random.js
  var Random = class {
    /**
     * @param {number} seed - Initial seed (optional, defaults to 0x12345678)
     */
    constructor(seed = 305419896) {
      this.state = seed >>> 0;
    }
    /**
     * Seed the generator
     * @param {number} seed - New seed value
     */
    seed(seed) {
      this.state = seed >>> 0;
    }
    /**
     * Get next 32-bit random value
     * C++: GetWord()
     */
    getWord() {
      this.state = this.state * 1664525 + 1013904223 >>> 0;
      return this.state;
    }
    /**
     * Get random float in range [0, 1)
     * C++: GetFloat()
     */
    getFloat() {
      return this.getWord() / 4294967296;
    }
    /**
     * Get random sample in range [-1, 1)
     * Useful for noise generation
     */
    getSample() {
      return this.getWord() / 2147483648 - 1;
    }
    /**
     * Get random integer in range [0, max)
     * @param {number} max - Upper bound (exclusive)
     */
    getInt(max) {
      return Math.floor(this.getFloat() * max);
    }
    /**
     * Get random float in range [min, max)
     * @param {number} min - Lower bound (inclusive)
     * @param {number} max - Upper bound (exclusive)
     */
    getRange(min, max) {
      return min + this.getFloat() * (max - min);
    }
    /**
     * Generate Gaussian-distributed random number using Box-Muller
     * @param {number} mean - Mean of distribution
     * @param {number} stddev - Standard deviation
     */
    getGaussian(mean = 0, stddev = 1) {
      const u1 = this.getFloat();
      const u2 = this.getFloat();
      const z0 = Math.sqrt(-2 * Math.log(u1 + 1e-20)) * Math.cos(2 * Math.PI * u2);
      return mean + z0 * stddev;
    }
  };
  var globalRandom = new Random();

  // js/audio/worklets/rings/resources/lut-sine.js
  function generateSineTable() {
    const size = 5121;
    const table = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const phase = i * Math.PI / 2048;
      table[i] = Math.sin(phase);
    }
    return table;
  }
  var lutSine = generateSineTable();
  var LUT_SINE_SIZE = 5121;

  // js/audio/worklets/rings/resources/lut-4-decades.js
  function generate4DecadesTable() {
    const size = 257;
    const table = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      table[i] = Math.pow(10, i / 256 * 4);
    }
    return table;
  }
  var lut4Decades = generate4DecadesTable();
  var LUT_4_DECADES_SIZE = 257;

  // js/audio/worklets/rings/resources/lut-svf-shift.js
  var lutSvfShift = new Float32Array([
    0.25,
    0.2408119579,
    0.2316544611,
    0.2225575501,
    0.2135502761,
    0.2046602549,
    0.195913276,
    0.1873329789,
    0.1789406032,
    0.1707548172,
    0.1627916233,
    0.1550643347,
    0.1475836177,
    0.1403575876,
    0.1333919506,
    0.1266901772,
    0.1202537001,
    0.1140821254,
    0.108173448,
    0.1025242668,
    0.09712999179,
    0.09198504051,
    0.08708302003,
    0.0824168936,
    0.07797913038,
    0.07376183852,
    0.06975688172,
    0.06595598018,
    0.06235079694,
    0.05893301078,
    0.05569437701,
    0.05262677742,
    0.04972226058,
    0.04697307381,
    0.04437168789,
    0.04191081545,
    0.03958342416,
    0.03738274529,
    0.03530227864,
    0.03333579426,
    0.03147733169,
    0.02972119704,
    0.02806195849,
    0.02649444041,
    0.02501371653,
    0.0236151023,
    0.02229414676,
    0.02104662398,
    0.01986852431,
    0.0187560455,
    0.01770558386,
    0.01671372543,
    0.01577723728,
    0.01489305906,
    0.01405829467,
    0.01327020425,
    0.01252619642,
    0.01182382076,
    0.0111607606,
    0.01053482614,
    0.009943947824,
    0.009386169992,
    0.008859644866,
    0.008362626781,
    0.007893466717,
    0.007450607078,
    0.007032576744,
    0.006637986365,
    0.006265523903,
    0.005913950392,
    0.005582095932,
    0.005268855886,
    0.004973187279,
    0.004694105394,
    0.004430680542,
    0.004182035018,
    0.003947340207,
    0.003725813861,
    0.003516717519,
    0.003319354065,
    0.003133065427,
    0.002957230396,
    0.002791262569,
    0.002634608406,
    0.002486745394,
    0.002347180309,
    0.002215447582,
    0.002091107747,
    0.001973745986,
    0.00186297074,
    0.001758412418,
    0.001659722154,
    0.001566570656,
    0.001478647104,
    0.001395658114,
    0.001317326764,
    0.001243391669,
    0.001173606108,
    0.001107737206,
    0.001045565155,
    9868824789e-13,
    9314933471e-13,
    8792129165e-13,
    8298667176e-13,
    7832900713e-13,
    7393275405e-13,
    697832411e-12,
    6586662024e-13,
    6216982059e-13,
    5868050482e-13,
    55387028e-11,
    5227839874e-13,
    4934424252e-13,
    4657476707e-13,
    4396072968e-13,
    4149340639e-13,
    3916456285e-13,
    3696642688e-13,
    3489166247e-13,
    3293334538e-13,
    3108493994e-13,
    2934027734e-13,
    2769353496e-13,
    26139217e-11,
    2467213608e-13,
    23287396e-11,
    2198037532e-13,
    2074671201e-13,
    1958228884e-13,
    1848321967e-13,
    1744583648e-13,
    1646667709e-13,
    1554247368e-13,
    1467014179e-13,
    138467701e-12,
    130696107e-12,
    1233606989e-13,
    1164369956e-13,
    1099018897e-13,
    103733571e-12,
    9791145345e-14,
    9241610615e-14,
    8722918894e-14,
    8233339098e-14,
    7771237301e-14,
    7335071282e-14,
    6923385378e-14,
    6534805627e-14,
    6168035179e-14,
    5821849973e-14,
    5495094649e-14,
    518667869e-13,
    4895572788e-14,
    4620805405e-14,
    4361459529e-14,
    4116669618e-14,
    3885618709e-14,
    366753569e-13,
    346169273e-13,
    3267402848e-14,
    3084017618e-14,
    2910925011e-14,
    2747547345e-14,
    2593339362e-14,
    2447786409e-14,
    2310402715e-14,
    2180729775e-14,
    2058334818e-14,
    1942809362e-14,
    1833767851e-14,
    173084637e-13,
    1633701428e-14,
    1542008813e-14,
    1455462508e-14,
    1373773675e-14,
    1296669683e-14,
    1223893206e-14,
    1155201359e-14,
    1090364889e-14,
    102916741e-13,
    9714046817e-15,
    9168839263e-15,
    8654231857e-15,
    8168507146e-15,
    7710044069e-15,
    7277312546e-15,
    6868868378e-15,
    6483348419e-15,
    6119466033e-15,
    5776006796e-15,
    5451824445e-15,
    5145837051e-15,
    4857023409e-15,
    4584419632e-15,
    4327115929e-15,
    4084253574e-15,
    3855022035e-15,
    3638656274e-15,
    3434434189e-15,
    324167421e-14,
    3059733017e-15,
    2888003398e-15,
    2725912223e-15,
    2572918525e-15,
    2428511705e-15,
    2292209816e-15,
    2163557965e-15,
    2042126787e-15,
    1927511018e-15,
    1819328137e-15,
    1717217095e-15,
    1620837105e-15,
    1529866508e-15,
    1444001699e-15,
    1362956111e-15,
    1286459263e-15,
    1214255852e-15,
    1146104908e-15,
    1081778982e-15,
    1021063394e-15,
    9637555088e-16,
    9096640684e-16,
    8586085474e-16,
    8104185525e-16,
    7649332542e-16,
    7220008496e-16,
    6814780557e-16,
    6432296314e-16,
    6071279262e-16,
    5730524541e-16,
    5408894912e-16,
    5105316968e-16,
    4818777544e-16,
    4548320342e-16,
    4293042737e-16,
    4052092763e-16,
    3824666271e-16,
    3610004248e-16,
    3407390278e-16,
    3216148157e-16,
    3035639631e-16,
    286526227e-15,
    2704447456e-16,
    2552658484e-16,
    2409388772e-16,
    2274160171e-16,
    2146521368e-16,
    2026046381e-16,
    1912333136e-16,
    1805002124e-16,
    1703695139e-16,
    1608074078e-16,
    1517819816e-16,
    1432631135e-16,
    1352223728e-16,
    1276329242e-16,
    1204694386e-16
  ]);

  // js/audio/worklets/rings/resources/lut-stiffness.js
  var lutStiffness = new Float32Array([
    -0.0625,
    -0.0615234375,
    -0.060546875,
    -0.0595703125,
    -0.05859375,
    -0.0576171875,
    -0.056640625,
    -0.0556640625,
    -0.0546875,
    -0.0537109375,
    -0.052734375,
    -0.0517578125,
    -0.05078125,
    -0.0498046875,
    -0.048828125,
    -0.0478515625,
    -0.046875,
    -0.0458984375,
    -0.044921875,
    -0.0439453125,
    -0.04296875,
    -0.0419921875,
    -0.041015625,
    -0.0400390625,
    -0.0390625,
    -0.0380859375,
    -0.037109375,
    -0.0361328125,
    -0.03515625,
    -0.0341796875,
    -0.033203125,
    -0.0322265625,
    -0.03125,
    -0.0302734375,
    -0.029296875,
    -0.0283203125,
    -0.02734375,
    -0.0263671875,
    -0.025390625,
    -0.0244140625,
    -0.0234375,
    -0.0224609375,
    -0.021484375,
    -0.0205078125,
    -0.01953125,
    -0.0185546875,
    -0.017578125,
    -0.0166015625,
    -0.015625,
    -0.0146484375,
    -0.013671875,
    -0.0126953125,
    -0.01171875,
    -0.0107421875,
    -9765625e-9,
    -0.0087890625,
    -78125e-7,
    -0.0068359375,
    -5859375e-9,
    -0.0048828125,
    -390625e-8,
    -0.0029296875,
    -1953125e-9,
    -9765625e-10,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    6029410294e-14,
    367261723e-12,
    6835957809e-13,
    0.001009582073,
    0.001345515115,
    0.001691698412,
    0.002048444725,
    0.002416076364,
    0.002794925468,
    0.003185334315,
    0.003587655624,
    0.004002252878,
    0.00442950065,
    0.004869784943,
    0.005323503537,
    0.00579106635,
    0.006272895808,
    0.006769427226,
    0.007281109202,
    0.007808404022,
    0.008351788076,
    0.008911752293,
    0.00948880258,
    0.01008346028,
    0.01069626264,
    0.01132776331,
    0.01197853283,
    0.01264915914,
    0.01334024813,
    0.01405242417,
    0.01478633069,
    0.01554263074,
    0.01632200761,
    0.01712516545,
    0.01795282987,
    0.01880574864,
    0.01968469234,
    0.02059045506,
    0.02152385512,
    0.02248573583,
    0.02347696619,
    0.02449844176,
    0.0255510854,
    0.02663584813,
    0.02775370999,
    0.02890568094,
    0.03009280173,
    0.03131614488,
    0.03257681565,
    0.03387595299,
    0.03521473064,
    0.03659435812,
    0.03801608189,
    0.03948118641,
    0.04099099536,
    0.04254687278,
    0.04415022437,
    0.04580249868,
    0.04750518848,
    0.0492598321,
    0.05106801479,
    0.05293137017,
    0.05485158172,
    0.05683038428,
    0.05886956562,
    0.06097096806,
    0.06313649016,
    0.06536808837,
    0.06766777886,
    0.07003763933,
    0.07247981084,
    0.07499649981,
    0.07758997998,
    0.08026259446,
    0.08301675786,
    0.08585495846,
    0.08877976048,
    0.09179380636,
    0.09489981918,
    0.09810060511,
    0.1013990559,
    0.1047981517,
    0.1083009634,
    0.1119106556,
    0.1156304895,
    0.119463826,
    0.1234141283,
    0.1274849653,
    0.1316800149,
    0.1360030671,
    0.1404580277,
    0.1450489216,
    0.1497798965,
    0.1546552266,
    0.1596793166,
    0.1648567056,
    0.1701920711,
    0.1756902336,
    0.1813561603,
    0.1871949702,
    0.1932119385,
    0.1994125013,
    0.2058022605,
    0.2123869891,
    0.2191726361,
    0.2261653322,
    0.2333713949,
    0.2407973346,
    0.2484498605,
    0.2563358863,
    0.2644625367,
    0.2728371538,
    0.2814673039,
    0.2903607839,
    0.2995256288,
    0.3089701187,
    0.3187027863,
    0.3287324247,
    0.3390680953,
    0.349719136,
    0.3606951697,
    0.3720061128,
    0.3836621843,
    0.395673915,
    0.4080521572,
    0.420808094,
    0.43395325,
    0.4474995013,
    0.4614590865,
    0.4758446177,
    0.4906690914,
    0.5059459012,
    0.5216888491,
    0.5379121581,
    0.5546304856,
    0.5718589358,
    0.5896130741,
    0.6079089407,
    0.6267630651,
    0.6461924814,
    0.6662147434,
    0.6868479405,
    0.7081107139,
    0.7300222738,
    0.7526024164,
    0.7758715422,
    0.7998506739,
    0.8245614757,
    0.850026273,
    0.8762680723,
    0.903310582,
    0.931178234,
    0.9598962059,
    0.9894904431,
    1.000000745,
    1.000037649,
    1.000262504,
    1.000964607,
    1.002570034,
    1.005639154,
    1.01086118,
    1.019043988,
    1.031097087,
    1.048005353,
    1.070791059,
    1.100461817,
    1.137942574,
    1.183990632,
    1.239094135,
    1.303356514,
    1.376372085,
    1.457101344,
    1.543758274,
    1.633725943,
    1.723520185,
    1.808823654,
    1.884612937,
    1.945398753,
    2,
    2
  ]);
  var LUT_STIFFNESS_SIZE = 257;

  // js/audio/worklets/rings/resources/lut-fm-quantizer.js
  var FM_RATIOS = [
    0.5,
    0.71,
    0.78,
    0.87,
    1,
    1.41,
    1.57,
    1.73,
    2,
    2.82,
    3,
    3.14,
    3.46,
    4,
    4.24,
    4.71,
    5,
    5.19,
    5.65,
    6,
    6.28,
    7,
    7.07,
    7.85,
    8,
    8.48,
    8.49,
    9,
    9.42,
    10,
    11,
    12
  ];
  function generateFmQuantizerTable() {
    const size = 129;
    const table = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const x = i / 128;
      const ratio = 0.5 * Math.pow(32, x);
      let bestRatio = FM_RATIOS[0];
      let bestDist = Math.abs(Math.log(ratio / bestRatio));
      for (const r of FM_RATIOS) {
        const dist = Math.abs(Math.log(ratio / r));
        if (dist < bestDist) {
          bestDist = dist;
          bestRatio = r;
        }
      }
      table[i] = ratio;
    }
    return table;
  }
  var lutFmFrequencyQuantizer = generateFmQuantizerTable();
  var LUT_FM_FREQUENCY_QUANTIZER_SIZE = 129;

  // js/audio/worklets/rings/resources/lut-pitch-ratio.js
  function generatePitchRatioHighTable() {
    const size = 257;
    const table = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const semitones = i - 128;
      table[i] = Math.pow(2, semitones / 12);
    }
    return table;
  }
  function generatePitchRatioLowTable() {
    const size = 257;
    const table = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      const frac = i / 256;
      table[i] = Math.pow(2, frac / 12);
    }
    return table;
  }
  var lutPitchRatioHigh2 = generatePitchRatioHighTable();
  var lutPitchRatioLow2 = generatePitchRatioLowTable();

  // js/audio/worklets/rings/dsp/resonator.js
  var kMaxModes = 64;
  var kSampleRate = 48e3;
  var Resonator = class {
    constructor() {
      this.f = [];
      for (let i = 0; i < kMaxModes; i++) {
        this.f.push(new Svf());
      }
      this.frequency = 220 / kSampleRate;
      this.structure = 0.25;
      this.brightness = 0.5;
      this.damping = 0.3;
      this.position = 0.999;
      this.previousPosition = 0;
      this.resolution = kMaxModes;
    }
    init() {
      for (let i = 0; i < kMaxModes; i++) {
        this.f[i].init();
      }
      this.setFrequency(220 / kSampleRate);
      this.setStructure(0.25);
      this.setBrightness(0.5);
      this.setDamping(0.3);
      this.setPosition(0.999);
      this.previousPosition = 0;
      this.setResolution(kMaxModes);
    }
    setFrequency(frequency) {
      this.frequency = frequency;
    }
    setStructure(structure) {
      this.structure = structure;
    }
    setBrightness(brightness) {
      this.brightness = brightness;
    }
    setDamping(damping) {
      this.damping = damping;
    }
    setPosition(position) {
      this.position = position;
    }
    setResolution(resolution) {
      resolution -= resolution & 1;
      this.resolution = Math.min(resolution, kMaxModes);
    }
    /**
     * Compute filter coefficients for all modes
     * @returns {number} Number of active modes
     */
    computeFilters() {
      let stiffness = interpolate(lutStiffness, this.structure, LUT_STIFFNESS_SIZE - 1);
      let harmonic = this.frequency;
      let stretchFactor = 1;
      let q = 500 * interpolate(lut4Decades, this.damping, LUT_4_DECADES_SIZE - 1);
      let brightnessAttenuation = 1 - this.structure;
      brightnessAttenuation *= brightnessAttenuation;
      brightnessAttenuation *= brightnessAttenuation;
      brightnessAttenuation *= brightnessAttenuation;
      const brightness = this.brightness * (1 - 0.2 * brightnessAttenuation);
      let qLoss = brightness * (2 - brightness) * 0.85 + 0.15;
      const qLossDampingRate = this.structure * (2 - this.structure) * 0.1;
      let numModes = 0;
      const maxModes = Math.min(kMaxModes, this.resolution);
      for (let i = 0; i < maxModes; i++) {
        let partialFrequency = harmonic * stretchFactor;
        if (partialFrequency >= 0.49) {
          partialFrequency = 0.49;
        } else {
          numModes = i + 1;
        }
        this.f[i].setFQ(
          partialFrequency,
          1 + partialFrequency * q,
          FrequencyApproximation.FAST
        );
        stretchFactor += stiffness;
        if (stiffness < 0) {
          stiffness *= 0.93;
        } else {
          stiffness *= 0.98;
        }
        qLoss += qLossDampingRate * (1 - qLoss);
        harmonic += this.frequency;
        q *= qLoss;
      }
      return numModes;
    }
    /**
     * Process audio through the modal resonator
     * @param {Float32Array} input - Input excitation
     * @param {Float32Array} out - Output (odd modes)
     * @param {Float32Array} aux - Auxiliary output (even modes)
     * @param {number} size - Block size
     */
    process(input, out, aux, size) {
      const numModes = this.computeFilters();
      const positionInterp = new ParameterInterpolator(
        this.previousPosition,
        this.position,
        size
      );
      this.previousPosition = this.position;
      for (let s = 0; s < size; s++) {
        const amplitudes = new CosineOscillator();
        amplitudes.init(positionInterp.next(), CosineOscillatorMode.APPROXIMATE);
        const inputSample = input[s] * 0.125;
        let odd = 0;
        let even = 0;
        amplitudes.start();
        for (let i = 0; i < numModes; i += 2) {
          odd += amplitudes.next() * this.f[i].process(inputSample, FilterMode.BAND_PASS);
          even += amplitudes.next() * this.f[i + 1].process(inputSample, FilterMode.BAND_PASS);
        }
        out[s] = odd;
        aux[s] = even;
      }
    }
  };

  // js/audio/worklets/rings/dsp/string.js
  var kDelayLineSize = 2048;
  var kSampleRate2 = 48e3;
  var DampingFilter = class {
    constructor() {
      this.x = 0;
      this.x_ = 0;
      this.brightness = 0;
      this.brightnessIncrement = 0;
      this.damping = 0;
      this.dampingIncrement = 0;
    }
    init() {
      this.x = 0;
      this.x_ = 0;
      this.brightness = 0;
      this.brightnessIncrement = 0;
      this.damping = 0;
      this.dampingIncrement = 0;
    }
    /**
     * Configure filter coefficients with interpolation
     * @param {number} damping - Damping coefficient (0-1)
     * @param {number} brightness - Brightness (0-1)
     * @param {number} size - Block size for interpolation (0 for instant)
     */
    configure(damping, brightness, size) {
      if (!size) {
        this.damping = damping;
        this.brightness = brightness;
        this.dampingIncrement = 0;
        this.brightnessIncrement = 0;
      } else {
        const step = 1 / size;
        this.dampingIncrement = (damping - this.damping) * step;
        this.brightnessIncrement = (brightness - this.brightness) * step;
      }
    }
    /**
     * Process one sample through the FIR filter
     * @param {number} x - Input sample
     * @returns {number} Filtered output
     */
    process(x) {
      const h0 = (1 + this.brightness) * 0.5;
      const h1 = (1 - this.brightness) * 0.25;
      const y = this.damping * (h0 * this.x + h1 * (x + this.x_));
      this.x_ = this.x;
      this.x = x;
      this.brightness += this.brightnessIncrement;
      this.damping += this.dampingIncrement;
      return y;
    }
  };
  var String = class {
    constructor() {
      this.string = new DelayLine(kDelayLineSize);
      this.stretch = new DelayLine(kDelayLineSize / 2);
      this.firDampingFilter = new DampingFilter();
      this.iirDampingFilter = new Svf();
      this.dcBlocker = new DCBlocker();
      this.frequency = 220 / kSampleRate2;
      this.dispersion = 0.25;
      this.brightness = 0.5;
      this.damping = 0.3;
      this.position = 0.8;
      this.delay = 1 / this.frequency;
      this.clampedPosition = 0;
      this.previousDispersion = 0;
      this.previousDampingCompensation = 0;
      this.enableDispersion = true;
      this.dispersionNoise = 0;
      this.curvedBridge = 0;
      this.srcPhase = 1;
      this.outSample = [0, 0];
      this.auxSample = [0, 0];
      this.random = new Random();
    }
    /**
     * Initialise the string
     * @param {boolean} enableDispersion - Enable dispersion processing
     */
    init(enableDispersion = true) {
      this.enableDispersion = enableDispersion;
      this.string.init();
      this.stretch.init();
      this.firDampingFilter.init();
      this.iirDampingFilter.init();
      this.setFrequency(220 / kSampleRate2);
      this.setDispersion(0.25);
      this.setBrightness(0.5);
      this.setDamping(0.3);
      this.setPosition(0.8);
      this.delay = 1 / this.frequency;
      this.clampedPosition = 0;
      this.previousDispersion = 0;
      this.dispersionNoise = 0;
      this.curvedBridge = 0;
      this.previousDampingCompensation = 0;
      this.outSample[0] = this.outSample[1] = 0;
      this.auxSample[0] = this.auxSample[1] = 0;
      this.dcBlocker.init(1 - 20 / kSampleRate2);
    }
    setFrequency(frequency) {
      this.frequency = frequency;
    }
    setFrequencyWithSlew(frequency, coefficient) {
      this.frequency += coefficient * (frequency - this.frequency);
    }
    setDispersion(dispersion) {
      this.dispersion = dispersion;
    }
    setBrightness(brightness) {
      this.brightness = brightness;
    }
    setDamping(damping) {
      this.damping = damping;
    }
    setPosition(position) {
      this.position = position;
    }
    /**
     * Get access to the string delay line (for external writing)
     * @returns {DelayLine} The string delay line
     */
    getStringDelayLine() {
      return this.string;
    }
    /**
     * Process audio through the string model
     * @param {Float32Array} input - Input excitation
     * @param {Float32Array} out - Output buffer (added to)
     * @param {Float32Array} aux - Auxiliary output (position-based, added to)
     * @param {number} size - Block size
     */
    process(input, out, aux, size) {
      let delay = 1 / this.frequency;
      delay = constrain(delay, 4, kDelayLineSize - 4);
      let srcRatio = delay * this.frequency;
      if (srcRatio >= 0.9999) {
        this.srcPhase = 1;
        srcRatio = 1;
      }
      const clampedPosition = 0.5 - 0.98 * Math.abs(this.position - 0.5);
      const delayModulation = new ParameterInterpolator(this.delay, delay, size);
      this.delay = delay;
      const positionModulation = new ParameterInterpolator(
        this.clampedPosition,
        clampedPosition,
        size
      );
      this.clampedPosition = clampedPosition;
      const dispersionModulation = new ParameterInterpolator(
        this.previousDispersion,
        this.dispersion,
        size
      );
      this.previousDispersion = this.dispersion;
      const lfDamping = this.damping * (2 - this.damping);
      const rt60 = 0.07 * semitonesToRatio(lfDamping * 96) * kSampleRate2;
      const rt60Base2_12 = Math.max(-120 * delay / srcRatio / rt60, -127);
      let dampingCoefficient = semitonesToRatio(rt60Base2_12);
      let brightness = this.brightness * this.brightness;
      const noiseFilter = semitonesToRatio((this.brightness - 1) * 48);
      let dampingCutoff = Math.min(
        24 + this.damping * this.damping * 48 + this.brightness * this.brightness * 24,
        84
      );
      let dampingF = Math.min(
        this.frequency * semitonesToRatio(dampingCutoff),
        0.499
      );
      if (this.damping >= 0.95) {
        const toInfinite = 20 * (this.damping - 0.95);
        dampingCoefficient += toInfinite * (1 - dampingCoefficient);
        brightness += toInfinite * (1 - brightness);
        dampingF += toInfinite * (0.4999 - dampingF);
        dampingCutoff += toInfinite * (128 - dampingCutoff);
      }
      this.firDampingFilter.configure(dampingCoefficient, brightness, size);
      this.iirDampingFilter.setFQ(dampingF, 0.5, FrequencyApproximation.ACCURATE);
      const dampingCompTarget = 1 - interpolate(
        lutSvfShift,
        dampingCutoff,
        1
      );
      const dampingCompModulation = new ParameterInterpolator(
        this.previousDampingCompensation,
        dampingCompTarget,
        size
      );
      this.previousDampingCompensation = dampingCompTarget;
      for (let i = 0; i < size; i++) {
        this.srcPhase += srcRatio;
        if (this.srcPhase > 1) {
          this.srcPhase -= 1;
          let sampleDelay = delayModulation.next();
          const combDelay = sampleDelay * positionModulation.next();
          sampleDelay *= dampingCompModulation.next();
          sampleDelay -= 1;
          let s = 0;
          if (this.enableDispersion) {
            let noise = 2 * this.random.getFloat() - 1;
            noise *= 1 / (0.2 + noiseFilter);
            this.dispersionNoise += noiseFilter * (noise - this.dispersionNoise);
            const dispersion = dispersionModulation.next();
            const stretchPoint = dispersion <= 0 ? 0 : dispersion * (2 - dispersion) * 0.475;
            let noiseAmount = dispersion > 0.75 ? 4 * (dispersion - 0.75) : 0;
            let bridgeCurving = dispersion < 0 ? -dispersion : 0;
            noiseAmount = noiseAmount * noiseAmount * 0.025;
            const acBlockingAmount = bridgeCurving;
            bridgeCurving = bridgeCurving * bridgeCurving * 0.01;
            const apGain = -0.618 * dispersion / (0.15 + Math.abs(dispersion));
            let delayFm = 1;
            delayFm += this.dispersionNoise * noiseAmount;
            delayFm -= this.curvedBridge * bridgeCurving;
            sampleDelay *= delayFm;
            const apDelay = sampleDelay * stretchPoint;
            const mainDelay = sampleDelay - apDelay;
            if (apDelay >= 4 && mainDelay >= 4) {
              s = this.string.readHermite(mainDelay);
              s = this.stretch.allpass(s, apDelay, apGain);
            } else {
              s = this.string.readHermite(sampleDelay);
            }
            let sAc = s;
            sAc = this.dcBlocker.process(sAc);
            s += acBlockingAmount * (sAc - s);
            const value = Math.abs(s) - 0.025;
            const sign = s > 0 ? 1 : -1.5;
            this.curvedBridge = (Math.abs(value) + value) * sign;
          } else {
            s = this.string.readHermite(sampleDelay);
          }
          s += input[i];
          s = this.firDampingFilter.process(s);
          s = this.iirDampingFilter.process(s, FilterMode.LOW_PASS);
          this.string.write(s);
          this.outSample[1] = this.outSample[0];
          this.auxSample[1] = this.auxSample[0];
          this.outSample[0] = s;
          this.auxSample[0] = this.string.readFloat(combDelay);
        }
        out[i] += crossfade(this.outSample[1], this.outSample[0], this.srcPhase);
        aux[i] += crossfade(this.auxSample[1], this.auxSample[0], this.srcPhase);
      }
    }
  };

  // js/audio/worklets/rings/core/naive-svf.js
  var M_PI3 = Math.PI;
  var NaiveSvf = class {
    constructor() {
      this.f = 0;
      this.damp = 1;
      this.lp = 0;
      this.bp = 0;
    }
    init() {
      this.setFQ(0.01, 100, FrequencyApproximation.DIRTY);
      this.reset();
    }
    reset() {
      this.lp = 0;
      this.bp = 0;
    }
    /**
     * Set frequency and resonance
     * C++: set_f_q<approximation>(f, resonance)
     */
    setFQ(f, resonance, approximation = FrequencyApproximation.DIRTY) {
      if (approximation === FrequencyApproximation.EXACT) {
        f = f < 0.497 ? f : 0.497;
        this.f = 2 * Math.sin(M_PI3 * f);
      } else {
        f = f < 0.158 ? f : 0.158;
        this.f = 2 * M_PI3 * f;
      }
      this.damp = 1 / resonance;
    }
    /**
     * Process single sample
     */
    process(input, mode = FilterMode.LOW_PASS) {
      const bpNormalized = this.bp * this.damp;
      const notch = input - bpNormalized;
      this.lp += this.f * this.bp;
      const hp = notch - this.lp;
      this.bp += this.f * hp;
      switch (mode) {
        case FilterMode.LOW_PASS:
          return this.lp;
        case FilterMode.BAND_PASS:
          return this.bp;
        case FilterMode.BAND_PASS_NORMALIZED:
          return bpNormalized;
        case FilterMode.HIGH_PASS:
          return hp;
        default:
          return this.lp;
      }
    }
    /**
     * Get current lowpass output
     */
    getLp() {
      return this.lp;
    }
    /**
     * Get current bandpass output
     */
    getBp() {
      return this.bp;
    }
    /**
     * Process block
     */
    processBlock(input, output, size, mode = FilterMode.LOW_PASS) {
      for (let i = 0; i < size; i++) {
        output[i] = this.process(input[i], mode);
      }
    }
    /**
     * Split signal into low and high bands
     */
    split(input, low, high, size) {
      for (let i = 0; i < size; i++) {
        const bpNormalized = this.bp * this.damp;
        const notch = input[i] - bpNormalized;
        this.lp += this.f * this.bp;
        const hp = notch - this.lp;
        this.bp += this.f * hp;
        low[i] = this.lp;
        high[i] = hp;
      }
    }
  };

  // js/audio/worklets/rings/dsp/follower.js
  var Follower = class {
    constructor() {
      this.lowMidFilter = new NaiveSvf();
      this.midHighFilter = new NaiveSvf();
      this.attack = new Float32Array(3);
      this.decay = new Float32Array(3);
      this.detector = new Float32Array(3);
      this.centroid = 0;
    }
    /**
     * Initialise the follower
     * @param {number} low - Low frequency boundary (normalised)
     * @param {number} lowMid - Low-mid crossover frequency (normalised)
     * @param {number} midHigh - Mid-high crossover frequency (normalised)
     */
    init(low, lowMid, midHigh) {
      this.lowMidFilter.init();
      this.midHighFilter.init();
      this.lowMidFilter.setFQ(lowMid, 0.5);
      this.midHighFilter.setFQ(midHigh, 0.5);
      this.attack[0] = lowMid;
      this.decay[0] = sqrt(lowMid * low);
      this.attack[1] = sqrt(lowMid * midHigh);
      this.decay[1] = lowMid;
      this.attack[2] = sqrt(midHigh * 0.5);
      this.decay[2] = sqrt(midHigh * lowMid);
      this.detector.fill(0);
      this.centroid = 0;
    }
    /**
     * Process a single sample
     * @param {number} sample - Input sample
     * @returns {{envelope: number, centroid: number}} Envelope and centroid values
     */
    process(sample) {
      const bands = [0, 0, 0];
      bands[2] = this.midHighFilter.process(sample, FilterMode.HIGH_PASS);
      bands[1] = this.lowMidFilter.process(this.midHighFilter.lp, FilterMode.HIGH_PASS);
      bands[0] = this.lowMidFilter.lp;
      let weighted = 0;
      let total = 0;
      let frequency = 0;
      for (let i = 0; i < 3; i++) {
        const target = Math.abs(bands[i]);
        if (target > this.detector[i]) {
          this.detector[i] += this.attack[i] * (target - this.detector[i]);
        } else {
          this.detector[i] += this.decay[i] * (target - this.detector[i]);
        }
        weighted += this.detector[i] * frequency;
        total += this.detector[i];
        frequency += 0.5;
      }
      const error = weighted / (total + 1e-3) - this.centroid;
      const coefficient = error > 0 ? 0.05 : 1e-3;
      this.centroid += error * coefficient;
      return {
        envelope: total,
        centroid: this.centroid
      };
    }
  };

  // js/audio/worklets/rings/dsp/fm-voice.js
  var kSampleRate3 = 48e3;
  var UINT32_MAX = 4294967296;
  var FMVoice = class {
    constructor() {
      this.carrierFrequency = 220 / kSampleRate3;
      this.ratio = 0.5;
      this.brightness = 0.5;
      this.damping = 0.5;
      this.position = 0.5;
      this.feedbackAmount = 0;
      this.previousCarrierFrequency = this.carrierFrequency;
      this.previousModulatorFrequency = this.carrierFrequency;
      this.previousBrightness = this.brightness;
      this.previousDamping = this.damping;
      this.previousFeedbackAmount = 0;
      this.amplitudeEnvelope = 0;
      this.brightnessEnvelope = 0;
      this.carrierPhase = 0;
      this.modulatorPhase = 0;
      this.gain = 0;
      this.fmAmount = 0;
      this.previousSample = 0;
      this.follower = new Follower();
    }
    init() {
      this.setFrequency(220 / kSampleRate3);
      this.setRatio(0.5);
      this.setBrightness(0.5);
      this.setDamping(0.5);
      this.setPosition(0.5);
      this.setFeedbackAmount(0);
      this.previousCarrierFrequency = this.carrierFrequency;
      this.previousModulatorFrequency = this.carrierFrequency;
      this.previousBrightness = this.brightness;
      this.previousDamping = this.damping;
      this.previousFeedbackAmount = this.feedbackAmount;
      this.amplitudeEnvelope = 0;
      this.brightnessEnvelope = 0;
      this.carrierPhase = 0;
      this.modulatorPhase = 0;
      this.gain = 0;
      this.fmAmount = 0;
      this.previousSample = 0;
      this.follower.init(
        8 / kSampleRate3,
        160 / kSampleRate3,
        1600 / kSampleRate3
      );
    }
    setFrequency(frequency) {
      this.carrierFrequency = frequency;
    }
    setRatio(ratio) {
      this.ratio = ratio;
    }
    setBrightness(brightness) {
      this.brightness = brightness;
    }
    setDamping(damping) {
      this.damping = damping;
    }
    setPosition(position) {
      this.position = position;
    }
    setFeedbackAmount(feedbackAmount) {
      this.feedbackAmount = feedbackAmount;
    }
    /**
     * Trigger internal envelope
     */
    triggerInternalEnvelope() {
      this.amplitudeEnvelope = 1;
      this.brightnessEnvelope = 1;
    }
    /**
     * Sine lookup with FM modulation
     * @param {number} phase - Phase (0 to UINT32_MAX)
     * @param {number} fm - FM modulation amount
     * @returns {number} Sine value (-1 to 1)
     */
    sineFm(phase, fm) {
      phase = phase + Math.floor((fm + 4) * 536870912) * 8 >>> 0;
      const integral = phase >>> 20 & 4095;
      const fractional = (phase & 1048575) / 1048576;
      const idx = integral % (LUT_SINE_SIZE - 1);
      const a = lutSine[idx];
      const b = lutSine[idx + 1];
      return a + (b - a) * fractional;
    }
    /**
     * Process audio through FM synthesis
     * @param {Float32Array} input - Input excitation
     * @param {Float32Array} out - Output (carrier + modulator)
     * @param {Float32Array} aux - Auxiliary output (modulator only)
     * @param {number} size - Block size
     */
    process(input, out, aux, size) {
      const envelopeAmount = this.damping < 0.9 ? 1 : (1 - this.damping) * 10;
      const amplitudeRt60 = 0.1 * semitonesToRatio(this.damping * 96) * kSampleRate3;
      const amplitudeDecay = 1 - Math.pow(1e-3, 1 / amplitudeRt60);
      const brightnessRt60 = 0.1 * semitonesToRatio(this.damping * 84) * kSampleRate3;
      const brightnessDecay = 1 - Math.pow(1e-3, 1 / brightnessRt60);
      const ratio = interpolate(
        lutFmFrequencyQuantizer,
        this.ratio,
        LUT_FM_FREQUENCY_QUANTIZER_SIZE - 1
      );
      let modulatorFrequency = this.carrierFrequency * semitonesToRatio(ratio);
      if (modulatorFrequency > 0.5) {
        modulatorFrequency = 0.5;
      }
      const feedback = (this.feedbackAmount - 0.5) * 2;
      const carrierIncrement = new ParameterInterpolator(
        this.previousCarrierFrequency,
        this.carrierFrequency,
        size
      );
      this.previousCarrierFrequency = this.carrierFrequency;
      const modulatorIncrement = new ParameterInterpolator(
        this.previousModulatorFrequency,
        modulatorFrequency,
        size
      );
      this.previousModulatorFrequency = modulatorFrequency;
      const brightnessInterp = new ParameterInterpolator(
        this.previousBrightness,
        this.brightness,
        size
      );
      this.previousBrightness = this.brightness;
      const feedbackAmountInterp = new ParameterInterpolator(
        this.previousFeedbackAmount,
        feedback,
        size
      );
      this.previousFeedbackAmount = feedback;
      let carrierPhase = this.carrierPhase;
      let modulatorPhase = this.modulatorPhase;
      let previousSample = this.previousSample;
      for (let i = 0; i < size; i++) {
        const followerResult = this.follower.process(input[i]);
        let amplitudeEnvelope = followerResult.envelope;
        let brightnessEnvelope = followerResult.centroid;
        brightnessEnvelope *= 2 * amplitudeEnvelope * (2 - amplitudeEnvelope);
        if (amplitudeEnvelope > this.amplitudeEnvelope) {
          this.amplitudeEnvelope += 0.05 * (amplitudeEnvelope - this.amplitudeEnvelope);
        } else {
          this.amplitudeEnvelope += amplitudeDecay * (amplitudeEnvelope - this.amplitudeEnvelope);
        }
        if (brightnessEnvelope > this.brightnessEnvelope) {
          this.brightnessEnvelope += 0.01 * (brightnessEnvelope - this.brightnessEnvelope);
        } else {
          this.brightnessEnvelope += brightnessDecay * (brightnessEnvelope - this.brightnessEnvelope);
        }
        let brightnessValue = brightnessInterp.next();
        brightnessValue *= brightnessValue;
        const fmAmountMin = brightnessValue < 0.5 ? 0 : brightnessValue * 2 - 1;
        const fmAmountMax = brightnessValue < 0.5 ? 2 * brightnessValue : 1;
        const fmEnvelope = 0.5 + envelopeAmount * (this.brightnessEnvelope - 0.5);
        let fmAmount = (fmAmountMin + fmAmountMax * fmEnvelope) * 2;
        const slewRate = 5e-3 + fmAmountMax * 0.015;
        if (Math.abs(fmAmount - this.fmAmount) < slewRate) {
          this.fmAmount = fmAmount;
        } else if (fmAmount > this.fmAmount) {
          this.fmAmount += slewRate;
        } else {
          this.fmAmount -= slewRate;
        }
        const currentFeedback = feedbackAmountInterp.next();
        const phaseFeedback = currentFeedback < 0 ? 0.5 * currentFeedback * currentFeedback : 0;
        const modFreq = modulatorIncrement.next();
        modulatorPhase = modulatorPhase + Math.floor(UINT32_MAX * modFreq * (1 + previousSample * phaseFeedback)) >>> 0;
        const carFreq = carrierIncrement.next();
        carrierPhase = carrierPhase + Math.floor(UINT32_MAX * carFreq) >>> 0;
        const modulatorFb = currentFeedback > 0 ? 0.25 * currentFeedback * currentFeedback : 0;
        const modulator = this.sineFm(modulatorPhase, modulatorFb * previousSample);
        const carrier = this.sineFm(carrierPhase, this.fmAmount * modulator);
        previousSample += 0.1 * (carrier - previousSample);
        let gain = 1 + envelopeAmount * (this.amplitudeEnvelope - 1);
        this.gain += (5e-3 + 0.045 * this.fmAmount) * (gain - this.gain);
        out[i] = (carrier + 0.5 * modulator) * this.gain;
        aux[i] = 0.5 * modulator * this.gain;
      }
      this.carrierPhase = carrierPhase;
      this.modulatorPhase = modulatorPhase;
      this.previousSample = previousSample;
    }
  };

  // js/audio/worklets/rings/dsp/plucker.js
  var Plucker = class {
    constructor() {
      this.svf = new Svf();
      this.combFilter = new DelayLine(256);
      this.remainingSamples = 0;
      this.combFilterPeriod = 0;
      this.combFilterGain = 0;
      this.random = new Random();
    }
    init() {
      this.svf.init();
      this.combFilter.init();
      this.remainingSamples = 0;
      this.combFilterPeriod = 0;
    }
    /**
     * Trigger a new pluck excitation
     * @param {number} frequency - Fundamental frequency (normalised to sample rate)
     * @param {number} cutoff - Filter cutoff (normalised, 0-0.5)
     * @param {number} position - Excitation position (0-1)
     */
    trigger(frequency, cutoff, position) {
      const ratio = position * 0.9 + 0.05;
      let combPeriod = 1 / frequency * ratio;
      this.remainingSamples = Math.floor(combPeriod);
      while (combPeriod >= 255) {
        combPeriod *= 0.5;
      }
      this.combFilterPeriod = combPeriod;
      this.combFilterGain = (1 - position) * 0.8;
      this.svf.setFQ(Math.min(cutoff, 0.499), 1, FrequencyApproximation.DIRTY);
    }
    /**
     * Process and generate excitation samples
     * @param {Float32Array} out - Output buffer
     * @param {number} size - Number of samples to generate
     */
    process(out, size) {
      const combGain = this.combFilterGain;
      const combDelay = this.combFilterPeriod;
      for (let i = 0; i < size; i++) {
        let input = 0;
        if (this.remainingSamples > 0) {
          input = 2 * this.random.getFloat() - 1;
          this.remainingSamples--;
        }
        out[i] = input + combGain * this.combFilter.readFloat(combDelay);
        this.combFilter.write(out[i]);
      }
      this.svf.processBlock(out, out, size, FilterMode.LOW_PASS);
    }
  };

  // js/audio/worklets/rings/dsp/note-filter.js
  var N = 4;
  var NoteFilter = class {
    constructor() {
      this.previousValues = new Float32Array(N);
      this.note = 69;
      this.stableNote = 69;
      this.delayedStableNote = new DelayLine(16);
      this.coefficient = 0;
      this.stableCoefficient = 0;
      this.fastCoefficient = 0;
      this.slowCoefficient = 0;
      this.lagCoefficient = 0;
    }
    /**
     * Initialise the note filter
     * @param {number} sampleRate - Sample rate in Hz
     * @param {number} timeConstantFastEdge - Time constant for fast changes (seconds)
     * @param {number} timeConstantSteadyPart - Time constant for steady state (seconds)
     * @param {number} edgeRecoveryTime - Recovery time after edge (seconds)
     * @param {number} edgeAvoidanceDelay - Delay to avoid edge artefacts (seconds)
     */
    init(sampleRate, timeConstantFastEdge, timeConstantSteadyPart, edgeRecoveryTime, edgeAvoidanceDelay) {
      this.fastCoefficient = 1 / (timeConstantFastEdge * sampleRate);
      this.slowCoefficient = 1 / (timeConstantSteadyPart * sampleRate);
      this.lagCoefficient = 1 / (edgeRecoveryTime * sampleRate);
      this.delayedStableNote.init();
      this.delayedStableNote.setDelay(
        Math.min(15, Math.floor(edgeAvoidanceDelay * sampleRate))
      );
      this.stableNote = this.note = 69;
      this.coefficient = this.fastCoefficient;
      this.stableCoefficient = this.slowCoefficient;
      this.previousValues.fill(this.note);
    }
    /**
     * Process a new note value
     * @param {number} note - Input note (MIDI note number)
     * @param {boolean} strum - True if a strum/trigger occurred
     * @returns {number} Filtered note value
     */
    process(note, strum) {
      if (Math.abs(note - this.note) > 0.4 || strum) {
        this.stableNote = this.note = note;
        this.coefficient = this.fastCoefficient;
        this.stableCoefficient = this.slowCoefficient;
        this.previousValues.fill(note);
      } else {
        for (let i = 0; i < N - 1; i++) {
          this.previousValues[i] = this.previousValues[i + 1];
        }
        this.previousValues[N - 1] = note;
        const sortedValues = new Float32Array(this.previousValues);
        sortedValues.sort();
        const median = 0.5 * (sortedValues[Math.floor((N - 1) / 2)] + sortedValues[Math.floor(N / 2)]);
        this.note += this.coefficient * (median - this.note);
        this.stableNote += this.stableCoefficient * (this.note - this.stableNote);
        this.coefficient += this.lagCoefficient * (this.slowCoefficient - this.coefficient);
        this.stableCoefficient += this.lagCoefficient * (this.lagCoefficient - this.stableCoefficient);
        this.delayedStableNote.write(this.stableNote);
      }
      return this.note;
    }
    /**
     * Get the current filtered note
     * @returns {number} Current note value
     */
    getNote() {
      return this.note;
    }
    /**
     * Get the delayed stable note (for avoiding edge artefacts)
     * @returns {number} Stable note value with delay
     */
    getStableNote() {
      return this.delayedStableNote.read();
    }
  };

  // js/audio/worklets/rings/dsp/limiter.js
  var Limiter = class {
    constructor() {
      this.peak = 0.5;
    }
    init() {
      this.peak = 0.5;
    }
    /**
     * Process stereo audio with soft limiting
     * @param {Float32Array} left - Left channel (modified in place)
     * @param {Float32Array} right - Right channel (modified in place)
     * @param {number} size - Number of samples
     * @param {number} preGain - Pre-limiter gain
     */
    process(left, right, size, preGain) {
      for (let i = 0; i < size; i++) {
        const lPre = left[i] * preGain;
        const rPre = right[i] * preGain;
        const lPeak = Math.abs(lPre);
        const rPeak = Math.abs(rPre);
        const sPeak = Math.abs(rPre - lPre);
        const peak = Math.max(Math.max(lPeak, rPeak), sPeak);
        if (peak > this.peak) {
          this.peak += 0.05 * (peak - this.peak);
        } else {
          this.peak += 2e-5 * (peak - this.peak);
        }
        const gain = this.peak <= 1 ? 1 : 1 / this.peak;
        left[i] = softLimit(lPre * gain * 0.8);
        right[i] = softLimit(rPre * gain * 0.8);
      }
    }
  };

  // js/audio/worklets/rings/fx/fx-engine.js
  var FxEngine = class {
    /**
     * @param {number} size - Buffer size (must be power of 2)
     */
    constructor(size) {
      this.size = size;
      this.mask = size - 1;
      this.buffer = null;
      this.writePtr = 0;
      this.lfo = [
        new CosineOscillator(),
        new CosineOscillator()
      ];
      this.lfoValue = [0, 0];
    }
    /**
     * Initialise with buffer
     * @param {Float32Array} buffer - Pre-allocated buffer
     */
    init(buffer) {
      this.buffer = buffer;
      this.clear();
    }
    /**
     * Clear the buffer
     */
    clear() {
      this.buffer.fill(0);
      this.writePtr = 0;
    }
    /**
     * Set LFO frequency
     * @param {number} index - LFO index (0 or 1)
     * @param {number} frequency - Frequency (normalised to sample rate)
     */
    setLFOFrequency(index, frequency) {
      this.lfo[index].init(frequency * 32, CosineOscillatorMode.APPROXIMATE);
    }
    /**
     * Start processing a new sample
     * @returns {FxContext} Processing context
     */
    start() {
      this.writePtr = this.writePtr - 1 + this.size & this.mask;
      if ((this.writePtr & 31) === 0) {
        this.lfoValue[0] = this.lfo[0].next();
        this.lfoValue[1] = this.lfo[1].next();
      }
      return new FxContext(this);
    }
  };
  var FxContext = class {
    constructor(engine) {
      this.engine = engine;
      this.accumulator = 0;
      this.previousRead = 0;
    }
    /**
     * Load a value into accumulator
     */
    load(value) {
      this.accumulator = value;
    }
    /**
     * Read and add to accumulator
     */
    read(value, scale = 1) {
      this.accumulator += value * scale;
    }
    /**
     * Write accumulator to variable
     */
    write(scale = 1) {
      const value = this.accumulator;
      this.accumulator *= scale;
      return value;
    }
    /**
     * Write to delay line at offset
     * @param {number} base - Delay line base offset
     * @param {number} offset - Write offset (-1 for end)
     * @param {number} scale - Scale accumulator after write
     */
    writeDelay(base, length, offset, scale) {
      const buffer = this.engine.buffer;
      const mask = this.engine.mask;
      const writePtr = this.engine.writePtr;
      let writeOffset;
      if (offset === -1) {
        writeOffset = writePtr + base + length - 1 & mask;
      } else {
        writeOffset = writePtr + base + offset & mask;
      }
      buffer[writeOffset] = this.accumulator;
      this.accumulator *= scale;
    }
    /**
     * Write allpass to delay line
     */
    writeAllPass(base, length, offset, scale) {
      this.writeDelay(base, length, offset, scale);
      this.accumulator += this.previousRead;
    }
    /**
     * Read from delay line at offset
     * @param {number} base - Delay line base offset
     * @param {number} offset - Read offset (-1 for end of delay line)
     * @param {number} scale - Scale factor
     */
    readDelay(base, length, offset, scale) {
      const buffer = this.engine.buffer;
      const mask = this.engine.mask;
      const writePtr = this.engine.writePtr;
      let readOffset;
      if (offset === -1) {
        readOffset = writePtr + base + length - 1 & mask;
      } else {
        readOffset = writePtr + base + offset & mask;
      }
      const value = buffer[readOffset];
      this.previousRead = value;
      this.accumulator += value * scale;
    }
    /**
     * Lowpass filter on accumulator
     */
    lp(state, coefficient) {
      const newState = state + coefficient * (this.accumulator - state);
      this.accumulator = newState;
      return newState;
    }
    /**
     * Highpass filter on accumulator
     */
    hp(state, coefficient) {
      const newState = state + coefficient * (this.accumulator - state);
      this.accumulator -= newState;
      return newState;
    }
    /**
     * Interpolated read from delay line
     * @param {number} base - Delay line base offset
     * @param {number} offset - Fractional offset
     * @param {number} scale - Scale factor
     */
    interpolate(base, offset, scale) {
      const buffer = this.engine.buffer;
      const mask = this.engine.mask;
      const writePtr = this.engine.writePtr;
      const integral = Math.floor(offset);
      const fractional = offset - integral;
      const idx0 = writePtr + base + integral & mask;
      const idx1 = writePtr + base + integral + 1 & mask;
      const a = buffer[idx0];
      const b = buffer[idx1];
      const x = a + (b - a) * fractional;
      this.previousRead = x;
      this.accumulator += x * scale;
    }
    /**
     * Interpolated read with LFO modulation
     * @param {number} base - Delay line base offset
     * @param {number} offset - Base offset
     * @param {number} lfoIndex - LFO index (0 or 1)
     * @param {number} amplitude - LFO amplitude
     * @param {number} scale - Scale factor
     */
    interpolateLfo(base, offset, lfoIndex, amplitude, scale) {
      const modulatedOffset = offset + amplitude * this.engine.lfoValue[lfoIndex];
      this.interpolate(base, modulatedOffset, scale);
    }
  };

  // js/audio/worklets/rings/fx/reverb.js
  var BUFFER_SIZE = 32768;
  var AP1_BASE = 0;
  var AP1_LEN = 150;
  var AP2_BASE = 151;
  var AP2_LEN = 214;
  var AP3_BASE = 366;
  var AP3_LEN = 319;
  var AP4_BASE = 686;
  var AP4_LEN = 527;
  var DAP1A_BASE = 1214;
  var DAP1A_LEN = 2182;
  var DAP1B_BASE = 3397;
  var DAP1B_LEN = 2690;
  var DEL1_BASE = 6088;
  var DEL1_LEN = 4501;
  var DAP2A_BASE = 10590;
  var DAP2A_LEN = 2525;
  var DAP2B_BASE = 13116;
  var DAP2B_LEN = 2197;
  var DEL2_BASE = 15314;
  var DEL2_LEN = 6312;
  var Reverb = class {
    constructor() {
      this.engine = new FxEngine(BUFFER_SIZE);
      this.buffer = new Float32Array(BUFFER_SIZE);
      this.amount = 0.5;
      this.inputGain = 0.2;
      this.reverbTime = 0.5;
      this.diffusion = 0.625;
      this.lp = 0.7;
      this.lpDecay1 = 0;
      this.lpDecay2 = 0;
    }
    init() {
      this.engine.init(this.buffer);
      this.engine.setLFOFrequency(0, 0.5 / 48e3);
      this.engine.setLFOFrequency(1, 0.3 / 48e3);
      this.lp = 0.7;
      this.diffusion = 0.625;
      this.lpDecay1 = 0;
      this.lpDecay2 = 0;
    }
    setAmount(amount) {
      this.amount = amount;
    }
    setInputGain(inputGain) {
      this.inputGain = inputGain;
    }
    setTime(reverbTime) {
      this.reverbTime = reverbTime;
    }
    setDiffusion(diffusion) {
      this.diffusion = diffusion;
    }
    setLp(lp) {
      this.lp = lp;
    }
    clear() {
      this.engine.clear();
      this.lpDecay1 = 0;
      this.lpDecay2 = 0;
    }
    /**
     * Process stereo audio
     * @param {Float32Array} left - Left channel (modified in place)
     * @param {Float32Array} right - Right channel (modified in place)
     * @param {number} size - Number of samples
     */
    process(left, right, size) {
      const kap = this.diffusion;
      const klp = this.lp;
      const krt = this.reverbTime;
      const amount = this.amount;
      const gain = this.inputGain;
      let lpDecay1 = this.lpDecay1;
      let lpDecay2 = this.lpDecay2;
      for (let i = 0; i < size; i++) {
        const c = this.engine.start();
        let input = (left[i] + right[i]) * gain;
        if (input > 2) input = 2;
        if (input < -2) input = -2;
        c.load(input);
        c.readDelay(AP1_BASE, AP1_LEN, -1, kap);
        c.writeAllPass(AP1_BASE, AP1_LEN, 0, -kap);
        c.readDelay(AP2_BASE, AP2_LEN, -1, kap);
        c.writeAllPass(AP2_BASE, AP2_LEN, 0, -kap);
        c.readDelay(AP3_BASE, AP3_LEN, -1, kap);
        c.writeAllPass(AP3_BASE, AP3_LEN, 0, -kap);
        c.readDelay(AP4_BASE, AP4_LEN, -1, kap);
        c.writeAllPass(AP4_BASE, AP4_LEN, 0, -kap);
        const apout = c.write(1);
        c.load(apout);
        c.interpolateLfo(DEL2_BASE, 6261, 1, 50, krt);
        lpDecay1 = c.lp(lpDecay1, klp);
        if (!Number.isFinite(lpDecay1)) {
          lpDecay1 = 0;
          this.clear();
          continue;
        }
        c.readDelay(DAP1A_BASE, DAP1A_LEN, -1, -kap);
        c.writeAllPass(DAP1A_BASE, DAP1A_LEN, 0, kap);
        c.readDelay(DAP1B_BASE, DAP1B_LEN, -1, kap);
        c.writeAllPass(DAP1B_BASE, DAP1B_LEN, 0, -kap);
        c.writeDelay(DEL1_BASE, DEL1_LEN, 0, 2);
        const wet1 = c.write(0);
        left[i] += (wet1 - left[i]) * amount;
        c.load(apout);
        c.interpolateLfo(DEL1_BASE, 4460, 0, 40, krt);
        lpDecay2 = c.lp(lpDecay2, klp);
        if (!Number.isFinite(lpDecay2)) {
          lpDecay2 = 0;
          this.clear();
          continue;
        }
        c.readDelay(DAP2A_BASE, DAP2A_LEN, -1, kap);
        c.writeAllPass(DAP2A_BASE, DAP2A_LEN, 0, -kap);
        c.readDelay(DAP2B_BASE, DAP2B_LEN, -1, -kap);
        c.writeAllPass(DAP2B_BASE, DAP2B_LEN, 0, kap);
        c.writeDelay(DEL2_BASE, DEL2_LEN, 0, 2);
        const wet2 = c.write(0);
        right[i] += (wet2 - right[i]) * amount;
      }
      this.lpDecay1 = lpDecay1;
      this.lpDecay2 = lpDecay2;
    }
  };

  // js/audio/worklets/rings/dsp/part.js
  var kSampleRate4 = 48e3;
  var kMaxBlockSize = 24;
  var kMaxPolyphony = 4;
  var kNumStrings = kMaxPolyphony * 2;
  var a32 = 440 / kSampleRate4;
  var ResonatorModel = {
    MODAL: 0,
    SYMPATHETIC_STRING: 1,
    STRING: 2,
    FM_VOICE: 3,
    SYMPATHETIC_STRING_QUANTIZED: 4,
    STRING_AND_REVERB: 5,
    LAST: 6
  };
  var MODEL_GAINS = [
    1.4,
    // MODAL
    1,
    // SYMPATHETIC_STRING
    1.4,
    // STRING
    0.7,
    // FM_VOICE
    1,
    // SYMPATHETIC_STRING_QUANTIZED
    1.4
    // STRING_AND_REVERB
  ];
  var PING_PATTERN = [1, 0, 2, 1, 0, 2, 1, 0];
  var CHORDS = [
    // 1 voice (8 strings)
    [
      [-12, 0, 0.01, 0.02, 0.03, 11.98, 11.99, 12],
      [-12, 0, 3, 3.01, 7, 9.99, 10, 19],
      [-12, 0, 3, 3.01, 7, 11.99, 12, 19],
      [-12, 0, 3, 3.01, 7, 13.99, 14, 19],
      [-12, 0, 3, 3.01, 7, 16.99, 17, 19],
      [-12, 0, 6.98, 6.99, 7, 12, 18.99, 19],
      [-12, 0, 3.99, 4, 7, 16.99, 17, 19],
      [-12, 0, 3.99, 4, 7, 13.99, 14, 19],
      [-12, 0, 3.99, 4, 7, 11.99, 12, 19],
      [-12, 0, 3.99, 4, 7, 10.99, 11, 19],
      [-12, 0, 4.99, 5, 7, 11.99, 12, 17]
    ],
    // 2 voices (4 strings each)
    [
      [-12, 0, 0.01, 12],
      [-12, 3, 7, 10],
      [-12, 3, 7, 12],
      [-12, 3, 7, 14],
      [-12, 3, 7, 17],
      [-12, 7, 12, 19],
      [-12, 4, 7, 17],
      [-12, 4, 7, 14],
      [-12, 4, 7, 12],
      [-12, 4, 7, 11],
      [-12, 5, 7, 12]
    ],
    // 3 voices (2 strings each)
    [
      [0, -12],
      [0, 0.01],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [0, 7],
      [0, 10],
      [0, 11],
      [0, 12],
      [-12, 12]
    ],
    // 4 voices (2 strings each)
    [
      [0, -12],
      [0, 0.01],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [0, 7],
      [0, 10],
      [0, 11],
      [0, 12],
      [-12, 12]
    ]
  ];
  var Patch = class {
    constructor() {
      this.structure = 0.5;
      this.brightness = 0.5;
      this.damping = 0.5;
      this.position = 0.5;
    }
  };
  var PerformanceState = class {
    constructor() {
      this.strum = false;
      this.internalExciter = true;
      this.internalStrum = true;
      this.internalNote = true;
      this.tonic = 0;
      this.note = 60;
      this.fm = 0;
      this.chord = 0;
    }
  };
  var Part = class {
    constructor() {
      this.resonator = [];
      for (let i = 0; i < kMaxPolyphony; i++) {
        this.resonator.push(new Resonator());
      }
      this.string = [];
      this.lfo = [];
      for (let i = 0; i < kNumStrings; i++) {
        this.string.push(new String());
        this.lfo.push(new CosineOscillator());
      }
      this.fmVoice = [];
      for (let i = 0; i < kMaxPolyphony; i++) {
        this.fmVoice.push(new FMVoice());
      }
      this.excitationFilter = [];
      this.dcBlocker = [];
      this.plucker = [];
      for (let i = 0; i < kMaxPolyphony; i++) {
        this.excitationFilter.push(new Svf());
        this.dcBlocker.push(new DCBlocker());
        this.plucker.push(new Plucker());
      }
      this.note = new Float32Array(kMaxPolyphony);
      this.noteFilter = new NoteFilter();
      this.resonatorInput = new Float32Array(kMaxBlockSize);
      this.sympatheticResonatorInput = new Float32Array(kMaxBlockSize);
      this.noiseBurstBuffer = new Float32Array(kMaxBlockSize);
      this.outBuffer = new Float32Array(kMaxBlockSize);
      this.auxBuffer = new Float32Array(kMaxBlockSize);
      this.limiter = new Limiter();
      this.reverb = new Reverb();
      this.bypass = false;
      this.dirty = true;
      this.model = ResonatorModel.MODAL;
      this.polyphony = 1;
      this.activeVoice = 0;
      this.stepCounter = 0;
    }
    init(reverbBuffer = null) {
      this.activeVoice = 0;
      this.note.fill(0);
      this.bypass = false;
      this.polyphony = 1;
      this.model = ResonatorModel.MODAL;
      this.dirty = true;
      for (let i = 0; i < kMaxPolyphony; i++) {
        this.excitationFilter[i].init();
        this.plucker[i].init();
        this.dcBlocker[i].init(1 - 10 / kSampleRate4);
      }
      this.reverb.init();
      this.limiter.init();
      this.noteFilter.init(
        kSampleRate4 / kMaxBlockSize,
        1e-3,
        // Lag time with sharp edge
        0.01,
        // Lag time after trigger
        0.05,
        // Transition time
        4e-3
        // Edge leak prevention
      );
    }
    setBypass(bypass) {
      this.bypass = bypass;
    }
    getPolyphony() {
      return this.polyphony;
    }
    setPolyphony(polyphony) {
      const oldPolyphony = this.polyphony;
      this.polyphony = Math.min(polyphony, kMaxPolyphony);
      for (let i = oldPolyphony; i < this.polyphony; i++) {
        this.note[i] = this.note[0] + i * 0.05;
      }
      this.dirty = true;
    }
    getModel() {
      return this.model;
    }
    setModel(model) {
      if (model !== this.model) {
        this.model = model;
        this.dirty = true;
      }
    }
    /**
     * Squash function for note interpolation
     */
    squash(x) {
      if (x < 0.5) {
        x *= 2;
        x *= x;
        x *= x;
        x *= x;
        x *= x;
        x *= 0.5;
      } else {
        x = 2 - 2 * x;
        x *= x;
        x *= x;
        x *= x;
        x *= x;
        x = 1 - 0.5 * x;
      }
      return x;
    }
    /**
     * Configure resonators based on model
     */
    configureResonators() {
      if (!this.dirty) return;
      switch (this.model) {
        case ResonatorModel.MODAL:
          {
            const resolution = Math.floor(64 / this.polyphony) - 4;
            for (let i = 0; i < this.polyphony; i++) {
              this.resonator[i].init();
              this.resonator[i].setResolution(resolution);
            }
          }
          break;
        case ResonatorModel.SYMPATHETIC_STRING:
        case ResonatorModel.STRING:
        case ResonatorModel.SYMPATHETIC_STRING_QUANTIZED:
        case ResonatorModel.STRING_AND_REVERB:
          {
            const lfoFrequencies = [0.5, 0.4, 0.35, 0.23, 0.211, 0.2, 0.171];
            for (let i = 0; i < kNumStrings; i++) {
              const hasDispersion = this.model === ResonatorModel.STRING || this.model === ResonatorModel.STRING_AND_REVERB;
              this.string[i].init(hasDispersion);
              let fLfo = kMaxBlockSize / kSampleRate4;
              fLfo *= lfoFrequencies[i % lfoFrequencies.length];
              this.lfo[i].init(fLfo, CosineOscillatorMode.APPROXIMATE);
            }
            for (let i = 0; i < this.polyphony; i++) {
              this.plucker[i].init();
            }
            if (this.model === ResonatorModel.STRING_AND_REVERB) {
              this.reverb.clear();
            }
          }
          break;
        case ResonatorModel.FM_VOICE:
          {
            for (let i = 0; i < this.polyphony; i++) {
              this.fmVoice[i].init();
            }
          }
          break;
      }
      if (this.activeVoice >= this.polyphony) {
        this.activeVoice = 0;
      }
      this.dirty = false;
    }
    /**
     * Compute sympathetic string notes
     */
    computeSympatheticStringsNotes(tonic, note, parameter, destination, numStrings) {
      const notes = [
        tonic,
        note - 12,
        note - 7.01955,
        note,
        note + 7.01955,
        note + 12,
        note + 19.01955,
        note + 24,
        note + 24
      ];
      const detunings = [0.013, 0.011, 7e-3, 0.017];
      if (parameter >= 2) {
        const chordIndex = Math.floor(parameter - 2);
        const chord = CHORDS[this.polyphony - 1][chordIndex];
        for (let i = 0; i < numStrings; i++) {
          destination[i] = chord[i] + note;
        }
        return;
      }
      const numDetunedStrings = numStrings - 1 >> 1;
      const firstDetunedString = numStrings - numDetunedStrings;
      let param = parameter;
      for (let i = 0; i < firstDetunedString; i++) {
        let noteValue = 3;
        if (i !== 0) {
          noteValue = param * 7;
          param += (1 - param) * 0.2;
        }
        const noteIntegral = Math.floor(noteValue);
        let noteFractional = noteValue - noteIntegral;
        noteFractional = this.squash(noteFractional);
        const a = notes[noteIntegral];
        const b = notes[noteIntegral + 1];
        noteValue = a + (b - a) * noteFractional;
        destination[i] = noteValue;
        if (i + firstDetunedString < numStrings) {
          destination[i + firstDetunedString] = destination[i] + detunings[i & 3];
        }
      }
    }
    /**
     * Render modal voice
     */
    renderModalVoice(voice, performanceState, patch, frequency, filterCutoff, size) {
      if (performanceState.internalExciter && voice === this.activeVoice && performanceState.strum) {
        this.resonatorInput[0] += 0.25 * semitonesToRatio(
          filterCutoff * filterCutoff * 24
        ) / filterCutoff;
      }
      this.excitationFilter[voice].processBlock(
        this.resonatorInput,
        this.resonatorInput,
        size,
        FilterMode.LOW_PASS
      );
      const r = this.resonator[voice];
      r.setFrequency(frequency);
      r.setStructure(patch.structure);
      r.setBrightness(patch.brightness * patch.brightness);
      r.setPosition(patch.position);
      r.setDamping(patch.damping);
      r.process(this.resonatorInput, this.outBuffer, this.auxBuffer, size);
    }
    /**
     * Render FM voice
     */
    renderFMVoice(voice, performanceState, patch, frequency, filterCutoff, size) {
      const v = this.fmVoice[voice];
      if (performanceState.internalExciter && voice === this.activeVoice && performanceState.strum) {
        v.triggerInternalEnvelope();
      }
      v.setFrequency(frequency);
      v.setRatio(patch.structure);
      v.setBrightness(patch.brightness);
      v.setFeedbackAmount(patch.position);
      v.setPosition(0);
      v.setDamping(patch.damping);
      v.process(this.resonatorInput, this.outBuffer, this.auxBuffer, size);
    }
    /**
     * Render string voice
     */
    renderStringVoice(voice, performanceState, patch, frequency, filterCutoff, size) {
      let numStrings = 1;
      const frequencies = new Float32Array(kNumStrings);
      if (this.model === ResonatorModel.SYMPATHETIC_STRING || this.model === ResonatorModel.SYMPATHETIC_STRING_QUANTIZED) {
        numStrings = 2 * kMaxPolyphony / this.polyphony;
        const parameter = this.model === ResonatorModel.SYMPATHETIC_STRING ? patch.structure : 2 + performanceState.chord;
        this.computeSympatheticStringsNotes(
          performanceState.tonic + performanceState.fm,
          performanceState.tonic + this.note[voice] + performanceState.fm,
          parameter,
          frequencies,
          numStrings
        );
        for (let i = 0; i < numStrings; i++) {
          frequencies[i] = semitonesToRatio(frequencies[i] - 69) * a32;
        }
      } else {
        frequencies[0] = frequency;
      }
      if (voice === this.activeVoice) {
        const gain = 1 / sqrt(numStrings * 2);
        for (let i = 0; i < size; i++) {
          this.resonatorInput[i] *= gain;
        }
      }
      this.excitationFilter[voice].processBlock(
        this.resonatorInput,
        this.resonatorInput,
        size,
        FilterMode.LOW_PASS
      );
      if (performanceState.internalExciter) {
        if (voice === this.activeVoice && performanceState.strum) {
          this.plucker[voice].trigger(frequency, filterCutoff * 8, patch.position);
        }
        this.plucker[voice].process(this.noiseBurstBuffer, size);
        for (let i = 0; i < size; i++) {
          this.resonatorInput[i] += this.noiseBurstBuffer[i];
        }
      }
      this.dcBlocker[voice].processBlock(this.resonatorInput, size);
      this.outBuffer.fill(0);
      this.auxBuffer.fill(0);
      const structure = patch.structure;
      const dispersion = structure < 0.24 ? (structure - 0.24) * 4.166 : structure > 0.26 ? (structure - 0.26) * 1.35135 : 0;
      for (let string = 0; string < numStrings; string++) {
        const i = voice + string * this.polyphony;
        const s = this.string[i];
        const lfoValue = this.lfo[i].next();
        let brightness = patch.brightness;
        let damping = patch.damping;
        let position = patch.position;
        let glide = 1;
        const stringIndex = string / numStrings;
        let input = this.resonatorInput;
        if (this.model === ResonatorModel.STRING_AND_REVERB) {
          damping *= 2 - damping;
        }
        if (string > 0 && performanceState.internalExciter) {
          brightness *= 2 - brightness;
          brightness *= 2 - brightness;
          damping = 0.7 + patch.damping * 0.27;
          const amount = (0.5 - Math.abs(0.5 - patch.position)) * 0.9;
          position = patch.position + lfoValue * amount;
          glide = semitonesToRatio((brightness - 1) * 36);
          input = this.sympatheticResonatorInput;
        }
        s.setDispersion(dispersion);
        s.setFrequencyWithSlew(frequencies[string], glide);
        s.setBrightness(brightness);
        s.setPosition(position);
        s.setDamping(damping + stringIndex * (0.95 - damping));
        s.process(input, this.outBuffer, this.auxBuffer, size);
        if (string === 0) {
          const gain = 0.2 / numStrings;
          for (let j = 0; j < size; j++) {
            const sum = this.outBuffer[j] - this.auxBuffer[j];
            this.sympatheticResonatorInput[j] = gain * sum;
          }
        }
      }
    }
    /**
     * Main processing function
     */
    process(performanceState, patch, input, out, aux, size) {
      if (this.bypass) {
        out.set(input.subarray(0, size));
        aux.set(input.subarray(0, size));
        return;
      }
      this.configureResonators();
      this.noteFilter.process(performanceState.note, performanceState.strum);
      if (performanceState.strum) {
        this.note[this.activeVoice] = this.noteFilter.getStableNote();
        if (this.polyphony > 1 && this.polyphony & 1) {
          this.activeVoice = PING_PATTERN[this.stepCounter % 8];
          this.stepCounter = (this.stepCounter + 1) % 8;
        } else {
          this.activeVoice = (this.activeVoice + 1) % this.polyphony;
        }
      }
      this.note[this.activeVoice] = this.noteFilter.getNote();
      out.fill(0, 0, size);
      aux.fill(0, 0, size);
      for (let voice = 0; voice < this.polyphony; voice++) {
        const cutoff = patch.brightness * (2 - patch.brightness);
        const note = this.note[voice] + performanceState.tonic + performanceState.fm;
        const frequency = semitonesToRatio(note - 69) * a32;
        const filterCutoffRange = performanceState.internalExciter ? frequency * semitonesToRatio((cutoff - 0.5) * 96) : 0.4 * semitonesToRatio((cutoff - 1) * 108);
        const filterCutoff = Math.min(
          voice === this.activeVoice ? filterCutoffRange : 10 / kSampleRate4,
          0.499
        );
        const filterQ = performanceState.internalExciter ? 1.5 : 0.8;
        this.excitationFilter[voice].setFQ(filterCutoff, filterQ, FrequencyApproximation.DIRTY);
        if (voice === this.activeVoice) {
          this.resonatorInput.set(input.subarray(0, size));
        } else {
          this.resonatorInput.fill(0, 0, size);
        }
        if (this.model === ResonatorModel.MODAL) {
          this.renderModalVoice(voice, performanceState, patch, frequency, filterCutoff, size);
        } else if (this.model === ResonatorModel.FM_VOICE) {
          this.renderFMVoice(voice, performanceState, patch, frequency, filterCutoff, size);
        } else {
          this.renderStringVoice(voice, performanceState, patch, frequency, filterCutoff, size);
        }
        if (this.polyphony === 1) {
          for (let i = 0; i < size; i++) {
            out[i] += this.outBuffer[i];
            aux[i] += this.auxBuffer[i];
          }
        } else {
          const destination = voice & 1 ? aux : out;
          for (let i = 0; i < size; i++) {
            destination[i] += this.outBuffer[i] - this.auxBuffer[i];
          }
        }
      }
      if (this.model === ResonatorModel.STRING_AND_REVERB) {
        for (let i = 0; i < size; i++) {
          const l = out[i];
          const r = aux[i];
          out[i] = l * patch.position + (1 - patch.position) * r;
          aux[i] = r * patch.position + (1 - patch.position) * l;
        }
        this.reverb.setAmount(0.1 + patch.damping * 0.5);
        this.reverb.setDiffusion(0.625);
        this.reverb.setTime(0.35 + 0.63 * patch.damping);
        this.reverb.setInputGain(0.2);
        this.reverb.setLp(0.3 + patch.brightness * 0.6);
        this.reverb.process(out, aux, size);
        for (let i = 0; i < size; i++) {
          aux[i] = -aux[i];
        }
      }
      this.limiter.process(out, aux, size, MODEL_GAINS[this.model]);
    }
  };

  // js/audio/worklets/rings/dsp/onset-detector.js
  var ZScorer = class {
    constructor() {
      this.coefficient = 0;
      this.mean = 0;
      this.variance = 0;
    }
    init(cutoff) {
      this.coefficient = cutoff;
      this.mean = 0;
      this.variance = 0;
    }
    /**
     * Update statistics and return centered value
     * @param {number} sample - Input sample
     * @returns {number} Centered value (sample - mean)
     */
    update(sample) {
      const centered = sample - this.mean;
      this.mean += this.coefficient * centered;
      this.variance += this.coefficient * (centered * centered - this.variance);
      return centered;
    }
    /**
     * Normalise sample by standard deviation
     * @param {number} sample - Input sample
     * @returns {number} Normalised value
     */
    normalise(sample) {
      return this.update(sample) / sqrt(this.variance);
    }
    /**
     * Test if sample is an outlier
     * @param {number} sample - Input sample
     * @param {number} threshold - Z-score threshold
     * @param {number} absoluteThreshold - Minimum absolute threshold (optional)
     * @returns {boolean} True if sample is an outlier
     */
    test(sample, threshold, absoluteThreshold = 0) {
      const value = this.update(sample);
      const stdThreshold = sqrt(this.variance) * threshold;
      if (absoluteThreshold > 0) {
        return value > stdThreshold && value > absoluteThreshold;
      }
      return value > stdThreshold;
    }
  };
  var Compressor = class {
    constructor() {
      this.attack = 0;
      this.decay = 0;
      this.level = 0;
      this.skew = 0;
    }
    init(attack, decay, maxGain) {
      this.attack = attack;
      this.decay = decay;
      this.level = 0;
      this.skew = 1 / maxGain;
    }
    /**
     * Process audio with AGC
     * @param {Float32Array} input - Input buffer
     * @param {Float32Array} output - Output buffer
     * @param {number} size - Number of samples
     */
    process(input, output, size) {
      for (let i = 0; i < size; i++) {
        const target = Math.abs(input[i]);
        if (target > this.level) {
          this.level += this.attack * (target - this.level);
        } else {
          this.level += this.decay * (target - this.level);
        }
        output[i] = input[i] / (this.skew + this.level);
      }
    }
  };
  var OnsetDetector = class {
    constructor() {
      this.compressor = new Compressor();
      this.lowMidFilter = new NaiveSvf();
      this.midHighFilter = new NaiveSvf();
      this.attack = new Float32Array(3);
      this.decay = new Float32Array(3);
      this.energy = new Float32Array(3);
      this.envelope = new Float32Array(3);
      this.onsetDf = 0;
      this.bands = [
        new Float32Array(32),
        new Float32Array(32),
        new Float32Array(32)
      ];
      this.zDf = new ZScorer();
      this.inhibitThreshold = 0;
      this.inhibitDecay = 0;
      this.inhibitTime = 0;
      this.inhibitCounter = 0;
    }
    /**
     * Initialise the onset detector
     * @param {number} low - Low frequency (normalised)
     * @param {number} lowMid - Low-mid crossover (normalised)
     * @param {number} midHigh - Mid-high crossover (normalised)
     * @param {number} decimatedSr - Decimated sample rate (block rate)
     * @param {number} ioiTime - Inter-onset interval time (seconds)
     */
    init(low, lowMid, midHigh, decimatedSr, ioiTime) {
      const ioiF = 1 / (ioiTime * decimatedSr);
      this.compressor.init(ioiF * 10, ioiF * 0.05, 40);
      this.lowMidFilter.init();
      this.midHighFilter.init();
      this.lowMidFilter.setFQ(lowMid, 0.5);
      this.midHighFilter.setFQ(midHigh, 0.5);
      this.attack[0] = lowMid;
      this.decay[0] = low * 0.25;
      this.attack[1] = lowMid;
      this.decay[1] = low * 0.25;
      this.attack[2] = lowMid;
      this.decay[2] = low * 0.25;
      this.envelope.fill(0);
      this.energy.fill(0);
      this.zDf.init(ioiF * 0.05);
      this.inhibitTime = Math.floor(ioiTime * decimatedSr);
      this.inhibitDecay = 1 / (ioiTime * decimatedSr);
      this.inhibitThreshold = 0;
      this.inhibitCounter = 0;
      this.onsetDf = 0;
    }
    /**
     * Process a block of samples and detect onsets
     * @param {Float32Array} samples - Input samples
     * @param {number} size - Number of samples
     * @returns {boolean} True if onset detected
     */
    process(samples, size) {
      this.compressor.process(samples, this.bands[0], size);
      this.midHighFilter.split(this.bands[0], this.bands[1], this.bands[2], size);
      this.lowMidFilter.split(this.bands[1], this.bands[0], this.bands[1], size);
      let onsetDf = 0;
      let totalEnergy = 0;
      for (let i = 0; i < 3; i++) {
        const s = this.bands[i];
        let energy = 0;
        let envelope = this.envelope[i];
        const increment = 4 >> i;
        for (let j = 0; j < size; j += increment) {
          const target = s[j] * s[j];
          if (target > envelope) {
            envelope += this.attack[i] * (target - envelope);
          } else {
            envelope += this.decay[i] * (target - envelope);
          }
          energy += envelope;
        }
        energy = sqrt(energy) * increment;
        this.envelope[i] = envelope;
        const derivative = energy - this.energy[i];
        onsetDf += derivative + Math.abs(derivative);
        this.energy[i] = energy;
        totalEnergy += energy;
      }
      this.onsetDf += 0.05 * (onsetDf - this.onsetDf);
      const outlierInDf = this.zDf.test(this.onsetDf, 1, 0.01);
      const exceedsEnergyThreshold = totalEnergy >= this.inhibitThreshold;
      const notInhibited = this.inhibitCounter === 0;
      const hasOnset = outlierInDf && exceedsEnergyThreshold && notInhibited;
      if (hasOnset) {
        this.inhibitThreshold = totalEnergy * 1.5;
        this.inhibitCounter = this.inhibitTime;
      } else {
        this.inhibitThreshold -= this.inhibitDecay * this.inhibitThreshold;
        if (this.inhibitCounter > 0) {
          this.inhibitCounter--;
        }
      }
      return hasOnset;
    }
  };

  // js/audio/worklets/rings/dsp/strummer.js
  var kSampleRate5 = 48e3;
  var Strummer = class {
    constructor() {
      this.onsetDetector = new OnsetDetector();
      this.previousNote = 69;
      this.inhibitCounter = 0;
      this.inhibitTimer = 0;
    }
    /**
     * Initialise the strummer
     * @param {number} ioi - Inter-onset interval time (seconds)
     * @param {number} sr - Block rate (sample rate / block size)
     */
    init(ioi, sr) {
      this.onsetDetector.init(
        8 / kSampleRate5,
        160 / kSampleRate5,
        1600 / kSampleRate5,
        sr,
        ioi
      );
      this.inhibitTimer = Math.floor(ioi * sr);
      this.inhibitCounter = 0;
      this.previousNote = 69;
    }
    /**
     * Process strumming logic
     * @param {Float32Array|null} input - Audio input for onset detection (null if not connected)
     * @param {number} size - Block size
     * @param {Object} performanceState - Performance state object
     * @param {number} performanceState.note - Current note value
     * @param {boolean} performanceState.strum - Strum trigger (modified in place)
     * @param {boolean} performanceState.internalStrum - Using internal strum logic
     * @param {boolean} performanceState.internalNote - Using internal note CV
     * @param {boolean} performanceState.internalExciter - Using internal exciter
     */
    process(input, size, performanceState) {
      const hasOnset = input && this.onsetDetector.process(input, size);
      const noteChanged = Math.abs(performanceState.note - this.previousNote) > 0.4;
      let inhibitTimer = this.inhibitTimer;
      if (performanceState.internalStrum) {
        const hasExternalNoteCv = !performanceState.internalNote;
        const hasExternalExciter = !performanceState.internalExciter;
        if (hasExternalNoteCv) {
          performanceState.strum = noteChanged;
        } else if (hasExternalExciter) {
          performanceState.strum = hasOnset;
          inhibitTimer *= 4;
        } else {
          performanceState.strum = false;
        }
      }
      if (this.inhibitCounter > 0) {
        this.inhibitCounter--;
        performanceState.strum = false;
      } else {
        if (performanceState.strum) {
          this.inhibitCounter = inhibitTimer;
        }
      }
      this.previousNote = performanceState.note;
    }
  };

  // js/audio/worklets/rings/fx/chorus.js
  var BUFFER_SIZE2 = 2048;
  var Chorus = class {
    constructor() {
      this.engine = new FxEngine(BUFFER_SIZE2);
      this.buffer = new Float32Array(BUFFER_SIZE2);
      this.amount = 0.5;
      this.depth = 0.5;
      this.phase1 = 0;
      this.phase2 = 0;
    }
    init() {
      this.engine.init(this.buffer);
      this.phase1 = 0;
      this.phase2 = 0;
    }
    setAmount(amount) {
      this.amount = amount;
    }
    setDepth(depth) {
      this.depth = depth * 384;
    }
    /**
     * Process stereo audio
     * @param {Float32Array} left - Left channel (modified in place)
     * @param {Float32Array} right - Right channel (modified in place)
     * @param {number} size - Number of samples
     */
    process(left, right, size) {
      const amount = this.amount;
      const depth = this.depth;
      for (let i = 0; i < size; i++) {
        const c = this.engine.start();
        const dryAmount = 1 - amount * 0.5;
        this.phase1 += 417e-8;
        if (this.phase1 >= 1) this.phase1 -= 1;
        this.phase2 += 5417e-9;
        if (this.phase2 >= 1) this.phase2 -= 1;
        const sin1 = interpolate(lutSine, this.phase1, LUT_SINE_SIZE - 1);
        const cos1 = interpolate(lutSine, this.phase1 + 0.25, LUT_SINE_SIZE - 1);
        const sin2 = interpolate(lutSine, this.phase2, LUT_SINE_SIZE - 1);
        const cos2 = interpolate(lutSine, this.phase2 + 0.25, LUT_SINE_SIZE - 1);
        c.read(left[i], 0.5);
        c.read(right[i], 0.5);
        c.writeDelay(0, BUFFER_SIZE2 - 1, 0, 0);
        c.load(0);
        c.interpolate(0, sin1 * depth + 1200, 0.5);
        c.interpolate(0, sin2 * depth + 800, 0.5);
        const wetL = c.write(0);
        left[i] = wetL * amount + left[i] * dryAmount;
        c.load(0);
        c.interpolate(0, cos1 * depth + 800, 0.5);
        c.interpolate(0, cos2 * depth + 1200, 0.5);
        const wetR = c.write(0);
        right[i] = wetR * amount + right[i] * dryAmount;
      }
    }
  };

  // js/audio/worklets/rings/fx/ensemble.js
  var BUFFER_SIZE3 = 4096;
  var LINE_L_BASE = 0;
  var LINE_R_BASE = 2048;
  var LINE_LENGTH = 2047;
  var Ensemble = class {
    constructor() {
      this.engine = new FxEngine(BUFFER_SIZE3);
      this.buffer = new Float32Array(BUFFER_SIZE3);
      this.amount = 0.5;
      this.depth = 0.5;
      this.phase1 = 0;
      this.phase2 = 0;
    }
    init() {
      this.engine.init(this.buffer);
      this.phase1 = 0;
      this.phase2 = 0;
    }
    setAmount(amount) {
      this.amount = amount;
    }
    setDepth(depth) {
      this.depth = depth * 128;
    }
    /**
     * Process stereo audio
     * @param {Float32Array} left - Left channel (modified in place)
     * @param {Float32Array} right - Right channel (modified in place)
     * @param {number} size - Number of samples
     */
    process(left, right, size) {
      const amount = this.amount;
      const depth = this.depth;
      for (let i = 0; i < size; i++) {
        const c = this.engine.start();
        const dryAmount = 1 - amount * 0.5;
        this.phase1 += 157e-7;
        if (this.phase1 >= 1) this.phase1 -= 1;
        this.phase2 += 137e-6;
        if (this.phase2 >= 1) this.phase2 -= 1;
        const phi1 = Math.floor(this.phase1 * 4096);
        const slow0 = lutSine[phi1 & 4095];
        const slow120 = lutSine[phi1 + 1365 & 4095];
        const slow240 = lutSine[phi1 + 2730 & 4095];
        const phi2 = Math.floor(this.phase2 * 4096);
        const fast0 = lutSine[phi2 & 4095];
        const fast120 = lutSine[phi2 + 1365 & 4095];
        const fast240 = lutSine[phi2 + 2730 & 4095];
        const a = depth * 1;
        const b = depth * 0.1;
        const mod1 = slow0 * a + fast0 * b;
        const mod2 = slow120 * a + fast120 * b;
        const mod3 = slow240 * a + fast240 * b;
        c.load(left[i]);
        c.writeDelay(LINE_L_BASE, LINE_LENGTH, 0, 0);
        c.load(right[i]);
        c.writeDelay(LINE_R_BASE, LINE_LENGTH, 0, 0);
        c.load(0);
        c.interpolate(LINE_L_BASE, mod1 + 1024, 0.33);
        c.interpolate(LINE_L_BASE, mod2 + 1024, 0.33);
        c.interpolate(LINE_R_BASE, mod3 + 1024, 0.33);
        const wetL = c.write(0);
        left[i] = wetL * amount + left[i] * dryAmount;
        c.load(0);
        c.interpolate(LINE_R_BASE, mod1 + 1024, 0.33);
        c.interpolate(LINE_R_BASE, mod2 + 1024, 0.33);
        c.interpolate(LINE_L_BASE, mod3 + 1024, 0.33);
        const wetR = c.write(0);
        right[i] = wetR * amount + right[i] * dryAmount;
      }
    }
  };

  // js/audio/worklets/rings/string-synth/string-synth-oscillator.js
  var OscillatorShape = {
    BRIGHT_SQUARE: 0,
    SQUARE: 1,
    DARK_SQUARE: 2,
    TRIANGLE: 3
  };
  var StringSynthOscillator = class _StringSynthOscillator {
    constructor() {
      this.phase = 0;
      this.phaseIncrement = 0.01;
      this.filterState = 0;
      this.high = false;
      this.nextSample = 0;
      this.nextSampleSaw = 0;
      this.gain = 0;
      this.gainSaw = 0;
    }
    init() {
      this.phase = 0;
      this.phaseIncrement = 0.01;
      this.filterState = 0;
      this.high = false;
      this.nextSample = 0;
      this.nextSampleSaw = 0;
      this.gain = 0;
      this.gainSaw = 0;
    }
    /**
     * PolyBLEP antialiasing sample (current sample)
     * @param {number} t - Phase position (0 to 1)
     * @returns {number} BLEP correction
     */
    static thisBlepSample(t) {
      return 0.5 * t * t;
    }
    /**
     * PolyBLEP antialiasing sample (next sample)
     * @param {number} t - Phase position (0 to 1)
     * @returns {number} BLEP correction
     */
    static nextBlepSample(t) {
      t = 1 - t;
      return -0.5 * t * t;
    }
    /**
     * Render oscillator with specified shape
     * @param {number} shape - OscillatorShape enum value
     * @param {boolean} interpolatePitch - Whether to interpolate pitch
     * @param {number} targetIncrement - Target phase increment
     * @param {number} targetGain - Target gain for main waveform
     * @param {number} targetGainSaw - Target gain for saw wave
     * @param {Float32Array} out - Output buffer (accumulated)
     * @param {number} size - Number of samples
     */
    render(shape, interpolatePitch, targetIncrement, targetGain, targetGainSaw, out, size) {
      if (targetIncrement >= 0.17) {
        targetGain *= 1 - (targetIncrement - 0.17) * 12.5;
        if (targetIncrement >= 0.25) {
          return;
        }
      }
      let phase = this.phase;
      const phaseIncrementInterp = new ParameterInterpolator(this.phaseIncrement, targetIncrement, size);
      this.phaseIncrement = targetIncrement;
      const gainInterp = new ParameterInterpolator(this.gain, targetGain, size);
      this.gain = targetGain;
      const gainSawInterp = new ParameterInterpolator(this.gainSaw, targetGainSaw, size);
      this.gainSaw = targetGainSaw;
      let nextSample = this.nextSample;
      let nextSampleSaw = this.nextSampleSaw;
      let filterState = this.filterState;
      let high = this.high;
      const pw = 0.5;
      for (let i = 0; i < size; i++) {
        let thisSample = nextSample;
        let thisSampleSaw = nextSampleSaw;
        nextSample = 0;
        nextSampleSaw = 0;
        const increment = interpolatePitch ? phaseIncrementInterp.next() : targetIncrement;
        phase += increment;
        let sample = 0;
        if (!high && phase >= pw) {
          const t = (phase - pw) / increment;
          thisSample += _StringSynthOscillator.thisBlepSample(t);
          nextSample += _StringSynthOscillator.nextBlepSample(t);
          high = true;
        }
        if (phase >= 1) {
          phase -= 1;
          const t = phase / increment;
          const a = _StringSynthOscillator.thisBlepSample(t);
          const b = _StringSynthOscillator.nextBlepSample(t);
          thisSample -= a;
          nextSample -= b;
          thisSampleSaw -= a;
          nextSampleSaw -= b;
          high = false;
        }
        nextSample += phase < pw ? 0 : 1;
        nextSampleSaw += phase;
        if (shape === OscillatorShape.TRIANGLE) {
          const integratorCoefficient = increment * 0.125;
          thisSample = 64 * (thisSample - 0.5);
          filterState += integratorCoefficient * (thisSample - filterState);
          sample = filterState;
        } else if (shape === OscillatorShape.DARK_SQUARE) {
          const integratorCoefficient = increment * 2;
          thisSample = 4 * (thisSample - 0.5);
          filterState += integratorCoefficient * (thisSample - filterState);
          sample = filterState;
        } else if (shape === OscillatorShape.BRIGHT_SQUARE) {
          const integratorCoefficient = increment * 2;
          thisSample = 2 * thisSample - 1;
          filterState += integratorCoefficient * (thisSample - filterState);
          sample = (thisSample - filterState) * 0.5;
        } else {
          thisSample = 2 * thisSample - 1;
          sample = thisSample;
        }
        thisSampleSaw = 2 * thisSampleSaw - 1;
        out[i] += sample * gainInterp.next() + thisSampleSaw * gainSawInterp.next();
      }
      this.high = high;
      this.phase = phase;
      this.nextSample = nextSample;
      this.nextSampleSaw = nextSampleSaw;
      this.filterState = filterState;
    }
    /**
     * Render with DARK_SQUARE shape and pitch interpolation (for fundamental)
     */
    renderDarkSquare(targetIncrement, targetGain, targetGainSaw, out, size) {
      this.render(OscillatorShape.DARK_SQUARE, true, targetIncrement, targetGain, targetGainSaw, out, size);
    }
    /**
     * Render with BRIGHT_SQUARE shape and no pitch interpolation (for harmonics)
     */
    renderBrightSquare(targetIncrement, targetGain, targetGainSaw, out, size) {
      this.render(OscillatorShape.BRIGHT_SQUARE, false, targetIncrement, targetGain, targetGainSaw, out, size);
    }
  };

  // js/audio/worklets/rings/string-synth/string-synth-voice.js
  var StringSynthVoice = class {
    /**
     * @param {number} numHarmonics - Number of harmonics (oscillators)
     */
    constructor(numHarmonics = 3) {
      this.numHarmonics = numHarmonics;
      this.oscillators = [];
      for (let i = 0; i < numHarmonics; i++) {
        this.oscillators.push(new StringSynthOscillator());
      }
    }
    init() {
      for (let i = 0; i < this.numHarmonics; i++) {
        this.oscillators[i].init();
      }
    }
    /**
     * Render the voice
     * @param {number} frequency - Base frequency (normalised to sample rate)
     * @param {Float32Array} amplitudes - Amplitude pairs [sq0, saw0, sq1, saw1, ...]
     * @param {number} summedHarmonics - Number of harmonics to render
     * @param {Float32Array} out - Output buffer (accumulated)
     * @param {number} size - Number of samples
     */
    render(frequency, amplitudes, summedHarmonics, out, size) {
      this.oscillators[0].renderDarkSquare(
        frequency,
        amplitudes[0],
        amplitudes[1],
        out,
        size
      );
      let freq = frequency;
      let ampIndex = 2;
      for (let i = 1; i < summedHarmonics; i++) {
        freq *= 2;
        this.oscillators[i].renderBrightSquare(
          freq,
          amplitudes[ampIndex],
          amplitudes[ampIndex + 1],
          out,
          size
        );
        ampIndex += 2;
      }
    }
  };

  // js/audio/worklets/rings/string-synth/string-synth-envelope.js
  var EnvelopeShape = {
    LINEAR: 0,
    QUARTIC: 1
  };
  var EnvelopeFlags = {
    RISING_EDGE: 1,
    FALLING_EDGE: 2,
    GATE: 4
  };
  var StringSynthEnvelope = class {
    constructor() {
      this.level = new Float32Array(4);
      this.rate = new Float32Array(4);
      this.shape = new Uint8Array(4);
      this.segment = 0;
      this.startValue = 0;
      this.value = 0;
      this.phase = 0;
      this.numSegments = 0;
      this.sustainPoint = 0;
    }
    init() {
      this.setAd(0.1, 1e-3);
      this.segment = this.numSegments;
      this.phase = 0;
      this.startValue = 0;
      this.value = 0;
    }
    /**
     * Process one envelope step
     * @param {number} flags - EnvelopeFlags bitmask
     * @returns {number} Current envelope value (0 to 1)
     */
    process(flags) {
      if (flags & EnvelopeFlags.RISING_EDGE) {
        this.startValue = this.segment === this.numSegments ? this.level[0] : this.value;
        this.segment = 0;
        this.phase = 0;
      } else if (flags & EnvelopeFlags.FALLING_EDGE && this.sustainPoint) {
        this.startValue = this.value;
        this.segment = this.sustainPoint;
        this.phase = 0;
      } else if (this.phase >= 1) {
        this.startValue = this.level[this.segment + 1];
        this.segment++;
        this.phase = 0;
      }
      const done = this.segment === this.numSegments;
      const sustained = this.sustainPoint && this.segment === this.sustainPoint && flags & EnvelopeFlags.GATE;
      let phaseIncrement = 0;
      if (!sustained && !done) {
        phaseIncrement = this.rate[this.segment];
      }
      let t = this.phase;
      if (this.shape[this.segment] === EnvelopeShape.QUARTIC) {
        t = 1 - t;
        t *= t;
        t *= t;
        t = 1 - t;
      }
      this.phase += phaseIncrement;
      this.value = this.startValue + (this.level[this.segment + 1] - this.startValue) * t;
      return this.value;
    }
    /**
     * Configure as AD (attack-decay) envelope
     * @param {number} attack - Attack rate (phase increment per sample)
     * @param {number} decay - Decay rate (phase increment per sample)
     */
    setAd(attack, decay) {
      this.numSegments = 2;
      this.sustainPoint = 0;
      this.level[0] = 0;
      this.level[1] = 1;
      this.level[2] = 0;
      this.rate[0] = attack;
      this.rate[1] = decay;
      this.shape[0] = EnvelopeShape.LINEAR;
      this.shape[1] = EnvelopeShape.QUARTIC;
    }
    /**
     * Configure as AR (attack-release with sustain) envelope
     * @param {number} attack - Attack rate (phase increment per sample)
     * @param {number} decay - Release rate (phase increment per sample)
     */
    setAr(attack, decay) {
      this.numSegments = 2;
      this.sustainPoint = 1;
      this.level[0] = 0;
      this.level[1] = 1;
      this.level[2] = 0;
      this.rate[0] = attack;
      this.rate[1] = decay;
      this.shape[0] = EnvelopeShape.LINEAR;
      this.shape[1] = EnvelopeShape.LINEAR;
    }
  };

  // js/audio/worklets/rings/string-synth/string-synth-part.js
  var kSampleRate6 = 48e3;
  var kMaxBlockSize2 = 24;
  var kMaxStringSynthPolyphony = 4;
  var kStringSynthVoices = 12;
  var kMaxChordSize = 8;
  var kNumHarmonics = 3;
  var kNumFormants = 3;
  var a33 = 440 / kSampleRate6;
  var FxType = {
    FORMANT: 0,
    CHORUS: 1,
    REVERB: 2,
    FORMANT_2: 3,
    ENSEMBLE: 4,
    REVERB_2: 5
  };
  var kRegistrationTableSize = 11;
  var registrations = [
    [1, 0, 0, 0, 0, 0],
    [1, 1, 0, 0, 0, 0],
    [1, 0, 1, 0, 0, 0],
    [1, 0.1, 0, 0, 1, 0],
    [1, 0.5, 1, 0, 1, 0],
    [1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 0],
    [0, 0.5, 1, 0, 1, 0],
    [0, 0, 1, 0, 1, 0],
    [0, 0, 0, 0, 1, 0],
    [0, 0, 0, 0, 0, 1]
  ];
  var kFormantTableSize = 5;
  var formants = [
    [700, 1100, 2400],
    // a
    [500, 1300, 1700],
    // e
    [400, 2e3, 2500],
    // i
    [600, 800, 2400],
    // o
    [300, 900, 2200]
    // u
  ];
  var kNumChords = 11;
  var chords = [
    // Polyphony 1: 8-note chords
    [
      [-24, -12, 0, 0.01, 0.02, 11.99, 12, 24],
      // OCT
      [-24, -12, 0, 3, 7, 10, 19, 24],
      // m7
      [-24, -12, 0, 3, 7, 12, 19, 24],
      // m
      [-24, -12, 0, 3, 7, 14, 19, 24],
      // m9
      [-24, -12, 0, 3, 7, 17, 19, 24],
      // m11
      [-24, -12, 0, 6.99, 7, 18.99, 19, 24],
      // 5
      [-24, -12, 0, 4, 7, 17, 19, 24],
      // M11
      [-24, -12, 0, 4, 7, 14, 19, 24],
      // M9
      [-24, -12, 0, 4, 7, 12, 19, 24],
      // M
      [-24, -12, 0, 4, 7, 11, 19, 24],
      // M7
      [-24, -12, 0, 5, 7, 12, 17, 24]
      // sus4
    ],
    // Polyphony 2: 6-note chords
    [
      [-24, -12, 0, 0.01, 12, 12.01],
      [-24, -12, 0, 3, 7, 10],
      [-24, -12, 0, 3, 7, 12],
      [-24, -12, 0, 3, 7, 14],
      [-24, -12, 0, 3, 7, 17],
      [-24, -12, 0, 6.99, 12, 19],
      [-24, -12, 0, 4, 7, 17],
      [-24, -12, 0, 4, 7, 14],
      [-24, -12, 0, 4, 7, 12],
      [-24, -12, 0, 4, 7, 11],
      [-24, -12, 0, 5, 7, 12]
    ],
    // Polyphony 3: 4-note chords
    [
      [-12, 0, 0.01, 12],
      [-12, 3, 7, 10],
      [-12, 3, 7, 12],
      [-12, 3, 7, 14],
      [-12, 3, 7, 17],
      [-12, 7, 12, 19],
      [-12, 4, 7, 17],
      [-12, 4, 7, 14],
      [-12, 4, 7, 12],
      [-12, 4, 7, 11],
      [-12, 5, 7, 12]
    ],
    // Polyphony 4: 3-note chords
    [
      [0, 0.01, 12],
      [0, 3, 10],
      [0, 3, 7],
      [0, 3, 14],
      [0, 3, 17],
      [0, 7, 19],
      [0, 4, 17],
      [0, 4, 14],
      [0, 4, 7],
      [0, 4, 11],
      [0, 5, 7]
    ]
  ];
  var VoiceGroup = class {
    constructor() {
      this.tonic = 0;
      this.envelope = new StringSynthEnvelope();
      this.chord = 0;
      this.structure = 0;
    }
  };
  var StringSynthPart = class {
    constructor() {
      this.voices = [];
      for (let i = 0; i < kStringSynthVoices; i++) {
        this.voices.push(new StringSynthVoice(kNumHarmonics));
      }
      this.groups = [];
      for (let i = 0; i < kMaxStringSynthPolyphony; i++) {
        this.groups.push(new VoiceGroup());
      }
      this.formantFilters = [];
      for (let i = 0; i < kNumFormants; i++) {
        this.formantFilters.push(new Svf());
      }
      this.ensemble = new Ensemble();
      this.reverb = new Reverb();
      this.chorus = new Chorus();
      this.limiter = new Limiter();
      this.numVoices = 0;
      this.activeGroup = 0;
      this.stepCounter = 0;
      this.polyphony = 1;
      this.acquisitionDelay = 0;
      this.fxType = FxType.ENSEMBLE;
      this.clearFx = false;
      this.noteFilter = new NoteFilter();
      this.filterInBuffer = new Float32Array(kMaxBlockSize2);
      this.filterOutBuffer = new Float32Array(kMaxBlockSize2);
    }
    init() {
      this.activeGroup = 0;
      this.acquisitionDelay = 0;
      this.polyphony = 1;
      this.fxType = FxType.ENSEMBLE;
      for (let i = 0; i < kStringSynthVoices; i++) {
        this.voices[i].init();
      }
      for (let i = 0; i < kMaxStringSynthPolyphony; i++) {
        this.groups[i].tonic = 0;
        this.groups[i].envelope.init();
      }
      for (let i = 0; i < kNumFormants; i++) {
        this.formantFilters[i].init();
      }
      this.limiter.init();
      this.reverb.init();
      this.chorus.init();
      this.ensemble.init();
      this.noteFilter.init(
        kSampleRate6 / kMaxBlockSize2,
        1e-3,
        // Lag time with a sharp edge on the V/Oct input or trigger
        5e-3,
        // Lag time after the trigger has been received
        0.05,
        // Time to transition from reactive to filtered
        4e-3
        // Prevent a sharp edge to partly leak on the previous voice
      );
      this.clearFx = false;
    }
    /**
     * Set polyphony (1-4)
     */
    setPolyphony(polyphony) {
      const oldPolyphony = this.polyphony;
      this.polyphony = Math.min(polyphony, kMaxStringSynthPolyphony);
      for (let i = oldPolyphony; i < this.polyphony; i++) {
        this.groups[i].tonic = this.groups[0].tonic + i * 0.01;
      }
      if (this.activeGroup >= this.polyphony) {
        this.activeGroup = 0;
      }
    }
    /**
     * Set FX type
     */
    setFx(fxType) {
      if (fxType % 3 !== this.fxType % 3) {
        this.clearFx = true;
      }
      this.fxType = fxType;
    }
    /**
     * Compute registration (harmonic amplitudes)
     */
    computeRegistration(gain, registration, amplitudes) {
      registration *= kRegistrationTableSize - 1.001;
      const registrationIntegral = Math.floor(registration);
      const registrationFractional = registration - registrationIntegral;
      let total = 0;
      for (let i = 0; i < kNumHarmonics * 2; i++) {
        const a = registrations[registrationIntegral][i];
        const b = registrations[registrationIntegral + 1][i];
        amplitudes[i] = a + (b - a) * registrationFractional;
        total += amplitudes[i];
      }
      for (let i = 0; i < kNumHarmonics * 2; i++) {
        amplitudes[i] = gain * amplitudes[i] / total;
      }
    }
    /**
     * Process envelopes for all groups
     */
    processEnvelopes(shape, flags, values) {
      let decay = shape;
      let attack = 0;
      if (shape < 0.5) {
        attack = 0;
      } else {
        attack = (shape - 0.5) * 2;
      }
      const period = kSampleRate6 / kMaxBlockSize2;
      const attackTime = semitonesToRatio(attack * 96) * 5e-3 * period;
      const decayTime = semitonesToRatio(decay * 84) * 0.18 * period;
      const attackRate = 1 / attackTime;
      const decayRate = 1 / decayTime;
      for (let i = 0; i < this.polyphony; i++) {
        let drone = shape < 0.98 ? 0 : (shape - 0.98) * 55;
        if (drone >= 1) drone = 1;
        this.groups[i].envelope.setAd(attackRate, decayRate);
        const value = this.groups[i].envelope.process(flags[i]);
        values[i] = value + (1 - value) * drone;
      }
    }
    /**
     * Process formant filter
     */
    processFormantFilter(vowel, shift, resonance, out, aux, size) {
      for (let i = 0; i < size; i++) {
        this.filterInBuffer[i] = out[i] + aux[i];
      }
      out.fill(0, 0, size);
      aux.fill(0, 0, size);
      vowel *= kFormantTableSize - 1.001;
      const vowelIntegral = Math.floor(vowel);
      const vowelFractional = vowel - vowelIntegral;
      for (let i = 0; i < kNumFormants; i++) {
        const a = formants[vowelIntegral][i];
        const b = formants[vowelIntegral + 1][i];
        let f = a + (b - a) * vowelFractional;
        f *= shift;
        this.formantFilters[i].setFQ(
          f / kSampleRate6,
          resonance,
          FrequencyApproximation.DIRTY
        );
        this.formantFilters[i].processBuffer(
          this.filterInBuffer,
          this.filterOutBuffer,
          size,
          SvfMode.BAND_PASS
        );
        const pan = i * 0.3 + 0.2;
        for (let j = 0; j < size; j++) {
          out[j] += this.filterOutBuffer[j] * pan * 0.5;
          aux[j] += this.filterOutBuffer[j] * (1 - pan) * 0.5;
        }
      }
    }
    /**
     * Process audio
     * @param {object} performanceState - { note, strum, tonic, fm, chord }
     * @param {object} patch - { structure, brightness, damping, position }
     * @param {Float32Array} input - Input buffer
     * @param {Float32Array} out - Left/odd output (modified in place)
     * @param {Float32Array} aux - Right/even output (modified in place)
     * @param {number} size - Number of samples
     */
    process(performanceState, patch, input, out, aux, size) {
      const envelopeFlags = new Uint8Array(kMaxStringSynthPolyphony);
      envelopeFlags.fill(0);
      this.noteFilter.process(performanceState.note, performanceState.strum);
      if (performanceState.strum) {
        this.groups[this.activeGroup].tonic = this.noteFilter.getStableNote();
        envelopeFlags[this.activeGroup] = EnvelopeFlags.FALLING_EDGE;
        this.activeGroup = (this.activeGroup + 1) % this.polyphony;
        envelopeFlags[this.activeGroup] = EnvelopeFlags.RISING_EDGE;
        this.acquisitionDelay = 3;
      }
      if (this.acquisitionDelay) {
        this.acquisitionDelay--;
      } else {
        this.groups[this.activeGroup].tonic = this.noteFilter.getNote();
        this.groups[this.activeGroup].chord = performanceState.chord || 0;
        this.groups[this.activeGroup].structure = patch.structure;
        envelopeFlags[this.activeGroup] |= EnvelopeFlags.GATE;
      }
      const envelopeValues = new Float32Array(kMaxStringSynthPolyphony);
      this.processEnvelopes(patch.damping, envelopeFlags, envelopeValues);
      for (let i = 0; i < size; i++) {
        out[i] = input[i];
        aux[i] = input[i];
      }
      const chordSize = Math.min(
        Math.floor(kStringSynthVoices / this.polyphony),
        kMaxChordSize
      );
      for (let group = 0; group < this.polyphony; group++) {
        const harmonics = new Float32Array(kNumHarmonics * 2);
        this.computeRegistration(
          envelopeValues[group] * 0.25,
          patch.brightness,
          harmonics
        );
        const chordIndex = this.groups[group].chord % kNumChords;
        const polyphonyIndex = this.polyphony - 1;
        for (let chordNote = 0; chordNote < chordSize; chordNote++) {
          let note = 0;
          note += this.groups[group].tonic;
          note += performanceState.tonic || 0;
          note += performanceState.fm || 0;
          note += chords[polyphonyIndex][chordIndex][chordNote];
          const chordNoteOffset = chords[polyphonyIndex][chordIndex][chordNote];
          const noteAmplitude = chordNoteOffset >= 0 && chordNoteOffset <= 17 ? 1 : 0.7;
          const amplitudes = new Float32Array(kNumHarmonics * 2);
          for (let i = 0; i < kNumHarmonics * 2; i++) {
            amplitudes[i] = noteAmplitude * harmonics[i];
          }
          let numHarmonics = this.polyphony >= 2 && chordNote < 2 ? kNumHarmonics - 1 : kNumHarmonics;
          for (let i = numHarmonics; i < kNumHarmonics; i++) {
            amplitudes[2 * (numHarmonics - 1)] += amplitudes[2 * i];
            amplitudes[2 * (numHarmonics - 1) + 1] += amplitudes[2 * i + 1];
          }
          const frequency = semitonesToRatio(note - 69) * a33;
          const voiceIndex = group * chordSize + chordNote;
          const outputBuffer = group + chordNote & 1 ? out : aux;
          this.voices[voiceIndex].render(
            frequency,
            amplitudes,
            numHarmonics,
            outputBuffer,
            size
          );
        }
      }
      if (this.clearFx) {
        this.reverb.clear();
        this.clearFx = false;
      }
      switch (this.fxType) {
        case FxType.FORMANT:
        case FxType.FORMANT_2:
          this.processFormantFilter(
            patch.position,
            this.fxType === FxType.FORMANT ? 1 : 1.1,
            this.fxType === FxType.FORMANT ? 25 : 10,
            out,
            aux,
            size
          );
          break;
        case FxType.CHORUS:
          this.chorus.setAmount(patch.position);
          this.chorus.setDepth(0.15 + 0.5 * patch.position);
          this.chorus.process(out, aux, size);
          break;
        case FxType.ENSEMBLE:
          this.ensemble.setAmount(patch.position * (2 - patch.position));
          this.ensemble.setDepth(0.2 + 0.8 * patch.position * patch.position);
          this.ensemble.process(out, aux, size);
          break;
        case FxType.REVERB:
        case FxType.REVERB_2:
          this.reverb.setAmount(patch.position * 0.5);
          this.reverb.setDiffusion(0.625);
          this.reverb.setTime(
            this.fxType === FxType.REVERB ? 0.5 + 0.49 * patch.position : 0.3 + 0.6 * patch.position
          );
          this.reverb.setInputGain(0.2);
          this.reverb.setLp(this.fxType === FxType.REVERB ? 0.3 : 0.6);
          this.reverb.process(out, aux, size);
          break;
      }
      for (let i = 0; i < size; i++) {
        aux[i] = -aux[i];
      }
      this.limiter.process(out, aux, size, 1);
    }
  };

  // js/audio/worklets/rings/rings-bundle.js
  var kSampleRate7 = 48e3;
  var kMaxPolyphony2 = 4;
  var kMaxBlockSize3 = 24;
  var a34 = 440 / 48e3;
  var RingsProcessor = class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        { name: "structure", defaultValue: 0.5, minValue: 0, maxValue: 1 },
        { name: "brightness", defaultValue: 0.5, minValue: 0, maxValue: 1 },
        { name: "damping", defaultValue: 0.5, minValue: 0, maxValue: 1 },
        { name: "position", defaultValue: 0.25, minValue: 0, maxValue: 1 }
      ];
    }
    constructor(options) {
      super();
      this.sampleRate = options.processorOptions?.sampleRate || kSampleRate7;
      this.model = ResonatorModel.MODAL;
      this.polyphony = 1;
      this.easterEggEnabled = false;
      this.pitchBend = 0;
      this.fxType = FxType.ENSEMBLE;
      this.activeNotes = /* @__PURE__ */ new Map();
      this.patch = new Patch();
      this.performanceState = new PerformanceState();
      this.part = new Part();
      this.part.init();
      this.stringSynth = new StringSynthPart();
      this.stringSynth.init();
      this.strummer = new Strummer();
      this.strummer.init(0.01, kSampleRate7 / kMaxBlockSize3);
      this.inputBuffer = new Float32Array(kMaxBlockSize3);
      this.leftBuffer = new Float32Array(kMaxBlockSize3);
      this.rightBuffer = new Float32Array(kMaxBlockSize3);
      this.pendingStrum = false;
      this.pendingNote = 60;
      this.pendingVelocity = 0;
      this.port.onmessage = this.handleMessage.bind(this);
      this.port.postMessage({ event: "debug", value: "RingsProcessor initialized" });
    }
    handleMessage(event) {
      const { type, note, velocity, value, name } = event.data;
      switch (type) {
        case "noteOn":
          this.noteOn(note, velocity);
          break;
        case "noteOff":
          this.noteOff(note);
          break;
        case "strum":
          this.strum(velocity);
          break;
        case "setModel":
          this.setModel(value);
          break;
        case "setPolyphony":
          this.setPolyphony(value);
          break;
        case "setEasterEgg":
          this.easterEggEnabled = value;
          if (this.easterEggEnabled) {
            this.stringSynth.setPolyphony(this.polyphony);
          }
          this.port.postMessage({ event: "easterEggChanged", value: this.easterEggEnabled });
          break;
        case "setFxType":
          this.fxType = value;
          this.stringSynth.setFx(this.fxType);
          this.port.postMessage({ event: "fxTypeChanged", value: this.fxType });
          break;
        case "pitchBend":
          this.pitchBend = value;
          break;
        case "setChord":
          this.performanceState.chord = value;
          break;
        case "setParam":
          break;
      }
    }
    setModel(model) {
      this.model = model;
      this.part.setModel(model);
      this.port.postMessage({ event: "modelChanged", value: this.model });
    }
    setPolyphony(polyphony) {
      this.polyphony = Math.max(1, Math.min(kMaxPolyphony2, polyphony));
      this.part.setPolyphony(this.polyphony);
      if (this.easterEggEnabled) {
        this.stringSynth.setPolyphony(this.polyphony);
      }
      this.port.postMessage({ event: "polyphonyChanged", value: this.polyphony });
    }
    noteOn(note, velocity) {
      this.pendingNote = note;
      this.pendingVelocity = velocity;
      this.pendingStrum = true;
      this.activeNotes.set(note, { velocity });
      this.port.postMessage({
        event: "noteOn",
        value: note,
        data: { velocity, model: this.model }
      });
    }
    noteOff(note) {
      if (this.activeNotes.has(note)) {
        this.activeNotes.delete(note);
        this.port.postMessage({ event: "noteOff", value: note });
      }
    }
    strum(velocity) {
      this.pendingStrum = true;
      this.pendingVelocity = velocity;
      this.port.postMessage({ event: "strum", value: velocity });
    }
    process(inputs, outputs, parameters) {
      const output = outputs[0];
      const input = inputs[0];
      const blockSize = output[0]?.length || 128;
      this.patch.structure = parameters.structure[0];
      this.patch.brightness = parameters.brightness[0];
      this.patch.damping = parameters.damping[0];
      this.patch.position = parameters.position[0];
      this.performanceState.note = this.pendingNote + this.pitchBend;
      this.performanceState.strum = this.pendingStrum;
      this.performanceState.tonic = 0;
      this.performanceState.fm = 0;
      this.pendingStrum = false;
      let offset = 0;
      while (offset < blockSize) {
        const thisBlockSize = Math.min(kMaxBlockSize3, blockSize - offset);
        if (input && input[0]) {
          for (let i = 0; i < thisBlockSize; i++) {
            this.inputBuffer[i] = (input[0][offset + i] || 0) + (input[1]?.[offset + i] || 0);
          }
        } else {
          this.inputBuffer.fill(0, 0, thisBlockSize);
        }
        this.leftBuffer.fill(0, 0, thisBlockSize);
        this.rightBuffer.fill(0, 0, thisBlockSize);
        if (this.easterEggEnabled) {
          this.stringSynth.process(
            this.performanceState,
            this.patch,
            this.inputBuffer,
            this.leftBuffer,
            this.rightBuffer,
            thisBlockSize
          );
        } else {
          this.part.process(
            this.performanceState,
            this.patch,
            this.inputBuffer,
            this.leftBuffer,
            this.rightBuffer,
            thisBlockSize
          );
        }
        if (output[0]) {
          for (let i = 0; i < thisBlockSize; i++) {
            output[0][offset + i] = this.leftBuffer[i];
          }
        }
        if (output[1]) {
          for (let i = 0; i < thisBlockSize; i++) {
            output[1][offset + i] = this.rightBuffer[i];
          }
        }
        this.performanceState.strum = false;
        offset += thisBlockSize;
      }
      return true;
    }
  };
  registerProcessor("rings-processor", RingsProcessor);
})();
