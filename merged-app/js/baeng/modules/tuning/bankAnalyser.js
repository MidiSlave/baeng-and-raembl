/**
 * Bank Analyser Service
 *
 * Orchestrates pitch detection for entire DX7 banks.
 * Analyses all 32 patches and stores results in tuning cache.
 */

import { PitchDetector, renderDX7Offline, calculateTuningOffset, TUNING_CONSTANTS } from './pitchDetection.js';
import { getTuningCache } from './tuningCacheManager.js';

// Minimum confidence threshold for valid detection
const MIN_CONFIDENCE = 0.05;

// Low confidence threshold (show warning)
const LOW_CONFIDENCE = 0.2;

/**
 * BankAnalyser
 *
 * Analyses all patches in a DX7 bank for pitch detection.
 */
export class BankAnalyser {
    constructor() {
        this.detector = new PitchDetector();
        this.tuningCache = getTuningCache();
        this.isAnalysing = false;
        this.currentBankPath = null;
        this.abortRequested = false;
    }

    /**
     * Analyse all patches in a bank
     * @param {string} bankPath - Path to the bank file
     * @param {Array<Object>} patches - Array of parsed patch data (32 patches)
     * @param {Function} onProgress - Progress callback (patchIndex, totalPatches, result)
     * @returns {Promise<Array<Object>>} Array of patch tuning results
     */
    async analyseBank(bankPath, patches, onProgress = null) {
        if (this.isAnalysing) {
            console.warn('[BankAnalyser] Analysis already in progress');
            return null;
        }

        this.isAnalysing = true;
        this.currentBankPath = bankPath;
        this.abortRequested = false;

        const startTime = performance.now();

        const results = [];

        try {
            for (let i = 0; i < patches.length; i++) {
                // Check for abort
                if (this.abortRequested) {
                    this.isAnalysing = false;
                    return null;
                }

                const patch = patches[i];
                const result = await this._analysePatch(patch, i);
                results.push(result);

                // Report progress
                if (onProgress) {
                    onProgress(i, patches.length, result);
                }

                // Yield to main thread to prevent blocking UI
                await this._yieldToMain();
            }

            // Store results in cache
            this.tuningCache.set(bankPath, results);


            return results;

        } catch (error) {
            console.error('[BankAnalyser] Analysis failed:', error);
            return null;

        } finally {
            this.isAnalysing = false;
            this.currentBankPath = null;
        }
    }

    /**
     * Analyse a single patch
     * @private
     */
    async _analysePatch(patchData, patchIndex) {
        try {
            // Render patch at C4 (MIDI 60)
            const audio = renderDX7Offline(
                patchData,
                TUNING_CONSTANTS.REFERENCE_NOTE,
                0.3 // 300ms
            );

            // Detect pitch
            const detection = this.detector.detect(audio);

            // Calculate tuning offset
            let offsetCents = 0;
            if (detection.detected && detection.confidence >= MIN_CONFIDENCE) {
                offsetCents = calculateTuningOffset(detection.frequency, TUNING_CONSTANTS.REFERENCE_FREQ);
            }

            const result = {
                offsetCents: Math.round(offsetCents * 10) / 10, // Round to 0.1 cents
                confidence: detection.confidence,
                frequency: Math.round(detection.frequency * 100) / 100,
                detected: detection.detected
            };

            return result;

        } catch (error) {
            console.error(`[BankAnalyser] Error analysing patch ${patchIndex}:`, error);
            return {
                offsetCents: 0,
                confidence: 0,
                frequency: 0,
                detected: false,
                error: error.message
            };
        }
    }

    /**
     * Yield to main thread
     * @private
     */
    _yieldToMain() {
        return new Promise(resolve => setTimeout(resolve, 0));
    }

    /**
     * Abort current analysis
     */
    abort() {
        if (this.isAnalysing) {
            this.abortRequested = true;
        }
    }

    /**
     * Check if bank needs analysis
     * @param {string} bankPath - Path to the bank file
     * @returns {boolean}
     */
    needsAnalysis(bankPath) {
        return !this.tuningCache.has(bankPath);
    }

    /**
     * Get analysis status
     * @returns {Object}
     */
    getStatus() {
        return {
            isAnalysing: this.isAnalysing,
            currentBankPath: this.currentBankPath
        };
    }
}

// Default singleton instance
let defaultInstance = null;

/**
 * Get the default BankAnalyser instance
 * @returns {BankAnalyser}
 */
export function getBankAnalyser() {
    if (!defaultInstance) {
        defaultInstance = new BankAnalyser();
    }
    return defaultInstance;
}

/**
 * Analyse a bank if not already cached
 * Convenience function for use in bank loading flow
 *
 * @param {string} bankPath - Path to the bank file
 * @param {Array<Object>} patches - Array of parsed patch data
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<boolean>} True if analysis completed (or was cached)
 */
export async function ensureBankAnalysed(bankPath, patches, onProgress = null) {
    const analyser = getBankAnalyser();
    const cache = getTuningCache();

    // Already cached
    if (cache.has(bankPath)) {
        return true;
    }

    // Run analysis
    const results = await analyser.analyseBank(bankPath, patches, onProgress);
    return results !== null;
}
