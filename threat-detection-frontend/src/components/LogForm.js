import React, { useState } from 'react';
import axios from 'axios';

function LogForm({ fetchLogs }) {
  const [user, setUser] = useState('');
  const [action, setAction] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('custom_token');

     await axios.post(
    'http://localhost:8000/api/logs/create/',

      { user, action },
      { headers: { Authorization: `Bearer ${token}` } }
    );

      setUser('');
      setAction('');
      setError('');
      fetchLogs(); // Refresh the log list
    } catch (err) {
      setError('Failed to submit log. Please try again.');
      console.error(err);
    }
  };

  return (
    <div className="bg-white p-4 rounded-md shadow mb-6">
      <h3 className="text-lg font-semibold mb-4">Log Insider Threat Activity</h3>
      {error && <p className="text-red-500 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">User</label>
          <input
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Action</label>
          <textarea
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="mt-1 block w-full p-2 border border-gray-300 rounded-md"
            rows="3"
            required
          />
        </div>
        <button
          type="submit"
          className="w-full bg-green-500 text-white p-2 rounded-md hover:bg-green-600"
        >
          Submit Log
        </button>
      </form>
    </div>
  );
}

export default LogForm;