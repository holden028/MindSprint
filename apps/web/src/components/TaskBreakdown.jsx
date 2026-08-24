import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { X, Upload, FileText, Loader } from 'lucide-react';
import Modal from './Modal';

export default function TaskBreakdown({ onComplete, onClose }) {
  const [activeTab, setActiveTab] = useState('text');
  const [textContent, setTextContent] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [ingestId, setIngestId] = useState(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  // Poll for ingest status
  useEffect(() => {
    if (!ingestId) return;

    const pollStatus = setInterval(async () => {
      try {
        const response = await api.get(`/ingest/status/${ingestId}`);
        const status = response.data.ingest.status;

        if (status === 'completed') {
          clearInterval(pollStatus);
          setStatusMessage('Tasks created successfully! ');
          setTimeout(() => {
            onComplete();
          }, 1500);
        } else if (status === 'error') {
          clearInterval(pollStatus);
          setError(response.data.ingest.error_message || 'AI processing failed');
          setProcessing(false);
        } else if (status === 'processing') {
          setStatusMessage('AI is thinking...');
        }
      } catch (err) {
        console.error('Failed to poll status:', err);
      }
    }, 2000);

    return () => clearInterval(pollStatus);
  }, [ingestId, onComplete]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    setError('');
    setStatusMessage('Submitting...');

    try {
      let response;

      if (activeTab === 'text') {
        if (!textContent.trim()) {
          setError('Please enter some text');
          setProcessing(false);
          return;
        }

        response = await api.post('/ingest/text', {
          content: textContent
        });
      } else {
        if (!imageFile) {
          setError('Please select an image');
          setProcessing(false);
          return;
        }

        const formData = new FormData();
        formData.append('image', imageFile);

        response = await api.post('/ingest/screenshot', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      setIngestId(response.data.ingest.id);
      setStatusMessage('Queued for processing...');
    } catch (error) {
      console.error('Failed to submit:', error);
      
      let errorMsg = 'Failed to submit. Please try again.';
      if (error.response?.status === 401) {
        errorMsg = 'Authentication failed. Please log in again.';
      } else if (error.response?.status === 500) {
        errorMsg = 'Server error. The AI service might be unavailable.';
      } else if (error.response?.data?.error) {
        errorMsg = error.response.data.error;
      }
      
      setError(errorMsg);
      setProcessing(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
    }
  };

  return (
    <Modal className="max-w-2xl" onClose={onClose}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">AI Task Breakdown</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-lg transition-all"
          >
            <X className="text-white" size={24} />
          </button>
        </div>

        <div className="flex mb-6 bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('text')}
            className={`flex-1 py-2 rounded-md transition-all flex items-center justify-center gap-2 ${
              activeTab === 'text' ? 'bg-white/20 text-white' : 'text-white/60'
            }`}
          >
            <FileText size={18} />
            Text/Email
          </button>
          <button
            onClick={() => setActiveTab('screenshot')}
            className={`flex-1 py-2 rounded-md transition-all flex items-center justify-center gap-2 ${
              activeTab === 'screenshot' ? 'bg-white/20 text-white' : 'text-white/60'
            }`}
          >
            <Upload size={18} />
            Screenshot
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {activeTab === 'text' ? (
            <div className="mb-6">
              <label className="block text-white/80 mb-2">
                Paste your text, email, or task description
              </label>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste your email, task list, or project description here..."
                className="w-full h-64 px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                disabled={processing}
              />
            </div>
          ) : (
            <div className="mb-6">
              <label className="block text-white/80 mb-2">
                Upload a screenshot
              </label>
              <div className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                  id="image-upload"
                  disabled={processing}
                />
                <label
                  htmlFor="image-upload"
                  className="cursor-pointer flex flex-col items-center"
                >
                  <Upload className="text-white/60 mb-2" size={48} />
                  <span className="text-white/60">
                    {imageFile ? imageFile.name : 'Click to upload an image'}
                  </span>
                </label>
              </div>
            </div>
          )}

          {statusMessage && !error && (
            <div className={`mb-4 p-4 rounded-lg ${
              statusMessage.includes('successfully') 
                ? 'bg-green-500/20 border border-green-500/50 text-green-200'
                : 'bg-blue-500/20 border border-blue-500/50 text-blue-200'
            }`}>
              <div className="flex items-center gap-2">
                {!statusMessage.includes('successfully') && (
                  <Loader className="animate-spin" size={18} />
                )}
                {statusMessage}
              </div>
            </div>
          )}

          {error && (
            <div className="mb-4 bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={processing}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg font-semibold hover:from-purple-600 hover:to-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {processing ? (
              <>
                <Loader className="animate-spin" size={20} />
                Processing...
              </>
            ) : (
              'Generate Tasks'
            )}
          </button>
        </form>
    </Modal>
  );
}

