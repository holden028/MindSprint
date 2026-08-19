import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Check } from 'lucide-react';

export default function TimerDisplay({
  duration,
  isRunning,
  selectedTask,
  onStart,
  onPause,
  onReset,
  onComplete,
  onCompleteTaskEarly,
}) {
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!isRunning) {
      setTimeLeft(duration * 60);
    }
  }, [duration]); // eslint-disable-line react-hooks/exhaustive-deps -- pause must not reset remaining time

  useEffect(() => {
    if (!isRunning) return undefined;

    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    if (timeLeft === 0 && isRunning && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [timeLeft, isRunning, onComplete]);

  useEffect(() => {
    if (isRunning) {
      completedRef.current = false;
    }
  }, [isRunning]);

  const handleReset = () => {
    setTimeLeft(duration * 60);
    onReset();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const total = duration * 60 || 1;
  const progress = ((total - timeLeft) / total) * 100;

  return (
    <div className="mb-8 backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl p-12 text-center">
      <div className="text-8xl font-bold text-white mb-6 tabular-nums">
        {formatTime(timeLeft)}
      </div>

      <div className="w-full bg-white/20 rounded-full h-2 mb-8">
        <div
          className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-1000"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex justify-center gap-4">
        {!isRunning ? (
          <button
            onClick={onStart}
            disabled={!selectedTask}
            className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl font-semibold hover:from-purple-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={24} />
            Start Session
          </button>
        ) : (
          <>
            <button
              onClick={onPause}
              className="flex items-center gap-2 px-8 py-4 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 rounded-xl font-semibold transition-all"
            >
              <Pause size={24} />
              Pause
            </button>
            {selectedTask && (
              <button
                onClick={onCompleteTaskEarly}
                className="flex items-center gap-2 px-8 py-4 bg-green-500/20 hover:bg-green-500/30 text-green-200 rounded-xl font-semibold transition-all"
              >
                <Check size={24} />
                Complete Task
              </button>
            )}
          </>
        )}
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-8 py-4 bg-white/10 hover:bg-white/15 text-white/80 rounded-xl font-semibold transition-all"
        >
          <RotateCcw size={24} />
          Reset
        </button>
      </div>
    </div>
  );
}
