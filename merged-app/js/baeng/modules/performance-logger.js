/**
 * Automated Performance Logger
 * Collects performance data and auto-exports to downloadable JSON file
 */

class PerformanceLogger {
    constructor() {
        this.logs = [];
        this.isRecording = false;
        this.startTime = null;
        this.dropoutDetected = false;

        // Auto-start recording on page load
        this.startRecording();

        // Add keyboard shortcut: Shift+P to download logs
        window.addEventListener('keydown', (e) => {
            if (e.shiftKey && e.key === 'P') {
                this.downloadLogs();
            }
        });

    }

    startRecording() {
        this.isRecording = true;
        this.startTime = Date.now();
        this.logs = [];
    }

    log(category, data) {
        if (!this.isRecording) return;

        const entry = {
            timestamp: Date.now() - this.startTime,
            category: category,
            ...data
        };

        this.logs.push(entry);

        // Auto-export if dropout detected
        if (category === 'DROPOUT' && !this.dropoutDetected) {
            this.dropoutDetected = true;
            console.warn('[PerformanceLogger] DROPOUT DETECTED! Auto-exporting logs in 5 seconds...');
            setTimeout(() => {
                this.downloadLogs('DROPOUT_AUTO_EXPORT');
            }, 5000);
        }
    }

    downloadLogs(filename = null) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const name = filename || `performance-log-${timestamp}`;

        const report = {
            exportTime: new Date().toISOString(),
            recordingDuration: Date.now() - this.startTime,
            totalLogs: this.logs.length,
            dropoutCount: this.logs.filter(l => l.category === 'DROPOUT').length,
            logs: this.logs,
            summary: this.generateSummary()
        };

        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name}.json`;
        a.click();
        URL.revokeObjectURL(url);

    }

    generateSummary() {
        const perfStats = this.logs.filter(l => l.category === 'PERF-STATS');
        const dropouts = this.logs.filter(l => l.category === 'DROPOUT');
        const voiceCount = this.logs.filter(l => l.category === 'VOICE-COUNT');

        return {
            recordingDuration: `${((Date.now() - this.startTime) / 1000).toFixed(1)}s`,
            totalDropouts: dropouts.length,
            criticalDropouts: dropouts.filter(d => d.severity === 'CRITICAL').length,
            avgVoiceCount: voiceCount.length > 0
                ? (voiceCount.reduce((sum, v) => sum + v.total, 0) / voiceCount.length).toFixed(1)
                : 'N/A',
            maxVoiceCount: voiceCount.length > 0
                ? Math.max(...voiceCount.map(v => v.total))
                : 'N/A'
        };
    }
}

// Create global instance
window.performanceLogger = new PerformanceLogger();

export default window.performanceLogger;
