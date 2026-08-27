import React, { useState } from 'react';
import { CheckCircle, XCircle, X } from 'lucide-react';
import Modal from './Modal';
import api from '../services/api';

export default function QuickCompleteModal({ task, onClose, onComplete }) {
  const [submitting, setSubmitting] = useState(false);

  const markDone = async () => {
    setSubmitting(true);
    try {
      await api.patch(`/tasks/${task.id}`, { status: 'done' });
      onComplete?.();
    } catch (error) {
      console.error('Failed to complete task:', error);
      alert(error.response?.data?.error || 'Failed to complete task');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal className="max-w-md" onClose={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
      >
        <X className="h-5 w-5" />
      </button>

      <h2 className="text-xl font-bold text-white mb-1">Quick win</h2>
      <p className="text-white/60 text-sm mb-4">{task.title}</p>
      <p className="text-white/80 mb-6">Did you finish this?</p>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={markDone}
          disabled={submitting}
          className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-green-500/20 border-green-400/40 text-green-100 hover:bg-green-500/30 transition-all disabled:opacity-50"
        >
          <CheckCircle size={28} />
          <span className="font-medium">Yes, done</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-white/5 border-white/20 text-white/70 hover:bg-white/10 transition-all"
        >
          <XCircle size={28} />
          <span className="font-medium">Not yet</span>
        </button>
      </div>
    </Modal>
  );
}
