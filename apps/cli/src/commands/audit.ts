import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { runSecurityAudit } from "../services/security-service";
import { sendCliEvent } from "../pipe-client";
import { outputSuccess, outputError } from "../output";

export async function executeAudit(
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
    console.log(`Auditing dependencies for '${project.name}'...\n`);
  }
  const report = await runSecurityAudit(db, project);

  await sendCliEvent("audit", {
    projectId: project.id,
    projectName: project.name,
    status: report.status,
    summary: report.summary,
    vulnerabilitiesCount: report.vulnerabilities.length
  }, project.id);

  if (isJson) {
    outputSuccess(report);
    return 0;
  }

  if (report.status === "UNAVAILABLE") {
    console.log(report.message || "Security audit data unavailable for this project/environment.\n");
    return 0;
  }

  if (report.vulnerabilities.length === 0) {
    console.log("No security vulnerabilities detected across project dependencies.\n");
    return 0;
  }

  console.log(`Security Audit Found ${report.vulnerabilities.length} Vulnerabilities:\n`);
  console.log(
    "Severity".padEnd(12, " ") +
    "Package".padEnd(24, " ") +
    "Vulnerable Versions".padEnd(22, " ") +
    "Fixed In"
  );
  console.log("─".repeat(70));

  for (const v of report.vulnerabilities) {
    const sev = `[${v.severity}]`.padEnd(12, " ");
    const pkg = v.name.slice(0, 22).padEnd(24, " ");
    const ver = v.vulnerableVersions.slice(0, 20).padEnd(22, " ");
    const fix = v.fixedIn || "No direct fix available";
    console.log(`${sev}${pkg}${ver}${fix}`);
  }
  console.log();

  return 0;
}
