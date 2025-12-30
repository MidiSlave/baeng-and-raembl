// File: js/components/index.js
// Component rendering system
import { state } from '../state.js';
import { SpacerPatternManager } from '../../shared/circuit-pattern.js';
// Clock module removed - timing controls now in shared time strip at bottom of page
import { renderFactorsModule } from './factors.js';
import { renderLfoModule } from './lfo.js';
import { renderPathModule } from './path.js';
import { renderReverbModule } from './reverb.js';
import { renderDelayModule } from './delay.js';
import { renderCloudsModule } from './clouds.js';
import { renderModModule } from './mod.js';
import { renderOscillatorModule } from './oscillator.js';
import { renderMixerModule } from './mixer.js';
import { renderFilterModule } from './filter.js';
import { renderEnvelopeModule } from './envelope.js';
import { renderOutputModule } from './output.js';

// Render all modules to their respective rows
export function renderModules(clearExisting = false) {
    const topRow = document.querySelector('.raembl-app .top-row');
    const bottomRow = document.querySelector('.raembl-app .bottom-row');

    if (!topRow || !bottomRow) {
        console.error("Container rows not found in DOM");
        return;
    }

    // Clear existing modules only when explicitly requested (for re-rendering)
    if (clearExisting) {
        // Cleanup spacer pattern if it exists
        if (window.raemblSpacerPattern) {
            window.raemblSpacerPattern.destroy();
            window.raemblSpacerPattern = null;
        }
        topRow.innerHTML = '';
        bottomRow.innerHTML = '';
    }

    // Top row modules (always rendered)
    // Clock module removed - timing controls now in shared time strip at bottom of page
    topRow.appendChild(renderFactorsModule());
    topRow.appendChild(renderLfoModule());
    topRow.appendChild(renderPathModule());

    // Conditional FX rendering based on state.fxMode
    if (state.fxMode === 'classic') {
        topRow.appendChild(renderReverbModule());
        topRow.appendChild(renderDelayModule());
    } else if (state.fxMode === 'clouds') {
        // Add spacer panel before Clouds module (to fill gap from fewer modules)
        const spacer = document.createElement('div');
        spacer.id = 'raembl-spacer-1';
        spacer.className = 'module spacer-panel';

        // Add canvas for circuit pattern
        const canvas = document.createElement('canvas');
        canvas.id = 'raembl-spacer-canvas';
        spacer.appendChild(canvas);

        topRow.appendChild(spacer);

        // Initialise circuit pattern for spacer (after DOM append)
        window.raemblSpacerPattern = new SpacerPatternManager('raembl-spacer-canvas');
        window.raemblSpacerPattern.init().then(() => {
            window.raemblSpacerPattern.startAnimation();
        });

        topRow.appendChild(renderCloudsModule());
    }

    // Bottom row modules (always rendered)
    bottomRow.appendChild(renderModModule());
    bottomRow.appendChild(renderOscillatorModule());
    bottomRow.appendChild(renderMixerModule());
    bottomRow.appendChild(renderFilterModule());
    bottomRow.appendChild(renderEnvelopeModule());
    bottomRow.appendChild(renderOutputModule());

}