import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { createSnapshot } from "../services/snapshot-service";
import { executeSnapshotList } from "./snapshot-list";
import { executeSnapshotShow } from "./snapshot-show";
import { executeSnapshotRestore } from "./snapshot-restore";
import { executeSnapshotDelete } from "./snapshot-delete";
import { executeSnapshotExport } from "./snapshot-export";
import { executeSnapshotImport } from "./snapshot-import";
import { insertHistory } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

export async function executeSnapshot(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const sub = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  if (sub === "list") {
    return executeSnapshotList(db, targetDir, subArgs);
  }
  if (sub === "show") {
    return executeSnapshotShow(db, targetDir, subArgs);
  }
  if (sub === "restore") {
    return executeSnapshotRestore(db, targetDir, subArgs);
  }
  if (sub === "delete") {
    return executeSnapshotDelete(db, targetDir, subArgs);
  }
  if (sub === "export") {
    return executeSnapshotExport(db, targetDir, subArgs);
  }
  if (sub === "import") {
    return executeSnapshotImport(db, targetDir, subArgs);
  }

  // Handle "create" or default snapshot creation
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    console.error("Run:\n\n  pg init\n");
    return 3;
  }

  const nameArgs = sub === "create" ? subArgs : args;
  const name = nameArgs.length > 0 ? nameArgs.join(" ") : undefined;

  const snapshot = await createSnapshot(db, project.id, projectDir, name);

  insertHistory(db, {
    projectId: project.id,
    eventType: "SNAPSHOT",
    description: `Created snapshot '${snapshot.name}' (${snapshot.file_count} files, ${snapshot.package_count} pkgs)`,
    detailsJson: JSON.stringify({ snapshotId: snapshot.id, name: snapshot.name, fileCount: snapshot.file_count })
  });

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
  console.log(`ID:       ${snapshot.id}`);
  console.log(`Name:     ${snapshot.name}`);
  console.log(`Project:  ${project.name}`);
  console.log(`Files:    ${snapshot.file_count}`);
  console.log(`Packages: ${snapshot.package_count}`);
  console.log(`Status:   ${snapshot.status}\n`);

  return 0;
}
