// File: js/components/path.js
// Path module component - Updated for SlidePot
export function renderPathModule() {
    const pathModule = document.createElement('div');
    pathModule.id = 'raembl-path';
    pathModule.className = 'module';

    pathModule.innerHTML = `
        <div class="module-header-container">
            <button class="random-button" id="path-random" title="Randomize Path parameters">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.5" fill="none"/>
                    <circle cx="3.5" cy="3.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="3.5" r="0.8" fill="currentColor"/>
                    <circle cx="3.5" cy="7" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="7" r="0.8" fill="currentColor"/>
                    <circle cx="3.5" cy="10.5" r="0.8" fill="currentColor"/>
                    <circle cx="10.5" cy="10.5" r="0.8" fill="currentColor"/>
                </svg>
            </button>
            <div class="module-header" data-info-id="raembl-module-path">PATH</div>
            <button class="viz-toggle-button" id="raembl-path-viz-toggle" title="Toggle visualization mode">■</button>
        </div>
        <canvas id="raembl-path-canvas" width="100" height="60"></canvas>
        <div class="fader-section">
            <div class="slide-pot-container" data-param-id="path.scale" data-stepped="true" data-info-id="raembl-path-scale">
                <div class="slide-pot-label waveform-icon" data-param-label="SCALE" title="Scale">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10.8743804,17.9984528 C10.430876,19.724465 8.86439657,21 7,21 C4.790861,21 3,19.209139 3,17 C3,15.1356034 4.27553501,13.569124 6.00154723,13.1256196 C6.00051776,13.0838713 6,13.0419961 6,13 C6,10.9383628 7.24775766,9.16815511 9.02929279,8.40335698 C9.32877181,5.36975445 11.887643,3 15,3 C18.3137085,3 21,5.6862915 21,9 C21,12.112357 18.6302456,14.6712282 15.596643,14.9707072 C14.8318449,16.7522423 13.0616372,18 11,18 C10.9580039,18 10.9161287,17.9994822 10.8743804,17.9984528 Z M11.1256196,8.00154723 C13.7872469,8.06718064 15.9328194,10.2127531 15.9984528,12.8743804 C17.724465,12.430876 19,10.8643966 19,9 C19,6.790861 17.209139,5 15,5 C13.1356034,5 11.569124,6.27553501 11.1256196,8.00154723 Z M10.8733054,15.9973731 C10.9153196,15.9991186 10.9575569,16 11,16 C12.6568542,16 14,14.6568542 14,13 C14,11.3431458 12.6568542,10 11,10 C9.34314575,10 8,11.3431458 8,13 C8,13.0424431 8.00088139,13.0846804 8.00262687,13.1266946 C9.40611039,13.4889488 10.5110512,14.5938896 10.8733054,15.9973731 Z M7,19 C8.1045695,19 9,18.1045695 9,17 C9,15.8954305 8.1045695,15 7,15 C5.8954305,15 5,15.8954305 5,17 C5,18.1045695 5.8954305,19 7,19 Z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">Chr</div>
            </div>
            <div class="slide-pot-container" data-param-id="path.root" data-stepped="true" data-info-id="raembl-path-root">
                <div class="slide-pot-label waveform-icon" data-param-label="ROOT" title="Root Note">
                    <svg viewBox="0 0 215.76 215.76" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <polygon points="151.493,2.877 83.055,149.641 45.907,89.106 0.113,88.931 0,118.931 29.079,119.042 86.665,212.883 170.604,32.877 215.76,32.877 215.76,2.877"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">C</div>
            </div>
            <div class="slide-pot-container" data-param-id="path.probability" data-info-id="raembl-path-prob">
                <div class="slide-pot-label waveform-icon" data-param-label="PROB" title="Probability">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M9.11241 7.82201C9.44756 6.83666 10.5551 6 12 6C13.7865 6 15 7.24054 15 8.5C15 9.75946 13.7865 11 12 11C11.4477 11 11 11.4477 11 12L11 14C11 14.5523 11.4477 15 12 15C12.5523 15 13 14.5523 13 14L13 12.9082C15.203 12.5001 17 10.7706 17 8.5C17 5.89347 14.6319 4 12 4C9.82097 4 7.86728 5.27185 7.21894 7.17799C7.0411 7.70085 7.3208 8.26889 7.84366 8.44673C8.36653 8.62458 8.93457 8.34488 9.11241 7.82201ZM12 20C12.8285 20 13.5 19.3284 13.5 18.5C13.5 17.6716 12.8285 17 12 17C11.1716 17 10.5 17.6716 10.5 18.5C10.5 19.3284 11.1716 20 12 20Z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">100%</div>
            </div>
        </div>
    `;

    return pathModule;
}

