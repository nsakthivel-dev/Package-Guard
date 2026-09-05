import * as fs from "node:fs";
import * as path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import {
  getLatestSnapshotForProject,
  getSnapshotFiles,
  getLatestScanForProject
} from "@package-guard/shared/repository";
import type { VerificationResult, Snapshot, ScanResult } from "@package-guard/shared/types";
import { walkDirectory, calculateFileHash } from "./scanner-service";

export async function verifyProject(
  db: BetterSqlite3.Database,
  projectId: string,
  projectDir: string
): Promise<VerificationResult> {
  const currentFiles = walkDirectory(projectDir);
  const currentMap = new Map<string, { fullPath: string; size: number }>();
  for (const f of currentFiles) {
    currentMap.set(f.relativePath, { fullPath: f.fullPath, size: f.size });
  }

  const baselineMap = new Map<string, { hash: string; size: number }>();
  const latestSnap = getLatestSnapshotForProject(db, projectId) as Snapshot | undefined;

  if (latestSnap) {
    const snapFiles = getSnapshotFiles(db, latestSnap.id);
    for (const sf of snapFiles) {
      baselineMap.set(sf.relative_path, { hash: sf.file_hash, size: sf.size_bytes });
    }
  } else {
    const latestScan = getLatestScanForProject(db, projectId);
    if (latestScan && latestScan.result_json) {
      try {
        const parsed = JSON.parse(latestScan.result_json) as ScanResult;
        if (Array.isArray(parsed.files)) {
          for (const f of parsed.files) {
            baselineMap.set(f.relativePath, { hash: f.hash, size: f.size });
          }
        }
      } catch {
        // ignore
      }
    }
  }

  const details: Array<{ file: string; issue: string }> = [];
  let valid = 0;
  let changed = 0;
  let missing = 0;
  let unexpected = 0;

  if (baselineMap.size === 0) {
    // No baseline yet; all current files are valid initial state
    return {
      filesChecked: currentFiles.length,
      valid: currentFiles.length,
      changed: 0,
      missing: 0,
      unexpected: 0,
      status: "OK",
      details: []
    };
  }

  // Check baseline items
  for (const [relPath, baseline] of baselineMap.entries()) {
    const current = currentMap.get(relPath);
    if (!current) {
      missing++;
      details.push({ file: relPath, issue: "Missing from project directory" });
    } else {
      try {
        const currentHash = calculateFileHash(current.fullPath);
        if (currentHash === baseline.hash) {
          valid++;
        } else {
          changed++;
          details.push({ file: relPath, issue: "Content hash modified" });
        }
      } catch (err) {
        changed++;
        details.push({ file: relPath, issue: `Cannot read file: ${err}` });
      }
    }
  }

  // Check unexpected (new) files
  for (const [relPath] of currentMap.entries()) {
    if (!baselineMap.has(relPath)) {
      unexpected++;
      details.push({ file: relPath, issue: "Unexpected new file" });
    }
  }

  const filesChecked = baselineMap.size + unexpected;
  let status: VerificationResult["status"] = "OK";
  if (missing > 0 || changed > 0 || unexpected > 0) {
    status = "CHANGES DETECTED";
  }

  return {
    filesChecked,
    valid,
    changed,
    missing,
    unexpected,
    status,
    details
  };
}
