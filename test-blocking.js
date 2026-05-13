const { google } = require('@ai-sdk/google');
const { generateText } = require('ai');

async function test() {
    try {
        console.log('Testing Gemini API (blocking)...');
        const result = await generateText({
            model: google('gemini-2.0-flash'),
            messages: [{ role: 'user', content: 'Dime hola en una línea' }],
        });
        console.log('Result:', result.text);
    } catch (e) {
        console.error('ERROR:', e.message);
    }
}

test();
