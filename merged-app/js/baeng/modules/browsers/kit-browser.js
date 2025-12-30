/**
 * Kit Browser
 * Loads and displays factory sample kits for the SMPL engine
 * Allows preview, search, and loading of entire kits into the current voice
 */

import { FavoritesManager } from '../favorites-manager.js';

export class KitBrowser {
    constructor(modalElement, audioContext) {
        this.modal = modalElement;
        this.audioContext = audioContext;

        // DOM elements
        this.listElement = document.getElementById('baeng-kit-browser-list');
        this.searchInput = document.getElementById('baeng-kit-browser-search');
        this.infoElement = document.getElementById('baeng-kit-browser-info');
        this.previewPanel = document.getElementById('baeng-kit-preview-panel');
        this.previewTitle = document.getElementById('baeng-kit-preview-title');
        this.sampleListElement = document.getElementById('baeng-kit-sample-list');
        this.loadBtn = document.getElementById('baeng-kit-load-btn');
        this.closeBtn = document.getElementById('baeng-kit-browser-close-btn');
        this.favoritesFilterBtn = document.getElementById('baeng-kit-favorites-filter-btn');
        this.favoritesCountElement = document.getElementById('baeng-kit-favorites-count');

        // State
        this.kits = [];                    // Array of kit metadata from combined manifest
        this.filteredKits = [];            // Filtered by search/favourites
        this.selectedIndex = -1;           // Currently selected kit index
        this.selectedKit = null;           // Full kit manifest (fetched on selection)
        this.selectedKitMetadata = null;   // Metadata of selected kit
        this.showFavoritesOnly = false;
        this.currentPreview = null;        // AudioBufferSourceNode for preview playback
        this.currentPreviewGain = null;
        this.playingSampleMidiNote = null; // Which sample in preview panel is playing

        // Favourites manager
        this.favoritesManager = new FavoritesManager('baeng_smpl_kit_favorites');

        // Callback
        this.onLoad = null;  // Called when kit is loaded: (manifest, kitName) => {}

        this._attachEventListeners();
        this._loadKitManifest();
    }

    async _loadKitManifest() {
        try {
            this.listElement.innerHTML = '<div class="browser-loading">Loading kits...</div>';

            const response = await fetch('samples/banks/factory-kits-manifest.json');
            if (!response.ok) {
                throw new Error(`Failed to load manifest: ${response.statusText}`);
            }

            const data = await response.json();
            this.kits = data.kits;
            this._applyFilters();
            this._renderList();
            this._updateInfo();
            this._updateFavouritesCount();
        } catch (error) {
            console.error('[KitBrowser] Error loading kit manifest:', error);
            this.listElement.innerHTML = `
                <div class="browser-error">
                    <p>Failed to load kit manifest</p>
                    <p style="font-size: 12px; color: #888;">${error.message}</p>
                </div>
            `;
        }
    }

    _applyFilters() {
        const searchQuery = this.searchInput.value.toLowerCase().trim();

        // Start with all kits
        let filtered = [...this.kits];

        // Apply search filter (search both name and description)
        if (searchQuery) {
            filtered = filtered.filter(kit =>
                kit.name.toLowerCase().includes(searchQuery) ||
                kit.description.toLowerCase().includes(searchQuery)
            );
        }

        // Apply favourites filter
        if (this.showFavoritesOnly) {
            filtered = filtered.filter(kit =>
                this.favoritesManager.has(kit.id)
            );
        }

        this.filteredKits = filtered;
    }

    _renderList() {
        if (this.filteredKits.length === 0) {
            const message = this.showFavoritesOnly
                ? 'No favourites found'
                : 'No kits found';
            this.listElement.innerHTML = `<div class="browser-empty">${message}</div>`;
            return;
        }

        this.listElement.innerHTML = this.filteredKits
            .map((kit, index) => {
                const isFavourited = this.favoritesManager.has(kit.id);
                const starIcon = this._getStarIcon(isFavourited);

                return `
                    <div class="browser-list-item ${index === this.selectedIndex ? 'selected' : ''}"
                         data-index="${index}"
                         data-kit-id="${kit.id}"
                         title="${kit.description}">
                        <button class="favorite-star-button" data-kit-id="${kit.id}"
                                title="${isFavourited ? 'Remove from favourites' : 'Add to favourites'}"
                                aria-label="${isFavourited ? 'Remove from favourites' : 'Add to favourites'}">
                            ${starIcon}
                        </button>
                        <div class="kit-item-content">
                            <span class="kit-item-name">${kit.name}</span>
                            <span class="kit-item-description">${kit.description}</span>
                        </div>
                        <span class="kit-item-count">${kit.sampleCount}</span>
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

    _updateInfo() {
        const count = this.filteredKits.length;
        const total = this.kits.length;

        if (count === total) {
            this.infoElement.textContent = `Showing ${count} kits`;
        } else {
            this.infoElement.textContent = `Showing ${count} of ${total} kits`;
        }
    }

    _updateFavouritesCount() {
        if (!this.favoritesCountElement) return;
        const count = this.favoritesManager.count();
        this.favoritesCountElement.textContent = `${count} favourite${count !== 1 ? 's' : ''}`;
    }

    _getStarIcon(isFavourited) {
        return isFavourited ? '★' : '☆';
    }

    _handleStarClick(starButton) {
        const kitId = starButton.dataset.kitId;
        const isFavourited = this.favoritesManager.toggle(kitId);

        // Update the star icon
        starButton.innerHTML = this._getStarIcon(isFavourited);
        starButton.title = isFavourited ? 'Remove from favourites' : 'Add to favourites';
        starButton.setAttribute('aria-label', isFavourited ? 'Remove from favourites' : 'Add to favourites');

        // Update favourites count
        this._updateFavouritesCount();

        // If showing favourites only and item was unfavourited, refresh list
        if (this.showFavoritesOnly && !isFavourited) {
            this._stopPreview(); // Stop if the unfavourited item had a playing sample
            this._hidePreviewPanel();
            this._applyFilters();
            this.selectedIndex = -1;
            this._renderList();
            this._updateInfo();
        }
    }

    async _selectKit(index) {
        if (index < 0 || index >= this.filteredKits.length) return;

        this._stopPreview(); // Stop any playing sample preview
        this.selectedIndex = index;
        this.selectedKitMetadata = this.filteredKits[index];

        // Render list to show selection
        this._renderList();

        // Fetch and show kit preview
        await this._showKitPreview();

        // Enable load button
        this.loadBtn.disabled = false;
    }

    async _showKitPreview() {
        if (!this.selectedKitMetadata) return;

        try {
            // Show loading state
            this.previewPanel.style.display = 'block';
            this.previewTitle.textContent = this.selectedKitMetadata.name;
            this.sampleListElement.innerHTML = '<div class="browser-loading">Loading samples...</div>';

            // Fetch the kit's full manifest
            const response = await fetch(this.selectedKitMetadata.manifestPath);
            if (!response.ok) {
                throw new Error(`Failed to load kit manifest: ${response.statusText}`);
            }

            this.selectedKit = await response.json();

            // Render sample list
            this._renderSampleList();

        } catch (error) {
            console.error('[KitBrowser] Error showing kit preview:', error);
            this.sampleListElement.innerHTML = `
                <div class="browser-error">
                    <p>Failed to load kit samples</p>
                    <p style="font-size: 12px; color: #888;">${error.message}</p>
                </div>
            `;
        }
    }

    _renderSampleList() {
        if (!this.selectedKit || !this.selectedKit.samples) {
            this.sampleListElement.innerHTML = '<div class="browser-empty">No samples found</div>';
            return;
        }

        // Get sorted MIDI note numbers
        const midiNotes = Object.keys(this.selectedKit.samples)
            .map(n => parseInt(n))
            .sort((a, b) => a - b);

        this.sampleListElement.innerHTML = midiNotes
            .map(midiNote => {
                const sampleName = this.selectedKit.mapping?.[midiNote] || `Sample ${midiNote}`;
                const isPlaying = midiNote === this.playingSampleMidiNote;

                return `
                    <div class="kit-sample-item ${isPlaying ? 'playing' : ''}" data-midi-note="${midiNote}">
                        <button class="sample-preview-btn" data-midi-note="${midiNote}"
                                title="Preview sample"
                                aria-label="Preview ${sampleName}">
                            ${isPlaying ? '■' : '▶'}
                        </button>
                        <span class="sample-name">${sampleName}</span>
                        <span class="sample-note">MIDI ${midiNote}</span>
                    </div>
                `;
            })
            .join('');
    }

    _hidePreviewPanel() {
        this.previewPanel.style.display = 'none';
        this.selectedKit = null;
        this.selectedKitMetadata = null;
        this.loadBtn.disabled = true;
    }

    async _previewSample(midiNote) {
        if (!this.selectedKit) return;

        const samplePath = this.selectedKit.samples[midiNote];
        if (!samplePath) return;

        try {
            // Stop previous preview
            this._stopPreview();

            // Fetch and decode
            const response = await fetch(samplePath);
            if (!response.ok) {
                throw new Error(`Failed to load sample: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Create playback chain
            this.currentPreview = this.audioContext.createBufferSource();
            this.currentPreviewGain = this.audioContext.createGain();

            this.currentPreview.buffer = audioBuffer;
            this.currentPreview.connect(this.currentPreviewGain);
            this.currentPreviewGain.connect(this.audioContext.destination);

            // Set volume (lower than full output)
            this.currentPreviewGain.gain.value = 0.7;

            // Play (2-second limit)
            const duration = Math.min(audioBuffer.duration, 2.0);
            this.currentPreview.start(0);
            this.currentPreview.stop(this.audioContext.currentTime + duration);

            // Track playing state
            this.playingSampleMidiNote = midiNote;

            // Auto-cleanup
            this.currentPreview.onended = () => {
                this._stopPreview();
            };

            // Update UI
            this._renderSampleList();

        } catch (error) {
            console.error('[KitBrowser] Preview failed:', error);
            // alert(`Failed to preview sample: ${error.message}`);
        }
    }

    _stopPreview() {
        if (this.currentPreview) {
            try {
                this.currentPreview.stop();
            } catch (e) {
                // Already stopped
            }
            this.currentPreview = null;
        }

        if (this.currentPreviewGain) {
            this.currentPreviewGain.disconnect();
            this.currentPreviewGain = null;
        }

        // Clear playing state
        const wasPlaying = this.playingSampleMidiNote !== null;
        this.playingSampleMidiNote = null;

        // Update UI if something was playing
        if (wasPlaying && this.selectedKit) {
            this._renderSampleList();
        }
    }

    async _handleLoad() {
        if (!this.selectedKit || !this.selectedKitMetadata) return;

        try {
            // Show loading state
            this.loadBtn.disabled = true;
            this.loadBtn.textContent = 'Loading...';

            // Call the load callback with the full manifest
            if (this.onLoad) {
                await this.onLoad(this.selectedKit, this.selectedKitMetadata.name);
            }

            // Close the modal
            this.close();

        } catch (error) {
            console.error('[KitBrowser] Error loading kit:', error);
            this.loadBtn.disabled = false;
            this.loadBtn.textContent = 'Load Kit';
            alert(`Failed to load kit: ${error.message}`);
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
                this._selectKit(index);
            }
        });

        // Sample preview button clicks
        this.sampleListElement.addEventListener('click', (e) => {
            const previewBtn = e.target.closest('.sample-preview-btn');
            if (previewBtn) {
                const midiNote = parseInt(previewBtn.dataset.midiNote, 10);

                // Toggle: stop if already playing this sample, otherwise play it
                if (midiNote === this.playingSampleMidiNote) {
                    this._stopPreview();
                } else {
                    this._previewSample(midiNote);
                }
            }
        });

        // Search input
        this.searchInput.addEventListener('input', () => {
            this._stopPreview();
            this._hidePreviewPanel();
            this._applyFilters();
            this.selectedIndex = -1;
            this._renderList();
            this._updateInfo();
        });

        // Load button
        this.loadBtn.addEventListener('click', () => {
            this._handleLoad();
        });

        // Close buttons
        this.closeBtn.addEventListener('click', () => {
            this.close();
        });

        // Favourites filter toggle
        if (this.favoritesFilterBtn) {
            this.favoritesFilterBtn.addEventListener('click', () => {
                this._stopPreview();
                this._hidePreviewPanel();
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
                    this._selectKit(Math.min(this.selectedIndex + 1, this.filteredKits.length - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this._selectKit(Math.max(this.selectedIndex - 1, 0));
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this.selectedKit) {
                        this._handleLoad();
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    this.close();
                    break;
            }
        });
    }

    open() {
        this.modal.classList.add('active');
        this.searchInput.focus();

        // Reset state
        this.searchInput.value = '';
        this.showFavoritesOnly = false;
        if (this.favoritesFilterBtn) {
            this.favoritesFilterBtn.classList.remove('active');
            this.favoritesFilterBtn.textContent = '☆';
        }
        this._applyFilters();
        this.selectedIndex = -1;
        this._hidePreviewPanel();
        this._renderList();
        this._updateInfo();
        this._updateFavouritesCount();

        this.loadBtn.disabled = true;
        this.loadBtn.textContent = 'Load Kit';
    }

    close() {
        this._stopPreview();
        this._hidePreviewPanel();
        this.modal.classList.remove('active');
    }
}
