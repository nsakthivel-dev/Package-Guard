import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { rollbackProject } from "../services/update-service";

import { outputSuccess, outputError } from "../output";

export async function executeRollback(
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
      "rollback",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const targetSnapshotId = cleanArgs[0];
  if (!jsonMode) {
    console.log(`Initiating rollback for '${project.name}'...`);
  }

  const res = await rollbackProject(db, project, targetSnapshotId);

  if (!res.success) {
    return outputError(
      "rollback",
      "ROLLBACK_FAILED",
      res.error || "Rollback failed",
      1,
      jsonMode
    );
  }

  return outputSuccess(
    "rollback",
    res,
    jsonMode,
    () => {
      console.log(`Rollback completed successfully.`);
      console.log(`Restored snapshot: ${res.snapshotId}`);
      console.log(`Files restored:    ${res.restoredFiles}\n`);
    }
  );
}
