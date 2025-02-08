/* audio.js */
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
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            this.isInitialized = true;
            console.log('AudioContext initialized successfully');
            await this.loadBellSound();
        } catch (error) {
            console.error('Web Audio API is not supported in this browser:', error);
            throw new Error('Your browser does not support the required audio features.');
        }
    }

    async loadBellSound() {
        try {
            const response = await fetch(BELL_SOUND_PATH);
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
        const silenceBuffer = this.audioContext.createBuffer(1, samples, sampleRate);
        return silenceBuffer;
    }

    async processScript(script) {
        console.log('Starting script processing...');
        const parts = script.split(/\[PAUSE (\d{2}:\d{2})\]/);

        // Calculate total number of text sub-segments for progress
        let totalTextSegments = 0;
        for (let k = 0; k < parts.length; k += 2) {
            if (parts[k].trim()) {
                const subSegs = parts[k].split(/(?<=[.!?])\s+/).filter(s => s.trim());
                totalTextSegments += subSegs.length;
            }
        }
        let completedTextSegments = 0;

        const audioBuffers = [];
        let currentTime = 0;
        const timingMarks = [];

        // Add initial bell
        if (!this.bellBuffer) {
            await this.loadBellSound();
        }
        audioBuffers.push(this.bellBuffer);
        timingMarks.push({ time: currentTime, type: 'bell' });
        currentTime += this.bellBuffer.duration;

        // Process each part
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                // Text part: split into sentences using punctuation (. ! ?)
                if (parts[i].trim()) {
                    const subSegments = parts[i].split(/(?<=[.!?])\s+/);
                    for (let j = 0; j < subSegments.length; j++) {
                        const sentence = subSegments[j].trim();
                        if (!sentence) continue;
                        completedTextSegments++;
                        const progressPercentage = (completedTextSegments / totalTextSegments) * 80 + 20;
                        this.updateProgress(progressPercentage, `Generating audio for sentence ${completedTextSegments} of ${totalTextSegments}`);
                        
                        console.log(`Processing sentence ${completedTextSegments} of ${totalTextSegments}: ${sentence}`);
                        const blob = await apiManager.generateSpeech(sentence);
                        const arrayBuffer = await blob.arrayBuffer();
                        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                        audioBuffers.push(audioBuffer);
                        timingMarks.push({ time: currentTime, type: 'speech', text: sentence });
                        currentTime += audioBuffer.duration;

                        // Add 1-second pause after each sentence except the last in this text segment
                        if (j < subSegments.length - 1) {
                            const silenceBuffer = await this.createSilence(1);
                            audioBuffers.push(silenceBuffer);
                            timingMarks.push({ time: currentTime, type: 'pause', duration: 1 });
                            currentTime += 1;
                        }
                    }
                }
            } else {
                // Convert MM:SS format to seconds
                const [minutes, seconds] = parts[i].split(':').map(Number);
                const pauseDuration = (minutes * 60) + seconds;
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

        this.totalDuration = currentTime;
        const finalBuffer = this.mergeAudioBuffers(audioBuffers, currentTime);
        this.meditationBuffer = finalBuffer;
        this.timingMarks = timingMarks;

        this.audioPlayer.style.display = 'block';
        this.updatePlayPauseButton(true);

        // Start playback automatically
        setTimeout(() => {
            this.startPlayback();
        }, 500);
    }

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
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const finalChannelData = finalBuffer.getChannelData(channel);
                const sourceChannelData = buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1));
                const offsetSamples = Math.floor(
                    buffers.slice(0, index).reduce((acc, buf) => acc + buf.duration, 0) * sampleRate
                );
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
        if (this.audioSource) {
            try {
                this.audioSource.stop();
            } catch (e) {}
        }
        this.audioSource = this.audioContext.createBufferSource();
        this.audioSource.buffer = this.meditationBuffer;
        this.audioSource.connect(this.audioContext.destination);
        this.audioSource.onended = () => {
            if (this.audioContext.currentTime - this.startTime >= this.totalDuration) {
                this.isPlaying = false;
                this.pauseTime = 0;
                this.updatePlayPauseButton(false);
                if (window.noSleep) {
                    noSleep.disable();
                }
            }
        };
        const offset = this.pauseTime;
        this.audioSource.start(0, offset);
        this.startTime = this.audioContext.currentTime - offset;
        this.isPlaying = true;
        this.updatePlayPauseButton(true);

        // Enable NoSleep wake lock when playback starts
        if (window.noSleep) {
            noSleep.enable();
        }

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
            this.updatePlayPauseButton(false);
            this.stopProgressUpdate();
            if (window.noSleep) {
                noSleep.disable();
            }
        }
    }

    stopPlayback() {
        if (this.audioSource) {
            this.audioSource.stop();
        }
        this.pauseTime = 0;
        this.isPlaying = false;
        this.stopProgressUpdate();
        this.updateProgress(0);
        if (window.noSleep) {
            noSleep.disable();
        }
    }

    startProgressUpdate() {
        this.stopProgressUpdate();
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
        if (this.onProgress) {
            this.onProgress(percentage, message);
        }
    }

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
