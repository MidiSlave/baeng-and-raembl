/**
 * Sample Browser
 * Loads and displays WAV samples from the BREAKS collection
 * Allows preview, search, and loading into the current voice
 */

import { FavoritesManager } from '../favorites-manager.js';
import { hasSliceConfig } from '../slice/slice-config-storage.js';

export class SampleBrowser {
    constructor(modalElement, audioContext) {
        this.modal = modalElement;
        this.audioContext = audioContext;

        // DOM elements
        this.listElement = document.getElementById('baeng-sample-browser-list');
        this.searchInput = document.getElementById('baeng-sample-browser-search');
        this.infoElement = document.getElementById('baeng-sample-browser-info');
        this.previewBtn = document.getElementById('baeng-sample-preview-btn');
        this.stopBtn = document.getElementById('baeng-sample-stop-btn');
        this.loadBtn = document.getElementById('baeng-sample-load-btn');
        this.closeBtn = document.getElementById('baeng-sample-browser-close-btn');
        this.favoritesFilterBtn = document.getElementById('baeng-sample-favorites-filter-btn');
        this.favoritesCountElement = document.getElementById('baeng-sample-favorites-count');

        // State
        this.samples = [];
        this.filteredSamples = [];
        this.selectedIndex = -1;
        this.currentSource = null;
        this.currentGain = null;
        this.playingIndex = -1; // Track which sample is currently playing
        this.showFavoritesOnly = false;

        // Favorites manager
        this.favoritesManager = new FavoritesManager('baeng_sample_favorites');

        // Callbacks
        this.onLoad = null; // Callback when sample is loaded

        this._attachEventListeners();
        this._loadManifest();
    }

    async _loadManifest() {
        try {
            this.listElement.innerHTML = '<div class="browser-loading">Loading samples...</div>';

            const response = await fetch('samples/breaks-manifest.json');
            if (!response.ok) {
                throw new Error(`Failed to load manifest: ${response.statusText}`);
            }

            this.samples = await response.json();
            this._applyFilters();
            this._renderList();
            this._updateInfo();
            this._updateFavoritesCount();
        } catch (error) {
            console.error('Error loading sample manifest:', error);
            this.listElement.innerHTML = `
                <div class="browser-error">
                    <p>Failed to load sample manifest</p>
                    <p style="font-size: 12px; color: #888;">${error.message}</p>
                </div>
            `;
        }
    }

    _applyFilters() {
        const searchQuery = this.searchInput.value.toLowerCase().trim();

        // Start with all samples
        let filtered = [...this.samples];

        // Apply search filter
        if (searchQuery) {
            filtered = filtered.filter(s =>
                s.name.toLowerCase().includes(searchQuery)
            );
        }

        // Apply favorites filter
        if (this.showFavoritesOnly) {
            filtered = filtered.filter(s =>
                this.favoritesManager.has(s.path)
            );
        }

        this.filteredSamples = filtered;
    }

    _renderList() {
        if (this.filteredSamples.length === 0) {
            const message = this.showFavoritesOnly
                ? 'No favorites found'
                : 'No samples found';
            this.listElement.innerHTML = `<div class="browser-empty">${message}</div>`;
            return;
        }

        this.listElement.innerHTML = this.filteredSamples
            .map((sample, index) => {
                const configInfo = hasSliceConfig(sample.name);
                const hasConfig = configInfo !== null;
                const configBadge = hasConfig
                    ? `<span class="browser-config-badge" title="${configInfo.sliceCount} slices">${configInfo.sliceCount}</span>`
                    : '';
                const isFavorited = this.favoritesManager.has(sample.path);
                const starIcon = this._getStarIcon(isFavorited);
                const isPlaying = index === this.playingIndex;
                const playingIndicator = isPlaying ? '<span class="playing-indicator">▶</span>' : '';

                return `
                    <div class="browser-list-item ${index === this.selectedIndex ? 'selected' : ''} ${isPlaying ? 'playing' : ''}"
                         data-index="${index}"
                         data-path="${sample.path}"
                         title="${sample.name}">
                        <button class="favorite-star-button" data-path="${sample.path}"
                                title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}"
                                aria-label="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}">
                            ${starIcon}
                        </button>
                        ${playingIndicator}
                        <span class="browser-item-name">${sample.name}</span>
                        <div class="browser-item-meta">
                            ${configBadge}
                            <span class="browser-item-size">${this._formatSize(sample.size)}</span>
                        </div>
                    </div>
                `;
            })
            .join('');

        // Scroll to selected item if any
        if (this.selectedIndex >= 0) {
            const selectedElement = this.listElement.querySelector(`[data-index="${this.selectedIndex}"]`);
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }

    _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    _updateInfo() {
        const count = this.filteredSamples.length;
        const total = this.samples.length;

        if (count === total) {
            this.infoElement.textContent = `Showing ${count} samples`;
        } else {
            this.infoElement.textContent = `Showing ${count} of ${total} samples`;
        }
    }

    _updateFavoritesCount() {
        if (!this.favoritesCountElement) return;
        const count = this.favoritesManager.count();
        this.favoritesCountElement.textContent = `${count} favorite${count !== 1 ? 's' : ''}`;
    }

    _getStarIcon(isFavorited) {
        return isFavorited ? '★' : '☆';
    }

    _handleStarClick(starButton) {
        const path = starButton.dataset.path;
        const isFavorited = this.favoritesManager.toggle(path);

        // Update the star icon
        starButton.innerHTML = this._getStarIcon(isFavorited);
        starButton.title = isFavorited ? 'Remove from favorites' : 'Add to favorites';
        starButton.setAttribute('aria-label', isFavorited ? 'Remove from favorites' : 'Add to favorites');

        // Update favorites count
        this._updateFavoritesCount();

        // If showing favorites only and item was unfavorited, refresh list
        if (this.showFavoritesOnly && !isFavorited) {
            this._stopPreview(); // Stop if the unfavorited item was playing
            this._applyFilters();
            this.selectedIndex = -1;
            this._renderList();
            this._updateInfo();
        }
    }

    _attachEventListeners() {
        // List item selection and star clicks
        this.listElement.addEventListener('click', (e) => {
            // Handle star button clicks
            const starButton = e.target.closest('.favorite-star-button');
            if (starButton) {
                e.stopPropagation(); // Prevent item selection
                this._handleStarClick(starButton);
                return;
            }

            // Handle item selection
            const item = e.target.closest('.browser-list-item');
            if (item) {
                const index = parseInt(item.dataset.index, 10);
                this._selectItem(index);
            }
        });

        // Double-click to load
        this.listElement.addEventListener('dblclick', (e) => {
            const item = e.target.closest('.browser-list-item');
            if (item) {
                const index = parseInt(item.dataset.index, 10);
                this._selectItem(index);
                this._handleLoad();
            }
        });

        // Search input
        this.searchInput.addEventListener('input', (e) => {
            this._handleSearch(e.target.value);
        });

        // Preview button
        this.previewBtn.addEventListener('click', () => {
            this._handlePreview();
        });

        // Stop button
        this.stopBtn.addEventListener('click', () => {
            this._stopPreview();
        });

        // Load button
        this.loadBtn.addEventListener('click', () => {
            this._handleLoad();
        });

        // Close button
        this.closeBtn.addEventListener('click', () => {
            this.close();
        });

        // Favorites filter toggle
        if (this.favoritesFilterBtn) {
            this.favoritesFilterBtn.addEventListener('click', () => {
                this._stopPreview(); // Stop any playing sample
                this.showFavoritesOnly = !this.showFavoritesOnly;
                this.favoritesFilterBtn.classList.toggle('active', this.showFavoritesOnly);

                // Update button text to show current filter state
                this.favoritesFilterBtn.textContent = this.showFavoritesOnly ? '★' : '☆';

                this._applyFilters();
                this.selectedIndex = -1;
                this._renderList();
                this._updateInfo();
            });
        }

        // Keyboard navigation
        this.modal.addEventListener('keydown', (e) => {
            if (!this.modal.classList.contains('active')) return;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this._selectItem(Math.min(this.selectedIndex + 1, this.filteredSamples.length - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this._selectItem(Math.max(this.selectedIndex - 1, 0));
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this.selectedIndex >= 0) {
                        this._handleLoad();
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    break;
                case ' ':
                    e.preventDefault();
                    if (this.currentSource) {
                        this._stopPreview();
                    } else if (this.selectedIndex >= 0) {
                        this._handlePreview();
                    }
                    break;
            }
        });
    }

    _selectItem(index) {
        if (index < 0 || index >= this.filteredSamples.length) return;

        // Check if clicking the same item that's currently playing
        if (index === this.playingIndex && this.currentSource) {
            // Stop playback (toggle behavior)
            this._stopPreview();
            this.selectedIndex = index;
        } else {
            // Stop any current playback and play the new sample
            this._stopPreview();
            this.selectedIndex = index;
            this._handlePreview();
        }

        this._renderList();

        // Enable/disable buttons
        this.previewBtn.disabled = false;
        this.loadBtn.disabled = false;
    }

    _handleSearch(query) {
        this._stopPreview(); // Stop any playing sample
        this._applyFilters();
        this.selectedIndex = -1; // Reset selection
        this._renderList();
        this._updateInfo();

        // Disable buttons when nothing selected
        this.previewBtn.disabled = true;
        this.loadBtn.disabled = true;
    }

    async _handlePreview() {
        if (this.selectedIndex < 0) return;

        const sample = this.filteredSamples[this.selectedIndex];

        try {
            // Show loading state
            this.previewBtn.disabled = true;
            this.previewBtn.textContent = 'Loading...';

            // Load the sample
            const response = await fetch(sample.path);
            if (!response.ok) {
                throw new Error(`Failed to load sample: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Stop any currently playing preview
            this._stopPreview();

            // Create source and gain nodes
            this.currentSource = this.audioContext.createBufferSource();
            this.currentGain = this.audioContext.createGain();

            this.currentSource.buffer = audioBuffer;
            this.currentSource.connect(this.currentGain);
            this.currentGain.connect(this.audioContext.destination);

            // Start playback (limited to 2 seconds)
            this.currentSource.start(0);
            const duration = Math.min(audioBuffer.duration, 2.0);
            this.currentSource.stop(this.audioContext.currentTime + duration);

            // Track which sample is playing
            this.playingIndex = this.selectedIndex;

            // Update UI
            this.previewBtn.style.display = 'none';
            this.stopBtn.style.display = 'inline-block';

            // Auto-cleanup when done
            this.currentSource.onended = () => {
                this._stopPreview();
            };

        } catch (error) {
            console.error('Error previewing sample:', error);
            this.previewBtn.disabled = false;
            this.previewBtn.textContent = 'Preview';
            alert(`Failed to preview sample: ${error.message}`);
        }
    }

    _stopPreview() {
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {
                // Already stopped
            }
            this.currentSource = null;
        }

        if (this.currentGain) {
            this.currentGain.disconnect();
            this.currentGain = null;
        }

        // Clear playing index
        this.playingIndex = -1;

        // Update UI
        this.previewBtn.style.display = 'inline-block';
        this.previewBtn.disabled = false;
        this.previewBtn.textContent = 'Preview';
        this.stopBtn.style.display = 'none';
    }

    async _handleLoad() {
        if (this.selectedIndex < 0) return;

        const sample = this.filteredSamples[this.selectedIndex];

        try {
            // Show loading state
            this.loadBtn.disabled = true;
            this.loadBtn.textContent = 'Loading...';

            // Load the sample
            const response = await fetch(sample.path);
            if (!response.ok) {
                throw new Error(`Failed to load sample: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Call the load callback
            if (this.onLoad) {
                this.onLoad(audioBuffer, sample.name);
            }

            // Close the modal
            this.close();

        } catch (error) {
            console.error('Error loading sample:', error);
            this.loadBtn.disabled = false;
            this.loadBtn.textContent = 'Load';
            alert(`Failed to load sample: ${error.message}`);
        }
    }

    open() {
        this.modal.classList.add('active');
        this.searchInput.focus();

        // Reset state
        this.searchInput.value = '';
        this.showFavoritesOnly = false;
        if (this.favoritesFilterBtn) {
            this.favoritesFilterBtn.classList.remove('active');
            // Reset star to outline
            this.favoritesFilterBtn.textContent = '☆';
        }
        this._applyFilters();
        this.selectedIndex = -1;
        this.playingIndex = -1; // Reset playing state
        this._renderList();
        this._updateInfo();
        this._updateFavoritesCount();

        this.previewBtn.disabled = true;
        this.loadBtn.disabled = true;
    }

    close() {
        this._stopPreview();
        this.modal.classList.remove('active');
    }
}
