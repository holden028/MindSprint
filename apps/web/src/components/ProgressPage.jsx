import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, TrendingUp, Award, CalendarDays } from 'lucide-react';
import Reflections from './Reflections';
import InsightsDashboard from './InsightsDashboard';
import GamificationDashboard from './GamificationDashboard';
import CalendarPage from './CalendarPage';

const TABS = [
  { id: 'reflections', label: 'Reflections', icon: BarChart3 },
  { id: 'insights', label: 'Insights', icon: TrendingUp },
  { id: 'achievements', label: 'Achievements', icon: Award },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
];

const TAB_IDS = new Set(TABS.map((t) => t.id));

export default function ProgressPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = TAB_IDS.has(tabParam) ? tabParam : 'reflections';

  const setTab = (id) => {
    setSearchParams(id === 'reflections' ? {} : { tab: id }, { replace: true });
  };

  const content = useMemo(() => {
    switch (activeTab) {
      case 'insights':
        return <InsightsDashboard />;
      case 'achievements':
        return <GamificationDashboard />;
      case 'calendar':
        return <CalendarPage />;
      case 'reflections':
      default:
        return <Reflections />;
    }
  }, [activeTab]);

  return (
    <div>
      <div className="sticky top-14 z-30 backdrop-blur-md bg-gray-950/40 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 py-3 overflow-x-auto scrollbar-hide">
            <h1 className="text-white font-semibold text-sm mr-2 whitespace-nowrap hidden sm:block">
              Progress
            </h1>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/10">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all ${
                      active
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon size={15} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
            <Link
              to="/templates"
              className="ml-auto text-xs text-white/45 hover:text-white/80 whitespace-nowrap hidden md:inline"
            >
              Templates →
            </Link>
          </div>
        </div>
      </div>
      {content}
    </div>
  );
}
