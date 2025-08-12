import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../App.css';

function SocialIcon({ label, href, children }) {
  return (
    <a className="imfoot__socialLink" href={href} aria-label={label} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export default function SiteFooter({
  brand = 'InsiderMonitor',
  tagline = 'Proactive insider threat analytics.',
  socials = {
    github: '#',
    twitter: '#',
    linkedin: '#',
  },
  year = new Date().getFullYear(),
}) {
  const navigate = useNavigate();

  return (
    <footer className="imfoot">
      <div className="imfoot__inner">
        {/* Brand */}
        <div className="imfoot__brand">
          <div className="imfoot__logo" onClick={() => navigate('/')}>
            {brand.replace(/Monitor/i, '')}
            <span className="imfoot__logoAccent">Monitor</span>
          </div>
          <p className="imfoot__tag">{tagline}</p>

          <div className="imfoot__social">
            <SocialIcon label="GitHub" href={socials.github}>
              <svg viewBox="0 0 24 24" className="imfoot__socialIcon" aria-hidden="true">
                <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2c-3.22.7-3.9-1.39-3.9-1.39-.53-1.36-1.3-1.72-1.3-1.72-1.06-.73.08-.72.08-.72 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.11-.76.41-1.27.74-1.56-2.57-.29-5.28-1.29-5.28-5.74 0-1.27.45-2.31 1.2-3.12-.12-.29-.52-1.47.11-3.07 0 0 .98-.31 3.2 1.19a11.06 11.06 0 0 1 5.82 0c2.22-1.5 3.2-1.19 3.2-1.19.63 1.6.23 2.78.12 3.07.75.81 1.2 1.85 1.2 3.12 0 4.46-2.72 5.44-5.31 5.73.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
              </svg>
            </SocialIcon>

            <SocialIcon label="Twitter" href={socials.twitter}>
              <svg viewBox="0 0 24 24" className="imfoot__socialIcon" aria-hidden="true">
                <path d="M20.16 6.46c.01.16.01.31.01.47 0 4.8-3.65 10.33-10.33 10.33A10.27 10.27 0 0 1 4 16.27c.28.03.55.05.84.05a7.28 7.28 0 0 0 4.51-1.55 3.64 3.64 0 0 1-3.4-2.53c.22.04.45.07.69.07.33 0 .66-.05.96-.13a3.64 3.64 0 0 1-2.92-3.57v-.05c.49.27 1.06.43 1.67.45a3.64 3.64 0 0 1-1.12-4.86 10.33 10.33 0 0 0 7.5 3.81 3.64 3.64 0 0 1 6.2-3.32 7.25 7.25 0 0 0 2.31-.88 3.66 3.66 0 0 1-1.6 2.01 7.24 7.24 0 0 0 2.09-.57 7.78 7.78 0 0 1-1.82 1.88Z" />
              </svg>
            </SocialIcon>

            <SocialIcon label="LinkedIn" href={socials.linkedin}>
              <svg viewBox="0 0 24 24" className="imfoot__socialIcon" aria-hidden="true">
                <path d="M4.98 3.5A2.5 2.5 0 1 0 5 8.5a2.5 2.5 0 0 0-.02-5ZM3 9h4v12H3V9Zm7 0h3.84v1.66h.06c.53-.95 1.82-1.95 3.75-1.95 4.01 0 4.75 2.64 4.75 6.07V21h-4v-5.35c0-1.28-.02-2.92-1.78-2.92-1.79 0-2.07 1.4-2.07 2.83V21h-4V9Z" />
              </svg>
            </SocialIcon>
          </div>
        </div>

        {/* Links */}
        <nav className="imfoot__links" aria-label="Footer">
          <div className="imfoot__col">
            <h4 className="imfoot__colTitle">App</h4>
            <button className="imfoot__link" onClick={() => navigate('/')}>Dashboard</button>
            <button className="imfoot__link" onClick={() => navigate('/alerts')}>Alerts</button>
            <button className="imfoot__link" onClick={() => navigate('/users')}>Users</button>
            <button className="imfoot__link" onClick={() => navigate('/analyze')}>Analyze</button>
          </div>

          <div className="imfoot__col">
            <h4 className="imfoot__colTitle">Company</h4>
            <a className="imfoot__link" href="#">About</a>
            <a className="imfoot__link" href="#">Careers</a>
            <a className="imfoot__link" href="#">Contact</a>
          </div>

          <div className="imfoot__col">
            <h4 className="imfoot__colTitle">Resources</h4>
            <a className="imfoot__link" href="#">Docs</a>
            <a className="imfoot__link" href="#">Status</a>
            <a className="imfoot__link" href="#">Privacy</a>
            <a className="imfoot__link" href="#">Terms</a>
          </div>
        </nav>
      </div>

      <div className="imfoot__bottom">
        <span>© {year} {brand}</span>
        <div className="imfoot__bottomLinks">
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Status</a>
        </div>
      </div>
    </footer>
  );
}
