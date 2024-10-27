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

        // DOM elements
        this.audioPlayer = document.getElementById('audioPlayer');
        this.progressBar = document.getElementById('progressFill');
        this.pauseResumeBtn = document.getElementById('pauseResumeBtn');
        this.stopBtn = document.getElementById('stopBtn');

        this.setupEventListeners();
        this.loadBellSound();
    }

    async initialize() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (error) {
            console.error('Web Audio API is not supported in this browser:', error);
            throw new Error('Your browser does not support the required audio features.');
        }
    }

    setupEventListeners() {
        this.pauseResumeBtn.addEventListener('click', () => this.togglePlayPause());
        this.stopBtn.addEventListener('click', () => this.stopPlayback());
    }

    async loadBellSound() {
        try {
            const response = await fetch('assets/meditation-bell.mp3');
            const arrayBuffer = await response.arrayBuffer();
            if (!this.audioContext) {
                await this.initialize();
            }
            this.bellBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
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
        // Split script into parts based on pause markers
        const parts = script.split(/\[PAUSE (\d+(?:\.\d+)?)\]/);
        const audioBuffers = [];
        let currentTime = 0;
        const timingMarks = [];

        try {
            // Add initial bell
            audioBuffers.push(this.bellBuffer);
            timingMarks.push({ time: currentTime, type: 'bell' });
            currentTime += this.bellBuffer.duration;

            for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 0) {
                    // Text part
                    if (parts[i].trim()) {
                        const blob = await apiManager.generateSpeech(parts[i]);
                        const arrayBuffer = await blob.arrayBuffer();
                        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                        audioBuffers.push(audioBuffer);
                        timingMarks.push({ time: currentTime, type: 'speech', text: parts[i].trim() });
                        currentTime += audioBuffer.duration;
                    }
                } else {
                    // Pause part
                    const pauseDuration = parseFloat(parts[i]) * 60; // Convert minutes to seconds
                    const silenceBuffer = await this.createSilence(pauseDuration);
                    audioBuffers.push(silenceBuffer);
                    timingMarks.push({ time: currentTime, type: 'pause', duration: pauseDuration });
                    currentTime += pauseDuration;
                }
            }

            // Add final bell
            audioBuffers.push(this.bellBuffer);
            timingMarks.push({ time: currentTime, type: 'bell' });
            currentTime += this.bellBuffer.duration;

            // Merge all audio buffers
            this.totalDuration = currentTime;
            const finalBuffer = this.mergeAudioBuffers(audioBuffers, currentTime);
            this.meditationBuffer = finalBuffer;
            this.timingMarks = timingMarks;

            // Show audio player
            this.audioPlayer.style.display = 'block';
        } catch (error) {
            console.error('Error processing meditation audio:', error);
            throw new Error('Failed to process meditation audio.');
        }
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

    startPlayback() {
        if (!this.audioContext) {
            this.initialize();
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
}

// Create a global instance of the audio manager
const audioManager = new AudioManager();