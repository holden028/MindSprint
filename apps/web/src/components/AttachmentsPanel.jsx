import React, { useEffect, useRef, useState } from 'react';
import { Paperclip, Download, Trash2, Loader, FileText, Image as ImageIcon } from 'lucide-react';
import api from '../services/api';

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }) {
  if (mimeType?.startsWith('image/')) return <ImageIcon size={14} className="text-purple-300 shrink-0" />;
  return <FileText size={14} className="text-blue-300 shrink-0" />;
}

export default function AttachmentsPanel({ taskId, projectId, canEdit = true, compact = false }) {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const loadAttachments = async () => {
    try {
      const params = taskId ? { task_id: taskId } : { project_id: projectId };
      const { data } = await api.get('/attachments', { params });
      setAttachments(data.attachments || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load attachments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (taskId || projectId) loadAttachments();
  }, [taskId, projectId]);

  const uploadFile = async (file) => {
    if (!file || !canEdit) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (taskId) formData.append('task_id', taskId);
      if (projectId) formData.append('project_id', projectId);

      const { data } = await api.post('/attachments', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAttachments((prev) => [data.attachment, ...prev]);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (attachment) => {
    try {
      const response = await api.get(`/attachments/${attachment.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.filename;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Download failed');
    }
  };

  const handleDelete = async (attachment) => {
    if (!confirm(`Delete ${attachment.filename}?`)) return;
    try {
      await api.delete(`/attachments/${attachment.id}`);
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (!canEdit) return;
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  return (
    <div className={compact ? '' : 'mb-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-4'}>
      {!compact && (
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Paperclip className="text-cyan-400" size={16} />
          Attachments
        </h3>
      )}

      {canEdit && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className={`mb-3 border border-dashed border-white/20 rounded-lg p-3 text-center transition-colors hover:border-cyan-400/40 hover:bg-white/5 ${compact ? 'py-2' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => uploadFile(e.target.files?.[0])}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 text-xs text-white/60 hover:text-white disabled:opacity-50"
          >
            {uploading ? <Loader size={14} className="animate-spin" /> : <Paperclip size={14} />}
            {uploading ? 'Uploading & reading file…' : 'Drop a file here or click to attach'}
          </button>
          <p className="text-[10px] text-white/30 mt-1">Images, PDFs, text — up to 10MB. AI can read these.</p>
        </div>
      )}

      {error && <p className="text-xs text-red-300 mb-2">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-white/40 text-xs">
          <Loader size={14} className="animate-spin" /> Loading…
        </div>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-white/40 italic">No attachments yet.</p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-start gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2"
            >
              <FileIcon mimeType={attachment.mime_type} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{attachment.filename}</div>
                <div className="text-[10px] text-white/40">{formatSize(attachment.size_bytes)}</div>
                {attachment.ai_summary && (
                  <p className="text-[11px] text-white/50 mt-1 line-clamp-2">{attachment.ai_summary}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(attachment)}
                  className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded"
                  title="Download"
                >
                  <Download size={14} />
                </button>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleDelete(attachment)}
                    className="p-1.5 text-white/40 hover:text-red-300 hover:bg-red-500/10 rounded"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Upload a file without linking to a task/project yet (for AI chat). */
export async function uploadChatAttachment(file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/attachments', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data.attachment;
}
