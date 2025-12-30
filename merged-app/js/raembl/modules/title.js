// File: js/modules/title.js
// Title oscilloscope visualization with X-Y mode and phosphor persistence
import { config, colors } from '../config.js';

let canvas, ctx;
let animationFrameId = null;
let dataArrayLeft = null;
let dataArrayRight = null;
let bufferLength = 0;

// Oscilloscope parameters
const AMPLIFICATION = 5.0; // Aggressive signal amplification (increased)
const PERSISTENCE = 0.15; // Phosphor fade rate (0=infinite trail, 1=no trail)
const DEPTH_LAYERS = 3; // Number of 3D depth layers
const LAYER_SCALES = [1.0, 0.85, 0.7]; // Scale for each depth layer
const LAYER_OPACITIES = [1.0, 0.6, 0.3]; // Opacity for each depth layer

// Phase delay and modulation
const PHASE_DELAY_MS = 50; // Delay right channel by milliseconds for rotation
const MOD_FREQUENCY = 0.5; // Frequency of modulation effect (Hz)
const MOD_DEPTH = 0.15; // Depth of modulation (0-1)
const Z_MODULATION = true; // Enable z-axis line thickness modulation

// Phase delay buffer
let phaseDelayBuffer = [];
let maxDelayFrames = 10; // ~170ms at 60fps
let modTime = 0;

// Initialize the title canvas
export function initTitle() {
    canvas = document.getElementById('raembl-title-canvas');
    if (!canvas) {
        console.error('Title canvas not found');
        return;
    }

    ctx = canvas.getContext('2d');

    // Set canvas resolution for retina displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    // Wait for analysers to be ready
    if (config.analyserLeft && config.analyserRight) {
        bufferLength = config.analyserLeft.frequencyBinCount;
        dataArrayLeft = new Uint8Array(bufferLength);
        dataArrayRight = new Uint8Array(bufferLength);
        startAnimation();
    } else {
        console.warn('Analysers not ready, retrying...');
        setTimeout(initTitle, 100);
    }
}

// Start the animation loop
function startAnimation() {
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(draw);
    }
}

// Draw the oscilloscope visualization with X-Y mode and phosphor persistence
function draw() {
    if (!canvas || !ctx) return;

    const width = canvas.getBoundingClientRect().width;
    const height = canvas.getBoundingClientRect().height;

    // Step 1: Draw the yellow "RÆMBL" text on clean canvas
    ctx.clearRect(0, 0, width, height);
    ctx.font = '900 40px "Archivo Black", sans-serif';
    ctx.fillStyle = colors.yellow;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RÆMBL', width / 2, height / 2);

    // Step 2: Set composite mode to draw only within text bounds
    ctx.globalCompositeOperation = 'source-atop';

    // Step 3: Apply phosphor persistence fade (now only within text)
    const scopeColor = colors.oscilloscope;
    const isLight = scopeColor === '#ffffff';
    const rgb = isLight ? '255, 255, 255' : '0, 0, 0';
    ctx.fillStyle = `rgba(${rgb}, ${PERSISTENCE})`;
    ctx.fillRect(0, 0, width, height);

    // Get stereo audio data from analysers
    if (config.analyserLeft && config.analyserRight && dataArrayLeft && dataArrayRight) {
        config.analyserLeft.getByteTimeDomainData(dataArrayLeft);
        config.analyserRight.getByteTimeDomainData(dataArrayRight);

        // Store current right channel data in phase delay buffer
        phaseDelayBuffer.push(new Uint8Array(dataArrayRight));
        if (phaseDelayBuffer.length > maxDelayFrames) {
            phaseDelayBuffer.shift();
        }

        // Get delayed right channel (or current if buffer not full)
        const delayedDataRight = phaseDelayBuffer.length >= maxDelayFrames
            ? phaseDelayBuffer[0]
            : dataArrayRight;

        // Update modulation time
        modTime += MOD_FREQUENCY * 0.016; // Assuming ~60fps

        // Step 4: Draw multiple depth layers for 3D effect
        for (let layer = DEPTH_LAYERS - 1; layer >= 0; layer--) {
            const scale = LAYER_SCALES[layer];
            const opacity = LAYER_OPACITIES[layer];

            // Sample every Nth point for performance
            const step = Math.floor(bufferLength / 250);

            let prevX = null, prevY = null;

            for (let i = 0; i < bufferLength; i += step) {
                // Get normalized values (0-1, centered at 0.5)
                let xVal = dataArrayLeft[i] / 255.0;
                let yVal = delayedDataRight[i] / 255.0;

                // Center values
                xVal = (xVal - 0.5);
                yVal = (yVal - 0.5);

                // Apply frequency modulation for warping effect
                const modPhase = modTime + (i / bufferLength) * Math.PI * 2;
                const modX = Math.sin(modPhase) * MOD_DEPTH;
                const modY = Math.cos(modPhase * 1.3) * MOD_DEPTH;
                xVal += modX;
                yVal += modY;

                // Amplify signal
                xVal *= AMPLIFICATION;
                yVal *= AMPLIFICATION;

                // Apply layer scaling from center
                xVal *= scale;
                yVal *= scale;

                // Map to canvas coordinates
                xVal = (xVal + 0.5) * width;
                yVal = (yVal + 0.5) * height;

                // Calculate amplitude for z-axis modulation
                const amplitude = Math.abs(dataArrayLeft[i] - 128) / 128.0;

                // Draw line segment with z-axis modulation
                if (prevX !== null && prevY !== null) {
                    const baseWidth = 1.5 + (layer * 0.5);
                    const lineWidth = Z_MODULATION
                        ? baseWidth * (0.5 + amplitude * 1.5)
                        : baseWidth;

                    ctx.strokeStyle = `rgba(${rgb}, ${opacity})`;
                    ctx.lineWidth = lineWidth;
                    ctx.beginPath();
                    ctx.moveTo(prevX, prevY);
                    ctx.lineTo(xVal, yVal);
                    ctx.stroke();
                }

                prevX = xVal;
                prevY = yVal;
            }
        }

        // Reset composite mode
        ctx.globalCompositeOperation = 'source-over';
    }

    // Continue animation
    animationFrameId = requestAnimationFrame(draw);
}

// Stop animation (for cleanup if needed)
export function stopTitle() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}
