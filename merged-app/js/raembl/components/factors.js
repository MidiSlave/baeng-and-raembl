// File: js/components/factors.js
// Factors module component - Updated for SlidePot
import { state } from '../state.js';

export function renderFactorsModule() {
    const factorsModule = document.createElement('div');
    factorsModule.id = 'raembl-factors';
    factorsModule.className = 'module';

    factorsModule.innerHTML = `
        <div class="module-header-container">
            <button class="random-button" id="factors-random" title="Randomize Factors parameters">
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
            <div class="module-header" data-info-id="raembl-module-factors">FACTORS</div>
            <button class="viz-toggle-button" id="raembl-factors-viz-toggle" title="Toggle visualization mode">■</button>
            <button class="toggle-button seq-reset ${state.resetFactorsOnBar ? 'active' : ''}" title="Reset Sequence on Bar" data-info-id="raembl-factors-seq">SEQ</button>
        </div>
        <canvas id="raembl-factors-canvas" class="factors-canvas"></canvas>
        <div class="fader-section">
            <div class="slide-pot-container" data-param-id="factors.steps" data-stepped="true" data-info-id="raembl-factors-steps">
                <div class="slide-pot-label waveform-icon" data-param-label="STEPS" title="Steps">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M23,1v22h-7h-5H6H1v-7h5v-5h5V6h5V1H23z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">16</div>
            </div>
            <div class="slide-pot-container" data-param-id="factors.fills" data-stepped="true" data-info-id="raembl-factors-fills">
                <div class="slide-pot-label waveform-icon" data-param-label="FILLS" title="Fills">
                    <svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4,29.987l24,0c0.828,0 1.5,-0.672 1.5,-1.5c0,-0.827 -0.672,-1.5 -1.5,-1.5l-24,0c-0.828,0 -1.5,0.673 -1.5,1.5c0,0.828 0.672,1.5 1.5,1.5Z"/>
                        <path d="M9.138,22.244c1.323,0.328 2.775,0.118 3.995,-0.702l9.873,-6.712c0.458,-0.308 0.58,-0.929 0.273,-1.388l-6.717,-10c-0.308,-0.458 -0.929,-0.58 -1.388,-0.272c0,-0 -6.027,4.048 -9.961,6.691c-2.293,1.539 -2.903,4.646 -1.363,6.938c0.725,1.08 1.53,2.279 2.256,3.359c0.738,1.099 1.836,1.812 3.032,2.086Zm11.448,-9.223l-15.418,0c0.207,-0.591 0.599,-1.124 1.16,-1.5c-0,-0 9.131,-6.133 9.131,-6.133l5.127,7.633Z"/>
                        <path d="M26.339,15.455c-0.185,-0.284 -0.5,-0.455 -0.839,-0.455c-0.339,-0 -0.654,0.171 -0.839,0.455c0,0 -1.274,1.965 -2.039,3.732c-0.379,0.876 -0.622,1.717 -0.622,2.313c-0,1.932 1.568,3.5 3.5,3.5c1.932,0 3.5,-1.568 3.5,-3.5c-0,-0.596 -0.243,-1.437 -0.622,-2.313c-0.765,-1.767 -2.039,-3.732 -2.039,-3.732Z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">4</div>
            </div>
            <div class="slide-pot-container" data-param-id="factors.shift" data-stepped="true" data-info-id="raembl-factors-shift">
                <div class="slide-pot-label waveform-icon" data-param-label="SHIFT" title="Shift">
                    <svg viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M504.918,99.144c-1.75-8.797-4.188-13.266-4.188-13.266c-0.75-2.375-2.781-4.125-5.234-4.516c-2.469-0.391-4.938,0.641-6.391,2.672l-6.531,9.141l-36.891,51.813c-7.125,9.969-21.672,11.781-32.5,4.047l-62.125-44.453c-10.813-7.734-13.813-22.094-6.672-32.063l37.781-53.063l6.203-8.656c1.438-2.016,1.625-4.688,0.484-6.875c-1.156-2.203-3.438-3.563-5.922-3.531c0,0-5.859-1-15.234,0.188c-23.578,3.016-46.547,12.828-65.766,29.672c-27.109,23.75-41.359,56.734-42.156,90.141c-0.25,10.078,8.859,53.828-14.938,77.625S19.996,422.847,19.996,422.847c-20.391,20.406-20.391,53.469,0,73.859c20.406,20.391,53.469,20.391,73.859,0c0,0,205.969-205.968,224.844-224.843s71.203-24.469,81.578-25.875c23.25-3.141,45.844-12.922,64.813-29.547C499.574,186.222,513.262,141.097,504.918,99.144z M40.012,476.706c-9.781-9.781-9.781-25.609,0-35.391c9.766-9.766,25.609-9.781,35.375,0c9.781,9.766,9.781,25.609,0,35.391C65.621,486.472,49.777,486.472,40.012,476.706z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">0</div>
            </div>
            <div class="slide-pot-container" data-param-id="factors.accentAmt" data-info-id="raembl-factors-accent">
                <div class="slide-pot-label waveform-icon" data-param-label=">" title="Accent">
                    <svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10.656 8.864q0-2.208 1.568-3.776t3.776-1.568 3.776 1.568 1.6 3.776q0 0.256-0.064 0.448l-1.76 6.944q-0.096 1.408-1.12 2.368t-2.432 0.96q-1.376 0-2.4-0.928t-1.152-2.304q-0.32-0.96-0.672-2.112t-0.736-2.784-0.384-2.592zM12.416 24.928q0-1.472 1.056-2.496t2.528-1.056 2.528 1.056 1.056 2.496q0 1.504-1.056 2.528t-2.528 1.056-2.528-1.056-1.056-2.528z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">0</div>
            </div>
            <div class="slide-pot-container" data-param-id="factors.slideAmt" data-info-id="raembl-factors-slide">
                <div class="slide-pot-label waveform-icon" data-param-label="SLIDE" title="Slide">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M18 5C17.4477 5 17 5.44772 17 6C17 6.55228 17.4477 7 18 7C18.5523 7 19 6.55228 19 6C19 5.44772 18.5523 5 18 5ZM15.1466 5.07115C15.5376 3.86894 16.6673 3 18 3C19.6569 3 21 4.34315 21 6C21 7.65685 19.6569 9 18 9C16.7244 9 15.6347 8.20384 15.2008 7.08132C10.9961 7.67896 7.67896 10.9961 7.08132 15.2008C8.20384 15.6347 9 16.7244 9 18C9 19.6569 7.65685 21 6 21C4.34315 21 3 19.6569 3 18C3 16.6673 3.86894 15.5376 5.07115 15.1466C5.71346 9.87853 9.87853 5.71347 15.1466 5.07115ZM6 17C5.44772 17 5 17.4477 5 18C5 18.5523 5.44772 19 6 19C6.55228 19 7 18.5523 7 18C7 17.4477 6.55228 17 6 17Z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">0</div>
            </div>
            <div class="slide-pot-container" data-param-id="factors.trillAmt" data-info-id="raembl-factors-trill">
                <div class="slide-pot-label waveform-icon" data-param-label="TR" title="Trill">
                    <svg viewBox="0 0 454.484 454.484" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M451.555,164.505c-3.906-3.904-10.236-3.904-14.143,0c-15.188,15.188-58.267,58.267-73.717,73.717l-73.717-73.717c-3.904-3.903-10.236-3.905-14.143,0c-1.984,1.984-71.498,71.497-73.718,73.717l-73.717-73.717c-3.906-3.904-10.236-3.904-14.143,0c-3.585,3.585-102.099,102.099-111.33,111.33c-3.905,3.905-3.905,10.237,0,14.143c3.907,3.905,10.236,3.904,14.143,0l73.753-73.754l73.718,73.718c1.876,1.875,4.419,2.929,7.071,2.929s5.195-1.054,7.071-2.929l73.717-73.718l73.717,73.718c1.876,1.875,4.419,2.929,7.071,2.929s5.195-1.054,7.071-2.929c7.524-7.524,107.982-107.982,111.294-111.294C455.46,174.743,455.46,168.411,451.555,164.505z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">0</div>
            </div>
            <div class="slide-pot-container" data-param-id="factors.gateLength" data-info-id="raembl-factors-gate">
                <div class="slide-pot-label waveform-icon" data-param-label="GATE" title="Gate Length">
                    <svg viewBox="0 -0.5 17 17" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M15.589,7.076 L13.788,7.076 L13.166,3.953 L14.384,3.953 C14.662,3.953 14.906,3.801 14.906,3.628 L14.906,2.326 C14.906,2.153 14.662,2.001 14.384,2.001 L2.538,2.001 C2.26,2.001 2.016,2.153 2.016,2.326 L2.016,3.628 C2.016,3.801 2.26,3.953 2.538,3.953 L3.868,3.953 L3.263,7.076 L1.411,7.076 C1.183,7.076 1,7.217 1,7.39 L1,8.65 C1,8.824 1.184,8.964 1.411,8.964 L2.897,8.964 L2.066,13.252 C2.021,13.432 2.131,13.614 2.311,13.659 L3.612,13.983 C3.638,13.989 3.668,13.993 3.694,13.993 C3.848,13.993 3.982,13.888 4.026,13.717 L4.947,8.964 L12.11,8.964 L13.033,13.598 C13.07,13.748 13.205,13.853 13.359,13.853 C13.384,13.853 13.414,13.85 13.439,13.843 L14.742,13.519 C14.922,13.474 15.031,13.292 14.993,13.134 L14.163,8.964 L15.589,8.964 C15.817,8.964 16,8.823 16,8.65 L16,7.39 C16,7.217 15.816,7.076 15.589,7.076 L15.589,7.076 Z M5.313,7.076 L5.918,3.953 L11.112,3.953 L11.734,7.076 L5.313,7.076 L5.313,7.076 Z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">80%</div>
            </div>
        </div>
    `;

    return factorsModule;
}

