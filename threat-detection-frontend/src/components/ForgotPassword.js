import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "./api";
import "../App.css";

/* Inline icons with unique names */
const SentinelIconLock = (props) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M12 2a5 5 0 00-5 5v3H6a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2v-7a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm3 8H9V7a3 3 0 016 0v3z"/>
  </svg>
);
const SentinelIconMail = (props) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M2 6a2 2 0 012-2h16a2 2 0 012 2v.4l-10 6-10-6V6zm0 2.75V18a2 2 0 002 2h16a2 2 0 002-2V8.75l-9.4 5.64a2 2 0 01-2.1 0L2 8.75z"/>
  </svg>
);

export default function SentinelForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isValidEmail = useMemo(() => {
    const e = email.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  }, [email]);

  const submit = async (e) => {
    e.preventDefault();
    setStatus(""); setError("");
    if (!isValidEmail) { setError("Please enter a valid email address."); return; }

    setSubmitting(true);
    try {
      const { data } = await api.post("/api/forgot-password/", { email: email.trim() });
      setStatus(data?.message || "If that email exists, a reset link has been sent.");
    } catch (err) {
      setError(err.response?.data?.error || "Unable to start reset.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sntl-fp-page">
      {/* Compact header */}
      <header className="sntl-fp-header">
        <div className="sntl-fp-brand">
          <span className="sntl-fp-logo">
            <SentinelIconLock className="sntl-fp-logo-icon" />
          </span>
          <span className="sntl-fp-brand-text">Insider Threat Detection</span>
        </div>
        <nav className="sntl-fp-nav">
          <Link to="/login" className="sntl-fp-link">Sign in</Link>
          <Link to="/register" className="sntl-fp-button sntl-fp-button--primary">Create account</Link>
        </nav>
      </header>

      {/* Card */}
      <main className="sntl-fp-shell">
        <div className="sntl-fp-card">
          <div className="sntl-fp-card-head">
            <span className="sntl-fp-badge">
              <SentinelIconLock className="sntl-fp-badge-icon" /> Forgot password
            </span>
            <h1 className="sntl-fp-title">Reset your access</h1>
            <p className="sntl-fp-sub">Enter your email and we’ll send a secure reset link.</p>
          </div>

          {status && <div className="sntl-fp-alert sntl-fp-alert--ok" role="status">{status}</div>}
          {error && <div className="sntl-fp-alert sntl-fp-alert--err" role="alert">{error}</div>}

          <form onSubmit={submit} className="sntl-fp-form">
            <label className="sntl-fp-label" htmlFor="sntl-fp-email">Email</label>
            <div className="sntl-fp-input-wrap">
              <input
                id="sntl-fp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="sntl-fp-input"
                placeholder="name@company.com"
                required
                autoComplete="email"
                aria-invalid={!!error && !isValidEmail}
              />
              <SentinelIconMail className="sntl-fp-input-icon" />
            </div>

            <button
              className="sntl-fp-button sntl-fp-button--primary sntl-fp-button--xl"
              type="submit"
              disabled={!isValidEmail || submitting}
              aria-busy={submitting ? "true" : "false"}
            >
              {submitting ? "Sending…" : "Send reset link"}
            </button>
          </form>

          <div className="sntl-fp-card-foot">
            <span>Remembered it?</span>{" "}
            <Link to="/login" className="sntl-fp-link-underline">Back to sign in</Link>
          </div>
        </div>
      </main>


    </div>
  );
}
