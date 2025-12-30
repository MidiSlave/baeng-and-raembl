# Changelog

All notable changes to Bæng & Ræmbl will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Known Issues
- Sidechain ducking has some audible artefacts (under investigation)
- DX7 legato/slide not yet implemented
- UI alignment/positioning issues in iPad landscape mode
- Rings PPMod implementation incomplete (updateRingsParameter exists but not called from perParamMod.js)

---

## [1.2.0] - Current

### Added
- **Ræmbl Multi-Engine Support (Plaits Integration)**
  - 24 Mutable Instruments Plaits synthesis engines across 3 banks (GREEN/RED/ORANGE)
  - Engine selector UI with SUB/PLT toggle, bank selector, and engine dropdown
  - Per-voice engine tracking in voice pool
  - PPMod integration for HARMONICS, TIMBRE, MORPH, LPG parameters
  - Intelligent voice stealing with stealability scoring
  - FX routing (reverb/delay sends working)

- **Rings Physical Modelling Resonator (Ræmbl Integration)**
  - 6 resonator models: Modal, Sympathetic String, String, FM Voice, Sympathetic String Quantised, String+Reverb
  - Easter Egg mode: Disastrous Peace (12-voice polysynth)
  - Polyphony modes (M/P2/P4)
  - Per-voice engine tracking in voice pool
  - PPMod integration for FREQUENCY, STRUCTURE, BRIGHTNESS, DAMPING, POSITION parameters
  - FX routing (reverb/delay sends working)

- **Unified Patch Format v1.2.0**
  - Engine type saved and restored in patch data
  - Supports Subtractive, Plaits, and Rings engines
  - Backward compatible with v1.1.0 patches

### Changed
- Patch format version updated to v1.2.0 with engine type field
- Voice pool architecture extended to support multiple engine types

### Fixed
- Rings Modal STRUCTURE instability at high values (af68370)

---

## [1.1.0] - 2025-12-02

### Added
- **PPMod 6-Mode System with Modal UI**
  - LFO (Low-frequency oscillator): Sine/Tri/Square/Saw waveforms, 0.1-20Hz
  - RND (LFSR-based random): 4-32 bit shift register, 0-100% probability
  - ENV (AD/ADSR envelope): 0.2ms-8s times, linear/exp/log curves
  - EF (Envelope follower): AnalyserNode-based peak detection
  - TM (Probabilistic step seq): 1-16 steps, per-step probability (0-9)
  - SEQ (CV sequencer): 4-16 step pattern, clock-synchronised
  - Modal interface replaces click-cycling UI
  - K-rate updates at 30 FPS via requestAnimationFrame
  - Per-voice modulation support for Bæng
  - Separate architectures for Bæng/Ræmbl with shared utilities

- **Clouds FX Engine (Ræmbl & Bæng)**
  - Full Mutable Instruments Clouds port with 6 playback modes
  - Modes: Granular (64-grain), WSOLA, Looping Delay, Spectral, Oliverb, Resonestor
  - Ræmbl: Fader-based UI, serial insert FX routing
  - Bæng: LED ring knob UI, per-voice send routing, clock sync, quality presets (HI/MED/LO/XLO)
  - Centralised parameter validation system
  - Processor-level bounds checking for stability

- **Drum Bus Processor (Bæng Master)**
  - Ableton Drum Buss-inspired AudioWorklet processor
  - Signal chain: Drive → Crunch → Transients → Boom → Compressor → Dampen → Dry/Wet
  - Drive waveshaper with Soft/Med/Hard modes
  - Crunch mid-high frequency saturation
  - Bipolar transient shaper
  - Boom sub-bass sine generator with transient triggering
  - Dampen lowpass filter (500Hz–30kHz)
  - Parallel dry/wet blending

- **Sidechain Ducking**
  - Compressor-based ducking allowing Bæng to duck Ræmbl's output
  - Sidechain modal for configuration
  - Per-voice trigger options

- **Bæng Engine Features**
  - Gate functionality preventing accidental polyphony
  - DX7 PPMod scale quantisation (modulated pitch stays within scale)
  - SMPL per-voice sample banks (independent bank per voice, follows SLICE pattern)
  - SLICE decay percentage calculation (decay as % of slice length, not absolute time)

- **Ræmbl Sequencer Features**
  - Trill offbeat fix (2-note trills on swung offbeats, 3-note on downbeats)
  - Poly sequencer voice release (notes ring out properly in seq mode)

- **Unified Time Strip**
  - Shared BPM/Swing/Length controls between apps
  - Single point of control for timing parameters

- **DX7 Browser Search**
  - Search bar with recursive folder filtering
  - Pattern matching for bank/patch filtering

- **SLICE Per-Parameter Modulation**
  - Slice index modulation with correct range mapping (0-numSlices)
  - Visual feedback on knob updates

### Changed
- **Unified Patch Format v1.1.0**
  - Added modulations field to both Bæng and Ræmbl patch data
  - Backward compatible with v1.0.0 patches (load without modulation)
  - Forward compatible (v1.1.0 in old app falls back to base values)
  - Shared timing parameters separated from app-specific data

- Mono mode flam behaviour improved (clean retriggering without double-attack artefacts)
- OCT and SUB OCT transpose made independent
- Clouds feedback defaults to 0 (prevents runaway feedback loop)

### Fixed
- Slide implementation moved from per-sample JavaScript to AudioParam automation (80ms TB-303 style glide; poly mode has 40ms slide-into effect)
- Trill timing corrected (pitch oscillation to next scale degree, mono and poly modes)
- Accent implementation improved (1.5x velocity boost, snappier decay, attack punch)
- Notes release on stop (releaseAllVoices called in stop handler)
- Envelope params made independent (attack changes don't affect release)
- FX routing connected to AudioWorklet voices (reverb/delay working)
- Voice stealing no longer steals releasing voices (prevents envelope cutoff glitches)

---

## [1.0.0] - 2025-11-29

### Added
- **Merged Bæng & Ræmbl Applications**
  - Bæng (6-voice drum machine) positioned above Ræmbl (monophonic/poly synth)
  - Separate audio routing with independent effects chains
  - Synchronised timing and transport controls
  - Dual play buttons (both apps synchronised, either can start/stop playback)

- **Shared Clock System**
  - Bæng's audio-thread scheduler (100ms lookahead) as shared clock foundation
  - Unified clock events for both apps
  - Single source of truth for BPM, swing, barLength

- **Ræmbl AudioWorklet Voice Processor**
  - 8 pre-allocated voices with release tracking
  - PolyBLEP anti-aliased oscillators (saw, tri, square, sub, noise)
  - TPT filters (lowpass + highpass)
  - ADSR envelopes (amp + filter)
  - LFO modulation (sine, tri, square)
  - Poly mode with proper voice allocation
  - Zero node creation overhead, prevents poly mode dropouts

- **Audio Architecture**
  - Shared AudioContext with separate master gain chains
  - -3dB headroom per app, shared final limiter
  - Namespace separation: baengState, raemblState, sharedState

- **Per-Voice Engine Selection (Bæng)**
  - DX7 FM synthesis (4-operator with pitch envelope, LFO, velocity sensitivity)
  - Analog synthesis (kick, snare, hi-hat engines with physical modelling)
  - Sampler (SMPL engine with pitch-shift playback)
  - SLICE sampler (time-sliced sample playback)

- **Global Effects**
  - Bæng: Reverb, delay, waveguide effects
  - Ræmbl: Reverb and delay with wow/flutter

- **Pattern Sequencer Features**
  - Bæng: Per-voice step sequencer with Euclidean patterns, probability, ratchets
  - Ræmbl: Euclidean pattern generator + pitch path sequencer

- **Visualisations**
  - All canvas-based visualisations functional
  - Bæng: Engine visualisation, voice step visualisation, reverb/delay visualisations
  - Ræmbl: Title oscilloscope, reverb/delay visualisations, LFO/path visualisations

- **Unified Patch Format v1.0.0**
  - Shared timing parameters (BPM, swing, barLength)
  - App-specific data separated
  - Loading either app's patch updates shared timing parameters
  - Version number and timestamp for compatibility tracking

### Changed
- Removed legacy FM engine (6-knob macro system) in favour of modern DX7/Analog/Sampler engines
- Canvas rendering optimised (8 simultaneous requestAnimationFrame loops at native refresh rate)

### Fixed
- DOM element ID namespace conflicts resolved (Bæng/Ræmbl prefixing)
- CSS gradient ID mismatches fixed (baeng-gradient-stroke → gradient-stroke)
- Bidirectional BPM/swing synchronisation working correctly
- Bæng ENGINE module positioning issue (prevented repositioning on engine switch)
- Bæng canvas height distortion eliminated (reverb/delay 2.8× vertical stretch)
- Bæng VOICES visualisation step advance event listener
- Ræmbl fader visual synchronisation with reverb/delay modules
- Ræmbl delay TIME display namespace mismatch
- Ræmbl default reverb/delay send values increased from 0 to 25 for audibility
- Sample browser manifest paths (URL encoding issues with Bæng folder name)
- DX7 browser .syx file loading
- setupKnobs paramId lookup (31 parameters updated from "engine" to "baeng-engine")

---

## [0.1.0] - 2025-11-28

### Added
- Initial commit with merged Bæng & Ræmbl synthesiser suite
- GitHub Pages deployment workflow
- Missing DX7 banks manifest file

### Infrastructure
- Project structure with shared and app-specific directories
- Symlinks for samples/Reference folders to resolve URL encoding
- Git repository initialised with proper .gitignore

---

## Version History Summary

| Version | Date | Key Features |
|---------|------|-------------|
| **1.2.0** | Current | Plaits + Rings multi-engine support, engine-aware patch format |
| **1.1.0** | 2025-12-02 | PPMod 6-mode system, Clouds FX, Drum Bus, Sidechain, Unified Time Strip |
| **1.0.0** | 2025-11-29 | Initial merged app with AudioWorklet voices, shared clock, unified patches |
| **0.1.0** | 2025-11-28 | Project setup and infrastructure |

---

## Breaking Changes

### v1.2.0
- Patch format updated to include engine type field
- Older patches (v1.1.0 and earlier) will load with default Subtractive engine

### v1.1.0
- Patch format updated to include modulations field
- Older patches (v1.0.0) will load without per-parameter modulation data

### v1.0.0
- New unified patch format (not compatible with original individual Bæng/Ræmbl apps)
- Removed legacy FM engine (replaced by DX7/Analog/Sampler engines)
- Changed default Bæng engines: FM → modern engine system

---

## Notes

### AudioWorklet Migration (2025-11-29)
During development, an AudioWorklet refactor was attempted and rolled back due to premature integration. The successful AudioWorklet voice processor implementation was completed in phases with proper test harness validation before merged app integration.

**Rollback Event**: Incomplete AudioWorklet integration preserved in `backups/2025-11-29_incomplete_audioworklet_integration` for reference.

**Final Implementation**: Ræmbl AudioWorklet voice processor successfully integrated with 8 pre-allocated voices, PolyBLEP anti-aliasing, and proper release tracking.

### Performance Optimisations
- Voice stealing algorithms prevent releasing voices from being stolen (eliminates envelope cutoff glitches)
- AudioWorklet reduces CPU usage compared to per-voice Web Audio nodes (40+ nodes → 1 processor)
- K-rate modulation at 30 FPS provides perceptually smooth modulation with <1% CPU overhead
- Shared effects chains (reverb/delay) reduce node count significantly

### Development Approach
- Test-driven development with isolated test harnesses before production integration
- Comprehensive progress tracking in `thoughts/PROGRESS.md`
- Structured implementation plans in `thoughts/plans/`
- Architecture research documented in `thoughts/research/`

---

## Links

- **Repository**: [https://github.com/MidiSlave/baeng-and-raembl](https://github.com/MidiSlave/baeng-and-raembl)
- **Live Site**: [https://midislave.github.io/baeng-and-raembl/](https://midislave.github.io/baeng-and-raembl/)
- **Documentation**: See `merged-app/docs/` for additional documentation

---

*Last Updated: 2025-12-30*
