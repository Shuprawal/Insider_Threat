import React, { useState } from 'react';
import axios from 'axios';

function Register() {
  const departments = ['IT', 'HR', 'Finance', 'Legal', 'Security'];

  // Form states
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [department, setDepartment] = useState('');
  const [profilePic, setProfilePic] = useState(null);

  // UI states
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [usernameSuggestions, setUsernameSuggestions] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setUsernameSuggestions([]);

    // Basic frontend validation
    if (username.length < 4) {
      setError('Username must be at least 4 characters long.');
      return;
    }
    if (!email) {
      setError('Email is required.');
      return;
    }
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      setError('Invalid email format.');
      return;
    }
    if (!department) {
      setError('Please select a department.');
      return;
    }

    try {
      setIsSubmitting(true);

      // Prepare form data for backend
      const formData = new FormData();
      formData.append('username', username);
      formData.append('first_name', firstName);
      formData.append('last_name', lastName);
      formData.append('email', email);
      formData.append('address', address);
      formData.append('department', department);
      formData.append('role', 'employee'); // Default role
      if (profilePic) {
        formData.append('profile_picture', profilePic);
      }

      const response = await axios.post('http://localhost:8000/api/register/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        setMessage('✅ Registration successful! Check your email to activate your account.');
        setUsername('');
        setFirstName('');
        setLastName('');
        setEmail('');
        setAddress('');
        setDepartment('');
        setProfilePic(null);
      } else {
        setError(response.data.error || 'Something went wrong.');
        if (response.data.suggestions) {
          setUsernameSuggestions(response.data.suggestions);
        }
      }
    } catch (err) {
      if (err.response?.data?.suggestions) {
        setUsernameSuggestions(err.response.data.suggestions);
      }
      setError(
        err.response?.data?.error ||
        (typeof err.response?.data === 'string' ? err.response.data : 'Registration failed.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-blue-900 to-gray-800">
      <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md transform transition-all duration-500 hover:scale-105">
        {/* Logo */}
        <div className="flex justify-between items-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
            ITD
          </div>
        </div>
        <h2 className="text-3xl font-extrabold text-center text-gray-800 mb-2">User Registration</h2>
        <p className="text-center text-gray-500 mb-6">Insider Threat Detection System</p>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-r-lg">
            <p>{error}</p>
          </div>
        )}

        {/* Success Message */}
        {message && (
          <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-r-lg">
            <p>{message}</p>
          </div>
        )}

        {/* Username Suggestions */}
        {usernameSuggestions.length > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-300 p-3 rounded-lg">
            <p className="font-semibold text-blue-700">Suggestions:</p>
            <ul className="list-disc ml-5 text-sm">
              {usernameSuggestions.map((s, i) => (
                <li
                  key={i}
                  className="cursor-pointer text-blue-600 hover:underline"
                  onClick={() => setUsername(s)}
                >
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleRegister} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-3 pl-4 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full p-3 pl-4 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full p-3 pl-4 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 pl-4 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full p-3 pl-4 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="w-full p-3 pl-4 border border-gray-300 rounded-lg bg-white"
              required
            >
              <option value="">-- Select Department --</option>
              {departments.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profile Picture</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setProfilePic(e.target.files[0])}
              className="w-full p-3 pl-4 border border-gray-300 rounded-lg bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full bg-blue-600 text-white p-3 rounded-lg transition duration-300 transform ${
              isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700 hover:scale-105'
            }`}
          >
            {isSubmitting ? 'Registering...' : 'Register'}
          </button>
        </form>

        {/* Already have account */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Already have an account?{' '}
            <a href="/login" className="text-blue-600 underline">
              Login here
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Register;
