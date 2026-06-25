import { useEffect, useState, useCallback, useRef } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { startRegistration, startAuthentication } from "@simplewebauthn/browser";
import SettingsTab from "./SettingsTab";

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;

// ─── Types ────────────────────────────────────────────────────────────────────
interface TrendData {
  vis_curr?: number; vis_prev?: number;
  sess_curr?: number; sess_prev?: number;
  pv_curr?: number; pv_prev?: number;
  clicks_curr?: number; clicks_prev?: number;
}
interface HourlyItem { hour: number; events: number; visitors: number; }
interface TopPage { path: string; pageviews: number; visitors: number; }
interface LiveData { sessions?: number; visitors?: number; }
interface SectionTime { section: string; avg_ms: number; max_ms: number; opens: number; }
interface Conversion { target: string; label: string | null; hits: number; unique_visitors: number; }
interface FunnelData { total_sessions?: number; opened_any?: number; opened_2plus?: number; opened_3plus?: number; }
interface UTMRow { utm_source: string; utm_medium: string | null; utm_campaign: string | null; visitors: number; sessions: number; }
interface PerfRow { metric: string; avg_ms: number; p75_ms: number; fast: number; ok: number; slow: number; samples: number; }

interface Stats {
  days: number;
  totals: { events?: number; pageviews?: number; clicks?: number; visitors?: number; sessions?: number };
  windows: { sessions_24h?: number; sessions_7d?: number; sessions_30d?: number; visitors_24h?: number; visitors_7d?: number; visitors_30d?: number };
  daily: Array<{ day: string; pageviews: number; visitors: number }>;
  countries: Array<{ country: string; visitors: number }>;
  todayCountries: Array<{ country: string; visitors: number }>;
  devices: Array<{ device: string; visitors: number }>;
  oses: Array<{ os: string; visitors: number }>;
  browsers: Array<{ browser: string; visitors: number }>;
  topEvents: Array<{ kind: string; target: string; label: string | null; hits: number }>;
  sessionLength: { avg_ms?: number | null; max_ms?: number | null };
  referrers: Array<{ referrer: string; hits: number }>;
  flowTransitions: Array<{ from_section: string; to_section: string; hits: number }>;
  flowPaths: Array<{ path: string; sessions: number; visitors: number }>;
  topPages: TopPage[];
  hourly: HourlyItem[];
  live: LiveData;
  trends: TrendData;
  bounceRate: { bounce_rate?: number | null };
  sectionTimes: SectionTime[];
  returning: { ret_sessions?: number; new_sessions?: number };
  conversions: Conversion[];
  exitSections: Array<{ last_portal: string; sessions: number }>;
  funnel: FunnelData;
  utmSources: UTMRow[];
  perfMetrics: PerfRow[];
  errors?: Record<string, string>;
}

interface Session {
  session_id: string; visitor_id: string; country: string | null;
  device: string | null; os: string | null; browser: string | null;
  first_seen: string; last_seen: string;
  event_count: number; pageviews: number; clicks: number; duration_ms: number | null;
  is_returning?: number; utm_source?: string | null;
}
interface SessionEvent {
  ts: string; kind: string; path: string | null;
  target: string | null; label: string | null; duration_ms: number | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const N = (v: unknown) => Number(v ?? 0);
const fmtNum = (n: unknown) => N(n).toLocaleString();
const fmtMs = (ms: unknown) => {
  const n = N(ms);
  if (!n || Number.isNaN(n)) return "—";
  if (n < 60_000) return `${Math.round(n / 1000)}s`;
  return `${Math.floor(n / 60000)}m ${Math.round((n % 60000) / 1000)}s`;
};
const fmtTime = (ts: string) => {
  try { return new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return ts; }
};
const countryFlag = (cc: string): string => {
  if (!cc || cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return "";
  const A = 0x1f1e6, base = "A".charCodeAt(0), u = cc.toUpperCase();
  return String.fromCodePoint(A + (u.charCodeAt(0) - base), A + (u.charCodeAt(1) - base));
};
const prettyLabel = (s: string | null | undefined): string => {
  if (!s || s === "unknown" || s === "Unknown") return "—";
  return s.replace(/^portal:/, "").replace(/[-_]/g, " ").replace(/^\w/, c => c.toUpperCase());
};
const calcTrend = (curr: number, prev: number): { pct: number; up: boolean } | null => {
  if (prev === 0 && curr === 0) return null;
  if (prev === 0) return { pct: 100, up: true };
  const pct = Math.round(((curr - prev) / prev) * 100);
  return { pct: Math.abs(pct), up: pct >= 0 };
};
const deviceIcon = (d: string | null) => {
  const s = (d ?? "").toLowerCase();
  if (s === "mobile") return "📱";
  if (s === "tablet") return "📟";
  return "💻";
};
const kindBadge = (k: string) => {
  const map: Record<string, string> = { pageview: "👁", click: "🖱", portal_open: "◎", portal_close: "⊘", theme_change: "◑", session_end: "■", perf: "⚡" };
  return map[k] ?? "·";
};
const hostOf = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };
const pctOf = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0;

// ─── Primitive UI ─────────────────────────────────────────────────────────────
const LiveBadge = ({ live }: { live: LiveData }) => {
  const n = N(live?.visitors);
  return (
    <div className="flex items-center gap-2 bg-neutral-950 border border-neutral-800 rounded-sm px-3 py-1.5">
      <span className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${n > 0 ? "bg-emerald-400" : "bg-neutral-600"}`} />
        <span className={`relative inline-flex rounded-full h-2 w-2 ${n > 0 ? "bg-emerald-500" : "bg-neutral-700"}`} />
      </span>
      <span className="font-vercetti text-[10px] uppercase tracking-widest text-neutral-400">
        {n > 0 ? `${n} live` : "0 live"}
      </span>
    </div>
  );
};

const TrendPill = ({ curr, prev }: { curr: number; prev: number }) => {
  const t = calcTrend(curr, prev);
  if (!t) return null;
  return (
    <span className={`font-vercetti text-[9px] px-1.5 py-0.5 rounded-sm ${t.up ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"}`}>
      {t.up ? "↑" : "↓"}{t.pct}%
    </span>
  );
};

const StatCard = ({ title, value, sub, curr, prev }: { title: string; value: string; sub?: string; curr?: number; prev?: number }) => (
  <div className="bg-neutral-950 border border-neutral-800 rounded-sm p-4 space-y-1.5">
    <div className="font-vercetti text-[9px] tracking-widest uppercase text-neutral-500">{title}</div>
    <div className="font-soria text-3xl text-white leading-none">{value}</div>
    <div className="flex items-center gap-2 flex-wrap">
      {curr !== undefined && prev !== undefined && <TrendPill curr={curr} prev={prev} />}
      {sub && <span className="font-vercetti text-[9px] text-neutral-600">{sub}</span>}
    </div>
  </div>
);

const Section = ({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) => (
  <div className="bg-neutral-950 border border-neutral-800 rounded-sm p-5">
    <div className="flex items-center justify-between mb-4">
      <div className="font-vercetti text-[10px] tracking-widest uppercase text-neutral-300">{title}</div>
      {note && <div className="font-vercetti text-[9px] text-neutral-600">{note}</div>}
    </div>
    {children}
  </div>
);

const Empty = ({ text }: { text: string }) => (
  <div className="font-vercetti text-xs text-neutral-700 py-3">{text}</div>
);

const HBar = ({ value, max, label, sub }: { value: number; max: number; label: string; sub?: string }) => (
  <div className="flex items-center gap-3 py-1.5 border-b border-neutral-900 last:border-0">
    <div className="w-28 shrink-0 font-vercetti text-xs text-neutral-300 truncate" title={label}>{label}</div>
    <div className="flex-1 h-1 bg-neutral-900 rounded-sm overflow-hidden">
      <div className="h-full bg-white rounded-sm transition-all duration-500" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
    </div>
    <div className="w-10 text-right font-vercetti text-xs text-neutral-400 tabular-nums shrink-0">{fmtNum(value)}</div>
    {sub && <div className="w-12 text-right font-vercetti text-[9px] text-neutral-600 tabular-nums shrink-0">{sub}</div>}
  </div>
);

// ─── Hourly heatmap ───────────────────────────────────────────────────────────
const HourlyHeatmap = ({ data }: { data: HourlyItem[] }) => {
  const map = new Map(data.map(d => [Math.floor(N(d.hour)), d]));
  const max = Math.max(...data.map(d => N(d.events)), 1);
  const labels = ["12a","1a","2a","3a","4a","5a","6a","7a","8a","9a","10a","11a","12p","1p","2p","3p","4p","5p","6p","7p","8p","9p","10p","11p"];
  return (
    <div>
      <div className="grid grid-cols-12 gap-1 mb-1">
        {Array.from({ length: 24 }, (_, h) => {
          const d = map.get(h);
          const intensity = d ? N(d.events) / max : 0;
          return (
            <div key={h} title={`${labels[h]}: ${fmtNum(d?.events ?? 0)} events · ${fmtNum(d?.visitors ?? 0)} visitors`}
              className="aspect-square rounded-sm flex items-end justify-center pb-0.5 cursor-default group"
              style={{ backgroundColor: intensity > 0 ? `rgba(255,255,255,${0.06 + intensity * 0.9})` : "rgba(255,255,255,0.04)" }}>
              <span className="font-vercetti text-[7px] text-neutral-700 group-hover:text-neutral-400 transition-colors leading-none">{labels[h]}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between font-vercetti text-[8px] text-neutral-700 mt-1">
        <span>midnight</span><span>6 am</span><span>noon</span><span>6 pm</span><span>midnight</span>
      </div>
    </div>
  );
};

// ─── Session Journal ──────────────────────────────────────────────────────────
const SessionJournal = ({ days }: { days: number }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, SessionEvent[]>>({});
  const [evtLoading, setEvtLoading] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(apiUrl(`/api/devkit/sessions?days=${days}&limit=50`), { credentials: "include" })
      .then(r => r.json())
      .then((d: { sessions?: Session[] }) => setSessions(d.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setLoading(false));
  }, [days]);

  const toggle = async (sid: string) => {
    if (expanded === sid) { setExpanded(null); return; }
    setExpanded(sid);
    if (cache[sid]) return;
    setEvtLoading(sid);
    try {
      const r = await fetch(apiUrl(`/api/devkit/sessions/${sid}`), { credentials: "include" });
      const d = await r.json() as { events?: SessionEvent[] };
      setCache(prev => ({ ...prev, [sid]: d.events ?? [] }));
    } finally { setEvtLoading(null); }
  };

  if (loading) return <div className="font-vercetti text-xs text-neutral-600 py-4">Loading sessions…</div>;
  if (sessions.length === 0) return <Empty text="No sessions in this period. Visitors will appear here once tracked." />;

  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full font-vercetti text-xs min-w-[720px]">
        <thead>
          <tr className="border-b border-neutral-800 text-left text-[9px] uppercase tracking-widest text-neutral-500">
            <th className="py-2 pr-4 font-normal">When</th>
            <th className="py-2 pr-3 font-normal">New/Ret</th>
            <th className="py-2 pr-4 font-normal">Country</th>
            <th className="py-2 pr-4 font-normal">Device</th>
            <th className="py-2 pr-4 font-normal">OS / Browser</th>
            <th className="py-2 pr-3 text-right font-normal">Pages</th>
            <th className="py-2 pr-3 text-right font-normal">Clicks</th>
            <th className="py-2 text-right font-normal">Duration</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(s => {
            const dur = s.duration_ms ?? (s.last_seen && s.first_seen ? new Date(s.last_seen).getTime() - new Date(s.first_seen).getTime() : null);
            const isOpen = expanded === s.session_id;
            const isRet = Number(s.is_returning) === 1;
            return (
              <>
                <tr key={s.session_id} onClick={() => void toggle(s.session_id)}
                  className="border-b border-neutral-900 cursor-pointer hover:bg-neutral-900/50 transition-colors select-none">
                  <td className="py-2.5 pr-4 text-neutral-500 whitespace-nowrap">{fmtTime(s.first_seen)}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`font-vercetti text-[9px] px-1.5 py-0.5 rounded-sm ${isRet ? "bg-blue-950 text-blue-400" : "bg-emerald-950 text-emerald-500"}`}>
                      {isRet ? "Ret" : "New"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <span className="mr-1.5 text-sm">{countryFlag(s.country ?? "") || "🏳"}</span>
                    <span className="text-neutral-300">{(s.country && s.country !== "Unknown") ? s.country : "—"}</span>
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap">
                    <span className="mr-1.5">{deviceIcon(s.device)}</span>
                    <span className="capitalize text-neutral-300">{s.device ?? "—"}</span>
                  </td>
                  <td className="py-2.5 pr-4 text-neutral-500">{[s.os, s.browser].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-neutral-300">{fmtNum(s.pageviews)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-neutral-500">{fmtNum(s.clicks)}</td>
                  <td className="py-2.5 text-right tabular-nums">
                    <span className="flex items-center justify-end gap-2">
                      <span className="text-neutral-400">{fmtMs(dur)}</span>
                      <span className="text-neutral-700 text-[10px]">{isOpen ? "▲" : "▼"}</span>
                    </span>
                  </td>
                </tr>
                {isOpen && (
                  <tr key={`${s.session_id}-ev`} className="border-b border-neutral-800">
                    <td colSpan={8} className="py-4 px-4 bg-black">
                      {evtLoading === s.session_id && <div className="font-vercetti text-[10px] text-neutral-600">Loading timeline…</div>}
                      {cache[s.session_id] && (
                        <div>
                          <div className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600 mb-2">Event timeline</div>
                          {cache[s.session_id].length === 0 && <div className="font-vercetti text-[10px] text-neutral-700">No events.</div>}
                          <div className="space-y-1.5">
                            {cache[s.session_id].map((e, i) => (
                              <div key={i} className="flex items-start gap-3 font-vercetti text-[10px]">
                                <span className="shrink-0 text-neutral-600 tabular-nums w-28 pt-px">{fmtTime(e.ts)}</span>
                                <span className="shrink-0 w-4 text-center">{kindBadge(e.kind)}</span>
                                <span className="shrink-0 text-neutral-500 w-24">{e.kind.replace(/_/g, " ")}</span>
                                <span className="flex gap-2 flex-wrap">
                                  {e.path && <span className="text-neutral-400">{e.path}</span>}
                                  {e.target && <span className="text-neutral-300">→ {prettyLabel(e.target)}</span>}
                                  {e.label && <span className="text-neutral-600">({e.label})</span>}
                                  {(e.kind === "session_end" || e.kind === "perf") && e.duration_ms != null && (
                                    <span className="text-neutral-500">{fmtMs(e.duration_ms)}</span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
const DevkitPage = () => {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [biometricAvail, setBiometricAvail] = useState(false);
  const [passkeyStored, setPasskeyStored] = useState(false);
  const [biometricState, setBiometricState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [biometricErr, setBiometricErr] = useState<string | null>(null);
  const [biometricLogging, setBiometricLogging] = useState(false);
  const [view, setView] = useState<"analytics" | "settings">("analytics");

  useEffect(() => {
    document.title = "Devkit — Magdy Saber";
    fetch(apiUrl("/api/devkit/session"), { credentials: "include" })
      .then(r => r.json())
      .then((d: { authed: boolean }) => setAuthed(!!d.authed))
      .catch(() => setAuthed(false));
    // Check biometric support
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(ok => setBiometricAvail(ok))
        .catch(() => {});
    }
    setPasskeyStored(localStorage.getItem("devkit_passkey") === "1");
  }, []);

  const loadStats = useCallback(async (d: number) => {
    setLoading(true); setStatsErr(null);
    try {
      const r = await fetch(apiUrl(`/api/devkit/stats?days=${d}`), { credentials: "include" });
      if (r.status === 401) { setAuthed(false); return; }
      if (!r.ok) { const j = await r.json().catch(() => ({})) as { error?: string }; setStatsErr(j.error ?? `HTTP ${r.status}`); return; }
      setStats(await r.json() as Stats);
    } catch (err) { setStatsErr(err instanceof Error ? err.message : "failed"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) void loadStats(days); }, [authed, days, loadStats]);
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoRefresh && authed) timerRef.current = setInterval(() => void loadStats(days), 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoRefresh, authed, days, loadStats]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoggingIn(true); setLoginErr(null);
    try {
      const r = await fetch(apiUrl("/api/devkit/login"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ password }) });
      if (r.ok) { setAuthed(true); setPassword(""); } else { setLoginErr("Invalid password"); }
    } catch { setLoginErr("Network error"); } finally { setLoggingIn(false); }
  };

  const onBiometricLogin = async () => {
    setBiometricLogging(true); setLoginErr(null);
    try {
      const optRes = await fetch(apiUrl("/api/devkit/webauthn/auth-options"), { credentials: "include" });
      if (!optRes.ok) { setLoginErr("No passkey found — use password"); localStorage.removeItem("devkit_passkey"); setPasskeyStored(false); return; }
      const opts = await optRes.json();
      const assertion = await startAuthentication({ optionsJSON: opts });
      const verRes = await fetch(apiUrl("/api/devkit/webauthn/authenticate"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(assertion) });
      const result = await verRes.json() as { ok: boolean; error?: string };
      if (result.ok) { setAuthed(true); } else { setLoginErr(result.error ?? "Biometric failed"); }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Biometric cancelled";
      if (!msg.includes("cancel") && !msg.includes("abort")) setLoginErr(msg);
    } finally { setBiometricLogging(false); }
  };

  const onRegisterPasskey = async () => {
    setBiometricState("working"); setBiometricErr(null);
    try {
      const optRes = await fetch(apiUrl("/api/devkit/webauthn/register-options"), { credentials: "include" });
      if (!optRes.ok) throw new Error("Could not get registration options");
      const opts = await optRes.json();
      const reg = await startRegistration({ optionsJSON: opts });
      const verRes = await fetch(apiUrl("/api/devkit/webauthn/register"), { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(reg) });
      const result = await verRes.json() as { ok: boolean; error?: string };
      if (result.ok) { localStorage.setItem("devkit_passkey", "1"); setPasskeyStored(true); setBiometricState("done"); }
      else { setBiometricErr(result.error ?? "Registration failed"); setBiometricState("error"); }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      if (!msg.includes("cancel") && !msg.includes("abort")) setBiometricErr(msg);
      setBiometricState("error");
    }
  };

  const onRemovePasskey = async () => {
    await fetch(apiUrl("/api/devkit/webauthn/passkey"), { method: "DELETE", credentials: "include" });
    localStorage.removeItem("devkit_passkey"); setPasskeyStored(false); setBiometricState("idle");
  };

  const onLogout = async () => {
    await fetch(apiUrl("/api/devkit/logout"), { method: "POST", credentials: "include" });
    setAuthed(false); setStats(null);
  };

  if (authed === null) return (
    <div className="min-h-screen bg-black flex items-center justify-center font-vercetti text-[10px] text-neutral-600 uppercase tracking-widest">Connecting…</div>
  );

  if (!authed) return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-3">
        {biometricAvail && passkeyStored && (
          <button onClick={() => void onBiometricLogin()} disabled={biometricLogging}
            className="w-full bg-neutral-950 border border-neutral-700 text-white font-vercetti text-sm tracking-widest uppercase py-4 flex items-center justify-center gap-3 hover:bg-neutral-900 disabled:opacity-40 transition-colors rounded-sm">
            <span className="text-2xl leading-none">👆</span>
            <span>{biometricLogging ? "Verifying…" : "Face ID / Touch ID"}</span>
          </button>
        )}
        <form onSubmit={onLogin} className="bg-neutral-950 border border-neutral-800 rounded-sm p-6 space-y-4">
          <div>
            <h1 className="font-soria text-4xl text-white">Devkit</h1>
            <p className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600 mt-1">Owner analytics · Private</p>
          </div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password"
            autoFocus={!passkeyStored}
            className="w-full bg-black border border-neutral-800 text-white px-3 py-2.5 font-vercetti text-sm focus:outline-none focus:border-neutral-500 transition-colors" />
          {loginErr && <div className="font-vercetti text-[10px] text-red-400">{loginErr}</div>}
          <button type="submit" disabled={loggingIn || !password}
            className="w-full bg-white text-black font-vercetti text-xs tracking-widest uppercase py-3 disabled:opacity-30 hover:bg-neutral-100 transition-colors">
            {loggingIn ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );

  const t = stats?.totals ?? {};
  const w = stats?.windows ?? {};
  const tr = stats?.trends ?? {};
  const live = stats?.live ?? {};
  const ret = stats?.returning ?? {};
  const funnel = stats?.funnel ?? {};
  const todayVisitors = N(w.visitors_24h);
  const todaySessions = N(w.sessions_24h);
  const todayCountriesArr = stats?.todayCountries ?? [];
  const todayFlags = todayCountriesArr.map(c => countryFlag(c.country)).filter(Boolean).slice(0, 8);

  return (
    <div className="min-h-screen bg-black text-white">

      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-black/96 backdrop-blur-sm border-b border-neutral-900 px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="font-soria text-xl text-white leading-none shrink-0">Devkit</h1>
              <LiveBadge live={live} />
              <p className="font-vercetti text-[8px] uppercase tracking-widest text-neutral-600 hidden sm:block truncate">
                {days}d window{loading ? " · refreshing…" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <select value={days} onChange={e => setDays(Number(e.target.value))}
                className="border border-neutral-800 px-2 py-1.5 font-vercetti text-[10px] bg-neutral-950 text-white rounded-sm">
                <option value={1}>24h</option>
                <option value={7}>7d</option>
                <option value={30}>30d</option>
                <option value={90}>90d</option>
              </select>
              <button onClick={() => void loadStats(days)} className="border border-neutral-800 text-neutral-300 px-2.5 py-1.5 font-vercetti text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-colors rounded-sm">↻</button>
              <button onClick={onLogout} className="border border-neutral-800 text-neutral-500 px-2.5 py-1.5 font-vercetti text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-colors rounded-sm">Out</button>
            </div>
          </div>
          {/* ── Secondary actions row (hidden on very small screens via scroll) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            <button onClick={() => setAutoRefresh(a => !a)}
              className={`shrink-0 border px-2.5 py-1 font-vercetti text-[10px] uppercase tracking-widest transition-colors rounded-sm ${autoRefresh ? "border-emerald-800 text-emerald-400 bg-emerald-950/50" : "border-neutral-800 text-neutral-500 hover:text-white"}`}>
              {autoRefresh ? "Auto ✓" : "Auto"}
            </button>
            <button onClick={() => { window.location.href = apiUrl(`/api/devkit/export.csv?days=${days}`); }} className="shrink-0 border border-neutral-800 text-neutral-500 px-2.5 py-1 font-vercetti text-[10px] uppercase tracking-widest hover:bg-white hover:text-black transition-colors rounded-sm">CSV</button>
            <button onClick={async () => { if (!confirm("Permanently delete ALL analytics data?")) return; const r = await fetch(apiUrl("/api/devkit/reset"), { method: "POST", credentials: "include" }); if (r.ok) { setStats(null); void loadStats(days); } else alert("Reset failed."); }} className="shrink-0 border border-red-900/80 text-red-500 px-2.5 py-1 font-vercetti text-[10px] uppercase tracking-widest hover:bg-red-700 hover:text-white hover:border-red-700 transition-colors rounded-sm">Reset</button>
            {biometricAvail && (
              biometricState === "done" || passkeyStored ? (
                <button onClick={() => void onRemovePasskey()} className="shrink-0 border border-neutral-800 text-neutral-600 px-2.5 py-1 font-vercetti text-[10px] uppercase tracking-widest hover:text-red-400 transition-colors rounded-sm">Remove biometric</button>
              ) : (
                <button onClick={() => void onRegisterPasskey()} disabled={biometricState === "working"}
                  className="shrink-0 border border-neutral-700 text-neutral-300 px-2.5 py-1 font-vercetti text-[10px] uppercase tracking-widest hover:bg-neutral-800 disabled:opacity-40 transition-colors rounded-sm">
                  {biometricState === "working" ? "Setting up…" : "👆 Set up biometric"}
                </button>
              )
            )}
          </div>
          {biometricState === "error" && biometricErr && (
            <div className="font-vercetti text-[10px] text-red-400">{biometricErr}</div>
          )}
          {biometricState === "done" && (
            <div className="font-vercetti text-[10px] text-emerald-400">Biometric enabled — use Face ID / Touch ID next time you log in.</div>
          )}
        </div>
      </div>

      {/* ── Tab switcher ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 pt-1">
        <button onClick={() => setView("analytics")}
          className={`shrink-0 border px-3 py-1 font-vercetti text-[10px] uppercase tracking-widest transition-colors rounded-sm ${view === "analytics" ? "border-neutral-300 text-white bg-neutral-800" : "border-neutral-800 text-neutral-500 hover:text-white"}`}>
          Analytics
        </button>
        <button onClick={() => setView("settings")}
          className={`shrink-0 border px-3 py-1 font-vercetti text-[10px] uppercase tracking-widest transition-colors rounded-sm ${view === "settings" ? "border-neutral-300 text-white bg-neutral-800" : "border-neutral-800 text-neutral-500 hover:text-white"}`}>
          Settings
        </button>
      </div>
    </div>
  </div>

      {view === "settings" ? (
        <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6">
          <SettingsTab />
        </div>
      ) : (
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-5">

        {statsErr && <div className="border border-red-900 bg-red-950/40 text-red-400 px-4 py-3 font-vercetti text-xs rounded-sm">{statsErr}</div>}
        {stats?.errors && Object.keys(stats.errors).length > 0 && (
          <div className="border border-yellow-900 bg-yellow-950/30 text-yellow-300 px-4 py-3 font-vercetti text-xs rounded-sm space-y-1">
            <div className="uppercase tracking-widest font-bold text-yellow-400">Some queries failed:</div>
            {Object.entries(stats.errors).map(([k, v]) => <div key={k}><span className="text-yellow-500">{k}:</span> {v}</div>)}
          </div>
        )}

        {!stats && !loading && !statsErr && (
          <div className="border border-neutral-800 rounded-sm p-12 text-center">
            <div className="font-soria text-3xl text-neutral-700 mb-3">No data yet</div>
            <div className="font-vercetti text-xs text-neutral-600 max-w-sm mx-auto leading-relaxed">
              Waiting for your first visitor. Make sure the tracker is deployed and the API is reachable at <code className="bg-neutral-900 px-1 rounded">/api/devkit/events</code>.
            </div>
          </div>
        )}

        {stats && (
          <>
            {/* ── TODAY HERO ───────────────────────────────────────────────── */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-sm p-6">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                  <div className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-500 mb-2">Today</div>
                  <div className="flex items-baseline gap-3">
                    <span className="font-soria text-6xl text-white leading-none">{fmtNum(todayVisitors)}</span>
                    <span className="font-vercetti text-sm text-neutral-400">unique {todayVisitors === 1 ? "human" : "humans"}</span>
                  </div>
                  <div className="font-vercetti text-xs text-neutral-600 mt-1.5">{fmtNum(todaySessions)} sessions · avg {fmtMs(stats.sessionLength.avg_ms)}</div>
                  {todayFlags.length > 0 && (
                    <div className="flex gap-1 mt-3 text-2xl">
                      {todayFlags.map((f, i) => <span key={i} title={(todayCountriesArr[i] ?? {}).country}>{f}</span>)}
                      {todayCountriesArr.length > 8 && <span className="font-vercetti text-xs text-neutral-600 self-center ml-1">+{todayCountriesArr.length - 8}</span>}
                    </div>
                  )}
                  {todayVisitors === 0 && <div className="font-vercetti text-xs text-neutral-700 mt-2">No visitors today yet.</div>}
                </div>
                <div className="grid grid-cols-2 gap-3 text-right">
                  <div className="bg-black border border-neutral-900 rounded-sm px-4 py-3">
                    <div className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600 mb-0.5">7 days</div>
                    <div className="font-soria text-xl text-white">{fmtNum(w.visitors_7d)}</div>
                    <div className="font-vercetti text-[9px] text-neutral-700">{fmtNum(w.sessions_7d)} sess</div>
                  </div>
                  <div className="bg-black border border-neutral-900 rounded-sm px-4 py-3">
                    <div className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600 mb-0.5">30 days</div>
                    <div className="font-soria text-xl text-white">{fmtNum(w.visitors_30d)}</div>
                    <div className="font-vercetti text-[9px] text-neutral-700">{fmtNum(w.sessions_30d)} sess</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── TREND CARDS ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard title="Visitors" value={fmtNum(t.visitors)} curr={N(tr.vis_curr)} prev={N(tr.vis_prev)}
                sub={(() => { const total = N(ret.new_sessions) + N(ret.ret_sessions); return total > 0 ? `${pctOf(N(ret.new_sessions), total)}% new` : undefined; })()}
              />
              <StatCard title="Sessions" value={fmtNum(t.sessions)} curr={N(tr.sess_curr)} prev={N(tr.sess_prev)} />
              <StatCard title="Pageviews" value={fmtNum(t.pageviews)} curr={N(tr.pv_curr)} prev={N(tr.pv_prev)} />
              <StatCard title="Clicks" value={fmtNum(t.clicks)} curr={N(tr.clicks_curr)} prev={N(tr.clicks_prev)} />
              <StatCard title="Avg session" value={fmtMs(stats.sessionLength.avg_ms)} sub={`max ${fmtMs(stats.sessionLength.max_ms)}`} />
              <StatCard title="Bounce rate" value={stats.bounceRate?.bounce_rate != null ? `${Math.round(N(stats.bounceRate.bounce_rate))}%` : "—"} sub="single-page sessions" />
            </div>

            {/* ── FUNNEL ───────────────────────────────────────────────────── */}
            {N(funnel.total_sessions) > 0 && (
              <Section title="Engagement funnel" note="How many sessions explore deeper">
                {(() => {
                  const steps = [
                    { label: "Visited the portfolio", n: N(funnel.total_sessions) },
                    { label: "Opened a 3D section", n: N(funnel.opened_any) },
                    { label: "Opened 2+ sections", n: N(funnel.opened_2plus) },
                    { label: "Opened 3+ sections", n: N(funnel.opened_3plus) },
                  ];
                  const max = steps[0].n;
                  return (
                    <div className="space-y-0">
                      {steps.map((s, i) => {
                        const pct = pctOf(s.n, max);
                        const dropPct = i > 0 ? pctOf(steps[i - 1].n - s.n, steps[i - 1].n) : 0;
                        return (
                          <div key={i} className="flex items-center gap-4 py-2 border-b border-neutral-900 last:border-0">
                            <div className="w-28 sm:w-44 shrink-0 font-vercetti text-xs text-neutral-300">{s.label}</div>
                            <div className="flex-1 h-2 bg-neutral-900 rounded-sm overflow-hidden">
                              <div className="h-full bg-white rounded-sm transition-all duration-700" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="w-12 text-right font-vercetti text-xs text-white tabular-nums shrink-0">{fmtNum(s.n)}</div>
                            <div className="w-10 text-right font-vercetti text-[9px] tabular-nums shrink-0 text-neutral-500">{pct}%</div>
                            {i > 0 && dropPct > 0 && (
                              <div className="w-16 text-right font-vercetti text-[9px] tabular-nums shrink-0 text-red-500">−{dropPct}%</div>
                            )}
                            {i === 0 && <div className="w-16 shrink-0" />}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </Section>
            )}

            {/* ── DAILY CHART ──────────────────────────────────────────────── */}
            <Section title="Daily traffic">
              {stats.daily.length === 0
                ? <Empty text="No data in this period." />
                : <>
                    <div style={{ width: "100%", height: 200 }}>
                      <ResponsiveContainer>
                        <LineChart data={stats.daily} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                          <CartesianGrid stroke="#171717" strokeDasharray="3 3" />
                          <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#404040" }} stroke="#262626" />
                          <YAxis tick={{ fontSize: 9, fill: "#404040" }} stroke="#262626" allowDecimals={false} />
                          <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid #262626", color: "#fff", fontSize: 11, borderRadius: 2 }} />
                          <Line type="monotone" dataKey="pageviews" stroke="#ffffff" strokeWidth={1.5} dot={false} name="Pageviews" />
                          <Line type="monotone" dataKey="visitors" stroke="#525252" strokeWidth={1.5} dot={false} name="Visitors" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-4 mt-3 font-vercetti text-[9px] text-neutral-600">
                      <span><span className="inline-block w-4 h-px bg-white mr-1.5 align-middle" />Pageviews</span>
                      <span><span className="inline-block w-4 h-px bg-neutral-500 mr-1.5 align-middle" />Visitors</span>
                    </div>
                  </>
              }
            </Section>

            {/* ── COUNTRIES + DEVICES ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Section title="Top countries">
                {stats.countries.length === 0
                  ? <Empty text="No country data yet. Real visitors from production will appear here." />
                  : (() => {
                      const maxV = Math.max(...stats.countries.map(c => N(c.visitors)), 1);
                      const total = stats.countries.reduce((a, c) => a + N(c.visitors), 0);
                      return stats.countries.map(c => (
                        <div key={c.country} className="flex items-center gap-3 py-2 border-b border-neutral-900 last:border-0">
                          <span className="text-base w-6 shrink-0">{countryFlag(c.country) || "🌍"}</span>
                          <span className="font-vercetti text-xs text-neutral-300 w-9 shrink-0">{c.country}</span>
                          <div className="flex-1 h-1 bg-neutral-900 rounded-sm overflow-hidden">
                            <div className="h-full bg-white rounded-sm transition-all duration-500" style={{ width: `${(N(c.visitors) / maxV) * 100}%` }} />
                          </div>
                          <span className="font-vercetti text-xs text-neutral-400 tabular-nums w-10 text-right shrink-0">{fmtNum(c.visitors)}</span>
                          <span className="font-vercetti text-[9px] text-neutral-700 w-7 text-right shrink-0">{pctOf(N(c.visitors), total)}%</span>
                        </div>
                      ));
                    })()
                }
              </Section>

              <div className="space-y-4">
                <Section title="Devices">
                  {stats.devices.length === 0
                    ? <Empty text="No data." />
                    : (() => {
                        const max = Math.max(...stats.devices.map(d => N(d.visitors)), 1);
                        return stats.devices.slice(0, 5).map(d => (
                          <HBar key={d.device} value={N(d.visitors)} max={max} label={`${deviceIcon(d.device)} ${prettyLabel(d.device)}`} />
                        ));
                      })()
                  }
                </Section>
                <div className="grid grid-cols-2 gap-4">
                  <Section title="OS">
                    {stats.oses.length === 0 ? <Empty text="No data." /> : (() => {
                      const max = Math.max(...stats.oses.map(x => N(x.visitors)), 1);
                      return stats.oses.slice(0, 5).map(o => <HBar key={o.os} value={N(o.visitors)} max={max} label={prettyLabel(o.os)} />);
                    })()}
                  </Section>
                  <Section title="Browser">
                    {stats.browsers.length === 0 ? <Empty text="No data." /> : (() => {
                      const max = Math.max(...stats.browsers.map(x => N(x.visitors)), 1);
                      return stats.browsers.slice(0, 5).map(b => <HBar key={b.browser} value={N(b.visitors)} max={max} label={prettyLabel(b.browser)} />);
                    })()}
                  </Section>
                </div>
              </div>
            </div>

            {/* ── SECTION TIMES + CONVERSIONS ──────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Section title="Time in each 3D section" note="Based on portal open → close duration">
                {(stats.sectionTimes ?? []).length === 0
                  ? <Empty text="No section dwell data yet. Data appears once visitors open and close sections." />
                  : (() => {
                      const rows = stats.sectionTimes ?? [];
                      const max = Math.max(...rows.map(s => N(s.avg_ms)), 1);
                      return rows.map((s, i) => (
                        <div key={i} className="flex items-center gap-3 py-1.5 border-b border-neutral-900 last:border-0">
                          <div className="w-28 shrink-0 font-vercetti text-xs text-neutral-300 truncate">{prettyLabel(s.section)}</div>
                          <div className="flex-1 h-1 bg-neutral-900 rounded-sm overflow-hidden">
                            <div className="h-full bg-white rounded-sm transition-all duration-500" style={{ width: `${max > 0 ? (N(s.avg_ms) / max) * 100 : 0}%` }} />
                          </div>
                          <div className="w-14 text-right font-vercetti text-xs text-neutral-400 tabular-nums shrink-0">{fmtMs(s.avg_ms)}</div>
                          <div className="w-10 text-right font-vercetti text-[9px] text-neutral-600 tabular-nums shrink-0">{fmtNum(s.opens)}×</div>
                        </div>
                      ));
                    })()
                }
                {(stats.sectionTimes ?? []).length > 0 && (
                  <div className="font-vercetti text-[9px] text-neutral-700 mt-3">Bar = avg time · sub = total opens</div>
                )}
              </Section>

              <Section title="Conversions" note="Contact · social · CV clicks">
                {(stats.conversions ?? []).length === 0
                  ? <Empty text="No conversion clicks yet. Links tracked: footer links, email, LinkedIn, GitHub, CV." />
                  : (() => {
                      const convRows = stats.conversions ?? [];
                      const totalSess = N(t.sessions);
                      const totalConv = convRows.reduce((a, c) => a + N(c.hits), 0);
                      const rate = totalSess > 0 ? ((totalConv / totalSess) * 100).toFixed(1) : "—";
                      const max = Math.max(...convRows.map(c => N(c.hits)), 1);
                      return (
                        <>
                          <div className="flex gap-4 mb-3">
                            <div>
                              <div className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600">Total clicks</div>
                              <div className="font-soria text-2xl text-white">{fmtNum(totalConv)}</div>
                            </div>
                            <div>
                              <div className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600">Conv rate</div>
                              <div className="font-soria text-2xl text-white">{rate}%</div>
                            </div>
                          </div>
                          {convRows.map((c, i) => (
                            <HBar key={i} value={N(c.hits)} max={max}
                              label={prettyLabel(c.target)}
                              sub={`${fmtNum(c.unique_visitors)}uv`} />
                          ))}
                        </>
                      );
                    })()
                }
              </Section>
            </div>

            {/* ── NEW / RETURNING + EXIT SECTIONS ──────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Section title="New vs returning visitors">
                {(() => {
                  const newS = N(ret.new_sessions);
                  const retS = N(ret.ret_sessions);
                  const total = newS + retS;
                  if (total === 0) return <Empty text="No data yet. Is_returning tracked per session from localStorage." />;
                  const newPct = pctOf(newS, total);
                  const retPct = 100 - newPct;
                  return (
                    <div className="space-y-4">
                      <div className="flex gap-6">
                        <div>
                          <div className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600 mb-0.5">New</div>
                          <div className="font-soria text-3xl text-emerald-400">{newPct}%</div>
                          <div className="font-vercetti text-[9px] text-neutral-600">{fmtNum(newS)} sessions</div>
                        </div>
                        <div>
                          <div className="font-vercetti text-[9px] uppercase tracking-widest text-neutral-600 mb-0.5">Returning</div>
                          <div className="font-soria text-3xl text-blue-400">{retPct}%</div>
                          <div className="font-vercetti text-[9px] text-neutral-600">{fmtNum(retS)} sessions</div>
                        </div>
                      </div>
                      <div className="h-2 bg-neutral-900 rounded-sm overflow-hidden flex">
                        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${newPct}%` }} />
                        <div className="h-full bg-blue-500 flex-1" />
                      </div>
                    </div>
                  );
                })()}
              </Section>

              <Section title="Exit sections" note="Which portal visitors were in when they left">
                {(stats.exitSections ?? []).length === 0
                  ? <Empty text="No exit data yet. Appears once sessions with portals are recorded." />
                  : (() => {
                      const exitRows = stats.exitSections ?? [];
                      const max = Math.max(...exitRows.map(e => N(e.sessions)), 1);
                      return exitRows.map((e, i) => (
                        <HBar key={i} value={N(e.sessions)} max={max} label={prettyLabel(e.last_portal)} />
                      ));
                    })()
                }
              </Section>
            </div>

            {/* ── HOURLY HEATMAP ───────────────────────────────────────────── */}
            <Section title="Traffic by hour of day" note={`${days}d window · UTC`}>
              {stats.hourly.length === 0 ? <Empty text="No data yet." /> : <HourlyHeatmap data={stats.hourly} />}
            </Section>

            {/* ── TOP PAGES + INTERACTIONS ─────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Section title="Top pages">
                {stats.topPages.length === 0
                  ? <Empty text="No pageviews yet." />
                  : (() => {
                      const max = Math.max(...stats.topPages.map(p => N(p.pageviews)), 1);
                      return stats.topPages.map((p, i) => <HBar key={i} value={N(p.pageviews)} max={max} label={p.path || "/"} sub={`${fmtNum(p.visitors)}v`} />);
                    })()
                }
              </Section>
              <Section title="Top interactions">
                <table className="w-full font-vercetti text-xs">
                  <thead>
                    <tr className="border-b border-neutral-800 text-left text-[9px] uppercase tracking-widest text-neutral-600">
                      <th className="py-1.5 pr-3 font-normal">Type</th>
                      <th className="py-1.5 pr-3 font-normal">Target</th>
                      <th className="py-1.5 text-right font-normal">Hits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topEvents.length === 0 && <tr><td colSpan={3} className="py-4 text-neutral-700">No interactions yet.</td></tr>}
                    {stats.topEvents.slice(0, 12).map((e, i) => (
                      <tr key={i} className="border-b border-neutral-900">
                        <td className="py-1.5 pr-3 text-neutral-600 capitalize">{e.kind === "portal_open" ? "section" : e.kind === "theme_change" ? "theme" : e.kind}</td>
                        <td className="py-1.5 pr-3 text-neutral-300">{prettyLabel(e.target)}</td>
                        <td className="py-1.5 text-right tabular-nums text-neutral-500">{fmtNum(e.hits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            </div>

            {/* ── SECTION FLOW + REFERRERS ──────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Section title="Section navigation flow" note="Portal-to-portal transitions">
                {(stats.flowTransitions ?? []).length === 0
                  ? <Empty text="No transitions yet." />
                  : (() => {
                      const maxH = Math.max(...stats.flowTransitions.map(f => N(f.hits)), 1);
                      return stats.flowTransitions.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 py-1.5 border-b border-neutral-900 last:border-0">
                          <span className="font-vercetti text-xs text-neutral-300 w-20 truncate shrink-0">{prettyLabel(f.from_section)}</span>
                          <span className="text-neutral-700 shrink-0">→</span>
                          <span className="font-vercetti text-xs text-neutral-400 flex-1 truncate">{prettyLabel(f.to_section)}</span>
                          <div className="w-16 h-1 bg-neutral-900 rounded-sm overflow-hidden shrink-0">
                            <div className="h-full bg-white" style={{ width: `${(N(f.hits) / maxH) * 100}%` }} />
                          </div>
                          <span className="font-vercetti text-xs text-neutral-600 tabular-nums w-5 text-right shrink-0">{fmtNum(f.hits)}</span>
                        </div>
                      ));
                    })()
                }
              </Section>

              <Section title="Top referrers">
                {stats.referrers.length === 0
                  ? (
                    <div className="space-y-2">
                      <Empty text="No external referrers yet." />
                      <div className="font-vercetti text-[10px] text-neutral-700 leading-relaxed border border-neutral-900 rounded-sm p-3">
                        This is normal for direct traffic (visitors who typed your URL or used a bookmark — the browser sends no Referer header). Referrers will appear when people arrive via Google, LinkedIn, another website, or a shared link.
                      </div>
                    </div>
                  )
                  : (() => {
                      const max = Math.max(...stats.referrers.map(r => N(r.hits)), 1);
                      return stats.referrers.map((r, i) => <HBar key={i} value={N(r.hits)} max={max} label={hostOf(r.referrer)} />);
                    })()
                }
              </Section>
            </div>

            {/* ── UTM SOURCES ──────────────────────────────────────────────── */}
            <Section title="Campaign sources (UTM)" note="Add ?utm_source=linkedin&utm_medium=post to any link">
              {(stats.utmSources ?? []).length === 0
                ? (
                  <div className="space-y-2">
                    <Empty text="No UTM parameters tracked yet." />
                    <div className="font-vercetti text-[10px] text-neutral-700 leading-relaxed border border-neutral-900 rounded-sm p-3">
                      Tag any link to your portfolio with UTM parameters to track campaigns. Example: <code className="bg-neutral-900 px-1">magdysaber.com?utm_source=linkedin&utm_medium=post&utm_campaign=job2026</code>
                    </div>
                  </div>
                )
                : (
                  <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full font-vercetti text-xs min-w-[400px]">
                    <thead>
                      <tr className="border-b border-neutral-800 text-left text-[9px] uppercase tracking-widest text-neutral-600">
                        <th className="py-1.5 pr-4 font-normal">Source</th>
                        <th className="py-1.5 pr-4 font-normal">Medium</th>
                        <th className="py-1.5 pr-4 font-normal">Campaign</th>
                        <th className="py-1.5 pr-3 text-right font-normal whitespace-nowrap">Visitors</th>
                        <th className="py-1.5 text-right font-normal whitespace-nowrap">Sessions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.utmSources ?? []).map((u, i) => (
                        <tr key={i} className="border-b border-neutral-900">
                          <td className="py-1.5 pr-4 text-white whitespace-nowrap">{u.utm_source}</td>
                          <td className="py-1.5 pr-4 text-neutral-400 whitespace-nowrap">{u.utm_medium ?? "—"}</td>
                          <td className="py-1.5 pr-4 text-neutral-500 whitespace-nowrap">{u.utm_campaign ?? "—"}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-300">{fmtNum(u.visitors)}</td>
                          <td className="py-1.5 text-right tabular-nums text-neutral-500">{fmtNum(u.sessions)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                )
              }
            </Section>

            {/* ── PERFORMANCE ──────────────────────────────────────────────── */}
            <Section title="Client performance" note="Page load & First Contentful Paint as seen by real visitors">
              {(stats.perfMetrics ?? []).length === 0
                ? <Empty text="No performance data yet. Captured automatically on each visit." />
                : (
                  <div className="space-y-4">
                    {(stats.perfMetrics ?? []).map((p, i) => {
                      const total = N(p.fast) + N(p.ok) + N(p.slow);
                      return (
                        <div key={i} className="border border-neutral-900 rounded-sm p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="font-vercetti text-xs text-neutral-300 uppercase tracking-widest">{p.metric === "load" ? "Page load" : "First contentful paint"}</div>
                            <div className="flex gap-4">
                              <div className="text-right">
                                <div className="font-vercetti text-[9px] text-neutral-600 uppercase">Avg</div>
                                <div className="font-soria text-xl text-white">{fmtMs(p.avg_ms)}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-vercetti text-[9px] text-neutral-600 uppercase">p75</div>
                                <div className="font-soria text-xl text-neutral-300">{fmtMs(p.p75_ms)}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-vercetti text-[9px] text-neutral-600 uppercase">Samples</div>
                                <div className="font-vercetti text-sm text-neutral-400">{fmtNum(p.samples)}</div>
                              </div>
                            </div>
                          </div>
                          {total > 0 && (
                            <>
                              <div className="flex h-2 rounded-sm overflow-hidden mb-2 gap-px">
                                {N(p.fast) > 0 && <div className="bg-emerald-500" style={{ width: `${pctOf(N(p.fast), total)}%` }} title={`Fast (<1s): ${fmtNum(p.fast)}`} />}
                                {N(p.ok) > 0 && <div className="bg-yellow-500" style={{ width: `${pctOf(N(p.ok), total)}%` }} title={`OK (1-3s): ${fmtNum(p.ok)}`} />}
                                {N(p.slow) > 0 && <div className="bg-red-500" style={{ width: `${pctOf(N(p.slow), total)}%` }} title={`Slow (>3s): ${fmtNum(p.slow)}`} />}
                              </div>
                              <div className="flex gap-4 font-vercetti text-[9px]">
                                <span className="text-emerald-600">■ Fast &lt;1s: {fmtNum(p.fast)} ({pctOf(N(p.fast), total)}%)</span>
                                <span className="text-yellow-600">■ OK 1-3s: {fmtNum(p.ok)} ({pctOf(N(p.ok), total)}%)</span>
                                <span className="text-red-600">■ Slow &gt;3s: {fmtNum(p.slow)} ({pctOf(N(p.slow), total)}%)</span>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </Section>

            {/* ── SESSION PATHS ────────────────────────────────────────────── */}
            {(stats.flowPaths ?? []).length > 0 && (
              <Section title="Top session paths" note="Most common ordered sequences of portals opened">
                <table className="w-full font-vercetti text-xs">
                  <thead>
                    <tr className="border-b border-neutral-800 text-left text-[9px] uppercase tracking-widest text-neutral-600">
                      <th className="py-1.5 font-normal">Path</th>
                      <th className="py-1.5 text-right font-normal">Sessions</th>
                      <th className="py-1.5 text-right font-normal">Visitors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.flowPaths.map((p, i) => (
                      <tr key={i} className="border-b border-neutral-900">
                        <td className="py-1.5 text-neutral-300 break-all">{p.path.split(" → ").map(prettyLabel).join(" → ")}</td>
                        <td className="py-1.5 text-right tabular-nums text-neutral-400">{fmtNum(p.sessions)}</td>
                        <td className="py-1.5 text-right tabular-nums text-neutral-700">{fmtNum(p.visitors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            {/* ── VISITOR JOURNAL ──────────────────────────────────────────── */}
            <Section title={`Visitor journal — last ${days} days`} note="Click a row to see full event timeline">
              <SessionJournal days={days} />
            </Section>
          </>
        )}
      </div>
      )}
    </div>
  );
};

export default DevkitPage;
