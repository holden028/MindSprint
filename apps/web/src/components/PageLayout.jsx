import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import AIChatPanel from './AIChatPanel';
import MobileBottomNav from './MobileBottomNav';

export default function PageLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 animate-gradient pb-16 md:pb-0">
      <Header />
      <Outlet />
      <AIChatPanel />
      <MobileBottomNav />
    </div>
  );
}
