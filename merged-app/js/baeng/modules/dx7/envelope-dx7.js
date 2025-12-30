// DX7 Envelope Generator
// Based on http://wiki.music-synthesizer-for-android.googlecode.com/git/img/env.html

const ENV_OFF = 4;

// CRITICAL FIX: Maximum release duration to prevent infinite voice accumulation
// DX7 patches with non-zero release levels (levels[3] > 0) can get stuck at that level
// and never advance to ENV_OFF state, causing voices to run forever.
// 10 seconds is generous for any musical context (hardware DX7 similar timeout)
const MAX_RELEASE_SAMPLES = 10 * 48000; // 10 seconds at 48kHz
const outputlevel = [0, 5, 9, 13, 17, 20, 23, 25, 27, 29, 31, 33, 35, 37, 39,
	41, 42, 43, 45, 46, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61,
	62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
	81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99,
	100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114,
	115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 127];

const outputLUT = [];
for (let i = 0; i < 4096; i++) {
	const dB = (i - 3824) * 0.0235;
	outputLUT[i] = Math.pow(20, (dB/20));
}

class EnvelopeDX7 {
	constructor(levels, rates) {
		this.levels = levels;
		this.rates = rates;
		this.level = 0; // should start here
		this.i = 0;
		this.down = true;
		this.decayIncrement = 0;
		this.releaseSampleCount = 0; // Track release duration for timeout protection
		this.advance(0);
	}

	render() {
		if (this.state < 3 || (this.state < 4 && !this.down)) {
			let lev;
			lev = this.level;
			if (this.rising) {
				lev += this.decayIncrement * (2 + (this.targetlevel - lev) / 256);
				if (lev >= this.targetlevel) {
					lev = this.targetlevel;
					this.advance(this.state + 1);
				}
			} else {
				lev -= this.decayIncrement;
				// CRITICAL FIX: Snap to target when very close to prevent floating-point precision issues
				// Without this, envelope can get stuck at (targetlevel + epsilon), never advancing to next state
				// This causes voices to never finish, accumulating until audio thread is overloaded
				// This was the root cause of "after 8-10 bars" cutouts!
				if (lev <= this.targetlevel || Math.abs(lev - this.targetlevel) < 0.1) {
					lev = this.targetlevel;
					this.advance(this.state + 1);
				}
			}

			// CRITICAL FIX: Force envelope completion after max release duration
			// Prevents infinite voices from patches with non-zero release levels (levels[3] > 0)
			// These patches decay to the release level and stop, never reaching ENV_OFF state
			// This is the secondary bug causing voice accumulation (primary is per-track tracking)
			if (this.state == 3) {  // Release state
				this.releaseSampleCount++;
				if (this.releaseSampleCount > MAX_RELEASE_SAMPLES) {
					// Force envelope to complete
					this.level = 0;
					this.advance(4);  // Force ENV_OFF
					return 0;
				}
			}

			// CRITICAL FIX: Also flush absolute denormals to zero
			// This handles the case where targetlevel itself is near zero
			if (Math.abs(lev) < 1e-10) {
				lev = 0;
			}

			this.level = lev;
		}
		this.i++;

		// Convert DX7 level -> dB -> amplitude
		const output = outputLUT[Math.floor(this.level)];

		// CRITICAL FIX: Flush denormal numbers to zero to prevent 10-100x performance degradation
		// Envelopes decay asymptotically and can produce denormals during sustain/release phases
		// This prevents denormals from propagating through operator feedback loops
		return Math.abs(output) < 1e-15 ? 0 : output;
	}

	advance(newstate) {
		this.state = newstate;
		if (this.state < 4) {
			const newlevel = this.levels[this.state];
			this.targetlevel = Math.max(0, (outputlevel[newlevel] << 5) - 224); // 1 -> -192; 99 -> 127 -> 3840
			this.rising = (this.targetlevel - this.level) > 0;
			const rate_scaling = 0;
			this.qr = Math.min(63, rate_scaling + ((this.rates[this.state] * 41) >> 6)); // 5 -> 3; 49 -> 31; 99 -> 63
			this.decayIncrement = Math.pow(2, this.qr/4) / 2048;
		}
	}

	noteOff() {
		this.down = false;
		this.releaseSampleCount = 0; // Reset counter when entering release phase
		this.advance(3);
	}

	isFinished() {
		return this.state == ENV_OFF;
	}
}

export default EnvelopeDX7;
