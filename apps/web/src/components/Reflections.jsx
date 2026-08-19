import React, { useState, useEffect } from 'react';
import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import { BarChart3, TrendingUp, Award, Calendar } from 'lucide-react';

export default function Reflections() {
  const [sessions, setSessions] = useState([]);
  const [stats, setStats] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [sessionsRes, statsRes, recsRes] = await Promise.all([
        api.get('/sessions/history?limit=50').catch(() => ({ data: { sessions: [] } })),
        api.get('/profile/stats').catch(() => ({ data: { sessions: {}, tasks: {} } })),
        api.get('/profile/recommendations').catch(() => ({ data: { recommendations: [] } }))
      ]);

      setSessions(sessionsRes.data.sessions || []);
      setStats(statsRes.data || null);
      setRecommendations(recsRes.data.recommendations || []);
    } catch (error) {
      console.error('Failed to load reflections:', error);
    } finally {
      setLoading(false);
    }
  };

  const getEnvironmentIcon = (environment) => {
    if (!environment) return null;
    
    try {
      const env = typeof environment === 'string' ? JSON.parse(environment || '{}') : environment;
      const active = Object.entries(env).filter(([_, v]) => v).map(([k]) => k);
      return active.join(', ') || 'Default';
    } catch {
      return 'Default';
    }
  };

  if (loading) {
    return <LoadingSpinner embedded />;
  }

  return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-3xl font-bold text-white mb-8">Your Reflections</h2>

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-purple-500/20 rounded-lg">
                  <Calendar className="text-purple-300" size={24} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.sessions?.total_sessions || 0}</div>
                  <div className="text-white/60 text-sm">Total Sessions</div>
                </div>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-blue-500/20 rounded-lg">
                  <Award className="text-blue-300" size={24} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.sessions?.completed_sessions || 0}</div>
                  <div className="text-white/60 text-sm">Completed</div>
                </div>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-green-500/20 rounded-lg">
                  <TrendingUp className="text-green-300" size={24} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{stats.sessions?.avg_rating?.toFixed(1) || 'N/A'}</div>
                  <div className="text-white/60 text-sm">Avg Rating</div>
                </div>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 shadow-lg hover:shadow-xl transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-yellow-500/20 rounded-lg">
                  <BarChart3 className="text-yellow-300" size={24} />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{Math.round(stats.sessions?.total_minutes || 0)}</div>
                  <div className="text-white/60 text-sm">Total Minutes</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6 mb-8">
            <h3 className="text-xl font-bold text-white mb-4">AI Insights</h3>
            <div className="space-y-3">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="bg-white/5 rounded-lg p-4">
                  <div className="text-white/90">{rec.message || rec}</div>
                  {rec.type && (
                    <div className="text-white/50 text-sm mt-1 capitalize">{rec.type}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Sessions */}
        <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
          <h3 className="text-xl font-bold text-white mb-6">Recent Sessions</h3>
          
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <p className="mb-4">No sessions yet</p>
              <p className="text-sm">Complete some focus sessions to see your progress!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div key={session.id} className="bg-white/5 rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <h4 className="text-white font-medium mb-1">
                        {session.task_title || 'Untitled Session'}
                      </h4>
                      {session.project_title && (
                        <p className="text-white/50 text-sm">{session.project_title}</p>
                      )}
                    </div>
                    {session.self_rating && (
                      <div className="text-white/70 text-sm">
                        ⭐ {session.self_rating}/10
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-white/50">
                    <span>{session.mode || 'pomodoro'}</span>
                    <span>{session.actual_duration_minutes || session.duration_minutes} min</span>
                    <span>{getEnvironmentIcon(session.environment)}</span>
                    <span>{new Date(session.started_at).toLocaleDateString()}</span>
                  </div>

                  {session.notes && (
                    <p className="mt-3 text-white/60 text-sm">{session.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
  );
}

