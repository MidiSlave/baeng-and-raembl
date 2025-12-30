# Shared Controls (Time Strip)

The **Time Strip** is the central control panel that synchronises timing between Bæng and Ræmbl. Located between the two synthesisers, it provides unified transport controls and timing parameters that keep both apps locked together.

![Time Strip](../images/ui/time-strip.png)

---

## Overview

The Time Strip serves as the master clock for the entire synthesiser suite. When you press play, both Bæng (top) and Ræmbl (bottom) start playing in perfect sync, sharing the same tempo, swing feel, and timing reference.

**Key Features:**
- Single source of truth for timing across both apps
- Audio-thread precision with 100ms lookahead scheduling
- Independent pattern lengths for polymetric compositions
- Real-time visual feedback with LED step indicators
- Settings access for each app

---

## Layout

The Time Strip is divided into three sections:

```
┌─────────────────────────────────────────────────────────────┐
│  BÆNG    [⚙]  1.1.1  [LENGTH]  [BPM]  [▶]  [i]  [SWING]  [LENGTH]  1.1.1  [⚙]  RÆMBL  │
└─────────────────────────────────────────────────────────────┘
     LEFT SECTION          CENTRE SECTION          RIGHT SECTION
```

- **Left Section**: Bæng controls (settings, display, pattern length)
- **Centre Section**: Shared controls (BPM, play/stop, swing)
- **Right Section**: Ræmbl controls (pattern length, display, settings)

---

## Transport Controls

### Play/Stop Button

The large **▶** (play triangle) button in the centre of the Time Strip controls transport for both apps simultaneously.

**Operation:**
- **Click**: Toggle playback on/off
- **Keyboard shortcut**: **Space bar** (when no text fields are focused)

**Behaviour:**
- Press once to **start** playback—both Bæng and Ræmbl begin playing from step 1
- Press again to **stop**—all voices release naturally, respecting envelope decay times
- Both apps always start and stop together (you cannot run only one app)

**Visual Feedback:**
- Button highlights when playback is active
- LED step displays (see below) animate to show current position
- All active notes and drums trigger precisely at their scheduled times

**Technical Details:**
- Uses Bæng's audio-thread scheduler with 100ms lookahead for sample-accurate timing
- Note triggers are scheduled in audio time (not visual/UI time) for zero jitter
- Stopping playback calls `releaseAllVoices()` to ensure notes ring out properly

---

## BPM (Tempo Control)

**BPM** (Beats Per Minute) sets the master tempo for both synthesisers.

**Range:** 20–300 BPM
**Default:** 120 BPM

**Interaction:**
- **Click and drag** the fader left/right to adjust tempo
- **Shift+drag** for fine control (10× precision)
- The current BPM value displays above the fader

**Musical Context:**

| BPM Range | Style Examples |
|-----------|----------------|
| 60–80 | Downtempo, Hip-Hop, Dub |
| 90–110 | House, Breaks, Electro |
| 120–130 | Techno, Trance, Eurodance |
| 140–160 | Drum & Bass, Jungle, Dubstep |
| 160+ | Hardcore, Gabber, Breakcore |

**How It Works:**
- All step sequencers (both apps) recalculate their timing when BPM changes
- Step duration = `60,000ms ÷ BPM ÷ stepsPerBeat`
- Default subdivision is 4 steps per beat (16th notes at 4/4)
- Tempo changes take effect immediately on the next scheduled step

**Tip:** Try tempo automation by gradually increasing BPM during a build-up section (requires manual adjustment—automation recording is not currently supported).

---

## Swing (Groove Feel)

**SWING** adds rhythmic groove by delaying off-beat steps, creating a "shuffled" or "swung" timing feel.

**Range:** 0–100%
**Default:** 0% (straight timing)

**Interaction:**
- **Click and drag** the fader left/right to adjust swing amount
- **Shift+drag** for fine control (10× precision)
- The current swing percentage displays above the fader

**How Swing Works:**

- **0% Swing** = Straight timing (all steps equally spaced)
- **50% Swing** = Classic swing/shuffle (off-beats delayed halfway to next downbeat)
- **100% Swing** = Extreme swing (off-beats fully aligned with next downbeat, creating a "dotted" feel)

**Example (50% Swing at 120 BPM):**

```
Without Swing:
Step:  1    2    3    4    1    2    3    4
Time:  0ms 125ms 250ms 375ms 500ms...
       ↓    ↓    ↓    ↓    ↓

With 50% Swing:
Step:  1    2      3    4      1    2      3    4
Time:  0ms  188ms  250ms 438ms  500ms...
       ↓    ↓      ↓    ↓      ↓
       ON   LATE   ON   LATE   ON
```

**Musical Applications:**

| Swing % | Feel | Common Genres |
|---------|------|---------------|
| 0% | Straight, quantised | Techno, Hard Trance, Industrial |
| 20–30% | Subtle groove | House, Tech House |
| 40–60% | Classic swing | Jazz, Hip-Hop, UK Garage |
| 70–100% | Heavy shuffle | Trap, Dubstep, Experimental |

**Technical Details:**
- Swing only affects **off-beat steps** (steps 2, 4, 6, 8, 10, etc.)
- Downbeat steps (1, 3, 5, 7, 9, etc.) always play on-time
- Swing offset = `(stepDuration ÷ 2) × (swing ÷ 100)`
- The scheduler advances at straight time—only trigger times are delayed
- Both Bæng and Ræmbl share the same swing setting

**Tip:** For polymetric grooves, try combining swing with different pattern lengths. For example, Bæng at 3 steps and Ræmbl at 4 steps creates evolving phase relationships.

---

## Bar Length (Pattern Length)

Each app has its own **LENGTH** control, allowing independent pattern lengths for polymetric compositions.

**Range:** 1–128 bars
**Default:** 4 bars

**Interaction:**
- **Bæng LENGTH**: Left section of Time Strip (controls Bæng's pattern length)
- **Ræmbl LENGTH**: Right section of Time Strip (controls Ræmbl's pattern length)
- **Click and drag** the fader left/right to adjust bar length
- **Shift+drag** for fine control (10× precision)

**How It Works:**
- **LENGTH** determines how many bars play before the pattern loops back to bar 1
- Each app counts bars independently, creating polymetric cycles when lengths differ
- The pattern length does **not** affect the number of steps per bar (that's controlled per voice)

**Example (Polymetric Patterns):**

```
Bæng LENGTH = 3 bars (16 steps per bar = 48 total steps)
Ræmbl LENGTH = 4 bars (16 steps per bar = 64 total steps)

Bar Alignment:
Bæng:  │Bar 1│Bar 2│Bar 3│Bar 1│Bar 2│Bar 3│Bar 1│...
Ræmbl: │Bar 1│Bar 2│Bar 3│Bar 4│Bar 1│Bar 2│Bar 3│Bar 4│...
       ↑                       ↑
       Sync                    Sync (after 12 bars)
```

**Musical Applications:**

| Length | Use Case |
|--------|----------|
| 1 bar | Tight loops, minimal techno, live jamming |
| 2 bars | Call-and-response patterns |
| 4 bars | Standard phrase length (most common) |
| 8 bars | Extended phrases, builds, breakdowns |
| 16+ bars | Generative/evolving compositions |

**Polymetric Cycling:**

When Bæng and Ræmbl have different lengths, they create evolving phase relationships:
- **3 vs 4**: Cycles every 12 bars
- **5 vs 7**: Cycles every 35 bars
- **3 vs 5**: Cycles every 15 bars

**Tip:** Use the **RST (Reset)** button in Bæng's VOICES module to lock all patterns to bar boundaries. Disable RST for free-running polyrhythms where patterns drift.

---

## Synchronisation Between Apps

Both Bæng and Ræmbl subscribe to a **unified clock system** based on Bæng's audio-thread scheduler. This ensures sample-accurate synchronisation regardless of UI rendering performance.

### How Synchronisation Works

1. **Shared Clock (100ms Lookahead)**
   - Audio context polls every 25ms
   - Schedules all events within 100ms window
   - No timing drift or jitter

2. **Polymetric Support**
   - Each app tracks its own bar/step position
   - Different pattern lengths cycle independently
   - Clock broadcasts per-app positions to subscribers

3. **Timing Properties (Shared State)**
   - `isPlaying` – Transport state
   - `bpm` – Master tempo
   - `swing` – Groove offset
   - `baengBarLength` – Bæng's pattern length
   - `raemblBarLength` – Ræmbl's pattern length

4. **Event Broadcasting**
   - `play` – Transport started
   - `stop` – Transport stopped
   - `step` – New step triggered (with per-app positions)
   - `bpmChange` – Tempo updated
   - `swingChange` – Swing updated

### What This Means For You

- Both apps **always** play in sync—you cannot unsync them
- Tempo and swing changes affect both apps instantly
- Pattern lengths are independent, allowing polymetric cycles
- All note/drum triggers are scheduled in audio time (no visual lag)

---

## Visual Feedback (LED Step Indicators)

### Position Displays

The **LED step displays** show the current playback position for each app:

- **Bæng display** (left section): `BAR.BEAT.STEP` format (e.g., `2.3.4` = Bar 2, Beat 3, Step 4)
- **Ræmbl display** (right section): Same format, independent position

**Display Format:**
```
1.1.1
│ │ └─ Step within beat (1-4 by default)
│ └─── Beat within bar (1-4 in 4/4 time)
└───── Bar number (1-128)
```

**How It Works:**
- Updates in real-time during playback
- Shows `1.1.1` when stopped
- Each app's display updates independently (polymetric patterns show different positions)

### Sequencer Step Highlighting

In addition to the Time Strip displays:
- **Bæng**: Active steps highlight in the 6-voice step sequencer grid
- **Ræmbl**: Active steps highlight in the pitch path sequencer

These visual indicators help you see exactly where each app is in its pattern.

**Tip:** Watch the displays to understand polymetric cycles. When both show `1.1.1` simultaneously, the patterns have aligned.

---

## Settings Buttons

The **⚙** (gear) buttons on each side of the Time Strip open the settings panel for the respective app.

### Bæng Settings (Left Gear Icon)

Opens the Bæng settings panel with tabs for:
- **PATCH**: Save/load global patches
- **FX**: Switch between Classic and Clouds FX modes
- **MIDI**: MIDI input and CC mapping (planned)
- **THEME**: Light/dark mode, colour customisation
- **SCALE**: Scale quantisation for pitch modulation
- **HELP**: User manual and about information

### Ræmbl Settings (Right Gear Icon)

Opens the Ræmbl settings panel with tabs for:
- **PATCH**: Save/load global patches
- **FX**: Switch between Classic and Clouds FX modes
- **MIDI**: MIDI input and CC mapping (planned)
- **THEME**: Light/dark mode, colour customisation
- **SCALE**: Scale quantisation (for DX7 pitch modulation and sequencer)
- **HELP**: User manual and about information

**Keyboard Shortcut:** Press **Escape** to close any open settings panel.

---

## Info Button

The **i** (info) button in the centre of the Time Strip opens the **Parameter Info Modal**. This modal displays detailed information about any parameter when you hover over it.

**How to Use:**
1. Click the **i** button (or press **Shift+/** or **?**)
2. Hover over any knob, fader, or button in the interface
3. The modal shows the parameter name, current value, range, and description
4. Click the **i** button again (or press **Escape**) to close

**Tip:** The info modal is context-aware—it shows different information for the same parameter across different engines or modules.

---

## Cross-References

For more detailed information about each app:
- **[Getting Started Guide](./getting-started.md)** – First-time setup and basic usage
- **[Bæng User Guide](./baeng-guide.md)** – Complete Bæng documentation (drum machine)
- **[Ræmbl User Guide](./raembl-guide.md)** – Complete Ræmbl documentation (synthesiser)

For technical details about the clock system:
- **[Developer Documentation](../developer/clock-system.md)** – Audio-thread scheduler architecture
- **[State Management](../developer/state-management.md)** – How shared state works

---

## Tips and Tricks

### Creating Grooves

1. **Start with straight timing** (0% swing) to establish a solid foundation
2. **Add 20–30% swing** for subtle groove without losing punch
3. **Automate swing** during transitions (manually adjust during playback)
4. **Combine with per-voice FLAM** in Bæng for organic humanisation

### Polymetric Patterns

1. **Set different bar lengths** (e.g., Bæng = 3, Ræmbl = 4)
2. **Use simple patterns** so the polymetric relationship is audible
3. **Wait for the cycle** to complete (patterns align after LCM of both lengths)
4. **Disable RST** in Bæng VOICES for free-running polyrhythms

### Tempo Transitions

1. **Gradual changes** (±10 BPM) sound smooth during builds/drops
2. **Double/half tempo** creates dramatic energy shifts
3. **Sync to external tracks** by manually matching BPM (no MIDI clock yet)
4. **Record automation** by manually adjusting whilst recording audio externally

### Workflow Optimisation

1. **Space bar** for quick play/stop (keep hands on keyboard)
2. **Shift+drag** for precise BPM/swing adjustments
3. **Patch management**: Save frequently to preserve your work
4. **Settings shortcuts**: Gear icons provide quick access to both apps

---

## Troubleshooting

### Both Apps Won't Play

- **Solution**: Click anywhere on the page first to enable audio context (browser security requirement)
- **Check**: Space bar shortcut works only when no text fields are focused

### Timing Sounds Off

- **Check swing setting**: Make sure it's at 0% for straight timing
- **Reset patterns**: Stop playback and press play again to resync
- **Check browser**: Some browsers have audio latency issues—Chrome/Edge recommended

### Step Indicators Not Updating

- **Refresh the page**: The visual display may desync if the tab was backgrounded for extended periods
- **Check browser performance**: CPU-heavy tasks can cause UI lag (audio is unaffected)

### Different BPM Per App?

- **Not possible**: BPM is always shared between both apps
- **Workaround**: Use different bar lengths for polymetric feels that simulate tempo differences

---

## Summary

The Time Strip is your **command centre** for unified timing control. Master these controls and you'll be able to create everything from tight, quantised techno loops to evolving polymetric soundscapes.

**Key Takeaways:**
- **Play/Stop**: Single button controls both apps (Space bar shortcut)
- **BPM**: Master tempo (20–300 BPM, Shift+drag for fine control)
- **Swing**: Groove offset for off-beats (0–100%, affects both apps)
- **Bar Length**: Independent per app (1–128 bars, enables polymetric patterns)
- **Displays**: Real-time position feedback (BAR.BEAT.STEP format)
- **Settings**: Quick access to app-specific configuration panels
- **Info Modal**: Contextual parameter help

Now that you understand the shared controls, explore the individual app guides to unlock the full potential of Bæng & Ræmbl!
