import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { listSnapshots } from "../services/snapshot-service";
import { sendCliEvent } from "../pipe-client";

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const mins = String(d.getMinutes()).padStart(2, "0");
    return `${month} ${day} ${hours}:${mins}`;
  } catch {
    return iso;
  }
}

import { outputSuccess, outputError } from "../output";

export async function executeSnapshotList(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[] = [],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "snapshot_list",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const snapshots = listSnapshots(db, project.id);

  await sendCliEvent("snapshot_list", {
    projectId: project.id,
    projectName: project.name,
    count: snapshots.length,
    snapshots: snapshots.map((s) => ({
      id: s.id,
      name: s.name,
      fileCount: s.file_count,
      packageCount: s.package_count,
      createdAt: s.created_at
    }))
  }, project.id);

  return outputSuccess(
    "snapshot_list",
    {
      projectId: project.id,
      projectName: project.name,
      count: snapshots.length,
      snapshots: snapshots.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        fileCount: s.file_count,
        packageCount: s.package_count,
        status: s.status,
        createdAt: s.created_at
      }))
    },
    jsonMode,
    () => {
      console.log("Snapshots\n");

      if (snapshots.length === 0) {
        console.log("No snapshots found. Run 'pg snapshot' to create one.");
        return;
      }

      console.log("ID       Name             Created");
      console.log("------------------------------------------------");
      for (const s of snapshots) {
        const idPad = s.id.padEnd(8, " ");
        const namePad = s.name.slice(0, 16).padEnd(17, " ");
        const dateStr = formatDate(s.created_at);
        console.log(`${idPad} ${namePad} ${dateStr}`);
      }
    }
  );
}
