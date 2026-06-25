// Minimal .env loader — reads key='value' pairs from a .env file and sets
// them on process.env if not already set. On Hostinger the file lives at
// .builds/config/.env (relative to public_html); locally it's just ./.env.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
for (const candidate of [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../public_html/.builds/config/.env"),
  resolve(process.cwd(), "../../public_html/.builds/config/.env"),
]) {
  try {
    const raw = readFileSync(candidate, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z_]+)\s*=\s*'(.*)'\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
    break;
  } catch { /* file not found, try next */ }
}

// Plain-stdout boot banner so hosts that don't capture pino output (e.g. some
// shared-hosting Node panels) still see something on cold start.
// eslint-disable-next-line no-console
console.log(`[boot] api-server starting; node=${process.version} pid=${process.pid} cwd=${process.cwd()}`);

import app from "./app";
import { logger } from "./lib/logger";
import { getPool, isDevkitConfigured } from "./lib/mysql";

const rawPort = process.env["PORT"] ?? "3000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  // eslint-disable-next-line no-console
  console.error(`[boot] Invalid PORT value: "${rawPort}"`);
  process.exit(1);
}

// eslint-disable-next-line no-console
console.log(`[boot] listening on port ${port}`);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Initialize devkit MySQL pool + schema at boot so failures surface immediately.
  if (isDevkitConfigured()) {
    getPool()
      .then(() => logger.info("Devkit MySQL: connected and schema ensured"))
      .catch((dbErr) => logger.error({ err: dbErr }, "Devkit MySQL: connection failed at boot"));
  } else {
    logger.warn("Devkit MySQL: not configured (HOSTINGER_DB_* / DEVKIT_PASSWORD missing); /api/devkit/events will silently no-op");
  }
});
