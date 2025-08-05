import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import DashboardCharts from './DashboardCharts';
import Navbar from "./Navbar";
import DateFilter from "./Date";

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

  const navigationToOtherPages = useNavigate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchLogsAndAlertsFromServer = async () => {
    setDashboardLoadingState(true);
    setErrorMessageOnDashboard('');
    try {
      const token = localStorage.getItem('custom_token');
      const [logsRes, alertsRes, chartRes] = await Promise.all([
        axios.get('http://localhost:8000/api/logs/all/', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('http://localhost:8000/api/alerts/', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('http://localhost:8000/api/dashboard-data/', {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            ...(startDate && { start_date: startDate }),
            ...(endDate && { end_date: endDate }),
          }
        }),
      ]);

      setArrayOfSystemUserLogs(logsRes.data.logs || []);
      setNumberOfOpenAlerts(alertsRes.data.length || 0);
      setTopThreatUsers(chartRes.data.topThreatUsers || []);
      setAlertPoints(chartRes.data.alertPoints || []);
      setPieLabels(chartRes.data.pieLabels || []);
      setPieCounts(chartRes.data.pieData || []);
      setBarLabels(chartRes.data.barLabels || []);
      setBarCounts(chartRes.data.barCounts || []);
      setBarScores(chartRes.data.barScores || []);
      setGroupBy(chartRes.data.groupBy || 'hour');

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

    const token = localStorage.getItem("custom_token");
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
          setArrayOfSystemUserLogs(prev => [newLog, ...prev]);
          setRealTimeThreatAlerts(prev => [data, ...prev]);
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    socket.onerror = err => console.warn('WebSocket error:', err);
    return () => socket.close();
  }, []);

  const totalLogs = arrayOfSystemUserLogs.length;
  const suspiciousLogs = arrayOfSystemUserLogs.filter(log => log.is_suspicious).length;

  return (
    <div className="min-h-screen bg-[#502414] text-white font-sans">
      <Navbar setAuth={setAuth} />


      {realTimeThreatAlerts.length > 0 && (
        <div className="bg-red-100 border-l-8 border-red-600 text-red-800 p-4 mb-6 rounded-xl shadow">
          <h2 className="text-lg font-bold mb-2">⚠️ Real-Time Threat Alert</h2>
          <ul className="list-disc pl-5 space-y-1">
            {realTimeThreatAlerts.slice(0, 3).map((alert, index) => (
              <li key={index}><strong>{alert.user}</strong> triggered anomaly with score <strong>{alert.score}</strong> – {alert.message}</li>
            ))}
          </ul>
        </div>
      )}


      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 m-4 mb-8">
        <StatCard label="📋 Total Logs" value={totalLogs} color="blue" />
        <StatCard label="🛑 Flagged Users" value={suspiciousLogs} color="yellow" />
        <StatCard label="🚨 Active Alerts" value={numberOfOpenAlerts} color="red" />
      </div>


      <div className="p-4 bg-[#4E2926]">
        <DateFilter
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          onRefresh={fetchLogsAndAlertsFromServer}
        />


        {/*<div className="flex flex-col p-3 md:flex-row items-center gap-4 ">*/}
        {/*  <div className="flex items-center gap-2">*/}
        {/*    <label htmlFor="start" className="font-semibold">From:</label>*/}
        {/*    <input*/}
        {/*      type="date"*/}
        {/*      id="start"*/}
        {/*      className="bg-[#4a2f2c] border border-[#3d2d28] rounded px-2 py-1 text-white"*/}
        {/*      value={startDate}*/}
        {/*      onChange={(e) => setStartDate(e.target.value)}*/}
        {/*    />*/}
        {/*  </div>*/}

        {/*  <div className="flex items-center gap-2">*/}
        {/*    <label htmlFor="end" className="font-semibold">To:</label>*/}
        {/*    <input*/}
        {/*      type="date"*/}
        {/*      id="end"*/}
        {/*      className="bg-[#2a1b17] border border-[#3d2d28] rounded px-2 py-1 text-white"*/}
        {/*      value={endDate}*/}
        {/*      onChange={(e) => setEndDate(e.target.value)}*/}
        {/*    />*/}
        {/*  </div>*/}

        {/*  <button*/}
        {/*    onClick={fetchLogsAndAlertsFromServer}*/}
        {/*    className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-full"*/}
        {/*  >*/}
        {/*    🔄 Refresh Dashboard*/}
        {/*  </button>*/}
        {/*</div>*/}

      <DashboardCharts
        alertPoints={alertPoints}
        pieData={{ labels: pieLabels, values: pieCounts }}
        barData={{ labels: barLabels, values: barMode === 'score' ? barScores : barCounts }}
        barMode={barMode}
        setBarMode={setBarMode}
        topThreatUsers={topThreatUsers}
        groupBy={groupBy}
      />
    </div>

      </div>


  );
}

function StatCard({ label, value, color }) {
  const colors = {
    blue: 'text-blue-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
  };
  return (
    <div className="bg-[#6e5751] p-4 rounded-lg shadow border border-[#3d2d28] text-center">
      <h3 className="text-white font-bold text-lg">{label}</h3>
      <p className={`text-3xl ${colors[color]}`}>{value}</p>
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
