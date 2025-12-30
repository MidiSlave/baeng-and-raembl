# Contributing to Bæng & Ræmbl

Welcome! This guide covers everything you need to contribute to Bæng & Ræmbl, from initial setup to deploying your changes to production.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Branch Workflow](#branch-workflow)
4. [Code Style & Conventions](#code-style--conventions)
5. [Making Changes](#making-changes)
6. [Pull Requests](#pull-requests)
7. [Testing Approach](#testing-approach)
8. [Documentation Updates](#documentation-updates)
9. [Deployment Workflow](#deployment-workflow)

---

## Getting Started

### Prerequisites

- **Modern browser** with Web Audio API and AudioWorklet support
  - Chrome 91+ (recommended)
  - Edge 91+
  - Safari 14.1+
  - Firefox 89+ (limited testing)
- **Git** for version control
- **Text editor** with ES6 module support (VS Code, Sublime, Vim, etc.)
- **Static file server** (Python, Node.js, or PHP built-ins work fine)
- **GitHub CLI** (optional, for PR management)

### Initial Setup

1. **Fork the repository** (if you're an external contributor)
   ```bash
   # Visit https://github.com/MidiSlave/baeng-and-raembl
   # Click "Fork" button
   ```

2. **Clone the repository**
   ```bash
   git clone https://github.com/MidiSlave/baeng-and-raembl.git
   cd baeng-and-raembl
   ```

3. **Verify git author configuration**
   ```bash
   # Check current config
   git config user.name
   git config user.email

   # Should show MidiSlave credentials
   # If wrong, set correct author:
   git config user.name "MidiSlave"
   git config user.email "your-email@example.com"
   ```

4. **Verify GitHub CLI authentication** (if using `gh` commands)
   ```bash
   gh auth status
   # Should show "Active account: true" for MidiSlave

   # If wrong account is active:
   gh auth switch -u MidiSlave
   ```

---

## Development Setup

### No Build Step Required

Bæng & Ræmbl uses **native ES modules** loaded directly in the browser—no bundlers, transpilers, or build tools required.

**Advantages:**
- Instant reloads during development
- No webpack/rollup/vite configuration
- Simpler debugging (no source maps needed)

**Trade-offs:**
- More HTTP requests (mitigated by HTTP/2)
- No tree-shaking or minification
- Requires modern browser with ES module support

### Local Development Server

Start a static file server in the project root:

```bash
# Python 3
python3 -m http.server 8000

# Node.js (http-server)
npx http-server -p 8000

# PHP
php -S localhost:8000
```

Navigate to: `http://localhost:8000/merged-app/index.html`

### Browser DevTools Configuration

1. Open DevTools (F12 or Cmd+Option+I)
2. **Network tab** → Enable "Disable cache" checkbox
3. **Console tab** → Enable "Preserve log" for debugging across page loads

### AudioWorklet Cache Busting

During development, browsers aggressively cache AudioWorklet modules. To ensure your changes load:

```javascript
// Development: Add timestamp query parameter
await audioContext.audioWorklet.addModule(
    `js/audio/worklets/raembl-voice-processor.js?v=${Date.now()}`
);

// Production: Use version-based cache busting
await audioContext.audioWorklet.addModule(
    `js/audio/worklets/raembl-voice-processor.js?v=${APP_VERSION}`
);
```

**Additional debugging**: Hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)

---

## Branch Workflow

### Branch Strategy

We use a **two-branch workflow**:

- **`main`** — Production branch (auto-deploys to GitHub Pages)
- **`dev`** — Development branch (all work happens here)

**Golden Rule**: NEVER commit directly to `main`. All changes go through `dev` → `main` merge.

### Daily Development Workflow

```bash
# 1. Ensure you're on dev branch
git checkout dev

# 2. Pull latest changes
git pull origin dev

# 3. Make your changes
# ... edit files ...

# 4. Stage changes
git add .

# 5. Commit with descriptive message
git commit -m "Add Rings resonator modal selector"

# 6. Push to remote dev branch
git push origin dev
```

### Feature Branch Workflow (Optional)

For larger features or experimental work, create a feature branch:

```bash
# Create feature branch from dev
git checkout dev
git pull origin dev
git checkout -b feature/plaits-integration

# Work on feature
# ... make changes, commit frequently ...

# When ready, merge back to dev
git checkout dev
git merge feature/plaits-integration
git push origin dev

# Delete feature branch
git branch -d feature/plaits-integration
```

---

## Code Style & Conventions

### Namespacing Rules

See [Namespacing Conventions](./namespacing.md) for detailed patterns. Quick reference:

#### DOM Element IDs

Prefix with app namespace to prevent conflicts:

```html
<!-- Bæng elements -->
<div id="baeng-reverb-module">
<button id="baeng-play-button">
<input id="baeng-voice-0-level">

<!-- Ræmbl elements -->
<div id="raembl-filter-module">
<button id="raembl-play-button">
<input id="raembl-lfo-rate">

<!-- Shared elements -->
<div id="shared-time-strip">
<button id="shared-play-button">
```

#### CSS Classes

Scope app-specific styles with parent classes:

```css
/* Bæng styles */
.baeng-app .module {
    background: var(--baeng-module-bg);
}

/* Ræmbl styles */
.raembl-app .module {
    background: var(--raembl-module-bg);
}

/* Shared styles */
.time-strip {
    /* Shared styling */
}
```

#### Custom Events

Use `{namespace}{EventName}` camelCase pattern:

```javascript
// Bæng events
document.dispatchEvent(new CustomEvent('baengStepAdvanced', {
    detail: { stepIndex: 0, voiceIndex: 3 }
}));

// Ræmbl events
document.dispatchEvent(new CustomEvent('raemblNoteOn', {
    detail: { note: 60, velocity: 100 }
}));

// Shared clock events
document.dispatchEvent(new CustomEvent('clockTick', {
    detail: { stepIndex: 0, time: 0.123 }
}));
```

#### Console Logging

**ALWAYS** prefix console messages with namespace:

```javascript
// Bæng
console.log('[Bæng] Initialising audio engine');
console.warn('[Bæng/DX7] Engine module not found for voice 3');
console.error('[Bæng/Patch] Failed to load patch:', error);

// Ræmbl
console.log('[Ræmbl] Voice pool initialised (8 voices)');
console.warn('[Ræmbl/Voices] Voice stealing: stealability score low');
console.error('[Ræmbl/Plaits] Failed to connect processor:', error);

// Shared
console.log('[SharedClock] Started at BPM 120');
console.warn('[SharedClock] Subscriber callback error:', error);
```

**Why**: In a merged app with multiple synthesisers, namespace-prefixed logs are essential for debugging.

### JavaScript Conventions

- **ES6 modules**: Use `import`/`export`, not CommonJS
- **Arrow functions** for callbacks: `array.map(x => x * 2)`
- **`const`/`let`**: Never use `var`
- **Destructuring**: `const { cutoff, resonance } = state.filter;`
- **Template literals**: `` `Value: ${value}` `` not `'Value: ' + value`
- **Async/await**: Prefer over `.then()` chains

**File naming**:
- Module files: `kebab-case.js` (e.g., `per-param-mod.js`)
- Worklet processors: `*-processor.js` (e.g., `clouds-processor.js`)
- UI components: `PascalCase.js` (e.g., `MiniFader.js`)

### State Management Patterns

Use `getParamValue()` for namespace lookups:

```javascript
import { getParamValue } from './state.js';

const bpm = getParamValue('bpm');  // sharedState.timing
const resonance = getParamValue('raembl-filter', 'resonance');
```

Use `updateParameterById()` for UI-triggered changes:

```javascript
import { updateParameterById } from './ui/faderUtils.js';

// Updates state + audio + visualisation
updateParameterById('filter-cutoff', newValue);
```

---

## Making Changes

### Before You Start

1. **Check existing issues**: Search for related work or discussions
2. **Read critical footguns**: See [Critical Footguns](./footguns.md) to avoid common mistakes
3. **Review architecture docs**: Understand [system architecture](./architecture.md)

### Development Guidelines

#### 1. AudioWorklet Development

**CRITICAL**: Never integrate complex AudioWorklet processors directly into the main app. Use the isolated test harness workflow:

**Phase 1-3: Isolated Test Harness**
```html
<!-- standalone-test.html -->
<!DOCTYPE html>
<html>
<body>
    <h1>Worklet Test (Isolated)</h1>
    <button id="test">Test</button>
    <script type="module">
        const ctx = new AudioContext();
        await ctx.audioWorklet.addModule('my-processor.js');
        const node = new AudioWorkletNode(ctx, 'my-processor');
        node.connect(ctx.destination);

        // Minimal testing environment - NO main app dependencies
    </script>
</body>
</html>
```

**Phase 4-6: Validate Core Functionality**
- ✅ Oscillators generate correct waveforms
- ✅ Envelopes trigger and release properly
- ✅ No audio glitches or dropouts
- ✅ CPU usage acceptable (<5% for single voice)

**Phase 7-8: Integration**
- Create feature branch: `git checkout -b feature/worklet-integration`
- Add to main app with feature flag
- Test in production environment

**Reference**: See `/tests/plaits-test/` and `/tests/rings-test/` for examples.

**Audio Thread Golden Rule**: See [Critical Footguns](./footguns.md#audioworklet-performance-footguns) for detailed dos and don'ts.

#### 2. UI Module Development

**Always remove old modules before re-rendering**:

```javascript
// ✅ CORRECT: Remove old module, re-attach listeners
function renderModule(containerId, htmlGenerator, setupFunction) {
    const container = document.getElementById(containerId);

    // 1. Remove old content
    const oldModule = container.querySelector('.module');
    oldModule?.remove();

    // 2. Render new content
    const html = htmlGenerator();
    container.insertAdjacentHTML('beforeend', html);

    // 3. Re-attach event listeners
    if (setupFunction) {
        setupFunction();
    }
}
```

**Why**: Without cleanup, you get memory leaks, duplicate event handlers, and state desynchronisation.

#### 3. Modulation Systems

PPMod uses **k-rate updates** (30 FPS), not audio-rate:

```javascript
// ✅ CORRECT: K-rate modulation from main thread
requestAnimationFrame(() => {
    const modValue = calculateModValue(mod, audioContext.currentTime);
    audioParam.setValueAtTime(modValue, audioContext.currentTime);
});
```

**Never** add per-sample PPMod calculations to AudioWorklet processors. See [Critical Footguns](./footguns.md#modulation-system-footguns) for rationale.

#### 4. Voice Management

**Never steal releasing voices**:

```javascript
// ✅ CORRECT: Skip voices that are releasing
const voice = voicePool.find(v => !v.active && !v.releasing);

// Schedule release cleanup after envelope
voice.active = false;
voice.releasing = true;
setTimeout(() => {
    voice.releasing = false;
}, releaseTime * 1000);
```

See [Voice Management Footguns](./footguns.md#voice-management-footguns) for details.

### Git Commit Messages

Use descriptive, imperative-mood commit messages:

**Good**:
```
Add Rings resonator modal with 6 model selector
Fix voice stealing during release phase
Update PPMod LFO waveform selector UI
Refactor drum bus parameter validation
```

**Avoid**:
```
Fixed bug
Updated files
Changes
WIP
```

**Format**:
```
<type>: <short summary>

<optional detailed description>

<optional breaking changes>
```

**Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `style`, `perf`

---

## Pull Requests

### When to Create PRs

- Major features (new synthesis engines, FX processors)
- Architecture changes (state management, routing)
- Breaking changes (patch format updates)
- External contributions

**Note**: For small bug fixes or documentation updates, direct commits to `dev` are acceptable.

### PR Workflow

1. **Ensure changes are on `dev` branch**
   ```bash
   git checkout dev
   git pull origin dev
   # ... make changes, commit ...
   git push origin dev
   ```

2. **Create PR via GitHub CLI**
   ```bash
   gh pr create \
       --base main \
       --head dev \
       --title "Add Rings physical modelling resonator" \
       --body "$(cat <<'EOF'
   ## Summary
   - Integrated Mutable Instruments Rings (6 resonator models)
   - Added modal selector for resonator type
   - Implemented per-voice engine tracking
   - Added PPMod support for Rings parameters

   ## Test Plan
   - [x] Isolated test harness validates all 6 models
   - [x] Modal selector updates state correctly
   - [x] Voice allocation handles engine switching
   - [x] PPMod modulates Rings parameters smoothly
   - [x] FX sends (reverb/delay) working
   - [x] Patch save/load preserves Rings settings

   ## Breaking Changes
   None - patch format v1.2.0 maintains backward compatibility.
   EOF
   )"
   ```

3. **PR via GitHub web interface**
   - Navigate to repository
   - Click "Pull Requests" → "New Pull Request"
   - Base: `main` ← Compare: `dev`
   - Fill in title and description

### PR Requirements

**Must include**:
- ✅ Clear summary of changes (what and why)
- ✅ Test plan (how you verified it works)
- ✅ Breaking changes section (if applicable)
- ✅ Documentation updates (if adding features)

**Optional**:
- Screenshots/videos (for UI changes)
- Performance metrics (for optimisations)
- Migration guide (for breaking changes)

### PR Review Process

1. **Self-review**: Review your own diff before requesting review
2. **Request review**: Tag relevant team members
3. **Address feedback**: Respond to comments, make requested changes
4. **Approval**: At least one approval required before merge
5. **Merge to main**: See [Deployment Workflow](#deployment-workflow)

---

## Testing Approach

### Manual Testing

**No automated test suite currently**. Verify changes manually:

#### Audio Functionality
- [ ] Synthesis engines produce correct output
- [ ] Envelopes trigger and release properly
- [ ] Filters respond to parameter changes
- [ ] No audio glitches, dropouts, or distortion
- [ ] CPU usage reasonable (<10% for typical usage)

#### UI Functionality
- [ ] Controls update parameters correctly
- [ ] Visual feedback (LEDs, meters) accurate
- [ ] Modal dialogs open/close properly
- [ ] No console errors or warnings

#### State Management
- [ ] Patch save/load preserves all settings
- [ ] Undo/redo works correctly
- [ ] Parameter changes sync across UI/audio/visualisation
- [ ] Shared timing stays synchronised

#### Cross-Browser Testing
- [ ] Chrome/Edge (primary)
- [ ] Safari (macOS/iOS)
- [ ] Firefox (secondary)

### Test Harness Development

For complex features (AudioWorklet processors, new FX engines), create isolated test harnesses:

**Directory**: `/tests/[feature-name]-test/`

**Structure**:
```
tests/my-feature-test/
├── index.html          # Standalone test page
├── my-processor.js     # AudioWorklet processor
├── README.md           # Test plan and validation steps
└── build-processor.sh  # Optional build script
```

**Examples**: See `/tests/plaits-test/` and `/tests/rings-test/`

---

## Documentation Updates

### When to Update Docs

**Always update docs for**:
- New features (synthesis engines, FX, modulation modes)
- Architecture changes (state management, routing)
- Breaking changes (patch format, API changes)
- Workflow changes (deployment, development setup)

**Optional for**:
- Bug fixes (unless it reveals a critical footgun)
- Refactoring (unless it changes external APIs)
- Code cleanup

### Documentation Structure

```
merged-app/docs/
├── developer/           # Developer documentation
│   ├── architecture.md  # System architecture
│   ├── contributing.md  # This file
│   ├── footguns.md      # Critical mistakes to avoid
│   └── namespacing.md   # Naming conventions
├── user-guide/          # End-user documentation
├── engines/             # Synthesis engine docs
├── effects/             # FX documentation
├── modulation/          # Modulation system docs
└── reference/           # Parameter references
```

### Documentation Standards

- **UK/AUS English spelling**: colour (not color), emphasise (not emphasize)
- **GitHub-flavoured Markdown**: Use fenced code blocks, tables, task lists
- **Cross-linking**: Link to related docs (`[Architecture](./architecture.md)`)
- **Code examples**: Include working examples, not pseudocode
- **Update date**: Add `Last Updated: YYYY-MM-DD` footer

### Critical Documentation: CLAUDE.md

`/CLAUDE.md` is the **source of truth** for project status, architecture decisions, and implementation plans.

**Update when**:
- Completing major features (move to "What's Working")
- Discovering new footguns (add to "Critical Footguns")
- Changing architecture (update "Technical Approach")
- Updating patch format (increment version)

**Format**:
```markdown
## Current Status

**Last Updated**: YYYY-MM-DD

### What's Working
- ✓ Feature name (brief description)

### Known Issues
- Issue description (under investigation)
```

---

## Deployment Workflow

### Overview

Changes are deployed to **GitHub Pages** when merged to `main`:

```
dev → main (merge) → GitHub Actions → GitHub Pages
```

**Live Site**: https://midislave.github.io/baeng-and-raembl/

### GitHub Actions Workflow

Defined in `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: 'merged-app'  # Deploys merged-app/ folder
      - uses: actions/deploy-pages@v4
```

**Trigger**: Any push to `main` branch automatically deploys to GitHub Pages.

### Pre-Deployment Checklist

Before merging `dev` → `main`:

1. **Test thoroughly on dev branch**
   - [ ] No console errors or warnings
   - [ ] Audio functionality working (all engines)
   - [ ] UI responsive and functional
   - [ ] Patch save/load working
   - [ ] Cross-browser testing complete

2. **Verify git author**
   ```bash
   git config user.name   # Should be MidiSlave
   git config user.email  # Should be MidiSlave email
   ```

3. **Update documentation**
   - [ ] CLAUDE.md reflects current status
   - [ ] User-facing docs updated (if feature added)
   - [ ] CHANGELOG updated (if maintained)

4. **Remove development artefacts**
   - [ ] No `console.log()` debugging statements
   - [ ] No commented-out code blocks
   - [ ] No `debugger` statements
   - [ ] Cache-bust parameters removed (or version-based)

### Deployment Process

```bash
# 1. Ensure dev is up to date
git checkout dev
git pull origin dev

# 2. Switch to main branch
git checkout main

# 3. Merge dev into main
git merge dev

# 4. Push to trigger deployment
git push origin main

# 5. Switch back to dev for continued work
git checkout dev
```

### Deployment Verification

1. **Check GitHub Actions status**
   - Navigate to repository → "Actions" tab
   - Verify deployment workflow succeeded (green checkmark)

2. **Test live site**
   - Visit https://midislave.github.io/baeng-and-raembl/
   - Verify changes deployed correctly
   - Test core functionality (audio, UI, patches)

3. **Rollback if needed**
   ```bash
   # Revert to previous commit
   git checkout main
   git revert HEAD
   git push origin main
   ```

### Manual Deployment Trigger

You can manually trigger deployment via GitHub Actions:

1. Navigate to repository → "Actions" tab
2. Select "Deploy to GitHub Pages" workflow
3. Click "Run workflow" → Select `main` branch → "Run workflow"

---

## Additional Resources

### Essential Reading

- **[Architecture Overview](./architecture.md)** — System design, state management, audio routing
- **[Critical Footguns](./footguns.md)** — Common mistakes and how to avoid them
- **[Namespacing Conventions](./namespacing.md)** — DOM IDs, CSS classes, event names
- **[CLAUDE.md](/CLAUDE.md)** — Project status and implementation notes

### External Resources

- **[Web Audio API Spec](https://www.w3.org/TR/webaudio/)** — Authoritative reference
- **[AudioWorklet Best Practices](https://developer.chrome.com/blog/audio-worklet/)** — Chrome's official guide
- **[GitHub Flow](https://guides.github.com/introduction/flow/)** — Branching workflow

### Getting Help

- **Issues**: Search existing issues or open a new one
- **Discussions**: Use GitHub Discussions for questions
- **Docs**: Check `/docs/` for detailed guides

---

## Code of Conduct

### General Principles

- **Be respectful**: Treat all contributors with respect
- **Be constructive**: Provide helpful feedback, not just criticism
- **Be collaborative**: Share knowledge, help others learn
- **Be patient**: Remember we're all learning

### Review Etiquette

**When reviewing PRs**:
- Focus on code quality, not coding style preferences
- Provide actionable feedback with examples
- Acknowledge good work ("Nice refactor!")
- Ask questions rather than make demands

**When receiving feedback**:
- Assume good intent
- Ask for clarification if unclear
- Thank reviewers for their time
- Address feedback promptly

---

## Licence

This project is licenced under **[LICENCE TYPE]** — see the `LICENCE` file for details.

---

**Happy contributing!**

If you have questions or suggestions for improving this guide, please open an issue or submit a PR.

---

**Document Version**: 1.0.0
**Last Updated**: 2025-12-30
**Maintained By**: Development team
