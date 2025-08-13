import React, { useEffect, useState } from 'react';
import axios from 'axios';

import {getToken} from "./authStorage";

function AlertsPage({ setAuth }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      // const token = localStorage.getItem('custom_token');
         const token = getToken()
      const response = await axios.get('http://localhost:8000/api/alerts/', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts(response.data);
    } catch (err) {
      setError('Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-tr from-gray-50 via-blue-100 to-blue-200 ">
      {/*<Navbar setAuth={setAuth} />*/}

      <div className="bg-white p-6 rounded-xl shadow-2xl border border-red-300">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-red-800">🚨 Suspicious Alerts</h2>
          <button
            onClick={fetchAlerts}
            className="px-5 py-2 rounded-lg font-semibold shadow-md text-white bg-red-600 hover:bg-red-700 transition-all"
          >
            Refresh Alerts
          </button>
        </div>

        {loading && <p>Loading alerts...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && alerts.length === 0 ? (
          <p className="text-gray-600">No suspicious activity detected.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="bg-gradient-to-br from-red-100 via-white to-gray-100 p-5 rounded-xl shadow-lg border border-red-400"
              >
                <div className="mb-2 text-red-800 font-semibold">⚠️ Score: {alert.score}</div>
                <div className="mb-2 text-gray-800">
                  🧑 User ID: {alert.user || alert.assigned_to || 'Unknown'}
                </div>
                <div className="text-gray-600 text-sm">
                  🕒 Time: {new Date(alert.created_at).toLocaleString()}
                </div>
                <div className="text-sm mt-2">🗒️ {alert.notes || 'No notes provided.'}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AlertsPage;
