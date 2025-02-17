/* main.js */

// Create a global NoSleep instance
window.noSleep = new NoSleep();

const DEBUG = false;
const VERSION = '2.0.6';

function setupDebugPanel() {
    const debugPanel = document.getElementById('debugPanel');
    if (debugPanel) {
        debugPanel.style.display = DEBUG ? 'block' : 'none';
    }
}

function debugLog(...args) {
    if (DEBUG) {
        console.log('[ZenBot Debug]:', ...args);
        const debugLog = document.getElementById('debugLog');
        if (debugLog && debugLog.parentElement.style.display !== 'none') {
            const logEntry = document.createElement('div');
            logEntry.textContent = `[${new Date().toISOString()}] ${args.join(' ')}`;
            debugLog.appendChild(logEntry);
            debugLog.scrollTop = debugLog.scrollHeight;
        }
    }
}

// Add this near the top of your JS code (executed on page load)
document.addEventListener('touchstart', function unlockAudio() {
  // If the AudioContext exists and is suspended, resume it.
  if (audioManager && audioManager.audioContext && audioManager.audioContext.state === 'suspended') {
    audioManager.audioContext.resume().then(() => {
      console.log('AudioContext unlocked via touchstart');
    });
  }
  // Remove this event listener after unlocking
  document.removeEventListener('touchstart', unlockAudio);
});


window.addEventListener('error', (event) => {
    if (DEBUG) {
        console.error('[ZenBot Error]:', event.error);
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
            errorMessage.textContent = `Error: ${event.error.message}`;
            errorMessage.style.display = 'block';
        }
    }
});

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



async function testAssetLoading() {
    try {
        const response = await fetch(BELL_SOUND_PATH);
        if (!response.ok) throw new Error('Meditation bell not found');
        debugLog('Meditation bell accessible');
        
        // Test pause format parsing
        const testPause = "[PAUSE 02:30]";
        const match = testPause.match(/\[PAUSE (\d{2}):(\d{2})\]/);
        if (!match) throw new Error('Pause format parsing failed');
        
        return true;
    } catch (error) {
        debugLog('Asset loading failed:', error);
        return false;
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    setupDebugPanel();
    debugLog(`ZenBot Version: ${VERSION}`);

    // Add version number display
    const versionDisplay = document.createElement('div');
    versionDisplay.textContent = `v${VERSION}`;
    versionDisplay.style.cssText = 'color: #666; font-size: 0.8em; text-align: center; margin-top: -10px; margin-bottom: 20px;';
    const title = document.querySelector('h1');
    if (title) {
        title.parentNode.insertBefore(versionDisplay, title.nextSibling);
    }

    if (DEBUG) {
        debugLog('Running diagnostic tests...');

        const tests = [
            { name: 'Audio Context', fn: testAudioContext },
            { name: 'Asset Loading', fn: testAssetLoading }
        ];

        for (const test of tests) {
            const result = await test.fn();
            debugLog(`${test.name} test:`, result ? 'PASSED' : 'FAILED');
        }
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

        audioManager.onProgress = (percentage, message) => {
            this.updateProgress(percentage);
            if (message) {
                this.progressText.textContent = message;
            }
        };

        // Add new properties
        this.scriptDisplay = document.getElementById('scriptDisplay');
        this.meditationScript = document.getElementById('meditationScript');
        this.toggleScriptBtn = document.getElementById('toggleScriptBtn');
        
        // Add script toggle to event listeners
        this.setupScriptDebugger();

    }

    setupEventListeners() {
        this.meditationForm.addEventListener('submit', (e) => this.handleMeditationSubmit(e));
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && audioManager.isPlaying) {
                audioManager.pausePlayback();
            }
        });
    }

    setupScriptDebugger() {
        this.toggleScriptBtn.addEventListener('click', () => {
            const isHidden = this.scriptDisplay.style.display === 'none';
            this.scriptDisplay.style.display = isHidden ? 'block' : 'none';
            this.toggleScriptBtn.textContent = isHidden ? 'Hide Script' : 'Show Script';
        });
    }

    async handleMeditationSubmit(event) {
        event.preventDefault();

        const prompt = document.getElementById('prompt').value;
        const duration = parseInt(document.getElementById('duration').value);
        const guidance = document.getElementById('guidance').value;
        const voiceSelection = document.getElementById('voiceSelect').value;

        if (!prompt || !duration) {
            apiManager.showError('Please fill in all fields');
            return;
        }

        // Set selected voice in APIManager, handling random selection
        if (voiceSelection === 'random') {
            const voices = ["alloy", "ash", "coral", "echo", "onyx", "nova", "sage", "shimmer"];
            apiManager.selectedVoice = voices[Math.floor(Math.random() * voices.length)];
        } else {
            apiManager.selectedVoice = voiceSelection;
        }

        try {
            await audioManager.ensureAudioContext();
            await this.generateMeditation(prompt, duration, guidance);
        } catch (error) {
            apiManager.showError(`Failed to generate meditation: ${error.message}`);
            this.hideProgress();
        }
    }

    async generateMeditation(prompt, duration, guidance) {
        // Enable wake lock immediately when starting meditation generation
        if (window.noSleep) {
            noSleep.enable();
        }

        this.showProgress('Generating meditation script...');
        this.updateProgress(0);

        try {
            // Generate the meditation script
            this.currentScript = await apiManager.generateMeditationScript(prompt, duration, guidance);
            console.log('Generated meditation script:', this.currentScript);
            
            // Display the script
            this.meditationScript.textContent = this.currentScript;
            this.toggleScriptBtn.style.display = 'block';
            
            this.updateProgress(20);

            this.showProgress('Converting speech to audio...');
            await audioManager.initialize();
            await audioManager.processScript(this.currentScript);

            this.hideProgress();
            this.enablePlayback();
        } catch (error) {
            console.error('Error in meditation generation:', error);
            apiManager.showError(error.message);
            this.hideProgress();
            throw error;
        }
    }

    showProgress(message) {
        this.progressContainer.style.display = 'block';
        this.progressText.textContent = message;
        this.meditationForm.querySelector('button[type="submit"]').disabled = true;
    }

    hideProgress() {
        this.progressContainer.style.display = 'none';
        this.meditationForm.querySelector('button[type="submit"]').disabled = false;
    }

    updateProgress(percentage) {
        this.progressFill.style.width = `${percentage}%`;
    }

    enablePlayback() {
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.style.display = 'block';
    }

    dispose() {
        audioManager.dispose();
    }
}

const meditationApp = new MeditationApp();

window.addEventListener('beforeunload', () => {
    meditationApp.dispose();
});

window.addEventListener('DOMContentLoaded', () => {
    const requiredFeatures = [
        { feature: window.AudioContext || window.webkitAudioContext, name: 'Web Audio API' },
        { feature: window.fetch, name: 'Fetch API' },
        { feature: window.Blob, name: 'Blob API' }
    ];

    const missingFeatures = requiredFeatures
        .filter(({ feature }) => !feature)
        .map(({ name }) => name);

    if (missingFeatures.length > 0) {
        apiManager.showError(
            `Your browser doesn't support the following required features: ${missingFeatures.join(', ')}. 
            Please use a modern browser like Chrome, Firefox, or Safari.`
        );
        document.querySelectorAll('form button[type="submit"]').forEach(button => button.disabled = true);
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Get the full URL path
        const fullPath = window.location.href;
        // Extract the base directory path
        const basePath = new URL('.', fullPath).pathname;
        
        navigator.serviceWorker.register('./sw.js', {
            scope: basePath
        }).then(registration => {
            console.log('ServiceWorker registration successful with scope:', registration.scope);
        }).catch(err => {
            console.log('ServiceWorker registration failed:', err);
        });
    });
}

document.addEventListener('keydown', (e) => {
    if (audioManager.isPlaying || audioManager.pauseTime > 0) {
        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                audioManager.togglePlayPause();
                break;
            case 'escape':
                audioManager.stopPlayback();
                break;
        }
    }
});
