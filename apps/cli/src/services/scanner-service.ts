import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import {
  getLatestScanForProject,
  getLatestSnapshotForProject,
  getSnapshotFiles
} from "@package-guard/shared/repository";
import type {
  ScanResult,
  FileChange,
  PackageInfo,
  Snapshot
} from "@package-guard/shared/types";

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".packageguard",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  ".venv",
  "venv",
  "__pycache__"
]);

export function calculateFileHash(filePath: string): string {
  const fileBuffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

export function walkDirectory(
  dir: string,
  baseDir: string = dir
): Array<{ relativePath: string; fullPath: string; size: number }> {
  const results: Array<{ relativePath: string; fullPath: string; size: number }> = [];

  function traverse(currentDir: string): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          traverse(path.join(currentDir, entry.name));
        }
      } else if (entry.isFile()) {
        const fullPath = path.join(currentDir, entry.name);
        try {
          const stat = fs.statSync(fullPath);
          const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, "/");
          results.push({ relativePath, fullPath, size: stat.size });
        } catch {
          // ignore unreadable files
        }
      }
    }
  }

  traverse(dir);
  return results;
}

export function detectPackages(projectDir: string): PackageInfo[] {
  const packages: PackageInfo[] = [];
  const pkgJsonPath = path.join(projectDir, "package.json");

  if (fs.existsSync(pkgJsonPath)) {
    try {
      const raw = fs.readFileSync(pkgJsonPath, "utf8");
      const pkg = JSON.parse(raw);

      const addGroup = (
        deps: Record<string, string> | undefined,
        type: PackageInfo["type"]
      ): void => {
        if (!deps || typeof deps !== "object") return;
        for (const [name, version] of Object.entries(deps)) {
          const isInstalled = fs.existsSync(path.join(projectDir, "node_modules", name));
          packages.push({
            name,
            version: String(version),
            type,
            source: "npm",
            status: isInstalled ? "installed" : "missing"
          });
        }
      };

      addGroup(pkg.dependencies, "dependency");
      addGroup(pkg.devDependencies, "devDependency");
      addGroup(pkg.peerDependencies, "peerDependency");
      addGroup(pkg.optionalDependencies, "optionalDependency");
    } catch {
      // ignore
    }
  }

  // Python check
  const reqTxt = path.join(projectDir, "requirements.txt");
  if (fs.existsSync(reqTxt)) {
    try {
      const lines = fs.readFileSync(reqTxt, "utf8").split("\n");
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const match = line.match(/^([a-zA-Z0-9_\-.]+)(?:[=<>!~]+(.+))?$/);
        if (match) {
          packages.push({
            name: match[1],
            version: match[2] ? match[2].trim() : "any",
            type: "python",
            source: "pip",
            status: "installed"
          });
        }
      }
    } catch {
      // ignore
    }
  }

  return packages;
}

export function detectDeepPackages(projectDir: string): PackageInfo[] {
  const packages = detectPackages(projectDir);
  const seen = new Set(packages.map((p) => p.name));
  const nodeModulesDir = path.join(projectDir, "node_modules");

  if (fs.existsSync(nodeModulesDir)) {
    try {
      const scanNodeModules = (dir: string, depth = 0) => {
        if (depth > 3) return;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (entry.name.startsWith(".")) continue;
            if (entry.name.startsWith("@")) {
              // Scope folder
              scanNodeModules(path.join(dir, entry.name), depth + 1);
            } else {
              const pkgJson = path.join(dir, entry.name, "package.json");
              if (fs.existsSync(pkgJson)) {
                try {
                  const data = JSON.parse(fs.readFileSync(pkgJson, "utf8"));
                  const pkgName = data.name || entry.name;
                  if (!seen.has(pkgName)) {
                    seen.add(pkgName);
                    packages.push({
                      name: pkgName,
                      version: data.version || "unknown",
                      type: "transitive",
                      source: "npm",
                      status: "installed"
                    });
                  }
                } catch {
                  // ignore
                }
              }
            }
          }
        }
      };

      scanNodeModules(nodeModulesDir);
    } catch {
      // ignore
    }
  }

  return packages;
}

export interface ScanOptions {
  deep?: boolean;
  force?: boolean;
}

export async function scanProject(
  db: BetterSqlite3.Database,
  projectId: string,
  projectDir: string,
  projectName: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const startTime = Date.now();
  const rawFiles = walkDirectory(projectDir);

  const files: Array<{ relativePath: string; hash: string; size: number }> = [];
  for (const f of rawFiles) {
    try {
      const hash = calculateFileHash(f.fullPath);
      files.push({ relativePath: f.relativePath, hash, size: f.size });
    } catch {
      // ignore unreadable file
    }
  }

  const packages = options.deep
    ? detectDeepPackages(projectDir)
    : detectPackages(projectDir);

  // Determine baseline for changes:
  let previousFileMap = new Map<string, { hash: string; size: number }>();

  if (!options.force) {
    const latestSnap = getLatestSnapshotForProject(db, projectId) as Snapshot | undefined;
    if (latestSnap) {
      const snapFiles = getSnapshotFiles(db, latestSnap.id);
      for (const sf of snapFiles) {
        previousFileMap.set(sf.relative_path, { hash: sf.file_hash, size: sf.size_bytes });
      }
    } else {
      const latestScan = getLatestScanForProject(db, projectId);
      if (latestScan && latestScan.result_json) {
        try {
          const parsed = JSON.parse(latestScan.result_json) as ScanResult;
          if (Array.isArray(parsed.files)) {
            for (const f of parsed.files) {
              previousFileMap.set(f.relativePath, { hash: f.hash, size: f.size });
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  const currentFileMap = new Map<string, { hash: string; size: number }>();
  for (const f of files) {
    currentFileMap.set(f.relativePath, { hash: f.hash, size: f.size });
  }

  const changes: FileChange[] = [];

  // Check Added and Modified
  for (const [relPath, curr] of currentFileMap.entries()) {
    const prev = previousFileMap.get(relPath);
    if (!prev) {
      if (previousFileMap.size > 0) {
        changes.push({
          path: relPath,
          type: "ADDED",
          newHash: curr.hash,
          newSize: curr.size
        });
      }
    } else if (prev.hash !== curr.hash) {
      changes.push({
        path: relPath,
        type: "MODIFIED",
        oldHash: prev.hash,
        newHash: curr.hash,
        oldSize: prev.size,
        newSize: curr.size
      });
    }
  }

  // Check Deleted
  for (const [relPath, prev] of previousFileMap.entries()) {
    if (!currentFileMap.has(relPath)) {
      changes.push({
        path: relPath,
        type: "DELETED",
        oldHash: prev.hash,
        oldSize: prev.size
      });
    }
  }

  const durationMs = Date.now() - startTime;
  const scanId = `scan-${crypto.randomUUID().slice(0, 8)}`;

  return {
    id: scanId,
    projectId,
    projectName,
    projectPath: projectDir,
    filesScanned: files.length,
    packagesDetected: packages.length,
    changesDetected: changes.length,
    durationMs,
    status: "SUCCESS",
    changes,
    files,
    packages,
    createdAt: new Date().toISOString()
  };
}

