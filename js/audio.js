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
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.playIcon = this.playPauseBtn.querySelector('.play-icon');
        this.pauseIcon = this.playPauseBtn.querySelector('.pause-icon');

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
    }

    updatePlayPauseButton(isPlaying) {
        this.playIcon.style.display = isPlaying ? 'none' : 'block';
        this.pauseIcon.style.display = isPlaying ? 'block' : 'none';
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
        console.log('Starting script processing...');

        const parts = script.split(/\[PAUSE (\d+(?:\.\d+)?)\]/);
        const audioBuffers = [];
        let currentTime = 0;
        const timingMarks = [];

        try {
            // Add initial bell
            if (!this.bellBuffer) {
                await this.loadBellSound();
            }
            audioBuffers.push(this.bellBuffer);
            timingMarks.push({ time: currentTime, type: 'bell' });
            currentTime += this.bellBuffer.duration;

            // Calculate total number of parts for progress
            const totalParts = parts.filter((_, i) => i % 2 === 0 && parts[i].trim()).length;
            let completedParts = 0;

            for (let i = 0; i < parts.length; i++) {
                if (i % 2 === 0) {
                    // Text part
                    if (parts[i].trim()) {
                        // Update progress
                        completedParts++;
                        const progressPercentage = (completedParts / totalParts) * 80 + 20; // 20-100%
                        this.updateProgress(
                            progressPercentage,
                            `Generating audio files (${completedParts}/${totalParts})`
                        );

                        console.log(`Processing part ${completedParts}/${totalParts}`);
                        const blob = await apiManager.generateSpeech(parts[i]);
                        const arrayBuffer = await blob.arrayBuffer();
                        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                        audioBuffers.push(audioBuffer);
                        timingMarks.push({ time: currentTime, type: 'speech', text: parts[i].trim() });
                        currentTime += audioBuffer.duration;
                    }
                } else {
                    // Pause part
                    const pauseDuration = parseFloat(parts[i]) * 60;
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

            // After successful processing, show player and start playback
            this.audioPlayer.style.display = 'block';
            this.updatePlayPauseButton(true);  // Update button state

            // Start playback automatically
            setTimeout(() => {
                this.startPlayback();
            }, 500);  // Small delay to ensure UI is ready

        } catch (error) {
            console.error('Error in processScript:', error);
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
        console.log('Starting buffer merge with:', {
            numberOfBuffers: buffers.length,
            totalDuration: totalDuration,
            sampleRate: this.audioContext.sampleRate
        });

        const sampleRate = this.audioContext.sampleRate;
        const numberOfChannels = Math.max(...buffers.map(buffer => buffer.numberOfChannels));
        const finalBuffer = this.audioContext.createBuffer(
            numberOfChannels,
            Math.ceil(totalDuration * sampleRate),
            sampleRate
        );

        buffers.forEach((buffer, index) => {
            console.log(`Processing buffer ${index + 1}/${buffers.length}:`, {
                duration: buffer.duration,
                channels: buffer.numberOfChannels,
                length: buffer.length
            });

            for (let channel = 0; channel < numberOfChannels; channel++) {
                const finalChannelData = finalBuffer.getChannelData(channel);

                // Get the channel data, using the first channel if the current channel doesn't exist
                const sourceChannelData = buffer.getChannelData(
                    Math.min(channel, buffer.numberOfChannels - 1)
                );

                // Calculate the offset in samples
                const offsetSamples = Math.floor(
                    (buffers.slice(0, index)
                        .reduce((acc, buf) => acc + buf.duration, 0))
                    * sampleRate
                );

                // Copy the data
                for (let i = 0; i < sourceChannelData.length; i++) {
                    if (offsetSamples + i < finalChannelData.length) {
                        finalChannelData[offsetSamples + i] = sourceChannelData[i];
                    }
                }
            }
        });

        console.log('Buffer merge completed:', {
            finalDuration: finalBuffer.duration,
            finalChannels: finalBuffer.numberOfChannels,
            finalLength: finalBuffer.length
        });

        return finalBuffer;
    }

    startPlayback() {
        if (!this.audioContext) {
            this.initialize();
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Stop any currently playing source
        if (this.audioSource) {
            try {
                this.audioSource.stop();
            } catch (e) {
                // Ignore errors if source is already stopped
            }
        }

        // Create and configure new source
        this.audioSource = this.audioContext.createBufferSource();
        this.audioSource.buffer = this.meditationBuffer;
        this.audioSource.connect(this.audioContext.destination);

        // Add ended event listener
        this.audioSource.onended = () => {
            // Only reset if we've reached the end naturally
            if (this.audioContext.currentTime - this.startTime >= this.totalDuration) {
                this.isPlaying = false;
                this.pauseTime = 0;
                this.updatePlayPauseButton(false);
            }
        };

        // Start playback from pause time
        const offset = this.pauseTime;
        this.audioSource.start(0, offset);
        this.startTime = this.audioContext.currentTime - offset;
        this.isPlaying = true;
        this.updatePlayPauseButton(true);

        // Start progress updates
        this.startProgressUpdate();
    }



    togglePlayPause() {
        if (!this.isPlaying) {
            // Reset if we've reached the end
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
            this.updatePlayPauseButton(false);
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
        this.stopProgressUpdate(); // Clear any existing interval
        this.progressInterval = setInterval(() => {
            if (this.isPlaying) {
                const currentTime = this.audioContext.currentTime - this.startTime;
                const progress = (currentTime / this.totalDuration) * 100;
                this.updateProgress(Math.min(progress, 100));

                if (currentTime >= this.totalDuration) {
                    this.stopPlayback();
                }
            }
        }, 100);
    }

    stopProgressUpdate() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    updateProgress(percentage, message) {
        // This method should be implemented in your main app class
        if (this.onProgress) {
            this.onProgress(percentage, message);
        }
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