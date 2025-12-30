// Shared gradient utilities for Baeng & Raembl
// Centralised theme gradient management and canvas rendering helpers

// ============================================
// Gradient Mode State Management
// ============================================

/**
 * Check if gradient mode is enabled
 * @returns {boolean}
 */
export function isGradientModeEnabled() {
    return localStorage.getItem('gradientModeEnabled') === 'true';
}

/**
 * Enable or disable gradient mode
 * Updates localStorage and DOM class on root element
 * @param {boolean} enabled
 */
export function setGradientMode(enabled) {
    localStorage.setItem('gradientModeEnabled', enabled.toString());

    // Add or remove gradient mode class on root
    if (enabled) {
        document.documentElement.classList.add('gradient-mode');
    } else {
        document.documentElement.classList.remove('gradient-mode');
    }

    // Dispatch theme changed event for canvas components to re-render
    document.dispatchEvent(new CustomEvent('themeChanged', {
        detail: { type: 'mode', enabled }
    }));
}

/**
 * Check if gradient mode is currently active (via DOM class)
 * Use this for per-frame rendering checks (more reliable than localStorage)
 * @returns {boolean}
 */
export function isGradientModeActive() {
    return document.documentElement.classList.contains('gradient-mode');
}

/**
 * Check if light mode is currently active
 * @returns {boolean}
 */
export function isLightModeActive() {
    return document.documentElement.getAttribute('data-theme') === 'light';
}

/**
 * Get appropriate background colour for canvas elements based on theme
 * @returns {{bg: string, border: string}} Background and border colours
 */
export function getCanvasBackgroundColors() {
    if (isLightModeActive()) {
        return {
            bg: '#e0e0e0',      // Light grey for light mode
            border: '#cccccc',  // Slightly darker border
            bgDark: '#d0d0d0'   // Darker variant
        };
    } else {
        return {
            bg: '#1a1a1a',      // Dark for dark mode
            border: '#333333',
            bgDark: '#111111'
        };
    }
}

// ============================================
// Theme Colour Utilities
// ============================================

/**
 * Get a CSS custom property value from document root
 * @param {string} varName - CSS variable name (with or without --)
 * @param {string} fallback - Fallback value if not found
 * @returns {string}
 */
export function getThemeVar(varName, fallback = '') {
    const prop = varName.startsWith('--') ? varName : `--${varName}`;
    return getComputedStyle(document.documentElement).getPropertyValue(prop).trim() || fallback;
}

/**
 * Get current theme colour as RGB object
 * @returns {{r: number, g: number, b: number}}
 */
export function getThemeColorRGB() {
    return {
        r: parseInt(getThemeVar('--theme-color-r', '255')),
        g: parseInt(getThemeVar('--theme-color-g', '220')),
        b: parseInt(getThemeVar('--theme-color-b', '50'))
    };
}

/**
 * Get gradient colour 1 (start) as RGB object
 * @returns {{r: number, g: number, b: number}}
 */
export function getGradientColor1RGB() {
    return {
        r: parseInt(getThemeVar('--theme-color-1-r', '255')),
        g: parseInt(getThemeVar('--theme-color-1-g', '220')),
        b: parseInt(getThemeVar('--theme-color-1-b', '50'))
    };
}

/**
 * Get gradient colour 2 (end) as RGB object
 * @returns {{r: number, g: number, b: number}}
 */
export function getGradientColor2RGB() {
    return {
        r: parseInt(getThemeVar('--theme-color-2-r', '50')),
        g: parseInt(getThemeVar('--theme-color-2-g', '220')),
        b: parseInt(getThemeVar('--theme-color-2-b', '255'))
    };
}

/**
 * Build an rgba string from RGB object
 * @param {{r: number, g: number, b: number}} rgb
 * @param {number} alpha - Transparency (0-1)
 * @returns {string}
 */
export function rgbToRgba(rgb, alpha = 1.0) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

// ============================================
// Canvas Gradient Creation
// ============================================

/**
 * Create a linear gradient for canvas based on current theme
 * Automatically detects gradient mode and falls back to solid colour if disabled
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x0 - Start X coordinate
 * @param {number} y0 - Start Y coordinate
 * @param {number} x1 - End X coordinate
 * @param {number} y1 - End Y coordinate
 * @param {number} alpha - Optional alpha transparency (0-1, default 1.0)
 * @returns {CanvasGradient|string} Gradient object if gradient mode enabled, or rgba string for solid colour
 *
 * @example
 * // Horizontal gradient across full width
 * const gradient = createThemeGradient(ctx, 0, 0, canvas.width, 0);
 * ctx.strokeStyle = gradient;
 *
 * @example
 * // Vertical gradient with transparency
 * const gradient = createThemeGradient(ctx, 0, 0, 0, canvas.height, 0.5);
 * ctx.fillStyle = gradient;
 */
export function createThemeGradient(ctx, x0, y0, x1, y1, alpha = 1.0) {
    // Check if gradient mode is active via DOM class (re-read each frame)
    if (!isGradientModeActive()) {
        // Fallback to solid theme colour when gradient mode disabled
        const rgb = getThemeColorRGB();
        return rgbToRgba(rgb, alpha);
    }

    // Extract gradient colours
    const color1 = getGradientColor1RGB();
    const color2 = getGradientColor2RGB();

    // Create linear gradient from (x0, y0) to (x1, y1)
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1);

    // Add colour stops with alpha transparency
    gradient.addColorStop(0, rgbToRgba(color1, alpha));
    gradient.addColorStop(1, rgbToRgba(color2, alpha));

    return gradient;
}

/**
 * Create a radial gradient for canvas based on current theme
 * Useful for circular/radial visualisations
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} x0 - Centre X of start circle
 * @param {number} y0 - Centre Y of start circle
 * @param {number} r0 - Radius of start circle
 * @param {number} x1 - Centre X of end circle
 * @param {number} y1 - Centre Y of end circle
 * @param {number} r1 - Radius of end circle
 * @param {number} alpha - Optional alpha transparency (0-1, default 1.0)
 * @returns {CanvasGradient|string} Radial gradient object or solid colour fallback
 *
 * @example
 * // Radial gradient from centre outward
 * const gradient = createRadialThemeGradient(ctx, cx, cy, 0, cx, cy, radius);
 * ctx.fillStyle = gradient;
 */
export function createRadialThemeGradient(ctx, x0, y0, r0, x1, y1, r1, alpha = 1.0) {
    if (!isGradientModeActive()) {
        const rgb = getThemeColorRGB();
        return rgbToRgba(rgb, alpha);
    }

    const color1 = getGradientColor1RGB();
    const color2 = getGradientColor2RGB();

    const gradient = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    gradient.addColorStop(0, rgbToRgba(color1, alpha));
    gradient.addColorStop(1, rgbToRgba(color2, alpha));

    return gradient;
}

/**
 * Create a theme-aware colour string for canvas (non-gradient)
 * Use this when you need a solid colour that respects the current theme
 *
 * @param {number} alpha - Optional alpha transparency (0-1, default 1.0)
 * @returns {string} rgba colour string
 */
export function getThemeColor(alpha = 1.0) {
    const rgb = getThemeColorRGB();
    return rgbToRgba(rgb, alpha);
}

/**
 * Get the appropriate stroke/fill colour for SVG or canvas
 * Returns gradient colour 1 if in gradient mode, otherwise theme colour
 *
 * @param {number} alpha - Optional alpha transparency (0-1, default 1.0)
 * @returns {string} rgba colour string
 */
export function getAccentColor(alpha = 1.0) {
    if (isGradientModeActive()) {
        const rgb = getGradientColor1RGB();
        return rgbToRgba(rgb, alpha);
    }
    return getThemeColor(alpha);
}
