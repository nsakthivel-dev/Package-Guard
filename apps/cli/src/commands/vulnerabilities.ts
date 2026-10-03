import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { runSecurityAudit } from "../services/security-service";
import { outputSuccess, outputError } from "../output";

export async function executeVulnerabilities(
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

  const report = await runSecurityAudit(db, project);

  if (isJson) {
    outputSuccess({
      projectId: project.id,
      projectName: project.name,
      status: report.status,
      summary: report.summary,
      vulnerabilities: report.vulnerabilities
    });
    return 0;
  }

  if (report.status === "UNAVAILABLE") {
    console.log(report.message || "Vulnerability data unavailable.\n");
    return 0;
  }

  if (report.vulnerabilities.length === 0) {
    console.log("No vulnerabilities detected in project dependencies.\n");
    return 0;
  }

  console.log(`Detected Vulnerabilities (${report.vulnerabilities.length})\n`);
  for (const v of report.vulnerabilities) {
    console.log(`[${v.severity}] ${v.name}`);
    console.log(`  Title:     ${v.title}`);
    console.log(`  Affected:  ${v.vulnerableVersions}`);
    console.log(`  Fixed in:  ${v.fixedIn || "None"}`);
    if (v.url) console.log(`  Advisory:  ${v.url}`);
    console.log();
  }

  return 0;
}
