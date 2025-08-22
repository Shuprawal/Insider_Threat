// src/components/CreateLogPage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import {getToken} from "./authStorage";


export default function CreateLogPage({ setAuth }) {
  const [userId, setUserId] = useState('');
  const [users, setUsers] = useState([]);

  const [activityType, setActivityType] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [details, setDetails] = useState('');
  const [dynamicFields, setDynamicFields] = useState({});

  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const navigate = useNavigate();
  const activityOptions = ['email_sent', 'usb_inserted', 'logon', 'file_accessed'];
  const API_BASE = 'http://localhost:8000';

  // ---- helpers
  const n = (v) => (typeof v === 'number' ? v : Number(v));
  const fmt6 = (v) => (typeof v === 'number' ? v.toFixed(6) : v);

  useEffect(() => {
    (async () => {
      try {
        // const token = localStorage.getItem('custom_token');
          const token = getToken()
        const res = await axios.get(`${API_BASE}/api/userslist/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setUsers(res.data || []);
      } catch (err) {
        console.error(err);
        setError('Failed to load users.');
      }
    })();
  }, []);

  const validate = () => {
    if (!userId) return 'Please select a user.';
    if (!activityType) return 'Please choose an activity type.';
    if (!timestamp) return 'Please choose a date & time.';

    if (activityType === 'email_sent') {
      const v = n(dynamicFields.num_emails);
      if (!Number.isFinite(v) || v < 0) return 'Enter a non‑negative number of emails.';
    }
    if (activityType === 'usb_inserted') {
      const v = n(dynamicFields.usb_count);
      if (!Number.isFinite(v) || v < 0) return 'Enter a non‑negative USB count.';
    }
    if (activityType === 'file_accessed') {
      const v = n(dynamicFields.num_files);
      if (!Number.isFinite(v) || v < 0) return 'Enter a non‑negative number of files.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setResult(null);

    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    const payload = {
      user: userId,
      activity: activityType,
      timestamp,                // expects "YYYY-MM-DDTHH:MM"
      details: details || undefined,
    };
    if (activityType === 'email_sent')   payload.num_emails = n(dynamicFields.num_emails || 0);
    if (activityType === 'file_accessed') payload.num_files  = n(dynamicFields.num_files  || 0);
    if (activityType === 'usb_inserted')  payload.usb_count  = n(dynamicFields.usb_count  || 0);

    try {
      setSubmitting(true);
      // const token = localStorage.getItem('custom_token');
      const token = getToken()
      const res = await axios.post(`${API_BASE}/api/logs/create/`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess(true);
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to create/analyze log.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFieldChange = (field) => (e) =>
    setDynamicFields((s) => ({ ...s, [field]: e.target.value }));

  const renderDynamicFields = () => {
    switch (activityType) {
      case 'email_sent':
        return (
          <div>
            <label className="block font-medium text-gray-700">📧 Number of Emails Sent</label>
            <input
              type="number"
              min="0"
              value={dynamicFields.num_emails ?? ''}
              onChange={handleFieldChange('num_emails')}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>
        );
      case 'usb_inserted':
        return (
          <div>
            <label className="block font-medium text-gray-700">🔌 USB Insertion Count</label>
            <input
              type="number"
              min="0"
              value={dynamicFields.usb_count ?? ''}
              onChange={handleFieldChange('usb_count')}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>
        );
      case 'logon':
        return <div className="text-sm text-gray-500">No additional fields required for logon.</div>;
      case 'file_accessed':
        return (
          <div>
            <label className="block font-medium text-gray-700">📁 Number of Files Accessed</label>
            <input
              type="number"
              min="0"
              value={dynamicFields.num_files ?? ''}
              onChange={handleFieldChange('num_files')}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-blue-200">
      <div className="bg-white max-w-2xl mx-auto p-8 rounded-xl shadow-lg">
        <h2 className="text-2xl font-bold mb-6 text-center text-blue-800">🛡️ Log Insider Threat Activity</h2>

        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}
        {success && !error && (
          <div className="bg-green-100 text-green-700 p-3 rounded mb-4">✅ Log analyzed successfully</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* User */}
          <div>
            <label className="block font-medium text-gray-700">👤 Select User</label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              required
            >
              <option value="">-- Choose user --</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
          </div>

          {/* Activity */}
          <div>
            <label className="block font-medium text-gray-700">⚙️ Activity Type</label>
            <select
              value={activityType}
              onChange={(e) => {
                setActivityType(e.target.value);
                setDynamicFields({});
              }}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              required
            >
              <option value="">-- Select activity --</option>
              {activityOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* DateTime */}
          <div>
            <label className="block font-medium text-gray-700">📆 Date & Time</label>
            <input
              type="datetime-local"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              required
            />
          </div>

          {renderDynamicFields()}

          {/* Details */}
          <div>
            <label className="block font-medium text-gray-700">📝 Additional Details (optional)</label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="mt-1 w-full p-2 border border-gray-300 rounded"
              rows={3}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className={`w-full text-white py-2 px-4 rounded transition ${
              submitting ? 'bg-blue-300' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {submitting ? 'Submitting…' : '✅ Submit & Analyze'}
          </button>
        </form>

        {/* Results panel */}
        {result && (
          <div className="mt-6 p-4 border rounded bg-gray-50">
            <h3 className="font-semibold text-gray-800 mb-2">Model Decision</h3>
            <div className="grid grid-cols-1 gap-2 text-sm">
              <div>
                <span className="font-medium">Is Anomaly:</span> {String(result.is_anomaly)}
              </div>
              <div>
                <span className="font-medium">Raw Probability:</span>{' '}
                {fmt6(result.raw_probability ?? result.probability)}
              </div>
              {typeof result.applied_boost === 'number' && (
                <div>
                  <span className="font-medium">Applied Boost:</span> {fmt6(result.applied_boost)}
                </div>
              )}
              {typeof result.adjusted_probability === 'number' && (
                <div>
                  <span className="font-medium">Adjusted Probability:</span> {fmt6(result.adjusted_probability)}
                </div>
              )}
              <div>
                <span className="font-medium">Decision Threshold:</span> {fmt6(result.threshold)}
              </div>
              <div>
                <span className="font-medium">Timestamp:</span> {result.timestamp}
              </div>

              {/* Alert details if created */}
              {result.alert && (
                <>
                  <div>
                    <span className="font-medium">Alert ID:</span>{' '}
                    {result.alert.alert_id ?? result.alert.id}
                  </div>
                  <div>
                    <span className="font-medium">Alert Score:</span> {fmt6(result.alert.score)}
                  </div>
                  <div>
                    <span className="font-medium">Reason:</span> {result.alert.reason}
                  </div>
                </>
              )}

              {/* Show current-day aggregate snapshot */}
              {result.agg_snapshot && (
                <div className="mt-2">
                  <span className="font-medium">Day Snapshot:</span>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-xs text-gray-600">
                    {Object.entries(result.agg_snapshot).map(([k, v]) => (
                      <div key={k} className="flex justify-between bg-white border rounded px-2 py-1">
                        <span className="mr-2">{k}</span>
                        <span>{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-center mt-4">
          <button onClick={() => navigate('/')} className="text-blue-600 underline">
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
