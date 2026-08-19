import React, { useState, useEffect } from 'react';
import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import { 
  Award, 
  Flame, 
  Star, 
  Trophy,
  CheckCircle,
  Lock
} from 'lucide-react';

export default function GamificationDashboard() {
  const [gamification, setGamification] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGamification();
  }, []);

  const loadGamification = async () => {
    try {
      const response = await api.get('/profile/gamification');
      setGamification(response.data);
    } catch (error) {
      console.error('Failed to load gamification:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSpinner embedded />;
  }

  const level = gamification?.level || 1;
  const xp = gamification?.xp || 0;
  const xpForNextLevel = gamification?.xpForNextLevel || 100;
  const streak = gamification?.streak || 0;
  const longestStreak = gamification?.longestStreak || 0;
  const achievements = gamification?.achievements || [];
  const levelTitle = getLevelTitle(level);

  return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Your Progress</h2>
          <p className="text-white/60">Track your achievements and level up</p>
        </div>

        {/* Level & XP */}
        <div className="backdrop-blur-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-white/20 rounded-2xl p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl">
                <Crown className="text-white" size={32} />
              </div>
              <div>
                <div className="text-white/60 text-sm">Your Level</div>
                <div className="text-4xl font-bold text-white">Level {level}</div>
                <div className="text-yellow-400 text-sm font-medium">{levelTitle}</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-white/60 text-sm">Total XP</div>
              <div className="text-3xl font-bold text-white">{xp.toLocaleString()}</div>
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-white/70">Progress to Level {level + 1}</span>
              <span className="text-white/70">{xp % xpForNextLevel}/{xpForNextLevel} XP</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-4">
              <div 
                className="bg-gradient-to-r from-yellow-500 to-orange-500 h-4 rounded-full transition-all duration-500"
                style={{ width: `${((xp % xpForNextLevel) / xpForNextLevel) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {/* Streak */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-orange-500/20 rounded-lg">
                <Flame className="text-orange-400" size={28} />
              </div>
              <div>
                <div className="text-white/60 text-sm">Current Streak</div>
                <div className="text-3xl font-bold text-white">{streak} {streak === 1 ? 'day' : 'days'}</div>
              </div>
            </div>
            <p className="text-white/50 text-sm">
              {streak > 0 ? `Keep it up! Complete a session today to maintain your streak.` : `Start a session today to begin your streak!`}
            </p>
          </div>

          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-purple-500/20 rounded-lg">
                <Trophy className="text-purple-400" size={28} />
              </div>
              <div>
                <div className="text-white/60 text-sm">Longest Streak</div>
                <div className="text-3xl font-bold text-white">{longestStreak} {longestStreak === 1 ? 'day' : 'days'}</div>
              </div>
            </div>
            <p className="text-white/50 text-sm">Your personal best!</p>
          </div>
        </div>

        {/* Achievements */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6">
          <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <Award size={28} />
            Achievements
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {getAllAchievements().map((achievement) => {
              const isUnlocked = achievements.some(a => a.id === achievement.id);
              const userAchievement = achievements.find(a => a.id === achievement.id);
              
              return (
                <div 
                  key={achievement.id}
                  className={`relative overflow-hidden rounded-xl p-6 border transition-all ${
                    isUnlocked 
                      ? 'bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-400/30' 
                      : 'bg-white/5 border-white/10 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg ${
                      isUnlocked ? 'bg-yellow-500/30' : 'bg-white/10'
                    }`}>
                      {isUnlocked ? (
                        <Medal className="text-yellow-400" size={24} />
                      ) : (
                        <Lock className="text-white/40" size={24} />
                      )}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white font-semibold mb-1">{achievement.name}</h4>
                      <p className="text-white/60 text-sm mb-2">{achievement.description}</p>
                      {isUnlocked && userAchievement && (
                        <p className="text-yellow-400 text-xs">
                          Unlocked {new Date(userAchievement.unlocked_at).toLocaleDateString()}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <Star className="text-yellow-400" size={14} />
                        <span className="text-yellow-400 text-sm font-medium">{achievement.xp} XP</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
  );
}

function getLevelTitle(level) {
  if (level < 5) return 'Beginner';
  if (level < 10) return 'Focused';
  if (level < 20) return 'Dedicated';
  if (level < 30) return 'Expert';
  if (level < 50) return 'Master';
  return 'Zen Master';
}

function getAllAchievements() {
  return [
    {
      id: 'first_session',
      name: 'First Steps',
      description: 'Complete your first focus session',
      xp: 50
    },
    {
      id: 'early_bird',
      name: 'Early Bird',
      description: 'Complete 5 sessions before 9 AM',
      xp: 100
    },
    {
      id: 'night_owl',
      name: 'Night Owl',
      description: 'Complete 5 sessions after 10 PM',
      xp: 100
    },
    {
      id: 'focus_master',
      name: 'Focus Master',
      description: 'Complete 10 sessions with 8+ rating',
      xp: 200
    },
    {
      id: 'estimate_expert',
      name: 'Estimate Expert',
      description: 'Get 10 accurate time estimates',
      xp: 150
    },
    {
      id: 'week_warrior',
      name: 'Week Warrior',
      description: 'Maintain a 7-day streak',
      xp: 250
    },
    {
      id: 'month_master',
      name: 'Month Master',
      description: 'Maintain a 30-day streak',
      xp: 500
    },
    {
      id: 'century_club',
      name: 'Century Club',
      description: 'Complete 100 focus sessions',
      xp: 1000
    },
    {
      id: 'distraction_destroyer',
      name: 'Distraction Destroyer',
      description: 'Complete 5 sessions with zero distractions',
      xp: 200
    },
    {
      id: 'energy_enthusiast',
      name: 'Energy Enthusiast',
      description: 'Complete 10 sessions with 5/5 energy',
      xp: 150
    },
    {
      id: 'task_terminator',
      name: 'Task Terminator',
      description: 'Complete 50 tasks',
      xp: 300
    },
    {
      id: 'project_pro',
      name: 'Project Pro',
      description: 'Complete 5 different projects',
      xp: 200
    }
  ];
}

