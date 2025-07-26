import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import DashboardCharts from './DashboardCharts'


// import {
//   Line,
//   Pie,
//   Bar
// } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Title
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Title
);

function RealTimeInsiderThreatDashboardComponent({ setAuth }) {
  const [arrayOfSystemUserLogs, setArrayOfSystemUserLogs] = useState([]);
  const [numberOfOpenAlerts, setNumberOfOpenAlerts] = useState(0);
  const [realTimeThreatAlerts, setRealTimeThreatAlerts] = useState([]);
  const [errorMessageOnDashboard, setErrorMessageOnDashboard] = useState('');
  const [dashboardLoadingState, setDashboardLoadingState] = useState(false);
  const navigationToOtherPages = useNavigate();

  const fetchLogsAndAlertsFromServer = async () => {
    setDashboardLoadingState(true);
    setErrorMessageOnDashboard('');

    try {
      const authorizationTokenStored = localStorage.getItem('custom_token');

      const retrievedLogs = await axios.get('http://localhost:8000/api/logs/all/', {
        headers: { Authorization: `Bearer ${authorizationTokenStored}` },
      });

      const retrievedAlerts = await axios.get('http://localhost:8000/api/alerts/', {
        headers: { Authorization: `Bearer ${authorizationTokenStored}` },
      });

      setArrayOfSystemUserLogs(retrievedLogs.data.logs || []);
      setNumberOfOpenAlerts(retrievedAlerts.data.length || 0);
    } catch (errorEncountered) {
      setErrorMessageOnDashboard('🚨 Failed to retrieve logs or alerts. Please refresh.');
      console.error('⚠️ Data retrieval error:', errorEncountered.response?.data || errorEncountered.message);
    } finally {
      setDashboardLoadingState(false);
    }
  };

  useEffect(() => {
    fetchLogsAndAlertsFromServer();

    const token = localStorage.getItem("custom_token");
    const websocketConnectionForLiveThreats = new WebSocket(`ws://localhost:8000/ws/threats/?token=${token}`);

    websocketConnectionForLiveThreats.onmessage = (event) => {
      try {
        const parsedLiveMessage = JSON.parse(event.data);
        if (parsedLiveMessage?.data) {
          setRealTimeThreatAlerts(prev => [parsedLiveMessage.data, ...prev]);
        }
      } catch (e) {
        console.error('Invalid WebSocket message:', e);
      }
    };

    websocketConnectionForLiveThreats.onerror = (err) => {
      console.warn('WebSocket connection error:', err.message);
    };

    return () => {
      websocketConnectionForLiveThreats.close();
    };
  }, []);

  const numberOfDetectedAnomalies = arrayOfSystemUserLogs.filter(log => log.is_suspicious).length;

  // Chart Data Preparation
  const logsOverTimeLabels = arrayOfSystemUserLogs.slice(0, 7).map(log => new Date(log.timestamp).toLocaleDateString());
  const logsOverTimeData = arrayOfSystemUserLogs.slice(0, 7).map((_, i) => i + 1);
  <DashboardCharts />

  const pieData = {
    labels: ['Suspicious Logs', 'Normal Logs'],
    datasets: [{
      data: [
        arrayOfSystemUserLogs.filter(log => log.is_suspicious).length,
        arrayOfSystemUserLogs.filter(log => !log.is_suspicious).length
      ],
      backgroundColor: ['#f87171', '#34d399']
    }]
  };

  const topSuspiciousUsers = Object.entries(
    arrayOfSystemUserLogs.filter(log => log.is_suspicious).reduce((acc, log) => {
      const name = log.user?.username || 'Unknown';
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const barData = {
    labels: topSuspiciousUsers.map(([user]) => user),
    datasets: [{
      label: 'Suspicious Logs',
      data: topSuspiciousUsers.map(([_, count]) => count),
      backgroundColor: '#facc15'
    }]
  };

  return (
    <div className="min-h-screen bg-gradient-to-tr from-gray-50 via-indigo-100 to-blue-200 p-6 font-sans">
      {/* Top Navigation */}
      <div className="bg-indigo-900 text-white p-4 rounded-lg shadow-lg flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold tracking-wide">🧠 Insider Threat Monitor</h1>
        <div className="flex gap-3">
          <button onClick={() => navigationToOtherPages('/log')} className="bg-green-600 px-3 py-1 rounded text-sm hover:bg-green-700">+ Submit Log</button>
          <button onClick={() => navigationToOtherPages('/alerts')} className="bg-yellow-500 px-3 py-1 rounded text-sm hover:bg-yellow-600">Alerts</button>
          <button onClick={() => navigationToOtherPages('/analyze')} className="bg-blue-500 px-3 py-1 rounded text-sm hover:bg-blue-600">Analyze</button>
          <button onClick={() => { localStorage.removeItem('custom_token'); setAuth(false); navigationToOtherPages('/login'); }} className="bg-red-600 px-4 py-2 rounded hover:bg-red-700">Logout</button>
        </div>
      </div>

      {/* Real-Time Alerts Display */}
      {realTimeThreatAlerts.length > 0 && (
        <div className="bg-red-50 border-l-8 border-red-500 p-4 mb-6 rounded-xl shadow animate-pulse">
          <h2 className="text-lg font-semibold text-red-800 mb-2">⚠️ Real-Time Threat Alert</h2>
          <ul className="text-gray-700 list-disc pl-5 space-y-1">
            {realTimeThreatAlerts.slice(0, 3).map((alert, index) => (
              <li key={index}><strong>{alert.user}</strong> triggered anomaly with risk score <strong>{alert.score}</strong> – {alert.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="📋 Total Logs" value={arrayOfSystemUserLogs.length} color="blue" />
        <StatCard label="🛑 Flagged Users" value={numberOfDetectedAnomalies} color="yellow" />
        <StatCard label="🚨 Active Alerts" value={numberOfOpenAlerts} color="red" />
      </div>

      {/* Graphs Section */}
      <DashboardCharts
        labels={logsOverTimeLabels}
        data={logsOverTimeData}
        pieData={pieData}
        barData={barData}
      />

      {/*<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">*/}
      {/*  <div className="bg-white rounded-xl p-4 shadow-md border">*/}
      {/*    <h3 className="font-semibold text-center mb-2">📈 Logs Over Time</h3>*/}
      {/*    <Line data={{ labels: logsOverTimeLabels, datasets: [{ label: 'Logs', data: logsOverTimeData, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.3)', tension: 0.3 }] }} options={{ responsive: true }} />*/}
      {/*  </div>*/}
      {/*  <div className="bg-white rounded-xl p-4 shadow-md border">*/}
      {/*    <h3 className="font-semibold text-center mb-2">🥧 Threat Breakdown</h3>*/}
      {/*    <Pie data={pieData} options={{ responsive: true }} />*/}
      {/*  </div>*/}
      {/*  <div className="bg-white rounded-xl p-4 shadow-md border">*/}
      {/*    <h3 className="font-semibold text-center mb-2">📊 Top Flagged Users</h3>*/}
      {/*    <Bar data={barData} options={{ responsive: true, indexAxis: 'y' }} />*/}
      {/*  </div>*/}
      {/*</div>*/}

      {/* Main Log Display */}
      <div className="bg-white p-6 rounded-xl shadow-2xl border border-blue-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-800">🧾 Most Recent Logs</h2>
          <button onClick={fetchLogsAndAlertsFromServer} disabled={dashboardLoadingState} className={`px-5 py-2 rounded-md text-white font-semibold shadow ${dashboardLoadingState ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>{dashboardLoadingState ? 'Refreshing...' : '🔄 Refresh'}</button>
        </div>

        {errorMessageOnDashboard && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{errorMessageOnDashboard}</div>}

        {arrayOfSystemUserLogs.length === 0 && !dashboardLoadingState ? (
          <p className="text-center text-gray-500">No logs have been uploaded yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {arrayOfSystemUserLogs.slice(0, 6).map((logEntry, idx) => (
              <div key={idx} className="bg-gradient-to-br from-white to-gray-50 p-5 rounded-xl border shadow">
                <div className="text-gray-700 font-medium">👤 <strong>User:</strong> {logEntry.user?.username || 'Unknown'}</div>
                <div className="text-gray-700">📌 <strong>Action:</strong> {logEntry.activity_type}</div>
                <div className="text-gray-600 text-sm">🕓 <strong>Time:</strong> {new Date(logEntry.timestamp).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colorClasses = {
    blue: 'text-blue-700',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow border text-center">
      <h3 className="text-gray-700 font-bold text-lg">{label}</h3>
      <p className={`text-3xl ${colorClasses[color]}`}>{value}</p>
    </div>
  );
}

export default RealTimeInsiderThreatDashboardComponent;







// import React, { useState, useEffect } from 'react';
// import axios from 'axios';
// import { useNavigate } from 'react-router-dom';
//
// function Dashboard({ setAuth }) {
//   const [logs, setLogs] = useState([]);
//   const [totalAlerts, setTotalAlerts] = useState(0);
//   const [error, setError] = useState('');
//   const [loading, setLoading] = useState(false);
//   const navigate = useNavigate();
//
//   const fetchLogs = async () => {
//     setLoading(true);
//     setError('');
//     try {
//       const token = localStorage.getItem('custom_token');
//
//       const response = await axios.get('http://localhost:8000/api/logs/all/', {
//         headers: { Authorization: `Bearer ${token}` },
//       });
//       setLogs(response.data);
//
//       const alertsResponse = await axios.get('http://localhost:8000/api/alerts/', {
//         headers: { Authorization: `Bearer ${token}` },
//       });
//       setTotalAlerts(alertsResponse.data.length || 0);
//
//     } catch (err) {
//       setError('Failed to fetch logs or alerts. Please try again.');
//       console.error('Dashboard fetch error:', err.response ? err.response.data : err.message);
//     } finally {
//       setLoading(false);
//     }
//   };
//
//   useEffect(() => {
//     fetchLogs();
//   }, []);
//
//   const handleLogout = () => {
//     localStorage.removeItem('custom_token');
//     setAuth(false);
//     navigate('/login');
//   };
//
//   const suspiciousCount = logs.filter(log => log.is_suspicious).length;
//
//   return (
//     <div className="min-h-screen bg-gradient-to-tr from-gray-50 via-blue-100 to-blue-200 p-6">
//       {/* Navigation Bar */}
//       <div className="bg-blue-900 text-white py-4 px-6 rounded-lg shadow-lg flex justify-between items-center mb-10">
//         <h1 className="text-2xl sm:text-3xl font-bold tracking-wide">Insider Threat Detection</h1>
//         <div className="flex gap-4">
//           <button
//             onClick={() => navigate('/log')}
//             className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded-md text-sm shadow"
//           >
//             + Create Log
//           </button>
//           <button
//             onClick={() => navigate('/alerts')}
//             className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-md text-sm shadow"
//           >
//             View Alerts
//           </button>
//           <button
//             onClick={() => navigate('/analyze')}
//             className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-md text-sm shadow"
//           >
//             Analyze Logs
//           </button>
//           <button
//             onClick={handleLogout}
//             className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow-md transition-all"
//           >
//             Logout
//           </button>
//         </div>
//       </div>
//
//       {/* Quick Stats */}
//       <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
//         <div className="bg-white p-4 rounded-lg shadow border text-center">
//           <h3 className="text-gray-700 font-bold text-xl">Total Logs</h3>
//           <p className="text-3xl text-blue-700">{logs.length}</p>
//         </div>
//         <div className="bg-white p-4 rounded-lg shadow border text-center">
//           <h3 className="text-gray-700 font-bold text-xl">Flagged Anomalies</h3>
//           <p className="text-3xl text-yellow-600">{suspiciousCount}</p>
//         </div>
//         <div className="bg-white p-4 rounded-lg shadow border text-center">
//           <h3 className="text-gray-700 font-bold text-xl">Total Alerts</h3>
//           <p className="text-3xl text-red-600">{totalAlerts}</p>
//         </div>
//       </div>
//
//       {/* Recent Logs Section */}
//       <div className="bg-white p-6 rounded-xl shadow-2xl border border-blue-200">
//         <div className="flex justify-between items-center mb-6">
//           <h2 className="text-2xl font-semibold text-gray-800">📜 Recent Activity Logs</h2>
//           <button
//             onClick={fetchLogs}
//             disabled={loading}
//             className={`px-5 py-2 rounded-lg font-semibold shadow-md text-white transition-all ${
//               loading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
//             }`}
//           >
//             {loading ? 'Loading...' : '🔄 Refresh Logs'}
//           </button>
//         </div>
//
//         {error && (
//           <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded">
//             <p>{error}</p>
//           </div>
//         )}
//
//         {loading && !error && (
//           <div className="text-center text-gray-600 mb-6">
//             <svg
//               className="animate-spin h-8 w-8 mx-auto text-blue-600"
//               xmlns="http://www.w3.org/2000/svg"
//               fill="none"
//               viewBox="0 0 24 24"
//             >
//               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
//               <path
//                 className="opacity-75"
//                 fill="currentColor"
//                 d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
//               />
//             </svg>
//             <p className="mt-2">Fetching recent logs...</p>
//           </div>
//         )}
//
//         {!loading && !error && logs.length === 0 ? (
//           <p className="text-center text-gray-500 text-lg">No logs yet. Submit a new one to get started.</p>
//         ) : (
//           <div>
//             <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
//               {logs.slice(0, 5).map((log) => (
//                 <div
//                   key={log.id}
//                   className="bg-gradient-to-br from-blue-100 via-white to-gray-100 p-5 rounded-xl shadow-lg hover:shadow-2xl transition-all border border-blue-200"
//                 >
//                   <div className="mb-2 text-gray-700 font-medium">
//                     👤 <span className="font-bold">User:</span> {log.user?.username || 'Unknown'}
//                   </div>
//                   <div className="mb-2 text-gray-700">
//                     ⚠️ <span className="font-bold">Action:</span> {log.activity_type}
//                   </div>
//                   <div className="text-gray-600 text-sm">
//                     🕒 <span className="font-semibold">Timestamp:</span>{' '}
//                     {new Date(log.timestamp).toLocaleString('en-US', {
//                       weekday: 'short',
//                       year: 'numeric',
//                       month: 'short',
//                       day: 'numeric',
//                       hour: '2-digit',
//                       minute: '2-digit',
//                       second: '2-digit',
//                     })}
//                   </div>
//                 </div>
//               ))}
//             </div>
//             <div className="text-center mt-6">
//               <button
//                 onClick={() => navigate('/logs')}
//                 className="text-blue-600 underline font-medium"
//               >
//                 View All Logs →
//               </button>
//             </div>
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
//
// export default Dashboard;
