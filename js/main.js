// Debug configuration
const DEBUG = true;  // Set to false in production

function debugLog(...args) {
    if (DEBUG) {
        console.log('[ZenBot Debug]:', ...args);
    }
}

// Add error tracking
window.addEventListener('error', (event) => {
    if (DEBUG) {
        console.error('[ZenBot Error]:', event.error);
        // Show error in UI
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
            errorMessage.textContent = `Error: ${event.error.message}`;
            errorMessage.style.display = 'block';
        }
    }
});

// Add debug information to each major step
async function testAudioContext() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        debugLog('AudioContext initialized successfully');
        return true;
    } catch (error) {
        debugLog('AudioContext initialization failed:', error);
        return false;
    }
}

// Test file accessibility
async function testAssetLoading() {
    try {
        const response = await fetch('/assets/meditation-bell.mp3');
        if (!response.ok) throw new Error('Meditation bell not found');
        debugLog('Meditation bell accessible');
        return true;
    } catch (error) {
        debugLog('Asset loading failed:', error);
        return false;
    }
}

// Run tests on page load
window.addEventListener('DOMContentLoaded', async () => {
    debugLog('Running diagnostic tests...');

    const tests = [
        { name: 'Audio Context', fn: testAudioContext },
        { name: 'Asset Loading', fn: testAssetLoading }
    ];

    for (const test of tests) {
        const result = await test.fn();
        debugLog(`${test.name} test:`, result ? 'PASSED' : 'FAILED');
    }
});

class MeditationApp {
    constructor() {
        this.meditationForm = document.getElementById('meditationForm');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressText = document.getElementById('progressText');
        this.progressFill = document.getElementById('progressFill');

        this.currentScript = null;
        this.setupEventListeners();

        // Add initialization message
        const initMessage = document.createElement('div');
        initMessage.textContent = 'Click anywhere on the page to enable audio features';
        initMessage.style.textAlign = 'center';
        initMessage.style.padding = '10px';
        initMessage.style.backgroundColor = '#fff3cd';
        initMessage.style.color = '#856404';
        initMessage.style.marginBottom = '10px';
        document.body.insertBefore(initMessage, document.body.firstChild);

        // Remove the message after first click
        document.addEventListener('click', () => {
            initMessage.style.display = 'none';
        }, { once: true });
    }

    setupEventListeners() {
        this.meditationForm.addEventListener('submit', (e) => this.handleMeditationSubmit(e));

        // Handle visibility change to manage audio context
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && audioManager.isPlaying) {
                audioManager.pausePlayback();
            }
        });
    }

    // Update the handleMeditationSubmit method
    async handleMeditationSubmit(event) {
        event.preventDefault();

        const prompt = document.getElementById('prompt').value;
        const duration = parseInt(document.getElementById('duration').value);

        if (!prompt || !duration) {
            apiManager.showError('Please fill in all fields');
            return;
        }

        try {
            // Ensure audio context is initialized
            await audioManager.ensureAudioContext();
            await this.generateMeditation(prompt, duration);
        } catch (error) {
            apiManager.showError(`Failed to generate meditation: ${error.message}`);
            this.hideProgress();
        }
    }

    async generateMeditation(prompt, duration) {
    debugLog('Starting meditation generation...');
    this.showProgress('Generating meditation script...');
    this.updateProgress(0);

    try {
        // Generate the meditation script
        debugLog('Generating meditation script from OpenAI...');
        this.currentScript = await apiManager.generateMeditationScript(prompt, duration);
        debugLog('Script generated successfully');
        debugLog(`Script content: ${this.currentScript.substring(0, 100)}...`);
        this.updateProgress(20);

        // Initialize audio context
        debugLog('Initializing audio context...');
        await audioManager.initialize();
        debugLog(`Audio context state: ${audioManager.audioContext.state}`);

        // Process the script into audio
        debugLog('Starting audio processing...');
        this.showProgress('Converting speech to audio...');

        try {
            await audioManager.processScript(this.currentScript);
            debugLog('Audio processing completed successfully');
        } catch (error) {
            debugLog(`Error in audio processing: ${error.message}`, 'error');
            throw error;
        }

        // Show success state
        this.hideProgress();
        this.enablePlayback();
        debugLog('Meditation generation completed successfully');

    } catch (error) {
        debugLog(`Error in meditation generation: ${error.message}`, 'error');
        apiManager.showError(error.message);
        this.hideProgress();
        throw error;
    }
}

    showProgress(message) {
        this.progressContainer.style.display = 'block';
        this.progressText.textContent = message;
        // Disable the form while processing
        this.meditationForm.querySelector('button[type="submit"]').disabled = true;
    }

    hideProgress() {
        this.progressContainer.style.display = 'none';
        // Re-enable the form
        this.meditationForm.querySelector('button[type="submit"]').disabled = false;
    }

    updateProgress(percentage) {
        this.progressFill.style.width = `${percentage}%`;
    }

    enablePlayback() {
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.style.display = 'block';
    }

    // Handle any cleanup needed
    dispose() {
        audioManager.dispose();
    }
}

// Create a global instance of the meditation app
const meditationApp = new MeditationApp();

// Handle page unload
window.addEventListener('beforeunload', () => {
    meditationApp.dispose();
});

// Add error handling for browser compatibility
window.addEventListener('DOMContentLoaded', () => {
    // Check for required browser features
    const requiredFeatures = [
        { feature: window.AudioContext || window.webkitAudioContext, name: 'Web Audio API' },
        { feature: window.fetch, name: 'Fetch API' },
        { feature: window.Blob, name: 'Blob API' }
    ];

    const missingFeatures = requiredFeatures
        .filter(({feature}) => !feature)
        .map(({name}) => name);

    if (missingFeatures.length > 0) {
        apiManager.showError(
            `Your browser doesn't support the following required features: ${missingFeatures.join(', ')}. 
            Please use a modern browser like Chrome, Firefox, or Safari.`
        );
        document.querySelectorAll('form button[type="submit"]')
            .forEach(button => button.disabled = true);
    }
});

// Handle service worker for offline functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('ServiceWorker registration successful');
        }).catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (audioManager.isPlaying || audioManager.pauseTime > 0) {
        switch(e.key.toLowerCase()) {
            case ' ':  // Spacebar
                e.preventDefault();
                audioManager.togglePlayPause();
                break;
            case 'escape':
                audioManager.stopPlayback();
                break;
        }
    }
});