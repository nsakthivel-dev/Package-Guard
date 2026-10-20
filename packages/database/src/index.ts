import { openDatabase } from '@packageguard/shared/db';
import {
  listProjects as repoListProjects,
  getProjectById as repoGetProjectById,
  getProjectByPath as repoGetProjectByPath,
  upsertProject as repoUpsertProject,
  listSnapshotsForProject as repoListSnapshots,
  getSnapshotById as repoGetSnapshotById,
  insertSnapshot as repoInsertSnapshot,
  deleteSnapshotById as repoDeleteSnapshotById,
  renameProject as repoRenameProject,
} from '@packageguard/shared/repository';
import type { Project, Snapshot, DatabaseShape } from '@packageguard/shared/types';

function getDb() {
  return openDatabase();
}

export async function load(): Promise<DatabaseShape> {
  const db = getDb();
  try {
    const projects = repoListProjects(db);
    return {
      projects,
      snapshots: [],
      meta: { version: 1 },
    } as any;
  } finally {
    db.close();
  }
}

export function invalidateCache(): void {}

export async function save(): Promise<void> {}

export function listProjects(): Project[] {
  const db = getDb();
  try {
    return repoListProjects(db);
  } finally {
    db.close();
  }
}

export function getProjectById(id: string): Project | undefined {
  const db = getDb();
  try {
    return repoGetProjectById(db, id);
  } finally {
    db.close();
  }
}

export function getProjectByPath(rawPath: string): Project | undefined {
  const db = getDb();
  try {
    return repoGetProjectByPath(db, rawPath);
  } finally {
    db.close();
  }
}

export function upsertProject(project: any): string {
  const db = getDb();
  try {
    const res = repoUpsertProject(db, {
      id: project.id,
      name: project.name,
      path: project.path,
      status: project.status,
    });
    return res.id;
  } finally {
    db.close();
  }
}

export function deleteProject(id: string): boolean {
  const db = getDb();
  try {
    const stmt = db.prepare('DELETE FROM projects WHERE id = ?');
    const res = stmt.run(id);
    return res.changes > 0;
  } finally {
    db.close();
  }
}

export function renameProject(id: string, newName: string): boolean {
  const db = getDb();
  try {
    return repoRenameProject(db, id, newName);
  } finally {
    db.close();
  }
}

export function listSnapshots(projectId: string): any[] {
  const db = getDb();
  try {
    return repoListSnapshots(db, projectId);
  } finally {
    db.close();
  }
}

export function getSnapshot(snapId: string): any | undefined {
  const db = getDb();
  try {
    return repoGetSnapshotById(db, snapId);
  } finally {
    db.close();
  }
}

export function createSnapshot(snapshot: any): string {
  const db = getDb();
  try {
    repoInsertSnapshot(db, {
      id: snapshot.id,
      projectId: snapshot.projectId,
      name: snapshot.name || snapshot.message || 'Snapshot',
      description: snapshot.description || null,
      fileCount: snapshot.packageCount || (snapshot.packages ? snapshot.packages.length : 0),
      packageCount: snapshot.packages ? snapshot.packages.length : 0,
      manifestJson: JSON.stringify(snapshot.packages || []),
    });
    return snapshot.id;
  } finally {
    db.close();
  }
}

export function deleteSnapshot(snapId: string): boolean {
  const db = getDb();
  try {
    return repoDeleteSnapshotById(db, snapId);
  } finally {
    db.close();
  }
}
