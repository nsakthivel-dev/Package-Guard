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

import { outputSuccess, outputError } from "../output";

export async function executeSnapshot(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const cleanArgs = args.filter((a) => a !== "--json" && a !== "-j");
  const sub = cleanArgs[0]?.toLowerCase();
  const subArgs = cleanArgs.slice(1);

  if (sub === "list") {
    return executeSnapshotList(db, targetDir, subArgs, jsonMode);
  }
  if (sub === "show") {
    return executeSnapshotShow(db, targetDir, subArgs, jsonMode);
  }
  if (sub === "restore") {
    return executeSnapshotRestore(db, targetDir, subArgs, jsonMode);
  }
  if (sub === "delete") {
    return executeSnapshotDelete(db, targetDir, subArgs, jsonMode);
  }
  if (sub === "export") {
    return executeSnapshotExport(db, targetDir, subArgs, jsonMode);
  }
  if (sub === "import") {
    return executeSnapshotImport(db, targetDir, subArgs, jsonMode);
  }

  // Handle "create" or default snapshot creation
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "snapshot",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const nameArgs = sub === "create" ? subArgs : cleanArgs;
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

  return outputSuccess(
    "snapshot",
    snapshot,
    jsonMode,
    () => {
      console.log("Snapshot created\n");
      console.log(`ID:       ${snapshot.id}`);
      console.log(`Name:     ${snapshot.name}`);
      console.log(`Project:  ${project.name}`);
      console.log(`Files:    ${snapshot.file_count}`);
      console.log(`Packages: ${snapshot.package_count}`);
      console.log(`Status:   ${snapshot.status}\n`);
    }
  );
}
