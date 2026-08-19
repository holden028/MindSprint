import React, { useState } from 'react';
import { Bell, Clock, Hash } from 'lucide-react';
import api from '../services/api';

const QUICK_PICKS = [
  { label: 'In 1 hour', offset: 60 * 60 * 1000 },
  { label: 'In 3 hours', offset: 3 * 60 * 60 * 1000 },
  { label: 'Tomorrow 9 AM', offset: null, computeFn: () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  }},
];

export default function ReminderPicker({ taskId, onSet, onClose }) {
  const [mode, setMode] = useState('quick');
  const [customDate, setCustomDate] = useState('');
  const [channel, setChannel] = useState('in_app');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleQuickPick = async (pick) => {
    const remindAt = pick.computeFn
      ? pick.computeFn()
      : new Date(Date.now() + pick.offset);
    await submitReminder(remindAt);
  };

  const handleCustomSubmit = async () => {
    if (!customDate) return;
    await submitReminder(new Date(customDate));
  };

  const submitReminder = async (remindAt) => {
    setLoading(true);
    setError('');
    try {
      await api.post('/reminders', {
        task_id: taskId,
        remind_at: remindAt.toISOString(),
        channel,
      });
      onSet?.();
      onClose?.();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to set reminder';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="backdrop-blur-xl bg-gray-900/95 border border-white/20 rounded-xl p-4 w-72 shadow-2xl">
      <div className="flex items-center gap-2 mb-3">
        <Bell size={16} className="text-blue-400" />
        <span className="text-sm font-semibold text-white">Set Reminder</span>
      </div>

      {/* Channel toggle */}
      <div className="flex gap-2 mb-3">
        {['in_app', 'slack'].map((ch) => (
          <button
            key={ch}
            onClick={() => setChannel(ch)}
            className={`flex-1 text-xs py-1.5 rounded-lg border transition-all ${
              channel === ch
                ? 'bg-blue-500/20 border-blue-400/40 text-blue-300'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'
            }`}
          >
            {ch === 'in_app' ? '🔔 In-App' : '💬 Slack'}
          </button>
        ))}
      </div>

      {/* Quick picks */}
      <div className="space-y-1.5 mb-3">
        {QUICK_PICKS.map((pick) => (
          <button
            key={pick.label}
            onClick={() => handleQuickPick(pick)}
            disabled={loading}
            className="w-full text-left text-sm text-white/80 hover:text-white hover:bg-white/10 px-3 py-2 rounded-lg transition-all disabled:opacity-50"
          >
            <Clock size={14} className="inline mr-2 opacity-50" />
            {pick.label}
          </button>
        ))}
      </div>

      {/* Custom datetime */}
      <div className="border-t border-white/10 pt-3">
        <label className="text-xs text-white/50 mb-1.5 block">Custom date & time</label>
        <input
          type="datetime-local"
          value={customDate}
          onChange={(e) => setCustomDate(e.target.value)}
          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-2 [color-scheme:dark]"
        />
        <button
          onClick={handleCustomSubmit}
          disabled={loading || !customDate}
          className="w-full text-sm bg-blue-500/20 border border-blue-400/30 text-blue-300 hover:bg-blue-500/30 px-3 py-2 rounded-lg transition-all disabled:opacity-50"
        >
          {loading ? 'Setting…' : 'Set Custom Reminder'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 mt-2">{error}</p>
      )}
    </div>
  );
}
