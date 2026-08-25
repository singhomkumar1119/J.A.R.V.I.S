import Groq from 'groq-sdk';
import { toFile } from 'groq-sdk/uploads';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Vercel functions need raw body access for binary audio uploads instead
// of the default JSON body parser.
export const config = {
  api: {
    bodyParser: false,
  },
};

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const language = req.query.language === 'hi' ? 'hi' : 'en';
    const audioBuffer = await readRawBody(req);

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'No audio data received' });
    }

    const file = await toFile(audioBuffer, 'audio.webm');

    const transcription = await groq.audio.transcriptions.create({
      file,
      model: 'whisper-large-v3-turbo',
      language,
    });

    res.status(200).json(transcription);
  } catch (err) {
    console.error('groq-transcribe error:', err);
    res.status(500).json({ error: err.message || 'Transcription failed' });
  }
}
