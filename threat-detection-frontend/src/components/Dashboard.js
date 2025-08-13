import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import DashboardCharts from './DashboardCharts';

import DateFilter from './Date';
import '../App.css'; //
import SiteFooter from './SiteFooter';
import { getToken } from "./authStorage";


function RealTimeInsiderThreatDashboardComponent({ setAuth }) {
  const [arrayOfSystemUserLogs, setArrayOfSystemUserLogs] = useState([]);
  const [numberOfOpenAlerts, setNumberOfOpenAlerts] = useState(0);
  const [realTimeThreatAlerts, setRealTimeThreatAlerts] = useState([]);
  const [errorMessageOnDashboard, setErrorMessageOnDashboard] = useState('');
  const [dashboardLoadingState, setDashboardLoadingState] = useState(false);
  const [barScores, setBarScores] = useState([]);
  const [topThreatUsers, setTopThreatUsers] = useState([]);
  const [groupBy, setGroupBy] = useState('hour');
  const [alertPoints, setAlertPoints] = useState([]);

  const [pieLabels, setPieLabels] = useState([]);
  const [pieCounts, setPieCounts] = useState([]);
  const [barLabels, setBarLabels] = useState([]);
  const [barCounts, setBarCounts] = useState([]);
  const [barMode, setBarMode] = useState('score');

  const navigate = useNavigate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

 // RealTimeInsiderThreatDashboardComponent.jsx
const normalizeDashboard = (d = {}) => {
  const raw = d.alertPoints || d.hourly || d.hourly_points || [];
  const alertPoints = raw.map(r => ({
    timestamp: r.timestamp || r.hour || r.h || r.time,          // unify label
    score:     Number(r.score ?? r.avg_score ?? r.value ?? 0),  // unify value
    user:      r.user || r.username || '',
    reason:    r.reason || r.activity_type || ''
  })).filter(p => p.timestamp != null);

  return {
    alertPoints,
    topThreatUsers: (d.topThreatUsers || d.top_users || []).map(u => ({
      id: u.id, username: u.username, count: u.threats ?? u.count ?? 0
    })),
    pieLabels: d.pieLabels || d.topActivities?.map(a => a.label) || [],
    pieCounts: d.pieData   || d.topActivities?.map(a => a.count) || [],
    barLabels: d.barLabels || [],
    barCounts: d.barCounts || [],
    barScores: d.barScores || [],
    groupBy:   d.groupBy || 'hour',
  };
};

const fetchLogsAndAlertsFromServer = async () => {
  setDashboardLoadingState(true);
  setErrorMessageOnDashboard('');
  try {
    const token = localStorage.getItem('custom_token');
    const [logsRes, alertsRes, chartRes] = await Promise.all([
      axios.get('http://localhost:8000/api/logs/all/',   { headers: { Authorization: `Bearer ${token}` } }),
      axios.get('http://localhost:8000/api/alerts/',     { headers: { Authorization: `Bearer ${token}` } }),
      axios.get('http://localhost:8000/api/dashboard-data/', {
        headers: { Authorization: `Bearer ${token}` },
        params: { ...(startDate && { start_date: startDate }), ...(endDate && { end_date: endDate }) },
      }),
    ]);

    const n = normalizeDashboard(chartRes.data || {});
    setArrayOfSystemUserLogs(logsRes.data.logs || []);
    setNumberOfOpenAlerts(alertsRes.data.length || 0);

    // use normalized values:
    setTopThreatUsers(n.topThreatUsers);
    setAlertPoints(n.alertPoints);
    setPieLabels(n.pieLabels);
    setPieCounts(n.pieCounts);
    setBarLabels(n.barLabels);
    setBarCounts(n.barCounts);
    setBarScores(n.barScores);
    setGroupBy(n.groupBy);
  } catch (error) {
    setErrorMessageOnDashboard('🚨 Failed to retrieve data. Please refresh.');
    console.error('Error:', error);
  } finally {
    setDashboardLoadingState(false);
  }
};


  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setStartDate(today);
    setEndDate(today);
    fetchLogsAndAlertsFromServer();


    // const token = localStorage.getItem('custom_token');
      const token = getToken();
    const socket = new WebSocket(`ws://localhost:8000/ws/threats/?token=${token}`);

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data?.user) {
          const newLog = {
            user: { username: data.user },
            activity_type: '⚠️ Suspicious Activity',
            timestamp: new Date().toISOString(),
            is_suspicious: true,
          };
          setArrayOfSystemUserLogs((prev) => [newLog, ...prev]);
          setRealTimeThreatAlerts((prev) => [data, ...prev]);
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    socket.onerror = (err) => console.warn('WebSocket error:', err);
    return () => socket.close();
  }, []);

  const totalLogs = arrayOfSystemUserLogs.length;
  const suspiciousLogs = arrayOfSystemUserLogs.filter((log) => log.is_suspicious).length;

  return (
    <div className="imdash-page">


      {realTimeThreatAlerts.length > 0 && (
        <div className="imdash-realtime-banner">
          <h2 className="imdash-realtime-title">⚠️ Real-Time Threat Alert</h2>
          <ul className="imdash-realtime-list">
            {realTimeThreatAlerts.slice(0, 3).map((alert, idx) => (
              <li key={idx}>
                <strong>{alert.user}</strong> triggered anomaly with score <strong>{alert.score}</strong> — {alert.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="imdash-kpi-grid">
        <StatCard label="📋 Total Logs" value={totalLogs} tone="info" />
        <StatCard label="🛑 Flagged Users" value={suspiciousLogs} tone="warn" />
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


