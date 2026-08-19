function parseGptJson(content) {
  if (content == null) {
    throw new Error('Empty GPT response');
  }

  let text = String(content).trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) {
      throw new Error('Failed to parse GPT JSON');
    }
    return JSON.parse(match[1]);
  }
}

module.exports = { parseGptJson };
