// src/components/GlobalAlertsProvider.js
import React, {
  createContext, useContext, useEffect, useMemo, useRef, useState, useCallback,
} from "react";
import { getToken } from "./authStorage";
import { useRealtimeSettings } from "./RealtimeSettingsContext";

/* ───────────────────── small utils ───────────────────── */
const get = (obj, path) => {
  const parts = path.split(".");
  let cur = obj;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
    else return undefined;
  }
  return cur;
};

const first = (obj, paths, fallback) => {
  for (const p of paths) {
    const v = get(obj, p);
    if (v !== undefined && v !== null) return v;
  }
  return fallback;
};

const toPct = (raw) => {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n <= 1 ? n * 100 : n;
};

const extractScore = (m) => {
  const candidates = [
    get(m, "adjusted_probability"),
    get(m, "adjustedProbability"),
    get(m, "probability"),
    get(m, "prob"),
    get(m, "p"),
    get(m, "confidence"),
    get(m, "score_percent"),
    get(m, "scorePercent"),
    get(m, "score_pct"),
    get(m, "scorePct"),
    get(m, "alert_score"),
    get(m, "score"),
    get(m, "data.score"),
    get(m, "data.score_pct"),
    get(m, "data.score_percent"),
    get(m, "payload.score"),
    get(m, "payload.score_pct"),
    get(m, "payload.score_percent"),
    get(m, "alert.score"),
    get(m, "result.score"),
    get(m, "details.score"),
  ]
    .map((v) => (v === undefined || v === null ? NaN : Number(v)))
    .filter((n) => Number.isFinite(n));

  if (candidates.length === 0) return 0;
  return Math.max(...candidates);
};

const extractUser     = (m) => first(m, ["user","username","user_name","data.user","payload.user","actor"], "unknown");
const extractUserId   = (m) => first(m, ["userId","user_id","data.userId","data.user_id","payload.userId","payload.user_id"], undefined);
const extractMessage  = (m) => first(m, ["message","reason","text","event","data.message","payload.message"], "");
const extractSeverity = (m, pct, cut) => {
  const explicit = String(first(m, ["severity","level","data.severity","payload.severity"], "")).toLowerCase();
  return explicit === "high" || pct >= cut ? "high" : "normal";
};
const extractId = (m, pct) =>
  first(m, ["id","alert_id","uuid","data.id","payload.id"], null) ??
  `${extractUser(m)}|${extractMessage(m)}|${first(m, ["timestamp","time","ts","data.timestamp","payload.timestamp"], "")}|${pct}`;

const normalizeTimestamp = (t) => {
  if (t === undefined || t === null) return new Date().toISOString();
  const num = Number(t);
  if (Number.isFinite(num)) {
    const ms = num < 1e12 ? num * 1000 : num;
    return new Date(ms).toISOString();
  }
  const d = new Date(t);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

/* ───────────────────────────── env (vite + cra) ───────────────────────────── */
const fromViteBase = (typeof import.meta !== "undefined" && import.meta.env?.VITE_WS_BASE) || undefined;
const fromCraBase  = process.env.REACT_APP_WS_BASE || undefined;
const fromVitePath = (typeof import.meta !== "undefined" && import.meta.env?.VITE_WS_PATH) || undefined;
const fromCraPath  = process.env.REACT_APP_WS_PATH || undefined;

const WS_BASE = fromViteBase || fromCraBase || "";           // empty => same host
const WS_PATH = fromVitePath || fromCraPath || "/ws/threats/";

console.log("[WS env]", { fromViteBase, fromCraBase, fromVitePath, fromCraPath, WS_BASE, WS_PATH });

/* ───────────────────────────────── context / hook ───────────────────────────────── */
const AlertsContext = createContext(null);
export function useAlerts() {
  const ctx = useContext(AlertsContext);
  if (!ctx) throw new Error("useAlerts must be used inside <GlobalAlertsProvider>");
  return ctx;
}

/* ───────────────────────────────── component ───────────────────────────────── */
export default function GlobalAlertsProvider({ children }) {
  const [alerts, setAlerts] = useState([]);
  const [emergency, setEmergency] = useState(false);
  const [soundMuted, setSoundMuted] = useState(() => localStorage.getItem("im_sound_muted") === "1");
  const { settings: rs } = useRealtimeSettings() || {};

  /* ========== Audio ========== */
  const normalAudioRef = useRef(null);
  const highAudioRef   = useRef(null);
  const timersRef = useRef({ nRepeat:null, nStop:null, hRepeat:null, hStop:null });
  const [soundReady, setSoundReady] = useState(false);
  const DEFAULT_NORMAL_URL = "/sounds/notification-alert-2-331726.mp3";
  const DEFAULT_HIGH_URL   = "/sounds/siren-alert-96052.mp3";

  useEffect(() => {
    const mk = (src) => { const a = new Audio(src); a.preload = "auto"; return a; };
    normalAudioRef.current = mk(DEFAULT_NORMAL_URL);
    highAudioRef.current   = mk(DEFAULT_HIGH_URL);

    const tryPlayPauseSilent = async (el) => {
      if (!el) return false;
      try {
        const prevMuted = el.muted;
        const prevVol = el.volume;
        el.muted = true;
        el.volume = 0;
        if (!el.src) el.src = DEFAULT_NORMAL_URL;
        await el.play();
        el.pause();
        el.currentTime = 0;
        el.muted = prevMuted;
        el.volume = prevVol;
        return true;
      } catch { return false; }
    };

    let unlocked = false;
    const finish = () => {
      if (unlocked) return;
      unlocked = true;
      setSoundReady(true);
      for (const ev of ["pointerdown","mousedown","click","keydown","touchstart"]) {
        window.removeEventListener(ev, onGesture, true);
      }
    };

    const onGesture = async () => {
      await Promise.allSettled([
        tryPlayPauseSilent(normalAudioRef.current),
        tryPlayPauseSilent(highAudioRef.current),
      ]);
      finish();
    };

    (async () => {
      await Promise.allSettled([
        tryPlayPauseSilent(normalAudioRef.current),
        tryPlayPauseSilent(highAudioRef.current),
      ]);
      finish();
    })();

    for (const ev of ["pointerdown","mousedown","click","keydown","touchstart"]) {
      window.addEventListener(ev, onGesture, { once: true, capture: true });
    }
    return () => {
      for (const ev of ["pointerdown","mousedown","click","keydown","touchstart"]) {
        window.removeEventListener(ev, onGesture, true);
      }
    };
  }, []);

  const ensureUnlocked = useCallback(async () => {
    if (soundReady) return true;
    const tryPlayPauseSilent = async (el) => {
      if (!el) return false;
      try {
        const prevMuted = el.muted;
        const prevVol = el.volume;
        el.muted = true;
        el.volume = 0;
        if (!el.src) el.src = DEFAULT_NORMAL_URL;
        await el.play();
        el.pause();
        el.currentTime = 0;
        el.muted = prevMuted;
        el.volume = prevVol;
        return true;
      } catch { return false; }
    };
    const results = await Promise.allSettled([
      tryPlayPauseSilent(normalAudioRef.current),
      tryPlayPauseSilent(highAudioRef.current),
    ]);
    const ok = results.some(r => r.status === "fulfilled" && r.value === true);
    if (ok) setSoundReady(true);
    return ok;
  }, [soundReady]);

  useEffect(() => {
    localStorage.setItem("im_sound_muted", soundMuted ? "1" : "0");
  }, [soundMuted]);

  const clearTimers = () => {
    const t = timersRef.current;
    if (t.nRepeat) clearInterval(t.nRepeat);
    if (t.nStop)   clearTimeout(t.nStop);
    if (t.hRepeat) clearInterval(t.hRepeat);
    if (t.hStop)   clearTimeout(t.hStop);
    timersRef.current = { nRepeat:null, nStop:null, hRepeat:null, hStop:null };
  };
  const playOnce = (el) => { try { el.currentTime = 0; void el.play(); } catch {} };

  const playNormal = useCallback(async () => {
    if (soundMuted || rs?.sound?.enabled === false) return;
    if (!soundReady) { await ensureUnlocked(); }
    const cfg = rs?.sound?.normal || {};
    const el = normalAudioRef.current;
    el.src = cfg.url || DEFAULT_NORMAL_URL;
    el.volume = Number(cfg.volume ?? 0.55);
    playOnce(el);
    clearTimers();
    const repeatMs = Number(cfg.repeatMs ?? 0);
    const maxMs    = Number(cfg.maxDurationMs ?? 0);
    if (repeatMs > 0) timersRef.current.nRepeat = setInterval(() => playOnce(el), repeatMs);
    const cap = repeatMs > 0 && (!maxMs || maxMs <= 0) ? 10000 : maxMs;
    if (cap > 0) timersRef.current.nStop = setTimeout(() => { try { el.pause(); } catch {} }, cap);
  }, [rs?.sound?.normal, rs?.sound?.enabled, soundMuted, soundReady, ensureUnlocked]);

  const playHigh = useCallback(async () => {
    if (soundMuted || rs?.sound?.enabled === false) return;
    if (!soundReady) { await ensureUnlocked(); }
    const cfg = rs?.sound?.high || {};
    const el = highAudioRef.current;
    el.src = cfg.url || DEFAULT_HIGH_URL;
    el.volume = Number(cfg.volume ?? 0.75);
    playOnce(el);
    clearTimers();
    const repeatMs = Number(cfg.repeatMs ?? 1500);
    const maxMs    = Number(cfg.maxDurationMs ?? 10000);
    if (repeatMs > 0) timersRef.current.hRepeat = setInterval(() => playOnce(el), repeatMs);
    const cap = repeatMs > 0 && (!maxMs || maxMs <= 0) ? 10000 : maxMs;
    if (cap > 0) timersRef.current.hStop = setTimeout(() => { try { el.pause(); } catch {} }, cap);
  }, [rs?.sound?.high, rs?.sound?.enabled, soundMuted, soundReady, ensureUnlocked]);

  /* ========== Flash class toggle ========== */
  useEffect(() => {
    const on = emergency && (rs?.flash?.enabled ?? true);
    const root = document.getElementById("root");
    document.body.classList.toggle("emergency-hard-flash", !!on);
    root?.classList.toggle("emergency-hard-flash", !!on);
    return () => {
      document.body.classList.remove("emergency-hard-flash");
      root?.classList.remove("emergency-hard-flash");
    };
  }, [emergency, rs?.flash?.enabled]);

  /* ========== dismiss / dedupe ========== */
  const seenRef = useRef(new Set());
  const dismissedRef = useRef(new Set());
  const remember = (id) => {
    seenRef.current.add(id);
    if (seenRef.current.size > 500) {
      const it = seenRef.current.values();
      seenRef.current.delete(it.next().value);
    }
  };
  const dismissAlert = useCallback((id) => {
    dismissedRef.current.add(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  /* ========== WebSocket ========== */
  const wsRef = useRef(null);
  const hbRef = useRef(null);
  const retryRef = useRef(0);
  const reconnectRef = useRef(null);
  const lastTokenRef = useRef(null);

  const startHeartbeat = (ws) => {
    if (hbRef.current) clearInterval(hbRef.current);
    hbRef.current = setInterval(() => {
      try { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" })); } catch {}
    }, 20000);
  };
  const stopHeartbeat = () => { if (hbRef.current) clearInterval(hbRef.current); hbRef.current = null; };

  const buildWsUrl = (tokenRaw) => {
    const token = String(tokenRaw || "").trim(); // ⬅️ IMPORTANT: trim stray spaces
    const { protocol, host } = window.location;
    const wsProto = protocol === "https:" ? "wss" : "ws";

    let baseHost = WS_BASE || host;
    if (baseHost.includes("://")) {
      baseHost = baseHost
        .replace(/^http:\/\//i, `${wsProto}://`)
        .replace(/^https:\/\//i, `${wsProto}://`)
        .replace(/^ws:\/\//i, `${wsProto}://`)
        .replace(/^wss:\/\//i, `${wsProto}://`);
    } else {
      baseHost = `${wsProto}://${baseHost}`;
    }

    const path = WS_PATH.startsWith("/") ? WS_PATH : `/${WS_PATH}`;
    return `${baseHost}${path}?token=${encodeURIComponent(token)}`;
  };

  // local test helper (never used automatically)
  const pushAlert = useCallback((overrides = {}) => {
    const now = new Date().toISOString();
    const item = {
      id: `test|${now}|${Math.random().toString(36).slice(2, 8)}`,
      user: overrides.user ?? "demo.user",
      userId: overrides.userId ?? 1,
      message: overrides.message ?? "Simulated alert",
      score: overrides.score ?? 0.9,
      scorePct: overrides.scorePct ?? 90,
      severity: overrides.severity ?? "high",
      timestamp: now,
      __system: !!overrides.__system, // internal flag
    };
    setAlerts((prev) => [item, ...prev].slice(0, 50));
  }, []);

  const handleMessage = useCallback((e) => {
    let msg; try { msg = JSON.parse(e.data); } catch { return; }
    window.__lastMsg = msg;
    console.log("[WS raw]", msg);

    // Ignore explicit system/silent messages if backend ever sends them
    const isSystem = !!(msg.system || msg.silent || msg.__system);
    if (isSystem) return;

    const pct = toPct(extractScore(msg));
    const highCut = Number(rs?.scoreHighThreshold ?? 60);
    const severity = extractSeverity(msg, pct, highCut);

    const id = String(extractId(msg, pct));
    if (dismissedRef.current.has(id) || seenRef.current.has(id)) return;

    const item = {
      id,
      user: extractUser(msg),
      userId: extractUserId(msg),
      message: extractMessage(msg),
      score: extractScore(msg),
      scorePct: pct,
      severity,
      timestamp: normalizeTimestamp(
        first(
          msg,
          ["timestamp","time","ts","created_at","createdAt","data.timestamp","payload.timestamp","data.created_at","payload.created_at"],
          undefined
        )
      ),
    };

    remember(id);
    setAlerts((prev) => [item, ...prev].slice(0, 50));

    // Don’t make noise for system-ish users/messages (extra guard)
    const looksSystem = (String(item.user).toLowerCase() === "system") ||
                        /connected/i.test(item.message || "");
    if (rs?.sound?.enabled !== false && !looksSystem) {
      (severity === "high" ? playHigh : playNormal)();
    }

    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && severity === "high" && (rs?.flash?.enabled ?? true) && !looksSystem) {
      setEmergency(true);
      const total = Number(rs?.flash?.totalMs ?? 12000);
      window.clearTimeout(handleMessage._flashT);
      handleMessage._flashT = window.setTimeout(() => setEmergency(false), total);
    }
  }, [rs, playHigh, playNormal]);

  const openSocket = useCallback((tokenRaw) => {
    const token = (tokenRaw || "").trim();
    if (!token) return;
    if (wsRef.current && [WebSocket.OPEN, WebSocket.CONNECTING].includes(wsRef.current.readyState)) return;

    const url = buildWsUrl(token);
    console.log("[WS] connecting:", url);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[WS] open");
      retryRef.current = 0;
      startHeartbeat(ws);

      // 🔇 NO fake banner, NO sound on connect
      // If you want a banner without sound, you could do:
      // pushAlert({ user: "system", message: "WebSocket CONNECTED", severity: "normal", score: 0.5, scorePct: 50, __system: true });
    };
    ws.onmessage = handleMessage;
    ws.onerror = (err) => { console.warn("[WS] error", err); try { ws.close(); } catch {} };
    ws.onclose = (ev) => {
      console.warn("[WS] close:", ev?.code, ev?.reason);
      stopHeartbeat();
      wsRef.current = null;
      const r = Math.min(retryRef.current + 1, 6);
      retryRef.current = r;
      const delay = 500 * Math.pow(2, r - 1);
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      reconnectRef.current = setTimeout(() => openSocket(getToken()), delay);
    };
  }, [handleMessage]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const token = (getToken() || "").trim();
      if (token && token !== lastTokenRef.current) {
        lastTokenRef.current = token;
        openSocket(token);
      }
    };
    tick();
    const id = setInterval(tick, 3000);
    const onStorage = () => {
      const token = (getToken() || "").trim();
      if (token && token !== lastTokenRef.current) {
        lastTokenRef.current = token;
        openSocket(token);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("storage", onStorage);
      clearTimers();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      try { wsRef.current?.close(); } catch {}
      wsRef.current = null;
      stopHeartbeat();
    };
  }, [openSocket]);

  // Manual UI smoke test (never automatic)
  useEffect(() => {
    window.__injectTest = async (severity = "high") => {
      await ensureUnlocked();
      pushAlert({
        severity,
        message: severity === "high" ? "Simulated HIGH threat" : "Simulated normal event",
        score: severity === "high" ? 0.9 : 0.6,
        scorePct: severity === "high" ? 90 : 60,
      });
      if (rs?.sound?.enabled !== false) {
        (severity === "high" ? playHigh : playNormal)();
      }
      if (severity === "high" && (rs?.flash?.enabled ?? true)) {
        setEmergency(true);
        const total = Number(rs?.flash?.totalMs ?? 12000);
        const t = setTimeout(() => setEmergency(false), total);
        return () => clearTimeout(t);
      }
      return undefined;
    };
    const onKey = (e) => { if (e.altKey && e.key.toLowerCase() === "a") window.__injectTest("high"); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); delete window.__injectTest; };
  }, [pushAlert, rs?.sound?.enabled, rs?.flash?.enabled, rs?.flash?.totalMs, playHigh, playNormal, ensureUnlocked]);

  useEffect(() => {
    if (soundMuted || rs?.sound?.enabled === false) {
      try { normalAudioRef.current?.pause(); } catch {}
      try { highAudioRef.current?.pause(); } catch {}
      clearTimers();
    }
  }, [soundMuted, rs?.sound?.enabled]);

  const value = useMemo(() => ({
    alerts, setAlerts,
    emergency, setEmergency,
    soundMuted,
    toggleSound: () => setSoundMuted((m) => !m),
    setMuted: (m) => setSoundMuted(!!m),
    dismissAlert,
  }), [alerts, emergency, soundMuted, dismissAlert]);

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

