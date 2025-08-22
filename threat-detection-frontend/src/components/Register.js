import React, { useState } from 'react';
import axios from 'axios';
import '../App.css';
import { getToken } from './authStorage';


export default function Register({ setAuth }) {
  const departments = ['IT', 'HR', 'Finance', 'Legal', 'Security'];

    const HERO_IMAGE_URL = 'http://localhost:8000/static/img/cyber1.jpg';

  // Form state
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [address,   setAddress]   = useState('');
  const [department,setDepartment]= useState('');
  const [profilePic,setProfilePic]= useState(null);

  // UI state
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearBanners = () => { setError(''); setMessage(''); setUsernameSuggestions([]); };

  const handleRegister = async (e) => {
    e.preventDefault();
    clearBanners();

    // simple validation
    if (username.trim().length < 4) return setError('Username must be at least 4 characters long.');
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailPattern.test(email)) return setError('Please provide a valid email.');
    if (!department) return setError('Please select a department.');

    try {
      setIsSubmitting(true);

      const formData = new FormData();
      formData.append('username', username.trim());
      formData.append('first_name', firstName.trim());
      formData.append('last_name',  lastName.trim());
      formData.append('email',      email.trim());
      formData.append('address',    address.trim());
      formData.append('department', department);
      formData.append('role',       'employee'); // default
      if (profilePic) formData.append('profile_picture', profilePic);

      // const token = localStorage.getItem('custom_token'); // admin token
      //   import { getToken } from './authStorage'; // adjust path
        const token = getToken();

      const res = await axios.post('http://localhost:8000/api/register/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (res.data?.success) {
        setMessage('✅ Registration successful! User created and activation email sent.');
        setUsername(''); setFirstName(''); setLastName('');
        setEmail(''); setAddress(''); setDepartment(''); setProfilePic(null);
      } else {
        setError(res.data?.error || 'Something went wrong.');
        if (res.data?.suggestions) setUsernameSuggestions(res.data.suggestions);
      }
    } catch (err) {
      if (err.response?.data?.suggestions) setUsernameSuggestions(err.response.data.suggestions);
      setError(err.response?.data?.error || 'Registration failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="imdash-page">


      {/* wrapper hero */}
      <section className="imreg-hero">
        {/* Left: form card */}
        <div className="imreg-panel">


          <h1 className="imreg-title">Member signup</h1>
          <p className="imreg-subtitle">
            Create employee accounts with strong defaults. No hidden steps, no confusion.
          </p>

          {/* banners */}
          {error && <div className="im-banner im-banner--error">{error}</div>}
          {message && !error && <div className="im-banner im-banner--ok">{message}</div>}

          {/* suggestions */}
          {usernameSuggestions.length > 0 && (
            <div className="imreg-suggest">
              <div className="im-card-title">Suggested usernames</div>
              <ul>
                {usernameSuggestions.map((s, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => setUsername(s)} className="im-link">
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* form */}
          <form onSubmit={handleRegister} className="imreg-form">
  <label className="im-label">Email</label>
  <input
    type="email"
    className="im-input imreg-input-lg"
    placeholder="Your email"
    value={email}
    onChange={e => setEmail(e.target.value)}
    required
  />

  {/* expanded fields */}
  <div className="im-grid im-grid--2col imreg-form-more">
    <div>
      <label className="im-label">Username</label>
      <input
        type="text"
        className="im-input"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
    </div>
    <div>
      <label className="im-label">Department</label>
      <select
        className="im-input"
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
        required
      >
        <option value="">-- Select Department --</option>
        {departments.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
    </div>
    <div>
      <label className="im-label">First name</label>
      <input
        type="text"
        className="im-input"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        required
      />
    </div>
    <div>
      <label className="im-label">Last name</label>
      <input
        type="text"
        className="im-input"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        required
      />
    </div>
    <div className="im-grid-span-2">
      <label className="im-label">Address</label>
      <input
        type="text"
        className="im-input"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        required
      />
    </div>
    <div className="im-grid-span-2">
      <label className="im-label">Profile picture (optional)</label>
      <input
        type="file"
        className="im-input"
        accept="image/*"
        onChange={(e) => setProfilePic(e.target.files[0])}
      />
    </div>
  </div>

  {/* CTA at the very bottom */}
  <button
    type="submit"
    className="im-btn im-btn--primary imreg-cta"
    disabled={isSubmitting}
  >
    {isSubmitting ? 'Registering…' : 'Get Started'}
  </button>
</form>

          {/* feature bullets */}
          <div className="imreg-features">
            <div className="imreg-feature"><span>✓</span> RBAC-ready accounts out of the box</div>
            <div className="imreg-feature"><span>✓</span> Adaptive risk policy per department</div>
            <div className="imreg-feature"><span>✓</span> Realtime anomaly alerts to security</div>
            <div className="imreg-feature"><span>✓</span> SSO-friendly and audit-ready</div>
            <div className="imreg-feature"><span>✓</span> Built-in email verification</div>
          </div>

          <div className="imreg-legal">
            <a className="im-link" href="/privacy">Privacy Policy</a>
            <a className="im-link" href="/terms">Terms of Service</a>
          </div>
        </div>

        {/* Right: image + headline */}
        <div
          className="imreg-visual"
          style={{ backgroundImage: `url('${HERO_IMAGE_URL}')` }}
          aria-hidden="true"
        >
          <div className="imreg-visual-overlay">
            <h2 className="imreg-bigline">Every team deserves</h2>
            <h3 className="imreg-bigline-2">security by default</h3>
          </div>
        </div>
      </section>
    </div>
  );
}
