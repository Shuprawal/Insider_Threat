// CreateSessionWizard.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import Navbar from './Navbar';
import { useNavigate } from 'react-router-dom';

const API = {
  users:   'http://localhost:8000/api/users/',
  analyze: 'http://localhost:8000/api/activities/analyze/', // single analyzer endpoint
};

const NIGHTOPS_ROLE_NAME = 'NightOps';

// ---------------- UI bits ----------------
function Badge({ children, tone='slate' }) {
  const tones = {
    green: 'bg-green-100 text-green-800 border-green-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    slate: 'bg-slate-100 text-slate-800 border-slate-200',
    amber: 'bg-amber-100 text-amber-900 border-amber-200',
    red: 'bg-red-100 text-red-800 border-red-200',
    violet: 'bg-violet-100 text-violet-800 border-violet-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border ${tones[tone]} text-xs font-medium`}>
      {children}
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <div className="p-3 bg-white rounded-lg border">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

/** Animated circular % indicator (no libs). */
function ThreatDonut({ value = 0, size = 120, stroke = 12, label = 'Threat', show = false }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;

  // animation 0 -> pct on change
  const [animPct, setAnimPct] = useState(0);
  const raf = useRef(null);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!show) { setAnimPct(0); return; }
    const from = fromRef.current;
    const to = pct;
    const duration = 650; // ms
    const start = performance.now();

    const tick = (t0) => {
      const p = Math.min(1, (t0 - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // cubic ease-out
      const cur = from + (to - from) * eased;
      setAnimPct(cur);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [pct, show]);

  const dash = (animPct / 100) * C;

  return (
    <div
      className={`flex flex-col items-center justify-center transition-all duration-300
                  ${show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`
      }
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* outer decorative arc */}
        <circle cx={cx} cy={cy} r={r + 10} fill="none" stroke="rgba(124,58,237,0.15)" strokeWidth={4}
                strokeDasharray={`${C * 0.3} ${C}`} strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cy})`} />
        {/* background ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(124,58,237,0.15)" strokeWidth={stroke} />
        {/* progress ring */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="rgb(139,92,246)" /* violet-500 */
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dasharray 120ms linear' }}
        />
        {/* inner hub */}
        <circle cx={cx} cy={cy} r={r - stroke} fill="white" />
        {/* % text */}
        <text x={cx} y={cy + 6} textAnchor="middle" fontSize="20" fontWeight="700" fill="rgb(88,28,135)">
          {Math.round(animPct)}%
        </text>
      </svg>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

// ------------ helpers ------------
const pad = (n) => String(n).padStart(2, '0');
function toLocalInput(dt) {
  const y = dt.getFullYear();
  const m = pad(dt.getMonth() + 1);
  const d = pad(dt.getDate());
  const h = pad(dt.getHours());
  const min = pad(dt.getMinutes());
  return `${y}-${m}-${d}T${h}:${min}`;
}
function nowLocalInput() { return toLocalInput(new Date()); }

export default function CreateSessionWizard({ setAuth }) {
  const navigate = useNavigate();

  // ----- state -----
  const [step, setStep] = useState(1);         // 1 logon, 2 activities, 3 logoff
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  const [sessionActive, setSessionActive] = useState(false);
  const [hasLogged, setHasLogged] = useState(false);

  const [eventTime, setEventTime] = useState(nowLocalInput());

  const [activityType, setActivityType] = useState('');
  const [count, setCount] = useState('');
  const [logSubmitting, setLogSubmitting] = useState(false);

  const [agg, setAgg] = useState({
    emails: 0, files: 0, usb: 0, logons: 0, night_emails: 0, night_logons: 0, day: ''
  });
  const [analysis, setAnalysis] = useState(null);

  const latestPercent = analysis ? (Number(analysis.probability || 0) * 100) : 0;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  // ----- load users -----
  useEffect(() => {
    (async () => {
      try {
        setErr('');
        const token = localStorage.getItem('custom_token');
        const res = await axios.get(API.users, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUsers(res.data || []);
      } catch (e) {
        console.error(e);
        setErr('Failed to load users.');
      }
    })();
  }, []);

  // when user changes: sync selected and CLEAR old stats (prevents “global day” look)
  useEffect(() => {
    const u = users.find(u => String(u.id) === String(userId)) || null;
    setSelectedUser(u);

    // reset per-user aggregates and last analysis so we don’t show previous user/global data
    setAgg({ emails: 0, files: 0, usb: 0, logons: 0, night_emails: 0, night_logons: 0, day: '' });
    setAnalysis(null);
    setSessionActive(false);
    setHasLogged(false);
    setStep(1);
  }, [userId, users]);

  const userRole =
    selectedUser?.role ??
    selectedUser?.user_role ??
    selectedUser?.profile?.role ??
    '(role unknown)';
  const userDept =
    selectedUser?.department ??
    selectedUser?.dept ??
    selectedUser?.profile?.department ??
    '';
  const isNightOps =
    String(userRole || '').toLowerCase() === NIGHTOPS_ROLE_NAME.toLowerCase();

  const tokenHeader = useMemo(() => {
    const token = localStorage.getItem('custom_token');
    return { Authorization: `Bearer ${token}` };
  }, []);

  const resetMessages = () => { setErr(''); setOk(''); };

  const updateAggFromResponse = (res) => {
    const snap = res?.data?.agg_snapshot || res?.data?.current_data || {};
    setAgg(prev => ({
      emails: snap.number_of_emails_dispatched ?? snap.emails ?? prev.emails,
      files: snap.number_of_files_interacted ?? snap.files ?? prev.files,
      usb: snap.usb_connection_incidents ?? snap.usb ?? prev.usb,
      logons: snap.total_logon_attempts ?? snap.logons ?? prev.logons,
      night_emails: snap.nighttime_email_events ?? snap.night_emails ?? prev.night_emails,
      night_logons: snap.number_of_night_logons ?? snap.night_logons ?? prev.night_logons,
      day: res?.data?.day ?? prev.day
    }));
  };

  /** POST to analyzer; include both schemas so either backend path accepts it */
  const postActivity = async ({ user, activity, timestamp, num_emails=0, num_files=0, usb_count=0, details='' }) => {
    const legacyCount =
      activity === 'email_sent' ? num_emails :
      activity === 'file_accessed' ? num_files :
      activity === 'usb_inserted' ? usb_count : 0;

    const payload = {
      user,
      activity,                   // SingleLogAnalyzer
      activity_type: activity,    // old validator compatibility
      timestamp,
      num_emails, num_files, usb_count,
      details,
      extra_info: { timestamp, count: legacyCount } // legacy shape
    };
    return axios.post(API.analyze, payload, { headers: tokenHeader });
  };

  // -------- step 1: LOGON --------
  const onStart = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!userId) return setErr('Please choose a user.');
    if (!eventTime) return setErr('Pick a date & time for this activity.');
    try {
      setLoading(true);
      const res = await postActivity({
        user: Number(userId), activity: 'logon', timestamp: eventTime, details: 'Session start via wizard'
      });
      updateAggFromResponse(res);
      setAnalysis(res?.data?.analysis || null);
      setOk('🎮 Logon recorded. You can now log activities.');
      setSessionActive(true);
      setStep(2);
      setHasLogged(true);
      // ease: move time forward a bit
      const d = new Date(eventTime); d.setMinutes(d.getMinutes() + 5);
      setEventTime(toLocalInput(d));
    } catch (e2) {
      console.error(e2);
      setErr(e2.response?.data?.error || e2.response?.data?.detail || 'Failed to record logon.');
    } finally {
      setLoading(false);
    }
  };

  // -------- step 2: ACTIVITIES --------
  const onLog = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!activityType) return setErr('Choose an activity.');
    if (!eventTime) return setErr('Pick a date & time for this activity.');

    let n = 0;
    if (['email_sent','file_accessed','usb_inserted'].includes(activityType)) {
      n = Number(count);
      if (!Number.isFinite(n) || n < 0) return setErr('Please enter a non-negative count.');
    }
    try {
      setLogSubmitting(true);
      const res = await postActivity({
        user: Number(userId),
        activity: activityType,
        timestamp: eventTime,
        details: 'Logged via session wizard',
        num_emails: activityType === 'email_sent' ? n : 0,
        num_files:  activityType === 'file_accessed' ? n : 0,
        usb_count:  activityType === 'usb_inserted' ? n : 0,
      });
      updateAggFromResponse(res);
      const a = res?.data?.analysis;
      setAnalysis(a || null);
      setHasLogged(true);
      setOk(a?.is_anomaly ? `⚠️ Alert score ${Number(a.probability).toFixed(3)}` : 'Activity logged.');
      const d = new Date(eventTime); d.setMinutes(d.getMinutes() + 5);
      setEventTime(toLocalInput(d));
      setCount('');
    } catch (e2) {
      console.error(e2);
      setErr(e2.response?.data?.error || e2.response?.data?.detail || 'Failed to log activity.');
    } finally {
      setLogSubmitting(false);
    }
  };

  // -------- step 3: LOGOFF --------
  const onEnd = async (e) => {
    e.preventDefault();
    resetMessages();
    if (!eventTime) return setErr('Pick a date & time for this activity.');
    try {
      setLoading(true);
      const res = await postActivity({
        user: Number(userId), activity: 'logoff', timestamp: eventTime, details: 'Session end via wizard'
      });
      updateAggFromResponse(res);
      setAnalysis(res?.data?.analysis || null);
      setOk('🔒 Logoff recorded & analyzed.');
      setStep(3);
      setSessionActive(false);
      setHasLogged(false);
    } catch (e2) {
      console.error(e2);
      setErr(e2.response?.data?.error || e2.response?.data?.detail || 'Failed to record logoff / analyze.');
    } finally {
      setLoading(false);
    }
  };

  // ----- dynamic fields -----
  const ActivityExtraFields = () => {
    if (activityType === 'email_sent') {
      return (
        <div>
          <label className="block text-sm font-medium text-slate-700">Number of emails</label>
          <input type="number" min="0" value={count} onChange={(e) => setCount(e.target.value)}
                 className="mt-1 w-full border rounded p-2" placeholder="e.g. 40" required />
          <p className="text-xs text-slate-500 mt-1">Night-time entries also increase night-email count.</p>
        </div>
      );
    }
    if (activityType === 'file_accessed') {
      return (
        <div>
          <label className="block text-sm font-medium text-slate-700">Number of files</label>
          <input type="number" min="0" value={count} onChange={(e) => setCount(e.target.value)}
                 className="mt-1 w-full border rounded p-2" placeholder="e.g. 12" required />
        </div>
      );
    }
    if (activityType === 'usb_inserted') {
      return (
        <div>
          <label className="block text-sm font-medium text-slate-700">USB insertions</label>
          <input type="number" min="0" value={count} onChange={(e) => setCount(e.target.value)}
                 className="mt-1 w-full border rounded p-2" placeholder="e.g. 1" required />
        </div>
      );
    }
    return <div className="text-xs text-slate-500">No extra fields required.</div>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-100">
      <Navbar setAuth={setAuth} />
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800">🕹️ User Session Mission</h2>
            <div className="flex items-center gap-2">
              {sessionActive ? <Badge tone="green">SESSION ACTIVE</Badge> : <Badge>Idle</Badge>}
              <Badge tone={step >= 1 ? 'blue' : 'slate'}>1. Logon</Badge>
              <Badge tone={step >= 2 ? 'blue' : 'slate'}>2. Activities</Badge>
              <Badge tone={step >= 3 ? 'blue' : 'slate'}>3. Logoff</Badge>
            </div>
          </div>

          {/* messages */}
          {!!err && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded border border-red-200">{err}</div>}
          {!!ok && !err && <div className="mt-4 p-3 bg-green-50 text-green-800 rounded border border-green-200">{ok}</div>}

          {/* SINGLE TIMESTAMP */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-slate-700">Activity timestamp</label>
            <input
              type="datetime-local"
              value={eventTime}
              onChange={(e) => setEventTime(e.target.value)}
              className="mt-1 w-full border rounded p-2"
              required
            />
            <p className="text-xs text-slate-500 mt-1">This one time will be used for the next action (logon, email, file, usb, logoff).</p>
          </div>

          {/* STEP 1: LOGON + DONUT */}
          <div className="mt-6">
            <div className={`transition ${step !== 1 ? 'opacity-50 pointer-events-none' : ''}`}>
              <h3 className="font-semibold text-slate-700 mb-3">Step 1 — Choose user & logon</h3>
              <form onSubmit={onStart} className="grid md:grid-cols-3 gap-4 items-start">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">User</label>
                  <select
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="mt-1 w-full border rounded p-2"
                    required
                    disabled={sessionActive}
                  >
                    <option value="">-- select user --</option>
                    {users.map(u => (
                      <option key={u.id} value={u.id}>{u.username}</option>
                    ))}
                  </select>
                  {selectedUser && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge tone="violet">Role: {userRole}</Badge>
                      {userDept ? <Badge tone="amber">Dept: {userDept}</Badge> : null}
                      {isNightOps ? <Badge tone="blue">Night user</Badge> : <Badge tone="slate">Day user</Badge>}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading || !userId || !eventTime || sessionActive}
                    className={`mt-4 px-4 py-2 rounded text-white ${loading ? 'bg-blue-300' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    {loading ? 'Recording…' : 'Record Logon'}
                  </button>
                </div>

                {/* Donut ONLY when a user is selected */}
                <div className="flex justify-center md:justify-end">
                  <ThreatDonut
                    value={latestPercent}
                    label="Latest threat"
                    show={!!selectedUser}
                  />
                </div>
              </form>
            </div>
          </div>

          {/* STEP 2: ACTIVITIES */}
          <div className="mt-10 relative">
            {!sessionActive && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg border">
                <div className="text-center">
                  <div className="text-2xl font-bold mb-2">Record logon to begin</div>
                  <div className="text-slate-600">Then log activities like a mission.</div>
                </div>
              </div>
            )}

            <div className={`${step < 2 ? 'opacity-30 pointer-events-none' : ''}`}>
              <h3 className="font-semibold text-slate-700 mb-3">Step 2 — Log activities</h3>
              <form onSubmit={onLog} className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Activity</label>
                  <select
                    value={activityType}
                    onChange={(e) => { setActivityType(e.target.value); setCount(''); }}
                    className="mt-1 w-full border rounded p-2"
                    required
                    disabled={!sessionActive}
                  >
                    <option value="">-- select --</option>
                    <option value="email_sent">email_sent</option>
                    <option value="file_accessed">file_accessed</option>
                    <option value="usb_inserted">usb_inserted</option>
                    <option value="logon">logon</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <ActivityExtraFields />
                </div>
                <div className="md:col-span-3">
                  <button
                    type="submit"
                    disabled={
                      !sessionActive ||
                      logSubmitting ||
                      !activityType ||
                      !eventTime ||
                      (['email_sent','file_accessed','usb_inserted'].includes(activityType) && count === '')
                    }
                    className={`px-4 py-2 rounded text-white ${logSubmitting ? 'bg-slate-300' : 'bg-slate-700 hover:bg-slate-800'}`}
                  >
                    {logSubmitting ? 'Logging…' : 'Add Activity'}
                  </button>
                </div>
              </form>

              {/* live snapshot (for THIS user only) */}
              <div className="mt-6 grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <Stat label="Emails" value={agg.emails} />
                <Stat label="Files" value={agg.files} />
                <Stat label="USB" value={agg.usb} />
                <Stat label="Logons" value={agg.logons} />
                <Stat label="Night emails" value={agg.night_emails} />
                <Stat label="Night logons" value={agg.night_logons} />
              </div>
            </div>
          </div>

          {/* STEP 3: LOGOFF */}
          <div className="mt-10">
            <div className={`${step < 2 ? 'opacity-30 pointer-events-none' : ''}`}>
              <h3 className="font-semibold text-slate-700 mb-3">Step 3 — Logoff & final analysis</h3>
              <form onSubmit={onEnd} className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={loading || !eventTime || !sessionActive || !hasLogged}
                    className={`px-4 py-2 rounded text-white ${loading ? 'bg-emerald-300' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                  >
                    {loading ? 'Analyzing…' : 'Record Logoff'}
                  </button>
                </div>
              </form>

              {analysis && (
                <div className="mt-6 p-4 border rounded bg-gray-50">
                  <h4 className="font-semibold text-slate-800 mb-2">Model Decision</h4>
                  <div className="grid sm:grid-cols-2 gap-2 text-sm">
                    <div><span className="font-medium">Is anomaly:</span> {String(analysis.is_anomaly)}</div>
                    <div><span className="font-medium">Probability:</span> {Number(analysis.probability).toFixed(6)}</div>
                    <div><span className="font-medium">Threshold:</span> {Number(analysis.threshold).toFixed(6)}</div>
                    <div><span className="font-medium">IF score:</span> {Number(analysis.iforest_score).toFixed(6)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-between">
            <button onClick={() => navigate('/')} className="text-blue-600 hover:underline">← Back to Dashboard</button>
            <div className="text-xs text-slate-500">
              Tip: Night users (role = {NIGHTOPS_ROLE_NAME}) won’t receive night-time boosts.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
