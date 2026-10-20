import type BetterSqlite3 from "better-sqlite3";
import type { Project, Snapshot, SnapshotFile, ScanResult, UserProfile, AuthSession } from "./types.js";

export type EventStatus = "PENDING" | "SYNCED" | "FAILED";
export type DeliveryType = "LIVE" | "SYNCED";

export interface CommunicationEvent {
  id: string;
  type: string;
  payload: string;       // JSON-serialised object
  status: EventStatus;
  delivery_type?: DeliveryType | null;
  created_at: string;    // ISO-8601
  synced_at: string | null;
}

// ---------------------------------------------------------------------------
// Write operations
// ---------------------------------------------------------------------------

/**
 * Insert a new event as PENDING.
 * If an event with the same id already exists this is a no-op (idempotent).
 */
export function insertEvent(
  db: BetterSqlite3.Database,
  id: string,
  type: string,
  payload: unknown,
  deliveryType: DeliveryType = "SYNCED"
): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events (id, type, payload, status, delivery_type, created_at)
    VALUES (?, ?, ?, 'PENDING', ?, ?)
  `);
  stmt.run(id, type, JSON.stringify(payload), deliveryType, new Date().toISOString());
}

/**
 * Mark an event as SYNCED with the current timestamp and delivery type.
 * If the event was already marked LIVE, it retains LIVE delivery classification.
 */
export function markSynced(
  db: BetterSqlite3.Database,
  id: string,
  deliveryType: DeliveryType = "SYNCED"
): void {
  const stmt = db.prepare(`
    UPDATE events
    SET status = 'SYNCED',
        synced_at = CASE WHEN synced_at IS NULL THEN ? ELSE synced_at END,
        delivery_type = CASE WHEN delivery_type = 'LIVE' THEN 'LIVE' ELSE ? END
    WHERE id = ?
  `);
  stmt.run(new Date().toISOString(), deliveryType, id);
}

/**
 * Mark an event as FAILED.
 */
export function markFailed(db: BetterSqlite3.Database, id: string): void {
  const stmt = db.prepare(`
    UPDATE events SET status = 'FAILED' WHERE id = ?
  `);
  stmt.run(id);
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

/** Return all PENDING events ordered by creation time (oldest first). */
export function getPendingEvents(db: BetterSqlite3.Database): CommunicationEvent[] {
  const stmt = db.prepare(`
    SELECT * FROM events
    WHERE status = 'PENDING'
    ORDER BY created_at ASC, rowid ASC
  `);
  return stmt.all() as CommunicationEvent[];
}

/** Return total counts grouped by status. */
export function getEventCounts(
  db: BetterSqlite3.Database
): { pending: number; synced: number; failed: number } {
  const stmt = db.prepare(`
    SELECT status, COUNT(*) as cnt FROM events GROUP BY status
  `);
  const rows = stmt.all() as { status: string; cnt: number }[];

  const map = Object.fromEntries(rows.map((r) => [r.status, r.cnt]));
  return {
    pending: (map["PENDING"] as number | undefined) ?? 0,
    synced:  (map["SYNCED"]  as number | undefined) ?? 0,
    failed:  (map["FAILED"]  as number | undefined) ?? 0
  };
}

/** Check whether an event id already exists (for duplicate detection). */
export function eventExists(db: BetterSqlite3.Database, id: string): boolean {
  const stmt = db.prepare(`SELECT 1 FROM events WHERE id = ? LIMIT 1`);
  return stmt.get(id) !== undefined;
}

/** Return recent events (newest first) for activity feed in Electron. */
export function listRecentEvents(
  db: BetterSqlite3.Database,
  limit = 50
): CommunicationEvent[] {
  const stmt = db.prepare(`
    SELECT * FROM events
    ORDER BY created_at DESC, rowid DESC
    LIMIT ?
  `);
  return stmt.all(limit) as CommunicationEvent[];
}

// ---------------------------------------------------------------------------
// Project operations
// ---------------------------------------------------------------------------

export function upsertProject(
  db: BetterSqlite3.Database,
  project: { id: string; name: string; path: string; status?: "ACTIVE" | "ARCHIVED" }
): Project {
  const existing = getProjectByPath(db, project.path);
  if (existing) {
    const stmt = db.prepare(`
      UPDATE projects
      SET name = ?, status = ?
      WHERE id = ?
    `);
    stmt.run(project.name, project.status ?? existing.status, existing.id);
    return getProjectById(db, existing.id)!;
  }

  const stmt = db.prepare(`
    INSERT INTO projects (id, name, path, created_at, status)
    VALUES (?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  stmt.run(project.id, project.name, project.path, now, project.status ?? "ACTIVE");
  return getProjectById(db, project.id)!;
}

export function getProjectByPath(
  db: BetterSqlite3.Database,
  projectPath: string
): Project | undefined {
  const norm = projectPath.replace(/[\\/]+$/, "");
  const stmt = db.prepare(`
    SELECT * FROM projects
    WHERE REPLACE(REPLACE(path, '\\', '/'), '//', '/') = REPLACE(REPLACE(?, '\\', '/'), '//', '/')
    LIMIT 1
  `);
  return stmt.get(norm) as Project | undefined;
}

export function getProjectById(
  db: BetterSqlite3.Database,
  projectId: string
): Project | undefined {
  const stmt = db.prepare(`SELECT * FROM projects WHERE id = ? LIMIT 1`);
  return stmt.get(projectId) as Project | undefined;
}

export function listProjects(db: BetterSqlite3.Database): Project[] {
  const stmt = db.prepare(`SELECT * FROM projects ORDER BY created_at DESC`);
  return stmt.all() as Project[];
}

export function touchProjectScan(
  db: BetterSqlite3.Database,
  projectId: string,
  timestamp: string = new Date().toISOString()
): void {
  const stmt = db.prepare(`UPDATE projects SET last_scan_at = ? WHERE id = ?`);
  stmt.run(timestamp, projectId);
}

// ---------------------------------------------------------------------------
// Scan operations
// ---------------------------------------------------------------------------

export function insertScan(
  db: BetterSqlite3.Database,
  scan: {
    id: string;
    projectId: string;
    filesScanned: number;
    packagesDetected: number;
    changesDetected: number;
    durationMs: number;
    status: string;
    resultJson: string;
  }
): void {
  const stmt = db.prepare(`
    INSERT INTO scans (id, project_id, files_scanned, packages_detected, changes_detected, duration_ms, status, result_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    scan.id,
    scan.projectId,
    scan.filesScanned,
    scan.packagesDetected,
    scan.changesDetected,
    scan.durationMs,
    scan.status,
    scan.resultJson,
    new Date().toISOString()
  );
  touchProjectScan(db, scan.projectId);
}

export function getLatestScanForProject(
  db: BetterSqlite3.Database,
  projectId: string
): { id: string; project_id: string; files_scanned: number; packages_detected: number; changes_detected: number; duration_ms: number; status: string; result_json: string; created_at: string } | undefined {
  const stmt = db.prepare(`
    SELECT * FROM scans
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return stmt.get(projectId) as any;
}

export function listScansForProject(
  db: BetterSqlite3.Database,
  projectId: string,
  limit = 20
): Array<{ id: string; project_id: string; files_scanned: number; packages_detected: number; changes_detected: number; duration_ms: number; status: string; result_json: string; created_at: string }> {
  const stmt = db.prepare(`
    SELECT * FROM scans
    WHERE project_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(projectId, limit) as any;
}

// ---------------------------------------------------------------------------
// Snapshot operations
// ---------------------------------------------------------------------------

export function insertSnapshot(
  db: BetterSqlite3.Database,
  snapshot: {
    id: string;
    projectId: string;
    name: string;
    description?: string;
    fileCount: number;
    packageCount: number;
    manifestJson: string;
  }
): void {
  const stmt = db.prepare(`
    INSERT INTO snapshots (id, project_id, name, description, file_count, package_count, manifest_json, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `);
  stmt.run(
    snapshot.id,
    snapshot.projectId,
    snapshot.name,
    snapshot.description ?? null,
    snapshot.fileCount,
    snapshot.packageCount,
    snapshot.manifestJson,
    new Date().toISOString()
  );
}

export function getSnapshotById(
  db: BetterSqlite3.Database,
  snapshotId: string
): Snapshot | undefined {
  const stmt = db.prepare(`SELECT * FROM snapshots WHERE id = ? LIMIT 1`);
  return stmt.get(snapshotId) as Snapshot | undefined;
}

export function getSnapshotByName(
  db: BetterSqlite3.Database,
  projectId: string,
  name: string
): Snapshot | undefined {
  const stmt = db.prepare(`
    SELECT * FROM snapshots
    WHERE project_id = ? AND name = ? AND status != 'DELETED'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return stmt.get(projectId, name) as Snapshot | undefined;
}

export function listSnapshotsForProject(
  db: BetterSqlite3.Database,
  projectId: string
): Snapshot[] {
  const stmt = db.prepare(`
    SELECT * FROM snapshots
    WHERE project_id = ? AND status != 'DELETED'
    ORDER BY created_at DESC
  `);
  return stmt.all(projectId) as Snapshot[];
}

export function getLatestSnapshotForProject(
  db: BetterSqlite3.Database,
  projectId: string
): Snapshot | undefined {
  const stmt = db.prepare(`
    SELECT * FROM snapshots
    WHERE project_id = ? AND status != 'DELETED'
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return stmt.get(projectId) as Snapshot | undefined;
}

export function deleteSnapshotById(
  db: BetterSqlite3.Database,
  snapshotId: string
): boolean {
  const stmt = db.prepare(`DELETE FROM snapshots WHERE id = ?`);
  const result = stmt.run(snapshotId);
  return result.changes > 0;
}

export function insertSnapshotFiles(
  db: BetterSqlite3.Database,
  files: Array<{
    id: string;
    snapshotId: string;
    relativePath: string;
    fileHash: string;
    sizeBytes: number;
    storagePath: string;
  }>
): void {
  const insert = db.prepare(`
    INSERT INTO snapshot_files (id, snapshot_id, relative_path, file_hash, size_bytes, storage_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((rows: typeof files) => {
    for (const r of rows) {
      insert.run(r.id, r.snapshotId, r.relativePath, r.fileHash, r.sizeBytes, r.storagePath);
    }
  });

  tx(files);
}

export function getSnapshotFiles(
  db: BetterSqlite3.Database,
  snapshotId: string
): SnapshotFile[] {
  const stmt = db.prepare(`
    SELECT * FROM snapshot_files
    WHERE snapshot_id = ?
    ORDER BY relative_path ASC
  `);
  return stmt.all(snapshotId) as SnapshotFile[];
}

// ---------------------------------------------------------------------------
// Extended Project Operations
// ---------------------------------------------------------------------------

export function renameProject(
  db: BetterSqlite3.Database,
  id: string,
  newName: string
): boolean {
  const stmt = db.prepare(`UPDATE projects SET name = ? WHERE id = ?`);
  const res = stmt.run(newName, id);
  return res.changes > 0;
}

export function deleteProjectTracking(
  db: BetterSqlite3.Database,
  id: string
): boolean {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM snapshot_files WHERE snapshot_id IN (SELECT id FROM snapshots WHERE project_id = ?)`).run(id);
    db.prepare(`DELETE FROM snapshots WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM scans WHERE project_id = ?`).run(id);
    db.prepare(`DELETE FROM history WHERE project_id = ?`).run(id);
    const res = db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
    return res.changes > 0;
  });
  return tx();
}

export function setProjectActiveSnapshot(
  db: BetterSqlite3.Database,
  projectId: string,
  snapshotId: string | null
): void {
  const stmt = db.prepare(`UPDATE projects SET active_snapshot_id = ? WHERE id = ?`);
  stmt.run(snapshotId, projectId);
}

export function setProjectPackageManager(
  db: BetterSqlite3.Database,
  projectId: string,
  packageManager: string
): void {
  const stmt = db.prepare(`UPDATE projects SET package_manager = ? WHERE id = ?`);
  stmt.run(packageManager, projectId);
}

// ---------------------------------------------------------------------------
// History Operations (Public User-Facing Activity)
// ---------------------------------------------------------------------------

export function insertHistory(
  db: BetterSqlite3.Database,
  item: {
    id?: string;
    projectId?: string | null;
    eventType: string;
    description: string;
    detailsJson?: string | null;
  }
): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require("node:crypto");
  const id = item.id || `hist-${crypto.randomUUID().slice(0, 8)}`;
  const stmt = db.prepare(`
    INSERT INTO history (id, project_id, event_type, description, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    item.projectId ?? null,
    item.eventType,
    item.description,
    item.detailsJson ?? null,
    new Date().toISOString()
  );
}

export function listHistory(
  db: BetterSqlite3.Database,
  opts: {
    projectId?: string | null;
    todayOnly?: boolean;
    limit?: number;
  } = {}
): Array<{ id: string; project_id: string | null; event_type: string; description: string; details_json: string | null; created_at: string }> {
  let sql = `SELECT * FROM history WHERE 1=1`;
  const params: any[] = [];

  if (opts.projectId) {
    sql += ` AND project_id = ?`;
    params.push(opts.projectId);
  }

  if (opts.todayOnly) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    sql += ` AND created_at >= ?`;
    params.push(startOfDay.toISOString());
  }

  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(opts.limit ?? 100);

  const stmt = db.prepare(sql);
  return stmt.all(...params) as any[];
}

export function clearHistory(
  db: BetterSqlite3.Database,
  projectId?: string | null
): number {
  if (projectId) {
    const stmt = db.prepare(`DELETE FROM history WHERE project_id = ?`);
    return stmt.run(projectId).changes;
  } else {
    const stmt = db.prepare(`DELETE FROM history`);
    return stmt.run().changes;
  }
}

// ---------------------------------------------------------------------------
// Config Operations
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG_ENTRIES: Record<string, string> = {
  autoScan: "true",
  notifyElectron: "true",
  safeMode: "true",
  cacheDurationHours: "6",
  concurrencyLimit: "5",
  logLevel: "info",
  telemetry: "false"
};

export function getConfig(
  db: BetterSqlite3.Database,
  key: string,
  defaultValue?: string
): string | undefined {
  const stmt = db.prepare(`SELECT value FROM config WHERE key = ?`);
  const row = stmt.get(key) as { value: string } | undefined;
  if (row) return row.value;
  return defaultValue ?? DEFAULT_CONFIG_ENTRIES[key];
}

export function setConfig(
  db: BetterSqlite3.Database,
  key: string,
  value: string
): void {
  const stmt = db.prepare(`
    INSERT INTO config (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `);
  stmt.run(key, value, new Date().toISOString());
}

export function resetConfig(db: BetterSqlite3.Database): void {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM config`).run();
    const insert = db.prepare(`INSERT INTO config (key, value, updated_at) VALUES (?, ?, ?)`);
    const now = new Date().toISOString();
    for (const [k, v] of Object.entries(DEFAULT_CONFIG_ENTRIES)) {
      insert.run(k, v, now);
    }
  });
  tx();
}

export function listConfig(
  db: BetterSqlite3.Database
): Record<string, string> {
  const stmt = db.prepare(`SELECT key, value FROM config`);
  const rows = stmt.all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = { ...DEFAULT_CONFIG_ENTRIES };
  for (const r of rows) {
    result[r.key] = r.value;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Backup Operations
// ---------------------------------------------------------------------------

export function insertBackup(
  db: BetterSqlite3.Database,
  backup: {
    id: string;
    backupPath: string;
    sizeBytes: number;
    description?: string | null;
  }
): void {
  const stmt = db.prepare(`
    INSERT INTO backups (id, backup_path, size_bytes, description, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    backup.id,
    backup.backupPath,
    backup.sizeBytes,
    backup.description ?? null,
    new Date().toISOString()
  );
}

export function listBackups(
  db: BetterSqlite3.Database
): Array<{ id: string; backup_path: string; size_bytes: number; description: string | null; created_at: string }> {
  const stmt = db.prepare(`SELECT * FROM backups ORDER BY created_at DESC`);
  return stmt.all() as any[];
}

export function getBackupById(
  db: BetterSqlite3.Database,
  id: string
): { id: string; backup_path: string; size_bytes: number; description: string | null; created_at: string } | undefined {
  const stmt = db.prepare(`SELECT * FROM backups WHERE id = ?`);
  return stmt.get(id) as any;
}

export function deleteBackup(
  db: BetterSqlite3.Database,
  id: string
): boolean {
  const stmt = db.prepare(`DELETE FROM backups WHERE id = ?`);
  return stmt.run(id).changes > 0;
}

// ---------------------------------------------------------------------------
// Security Advisories Operations
// ---------------------------------------------------------------------------

export function insertSecurityAdvisory(
  db: BetterSqlite3.Database,
  advisory: {
    id: string;
    packageName: string;
    severity: string;
    title?: string;
    vulnerableVersions?: string;
    fixedIn?: string;
    url?: string;
  }
): void {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO security_advisories (id, package_name, severity, title, vulnerable_versions, fixed_in, url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    advisory.id,
    advisory.packageName,
    advisory.severity,
    advisory.title ?? null,
    advisory.vulnerableVersions ?? null,
    advisory.fixedIn ?? null,
    advisory.url ?? null,
    new Date().toISOString()
  );
}

export function listSecurityAdvisories(
  db: BetterSqlite3.Database,
  packageName?: string
): Array<{ id: string; package_name: string; severity: string; title: string | null; vulnerable_versions: string | null; fixed_in: string | null; url: string | null; created_at: string }> {
  if (packageName) {
    const stmt = db.prepare(`SELECT * FROM security_advisories WHERE LOWER(package_name) = LOWER(?) ORDER BY created_at DESC`);
    return stmt.all(packageName) as any[];
  }
  const stmt = db.prepare(`SELECT * FROM security_advisories ORDER BY created_at DESC`);
  return stmt.all() as any[];
}

export function clearSecurityAdvisories(db: BetterSqlite3.Database): void {
  db.prepare(`DELETE FROM security_advisories`).run();
}

// ---------------------------------------------------------------------------
// Queue Operations
// ---------------------------------------------------------------------------

export function listQueue(
  db: BetterSqlite3.Database,
  status?: string
): CommunicationEvent[] {
  if (status) {
    const stmt = db.prepare(`SELECT * FROM events WHERE status = ? ORDER BY created_at ASC, rowid ASC`);
    return stmt.all(status) as CommunicationEvent[];
  }
  const stmt = db.prepare(`SELECT * FROM events ORDER BY created_at ASC, rowid ASC`);
  return stmt.all() as CommunicationEvent[];
}

// ---------------------------------------------------------------------------
// User Profile & Authentication Session Operations
// ---------------------------------------------------------------------------

export function getUserProfile(
  db: BetterSqlite3.Database,
  id: string
): UserProfile | null {
  const stmt = db.prepare(`SELECT * FROM user_profiles WHERE id = ?`);
  const row = stmt.get(id) as any;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    phoneNumber: row.phone_number,
    emailVerified: Boolean(row.email_verified),
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getUserProfileByEmail(
  db: BetterSqlite3.Database,
  email: string
): UserProfile | null {
  const stmt = db.prepare(`SELECT * FROM user_profiles WHERE LOWER(email) = LOWER(?)`);
  const row = stmt.get(email) as any;
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    phoneNumber: row.phone_number,
    emailVerified: Boolean(row.email_verified),
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function upsertUserProfile(
  db: BetterSqlite3.Database,
  profile: UserProfile
): UserProfile {
  const now = new Date().toISOString();
  const existing = getUserProfile(db, profile.id) || getUserProfileByEmail(db, profile.email);
  if (existing) {
    const stmt = db.prepare(`
      UPDATE user_profiles
      SET email = ?,
          display_name = ?,
          avatar_url = ?,
          phone_number = ?,
          email_verified = ?,
          provider = ?,
          updated_at = ?
      WHERE id = ?
    `);
    stmt.run(
      profile.email,
      profile.displayName,
      profile.avatarUrl ?? existing.avatarUrl ?? null,
      profile.phoneNumber ?? existing.phoneNumber ?? null,
      profile.emailVerified !== undefined ? (profile.emailVerified ? 1 : 0) : (existing.emailVerified ? 1 : 0),
      profile.provider || existing.provider || 'google',
      now,
      existing.id
    );
    return getUserProfile(db, existing.id)!;
  }

  const stmt = db.prepare(`
    INSERT INTO user_profiles (
      id, email, display_name, avatar_url, phone_number, email_verified, provider, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    profile.id,
    profile.email,
    profile.displayName,
    profile.avatarUrl ?? null,
    profile.phoneNumber ?? null,
    profile.emailVerified ? 1 : 0,
    profile.provider || 'google',
    profile.createdAt || now,
    profile.updatedAt || now
  );
  return getUserProfile(db, profile.id)!;
}

export function updateUserProfile(
  db: BetterSqlite3.Database,
  id: string,
  updates: Partial<UserProfile>
): UserProfile | null {
  const existing = getUserProfile(db, id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const displayName = updates.displayName !== undefined ? updates.displayName : existing.displayName;
  const avatarUrl = updates.avatarUrl !== undefined ? updates.avatarUrl : existing.avatarUrl;
  const phoneNumber = updates.phoneNumber !== undefined ? updates.phoneNumber : existing.phoneNumber;

  const stmt = db.prepare(`
    UPDATE user_profiles
    SET display_name = ?,
        avatar_url = ?,
        phone_number = ?,
        updated_at = ?
    WHERE id = ?
  `);
  stmt.run(displayName, avatarUrl, phoneNumber, now, id);
  return getUserProfile(db, id);
}

export function deleteUserProfile(
  db: BetterSqlite3.Database,
  id: string
): boolean {
  const stmt = db.prepare(`DELETE FROM user_profiles WHERE id = ?`);
  const res = stmt.run(id);
  return res.changes > 0;
}

export function createAuthSession(
  db: BetterSqlite3.Database,
  session: AuthSession
): AuthSession {
  // Deactivate any existing active sessions
  db.prepare(`UPDATE auth_sessions SET is_active = 0 WHERE is_active = 1`).run();

  const stmt = db.prepare(`
    INSERT INTO auth_sessions (
      id, user_id, access_token, refresh_token, id_token, expires_at, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const now = new Date().toISOString();
  stmt.run(
    session.id,
    session.userId,
    session.accessToken ?? null,
    session.refreshToken ?? null,
    session.idToken ?? null,
    session.expiresAt ?? null,
    session.createdAt || now,
    session.updatedAt || now
  );
  return {
    ...session,
    isActive: true,
  };
}

export function getActiveAuthSession(
  db: BetterSqlite3.Database
): (AuthSession & { user: UserProfile }) | null {
  const stmt = db.prepare(`
    SELECT s.*,
           u.id as u_id,
           u.email as u_email,
           u.display_name as u_display_name,
           u.avatar_url as u_avatar_url,
           u.phone_number as u_phone_number,
           u.email_verified as u_email_verified,
           u.provider as u_provider,
           u.created_at as u_created_at,
           u.updated_at as u_updated_at
    FROM auth_sessions s
    INNER JOIN user_profiles u ON s.user_id = u.id
    WHERE s.is_active = 1
    ORDER BY s.created_at DESC
    LIMIT 1
  `);
  const row = stmt.get() as any;
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    idToken: row.id_token,
    expiresAt: row.expires_at,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: {
      id: row.u_id,
      email: row.u_email,
      displayName: row.u_display_name,
      avatarUrl: row.u_avatar_url,
      phoneNumber: row.u_phone_number,
      emailVerified: Boolean(row.u_email_verified),
      provider: row.u_provider,
      createdAt: row.u_created_at,
      updatedAt: row.u_updated_at,
    },
  };
}

export function deactivateAllAuthSessions(db: BetterSqlite3.Database): void {
  db.prepare(`UPDATE auth_sessions SET is_active = 0, access_token = NULL, refresh_token = NULL, id_token = NULL WHERE is_active = 1`).run();
}

/** Return all user profiles with an indicator whether they currently have an active session. */
export function getAllUserProfiles(
  db: BetterSqlite3.Database
): (UserProfile & { hasActiveSession: boolean })[] {
  const stmt = db.prepare(`
    SELECT u.*,
           CASE WHEN EXISTS (
             SELECT 1 FROM auth_sessions s WHERE s.user_id = u.id AND s.is_active = 1
           ) THEN 1 ELSE 0 END AS has_active_session
    FROM user_profiles u
    ORDER BY u.created_at ASC
  `);
  const rows = stmt.all() as any[];
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    phoneNumber: row.phone_number,
    emailVerified: Boolean(row.email_verified),
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasActiveSession: Boolean(row.has_active_session),
  }));
}

/** Switch the active auth session to the specified userId. */
export function switchActiveAuthSession(
  db: BetterSqlite3.Database,
  userId: string
): boolean {
  const profile = getUserProfile(db, userId);
  if (!profile) return false;

  const deactivateStmt = db.prepare(`UPDATE auth_sessions SET is_active = 0 WHERE is_active = 1`);
  deactivateStmt.run();

  // Find most recent session for this user
  const recentSession = db.prepare(
    `SELECT id FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`
  ).get(userId) as { id: string } | undefined;

  const now = new Date().toISOString();
  if (recentSession) {
    db.prepare(`UPDATE auth_sessions SET is_active = 1, updated_at = ? WHERE id = ?`).run(
      now,
      recentSession.id
    );
  } else {
    const id = 'sess_' + Date.now();
    db.prepare(
      `INSERT INTO auth_sessions (id, user_id, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`
    ).run(id, userId, now, now);
  }

  return true;
}

