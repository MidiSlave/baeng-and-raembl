// File: js/components/filter.js
// Filter module component - Updated for SlidePot
export function renderFilterModule() {
    const filterModule = document.createElement('div');
    filterModule.id = 'raembl-filter';
    filterModule.className = 'module';

    filterModule.innerHTML = `
        <div class="module-header-container">
            <button class="random-button" id="filter-random" title="Randomize Filter parameters">
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
            <div class="module-header" data-info-id="raembl-module-filter">FILTER</div>
        </div>
        <div class="fader-section">
            <div class="slide-pot-container" data-param-id="filter.highPass" data-info-id="raembl-filter-hp">
                <div class="slide-pot-label waveform-icon" data-param-label="HP" title="Highpass">
                    <svg viewBox="0 0 256 256" fill="currentColor" xmlns="http://www.w3.org/2000/svg" transform="scale(-1,1)">
                        <path d="M24.22 67.796a3.995 3.995 0 0 1 4.008-3.991h85.498c8.834 0 19.732 6.112 24.345 13.657l53.76 87.936c3.46 5.66 11.628 10.247 18.256 10.247h16.718a3.996 3.996 0 0 1 3.994 4.007v8.985a4.007 4.007 0 0 1-4.007 4.008h-24.7c-8.835 0-19.709-6.13-24.283-13.683l-52.324-86.4c-3.43-5.665-11.577-10.257-18.202-10.257H28.214a3.995 3.995 0 0 1-3.993-3.992V67.796z" fill-rule="evenodd"/>
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
            <div class="slide-pot-container" data-param-id="filter.lowPass" data-info-id="raembl-filter-lp">
                <div class="slide-pot-label waveform-icon" data-param-label="LP" title="Lowpass">
                    <svg viewBox="0 0 256 256" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M24.22 67.796a3.995 3.995 0 0 1 4.008-3.991h85.498c8.834 0 19.732 6.112 24.345 13.657l53.76 87.936c3.46 5.66 11.628 10.247 18.256 10.247h16.718a3.996 3.996 0 0 1 3.994 4.007v8.985a4.007 4.007 0 0 1-4.007 4.008h-24.7c-8.835 0-19.709-6.13-24.283-13.683l-52.324-86.4c-3.43-5.665-11.577-10.257-18.202-10.257H28.214a3.995 3.995 0 0 1-3.993-3.992V67.796z" fill-rule="evenodd"/>
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
            <div class="slide-pot-container" data-param-id="filter.resonance" data-info-id="raembl-filter-res">
                <div class="slide-pot-label waveform-icon" data-param-label="RES" title="Resonance">
                    <svg viewBox="0 0 272.1 296.93" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M238.63,4.73c39.19,38.79,40.32,105.37-.07,143.73" stroke-width="7.32" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <path d="M224.17,135.15c32.34-30.59,32.05-84.36.99-115.81" stroke-width="7.32" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <path d="M209.98,32.27c24.39,24.18,24.63,65.23-.02,89.26" stroke-width="7.32" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <path d="M195.73,46.75c16.77,16.83,16.49,44.07.03,60.91" stroke-width="6.75" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <line x1="135.81" y1="139.65" x2="136.4" y2="290.46" stroke-width="12.94" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <path d="M105.03,31.61l-.72,72.59c6.23,40.24,59.72,40.2,63.48-2.25,1.96-22.23-1.98-47.73.21-70.34" stroke-width="12.94" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <path d="M78.17,44.5c-17.52,16.36-20.16,47.67-.31,63.07" stroke-width="6.75" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <path d="M62.22,32.26c-24.37,24.34-24.66,65.12.02,89.27" stroke-width="7.32" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <path d="M47.53,18.15c-31.17,32.55-32.44,84.78.12,116.86" stroke-width="7.32" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <path d="M34.75,3.66C-6.39,42.96-6.57,109.01,33.4,149.22" stroke-width="7.32" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">20%</div>
            </div>
            <div class="slide-pot-container" data-param-id="filter.keyFollow" data-info-id="raembl-filter-key">
                <div class="slide-pot-label waveform-icon" data-param-label="KEY" title="Keyboard Tracking">
                    <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M16 5.5C16 8.53757 13.5376 11 10.5 11H7V13H5V15L4 16H0V12L5.16351 6.83649C5.0567 6.40863 5 5.96094 5 5.5C5 2.46243 7.46243 0 10.5 0C13.5376 0 16 2.46243 16 5.5ZM13 4C13 4.55228 12.5523 5 12 5C11.4477 5 11 4.55228 11 4C11 3.44772 11.4477 3 12 3C12.5523 3 13 3.44772 13 4Z"/>
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
            <div class="slide-pot-container" data-param-id="filter.envAmount" data-info-id="raembl-filter-env">
                <div class="slide-pot-label waveform-icon" data-param-label="ENV" title="Envelope Amount">
                    <svg viewBox="-5.5 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 8.32h-15.12c-1.56 0-2.84 1.28-2.84 2.84v9.64c0 1.56 1.28 2.84 2.84 2.84h15.12c1.56 0 2.84-1.28 2.84-2.84v-9.64c0-1.56-1.24-2.84-2.84-2.84zM2.88 10h15.12c0.64 0 1.16 0.52 1.16 1.16v0.4l-8.040 5.6c-0.36 0.24-1.040 0.24-1.4 0l-8.040-5.6v-0.4c0.040-0.64 0.56-1.16 1.2-1.16zM18 22h-15.12c-0.64 0-1.16-0.52-1.16-1.16v-7.24l7.080 4.92c0.48 0.32 1.080 0.48 1.68 0.48s1.2-0.16 1.68-0.48l7.040-4.92v7.2c0 0.68-0.56 1.2-1.2 1.2z"/>
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
            <div class="slide-pot-container" data-param-id="filter.mod" data-info-id="raembl-filter-mod">
                <div class="slide-pot-label waveform-icon" data-param-label="MOD" title="Filter Modulation">
                    <svg viewBox="0 0 145.78 172.85" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.75,85.76l19.54-.5L40.88,3.75l16.76,165.35L96.9,37.75l11.7,73.91c.41,1.06,2.73,4.63,3.5,4.98,5.91,2.67,13.41-28.81,18.32-30.78l11.6-.07" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
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
        </div>
    `;

    return filterModule;
}
