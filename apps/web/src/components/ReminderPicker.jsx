import React, { useState } from 'react';
import { Bell, Clock } from 'lucide-react';
import api from '../services/api';

const QUICK_PICKS = [
  { label: 'In 1 hour', offset: 60 * 60 * 1000 },
  { label: 'In 3 hours', offset: 3 * 60 * 60 * 1000 },
  {
    label: 'Tomorrow 9 AM',
    offset: null,
    computeFn: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

/** Extra reminders — always dual-channel (in-app + Slack) */
export default function ReminderPicker({ taskId, onSet, onClose }) {
  const [customDate, setCustomDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleQuickPick = async (pick) => {
    const remindAt = pick.computeFn ? pick.computeFn() : new Date(Date.now() + pick.offset);
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
      await Promise.all(
        ['in_app', 'slack'].map((channel) =>
          api.post('/reminders', {
            task_id: taskId,
            remind_at: remindAt.toISOString(),
            channel,
          })
        )
      );
      onSet?.();
      onClose?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set reminder');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="backdrop-blur-xl bg-gray-900/95 border border-white/20 rounded-xl p-4 w-72 shadow-2xl">
      <div className="flex items-center gap-2 mb-1">
        <Bell size={16} className="text-blue-400" />
        <span className="text-sm font-semibold text-white">Set Reminder</span>
      </div>
      <p className="text-[11px] text-white/40 mb-3">Sends both in-app and Slack</p>

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
          {loading ? 'Setting…' : 'Set Reminder'}
        </button>
      </div>

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}
