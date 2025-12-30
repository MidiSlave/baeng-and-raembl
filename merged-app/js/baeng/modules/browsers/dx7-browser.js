/**
 * DX7 Bank Browser
 * Navigates through DX7 bank folders and loads .syx files
 * Supports folder navigation, bank preview (patch names), and loading
 */

import { FavoritesManager } from '../favorites-manager.js';
import { state } from '../../state.js';
import { triggerVoice } from '../engine.js';
import { getTuningCache } from '../tuning/index.js';

export class DX7Browser {
    constructor(modalElement, dx7PatchLibrary) {
        this.modal = modalElement;
        this.dx7PatchLibrary = dx7PatchLibrary;

        // DOM elements
        this.listElement = document.getElementById('baeng-dx7-browser-list');
        this.breadcrumbElement = document.getElementById('baeng-dx7-breadcrumb');
        this.patchPreviewElement = document.getElementById('baeng-dx7-patch-preview');
        this.patchListElement = document.getElementById('baeng-dx7-patch-list');
        this.infoElement = document.getElementById('baeng-dx7-browser-info');
        this.backBtn = document.getElementById('baeng-dx7-back-btn');
        this.loadBtn = document.getElementById('baeng-dx7-load-btn');
        this.closeBtn = document.getElementById('baeng-dx7-browser-close-btn');
        this.favoritesFilterBtn = document.getElementById('baeng-dx7-favorites-filter-btn');
        this.favoritesCountElement = document.getElementById('baeng-dx7-favorites-count');
        this.searchInput = document.getElementById('baeng-dx7-browser-search');

        // State
        this.manifest = null;
        this.currentView = 'folders'; // 'folders' or 'files'
        this.selectedBank = null; // Currently selected bank for preview/load
        this.previewedPatches = null; // Cached patches from selected bank (for keyboard triggering and deferred loading)
        this.showFavoritesOnly = false;
        this.expandedFolders = new Set(); // Set of expanded folder paths like "Factory/Bass"

        // Favorites manager
        this.favoritesManager = new FavoritesManager('baeng_dx7_favorites');

        // Tuning cache reference
        this.tuningCache = getTuningCache();

        // Callbacks
        this.onLoad = null; // Callback when bank is loaded

        this._attachEventListeners();
        this._loadManifest();
    }

    async _loadManifest() {
        try {
            this.listElement.innerHTML = '<div class="browser-loading">Loading banks...</div>';

            const response = await fetch(`Reference/dx7-banks-manifest.json?v=${Date.now()}`);
            if (!response.ok) {
                throw new Error(`Failed to load manifest: ${response.statusText}`);
            }

            this.manifest = await response.json();
            this._renderFolders();
            this._updateFavoritesCount();
        } catch (error) {
            console.error('Error loading DX7 manifest:', error);
            this.listElement.innerHTML = `
                <div class="browser-error">
                    <p>Failed to load DX7 bank manifest</p>
                    <p style="font-size: 12px; color: #888;">${error.message}</p>
                </div>
            `;
        }
    }

    _getCurrentFolder() {
        let folder = this.manifest;
        for (const name of this.currentPath) {
            folder = folder[name];
        }
        return folder;
    }

    _renderBreadcrumb() {
        if (this.currentPath.length === 0) {
            this.breadcrumbElement.innerHTML = '<span class="crumb active" data-path="">Root</span>';
        } else {
            const crumbs = ['<span class="crumb" data-path="">Root</span>'];
            for (let i = 0; i < this.currentPath.length; i++) {
                const isLast = i === this.currentPath.length - 1;
                const path = this.currentPath.slice(0, i + 1).join('/');
                crumbs.push(
                    `<span class="crumb ${isLast ? 'active' : ''}" data-path="${path}">${this.currentPath[i]}</span>`
                );
            }
            this.breadcrumbElement.innerHTML = crumbs.join(' / ');
        }
    }

    _renderFolders() {
        // Always render from root (no navigation)
        const folder = this.manifest;
        let folderNames = Object.keys(folder).filter(k => k !== 'files' && typeof folder[k] === 'object');

        // Get search query
        const searchQuery = this.searchInput ? this.searchInput.value.toLowerCase().trim() : '';

        // Apply search filter - hide folders that don't match search
        if (searchQuery) {
            folderNames = folderNames.filter(folderName => {
                const subFolder = folder[folderName];
                return this._folderMatchesSearch(subFolder, folderName, searchQuery);
            });
        }

        // Apply favorites filter if active - hide folders without favorites
        if (this.showFavoritesOnly) {
            folderNames = folderNames.filter(folderName => {
                const subFolder = folder[folderName];
                return this._countFavoritesInFolder(subFolder) > 0;
            });
        }

        // Root level doesn't have files, only folders
        let filesToShow = [];

        if (folderNames.length === 0 && filesToShow.length === 0) {
            let message;
            if (searchQuery && this.showFavoritesOnly) {
                message = 'No favorites match search';
            } else if (searchQuery) {
                message = 'No banks found';
            } else if (this.showFavoritesOnly) {
                message = 'No favorites found';
            } else {
                message = 'No folders or banks found';
            }
            this.listElement.innerHTML = `<div class="browser-empty">${message}</div>`;
            return;
        }

        this.currentView = 'folders';
        this.selectedBank = null;
        this.patchPreviewElement.style.display = 'none';

        // Render folders with expansion support
        let html = '';
        folderNames.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        for (let i = 0; i < folderNames.length; i++) {
            const folderName = folderNames[i];
            const folderPath = folderName; // No currentPath, just the folder name
            const subFolder = folder[folderName];
            const fileCount = this._countFiles(subFolder);
            const favCount = this._countFavoritesInFolder(subFolder);
            const isExpanded = this.expandedFolders.has(folderPath);

            html += `
                <div class="browser-folder-container">
                    <div class="browser-list-item browser-folder-item"
                         data-folder="${folderName}">
                        <span class="expand-icon ${isExpanded ? 'expanded' : ''}"
                              data-folder-path="${folderPath}"
                              title="${isExpanded ? 'Collapse' : 'Expand'} folder">
                            ${isExpanded ? '▼' : '▶'}
                        </span>
                        <span class="browser-folder-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z"/>
                            </svg>
                        </span>
                        <span class="browser-item-name">${folderName}</span>
                        <span class="browser-item-size">${fileCount} banks${favCount > 0 ? ` (${favCount} ★)` : ''}</span>
                    </div>
                    ${isExpanded ? this._renderFolderContents(subFolder, folderPath) : ''}
                </div>
            `;
        }

        // If current folder has files, show them too
        if (filesToShow.length > 0) {
            html += this._renderFiles(filesToShow);
        }

        this.listElement.innerHTML = html;

        // No breadcrumb needed in expandable view
        this._updateButtons();
    }

    /**
     * Render contents of an expanded folder (recursive for nested folders)
     * @param {object} folder - Folder object from manifest
     * @param {string} parentPath - Path to parent folder
     * @returns {string} HTML for folder contents
     * @private
     */
    _renderFolderContents(folder, parentPath) {
        let html = '<div class="folder-contents">';

        // Get search query
        const searchQuery = this.searchInput ? this.searchInput.value.toLowerCase().trim() : '';

        // Render subfolders
        let subFolderNames = Object.keys(folder)
            .filter(k => k !== 'files' && typeof folder[k] === 'object')
            .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        // Apply search filter - hide folders that don't match search
        if (searchQuery) {
            subFolderNames = subFolderNames.filter(subFolderName => {
                const subFolder = folder[subFolderName];
                return this._folderMatchesSearch(subFolder, subFolderName, searchQuery);
            });
        }

        // Apply favorites filter - hide folders without favorites
        if (this.showFavoritesOnly) {
            subFolderNames = subFolderNames.filter(subFolderName => {
                const subFolder = folder[subFolderName];
                return this._countFavoritesInFolder(subFolder) > 0;
            });
        }

        for (const subFolderName of subFolderNames) {
            const subFolderPath = `${parentPath}/${subFolderName}`;
            const subFolder = folder[subFolderName];
            const fileCount = this._countFiles(subFolder);
            const favCount = this._countFavoritesInFolder(subFolder);
            const isExpanded = this.expandedFolders.has(subFolderPath);

            html += `
                <div class="browser-folder-container">
                    <div class="browser-list-item browser-folder-item nested-folder"
                         data-folder="${subFolderName}">
                        <span class="expand-icon ${isExpanded ? 'expanded' : ''}"
                              data-folder-path="${subFolderPath}"
                              title="${isExpanded ? 'Collapse' : 'Expand'} folder">
                            ${isExpanded ? '▼' : '▶'}
                        </span>
                        <span class="browser-folder-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z"/>
                            </svg>
                        </span>
                        <span class="browser-item-name">${subFolderName}</span>
                        <span class="browser-item-size">${fileCount} banks${favCount > 0 ? ` (${favCount} ★)` : ''}</span>
                    </div>
                    ${isExpanded ? this._renderFolderContents(subFolder, subFolderPath) : ''}
                </div>
            `;
        }

        // Render files in this folder
        if (folder.files && folder.files.length > 0) {
            let filesToShow = folder.files;

            // Apply search filter
            if (searchQuery) {
                filesToShow = filesToShow.filter(file =>
                    file.name.toLowerCase().includes(searchQuery)
                );
            }

            // Apply favorites filter
            if (this.showFavoritesOnly) {
                filesToShow = filesToShow.filter(file => this.favoritesManager.has(file.path));
            }

            if (filesToShow.length > 0) {
                html += this._renderFiles(filesToShow);
            }
        }

        html += '</div>';
        return html;
    }

    _renderFiles(files) {
        let html = '';
        for (const file of files) {
            const isFavorited = this.favoritesManager.has(file.path);
            const isSelected = this.selectedBank && this.selectedBank.path === file.path;
            const starIcon = this._getStarIcon(isFavorited);

            // Check tuning status for this bank
            const hasTuning = this.tuningCache.has(file.path);
            const tuningEnabled = this.tuningCache.isEnabled(file.path);
            const tuningOffset = hasTuning ? this.tuningCache.getAverageOffset(file.path) : 0;

            // Determine tuning icon state
            let tuningClass = 'tuning-icon';
            let tuningTitle = 'Not analysed';
            if (hasTuning) {
                if (Math.abs(tuningOffset) < 5) {
                    tuningClass += ' in-tune';
                    tuningTitle = 'In tune';
                } else if (tuningEnabled) {
                    tuningClass += ' active';
                    tuningTitle = `Tuning: ${tuningOffset > 0 ? '+' : ''}${tuningOffset}¢`;
                } else {
                    tuningClass += ' disabled';
                    tuningTitle = `Tuning disabled (${tuningOffset > 0 ? '+' : ''}${tuningOffset}¢)`;
                }
            }

            html += `
                <div class="browser-list-item browser-file-item ${isSelected ? 'selected' : ''}"
                     data-file="${file.path}">
                    <button class="favorite-star-button" data-path="${file.path}"
                            title="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}"
                            aria-label="${isFavorited ? 'Remove from favorites' : 'Add to favorites'}">
                        ${starIcon}
                    </button>
                    <span class="browser-item-name">${file.name}</span>
                    <button class="${tuningClass}" data-bank-path="${file.path}"
                            title="${tuningTitle}"
                            aria-label="${tuningTitle}">
                        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
                            <path d="M5 2 L5 9 Q5 11 7 11 L7 14"/>
                            <path d="M11 2 L11 9 Q11 11 9 11 L9 14"/>
                            <line x1="7" y1="14" x2="9" y2="14"/>
                        </svg>
                    </button>
                    <span class="browser-item-size">${this._formatSize(file.size)}</span>
                </div>
            `;
        }
        return html;
    }

    _countFiles(folder) {
        let count = 0;
        if (folder.files) {
            count += folder.files.length;
        }
        for (const key in folder) {
            if (key !== 'files' && typeof folder[key] === 'object') {
                count += this._countFiles(folder[key]);
            }
        }
        return count;
    }

    _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    _countFavoritesInFolder(folder) {
        let count = 0;
        if (folder.files) {
            count += folder.files.filter(f => this.favoritesManager.has(f.path)).length;
        }
        for (const key in folder) {
            if (key !== 'files' && typeof folder[key] === 'object') {
                count += this._countFavoritesInFolder(folder[key]);
            }
        }
        return count;
    }

    /**
     * Check if folder or its contents match search query
     * Returns true if:
     * - Folder name matches query
     * - Any bank file inside matches query (recursively)
     * @param {object} folder - Folder object from manifest
     * @param {string} folderName - Name of the folder
     * @param {string} searchQuery - Lowercase search query
     * @returns {boolean} True if folder should be shown
     * @private
     */
    _folderMatchesSearch(folder, folderName, searchQuery) {
        // Check if folder name matches
        if (folderName.toLowerCase().includes(searchQuery)) {
            return true;
        }

        // Check if any bank files in this folder match
        if (folder.files && folder.files.some(file =>
            file.name.toLowerCase().includes(searchQuery)
        )) {
            return true;
        }

        // Recursively check subfolders
        for (const key in folder) {
            if (key !== 'files' && typeof folder[key] === 'object') {
                if (this._folderMatchesSearch(folder[key], key, searchQuery)) {
                    return true;
                }
            }
        }

        return false;
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
            this._renderFolders();
        }
    }

    _handleTuningClick(tuningIcon) {
        const bankPath = tuningIcon.dataset.bankPath;

        // Check if tuning data exists for this bank
        if (!this.tuningCache.has(bankPath)) {
            return;
        }

        // Toggle tuning enabled/disabled
        const nowEnabled = this.tuningCache.toggle(bankPath);
        const tuningOffset = this.tuningCache.getAverageOffset(bankPath);

        // Update icon state
        tuningIcon.classList.remove('active', 'disabled', 'in-tune');

        if (Math.abs(tuningOffset) < 5) {
            tuningIcon.classList.add('in-tune');
            tuningIcon.title = 'In tune';
        } else if (nowEnabled) {
            tuningIcon.classList.add('active');
            tuningIcon.title = `Tuning: ${tuningOffset > 0 ? '+' : ''}${tuningOffset.toFixed(0)}¢`;
        } else {
            tuningIcon.classList.add('disabled');
            tuningIcon.title = `Tuning disabled (${tuningOffset > 0 ? '+' : ''}${tuningOffset.toFixed(0)}¢)`;
        }

        // If this bank is currently loaded, update the voice's fine tune
        if (this.selectedBank && this.selectedBank.path === bankPath) {
            // Find the currently selected voice and update its fine tune
            const voiceIndex = state.baeng.ui.selectedVoice;
            const voice = state.baeng.voices[voiceIndex];

            if (voice && voice.dx7BankPath === bankPath) {
                // Get the current patch index
                const patchIndex = voice.dx7PatchIndex || 0;
                voice.dx7FineTune = nowEnabled ? this.tuningCache.getOffsetCents(bankPath, patchIndex) : 0;
            }
        }
    }

    _updateFavoritesCount() {
        if (!this.favoritesCountElement) return;
        const count = this.favoritesManager.count();
        this.favoritesCountElement.textContent = `${count} favorite${count !== 1 ? 's' : ''}`;
    }

    _updateButtons() {
        // Hide back button (no navigation in expandable view)
        this.backBtn.style.display = 'none';

        // Enable/disable load button based on selection
        const hasSelection = this.selectedBank !== null;
        this.loadBtn.disabled = !hasSelection;
    }

    _attachEventListeners() {
        // List item clicks
        this.listElement.addEventListener('click', (e) => {
            // Handle star button clicks
            const starButton = e.target.closest('.favorite-star-button');
            if (starButton) {
                e.stopPropagation(); // Prevent item selection
                this._handleStarClick(starButton);
                return;
            }

            // Handle tuning icon clicks
            const tuningIcon = e.target.closest('.tuning-icon');
            if (tuningIcon) {
                e.stopPropagation(); // Prevent item selection
                this._handleTuningClick(tuningIcon);
                return;
            }

            // Handle expand/collapse icon clicks
            const expandIcon = e.target.closest('.expand-icon');
            if (expandIcon) {
                e.stopPropagation();
                const folderPath = expandIcon.dataset.folderPath;
                this._toggleFolder(folderPath);
                return;
            }

            const folderItem = e.target.closest('.browser-folder-item');
            const fileItem = e.target.closest('.browser-file-item');

            if (folderItem) {
                // Get the folder path from the expand icon
                const expandIcon = folderItem.querySelector('.baeng-app .expand-icon');
                if (expandIcon) {
                    const folderPath = expandIcon.dataset.folderPath;
                    this._toggleFolder(folderPath);
                }
            } else if (fileItem) {
                const filePath = fileItem.dataset.file;
                this._selectFileByPath(filePath);
            }
        });

        // Double-click on file to load
        this.listElement.addEventListener('dblclick', (e) => {
            const fileItem = e.target.closest('.browser-file-item');
            if (fileItem) {
                const filePath = fileItem.dataset.file;
                this._selectFileByPath(filePath);
                this._handleLoad();
            }
        });

        // No breadcrumb or back button needed in expandable view
        // (navigation removed - folders expand in place)

        // Search input real-time filtering
        if (this.searchInput) {
            this.searchInput.addEventListener('input', () => {
                this._renderFolders();
            });
        }

        // Favorites filter toggle
        if (this.favoritesFilterBtn) {
            this.favoritesFilterBtn.addEventListener('click', () => {
                this.showFavoritesOnly = !this.showFavoritesOnly;
                this.favoritesFilterBtn.classList.toggle('active', this.showFavoritesOnly);

                // Update button text to show current filter state
                this.favoritesFilterBtn.textContent = this.showFavoritesOnly ? '★' : '☆';

                this._renderFolders();
            });
        }

        // Load button
        this.loadBtn.addEventListener('click', () => {
            this._handleLoad();
        });

        // Close button
        this.closeBtn.addEventListener('click', () => {
            this.close();
        });

        // Keyboard navigation
        this.modal.addEventListener('keydown', (e) => {
            if (!this.modal.classList.contains('active')) return;

            switch (e.key) {
                case 'Escape':
                    e.preventDefault();
                    if (this.currentPath.length > 0) {
                        this.currentPath.pop();
                        this._renderFolders();
                    } else {
                        this.close();
                    }
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (this.selectedBank) {
                        this._handleLoad();
                    }
                    break;
            }
        });
    }

    /**
     * Select a file by its path (for expandable view without navigation)
     * @param {string} filePath - Path to the file
     * @private
     */
    _selectFileByPath(filePath) {
        // Find the file in the manifest
        const file = this._findFileByPath(filePath);
        if (!file) {
            console.warn(`[DX7Browser] File not found: ${filePath}`);
            return;
        }

        this.selectedBank = file;
        this.currentView = 'files';

        // Update selection visual
        const items = this.listElement.querySelectorAll('.baeng-app .browser-file-item');
        items.forEach((item) => {
            if (item.dataset.file === filePath) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        this._updateButtons();

        // Auto-preview the selected bank
        this._previewSelectedBank();
    }

    /**
     * Find a file by path in the manifest (recursive search)
     * @param {string} filePath - Path to search for
     * @param {object} folder - Folder to search in (defaults to root)
     * @returns {object|null} File object or null
     * @private
     */
    _findFileByPath(filePath, folder = null) {
        if (!folder) folder = this.manifest;

        // Search files in current folder
        if (folder.files) {
            const found = folder.files.find(f => f.path === filePath);
            if (found) return found;
        }

        // Search subfolders
        for (const key in folder) {
            if (key !== 'files' && typeof folder[key] === 'object') {
                const found = this._findFileByPath(filePath, folder[key]);
                if (found) return found;
            }
        }

        return null;
    }

    /**
     * Auto-preview the selected bank (shows patch names immediately)
     * @private
     */
    async _previewSelectedBank() {
        if (!this.selectedBank) return;

        try {
            // Show loading state
            this.patchPreviewElement.style.display = 'block';
            this.patchListElement.innerHTML = '<div class="browser-loading">Loading patches...</div>';

            // Load the bank file
            const bankPath = `Reference/DX7_AllTheWeb/${this.selectedBank.path}`;
            const response = await fetch(bankPath);
            if (!response.ok) {
                throw new Error(`Failed to load bank: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const file = new File([arrayBuffer], this.selectedBank.name);

            // Parse the bank using DX7PatchLibrary
            await this.dx7PatchLibrary.loadPatchFromFile(file);

            // Get the full bank (loadPatchFromFile only returns first patch, bank is in currentBank)
            this.previewedPatches = this.dx7PatchLibrary.getBankCopy();

            // Display patch names
            this.patchListElement.innerHTML = this.previewedPatches
                .map((patch, i) => `
                    <div class="patch-item">
                        <span class="patch-number">${(i + 1).toString().padStart(2, '0')}</span>
                        <span class="patch-name">${patch.name || 'Untitled'}</span>
                    </div>
                `)
                .join('');


        } catch (error) {
            console.error('[DX7Browser] Error previewing bank:', error);
            this.patchListElement.innerHTML = `
                <div class="browser-error">
                    <p>Failed to preview bank</p>
                    <p style="font-size: 11px; color: #888;">${error.message}</p>
                </div>
            `;
            this.previewedPatches = null;
        }
    }

    async _handlePreview() {
        if (!this.selectedBank) return;

        try {
            this.previewBtn.disabled = true;
            this.previewBtn.textContent = 'Loading...';

            // Load the bank file
            const bankPath = `Reference/DX7_AllTheWeb/${this.selectedBank.path}`;
            const response = await fetch(bankPath);
            if (!response.ok) {
                throw new Error(`Failed to load bank: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const file = new File([arrayBuffer], this.selectedBank.name);

            // Parse the bank using DX7PatchLibrary
            await this.dx7PatchLibrary.loadPatchFromFile(file);
            const patches = this.dx7PatchLibrary.getBankCopy();

            // Display patch names
            this.patchPreviewElement.style.display = 'block';
            this.patchListElement.innerHTML = patches
                .map((patch, i) => `
                    <div class="patch-item">
                        <span class="patch-number">${(i + 1).toString().padStart(2, '0')}</span>
                        <span class="patch-name">${patch.name || 'Untitled'}</span>
                    </div>
                `)
                .join('');

            this.previewBtn.textContent = 'Preview Patches';
            this.previewBtn.disabled = false;

        } catch (error) {
            console.error('Error previewing bank:', error);
            this.previewBtn.textContent = 'Preview Patches';
            this.previewBtn.disabled = false;
            alert(`Failed to preview bank: ${error.message}`);
        }
    }

    async _handleLoad() {
        if (!this.selectedBank) return;

        try {
            this.loadBtn.disabled = true;
            this.loadBtn.textContent = 'Loading...';

            // Use previewed patches if available, otherwise load fresh
            let patches = this.previewedPatches;

            if (!patches) {
                // Load the bank file (fallback if preview hasn't run yet)
                const bankPath = `Reference/DX7_AllTheWeb/${this.selectedBank.path}`;
                const response = await fetch(bankPath);
                if (!response.ok) {
                    throw new Error(`Failed to load bank: ${response.statusText}`);
                }

                const arrayBuffer = await response.arrayBuffer();
                const file = new File([arrayBuffer], this.selectedBank.name);

                // Parse and load the bank using DX7PatchLibrary
                await this.dx7PatchLibrary.loadPatchFromFile(file);

                // Get the full bank
                patches = this.dx7PatchLibrary.getBankCopy();
            }

            // Call the load callback (pass full path for tuning cache key)
            if (this.onLoad) {
                this.onLoad(patches, this.selectedBank.path);
            }

            // Close the modal
            this.close();

        } catch (error) {
            console.error('Error loading bank:', error);
            this.loadBtn.textContent = 'Load Bank';
            this.loadBtn.disabled = false;
            alert(`Failed to load bank: ${error.message}`);
        }
    }

    /**
     * Handle keyboard press for triggering patches
     * Only responds if the key matches the currently selected voice
     * @param {KeyboardEvent} event - The keyboard event
     */
    handleKeyPress(event) {
        if (!this.selectedBank || !this.previewedPatches) {
            return;
        }

        const keyNumber = parseInt(event.key);

        // Only respond if this key corresponds to the currently selected voice
        if (keyNumber !== state.selectedVoice + 1) {
            return;
        }

        event.preventDefault();

        // Trigger the currently loaded sound on the selected voice
        // NOTE: This plays whatever patch is currently loaded in the voice,
        // not necessarily the bank being previewed in the browser.
        // To preview the actual selected bank, you'd need to temporarily load it first.
        if (this.previewedPatches.length > 0) {

            // Trigger the voice using the imported triggerVoice function
            // This plays the currently loaded patch on this voice
            triggerVoice(
                state.selectedVoice,  // voiceIndex
                0,                     // accentLevel (no accent)
                1.0,                   // velocityMultiplier (full velocity)
                1,                     // ratchetCount (single trigger)
                false,                 // skipVoiceRelease
                null                   // scheduledTime (trigger immediately)
            );
        }
    }

    /**
     * Toggle folder expansion state
     * @param {string} folderPath - Full path to folder (e.g., "Factory/Bass")
     * @private
     */
    _toggleFolder(folderPath) {
        if (this.expandedFolders.has(folderPath)) {
            this.expandedFolders.delete(folderPath);
        } else {
            this.expandedFolders.add(folderPath);
        }
        this._renderFolders();
    }

    open() {
        this.modal.classList.add('active');

        // Reset state
        this.selectedBank = null;
        this.previewedPatches = null;
        this.showFavoritesOnly = false;
        this.expandedFolders.clear(); // Reset expansion state
        if (this.favoritesFilterBtn) {
            this.favoritesFilterBtn.classList.remove('active');
            // Reset star to outline
            this.favoritesFilterBtn.textContent = '☆';
        }
        this.patchPreviewElement.style.display = 'none';

        if (this.manifest) {
            this._renderFolders();
            this._updateFavoritesCount();
        }
    }

    close() {
        this.modal.classList.remove('active');
        this.patchPreviewElement.style.display = 'none';

        // Clear search input
        if (this.searchInput) {
            this.searchInput.value = '';
        }
    }
}
