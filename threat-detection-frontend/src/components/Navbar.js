import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

function Navbar({ setAuth }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path) => location.pathname === path;

  const navLinkStyle = (path) =>
    `${isActive(path) ? 'text-white font-semibold' : 'text-gray-400 hover:text-white'} px-4 py-2 transition`;

  return (
    <nav className=" text-white px-4 py-3  sticky top-0 z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between rounded-full px-6 py-3 bg-[#1a0e0b] border border-[#3d2d28] shadow-xl">

        {/* Left Nav Links */}
        <div className="flex gap-4 items-center">
          <button onClick={() => navigate('/')} className={navLinkStyle('/')}>
            Dashboard
          </button>
          <button onClick={() => navigate('/users')} className={navLinkStyle('/users')}>
            Users
          </button>
          <button onClick={() => navigate('/alerts')} className={navLinkStyle('/alerts')}>
            Alerts
          </button>
          <button onClick={() => navigate('/analyze')} className={navLinkStyle('/analyze')}>
            Analyze
          </button>
        </div>

        {/* Center Logo */}
        <div className="text-white text-2xl font-extrabold tracking-wider cursor-pointer" onClick={() => navigate('/')}>
          Insider<span className="text-orange-400">Monitor</span>
        </div>

        {/* Right Buttons */}
        <div className="flex gap-3 items-center">
          <button
            onClick={() => navigate('/log')}
            className="bg-white text-black hover:bg-gray-200 px-4 py-2 rounded-full font-semibold transition"
          >
            + Log
          </button>
          <button
            onClick={() => {
              localStorage.removeItem('custom_token');
              setAuth(false);
              navigate('/login');
            }}
            className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-full font-semibold text-white transition"
          >
            Logout
          </button>
        </div>

      </div>
    </nav>
  );
}

export default Navbar;
