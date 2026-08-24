import React, { useState } from 'react'
import api from '../services/api'
import TaskClarificationModal from './TaskClarificationModal'
import Modal from './Modal'
import { X, Clock, Target, Zap, Brain, Repeat, CalendarClock } from 'lucide-react'

function ManualTaskModal({ onComplete, onClose, projectId = null }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    est_minutes: 15,
    priority: 3,
    urgency: 3,
    project_id: projectId,
    is_recurring: false,
    recurrence_rule: null,
    due_at: '',
  })
  const [showRecurrence, setShowRecurrence] = useState(false)
  const [recFreq, setRecFreq] = useState('daily')
  const [recInterval, setRecInterval] = useState(1)
  const [recDays, setRecDays] = useState([])
  const [recDayOfMonth, setRecDayOfMonth] = useState('')
  const [recEnds, setRecEnds] = useState('')

  const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

  const toggleDay = (d) =>
    setRecDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]))
  const [loading, setLoading] = useState(false)
  const [showClarification, setShowClarification] = useState(false)
  const [pendingTask, setPendingTask] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.title.trim()) return

    setLoading(true)
    const payload = { ...formData }
    if (payload.due_at) {
      payload.due_at = new Date(payload.due_at).toISOString()
    } else {
      delete payload.due_at
    }
    if (showRecurrence) {
      payload.is_recurring = true
      const rule = { freq: recFreq, interval: recInterval }
      if (recDays.length > 0) rule.days = recDays
      if (recDayOfMonth) rule.day_of_month = parseInt(recDayOfMonth, 10)
      if (recEnds) rule.ends = recEnds
      payload.recurrence_rule = rule
    }
    try {
      await api.post('/tasks', payload)
      onComplete()
      onClose()
    } catch (error) {
      console.error('Failed to create task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleClarificationConfirm = async (refinedTaskData) => {
    setLoading(true)
    try {
      await api.post('/tasks', refinedTaskData)
      onComplete()
      onClose()
    } catch (error) {
      console.error('Failed to create task:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleClarificationRefine = (refinedTaskData) => {
    setFormData(refinedTaskData)
    setShowClarification(false)
  }

  const handleClarificationClose = () => {
    setShowClarification(false)
    setPendingTask(null)
  }

  const matrixColor = (p, u) => {
    const score = p + u
    if (score <= 3) return 'bg-emerald-500/30 border-emerald-400/40 text-emerald-200'
    if (score <= 4) return 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300'
    if (score <= 5) return 'bg-yellow-500/20 border-yellow-400/30 text-yellow-200'
    if (score <= 6) return 'bg-amber-500/25 border-amber-400/35 text-amber-200'
    if (score <= 7) return 'bg-orange-500/25 border-orange-400/35 text-orange-200'
    if (score <= 8) return 'bg-red-500/25 border-red-400/35 text-red-200'
    return 'bg-red-600/35 border-red-400/50 text-red-100'
  }

  const matrixLabel = (p, u) => {
    const score = p + u
    if (score <= 3) return 'Backlog'
    if (score <= 4) return 'Low'
    if (score <= 5) return 'Plan'
    if (score <= 6) return 'Soon'
    if (score <= 7) return 'Do next'
    if (score <= 8) return 'Urgent'
    return 'Do now!'
  }

  const selectedColor = matrixColor(formData.priority, formData.urgency)

  return (
    <>
    <Modal className="max-w-2xl" onClose={onClose}>
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center space-x-2">
            <Target className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
            <span>Create Manual Task</span>
          </h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors p-1 -mr-1"
            type="button"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {/* Task Title */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Task Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="What needs to be done?"
              required
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder="Add more details about this task..."
              rows={3}
            />
          </div>

          {/* Estimated Time */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              <Clock className="h-4 w-4 inline mr-1" />
              Estimated Time (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="480"
              value={formData.est_minutes}
              onChange={(e) => setFormData({ ...formData, est_minutes: parseInt(e.target.value) || 15 })}
              className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          {/* Priority × Urgency Matrix */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-3">
              <Zap className="h-4 w-4 inline mr-1" />
              Priority &amp; Urgency
            </label>
            <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-2xl p-4">
              {/* Column headers — Urgency */}
              <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1.5 mb-1">
                <div className="w-16" />
                {['Not urgent', 'Slightly', 'Moderate', 'Pressing', 'Critical'].map((l, i) => (
                  <div key={i} className="text-[10px] text-white/40 text-center leading-tight">{l}</div>
                ))}
              </div>

              {/* Rows — Priority (5 = top) */}
              {[5, 4, 3, 2, 1].map((p) => (
                <div key={p} className="grid grid-cols-[auto_repeat(5,1fr)] gap-1.5 mb-1.5">
                  <div className="w-16 flex items-center">
                    <span className="text-[10px] text-white/40 leading-tight">
                      {p === 5 ? 'Critical' : p === 4 ? 'High' : p === 3 ? 'Medium' : p === 2 ? 'Low' : 'Minimal'}
                    </span>
                  </div>
                  {[1, 2, 3, 4, 5].map((u) => {
                    const isSelected = formData.priority === p && formData.urgency === u
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setFormData({ ...formData, priority: p, urgency: u })}
                        className={`relative h-10 rounded-lg border text-[10px] font-medium transition-all duration-200 ${matrixColor(p, u)} ${
                          isSelected
                            ? 'ring-2 ring-white/70 scale-105 shadow-lg'
                            : 'opacity-60 hover:opacity-90 hover:scale-[1.02]'
                        }`}
                      >
                        {matrixLabel(p, u)}
                      </button>
                    )
                  })}
                </div>
              ))}

              {/* Axis labels */}
              <div className="flex justify-between mt-2">
                <span className="text-[10px] text-white/30">← Importance (rows)</span>
                <span className="text-[10px] text-white/30">Time pressure (cols) →</span>
              </div>

              {/* Current selection summary */}
              <div className={`mt-3 text-center py-2 rounded-xl border ${selectedColor}`}>
                <span className="text-sm font-semibold">
                  {matrixLabel(formData.priority, formData.urgency)}
                </span>
                <span className="text-xs opacity-70 ml-2">
                  (P{formData.priority} / U{formData.urgency})
                </span>
              </div>
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <button
              type="button"
              onClick={() => setShowRecurrence(!showRecurrence)}
              className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border transition-all w-full ${
                showRecurrence
                  ? 'bg-purple-500/20 border-purple-400/30 text-purple-200'
                  : 'bg-white/5 border-white/10 text-white/60 hover:text-white/80'
              }`}
            >
              <Repeat size={16} />
              <span>Repeat</span>
              {showRecurrence && <span className="ml-auto text-xs opacity-60">ON</span>}
            </button>

            {showRecurrence && (
              <div className="mt-3 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex gap-2">
                  {['daily', 'weekly', 'monthly', 'custom'].map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setRecFreq(f)}
                      className={`flex-1 text-xs py-2 rounded-lg border transition-all capitalize ${
                        recFreq === f
                          ? 'bg-purple-500/20 border-purple-400/40 text-purple-200'
                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                {recFreq === 'custom' && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">Every N days/weeks</label>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={recInterval}
                        onChange={(e) => setRecInterval(parseInt(e.target.value) || 1)}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1.5 block">Days of week</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {WEEKDAYS.map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleDay(d)}
                            className={`px-2.5 py-1.5 text-xs rounded-lg border transition-all capitalize ${
                              recDays.includes(d)
                                ? 'bg-purple-500/25 border-purple-400/40 text-purple-200'
                                : 'bg-white/5 border-white/10 text-white/40 hover:text-white/60'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">Day of month (optional)</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={recDayOfMonth}
                        onChange={(e) => setRecDayOfMonth(e.target.value)}
                        placeholder="e.g. 15"
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 mb-1 block">End date (optional)</label>
                      <input
                        type="date"
                        value={recEnds}
                        onChange={(e) => setRecEnds(e.target.value)}
                        className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 [color-scheme:dark]"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Due Date */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              <CalendarClock className="h-4 w-4 inline mr-1" />
              Due Date
            </label>
            <input
              type="datetime-local"
              value={formData.due_at}
              onChange={(e) => setFormData({ ...formData, due_at: e.target.value })}
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 [color-scheme:dark]"
            />
            {formData.due_at && (
              <p className="text-xs text-white/40 mt-1.5">
                Auto ladder: morning of due day → start-by → due soon → at deadline (+ overdue follow-ups). In-app + Slack.
              </p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 backdrop-blur-sm bg-white/10 border border-white/20 text-white px-6 py-3 rounded-xl hover:bg-white/20 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingTask(formData)
                setShowClarification(true)
              }}
              className="flex-1 backdrop-blur-sm bg-purple-500/20 border border-purple-400/30 text-purple-200 px-6 py-3 rounded-xl hover:bg-purple-500/30 transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <Brain className="h-4 w-4" />
              <span>AI Assistant</span>
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl transition-all duration-200 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Target className="h-4 w-4" />
                  <span>Create Task</span>
                </>
              )}
            </button>
          </div>
        </form>
    </Modal>

      {/* AI Clarification Modal */}
      {showClarification && pendingTask && (
        <TaskClarificationModal
          taskData={pendingTask}
          onConfirm={handleClarificationConfirm}
          onRefine={handleClarificationRefine}
          onClose={handleClarificationClose}
        />
      )}
    </>
  )
}

export default ManualTaskModal

