// File: js/modules/visualizations/delay.js
// Delay module - Oscilloscope visualization for each delay tap

import { state } from '../../state.js';
import { mapRange } from '../../utils.js';
import { config } from '../../config.js';
import { createThemeGradient } from '../../utils/canvasGradient.js';

// Animation state
let animationRequestId = null;
let animationStartTime = null;

// Draw the delay visualization
export function drawDelay() {
    const canvasEl = document.getElementById('baeng-delay-canvas');
    if (!canvasEl) return;

    // Track elapsed time for WOW/FLUT animation
    if (animationStartTime === null) {
        animationStartTime = performance.now();
    }
    const elapsedTime = (performance.now() - animationStartTime) / 1000; // Convert to seconds

    try {
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

        // Only draw if delay is active
        if (state.delayMix === 0 || !config.delayTapAnalysers || config.delayTapAnalysers.length === 0) {
            return;
        }

        // Calculate delay time for spacing
        const delayTimeValue = state.delaySyncEnabled ? state.delayTime : state.delayTimeFree;
        let delayTimeSeconds;

        if (state.delaySyncEnabled) {
            // SYNC mode: calculate based on tempo and division (matches engine.js DELAY_DIVISIONS)
            const bpm = state.bpm || 120;
            const DELAY_DIVISIONS = [
                1/32, 1/16, 1/12, 1/8, 1/6, 3/16, 1/4, 1/3, 3/8, 1/2, 3/4, 1
            ];
            const divisionIndex = Math.floor((state.delayTime / 100) * (DELAY_DIVISIONS.length - 1));
            const division = DELAY_DIVISIONS[divisionIndex];
            const beatDuration = 60 / bpm;
            delayTimeSeconds = division * (4 * beatDuration); // 4 beats = 1 bar
        } else {
            // FREE mode: exponential scaling
            const normalized = state.delayTimeFree / 100;
            const delayTimeMs = 1 + Math.pow(normalized, 2) * 3999;
            delayTimeSeconds = delayTimeMs / 1000;
        }

        delayTimeSeconds = Math.min(delayTimeSeconds, 5.0);

        // Calculate spacing based on delay TIME (not feedback!)
        // Use logarithmic scaling to map wide delay time range (1ms-5s) to visual spacing
        const minSpacing = 5;  // Very close together for fast delays
        const maxSpacing = width * 0.15; // Max spacing is 15% of canvas width

        // Logarithmic mapping: handles range from 0.001s to 5s
        const minDelayTime = 0.001; // 1ms
        const maxDelayTime = 5.0;   // 5s
        const clampedTime = Math.max(minDelayTime, Math.min(delayTimeSeconds, maxDelayTime));

        // Log scale: log(time/min) / log(max/min)
        const timeNormalized = Math.log(clampedTime / minDelayTime) / Math.log(maxDelayTime / minDelayTime);
        const spacing = minSpacing + (timeNormalized * (maxSpacing - minSpacing));

        // Calculate how many taps to display based on FEEDBACK
        const feedbackNormalized = state.delayFeedback / 100;
        // More feedback = more visible repeats
        const maxVisibleTaps = feedbackNormalized === 0 ? 1 : Math.min(config.maxDelayTaps, Math.ceil(1 + feedbackNormalized * (config.maxDelayTaps - 1)));
        const visibleTaps = Math.max(1, maxVisibleTaps);

        // Draw oscilloscope for each visible tap
        for (let i = 0; i < visibleTaps; i++) {
            if (i >= config.delayTapAnalysers.length) break;

            const analyser = config.delayTapAnalysers[i];
            const tapGain = config.delayTapGains[i];

            // Get waveform data
            const bufferLength = analyser.fftSize;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteTimeDomainData(dataArray);

            // Calculate position and opacity
            const xOffset = spacing * (i + 1);
            const opacity = Math.pow(feedbackNormalized, i + 1) * (state.delayMix / 100);

            // Skip if too faint
            if (opacity < 0.01) continue;

            // Create gradient for this oscilloscope
            const gradient = createThemeGradient(ctx,
                xOffset, 0,
                xOffset, height,
                opacity
            );

            ctx.strokeStyle = gradient;

            // Calculate WOW and FLUT modulation amounts
            const wowAmount = mapRange(state.delayWow, 0, 100, 0, 5); // 0-5px displacement
            const wowFreq = 0.05; // Spatial frequency
            const wowTimeOffset = Math.sin(elapsedTime * 0.5) * 2; // Slow temporal modulation

            const flutterAmount = mapRange(state.delayFlutter, 0, 100, 0, 2.5); // 0-2.5px displacement
            const flutterFreq = 0.2; // Spatial frequency (faster than WOW)
            const flutterTimeOffset = Math.sin(elapsedTime * 5) * 0.3; // Fast temporal modulation

            // Base line width with slight decay for later taps
            const baseLineWidth = 1.5 * Math.pow(0.95, i);
            ctx.lineWidth = baseLineWidth;

            // Draw oscilloscope waveform
            ctx.beginPath();

            const sliceWidth = height / bufferLength;
            let y = 0;

            for (let j = 0; j < bufferLength; j++) {
                // Normalize data to -1 to 1 range
                const v = (dataArray[j] - 128) / 128.0;

                // Map to horizontal displacement (oscilloscope rotated 90 degrees)
                const waveformWidth = Math.min(spacing * 0.8, 40); // Max width for waveform
                let x = xOffset + v * waveformWidth * 0.5;

                // Apply WOW spatial modulation (slow sinusoidal bend)
                const spatialWowOffset = Math.sin(y * wowFreq + i * 0.5 + wowTimeOffset) * wowAmount;
                x += spatialWowOffset;

                // Apply FLUT spatial modulation (fast sinusoidal bend)
                const spatialFlutterOffset = Math.sin(y * flutterFreq + i * 0.8 + flutterTimeOffset) * flutterAmount;
                x += spatialFlutterOffset;

                // Apply FLUT line thickness modulation
                const thicknessMod = 1.0 + Math.sin(y * flutterFreq * 0.75 + i * 0.8 + flutterTimeOffset) * (flutterAmount * 0.3);
                ctx.lineWidth = Math.max(0.5, baseLineWidth * thicknessMod);

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                y += sliceWidth;
            }

            ctx.stroke();

            // Draw center line (axis) for reference
            ctx.strokeStyle = `rgba(${bgR + 30}, ${bgG + 30}, ${bgB + 30}, ${opacity * 0.3})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(xOffset, 0);
            ctx.lineTo(xOffset, height);
            ctx.stroke();
        }
    } catch (e) {
        // Silently handle errors
    }
}

// Animation loop
function animateDelayVisualization() {
    const shouldAnimate = state.delayMix > 0;

    if (shouldAnimate) {
        drawDelay();
        animationRequestId = requestAnimationFrame(animateDelayVisualization);
    } else {
        animationRequestId = null;
    }
}

// Start animation if conditions are met
export function startDelayAnimation() {
    if (state.delayMix > 0 && !animationRequestId) {
        animationRequestId = requestAnimationFrame(animateDelayVisualization);
    }
}

// Stop animation
export function stopDelayAnimation() {
    if (animationRequestId) {
        cancelAnimationFrame(animationRequestId);
        animationRequestId = null;
    }
}

// Initialize delay module
export function initDelay() {
    drawDelay();
    startDelayAnimation();
}
