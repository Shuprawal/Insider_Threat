import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Navbar from "./Navbar";
import { FiEye } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import ConfirmModal from './ConfirmModal';
import '../styles/UsersPageStyles.css';

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('a-z');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dropdownOpenId, setDropdownOpenId] = useState(null);
  const [showSuspended, setShowSuspended] = useState(false);

  const [modalMessage, setModalMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState(() => {});

  const navigate = useNavigate();

  const fetchUsers = async () => {
    try {
      const token = localStorage.getItem('custom_token');
      const res = await axios.get('http://localhost:8000/api/users/view/', {
        headers: { Authorization: `Bearer ${token}` },
        params: { search, sort, page, suspended: showSuspended ? 'true' : 'false' },
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
      fetchUsers();
    } catch (err) {
      console.error('Failed to update suspension:', err);
    }
  };

  const setAuth = (value) => {
    if (!value) localStorage.removeItem("custom_token");
  };

  useEffect(() => { fetchUsers(); }, [search, sort, page, showSuspended]);

  return (
   <div className="userspage-root">
      <Navbar setAuth={setAuth} />
      <div className="userspage-container">
        <div className="userspage-header">
          <h2 className="userspage-title">
            User <span className="userspage-title-highlight">List</span>
          </h2>
          <button
            className={`userspage-suspend-btn${showSuspended ? ' suspended' : ''}`}
            onClick={() => { setShowSuspended(prev => !prev); setPage(1); }}
          >
            {showSuspended ? 'Show Active' : 'Suspended'}
          </button>
        </div>
        <div className="userspage-controls">
          <input
            type="text" value={search} placeholder="Search users..."
            onChange={(e) => setSearch(e.target.value)}
            className="userspage-search"
          />
          <select
            value={sort} onChange={(e) => setSort(e.target.value)}
            className="userspage-sort"
          >
            <option value="a-z">A–Z</option>
            <option value="z-a">Z–A</option>
            <option value="recent-threat">Recent Threats</option>
            <option value="most-threats">Most Threats</option>
          </select>
        </div>
        {users.length === 0 ? (
          <div className="userspage-empty">
            {showSuspended ? 'No suspended users found.' : 'No users have registered.'}
          </div>
        ) : (
          <div className="userspage-table-wrap">
            <table className="userspage-table">
              <thead>
                <tr className="userspage-table-header-row">
                    <th>SN</th>
                  <th>Username</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Threats</th>
                  <th>Created</th>
                  <th>View</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user,index) => (
                  <tr key={user.id} className={`userspage-table-row${(!showSuspended && user.is_suspended) ? ' suspended-row' : ''}`}>
                      <td>{ index + 1 }</td>
                    <td className="userspage-usercell">
                      <span className="userspage-usericon">👤</span>
                      <span>{user.username}</span>
                    </td>
                    <td>{user.department}</td>
                    <td>{user.role}</td>
                    <td>{user.threat_count}</td>
                    <td>{user.created_at}</td>
                    <td>
                      <button
                        onClick={() => navigate(`/users/${user.id}`)}
                        className="userspage-viewbtn"
                        title="View Details"
                      >
                        <FiEye size={20} />
                      </button>
                    </td>
                    <td className="userspage-actions-cell">
                      <button
                        onClick={() => setDropdownOpenId(dropdownOpenId === user.id ? null : user.id)}
                        className="userspage-actions-toggle"
                      >
                        ⋮
                      </button>
                      {dropdownOpenId === user.id && (
                        <div className="userspage-actions-dropdown">
                          <button className="dropdown-btn edit-btn">Edit</button>
                          <button className="dropdown-btn delete-btn">Delete</button>
                          <button
                            className="dropdown-btn suspend-btn"
                            onClick={() => {
                              setModalMessage(`Are you sure you want to ${user.is_suspended ? 'unsuspend' : 'suspend'} this user?`);
                              setModalAction(() => () => toggleSuspension(user.id, !user.is_suspended));
                              setShowModal(true);
                            }}
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
        )}
        <div className="userspage-pagination">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="pagination-btn"
          >
            ⬅ Prev
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="pagination-btn"
          >
            Next ➔
          </button>
        </div>
      </div>
      {showModal && (
        <ConfirmModal
          message={modalMessage}
          onConfirm={() => { modalAction(); setShowModal(false); }}
          onCancel={() => setShowModal(false)}
          confirmText="Yes"
          cancelText="Cancel"
        />
      )}
    </div>
  );
}

export default UsersPage;
