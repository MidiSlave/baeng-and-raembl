/**
 * FavoritesManager
 * Manages a list of favorited items with localStorage persistence
 *
 * Usage:
 *   const favs = new FavoritesManager('baeng_sample_favorites');
 *   favs.toggle('item_id');
 *   favs.has('item_id'); // true/false
 *   favs.getAll(); // ['item_id', ...]
 */
export class FavoritesManager {
    constructor(storageKey) {
        this.storageKey = storageKey;
        this.favorites = new Set(this._load());
        this.listeners = [];
    }

    /**
     * Load favorites from localStorage
     * @private
     * @returns {Array<string>}
     */
    _load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return JSON.parse(data || '[]');
        } catch (error) {
            console.error(`[FavoritesManager] Failed to load favorites from ${this.storageKey}:`, error);
            return [];
        }
    }

    /**
     * Save favorites to localStorage
     * @private
     */
    _save() {
        try {
            const data = JSON.stringify([...this.favorites]);
            localStorage.setItem(this.storageKey, data);
            this._notifyListeners();
        } catch (error) {
            console.error(`[FavoritesManager] Failed to save favorites to ${this.storageKey}:`, error);
            if (error.name === 'QuotaExceededError') {
                alert('Storage quota exceeded. Cannot save more favorites.');
            }
        }
    }

    /**
     * Notify all registered listeners of changes
     * @private
     */
    _notifyListeners() {
        this.listeners.forEach(callback => callback([...this.favorites]));
    }

    /**
     * Toggle favorite status for an item
     * @param {string} id - Unique identifier for the item
     * @returns {boolean} True if now favorited, false if unfavorited
     */
    toggle(id) {
        if (this.favorites.has(id)) {
            this.favorites.delete(id);
        } else {
            this.favorites.add(id);
        }
        this._save();
        return this.favorites.has(id);
    }

    /**
     * Add an item to favorites
     * @param {string} id - Unique identifier for the item
     */
    add(id) {
        if (!this.favorites.has(id)) {
            this.favorites.add(id);
            this._save();
        }
    }

    /**
     * Remove an item from favorites
     * @param {string} id - Unique identifier for the item
     */
    remove(id) {
        if (this.favorites.has(id)) {
            this.favorites.delete(id);
            this._save();
        }
    }

    /**
     * Check if an item is favorited
     * @param {string} id - Unique identifier for the item
     * @returns {boolean} True if favorited
     */
    has(id) {
        return this.favorites.has(id);
    }

    /**
     * Get all favorited item IDs
     * @returns {Array<string>} Array of favorite IDs
     */
    getAll() {
        return [...this.favorites];
    }

    /**
     * Get count of favorited items
     * @returns {number} Number of favorites
     */
    count() {
        return this.favorites.size;
    }

    /**
     * Clear all favorites
     */
    clear() {
        this.favorites.clear();
        this._save();
    }

    /**
     * Add a change listener
     * @param {Function} callback - Called when favorites change
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
}
