import Groq from 'groq-sdk';

// Server-only env var (no VITE_ prefix) - never bundled into client JS,
// unlike the old VITE_GROQ_API_KEY which was visible to anyone visiting
// the site.
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, model, temperature, max_tokens } = req.body;
    if (!messages || !model) {
      return res.status(400).json({ error: 'messages and model are required' });
    }

    const completion = await groq.chat.completions.create({
      messages,
      model,
      temperature: temperature ?? 0.6,
      max_tokens: max_tokens ?? 180,
    });

    res.status(200).json(completion);
  } catch (err) {
    console.error('groq-chat error:', err);
    res.status(500).json({ error: err.message || 'Groq chat request failed' });
  }
}
