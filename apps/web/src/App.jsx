import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import PageLayout from './components/PageLayout';
import LoadingSpinner from './components/LoadingSpinner';
import BuildBadge from './components/BuildBadge';

const Dashboard = lazy(() => import('./components/Dashboard'));
const FocusSession = lazy(() => import('./components/FocusSession'));
const Reflections = lazy(() => import('./components/Reflections'));
const Projects = lazy(() => import('./components/Projects'));
const ProjectView = lazy(() => import('./components/ProjectView'));
const InsightsDashboard = lazy(() => import('./components/InsightsDashboard'));
const GamificationDashboard = lazy(() => import('./components/GamificationDashboard'));
const TemplatesPage = lazy(() => import('./components/TemplatesPage'));
const AdminLogin = lazy(() => import('./components/AdminLogin'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const CalendarPage = lazy(() => import('./components/CalendarPage'));

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return children;
};

const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/admin/login" replace />;
  }

  if (!user.is_admin && !user.isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (user) {
    return <Navigate to={user.is_admin || user.isAdmin ? '/admin/dashboard' : '/dashboard'} replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route
          path="/"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/admin/login"
          element={
            <PublicRoute>
              <AdminLogin />
            </PublicRoute>
          }
        />
        <Route
          element={
            <ProtectedRoute>
              <PageLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/focus" element={<FocusSession />} />
          <Route path="/reflections" element={<Reflections />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:projectId" element={<ProjectView />} />
          <Route path="/insights" element={<InsightsDashboard />} />
          <Route path="/achievements" element={<GamificationDashboard />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route
            path="/admin/dashboard"
            element={
              <AdminRoute>
                <AdminDashboard />
              </AdminRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <BuildBadge />
      </Router>
    </AuthProvider>
  );
}

export default App;
