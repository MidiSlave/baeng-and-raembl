// File: js/components/mixer.js
// Mixer module component - Updated for SlidePot

// SVG waveform icons for mixer oscillators
const waveformIcons = {
    saw: `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,10 L12,2 L12,10 L23,2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    square: `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,10 L1,10 L7,10 L7,2 L17,2 L17,10 L23,10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    triangle: `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,10 L6,2 L12,10 L18,2 L23,10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    sub: `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1,10 L1,10 L11,10 L11,2 L23,2 L23,10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    noise: `<svg width="16" height="10" viewBox="0 0 24 12" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="2" cy="3" r="0.8" fill="currentColor"/><circle cx="5" cy="8" r="0.8" fill="currentColor"/><circle cx="4" cy="5" r="0.8" fill="currentColor"/><circle cx="7" cy="2" r="0.8" fill="currentColor"/><circle cx="9" cy="9" r="0.8" fill="currentColor"/><circle cx="11" cy="4" r="0.8" fill="currentColor"/><circle cx="8" cy="7" r="0.8" fill="currentColor"/><circle cx="13" cy="6" r="0.8" fill="currentColor"/><circle cx="15" cy="3" r="0.8" fill="currentColor"/><circle cx="17" cy="10" r="0.8" fill="currentColor"/><circle cx="14" cy="9" r="0.8" fill="currentColor"/><circle cx="19" cy="5" r="0.8" fill="currentColor"/><circle cx="16" cy="7" r="0.8" fill="currentColor"/><circle cx="21" cy="4" r="0.8" fill="currentColor"/><circle cx="18" cy="2" r="0.8" fill="currentColor"/><circle cx="22" cy="8" r="0.8" fill="currentColor"/><circle cx="20" cy="10" r="0.8" fill="currentColor"/><circle cx="23" cy="6" r="0.8" fill="currentColor"/><circle cx="6" cy="10" r="0.8" fill="currentColor"/><circle cx="10" cy="6" r="0.8" fill="currentColor"/><circle cx="12" cy="2" r="0.8" fill="currentColor"/><circle cx="3" cy="11" r="0.8" fill="currentColor"/></svg>`
};

export function renderMixerModule() {
    const mixerModule = document.createElement('div');
    mixerModule.id = 'raembl-mixer';
    mixerModule.className = 'module';

    mixerModule.innerHTML = `
        <div class="module-header" data-info-id="raembl-module-mixer">MIXER</div>
        <div class="fader-section">
            <div class="slide-pot-container" data-param-id="mixer.sawLevel" data-info-id="raembl-mixer-saw">
                <div class="slide-pot-label waveform-icon" data-param-label="◢">${waveformIcons.saw}</div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">75%</div>
            </div>
            <div class="slide-pot-container" data-param-id="mixer.squareLevel" data-info-id="raembl-mixer-square">
                <div class="slide-pot-label waveform-icon" data-param-label="⊓">${waveformIcons.square}</div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">0%</div>
            </div>
            <div class="slide-pot-container" data-param-id="mixer.triangleLevel" data-info-id="raembl-mixer-tri">
                <div class="slide-pot-label waveform-icon" data-param-label="△">${waveformIcons.triangle}</div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">0%</div>
            </div>
            <div class="slide-pot-container" data-param-id="mixer.subLevel" data-info-id="raembl-mixer-sub">
                <div class="slide-pot-label waveform-icon" data-param-label="■">${waveformIcons.sub}</div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">50%</div>
            </div>
            <div class="slide-pot-container" data-param-id="mixer.noiseLevel" data-info-id="raembl-mixer-noise">
                <div class="slide-pot-label waveform-icon" data-param-label="≋">${waveformIcons.noise}</div>
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

    return mixerModule;
}
