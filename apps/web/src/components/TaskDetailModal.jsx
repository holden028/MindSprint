import React from 'react';
import { X, Clock, AlertCircle, Target, FileText, Brain, CheckCircle } from 'lucide-react';
import Modal from './Modal';
import { getUrgencyColor } from '../utils/colors';

export default function TaskDetailModal({ task, onClose, onStartSession, onDeleteTask, onCompleteTask }) {
  if (!task) return null;

  const getStatusColor = (status) => {
    switch (status) {
      case 'todo': return 'text-blue-400 bg-blue-500/20 border-blue-400/30'
      case 'doing': return 'text-yellow-400 bg-yellow-500/20 border-yellow-400/30'
      case 'done': return 'text-green-400 bg-green-500/20 border-green-400/30'
      default: return 'text-gray-400 bg-gray-500/20 border-gray-400/30'
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Modal className="max-w-4xl p-8">
        <div className="flex justify-between items-start mb-6">
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-white mb-2">{task.title}</h2>
            <div className="flex items-center gap-3 text-white/60">
              <span className="capitalize">{task.status}</span>
              <span>•</span>
              <span>Created {formatDate(task.created_at)}</span>
              {task.updated_at !== task.created_at && (
                <>
                  <span>•</span>
                  <span>Updated {formatDate(task.updated_at)}</span>
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

        {/* Task Description */}
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <FileText className="text-blue-400" size={20} />
            What Needs to Be Done
          </h3>
          <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-6">
            {task.description ? (
              <div className="text-white/90 leading-relaxed whitespace-pre-wrap">
                {task.description}
              </div>
            ) : (
              <div className="text-white/60 italic">
                No detailed description provided. This task needs more context to be actionable.
              </div>
            )}
          </div>
        </div>

        {/* Task Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Priority & Urgency */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-3">Priority & Urgency</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <AlertCircle className="text-orange-400" size={20} />
                <div className="flex-1">
                  <div className="text-white/80 text-sm">Priority</div>
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getUrgencyColor(task.priority)}`}>
                    P{task.priority} - {task.priority === 1 ? 'Low' : task.priority === 2 ? 'Medium-Low' : task.priority === 3 ? 'Medium' : task.priority === 4 ? 'High' : 'Critical'}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Target className="text-red-400" size={20} />
                <div className="flex-1">
                  <div className="text-white/80 text-sm">Urgency</div>
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getUrgencyColor(task.urgency)}`}>
                    U{task.urgency} - {task.urgency === 1 ? 'Low' : task.urgency === 2 ? 'Medium-Low' : task.urgency === 3 ? 'Medium' : task.urgency === 4 ? 'High' : 'Urgent'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Time & Status */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-white mb-3">Time & Status</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Clock className="text-blue-400" size={20} />
                <div className="flex-1">
                  <div className="text-white/80 text-sm">Estimated Time</div>
                  <div className="text-white font-medium">{task.est_minutes} minutes</div>
                </div>
              </div>
              {task.actual_minutes && (
                <div className="flex items-center gap-3">
                  <CheckCircle className="text-green-400" size={20} />
                  <div className="flex-1">
                    <div className="text-white/80 text-sm">Actual Time</div>
                    <div className="text-white font-medium">{task.actual_minutes} minutes</div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-blue-400 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                </div>
                <div className="flex-1">
                  <div className="text-white/80 text-sm">Status</div>
                  <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(task.status)}`}>
                    {task.status === 'todo' ? 'To Do' : task.status === 'doing' ? 'In Progress' : 'Completed'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Audit Trail */}
        {(task.original_title || task.original_description || task.ai_interpretations || task.ai_questions_asked) && (
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Brain className="text-purple-400" size={20} />
              AI Audit Trail
            </h3>
            <div className="space-y-4">
              {task.original_title && task.original_title !== task.title && (
                <div className="backdrop-blur-sm bg-purple-500/10 border border-purple-400/30 rounded-lg p-4">
                  <div className="text-white/80 text-sm font-medium mb-1">Original Title:</div>
                  <div className="text-white/70 text-sm">{task.original_title}</div>
                </div>
              )}
              {task.original_description && task.original_description !== task.description && (
                <div className="backdrop-blur-sm bg-purple-500/10 border border-purple-400/30 rounded-lg p-4">
                  <div className="text-white/80 text-sm font-medium mb-1">Original Description:</div>
                  <div className="text-white/70 text-sm whitespace-pre-wrap">{task.original_description}</div>
                </div>
              )}
              {task.ai_interpretations && (
                <div className="backdrop-blur-sm bg-blue-500/10 border border-blue-400/30 rounded-lg p-4">
                  <div className="text-white/80 text-sm font-medium mb-2">AI Interpretations:</div>
                  <div className="text-white/70 text-sm whitespace-pre-wrap">{JSON.stringify(task.ai_interpretations, null, 2)}</div>
                </div>
              )}
              {task.ai_questions_asked && (
                <div className="backdrop-blur-sm bg-green-500/10 border border-green-400/30 rounded-lg p-4">
                  <div className="text-white/80 text-sm font-medium mb-2">Questions Asked:</div>
                  <div className="text-white/70 text-sm">
                    {Array.isArray(task.ai_questions_asked) ? (
                      <ul className="list-disc list-inside space-y-1">
                        {task.ai_questions_asked.map((q, index) => (
                          <li key={index}>{q.question}</li>
                        ))}
                      </ul>
                    ) : (
                      JSON.stringify(task.ai_questions_asked, null, 2)
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {task.status === 'todo' && (
            <button
              onClick={() => {
                onStartSession(task);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg font-semibold hover:from-green-600 hover:to-blue-600 transition-all"
            >
              <Clock size={20} />
              Start Focus Session
            </button>
          )}
          {task.status === 'doing' && (
            <button
              onClick={() => {
                onCompleteTask(task);
                onClose();
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-semibold hover:from-green-600 hover:to-emerald-600 transition-all"
            >
              <CheckCircle size={20} />
              Complete Task
            </button>
          )}
          <button
            onClick={() => {
              onDeleteTask(task);
              onClose();
            }}
            className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg transition-all"
          >
            Delete
          </button>
        </div>
    </Modal>
  );
}
