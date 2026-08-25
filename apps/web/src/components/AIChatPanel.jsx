import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Sparkles, CheckCircle, Plus, Calendar, Zap, ChevronDown, Paperclip, Loader } from 'lucide-react';
import api from '../services/api';
import { uploadChatAttachment } from './AttachmentsPanel';

const QUICK_PROMPTS = [
  { label: 'Plan my day', icon: Calendar, prompt: 'Plan my day — look at my tasks, deadlines, and schedule and suggest what I should work on and when.' },
  { label: "What's next?", icon: Zap, prompt: "What should I work on next? Consider my deadlines, priorities, and available time." },
  { label: 'Add a task', icon: Plus, prompt: "I'd like to add a new task." },
];

function TaskCard({ task }) {
  return (
    <div className="bg-white/10 border border-white/20 rounded-lg p-3 my-2">
      <div className="flex items-center gap-2 mb-1">
        <CheckCircle size={14} className="text-green-400" />
        <span className="text-white text-sm font-medium">{task.title}</span>
      </div>
      {task.description && <p className="text-white/50 text-xs ml-5">{task.description}</p>}
      <div className="flex gap-3 ml-5 mt-1.5 text-xs text-white/40">
        <span>P{task.priority}/U{task.urgency}</span>
        <span>{task.est_minutes}min</span>
        {task.due_at && <span>Due: {new Date(task.due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
    </div>
  );
}

export default function AIChatPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && conversations.length === 0) {
      api.get('/ai/conversations').then(({ data }) => setConversations(data.conversations || [])).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const sendMessage = async (text) => {
    const trimmed = text?.trim();
    if ((!trimmed && pendingAttachments.length === 0) || loading) return;

    const messageText = trimmed || 'Please review the attached file(s).';

    const attachmentIds = pendingAttachments.map((a) => a.id);
    const userMsg = {
      role: 'user',
      content: messageText,
      attachments: [...pendingAttachments],
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setPendingAttachments([]);
    setLoading(true);

    try {
      const { data } = await api.post('/ai/chat', {
        message: messageText,
        conversation_id: conversationId,
        attachment_ids: attachmentIds
      });

      const assistantMsg = {
        role: 'assistant',
        content: data.response,
        actions: data.actions || [],
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, assistantMsg]);
      setConversationId(data.conversation_id);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        error: true,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const attachment = await uploadChatAttachment(file);
      setPendingAttachments((prev) => [...prev, attachment]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Could not upload that file. Try a smaller image or text file (max 10MB).',
        error: true,
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const loadConversation = async (convId) => {
    try {
      const { data } = await api.get(`/ai/conversations/${convId}`);
      setMessages(data.messages || []);
      setConversationId(convId);
      setShowHistory(false);
    } catch { /* ignore */ }
  };

  const startNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 right-4 md:right-6 z-50 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white p-4 rounded-2xl shadow-2xl transition-all hover:scale-105 group"
        title="AI Assistant"
      >
        <Sparkles size={24} />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-900" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 right-4 md:right-6 z-50 w-[min(400px,calc(100vw-2rem))] h-[min(600px,calc(100dvh-9.5rem-env(safe-area-inset-bottom)))] flex flex-col backdrop-blur-xl bg-gray-900/95 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-purple-600/20 to-blue-600/20">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-purple-400" />
          <span className="text-white font-semibold text-sm">MindSprint AI</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowHistory(!showHistory)} className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg text-xs">
            <ChevronDown size={16} className={showHistory ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
          <button onClick={startNewChat} className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg">
            <Plus size={16} />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1.5 text-white/50 hover:text-white hover:bg-white/10 rounded-lg">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* History dropdown */}
      {showHistory && (
        <div className="border-b border-white/10 max-h-40 overflow-y-auto bg-black/30">
          {conversations.length === 0 ? (
            <p className="text-white/30 text-xs p-3">No previous conversations</p>
          ) : (
            conversations.map(c => (
              <button key={c.id} onClick={() => loadConversation(c.id)}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-white/5 transition-all ${c.id === conversationId ? 'bg-white/10 text-white' : 'text-white/60'}`}>
                <div className="truncate">{c.title}</div>
                <div className="text-xs text-white/30">{new Date(c.updated_at).toLocaleDateString()}</div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Sparkles size={32} className="text-purple-400/50" />
            <p className="text-white/40 text-sm text-center">Ask me to plan your day, create tasks, or figure out what to work on next.</p>
            <div className="flex flex-col gap-2 w-full">
              {QUICK_PROMPTS.map((qp) => {
                const Icon = qp.icon;
                return (
                  <button key={qp.label} onClick={() => sendMessage(qp.prompt)}
                    className="flex items-center gap-2.5 w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all text-sm text-left">
                    <Icon size={16} className="text-purple-400 shrink-0" />
                    {qp.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-purple-600/30 text-white rounded-br-md'
                : msg.error
                  ? 'bg-red-500/10 border border-red-400/20 text-red-200 rounded-bl-md'
                  : 'bg-white/10 text-white/90 rounded-bl-md'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.attachments?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {msg.attachments.map((a) => (
                    <div key={a.id} className="text-[10px] text-white/50 flex items-center gap-1">
                      <Paperclip size={10} /> {a.filename}
                    </div>
                  ))}
                </div>
              )}
              {msg.actions?.map((action, j) => (
                action.type === 'create_task' && action.task ? (
                  <TaskCard key={j} task={action.task} />
                ) : null
              ))}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/10 px-4 py-3 rounded-2xl rounded-bl-md">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick prompts when in conversation */}
      {messages.length > 0 && !loading && (
        <div className="px-4 pb-1 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {QUICK_PROMPTS.map(qp => (
            <button key={qp.label} onClick={() => sendMessage(qp.prompt)}
              className="shrink-0 px-2.5 py-1 bg-white/5 border border-white/10 rounded-full text-white/50 hover:text-white hover:bg-white/10 text-xs transition-all">
              {qp.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-white/10">
        {pendingAttachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingAttachments.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 border border-purple-400/30 rounded-full text-[10px] text-white/70">
                <Paperclip size={10} />
                {a.filename}
                <button
                  type="button"
                  onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                  className="text-white/40 hover:text-white"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile || loading}
            className="p-2.5 bg-white/10 border border-white/20 hover:bg-white/15 disabled:opacity-30 text-white/60 hover:text-white rounded-xl transition-all shrink-0"
            title="Attach file"
          >
            {uploadingFile ? <Loader size={16} className="animate-spin" /> : <Paperclip size={16} />}
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3.5 py-2.5 text-white text-base placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none max-h-24"
            style={{ minHeight: '40px', fontSize: '16px' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={(!input.trim() && pendingAttachments.length === 0) || loading}
            className="p-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-30 text-white rounded-xl transition-all shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
