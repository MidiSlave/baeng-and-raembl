// DX7 Synth Voice Manager

const PER_VOICE_LEVEL = 0.125 / 6; // nominal per-voice level borrowed from Hexter
const PITCH_BEND_RANGE = 2; // semitones (in each direction)

const MIDI_CC_MODULATION = 1,
	MIDI_CC_SUSTAIN_PEDAL = 64;

class Synth {
	constructor(voiceClass, polyphony) {
		this.voices = [];
		this.voiceClass = voiceClass;
		this.polyphony = polyphony || 12;
		this.sustainPedalDown = false;
		this.eventQueue = [];
	}

	queueMidiEvent(ev) {
		this.eventQueue.push(ev);
	}

	processQueuedEventsUpToSampleTime(sampleTime) {
		if (this.eventQueue.length && this.eventQueue[0].timeStamp < sampleTime) {
			this.processMidiEvent(this.eventQueue.shift());
		}
	}

	processMidiEvent(ev) {
		const cmd = ev.data[0] >> 4;
		const channel = ev.data[0] & 0xf;
		const noteNumber = ev.data[1];
		const velocity = ev.data[2];

		if (channel === 9) // Ignore drum channel
			return;
		if (cmd === 8 || (cmd === 9 && velocity === 0)) { // note off
			this.noteOff(noteNumber);
		} else if (cmd === 9) {
			this.noteOn(noteNumber, velocity/99.0); // changed 127 to 99 to incorporate "overdrive"
		} else if (cmd === 11) {
			this.controller(noteNumber, velocity/127);
		} else if (cmd === 13) {
			this.channelAftertouch(noteNumber/127);
		} else if (cmd === 14) {
			this.pitchBend(((velocity * 128.0 + noteNumber) - 8192)/8192.0);
		}
	}

	getLatestNoteDown() {
		const voice = this.voices[this.voices.length - 1] || { note: 64 };
		return voice.note;
	}

	controller(controlNumber, value) {
		// see http://www.midi.org/techspecs/midimessages.php#3
		switch (controlNumber) {
			case MIDI_CC_MODULATION:
				this.voiceClass.modulationWheel(value);
				break;
			case MIDI_CC_SUSTAIN_PEDAL:
				this.sustainPedal(value > 0.5);
				break;
		}
	}

	channelAftertouch(value) {
		this.voiceClass.channelAftertouch(value);
	}

	sustainPedal(down) {
		if (down) {
			this.sustainPedalDown = true;
		} else {
			this.sustainPedalDown = false;
			for (let i = 0, l = this.voices.length; i < l; i++) {
				if (this.voices[i] && this.voices[i].down === false)
					this.voices[i].noteOff();
			}
		}
	}

	pitchBend(value) {
		this.voiceClass.pitchBend(value * PITCH_BEND_RANGE);
		for (let i = 0, l = this.voices.length; i < l; i++) {
			if (this.voices[i])
				this.voices[i].updatePitchBend();
		}
	}

	noteOn(note, velocity) {
		const voice = new this.voiceClass(note, velocity);
		if (this.voices.length >= this.polyphony) {
			// Remove first voice when polyphony limit reached
			this.voices.shift();
		}
		this.voices.push(voice);
	}

	noteOff(note) {
		for (let i = 0, voice; i < this.voices.length, voice = this.voices[i]; i++) {
			if (voice && voice.note === note && voice.down === true) {
				voice.down = false;
				if (this.sustainPedalDown === false)
					voice.noteOff();
				break;
			}
		}
	}

	panic() {
		this.sustainPedalDown = false;
		for (let i = 0, l = this.voices.length; i < l; i++) {
			if (this.voices[i])
				this.voices[i].noteOff();
		}
		this.voices = [];
	}

	render() {
		let outputL = 0;
		let outputR = 0;

		for (let i = 0, length = this.voices.length; i < length; i++) {
			const voice = this.voices[i];
			if (voice) {
				if (voice.isFinished()) {
					// Clear the note after release
					this.voices.splice(i, 1);
					i--; // undo increment
				} else {
					const output = voice.render();
					outputL += output[0];
					outputR += output[1];
				}
			}
		}
		return [outputL * PER_VOICE_LEVEL, outputR * PER_VOICE_LEVEL];
	}
}

export default Synth;
