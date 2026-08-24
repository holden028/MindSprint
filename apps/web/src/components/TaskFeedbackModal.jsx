import React, { useState } from 'react';
import api from '../services/api';
import { X } from 'lucide-react';
import Modal from './Modal';

export default function TaskFeedbackModal({ task, onClose, onSubmit }) {
  const [feedback, setFeedback] = useState({
    rating: 5,
    difficulty: 5,
    enjoyment: 5,
    estimate_accuracy: 3,
    needed_more_time: false,
    additional_minutes: 0,
    feedback_text: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      await api.post('/profile/feedback', {
        task_id: task.id,
        ...feedback
      });

      // If more time is needed, update task estimate
      if (feedback.needed_more_time && feedback.additional_minutes > 0) {
        await api.patch(`/tasks/${task.id}`, {
          est_minutes: task.est_minutes + feedback.additional_minutes
        });
      }

      onSubmit();
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      alert('Failed to submit feedback');
    }
  };

  return (
    <Modal className="max-w-lg" onClose={onClose}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">Task Feedback</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-all">
            <X className="text-white" size={24} />
          </button>
        </div>

        <div className="mb-4 p-4 bg-white/5 rounded-lg">
          <h3 className="text-white font-semibold">{task.title}</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/80 mb-2">
              How well did you focus? (1-10)
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={feedback.rating}
              onChange={(e) => setFeedback({ ...feedback, rating: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="text-white/60 text-center">{feedback.rating}</div>
          </div>

          <div>
            <label className="block text-white/80 mb-2">
              How difficult was it? (1-10)
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={feedback.difficulty}
              onChange={(e) => setFeedback({ ...feedback, difficulty: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="text-white/60 text-center">{feedback.difficulty}</div>
          </div>

          <div>
            <label className="block text-white/80 mb-2">
              Did you enjoy it? (1-10)
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={feedback.enjoyment}
              onChange={(e) => setFeedback({ ...feedback, enjoyment: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="text-white/60 text-center">{feedback.enjoyment}</div>
          </div>

          <div>
            <label className="block text-white/80 mb-2">
              Was the time estimate accurate? (1-5)
            </label>
            <input
              type="range"
              min="1"
              max="5"
              value={feedback.estimate_accuracy}
              onChange={(e) => setFeedback({ ...feedback, estimate_accuracy: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="text-white/60 text-center text-sm">
              {['Way too short', 'A bit short', 'Just right', 'A bit long', 'Way too long'][feedback.estimate_accuracy - 1]}
            </div>
          </div>

          <div>
            <label className="flex items-center space-x-2 text-white/80">
              <input
                type="checkbox"
                checked={feedback.needed_more_time}
                onChange={(e) => setFeedback({ ...feedback, needed_more_time: e.target.checked })}
                className="rounded"
              />
              <span>I needed more time</span>
            </label>
          </div>

          {feedback.needed_more_time && (
            <div>
              <label className="block text-white/80 mb-2">
                Additional minutes needed
              </label>
              <input
                type="number"
                min="0"
                value={feedback.additional_minutes}
                onChange={(e) => setFeedback({ ...feedback, additional_minutes: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          )}

          <div>
            <label className="block text-white/80 mb-2">
              Additional notes (optional)
            </label>
            <textarea
              value={feedback.feedback_text}
              onChange={(e) => setFeedback({ ...feedback, feedback_text: e.target.value })}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows="3"
              placeholder="Any thoughts on this task?"
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 bg-white/10 hover:bg-white/15 text-white rounded-lg transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transition-all"
            >
              Submit Feedback
            </button>
          </div>
        </form>
    </Modal>
  );
}

