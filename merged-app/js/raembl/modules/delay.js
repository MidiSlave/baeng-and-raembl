// File: js/modules/delay.js
// Delay module - Oscilloscope visualization with wow/flutter/saturation effects
import { state } from '../state.js';
import { mapRange, simpleNoise } from '../utils.js';
import { delayDivisionsValues } from '../audio/effects.js';
import { colors, config } from '../config.js';
import { isGradientModeActive, getGradientColor1RGB, getGradientColor2RGB } from '../../shared/gradient-utils.js';

// Animation state
let animationRequestId = null;
let animationStartTime = performance.now();

// Draw the delay visualization
export function drawDelay() {
    const canvasEl = document.getElementById('raembl-delay-canvas');
    if (!canvasEl) return;

    try {
        const ctx = canvasEl.getContext('2d');
        const width = canvasEl.width;
        const height = canvasEl.height;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = colors.canvasBgAlt;
        ctx.fillRect(0, 0, width, height);

        // Only draw if delay is active
        if (state.delayMix === 0 || !config.delayTapAnalysers || config.delayTapAnalysers.length === 0) {
            return;
        }

        // Calculate delay time for spacing
        let currentDelayTimeSeconds;
        if (state.delaySyncEnabled) {
            const index = Math.min(Math.floor(state.delayTime / (100 / delayDivisionsValues.length)), delayDivisionsValues.length - 1);
            const division = delayDivisionsValues[index];
            const bps = (state.bpm > 0) ? state.bpm / 60 : 0;
            currentDelayTimeSeconds = (bps > 0) ? (division / bps) : 2.0;
        } else {
            const minMs = 1;
            const maxMs = 4000;
            const freeMs = mapRange(state.delayTimeFree, 0, 100, minMs, maxMs, true);
            currentDelayTimeSeconds = freeMs / 1000.0;
        }
        currentDelayTimeSeconds = Math.max(0.001, currentDelayTimeSeconds);

        // Calculate spacing based on delay TIME (logarithmic)
        const minSpacing = 5;  // Very close together for fast delays
        const maxSpacing = width * 0.15; // Max spacing is 15% of canvas width

        // Logarithmic mapping: handles range from 0.001s to 5s
        const minDelayTime = 0.001; // 1ms
        const maxDelayTime = 5.0;   // 5s
        const clampedTime = Math.max(minDelayTime, Math.min(currentDelayTimeSeconds, maxDelayTime));

        // Log scale: log(time/min) / log(max/min)
        const timeNormalized = Math.log(clampedTime / minDelayTime) / Math.log(maxDelayTime / minDelayTime);
        const spacing = minSpacing + (timeNormalized * (maxSpacing - minSpacing));

        // Calculate how many taps to display based on FEEDBACK
        const feedbackNormalized = state.feedback / 100;
        // More feedback = more visible repeats
        const maxVisibleTaps = feedbackNormalized === 0 ? 1 : Math.min(config.maxDelayTaps, Math.ceil(1 + feedbackNormalized * (config.maxDelayTaps - 1)));
        const visibleTaps = Math.max(1, maxVisibleTaps);

        const baseDelayOpacity = state.delayMix / 100;
        const opacityDecayBase = mapRange(feedbackNormalized, 0, 1, 0.6, 0.995);
        const thicknessDecayBase = mapRange(feedbackNormalized, 0, 1, 0.85, 0.998);

        // Time-based animation for wow/flutter
        const currentTime = performance.now();
        const elapsedTime = (currentTime - animationStartTime) / 1000; // Convert to seconds
        const wowTimeOffset = Math.sin(elapsedTime * 0.5) * 2; // Slow sine wave for wow
        const flutterTimeOffset = Math.sin(elapsedTime * 5) * 0.3; // Fast sine wave for flutter

        // SAT parameters
        const saturationNormalized = state.saturation / 100;
        const breakupThreshold = saturationNormalized * 0.5; // More severe threshold
        const breakupIntensityBase = saturationNormalized * 2.5; // Very aggressive

        // Draw oscilloscope for each visible tap
        for (let i = 0; i < visibleTaps; i++) {
            if (i >= config.delayTapAnalysers.length) break;

            const analyser = config.delayTapAnalysers[i];

            // Get waveform data
            const bufferLength = analyser.fftSize;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteTimeDomainData(dataArray);

            // Calculate position and opacity
            const xOffset = spacing * (i + 1);
            const opacityDecay = Math.pow(opacityDecayBase, i + 1);
            const opacity = baseDelayOpacity * opacityDecay;

            // Skip if too faint or off screen
            if (opacity < 0.01 || xOffset > width) continue;

            const echoProgress = i / Math.max(1, visibleTaps - 1);

            // Use theme color (interpolate gradient in gradient mode)
            let r, g, b;
            if (isGradientModeActive()) {
                const c1 = getGradientColor1RGB();
                const c2 = getGradientColor2RGB();
                r = Math.round(c1.r + (c2.r - c1.r) * echoProgress);
                g = Math.round(c1.g + (c2.g - c1.g) * echoProgress);
                b = Math.round(c1.b + (c2.b - c1.b) * echoProgress);
            } else {
                const themeRGB = colors.yellowRGB;
                r = themeRGB.r;
                g = themeRGB.g;
                b = themeRGB.b;
            }
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacity})`;

            const baseThickness = 1.5;
            const thicknessDecay = Math.pow(thicknessDecayBase, i);
            const currentBaseThickness = Math.max(0.5, baseThickness * thicknessDecay);

            // Wow and flutter parameters
            const wowAmount = mapRange(state.wow, 0, 100, 0, 5);
            const wowFreq = 0.05;
            const flutterAmount = mapRange(state.flutter, 0, 100, 0, 2.5);
            const flutterFreq = 0.2;

            // SAT breakup intensity for this tap
            const breakupIntensity = breakupIntensityBase * echoProgress;

            ctx.beginPath();
            let currentSegmentStarted = false;

            // Draw oscilloscope waveform (vertical with horizontal displacement)
            for (let j = 0; j < bufferLength; j++) {
                // Normalize data to -1 to 1 range
                const v = (dataArray[j] - 128) / 128.0;

                // Map to vertical position
                const y = (j / bufferLength) * height;

                // Calculate horizontal displacement from waveform value
                const waveformWidth = Math.min(spacing * 0.8, 40); // Max width for waveform
                let xPos = xOffset + v * waveformWidth * 0.5;

                // Apply wow offset
                const spatialWowOffset = Math.sin(y * wowFreq + i * 0.5 + wowTimeOffset) * wowAmount;
                xPos += spatialWowOffset;

                // Apply flutter offset and thickness modulation
                const spatialFlutterOffset = Math.sin(y * flutterFreq + i * 0.8 + flutterTimeOffset) * flutterAmount;
                const thicknessMod = 1.0 + Math.sin(y * flutterFreq * 0.75 + i * 0.8 + flutterTimeOffset) * (flutterAmount * 0.3);
                ctx.lineWidth = Math.max(0.5, currentBaseThickness * thicknessMod);
                xPos += spatialFlutterOffset;

                // Add sharp horizontal spikes for saturation distortion
                if (saturationNormalized > 0.01) {
                    const spikeNoise = simpleNoise(y * 0.15 + i * 2.5, elapsedTime * 3.5);
                    const spikeAmount = saturationNormalized * echoProgress * 15; // Sharp horizontal distortion
                    xPos += spikeNoise * spikeAmount;
                }

                // Aggressive SAT breakup using noise
                let shouldDraw = true;
                let shouldDrawDistortion = false;
                if (saturationNormalized > 0.01) {
                    const noiseValue = (simpleNoise(y * 0.12 + i * 3, elapsedTime * 3) + 1.0) * 0.5;
                    shouldDraw = noiseValue > (breakupThreshold + breakupIntensity * 0.15);
                    shouldDrawDistortion = !shouldDraw && noiseValue > 0.25; // Draw distortion where line breaks
                }

                if (shouldDraw) {
                    if (!currentSegmentStarted) {
                        ctx.moveTo(xPos, y);
                        currentSegmentStarted = true;
                    } else {
                        ctx.lineTo(xPos, y);
                    }
                } else {
                    // Break the path - start a new segment next time
                    if (currentSegmentStarted) {
                        ctx.stroke();
                        ctx.beginPath();
                        currentSegmentStarted = false;
                    }

                    // Draw bigger distortion pixels where line breaks up
                    if (shouldDrawDistortion) {
                        const distortionNoise = (simpleNoise(xPos * 0.4 + y * 0.25, elapsedTime * 4 + i) + 1.0) * 0.5;
                        const distortionDensity = saturationNormalized * 0.7;
                        if (distortionNoise > (1 - distortionDensity)) {
                            // Bigger pixels for intense distortion (3-5px)
                            const pixelSize = Math.floor(3 + saturationNormalized * 2);
                            const greyValue = Math.floor(60 + distortionNoise * 40);
                            ctx.fillStyle = `rgba(${greyValue}, ${greyValue}, ${greyValue}, ${opacity * 0.8})`;
                            ctx.fillRect(xPos - pixelSize/2, y - pixelSize/2, pixelSize, pixelSize);
                        }
                    }
                }
            }

            // Stroke any remaining path
            if (currentSegmentStarted) {
                ctx.stroke();
            }

            // Draw center line (axis) for reference
            const bgR = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas-r') || '28');
            const bgG = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas-g') || '28');
            const bgB = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas-b') || '26');
            ctx.strokeStyle = `rgba(${bgR + 30}, ${bgG + 30}, ${bgB + 30}, ${opacity * 0.3})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(xOffset, 0);
            ctx.lineTo(xOffset, height);
            ctx.stroke();
        }
    } catch (e) {
        console.error("Error drawing delay:", e);
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
