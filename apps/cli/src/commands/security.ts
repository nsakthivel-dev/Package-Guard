import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { runSecurityAudit } from "../services/security-service";

export async function executeSecurity(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    return 3;
  }

  const report = await runSecurityAudit(db, project);

  console.log(`Security Overview — ${project.name}\n`);
  console.log(`Status:   ${report.status === "OK" ? "SECURE" : report.status}`);
  console.log(`Critical: ${report.summary.critical}`);
  console.log(`High:     ${report.summary.high}`);
  console.log(`Medium:   ${report.summary.medium}`);
  console.log(`Low:      ${report.summary.low}`);
  console.log(`Total:    ${report.summary.total}\n`);

  if (report.summary.total > 0) {
    console.log("Run 'pg vulnerabilities' to inspect detailed issues, or 'pg fix-security' to apply fixes.\n");
  }

  return 0;
}
