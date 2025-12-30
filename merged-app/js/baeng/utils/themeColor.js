// File: js/utils/themeColor.js
// Theme color and hue rotation utilities

/**
 * Set theme hue by updating CSS custom properties
 * @param {number} hue - Hue value (0-360 degrees)
 */
export function setThemeHue(hue) {
    const saturation = 100;
    const lightness = 60;

    // Convert HSL to RGB for the theme color
    const { r, g, b } = hslToRgb(hue, saturation, lightness);

    // Update CSS custom properties
    const root = document.documentElement;
    root.style.setProperty('--theme-color', `hsl(${hue}, ${saturation}%, ${lightness}%)`);
    root.style.setProperty('--theme-color-r', r);
    root.style.setProperty('--theme-color-g', g);
    root.style.setProperty('--theme-color-b', b);

    // Update hover color (slightly lighter)
    root.style.setProperty('--theme-color-hover', `hsl(${hue}, ${saturation}%, ${lightness + 10}%)`);

    // Dispatch theme changed event for canvas components to re-render
    document.dispatchEvent(new CustomEvent('themeChanged', { detail: { type: 'hue', hue } }));
}

/**
 * Convert HSL to RGB
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {object} RGB values {r, g, b} (0-255)
 */
function hslToRgb(h, s, l) {
    h = h / 360;
    s = s / 100;
    l = l / 100;

    let r, g, b;

    if (s === 0) {
        r = g = b = l; // Achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

/**
 * Load saved theme hue from localStorage
 * @returns {number} Hue value (0-360), defaults to 45 (yellow)
 */
export function loadThemeHue() {
    const saved = localStorage.getItem('themeHue');
    return saved !== null ? parseInt(saved, 10) : 45; // Default to yellow (45°)
}

/**
 * Save theme hue to localStorage
 * @param {number} hue - Hue value (0-360)
 */
export function saveThemeHue(hue) {
    localStorage.setItem('themeHue', hue.toString());
}

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
// Gradient Theme System
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
    const { r: r1, g: g1, b: b1 } = hslToRgb(hue1, saturation, lightness);
    const { r: r2, g: g2, b: b2 } = hslToRgb(hue2, saturation, lightness);

    // Calculate midpoint hue for borders/text
    // Use circular mean for hue to handle wraparound (e.g., 350° + 10° = 0°, not 180°)
    let midHue = (hue1 + hue2) / 2;
    // If hues are more than 180° apart, they're going the long way around the color wheel
    if (Math.abs(hue2 - hue1) > 180) {
        midHue = (midHue + 180) % 360;
    }
    const { r: rMid, g: gMid, b: bMid } = hslToRgb(midHue, saturation, lightness);

    const root = document.documentElement;

    // Set color 1
    root.style.setProperty('--theme-color-1', `hsl(${hue1}, ${saturation}%, ${lightness}%)`);
    root.style.setProperty('--theme-color-1-r', r1);
    root.style.setProperty('--theme-color-1-g', g1);
    root.style.setProperty('--theme-color-1-b', b1);

    // Set color 2
    root.style.setProperty('--theme-color-2', `hsl(${hue2}, ${saturation}%, ${lightness}%)`);
    root.style.setProperty('--theme-color-2-r', r2);
    root.style.setProperty('--theme-color-2-g', g2);
    root.style.setProperty('--theme-color-2-b', b2);

    // Set midpoint color (for borders/text)
    root.style.setProperty('--theme-color', `hsl(${midHue}, ${saturation}%, ${lightness}%)`);
    root.style.setProperty('--theme-color-r', rMid);
    root.style.setProperty('--theme-color-g', gMid);
    root.style.setProperty('--theme-color-b', bMid);

    // Set gradients with rotation
    root.style.setProperty('--theme-gradient-h',
        `linear-gradient(${rotation}deg, hsl(${hue1}, ${saturation}%, ${lightness}%), hsl(${hue2}, ${saturation}%, ${lightness}%))`);
    // Vertical gradient is rotated 90° from horizontal
    root.style.setProperty('--theme-gradient-v',
        `linear-gradient(${(rotation + 90) % 360}deg, hsl(${hue1}, ${saturation}%, ${lightness}%), hsl(${hue2}, ${saturation}%, ${lightness}%))`);

    // Update hover color (midpoint + 10% lightness)
    root.style.setProperty('--theme-color-hover', `hsl(${midHue}, ${saturation}%, ${Math.min(lightness + 10, 100)}%)`);

    // Update SVG gradient definitions for use in gradient mode
    // Updates both Bæng (gradient-stroke/fill) and Ræmbl (raembl-gradient-stroke/fill)
    const color1 = `hsl(${hue1}, ${saturation}%, ${lightness}%)`;
    const color2 = `hsl(${hue2}, ${saturation}%, ${lightness}%)`;

    // Helper to update a single SVG gradient element
    const updateSVGGradient = (id) => {
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

    // Update Bæng SVG gradients
    updateSVGGradient('gradient-stroke');
    updateSVGGradient('gradient-fill');

    // Update Ræmbl SVG gradients
    updateSVGGradient('raembl-gradient-stroke');
    updateSVGGradient('raembl-gradient-fill');

    // Dispatch theme changed event for canvas components to re-render
    document.dispatchEvent(new CustomEvent('themeChanged', { detail: { type: 'gradient', hue1, hue2, rotation } }));
}

/**
 * Load saved gradient hues from localStorage
 * @returns {object} {hue1, hue2, rotation}
 */
export function loadThemeGradient() {
    let hue1 = localStorage.getItem('themeGradientHue1');
    let hue2 = localStorage.getItem('themeGradientHue2');
    let rotation = localStorage.getItem('themeGradientRotation');

    // Migration: if old single hue exists and no gradient hues, create gradient from it
    if (hue1 === null && hue2 === null) {
        const oldHue = localStorage.getItem('themeHue');
        if (oldHue !== null) {
            hue1 = oldHue;
            // Create a complementary-ish color (135° offset)
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

/**
 * Check if gradient mode is enabled
 * @returns {boolean}
 */
export function isGradientModeEnabled() {
    return localStorage.getItem('gradientModeEnabled') === 'true';
}

/**
 * Enable or disable gradient mode
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
    document.dispatchEvent(new CustomEvent('themeChanged', { detail: { type: 'mode', enabled } }));
}

/**
 * Initialize theme based on saved preferences
 * Should be called on page load
 */
export function initializeTheme() {
    const gradientEnabled = isGradientModeEnabled();

    if (gradientEnabled) {
        const { hue1, hue2, rotation } = loadThemeGradient();
        setThemeGradient(hue1, hue2, rotation);
        document.documentElement.classList.add('gradient-mode');
    } else {
        const hue = loadThemeHue();
        setThemeHue(hue);
        document.documentElement.classList.remove('gradient-mode');
    }
}
