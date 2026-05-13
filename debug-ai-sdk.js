const { streamText } = require('ai');
const { google } = require('@ai-sdk/google');
const pkg = require('ai/package.json');

console.log('--- AI SDK DEBUG ---');
console.log('ai version:', pkg.version);

async function test() {
    try {
        console.log('Calling streamText...');
        const result = await streamText({
            model: google('gemini-2.0-flash'),
            messages: [{ role: 'user', content: 'test' }],
        });

        console.log('Result type:', typeof result);
        console.log('Result keys:', Object.keys(result));

        if (typeof result.toDataStreamResponse === 'function') {
            console.log('SUCCESS: result.toDataStreamResponse() exists');
        } else {
            console.error('FAILURE: result.toDataStreamResponse() MISSING');
            if (result && typeof result === 'object') {
                console.log('Prototype keys:', Object.getOwnPropertyNames(Object.getPrototypeOf(result)));
            }
        }

    } catch (err) {
        console.error('Error in test:', err);
    }
}

test();
