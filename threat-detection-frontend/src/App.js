import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import AlertsPage from './components/AlertsPage';
import CreateLogPage from './components/CreateLogPage';
import LogAnalyzer from './components/LogAnalyzer';
import UsersPage from "./components/users";
import UserDetailsPage from "./components/UserDetailsPage";
import ActivateAccount from "./components/ActivateAccount";
import CreateSessionWizard from './components/CreateSessionWizard'; // <-- NEW

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('custom_token'));

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" /> : <Login setAuth={setIsAuthenticated} />}
        />
        <Route
          path="/users"
          element={isAuthenticated ? <UsersPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/users/:userId"
          element={isAuthenticated ? <UserDetailsPage /> : <Navigate to="/login" />}
        />
        <Route
          path="/users/username/:username"
          element={isAuthenticated ? <UserDetailsPage /> : <Navigate to="/login" />}
        />

        <Route path="/register" element={<Register />} />
        <Route path="/activate/:uid/:token" element={<ActivateAccount />} />

        <Route
          path="/alerts"
          element={isAuthenticated ? <AlertsPage setAuth={setIsAuthenticated} /> : <Navigate to="/login" />}
        />
        <Route
          path="/log"
          element={isAuthenticated ? <CreateLogPage setAuth={setIsAuthenticated} /> : <Navigate to="/login" />}
        />
        <Route
          path="/session"   // <-- NEW wizard route
          element={isAuthenticated ? <CreateSessionWizard setAuth={setIsAuthenticated} /> : <Navigate to="/login" />}
        />
        <Route
          path="/analyze"
          element={isAuthenticated ? <LogAnalyzer setAuth={setIsAuthenticated} /> : <Navigate to="/login" />}
        />
        <Route
          path="/"
          element={isAuthenticated ? <Dashboard setAuth={setIsAuthenticated} /> : <Navigate to="/login" />}
        />

        {/* fallback */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </Router>
  );
}

export default App;
