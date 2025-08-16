import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import ThreatMeter from "./ThreatMeter";
import '../App.css';
import { getToken } from "./authStorage";

const BACKEND_ENDPOINTS_FOR_ACTIVITY_PIPELINE = Object.freeze({
  usersListingEndpoint: 'http://localhost:8000/api/userslist/',
  unifiedAnalyzerEndpoint: 'http://localhost:8000/api/activities/analyze/',
});

const ORGANIZATIONAL_NIGHT_SHIFT_ROLE_LABEL = 'NightOps';

const pad = (n) => String(n).padStart(2, '0');
const toLocalInputString = (dt) =>
  `${dt.getFullYear()}-${pad(dt.getMonth()+1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
const nowLocalInputString = () => toLocalInputString(new Date());

function SmallStatusPillVisual({ children, tone='default' }) {
  return (
    <span className={`im-pill ${tone==='good'?'im-pill--good':tone==='info'?'im-pill--info':tone==='danger'?'im-pill--danger':''}`}>
      {children}
    </span>
  );
}

function MicroMetricCard({ label, value }) {
  return (
    <div className="imdash-kpi-card imdash-kpi--mini">
      <div className="imdash-kpi-label">{label}</div>
      <div className="imdash-kpi-value">{value}</div>
    </div>
  );
}

// Permissive client-side filter (only exclude if flag explicitly disqualifies)
function filterEligibleUsers(users) {
  return (users || []).filter(u =>
    (u?.is_active !== false) &&
    (u?.is_suspended !== true) &&
    (u?.is_superuser !== true) &&
    (u?.is_staff !== true)
  );
}

export default function InteractiveUserSessionOrchestrationPanel({ setAuth, initialUsers }) {
  const navigate = useNavigate();

  // ----- users from same page, or fallback to API -----
  const [listOfSelectableSystemUsers, setListOfSelectableSystemUsers] = useState(
    filterEligibleUsers(initialUsers || [])
  );

  useEffect(() => {
    if (Array.isArray(initialUsers) && initialUsers.length > 0) return; // already provided
    (async () => {
      try {
        const token = getToken();
        const res = await axios.get(
          BACKEND_ENDPOINTS_FOR_ACTIVITY_PIPELINE.usersListingEndpoint,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setListOfSelectableSystemUsers(filterEligibleUsers(res.data || []));
      } catch (e) {
        console.error(e);
        setFrontendErrorBannerMessage('Failed to load users.');
      }
    })();
  }, [initialUsers]);

  // ----- rest of state -----
  const [selectedTargetUserIdString, setSelectedTargetUserIdString] = useState('');
  const [selectedTargetUserRecord, setSelectedTargetUserRecord] = useState(null);

  const [unifiedActionTimestampLocal, setUnifiedActionTimestampLocal] = useState(nowLocalInputString());
  const [wizardProgressStepIndex, setWizardProgressStepIndex] = useState(1);
  const [sessionIsCurrentlyActiveFlag, setSessionIsCurrentlyActiveFlag] = useState(false);
  const [userHasLoggedAnyActionDuringThisSessionFlag, setUserHasLoggedAnyActionDuringThisSessionFlag] = useState(false);

  const [activityEventCategory, setActivityEventCategory] = useState('');
  const [numericCountForActivity, setNumericCountForActivity] = useState('');
  const [submitBusyForActivity, setSubmitBusyForActivity] = useState(false);

  const [perUserAggregateSnapshotForToday, setPerUserAggregateSnapshotForToday] = useState({
    emails:0, files:0, usb:0, logons:0, night_emails:0, night_logons:0, day:''
  });

  const [latestModelAnalysisObject, setLatestModelAnalysisObject] = useState(null);
  const [latestSubmittedEventDescriptor, setLatestSubmittedEventDescriptor] = useState(null);
  const [latestRaisedAlertDescriptor, setLatestRaisedAlertDescriptor] = useState(null);

  const latestProbabilityZeroToOne =
    latestModelAnalysisObject ? Number(latestModelAnalysisObject.probability || 0) : 0;

  const [frontendErrorBannerMessage, setFrontendErrorBannerMessage] = useState('');
  const [frontendSuccessBannerMessage, setFrontendSuccessBannerMessage] = useState('');
  const [busyStateForNetwork, setBusyStateForNetwork] = useState(false);

  // when user changes, reset per-user view
  useEffect(() => {
    const found = listOfSelectableSystemUsers.find(u => String(u.id) === String(selectedTargetUserIdString)) || null;
    setSelectedTargetUserRecord(found);
    setPerUserAggregateSnapshotForToday({ emails:0, files:0, usb:0, logons:0, night_emails:0, night_logons:0, day:'' });
    setLatestModelAnalysisObject(null);
    setLatestRaisedAlertDescriptor(null);
    setLatestSubmittedEventDescriptor(null);
    setSessionIsCurrentlyActiveFlag(false);
    setUserHasLoggedAnyActionDuringThisSessionFlag(false);
    setWizardProgressStepIndex(1);
  }, [selectedTargetUserIdString, listOfSelectableSystemUsers]);

  const tokenHeaderMemo = useMemo(() => {
    const token = getToken();
    return { Authorization: `Bearer ${token}` };
  }, []);

  const clearBanners = () => { setFrontendErrorBannerMessage(''); setFrontendSuccessBannerMessage(''); };

  const copyAggregatesFromBackendResponse = (res) => {
    const snap = res?.data?.agg_snapshot || res?.data?.current_data || {};
    setPerUserAggregateSnapshotForToday(prev => ({
      emails: snap.number_of_emails_dispatched ?? snap.emails ?? prev.emails,
      files:  snap.number_of_files_interacted ?? snap.files ?? prev.files,
      usb:    snap.usb_connection_incidents ?? snap.usb ?? prev.usb,
      logons: snap.total_logon_attempts ?? snap.logons ?? prev.logons,
      night_emails: snap.nighttime_email_events ?? snap.night_emails ?? prev.night_emails,
      night_logons: snap.number_of_night_logons ?? snap.night_logons ?? prev.night_logons,
      day: res?.data?.day ?? prev.day
    }));
  };

  const postAnalyzeActivityEventToBackend = async ({
    userIdNumber, activityName, localTimestampString, numEmails=0, numFiles=0, numUsb=0, details='',
  }) => {
    const legacyCount =
      activityName === 'email_sent' ? numEmails :
      activityName === 'file_accessed' ? numFiles :
      activityName === 'usb_inserted' ? numUsb : 0;

    const payload = {
      user: userIdNumber,
      activity: activityName,
      activity_type: activityName, // AnalyzeUserActivity accepts either key
      timestamp: localTimestampString,
      num_emails: numEmails,
      num_files:  numFiles,
      usb_count:  numUsb,
      details,
      extra_info: { timestamp: localTimestampString, count: legacyCount }
    };

    return axios.post(
      BACKEND_ENDPOINTS_FOR_ACTIVITY_PIPELINE.unifiedAnalyzerEndpoint,
      payload,
      { headers: tokenHeaderMemo }
    );
  };

  // Step 1: logon
  const handleRecordLogonForSelectedUser = async () => {
    clearBanners();
    if (!selectedTargetUserIdString) return setFrontendErrorBannerMessage('Please choose a user.');
    if (!unifiedActionTimestampLocal) return setFrontendErrorBannerMessage('Pick date & time.');
    try {
      setBusyStateForNetwork(true);
      const res = await postAnalyzeActivityEventToBackend({
        userIdNumber: Number(selectedTargetUserIdString),
        activityName: 'logon',
        localTimestampString: unifiedActionTimestampLocal,
        details: 'Session start via orchestration panel'
      });
      copyAggregatesFromBackendResponse(res);
      setLatestModelAnalysisObject(res?.data?.analysis || null);
      setLatestSubmittedEventDescriptor({ activity: 'logon', timestamp: unifiedActionTimestampLocal, count: 0 });
      setLatestRaisedAlertDescriptor(res?.data?.alert || null);
      setFrontendSuccessBannerMessage('🎮 Logon recorded. You can now log activities.');
      setSessionIsCurrentlyActiveFlag(true);
      setWizardProgressStepIndex(2);
      setUserHasLoggedAnyActionDuringThisSessionFlag(true);
      const d = new Date(unifiedActionTimestampLocal); d.setMinutes(d.getMinutes() + 5);
      setUnifiedActionTimestampLocal(toLocalInputString(d));
    } catch (e2) {
      console.error(e2);
      setFrontendErrorBannerMessage(e2.response?.data?.error || e2.response?.data?.detail || 'Failed to record logon.');
    } finally {
      setBusyStateForNetwork(false);
    }
  };

  // Step 2: activities
  const handleRecordArbitraryActivityForSelectedUser = async (e) => {
    e.preventDefault();
    clearBanners();
    if (!activityEventCategory) return setFrontendErrorBannerMessage('Choose an activity.');
    if (!unifiedActionTimestampLocal) return setFrontendErrorBannerMessage('Pick date & time.');
    let n = 0;
    if (['email_sent','file_accessed','usb_inserted'].includes(activityEventCategory)) {
      n = Number(numericCountForActivity);
      if (!Number.isFinite(n) || n < 0) return setFrontendErrorBannerMessage('Enter a non-negative count.');
    }
    try {
      setSubmitBusyForActivity(true);
      const res = await postAnalyzeActivityEventToBackend({
        userIdNumber: Number(selectedTargetUserIdString),
        activityName: activityEventCategory,
        localTimestampString: unifiedActionTimestampLocal,
        details: 'Logged via orchestration panel',
        numEmails: activityEventCategory === 'email_sent' ? n : 0,
        numFiles:  activityEventCategory === 'file_accessed' ? n : 0,
        numUsb:    activityEventCategory === 'usb_inserted' ? n : 0,
      });
      copyAggregatesFromBackendResponse(res);
      const analysisPayload = res?.data?.analysis;
      setLatestModelAnalysisObject(analysisPayload || null);
      setLatestSubmittedEventDescriptor({ activity: activityEventCategory, timestamp: unifiedActionTimestampLocal, count: n });
      setLatestRaisedAlertDescriptor(res?.data?.alert || null);
      setUserHasLoggedAnyActionDuringThisSessionFlag(true);
      setFrontendSuccessBannerMessage(
        analysisPayload?.is_anomaly
          ? `⚠️ Alert score ${Number(analysisPayload.probability).toFixed(3)}`
          : 'Activity logged.'
      );
      const d = new Date(unifiedActionTimestampLocal); d.setMinutes(d.getMinutes() + 5);
      setUnifiedActionTimestampLocal(toLocalInputString(d));
      setNumericCountForActivity('');
    } catch (e2) {
      console.error(e2);
      setFrontendErrorBannerMessage(e2.response?.data?.error || e2.response?.data?.detail || 'Failed to log activity.');
    } finally {
      setSubmitBusyForActivity(false);
    }
  };

  // Step 3: logoff
  const handleRecordLogoffForSelectedUser = async () => {
    clearBanners();
    if (!unifiedActionTimestampLocal) return setFrontendErrorBannerMessage('Pick date & time.');
    try {
      setBusyStateForNetwork(true);
      const res = await postAnalyzeActivityEventToBackend({
        userIdNumber: Number(selectedTargetUserIdString),
        activityName: 'logoff',
        localTimestampString: unifiedActionTimestampLocal,
        details: 'Session end via orchestration panel'
      });
      copyAggregatesFromBackendResponse(res);
      setLatestModelAnalysisObject(res?.data?.analysis || null);
      setLatestSubmittedEventDescriptor({ activity: 'logoff', timestamp: unifiedActionTimestampLocal, count: 0 });
      setLatestRaisedAlertDescriptor(res?.data?.alert || null);
      setFrontendSuccessBannerMessage('🔒 Logoff recorded & analyzed.');
      setWizardProgressStepIndex(3);
      setSessionIsCurrentlyActiveFlag(false);
      setUserHasLoggedAnyActionDuringThisSessionFlag(false);
    } catch (e2) {
      console.error(e2);
      setFrontendErrorBannerMessage(e2.response?.data?.error || e2.response?.data?.detail || 'Failed to record logoff / analyze.');
    } finally {
      setBusyStateForNetwork(false);
    }
  };

  // meter props
  const meterFactoids = {
    Activity: latestSubmittedEventDescriptor?.activity ?? '—',
    Count: latestSubmittedEventDescriptor?.count ?? '—',
    Threshold: latestModelAnalysisObject ? Number(latestModelAnalysisObject.threshold).toFixed(3) : '—',
    'IF score': latestModelAnalysisObject ? Number(latestModelAnalysisObject.iforest_score).toFixed(3) : '—',
  };
  const meterSubtitle = latestSubmittedEventDescriptor?.timestamp
    ? new Date(latestSubmittedEventDescriptor.timestamp).toLocaleString()
    : '';

  const resolvedUserRole =
    selectedTargetUserRecord?.role ?? selectedTargetUserRecord?.user_role ?? selectedTargetUserRecord?.profile?.role ?? '(role unknown)';
  const resolvedUserDept =
    selectedTargetUserRecord?.department ?? selectedTargetUserRecord?.dept ?? selectedTargetUserRecord?.profile?.department ?? '';

  return (
    <div className="imdash-page">
      {frontendErrorBannerMessage && <div className="im-banner im-banner--error">{frontendErrorBannerMessage}</div>}
      {!!frontendSuccessBannerMessage && !frontendErrorBannerMessage && (
        <div className="im-banner im-banner--ok">{frontendSuccessBannerMessage}</div>
      )}

      <section className="imdash-panel">
        <div className="imdash-panel-head">
          <h2 className="imdash-title">User Session Mission</h2>
          <div className="im-steps">
            <SmallStatusPillVisual tone={sessionIsCurrentlyActiveFlag ? 'good' : undefined}>
              {sessionIsCurrentlyActiveFlag ? 'SESSION ACTIVE' : 'Idle'}
            </SmallStatusPillVisual>
            <SmallStatusPillVisual tone={wizardProgressStepIndex >= 1 ? 'info' : undefined}>1. Logon</SmallStatusPillVisual>
            <SmallStatusPillVisual tone={wizardProgressStepIndex >= 2 ? 'info' : undefined}>2. Activities</SmallStatusPillVisual>
            <SmallStatusPillVisual tone={wizardProgressStepIndex >= 3 ? 'info' : 'default'}>3. Logoff</SmallStatusPillVisual>
          </div>
        </div>

        <div className="im-grid im-grid--2col">
          {/* Left column */}
          <div>
            <div className="im-card">
              <div className="im-card-title">Timestamp for next action</div>
              <input
                type="datetime-local"
                value={unifiedActionTimestampLocal}
                onChange={(e) => setUnifiedActionTimestampLocal(e.target.value)}
                className="im-input"
                required
              />
              <div className="im-card-sub">Used for whichever action you perform next (logon, email, file, usb, logoff).</div>
            </div>

            <div className={`im-card ${wizardProgressStepIndex !== 1 ? 'im-card--muted' : ''}`}>
              <div className="im-card-title">Step 1 — Choose user & logon</div>
              <div className="im-grid im-grid--2col">
                <div>
                  <label className="im-label">User</label>
                  <select
                    value={selectedTargetUserIdString}
                    onChange={(e) => setSelectedTargetUserIdString(e.target.value)}
                    className="im-input"
                    required
                    disabled={sessionIsCurrentlyActiveFlag}
                  >
                    <option value="">-- select user --</option>
                    {listOfSelectableSystemUsers.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                  </select>
                  {selectedTargetUserRecord && (
                    <div className="im-inline-pills">
                      <SmallStatusPillVisual tone="info">Role: {resolvedUserRole}</SmallStatusPillVisual>
                      {resolvedUserDept ? <SmallStatusPillVisual>Dept: {resolvedUserDept}</SmallStatusPillVisual> : null}
                      <SmallStatusPillVisual>
                        {String(resolvedUserRole || '').toLowerCase() === ORGANIZATIONAL_NIGHT_SHIFT_ROLE_LABEL.toLowerCase()
                          ? 'Night user' : 'Day user'}
                      </SmallStatusPillVisual>
                    </div>
                  )}
                </div>
                <div className="imform-actions">
                  <button
                    onClick={handleRecordLogonForSelectedUser}
                    className="im-btn im-btn--primary"
                    disabled={busyStateForNetwork || !selectedTargetUserIdString || !unifiedActionTimestampLocal || sessionIsCurrentlyActiveFlag}
                  >
                    {busyStateForNetwork ? 'Recording…' : 'Record Logon'}
                  </button>
                </div>
              </div>
            </div>

            <div className={`im-card ${wizardProgressStepIndex < 2 ? 'im-card--muted' : ''} ${!sessionIsCurrentlyActiveFlag ? 'im-card--locked' : ''}`}>
              {!sessionIsCurrentlyActiveFlag && (
                <div className="im-locked-overlay">
                  <div className="im-locked-title">Record logon to begin</div>
                  <div className="im-locked-sub">Then log activities like a mission.</div>
                </div>
              )}
              <div className="im-card-title">Step 2 — Log activities</div>
              <form onSubmit={handleRecordArbitraryActivityForSelectedUser} className="im-grid im-grid--3col">
                <div>
                  <label className="im-label">Activity</label>
                  <select
                    value={activityEventCategory}
                    onChange={(e) => { setActivityEventCategory(e.target.value); setNumericCountForActivity(''); }}
                    className="im-input"
                    required
                    disabled={!sessionIsCurrentlyActiveFlag}
                  >
                    <option value="">-- select --</option>
                    <option value="email_sent">email_sent</option>
                    <option value="file_accessed">file_accessed</option>
                    <option value="usb_inserted">usb_inserted</option>
                  </select>
                </div>

                <div className="im-grid-span-2">
                  {activityEventCategory === 'email_sent' && (
                    <>
                      <label className="im-label">Number of emails</label>
                      <input type="number" min="0" value={numericCountForActivity}
                             onChange={(e)=>setNumericCountForActivity(e.target.value)}
                             className="im-input" placeholder="e.g. 40" required />
                      <div className="im-hint">Night-time entries also increase night-email count.</div>
                    </>
                  )}
                  {activityEventCategory === 'file_accessed' && (
                    <>
                      <label className="im-label">Number of files</label>
                      <input type="number" min="0" value={numericCountForActivity}
                             onChange={(e)=>setNumericCountForActivity(e.target.value)}
                             className="im-input" placeholder="e.g. 12" required />
                    </>
                  )}
                  {activityEventCategory === 'usb_inserted' && (
                    <>
                      <label className="im-label">USB insertions</label>
                      <input type="number" min="0" value={numericCountForActivity}
                             onChange={(e)=>setNumericCountForActivity(e.target.value)}
                             className="im-input" placeholder="e.g. 1" required />
                    </>
                  )}
                  {!['email_sent','file_accessed','usb_inserted'].includes(activityEventCategory) && (
                    <div className="im-hint">No extra fields required.</div>
                  )}
                </div>

                <div className="im-grid-span-3 imform-actions">
                  <button
                    type="submit"
                    className="im-btn im-btn--dark"
                    disabled={!sessionIsCurrentlyActiveFlag || submitBusyForActivity || !activityEventCategory || !unifiedActionTimestampLocal ||
                              (['email_sent','file_accessed','usb_inserted'].includes(activityEventCategory) && numericCountForActivity==='')}
                  >
                    {submitBusyForActivity ? 'Logging…' : 'Add Activity'}
                  </button>
                </div>
              </form>

              <div className="im-grid im-grid--6col im-kpis-row">
                <MicroMetricCard label="Emails" value={perUserAggregateSnapshotForToday.emails} />
                <MicroMetricCard label="Files" value={perUserAggregateSnapshotForToday.files} />
                <MicroMetricCard label="USB" value={perUserAggregateSnapshotForToday.usb} />
                <MicroMetricCard label="Logons" value={perUserAggregateSnapshotForToday.logons} />
                <MicroMetricCard label="Night emails" value={perUserAggregateSnapshotForToday.night_emails} />
                <MicroMetricCard label="Night logons" value={perUserAggregateSnapshotForToday.night_logons} />
              </div>
            </div>

            <div className={`im-card ${wizardProgressStepIndex < 2 ? 'im-card--muted' : ''}`}>
              <div className="im-card-title">Step 3 — Logoff & final analysis</div>
              <button
                onClick={handleRecordLogoffForSelectedUser}
                className="im-btn im-btn--success"
                disabled={busyStateForNetwork || !unifiedActionTimestampLocal || !sessionIsCurrentlyActiveFlag || !userHasLoggedAnyActionDuringThisSessionFlag}
              >
                {busyStateForNetwork ? 'Analyzing…' : 'Record Logoff'}
              </button>

              {latestModelAnalysisObject && (
                <div className="im-analysis-grid">
                  <div><strong>Is anomaly:</strong> {String(latestModelAnalysisObject.is_anomaly)}</div>
                  <div><strong>Probability:</strong> {Number(latestModelAnalysisObject.probability).toFixed(6)}</div>
                  <div><strong>Threshold:</strong> {Number(latestModelAnalysisObject.threshold).toFixed(6)}</div>
                  <div><strong>IF score:</strong> {Number(latestModelAnalysisObject.iforest_score).toFixed(6)}</div>
                </div>
              )}
            </div>

            <div className="im-footer-row">
              <button onClick={() => navigate('/')} className="im-link">← Back to Dashboard</button>
            </div>
          </div>

          {/* Right column: donut */}
          <div>
            <ThreatMeter
              probabilityZeroToOne={latestProbabilityZeroToOne}
              modelDecisionThreshold={latestModelAnalysisObject ? Number(latestModelAnalysisObject.threshold || 0) : undefined}
              explicitStatusOverride={latestModelAnalysisObject ? (latestModelAnalysisObject.is_anomaly ? 'suspicious' : 'ok') : 'idle'}
              mainTitle={selectedTargetUserRecord ? selectedTargetUserRecord.username : 'Latest threat'}
              secondarySubtitle={meterSubtitle}
              humanReadableReason={latestRaisedAlertDescriptor?.reason || ''}
              factoidDictionary={meterFactoids}
              shouldRenderAndAnimate={!!selectedTargetUserRecord}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
