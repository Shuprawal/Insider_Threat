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
  const [scrolled, setScrolled] = useState(false);

  // 🔔 realtime bits
  const { emergency, soundMuted, toggleSound } = useAlerts();
  // Show the chip whenever an emergency is active (muted OR not)
  const showSoundChip = !!emergency;

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

  // lock page scroll when drawer is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = mobileOpen ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [mobileOpen]);

  // subtle shadow on scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (path) => location.pathname === path;
  const go = (path) => { navigate(path); setMobileOpen(false); };

  const onLogout = () => {
    clearToken();
    setAuth?.(false);
    navigate('/login', { replace: true });
  };

  return (
    <nav className={`im-nav ${scrolled ? 'is-scrolled' : ''}`}>
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
            <span /><span /><span />
          </button>

          <div
            className="im-brand"
            onClick={() => go('/')}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && go('/')}
          >
            <span className="im-brand__main">Insider</span>
            <span className="im-brand__accent">Monitor</span>

            {/* tiny emergency dot */}
            {emergency && (
              <span className="im-brand__dot" title="High-severity alert active" />
            )}
          </div>
        </div>

        {/* Center: desktop links */}
        <div className="im-nav__links">
          <button className={`im-nav__link ${isActive('/') ? 'is-active' : ''}`} onClick={() => go('/')}>Dashboard</button>
          <button className={`im-nav__link ${isActive('/users') ? 'is-active' : ''}`} onClick={() => go('/users')}>Users</button>
          <button className={`im-nav__link ${isActive('/alerts') ? 'is-active' : ''}`} onClick={() => go('/alerts')}>Alerts</button>
          {/*<button className={`im-nav__link ${isActive('/analyze') ? 'is-active' : ''}`} onClick={() => go('/analyze')}>Analyze</button>*/}
          <button className={`im-nav__link ${isActive('/settings/realtime') ? 'is-active' : ''}`} onClick={() => go('/settings/realtime')}>Realtime Settings</button>
          <SoundUnlocker />
        </div>

        {/* Right: actions + theme */}
        <div className="im-nav__actions">
          <button onClick={() => go('/session')} className="im-btn im-btn--light im-hide-mobile">+ Log</button>
          <button onClick={onLogout} className="im-btn im-btn--alert im-hide-mobile">Logout</button>

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

        {/* 🔊 Tiny floating sound chip */}
        {showSoundChip && (
          <button
            className="im-sound-chip"
            data-muted={soundMuted ? 'true' : 'false'}
            onClick={toggleSound}
            title={soundMuted ? 'Unmute alert sound' : 'Mute alert sound'}
            aria-label={soundMuted ? 'Unmute alert sound' : 'Mute alert sound'}
          >
            <span className="im-sr-only">{soundMuted ? 'Unmute' : 'Mute'} alert sound</span>
            {soundMuted ? '🔇' : '🔊'}
          </button>
        )}
      </div>

      {/* Mobile drawer */}
      <div
        id="im-mobile-drawer"
        className={`im-nav__drawer ${mobileOpen ? 'is-open' : ''}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="im-nav__drawer-inner">
          <button className={`im-nav__link ${isActive('/') ? 'is-active' : ''}`} onClick={() => go('/')}>Dashboard</button>
          <button className={`im-nav__link ${isActive('/users') ? 'is-active' : ''}`} onClick={() => go('/users')}>Users</button>
          <button className={`im-nav__link ${isActive('/alerts') ? 'is-active' : ''}`} onClick={() => go('/alerts')}>Alerts</button>
          <button className={`im-nav__link ${isActive('/analyze') ? 'is-active' : ''}`} onClick={() => go('/analyze')}>Analyze</button>
          <button className={`im-nav__link ${isActive('/settings/realtime') ? 'is-active' : ''}`} onClick={() => go('/settings/realtime')}>Realtime Settings</button>

          <div className="im-nav__drawer-actions">
            <button onClick={() => go('/log')} className="im-btn im-btn--light">+ Log</button>
            <button onClick={onLogout} className="im-btn im-btn--alert">Logout</button>
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {mobileOpen && <div className="im-nav__backdrop" onClick={() => setMobileOpen(false)} />}
    </nav>
  );
}
