# Patch Management

Patches are complete snapshots of your synthesiser session, including all parameter settings, sequences, effects, and modulations. The unified patch system allows you to save and load individual app states (Bæng or Ræmbl) or complete sessions with both apps together.

## Overview

### What Are Patches?

A **patch** is a JSON file containing:
- **Bæng**: 6 voice configurations, sequences, effects, per-parameter modulations, drum bus settings
- **Ræmbl**: Oscillator, filter, envelope, sequencer, effects, per-parameter modulations
- **Shared Timing**: BPM, swing, and independent bar lengths for each app

Patches use a unified format (v1.2.0) that ensures compatibility between updates and allows selective loading of individual components.

### Patch Format Versions

- **v1.0.0**: Initial unified format with shared timing
- **v1.1.0**: Added per-parameter modulation system (PPMod)
- **v1.2.0**: Added engine type tracking (subtractive/Plaits/Rings) and enhanced modulation storage

The patch system is **backward compatible**—older patches load correctly in newer versions with appropriate fallbacks.

---

## Saving Patches

### Saving a Complete Session (Bæng + Ræmbl)

Both apps include a **Save Patch** button in their respective settings panels:

1. **Open Settings**: Click the gear icon in the time strip for either app
2. **Click "Save Patch"**: Downloads a timestamped JSON file
   - Bæng: `baeng_patch_YYYYMMDD_HHMMSS.json`
   - Ræmbl: `rambler_patch_YYYYMMDD_HHMMSS.json`

**What's Saved (Bæng):**
- All 6 voice configurations (engine type, parameters, routing)
- Per-voice sequences (gates, accents, ratchets, probabilities, euclidean patterns)
- Global effects (reverb, delay, Clouds, drum bus)
- Per-parameter modulations (LFO, RND, ENV, EF, TM, SEQ modes)
- FX mode (classic vs. Clouds)
- Scale quantisation settings

**What's Saved (Ræmbl):**
- Engine type (subtractive, Plaits, Rings)
- Oscillator, mixer, filter, envelope settings
- Factors sequencer (euclidean pattern, accents, slides, trills)
- Path sequencer (scale, root, probability, step pitches)
- Global effects (reverb, delay, Clouds)
- Per-parameter modulations
- Mono/poly mode

**Shared Timing Parameters:**
- BPM (20-300)
- Swing (0-100%)
- Bæng bar length (1-128 beats)
- Ræmbl bar length (1-128 beats)

**Not Saved:**
- Runtime state (playback position, clock state)
- Audio buffers (DX7 patches, samples, slice data)
- Theme preferences (light/dark mode)
- Browser-stored data (FX mode, last used banks)

### Saving Individual Voice Patches (Bæng Only)

Bæng supports saving **per-voice patches** for quick recall of individual drum voice configurations:

1. **Select the voice** (keys 1-6)
2. **Open Voices module** in the sequencer view
3. **Click "Save Voice Patch"**

**Voice Patch Contents:**
- Engine type and all engine-specific parameters
- Sequence for that voice (gates, accents, ratchets)
- Euclidean pattern settings
- Per-voice effects sends and routing
- Per-parameter modulations for that voice

---

## Loading Patches

### Loading a Complete Session

1. **Open Settings**: Click the gear icon in either app's time strip
2. **Click "Load Patch"**: Opens file picker
3. **Select JSON file**: Choose a previously saved patch

**What Happens:**
- **Unified Format Detected**: If the patch contains both `baeng` and `raembl` sections:
  - Shared timing parameters are applied to both apps
  - Each app loads its respective section independently
- **Single-App Format**: Legacy patches load into the relevant app only
- **Timing Sync**: BPM and swing are always updated globally when present in the patch

**Backward Compatibility:**
- **v1.0.0 → v1.2.0**: Missing modulation data defaults to disabled
- **v1.1.0 → v1.2.0**: Missing engine type defaults to `subtractive` (Ræmbl) or current engine (Bæng)
- **Old Ræmbl patches**: Bar length applies to both apps if independent lengths not present

### Loading Voice Patches (Bæng Only)

1. **Select the target voice** (keys 1-6)
2. **Open Voices module**
3. **Click "Load Voice Patch"**
4. **Select voice patch JSON file**

The loaded voice configuration replaces the currently selected voice's settings.

### DX7 Patch Reconstruction

When loading a Bæng patch containing DX7 voices:
- **Bank Loaded**: If the same DX7 bank is currently active, the patch reference is restored automatically
- **Bank Missing**: Voice reverts to default engine or prompts for bank reload

---

## Selective Loading

The unified patch format allows **selective parameter restoration**:

### Timing Always Syncs

When loading any patch (Bæng or Ræmbl):
- **BPM** and **swing** are always updated globally
- Both apps immediately reflect the new timing
- Independent bar lengths are preserved per app

### App-Specific Loading

Loading a Bæng patch **does not affect Ræmbl** (and vice versa):
- Each app's parameters remain isolated
- Only shared timing is broadcast to both apps

### Partial State Restoration

If a patch is missing data (e.g., older format without modulations):
- Missing parameters use current values
- Validation ensures no broken references
- Feedback messages indicate successful load

---

## Browser Storage

### LocalStorage (Automatic)

Certain preferences are saved automatically to browser localStorage:
- **FX Mode**: Classic vs. Clouds (per app)
- **Theme**: Light/dark mode preference
- **Time strip state**: Last used timing settings

**Important**: LocalStorage is **browser-specific** and **not included in patch files**. To share full settings between machines, use exported patches.

### Preset Management

There is **no built-in preset system** currently. To manage multiple patches:

1. **Organise files locally**: Create folders for different sessions, kits, or performance setups
2. **Use descriptive names**: Rename saved patches for easy identification
   - Example: `baeng_techno_kicks_20250128.json`
3. **Version control**: Use Git or Dropbox for patch libraries

**Feature Request**: A built-in preset browser is planned for future releases (see `thoughts/notes/preset-browser-spec.md`).

---

## Export/Import

### Exporting Patches

Patches are automatically exported as **human-readable JSON files** when saved:

```json
{
  "version": "1.2.0",
  "timestamp": "2025-01-28T14:30:00.000Z",
  "shared": {
    "bpm": 128,
    "swing": 55,
    "baengBarLength": 4,
    "raemblBarLength": 8
  },
  "baeng": {
    "voices": [...],
    "sequences": [...],
    "perParamModulations": {...},
    ...
  },
  "raembl": {
    "engineType": "plaits",
    "plaitsEngine": 7,
    "perParamModulations": {...},
    ...
  }
}
```

**Editing Patches Manually:**
- You can edit patches in a text editor for batch operations
- Ensure JSON syntax remains valid
- Refer to `docs/developer/patch-format.md` for schema details

### Importing Patches

Simply **load the JSON file** using the standard Load Patch button. The app validates the format and applies compatible parameters.

**Format Detection:**
- Checks for `version` field and `baeng`/`raembl` sections
- Falls back to legacy format parsing if unified structure not found
- Displays error messages if JSON is malformed

### Sharing Patches

**What You Can Share:**
- Complete session patches (both apps)
- Individual app patches (Bæng or Ræmbl)
- Per-voice patches (Bæng only)

**What Cannot Be Shared:**
- DX7 banks (must be loaded separately)
- Sample kits (must be loaded separately)
- Slice audio files (must be loaded separately)

**Recommendation**: When sharing patches that use DX7, SAMPLE, or SLICE engines, include notes about which banks/files are required.

---

## Tips

### Workflow: Session Snapshots

**Use patches as checkpoints during sound design:**

1. **Start a session**: Load a base patch or init state
2. **Design sounds**: Adjust parameters, build sequences
3. **Save regularly**: Create timestamped snapshots (`session_v1.json`, `session_v2.json`)
4. **A/B compare**: Load different versions to compare results
5. **Finalise**: Save final patch with descriptive name

### Workflow: Live Performance

**Create a patch library for sets:**

1. **Organise by song/section**: `song1_intro.json`, `song1_drop.json`
2. **Pre-load samples/banks**: Ensure all DX7 banks and kits are ready before the set
3. **Test loading times**: Practice switching patches during rehearsal
4. **Backup patches**: Keep copies on multiple devices

### Workflow: Collaboration

**Share patches with other producers:**

1. **Export patch**: Save and share JSON file
2. **Document dependencies**: List required DX7 banks, sample kits, etc.
3. **Version control**: Use Git for collaborative patch development
4. **Annotate changes**: Add timestamps or notes in the patch filename

### Troubleshooting

**Patch won't load:**
- **Check JSON syntax**: Use a JSON validator (e.g., jsonlint.com)
- **Verify version compatibility**: Older patches may need manual editing
- **Inspect browser console**: Error messages indicate specific issues

**DX7 voices sound wrong after loading:**
- **Bank mismatch**: Reload the correct DX7 bank via the DX7 browser
- **Patch index out of range**: The saved patch references a non-existent bank position

**Modulation not restored:**
- **Pre-v1.1.0 patches**: Per-parameter modulation was not saved in older formats
- **Manually re-enable**: Open PPMod modal and reconfigure modulation sources

**Sample/slice voices silent:**
- **Audio buffers not saved**: Reload sample kits or slice files manually
- **Path references lost**: Saved patches store metadata but not audio data

---

## See Also

- [Patch Format Specification (Developer)](../developer/patch-format.md) – Technical details of the patch schema
- [Unified Time System](../developer/clock-system.md) – How timing parameters sync between apps
- [Per-Parameter Modulation](../user-guide/ppmod.md) – Understanding modulation storage in patches

---

**Last Updated**: 2025-01-28
**Patch Format Version**: 1.2.0
