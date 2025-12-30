/**
 * Viewport Auto-Scale
 *
 * Dynamically scales the app to fit the viewport.
 * Uses fixed design dimensions as reference, scales to fill available space.
 */

// Design dimensions (the size the app is designed for at scale=1)
const DESIGN_WIDTH = 1293;  // (1180-16)/0.9 = 1293
const DESIGN_HEIGHT = 893;  // (820-16)/0.9 = 893

function applyViewportScale() {
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    // Only apply scaling for tablet-sized viewports (landscape orientation)
    if (viewportWidth < 900 || viewportWidth > 1200) {
        document.body.style.transform = '';
        document.body.style.transformOrigin = '';
        document.body.style.width = '';
        document.body.style.marginLeft = '';
        return;
    }

    // Calculate scale to fit viewport while maintaining aspect ratio
    const padding = 16; // small edge padding
    const scaleX = (viewportWidth - padding) / DESIGN_WIDTH;
    const scaleY = (viewportHeight - padding) / DESIGN_HEIGHT;

    // Use the smaller scale to ensure everything fits
    const scale = Math.min(scaleX, scaleY);

    // Apply the scale
    document.body.style.transform = `scale(${scale})`;
    document.body.style.transformOrigin = 'top center';
    document.body.style.width = `${100 / scale}%`;
    document.body.style.marginLeft = `${(1 - 1 / scale) / 2 * 100}%`;

    console.log(`[Viewport] ${viewportWidth}x${viewportHeight} → scale: ${scale.toFixed(3)}`);
}

// Apply on load and resize
window.addEventListener('DOMContentLoaded', () => {
    // Delay slightly to ensure all modules are rendered
    setTimeout(applyViewportScale, 100);
});

window.addEventListener('resize', applyViewportScale);

// Also apply when orientation changes (mobile/tablet)
window.addEventListener('orientationchange', () => {
    setTimeout(applyViewportScale, 100);
});
