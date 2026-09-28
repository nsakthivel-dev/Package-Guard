import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { fastCheck } from "../services/verify-service";

export async function executeCheck(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    return 3;
  }

  const res = fastCheck(projectDir);

  console.log(`Quick Health Check — ${project.name}\n`);
  if (res.healthy) {
    console.log("Health Status: HEALTHY");
    console.log("All essential manifests, project markers, and directories verified.\n");
    return 0;
  }

  console.log("Health Status: ISSUES DETECTED\n");
  for (const issue of res.issues) {
    console.log(`  ! ${issue}`);
  }
  console.log("\nRun 'pg doctor' or 'pg repair' to fix detected issues.\n");
  return 4;
}
