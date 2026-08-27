import React, { useState } from 'react';
import { X, Star, Zap, Brain, MessageSquare, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import ScalePicker from './ScalePicker';

function SessionCompletionModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  sessionData,
  taskData 
}) {
  const [rating, setRating] = useState(5);
  const [energyLevel, setEnergyLevel] = useState(3);
  const [notes, setNotes] = useState('');
  const [distractions, setDistractions] = useState([]);
  const [taskCompleted, setTaskCompleted] = useState(null); // null, true, or false
  const [actualTimeNeeded, setActualTimeNeeded] = useState(null); // 'less', 'accurate', 'more'
  const [focusQuality, setFocusQuality] = useState(3); // 1-5
  const [submitting, setSubmitting] = useState(false);

  const distractionOptions = [
    { id: 'phone', label: 'Phone', icon: '📱' },
    { id: 'noise', label: 'Noise', icon: '🔊' },
    { id: 'people', label: 'People', icon: '👥' },
    { id: 'internet', label: 'Internet', icon: '🌐' },
    { id: 'thoughts', label: 'Thoughts', icon: '💭' },
    { id: 'hunger', label: 'Hunger/Thirst', icon: '🍕' },
    { id: 'fatigue', label: 'Fatigue', icon: '😴' },
    { id: 'other', label: 'Other', icon: '❓' }
  ];

  const toggleDistraction = (id) => {
    setDistractions(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    
    const sessionSummary = {
      self_rating: rating,
      energy_level: energyLevel,
      notes: notes.trim(),
      distractions: distractions,
      task_completed: taskCompleted,
      actual_time_accuracy: actualTimeNeeded,
      focus_quality: focusQuality,
      session_id: sessionData?.sessionId
    };

    await onSubmit(sessionSummary);
    setSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
        >
          <X className="h-6 w-6" />
        </button>

        <h2 className="text-3xl font-bold text-white mb-2">Session Complete! 🎉</h2>
        <p className="text-white/70 mb-6">Help us learn from this session</p>

        {/* Task Completion Status */}
        {taskData && (
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <CheckCircle size={20} />
              Did you complete the task?
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setTaskCompleted(true)}
                className={`p-4 rounded-xl border transition-all ${
                  taskCompleted === true
                    ? 'bg-green-500/30 border-green-400/50 text-green-200'
                    : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                }`}
              >
                <CheckCircle className="mx-auto mb-2" size={24} />
                <div className="text-sm font-medium">Yes, Done!</div>
              </button>
              <button
                onClick={() => setTaskCompleted(false)}
                className={`p-4 rounded-xl border transition-all ${
                  taskCompleted === false
                    ? 'bg-orange-500/30 border-orange-400/50 text-orange-200'
                    : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                }`}
              >
                <XCircle className="mx-auto mb-2" size={24} />
                <div className="text-sm font-medium">Partially</div>
              </button>
              <button
                onClick={() => setTaskCompleted(null)}
                className={`p-4 rounded-xl border transition-all ${
                  taskCompleted === null
                    ? 'bg-red-500/30 border-red-400/50 text-red-200'
                    : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                }`}
              >
                <AlertTriangle className="mx-auto mb-2" size={24} />
                <div className="text-sm font-medium">Not Yet</div>
              </button>
            </div>
          </div>
        )}

        {/* Time Estimate Accuracy */}
        {taskData && taskCompleted !== null && (
          <div className="mb-6">
            <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
              <Clock size={20} />
              Was the time estimate accurate?
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setActualTimeNeeded('less')}
                className={`p-4 rounded-xl border transition-all ${
                  actualTimeNeeded === 'less'
                    ? 'bg-blue-500/30 border-blue-400/50 text-blue-200'
                    : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                }`}
              >
                <div className="text-sm font-medium">Took Less Time</div>
                <div className="text-xs mt-1 opacity-70">Overestimated</div>
              </button>
              <button
                onClick={() => setActualTimeNeeded('accurate')}
                className={`p-4 rounded-xl border transition-all ${
                  actualTimeNeeded === 'accurate'
                    ? 'bg-green-500/30 border-green-400/50 text-green-200'
                    : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                }`}
              >
                <div className="text-sm font-medium">Spot On!</div>
                <div className="text-xs mt-1 opacity-70">Accurate</div>
              </button>
              <button
                onClick={() => setActualTimeNeeded('more')}
                className={`p-4 rounded-xl border transition-all ${
                  actualTimeNeeded === 'more'
                    ? 'bg-orange-500/30 border-orange-400/50 text-orange-200'
                    : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                }`}
              >
                <div className="text-sm font-medium">Needed More Time</div>
                <div className="text-xs mt-1 opacity-70">Underestimated</div>
              </button>
            </div>
          </div>
        )}

        <ScalePicker
          label="How productive was this session?"
          icon={Star}
          value={rating}
          onChange={setRating}
          max={10}
          gradient="from-yellow-500 to-orange-500"
        />

        <ScalePicker
          label="Energy Level"
          icon={Zap}
          value={energyLevel}
          onChange={setEnergyLevel}
          gradient="from-green-500 to-teal-500"
          lowLabel="😴 Drained"
          highLabel="⚡ Energized"
        />

        <ScalePicker
          label="Focus Quality"
          icon={Brain}
          value={focusQuality}
          onChange={setFocusQuality}
          gradient="from-purple-500 to-blue-500"
          lowLabel="😵 Scattered"
          highLabel="🎯 Laser Focus"
        />

        {/* Distractions */}
        <div className="mb-6">
          <h3 className="text-white font-semibold mb-3">What distracted you?</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {distractionOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => toggleDistraction(option.id)}
                className={`p-3 rounded-lg border transition-all ${
                  distractions.includes(option.id)
                    ? 'bg-red-500/30 border-red-400/50 text-red-200'
                    : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                }`}
              >
                <div className="text-2xl mb-1">{option.icon}</div>
                <div className="text-xs">{option.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div className="mb-6">
          <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
            <MessageSquare size={20} />
            Session Notes (optional)
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What went well? What could be improved? Any insights?"
            className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50 min-h-[100px]"
            maxLength={500}
          />
          <div className="text-xs text-white/50 mt-1 text-right">{notes.length}/500</div>
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl font-semibold hover:from-purple-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Saving...' : 'Complete Session'}
        </button>
    </Modal>
  );
}

export default SessionCompletionModal;

