import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import ManualTaskModal from './ManualTaskModal';
import { ArrowLeft, Clock, Flag, Trash2, Target, Plus, Repeat, LayoutTemplate } from 'lucide-react';
import { getPriorityColor } from '../utils/colors';

export default function ProjectView() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddTask, setShowAddTask] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const [projectRes, tasksRes] = await Promise.all([
        api.get(`/dashboard/projects/${projectId}`),
        api.get(`/tasks?project_id=${projectId}`)
      ]);

      if (!projectRes.data.project) {
        navigate('/dashboard');
        return;
      }

      setProject(projectRes.data.project);
      setTasks(tasksRes.data.tasks || []);
    } catch (error) {
      console.error('Failed to load project:', error);
      if (error.response?.status === 404) {
        navigate('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    try {
      await api.delete(`/tasks/${taskId}`);
      await loadProject();
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Failed to delete task');
    }
  };

  const handleStartSession = (taskId, taskTitle) => {
    navigate(`/focus?taskId=${taskId}&taskTitle=${encodeURIComponent(taskTitle)}`);
  };

  if (loading) {
    return <LoadingSpinner embedded />;
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-white/60">Project not found</div>
      </div>
    );
  }

  const todoTasks = tasks.filter(t => t.status === 'todo');
  const doingTasks = tasks.filter(t => t.status === 'doing');
  const doneTasks = tasks.filter(t => t.status === 'done');
  const progress = tasks.length > 0 ? (doneTasks.length / tasks.length) * 100 : 0;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <button
          onClick={() => navigate('/projects')}
          className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-all"
        >
          <ArrowLeft size={20} />
          Back to Projects
        </button>

        <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-8 mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">{project.title}</h1>
          <p className="text-white/70 text-lg mb-6">{project.description || 'No description'}</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-1">{tasks.length}</div>
              <div className="text-white/60 text-sm">Total Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-1">{doneTasks.length}</div>
              <div className="text-white/60 text-sm">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-white mb-1">{Math.round(progress)}%</div>
              <div className="text-white/60 text-sm">Progress</div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={async () => {
                setSavingTemplate(true);
                try {
                  await api.post('/templates/projects', {
                    name: project.title + ' Template',
                    description: project.description,
                    icon: project.icon || '',
                    tasks: tasks.map((t, i) => ({ title: t.title, description: t.description, est_minutes: t.est_minutes, priority: t.priority, urgency: t.urgency, sort_order: i })),
                  });
                  alert('Project saved as template!');
                } catch (err) {
                  console.error('Failed to save as template:', err);
                  alert('Failed to save as template.');
                } finally {
                  setSavingTemplate(false);
                }
              }}
              disabled={savingTemplate}
              className="flex items-center gap-2 px-4 py-2 backdrop-blur-md bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-200 rounded-lg transition-all text-sm disabled:opacity-50"
            >
              <LayoutTemplate size={16} />
              {savingTemplate ? 'Saving...' : 'Save as Template'}
            </button>
          </div>

          <div className="mt-4">
            <div className="w-full bg-white/10 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Tasks List */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Tasks</h2>
            <button
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-4 py-2 rounded-xl transition-all text-sm font-medium"
            >
              <Plus size={16} />
              Add Task
            </button>
          </div>
          
          {tasks.length === 0 ? (
            <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-12 text-center">
              <div className="text-white/40 mb-4">No tasks in this project</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* To Do Section */}
              {todoTasks.length > 0 && (
                <div>
                  <h3 className="text-white/80 font-semibold mb-3">To Do ({todoTasks.length})</h3>
                  <div className="space-y-3">
                    {todoTasks.map(task => (
                      <TaskCard 
                        key={task.id} 
                        task={task} 
                        onDelete={handleDeleteTask} 
                        onStartSession={handleStartSession}
                        getPriorityColor={getPriorityColor}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* In Progress Section */}
              {doingTasks.length > 0 && (
                <div>
                  <h3 className="text-white/80 font-semibold mb-3">In Progress ({doingTasks.length})</h3>
                  <div className="space-y-3">
                    {doingTasks.map(task => (
                      <TaskCard 
                        key={task.id} 
                        task={task} 
                        onDelete={handleDeleteTask} 
                        onStartSession={handleStartSession}
                        getPriorityColor={getPriorityColor}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Done Section */}
              {doneTasks.length > 0 && (
                <div>
                  <h3 className="text-white/80 font-semibold mb-3">Done ({doneTasks.length})</h3>
                  <div className="space-y-3">
                    {doneTasks.map(task => (
                      <TaskCard 
                        key={task.id} 
                        task={task} 
                        onDelete={handleDeleteTask} 
                        onStartSession={handleStartSession}
                        getPriorityColor={getPriorityColor}
                        completed={true}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {showAddTask && (
          <ManualTaskModal
            projectId={projectId}
            onComplete={loadProject}
            onClose={() => setShowAddTask(false)}
          />
        )}
      </main>
  );
}

function TaskCard({ task, onDelete, onStartSession, getPriorityColor, completed }) {
  return (
    <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg p-4 hover:bg-white/15 transition-all group">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-start gap-3 mb-2">
            <h4 className={`font-medium flex-1 ${completed ? 'text-white/50 line-through' : 'text-white'}`}>
              {task.title}
            </h4>
            <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${getPriorityColor(task.priority)}`}>
              P{task.priority}
            </span>
          </div>
          
          {task.description && (
            <p className={`text-sm mb-3 ${completed ? 'text-white/40' : 'text-white/60'}`}>
              {task.description}
            </p>
          )}

          <div className="flex items-center gap-4 text-sm text-white/50">
            <span className="flex items-center gap-1">
              <Clock size={14} />
              {task.est_minutes}m
            </span>
            {task.urgency && (
              <span className="flex items-center gap-1">
                <Flag size={14} />
                U{task.urgency}
              </span>
            )}
            {task.is_recurring && (
              <span className="flex items-center gap-1 text-purple-300">
                <Repeat size={14} />
                Recurring
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-4">
          {!completed && (task.status === 'todo' || task.status === 'doing') && (
            <button
              onClick={() => onStartSession(task.id, task.title)}
              className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-200 rounded transition-all opacity-0 group-hover:opacity-100"
              title="Start Focus Session"
            >
              <Target size={18} />
            </button>
          )}
          <button
            onClick={() => onDelete(task.id)}
            className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded transition-all opacity-0 group-hover:opacity-100"
            title="Delete Task"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

