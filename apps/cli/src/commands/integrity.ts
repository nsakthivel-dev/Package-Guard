import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { verifyIntegrity } from "../services/verify-service";

export async function executeIntegrity(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    return 3;
  }

  console.log(`Checking package integrity for '${project.name}'...\n`);
  const res = await verifyIntegrity(projectDir);

  console.log("Package Integrity Report\n");
  console.log(`Packages verified: ${res.verified}`);
  console.log(`Mismatches:        ${res.mismatches}`);

  if (res.details.length > 0) {
    console.log("\nMismatched Packages:");
    for (const d of res.details.slice(0, 15)) {
      console.log(`  - ${d.package}: expected ${d.expected || "valid"}, actual ${d.actual || "missing"}`);
    }
    if (res.details.length > 15) {
      console.log(`  ... and ${res.details.length - 15} more`);
    }
    console.log("\nRun 'pg repair packages' to reinstall mismatched dependencies.\n");
    return 4;
  }

  console.log("\nResult: INTEGRITY OK\n");
  return 0;
}
