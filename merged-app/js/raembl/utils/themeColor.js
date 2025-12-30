// File: js/raembl/utils/themeColor.js
// Theme colour management with HSL to RGB conversion
// Extended with gradient mode support (matching Baeng's implementation)

// Re-export shared gradient utilities for convenience
export {
    isGradientModeEnabled,
    setGradientMode,
    isGradientModeActive,
    createThemeGradient,
    createRadialThemeGradient,
    getThemeColor,
    getAccentColor,
    getThemeVar
} from '../../shared/gradient-utils.js';

// ============================================
// HSL to RGB Conversion
// ============================================

/**
 * Convert HSL to RGB
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {{r: number, g: number, b: number}} RGB values (0-255)
 */
function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return {
        r: Math.round(255 * f(0)),
        g: Math.round(255 * f(8)),
        b: Math.round(255 * f(4))
    };
}

// ============================================
// Single Colour Theme Functions
// ============================================

/**
 * Set theme colour based on hue (0-360)
 * @param {number} hue - Hue value in degrees
 * @returns {{r: number, g: number, b: number, hex: string}}
 */
export function setThemeHue(hue) {
    const { r, g, b } = hslToRgb(hue, 100, 60); // 100% saturation, 60% lightness
    const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;

    const root = document.documentElement;
    root.style.setProperty('--theme-color', hex);
    root.style.setProperty('--theme-color-r', r);
    root.style.setProperty('--theme-color-g', g);
    root.style.setProperty('--theme-color-b', b);

    // Update hover colour (slightly lighter)
    root.style.setProperty('--theme-color-hover', `hsl(${hue}, 100%, 70%)`);

    // Dispatch theme changed event for canvas components to re-render
    document.dispatchEvent(new CustomEvent('themeChanged', { detail: { type: 'hue', hue } }));

    return { r, g, b, hex };
}

/**
 * Get current theme colour RGB values
 * @returns {{r: number, g: number, b: number}}
 */
export function getThemeColorRGB() {
    const r = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color-r').trim()) || 255;
    const g = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color-g').trim()) || 220;
    const b = parseInt(getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color-b').trim()) || 50;
    return { r, g, b };
}

/**
 * Get current theme colour hex
 * @returns {string}
 */
export function getThemeColorHex() {
    return getComputedStyle(document.documentElement)
        .getPropertyValue('--theme-color').trim() || '#FFDC32';
}

/**
 * Save theme hue to localStorage
 * Uses shared key 'themeHue' for consistency with Baeng
 * @param {number} hue
 */
export function saveThemeHue(hue) {
    localStorage.setItem('themeHue', hue.toString());
    // Also save to legacy key for backwards compatibility
    localStorage.setItem('rambler_theme_hue', hue.toString());
}

/**
 * Load theme hue from localStorage
 * Checks both shared and legacy keys
 * @returns {number}
 */
export function loadThemeHue() {
    // Try shared key first, fall back to legacy
    let stored = localStorage.getItem('themeHue');
    if (stored === null) {
        stored = localStorage.getItem('rambler_theme_hue');
    }
    return stored ? parseInt(stored) : 45; // Default to 45° (yellow)
}

// ============================================
// Gradient Theme Functions
// ============================================

/**
 * Set theme gradient by updating CSS custom properties
 * @param {number} hue1 - First hue value (0-360)
 * @param {number} hue2 - Second hue value (0-360)
 * @param {number} rotation - Gradient rotation angle in degrees (0-360, default 90)
 */
export function setThemeGradient(hue1, hue2, rotation = 90) {
    // Check if light mode is active
    const isLightMode = document.documentElement.getAttribute('data-theme') === 'light';

    // Adjust saturation and lightness for light/dark mode
    const saturation = isLightMode ? 80 : 100;
    const lightness = isLightMode ? 45 : 60;

    // Convert both hues to RGB
    const c1 = hslToRgb(hue1, saturation, lightness);
    const c2 = hslToRgb(hue2, saturation, lightness);

    // Calculate midpoint hue for borders/text (circular mean)
    let midHue = (hue1 + hue2) / 2;
    if (Math.abs(hue2 - hue1) > 180) {
        midHue = (midHue + 180) % 360;
    }
    const cMid = hslToRgb(midHue, saturation, lightness);

    const root = document.documentElement;

    // Set colour 1
    root.style.setProperty('--theme-color-1', `hsl(${hue1}, ${saturation}%, ${lightness}%)`);
    root.style.setProperty('--theme-color-1-r', c1.r);
    root.style.setProperty('--theme-color-1-g', c1.g);
    root.style.setProperty('--theme-color-1-b', c1.b);

    // Set colour 2
    root.style.setProperty('--theme-color-2', `hsl(${hue2}, ${saturation}%, ${lightness}%)`);
    root.style.setProperty('--theme-color-2-r', c2.r);
    root.style.setProperty('--theme-color-2-g', c2.g);
    root.style.setProperty('--theme-color-2-b', c2.b);

    // Set midpoint colour (for borders/text)
    root.style.setProperty('--theme-color', `hsl(${midHue}, ${saturation}%, ${lightness}%)`);
    root.style.setProperty('--theme-color-r', cMid.r);
    root.style.setProperty('--theme-color-g', cMid.g);
    root.style.setProperty('--theme-color-b', cMid.b);

    // Set gradients with rotation
    root.style.setProperty('--theme-gradient-h',
        `linear-gradient(${rotation}deg, hsl(${hue1}, ${saturation}%, ${lightness}%), hsl(${hue2}, ${saturation}%, ${lightness}%))`);
    root.style.setProperty('--theme-gradient-v',
        `linear-gradient(${(rotation + 90) % 360}deg, hsl(${hue1}, ${saturation}%, ${lightness}%), hsl(${hue2}, ${saturation}%, ${lightness}%))`);

    // Update hover colour
    root.style.setProperty('--theme-color-hover', `hsl(${midHue}, ${saturation}%, ${Math.min(lightness + 10, 100)}%)`);

    // Update SVG gradient definitions if they exist
    updateSVGGradients(hue1, hue2, saturation, lightness, rotation);

    // Dispatch theme changed event for canvas components to re-render
    document.dispatchEvent(new CustomEvent('themeChanged', { detail: { type: 'gradient', hue1, hue2, rotation } }));
}

/**
 * Update SVG gradient definitions for use in gradient mode
 * Updates both shared gradients (gradient-stroke/fill) and Ræmbl-specific ones
 * @private
 */
function updateSVGGradients(hue1, hue2, saturation, lightness, rotation) {
    const color1 = `hsl(${hue1}, ${saturation}%, ${lightness}%)`;
    const color2 = `hsl(${hue2}, ${saturation}%, ${lightness}%)`;

    // Helper to update a single gradient element
    const updateGradient = (id) => {
        const gradient = document.getElementById(id);
        if (gradient) {
            const stops = gradient.querySelectorAll('stop');
            if (stops[0]) stops[0].setAttribute('stop-color', color1);
            if (stops[1]) stops[1].setAttribute('stop-color', color2);
            // Update gradient angle - offset by 90° to match CSS gradient conventions
            // CSS: 0deg=bottom-to-top, 90deg=left-to-right
            // SVG default: left-to-right with x1=0,y1=50 to x2=100,y2=50
            const svgAngle = rotation - 90;
            gradient.setAttribute('x1', `${50 - 50 * Math.cos((svgAngle * Math.PI) / 180)}%`);
            gradient.setAttribute('y1', `${50 - 50 * Math.sin((svgAngle * Math.PI) / 180)}%`);
            gradient.setAttribute('x2', `${50 + 50 * Math.cos((svgAngle * Math.PI) / 180)}%`);
            gradient.setAttribute('y2', `${50 + 50 * Math.sin((svgAngle * Math.PI) / 180)}%`);
        }
    };

    // Update shared gradients (used by Bæng)
    updateGradient('gradient-stroke');
    updateGradient('gradient-fill');

    // Update Ræmbl-specific gradients
    updateGradient('raembl-gradient-stroke');
    updateGradient('raembl-gradient-fill');
}

/**
 * Load saved gradient hues from localStorage
 * @returns {{hue1: number, hue2: number, rotation: number}}
 */
export function loadThemeGradient() {
    let hue1 = localStorage.getItem('themeGradientHue1');
    let hue2 = localStorage.getItem('themeGradientHue2');
    let rotation = localStorage.getItem('themeGradientRotation');

    // Migration: if old single hue exists and no gradient hues, create gradient from it
    if (hue1 === null && hue2 === null) {
        const oldHue = localStorage.getItem('themeHue') || localStorage.getItem('rambler_theme_hue');
        if (oldHue !== null) {
            hue1 = oldHue;
            // Create complementary-ish colour (135° offset)
            hue2 = ((parseInt(oldHue, 10) + 135) % 360).toString();
        }
    }

    return {
        hue1: hue1 !== null ? parseInt(hue1, 10) : 45,      // Default yellow
        hue2: hue2 !== null ? parseInt(hue2, 10) : 180,     // Default cyan
        rotation: rotation !== null ? parseInt(rotation, 10) : 90  // Default 90° (left to right)
    };
}

/**
 * Save gradient hues to localStorage
 * @param {number} hue1 - First hue value
 * @param {number} hue2 - Second hue value
 * @param {number} rotation - Gradient rotation angle
 */
export function saveThemeGradient(hue1, hue2, rotation = 90) {
    localStorage.setItem('themeGradientHue1', hue1.toString());
    localStorage.setItem('themeGradientHue2', hue2.toString());
    localStorage.setItem('themeGradientRotation', rotation.toString());
}

// ============================================
// Light/Dark Theme Functions
// ============================================

/**
 * Apply theme (light/dark mode)
 * @param {string} theme - 'light' or 'dark'
 */
export function applyTheme(theme) {
    if (theme === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }

    // Dispatch theme changed event for canvas components to re-render
    document.dispatchEvent(new CustomEvent('themeChanged', { detail: { type: 'theme', theme } }));
}

/**
 * Load saved theme preference from localStorage
 * @returns {string} 'light' or 'dark'
 */
export function loadThemePreference() {
    return localStorage.getItem('displayTheme') || 'dark';
}

/**
 * Save theme preference to localStorage
 * @param {string} theme - 'light' or 'dark'
 */
export function saveThemePreference(theme) {
    localStorage.setItem('displayTheme', theme);
}

// ============================================
// Initialisation
// ============================================

/**
 * Initialise theme based on saved preferences
 * Should be called on page load
 */
export function initializeTheme() {
    // Use the re-exported isGradientModeEnabled from shared utils
    const gradientEnabled = localStorage.getItem('gradientModeEnabled') === 'true';

    if (gradientEnabled) {
        const { hue1, hue2, rotation } = loadThemeGradient();
        setThemeGradient(hue1, hue2, rotation);
        document.documentElement.classList.add('gradient-mode');
    } else {
        const hue = loadThemeHue();
        setThemeHue(hue);
        document.documentElement.classList.remove('gradient-mode');
    }

    // Apply light/dark theme
    const theme = loadThemePreference();
    applyTheme(theme);
}
