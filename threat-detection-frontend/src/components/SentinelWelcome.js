import React from "react";
import { Link } from "react-router-dom";
import "../App.css";

// Tiny inline SVGs (no extra deps)
const Shield = (props) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M12 2l7 3v6c0 5-3.4 9.7-7 11-3.6-1.3-7-6-7-11V5l7-3z" />
  </svg>
);
const Spark = (props) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M11 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z" />
  </svg>
);
const Graph = (props) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M4 20h16v2H2V2h2v18Zm3-3h3V9H7v8Zm5 0h3V5h-3v12Zm5 0h3v-6h-3v6Z" />
  </svg>
);

export default function SentinelWelcome() {
  return (
    <div className="sw-page">
      {/* Header */}
      <header className="sw-header">
        <div className="sw-brand">
          <span className="sw-logo">
            <Shield className="sw-logo-icon" />
          </span>
          <span className="sw-brand-text">Insider Threat Detection</span>
        </div>

        <nav className="sw-nav">
          <Link to="/get-started" className="sw-link">Get Started</Link>
          <a href="/docs" className="sw-link">Docs</a>
          <Link to="/login" className="sw-button sw-button--ghost">Sign in</Link>
          <Link to="/register" className="sw-button sw-button--primary">Create account</Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="sw-hero">
        <div className="sw-hero-inner">
          <div className="sw-badge">
            <Spark className="sw-badge-icon" />
            real-time security analytics
          </div>
          <h1 className="sw-hero-title">
            See threats <span className="sw-accent">as they happen</span>.
          </h1>
          <p className="sw-hero-sub">
            Stream events, score risk, and respond faster—without wiring a dozen tools together.
          </p>
          <div className="sw-cta-row">
            <Link to="/get-started" className="sw-button sw-button--primary">Get started</Link>
            <Link to="/login" className="sw-button sw-button--ghost">Sign in</Link>
          </div>

          {/* Decorative graph card */}
          <div className="sw-hero-card">
            <Graph className="sw-hero-graph" />
            <div className="sw-hero-card-text">
              Live telemetry, anomaly scoring, and top-user insights—ready out of the box.
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="sw-section">
        <div className="sw-section-inner">
          <div className="sw-feature">
            <div className="sw-feature-icon"><Shield /></div>
            <h3 className="sw-feature-title">Hardened by default</h3>
            <p className="sw-feature-desc">JWT auth, role-based access, and auditable actions. Keys rotate cleanly.</p>
          </div>
          <div className="sw-feature">
            <div className="sw-feature-icon"><Graph /></div>
            <h3 className="sw-feature-title">Actionable visuals</h3>
            <p className="sw-feature-desc">Hourly risk lines, top threat users, and activity pies—no guesswork.</p>
          </div>
          <div className="sw-feature">
            <div className="sw-feature-icon"><Spark /></div>
            <h3 className="sw-feature-title">Realtime pipeline</h3>
            <p className="sw-feature-desc">WebSockets push alerts instantly; REST covers snapshots and backfills.</p>
          </div>
        </div>
      </section>

      {/* Steps */}
      <section className="sw-steps">
        <div className="sw-steps-inner">
          <ol className="sw-steps-list">
            <li>
              <span className="sw-step-bullet">1</span>
              <div>
                <h4>Create your account</h4>
                <p>Use your org email. We enforce strong passwords and verification links.</p>
              </div>
            </li>
            <li>
              <span className="sw-step-bullet">2</span>
              <div>
                <h4>Send a demo event</h4>
                <p>POST once or use the WebSocket to see the dashboard light up.</p>
              </div>
            </li>
            <li>
              <span className="sw-step-bullet">3</span>
              <div>
                <h4>Invite the team</h4>
                <p>Grant least-privilege roles to analysts and admins.</p>
              </div>
            </li>
          </ol>
          <div className="sw-steps-cta">
            <Link to="/get-started" className="sw-button sw-button--primary">Open Quickstart</Link>
            <Link to="/login" className="sw-button sw-button--ghost">Sign in</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="sw-footer">
        <div className="sw-footer-inner">
          <span>© {new Date().getFullYear()} Insider Threat Detection</span>
          <nav className="sw-footer-links">
            <a href="/docs/security">Security</a>
            <a href="/docs/api">API</a>
            <a href="/docs/terms">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
