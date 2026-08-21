import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Target, CalendarDays, FolderKanban, Settings } from 'lucide-react';

const ITEMS = [
  { path: '/dashboard', icon: Home, label: 'Today' },
  { path: '/focus', icon: Target, label: 'Focus' },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { path: '/projects', icon: FolderKanban, label: 'Projects' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function MobileBottomNav() {
  const location = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 backdrop-blur-xl bg-gray-950/90 border-t border-white/15 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around h-16">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 text-[10px] font-medium transition-colors ${
                active ? 'text-white' : 'text-white/45'
              }`}
            >
              <Icon size={20} className={active ? 'text-purple-300' : ''} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
