import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { importSnapshot } from "../services/snapshot-service";
import { sendCliEvent } from "../pipe-client";

import { outputSuccess, outputError } from "../output";

export async function executeSnapshotImport(
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
      "snapshot_import",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const filePath = cleanArgs[0];
  if (!filePath) {
    return outputError(
      "snapshot_import",
      "ARGUMENT_REQUIRED",
      "File path required. Usage: pg snapshot import <file>",
      2,
      jsonMode
    );
  }

  try {
    const importedSnap = importSnapshot(db, project.id, filePath);

    await sendCliEvent("snapshot_import", {
      projectId: project.id,
      snapshotId: importedSnap.id,
      name: importedSnap.name,
      fileCount: importedSnap.file_count,
      packageCount: importedSnap.package_count
    }, project.id);

    return outputSuccess(
      "snapshot_import",
      {
        snapshot: importedSnap
      },
      jsonMode,
      () => {
        console.log(`Snapshot imported successfully.`);
        console.log(`ID:       ${importedSnap.id}`);
        console.log(`Name:     ${importedSnap.name}`);
        console.log(`Files:    ${importedSnap.file_count}`);
        console.log(`Packages: ${importedSnap.package_count}\n`);
      }
    );
  } catch (err) {
    return outputError(
      "snapshot_import",
      "IMPORT_FAILED",
      `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      1,
      jsonMode
    );
  }
}
