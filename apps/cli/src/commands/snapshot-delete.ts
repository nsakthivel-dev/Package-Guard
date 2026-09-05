import * as readline from "node:readline";
import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getSnapshot, deleteSnapshot } from "../services/snapshot-service";
import { sendCliEvent } from "../pipe-client";

function askConfirmation(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return Promise.resolve(false);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      resolve(trimmed === "y" || trimmed === "yes");
    });
  });
}

export async function executeSnapshotDelete(
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

  const nonFlagArgs = args.filter((a) => !a.startsWith("-"));
  const isForced = args.some((a) => a === "-y" || a === "--yes" || a === "--force");

  const snapshotId = nonFlagArgs[0];
  if (!snapshotId) {
    console.error("Error: Snapshot ID is required.");
    console.error("Usage: pg snapshot delete <id> [-y]");
    return 2;
  }

  const { snapshot } = getSnapshot(db, snapshotId);
  if (!snapshot) {
    console.error(`Error: Snapshot '${snapshotId}' not found.`);
    return 4;
  }

  if (!isForced) {
    console.log(`This will delete snapshot '${snapshot.id}' (${snapshot.name}).`);
    const confirmed = await askConfirmation("Are you sure? [y/N] ");
    if (!confirmed) {
      console.log("Operation aborted.");
      return 0;
    }
  }

  const success = deleteSnapshot(db, snapshotId);
  if (!success) {
    console.error(`Error: Failed to delete snapshot '${snapshotId}'.`);
    return 1;
  }

  await sendCliEvent("snapshot_delete", {
    snapshotId: snapshot.id,
    snapshotName: snapshot.name,
    projectId: project.id,
    projectName: project.name
  }, project.id);

  console.log(`Snapshot '${snapshotId}' deleted successfully.`);
  return 0;
}
