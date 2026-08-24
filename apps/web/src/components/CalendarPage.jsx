import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Target, Lock, CalendarDays, Plus, X } from 'lucide-react';
import api from '../services/api';

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7am - 10pm
const HOUR_HEIGHT = 64; // px per hour

function formatHour(h) {
  if (h === 0 || h === 24) return '12am';
  if (h === 12) return '12pm';
  return h > 12 ? `${h - 12}pm` : `${h}am`;
}

function dayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function positionForTime(date, dayStart) {
  const h = date.getHours() + date.getMinutes() / 60;
  const clamped = Math.max(7, Math.min(22, h));
  return (clamped - 7) * HOUR_HEIGHT;
}

function heightForDuration(minutes) {
  return (minutes / 60) * HOUR_HEIGHT;
}

function getMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startDay = (first.getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  // Pad before
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    cells.push({ date: d, outside: true });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ date: new Date(year, month, i), outside: false });
  }
  // Pad after to fill last row
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month + 1, cells.length - startDay - daysInMonth + 1);
    cells.push({ date: d, outside: true });
  }
  return cells;
}

export default function CalendarPage() {
  const [view, setView] = useState('day'); // 'day' | 'week' | 'month'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [blocks, setBlocks] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slotModal, setSlotModal] = useState(null); // { date, hour }
  const [slotMode, setSlotMode] = useState('task'); // task | block
  const [slotTitle, setSlotTitle] = useState('');
  const [slotMinutes, setSlotMinutes] = useState(60);
  const [slotSaving, setSlotSaving] = useState(false);
  const scrollRef = useRef(null);

  const dates = view === 'day'
    ? [currentDate]
    : view === 'week'
      ? Array.from({ length: 7 }, (_, i) => {
          const d = new Date(currentDate);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1) + i;
          d.setDate(diff);
          return d;
        })
      : []; // month uses its own grid

  const monthCells = view === 'month' ? getMonthGrid(currentDate.getFullYear(), currentDate.getMonth()) : [];

  // Compute date range for data fetching
  let rangeStart, rangeEnd;
  if (view === 'month') {
    const cells = monthCells;
    rangeStart = cells[0].date.toISOString().slice(0, 10);
    rangeEnd = cells[cells.length - 1].date.toISOString().slice(0, 10);
  } else {
    rangeStart = dates[0].toISOString().slice(0, 10);
    rangeEnd = dates[dates.length - 1].toISOString().slice(0, 10);
  }

  useEffect(() => {
    loadData();
  }, [currentDate, view]);

  useEffect(() => {
    if (scrollRef.current) {
      const now = new Date();
      const currentHour = now.getHours();
      if (currentHour >= 7 && currentHour <= 22) {
        scrollRef.current.scrollTop = (currentHour - 7) * HOUR_HEIGHT - 40;
      }
    }
  }, [loading]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [blocksRes, tasksRes] = await Promise.all([
        api.get(`/schedule/blocks?from=${rangeStart}&to=${rangeEnd}`),
        api.get('/tasks?limit=200')
      ]);
      setBlocks(blocksRes.data.blocks || []);
      setTasks((tasksRes.data.tasks || []).filter(t => t.due_at && t.status !== 'done'));
    } catch (err) {
      console.error('Calendar load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const navigate = (dir) => {
    const d = new Date(currentDate);
    if (view === 'month') {
      d.setMonth(d.getMonth() + dir);
    } else {
      d.setDate(d.getDate() + (view === 'day' ? dir : dir * 7));
    }
    setCurrentDate(d);
  };

  const goToday = () => setCurrentDate(new Date());

  const today = new Date();

  const getBlocksForDay = (date) => {
    return blocks.filter(b => {
      const bStart = new Date(b.starts_at);
      return isSameDay(bStart, date);
    });
  };

  const getTasksForDay = (date) => {
    return tasks.filter(t => {
      const due = new Date(t.due_at);
      return isSameDay(due, date);
    });
  };

  const openSlot = (date, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const hour = Math.min(21, Math.max(7, Math.floor(y / HOUR_HEIGHT) + 7));
    setSlotModal({ date: new Date(date), hour });
    setSlotMode('task');
    setSlotTitle('');
    setSlotMinutes(60);
  };

  const saveSlot = async () => {
    if (!slotModal || !slotTitle.trim()) return;
    setSlotSaving(true);
    try {
      const d = new Date(slotModal.date);
      d.setHours(slotModal.hour, 0, 0, 0);
      if (slotMode === 'task') {
        await api.post('/tasks', {
          title: slotTitle.trim(),
          est_minutes: slotMinutes,
          due_at: d.toISOString(),
          priority: 3,
          urgency: 4
        });
      } else {
        const end = new Date(d.getTime() + slotMinutes * 60000);
        await api.post('/schedule/blocks', {
          title: slotTitle.trim(),
          starts_at: d.toISOString(),
          ends_at: end.toISOString()
        });
      }
      setSlotModal(null);
      await loadData();
    } catch (err) {
      console.error('Failed to save slot:', err);
      alert(err.response?.data?.error || 'Failed to save');
    } finally {
      setSlotSaving(false);
    }
  };

  const headerTitle = view === 'day'
    ? currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : view === 'week'
      ? `${dates[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${dates[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
      : currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="text-white" size={26} />
          <h2 className="text-2xl font-bold text-white">{headerTitle}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="px-3 py-1.5 text-xs bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-all">Today</button>
          <button onClick={() => navigate(-1)} className="p-1.5 bg-white/10 border border-white/20 rounded-lg text-white hover:bg-white/20"><ChevronLeft size={18} /></button>
          <button onClick={() => navigate(1)} className="p-1.5 bg-white/10 border border-white/20 rounded-lg text-white hover:bg-white/20"><ChevronRight size={18} /></button>
          <div className="flex bg-white/10 border border-white/20 rounded-lg overflow-hidden ml-2">
            <button onClick={() => setView('day')} className={`px-3 py-1.5 text-xs transition-all ${view === 'day' ? 'bg-purple-500/40 text-white' : 'text-white/60 hover:text-white'}`}>Day</button>
            <button onClick={() => setView('week')} className={`px-3 py-1.5 text-xs transition-all ${view === 'week' ? 'bg-purple-500/40 text-white' : 'text-white/60 hover:text-white'}`}>Week</button>
            <button onClick={() => setView('month')} className={`px-3 py-1.5 text-xs transition-all ${view === 'month' ? 'bg-purple-500/40 text-white' : 'text-white/60 hover:text-white'}`}>Month</button>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-2xl overflow-hidden">

        {/* Month view */}
        {view === 'month' && (
          <div>
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-white/10">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                <div key={d} className="p-2 text-center text-xs text-white/40 font-medium">{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7">
              {monthCells.map((cell, i) => {
                const isToday = isSameDay(cell.date, today);
                const dayTasks = getTasksForDay(cell.date);
                const dayBlocks = getBlocksForDay(cell.date);
                const hasBusy = dayBlocks.length > 0;

                return (
                  <div key={i}
                    onClick={() => { setCurrentDate(new Date(cell.date)); setView('day'); }}
                    className={`min-h-[90px] p-1.5 border-b border-r border-white/5 cursor-pointer hover:bg-white/5 transition-all ${
                      cell.outside ? 'opacity-30' : ''
                    } ${isToday ? 'bg-purple-500/10' : ''}`}
                  >
                    <div className={`text-xs font-medium mb-1 ${
                      isToday ? 'text-purple-300 bg-purple-500/30 w-6 h-6 rounded-full flex items-center justify-center' : 'text-white/60'
                    }`}>
                      {cell.date.getDate()}
                    </div>

                    {hasBusy && (
                      <div className="flex items-center gap-1 mb-0.5">
                        <Lock size={8} className="text-orange-300/60 shrink-0" />
                        <span className="text-[9px] text-orange-200/60 truncate">
                          {dayBlocks.length === 1 ? dayBlocks[0].title : `${dayBlocks.length} blocks`}
                        </span>
                      </div>
                    )}

                    {dayTasks.slice(0, 3).map((task, j) => {
                      const priorityDot = {
                        5: 'bg-red-400', 4: 'bg-orange-400', 3: 'bg-blue-400', 2: 'bg-emerald-400', 1: 'bg-white/40'
                      };
                      return (
                        <div key={j} className="flex items-center gap-1 mb-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDot[task.priority] || 'bg-blue-400'}`} />
                          <span className="text-[10px] text-white/70 truncate">{task.title}</span>
                        </div>
                      );
                    })}
                    {dayTasks.length > 3 && (
                      <span className="text-[9px] text-white/30">+{dayTasks.length - 3} more</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Day column headers (week view) */}
        {view === 'week' && (
          <div className="grid border-b border-white/10" style={{ gridTemplateColumns: `56px repeat(${dates.length}, 1fr)` }}>
            <div className="p-2" />
            {dates.map((d, i) => {
              const isToday = isSameDay(d, today);
              return (
                <div key={i} className={`p-2 text-center border-l border-white/10 ${isToday ? 'bg-purple-500/10' : ''}`}>
                  <div className={`text-xs ${isToday ? 'text-purple-300' : 'text-white/40'}`}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
                  <div className={`text-lg font-semibold ${isToday ? 'text-white bg-purple-500/30 w-8 h-8 rounded-full flex items-center justify-center mx-auto' : 'text-white/70'}`}>
                    {d.getDate()}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Time grid (day/week only) */}
        {view !== 'month' && <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <div className="relative" style={{ gridTemplateColumns: `56px repeat(${dates.length}, 1fr)` }}>
            {/* Grid with times + columns */}
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${dates.length}, 1fr)` }}>
              {/* Time labels column + day columns */}
              <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                {HOURS.map(h => (
                  <div key={h} className="absolute w-full pr-2 text-right" style={{ top: (h - 7) * HOUR_HEIGHT, height: HOUR_HEIGHT }}>
                    <span className="text-[10px] text-white/30 -translate-y-1/2 block">{formatHour(h)}</span>
                  </div>
                ))}
              </div>

              {dates.map((date, colIdx) => {
                const dayBlocks = getBlocksForDay(date);
                const dayTasks = getTasksForDay(date);
                const isToday = isSameDay(date, today);

                return (
                  <div
                    key={colIdx}
                    onClick={(e) => openSlot(date, e)}
                    className={`relative border-l border-white/10 cursor-pointer hover:bg-white/[0.02] ${isToday ? 'bg-purple-500/[0.03]' : ''}`}
                    style={{ height: HOURS.length * HOUR_HEIGHT }}
                  >
                    {/* Hour lines */}
                    {HOURS.map(h => (
                      <div key={h} className="absolute w-full border-t border-white/5 pointer-events-none" style={{ top: (h - 7) * HOUR_HEIGHT }} />
                    ))}

                    {/* Current time indicator */}
                    {isToday && (() => {
                      const now = new Date();
                      const nowH = now.getHours() + now.getMinutes() / 60;
                      if (nowH >= 7 && nowH <= 22) {
                        return (
                          <div className="absolute w-full z-20 flex items-center" style={{ top: (nowH - 7) * HOUR_HEIGHT }}>
                            <div className="w-2.5 h-2.5 bg-red-500 rounded-full -ml-1.5 shrink-0" />
                            <div className="flex-1 h-[2px] bg-red-500/70" />
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Time blocks (busy) */}
                    {dayBlocks.map((block, i) => {
                      const start = new Date(block.starts_at);
                      const end = new Date(block.ends_at);
                      const durationMin = (end - start) / 60000;
                      const top = positionForTime(start);
                      const height = heightForDuration(durationMin);
                      return (
                        <div key={`b-${i}`} onClick={(e) => e.stopPropagation()} className="absolute left-1 right-1 z-10 rounded-lg bg-orange-500/15 border border-orange-400/20 px-2 py-1 overflow-hidden"
                          style={{ top, height: Math.max(height, 20) }}>
                          <div className="flex items-center gap-1">
                            <Lock size={10} className="text-orange-300/60 shrink-0" />
                            <span className="text-[11px] text-orange-200/80 font-medium truncate">{block.title}</span>
                          </div>
                          {height > 28 && (
                            <div className="text-[9px] text-orange-200/40 mt-0.5">
                              {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Tasks with deadlines */}
                    {dayTasks.map((task, i) => {
                      const due = new Date(task.due_at);
                      const est = task.est_minutes || 30;
                      const taskStart = new Date(due.getTime() - est * 60000);
                      const top = positionForTime(taskStart);
                      const height = heightForDuration(est);

                      const priorityColors = {
                        5: 'bg-red-500/20 border-red-400/30',
                        4: 'bg-orange-500/20 border-orange-400/30',
                        3: 'bg-blue-500/20 border-blue-400/30',
                        2: 'bg-emerald-500/20 border-emerald-400/30',
                        1: 'bg-white/10 border-white/20',
                      };
                      const color = priorityColors[task.priority] || priorityColors[3];

                      return (
                        <div key={`t-${i}`} onClick={(e) => e.stopPropagation()} className={`absolute left-1 right-1 z-10 rounded-lg border px-2 py-1 overflow-hidden cursor-pointer hover:brightness-125 transition-all ${color}`}
                          style={{ top, height: Math.max(height, 22) }}>
                          <div className="flex items-center gap-1">
                            <Target size={10} className="text-white/60 shrink-0" />
                            <span className="text-[11px] text-white/90 font-medium truncate">{task.title}</span>
                          </div>
                          {height > 28 && (
                            <div className="text-[9px] text-white/40 mt-0.5 flex gap-2">
                              <span>{est}min</span>
                              <span>Due {due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 px-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-orange-500/20 border border-orange-400/30" />
          <span className="text-[11px] text-white/40">Blocked Time</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-blue-500/20 border border-blue-400/30" />
          <span className="text-[11px] text-white/40">Task (by deadline)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
          <span className="text-[11px] text-white/40">Now</span>
        </div>
        <span className="text-[11px] text-white/30">Tap empty time to add</span>
      </div>

      {slotModal && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm
                     pt-[env(safe-area-inset-top)]
                     pb-[calc(4.5rem+env(safe-area-inset-bottom))] sm:pb-[env(safe-area-inset-bottom)]
                     px-0 sm:px-4"
          onClick={() => setSlotModal(null)}
        >
          <div
            className="w-full max-w-md backdrop-blur-xl bg-gray-950/95 sm:bg-gray-900/95 border border-white/20
                       rounded-t-2xl sm:rounded-2xl p-4 sm:p-5
                       max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-5.5rem-env(safe-area-inset-bottom)))]
                       overflow-y-auto overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Plus size={18} className="text-purple-300" />
                {formatHour(slotModal.hour)} · {slotModal.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </h3>
              <button onClick={() => setSlotModal(null)} className="p-1 text-white/50 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSlotMode('task')}
                className={`flex-1 py-2 rounded-lg text-sm border ${slotMode === 'task' ? 'bg-blue-500/20 border-blue-400/40 text-blue-200' : 'bg-white/5 border-white/10 text-white/50'}`}
              >
                Add task
              </button>
              <button
                onClick={() => setSlotMode('block')}
                className={`flex-1 py-2 rounded-lg text-sm border ${slotMode === 'block' ? 'bg-orange-500/20 border-orange-400/40 text-orange-200' : 'bg-white/5 border-white/10 text-white/50'}`}
              >
                Block time
              </button>
            </div>
            <input
              type="text"
              value={slotTitle}
              onChange={(e) => setSlotTitle(e.target.value)}
              placeholder={slotMode === 'task' ? 'Task title…' : 'e.g. On-site / Meeting…'}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              autoFocus
            />
            <label className="text-xs text-white/50 mb-1 block">Duration (minutes)</label>
            <input
              type="number"
              min={15}
              max={480}
              value={slotMinutes}
              onChange={(e) => setSlotMinutes(parseInt(e.target.value, 10) || 60)}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2 text-white text-sm mb-4"
            />
            <button
              onClick={saveSlot}
              disabled={slotSaving || !slotTitle.trim()}
              className="w-full py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl font-medium disabled:opacity-50"
            >
              {slotSaving ? 'Saving…' : slotMode === 'task' ? 'Create task' : 'Add block'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
