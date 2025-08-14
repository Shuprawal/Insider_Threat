// RealTimeInsiderThreatDashboardComponent.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import DashboardCharts from './DashboardCharts';
import DateFilter from './Date';
import '../App.css';
import SiteFooter from './SiteFooter';
import { getToken } from './authStorage';

function RealTimeInsiderThreatDashboardComponent() {
  const [arrayOfSystemUserLogs, setArrayOfSystemUserLogs] = useState([]);
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

  // Normalize API payloads to the shapes your charts expect
  const normalizeDashboard = useCallback((d = {}) => {
    const raw = d.alertPoints || d.hourly || d.hourly_points || [];
    const points = raw
      .map(r => ({
        timestamp: r.timestamp || r.hour || r.h || r.time,
        score: Number(r.score ?? r.avg_score ?? r.value ?? 0),
        user: r.user || r.username || 'Unknown',
        reason: r.reason || r.activity_type || ''
      }))
      .filter(p => p.timestamp != null);

    return {
      alertPoints: points,
      topThreatUsers: (d.topThreatUsers || d.top_users || []).map(u => ({
        id: u.id,
        username: u.username || 'Unknown',
        count: u.threats ?? u.count ?? 0,
      })),
      pieLabels: d.pieLabels || d.topActivities?.map(a => a.label) || [],
      pieCounts: d.pieData   || d.topActivities?.map(a => a.count) || [],
      barLabels: d.barLabels || [],
      barCounts: d.barCounts || [],
      barScores: d.barScores || [],
      groupBy:   d.groupBy || 'hour',
    };
  }, []);

  // Fetch REST data (charts & KPIs)
  const fetchLogsAndAlertsFromServer = useCallback(async () => {
    setDashboardLoadingState(true);
    setErrorMessageOnDashboard('');
    try {
      const token = getToken() || localStorage.getItem('custom_token');

      const [logsRes, alertsRes, chartRes] = await Promise.all([
        axios.get('http://localhost:8000/api/logs/all/',   { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('http://localhost:8000/api/alerts/',     { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('http://localhost:8000/api/dashboard-data/', {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            ...(startDate && { start_date: startDate }),
            ...(endDate   && { end_date:   endDate   }),
          },
        }),
      ]);

      const n = normalizeDashboard(chartRes.data || {});
      setArrayOfSystemUserLogs(logsRes.data.logs || []);
      // setNumberOfOpenAlerts(alertsRes.data.length || 0);
        const openAlerts = Array.isArray(alertsRes.data) ? alertsRes.data.length : (alertsRes.data?.count ?? 0);
        setNumberOfOpenAlerts(openAlerts);

      setTopThreatUsers(n.topThreatUsers);
      setAlertPoints(n.alertPoints);
      setPieLabels(n.pieLabels);
      setPieCounts(n.pieCounts);
      setBarLabels(n.barLabels);
      setBarCounts(n.barCounts);
      setBarScores(n.barScores);
      setGroupBy(n.groupBy);
    } catch (error) {
      console.error('dashboard fetch error:', error);
      setErrorMessageOnDashboard('🚨 Failed to retrieve data. Please refresh.');
    } finally {
      setDashboardLoadingState(false);
    }
  }, [startDate, endDate, normalizeDashboard]);

  // Set default date range (today) on first mount
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
  }, []);

  // Load charts when dates change
  useEffect(() => {
    if (!startDate || !endDate) return;
    fetchLogsAndAlertsFromServer();
  }, [startDate, endDate, fetchLogsAndAlertsFromServer]);

  const totalLogs = arrayOfSystemUserLogs.length;
  // const suspiciousLogs = arrayOfSystemUserLogs.filter((log) => log.is_suspicious).length;
    const suspiciousUsers = new Set(arrayOfSystemUserLogs.filter(l => l.is_suspicious).map(l => l.user_id ?? l.user ?? l.username)).size;


  return (
    <div className="imdash-page">
      {/* GlobalAlertBanner is mounted in MainLayout, not here */}

      <div className="imdash-kpi-grid">
        <StatCard label="📋 Total Logs" value={totalLogs} tone="info" />
        <StatCard label="🛑 Flagged Users" value={suspiciousUsers} tone="warn" />
        <StatCard label="🚨 Active Alerts" value={numberOfOpenAlerts} tone="danger" />
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
        {dashboardLoadingState && (
          <div className="im-banner">Loading…</div>
        )}

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

export default RealTimeInsiderThreatDashboardComponent;
