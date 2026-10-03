import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { updateSinglePackage, updateAllPackages } from "../services/update-service";

import { outputSuccess, outputError } from "../output";

export async function executeUpdate(
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
      "update",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const isAll = cleanArgs.includes("--all");
  const isSafe = cleanArgs.includes("--safe");
  const isMajor = cleanArgs.includes("--major");

  // Filter out flags to check if a specific package was passed
  const nonFlags = cleanArgs.filter((a) => !a.startsWith("-"));
  const targetPackage = nonFlags[0];

  if (isAll || !targetPackage) {
    if (!isAll && !targetPackage && !jsonMode) {
      console.log("No specific package specified. Updating all outdated packages (equivalent to 'pg update --all').");
    }

    if (!jsonMode) {
      console.log(`Starting batch update for project '${project.name}'...`);
      if (isSafe) console.log("Mode: Safe (patch and minor updates only)");
      if (isMajor) console.log("Mode: Major updates allowed");
      console.log();
    }

    const progressTracker = jsonMode ? undefined : (p: {
      total: number;
      completed: number;
      successful: number;
      failed: number;
      currentPackage: string;
      percentage: number;
    }) => {
      process.stdout.write(`\r[${p.percentage}%] (${p.completed}/${p.total}) Updating ${p.currentPackage}... `);
    };

    const res = await updateAllPackages(db, project, {
      safe: isSafe,
      major: isMajor,
      onProgress: progressTracker
    });

    if (res.total === 0) {
      return outputSuccess(
        "update",
        res,
        jsonMode,
        () => {
          console.log("\nNo matching outdated packages found to update.\n");
        }
      );
    }

    if (res.failed > 0) {
      return outputError(
        "update",
        "UPDATE_FAILED",
        `Batch update completed with ${res.failed} failure(s).`,
        1,
        jsonMode,
        res
      );
    }

    return outputSuccess(
      "update",
      res,
      jsonMode,
      () => {
        console.log("\n\nBatch Update Complete\n");
        console.log(`Total packages: ${res.total}`);
        console.log(`Successful:     ${res.successful}`);
        console.log(`Failed:         ${res.failed}\n`);
      }
    );
  }

  // Single package update
  if (!jsonMode) {
    console.log(`Updating package '${targetPackage}'...`);
    console.log("Step 1/5: Creating Safety Snapshot...");
  }

  const res = await updateSinglePackage(db, project, targetPackage, {
    safe: isSafe,
    major: isMajor
  });

  if (!res.success) {
    return outputError(
      "update",
      "UPDATE_FAILED",
      `Update failed: ${res.error}`,
      1,
      jsonMode,
      res
    );
  }

  return outputSuccess(
    "update",
    res,
    jsonMode,
    () => {
      console.log(`\nSuccessfully updated '${targetPackage}'.`);
      if (res.safetySnapshotId) {
        console.log(`Safety snapshot created: ${res.safetySnapshotId}`);
      }
      console.log("Scan & verification completed.\n");
    }
  );
}
