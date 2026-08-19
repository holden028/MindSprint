import React, { useState, useEffect } from 'react';
import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import TemplateEditorModal from './TemplateEditorModal';
import { LayoutTemplate, Trash2, Pencil, Play, Plus, FolderKanban, Target, Clock, Sparkles } from 'lucide-react';

export default function TemplatesPage() {
  const [tab, setTab] = useState('task');
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [projectTemplates, setProjectTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const [taskRes, projRes] = await Promise.all([
        api.get('/templates/tasks'),
        api.get('/templates/projects'),
      ]);
      setTaskTemplates(taskRes.data.templates || taskRes.data || []);
      setProjectTemplates(projRes.data.templates || projRes.data || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (type, id) => {
    if (!confirm('Delete this template?')) return;
    try {
      await api.delete(`/templates/${type}/${id}`);
      await loadTemplates();
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete template.');
    }
  };

  const handleUse = async (type, id) => {
    try {
      await api.post(`/templates/${type}/${id}/use`);
      alert(`${type === 'tasks' ? 'Task' : 'Project'} created from template!`);
    } catch (err) {
      console.error('Use template failed:', err);
      alert('Failed to create from template.');
    }
  };

  const openNew = () => {
    setEditingTemplate(null);
    setEditorOpen(true);
  };

  const openEdit = (template) => {
    setEditingTemplate(template);
    setEditorOpen(true);
  };

  const handleSaved = () => {
    setEditorOpen(false);
    setEditingTemplate(null);
    loadTemplates();
  };

  if (loading) return <LoadingSpinner embedded />;

  const templates = tab === 'task' ? taskTemplates : projectTemplates;
  const templateType = tab === 'task' ? 'tasks' : 'projects';

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Templates</h2>
          <p className="text-white/60">Reusable task and project templates</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl transition-all shadow-lg font-medium"
        >
          <Plus size={18} />
          New Template
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('task')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            tab === 'task' ? 'bg-white/15 text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <Target size={16} />
          Task Templates
        </button>
        <button
          onClick={() => setTab('project')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
            tab === 'project' ? 'bg-white/15 text-white shadow-lg' : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          <FolderKanban size={16} />
          Project Templates
        </button>
      </div>

      {/* Grid */}
      {templates.length === 0 ? (
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-12 text-center shadow-2xl">
          <div className="backdrop-blur-lg bg-white/5 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
            <LayoutTemplate className="w-12 h-12 text-white/60" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-3">No {tab} templates yet</h3>
          <p className="text-white/70 mb-8 text-lg">Create your first template manually or with AI</p>
          <button
            onClick={openNew}
            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl transition-all shadow-lg font-semibold inline-flex items-center gap-3"
          >
            <Plus size={20} />
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((tmpl) => (
            <div
              key={tmpl.id}
              className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 hover:bg-white/15 transition-all group shadow-lg"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-white font-semibold text-lg flex-1 pr-2">{tmpl.name}</h3>
                {tmpl.ai_generated && (
                  <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 border border-purple-400/30 flex items-center gap-1">
                    <Sparkles size={10} /> AI
                  </span>
                )}
              </div>

              <p className="text-white/60 text-sm mb-4 line-clamp-2">{tmpl.description || 'No description'}</p>

              {tab === 'task' && (
                <div className="flex items-center gap-4 text-sm text-white/50 mb-4">
                  {tmpl.est_minutes && (
                    <span className="flex items-center gap-1"><Clock size={14} />{tmpl.est_minutes}m</span>
                  )}
                  {tmpl.priority && <span>P{tmpl.priority}</span>}
                  {tmpl.urgency && <span>U{tmpl.urgency}</span>}
                </div>
              )}

              {tab === 'project' && tmpl.tasks && tmpl.tasks.length > 0 && (
                <div className="text-sm text-white/50 mb-4">
                  {tmpl.tasks.length} task{tmpl.tasks.length !== 1 ? 's' : ''} included
                </div>
              )}

              {tmpl.tags && tmpl.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {tmpl.tags.map((tag, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-200">{tag}</span>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-3 border-t border-white/10">
                <button
                  onClick={() => handleUse(templateType, tmpl.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 text-green-200 rounded-lg transition-all text-sm"
                >
                  <Play size={14} /> Use
                </button>
                <button
                  onClick={() => openEdit(tmpl)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-200 rounded-lg transition-all text-sm"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(templateType, tmpl.id)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 text-red-200 rounded-lg transition-all text-sm opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editorOpen && (
        <TemplateEditorModal
          template={editingTemplate}
          type={tab}
          onSave={handleSaved}
          onClose={() => { setEditorOpen(false); setEditingTemplate(null); }}
        />
      )}
    </main>
  );
}
