
// src/App.js
import React, { useEffect, useState, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import AlertsPage from './components/AlertsPage';
import CreateLogPage from './components/CreateLogPage';
import LogAnalyzer from './components/LogAnalyzer';
import UsersPage from './components/users';
import UserDetailsPage from './components/UserDetailsPage';
import ActivateAccount from './components/ActivateAccount';
import CreateSessionWizard from './components/CreateSessionWizard';
import ForgotPassword from './components/ForgotPassword';
import PasswordSetupSt from './components/ActivateAccount'; // keep if that's really where it lives
import MainLayout from './MainLayout';

import { getToken } from './components/authStorage';
import GlobalAlertsProvider from './components/GlobalAlertsProvider';
import { RealtimeSettingsProvider } from './components/RealtimeSettingsContext';
import SentinelWelcome from "./components/SentinelWelcome";
import UserEditPage from './components/UserEditPage';
import EmployeeDashboard from "./components/EmployeeDashboard";

import { MeProvider, AdminOnly, NotAdminOnly, OwnerNotAdminOnly } from './components/RoleGuards';

// Lazy-loaded page
const RealtimeSettingsPage = React.lazy(() =>
  import('./components/RealtimeSettingsPage')
);

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getToken()));

  useEffect(() => {
    const onStorage = () => setIsAuthenticated(Boolean(getToken()));
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <Router>
      <Suspense fallback={<div>Loading…</div>}>
        <Routes>
           Public
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to="/" replace /> : <Login setAuth={setIsAuthenticated} />
            }
          />
            {/*<Route path="/login" element={<Login />} />*/}
          <Route path="/activate/:uid/:token" element={<ActivateAccount />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/password-setup/activate/:uid/:token" element={<PasswordSetupSt mode="activate" />} />
          <Route path="/password-setup/reset/:token" element={<PasswordSetupSt mode="reset" />} />
          <Route path="/welcome" element={<SentinelWelcome />} />

          {/* Protected branch — must be authenticated */}
          <Route
            element={
              isAuthenticated ? (
                <MeProvider>
                  <RealtimeSettingsProvider>
                    <GlobalAlertsProvider>
                      <MainLayout setAuth={setIsAuthenticated} />
                    </GlobalAlertsProvider>
                  </RealtimeSettingsProvider>
                </MeProvider>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          >
            {/* EXCEPTIONS first (non-admin access) */}

            {/* 1) UserDetailsPage — available to all authenticated users EXCEPT admins */}
            <Route
              path="/users/:userId"
              element={
                // <NotAdminOnly redirectTo="/">
                  <UserDetailsPage />
                // </NotAdminOnly>
              }
            />
            <Route
              path="/users/username/:username"
              element={
                  <UserDetailsPage />
              }
            />

            {/* 2) Employee dashboard — only owners who are NOT admin/superuser */}
            <Route
              path="/employee/dashboard"
              element={
                // <OwnerNotAdminOnly redirectTo="/">
                  <EmployeeDashboard />
                // </OwnerNotAdminOnly>
              }
            />

            {/* EVERYTHING ELSE in protected branch — ADMIN ONLY */}
            <Route
              path="/register"
              element={
                <AdminOnly redirectTo="/">
                  <Register />
                </AdminOnly>
              }
            />
            <Route
              path="/"
              element={
                <AdminOnly redirectTo="/dashboard">
                  <Dashboard setAuth={setIsAuthenticated} />
                </AdminOnly>
              }
            />
            <Route
              path="/alerts"
              element={
                <AdminOnly redirectTo="/">
                  <AlertsPage setAuth={setIsAuthenticated} />
                </AdminOnly>
              }
            />
            <Route
              path="/log"
              element={
                <AdminOnly redirectTo="/">
                  <CreateLogPage setAuth={setIsAuthenticated} />
                </AdminOnly>
              }
            />
            <Route
              path="/session"
              element={
                <AdminOnly redirectTo="/">
                  <CreateSessionWizard setAuth={setIsAuthenticated} />
                </AdminOnly>
              }
            />
            <Route
              path="/analyze"
              element={
                <AdminOnly redirectTo="/">
                  <LogAnalyzer setAuth={setIsAuthenticated} />
                </AdminOnly>
              }
            />
            <Route
              path="/users"
              element={
                <AdminOnly redirectTo="/">
                  <UsersPage />
                </AdminOnly>
              }
            />
            <Route
              path="/settings/realtime"
              element={
                <AdminOnly redirectTo="/">
                  <RealtimeSettingsPage />
                </AdminOnly>
              }
            />
            <Route
              path="/users/:userId/edit"
              element={
                <AdminOnly redirectTo="/">
                  <UserEditPage />
                </AdminOnly>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
