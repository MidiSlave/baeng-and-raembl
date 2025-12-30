/**
 * File: merged-app/js/shared/components/LEDRingKnob.js
 * LEDRingKnob - Canvas-based LED Ring Knob UI Component
 *
 * Based on led-ring-test prototype with:
 * - Class wrapper for reusability
 * - Drag interaction built-in
 * - onChange callback
 * - Value display integration
 * - Continuous, bipolar, and discrete modes
 * - Modulation visualization
 * - Theme colour and gradient mode support
 */

import {
    isGradientModeActive,
    isLightModeActive,
    getThemeColorRGB,
    getGradientColor1RGB,
    getGradientColor2RGB,
    getCanvasBackgroundColors
} from '../gradient-utils.js';

// Static registry to track all LEDRingKnob instances for theme updates
const ledRingKnobInstances = new Set();
let themeListenerInitialised = false;

/**
 * Initialise global theme change listener (called once)
 */
function initThemeListener() {
    if (themeListenerInitialised) return;
    themeListenerInitialised = true;

    document.addEventListener('themeChanged', () => {
        // Re-render all LEDRingKnob instances
        ledRingKnobInstances.forEach(instance => {
            instance.render();
        });
    });
}

// Constants
const LED_COUNT = 21;
const CANVAS_SIZE = 100; // Internal canvas resolution
const RING_RADIUS = 38; // LED ring radius in canvas units
const LED_RADIUS = 4; // Individual LED radius
const CENTRE_RADIUS = 12; // Centre knob radius

// Angles
const ARC_SPAN_DEGREES = 315; // 21/24 * 360
const START_ANGLE_RAD = (-157.5 - 90) * (Math.PI / 180); // Start at bottom-left
const LED_ANGLE_STEP = (ARC_SPAN_DEGREES / LED_COUNT) * (Math.PI / 180);

// Default colours (used when theme not available)
const DEFAULT_THEME_HUE = 45; // Yellow

/**
 * Get current theme colour as RGB
 * @returns {{r: number, g: number, b: number}}
 */
function getThemeRGB() {
    return getThemeColorRGB();
}

/**
 * Interpolate between two RGB colours
 * @param {Object} c1 - First colour {r, g, b}
 * @param {Object} c2 - Second colour {r, g, b}
 * @param {number} t - Interpolation factor 0-1
 * @returns {Object} Interpolated colour {r, g, b}
 */
function lerpRGB(c1, c2, t) {
    return {
        r: Math.round(c1.r + (c2.r - c1.r) * t),
        g: Math.round(c1.g + (c2.g - c1.g) * t),
        b: Math.round(c1.b + (c2.b - c1.b) * t)
    };
}

/**
 * Get LED colour based on position in ring (supports gradient mode)
 * @param {number} ledIndex - LED index 0-20
 * @returns {Object} Colour {r, g, b}
 */
function getLEDColor(ledIndex) {
    if (isGradientModeActive()) {
        const color1 = getGradientColor1RGB();
        const color2 = getGradientColor2RGB();
        const t = ledIndex / (LED_COUNT - 1);
        return lerpRGB(color1, color2, t);
    } else {
        return getThemeRGB();
    }
}

// Pre-calculate LED positions
const LED_POSITIONS = calculateLEDPositions();

function calculateLEDPositions() {
    const positions = [];
    const centreX = CANVAS_SIZE / 2;
    const centreY = CANVAS_SIZE / 2;

    for (let i = 0; i < LED_COUNT; i++) {
        const angle = START_ANGLE_RAD + (i * LED_ANGLE_STEP);
        positions.push({
            x: centreX + Math.cos(angle) * RING_RADIUS,
            y: centreY + Math.sin(angle) * RING_RADIUS,
            angle: angle
        });
    }

    return positions;
}

/**
 * Draw a single LED with glow effect (RGB version)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} brightness - 0.0 to 1.0
 * @param {Object} color - RGB colour {r, g, b}
 */
function drawLED(ctx, x, y, brightness, color) {
    let r, g, b;

    if (color && typeof color === 'object') {
        r = color.r; g = color.g; b = color.b;
    } else {
        // Fallback to default theme colour
        const themeRGB = getThemeRGB();
        r = themeRGB.r; g = themeRGB.g; b = themeRGB.b;
    }

    // Glow effect (radial gradient)
    if (brightness > 0.1) {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, LED_RADIUS * 3);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${brightness * 0.6})`);
        gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${brightness * 0.3})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, LED_RADIUS * 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // LED body - adjust brightness by mixing with background
    // In light mode, unlit LEDs should be grey, not black
    const isLight = isLightModeActive();
    const dimFactor = 0.15 + brightness * 0.85;

    let bodyR, bodyG, bodyB;
    if (isLight) {
        // Light mode: blend from grey (unlit) to full colour (lit)
        // Unlit grey: rgb(180, 180, 180), lit: full theme colour
        const unlitGrey = 180;
        bodyR = Math.round(unlitGrey + (r - unlitGrey) * brightness);
        bodyG = Math.round(unlitGrey + (g - unlitGrey) * brightness);
        bodyB = Math.round(unlitGrey + (b - unlitGrey) * brightness);
    } else {
        // Dark mode: dim towards black
        bodyR = Math.round(r * dimFactor);
        bodyG = Math.round(g * dimFactor);
        bodyB = Math.round(b * dimFactor);
    }

    ctx.fillStyle = `rgb(${bodyR}, ${bodyG}, ${bodyB})`;
    ctx.beginPath();
    ctx.arc(x, y, LED_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Highlight on bright LEDs
    if (brightness > 0.5) {
        ctx.fillStyle = `rgba(255, 255, 255, ${brightness * 0.4})`;
        ctx.beginPath();
        ctx.arc(x - LED_RADIUS * 0.3, y - LED_RADIUS * 0.3, LED_RADIUS * 0.35, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Draw the centre knob body
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 */
function drawCentre(ctx) {
    const centreX = CANVAS_SIZE / 2;
    const centreY = CANVAS_SIZE / 2;
    const bgColors = getCanvasBackgroundColors();

    // Centre knob background
    ctx.fillStyle = bgColors.bg;
    ctx.beginPath();
    ctx.arc(centreX, centreY, CENTRE_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = bgColors.border;
    ctx.lineWidth = 1;
    ctx.stroke();
}

/**
 * Calculate LED brightness for unipolar value
 */
function calculateUnipolarLEDStates(value, min, max) {
    const normalised = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const litCount = Math.round(normalised * LED_COUNT);

    return LED_POSITIONS.map((_, i) => i < litCount ? 1.0 : 0.1);
}

/**
 * Calculate LED brightness for bipolar value (centre-zero)
 */
function calculateBipolarLEDStates(value, min, max) {
    const centre = (max + min) / 2;
    const centreIndex = Math.floor(LED_COUNT / 2); // LED 10 (0-indexed)

    const states = new Array(LED_COUNT).fill(null).map((_, i) => ({
        brightness: 0.1,
        color: getLEDColor(i),
        isNegative: false
    }));

    if (value >= centre) {
        // Positive: fill from centre rightward
        const deviation = (value - centre) / (max - centre);
        const litCount = Math.round(deviation * (LED_COUNT - centreIndex));

        for (let i = centreIndex; i < centreIndex + litCount && i < LED_COUNT; i++) {
            states[i] = { brightness: 1.0, color: getLEDColor(i), isNegative: false };
        }
    } else {
        // Negative: fill from centre leftward
        const deviation = (centre - value) / (centre - min);
        const litCount = Math.round(deviation * centreIndex);

        for (let i = centreIndex - 1; i >= centreIndex - litCount && i >= 0; i--) {
            states[i] = { brightness: 1.0, color: getLEDColor(i), isNegative: false };
        }
    }

    return states;
}

/**
 * Calculate LED states for discrete selection
 * @param {number} selectedIndex - Currently selected option (0-based)
 * @param {number} totalOptions - Total number of options
 */
function calculateDiscreteLEDStates(selectedIndex, totalOptions) {
    const states = new Array(LED_COUNT).fill(0.1); // All dim

    // For many options (>10), use continuous arc display
    if (totalOptions > 10) {
        const normalised = selectedIndex / (totalOptions - 1);
        const litCount = Math.round(normalised * LED_COUNT);
        return LED_POSITIONS.map((_, i) => i < litCount ? 1.0 : 0.1);
    }

    // Distribute options evenly across the 21 LEDs
    const ledsPerOption = LED_COUNT / totalOptions;

    for (let opt = 0; opt < totalOptions; opt++) {
        // Calculate which LEDs belong to this option
        const startLED = Math.floor(opt * ledsPerOption);
        const endLED = Math.floor((opt + 1) * ledsPerOption);
        const centreLED = Math.floor((startLED + endLED) / 2);

        if (opt === selectedIndex) {
            // Light up the centre LED(s) for selected option
            const zoneSize = endLED - startLED;
            if (zoneSize >= 3) {
                if (centreLED > 0) states[centreLED - 1] = 0.4;
                states[centreLED] = 1.0;
                if (centreLED < LED_COUNT - 1) states[centreLED + 1] = 0.4;
            } else if (zoneSize >= 2) {
                states[startLED] = 1.0;
                if (startLED + 1 < LED_COUNT) states[startLED + 1] = 0.6;
            } else {
                states[startLED] = 1.0;
            }
        } else {
            // Dim marker for unselected options
            states[centreLED] = 0.2;
        }
    }

    return states;
}

export class LEDRingKnob {
    /**
     * Create a new LEDRingKnob instance
     * @param {HTMLElement} container - The .led-ring-knob container element
     * @param {Object} options - Configuration options
     * @param {string} [options.mode='continuous'] - 'continuous', 'bipolar', or 'discrete'
     * @param {number} [options.min=0] - Minimum value
     * @param {number} [options.max=100] - Maximum value
     * @param {number} [options.value=50] - Initial value
     * @param {number|null} [options.step=null] - Step size (null = continuous)
     * @param {Array<string>} [options.discreteOptions] - Labels for discrete mode
     * @param {Function} [options.onChange] - Callback when value changes
     * @param {Function} [options.formatValue] - Custom value formatter
     * @param {string} [options.paramId] - Parameter ID for state binding
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            mode: options.mode ?? 'continuous',
            min: options.min ?? 0,
            max: options.max ?? 100,
            value: options.value ?? 50,
            step: options.step ?? null,
            discreteOptions: options.discreteOptions ?? null,
            onChange: options.onChange ?? (() => {}),
            formatValue: options.formatValue ?? null,
            paramId: options.paramId ?? null,
            voiceParam: options.voiceParam ?? false,
            onControlAllChange: options.onControlAllChange ?? null,
            ...options
        };

        this.value = this.options.value;
        this.isDragging = false;
        this._modState = { active: false };

        // Store bound event handlers for proper cleanup
        this._boundHandlers = {
            mouseDown: this.handleMouseDown.bind(this),
            mouseMove: this.handleMouseMove.bind(this),
            mouseUp: this.handleMouseUp.bind(this),
            touchStart: this.handleTouchStart.bind(this),
            touchMove: this.handleTouchMove.bind(this),
            touchEnd: this.handleTouchEnd.bind(this)
        };

        this.init();
    }

    /**
     * Initialise the component
     */
    init() {
        // Ensure global theme listener is set up
        initThemeListener();

        // Register this instance for theme updates
        ledRingKnobInstances.add(this);

        // Create canvas if not present
        let canvas = this.container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.width = CANVAS_SIZE;
            canvas.height = CANVAS_SIZE;
            this.container.appendChild(canvas);
        }
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Find value display (may be outside container)
        const parent = this.container.closest('.knob-container');
        this.valueDisplay = parent?.querySelector('.knob-value');

        // Store paramId if provided
        if (this.options.paramId) {
            this.container.dataset.paramId = this.options.paramId;
        }

        // Set mode data attribute
        this.container.dataset.mode = this.options.mode;

        // Setup events
        this.setupEvents();

        // Initial render
        this.render();
        this.updateValueDisplay();
    }

    /**
     * Setup mouse and touch event listeners
     */
    setupEvents() {
        this.container.addEventListener('mousedown', this._boundHandlers.mouseDown);
        this.container.addEventListener('touchstart', this._boundHandlers.touchStart, { passive: false });

        document.addEventListener('mousemove', this._boundHandlers.mouseMove);
        document.addEventListener('mouseup', this._boundHandlers.mouseUp);
        document.addEventListener('touchmove', this._boundHandlers.touchMove, { passive: false });
        document.addEventListener('touchend', this._boundHandlers.touchEnd);
    }

    /**
     * Handle mouse down
     */
    handleMouseDown(e) {
        e.preventDefault();
        // Detect Control All modifier (Cmd on Mac, Ctrl on Windows/Linux)
        const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform);
        const controlAllActive = (isMac ? e.metaKey : e.ctrlKey) || false;
        this.startDrag(e.clientY, controlAllActive);
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
        e.preventDefault();
        // Detect Control All modifier (Cmd on Mac, Ctrl on Windows/Linux)
        const isMac = /Mac|iPhone|iPod|iPad/.test(navigator.platform);
        const controlAllActive = (isMac ? e.metaKey : e.ctrlKey) || false;
        this.startDrag(e.touches[0].clientY, controlAllActive);
    }

    /**
     * Start drag operation
     */
    startDrag(startY, controlAllActive = false) {
        this.isDragging = true;
        this._dragStartY = startY;
        this._dragStartValue = this.value;
        this._controlAllActive = controlAllActive && this.options.voiceParam;
        this.container.classList.add('dragging');

        // Visual feedback for Control All
        if (this._controlAllActive) {
            document.body.classList.add('control-all-active');
            document.body.style.cursor = 'crosshair';
            this.container.classList.add('control-all-dragging');
        }
    }

    /**
     * Handle mouse move
     */
    handleMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this.updateFromDrag(e.clientY);
    }

    /**
     * Handle touch move
     */
    handleTouchMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this.updateFromDrag(e.touches[0].clientY);
    }

    /**
     * Update value from drag
     */
    updateFromDrag(currentY) {
        const deltaY = this._dragStartY - currentY;
        const range = this.options.max - this.options.min;

        // Sensitivity: 200px drag = full range
        const sensitivity = range / 200;
        let newValue = this._dragStartValue + deltaY * sensitivity;

        // Apply stepping
        if (this.options.step !== null) {
            newValue = Math.round(newValue / this.options.step) * this.options.step;
        }

        this.setValue(newValue);
    }

    /**
     * Handle mouse/touch up
     */
    handleMouseUp() {
        this.endDrag();
    }

    handleTouchEnd() {
        this.endDrag();
    }

    /**
     * End drag operation
     */
    endDrag() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.container.classList.remove('dragging');

        // Clean up Control All visual feedback
        if (this._controlAllActive) {
            document.body.classList.remove('control-all-active');
            document.body.style.cursor = '';
            this.container.classList.remove('control-all-dragging');
        }
        this._controlAllActive = false;
    }

    /**
     * Set the knob value
     * @param {number} value - The value to set
     * @param {boolean} [notify=true] - Whether to trigger onChange callback
     */
    setValue(value, notify = true) {
        // Apply stepping
        if (this.options.step !== null) {
            value = Math.round(value / this.options.step) * this.options.step;
        }

        // Clamp to range
        value = Math.max(this.options.min, Math.min(this.options.max, value));
        this.value = value;

        // Render and update display
        this.render();
        this.updateValueDisplay();

        // Trigger callback
        if (notify) {
            // Route to Control All callback if active
            if (this._controlAllActive && this.options.onControlAllChange) {
                this.options.onControlAllChange(value, this);
            } else {
                this.options.onChange(value, this);
            }
        }
    }

    /**
     * Set value without triggering onChange callback
     * @param {number} value - The value to set
     */
    setValueWithoutCallback(value) {
        this.setValue(value, false);
    }

    /**
     * Get the current value
     * @returns {number}
     */
    getValue() {
        return this.value;
    }

    /**
     * Update the min/max range
     * @param {number} min - New minimum value
     * @param {number} max - New maximum value
     */
    updateRange(min, max) {
        this.options.min = min;
        this.options.max = max;
        this.setValue(this.value, false);
    }

    /**
     * Set the mode
     * @param {'continuous'|'bipolar'|'discrete'} mode
     */
    setMode(mode) {
        this.options.mode = mode;
        this.container.dataset.mode = mode;
        this.render();
    }

    /**
     * Set discrete options
     * @param {Array<string>} options - Labels for discrete mode
     */
    setDiscreteOptions(options) {
        this.options.discreteOptions = options;
        this.render();
        this.updateValueDisplay();
    }

    /**
     * Set modulation state
     * @param {number} baseValue - User-set base value
     * @param {number} modulatedValue - Current modulated value
     * @param {number} depth - Modulation depth (0-100)
     */
    setModulation(baseValue, modulatedValue, depth) {
        this._modState = {
            active: true,
            baseValue,
            modulatedValue,
            depth
        };
        this.container.classList.add('modulated');
        this.render();
    }

    /**
     * Clear modulation state
     */
    clearModulation() {
        this._modState = { active: false };
        this.container.classList.remove('modulated');
        this.render();
    }

    /**
     * Set PPMod edit mode (single LED for edit value, dimmed LED for base value)
     * @param {number} editValue - Current PPMod parameter value (0-1 normalised)
     * @param {number} baseValue - Base modulation value (0-1 normalised, for reference)
     */
    setEditMode(editValue, baseValue) {
        this._editState = {
            active: true,
            editValue,      // 0-1 normalised position for edit LED
            baseValue       // 0-1 normalised position for base reference
        };
        this.container.classList.add('ppmod-editing');
        this.render();
    }

    /**
     * Clear PPMod edit mode
     */
    clearEditMode() {
        this._editState = { active: false };
        this.container.classList.remove('ppmod-editing');
        this.render();
    }

    /**
     * Render the LED ring
     */
    render() {
        this.ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

        let ledStates;

        if (this._editState?.active) {
            // PPMod edit mode: single bright LED at edit value, dimmed LED at base value
            ledStates = new Array(LED_COUNT).fill(0.1); // All dim

            // Single bright LED at edit value position (0-1 → 0-20)
            const editLedIndex = Math.round(this._editState.editValue * (LED_COUNT - 1));
            ledStates[Math.max(0, Math.min(LED_COUNT - 1, editLedIndex))] = 1.0;

            // Dimmed LED at base value position (if different from edit)
            const baseLedIndex = Math.round(this._editState.baseValue * (LED_COUNT - 1));
            if (baseLedIndex !== editLedIndex) {
                ledStates[Math.max(0, Math.min(LED_COUNT - 1, baseLedIndex))] = 0.3;
            }
        } else if (this._modState.active) {
            // Show modulated value
            ledStates = calculateUnipolarLEDStates(
                this._modState.modulatedValue,
                this.options.min,
                this.options.max
            );
        } else if (this.options.mode === 'discrete' && this.options.discreteOptions) {
            // Discrete mode
            const selectedIndex = Math.round(this.value - this.options.min);
            ledStates = calculateDiscreteLEDStates(
                selectedIndex,
                this.options.discreteOptions.length
            );
        } else if (this.options.mode === 'bipolar') {
            // Bipolar mode
            ledStates = calculateBipolarLEDStates(
                this.value,
                this.options.min,
                this.options.max
            );
        } else {
            // Standard continuous
            ledStates = calculateUnipolarLEDStates(
                this.value,
                this.options.min,
                this.options.max
            );
        }

        // Draw all LEDs
        for (let i = 0; i < LED_COUNT; i++) {
            const pos = LED_POSITIONS[i];
            const state = ledStates[i];

            let brightness, color;

            if (typeof state === 'object' && state !== null) {
                brightness = state.brightness ?? 0.1;
                color = state.color ?? getLEDColor(i);
            } else {
                // Simple brightness value (from unipolar/discrete modes)
                brightness = state;
                color = getLEDColor(i);
            }

            drawLED(this.ctx, pos.x, pos.y, brightness, color);
        }

        // Draw centre knob
        drawCentre(this.ctx);
    }

    /**
     * Update the value display
     */
    updateValueDisplay() {
        if (!this.valueDisplay) return;

        if (this.options.formatValue) {
            this.valueDisplay.textContent = this.options.formatValue(this.value);
        } else if (this.options.mode === 'discrete' && this.options.discreteOptions) {
            const index = Math.round(this.value - this.options.min);
            this.valueDisplay.textContent = this.options.discreteOptions[index] ?? index;
        } else {
            // Default formatting
            const range = this.options.max - this.options.min;
            if (range <= 1) {
                this.valueDisplay.textContent = this.value.toFixed(2);
            } else if (range <= 10) {
                this.valueDisplay.textContent = this.value.toFixed(1);
            } else {
                this.valueDisplay.textContent = Math.round(this.value).toString();
            }
        }
    }

    /**
     * Set display text directly
     * @param {string} text - Display text
     */
    setDisplayText(text) {
        if (this.valueDisplay) {
            this.valueDisplay.textContent = text;
        }
    }

    /**
     * Get the parameter ID if set
     * @returns {string|null}
     */
    getParamId() {
        return this.options.paramId;
    }

    /**
     * Destroy the component and remove event listeners
     */
    destroy() {
        // Unregister from theme updates
        ledRingKnobInstances.delete(this);

        this.container.removeEventListener('mousedown', this._boundHandlers.mouseDown);
        this.container.removeEventListener('touchstart', this._boundHandlers.touchStart);
        document.removeEventListener('mousemove', this._boundHandlers.mouseMove);
        document.removeEventListener('mouseup', this._boundHandlers.mouseUp);
        document.removeEventListener('touchmove', this._boundHandlers.touchMove);
        document.removeEventListener('touchend', this._boundHandlers.touchEnd);

        this._boundHandlers = null;
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.valueDisplay = null;
    }
}

/**
 * Factory function to create LED ring knob HTML
 * @param {string} label - The knob label
 * @param {string} paramId - Parameter ID for data binding
 * @param {Object} [options] - Additional options
 * @param {string} [options.mode] - 'continuous', 'bipolar', or 'discrete'
 * @returns {string} HTML string
 */
export function createLEDRingKnobHTML(label, paramId, options = {}) {
    const mode = options.mode || 'continuous';

    return `
        <div class="knob-container">
            <div class="knob-label">${label}</div>
            <div class="led-ring-knob" data-mode="${mode}" data-param-id="${paramId}">
                <canvas width="${CANVAS_SIZE}" height="${CANVAS_SIZE}"></canvas>
            </div>
            <div class="knob-value">--</div>
        </div>
    `;
}
