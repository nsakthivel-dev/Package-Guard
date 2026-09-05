import type BetterSqlite3 from "better-sqlite3";
import { findProject } from "../services/project-service";
import { runDoctor } from "../services/doctor-service";
import { sendCliEvent } from "../pipe-client";

export async function executeDoctor(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  const report = await runDoctor(db, projectDir, project?.id);

  await sendCliEvent("doctor", {
    projectId: project?.id,
    projectName: project?.name,
    overall: report.overall,
    checks: report.checks
  }, project?.id);

  console.log("Package Guard Doctor\n");

  for (const c of report.checks) {
    const tag = c.status === "OK" ? "[OK]" : c.status === "WARN" ? "[WARN]" : "[FAIL]";
    console.log(`${tag} ${c.name}`);
    if (c.status !== "OK") {
      console.log(`     ${c.message}`);
    }
  }

  console.log(`\nOverall Health: ${report.overall}`);
  return report.overall === "OK" ? 0 : 1;
}
