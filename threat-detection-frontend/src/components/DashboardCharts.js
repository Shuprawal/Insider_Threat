

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


function DashboardCharts({ labels, data, pieData, barData }) {
  const lineChartData = {
    labels,
    datasets: [
      {
        label: 'Logs Over Time',
        data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.3)',
        fill: true,
        tension: 0.4
      }
    ]
  };

  const lineOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: '📈 Hourly Average Threat Score for Today'
      }
    }
  };


  const pieOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'bottom' },
      title: { display: true, text: '🧪 Threat Distribution' }
    }
  };

  const barOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: true, text: '👥 Users with Most Flags' }
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Full-width line chart with dark background */}
      <div className="bg-gray-900 rounded-xl p-6 shadow-md w-full">
        <Line data={lineChartData} options={lineOptions} />
      </div>

      {/* Row of pie and bar charts below */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl p-6 shadow-md">
          <Pie data={pieData} options={pieOptions} />
        </div>
        <div className="bg-gray-900 rounded-xl p-6 shadow-md">
          <Bar data={barData} options={barOptions} />
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
