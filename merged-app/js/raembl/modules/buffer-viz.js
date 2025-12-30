/**
 * Buffer Visualisation - Real-time waveform display for Clouds buffer
 *
 * Shows:
 * - Waveform of circular buffer contents
 * - Write head position (red line)
 * - Loop region boundaries (yellow highlight in looping-delay mode)
 * - Freeze state (dimmed when frozen)
 */

import { createThemeGradient } from '../../shared/gradient-utils.js';

export class BufferVisualisation {
  constructor(canvasId, cloudsNode) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.cloudsNode = cloudsNode;

    // Buffer data (will be populated from processor)
    this.bufferData = null;
    this.writeHead = 0;
    this.bufferSize = 262144; // Default Clouds buffer size

    // Loop region (for looping-delay mode)
    this.loopStart = 0;
    this.loopEnd = 0;

    // Position parameter (0-1) for scrolling modes
    this.position = 0;

    // Scroll offset for pitch-shifter and looping delay modes
    this.scrollOffset = 0;
    this.lastScrollTime = performance.now();

    // State
    this.frozen = false;
    this.animationId = null;
    this.isRunning = false;
    this.isOutputWaveform = false; // True for Oliverb/Resonestor output viz
    this.modeName = null;
    this.frameCount = 0; // For throttled colour refresh

    // VU meter levels (0-1)
    this.inputLevel = 0;
    this.outputLevel = 0;
    this.vuDecay = 0.92; // Decay rate for smooth falloff
    this.numVuDots = 8; // Number of VU dots per side
    this.vuDotSize = 6; // Size of each VU dot in pixels
    this.vuPadding = 2; // Padding from canvas edge

    // Colours - read from CSS variables for theme support
    this.colours = {
      background: '#0A0A0A',
      waveform: '#FFDC32',
      waveformOutput: '#FFDC32',
      writeHead: '#FFDC32',
      readHead: '#FFDC32',
      loopRegion: 'rgba(255, 220, 50, 0.2)',
      loopBorder: 'rgba(255, 220, 50, 0.6)',
      gridLine: '#222222'
    };
    // Initial colour refresh
    this.refreshColours();

    // Bind methods
    this.draw = this.draw.bind(this);

    // Request buffer data periodically
    this.setupBufferRequest();
  }

  /**
   * Setup periodic buffer data requests from processor
   */
  setupBufferRequest() {
    // Request buffer data every 50ms when running
    this.requestInterval = null;
  }

  /**
   * Start visualisation
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Start requesting buffer data
    this.requestInterval = setInterval(() => {
      this.requestBufferData();
    }, 50);

    // Start animation loop
    this.draw();
  }

  /**
   * Stop visualisation
   */
  stop() {
    this.isRunning = false;

    if (this.requestInterval) {
      clearInterval(this.requestInterval);
      this.requestInterval = null;
    }

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Request buffer data from processor
   */
  requestBufferData() {
    if (this.cloudsNode) {
      this.cloudsNode.port.postMessage({ command: 'getBufferData' });
    }
  }

  /**
   * Update buffer data from processor
   * @param {Object} data - Buffer data from processor
   */
  updateBuffer(data) {
    // Reset output waveform flag - will be set if applicable
    this.isOutputWaveform = false;
    this.modeName = null;

    if (data.waveform) {
      this.bufferData = data.waveform;
    }
    if (typeof data.writeHead === 'number') {
      this.writeHead = data.writeHead;
    }
    if (typeof data.bufferSize === 'number') {
      this.bufferSize = data.bufferSize;
    }
    if (typeof data.loopStart === 'number') {
      this.loopStart = data.loopStart;
    }
    if (typeof data.loopEnd === 'number') {
      this.loopEnd = data.loopEnd;
    }
    if (typeof data.frozen === 'boolean') {
      this.frozen = data.frozen;
    }
    if (typeof data.isOutputWaveform === 'boolean') {
      this.isOutputWaveform = data.isOutputWaveform;
    }
    if (data.modeName) {
      this.modeName = data.modeName;
    }
    if (typeof data.position === 'number') {
      this.position = data.position;
    }

    // Update info display
    this.updateInfoDisplay();
  }

  /**
   * Update info display elements (if they exist)
   */
  updateInfoDisplay() {
    // These elements are optional - may not exist in simplified UI
    const writeHeadEl = document.getElementById('write-head-pos');
    const loopRegionEl = document.getElementById('loop-region');

    if (writeHeadEl) {
      writeHeadEl.textContent = `Write: ${this.writeHead}`;
    }
    if (loopRegionEl) {
      loopRegionEl.textContent = `Loop: ${this.loopStart} - ${this.loopEnd}`;
    }
  }

  /**
   * Check if current mode uses scrolling visualisation
   * All buffer-based modes use scrolling for consistency
   * Only output waveform modes (Oliverb/Resonestor) remain static
   */
  isScrollingMode() {
    return !this.isOutputWaveform;
  }

  /**
   * Refresh colours from CSS variables (for theme changes)
   */
  refreshColours() {
    const computedStyle = getComputedStyle(document.documentElement);
    const themeColor = computedStyle.getPropertyValue('--theme-color').trim() || '#FFDC32';
    const bgCanvas = computedStyle.getPropertyValue('--bg-canvas').trim() || '#0A0A0A';
    const gridColor = computedStyle.getPropertyValue('--border-grey-1').trim() || '#222222';

    // Get theme colour RGB for semi-transparent colours
    const themeR = parseInt(computedStyle.getPropertyValue('--theme-color-r')) || 255;
    const themeG = parseInt(computedStyle.getPropertyValue('--theme-color-g')) || 220;
    const themeB = parseInt(computedStyle.getPropertyValue('--theme-color-b')) || 50;

    this.colours.background = bgCanvas;
    this.colours.waveform = themeColor;
    this.colours.waveformOutput = themeColor;
    this.colours.writeHead = themeColor;
    this.colours.readHead = themeColor;
    this.colours.loopRegion = `rgba(${themeR}, ${themeG}, ${themeB}, 0.2)`;
    this.colours.loopBorder = `rgba(${themeR}, ${themeG}, ${themeB}, 0.6)`;
    this.colours.gridLine = gridColor;
  }

  /**
   * Main draw loop
   */
  draw() {
    if (!this.isRunning) return;

    // Update theme colours every 60 frames (~1 second at 60fps)
    this.frameCount++;
    if (this.frameCount % 60 === 0) {
      this.refreshColours();
    }

    const { canvas, ctx, colours } = this;
    const width = canvas.width;
    const height = canvas.height;

    // Update scroll offset for scrolling modes
    if (this.isScrollingMode() && !this.frozen) {
      const now = performance.now();
      const deltaTime = (now - this.lastScrollTime) / 1000;
      this.lastScrollTime = now;

      // Scroll speed - pixels per second (adjust for feel)
      const scrollSpeed = 60;
      this.scrollOffset = (this.scrollOffset + scrollSpeed * deltaTime) % width;
    }

    // Clear canvas
    ctx.fillStyle = colours.background;
    ctx.fillRect(0, 0, width, height);

    // Draw grid lines
    this.drawGrid();

    // Draw loop region (only in looping-delay mode and has valid region)
    if (this.modeName === 'looping' && this.loopStart !== this.loopEnd) {
      this.drawLoopRegion();
    }

    // Draw waveform (scrolling or static based on mode)
    if (this.isScrollingMode()) {
      this.drawScrollingWaveform();
    } else {
      this.drawWaveform();
    }

    // Draw write head (only for non-scrolling modes)
    if (!this.isScrollingMode()) {
      this.drawWriteHead();
    }

    // Draw read head for scrolling modes (position indicator)
    if (this.isScrollingMode()) {
      this.drawReadHead();
    }

    // Draw VU meters on sides
    this.drawVUMeters();

    // Schedule next frame
    this.animationId = requestAnimationFrame(this.draw);
  }

  /**
   * Draw background grid - DISABLED for clean look
   */
  drawGrid() {
    // Grid removed for cleaner appearance
  }

  /**
   * Draw loop region highlight
   */
  drawLoopRegion() {
    const { ctx, canvas, colours, loopStart, loopEnd, bufferSize } = this;
    const width = canvas.width;
    const height = canvas.height;

    // Convert buffer positions to canvas X coordinates
    const startX = (loopStart / bufferSize) * width;
    const endX = (loopEnd / bufferSize) * width;
    const regionWidth = endX - startX;

    // Fill loop region
    ctx.fillStyle = colours.loopRegion;
    ctx.fillRect(startX, 0, regionWidth, height);

    // Draw borders
    ctx.strokeStyle = colours.loopBorder;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, height);
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, height);
    ctx.stroke();
  }

  /**
   * Draw waveform from buffer data
   */
  drawWaveform() {
    const { ctx, canvas, colours, bufferData } = this;
    const width = canvas.width;
    const height = canvas.height;

    // If no buffer data, draw placeholder
    if (!bufferData || bufferData.length === 0) {
      ctx.fillStyle = '#444444';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No buffer data', width / 2, height / 2 + 3);
      return;
    }

    // Draw waveform - use theme gradient for colour
    // Both regular and output waveforms use the same gradient
    ctx.strokeStyle = createThemeGradient(ctx, 0, 0, width, 0);
    ctx.lineWidth = 1;
    ctx.beginPath();

    const step = bufferData.length / width;

    for (let x = 0; x < width; x++) {
      const dataIndex = Math.floor(x * step);
      const value = bufferData[dataIndex] || 0;

      // Map -1..1 to canvas height
      const y = height / 2 - (value * height / 2);

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  /**
   * Draw write head position
   */
  drawWriteHead() {
    const { ctx, canvas, colours, writeHead, bufferSize, frozen } = this;
    const width = canvas.width;
    const height = canvas.height;

    // Don't show write head for output waveforms (Oliverb/Resonestor)
    if (this.isOutputWaveform) return;

    // Don't show write head when frozen (it's static)
    if (frozen) return;

    // Convert buffer position to canvas X coordinate
    const x = (writeHead / bufferSize) * width;

    // Draw vertical line with theme gradient
    ctx.strokeStyle = createThemeGradient(ctx, 0, 0, width, 0);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  /**
   * Draw scrolling waveform for pitch-shifter and looping delay modes
   * The waveform scrolls horizontally, wrapping around
   */
  drawScrollingWaveform() {
    const { ctx, canvas, colours, bufferData, scrollOffset } = this;
    const width = canvas.width;
    const height = canvas.height;

    // If no buffer data, draw placeholder
    if (!bufferData || bufferData.length === 0) {
      ctx.fillStyle = '#444444';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No buffer data', width / 2, height / 2 + 3);
      return;
    }

    // Use theme gradient for waveform colour
    ctx.strokeStyle = createThemeGradient(ctx, 0, 0, width, 0);
    ctx.lineWidth = 1;
    ctx.beginPath();

    const step = bufferData.length / width;

    // Draw waveform with scroll offset (wrapping)
    for (let x = 0; x < width; x++) {
      // Calculate scrolled x position (wrap around)
      const scrolledX = (x + scrollOffset) % width;
      const dataIndex = Math.floor(scrolledX * step);
      const value = bufferData[dataIndex] || 0;

      // Map -1..1 to canvas height
      const y = height / 2 - (value * height / 2);

      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }

  /**
   * Draw read head position for scrolling modes
   * Shows where in the buffer the position parameter is reading from
   */
  drawReadHead() {
    const { ctx, canvas, colours, position } = this;
    const width = canvas.width;
    const height = canvas.height;

    // Position parameter (0-1) maps to canvas X
    // Centre of canvas when position = 0.5
    const x = position * width;

    // Draw vertical line with glow effect using theme gradient
    const headGradient = createThemeGradient(ctx, 0, 0, width, 0);
    ctx.strokeStyle = headGradient;
    ctx.lineWidth = 2;
    ctx.shadowColor = colours.readHead; // Shadow needs solid colour
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();

    // Reset shadow
    ctx.shadowBlur = 0;

    // Draw small triangular marker at top
    ctx.fillStyle = headGradient;
    ctx.beginPath();
    ctx.moveTo(x - 4, 0);
    ctx.lineTo(x + 4, 0);
    ctx.lineTo(x, 6);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Set freeze state
   * @param {boolean} frozen
   */
  setFrozen(frozen) {
    this.frozen = frozen;
  }

  /**
   * Update input VU level
   * @param {number} rms - RMS level (0-1)
   */
  updateInputLevel(rms) {
    const displayLevel = this.rmsToDisplay(rms);
    if (displayLevel > this.inputLevel) {
      this.inputLevel = displayLevel;
    } else {
      this.inputLevel *= this.vuDecay;
    }
  }

  /**
   * Update output VU level
   * @param {number} rms - RMS level (0-1)
   */
  updateOutputLevel(rms) {
    const displayLevel = this.rmsToDisplay(rms);
    if (displayLevel > this.outputLevel) {
      this.outputLevel = displayLevel;
    } else {
      this.outputLevel *= this.vuDecay;
    }
  }

  /**
   * Convert RMS to display level (0-1)
   * Uses quasi-logarithmic scale for better visual response
   */
  rmsToDisplay(rms) {
    if (rms <= 0) return 0;
    return Math.pow(rms, 0.5);
  }

  /**
   * Draw VU meters on both sides of the canvas
   * Only draws when there's signal - disappears when silent
   */
  drawVUMeters() {
    const { ctx, canvas } = this;
    const height = canvas.height;
    const dotSize = this.vuDotSize;
    const padding = this.vuPadding;
    const numDots = this.numVuDots;

    // Don't draw anything if both levels are effectively zero
    const minLevel = 0.01;
    if (this.inputLevel < minLevel && this.outputLevel < minLevel) {
      return;
    }

    // Calculate vertical spacing to distribute dots evenly
    const totalDotsHeight = numDots * dotSize + (numDots - 1) * 2; // 2px gap
    const startY = (height - totalDotsHeight) / 2;

    // Get theme colour for VU dots
    const themeR = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--theme-color-r')) || 255;
    const themeG = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--theme-color-g')) || 220;
    const themeB = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--theme-color-b')) || 50;

    // Draw input VU (left side) - bottom to top, only if there's signal
    if (this.inputLevel >= minLevel) {
      const inputActiveDots = Math.floor(this.inputLevel * numDots);
      for (let i = 0; i < numDots; i++) {
        const y = startY + (numDots - 1 - i) * (dotSize + 2); // Bottom to top
        const isActive = i < inputActiveDots;
        const isClip = i === numDots - 1 && this.inputLevel > 0.95;

        if (isClip) {
          ctx.fillStyle = '#FF4444'; // Red for clipping
          ctx.fillRect(padding, y, dotSize, dotSize);
        } else if (isActive) {
          ctx.fillStyle = `rgb(${themeR}, ${themeG}, ${themeB})`;
          ctx.fillRect(padding, y, dotSize, dotSize);
        }
        // Don't draw inactive dots - they disappear
      }
    }

    // Draw output VU (right side) - bottom to top, only if there's signal
    if (this.outputLevel >= minLevel) {
      const outputActiveDots = Math.floor(this.outputLevel * numDots);
      const rightX = canvas.width - padding - dotSize;
      for (let i = 0; i < numDots; i++) {
        const y = startY + (numDots - 1 - i) * (dotSize + 2); // Bottom to top
        const isActive = i < outputActiveDots;
        const isClip = i === numDots - 1 && this.outputLevel > 0.95;

        if (isClip) {
          ctx.fillStyle = '#FF4444'; // Red for clipping
          ctx.fillRect(rightX, y, dotSize, dotSize);
        } else if (isActive) {
          ctx.fillStyle = `rgb(${themeR}, ${themeG}, ${themeB})`;
          ctx.fillRect(rightX, y, dotSize, dotSize);
        }
        // Don't draw inactive dots - they disappear
      }
    }
  }
}
