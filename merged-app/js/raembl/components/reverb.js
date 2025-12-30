// File: js/components/reverb.js
// Reverb module component - Updated for SlidePot
export function renderReverbModule() {
    const reverbModule = document.createElement('div');
    reverbModule.id = 'raembl-reverb';
    reverbModule.className = 'module';

    reverbModule.innerHTML = `
        <div class="module-header-container">
            <button class="random-button" id="reverb-random" title="Randomize Reverb parameters">
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
            <div class="module-header" data-info-id="raembl-module-reverb">REVERB</div>
            <button class="duck-btn" data-effect="raemblReverb" title="Sidechain Ducking">
                <svg width="14" height="14" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.406,25.591c0,0 2.059,0.83 1.986,2.891c-0.072,2.062 -6.66,2.957 -6.66,11.094c0,8.137 9.096,14.532 19.217,14.532c10.12,0 23.872,-5.932 23.872,-17.83c0,-19.976 -1.513,-6.134 -17.276,-6.134c-5.235,0 -6.169,-1.787 -5.342,-2.806c3.91,-4.811 5.342,-17.446 -7.42,-17.446c-8.327,0.173 -10.338,6.946 -10.325,8.587c0.008,1.153 -1.204,1.543 -7.308,1.308c-1.536,5.619 9.256,5.804 9.256,5.804Zm3.77,-10.366c1.104,0 2,0.897 2,2c0,1.104 -0.896,2 -2,2c-1.103,0 -2,-0.896 -2,-2c0,-1.103 0.897,-2 2,-2Z"/>
                </svg>
            </button>
        </div>
        <canvas id="raembl-reverb-canvas" width="165" height="60"></canvas>
        <div class="fader-section">
            <div class="slide-pot-container" data-param-id="reverb.mix" data-info-id="raembl-reverb-send">
                <div class="slide-pot-label waveform-icon" data-param-label="SEND" title="Send">
                    <svg viewBox="0 -0.5 25 25" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M18.455 9.8834L7.063 4.1434C6.76535 3.96928 6.40109 3.95274 6.08888 4.09916C5.77667 4.24558 5.55647 4.53621 5.5 4.8764C5.5039 4.98942 5.53114 5.10041 5.58 5.2024L7.749 10.4424C7.85786 10.7903 7.91711 11.1519 7.925 11.5164C7.91714 11.8809 7.85789 12.2425 7.749 12.5904L5.58 17.8304C5.53114 17.9324 5.5039 18.0434 5.5 18.1564C5.55687 18.4961 5.77703 18.7862 6.0889 18.9323C6.40078 19.0785 6.76456 19.062 7.062 18.8884L18.455 13.1484C19.0903 12.8533 19.4967 12.2164 19.4967 11.5159C19.4967 10.8154 19.0903 10.1785 18.455 9.8834V9.8834Z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">25%</div>
            </div>
            <div class="slide-pot-container" data-param-id="reverb.preDelay" data-info-id="raembl-reverb-pred">
                <div class="slide-pot-label waveform-icon" data-param-label="PRED" title="Predelay">
                    <svg viewBox="0 0 36 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 7L9 12L4 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                        <path d="M24 4C19.5817 4 16 7.58172 16 12C16 16.4183 19.5817 20 24 20C28.4183 20 32 16.4183 32 12C32 7.58172 28.4183 4 24 4Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                        <path d="M24 6V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M28 16L24 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
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
            <div class="slide-pot-container" data-param-id="reverb.decay" data-info-id="raembl-reverb-dec">
                <div class="slide-pot-label waveform-icon" data-param-label="DEC" title="Decay">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3Z" stroke="currentColor" stroke-width="1.5" fill="none"/>
                        <path d="M12 6V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M16.24 16.24L12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">70%</div>
            </div>
            <div class="slide-pot-container" data-param-id="reverb.diffusion" data-info-id="raembl-reverb-diff">
                <div class="slide-pot-label waveform-icon" data-param-label="DIFF" title="Diffusion">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="5" cy="5" r="2"/>
                        <circle cx="12" cy="5" r="2"/>
                        <circle cx="19" cy="5" r="2"/>
                        <circle cx="5" cy="12" r="2"/>
                        <circle cx="12" cy="12" r="2"/>
                        <circle cx="19" cy="12" r="2"/>
                        <circle cx="5" cy="19" r="2"/>
                        <circle cx="12" cy="19" r="2"/>
                        <circle cx="19" cy="19" r="2"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">60%</div>
            </div>
            <div class="slide-pot-container" data-param-id="reverb.damping" data-info-id="raembl-reverb-damp">
                <div class="slide-pot-label waveform-icon" data-param-label="DAMP" title="Damping">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M12 0.827576L12.8878 2.53967C14.1035 4.88434 15.5212 6.51667 16.8024 7.99192C16.9893 8.20708 17.1733 8.41891 17.3533 8.62911C18.7331 10.2403 20 11.8793 20 14.1696C20 18.5172 16.395 22 12 22C7.60499 22 4 18.5172 4 14.1696C4 11.8793 5.26687 10.2403 6.64671 8.62911C6.82673 8.41891 7.0107 8.20708 7.19757 7.99191C8.47882 6.51667 9.89649 4.88434 11.1122 2.53967L12 0.827576ZM8.16579 9.93003C6.7748 11.5543 6 12.6877 6 14.1696C6 17.3667 8.66302 20 12 20C15.337 20 18 17.3667 18 14.1696C18 12.6877 17.2252 11.5543 15.8342 9.93003C15.664 9.73133 15.4862 9.5269 15.3024 9.31552C14.2961 8.15864 13.1087 6.79342 12 5.0167C10.8913 6.79342 9.70387 8.15864 8.69763 9.31552C8.51377 9.5269 8.33596 9.73133 8.16579 9.93003Z"/>
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
        </div>
    `;

    return reverbModule;
}
