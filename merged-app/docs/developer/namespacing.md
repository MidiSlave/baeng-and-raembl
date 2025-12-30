# Namespacing Conventions

**Bæng & Ræmbl Merged Synthesiser Suite**

---

## Overview

Bæng & Ræmbl is a unified web application that merges two independent synthesisers into a single browser window. To prevent conflicts between these two applications, we enforce strict namespacing conventions across all layers of the codebase.

### Why Namespacing Matters

Without proper namespacing, the merged application would suffer from:

- **DOM ID collisions** — Both apps using `#reverb` would target the same element
- **CSS specificity conflicts** — `.module` styles from both apps would override each other
- **Event name ambiguity** — Listeners wouldn't know which app triggered an event
- **State corruption** — Variables with the same name would overwrite each other

Namespacing ensures that Bæng and Ræmbl can coexist safely whilst sharing common resources (AudioContext, clock system, timing parameters) through explicitly shared namespaces.

---

## DOM Element IDs

All DOM element IDs **must** use namespace prefixes to indicate ownership.

### Prefix Rules

| Namespace | Prefix | Used For |
|-----------|--------|----------|
| **Bæng** | `baeng-` | Bæng-specific UI elements |
| **Ræmbl** | `raembl-` | Ræmbl-specific UI elements |
| **Shared** | `shared-` | Common controls (BPM, swing, transport) |

### Examples

#### ✅ Correct

```html
<!-- Bæng elements -->
<div id="baeng-app" class="baeng-app">
  <div id="baeng-main-row">
    <div id="baeng-engine" class="module">
      <button id="baeng-save-patch-button">Save</button>
      <input id="baeng-load-patch-input" type="file">
    </div>
    <div id="baeng-clouds-fx" class="module">
      <button id="baeng-clouds-mode-btn">Mode</button>
      <div id="baeng-clouds-mode-menu"></div>
    </div>
  </div>
  <div id="baeng-settings-panel"></div>
</div>

<!-- Ræmbl elements -->
<div id="raembl-app" class="raembl-app">
  <div id="raembl-clock" class="module">
    <canvas id="raembl-clock-canvas"></canvas>
  </div>
  <div id="raembl-filter" class="module">
    <div id="raembl-filter-cutoff"></div>
  </div>
</div>

<!-- Shared elements -->
<div id="shared-transport">
  <button id="shared-play-button">▶</button>
  <button id="shared-stop-button">■</button>
</div>
<div id="shared-time-strip">
  <div id="shared-bpm"></div>
  <div id="shared-swing"></div>
</div>
```

#### ❌ Incorrect

```html
<!-- Missing namespace prefixes -->
<div id="app">
  <div id="engine"></div>          <!-- Which app's engine? -->
  <div id="reverb"></div>           <!-- Collision waiting to happen -->
  <button id="save-button"></button>
</div>

<!-- Generic IDs cause conflicts -->
<canvas id="canvas"></canvas>
<div id="module-1"></div>
```

### JavaScript Access

When accessing elements by ID in JavaScript, the namespace prefix makes ownership explicit:

```javascript
// Bæng code
const baengEngine = document.getElementById('baeng-engine');
const saveBtn = document.getElementById('baeng-save-patch-button');
const cloudsModule = document.getElementById('baeng-clouds-fx');

// Ræmbl code
const raemblFilter = document.getElementById('raembl-filter');
const clockCanvas = document.getElementById('raembl-clock-canvas');

// Shared code
const playBtn = document.getElementById('shared-play-button');
const bpmFader = document.getElementById('shared-bpm');
```

---

## CSS Classes

CSS classes use **namespace scoping** through parent containers to avoid specificity conflicts.

### Scoping Pattern

All app-specific styles are nested under a top-level class (`.baeng-app` or `.raembl-app`):

```css
/* ===== Bæng Styles (css/baeng.css) ===== */
.baeng-app {
  /* Bæng layout variables */
  --baeng-module-height: 290px;
  --baeng-knob-size: 34px;
}

.baeng-app .module {
  background-color: var(--bg-module);
  border: 1px solid var(--theme-color);
  height: var(--baeng-module-height);
}

.baeng-app .main-row {
  display: flex;
  gap: var(--dynamic-module-gap);
}

.baeng-app .voice-patch-button {
  width: 16px;
  height: 16px;
}

/* ===== Ræmbl Styles (css/raembl.css) ===== */
.raembl-app {
  /* Ræmbl layout variables */
  --raembl-fader-height: 120px;
  --raembl-canvas-height: 60px;
}

.raembl-app .module {
  background-color: var(--bg-module);
  border: 1px solid var(--theme-color);
  /* Different layout from Bæng */
}

.raembl-app .top-row {
  display: flex;
  gap: var(--dynamic-module-gap);
}

.raembl-app .fader-container {
  width: var(--raembl-fader-container-width);
}
```

### Why This Works

By scoping with `.baeng-app` and `.raembl-app`, both apps can use generic class names like `.module`, `.fader-container`, and `.button` without conflicts:

```html
<!-- Both use .module but inherit different styles -->
<div class="baeng-app">
  <div class="module">Bæng module (290px height)</div>
</div>

<div class="raembl-app">
  <div class="module">Ræmbl module (different height)</div>
</div>
```

### Shared Styles

Truly shared styles (typography, spacing, theme variables) live in `css/shared-base.css` and don't require namespace scoping:

```css
/* css/shared-base.css */
:root {
  --theme-color: hsl(45, 100%, 50%);
  --bg-app: hsl(0, 0%, 10%);
  --bg-module: hsl(0, 0%, 15%);

  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
}

body {
  background-color: var(--bg-app);
  font-family: 'Archivo Black', sans-serif;
}
```

---

## Event Names

Custom DOM events use **camelCase with namespace prefix** to indicate the source app.

### Naming Pattern

```
{namespace}{EventName}
```

- **Namespace**: `baeng`, `raembl`, `shared`, or no prefix for generic events
- **EventName**: Descriptive, PascalCase (e.g. `ParameterChange`, `StepAdvanced`)

### Examples

#### ✅ Correct

```javascript
// Bæng events
document.dispatchEvent(new CustomEvent('baengParameterChange', {
  detail: { paramId: 'baeng-reverb-size', value: 0.7 }
}));

document.dispatchEvent(new CustomEvent('baengPPModDrag', {
  detail: { paramId: 'baeng-dx7-ratio1', percentage: 0.5 }
}));

// Ræmbl events
document.dispatchEvent(new CustomEvent('engineChanged', {
  detail: { engineType: 'PLAITS', previousEngine: 'SUB' }
}));

document.dispatchEvent(new CustomEvent('plaitsEngineChanged', {
  detail: { engine: 8, name: 'Swarm' }
}));

document.dispatchEvent(new CustomEvent('ringsModelChanged', {
  detail: { model: 2, name: 'String' }
}));

// Shared/generic events
document.dispatchEvent(new CustomEvent('themeChanged', {
  detail: { type: 'hue', hue: 180 }
}));

document.dispatchEvent(new CustomEvent('rowWidthChanged', {
  detail: { width: 1200 }
}));

document.dispatchEvent(new CustomEvent('modulesRerendered'));
```

#### ❌ Incorrect

```javascript
// Missing namespace — which app's parameter changed?
document.dispatchEvent(new CustomEvent('parameterChange', {...}));

// Unclear ownership
document.dispatchEvent(new CustomEvent('stepadvanced', {...})); // lowercase
document.dispatchEvent(new CustomEvent('PPModDrag', {...}));    // no namespace
```

### Event Listening

Namespace prefixes make it clear which app's events you're subscribing to:

```javascript
// Bæng listener
document.addEventListener('baengParameterChange', (e) => {
  const { paramId, value } = e.detail;
  updateAudioParameter(paramId, value);
});

// Ræmbl listener
document.addEventListener('plaitsEngineChanged', (e) => {
  const { engine, name } = e.detail;
  updateEngineDisplay(engine, name);
});

// Shared listener (theme changes affect both apps)
document.addEventListener('themeChanged', (e) => {
  const { type } = e.detail;
  redrawCanvasElements();
});
```

---

## State Namespaces

JavaScript state is organised into three top-level namespaces:

| Namespace | Purpose | Defined In |
|-----------|---------|------------|
| `baengState` | Bæng-specific parameters (voices, sequences, engines) | `js/baeng/state.js` |
| `raemblState` | Ræmbl-specific parameters (oscillators, filters, envelopes) | `js/raembl/state.js` |
| `sharedState` | Timing parameters (BPM, swing, bar length, play state) | `js/state.js` |

### State Access Examples

```javascript
// Bæng state access
const voiceEngine = baengState.voices[0].engine;
const reverbSize = baengState.reverb.size;
const cloudsMode = baengState.clouds.mode;

// Ræmbl state access
const filterCutoff = raemblState.filter.cutoff;
const engineType = raemblState.engineType; // 'SUB', 'PLAITS', 'RINGS'
const plaitsEngine = raemblState.plaits.engine;

// Shared state access
const bpm = sharedState.bpm;
const swing = sharedState.swing;
const isPlaying = sharedState.isPlaying;
const baengBarLength = sharedState.baengBarLength;
const raemblBarLength = sharedState.raemblBarLength;
```

### State Updates

State objects are typically implemented as Proxies to trigger reactivity:

```javascript
// Updating Bæng state
baengState.voices[0].engine = 'DX7';
baengState.reverb.size = 0.8;

// Updating Ræmbl state
raemblState.filter.cutoff = 2000;
raemblState.engineType = 'PLAITS';

// Updating shared state (affects both apps)
sharedState.bpm = 140;
sharedState.isPlaying = true;
```

### Helper Functions

For complex lookups, use helper functions that understand namespace conventions:

```javascript
/**
 * Get parameter value from namespaced state
 * @param {string} paramId - Full parameter ID (e.g. 'baeng-reverb-size')
 * @param {string} [property] - Optional nested property
 * @returns {*} Parameter value
 */
function getParamValue(paramId, property) {
  // Pseudo-code example
  if (paramId.startsWith('baeng-')) {
    return baengState[extractPath(paramId)];
  } else if (paramId.startsWith('raembl-')) {
    return raemblState[extractPath(paramId)];
  } else if (paramId.startsWith('shared-')) {
    return sharedState[extractPath(paramId)];
  }
}

/**
 * Update parameter by ID (triggers state + audio + visualization updates)
 * @param {string} paramId - Full parameter ID
 * @param {*} value - New value
 */
function updateParameterById(paramId, value) {
  // Update state
  const namespace = paramId.split('-')[0];
  const state = getStateForNamespace(namespace);
  state[extractPath(paramId)] = value;

  // Trigger audio updates
  updateAudioParameter(paramId, value);

  // Trigger visualization updates
  document.dispatchEvent(new CustomEvent(`${namespace}ParameterChange`, {
    detail: { paramId, value }
  }));
}
```

---

## Console Messages

Console logging uses **namespace prefixes in square brackets** for easy filtering and debugging.

### Pattern

```
console.log('[Namespace] Message');
console.warn('[Namespace] Warning message');
console.error('[Namespace] Error message');
```

### Examples

#### ✅ Correct

```javascript
// Bæng messages
console.log('[Bæng] Setup 12 LED Ring Knobs');
console.log('[Bæng Clouds] Buffer visualisation started');
console.warn('[Bæng Clouds] STABILITY WARNING: High feedback + reverb may cause oscillation');
console.error('[Bæng] Failed to create drum bus node:', error);

// Ræmbl messages
console.log('[Ræmbl] Plaits engine initialised with 24 engines');
console.log('[Ræmbl] Rings engine initialised with 6 resonator models');
console.warn('[Ræmbl] Plaits engine failed to initialise:', error);

// Shared messages
console.log('[Shared Clock] BPM changed: 140');
console.error('[Shared Audio] Failed to initialise AudioContext');
```

#### ❌ Incorrect

```javascript
// No namespace — hard to trace source
console.log('Engine initialised');
console.warn('Parameter out of range');

// Inconsistent format
console.log('Bæng: Setup complete'); // not [bracketed]
console.log('[baeng] loaded');       // lowercase namespace
```

### Console Filtering

Chrome DevTools supports regex filtering. Use these patterns:

- `^\[Bæng\]` — Show only Bæng messages
- `^\[Ræmbl\]` — Show only Ræmbl messages
- `^\[Shared` — Show only shared messages
- `^\[(Bæng|Ræmbl)\]` — Show both apps, hide shared
- `Clouds` — Show all Clouds-related messages regardless of namespace

---

## Quick Reference Table

| Layer | Bæng | Ræmbl | Shared |
|-------|------|-------|--------|
| **DOM IDs** | `baeng-*` | `raembl-*` | `shared-*` |
| **CSS Classes** | `.baeng-app .class` | `.raembl-app .class` | No scoping (in `shared-base.css`) |
| **Events** | `baeng{Event}` | `raembl{Event}` or generic | Generic (e.g. `themeChanged`) |
| **State** | `baengState.*` | `raemblState.*` | `sharedState.*` |
| **Console** | `[Bæng]` or `[Bæng Module]` | `[Ræmbl]` or `[Ræmbl Module]` | `[Shared]` or `[Shared Module]` |

---

## Common Pitfalls

### ❌ Forgetting Namespace Prefix

```javascript
// Bad: Generic ID
<div id="reverb-module"></div>

// Good: Namespaced ID
<div id="baeng-reverb"></div>
<div id="raembl-reverb"></div>
```

### ❌ Using Global Selectors Instead of Scoped

```css
/* Bad: Affects both apps unpredictably */
.module {
  background: red;
}

/* Good: Scoped to specific app */
.baeng-app .module {
  background: red;
}
```

### ❌ Dispatching Events Without Namespace

```javascript
// Bad: Ambiguous source
document.dispatchEvent(new CustomEvent('parameterChange', {...}));

// Good: Clear ownership
document.dispatchEvent(new CustomEvent('baengParameterChange', {...}));
```

### ❌ Accessing Wrong State Namespace

```javascript
// Bad: Mixing namespaces
const bpm = baengState.bpm; // BPM is shared, not Bæng-specific

// Good: Use correct namespace
const bpm = sharedState.bpm;
```

---

## See Also

- [Architecture Overview](architecture.md) — System architecture and component interaction
- [Contributing Guide](contributing.md) — Development workflow and code standards
- [Critical Footguns](footguns.md) — Common mistakes and how to avoid them

---

**File:** `merged-app/docs/developer/namespacing.md`
**Last Updated:** 2025-12-30
