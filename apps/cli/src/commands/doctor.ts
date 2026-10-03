import type BetterSqlite3 from "better-sqlite3";
import { findProject } from "../services/project-service";
import { runDoctor } from "../services/doctor-service";
import { sendCliEvent } from "../pipe-client";
import { outputSuccess } from "../output";

export async function executeDoctor(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[],
  isJson: boolean = false
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  const report = await runDoctor(db, projectDir, project?.id);

  await sendCliEvent("doctor", {
    projectId: project?.id,
    projectName: project?.name,
    overall: report.overall,
    checks: report.checks
  }, project?.id);

  if (isJson) {
    outputSuccess(report);
    return report.overall === "OK" ? 0 : 1;
  }

  console.log("Package Guard Doctor\n");

  for (const c of report.checks) {
    const tag = c.status === "OK" ? "[PASS]" : c.status === "WARN" ? "[WARN]" : "[FAIL]";
    console.log(`${tag} ${c.name}`);
    if (c.status !== "OK") {
      console.log(`     ${c.message}`);
    }
  }

  const overallTag = report.overall === "OK" ? "PASS" : "FAIL";
  console.log(`\nOverall Health: [${overallTag}]`);
  return report.overall === "OK" ? 0 : 1;
}
