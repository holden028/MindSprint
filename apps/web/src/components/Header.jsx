import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Home,
  Target,
  BarChart3,
  FolderKanban,
  LogOut,
  TrendingUp,
  Award,
  Shield,
  Settings,
  LayoutTemplate,
  CalendarDays,
  ChevronDown,
} from 'lucide-react';
import NotificationBell from './NotificationBell';

const PROGRESS_PATHS = ['/progress', '/reflections', '/insights', '/achievements'];

export default function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = !!(user?.is_admin || user?.isAdmin);
  const [progressOpen, setProgressOpen] = useState(false);
  const progressRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  useEffect(() => {
    const onDocClick = (e) => {
      if (progressRef.current && !progressRef.current.contains(e.target)) {
        setProgressOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    setProgressOpen(false);
  }, [location.pathname, location.search]);

  const navItems = [
    { path: '/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/focus', icon: Target, label: 'Focus' },
    { path: '/projects', icon: FolderKanban, label: 'Projects' },
    { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
    { path: '/templates', icon: LayoutTemplate, label: 'Templates' },
  ];

  const progressItems = [
    { path: '/progress', icon: BarChart3, label: 'Reflections', tab: 'reflections' },
    { path: '/progress?tab=insights', icon: TrendingUp, label: 'Insights', tab: 'insights' },
    { path: '/progress?tab=achievements', icon: Award, label: 'Achievements', tab: 'achievements' },
  ];

  const progressActive = PROGRESS_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(`${p}/`)
  );

  const progressTab = new URLSearchParams(location.search).get('tab') || 'reflections';

  return (
    <header className="backdrop-blur-md bg-white/10 border-b border-white/20 sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
      <div className="w-full px-4 sm:px-6">
        <div className="flex items-center h-14 gap-4">
          <h1 className="text-xl font-bold text-white whitespace-nowrap">MindSprint</h1>

          <nav className="hidden md:flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
            {navItems.slice(0, 2).map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-sm whitespace-nowrap ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}

            <div className="relative" ref={progressRef}>
              <button
                type="button"
                onClick={() => setProgressOpen((o) => !o)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-sm whitespace-nowrap ${
                  progressActive
                    ? 'bg-white/20 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                <BarChart3 size={16} />
                <span>Progress</span>
                <ChevronDown size={14} className={`opacity-70 transition-transform ${progressOpen ? 'rotate-180' : ''}`} />
              </button>
              {progressOpen && (
                <div className="absolute left-0 top-full mt-1 min-w-[180px] rounded-xl border border-white/15 bg-gray-950/95 backdrop-blur-xl shadow-xl p-1 z-50">
                  {progressItems.map((item) => {
                    const Icon = item.icon;
                    const active = progressActive && progressTab === item.tab;
                    return (
                      <Link
                        key={item.tab}
                        to={item.path}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                          active
                            ? 'bg-white/15 text-white'
                            : 'text-white/75 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon size={15} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {navItems.slice(2).map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all text-sm whitespace-nowrap ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            <NotificationBell />
            <Link
              to="/settings"
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              title="Settings"
            >
              <Settings size={18} />
            </Link>
            <span className="text-white/60 text-sm hidden lg:block max-w-[160px] truncate">{user?.email}</span>
            {isAdmin && (
              <Link
                to="/admin/dashboard"
                className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-white rounded-lg transition-all"
                title="Admin"
              >
                <Shield size={18} />
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-white rounded-lg transition-all text-sm"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
