// DX7 FM Operator

import config from './config.js';
import { fastSin } from './sine-table.js';

// http://www.chipple.net/dx7/fig09-4.gif
const OCTAVE_1024 = 1.0006771307; //Math.exp(Math.log(2)/1024);
const PERIOD = Math.PI * 2;

class Operator {
	constructor(params, baseFrequency, envelope, lfo) {
		this.phase = 0;
		this.val = 0;
		this.params = params;
		this.envelope = envelope;
		this.lfo = lfo;
		this._debugLogged = false; // Pre-declare for V8 hidden class optimization
		this.updateFrequency(baseFrequency);
	}

	updateFrequency(baseFrequency) {
		const frequency = this.params.oscMode ?
			this.params.freqFixed :
			baseFrequency * this.params.freqRatio * Math.pow(OCTAVE_1024, this.params.detune);
		this.phaseStep = PERIOD * frequency / config.sampleRate; // radians per sample
	}

	render(mod) {
		// PERFORMANCE: Use sine lookup table (2-5x faster than Math.sin)
		const sinVal = fastSin(this.phase + mod);
		const envVal = this.envelope.render();
		const lfoAmp = this.lfo.renderAmp();
		this.val = sinVal * envVal * lfoAmp;

		// CRITICAL FIX: Flush denormal numbers to zero to prevent 10-100x performance degradation
		// Denormals accumulate in feedback loops during envelope release/decay phases
		// This matches the "after a little while" symptom - denormals accumulate over time
		if (Math.abs(this.val) < 1e-15) {
			this.val = 0;
		}

		// Debug first render
		if (!this._debugLogged && this.params.idx === 0) {
			this._debugLogged = true;
		}

		this.phase += this.phaseStep * this.lfo.render();
		// CRITICAL FIX: Bidirectional phase wraparound to handle negative modulation
		if (this.phase >= PERIOD) {
			this.phase -= PERIOD;
		} else if (this.phase < 0) {
			this.phase += PERIOD;
		}
		return this.val;
	}

	noteOff() {
		this.envelope.noteOff();
	}

	isFinished() {
		return this.envelope.isFinished();
	}
}

export default Operator;
