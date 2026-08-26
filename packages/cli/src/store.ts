/**
 * Crash-safe reader / writer for db.json.
 *
 * Schema MUST exactly match what the Electron core (backend/core/src/types.ts)
 * validates with Zod.  If any field is wrong the Zod parse fails and the core
 * silently resets the entire file to defaults — losing all data.
 *
 * Canonical shape:
 *   {
 *     projects: Project[],          // ARRAY, not object
 *     snapshots: PgSnapshot[],
 *     meta: { version: number }
 *   }
 *
 * Project shape:
 *   {
 *     id:             string   // must start with "proj-"
 *     name:           string
 *     path:           string   // absolute, normalised
 *     packageManager: "npm" | "pnpm" | "yarn" | "bun"
 *     packageJson:    object   // raw parsed package.json
 *     createdAt:      number   // Unix ms
 *     updatedAt:      number   // Unix ms
 *   }
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDbJsonPath, ensureUserDataDirs } from '@workspace/shared-paths';

// ── Types (mirror backend/core/src/types.ts exactly) ─────────────────────────

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface Project {
  id: string;           // "proj-<16 hex chars>"
  name: string;
  path: string;         // absolute path, forward-slash-normalised
  packageManager: PackageManager;
  packageJson: Record<string, unknown>;
  createdAt: number;    // Date.now()
  updatedAt: number;    // Date.now()
}

export interface DbShape {
  projects: Project[];
  snapshots: unknown[];
  meta: { version: number };
}

const DEFAULT_DB: DbShape = {
  projects: [],
  snapshots: [],
  meta: { version: 1 },
};

// ── Read ──────────────────────────────────────────────────────────────────────

export function readDb(): DbShape {
  ensureUserDataDirs();
  const p = getDbJsonPath();
  if (!fs.existsSync(p)) return structuredClone(DEFAULT_DB);
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<DbShape>;
    return {
      projects:  Array.isArray(parsed.projects)  ? parsed.projects  : [],
      snapshots: Array.isArray(parsed.snapshots) ? parsed.snapshots : [],
      meta:      parsed.meta ?? { version: 1 },
    };
  } catch {
    return structuredClone(DEFAULT_DB);
  }
}

// ── Write (atomic) ────────────────────────────────────────────────────────────

export function writeDb(db: DbShape): void {
  ensureUserDataDirs();
  const dest = getDbJsonPath();
  const tmp  = `${dest}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2) + '\n', 'utf-8');
    fs.renameSync(tmp, dest);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

// ── Upsert (array-safe) ───────────────────────────────────────────────────────

/**
 * Insert or update exactly one project entry.
 * Uses the same merge logic as database.ts in the core:
 *   1. Match by id.
 *   2. If not found, match by path.
 *   3. Otherwise push.
 * Never touches other entries.
 */
export function upsertProject(project: Project): void {
  const db = readDb();

  // Normalise path separators to forward-slash for cross-platform consistency.
  const normPath = project.path.replace(/\\/g, '/');
  const entry: Project = { ...project, path: normPath };

  const byId = db.projects.findIndex(p => p.id === entry.id);
  if (byId >= 0) {
    db.projects[byId] = entry;
  } else {
    const byPath = db.projects.findIndex(p => p.path === normPath);
    if (byPath >= 0) {
      entry.id = db.projects[byPath].id;   // preserve existing id
      db.projects[byPath] = entry;
    } else {
      db.projects.push(entry);
    }
  }

  writeDb(db);
}
