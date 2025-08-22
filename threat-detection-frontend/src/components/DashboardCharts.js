// src/components/DashboardCharts.js
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
      } else if (meta.dataset?.draw) {
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

/* format ISO string to local readable label */
const fmtLocalLabel = (ts) =>
  new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });

/* ---- GlowFrame: wrapper that owns the animated border ray ---- */
function GlowFrame({ className = '', children }) {
  return (
    <div className={`imdash-glowwrap ${className}`}>
      {/* inner card keeps the padding/shadow/background but NO border */}
        <div className="imdash-glowwrap__inner">
      <div
        className="rounded-2xl p-6 shadow-md w-full"
        style={{ background: 'var(--im-surface)' }}
      >
        {children}
      </div>
        </div>
    </div>
  );
}

export default function DashboardCharts({
  alertPoints,
  pieData,
  barData,
  barMode,
  setBarMode,
  topThreatUsers = [],
  showTopUsers = true, // pass false to hide the right panel
}) {
  const navigate = useNavigate();

  // re-evaluate palette when theme toggles
  const [themeKey, setThemeKey] = useState(0);
  useEffect(() => {
    const fn = () => setThemeKey(k => k + 1);
    window.addEventListener('im-theme-changed', fn);
    return () => window.removeEventListener('im-theme-changed', fn);
  }, []);

  // ⬇️ explicitly reference themeKey so ESLint knows this dependency is intentional
  const palette = useMemo(() => {
    void themeKey;
    return {
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
    };
  }, [themeKey]);

  ChartJS.defaults.color = palette.sub;
  ChartJS.defaults.borderColor = palette.grid;
  ChartJS.defaults.font.family =
    'system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Arial';

  /* ---------- STABILIZED INPUTS FOR MEMOS ---------- */
  const safePoints = useMemo(
    () => (Array.isArray(alertPoints) ? alertPoints : []),
    [alertPoints]
  );

  const pl = useMemo(
    () => (Array.isArray(pieData?.labels) ? pieData.labels : []),
    [pieData?.labels]
  );
  const pv = useMemo(
    () => (Array.isArray(pieData?.values) ? pieData.values.map(Number) : []),
    [pieData?.values]
  );

  const bl = useMemo(
    () => (Array.isArray(barData?.labels) ? barData.labels : []),
    [barData?.labels]
  );
  const bv = useMemo(
    () => (Array.isArray(barData?.values) ? barData.values.map(Number) : []),
    [barData?.values]
  );

  /* ---------- LINE with gradient area fill ---------- */
  const lineHasData = safePoints.length > 0;

  const lineData = useMemo(() => ({
    labels: safePoints.map(p => fmtLocalLabel(p.timestamp)),
    datasets: [{
      label: 'Threat Score',
      data: safePoints.map(p => Number(p.score || 0)),
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
  }), [safePoints, palette]);

  const lineOpts = useMemo(() => ({
    responsive: true,
    elements: { line: { fill: true } },
    plugins: {
      neonGlow: { color: palette.cyan, blur: 20 },
      legend: { position: 'top', labels: { color: palette.sub } },
      title:  { display: true, text: '📈 Threat Scores Over Time', color: palette.text },
      tooltip: {
        backgroundColor: 'rgba(2,6,23,0.9)',
        titleColor: '#F8FAFC',
        bodyColor: '#E5E7EB',
        callbacks: {
          title(items) {
            const idx = items?.[0]?.dataIndex ?? 0;
            const p = safePoints[idx];
            return p ? fmtLocalLabel(p.timestamp) : '';
          },
          label(ctx) {
            const i = ctx.dataIndex, p = safePoints[i];
            if (!p) return `Score: ${ctx.raw}`;
            const parts = [];
            if (p.user) parts.push(`👤 ${p.user}`);
            if (p.reason) parts.push(`📌 ${p.reason}`);
            parts.push(`Score: ${p.score}`);
            return parts;
          }
        }
      }
    },
    scales: {
      x: { ticks: { color: palette.sub }, grid: { color: palette.grid } },
      y: { ticks: { color: palette.sub }, grid: { color: palette.grid } }
    }
  }), [safePoints, palette]);

  /* ---------- PIE ---------- */
  const pieHasData = pv.some(v => v > 0);

  const pieChartData = useMemo(() => ({
    labels: pl,
    datasets: [{
      data: pv,
      backgroundColor: [palette.rose, palette.amber, '#22C55E', '#3B82F6', '#A78BFA'],
      borderColor: palette.panel,
      borderWidth: 2,
      hoverOffset: 6
    }]
  }), [pl, pv, palette]);

  const pieOpts = useMemo(() => ({
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: palette.sub } },
      title:  { display: true, text: '🧪 Top Suspicious Activities', color: palette.text }
    }
  }), [palette]);

  /* ---------- BAR ---------- */
  const barHasData = bv.some(v => v > 0);

  const barChartData = useMemo(() => ({
    labels: bl,
    datasets: [{
      label: barMode === 'score' ? 'Avg. Threat Score' : 'Suspicious Activity Count',
      data: bv,
      backgroundColor: palette.amber,
      borderRadius: 8,
      barThickness: 52
    }]
  }), [bl, bv, barMode, palette]);

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
        {/* 🔥 Glow only on the line chart panel */}
        <GlowFrame className={`w-full ${showUsersPanel ? 'md:w-3/4' : 'md:w-full'}`}>
          {lineHasData ? (
            <Line data={lineData} options={lineOpts} />
          ) : (
            <EmptyState height={300} message="🚫 No threats detected in this period" />
          )}
        </GlowFrame>

        {showTopUsers ? (
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
        ) : null}
      </div>

      {/* Pie + Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-2xl p-6 shadow-md h-[500px]" style={panelStyle}>
          {pieHasData ? (
            <Pie data={pieChartData} options={pieOpts} />
          ) : (
            <EmptyState message="🚫 No threat activity data" />
          )}
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
            {barHasData ? (
              <Bar data={barChartData} options={barOpts} />
            ) : (
              <EmptyState message="🚫 No user threat stats" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Reusable empty state ---------- */
function EmptyState({ message = 'No data', height = 460 }) {
  return (
    <div
      className="flex items-center justify-center text-gray-500"
      style={{ height }}
      role="status"
      aria-live="polite"
    >
      {message}
    </div>
  );
}

/* ---------- User list components ---------- */

function ThreatUserList({ users = [], onClickUser, title }) {
  return (
    <div className="imdash-userlist">
      <div className="imdash-userlist__header">{title}</div>
      <ul className="imdash-userlist__list">
        {users.length === 0 && (
          <li className="imdash-userlist__empty">🚫 No threats detected</li>
        )}
        {users.map((u, idx) => (
          <ThreatUserRow key={u.id ?? u.username ?? idx} user={u} onClick={() => onClickUser?.(u)} />
        ))}
      </ul>
    </div>
  );
}

function ThreatUserRow({ user, onClick }) {
  const [broken, setBroken] = useState(false);
  const avatarUrl = user?.avatar_url || user?.profile_picture || user?.photo || null;
  const initials = (user?.username || '')
    .split(' ')
    .map(p => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <li
      className="imdash-userrow"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      aria-label={`Open ${user?.username || 'user'}'s profile`}
    >
      <UserAvatar src={avatarUrl} initials={initials} name={user?.username} />
      <div className="imdash-userrow__main">
        <div className="imdash-userrow__name" title={user?.username}>{user?.username}</div>
        <div className="imdash-userrow__meta">{user?.count ?? 0} threats</div>
      </div>
      <svg className="imdash-userrow__chevron" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </li>
  );
}

function UserAvatar({ src, initials, name = '', size = 40 }) {
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      <img
        className="imdash-avatar"
        src={src}
        alt={`${name || 'user'}'s avatar`}
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







//
//
// // src/components/DashboardCharts.js
// import React, { useEffect, useMemo, useState } from 'react';
// import { Line, Pie, Bar } from 'react-chartjs-2';
// import { useNavigate } from 'react-router-dom';
// import '../App.css';
// import {
//   Chart as ChartJS,
//   CategoryScale, LinearScale, PointElement, LineElement,
//   ArcElement, BarElement, Title, Tooltip, Legend, Filler
// } from 'chart.js';
//
// ChartJS.register(
//   CategoryScale, LinearScale, PointElement, LineElement,
//   ArcElement, BarElement, Title, Tooltip, Legend, Filler
// );
//
// /* ---- Neon glow on the line stroke ---- */
// const neonGlowPlugin = {
//   id: 'neonGlow',
//   afterDatasetsDraw(chart, _args, opts) {
//     const { ctx } = chart;
//     chart.data.datasets.forEach((ds, i) => {
//       const meta = chart.getDatasetMeta(i);
//       if (meta.type !== 'line' || !chart.isDatasetVisible(i)) return;
//       const color = (opts && opts.color) || ds.borderColor || '#22D3EE';
//       const width = ds.borderWidth || 3;
//
//       ctx.save();
//       ctx.shadowColor = color;
//       ctx.shadowBlur = (opts && opts.blur) ?? 18;
//       ctx.lineWidth = width;
//       ctx.strokeStyle = color;
//       if (typeof meta.dataset.path === 'function') {
//         ctx.beginPath();
//         meta.dataset.path(ctx);
//         ctx.stroke();
//       } else if (meta.dataset?.draw) {
//         meta.dataset.draw(ctx);
//       }
//       ctx.restore();
//     });
//   }
// };
// ChartJS.register(neonGlowPlugin);
//
// /* read CSS variables (from your theme) */
// const cssVar = (name, fallback) =>
//   getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
//
// /* format ISO string to local readable label */
// const fmtLocalLabel = (ts) =>
//   new Date(ts).toLocaleString(undefined, {
//     year: 'numeric', month: '2-digit', day: '2-digit',
//     hour: '2-digit', minute: '2-digit', hour12: false
//   });
//
// export default function DashboardCharts({
//   alertPoints,
//   pieData,
//   barData,
//   barMode,
//   setBarMode,
//   topThreatUsers = [],
//   showTopUsers = true, // pass false to hide the right panel
// }) {
//   const navigate = useNavigate();
//
//   // re-evaluate palette when theme toggles
//   const [themeKey, setThemeKey] = useState(0);
//   useEffect(() => {
//     const fn = () => setThemeKey(k => k + 1);
//     window.addEventListener('im-theme-changed', fn);
//     return () => window.removeEventListener('im-theme-changed', fn);
//   }, []);
//
//   // ⬇️ explicitly reference themeKey so ESLint knows this dependency is intentional
//   const palette = useMemo(() => {
//     void themeKey;
//     return {
//       text:  cssVar('--im-text', '#0F172A'),
//       sub:   cssVar('--im-text-weak', '#475569'),
//       grid:  'rgba(148,163,184,0.25)',
//       panel: cssVar('--im-surface', '#FFFFFF'),
//       border: cssVar('--im-border', 'rgba(2,6,23,0.1)'),
//       cyan:  cssVar('--im-info', '#22D3EE'),
//       amber: cssVar('--im-accent', '#F59E0B'),
//       rose:  cssVar('--im-danger', '#F43F5E'),
//       fillHi: cssVar('--im-line-fill-strong', 'rgba(34,211,238,.42)'),
//       fillLo: cssVar('--im-line-fill-weak',   'rgba(34,211,238,.04)'),
//     };
//   }, [themeKey]);
//
//   ChartJS.defaults.color = palette.sub;
//   ChartJS.defaults.borderColor = palette.grid;
//   ChartJS.defaults.font.family =
//     'system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,Arial';
//
//   /* ---------- STABILIZED INPUTS FOR MEMOS ---------- */
//   const safePoints = useMemo(
//     () => (Array.isArray(alertPoints) ? alertPoints : []),
//     [alertPoints]
//   );
//
//   const pl = useMemo(
//     () => (Array.isArray(pieData?.labels) ? pieData.labels : []),
//     [pieData?.labels]
//   );
//   const pv = useMemo(
//     () => (Array.isArray(pieData?.values) ? pieData.values.map(Number) : []),
//     [pieData?.values]
//   );
//
//   const bl = useMemo(
//     () => (Array.isArray(barData?.labels) ? barData.labels : []),
//     [barData?.labels]
//   );
//   const bv = useMemo(
//     () => (Array.isArray(barData?.values) ? barData.values.map(Number) : []),
//     [barData?.values]
//   );
//
//   /* ---------- LINE with gradient area fill ---------- */
//   const lineHasData = safePoints.length > 0;
//
//   const lineData = useMemo(() => ({
//     labels: safePoints.map(p => fmtLocalLabel(p.timestamp)),
//     datasets: [{
//       label: 'Threat Score',
//       data: safePoints.map(p => Number(p.score || 0)),
//       borderColor: palette.cyan,
//       borderWidth: 3,
//       pointRadius: 4,
//       pointHoverRadius: 6,
//       tension: 0.35,
//       fill: 'start',
//       backgroundColor: (ctx) => {
//         const { chart } = ctx;
//         const area = chart.chartArea;
//         if (!area) return palette.fillLo;
//         const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
//         g.addColorStop(0.00, palette.fillHi);
//         g.addColorStop(0.40, 'rgba(34,211,238,.22)');
//         g.addColorStop(0.75, 'rgba(34,211,238,.10)');
//         g.addColorStop(1.00, 'rgba(34,211,238,0)');
//         return g;
//       },
//     }]
//   }), [safePoints, palette]);
//
//   const lineOpts = useMemo(() => ({
//     responsive: true,
//     elements: { line: { fill: true } },
//     plugins: {
//       neonGlow: { color: palette.cyan, blur: 20 },
//       legend: { position: 'top', labels: { color: palette.sub } },
//       title:  { display: true, text: '📈 Threat Scores Over Time', color: palette.text },
//       tooltip: {
//         backgroundColor: 'rgba(2,6,23,0.9)',
//         titleColor: '#F8FAFC',
//         bodyColor: '#E5E7EB',
//         callbacks: {
//           title(items) {
//             const idx = items?.[0]?.dataIndex ?? 0;
//             const p = safePoints[idx];
//             return p ? fmtLocalLabel(p.timestamp) : '';
//           },
//           label(ctx) {
//             const i = ctx.dataIndex, p = safePoints[i];
//             if (!p) return `Score: ${ctx.raw}`;
//             const parts = [];
//             if (p.user) parts.push(`👤 ${p.user}`);
//             if (p.reason) parts.push(`📌 ${p.reason}`);
//             parts.push(`Score: ${p.score}`);
//             return parts;
//           }
//         }
//       }
//     },
//     scales: {
//       x: { ticks: { color: palette.sub }, grid: { color: palette.grid } },
//       y: { ticks: { color: palette.sub }, grid: { color: palette.grid } }
//     }
//   }), [safePoints, palette]);
//
//   /* ---------- PIE ---------- */
//   const pieHasData = pv.some(v => v > 0);
//
//   const pieChartData = useMemo(() => ({
//     labels: pl,
//     datasets: [{
//       data: pv,
//       backgroundColor: [palette.rose, palette.amber, '#22C55E', '#3B82F6', '#A78BFA'],
//       borderColor: palette.panel,
//       borderWidth: 2,
//       hoverOffset: 6
//     }]
//   }), [pl, pv, palette]);
//
//   const pieOpts = useMemo(() => ({
//     responsive: true, maintainAspectRatio: false,
//     plugins: {
//       legend: { position: 'bottom', labels: { color: palette.sub } },
//       title:  { display: true, text: '🧪 Top Suspicious Activities', color: palette.text }
//     }
//   }), [palette]);
//
//   /* ---------- BAR ---------- */
//   const barHasData = bv.some(v => v > 0);
//
//   const barChartData = useMemo(() => ({
//     labels: bl,
//     datasets: [{
//       label: barMode === 'score' ? 'Avg. Threat Score' : 'Suspicious Activity Count',
//       data: bv,
//       backgroundColor: palette.amber,
//       borderRadius: 8,
//       barThickness: 52
//     }]
//   }), [bl, bv, barMode, palette]);
//
//   const barOpts = useMemo(() => ({
//     responsive: true, maintainAspectRatio: false,
//     plugins: {
//       legend: { display: false },
//       title: {
//         display: true,
//         text: barMode === 'score'
//           ? '👥 Users with Highest Threat Scores'
//           : '👥 Users with Most Suspicious Activities',
//         color: palette.text
//       },
//       tooltip: { backgroundColor: 'rgba(2,6,23,0.9)', titleColor: '#F8FAFC', bodyColor: '#E5E7EB' }
//     },
//     scales: {
//       x: { ticks: { color: palette.sub }, grid: { display: false } },
//       y: { ticks: { color: palette.sub }, grid: { color: palette.grid } }
//     }
//   }), [barMode, palette]);
//
//   const panelStyle = { background: 'var(--im-surface)', border: '1px solid var(--im-border)' };
//   const showUsersPanel = showTopUsers && (topThreatUsers?.length > 0);
//
//   return (
//     <div className="flex flex-col gap-6">
//       {/* Line + optional Users panel */}
//       <div className="w-full md:flex md:gap-6">
//         <div
//           className={` imdash-glowwrap rounded-2xl p-6 shadow-md w-full ${showUsersPanel ? 'md:w-3/4' : 'md:w-full'}`}
//           style={panelStyle}
//         >
//           {lineHasData ? (
//             <Line data={lineData} options={lineOpts} />
//           ) : (
//             <EmptyState height={300} message="🚫 No threats detected in this period" />
//           )}
//         </div>
//
//         {showTopUsers ? (
//           <div className="rounded-2xl p-0 shadow-md md:w-1/4 w-full mt-6 md:mt-0" style={panelStyle}>
//             <ThreatUserList
//               title="🧍 Top Threat Users"
//               users={topThreatUsers}
//               onClickUser={(u) => {
//                 if (u?.id) return navigate(`/users/${u.id}`);
//                 if (u?.username) return navigate(`/users/username/${encodeURIComponent(u.username)}`);
//               }}
//             />
//           </div>
//         ) : null}
//       </div>
//
//       {/* Pie + Bar */}
//       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
//         <div className="rounded-2xl p-6 shadow-md h-[500px]" style={panelStyle}>
//           {pieHasData ? (
//             <Pie data={pieChartData} options={pieOpts} />
//           ) : (
//             <EmptyState message="🚫 No threat activity data" />
//           )}
//         </div>
//         <div className="rounded-2xl p-6 shadow-md h-[500px] flex flex-col" style={panelStyle}>
//           <div className="flex justify-between items-center mb-4">
//             <h2 className="text-lg font-semibold" style={{ color: 'var(--im-text)' }}>
//               {barMode === 'score' ? '👥 Top Users by Threat Score' : '👥 Top Users by Suspicious Activity Count'}
//             </h2>
//             <button
//               onClick={() => setBarMode(prev => (prev === 'score' ? 'count' : 'score'))}
//               className="px-3 py-1 text-sm rounded"
//               style={{ background: 'var(--im-surface)', color: 'var(--im-text)', border: '1px solid var(--im-border)' }}
//             >
//               Toggle to {barMode === 'score' ? 'Count' : 'Score'}
//             </button>
//           </div>
//           <div className="flex-1">
//             {barHasData ? (
//               <Bar data={barChartData} options={barOpts} />
//             ) : (
//               <EmptyState message="🚫 No user threat stats" />
//             )}
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// }
//
// /* ---------- Reusable empty state ---------- */
// function EmptyState({ message = 'No data', height = 460 }) {
//   return (
//     <div
//       className="flex items-center justify-center text-gray-500"
//       style={{ height }}
//       role="status"
//       aria-live="polite"
//     >
//       {message}
//     </div>
//   );
// }
//
// /* ---------- User list components ---------- */
//
// function ThreatUserList({ users = [], onClickUser, title }) {
//   return (
//     <div className="imdash-userlist">
//       <div className="imdash-userlist__header">{title}</div>
//       {/* removed redundant role="list" */}
//       <ul className="imdash-userlist__list">
//         {users.length === 0 && (
//           <li className="imdash-userlist__empty">🚫 No threats detected</li>
//         )}
//         {users.map((u, idx) => (
//           <ThreatUserRow key={u.id ?? u.username ?? idx} user={u} onClick={() => onClickUser?.(u)} />
//         ))}
//       </ul>
//     </div>
//   );
// }
//
// function ThreatUserRow({ user, onClick }) {
//   const [broken, setBroken] = useState(false);
//   const avatarUrl = user?.avatar_url || user?.profile_picture || user?.photo || null;
//   const initials = (user?.username || '')
//     .split(' ')
//     .map(p => p[0])
//     .join('')
//     .slice(0, 2)
//     .toUpperCase();
//
//   return (
//     <li
//       className="imdash-userrow"
//       onClick={onClick}
//       role="button"
//       tabIndex={0}
//       onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
//       aria-label={`Open ${user?.username || 'user'}'s profile`}
//     >
//       <UserAvatar src={avatarUrl} initials={initials} name={user?.username} />
//       <div className="imdash-userrow__main">
//         <div className="imdash-userrow__name" title={user?.username}>{user?.username}</div>
//         <div className="imdash-userrow__meta">{user?.count ?? 0} threats</div>
//       </div>
//       <svg className="imdash-userrow__chevron" viewBox="0 0 24 24" aria-hidden="true">
//         <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
//       </svg>
//     </li>
//   );
// }
//
// function UserAvatar({ src, initials, name = '', size = 40 }) {
//   const [broken, setBroken] = useState(false);
//
//   if (src && !broken) {
//     return (
//       <img
//         className="imdash-avatar"
//         src={src}
//         alt={`${name || 'user'}'s avatar`}
//         width={size}
//         height={size}
//         onError={() => setBroken(true)}
//       />
//     );
//   }
//
//   return (
//     <div className="imdash-avatar imdash-avatar--fallback" style={{ width: size, height: size }}>
//       {initials ? (
//         <span className="imdash-avatar__initials">{initials}</span>
//       ) : (
//         <svg viewBox="0 0 24 24" className="imdash-avatar__icon" aria-hidden="true">
//           <circle cx="12" cy="8" r="4" />
//           <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" />
//         </svg>
//       )}
//     </div>
//   );
// }
