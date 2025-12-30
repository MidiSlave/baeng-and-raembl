// File: js/components/delay.js
// Delay module component - Updated for SlidePot with SYNC/FREE switch
export function renderDelayModule() {
    const delayModule = document.createElement('div');
    delayModule.id = 'raembl-delay';
    delayModule.className = 'module';

    delayModule.innerHTML = `
        <div class="module-header-container">
            <button class="random-button" id="delay-random" title="Randomize Delay parameters">
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
            <div class="module-header" data-info-id="raembl-module-delay">DELAY</div>
            <button class="duck-btn" data-effect="raemblDelay" title="Sidechain Ducking">
                <svg width="14" height="14" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" xmlns="http://www.w3.org/2000/svg">
                    <path d="M17.406,25.591c0,0 2.059,0.83 1.986,2.891c-0.072,2.062 -6.66,2.957 -6.66,11.094c0,8.137 9.096,14.532 19.217,14.532c10.12,0 23.872,-5.932 23.872,-17.83c0,-19.976 -1.513,-6.134 -17.276,-6.134c-5.235,0 -6.169,-1.787 -5.342,-2.806c3.91,-4.811 5.342,-17.446 -7.42,-17.446c-8.327,0.173 -10.338,6.946 -10.325,8.587c0.008,1.153 -1.204,1.543 -7.308,1.308c-1.536,5.619 9.256,5.804 9.256,5.804Zm3.77,-10.366c1.104,0 2,0.897 2,2c0,1.104 -0.896,2 -2,2c-1.103,0 -2,-0.896 -2,-2c0,-1.103 0.897,-2 2,-2Z"/>
                </svg>
            </button>
            <button class="delay-sync-toggle active" title="Toggle Sync/Free Mode" data-info-id="raembl-delay-sync">SYNC</button>
        </div>
        <canvas id="raembl-delay-canvas" width="200" height="60"></canvas>
        <div class="fader-section">
            <div class="slide-pot-container" data-param-id="delay.mix" data-info-id="raembl-delay-send">
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
            <div class="slide-pot-container" data-param-id="delay.time" data-info-id="raembl-delay-time">
                <div class="slide-pot-label waveform-icon" data-param-label="TIME" title="Time">
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
                <div class="slide-pot-value">1/4</div>
            </div>
            <div class="slide-pot-container" data-param-id="delay.feedback" data-info-id="raembl-delay-fdbk">
                <div class="slide-pot-label waveform-icon" data-param-label="FDBK" title="Feedback">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.5 13L3.29592 12.0476C2.62895 8.93509 5.00172 6 8.18494 6H19M19 6L16 9M19 6L16 3M20.5 11L20.7041 11.9524C21.3711 15.0649 18.9983 18 15.8151 18H5M5 18L8 15M5 18L8 21" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">40%</div>
            </div>
            <div class="slide-pot-container" data-param-id="delay.wow" data-info-id="raembl-delay-wow">
                <div class="slide-pot-label waveform-icon" data-param-label="WOW" title="Wow">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.5,14a4.06,4.06,0,0,1-2.92-1.25,2,2,0,0,0-3.17,0,4,4,0,0,1-5.83,0A2.1,2.1,0,0,0,3,12a1,1,0,0,1,0-2,4,4,0,0,1,2.91,1.25,2,2,0,0,0,3.17,0,4,4,0,0,1,5.83,0,2,2,0,0,0,3.17,0A4.06,4.06,0,0,1,21,10a1,1,0,0,1,0,2,2.12,2.12,0,0,0-1.59.75A4,4,0,0,1,16.5,14Z"/>
                        <path d="M16.5,20a4.06,4.06,0,0,1-2.92-1.25,2,2,0,0,0-3.17,0,4,4,0,0,1-5.83,0A2.1,2.1,0,0,0,3,18a1,1,0,0,1,0-2,4,4,0,0,1,2.91,1.25,2,2,0,0,0,3.17,0,4,4,0,0,1,5.83,0,2,2,0,0,0,3.17,0A4.06,4.06,0,0,1,21,16a1,1,0,0,1,0,2,2.12,2.12,0,0,0-1.59.75A4,4,0,0,1,16.5,20Zm0-12a4.06,4.06,0,0,1-2.92-1.25,2,2,0,0,0-3.17,0,4,4,0,0,1-5.83,0A2.1,2.1,0,0,0,3,6,1,1,0,0,1,3,4,4,4,0,0,1,5.91,5.25a2,2,0,0,0,3.17,0,4,4,0,0,1,5.83,0,2,2,0,0,0,3.17,0A4.06,4.06,0,0,1,21,4a1,1,0,0,1,0,2,2.12,2.12,0,0,0-1.59.75A4,4,0,0,1,16.5,8Z"/>
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
            <div class="slide-pot-container" data-param-id="delay.flutter" data-info-id="raembl-delay-flut">
                <div class="slide-pot-label waveform-icon" data-param-label="FLUT" title="Flutter">
                    <svg viewBox="0 0 400 400" fill="none" stroke="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M191.179 273.824C240.235 297.511 305.516 282.723 327.848 235.07C343.653 201.345 294.142 174.478 268.869 180.597C249.795 185.215 238.443 210.424 226.139 201.065C216.677 165.605 199.9 119.51 135.192 107.37C114.091 103.412 83.5311 110.64 102.336 135.815C116.496 154.766 137.36 163.983 158.442 173.765C164.792 176.714 169.78 183.842 176.581 185.72C178.199 186.166 181.717 185.007 181.525 186.671C181.105 190.238 113.899 155.977 108.125 179.498C103.955 196.484 152.426 206.208 162.693 208.177C163.338 208.3 167.696 208.583 167.631 209.126C167.291 212.044 128.996 205.366 122.548 219.126C113.925 237.519 146.169 239.099 156.097 238.053C164.394 237.176 172.809 236.947 180.889 235.438C181.156 235.389 194.153 233.997 169.23 238.769C147.16 242.995 90.4779 253.756 88.9641 262.487C87.4503 271.218 95.0462 273.682 99.275 281.556C103.504 289.429 106.52 291.001 110.939 295.051C115.357 299.1 142.753 259.14 172.051 268.915M323.418 199.974C348.126 209.727 352.589 199.404 329.977 213.31M291.997 210.007C291.781 209.411 291.563 208.813 291.345 208.215" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">5%</div>
            </div>
            <div class="slide-pot-container" data-param-id="delay.saturation" data-info-id="raembl-delay-sat">
                <div class="slide-pot-label waveform-icon" data-param-label="SAT" title="Saturation">
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
                <div class="slide-pot-value">0%</div>
            </div>
        </div>
    `;

    return delayModule;
}
