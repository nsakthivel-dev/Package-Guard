import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getSnapshot } from "../services/snapshot-service";
import { sendCliEvent } from "../pipe-client";

import { outputSuccess, outputError } from "../output";

export async function executeSnapshotShow(
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
      "snapshot_show",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const snapshotId = cleanArgs[0];
  if (!snapshotId) {
    return outputError(
      "snapshot_show",
      "ARGUMENT_REQUIRED",
      "Snapshot ID is required. Usage: pg snapshot show <id>",
      2,
      jsonMode
    );
  }

  const { snapshot, files, manifest } = getSnapshot(db, snapshotId);

  if (!snapshot) {
    return outputError(
      "snapshot_show",
      "SNAPSHOT_NOT_FOUND",
      `Snapshot '${snapshotId}' not found.`,
      4,
      jsonMode
    );
  }

  await sendCliEvent("snapshot_show", {
    snapshotId: snapshot.id,
    projectId: project.id,
    projectName: project.name,
    name: snapshot.name,
    fileCount: snapshot.file_count,
    packageCount: snapshot.package_count,
    status: snapshot.status,
    createdAt: snapshot.created_at,
    filesCount: files.length,
    packages: manifest?.packages ?? []
  }, project.id);

  return outputSuccess(
    "snapshot_show",
    {
      snapshot,
      files,
      manifest
    },
    jsonMode,
    () => {
      console.log(`Snapshot Details: ${snapshot.id}\n`);
      console.log(`Name: ${snapshot.name}`);
      console.log(`Project: ${project.name}`);
      console.log(`Created: ${new Date(snapshot.created_at).toLocaleString()}`);
      console.log(`Files: ${snapshot.file_count}`);
      console.log(`Packages: ${snapshot.package_count}`);
      console.log(`Status: ${snapshot.status}`);

      if (manifest?.packages && manifest.packages.length > 0) {
        console.log("\nKey Packages:");
        for (const p of manifest.packages.slice(0, 10)) {
          console.log(`  - ${p.name}@${p.version} (${p.type})`);
        }
        if (manifest.packages.length > 10) {
          console.log(`  ... and ${manifest.packages.length - 10} more`);
        }
      }
    }
  );
}
