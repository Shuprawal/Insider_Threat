import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

function ActivateAccount() {
  const { uid, token } = useParams();
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleActivate = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    try {
      const res = await axios.post(
        `http://localhost:8000/api/activate/${uid}/${token}/`,
        { password }
      );
      if (res.data.success) {
        setMessage('✅ Account activated! You can now log in.');
      } else {
        setError(res.data.error || 'Activation failed.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Activation failed.');
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded shadow mt-10">
      <h2 className="text-xl font-bold mb-4">Set Your Password</h2>
      {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-2">{error}</div>}
      {message && <div className="bg-green-100 text-green-700 p-3 rounded mb-2">{message}</div>}
      {!message && (
        <form onSubmit={handleActivate}>
          <input
            type="password"
            className="w-full border rounded p-2 mb-4"
            placeholder="New Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
          >
            Set Password & Activate
          </button>
        </form>
      )}
    </div>
  );
}

export default ActivateAccount;
