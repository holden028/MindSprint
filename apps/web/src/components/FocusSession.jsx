import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import CustomEnvironmentModal from './CustomEnvironmentModal';
import MusicProductivityTracker from './MusicProductivityTracker';
import SessionCompletionModal from './SessionCompletionModal';
import TimerDisplay from './TimerDisplay';
import LoadingSpinner from './LoadingSpinner';
import { getEnvIcon } from '../utils/iconMap';
import { suggestsFocusHelp } from '../utils/workMode';
import {
  Music, Moon, Volume2, Smartphone, ChevronDown, ChevronRight,
  Zap, Clock, Target, Plus, Brain, CheckCircle
} from 'lucide-react';

const MODE_PRESETS = [
  {
    id: 'free',
    title: 'Just work',
    subtitle: 'No timer pressure',
    defaultDuration: 25,
    activeClass: 'bg-emerald-500/30 border-emerald-400/50 text-white',
  },
  {
    id: 'adhd',
    title: 'Sprint',
    subtitle: '15 min burst',
    defaultDuration: 15,
    activeClass: 'bg-blue-500/30 border-blue-400/50 text-white',
  },
  {
    id: 'pomodoro',
    title: 'Pomodoro',
    subtitle: '25 min optional',
    defaultDuration: 25,
    activeClass: 'bg-violet-500/30 border-violet-400/50 text-white',
  },
];

export default function FocusSession() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [mode, setMode] = useState(() => {
    const fromUrl = searchParams.get('mode');
    return ['free', 'adhd', 'pomodoro'].includes(fromUrl) ? fromUrl : 'free';
  });
  const [duration, setDuration] = useState(25);
  const [isRunning, setIsRunning] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const [environment, setEnvironment] = useState({
    music: false,
    darkRoom: false,
    silence: false,
    phoneOff: false
  });
  const [customEnvironments, setCustomEnvironments] = useState([]);
  const [showCustomEnvironmentModal, setShowCustomEnvironmentModal] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [quickWins, setQuickWins] = useState([]);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [learningTip, setLearningTip] = useState(null);
  const [learningConfidence, setLearningConfidence] = useState('low');
  const [learningReasons, setLearningReasons] = useState([]);

  useEffect(() => {
    if (selectedTask?.est_minutes && !isRunning && mode !== 'free') {
      setDuration(selectedTask.est_minutes);
    }
  }, [selectedTask, isRunning, mode]);

  useEffect(() => {
    const load = async () => {
      try {
        const est = selectedTask?.est_minutes;
        const [tasksRes, projectsRes, envRes, suggestRes] = await Promise.all([
          api.get('/tasks'),
          api.get('/projects'),
          api.get('/custom-environments').catch(() => ({ data: { environments: [] } })),
          api.get('/profile/suggestions', {
            params: est ? { est_minutes: est } : undefined
          }).catch(() => ({ data: null }))
        ]);

        const incompleteTasks = (tasksRes.data.tasks || []).filter((t) => t.status !== 'done');
        setTasks(incompleteTasks);
        setProjects(projectsRes.data.projects || []);
        setCustomEnvironments(envRes.data.environments || []);
        calculateQuickWins(incompleteTasks);

        if (suggestRes.data?.tip) {
          setLearningTip(suggestRes.data.tip);
          setLearningConfidence(suggestRes.data.confidence || 'low');
          setLearningReasons(Array.isArray(suggestRes.data.reasons) ? suggestRes.data.reasons : []);
        }
        if (suggestRes.data?.environment && Object.keys(suggestRes.data.environment).length > 0) {
          setEnvironment((prev) => ({ ...prev, ...suggestRes.data.environment }));
        }

        const taskId = searchParams.get('taskId');
        if (taskId) {
          const task = incompleteTasks.find((t) => String(t.id) === String(taskId));
          if (task) {
            setSelectedTask(task);
            if (suggestsFocusHelp(task) && !searchParams.get('mode')) {
              // Soft default: longer tasks still open in free work, not forced Pomodoro
              setMode('free');
            }
          } else {
            const title = searchParams.get('taskTitle');
            setSelectedTask({ id: taskId, title: title ? decodeURIComponent(title) : 'Selected task' });
          }
        }
      } catch (error) {
        console.error('Failed to load focus data:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [searchParams]);

  const calculateQuickWins = (taskList) => {
    const quickWinTasks = taskList
      .filter((task) =>
        task.status === 'todo' &&
        task.est_minutes <= 15 &&
        (task.priority >= 4 || task.urgency >= 4)
      )
      .sort((a, b) => {
        const scoreA = a.priority + a.urgency;
        const scoreB = b.priority + b.urgency;
        if (scoreA !== scoreB) return scoreB - scoreA;
        return a.est_minutes - b.est_minutes;
      })
      .slice(0, 3);

    setQuickWins(quickWinTasks);
  };

  const toggleProject = (projectId) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  const getTasksByProject = (projectId) => tasks.filter((task) => task.project_id === projectId);
  const unassignedTasks = tasks.filter((task) => !projects.some((project) => project.id === task.project_id));

  const handleCustomEnvironmentSelect = (customEnv) => {
    setEnvironment((prev) => ({
      ...prev,
      [customEnv.name.toLowerCase().replace(/\s+/g, '_')]: true
    }));
  };

  const selectMode = (preset) => {
    if (isRunning) return;
    setMode(preset.id);
    setDuration(preset.defaultDuration);
  };

  const handleStart = async () => {
    try {
      const response = await api.post('/sessions/start', {
        task_id: selectedTask?.id || null,
        mode,
        duration_minutes: mode === 'free' ? (selectedTask?.est_minutes || duration) : duration,
        environment
      });
      setSessionId(response.data.session.id);
      setIsRunning(true);
      setStartTime(Date.now());
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const handlePause = () => setIsRunning(false);
  const handleReset = () => setIsRunning(false);

  const handleTimerComplete = useCallback(() => {
    setIsRunning(false);
    setShowCompletionModal(true);
  }, []);

  const handleQuickMarkDone = async () => {
    if (!selectedTask?.id) return;
    try {
      await api.patch(`/tasks/${selectedTask.id}`, { status: 'done' });
      navigate('/dashboard?sessionComplete=1');
    } catch (error) {
      console.error('Failed to mark done:', error);
      alert('Failed to mark task done');
    }
  };

  const handleSessionCompletion = async (sessionSummary) => {
    if (!sessionId) {
      alert('No active session found. Please start a session first.');
      setShowCompletionModal(false);
      return;
    }

    try {
      const actualDuration = startTime ? Math.round((Date.now() - startTime) / 1000 / 60) : duration;

      await api.post('/sessions/end', {
        session_id: sessionId,
        self_rating: sessionSummary.self_rating,
        notes: sessionSummary.notes,
        energy_level: sessionSummary.energy_level,
        distractions: sessionSummary.distractions,
        focus_quality: sessionSummary.focus_quality,
        actual_duration_minutes: actualDuration
      });

      if (sessionSummary.task_completed === true && selectedTask?.id) {
        await api.patch(`/tasks/${selectedTask.id}`, {
          status: 'done',
          actual_time_accuracy: sessionSummary.actual_time_accuracy
        });
      }

      if (selectedTask?.id && sessionSummary.actual_time_accuracy) {
        await api.post('/tasks/update-estimate-accuracy', {
          task_id: selectedTask.id,
          estimated_minutes: selectedTask.est_minutes,
          actual_accuracy: sessionSummary.actual_time_accuracy
        }).catch((err) => console.log('Accuracy tracking failed:', err));
      }

      setShowCompletionModal(false);
      setSessionId(null);
      setSelectedTask(null);
      setStartTime(null);
      navigate('/dashboard?sessionComplete=1');
    } catch (error) {
      console.error('Failed to end session:', error);
      alert(`Failed to save session: ${error.response?.data?.error || error.message}`);
      setShowCompletionModal(false);
    }
  };

  if (loading) {
    return <LoadingSpinner embedded />;
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Do the work</h2>
        <p className="text-white/55 text-sm mb-4">
          Pick a task and start. A timer is optional — Pomodoro is just one tool, not the point.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MODE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={isRunning}
              onClick={() => selectMode(preset)}
              className={`p-4 rounded-lg backdrop-blur-sm border transition-all text-left disabled:opacity-60 ${
                mode === preset.id
                  ? preset.activeClass
                  : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
              }`}
            >
              <div className="font-semibold mb-1">{preset.title}</div>
              <div className="text-sm opacity-80">{preset.subtitle}</div>
            </button>
          ))}
        </div>
      </div>

      {selectedTask && !isRunning && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="text-white font-medium text-sm truncate">{selectedTask.title}</div>
            <div className="text-white/45 text-xs mt-0.5">
              {suggestsFocusHelp(selectedTask)
                ? 'Might feel better with a protected block — still fine to just knock it out.'
                : 'Looks like a quick win — mark done anytime.'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleQuickMarkDone}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 rounded-lg text-sm font-medium shrink-0"
          >
            <CheckCircle size={16} />
            Mark done
          </button>
        </div>
      )}

      <TimerDisplay
        duration={duration}
        isRunning={isRunning}
        selectedTask={selectedTask}
        mode={mode}
        onStart={handleStart}
        onPause={handlePause}
        onReset={handleReset}
        onComplete={handleTimerComplete}
        onCompleteTaskEarly={() => {
          setIsRunning(false);
          setShowCompletionModal(true);
        }}
      />

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">Environment</h3>
          <button
            onClick={() => setShowCustomEnvironmentModal(true)}
            className="flex items-center gap-2 px-3 py-2 backdrop-blur-sm bg-white/10 hover:bg-white/15 border border-white/20 text-white rounded-lg transition-all text-sm"
          >
            <Plus size={16} />
            Custom
          </button>
        </div>

        {learningTip && (
          <div className="mb-4 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            <div className="font-semibold text-emerald-200 mb-1 flex items-center gap-2">
              <Brain size={16} />
              Learned for you
              {learningConfidence !== 'low' && (
                <span className="text-[10px] uppercase tracking-wide text-emerald-200/70">
                  {learningConfidence} confidence
                </span>
              )}
            </div>
            <p className="text-emerald-100/90 leading-relaxed">{learningTip}</p>
            {learningReasons.length > 0 && (
              <p className="text-emerald-100/55 text-xs mt-1.5">
                Why: {learningReasons.join(' · ')}
              </p>
            )}
            <p className="text-emerald-100/50 text-xs mt-2">Suggested toggles are pre-selected — change anything you like.</p>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: 'music', icon: Music, label: 'Music' },
            { key: 'darkRoom', icon: Moon, label: 'Dark Room' },
            { key: 'silence', icon: Volume2, label: 'Silence' },
            { key: 'phoneOff', icon: Smartphone, label: 'Phone lock' }
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setEnvironment({ ...environment, [key]: !environment[key] })}
              className={`p-4 rounded-lg backdrop-blur-sm border transition-all duration-200 ${
                environment[key]
                  ? 'bg-blue-500/20 border-blue-400/30 text-blue-200'
                  : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'
              }`}
            >
              <Icon size={24} className="mx-auto mb-2" />
              <div className="text-sm">{label}</div>
            </button>
          ))}
        </div>
        <p className="text-white/35 text-xs mt-3">
          Phone lock today is a commitment cue. True iPhone lock (Spotify + MindSprint only until the task is done) is on the roadmap.
        </p>

        {customEnvironments.length > 0 && (
          <div className="mt-4">
            <h4 className="text-white/80 text-sm font-medium mb-3">Custom Environments</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {customEnvironments.map((env) => {
                const IconComponent = getEnvIcon(env.icon_name);
                const envKey = env.name.toLowerCase().replace(/\s+/g, '_');

                return (
                  <button
                    key={env.id}
                    onClick={() => setEnvironment({ ...environment, [envKey]: !environment[envKey] })}
                    className={`p-3 rounded-lg backdrop-blur-sm border transition-all duration-200 ${
                      environment[envKey]
                        ? 'bg-violet-500/20 border-violet-400/30 text-violet-200'
                        : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    <IconComponent size={20} className="mx-auto mb-1" />
                    <div className="text-xs truncate">{env.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mb-8">
        <MusicProductivityTracker sessionData={{ sessionId }} />
      </div>

      {quickWins.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <Zap className="text-yellow-400" size={24} />
            Quick Wins
            <span className="text-sm font-normal text-white/60">(15min or less, high priority)</span>
          </h3>
          <div className="grid gap-3">
            {quickWins.map((task) => (
              <button
                key={task.id}
                onClick={() => setSelectedTask(task)}
                className={`p-4 rounded-lg backdrop-blur-sm border text-left transition-all duration-200 ${
                  selectedTask?.id === task.id
                    ? 'bg-yellow-500/20 border-yellow-400/30 text-yellow-200'
                    : 'bg-yellow-500/10 border-yellow-400/20 text-white/90 hover:bg-yellow-500/15'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">{task.title}</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="bg-yellow-500/20 text-yellow-200 px-2 py-1 rounded text-xs">P{task.priority}</span>
                    <span className="bg-orange-500/20 text-orange-200 px-2 py-1 rounded text-xs">U{task.urgency}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm opacity-70">
                  <Clock size={14} />
                  {task.est_minutes} minutes
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Target size={24} />
          Select Task
        </h3>
        {tasks.length === 0 ? (
          <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg p-8 text-center">
            <p className="text-white/70 mb-2 font-medium">Nothing in MindSprint yet</p>
            <p className="text-white/45 text-sm mb-4">
              Capture whatever is rattling around — even half-formed. We&apos;ll help you break it down.
            </p>
            <button
              onClick={() => navigate('/dashboard?capture=1')}
              className="px-6 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 rounded-lg transition-all"
            >
              Add something
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => {
              const projectTasks = getTasksByProject(project.id);
              if (projectTasks.length === 0) return null;
              const isExpanded = expandedProjects[project.id];

              return (
                <div key={project.id} className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl overflow-hidden">
                  <button
                    onClick={() => toggleProject(project.id)}
                    className="w-full p-4 text-left hover:bg-white/5 transition-all duration-200 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-blue-400" />
                      <div>
                        <div className="font-semibold text-white">{project.title}</div>
                        <div className="text-sm text-white/60">
                          {projectTasks.length} task{projectTasks.length !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                  </button>

                  {isExpanded && (
                    <div className="border-t border-white/10 p-4 space-y-2">
                      {projectTasks.map((task) => (
                        <button
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className={`w-full p-3 rounded-lg backdrop-blur-sm border text-left transition-all duration-200 ${
                            selectedTask?.id === task.id
                              ? 'bg-blue-500/20 border-blue-400/30 text-blue-200'
                              : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="font-medium text-sm">{task.title}</div>
                            <div className="flex items-center gap-1">
                              <span className="bg-blue-500/20 text-blue-200 px-2 py-1 rounded text-xs">P{task.priority}</span>
                              <span className="bg-orange-500/20 text-orange-200 px-2 py-1 rounded text-xs">U{task.urgency}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs opacity-70">
                            <Clock size={12} />
                            {task.est_minutes} minutes
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {unassignedTasks.length > 0 && (
              <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl overflow-hidden">
                <div className="p-4 font-semibold text-white">Unassigned</div>
                <div className="border-t border-white/10 p-4 space-y-2">
                  {unassignedTasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`w-full p-3 rounded-lg border text-left ${
                        selectedTask?.id === task.id
                          ? 'bg-blue-500/20 border-blue-400/30 text-blue-200'
                          : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                      }`}
                    >
                      {task.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showCustomEnvironmentModal && (
        <CustomEnvironmentModal
          isOpen={showCustomEnvironmentModal}
          onClose={() => setShowCustomEnvironmentModal(false)}
          onEnvironmentSelect={handleCustomEnvironmentSelect}
        />
      )}

      {showCompletionModal && (
        <SessionCompletionModal
          isOpen={showCompletionModal}
          onClose={() => {
            setShowCompletionModal(false);
            setIsRunning(false);
          }}
          onSubmit={handleSessionCompletion}
          sessionData={{ sessionId, duration, mode }}
          taskData={selectedTask}
        />
      )}
    </main>
  );
}
