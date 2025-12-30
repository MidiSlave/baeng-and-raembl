/**
 * File: merged-app/js/shared/components/MiniFader.js
 * MiniFader - Minimal canvas-based fader with LED brightness fill
 *
 * Features:
 * - Landscape orientation (wider than tall)
 * - Theme/gradient stroke only (no grey)
 * - LED brightness represents value (glows brighter at higher values)
 * - Compact size (~40x20px)
 */

// Constants
const FADER_WIDTH = 40;
const FADER_HEIGHT = 16;
const STROKE_WIDTH = 1.5;
const CORNER_RADIUS = 3;
const INDICATOR_WIDTH = 3;

/**
 * Draw a rounded rectangle path
 */
function roundedRect(ctx, x, y, width, height, radius) {
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
 * Get theme colour from CSS
 */
function getThemeColor() {
    const style = getComputedStyle(document.documentElement);
    return style.getPropertyValue('--theme-color').trim() || '#FFDC32';
}

/**
 * Get theme RGB values
 */
function getThemeRGB() {
    const style = getComputedStyle(document.documentElement);
    const r = parseInt(style.getPropertyValue('--theme-color-r')) || 255;
    const g = parseInt(style.getPropertyValue('--theme-color-g')) || 220;
    const b = parseInt(style.getPropertyValue('--theme-color-b')) || 50;
    return { r, g, b };
}

export class MiniFader {
    /**
     * Create a new MiniFader instance
     * @param {HTMLElement} container - The .mini-fader container element
     * @param {Object} options - Configuration options
     * @param {number} [options.min=0] - Minimum value
     * @param {number} [options.max=100] - Maximum value
     * @param {number} [options.value=50] - Initial value
     * @param {number|null} [options.step=null] - Step size (null = continuous)
     * @param {boolean} [options.bipolar=false] - Bipolar mode (centre = zero)
     * @param {Function} [options.onChange] - Callback when value changes
     * @param {Function} [options.formatValue] - Custom value formatter
     * @param {string} [options.paramId] - Parameter ID for state binding
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            min: options.min ?? 0,
            max: options.max ?? 100,
            value: options.value ?? 50,
            step: options.step ?? null,
            bipolar: options.bipolar ?? false,
            onChange: options.onChange ?? (() => {}),
            formatValue: options.formatValue ?? null,
            paramId: options.paramId ?? null,
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
        // Create canvas if not present
        let canvas = this.container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.width = FADER_WIDTH * 2; // 2x for retina
            canvas.height = FADER_HEIGHT * 2;
            canvas.style.width = `${FADER_WIDTH}px`;
            canvas.style.height = `${FADER_HEIGHT}px`;
            this.container.appendChild(canvas);
        }
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // Find value display (may be outside container)
        const parent = this.container.closest('.fader-container, .mini-fader-container');
        this.valueDisplay = parent?.querySelector('.fader-value, .mini-fader-value');

        // Store paramId if provided
        if (this.options.paramId) {
            this.container.dataset.paramId = this.options.paramId;
        }

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
        this.canvas.addEventListener('mousedown', this._boundHandlers.mouseDown);
        this.canvas.addEventListener('touchstart', this._boundHandlers.touchStart, { passive: false });

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
        this.startDrag(e.clientX);
    }

    /**
     * Handle touch start
     */
    handleTouchStart(e) {
        e.preventDefault();
        this.startDrag(e.touches[0].clientX);
    }

    /**
     * Start drag operation
     */
    startDrag(startX) {
        this.isDragging = true;
        this._dragStartX = startX;
        this._dragStartValue = this.value;
        this.container.classList.add('dragging');
    }

    /**
     * Handle mouse move
     */
    handleMouseMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this.updateFromDrag(e.clientX);
    }

    /**
     * Handle touch move
     */
    handleTouchMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this.updateFromDrag(e.touches[0].clientX);
    }

    /**
     * Update value from drag (horizontal)
     */
    updateFromDrag(currentX) {
        const deltaX = currentX - this._dragStartX;
        const range = this.options.max - this.options.min;

        // Sensitivity: 100px drag = full range
        const sensitivity = range / 100;
        let newValue = this._dragStartValue + deltaX * sensitivity;

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
    }

    /**
     * Set the fader value
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
            this.options.onChange(value, this);
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
     */
    updateRange(min, max) {
        this.options.min = min;
        this.options.max = max;
        this.setValue(this.value, false);
    }

    /**
     * Set modulation state
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
     * Render the fader
     */
    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const scale = 2; // Retina scale

        ctx.clearRect(0, 0, w, h);
        ctx.scale(scale, scale);

        const { r, g, b } = getThemeRGB();
        const themeColor = `rgb(${r}, ${g}, ${b})`;

        // Calculate normalised value (0-1)
        const range = this.options.max - this.options.min;
        const displayValue = this._modState.active ? this._modState.modulatedValue : this.value;
        let normalised = (displayValue - this.options.min) / range;
        normalised = Math.max(0, Math.min(1, normalised));

        // For bipolar, calculate from centre
        let fillStart = 0;
        let fillWidth = normalised;
        if (this.options.bipolar) {
            const centre = 0.5;
            if (normalised >= centre) {
                fillStart = centre;
                fillWidth = normalised - centre;
            } else {
                fillStart = normalised;
                fillWidth = centre - normalised;
            }
        }

        // LED brightness based on value (or distance from centre for bipolar)
        const brightness = this.options.bipolar
            ? Math.abs(normalised - 0.5) * 2
            : normalised;

        // Draw outer stroke (theme colour)
        const padding = STROKE_WIDTH;
        roundedRect(ctx, padding, padding, FADER_WIDTH - padding * 2, FADER_HEIGHT - padding * 2, CORNER_RADIUS);
        ctx.strokeStyle = themeColor;
        ctx.lineWidth = STROKE_WIDTH;
        ctx.stroke();

        // Draw LED glow fill
        if (brightness > 0.05) {
            const innerPadding = padding + STROKE_WIDTH;
            const innerWidth = FADER_WIDTH - innerPadding * 2;
            const innerHeight = FADER_HEIGHT - innerPadding * 2;

            // Glow gradient
            const glowAlpha = 0.15 + brightness * 0.5;
            const gradient = ctx.createLinearGradient(innerPadding, 0, innerPadding + innerWidth, 0);

            if (this.options.bipolar) {
                // Bipolar: glow from centre
                const centreX = innerPadding + innerWidth * 0.5;
                if (normalised >= 0.5) {
                    // Positive side
                    gradient.addColorStop(0, 'transparent');
                    gradient.addColorStop(0.5, 'transparent');
                    gradient.addColorStop(0.5 + fillWidth, `rgba(${r}, ${g}, ${b}, ${glowAlpha})`);
                    gradient.addColorStop(1, 'transparent');
                } else {
                    // Negative side
                    gradient.addColorStop(0, 'transparent');
                    gradient.addColorStop(fillStart, `rgba(${r}, ${g}, ${b}, ${glowAlpha})`);
                    gradient.addColorStop(0.5, 'transparent');
                    gradient.addColorStop(1, 'transparent');
                }
            } else {
                // Unipolar: glow from left
                gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${glowAlpha})`);
                gradient.addColorStop(normalised, `rgba(${r}, ${g}, ${b}, ${glowAlpha * 0.8})`);
                gradient.addColorStop(Math.min(1, normalised + 0.1), 'transparent');
                gradient.addColorStop(1, 'transparent');
            }

            ctx.save();
            roundedRect(ctx, innerPadding, innerPadding, innerWidth, innerHeight, CORNER_RADIUS - 1);
            ctx.clip();
            ctx.fillStyle = gradient;
            ctx.fillRect(innerPadding, innerPadding, innerWidth, innerHeight);
            ctx.restore();
        }

        // Draw position indicator line
        const indicatorX = padding + STROKE_WIDTH + (FADER_WIDTH - padding * 2 - STROKE_WIDTH * 2) * normalised;
        const indicatorAlpha = 0.6 + brightness * 0.4;
        ctx.beginPath();
        ctx.moveTo(indicatorX, padding + STROKE_WIDTH + 2);
        ctx.lineTo(indicatorX, FADER_HEIGHT - padding - STROKE_WIDTH - 2);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${indicatorAlpha})`;
        ctx.lineWidth = INDICATOR_WIDTH;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Reset scale
        ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    /**
     * Update the value display
     */
    updateValueDisplay() {
        if (!this.valueDisplay) return;

        if (this.options.formatValue) {
            this.valueDisplay.textContent = this.options.formatValue(this.value);
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
        this.canvas.removeEventListener('mousedown', this._boundHandlers.mouseDown);
        this.canvas.removeEventListener('touchstart', this._boundHandlers.touchStart);
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
 * Factory function to create MiniFader HTML
 * @param {string} label - The fader label
 * @param {string} paramId - Parameter ID for data binding
 * @param {Object} [options] - Additional options
 * @returns {string} HTML string
 */
export function createMiniFaderHTML(label, paramId, options = {}) {
    const bipolar = options.bipolar ? 'data-bipolar="true"' : '';

    return `
        <div class="mini-fader-container" data-param-id="${paramId}" ${bipolar}>
            <div class="mini-fader-label">${label}</div>
            <div class="mini-fader">
                <canvas width="80" height="32"></canvas>
            </div>
            <div class="mini-fader-value">--</div>
        </div>
    `;
}
