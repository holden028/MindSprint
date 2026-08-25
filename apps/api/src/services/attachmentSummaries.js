const { getOpenAI } = require('../config/openai');
const { readFileBuffer } = require('./storage');

const TEXT_MIMES = /^text\//;
const TEXT_EXTENSIONS = /\.(txt|md|csv|json|log|xml|yaml|yml|html|htm)$/i;

async function summarizeAttachment({ mimeType, filename, storageKey }) {
  const name = filename || 'file';

  if (TEXT_MIMES.test(mimeType) || TEXT_EXTENSIONS.test(name)) {
    try {
      const buf = readFileBuffer(storageKey);
      const text = buf.toString('utf8').slice(0, 8000);
      if (text.trim()) {
        return text.trim().slice(0, 4000);
      }
    } catch {
      /* fall through */
    }
  }

  if (mimeType?.startsWith('image/')) {
    try {
      const buf = readFileBuffer(storageKey);
      const base64 = buf.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;
      const completion = await getOpenAI().chat.completions.create({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe this image briefly for a task-management assistant. Focus on actionable details, text visible in the image, deadlines, names, and anything useful for planning work. Keep it under 400 words.'
            },
            { type: 'image_url', image_url: { url: dataUrl } }
          ]
        }],
        temperature: 0.2,
        max_tokens: 600
      });
      const summary = completion.choices[0]?.message?.content?.trim();
      if (summary) return summary;
    } catch (err) {
      console.error('Image attachment summary failed:', err.message);
    }
  }

  return `File: ${name} (${mimeType || 'unknown type'})`;
}

module.exports = { summarizeAttachment };
