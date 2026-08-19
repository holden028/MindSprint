import React, { useState, useEffect } from 'react';
import { Music, BarChart3 } from 'lucide-react';
import api from '../services/api';

export default function MusicProductivityTracker({ sessionData, onMusicChange }) {
  const [currentSong, setCurrentSong] = useState('');
  const [currentArtist, setCurrentArtist] = useState('');
  const [currentGenre, setCurrentGenre] = useState('');
  const [productivityData, setProductivityData] = useState([]);

  useEffect(() => {
    // Load saved productivity data
    const saved = localStorage.getItem('musicProductivityData');
    if (saved) {
      setProductivityData(JSON.parse(saved));
    }
  }, []);

  const handleSongSubmit = async () => {
    if (!currentSong.trim() || !currentArtist.trim()) return;

    try {
      const response = await api.post('/music/analyze-music', {
        song: currentSong,
        artist: currentArtist
      });

      const data = response.data;
      
      const musicEntry = {
        id: Date.now(),
        song: currentSong,
        artist: currentArtist,
        genre: data.genre || currentGenre,
        audioFeatures: data.audioFeatures || {},
        timestamp: new Date().toISOString(),
        sessionId: sessionData?.sessionId
      };

      setProductivityData(prev => {
        const newData = [...prev, musicEntry];
        localStorage.setItem('musicProductivityData', JSON.stringify(newData));
        return newData;
      });

      // Notify parent component
      onMusicChange?.(musicEntry);

      // Clear form
      setCurrentSong('');
      setCurrentArtist('');
      setCurrentGenre('');
    } catch (error) {
      console.error('Failed to analyze music:', error);
      // Fallback: just save the basic info
      const musicEntry = {
        id: Date.now(),
        song: currentSong,
        artist: currentArtist,
        genre: currentGenre || 'Unknown',
        timestamp: new Date().toISOString(),
        sessionId: sessionData?.sessionId
      };

      setProductivityData(prev => {
        const newData = [...prev, musicEntry];
        localStorage.setItem('musicProductivityData', JSON.stringify(newData));
        return newData;
      });

      onMusicChange?.(musicEntry);
      setCurrentSong('');
      setCurrentArtist('');
      setCurrentGenre('');
    }
  };

  const getProductivityInsights = () => {
    if (productivityData.length < 3) return null;

    // Simple analysis - in a real app, you'd correlate with session outcomes
    const genreStats = productivityData.reduce((acc, entry) => {
      const genre = entry.genre || 'Unknown';
      if (!acc[genre]) {
        acc[genre] = { count: 0, songs: [] };
      }
      acc[genre].count++;
      acc[genre].songs.push(entry.song);
      return acc;
    }, {});

    const topGenre = Object.entries(genreStats)
      .sort(([,a], [,b]) => b.count - a.count)[0];

    return {
      totalSongs: productivityData.length,
      topGenre: topGenre ? topGenre[0] : 'Unknown',
      topGenreCount: topGenre ? topGenre[1].count : 0,
      recentSongs: productivityData.slice(-5).reverse()
    };
  };

  const insights = getProductivityInsights();

  return (
    <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
      <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <Music className="text-purple-400" size={24} />
        Music & Productivity
      </h3>

      {/* Current Song Input */}
      <div className="space-y-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Song Title
            </label>
            <input
              type="text"
              value={currentSong}
              onChange={(e) => setCurrentSong(e.target.value)}
              className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              placeholder="Enter song title..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Artist
            </label>
            <input
              type="text"
              value={currentArtist}
              onChange={(e) => setCurrentArtist(e.target.value)}
              className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              placeholder="Enter artist name..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Genre (Optional)
            </label>
            <input
              type="text"
              value={currentGenre}
              onChange={(e) => setCurrentGenre(e.target.value)}
              className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              placeholder="e.g., Electronic, Rock..."
            />
          </div>
        </div>
        <button
          onClick={handleSongSubmit}
          disabled={!currentSong.trim() || !currentArtist.trim()}
          className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2"
        >
          <Music size={16} />
          Track This Song
        </button>
      </div>

      {/* Productivity Insights */}
      {insights && (
        <div className="space-y-4">
          <h4 className="text-lg font-semibold text-white flex items-center gap-2">
            <BarChart3 className="text-green-400" size={20} />
            Your Music Insights
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-lg p-4">
              <div className="text-white/80 text-sm mb-1">Total Songs Tracked</div>
              <div className="text-2xl font-bold text-white">{insights.totalSongs}</div>
            </div>
            <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-lg p-4">
              <div className="text-white/80 text-sm mb-1">Most Played Genre</div>
              <div className="text-lg font-semibold text-white">{insights.topGenre}</div>
              <div className="text-white/60 text-sm">{insights.topGenreCount} songs</div>
            </div>
          </div>

          <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-lg p-4">
            <div className="text-white/80 text-sm mb-2">Recent Songs</div>
            <div className="space-y-2">
              {insights.recentSongs.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-sm">
                  <div className="text-white">
                    <span className="font-medium">{entry.song}</span>
                    <span className="text-white/60"> by {entry.artist}</span>
                  </div>
                  <span className="text-white/60 text-xs">{entry.genre}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {productivityData.length === 0 && (
        <div className="text-center py-8 text-white/60">
          <Music size={48} className="mx-auto mb-4 text-white/40" />
          <p>Start tracking your music to see productivity insights!</p>
          <p className="text-sm mt-2">Track what you're listening to during focus sessions.</p>
        </div>
      )}
    </div>
  );
}
