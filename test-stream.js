const { google } = require('@ai-sdk/google');
const { streamText } = require('ai');

async function test() {
    try {
        console.log('Testing Gemini API...');
        const result = streamText({
            model: google('gemini-2.0-flash'),
            messages: [{ role: 'user', content: 'Dime hola en una línea' }],
        });

        let text = '';
        for await (const chunk of result.textStream) {
            text += chunk;
            process.stdout.write(chunk);
        }
        console.log('\n\nDone! Total:', text.length, 'chars');
    } catch (e) {
        console.error('ERROR:', e.message);
        console.error('Stack:', e.stack);
    }
}

test();
