import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FaUserCircle } from 'react-icons/fa';
import SiteFooter from './SiteFooter';
import { getToken } from './authStorage';

function UserEditPage() {
  const { userId } = useParams();
  const navigate = useNavigate();

  const token = getToken();
  const cfg = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);

  const [user, setUser] = useState(null);
  const [form, setForm] = useState({
    username: '',
    email: '',                // shown but not editable
    first_name: '',
    last_name: '',
    address: '',
    department: '',
    role: '',
    is_active: true,
    is_suspended: false,
  });
  const [profileFile, setProfileFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get(`http://localhost:8000/api/users/${userId}/edit/`, cfg);
        if (cancelled) return;
        const u = res.data?.user || res.data;
        setUser(u);
        setForm({
          username: u.username || '',
          email: u.email || '',             // display but lock
          first_name: u.first_name || '',
          last_name: u.last_name || '',
          address: u.address || '',
          department: u.department || '',
          role: u.role || '',
          is_active: !!u.is_active,
          is_suspended: !!u.is_suspended,
        });
        setPreviewUrl(u.profile_picture_url || resolveAvatar(u.profile_picture));
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || e?.response?.data?.detail || e.message || 'Failed to load user.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, cfg]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({
      ...f,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    setProfileFile(file || null);
    setPreviewUrl(file ? URL.createObjectURL(file) : (user?.profile_picture_url || resolveAvatar(user?.profile_picture)));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');

    const fd = new FormData();
    // Send ONLY editable fields — DO NOT send email
    fd.append('username', form.username);
    fd.append('first_name', form.first_name);
    fd.append('last_name', form.last_name);
    fd.append('address', form.address);
    fd.append('department', form.department);
    fd.append('role', form.role);
    fd.append('is_active', form.is_active);
    fd.append('is_suspended', form.is_suspended);
    if (profileFile) fd.append('profile_picture', profileFile);

    try {
      await axios.patch(`http://localhost:8000/api/users/${user.id}/edit/`, fd, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
      });
      navigate(`/users/${user.id}`);
    } catch (e) {
      setError(e?.response?.data?.error || e?.response?.data?.detail || e.message || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--im-bg)', color: 'var(--im-text)' }}>
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>Loading…</div>
        <SiteFooter />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--im-bg)', color: 'var(--im-text)' }}>
        <div style={{ maxWidth: 1100, margin: '2rem auto', padding: '1rem' }}>
          <div style={{
            background: 'var(--im-surface)', border: '1px solid var(--im-border)',
            borderRadius: 16, padding: '1rem'
          }}>
            <h2 style={{ margin: 0 }}>Edit user</h2>
            <p style={{ color: 'var(--im-text-weak)' }}>{error}</p>
            <button onClick={() => navigate(`/users/${userId}`)}
              style={{ padding: '.5rem .8rem', borderRadius: 10, border: '1px solid var(--im-border)' }}>
              ← Back
            </button>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--im-bg)', color: 'var(--im-text)', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1 }}>
        <div className="p-8" style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div className="rounded-lg p-6 shadow-md mb-6" style={{ background: 'var(--im-surface)', border: '1px solid var(--im-border)' }}>
            <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--im-text)' }}>Edit User</h2>

            <div className="flex items-center gap-4">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={`${form.username} profile`}
                  style={{
                    width: 88, height: 88, borderRadius: '999px', objectFit: 'cover',
                    border: '1px solid var(--im-border)', background: 'var(--im-surface)'
                  }}
                />
              ) : (
                <FaUserCircle size={88} style={{ color: 'var(--im-text-weak)' }} />
              )}

              <div style={{ lineHeight: 1.35, flex: 1 }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  {/* Username */}
                  <label className="block">
                    <div className="text-xs" style={{ color: 'var(--im-text-weak)' }}>Username</div>
                    <input
                      name="username"
                      value={form.username}
                      onChange={handleChange}
                      className="w-full border rounded px-2 py-1"
                      style={{ background: 'var(--im-surface)', color: 'var(--im-text)', borderColor: 'var(--im-border)' }}
                    />
                  </label>

                  {/* First name */}
                  <label className="block">
                    <div className="text-xs" style={{ color: 'var(--im-text-weak)' }}>First Name</div>
                    <input
                      name="first_name"
                      value={form.first_name}
                      onChange={handleChange}
                      className="w-full border rounded px-2 py-1"
                      style={{ background: 'var(--im-surface)', color: 'var(--im-text)', borderColor: 'var(--im-border)' }}
                      placeholder="Letters and spaces only"
                    />
                  </label>

                  {/* Last name */}
                  <label className="block">
                    <div className="text-xs" style={{ color: 'var(--im-text-weak)' }}>Last Name</div>
                    <input
                      name="last_name"
                      value={form.last_name}
                      onChange={handleChange}
                      className="w-full border rounded px-2 py-1"
                      style={{ background: 'var(--im-surface)', color: 'var(--im-text)', borderColor: 'var(--im-border)' }}
                      placeholder="Letters and spaces only"
                    />
                  </label>

                  {/* Email (read-only) */}
                  <label className="block md:col-span-2">
                    <div className="text-xs" style={{ color: 'var(--im-text-weak)' }}>Email (read-only)</div>
                    <input
                      name="email"
                      value={form.email}
                      readOnly
                      disabled
                      className="w-full border rounded px-2 py-1"
                      style={{
                        background: 'var(--im-surface)',
                        color: 'var(--im-text-weak)',
                        borderColor: 'var(--im-border)',
                        cursor: 'not-allowed',
                        opacity: 0.8
                      }}
                      title="Email cannot be changed"
                    />
                  </label>

                  {/* Department */}
                  <label className="block">
                    <div className="text-xs" style={{ color: 'var(--im-text-weak)' }}>Department</div>
                    <input
                      name="department"
                      value={form.department}
                      onChange={handleChange}
                      className="w-full border rounded px-2 py-1"
                      style={{ background: 'var(--im-surface)', color: 'var(--im-text)', borderColor: 'var(--im-border)' }}
                    />
                  </label>

                  {/* Role */}
                  <label className="block">
                    <div className="text-xs" style={{ color: 'var(--im-text-weak)' }}>Role</div>
                    <input
                      name="role"
                      value={form.role}
                      onChange={handleChange}
                      className="w-full border rounded px-2 py-1"
                      style={{ background: 'var(--im-surface)', color: 'var(--im-text)', borderColor: 'var(--im-border)' }}
                    />
                  </label>

                  {/* Address */}
                  <label className="block md:col-span-2">
                    <div className="text-xs" style={{ color: 'var(--im-text-weak)' }}>Address</div>
                    <input
                      name="address"
                      value={form.address}
                      onChange={handleChange}
                      className="w-full border rounded px-2 py-1"
                      style={{ background: 'var(--im-surface)', color: 'var(--im-text)', borderColor: 'var(--im-border)' }}
                    />
                  </label>

                  {/* Toggles */}
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="is_active"
                      checked={form.is_active}
                      onChange={handleChange}
                    />
                    <span>Active</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="is_suspended"
                      checked={form.is_suspended}
                      onChange={handleChange}
                    />
                    <span>Suspended</span>
                  </label>

                  {/* Picture */}
                  <label className="block md:col-span-3">
                    <div className="text-xs" style={{ color: 'var(--im-text-weak)' }}>Profile Picture</div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFile}
                      className="w-full"
                      style={{ color: 'var(--im-text)' }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 text-right flex gap-2 justify-end">
              <button
                onClick={() => navigate(`/users/${user.id}`)}
                className="font-medium px-4 py-2 rounded"
                style={{ border: '1px solid var(--im-border)', background: 'transparent', color: 'var(--im-text)' }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="text-white font-medium px-4 py-2 rounded"
                style={{ background: saving ? '#a3a3a3' : '#10b981' }}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>

            <div className="mt-3 text-xs" style={{ color: 'var(--im-text-weak)' }}>
              Account created: {formatDateTime(user?.created_at)}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

export default UserEditPage;
