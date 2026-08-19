import React from 'react';
import { X, Target, CheckCircle, Clock, Brain, BarChart3 } from 'lucide-react';
import Modal from './Modal';

export default function ProjectDetailsModal({ project, onClose, onViewTasks }) {
  if (!project) return null;

  const progress = project.task_count > 0 
    ? (project.completed_tasks / project.task_count) * 100 
    : 0;

  const getTagColor = (tag) => {
    const colors = [
      'bg-blue-500/20 text-blue-200 border-blue-400/30',
      'bg-green-500/20 text-green-200 border-green-400/30',
      'bg-purple-500/20 text-purple-200 border-purple-400/30',
      'bg-orange-500/20 text-orange-200 border-orange-400/30',
      'bg-pink-500/20 text-pink-200 border-pink-400/30',
      'bg-yellow-500/20 text-yellow-200 border-yellow-400/30',
      'bg-red-500/20 text-red-200 border-red-400/30',
      'bg-indigo-500/20 text-indigo-200 border-indigo-400/30'
    ];
    return colors[tag.length % colors.length];
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <Modal className="max-w-4xl p-8">
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-white mb-2">{project.title}</h2>
            <div className="flex items-center gap-3 text-white/60">
              <span>Created {formatDate(project.created_at)}</span>
              {project.updated_at !== project.created_at && (
                <>
                  <span>•</span>
                  <span>Updated {formatDate(project.updated_at)}</span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-all ml-4"
          >
            <X className="text-white" size={24} />
          </button>
        </div>

        {/* Project Description */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <Target className="text-blue-400" size={20} />
            Project Description
          </h3>
          <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
            {project.description ? (
              <div className="text-white/90 leading-relaxed whitespace-pre-wrap">
                {project.description}
              </div>
            ) : (
              <div className="text-white/60 italic">
                No description provided for this project.
              </div>
            )}
          </div>
        </div>

        {/* Project Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Target className="text-blue-300" size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{project.task_count || 0}</div>
                <div className="text-white/60 text-sm">Total Tasks</div>
              </div>
            </div>
          </div>

          <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <CheckCircle className="text-green-300" size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{project.completed_tasks || 0}</div>
                <div className="text-white/60 text-sm">Completed</div>
              </div>
            </div>
          </div>

          <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <BarChart3 className="text-purple-300" size={20} />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{Math.round(progress)}%</div>
                <div className="text-white/60 text-sm">Progress</div>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-3">Project Progress</h3>
          <div className="w-full bg-white/20 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-1000"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-sm text-white/60 mt-2">
            <span>{project.completed_tasks || 0} completed</span>
            <span>{project.task_count || 0} total</span>
          </div>
        </div>

        {/* AI Tags */}
        {project.tags && project.tags.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Brain className="text-purple-400" size={20} />
              AI Tags
            </h3>
            <div className="flex flex-wrap gap-2">
              {project.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className={`px-3 py-1 rounded-full text-sm border ${getTagColor(tag)}`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent Tasks */}
        {project.recent_tasks && project.recent_tasks.length > 0 && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Clock className="text-orange-400" size={20} />
              Recent Tasks
            </h3>
            <div className="space-y-3">
              {project.recent_tasks.map((task) => (
                <div
                  key={task.id}
                  className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-white font-medium">{task.title}</h4>
                    <div className="flex items-center gap-2">
                      <span className="bg-blue-500/20 text-blue-200 px-2 py-1 rounded text-xs">
                        P{task.priority}
                      </span>
                      <span className="bg-orange-500/20 text-orange-200 px-2 py-1 rounded text-xs">
                        U{task.urgency}
                      </span>
                    </div>
                  </div>
                  {task.description && (
                    <p className="text-white/70 text-sm mb-2">{task.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-white/60">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {task.est_minutes}m
                    </span>
                    <span className="capitalize">{task.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              onViewTasks(project.id);
              onClose();
            }}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-purple-600 transition-all"
          >
            <Target size={20} />
            View All Tasks
          </button>
          <button
            onClick={onClose}
            className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all"
          >
            Close
          </button>
        </div>
    </Modal>
  );
}
