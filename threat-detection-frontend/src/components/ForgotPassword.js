import React, { useState } from 'react';
import api from './api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setStatus(''); setError('');
    try {
      const { data } = await api.post('/api/forgot-password/', { email: email.trim() });
      setStatus(data.message || 'If that email exists, a reset link has been sent.');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to start reset.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4">Forgot Password</h2>

        {status && <div className="bg-green-100 text-green-800 p-3 rounded mb-4">{status}</div>}
        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 border rounded"
              required
            />
          </div>
          <button className="w-full bg-blue-600 text-white p-3 rounded">Send reset link</button>
        </form>
      </div>
    </div>
  );
}
