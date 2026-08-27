import React, { useState, useEffect } from 'react';
import {
  X, Clock, AlertCircle, Target, FileText, Brain, CheckCircle,
  CalendarClock, Bell, Repeat, UserCheck
} from 'lucide-react';
import Modal from './Modal';
import ReminderPicker from './ReminderPicker';
import ShareInvite from './ShareInvite';
import AttachmentsPanel from './AttachmentsPanel';
import api from '../services/api';
import { getUrgencyColor } from '../utils/colors';
import { formatDue, toDatetimeLocal } from '../utils/deadlines';
import { needsFocusSession } from '../utils/workMode';

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function TaskDetailModal({ task: initialTask, onClose, onStartSession, onDeleteTask, onCompleteTask, onUpdated }) {
  const [task, setTask] = useState(initialTask);
  const [dueAt, setDueAt] = useState(toDatetimeLocal(initialTask?.due_at));
  const [saving, setSaving] = useState(false);
  const [showReminder, setShowReminder] = useState(false);
  const [showRecurrence, setShowRecurrence] = useState(!!initialTask?.is_recurring);
  const [recFreq, setRecFreq] = useState(initialTask?.recurrence_rule?.freq || 'daily');
  const [recDays, setRecDays] = useState(initialTask?.recurrence_rule?.days || []);
  const [recInterval, setRecInterval] = useState(initialTask?.recurrence_rule?.interval || 1);
  const [msg, setMsg] = useState('');
  const [assigneeEmail, setAssigneeEmail] = useState(initialTask?.assignee_email || '');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    setTask(initialTask);
    setDueAt(toDatetimeLocal(initialTask?.due_at));
    setShowRecurrence(!!initialTask?.is_recurring);
    setRecFreq(initialTask?.recurrence_rule?.freq || 'daily');
    setRecDays(initialTask?.recurrence_rule?.days || []);
    setRecInterval(initialTask?.recurrence_rule?.interval || 1);
    setAssigneeEmail(initialTask?.assignee_email || '');
  }, [initialTask]);

  if (!task) return null;

  const canEdit = task.can_edit ?? true;
  const canDelete = task.can_delete ?? !task.is_shared;
  const canShare = task.is_owner ?? !task.is_shared;
  const focusTask = needsFocusSession(task);

  const getStatusColor = (status) => {
    switch (status) {
      case 'todo': return 'text-blue-400 bg-blue-500/20 border-blue-400/30';
      case 'doing': return 'text-yellow-400 bg-yellow-500/20 border-yellow-400/30';
      case 'done': return 'text-green-400 bg-green-500/20 border-green-400/30';
      default: return 'text-gray-400 bg-gray-500/20 border-gray-400/30';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    return new Date(dateString).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const savePatch = async (patch) => {
    setSaving(true);
    setMsg('');
    try {
      const { data } = await api.patch(`/tasks/${task.id}`, patch);
      setTask(data.task);
      onUpdated?.(data.task);
      setMsg('Saved');
      setTimeout(() => setMsg(''), 2000);
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDue = async () => {
    await savePatch({ due_at: dueAt ? new Date(dueAt).toISOString() : null });
  };

  const handleSaveRecurrence = async () => {
    if (!showRecurrence) {
      await savePatch({ is_recurring: false, recurrence_rule: null });
      return;
    }
    const rule = { freq: recFreq, interval: recInterval };
    if (recDays.length) rule.days = recDays;
    await savePatch({ is_recurring: true, recurrence_rule: rule });
  };

  const toggleDay = (d) =>
    setRecDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));

  return (
    <Modal className="max-w-4xl" onClose={onClose}>
      <div className="flex justify-between items-start mb-6">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2 break-words">{task.title}</h2>
          <div className="flex flex-wrap items-center gap-2 text-white/60 text-sm">
            <span className="capitalize">{task.status}</span>
            <span>·</span>
            <span>Created {formatDate(task.created_at)}</span>
            {msg && <span className="text-green-300 text-xs ml-2">{msg}</span>}
            {task.is_shared && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-400/30 text-cyan-200">
                Shared by {task.owner_email || 'someone'}{task.my_role === 'view' ? ' · view only' : ''}
              </span>
            )}
            {task.assignee_email && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-amber-400/30 text-amber-200">
                Assigned to {task.assignee_email}
              </span>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-all ml-4 shrink-0">
          <X className="text-white" size={24} />
        </button>
      </div>

      {/* Due date */}
      <ShareInvite taskId={task.id} canShare={canShare} />

      {canShare && (
        <div className="mb-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <UserCheck className="text-amber-400" size={16} />
            Assign
          </h3>
          <p className="text-xs text-white/45 mb-3">
            They get the full reminder ladder. You get morning and evening roundups instead of each ping.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setAssigning(true);
              setMsg('');
              try {
                const { data } = await api.post(`/tasks/${task.id}/assign`, {
                  email: assigneeEmail.trim() || null
                });
                setTask(data.task);
                setAssigneeEmail(data.task?.assignee_email || assigneeEmail.trim());
                onUpdated?.(data.task);
                setMsg(data.message || 'Assigned');
              } catch (err) {
                setMsg(err.response?.data?.error || 'Failed to assign');
              } finally {
                setAssigning(false);
              }
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              type="email"
              value={assigneeEmail}
              onChange={(e) => setAssigneeEmail(e.target.value)}
              placeholder="assignee@email.com"
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
            />
            <button
              type="submit"
              disabled={assigning}
              className="px-4 py-2 bg-amber-500/20 border border-amber-400/30 text-amber-100 rounded-lg text-sm hover:bg-amber-500/30 disabled:opacity-50"
            >
              {assigning ? 'Saving…' : 'Assign'}
            </button>
            {(task.assignee_user_id || assigneeEmail) && (
              <button
                type="button"
                onClick={async () => {
                  setAssigning(true);
                  try {
                    const { data } = await api.post(`/tasks/${task.id}/assign`, { email: null });
                    setTask(data.task);
                    setAssigneeEmail('');
                    onUpdated?.(data.task);
                    setMsg('Assignee cleared');
                  } catch (err) {
                    setMsg(err.response?.data?.error || 'Failed to clear');
                  } finally {
                    setAssigning(false);
                  }
                }}
                className="px-3 py-2 text-white/40 hover:text-white text-sm"
              >
                Clear
              </button>
            )}
          </form>
        </div>
      )}

      <div className="mb-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <CalendarClock className="text-blue-400" size={16} />
          Due date
          {task.due_at && <span className="text-white/40 font-normal">({formatDue(task.due_at)})</span>}
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            disabled={!canEdit}
            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 [color-scheme:dark] disabled:opacity-50"
          />
          {canEdit && (
          <button
            onClick={handleSaveDue}
            disabled={saving}
            className="px-4 py-2 bg-blue-500/20 border border-blue-400/30 text-blue-200 rounded-lg text-sm hover:bg-blue-500/30 disabled:opacity-50"
          >
            Save due date
          </button>
          )}
          {canEdit && dueAt && (
            <button
              onClick={() => { setDueAt(''); savePatch({ due_at: null }); }}
              className="px-3 py-2 text-white/40 hover:text-white text-sm"
            >
              Clear
            </button>
          )}
        </div>
        {!canEdit && (
          <p className="text-xs text-white/40 mt-2">View only — you can’t change this task.</p>
        )}
        {task.due_at && (
          <p className="text-xs text-white/40 mt-2">
            Auto-reminders (in-app + Slack) are set from estimated time + deadline.
          </p>
        )}
      </div>

      {/* Reminder */}
      <div className="mb-6 relative">
        <button
          onClick={() => setShowReminder(!showReminder)}
          className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border bg-white/5 border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-all"
        >
          <Bell size={16} className="text-blue-400" />
          Add extra reminder
        </button>
        {showReminder && (
          <div className="absolute z-20 mt-2 left-0">
            <ReminderPicker
              taskId={task.id}
              onSet={() => setMsg('Reminder set')}
              onClose={() => setShowReminder(false)}
            />
          </div>
        )}
      </div>

      {/* Recurrence */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setShowRecurrence(!showRecurrence)}
          className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border transition-all w-full sm:w-auto ${
            showRecurrence || task.is_recurring
              ? 'bg-purple-500/20 border-purple-400/30 text-purple-200'
              : 'bg-white/5 border-white/10 text-white/60 hover:text-white/80'
          }`}
        >
          <Repeat size={16} />
          Repeat
          {task.is_recurring && task.next_occurrence && (
            <span className="ml-auto sm:ml-3 text-xs opacity-60">
              Next: {formatDate(task.next_occurrence)}
            </span>
          )}
        </button>

        {showRecurrence && (
          <div className="mt-3 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              {['daily', 'weekly', 'monthly'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setRecFreq(f)}
                  className={`flex-1 min-w-[70px] text-xs py-2 rounded-lg border capitalize ${
                    recFreq === f
                      ? 'bg-purple-500/20 border-purple-400/40 text-purple-200'
                      : 'bg-white/5 border-white/10 text-white/50'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            {recFreq === 'weekly' && (
              <div className="flex gap-1.5 flex-wrap">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border capitalize ${
                      recDays.includes(d)
                        ? 'bg-purple-500/25 border-purple-400/40 text-purple-200'
                        : 'bg-white/5 border-white/10 text-white/40'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleSaveRecurrence}
                disabled={saving}
                className="px-4 py-2 bg-purple-500/20 border border-purple-400/30 text-purple-200 rounded-lg text-sm disabled:opacity-50"
              >
                Save recurrence
              </button>
              {task.is_recurring && (
                <button
                  onClick={() => { setShowRecurrence(false); savePatch({ is_recurring: false, recurrence_rule: null }); }}
                  className="px-3 py-2 text-white/40 hover:text-red-300 text-sm"
                >
                  Stop repeating
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <FileText className="text-blue-400" size={18} />
          What Needs to Be Done
        </h3>
        <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-4">
          {task.description ? (
            <div className="text-white/90 leading-relaxed whitespace-pre-wrap text-sm">{task.description}</div>
          ) : (
            <div className="text-white/60 italic text-sm">No detailed description.</div>
          )}
        </div>
      </div>

      <AttachmentsPanel taskId={task.id} canEdit={canEdit} />

      {/* Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-orange-400" size={18} />
            <div>
              <div className="text-white/60 text-xs">Priority</div>
              <div className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${getUrgencyColor(task.priority)}`}>
                P{task.priority}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Target className="text-red-400" size={18} />
            <div>
              <div className="text-white/60 text-xs">Urgency</div>
              <div className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${getUrgencyColor(task.urgency)}`}>
                U{task.urgency}
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Clock className="text-blue-400" size={18} />
            <div>
              <div className="text-white/60 text-xs">Estimated</div>
              <div className="text-white text-sm font-medium">{task.est_minutes} min</div>
            </div>
          </div>
          <div className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(task.status)}`}>
            {task.status === 'todo' ? 'To Do' : task.status === 'doing' ? 'In Progress' : 'Completed'}
          </div>
        </div>
      </div>

      {(task.original_title || task.ai_interpretations) && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
            <Brain className="text-purple-400" size={16} /> AI context
          </h3>
          {task.original_title && task.original_title !== task.title && (
            <p className="text-xs text-white/50">Originally: {task.original_title}</p>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {(task.status === 'todo' || task.status === 'doing') && canEdit && (
          <>
            {!focusTask && (
              <button
                onClick={() => { onCompleteTask(task); onClose(); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg font-semibold"
              >
                <CheckCircle size={18} />
                Mark done
              </button>
            )}
            <button
              onClick={() => { onStartSession(task); onClose(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-white rounded-lg font-semibold ${
                focusTask
                  ? 'bg-gradient-to-r from-green-500 to-blue-500'
                  : 'bg-white/10 border border-white/20 hover:bg-white/15'
              }`}
            >
              <Clock size={18} />
              {focusTask ? 'Start Focus' : 'Optional timer'}
            </button>
          </>
        )}
        {task.status === 'doing' && canEdit && focusTask && (
          <button
            onClick={() => { onCompleteTask(task); onClose(); }}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-semibold"
          >
            <CheckCircle size={18} />
            Complete
          </button>
        )}
        {canDelete && (
        <button
          onClick={() => { onDeleteTask(task); onClose(); }}
          className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg"
        >
          Delete
        </button>
        )}
      </div>
    </Modal>
  );
}
