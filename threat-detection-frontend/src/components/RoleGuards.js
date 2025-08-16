// src/components/RoleGuards.jsx
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { getToken } from './authStorage';

// Adjust this if you mounted me_view somewhere else
const ME_ENDPOINTS = [
  'http://localhost:8000/auth/me/',
  'http://localhost:8000/api/auth/me/',
];

const MeContext = createContext({ me: null, loading: true, error: null });

export function MeProvider({ children }) {
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr(null);
      const token = getToken();
      if (!token) {
        if (!cancelled) {
          setMe(null);
          setLoading(false);
        }
        return;
      }
      const cfg = { headers: { Authorization: `Bearer ${token}` } };

      let data = null;
      for (const url of ME_ENDPOINTS) {
        try {
          const r = await axios.get(url, cfg);
          if (r?.data) { data = r.data?.user ? r.data.user : r.data; break; }
        } catch (e) {
          // try next
        }
      }
      if (!cancelled) {
        if (data) {
          setMe(data);
        } else {
          setErr(new Error('Failed to fetch current user.'));
        }
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({ me, loading, error }), [me, loading, error]);
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe() {
  return useContext(MeContext);
}

// ----- Role helpers -----
function isAdminLike(me) {
  if (!me) return false;
  const role = String(me.role || '').toLowerCase();
  return Boolean(me.is_superuser || role === 'admin' || role === 'superuser');
}

function isOwnerNotAdmin(me) {
  if (!me) return false;
  const role = String(me.role || '').toLowerCase();
  return role === 'owner' && !isAdminLike(me);
}

// ----- Gates -----
// Shows children only if user is admin/superuser. Otherwise redirects to /login or / (configurable)
export function AdminOnly({ children, redirectTo = '/' }) {
  const { me, loading } = useMe();
  const loc = useLocation();
  if (loading) return <div>Loading…</div>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc }} />;
  if (!isAdminLike(me)) return <Navigate to={redirectTo} replace />;
  return children;
}

// Shows children only to authenticated users who are NOT admin/superuser
export function NotAdminOnly({ children, redirectTo = '/' }) {
  const { me, loading } = useMe();
  const loc = useLocation();
  if (loading) return <div>Loading…</div>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc }} />;
  if (isAdminLike(me)) return <Navigate to={redirectTo} replace />;
  return children;
}

// Shows children only to owners (role === owner) who are NOT admin/superuser
export function OwnerNotAdminOnly({ children, redirectTo = '/' }) {
  const { me, loading } = useMe();
  const loc = useLocation();
  if (loading) return <div>Loading…</div>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc }} />;
  if (!isOwnerNotAdmin(me)) return <Navigate to={redirectTo} replace />;
  return children;
}
