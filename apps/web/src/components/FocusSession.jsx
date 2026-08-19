import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import CustomEnvironmentModal from './CustomEnvironmentModal';
import MusicProductivityTracker from './MusicProductivityTracker';
import SessionCompletionModal from './SessionCompletionModal';
import TimerDisplay from './TimerDisplay';
import LoadingSpinner from './LoadingSpinner';
import { getEnvIcon } from '../utils/iconMap';
import { Music, Moon, Volume2, Smartphone, ChevronDown, ChevronRight, Zap, Clock, Target, Plus } from 'lucide-react';

export default function FocusSession() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [mode, setMode] = useState('pomodoro');
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

  useEffect(() => {
    if (selectedTask?.est_minutes && !isRunning) {
      setDuration(selectedTask.est_minutes);
    }
  }, [selectedTask, isRunning]);

  useEffect(() => {
    const load = async () => {
      try {
        const [tasksRes, projectsRes, envRes] = await Promise.all([
          api.get('/tasks'),
          api.get('/projects'),
          api.get('/custom-environments').catch(() => ({ data: { environments: [] } }))
        ]);

        const incompleteTasks = (tasksRes.data.tasks || []).filter((t) => t.status !== 'done');
        setTasks(incompleteTasks);
        setProjects(projectsRes.data.projects || []);
        setCustomEnvironments(envRes.data.environments || []);
        calculateQuickWins(incompleteTasks);

        const taskId = searchParams.get('taskId');
        if (taskId) {
          const task = incompleteTasks.find((t) => String(t.id) === String(taskId));
          if (task) {
            setSelectedTask(task);
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

  const handleStart = async () => {
    try {
      const response = await api.post('/sessions/start', {
        task_id: selectedTask?.id || null,
        mode,
        duration_minutes: duration,
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
      navigate('/reflections');
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
    <main className="max-w-4xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-4">Focus Mode</h2>
        <div className="flex gap-4">
          <button
            onClick={() => { setMode('pomodoro'); setDuration(25); }}
            className={`flex-1 p-4 rounded-lg backdrop-blur-sm border transition-all ${
              mode === 'pomodoro'
                ? 'bg-purple-500/30 border-purple-400/50 text-white'
                : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
            }`}
          >
            <div className="font-semibold mb-1">Pomodoro</div>
            <div className="text-sm opacity-80">25 min focus</div>
          </button>
          <button
            onClick={() => { setMode('adhd'); setDuration(15); }}
            className={`flex-1 p-4 rounded-lg backdrop-blur-sm border transition-all ${
              mode === 'adhd'
                ? 'bg-blue-500/30 border-blue-400/50 text-white'
                : 'bg-white/10 border-white/20 text-white/70 hover:bg-white/15'
            }`}
          >
            <div className="font-semibold mb-1">ADHD Sprint</div>
            <div className="text-sm opacity-80">15 min burst</div>
          </button>
        </div>
      </div>

      <TimerDisplay
        duration={duration}
        isRunning={isRunning}
        selectedTask={selectedTask}
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: 'music', icon: Music, label: 'Music' },
            { key: 'darkRoom', icon: Moon, label: 'Dark Room' },
            { key: 'silence', icon: Volume2, label: 'Silence' },
            { key: 'phoneOff', icon: Smartphone, label: 'Phone Off' }
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
                        ? 'bg-purple-500/20 border-purple-400/30 text-purple-200'
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
            <p className="text-white/60 mb-4">No tasks available</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 rounded-lg transition-all"
            >
              Add Tasks
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
