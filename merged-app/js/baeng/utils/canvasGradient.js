// Canvas gradient utilities for theme system integration
// Re-exports from shared gradient utilities for backward compatibility

// Import and re-export from shared utilities
export {
    createThemeGradient,
    createRadialThemeGradient,
    isGradientModeActive,
    isGradientModeEnabled,
    setGradientMode,
    getThemeColor,
    getAccentColor,
    getThemeVar,
    getThemeColorRGB,
    getGradientColor1RGB,
    getGradientColor2RGB,
    rgbToRgba
} from '../../shared/gradient-utils.js';
