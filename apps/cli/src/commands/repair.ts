import type BetterSqlite3 from "better-sqlite3";
import { findProject } from "../services/project-service";
import { runRepair } from "../services/doctor-service";
import { sendCliEvent } from "../pipe-client";

export async function executeRepair(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  console.log("Package Guard Repair\n");

  const report = await runRepair(db, projectDir, project?.id);

  await sendCliEvent("repair", {
    projectId: project?.id,
    projectName: project?.name,
    repairs: report.repairs,
    completed: report.completed,
    failed: report.failed
  }, project?.id);

  for (const r of report.repairs) {
    const tag = r.status === "OK" ? "[OK]" : "[FAIL]";
    console.log(`${tag} ${r.description}`);
  }

  console.log(`\nRepairs completed: ${report.completed}`);
  return report.failed === 0 ? 0 : 1;
}
