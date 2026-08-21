import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import api from '../services/api';
import { ensureNotificationPermission, showLocalNotification } from '../utils/notifications';

const SEEN_KEY = 'mindsprint_seen_notif_ids';

function loadSeen() {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveSeen(set) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-200)));
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pushReady, setPushReady] = useState(Notification?.permission === 'granted');
  const ref = useRef(null);
  const seenRef = useRef(loadSeen());
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      const items = res.data.notifications || res.data || [];
      setNotifications(items.slice(0, 20));
      setUnreadCount(items.filter((n) => !n.read).length);

      // Browser/OS push for newly seen unread items
      if (Notification.permission === 'granted') {
        const seen = seenRef.current;
        for (const n of items) {
          if (!n.read && n.id && !seen.has(n.id)) {
            showLocalNotification(n.title || 'MindSprint', {
              body: n.body || '',
              tag: String(n.id),
              data: { task_id: n.task_id }
            });
            seen.add(n.id);
          }
        }
        // Mark all fetched ids as seen so we don't re-notify after grant
        items.forEach((n) => { if (n.id) seen.add(n.id); });
        saveSeen(seen);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const enablePush = async () => {
    const result = await ensureNotificationPermission();
    setPushReady(result === 'granted');
    if (result === 'granted') {
      showLocalNotification('MindSprint alerts on', {
        body: 'You’ll get a banner when reminders fire while this app is open.'
      });
    }
  };

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      await api.post('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (notif) => {
    if (notif.task_id) navigate(`/dashboard?taskId=${notif.task_id}`);
    else navigate('/dashboard');
    setOpen(false);
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold bg-red-500 text-white rounded-full px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 backdrop-blur-xl bg-gray-900/95 border border-white/20 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <span className="text-sm font-semibold text-white">Notifications</span>
            <div className="flex items-center gap-2">
              {!pushReady && 'Notification' in window && (
                <button onClick={enablePush} className="text-[10px] text-purple-300 hover:text-purple-200">
                  Enable banners
                </button>
              )}
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  disabled={loading}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-white/40 text-sm">No notifications yet</div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/10 ${n.read ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.read ? 'bg-white/20' : 'bg-blue-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{n.title}</p>
                      {n.body && <p className="text-xs text-white/50 truncate mt-0.5">{n.body}</p>}
                      <p className="text-[10px] text-white/30 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
