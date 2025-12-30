/**
 * Circuit Pattern Module - Animated PCB dithered patterns for spacer panels
 * Consolidated from tests/circuit-pattern-test/
 */

import { isGradientModeActive, getThemeColorRGB, getGradientColor1RGB, getGradientColor2RGB } from './gradient-utils.js';

// ============================================================================
// DITHERING
// ============================================================================

/**
 * PCB Circuit Dithering - Diagonal bias error diffusion
 * Creates 45° trace patterns mimicking printed circuit board routing
 * Works in greyscale to avoid colour fringing, then applies theme colours
 * Supports gradient mode (interpolates fgColour to fgColour2 across width)
 */
function circuitPCBDither(data, width, height, levels = 2, strength = 100, offset = 0, options = {}) {
    const output = new Uint8ClampedArray(data.length);
    const components = 4;

    // Theme colours for output mapping
    const fgColour = options.fgColour || { r: 255, g: 220, b: 50 };  // Theme colour (or gradient start)
    const fgColour2 = options.fgColour2 || fgColour;                 // Gradient end (same as start if not gradient)
    const bgColour = options.bgColour || { r: 17, g: 17, b: 17 };    // Background
    const useGradient = options.useGradient || false;

    // Single error buffer for luminance (no colour fringing)
    const errorBuffer = new Float32Array(width * height).fill(0);

    const strengthFactor = strength / 100;
    const step = 255 / (levels - 1);

    const diagonalBias = options.diagonalBias ?? 0.8;
    const connectivity = options.connectivity ?? 1.0;

    const offsetX = Math.floor(offset) % width;
    const offsetY = Math.floor(offset * 0.7) % height;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * components;
            const bufferIdx = y * width + x;

            // Convert to luminance (greyscale)
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const luminance = r * 0.299 + g * 0.587 + b * 0.114;

            const currentVal = luminance + errorBuffer[bufferIdx];

            // Quantise
            let outputValue;
            if (levels === 2) {
                outputValue = currentVal < 128 ? 0 : 255;
            } else {
                const level = currentVal / step;
                const quantised = Math.round(level);
                outputValue = Math.min(levels - 1, Math.max(0, quantised)) * step;
            }

            // Map to theme colours (0 = bg, 255 = fg)
            // In gradient mode, interpolate fg colour based on x position
            const t = outputValue / 255;
            let fg;
            if (useGradient) {
                const gradientT = x / (width - 1 || 1);
                fg = {
                    r: Math.round(fgColour.r + (fgColour2.r - fgColour.r) * gradientT),
                    g: Math.round(fgColour.g + (fgColour2.g - fgColour.g) * gradientT),
                    b: Math.round(fgColour.b + (fgColour2.b - fgColour.b) * gradientT)
                };
            } else {
                fg = fgColour;
            }
            output[idx] = Math.round(bgColour.r + (fg.r - bgColour.r) * t);
            output[idx + 1] = Math.round(bgColour.g + (fg.g - bgColour.g) * t);
            output[idx + 2] = Math.round(bgColour.b + (fg.b - bgColour.b) * t);
            output[idx + 3] = 255;

            const error = (currentVal - outputValue) * strengthFactor * connectivity;

            const px = (x + offsetX) % width;
            const py = (y + offsetY) % height;

            let rightWeight = 0;
            let downWeight = 0;
            let diagWeight = 0;

            if ((px + py) % 2 === 0) {
                diagWeight = diagonalBias;
                rightWeight = 1 - diagonalBias;
            } else {
                downWeight = 1.0;
            }

            if (x < width - 1) {
                errorBuffer[bufferIdx + 1] += error * rightWeight;
            }

            if (y < height - 1) {
                errorBuffer[bufferIdx + width] += error * downWeight;
            }

            if (x < width - 1 && y < height - 1) {
                errorBuffer[bufferIdx + width + 1] += error * diagWeight;
            }
        }
    }

    return output;
}

/**
 * Apply dithering with optional pixel size scaling
 */
function applyDither(data, width, height, levels = 2, strength = 100, offset = 0, options = {}) {
    return circuitPCBDither(data, width, height, levels, strength, offset, options);
}

// ============================================================================
// UTILITIES
// ============================================================================

function hexToRGB(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 220, b: 50 };
}

// ============================================================================
// IMAGE LOADING
// ============================================================================

const imageCache = new Map();

// Gradient-only sources (no images)
// Removed linear-h and linear-v as they create less interesting stripy patterns
export const ALL_SOURCES = [
    'radial',
    'diamond',
    'corner-tl',
    'corner-br',
    'linear-d'
];

export async function loadImage(imageName) {
    if (imageCache.has(imageName)) {
        return imageCache.get(imageName);
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            imageCache.set(imageName, img);
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${imageName}`));
        img.src = `images/circuit-sources/${imageName}.png`;
    });
}

export async function preloadImages(imageNames = []) {
    const results = await Promise.allSettled(imageNames.map(name => loadImage(name)));
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
        console.warn('[Circuit Pattern] Some images failed to load:', failed.length);
    }
}

// ============================================================================
// PATTERN GENERATOR
// ============================================================================

export class PatternGenerator {
    constructor(options = {}) {
        this.colour = options.colour || '#FFDC32';
        this.bgColour = options.bgColour || '#111111';
        this.levels = options.levels || 2;
        this.strength = options.strength || 100;
        this.density = options.density || 50;
        this.pixelSize = options.pixelSize || 2;
        this.sourceType = options.sourceType || 'radial';

        // Gradient support - RGB objects for foreground colours
        this.fgColour = options.fgColour || null;    // If null, use this.colour
        this.fgColour2 = options.fgColour2 || null;  // Second gradient colour
        this.useGradient = options.useGradient || false;

        this._sourceCanvas = document.createElement('canvas');
        this._sourceCtx = this._sourceCanvas.getContext('2d');

        this._densityCache = null;
        this._cacheParams = null;
    }

    isImageSource() {
        return this.sourceType.startsWith('image:');
    }

    getImageName() {
        if (!this.isImageSource()) return null;
        return this.sourceType.substring(6);
    }

    preCalculateDensities(width, height, step = 2) {
        const frames = [];
        const originalDensity = this.density;

        width = Math.max(1, width || 120);
        height = Math.max(1, height || 180);

        const workWidth = Math.max(1, Math.ceil(width / this.pixelSize));
        const workHeight = Math.max(1, Math.ceil(height / this.pixelSize));

        // Use gradient colours if provided, otherwise parse from hex
        const fgColour = this.fgColour || hexToRGB(this.colour);
        const fgColour2 = this.fgColour2 || fgColour;
        const bgColour = hexToRGB(this.bgColour);
        const useGradient = this.useGradient;

        for (let d = 0; d <= 100; d += step) {
            this.density = d;
            const sourceData = this._generateSource(workWidth, workHeight);
            const ditheredData = applyDither(
                sourceData.data,
                workWidth,
                workHeight,
                this.levels,
                this.strength,
                0,
                { pixelSize: 1, fgColour, fgColour2, bgColour, useGradient }
            );

            frames.push({
                density: d,
                data: ditheredData,
                width: workWidth,
                height: workHeight
            });
        }

        this.density = originalDensity;

        this._densityCache = frames;
        this._cacheParams = {
            width, height,
            levels: this.levels,
            strength: this.strength,
            sourceType: this.sourceType,
            pixelSize: this.pixelSize,
            colour: this.colour
        };

        return frames;
    }

    _isCacheValid(width, height) {
        if (!this._densityCache || !this._cacheParams) return false;
        const p = this._cacheParams;
        return p.width === width && p.height === height &&
               p.levels === this.levels && p.strength === this.strength &&
               p.sourceType === this.sourceType &&
               p.pixelSize === this.pixelSize && p.colour === this.colour;
    }

    getCachedFrame(density) {
        if (!this._densityCache) return null;

        let nearest = this._densityCache[0];
        let minDiff = Math.abs(density - nearest.density);

        for (const frame of this._densityCache) {
            const diff = Math.abs(density - frame.density);
            if (diff < minDiff) {
                minDiff = diff;
                nearest = frame;
            }
        }

        return nearest;
    }

    invalidateCache() {
        this._densityCache = null;
        this._cacheParams = null;
    }

    setOptions(options) {
        Object.assign(this, options);
    }

    /**
     * Generate source gradient with optional center offset for animation
     * @param {number} centerOffsetX - X offset for gradient center (-1 to 1, normalised)
     * @param {number} centerOffsetY - Y offset for gradient center (-1 to 1, normalised)
     */
    _generateSource(width, height, centerOffsetX = 0, centerOffsetY = 0) {
        width = Math.max(1, Math.floor(width) || 60);
        height = Math.max(1, Math.floor(height) || 90);

        this._sourceCanvas.width = width;
        this._sourceCanvas.height = height;

        const ctx = this._sourceCtx;
        const rgb = hexToRGB(this.colour);
        const bgRgb = hexToRGB(this.bgColour);

        ctx.fillStyle = this.bgColour;
        ctx.fillRect(0, 0, width, height);

        const densityFactor = this.density / 100;

        // Base center with animated offset (offset range creates ~20% drift)
        const driftAmount = 0.2;
        const cx = (width / 2) + (centerOffsetX * width * driftAmount);
        const cy = (height / 2) + (centerOffsetY * height * driftAmount);
        const maxDim = Math.max(width, height);

        if (this.isImageSource()) {
            return this._generateImageSource(width, height, rgb, bgRgb, densityFactor);
        }

        if (this.sourceType === 'diamond') {
            return this._generateDiamondSource(width, height, rgb, bgRgb, densityFactor, centerOffsetX, centerOffsetY);
        }

        let gradient;

        switch (this.sourceType) {
            case 'radial':
                // Radial gradient with drifting center
                gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDim * 0.6);
                break;
            case 'linear-h':
                gradient = ctx.createLinearGradient(0, 0, width, 0);
                break;
            case 'linear-v':
                gradient = ctx.createLinearGradient(0, 0, 0, height);
                break;
            case 'linear-d':
                // Diagonal gradient with animated angle via offset
                const angle = Math.atan2(height, width) + (centerOffsetX * 0.3);
                const len = Math.sqrt(width * width + height * height);
                const endX = Math.cos(angle) * len;
                const endY = Math.sin(angle) * len;
                gradient = ctx.createLinearGradient(0, 0, endX, endY);
                break;
            case 'corner-tl':
                // Corner gradient with drifting focal point
                const tlX = centerOffsetX * width * driftAmount;
                const tlY = centerOffsetY * height * driftAmount;
                gradient = ctx.createRadialGradient(tlX, tlY, 0, tlX, tlY, maxDim * 0.8);
                break;
            case 'corner-br':
                // Corner gradient with drifting focal point
                const brX = width + (centerOffsetX * width * driftAmount);
                const brY = height + (centerOffsetY * height * driftAmount);
                gradient = ctx.createRadialGradient(brX, brY, 0, brX, brY, maxDim * 0.8);
                break;
            default:
                gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxDim * 0.6);
        }

        gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${densityFactor})`);
        gradient.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${densityFactor * 0.5})`);
        gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        return ctx.getImageData(0, 0, width, height);
    }

    /**
     * Generate a single frame in real-time with animated parameters
     * Used for dynamic animations (offset flow + center drift)
     */
    generateRealtimeFrame(width, height, offset = 0, centerOffsetX = 0, centerOffsetY = 0) {
        width = Math.max(1, Math.ceil(width / this.pixelSize));
        height = Math.max(1, Math.ceil(height / this.pixelSize));

        // Get gradient colours
        const fgColour = this.fgColour || hexToRGB(this.colour);
        const fgColour2 = this.fgColour2 || fgColour;
        const bgColour = hexToRGB(this.bgColour);

        // Generate source with center drift
        const sourceData = this._generateSource(width, height, centerOffsetX, centerOffsetY);

        // Apply dithering with animated offset
        const ditheredData = applyDither(
            sourceData.data,
            width,
            height,
            this.levels,
            this.strength,
            offset,
            { pixelSize: 1, fgColour, fgColour2, bgColour, useGradient: this.useGradient }
        );

        return {
            data: ditheredData,
            width: width,
            height: height
        };
    }

    /**
     * Render a real-time generated frame to canvas
     */
    renderRealtimeFrame(canvas, offset = 0, centerOffsetX = 0, centerOffsetY = 0) {
        if (!canvas) return;

        const width = canvas.offsetWidth || 120;
        const height = canvas.offsetHeight || 180;

        const frame = this.generateRealtimeFrame(width, height, offset, centerOffsetX, centerOffsetY);

        canvas.width = frame.width;
        canvas.height = frame.height;

        const ctx = canvas.getContext('2d');
        const imageData = new ImageData(frame.data, frame.width, frame.height);
        ctx.putImageData(imageData, 0, 0);
    }

    _generateImageSource(width, height, rgb, bgRgb, densityFactor) {
        const imageName = this.getImageName();
        const img = imageCache.get(imageName);

        const ctx = this._sourceCtx;

        if (!img) {
            return ctx.getImageData(0, 0, width, height);
        }

        const imgAspect = img.width / img.height;
        const canvasAspect = width / height;

        let drawWidth, drawHeight, drawX, drawY;

        if (imgAspect > canvasAspect) {
            drawHeight = height;
            drawWidth = height * imgAspect;
            drawX = (width - drawWidth) / 2;
            drawY = 0;
        } else {
            drawWidth = width;
            drawHeight = width / imgAspect;
            drawX = 0;
            drawY = (height - drawHeight) / 2;
        }

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const grey = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
            const intensity = (1 - grey) * densityFactor;

            data[i] = Math.floor(bgRgb.r + (rgb.r - bgRgb.r) * intensity);
            data[i + 1] = Math.floor(bgRgb.g + (rgb.g - bgRgb.g) * intensity);
            data[i + 2] = Math.floor(bgRgb.b + (rgb.b - bgRgb.b) * intensity);
            data[i + 3] = 255;
        }

        return imageData;
    }

    _generateDiamondSource(width, height, rgb, bgRgb, densityFactor, centerOffsetX = 0, centerOffsetY = 0) {
        const imageData = this._sourceCtx.createImageData(width, height);
        const data = imageData.data;

        // Diamond center with animated drift
        const driftAmount = 0.2;
        const cx = (width / 2) + (centerOffsetX * width * driftAmount);
        const cy = (height / 2) + (centerOffsetY * height * driftAmount);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;

                const dx = Math.abs(x - cx) / (width / 2);
                const dy = Math.abs(y - cy) / (height / 2);
                const manhattan = (dx + dy) / 2;
                let intensity = (1 - manhattan) * densityFactor;

                intensity = Math.max(0, Math.min(1, intensity));

                data[idx] = Math.floor(bgRgb.r + (rgb.r - bgRgb.r) * intensity);
                data[idx + 1] = Math.floor(bgRgb.g + (rgb.g - bgRgb.g) * intensity);
                data[idx + 2] = Math.floor(bgRgb.b + (rgb.b - bgRgb.b) * intensity);
                data[idx + 3] = 255;
            }
        }

        return imageData;
    }

    generate(width, height) {
        width = Math.max(1, width || 120);
        height = Math.max(1, height || 180);

        const workWidth = Math.max(1, Math.ceil(width / this.pixelSize));
        const workHeight = Math.max(1, Math.ceil(height / this.pixelSize));

        const sourceData = this._generateSource(workWidth, workHeight);

        // Use gradient colours if provided, otherwise parse from hex
        const fgColour = this.fgColour || hexToRGB(this.colour);
        const fgColour2 = this.fgColour2 || fgColour;
        const bgColour = hexToRGB(this.bgColour);
        const useGradient = this.useGradient;

        const ditheredData = applyDither(
            sourceData.data,
            workWidth,
            workHeight,
            this.levels,
            this.strength,
            0,
            { pixelSize: 1, fgColour, fgColour2, bgColour, useGradient }
        );

        return {
            data: ditheredData,
            width: workWidth,
            height: workHeight
        };
    }

    renderToCanvas(canvas, width, height) {
        const targetWidth = width || canvas.offsetWidth || 120;
        const targetHeight = height || canvas.offsetHeight || 180;

        if (this._isCacheValid(targetWidth, targetHeight)) {
            const frame = this.getCachedFrame(this.density);
            if (frame) {
                canvas.width = frame.width;
                canvas.height = frame.height;
                const ctx = canvas.getContext('2d');
                const imageData = ctx.createImageData(frame.width, frame.height);
                imageData.data.set(frame.data);
                ctx.putImageData(imageData, 0, 0);
                return;
            }
        }

        const result = this.generate(targetWidth, targetHeight);

        canvas.width = result.width;
        canvas.height = result.height;

        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(result.width, result.height);
        imageData.data.set(result.data);
        ctx.putImageData(imageData, 0, 0);
    }

    renderCachedFrame(canvas, density) {
        const frame = this.getCachedFrame(density);
        if (!frame) return false;

        canvas.width = frame.width;
        canvas.height = frame.height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(frame.width, frame.height);
        imageData.data.set(frame.data);
        ctx.putImageData(imageData, 0, 0);
        return true;
    }
}

// ============================================================================
// SPACER PATTERN MANAGER
// ============================================================================

/**
 * Manages animated circuit patterns for spacer panels
 */
export class SpacerPatternManager {
    constructor(canvasId, options = {}) {
        this.canvasId = canvasId;
        this.canvas = null;
        this.generator = null;
        this.animationId = null;

        // Animation state - density breathing
        this.density = 50;
        this.direction = 1;
        this.speed = options.speed || 0.3;

        // Animation state - offset flow (makes traces appear to crawl)
        this.offset = 0;
        this.offsetSpeed = options.offsetSpeed || 0.8;  // Slow crawl

        // Animation state - center drift (Lissajous-like figure-8 path)
        this.centerPhase = Math.random() * Math.PI * 2;  // Random start phase
        this.centerSpeedX = options.centerSpeedX || 0.008;  // Very slow drift
        this.centerSpeedY = options.centerSpeedY || 0.011;  // Slightly different for organic feel

        // Pattern options
        this.colour = options.colour || this._getThemeColour();
        this.bgColour = options.bgColour || this._getBgColour();
        this.pixelSize = options.pixelSize || 1;
        this.levels = options.levels || 2;
        this.strength = options.strength || 100;
        this.sourceType = options.sourceType || null;  // Optional: force specific source type

        // Frame timing for consistent animation speed
        this.lastFrameTime = 0;
        this.targetFPS = 24;  // Lower FPS for efficiency (still smooth enough)
        this.frameInterval = 1000 / this.targetFPS;

        this._boundAnimationFrame = this._animationFrame.bind(this);

        // Listen for theme changes (including gradient mode toggle)
        this._boundThemeChanged = this.updateColours.bind(this);
        document.addEventListener('themeChanged', this._boundThemeChanged);
    }

    _getThemeColour() {
        // Use gradient-utils for proper theme colour detection
        const rgb = getThemeColorRGB();
        return `#${rgb.r.toString(16).padStart(2, '0')}${rgb.g.toString(16).padStart(2, '0')}${rgb.b.toString(16).padStart(2, '0')}`;
    }

    _getBgColour() {
        const style = getComputedStyle(document.documentElement);
        return style.getPropertyValue('--bg-module').trim() || '#111111';
    }

    _getGradientColours() {
        // Returns { useGradient, fgColour, fgColour2 }
        if (isGradientModeActive()) {
            return {
                useGradient: true,
                fgColour: getGradientColor1RGB(),
                fgColour2: getGradientColor2RGB()
            };
        } else {
            const rgb = getThemeColorRGB();
            return {
                useGradient: false,
                fgColour: rgb,
                fgColour2: rgb
            };
        }
    }

    /**
     * Initialise the pattern manager
     */
    async init() {
        this.canvas = document.getElementById(this.canvasId);
        if (!this.canvas) {
            console.warn(`[Circuit Pattern] Canvas not found: ${this.canvasId}`);
            return false;
        }

        // Get gradient colours
        const gradientInfo = this._getGradientColours();

        // Use specified source or select random
        const selectedSource = this.sourceType || ALL_SOURCES[Math.floor(Math.random() * ALL_SOURCES.length)];

        // If image source, ensure it's loaded
        if (selectedSource.startsWith('image:')) {
            const imageName = selectedSource.substring(6);
            try {
                await loadImage(imageName);
            } catch (err) {
                console.warn(`[Circuit Pattern] Failed to load image: ${imageName}, using radial`);
                this.generator = new PatternGenerator({
                    colour: this.colour,
                    bgColour: this.bgColour,
                    pixelSize: this.pixelSize,
                    levels: this.levels,
                    strength: this.strength,
                    sourceType: 'radial',
                    fgColour: gradientInfo.fgColour,
                    fgColour2: gradientInfo.fgColour2,
                    useGradient: gradientInfo.useGradient
                });
                this._preCalculate();
                return true;
            }
        }

        this.generator = new PatternGenerator({
            colour: this.colour,
            bgColour: this.bgColour,
            pixelSize: this.pixelSize,
            levels: this.levels,
            strength: this.strength,
            sourceType: selectedSource,
            fgColour: gradientInfo.fgColour,
            fgColour2: gradientInfo.fgColour2,
            useGradient: gradientInfo.useGradient
        });

        this._preCalculate();
        console.log(`[Circuit Pattern] Initialised with source: ${selectedSource}`);
        return true;
    }

    _preCalculate() {
        if (!this.canvas || !this.generator) return;

        const width = this.canvas.offsetWidth || 120;
        const height = this.canvas.offsetHeight || 180;

        this.generator.preCalculateDensities(width, height, 2);
    }

    /**
     * Start the evolving animation
     */
    startAnimation() {
        if (this.animationId) return;
        this.lastFrameTime = performance.now();
        this._boundAnimationFrame();
    }

    /**
     * Stop the animation
     */
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    _animationFrame(timestamp = performance.now()) {
        if (!this.canvas || !this.generator) {
            this.animationId = null;
            return;
        }

        // Frame rate limiting for efficiency
        const elapsed = timestamp - this.lastFrameTime;
        if (elapsed < this.frameInterval) {
            this.animationId = requestAnimationFrame(this._boundAnimationFrame);
            return;
        }
        this.lastFrameTime = timestamp - (elapsed % this.frameInterval);

        // Update density (breathing between 50-100)
        this.density += this.direction * this.speed;
        if (this.density >= 100) {
            this.density = 100;
            this.direction = -1;
        } else if (this.density <= 50) {
            this.density = 50;
            this.direction = 1;
        }

        // Update offset (flowing traces)
        this.offset += this.offsetSpeed;
        if (this.offset > 1000) this.offset = 0;  // Prevent overflow

        // Update center drift phase (Lissajous-like motion)
        this.centerPhase += 0.01;
        if (this.centerPhase > Math.PI * 200) this.centerPhase = 0;  // Prevent overflow

        // Calculate center offsets using sin/cos for smooth figure-8 like motion
        // Different frequencies create organic, non-repeating paths
        const centerOffsetX = Math.sin(this.centerPhase * this.centerSpeedX * 100);
        const centerOffsetY = Math.sin(this.centerPhase * this.centerSpeedY * 100 + Math.PI / 3);

        // Update generator density for real-time rendering
        this.generator.density = this.density;

        // Render real-time frame with all animated parameters
        this.generator.renderRealtimeFrame(this.canvas, this.offset, centerOffsetX, centerOffsetY);

        // Continue animation
        this.animationId = requestAnimationFrame(this._boundAnimationFrame);
    }

    /**
     * Select a new random source and recalculate
     */
    async selectRandomSource() {
        if (!this.generator) return;

        const randomSource = ALL_SOURCES[Math.floor(Math.random() * ALL_SOURCES.length)];

        // If image source, ensure it's loaded
        if (randomSource.startsWith('image:')) {
            const imageName = randomSource.substring(6);
            try {
                await loadImage(imageName);
            } catch (err) {
                console.warn(`[Circuit Pattern] Failed to load image: ${imageName}`);
                return;
            }
        }

        // Get current gradient colours
        const gradientInfo = this._getGradientColours();

        this.generator.setOptions({
            sourceType: randomSource,
            fgColour: gradientInfo.fgColour,
            fgColour2: gradientInfo.fgColour2,
            useGradient: gradientInfo.useGradient
        });
        // No need to rebuild cache - real-time rendering uses updated options directly

        console.log(`[Circuit Pattern] Source changed to: ${randomSource}`);
    }

    /**
     * Update theme colours (including gradient mode changes)
     * Real-time rendering picks up new colours automatically on next frame
     */
    updateColours() {
        if (!this.generator) return;

        this.colour = this._getThemeColour();
        this.bgColour = this._getBgColour();

        // Get current gradient colours
        const gradientInfo = this._getGradientColours();

        this.generator.setOptions({
            colour: this.colour,
            bgColour: this.bgColour,
            fgColour: gradientInfo.fgColour,
            fgColour2: gradientInfo.fgColour2,
            useGradient: gradientInfo.useGradient
        });
        // No need to rebuild cache - real-time rendering uses updated options directly
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.stopAnimation();
        document.removeEventListener('themeChanged', this._boundThemeChanged);
        this.generator = null;
        this.canvas = null;
    }
}
