/**
 * Engine Selector Module
 *
 * Provides dropdown-style engine switching in the oscillator module header
 * similar to Bæng's engine module. Available engines:
 * - SUB (Subtractive - default)
 * - PLT (Plaits - 24 engines)
 * - RNG (Rings - future)
 *
 * @module engine-selector
 */

import { state } from '../state.js';
import { switchEngine, setPlaitsEngine, getPlaitsEngineInfo, setRingsModel, getRingsModelInfo, setRingsPolyphony } from '../audio.js';
import { PLAITS_ENGINES, PLAITS_BANKS } from '../audio/plaits-voice-pool.js';
import { RINGS_MODELS } from '../audio/rings-voice-pool.js';
import { SpacerPatternManager, ALL_SOURCES } from '../../shared/circuit-pattern.js';

let currentBank = 'GREEN';

// Spacer pattern managers for Plaits mode
let plaitsSpacerPatterns = [];

// Source types for each spacer (ensures unique animations)
const PLAITS_SPACER_SOURCES = ['radial', 'diamond', 'corner-tl'];

// Engine display names and order
const ENGINE_OPTIONS = [
  { id: 'subtractive', name: 'SUBTRACTIVE', description: 'Classic subtractive synthesiser' },
  { id: 'plaits', name: 'PLAITS', description: '24-engine macro oscillator' },
  { id: 'rings', name: 'RINGS', description: 'Physical modelling resonator' }
];

/**
 * Generate the engine dropdown HTML (replaces module header content)
 */
function generateEngineDropdownHTML(currentEngine) {
  const current = ENGINE_OPTIONS.find(e => e.id === currentEngine) || ENGINE_OPTIONS[0];

  let html = `
    <div class="raembl-engine-dropdown-container">
      <button
        class="raembl-engine-dropdown-button"
        aria-haspopup="listbox"
        aria-expanded="false"
        aria-label="Select synth engine"
        title="${current.description}"
      >
        <span class="dropdown-selected-text">${current.name}</span>
        <svg class="dropdown-arrow" viewBox="0 0 12 8">
          <path d="M1 1 L6 6 L11 1" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>

      <div class="raembl-engine-dropdown-menu hidden" role="listbox" aria-label="Synth engines">
  `;

  ENGINE_OPTIONS.forEach(engine => {
    const isSelected = engine.id === currentEngine;
    html += `
      <button
        class="dropdown-option ${isSelected ? 'selected' : ''}"
        role="option"
        aria-selected="${isSelected}"
        data-engine="${engine.id}"
        title="${engine.description}"
      >
        <span class="option-name">${engine.name}</span>
      </button>
    `;
  });

  html += `
      </div>
    </div>
  `;

  return html;
}

/**
 * Update the MODEL display to show current engine name
 */
function updateModelDisplay(engineIndex) {
  const modelValue = document.getElementById('plaits-model-value');
  const modelName = document.getElementById('plaits-model-name');

  if (modelValue) {
    // Display 1-24 to user (internal is 0-23)
    modelValue.textContent = engineIndex + 1;
  }
  if (modelName) {
    const engine = PLAITS_ENGINES[engineIndex];
    if (engine) {
      modelName.textContent = engine.name;
      // Add status indicator
      if (engine.status === 'experimental') {
        modelName.textContent += ' [!]';
      } else if (engine.status === 'partial') {
        modelName.textContent += ' [~]';
      }
    }
  }
}

/**
 * Create a spacer module with circuit pattern animation
 */
function createSpacerModule(id, canvasId) {
  const spacer = document.createElement('div');
  spacer.id = id;
  spacer.className = 'module spacer-panel plaits-spacer';

  const canvas = document.createElement('canvas');
  canvas.id = canvasId;
  spacer.appendChild(canvas);

  return spacer;
}

/**
 * Remove all Plaits spacers and cleanup their animations
 */
function removePlaitsSpacers() {
  // Cleanup pattern managers
  plaitsSpacerPatterns.forEach(pattern => {
    if (pattern) pattern.destroy();
  });
  plaitsSpacerPatterns = [];

  // Remove spacer elements
  document.querySelectorAll('.plaits-spacer').forEach(el => el.remove());
}

/**
 * Create and insert Plaits spacers
 */
async function createPlaitsSpacers() {
  const bottomRow = document.querySelector('.raembl-app .bottom-row');
  const oscModule = document.getElementById('raembl-oscillator');
  const mixerModule = document.getElementById('raembl-mixer');
  const outputModule = document.getElementById('raembl-output');

  if (!bottomRow || !oscModule || !mixerModule || !outputModule) return;

  // Create spacer 1: Before PLAITS (where MOD was)
  const spacer1 = createSpacerModule('raembl-plaits-spacer-1', 'raembl-plaits-spacer-canvas-1');
  oscModule.insertAdjacentElement('beforebegin', spacer1);

  // Create spacer 2: After PLAITS, before MIX
  const spacer2 = createSpacerModule('raembl-plaits-spacer-2', 'raembl-plaits-spacer-canvas-2');
  mixerModule.insertAdjacentElement('beforebegin', spacer2);

  // Create spacer 3: After MIX, before OUT (where FILTER and ENVELOPE were)
  const spacer3 = createSpacerModule('raembl-plaits-spacer-3', 'raembl-plaits-spacer-canvas-3');
  outputModule.insertAdjacentElement('beforebegin', spacer3);

  // Initialise circuit patterns for all spacers with unique sources
  const spacerConfigs = [
    { canvasId: 'raembl-plaits-spacer-canvas-1', sourceType: PLAITS_SPACER_SOURCES[0] },
    { canvasId: 'raembl-plaits-spacer-canvas-2', sourceType: PLAITS_SPACER_SOURCES[1] },
    { canvasId: 'raembl-plaits-spacer-canvas-3', sourceType: PLAITS_SPACER_SOURCES[2] }
  ];

  for (const config of spacerConfigs) {
    const pattern = new SpacerPatternManager(config.canvasId, { sourceType: config.sourceType });
    await pattern.init();
    pattern.startAnimation();
    plaitsSpacerPatterns.push(pattern);
  }
}

/**
 * Show/hide engine-specific components, swap parameter faders, and hide/show modules
 * @param {string} engineType - 'subtractive', 'plaits', or 'rings'
 */
function updateEngineVisibility(engineType) {
  const oscModule = document.getElementById('raembl-oscillator');
  const isPlaits = engineType === 'plaits';
  const isRings = engineType === 'rings';
  const isSubtractive = engineType === 'subtractive';

  // Swap parameter faders in oscillator module
  if (oscModule) {
    // These subtractive params should be hidden in Plaits/Rings mode
    const subtractiveOnlyParams = ['osc.subOct', 'osc.glide', 'osc.pulseWidth', 'osc.pwmAmount', 'osc.pitchMod'];
    subtractiveOnlyParams.forEach(paramId => {
      const el = oscModule.querySelector(`.slide-pot-container[data-param-id="${paramId}"]`);
      if (el) el.style.display = isSubtractive ? '' : 'none';
    });

    // These params are shared (OCT, DRIFT) - always visible
    // osc.oct and osc.drift stay visible

    // Hide/show Plaits params (including MODEL)
    const plaitsParams = oscModule.querySelectorAll('.slide-pot-container[data-param-id^="plaits."]');
    plaitsParams.forEach(el => {
      el.style.display = isPlaits ? '' : 'none';
    });

    // Hide/show Rings params
    const ringsParams = oscModule.querySelectorAll('.slide-pot-container[data-param-id^="rings."]');
    ringsParams.forEach(el => {
      el.style.display = isRings ? '' : 'none';
    });

    // Toggle mode-toggle (MONO/POLY) visibility - hide when Rings is active
    const modeToggle = oscModule.querySelector('.mode-toggle');
    if (modeToggle) {
      modeToggle.style.display = isRings ? 'none' : '';
    }

    // Show/hide Rings header controls (model dropdown + polyphony toggle)
    const ringsHeaderControls = oscModule.querySelector('.rings-header-controls');
    if (ringsHeaderControls) {
      ringsHeaderControls.style.display = isRings ? 'flex' : 'none';
    }
  }

  // Hide/show modules that don't apply to Plaits/Rings
  // Both have their own internal sound generation - no need for FILTER, ENVELOPE
  // MOD LFO also not used since they have internal modulation
  // MIXER: visible for Subtractive/Plaits, hidden for Rings
  const modulesToHide = ['raembl-mod', 'raembl-filter', 'raembl-envelope'];
  const modulesToHideForRings = ['raembl-mixer'];

  modulesToHide.forEach(moduleId => {
    const module = document.getElementById(moduleId);
    if (module) {
      module.style.display = isSubtractive ? '' : 'none';
    }
  });

  // Hide mixer module only for Rings (Plaits still uses it for OUT/AUX mix)
  modulesToHideForRings.forEach(moduleId => {
    const module = document.getElementById(moduleId);
    if (module) {
      module.style.display = isRings ? 'none' : '';
    }
  });

  // Handle spacers for non-subtractive engines
  if (isPlaits || isRings) {
    // Remove existing spacers first (in case of re-init)
    removePlaitsSpacers();
    // Create new spacers
    createPlaitsSpacers();
  } else {
    // Remove spacers when switching to subtractive
    removePlaitsSpacers();
  }

  // Update MIXER module for different engines
  const mixerModule = document.getElementById('raembl-mixer');
  if (mixerModule) {
    const mixerHeader = mixerModule.querySelector('.module-header');
    if (mixerHeader) {
      // Store original text if not already stored
      if (!mixerHeader.dataset.originalText) {
        mixerHeader.dataset.originalText = mixerHeader.textContent;
      }
      mixerHeader.textContent = isSubtractive ? mixerHeader.dataset.originalText : 'MIX';
    }

    // Handle fader section based on engine
    const faderSection = mixerModule.querySelector('.fader-section');
    if (faderSection) {
      // Hide all existing subtractive faders in non-subtractive mode
      const existingFaders = faderSection.querySelectorAll('.slide-pot-container:not([data-param-id^="plaits.mix"]):not([data-param-id^="rings.mix"])');
      existingFaders.forEach(el => {
        el.style.display = isSubtractive ? '' : 'none';
      });

      // Show/create Plaits mix faders if in Plaits mode
      let plaitsMixFaders = faderSection.querySelectorAll('.slide-pot-container[data-param-id^="plaits.mix"]');
      if (plaitsMixFaders.length === 0 && isPlaits) {
        // Create the OUT/AUX mix control
        const mixHTML = `
          <div class="slide-pot-container" data-param-id="plaits.mixOutAux" data-info-id="raembl-plaits-mix">
            <div class="slide-pot-label" data-param-label="MIX" title="OUT/AUX Mix - Crossfade between main and auxiliary outputs">
              <span style="font-size: 9px; font-weight: bold;">MIX</span>
            </div>
            <div class="slide-pot-body">
              <div class="slide-pot-slot"></div>
              <div class="slide-pot-knob" data-led-mode="value">
                <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
              </div>
            </div>
            <div class="slide-pot-value">0%</div>
          </div>
        `;
        faderSection.insertAdjacentHTML('beforeend', mixHTML);
        document.dispatchEvent(new CustomEvent('plaitsParamsAdded'));
      }

      plaitsMixFaders = faderSection.querySelectorAll('.slide-pot-container[data-param-id^="plaits.mix"]');
      plaitsMixFaders.forEach(el => {
        el.style.display = isPlaits ? '' : 'none';
      });

      // Show/create Rings mix faders if in Rings mode
      let ringsMixFaders = faderSection.querySelectorAll('.slide-pot-container[data-param-id^="rings.mix"]');
      if (ringsMixFaders.length === 0 && isRings) {
        // Create the Rings mix control (strum intensity)
        const mixHTML = `
          <div class="slide-pot-container" data-param-id="rings.mixStrum" data-info-id="raembl-rings-strum">
            <div class="slide-pot-label" data-param-label="STRM" title="Strum - Internal excitation intensity">
              <span style="font-size: 9px; font-weight: bold;">STRM</span>
            </div>
            <div class="slide-pot-body">
              <div class="slide-pot-slot"></div>
              <div class="slide-pot-knob" data-led-mode="value">
                <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
              </div>
            </div>
            <div class="slide-pot-value">50%</div>
          </div>
        `;
        faderSection.insertAdjacentHTML('beforeend', mixHTML);
        document.dispatchEvent(new CustomEvent('ringsParamsAdded'));
      }

      ringsMixFaders = faderSection.querySelectorAll('.slide-pot-container[data-param-id^="rings.mix"]');
      ringsMixFaders.forEach(el => {
        el.style.display = isRings ? '' : 'none';
      });
    }
  }
}

/**
 * Update the Rings MODEL display to show current model name
 */
function updateRingsModelDisplay(modelIndex) {
  const modelNames = ['Modal', 'Sympath', 'String', 'FM', 'SympQ', 'Str+Vrb'];
  const modelBtn = document.getElementById('rings-model-btn');
  if (modelBtn) {
    modelBtn.textContent = modelNames[modelIndex] || modelNames[0];
  }
}

/**
 * Update the Rings polyphony display to show current state
 */
function updateRingsPolyDisplay(polyCount) {
  const polyLabels = { 1: 'M', 2: 'P2', 4: 'P4' };
  const polyBtn = document.getElementById('rings-poly-btn');
  if (polyBtn) {
    polyBtn.textContent = polyLabels[polyCount] || 'P4';
  }
}

/**
 * Setup event handlers for Rings controls (cycling buttons for model + polyphony)
 */
function setupRingsControlHandlers() {
  const modelNames = ['Modal', 'Sympath', 'String', 'FM', 'SympQ', 'Str+Vrb'];
  const polyCycle = [1, 2, 4]; // M → P2 → P4 → M...
  const polyLabels = { 1: 'M', 2: 'P2', 4: 'P4' };

  // Model cycling button
  const modelBtn = document.getElementById('rings-model-btn');
  if (modelBtn) {
    modelBtn.addEventListener('click', () => {
      // Cycle to next model (0-5)
      const currentModel = state.ringsModel || 0;
      const nextModel = (currentModel + 1) % 6;

      state.ringsModel = nextModel;
      setRingsModel(nextModel);
      modelBtn.textContent = modelNames[nextModel];

      console.log('[EngineSelector] Rings model:', nextModel, RINGS_MODELS[nextModel]?.name);
    });

    // Set initial text from state
    modelBtn.textContent = modelNames[state.ringsModel || 0];
  }

  // Polyphony cycling button
  const polyBtn = document.getElementById('rings-poly-btn');
  if (polyBtn) {
    polyBtn.addEventListener('click', () => {
      // Cycle: M → P2 → P4 → M...
      const currentPoly = state.ringsPolyphony || 4;
      const currentIndex = polyCycle.indexOf(currentPoly);
      const nextIndex = (currentIndex + 1) % polyCycle.length;
      const nextPoly = polyCycle[nextIndex];

      state.ringsPolyphony = nextPoly;
      setRingsPolyphony(nextPoly);
      polyBtn.textContent = polyLabels[nextPoly];

      console.log('[EngineSelector] Rings polyphony:', nextPoly);
    });

    // Set initial text from state
    const initialPoly = state.ringsPolyphony || 4;
    polyBtn.textContent = polyLabels[initialPoly];
  }
}

/**
 * Inject Rings header controls (model selector + polyphony cycle button) into the oscillator header
 */
function injectRingsHeaderControls(oscModule) {
  // Check if already injected
  if (oscModule.querySelector('.rings-header-controls')) return;

  const headerContainer = oscModule.querySelector('.module-header-container');
  if (!headerContainer) return;

  // Model names for display
  const modelNames = ['Modal', 'Sympath', 'String', 'FM', 'SympQ', 'Str+Vrb'];
  const initialModel = state.ringsModel || 0;
  const initialPoly = state.ringsPolyphony || 4;
  const polyLabels = { 1: 'M', 2: 'P2', 4: 'P4' };

  // Create Rings header controls container
  const ringsHeaderHTML = `
    <div class="rings-header-controls" style="display: none;">
      <button id="rings-model-btn" class="rings-header-btn" title="Click to cycle resonator model">
        ${modelNames[initialModel]}
      </button>
      <button id="rings-poly-btn" class="rings-header-btn" title="Click to cycle polyphony (M/P2/P4)">
        ${polyLabels[initialPoly]}
      </button>
    </div>
  `;

  // Insert after the mode-toggle (which will be hidden in Rings mode)
  const modeToggle = headerContainer.querySelector('.mode-toggle');
  if (modeToggle) {
    modeToggle.insertAdjacentHTML('afterend', ringsHeaderHTML);
  } else {
    headerContainer.insertAdjacentHTML('beforeend', ringsHeaderHTML);
  }
}

/**
 * Setup dropdown event handlers
 */
function setupDropdownHandlers(oscModule) {
  const dropdownButton = oscModule.querySelector('.raembl-engine-dropdown-button');
  const dropdownMenu = oscModule.querySelector('.raembl-engine-dropdown-menu');

  if (!dropdownButton || !dropdownMenu) return;

  // Toggle dropdown on button click
  dropdownButton.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdownMenu.classList.contains('hidden');

    if (isOpen) {
      dropdownMenu.classList.add('hidden');
      dropdownButton.setAttribute('aria-expanded', 'false');
    } else {
      dropdownMenu.classList.remove('hidden');
      dropdownButton.setAttribute('aria-expanded', 'true');
    }
  });

  // Handle option selection
  dropdownMenu.querySelectorAll('.dropdown-option').forEach(option => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const engineId = option.dataset.engine;

      console.log('[EngineSelector] Selected engine:', engineId);

      // Update selected state
      dropdownMenu.querySelectorAll('.dropdown-option').forEach(o => {
        o.classList.remove('selected');
        o.setAttribute('aria-selected', 'false');
      });
      option.classList.add('selected');
      option.setAttribute('aria-selected', 'true');

      // Update button text
      const engineOption = ENGINE_OPTIONS.find(e => e.id === engineId);
      dropdownButton.querySelector('.dropdown-selected-text').textContent = engineOption.name;
      dropdownButton.title = engineOption.description;

      // Close dropdown
      dropdownMenu.classList.add('hidden');
      dropdownButton.setAttribute('aria-expanded', 'false');

      // Switch engine
      switchEngine(engineId);

      // Update visibility
      updateEngineVisibility(engineId);
    });
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!oscModule.contains(e.target)) {
      dropdownMenu.classList.add('hidden');
      dropdownButton.setAttribute('aria-expanded', 'false');
    }
  });
}

/**
 * Inject engine selector into oscillator module header
 */
export function injectEngineSelector() {
  const oscModule = document.getElementById('raembl-oscillator');
  if (!oscModule) {
    console.warn('[EngineSelector] Oscillator module not found');
    return;
  }

  // Prevent double injection
  if (oscModule.querySelector('.raembl-engine-dropdown-container')) {
    console.log('[EngineSelector] Already injected, skipping');
    return;
  }

  const moduleHeader = oscModule.querySelector('.module-header');
  if (!moduleHeader) {
    console.warn('[EngineSelector] Module header not found');
    return;
  }

  console.log('[EngineSelector] Injecting engine dropdown into header');

  // Replace header content with dropdown
  moduleHeader.innerHTML = generateEngineDropdownHTML(state.engineType || 'subtractive');

  // Setup dropdown handlers
  setupDropdownHandlers(oscModule);

  // Insert Plaits parameters into fader section
  const faderSection = oscModule.querySelector('.fader-section');
  if (faderSection) {
    // Create Plaits parameter faders (hidden by default)
    // MODEL is first - stepped parameter to select from 24 engines
    const plaitsParamHTML = `
      <div class="slide-pot-container" data-param-id="plaits.model" data-stepped="true" style="display: none;" data-info-id="raembl-plaits-model">
        <div class="slide-pot-label" data-param-label="MDL" title="Plaits engine model (1-24)">
          <span style="font-size: 9px; font-weight: bold;">MDL</span>
        </div>
        <div class="slide-pot-body">
          <div class="slide-pot-slot"></div>
          <div class="slide-pot-knob" data-led-mode="value">
            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
          </div>
        </div>
        <div class="slide-pot-value plaits-model-display">
          <span id="plaits-model-value">1</span>
          <span id="plaits-model-name" class="plaits-model-name">Virtual Analog</span>
        </div>
      </div>
      <div class="slide-pot-container" data-param-id="plaits.harmonics" style="display: none;" data-info-id="raembl-plaits-harm">
        <div class="slide-pot-label" data-param-label="HARM" title="Harmonics - Primary timbral control">
          <span style="font-size: 9px; font-weight: bold;">HARM</span>
        </div>
        <div class="slide-pot-body">
          <div class="slide-pot-slot"></div>
          <div class="slide-pot-knob" data-led-mode="value">
            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
          </div>
        </div>
        <div class="slide-pot-value">50%</div>
      </div>
      <div class="slide-pot-container" data-param-id="plaits.timbre" style="display: none;" data-info-id="raembl-plaits-timbre">
        <div class="slide-pot-label" data-param-label="TIMB" title="Timbre - Secondary timbral control">
          <span style="font-size: 9px; font-weight: bold;">TIMB</span>
        </div>
        <div class="slide-pot-body">
          <div class="slide-pot-slot"></div>
          <div class="slide-pot-knob" data-led-mode="value">
            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
          </div>
        </div>
        <div class="slide-pot-value">50%</div>
      </div>
      <div class="slide-pot-container" data-param-id="plaits.morph" style="display: none;" data-info-id="raembl-plaits-morph">
        <div class="slide-pot-label" data-param-label="MORPH" title="Morph - Tertiary control / crossfade">
          <span style="font-size: 9px; font-weight: bold;">MORPH</span>
        </div>
        <div class="slide-pot-body">
          <div class="slide-pot-slot"></div>
          <div class="slide-pot-knob" data-led-mode="value">
            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
          </div>
        </div>
        <div class="slide-pot-value">50%</div>
      </div>
      <div class="slide-pot-container" data-param-id="plaits.lpgDecay" style="display: none;" data-info-id="raembl-plaits-decay">
        <div class="slide-pot-label" data-param-label="DEC" title="LPG Decay - Low pass gate decay time">
          <span style="font-size: 9px; font-weight: bold;">DEC</span>
        </div>
        <div class="slide-pot-body">
          <div class="slide-pot-slot"></div>
          <div class="slide-pot-knob" data-led-mode="value">
            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
          </div>
        </div>
        <div class="slide-pot-value">50%</div>
      </div>
      <div class="slide-pot-container" data-param-id="plaits.lpgColour" style="display: none;" data-info-id="raembl-plaits-colour">
        <div class="slide-pot-label" data-param-label="COL" title="LPG Colour - VCA to VCF blend">
          <span style="font-size: 9px; font-weight: bold;">COL</span>
        </div>
        <div class="slide-pot-body">
          <div class="slide-pot-slot"></div>
          <div class="slide-pot-knob" data-led-mode="value">
            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
          </div>
        </div>
        <div class="slide-pot-value">50%</div>
      </div>
    `;
    faderSection.insertAdjacentHTML('beforeend', plaitsParamHTML);

    // Create Rings parameter faders (hidden by default)
    // Model dropdown and polyphony toggle are injected into the header separately
    const ringsParamHTML = `
      <div class="slide-pot-container" data-param-id="rings.structure" style="display: none;" data-info-id="raembl-rings-structure">
        <div class="slide-pot-label" data-param-label="STRUC" title="Structure - Inharmonicity / string coupling">
          <span style="font-size: 9px; font-weight: bold;">STRUC</span>
        </div>
        <div class="slide-pot-body">
          <div class="slide-pot-slot"></div>
          <div class="slide-pot-knob" data-led-mode="value">
            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
          </div>
        </div>
        <div class="slide-pot-value">50%</div>
      </div>
      <div class="slide-pot-container" data-param-id="rings.brightness" style="display: none;" data-info-id="raembl-rings-brightness">
        <div class="slide-pot-label" data-param-label="BRIT" title="Brightness - High frequency content">
          <span style="font-size: 9px; font-weight: bold;">BRIT</span>
        </div>
        <div class="slide-pot-body">
          <div class="slide-pot-slot"></div>
          <div class="slide-pot-knob" data-led-mode="value">
            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
          </div>
        </div>
        <div class="slide-pot-value">50%</div>
      </div>
      <div class="slide-pot-container" data-param-id="rings.damping" style="display: none;" data-info-id="raembl-rings-damping">
        <div class="slide-pot-label" data-param-label="DAMP" title="Damping - Decay time">
          <span style="font-size: 9px; font-weight: bold;">DAMP</span>
        </div>
        <div class="slide-pot-body">
          <div class="slide-pot-slot"></div>
          <div class="slide-pot-knob" data-led-mode="value">
            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
          </div>
        </div>
        <div class="slide-pot-value">50%</div>
      </div>
      <div class="slide-pot-container" data-param-id="rings.position" style="display: none;" data-info-id="raembl-rings-position">
        <div class="slide-pot-label" data-param-label="POS" title="Position - Excitation position (bow/pluck)">
          <span style="font-size: 9px; font-weight: bold;">POS</span>
        </div>
        <div class="slide-pot-body">
          <div class="slide-pot-slot"></div>
          <div class="slide-pot-knob" data-led-mode="value">
            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
          </div>
        </div>
        <div class="slide-pot-value">25%</div>
      </div>
    `;
    faderSection.insertAdjacentHTML('beforeend', ringsParamHTML);

    // Inject Rings header controls (model dropdown + polyphony toggle)
    injectRingsHeaderControls(oscModule);

    // Setup Rings control handlers (model dropdown + polyphony toggle)
    setupRingsControlHandlers();

    // Dispatch event to reinitialize slide pots for the new parameters
    document.dispatchEvent(new CustomEvent('plaitsParamsAdded'));
    document.dispatchEvent(new CustomEvent('ringsParamsAdded'));
  }

  // Initialise visibility based on current state
  updateEngineVisibility(state.engineType || 'subtractive');
}

/**
 * Add engine selector styles
 */
export function addEngineSelectorStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Engine Dropdown (in module header) */
    .raembl-app .raembl-engine-dropdown-container {
      position: relative;
      display: inline-block;
    }

    .raembl-app .raembl-engine-dropdown-button {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: bold;
      font-family: inherit;
      background: transparent;
      border: none;
      color: var(--theme-color, #f0a000);
      cursor: pointer;
      transition: color 0.15s, transform 0.1s ease;
    }

    .raembl-app .raembl-engine-dropdown-button:hover {
      color: var(--theme-color-hover, #fff);
      transform: scale(1.05);
    }

    .raembl-app .raembl-engine-dropdown-button:active {
      transform: scale(0.95);
    }

    .raembl-app .raembl-engine-dropdown-button .dropdown-arrow {
      width: 10px;
      height: 6px;
      transition: transform 0.15s;
    }

    .raembl-app .raembl-engine-dropdown-button[aria-expanded="true"] .dropdown-arrow {
      transform: rotate(180deg);
    }

    .raembl-app .raembl-engine-dropdown-menu {
      position: absolute;
      top: 100%;
      left: 0;
      z-index: 1000;
      min-width: 120px;
      padding: 4px 0;
      background: var(--bg-module, #111);
      border: 1px solid var(--theme-color, #f0a000);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    }

    .raembl-app .raembl-engine-dropdown-menu.hidden {
      display: none;
    }

    .raembl-app .raembl-engine-dropdown-menu .dropdown-option {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 10px;
      font-size: 11px;
      font-family: inherit;
      background: transparent;
      border: none;
      color: var(--theme-color, #f0a000);
      cursor: pointer;
      text-align: left;
      transition: all 0.15s;
    }

    .raembl-app .raembl-engine-dropdown-menu .dropdown-option:hover {
      background: var(--theme-color, #f0a000);
      color: var(--bg-module, #111);
    }

    .raembl-app .raembl-engine-dropdown-menu .dropdown-option:hover .option-name,
    .raembl-app .raembl-engine-dropdown-menu .dropdown-option:hover .option-description {
      color: var(--bg-module, #111);
    }

    .raembl-app .raembl-engine-dropdown-menu .dropdown-option.selected {
      color: var(--theme-color, #f0a000);
    }

    .raembl-app .raembl-engine-dropdown-menu .dropdown-option.selected:hover,
    .raembl-app .raembl-engine-dropdown-menu .dropdown-option.selected:hover .option-name,
    .raembl-app .raembl-engine-dropdown-menu .dropdown-option.selected:hover .option-description {
      color: var(--bg-module, #111);
    }

    .raembl-app .raembl-engine-dropdown-menu .option-name {
      font-weight: bold;
      min-width: 30px;
    }

    .raembl-app .raembl-engine-dropdown-menu .option-description {
      font-size: 10px;
      opacity: 0.7;
    }

    /* Plaits Model Display */
    .raembl-app .plaits-model-display {
      display: flex;
      flex-direction: column;
      align-items: center;
      line-height: 1.1;
    }

    .raembl-app #plaits-model-value {
      font-size: 11px;
      font-weight: bold;
    }

    .raembl-app .plaits-model-name {
      font-size: 8px;
      opacity: 0.7;
      text-align: center;
      max-width: 50px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Rings Header Controls (cycling buttons for model + polyphony) */
    .raembl-app .rings-header-controls {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .raembl-app .rings-header-btn {
      font-size: 9px;
      font-weight: bold;
      font-family: inherit;
      padding: 2px 6px;
      background: transparent;
      border: none;
      color: var(--theme-color, #f0a000);
      cursor: pointer;
      transition: color 0.15s;
      min-width: 32px;
      text-align: center;
    }

    .raembl-app .rings-header-btn:hover {
      color: var(--theme-color-hover, #fff);
    }

    .raembl-app .rings-header-btn:active {
      color: var(--theme-color-hover, #ffb020);
    }

    /* Note: Gradient mode and solid colour mode styling moved to raembl.css for consistency */
  `;
  document.head.appendChild(style);
}

/**
 * Initialise engine selector
 */
export function initEngineSelector() {
  addEngineSelectorStyles();

  // Wait for DOM to be ready with oscillator module
  const tryInject = () => {
    if (document.getElementById('raembl-oscillator')) {
      injectEngineSelector();
    } else {
      setTimeout(tryInject, 100);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInject);
  } else {
    tryInject();
  }
}

// Listen for engine change events
document.addEventListener('engineChanged', (e) => {
  const { engineType } = e.detail;
  updateEngineVisibility(engineType);

  // Update dropdown button text
  const oscModule = document.getElementById('raembl-oscillator');
  if (oscModule) {
    const dropdownButton = oscModule.querySelector('.raembl-engine-dropdown-button');
    const dropdownMenu = oscModule.querySelector('.raembl-engine-dropdown-menu');

    if (dropdownButton && dropdownMenu) {
      const engineOption = ENGINE_OPTIONS.find(e => e.id === engineType);
      if (engineOption) {
        dropdownButton.querySelector('.dropdown-selected-text').textContent = engineOption.name;
        dropdownButton.title = engineOption.description;

        // Update selected state in menu
        dropdownMenu.querySelectorAll('.dropdown-option').forEach(o => {
          const isSelected = o.dataset.engine === engineType;
          o.classList.toggle('selected', isSelected);
          o.setAttribute('aria-selected', isSelected.toString());
        });
      }
    }
  }
});

// Listen for Plaits model changes (from fader interaction)
document.addEventListener('plaitsModelChanged', (e) => {
  const { model } = e.detail;
  updateModelDisplay(model);
});

// Listen for Rings model changes (from fader interaction)
document.addEventListener('ringsModelChanged', (e) => {
  const { model } = e.detail;
  updateRingsModelDisplay(model);
});
