import React, { useState, useEffect } from 'react';
import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import { 
  TrendingUp, 
  Clock, 
  Zap, 
  Brain, 
  Target, 
  AlertCircle,
  CheckCircle,
  BarChart3,
  PieChart,
  Activity
} from 'lucide-react';

export default function InsightsDashboard() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInsights();
  }, []);

  const loadInsights = async () => {
    try {
      const response = await api.get('/profile/insights');
      setInsights(response.data);
    } catch (error) {
      console.error('Failed to load insights:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner embedded />;
  }

  const bestTimeOfDay = insights?.bestTimeOfDay || { hour: 14, sessions: 0 };
  const bestEnvironment = insights?.bestEnvironment || { environment: 'None', avgRating: 0 };
  const avgEnergy = insights?.avgEnergy || 3;
  const avgFocus = insights?.avgFocus || 3;
  const topDistraction = insights?.topDistraction || { type: 'None', count: 0 };

  return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Productivity Insights</h2>
          <p className="text-white/60">Understand your patterns and optimize your workflow</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Best Time of Day */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-orange-500/20 rounded-lg">
                <Clock className="text-orange-300" size={24} />
              </div>
              <div>
                <div className="text-white/60 text-sm">Best Time</div>
                <div className="text-2xl font-bold text-white">
                  {bestTimeOfDay.hour}:00 - {bestTimeOfDay.hour + 1}:00
                </div>
              </div>
            </div>
            <p className="text-white/50 text-xs">Most productive hour</p>
          </div>

          {/* Average Energy */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-green-500/20 rounded-lg">
                <Zap className="text-green-300" size={24} />
              </div>
              <div>
                <div className="text-white/60 text-sm">Avg Energy</div>
                <div className="text-2xl font-bold text-white">{avgEnergy.toFixed(1)}/5</div>
              </div>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div 
                  key={i} 
                  className={`h-2 flex-1 rounded ${i <= avgEnergy ? 'bg-green-400' : 'bg-white/20'}`}
                />
              ))}
            </div>
          </div>

          {/* Average Focus */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <Brain className="text-purple-300" size={24} />
              </div>
              <div>
                <div className="text-white/60 text-sm">Avg Focus</div>
                <div className="text-2xl font-bold text-white">{avgFocus.toFixed(1)}/5</div>
              </div>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div 
                  key={i} 
                  className={`h-2 flex-1 rounded ${i <= avgFocus ? 'bg-purple-400' : 'bg-white/20'}`}
                />
              ))}
            </div>
          </div>

          {/* Top Distraction */}
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-red-500/20 rounded-lg">
                <AlertCircle className="text-red-300" size={24} />
              </div>
              <div>
                <div className="text-white/60 text-sm">Top Distraction</div>
                <div className="text-xl font-bold text-white capitalize">{topDistraction.type}</div>
              </div>
            </div>
            <p className="text-white/50 text-xs">{topDistraction.count} occurrences</p>
          </div>
        </div>

        {/* Time of Day Performance */}
        {insights?.hourlyPerformance && (
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 mb-8">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <BarChart3 size={24} />
              Performance by Time of Day
            </h3>
            <div className="flex items-end justify-between gap-2 h-48">
              {insights.hourlyPerformance.map((hour) => (
                <div key={hour.hour} className="flex-1 flex flex-col items-center gap-2">
                  <div className="flex-1 w-full flex items-end">
                    <div 
                      className="w-full bg-gradient-to-t from-blue-500 to-purple-500 rounded-t-lg transition-all hover:from-blue-400 hover:to-purple-400"
                      style={{ height: `${(hour.avgRating / 10) * 100}%` }}
                      title={`${hour.hour}:00 - Rating: ${hour.avgRating.toFixed(1)}`}
                    />
                  </div>
                  <span className="text-white/50 text-xs">{hour.hour}</span>
                </div>
              ))}
            </div>
            <div className="text-center text-white/50 text-sm mt-4">Hours of the day</div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Best Environments */}
          {insights?.environmentPerformance && (
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <PieChart size={24} />
                Best Environments
              </h3>
              <div className="space-y-3">
                {insights.environmentPerformance.slice(0, 5).map((env, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white/90 text-sm capitalize">{env.environment}</span>
                        <span className="text-white/60 text-xs">{env.avgRating.toFixed(1)}/10</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-green-500 to-teal-500 h-2 rounded-full transition-all"
                          style={{ width: `${(env.avgRating / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Distraction Analysis */}
          {insights?.distractionAnalysis && (
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Activity size={24} />
                Distraction Patterns
              </h3>
              <div className="space-y-3">
                {insights.distractionAnalysis.slice(0, 5).map((distraction, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="text-2xl">{getDistractionEmoji(distraction.type)}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white/90 text-sm capitalize">{distraction.type}</span>
                        <span className="text-white/60 text-xs">{distraction.count}x</span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-red-500 to-orange-500 h-2 rounded-full transition-all"
                          style={{ width: `${(distraction.percentage)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Recommendations */}
        {insights?.recommendations && insights.recommendations.length > 0 && (
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Target size={24} />
              AI Recommendations
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.recommendations.map((rec, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-4 flex items-start gap-3">
                  <CheckCircle className="text-green-400 flex-shrink-0 mt-0.5" size={20} />
                  <p className="text-white/90 text-sm">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
  );
}

function getDistractionEmoji(type) {
  const emojis = {
    phone: '📱',
    noise: '🔊',
    people: '👥',
    internet: '🌐',
    thoughts: '💭',
    hunger: '🍕',
    fatigue: '😴',
    other: '❓'
  };
  return emojis[type] || '❓';
}

