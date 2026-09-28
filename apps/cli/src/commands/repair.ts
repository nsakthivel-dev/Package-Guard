import type BetterSqlite3 from "better-sqlite3";
import { findProject } from "../services/project-service";
import { runRepair, repairPackages, repairDatabase, repairConfig } from "../services/doctor-service";
import { sendCliEvent } from "../pipe-client";

export async function executeRepair(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);
  const sub = (args[0] || "").toLowerCase();

  console.log("Package Guard Repair\n");

  if (sub === "packages") {
    if (!projectDir) {
      console.error("Error: 'repair packages' requires an active project directory.");
      return 3;
    }
    const res = await repairPackages(projectDir);
    const tag = res.status === "OK" ? "[PASS]" : res.status === "SKIPPED" ? "[WARN]" : "[FAIL]";
    console.log(`${tag} ${res.description}`);
    await sendCliEvent("repair", {
      projectId: project?.id,
      projectName: project?.name,
      subcommand: "packages",
      repairs: [res],
      completed: res.status === "OK" ? 1 : 0,
      failed: res.status === "FAILED" ? 1 : 0
    }, project?.id);
    return res.status === "FAILED" ? 1 : 0;
  }

  if (sub === "database") {
    const res = repairDatabase(db);
    const tag = res.status === "OK" ? "[PASS]" : "[FAIL]";
    console.log(`${tag} ${res.description}`);
    await sendCliEvent("repair", {
      subcommand: "database",
      repairs: [res],
      completed: res.status === "OK" ? 1 : 0,
      failed: res.status === "FAILED" ? 1 : 0
    });
    return res.status === "FAILED" ? 1 : 0;
  }

  if (sub === "config") {
    const res = repairConfig(db, projectDir);
    const tag = res.status === "OK" ? "[PASS]" : "[FAIL]";
    console.log(`${tag} ${res.description}`);
    await sendCliEvent("repair", {
      projectId: project?.id,
      projectName: project?.name,
      subcommand: "config",
      repairs: [res],
      completed: res.status === "OK" ? 1 : 0,
      failed: res.status === "FAILED" ? 1 : 0
    }, project?.id);
    return res.status === "FAILED" ? 1 : 0;
  }

  // Default: run full repair
  const report = await runRepair(db, projectDir, project?.id);

  await sendCliEvent("repair", {
    projectId: project?.id,
    projectName: project?.name,
    repairs: report.repairs,
    completed: report.completed,
    failed: report.failed
  }, project?.id);

  for (const r of report.repairs) {
    const tag = r.status === "OK" ? "[PASS]" : r.status === "SKIPPED" ? "[WARN]" : "[FAIL]";
    console.log(`${tag} ${r.description}`);
  }

  console.log(`\nRepairs completed: ${report.completed} (failed: ${report.failed})`);
  return report.failed === 0 ? 0 : 1;
}
