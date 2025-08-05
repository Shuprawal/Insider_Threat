import React from 'react';
import { Line, Pie, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function DashboardCharts({ alertPoints, pieData, barData, barMode, setBarMode, topThreatUsers }) {
  const lineChartData = {
    labels: alertPoints.map(point => point.timestamp),
    datasets: [
      {
        label: 'Threat Score',
        data: alertPoints.map(point => point.score),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.3)',
        fill: true,
        tension: 0.4,
        pointRadius: 5,
        pointHoverRadius: 7
      }
    ]
  };

  const lineOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: '📈 Hourly Average Threat Score'
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const index = context.dataIndex;
            const point = alertPoints[index];
            if (point) {
              return [`👤 ${point.user}`, `📌 ${point.reason}`, `Score: ${point.score}`];
            }
            return `Score: ${context.raw}`;
          }
        }
      }
    }
  };

  const pieChartData = {
    labels: pieData.labels,
    datasets: [
      {
        data: pieData.values,
        backgroundColor: ['#f87171', '#facc15', '#4ade80', '#60a5fa', '#a78bfa'],
        hoverOffset: 6
      }
    ]
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      title: { display: true, text: '🧪 Top Suspicious Activities' }
    }
  };

  const barChartData = {
    labels: barData.labels,
    datasets: [
      {
        label: barMode === 'score' ? 'Avg. Threat Score' : 'Suspicious Activity Count',
        data: barData.values,
        backgroundColor: '#facc15',
        barThickness: 60
      }
    ]
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text:
          barMode === 'score'
            ? '👥 Users with Highest Threat Scores'
            : '👥 Users with Most Suspicious Activities'
      }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Line Chart + Top Users List */}
      <div className="w-full md:flex md:gap-6">
        {/* Left Box - Line Chart */}
        <div className="bg-gray-900 rounded-xl p-6 shadow-md md:w-3/4 w-full">
          <Line data={lineChartData} options={lineOptions} />
        </div>

        {/* Right Box - Top Threat Users */}
        <div className="bg-gray-900 rounded-xl p-6 shadow-md md:w-1/4 w-full mt-6 md:mt-0 text-white">
          <h3 className="text-lg font-semibold mb-2">🧍 Top Threat Users</h3>
          <ul className="space-y-1 text-sm">
            {topThreatUsers && topThreatUsers.map((user, idx) => (
              <li key={idx} className="border-b border-gray-700 pb-1">
                <strong>{user.username}</strong>: {user.count} threats
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Pie and Bar Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie Chart with fixed height */}
        <div className="bg-gray-900 rounded-xl p-6 shadow-md h-[500px]">
          <Pie data={pieChartData} options={pieOptions} />
        </div>

        {/* Bar Chart with fixed height */}
        <div className="bg-gray-900 rounded-xl p-6 shadow-md h-[500px] flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-white text-lg font-semibold">
              {barMode === 'score' ? '👥 Top Users by Threat Score' : '👥 Top Users by Suspicious Activity Count'}
            </h2>
            <button
              onClick={() => setBarMode(prev => (prev === 'score' ? 'count' : 'score'))}
              className="bg-gray-700 text-white px-3 py-1 text-sm rounded hover:bg-gray-600"
            >
              Toggle to {barMode === 'score' ? 'Count' : 'Score'}
            </button>
          </div>
          <div className="flex-1">
            <Bar data={barChartData} options={barOptions} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardCharts;



//
// import React from 'react';
// import { Line, Pie, Bar } from 'react-chartjs-2';
// import {
//   Chart as ChartJS,
//   CategoryScale,
//   LinearScale,
//   PointElement,
//   LineElement,
//   ArcElement,
//   BarElement,
//   Title,
//   Tooltip,
//   Legend
// } from 'chart.js';
//
// ChartJS.register(
//   CategoryScale,
//   LinearScale,
//   PointElement,
//   LineElement,
//   ArcElement,
//   BarElement,
//   Title,
//   Tooltip,
//   Legend
// );
//
// function DashboardCharts({ labels, data, pieData, barData }) {
//   const lineData = {
//     labels: labels,
//     datasets: [
//       {
//         label: '📈 Threat Confidence (Hourly)',
//         data: data,
//         fill: false,
//         backgroundColor: '#f87171',
//         borderColor: '#dc2626',
//         tension: 0.4,
//       }
//     ]
//   };
//
//   const lineOptions = {
//     responsive: true,
//     plugins: {
//       title: {
//         display: true,
//         text: 'Hourly Threat Confidence Scores (Today)',
//         font: {
//           size: 18,
//         },
//       },
//       tooltip: {
//         callbacks: {
//           label: function (context) {
//             return `⚠️ ${Math.round(context.raw * 100)}% confidence`;
//           }
//         }
//       }
//     },
//     scales: {
//       y: {
//         beginAtZero: true,
//         max: 1,
//         ticks: {
//           callback: function (value) {
//             return `${Math.round(value * 100)}%`;
//           }
//         }
//       }
//     }
//   };
//
//   return (
//     <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
//       <div className="bg-white p-4 rounded-xl shadow-md border">
//         <h3 className="text-center font-bold text-gray-700 mb-2">🕐 Threat Confidence (Hourly)</h3>
//         <Line data={lineData} options={lineOptions} />
//       </div>
//
//       <div className="bg-white p-4 rounded-xl shadow-md border">
//         <h3 className="text-center font-bold text-gray-700 mb-2">📊 Log Breakdown</h3>
//         <Pie data={pieData} />
//       </div>
//
//       <div className="bg-white p-4 rounded-xl shadow-md border">
//         <h3 className="text-center font-bold text-gray-700 mb-2">🔝 Top Suspicious Users</h3>
//         <Bar data={barData} options={{ responsive: true }} />
//       </div>
//     </div>
//   );
// }
//
// export default DashboardCharts;
