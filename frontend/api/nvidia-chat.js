import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://integrate.api.nvidia.com/v1',
  apiKey: process.env.NVIDIA_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, max_tokens } = req.body;
    if (!messages) {
      return res.status(400).json({ error: 'messages is required' });
    }

    // Non-streaming here for simplicity - the frontend just wants a
    // finished piece of text back, same as the Groq chat endpoint.
    const completion = await client.chat.completions.create({
      model: 'nvidia/nemotron-3-ultra-550b-a55b',
      messages,
      temperature: 0.6,
      top_p: 0.95,
      max_tokens: max_tokens ?? 220,
      extra_body: { chat_template_kwargs: { enable_thinking: true } },
      stream: false,
    });

    res.status(200).json(completion);
  } catch (err) {
    console.error('nvidia-chat error:', err);
    res.status(500).json({ error: err.message || 'NVIDIA chat request failed' });
  }
}
