const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { chatJson } = require('../config/openai');

const router = express.Router();

router.post('/analyze-music', authenticateToken, async (req, res) => {
  try {
    const { song, artist } = req.body;

    if (!song || !artist) {
      return res.status(400).json({ error: 'Song and artist are required' });
    }

    const prompt = `Analyze this song and provide genre and audio features:

Song: "${song}"
Artist: "${artist}"

Respond with JSON:
{
  "genre": "Primary Genre",
  "audioFeatures": {
    "energy": 1,
    "tempo": "estimated BPM",
    "valence": 1,
    "danceability": 1
  },
  "similarArtists": ["artist1", "artist2", "artist3"],
  "description": "Brief description of the song's characteristics"
}`;

    const analysis = await chatJson({ prompt, temperature: 0.3, max_tokens: 400 });
    res.json(analysis);
  } catch (error) {
    console.error('Music analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze music' });
  }
});

router.get('/productivity-insights', authenticateToken, async (req, res) => {
  res.json({
    message: 'Music productivity insights would be stored in database',
    sampleData: {
      topGenres: [],
      mostProductiveSongs: [],
      insights: []
    }
  });
});

module.exports = router;
