// src/components/Navbar.jsx
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';
import { clearToken } from './authStorage';
import { useAlerts } from "./GlobalAlertsProvider";
import SoundUnlocker from './SoundUnlocker';

export default function Navbar({ setAuth }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  // const a = new Audio('/sounds/siren-alert-96052.mp3'); a.volume = 0.8; a.play()


  // 🔔 realtime bits
  const { emergency, soundMuted, toggleSound } = useAlerts();

  // 👉 visible only when sound is actually happening
  const isSounding = emergency && !soundMuted;

  // theme setup
  const getInitialTheme = () => {
    const saved = localStorage.getItem('im_theme');
    if (saved) return saved;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  };
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    localStorage.setItem('im_theme', theme);
    const root = document.documentElement;
    root.classList.remove('im-theme-dark', 'im-theme-light');
    root.classList.add(theme === 'dark' ? 'im-theme-dark' : 'im-theme-light');
    window.dispatchEvent(new CustomEvent('im-theme-changed', { detail: { theme } }));
  }, [theme]);

  // close drawer on route change
  useEffect(() => setMobileOpen(false), [location.pathname]);

  const isActive = (path) => location.pathname === path;

  const go = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const onLogout = () => {
    clearToken();
    setAuth?.(false);
    navigate('/login', { replace: true });
  };

  return (
    <nav className="im-nav">
      <div className="im-nav__shell">
        {/* Left: brand + hamburger */}
        <div className="im-nav__left">
          <button
            className="im-nav__hamburger"
            aria-label="Open menu"
            aria-expanded={mobileOpen}
            aria-controls="im-mobile-drawer"
            onClick={() => setMobileOpen((o) => !o)}
          >
            <span />
            <span />
            <span />
          </button>

          <div
            className="im-brand"
            onClick={() => go('/')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && go('/')}
            style={{ position: 'relative' }}
          >
            <span className="im-brand__main">Insider</span>
            <span className="im-brand__accent">Monitor</span>

            {/* 🔴 tiny emergency dot when flashing is active */}
            {emergency && (
              <span
                title="High-severity alert active"
                style={{
                  position: 'absolute',
                  right: -10, top: -4,
                  width: 10, height: 10, borderRadius: 999,
                  background: '#ef4444', boxShadow: '0 0 0 4px rgba(239,68,68,.25)'
                }}
              />
            )}
          </div>
        </div>

        {/* Center: desktop links */}
        <div className="im-nav__links">
          <button className={`im-nav__link ${isActive('/') ? 'is-active' : ''}`} onClick={() => go('/')}>
            Dashboard
          </button>
          <button className={`im-nav__link ${isActive('/users') ? 'is-active' : ''}`} onClick={() => go('/users')}>
            Users
          </button>
          <button className={`im-nav__link ${isActive('/alerts') ? 'is-active' : ''}`} onClick={() => go('/alerts')}>
            Alerts
          </button>
          <button className={`im-nav__link ${isActive('/analyze') ? 'is-active' : ''}`} onClick={() => go('/analyze')}>
            Analyze
          </button>
          <button
            className={`im-nav__link ${isActive('/settings/realtime') ? 'is-active' : ''}`}
            onClick={() => go('/settings/realtime')}
          >
            Realtime Settings
          </button>
            <SoundUnlocker />
        </div>

        {/* Right: actions + theme + (conditional) sound */}
        <div className="im-nav__actions">
          {/* ✅ Only shows while sound is actually playing */}
          {isSounding && (
            <button
              onClick={toggleSound}
              className="im-btn im-btn--light im-hide-mobile"
              title="Mute alert sound"
              aria-label="Mute alert sound"
            >
              🔇 Mute
            </button>
          )}

          <button onClick={() => go('/log')} className="im-btn im-btn--light im-hide-mobile">
            + Log
          </button>
          <button onClick={onLogout} className="im-btn im-btn--alert im-hide-mobile">
            Logout
          </button>

          <button
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="im-toggle"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <span className="im-toggle__thumb" data-mode={theme} />
            <span className="im-toggle__label">{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        id="im-mobile-drawer"
        className={`im-nav__drawer ${mobileOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="im-nav__drawer-inner">
          <button className={`im-nav__link ${isActive('/') ? 'is-active' : ''}`} onClick={() => go('/')}>
            Dashboard
          </button>
          <button className={`im-nav__link ${isActive('/users') ? 'is-active' : ''}`} onClick={() => go('/users')}>
            Users
          </button>
          <button className={`im-nav__link ${isActive('/alerts') ? 'is-active' : ''}`} onClick={() => go('/alerts')}>
            Alerts
          </button>
          <button className={`im-nav__link ${isActive('/analyze') ? 'is-active' : ''}`} onClick={() => go('/analyze')}>
            Analyze
          </button>
          <button
            className={`im-nav__link ${isActive('/settings/realtime') ? 'is-active' : ''}`}
            onClick={() => go('/settings/realtime')}
          >
            Realtime Settings
          </button>

          <div className="im-nav__drawer-actions">
            {/* 🔊 Mobile mute (only when sound is playing) */}
            {isSounding && (
              <button onClick={toggleSound} className="im-btn im-btn--light">
                🔇 Mute
              </button>
            )}

            <button onClick={() => go('/log')} className="im-btn im-btn--light">
              + Log
            </button>
            <button onClick={onLogout} className="im-btn im-btn--alert">
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {mobileOpen && <div className="im-nav__backdrop" onClick={() => setMobileOpen(false)} />}
    </nav>
  );
}
