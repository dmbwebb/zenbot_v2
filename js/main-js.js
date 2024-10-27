class MeditationApp {
    constructor() {
        this.meditationForm = document.getElementById('meditationForm');
        this.progressContainer = document.getElementById('progressContainer');
        this.progressText = document.getElementById('progressText');
        this.progressFill = document.getElementById('progressFill');
        
        this.currentScript = null;
        this.setupEventListeners();
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

    async handleMeditationSubmit(event) {
        event.preventDefault();
        
        const prompt = document.getElementById('prompt').value;
        const duration = parseInt(document.getElementById('duration').value);

        if (!prompt || !duration) {
            apiManager.showError('Please fill in all fields');
            return;
        }

        try {
            await this.generateMeditation(prompt, duration);
        } catch (error) {
            apiManager.showError(`Failed to generate meditation: ${error.message}`);
            this.hideProgress();
        }
    }

    async generateMeditation(prompt, duration) {
        this.showProgress('Generating meditation script...');
        this.updateProgress(0);

        try {
            // Generate the meditation script
            this.currentScript = await apiManager.generateMeditationScript(prompt, duration);
            this.updateProgress(20);
            
            // Split the script and start processing audio
            this.showProgress('Converting speech to audio...');
            await audioManager.initialize();
            await audioManager.processScript(this.currentScript);
            
            // Show success state
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