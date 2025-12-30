/**
 * Slice Editor Module
 *
 * Provides a modal interface for slicing audio samples with waveform visualization,
 * transient detection, manual marker editing, and slice configuration export.
 *
 * Features:
 * - Waveform rendering with zoom and scroll
 * - Automatic transient detection
 * - Manual slice marker editing (drag, add, delete)
 * - Grid-based slicing (2-64 slices)
 * - Sample trimming and rotation
 * - JSON export/import of slice configurations
 * - Slice preview playback
 * - Keyboard shortcuts
 *
 * @module slice-editor
 */

import { loadSliceConfig, saveSliceConfig } from './slice-config-storage.js';
import {
    createThemeGradient,
    createRadialThemeGradient,
    isGradientModeActive,
    getThemeColor,
    getThemeVar
} from '../../../shared/gradient-utils.js';

export class SliceEditor {
    /**
     * Create a new SliceEditor instance
     * @param {HTMLElement} modalElement - The modal container element
     * @param {AudioContext} audioContext - Web Audio API context
     */
    constructor(modalElement, audioContext) {
        this.modal = modalElement;
        this.audioContext = audioContext;

        // State
        this.audioBuffer = null;
        this.sampleRate = 0;
        this.fileName = '';
        this.sliceMarkers = [];  // Array of sample positions
        this.zoom = 1;
        this.scrollOffset = 0;
        this.selectedMarker = null;
        this.isDragging = false;
        this.dragStartX = 0;
        this.modalOffset = { x: 0, y: 0 };
        this.hoveredSlice = -1;
        this.currentPlayingSource = null;
        this.currentSliceIndex = 0;
        this.currentPlayingSliceIndex = -1;
        this.currentVoiceIndex = null;  // Track which voice/track this editor is editing (for keyboard routing)

        // Playhead state for real-time position display
        this.playheadPosition = 0;  // 0-1 normalised position within playing slice
        this._playheadAnimationId = null;  // RAF ID for batched render updates

        // Sample editing
        this.trimStart = 0;
        this.trimEnd = null;
        this.rotationOffset = 0;
        this.lastRotationValue = 0;      // For fine rotation control
        this.rotationFineMode = false;   // Shift key held = fine mode
        this.isDraggingTrimStart = false;
        this.isDraggingTrimEnd = false;

        // Scrollbar dragging
        this.scrollbarDragMode = null; // 'center', 'left-edge', 'right-edge'
        this.scrollbarDragStartX = 0;
        this.scrollbarDragStartZoom = 1;
        this.scrollbarDragStartScrollOffset = 0;
        this.scrollbarDragStartRelativeX = 0;

        // DOM elements
        this.waveformCanvas = null;
        this.waveformCtx = null;
        this.scrollbarThumb = null;
        this.scrollbarTrack = null;

        // Callbacks
        this.onDone = null;  // Called when user clicks Done
        this.onCancel = null;  // Called when user closes modal

        this._initializeDOM();
        this._attachEventListeners();
    }

    /**
     * Initialize DOM element references
     * @private
     */
    _initializeDOM() {
        // Canvas
        this.waveformCanvas = this.modal.querySelector('#baeng-slice-waveform');
        this.waveformCtx = this.waveformCanvas.getContext('2d');

        // Scrollbar
        this.scrollbarThumb = this.modal.querySelector('#baeng-slice-scrollbar-thumb');
        this.scrollbarTrack = this.modal.querySelector('#baeng-slice-scrollbar-track');

        // Controls
        this.gridSlider = this.modal.querySelector('#baeng-slice-grid-slider');
        this.thresholdSlider = this.modal.querySelector('#baeng-slice-threshold-slider');
        this.rotationSlider = this.modal.querySelector('#baeng-slice-rotation-slider');

        // Buttons
        this.detectBtn = this.modal.querySelector('#baeng-slice-detect-btn');
        this.clearBtn = this.modal.querySelector('#baeng-slice-clear-all-btn');
        this.exportBtn = this.modal.querySelector('#baeng-slice-export-json-btn');
        this.doneBtn = this.modal.querySelector('#baeng-slice-done-btn');
        this.closeBtn = this.modal.querySelector('#baeng-slice-close-btn');

        // Info displays
        this.waveformDuration = this.modal.querySelector('#baeng-slice-waveform-duration');
        this.waveformZoom = this.modal.querySelector('#baeng-slice-waveform-zoom');
        this.waveformSlices = this.modal.querySelector('#baeng-slice-waveform-slices');
        this.gridValue = this.modal.querySelector('#baeng-slice-grid-value');
        this.thresholdValue = this.modal.querySelector('#baeng-slice-threshold-value');
        this.rotationValue = this.modal.querySelector('#baeng-slice-rotation-value');
    }

    /**
     * Attach all event listeners
     * @private
     */
    _attachEventListeners() {
        // Modal dragging
        const modalHeader = this.modal.querySelector('.baeng-app .modal-header');
        this._setupModalDragging(modalHeader);

        // Canvas interactions
        this.waveformCanvas.addEventListener('mousedown', this._handleCanvasMouseDown.bind(this));
        this.waveformCanvas.addEventListener('mousemove', this._handleCanvasMouseMove.bind(this));
        this.waveformCanvas.addEventListener('mouseup', this._handleCanvasMouseUp.bind(this));
        this.waveformCanvas.addEventListener('mouseleave', this._handleCanvasMouseLeave.bind(this));
        this.waveformCanvas.addEventListener('dblclick', this._handleCanvasDoubleClick.bind(this));
        this.waveformCanvas.addEventListener('wheel', this._handleCanvasWheel.bind(this));

        // Scrollbar
        this.scrollbarThumb.addEventListener('mousedown', this._handleScrollbarMouseDown.bind(this));

        // Control sliders
        this.gridSlider.addEventListener('input', this._handleGridSliderChange.bind(this));
        this.thresholdSlider.addEventListener('input', this._handleThresholdSliderChange.bind(this));
        this.rotationSlider.addEventListener('input', this._handleRotationSliderChange.bind(this));

        // Buttons
        this.detectBtn.addEventListener('click', this._handleDetectTransients.bind(this));
        this.clearBtn.addEventListener('click', this._handleClearAll.bind(this));
        this.exportBtn.addEventListener('click', this._handleExportJSON.bind(this));
        this.doneBtn.addEventListener('click', this._handleDone.bind(this));
        this.closeBtn.addEventListener('click', this._handleClose.bind(this));

        // Keyboard shortcuts
        document.addEventListener('keydown', this._handleKeyDown.bind(this));

        // Track Shift key for fine rotation control
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') this.rotationFineMode = true;
        });
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') this.rotationFineMode = false;
        });
    }

    /**
     * Open the slice editor with an audio buffer
     * @param {AudioBuffer} buffer - The audio buffer to edit
     * @param {Object} existingSliceConfig - Optional existing slice configuration
     * @param {string} fileName - Optional file name
     * @param {number} voiceIndex - Optional voice/track index (0-5) for keyboard routing
     */
    open(buffer, existingSliceConfig = null, fileName = 'sample.wav', voiceIndex = null) {
        this.audioBuffer = buffer;
        this.fileName = fileName;
        this.sampleRate = buffer.sampleRate;
        this.currentVoiceIndex = voiceIndex;  // Store which voice is being edited
        this.sliceMarkers = [];
        this.trimStart = 0;
        this.trimEnd = buffer.length;
        this.rotationOffset = 0;
        this.lastRotationValue = 0;
        this.zoom = 1;
        this.scrollOffset = 0;

        // Try to load saved config if none provided
        if (!existingSliceConfig) {
            existingSliceConfig = loadSliceConfig(buffer, fileName);
        }

        // Load existing slice config if available
        if (existingSliceConfig && existingSliceConfig.slices && existingSliceConfig.slices.length > 0) {
            const slices = existingSliceConfig.slices;

            // Restore trim positions from first and last slice
            this.trimStart = slices[0].start;
            this.trimEnd = slices[slices.length - 1].end;

            // Extract markers (start positions of slices 1 onwards)
            this.sliceMarkers = slices
                .slice(1)  // Skip first slice (its start = trimStart)
                .map(slice => slice.start);

            // Sync grid slider to loaded slice count
            const loadedSliceCount = this.sliceMarkers.length + 1;
            if (this.gridSlider) {
                this.gridSlider.value = loadedSliceCount;
                // Update the displayed value
                const valueDisplay = document.getElementById('baeng-slice-grid-value');
                if (valueDisplay) {
                    valueDisplay.textContent = loadedSliceCount;
                }
            }

            console.log(`[SliceEditor] Loaded config: trimStart=${this.trimStart}, trimEnd=${this.trimEnd}, ${loadedSliceCount} slices`);
        }

        // Update UI
        this._updateInfoDisplay();
        this._updateHeaderDisplay();
        this._renderWaveform();

        // Show modal
        this.modal.classList.add('active');

        const voiceLabel = voiceIndex !== null ? ` for voice ${voiceIndex + 1}` : '';
    }

    /**
     * Close the slice editor
     */
    close() {
        // Stop any playing audio
        if (this.currentPlayingSource) {
            this.currentPlayingSource.stop();
            this.currentPlayingSource = null;
        }

        // Clear playback state
        this.currentPlayingSliceIndex = -1;
        this.playheadPosition = 0;
        if (this._playheadAnimationId) {
            cancelAnimationFrame(this._playheadAnimationId);
            this._playheadAnimationId = null;
        }

        // Hide modal
        this.modal.classList.remove('active');

        if (this.onCancel) {
            this.onCancel();
        }

    }

    /**
     * Set the currently playing slice index (called from engine during sequencer playback)
     * @param {number} sliceIndex - Index of the playing slice, or -1 to clear
     */
    setPlayingSlice(sliceIndex) {
        if (this.currentPlayingSliceIndex !== sliceIndex) {
            this.currentPlayingSliceIndex = sliceIndex;
            this.playheadPosition = 0;
            this._renderWaveform();
        }
    }

    /**
     * Update playhead position within the current slice (for real-time playhead rendering)
     * @param {number} normalisedPosition - Position within slice (0-1)
     */
    updatePlayheadPosition(normalisedPosition) {
        this.playheadPosition = normalisedPosition;

        // Use RAF to batch render updates
        if (!this._playheadAnimationId) {
            this._playheadAnimationId = requestAnimationFrame(() => {
                this._renderWaveform();
                this._playheadAnimationId = null;
            });
        }
    }

    /**
     * Get the current slice configuration
     * @returns {Object} Slice configuration object
     */
    getSliceConfig() {
        if (!this.audioBuffer) {
            return null;
        }

        // Sort markers
        const sortedMarkers = [...this.sliceMarkers].sort((a, b) => a - b);

        // Create slices array
        const slices = [];
        let start = Math.floor(this.trimStart + this.rotationOffset);

        for (let i = 0; i <= sortedMarkers.length; i++) {
            const end = i < sortedMarkers.length
                ? sortedMarkers[i]
                : Math.floor(this.trimEnd + this.rotationOffset);

            slices.push({
                id: i,
                start: start,
                end: end,
                method: sortedMarkers[i] ? 'manual' : 'manual'
            });

            start = end;
        }

        return {
            version: '1.0',
            sampleName: this.fileName,
            sampleRate: this.sampleRate,
            bufferLength: this.audioBuffer.length,
            slices: slices,
            metadata: {
                created: new Date().toISOString(),
                creator: 'Bæng Slice Editor v1.0'
            }
        };
    }

    /**
     * Update info display
     * @private
     */
    _updateInfoDisplay() {
        if (!this.audioBuffer) return;

        const duration = this.audioBuffer.duration.toFixed(2);
        const sliceCount = this.sliceMarkers.length + 1;

        this.waveformDuration.textContent = `Duration: ${duration}s`;
        this.waveformZoom.textContent = `Zoom: ${this.zoom}x`;
        this.waveformSlices.textContent = `Slices: ${sliceCount}`;
    }

    /**
     * Update modal header with sample name
     * @private
     */
    _updateHeaderDisplay() {
        const headerTitle = this.modal.querySelector('.baeng-app .modal-header h2');
        if (headerTitle) {
            // Check if there's a stored config for this sample
            const configInfo = loadSliceConfig(this.audioBuffer, this.fileName);
            const sliceCount = this.sliceMarkers.length + 1;
            const hasStoredConfig = configInfo !== null;

            headerTitle.innerHTML = `
                SLICE EDITOR
                <span class="header-sample-name">${this.fileName}</span>
                ${hasStoredConfig ? '<span class="header-config-badge" title="Saved configuration exists">✓</span>' : ''}
            `;
        }
    }

    /**
     * Render the waveform with rotation and gradient support
     * Source: test/slice-editor/slice-editor-test.html lines 1250-1444
     * @private
     */
    _renderWaveform() {
        if (!this.audioBuffer) {
            console.warn('[SliceEditor] No audio buffer to render');
            return;
        }

        const canvas = this.waveformCanvas;
        const ctx = this.waveformCtx;
        const width = canvas.width;
        const height = canvas.height;

        // Get mono channel data
        const bufferData = this.audioBuffer.getChannelData(0);
        const totalSamples = bufferData.length;
        const visibleSamples = Math.floor(totalSamples / this.zoom);
        const startSample = Math.floor(this.scrollOffset * totalSamples);
        const endSample = Math.min(startSample + visibleSamples, totalSamples);

        // Helper function to read from buffer with rotation offset (within trim bounds only)
        const getRotatedSample = (index) => {
            const trimEnd = this.trimEnd !== null ? this.trimEnd : totalSamples;

            // If outside trim bounds, return sample as-is (no rotation)
            if (index < this.trimStart || index >= trimEnd) {
                return bufferData[index];
            }

            // Rotate within trim bounds
            const trimmedLength = trimEnd - this.trimStart;
            const positionInTrim = index - this.trimStart;
            const rotatedPosition = (positionInTrim + this.rotationOffset + trimmedLength) % trimmedLength;
            const rotatedIndex = this.trimStart + rotatedPosition;

            return bufferData[rotatedIndex];
        };

        // Detect theme from CSS
        const theme = this._detectTheme();

        // Clear canvas
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas');
        ctx.fillRect(0, 0, width, height);

        // Draw inverted region for currently playing slice
        if (this.currentPlayingSliceIndex !== -1) {
            const trimEnd = this.trimEnd !== null ? this.trimEnd : totalSamples;
            const markers = [this.trimStart, ...this.sliceMarkers, trimEnd];

            // Ensure index is valid
            if (this.currentPlayingSliceIndex < markers.length - 1) {
                const sliceStart = markers[this.currentPlayingSliceIndex];
                const sliceEnd = markers[this.currentPlayingSliceIndex + 1];

                // Only draw if slice is visible in current view
                if (sliceStart < endSample && sliceEnd > startSample) {
                    const x1 = Math.max(0, ((sliceStart - startSample) / visibleSamples) * width);
                    const x2 = Math.min(width, ((sliceEnd - startSample) / visibleSamples) * width);


                    // Invert: Fill with gradient in gradient mode, solid colour otherwise
                    if (theme === 'gradient') {
                        ctx.fillStyle = createThemeGradient(ctx, x1, 0, x2, 0);
                    } else {
                        ctx.fillStyle = getThemeColor();
                    }
                    ctx.fillRect(x1, 0, x2 - x1, height);
                }
            }
        }

        // Draw waveform using peak downsampling
        const samplesPerPixel = (endSample - startSample) / width;

        // Determine if we need to draw inverted waveform
        let invertedX1 = -1, invertedX2 = -1;
        if (this.currentPlayingSliceIndex !== -1) {
            const trimEnd = this.trimEnd !== null ? this.trimEnd : totalSamples;
            const markers = [this.trimStart, ...this.sliceMarkers, trimEnd];

            // Ensure index is valid
            if (this.currentPlayingSliceIndex < markers.length - 1) {
                const sliceStart = markers[this.currentPlayingSliceIndex];
                const sliceEnd = markers[this.currentPlayingSliceIndex + 1];

                if (sliceStart < endSample && sliceEnd > startSample) {
                    invertedX1 = Math.max(0, ((sliceStart - startSample) / visibleSamples) * width);
                    invertedX2 = Math.min(width, ((sliceEnd - startSample) / visibleSamples) * width);
                }
            }
        }

        // Draw waveform in segments for solid color
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';

        // Draw non-inverted region
        // Use gradient in gradient mode, otherwise use solid theme colour
        if (theme === 'gradient') {
            ctx.strokeStyle = createThemeGradient(ctx, 0, 0, width, 0);
        } else {
            ctx.strokeStyle = getThemeColor();
        }
        ctx.beginPath();

        for (let x = 0; x < width; x++) {
            // Skip if we're in the inverted region
            if (invertedX1 !== -1 && x >= invertedX1 && x <= invertedX2) continue;

            const sampleStart = startSample + Math.floor(x * samplesPerPixel);
            const sampleEnd = startSample + Math.floor((x + 1) * samplesPerPixel);

            // Find min/max in this range (peak downsampling) with rotation
            let min = 0, max = 0;
            for (let i = sampleStart; i < sampleEnd && i < totalSamples; i++) {
                const sample = getRotatedSample(i);
                if (sample < min) min = sample;
                if (sample > max) max = sample;
            }

            const yMin = height / 2 - (min * height / 2);
            const yMax = height / 2 - (max * height / 2);

            ctx.moveTo(x, yMin);
            ctx.lineTo(x, yMax);
        }
        ctx.stroke();

        // Draw inverted region if exists
        if (invertedX1 !== -1 && invertedX2 !== -1) {
            ctx.strokeStyle = '#000000';
            ctx.beginPath();

            for (let x = Math.floor(invertedX1); x <= Math.ceil(invertedX2); x++) {
                const sampleStart = startSample + Math.floor(x * samplesPerPixel);
                const sampleEnd = startSample + Math.floor((x + 1) * samplesPerPixel);

                // Find min/max in this range (peak downsampling) with rotation
                let min = 0, max = 0;
                for (let i = sampleStart; i < sampleEnd && i < totalSamples; i++) {
                    const sample = getRotatedSample(i);
                    if (sample < min) min = sample;
                    if (sample > max) max = sample;
                }

                const yMin = height / 2 - (min * height / 2);
                const yMax = height / 2 - (max * height / 2);

                ctx.moveTo(x, yMin);
                ctx.lineTo(x, yMax);
            }
            ctx.stroke();
        }

        // Draw center line - use theme colour with transparency
        const centerLineColor = getThemeColor(0.2);

        if (invertedX1 !== -1 && invertedX2 !== -1) {
            // Draw center line in two parts if there's an inverted region

            // Normal region before inverted section
            if (invertedX1 > 0) {
                ctx.strokeStyle = centerLineColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, height / 2);
                ctx.lineTo(invertedX1, height / 2);
                ctx.stroke();
            }

            // Inverted region (black centerline)
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(invertedX1, height / 2);
            ctx.lineTo(invertedX2, height / 2);
            ctx.stroke();

            // Normal region after inverted section
            if (invertedX2 < width) {
                ctx.strokeStyle = centerLineColor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(invertedX2, height / 2);
                ctx.lineTo(width, height / 2);
                ctx.stroke();
            }
        } else {
            // No inverted region, draw normally
            ctx.strokeStyle = centerLineColor;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, height / 2);
            ctx.lineTo(width, height / 2);
            ctx.stroke();
        }

        // Draw hovered slice region
        this._drawHoveredSlice();

        // Draw trim regions (grayed out areas)
        this._drawTrimRegions();

        // Draw slice markers
        this._drawSliceMarkers();

        // Draw trim handles (on top of everything)
        this._drawTrimHandles();

        // Draw playhead for sequencer playback (on top of everything)
        this._drawPlayhead();

        // Update scrollbar
        this._updateScrollbar();
    }

    /**
     * Draw playhead line showing current playback position within the active slice
     * Called during sequencer playback when position updates are received from AudioWorklet
     * @private
     */
    _drawPlayhead() {
        // Only draw if a slice is currently playing and we have a valid position
        if (this.currentPlayingSliceIndex === -1 || this.playheadPosition <= 0) {
            return;
        }

        if (!this.audioBuffer) return;

        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;
        const totalSamples = this.audioBuffer.length;
        const visibleSamples = Math.floor(totalSamples / this.zoom);
        const startSample = Math.floor(this.scrollOffset * totalSamples);
        const endSample = Math.min(startSample + visibleSamples, totalSamples);

        const trimEnd = this.trimEnd !== null ? this.trimEnd : totalSamples;
        const markers = [this.trimStart, ...this.sliceMarkers, trimEnd].sort((a, b) => a - b);

        // Ensure index is valid
        if (this.currentPlayingSliceIndex >= markers.length - 1) return;

        const sliceStart = markers[this.currentPlayingSliceIndex];
        const sliceEnd = markers[this.currentPlayingSliceIndex + 1];
        const sliceLength = sliceEnd - sliceStart;

        // Calculate playhead sample position
        const playheadSample = sliceStart + (this.playheadPosition * sliceLength);

        // Check if playhead is visible in current view
        if (playheadSample < startSample || playheadSample > endSample) return;

        // Convert to canvas X coordinate
        const playheadX = ((playheadSample - startSample) / visibleSamples) * width;

        // Draw playhead line (theme colour, 2px wide)
        const playheadColor = getThemeColor();
        ctx.strokeStyle = playheadColor;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);  // Solid line
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, height);
        ctx.stroke();

        // Draw small triangle at top (playhead indicator)
        ctx.fillStyle = playheadColor;
        ctx.beginPath();
        ctx.moveTo(playheadX - 5, 0);
        ctx.lineTo(playheadX + 5, 0);
        ctx.lineTo(playheadX, 8);
        ctx.closePath();
        ctx.fill();
    }

    /**
     * Draw slice markers with drag handles and delete buttons
     * Source: test/slice-editor/slice-editor-test.html lines 1446-1555
     * @private
     */
    _drawSliceMarkers() {
        if (!this.audioBuffer) return;

        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;
        const totalSamples = this.audioBuffer.length;
        const visibleSamples = Math.floor(totalSamples / this.zoom);
        const startSample = Math.floor(this.scrollOffset * totalSamples);
        const endSample = Math.min(startSample + visibleSamples, totalSamples);

        const theme = this._detectTheme();

        // Draw start marker (slice 0 indicator)
        if (startSample === 0) {
            ctx.strokeStyle = getThemeColor(0.5);
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(0, height);
            ctx.stroke();
            ctx.setLineDash([]);

            // Draw "0" label
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-grey-3');
            ctx.font = '10px monospace';
            ctx.fillText('0', 3, 15);
        }

        // Draw user-created markers
        this.sliceMarkers.forEach((markerPos, index) => {
            if (markerPos < startSample || markerPos > endSample) return;

            const x = ((markerPos - startSample) / (endSample - startSample)) * width;
            const isSelected = this.selectedMarker === index;

            // Draw marker line (gradient in gradient mode, otherwise theme colour)
            if (theme === 'gradient') {
                ctx.strokeStyle = createThemeGradient(ctx, x, 0, x, height);
            } else {
                ctx.strokeStyle = isSelected ?
                    getThemeVar('--theme-color-hover', getThemeColor()) :
                    getThemeColor();
            }
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();

            // Draw drag handle (circle at top)
            if (theme === 'gradient') {
                ctx.fillStyle = createRadialThemeGradient(ctx, x, 10, 0, x, 10, 6);
            } else {
                ctx.fillStyle = ctx.strokeStyle;
            }
            ctx.beginPath();
            ctx.arc(x, 10, 6, 0, Math.PI * 2);
            ctx.fill();

            // Draw DELETE button (X in circle at bottom)
            const deleteY = height - 10;
            const deleteRadius = 8;

            // Circle (gradient in gradient mode)
            if (theme === 'gradient') {
                ctx.fillStyle = createRadialThemeGradient(ctx, x, deleteY, 0, x, deleteY, deleteRadius);
            } else {
                ctx.fillStyle = getThemeColor();
            }
            ctx.beginPath();
            ctx.arc(x, deleteY, deleteRadius, 0, Math.PI * 2);
            ctx.fill();

            // Black X
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            const xSize = 4;
            ctx.beginPath();
            ctx.moveTo(x - xSize, deleteY - xSize);
            ctx.lineTo(x + xSize, deleteY + xSize);
            ctx.moveTo(x + xSize, deleteY - xSize);
            ctx.lineTo(x - xSize, deleteY + xSize);
            ctx.stroke();

            // Draw slice number (above marker, shifted right)
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-grey-3');
            ctx.font = '10px monospace';
            ctx.fillText(`${index + 1}`, x + 8, 15);
        });

        // Draw end marker indicator
        if (endSample === totalSamples) {
            ctx.strokeStyle = getThemeColor(0.5);
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(width - 1, 0);
            ctx.lineTo(width - 1, height);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    /**
     * Draw trim regions (grayed out areas outside trim bounds)
     * Source: test/slice-editor/slice-editor-test.html lines 1563-1588
     * @private
     */
    _drawTrimRegions() {
        if (!this.audioBuffer) return;

        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;
        const totalSamples = this.audioBuffer.length;
        const visibleSamples = Math.floor(totalSamples / this.zoom);
        const startSample = Math.floor(this.scrollOffset * totalSamples);
        const endSample = Math.min(startSample + visibleSamples, totalSamples);

        const trimEnd = this.trimEnd !== null ? this.trimEnd : totalSamples;

        // Draw left trim region (before trimStart)
        if (this.trimStart > startSample) {
            const trimStartX = ((this.trimStart - startSample) / (endSample - startSample)) * width;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(0, 0, trimStartX, height);
        }

        // Draw right trim region (after trimEnd)
        if (trimEnd < endSample) {
            const trimEndX = ((trimEnd - startSample) / (endSample - startSample)) * width;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(trimEndX, 0, width - trimEndX, height);
        }
    }

    /**
     * Draw trim handles (draggable trim start/end markers)
     * Source: test/slice-editor/slice-editor-test.html lines 1590-1650
     * @private
     */
    _drawTrimHandles() {
        if (!this.audioBuffer) return;

        const ctx = this.waveformCtx;
        const width = this.waveformCanvas.width;
        const height = this.waveformCanvas.height;
        const totalSamples = this.audioBuffer.length;
        const visibleSamples = Math.floor(totalSamples / this.zoom);
        const startSample = Math.floor(this.scrollOffset * totalSamples);
        const endSample = Math.min(startSample + visibleSamples, totalSamples);

        const trimEnd = this.trimEnd !== null ? this.trimEnd : totalSamples;
        const handleWidth = 3;  // Thin line

        const theme = this._detectTheme();

        // Determine colours based on theme
        let handleColor, handleColorHover;
        if (theme === 'gradient') {
            // Use gradient
            handleColor = createThemeGradient(ctx, 0, 0, 0, height);
            handleColorHover = handleColor;  // Same gradient for hover
        } else {
            handleColor = getThemeColor();
            handleColorHover = getThemeVar('--theme-color-hover', getThemeColor());
        }

        // Draw trim start handle
        if (this.trimStart >= startSample && this.trimStart <= endSample) {
            const x = ((this.trimStart - startSample) / (endSample - startSample)) * width;

            // Thin vertical line
            ctx.fillStyle = this.isDraggingTrimStart ? handleColorHover : handleColor;
            ctx.fillRect(x - handleWidth / 2, 0, handleWidth, height);

            // Small label at top
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas');
            ctx.fillRect(x - 15, 5, 30, 12);
            ctx.fillStyle = this.isDraggingTrimStart ? handleColorHover : handleColor;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('START', x, 14);
        }

        // Draw trim end handle
        if (trimEnd >= startSample && trimEnd <= endSample) {
            const x = ((trimEnd - startSample) / (endSample - startSample)) * width;

            // Thin vertical line
            ctx.fillStyle = this.isDraggingTrimEnd ? handleColorHover : handleColor;
            ctx.fillRect(x - handleWidth / 2, 0, handleWidth, height);

            // Small label at top
            ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-canvas');
            ctx.fillRect(x - 12, 5, 24, 12);
            ctx.fillStyle = this.isDraggingTrimEnd ? handleColorHover : handleColor;
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('END', x, 14);
        }
    }

    /**
     * Draw hovered slice region (stub - hover highlighting disabled)
     * @private
     */
    _drawHoveredSlice() {
        // Hover highlighting removed - click now creates slices instead of auditioning
        // Use spacebar to audition slices
        return;
    }

    /**
     * Detect theme mode from CSS variables
     * Uses shared gradient utility for consistent detection
     * @private
     * @returns {string} 'gradient', 'light', or 'dark'
     */
    _detectTheme() {
        // Use shared utility for gradient mode detection
        if (isGradientModeActive()) {
            return 'gradient';
        }

        // Check for light mode
        if (document.documentElement.getAttribute('data-theme') === 'light') {
            return 'light';
        }

        return 'dark';  // Default
    }

    /**
     * Update scrollbar thumb position
     * @private
     */
    _updateScrollbar() {
        if (!this.scrollbarThumb || !this.scrollbarTrack) return;

        const trackWidth = this.scrollbarTrack.offsetWidth;
        const thumbWidth = Math.max(20, trackWidth / this.zoom);
        const thumbLeft = this.scrollOffset * (trackWidth - thumbWidth);

        this.scrollbarThumb.style.width = `${thumbWidth}px`;
        this.scrollbarThumb.style.left = `${thumbLeft}px`;
    }

    /**
     * Convert canvas X coordinate to sample position
     * Source: test/slice-editor/slice-editor-test.html lines 1872-1879
     * @private
     */
    _xToSample(x) {
        const totalSamples = this.audioBuffer.length;
        const visibleSamples = Math.floor(totalSamples / this.zoom);
        const startSample = Math.floor(this.scrollOffset * totalSamples);
        const pixelToSample = visibleSamples / this.waveformCanvas.width;
        // Use Math.round instead of Math.floor to center on cursor crosshair
        return startSample + Math.round(x * pixelToSample);
    }

    /**
     * Convert sample position to canvas X coordinate
     * Source: test/slice-editor/slice-editor-test.html lines 1915-1924
     * @private
     */
    _sampleToX(samplePos) {
        const totalSamples = this.audioBuffer.length;
        const visibleSamples = Math.floor(totalSamples / this.zoom);
        const startSample = Math.floor(this.scrollOffset * totalSamples);
        const endSample = Math.min(startSample + visibleSamples, totalSamples);

        const x = ((samplePos - startSample) / (endSample - startSample)) * this.waveformCanvas.width;
        // Round to integer pixel for crisp rendering
        return Math.round(x);
    }

    /**
     * Find marker near given coordinates
     * Source: test/slice-editor/slice-editor-test.html lines 1798-1812
     * @private
     */
    _findMarkerNear(x, y) {
        const threshold = 10;  // pixels

        for (let i = 0; i < this.sliceMarkers.length; i++) {
            const markerX = this._sampleToX(this.sliceMarkers[i]);

            // Check if hovering near the marker line (anywhere vertically)
            if (Math.abs(x - markerX) < threshold) {
                return i;
            }
        }

        return -1;
    }

    /**
     * Find delete button near given coordinates
     * Source: test/slice-editor/slice-editor-test.html lines 1814-1830
     * @private
     */
    _findDeleteButtonNear(x, y) {
        const deleteRadius = 10;  // Slightly larger than visual for easier clicking
        const height = this.waveformCanvas.height;
        const deleteY = height - 10;

        for (let i = 0; i < this.sliceMarkers.length; i++) {
            const markerX = this._sampleToX(this.sliceMarkers[i]);

            // Check if clicking within delete button area
            const distance = Math.sqrt(Math.pow(x - markerX, 2) + Math.pow(y - deleteY, 2));
            if (distance < deleteRadius) {
                return i;
            }
        }

        return -1;
    }

    /**
     * Find trim handle near given coordinates
     * Source: test/slice-editor/slice-editor-test.html lines 1832-1869
     * @private
     */
    _findTrimHandleNear(x, y) {
        if (!this.audioBuffer) return null;

        const threshold = 15;  // Larger click area for easier grabbing
        const totalSamples = this.audioBuffer.length;
        const visibleSamples = Math.floor(totalSamples / this.zoom);
        const startSample = Math.floor(this.scrollOffset * totalSamples);
        const endSample = Math.min(startSample + visibleSamples, totalSamples);

        // Check trim end handle FIRST (higher priority, especially at edge)
        const trimEnd = this.trimEnd !== null ? this.trimEnd : totalSamples;
        if (trimEnd >= startSample && trimEnd <= endSample) {
            const trimEndX = ((trimEnd - startSample) / (endSample - startSample)) * this.waveformCanvas.width;

            // Special case: if at right edge, make it easier to grab from the left
            const atRightEdge = trimEndX >= this.waveformCanvas.width - 5;
            const endThreshold = atRightEdge ? 25 : threshold;

            if (Math.abs(x - trimEndX) < endThreshold || (atRightEdge && x >= trimEndX - endThreshold)) {
                return 'end';
            }
        }

        // Check trim start handle
        if (this.trimStart >= startSample && this.trimStart <= endSample) {
            const trimStartX = ((this.trimStart - startSample) / (endSample - startSample)) * this.waveformCanvas.width;

            // Special case: if at left edge, make it easier to grab from the right
            const atLeftEdge = trimStartX <= 5;
            const startThreshold = atLeftEdge ? 25 : threshold;

            if (Math.abs(x - trimStartX) < startThreshold || (atLeftEdge && x <= trimStartX + startThreshold)) {
                return 'start';
            }
        }

        return null;
    }

    /**
     * Find nearest zero crossing for cleaner slice boundaries
     * Source: test/slice-editor/slice-editor-test.html lines 1884-1913
     * @private
     */
    _findNearestZeroCrossing(samplePos) {
        if (!this.audioBuffer) return samplePos;

        const bufferData = this.audioBuffer.getChannelData(0);
        const searchRange = 50;  // Search ±50 samples (~1ms at 48kHz)

        const startSearch = Math.max(0, samplePos - searchRange);
        const endSearch = Math.min(bufferData.length - 1, samplePos + searchRange);

        let closestZeroCrossing = samplePos;
        let minDistance = Infinity;

        // Look for zero crossings (sign changes)
        for (let i = startSearch; i < endSearch - 1; i++) {
            const currentSample = bufferData[i];
            const nextSample = bufferData[i + 1];

            // Check if there's a zero crossing between these samples
            if ((currentSample <= 0 && nextSample >= 0) || (currentSample >= 0 && nextSample <= 0)) {
                const distance = Math.abs(i - samplePos);
                if (distance < minDistance) {
                    minDistance = distance;
                    // Use the sample closest to actual zero
                    closestZeroCrossing = Math.abs(currentSample) < Math.abs(nextSample) ? i : i + 1;
                }
            }
        }

        return closestZeroCrossing;
    }

    /**
     * Handle canvas mouse down - start dragging or add markers
     * Source: test/slice-editor/slice-editor-test.html lines 1655-1725
     * @private
     */
    _handleCanvasMouseDown(e) {
        const x = e.offsetX;
        const y = e.offsetY;

        // Check if clicking on trim handles FIRST (highest priority)
        const trimHandle = this._findTrimHandleNear(x, y);
        if (trimHandle === 'start') {
            this.isDraggingTrimStart = true;
            this._renderWaveform();
            return;
        } else if (trimHandle === 'end') {
            this.isDraggingTrimEnd = true;
            this._renderWaveform();
            return;
        }

        // Check if clicking on delete button (X)
        const deleteIndex = this._findDeleteButtonNear(x, y);
        if (deleteIndex !== -1) {
            // Delete marker
            this.sliceMarkers.splice(deleteIndex, 1);
            this.selectedMarker = null;
            this._renderWaveform();
            this._updateInfoDisplay();
            this._autoSaveConfig();
            return;
        }

        // Check if clicking near a marker (for dragging)
        const markerIndex = this._findMarkerNear(x, y);
        if (markerIndex !== -1) {
            // Start dragging marker
            this.isDragging = true;
            this.selectedMarker = markerIndex;
            this.dragStartX = x;
            this._renderWaveform();
        } else {
            // Add new marker (click anywhere on waveform)
            const samplePos = this._xToSample(x);
            const trimEnd = this.trimEnd !== null ? this.trimEnd : this.audioBuffer.length;

            // Don't allow slice creation outside trim bounds
            if (samplePos <= this.trimStart || samplePos >= trimEnd) {
                return;
            }

            // Find nearest zero crossing for cleaner cuts
            const zeroCrossingSample = this._findNearestZeroCrossing(samplePos);

            // Double-check zero-crossing result is within trim bounds
            if (zeroCrossingSample <= this.trimStart || zeroCrossingSample >= trimEnd) {
                this.sliceMarkers.push(samplePos);
            } else {
                this.sliceMarkers.push(zeroCrossingSample);
            }

            this.sliceMarkers.sort((a, b) => a - b);  // Keep sorted
            this.selectedMarker = this.sliceMarkers.indexOf(this.sliceMarkers[this.sliceMarkers.length - 1]);
            this._renderWaveform();
            this._updateInfoDisplay();

        }
    }

    /**
     * Handle canvas mouse move - drag markers, update cursor
     * Source: test/slice-editor/slice-editor-test.html lines 1727-1774
     * @private
     */
    _handleCanvasMouseMove(e) {
        const x = e.offsetX;
        const y = e.offsetY;

        if (this.isDraggingTrimStart) {
            // Dragging trim start handle
            this.waveformCanvas.style.cursor = 'ew-resize';
            const samplePos = this._xToSample(x);
            const trimEnd = this.trimEnd !== null ? this.trimEnd : this.audioBuffer.length;
            this.trimStart = Math.max(0, Math.min(trimEnd - 1, samplePos));
            this._renderWaveform();
            this._updateInfoDisplay();
        } else if (this.isDraggingTrimEnd) {
            // Dragging trim end handle
            this.waveformCanvas.style.cursor = 'ew-resize';
            const samplePos = this._xToSample(x);
            this.trimEnd = Math.max(this.trimStart + 1, Math.min(this.audioBuffer.length, samplePos));
            this._renderWaveform();
            this._updateInfoDisplay();
        } else if (this.isDragging && this.selectedMarker !== null) {
            // Dragging a marker
            this.waveformCanvas.style.cursor = 'ew-resize';
            const samplePos = this._xToSample(x);
            this.sliceMarkers[this.selectedMarker] = Math.max(0, Math.min(this.audioBuffer.length - 1, samplePos));
            this.sliceMarkers.sort((a, b) => a - b);
            this.selectedMarker = this.sliceMarkers.indexOf(samplePos);
            this._renderWaveform();
        } else {
            // Update cursor based on hover
            const trimHandle = this._findTrimHandleNear(x, y);
            const deleteIndex = this._findDeleteButtonNear(x, y);
            const markerIndex = this._findMarkerNear(x, y);

            if (trimHandle !== null) {
                // Hovering over trim handle
                this.waveformCanvas.style.cursor = 'ew-resize';
            } else if (deleteIndex !== -1) {
                // Hovering over delete button
                this.waveformCanvas.style.cursor = 'pointer';
            } else if (markerIndex !== -1) {
                // Hovering over a marker line (for dragging)
                this.waveformCanvas.style.cursor = 'ew-resize';
            } else {
                // Not hovering over anything
                this.waveformCanvas.style.cursor = 'crosshair';
            }
        }
    }

    /**
     * Handle canvas mouse up - end dragging
     * Source: test/slice-editor/slice-editor-test.html lines 1782-1796
     * @private
     */
    _handleCanvasMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            this._autoSaveConfig();
        }
        if (this.isDraggingTrimStart) {
            this.isDraggingTrimStart = false;
            this._renderWaveform();
            this._autoSaveConfig();
        }
        if (this.isDraggingTrimEnd) {
            this.isDraggingTrimEnd = false;
            this._renderWaveform();
            this._autoSaveConfig();
        }
    }

    /**
     * Handle canvas mouse leave - cancel dragging
     * Source: test/slice-editor/slice-editor-test.html lines 1776-1780
     * @private
     */
    _handleCanvasMouseLeave(e) {
        this.hoveredSlice = -1;
        this.waveformCanvas.style.cursor = 'crosshair';
        this._renderWaveform();
    }

    /**
     * Handle grid slider change - create evenly spaced slices
     * Source: test/slice-editor/slice-editor-test.html lines 2232-2251
     * @private
     */
    _handleGridSliderChange(e) {
        if (!this.audioBuffer) return;

        const numSlices = parseInt(e.target.value);
        this.gridValue.textContent = numSlices;

        // REAL-TIME: Update markers immediately within trim bounds
        const trimEnd = this.trimEnd !== null ? this.trimEnd : this.audioBuffer.length;
        const trimmedLength = trimEnd - this.trimStart;
        const sliceLength = trimmedLength / numSlices;

        this.sliceMarkers = [];
        for (let i = 1; i < numSlices; i++) {
            const markerPos = this.trimStart + Math.floor(i * sliceLength);
            this.sliceMarkers.push(markerPos);
        }

        this._renderWaveform();
        this._updateInfoDisplay();
        this._autoSaveConfig();
    }

    /**
     * Handle threshold slider change - update display
     * Source: test/slice-editor/slice-editor-test.html lines 2260-2262
     * @private
     */
    _handleThresholdSliderChange(e) {
        this.thresholdValue.textContent = e.target.value + '%';
    }

    /**
     * Handle rotation slider change - rotate sample
     * Source: test/slice-editor/slice-editor-test.html lines 2316-2400
     * @private
     */
    _handleRotationSliderChange(e) {
        let value = parseInt(e.target.value);

        // Fine mode (Shift held): scale delta by 1/10 for precision
        if (this.rotationFineMode) {
            const delta = value - this.lastRotationValue;
            const fineDelta = delta * 0.1;
            value = Math.round((this.lastRotationValue + fineDelta) * 10) / 10;
            // Clamp to valid range and sync slider position
            value = Math.max(-100, Math.min(100, value));
            this.rotationSlider.value = Math.round(value);
        }

        this.lastRotationValue = value;

        // Display with decimal precision in fine mode, whole number otherwise
        const displayValue = this.rotationFineMode ? value.toFixed(1) : Math.round(value);
        this.rotationValue.textContent = `${displayValue}%`;

        const trimEnd = this.trimEnd !== null ? this.trimEnd : this.audioBuffer.length;
        const trimmedLength = trimEnd - this.trimStart;

        this.rotationOffset = Math.floor((value / 100) * trimmedLength);
        this._renderWaveform();
    }

    /**
     * Handle detect transients button - find peaks in audio
     * Source: test/slice-editor/slice-editor-test.html lines 2264-2276
     * @private
     */
    _handleDetectTransients() {
        if (!this.audioBuffer) return;

        const threshold = parseFloat(this.thresholdSlider.value) / 100;
        const trimEnd = this.trimEnd !== null ? this.trimEnd : this.audioBuffer.length;
        const markers = this._detectTransients(this.audioBuffer, threshold, this.trimStart, trimEnd);

        this.sliceMarkers = markers;
        this._renderWaveform();
        this._updateInfoDisplay();
        this._autoSaveConfig();

    }

    /**
     * Detect transients in audio buffer using RMS envelope
     * Source: test/slice-editor/slice-editor-test.html lines 2278-2315
     * @private
     */
    _detectTransients(audioBuffer, sensitivity, trimStart = 0, trimEnd = null) {
        const bufferData = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const windowSize = Math.floor(sampleRate * 0.01);  // 10ms window
        const minDistance = Math.floor(sampleRate * 0.05);  // 50ms minimum between slices

        // Map sensitivity (0-1) to threshold (0.05-0.25)
        const threshold = 0.05 + sensitivity * 0.2;

        const endSample = trimEnd !== null ? trimEnd : bufferData.length;
        const markers = [];
        let lastMarker = trimStart;

        // Only scan within trim bounds
        const startScan = Math.max(windowSize, trimStart);
        const endScan = endSample;

        for (let i = startScan; i < endScan; i += windowSize) {
            const prevEnergy = this._calculateRMS(bufferData, i - windowSize, i);
            const currEnergy = this._calculateRMS(bufferData, i, Math.min(i + windowSize, endScan));
            const delta = currEnergy - prevEnergy;

            if (delta > threshold && (i - lastMarker) > minDistance && i >= trimStart && i < endSample) {
                markers.push(i);
                lastMarker = i;
            }
        }

        return markers;
    }

    /**
     * Calculate RMS (root mean square) energy of audio buffer segment
     * Source: test/slice-editor/slice-editor-test.html lines 2309-2315
     * @private
     */
    _calculateRMS(buffer, start, end) {
        let sum = 0;
        for (let i = start; i < end && i < buffer.length; i++) {
            sum += buffer[i] * buffer[i];
        }
        return Math.sqrt(sum / (end - start));
    }

    /**
     * Handle clear all button - remove all markers
     * Source: test/slice-editor/slice-editor-test.html lines 2321-2328
     * @private
     */
    _handleClearAll() {
        if (confirm('Clear all slice markers?')) {
            this.sliceMarkers = [];
            this.selectedMarker = null;
            this._renderWaveform();
            this._updateInfoDisplay();
        }
    }

    /**
     * Handle export JSON button - download slice configuration
     * Source: test/slice-editor/slice-editor-test.html lines 2334-2370
     * @private
     */
    _handleExportJSON() {
        if (!this.audioBuffer) return;

        const config = this.getSliceConfig();
        const json = JSON.stringify(config, null, 2);

        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.fileName}.slices.json`;
        a.click();
        URL.revokeObjectURL(url);

    }

    /**
     * Handle canvas wheel event - zoom in/out or scroll
     * Source: test/slice-editor/slice-editor-test.html lines 2010-2039
     * @private
     */
    _handleCanvasWheel(e) {
        e.preventDefault();

        if (e.shiftKey || e.metaKey || e.ctrlKey) {
            // Shift/Command/Ctrl + mousewheel = horizontal scroll
            const scrollSpeed = 0.0005;
            const delta = e.deltaY * scrollSpeed;

            // Update scroll offset (clamped between 0 and max scroll)
            const maxScroll = Math.max(0, 1 - (1 / this.zoom));
            this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + delta));

            this._renderWaveform();
            this._updateScrollbar();
        } else {
            // Normal mousewheel = zoom
            const zoomSpeed = 0.001;
            const delta = -e.deltaY * zoomSpeed;

            // Calculate new zoom (clamp between 1x and 16x)
            let newZoom = this.zoom * (1 + delta);
            newZoom = Math.max(1, Math.min(16, newZoom));

            this.zoom = newZoom;
            this._renderWaveform();
            this._updateInfoDisplay();
            this._updateScrollbar();
        }
    }

    /**
     * Handle scrollbar thumb mouse down - start dragging for pan/zoom
     * Source: test/slice-editor/slice-editor-test.html lines 2118-2223
     * @private
     */
    _handleScrollbarMouseDown(e) {
        e.stopPropagation();

        const EDGE_ZONE = 8; // pixels for edge detection

        const thumbRect = this.scrollbarThumb.getBoundingClientRect();
        const relativeX = e.clientX - thumbRect.left;

        // Determine which part is being dragged
        if (relativeX <= EDGE_ZONE) {
            this.scrollbarDragMode = 'left-edge';
            this.scrollbarThumb.style.cursor = 'ew-resize';
        } else if (relativeX >= thumbRect.width - EDGE_ZONE) {
            this.scrollbarDragMode = 'right-edge';
            this.scrollbarThumb.style.cursor = 'ew-resize';
        } else {
            this.scrollbarDragMode = 'center';
            this.scrollbarThumb.style.cursor = 'grabbing';
        }

        this.scrollbarDragStartX = e.clientX;
        this.scrollbarDragStartZoom = this.zoom;
        this.scrollbarDragStartScrollOffset = this.scrollOffset;

        // For center dragging, store where in the thumb we clicked
        if (this.scrollbarDragMode === 'center') {
            this.scrollbarDragStartRelativeX = relativeX;
        }

        // Add global mouse move and up handlers
        const handleMouseMove = (e) => {
            if (this.scrollbarDragMode && this.audioBuffer) {
                const trackRect = this.scrollbarTrack.getBoundingClientRect();
                const trackWidth = trackRect.width;
                const deltaX = e.clientX - this.scrollbarDragStartX;
                const deltaPercent = deltaX / trackWidth;

                if (this.scrollbarDragMode === 'center') {
                    // Pan: move the view without changing zoom
                    const mouseX = e.clientX - trackRect.left;

                    // New thumb left position (in pixels), accounting for where we clicked in the thumb
                    let newThumbLeft = mouseX - this.scrollbarDragStartRelativeX;

                    // Convert to scroll offset (direct mapping: thumbLeft% = scrollOffset)
                    let newScrollOffset = newThumbLeft / trackWidth;

                    // Clamp to valid range [0, 1 - 1/zoom]
                    const maxScroll = Math.max(0, 1 - (1 / this.zoom));
                    this.scrollOffset = Math.max(0, Math.min(maxScroll, newScrollOffset));

                } else if (this.scrollbarDragMode === 'left-edge') {
                    // Zoom by adjusting left edge (drag right = zoom in, drag left = zoom out)
                    const visibleRatio = 1 / this.scrollbarDragStartZoom;
                    const newVisibleRatio = Math.max(1/16, Math.min(1, visibleRatio - deltaPercent));
                    const newZoom = 1 / newVisibleRatio;

                    // Adjust scroll offset to keep right edge fixed
                    const rightEdge = this.scrollbarDragStartScrollOffset + visibleRatio;
                    const newScrollOffset = rightEdge - newVisibleRatio;

                    this.zoom = Math.max(1, Math.min(16, newZoom));
                    this.scrollOffset = Math.max(0, Math.min(1 - (1 / this.zoom), newScrollOffset));

                } else if (this.scrollbarDragMode === 'right-edge') {
                    // Zoom by adjusting right edge (drag left = zoom in, drag right = zoom out)
                    const visibleRatio = 1 / this.scrollbarDragStartZoom;
                    const newVisibleRatio = Math.max(1/16, Math.min(1, visibleRatio + deltaPercent));
                    const newZoom = 1 / newVisibleRatio;

                    this.zoom = Math.max(1, Math.min(16, newZoom));

                    // Clamp scroll offset to valid range
                    const maxScroll = Math.max(0, 1 - (1 / this.zoom));
                    this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollbarDragStartScrollOffset));
                }

                this._updateScrollbar();
                this._renderWaveform();
                this._updateInfoDisplay();
            }
        };

        const handleMouseUp = () => {
            if (this.scrollbarDragMode === 'center') {
                this.scrollbarThumb.style.cursor = 'grab';
            }
            this.scrollbarDragMode = null;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    /**
     * Play a specific slice for audition
     * @param {number} sliceIndex - Index of slice to play
     * @private
     */
    _playSlice(sliceIndex) {
        if (!this.audioBuffer) return;

        // Stop any currently playing slice
        if (this.currentPlayingSource) {
            try {
                this.currentPlayingSource.stop();
            } catch (e) {
                // Already stopped
            }
            this.currentPlayingSource = null;
        }

        const trimEnd = this.trimEnd !== null ? this.trimEnd : this.audioBuffer.length;
        const markers = [this.trimStart, ...this.sliceMarkers, trimEnd];

        if (sliceIndex < 0 || sliceIndex >= markers.length - 1) return;

        const startSample = markers[sliceIndex];
        const endSample = markers[sliceIndex + 1];
        const sliceLength = endSample - startSample;

        // Validate slice length
        if (sliceLength <= 0) {
            console.error(`[PlaySlice] Invalid slice ${sliceIndex}: start=${startSample}, end=${endSample}, length=${sliceLength}`);
            console.error(`[PlaySlice] Markers:`, markers);
            console.error(`[PlaySlice] Trim: start=${this.trimStart}, end=${this.trimEnd}`);
            return;
        }

        // Set currently playing slice for visual feedback
        this.currentPlayingSliceIndex = sliceIndex;
        this._renderWaveform();

        // Create slice buffer
        const sliceBuffer = this.audioContext.createBuffer(
            1,
            sliceLength,
            this.audioBuffer.sampleRate
        );

        const sliceData = sliceBuffer.getChannelData(0);
        const sourceData = this.audioBuffer.getChannelData(0);

        // Copy with rotation if applicable
        for (let i = 0; i < sliceLength; i++) {
            const sampleIndex = startSample + i;
            let sourceIndex;

            // Apply rotation only within trim bounds
            if (sampleIndex < this.trimStart || sampleIndex >= trimEnd) {
                sourceIndex = sampleIndex;
            } else {
                const trimmedLength = trimEnd - this.trimStart;
                const positionInTrim = sampleIndex - this.trimStart;
                const rotatedPosition = (positionInTrim + this.rotationOffset + trimmedLength) % trimmedLength;
                sourceIndex = this.trimStart + rotatedPosition;
            }

            sliceData[i] = sourceData[sourceIndex];
        }

        // Play slice
        const source = this.audioContext.createBufferSource();
        source.buffer = sliceBuffer;
        source.connect(this.audioContext.destination);

        source.onended = () => {
            if (this.currentPlayingSource === source) {
                this.currentPlayingSource = null;
                this.currentPlayingSliceIndex = -1;
                this._renderWaveform();
            }
        };

        source.start();
        this.currentPlayingSource = source;

    }

    /**
     * Handle keyboard shortcuts
     * Source: test/slice-editor/slice-editor-test.html lines 2379-2402
     * @private
     */
    _handleKeyDown(e) {
        // Only respond if modal is active and sample is loaded
        if (!this.modal.classList.contains('active') || !this.audioBuffer) return;

        // Keys 1-6: Play current slice (only if the key matches the track being edited)
        if (e.key >= '1' && e.key <= '6' && !e.repeat) {
            const keyNumber = parseInt(e.key);

            // Only respond if this key corresponds to the track we're editing
            if (this.currentVoiceIndex !== null && keyNumber !== this.currentVoiceIndex + 1) {
                // Not our track's key - ignore it
                return;
            }

            e.preventDefault();  // Prevent default key behavior

            // Play the currently selected slice (from the slice knob)
            const sliceIndex = this.currentSliceIndex;

            // Use trim bounds for playback
            const trimEnd = this.trimEnd !== null ? this.trimEnd : this.audioBuffer.length;
            const markers = [this.trimStart, ...this.sliceMarkers, trimEnd];
            const totalSlices = markers.length - 1;

            // Only play if the slice exists
            if (sliceIndex < totalSlices) {
                this._playSlice(sliceIndex);
            }
        }

        // Escape: Close modal
        if (e.code === 'Escape') {
            this.close();
        }

        // Delete: Remove selected marker
        if (e.code === 'Delete' || e.code === 'Backspace') {
            if (this.selectedMarker !== null) {
                this.sliceMarkers.splice(this.selectedMarker, 1);
                this.selectedMarker = null;
                this._renderWaveform();
                this._updateInfoDisplay();
                this._autoSaveConfig();
            }
        }
    }

    /**
     * Setup modal dragging functionality
     * @private
     */
    _setupModalDragging(header) {
        let isDraggingModal = false;
        let modalDragStart = { x: 0, y: 0 };

        header.addEventListener('mousedown', (e) => {
            isDraggingModal = true;
            modalDragStart.x = e.clientX - this.modalOffset.x;
            modalDragStart.y = e.clientY - this.modalOffset.y;
            header.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (isDraggingModal) {
                this.modalOffset.x = e.clientX - modalDragStart.x;
                this.modalOffset.y = e.clientY - modalDragStart.y;

                this.modal.style.transform = `translate(${this.modalOffset.x}px, ${this.modalOffset.y}px)`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDraggingModal) {
                isDraggingModal = false;
                header.style.cursor = 'grab';
            }
        });
    }

    _handleCanvasDoubleClick(e) {
        // Double-click not used in slice editor
        // Single click adds markers, drag to reposition
    }

    _handleDone() {
        const config = this.getSliceConfig();

        // Auto-save to localStorage
        if (this.audioBuffer && this.fileName) {
            saveSliceConfig(this.audioBuffer, this.fileName, config);
        }

        // Call original callback
        if (this.onDone) {
            this.onDone(config);
        }

        this.close();
    }

    /**
     * Auto-save slice config to localStorage with debouncing
     * @private
     */
    _autoSaveConfig() {
        if (!this.audioBuffer || !this.fileName) return;

        // Debounce saves (only save if 2 seconds have passed since last change)
        clearTimeout(this._autoSaveTimeout);
        this._autoSaveTimeout = setTimeout(() => {
            const config = this.getSliceConfig();
            saveSliceConfig(this.audioBuffer, this.fileName, config);
        }, 2000);
    }

    _handleClose() {
        this.close();
    }
}
