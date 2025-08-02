import React, { useState } from 'react';
import axios from 'axios';

function LogForm({ fetchLogs }) {
  const [user, setUser] = useState('');
  const [activity, setActivity] = useState('');
  const [activityDate, setActivityDate] = useState('');
  const [activityTime, setActivityTime] = useState('');
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');

  const users = ['alice', 'bob', 'charlie', 'david', 'eva'];
  const activities = ['email_sent', 'usb_inserted', 'logon', 'file_accessed'];

  const handleChange = (field) => (e) => {
    setFormData({ ...formData, [field]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const token = localStorage.getItem('custom_token');

      // Combine date and time into a single ISO datetime string
      const timestamp = `${activityDate}T${activityTime}:00`;

      await axios.post(
        'http://localhost:8000/api/logs/create/',
        {
          user,
          activity,
          timestamp,
          ...formData
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Reset form
      setUser('');
      setActivity('');
      setActivityDate('');
      setActivityTime('');
      setFormData({});
      setError('');
      fetchLogs();
    } catch (err) {
      setError('❌ Failed to submit log. Please try again.');
      console.error(err);
    }
  };

  const renderDynamicFields = () => {
    switch (activity) {
      case 'email_sent':
        return (
          <>
            <label>📧 Number of Emails Sent:</label>
            <input
              type="number"
              value={formData.num_emails || ''}
              onChange={handleChange('num_emails')}
              className="block w-full p-2 border border-gray-300 rounded-md"
            />
          </>
        );
      case 'usb_inserted':
        return (
          <>
            <label>🔌 Number of USB Insertions:</label>
            <input
              type="number"
              value={formData.usb_count || ''}
              onChange={handleChange('usb_count')}
              className="block w-full p-2 border border-gray-300 rounded-md"
            />
          </>
        );
      case 'logon':
        return (
          <>
            <label>🔐 Logon Type (e.g., successful/failed):</label>
            <input
              type="text"
              value={formData.logon_type || ''}
              onChange={handleChange('logon_type')}
              className="block w-full p-2 border border-gray-300 rounded-md"
            />
          </>
        );
      case 'file_accessed':
        return (
          <>
            <label>📁 Number of Files Accessed:</label>
            <input
              type="number"
              value={formData.num_files || ''}
              onChange={handleChange('num_files')}
              className="block w-full p-2 border border-gray-300 rounded-md"
            />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white p-4 rounded-md shadow mb-6">
      <h3 className="text-lg font-semibold mb-4">🛡️ Log Insider Threat Activity</h3>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* User */}
        <div>
          <label className="block text-sm font-medium text-gray-700">👤 Select User</label>
          <select
            value={user}
            onChange={(e) => setUser(e.target.value)}
            className="block w-full p-2 border border-gray-300 rounded-md"
            required
          >
            <option value="">Choose user</option>
            {users.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        {/* Activity */}
        <div>
          <label className="block text-sm font-medium text-gray-700">⚙️ Activity</label>
          <select
            value={activity}
            onChange={(e) => {
              setActivity(e.target.value);
              setFormData({});
            }}
            className="block w-full p-2 border border-gray-300 rounded-md"
            required
          >
            <option value="">Select activity</option>
            {activities.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {/* Date & Time */}
        <div>
          <label className="block text-sm font-medium text-gray-700">📅 Date</label>
          <input
            type="date"
            value={activityDate}
            onChange={(e) => setActivityDate(e.target.value)}
            className="block w-full p-2 border border-gray-300 rounded-md"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">⏰ Time</label>
          <input
            type="time"
            value={activityTime}
            onChange={(e) => setActivityTime(e.target.value)}
            className="block w-full p-2 border border-gray-300 rounded-md"
            required
          />
        </div>

        {/* Dynamic Fields */}
        {renderDynamicFields()}

        <button
          type="submit"
          className="w-full bg-green-600 text-white p-2 rounded-md hover:bg-green-700"
        >
          ✅ Submit Log
        </button>
      </form>
    </div>
  );
}

export default LogForm;







// import React, { useState, useEffect } from 'react';
// import axios from 'axios';
// import { useNavigate } from 'react-router-dom';
//
// function CreateLogPage() {
//   const [userId, setUserId] = useState('');
//   const [users, setUsers] = useState([]);
//   const [activityType, setActivityType] = useState('');
//   const [resourceAccessed, setResourceAccessed] = useState('');
//   const [actionResult, setActionResult] = useState('');
//   const [timestamp, setTimestamp] = useState('');
//   const [details, setDetails] = useState('');
//   const [error, setError] = useState('');
//   const [success, setSuccess] = useState(false);
//   const navigate = useNavigate();
//
//   useEffect(() => {
//     // Fetch all users
//     const fetchUsers = async () => {
//       try {
//         const token = localStorage.getItem('custom_token');
//         const res = await axios.get('http://localhost:8000/api/users/', {
//           headers: { Authorization: `Bearer ${token}` }
//         });
//         setUsers(res.data);
//       } catch (err) {
//         setError('Failed to load users');
//       }
//     };
//     fetchUsers();
//   }, []);
//
//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setError('');
//     setSuccess(false);
//
//     try {
//       const token = localStorage.getItem('custom_token');
//       await axios.post(
//         'http://localhost:8000/api/logs/create/',
//         {
//           user: userId,
//           activity_type: activityType,
//           resource_accessed: resourceAccessed,
//           action_result: actionResult,
//           timestamp,
//           details,
//         },
//         {
//           headers: { Authorization: `Bearer ${token}` },
//         }
//       );
//       setSuccess(true);
//       setUserId('');
//       setActivityType('');
//       setResourceAccessed('');
//       setActionResult('');
//       setTimestamp('');
//       setDetails('');
//     } catch (err) {
//       setError('Failed to create log. Please try again.');
//       console.error(err);
//     }
//   };
//
//   return (
//     <div className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-200 p-6">
//       <div className="bg-white max-w-2xl mx-auto p-8 rounded-xl shadow-lg">
//         <h2 className="text-2xl font-bold mb-6 text-center text-blue-800">Create New Activity Log</h2>
//         {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
//         {success && <div className="bg-green-100 text-green-700 p-3 rounded mb-4">✅ Log created successfully!</div>}
//
//         <form onSubmit={handleSubmit} className="space-y-4">
//
//           {/* User Dropdown */}
//           <div>
//             <label className="block font-medium text-gray-700">Select User</label>
//             <select
//               value={userId}
//               onChange={(e) => setUserId(e.target.value)}
//               className="mt-1 w-full p-2 border border-gray-300 rounded"
//               required
//             >
//               <option value="">-- Select a user --</option>
//               {users.map((u) => (
//                 <option key={u.id} value={u.id}>
//                   {u.username}
//                 </option>
//               ))}
//             </select>
//           </div>
//
//           {/* Rest of form */}
//           <div>
//             <label className="block font-medium text-gray-700">Activity Type</label>
//             <input
//               type="text"
//               value={activityType}
//               onChange={(e) => setActivityType(e.target.value)}
//               className="mt-1 w-full p-2 border border-gray-300 rounded"
//               required
//             />
//           </div>
//
//           <div>
//             <label className="block font-medium text-gray-700">Resource Accessed</label>
//             <input
//               type="text"
//               value={resourceAccessed}
//               onChange={(e) => setResourceAccessed(e.target.value)}
//               className="mt-1 w-full p-2 border border-gray-300 rounded"
//             />
//           </div>
//
//           <div>
//             <label className="block font-medium text-gray-700">Action Result</label>
//             <input
//               type="text"
//               value={actionResult}
//               onChange={(e) => setActionResult(e.target.value)}
//               className="mt-1 w-full p-2 border border-gray-300 rounded"
//             />
//           </div>
//
//           <div>
//             <label className="block font-medium text-gray-700">Timestamp</label>
//             <input
//               type="datetime-local"
//               value={timestamp}
//               onChange={(e) => setTimestamp(e.target.value)}
//               className="mt-1 w-full p-2 border border-gray-300 rounded"
//               required
//             />
//           </div>
//
//           <div>
//             <label className="block font-medium text-gray-700">Additional Details</label>
//             <textarea
//               value={details}
//               onChange={(e) => setDetails(e.target.value)}
//               className="mt-1 w-full p-2 border border-gray-300 rounded"
//               rows={4}
//             ></textarea>
//           </div>
//
//           <button
//             type="submit"
//             className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition"
//           >
//             Submit Log
//           </button>
//         </form>
//
//         <div className="text-center mt-4">
//           <button onClick={() => navigate('/')} className="text-blue-600 underline">
//             ← Back to Dashboard
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// }
//
// export default CreateLogPage;
