import React, { useState, useEffect } from 'react';
import { Settings, Hash, CheckCircle, AlertCircle, ChevronDown, ChevronUp, ExternalLink, Copy, Clock, Plus, Trash2, Calendar, Link2, RefreshCw, Globe, KeyRound } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const DAY_OPTIONS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' }
];

const COMMON_TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Warsaw',
  'Europe/Athens',
  'Europe/Moscow',
  'Atlantic/Reykjavik',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
  'UTC'
];

function listTimezones() {
  try {
    if (typeof Intl !== 'undefined' && typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
  } catch { /* ignore */ }
  return COMMON_TIMEZONES;
}

function formatTzPreview(tz) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short'
    }).format(new Date());
  } catch {
    return '';
  }
}

export default function SettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [slackUserId, setSlackUserId] = useState('');
  const [botToken, setBotToken] = useState('');
  const [appBaseUrl, setAppBaseUrl] = useState('');
  const [timezone, setTimezone] = useState('Europe/London');
  const [slackEnabled, setSlackEnabled] = useState(true);
  const [slackIntensity, setSlackIntensity] = useState('full');
  const [quietHoursStart, setQuietHoursStart] = useState(22);
  const [quietHoursEnd, setQuietHoursEnd] = useState(7);
  const [digestMorningHour, setDigestMorningHour] = useState(9);
  const [digestEveningHour, setDigestEveningHour] = useState(18);
  const [digestsEnabled, setDigestsEnabled] = useState(true);
  const [timezones] = useState(() => listTimezones());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState(null);
  const { user } = useAuth();

  // Schedule state
  const [timeBlocks, setTimeBlocks] = useState([]);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [newBlock, setNewBlock] = useState({ title: '', startTime: '09:00', endTime: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'], isRecurring: true });

  useEffect(() => {
    loadSettings();
    loadTimeBlocks();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await api.get('/profile/settings');
      if (data.slack_webhook_url) setWebhookUrl(data.slack_webhook_url);
      if (data.slack_user_id) setSlackUserId(data.slack_user_id);
      if (data.slack_bot_token) setBotToken(data.slack_bot_token);
      if (data.app_base_url) setAppBaseUrl(data.app_base_url);
      if (data.timezone) setTimezone(data.timezone);
      else {
        try {
          setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London');
        } catch {
          setTimezone('Europe/London');
        }
      }
      if (data.slack_enabled !== undefined && data.slack_enabled !== null) setSlackEnabled(!!data.slack_enabled);
      if (data.slack_intensity) setSlackIntensity(data.slack_intensity);
      if (data.quiet_hours_start !== undefined && data.quiet_hours_start !== null) setQuietHoursStart(Number(data.quiet_hours_start));
      if (data.quiet_hours_end !== undefined && data.quiet_hours_end !== null) setQuietHoursEnd(Number(data.quiet_hours_end));
      if (data.digest_morning_hour !== undefined && data.digest_morning_hour !== null) setDigestMorningHour(Number(data.digest_morning_hour));
      if (data.digest_evening_hour !== undefined && data.digest_evening_hour !== null) setDigestEveningHour(Number(data.digest_evening_hour));
      if (data.digests_enabled !== undefined && data.digests_enabled !== null) setDigestsEnabled(!!data.digests_enabled);
    } catch {
      // settings may not exist yet
    } finally {
      setLoaded(true);
    }
  };

  const loadTimeBlocks = async () => {
    try {
      const { data } = await api.get('/schedule/blocks?from=2020-01-01&to=2030-12-31');
      // Deduplicate recurring blocks by id
      const unique = [];
      const seen = new Set();
      for (const b of data.blocks) {
        if (!seen.has(b.id)) { seen.add(b.id); unique.push(b); }
      }
      setTimeBlocks(unique);
    } catch { /* no blocks yet */ }
  };

  const handleAddBlock = async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const payload = {
        title: newBlock.title || 'Busy',
        starts_at: `${today}T${newBlock.startTime}:00`,
        ends_at: `${today}T${newBlock.endTime}:00`,
      };
      if (newBlock.isRecurring && newBlock.days.length > 0) {
        payload.recurrence_rule = { freq: 'weekly', interval: 1, days: newBlock.days };
      }
      await api.post('/schedule/blocks', payload);
      setShowAddBlock(false);
      setNewBlock({ title: '', startTime: '09:00', endTime: '17:00', days: ['mon', 'tue', 'wed', 'thu', 'fri'], isRecurring: true });
      loadTimeBlocks();
    } catch (err) {
      setStatus({ type: 'error', msg: err.response?.data?.error || 'Failed to add time block' });
    }
  };

  const handleDeleteBlock = async (id) => {
    try {
      await api.delete(`/schedule/blocks/${id}`);
      loadTimeBlocks();
    } catch { /* ignore */ }
  };

  const toggleDay = (day) => {
    setNewBlock(prev => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day]
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      await api.put('/profile', {
        slack_webhook_url: webhookUrl || null,
        slack_user_id: slackUserId || null,
        slack_bot_token: botToken || null,
        app_base_url: appBaseUrl || null,
        timezone: timezone || 'Europe/London',
        slack_enabled: slackEnabled,
        slack_intensity: slackIntensity,
        quiet_hours_start: quietHoursStart,
        quiet_hours_end: quietHoursEnd,
        digest_morning_hour: digestMorningHour,
        digest_evening_hour: digestEveningHour,
        digests_enabled: digestsEnabled,
      });
      setStatus({ type: 'success', msg: 'Settings saved!' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.response?.data?.error || 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshLadders = async () => {
    setRefreshing(true);
    setStatus(null);
    try {
      const { data } = await api.post('/reminders/refresh-ladders');
      setStatus({ type: 'success', msg: data.message || `Refreshed ${data.refreshed} task(s)` });
    } catch (err) {
      setStatus({ type: 'error', msg: err.response?.data?.error || 'Failed to refresh reminders' });
    } finally {
      setRefreshing(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    try {
      await api.post('/notifications/test-slack');
      setStatus({ type: 'success', msg: 'Test notification sent! Check your Slack channel.' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.response?.data?.error || 'Test failed — check your webhook URL.' });
    } finally {
      setTesting(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordStatus(null);
    if (!newPassword) {
      setPasswordStatus({ type: 'error', msg: 'Enter a new password' });
      return;
    }
    if (newPassword.length < 6) {
      setPasswordStatus({ type: 'error', msg: 'Password must be at least 6 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', msg: 'Passwords do not match' });
      return;
    }

    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', { newPassword });
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus({ type: 'success', msg: 'Password updated successfully' });
    } catch (err) {
      setPasswordStatus({ type: 'error', msg: err.response?.data?.error || 'Failed to change password' });
    } finally {
      setChangingPassword(false);
    }
  };

    const apiBase = (() => {
      const configured = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
      if (configured) return configured;
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:8080';
      return `${window.location.protocol}//${host}/api`;
    })();

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setStatus({ type: 'success', msg: 'Copied to clipboard!' });
    setTimeout(() => setStatus(null), 2000);
  };

  if (!loaded) return null;

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="text-white" size={28} />
        <h2 className="text-3xl font-bold text-white">Settings</h2>
      </div>

      {/* Change password — own account only */}
      <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <KeyRound size={20} className="text-amber-400" />
          Password
        </h3>
        <p className="text-sm text-white/50 mb-4">
          Set a new password for your account{user?.email ? ` (${user.email})` : ''}.
        </p>
        <label className="block text-sm font-medium text-white/70 mb-1.5">New password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 mb-3 text-sm"
          placeholder="At least 6 characters"
        />
        <label className="block text-sm font-medium text-white/70 mb-1.5">Confirm password</label>
        <input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-500/50 mb-4 text-sm"
          placeholder="Repeat new password"
        />
        <button
          onClick={handleChangePassword}
          disabled={changingPassword}
          className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl transition-all text-sm font-medium"
        >
          {changingPassword ? 'Updating…' : 'Set password'}
        </button>
        {passwordStatus && (
          <div className={`mt-4 flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${
            passwordStatus.type === 'success'
              ? 'bg-green-500/10 border-green-400/30 text-green-300'
              : 'bg-red-500/10 border-red-400/30 text-red-300'
          }`}>
            {passwordStatus.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {passwordStatus.msg}
          </div>
        )}
      </div>

      {/* Schedule / Time Blocks */}
      <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Calendar size={20} className="text-blue-400" />
          My Schedule
        </h3>
        <p className="text-sm text-white/50 mb-4">
          Block out times when you're unavailable (on-site, meetings, etc). MindSprint uses this to schedule reminders and plan your day around your real availability.
        </p>

        {timeBlocks.length > 0 && (
          <div className="space-y-2 mb-4">
            {timeBlocks.map(block => {
              const rule = block.recurrence_rule;
              const days = rule?.days?.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
              const startT = new Date(block.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const endT = new Date(block.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              return (
                <div key={block.id} className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                  <div>
                    <span className="text-white font-medium text-sm">{block.title}</span>
                    <span className="text-white/50 text-sm ml-3">{startT} - {endT}</span>
                    {days && <span className="text-white/40 text-xs ml-3">{days}</span>}
                  </div>
                  <button onClick={() => handleDeleteBlock(block.id)} className="text-red-400/60 hover:text-red-400 p-1">
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {showAddBlock ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
            <input
              type="text"
              value={newBlock.title}
              onChange={e => setNewBlock(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g. On-site work, Gym, School run..."
              className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-white/50 mb-1 block">From</label>
                <input type="time" value={newBlock.startTime} onChange={e => setNewBlock(prev => ({ ...prev, startTime: e.target.value }))}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-white/50 mb-1 block">To</label>
                <input type="time" value={newBlock.endTime} onChange={e => setNewBlock(prev => ({ ...prev, endTime: e.target.value }))}
                  className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-2 block">Repeats on</label>
              <div className="flex gap-1.5">
                {DAY_OPTIONS.map(d => (
                  <button key={d.key} onClick={() => toggleDay(d.key)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      newBlock.days.includes(d.key)
                        ? 'bg-blue-500/30 text-blue-200 border border-blue-400/40'
                        : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                    }`}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={handleAddBlock} className="bg-gradient-to-r from-blue-500 to-cyan-500 text-white px-4 py-2 rounded-lg text-sm font-medium">Add Block</button>
              <button onClick={() => setShowAddBlock(false)} className="text-white/50 hover:text-white px-4 py-2 text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddBlock(true)} className="flex items-center gap-2 text-blue-300 hover:text-blue-200 text-sm font-medium">
            <Plus size={16} /> Add Time Block
          </button>
        )}
      </div>

      {/* Timezone */}
      <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Globe size={20} className="text-emerald-400" />
          Timezone
        </h3>
        <p className="text-sm text-white/50 mb-4">
          Used for AI clock answers, digests, and quiet hours (configurable below).
        </p>
        <label className="block text-sm font-medium text-white/70 mb-1.5">Your timezone</label>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/50 mb-2 text-sm"
        >
          {!timezones.includes(timezone) && (
            <option value={timezone}>{timezone}</option>
          )}
          {timezones.map((tz) => (
            <option key={tz} value={tz} className="bg-slate-900 text-white">
              {tz}
            </option>
          ))}
        </select>
        <p className="text-xs text-white/40 mb-3">
          Local time now: {formatTzPreview(timezone) || '—'}
        </p>
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl transition-all text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Save timezone'}
        </button>
      </div>

      {/* App URL for Slack deep links */}
      <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Link2 size={20} className="text-cyan-400" />
          App URL (for Slack links)
        </h3>
        <p className="text-sm text-white/50 mb-4">
          Domain or IP where MindSprint is reachable. Slack messages append paths like{' '}
          <code className="text-white/60">/projects/…?task=…</code>. Accepts IPs and hostnames
          (with or without <code className="text-white/60">http://</code>).
        </p>
        <label className="block text-sm font-medium text-white/70 mb-1.5">Public base URL</label>
        <input
          type="text"
          value={appBaseUrl}
          onChange={(e) => setAppBaseUrl(e.target.value)}
          placeholder="192.168.1.10:5174 or mindsprint.example.com or https://…"
          className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 mb-3 text-sm"
        />
        {appBaseUrl.trim() && (
          <p className="text-xs text-white/40 mb-3">
            Example link: {appBaseUrl.replace(/\/+$/, '')}/projects/&lt;id&gt;?task=&lt;id&gt;
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl transition-all text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save URL'}
          </button>
          <button
            onClick={handleRefreshLadders}
            disabled={refreshing}
            className="backdrop-blur-sm bg-white/10 border border-white/20 text-white px-6 py-2.5 rounded-xl hover:bg-white/20 transition-all text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing…' : 'Refresh reminder ladders'}
          </button>
        </div>
        {status && (
          <div className={`mt-4 flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${
            status.type === 'success'
              ? 'bg-green-500/10 border-green-400/30 text-green-300'
              : 'bg-red-500/10 border-red-400/30 text-red-300'
          }`}>
            {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {status.msg}
          </div>
        )}
      </div>

      {/* Slack nag volume / digests / quiet hours */}
      <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Clock size={20} className="text-violet-400" />
          Slack nags &amp; digests
        </h3>
        <p className="text-sm text-white/50 mb-4">
          Control how often MindSprint pings you in Slack. In-app notifications are unchanged.
        </p>

        <label className="flex items-center gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={slackEnabled}
            onChange={(e) => setSlackEnabled(e.target.checked)}
            className="rounded border-white/30 bg-white/10 text-violet-500 focus:ring-violet-500/40"
          />
          <span className="text-sm text-white/80">Enable Slack reminders (unmute)</span>
        </label>

        <label className="block text-sm font-medium text-white/70 mb-1.5">Nag intensity</label>
        <select
          value={slackIntensity}
          onChange={(e) => setSlackIntensity(e.target.value)}
          className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 mb-4 text-sm"
        >
          <option value="full" className="bg-slate-900">Full — all ladder steps</option>
          <option value="medium" className="bg-slate-900">Medium — day before, morning, start-by, hour before, deadline</option>
          <option value="light" className="bg-slate-900">Light — morning, hour before, deadline only</option>
        </select>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-white/50 mb-1">Quiet hours start</label>
            <input
              type="number"
              min={0}
              max={23}
              value={quietHoursStart}
              onChange={(e) => setQuietHoursStart(Number(e.target.value))}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Quiet hours end</label>
            <input
              type="number"
              min={0}
              max={23}
              value={quietHoursEnd}
              onChange={(e) => setQuietHoursEnd(Number(e.target.value))}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
        </div>
        <p className="text-xs text-white/40 mb-4">
          Slack nags are skipped during quiet hours (deadlines still fire). Default 22→7 overnight.
        </p>

        <label className="flex items-center gap-3 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={digestsEnabled}
            onChange={(e) => setDigestsEnabled(e.target.checked)}
            className="rounded border-white/30 bg-white/10 text-violet-500 focus:ring-violet-500/40"
          />
          <span className="text-sm text-white/80">Send morning &amp; evening digests</span>
        </label>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs text-white/50 mb-1">Morning digest hour</label>
            <input
              type="number"
              min={0}
              max={23}
              value={digestMorningHour}
              onChange={(e) => setDigestMorningHour(Number(e.target.value))}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1">Evening digest hour</label>
            <input
              type="number"
              min={0}
              max={23}
              value={digestEveningHour}
              onChange={(e) => setDigestEveningHour(Number(e.target.value))}
              className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl transition-all text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Save nag prefs'}
        </button>
      </div>

      {/* Quick Setup — Webhook for Notifications */}
      <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
          <Hash size={20} className="text-purple-400" />
          Slack Notifications (Quick Setup)
        </h3>
        <p className="text-sm text-white/50 mb-4">
          Get task reminders and notifications sent to a Slack channel. Takes 2 minutes.
        </p>

        <label className="block text-sm font-medium text-white/70 mb-1.5">Incoming Webhook URL</label>
        <input
          type="url"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/T00.../B00.../xxx"
          className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 mb-3 text-sm"
        />

        <label className="block text-sm font-medium text-white/70 mb-1.5">
          Your Slack User ID
          <span className="text-white/40 ml-1">(needed for slash commands)</span>
        </label>
        <input
          type="text"
          value={slackUserId}
          onChange={(e) => setSlackUserId(e.target.value)}
          placeholder="U0123456789"
          className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 mb-3 text-sm"
        />

        <label className="block text-sm font-medium text-white/70 mb-1.5">
          Bot Token
          <span className="text-white/40 ml-1">(enables DM notifications with proper pings)</span>
        </label>
        <input
          type="password"
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          placeholder="xoxb-..."
          className="w-full backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 mb-4 text-sm"
        />

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl transition-all text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || (!webhookUrl.trim() && !botToken.trim())}
            className="backdrop-blur-sm bg-white/10 border border-white/20 text-white px-6 py-2.5 rounded-xl hover:bg-white/20 transition-all text-sm font-medium disabled:opacity-50"
          >
            {testing ? 'Sending...' : 'Send Test'}
          </button>
        </div>

        {status && (
          <div className={`mt-4 flex items-center gap-2 text-sm px-4 py-3 rounded-xl border ${
            status.type === 'success'
              ? 'bg-green-500/10 border-green-400/30 text-green-300'
              : 'bg-red-500/10 border-red-400/30 text-red-300'
          }`}>
            {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {status.msg}
          </div>
        )}
      </div>

      {/* Full Slack App Setup Guide */}
      <div className="backdrop-blur-sm bg-white/10 border border-white/20 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-all"
        >
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              Slack App Setup Guide
              <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full">Interactive</span>
            </h3>
            <p className="text-sm text-white/50 mt-0.5">
              Events API, Home Tab, slash commands, modals, and interactive buttons
            </p>
          </div>
          {showGuide ? <ChevronUp className="text-white/50" size={20} /> : <ChevronDown className="text-white/50" size={20} />}
        </button>

        {showGuide && (
          <div className="px-6 pb-6 space-y-5 border-t border-white/10 pt-5">
            {/* Step 1 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 1</span>
                Create a Slack App
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener" className="text-purple-300 hover:underline inline-flex items-center gap-1">api.slack.com/apps <ExternalLink size={12} /></a> and click "Create New App" &rarr; "From scratch".</p>
                <p>Name it <strong className="text-white/80">MindSprint</strong> and select your workspace.</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 2</span>
                Enable Incoming Webhooks
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>In your app settings, go to <strong className="text-white/80">Incoming Webhooks</strong> &rarr; toggle it ON.</p>
                <p>Click "Add New Webhook to Workspace", choose a channel (e.g. #mindsprint), and copy the URL.</p>
                <p>Paste the URL in the "Webhook URL" field above.</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 3</span>
                Add Slash Commands
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Go to <strong className="text-white/80">Slash Commands</strong> &rarr; "Create New Command".</p>
                <p>Create a command with these settings:</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Command:</span>
                  <div className="flex items-center gap-2">
                    <code className="text-purple-300">/sprint</code>
                    <button onClick={() => copyToClipboard('/sprint')} className="p-1 hover:bg-white/10 rounded"><Copy size={12} className="text-white/40" /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Request URL:</span>
                  <div className="flex items-center gap-2">
                    <code className="text-purple-300 text-xs">{apiBase}/slack/commands</code>
                    <button onClick={() => copyToClipboard(`${apiBase}/slack/commands`)} className="p-1 hover:bg-white/10 rounded"><Copy size={12} className="text-white/40" /></button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Description:</span>
                  <span className="text-white/70">Manage MindSprint tasks</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Usage hint:</span>
                  <span className="text-white/70">[add|list|done|ask|due|link|help]</span>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 4</span>
                Enable Interactive Messages &amp; Shortcut
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Go to <strong className="text-white/80">Interactivity & Shortcuts</strong> &rarr; toggle ON.</p>
                <p>Set the Request URL to:</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 flex items-center justify-between">
                <code className="text-purple-300 text-sm">{apiBase}/slack/interactions</code>
                <button onClick={() => copyToClipboard(`${apiBase}/slack/interactions`)} className="p-1 hover:bg-white/10 rounded"><Copy size={12} className="text-white/40" /></button>
              </div>
              <p className="text-sm text-white/50">Add a Global Shortcut with callback ID <code className="text-purple-300">new_mindsprint_task</code> (label: &quot;New MindSprint task&quot;).</p>
            </div>

            {/* Step 5 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 5</span>
                Event Subscriptions + App Home
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Go to <strong className="text-white/80">Event Subscriptions</strong> &rarr; toggle ON. Request URL:</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 flex items-center justify-between mb-2">
                <code className="text-purple-300 text-sm">{apiBase}/slack/events</code>
                <button onClick={() => copyToClipboard(`${apiBase}/slack/events`)} className="p-1 hover:bg-white/10 rounded"><Copy size={12} className="text-white/40" /></button>
              </div>
              <div className="text-sm text-white/60 space-y-1">
                <p>Subscribe to bot events: <code className="text-white/70">message.im</code>, <code className="text-white/70">app_mention</code>, <code className="text-white/70">message.channels</code>, <code className="text-white/70">app_home_opened</code>, <code className="text-white/70">channel_created</code>, <code className="text-white/70">group_created</code>.</p>
                <p>Under <strong className="text-white/80">App Home</strong>, enable the Home Tab.</p>
                <p>From <strong className="text-white/80">Basic Information</strong>, copy the <strong className="text-white/80">Signing Secret</strong> into server env as <code className="text-white/70">SLACK_SIGNING_SECRET</code>.</p>
              </div>
            </div>

            {/* Step 6 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 6</span>
                OAuth scopes
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Bot Token Scopes: <code className="text-white/70">chat:write</code>, <code className="text-white/70">im:history</code>, <code className="text-white/70">im:write</code>, <code className="text-white/70">app_mentions:read</code>, <code className="text-white/70">channels:history</code>, <code className="text-white/70">channels:read</code>, <code className="text-white/70">channels:manage</code>, <code className="text-white/70">channels:join</code>, <code className="text-white/70">groups:history</code>, <code className="text-white/70">groups:write</code>, <code className="text-white/70">commands</code>.</p>
                <p>Reinstall the app after changing scopes.</p>
              </div>
            </div>

            {/* Step 7 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 7</span>
                Link Your Account
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Find your Slack User ID: click your profile in Slack &rarr; click the three dots (...) &rarr; &quot;Copy member ID&quot;.</p>
                <p>Paste it in the &quot;Your Slack User ID&quot; field above, paste the Bot Token, and save.</p>
              </div>
            </div>

            {/* Step 8 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 8</span>
                Install &amp; Test
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Go to <strong className="text-white/80">Install App</strong> and click &quot;Install to Workspace&quot;.</p>
                <p>Open the MindSprint Home Tab, DM the bot, or try:</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-sm space-y-1">
                <p><code className="text-green-300">/sprint help</code> — see all commands</p>
                <p><code className="text-green-300">/sprint add</code> — open create-task form</p>
                <p><code className="text-green-300">/sprint ask what should I do next?</code></p>
                <p><code className="text-green-300">/sprint link My Project</code> — in a channel</p>
              </div>
            </div>

            {/* Note about public URL */}
            <div className="bg-amber-500/10 border border-amber-400/20 rounded-xl p-4">
              <p className="text-amber-200 text-sm font-medium mb-1">Note: Public URL Required</p>
              <p className="text-amber-200/60 text-xs">
                Events, slash commands, and interactive messages require Slack to reach your API.
                For local development, use <a href="https://ngrok.com" target="_blank" rel="noopener" className="underline">ngrok</a> (
                <code className="text-amber-300">ngrok http 8080</code>). For production, use your real HTTPS domain (e.g. DuckDNS).
              </p>
            </div>

            {/* Optional env vars */}
            <div className="space-y-2">
              <h4 className="text-white font-medium text-sm">Server environment variables</h4>
              <div className="bg-black/20 rounded-lg p-3 text-xs space-y-1 text-white/50">
                <p><code className="text-white/70">SLACK_SIGNING_SECRET</code> — Basic Information → Signing Secret (required for Events/commands verification)</p>
                <p><code className="text-white/70">SLACK_WORKFLOW_SECRET</code> — shared secret for Workflow Builder <code className="text-white/60">POST {apiBase}/slack/workflows/create-task</code></p>
                <p><code className="text-white/70">SLACK_VERIFICATION_TOKEN</code> — legacy token (optional if Signing Secret is set)</p>
                <p><code className="text-white/70">FRONTEND_URL</code> — used in Open links (defaults to http://localhost:5174)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
