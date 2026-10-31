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

export interface VerifyOptions {
  deep?: boolean;
}

export async function verifyProject(
  db: BetterSqlite3.Database,
  projectId: string,
  projectDir: string,
  options: VerifyOptions = {}
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

  // If deep verification is requested: also check lockfile consistency
  if (options.deep) {
    const pjPath = path.join(projectDir, "package.json");
    const lockPath = path.join(projectDir, "package-lock.json");
    if (fs.existsSync(pjPath) && fs.existsSync(lockPath)) {
      try {
        const pj = JSON.parse(fs.readFileSync(pjPath, "utf8"));
        const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
        const deps = { ...pj.dependencies, ...pj.devDependencies };
        const lockPackages = lock.packages || lock.dependencies || {};

        for (const [name, version] of Object.entries<string>(deps)) {
          const lockKey = `node_modules/${name}`;
          const inLock = lockPackages[lockKey] || lockPackages[name];
          if (!inLock) {
            changed++;
            details.push({ file: "package.json", issue: `Declared dependency '${name}' (${version}) not recorded in lockfile` });
          }
        }
      } catch {
        // ignore
      }
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

export function fastCheck(projectDir: string): { healthy: boolean; issues: string[] } {
  const issues: string[] = [];

  const marker = path.join(projectDir, ".packageguardian");
  const legacyMarker = path.join(projectDir, ".packageguard");
  if (!fs.existsSync(marker) && !fs.existsSync(legacyMarker)) {
    issues.push("Missing .packageguardian project configuration directory");
  }

  const pj = path.join(projectDir, "package.json");
  const req = path.join(projectDir, "requirements.txt");
  if (!fs.existsSync(pj) && !fs.existsSync(req)) {
    issues.push("No package manifest (package.json or requirements.txt) found");
  }

  if (fs.existsSync(pj)) {
    try {
      JSON.parse(fs.readFileSync(pj, "utf8"));
    } catch {
      issues.push("package.json contains invalid JSON syntax");
    }
  }

  const nm = path.join(projectDir, "node_modules");
  if (fs.existsSync(pj) && !fs.existsSync(nm)) {
    issues.push("node_modules directory is missing (dependencies not installed)");
  }

  return {
    healthy: issues.length === 0,
    issues
  };
}

export function verifyIntegrity(projectDir: string): {
  verified: number;
  mismatches: number;
  details: Array<{ package: string; expected?: string; actual?: string }>;
} {
  const details: Array<{ package: string; expected?: string; actual?: string }> = [];
  let verified = 0;
  let mismatches = 0;

  const lockPath = path.join(projectDir, "package-lock.json");
  if (fs.existsSync(lockPath)) {
    try {
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      const pkgs = lock.packages || {};

      for (const [key, val] of Object.entries<any>(pkgs)) {
        if (!key.startsWith("node_modules/")) continue;
        const pkgName = key.slice("node_modules/".length);
        if (pkgName.includes("/node_modules/")) continue;

        const installedJson = path.join(projectDir, key, "package.json");
        if (fs.existsSync(installedJson)) {
          try {
            const inst = JSON.parse(fs.readFileSync(installedJson, "utf8"));
            if (val.version && inst.version === val.version) {
              verified++;
            } else {
              mismatches++;
              details.push({
                package: pkgName,
                expected: val.version,
                actual: inst.version
              });
            }
          } catch {
            mismatches++;
            details.push({ package: pkgName, expected: val.version, actual: "unreadable" });
          }
        } else {
          mismatches++;
          details.push({ package: pkgName, expected: val.version, actual: "missing" });
        }
      }
    } catch {
      // ignore
    }
  } else {
    // Check package.json dependencies against node_modules
    const pjPath = path.join(projectDir, "package.json");
    if (fs.existsSync(pjPath)) {
      try {
        const pj = JSON.parse(fs.readFileSync(pjPath, "utf8"));
        const allDeps = { ...pj.dependencies, ...pj.devDependencies };
        for (const [dep, declared] of Object.entries<string>(allDeps)) {
          const installedJson = path.join(projectDir, "node_modules", dep, "package.json");
          if (fs.existsSync(installedJson)) {
            verified++;
          } else {
            mismatches++;
            details.push({ package: dep, expected: declared, actual: "missing" });
          }
        }
      } catch {
        // ignore
      }
    }
  }

  return { verified, mismatches, details };
}

