import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { resolveProjectRoot } from "@package-guard/shared/paths";
import {
  upsertProject,
  getProjectByPath,
  getProjectById,
  listProjects,
  renameProject,
  deleteProjectTracking,
  setProjectPackageManager
} from "@package-guard/shared/repository";
import type { Project } from "@package-guard/shared/types";

export interface ProjectResolution {
  projectDir: string;
  project?: Project;
}

export function detectPackageManager(dir: string): "npm" | "pnpm" | "yarn" | "bun" | "pip" {
  if (fs.existsSync(path.join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(dir, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(dir, "bun.lockb")) || fs.existsSync(path.join(dir, "bun.lock"))) return "bun";
  if (fs.existsSync(path.join(dir, "package-lock.json"))) return "npm";

  // Check packageManager field in package.json
  const pj = path.join(dir, "package.json");
  if (fs.existsSync(pj)) {
    try {
      const raw = JSON.parse(fs.readFileSync(pj, "utf8"));
      if (typeof raw.packageManager === "string") {
        if (raw.packageManager.startsWith("pnpm")) return "pnpm";
        if (raw.packageManager.startsWith("yarn")) return "yarn";
        if (raw.packageManager.startsWith("bun")) return "bun";
        if (raw.packageManager.startsWith("npm")) return "npm";
      }
    } catch {
      // ignore
    }
    return "npm";
  }

  // Python markers
  const pyMarkers = ["requirements.txt", "Pipfile", "pyproject.toml", "setup.py"];
  for (const m of pyMarkers) {
    if (fs.existsSync(path.join(dir, m))) return "pip";
  }

  return "npm";
}

export function findProject(db: BetterSqlite3.Database, explicitPath?: string): ProjectResolution {
  const targetDir = explicitPath ? path.resolve(explicitPath) : resolveProjectRoot(process.cwd());
  const project = getProjectByPath(db, targetDir);

  return {
    projectDir: targetDir,
    project
  };
}

export function isInitialized(projectDir: string, project?: Project): boolean {
  const marker = path.join(projectDir, ".packageguard");
  return Boolean(project || fs.existsSync(marker));
}

export interface InitResult {
  project: Project;
  alreadyInitialized: boolean;
  packageManager: string;
}

export function initializeProject(
  db: BetterSqlite3.Database,
  targetDir: string,
  customName?: string
): InitResult {
  const normalizedPath = path.resolve(targetDir);
  const existing = getProjectByPath(db, normalizedPath);
  const pm = detectPackageManager(normalizedPath);

  // If already registered in DB and directory has .packageguard
  const markerDir = path.join(normalizedPath, ".packageguard");
  if (existing && fs.existsSync(markerDir)) {
    if (pm && existing.package_manager !== pm) {
      setProjectPackageManager(db, existing.id, pm);
    }
    return {
      project: existing,
      alreadyInitialized: true,
      packageManager: existing.package_manager || pm
    };
  }

  // Derive project name from package.json or folder name
  let projectName = customName;
  if (!projectName) {
    const pkgJsonPath = path.join(normalizedPath, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
        if (pkg.name) projectName = String(pkg.name);
      } catch {
        // fallback
      }
    }
    if (!projectName) {
      projectName = path.basename(normalizedPath) || "project";
    }
  }

  // Ensure .packageguard directory & config exists
  fs.mkdirSync(markerDir, { recursive: true });
  const configPath = path.join(markerDir, "config.json");
  const projectId = existing ? existing.id : `proj-${randomUUID().slice(0, 8)}`;

  fs.writeFileSync(
    configPath,
    JSON.stringify(
      {
        id: projectId,
        name: projectName,
        packageManager: pm,
        initializedAt: existing?.created_at || new Date().toISOString(),
        version: "1.0.0"
      },
      null,
      2
    ),
    "utf8"
  );

  const project = upsertProject(db, {
    id: projectId,
    name: projectName,
    path: normalizedPath,
    status: "ACTIVE"
  });

  setProjectPackageManager(db, projectId, pm);

  return {
    project: { ...project, package_manager: pm },
    alreadyInitialized: false,
    packageManager: pm
  };
}

export function getAllProjects(db: BetterSqlite3.Database): Project[] {
  return listProjects(db);
}

export function renameCurrentProject(
  db: BetterSqlite3.Database,
  project: Project,
  newName: string
): boolean {
  const success = renameProject(db, project.id, newName);
  if (success) {
    const marker = path.join(project.path, ".packageguard", "config.json");
    if (fs.existsSync(marker)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(marker, "utf8"));
        cfg.name = newName;
        fs.writeFileSync(marker, JSON.stringify(cfg, null, 2), "utf8");
      } catch {
        // ignore
      }
    }
  }
  return success;
}

export function deleteProjectTrackingOnly(
  db: BetterSqlite3.Database,
  projectId: string
): boolean {
  return deleteProjectTracking(db, projectId);
}

export function untrackProject(
  db: BetterSqlite3.Database,
  project: Project
): boolean {
  // Untrack from SQLite tracking tables without deleting the project folder on disk
  return deleteProjectTracking(db, project.id);
}

