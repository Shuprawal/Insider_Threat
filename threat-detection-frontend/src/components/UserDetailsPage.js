import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaUserCircle } from 'react-icons/fa';
import { FiEdit2 } from 'react-icons/fi';

import DashboardCharts from "./DashboardCharts";
import DateFilter from "./Date";
import SiteFooter from "./SiteFooter";
import {getToken} from "./authStorage";

function UserDetailsPage() {
  const { userId, username } = useParams();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [error, setError] = useState("");

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

  // NEW
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [activities, setActivities] = useState([]);
  const [activitiesLimit, setActivitiesLimit] = useState(100);
  const [isLoading, setIsLoading] = useState(false);

  // const token = localStorage.getItem('custom_token');
    const token = getToken()
  const cfg = { headers: { Authorization: `Bearer ${token}` } };

  const resolveAvatar = (pic) => {
    if (!pic) return null;
    if (/^https?:\/\//i.test(pic)) return pic;
    return `http://localhost:8000${pic.startsWith('/') ? '' : '/'}${pic}`;
  };

  const formatDateTime = (val) => {
    if (!val) return '-';
    try {
      const d = new Date(val);
      if (Number.isNaN(d.getTime())) return String(val);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    } catch {
      return String(val);
    }
  };

  async function fetchUser() {
    setError("");
    setIsLoading(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      params.limit = activitiesLimit; // NEW: pass limit so backend can clamp list size

      if (userId) {
        const res = await axios.get(
          `http://localhost:8000/api/users/${userId}/detail/`,
          { ...cfg, params }
        );
        setUser(res.data.user);
        setAlertPoints(res.data.alertPoints || []);
        setPieLabels(res.data.pieLabels || []);
        setPieCounts(res.data.pieData || []);
        setBarLabels(res.data.barLabels || []);
        setBarScores(res.data.barScores || []);
        setBarCounts(res.data.barCounts || []);
        setGroupBy(res.data.groupBy || 'hour');
        setActivities(res.data.activities || []); // NEW
        setIsLoading(false);
        return;
      }

      const uname = String(username || '').trim();
      try {
        const byUname = await axios.get(
          `http://localhost:8000/api/users/by-username/${encodeURIComponent(uname)}/detail/`,
          { ...cfg, params }
        );
        const d = byUname.data;
        setUser(d.user);
        setAlertPoints(d.alertPoints || []);
        setPieLabels(d.pieLabels || []);
        setPieCounts(d.pieData || []);
        setBarLabels(d.barLabels || []);
        setBarScores(d.barScores || []);
        setBarCounts(d.barCounts || []);
        setGroupBy(d.groupBy || 'hour');
        setActivities(d.activities || []); // NEW
        setIsLoading(false);
        return;
      } catch {}

      const listResp = await axios.get(
        'http://localhost:8000/api/users/',
        { ...cfg, params: { username: uname } }
      );

      const items = Array.isArray(listResp.data)
        ? listResp.data
        : (listResp.data?.results || listResp.data?.users || []);

      const exact = items.find(
        u => String(u.username || '').toLowerCase() === uname.toLowerCase()
      );

      if (!exact?.id) {
        throw new Error(`Exact user not found for "${uname}".`);
      }

      const detail = await axios.get(
        `http://localhost:8000/api/users/${exact.id}/detail/`,
        { ...cfg, params }
      );

      const d = detail.data;
      setUser(d.user);
      setAlertPoints(d.alertPoints || []);
      setPieLabels(d.pieLabels || []);
      setPieCounts(d.pieData || []);
      setBarLabels(d.barLabels || []);
      setBarScores(d.barScores || []);
      setBarCounts(d.barCounts || []);
      setGroupBy(d.groupBy || 'hour');
      setActivities(d.activities || []); // NEW
    } catch (err) {
      console.error('Error fetching user details:', err);
      setError(err?.response?.data?.detail || err.message || 'Failed to load user.');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchUser();
  }, [userId, username, startDate, endDate, activitiesLimit]); // NEW: refetch on limit change

  const handleDelete = async () => {
    if (!user) return;
    const confirmDelete = window.confirm(`Are you sure you want to delete user: ${user.username}?`);
    if (!confirmDelete) return;

    try {
      await axios.delete(`http://localhost:8000/api/users/${user.id || userId}/delete/`, cfg);
      alert("User deleted successfully.");
      navigate("/users");
    } catch {
      alert("Failed to delete user.");
    }
  };

  const handleSuspendChange = async (e) => {
    const newValue = e.target.value === 'Yes';
    try {
      await axios.put(`http://localhost:8000/api/users/${user.id || userId}/suspend/`, {
        is_suspended: newValue
      }, cfg);
      setUser(prev => ({ ...prev, is_suspended: newValue }));
    } catch {
      alert("Failed to update suspended status.");
    }
  };

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--im-bg)', color: 'var(--im-text)' }}>
        <div style={{ maxWidth: 1100, margin: '2rem auto', padding: '1rem' }}>
          <div style={{
            background: 'var(--im-surface)', border: '1px solid var(--im-border)',
            borderRadius: 16, padding: '1rem'
          }}>
            <h2 style={{ margin: 0 }}>User error</h2>
            <p style={{ color: 'var(--im-text-weak)' }}>{error}</p>
            <button onClick={() => navigate('/users')}
              style={{ padding: '.5rem .8rem', borderRadius: 10, border: '1px solid var(--im-border)' }}>
              ← Back to Users
            </button>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--im-bg)', color: 'var(--im-text)' }}>

        <div style={{ textAlign: 'center', marginTop: '3rem' }}>Loading…</div>
        <SiteFooter />
      </div>
    );
  }

  const avatarUrl = resolveAvatar(user.profile_picture);
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  const accountStatus = user.is_active ? 'Active' : 'Inactive';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--im-bg)', color: 'var(--im-text)', display: 'flex', flexDirection: 'column' }}>


      <main style={{ flex: 1 }}>
        <div className="p-8">
          {/* Profile Card */}
          <div
            className="rounded-lg p-6 shadow-md mb-6"
            style={{ background: 'var(--im-surface)', border: '1px solid var(--im-border)' }}
          >
            <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--im-text)' }}>User Profile</h2>

            <div className="flex items-center gap-4">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${user.username} profile`}
                  style={{
                    width: 88, height: 88, borderRadius: '999px', objectFit: 'cover',
                    border: '1px solid var(--im-border)', background: 'var(--im-surface)'
                  }}
                />
              ) : (
                <FaUserCircle size={88} style={{ color: 'var(--im-text-weak)' }} />
              )}

              <div style={{ lineHeight: 1.35 }}>
                <h3 className="text-lg font-semibold" style={{ color: 'var(--im-text)', margin: 0 }}>
                  {fullName || user.username}
                </h3>
                {fullName && (
                  <div style={{ color: 'var(--im-text-weak)', fontSize: '.9rem' }}>
                    @{user.username}
                  </div>
                )}

                <div style={{ marginTop: '.4rem', display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                  <span style={{ border: '1px solid var(--im-border)', padding: '.2rem .5rem', borderRadius: 999, fontSize: '.8rem', color: 'var(--im-text-weak)' }}>
                    {user.role || 'Role: –'}
                  </span>
                  <span style={{ border: '1px solid var(--im-border)', padding: '.2rem .5rem', borderRadius: 999, fontSize: '.8rem', color: 'var(--im-text-weak)' }}>
                    {user.department || 'Department: –'}
                  </span>
                  <span style={{
                    border: '1px solid var(--im-border)', padding: '.2rem .6rem',
                    borderRadius: 999, fontSize: '.8rem',
                    color: user.is_active ? 'var(--im-text)' : 'var(--im-text-weak)',
                    background: user.is_active ? 'var(--im-surface-ghost, rgba(0,0,0,0.03))' : 'transparent'
                  }}>
                    {accountStatus}
                  </span>
                  {user.is_suspended && (
                    <span style={{ border: '1px solid var(--im-border)', padding: '.2rem .6rem', borderRadius: 999, fontSize: '.8rem', color: 'var(--im-danger)' }}>
                      Suspended
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Personal Info */}
          <div
            className="rounded-lg p-6 shadow-md mb-6"
            style={{ background: 'var(--im-surface)', border: '1px solid var(--im-border)' }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--im-text)', margin: 0 }}>Personal Information</h3>
              <button className="flex items-center text-sm font-medium" style={{ color: 'var(--im-accent)' }}>
                Edit <FiEdit2 className="ml-1" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm" style={{ color: 'var(--im-text)' }}>
              <div><strong>User ID:</strong><br />{user.id}</div>
              <div><strong>Username:</strong><br />{user.username}</div>
              <div><strong>Email:</strong><br />{user.email}</div>

              <div><strong>First Name:</strong><br />{user.first_name || '-'}</div>
              <div><strong>Last Name:</strong><br />{user.last_name || '-'}</div>
              <div><strong>Address:</strong><br />{user.address || '-'}</div>

              <div><strong>Department:</strong><br />{user.department || '-'}</div>
              <div><strong>Role:</strong><br />{user.role || '-'}</div>
              <div><strong>Account Created:</strong><br />{formatDateTime(user.created_at)}</div>

              <div><strong>Failed Login At:</strong><br />{formatDateTime(user.failed_login_timestamp)}</div>
              <div><strong>Active:</strong><br />{user.is_active ? 'Yes' : 'No'}</div>

              {/* Suspended Toggle */}
              <div className="col-span-1">
                <strong>Suspended:</strong><br />
                <select
                  value={user.is_suspended ? 'Yes' : 'No'}
                  onChange={handleSuspendChange}
                  className="border px-2 py-1 rounded"
                  style={{ background: 'var(--im-surface)', color: 'var(--im-text)', border: '1px solid var(--im-border)' }}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>

            <div className="mt-6 text-right">
              <button
                onClick={handleDelete}
                className="text-white font-medium px-4 py-2 rounded"
                style={{ background: '#ef4444' }}
              >
                🗑️ Delete User
              </button>
            </div>
          </div>

          {/* NEW: Activities Toggle & List */}
          <div
            className="rounded-lg p-6 shadow-md mb-6"
            style={{ background: 'var(--im-surface)', border: '1px solid var(--im-border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: 'var(--im-text)', margin: 0 }}>
                Recent Activities
              </h3>
              <div className="flex items-center gap-2">
                <label className="text-sm" style={{ color: 'var(--im-text-weak)' }}>
                  Show
                </label>
                <select
                  value={activitiesLimit}
                  onChange={(e) => setActivitiesLimit(Number(e.target.value))}
                  className="border px-2 py-1 rounded text-sm"
                  style={{ background: 'var(--im-surface)', color: 'var(--im-text)', border: '1px solid var(--im-border)' }}
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                </select>

                <button
                  onClick={() => setActivitiesOpen(v => !v)}
                  className="font-medium px-3 py-2 rounded text-sm"
                  style={{ border: '1px solid var(--im-border)', background: 'var(--im-surface-ghost, rgba(0,0,0,0.02))', color: 'var(--im-text)' }}
                >
                  {activitiesOpen ? 'Hide' : 'Show'} Activities
                </button>
              </div>
            </div>

            {activitiesOpen && (
              <div>
                {isLoading ? (
                  <div style={{ color: 'var(--im-text-weak)' }}>Loading…</div>
                ) : activities.length === 0 ? (
                  <div style={{ color: 'var(--im-text-weak)' }}>No activities in this date range.</div>
                ) : (
                  <ul className="divide-y" style={{ borderColor: 'var(--im-border)' }}>
                    {activities.map((a) => (
                      <li key={a.id} className="py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="text-sm" style={{ color: 'var(--im-text)' }}>
                              <strong>{a.activity_type || 'Activity'}</strong>
                              {a.is_suspicious ? (
                                <span style={{ marginLeft: 8, fontSize: 12, padding: '2px 6px', borderRadius: 999, border: '1px solid var(--im-border)', color: 'var(--im-danger)' }}>
                                  suspicious
                                </span>
                              ) : null}
                            </div>
                            {a.details && (
                              <div className="text-sm" style={{ color: 'var(--im-text-weak)' }}>
                                {a.details}
                              </div>
                            )}
                            <div className="text-xs" style={{ color: 'var(--im-text-weak)' }}>
                              {a.ip_address ? `IP: ${a.ip_address} • ` : ''}{formatDateTime(a.timestamp)}
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Charts Section */}
          <div
            className="rounded-lg p-6 shadow-md"
            style={{ background: 'var(--im-surface)', border: '1px solid var(--im-border)' }}
          >
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
              barData={{ labels: barLabels, values: barMode === 'score' ? barScores : barCounts }}
              barMode={barMode}
              setBarMode={setBarMode}
              topThreatUsers={[]}
              showTopUsers={false}
              groupBy={groupBy}
            />
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export default UserDetailsPage;
