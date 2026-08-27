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
import { needsFocusSession } from '../utils/workMode';
import {
  Plus, LayoutGrid, List, Trash2, FolderPlus, Target,
  AlertTriangle, CalendarClock, Clock, Zap, Brain, CheckCircle
} from 'lucide-react';
import { formatDue, deadlineBadge } from '../utils/deadlines';

function TodayPlanCard({ task, onStart, onQuickComplete }) {
  const badge = deadlineBadge(task);
  const focusTask = needsFocusSession(task);

  return (
    <div className="flex items-center gap-3 backdrop-blur-sm bg-white/10 border border-white/15 rounded-xl px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="text-white font-medium text-sm truncate">{task.title}</div>
        <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-white/45">
          <span>{task.est_minutes || 30}m</span>
          {task.project_title && <span>· {task.project_title}</span>}
          <span className={`px-1.5 py-0.5 rounded border text-[10px] ${
            focusTask ? 'border-purple-400/30 text-purple-200/80' : 'border-emerald-400/30 text-emerald-200/80'
          }`}>
            {focusTask ? 'Focus session' : 'Quick'}
          </span>
          {badge && (
            <span className={`px-1.5 py-0.5 rounded border text-[10px] ${badge.className}`}>{badge.label}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!focusTask && (
          <button
            onClick={() => onQuickComplete(task)}
            className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded-lg text-xs font-medium"
          >
            Done
          </button>
        )}
        <button
          onClick={() => onStart(task.id, task.title)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
            focusTask
              ? 'bg-green-500/20 hover:bg-green-500/30 text-green-200'
              : 'bg-white/10 hover:bg-white/15 text-white/70'
          }`}
        >
          {focusTask ? 'Focus' : 'Timer'}
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

    if (needsFocusSession(task)) {
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
    navigate(`/focus?taskId=${taskId}&taskTitle=${encodeURIComponent(taskTitle)}`);
  };

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
              <div className="text-emerald-100 font-medium text-sm">Focus session saved</div>
              <p className="text-emerald-100/70 text-xs">Nice work — your progress is on the dashboard.</p>
            </div>
          </div>
        )}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1">Today</h2>
            <p className="text-white/60 text-sm">
              {today
                ? `${freeHours}h ${freeMins}m free · ${today.plan?.length || 0} suggested`
                : 'Your ADHD-friendly microtasks'}
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
              <span className="hidden sm:inline">Task</span>
            </button>
            <button
              onClick={() => setShowAIModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg text-sm"
            >
              <Plus size={16} />
              <span>AI</span>
            </button>
          </div>
        </div>

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
