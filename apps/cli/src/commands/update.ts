import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { updateSinglePackage, updateAllPackages } from "../services/update-service";

export async function executeUpdate(
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

  const isAll = args.includes("--all");
  const isSafe = args.includes("--safe");
  const isMajor = args.includes("--major");

  // Filter out flags to check if a specific package was passed
  const nonFlags = args.filter((a) => !a.startsWith("-"));
  const targetPackage = nonFlags[0];

  if (isAll || !targetPackage) {
    if (!isAll && !targetPackage) {
      console.log("No specific package specified. Updating all outdated packages (equivalent to 'pg update --all').");
    }

    console.log(`Starting batch update for project '${project.name}'...`);
    if (isSafe) console.log("Mode: Safe (patch and minor updates only)");
    if (isMajor) console.log("Mode: Major updates allowed");
    console.log();

    const progressTracker = (p: {
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

    console.log("\n");
    if (res.total === 0) {
      console.log("No matching outdated packages found to update.\n");
      return 0;
    }

    console.log(`Batch Update Complete\n`);
    console.log(`Total packages: ${res.total}`);
    console.log(`Successful:     ${res.successful}`);
    console.log(`Failed:         ${res.failed}`);

    if (res.failed > 0) {
      console.log("\nFailed updates:");
      for (const r of res.results.filter((x) => !x.success)) {
        console.log(`  - ${r.package}: ${r.error || "Failed"}`);
      }
    }
    console.log();

    return res.failed > 0 ? 1 : 0;
  }

  // Single package update
  console.log(`Updating package '${targetPackage}'...`);
  console.log("Step 1/5: Creating Safety Snapshot...");
  const res = await updateSinglePackage(db, project, targetPackage, {
    safe: isSafe,
    major: isMajor
  });

  if (!res.success) {
    console.error(`\nUpdate failed: ${res.error}`);
    if (res.safetySnapshotId) {
      console.log(`Safety snapshot '${res.safetySnapshotId}' preserved. Run 'pg rollback' to restore.\n`);
    }
    return 1;
  }

  console.log(`\nSuccessfully updated '${targetPackage}'.`);
  if (res.safetySnapshotId) {
    console.log(`Safety snapshot created: ${res.safetySnapshotId}`);
  }
  console.log("Scan & verification completed.\n");

  return 0;
}
