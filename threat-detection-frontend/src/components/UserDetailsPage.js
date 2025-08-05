import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaUserCircle } from 'react-icons/fa';
import { FiEdit2 } from 'react-icons/fi';
import Navbar from "./Navbar";
import DashboardCharts from "./DashboardCharts";
import DateFilter from "./Date";

function UserDetailsPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [alertPoints, setAlertPoints] = useState([]);
  const [pieLabels, setPieLabels] = useState([]);
  const [pieCounts, setPieCounts] = useState([]);
  const [barLabels, setBarLabels] = useState([]);
  const [barScores, setBarScores] = useState([]);
  const [barCounts, setBarCounts] = useState([]);
  const [barMode, setBarMode] = useState('score');
  const [groupBy, setGroupBy] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchUser = async () => {
    try {
      const token = localStorage.getItem('custom_token');
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const res = await axios.get(`http://localhost:8000/api/users/${userId}/detail/`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      setUser(res.data.user);
      setAlertPoints(res.data.alertPoints || []);
      setPieLabels(res.data.pieLabels || []);
      setPieCounts(res.data.pieData || []);
      setBarLabels(res.data.barLabels || []);
      setBarScores(res.data.barScores || []);
      setBarCounts(res.data.barCounts || []);
      setGroupBy(res.data.groupBy || 'hour');
    } catch (error) {
      console.error('Error fetching user details:', error);
    }
  };

  useEffect(() => {
    fetchUser();
  }, [userId]);

  const handleDelete = async () => {
    const confirmDelete = window.confirm(`Are you sure you want to delete user: ${user.username}?`);
    if (!confirmDelete) return;

    try {
      const token = localStorage.getItem('custom_token');
      await axios.delete(`http://localhost:8000/api/users/${userId}/delete/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert("User deleted successfully.");
      navigate("/users");
    } catch (err) {
      alert("Failed to delete user.");
    }
  };

  const handleSuspendChange = async (e) => {
    const newValue = e.target.value === 'Yes';
    try {
      const token = localStorage.getItem('custom_token');
      await axios.put(`http://localhost:8000/api/users/${userId}/suspend/`, {
        is_suspended: newValue
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(prev => ({ ...prev, is_suspended: newValue }));
    } catch (err) {
      alert("Failed to update suspended status.");
    }
  };

  if (!user) {
    return <div className="text-white text-center mt-10">Loading...</div>;
  }

  return (
    <div className="bg-[#502414] min-h-screen">
      <Navbar />
      <div className="p-8">
        {/* Profile Card */}
        <div className="bg-white rounded-lg p-6 shadow-md mb-6">
          <h2 className="text-xl font-semibold text-green-900 mb-4">User Profile</h2>
          <div className="flex items-center gap-4">
            <FaUserCircle size={70} className="text-gray-600" />
            <div>
              <h3 className="text-lg font-semibold">{user.username}</h3>
              <p className="text-sm text-gray-600">{user.role || 'User'}</p>
              <p className="text-sm text-gray-600">{user.email}</p>
              <p className="text-sm text-gray-600">{user.department || 'Unknown'}</p>
            </div>
          </div>
        </div>

        {/* Personal Info */}
        <div className="bg-white rounded-lg p-6 shadow-md mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-green-900">Personal Information</h3>
            <button className="text-orange-500 hover:text-orange-600 flex items-center text-sm font-medium">
              Edit <FiEdit2 className="ml-1" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-700">
            <div><strong>Username:</strong><br />{user.username}</div>
            <div><strong>Department:</strong><br />{user.department || '-'}</div>
            <div><strong>Role:</strong><br />{user.role || '-'}</div>
            <div><strong>Account Created:</strong><br />{user.created_at || '-'}</div>
            <div><strong>Failed Login At:</strong><br />{user.failed_login_timestamp || '-'}</div>

            {/* ✅ Suspended Toggle */}
            <div className="col-span-1">
              <strong>Suspended:</strong><br />
              <select
                value={user.is_suspended ? 'Yes' : 'No'}
                onChange={handleSuspendChange}
                className="border px-2 py-1 rounded bg-white"
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>
          </div>

          {/* ✅ Delete Button */}
          <div className="mt-6 text-right">
            <button
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded"
            >
              🗑️ Delete User
            </button>
          </div>
        </div>

        {/* Charts Section */}
        <div className="bg-white rounded-lg p-6 shadow-md">
          <DateFilter
            startDate={startDate}
            setStartDate={setStartDate}
            endDate={endDate}
            setEndDate={setEndDate}
            onRefresh={fetchUser}
          />

          <DashboardCharts
            alertPoints={alertPoints}
            pieData={{ labels: pieLabels, values: pieCounts }}
            barData={{
              labels: barLabels,
              values: barMode === 'score' ? barScores : barCounts,
            }}
            barMode={barMode}
            setBarMode={setBarMode}
            topThreatUsers={[]}
            groupBy={groupBy}
          />
        </div>
      </div>
    </div>
  );
}

export default UserDetailsPage;
