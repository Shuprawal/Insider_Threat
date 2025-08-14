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
// import GetStartedPage from "./components/GetStartedPage";

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
      {/* Wrap routes in Suspense so lazy pages render with a fallback */}
      <Suspense fallback={<div>Loading…</div>}>
        <Routes>
          {/* Public */}
          <Route
            path="/login"
            element={
              isAuthenticated ? <Navigate to="/" replace /> : <Login setAuth={setIsAuthenticated} />
            }
          />
          <Route path="/activate/:uid/:token" element={<ActivateAccount />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/password-setup/activate/:uid/:token" element={<PasswordSetupSt mode="activate" />} />
          <Route path="/password-setup/reset/:token" element={<PasswordSetupSt mode="reset" />} />
            <Route path='/welcome' element={<SentinelWelcome />} />
            {/*<Route path='/get-started' element={<GetStartedPage />} />*/}
          {/* Protected branch */}
          <Route
            element={
              isAuthenticated ? (
                <RealtimeSettingsProvider>
                  <GlobalAlertsProvider>
                    <MainLayout setAuth={setIsAuthenticated} />
                  </GlobalAlertsProvider>
                </RealtimeSettingsProvider>
              ) : (
                <Navigate to="/login" replace />
              )
            }
          >
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<Dashboard setAuth={setIsAuthenticated} />} />
            <Route path="/alerts" element={<AlertsPage setAuth={setIsAuthenticated} />} />
            <Route path="/log" element={<CreateLogPage setAuth={setIsAuthenticated} />} />
            <Route path="/session" element={<CreateSessionWizard setAuth={setIsAuthenticated} />} />
            <Route path="/analyze" element={<LogAnalyzer setAuth={setIsAuthenticated} />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:userId" element={<UserDetailsPage />} />
            <Route path="/users/username/:username" element={<UserDetailsPage />} />

              <Route path='/employee/dashboard' element={<EmployeeDashboard /> } />


            <Route path="/settings/realtime" element={<RealtimeSettingsPage />} />
            <Route path="/users/:userId/edit" element={<UserEditPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
