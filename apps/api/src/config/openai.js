const OpenAI = require('openai');
const { parseGptJson } = require('../utils/parseGptJson');

let client;

function getOpenAI() {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      timeout: 30000,
      maxRetries: 1
    });
  }
  return client;
}

async function chatJson({ prompt, temperature = 0.3, max_tokens = 1500 }) {
  const completion = await getOpenAI().chat.completions.create({
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature,
    max_tokens
  });

  return parseGptJson(completion.choices[0].message.content);
}

module.exports = {
  getOpenAI,
  chatJson
};
