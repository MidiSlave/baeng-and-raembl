// File: js/modules/factors.js
// Factors module
import { state } from '../state.js';
import { colors } from '../config.js';
import { createThemeGradient, isGradientModeActive, getGradientColor1RGB, getGradientColor2RGB, rgbToRgba, getThemeColorRGB } from '../../shared/gradient-utils.js';

// Generate euclidean rhythm pattern
export function generateEuclideanRhythm(steps, fills) {
    if (steps <= 0) return [];
    if (fills >= steps) return Array(steps).fill(true);
    if (fills <= 0) return Array(steps).fill(false);
    
    steps = Math.max(1, Math.min(steps, 32));
    fills = Math.max(0, Math.min(fills, steps));
    
    let pattern = Array(steps).fill(false);
    const stepSize = steps / fills;
    
    for (let i = 0; i < fills; i++) {
        pattern[Math.floor(i * stepSize)] = true;
    }
    
    return pattern;
}

// Rotate pattern by x steps
export function rotatePattern(pattern, rotation) {
    if (!pattern || pattern.length === 0) return [];
    const length = pattern.length;
    if (length === 0) return [];
    
    const normalizedRotation = ((rotation % length) + length) % length;
    if (normalizedRotation === 0) return [...pattern];
    
    const rotated = [...pattern];
    for (let i = 0; i < length; i++) {
        rotated[i] = pattern[(i + normalizedRotation) % length];
    }
    
    return rotated;
}

// Generate a pattern using euclidean distribution based on probability
export function generateProbabilityPattern(length, probability) {
    if (length <= 0) return [];
    probability = Math.max(0, Math.min(probability, 100));

    // Convert probability percentage to number of pulses
    const pulses = Math.round((probability / 100) * length);

    // Use euclidean distribution for consistent, rhythmically pleasing patterns
    return generateEuclideanRhythm(length, pulses);
}

// Update the factors pattern based on current state
export function updateFactorsPattern() {
    let currentSteps = Math.max(1, Math.min(state.steps, 32)); 
    let currentFills = Math.max(0, Math.min(state.fills, currentSteps)); 
    let currentRotation = Math.max(0, Math.min(state.rotation, currentSteps - 1));
    
    // Ensure fills is always capped at steps (and update UI)
    if (state.fills > currentSteps) {
        state.fills = currentSteps;
        // Update the FILLS fader visually
        const fillsFader = document.querySelector('#raembl-factors .fader-container:nth-child(2) .fader-fill');
        const fillsValue = document.querySelector('#raembl-factors .fader-container:nth-child(2) .fader-value');
        if (fillsFader) {
            fillsFader.style.height = `${(currentFills / 32) * 100}%`;
        }
        if (fillsValue) {
            fillsValue.textContent = currentFills.toString();
        }
    }
    
    // Generate patterns
    let gates = generateEuclideanRhythm(currentSteps, currentFills);
    gates = rotatePattern(gates, currentRotation);
    state.gatePattern = gates;

    // Generate decoration patterns using euclidean distribution based on counts
    // Accents, slides, and trills are distributed across filled steps only
    const accentBase = generateEuclideanRhythm(currentFills, state.accentAmt || 0);
    const slideBase = generateEuclideanRhythm(currentFills, state.slideAmt || 0);
    const trillBase = generateEuclideanRhythm(currentFills, state.trillAmt || 0);

    // Expand decoration patterns to match gate pattern length
    // Each decoration[n] maps to the nth gated step position
    state.accentPattern = new Array(currentSteps).fill(false);
    state.slidePattern = new Array(currentSteps).fill(false);
    state.trillPattern = new Array(currentSteps).fill(false);

    let fillIndex = 0;
    for (let i = 0; i < currentSteps; i++) {
        if (gates[i]) {
            state.accentPattern[i] = accentBase[fillIndex] || false;
            state.slidePattern[i] = slideBase[fillIndex] || false;
            state.trillPattern[i] = trillBase[fillIndex] || false;
            fillIndex++;
        }
    }

    // Update display
    updatePatternDisplay();
}

// Canvas sizing and coordinate calculation
let canvas, ctx, size, radiusX, radiusY, centerX, centerY;

// Animation state
let animationFrameId = null;
let rotationOffset = 0;
let targetRotationOffset = 0;
let lastAnimationTime = 0;
let trillAnimationTime = 0;

// Camera state for interactive 3D rotation
let cameraTiltX = 0; // Degrees, unlimited (pitch)
let cameraTiltY = 0; // Degrees, unlimited (yaw)
let cameraTiltZ = 0; // Degrees, unlimited (roll/spin) - NEW
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartTiltX = 0;
let dragStartTiltY = 0;
let dragStartTiltZ = 0;

// Animation constants
const TRILL_BOUNCE_FREQ = 18; // Hz - rapid bounce frequency
const CAMERA_SENSITIVITY = 0.5; // Degrees per pixel dragged

function initCanvas() {
    canvas = document.getElementById('raembl-factors-canvas');
    if (!canvas) return false;

    ctx = canvas.getContext('2d');
    resizeCanvas();
    return true;
}

function resizeCanvas() {
    if (!canvas) return;

    // Set canvas size to match other module visualizations (60px height standard)
    canvas.width = 210;
    canvas.height = 60;

    size = Math.min(canvas.width, canvas.height);
    centerX = canvas.width / 2;
    centerY = canvas.height / 2;

    // Very shallow ellipse to fit all 32 steps within canvas bounds
    radiusX = canvas.width * 0.43;  // Horizontal radius (with padding)
    radiusY = canvas.height * 0.35; // Vertical radius (very shallow)
}

function getStepCoordinates(index, steps) {
    const angle = (index / steps) * 2 * Math.PI - Math.PI / 2 + rotationOffset;

    // Base ellipse coordinates (2D)
    let x = radiusX * Math.cos(angle);
    let y = radiusY * Math.sin(angle);
    let z = 0;

    // Apply camera rotations (if in animated mode)
    if (state.factorsAnimationMode === 'animated') {
        // Convert degrees to radians
        const tiltXRad = cameraTiltX * Math.PI / 180;
        const tiltYRad = cameraTiltY * Math.PI / 180;
        const tiltZRad = cameraTiltZ * Math.PI / 180;

        // Rotation around Z-axis first (roll/spin around center)
        const x1 = x * Math.cos(tiltZRad) - y * Math.sin(tiltZRad);
        const y1 = x * Math.sin(tiltZRad) + y * Math.cos(tiltZRad);

        // Rotation around X-axis (pitch - vertical tilt)
        const y2 = y1 * Math.cos(tiltXRad) - z * Math.sin(tiltXRad);
        const z2 = y1 * Math.sin(tiltXRad) + z * Math.cos(tiltXRad);

        // Rotation around Y-axis (yaw - horizontal tilt)
        const x3 = x1 * Math.cos(tiltYRad) + z2 * Math.sin(tiltYRad);
        const z3 = -x1 * Math.sin(tiltYRad) + z2 * Math.cos(tiltYRad);

        x = x3;
        y = y2;
        z = z3;
    }

    // Translate to canvas position (no clamping - allow off-screen)
    return {
        x: centerX + x,
        y: centerY + y,
        z: z
    };
}

// Calculate perspective scale based ONLY on Z-depth (distance from camera)
function getPerspectiveScale(z) {
    if (state.factorsAnimationMode === 'static') {
        return 1;
    }

    // Pure depth-based perspective
    // Z ranges approximately from -radiusY to +radiusY after rotations
    // Closer (positive Z) = larger
    // Farther (negative Z) = smaller

    const referenceDepth = radiusY * 2; // Normalization factor
    const depthFactor = 1.5; // How much depth affects size

    // Linear perspective: scale increases with positive Z
    const scale = 1.0 + (z / referenceDepth) * depthFactor;

    // Clamp to visible range
    return Math.max(0.3, Math.min(2.5, scale));
}

// Update the pattern display in the UI
export function updatePatternDisplay() {
    // Detect stale canvas (element removed from DOM during FX mode switch)
    if (canvas && !document.body.contains(canvas)) {
        canvas = null;
        ctx = null;
    }

    if (!canvas && !initCanvas()) {
        return;
    }

    if (!state.gatePattern || state.gatePattern.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const steps = state.gatePattern.length;
    // Use theme gradient when in gradient mode, otherwise solid colour
    const themeGradient = createThemeGradient(ctx, 0, 0, canvas.width, 0);
    const baseRadius = size * 0.04; // Base radius for step circles (increased for visibility)

    // Get start colour for fade-to-transparent effects (trill/slide lines)
    const fadeStartColor = isGradientModeActive()
        ? rgbToRgba(getGradientColor1RGB(), 1.0)
        : colors.yellow;

    // Draw Slide & Trill Lines First (underneath the step nodes)
    for (let i = 0; i < steps; i++) {
        const isGated = state.gatePattern[i];
        const isSlide = state.slidePattern && i < state.slidePattern.length && state.slidePattern[i];
        const isTrill = state.trillPattern && i < state.trillPattern.length && state.trillPattern[i];

        if (!isGated) continue;

        const startPos = getStepCoordinates(i, steps);
        const endPos = getStepCoordinates((i + 1) % steps, steps);

        // Draw Trill "Bend" - ANIMATED bouncing curved path
        if (isTrill) {
            const midX = (startPos.x + endPos.x) / 2;
            const midY = (startPos.y + endPos.y) / 2;
            const vecX = midX - centerX;
            const vecY = midY - centerY;
            const vecMag = Math.sqrt(vecX * vecX + vecY * vecY);
            const bendFactor = size * 0.08;

            // Animated bounce: oscillate control point vertically
            const bouncePhase = Math.sin(trillAnimationTime * TRILL_BOUNCE_FREQ * 2 * Math.PI);
            const bounceAmplitude = size * 0.06; // Bounce height
            const animatedBendFactor = bendFactor + (bouncePhase * bounceAmplitude);

            const controlX = midX + (vecX / vecMag) * animatedBendFactor;
            const controlY = midY + (vecY / vecMag) * animatedBendFactor;

            const trillGradient = ctx.createLinearGradient(startPos.x, startPos.y, endPos.x, endPos.y);
            trillGradient.addColorStop(0.2, fadeStartColor);
            trillGradient.addColorStop(1, 'transparent');

            ctx.beginPath();
            ctx.moveTo(startPos.x, startPos.y);
            ctx.quadraticCurveTo(controlX, controlY, endPos.x, endPos.y);
            ctx.strokeStyle = trillGradient;
            // Solid line (no dashes) for smoother animation
            const lineIntensity = 0.7 + Math.abs(bouncePhase) * 0.3; // Vary thickness
            ctx.lineWidth = baseRadius * 2 * lineIntensity;
            ctx.stroke();
        }
        // Draw Slide "Blur" - gradient line (only if no trill)
        else if (isSlide) {
            const gradient = ctx.createLinearGradient(startPos.x, startPos.y, endPos.x, endPos.y);
            gradient.addColorStop(0.2, fadeStartColor);
            gradient.addColorStop(1, 'transparent');

            ctx.beginPath();
            ctx.moveTo(startPos.x, startPos.y);
            ctx.lineTo(endPos.x, endPos.y);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = baseRadius * 2;
            ctx.stroke();
        }
    }

    // Draw each step node
    for (let i = 0; i < steps; i++) {
        const isGated = state.gatePattern[i];
        const isAccented = state.accentPattern && i < state.accentPattern.length && state.accentPattern[i];
        const isCurrentStep = i === state.currentStepIndex;

        const { x, y, z } = getStepCoordinates(i, steps);

        // Apply perspective scaling based ONLY on Z-depth
        const perspectiveScale = state.factorsAnimationMode === 'animated' ? getPerspectiveScale(z) : 1;

        // Depth-based opacity: farther dots are dimmer
        const depthOpacity = state.factorsAnimationMode === 'animated'
            ? Math.max(0.3, Math.min(1.0, 1.0 + z / (radiusY * 2)))
            : 1.0;

        // Apply opacity
        ctx.globalAlpha = depthOpacity;

        if (isCurrentStep && state.isPlaying) {
            // Active step with glow - MUCH LARGER for visibility
            const activeScaling = isAccented ? 3.0 : 2.5; // Extra scaling for active step
            const stepRadius = baseRadius * perspectiveScale * activeScaling;
            ctx.beginPath();
            ctx.arc(x, y, stepRadius, 0, 2 * Math.PI);
            ctx.fillStyle = themeGradient;
            ctx.shadowColor = fadeStartColor; // Shadow needs solid colour
            ctx.shadowBlur = 20 * perspectiveScale; // Increased glow
            ctx.fill();
            ctx.shadowBlur = 0;
        } else if (isGated) {
            // Gated step - circle (larger if accented)
            const stepRadius = (isAccented ? baseRadius * 1.5 : baseRadius) * perspectiveScale;
            ctx.beginPath();
            ctx.arc(x, y, stepRadius, 0, 2 * Math.PI);
            ctx.fillStyle = themeGradient;
            ctx.fill();
        } else {
            // Empty step - single pixel (scaled in animated mode)
            const pixelSize = perspectiveScale;
            ctx.fillStyle = themeGradient;
            ctx.fillRect(x - pixelSize/2, y - pixelSize/2, pixelSize, pixelSize);
        }

        // Reset opacity
        ctx.globalAlpha = 1.0;
    }
}

// Animation loop for rotating visualization
function animateRotation(timestamp) {
    if (state.factorsAnimationMode !== 'animated') {
        lastAnimationTime = 0;
        animationFrameId = null;
        return;
    }

    // Don't continue if canvas is stale (removed from DOM during FX mode switch)
    if (canvas && !document.body.contains(canvas)) {
        animationFrameId = null;
        return;
    }

    // Calculate delta time
    if (lastAnimationTime === 0) {
        lastAnimationTime = timestamp;
    }
    const deltaTime = timestamp - lastAnimationTime;
    lastAnimationTime = timestamp;

    // Calculate rotation speed based on BPM only (independent of LENGTH parameter)
    // One full rotation (2π) per 4 beats
    const beatsPerRotation = 4;
    const msPerRotation = (60000 / state.bpm) * beatsPerRotation;
    const rotationPerMs = (Math.PI * 2) / msPerRotation;
    const rotationDelta = rotationPerMs * deltaTime;

    // Rotate continuously in one direction
    rotationOffset -= rotationDelta; // Negative for clockwise rotation

    // Update trill animation time (in seconds)
    trillAnimationTime += deltaTime * 0.001;

    // Update display
    updatePatternDisplay();

    // Continue animation
    animationFrameId = requestAnimationFrame(animateRotation);
}

// Start or stop animation based on mode and play state
function updateAnimationState() {
    const shouldAnimate = state.factorsAnimationMode === 'animated';

    // Always cancel any existing animation first to handle race conditions
    // (stale frames may have scheduled new animations after cleanup)
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }

    if (shouldAnimate) {
        lastAnimationTime = 0; // Reset time tracking
        animationFrameId = requestAnimationFrame(animateRotation);
    } else {
        lastAnimationTime = 0; // Reset time tracking
        if (state.factorsAnimationMode === 'static') {
            rotationOffset = 0;
            targetRotationOffset = 0;
        }
        updatePatternDisplay();
    }
}

// Export function to restart animation when play state changes
export function onPlayStateChange() {
    updateAnimationState();
}

// Cleanup function - call before DOM re-render to prevent stale animation frames
export function cleanupFactors() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    canvas = null;
    ctx = null;
}

// Mouse event handlers for interactive camera control
function handleMouseDown(e) {
    if (state.factorsAnimationMode !== 'animated') return;

    isDragging = true;
    const rect = canvas.getBoundingClientRect();
    dragStartX = e.clientX - rect.left;
    dragStartY = e.clientY - rect.top;
    dragStartTiltX = cameraTiltX;
    dragStartTiltY = cameraTiltY;
    dragStartTiltZ = cameraTiltZ;
    canvas.style.cursor = 'grabbing';
}

function handleMouseMove(e) {
    if (!isDragging || state.factorsAnimationMode !== 'animated') return;

    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const deltaX = currentX - dragStartX;
    const deltaY = currentY - dragStartY;

    if (e.shiftKey) {
        // Shift held: Z-axis rotation (roll/spin around center)
        cameraTiltZ = dragStartTiltZ + deltaX * CAMERA_SENSITIVITY;
        // No limits - allow full 360° rotation
    } else {
        // Normal: X and Y axis rotation (pitch/yaw)
        cameraTiltY = dragStartTiltY + deltaX * CAMERA_SENSITIVITY;
        cameraTiltX = dragStartTiltX + deltaY * CAMERA_SENSITIVITY;
        // No limits - allow full 360° rotation
    }
}

function handleMouseUp() {
    if (isDragging) {
        isDragging = false;
        if (canvas) {
            canvas.style.cursor = state.factorsAnimationMode === 'animated' ? 'grab' : 'default';
        }
    }
}

// Toggle visualization mode
function toggleVisualizationMode() {
    const button = document.getElementById('raembl-factors-viz-toggle');
    if (!button) return;

    state.factorsAnimationMode = state.factorsAnimationMode === 'static' ? 'animated' : 'static';

    // Reset camera angles when toggling modes
    if (state.factorsAnimationMode === 'static') {
        cameraTiltX = 0;
        cameraTiltY = 0;
        cameraTiltZ = 0; // Reset roll/spin
    }

    // Update button appearance
    if (state.factorsAnimationMode === 'animated') {
        button.classList.add('active');
        button.textContent = '■';
        if (canvas) canvas.style.cursor = 'grab';
    } else {
        button.classList.remove('active');
        button.textContent = '▶';
        if (canvas) canvas.style.cursor = 'default';
    }

    updateAnimationState();
}

// Initialize factors module
export function initFactors() {
    // Reset canvas reference to force re-initialization
    canvas = null;
    ctx = null;

    // Initialize the pattern on load
    updateFactorsPattern();

    // Setup toggle button (remove old handler by cloning node)
    const toggleButton = document.getElementById('raembl-factors-viz-toggle');
    if (toggleButton) {
        // Clone node to remove all event listeners
        const newToggleButton = toggleButton.cloneNode(true);
        toggleButton.parentNode.replaceChild(newToggleButton, toggleButton);

        newToggleButton.addEventListener('click', toggleVisualizationMode);
        // Initialize button state
        if (state.factorsAnimationMode === 'static') {
            newToggleButton.textContent = '▶';
            newToggleButton.classList.remove('active');
        } else {
            newToggleButton.textContent = '■';
            newToggleButton.classList.add('active');
        }
    }

    // Re-grab canvas (updateFactorsPattern should have initialized it)
    canvas = document.getElementById('raembl-factors-canvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        // Setup mouse event listeners for interactive camera control
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);
        // Set initial cursor
        canvas.style.cursor = state.factorsAnimationMode === 'animated' ? 'grab' : 'default';
    }

    updateAnimationState();
}

// --- PPMod Update Functions ---
// These are called by perParamMod.js when modulating FACTORS parameters

export function updateFactorsSteps(steps) {
    state.steps = Math.max(1, Math.round(steps));
    updateFactorsPattern();
}

export function updateFactorsFills(fills) {
    state.fills = Math.max(1, Math.round(fills));
    updateFactorsPattern();
}

export function updateFactorsRotation(rotation) {
    state.rotation = Math.round(rotation);
    updateFactorsPattern();
}

export function updateFactorsAccentAmt(accentAmt) {
    state.accentAmt = Math.max(0, Math.round(accentAmt));
    updateFactorsPattern();
}

export function updateFactorsSlideAmt(slideAmt) {
    state.slideAmt = Math.max(0, Math.round(slideAmt));
    updateFactorsPattern();
}

export function updateFactorsTrillAmt(trillAmt) {
    state.trillAmt = Math.max(0, Math.round(trillAmt));
    updateFactorsPattern();
}

export function updateFactorsGateLength(gateLength) {
    state.gateLength = Math.max(5, Math.min(100, gateLength));
}