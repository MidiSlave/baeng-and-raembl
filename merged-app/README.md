# Bæng & Ræmbl - Merged Synthesiser Suite

A unified web application combining Bæng (6-voice drum machine) and Ræmbl (monophonic/polyphonic synthesiser) with synchronised timing and independent audio routing.

---

## Quick Start

1. Open `index.html` in a modern web browser
2. Click anywhere to enable audio context
3. Use the TIME module play button in either app to start/stop playback
4. Both apps share clock timing but maintain independent audio chains

---

## Project Structure

```
merged-app/
├── index.html                      # Main application entry point
├── css/
│   ├── shared-base.css             # Global CSS variables and base styles
│   ├── baeng.css                   # Bæng styles (scoped to .baeng-app)
│   ├── raembl.css                  # Ræmbl styles (scoped to .raembl-app)
│   ├── baeng-original.css          # Backup of original Bæng CSS
│   └── raembl-original.css         # Backup of original Ræmbl CSS
├── js/
│   ├── shared/                     # Shared modules
│   │   ├── audio.js                # Unified AudioContext
│   │   └── clock.js                # Shared clock/scheduler
│   ├── state.js                    # State management (shared + per-app)
│   ├── baeng/                      # Bæng-specific modules (57 files)
│   └── raembl/                     # Ræmbl-specific modules (42 files)
├── processors/                     # Audio Worklet processors
│   ├── reverb-processor.js
│   └── scheduler-processor.js
├── PHASE_3_COMPLETION_REPORT.md    # Detailed implementation report
├── NAMESPACING_REFERENCE.md        # Developer reference guide
├── IMPLEMENTATION_STATUS.md         # Overall project status
├── scope-css.py                    # CSS scoping automation tool
└── namespace-dom.py                # DOM query namespacing tool
```

---

## Architecture

### HTML Layout

The application consists of two main sections:

```html
<body>
    <!-- Bæng Section (Top) -->
    <div id="baeng-app" class="baeng-app">
        <!-- All Bæng UI elements -->
    </div>

    <!-- Ræmbl Section (Bottom) -->
    <div id="raembl-app" class="raembl-app">
        <!-- All Ræmbl UI elements -->
    </div>

    <!-- Shared modules, then app-specific scripts -->
    <script type="module" src="js/shared/audio.js"></script>
    <script type="module" src="js/shared/clock.js"></script>
    <script type="module" src="js/state.js"></script>
    <script type="module" src="js/baeng/main.js"></script>
    <script type="module" src="js/raembl/main.js"></script>
</body>
```

### State Management

Three namespaces prevent conflicts:

```javascript
// Shared state (timing, audio context)
window.sharedState = {
    audioContext: null,
    clock: null,
    isPlaying: false,
    bpm: 120,
    swing: 0
};

// Bæng-specific state
window.baengState = {
    voices: [...],
    sequences: [...]
};

// Ræmbl-specific state
window.raemblState = {
    oscillator: {...},
    filter: {...}
};
```

### CSS Scoping

All CSS selectors are scoped to prevent style conflicts:

- Bæng: `.baeng-app .selector { ... }`
- Ræmbl: `.raembl-app .selector { ... }`
- Shared variables remain in `:root`

### DOM Namespacing

All HTML IDs are prefixed to prevent conflicts:

- Bæng: `id="baeng-settings-panel"`
- Ræmbl: `id="raembl-settings-panel"`

All DOM queries use namespaced IDs or scoped selectors:

```javascript
// Bæng
document.getElementById('baeng-play-button')
document.querySelector('.baeng-app .module')

// Ræmbl
document.getElementById('raembl-play-button')
document.querySelector('.raembl-app .module')
```

---

## Key Features

### Synchronised Timing

- Both apps share a single clock source
- BPM, swing, and transport controls are unified
- Either app's play button can start/stop playback
- Pattern length is independent per app

### Independent Audio Routing

```
Bæng Path:
  Voice 1-6 Oscillators
    → Per-voice effects
    → Global reverb/delay/waveguide
    → Bæng master gain
    → Shared AudioContext destination

Ræmbl Path:
  Oscillator → Mixer → Filter → Envelope
    → Global delay/reverb
    → Ræmbl master gain
    → Shared AudioContext destination
```

### Selective Patch Loading

- Loading a Bæng patch updates only Bæng parameters + shared timing
- Loading a Ræmbl patch updates only Ræmbl parameters + shared timing
- Both apps maintain independent patch formats

---

## Development

### Adding New Features

When adding new HTML elements or DOM queries, follow the namespacing conventions:

**Bæng:**
```javascript
const element = document.createElement('div');
element.id = 'baeng-new-element';  // Always prefix IDs

const btn = document.querySelector('.baeng-app .button');  // Always scope selectors
```

**Ræmbl:**
```javascript
const element = document.createElement('div');
element.id = 'raembl-new-element';  // Always prefix IDs

const btn = document.querySelector('.raembl-app .button');  // Always scope selectors
```

**CSS:**
```css
/* Bæng */
.baeng-app .new-class {
    color: var(--theme-color);
}

/* Ræmbl */
.raembl-app .new-class {
    color: var(--theme-color);
}
```

Refer to `NAMESPACING_REFERENCE.md` for detailed guidelines.

### Automation Tools

Two Python scripts automate bulk transformations:

**CSS Scoping:**
```bash
python3 scope-css.py input.css output.css .baeng-app
```

**DOM Query Namespacing:**
```bash
python3 namespace-dom.py ./js/baeng baeng- .baeng-app
```

---

## Testing

### Browser Compatibility

- Chrome/Edge 90+ (recommended)
- Firefox 88+
- Safari 14+

### Testing Checklist

- [ ] Both apps render without visual conflicts
- [ ] Play button in either app starts/stops both
- [ ] BPM changes affect both apps
- [ ] Swing changes affect both apps
- [ ] Each app plays audio independently
- [ ] Bæng patch loading doesn't affect Ræmbl state
- [ ] Ræmbl patch loading doesn't affect Bæng state
- [ ] No JavaScript console errors
- [ ] Settings panels open/close correctly
- [ ] All modals work (slice editor, sample browser, etc.)

---

## Statistics

| Metric | Count |
|--------|-------|
| Total JavaScript Files | 99 |
| Total Lines of Code Modified | ~8,000+ |
| HTML IDs Namespaced | 117 |
| DOM Queries Updated | ~300 |
| CSS Rules Scoped | ~4,700 |

---

## Phase Completion

- ✅ Phase 1: Core Infrastructure
  - Shared AudioContext
  - Unified state management
  - Separate code organisation

- ✅ Phase 2: Clock Synchronisation
  - Shared clock module
  - Unified transport controls
  - Independent pattern lengths

- ✅ Phase 3: UI Integration & Namespacing
  - Merged HTML layout
  - CSS scoping
  - DOM namespacing

- ⏳ Phase 4: Testing & Refinement (Next)
  - Browser testing
  - Bug fixes
  - Performance optimisation

---

## Documentation

- **PHASE_3_COMPLETION_REPORT.md** - Detailed implementation report with statistics
- **NAMESPACING_REFERENCE.md** - Developer reference for naming conventions
- **IMPLEMENTATION_STATUS.md** - Overall project status and roadmap

---

## Original Apps

The individual apps are preserved in:
- `../Individual-web-apps/Bæng_Web_app/`
- `../Individual-web-apps/ræmbL/`

---

## Known Issues

See `PHASE_3_COMPLETION_REPORT.md` section "Manual Review Recommendations" for areas that may need attention during testing.

---

## Contributing

When making changes:

1. Follow the namespacing conventions strictly
2. Test in multiple browsers
3. Verify no cross-app interference
4. Update documentation if adding new features
5. Run syntax validation: `node --check <file>.js`

---

## Licence

[To be determined - same as individual apps]

---

## Version History

- **Phase 3 Complete** (28 Nov 2025) - UI integration and namespacing
- **Phase 2 Complete** (28 Nov 2025) - Clock synchronisation
- **Phase 1 Complete** (28 Nov 2025) - Core infrastructure
- **Project Start** (28 Nov 2025) - Initial research and planning
