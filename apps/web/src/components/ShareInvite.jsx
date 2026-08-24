import React, { useEffect, useState } from 'react';
import { UserPlus, X, Mail } from 'lucide-react';
import api from '../services/api';

export default function ShareInvite({ taskId, projectId, canShare = true }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('edit');
  const [shares, setShares] = useState([]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [openOverrides, setOpenOverrides] = useState(null);

  const load = async () => {
    try {
      const params = taskId ? { task_id: taskId } : projectId ? { project_id: projectId } : {};
      const { data } = await api.get('/shares', { params });
      const outgoing = data.outgoing || [];
      setShares(outgoing.filter((s) => (
        (taskId && s.task_id === taskId) ||
        (projectId && s.project_id === projectId)
      )));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
  }, [taskId, projectId]);

  useEffect(() => {
    if (!projectId || !canShare) return;
    api.get(`/tasks?project_id=${projectId}`)
      .then(({ data }) => setProjectTasks(data.tasks || []))
      .catch(() => {});
  }, [projectId, canShare]);

  if (!canShare && shares.length === 0) return null;

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg('');
    try {
      const { data } = await api.post('/shares', {
        email: email.trim(),
        role,
        task_id: taskId || undefined,
        project_id: projectId || undefined
      });
      setEmail('');
      setMsg(data.message || 'Shared');
      await load();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to share');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (id) => {
    try {
      await api.delete(`/shares/${id}`);
      await load();
    } catch {
      setMsg('Failed to remove');
    }
  };

  const overrideFor = (share, task) => {
    const found = (share.overrides || []).find((o) => o.task_id === task.id);
    return found?.role || share.role || 'edit';
  };

  const handleOverride = async (share, taskIdToSet, nextRole) => {
    const overrides = projectTasks.map((t) => ({
      task_id: t.id,
      role: t.id === taskIdToSet ? nextRole : overrideFor(share, t)
    }));
    try {
      await api.put(`/shares/${share.id}/overrides`, { overrides });
      await load();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Failed to update access');
    }
  };

  return (
    <div className="mb-6 backdrop-blur-sm bg-white/5 border border-white/10 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <UserPlus className="text-cyan-400" size={16} />
        Share
      </h3>
      <p className="text-xs text-white/45 mb-3">
        They keep their own tasks. Shared items show up beside those — they cannot see anything you have not invited them to.
      </p>
      {canShare && (
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@email.com"
            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value="edit">Can edit</option>
            <option value="view">View only</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 bg-cyan-500/20 border border-cyan-400/30 text-cyan-100 rounded-lg text-sm hover:bg-cyan-500/30 disabled:opacity-50"
          >
            {busy ? 'Sharing…' : 'Invite'}
          </button>
        </form>
      )}
      {msg && <p className="text-xs text-white/70 mb-2">{msg}</p>}
      {shares.length > 0 && (
        <ul className="space-y-2">
          {shares.map((s) => (
            <li key={s.id} className="text-sm bg-white/5 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-white/80 truncate flex items-center gap-2">
                  <Mail size={14} className="text-white/40 shrink-0" />
                  {s.invitee_email}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] px-1.5 py-0.5 rounded border border-white/20 text-white/60">
                    {s.role === 'view' ? 'View' : 'Edit'}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    s.status === 'accepted'
                      ? 'border-green-400/30 text-green-300'
                      : 'border-amber-400/30 text-amber-200'
                  }`}>
                    {s.status === 'accepted' ? 'Can see it' : 'Waiting for signup'}
                  </span>
                  {canShare && (
                    <button onClick={() => handleRemove(s.id)} className="text-white/40 hover:text-red-300 p-0.5">
                      <X size={14} />
                    </button>
                  )}
                </span>
              </div>
              {canShare && projectId && projectTasks.length > 0 && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setOpenOverrides(openOverrides === s.id ? null : s.id)}
                    className="text-[11px] text-cyan-300/80 hover:text-cyan-200"
                  >
                    {openOverrides === s.id ? 'Hide per-task access' : 'Per-task access'}
                  </button>
                  {openOverrides === s.id && (
                    <ul className="mt-2 space-y-1">
                      {projectTasks.map((t) => (
                        <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-white/70 truncate">{t.title}</span>
                          <select
                            value={overrideFor(s, t)}
                            onChange={(e) => handleOverride(s, t.id, e.target.value)}
                            className="bg-white/10 border border-white/15 rounded px-1.5 py-1 text-[11px] text-white"
                          >
                            <option value="edit">Edit</option>
                            <option value="view">View</option>
                            <option value="hidden">Hidden</option>
                          </select>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
