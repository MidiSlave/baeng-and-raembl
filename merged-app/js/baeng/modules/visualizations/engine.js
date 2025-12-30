// File: js/modules/visualizations/engine.js
// Engine-specific visualizations that react to voice parameters and audio

import { state } from '../../state.js';
import { config } from '../../config.js';
import { EnvelopeFollower } from '../../audio/analysisUtils.js';
import { createThemeGradient } from '../../utils/canvasGradient.js';

let animationFrameId = null;
let envelopeFollower = null;

// Draw engine visualization
export function drawEngine() {
    const canvasEl = document.getElementById('baeng-engine-oscilloscope');
    if (!canvasEl) return;

    const ctx = canvasEl.getContext('2d');
    const width = canvasEl.width;
    const height = canvasEl.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get CSS custom properties for colors
    const styles = getComputedStyle(document.documentElement);
    const bgR = parseInt(styles.getPropertyValue('--bg-canvas-r') || styles.getPropertyValue('--bg-module-r') || '17');
    const bgG = parseInt(styles.getPropertyValue('--bg-canvas-g') || styles.getPropertyValue('--bg-module-g') || '17');
    const bgB = parseInt(styles.getPropertyValue('--bg-canvas-b') || styles.getPropertyValue('--bg-module-b') || '17');

    ctx.fillStyle = `rgb(${bgR}, ${bgG}, ${bgB})`;
    ctx.fillRect(0, 0, width, height);

    // Get current voice
    const voice = state.voices[state.selectedVoice];
    const voiceIndex = state.selectedVoice;

    // Get audio amplitude and waveform data
    let amplitude = 0;
    let waveformData = null;
    if (config.voiceAnalysers && config.voiceAnalysers[state.selectedVoice]) {
        const analyser = config.voiceAnalysers[state.selectedVoice];

        if (!envelopeFollower) {
            envelopeFollower = new EnvelopeFollower(3, 80, 3.0);
        }
        amplitude = envelopeFollower.update(analyser);

        // Get waveform data for shape warping
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);
        waveformData = dataArray;
    }

    // Draw based on voice index (each voice gets a unique shape)
    // Colors are now handled via gradient helper in each draw function
    switch (voiceIndex) {
        case 0:
            drawCircles(ctx, width, height, voice, amplitude, waveformData);
            break;
        case 1:
            drawTriangle(ctx, width, height, voice, amplitude, waveformData);
            break;
        case 2:
            drawSquare(ctx, width, height, voice, amplitude, waveformData);
            break;
        case 3:
            drawParallelogram(ctx, width, height, voice, amplitude, waveformData);
            break;
        case 4:
            drawDiamond(ctx, width, height, voice, amplitude, waveformData);
            break;
        case 5:
            drawHexagon(ctx, width, height, voice, amplitude, waveformData);
            break;
    }
}

// Voice 0: Concentric circles that pulse and warp with waveform
function drawCircles(ctx, w, h, voice, amp, waveformData) {
    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(w, h) / 2 - 5;
    const numRings = 5;
    const warpIntensity = 0.15; // Control how much the waveform affects the shape

    for (let i = 0; i < numRings; i++) {
        const radiusBase = (maxRadius / numRings) * (i + 1);
        const radius = radiusBase + amp * 10;
        const opacity = 0.3 + (amp * 0.4) - (i * 0.05);

        // Create horizontal gradient from left to right of circle
        const gradient = createThemeGradient(ctx,
            cx - radius, cy,  // Left edge of circle
            cx + radius, cy   // Right edge of circle
        );

        ctx.strokeStyle = gradient;
        ctx.globalAlpha = Math.max(0, opacity);
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (waveformData && waveformData.length > 0) {
            // Draw warped circle using waveform data
            const numPoints = 64; // Number of points around the circle
            for (let j = 0; j <= numPoints; j++) {
                const angle = (j / numPoints) * Math.PI * 2;

                // Sample waveform at this angle position
                const waveIndex = Math.floor((j / numPoints) * waveformData.length);
                const waveValue = (waveformData[waveIndex] - 128) / 128.0; // Normalize to -1 to 1

                // Modulate radius based on waveform
                const warpAmount = waveValue * radius * warpIntensity;
                const warpedRadius = radius + warpAmount;

                const x = cx + Math.cos(angle) * warpedRadius;
                const y = cy + Math.sin(angle) * warpedRadius;

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
        } else {
            // Fallback to regular circle if no waveform data
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        }

        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

// Voice 1: Concentric triangles that pulse and warp with waveform
function drawTriangle(ctx, w, h, voice, amp, waveformData) {
    const cx = w / 2;
    const cy = h / 2;
    const maxSize = Math.min(w, h) / 2 - 5;
    const numTriangles = 5;
    const warpIntensity = 0.12;

    for (let i = 0; i < numTriangles; i++) {
        const sizeBase = (maxSize / numTriangles) * (i + 1);
        // Scale up the size to match visual prominence of other shapes
        const size = (sizeBase + amp * 10) * 1.33;
        const opacity = 0.3 + (amp * 0.4) - (i * 0.05);

        // Vertical gradient from top to bottom of triangle
        const gradient = createThemeGradient(ctx,
            cx, cy - size,        // Top of triangle
            cx, cy + size * 0.5   // Bottom of triangle
        );

        ctx.strokeStyle = gradient;
        ctx.globalAlpha = Math.max(0, opacity);
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (waveformData && waveformData.length > 0) {
            // Draw warped triangle using waveform data
            const numPoints = 45; // Points around the triangle perimeter (15 per edge)
            const pointsPerEdge = 15;

            for (let j = 0; j <= numPoints; j++) {
                const edgeIndex = Math.floor(j / pointsPerEdge);
                const edgeProgress = (j % pointsPerEdge) / pointsPerEdge;

                // Define triangle vertices
                const v1 = { x: cx, y: cy - size };
                const v2 = { x: cx - size * 0.866, y: cy + size * 0.5 };
                const v3 = { x: cx + size * 0.866, y: cy + size * 0.5 };

                let baseX, baseY, nextX, nextY;

                if (edgeIndex === 0) {
                    // Top to bottom-left
                    baseX = v1.x + (v2.x - v1.x) * edgeProgress;
                    baseY = v1.y + (v2.y - v1.y) * edgeProgress;
                } else if (edgeIndex === 1) {
                    // Bottom-left to bottom-right
                    baseX = v2.x + (v3.x - v2.x) * edgeProgress;
                    baseY = v2.y + (v3.y - v2.y) * edgeProgress;
                } else {
                    // Bottom-right to top
                    baseX = v3.x + (v1.x - v3.x) * edgeProgress;
                    baseY = v3.y + (v1.y - v3.y) * edgeProgress;
                }

                // Sample waveform
                const waveIndex = Math.floor((j / numPoints) * waveformData.length);
                const waveValue = (waveformData[waveIndex] - 128) / 128.0;

                // Calculate perpendicular offset (toward/away from center)
                const dx = baseX - cx;
                const dy = baseY - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const normalX = dist > 0 ? dx / dist : 0;
                const normalY = dist > 0 ? dy / dist : 0;

                const warpAmount = waveValue * size * warpIntensity;
                const x = baseX + normalX * warpAmount;
                const y = baseY + normalY * warpAmount;

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
        } else {
            // Fallback to regular triangle
            ctx.moveTo(cx, cy - size);
            ctx.lineTo(cx - size * 0.866, cy + size * 0.5);
            ctx.lineTo(cx + size * 0.866, cy + size * 0.5);
            ctx.closePath();
        }

        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

// Voice 2: Concentric squares that pulse and warp with waveform
function drawSquare(ctx, w, h, voice, amp, waveformData) {
    const cx = w / 2;
    const cy = h / 2;
    const maxSize = Math.min(w, h) / 2 - 5;
    const numSquares = 5;
    const warpIntensity = 0.12;

    for (let i = 0; i < numSquares; i++) {
        const sizeBase = (maxSize / numSquares) * (i + 1);
        const size = sizeBase + amp * 10;
        const opacity = 0.3 + (amp * 0.4) - (i * 0.05);

        // Diagonal gradient from top-left to bottom-right
        const gradient = createThemeGradient(ctx,
            cx - size, cy - size,  // Top-left corner
            cx + size, cy + size   // Bottom-right corner
        );

        ctx.strokeStyle = gradient;
        ctx.globalAlpha = Math.max(0, opacity);
        ctx.lineWidth = 2;

        if (waveformData && waveformData.length > 0) {
            // Draw warped square using waveform data
            const numPoints = 60; // Points around the square perimeter (15 per edge)
            const pointsPerEdge = 15;

            ctx.beginPath();
            for (let j = 0; j <= numPoints; j++) {
                const edgeIndex = Math.floor(j / pointsPerEdge);
                const edgeProgress = (j % pointsPerEdge) / pointsPerEdge;

                let baseX, baseY;

                if (edgeIndex === 0) {
                    // Top edge (left to right)
                    baseX = cx - size + (size * 2) * edgeProgress;
                    baseY = cy - size;
                } else if (edgeIndex === 1) {
                    // Right edge (top to bottom)
                    baseX = cx + size;
                    baseY = cy - size + (size * 2) * edgeProgress;
                } else if (edgeIndex === 2) {
                    // Bottom edge (right to left)
                    baseX = cx + size - (size * 2) * edgeProgress;
                    baseY = cy + size;
                } else {
                    // Left edge (bottom to top)
                    baseX = cx - size;
                    baseY = cy + size - (size * 2) * edgeProgress;
                }

                // Sample waveform
                const waveIndex = Math.floor((j / numPoints) * waveformData.length);
                const waveValue = (waveformData[waveIndex] - 128) / 128.0;

                // Calculate perpendicular offset (toward/away from center)
                const dx = baseX - cx;
                const dy = baseY - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const normalX = dist > 0 ? dx / dist : 0;
                const normalY = dist > 0 ? dy / dist : 0;

                const warpAmount = waveValue * size * warpIntensity;
                const x = baseX + normalX * warpAmount;
                const y = baseY + normalY * warpAmount;

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
            ctx.stroke();
        } else {
            // Fallback to regular square
            ctx.strokeRect(cx - size, cy - size, size * 2, size * 2);
        }

        ctx.globalAlpha = 1.0;
    }
}

// Voice 3: Concentric parallelograms that pulse and warp with waveform
function drawParallelogram(ctx, w, h, voice, amp, waveformData) {
    const cx = w / 2;
    const cy = h / 2;
    const maxSize = Math.min(w, h) / 2 - 5;
    const numShapes = 5;
    const skew = 0.3; // Skew factor for parallelogram
    const warpIntensity = 0.12;

    for (let i = 0; i < numShapes; i++) {
        const sizeBase = (maxSize / numShapes) * (i + 1);
        const size = sizeBase + amp * 10;
        const opacity = 0.3 + (amp * 0.4) - (i * 0.05);

        // Horizontal gradient following the skew
        const skewOffset = size * skew;
        const gradient = createThemeGradient(ctx,
            cx - size + skewOffset, cy,  // Left side
            cx + size + skewOffset, cy   // Right side
        );

        ctx.strokeStyle = gradient;
        ctx.globalAlpha = Math.max(0, opacity);
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (waveformData && waveformData.length > 0) {
            // Draw warped parallelogram using waveform data
            const numPoints = 60; // Points around the perimeter (15 per edge)
            const pointsPerEdge = 15;

            for (let j = 0; j <= numPoints; j++) {
                const edgeIndex = Math.floor(j / pointsPerEdge);
                const edgeProgress = (j % pointsPerEdge) / pointsPerEdge;

                // Define parallelogram vertices
                const v1 = { x: cx - size + skewOffset, y: cy - size };
                const v2 = { x: cx + size + skewOffset, y: cy - size };
                const v3 = { x: cx + size - skewOffset, y: cy + size };
                const v4 = { x: cx - size - skewOffset, y: cy + size };

                let baseX, baseY;

                if (edgeIndex === 0) {
                    // Top edge (v1 to v2)
                    baseX = v1.x + (v2.x - v1.x) * edgeProgress;
                    baseY = v1.y + (v2.y - v1.y) * edgeProgress;
                } else if (edgeIndex === 1) {
                    // Right edge (v2 to v3)
                    baseX = v2.x + (v3.x - v2.x) * edgeProgress;
                    baseY = v2.y + (v3.y - v2.y) * edgeProgress;
                } else if (edgeIndex === 2) {
                    // Bottom edge (v3 to v4)
                    baseX = v3.x + (v4.x - v3.x) * edgeProgress;
                    baseY = v3.y + (v4.y - v3.y) * edgeProgress;
                } else {
                    // Left edge (v4 to v1)
                    baseX = v4.x + (v1.x - v4.x) * edgeProgress;
                    baseY = v4.y + (v1.y - v4.y) * edgeProgress;
                }

                // Sample waveform
                const waveIndex = Math.floor((j / numPoints) * waveformData.length);
                const waveValue = (waveformData[waveIndex] - 128) / 128.0;

                // Calculate perpendicular offset (toward/away from center)
                const dx = baseX - cx;
                const dy = baseY - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const normalX = dist > 0 ? dx / dist : 0;
                const normalY = dist > 0 ? dy / dist : 0;

                const warpAmount = waveValue * size * warpIntensity;
                const x = baseX + normalX * warpAmount;
                const y = baseY + normalY * warpAmount;

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
        } else {
            // Fallback to regular parallelogram
            ctx.moveTo(cx - size + skewOffset, cy - size);
            ctx.lineTo(cx + size + skewOffset, cy - size);
            ctx.lineTo(cx + size - skewOffset, cy + size);
            ctx.lineTo(cx - size - skewOffset, cy + size);
            ctx.closePath();
        }

        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

// Voice 4: Concentric diamonds/rhombus that pulse and warp with waveform
function drawDiamond(ctx, w, h, voice, amp, waveformData) {
    const cx = w / 2;
    const cy = h / 2;
    const maxSize = Math.min(w, h) / 2 - 5;
    const numDiamonds = 5;
    const warpIntensity = 0.12;

    for (let i = 0; i < numDiamonds; i++) {
        const sizeBase = (maxSize / numDiamonds) * (i + 1);
        const size = sizeBase + amp * 10;
        const opacity = 0.3 + (amp * 0.4) - (i * 0.05);

        // Vertical gradient from top to bottom
        const gradient = createThemeGradient(ctx,
            cx, cy - size,  // Top point
            cx, cy + size   // Bottom point
        );

        ctx.strokeStyle = gradient;
        ctx.globalAlpha = Math.max(0, opacity);
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (waveformData && waveformData.length > 0) {
            // Draw warped diamond using waveform data
            const numPoints = 60; // Points around the perimeter (15 per edge)
            const pointsPerEdge = 15;

            for (let j = 0; j <= numPoints; j++) {
                const edgeIndex = Math.floor(j / pointsPerEdge);
                const edgeProgress = (j % pointsPerEdge) / pointsPerEdge;

                // Define diamond vertices (square rotated 45 degrees)
                const v1 = { x: cx, y: cy - size };       // Top
                const v2 = { x: cx + size, y: cy };       // Right
                const v3 = { x: cx, y: cy + size };       // Bottom
                const v4 = { x: cx - size, y: cy };       // Left

                let baseX, baseY;

                if (edgeIndex === 0) {
                    // Top to right edge
                    baseX = v1.x + (v2.x - v1.x) * edgeProgress;
                    baseY = v1.y + (v2.y - v1.y) * edgeProgress;
                } else if (edgeIndex === 1) {
                    // Right to bottom edge
                    baseX = v2.x + (v3.x - v2.x) * edgeProgress;
                    baseY = v2.y + (v3.y - v2.y) * edgeProgress;
                } else if (edgeIndex === 2) {
                    // Bottom to left edge
                    baseX = v3.x + (v4.x - v3.x) * edgeProgress;
                    baseY = v3.y + (v4.y - v3.y) * edgeProgress;
                } else {
                    // Left to top edge
                    baseX = v4.x + (v1.x - v4.x) * edgeProgress;
                    baseY = v4.y + (v1.y - v4.y) * edgeProgress;
                }

                // Sample waveform
                const waveIndex = Math.floor((j / numPoints) * waveformData.length);
                const waveValue = (waveformData[waveIndex] - 128) / 128.0;

                // Calculate perpendicular offset (toward/away from center)
                const dx = baseX - cx;
                const dy = baseY - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const normalX = dist > 0 ? dx / dist : 0;
                const normalY = dist > 0 ? dy / dist : 0;

                const warpAmount = waveValue * size * warpIntensity;
                const x = baseX + normalX * warpAmount;
                const y = baseY + normalY * warpAmount;

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
        } else {
            // Fallback to regular diamond
            ctx.moveTo(cx, cy - size);
            ctx.lineTo(cx + size, cy);
            ctx.lineTo(cx, cy + size);
            ctx.lineTo(cx - size, cy);
            ctx.closePath();
        }

        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

// Voice 5: Concentric hexagons that pulse and warp with waveform
function drawHexagon(ctx, w, h, voice, amp, waveformData) {
    const cx = w / 2;
    const cy = h / 2;
    const maxSize = Math.min(w, h) / 2 - 5;
    const numHexagons = 5;
    const warpIntensity = 0.12;

    for (let i = 0; i < numHexagons; i++) {
        const sizeBase = (maxSize / numHexagons) * (i + 1);
        const size = sizeBase + amp * 10;
        const opacity = 0.3 + (amp * 0.4) - (i * 0.05);

        // Vertical gradient from top to bottom of hexagon
        const gradient = createThemeGradient(ctx,
            cx, cy - size,  // Top of hexagon
            cx, cy + size   // Bottom of hexagon
        );

        ctx.strokeStyle = gradient;
        ctx.globalAlpha = Math.max(0, opacity);
        ctx.lineWidth = 2;
        ctx.beginPath();

        if (waveformData && waveformData.length > 0) {
            // Draw warped hexagon using waveform data
            const numPoints = 72; // Points around the perimeter (12 per edge)
            const pointsPerEdge = 12;

            for (let j = 0; j <= numPoints; j++) {
                const edgeIndex = Math.floor(j / pointsPerEdge);
                const edgeProgress = (j % pointsPerEdge) / pointsPerEdge;

                // Calculate hexagon vertices
                const vertices = [];
                for (let k = 0; k < 6; k++) {
                    const angle = (Math.PI / 3) * k - Math.PI / 2; // Start from top
                    vertices.push({
                        x: cx + size * Math.cos(angle),
                        y: cy + size * Math.sin(angle)
                    });
                }

                // Get current and next vertex
                const v1 = vertices[edgeIndex % 6];
                const v2 = vertices[(edgeIndex + 1) % 6];

                // Interpolate along the edge
                const baseX = v1.x + (v2.x - v1.x) * edgeProgress;
                const baseY = v1.y + (v2.y - v1.y) * edgeProgress;

                // Sample waveform
                const waveIndex = Math.floor((j / numPoints) * waveformData.length);
                const waveValue = (waveformData[waveIndex] - 128) / 128.0;

                // Calculate perpendicular offset (toward/away from center)
                const dx = baseX - cx;
                const dy = baseY - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const normalX = dist > 0 ? dx / dist : 0;
                const normalY = dist > 0 ? dy / dist : 0;

                const warpAmount = waveValue * size * warpIntensity;
                const x = baseX + normalX * warpAmount;
                const y = baseY + normalY * warpAmount;

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
        } else {
            // Fallback to regular hexagon
            for (let j = 0; j < 6; j++) {
                const angle = (Math.PI / 3) * j - Math.PI / 2; // Start from top
                const x = cx + size * Math.cos(angle);
                const y = cy + size * Math.sin(angle);

                if (j === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }
            ctx.closePath();
        }

        ctx.stroke();
        ctx.globalAlpha = 1.0;
    }
}

// Animation loop
function animateEngine() {
    drawEngine();
    animationFrameId = requestAnimationFrame(animateEngine);
}

// Start animation
export function startEngineAnimation() {
    if (animationFrameId === null) {
        animateEngine();
    }
}

// Stop animation
export function stopEngineAnimation() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

// Initialize engine visualization
export function initEngine() {
    drawEngine();
    startEngineAnimation();
}
