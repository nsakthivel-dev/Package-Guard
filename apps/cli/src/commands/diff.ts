import * as fs from "node:fs";
import * as path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getSnapshot } from "../services/snapshot-service";
import { scanProject, walkDirectory, calculateFileHash } from "../services/scanner-service";
import { getLatestSnapshotForProject } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

export async function executeDiff(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    console.error("Run:\n\n  pg init\n");
    return 3;
  }

  const explicitSnapshotId = args[0];
  let snapshotId = explicitSnapshotId;

  if (!snapshotId) {
    const latest = getLatestSnapshotForProject(db, project.id);
    if (latest) {
      snapshotId = latest.id;
    }
  }

  interface DiffDetail {
    file: string;
    type: "ADDED" | "MODIFIED" | "DELETED";
    oldHash?: string;
    newHash?: string;
    oldSize?: number;
    newSize?: number;
    summary: string;
  }

  const diffs: DiffDetail[] = [];

  if (snapshotId) {
    const { snapshot, files } = getSnapshot(db, snapshotId);
    if (!snapshot) {
      console.error(`Error: Snapshot '${snapshotId}' not found.`);
      return 4;
    }

    const baselineMap = new Map<string, { hash: string; size: number }>();
    for (const f of files) {
      baselineMap.set(f.relative_path, { hash: f.file_hash, size: f.size_bytes });
    }

    const currentFiles = walkDirectory(projectDir);
    const currentMap = new Map<string, { hash: string; size: number; fullPath: string }>();
    for (const f of currentFiles) {
      try {
        const hash = calculateFileHash(f.fullPath);
        currentMap.set(f.relativePath, { hash, size: f.size, fullPath: f.fullPath });
      } catch {
        // ignore
      }
    }

    // Check Added and Modified
    for (const [relPath, curr] of currentMap.entries()) {
      const prev = baselineMap.get(relPath);
      if (!prev) {
        diffs.push({
          file: relPath,
          type: "ADDED",
          newHash: curr.hash,
          newSize: curr.size,
          summary: `New file (+${curr.size} bytes)`
        });
      } else if (prev.hash !== curr.hash) {
        const sizeDiff = curr.size - prev.size;
        const sizeSign = sizeDiff >= 0 ? `+${sizeDiff}` : `${sizeDiff}`;
        diffs.push({
          file: relPath,
          type: "MODIFIED",
          oldHash: prev.hash,
          newHash: curr.hash,
          oldSize: prev.size,
          newSize: curr.size,
          summary: `Modified content (${sizeSign} bytes)`
        });
      }
    }

    // Check Deleted
    for (const [relPath, prev] of baselineMap.entries()) {
      if (!currentMap.has(relPath)) {
        diffs.push({
          file: relPath,
          type: "DELETED",
          oldHash: prev.hash,
          oldSize: prev.size,
          summary: `Deleted file (-${prev.size} bytes)`
        });
      }
    }
  } else {
    // No snapshot available, use scan comparison
    const scan = await scanProject(db, project.id, projectDir, project.name);
    for (const c of scan.changes) {
      diffs.push({
        file: c.path,
        type: c.type,
        oldHash: c.oldHash,
        newHash: c.newHash,
        oldSize: c.oldSize,
        newSize: c.newSize,
        summary: c.type === "ADDED" ? `Added (+${c.newSize ?? 0} bytes)` : c.type === "DELETED" ? `Deleted (-${c.oldSize ?? 0} bytes)` : `Modified`
      });
    }
  }

  await sendCliEvent("diff", {
    projectId: project.id,
    projectName: project.name,
    snapshotId: snapshotId || null,
    totalDiffs: diffs.length,
    diffs
  }, project.id);

  console.log(`Diff for ${project.name} ${snapshotId ? `(against snapshot ${snapshotId})` : ""}:\n`);

  if (diffs.length === 0) {
    console.log("No differences detected.");
    return 0;
  }

  for (const d of diffs) {
    const symbol = d.type === "ADDED" ? "[+]" : d.type === "DELETED" ? "[-]" : "[~]";
    console.log(`${symbol} ${d.file} (${d.summary})`);
    if (d.type === "MODIFIED" && d.oldHash && d.newHash) {
      console.log(`    prev: ${d.oldHash.slice(0, 8)}... (${d.oldSize} B)`);
      console.log(`    curr: ${d.newHash.slice(0, 8)}... (${d.newSize} B)`);
    }
  }

  return 0;
}
