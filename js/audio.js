class AudioManager {
    constructor() {
        this.audioContext = null;
        this.meditationBuffer = null;
        this.bellBuffer = null;
        this.audioSource = null;
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.totalDuration = 0;
        this.progressInterval = null;
        this.isInitialized = false;

        // DOM elements
        this.audioPlayer = document.getElementById('audioPlayer');
        this.progressBar = document.getElementById('progressFill');
        this.pauseResumeBtn = document.getElementById('pauseResumeBtn');
        this.stopBtn = document.getElementById('stopBtn');

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.pauseResumeBtn.addEventListener('click', () => this.togglePlayPause());
        this.stopBtn.addEventListener('click', () => this.stopPlayback());

        // Add click listener to initialize AudioContext
        document.addEventListener('click', () => {
            if (!this.isInitialized) {
                this.initialize();
            }
        }, { once: true });  // only need to initialize once
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Resume AudioContext if it's in suspended state
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.isInitialized = true;
            console.log('AudioContext initialized successfully');

            // Load bell sound after initialization
            await this.loadBellSound();
        } catch (error) {
            console.error('Web Audio API is not supported in this browser:', error);
            throw new Error('Your browser does not support the required audio features.');
        }
    }

    async loadBellSound() {
        try {
            const response = await fetch('assets/meditation-bell.mp3');
            const arrayBuffer = await response.arrayBuffer();
            this.bellBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            console.log('Bell sound loaded successfully');
        } catch (error) {
            console.error('Error loading meditation bell:', error);
            throw new Error('Failed to load meditation bell sound.');
        }
    }

    async createSilence(duration) {
        const sampleRate = this.audioContext.sampleRate;
        const samples = duration * sampleRate;
        const silenceBuffer = this.audioContext.createBuffer(
            1, // mono
            samples,
            sampleRate
        );
        return silenceBuffer;
    }

    async processScript(script) {
        debugLog('Starting audio processing...');

        // Split script into parts based on pause markers
        const parts = script.split(/\[PAUSE (\d+(?:\.\d+)?)\]/);
        debugLog(`Script split into ${parts.length} parts`);

        const audioBuffers = [];
        let currentTime = 0;
        const timingMarks = [];

        try {
            // Add initial bell
            debugLog('Loading and adding initial bell...');
            if (!this.bellBuffer) {
                try {
                    await this.loadBellSound();
                    debugLog('Bell sound loaded successfully');
                } catch (error) {
                    debugLog(`Error loading bell sound: ${error.message}`, 'error');
                    throw error;
                }
            }

            audioBuffers.push(this.bellBuffer);
            timingMarks.push({ time: currentTime, type: 'bell' });
            currentTime += this.bellBuffer.duration;

            for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 0) {
                    // Text part
                    if (parts[i].trim()) {
                        debugLog(`Processing text part ${i/2 + 1}...`);
                        try {
                            const blob = await apiManager.generateSpeech(parts[i]);
                            debugLog('Speech generated, converting to audio buffer...');
                            const arrayBuffer = await blob.arrayBuffer();
                            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                            audioBuffers.push(audioBuffer);
                            timingMarks.push({ time: currentTime, type: 'speech' });
                            currentTime += audioBuffer.duration;
                            debugLog('Text part processed successfully');
                        } catch (error) {
                            debugLog(`Error processing text part: ${error.message}`, 'error');
                            throw error;
                        }
                    }
                } else {
                    // Pause part
                    const pauseDuration = parseFloat(parts[i]) * 60;
                    debugLog(`Adding ${pauseDuration} second pause...`);
                    const silenceBuffer = await this.createSilence(pauseDuration);
                    audioBuffers.push(silenceBuffer);
                    timingMarks.push({ time: currentTime, type: 'pause', duration: pauseDuration });
                    currentTime += pauseDuration;
                }
            }

            // Add final bell
            debugLog('Adding final bell...');
            audioBuffers.push(this.bellBuffer);
            timingMarks.push({ time: currentTime, type: 'bell' });
            currentTime += this.bellBuffer.duration;

            // Merge all audio buffers
            debugLog('Merging audio buffers...');
            this.totalDuration = currentTime;
            const finalBuffer = this.mergeAudioBuffers(audioBuffers, currentTime);
            this.meditationBuffer = finalBuffer;
            this.timingMarks = timingMarks;

            debugLog(`Audio processing completed. Total duration: ${this.totalDuration} seconds`);

            // Show audio player
            this.audioPlayer.style.display = 'block';
        } catch (error) {
            debugLog(`Error in processScript: ${error.message}`, 'error');
            throw error;
        }
    }

    // Add this method to check API responses
    async checkApiResponse(response, context) {
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API Error (${context}):`, {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`${context} failed: ${response.status} ${response.statusText}`);
        }
        return response;
    }

    mergeAudioBuffers(buffers, totalDuration) {
        const channelCount = 1; // Mono audio
        const finalBuffer = this.audioContext.createBuffer(
            channelCount,
            totalDuration * this.audioContext.sampleRate,
            this.audioContext.sampleRate
        );

        let offset = 0;
        for (const buffer of buffers) {
            // Copy each buffer into the final buffer
            for (let channel = 0; channel < channelCount; channel++) {
                const finalChannelData = finalBuffer.getChannelData(channel);
                const bufferChannelData = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
                finalChannelData.set(bufferChannelData, offset * this.audioContext.sampleRate);
            }
            offset += buffer.duration;
        }

        return finalBuffer;
    }

    async startPlayback() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Ensure AudioContext is resumed
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.audioSource = this.audioContext.createBufferSource();
        this.audioSource.buffer = this.meditationBuffer;
        this.audioSource.connect(this.audioContext.destination);

        const offset = this.pauseTime;
        this.audioSource.start(0, offset);
        this.startTime = this.audioContext.currentTime - offset;
        this.isPlaying = true;
        this.pauseResumeBtn.textContent = 'Pause';

        this.startProgressUpdate();
    }



    togglePlayPause() {
        if (!this.isPlaying) {
            if (this.pauseTime >= this.totalDuration) {
                this.pauseTime = 0;
            }
            this.startPlayback();
        } else {
            this.pausePlayback();
        }
    }

    pausePlayback() {
        if (this.audioSource) {
            this.audioSource.stop();
            this.pauseTime = this.audioContext.currentTime - this.startTime;
            this.isPlaying = false;
            this.pauseResumeBtn.textContent = 'Resume';
            this.stopProgressUpdate();
        }
    }

    stopPlayback() {
        if (this.audioSource) {
            this.audioSource.stop();
        }
        this.pauseTime = 0;
        this.isPlaying = false;
        this.pauseResumeBtn.textContent = 'Play';
        this.stopProgressUpdate();
        this.updateProgress(0);
    }

    startProgressUpdate() {
        this.stopProgressUpdate();
        this.progressInterval = setInterval(() => {
            const currentTime = this.audioContext.currentTime - this.startTime;
            const progress = (currentTime / this.totalDuration) * 100;
            this.updateProgress(progress);

            if (currentTime >= this.totalDuration) {
                this.stopPlayback();
            }
        }, 100);
    }

    stopProgressUpdate() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    updateProgress(percentage) {
        this.progressBar.style.width = `${Math.min(100, Math.max(0, percentage))}%`;
    }

    // Clean up resources
    dispose() {
        this.stopPlayback();
        if (this.audioContext) {
            this.audioContext.close();
        }
    }


    async ensureAudioContext() {
        if (!this.isInitialized) {
            await this.initialize();
        }
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

}

// Create a global instance of the audio manager
const audioManager = new AudioManager();