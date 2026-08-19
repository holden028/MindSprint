import React, { useState } from 'react';
import Modal from './Modal';
import { X, Plus, Trash2, Sparkles, RefreshCw } from 'lucide-react';
import api from '../services/api';

export default function TemplateEditorModal({ template, type, onSave, onClose }) {
  const isEdit = !!template;
  const isProject = type === 'project';

  const [name, setName] = useState(template?.name || '');
  const [title, setTitle] = useState(template?.title || '');
  const [description, setDescription] = useState(template?.description || '');
  const [icon, setIcon] = useState(template?.icon || '');
  const [estMinutes, setEstMinutes] = useState(template?.est_minutes || 30);
  const [priority, setPriority] = useState(template?.priority || 3);
  const [urgency, setUrgency] = useState(template?.urgency || 3);
  const [tags, setTags] = useState((template?.tags || []).join(', '));
  const [tasks, setTasks] = useState(template?.tasks || []);
  const [saving, setSaving] = useState(false);

  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [refining, setRefining] = useState(false);
  const [showAI, setShowAI] = useState(false);

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await api.post('/ai/generate-template', {
        description: aiPrompt,
        type: isProject ? 'project' : 'task',
      });
      const t = res.data.template;
      setName(t.name || '');
      setDescription(t.description || '');
      if (isProject) {
        setIcon(t.icon || '');
        setTasks(t.tasks || []);
      } else {
        setTitle(t.title || '');
        setEstMinutes(t.est_minutes || 30);
        setPriority(t.priority || 3);
        setUrgency(t.urgency || 3);
        setTags((t.tags || []).join(', '));
      }
      setShowAI(false);
    } catch (err) {
      console.error('AI generate failed:', err);
      alert('AI generation failed. Please try again.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleRefine = async () => {
    if (!refinePrompt.trim()) return;
    setRefining(true);
    try {
      const current = isProject
        ? { name, description, icon, tasks }
        : { name, title, description, est_minutes: estMinutes, priority, urgency, tags: tags.split(',').map(t => t.trim()).filter(Boolean) };
      const res = await api.post('/ai/refine-template', {
        template: current,
        instruction: refinePrompt,
        type: isProject ? 'project' : 'task',
      });
      const t = res.data.template;
      setName(t.name || name);
      setDescription(t.description || description);
      if (isProject) {
        setIcon(t.icon || icon);
        setTasks(t.tasks || tasks);
      } else {
        setTitle(t.title || title);
        setEstMinutes(t.est_minutes || estMinutes);
        setPriority(t.priority || priority);
        setUrgency(t.urgency || urgency);
        setTags((t.tags || []).join(', '));
      }
      setRefinePrompt('');
    } catch (err) {
      console.error('Refine failed:', err);
      alert('AI refinement failed.');
    } finally {
      setRefining(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = isProject
        ? { name, description, icon, tasks }
        : { name, title, description, est_minutes: estMinutes, priority, urgency, tags: tags.split(',').map(t => t.trim()).filter(Boolean) };

      if (isEdit) {
        await api.put(`/templates/${isProject ? 'projects' : 'tasks'}/${template.id}`, payload);
      } else {
        await api.post(`/templates/${isProject ? 'projects' : 'tasks'}`, payload);
      }
      onSave();
    } catch (err) {
      console.error('Save template failed:', err);
      alert('Failed to save template.');
    } finally {
      setSaving(false);
    }
  };

  const addSubTask = () => {
    setTasks([...tasks, { title: '', description: '', est_minutes: 30, priority: 3, urgency: 3, sort_order: tasks.length }]);
  };

  const updateSubTask = (idx, field, value) => {
    const updated = [...tasks];
    updated[idx] = { ...updated[idx], [field]: value };
    setTasks(updated);
  };

  const removeSubTask = (idx) => {
    setTasks(tasks.filter((_, i) => i !== idx));
  };

  const inputClass = 'w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50';

  return (
    <Modal className="max-w-2xl p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">
          {isEdit ? 'Edit' : 'New'} {isProject ? 'Project' : 'Task'} Template
        </h2>
        <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* AI Generate Section */}
      {!isEdit && (
        <div className="mb-6">
          {showAI ? (
            <div className="backdrop-blur-sm bg-purple-500/10 border border-purple-400/30 rounded-xl p-4 space-y-3">
              <label className="block text-sm font-medium text-purple-200">Describe the template you need</label>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className={inputClass}
                rows={3}
                placeholder={isProject ? 'e.g. A marketing campaign project with research, content, and launch phases' : 'e.g. A weekly code review task with checklist'}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAIGenerate}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-500/30 hover:bg-purple-500/40 border border-purple-400/30 text-purple-200 rounded-lg transition-all disabled:opacity-50"
                >
                  <Sparkles size={16} />
                  {aiLoading ? 'Generating...' : 'Generate with AI'}
                </button>
                <button onClick={() => setShowAI(false)} className="px-4 py-2 text-white/60 hover:text-white transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAI(true)}
              className="flex items-center gap-2 px-4 py-2 backdrop-blur-md bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-200 rounded-lg transition-all"
            >
              <Sparkles size={16} />
              Generate with AI
            </button>
          )}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Template Name *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Template name" required />
        </div>

        {!isProject && (
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">Task Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="Default task title" />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} rows={3} placeholder="Template description" />
        </div>

        {isProject && (
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">Icon</label>
            <input type="text" value={icon} onChange={(e) => setIcon(e.target.value)} className={inputClass} placeholder="e.g. rocket, briefcase" />
          </div>
        )}

        {!isProject && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Est. Minutes</label>
                <input type="number" min="1" max="480" value={estMinutes} onChange={(e) => setEstMinutes(parseInt(e.target.value) || 30)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Priority (1-5)</label>
                <input type="number" min="1" max="5" value={priority} onChange={(e) => setPriority(parseInt(e.target.value) || 3)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Urgency (1-5)</label>
                <input type="number" min="1" max="5" value={urgency} onChange={(e) => setUrgency(parseInt(e.target.value) || 3)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">Tags (comma-separated)</label>
              <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} placeholder="e.g. design, review, weekly" />
            </div>
          </>
        )}

        {isProject && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-white/80">Template Tasks</label>
              <button onClick={addSubTask} className="flex items-center gap-1 text-sm text-blue-300 hover:text-blue-200 transition-colors">
                <Plus size={14} /> Add Task
              </button>
            </div>
            <div className="space-y-3">
              {tasks.map((t, idx) => (
                <div key={idx} className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-3 flex gap-3 items-start">
                  <div className="flex-1 space-y-2">
                    <input
                      type="text"
                      value={t.title}
                      onChange={(e) => updateSubTask(idx, 'title', e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                      placeholder="Task title"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number" min="1" max="480"
                        value={t.est_minutes || 30}
                        onChange={(e) => updateSubTask(idx, 'est_minutes', parseInt(e.target.value) || 30)}
                        className="w-20 bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
                        title="Est. minutes"
                      />
                      <span className="text-white/40 text-sm self-center">min</span>
                    </div>
                  </div>
                  <button onClick={() => removeSubTask(idx)} className="p-1.5 text-red-300 hover:text-red-200 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Refine */}
        <div className="backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-4">
          <label className="block text-sm font-medium text-white/60 mb-2">
            <RefreshCw size={14} className="inline mr-1" />
            Refine with AI
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={refinePrompt}
              onChange={(e) => setRefinePrompt(e.target.value)}
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-purple-500/50"
              placeholder="e.g. Make it more detailed, add a testing phase..."
            />
            <button
              onClick={handleRefine}
              disabled={refining || !refinePrompt.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-200 rounded-lg transition-all text-sm disabled:opacity-50"
            >
              <Sparkles size={14} />
              {refining ? 'Refining...' : 'Refine'}
            </button>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mt-6 pt-4 border-t border-white/10">
        <button onClick={onClose} className="flex-1 backdrop-blur-sm bg-white/10 border border-white/20 text-white px-6 py-3 rounded-xl hover:bg-white/20 transition-all">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 text-white px-6 py-3 rounded-xl transition-all"
        >
          {saving ? 'Saving...' : isEdit ? 'Update Template' : 'Save Template'}
        </button>
      </div>
    </Modal>
  );
}
