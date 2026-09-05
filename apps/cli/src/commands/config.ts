import type BetterSqlite3 from "better-sqlite3";
import { findProject } from "../services/project-service";
import { getDbPath, getSnapshotStorageDir } from "@package-guard/shared/paths";
import { PIPE_NAME } from "@package-guard/shared";
import { sendCliEvent } from "../pipe-client";

export async function executeConfig(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project } = findProject(db, targetDir);

  const config = {
    project: project ? project.name : "None (unregistered)",
    projectPath: project ? project.path : targetDir,
    database: getDbPath(),
    snapshotStorage: getSnapshotStorageDir(),
    communication: `Named Pipe (${PIPE_NAME})`,
    autoSync: "Enabled"
  };

  await sendCliEvent("config", {
    projectId: project?.id,
    projectName: project?.name,
    config
  }, project?.id);

  console.log("Package Guard Configuration\n");
  console.log(`Project: ${config.project}`);
  if (project) {
    console.log(`Project Path: ${config.projectPath}`);
  }
  console.log(`Database: ${config.database}`);
  console.log(`Snapshot Storage: ${config.snapshotStorage}`);
  console.log(`Communication: ${config.communication}`);
  console.log(`Auto Sync: ${config.autoSync}`);

  return 0;
}
