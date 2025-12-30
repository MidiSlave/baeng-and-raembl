# Bæng & Ræmbl Documentation

Welcome to the documentation for **Bæng & Ræmbl**, a unified web-based synthesiser suite combining a 6-voice drum machine (Bæng) with a polyphonic synthesiser (Ræmbl). Both instruments share synchronised timing and transport controls whilst maintaining independent audio routing.

This documentation is organised into sections for musicians and developers.

---

## For Musicians

### Getting Started
- [Getting Started Guide](user-guide/getting-started.md) - First-time user walkthrough
- [Interface Overview](user-guide/interface-overview.md) - Understanding the layout
- [Keyboard Shortcuts](user-guide/keyboard-shortcuts.md) - Productivity tips

### Bæng Drum Machine
- [Bæng User Guide](user-guide/baeng-guide.md) - Complete drum machine guide
- **Synthesis Engines:**
  - [DX7 Engine](engines/baeng/dx7.md) - FM synthesis with 1024 classic patches
  - [Analog Engine](engines/baeng/analog.md) - Virtual analogue drum synthesis
  - [SMPL Engine](engines/baeng/smpl.md) - Multi-sample playback with per-voice banks
  - [SLICE Engine](engines/baeng/slice.md) - Breakbeat slicing and re-sequencing

### Ræmbl Synthesiser
- [Ræmbl User Guide](user-guide/raembl-guide.md) - Complete synthesiser guide
- **Synthesis Engines:**
  - [Subtractive Engine](engines/raembl/subtractive.md) - Classic analogue-style synthesis
  - [Plaits Engine](engines/raembl/plaits.md) - 24 Mutable Instruments synthesis models
  - [Rings Engine](engines/raembl/rings.md) - Physical modelling resonator (6 models + Easter Egg)

### Effects
- [Reverb](effects/reverb.md) - Algorithmic reverb (Bæng & Ræmbl)
- [Delay](effects/delay.md) - Tempo-synced delay (Bæng & Ræmbl)
- [Clouds](effects/clouds.md) - Granular processor (6 modes: Granular, WSOLA, Looping Delay, Spectral, Oliverb, Resonestor)
- [Drum Bus](effects/drum-bus.md) - Master bus processor (Drive, Crunch, Transients, Boom, Compressor, Dampen)
- [Sidechain Ducking](effects/sidechain.md) - Compressor-based ducking

### Modulation
- [PPMod Overview](modulation/ppmod-overview.md) - Per-parameter modulation system
- [PPMod Modes](modulation/ppmod-modes.md) - LFO, RND, ENV, EF, TM, SEQ explained
- [Per-Voice Modulation](modulation/per-voice.md) - Polyphonic modulation (Bæng & Ræmbl)

### Sequencer
- [Bæng Sequencer](sequencer/baeng-sequencer.md) - Step sequencer with per-voice patterns
- [Euclidean Patterns](sequencer/euclidean.md) - Algorithmic rhythm generation
- [Step Parameters](sequencer/step-params.md) - Probability, ratchets, accent, slide, trill
- [Ræmbl Pitch Path](sequencer/raembl-path.md) - Pitch sequencer with scale quantisation

---

## For Developers

### Architecture
- [System Architecture](developer/architecture.md) - Overall design and signal flow
- [Audio Routing](developer/audio-routing.md) - Signal paths and mixing
- [State Management](developer/state-management.md) - Global state patterns
- [Clock System](developer/clock-system.md) - Shared timing and synchronisation

### Audio Engine
- [AudioWorklet Guide](developer/audioworklet-guide.md) - Voice allocation and processing
- [Voice Pool Pattern](developer/voice-pool.md) - Pre-allocated voice management
- [Namespacing](developer/namespacing.md) - ID/class/event naming conventions

### Integration
- [Patch Format](developer/patch-format.md) - v1.2.0 unified patch spec
- [Contributing](developer/contributing.md) - Development workflow and standards
- [Footguns](developer/footguns.md) - Common pitfalls and how to avoid them

---

## Parameter Reference

### Bæng Parameters
- [DX7 Parameters](reference/baeng-dx7-params.md)
- [Analog Parameters](reference/baeng-analog-params.md)
- [SMPL Parameters](reference/baeng-smpl-params.md)
- [SLICE Parameters](reference/baeng-slice-params.md)
- [Bæng FX Parameters](reference/baeng-fx-params.md)

### Ræmbl Parameters
- [Subtractive Parameters](reference/raembl-subtractive-params.md)
- [Plaits Parameters](reference/raembl-plaits-params.md)
- [Rings Parameters](reference/raembl-rings-params.md)
- [Ræmbl FX Parameters](reference/raembl-fx-params.md)

### Shared Parameters
- [Time Strip Parameters](reference/shared-timing-params.md)
- [PPMod Parameters](reference/ppmod-params.md)

---

## Version History

- [Changelog](changelog.md) - Version history and release notes

---

**Live Demo:** [https://midislave.github.io/baeng-and-raembl/](https://midislave.github.io/baeng-and-raembl/)
**Repository:** [https://github.com/MidiSlave/baeng-and-raembl](https://github.com/MidiSlave/baeng-and-raembl)
