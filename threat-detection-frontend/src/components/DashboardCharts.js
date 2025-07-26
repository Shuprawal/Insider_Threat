// DashboardCharts.js
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';

import { Line, Pie, Bar } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

export default function DashboardCharts({ labels, data, pieData, barData }) {
  const lineData = {
    labels: labels,
    datasets: [
      {
        label: 'Logs Over Time',
        data: data,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.2)',
        tension: 0.3,
      },
    ],
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-10">
      {/* Line Chart */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-lg font-semibold mb-2 text-gray-700">📈 Threat Activity Trend</h2>
        <Line data={lineData} />
      </div>

      {/* Pie Chart */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-lg font-semibold mb-2 text-gray-700">🧪 Threat Distribution</h2>
        <Pie data={pieData} />
      </div>

      {/* Bar Chart */}
      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="text-lg font-semibold mb-2 text-gray-700">🧍 Users with Most Flags</h2>
        <Bar data={barData} options={{ indexAxis: 'y' }} />
      </div>
    </div>
  );
}
