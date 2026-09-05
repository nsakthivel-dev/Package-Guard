import type BetterSqlite3 from "better-sqlite3";
import type { Project, Snapshot, SnapshotFile, ScanResult } from "./types.js";

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
