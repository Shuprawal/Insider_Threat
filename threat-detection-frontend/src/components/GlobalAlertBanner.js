import React from "react";
import { useNavigate } from "react-router-dom";
import { useAlerts } from "./GlobalAlertsProvider";
import { useRealtimeSettings } from "./RealtimeSettingsContext";

function toPct(n) {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return 0;
  return x <= 1 ? x * 100 : x;
}

function fmtDate(ts, pattern = "YYYY-MM-DD HH:mm") {
  const d = ts ? new Date(ts) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const map = {
    YYYY: d.getFullYear(),
    MM: pad(d.getMonth() + 1),
    DD: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
  return pattern.replace(/YYYY|MM|DD|HH|mm|ss/g, (t) => map[t] ?? t);
}

function formatLine(template, a, dateFormat) {
  const pct = Math.round(Number(a.scorePct ?? toPct(a.score)));
  const rawScore = Number(a.score ?? 0);
  const data = {
    user: a.user || "unknown",
    username: a.user || "unknown",
    reason: a.message || a.reason || "",
    message: a.message || a.reason || "",
    score: Number.isFinite(rawScore) ? rawScore : 0,
    score_pct: pct,
    timestamp: fmtDate(a.timestamp, dateFormat),
  };
  return String(template || "{user} {score_pct}% — {reason}").replace(
    /\{(user|username|reason|message|score|score_pct|timestamp)\}/g,
    (_, k) => (data[k] ?? "").toString()
  );
}

export default function GlobalAlertBanner() {
  const nav = useNavigate();
  const { alerts = [], dismissAlert } = useAlerts();
  const { settings: cfg } = useRealtimeSettings() || {};

  if (!Array.isArray(alerts) || alerts.length === 0) return null;

  const title      = cfg?.banner?.title           || "⚠️ Real-Time Threat Alert";
  const maxLines   = Number(cfg?.banner?.maxLines ?? 3);
  const dateFormat = cfg?.banner?.dateFormat      || "YYYY-MM-DD HH:mm";
  const tNormal    = cfg?.banner?.templateNormal  || "{user} triggered anomaly with score {score_pct}% — {reason}";
  const tHigh      = cfg?.banner?.templateHigh    || "🚨 {user} triggered HIGH anomaly ({score_pct}%) — {reason}";

  const latest = alerts.slice(0, Math.max(1, maxLines));

  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 1000,
      background: "var(--im-surface)", border: "1px solid var(--im-border)",
      color: "var(--im-text)", padding: "12px 16px", marginBottom: 8,
      boxShadow: "0 6px 24px rgba(0,0,0,0.2)", borderRadius: 12
    }}>
      <div style={{ fontWeight: 800, marginBottom: 6, color: "var(--im-danger)" }}>
        {title}
      </div>

      <ul style={{ margin: 0, paddingLeft: 16 }}>
        {latest.map((a) => {
          const template = a.severity === "high" ? tHigh : tNormal;
          const line = formatLine(template, a, dateFormat);
          const id = a.id; // provider guarantees an id

          return (
            <li key={id} style={{ margin: "6px 0" }}>
              {line}
              <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                {!!a.userId && (
                  <button
                    onClick={() => nav(`/users/${a.userId}`)}
                    className="px-3 py-1 text-sm rounded"
                    style={{ border: "1px solid var(--im-border)", background: "var(--im-surface)" }}
                  >
                    View user
                  </button>
                )}
                <button
                  onClick={() => dismissAlert(id)}
                  className="px-3 py-1 text-sm rounded"
                  style={{ border: "1px solid var(--im-border)", background: "var(--im-surface)" }}
                >
                  Dismiss
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
