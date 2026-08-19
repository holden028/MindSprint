import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, X, Send, Sparkles, CheckCircle, Plus, Calendar, Zap, ChevronDown } from 'lucide-react';
import api from '../services/api';

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
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

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
    if (!text?.trim() || loading) return;

    const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await api.post('/ai/chat', {
        message: text,
        conversation_id: conversationId
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
        className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white p-4 rounded-2xl shadow-2xl transition-all hover:scale-105 group"
        title="AI Assistant"
      >
        <Sparkles size={24} />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-gray-900" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[400px] max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-6rem)] flex flex-col backdrop-blur-xl bg-gray-900/95 border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
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
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3.5 py-2.5 text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-purple-500/50 resize-none max-h-24"
            style={{ minHeight: '40px' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="p-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-30 text-white rounded-xl transition-all shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
