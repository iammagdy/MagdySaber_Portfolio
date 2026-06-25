/**
 * Devkit DB adapter — auto-selects backend:
 *  • MySQL  when HOSTINGER_DB_HOST is set to a non-localhost value (production on Hostinger)
 *  • PostgreSQL via DATABASE_URL otherwise (dev on Replit / any PG host)
 */
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------
const useMySQL = () => !process.env.DATABASE_URL;

const hasMysqlCreds = () =>
  !!(process.env.HOSTINGER_DB_HOST &&
    process.env.HOSTINGER_DB_USER &&
    process.env.HOSTINGER_DB_PASSWORD &&
    process.env.HOSTINGER_DB_NAME);

export const isDevkitConfigured = (): boolean => {
  if (!process.env.DEVKIT_PASSWORD) return false;
  return useMySQL() ? hasMysqlCreds() : !!process.env.DATABASE_URL;
};

// ---------------------------------------------------------------------------
// Unified pool interface
// ---------------------------------------------------------------------------
export interface DevkitPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  execute(sql: string, params?: unknown[]): Promise<void>;
}

// ---------------------------------------------------------------------------
// MySQL adapter
// ---------------------------------------------------------------------------
let mysqlPool: import("mysql2/promise").Pool | null = null;
let mysqlInitPromise: Promise<void> | null = null;

const getMysqlPool = async (): Promise<DevkitPool> => {
  if (mysqlPool) return wrapMysql(mysqlPool);
  if (mysqlInitPromise) { await mysqlInitPromise; return wrapMysql(mysqlPool!); }
  mysqlInitPromise = (async () => {
    const { default: mysql } = await import("mysql2/promise");
    const created = mysql.createPool({
      host: process.env.HOSTINGER_DB_HOST,
      port: Number(process.env.HOSTINGER_DB_PORT ?? 3306),
      user: process.env.HOSTINGER_DB_USER,
      password: process.env.HOSTINGER_DB_PASSWORD,
      database: process.env.HOSTINGER_DB_NAME,
      connectionLimit: 3,
      waitForConnections: true,
      connectTimeout: 10_000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30_000,
    });
    await created.query(`
      CREATE TABLE IF NOT EXISTS devkit_events (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        ts DATETIME(3) NOT NULL,
        session_id CHAR(36) NOT NULL,
        visitor_id CHAR(36) NOT NULL,
        kind VARCHAR(32) NOT NULL,
        path VARCHAR(255) DEFAULT NULL,
        target VARCHAR(128) DEFAULT NULL,
        label VARCHAR(255) DEFAULT NULL,
        country CHAR(2) DEFAULT NULL,
        device VARCHAR(16) DEFAULT NULL,
        browser VARCHAR(32) DEFAULT NULL,
        os VARCHAR(32) DEFAULT NULL,
        referrer VARCHAR(512) DEFAULT NULL,
        duration_ms INT UNSIGNED DEFAULT NULL,
        utm_source VARCHAR(128) DEFAULT NULL,
        utm_medium VARCHAR(64) DEFAULT NULL,
        utm_campaign VARCHAR(128) DEFAULT NULL,
        is_returning TINYINT(1) DEFAULT 0,
        PRIMARY KEY (id),
        KEY idx_ts (ts),
        KEY idx_session (session_id),
        KEY idx_kind_ts (kind, ts)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    // Safe migration guards for existing production tables
    const migrations = [
      `ALTER TABLE devkit_events ADD COLUMN IF NOT EXISTS utm_source VARCHAR(128) DEFAULT NULL`,
      `ALTER TABLE devkit_events ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(64) DEFAULT NULL`,
      `ALTER TABLE devkit_events ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(128) DEFAULT NULL`,
      `ALTER TABLE devkit_events ADD COLUMN IF NOT EXISTS is_returning TINYINT(1) DEFAULT 0`,
    ];
    for (const sql of migrations) {
      try { await created.query(sql); } catch (e) { logger.warn({ err: e }, "mysql migration warning (safe to ignore)"); }
    }
    await created.query(`
      CREATE TABLE IF NOT EXISTS devkit_webauthn (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        credential_id VARCHAR(512) NOT NULL,
        public_key TEXT NOT NULL,
        counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
        transports TEXT DEFAULT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_cred_id (credential_id(255))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await created.query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        section VARCHAR(64) NOT NULL,
        data JSON NOT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (section)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    mysqlPool = created;
    logger.info({ host: process.env.HOSTINGER_DB_HOST }, "Devkit MySQL: connected and schema ensured");
  })();
  try { await mysqlInitPromise; } catch (err) { mysqlInitPromise = null; throw err; }
  return wrapMysql(mysqlPool!);
};

const wrapMysql = (p: import("mysql2/promise").Pool): DevkitPool => ({
  async query(sql, params) {
    const [rows] = await p.query(sql, params);
    return { rows: rows as Record<string, unknown>[] };
  },
  async execute(sql, params) {
    await p.execute(sql, params);
  },
});

// ---------------------------------------------------------------------------
// PostgreSQL adapter
// ---------------------------------------------------------------------------
let pgPool: import("pg").Pool | null = null;

const getPgPool = async (): Promise<DevkitPool> => {
  if (pgPool) return wrapPg(pgPool);
  const { default: pg } = await import("pg");
  const created = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  await created.query(`
    CREATE TABLE IF NOT EXISTS devkit_events (
      id BIGSERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      session_id CHAR(36) NOT NULL,
      visitor_id CHAR(36) NOT NULL,
      kind VARCHAR(32) NOT NULL,
      path VARCHAR(255),
      target VARCHAR(128),
      label VARCHAR(255),
      country CHAR(2),
      device VARCHAR(16),
      browser VARCHAR(32),
      os VARCHAR(32),
      referrer VARCHAR(512),
      duration_ms INTEGER,
      utm_source VARCHAR(128),
      utm_medium VARCHAR(64),
      utm_campaign VARCHAR(128),
      is_returning SMALLINT DEFAULT 0
    )
  `);
  await created.query(`CREATE INDEX IF NOT EXISTS idx_devkit_ts ON devkit_events (ts)`);
  await created.query(`CREATE INDEX IF NOT EXISTS idx_devkit_session ON devkit_events (session_id)`);
  await created.query(`CREATE INDEX IF NOT EXISTS idx_devkit_kind_ts ON devkit_events (kind, ts)`);
  // Safe migration guards for existing dev tables
  const pgMigrations = [
    `ALTER TABLE devkit_events ADD COLUMN IF NOT EXISTS utm_source VARCHAR(128)`,
    `ALTER TABLE devkit_events ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(64)`,
    `ALTER TABLE devkit_events ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(128)`,
    `ALTER TABLE devkit_events ADD COLUMN IF NOT EXISTS is_returning SMALLINT DEFAULT 0`,
  ];
  for (const sql of pgMigrations) {
    try { await created.query(sql); } catch (e) { logger.warn({ err: e }, "pg migration warning (safe to ignore)"); }
  }
  await created.query(`
    CREATE TABLE IF NOT EXISTS devkit_webauthn (
      id SERIAL PRIMARY KEY,
      credential_id TEXT NOT NULL UNIQUE,
      public_key TEXT NOT NULL,
      counter BIGINT NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await created.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      section VARCHAR(64) PRIMARY KEY,
      data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  pgPool = created;
  logger.info("devkit postgres pool ready");
  return wrapPg(pgPool);
};

const toPostgres = (sql: string): string => {
  let s = sql;
  // ? → $1 $2 …
  let n = 0;
  s = s.replace(/\?/g, () => `$${++n}`);
  // INTERVAL $N <UNIT> → $N * INTERVAL '1 <unit>'  (parameterized placeholder, any unit)
  s = s.replace(
    /INTERVAL\s+(\$\d+)\s+(DAYS?|HOURS?|MINUTES?|SECONDS?|WEEKS?|MONTHS?|YEARS?)/gi,
    (_, ref: string, unit: string) => `${ref} * INTERVAL '1 ${unit.toLowerCase().replace(/s$/, "")}'`,
  );
  // INTERVAL 7 DAY → INTERVAL '7 day'  (numeric literal, any unit)
  s = s.replace(
    /INTERVAL\s+(\d+)\s+(DAYS?|HOURS?|MINUTES?|SECONDS?|WEEKS?|MONTHS?|YEARS?)/gi,
    (_, n: string, unit: string) => `INTERVAL '${n} ${unit.toLowerCase().replace(/s$/, "")}'`,
  );
  // GROUP_CONCAT(col ORDER BY a, b SEPARATOR 'x') → STRING_AGG(col, 'x' ORDER BY a, b)
  s = s.replace(
    /GROUP_CONCAT\((\w+)\s+ORDER\s+BY\s+([\w\s,]+?)\s+SEPARATOR\s+'([^']+)'\)/gi,
    (_m, col: string, orderBy: string, sep: string) =>
      `STRING_AGG(${col}, '${sep}' ORDER BY ${orderBy.trim()})`,
  );
  // FROM (SELECT 1) t  →  FROM (SELECT 1) AS t(v)
  s = s.replace(/FROM\s+\(SELECT\s+1\)\s+(\w+)/gi, "FROM (SELECT 1) AS $1(v)");
  // ON DUPLICATE KEY UPDATE data = VALUES(data) → ON CONFLICT (section) DO UPDATE SET data = EXCLUDED.data
  s = s.replace(
    /ON\s+DUPLICATE\s+KEY\s+UPDATE\s+(\w+)\s*=\s*VALUES\(\1\)/gi,
    "ON CONFLICT (section) DO UPDATE SET $1 = EXCLUDED.$1",
  );
  // TIMESTAMPDIFF(SECOND, a, b) → EXTRACT(EPOCH FROM (b - a))
  s = s.replace(
    /TIMESTAMPDIFF\s*\(\s*SECOND\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi,
    (_: string, a: string, b: string) => `EXTRACT(EPOCH FROM (${b.trim()} - ${a.trim()}))`,
  );
  return s;
};

const wrapPg = (p: import("pg").Pool): DevkitPool => ({
  async query(sql, params) {
    const result = await p.query(toPostgres(sql), params);
    return { rows: result.rows as Record<string, unknown>[] };
  },
  async execute(sql, params) {
    await p.query(toPostgres(sql), params);
  },
});

// ---------------------------------------------------------------------------
// Public getPool
// ---------------------------------------------------------------------------
export const getPool = async (): Promise<DevkitPool> => {
  return useMySQL() ? getMysqlPool() : getPgPool();
};
