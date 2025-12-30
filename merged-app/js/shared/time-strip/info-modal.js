/**
 * File: merged-app/js/shared/time-strip/info-modal.js
 * Draggable info modal component with parameter definitions
 */

import { state as baengState } from '../../baeng/state.js';
import { state as raemblState } from '../../raembl/state.js';
import { getCurrentCloudsModeName } from '../../raembl/modules/clouds.js';

// Storage key for position persistence
const STORAGE_KEY = 'baengRaemblInfoModalPosition';

// Parameter info definitions
const PARAM_INFO = {
    // ===== SHARED (Time Strip) =====
    'shared-bpm': {
        name: 'BPM (Tempo)',
        desc: 'Beats per minute. Controls the speed of both sequencers. Range: 20-300 BPM. Higher values = faster tempo.'
    },
    'shared-swing': {
        name: 'Swing',
        desc: 'Offsets every second 16th note to create a shuffle/groove feel. 0% = straight timing, 100% = maximum swing (triplet feel).'
    },
    'baeng-length': {
        name: 'Bæng Bar Length',
        desc: 'Number of bars in Bæng\'s drum sequence before looping (1-128). Independent of Ræmbl\'s length, allowing polymetric patterns.'
    },
    'raembl-length': {
        name: 'Ræmbl Bar Length',
        desc: 'Number of bars in Ræmbl\'s synth sequence before looping (1-128). Independent of Bæng\'s length, allowing polymetric patterns.'
    },
    'shared-play': {
        name: 'Play / Stop',
        desc: 'Starts or stops playback for both sequencers simultaneously. Both apps share the same transport and clock.'
    },
    'baeng-settings': {
        name: 'Bæng Settings',
        desc: 'Opens Bæng\'s settings menu: patch save/load, theme options, scale quantisation, and MIDI configuration.'
    },
    'raembl-settings': {
        name: 'Ræmbl Settings',
        desc: 'Opens Ræmbl\'s settings menu: patch save/load, FX mode (Classic/Clouds), theme options, and MIDI configuration.'
    },
    'info-button': {
        name: 'Info Toggle',
        desc: 'Shows or hides this parameter information panel. Drag the header to reposition. Position is saved between sessions.'
    },

    // ===== BÆNG - VOICES Module =====
    'baeng-voices-steps': {
        name: 'Euclidean Steps',
        desc: 'Total number of steps in the Euclidean pattern (1-16). Determines the pattern length for this voice. Works with FILLS to create rhythmic patterns.'
    },
    'baeng-voices-fills': {
        name: 'Euclidean Fills',
        desc: 'Number of active hits distributed across the pattern (0-16). Uses Euclidean algorithm for mathematically optimal spacing. 0 = silent, max = every step triggers.'
    },
    'baeng-voices-shift': {
        name: 'Pattern Shift',
        desc: 'Rotates the Euclidean pattern left/right (0-15 steps). Use to offset patterns against each other for polyrhythmic grooves.'
    },
    'baeng-voices-accent': {
        name: 'Accent Amount',
        desc: 'Number of steps that receive accent emphasis (0-16). Accented hits play louder with snappier attack. Distributed using Euclidean spacing.'
    },
    'baeng-voices-flam': {
        name: 'Flam Amount',
        desc: 'Number of steps that play a quick double-hit flam (0-16). Creates a "grace note" effect before the main hit. Classic technique for snares.'
    },
    'baeng-voices-ratchet': {
        name: 'Ratchet Amount',
        desc: 'Number of steps that play rapid-fire retriggered hits (0-16). Creates machine-gun or roll effects. Speed controlled by R-SPD parameter.'
    },
    'baeng-voices-rspd': {
        name: 'Ratchet Speed',
        desc: 'Speed multiplier for ratcheted steps (1-8x). Higher values = faster retriggering. 1x = 16ths, 2x = 32nds, 4x = 64ths, 8x = 128ths.'
    },
    'baeng-voices-gate': {
        name: 'Gate Length',
        desc: 'Duration of each triggered note as percentage of step length (0-100%). Short gates = staccato/punchy, long gates = sustained/legato.'
    },
    'baeng-voices-choke': {
        name: 'Choke Group',
        desc: 'Assigns voice to a mute group (0-4). Voices in the same group cut each other off. 0 = no choking. Classic use: open/closed hi-hats.'
    },
    'baeng-voices-prob': {
        name: 'Probability',
        desc: 'Chance that each step actually triggers (0-100%). 100% = always plays, 50% = coin flip. Adds human feel and variation to patterns.'
    },
    'baeng-voices-randomize': {
        name: 'Randomize',
        desc: 'Generates random Euclidean pattern parameters for the selected voice. Randomizes steps, fills, shift, accents, flams, and ratchets.'
    },
    'baeng-voices-seq-reset': {
        name: 'Sequence Reset',
        desc: 'When active, resets the sequencer to step 1 at the start of each bar. Keeps all voices locked to the same downbeat.'
    },
    'baeng-voices-save': {
        name: 'Save Voice Patch',
        desc: 'Saves the current voice settings (engine type, all parameters, Euclidean pattern) to a JSON file for later recall.'
    },
    'baeng-voices-load': {
        name: 'Load Voice Patch',
        desc: 'Loads a previously saved voice patch file. Restores engine type, all parameters, and Euclidean pattern settings.'
    },

    // ===== BÆNG - ENGINE Module =====
    'baeng-engine-tone': {
        name: 'Tone / Patch',
        desc: 'Controls tonal character. For analog drums: filter brightness. For DX7: patch selection within bank. For samplers: sample/slice selection.'
    },
    'baeng-engine-pitch': {
        name: 'Pitch',
        desc: 'Master pitch control for the voice. For melodic engines: semitone transposition (-24 to +24). For drums: fundamental frequency tuning.'
    },
    'baeng-engine-decay': {
        name: 'Decay / Depth',
        desc: 'Controls decay time or modulation depth depending on engine. For drums: sound duration. For DX7: FM modulator intensity.'
    },
    'baeng-engine-sweep': {
        name: 'Sweep / Rate',
        desc: 'For kicks: pitch envelope sweep amount. For hi-hats: brightness. For DX7: rate/filter control. Engine-dependent behaviour.'
    },
    'baeng-engine-level': {
        name: 'Voice Level',
        desc: 'Output volume for this voice (0-100%). Set relative levels between voices here. Further mixed at master output.'
    },
    'baeng-engine-pan': {
        name: 'Pan',
        desc: 'Stereo position (0-100%). 0% = hard left, 50% = centre, 100% = hard right. Spread voices across the stereo field.'
    },
    'baeng-engine-rvb': {
        name: 'Reverb Send',
        desc: 'Amount of signal sent to the reverb effect (0-100%). Higher values = more ambient/spacious. Per-voice control over reverb depth.'
    },
    'baeng-engine-dly': {
        name: 'Delay Send',
        desc: 'Amount of signal sent to the delay effect (0-100%). Creates echoes and rhythmic repeats. Per-voice control over delay depth.'
    },
    'baeng-engine-bit': {
        name: 'Bit Crush',
        desc: 'Reduces bit depth for lo-fi digital distortion (0-100%). Creates crunchy, retro, 8-bit style degradation. 0% = clean signal.'
    },
    'baeng-engine-drive': {
        name: 'Drive',
        desc: 'Waveshaper saturation amount (0-100%). Adds harmonic distortion and warmth. From subtle saturation to heavy overdrive.'
    },
    'baeng-engine-cloud': {
        name: 'Clouds Send',
        desc: 'Amount of signal sent to the Clouds granular processor (0-100%). Only visible when FX mode is set to Clouds.'
    },
    'baeng-engine-randomize': {
        name: 'Randomize',
        desc: 'Generates random engine parameters for the selected voice. Randomizes tone, pitch, decay, rate, level, pan, and effects sends.'
    },
    'baeng-engine-poly': {
        name: 'Polyphony Mode',
        desc: 'Sets voice polyphony for DX7/Sample engines. M = mono (retriggered), P2-P4 = 2-4 voice polyphony for overlapping notes.'
    },
    'baeng-engine-output': {
        name: 'Output Mode',
        desc: 'Switches analog drum output style. OUT = 808-style (combined output). AUX = 909-style (separate aux output for accent/processing).'
    },
    'baeng-engine-browse': {
        name: 'Browse Samples',
        desc: 'Opens the sample browser to select audio files for the SLICE engine. Supports WAV, MP3, and other common audio formats.'
    },
    'baeng-engine-slice-edit': {
        name: 'Edit Slices',
        desc: 'Opens the slice editor to view and modify slice points in the loaded sample. Create custom chop patterns.'
    },
    'baeng-engine-dx7-browse': {
        name: 'Browse DX7 Banks',
        desc: 'Opens the DX7 bank browser to select from available SysEx patch banks. Browse by category or name.'
    },
    'baeng-engine-kit-browse': {
        name: 'Browse Sample Kits',
        desc: 'Opens the sample kit browser to select from available drum kits. Each kit contains multiple samples for selection.'
    },

    // ===== BÆNG - RVB Module =====
    'baeng-rvb-pred': {
        name: 'Pre-Delay',
        desc: 'Time before reverb reflections begin (0-100ms). Longer pre-delay separates dry sound from reverb. Simulates larger spaces.'
    },
    'baeng-rvb-dec': {
        name: 'Decay Time',
        desc: 'How long the reverb tail lasts (0-100%). Short = tight room, long = cathedral. Affects perceived space size.'
    },
    'baeng-rvb-diff': {
        name: 'Diffusion',
        desc: 'Density of reverb reflections (0-100%). Low = distinct echoes, high = smooth wash. Higher values sound more natural.'
    },
    'baeng-rvb-damp': {
        name: 'Damping',
        desc: 'High-frequency absorption (0-100%). Higher values = darker, more muffled reverb. Simulates soft/absorptive room surfaces.'
    },
    'baeng-rvb-randomize': {
        name: 'Randomize',
        desc: 'Generates random reverb parameters. Randomizes pre-delay, decay, diffusion, and damping for creative sound design.'
    },
    'baeng-rvb-duck': {
        name: 'Sidechain Ducking',
        desc: 'Opens the sidechain ducking configuration. Route drum triggers to duck the reverb level, keeping the mix clean and punchy.'
    },

    // ===== BÆNG - DLY Module =====
    'baeng-dly-time': {
        name: 'Delay Time',
        desc: 'Echo time in SYNC mode (beat-synced) or FREE mode (1-4000ms). SYNC follows tempo for rhythmic delays.'
    },
    'baeng-dly-fdbk': {
        name: 'Feedback',
        desc: 'Amount of delayed signal fed back to input (0-100%). Higher = more repeats. Caution: very high values can build up.'
    },
    'baeng-dly-filt': {
        name: 'Filter',
        desc: 'Lowpass filter on delay line (0-100%). 50% = no filter. Lower = darker/tape-like repeats. Higher = brighter.'
    },
    'baeng-dly-wow': {
        name: 'Wow',
        desc: 'Slow pitch modulation simulating tape wow (0-100%). Adds vintage tape deck character with gentle pitch warble.'
    },
    'baeng-dly-flut': {
        name: 'Flutter',
        desc: 'Fast pitch modulation simulating tape flutter (0-100%). Creates subtle chorus/vibrato effect on repeats.'
    },
    'baeng-dly-sat': {
        name: 'Saturation',
        desc: 'Tape saturation/distortion on delay line (0-100%). Adds warmth and harmonic compression to repeats. Vintage tape feel.'
    },
    'baeng-dly-sync': {
        name: 'Sync Toggle',
        desc: 'Switches between tempo-synced delay (SYNC) and free-running milliseconds (FREE). SYNC locks to BPM for rhythmic echoes.'
    },
    'baeng-dly-randomize': {
        name: 'Randomize',
        desc: 'Generates random delay parameters. Randomizes time, feedback, filter, wow, flutter, and saturation for creative effects.'
    },
    'baeng-dly-duck': {
        name: 'Sidechain Ducking',
        desc: 'Opens the sidechain ducking configuration. Route drum triggers to duck the delay level, preventing muddy overlaps.'
    },

    // ===== BÆNG - BUS Module =====
    'baeng-bus-trim': {
        name: 'Input Trim',
        desc: 'Adjusts input level before processing (-12dB to +12dB). Use to optimise signal level hitting the bus effects.'
    },
    'baeng-bus-drive': {
        name: 'Bus Drive',
        desc: 'Master waveshaper saturation amount (0-100%). Adds warmth and glue to the mixed drums. Three drive modes: Soft/Med/Hard.'
    },
    'baeng-bus-crunch': {
        name: 'Crunch',
        desc: 'Mid-high frequency saturation (0-100%). Adds bite and presence to drums. Complements the broader Drive control.'
    },
    'baeng-bus-trans': {
        name: 'Transients',
        desc: 'Bipolar transient shaper. 50% = neutral. Below 50% = softer attacks, above 50% = punchier/snappier transients.'
    },
    'baeng-bus-damp': {
        name: 'Dampen',
        desc: 'Lowpass filter on bus output (500Hz-30kHz). Higher values = brighter. Use to tame harsh high frequencies.'
    },
    'baeng-bus-boom': {
        name: 'Boom Amount',
        desc: 'Sub-bass sine generator triggered by transients (0-100%). Adds weight and thump below the kick. Classic hip-hop technique.'
    },
    'baeng-bus-freq': {
        name: 'Boom Frequency',
        desc: 'Frequency of the boom sub-bass generator (30-90Hz). Lower = more sub-bass, higher = more audible fundamental.'
    },
    'baeng-bus-decay': {
        name: 'Boom Decay',
        desc: 'How long the boom sub-bass rings out (0-100%). Short = tight punch, long = sustained sub-bass tail.'
    },
    'baeng-bus-dw': {
        name: 'Dry/Wet',
        desc: 'Parallel blend of processed vs original signal (0-100%). 100% = fully processed. Lower for subtle parallel compression.'
    },
    'baeng-bus-out': {
        name: 'Output Gain',
        desc: 'Master output level (-12dB to +12dB). Final gain stage after all bus processing. Set overall drum volume here.'
    },
    'baeng-bus-comp': {
        name: 'Compressor',
        desc: 'Toggles bus compressor on/off. Adds glue and punch to the mixed drums. Works with transient shaper for dynamics control.'
    },
    'baeng-bus-soft': {
        name: 'Drive Mode',
        desc: 'Selects waveshaper character: SOFT (gentle saturation), MED (balanced), HARD (aggressive clipping). Affects Drive control response.'
    },

    // ===== BÆNG - CLOUDS Module =====
    'baeng-clouds-pitch': {
        name: 'Pitch Shift',
        desc: 'Transposes the granular output (-2 to +2 octaves). Creates harmonies, bass drops, or chipmunk effects on drum textures.'
    },
    'baeng-clouds-pos': {
        name: 'Buffer Position',
        desc: 'Where in the audio buffer grains are read from (0-100%). Scrub through captured drum audio. Freeze + position = wavetable-like.'
    },
    'baeng-clouds-dens': {
        name: 'Grain Density',
        desc: 'How many grains play simultaneously (0-100%). Sparse = rhythmic/glitchy, dense = smooth/pad-like texture.'
    },
    'baeng-clouds-size': {
        name: 'Grain Size',
        desc: 'Length of each grain (0-100%). Small = granular artifacts, large = smoother time-stretch. Affects texture character.'
    },
    'baeng-clouds-tex': {
        name: 'Texture',
        desc: 'Morphs between different grain windowing (0-100%). Changes tonal character from smooth to harsh/metallic.'
    },
    'baeng-clouds-dw': {
        name: 'Dry/Wet',
        desc: 'Blend of original vs processed signal (0-100%). 100% = full granular. Lower for parallel processing with dry drums.'
    },
    'baeng-clouds-sprd': {
        name: 'Stereo Spread',
        desc: 'Random stereo placement of grains (0-100%). Creates wide, immersive stereo field. 0 = mono centre.'
    },
    'baeng-clouds-fb': {
        name: 'Feedback',
        desc: 'Routes output back to input (0-100%). Default 0. CAUTION: High values cause feedback buildup. Start low!'
    },
    'baeng-clouds-verb': {
        name: 'Internal Reverb',
        desc: 'Built-in reverb amount (0-100%). Adds space within the granular processor. Stacks with main reverb.'
    },
    'baeng-clouds-in': {
        name: 'Input Gain',
        desc: 'Input level to the granular processor (0-200%). Boost weak signals or attenuate hot inputs before processing.'
    },
    'baeng-clouds-mode': {
        name: 'Playback Mode',
        desc: 'Granular: classic grains. WSOLA: time-stretch. Looping: delay-based. Spectral: FFT processing. Oliverb/Resonestor: Parasites modes.'
    },
    'baeng-clouds-randomize': {
        name: 'Randomize',
        desc: 'Generates random Clouds parameters. Randomizes pitch, position, density, size, texture, spread, feedback, reverb, and dry/wet.'
    },
    'baeng-clouds-quality': {
        name: 'Buffer Quality',
        desc: 'Sets audio buffer quality/length. HI: 16-bit stereo 1s. MED: 16-bit mono 2s. LO: 8-bit stereo 4s. XLO: 8-bit mono 8s.'
    },
    'baeng-clouds-freeze': {
        name: 'Freeze Buffer',
        desc: 'Captures and holds current audio in buffer. New input is ignored while frozen. Great for creating drones and frozen textures.'
    },
    'baeng-clouds-sync': {
        name: 'Clock Sync',
        desc: 'Syncs granular triggers to the main clock. Sends trigger pulses on each step for rhythmic granular effects.'
    },
    'baeng-clouds-duck': {
        name: 'Sidechain Ducking',
        desc: 'Opens the sidechain ducking configuration. Route drum triggers to duck the Clouds level, keeping transients clear.'
    },

    // ===== RÆMBL - FACTORS Module =====
    'raembl-factors-steps': {
        name: 'Euclidean Steps',
        desc: 'Total steps in the Euclidean pattern (1-32). Longer patterns enable complex polyrhythms. Works with FILLS for rhythm generation.'
    },
    'raembl-factors-fills': {
        name: 'Euclidean Fills',
        desc: 'Number of active notes distributed across the pattern (0-32). Euclidean algorithm spaces them optimally. 0 = silence, max = every step.'
    },
    'raembl-factors-shift': {
        name: 'Pattern Shift',
        desc: 'Rotates the pattern left/right (0-31 steps). Offsets where the pattern starts. Useful for syncopation against Bæng drums.'
    },
    'raembl-factors-accent': {
        name: 'Accent Amount',
        desc: 'Number of accented notes (0-16). Accents play with 1.5x velocity and snappier envelopes. Euclidean distribution.'
    },
    'raembl-factors-slide': {
        name: 'Slide Amount',
        desc: 'Number of notes with TB-303 style glide (0-16). Creates smooth pitch transitions between notes. 80ms slide time.'
    },
    'raembl-factors-trill': {
        name: 'Trill Amount',
        desc: 'Number of notes with pitch oscillation (0-16). Trills alternate to the next scale degree. Mono mode only.'
    },
    'raembl-factors-gate': {
        name: 'Gate Length',
        desc: 'Note duration as percentage of step (5-100%). Short = staccato acid basslines, long = legato pads. Affects envelope behaviour.'
    },
    'raembl-factors-seq': {
        name: 'Sequence Reset',
        desc: 'When active, resets the Euclidean pattern to step 1 at the start of each bar. Keeps patterns aligned with bar boundaries.'
    },

    // ===== RÆMBL - LFO Module =====
    'raembl-lfo-amp': {
        name: 'LFO Amplitude',
        desc: 'Depth/intensity of LFO modulation (0-100%). Higher values = stronger effect on modulated parameters. 0 = no modulation.'
    },
    'raembl-lfo-freq': {
        name: 'LFO Frequency',
        desc: 'Speed of LFO oscillation (0-100% maps to Hz range). Slow = sweeping effects, fast = vibrato/tremolo. Affects all LFO targets.'
    },
    'raembl-lfo-wave': {
        name: 'LFO Waveform',
        desc: 'Shape of the LFO wave: Sine (smooth), Triangle (linear), Square (on/off), Saw (ramp). Each creates different modulation character.'
    },
    'raembl-lfo-offset': {
        name: 'LFO Offset',
        desc: 'Bipolar DC offset added to LFO (-100 to +100%). Shifts the modulation centre point up or down. Useful for asymmetric modulation.'
    },
    'raembl-lfo-rst': {
        name: 'LFO Reset',
        desc: 'When active, resets LFO phase to 0 at the start of each bar. Keeps modulation in sync with the beat.'
    },

    // ===== RÆMBL - PATH Module =====
    'raembl-path-scale': {
        name: 'Scale',
        desc: 'Musical scale for pitch quantisation (32 scales). Chromatic, Major, Minor, Pentatonic, Blues, and many more. Notes snap to scale degrees.'
    },
    'raembl-path-root': {
        name: 'Root Note',
        desc: 'Root/key of the selected scale (C through B). All scale degrees are relative to this note. C = 0, C# = 1, etc.'
    },
    'raembl-path-prob': {
        name: 'Note Probability',
        desc: 'Chance that each step triggers a note (0-100%). 100% = always plays. Lower values add random rests for variation.'
    },

    // ===== RÆMBL - MOD Module =====
    'raembl-mod-rate': {
        name: 'Mod LFO Rate',
        desc: 'Speed of the modulation LFO (0-100%). This secondary LFO can modulate the main LFO or other parameters.'
    },
    'raembl-mod-wave': {
        name: 'Mod LFO Waveform',
        desc: 'Shape of the mod LFO: Sine, Triangle, Square, Saw, or S&H (random). Determines modulation character.'
    },

    // ===== RÆMBL - OSCILLATOR Module =====
    'raembl-osc-oct': {
        name: 'Main Octave',
        desc: 'Octave transposition for main oscillators (-4 to +4 octaves). Shifts the entire pitch range up or down.'
    },
    'raembl-osc-suboct': {
        name: 'Sub Octave',
        desc: 'Octave transposition for sub oscillator (-4 to +4). Often set lower than main for bass reinforcement.'
    },
    'raembl-osc-drift': {
        name: 'Oscillator Drift',
        desc: 'Random pitch drift between oscillators (0-100%). Adds analog-style tuning instability and warmth. Thickens the sound.'
    },
    'raembl-osc-glide': {
        name: 'Glide / Portamento',
        desc: 'Pitch slide time between notes (0-100%). Higher = slower glide. Classic TB-303 slide effect. Works best in mono mode.'
    },
    'raembl-osc-width': {
        name: 'Pulse Width',
        desc: 'Width of square wave (5-95%). 50% = pure square. Other values create asymmetric pulse waves with different harmonic content.'
    },
    'raembl-osc-pwm': {
        name: 'PWM Amount',
        desc: 'Pulse width modulation depth (0-100%). Animates the pulse width via LFO or envelope for classic synth movement.'
    },
    'raembl-osc-mod': {
        name: 'Pitch Mod',
        desc: 'Pitch modulation depth (0-100%). LFO or envelope modulates pitch for vibrato or pitch envelope effects.'
    },
    'raembl-osc-mode': {
        name: 'Mono / Poly Mode',
        desc: 'MONO: single voice with legato/glide. POLY: up to 8 voices for chords. Mono better for basslines, poly for pads.'
    },

    // ===== RÆMBL - MIXER Module =====
    'raembl-mixer-saw': {
        name: 'Sawtooth Level',
        desc: 'Volume of sawtooth waveform (0-100%). Bright, buzzy, harmonically rich. Classic for leads and basses.'
    },
    'raembl-mixer-square': {
        name: 'Square Level',
        desc: 'Volume of square/pulse waveform (0-100%). Hollow, woody tone. Width controlled by PULSE WIDTH parameter.'
    },
    'raembl-mixer-tri': {
        name: 'Triangle Level',
        desc: 'Volume of triangle waveform (0-100%). Soft, flute-like, few harmonics. Good for sub-bass and mellow tones.'
    },
    'raembl-mixer-sub': {
        name: 'Sub Oscillator Level',
        desc: 'Volume of sub oscillator (0-100%). Typically one octave below main pitch. Adds bass weight and foundation.'
    },
    'raembl-mixer-noise': {
        name: 'Noise Level',
        desc: 'Volume of white noise generator (0-100%). Adds breath, air, and texture. Essential for percussion and SFX.'
    },

    // ===== RÆMBL - FILTER Module =====
    'raembl-filter-hp': {
        name: 'Highpass Cutoff',
        desc: 'Highpass filter frequency (0-100%). Removes low frequencies below cutoff. Use to thin out bass or create telephone effects.'
    },
    'raembl-filter-lp': {
        name: 'Lowpass Cutoff',
        desc: 'Lowpass filter frequency (0-100%). The main filter - removes highs above cutoff. Classic subtractive synthesis control.'
    },
    'raembl-filter-res': {
        name: 'Resonance',
        desc: 'Filter emphasis at cutoff frequency (0-100%). Creates peak/whistling at cutoff. High values can self-oscillate.'
    },
    'raembl-filter-key': {
        name: 'Key Follow',
        desc: 'Filter tracks keyboard/note pitch (0-100%). Higher notes = higher cutoff. 100% = perfect tracking. Keeps brightness consistent.'
    },
    'raembl-filter-env': {
        name: 'Envelope Amount',
        desc: 'How much the filter envelope affects cutoff (0-100%). Creates filter sweeps synced to note triggers. Classic acid/pluck sounds.'
    },
    'raembl-filter-mod': {
        name: 'Filter LFO Mod',
        desc: 'LFO modulation of filter cutoff (0-100%). Creates wobbles, wah effects, and rhythmic filtering.'
    },

    // ===== RÆMBL - ENVELOPE Module =====
    'raembl-env-attack': {
        name: 'Attack',
        desc: 'Time for envelope to reach peak (0-100%). 0 = instant, higher = slower fade in. Affects both amp and filter envelopes.'
    },
    'raembl-env-decay': {
        name: 'Decay',
        desc: 'Time to fall from peak to sustain level (0-100%). Short decay = plucky, long decay = pad-like. Key for sound character.'
    },
    'raembl-env-sustain': {
        name: 'Sustain',
        desc: 'Level held while note is pressed (0-100%). 0 = full decay to silence, 100% = no decay. Determines held note volume.'
    },
    'raembl-env-release': {
        name: 'Release',
        desc: 'Time to fade after note release (0-100%). Short = tight/staccato, long = ambient/pad tails. Affects reverb perception.'
    },

    // ===== RÆMBL - REVERB Module =====
    'raembl-reverb-send': {
        name: 'Reverb Send',
        desc: 'Amount of signal sent to reverb (0-100%). Default 25%. Higher = more spacious/ambient sound.'
    },
    'raembl-reverb-pred': {
        name: 'Pre-Delay',
        desc: 'Gap before reverb starts (0-100ms). Separates dry sound from reflections. Longer = larger perceived space.'
    },
    'raembl-reverb-dec': {
        name: 'Decay Time',
        desc: 'Length of reverb tail (0-100%). Short = small room, long = hall/cathedral. Major factor in space perception.'
    },
    'raembl-reverb-diff': {
        name: 'Diffusion',
        desc: 'Density of reflections (0-100%). Low = distinct echoes, high = smooth wash. Higher usually sounds more natural.'
    },
    'raembl-reverb-damp': {
        name: 'Damping',
        desc: 'High-frequency absorption (0-100%). Higher = darker, warmer reverb. Simulates soft room surfaces.'
    },

    // ===== RÆMBL - DELAY Module =====
    'raembl-delay-send': {
        name: 'Delay Send',
        desc: 'Amount of signal sent to delay (0-100%). Default 25%. Creates echoes and rhythmic repetitions.'
    },
    'raembl-delay-time': {
        name: 'Delay Time',
        desc: 'Echo time - beat-synced in SYNC mode, milliseconds in FREE mode. SYNC keeps echoes rhythmically aligned.'
    },
    'raembl-delay-fdbk': {
        name: 'Feedback',
        desc: 'Delay repeats (0-100%). Higher = more echoes. Be careful with very high values - can build up.'
    },
    'raembl-delay-wow': {
        name: 'Wow',
        desc: 'Slow tape-style pitch wobble (0-100%). Adds vintage character and subtle pitch variation to repeats.'
    },
    'raembl-delay-flut': {
        name: 'Flutter',
        desc: 'Fast tape-style modulation (0-100%). Creates subtle chorus/vibrato effect on delay repeats.'
    },
    'raembl-delay-sat': {
        name: 'Saturation',
        desc: 'Tape saturation on delay (0-100%). Adds warmth and compression to repeats. Vintage tape machine character.'
    },
    'raembl-delay-sync': {
        name: 'Sync / Free',
        desc: 'SYNC: delay time follows BPM for rhythmic echoes. FREE: delay time in milliseconds, independent of tempo.'
    },

    // ===== RÆMBL - CLOUDS Module =====
    'raembl-clouds-pitch': {
        name: 'Pitch Shift',
        desc: 'Transposes the granular output (-2 to +2 octaves). Creates harmonies, bass drops, or chipmunk effects.'
    },
    'raembl-clouds-pos': {
        name: 'Buffer Position',
        desc: 'Where in the audio buffer grains are read from (0-100%). Scrub through captured audio. Freeze + position = wavetable-like.'
    },
    'raembl-clouds-dens': {
        name: 'Grain Density',
        desc: 'How many grains play simultaneously (0-100%). Sparse = rhythmic/glitchy, dense = smooth/pad-like texture.'
    },
    'raembl-clouds-size': {
        name: 'Grain Size',
        desc: 'Length of each grain (0-100%). Small = granular artifacts, large = smoother time-stretch. Affects texture character.'
    },
    'raembl-clouds-tex': {
        name: 'Texture',
        desc: 'Morphs between different grain windowing (0-100%). Changes tonal character from smooth to harsh/metallic.'
    },
    'raembl-clouds-dw': {
        name: 'Dry/Wet',
        desc: 'Blend of original vs processed signal (0-100%). 100% = full granular. Lower for parallel processing.'
    },
    'raembl-clouds-sprd': {
        name: 'Stereo Spread',
        desc: 'Random stereo placement of grains (0-100%). Creates wide, immersive stereo field. 0 = mono centre.'
    },
    'raembl-clouds-fb': {
        name: 'Feedback',
        desc: 'Routes output back to input (0-100%). Default 0. CAUTION: High values cause feedback buildup. Start low!'
    },
    'raembl-clouds-verb': {
        name: 'Internal Reverb',
        desc: 'Built-in reverb amount (0-100%). Adds space within the granular processor. Stacks with main reverb.'
    },
    'raembl-clouds-freeze': {
        name: 'Freeze Buffer',
        desc: 'Captures and holds current audio in buffer. New input is ignored while frozen. Great for creating drones and textures.'
    },
    'raembl-clouds-mode': {
        name: 'Playback Mode',
        desc: 'Granular: classic grains. WSOLA: time-stretch. Looping: delay-based. Spectral: FFT processing. Each has unique character.'
    },
    'raembl-clouds-quality': {
        name: 'Buffer Quality',
        desc: 'HI: 16-bit stereo 1-second buffer. Higher quality but more memory. Affects granular fidelity and buffer length.'
    },

    // ===== RÆMBL - OUTPUT Module =====
    'raembl-output-vol': {
        name: 'Master Volume',
        desc: 'Final output level for Ræmbl (0-100%). Default 75%. Set overall synth volume relative to Bæng drums.'
    },

    // ===== RÆMBL - PLAITS Engine Parameters =====
    'raembl-plaits-model': {
        name: 'Engine Model',
        desc: 'Selects one of 24 Plaits synthesis engines across 3 banks: GREEN (pitched/harmonic), RED (noise/physical), ORANGE (classic/FM). Modulatable via PPMod.'
    },
    'raembl-plaits-harm': {
        name: 'Harmonics',
        desc: 'Primary timbral control - meaning varies per engine. Controls harmonic content, detuning, density, or other engine-specific characteristics.'
    },
    'raembl-plaits-timbre': {
        name: 'Timbre',
        desc: 'Secondary timbral control - meaning varies per engine. Controls filter, FM amount, grain size, or other engine-specific characteristics.'
    },
    'raembl-plaits-morph': {
        name: 'Morph',
        desc: 'Tertiary control / crossfade - meaning varies per engine. Morphs between waveforms, textures, or engine-specific variations.'
    },
    'raembl-plaits-decay': {
        name: 'LPG Decay',
        desc: 'Low Pass Gate envelope decay time (10ms-4s). Shapes note duration via combined filter/VCA response. Classic West Coast synthesis technique.'
    },
    'raembl-plaits-colour': {
        name: 'LPG Colour',
        desc: 'LPG response character (0-100%). 0% = pure VCA (volume only). 100% = VCFA (filter + VCA). Adjusts brightness tracking with amplitude.'
    },
    'raembl-plaits-mix': {
        name: 'OUT/AUX Mix',
        desc: 'Crossfade between main output and auxiliary output (0-100%). 0% = main out only. 50% = equal mix. 100% = aux out only. Aux varies by engine.'
    },

    // ===== RÆMBL - RINGS Engine Parameters =====
    'raembl-rings-structure': {
        name: 'Structure',
        desc: 'Timbral character control - meaning varies per model. Controls inharmonicity, string coupling, dispersion, or FM ratio depending on resonator model.'
    },
    'raembl-rings-brightness': {
        name: 'Brightness',
        desc: 'High-frequency content (0-100%). Controls the spectral brightness of the resonator output. Higher values = brighter, more present sound.'
    },
    'raembl-rings-damping': {
        name: 'Damping',
        desc: 'Decay time / energy loss (0-100%). Controls how quickly resonance fades. Low = long, sustained resonance. High = quick, damped response.'
    },
    'raembl-rings-position': {
        name: 'Position',
        desc: 'Excitation position (0-100%). Where the resonator is struck, bowed, or plucked. Different positions emphasise different harmonics.'
    },
    'raembl-rings-strum': {
        name: 'Strum',
        desc: 'Internal excitation intensity (0-100%). Triggers the resonator with internal white noise burst. Use for self-excited sounds without external input.'
    }
};

// Engine-specific param definitions for Bæng ENGINE module
// These override PARAM_INFO entries based on current voice's engine type
const ENGINE_PARAM_INFO = {
    'baeng-engine-tone': {
        DX7:     { name: 'DX7 Patch', desc: 'Selects patch within the current bank. Load a .syx bank file to access different patches. Range: 0-31 patches per bank.' },
        aKICK:   { name: 'Kick Tone', desc: 'Lowpass filter cutoff controlling kick brightness. Low values = dark/subby, high values = bright/punchy. Range: 0-100%.' },
        aSNARE:  { name: 'Snare Tone', desc: 'Modal character of the snare body. Lower = tight 808 style, higher = extended overtones and ring. Range: 0-100%.' },
        aHIHAT:  { name: 'Hi-Hat Metal', desc: 'Oscillator spread controlling metallic character. Low = tight/focused, high = washy/trashy. Range: 0-100%.' },
        SAMPLE:  { name: 'Sample Select', desc: 'Selects sample from the current sample pack. Load samples via the browser. Displays current/total count.' },
        SLICE:   { name: 'Slice Select', desc: 'Selects slice from the loaded audio file. Use Edit button to adjust slice boundaries. Displays current/total count.' }
    },
    'baeng-engine-decay': {
        DX7:     { name: 'FM Depth', desc: 'Modulator intensity/FM depth. Higher values create more harmonic complexity and brightness. Range: 0-100%.' },
        aKICK:   { name: 'Kick Decay', desc: 'Duration of the kick drum sound. Short = punchy, long = boomy sub-bass tail. Range: 0-100%.' },
        aSNARE:  { name: 'Snare Decay', desc: 'Resonance and body decay time. Short = tight crack, long = open ring. Range: 0-100%.' },
        aHIHAT:  { name: 'Hi-Hat Decay', desc: 'Decay time from closed to open sound. Short = closed tight, long = open wash. Range: 0-100%.' },
        SAMPLE:  { name: 'Sample Decay', desc: 'Amplitude envelope decay time. Controls how quickly the sample fades after attack. Range: 0-100%.' },
        SLICE:   { name: 'Slice Decay', desc: 'Amplitude envelope decay time. Controls how quickly the slice fades after attack. Range: 0-100%.' }
    },
    'baeng-engine-sweep': {
        DX7:     { name: 'Envelope Rate', desc: 'Scales all DX7 envelope times. Lower = slower attack/decay, higher = snappier response. Range: 0-100%.' },
        aKICK:   { name: 'Pitch Sweep', desc: 'Amount of pitch drop from attack to sustain. Creates the classic "boom" of analog kicks. Range: 10-30 semitones.' },
        aSNARE:  { name: 'Snare Snap', desc: 'Noise burst intensity and attack sharpness. Low = soft body, high = aggressive crack. Range: 0-100%.' },
        aHIHAT:  { name: 'Hi-Hat Bright', desc: 'Highpass filter cutoff. Low = full spectrum, high = thin/sizzly top end only. Range: 0-100%.' },
        SAMPLE:  { name: 'Sample Filter', desc: 'Lowpass filter cutoff. Darkens the sample tone. 100% = fully open/bright. Range: 0-100%.' },
        SLICE:   { name: 'Slice Filter', desc: 'Lowpass filter cutoff. Darkens the slice tone. 100% = fully open/bright. Range: 0-100%.' }
    }
};

// Clouds mode-specific param definitions for Ræmbl CLOUDS module
// These override PARAM_INFO entries based on current Clouds mode
// Modes: 0=Granular, 1=WSOLA (Pitch-shifter/Time-stretcher), 2=Looping Delay, 3=Spectral, 4=Oliverb, 5=Resonestor
const CLOUDS_MODE_PARAM_INFO = {
    'raembl-clouds-pitch': {
        granular:   { name: 'Pitch Shift', desc: 'Transposes granular output (-24 to +24 semitones). Creates harmonies, octave drops, or chipmunk effects. Independent of playback speed.' },
        wsola:      { name: 'Pitch Shift', desc: 'Pitch transposition (-24 to +24 semitones) using WSOLA time-stretching. Changes pitch without changing speed. Quality varies with extreme settings.' },
        looping:    { name: 'Pitch Shift', desc: 'Loop pitch shift via sample rate conversion. Affects both pitch and perceived speed of the looped segment. Creates tape-style pitch effects.' },
        spectral:   { name: 'Pitch Shift', desc: 'FFT-based pitch shifting (-24 to +24 semitones). Spectral processing preserves formants better. Creates robotic/vocoder-like textures.' },
        oliverb:    { name: 'Pitch Shift', desc: 'Shimmer pitch transposition (-24 to +24 semitones). Adds pitched reflections to the reverb tail. Classic ambient/ethereal effect.' },
        resonestor: { name: 'Timbre', desc: 'Controls the harmonic structure of the resonator. Lower = darker, duller tones. Higher = brighter, more present overtones.' }
    },
    'raembl-clouds-pos': {
        granular:   { name: 'Buffer Position', desc: 'Where grains are read from in the audio buffer (0-100%). Scrub through captured audio. Freeze + position = wavetable-style scrubbing.' },
        wsola:      { name: 'Pre-delay', desc: 'Initial delay before pitch-shifted signal begins. Creates separation between dry and processed. Range: 0-100% of max delay time.' },
        looping:    { name: 'Clock Div/Mult', desc: 'Divides or multiplies the internal clock for loop timing. Creates rhythmic variations and tempo-synced repeats.' },
        spectral:   { name: 'Buffer Position', desc: 'Scrubs through the FFT buffer. When frozen, allows manual navigation through captured spectral content.' },
        oliverb:    { name: 'Pre-delay', desc: 'Gap before reverb reflections begin (0-100ms equivalent). Separates dry signal from reverb. Longer = larger perceived space.' },
        resonestor: { name: 'Chord', desc: 'Selects from 11 chord voicings for the sympathetic strings. Each chord creates different harmonic resonances when excited by input.' }
    },
    'raembl-clouds-dens': {
        granular:   { name: 'Grain Density', desc: 'Number of overlapping grains (0-100%). Sparse = rhythmic/glitchy textures. Dense = smooth, pad-like clouds. Key parameter for texture control.' },
        wsola:      { name: 'Diffusion', desc: 'Smears and diffuses the pitch-shifted signal. Low = clear, defined. High = washy, reverb-like. Blends with other reflections.' },
        looping:    { name: 'Diffusion', desc: 'Adds smearing/diffusion to the delay loop. Creates increasingly abstract textures with each repeat. High values = washy loops.' },
        spectral:   { name: 'Warp', desc: 'Spectral warping amount. Shifts frequency bands up or down. Creates formant shifting and frequency domain distortion effects.' },
        oliverb:    { name: 'Diffusion', desc: 'Density of early reflections (0-100%). Low = distinct echoes. High = smooth, dense reverb wash. Affects reverb character.' },
        resonestor: { name: 'Decay', desc: 'How long the sympathetic strings ring after excitation. Short = plucked/percussive. Long = sustained drone. Like decay on a reverb.' }
    },
    'raembl-clouds-size': {
        granular:   { name: 'Grain Size', desc: 'Length of each grain (0-100%). Small = grainy artifacts, glitchy. Large = smoother time-stretch. Interacts with density for texture.' },
        wsola:      { name: 'Window Size', desc: 'Size of the analysis/synthesis window. Smaller = more responsive, more artifacts. Larger = smoother, more latency. Trade-off: quality vs latency.' },
        looping:    { name: 'Loop Size', desc: 'Length of the delay loop (0-100% of buffer). Short = rhythmic delays. Long = ambient loops. Combined with feedback for layered textures.' },
        spectral:   { name: 'Temporal Quant', desc: 'Quantises time-domain information in FFT frames. Creates rhythmic stuttering and glitch effects. Higher = more extreme quantisation.' },
        oliverb:    { name: 'Reverb Size', desc: 'Size of the reverb space (0-100%). Small = room/chamber. Large = hall/infinite. Affects both decay and character.' },
        resonestor: { name: 'Duration', desc: 'Overall resonance time of the string model. Works with decay to shape the envelope. Short = quick response, long = sustained resonance.' }
    },
    'raembl-clouds-tex': {
        granular:   { name: 'Texture', desc: 'Morphs grain window shape (0-100%). Low = smooth Hann window. High = harsh rectangular window. Creates tonal changes from soft to metallic.' },
        wsola:      { name: 'LP/HP Filter', desc: 'Bipolar filter control. Centre = flat. Left = lowpass (darker). Right = highpass (thinner). Shapes the tonal character of the output.' },
        looping:    { name: 'LP/HP Filter', desc: 'Bipolar filter in the delay path. Centre = neutral. Left = lowpass, darker repeats. Right = highpass, thinner repeats.' },
        spectral:   { name: 'Spectral Quant', desc: 'Quantises frequency bins in FFT. Creates pitched, harmonic textures from noise. Higher values = stronger pitch quantisation.' },
        oliverb:    { name: 'Damping', desc: 'High-frequency absorption (0-100%). Low = bright, shimmery reverb. High = dark, muffled decay. Simulates room surface absorption.' },
        resonestor: { name: 'Dampening', desc: 'High-frequency roll-off on the resonator strings. Low = bright, metallic. High = muted, woody. Shapes the tonal colour of resonance.' }
    },
    'raembl-clouds-fb': {
        granular:   { name: 'Feedback', desc: 'Routes output back to input buffer (0-100%). Default 0. CAUTION: High values cause feedback buildup. Creates layered, evolving textures.' },
        wsola:      { name: 'Feedback', desc: 'Feeds pitch-shifted signal back to input. Creates cascading pitch shifts and shimmer. High values can be unstable - use carefully.' },
        looping:    { name: 'Feedback', desc: 'Amount of loop fed back for repeats (0-100%). Higher = more echoes, building textures. Careful at high values - can run away.' },
        spectral:   { name: 'Feedback', desc: 'Spectral feedback amount. Re-processes FFT output. Creates evolving, morphing spectral textures. Can become unstable at high values.' },
        oliverb:    { name: 'Feedback', desc: 'Reverb tail feedback amount. Higher values extend decay infinitely. Use for infinite reverb/freeze effects. Be cautious above 90%.' },
        resonestor: { name: 'Feedback', desc: 'Feeds resonator output back to excite strings again. Creates sustained drones and feedback textures. High values = infinite sustain.' }
    },
    'raembl-clouds-verb': {
        granular:   { name: 'Internal Reverb', desc: 'Built-in reverb amount (0-100%). Adds space within granular processor. Stacks with main reverb send. Creates ambient washes.' },
        wsola:      { name: 'Internal Reverb', desc: 'Reverb applied to pitch-shifted signal. Creates lush, spacious pitch effects. Useful for shimmer and ambient textures.' },
        looping:    { name: 'Internal Reverb', desc: 'Reverb on the delay output. Smooths and diffuses the loops. Creates ambient delay textures with added space.' },
        spectral:   { name: 'Internal Reverb', desc: 'Reverb applied to spectral output. Smooths harsh FFT artifacts. Creates ethereal, ambient spectral washes.' },
        oliverb:    { name: 'Reverb Amount', desc: 'Main reverb intensity for Oliverb mode. This IS the reverb - controls wet level. Higher = more ambient/washy.' },
        resonestor: { name: 'Reverb Amount', desc: 'Reverb applied to resonator output. Adds space and diffusion to the sympathetic strings. Creates ambient resonant textures.' }
    },
    'raembl-clouds-dw': {
        granular:   { name: 'Dry/Wet', desc: 'Balance of original vs granular signal (0-100%). 100% = full granular. Lower values for parallel processing / subtle effects.' },
        wsola:      { name: 'Dry/Wet', desc: 'Balance of dry vs pitch-shifted signal. 50% = equal blend for harmonies. 100% = pitch-shifted only.' },
        looping:    { name: 'Dry/Wet', desc: 'Balance of dry vs looped signal. 0% = dry only. 100% = loops only. Mid-values for slapback and doubling effects.' },
        spectral:   { name: 'Dry/Wet', desc: 'Balance of original vs spectral processed signal. Lower values blend in original for more natural results.' },
        oliverb:    { name: 'Dry/Wet', desc: 'Balance of dry vs reverb signal. 0% = dry. 100% = fully wet/reverb only. Mid-values for natural ambience.' },
        resonestor: { name: 'Dry/Wet', desc: 'Balance of dry input vs resonated output. 100% = sympathetic strings only. Lower for subtle harmonic enhancement.' }
    },
    'raembl-clouds-sprd': {
        granular:   { name: 'Stereo Spread', desc: 'Random stereo placement of grains (0-100%). Creates wide, immersive stereo field. 0 = mono centre, 100% = full stereo scatter.' },
        wsola:      { name: 'Stereo Spread', desc: 'Stereo width of pitch-shifted signal. Adds movement and width. Higher values = wider stereo image.' },
        looping:    { name: 'Stereo Spread', desc: 'Stereo panning of loop repeats. Creates ping-pong style effects and stereo movement in the delay.' },
        spectral:   { name: 'Stereo Spread', desc: 'Stereo distribution of spectral bands. Different frequencies placed across stereo field. Creates wide spectral images.' },
        oliverb:    { name: 'Stereo Spread', desc: 'Width of the reverb field. Low = narrow/mono. High = wide, enveloping stereo reverb. Affects immersion.' },
        resonestor: { name: 'Stereo Spread', desc: 'Stereo placement of different resonator strings. Creates wide, harp-like stereo image. Higher = more separation.' }
    },

    // ===== BÆNG CLOUDS Mode-Specific =====
    'baeng-clouds-pitch': {
        granular:   { name: 'Pitch Shift', desc: 'Transposes granular output (-24 to +24 semitones). Creates harmonies, octave drops, or chipmunk effects on drums.' },
        wsola:      { name: 'Pitch Shift', desc: 'Pitch transposition using WSOLA time-stretching. Changes pitch without changing speed. Quality varies with extreme settings.' },
        looping:    { name: 'Pitch Shift', desc: 'Loop pitch shift via sample rate conversion. Affects both pitch and perceived speed of the looped segment.' },
        spectral:   { name: 'Pitch Shift', desc: 'FFT-based pitch shifting. Spectral processing preserves formants better. Creates robotic/vocoder-like textures.' },
        oliverb:    { name: 'Pitch Shift', desc: 'Shimmer pitch transposition. Adds pitched reflections to the reverb tail. Classic ambient/ethereal effect.' },
        resonestor: { name: 'Timbre', desc: 'Controls the harmonic structure of the resonator. Lower = darker, duller tones. Higher = brighter, more present overtones.' }
    },
    'baeng-clouds-pos': {
        granular:   { name: 'Buffer Position', desc: 'Where grains are read from in the audio buffer (0-100%). Scrub through captured drums. Freeze + position = wavetable-style scrubbing.' },
        wsola:      { name: 'Pre-delay', desc: 'Initial delay before pitch-shifted signal begins. Creates separation between dry and processed.' },
        looping:    { name: 'Clock Div/Mult', desc: 'Divides or multiplies the internal clock for loop timing. Creates rhythmic variations and tempo-synced repeats.' },
        spectral:   { name: 'Buffer Position', desc: 'Scrubs through the FFT buffer. When frozen, allows manual navigation through captured spectral content.' },
        oliverb:    { name: 'Pre-delay', desc: 'Gap before reverb reflections begin. Separates dry signal from reverb. Longer = larger perceived space.' },
        resonestor: { name: 'Chord', desc: 'Selects from 11 chord voicings for the sympathetic strings. Each chord creates different harmonic resonances.' }
    },
    'baeng-clouds-dens': {
        granular:   { name: 'Grain Density', desc: 'Number of overlapping grains (0-100%). Sparse = rhythmic/glitchy textures. Dense = smooth, pad-like clouds.' },
        wsola:      { name: 'Diffusion', desc: 'Smears and diffuses the pitch-shifted signal. Low = clear, defined. High = washy, reverb-like.' },
        looping:    { name: 'Diffusion', desc: 'Adds smearing/diffusion to the delay loop. Creates increasingly abstract textures with each repeat.' },
        spectral:   { name: 'Warp', desc: 'Spectral warping amount. Shifts frequency bands up or down. Creates formant shifting and frequency domain distortion.' },
        oliverb:    { name: 'Diffusion', desc: 'Density of early reflections (0-100%). Low = distinct echoes. High = smooth, dense reverb wash.' },
        resonestor: { name: 'Decay', desc: 'How long the sympathetic strings ring after excitation. Short = plucked/percussive. Long = sustained drone.' }
    },
    'baeng-clouds-size': {
        granular:   { name: 'Grain Size', desc: 'Length of each grain (0-100%). Small = grainy artifacts, glitchy. Large = smoother time-stretch.' },
        wsola:      { name: 'Window Size', desc: 'Size of the analysis/synthesis window. Smaller = more responsive, more artifacts. Larger = smoother, more latency.' },
        looping:    { name: 'Loop Size', desc: 'Length of the delay loop (0-100% of buffer). Short = rhythmic delays. Long = ambient loops.' },
        spectral:   { name: 'Temporal Quant', desc: 'Quantises time-domain information in FFT frames. Creates rhythmic stuttering and glitch effects.' },
        oliverb:    { name: 'Reverb Size', desc: 'Size of the reverb space (0-100%). Small = room/chamber. Large = hall/infinite.' },
        resonestor: { name: 'Duration', desc: 'Overall resonance time of the string model. Works with decay to shape the envelope.' }
    },
    'baeng-clouds-tex': {
        granular:   { name: 'Texture', desc: 'Morphs grain window shape (0-100%). Low = smooth Hann window. High = harsh rectangular window. Soft to metallic.' },
        wsola:      { name: 'LP/HP Filter', desc: 'Bipolar filter control. Centre = flat. Left = lowpass (darker). Right = highpass (thinner).' },
        looping:    { name: 'LP/HP Filter', desc: 'Bipolar filter in the delay path. Centre = neutral. Left = lowpass. Right = highpass.' },
        spectral:   { name: 'Spectral Quant', desc: 'Quantises frequency bins in FFT. Creates pitched, harmonic textures from noise.' },
        oliverb:    { name: 'Damping', desc: 'High-frequency absorption (0-100%). Low = bright, shimmery reverb. High = dark, muffled decay.' },
        resonestor: { name: 'Dampening', desc: 'High-frequency roll-off on the resonator strings. Low = bright, metallic. High = muted, woody.' }
    },
    'baeng-clouds-fb': {
        granular:   { name: 'Feedback', desc: 'Routes output back to input buffer (0-100%). Default 0. CAUTION: High values cause feedback buildup.' },
        wsola:      { name: 'Feedback', desc: 'Feeds pitch-shifted signal back to input. Creates cascading pitch shifts and shimmer.' },
        looping:    { name: 'Feedback', desc: 'Amount of loop fed back for repeats (0-100%). Higher = more echoes. Careful at high values.' },
        spectral:   { name: 'Feedback', desc: 'Spectral feedback amount. Re-processes FFT output. Creates evolving, morphing spectral textures.' },
        oliverb:    { name: 'Feedback', desc: 'Reverb tail feedback amount. Higher values extend decay infinitely. Use for infinite reverb/freeze effects.' },
        resonestor: { name: 'Feedback', desc: 'Feeds resonator output back to excite strings again. Creates sustained drones and feedback textures.' }
    },
    'baeng-clouds-verb': {
        granular:   { name: 'Internal Reverb', desc: 'Built-in reverb amount (0-100%). Adds space within granular processor. Stacks with main reverb send.' },
        wsola:      { name: 'Internal Reverb', desc: 'Reverb applied to pitch-shifted signal. Creates lush, spacious pitch effects.' },
        looping:    { name: 'Internal Reverb', desc: 'Reverb on the delay output. Smooths and diffuses the loops.' },
        spectral:   { name: 'Internal Reverb', desc: 'Reverb applied to spectral output. Smooths harsh FFT artifacts.' },
        oliverb:    { name: 'Reverb Amount', desc: 'Main reverb intensity for Oliverb mode. This IS the reverb - controls wet level.' },
        resonestor: { name: 'Reverb Amount', desc: 'Reverb applied to resonator output. Adds space and diffusion to the sympathetic strings.' }
    },
    'baeng-clouds-dw': {
        granular:   { name: 'Dry/Wet', desc: 'Balance of original vs granular signal (0-100%). 100% = full granular. Lower for parallel processing.' },
        wsola:      { name: 'Dry/Wet', desc: 'Balance of dry vs pitch-shifted signal. 50% = equal blend for harmonies.' },
        looping:    { name: 'Dry/Wet', desc: 'Balance of dry vs looped signal. Mid-values for slapback and doubling effects.' },
        spectral:   { name: 'Dry/Wet', desc: 'Balance of original vs spectral processed signal. Lower values blend in original.' },
        oliverb:    { name: 'Dry/Wet', desc: 'Balance of dry vs reverb signal. 0% = dry. 100% = fully wet/reverb only.' },
        resonestor: { name: 'Dry/Wet', desc: 'Balance of dry input vs resonated output. 100% = sympathetic strings only.' }
    },
    'baeng-clouds-sprd': {
        granular:   { name: 'Stereo Spread', desc: 'Random stereo placement of grains (0-100%). Creates wide, immersive stereo field.' },
        wsola:      { name: 'Stereo Spread', desc: 'Stereo width of pitch-shifted signal. Adds movement and width.' },
        looping:    { name: 'Stereo Spread', desc: 'Stereo panning of loop repeats. Creates ping-pong style effects.' },
        spectral:   { name: 'Stereo Spread', desc: 'Stereo distribution of spectral bands. Different frequencies placed across stereo field.' },
        oliverb:    { name: 'Stereo Spread', desc: 'Width of the reverb field. Low = narrow/mono. High = wide, enveloping stereo reverb.' },
        resonestor: { name: 'Stereo Spread', desc: 'Stereo placement of different resonator strings. Creates wide, harp-like stereo image.' }
    },
    'baeng-clouds-in': {
        granular:   { name: 'Input Gain', desc: 'Input level to the granular processor (0-200%). Boost weak signals or attenuate hot inputs.' },
        wsola:      { name: 'Input Gain', desc: 'Input level before pitch-shifting. Higher = more saturation and presence.' },
        looping:    { name: 'Input Gain', desc: 'Input level to the delay loop. Affects how hard you hit the buffer.' },
        spectral:   { name: 'Input Gain', desc: 'Input level to FFT processor. Higher values = more spectral content captured.' },
        oliverb:    { name: 'Input Gain', desc: 'Input level to the reverb. Controls how much signal feeds the reverb tail.' },
        resonestor: { name: 'Input Gain', desc: 'Excitation level for the sympathetic strings. Higher = more resonance and sustain.' }
    }
};

// Plaits engine-specific param definitions (24 engines)
// These override PARAM_INFO entries based on current Plaits engine
const PLAITS_ENGINE_PARAM_INFO = {
    'raembl-plaits-harm': {
        0:  { name: 'Detuning', desc: 'Virtual Analog: Detuning amount between the two oscillators. Creates thick, classic polysynth sounds.' },
        1:  { name: 'Wavefolder Amount', desc: 'Waveshaping: Amount of wavefolding applied to the signal. Creates complex harmonic overtones.' },
        2:  { name: 'FM Ratio', desc: 'FM: Frequency ratio between carrier and modulator. Integer ratios = harmonic, non-integer = inharmonic/bell-like.' },
        3:  { name: 'Grain Rate', desc: 'Grain: Rate of grain generation. Higher = denser texture, lower = more rhythmic grain patterns.' },
        4:  { name: 'Bandwidth', desc: 'Additive: Bandwidth of each partial. Narrow = pure tones, wide = formant-like clusters.' },
        5:  { name: 'Table X', desc: 'Wavetable: Horizontal position in wavetable grid. Morphs between different waveforms.' },
        6:  { name: 'Chord Type', desc: 'Chord: Selects chord voicing (major, minor, sus4, 7th, etc.). 11 chord types available.' },
        7:  { name: 'Formant Shift', desc: 'Speech: Shifts formant frequencies up/down. Changes vowel character and vocal timbre.' },
        8:  { name: 'Swarm Density', desc: 'Swarm: Number and density of oscillators in the swarm. Creates massive detuned textures.' },
        9:  { name: 'Clock Rate', desc: 'Noise: Sample rate for the noise generator. Lower = grittier lo-fi noise, higher = smoother.' },
        10: { name: 'Density', desc: 'Particle: Density of particle generation. Sparse = rhythmic clicks, dense = texture/noise.' },
        11: { name: 'Exciter', desc: 'String: Exciter bow/pluck character. Low = smooth bowing, high = sharp pluck attack.' },
        12: { name: 'Inharmonicity', desc: 'Modal: Amount of inharmonicity in the 64 resonator modes. Creates bell/metallic tones.' },
        13: { name: 'Pitch Mod', desc: 'Bass Drum: Pitch modulation depth. Controls the classic "boom" pitch sweep of analog kicks.' },
        14: { name: 'Noise Tone', desc: 'Snare Drum: Tonal balance of the noise burst. Dark/muffled to bright/snappy.' },
        15: { name: 'Metal', desc: 'Hi-Hat: Metallic character. Low = dull cymbal, high = bright, cutting hi-hat.' },
        16: { name: 'Filter Type', desc: 'VA-VCF: Filter mode selection (lowpass, bandpass, highpass). Classic analog filter types.' },
        17: { name: 'PD Amount', desc: 'Phase Distortion: Amount of phase distortion. Creates bright, cutting timbres.' },
        18: { name: 'Ratio', desc: 'Six-Op FM 1: Carrier/modulator frequency ratio. Defines harmonic relationship.' },
        19: { name: 'Ratio', desc: 'Six-Op FM 2: Carrier/modulator frequency ratio for second algorithm.' },
        20: { name: 'Ratio', desc: 'Six-Op FM 3: Carrier/modulator frequency ratio for third algorithm.' },
        21: { name: 'Terrain X', desc: 'Wave Terrain: X position on the 2D wave terrain. Different terrains create different timbres.' },
        22: { name: 'Ensemble', desc: 'String Machine: Ensemble/chorus depth. Creates the lush, animated string machine character.' },
        23: { name: 'Pulse Width', desc: 'Chiptune: Pulse wave duty cycle. Classic 8-bit sound shaping parameter.' }
    },
    'raembl-plaits-timbre': {
        0:  { name: 'Filter Cutoff', desc: 'Virtual Analog: Lowpass filter cutoff frequency. Classic subtractive synthesis control.' },
        1:  { name: 'Asymmetry', desc: 'Waveshaping: Asymmetry of the waveshaping curve. Adds even harmonics for warmth.' },
        2:  { name: 'FM Amount', desc: 'FM: Modulation index / FM depth. Higher values = more complex, metallic tones.' },
        3:  { name: 'Grain Size', desc: 'Grain: Length of each grain. Short = granular texture, long = smooth time-stretch.' },
        4:  { name: 'Harmonic Bump', desc: 'Additive: Position of spectral brightness peak. Shapes formant-like resonances.' },
        5:  { name: 'Table Y', desc: 'Wavetable: Vertical position in wavetable grid. Second axis of wavetable morphing.' },
        6:  { name: 'Inversion', desc: 'Chord: Chord inversion (root, 1st, 2nd, 3rd). Changes the bass note of the chord.' },
        7:  { name: 'Phoneme', desc: 'Speech: Selects phoneme/vowel sound (a, e, i, o, u, consonants). The actual speech content.' },
        8:  { name: 'Spread', desc: 'Swarm: Pitch spread of the oscillator swarm. Narrow = unison, wide = massive detuned.' },
        9:  { name: 'Filter Type', desc: 'Noise: Filter resonance type (lowpass, bandpass, highpass). Shapes noise character.' },
        10: { name: 'Filter', desc: 'Particle: Filter cutoff for particles. Shapes the brightness of each particle burst.' },
        11: { name: 'Brightness', desc: 'String: High-frequency content of the string. Dark/muted to bright/present.' },
        12: { name: 'Brightness', desc: 'Modal: Brightness of the resonator modes. Dark/bell-like to bright/metallic.' },
        13: { name: 'Decay', desc: 'Bass Drum: Decay time of the kick drum. Short = punchy, long = sustained boom.' },
        14: { name: 'Decay', desc: 'Snare Drum: Overall decay time. Short = tight snare, long = open ring.' },
        15: { name: 'Brightness', desc: 'Hi-Hat: High-frequency content. Dull/dark to sizzly/bright.' },
        16: { name: 'Cutoff', desc: 'VA-VCF: Filter cutoff frequency. The main tone-shaping control.' },
        17: { name: 'Waveform', desc: 'Phase Distortion: Base waveform being distorted. Different starting shapes.' },
        18: { name: 'FM Depth', desc: 'Six-Op FM 1: Modulation depth/index. Controls harmonic complexity.' },
        19: { name: 'FM Depth', desc: 'Six-Op FM 2: Modulation depth for second algorithm.' },
        20: { name: 'FM Depth', desc: 'Six-Op FM 3: Modulation depth for third algorithm.' },
        21: { name: 'Terrain Y', desc: 'Wave Terrain: Y position on the 2D wave terrain. Second axis of terrain morphing.' },
        22: { name: 'Chorus Rate', desc: 'String Machine: Speed of the ensemble/chorus modulation. Slow = lush, fast = vibrato.' },
        23: { name: 'Arpeggio', desc: 'Chiptune: Arpeggio pattern speed and direction. Classic chip music trills.' }
    },
    'raembl-plaits-morph': {
        0:  { name: 'Waveform', desc: 'Virtual Analog: Morphs between waveforms (saw → pulse → tri). Classic oscillator shapes.' },
        1:  { name: 'Waveform', desc: 'Waveshaping: Base waveform shape being processed. Different source timbres.' },
        2:  { name: 'Feedback', desc: 'FM: Operator feedback amount. Adds grit and complexity to FM tones.' },
        3:  { name: 'Texture', desc: 'Grain: Grain texture/overlap. Affects smoothness and character of granular cloud.' },
        4:  { name: 'Brightness', desc: 'Additive: Overall spectral brightness. Adjusts harmonic content globally.' },
        5:  { name: 'Morphing', desc: 'Wavetable: Interpolation between adjacent waveforms. Smooth wavetable transitions.' },
        6:  { name: 'Waveform', desc: 'Chord: Oscillator waveform for all chord notes (saw, square, triangle, etc.).' },
        7:  { name: 'Speed', desc: 'Speech: Speed of speech/vowel transitions. Fast = rapid syllables, slow = drawn out.' },
        8:  { name: 'Shimmer', desc: 'Swarm: High-frequency shimmer and animation of the swarm. Adds life and movement.' },
        9:  { name: 'Filter Q', desc: 'Noise: Filter resonance/Q. Low = smooth, high = resonant peak/self-oscillation.' },
        10: { name: 'Texture', desc: 'Particle: Texture of particle bursts. Affects tonal character of each particle.' },
        11: { name: 'Decay', desc: 'String: Decay time of the plucked/bowed string. Short = plucky, long = sustained.' },
        12: { name: 'Damping', desc: 'Modal: Damping of resonator modes. Low = ringing, high = quickly damped.' },
        13: { name: 'Punch', desc: 'Bass Drum: Attack punch and transient sharpness. Adds click and definition.' },
        14: { name: 'Snare Wire', desc: 'Snare Drum: Intensity of snare wire buzz. The characteristic rattling sound.' },
        15: { name: 'Decay', desc: 'Hi-Hat: Decay time. Short = closed hi-hat, long = open/crash.' },
        16: { name: 'Resonance', desc: 'VA-VCF: Filter resonance/Q. Adds peak at cutoff, can self-oscillate.' },
        17: { name: 'Phase', desc: 'Phase Distortion: Phase modulation depth. Creates dynamic timbre changes.' },
        18: { name: 'Feedback', desc: 'Six-Op FM 1: Operator feedback for added harmonics and grit.' },
        19: { name: 'Carrier Mix', desc: 'Six-Op FM 2: Mix between multiple carrier operators.' },
        20: { name: 'Algorithm', desc: 'Six-Op FM 3: Selects between FM operator routing algorithms.' },
        21: { name: 'Orbit', desc: 'Wave Terrain: Orbital trajectory across the terrain. Creates animated sweeps.' },
        22: { name: 'Chorus Depth', desc: 'String Machine: Depth of ensemble/chorus modulation. Subtle to extreme.' },
        23: { name: 'Bitcrush', desc: 'Chiptune: Bit reduction/sample rate reduction. Adds digital lo-fi character.' }
    }
};

// Rings model-specific param definitions (6 models)
// These override PARAM_INFO entries based on current Rings resonator model
const RINGS_MODEL_PARAM_INFO = {
    'raembl-rings-structure': {
        0: { name: 'Inharmonicity', desc: 'Modal: Amount of inharmonicity in the 64 SVF resonator modes. Low = harmonic, high = bell-like/metallic.' },
        1: { name: 'String Coupling', desc: 'Sympathetic: Coupling strength between the 8 sympathetic strings. Controls energy transfer between strings.' },
        2: { name: 'Dispersion', desc: 'String: Dispersion filter amount. Affects how high frequencies travel along the string differently from lows.' },
        3: { name: 'FM Ratio', desc: 'FM Voice: Frequency ratio between carrier and modulator. Integer = harmonic, non-integer = inharmonic.' },
        4: { name: 'Chord Select', desc: 'Sympathetic Q: Selects quantised chord voicing for the sympathetic strings. 11 chord types available.' },
        5: { name: 'Dispersion', desc: 'String+Reverb: Dispersion amount for the string model component.' }
    },
    'raembl-rings-brightness': {
        0: { name: 'HF Content', desc: 'Modal: High-frequency content of the resonator modes. Dark/muted to bright/metallic.' },
        1: { name: 'HF Content', desc: 'Sympathetic: Brightness of the sympathetic string resonance.' },
        2: { name: 'HF Content', desc: 'String: High-frequency content of the Karplus-Strong string model.' },
        3: { name: 'HF Content', desc: 'FM Voice: Brightness of the FM synthesis output.' },
        4: { name: 'HF Content', desc: 'Sympathetic Q: Brightness of the quantised sympathetic strings.' },
        5: { name: 'Reverb Size', desc: 'String+Reverb: Size of the built-in reverb space. Small = room, large = hall.' }
    },
    'raembl-rings-damping': {
        0: { name: 'Decay Time', desc: 'Modal: How quickly the 64 modes decay. Low = long ring, high = quick damping.' },
        1: { name: 'Decay Time', desc: 'Sympathetic: Decay time of the coupled strings. Controls sustain length.' },
        2: { name: 'Energy Loss', desc: 'String: Energy loss per reflection. Low = long sustain, high = quick decay.' },
        3: { name: 'Decay Time', desc: 'FM Voice: Decay envelope of the FM synthesis output.' },
        4: { name: 'Decay Time', desc: 'Sympathetic Q: Decay time for the quantised string resonance.' },
        5: { name: 'Reverb Decay', desc: 'String+Reverb: Decay time of the built-in reverb tail.' }
    },
    'raembl-rings-position': {
        0: { name: 'Excite Position', desc: 'Modal: Where the resonator is excited. Different positions emphasise different mode harmonics.' },
        1: { name: 'Bow Position', desc: 'Sympathetic: Position of the virtual bow on the strings. Near bridge = harsh, near centre = mellow.' },
        2: { name: 'Pluck Position', desc: 'String: Where the string is plucked. Near bridge = bright/thin, centre = full/warm.' },
        3: { name: 'Excite Position', desc: 'FM Voice: Excitation position in the FM algorithm.' },
        4: { name: 'Bow Position', desc: 'Sympathetic Q: Bow position for the quantised sympathetic strings.' },
        5: { name: 'Pluck Position', desc: 'String+Reverb: Pluck position for the string model component.' }
    }
};

// Module-level info definitions
// These provide descriptions for entire modules (when hovering the module header)
const MODULE_INFO = {
    // ===== BÆNG Modules =====
    'baeng-module-voices': {
        name: 'VOICES Module',
        desc: 'Euclidean step sequencer for each drum voice. Configure pattern length, fills, accents, flams, and ratchets. The visualisation shows a circular preview of the current pattern - filled segments are active steps.'
    },
    'baeng-module-engine': {
        name: 'ENGINE Module',
        desc: 'Sound engine for the selected voice. Choose between DX7 FM synthesis, analog drum models (kick/snare/hat), or sample playback. The waveform display shows the current sound output in real-time.'
    },
    'baeng-module-reverb': {
        name: 'REVERB Module',
        desc: 'Global reverb effect shared by all voices. Controls room size, decay, and character. Per-voice reverb sends are set in the ENGINE module. The visualisation shows the impulse response decay shape.'
    },
    'baeng-module-delay': {
        name: 'DELAY Module',
        desc: 'Tape-style delay effect with wow, flutter and saturation. Sync to tempo or run free. Per-voice delay sends are set in the ENGINE module. The visualisation shows the echo pattern timing.'
    },
    'baeng-module-bus': {
        name: 'BUS Module',
        desc: 'Master bus processing chain inspired by Ableton Drum Buss. Drive, crunch, transient shaping, boom (sub generator), compression, and damping. Processes all voices before final output.'
    },
    'baeng-module-waveguide': {
        name: 'WAVEGUIDE Module',
        desc: 'Physical modelling waveguide effect. Simulates resonant tubes and strings. Use for metallic, plucked, or blown timbres. The visualisation shows the waveguide resonance character.'
    },
    'baeng-module-clouds': {
        name: 'CLOUDS Module',
        desc: 'Granular effects processor based on Mutable Instruments Clouds. Six modes: Granular, WSOLA, Looping, Spectral, Oliverb, and Resonestor. Transform drums into evolving textures.'
    },

    // ===== RÆMBL Modules =====
    'raembl-module-factors': {
        name: 'FACTORS Module',
        desc: 'Euclidean pattern generator for the synth sequencer. Set step count, fills, shift, accents, slides, and trills. Works with PATH to create melodic patterns.'
    },
    'raembl-module-lfo': {
        name: 'LFO Module',
        desc: 'Low frequency oscillator for modulation. Controls amplitude, frequency, and waveform shape. The visualisation shows the current LFO waveform - sine, triangle, square, or saw.'
    },
    'raembl-module-path': {
        name: 'PATH Module',
        desc: 'Pitch path sequencer and scale quantiser. Set the musical scale and root note. The visualisation shows the pitch contour of your sequence - higher points are higher notes.'
    },
    'raembl-module-mod': {
        name: 'MOD Module',
        desc: 'Secondary modulation source. Controls rate and waveform for additional modulation routing. Use PPMod to assign modulation destinations per-parameter.'
    },
    'raembl-module-oscillator': {
        name: 'OSCILLATOR Module',
        desc: 'Sound source waveform generators. Configure octave, glide, drift, pulse width, and mono/poly mode. Three oscillators (saw, square, triangle) plus sub and noise.'
    },
    // Dynamic oscillator module info based on engine type
    'raembl-module-oscillator-subtractive': {
        name: 'OSCILLATOR Module',
        desc: 'Classic subtractive synthesiser. Three oscillators (saw, square, triangle) plus sub and noise. Configure octave, glide, drift, and pulse width. Mono or 8-voice poly mode.'
    },
    'raembl-module-oscillator-plaits': {
        name: 'PLAITS Module',
        desc: 'Mutable Instruments Plaits macro oscillator with 24 synthesis engines across 3 banks. GREEN: pitched/harmonic. RED: noise/physical. ORANGE: classic/FM. Each engine has unique HARM/TIMB/MORPH controls.'
    },
    'raembl-module-oscillator-rings': {
        name: 'RINGS Module',
        desc: 'Mutable Instruments Rings physical modelling resonator with 6 models. Modal, Sympathetic, String, FM Voice, Sympathetic Quantised, and String+Reverb. Creates realistic plucked, bowed, and struck sounds.'
    },
    'raembl-module-mixer': {
        name: 'MIXER Module',
        desc: 'Waveform level mixer. Blend saw, square, triangle, sub, and noise generators to shape your basic timbre.'
    },
    'raembl-module-filter': {
        name: 'FILTER Module',
        desc: 'Dual filter with highpass and lowpass. Control cutoff, resonance, key tracking, and modulation. Classic subtractive synthesis tone shaping.'
    },
    'raembl-module-envelope': {
        name: 'ENVELOPE Module',
        desc: 'ADSR amplitude and filter envelopes. Control attack, decay, sustain, and release to shape how the sound evolves over time.'
    },
    'raembl-module-reverb': {
        name: 'REVERB Module',
        desc: 'Algorithmic reverb effect. Control send level, pre-delay, decay, diffusion, and damping. Creates spatial depth and ambience.'
    },
    'raembl-module-delay': {
        name: 'DELAY Module',
        desc: 'Tape-style delay with wow, flutter, and saturation. Sync to tempo or run free. Creates echoes and rhythmic repeats with vintage character.'
    },
    'raembl-module-clouds': {
        name: 'CLOUDS Module',
        desc: 'Granular effects processor based on Mutable Instruments Clouds. Four modes: Granular (texture), WSOLA (pitch-shift), Looping Delay, and Spectral (FFT). Transform sounds into evolving textures and atmospheres.'
    },
    'raembl-module-output': {
        name: 'OUTPUT Module',
        desc: 'Master output level control for Ræmbl. Set the final volume before mixing with Bæng drums.'
    },
    'raembl-module-clock': {
        name: 'TIME Module',
        desc: 'Shared timing controls for both apps. BPM, swing, and bar length settings. The visualisation shows the current beat position.'
    }
};

// Default info when nothing hovered
const DEFAULT_INFO = {
    name: '--',
    desc: 'Hover a parameter for info'
};

// Module state
let modal = null;
let lastEditedParam = null;
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

/**
 * Initialise the info modal
 */
export function initInfoModal() {
    modal = document.getElementById('info-modal');
    if (!modal) {
        console.error('[InfoModal] Modal element not found');
        return;
    }

    // Restore position from localStorage
    restorePosition();

    // Setup close button
    const closeBtn = modal.querySelector('.info-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideInfoModal);
    }

    // Setup dragging
    const header = modal.querySelector('.info-modal-header');
    if (header) {
        header.addEventListener('mousedown', startDrag);
        header.addEventListener('touchstart', startDrag, { passive: false });
    }

    // Global mouse/touch move and up handlers
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', endDrag);

    // Setup hover detection on document
    document.addEventListener('mouseover', onHover);
    document.addEventListener('mouseout', onMouseOut);

    console.log('[InfoModal] Initialised');
}

/**
 * Restore modal position from localStorage
 */
function restorePosition() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const pos = JSON.parse(saved);
            if (pos.top !== undefined && pos.left !== undefined) {
                modal.style.top = `${pos.top}px`;
                modal.style.left = `${pos.left}px`;
                modal.style.right = 'auto'; // Clear default right positioning
                console.log('[InfoModal] Position restored:', pos);
            }
        }
    } catch (e) {
        console.warn('[InfoModal] Failed to restore position:', e);
    }
}

/**
 * Save modal position to localStorage
 */
function savePosition() {
    try {
        const rect = modal.getBoundingClientRect();
        const pos = {
            top: rect.top,
            left: rect.left
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
    } catch (e) {
        console.warn('[InfoModal] Failed to save position:', e);
    }
}

/**
 * Start dragging
 */
function startDrag(e) {
    if (e.target.classList.contains('info-modal-close')) return;

    isDragging = true;
    modal.classList.add('dragging');

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = modal.getBoundingClientRect();

    dragOffset = {
        x: clientX - rect.left,
        y: clientY - rect.top
    };

    // Prevent text selection during drag
    e.preventDefault();
}

/**
 * Handle drag movement
 */
function onDrag(e) {
    if (!isDragging) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    // Calculate new position
    let newLeft = clientX - dragOffset.x;
    let newTop = clientY - dragOffset.y;

    // Keep modal within viewport bounds
    const rect = modal.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width;
    const maxTop = window.innerHeight - rect.height;

    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));

    modal.style.left = `${newLeft}px`;
    modal.style.top = `${newTop}px`;
    modal.style.right = 'auto'; // Clear right positioning

    e.preventDefault();
}

/**
 * End dragging
 */
function endDrag() {
    if (!isDragging) return;

    isDragging = false;
    modal.classList.remove('dragging');
    savePosition();
}

/**
 * Handle hover over elements
 */
function onHover(e) {
    const paramId = findParamId(e.target);
    if (paramId) {
        showParamInfo(paramId);
    }
}

/**
 * Handle mouse leaving elements
 */
function onMouseOut(e) {
    const paramId = findParamId(e.target);
    if (paramId) {
        // Show last edited param info, or default
        if (lastEditedParam && PARAM_INFO[lastEditedParam]) {
            showParamInfo(lastEditedParam);
        } else {
            showDefaultInfo();
        }
    }
}

/**
 * Find param ID from element or ancestors
 * Walks full ancestor chain looking for data-info-id first,
 * falls back to data-param-id only if no data-info-id exists
 */
function findParamId(element) {
    let el = element;
    let foundParamId = null;  // Store first param-id as fallback

    while (el && el !== document.body) {
        if (el.dataset) {
            // Prefer data-info-id - return immediately if found
            if (el.dataset.infoId) {
                return el.dataset.infoId;
            }
            // Store first data-param-id but keep searching for data-info-id
            if (!foundParamId && el.dataset.paramId) {
                foundParamId = el.dataset.paramId;
            }
        }
        el = el.parentElement;
    }

    // Fall back to param-id if no info-id was found anywhere
    return foundParamId;
}

/**
 * Show info for a parameter or module
 */
export function showParamInfo(paramId) {
    // Check for module-level info first
    let info = MODULE_INFO[paramId] || PARAM_INFO[paramId];

    // Check for engine-specific definitions (Bæng ENGINE module)
    if (ENGINE_PARAM_INFO[paramId]) {
        const engineType = baengState?.voices?.[baengState.selectedVoice]?.engine || 'aKICK';
        info = ENGINE_PARAM_INFO[paramId][engineType] || info;
    }

    // Check for Clouds mode-specific definitions (Bæng or Ræmbl CLOUDS module)
    if (CLOUDS_MODE_PARAM_INFO[paramId]) {
        try {
            let cloudsMode;
            if (paramId.startsWith('baeng-clouds-')) {
                // Bæng Clouds - get mode from baengState
                const modeNames = ['granular', 'wsola', 'looping', 'spectral', 'oliverb', 'resonestor'];
                const modeIndex = baengState?.cloudsMode ?? 0;
                cloudsMode = modeNames[modeIndex] || 'granular';
            } else {
                // Ræmbl Clouds - use existing function
                cloudsMode = getCurrentCloudsModeName();
            }
            info = CLOUDS_MODE_PARAM_INFO[paramId][cloudsMode] || info;
        } catch (e) {
            // Clouds module may not be initialised yet, use fallback
            console.warn('[InfoModal] Could not get Clouds mode:', e);
        }
    }

    // Check for Plaits engine-specific definitions
    if (PLAITS_ENGINE_PARAM_INFO[paramId]) {
        try {
            const engineIndex = raemblState?.plaitsEngine ?? 0;
            info = PLAITS_ENGINE_PARAM_INFO[paramId][engineIndex] || info;
        } catch (e) {
            console.warn('[InfoModal] Could not get Plaits engine:', e);
        }
    }

    // Check for Rings model-specific definitions
    if (RINGS_MODEL_PARAM_INFO[paramId]) {
        try {
            const modelIndex = raemblState?.ringsModel ?? 0;
            info = RINGS_MODEL_PARAM_INFO[paramId][modelIndex] || info;
        } catch (e) {
            console.warn('[InfoModal] Could not get Rings model:', e);
        }
    }

    // Dynamic oscillator module info based on engine type
    if (paramId === 'raembl-module-oscillator') {
        try {
            const engineType = raemblState?.engineType || 'subtractive';
            const dynamicId = `raembl-module-oscillator-${engineType}`;
            info = MODULE_INFO[dynamicId] || info;
        } catch (e) {
            console.warn('[InfoModal] Could not get engine type:', e);
        }
    }

    if (!info) {
        showDefaultInfo();
        return;
    }

    const nameEl = modal.querySelector('.info-param-name');
    const descEl = modal.querySelector('.info-param-desc');

    if (nameEl) nameEl.textContent = info.name;
    if (descEl) descEl.textContent = info.desc;
}

/**
 * Show default info
 */
function showDefaultInfo() {
    const nameEl = modal.querySelector('.info-param-name');
    const descEl = modal.querySelector('.info-param-desc');

    if (nameEl) nameEl.textContent = DEFAULT_INFO.name;
    if (descEl) descEl.textContent = DEFAULT_INFO.desc;
}

/**
 * Set the last edited parameter (for persistence when not hovering)
 */
export function setLastEditedParam(paramId) {
    lastEditedParam = paramId;
    // Update display if modal is visible
    if (!modal.classList.contains('hidden')) {
        showParamInfo(paramId);
    }
}

/**
 * Toggle modal visibility
 */
export function toggleInfoModal() {
    if (modal.classList.contains('hidden')) {
        showInfoModal();
    } else {
        hideInfoModal();
    }
}

/**
 * Show the info modal
 */
export function showInfoModal() {
    modal.classList.remove('hidden');
    // Show last edited param or default
    if (lastEditedParam && PARAM_INFO[lastEditedParam]) {
        showParamInfo(lastEditedParam);
    } else {
        showDefaultInfo();
    }
}

/**
 * Hide the info modal
 */
export function hideInfoModal() {
    modal.classList.add('hidden');
}

/**
 * Check if modal is visible
 */
export function isInfoModalVisible() {
    return modal && !modal.classList.contains('hidden');
}
