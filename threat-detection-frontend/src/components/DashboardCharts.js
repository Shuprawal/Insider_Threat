import React, { useEffect, useMemo, useState } from 'react';
import { Line, Pie, Bar } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import '../App.css';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, BarElement, Title, Tooltip, Legend, Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, BarElement, Title, Tooltip, Legend, Filler
);

/* ---- Neon glow on the line stroke ---- */
const neonGlowPlugin = {
  id: 'neonGlow',
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.type !== 'line' || !chart.isDatasetVisible(i)) return;
      const color = (opts && opts.color) || ds.borderColor || '#22D3EE';
      const width = ds.borderWidth || 3;

      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = (opts && opts.blur) ?? 18;
      ctx.lineWidth = width;
      ctx.strokeStyle = color;
      if (typeof meta.dataset.path === 'function') {
        ctx.beginPath();
        meta.dataset.path(ctx);
        ctx.stroke();
      } else {
        meta.dataset.draw(ctx);
      }
      ctx.restore();
    });
  }
};
ChartJS.register(neonGlowPlugin);

/* read CSS variables (from your theme) */
const cssVar = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

export default function DashboardCharts({
  alertPoints,
  pieData,
  barData,
  barMode,
  setBarMode,
  topThreatUsers = [],
  showTopUsers = true,           // <-- you can pass false to hide the right panel
}) {
  const navigate = useNavigate();

  // re-evaluate palette when theme toggles
  const [themeKey, setThemeKey] = useState(0);
  useEffect(() => {
    const fn = () => setThemeKey(k => k + 1);
    window.addEventListener('im-theme-changed', fn);
    return () => window.removeEventListener('im-theme-changed', fn);
  }, []);

  const palette = useMemo(() => ({
    text:  cssVar('--im-text', '#0F172A'),
    sub:   cssVar('--im-text-weak', '#475569'),
    grid:  'rgba(148,163,184,0.25)',
    panel: cssVar('--im-surface', '#FFFFFF'),
    border: cssVar('--im-border', 'rgba(2,6,23,0.1)'),
    cyan:  cssVar('--im-info', '#22D3EE'),
    amber: cssVar('--im-accent', '#F59E0B'),
    rose:  cssVar('--im-danger', '#F43F5E'),
    fillHi: cssVar('--im-line-fill-strong', 'rgba(34,211,238,.42)'),
    fillLo: cssVar('--im-line-fill-weak',   'rgba(34,211,238,.04)'),
  }), [themeKey]);

  ChartJS.defaults.color = palette.sub;
  ChartJS.defaults.borderColor = palette.grid;
  ChartJS.defaults.font.family =
    'system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Arial';

  /* ---------- LINE with gradient area fill ---------- */
  const lineData = useMemo(() => ({
    labels: alertPoints.map(p => p.timestamp),
    datasets: [{
      label: 'Threat Score',
      data: alertPoints.map(p => p.score),
      borderColor: palette.cyan,
      borderWidth: 3,
      pointRadius: 4,
      pointHoverRadius: 6,
      tension: 0.35,
      fill: 'start',
      backgroundColor: (ctx) => {
        const { chart } = ctx;
        const area = chart.chartArea;
        if (!area) return palette.fillLo;
        const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        g.addColorStop(0.00, palette.fillHi);
        g.addColorStop(0.40, 'rgba(34,211,238,.22)');
        g.addColorStop(0.75, 'rgba(34,211,238,.10)');
        g.addColorStop(1.00, 'rgba(34,211,238,0)');
        return g;
      },
    }]
  }), [alertPoints, palette]);

  const lineOpts = useMemo(() => ({
    responsive: true,
    elements: { line: { fill: true } },
    plugins: {
      neonGlow: { color: palette.cyan, blur: 20 },
      legend: { position: 'top', labels: { color: palette.sub } },
      title:  { display: true, text: '📈 Hourly Average Threat Score', color: palette.text },
      tooltip: {
        backgroundColor: 'rgba(2,6,23,0.9)',
        titleColor: '#F8FAFC',
        bodyColor: '#E5E7EB',
        callbacks: {
          label(ctx) {
            const i = ctx.dataIndex, p = alertPoints[i];
            return p ? [`👤 ${p.user}`, `📌 ${p.reason}`, `Score: ${p.score}`] : `Score: ${ctx.raw}`;
          }
        }
      }
    },
    scales: {
      x: { ticks: { color: palette.sub }, grid: { color: palette.grid } },
      y: { ticks: { color: palette.sub }, grid: { color: palette.grid } }
    }
  }), [alertPoints, palette]);

  /* ---------- PIE ---------- */
  const pieChartData = useMemo(() => ({
    labels: pieData.labels,
    datasets: [{
      data: pieData.values,
      backgroundColor: [palette.rose, palette.amber, '#22C55E', '#3B82F6', '#A78BFA'],
      borderColor: palette.panel,
      borderWidth: 2,
      hoverOffset: 6
    }]
  }), [pieData, palette]);

  const pieOpts = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: palette.sub } },
      title:  { display: true, text: '🧪 Top Suspicious Activities', color: palette.text }
    }
  }), [palette]);

  /* ---------- BAR ---------- */
  const barChartData = useMemo(() => ({
    labels: barData.labels,
    datasets: [{
      label: barMode === 'score' ? 'Avg. Threat Score' : 'Suspicious Activity Count',
      data: barData.values,
      backgroundColor: palette.amber,
      borderRadius: 8,
      barThickness: 52
    }]
  }), [barData, barMode, palette]);

  const barOpts = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: barMode === 'score'
          ? '👥 Users with Highest Threat Scores'
          : '👥 Users with Most Suspicious Activities',
        color: palette.text
      },
      tooltip: { backgroundColor: 'rgba(2,6,23,0.9)', titleColor: '#F8FAFC', bodyColor: '#E5E7EB' }
    },
    scales: {
      x: { ticks: { color: palette.sub }, grid: { display: false } },
      y: { ticks: { color: palette.sub }, grid: { color: palette.grid } }
    }
  }), [barMode, palette]);

  const panelStyle = { background: 'var(--im-surface)', border: '1px solid var(--im-border)' };
  const showUsersPanel = showTopUsers && (topThreatUsers?.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Line + optional Users panel */}
      <div className="w-full md:flex md:gap-6">
        <div
          className={`rounded-2xl p-6 shadow-md w-full ${showUsersPanel ? 'md:w-3/4' : 'md:w-full'}`}
          style={panelStyle}
        >
          <Line data={lineData} options={lineOpts} />
        </div>

        {showUsersPanel && (
          <div className="rounded-2xl p-0 shadow-md md:w-1/4 w-full mt-6 md:mt-0" style={panelStyle}>
            <ThreatUserList
              title="🧍 Top Threat Users"
              users={topThreatUsers}
              onClickUser={(u) => {
                if (u?.id) return navigate(`/users/${u.id}`);
                if (u?.username) return navigate(`/users/username/${encodeURIComponent(u.username)}`);
              }}
            />
          </div>
        )}
      </div>

      {/* Pie + Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl p-6 shadow-md h-[500px]" style={panelStyle}>
          <Pie data={pieChartData} options={pieOpts} />
        </div>
        <div className="rounded-2xl p-6 shadow-md h-[500px] flex flex-col" style={panelStyle}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--im-text)' }}>
              {barMode === 'score' ? '👥 Top Users by Threat Score' : '👥 Top Users by Suspicious Activity Count'}
            </h2>
            <button
              onClick={() => setBarMode(prev => (prev === 'score' ? 'count' : 'score'))}
              className="px-3 py-1 text-sm rounded"
              style={{ background: 'var(--im-surface)', color: 'var(--im-text)', border: '1px solid var(--im-border)' }}
            >
              Toggle to {barMode === 'score' ? 'Count' : 'Score'}
            </button>
          </div>
          <div className="flex-1">
            <Bar data={barChartData} options={barOpts} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- User list components ---------- */

function ThreatUserList({ users, onClickUser, title }) {
  return (
    <div className="imdash-userlist">
      <div className="imdash-userlist__header">{title}</div>
      <ul className="imdash-userlist__list" role="list">
        {users.length === 0 && <li className="imdash-userlist__empty">No users yet</li>}
        {users.map((u, idx) => (
          <ThreatUserRow key={u.id ?? u.username ?? idx} user={u} onClick={() => onClickUser(u)} />
        ))}
      </ul>
    </div>
  );
}

function ThreatUserRow({ user, onClick }) {
  const avatarUrl = user.avatar_url || user.profile_picture || user.photo || null;

  return (
    <li
      className="imdash-userrow"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      aria-label={`Open ${user.username}'s profile`}
    >
      <UserAvatar src={avatarUrl} name={user.username} />
      <div className="imdash-userrow__main">
        <div className="imdash-userrow__name" title={user.username}>{user.username}</div>
        <div className="imdash-userrow__meta">{user.count} threats</div>
      </div>
      <svg className="imdash-userrow__chevron" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </li>
  );
}

function UserAvatar({ src, name = '', size = 40 }) {
  const [broken, setBroken] = useState(false);
  const initials = (name || '')
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  if (src && !broken) {
    return (
      <img
        className="imdash-avatar"
        src={src}
        alt={`${name}'s avatar`}
        width={size}
        height={size}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div className="imdash-avatar imdash-avatar--fallback" style={{ width: size, height: size }}>
      {initials ? (
        <span className="imdash-avatar__initials">{initials}</span>
      ) : (
        <svg viewBox="0 0 24 24" className="imdash-avatar__icon" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" />
        </svg>
      )}
    </div>
  );
}
