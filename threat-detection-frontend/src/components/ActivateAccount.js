// PasswordSetupSt.jsx
import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function PasswordSetupSt({ mode }) {
  // mode: 'activate' | 'reset'
  const { uid, token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [pwdTouched, setPwdTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  const checks = useMemo(() => ({
    len: password.length >= 8,
    upper: /[A-Z]/.test(password),
    num: /\d/.test(password),
    sym: /[^A-Za-z0-9]/.test(password),
  }), [password]);

  const score = Object.values(checks).filter(Boolean).length;
  const strengthLabel = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'][score];

  const canSubmit =
    !loading &&
    password.length > 0 &&
    confirmPwd.length > 0 &&
    password === confirmPwd &&
    Object.values(checks).every(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (!canSubmit) {
      setError(confirmTouched && password !== confirmPwd
        ? 'Passwords do not match.'
        : 'Please meet all password requirements.');
      return;
    }

    try {
      setLoading(true);
      let res;

      if (mode === 'activate') {
        // Existing activation endpoint (keeps is_active logic)
        res = await axios.post(`http://localhost:8000/api/activate/${uid}/${token}/`, { password });
      } else {
        // Password reset confirm using your custom token-only endpoint
        res = await axios.post(`http://localhost:8000/api/password-reset-confirm/`, {
          token,
          password,
        });
      }

      if (res.data?.success) {
        setMessage(mode === 'activate'
          ? 'Account activated! You can now log in.'
          : 'Password updated. You can now log in.');
        setPassword('');
        setConfirmPwd('');
      } else {
        setError(res.data?.error || 'Operation failed.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed.');
    } finally {
      setLoading(false);
    }
  };

  const showMeter = pwdTouched && password.length > 0;
  const showChecks = pwdTouched || confirmTouched || password.length > 0 || confirmPwd.length > 0;

  const title = mode === 'activate' ? 'Activate Your Account' : 'Set a New Password';
  const cta   = mode === 'activate' ? 'Set Password & Activate' : 'Update Password';

  return (
    <div className="ak-activation-shell">
      <div className="ak-activation-card">
        <header className="ak-brand">
          <span className="ak-lock">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 10V8a6 6 0 1 1 12 0v2h1a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1h1Zm2 0h8V8a4 4 0 1 0-8 0v2Z" fill="currentColor"/>
            </svg>
          </span>
          <div className="ak-brand-text">
            <h1 className="ak-title">{title}</h1>
            <p className="ak-subtitle">
              {mode === 'activate'
                ? 'Set a secure password to complete activation.'
                : 'Create a strong password for your account.'}
            </p>
          </div>
        </header>

        {error && <div className="ak-toast ak-toast--error" role="alert">{error}</div>}
        {message ? (
          <div className="ak-toast ak-toast--success" role="status">
            {message}
            <div className="ak-success-actions">
              <button className="ak-btn ak-btn--primary" onClick={() => navigate('/login')}>
                Go to Login
              </button>
            </div>
          </div>
        ) : (
          <form className="ak-form" onSubmit={handleSubmit} noValidate>
            <div className="ak-field">
              <label htmlFor="password" className="ak-label">New Password</label>
              <div className="ak-input-wrap">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  className="ak-input"
                  placeholder="Enter a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPwdTouched(true)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="ak-eye"
                  aria-label={showPwd ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPwd(s => !s)}
                >
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>

              {showMeter && (
                <>
                  <div className={`ak-meter ak-meter--${score}`}>
                    <div className="ak-meter-bar" style={{ width: `${(score / 4) * 100}%` }} />
                  </div>
                  <div className="ak-meter-label">{strengthLabel}</div>
                </>
              )}
            </div>

            <div className="ak-field">
              <label htmlFor="confirm" className="ak-label">Confirm Password</label>
              <input
                id="confirm"
                type={showPwd ? 'text' : 'password'}
                className="ak-input"
                placeholder="Retype your password"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                onFocus={() => setConfirmTouched(true)}
                autoComplete="new-password"
                required
              />
            </div>

            <ul className={`ak-reqs ${showChecks ? '' : 'ak-reqs--idle'}`} aria-live={showChecks ? 'polite' : 'off'}>
              <li className={!showChecks ? 'idle' : checks.len ? 'ok' : 'bad'}>At least 8 characters</li>
              <li className={!showChecks ? 'idle' : checks.upper ? 'ok' : 'bad'}>At least one uppercase letter</li>
              <li className={!showChecks ? 'idle' : checks.num ? 'ok' : 'bad'}>At least one number</li>
              <li className={!showChecks ? 'idle' : checks.sym ? 'ok' : 'bad'}>At least one symbol</li>
              <li className={!showChecks ? 'idle' : confirmPwd.length === 0 ? 'idle' : password === confirmPwd ? 'ok' : 'bad'}>
                Passwords match
              </li>
            </ul>

            <button type="submit" className={`ak-btn ak-btn--primary ${loading ? 'is-loading' : ''}`} disabled={!canSubmit}>
              {loading ? 'Saving…' : cta}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
