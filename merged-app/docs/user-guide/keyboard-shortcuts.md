# Keyboard Shortcuts

Complete keyboard shortcut reference for Bæng & Ræmbl.

---

## Overview

Keyboard shortcuts provide quick access to transport controls, voice selection, note triggering, and interface navigation. All shortcuts work without holding modifier keys unless specifically noted.

**Note:** Shortcuts are disabled when typing in text inputs, textareas, or other editable fields.

---

## Transport Shortcuts

Global playback and timing controls:

| Shortcut | Action | Notes |
|----------|--------|-------|
| **Space** | Play/Stop transport | Toggles playback for both Bæng and Ræmbl simultaneously |

---

## Bæng Shortcuts

### Voice Selection & Triggering

| Shortcut | Action | Notes |
|----------|--------|-------|
| **1** | Select/trigger voice 1 (T1) | Switches to voice 1 and plays a preview |
| **2** | Select/trigger voice 2 (T2) | Switches to voice 2 and plays a preview |
| **3** | Select/trigger voice 3 (T3) | Switches to voice 3 and plays a preview |
| **4** | Select/trigger voice 4 (T4) | Switches to voice 4 and plays a preview |
| **5** | Select/trigger voice 5 (T5) | Switches to voice 5 and plays a preview |
| **6** | Select/trigger voice 6 (T6) | Switches to voice 6 and plays a preview |
| **Shift + 1-6** | Accented voice trigger | Triggers voice with accent (1.5× velocity boost) |

**Tip:** Voice selection via number keys is useful for quickly auditioning different drum sounds whilst programming patterns.

### Sequencer Edit Modes

| Shortcut | Action | Notes |
|----------|--------|-------|
| **R** (hold) | Ratchet edit mode | Whilst held, clicking steps adds ratchet divisions (1/8, 1/16, 1/32) |

### Undo/Redo

| Shortcut | Action | Platform |
|----------|--------|----------|
| **Cmd+Z** | Undo last change | macOS |
| **Ctrl+Z** | Undo last change | Windows/Linux |
| **Cmd+X** | Redo last undone change | macOS |
| **Ctrl+X** | Redo last undone change | Windows/Linux |

**Note:** Undo/redo uses a unified history system that tracks step edits, parameter changes, and MIDI CC updates.

---

## Ræmbl Shortcuts

### Piano Keyboard Mapping

Ræmbl can be played using your computer keyboard as a piano keyboard. The layout follows standard music software conventions with two rows of keys:

#### Lower Row (White Keys)

| Key | Note | Base Octave |
|-----|------|-------------|
| **A** | C | 3 |
| **S** | D | 3 |
| **D** | E | 3 |
| **F** | F | 3 |
| **G** | G | 3 |
| **H** | A | 3 |
| **J** | B | 3 |
| **K** | C | 4 |
| **L** | D | 4 |
| **;** | E | 4 |
| **'** | F | 4 |

#### Upper Row (Black Keys / Sharps)

| Key | Note | Base Octave |
|-----|------|-------------|
| **W** | C# | 3 |
| **E** | D# | 3 |
| **T** | F# | 3 |
| **Y** | G# | 3 |
| **U** | A# | 3 |
| **O** | C# | 4 |
| **P** | D# | 4 |

#### Octave Transposition

| Shortcut | Action | Range |
|----------|--------|-------|
| **Z** | Octave down | -2 to +2 octaves from base |
| **X** | Octave up | -2 to +2 octaves from base |

**Tip:** Use Z/X keys to quickly shift the entire keyboard up or down by octaves without changing your hand position.

#### Keyboard Layout Diagram

```
┌─────────────────────────────────────────────────┐
│  W   E       T   Y   U       O   P              │  ← Sharps (black keys)
│ ┌─┐ ┌─┐     ┌─┐ ┌─┐ ┌─┐     ┌─┐ ┌─┐            │
│ │C#│ │D#│    │F#│ │G#│ │A#│    │C#│ │D#│          │
│ └┬┘ └┬┘     └┬┘ └┬┘ └┬┘     └┬┘ └┬┘            │
│  │   │       │   │   │       │   │              │
├──┴───┴───┬───┴───┴───┴───┬───┴───┴──────────────┤
│  A   S   D   F   G   H   J   K   L   ;   '    │  ← Naturals (white keys)
│  C   D   E   F   G   A   B   C   D   E   F    │
│ [     Octave 3        ] [    Octave 4      ]   │
└─────────────────────────────────────────────────┘

     Z = Octave Down    X = Octave Up
```

### Performance Modifiers

| Shortcut | Action | Notes |
|----------|--------|-------|
| **Shift + note key** | Accent | Triggers note with accent flag (increases velocity and envelope snap) |

---

## Modal & Dialog Shortcuts

These shortcuts work when modals and dialogue boxes are open:

| Shortcut | Action | Applies To |
|----------|--------|-----------|
| **Esc** | Close current modal/dialogue | All modals (settings, manual, PPMod, sidechain, browsers) |
| **Enter** | Confirm/load selected item | DX7, Kit, and Sample browsers |

### Browser-Specific Shortcuts

When a browser (DX7, Kit, or Sample) is open:

| Shortcut | Action | Notes |
|----------|--------|-------|
| **↑ / ↓** | Navigate up/down | Moves selection through list |
| **← / →** | Navigate folders | Enter/exit folders (where applicable) |
| **Enter** | Load selected item | Loads patch/kit/sample and closes browser |
| **Esc** | Close browser | Closes without loading (or goes up one folder level in DX7 browser) |
| **1-6** | Trigger preview | DX7 browser only: triggers preview of selected patch on voices 1-6 |

---

## Slice Editor Shortcuts

When the Slice Editor modal is open:

| Shortcut | Action | Notes |
|----------|--------|-------|
| **1-6** | Preview current slice | Only works if the key matches the voice being edited |
| **Esc** | Close editor | Closes slice editor and returns to main interface |

---

## Quick Reference Card

### Global

- **Space** → Play/Stop
- **Esc** → Close modals

### Bæng

- **1-6** → Select/trigger voice
- **Shift + 1-6** → Accented trigger
- **R (hold)** → Ratchet edit mode
- **Cmd/Ctrl + Z** → Undo
- **Cmd/Ctrl + X** → Redo

### Ræmbl

- **A-J, K-'** → Play notes (white keys)
- **W, E, T, Y, U, O, P** → Play sharps (black keys)
- **Z** → Octave down
- **X** → Octave up
- **Shift + note** → Accented note

### Browsers

- **↑↓←→** → Navigate
- **Enter** → Load
- **Esc** → Close
- **1-6** → Preview (DX7 only)

---

## Tips & Best Practices

### Live Performance

1. **Use keyboard for quick voice switching** - Press 1-6 whilst playing to audition different drum voices without interrupting your workflow
2. **Master the octave controls** - Z/X keys let you play across a 5-octave range (octaves 1-8) from a single keyboard layout
3. **Space bar is your friend** - Quickly start/stop the transport without reaching for the mouse

### Pattern Programming

1. **Hold R whilst clicking steps** - Enables ratchet mode for fast rhythmic subdivisions
2. **Shift-click for accents** - Add emphasis to specific hits without adjusting velocity faders
3. **Use Esc to quickly close browsers** - Browse patches/kits, press Esc to return without loading

### MIDI Integration

If you have a MIDI controller connected, keyboard shortcuts still work alongside MIDI input. The keyboard is particularly useful for:
- Triggering Bæng voices whilst playing Ræmbl on a MIDI keyboard
- Quick octave shifts when your MIDI controller lacks transpose buttons
- Accessing modals and settings without leaving your performance position

---

## Accessibility Notes

- All shortcuts use single keys or common modifier combinations (Shift, Cmd/Ctrl)
- No shortcuts require simultaneously pressing more than 2 keys
- Critical functions (Play/Stop, Close) use standard conventions (Space, Esc)
- Shortcuts are disabled in text input fields to prevent conflicts

---

## Related Documentation

- **[Getting Started](getting-started.md)** - First-time user guide with basic shortcuts table
- **[Bæng User Guide](baeng-guide.md)** - Detailed drum machine features and workflow
- **[Ræmbl User Guide](raembl-guide.md)** - Synthesis engine, modulation, and sequencing
- **[DX7 Browser](../engines/baeng/dx7-engine.md#browser-navigation)** - DX7 patch browser keyboard navigation

---

## Troubleshooting

### Shortcuts Not Working?

1. **Check for text input focus** - Click outside any text fields or settings panels
2. **Close modals** - Some shortcuts are context-specific (press Esc to reset)
3. **Browser compatibility** - Ensure you're using a supported browser (Chrome 90+, Firefox 88+, Safari 14+)

### Keyboard Notes Not Triggering?

1. **Audio context not resumed** - Click anywhere on the page first, or press Space to start the transport
2. **Settings panel is open** - Close the settings panel with Esc
3. **Voice levels too low** - Check Ræmbl's master output and envelope levels

### Octave Transpose Not Working?

Z/X keys only affect notes triggered via the computer keyboard, not MIDI input. If you need to transpose MIDI notes, use your MIDI controller's transpose function or adjust the ROOT parameter in Ræmbl's Path module.

---

**Questions or issues?** Report bugs or suggest new shortcuts on [GitHub Issues](https://github.com/MidiSlave/baeng-and-raembl/issues).
