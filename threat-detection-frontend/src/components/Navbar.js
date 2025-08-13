import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../App.css';
import { clearToken } from './authStorage'; // ✅ clears both localStorage + sessionStorage

export default function Navbar({ setAuth }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

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
    clearToken();            // ✅ storage-agnostic logout
    setAuth?.(false);        // ✅ safe call only if provided
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
          >
            <span className="im-brand__main">Insider</span>
            <span className="im-brand__accent">Monitor</span>
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
        </div>

        {/* Right: actions + theme toggle */}
        <div className="im-nav__actions">
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

          <div className="im-nav__drawer-actions">
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
