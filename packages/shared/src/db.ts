import type BetterSqlite3 from "better-sqlite3";
import * as path from "node:path";
import { getDbPath } from "./paths.js";

// ---------------------------------------------------------------------------
// Runtime-aware loader
// ---------------------------------------------------------------------------
// better-sqlite3 is a native addon. Its binary is compiled against a specific
// Node ABI. Electron ships its own Node fork with a different ABI than the
// system Node.js used by the CLI.
//
// Two compiled copies are maintained:
//   node_modules/better-sqlite3/           — Node ABI (CLI)
//   node_modules/better-sqlite3-electron/  — Electron ABI (desktop)
// ---------------------------------------------------------------------------

let DatabaseCtor: typeof BetterSqlite3 | undefined;

function getConstructor(): typeof BetterSqlite3 {
  if (DatabaseCtor) return DatabaseCtor;

  const isElectron =
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    typeof (process.versions as Record<string, unknown>)["electron"] === "string";

  if (isElectron) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      DatabaseCtor = require("better-sqlite3-electron") as typeof BetterSqlite3;
    } catch {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const path = require("node:path");
        const resPath = (process as any).resourcesPath || path.join(__dirname, "../../..");
        const unpackedPath = path.join(resPath, "app.asar.unpacked", "node_modules", "better-sqlite3-electron");
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        DatabaseCtor = require(unpackedPath) as typeof BetterSqlite3;
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        DatabaseCtor = require("better-sqlite3") as typeof BetterSqlite3;
      }
    }
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    DatabaseCtor = require("better-sqlite3") as typeof BetterSqlite3;
  }

  return DatabaseCtor;
}

/**
 * Opens (or creates) the SQLite database and applies the schema migration.
 * Safe to call multiple times — all DDL uses IF NOT EXISTS.
 */
export function openDatabase(customPath?: string): BetterSqlite3.Database {
  const Ctor = getConstructor();
  const dbPath = customPath ? path.resolve(customPath) : getDbPath();
  const db = new Ctor(dbPath);

  // WAL allows the CLI and Electron to read concurrently
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  applyMigrations(db);
  return db;
}

function applyMigrations(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id            TEXT    NOT NULL PRIMARY KEY,
      type          TEXT    NOT NULL,
      payload       TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'PENDING',
      delivery_type TEXT,
      created_at    TEXT    NOT NULL,
      synced_at     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_status
      ON events (status);

    CREATE INDEX IF NOT EXISTS idx_events_created_at
      ON events (created_at);

    CREATE TABLE IF NOT EXISTS projects (
      id           TEXT    NOT NULL PRIMARY KEY,
      name         TEXT    NOT NULL,
      path         TEXT    NOT NULL UNIQUE,
      created_at   TEXT    NOT NULL,
      last_scan_at TEXT,
      status       TEXT    NOT NULL DEFAULT 'ACTIVE'
    );

    CREATE INDEX IF NOT EXISTS idx_projects_path
      ON projects (path);

    CREATE TABLE IF NOT EXISTS scans (
      id                TEXT    NOT NULL PRIMARY KEY,
      project_id        TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      files_scanned     INTEGER NOT NULL DEFAULT 0,
      packages_detected INTEGER NOT NULL DEFAULT 0,
      changes_detected  INTEGER NOT NULL DEFAULT 0,
      duration_ms       INTEGER NOT NULL DEFAULT 0,
      status            TEXT    NOT NULL DEFAULT 'SUCCESS',
      result_json       TEXT    NOT NULL,
      created_at        TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scans_project_id
      ON scans (project_id);

    CREATE INDEX IF NOT EXISTS idx_scans_created_at
      ON scans (created_at);

    CREATE TABLE IF NOT EXISTS snapshots (
      id            TEXT    NOT NULL PRIMARY KEY,
      project_id    TEXT    NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name          TEXT    NOT NULL,
      description   TEXT,
      file_count    INTEGER NOT NULL DEFAULT 0,
      package_count INTEGER NOT NULL DEFAULT 0,
      manifest_json TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'ACTIVE',
      created_at    TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_project_id
      ON snapshots (project_id);

    CREATE INDEX IF NOT EXISTS idx_snapshots_created_at
      ON snapshots (created_at);

    CREATE TABLE IF NOT EXISTS snapshot_files (
      id            TEXT    NOT NULL PRIMARY KEY,
      snapshot_id   TEXT    NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
      relative_path TEXT    NOT NULL,
      file_hash     TEXT    NOT NULL,
      size_bytes    INTEGER NOT NULL DEFAULT 0,
      storage_path  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_snapshot_files_snapshot_id
      ON snapshot_files (snapshot_id);

    CREATE TABLE IF NOT EXISTS history (
      id           TEXT    NOT NULL PRIMARY KEY,
      project_id   TEXT,
      event_type   TEXT    NOT NULL,
      description  TEXT    NOT NULL,
      details_json TEXT,
      created_at   TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_history_project_id
      ON history (project_id);

    CREATE INDEX IF NOT EXISTS idx_history_created_at
      ON history (created_at);

    CREATE INDEX IF NOT EXISTS idx_history_event_type
      ON history (event_type);

    CREATE TABLE IF NOT EXISTS config (
      key        TEXT NOT NULL PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backups (
      id          TEXT    NOT NULL PRIMARY KEY,
      backup_path TEXT    NOT NULL,
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      created_at  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_backups_created_at
      ON backups (created_at);

    CREATE TABLE IF NOT EXISTS security_advisories (
      id                  TEXT NOT NULL PRIMARY KEY,
      package_name        TEXT NOT NULL,
      severity            TEXT NOT NULL,
      title               TEXT,
      vulnerable_versions TEXT,
      fixed_in            TEXT,
      url                 TEXT,
      created_at          TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_security_advisories_pkg
      ON security_advisories (package_name);

    CREATE TABLE IF NOT EXISTS user_profiles (
      id             TEXT    NOT NULL PRIMARY KEY,
      email          TEXT    NOT NULL UNIQUE,
      display_name   TEXT    NOT NULL,
      avatar_url     TEXT,
      phone_number   TEXT,
      email_verified INTEGER NOT NULL DEFAULT 1,
      provider       TEXT    NOT NULL DEFAULT 'google',
      created_at     TEXT    NOT NULL,
      updated_at     TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_user_profiles_email
      ON user_profiles (email);

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id            TEXT    NOT NULL PRIMARY KEY,
      user_id       TEXT    NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      access_token  TEXT,
      refresh_token TEXT,
      id_token      TEXT,
      expires_at    TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
      ON auth_sessions (user_id);
  `);

  // Safe migration for existing databases: ensure delivery_type column exists
  const eventCols = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  const hasDeliveryType = eventCols.some((c) => c.name === "delivery_type");
  if (!hasDeliveryType) {
    db.exec("ALTER TABLE events ADD COLUMN delivery_type TEXT;");
  }

  db.exec("CREATE INDEX IF NOT EXISTS idx_events_delivery_type ON events (delivery_type);");
  db.exec("UPDATE events SET delivery_type = 'SYNCED' WHERE delivery_type IS NULL;");

  // Safe migrations for projects table: package_manager and active_snapshot_id
  const projectCols = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projectCols.some((c) => c.name === "package_manager")) {
    db.exec("ALTER TABLE projects ADD COLUMN package_manager TEXT;");
  }
  if (!projectCols.some((c) => c.name === "active_snapshot_id")) {
    db.exec("ALTER TABLE projects ADD COLUMN active_snapshot_id TEXT;");
  }
}

