import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { fastCheck } from "../services/verify-service";

import { outputSuccess, outputError } from "../output";

export async function executeCheck(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "check",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const res = fastCheck(projectDir);

  if (res.healthy) {
    return outputSuccess(
      "check",
      {
        projectName: project.name,
        healthy: true,
        issues: []
      },
      jsonMode,
      () => {
        console.log(`Quick Health Check — ${project.name}\n`);
        console.log("Health Status: HEALTHY");
        console.log("All essential manifests, project markers, and directories verified.\n");
      }
    );
  }

  return outputError(
    "check",
    "HEALTH_ISSUES_DETECTED",
    `Quick health check detected ${res.issues.length} issue(s).`,
    4,
    jsonMode,
    res.issues
  );
}
