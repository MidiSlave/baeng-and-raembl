// File: js/components/oscillator.js
// Oscillator module component - Updated for SlidePot
export function renderOscillatorModule() {
    const oscillatorModule = document.createElement('div');
    oscillatorModule.id = 'raembl-oscillator';
    oscillatorModule.className = 'module';

    oscillatorModule.innerHTML = `
        <div class="module-header-container">
            <button class="random-button" id="oscillator-random" title="Randomize Oscillator parameters">
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
            <div class="module-header" data-info-id="raembl-module-oscillator">OSCILLATOR</div>
            <button class="mode-toggle active" title="Toggle Mono/Poly Mode" data-info-id="raembl-osc-mode">MONO</button>
        </div>
        <div class="fader-section">
            <div class="slide-pot-container" data-param-id="osc.oct" data-stepped="true" data-info-id="raembl-osc-oct">
                <div class="slide-pot-label waveform-icon" data-param-label="OCT" title="Octave">
                    <span style="font-size: 10px; font-weight: bold;">8ve</span>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">0</div>
            </div>
            <div class="slide-pot-container" data-param-id="osc.subOct" data-stepped="true" data-info-id="raembl-osc-suboct">
                <div class="slide-pot-label waveform-icon" data-param-label="SUB OCT" title="Sub Octave">
                    <svg viewBox="0 -8 72 72" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M63.14,32.88a1,1,0,0,0,0-.16c-1.07-3.54-3.63-6-6.6-6H43.67v-6a1.38,1.38,0,0,0-.27-.84.7.7,0,0,0-.64-.3l-5.4.62v-11C37.36,8.53,37,8,36.53,8s-.84.52-.84,1.15V20.32l-2.53.28V12c0-.63-.37-1.14-.84-1.14s-.84.51-.84,1.14V20.8L30.15,21a1.06,1.06,0,0,0-.77,1.14v4.6H28a4.41,4.41,0,0,0-2.07.52L19.5,30.59V27.84a1.17,1.17,0,0,0-.57-1.09l-3.16-1.44a.64.64,0,0,0-.75.16,1.3,1.3,0,0,0-.35.93v6.72L13.1,34A1.19,1.19,0,0,0,12.57,35v.29h-1v-4.6c0-.64-.38-1.15-.84-1.15s-.84.51-.84,1.15v4.6H9.2c-.46,0-.84.51-.84,1.14s.38,1.15.84,1.15h.69v4.6c0,.63.38,1.15.84,1.15s.84-.52.84-1.15V37.6h1v.29A1.2,1.2,0,0,0,13.1,39l1.57.82v7.06a1.32,1.32,0,0,0,.35.93.69.69,0,0,0,.49.22.58.58,0,0,0,.26-.06l3.16-1.44a1.18,1.18,0,0,0,.57-1.09V42.32l6.41,3.37a4.43,4.43,0,0,0,2.07.53H56.49c3.94,0,7.15-4.38,7.15-9.77A12.88,12.88,0,0,0,63.14,32.88Zm-29.51,6a2.94,2.94,0,1,1,2.94-2.94A2.94,2.94,0,0,1,33.63,38.86Zm9,0a2.94,2.94,0,1,1,2.94-2.94A2.94,2.94,0,0,1,42.68,38.86Zm9.48,0a2.94,2.94,0,1,1,3-2.94A2.94,2.94,0,0,1,52.16,38.86Z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">-1 oct</div>
            </div>
            <div class="slide-pot-container" data-param-id="osc.drift" data-info-id="raembl-osc-drift">
                <div class="slide-pot-label waveform-icon" data-param-label="DRIFT" title="Drift">
                    <svg viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M488,224c-3-5-32.61-17.79-32.61-17.79,5.15-2.66,8.67-3.21,8.67-14.21,0-12-.06-16-8.06-16H428.86c-.11-.24-.23-.49-.34-.74-17.52-38.26-19.87-47.93-46-60.95C347.47,96.88,281.76,96,256,96s-91.47.88-126.49,18.31c-26.16,13-25.51,19.69-46,60.95,0,.11-.21.4-.4.74H55.94c-7.94,0-8,4-8,16,0,11,3.52,11.55,8.67,14.21C56.61,206.21,28,220,24,224s-8,32-8,80,4,96,4,96H31.94c0,14,2.06,16,8.06,16h80c6,0,8-2,8-16H384c0,14,2,16,8,16h82c4,0,6-3,6-16h12s4-49,4-96S491,229,488,224ZM125.26,268.94A516.94,516.94,0,0,1,70.42,272C50,272,49.3,273.31,47.86,260.56a72.16,72.16,0,0,1,.51-17.51L49,240h3c12,0,23.27.51,44.55,6.78a98,98,0,0,1,30.09,15.06C131,265,132,268,132,268Zm247.16,72L368,352H144s.39-.61-5-11.18c-4-7.82,1-12.82,8.91-15.66C163.23,319.64,208,304,256,304s93.66,13.48,108.5,21.16C370,328,376.83,330,372.42,341Zm-257-136.53a96.23,96.23,0,0,1-9.7.07c2.61-4.64,4.06-9.81,6.61-15.21,8-17,17.15-36.24,33.44-44.35,23.54-11.72,72.33-17,110.23-17s86.69,5.24,110.23,17c16.29,8.11,25.4,27.36,33.44,44.35,2.57,5.45,4,10.66,6.68,15.33-2,.11-4.3,0-9.79-.19Zm347.72,56.11C461,273,463,272,441.58,272a516.94,516.94,0,0,1-54.84-3.06c-2.85-.51-3.66-5.32-1.38-7.1a93.84,93.84,0,0,1,30.09-15.06c21.28-6.27,33.26-7.11,45.09-6.69a3.22,3.22,0,0,1,3.09,3A70.18,70.18,0,0,1,463.14,260.56Z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">10%</div>
            </div>
            <div class="slide-pot-container" data-param-id="osc.glide" data-info-id="raembl-osc-glide">
                <div class="slide-pot-label waveform-icon" data-param-label="GLIDE" title="Glide">
                    <svg viewBox="0 0 256 256" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <g id="XMLID_2_">
                            <path id="XMLID_6_" d="M154.6,130.5c6.9,1.9,13.9-2.1,15.9-8.9c1.9-6.9-2.1-13.9-8.9-15.9c-6.9-1.9-13.9,2.1-15.9,8.9C143.8,121.5,147.8,128.6,154.6,130.5z"/>
                            <path id="XMLID_3_" d="M250.8,40.3c0,0-39.7-2.6-130,2.9C54.2,47.3,0.2,55.9,0.2,55.9s23.2,8.6,21.1,39.6c0,0,32.1-5.8,47.4,21.1l59.7-22.1l-1.5,40.8l-25.3,7.9c-2.2,0.7-4.1,1.9-5.6,3.4l-53.1,57.9c-3.1,3.4-2.9,8.7,0.5,11.8c3.4,3.1,8.7,2.9,11.8-0.5l39.9-43.5l51.2-15.9l-0.3,0.2l8.5-2.7l8.5,8.5c1.3,1.3,3.1,2,5,1.9l28-1.6c3.5-0.2,6.3-3.3,6-6.8l0,0c-0.2-3.1-2.5-5.4-5.4-5.9l-25.3-71.3l81.2-31.6C256.5,44.8,255.9,40.5,250.8,40.3z M190.3,149.9c-6.4,0.4-17,1-20.2,1.2c-3.2-3.3-16.1-16.1-16.1-16.1c-0.2-0.2-0.5-0.3-0.7-0.4c-3.3-3.4-8.2-4.9-13-3.5l-7.4,2.3l1.5-41.2l31.2-11.6L190.3,149.9z"/>
                        </g>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">0%</div>
            </div>
            <div class="slide-pot-container" data-param-id="osc.pulseWidth" data-info-id="raembl-osc-width">
                <div class="slide-pot-label waveform-icon" data-param-label="WIDTH" title="Width">
                    <svg viewBox="0 0 179.006 179.006" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <polygon points="52.258,67.769 52.264,37.224 0,89.506 52.264,141.782 52.258,111.237 126.736,111.249 126.736,141.782 179.006,89.506 126.736,37.224 126.736,67.769"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">50%</div>
            </div>
            <div class="slide-pot-container fader-with-switch" data-param-id="osc.pwmAmount" data-info-id="raembl-osc-pwm">
                <div class="slide-pot-label waveform-icon" data-param-label="PWM" title="Pulse Width Modulation">
                    <svg viewBox="0 0 145.78 172.85" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.75,85.76l19.54-.5L40.88,3.75l16.76,165.35L96.9,37.75l11.7,73.91c.41,1.06,2.73,4.63,3.5,4.98,5.91,2.67,13.41-28.81,18.32-30.78l11.6-.07" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="fader-switch-group">
                    <div class="slide-pot-body">
                        <div class="slide-pot-slot"></div>
                        <div class="slide-pot-knob" data-led-mode="value">
                            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                        </div>
                    </div>
                    <div class="switch-toggle">
                        <span class="switch-label">LFO</span>
                        <div class="switch-icon" data-state="lfo">
                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                <path d="M15,5H9A7,7,0,0,0,9,19h6A7,7,0,0,0,15,5Zm-.5,10.5A3.5,3.5,0,1,1,18,12,3.5,3.5,0,0,1,14.5,15.5Z"></path>
                            </svg>
                        </div>
                        <span class="switch-label">ENV</span>
                    </div>
                </div>
                <div class="slide-pot-value">0%</div>
            </div>
            <div class="slide-pot-container fader-with-switch" data-param-id="osc.pitchMod" data-info-id="raembl-osc-mod">
                <div class="slide-pot-label waveform-icon" data-param-label="MOD" title="Pitch Modulation">
                    <svg viewBox="0 0 145.78 172.85" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.75,85.76l19.54-.5L40.88,3.75l16.76,165.35L96.9,37.75l11.7,73.91c.41,1.06,2.73,4.63,3.5,4.98,5.91,2.67,13.41-28.81,18.32-30.78l11.6-.07" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="fader-switch-group">
                    <div class="slide-pot-body">
                        <div class="slide-pot-slot"></div>
                        <div class="slide-pot-knob" data-led-mode="value">
                            <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                        </div>
                    </div>
                    <div class="switch-toggle">
                        <span class="switch-label">LFO</span>
                        <div class="switch-icon" data-state="lfo">
                            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                                <path d="M15,5H9A7,7,0,0,0,9,19h6A7,7,0,0,0,15,5Zm-.5,10.5A3.5,3.5,0,1,1,18,12,3.5,3.5,0,0,1,14.5,15.5Z"></path>
                            </svg>
                        </div>
                        <span class="switch-label">ENV</span>
                    </div>
                </div>
                <div class="slide-pot-value">0%</div>
            </div>
        </div>
    `;

    return oscillatorModule;
}
