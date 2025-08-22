import React, { useEffect, useMemo, useState, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import DateFilter from "./Date";
import { getToken, clearToken } from "./authStorage";
import "../App.css";

/* --- tiny inline icons (no deps) --- */
const IconShield = (props) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M12 2l7 3v6c0 5-3.4 9.7-7 11-3.6-1.3-7-6-7-11V5l7-3z" />
  </svg>
);
const IconChart = (props) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M4 20h16v2H2V2h2v18Zm3-3h3V9H7v8Zm5 0h3V5h-3v12Zm5 0h3v-6h-3v6Z" />
  </svg>
);
const IconLogout = (props) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
    <path fill="currentColor" d="M10 3h4v2h-4V3Zm-2 2h2v2H8V5Zm4 12h2v2h-2v-2Zm0-10h2v8h-2V7Zm-2 14h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-2V1h2a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4h-8v-2Zm-7-8 4-4v3h7v2H9v3l-4-4Z"/>
  </svg>
);

/* --- utils --- */
function decodeJwtUserId(token) {
  try {
    const [, payload] = token.split(".");
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return json.user_id ?? json.sub ?? json.uid ?? null;
  } catch {
    return null;
  }
}

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

export default function EmployeeDashboard() {
  const [profile, setProfile] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // ---- THEME (same classes/storage key as Navbar) ----
  const getInitialTheme = () => {
    const saved = localStorage.getItem("im_theme");
    if (saved) return saved;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  };
  const [theme, setTheme] = useState(getInitialTheme);
  useEffect(() => {
    localStorage.setItem("im_theme", theme);
    const root = document.documentElement;
    root.classList.remove("im-theme-dark", "im-theme-light");
    root.classList.add(theme === "dark" ? "im-theme-dark" : "im-theme-light");
    window.dispatchEvent(new CustomEvent("im-theme-changed", { detail: { theme } }));
  }, [theme]);

  // close profile dropdown on outside click
  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // default range = today
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setStartDate(today);
    setEndDate(today);
  }, []);

  // ---- robust logout ----
  const broadcastLogoutToOtherTabs = () => {
    try {
      localStorage.setItem("im_logout_ping", String(Date.now()));
    } catch {}
  };

  const handleLogout = () => {
    try {
      clearToken?.(); // your helper clears the main token
      localStorage.removeItem("custom_token"); // clear any ad-hoc token too
      broadcastLogoutToOtherTabs();
    } finally {
      // hard navigation guarantees App re-reads token = null and sets auth false
      window.location.replace("/login");
    }
  };

  // fetch profile + alerts
  const fetchEverything = async () => {
    setLoading(true);
    setErr("");
    try {
      const rawToken = getToken() || localStorage.getItem("custom_token");
      if (!rawToken) {
        handleLogout();
        return;
      }
      const authHeader = rawToken.startsWith("Bearer ") ? rawToken : `Bearer ${rawToken}`;
      const cfg = { headers: { Authorization: authHeader } };

      // Try to get user id from JWT; if not, fall back to /auth/me/
      let uid = decodeJwtUserId(rawToken);
      if (!uid) {
        try {
          const me = await axios.get("http://localhost:8000/auth/me/", cfg);
          const meData = me?.data?.user || me?.data || {};
          uid = meData.id ?? null;
        } catch (e) {
          if (e?.response?.status === 401) return handleLogout();
          throw e;
        }
      }

      // 1) profile — your backend returns { user: {...}, ... }
      const profileRes = await axios.get(`http://localhost:8000/api/users/${uid}/detail/`, cfg);
      const pRoot = profileRes.data?.user || profileRes.data || {};
      const normProfile = {
        id: pRoot.id ?? uid ?? null,
        username: pRoot.username ?? pRoot.user?.username ?? "User",
        email: pRoot.email ?? pRoot.user?.email ?? "",
        department: pRoot.department ?? pRoot.user?.department ?? "",
        role: pRoot.role ?? pRoot.user?.role ?? "",
        joined_at:
          pRoot.created_at || pRoot.date_joined || pRoot.user?.created_at || pRoot.user?.date_joined || "",
      };
      setProfile(normProfile);

      // 2) alerts (client-side filter to "my" alerts)
      const alertsRes = await axios.get("http://localhost:8000/api/alerts/", {
        ...cfg,
        params: {
          ...(startDate && { start_date: startDate }),
          ...(endDate && { end_date: endDate }),
          page: 1,
          page_size: 100,
        },
      });

      const body = alertsRes.data || {};
      const rows = Array.isArray(body) ? body : body.results || [];

      const normalized = rows.map((a) => ({
        id: a.id,
        status: (a.status || "open").toLowerCase(),
        score: Number(a.score ?? 0),
        created_at: a.created_at || "",
        reason: a.reason || "—",
        log_id: a.log_id ?? a.log,
        user: coerceUser(a.user),
        assigned_to: coerceUser(a.assigned_to),
      }));

      const myId = normProfile.id;
      const myUname = normProfile.username;

      // keep alerts for me (actor or assignee)
      const mine = normalized.filter((a) => {
        const byId = myId && (a.user?.id === myId || a.assigned_to?.id === myId);
        const byName = myUname && a.user?.username === myUname;
        return byId || byName;
      });

      setAlerts(mine);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) {
        handleLogout();
        return;
      }
      console.error("employee dashboard fetch error:", e?.response?.data || e);
      setErr("Failed to load your dashboard. Please refresh.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!startDate || !endDate) return;
    fetchEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const kpis = useMemo(() => {
    const total = alerts.length;
    const open = alerts.filter((a) => a.status !== "closed").length;
    const avg = total ? Math.round((alerts.reduce((s, a) => s + (a.score || 0), 0) / total) * 10) / 10 : 0;
    return { total, open, avg };
  }, [alerts]);

  const recent = useMemo(() => alerts.slice(0, 6), [alerts]);

  const initials = (profile?.username || "U").slice(0, 2).toUpperCase();

  return (
    <div className="ewdash-shell-sentinelY">
      {/* Header */}
      <header className="ewdash-header-sentinelY">
        <div className="ewdash-brand-sentinelY">
          <span className="ewdash-logo-sentinelY">
            <IconShield className="ewdash-logoicon-sentinelY" />
          </span>
          <span className="ewdash-brandtext-sentinelY">Insider Threat Portal</span>
        </div>

        <div className="ewdash-rightcontrols-sentinelY" ref={menuRef}>
          {/* Theme toggle (same look/behavior as Navbar) */}
          <button
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            className="im-toggle"
            title="Toggle theme"
            aria-label="Toggle theme"
            style={{ marginRight: 8 }}
          >
            <span className="im-toggle__thumb" data-mode={theme} />
            <span className="im-toggle__label">{theme === "dark" ? "Dark" : "Light"}</span>
          </button>

          <button
            className="ewdash-profilechip-sentinelY"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            title="Open profile menu"
          >
            <span className="ewdash-avatar-sentinelY" aria-hidden>{initials}</span>
            <span className="ewdash-chipname-sentinelY">{profile?.username || "User"}</span>
          </button>

          {menuOpen && (
            <div className="ewdash-profilemenu-sentinelY" role="menu">
              <button
                className="ewdash-menubtn-sentinelY"
                role="menuitem"
                onClick={() => { setMenuOpen(false); navigate(`/users/${profile?.id || ""}`); }}
              >
                View Profile
              </button>

              {/* If editing is admin-only in your routing guards, keep this; otherwise remove */}
              <button
                className="ewdash-menubtn-sentinelY"
                role="menuitem"
                onClick={() => { setMenuOpen(false); navigate(`/users/${profile?.id || ""}/edit`); }}
              >
                Edit Profile
              </button>

              <div className="ewdash-menudiv-sentinelY" />

              <button
                className="ewdash-menubtn-sentinelY ewdash-menubtn--alert-sentinelY"
                role="menuitem"
                onClick={handleLogout}
              >
                <IconLogout className="ewdash-logouticon-sentinelY" /> Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Hero-ish band */}
      <section className="ewdash-hero-sentinelY">
        <div className="ewdash-heroinner-sentinelY">
          <div className="ewdash-badge-sentinelY">
            <IconChart className="ewdash-badgeicon-sentinelY" />
            your activity & alerts
          </div>
          <h1 className="ewdash-title-sentinelY">
            Welcome back, <span className="ewdash-accent-sentinelY">{profile?.username || "Analyst"}</span>
          </h1>
          <p className="ewdash-sub-sentinelY">
            Track your alerts, monitor your risk score, and keep your profile up to date.
          </p>
        </div>
      </section>

      {/* Main panel */}
      <main className="ewdash-mainpanel-sentinelY">
        {/* KPI cards */}
        <div className="ewdash-kpiwrap-sentinelY">
          <div className="ewdash-kpicard-sentinelY ewdash-kpi--info-sentinelY">
            <div className="ewdash-kpilabel-sentinelY">Total Alerts</div>
            <div className="ewdash-kpivalue-sentinelY">{kpis.total}</div>
          </div>
          <div className="ewdash-kpicard-sentinelY ewdash-kpi--warn-sentinelY">
            <div className="ewdash-kpilabel-sentinelY">Open Alerts</div>
            <div className="ewdash-kpivalue-sentinelY">{kpis.open}</div>
          </div>
          <div className="ewdash-kpicard-sentinelY ewdash-kpi--danger-sentinelY">
            <div className="ewdash-kpilabel-sentinelY">Avg. Score</div>
            <div className="ewdash-kpivalue-sentinelY">{kpis.avg}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="ewdash-filterbar-sentinelY">
          <DateFilter
            startDate={startDate}
            setStartDate={(d) => { setStartDate(d); }}
            endDate={endDate}
            setEndDate={(d) => { setEndDate(d); }}
            onRefresh={fetchEverything}
          />
          <button className="ewdash-refreshbtn-sentinelY" onClick={fetchEverything} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {err && <div className="im-banner im-banner--error" style={{ marginBottom: 12 }}>{err}</div>}

        {/* two-column content */}
        <div className="ewdash-twocol-sentinelY">
          {/* Recent alerts */}
          <section className="ewdash-cardpanel-sentinelY">
            <h2 className="ewdash-paneltitle-sentinelY">Recent Alerts</h2>
            {loading ? (
              <div className="ewdash-empty-sentinelY">Loading alerts…</div>
            ) : recent.length === 0 ? (
              <div className="ewdash-empty-sentinelY">No alerts in this range.</div>
            ) : (
              <ul className="ewdash-alertlist-sentinelY">
                {recent.map((a) => (
                  <li key={a.id} className="ewdash-alertrow-sentinelY">
                    <div className="ewdash-alertmain-sentinelY">
                      <div className="ewdash-alertreason-sentinelY" title={a.reason}>{a.reason}</div>
                      <div className="ewdash-alertmeta-sentinelY">
                        <span className={`ewdash-statuspill-sentinelY ${a.status === "closed" ? "is-closed" : "is-open"}`}>
                          {a.status.toUpperCase()}
                        </span>
                        <span className="ewdash-dot-sentinelY">•</span>
                        <span className="ewdash-alerttime-sentinelY">{a.created_at}</span>
                      </div>
                    </div>
                    <div className="ewdash-alertscore-sentinelY">{a.score}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Profile card */}
          <aside className="ewdash-cardpanel-sentinelY">
            <h2 className="ewdash-paneltitle-sentinelY">Your Profile</h2>
            <div className="ewdash-profileblock-sentinelY">
              <div className="ewdash-profileavatar-sentinelY">{initials}</div>
              <div className="ewdash-profileinfo-sentinelY">
                <div className="ewdash-profilename-sentinelY">{profile?.username || "User"}</div>
                <div className="ewdash-profilemeta-sentinelY">
                  {profile?.role || "Member"}{profile?.department ? ` • ${profile.department}` : ""}
                </div>
                {profile?.email && <div className="ewdash-profilemeta-sentinelY">{profile.email}</div>}
                {profile?.joined_at && (
                  <div className="ewdash-profilemeta-sentinelY">Joined: {profile.joined_at}</div>
                )}
              </div>
            </div>

            <div className="ewdash-profileactions-sentinelY">
              <button
                className="ewdash-ghostbtn-sentinelY"
                onClick={() => navigate(`/users/${profile?.id || ""}`)}
              >
                View Profile
              </button>

              <button
                className="ewdash-dangerbtn-sentinelY"
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </aside>
        </div>
      </main>

      {/* footer-ish strip */}
      <footer className="ewdash-footer-sentinelY">
        <div className="ewdash-footerinner-sentinelY">
          <span>© {new Date().getFullYear()} Insider Threat Portal</span>
          <nav className="ewdash-footerlinks-sentinelY">
            <a href="/docs/security">Security</a>
            <a href="/docs/help">Help</a>
            <a href="/docs/terms">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
