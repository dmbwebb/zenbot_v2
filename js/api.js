/* api.js */
class APIManager {
    constructor() {
        this.apiKey = null;
        this.selectedVoice = 'onyx';  // Default voice
        this.initializeFromSession();
        this.setupEventListeners();
    }

    initializeFromSession() {
        // Check if API key exists in session storage
        const savedKey = sessionStorage.getItem('openai_api_key');
        if (savedKey) {
            this.apiKey = savedKey;
            this.enableMeditationForm();
            document.getElementById('apiKey').value = savedKey;
            document.getElementById('rememberKey').checked = true;
        }
    }

    setupEventListeners() {
        const apiKeyForm = document.getElementById('apiKeyForm');
        apiKeyForm.addEventListener('submit', (e) => this.handleApiKeySubmit(e));
    }

    handleApiKeySubmit(event) {
        event.preventDefault();
        const apiKeyInput = document.getElementById('apiKey');
        const rememberKey = document.getElementById('rememberKey');

        this.apiKey = apiKeyInput.value.trim();

        if (rememberKey.checked) {
            sessionStorage.setItem('openai_api_key', this.apiKey);
        } else {
            sessionStorage.removeItem('openai_api_key');
        }

        // Test the API key before enabling the form
        this.testApiKey()
            .then(isValid => {
                if (isValid) {
                    this.enableMeditationForm();
                    this.showError(''); // Clear any existing errors
                } else {
                    this.showError('Invalid API key. Please check and try again.');
                }
            })
            .catch(error => {
                this.showError('Error validating API key: ' + error.message);
            });
    }

    async testApiKey() {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    messages: [{
                        role: "user",
                        content: "Hello"
                    }],
                    max_tokens: 1
                })
            });

            return response.status === 200;
        } catch (error) {
            console.error('API Key validation error:', error);
            return false;
        }
    }

    async generateMeditationScript(prompt, duration, guidance) {
        try {
            let guidanceSentence = '';
            if (guidance === 'less') {
                guidanceSentence = `
                There should be plenty of long pauses between guidance. 
                Do not guide too much, use instructions sparingly. 
                Have about 4 instructions for each meditation OR LESS, 
                with only pauses between. ONLY 4 instructions per meditation.
            `;
            } else {
                guidanceSentence = `
                Include a moderate amount of guidance with some pauses. 
                There should be about 6-7 instructions for each meditation, 
                with some pauses in between.
            `;
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4o-mini",
                    n: 1,
                    messages: [
                        {
                            role: "system",
                            content: "You are a meditation guide. Create a guided meditation script."
                        },
                        {
                            role: "user",
                            content: `
                            Create a ${duration}-minute guided meditation on ${prompt}.
                            Include [PAUSE X] indicators for moments of silence, where X is the duration of the pause in minutes.
                            The pauses should add up to the total duration.
                            ${guidanceSentence}
                            
                            The style of meditation should be inspired by the teachings of Thich Nhat Hanh and Joseph Goldstein, but do not mention this. Can also take inspiration from Vipassana techniques.

                            The aim is NOT 'relaxation' or 'stress-reduction', 
                            but to cultivate mindfulness and awareness—to be present 
                            with whatever arises in the moment, in all its detail and subtlety.
                            Be very precise in your guidance, with a focus on noticing exactly what is happening in the present moment.
                            
                            The meditation should be aimed at intermediate to advanced practitioners.

                            Use 'mental noting'—ask the listener to note the sensations, 
                            thoughts, and emotions that arise.

                            Do not add numbers or titles, so that the guided meditation 
                            flows nicely when said out loud.

                            Make sure to actually start the meditation 
                            before pausing too soon. Give instructions straight away 
                            for the meditation rather than just welcoming.

                            Be precise and concise in your guidance.

                            Be a little bit surprising in your guidance, 
                            with some novel ideas or ways of phrasing things.
                            Keep it fresh and interesting. Have some surprising and 
                            precise insights about how to meditate.
                        `
                        }
                    ]
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error('Error generating meditation script:', error);
            throw error;
        }
    }

    async generateSpeech(text) {
        try {
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "tts-1",
                    voice: this.selectedVoice,
                    input: text.trim()
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.blob();
        } catch (error) {
            console.error('Error generating speech:', error);
            throw error;
        }
    }

    enableMeditationForm() {
        const meditationForm = document.getElementById('meditationForm');
        const submitButton = meditationForm.querySelector('button[type="submit"]');
        submitButton.disabled = false;
    }

    showError(message) {
        const errorElement = document.getElementById('errorMessage');
        if (message) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        } else {
            errorElement.style.display = 'none';
        }
    }
}

// Create a global instance of the API manager
const apiManager = new APIManager();
