# Getting Started

Welcome to **Bæng & Ræmbl**! This guide will help you make your first sounds with this unified synthesiser suite.

---

## Requirements

### Browser Compatibility

Bæng & Ræmbl requires a modern web browser with Web Audio API support:

- **Chrome/Edge**: Version 90 or later (recommended)
- **Firefox**: Version 88 or later
- **Safari**: Version 14 or later

### Important Notes

- **HTTPS or localhost required**: The Web Audio API requires a secure context. You can run the app on `https://` URLs or `localhost` for development.
- **JavaScript must be enabled**: The synthesiser runs entirely in JavaScript using Web Audio API.
- **Headphones recommended**: For accurate monitoring and to prevent feedback if using built-in microphone/speakers.

---

## First Launch

### 1. Open the Application

Navigate to the live demo URL or open your local copy in a supported browser:

**Live Demo:** [https://midislave.github.io/baeng-and-raembl/](https://midislave.github.io/baeng-and-raembl/)

### 2. Enable Audio Context

Modern browsers require user interaction before starting audio playback. When you first load the app:

1. **Click anywhere on the page** or press the **Space bar**
2. You should see the interface fully loaded
3. Audio context is now active (you may see a notification in the browser console)

### 3. Wait for Sample Loading (If Applicable)

If you're using the SMPL (sampler) engine in Bæng, the app will load sample banks in the background. You'll see loading indicators if samples are being fetched. The synthesiser is fully functional whilst samples load—you can start making sounds immediately with other engines.

---

## Making Your First Sound

### Quick Start: Press Play

The easiest way to hear the synthesiser is to start the transport:

1. **Press the Space bar** or click the **PLAY** button in the Time Strip (middle section)
2. Both Bæng (top) and Ræmbl (bottom) will start playing their current patterns
3. Adjust the **BPM** fader in the Time Strip to change tempo (default: 120 BPM)

![Time Strip](../images/ui/time-strip.png)

### Bæng: Programming Drum Patterns

**Bæng** is the 6-voice drum machine at the top of the interface.

1. **Select a voice** by clicking one of the six voice buttons (T1–T6)
2. **Click steps in the sequencer** to toggle them on/off (16 steps per bar)
3. **Adjust voice parameters**:
   - **PITCH**: Tune the voice up or down
   - **LEVEL**: Adjust volume
   - **DECAY**: Control how long the sound lasts
   - **PAN**: Position in the stereo field
4. **Change the synthesis engine** using the engine selector (DX7, ANLG, SMPL, SLICE)
5. **Press Play** to hear your pattern

![Bæng Interface](../images/ui/baeng-overview.png)

**Tip:** Try the **Euclidean pattern generator** (E button) for algorithmic rhythm creation!

### Ræmbl: Playing Notes

**Ræmbl** is the polyphonic synthesiser at the bottom of the interface.

1. **Play notes** using:
   - **Virtual keyboard** (click the keys on-screen)
   - **Computer keyboard** (mapped to piano keys)
   - **MIDI controller** (if connected)
2. **Adjust synthesis parameters**:
   - **CUTOFF**: Filter frequency
   - **RESONANCE**: Filter emphasis
   - **ATTACK/DECAY/SUSTAIN/RELEASE**: Envelope shape
   - **OSC MIX**: Blend oscillator waveforms
3. **Choose a synthesis engine** using the engine selector (SUB, PLT, RNG)
4. **Enable the sequencer** to trigger notes automatically in sync with Bæng

![Ræmbl Interface](../images/ui/raembl-overview.png)

**Tip:** Switch between **MONO** and **POLY** modes to change voice behaviour (monophonic vs polyphonic).

---

## Understanding the Interface

Bæng & Ræmbl is organised into three main sections:

### Bæng (Top Section)

The **6-voice drum machine** with step sequencer:

- **Voice Strip**: 6 drum voices (T1–T6), each with independent synthesis engine and parameters
- **Step Sequencer**: 16-step pattern for each voice
- **Global FX**: Reverb, delay, Clouds granular processor, Drum Bus master FX
- **Per-Voice Controls**: Pitch, level, decay, pan, plus engine-specific parameters

### Time Strip (Middle Section)

Shared **timing and transport controls** that synchronise both Bæng and Ræmbl:

- **BPM**: Tempo (40–300 BPM)
- **SWING**: Rhythmic feel (0–100%, where 50% = straight, 66% = triplet swing)
- **LENGTH**: Pattern length in bars (1–4 bars)
- **PLAY/STOP**: Dual transport buttons (both synchronised)

### Ræmbl (Bottom Section)

The **polyphonic synthesiser** with pitch path sequencer:

- **Synthesis Parameters**: Filter, envelopes, oscillators, LFO
- **Engine Selector**: Switch between Subtractive (SUB), Plaits (PLT), and Rings (RNG) engines
- **Pitch Path Sequencer**: Up to 16-step melodic patterns with scale quantisation
- **Global FX**: Reverb, delay, Clouds granular processor

![Full Interface](../images/ui/full-interface.png)

---

## Next Steps

Now that you've made your first sounds, explore these topics:

### Learn More About Each Instrument

- **[Bæng User Guide](baeng-guide.md)**: Dive deeper into drum programming, engine selection, and sequencer features
- **[Ræmbl User Guide](raembl-guide.md)**: Explore synthesis engines, modulation, and melodic sequencing

### Explore Effects

- **[Reverb](../effects/reverb.md)**: Add space and depth
- **[Delay](../effects/delay.md)**: Tempo-synced echoes
- **[Clouds](../effects/clouds.md)**: Granular texture processing (6 unique modes)
- **[Drum Bus](../effects/drum-bus.md)**: Master bus processing for Bæng (drive, compression, transients)

### Master Modulation

- **[PPMod Overview](../modulation/ppmod-overview.md)**: Per-parameter modulation system
- **[PPMod Modes](../modulation/ppmod-modes.md)**: LFO, Random, Envelope, Envelope Follower, Turing Machine, Sequencer

### Advanced Sequencing

- **[Euclidean Patterns](../sequencer/euclidean.md)**: Algorithmic rhythm generation
- **[Step Parameters](../sequencer/step-params.md)**: Probability, ratchets, accent, slide, trill
- **[Ræmbl Pitch Path](../sequencer/raembl-path.md)**: Melodic sequencing with scale quantisation

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Space** | Play/Stop transport |
| **Esc** | Close modals/dialogs |
| **1-6** | Select Bæng voice (T1–T6) |
| **Computer keyboard** | Play Ræmbl notes (piano key mapping) |

For a complete list of shortcuts, see the [Keyboard Shortcuts](keyboard-shortcuts.md) reference.

---

## Troubleshooting

### No Sound?

1. **Check browser compatibility**: Ensure you're using a supported browser (Chrome 90+, Firefox 88+, Safari 14+)
2. **Enable audio context**: Click anywhere on the page or press Space
3. **Check system volume**: Ensure your OS/browser volume isn't muted
4. **Check master levels**: Look for the master level meters—are they showing signal?
5. **Try a different engine**: Some engines require sample loading (SMPL) or specific configuration

### Audio Glitches or Dropouts?

1. **Close other browser tabs**: Web Audio API shares resources with other tabs
2. **Reduce polyphony**: Ræmbl has an 8-voice limit—exceeding this may cause voice stealing
3. **Disable intensive effects**: Clouds in Granular mode can be CPU-intensive at high quality settings
4. **Check CPU usage**: Use your browser's task manager to monitor performance

### MIDI Controller Not Working?

1. **Browser compatibility**: MIDI support requires Chrome 43+ or Edge 79+ (Firefox/Safari have limited support)
2. **Grant permissions**: Your browser may ask for permission to access MIDI devices
3. **Reconnect the device**: Try unplugging and reconnecting your MIDI controller
4. **Check MIDI settings**: Ensure the controller is sending on the correct MIDI channel

---

## Need Help?

- **GitHub Issues**: [Report bugs or request features](https://github.com/MidiSlave/baeng-and-raembl/issues)
- **Documentation**: Browse the full [documentation index](../index.md)

Enjoy making music with Bæng & Ræmbl!
