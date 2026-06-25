import { Router, type IRouter } from "express";
import crypto from "node:crypto";
import { UAParser } from "ua-parser-js";
import { logger } from "../lib/logger";
import { getPool, isDevkitConfigured } from "../lib/mysql";
import { issueDevkitCookie, clearDevkitCookie, isDevkitAuthed, requireDevkitAuth } from "../lib/devkitAuth";
import { getCountry, getClientIp } from "../lib/geoCache";
import { allow as rateLimitAllow, allowLogin } from "../lib/rateLimit";
import { maybeNotify } from "../lib/notifier";
import {
  getRegistrationOptions,
  verifyRegistration,
  getAuthOptions,
  verifyAuth,
  hasPasskey,
  removePasskey,
} from "../lib/devkitWebAuthn";

const router: IRouter = Router();

const ALLOWED_KINDS = new Set([
  "pageview", "click", "session_end", "theme_change",
  "portal_open", "portal_close", "perf",
]);

const clip = (s: unknown, max: number): string | null => {
  if (typeof s !== "string" || s.length === 0) return null;
  return s.length > max ? s.slice(0, max) : s;
};

const deviceFromUA = (ua: string) => {
  const parser = new UAParser(ua);
  const r = parser.getResult();
  const t = r.device.type;
  let device = "desktop";
  if (t === "mobile") device = "mobile";
  else if (t === "tablet") device = "tablet";
  return { device, browser: r.browser.name ?? null, os: r.os.name ?? null };
};

const isAllowedOrigin = (req: { headers: Record<string, string | string[] | undefined> }): boolean => {
  const origin = req.headers["origin"];
  const referer = req.headers["referer"];
  const src = (typeof origin === "string" && origin) || (typeof referer === "string" && referer) || "";
  if (!src) return true;
  try {
    const host = new URL(src).hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.endsWith(".replit.dev") || host.endsWith(".replit.app")) return true;
    if (host === "magdysaber.com" || host.endsWith(".magdysaber.com")) return true;
    return false;
  } catch { return false; }
};

const BOT_RE = /(bot|crawl|spider|slurp|bingpreview|mediapartners|facebookexternalhit|whatsapp|telegrambot|discordbot|linkedinbot|twitterbot|embedly|pingdom|uptimerobot|gtmetrix|lighthouse|monitor|wget|curl|httpclient|python-requests|axios|node-fetch|headless|phantomjs|selenium|puppeteer|playwright)/i;
const isBotUA = (ua: string) => (!ua || ua.length < 8) || BOT_RE.test(ua);

// ─── Event ingestion ──────────────────────────────────────────────────────────
router.post("/devkit/events", async (req, res) => {
  if (!isDevkitConfigured()) { res.status(204).end(); return; }
  if (!isAllowedOrigin(req)) { res.status(204).end(); return; }
  const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "";
  if (isBotUA(ua)) { res.status(204).end(); return; }
  const ipKey = getClientIp(req) ?? "unknown";
  if (!rateLimitAllow(ipKey)) { res.status(429).end(); return; }
  try {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body) { res.status(400).json({ error: "bad request" }); return; }
    const dnt = body.dnt === true || body.dnt === "1" || req.headers["dnt"] === "1";
    if (dnt) { res.status(204).end(); return; }
    const kind = typeof body.kind === "string" ? body.kind : "";
    if (!ALLOWED_KINDS.has(kind)) { res.status(400).json({ error: "bad kind" }); return; }
    let sessionId = typeof body.sessionId === "string" && /^[0-9a-f-]{8,40}$/i.test(body.sessionId) ? body.sessionId : crypto.randomUUID();
    let visitorId = typeof body.visitorId === "string" && /^[0-9a-f-]{8,40}$/i.test(body.visitorId) ? body.visitorId : crypto.randomUUID();
    if (sessionId.length > 36) sessionId = sessionId.slice(0, 36);
    if (visitorId.length > 36) visitorId = visitorId.slice(0, 36);
    const path = clip(body.path, 255);
    if (path === "/devkit" || path?.startsWith("/devkit")) { res.status(204).end(); return; }
    const target = clip(body.target, 128);
    const label = clip(body.label, 255);
    const referrer = clip(body.referrer, 512);
    const durationMs = typeof body.durationMs === "number" && body.durationMs >= 0 && body.durationMs < 86_400_000 ? Math.floor(body.durationMs) : null;
    const utmSource = clip(body.utmSource, 128);
    const utmMedium = clip(body.utmMedium, 64);
    const utmCampaign = clip(body.utmCampaign, 128);
    const isReturning = body.isReturning === true || body.isReturning === 1 ? 1 : 0;
    const { device, browser, os } = deviceFromUA(ua);
    const ip = getClientIp(req);
    const country = await getCountry(ip);
    const pool = await getPool();
    await pool.execute(
      `INSERT INTO devkit_events
         (ts, session_id, visitor_id, kind, path, target, label, country, device, browser, os, referrer, duration_ms, utm_source, utm_medium, utm_campaign, is_returning)
       VALUES (NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [sessionId, visitorId, kind, path, target, label, country, device, browser, os, referrer, durationMs, utmSource, utmMedium, utmCampaign, isReturning],
    );
    if (kind === "pageview") {
      (async () => {
        try {
          const { rows } = await pool.query(
            "SELECT COUNT(*) AS cnt FROM devkit_events WHERE session_id = ? AND kind = 'pageview'",
            [sessionId],
          );
          const cnt = Number((rows as Array<Record<string, unknown>>)[0]?.cnt ?? 0);
          if (cnt === 1) {
            await maybeNotify({ country, device, referrer, utmSource, path, sessionId });
          }
        } catch (err) {
          logger.warn({ err }, "notifier: session-check error");
        }
      })();
    }
    res.status(204).end();
  } catch (err) {
    logger.warn({ err }, "devkit event insert failed");
    res.status(204).end();
  }
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.get("/devkit/session", (req, res) => { res.json({ authed: isDevkitAuthed(req) }); });

router.post("/devkit/login", (req, res) => {
  const ipKey = getClientIp(req) ?? "unknown";
  if (!allowLogin(ipKey)) { res.status(429).json({ error: "too many attempts" }); return; }
  const body = req.body as { password?: unknown } | undefined;
  const expected = process.env.DEVKIT_PASSWORD;
  if (!expected) { res.status(500).json({ error: "not configured" }); return; }
  const provided = typeof body?.password === "string" ? body.password : "";
  const ha = crypto.createHash("sha256").update(provided).digest();
  const hb = crypto.createHash("sha256").update(expected).digest();
  if (!crypto.timingSafeEqual(ha, hb)) { res.status(401).json({ error: "invalid password" }); return; }
  issueDevkitCookie(res);
  res.json({ ok: true });
});

router.post("/devkit/logout", (_req, res) => { clearDevkitCookie(res); res.json({ ok: true }); });

// ─── WebAuthn / Biometric ──────────────────────────────────────────────────
router.get("/devkit/webauthn/status", requireDevkitAuth, async (_req, res) => {
  try {
    const pool = await getPool();
    res.json({ hasPasskey: await hasPasskey(pool) });
  } catch { res.json({ hasPasskey: false }); }
});

router.get("/devkit/webauthn/register-options", requireDevkitAuth, async (_req, res) => {
  try {
    const pool = await getPool();
    const opts = await getRegistrationOptions(pool);
    res.json(opts);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

router.post("/devkit/webauthn/register", requireDevkitAuth, async (req, res) => {
  try {
    const pool = await getPool();
    const result = await verifyRegistration(pool, req.body);
    res.json(result);
  } catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

router.get("/devkit/webauthn/auth-options", async (_req, res) => {
  try {
    const pool = await getPool();
    const result = await getAuthOptions(pool);
    if ("error" in result) { res.status(404).json(result); return; }
    res.json(result.options);
  } catch (err) { res.status(500).json({ error: (err as Error).message }); }
});

router.post("/devkit/webauthn/authenticate", async (req, res) => {
  try {
    const pool = await getPool();
    const result = await verifyAuth(pool, req.body);
    if (result.ok) { issueDevkitCookie(res); }
    res.json(result);
  } catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

router.delete("/devkit/webauthn/passkey", requireDevkitAuth, async (_req, res) => {
  try {
    const pool = await getPool();
    await removePasskey(pool);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: (err as Error).message }); }
});

router.post("/devkit/reset", requireDevkitAuth, async (_req, res) => {
  try {
    if (!isDevkitConfigured()) { res.status(503).json({ error: "not configured" }); return; }
    const pool = await getPool();
    await pool.execute("DELETE FROM devkit_events WHERE 1=1");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "reset failed", detail: (err as Error).message });
  }
});

// ─── Perf metrics helper — JS-side JSON parsing for cross-DB compat + p75 ────
interface PerfStat {
  metric: string; avg_ms: number; p75_ms: number;
  fast: number; ok: number; slow: number; samples: number;
}
function processPerfMetrics(rows: Array<Record<string, unknown>>): PerfStat[] {
  const load: number[] = [];
  const fcp: number[] = [];
  for (const row of rows) {
    try {
      const data = JSON.parse(String(row.label)) as { load_ms?: number; fcp_ms?: number };
      if (typeof data.load_ms === "number" && data.load_ms > 0 && data.load_ms < 60_000) load.push(data.load_ms);
      if (typeof data.fcp_ms === "number" && data.fcp_ms > 0 && data.fcp_ms < 30_000) fcp.push(data.fcp_ms);
    } catch { /* skip malformed */ }
  }
  const stat = (metric: string, values: number[]): PerfStat | null => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    const p75 = Math.round(sorted[Math.min(Math.floor(sorted.length * 0.75), sorted.length - 1)]);
    return {
      metric, avg_ms: avg, p75_ms: p75,
      fast: values.filter(v => v < 1000).length,
      ok: values.filter(v => v >= 1000 && v < 3000).length,
      slow: values.filter(v => v >= 3000).length,
      samples: values.length,
    };
  };
  return [stat("load", load), stat("fcp", fcp)].filter((s): s is PerfStat => s !== null);
}

// ─── Stats helpers ────────────────────────────────────────────────────────────
const runQ = async (
  pool: Awaited<ReturnType<typeof getPool>>,
  errors: Record<string, string>,
  key: string,
  sql: string,
  params: unknown[] = [],
): Promise<unknown[]> => {
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } catch (err) {
    const e = err as { message?: string; code?: string };
    const msg = `${e?.code ?? "ERR"}: ${e?.message ?? "unknown"}`;
    errors[key] = msg;
    console.error(`[devkit/stats] ${key} failed:`, msg);
    return [];
  }
};

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get("/devkit/stats", requireDevkitAuth, async (req, res) => {
  try {
    if (!isDevkitConfigured()) { res.status(503).json({ error: "not configured" }); return; }
    const days = Math.max(1, Math.min(90, Number(req.query.days ?? 30)));
    let pool: Awaited<ReturnType<typeof getPool>>;
    try { pool = await getPool(); } catch (err) {
      res.status(500).json({ error: "database connection failed", detail: (err as Error).message });
      return;
    }
    const errors: Record<string, string> = {};

    const totals = await runQ(pool, errors, "totals",
      `SELECT COUNT(*) AS events,
              SUM(CASE WHEN kind='pageview' THEN 1 ELSE 0 END) AS pageviews,
              SUM(CASE WHEN kind='click' THEN 1 ELSE 0 END) AS clicks,
              COUNT(DISTINCT visitor_id) AS visitors,
              COUNT(DISTINCT session_id) AS sessions
       FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY`, [days]);

    const windows = await runQ(pool, errors, "windows",
      `SELECT
         COUNT(DISTINCT CASE WHEN ts >= NOW() - INTERVAL 1 DAY THEN session_id END) AS sessions_24h,
         COUNT(DISTINCT CASE WHEN ts >= NOW() - INTERVAL 7 DAY THEN session_id END) AS sessions_7d,
         COUNT(DISTINCT CASE WHEN ts >= NOW() - INTERVAL 30 DAY THEN session_id END) AS sessions_30d,
         COUNT(DISTINCT CASE WHEN ts >= NOW() - INTERVAL 1 DAY THEN visitor_id END) AS visitors_24h,
         COUNT(DISTINCT CASE WHEN ts >= NOW() - INTERVAL 7 DAY THEN visitor_id END) AS visitors_7d,
         COUNT(DISTINCT CASE WHEN ts >= NOW() - INTERVAL 30 DAY THEN visitor_id END) AS visitors_30d
       FROM devkit_events`);

    const daily = await runQ(pool, errors, "daily",
      `SELECT DATE(ts) AS day,
              SUM(CASE WHEN kind='pageview' THEN 1 ELSE 0 END) AS pageviews,
              COUNT(DISTINCT visitor_id) AS visitors
       FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY
       GROUP BY day ORDER BY day ASC`, [days]);

    const countries = await runQ(pool, errors, "countries",
      `SELECT country, COUNT(DISTINCT visitor_id) AS visitors
       FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY
         AND country IS NOT NULL AND country NOT IN ('Unknown','unknown')
       GROUP BY country ORDER BY visitors DESC LIMIT 15`, [days]);

    // Today's countries for the hero section
    const todayCountries = await runQ(pool, errors, "todayCountries",
      `SELECT country, COUNT(DISTINCT visitor_id) AS visitors
       FROM devkit_events WHERE ts >= NOW() - INTERVAL 1 DAY
         AND country IS NOT NULL AND country NOT IN ('Unknown','unknown')
       GROUP BY country ORDER BY visitors DESC LIMIT 12`);

    const devices = await runQ(pool, errors, "devices",
      `SELECT COALESCE(device, 'unknown') AS device, COUNT(DISTINCT visitor_id) AS visitors
       FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY
       GROUP BY device ORDER BY visitors DESC`, [days]);

    const oses = await runQ(pool, errors, "oses",
      `SELECT COALESCE(os, 'unknown') AS os, COUNT(DISTINCT visitor_id) AS visitors
       FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY
       GROUP BY os ORDER BY visitors DESC LIMIT 10`, [days]);

    const browsers = await runQ(pool, errors, "browsers",
      `SELECT COALESCE(browser, 'unknown') AS browser, COUNT(DISTINCT visitor_id) AS visitors
       FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY
       GROUP BY browser ORDER BY visitors DESC LIMIT 10`, [days]);

    const topEvents = await runQ(pool, errors, "topEvents",
      `SELECT kind, target, label, COUNT(*) AS hits
       FROM devkit_events
       WHERE ts >= NOW() - INTERVAL ? DAY AND target IS NOT NULL
         AND kind IN ('click','theme_change','portal_open')
       GROUP BY kind, target, label ORDER BY hits DESC LIMIT 25`, [days]);

    const sessionLen = await runQ(pool, errors, "sessionLength",
      `SELECT AVG(duration_ms) AS avg_ms, MAX(duration_ms) AS max_ms
       FROM devkit_events
       WHERE ts >= NOW() - INTERVAL ? DAY AND kind='session_end' AND duration_ms IS NOT NULL`, [days]);

    const flowTransitions = await runQ(pool, errors, "flowTransitions",
      `SELECT from_section, to_section, COUNT(*) AS hits
       FROM (
         SELECT session_id, target AS to_section,
                LAG(target) OVER (PARTITION BY session_id ORDER BY ts, id) AS from_section
         FROM devkit_events
         WHERE ts >= NOW() - INTERVAL ? DAY AND kind='portal_open' AND target IS NOT NULL
       ) t
       WHERE from_section IS NOT NULL AND from_section <> to_section
       GROUP BY from_section, to_section ORDER BY hits DESC LIMIT 20`, [days]);

    const flowPaths = await runQ(pool, errors, "flowPaths",
      `SELECT path, COUNT(*) AS sessions, COUNT(DISTINCT visitor_id) AS visitors
       FROM (
         SELECT session_id, MAX(visitor_id) AS visitor_id,
                GROUP_CONCAT(target ORDER BY ts, id SEPARATOR ' \u2192 ') AS path
         FROM devkit_events
         WHERE ts >= NOW() - INTERVAL ? DAY AND kind='portal_open' AND target IS NOT NULL
         GROUP BY session_id
       ) s
       WHERE path IS NOT NULL AND path <> ''
       GROUP BY path ORDER BY sessions DESC LIMIT 10`, [days]);

    const referrers = await runQ(pool, errors, "referrers",
      `SELECT referrer, COUNT(*) AS hits FROM devkit_events
       WHERE ts >= NOW() - INTERVAL ? DAY AND kind='pageview'
         AND referrer IS NOT NULL AND referrer <> ''
         AND referrer NOT LIKE '%replit.dev%'
         AND referrer NOT LIKE '%replit.com%'
         AND referrer NOT LIKE '%replit.app%'
       GROUP BY referrer ORDER BY hits DESC LIMIT 10`, [days]);

    const topPages = await runQ(pool, errors, "topPages",
      `SELECT path, COUNT(*) AS pageviews, COUNT(DISTINCT visitor_id) AS visitors
       FROM devkit_events
       WHERE ts >= NOW() - INTERVAL ? DAY AND kind='pageview'
         AND path IS NOT NULL AND path <> ''
       GROUP BY path ORDER BY pageviews DESC LIMIT 20`, [days]);

    const hourly = await runQ(pool, errors, "hourly",
      `SELECT FLOOR(EXTRACT(HOUR FROM ts)) AS hour,
              COUNT(*) AS events, COUNT(DISTINCT visitor_id) AS visitors
       FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY
       GROUP BY FLOOR(EXTRACT(HOUR FROM ts)) ORDER BY hour ASC`, [days]);

    const live = await runQ(pool, errors, "live",
      `SELECT COUNT(DISTINCT session_id) AS sessions, COUNT(DISTINCT visitor_id) AS visitors
       FROM devkit_events WHERE ts >= NOW() - INTERVAL 5 MINUTE`);

    const trends = await runQ(pool, errors, "trends",
      `SELECT
         COUNT(DISTINCT CASE WHEN ts >= NOW() - INTERVAL ? DAY THEN visitor_id END) AS vis_curr,
         COUNT(DISTINCT CASE WHEN ts < NOW() - INTERVAL ? DAY THEN visitor_id END) AS vis_prev,
         COUNT(DISTINCT CASE WHEN ts >= NOW() - INTERVAL ? DAY THEN session_id END) AS sess_curr,
         COUNT(DISTINCT CASE WHEN ts < NOW() - INTERVAL ? DAY THEN session_id END) AS sess_prev,
         SUM(CASE WHEN ts >= NOW() - INTERVAL ? DAY AND kind='pageview' THEN 1 ELSE 0 END) AS pv_curr,
         SUM(CASE WHEN ts < NOW() - INTERVAL ? DAY AND kind='pageview' THEN 1 ELSE 0 END) AS pv_prev,
         SUM(CASE WHEN ts >= NOW() - INTERVAL ? DAY AND kind='click' THEN 1 ELSE 0 END) AS clicks_curr,
         SUM(CASE WHEN ts < NOW() - INTERVAL ? DAY AND kind='click' THEN 1 ELSE 0 END) AS clicks_prev
       FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY`,
      [days, days, days, days, days, days, days, days, days * 2]);

    const bounceRate = await runQ(pool, errors, "bounceRate",
      `SELECT SUM(CASE WHEN pc <= 1 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0) AS bounce_rate
       FROM (
         SELECT session_id, SUM(CASE WHEN kind='pageview' THEN 1 ELSE 0 END) AS pc
         FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY
         GROUP BY session_id
       ) AS sub`, [days]);

    // ── NEW: section dwell times (server-side pairing of portal_open/portal_close per session) ──
    const sectionTimes = await runQ(pool, errors, "sectionTimes",
      `SELECT section, AVG(dur_sec) * 1000 AS avg_ms, MAX(dur_sec) * 1000 AS max_ms, COUNT(*) AS opens
       FROM (
         SELECT o.session_id, o.target AS section,
           TIMESTAMPDIFF(SECOND, o.ts, MIN(c.ts)) AS dur_sec
         FROM devkit_events o
         INNER JOIN devkit_events c
           ON c.session_id = o.session_id
           AND c.kind = 'portal_close'
           AND c.target = o.target
           AND c.ts > o.ts
         WHERE o.kind = 'portal_open'
           AND o.ts >= NOW() - INTERVAL ? DAY
           AND o.target IS NOT NULL
         GROUP BY o.session_id, o.target, o.ts, o.id
       ) t
       WHERE dur_sec > 0 AND dur_sec < 3600
       GROUP BY section ORDER BY avg_ms DESC`, [days]);

    // ── NEW: new vs returning visitors ──
    const returning = await runQ(pool, errors, "returning",
      `SELECT
         SUM(CASE WHEN is_ret = 1 THEN 1 ELSE 0 END) AS ret_sessions,
         SUM(CASE WHEN is_ret = 0 THEN 1 ELSE 0 END) AS new_sessions
       FROM (
         SELECT session_id, MAX(is_returning) AS is_ret
         FROM devkit_events
         WHERE ts >= NOW() - INTERVAL ? DAY AND kind='pageview'
         GROUP BY session_id
       ) sub`, [days]);

    // ── NEW: conversion events (footer links, social, contact, CV) ──
    const conversions = await runQ(pool, errors, "conversions",
      `SELECT target, label, COUNT(*) AS hits, COUNT(DISTINCT visitor_id) AS unique_visitors
       FROM devkit_events
       WHERE ts >= NOW() - INTERVAL ? DAY AND kind='click'
         AND (
           target LIKE 'footer:%' OR
           LOWER(target) LIKE '%email%' OR LOWER(target) LIKE '%linkedin%' OR
           LOWER(target) LIKE '%github%' OR LOWER(target) LIKE '%contact%' OR
           LOWER(label) LIKE '%mailto%' OR LOWER(label) LIKE '%.pdf%'
         )
       GROUP BY target, label ORDER BY hits DESC LIMIT 20`, [days]);

    // ── NEW: exit sections (last portal_open per session, anchored to sessions that have session_end) ──
    const exitSections = await runQ(pool, errors, "exitSections",
      `SELECT last_portal, COUNT(*) AS sessions
       FROM (
         SELECT po.session_id, po.target AS last_portal,
                ROW_NUMBER() OVER (PARTITION BY po.session_id ORDER BY po.ts DESC, po.id DESC) AS rn
         FROM devkit_events po
         INNER JOIN devkit_events se
           ON se.session_id = po.session_id
           AND se.kind = 'session_end'
           AND po.ts <= se.ts
           AND se.ts >= NOW() - INTERVAL ? DAY
         WHERE po.kind = 'portal_open'
           AND po.ts >= NOW() - INTERVAL ? DAY
           AND po.target IS NOT NULL
       ) t
       WHERE rn = 1
       GROUP BY last_portal ORDER BY sessions DESC LIMIT 10`, [days, days]);

    // ── NEW: engagement funnel ──
    const funnel = await runQ(pool, errors, "funnel",
      `SELECT
         COUNT(DISTINCT all_s.session_id) AS total_sessions,
         COUNT(DISTINCT CASE WHEN po.portal_count >= 1 THEN all_s.session_id END) AS opened_any,
         COUNT(DISTINCT CASE WHEN po.portal_count >= 2 THEN all_s.session_id END) AS opened_2plus,
         COUNT(DISTINCT CASE WHEN po.portal_count >= 3 THEN all_s.session_id END) AS opened_3plus
       FROM (SELECT DISTINCT session_id FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY) all_s
       LEFT JOIN (
         SELECT session_id, COUNT(*) AS portal_count
         FROM devkit_events
         WHERE ts >= NOW() - INTERVAL ? DAY AND kind='portal_open'
         GROUP BY session_id
       ) po ON po.session_id = all_s.session_id`, [days, days]);

    // ── NEW: UTM / campaign sources ──
    const utmSources = await runQ(pool, errors, "utmSources",
      `SELECT utm_source, utm_medium, utm_campaign,
              COUNT(DISTINCT visitor_id) AS visitors, COUNT(DISTINCT session_id) AS sessions
       FROM devkit_events
       WHERE ts >= NOW() - INTERVAL ? DAY
         AND utm_source IS NOT NULL AND utm_source <> ''
       GROUP BY utm_source, utm_medium, utm_campaign
       ORDER BY visitors DESC LIMIT 20`, [days]);

    // ── NEW: performance metrics — fetch raw perf labels, process in JS for p75 and cross-DB compat ──
    // Each perf event has label=JSON.stringify({load_ms, fcp_ms}) per the tracker spec.
    const perfRaw = await runQ(pool, errors, "perfRaw",
      `SELECT label FROM devkit_events
       WHERE ts >= NOW() - INTERVAL ? DAY AND kind='perf' AND label IS NOT NULL
       LIMIT 10000`, [days]);
    const perfMetrics = processPerfMetrics(perfRaw as Array<Record<string, unknown>>);

    res.json({
      days,
      totals: (totals as Array<Record<string, unknown>>)[0] ?? {},
      windows: (windows as Array<Record<string, unknown>>)[0] ?? {},
      daily, countries, todayCountries, devices, oses, browsers, topEvents,
      sessionLength: (sessionLen as Array<Record<string, unknown>>)[0] ?? {},
      referrers, flowTransitions, flowPaths,
      topPages, hourly,
      live: (live as Array<Record<string, unknown>>)[0] ?? {},
      trends: (trends as Array<Record<string, unknown>>)[0] ?? {},
      bounceRate: (bounceRate as Array<Record<string, unknown>>)[0] ?? {},
      sectionTimes,
      returning: (returning as Array<Record<string, unknown>>)[0] ?? {},
      conversions,
      exitSections,
      funnel: (funnel as Array<Record<string, unknown>>)[0] ?? {},
      utmSources,
      perfMetrics,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    });
  } catch (err) {
    logger.error({ err }, "devkit stats failed");
    res.status(500).json({ error: "stats failed", detail: (err as Error).message });
  }
});

// ─── Session journal ──────────────────────────────────────────────────────────
router.get("/devkit/sessions", requireDevkitAuth, async (req, res) => {
  if (!isDevkitConfigured()) { res.status(503).json({ error: "not configured" }); return; }
  const days = Math.max(1, Math.min(90, Number(req.query.days ?? 7)));
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)));
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT
         session_id,
         MAX(visitor_id) AS visitor_id,
         MAX(country) AS country,
         MAX(device) AS device,
         MAX(os) AS os,
         MAX(browser) AS browser,
         MIN(ts) AS first_seen,
         MAX(ts) AS last_seen,
         COUNT(*) AS event_count,
         SUM(CASE WHEN kind='pageview' THEN 1 ELSE 0 END) AS pageviews,
         SUM(CASE WHEN kind='click' THEN 1 ELSE 0 END) AS clicks,
         MAX(CASE WHEN kind='session_end' THEN duration_ms END) AS duration_ms,
         MAX(is_returning) AS is_returning,
         MAX(utm_source) AS utm_source
       FROM devkit_events
       WHERE ts >= NOW() - INTERVAL ? DAY
       GROUP BY session_id
       ORDER BY first_seen DESC
       LIMIT ?`,
      [days, limit],
    );
    res.json({ sessions: rows });
  } catch (err) {
    res.status(500).json({ error: "failed", detail: (err as Error).message });
  }
});

router.get("/devkit/sessions/:sid", requireDevkitAuth, async (req, res) => {
  if (!isDevkitConfigured()) { res.status(503).json({ error: "not configured" }); return; }
  const sid = req.params.sid;
  if (!sid || !/^[0-9a-f-]{8,40}$/i.test(sid)) { res.status(400).json({ error: "invalid session id" }); return; }
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT ts, kind, path, target, label, duration_ms
       FROM devkit_events WHERE session_id = ?
       ORDER BY ts ASC LIMIT 500`,
      [sid],
    );
    res.json({ events: rows });
  } catch (err) {
    res.status(500).json({ error: "failed", detail: (err as Error).message });
  }
});

// ─── Health + Export ──────────────────────────────────────────────────────────
router.get("/devkit/health", requireDevkitAuth, async (_req, res) => {
  const out: Record<string, unknown> = {
    env: {
      DEVKIT_PASSWORD: !!process.env.DEVKIT_PASSWORD,
      HOSTINGER_DB_HOST: process.env.HOSTINGER_DB_HOST ?? null,
      DATABASE_URL: !!process.env.DATABASE_URL,
    },
    configured: isDevkitConfigured(),
  };
  try {
    const pool = await getPool();
    out.pool = "ok";
    try {
      const { rows: v } = await pool.query("SELECT 1 AS n");
      out.db_ping = (v as Array<{ n: unknown }>)[0]?.n !== undefined ? "ok" : "no-row";
    } catch (err) { out.ping_error = (err as Error).message; }
    try {
      const { rows: t } = await pool.query("SELECT COUNT(*) AS n FROM devkit_events");
      out.events_count = Number((t as Array<{ n: unknown }>)[0]?.n ?? 0);
    } catch (err) { out.table_error = (err as Error).message; }
    try {
      const { rows: cols } = await pool.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name='devkit_events' ORDER BY ordinal_position`,
      );
      out.columns = (cols as Array<{ column_name?: string; COLUMN_NAME?: string }>)
        .map(c => c.column_name ?? c.COLUMN_NAME);
    } catch { /* skip */ }
  } catch (err) { out.pool = `ERR: ${(err as Error).message}`; }
  res.json(out);
});

const csvEscape = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get("/devkit/export.csv", requireDevkitAuth, async (req, res) => {
  try {
    if (!isDevkitConfigured()) { res.status(503).end("not configured"); return; }
    const days = Math.max(1, Math.min(365, Number(req.query.days ?? 30)));
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT ts, session_id, visitor_id, kind, path, target, label, country, device, browser, os,
              referrer, duration_ms, utm_source, utm_medium, utm_campaign, is_returning
       FROM devkit_events WHERE ts >= NOW() - INTERVAL ? DAY ORDER BY ts ASC LIMIT 100000`,
      [days],
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="devkit-${days}d.csv"`);
    res.write("ts,session_id,visitor_id,kind,path,target,label,country,device,browser,os,referrer,duration_ms,utm_source,utm_medium,utm_campaign,is_returning\n");
    for (const r of rows as Array<Record<string, unknown>>) {
      res.write([
        r.ts, r.session_id, r.visitor_id, r.kind, r.path, r.target, r.label,
        r.country, r.device, r.browser, r.os, r.referrer, r.duration_ms,
        r.utm_source, r.utm_medium, r.utm_campaign, r.is_returning,
      ].map(csvEscape).join(",") + "\n");
    }
    res.end();
  } catch (err) {
    logger.error({ err }, "devkit csv export failed");
    res.status(500).end("export failed");
  }
});

// ─── Site Settings ───────────────────────────────────────────────────────────
const VALID_SECTIONS = new Set([
  "footer_links", "projects", "work_timeline", "education_timeline", "site_version",
]);

// Public read — no auth, cached 60s by the browser
router.get("/public/site-settings", async (_req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT section, data FROM site_settings`,
    );
    const out: Record<string, unknown> = {};
    for (const r of rows as Array<{ section: string; data: unknown }>) {
      let val = r.data;
      if (typeof val === "string") { try { val = JSON.parse(val); } catch { /* keep raw */ } }
      out[r.section] = val;
    }
    res.set("Cache-Control", "public, max-age=60");
    res.json(out);
  } catch (err) {
    logger.error({ err }, "site-settings public read failed");
    res.status(500).json({ error: "failed" });
  }
});

// Authed read all
router.get("/devkit/settings", requireDevkitAuth, async (_req, res) => {
  try {
    const pool = await getPool();
    const { rows } = await pool.query(
      `SELECT section, data, updated_at FROM site_settings`,
    );
    const out: Record<string, { data: unknown; updated_at: string }> = {};
    for (const r of rows as Array<{ section: string; data: unknown; updated_at: string }>) {
      let val = r.data;
      if (typeof val === "string") { try { val = JSON.parse(val); } catch { /* keep raw */ } }
      out[r.section] = { data: val, updated_at: r.updated_at };
    }
    res.json(out);
  } catch (err) {
    logger.error({ err }, "site-settings read failed");
    res.status(500).json({ error: "failed" });
  }
});

// Authed upsert a section
router.put("/devkit/settings/:section", requireDevkitAuth, async (req, res) => {
  const section = req.params.section as string;
  if (!VALID_SECTIONS.has(section)) {
    res.status(400).json({ error: "invalid section" });
    return;
  }
  try {
    const pool = await getPool();
    await pool.execute(
      `INSERT INTO site_settings (section, data) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data)`,
      [section, JSON.stringify(req.body?.data ?? null)],
    );
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "site-settings upsert failed");
    res.status(500).json({ error: "failed" });
  }
});

// Authed delete a section (revert to hardcoded)
router.delete("/devkit/settings/:section", requireDevkitAuth, async (req, res) => {
  const section = req.params.section as string;
  if (!VALID_SECTIONS.has(section)) {
    res.status(400).json({ error: "invalid section" });
    return;
  }
  try {
    const pool = await getPool();
    await pool.execute(`DELETE FROM site_settings WHERE section = ?`, [section]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "site-settings delete failed");
    res.status(500).json({ error: "failed" });
  }
});

export default router;
