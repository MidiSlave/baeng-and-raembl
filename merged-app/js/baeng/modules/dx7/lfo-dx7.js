// DX7 LFO (Low Frequency Oscillator)

import config from './config.js';
import { fastSin } from './sine-table.js';

const PERIOD = Math.PI * 2;
const PERIOD_HALF = PERIOD / 2;
const PERIOD_RECIP = 1 / PERIOD;
const LFO_SAMPLE_PERIOD = config.lfoSamplePeriod;
const LFO_FREQUENCY_TABLE = [ // see https://github.com/smbolton/hexter/tree/master/src/dx7_voice.c#L1002
	0.062506,  0.124815,  0.311474,  0.435381,  0.619784,
	0.744396,  0.930495,  1.116390,  1.284220,  1.496880,
	1.567830,  1.738994,  1.910158,  2.081322,  2.252486,
	2.423650,  2.580668,  2.737686,  2.894704,  3.051722,
	3.208740,  3.366820,  3.524900,  3.682980,  3.841060,
	3.999140,  4.159420,  4.319700,  4.479980,  4.640260,
	4.800540,  4.953584,  5.106628,  5.259672,  5.412716,
	5.565760,  5.724918,  5.884076,  6.043234,  6.202392,
	6.361550,  6.520044,  6.678538,  6.837032,  6.995526,
	7.154020,  7.300500,  7.446980,  7.593460,  7.739940,
	7.886420,  8.020588,  8.154756,  8.288924,  8.423092,
	8.557260,  8.712624,  8.867988,  9.023352,  9.178716,
	9.334080,  9.669644, 10.005208, 10.340772, 10.676336,
	11.011900, 11.963680, 12.915460, 13.867240, 14.819020,
	15.770800, 16.640240, 17.509680, 18.379120, 19.248560,
	20.118000, 21.040700, 21.963400, 22.886100, 23.808800,
	24.731500, 25.759740, 26.787980, 27.816220, 28.844460,
	29.872700, 31.228200, 32.583700, 33.939200, 35.294700,
	36.650200, 37.812480, 38.974760, 40.137040, 41.299320,
	42.461600, 43.639800, 44.818000, 45.996200, 47.174400,
	47.174400, 47.174400, 47.174400, 47.174400, 47.174400,
	47.174400, 47.174400, 47.174400, 47.174400, 47.174400,
	47.174400, 47.174400, 47.174400, 47.174400, 47.174400,
	47.174400, 47.174400, 47.174400, 47.174400, 47.174400,
	47.174400, 47.174400, 47.174400, 47.174400, 47.174400,
	47.174400, 47.174400, 47.174400
];
const LFO_PITCH_MOD_TABLE = [
	0, 0.0264, 0.0534, 0.0889, 0.1612, 0.2769, 0.4967, 1
];
const LFO_MODE_TRIANGLE = 0,
	LFO_MODE_SAW_DOWN = 1,
	LFO_MODE_SAW_UP = 2,
	LFO_MODE_SQUARE = 3,
	LFO_MODE_SINE = 4,
	LFO_MODE_SAMPLE_HOLD = 5;

const LFO_DELAY_ONSET = 0,
	LFO_DELAY_RAMP = 1,
	LFO_DELAY_COMPLETE = 2;

// Private static variables
let phaseStep = 0;
let pitchModDepth = 0;
let ampModDepth = 0;
let sampleHoldRandom = 0;
let delayTimes = [0, 0, 0];
let delayIncrements = [0, 0, 0];
let delayVals = [0, 0, 1];
let params = {};

class LfoDX7 {
	constructor(opParams) {
		this.opParams = opParams;
		this.phase = 0;
		this.pitchVal = 0;
		this.counter = 0;
		this.ampVal = 1;
		this.ampValTarget = 1;
		this.ampIncrement = 0;
		this.delayVal = 0;
		this.delayState = LFO_DELAY_ONSET;
		LfoDX7.update();
	}

	render() {
		let amp;
		if (this.counter % LFO_SAMPLE_PERIOD === 0) {
			switch (params.lfoWaveform) {
				case LFO_MODE_TRIANGLE:
					if (this.phase < PERIOD_HALF)
						amp = 4 * this.phase * PERIOD_RECIP - 1;
					else
						amp = 3 - 4 * this.phase * PERIOD_RECIP;
					break;
				case LFO_MODE_SAW_DOWN:
					amp = 1 - 2 * this.phase * PERIOD_RECIP;
					break;
				case LFO_MODE_SAW_UP:
					amp = 2 * this.phase * PERIOD_RECIP - 1;
					break;
				case LFO_MODE_SQUARE:
					amp = (this.phase < PERIOD_HALF) ? -1 : 1;
					break;
				case LFO_MODE_SINE:
					// PERFORMANCE: Use sine lookup table (2-5x faster than Math.sin)
					amp = fastSin(this.phase);
					break;
				case LFO_MODE_SAMPLE_HOLD:
					amp = sampleHoldRandom;
					break;
			}

			switch (this.delayState) {
				case LFO_DELAY_ONSET:
				case LFO_DELAY_RAMP:
					this.delayVal += delayIncrements[this.delayState];
					if (this.counter / LFO_SAMPLE_PERIOD > delayTimes[this.delayState]) {
						this.delayState++;
						this.delayVal = delayVals[this.delayState];
					}
					break;
				case LFO_DELAY_COMPLETE:
					break;
			}

			amp *= this.delayVal;
			pitchModDepth = 1 +
				LFO_PITCH_MOD_TABLE[params.lfoPitchModSens] * (params.controllerModVal + params.lfoPitchModDepth / 99);
			this.pitchVal = Math.pow(pitchModDepth, amp);

			// Calculate amp modulation target
			const ampSensDepth = Math.abs(this.opParams.lfoAmpModSens) * 0.333333;
			const phase = (this.opParams.lfoAmpModSens > 0) ? 1 : -1;
			this.ampValTarget = 1 - ((ampModDepth + params.controllerModVal) * ampSensDepth * (amp * phase + 1) * 0.5);
			this.ampIncrement = (this.ampValTarget - this.ampVal) / LFO_SAMPLE_PERIOD;
			this.phase += phaseStep;
			// CRITICAL FIX: Bidirectional phase wraparound to handle negative modulation
			if (this.phase >= PERIOD) {
				sampleHoldRandom = 1 - Math.random() * 2;
				this.phase -= PERIOD;
			} else if (this.phase < 0) {
				this.phase += PERIOD;
			}
		}
		this.counter++;
		return this.pitchVal;
	}

	renderAmp() {
		this.ampVal += this.ampIncrement;

		// CRITICAL FIX: Flush denormal numbers to zero to prevent 10-100x performance degradation
		// LFO amplitude modulation can create very small values that become denormals
		// This prevents denormals from propagating through operator calculations
		if (Math.abs(this.ampVal) < 1e-15) {
			this.ampVal = 0;
		}

		return this.ampVal;
	}

	static setParams(globalParams) {
		params = globalParams;
	}

	static update() {
		const frequency = LFO_FREQUENCY_TABLE[params.lfoSpeed];
		const lfoRate = config.sampleRate/LFO_SAMPLE_PERIOD;
		phaseStep = PERIOD * frequency/lfoRate; // radians per sample
		ampModDepth = params.lfoAmpModDepth * 0.01;
		delayTimes[LFO_DELAY_ONSET] = (lfoRate * 0.001753 * Math.pow(params.lfoDelay, 3.10454) + 169.344 - 168) / 1000;
		delayTimes[LFO_DELAY_RAMP] = (lfoRate * 0.321877 * Math.pow(params.lfoDelay, 2.01163) + 494.201 - 168) / 1000;
		delayIncrements[LFO_DELAY_RAMP] = 1 / (delayTimes[LFO_DELAY_RAMP] - delayTimes[LFO_DELAY_ONSET]);
	}
}

export default LfoDX7;
