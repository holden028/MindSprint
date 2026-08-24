import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Modal from './Modal';
import { X, Plus, Trash2, Loader } from 'lucide-react';
import { getEnvIcon } from '../utils/iconMap';

export default function CustomEnvironmentModal({ isOpen, onClose, onEnvironmentSelect }) {
  const [environments, setEnvironments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEnvironment, setNewEnvironment] = useState({ name: '', description: '' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadEnvironments();
    }
  }, [isOpen]);

  const loadEnvironments = async () => {
    setLoading(true);
    try {
      const response = await api.get('/custom-environments');
      setEnvironments(response.data.environments || []);
    } catch (error) {
      console.error('Failed to load custom environments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEnvironment = async (e) => {
    e.preventDefault();
    if (!newEnvironment.name.trim()) return;

    setCreating(true);
    try {
      const response = await api.post('/custom-environments', newEnvironment);
      setEnvironments(prev => [response.data.environment, ...prev]);
      setNewEnvironment({ name: '', description: '' });
      setShowAddForm(false);
    } catch (error) {
      console.error('Failed to create environment:', error);
      alert('Failed to create environment. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteEnvironment = async (id) => {
    if (!window.confirm('Are you sure you want to delete this environment?')) return;

    try {
      await api.delete(`/custom-environments/${id}`);
      setEnvironments(prev => prev.filter(env => env.id !== id));
    } catch (error) {
      console.error('Failed to delete environment:', error);
      alert('Failed to delete environment');
    }
  };

  const handleEnvironmentSelect = (environment) => {
    onEnvironmentSelect(environment);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Custom Environments</h2>
        <button
          onClick={onClose}
          className="p-2 hover:bg-white/10 rounded-lg transition-all"
        >
          <X className="text-white" size={24} />
        </button>
      </div>

      {showAddForm && (
        <div className="mb-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-4">
          <h3 className="text-lg font-semibold text-white mb-4">Add New Environment</h3>
          <form onSubmit={handleCreateEnvironment} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Environment Name *
              </label>
              <input
                type="text"
                value={newEnvironment.name}
                onChange={(e) => setNewEnvironment(prev => ({ ...prev, name: e.target.value }))}
                className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="e.g., 'Coffee Shop', 'Library', 'Gym'"
                maxLength={100}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/80 mb-2">
                Description (Optional)
              </label>
              <textarea
                value={newEnvironment.description}
                onChange={(e) => setNewEnvironment(prev => ({ ...prev, description: e.target.value }))}
                className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="Describe this environment..."
                rows={3}
                maxLength={500}
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="flex-1 backdrop-blur-sm bg-white/10 border border-white/20 text-white px-4 py-2 rounded-lg hover:bg-white/20 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating || !newEnvironment.name.trim()}
                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-all flex items-center justify-center gap-2"
              >
                {creating ? (
                  <>
                    <Loader className="animate-spin" size={16} />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Create Environment
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <Loader className="animate-spin mx-auto mb-4 text-white" size={32} />
          <p className="text-white/60">Loading environments...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {environments.length === 0 ? (
            <div className="text-center py-8 text-white/60">
              <p className="mb-4">No custom environments yet</p>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all"
              >
                Create Your First Environment
              </button>
            </div>
          ) : (
            environments.map((environment) => {
              const IconComponent = getEnvIcon(environment.icon_name);

              return (
                <div
                  key={environment.id}
                  className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg p-4 hover:bg-white/15 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-500/20 rounded-lg">
                        <IconComponent className="text-blue-300" size={20} />
                      </div>
                      <div>
                        <h3 className="text-white font-medium">{environment.name}</h3>
                        {environment.description && (
                          <p className="text-white/60 text-sm">{environment.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEnvironmentSelect(environment)}
                        className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-200 rounded-lg transition-all text-sm"
                      >
                        Select
                      </button>
                      <button
                        onClick={() => handleDeleteEnvironment(environment.id)}
                        className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        title="Delete Environment"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {environments.length > 0 && !showAddForm && (
        <div className="mt-6 pt-4 border-t border-white/10">
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 backdrop-blur-sm bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/15 transition-all"
          >
            <Plus size={20} />
            Add New Environment
          </button>
        </div>
      )}
    </Modal>
  );
}
