import React, { useState, useEffect } from 'react';
import { Settings, Hash, CheckCircle, AlertCircle, ChevronDown, ChevronUp, ExternalLink, Copy, Clock, Plus, Trash2, Calendar } from 'lucide-react';
import api from '../services/api';

const DAY_OPTIONS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' }
];

export default function SettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [slackUserId, setSlackUserId] = useState('');
  const [botToken, setBotToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null);
  const [showGuide, setShowGuide] = useState(false);
  const [loaded, setLoaded] = useState(false);

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
        slack_bot_token: botToken || null
      });
      setStatus({ type: 'success', msg: 'Settings saved!' });
    } catch (err) {
      setStatus({ type: 'error', msg: err.response?.data?.error || 'Failed to save settings' });
    } finally {
      setSaving(false);
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

  const apiBase = window.location.hostname === 'localhost'
    ? 'http://localhost:8080'
    : `${window.location.origin}/api`;

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
              Set up slash commands (/task add, /task list, /task done) and interactive buttons
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
                    <code className="text-purple-300">/task</code>
                    <button onClick={() => copyToClipboard('/task')} className="p-1 hover:bg-white/10 rounded"><Copy size={12} className="text-white/40" /></button>
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
                  <span className="text-white/70">[add|list|done|help]</span>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 4</span>
                Enable Interactive Messages
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Go to <strong className="text-white/80">Interactivity & Shortcuts</strong> &rarr; toggle ON.</p>
                <p>Set the Request URL to:</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 flex items-center justify-between">
                <code className="text-purple-300 text-sm">{apiBase}/slack/interactions</code>
                <button onClick={() => copyToClipboard(`${apiBase}/slack/interactions`)} className="p-1 hover:bg-white/10 rounded"><Copy size={12} className="text-white/40" /></button>
              </div>
              <p className="text-sm text-white/50">This enables the "Mark Done" buttons on task messages.</p>
            </div>

            {/* Step 5 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 5</span>
                Link Your Account
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Find your Slack User ID: click your profile in Slack &rarr; click the three dots (...) &rarr; "Copy member ID".</p>
                <p>Paste it in the "Your Slack User ID" field above and save.</p>
              </div>
            </div>

            {/* Step 6 */}
            <div className="space-y-2">
              <h4 className="text-white font-medium flex items-center gap-2">
                <span className="bg-purple-500/30 text-purple-200 text-xs px-2 py-0.5 rounded-full">Step 6</span>
                Install & Test
              </h4>
              <div className="text-sm text-white/60 space-y-1">
                <p>Go to <strong className="text-white/80">Install App</strong> in the sidebar and click "Install to Workspace".</p>
                <p>Once installed, try these commands in Slack:</p>
              </div>
              <div className="bg-black/20 rounded-lg p-3 text-sm space-y-1">
                <p><code className="text-green-300">/task help</code> — see all commands</p>
                <p><code className="text-green-300">/task add Buy groceries</code> — create a task</p>
                <p><code className="text-green-300">/task list</code> — see your tasks</p>
                <p><code className="text-green-300">/task done 1</code> — complete task #1</p>
              </div>
            </div>

            {/* Note about public URL */}
            <div className="bg-amber-500/10 border border-amber-400/20 rounded-xl p-4">
              <p className="text-amber-200 text-sm font-medium mb-1">Note: Public URL Required</p>
              <p className="text-amber-200/60 text-xs">
                Slash commands and interactive messages require Slack to reach your API server. 
                For local development, use <a href="https://ngrok.com" target="_blank" rel="noopener" className="underline">ngrok</a> to 
                expose your local server: <code className="text-amber-300">ngrok http 8080</code>, then use the ngrok URL 
                as the base for your slash command and interactivity URLs. For production, use your real domain.
              </p>
            </div>

            {/* Optional env vars */}
            <div className="space-y-2">
              <h4 className="text-white font-medium text-sm">Optional: Server Environment Variables</h4>
              <div className="bg-black/20 rounded-lg p-3 text-xs space-y-1 text-white/50">
                <p><code className="text-white/70">SLACK_VERIFICATION_TOKEN</code> — from your Slack app's Basic Information page (adds request verification)</p>
                <p><code className="text-white/70">FRONTEND_URL</code> — used in "Open in App" links (defaults to http://localhost:5174)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
