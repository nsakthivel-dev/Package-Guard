import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { exportSnapshot } from "../services/snapshot-service";

import { outputSuccess, outputError } from "../output";

export async function executeSnapshotExport(
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
      "snapshot_export",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const snapshotId = cleanArgs[0];
  if (!snapshotId) {
    return outputError(
      "snapshot_export",
      "ARGUMENT_REQUIRED",
      "Snapshot ID required. Usage: pg snapshot export <id> [--out <output-file>]",
      2,
      jsonMode
    );
  }

  let outPath: string | undefined;
  const outIdx = cleanArgs.indexOf("--out");
  if (outIdx !== -1 && cleanArgs[outIdx + 1]) {
    outPath = cleanArgs[outIdx + 1];
  } else if (cleanArgs[1] && !cleanArgs[1].startsWith("-")) {
    outPath = cleanArgs[1];
  }

  try {
    const exportedTo = exportSnapshot(db, snapshotId, outPath);
    return outputSuccess(
      "snapshot_export",
      {
        snapshotId,
        filePath: exportedTo
      },
      jsonMode,
      () => {
        console.log(`Snapshot '${snapshotId}' exported successfully.`);
        console.log(`File: ${exportedTo}\n`);
      }
    );
  } catch (err) {
    return outputError(
      "snapshot_export",
      "EXPORT_FAILED",
      `Export failed: ${err instanceof Error ? err.message : String(err)}`,
      1,
      jsonMode
    );
  }
}
