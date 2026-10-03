import * as fs from "node:fs";
import * as path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getSnapshot } from "../services/snapshot-service";
import { scanProject, walkDirectory, calculateFileHash } from "../services/scanner-service";
import { getLatestSnapshotForProject } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

import { outputSuccess, outputError } from "../output";

export async function executeDiff(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const cleanArgs = args.filter((a) => a !== "--json" && a !== "-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "diff",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
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

  // Case 1: Two snapshots specified: pg diff <snap1> <snap2>
  if (cleanArgs.length >= 2) {
    const snap1Id = cleanArgs[0];
    const snap2Id = cleanArgs[1];

    const s1 = getSnapshot(db, snap1Id);
    const s2 = getSnapshot(db, snap2Id);

    if (!s1.snapshot) {
      return outputError(
        "diff",
        "SNAPSHOT_NOT_FOUND",
        `Snapshot '${snap1Id}' not found.`,
        4,
        jsonMode
      );
    }
    if (!s2.snapshot) {
      return outputError(
        "diff",
        "SNAPSHOT_NOT_FOUND",
        `Snapshot '${snap2Id}' not found.`,
        4,
        jsonMode
      );
    }

    const s1Map = new Map<string, { hash: string; size: number }>();
    for (const f of s1.files) {
      s1Map.set(f.relative_path, { hash: f.file_hash, size: f.size_bytes });
    }

    const s2Map = new Map<string, { hash: string; size: number }>();
    for (const f of s2.files) {
      s2Map.set(f.relative_path, { hash: f.file_hash, size: f.size_bytes });
    }

    // Check added in s2 or modified
    for (const [relPath, curr] of s2Map.entries()) {
      const prev = s1Map.get(relPath);
      if (!prev) {
        diffs.push({
          file: relPath,
          type: "ADDED",
          newHash: curr.hash,
          newSize: curr.size,
          summary: `Added in ${snap2Id}`
        });
      } else if (prev.hash !== curr.hash) {
        diffs.push({
          file: relPath,
          type: "MODIFIED",
          oldHash: prev.hash,
          newHash: curr.hash,
          oldSize: prev.size,
          newSize: curr.size,
          summary: `Modified between ${snap1Id} and ${snap2Id}`
        });
      }
    }

    // Check deleted in s2
    for (const [relPath, prev] of s1Map.entries()) {
      if (!s2Map.has(relPath)) {
        diffs.push({
          file: relPath,
          type: "DELETED",
          oldHash: prev.hash,
          oldSize: prev.size,
          summary: `Removed in ${snap2Id}`
        });
      }
    }

    if (!jsonMode) {
      console.log(`Diff between Snapshot ${snap1Id} and Snapshot ${snap2Id}:\n`);
    }
  } else {
    // Case 2: One snapshot specified or latest snapshot
    const explicitSnapshotId = cleanArgs[0];
    let snapshotId = explicitSnapshotId;

    if (!snapshotId) {
      const latest = getLatestSnapshotForProject(db, project.id);
      if (latest) {
        snapshotId = latest.id;
      }
    }

    if (snapshotId) {
      const { snapshot, files } = getSnapshot(db, snapshotId);
      if (!snapshot) {
        return outputError(
          "diff",
          "SNAPSHOT_NOT_FOUND",
          `Snapshot '${snapshotId}' not found.`,
          4,
          jsonMode
        );
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

      if (!jsonMode) {
        console.log(`Diff for ${project.name} (against snapshot ${snapshotId}):\n`);
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
      if (!jsonMode) {
        console.log(`Diff for ${project.name} (working tree changes):\n`);
      }
    }
  }

  await sendCliEvent("diff", {
    projectId: project.id,
    projectName: project.name,
    totalDiffs: diffs.length,
    diffs
  }, project.id);

  return outputSuccess(
    "diff",
    {
      projectId: project.id,
      projectName: project.name,
      totalDiffs: diffs.length,
      diffs
    },
    jsonMode,
    () => {
      if (diffs.length === 0) {
        console.log("No differences detected.\n");
        return;
      }

      for (const d of diffs) {
        const symbol = d.type === "ADDED" ? "+" : d.type === "DELETED" ? "-" : "~";
        console.log(`${symbol} ${d.file} (${d.summary})`);
      }
      console.log();
    }
  );
}
