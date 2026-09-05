import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { scanProject } from "../services/scanner-service";
import { insertScan } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

export async function executeScan(
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

  const result = await scanProject(db, project.id, projectDir, project.name);

  // Persist scan result to SQLite
  insertScan(db, {
    id: result.id,
    projectId: project.id,
    filesScanned: result.filesScanned,
    packagesDetected: result.packagesDetected,
    changesDetected: result.changesDetected,
    durationMs: result.durationMs,
    status: result.status,
    resultJson: JSON.stringify(result)
  });

  // Emit event to Electron
  await sendCliEvent("scan", {
    scanId: result.id,
    projectId: project.id,
    projectName: project.name,
    projectPath: projectDir,
    filesScanned: result.filesScanned,
    packagesDetected: result.packagesDetected,
    changesDetected: result.changesDetected,
    durationMs: result.durationMs,
    status: result.status,
    changes: result.changes,
    packages: result.packages
  }, project.id);

  console.log("Scan completed\n");
  console.log(`Project: ${project.name}`);
  console.log(`Files scanned: ${result.filesScanned.toLocaleString()}`);
  console.log(`Packages detected: ${result.packagesDetected.toLocaleString()}`);
  console.log(`Changes detected: ${result.changesDetected.toLocaleString()}`);
  console.log(`Duration: ${(result.durationMs / 1000).toFixed(2)}s`);
  console.log(`Status: ${result.status}`);

  return 0;
}
