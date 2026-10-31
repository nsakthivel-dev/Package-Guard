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
  setProjectPackageManager,
  insertHistory
} from "@package-guard/shared/repository";
import { validateProjectName } from "@package-guard/shared/utils";
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
  const marker = path.join(projectDir, ".packageguardian");
  const legacyMarker = path.join(projectDir, ".packageguard");
  return Boolean(project || fs.existsSync(marker) || fs.existsSync(legacyMarker));
}

export interface InitResult {
  project: Project;
  alreadyInitialized: boolean;
  packageManager: string;
  packageGuardianMdCreated?: boolean;
  packageGuardMdCreated?: boolean;
  agentsMdCreated?: boolean;
  agentsMdUpdated?: boolean;
}

export function generatePackageGuardianMdContent(projectName: string, packageManager: string): string {
  return `# Package Guardian AI Instructions

Package Guardian (\`pg\`) is the dependency-state management tool for this project.

It allows developers and AI coding agents to inspect, track, snapshot, compare, verify, and restore the project's dependency state.

## Purpose

Use Package Guardian when working with changes that may affect:

- dependencies
- package versions
- lockfiles
- installed packages
- dependency trees
- package configuration
- dependency-related project state

## AI Workflow

When modifying or updating dependencies, follow this workflow:

1. **Inspect Current State**: Check dependency status and verify health.
   \`\`\`bash
   pg status --json
   pg scan --json
   \`\`\`
2. **Create Baseline Safety Snapshot**: Always snapshot prior to risky changes.
   \`\`\`bash
   pg snapshot create "Before dependency modification" --json
   \`\`\`
3. **Perform Development Work**: Install, remove, or upgrade packages using the project package manager (${packageManager}).
4. **Inspect Changes**: Compare current filesystem state against the baseline.
   \`\`\`bash
   pg changes --json
   pg diff --json
   \`\`\`
5. **Verify and Health Check**: Ensure files and lockfiles are consistent and intact.
   \`\`\`bash
   pg verify --json
   pg doctor --json
   \`\`\`
6. **Recovery if Issues Arise**: If dependency modifications break the build or tests, roll back safely.
   \`\`\`bash
   pg rollback --json
   # Or restore a specific snapshot
   pg snapshot restore <snapshotId> -y --json
   \`\`\`

## Command Discovery

Use the CLI help system to discover all available commands, options, and arguments:

\`\`\`bash
pg help
pg help <command>
\`\`\`

The CLI remains the authoritative source for currently available commands.

## Machine-Readable Output

AI agents should prefer structured JSON output by passing \`--json\` to commands:

\`\`\`bash
pg status --json
pg packages --json
\`\`\`

## Non-Interactive Usage

AI agents run non-interactively in shell environments. Destructive operations require confirmation:
- Use the non-interactive confirmation flag \`-y\` (or \`--yes\`, \`--force\`).

\`\`\`bash
pg snapshot restore <id> -y --json
pg snapshot delete <id> -y --json
\`\`\`

## Recovery

To recover from problematic dependency changes:
1. Inspect recorded snapshots: \`pg snapshot list --json\`.
2. Inspect the exact differences: \`pg diff <snapshotId> --json\`.
3. Restore the target snapshot: \`pg snapshot restore <snapshotId> -y --json\`.
4. Re-run tests and project build.

## Important Rules

- Use the \`pg\` CLI exclusively through normal shell commands.
- Do not modify the Package Guardian SQLite database directly.
- Do not modify internal files in \`.packageguardian/\` unnecessarily.
- Do not delete Package Guardian snapshots or state files manually.
- Do not bypass Package Guardian by inventing duplicate dependency tracking mechanisms.
- Prefer \`--json\` output for programmatic parsing.
- Consult \`pg help <command>\` whenever parameter usage is uncertain.
- Preserve existing project configuration and functionality.
`;
}

export const generatePackageGuardMdContent = generatePackageGuardianMdContent;

export function ensurePackageGuardianMd(projectDir: string, projectName: string, packageManager: string): boolean {
  const markerDir = path.join(projectDir, ".packageguardian");
  const legacyDir = path.join(projectDir, ".packageguard");
  fs.mkdirSync(markerDir, { recursive: true });
  fs.mkdirSync(legacyDir, { recursive: true });

  const mdPath = path.join(markerDir, "PACKAGEGUARDIAN.md");
  const legacyMdPath = path.join(legacyDir, "PACKAGEGUARD.md");

  const content = generatePackageGuardianMdContent(projectName, packageManager);

  let created = false;
  if (!fs.existsSync(mdPath)) {
    fs.writeFileSync(mdPath, content, "utf8");
    created = true;
  }
  if (!fs.existsSync(legacyMdPath)) {
    fs.writeFileSync(legacyMdPath, content, "utf8");
  }

  return created;
}

export const ensurePackageGuardMd = ensurePackageGuardianMd;

export const AGENTS_MD_SECTION = `# Package Guardian

This project uses Package Guardian (\`pg\`) for dependency-state management.

Before making significant dependency changes, inspect the current state with Package Guardian and create a recoverable snapshot when appropriate.

Read:

    .packageguardian/PACKAGEGUARDIAN.md

for the complete Package Guardian AI instructions.

Use the existing \`pg\` CLI through normal shell commands.

Do not create a separate Package Guardian API, server, plugin, or dependency-management mechanism.
`;

export function ensureAgentsMd(projectDir: string): { created: boolean; updated: boolean } {
  const agentsPath = path.join(projectDir, "AGENTS.md");

  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, AGENTS_MD_SECTION, "utf8");
    return { created: true, updated: false };
  }

  try {
    const existing = fs.readFileSync(agentsPath, "utf8");
    if (
      existing.includes("# Package Guardian") ||
      existing.includes("Package Guardian (`pg`)") ||
      existing.includes("PACKAGEGUARDIAN.md") ||
      existing.includes("# PackageGuard") ||
      existing.includes("PackageGuard (`pg`)") ||
      existing.includes("PACKAGEGUARD.md")
    ) {
      return { created: false, updated: false };
    }

    const separator = existing.endsWith("\n\n") ? "" : existing.endsWith("\n") ? "\n" : "\n\n";
    const updatedContent = existing + separator + AGENTS_MD_SECTION;
    fs.writeFileSync(agentsPath, updatedContent, "utf8");
    return { created: false, updated: true };
  } catch {
    return { created: false, updated: false };
  }
}

export function initializeProject(
  db: BetterSqlite3.Database,
  targetDir: string,
  customName?: string
): InitResult {
  const normalizedPath = path.resolve(targetDir);
  const existing = getProjectByPath(db, normalizedPath);
  const pm = detectPackageManager(normalizedPath);

  // If already registered in DB and directory has .packageguardian or .packageguard
  const markerDir = path.join(normalizedPath, ".packageguardian");
  const legacyMarkerDir = path.join(normalizedPath, ".packageguard");
  if (existing && (fs.existsSync(markerDir) || fs.existsSync(legacyMarkerDir))) {
    if (pm && existing.package_manager !== pm) {
      setProjectPackageManager(db, existing.id, pm);
    }
    const resolvedPm = existing.package_manager || pm || "npm";
    const pgMdCreated = ensurePackageGuardianMd(normalizedPath, existing.name, resolvedPm);
    const agentsResult = ensureAgentsMd(normalizedPath);

    return {
      project: existing,
      alreadyInitialized: true,
      packageManager: resolvedPm,
      packageGuardianMdCreated: pgMdCreated,
      packageGuardMdCreated: pgMdCreated,
      agentsMdCreated: agentsResult.created,
      agentsMdUpdated: agentsResult.updated
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

  // Ensure .packageguardian directory & config exists (and maintain .packageguard for compatibility)
  fs.mkdirSync(markerDir, { recursive: true });
  fs.mkdirSync(legacyMarkerDir, { recursive: true });
  const configPath = path.join(markerDir, "config.json");
  const legacyConfigPath = path.join(legacyMarkerDir, "config.json");
  const projectId = existing ? existing.id : `proj-${randomUUID().slice(0, 8)}`;

  const configContent = JSON.stringify(
    {
      id: projectId,
      name: projectName,
      packageManager: pm,
      initializedAt: existing?.created_at || new Date().toISOString(),
      version: "1.0.0"
    },
    null,
    2
  );

  fs.writeFileSync(configPath, configContent, "utf8");
  fs.writeFileSync(legacyConfigPath, configContent, "utf8");

  const project = upsertProject(db, {
    id: projectId,
    name: projectName,
    path: normalizedPath,
    status: "ACTIVE"
  });

  setProjectPackageManager(db, projectId, pm);

  // Generate AI instructions
  const pgMdCreated = ensurePackageGuardianMd(normalizedPath, projectName, pm);
  const agentsResult = ensureAgentsMd(normalizedPath);

  return {
    project: { ...project, package_manager: pm },
    alreadyInitialized: false,
    packageManager: pm,
    packageGuardianMdCreated: pgMdCreated,
    packageGuardMdCreated: pgMdCreated,
    agentsMdCreated: agentsResult.created,
    agentsMdUpdated: agentsResult.updated
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
    const candidateMarkers = [
      path.join(project.path, ".packageguardian", "config.json"),
      path.join(project.path, ".packageguard", "config.json"),
    ];
    for (const marker of candidateMarkers) {
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
    try {
      insertHistory(db, {
        projectId: project.id,
        eventType: "UPDATE",
        description: `Project renamed from "${project.name}" to "${newName}"`,
        detailsJson: JSON.stringify({ oldName: project.name, newName, action: "rename" })
      });
    } catch {
      // ignore
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

