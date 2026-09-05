import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { resolveProjectRoot } from "@package-guard/shared/paths";
import { upsertProject, getProjectByPath } from "@package-guard/shared/repository";
import type { Project } from "@package-guard/shared/types";

export interface ProjectResolution {
  projectDir: string;
  project?: Project;
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
}

export function initializeProject(
  db: BetterSqlite3.Database,
  targetDir: string,
  customName?: string
): InitResult {
  const normalizedPath = path.resolve(targetDir);
  const existing = getProjectByPath(db, normalizedPath);

  // If already registered in DB and directory has .packageguard
  const markerDir = path.join(normalizedPath, ".packageguard");
  if (existing && fs.existsSync(markerDir)) {
    return {
      project: existing,
      alreadyInitialized: true
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

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(
      configPath,
      JSON.stringify(
        {
          id: projectId,
          name: projectName,
          initializedAt: new Date().toISOString(),
          version: "0.1.0"
        },
        null,
        2
      ),
      "utf8"
    );
  }

  const project = upsertProject(db, {
    id: projectId,
    name: projectName,
    path: normalizedPath,
    status: "ACTIVE"
  });

  return {
    project,
    alreadyInitialized: false
  };
}
