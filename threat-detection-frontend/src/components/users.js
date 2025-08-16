import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { FiEye } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import ConfirmModal from "./ConfirmModal";
import { getToken } from "./authStorage";
import "../styles/UsersPageStyles.css";


export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("a-z");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dropdownOpenId, setDropdownOpenId] = useState(null);
  const [showSuspended, setShowSuspended] = useState(false);

  const [modalMessage, setModalMessage] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalAction, setModalAction] = useState(() => {});
  const navigate = useNavigate();

  // close dropdown on outside click
  const dropdownRefs = useRef({});

  useEffect(() => {
    function handleOutside(e) {
      const anyOpen = Object.values(dropdownRefs.current);
      if (anyOpen.some((el) => el && el.contains && el.contains(e.target))) {
        return;
      }
      setDropdownOpenId(null);
    }
    document.addEventListener("click", handleOutside);
    return () => document.removeEventListener("click", handleOutside);
  }, []);

  const fetchUsers = async () => {
    try {
      const token = getToken();
      const res = await axios.get("http://localhost:8000/api/users/view/", {
        headers: { Authorization: `Bearer ${token}` },
        params: { search, sort, page, suspended: showSuspended ? "true" : "false" },
      });
      setUsers(res.data.users || []);
      setTotalPages(res.data.total_pages || 1);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    }
  };

  const toggleSuspension = async (userId, shouldSuspend) => {
    try {
      const token = getToken();
      await axios.put(
        `http://localhost:8000/api/users/${userId}/suspend/`,
        { is_suspended: shouldSuspend },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchUsers();
    } catch (err) {
      console.error("Failed to update suspension:", err);
    }
  };

  useEffect(() => {
    fetchUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sort, page, showSuspended]);

  // compute serial number relative to page if your API returns page size
  const pageSize = users?.length || 0;

  return (
    <div className="imusers-page-shell-sentinelX">
      <section className="imusers-panel-container-sentinelX">
        {/* header row (title + Suspended toggle) */}
        <div className="imusers-headerbar-sentinelX">
          <h2 className="imusers-titletext-sentinelX">
            User <span className="imusers-title-accent-sentinelX">Directory</span>
          </h2>

            <div>

                <button
            className={
              "imusers-chipbutton-sentinelX" +
              (showSuspended ? " imusers-chipbutton--active-sentinelX" : "")
            }
            onClick={() => {
              setShowSuspended((prev) => !prev);
              setPage(1);
            }}
          >
            {showSuspended ? "Show Active" : "Suspended"}
          </button>

                 <button
            className={
              "imusers-chipbutton-sentinelX"

            }
            onClick={() => navigate(`/register`)}
          >
             Add
          </button>

            </div>



        </div>

        {/* filter row (search + sort) */}
        <div className="imusers-filterrow-sentinelX">
          <input
            type="text"
            value={search}
            placeholder="Search users…"
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="imusers-searchbox-sentinelX"
          />

          <div className="imusers-rightstack-sentinelX">
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="imusers-selectbox-sentinelX"
            >
              <option value="a-z">A–Z</option>
              <option value="z-a">Z–A</option>
              <option value="recent-threat">Recent Threats</option>
              <option value="most-threats">Most Threats</option>
            </select>
          </div>
        </div>

        {/* empty state */}
        {users.length === 0 ? (
          <div className="imusers-emptystate-card-sentinelX">
            {showSuspended ? "No suspended users found." : "No users have registered."}
          </div>
        ) : (
          <div className="imusers-tablewrap-sentinelX">
            <table className="imusers-datatable-sentinelX">
              <thead>
                <tr className="imusers-headrow-sentinelX">
                  <th className="imusers-th-sentinelX">SN</th>
                  <th className="imusers-th-sentinelX">Username</th>
                  <th className="imusers-th-sentinelX imusers-colhide-md-sentinelX">Department</th>
                  <th className="imusers-th-sentinelX imusers-colhide-lg-sentinelX">Role</th>
                  <th className="imusers-th-sentinelX">Threats</th>
                  <th className="imusers-th-sentinelX imusers-colhide-md-sentinelX">Created</th>
                  <th className="imusers-th-sentinelX">View</th>
                  <th className="imusers-th-sentinelX">Actions</th>
                </tr>
              </thead>

              <tbody>
                {users.map((user, idx) => {
                  const serial = (page - 1) * Math.max(pageSize, 1) + (idx + 1);
                  return (
                    <tr
                      key={user.id}
                      className={
                        "imusers-row-sentinelX" +
                        (!showSuspended && user.is_suspended ? " imusers-row--muted-sentinelX" : "")
                      }
                    >
                      <td className="imusers-td-sentinelX" data-label="SN">
                        {serial}
                      </td>

                      <td className="imusers-td-sentinelX imusers-cell-user-sentinelX" data-label="Username">
                        <span className="imusers-avatar-sentinelX" aria-hidden>
                          {user.username?.slice(0, 1)?.toUpperCase() || "U"}
                        </span>
                        <span className="imusers-username-sentinelX">{user.username}</span>
                      </td>

                      <td className="imusers-td-sentinelX imusers-colhide-md-sentinelX" data-label="Department">
                        {user.department || "—"}
                      </td>

                      <td className="imusers-td-sentinelX imusers-colhide-lg-sentinelX" data-label="Role">
                        {user.role || "—"}
                      </td>

                      <td className="imusers-td-sentinelX" data-label="Threats">
                        <span
                          className={
                            "imusers-badge-sentinelX " +
                            (user.threat_count > 0
                              ? "imusers-badge--warn-sentinelX"
                              : "imusers-badge--neutral-sentinelX")
                          }
                        >
                          {user.threat_count ?? 0}
                        </span>
                      </td>

                      <td
                        className="imusers-td-sentinelX imusers-colhide-md-sentinelX"
                        data-label="Created"
                        title={user.created_at}
                      >
                        {user.created_at}
                      </td>

                      <td className="imusers-td-sentinelX" data-label="View">
                        <button
                          onClick={() => navigate(`/users/${user.id}`)}
                          className="imusers-viewbutton-sentinelX"
                          title="View Details"
                          aria-label={`View ${user.username}`}
                        >
                          <FiEye size={18} />
                        </button>
                      </td>

                      <td className="imusers-td-sentinelX imusers-cell-actions-sentinelX" data-label="Actions">
                        <div
                          className="imusers-actionwrap-sentinelX"
                          ref={(el) => {
                            dropdownRefs.current[user.id] = el;
                          }}
                        >
                          <button
                            className="imusers-actiontoggle-sentinelX"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDropdownOpenId((prev) => (prev === user.id ? null : user.id));
                            }}
                            aria-haspopup="menu"
                            aria-expanded={dropdownOpenId === user.id}
                            aria-label="Open actions menu"
                          >
                            ⋮
                          </button>

                          {dropdownOpenId === user.id && (
                            <div className="imusers-actionmenu-sentinelX" role="menu">
                              <button className="imusers-actionitem-sentinelX" role="menuitem">
                                Edit
                              </button>
                              <button className="imusers-actionitem-sentinelX" role="menuitem">
                                Delete
                              </button>
                              <button
                                className="imusers-actionitem-sentinelX imusers-actionitem--alert-sentinelX"
                                role="menuitem"
                                onClick={() => {
                                  setModalMessage(
                                    `Are you sure you want to ${
                                      user.is_suspended ? "unsuspend" : "suspend"
                                    } this user?`
                                  );
                                  setModalAction(() => () => toggleSuspension(user.id, !user.is_suspended));
                                  setShowModal(true);
                                  setDropdownOpenId(null);
                                }}
                              >
                                {user.is_suspended ? "Unsuspend" : "Suspend"}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* pagination */}
        <div className="imusers-paginationbar-sentinelX">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="imusers-pgbtn-sentinelX"
          >
            ⬅ Prev
          </button>
          <span className="imusers-pginfo-sentinelX">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="imusers-pgbtn-sentinelX"
          >
            Next ➔
          </button>
        </div>
      </section>

      {/* modal */}
      {showModal && (
        <ConfirmModal
          message={modalMessage}
          onConfirm={() => {
            modalAction();
            setShowModal(false);
          }}
          onCancel={() => setShowModal(false)}
          confirmText="Yes"
          cancelText="Cancel"
        />
      )}
    </div>
  );
}
