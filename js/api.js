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
        }
    }

    setupEventListeners() {
        const apiKeyForm = document.getElementById('apiKeyForm');
        apiKeyForm.addEventListener('submit', (e) => this.handleApiKeySubmit(e));
    }

    handleApiKeySubmit(event) {
        event.preventDefault();
        const apiKeyInput = document.getElementById('apiKey');
        this.apiKey = apiKeyInput.value.trim();

        // Always save the API key in session storage
        sessionStorage.setItem('openai_api_key', this.apiKey);

        // Test the API key before enabling the meditation form
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
            if (typeof debugLog === 'function') {
                debugLog('API Key validation error (api.js):', error.message, error.stack);
            } else {
                console.error('API Key validation error (api.js):', error);
            }
            return false;
        }
    }

    async generateMeditationScript(prompt, duration, guidance) {
        try {
            let n_blocks, sentences_per_block;
            switch (guidance.toLowerCase()) {
                case 'less':
                    n_blocks = 4;
                    sentences_per_block = "1 or 2";
                    break;
                case 'medium':
                    n_blocks = 5;
                    sentences_per_block = "2 or 3";
                    break;
                case 'more':
                    n_blocks = 7;
                    sentences_per_block = "2 or 3";
                    break;
            }

            // Generate example structure based on number of blocks
            let exampleStructure = 'Begin with a brief instruction...\n[PAUSE MM:SS]\n';
            for (let i = 2; i < n_blocks; i++) {
                exampleStructure += `Instruction ${i} with concise guidance...\n[PAUSE MM:SS]\n`;
            }
            exampleStructure += 'Final instruction';

            const messages = [
                {
                    role: "system",
                    content: "You are a meditation guide. Create a guided meditation script."
                },
                {
                    role: "user",
                    content: `You are tasked with creating a guided meditation script for intermediate to advanced practitioners. The meditation should focus on cultivating mindfulness and awareness, rather than just relaxation or stress reduction.

Here are the key details for this meditation:

<duration>${duration} minutes</duration>

<topic>${prompt}</topic>

Before creating the meditation script, please plan your approach. Wrap your work inside <meditation_outline> tags:
1. Use all the tips below to inform how you choose your guidance.
2. Outline the ${n_blocks} main instructions (${sentences_per_block} sentences each) you'll use in the meditation.
3. Calculate and list out the exact pause durations between instructions, ensuring they sum to the total meditation time.
4. Focus the meditation on the topic above.

Now, create the guided meditation script, wrapped in <meditation_script> tags, following these guidelines:
1. Start with immediate instructions for the meditation, without a welcome or introduction.
2. Include exactly ${n_blocks} instruction blocks, each consisting of ${sentences_per_block} sentences.
3. Insert pauses between instructions in the format [PAUSE MM:SS], where MM is minutes and SS is seconds. Always use two digits for both. For example: [PAUSE 02:30]
4. Ensure the total pause time equals the specified meditation duration.
5. Do not end the meditation with a pause; conclude with text.
6. Use the mental noting technique, asking the listener to note sensations, thoughts, and emotions.
7. Incorporate interesting insights or ways of phrasing guidance.
8. Focus on precise guidance for noticing the present moment in detail.
9. Be concise and use instructions sparingly.
10. Draw inspiration from Vipassana techniques and the teachings of Thich Nhat Hanh and Joseph Goldstein, without mentioning them directly.
11. The aim is NOT 'relaxation' or 'stress-reduction', but to cultivate mindfulness and awareness—to be present with whatever arises in the moment, in all its detail and subtlety.
12. Don't use "visualisations" or vague instructions.
13. The meditation should be aimed at intermediate to advanced practitioners.
14. Be concise in your guidance.
15. Focus the meditation on the topic noted above.

Your output should flow naturally when spoken aloud, without numbers or titles. Here's an example structure (do not use this content, only the format):
<example_structure>
${exampleStructure}
</example_structure>

Remember to be concise, precise, and focused on present moment awareness throughout the meditation.`
                }
            ];

            if (typeof debugLog === 'function') {
                debugLog('Generating meditation script with messages (api.js):', JSON.stringify(messages, null, 2));
            } else {
                console.log('Generating meditation script with messages (api.js):', JSON.stringify(messages, null, 2));
            }

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: "gpt-4.1",
                    messages: messages
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            let script = data.choices[0].message.content;
            
            // Extract the meditation outline content
            const outlineMatch = script.match(/<meditation_outline>([\s\S]*?)<\/meditation_outline>/);
            if (outlineMatch) {
                const outline = outlineMatch[1].trim();
                if (typeof debugLog === 'function') {
                    debugLog('Meditation outline plan (api.js):', outline);
                } else {
                    console.log('Meditation outline plan (api.js):', outline);
                }
            }
            
            // Extract only the meditation script content
            const scriptMatch = script.match(/<meditation_script>([\s\S]*?)<\/meditation_script>/);
            if (scriptMatch) {
                script = scriptMatch[1].trim();
            }
            
            if (typeof debugLog === 'function') {
                debugLog('Meditation script (api.js):', script);
            } else {
                console.log('Meditation script (api.js):', script);
            }
            
            // Standardize pause format
            script = script.replace(/\[PAUSE\s*(\d+(?:\.\d+)?)\]/gi, (match, time) => {
                const minutes = Math.floor(parseFloat(time));
                const seconds = Math.round((parseFloat(time) - minutes) * 60);
                return `[PAUSE ${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
            });
            
            // Remove trailing pause if it's the last thing in the script
            script = script.replace(/\[PAUSE [0-9:]+\]\s*$/i, '').trim();
            
            return script;
        } catch (error) {
            if (typeof debugLog === 'function') {
                debugLog('Error generating meditation script (api.js):', error.message, error.stack);
            } else {
                console.error('Error generating meditation script (api.js):', error);
            }
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
            if (typeof debugLog === 'function') {
                debugLog('Error generating speech (api.js):', error.message, error.stack);
            } else {
                console.error('Error generating speech (api.js):', error);
            }
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

const BELL_SOUND_PATH = './assets/meditation-bell.mp3';
