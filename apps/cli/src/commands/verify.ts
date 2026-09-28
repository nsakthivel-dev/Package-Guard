import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { verifyProject } from "../services/verify-service";
import { insertHistory } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

export async function executeVerify(
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

  const isDeep = args.includes("--deep");
  const result = await verifyProject(db, project.id, projectDir, { deep: isDeep });

  insertHistory(db, {
    projectId: project.id,
    eventType: "VERIFY",
    description: `Verification (${isDeep ? "deep" : "standard"}): ${result.status} (${result.filesChecked} files checked)`,
    detailsJson: JSON.stringify(result)
  });

  await sendCliEvent("verify", {
    projectId: project.id,
    projectName: project.name,
    filesChecked: result.filesChecked,
    valid: result.valid,
    changed: result.changed,
    missing: result.missing,
    unexpected: result.unexpected,
    status: result.status,
    details: result.details,
    deep: isDeep
  }, project.id);

  console.log(`Package Guard Verification${isDeep ? " (deep mode)" : ""}\n`);
  console.log(`Files checked: ${result.filesChecked.toLocaleString()}`);
  console.log(`Valid:         ${result.valid.toLocaleString()}`);
  console.log(`Changed:       ${result.changed.toLocaleString()}`);
  console.log(`Missing:       ${result.missing.toLocaleString()}`);
  console.log(`Unexpected:    ${result.unexpected.toLocaleString()}`);

  if (result.details.length > 0) {
    console.log("\nIssues Detected:");
    for (const d of result.details.slice(0, 15)) {
      console.log(`  - ${d.file}: ${d.issue}`);
    }
    if (result.details.length > 15) {
      console.log(`  ... and ${result.details.length - 15} more`);
    }
  }

  console.log(`\nResult: ${result.status}\n`);

  if (result.status === "OK") {
    return 0;
  }

  // Exit code 4 = verification/integrity failure
  return 4;
}
