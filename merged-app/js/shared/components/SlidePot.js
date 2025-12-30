/**
 * File: merged-app/js/shared/components/SlidePot.js
 * SlidePot - Slide Potentiometer UI Component
 * Based on Alpha RA2045F-20R-15LC-B10K-C hardware specification
 *
 * Enhanced from slide-pot-test prototype with:
 * - setValueWithoutCallback() for external state sync
 * - updateRange() for dynamic min/max
 * - Proper destroy() with stored bound function references
 * - Bipolar mode support with centre line indicator
 * - setModulating() for PPMod visual feedback
 * - Gradient mode support for theme gradients
 */

import {
    isGradientModeActive,
    getThemeColorRGB,
    getGradientColor1RGB,
    getGradientColor2RGB,
    getCanvasBackgroundColors
} from '../gradient-utils.js';

// Static registry to track all SlidePot instances for theme updates
const slidePotInstances = new Set();
let themeListenerInitialised = false;

/**
 * Initialise global theme change listener (called once)
 */
function initThemeListener() {
    if (themeListenerInitialised) return;
    themeListenerInitialised = true;

    document.addEventListener('themeChanged', () => {
        // Re-render all SlidePot canvas knobs
        slidePotInstances.forEach(instance => {
            if (instance.useCanvasKnob) {
                const range = instance.options.max - instance.options.min;
                const normalised = range !== 0 ? (instance.value - instance.options.min) / range : 0;
                instance.renderCanvasKnob(normalised);
            }
        });
    });
}

export class SlidePot {
    /**
     * Create a new SlidePot instance
     * @param {HTMLElement} container - The .slide-pot-container element
     * @param {Object} options - Configuration options
     * @param {number} [options.min=0] - Minimum value
     * @param {number} [options.max=100] - Maximum value
     * @param {number} [options.value=50] - Initial value
     * @param {number|null} [options.step=null] - Step size (null = continuous)
     * @param {string} [options.orientation='vertical'] - 'vertical' or 'horizontal'
     * @param {string} [options.ledMode='value'] - 'value', 'fixed', or 'modulated'
     * @param {boolean} [options.bipolar=false] - Centre-zero display mode
     * @param {Function} [options.onChange] - Callback when value changes
     * @param {Function} [options.formatValue] - Custom value formatter
     * @param {string} [options.paramId] - Parameter ID for PPMod integration
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            min: options.min ?? 0,
            max: options.max ?? 100,
            value: options.value ?? 50,
            step: options.step ?? null,
            orientation: options.orientation ?? 'vertical',
            ledMode: options.ledMode ?? 'value',
            bipolar: options.bipolar ?? false,
            onChange: options.onChange ?? (() => {}),
            formatValue: options.formatValue ?? null,
            paramId: options.paramId ?? null,
            ...options
        };

        this.value = this.options.value;
        this.isDragging = false;
        this._isModulating = false;

        // Store bound event handlers for proper cleanup
        this._boundHandlers = {
            mouseDown: this.handleMouseDown.bind(this),
            bodyClick: this.handleBodyClick.bind(this),
            mouseMove: this.handleMouseMove.bind(this),
            mouseUp: this.handleMouseUp.bind(this),
            touchStart: this.handleTouchStart.bind(this),
            bodyTouch: this.handleBodyTouch.bind(this),
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
        slidePotInstances.add(this);

        // Query DOM elements
        this.body = this.container.querySelector('.slide-pot-body');
        this.slot = this.container.querySelector('.slide-pot-slot');
        this.knob = this.container.querySelector('.slide-pot-knob');
        this.led = this.container.querySelector('.slide-pot-led');
        this.valueDisplay = this.container.querySelector('.slide-pot-value');

        // Check for canvas-based knob
        this.knobCanvas = this.knob?.querySelector('.slide-pot-knob-canvas');
        if (this.knobCanvas) {
            this.knobCtx = this.knobCanvas.getContext('2d');
            this.useCanvasKnob = true;
        } else {
            this.useCanvasKnob = false;
        }

        if (!this.body || !this.knob) {
            console.error('[SlidePot] Missing required elements');
            return;
        }

        // Set orientation data attribute
        this.container.dataset.orientation = this.options.orientation;

        // Set LED mode
        this.setLedMode(this.options.ledMode);

        // Set stepped mode if step is defined
        if (this.options.step !== null) {
            this.container.dataset.stepped = 'true';
        }

        // Set bipolar mode
        if (this.options.bipolar) {
            this.container.dataset.bipolar = 'true';
        }

        // Store paramId if provided
        if (this.options.paramId) {
            this.container.dataset.paramId = this.options.paramId;
        }

        // Setup event listeners
        this.setupEvents();

        // Set initial value (without triggering callback)
        this.setValue(this.options.value, false);
    }

    /**
     * Setup mouse and touch event listeners
     */
    setupEvents() {
        // Mouse events on knob
        this.knob.addEventListener('mousedown', this._boundHandlers.mouseDown);

        // Mouse events on body (click to jump)
        this.body.addEventListener('mousedown', this._boundHandlers.bodyClick);

        // Global mouse events for drag
        document.addEventListener('mousemove', this._boundHandlers.mouseMove);
        document.addEventListener('mouseup', this._boundHandlers.mouseUp);

        // Touch events
        this.knob.addEventListener('touchstart', this._boundHandlers.touchStart, { passive: false });
        this.body.addEventListener('touchstart', this._boundHandlers.bodyTouch, { passive: false });
        document.addEventListener('touchmove', this._boundHandlers.touchMove, { passive: false });
        document.addEventListener('touchend', this._boundHandlers.touchEnd);
    }

    /**
     * Handle mouse down on knob
     */
    handleMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        this.startDrag();
    }

    /**
     * Handle mouse down on body (click to jump)
     */
    handleBodyClick(e) {
        if (e.target === this.knob || this.knob.contains(e.target)) {
            return; // Let knob handler deal with it
        }
        e.preventDefault();
        this.startDrag();
        this.updateFromEvent(e);
    }

    /**
     * Handle mouse move (global)
     */
    handleMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this.updateFromEvent(e);
    }

    /**
     * Handle mouse up (global)
     */
    handleMouseUp() {
        this.endDrag();
    }

    /**
     * Handle touch start on knob
     */
    handleTouchStart(e) {
        e.preventDefault();
        e.stopPropagation();
        this.startDrag();
    }

    /**
     * Handle touch start on body (tap to jump)
     */
    handleBodyTouch(e) {
        if (e.target === this.knob || this.knob.contains(e.target)) {
            return;
        }
        e.preventDefault();
        this.startDrag();
        this.updateFromEvent(e.touches[0]);
    }

    /**
     * Handle touch move (global)
     */
    handleTouchMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this.updateFromEvent(e.touches[0]);
    }

    /**
     * Handle touch end (global)
     */
    handleTouchEnd() {
        this.endDrag();
    }

    /**
     * Start dragging
     */
    startDrag() {
        this.isDragging = true;
        this.container.classList.add('dragging');
    }

    /**
     * End dragging
     */
    endDrag() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.container.classList.remove('dragging');
    }

    /**
     * Update value from mouse/touch event
     */
    updateFromEvent(e) {
        const rect = this.body.getBoundingClientRect();
        let normalised;

        if (this.options.orientation === 'vertical') {
            // Vertical: top = max, bottom = min
            normalised = 1 - (e.clientY - rect.top) / rect.height;
        } else {
            // Horizontal: left = min, right = max
            normalised = (e.clientX - rect.left) / rect.width;
        }

        // Clamp to 0-1
        normalised = Math.max(0, Math.min(1, normalised));

        // Convert to value range
        let value = this.options.min + normalised * (this.options.max - this.options.min);

        // Apply stepping if configured
        if (this.options.step !== null) {
            value = Math.round(value / this.options.step) * this.options.step;
        }

        // Set the value
        this.setValue(value);
    }

    /**
     * Set the pot value
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

        // Calculate position percentage (0-100)
        const range = this.options.max - this.options.min;
        const percentage = range !== 0 ? ((value - this.options.min) / range) * 100 : 0;

        // Update knob position via CSS custom property
        this.knob.style.setProperty('--pot-position', percentage);

        // Render canvas knob if using canvas
        if (this.useCanvasKnob) {
            this.renderCanvasKnob(percentage / 100);
        }

        // Update LED brightness (value mode handled by CSS, but we set the property anyway)
        if (this.options.ledMode === 'value' && this.led && !this._isModulating) {
            const brightness = 0.2 + (percentage / 100) * 0.8;
            this.led.style.setProperty('--led-brightness', brightness);
        }

        // Update value display
        if (this.valueDisplay) {
            this.valueDisplay.textContent = this.formatValue(value);
        }

        // Trigger callback
        if (notify) {
            this.options.onChange(value, this);
        }
    }

    /**
     * Set value without triggering onChange callback
     * Used for external state sync (patch load, undo/redo)
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
     * Used for dynamic ranges (e.g., FILLS depends on STEPS)
     * @param {number} min - New minimum value
     * @param {number} max - New maximum value
     */
    updateRange(min, max) {
        this.options.min = min;
        this.options.max = max;

        // Re-clamp and update display without triggering callback
        this.setValue(this.value, false);
    }

    /**
     * Format the value for display
     * @param {number} value
     * @returns {string}
     */
    formatValue(value) {
        if (this.options.formatValue) {
            return this.options.formatValue(value);
        }

        // Default formatting based on range
        const range = this.options.max - this.options.min;
        if (range <= 1) {
            return value.toFixed(2);
        } else if (range <= 10) {
            return value.toFixed(1);
        } else {
            return Math.round(value).toString();
        }
    }

    /**
     * Set the LED mode
     * @param {'value'|'fixed'|'modulated'} mode
     */
    setLedMode(mode) {
        this.options.ledMode = mode;
        if (this.knob) {
            this.knob.dataset.ledMode = mode;
        }
    }

    /**
     * Set LED brightness directly (for PPMod animation)
     * @param {number} brightness - 0-1 brightness value
     */
    setLedBrightness(brightness) {
        const clampedBrightness = Math.max(0, Math.min(1, brightness));

        // Store for canvas rendering
        this._ledBrightness = clampedBrightness;

        // Update DOM LED element (for non-canvas mode)
        if (this.led) {
            this.led.style.setProperty('--led-brightness', clampedBrightness);
        }

        // Re-render canvas if using canvas knob (for canvas mode)
        if (this.knobCanvas && this._isModulating) {
            const range = this.options.max - this.options.min;
            const normalised = range !== 0 ? (this.value - this.options.min) / range : 0;
            this.renderCanvasKnob(normalised);
        }
    }

    /**
     * Set modulating state (PPMod active)
     * When active, LED brightness is controlled externally via setLedBrightness()
     * @param {boolean} active - Whether modulation is active
     */
    setModulating(active) {
        this._isModulating = active;

        if (active) {
            this.container.classList.add('modulating');
            this.setLedMode('modulated');
        } else {
            this.container.classList.remove('modulating');
            this.setLedMode('value');
            // Reset LED to value-based brightness
            const range = this.options.max - this.options.min;
            const percentage = range !== 0 ? ((this.value - this.options.min) / range) * 100 : 0;
            const brightness = 0.2 + (percentage / 100) * 0.8;
            this.setLedBrightness(brightness);
        }
    }

    /**
     * Render the canvas-based knob
     * @param {number} normalised - 0 to 1 normalised value
     */
    renderCanvasKnob(normalised) {
        if (!this.knobCanvas || !this.knobCtx) return;

        const canvas = this.knobCanvas;
        const ctx = this.knobCtx;
        const w = canvas.width;
        const h = canvas.height;

        // Clear canvas
        ctx.clearRect(0, 0, w, h);

        // Check if gradient mode is active
        const useGradient = isGradientModeActive();

        // Get theme colours
        let color1, color2;
        if (useGradient) {
            color1 = getGradientColor1RGB();
            color2 = getGradientColor2RGB();
        } else {
            const themeColor = getThemeColorRGB();
            color1 = themeColor;
            color2 = themeColor;
        }

        // Calculate brightness based on value
        const brightness = this._isModulating ? this._ledBrightness || normalised : normalised;

        // Draw rounded rectangle
        const padding = 2;
        const radius = 4;
        const rectW = w - padding * 2;
        const rectH = h - padding * 2;

        // Draw opaque background first (so track doesn't show through)
        const bgColors = getCanvasBackgroundColors();
        ctx.fillStyle = bgColors.bg;
        this._roundedRect(ctx, padding, padding, rectW, rectH, radius);
        ctx.fill();

        // Draw theme colour overlay (brightness determines intensity)
        // At 0: very dim, at 1: full brightness
        const overlayAlpha = 0.1 + brightness * 0.9;

        if (useGradient) {
            // Create gradient fill
            const gradient = ctx.createLinearGradient(padding, padding, w - padding, padding);
            gradient.addColorStop(0, `rgba(${color1.r}, ${color1.g}, ${color1.b}, ${overlayAlpha})`);
            gradient.addColorStop(1, `rgba(${color2.r}, ${color2.g}, ${color2.b}, ${overlayAlpha})`);
            ctx.fillStyle = gradient;
        } else {
            ctx.fillStyle = `rgba(${color1.r}, ${color1.g}, ${color1.b}, ${overlayAlpha})`;
        }
        this._roundedRect(ctx, padding, padding, rectW, rectH, radius);
        ctx.fill();

        // Draw outline stroke (theme colour or gradient)
        if (useGradient) {
            const strokeGradient = ctx.createLinearGradient(padding, padding, w - padding, padding);
            strokeGradient.addColorStop(0, `rgb(${color1.r}, ${color1.g}, ${color1.b})`);
            strokeGradient.addColorStop(1, `rgb(${color2.r}, ${color2.g}, ${color2.b})`);
            ctx.strokeStyle = strokeGradient;
        } else {
            ctx.strokeStyle = `rgb(${color1.r}, ${color1.g}, ${color1.b})`;
        }
        ctx.lineWidth = 1.5;
        this._roundedRect(ctx, padding, padding, rectW, rectH, radius);
        ctx.stroke();
    }

    /**
     * Draw a rounded rectangle path
     * @private
     */
    _roundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    /**
     * Check if currently modulating
     * @returns {boolean}
     */
    isModulating() {
        return this._isModulating;
    }

    /**
     * Update the value display text directly
     * Used for modulation mode pages (WAVE, RATE, etc.)
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
        slidePotInstances.delete(this);

        // Remove knob events
        if (this.knob) {
            this.knob.removeEventListener('mousedown', this._boundHandlers.mouseDown);
            this.knob.removeEventListener('touchstart', this._boundHandlers.touchStart);
        }

        // Remove body events
        if (this.body) {
            this.body.removeEventListener('mousedown', this._boundHandlers.bodyClick);
            this.body.removeEventListener('touchstart', this._boundHandlers.bodyTouch);
        }

        // Remove global events
        document.removeEventListener('mousemove', this._boundHandlers.mouseMove);
        document.removeEventListener('mouseup', this._boundHandlers.mouseUp);
        document.removeEventListener('touchmove', this._boundHandlers.touchMove);
        document.removeEventListener('touchend', this._boundHandlers.touchEnd);

        // Clear references
        this._boundHandlers = null;
        this.container = null;
        this.body = null;
        this.slot = null;
        this.knob = null;
        this.led = null;
        this.valueDisplay = null;
    }
}

/**
 * Factory function to create slide pot HTML
 * @param {string} label - The pot label
 * @param {string} paramId - Parameter ID for data binding
 * @param {Object} [options] - Additional options
 * @param {string} [options.id] - Custom element ID
 * @param {string} [options.scale] - Scale variant (0.5, 1, 1.5, 2)
 * @returns {string} HTML string
 */
export function createSlidePotHTML(label, paramId, options = {}) {
    const id = options.id || `slide-pot-${paramId.replace(/\./g, '-')}`;
    const scale = options.scale || '1';

    return `
        <div class="slide-pot-container" id="${id}" data-param-id="${paramId}" data-scale="${scale}">
            <div class="slide-pot-label">${label}</div>
            <div class="slide-pot-body">
                <div class="slide-pot-slot"></div>
                <div class="slide-pot-knob" data-led-mode="value">
                    <div class="slide-pot-led"></div>
                    <div class="slide-pot-grip"></div>
                </div>
            </div>
            <div class="slide-pot-value">--</div>
        </div>
    `;
}
