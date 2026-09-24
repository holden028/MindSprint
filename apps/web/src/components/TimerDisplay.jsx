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
  mode = 'pomodoro',
}) {
  const isFree = mode === 'free';
  const [timeLeft, setTimeLeft] = useState(duration * 60);
  const [elapsed, setElapsed] = useState(0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!isRunning && !isFree) {
      setTimeLeft(duration * 60);
    }
  }, [duration, isFree]); // eslint-disable-line react-hooks/exhaustive-deps -- pause must not reset remaining time

  useEffect(() => {
    if (!isRunning) return undefined;

    const interval = setInterval(() => {
      if (isFree) {
        setElapsed((prev) => prev + 1);
      } else {
        setTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, isFree]);

  useEffect(() => {
    if (!isFree && timeLeft === 0 && isRunning && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [timeLeft, isRunning, onComplete, isFree]);

  useEffect(() => {
    if (isRunning) {
      completedRef.current = false;
    }
  }, [isRunning]);

  const handleReset = () => {
    setTimeLeft(duration * 60);
    setElapsed(0);
    onReset();
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const total = duration * 60 || 1;
  const progress = isFree
    ? Math.min(100, (elapsed / Math.max(total, 1)) * 100)
    : ((total - timeLeft) / total) * 100;

  return (
    <div className="mb-8 backdrop-blur-sm bg-white/10 border border-white/20 rounded-2xl p-8 sm:p-12 text-center">
      {isFree && (
        <p className="text-white/50 text-sm mb-3">
          No countdown — work until you&apos;re done. Timer is just a clock.
        </p>
      )}
      <div className="text-6xl sm:text-8xl font-bold text-white mb-6 tabular-nums">
        {formatTime(isFree ? elapsed : timeLeft)}
      </div>

      <div className="w-full bg-white/20 rounded-full h-2 mb-8">
        <div
          className={`h-2 rounded-full transition-all duration-1000 ${
            isFree
              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
              : 'bg-gradient-to-r from-purple-500 to-blue-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
        {!isRunning ? (
          <button
            onClick={onStart}
            disabled={!selectedTask}
            className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={24} />
            {isFree ? 'Start working' : 'Start timer'}
          </button>
        ) : (
          <>
            <button
              onClick={onPause}
              className="flex items-center gap-2 px-6 py-4 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 rounded-xl font-semibold transition-all"
            >
              <Pause size={24} />
              Pause
            </button>
            {selectedTask && (
              <button
                onClick={onCompleteTaskEarly}
                className="flex items-center gap-2 px-6 py-4 bg-green-500/20 hover:bg-green-500/30 text-green-200 rounded-xl font-semibold transition-all"
              >
                <Check size={24} />
                Done with task
              </button>
            )}
          </>
        )}
        <button
          onClick={handleReset}
          className="flex items-center gap-2 px-6 py-4 bg-white/10 hover:bg-white/15 text-white/80 rounded-xl font-semibold transition-all"
        >
          <RotateCcw size={24} />
          Reset
        </button>
      </div>
    </div>
  );
}
