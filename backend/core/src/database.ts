import fs from 'node:fs';
import fsAsync from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  DatabaseSchema,
  type DatabaseShape,
  type Project,
  type PgSnapshot,
} from './types.js';
import { getDbJsonPath, resolveProjectPath } from './paths.js';

const DEFAULT_DB: DatabaseShape = {
  projects: [],
  snapshots: [],
  meta: { version: 1 },
};

let cachedDb: DatabaseShape | null = null;
let loadCalled = false;

function normalizeProjects(projects: Project[]): Project[] {
  const byPath = new Map<string, Project>();
  for (const p of projects) {
    try {
      const real = resolveProjectPath(p.path);
      if (!byPath.has(real)) {
        byPath.set(real, { ...p, path: real });
      }
    } catch {
      if (!byPath.has(p.path)) byPath.set(p.path, p);
    }
  }
  return Array.from(byPath.values());
}

function migrate(db: DatabaseShape): DatabaseShape {
  const current = db.meta?.version ?? 0;
  if (current < 1) {
    db.meta = { version: 1 };
  }
  return db;
}

export async function load(): Promise<DatabaseShape> {
  loadCalled = true;
  const dbPath = getDbJsonPath();
  try {
    await fsAsync.access(dbPath);
  } catch {
    cachedDb = structuredClone(DEFAULT_DB);
    await saveInternal(cachedDb);
    return cachedDb;
  }
  const raw = await fsAsync.readFile(dbPath, 'utf8');
  const parsed = JSON.parse(raw);
  const validated = DatabaseSchema.safeParse(parsed);
  if (!validated.success) {
    console.warn('[package-guard] db.json failed schema validation; resetting to defaults.', validated.error);
    cachedDb = structuredClone(DEFAULT_DB);
    await saveInternal(cachedDb);
    return cachedDb;
  }
  let db = validated.data;
  db = migrate(db);
  db.projects = normalizeProjects(db.projects);
  cachedDb = db;
  return db;
}

async function saveInternal(db: DatabaseShape): Promise<void> {
  const dbPath = getDbJsonPath();
  const dir = path.dirname(dbPath);
  await fsAsync.mkdir(dir, { recursive: true });
  const tmpPath = `${dbPath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  await fsAsync.writeFile(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  await fsAsync.rename(tmpPath, dbPath);
}

function ensureLoaded(): DatabaseShape {
  if (!cachedDb) {
    const dbPath = getDbJsonPath();
    if (fs.existsSync(dbPath)) {
      const raw = fs.readFileSync(dbPath, 'utf8');
      try {
        const parsed = JSON.parse(raw);
        const validated = DatabaseSchema.safeParse(parsed);
        if (validated.success) {
          let db = validated.data;
          db = migrate(db);
          db.projects = normalizeProjects(db.projects);
          cachedDb = db;
        } else {
          cachedDb = structuredClone(DEFAULT_DB);
        }
      } catch {
        cachedDb = structuredClone(DEFAULT_DB);
      }
    } else {
      cachedDb = structuredClone(DEFAULT_DB);
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      fs.writeFileSync(dbPath, JSON.stringify(cachedDb, null, 2), 'utf8');
    }
  }
  return cachedDb as DatabaseShape;
}

export async function save(): Promise<void> {
  const db = ensureLoaded();
  await saveInternal(db);
}

export function listProjects(): Project[] {
  const db = ensureLoaded();
  return [...db.projects];
}

export function getProjectById(id: string): Project | undefined {
  const db = ensureLoaded();
  return db.projects.find((p) => p.id === id);
}

export function getProjectByPath(rawPath: string): Project | undefined {
  const db = ensureLoaded();
  const real = resolveProjectPath(rawPath);
  return db.projects.find((p) => p.path === real);
}

export function upsertProject(project: Project): string {
  const db = ensureLoaded();
  const real = resolveProjectPath(project.path);
  const normalized: Project = { ...project, path: real };
  const idx = db.projects.findIndex((p) => p.id === normalized.id);
  if (idx >= 0) {
    db.projects[idx] = normalized;
  } else {
    const byPath = db.projects.findIndex((p) => p.path === real);
    if (byPath >= 0) {
      normalized.id = db.projects[byPath].id;
      db.projects[byPath] = normalized;
    } else {
      db.projects.push(normalized);
    }
  }
  void save();
  return normalized.id;
}

export function deleteProject(id: string): boolean {
  const db = ensureLoaded();
  const before = db.projects.length;
  db.projects = db.projects.filter((p) => p.id !== id);
  db.snapshots = db.snapshots.filter((s) => s.projectId !== id);
  const changed = db.projects.length !== before;
  if (changed) void save();
  return changed;
}

export function listSnapshots(projectId: string): PgSnapshot[] {
  const db = ensureLoaded();
  return db.snapshots
    .filter((s) => s.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function getSnapshot(snapId: string): PgSnapshot | undefined {
  const db = ensureLoaded();
  return db.snapshots.find((s) => s.id === snapId);
}

export function createSnapshot(snapshot: PgSnapshot): string {
  const db = ensureLoaded();
  const idx = db.snapshots.findIndex((s) => s.id === snapshot.id);
  if (idx >= 0) {
    db.snapshots[idx] = snapshot;
  } else {
    db.snapshots.push(snapshot);
  }
  void save();
  return snapshot.id;
}

export function deleteSnapshot(snapId: string): boolean {
  const db = ensureLoaded();
  const before = db.snapshots.length;
  db.snapshots = db.snapshots.filter((s) => s.id !== snapId);
  const changed = db.snapshots.length !== before;
  if (changed) void save();
  return changed;
}
