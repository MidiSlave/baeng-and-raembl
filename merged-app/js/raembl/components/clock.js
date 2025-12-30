// File: js/components/clock.js
// Clock module component - Updated for SlidePot with canvas knob
export function renderClockModule() {
    const clockModule = document.createElement('div');
    clockModule.id = 'raembl-clock';
    clockModule.className = 'module';

    clockModule.innerHTML = `
        <div class="module-header-container">
            <button class="random-button" id="clock-random" title="Randomize Clock parameters">
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
            <div class="module-header">TIME</div>
            <div id="raembl-settings-gear-icon" class="settings-gear" title="Settings">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M19.4308 14.0509C19.8078 13.3765 20.0003 12.6095 20.0003 11.8109C20.0003 11.0122 19.8078 10.2452 19.4308 9.57087L21.5358 7.9398C21.6908 7.8198 21.7748 7.62681 21.7568 7.42981L20.2928 4.90987C20.2468 4.82087 20.1638 4.75188 20.0698 4.71888C19.9758 4.68588 19.8738 4.69187 19.7828 4.73587L17.1638 5.8488C16.3798 5.29881 15.5068 4.89084 14.5698 4.65585L14.1738 2.00382C14.1468 1.81982 14.0018 1.67283 13.8168 1.63983C13.6318 1.60683 13.4428 1.68582 13.3388 1.83382L10.6628 1.83482C10.5588 1.68682 10.3698 1.60783 10.1848 1.64083C10.0008 1.67383 9.8558 1.82082 9.8288 2.00482L9.4318 4.65585C8.4948 4.89084 7.6218 5.29881 6.8378 5.8488L4.2188 4.73587C4.1278 4.69187 4.0248 4.68588 3.9308 4.71888C3.8368 4.75188 3.7538 4.82087 3.7078 4.90987L2.2438 7.42981C2.2258 7.62681 2.3098 7.8198 2.4648 7.9398L4.5688 9.57087C4.1918 10.2452 4.00029 11.0122 4.00029 11.8109C4.00029 12.6095 4.1918 13.3765 4.5688 14.0509L2.4648 15.6819C2.3098 15.8019 2.2258 15.9949 2.2438 16.1919L3.7078 18.7119C3.7538 18.8009 3.8368 18.8699 3.9308 18.9029C4.0248 18.9359 4.1278 18.9299 4.2188 18.8859L6.8378 17.7729C7.6218 18.3229 8.4948 18.7309 9.4318 18.9659L9.8288 21.6179C9.8558 21.8019 10.0008 21.9489 10.1848 21.9819C10.3698 22.0149 10.5588 21.9359 10.6628 21.7879L13.3388 21.7869C13.4428 21.9349 13.6318 22.0139 13.8168 21.9809C14.0018 21.9479 14.1468 21.8009 14.1738 21.6169L14.5698 18.9659C15.5068 18.7309 16.3798 18.3229 17.1638 17.7729L19.7828 18.8859C19.8738 18.9299 19.9758 18.9359 20.0698 18.9029C20.1638 18.8699 20.2468 18.8009 20.2928 18.7119L21.7568 16.1919C21.7748 15.9949 21.6908 15.8019 21.5358 15.6819L19.4308 14.0509ZM12.0003 15.8109C9.79929 15.8109 8.00029 14.0119 8.00029 11.8109C8.00029 9.60985 9.79929 7.81085 12.0003 7.81085C14.2013 7.81085 16.0003 9.60985 16.0003 11.8109C16.0003 14.0119 14.2013 15.8109 12.0003 15.8109Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
        </div>
        <div class="time-controls">
            <div class="play-display-column">
                <div class="display-box">---</div>
                <div class="play-button">▶</div>
            </div>
            <div class="reset-column">
                <button class="toggle-button lfo-reset active">LFO<br>RESET</button>
                <button class="toggle-button seq-reset active">SEQ<br>RESET</button>
            </div>
        </div>
        <div class="fader-section time-fader-section">
            <div class="slide-pot-container" data-param-id="clock.bpm">
                <div class="slide-pot-label waveform-icon" data-param-label="BPM" title="Tempo (BPM)">
                    <svg viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16,21c0.3,0,0.6-0.1,0.8-0.4l13-17c0.3-0.4,0.3-1.1-0.2-1.4c-0.4-0.3-1.1-0.3-1.4,0.2l-5.7,7.5l-1-4.8c-0.4-1.8-2-3.1-3.8-3.1h-3.4c-1.8,0-3.4,1.2-3.8,3L5.8,25.5c-0.3,1.1,0,2.2,0.7,3.1C7.2,29.5,8.2,30,9.3,30h13.3c1.1,0,2.2-0.5,2.9-1.4c0.7-0.9,0.9-2,0.7-3.1l-2.5-9.7c-0.1-0.5-0.7-0.9-1.2-0.7c-0.5,0.1-0.9,0.7-0.7,1.2l1.5,5.8H8.6l3.8-16.5c0.2-0.9,1-1.5,1.8-1.5h3.4c0.9,0,1.7,0.6,1.8,1.5l1.4,6.5l-5.6,7.4c-0.3,0.4-0.3,1.1,0.2,1.4C15.6,20.9,15.8,21,16,21z"/>
                        <path d="M15,8h2c0.6,0,1-0.4,1-1s-0.4-1-1-1h-2c-0.6,0-1,0.4-1,1S14.4,8,15,8z"/>
                        <path d="M15,11h2c0.6,0,1-0.4,1-1s-0.4-1-1-1h-2c-0.6,0-1,0.4-1,1S14.4,11,15,11z"/>
                        <path d="M15,14h2c0.6,0,1-0.4,1-1s-0.4-1-1-1h-2c-0.6,0-1,0.4-1,1S14.4,14,15,14z"/>
                    </svg>
                </div>
                <div class="slide-pot-body">
                    <div class="slide-pot-slot"></div>
                    <div class="slide-pot-knob" data-led-mode="value">
                        <canvas class="slide-pot-knob-canvas" width="48" height="24"></canvas>
                    </div>
                </div>
                <div class="slide-pot-value">120</div>
            </div>
            <div class="slide-pot-container" data-param-id="clock.swing">
                <div class="slide-pot-label waveform-icon" data-param-label="SWING" title="Swing">
                    <svg viewBox="0 0 30.002 30.002" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M29.982,23.945l-2.56-15.672c-0.376-2.294-2.335-3.959-4.658-3.959H7.237c-2.323,0-4.282,1.665-4.658,3.959L0.02,23.945c-0.134,0.816,0.421,1.588,1.238,1.723c0.82,0.134,1.589-0.422,1.723-1.239L5.54,8.759c0.129-0.792,0.778-1.372,1.565-1.432v7.891H7.022c-0.553,0-1,0.449-1,1c0,0.553,0.447,1,1,1h7.167c0.553,0,1-0.447,1-1c0-0.552-0.447-1-1-1h-0.084V7.314h2v11.902h-0.082c-0.555,0-1,0.448-1,1c0,0.553,0.447,1,1,1h7.166c0.554,0,1-0.447,1-1c0-0.552-0.446-1-1-1h-0.084V7.35c0.689,0.138,1.237,0.686,1.355,1.407l2.56,15.67c0.119,0.735,0.758,1.258,1.479,1.258c0.08,0,0.162-0.006,0.244-0.021C29.561,25.533,30.116,24.762,29.982,23.945z M12.106,15.217h-3V7.314h3V15.217z M18.106,19.217V7.314h3v11.902H18.106z"/>
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
            <div class="slide-pot-container" data-param-id="clock.length" data-stepped="true">
                <div class="slide-pot-label waveform-icon" data-param-label="ℓ" title="Bar Length">
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
                <div class="slide-pot-value">4</div>
            </div>
        </div>
    `;

    return clockModule;
}
