// import React from "react";
// import { useRealtimeSettings } from "./RealtimeSettingsContext";
//
// const SOUND_CHOICES = [
//   { label: "Soft Notification", value: "/sounds/notification-alert-2-331726.mp3" },
//   { label: "Siren Alert",       value: "/sounds/siren-alert-96052.mp3" },
//   { label: "Beep (alt)",        value: "/sounds/alert-33762.mp3" },
//   { label: "Extraterrestrial",  value: "/sounds/extraterrestrial-alert-sound-287337.mp3" },
// ];
//
// export default function RealtimeSettingsPage() {
//   const ctx = useRealtimeSettings();
//
//   if (!ctx) {
//     return (
//       <div className="imdash-panel" style={{ maxWidth: 900 }}>
//         <h2 className="imdash-panel-title">Realtime Settings</h2>
//         <div className="im-banner im-banner--error">
//           The RealtimeSettingsProvider is not mounted. Wrap protected routes with{" "}
//           <code>&lt;RealtimeSettingsProvider&gt;...&lt;/RealtimeSettingsProvider&gt;</code>.
//         </div>
//       </div>
//     );
//   }
//
//   const { settings: s, save, defaults, loading } = ctx;
//
//   const change = (path, val) => {
//     const base = typeof structuredClone === "function" ? structuredClone(s) : JSON.parse(JSON.stringify(s));
//     const parts = path.split(".");
//     let cur = base;
//     // while (parts.length > 1) cur = cur[parts.shift()];
//       while (parts.length > 1) {
//      const p = parts.shift();
//      cur[p] = cur[p] ?? {};
//      cur = cur[p];
//    }
//     cur[parts[0]] = val;
//     save(base);
//   };
//
//   return (
//     <div className="imdash-panel" style={{ maxWidth: 900 }}>
//       <h2 className="imdash-panel-title">Realtime Alert Settings</h2>
//       {loading && <div className="im-banner im-banner--ok">Loading settings…</div>}
//
//       {/* Threshold */}
//       <section className="im-card">
//         <h3 className="im-card-title">Thresholds</h3>
//         <label className="im-label">High severity if score ≥</label>
//         <input
//           className="im-input"
//           type="number"
//           min={1}
//           max={100}
//           value={s.scoreHighThreshold}
//           onChange={(e) => change("scoreHighThreshold", Number(e.target.value))}
//         />
//       </section>
//
//       {/* Banner / Text */}
//       <section className="im-card">
//         <h3 className="im-card-title">Banner & Text</h3>
//         <div className="im-grid im-grid--2col">
//           <div>
//             <label className="im-label">Title</label>
//             <input className="im-input" value={s.banner.title} onChange={(e)=>change("banner.title", e.target.value)} />
//           </div>
//           <div>
//             <label className="im-label">Date format</label>
//             <input className="im-input" value={s.banner.dateFormat} onChange={(e)=>change("banner.dateFormat", e.target.value)} />
//           </div>
//         </div>
//         <div className="im-grid im-grid--2col" style={{ marginTop: ".75rem" }}>
//           <div>
//             <label className="im-label">Normal template</label>
//             <input className="im-input" value={s.banner.templateNormal} onChange={(e)=>change("banner.templateNormal", e.target.value)} />
//           </div>
//           <div>
//             <label className="im-label">High template</label>
//             <input className="im-input" value={s.banner.templateHigh} onChange={(e)=>change("banner.templateHigh", e.target.value)} />
//           </div>
//         </div>
//         <label className="im-label" style={{ marginTop: ".75rem" }}>Max lines</label>
//         <input className="im-input" type="number" min={1} max={10} value={s.banner.maxLines}
//                onChange={(e)=>change("banner.maxLines", Number(e.target.value))}/>
//       </section>
//
//       {/* Sounds */}
//       <section className="im-card">
//         <h3 className="im-card-title">Sounds</h3>
//         <label className="im-label">
//           <input
//             type="checkbox"
//             checked={s.sound.enabled}
//             onChange={(e) => change("sound.enabled", e.target.checked)}
//           />
//           &nbsp; Enable sounds
//         </label>
//
//         <div className="im-grid im-grid--2col">
//           <div className="im-card">
//             <strong>Normal severity</strong>
//             <label className="im-label">File (built-in)</label>
//             <select
//               className="im-input"
//               value={s.sound.normal.url}
//               onChange={(e) => change("sound.normal.url", e.target.value)}
//             >
//               {SOUND_CHOICES.map((o) => (
//                 <option key={o.value} value={o.value}>{o.label}</option>
//               ))}
//             </select>
//
//             <label className="im-label">Volume (0–1)</label>
//             <input
//               className="im-input"
//               type="number" step="0.05" min={0} max={1}
//               value={s.sound.normal.volume}
//               onChange={(e) => change("sound.normal.volume", Number(e.target.value))}
//             />
//
//             <label className="im-label">Repeat every (ms, 0 = once)</label>
//             <input
//               className="im-input"
//               type="number" min={0}
//               value={s.sound.normal.repeatMs}
//               onChange={(e) => change("sound.normal.repeatMs", Number(e.target.value))}
//             />
//
//             <label className="im-label">Max duration (ms)</label>
//             <input
//               className="im-input"
//               type="number" min={0}
//               value={s.sound.normal.maxDurationMs}
//               onChange={(e) => change("sound.normal.maxDurationMs", Number(e.target.value))}
//             />
//           </div>
//
//           <div className="im-card">
//             <strong>High severity</strong>
//             <label className="im-label">File (built-in)</label>
//             <select
//               className="im-input"
//               value={s.sound.high.url}
//               onChange={(e) => change("sound.high.url", e.target.value)}
//             >
//               {SOUND_CHOICES.map((o) => (
//                 <option key={o.value} value={o.value}>{o.label}</option>
//               ))}
//             </select>
//
//             <label className="im-label">Volume (0–1)</label>
//             <input
//               className="im-input"
//               type="number" step="0.05" min={0} max={1}
//               value={s.sound.high.volume}
//               onChange={(e) => change("sound.high.volume", Number(e.target.value))}
//             />
//
//             <label className="im-label">Repeat every (ms, 0 = once)</label>
//             <input
//               className="im-input"
//               type="number" min={0}
//               value={s.sound.high.repeatMs}
//               onChange={(e) => change("sound.high.repeatMs", Number(e.target.value))}
//             />
//
//             <label className="im-label">Max duration (ms)</label>
//             <input
//               className="im-input"
//               type="number" min={0}
//               value={s.sound.high.maxDurationMs}
//               onChange={(e) => change("sound.high.maxDurationMs", Number(e.target.value))}
//             />
//           </div>
//         </div>
//       </section>
//
//       {/* Flash */}
//       <section className="im-card">
//         <h3 className="im-card-title">Flash Overlay</h3>
//         <label className="im-label">
//           <input
//             type="checkbox"
//             checked={s.flash.enabled}
//             onChange={(e) => change("flash.enabled", e.target.checked)}
//           />
//           &nbsp; Enable flashing overlay
//         </label>
//
//         <div className="im-grid im-grid--2col">
//           <div>
//             <label className="im-label">Color A</label>
//             <input className="im-input" type="color" value={s.flash.colorA} onChange={(e)=>change("flash.colorA", e.target.value)} />
//           </div>
//           <div>
//             <label className="im-label">Color B</label>
//             <input className="im-input" type="color" value={s.flash.colorB} onChange={(e)=>change("flash.colorB", e.target.value)} />
//           </div>
//         </div>
//
//         <label className="im-label">Opacity (0–1)</label>
//         <input className="im-input" type="number" step="0.05" min={0} max={1}
//                value={s.flash.opacity} onChange={(e)=>change("flash.opacity", Number(e.target.value))} />
//
//         <div className="im-grid im-grid--2col">
//           <div>
//             <label className="im-label">Speed (ms)</label>
//             <input className="im-input" type="number" min={50}
//                    value={s.flash.speedMs} onChange={(e)=>change("flash.speedMs", Number(e.target.value))} />
//           </div>
//           <div>
//             <label className="im-label">Total duration (ms)</label>
//             <input className="im-input" type="number" min={0}
//                    value={s.flash.totalMs} onChange={(e)=>change("flash.totalMs", Number(e.target.value))} />
//           </div>
//         </div>
//       </section>
//
//       <div style={{ display: "flex", gap: 8 }}>
//         <button className="im-btn" onClick={()=>save(defaults)}>Reset to defaults</button>
//       </div>
//     </div>
//   );
// }


// src/components/RealtimeSettingsPage.jsx
import React from "react";
import { useRealtimeSettings } from "./RealtimeSettingsContext";

const SOUND_CHOICES = [
  { label: "Soft Notification", value: "/sounds/notification-alert-2-331726.mp3" },
  { label: "Siren Alert",       value: "/sounds/siren-alert-96052.mp3" },
  { label: "Beep (alt)",        value: "/sounds/alert-33762.mp3" },
  { label: "Extraterrestrial",  value: "/sounds/extraterrestrial-alert-sound-287337.mp3" },
];

// same defaults your GlobalAlertsProvider uses (fallback when URL is empty)
const DEFAULT_NORMAL_URL = "/sounds/notification-alert-2-331726.mp3";
const DEFAULT_HIGH_URL   = "/sounds/siren-alert-96052.mp3";

export default function RealtimeSettingsPage() {
  const ctx = useRealtimeSettings();

  if (!ctx) {
    return (
      <div className="imdash-panel" style={{ maxWidth: 900 }}>
        <h2 className="imdash-panel-title">Realtime Settings</h2>
        <div className="im-banner im-banner--error">
          The RealtimeSettingsProvider is not mounted. Wrap protected routes with{" "}
          <code>&lt;RealtimeSettingsProvider&gt;...&lt;/RealtimeSettingsProvider&gt;</code>.
        </div>
      </div>
    );
  }

  const { settings: s, save, defaults, loading } = ctx;

  const change = (path, val) => {
    const base =
      typeof structuredClone === "function"
        ? structuredClone(s)
        : JSON.parse(JSON.stringify(s));
    const parts = path.split(".");
    let cur = base;
    while (parts.length > 1) {
      const p = parts.shift();
      cur[p] = cur[p] ?? {};
      cur = cur[p];
    }
    cur[parts[0]] = val;
    save(base);
  };

  // --- PREVIEW HELPERS ---
  const playPreview = (kind /* 'normal' | 'high' */) => {
    const cfg = kind === "high" ? s.sound.high : s.sound.normal;
    const url = cfg.url || (kind === "high" ? DEFAULT_HIGH_URL : DEFAULT_NORMAL_URL);
    try {
      const el = new Audio(url);
      el.volume = Number(cfg.volume ?? (kind === "high" ? 0.75 : 0.55));

      // repeat & cap, like GlobalAlertsProvider
      const repeatMs = Number(
        cfg.repeatMs ?? (kind === "high" ? 1500 : 0)
      );
      const maxMs = Number(
        cfg.maxDurationMs ?? (kind === "high" ? 10000 : 4000)
      );

      const playOnce = () => {
        try {
          el.currentTime = 0;
          const p = el.play();
          if (p && p.catch) p.catch(() => {});
        } catch {}
      };

      playOnce();
      let repTimer, stopTimer;
      if (repeatMs > 0) repTimer = setInterval(playOnce, repeatMs);
      const cap = repeatMs > 0 && (!maxMs || maxMs <= 0) ? 10000 : maxMs;
      if (cap > 0) {
        stopTimer = setTimeout(() => {
          try {
            el.pause();
          } catch {}
          if (repTimer) clearInterval(repTimer);
          if (stopTimer) clearTimeout(stopTimer);
        }, cap);
      }
    } catch (e) {
      console.warn("[preview] failed:", e);
    }
  };

  return (
    <div className="imdash-panel" style={{ maxWidth: 900 }}>
      <h2 className="imdash-panel-title">Realtime Alert Settings</h2>
      {loading && <div className="im-banner im-banner--ok">Loading settings…</div>}

      {/* Threshold */}
      <section className="im-card">
        <h3 className="im-card-title">Thresholds</h3>
        <label className="im-label">High severity if score ≥</label>
        <input
          className="im-input"
          type="number"
          min={1}
          max={100}
          value={s.scoreHighThreshold}
          onChange={(e) => change("scoreHighThreshold", Number(e.target.value))}
        />
      </section>

      {/* Banner / Text */}
      <section className="im-card">
        <h3 className="im-card-title">Banner & Text</h3>
        <div className="im-grid im-grid--2col">
          <div>
            <label className="im-label">Title</label>
            <input
              className="im-input"
              value={s.banner.title}
              onChange={(e) => change("banner.title", e.target.value)}
            />
          </div>
          <div>
            <label className="im-label">Date format</label>
            <input
              className="im-input"
              value={s.banner.dateFormat}
              onChange={(e) => change("banner.dateFormat", e.target.value)}
            />
          </div>
        </div>
        <div className="im-grid im-grid--2col" style={{ marginTop: ".75rem" }}>
          <div>
            <label className="im-label">Normal template</label>
            <input
              className="im-input"
              value={s.banner.templateNormal}
              onChange={(e) => change("banner.templateNormal", e.target.value)}
            />
          </div>
          <div>
            <label className="im-label">High template</label>
            <input
              className="im-input"
              value={s.banner.templateHigh}
              onChange={(e) => change("banner.templateHigh", e.target.value)}
            />
          </div>
        </div>
        <label className="im-label" style={{ marginTop: ".75rem" }}>
          Max lines
        </label>
        <input
          className="im-input"
          type="number"
          min={1}
          max={10}
          value={s.banner.maxLines}
          onChange={(e) => change("banner.maxLines", Number(e.target.value))}
        />
      </section>

      {/* Sounds */}
      <section className="im-card">
        <h3 className="im-card-title">Sounds</h3>
        <label className="im-label">
          <input
            type="checkbox"
            checked={s.sound.enabled}
            onChange={(e) => change("sound.enabled", e.target.checked)}
          />
          &nbsp; Enable sounds
        </label>

        <div className="im-grid im-grid--2col">
          <div className="im-card">
            <strong>Normal severity</strong>

            <label className="im-label">File (built-in)</label>
            <select
              className="im-input"
              value={s.sound.normal.url}
              onChange={(e) => change("sound.normal.url", e.target.value)}
            >
              {SOUND_CHOICES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className="im-label">Volume (0–1)</label>
            <input
              className="im-input"
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={s.sound.normal.volume}
              onChange={(e) => change("sound.normal.volume", Number(e.target.value))}
            />

            <label className="im-label">Repeat every (ms, 0 = once)</label>
            <input
              className="im-input"
              type="number"
              min={0}
              value={s.sound.normal.repeatMs}
              onChange={(e) => change("sound.normal.repeatMs", Number(e.target.value))}
            />

            <label className="im-label">Max duration (ms)</label>
            <input
              className="im-input"
              type="number"
              min={0}
              value={s.sound.normal.maxDurationMs}
              onChange={(e) =>
                change("sound.normal.maxDurationMs", Number(e.target.value))
              }
            />

            <div style={{ marginTop: 8 }}>
              <button
                className="im-btn"
                type="button"
                onClick={() => playPreview("normal")}
              >
                ▶︎ Preview normal
              </button>
            </div>
          </div>

          <div className="im-card">
            <strong>High severity</strong>

            <label className="im-label">File (built-in)</label>
            <select
              className="im-input"
              value={s.sound.high.url}
              onChange={(e) => change("sound.high.url", e.target.value)}
            >
              {SOUND_CHOICES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <label className="im-label">Volume (0–1)</label>
            <input
              className="im-input"
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={s.sound.high.volume}
              onChange={(e) => change("sound.high.volume", Number(e.target.value))}
            />

            <label className="im-label">Repeat every (ms, 0 = once)</label>
            <input
              className="im-input"
              type="number"
              min={0}
              value={s.sound.high.repeatMs}
              onChange={(e) => change("sound.high.repeatMs", Number(e.target.value))}
            />

            <label className="im-label">Max duration (ms)</label>
            <input
              className="im-input"
              type="number"
              min={0}
              value={s.sound.high.maxDurationMs}
              onChange={(e) =>
                change("sound.high.maxDurationMs", Number(e.target.value))
              }
            />

            <div style={{ marginTop: 8 }}>
              <button
                className="im-btn"
                type="button"
                onClick={() => playPreview("high")}
              >
                ▶︎ Preview high
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <button
            className="im-btn"
            type="button"
            onClick={() => window.injectTest?.("high")}
          >
            🚨 Fire a test HIGH alert (banner + flash)
          </button>
        </div>
      </section>

      {/* Flash */}
      <section className="im-card">
        <h3 className="im-card-title">Flash Overlay</h3>
        <label className="im-label">
          <input
            type="checkbox"
            checked={s.flash.enabled}
            onChange={(e) => change("flash.enabled", e.target.checked)}
          />
          &nbsp; Enable flashing overlay
        </label>

        <div className="im-grid im-grid--2col">
          <div>
            <label className="im-label">Color A</label>
            <input
              className="im-input"
              type="color"
              value={s.flash.colorA}
              onChange={(e) => change("flash.colorA", e.target.value)}
            />
          </div>
          <div>
            <label className="im-label">Color B</label>
            <input
              className="im-input"
              type="color"
              value={s.flash.colorB}
              onChange={(e) => change("flash.colorB", e.target.value)}
            />
          </div>
        </div>

        <label className="im-label">Opacity (0–1)</label>
        <input
          className="im-input"
          type="number"
          step="0.05"
          min={0}
          max={1}
          value={s.flash.opacity}
          onChange={(e) => change("flash.opacity", Number(e.target.value))}
        />

        <div className="im-grid im-grid--2col">
          <div>
            <label className="im-label">Speed (ms)</label>
            <input
              className="im-input"
              type="number"
              min={50}
              value={s.flash.speedMs}
              onChange={(e) => change("flash.speedMs", Number(e.target.value))}
            />
          </div>
          <div>
            <label className="im-label">Total duration (ms)</label>
            <input
              className="im-input"
              type="number"
              min={0}
              value={s.flash.totalMs}
              onChange={(e) => change("flash.totalMs", Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="im-btn" onClick={() => save(defaults)}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
