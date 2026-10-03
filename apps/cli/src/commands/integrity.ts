import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { verifyIntegrity } from "../services/verify-service";

import { outputSuccess, outputError } from "../output";

export async function executeIntegrity(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "integrity",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const res = await verifyIntegrity(projectDir);

  if (res.mismatches === 0) {
    return outputSuccess(
      "integrity",
      res,
      jsonMode,
      () => {
        console.log(`Checking package integrity for '${project.name}'...\n`);
        console.log("Package Integrity Report\n");
        console.log(`Packages verified: ${res.verified}`);
        console.log(`Mismatches:        ${res.mismatches}`);
        console.log("\nResult: INTEGRITY OK\n");
      }
    );
  }

  return outputError(
    "integrity",
    "INTEGRITY_MISMATCH",
    `Package integrity check found ${res.mismatches} mismatch(es).`,
    4,
    jsonMode,
    res
  );
}
