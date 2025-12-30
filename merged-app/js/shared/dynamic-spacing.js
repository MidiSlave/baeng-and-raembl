/**
 * Dynamic Module Spacing System
 *
 * Ræmbl bottom row is the fixed reference (always BASE_GAP).
 * Other rows adjust their gaps to fit within the reference width.
 * Rows with more content use smaller gaps; rows with less content use larger gaps.
 */

// Configuration
const CONFIG = {
    BASE_GAP: 10,         // Default gap for the widest row
    MIN_GAP: 6,           // Minimum gap in pixels
    MAX_GAP: 40,          // Maximum gap in pixels
    DEBOUNCE_MS: 100,     // Resize debounce delay
    INIT_DELAY_MS: 150    // Initial calculation delay (allow DOM to settle)
};

// Fixed reference row selector (Ræmbl bottom row is always the reference)
const REFERENCE_ROW_SELECTOR = '.raembl-app .bottom-row';

// Other rows that adjust to fit within the reference width
const ADJUSTABLE_ROW_SELECTORS = [
    '#baeng-main-row',
    '.raembl-app .top-row'
];

/**
 * Measures total width of modules (excluding gaps) in a row
 * @param {Element} rowElement - The row container element
 * @returns {{ moduleWidth: number, moduleCount: number }}
 */
function measureRowModules(rowElement) {
    const modules = rowElement.querySelectorAll('.module');
    let totalWidth = 0;

    modules.forEach(module => {
        // Use computed style to get width unaffected by transforms
        const style = getComputedStyle(module);
        const width = parseFloat(style.width) || 0;
        const marginLeft = parseFloat(style.marginLeft) || 0;
        const marginRight = parseFloat(style.marginRight) || 0;
        totalWidth += width + marginLeft + marginRight;
    });

    return {
        moduleWidth: totalWidth,
        moduleCount: modules.length
    };
}

/**
 * Main calculation and application function
 */
function updateDynamicSpacing() {
    // Step 1: Measure reference row (Ræmbl bottom row)
    const referenceRow = document.querySelector(REFERENCE_ROW_SELECTOR);
    if (!referenceRow) {
        console.warn('[DynamicSpacing] Reference row not found');
        return;
    }

    const { moduleWidth: refModuleWidth, moduleCount: refModuleCount } = measureRowModules(referenceRow);
    if (refModuleCount <= 1) {
        console.warn('[DynamicSpacing] Reference row has insufficient modules');
        return;
    }

    const refGapCount = refModuleCount - 1;

    // Step 2: Reference row always gets BASE_GAP - calculate reference width
    const referenceWidth = refModuleWidth + (refGapCount * CONFIG.BASE_GAP);
    referenceRow.style.width = `${referenceWidth}px`;
    referenceRow.style.flexWrap = 'nowrap';
    referenceRow.style.justifyContent = 'space-between';
    referenceRow.style.gap = `${CONFIG.MIN_GAP}px`;  // Minimum gap between modules

    // Store for time strip to use
    currentRowWidth = referenceWidth;

    // Step 3: Adjust other rows to fit within reference width
    ADJUSTABLE_ROW_SELECTORS.forEach(selector => {
        const row = document.querySelector(selector);
        if (!row) return;

        const { moduleWidth, moduleCount } = measureRowModules(row);
        if (moduleCount <= 1) return;

        const gapCount = moduleCount - 1;

        // Calculate gap to fit within reference width
        // referenceWidth = moduleWidth + (gapCount * gap)
        // gap = (referenceWidth - moduleWidth) / gapCount
        let gap = (referenceWidth - moduleWidth) / gapCount;

        row.style.width = `${referenceWidth}px`;
        row.style.flexWrap = 'nowrap';
        row.style.justifyContent = 'space-between';
        row.style.gap = `${CONFIG.MIN_GAP}px`;  // Minimum gap between modules
    });

    // Dispatch event for time strip to sync its width
    document.dispatchEvent(new CustomEvent('rowWidthChanged', {
        detail: { width: currentRowWidth }
    }));
}

// Debounce utility
let debounceTimer = null;
function debouncedUpdate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateDynamicSpacing, CONFIG.DEBOUNCE_MS);
}

/**
 * Initialises the dynamic spacing system
 */
function initDynamicSpacing() {
    // Initial calculation after DOM settles
    setTimeout(updateDynamicSpacing, CONFIG.INIT_DELAY_MS);

    // Listen for resize
    window.addEventListener('resize', debouncedUpdate);

    // Listen for orientation change
    window.addEventListener('orientationchange', () => {
        setTimeout(updateDynamicSpacing, CONFIG.INIT_DELAY_MS);
    });

    // Listen for module re-renders (FX mode change)
    document.addEventListener('modulesRerendered', () => {
        setTimeout(updateDynamicSpacing, 50);
    });

}

// Auto-init on DOMContentLoaded
window.addEventListener('DOMContentLoaded', initDynamicSpacing);

// Store the current calculated width for time strip to use
let currentRowWidth = 0;

/**
 * Gets the current calculated row width
 * @returns {number} The width in pixels that rows are aligned to
 */
function getRowWidth() {
    return currentRowWidth;
}

// Export for manual triggering if needed
window.updateDynamicSpacing = updateDynamicSpacing;
window.getRowWidth = getRowWidth;
