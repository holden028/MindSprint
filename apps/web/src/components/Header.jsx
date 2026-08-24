import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Home, Target, BarChart3, FolderKanban, LogOut, TrendingUp, Award, Shield, Settings, LayoutTemplate, CalendarDays } from 'lucide-react';
import NotificationBell from './NotificationBell';

export default function Header() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = !!(user?.is_admin || user?.isAdmin);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = [
    { path: '/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/focus', icon: Target, label: 'Focus' },
    { path: '/reflections', icon: BarChart3, label: 'Reflections' },
    { path: '/projects', icon: FolderKanban, label: 'Projects' },
    { path: '/insights', icon: TrendingUp, label: 'Insights' },
    { path: '/achievements', icon: Award, label: 'Achievements' },
    { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
    { path: '/templates', icon: LayoutTemplate, label: 'Templates' },
  ];

  return (
    <header className="backdrop-blur-md bg-white/10 border-b border-white/20 sticky top-0 z-50 pt-[env(safe-area-inset-top)]">
      <div className="w-full px-4 sm:px-6">
        <div className="flex items-center h-14 gap-4">
          <h1 className="text-xl font-bold text-white whitespace-nowrap">MindSprint</h1>

          <nav className="hidden md:flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
            {navItems.map((item) => {
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
