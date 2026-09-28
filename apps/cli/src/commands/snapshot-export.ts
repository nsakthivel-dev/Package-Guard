import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { exportSnapshot } from "../services/snapshot-service";

export async function executeSnapshotExport(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    return 3;
  }

  const snapshotId = args[0];
  if (!snapshotId) {
    console.error("Error: Snapshot ID required.");
    console.error("Usage: pg snapshot export <id> [--out <output-file>]\n");
    return 2;
  }

  let outPath: string | undefined;
  const outIdx = args.indexOf("--out");
  if (outIdx !== -1 && args[outIdx + 1]) {
    outPath = args[outIdx + 1];
  } else if (args[1] && !args[1].startsWith("-")) {
    outPath = args[1];
  }

  try {
    const exportedTo = exportSnapshot(db, snapshotId, outPath);
    console.log(`Snapshot '${snapshotId}' exported successfully.`);
    console.log(`File: ${exportedTo}\n`);
    return 0;
  } catch (err) {
    console.error(`Export failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
