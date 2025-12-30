// DX7 SysEx Parser
// Parses Yamaha DX7 SysEx bulk data and single patches

const SysexDX7 = {
	bin2hex: function (s) {
		var i, f = s.length, a = [];
		for (i = 0; i < f; i++) {
			a[i] = ('0' + s.charCodeAt(i).toString(16)).slice(-2);
		}
		return a.join(' ');
	},

	// Detects format and loads appropriately
	loadBank: function (bankData) {
		// Check if this is a single voice (VCED format, ~155-163 bytes) or bulk dump (VMEM format, 4104 bytes)
		if (bankData.length >= 4000) {
			// Bulk dump - 32 voices
			var presets = [];
			for (var i = 0; i < 32; i++) {
				presets.push(this.extractPatchFromRom(bankData, i));
			}
			return presets;
		} else if (bankData.length >= 150 && bankData.length <= 200) {
			// Single voice VCED format
			return [this.extractSingleVoice(bankData)];
		} else {
			return [];
		}
	},

	// Parses single voice VCED format (unpacked, ~155-163 bytes)
	// See: http://homepages.abdn.ac.uk/mth192/pages/dx7/sysex-format.txt Section G
	extractSingleVoice: function (sysexData) {
		// Skip SysEx header (6 bytes: F0 43 00 00 01 1B)
		var dataStart = 6;
		var voiceData = sysexData.substring(dataStart);
		var operators = [{},{},{},{},{},{}];

		// VCED format: 6 operators × 21 bytes each = 126 bytes
		for (var i = 5; i >= 0; --i) {
			var oscStart = (5 - i) * 21; // VCED uses 21 bytes per operator
			var operator = operators[i];

			// EG rates (R1-R4)
			operator.rates = [
				voiceData.charCodeAt(oscStart + 0),
				voiceData.charCodeAt(oscStart + 1),
				voiceData.charCodeAt(oscStart + 2),
				voiceData.charCodeAt(oscStart + 3)
			];
			// EG levels (L1-L4)
			operator.levels = [
				voiceData.charCodeAt(oscStart + 4),
				voiceData.charCodeAt(oscStart + 5),
				voiceData.charCodeAt(oscStart + 6),
				voiceData.charCodeAt(oscStart + 7)
			];
			operator.keyScaleBreakpoint = voiceData.charCodeAt(oscStart + 8);
			operator.keyScaleDepthL = voiceData.charCodeAt(oscStart + 9);
			operator.keyScaleDepthR = voiceData.charCodeAt(oscStart + 10);
			operator.keyScaleCurveL = voiceData.charCodeAt(oscStart + 11);
			operator.keyScaleCurveR = voiceData.charCodeAt(oscStart + 12);
			operator.keyScaleRate = voiceData.charCodeAt(oscStart + 13);
			operator.lfoAmpModSens = voiceData.charCodeAt(oscStart + 14);
			operator.velocitySens = voiceData.charCodeAt(oscStart + 15);
			operator.volume = voiceData.charCodeAt(oscStart + 16); // Output level
			operator.oscMode = voiceData.charCodeAt(oscStart + 17);
			operator.freqCoarse = voiceData.charCodeAt(oscStart + 18);
			operator.freqFine = voiceData.charCodeAt(oscStart + 19);
			operator.detune = voiceData.charCodeAt(oscStart + 20) - 7; // Range 0-14, centered at 7
			// Extended/non-standard parameters
			operator.pan = ((i + 1)%3 - 1) * 25;
			operator.idx = i;
			operator.enabled = true;
		}

		// Voice parameters start at byte 126 (after 6 operators × 21 bytes)
		var voiceParams = 126;

		return {
			// Pitch EG rates
			pitchEnvelope: {
				rates: [
					voiceData.charCodeAt(voiceParams + 0),
					voiceData.charCodeAt(voiceParams + 1),
					voiceData.charCodeAt(voiceParams + 2),
					voiceData.charCodeAt(voiceParams + 3)
				],
				levels: [
					voiceData.charCodeAt(voiceParams + 4),
					voiceData.charCodeAt(voiceParams + 5),
					voiceData.charCodeAt(voiceParams + 6),
					voiceData.charCodeAt(voiceParams + 7)
				]
			},
			algorithm: voiceData.charCodeAt(voiceParams + 8) + 1, // Byte 134, range 0-31 -> 1-32
			feedback: voiceData.charCodeAt(voiceParams + 9),
			// Bytes 10 is oscillator sync (not used)
			lfoSpeed: voiceData.charCodeAt(voiceParams + 11),
			lfoDelay: voiceData.charCodeAt(voiceParams + 12),
			lfoPitchModDepth: voiceData.charCodeAt(voiceParams + 13),
			lfoAmpModDepth: voiceData.charCodeAt(voiceParams + 14),
			lfoWaveform: voiceData.charCodeAt(voiceParams + 15),
			lfoPitchModSens: voiceData.charCodeAt(voiceParams + 16),
			// Byte 17 is transpose (not used for drums)
			name: voiceData.substring(voiceParams + 18, voiceParams + 28).trim(), // Bytes 144-154, 10 chars
			operators: operators,
			controllerModVal: 0,
			aftertouchEnabled: 0,
			lfoSync: 0
		};
	},

	// see http://homepages.abdn.ac.uk/mth192/pages/dx7/sysex-format.txt
	// Section F: Data Structure: Bulk Dump Packed Format
	extractPatchFromRom: function (bankData, patchId) {
		var dataStart = 128 * patchId + 6;
		var dataEnd = dataStart + 128;
		var voiceData = bankData.substring(dataStart, dataEnd);
		var operators = [{},{},{},{},{},{}];

		for (var i = 5; i >= 0; --i) {
			var oscStart = (5 - i) * 17;
			var oscEnd = oscStart + 17;
			var oscData = voiceData.substring(oscStart, oscEnd);
			var operator = operators[i];

			operator.rates = [oscData.charCodeAt(0), oscData.charCodeAt(1), oscData.charCodeAt(2), oscData.charCodeAt(3)];
			operator.levels = [oscData.charCodeAt(4), oscData.charCodeAt(5), oscData.charCodeAt(6), oscData.charCodeAt(7)];
			operator.keyScaleBreakpoint = oscData.charCodeAt(8);
			operator.keyScaleDepthL = oscData.charCodeAt(9);
			operator.keyScaleDepthR = oscData.charCodeAt(10);
			operator.keyScaleCurveL = oscData.charCodeAt(11) & 3;
			operator.keyScaleCurveR = oscData.charCodeAt(11) >> 2;
			operator.keyScaleRate = oscData.charCodeAt(12) & 7;
			operator.detune = Math.floor(oscData.charCodeAt(12) >> 3) - 7; // range 0 to 14
			operator.lfoAmpModSens = oscData.charCodeAt(13) & 3;
			operator.velocitySens = oscData.charCodeAt(13) >> 2;
			operator.volume = oscData.charCodeAt(14);
			operator.oscMode = oscData.charCodeAt(15) & 1;
			operator.freqCoarse = Math.floor(oscData.charCodeAt(15) >> 1);
			operator.freqFine = oscData.charCodeAt(16);
			// Extended/non-standard parameters
			operator.pan = ((i + 1)%3 - 1) * 25; // Alternate panning: -25, 0, 25, -25, 0, 25
			operator.idx = i;
			operator.enabled = true;
		}

		return {
			algorithm: voiceData.charCodeAt(110) + 1, // start at 1 for readability
			feedback: voiceData.charCodeAt(111) & 7,
			operators: operators,
			name: voiceData.substring(118, 128),
			lfoSpeed: voiceData.charCodeAt(112),
			lfoDelay: voiceData.charCodeAt(113),
			lfoPitchModDepth: voiceData.charCodeAt(114),
			lfoAmpModDepth: voiceData.charCodeAt(115),
			lfoPitchModSens: voiceData.charCodeAt(116) >> 4,
			lfoWaveform: Math.floor(voiceData.charCodeAt(116) >> 1) & 7,
			lfoSync: voiceData.charCodeAt(116) & 1,
			pitchEnvelope: {
				rates: [voiceData.charCodeAt(102), voiceData.charCodeAt(103), voiceData.charCodeAt(104), voiceData.charCodeAt(105)],
				levels: [voiceData.charCodeAt(106), voiceData.charCodeAt(107), voiceData.charCodeAt(108), voiceData.charCodeAt(109)]
			},
			controllerModVal: 0,
			aftertouchEnabled: 0
		};
	}
};

export default SysexDX7;
