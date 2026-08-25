export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, speaker } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const sarvamRes = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        target_language_code: 'hi-IN',
        model: 'bulbul:v3',
        speaker: speaker || 'shreya',
      }),
    });

    if (!sarvamRes.ok) {
      const errText = await sarvamRes.text().catch(() => '');
      return res.status(sarvamRes.status).json({ error: `Sarvam TTS failed: ${errText}` });
    }

    const data = await sarvamRes.json();
    res.status(200).json(data);
  } catch (err) {
    console.error('sarvam-tts error:', err);
    res.status(500).json({ error: err.message || 'Sarvam TTS request failed' });
  }
}
