// File: js/modules/reverb.js
// Reverb Oscilloscope - Post-reverb waveform visualization
import { colors, config } from '../config.js';

let animationFrameId = null;

// Draw the reverb oscilloscope (post-reverb waveform)
export function drawReverb() {
    const canvasEl = document.getElementById('raembl-reverb-canvas');
    if (!canvasEl) return;

    const ctx = canvasEl.getContext('2d');
    const width = canvasEl.width;
    const height = canvasEl.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = colors.canvasBg;
    ctx.fillRect(0, 0, width, height);

    // Check if reverb analyser is available
    if (!config.reverbAnalyser || !config.audioContext) {
        return;
    }

    // Get time-domain data from reverb analyser
    const bufferLength = config.reverbAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    config.reverbAnalyser.getByteTimeDomainData(dataArray);

    // Get theme color
    const { r, g, b } = colors.yellowRGB;

    // Draw waveform
    ctx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        // Convert from 0-255 to -1 to 1
        const v = (dataArray[i] - 128) / 128.0;

        // Map to canvas height (centered vertically)
        const y = (height / 2) + (v * height / 2);

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    ctx.stroke();
}

// Animation loop
function animateReverb() {
    drawReverb();
    animationFrameId = requestAnimationFrame(animateReverb);
}

// Start animation
export function startReverbAnimation() {
    if (animationFrameId === null) {
        animateReverb();
    }
}

// Stop animation
export function stopReverbAnimation() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// Initialize reverb module
export function initReverb() {
    // Initial visualization
    drawReverb();
    // Start animation
    startReverbAnimation();
}
