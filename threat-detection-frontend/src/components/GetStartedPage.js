import React, { useEffect, useMemo, useState } from "react";
import { getToken } from "./authStorage";
import {
  ShieldCheck,
  Zap,
  Activity,
  Bell,
  Users,
  Settings,
  Server,
  Link as LinkIcon,
  CheckCircle2,
  Copy,
  RefreshCw,
  ExternalLink,
  BookOpen,
} from "lucide-react";

const STEPS = [
  { key: "create-account", title: "Create an account & sign in", desc: "Use your organization email to log in. Accounts are verified and secured with strong password rules.", icon: <Users className="w-5 h-5" /> },
  { key: "generate-key", title: "Generate an API key", desc: "You will use this to authenticate REST and WebSocket clients.", icon: <KeyIcon /> },
  { key: "connect-sources", title: "Connect log sources (optional)", desc: "Point your SIEM, endpoint agent, or app logs to our ingestion endpoint.", icon: <Server className="w-5 h-5" /> },
  { key: "configure-alerts", title: "Configure alert rules", desc: "Tune thresholds and recipients so the right people get notified.", icon: <Bell className="w-5 h-5" /> },
  { key: "invite-team", title: "Invite your team", desc: "Add analysts and admins with least-privilege roles.", icon: <Users className="w-5 h-5" /> },
];

function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path fill="currentColor" d="M14.5 3a6.5 6.5 0 1 0 4.6 11.1L22 17v3h-3l-1-1h-2l-1-1h-2l-1-1 2.1-2.1A6.5 6.5 0 0 0 14.5 3Zm0 2a4.5 4.5 0 1 1 0 9a4.5 4.5 0 0 1 0-9Z" />
    </svg>
  );
}

function useLocalProgress(key = "im-getstarted-progress") {
  const [checked, setChecked] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem(key, JSON.stringify(checked)); }, [checked, key]);
  const reset = () => setChecked({});
  const toggle = (k) => setChecked((p) => ({ ...p, [k]: !p[k] }));
  const percent = useMemo(() => {
    const total = STEPS.length;
    const done = Object.values(checked).filter(Boolean).length;
    return Math.round((done / total) * 100);
  }, [checked]);
  return { checked, toggle, reset, percent };
}

function CodeBlock({ title, children, onCopy }) {
  return (
    <div className="group relative rounded-2xl bg-slate-900 text-slate-100 border border-slate-800">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
        <p className="text-xs font-semibold tracking-wide uppercase opacity-80">{title}</p>
        <button onClick={onCopy} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-slate-700 hover:bg-slate-800" aria-label="Copy to clipboard">
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
      </div>
      <pre className="overflow-auto p-4 text-[12.5px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Resource({ icon, title, desc, href }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-start gap-3 p-4 rounded-xl border border-slate-200/70 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition bg-white dark:bg-slate-900/40">
      <div className="mt-1 shrink-0 text-sky-600 dark:text-cyan-400">{icon}</div>
      <div>
        <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
          {title} <ExternalLink className="w-4 h-4 opacity-60" />
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400">{desc}</p>
      </div>
    </a>
  );
}

export default function GetStartedPage() {
  const { checked, toggle, reset, percent } = useLocalProgress();
  const token = getToken();

  const curlSnippet = `curl -X POST http://localhost:8000/api/dev/trigger-threat/ \\
  -H "Content-Type: application/json" \\
  -d '{"user":"alice","score":0.92,"message":"File exfiltration spike"}'`;

  const jsSnippet = `// npm i websocket (or use native WebSocket in browsers)
const token = localStorage.getItem('custom_token');
const ws = new WebSocket(\`ws://localhost:8000/ws/threats/?token=\${token}\`);
ws.onmessage = (e) => console.log('live event:', e.data);`;

  // Use a literal placeholder that won't trigger JS interpolation
  const pySnippetTemplate = String.raw`import websockets, asyncio, json

async def main():
    token = "__JWT__"
    uri = f"ws://localhost:8000/ws/threats/?token={token}"
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"type":"ping"}))
        while True:
            msg = await ws.recv()
            print("live:", msg)

asyncio.run(main())`;

  const restSnippet = `# Send a single event directly (no WebSocket needed)
POST /api/events/  HTTP/1.1
Authorization: Bearer ${token || "<YOUR_JWT>"}
Content-Type: application/json

{
  "user": "alice",
  "activity_type": "process_spawn",
  "threat_score": 0.84,
  "message": "powershell.exe suspicious flags"
}`;

  const copy = (text) => navigator.clipboard.writeText(text).catch(() => {});

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 pt-14 pb-10">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium bg-sky-100 text-sky-700 dark:bg-cyan-900/40 dark:text-cyan-300">
            <ShieldCheck className="w-4 h-4" /> Insider Threat Detection
          </div>
          <h1 className="mt-4 text-4xl sm:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
            Get started in minutes — go <span className="text-sky-600 dark:text-cyan-400">real-time</span> from day one
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-slate-600 dark:text-slate-400">
            Connect your sources, stream live events, and visualize risk instantly. Follow the checklist below or fire a demo event to test the pipeline.
          </p>

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href="/" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-600 text-white font-semibold shadow hover:bg-sky-700">
              <Activity className="w-5 h-5" /> Open Dashboard
            </a>
            <a href="/docs" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 text-slate-800 dark:text-slate-200 font-semibold hover:bg-white">
              <BookOpen className="w-5 h-5" /> View Docs
            </a>
          </div>
        </div>
      </section>

      {/* Main grid */}
      <section className="max-w-7xl mx-auto px-6 pb-16 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Checklist */}
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Quickstart Checklist</h2>
              <button onClick={reset} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900">
                <RefreshCw className="w-3.5 h-3.5" /> Reset
              </button>
            </div>

            <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full mb-4 overflow-hidden">
              <div className="h-full bg-sky-500" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">{percent}% complete</p>

            <ul className="space-y-2">
              {STEPS.map((s) => (
                <li key={s.key} className="flex gap-3 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-900">
                  <button
                    onClick={() => toggle(s.key)}
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center ${
                      checked[s.key] ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-400 text-transparent"
                    }`}
                    aria-label={checked[s.key] ? "Mark incomplete" : "Mark complete"}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <div>
                    <div className="font-medium text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      {s.icon} <span>{s.title}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{s.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-white">Your data stays yours</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">All API access is authenticated. Rotate keys regularly and use role-based access for teammates.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Step A */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-amber-500" />
              <h3 className="font-semibold text-slate-900 dark:text-white">A. Test your pipeline in 10 seconds</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Send a demo threat event—your dashboard should update instantly (banner, line chart, and Top Users).</p>
            <CodeBlock title="cURL">{curlSnippet}</CodeBlock>
            <div className="mt-2 text-right">
              <button onClick={() => copy(curlSnippet)} className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900">
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
          </div>

          {/* Step B */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <LinkIcon className="w-5 h-5 text-sky-500" />
              <h3 className="font-semibold text-slate-900 dark:text-white">B. Stream events in real time</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Use WebSocket to receive live threat signals. Works from the browser or your backend workers.</p>

            <div className="grid md:grid-cols-2 gap-4">
              <CodeBlock title="Browser / Node (JS)">{jsSnippet}</CodeBlock>
              <CodeBlock title="Python (async)">{pySnippetTemplate.replace("__JWT__", token || "<YOUR_JWT>")}</CodeBlock>
            </div>
            <div className="mt-2 text-right flex flex-wrap gap-2 justify-end">
              <button onClick={() => copy(jsSnippet)} className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900">
                <Copy className="w-3.5 h-3.5" /> Copy JS
              </button>
              <button onClick={() => copy(pySnippetTemplate.replace("__JWT__", token || "<YOUR_JWT>"))} className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900">
                <Copy className="w-3.5 h-3.5" /> Copy Python
              </button>
            </div>
          </div>

          {/* Step C */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-5 h-5 text-violet-500" />
              <h3 className="font-semibold text-slate-900 dark:text-white">C. Send events via REST</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">Post events directly if WebSockets aren’t available.</p>
            <CodeBlock title="HTTP Example">{restSnippet}</CodeBlock>
            <div className="mt-2 text-right">
              <button onClick={() => copy(restSnippet)} className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900">
                <Copy className="w-3.5 h-3.5" /> Copy
              </button>
            </div>
          </div>

          {/* Resources */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-5 h-5 text-teal-500" />
              <h3 className="font-semibold text-slate-900 dark:text-white">Resources</h3>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Resource icon={<BookOpen className="w-5 h-5" />} title="API Reference" desc="Endpoints for events, alerts, and analytics." href="/docs/api" />
              <Resource icon={<Bell className="w-5 h-5" />} title="Alerting" desc="Thresholds, routing, and escalation." href="/docs/alerts" />
              <Resource icon={<Users className="w-5 h-5" />} title="RBAC & Teams" desc="Roles, invitations, and SSO tips." href="/docs/rbac" />
              <Resource icon={<ShieldCheck className="w-5 h-5" />} title="Security" desc="Key rotation, audit logs, and hardening." href="/docs/security" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
