// File: js/components/output.js
// Output module component - Updated for SlidePot
export function renderOutputModule() {
    const outputModule = document.createElement('div');
    outputModule.id = 'raembl-output';
    outputModule.className = 'module';

    outputModule.innerHTML = `
        <div class="module-header" data-info-id="raembl-module-output">OUT</div>
        <div class="fader-section">
            <div class="slide-pot-container" data-param-id="output.volume" data-info-id="raembl-output-vol">
                <div class="slide-pot-label waveform-icon" data-param-label="VOL" title="Volume">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 6C20.5 7.5 21 10 21 12C21 14 20.5 16.5 19 18M16 8.99998C16.5 9.49998 17 10.5 17 12C17 13.5 16.5 14.5 16 15M3 10.5V13.5C3 14.6046 3.5 15.5 5.5 16C7.5 16.5 9 21 12 21C14 21 14 3 12 3C9 3 7.5 7.5 5.5 8C3.5 8.5 3 9.39543 3 10.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">75%</div>
            </div>
        </div>
    `;

    return outputModule;
}

