import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Navbar from "./Navbar";
import { FiEye } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('a-z');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dropdownOpenId, setDropdownOpenId] = useState(null);
  const [showSuspended, setShowSuspended] = useState(false);

  const navigate = useNavigate();

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('custom_token');
      const res = await axios.get('http://localhost:8000/api/users/view/', {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          search,
          sort,
          page,
          suspended: showSuspended ? 'true' : 'false',
        },
      });
      setUsers(res.data.users);
      setTotalPages(res.data.total_pages);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const toggleSuspension = async (userId, shouldSuspend) => {
    try {
      const token = localStorage.getItem('custom_token');
      await axios.put(`http://localhost:8000/api/users/${userId}/suspend/`, {
        is_suspended: shouldSuspend,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchUsers(); // Refresh list
    } catch (err) {
      console.error('Failed to update suspension:', err);
    }
  };

  const setAuth = (value) => {
    if (!value) localStorage.removeItem("custom_token");
  };

  useEffect(() => {
    fetchUsers();
  }, [search, sort, page, showSuspended]);

  return (
    <div className="min-h-screen bg-[#502414] text-white">
      <Navbar setAuth={setAuth} />
      <div className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl w-full text-center font-bold mb-6">
            User <span className="text-orange-400">List</span>
          </h2>

          <button
            className={`px-4 py-2 rounded-md font-semibold text-white transition ${
              showSuspended
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-orange-500 hover:bg-orange-600'
            }`}
            onClick={() => {
              setShowSuspended(prev => !prev);
              setPage(1); // Reset page
            }}
          >
            {showSuspended ? 'Show Active' : 'Suspended'}
          </button>
        </div>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={search}
            placeholder="Search users..."
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 rounded bg-[#1a0e0b] text-white border border-gray-600"
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2 rounded bg-[#1a0e0b] text-white border border-gray-600"
          >
            <option value="a-z">A–Z</option>
            <option value="z-a">Z–A</option>
            <option value="recent-threat">Recent Threats</option>
            <option value="most-threats">Most Threats</option>
          </select>
        </div>

        <div className="rounded-xl overflow-hidden shadow-lg border border-[#4c4444]">
          <table className="w-full bg-[#1a0e0b]">
            <thead>
              <tr className="text-left bg-[#2e241a] text-white text-sm uppercase tracking-wider">
                <th className="p-3">Username</th>
                <th className="p-3">Department</th>
                <th className="p-3">Role</th>
                <th className="p-3">Threats</th>
                <th className="p-3">Created</th>
                <th className="p-3">View</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr
                  key={user.id}
                  className={`hover:bg-[#3B302D] border-t border-[#3f455c] transition duration-200 ${
                    (!showSuspended && user.is_suspended) ? 'opacity-60' : ''
                  }`}
                >
                  <td className="p-3 flex items-center gap-3">
                    <span className="text-2xl">👤</span>
                    <span className="text-base">{user.username}</span>
                  </td>
                  <td className="p-3">{user.department}</td>
                  <td className="p-3">{user.role}</td>
                  <td className="p-3">{user.threat_count}</td>
                  <td className="p-3">{user.created_at}</td>
                  <td className="p-3">
                    <button
                      onClick={() => navigate(`/users/${user.id}`)}
                      className="text-gray-300 hover:text-white"
                      title="View Details"
                    >
                      <FiEye size={20} />
                    </button>
                  </td>
                  <td className="p-3 relative">
                    <button
                      onClick={() =>
                        setDropdownOpenId(dropdownOpenId === user.id ? null : user.id)
                      }
                      className="text-gray-300 hover:text-white text-xl"
                    >
                      ⋮
                    </button>

                    {dropdownOpenId === user.id && (
                      <div className="absolute right-0 top-8 bg-[#2a2f45] text-white rounded shadow-lg z-20 w-32">
                        <button className="px-4 py-2 hover:bg-[#3a3f5a] text-sm w-full text-left">
                          Edit
                        </button>
                        <button className="px-4 py-2 hover:bg-red-600 text-sm w-full text-left">
                          Delete
                        </button>
                        <button
                          className="px-4 py-2 hover:bg-yellow-600 text-sm w-full text-left"
                          onClick={() => toggleSuspension(user.id, !user.is_suspended)}
                        >
                          {user.is_suspended ? 'Unsuspend' : 'Suspend'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="bg-[#3a3f5a] px-4 py-2 rounded hover:bg-[#4a516c] disabled:opacity-40"
          >
            ⬅ Prev
          </button>
          <span className="text-sm text-gray-300">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="bg-[#3a3f5a] px-4 py-2 rounded hover:bg-[#4a516c] disabled:opacity-40"
          >
            Next ➡
          </button>
        </div>
      </div>
    </div>
  );
}

export default UsersPage;
