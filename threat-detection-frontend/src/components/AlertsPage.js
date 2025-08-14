import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import DateFilter from "./Date";                 // your existing dashboard DateFilter
import { getToken } from "./authStorage";
import "../App.css";         // CSS below

// Coerce backend user shapes: FK/object/string/number
function coerceUser(u) {
  if (!u) return null;
  if (typeof u === "string") return { username: u };
  if (typeof u === "number") return { id: u };
  return {
    id: u.id ?? u.user_id ?? null,
    username: u.username ?? u.user ?? null,
    email: u.email ?? null,
    department: u.department ?? null,
    role: u.role ?? null,
  };
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);

  // filters
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate]     = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchText, setSearchText]     = useState("");
  const [minScore, setMinScore]         = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // ordering
  const [order, setOrder] = useState("created_desc");

  // ui state
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [viewMode, setViewMode] = useState("cards"); // cards | table

  const navigate = useNavigate();

  const normalize = (rows = []) =>
    rows
      .map((a) => ({
        id: a.id,
        score: Number(a.score ?? 0),
        status: a.status || "open",
        created_at: a.created_at || "",
        reason: a.reason || "—",
        log_id: a.log_id ?? a.log,
        user: coerceUser(a.user),
        assigned_to: coerceUser(a.assigned_to),
      }))
      // client-side min score filter (in addition to server; keeps UX snappy)
      .filter((a) => (minScore ? a.score >= Number(minScore) : true));

  const fetchAlerts = async () => {
    setLoading(true);
    setErrorText("");
    try {
      const token = getToken();
      const res = await axios.get("http://localhost:8000/api/alerts/", {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          page,
          page_size: 12,
          status: statusFilter,
          order,
          q: searchText || undefined,
          ...(startDate && { start_date: startDate }),
          ...(endDate   && { end_date:   endDate   }),
        },
      });
      const body = res.data || {};
      setAlerts(normalize(body.results || []));
      setTotalPages(body.total_pages || 1);
    } catch (err) {
      console.error("alerts fetch failed:", err?.response?.data || err);
      setErrorText("Failed to fetch alerts.");
    } finally {
      setLoading(false);
    }
  };

  // set default dates to today on first mount
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setEndDate(today);
  }, []);

  // fetch when filters change
  useEffect(() => {
    if (!startDate || !endDate) return;
    fetchAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, page, statusFilter, order]);

  const kpis = useMemo(() => {
    const total = alerts.length;
    const open = alerts.filter((a) => (a.status || "").toLowerCase() !== "closed").length;
    const avg  = total ? Math.round((alerts.reduce((s, a) => s + (a.score || 0), 0) / total) * 10) / 10 : 0;
    return { total, open, avg };
  }, [alerts]);

  return (
    <div className="imalerts-page-shell-sentinelX">
      <section className="imalerts-panel-sentinelX">
        {/* KPI row */}
        <div className="imalerts-kpi-grid-sentinelX">
          <div className="imalerts-kpi-card-sentinelX imalerts-kpi--info-sentinelX">
            <div className="imalerts-kpi-label-sentinelX">Total Alerts</div>
            <div className="imalerts-kpi-value-sentinelX">{kpis.total}</div>
          </div>
          <div className="imalerts-kpi-card-sentinelX imalerts-kpi--warn-sentinelX">
            <div className="imalerts-kpi-label-sentinelX">Open</div>
            <div className="imalerts-kpi-value-sentinelX">{kpis.open}</div>
          </div>
          <div className="imalerts-kpi-card-sentinelX imalerts-kpi--danger-sentinelX">
            <div className="imalerts-kpi-label-sentinelX">Avg. Score</div>
            <div className="imalerts-kpi-value-sentinelX">{kpis.avg}</div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="imalerts-filterbar-sentinelX">
          <DateFilter
            startDate={startDate}
            setStartDate={(d) => { setStartDate(d); setPage(1); }}
            endDate={endDate}
            setEndDate={(d) => { setEndDate(d); setPage(1); }}
            onRefresh={fetchAlerts}
          />

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="imalerts-select-sentinelX"
            title="Status"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>

          <select
            value={order}
            onChange={(e) => { setOrder(e.target.value); setPage(1); }}
            className="imalerts-select-sentinelX"
            title="Order"
          >
            <option value="created_desc">Newest first</option>
            <option value="created_asc">Oldest first</option>
            <option value="score_desc">Score ↓</option>
            <option value="score_asc">Score ↑</option>
          </select>

          <input
            type="number"
            min="0"
            step="1"
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            className="imalerts-input-sentinelX"
            placeholder="Min score"
            title="Min score (client filter)"
          />

          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); fetchAlerts(); }}}
            className="imalerts-input-sentinelX"
            placeholder="Search reason / assignee"
            title="Search reason or assigned_to"
          />

          <button
            className="imalerts-refreshbtn-sentinelX"
            onClick={() => { setPage(1); fetchAlerts(); }}
            disabled={loading}
            title="Refresh alerts"
          >
            {loading ? "Loading…" : "Refresh"}
          </button>

          <div className="imalerts-viewtoggle-sentinelX" role="group" aria-label="View mode">
            <button
              className={"imalerts-togglebtn-sentinelX" + (viewMode === "cards" ? " is-active" : "")}
              onClick={() => setViewMode("cards")}
            >
              Cards
            </button>
            <button
              className={"imalerts-togglebtn-sentinelX" + (viewMode === "table" ? " is-active" : "")}
              onClick={() => setViewMode("table")}
            >
              Table
            </button>
          </div>
        </div>

        {/* Error / info */}
        {errorText && <div className="im-banner im-banner--error">{errorText}</div>}
        {!loading && alerts.length === 0 && !errorText && (
          <div className="im-banner">No suspicious activity detected in this range.</div>
        )}

        {/* Content */}
        {viewMode === "cards" ? (
          <div className="imalerts-grid-sentinelX">
            {alerts.map((a) => {
              const actor = a.user || a.assigned_to;
              const actorName = actor?.username || actor?.email || (actor?.id ? `User #${actor.id}` : "Unknown");
              const actorDept = actor?.department || actor?.role || "";
              return (
                <article key={a.id} className="imalerts-card-sentinelX">
                  <header className="imalerts-card-header-sentinelX">
                    <span
                      className={
                        "imalerts-statuspill-sentinelX " +
                        ((a.status || "").toLowerCase() === "closed"
                          ? "imalerts-statuspill--closed-sentinelX"
                          : "imalerts-statuspill--open-sentinelX")
                      }
                    >
                      {(a.status || "open").toUpperCase()}
                    </span>
                    <div className="imalerts-score-sentinelX">Score: <strong>{a.score}</strong></div>
                  </header>

                  <div className="imalerts-row-sentinelX">
                    <span className="imalerts-key-sentinelX">Reason</span>
                    <span className="imalerts-val-sentinelX">{a.reason}</span>
                  </div>

                  <div className="imalerts-row-sentinelX">
                    <span className="imalerts-key-sentinelX">User</span>
                    <span className="imalerts-val-sentinelX">
                      {actorName}{actorDept ? <span className="imalerts-subtle-sentinelX"> • {actorDept}</span> : null}
                    </span>
                  </div>

                  <div className="imalerts-row-sentinelX">
                    <span className="imalerts-key-sentinelX">Time</span>
                    <span className="imalerts-val-sentinelX">{a.created_at}</span>
                  </div>

                  <footer className="imalerts-actions-sentinelX">
                    {actor?.id ? (
                      <button
                        className="imalerts-ghostbtn-sentinelX"
                        onClick={() => navigate(`/users/${actor.id}`)}
                        title="View user details"
                      >
                        View User
                      </button>
                    ) : <span className="imalerts-disabled-sentinelX">User unknown</span>}

                    {a.log_id ? (
                      <button
                        className="imalerts-ghostbtn-sentinelX"
                        onClick={() => navigate(`/logs/${a.log_id}`)}
                        title="View related log"
                      >
                        View Log
                      </button>
                    ) : null}
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="imalerts-tablewrap-sentinelX">
            <table className="imalerts-table-sentinelX">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Reason</th>
                  <th>User</th>
                  <th>Time</th>
                  <th>Log</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const actor = a.user || a.assigned_to;
                  const actorName = actor?.username || actor?.email || (actor?.id ? `User #${actor.id}` : "Unknown");
                  return (
                    <tr key={a.id}>
                      <td>{a.id}</td>
                      <td>{(a.status || "open").toUpperCase()}</td>
                      <td><strong>{a.score}</strong></td>
                      <td title={a.reason}>{a.reason}</td>
                      <td>
                        {actor?.id ? (
                          <button
                            className="imalerts-linkbtn-sentinelX"
                            onClick={() => navigate(`/users/${actor.id}`)}
                          >
                            {actorName}
                          </button>
                        ) : actorName}
                      </td>
                      <td>{a.created_at}</td>
                      <td>
                        {a.log_id ? (
                          <button
                            className="imalerts-linkbtn-sentinelX"
                            onClick={() => navigate(`/logs/${a.log_id}`)}
                          >
                            #{a.log_id}
                          </button>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="imalerts-paginationbar-sentinelX">
          <button
            className="imalerts-pgbtn-sentinelX"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ⬅ Prev
          </button>
          <span className="imalerts-pginfo-sentinelX">Page {page} of {totalPages}</span>
          <button
            className="imalerts-pgbtn-sentinelX"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next ➔
          </button>
        </div>
      </section>
    </div>
  );
}
