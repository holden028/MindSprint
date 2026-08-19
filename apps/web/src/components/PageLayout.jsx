import React from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import AIChatPanel from './AIChatPanel';

export default function PageLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 animate-gradient">
      <Header />
      <Outlet />
      <AIChatPanel />
    </div>
  );
}
