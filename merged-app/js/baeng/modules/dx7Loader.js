/**
 * DX7 Patch Loader Module
 *
 * Provides functionality to load, parse, and manage Yamaha DX7 .syx patch files
 * from both user uploads and factory patches.
 *
 * @module dx7Loader
 */

import SysexDX7 from './dx7/sysex-dx7.js';

// Factory patch directory (relative to app root)
const FACTORY_PATCH_DIR = 'Reference/Yamaha-DX7-Drum-Sounds-Coffeeshopped/Individual/';

// List of all available factory patches
const FACTORY_PATCHES = [
    'AFXClap.syx',
    'AuteHat.syx',
    'Beefkick.syx',
    'BellsObvi.syx',
    'Big Tommy.syx',
    'BublClap.syx',
    'Buffkick.syx',
    'BussTom.syx',
    'DoopKick.syx',
    'DripChirp.syx',
    'FaceSnare.syx',
    'FunBwow.syx',
    'GlassSnare.syx',
    'GubKik.syx',
    'HolloHat.syx',
    'InsectShk.syx',
    'isThatTom?.syx',
    'JunkHat.syx',
    'MildSnare.syx',
    'NoiseTom.syx',
    'NzTri.syx',
    'PewPew.syx',
    'Plasteel.syx',
    'ResoSnare.syx',
    'RoboClap.syx',
    'SquirtShk.syx',
    'SwakHat.syx',
    'TamboWhstl.syx',
    'Thump.syx',
    'VeloBongo.syx',
    'Wump.syx',
    'ZapClap.syx'
];

/**
 * DX7 Patch Library Manager
 * Handles loading, parsing, and storing of DX7 patches
 */
class DX7PatchLibrary {
    constructor() {
        // Current loaded patch data
        this.currentPatch = null;

        // Current loaded bank (array of up to 32 patches)
        this.currentBank = [];

        // Current patch index in bank (0-31)
        this.currentPatchIndex = 0;

        // Cache of loaded patches (name -> parsed data)
        this.patchCache = new Map();

        // Parser instance (will be set when sysex-dx7.js is integrated)
        this.parser = null;
    }

    /**
     * Initialize the patch library
     * Sets up the sysex parser when available
     */
    async initialize() {
        // SysexDX7 is now a static object, no initialization needed
        this.parser = SysexDX7;
    }

    /**
     * Load a patch from a user-uploaded file
     *
     * @param {File} file - The .syx file from file input
     * @returns {Promise<Object>} Parsed patch data
     * @throws {Error} If file is invalid or parsing fails
     */
    async loadPatchFromFile(file) {
        if (!file) {
            throw new Error('No file provided');
        }

        if (!file.name.toLowerCase().endsWith('.syx')) {
            throw new Error('File must be a .syx file');
        }

        try {
            // Read file as ArrayBuffer
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            const uint8Array = new Uint8Array(arrayBuffer);

            // Parse the sysex data (returns array of patches)
            const patches = await this.parseSysexData(uint8Array, file.name);

            // Store as current bank
            this.currentBank = patches;
            this.currentPatchIndex = 0;
            this.currentPatch = patches[0];

            // Cache the bank
            this.patchCache.set(file.name, patches);

            return this.currentPatch;

        } catch (error) {
            throw new Error(`Failed to load patch from file: ${error.message}`);
        }
    }

    /**
     * Select a patch from the currently loaded bank
     *
     * @param {number} index - Patch index (0-31)
     * @returns {Object} The selected patch data
     * @throws {Error} If no bank is loaded or index is invalid
     */
    selectPatch(index) {
        if (this.currentBank.length === 0) {
            throw new Error('No bank loaded');
        }

        const patchIndex = Math.max(0, Math.min(index, this.currentBank.length - 1));
        this.currentPatchIndex = patchIndex;
        this.currentPatch = this.currentBank[patchIndex];

        return this.currentPatch;
    }

    /**
     * Get a deep copy of the current bank for per-voice storage
     * This allows each voice to have its own independent bank
     * Properly handles Uint8Array rawData in each patch
     *
     * @returns {Array} Deep copy of the current bank
     */
    getBankCopy() {
        if (!this.currentBank || this.currentBank.length === 0) {
            return [];
        }

        // Deep copy each patch, handling Uint8Array rawData
        return this.currentBank.map(patch => {
            // Start with a shallow copy
            const patchCopy = { ...patch };

            // Deep copy parsed voice data (nested objects)
            if (patch.parsed) {
                patchCopy.parsed = JSON.parse(JSON.stringify(patch.parsed));
            }

            // Deep copy metadata
            if (patch.metadata) {
                patchCopy.metadata = JSON.parse(JSON.stringify(patch.metadata));
            }

            // Copy Uint8Array rawData properly
            if (patch.rawData && patch.rawData instanceof Uint8Array) {
                patchCopy.rawData = new Uint8Array(patch.rawData);
            }

            return patchCopy;
        });
    }

    /**
     * Load a factory patch by name
     *
     * @param {string} name - Name of the factory patch (e.g., 'Beefkick.syx')
     * @returns {Promise<Object>} Parsed patch data
     * @throws {Error} If patch not found or loading fails
     */
    async loadFactoryPatch(name) {
        // Normalize the name (add .syx if not present)
        const patchName = name.endsWith('.syx') ? name : `${name}.syx`;

        // Check if patch exists in factory list
        if (!FACTORY_PATCHES.includes(patchName)) {
            throw new Error(`Factory patch not found: ${patchName}`);
        }

        // Check cache first
        if (this.patchCache.has(patchName)) {
            this.currentPatch = this.patchCache.get(patchName);
            return this.currentPatch;
        }

        try {
            // Fetch the patch file
            const url = `${FACTORY_PATCH_DIR}${patchName}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Get the binary data
            const arrayBuffer = await response.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            // Parse the sysex data
            const patchData = await this.parseSysexData(uint8Array, patchName);

            // Store as current patch
            this.currentPatch = patchData;

            // Cache the patch
            this.patchCache.set(patchName, patchData);

            return patchData;

        } catch (error) {
            throw new Error(`Failed to load factory patch '${patchName}': ${error.message}`);
        }
    }

    /**
     * Parse raw sysex data into DX7 patch structure
     *
     * @param {Uint8Array} data - Raw sysex data
     * @param {string} name - Name/identifier for the patch
     * @returns {Promise<Object>} Parsed patch data
     * @private
     */
    async parseSysexData(data, name) {
        // Validate basic sysex structure
        if (data.length === 0) {
            throw new Error('Empty sysex data');
        }

        // Check for sysex start byte (0xF0)
        if (data[0] !== 0xF0) {
            throw new Error('Invalid sysex file: missing start byte (0xF0)');
        }

        // Check for sysex end byte (0xF7)
        if (data[data.length - 1] !== 0xF7) {
            throw new Error('Invalid sysex file: missing end byte (0xF7)');
        }

        // Convert Uint8Array to string for sysex parser
        let dataString = '';
        for (let i = 0; i < data.length; i++) {
            dataString += String.fromCharCode(data[i]);
        }

        // Parse using SysexDX7 (returns array of patches)
        let parsedVoices;
        try {
            parsedVoices = SysexDX7.loadBank(dataString);
        } catch (error) {
            throw new Error('Unable to parse DX7 sysex data. File may be in an unsupported format.');
        }

        if (!parsedVoices || parsedVoices.length === 0) {
            throw new Error('No valid patches found in sysex data');
        }

        // Build complete patch data structure for each patch
        return parsedVoices.map((parsedVoice, index) => ({
            name: parsedVoice.name || `${name.replace('.syx', '')} ${index + 1}`,
            rawData: data,
            size: data.length,
            loaded: new Date().toISOString(),

            // Parsed DX7 parameters from sysex-dx7.js
            parsed: parsedVoice,

            // Metadata
            metadata: {
                manufacturer: 'Yamaha',
                model: 'DX7',
                source: name.includes('factory') ? 'factory' : 'user',
                algorithm: parsedVoice.algorithm,
                voiceName: parsedVoice.name
            }
        }));
    }

    /**
     * Read a File object as ArrayBuffer
     *
     * @param {File} file - File to read
     * @returns {Promise<ArrayBuffer>} File contents as ArrayBuffer
     * @private
     */
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event) => {
                resolve(event.target.result);
            };

            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };

            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Get list of all available factory patches
     *
     * @returns {Array<Object>} Array of patch information objects
     */
    listAvailablePatches() {
        return FACTORY_PATCHES.map(name => ({
            name: name,
            displayName: name.replace('.syx', ''),
            category: this.categorizePatch(name),
            cached: this.patchCache.has(name)
        }));
    }

    /**
     * Categorize a patch based on its name
     *
     * @param {string} name - Patch filename
     * @returns {string} Category name
     * @private
     */
    categorizePatch(name) {
        const lowerName = name.toLowerCase();

        if (lowerName.includes('kick') || lowerName.includes('kik')) {
            return 'kick';
        } else if (lowerName.includes('snare')) {
            return 'snare';
        } else if (lowerName.includes('hat')) {
            return 'hihat';
        } else if (lowerName.includes('clap')) {
            return 'clap';
        } else if (lowerName.includes('tom')) {
            return 'tom';
        } else if (lowerName.includes('shk') || lowerName.includes('shaker')) {
            return 'percussion';
        } else {
            return 'other';
        }
    }

    /**
     * Get the currently loaded patch
     *
     * @returns {Object|null} Current patch data or null if none loaded
     */
    getCurrentPatch() {
        return this.currentPatch;
    }

    /**
     * Get patch from cache by name
     *
     * @param {string} name - Patch name
     * @returns {Object|null} Cached patch data or null
     */
    getCachedPatch(name) {
        return this.patchCache.get(name) || null;
    }

    /**
     * Clear the patch cache
     * Optionally preserve the current patch
     *
     * @param {boolean} preserveCurrent - Keep current patch in cache
     */
    clearCache(preserveCurrent = true) {
        if (preserveCurrent && this.currentPatch) {
            const currentName = this.currentPatch.name;
            this.patchCache.clear();
            this.patchCache.set(currentName, this.currentPatch);
        } else {
            this.patchCache.clear();
            this.currentPatch = null;
        }
    }

    /**
     * Get cache statistics
     *
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            size: this.patchCache.size,
            currentPatch: this.currentPatch ? this.currentPatch.name : null,
            cachedPatches: Array.from(this.patchCache.keys())
        };
    }

    /**
     * Preload multiple factory patches
     * Useful for preloading commonly used patches
     *
     * @param {Array<string>} patchNames - Array of patch names to preload
     * @returns {Promise<Array>} Array of loaded patch data
     */
    async preloadPatches(patchNames) {
        const loadPromises = patchNames.map(name =>
            this.loadFactoryPatch(name).catch(err => {
                return null;
            })
        );

        const results = await Promise.all(loadPromises);
        const loaded = results.filter(r => r !== null);

        return loaded;
    }

    /**
     * Export current patch data for saving/sharing
     *
     * @returns {Object|null} Exportable patch data
     */
    exportCurrentPatch() {
        if (!this.currentPatch) {
            return null;
        }

        return {
            name: this.currentPatch.name,
            rawData: Array.from(this.currentPatch.rawData),
            metadata: this.currentPatch.metadata,
            exported: new Date().toISOString()
        };
    }

    /**
     * Import patch data from exported format
     *
     * @param {Object} exportedData - Previously exported patch data
     * @returns {Promise<Object>} Imported patch data
     */
    async importPatch(exportedData) {
        if (!exportedData || !exportedData.rawData) {
            throw new Error('Invalid patch data for import');
        }

        const uint8Array = new Uint8Array(exportedData.rawData);
        const patchData = await this.parseSysexData(uint8Array, exportedData.name);

        this.currentPatch = patchData;
        this.patchCache.set(exportedData.name, patchData);

        return patchData;
    }
}

// Create and export singleton instance
const dx7Library = new DX7PatchLibrary();

// Export the library instance and class
export default dx7Library;
export { DX7PatchLibrary };

// Also export individual functions for convenience
export const {
    loadPatchFromFile,
    loadFactoryPatch,
    listAvailablePatches,
    getCurrentPatch,
    getCachedPatch,
    clearCache,
    getCacheStats,
    preloadPatches,
    exportCurrentPatch,
    importPatch
} = Object.fromEntries(
    Object.getOwnPropertyNames(DX7PatchLibrary.prototype)
        .filter(name => name !== 'constructor')
        .map(name => [name, (...args) => dx7Library[name](...args)])
);
