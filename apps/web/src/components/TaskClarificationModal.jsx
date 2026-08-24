import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Modal from './Modal';
import { X, Brain, CheckCircle, Sparkles, MessageCircle, ArrowRight } from 'lucide-react';

export default function TaskClarificationModal({ taskData, onConfirm, onRefine, onClose }) {
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [refinedTask, setRefinedTask] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState([]);
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [refining, setRefining] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { analyzeTask(); }, []);

  const analyzeTask = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/ai/analyze-task', taskData);
      if (data.refined_task) setRefinedTask({ ...taskData, ...data.refined_task, project_id: taskData.project_id });
      if (data.questions?.length > 0) {
        setQuestions(data.questions);
      } else {
        setDone(true);
      }
    } catch {
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  const handleOptionPick = async (question, option) => {
    if (option.value === null) {
      advanceOrFinish([...answeredQuestions]);
      return;
    }

    const answered = [...answeredQuestions, { question: question.question, answer: option.label, field: question.field }];
    setAnsweredQuestions(answered);

    if (question.field && option.value !== null && refinedTask) {
      setRefinedTask(prev => ({ ...prev, [question.field]: option.value }));
    }

    advanceOrFinish(answered);
  };

  const handleCustomSubmit = (question) => {
    if (!customInput.trim()) return;
    const answered = [...answeredQuestions, { question: question.question, answer: customInput.trim(), field: question.field }];
    setAnsweredQuestions(answered);
    setCustomInput('');
    setShowCustom(false);
    advanceOrFinish(answered);
  };

  const advanceOrFinish = async (answered) => {
    if (currentQ + 1 < questions.length) {
      setCurrentQ(prev => prev + 1);
      setShowCustom(false);
      return;
    }

    if (answered.length > 0) {
      setRefining(true);
      try {
        const { data } = await api.post('/ai/refine-task', {
          task: refinedTask || taskData,
          answered_questions: answered
        });
        if (data.refined_task) {
          setRefinedTask(prev => ({ ...(prev || taskData), ...data.refined_task, project_id: taskData.project_id }));
        }
        if (data.follow_up_questions?.length > 0) {
          setQuestions(data.follow_up_questions);
          setCurrentQ(0);
          setShowCustom(false);
          setRefining(false);
          return;
        }
      } catch {
        // proceed with what we have
      }
      setRefining(false);
    }
    setDone(true);
  };

  const handleConfirm = () => {
    const final = refinedTask || taskData;
    onConfirm(final);
  };

  const handleUseOriginal = () => {
    onConfirm(taskData);
  };

  if (loading) {
    return (
      <Modal className="max-w-lg" onClose={onClose}>
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="relative">
            <Brain className="h-10 w-10 text-purple-400 animate-pulse" />
            <Sparkles className="h-4 w-4 text-yellow-400 absolute -top-1 -right-1 animate-bounce" />
          </div>
          <span className="text-white/80 text-lg">Analyzing your task...</span>
          <span className="text-white/40 text-sm">Looking at your patterns to make smart suggestions</span>
        </div>
      </Modal>
    );
  }

  if (refining) {
    return (
      <Modal className="max-w-lg" onClose={onClose}>
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-purple-400 border-t-transparent" />
          <span className="text-white/80">Refining your task...</span>
        </div>
      </Modal>
    );
  }

  if (done) {
    const final = refinedTask || taskData;
    const hasChanges = refinedTask && (
      refinedTask.title !== taskData.title ||
      refinedTask.description !== taskData.description ||
      refinedTask.est_minutes !== taskData.est_minutes ||
      refinedTask.priority !== taskData.priority ||
      refinedTask.urgency !== taskData.urgency
    );

    return (
      <Modal className="max-w-lg" onClose={onClose}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CheckCircle className="text-green-400" size={22} />
            Task Ready
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-all">
            <X className="text-white/60" size={20} />
          </button>
        </div>

        <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-5 mb-6">
          <h3 className="text-white font-semibold text-lg mb-1">{final.title}</h3>
          {final.description && <p className="text-white/60 text-sm mb-3">{final.description}</p>}
          <div className="flex gap-4 text-sm text-white/50">
            <span>{final.est_minutes}min</span>
            <span>P{final.priority}</span>
            <span>U{final.urgency}</span>
          </div>
        </div>

        {hasChanges && (
          <div className="bg-purple-500/10 border border-purple-400/20 rounded-xl p-4 mb-6">
            <p className="text-purple-200 text-xs mb-2 font-medium">AI improvements applied</p>
            {refinedTask.title !== taskData.title && (
              <p className="text-white/50 text-xs">Title: <span className="line-through">{taskData.title}</span></p>
            )}
            {refinedTask.description !== taskData.description && refinedTask.description && (
              <p className="text-white/50 text-xs mt-1">Description updated</p>
            )}
            {refinedTask.est_minutes !== taskData.est_minutes && (
              <p className="text-white/50 text-xs mt-1">Time: {taskData.est_minutes}min → {refinedTask.est_minutes}min</p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          {hasChanges && (
            <button
              onClick={handleUseOriginal}
              className="flex-1 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl transition-all text-sm"
            >
              Use Original
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white/10 hover:bg-white/15 text-white rounded-xl transition-all text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-[2] py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl font-semibold hover:from-purple-600 hover:to-blue-600 transition-all text-sm"
          >
            Create Task
          </button>
        </div>
      </Modal>
    );
  }

  const q = questions[currentQ];

  return (
    <Modal className="max-w-lg" onClose={onClose}>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Brain className="text-purple-400" size={22} />
          Quick Refinement
        </h2>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-all">
          <X className="text-white/60" size={20} />
        </button>
      </div>

      {/* Progress dots */}
      {questions.length > 1 && (
        <div className="flex gap-1.5 mb-6 justify-center">
          {questions.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i < currentQ ? 'w-6 bg-purple-400' : i === currentQ ? 'w-6 bg-white' : 'w-1.5 bg-white/20'
              }`}
            />
          ))}
        </div>
      )}

      {/* Task context */}
      <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-6">
        <p className="text-white/80 text-sm font-medium">{taskData.title}</p>
      </div>

      {/* Question */}
      <div className="mb-6">
        <p className="text-white text-lg font-medium mb-4">{q.question}</p>

        {/* Option chips */}
        <div className="space-y-2">
          {q.options?.filter(o => o.value !== null).map((option, i) => (
            <button
              key={i}
              onClick={() => handleOptionPick(q, option)}
              className="w-full text-left px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-purple-400/40 rounded-xl text-white/90 transition-all flex items-center justify-between group"
            >
              <span>{option.label}</span>
              <ArrowRight size={16} className="text-white/20 group-hover:text-purple-400 transition-colors" />
            </button>
          ))}

          {/* Something else */}
          {!showCustom ? (
            <button
              onClick={() => setShowCustom(true)}
              className="w-full text-left px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 border-dashed rounded-xl text-white/50 hover:text-white/70 transition-all flex items-center gap-2"
            >
              <MessageCircle size={14} />
              Something else...
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit(q)}
                placeholder="Type your answer..."
                className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                autoFocus
              />
              <button
                onClick={() => handleCustomSubmit(q)}
                className="px-4 py-3 bg-purple-500/30 hover:bg-purple-500/40 text-purple-200 rounded-xl transition-all"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          )}

          {/* Skip */}
          {q.options?.some(o => o.value === null) && (
            <button
              onClick={() => handleOptionPick(q, { value: null })}
              className="w-full text-center py-2 text-white/30 hover:text-white/50 text-sm transition-all"
            >
              Skip this question
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
