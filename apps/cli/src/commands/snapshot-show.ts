import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getSnapshot } from "../services/snapshot-service";
import { sendCliEvent } from "../pipe-client";

export async function executeSnapshotShow(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    console.error("Run:\n\n  pg init\n");
    return 3;
  }

  const snapshotId = args[0];
  if (!snapshotId) {
    console.error("Error: Snapshot ID is required.");
    console.error("Usage: pg snapshot show <id>");
    return 2;
  }

  const { snapshot, files, manifest } = getSnapshot(db, snapshotId);

  if (!snapshot) {
    console.error(`Error: Snapshot '${snapshotId}' not found.`);
    return 4;
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

  return 0;
}
