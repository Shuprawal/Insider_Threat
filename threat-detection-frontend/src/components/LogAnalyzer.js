import React, { useState } from 'react';

const LogAnalyzer = () => {
  const [file, setFile] = useState(null);
  const [anomalies, setAnomalies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const handleFileChange = (e) => {
    setError('');
    setInfo('');
    setAnomalies([]);
    setFile(e.target.files[0]);
  };
  const handleAnalyze = async () => {
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setLoading(true);
    setError('');
    setInfo('');

    try {
      const response = await fetch('http://localhost:8000/api/analyze-logs/', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();

      if (response.ok) {
        if (data.anomalies.length === 0) {
          setInfo("No suspicious activity detected.");
        } else {
          setAnomalies(data.anomalies);
        }
      } else {
        setError(data.error || 'Something went wrong during analysis.');
      }
    } catch (error) {
      setError('Request failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 sm:px-10">
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-xl p-8">
        <h2 className="text-2xl font-semibold text-center text-blue-700 mb-6">
          🧠 Analyze Activity Logs with AI
        </h2>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
          <input
            type="file"
            onChange={handleFileChange}
            className="block w-full sm:w-auto border rounded px-4 py-2 shadow-sm"
          />
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className={`bg-blue-600 text-white px-6 py-2 rounded shadow font-semibold hover:bg-blue-700 transition ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {loading ? 'Analyzing...' : 'Upload & Analyze'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 text-red-800 border border-red-300 p-4 rounded mb-4">
            ❌ {error}
          </div>
        )}

        {info && (
          <div className="bg-yellow-100 text-yellow-800 border border-yellow-300 p-4 rounded mb-4">
            ℹ️ {info}
          </div>
        )}

        {anomalies.length > 0 && (
          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-4 text-center">🚨 Detected Anomalies</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border">
                <thead>
                  <tr className="bg-blue-100 text-blue-800">
                    <th className="px-4 py-2 border">User</th>
                    <th className="px-4 py-2 border">Activity</th>
                    <th className="px-4 py-2 border">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalies.map((row, idx) => (
                    <tr
                      key={idx}
                      className="text-center hover:bg-red-50 transition"
                    >
                      <td className="border px-4 py-2 font-medium text-gray-800">{row.user}</td>
                      <td className="border px-4 py-2 text-red-600 font-semibold">{row.activity}</td>
                      <td className="border px-4 py-2 text-sm text-gray-600">{row.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LogAnalyzer;
