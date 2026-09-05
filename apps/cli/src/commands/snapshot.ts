import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { createSnapshot } from "../services/snapshot-service";
import { sendCliEvent } from "../pipe-client";

export async function executeSnapshot(
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

  const name = args.length > 0 ? args.join(" ") : undefined;
  const snapshot = await createSnapshot(db, project.id, projectDir, name);

  await sendCliEvent("snapshot", {
    snapshotId: snapshot.id,
    projectId: project.id,
    projectName: project.name,
    name: snapshot.name,
    fileCount: snapshot.file_count,
    packageCount: snapshot.package_count,
    status: snapshot.status,
    createdAt: snapshot.created_at
  }, project.id);

  console.log("Snapshot created\n");
  console.log(`ID: ${snapshot.id}`);
  console.log(`Name: ${snapshot.name}`);
  console.log(`Project: ${project.name}`);
  console.log(`Files: ${snapshot.file_count}`);
  console.log(`Packages: ${snapshot.package_count}`);
  console.log(`Status: ${snapshot.status}`);

  return 0;
}
