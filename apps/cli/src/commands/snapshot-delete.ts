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

import { outputSuccess, outputError } from "../output";

export async function executeSnapshotDelete(
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
      "snapshot_delete",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const nonFlagArgs = cleanArgs.filter((a) => !a.startsWith("-"));
  const isForced = cleanArgs.some((a) => a === "-y" || a === "--yes" || a === "--force");

  const snapshotId = nonFlagArgs[0];
  if (!snapshotId) {
    return outputError(
      "snapshot_delete",
      "ARGUMENT_REQUIRED",
      "Snapshot ID is required. Usage: pg snapshot delete <id> [-y]",
      2,
      jsonMode
    );
  }

  const { snapshot } = getSnapshot(db, snapshotId);
  if (!snapshot) {
    return outputError(
      "snapshot_delete",
      "SNAPSHOT_NOT_FOUND",
      `Snapshot '${snapshotId}' not found.`,
      4,
      jsonMode
    );
  }

  if (!isForced) {
    if (jsonMode) {
      return outputError(
        "snapshot_delete",
        "CONFIRMATION_REQUIRED",
        `Deleting snapshot '${snapshot.id}' (${snapshot.name}) is a destructive operation. Pass -y or --yes flag to confirm.`,
        2,
        jsonMode
      );
    }

    console.log(`This will delete snapshot '${snapshot.id}' (${snapshot.name}).`);
    const confirmed = await askConfirmation("Are you sure? [y/N] ");
    if (!confirmed) {
      console.log("Operation aborted.");
      return 0;
    }
  }

  const success = deleteSnapshot(db, snapshotId);
  if (!success) {
    return outputError(
      "snapshot_delete",
      "DELETE_FAILED",
      `Failed to delete snapshot '${snapshotId}'.`,
      1,
      jsonMode
    );
  }

  await sendCliEvent("snapshot_delete", {
    snapshotId: snapshot.id,
    snapshotName: snapshot.name,
    projectId: project.id,
    projectName: project.name
  }, project.id);

  return outputSuccess(
    "snapshot_delete",
    {
      snapshotId: snapshot.id,
      snapshotName: snapshot.name,
      deleted: true
    },
    jsonMode,
    () => {
      console.log(`Snapshot '${snapshotId}' deleted successfully.`);
    }
  );
}
