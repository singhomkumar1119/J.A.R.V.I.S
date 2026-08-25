import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const response = await groq.audio.speech.create({
      model: 'canopylabs/orpheus-v1-english',
      voice: 'daniel',
      input: text,
      response_format: 'wav',
    });

    const arrayBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/wav');
    res.status(200).send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('groq-tts error:', err);
    res.status(500).json({ error: err.message || 'TTS request failed' });
  }
}
