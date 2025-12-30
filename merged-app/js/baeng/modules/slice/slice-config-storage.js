/**
 * Slice Configuration Storage Manager
 * Handles persistence of slice configurations to localStorage
 */

const STORAGE_PREFIX = 'baeng_slice_';
const INDEX_KEY = 'baeng_slice_index';
const VERSION = '1.0';

/**
 * Generate a short hash from audio buffer data
 * @param {AudioBuffer} buffer
 * @returns {string} 8-character hash
 */
function generateBufferHash(buffer) {
    const data = buffer.getChannelData(0);
    const step = Math.floor(data.length / 100); // Sample 100 points
    let hash = 0;

    for (let i = 0; i < data.length; i += step) {
        const sample = Math.floor(data[i] * 1000000);
        hash = ((hash << 5) - hash) + sample;
        hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash).toString(36).substring(0, 8);
}

/**
 * Sanitize filename for storage key
 * @param {string} filename
 * @returns {string}
 */
function sanitizeFilename(filename) {
    return filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .substring(0, 50); // Limit length
}

/**
 * Generate storage key for a sample
 * @param {string} filename
 * @param {string} hash
 * @returns {string}
 */
function generateStorageKey(filename, hash) {
    return `${STORAGE_PREFIX}${sanitizeFilename(filename)}_${hash}`;
}

/**
 * Load the slice config index
 * @returns {object}
 */
function loadIndex() {
    try {
        const json = localStorage.getItem(INDEX_KEY);
        if (!json) {
            return { version: VERSION, samples: [] };
        }
        return JSON.parse(json);
    } catch (error) {
        console.error('[SliceStorage] Error loading index:', error);
        return { version: VERSION, samples: [] };
    }
}

/**
 * Save the slice config index
 * @param {object} index
 */
function saveIndex(index) {
    try {
        localStorage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch (error) {
        console.error('[SliceStorage] Error saving index:', error);
    }
}

/**
 * Save a slice configuration
 * @param {AudioBuffer} buffer - The audio buffer
 * @param {string} filename - The sample filename
 * @param {object} sliceConfig - Slice configuration from getSliceConfig()
 * @returns {string} Storage key where config was saved
 */
export function saveSliceConfig(buffer, filename, sliceConfig) {
    try {
        // Generate hash and storage key
        const hash = generateBufferHash(buffer);
        const storageKey = generateStorageKey(filename, hash);

        // Add storage metadata
        const configWithMeta = {
            ...sliceConfig,
            contentHash: hash,
            metadata: {
                ...sliceConfig.metadata,
                modified: new Date().toISOString()
            }
        };

        // Save config
        localStorage.setItem(storageKey, JSON.stringify(configWithMeta));

        // Update index
        const index = loadIndex();
        const existingIndex = index.samples.findIndex(s =>
            s.filename === filename && s.contentHash === hash
        );

        const indexEntry = {
            filename: filename,
            contentHash: hash,
            storageKey: storageKey,
            sliceCount: sliceConfig.slices.length,
            modified: configWithMeta.metadata.modified
        };

        if (existingIndex >= 0) {
            index.samples[existingIndex] = indexEntry;
        } else {
            index.samples.push(indexEntry);
        }

        saveIndex(index);

        return storageKey;

    } catch (error) {
        console.error('[SliceStorage] Error saving slice config:', error);
        // If localStorage is full, try to make space
        if (error.name === 'QuotaExceededError') {
            console.warn('[SliceStorage] Storage quota exceeded, attempting cleanup...');
            cleanupOldConfigs(10);
            // Retry once
            try {
                const hash = generateBufferHash(buffer);
                const storageKey = generateStorageKey(filename, hash);
                const configWithMeta = {
                    ...sliceConfig,
                    contentHash: hash,
                    metadata: {
                        ...sliceConfig.metadata,
                        modified: new Date().toISOString()
                    }
                };
                localStorage.setItem(storageKey, JSON.stringify(configWithMeta));
                return storageKey;
            } catch (retryError) {
                console.error('[SliceStorage] Failed to save after cleanup:', retryError);
            }
        }
        return null;
    }
}

/**
 * Load a slice configuration for a sample
 * @param {AudioBuffer} buffer - The audio buffer (used for length validation)
 * @param {string} filename - The sample filename
 * @returns {object|null} Slice config or null if not found
 */
export function loadSliceConfig(buffer, filename) {
    try {
        // Look up by filename in the index (avoids hash mismatch issues
        // caused by floating point variations in audio decoding)
        const index = loadIndex();
        const entry = index.samples.find(s => s.filename === filename);

        if (!entry) {
            return null; // No saved config for this filename
        }

        // Use the stored storageKey from the index
        const json = localStorage.getItem(entry.storageKey);
        if (!json) {
            console.warn(`[SliceStorage] Index entry exists but config missing for: ${filename}`);
            return null;
        }

        const config = JSON.parse(json);

        // Scale slice positions if buffer length differs
        if (buffer && config.bufferLength && config.bufferLength !== buffer.length) {
            const scale = buffer.length / config.bufferLength;
            console.log(`[SliceStorage] Scaling slice positions for "${filename}": saved=${config.bufferLength}, current=${buffer.length}, scale=${scale.toFixed(3)}`);

            // Scale all slice positions
            if (config.slices) {
                config.slices = config.slices.map(slice => ({
                    ...slice,
                    start: Math.round(slice.start * scale),
                    end: Math.round(slice.end * scale)
                }));
            }

            // Update bufferLength to match current buffer
            config.bufferLength = buffer.length;
        }

        console.log(`[SliceStorage] Loaded config for "${filename}": ${config.slices?.length || 0} slices`);
        return config;

    } catch (error) {
        console.error('[SliceStorage] Error loading slice config:', error);
        return null;
    }
}

/**
 * Check if a sample has a saved slice config
 * @param {string} filename - The sample filename
 * @returns {object|null} Index entry with metadata, or null if not found
 */
export function hasSliceConfig(filename) {
    try {
        const index = loadIndex();
        return index.samples.find(s => s.filename === filename) || null;
    } catch (error) {
        console.error('[SliceStorage] Error checking slice config:', error);
        return null;
    }
}

/**
 * Delete a slice configuration
 * @param {string} filename - The sample filename
 * @param {string} hash - The content hash (optional)
 */
export function deleteSliceConfig(filename, hash = null) {
    try {
        const index = loadIndex();
        const entries = hash
            ? index.samples.filter(s => s.filename === filename && s.contentHash === hash)
            : index.samples.filter(s => s.filename === filename);

        entries.forEach(entry => {
            localStorage.removeItem(entry.storageKey);
        });

        // Update index
        index.samples = index.samples.filter(s =>
            !(s.filename === filename && (!hash || s.contentHash === hash))
        );
        saveIndex(index);

    } catch (error) {
        console.error('[SliceStorage] Error deleting slice config:', error);
    }
}

/**
 * Get all saved slice configs
 * @returns {array} Array of index entries
 */
export function getAllSliceConfigs() {
    const index = loadIndex();
    return index.samples;
}

/**
 * Clean up old slice configs to free space
 * @param {number} count - Number of oldest configs to remove
 */
function cleanupOldConfigs(count) {
    try {
        const index = loadIndex();

        // Sort by modified date (oldest first)
        const sorted = [...index.samples].sort((a, b) =>
            new Date(a.modified) - new Date(b.modified)
        );

        // Remove oldest N entries
        const toRemove = sorted.slice(0, count);
        toRemove.forEach(entry => {
            localStorage.removeItem(entry.storageKey);
        });

        // Update index
        index.samples = index.samples.filter(s =>
            !toRemove.find(r => r.storageKey === s.storageKey)
        );
        saveIndex(index);


    } catch (error) {
        console.error('[SliceStorage] Error cleaning up configs:', error);
    }
}

/**
 * Export all slice configs as JSON (for backup)
 * @returns {string} JSON string of all configs
 */
export function exportAllConfigs() {
    const index = loadIndex();
    const configs = {};

    index.samples.forEach(entry => {
        try {
            const json = localStorage.getItem(entry.storageKey);
            if (json) {
                configs[entry.storageKey] = JSON.parse(json);
            }
        } catch (error) {
            console.error(`[SliceStorage] Error exporting ${entry.filename}:`, error);
        }
    });

    return JSON.stringify({
        version: VERSION,
        exported: new Date().toISOString(),
        index: index,
        configs: configs
    }, null, 2);
}

/**
 * Import slice configs from JSON backup
 * @param {string} json - JSON string from exportAllConfigs()
 * @returns {number} Number of configs imported
 */
export function importAllConfigs(json) {
    try {
        const data = JSON.parse(json);
        let imported = 0;

        Object.entries(data.configs).forEach(([key, config]) => {
            try {
                localStorage.setItem(key, JSON.stringify(config));
                imported++;
            } catch (error) {
                console.error(`[SliceStorage] Error importing ${key}:`, error);
            }
        });

        // Restore index
        if (data.index) {
            saveIndex(data.index);
        }

        return imported;

    } catch (error) {
        console.error('[SliceStorage] Error importing configs:', error);
        return 0;
    }
}
