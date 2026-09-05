import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { verifyProject } from "../services/verify-service";
import { sendCliEvent } from "../pipe-client";

export async function executeVerify(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    console.error("Run:\n\n  pg init\n");
    return 3;
  }

  const result = await verifyProject(db, project.id, projectDir);

  await sendCliEvent("verify", {
    projectId: project.id,
    projectName: project.name,
    filesChecked: result.filesChecked,
    valid: result.valid,
    changed: result.changed,
    missing: result.missing,
    unexpected: result.unexpected,
    status: result.status,
    details: result.details
  }, project.id);

  console.log("Package Guard Verification\n");
  console.log(`Files checked: ${result.filesChecked.toLocaleString()}`);
  console.log(`Valid: ${result.valid.toLocaleString()}`);
  console.log(`Changed: ${result.changed.toLocaleString()}`);
  console.log(`Missing: ${result.missing.toLocaleString()}`);
  console.log(`Unexpected: ${result.unexpected.toLocaleString()}`);
  console.log(`\nResult: ${result.status}`);

  if (result.status === "OK") {
    return 0;
  }

  return 5;
}
