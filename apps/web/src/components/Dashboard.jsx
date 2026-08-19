import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import KanbanBoard from './KanbanBoard';
import TaskBreakdown from './TaskBreakdown';
import TaskFeedbackModal from './TaskFeedbackModal';
import ManualTaskModal from './ManualTaskModal';
import ManualProjectModal from './ManualProjectModal';
import { Plus, LayoutGrid, List, Trash2, FolderPlus, Target } from 'lucide-react';

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' or 'list'
  const [showAIModal, setShowAIModal] = useState(false);
  const [showManualTaskModal, setShowManualTaskModal] = useState(false);
  const [showManualProjectModal, setShowManualProjectModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const response = await api.get('/dashboard/today');
      setTasks(response.data.tasks || []);
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error('Failed to load dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskComplete = async (taskId) => {
    setSelectedTask(tasks.find(t => t.id === taskId));
    setShowFeedbackModal(true);
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

  if (loading) {
    return <LoadingSpinner embedded />;
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Your Tasks</h2>
            <p className="text-white/60">Manage your ADHD-friendly microtasks</p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* View Toggle */}
            <div className="flex bg-white/10 rounded-lg p-1">
              <button
                onClick={() => setViewMode('kanban')}
                className={`p-2 rounded transition-all ${
                  viewMode === 'kanban' ? 'bg-white/20 text-white' : 'text-white/60'
                }`}
                title="Kanban View"
              >
                <LayoutGrid size={20} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded transition-all ${
                  viewMode === 'list' ? 'bg-white/20 text-white' : 'text-white/60'
                }`}
                title="List View"
              >
                <List size={20} />
              </button>
            </div>

            {/* Manual Creation Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowManualProjectModal(true)}
                className="flex items-center space-x-2 px-4 py-2 backdrop-blur-md bg-white/10 hover:bg-white/15 border border-white/20 text-white rounded-lg transition-all shadow-lg"
                title="Create Project"
              >
                <FolderPlus size={20} />
                <span>Project</span>
              </button>
              
              <button
                onClick={() => setShowManualTaskModal(true)}
                className="flex items-center space-x-2 px-4 py-2 backdrop-blur-md bg-white/10 hover:bg-white/15 border border-white/20 text-white rounded-lg transition-all shadow-lg"
                title="Create Task"
              >
                <Target size={20} />
                <span>Task</span>
              </button>
            </div>

            <button
              onClick={() => setShowAIModal(true)}
              className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-all"
            >
              <Plus size={20} />
              <span>Add Tasks (AI)</span>
            </button>
          </div>
        </div>

        {/* Tasks Display */}
        {viewMode === 'kanban' ? (
          <KanbanBoard 
            tasks={tasks} 
            onTaskComplete={handleTaskComplete}
            onStartSession={handleStartSession}
            onDeleteTask={handleDeleteTask}
            onRefresh={loadDashboardData}
          />
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg p-4 hover:bg-white/15 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-white font-medium mb-1">{task.title}</h3>
                    {task.description && (
                      <p className="text-white/60 text-sm mb-2">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-sm text-white/50">
                      <span>{task.est_minutes} min</span>
                      <span>Priority: {task.priority}</span>
                      <span className="capitalize">{task.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(task.status === 'todo' || task.status === 'doing') && (
                      <button
                        onClick={() => handleStartSession(task.id, task.title)}
                        className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-200 rounded-lg transition-all"
                        title="Start Focus Session"
                      >
                        <Plus size={18} />
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg transition-all"
                      title="Delete Task"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Projects Overview */}
        {projects.length > 0 && (
          <div className="mt-12">
            <h3 className="text-2xl font-bold text-white mb-6">Your Projects</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => navigate(`/projects/${project.id}`)}
                  className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg p-6 hover:bg-white/15 transition-all cursor-pointer"
                >
                  <h4 className="text-white font-semibold mb-2">{project.title}</h4>
                  <p className="text-white/60 text-sm mb-4">{project.description}</p>
                  <div className="flex justify-between text-sm text-white/50">
                    <span>{project.task_count} tasks</span>
                    <span>{project.completed_tasks} completed</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {showAIModal && (
        <TaskBreakdown
          onComplete={() => {
            setShowAIModal(false);
            loadDashboardData();
          }}
          onClose={() => setShowAIModal(false)}
        />
      )}

      {showManualTaskModal && (
        <ManualTaskModal
          onComplete={() => {
            setShowManualTaskModal(false);
            loadDashboardData();
          }}
          onClose={() => setShowManualTaskModal(false)}
        />
      )}

      {showManualProjectModal && (
        <ManualProjectModal
          onSuccess={() => {
            setShowManualProjectModal(false);
            loadDashboardData();
          }}
          onClose={() => setShowManualProjectModal(false)}
        />
      )}

      {showFeedbackModal && selectedTask && (
        <TaskFeedbackModal
          task={selectedTask}
          onClose={() => {
            setShowFeedbackModal(false);
            setSelectedTask(null);
          }}
          onSubmit={handleFeedbackSubmit}
        />
      )}
    </>
  );
}

