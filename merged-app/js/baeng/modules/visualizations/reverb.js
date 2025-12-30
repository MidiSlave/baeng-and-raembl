// File: js/modules/visualizations/reverb.js
// Reverb Oscilloscope - Vertical cascade visualization showing reverb tail decay

import { state } from '../../state.js';
import { config } from '../../config.js';
import { createThemeGradient } from '../../utils/canvasGradient.js';

let animationFrameId = null;

// Calculate RMS level from audio data
function calculateRMS(dataArray) {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128.0;
        sum += normalized * normalized;
    }
    return Math.sqrt(sum / dataArray.length);
}

// Draw subtle axis reference line
function drawAxisLine(ctx, x0, y0, x1, y1, opacity) {
    const styles = getComputedStyle(document.documentElement);
    const bgR = parseInt(styles.getPropertyValue('--bg-canvas-r') || styles.getPropertyValue('--bg-module-r') || '34');
    const bgG = parseInt(styles.getPropertyValue('--bg-canvas-g') || styles.getPropertyValue('--bg-module-g') || '34');
    const bgB = parseInt(styles.getPropertyValue('--bg-canvas-b') || styles.getPropertyValue('--bg-module-b') || '34');

    ctx.strokeStyle = `rgba(${bgR + 30}, ${bgG + 30}, ${bgB + 30}, ${opacity})`;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
}

// Draw the reverb oscilloscope (vertical cascade showing decay tail)
export function drawReverb() {
    const canvasEl = document.getElementById('baeng-reverb-canvas');
    if (!canvasEl) return;

    const ctx = canvasEl.getContext('2d');
    const width = canvasEl.width;
    const height = canvasEl.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get CSS custom properties for colors
    const styles = getComputedStyle(document.documentElement);
    const bgR = parseInt(styles.getPropertyValue('--bg-canvas-r') || styles.getPropertyValue('--bg-module-r') || '34');
    const bgG = parseInt(styles.getPropertyValue('--bg-canvas-g') || styles.getPropertyValue('--bg-module-g') || '34');
    const bgB = parseInt(styles.getPropertyValue('--bg-canvas-b') || styles.getPropertyValue('--bg-module-b') || '34');

    ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
    ctx.fillRect(0, 0, width, height);

    // Check if reverb analyser is available
    if (!config.reverbAnalyser || !config.audioContext) {
        return;
    }

    // Get time-domain data from reverb analyser
    const bufferLength = config.reverbAnalyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    config.reverbAnalyser.getByteTimeDomainData(dataArray);

    // Check if there's actual audio signal (silence detection)
    const rms = calculateRMS(dataArray);
    const SILENCE_THRESHOLD = 0.01;
    if (rms < SILENCE_THRESHOLD) {
        // No audio being sent to reverb - show empty canvas
        return;
    }

    // Get reverb parameters from state
    const decayParam = state.reverbDecay / 100; // 0-1
    const diffusionParam = state.reverbDiffusion / 100; // 0-1
    const preDelayParam = state.reverbPreDelay / 100; // 0-1
    const dampingParam = state.reverbDamping / 100; // 0-1

    // Number of cascade instances based on DECAY (6-16 instances)
    const minInstances = 6;
    const maxInstances = 16;
    const numInstances = Math.floor(minInstances + (decayParam * (maxInstances - minInstances)));

    // Calculate pre-delay offset (visual gap on left, max 15% of width)
    const preDelayOffset = preDelayParam * (width * 0.15);

    // Uniform spacing between instances (like delay taps)
    const baseSpacing = 7; // pixels

    // DIFFUSION: Dropout probability (high diffusion = scattered/broken lines)
    const dropoutProbability = diffusionParam * 0.6; // 0-60% pixel dropout

    // DAMPING: Amplitude reduction (high damping = less vertical movement)
    const amplitudeScale = 1.0 - (dampingParam * 0.5); // 100% to 50% movement

    // Draw each cascade instance
    for (let i = 0; i < numInstances; i++) {
        // Calculate X position with uniform spacing
        const xOffset = preDelayOffset + (baseSpacing * (i + 1));

        // Skip if off-canvas
        if (xOffset > width) continue;

        // DECAY: Simple exponential opacity fade
        const opacity = Math.pow(0.85, i);

        // Skip if too faint
        if (opacity < 0.02) continue;

        // Calculate line width (thin, getting thinner) - ræmbL technique
        const baseLineWidth = 1.5;
        const lineWidth = baseLineWidth * Math.pow(0.9, i);
        const clampedLineWidth = Math.max(0.5, lineWidth);

        // Create vertical gradient for this instance
        const gradient = createThemeGradient(ctx, xOffset, 0, xOffset, height, opacity);

        // Draw vertical oscilloscope waveform
        ctx.strokeStyle = gradient;
        ctx.lineWidth = clampedLineWidth;
        ctx.beginPath();

        const sliceHeight = height / bufferLength;
        let y = 0;
        let pathStarted = false;

        // Calculate waveform width
        const waveformWidth = Math.min(baseSpacing * 0.8, 40);

        for (let j = 0; j < bufferLength; j++) {
            // DIFFUSION: Random pixel dropout (creates grainy/chatter effect at low diffusion)
            if (Math.random() < dropoutProbability) {
                // Skip this pixel - creates break in line
                if (pathStarted) {
                    ctx.stroke();
                    ctx.beginPath();
                    pathStarted = false;
                }
                y += sliceHeight;
                continue;
            }

            // Sample offset for visual variety (different instances show different samples)
            const sampleIndex = (j + i * Math.floor(bufferLength / numInstances)) % bufferLength;
            const v = (dataArray[sampleIndex] - 128) / 128.0;

            // DAMPING: Apply amplitude reduction (less vertical movement)
            const dampedV = v * amplitudeScale;

            // Horizontal displacement (oscilloscope rotated 90°)
            const x = xOffset + dampedV * waveformWidth * 0.5;

            if (!pathStarted) {
                ctx.moveTo(x, y);
                pathStarted = true;
            } else {
                ctx.lineTo(x, y);
            }

            y += sliceHeight;
        }

        // Stroke any remaining path
        if (pathStarted) {
            ctx.stroke();
        }

        // Draw center axis line (subtle reference)
        drawAxisLine(ctx, xOffset, 0, xOffset, height, opacity * 0.3);
    }
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
