import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function CreateLogPage() {
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState([]);
  const [activityType, setActivityType] = useState('');
  const [resourceAccessed, setResourceAccessed] = useState('');
  const [actionResult, setActionResult] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch all users
    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem('custom_token');
        const res = await axios.get('http://localhost:8000/api/users/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUsers(res.data);
      } catch (err) {
        setError('Failed to load users');
      }
    };
    fetchUsers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    try {
      const token = localStorage.getItem('custom_token');
      await axios.post(
        'http://localhost:8000/api/logs/create/',
        {
          user: userId,
          activity_type: activityType,
          resource_accessed: resourceAccessed,
          action_result: actionResult,
          timestamp,
          details,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSuccess(true);
      setUserId('');
      setActivityType('');
      setResourceAccessed('');
      setActionResult('');
      setTimestamp('');
      setDetails('');
    } catch (err) {
      setError('Failed to create log. Please try again.');
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-200 p-6">
      <div className="bg-white max-w-2xl mx-auto p-8 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold mb-6 text-center text-blue-800">Create New Activity Log</h2>
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
        {success && <div className="bg-green-100 text-green-700 p-3 rounded mb-4">✅ Log created successfully!</div>}

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* User Dropdown */}
          <div>
            <label className="block font-medium text-gray-700">Select User</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              required
            >
              <option value="">-- Select a user --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>

          {/* Rest of form */}
          <div>
            <label className="block font-medium text-gray-700">Activity Type</label>
            <input
              type="text"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700">Resource Accessed</label>
            <input
              type="text"
              value={resourceAccessed}
              onChange={(e) => setResourceAccessed(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700">Action Result</label>
            <input
              type="text"
              value={actionResult}
              onChange={(e) => setActionResult(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700">Timestamp</label>
            <input
              type="datetime-local"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>

          <div>
            <label className="block font-medium text-gray-700">Additional Details</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              rows={4}
            ></textarea>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
          >
            Submit Log
          </button>
        </form>

        <div className="text-center mt-4">
          <button onClick={() => navigate('/')} className="text-blue-600 underline">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateLogPage;
