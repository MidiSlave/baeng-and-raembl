// Clouds Prototype - Main Logic
console.log('[Clouds Prototype] Loading...');

// ===== GLOBAL STATE =====
let audioContext;
let cloudsNode;
let analyser;
let droneOscillator = null;
let isFrozen = false;
let grainCount = 16;

// ===== DOM ELEMENTS =====
const statusEl = document.getElementById('status');
const cpuEl = document.getElementById('cpu');
const bufferStatusEl = document.getElementById('buffer-status');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const freezeBtn = document.getElementById('freeze-btn');
const grainCountSelect = document.getElementById('grain-count');
const faderContainer = document.getElementById('fader-container');
const fftCanvas = document.getElementById('fft-canvas');
let fftCtx;

// ===== GRAIN PARAMETERS =====
const parameters = [
    { id: 'position', label: 'POSITION', default: 0.5, min: 0, max: 1, step: 0.01 },
    { id: 'size', label: 'SIZE', default: 0.3, min: 0, max: 1, step: 0.01 },
    { id: 'density', label: 'DENSITY', default: 0.5, min: 0, max: 1, step: 0.01 },
    { id: 'texture', label: 'TEXTURE', default: 0.5, min: 0, max: 1, step: 0.01 },
    { id: 'dryWet', label: 'DRY/WET', default: 1.0, min: 0, max: 1, step: 0.01 },
    { id: 'stereoSpread', label: 'STEREO', default: 0.5, min: 0, max: 1, step: 0.01 }
];

// ===== INIT =====
async function init() {
    try {
        statusEl.textContent = 'Creating AudioContext...';
        audioContext = new AudioContext();

        statusEl.textContent = 'Loading AudioWorklet module...';
        await audioContext.audioWorklet.addModule(
            `js/audio/worklets/clouds-prototype.js?v=${Date.now()}`
        );
        console.log('[Clouds Prototype] ✓ AudioWorklet module loaded');

        statusEl.textContent = 'Creating Clouds processor...';
        cloudsNode = new AudioWorkletNode(audioContext, 'clouds-prototype', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2]
        });

        // Message listener for worklet → main thread
        cloudsNode.port.onmessage = (e) => {
            if (e.data.type === 'bufferStatus') {
                const frozen = e.data.frozen ? 'FROZEN' : 'RUNNING';
                const pos = Math.floor(e.data.writeHead / 1000);
                bufferStatusEl.textContent = `${frozen} (${pos}k samples)`;
            }
        };

        statusEl.textContent = 'Setting up analyser...';
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 8192;

        // Audio chain: Clouds → Analyser → Destination
        cloudsNode.connect(analyser);
        analyser.connect(audioContext.destination);

        statusEl.textContent = 'Setting up canvas...';
        fftCtx = fftCanvas.getContext('2d');
        fftCanvas.width = fftCanvas.offsetWidth;
        fftCanvas.height = fftCanvas.offsetHeight;

        statusEl.textContent = 'Ready';
        console.log('[Clouds Prototype] ✓ Init complete');
    } catch (e) {
        console.error('[Clouds Prototype] ✗ Init failed:', e);
        statusEl.textContent = 'FAILED: ' + e.message;
    }
}

// ===== UI SETUP =====
function renderFaders() {
    faderContainer.innerHTML = parameters.map(param => createFaderHTML(param)).join('');
    attachFaderListeners();
}

function createFaderHTML({ id, label, default: defaultValue, min, max, step }) {
    const percent = ((defaultValue - min) / (max - min)) * 100;
    return `
        <div class="fader-container">
            <label class="fader-label">${label}</label>
            <div class="fader-track">
                <div class="fader-fill" id="${id}-fill" style="height: ${percent}%"></div>
                <input
                    type="range"
                    id="${id}"
                    class="fader-input"
                    min="${min}"
                    max="${max}"
                    step="${step}"
                    value="${defaultValue}"
                    orient="vertical"
                />
            </div>
            <div class="fader-value" id="${id}-value">${defaultValue.toFixed(2)}</div>
        </div>
    `;
}

function attachFaderListeners() {
    parameters.forEach(({ id, min, max }) => {
        const fader = document.getElementById(id);
        const fill = document.getElementById(`${id}-fill`);
        const valueDisplay = document.getElementById(`${id}-value`);

        if (!fader) {
            console.warn(`[Clouds Prototype] Fader not found: ${id}`);
            return;
        }

        fader.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            const percent = ((value - min) / (max - min)) * 100;

            fill.style.height = `${percent}%`;
            valueDisplay.textContent = value.toFixed(2);

            // Update AudioParam
            if (cloudsNode) {
                cloudsNode.parameters.get(id).value = value;
            }
        });
    });

    console.log('[Clouds Prototype] Fader listeners attached');
}

// ===== TRANSPORT CONTROLS =====
playBtn.addEventListener('click', async () => {
    if (droneOscillator) {
        console.log('[Clouds Prototype] Drone already playing');
        return;
    }

    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    console.log('[Clouds Prototype] Starting drone (440Hz sine)...');
    droneOscillator = audioContext.createOscillator();
    droneOscillator.type = 'sine';
    droneOscillator.frequency.value = 440;

    // Oscillator → Clouds
    droneOscillator.connect(cloudsNode);
    droneOscillator.start();

    statusEl.textContent = 'Playing - Grain synthesis active';
    playBtn.classList.add('active');
    playBtn.disabled = true;
    stopBtn.disabled = false;
});

stopBtn.addEventListener('click', () => {
    if (!droneOscillator) {
        console.log('[Clouds Prototype] No drone to stop');
        return;
    }

    console.log('[Clouds Prototype] Stopping drone...');
    droneOscillator.stop();
    droneOscillator.disconnect();
    droneOscillator = null;

    statusEl.textContent = 'Stopped';
    playBtn.classList.remove('active');
    playBtn.disabled = false;
    stopBtn.disabled = true;
});

freezeBtn.addEventListener('click', () => {
    if (!cloudsNode) return;

    isFrozen = !isFrozen;
    freezeBtn.classList.toggle('active', isFrozen);

    cloudsNode.port.postMessage({
        type: 'freeze',
        value: isFrozen
    });

    console.log('[Clouds Prototype] Freeze toggled:', isFrozen);
});

grainCountSelect.addEventListener('change', (e) => {
    if (!cloudsNode) return;

    grainCount = parseInt(e.target.value);

    cloudsNode.port.postMessage({
        type: 'setGrainCount',
        value: grainCount
    });

    console.log('[Clouds Prototype] Grain count changed:', grainCount);
});

// ===== FFT VISUALISATION =====
function drawFFT() {
    requestAnimationFrame(drawFFT);

    if (!analyser || !fftCtx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    fftCtx.fillStyle = '#000';
    fftCtx.fillRect(0, 0, fftCanvas.width, fftCanvas.height);

    const barWidth = (fftCanvas.width / bufferLength) * 2.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * fftCanvas.height;

        const hue = (i / bufferLength) * 200;
        fftCtx.fillStyle = `hsl(${hue}, 100%, 50%)`;
        fftCtx.fillRect(x, fftCanvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
    }
}

// ===== CPU MONITORING =====
let lastFrameTime = performance.now();
let cpuSamples = [];

function updateCPU() {
    const now = performance.now();
    const frameDuration = now - lastFrameTime;
    lastFrameTime = now;

    // Target: 16.67ms per frame @ 60fps
    const cpuPercent = Math.min((frameDuration / 16.67) * 100, 100);

    cpuSamples.push(cpuPercent);
    if (cpuSamples.length > 60) {
        cpuSamples.shift();
    }

    const avgCpu = cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length;
    cpuEl.textContent = avgCpu.toFixed(1);

    requestAnimationFrame(updateCPU);
}

// ===== START =====
document.addEventListener('DOMContentLoaded', async () => {
    await init();
    renderFaders();
    drawFFT();
    updateCPU();
    console.log('[Clouds Prototype] ✓ Ready');
});
