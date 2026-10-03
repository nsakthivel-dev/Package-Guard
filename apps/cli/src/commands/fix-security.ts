import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { fixSecurityVulnerabilities } from "../services/security-service";
import { outputSuccess, outputError } from "../output";

export async function executeFixSecurity(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[],
  isJson: boolean = false
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    if (isJson) {
      outputError("Package Guard has not been initialized in this directory.", "NOT_INITIALIZED");
    } else {
      console.error("Error: Package Guard has not been initialized in this directory.\n");
    }
    return 3;
  }

  if (!isJson) {
    console.log(`Analyzing vulnerabilities and preparing remediations for '${project.name}'...\n`);
  }
  const result = await fixSecurityVulnerabilities(db, project);

  if (isJson) {
    outputSuccess(result);
    return result.failed > 0 ? 1 : 0;
  }

  if (result.items.length === 0) {
    console.log("No vulnerabilities with automated fixes available.\n");
    return 0;
  }

  console.log(`Remediation Results:\n`);
  for (const item of result.items) {
    const status = item.success ? "FIXED" : "FAILED";
    console.log(`  [${status}] ${item.package} → ${item.fixedIn || "latest"}`);
  }

  console.log(`\nSummary: ${result.fixed} remediated, ${result.failed} failed.\n`);
  return result.failed > 0 ? 1 : 0;
}
