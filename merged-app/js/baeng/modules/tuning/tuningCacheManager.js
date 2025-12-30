/**
 * Tuning Cache Manager
 *
 * Manages localStorage persistence for DX7 bank tuning data.
 * Stores per-patch tuning offsets (in cents) for each bank.
 */

const STORAGE_KEY = 'baeng_dx7_tuning_cache';
const VERSION = '1.0.0';

/**
 * TuningCacheManager
 *
 * Stores and retrieves tuning metadata for DX7 banks.
 * Each bank stores tuning data for all 32 patches.
 */
export class TuningCacheManager {
    constructor(storageKey = STORAGE_KEY) {
        this.storageKey = storageKey;
        this.cache = this._load();
        this.listeners = [];
    }

    /**
     * Load cache from localStorage
     * @private
     * @returns {Object}
     */
    _load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            if (!data) {
                return { version: VERSION, banks: {} };
            }

            const parsed = JSON.parse(data);

            // Version migration if needed
            if (!parsed.version || parsed.version !== VERSION) {
                parsed.version = VERSION;
            }

            return parsed;
        } catch (error) {
            console.error('[TuningCache] Failed to load cache:', error);
            return { version: VERSION, banks: {} };
        }
    }

    /**
     * Save cache to localStorage
     * @private
     */
    _save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
            this._notifyListeners();
        } catch (error) {
            console.error('[TuningCache] Failed to save cache:', error);
            if (error.name === 'QuotaExceededError') {
                console.warn('[TuningCache] Storage quota exceeded');
            }
        }
    }

    /**
     * Notify all registered listeners of changes
     * @private
     */
    _notifyListeners() {
        this.listeners.forEach(callback => callback(this.cache));
    }

    /**
     * Get tuning data for a bank
     * @param {string} bankPath - Path to the bank file (e.g., "Aminet/1.syx")
     * @returns {Object|null} Bank tuning data or null if not found
     */
    get(bankPath) {
        return this.cache.banks[bankPath] || null;
    }

    /**
     * Store tuning data for a bank
     * @param {string} bankPath - Path to the bank file
     * @param {Array<Object>} patches - Array of patch tuning data
     *   Each entry: { offsetCents: number, confidence: number }
     */
    set(bankPath, patches) {
        this.cache.banks[bankPath] = {
            patches,
            enabled: true,
            detectedAt: new Date().toISOString()
        };
        this._save();
    }

    /**
     * Check if a bank has been analysed
     * @param {string} bankPath - Path to the bank file
     * @returns {boolean}
     */
    has(bankPath) {
        return !!this.cache.banks[bankPath];
    }

    /**
     * Check if tuning correction is enabled for a bank
     * @param {string} bankPath - Path to the bank file
     * @returns {boolean}
     */
    isEnabled(bankPath) {
        const bankData = this.cache.banks[bankPath];
        return bankData ? bankData.enabled !== false : false;
    }

    /**
     * Toggle tuning correction on/off for a bank
     * @param {string} bankPath - Path to the bank file
     * @returns {boolean} New enabled state
     */
    toggle(bankPath) {
        const bankData = this.cache.banks[bankPath];
        if (!bankData) return false;

        bankData.enabled = !bankData.enabled;
        this._save();

        return bankData.enabled;
    }

    /**
     * Enable tuning correction for a bank
     * @param {string} bankPath - Path to the bank file
     */
    enable(bankPath) {
        const bankData = this.cache.banks[bankPath];
        if (bankData && !bankData.enabled) {
            bankData.enabled = true;
            this._save();
        }
    }

    /**
     * Disable tuning correction for a bank
     * @param {string} bankPath - Path to the bank file
     */
    disable(bankPath) {
        const bankData = this.cache.banks[bankPath];
        if (bankData && bankData.enabled) {
            bankData.enabled = false;
            this._save();
        }
    }

    /**
     * Get tuning offset in cents for a specific patch
     * Returns 0 if not found or disabled
     * @param {string} bankPath - Path to the bank file
     * @param {number} patchIndex - Patch index (0-31)
     * @returns {number} Offset in cents
     */
    getOffsetCents(bankPath, patchIndex) {
        const bankData = this.cache.banks[bankPath];

        if (!bankData || !bankData.enabled) {
            return 0;
        }

        const patchData = bankData.patches[patchIndex];
        if (!patchData) {
            return 0;
        }

        return patchData.offsetCents || 0;
    }

    /**
     * Get confidence score for a specific patch
     * @param {string} bankPath - Path to the bank file
     * @param {number} patchIndex - Patch index (0-31)
     * @returns {number} Confidence (0-1)
     */
    getConfidence(bankPath, patchIndex) {
        const bankData = this.cache.banks[bankPath];

        if (!bankData) {
            return 0;
        }

        const patchData = bankData.patches[patchIndex];
        if (!patchData) {
            return 0;
        }

        return patchData.confidence || 0;
    }

    /**
     * Get average offset for a bank (useful for display)
     * @param {string} bankPath - Path to the bank file
     * @returns {number} Average offset in cents
     */
    getAverageOffset(bankPath) {
        const bankData = this.cache.banks[bankPath];
        if (!bankData || !bankData.patches || bankData.patches.length === 0) {
            return 0;
        }

        const sum = bankData.patches.reduce((acc, p) => acc + (p.offsetCents || 0), 0);
        return Math.round(sum / bankData.patches.length);
    }

    /**
     * Get average confidence for a bank
     * @param {string} bankPath - Path to the bank file
     * @returns {number} Average confidence (0-1)
     */
    getAverageConfidence(bankPath) {
        const bankData = this.cache.banks[bankPath];
        if (!bankData || !bankData.patches || bankData.patches.length === 0) {
            return 0;
        }

        const sum = bankData.patches.reduce((acc, p) => acc + (p.confidence || 0), 0);
        return sum / bankData.patches.length;
    }

    /**
     * Delete tuning data for a bank
     * @param {string} bankPath - Path to the bank file
     */
    delete(bankPath) {
        if (this.cache.banks[bankPath]) {
            delete this.cache.banks[bankPath];
            this._save();
        }
    }

    /**
     * Get all cached bank paths
     * @returns {Array<string>}
     */
    getAllBankPaths() {
        return Object.keys(this.cache.banks);
    }

    /**
     * Get total number of cached banks
     * @returns {number}
     */
    count() {
        return Object.keys(this.cache.banks).length;
    }

    /**
     * Clear all cached tuning data
     */
    clear() {
        this.cache.banks = {};
        this._save();
    }

    /**
     * Add a change listener
     * @param {Function} callback - Called when cache changes
     */
    onChange(callback) {
        this.listeners.push(callback);
    }

    /**
     * Remove a change listener
     * @param {Function} callback - The callback to remove
     */
    offChange(callback) {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    /**
     * Export all tuning data as JSON (for backup)
     * @returns {string}
     */
    export() {
        return JSON.stringify({
            ...this.cache,
            exported: new Date().toISOString()
        }, null, 2);
    }

    /**
     * Import tuning data from JSON backup
     * @param {string} json - JSON string from export()
     * @returns {number} Number of banks imported
     */
    import(json) {
        try {
            const data = JSON.parse(json);
            let imported = 0;

            if (data.banks) {
                Object.entries(data.banks).forEach(([bankPath, bankData]) => {
                    this.cache.banks[bankPath] = bankData;
                    imported++;
                });

                this._save();
            }

            return imported;
        } catch (error) {
            console.error('[TuningCache] Import failed:', error);
            return 0;
        }
    }
}

// Default singleton instance
let defaultInstance = null;

/**
 * Get the default TuningCacheManager instance
 * @returns {TuningCacheManager}
 */
export function getTuningCache() {
    if (!defaultInstance) {
        defaultInstance = new TuningCacheManager();
    }
    return defaultInstance;
}
