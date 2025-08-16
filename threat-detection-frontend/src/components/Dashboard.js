// src/components/RealTimeInsiderThreatDashboardComponent.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import DashboardCharts from './DashboardCharts';
import DateFilter from './Date';
import '../App.css';
import SiteFooter from './SiteFooter';
import { getToken } from './authStorage';

// ----- helpers -----
function toLocalYMD(dateObj) {
  return new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Fetch ALL pages from a DRF-ish endpoint and return { items, total }.
 * Works with shapes:
 *   Array | {results, count} | {logs} | {data, total} and header totals.
 */
async function fetchAllLogs(headers, params) {
  const base = 'http://localhost:8000/api/logs/all/';
  let url = base;
  let out = [];
  let total = null;
  let guard = 0;

  while (url && guard < 50) {
    const res = await axios.get(url, { headers, params });
    const d = res.data;

    const pageItems = Array.isArray(d) ? d : (d.results ?? d.logs ?? d.data ?? []);
    out = out.concat(pageItems);

    if (total == null) {
      if (typeof d?.count === 'number') total = d.count;
      else if (typeof d?.total === 'number') total = d.total;
      else if (typeof d?.total_logs === 'number') total = d.total_logs;
      else if (res.headers?.['x-total-count']) total = Number(res.headers['x-total-count']);
      else if (res.headers?.['content-range']) {
        const m = String(res.headers['content-range']).match(/\/(\d+)$/);
        if (m) total = Number(m[1]);
      }
    }

    // follow DRF pagination links
    url = d?.next || null;
    // after first call, next is absolute; don't send params again
    params = undefined;
    guard++;
  }

  return { items: out, total: total ?? out.length };
}

export default function RealTimeInsiderThreatDashboardComponent() {
  const [arrayOfSystemUserLogs, setArrayOfSystemUserLogs] = useState([]);
  const [totalLogsCount, setTotalLogsCount] = useState(0);

  const [numberOfOpenAlerts, setNumberOfOpenAlerts] = useState(0);
  const [topThreatUsers, setTopThreatUsers] = useState([]);
  const [groupBy, setGroupBy] = useState('hour');

  // charts
  const [alertPoints, setAlertPoints] = useState([]);
  const [pieLabels, setPieLabels] = useState([]);
  const [pieCounts, setPieCounts] = useState([]);
  const [barLabels, setBarLabels] = useState([]);
  const [barCounts, setBarCounts] = useState([]);
  const [barScores, setBarScores] = useState([]);
  const [barMode, setBarMode] = useState('score');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errorMessageOnDashboard, setErrorMessageOnDashboard] = useState('');
  const [dashboardLoadingState, setDashboardLoadingState] = useState(false);

  // 🔊 live alerts listener
  useEffect(() => {
    const onNewAlert = (e) => {
      const p = e.detail || {};
      const score =
        Number(p.score) ||
        Number(p.score_pct) ||
        (p.adjusted_probability != null ? Number(p.adjusted_probability) * 100 : 0);

      setAlertPoints((prev) => {
        const next = [
          ...prev,
          {
            timestamp: p.timestamp,
            score,
            user: p.username || 'Unknown',
            reason: p.reason || '',
          },
        ];
        next.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        if (next.length > 2000) next.splice(0, next.length - 2000);
        return next;
      });
    };

    window.addEventListener('im-new-alert', onNewAlert);
    return () => window.removeEventListener('im-new-alert', onNewAlert);
  }, []);

  // normalize dashboard payload
  const normalizeDashboard = useCallback((d = {}) => {
    const raw = d.alertPoints || d.hourly || d.hourly_points || [];
    const points = raw
      .map((r) => ({
        timestamp: r.timestamp || r.hour || r.h || r.time,
        score: Number(r.score ?? r.avg_score ?? r.value ?? 0),
        user: r.user || r.username || 'Unknown',
        reason: r.reason || r.activity_type || '',
      }))
      .filter((p) => p.timestamp != null);

    return {
      alertPoints: points,
      topThreatUsers: (d.topThreatUsers || d.top_users || []).map((u) => ({
        id: u.id,
        username: u.username || 'Unknown',
        count: u.threats ?? u.count ?? 0,
      })),
      pieLabels: d.pieLabels || d.topActivities?.map((a) => a.label) || [],
      pieCounts: d.pieData || d.topActivities?.map((a) => a.count) || [],
      barLabels: d.barLabels || [],
      barCounts: d.barCounts || [],
      barScores: d.barScores || [],
      groupBy: d.groupBy || 'hour',
    };
  }, []);

  const fetchLogsAndAlertsFromServer = useCallback(async () => {
    if (!startDate || !endDate) return;
    setDashboardLoadingState(true);
    setErrorMessageOnDashboard('');

    try {
      const headers = { Authorization: `Bearer ${getToken() || localStorage.getItem('custom_token')}` };

      // Ask for generous page sizes; server will ignore unknown params
      const baseParams = {
        start_date: startDate,
        end_date: endDate,
        page: 1,
        page_size: 5000,
        limit: 5000,
        offset: 0,
      };

      const [logsAll, alertsRes, chartRes] = await Promise.all([
        fetchAllLogs(headers, baseParams),
        axios.get('http://localhost:8000/api/alerts/', { headers, params: baseParams }),
        axios.get('http://localhost:8000/api/dashboard-data/', {
          headers,
          params: { start_date: startDate, end_date: endDate },
        }),
      ]);

      // ---- LOGS ----
      setArrayOfSystemUserLogs(logsAll.items);
      setTotalLogsCount(logsAll.total);

      // ---- ALERTS ----
      const ar = alertsRes.data;
      const alertsArray = Array.isArray(ar) ? ar : ar.results ?? ar.alerts ?? [];

      let openAlerts = typeof ar?.open === 'number' ? ar.open : null;
      if (openAlerts == null) {
        if (Array.isArray(alertsArray)) {
          openAlerts = alertsArray.filter(
            (a) => a?.is_resolved === false || a?.status === 'open' || a?.closed_at == null
          ).length;
        } else {
          openAlerts = typeof ar?.count === 'number' ? ar.count : 0;
        }
      }
      setNumberOfOpenAlerts(openAlerts);

      // ---- CHARTS ----
      const n = normalizeDashboard(chartRes.data || {});
      setTopThreatUsers(n.topThreatUsers);
      setPieLabels(n.pieLabels);
      setPieCounts(n.pieCounts);
      setBarLabels(n.barLabels);
      setBarCounts(n.barCounts);
      setBarScores(n.barScores);
      setGroupBy(n.groupBy);

      // Merge live + REST points (dedupe)
      setAlertPoints((prevLive) => {
        const merged = [...prevLive, ...(n.alertPoints || [])];
        const seen = new Set();
        const uniq = [];
        for (const pt of merged) {
          const key = `${pt.timestamp}|${Number(pt.score).toFixed(2)}|${pt.user || ''}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniq.push(pt);
          }
        }
        uniq.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        return uniq;
      });

      // Dev aid
      console.log('[logs] total:', logsAll.total, 'items:', logsAll.items.length);
      console.log('[alerts] shape:', ar);
    } catch (error) {
      console.error('dashboard fetch error:', error);
      setErrorMessageOnDashboard('🚨 Failed to retrieve data. Please refresh.');
    } finally {
      setDashboardLoadingState(false);
    }
  }, [startDate, endDate, normalizeDashboard]);

  // default date range = today
  useEffect(() => {
    const today = toLocalYMD(new Date());
    setStartDate(today);
    setEndDate(today);
  }, []);

  // reload on date change
  useEffect(() => {
    fetchLogsAndAlertsFromServer();
  }, [startDate, endDate, fetchLogsAndAlertsFromServer]);

  const suspiciousUsers = new Set(
    arrayOfSystemUserLogs
      .filter((l) => l.is_suspicious)
      .map((l) => l.user_id ?? l.user ?? l.username)
  ).size;

  return (
    <div className="imdash-page">
      <div className="imdash-kpi-grid">
        <StatCard label="Total Logs" value={totalLogsCount} tone="info" />
        <StatCard label="Flagged Users" value={suspiciousUsers} tone="warn" />
        <StatCard label="Active Alerts" value={numberOfOpenAlerts} tone="danger" />
      </div>

      <section className="imdash-panel">
        <div className="imdash-filter-row">
          <DateFilter
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            onRefresh={fetchLogsAndAlertsFromServer}
          />
        </div>

        {errorMessageOnDashboard && (
          <div className="im-banner im-banner--error" style={{ marginBottom: 12 }}>
            {errorMessageOnDashboard}
          </div>
        )}
        {dashboardLoadingState && <div className="im-banner">Loading…</div>}

        <DashboardCharts
          alertPoints={alertPoints}
          pieData={{ labels: pieLabels, values: pieCounts }}
          barData={{ labels: barLabels, values: barMode === 'score' ? barScores : barCounts }}
          barMode={barMode}
          setBarMode={setBarMode}
          topThreatUsers={topThreatUsers}
          groupBy={groupBy}
        />
      </section>

      <SiteFooter />
    </div>
  );
}

function StatCard({ label, value, tone }) {
  const toneClass =
    tone === 'info' ? 'imdash-kpi--info' : tone === 'warn' ? 'imdash-kpi--warn' : 'imdash-kpi--danger';
  return (
    <div className={`imdash-kpi-card ${toneClass}`}>
      <h3 className="imdash-kpi-label">{label}</h3>
      <p className="imdash-kpi-value">{value}</p>
    </div>
  );
}
