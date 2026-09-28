import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { rollbackProject } from "../services/update-service";

export async function executeRollback(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    return 3;
  }

  const targetSnapshotId = args[0];
  console.log(`Initiating rollback for '${project.name}'...`);

  const res = await rollbackProject(db, project, targetSnapshotId);

  if (!res.success) {
    console.error(`Rollback failed: ${res.error}\n`);
    return 1;
  }

  console.log(`Rollback completed successfully.`);
  console.log(`Restored snapshot: ${res.snapshotId}`);
  console.log(`Files restored:    ${res.restoredFiles}\n`);

  return 0;
}
