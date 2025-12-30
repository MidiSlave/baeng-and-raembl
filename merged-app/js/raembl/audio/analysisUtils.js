// File: js/audio/analysisUtils.js
// Audio analysis utilities for effect visualizations

/**
 * Gets the current amplitude (RMS level) from an analyser node
 * @param {AnalyserNode} analyser - The analyser node to read from
 * @param {number} gainBoost - Gain multiplier to apply (default 4.0)
 * @returns {number} Amplitude value (boosted, may exceed 1)
 */
export function getAmplitude(analyser, gainBoost = 4.0) {
    if (!analyser) return 0;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    // Calculate RMS (Root Mean Square) for amplitude
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        const normalized = (dataArray[i] - 128) / 128.0; // Convert to -1 to 1
        sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);

    // Apply gain boost and exponential scaling for better visibility
    // Using power of 0.6 makes quiet sounds more visible while preserving dynamics
    let boosted = Math.pow(rms, 0.6) * gainBoost;

    return boosted;
}

/**
 * Gets the peak amplitude from an analyser node
 * @param {AnalyserNode} analyser - The analyser node to read from
 * @returns {number} Peak amplitude value between 0 and 1
 */
export function getPeakAmplitude(analyser) {
    if (!analyser) return 0;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    let peak = 0;
    for (let i = 0; i < bufferLength; i++) {
        const normalized = Math.abs((dataArray[i] - 128) / 128.0);
        if (normalized > peak) {
            peak = normalized;
        }
    }

    return peak;
}

/**
 * Onset detector class - detects when new sound events occur
 */
export class OnsetDetector {
    constructor(threshold = 0.1, holdTime = 50, gainBoost = 4.0) {
        this.threshold = threshold;        // Minimum amplitude to trigger onset
        this.holdTime = holdTime;          // ms to wait before detecting new onset
        this.gainBoost = gainBoost;        // Gain boost for amplitude detection
        this.lastOnsetTime = 0;            // Last onset timestamp
        this.previousAmplitude = 0;        // Previous frame amplitude
        this.onsetHistory = [];            // Array of onset timestamps
        this.maxHistoryLength = 100;       // Keep last 100 onsets
    }

    /**
     * Detect onset from analyser node
     * @param {AnalyserNode} analyser - The analyser to read from
     * @returns {boolean} True if onset detected
     */
    detect(analyser) {
        const now = performance.now();
        const currentAmplitude = getAmplitude(analyser, this.gainBoost);

        // Calculate delta (change in amplitude)
        const delta = currentAmplitude - this.previousAmplitude;

        // Detect onset: significant positive change above threshold
        const isOnset = delta > this.threshold &&
                       currentAmplitude > this.threshold &&
                       (now - this.lastOnsetTime) > this.holdTime;

        if (isOnset) {
            this.lastOnsetTime = now;
            this.onsetHistory.push(now);

            // Keep history bounded
            if (this.onsetHistory.length > this.maxHistoryLength) {
                this.onsetHistory.shift();
            }
        }

        this.previousAmplitude = currentAmplitude;
        return isOnset;
    }

    /**
     * Get time since last onset in milliseconds
     * @returns {number} Time in ms since last onset
     */
    getTimeSinceLastOnset() {
        if (this.lastOnsetTime === 0) return Infinity;
        return performance.now() - this.lastOnsetTime;
    }

    /**
     * Reset the onset detector
     */
    reset() {
        this.lastOnsetTime = 0;
        this.previousAmplitude = 0;
        this.onsetHistory = [];
    }
}

/**
 * Amplitude envelope follower - tracks amplitude over time with smoothing
 */
export class EnvelopeFollower {
    constructor(attackTime = 5, releaseTime = 50, gainBoost = 4.0) {
        this.attackTime = attackTime;      // ms for amplitude rise
        this.releaseTime = releaseTime;    // ms for amplitude fall
        this.gainBoost = gainBoost;        // Gain boost for amplitude detection
        this.currentLevel = 0;             // Current smoothed level
        this.lastUpdateTime = performance.now();
    }

    /**
     * Update and get smoothed amplitude
     * @param {AnalyserNode} analyser - The analyser to read from
     * @returns {number} Smoothed amplitude (boosted)
     */
    update(analyser) {
        const now = performance.now();
        const dt = now - this.lastUpdateTime;
        this.lastUpdateTime = now;

        const targetLevel = getAmplitude(analyser, this.gainBoost);

        // Calculate smoothing coefficient based on attack/release
        let timeConstant;
        if (targetLevel > this.currentLevel) {
            // Attack (rising)
            timeConstant = this.attackTime;
        } else {
            // Release (falling)
            timeConstant = this.releaseTime;
        }

        // Exponential smoothing
        const alpha = 1 - Math.exp(-dt / timeConstant);
        this.currentLevel = this.currentLevel + alpha * (targetLevel - this.currentLevel);

        return this.currentLevel;
    }

    /**
     * Get current level without updating
     * @returns {number} Current smoothed level
     */
    getLevel() {
        return this.currentLevel;
    }

    /**
     * Reset the envelope follower
     */
    reset() {
        this.currentLevel = 0;
        this.lastUpdateTime = performance.now();
    }
}

/**
 * Simple amplitude history buffer for tracking amplitude over time
 */
export class AmplitudeHistory {
    constructor(maxSamples = 100) {
        this.maxSamples = maxSamples;
        this.history = [];
        this.timestamps = [];
    }

    /**
     * Add a new amplitude sample
     * @param {number} amplitude - Amplitude value to add
     */
    add(amplitude) {
        this.history.push(amplitude);
        this.timestamps.push(performance.now());

        // Keep buffer size bounded
        if (this.history.length > this.maxSamples) {
            this.history.shift();
            this.timestamps.shift();
        }
    }

    /**
     * Get average amplitude over recent history
     * @param {number} windowMs - Time window in ms (optional)
     * @returns {number} Average amplitude
     */
    getAverage(windowMs = null) {
        if (this.history.length === 0) return 0;

        let samples = this.history;
        if (windowMs !== null) {
            const now = performance.now();
            const cutoffTime = now - windowMs;
            const startIndex = this.timestamps.findIndex(t => t >= cutoffTime);
            if (startIndex >= 0) {
                samples = this.history.slice(startIndex);
            }
        }

        const sum = samples.reduce((acc, val) => acc + val, 0);
        return sum / samples.length;
    }

    /**
     * Clear the history
     */
    clear() {
        this.history = [];
        this.timestamps = [];
    }
}
