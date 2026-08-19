import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import LoadingSpinner from './LoadingSpinner';
import ManualProjectModal from './ManualProjectModal';
import ManualTaskModal from './ManualTaskModal';
import ProjectDetailsModal from './ProjectDetailsModal';
import { Tag, Brain, Eye, EyeOff, Trash2, FolderKanban, Plus, Target } from 'lucide-react';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showAITags, setShowAITags] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showManualProjectModal, setShowManualProjectModal] = useState(false);
  const [showManualTaskModal, setShowManualTaskModal] = useState(false);
  const [showProjectDetailsModal, setShowProjectDetailsModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await api.get('/projects');
      setProjects(response.data.projects || []);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateAllTags = async () => {
    setAnalyzing(true);
    try {
      const response = await api.post('/ai/auto-tag-all');
      alert(`AI Tags generated! ${response.data.projects_tagged} projects and ${response.data.tasks_tagged} tasks tagged.`);
      await loadProjects(); // Reload to show new tags
    } catch (error) {
      console.error('Failed to generate AI tags:', error);
      alert('Failed to generate AI tags. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const analyzeProjectRelationships = async () => {
    setAnalyzing(true);
    try {
      const response = await api.post('/ai/analyze-projects');
      setAiAnalysis(response.data);
    } catch (error) {
      console.error('Failed to analyze projects:', error);
      alert('Failed to analyze projects');
    } finally {
      setAnalyzing(false);
    }
  };

  const getTagColor = (tag) => {
    const colors = {
      marketing: 'bg-pink-500/20 text-pink-200',
      development: 'bg-blue-500/20 text-blue-200',
      design: 'bg-purple-500/20 text-purple-200',
      research: 'bg-green-500/20 text-green-200',
      planning: 'bg-yellow-500/20 text-yellow-200',
      urgent: 'bg-red-500/20 text-red-200'
    };
    return colors[tag.toLowerCase()] || 'bg-gray-500/20 text-gray-200';
  };

  const handleDeleteProject = async (projectId, e) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project? All tasks will be deleted.')) return;
    
    try {
      await api.delete(`/projects/${projectId}`);
      await loadProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
      alert('Failed to delete project');
    }
  };

  const handleProjectClick = (project) => {
    setSelectedProject(project);
    setShowProjectDetailsModal(true);
  };

  const handleViewTasks = (projectId) => {
    navigate(`/projects/${projectId}`);
  };

  if (loading) {
    return <LoadingSpinner embedded />;
  }

  return (
    <>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Your Projects</h2>
            <p className="text-white/60">View and manage all your projects</p>
          </div>

                 <div className="flex flex-wrap items-center gap-3">
                   <button
                     onClick={() => setShowAITags(!showAITags)}
                     className="flex items-center gap-2 px-4 py-2 backdrop-blur-md bg-white/10 hover:bg-white/15 border border-white/20 text-white rounded-lg transition-all shadow-lg"
                   >
                     {showAITags ? <EyeOff size={18} /> : <Eye size={18} />}
                     {showAITags ? 'Hide' : 'Show'} AI Tags
                   </button>

                   <button
                     onClick={generateAllTags}
                     disabled={analyzing || projects.length === 0}
                     className="flex items-center gap-2 px-4 py-2 backdrop-blur-md bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-200 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                   >
                     <Tag size={18} />
                     {analyzing ? 'Generating...' : 'Generate AI Tags'}
                   </button>

                   <button
                     onClick={analyzeProjectRelationships}
                     disabled={analyzing || projects.length < 2}
                     className="flex items-center gap-2 px-4 py-2 backdrop-blur-md bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-200 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                   >
                     <Brain size={18} />
                     {analyzing ? 'Analyzing...' : 'Analyze Relationships'}
                   </button>

            <div className="flex gap-2">
              <button
                onClick={() => setShowManualProjectModal(true)}
                className="flex items-center gap-2 px-4 py-2 backdrop-blur-md bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 text-green-200 rounded-lg transition-all shadow-lg"
                title="Create New Project"
              >
                <Plus size={18} />
                <span>New Project</span>
              </button>
              
              <button
                onClick={() => setShowManualTaskModal(true)}
                className="flex items-center gap-2 px-4 py-2 backdrop-blur-md bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-200 rounded-lg transition-all shadow-lg"
                title="Create New Task"
              >
                <Target size={18} />
                <span>New Task</span>
              </button>
            </div>
          </div>
        </div>

        {/* AI Analysis Results */}
        {aiAnalysis && (
          <div className="mb-8 backdrop-blur-sm bg-purple-500/10 border border-purple-400/30 rounded-xl p-6">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Brain className="text-purple-300" />
              AI Analysis Results
            </h3>
            
            {aiAnalysis.relationships && aiAnalysis.relationships.length > 0 && (
              <div className="mb-4">
                <h4 className="text-white/80 font-semibold mb-3">Project Relationships:</h4>
                <div className="space-y-2">
                  {aiAnalysis.relationships.map((rel, idx) => (
                    <div key={idx} className="bg-white/5 rounded-lg p-3">
                      <div className="text-white/90">
                        <span className="font-medium">{rel.project1}</span> 
                        {' '}&harr;{' '}
                        <span className="font-medium">{rel.project2}</span>
                      </div>
                      <div className="text-white/60 text-sm mt-1">
                        <span className="capitalize">{rel.type}</span>: {rel.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
              <div>
                <h4 className="text-white/80 font-semibold mb-3">Recommendations:</h4>
                <ul className="space-y-2">
                  {aiAnalysis.recommendations.map((rec, idx) => (
                    <li key={idx} className="text-white/70 flex items-start gap-2">
                      <span className="text-purple-300">•</span>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Projects Grid */}
        {projects.length === 0 ? (
          <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-12 text-center shadow-2xl">
            <div className="backdrop-blur-lg bg-white/5 rounded-full p-6 w-24 h-24 mx-auto mb-6 flex items-center justify-center">
              <FolderKanban className="w-12 h-12 text-white/60" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">No projects yet</h3>
            <p className="text-white/70 mb-8 text-lg">Create your first project manually or with AI</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setShowManualProjectModal(true)}
                className="px-8 py-4 backdrop-blur-md bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 text-green-200 rounded-xl transition-all flex items-center gap-3 shadow-lg font-semibold"
              >
                <Plus size={20} />
                Create Project
              </button>
              <button
                onClick={() => setShowManualTaskModal(true)}
                className="px-8 py-4 backdrop-blur-md bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-200 rounded-xl transition-all flex items-center gap-3 shadow-lg font-semibold"
              >
                <Target size={20} />
                Create Task
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-8 py-4 backdrop-blur-md bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-400/30 text-white rounded-xl transition-all shadow-lg font-semibold"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => {
              const progress = project.task_count > 0 
                ? (project.completed_tasks / project.task_count) * 100 
                : 0;

              return (
                <div
                  key={project.id}
                  onClick={() => handleProjectClick(project)}
                  className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-2xl p-6 hover:bg-white/15 hover:backdrop-blur-2xl transition-all cursor-pointer group shadow-lg hover:shadow-xl"
                >
                  <div className="flex items-start justify-between mb-4">
                    <h3 className="text-white font-semibold text-lg flex-1 pr-2">{project.title}</h3>
                    <button
                      onClick={(e) => handleDeleteProject(project.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded transition-all"
                      title="Delete Project"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  {showAITags && project.tags && project.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {project.tags.map((tag, idx) => (
                        <span key={idx} className={`text-xs px-2 py-1 rounded ${getTagColor(tag)}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="text-white/60 text-sm mb-4 line-clamp-2">{project.description || 'No description'}</p>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">Tasks:</span>
                      <span className="text-white/80">{project.completed_tasks}/{project.task_count}</span>
                    </div>

                    <div className="w-full bg-white/10 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {aiAnalysis && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <div className="text-xs text-purple-300 flex items-center gap-1">
                        <Brain size={12} />
                        AI Analysis Available
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modals */}
      {showManualProjectModal && (
        <ManualProjectModal
          onSuccess={() => {
            setShowManualProjectModal(false);
            loadProjects();
          }}
          onClose={() => setShowManualProjectModal(false)}
        />
      )}

             {showManualTaskModal && (
               <ManualTaskModal
                 onComplete={() => {
                   setShowManualTaskModal(false);
                   loadProjects();
                 }}
                 onClose={() => setShowManualTaskModal(false)}
               />
             )}

             {showProjectDetailsModal && selectedProject && (
               <ProjectDetailsModal
                 project={selectedProject}
                 onClose={() => {
                   setShowProjectDetailsModal(false);
                   setSelectedProject(null);
                 }}
                 onViewTasks={handleViewTasks}
               />
             )}
    </>
  );
}

