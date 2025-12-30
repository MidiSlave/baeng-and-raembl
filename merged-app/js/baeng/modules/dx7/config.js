// DX7 Synth Configuration
// Updated to get sampleRate from AudioContext instead of hardcoded

const LFO_SAMPLE_PERIOD = 100;
let BUFFER_SIZE = 1024;
let POLYPHONY = 12;

// Check if navigator exists (not available in AudioWorklet scope)
if (typeof navigator !== 'undefined' && /iPad|iPhone|iPod|Android/.test(navigator.userAgent)) {
	BUFFER_SIZE = 4096;
	POLYPHONY = 8;
}

const Config = {
	sampleRate: 44100, // Default, will be updated by setSampleRate()
	lfoSamplePeriod: LFO_SAMPLE_PERIOD,
	bufferSize: BUFFER_SIZE,
	polyphony: POLYPHONY
};

// Function to update sample rate from AudioContext
export function setSampleRate(audioContext) {
	if (audioContext && audioContext.sampleRate) {
		Config.sampleRate = audioContext.sampleRate;
	}
}

export default Config;
