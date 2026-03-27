// Vercel Serverless Function — proxies requests to your AI provider
// Your API key is stored safely in Vercel environment variables

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_URL = process.env.API_URL || 'https://xh.v1api.cc/v1/chat/completions';
  const API_KEY = process.env.API_KEY;
  const MODEL = process.env.MODEL || 'gpt-5';

  if (!API_KEY) {
    return res.status(500).json({ error: 'API_KEY not configured' });
  }

  try {
    const { system, messages, max_tokens = 600 } = req.body;

    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens,
        messages: [
          { role: 'system', content: system || '' },
          ...messages,
        ],
      }),
    });

    const data = await response.json();

    // Extract the reply text
    const reply = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({ reply });
  } catch (error) {
    console.error('API proxy error:', error);
    return res.status(500).json({ error: 'Failed to call AI API' });
  }
}
