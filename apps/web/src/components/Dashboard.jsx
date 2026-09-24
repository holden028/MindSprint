import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import KanbanBoard from './KanbanBoard';
import TaskBreakdown from './TaskBreakdown';
import TaskFeedbackModal from './TaskFeedbackModal';
import QuickCompleteModal from './QuickCompleteModal';
import ManualTaskModal from './ManualTaskModal';
import ManualProjectModal from './ManualProjectModal';
import { suggestsFocusHelp, workModeBadge, doActionLabel } from '../utils/workMode';
import {
  Plus, LayoutGrid, List, Trash2, FolderPlus, Target,
  AlertTriangle, CalendarClock, Clock, Zap, Brain, CheckCircle, Sparkles
} from 'lucide-react';
import { formatDue, deadlineBadge } from '../utils/deadlines';

function TodayPlanCard({ task, onStart, onQuickComplete }) {
  const badge = deadlineBadge(task);
  const modeBadge = workModeBadge(task);

  return (
    <div className="flex items-center gap-3 backdrop-blur-sm bg-white/10 border border-white/15 rounded-xl px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium text-sm truncate">{task.title}</div>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-white/45">
          <span>{task.est_minutes || 30}m</span>
          {task.project_title && <span>· {task.project_title}</span>}
          <span
            title={modeBadge.title}
            className={`px-1.5 py-0.5 rounded border text-[10px] ${modeBadge.className}`}
          >
            {modeBadge.label}
          </span>
          {badge && (
            <span className={`px-1.5 py-0.5 rounded border text-[10px] ${badge.className}`}>{badge.label}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onQuickComplete(task)}
          className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white/70 rounded-lg text-xs font-medium"
        >
          Done
        </button>
        <button
          onClick={() => onStart(task.id, task.title)}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-100"
        >
          {doActionLabel(task)}
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('kanban');
  const [showAIModal, setShowAIModal] = useState(false);
  const [showManualTaskModal, setShowManualTaskModal] = useState(false);
  const [showManualProjectModal, setShowManualProjectModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showQuickCompleteModal, setShowQuickCompleteModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [sessionCompleteBanner, setSessionCompleteBanner] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    if (searchParams.get('sessionComplete') === '1') {
      setSessionCompleteBanner(true);
      setSearchParams({}, { replace: true });
      const timer = setTimeout(() => setSessionCompleteBanner(false), 6000);
      return () => clearTimeout(timer);
    }
    if (searchParams.get('capture') === '1') {
      setShowManualTaskModal(true);
      setSearchParams({}, { replace: true });
    }
    return undefined;
  }, [searchParams, setSearchParams]);

  const loadDashboardData = async () => {
    try {
      const response = await api.get('/dashboard/today');
      setTasks(response.data.tasks || []);
      setProjects(response.data.projects || []);
      setToday(response.data.today || null);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskComplete = async (taskId) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Soft path: longer tasks can still leave a short reflection, but never block Done
    if (suggestsFocusHelp(task)) {
      setSelectedTask(task);
      setShowFeedbackModal(true);
      return;
    }

    setSelectedTask(task);
    setShowQuickCompleteModal(true);
  };

  const handleQuickComplete = (task) => {
    setSelectedTask(task);
    setShowQuickCompleteModal(true);
  };

  const handleQuickCompleteDone = async () => {
    setShowQuickCompleteModal(false);
    setSelectedTask(null);
    await loadDashboardData();
  };

  const handleFeedbackSubmit = async () => {
    setShowFeedbackModal(false);
    setSelectedTask(null);
    await loadDashboardData();
  };

  const handleStartSession = (taskId, taskTitle) => {
    navigate(`/focus?taskId=${taskId}&taskTitle=${encodeURIComponent(taskTitle)}&mode=free`);
  };

  const nextUp = today?.plan?.[0] || tasks.find((t) => t.status === 'todo' || t.status === 'doing') || null;
  const openCount = tasks.filter((t) => t.status !== 'done').length;
  const showCaptureNudge = openCount < 3;

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      await loadDashboardData();
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Failed to delete task');
    }
  };

  if (loading) return <LoadingSpinner embedded />;

  const freeHours = today ? Math.floor((today.free_minutes || 0) / 60) : 0;
  const freeMins = today ? (today.free_minutes || 0) % 60 : 0;

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-8">
        {sessionCompleteBanner && (
          <div className="mb-6 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-4 py-3 flex items-center gap-3">
            <CheckCircle className="text-emerald-300 shrink-0" size={20} />
            <div>
              <div className="text-emerald-100 font-medium text-sm">Nice work</div>
              <p className="text-emerald-100/70 text-xs">Progress saved — pick the next thing when you&apos;re ready.</p>
            </div>
          </div>
        )}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1">Today</h2>
            <p className="text-white/60 text-sm">
              {today
                ? `${freeHours}h ${freeMins}m free · ${today.plan?.length || 0} suggested`
                : 'Capture it. Do it. MindSprint holds the rest.'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex bg-white/10 rounded-lg p-1">
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-2 rounded ${viewMode === 'kanban' ? 'bg-white/20 text-white' : 'text-white/60'}`}
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-white/20 text-white' : 'text-white/60'}`}
              >
                <List size={18} />
              </button>
            </div>
            <button
              onClick={() => setShowManualProjectModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/10 border border-white/20 text-white rounded-lg text-sm"
            >
              <FolderPlus size={16} />
              <span className="hidden sm:inline">Project</span>
            </button>
            <button
              onClick={() => setShowManualTaskModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/10 border border-white/20 text-white rounded-lg text-sm"
            >
              <Target size={16} />
              <span className="hidden sm:inline">Capture</span>
            </button>
            <button
              onClick={() => setShowAIModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 text-white rounded-lg text-sm"
            >
              <Plus size={16} />
              <span>AI</span>
            </button>
          </div>
        </div>

        {nextUp && (
          <div className="mb-6 rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-transparent px-5 py-5">
            <div className="flex items-center gap-2 text-emerald-200/90 text-xs font-semibold uppercase tracking-wide mb-2">
              <Sparkles size={14} />
              Do this next
            </div>
            <h3 className="text-white text-xl font-semibold mb-1">{nextUp.title}</h3>
            <p className="text-white/50 text-sm mb-4">
              {suggestsFocusHelp(nextUp)
                ? 'A protected block can help — or just start and mark it done when you finish.'
                : 'Small enough to knock out. Start, or mark done if you already did.'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleStartSession(nextUp.id, nextUp.title)}
                className="px-4 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 transition-colors"
              >
                {doActionLabel(nextUp)}
              </button>
              <button
                type="button"
                onClick={() => handleQuickComplete(nextUp)}
                className="px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white/80 text-sm font-medium hover:bg-white/15"
              >
                Already done
              </button>
            </div>
          </div>
        )}

        {showCaptureNudge && (
          <div className="mb-6 rounded-xl border border-white/15 bg-white/5 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium">Got something bouncing in your head?</div>
              <p className="text-white/45 text-xs mt-0.5">
                Dump it into MindSprint now — even messy. Empty brain, clearer sprint.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowManualTaskModal(true)}
                className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium"
              >
                Quick capture
              </button>
              <button
                type="button"
                onClick={() => setShowAIModal(true)}
                className="px-3 py-2 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-100 text-xs font-medium"
              >
                Paste to AI
              </button>
            </div>
          </div>
        )}

        {!nextUp && openCount === 0 && (
          <div className="mb-6 rounded-2xl border border-dashed border-white/20 bg-white/5 px-5 py-8 text-center">
            <p className="text-white font-medium mb-1">MindSprint is empty — that&apos;s the cue to capture</p>
            <p className="text-white/45 text-sm mb-4 max-w-md mx-auto">
              Add the thing you&apos;ve been avoiding, the email you keep rereading, or a half-formed idea. We&apos;ll help you start.
            </p>
            <button
              type="button"
              onClick={() => setShowManualTaskModal(true)}
              className="px-4 py-2.5 rounded-lg bg-emerald-500 text-white text-sm font-semibold"
            >
              Add your first thing
            </button>
          </div>
        )}

        {today?.learning_tip && (
          <div className="mb-6 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 flex gap-3 items-start">
            <Brain className="text-emerald-300 shrink-0 mt-0.5" size={18} />
            <div>
              <div className="text-emerald-200 text-sm font-semibold mb-0.5">Focus tip</div>
              <p className="text-emerald-100/90 text-sm leading-relaxed">{today.learning_tip}</p>
            </div>
          </div>
        )}

        {/* Deadline signals */}
        {today && (today.overdue?.length > 0 || today.due_today?.length > 0 || today.start_today?.length > 0) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {today.overdue?.length > 0 && (
              <div className="bg-red-500/15 border border-red-400/30 rounded-xl p-3">
                <div className="flex items-center gap-2 text-red-200 text-sm font-semibold mb-2">
                  <AlertTriangle size={16} /> Overdue ({today.overdue.length})
                </div>
                <ul className="space-y-1">
                  {today.overdue.slice(0, 3).map((t) => (
                    <li key={t.id} className="text-xs text-red-100/80 truncate">{t.title}</li>
                  ))}
                </ul>
              </div>
            )}
            {today.due_today?.length > 0 && (
              <div className="bg-orange-500/15 border border-orange-400/30 rounded-xl p-3">
                <div className="flex items-center gap-2 text-orange-200 text-sm font-semibold mb-2">
                  <CalendarClock size={16} /> Due today ({today.due_today.length})
                </div>
                <ul className="space-y-1">
                  {today.due_today.slice(0, 3).map((t) => (
                    <li key={t.id} className="text-xs text-orange-100/80 truncate">
                      {t.title} · {formatDue(t.due_at)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {today.start_today?.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-400/25 rounded-xl p-3">
                <div className="flex items-center gap-2 text-amber-200 text-sm font-semibold mb-2">
                  <Clock size={16} /> Start by today ({today.start_today.length})
                </div>
                <ul className="space-y-1">
                  {today.start_today.slice(0, 3).map((t) => (
                    <li key={t.id} className="text-xs text-amber-100/70 truncate">{t.title}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Suggested plan from free time */}
        {today?.plan?.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={18} className="text-purple-300" />
              <h3 className="text-lg font-semibold text-white">Suggested for your free time</h3>
              <span className="text-xs text-white/40">
                ~{today.plan_minutes}m of {today.free_minutes}m free
              </span>
            </div>
            <div className="space-y-2">
              {today.plan.map((t) => (
                <TodayPlanCard
                  key={t.id}
                  task={t}
                  onStart={handleStartSession}
                  onQuickComplete={handleQuickComplete}
                />
              ))}
            </div>
          </div>
        )}

        <h3 className="text-lg font-semibold text-white mb-4">All open tasks</h3>

        {viewMode === 'kanban' ? (
          <KanbanBoard
            tasks={tasks}
            onTaskComplete={handleTaskComplete}
            onQuickComplete={handleQuickComplete}
            onStartSession={handleStartSession}
            onDeleteTask={handleDeleteTask}
            onRefresh={loadDashboardData}
          />
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const badge = deadlineBadge(task);
              return (
                <div
                  key={task.id}
                  className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg p-4 hover:bg-white/15 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-white font-medium mb-1">{task.title}</h3>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-white/50">
                        <span>{task.est_minutes} min</span>
                        <span>P{task.priority}</span>
                        {badge && (
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] ${badge.className}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleStartSession(task.id, task.title)}
                        className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-200 rounded-lg"
                      >
                        <Plus size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {projects.length > 0 && (
          <div className="mt-12">
            <h3 className="text-xl font-bold text-white mb-4">Projects</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg p-5 hover:bg-white/15 cursor-pointer"
                >
                  <h4 className="text-white font-semibold mb-1">{project.title}</h4>
                  <p className="text-white/60 text-sm mb-3 line-clamp-2">{project.description}</p>
                  <div className="flex justify-between text-sm text-white/50">
                    <span>{project.task_count} tasks</span>
                    <span>{project.completed_tasks} done</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {showAIModal && (
        <TaskBreakdown onComplete={() => { setShowAIModal(false); loadDashboardData(); }} onClose={() => setShowAIModal(false)} />
      )}
      {showManualTaskModal && (
        <ManualTaskModal onComplete={() => { setShowManualTaskModal(false); loadDashboardData(); }} onClose={() => setShowManualTaskModal(false)} />
      )}
      {showManualProjectModal && (
        <ManualProjectModal onSuccess={() => { setShowManualProjectModal(false); loadDashboardData(); }} onClose={() => setShowManualProjectModal(false)} />
      )}
      {showQuickCompleteModal && selectedTask && (
        <QuickCompleteModal
          task={selectedTask}
          onClose={() => { setShowQuickCompleteModal(false); setSelectedTask(null); }}
          onComplete={handleQuickCompleteDone}
        />
      )}
      {showFeedbackModal && selectedTask && (
        <TaskFeedbackModal
          task={selectedTask}
          onClose={() => { setShowFeedbackModal(false); setSelectedTask(null); }}
          onSubmit={handleFeedbackSubmit}
        />
      )}
    </>
  );
}
