import React, { useState } from 'react';
import { Clock, Flag, Timer, Trash2, Eye, Repeat, CheckCircle } from 'lucide-react';
import TaskDetailModal from './TaskDetailModal';
import api from '../services/api';
import { getPriorityColor, COLUMN_DOT_COLORS } from '../utils/colors';
import { deadlineBadge } from '../utils/deadlines';
import { needsFocusSession } from '../utils/workMode';

export default function KanbanBoard({ tasks, onTaskComplete, onQuickComplete, onStartSession, onDeleteTask, onRefresh }) {
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const columns = [
    { id: 'todo', title: 'To Do', color: 'blue' },
    { id: 'doing', title: 'In Progress', color: 'yellow' },
    { id: 'done', title: 'Done', color: 'green' }
  ];

  const handleDragStart = (e, taskId) => {
    e.dataTransfer.setData('taskId', taskId);
    setIsDragging(true);
  };

  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    setIsDragging(false);
    const dragged = tasks.find((t) => t.id === taskId);
    if (dragged && dragged.can_edit === false) return;

    if (newStatus === 'done') {
      if (needsFocusSession(dragged)) {
        try {
          await api.patch(`/tasks/${taskId}`, { status: newStatus });
          onTaskComplete(taskId);
        } catch (error) {
          console.error('Failed to update task:', error);
        }
      } else {
        onQuickComplete(dragged);
      }
      return;
    }

    try {
      await api.patch(`/tasks/${taskId}`, { status: newStatus });
      onRefresh();
    } catch (error) {
      console.error('Failed to update task:', error);
    }
  };

  const handleDeleteTask = async (taskId, e) => {
    e.stopPropagation();
    await onDeleteTask(taskId);
  };

  const handleCompleteTask = async (task) => {
    if (needsFocusSession(task)) {
      try {
        await api.patch(`/tasks/${task.id}`, { status: 'done' });
        onTaskComplete(task.id);
      } catch (error) {
        console.error('Failed to complete task:', error);
        alert('Failed to complete task');
      }
      return;
    }
    onQuickComplete(task);
  };

  const borderFor = (task) => {
    const b = task.urgency_bucket;
    if (b === 'overdue') return 'border-red-400/50 ring-1 ring-red-400/20';
    if (b === 'due_today') return 'border-orange-400/40';
    if (b === 'start_today') return 'border-amber-400/30';
    return 'border-white/20';
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {columns.map((column) => {
          const columnTasks = tasks.filter((task) => task.status === column.id);
          return (
            <div
              key={column.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.id)}
              className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-4 min-h-[320px]"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${COLUMN_DOT_COLORS[column.color]}`} />
                  {column.title}
                </h3>
                <span className="text-white/50 text-sm">{columnTasks.length}</span>
              </div>

              <div className="space-y-3">
                {columnTasks.map((task) => {
                  const badge = deadlineBadge(task);
                  return (
                    <div
                      key={task.id}
                      draggable={task.can_edit !== false}
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onClick={() => { if (!isDragging) setSelectedTask(task); }}
                      className={`backdrop-blur-sm bg-white/10 border rounded-lg p-4 cursor-pointer hover:bg-white/15 transition-all group ${borderFor(task)}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="text-white font-medium flex-1 pr-2 text-sm">{task.title}</h4>
                        <span className={`text-xs px-2 py-1 rounded ${getPriorityColor(task.priority)}`}>
                          P{task.priority}
                        </span>
                      </div>

                      {badge && (
                        <div className={`inline-flex text-[10px] px-1.5 py-0.5 rounded border mb-2 ${badge.className}`}>
                          {badge.label}
                        </div>
                      )}

                      {task.description && (
                        <p className="text-white/60 text-sm mb-3 line-clamp-2">{task.description}</p>
                      )}

                      <div className="flex items-center justify-between text-sm text-white/50">
                        <div className="flex items-center gap-2 flex-wrap">
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
                          {task.is_recurring && <Repeat size={12} className="text-purple-300" />}
                          {task.is_shared && (
                            <span className="text-[10px] text-cyan-300">
                              {task.my_role === 'view' ? 'View only' : 'Shared'}
                            </span>
                          )}
                          {task.assignee_email && (
                            <span className="text-[10px] text-amber-200">→ {task.assignee_email}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}
                            className="p-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 rounded"
                          >
                            <Eye size={16} />
                          </button>
                          {(task.status === 'todo' || task.status === 'doing') && task.can_edit !== false && !needsFocusSession(task) && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onQuickComplete(task); }}
                              className="p-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded"
                              title="Mark done"
                            >
                              <CheckCircle size={16} />
                            </button>
                          )}
                          {(task.status === 'todo' || task.status === 'doing') && task.can_edit !== false && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onStartSession(task.id, task.title); }}
                              className="p-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-200 rounded"
                              title={needsFocusSession(task) ? 'Start focus session' : 'Optional timer'}
                            >
                              <Timer size={16} />
                            </button>
                          )}
                          {(task.can_delete ?? !task.is_shared) && (
                          <button
                            onClick={(e) => handleDeleteTask(task.id, e)}
                            className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded"
                          >
                            <Trash2 size={16} />
                          </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {columnTasks.length === 0 && (
                  <div className="text-center py-8 text-white/30 text-sm">
                    No tasks in {column.title.toLowerCase()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onStartSession={(task) => {
            onStartSession(task.id, task.title);
            setSelectedTask(null);
          }}
          onDeleteTask={async (task) => {
            await onDeleteTask(task.id);
            setSelectedTask(null);
          }}
          onCompleteTask={handleCompleteTask}
          onUpdated={() => onRefresh()}
        />
      )}
    </>
  );
}
