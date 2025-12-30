// File: js/raembl/components/clouds.js
// Clouds granular processor module component
export function renderCloudsModule() {
    const cloudsModule = document.createElement('div');
    cloudsModule.id = 'raembl-clouds';
    cloudsModule.className = 'module';

    cloudsModule.innerHTML = `
        <div class="module-header-container">
            <button class="random-button" id="clouds-random" title="Randomise Clouds parameters">
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
            <div class="module-header" data-info-id="raembl-module-clouds">
                <div class="clouds-mode-dropdown-container" data-info-id="raembl-clouds-mode">
                    <button class="clouds-mode-dropdown-button" aria-haspopup="listbox" aria-expanded="false" aria-label="Select clouds mode">
                        <span class="dropdown-selected-text">GRANULAR</span>
                        <svg class="dropdown-arrow" viewBox="0 0 12 8">
                            <path d="M1 1 L6 6 L11 1" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <div class="clouds-mode-dropdown-menu hidden" role="listbox" aria-label="Clouds modes">
                        <button class="dropdown-option" role="option" data-mode="granular" aria-selected="true">
                            <span class="dropdown-option-text">GRANULAR</span>
                        </button>
                        <button class="dropdown-option" role="option" data-mode="wsola" aria-selected="false">
                            <span class="dropdown-option-text">PITCH-SHIFTER</span>
                        </button>
                        <button class="dropdown-option" role="option" data-mode="looping" aria-selected="false">
                            <span class="dropdown-option-text">LOOPING DELAY</span>
                        </button>
                        <button class="dropdown-option" role="option" data-mode="spectral" aria-selected="false">
                            <span class="dropdown-option-text">SPECTRAL</span>
                        </button>
                        <button class="dropdown-option" role="option" data-mode="oliverb" aria-selected="false">
                            <span class="dropdown-option-text">OLIVERB</span>
                        </button>
                        <button class="dropdown-option" role="option" data-mode="resonestor" aria-selected="false">
                            <span class="dropdown-option-text">RESONESTOR</span>
                        </button>
                    </div>
                </div>
            </div>
            <button class="freeze-button" id="clouds-freeze-button" title="Freeze buffer" data-info-id="raembl-clouds-freeze">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <polyline points="12 23.5 12 17.75 12 15.32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="12 8.68 12 6.25 12 0.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="15.83 2.42 12 6.25 8.17 2.42" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="8.17 21.58 12 17.75 15.83 21.58" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="21.96 17.75 16.98 14.88 14.88 13.66" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="9.13 10.34 7.02 9.13 2.04 6.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="5.62 3.89 7.02 9.13 1.78 10.53" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="18.38 20.11 16.98 14.88 22.22 13.47" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="2.04 17.75 7.02 14.88 9.13 13.66" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="14.88 10.34 16.98 9.13 21.96 6.25" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="18.38 3.89 16.98 9.13 22.22 10.53" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polyline points="5.62 20.11 7.02 14.88 1.78 13.47" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                    <polygon points="14.88 10.34 14.88 13.66 12 15.32 9.13 13.66 9.13 10.34 12 8.68 14.88 10.34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-miterlimit="10"/>
                </svg>
            </button>
            <button class="quality-button" id="clouds-quality-button" title="Buffer Quality: HI (16b/ST/1s)&#10;Click to cycle" data-info-id="raembl-clouds-quality">
                <span class="quality-label" id="clouds-quality-label">HI</span>
            </button>
            <button class="clock-sync-button" id="clouds-clock-sync-button" title="Clock Sync">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 17V12H15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <button class="duck-btn" data-effect="raemblClouds" title="Sidechain Ducking">
                <svg width="14" height="14" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.406,25.591c0,0 2.059,0.83 1.986,2.891c-0.072,2.062 -6.66,2.957 -6.66,11.094c0,8.137 9.096,14.532 19.217,14.532c10.12,0 23.872,-5.932 23.872,-17.83c0,-19.976 -1.513,-6.134 -17.276,-6.134c-5.235,0 -6.169,-1.787 -5.342,-2.806c3.91,-4.811 5.342,-17.446 -7.42,-17.446c-8.327,0.173 -10.338,6.946 -10.325,8.587c0.008,1.153 -1.204,1.543 -7.308,1.308c-1.536,5.619 9.256,5.804 9.256,5.804Zm3.77,-10.366c1.104,0 2,0.897 2,2c0,1.104 -0.896,2 -2,2c-1.103,0 -2,-0.896 -2,-2c0,-1.103 0.897,-2 2,-2Z"/>
                </svg>
            </button>
        </div>
        <canvas id="raembl-clouds-canvas" width="350" height="60"></canvas>
        <div class="fader-section">
            <!-- 1. PITCH (baseball icon) -->
            <div class="slide-pot-container" data-param-id="clouds.pitch" data-bipolar="true" data-info-id="raembl-clouds-pitch">
                <div class="slide-pot-label waveform-icon" data-param-label="PITCH" title="Pitch (semitones)">
                    <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path fill="currentColor" d="M256,0C114.607,0.009,0.012,114.602,0,256.004C0.012,397.389,114.607,511.991,256,512c141.393-0.009,255.987-114.611,256-255.996C511.987,114.602,397.393,0.009,256,0z M411.761,411.761C371.84,451.651,316.885,476.27,256,476.279c-60.886-0.009-115.841-24.628-155.761-64.518c-0.27-0.271-0.523-0.558-0.794-0.829c4.444-2.093,8.817-4.299,13.038-6.742c6.401-3.706,8.586-11.904,4.875-18.305c-3.707-6.401-11.905-8.581-18.306-4.875c-5.704,3.306-11.656,6.236-17.818,8.748c-0.052,0.018-0.096,0.052-0.144,0.078c-28.448-37.116-45.362-83.425-45.37-133.832c0.008-60.89,24.628-115.85,64.518-155.766C140.159,60.349,195.114,35.73,256,35.721c60.885,0.009,115.84,24.628,155.761,64.518c0.27,0.271,0.522,0.558,0.793,0.829c-4.556,2.145-9.044,4.404-13.365,6.924c-6.392,3.724-8.56,11.921-4.836,18.322c3.724,6.384,11.926,8.547,18.319,4.831c5.695-3.313,11.638-6.261,17.796-8.782c0.152-0.061,0.274-0.156,0.422-0.226c28.462,37.116,45.38,83.442,45.389,133.867C476.27,316.886,451.65,371.836,411.761,411.761z"/>
                        <path fill="currentColor" d="M170.172,323.243c-6.406-3.698-14.598-1.509-18.301,4.892c-3.328,5.756-7.038,11.268-11.107,16.483c-4.543,5.843-3.497,14.25,2.342,18.803c5.834,4.544,14.25,3.497,18.798-2.337c4.814-6.192,9.219-12.715,13.165-19.535C178.771,335.138,176.578,326.949,170.172,323.243z"/>
                        <path fill="currentColor" d="M131.425,120.541c-6.201-4.796-12.742-9.174-19.579-13.099c-6.419-3.688-14.604-1.464-18.288,4.954c-3.68,6.419-1.461,14.599,4.958,18.28c5.764,3.314,11.285,7.012,16.517,11.058c5.852,4.518,14.264,3.444,18.79-2.407C138.349,133.484,137.276,125.068,131.425,120.541z"/>
                        <path fill="currentColor" d="M160.361,201.114c2.816,6.837,10.644,10.107,17.486,7.291c6.841-2.817,10.103-10.64,7.29-17.486c-3.004-7.3-6.497-14.354-10.438-21.105c-3.733-6.384-11.935-8.546-18.323-4.814c-6.388,3.732-8.546,11.93-4.814,18.322C154.884,189.018,157.832,194.958,160.361,201.114z"/>
                        <path fill="currentColor" d="M184.496,241.912c-7.4,0.026-13.368,6.052-13.338,13.456v0.628c0,6.732-0.463,13.36-1.352,19.832c-1.003,7.325,4.12,14.093,11.45,15.096c7.33,1.004,14.089-4.125,15.092-11.45c1.055-7.683,1.6-15.524,1.6-23.477v-0.75C197.914,247.85,191.891,241.877,184.496,241.912z"/>
                        <path fill="currentColor" d="M340.838,256.318v-0.322c0-6.628,0.445-13.134,1.308-19.517c0.99-7.326-4.151-14.076-11.485-15.07c-7.33-0.986-14.076,4.151-15.066,11.485c-1.021,7.562-1.548,15.271-1.548,23.102v0.384c0.017,7.395,6.026,13.378,13.426,13.36C334.868,269.722,340.855,263.722,340.838,256.318z"/>
                        <path fill="currentColor" d="M351.516,310.598c-2.8-6.846-10.622-10.134-17.473-7.334c-6.846,2.8-10.13,10.622-7.33,17.468c2.992,7.318,6.466,14.364,10.396,21.131c3.715,6.393,11.913,8.564,18.31,4.849c6.397-3.715,8.572-11.913,4.857-18.314C356.962,322.702,354.032,316.754,351.516,310.598z"/>
                        <path fill="currentColor" d="M413.209,381.159v0.009c-5.761-3.323-11.272-7.029-16.496-11.093c-5.843-4.535-14.254-3.479-18.794,2.364c-4.539,5.834-3.484,14.25,2.355,18.794c6.191,4.806,12.719,9.2,19.552,13.142c6.41,3.698,14.599,1.491,18.297-4.918C421.816,393.055,419.618,384.857,413.209,381.159z"/>
                        <path fill="currentColor" d="M368.658,148.832c-5.848-4.535-14.264-3.462-18.794,2.381c-4.805,6.201-9.192,12.733-13.12,19.561c-3.694,6.419-1.483,14.599,4.931,18.297c6.41,3.689,14.599,1.482,18.288-4.937c3.318-5.764,7.02-11.276,11.071-16.508C375.568,161.783,374.5,153.367,368.658,148.832z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">0st</div>
            </div>
            <!-- 2. POSITION (map pin icon) -->
            <div class="slide-pot-container" data-param-id="clouds.position" data-info-id="raembl-clouds-pos">
                <div class="slide-pot-label waveform-icon" data-param-label="POS" title="Buffer Position">
                    <svg viewBox="0 0 200 200" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M150,34.94c-27.5-27.5-72-27.5-100,0a70.49,70.49,0,0,0-8,90l33.5,48a30.4,30.4,0,0,0,49.5,0l33.5-48A71.18,71.18,0,0,0,150,34.94Zm-8.5,78.5-33.5,48a10.31,10.31,0,0,1-16.5,0l-33.5-48a50.14,50.14,0,0,1,6-64.5c20-20,52-20,71.5,0a50.19,50.19,0,0,1,6,64.5Zm-41.5-67a35,35,0,1,0,35,35A34.78,34.78,0,0,0,100,46.44Zm0,50a15,15,0,1,1,15-15A14.73,14.73,0,0,1,100,96.44Z"/>
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
            <!-- 3. DENSITY -->
            <div class="slide-pot-container" data-param-id="clouds.density" data-info-id="raembl-clouds-dens">
                <div class="slide-pot-label waveform-icon" data-param-label="DENS" title="Density">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="6" cy="6" r="2"/>
                        <circle cx="18" cy="6" r="2"/>
                        <circle cx="6" cy="18" r="2"/>
                        <circle cx="18" cy="18" r="2"/>
                        <circle cx="12" cy="12" r="2"/>
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
            <!-- 4. SIZE (expand arrows icon) -->
            <div class="slide-pot-container" data-param-id="clouds.size" data-info-id="raembl-clouds-size">
                <div class="slide-pot-label waveform-icon" data-param-label="SIZE" title="Grain Size">
                    <svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M11.975 10.838l-0.021-7.219c-0.009-0.404-0.344-0.644-0.748-0.654l-0.513-0.001c-0.405-0.009-0.725 0.343-0.716 0.747l0.028 4.851-8.321-8.242c-0.391-0.391-1.024-0.391-1.414 0s-0.391 1.024 0 1.414l8.285 8.207-4.721 0.012c-0.404-0.009-0.779 0.27-0.84 0.746l0.001 0.513c0.010 0.405 0.344 0.739 0.748 0.748l7.172-0.031c0.008 0.001 0.013 0.003 0.020 0.003l0.366 0.008c0.201 0.005 0.383-0.074 0.512-0.205 0.132-0.13 0.178-0.311 0.175-0.514l-0.040-0.366c0.001-0.007 0.027-0.012 0.027-0.019zM20.187 11.736c0.129 0.13 0.311 0.21 0.512 0.205l0.366-0.008c0.007 0 0.012-0.002 0.020-0.004l7.172 0.031c0.404-0.009 0.738-0.344 0.747-0.748l0.001-0.513c-0.061-0.476-0.436-0.755-0.84-0.746l-4.721-0.012 8.285-8.207c0.391-0.391 0.391-1.024 0-1.414s-1.023-0.391-1.414 0l-8.32 8.241 0.027-4.851c0.009-0.404-0.311-0.756-0.715-0.747l-0.513 0.001c-0.405 0.010-0.739 0.25-0.748 0.654l-0.021 7.219c0 0.007 0.027 0.012 0.027 0.020l-0.040 0.366c-0.005 0.203 0.043 0.384 0.174 0.514zM11.813 20.232c-0.13-0.131-0.311-0.21-0.512-0.205l-0.366 0.009c-0.007 0-0.012 0.003-0.020 0.003l-7.173-0.032c-0.404 0.009-0.738 0.343-0.748 0.747l-0.001 0.514c0.062 0.476 0.436 0.755 0.84 0.745l4.727 0.012-8.29 8.238c-0.391 0.39-0.391 1.023 0 1.414s1.024 0.39 1.414 0l8.321-8.268-0.028 4.878c-0.009 0.404 0.312 0.756 0.716 0.747l0.513-0.001c0.405-0.010 0.739-0.25 0.748-0.654l0.021-7.219c0-0.007-0.027-0.011-0.027-0.019l0.040-0.397c0.005-0.203-0.043-0.384-0.174-0.514zM23.439 22.028l4.727-0.012c0.404 0.009 0.779-0.27 0.84-0.745l-0.001-0.514c-0.010-0.404-0.344-0.739-0.748-0.748h-7.172c-0.008-0-0.013-0.003-0.020-0.003l-0.428-0.009c-0.201-0.006-0.384 0.136-0.512 0.267-0.131 0.13-0.178 0.311-0.174 0.514l0.040 0.366c0 0.008-0.027 0.012-0.027 0.019l0.021 7.219c0.009 0.404 0.343 0.644 0.748 0.654l0.544 0.001c0.404 0.009 0.725-0.343 0.715-0.747l-0.027-4.829 8.352 8.22c0.39 0.391 1.023 0.391 1.414 0s0.391-1.023 0-1.414z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">30%</div>
            </div>
            <!-- 5. TEXTURE -->
            <div class="slide-pot-container" data-param-id="clouds.texture" data-info-id="raembl-clouds-tex">
                <div class="slide-pot-label waveform-icon" data-param-label="TEX" title="Texture">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <rect x="2" y="2" width="4" height="4"/>
                        <rect x="10" y="2" width="4" height="4"/>
                        <rect x="18" y="2" width="4" height="4"/>
                        <rect x="2" y="10" width="4" height="4"/>
                        <rect x="10" y="10" width="4" height="4"/>
                        <rect x="18" y="10" width="4" height="4"/>
                        <rect x="2" y="18" width="4" height="4"/>
                        <rect x="10" y="18" width="4" height="4"/>
                        <rect x="18" y="18" width="4" height="4"/>
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
            <!-- 6. DRY/WET -->
            <div class="slide-pot-container" data-param-id="clouds.dryWet" data-info-id="raembl-clouds-dw">
                <div class="slide-pot-label waveform-icon" data-param-label="D/W" title="Dry/Wet">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2.69L17.66 8.35C20.78 11.47 20.78 16.53 17.66 19.65C14.54 22.77 9.46 22.77 6.34 19.65C3.22 16.53 3.22 11.47 6.34 8.35L12 2.69Z"/>
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
            <!-- 7. SPREAD -->
            <div class="slide-pot-container" data-param-id="clouds.spread" data-info-id="raembl-clouds-sprd">
                <div class="slide-pot-label waveform-icon" data-param-label="SPRD" title="Stereo Spread">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M2 12 L8 6 M22 12 L16 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
                        <path d="M2 12 L8 18 M22 12 L16 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
                        <circle cx="12" cy="12" r="2"/>
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
            <!-- 8. FEEDBACK (thumbs up/down icon) -->
            <div class="slide-pot-container" data-param-id="clouds.feedback" data-info-id="raembl-clouds-fb">
                <div class="slide-pot-label waveform-icon" data-param-label="FB" title="Feedback">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22,1H15a2.44,2.44,0,0,0-2.41,2l-.92,5.05a2.44,2.44,0,0,0,.53,2,2.47,2.47,0,0,0,1.88.88H17l-.25.66A3.26,3.26,0,0,0,19.75,16a1,1,0,0,0,.92-.59l2.24-5.06A1,1,0,0,0,23,10V2A1,1,0,0,0,22,1ZM21,9.73l-1.83,4.13a1.33,1.33,0,0,1-.45-.4,1.23,1.23,0,0,1-.14-1.16l.38-1a1.68,1.68,0,0,0-.2-1.58A1.7,1.7,0,0,0,17.35,9H14.06a.46.46,0,0,1-.35-.16.5.5,0,0,1-.09-.37l.92-5A.44.44,0,0,1,15,3h6ZM9.94,13.05H7.05l.25-.66A3.26,3.26,0,0,0,4.25,8a1,1,0,0,0-.92.59L1.09,13.65a1,1,0,0,0-.09.4v8a1,1,0,0,0,1,1H9a2.44,2.44,0,0,0,2.41-2l.92-5a2.44,2.44,0,0,0-.53-2A2.47,2.47,0,0,0,9.94,13.05Zm-.48,7.58A.44.44,0,0,1,9,21H3V14.27l1.83-4.13a1.33,1.33,0,0,1,.45.4,1.23,1.23,0,0,1,.14,1.16l-.38,1a1.68,1.68,0,0,0,.2,1.58,1.7,1.7,0,0,0,1.41.74H9.94a.46.46,0,0,1,.35.16.5.5,0,0,1,.09.37Z"/>
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
            <!-- 9. REVERB -->
            <div class="slide-pot-container" data-param-id="clouds.reverb" data-info-id="raembl-clouds-verb">
                <div class="slide-pot-label waveform-icon" data-param-label="VERB" title="Reverb">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="2"/>
                        <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" stroke-width="1"/>
                        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="0.5"/>
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
            <!-- 10. INPUT GAIN (flexing arm icon) -->
            <div class="slide-pot-container" data-param-id="clouds.inputGain" data-info-id="raembl-clouds-gain">
                <div class="slide-pot-label waveform-icon" data-param-label="GAIN" title="Input Gain">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9.14,16.77S8,13.17,10.09,11A14.12,14.12,0,0,1,13,9.13a4.78,4.78,0,1,1,5.61,4.7c-1.83,2.77-5.83,7.71-11.33,7.71C4.36,21.54,1.5,13,1.5,9.13V4.48A2.26,2.26,0,0,1,3.64,2.23c1.73-.09,4,0,4.54,1.17C9,5.11,7.23,8.18,5.32,8.18c0,1.5,1.83,4.76,3.49,6.56" fill="none" stroke="currentColor" stroke-miterlimit="10" stroke-width="1.91"/>
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

    return cloudsModule;
}
