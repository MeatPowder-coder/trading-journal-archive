const https = require('https');
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
console.log('API key present:', !!apiKey, 'length:', apiKey?.length);

const url = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;
https.get(url, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        try {
            const parsed = JSON.parse(data);
            if (parsed.models) {
                const models = parsed.models.map(m => m.name).filter(n => n.includes('gemini'));
                console.log('Available models (' + models.length + '):');
                models.forEach(m => console.log(' ', m));
            } else {
                console.log('Error response:', data.substring(0, 500));
            }
        } catch (e) {
            console.log('Raw response:', data.substring(0, 500));
        }
    });
}).on('error', e => console.error('Network error:', e.message));
