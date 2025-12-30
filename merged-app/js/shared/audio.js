// File: merged-app/js/shared/audio.js
// Shared AudioContext for Bæng & Ræmbl merged application

// Create single shared AudioContext
export const sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();

// Resume context on user interaction (mobile Safari requirement)
document.addEventListener('click', () => {
    if (sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume();
    }
}, { once: true });

// Final safety limiter
let finalLimiter = null;

export function createFinalLimiter() {
    if (finalLimiter) return finalLimiter;

    finalLimiter = sharedAudioContext.createDynamicsCompressor();
    finalLimiter.threshold.value = -0.1;  // Very gentle
    finalLimiter.ratio.value = 20;
    finalLimiter.attack.value = 0.001;
    finalLimiter.release.value = 0.05;
    finalLimiter.connect(sharedAudioContext.destination);

    return finalLimiter;
}

export function connectToFinalLimiter(sourceNode) {
    const limiter = createFinalLimiter();
    sourceNode.connect(limiter);
}
