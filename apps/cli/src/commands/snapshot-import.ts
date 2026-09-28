import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { importSnapshot } from "../services/snapshot-service";
import { sendCliEvent } from "../pipe-client";

export async function executeSnapshotImport(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    return 3;
  }

  const filePath = args[0];
  if (!filePath) {
    console.error("Error: File path required.");
    console.error("Usage: pg snapshot import <file>\n");
    return 2;
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

    console.log(`Snapshot imported successfully.`);
    console.log(`ID:       ${importedSnap.id}`);
    console.log(`Name:     ${importedSnap.name}`);
    console.log(`Files:    ${importedSnap.file_count}`);
    console.log(`Packages: ${importedSnap.package_count}\n`);
    return 0;
  } catch (err) {
    console.error(`Import failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
