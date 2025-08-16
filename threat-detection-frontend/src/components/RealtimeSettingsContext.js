// // src/components/RealtimeSettingsContext.jsx
// import React, {
//   createContext,
//   useContext,
//   useEffect,
//   useMemo,
//   useState,
//   useCallback,
// } from "react";
// import axios from "axios";
// import { getToken } from "./authStorage";
//
// /**
//  * Resolve API base once (supports Vite `VITE_API_BASE` and CRA `REACT_APP_API_BASE`).
//  * Empty string means "same-origin".
//  */
// const API_BASE =
//   (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
//   process.env.REACT_APP_API_BASE ||
//   "";
//
// async function fetchRealtimeSettings() {
//   const r = await fetch(`${API_BASE}/api/realtime-settings`, {
//     headers: { Authorization: `Bearer ${getToken()}` }
//   });
//   if (!r.ok) throw new Error(`settings ${r.status}`);
//   return r.json();
// }
//
// /** UI defaults (client-side) */
// export const DEFAULTS = {
//   scoreHighThreshold: 60,
//   flash: {
//     enabled: true,
//     colorA: "#ffffff",
//     colorB: "#b91c1c",
//     opacity: 0.35,
//     speedMs: 700,
//     totalMs: 12000,
//   },
//   sound: {
//     enabled: true,
//     normal: {
//       url: "/sounds/notification-alert-2-331726.mp3",
//       volume: 0.55,
//       repeatMs: 0,
//       maxDurationMs: 4000,
//     },
//     high: {
//       url: "/sounds/siren-alert-96052.mp3",
//       volume: 0.75,
//       repeatMs: 1500,
//       maxDurationMs: 10000,
//     },
//   },
//   banner: {
//     title: "⚠️ Real-Time Threat Alert",
//     templateNormal:
//       "{user} triggered anomaly with score {score_pct}% — {reason}",
//     templateHigh:
//       "🚨 {user} triggered HIGH anomaly ({score_pct}%) — {reason}",
//     maxLines: 3,
//     dateFormat: "YYYY-MM-DD HH:mm",
//   },
// };
//
// const LS_KEY = "im_realtime_settings";
//
// const Ctx = createContext(null);
// export const useRealtimeSettings = () => useContext(Ctx);
//
// export function RealtimeSettingsProvider({ children }) {
//   // Boot fast from localStorage so the page renders; server will override next.
//   const [settings, setSettings] = useState(() => {
//     try {
//       return JSON.parse(localStorage.getItem(LS_KEY)) || DEFAULTS;
//     } catch {
//       return DEFAULTS;
//     }
//   });
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState(null);
//
//   // ----- GET (server wins) -----
//   useEffect(() => {
//     let mounted = true;
//     (async () => {
//       try {
//         setLoading(true);
//         setError(null);
//         const token = getToken();
//         if (!token) return;
//
//         const res = await axios.get(`${API_BASE}/api/realtime-settings/`, {
//           headers: { Authorization: `Bearer ${token}` },
//         });
//
//         if (!mounted) return;
//         if (res?.data) {
//           const server = mapFromApi(res.data);
//           const merged = deepMerge(DEFAULTS, server); // server overrides defaults
//           setSettings(merged);
//           localStorage.setItem(LS_KEY, JSON.stringify(merged));
//         }
//       } catch (e) {
//         // Don't block UI if server not ready
//         setError(e?.message || "Failed to load realtime settings");
//       } finally {
//         if (mounted) setLoading(false);
//       }
//     })();
//     return () => {
//       mounted = false;
//     };
//   }, []);
//
//   // ----- PUT (use server response when available) -----
//   const save = useCallback(async (next) => {
//     // optimistic local update (snappy UI)
//     setSettings(next);
//     localStorage.setItem(LS_KEY, JSON.stringify(next));
//
//     try {
//       const token = getToken();
//       if (!token) return;
//
//       const res = await axios.put(
//         `${API_BASE}/api/realtime-settings/`,
//         mapToApi(next),
//         { headers: { Authorization: `Bearer ${token}` } }
//       );
//
//       if (res?.data) {
//         const server = mapFromApi(res.data);
//         const merged = deepMerge(DEFAULTS, server); // trust server data shape
//         setSettings(merged);
//         localStorage.setItem(LS_KEY, JSON.stringify(merged));
//       }
//     } catch (e) {
//       // keep optimistic settings; consider showing a toast
//       // console.error("Realtime settings save failed:", e);
//     }
//   }, []);
//
//   const value = useMemo(
//     () => ({ settings, save, defaults: DEFAULTS, loading, error }),
//     [settings, save, loading, error]
//   );
//
//   return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
// }
//
// /* ================= Helpers ================= */
//
// /**
//  * deepMerge(base, over) that DOES NOT clobber defaults with `undefined`.
//  * Arrays are replaced, not merged (fits our settings shape).
//  */
// function deepMerge(base, over) {
//   if (
//     !base ||
//     !over ||
//     typeof base !== "object" ||
//     typeof over !== "object" ||
//     Array.isArray(base) ||
//     Array.isArray(over)
//   ) {
//     return over === undefined ? base : over;
//   }
//   const out = { ...base };
//   for (const k of Object.keys(over)) {
//     if (over[k] === undefined) continue; // keep default when server omits a field
//     out[k] = deepMerge(base[k], over[k]);
//   }
//   return out;
// }
//
// /** Map snake_case API -> UI shape */
// function mapFromApi(d) {
//   return {
//     scoreHighThreshold: d.score_high_threshold,
//     flash: {
//       enabled: d.flash_enabled,
//       colorA: d.flash_color_a,
//       colorB: d.flash_color_b,
//       opacity: d.flash_opacity,
//       speedMs: d.flash_speed_ms,
//       totalMs: d.flash_total_ms,
//     },
//     sound: {
//       enabled: d.sound_enabled,
//       normal: {
//         url: d.sound_normal_file_url,
//         volume: d.sound_normal_volume,
//         repeatMs: d.sound_normal_repeat_ms,
//         maxDurationMs: d.sound_normal_max_ms,
//       },
//       high: {
//         url: d.sound_high_file_url,
//         volume: d.sound_high_volume,
//         repeatMs: d.sound_high_repeat_ms,
//         maxDurationMs: d.sound_high_max_ms,
//       },
//     },
//     banner: {
//       title: d.banner_title,
//       templateNormal: d.template_normal,
//       templateHigh: d.template_high,
//       maxLines: d.max_lines,
//       dateFormat: d.date_format,
//     },
//   };
// }
//
// /** Map UI -> snake_case API */
// function mapToApi(s) {
//   return {
//     score_high_threshold: s.scoreHighThreshold,
//     flash_enabled: s.flash.enabled,
//     flash_color_a: s.flash.colorA,
//     flash_color_b: s.flash.colorB,
//     flash_opacity: s.flash.opacity,
//     flash_speed_ms: s.flash.speedMs,
//     flash_total_ms: s.flash.totalMs,
//     sound_enabled: s.sound.enabled,
//     sound_normal_file_url: s.sound.normal.url,
//     sound_normal_volume: s.sound.normal.volume,
//     sound_normal_repeat_ms: s.sound.normal.repeatMs,
//     sound_normal_max_ms: s.sound.normal.maxDurationMs,
//     sound_high_file_url: s.sound.high.url,
//     sound_high_volume: s.sound.high.volume,
//     sound_high_repeat_ms: s.sound.high.repeatMs,
//     sound_high_max_ms: s.sound.high.maxDurationMs,
//     banner_title: s.banner.title,
//     template_normal: s.banner.templateNormal,
//     template_high: s.banner.templateHigh,
//     max_lines: s.banner.maxLines,
//     date_format: s.banner.dateFormat,
//   };
// }


// src/components/RealtimeSettingsContext.jsx
// src/components/RealtimeSettingsContext.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import axios from "axios";
import { getToken } from "./authStorage";

/**
 * Resolve API base once (supports Vite `VITE_API_BASE` and CRA `REACT_APP_API_BASE`).
 * Empty string means "same-origin".
 */
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE) ||
  process.env.REACT_APP_API_BASE ||
  "";

/** UI defaults (client-side) */
export const DEFAULTS = {
  scoreHighThreshold: 60,
  flash: {
    enabled: true,
    colorA: "#ffffff",
    colorB: "#b91c1c",
    opacity: 0.35,
    speedMs: 700,
    totalMs: 12000,
  },
  sound: {
    enabled: true,
    normal: {
      url: "/sounds/notification-alert-2-331726.mp3",
      volume: 0.55,
      repeatMs: 0,
      maxDurationMs: 4000,
    },
    high: {
      url: "/sounds/siren-alert-96052.mp3",
      volume: 0.75,
      repeatMs: 1500,
      maxDurationMs: 10000,
    },
  },
  banner: {
    title: "⚠️ Real-Time Threat Alert",
    templateNormal:
      "{user} triggered anomaly with score {score_pct}% — {reason}",
    templateHigh:
      "🚨 {user} triggered HIGH anomaly ({score_pct}%) — {reason}",
    maxLines: 3,
    dateFormat: "YYYY-MM-DD HH:mm",
  },
};

const LS_KEY = "im_realtime_settings";

const Ctx = createContext(null);
export const useRealtimeSettings = () => useContext(Ctx);

export function RealtimeSettingsProvider({ children }) {
  // Boot fast from localStorage so the page renders; server will override next.
  const [settings, setSettings] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || DEFAULTS;
    } catch {
      return DEFAULTS;
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ----- GET (server wins) -----
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const token = getToken();
        if (!token) return;

        const res = await axios.get(`${API_BASE}/api/realtime-settings/`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!mounted) return;
        if (res?.data) {
          const server = mapFromApi(res.data);
          const merged = deepMerge(DEFAULTS, server); // server overrides defaults
          setSettings(merged);
          localStorage.setItem(LS_KEY, JSON.stringify(merged));
        }
      } catch (e) {
        setError(e?.message || "Failed to load realtime settings");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // ----- PUT (use server response when available) -----
  const save = useCallback(async (next) => {
    // optimistic local update (snappy UI)
    setSettings(next);
    localStorage.setItem(LS_KEY, JSON.stringify(next));

    try {
      const token = getToken();
      if (!token) return;

      const res = await axios.put(
        `${API_BASE}/api/realtime-settings/`,
        mapToApi(next),
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res?.data) {
        const server = mapFromApi(res.data);
        const merged = deepMerge(DEFAULTS, server); // trust server data shape
        setSettings(merged);
        localStorage.setItem(LS_KEY, JSON.stringify(merged));
      }
    } catch {
      // keep optimistic settings
    }
  }, []);

  const value = useMemo(
    () => ({ settings, save, defaults: DEFAULTS, loading, error }),
    [settings, save, loading, error]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/* ================= Helpers ================= */

/**
 * deepMerge(base, over) that DOES NOT clobber defaults with `undefined`.
 * Arrays are replaced, not merged (fits our settings shape).
 */
function deepMerge(base, over) {
  if (
    !base ||
    !over ||
    typeof base !== "object" ||
    typeof over !== "object" ||
    Array.isArray(base) ||
    Array.isArray(over)
  ) {
    return over === undefined ? base : over;
  }
  const out = { ...base };
  for (const k of Object.keys(over)) {
    if (over[k] === undefined) continue; // keep default when server omits a field
    out[k] = deepMerge(base[k], over[k]);
  }
  return out;
}

// null -> undefined helper so deepMerge keeps defaults/local values
const nz = (v) => (v === null || v === undefined ? undefined : v);

/** Map snake_case API -> UI shape */
function mapFromApi(d = {}) {
  return {
    scoreHighThreshold: d.score_high_threshold,
    flash: {
      enabled: d.flash_enabled,
      colorA: d.flash_color_a,
      colorB: d.flash_color_b,
      opacity: d.flash_opacity,
      speedMs: d.flash_speed_ms,
      totalMs: d.flash_total_ms,
    },
    sound: {
      enabled: d.sound_enabled,
      normal: {
        // prefer DB URL, fall back to uploaded file URL
        url: nz(d.sound_normal_url) || nz(d.sound_normal_file_url),
        volume: d.sound_normal_volume,
        repeatMs: d.sound_normal_repeat_ms,
        maxDurationMs: d.sound_normal_max_ms,
      },
      high: {
        url: nz(d.sound_high_url) || nz(d.sound_high_file_url),
        volume: d.sound_high_volume,
        repeatMs: d.sound_high_repeat_ms,
        maxDurationMs: d.sound_high_max_ms,
      },
    },
    banner: {
      title: d.banner_title,
      templateNormal: d.template_normal,
      templateHigh: d.template_high,
      maxLines: d.max_lines,
      dateFormat: d.date_format,
    },
  };
}

/** Map UI -> snake_case API */
function mapToApi(s) {
  return {
    score_high_threshold: s.scoreHighThreshold,

    flash_enabled: s.flash.enabled,
    flash_color_a: s.flash.colorA,
    flash_color_b: s.flash.colorB,
    flash_opacity: s.flash.opacity,
    flash_speed_ms: s.flash.speedMs,
    flash_total_ms: s.flash.totalMs,

    sound_enabled: s.sound.enabled,

    // NEW: send chosen URLs to DB
    sound_normal_url: s.sound.normal.url,
    sound_high_url:   s.sound.high.url,

    // other sound controls
    sound_normal_volume: s.sound.normal.volume,
    sound_normal_repeat_ms: s.sound.normal.repeatMs,
    sound_normal_max_ms: s.sound.normal.maxDurationMs,
    sound_high_volume: s.sound.high.volume,
    sound_high_repeat_ms: s.sound.high.repeatMs,
    sound_high_max_ms: s.sound.high.maxDurationMs,

    banner_title: s.banner.title,
    template_normal: s.banner.templateNormal,
    template_high: s.banner.templateHigh,
    max_lines: s.banner.maxLines,
    date_format: s.banner.dateFormat,
  };
}
