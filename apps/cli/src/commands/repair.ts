import type BetterSqlite3 from "better-sqlite3";
import { findProject } from "../services/project-service";
import { runRepair, repairPackages, repairDatabase, repairConfig } from "../services/doctor-service";
import { sendCliEvent } from "../pipe-client";
import { outputSuccess, outputError } from "../output";

export async function executeRepair(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson: boolean = false
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);
  const sub = (args[0] || "").toLowerCase();

  if (sub === "packages") {
    if (!projectDir) {
      if (isJson) {
        outputError("'repair packages' requires an active project directory.", "NOT_INITIALIZED");
      } else {
        console.error("Error: 'repair packages' requires an active project directory.");
      }
      return 3;
    }
    const res = await repairPackages(projectDir);
    await sendCliEvent("repair", {
      projectId: project?.id,
      projectName: project?.name,
      subcommand: "packages",
      repairs: [res],
      completed: res.status === "OK" ? 1 : 0,
      failed: res.status === "FAILED" ? 1 : 0
    }, project?.id);

    if (isJson) {
      outputSuccess(res);
      return res.status === "FAILED" ? 1 : 0;
    }

    console.log("Package Guard Repair\n");
    const tag = res.status === "OK" ? "[PASS]" : res.status === "SKIPPED" ? "[WARN]" : "[FAIL]";
    console.log(`${tag} ${res.description}`);
    return res.status === "FAILED" ? 1 : 0;
  }

  if (sub === "database") {
    const res = repairDatabase(db);
    await sendCliEvent("repair", {
      subcommand: "database",
      repairs: [res],
      completed: res.status === "OK" ? 1 : 0,
      failed: res.status === "FAILED" ? 1 : 0
    });

    if (isJson) {
      outputSuccess(res);
      return res.status === "FAILED" ? 1 : 0;
    }

    console.log("Package Guard Repair\n");
    const tag = res.status === "OK" ? "[PASS]" : "[FAIL]";
    console.log(`${tag} ${res.description}`);
    return res.status === "FAILED" ? 1 : 0;
  }

  if (sub === "config") {
    const res = repairConfig(db, projectDir);
    await sendCliEvent("repair", {
      projectId: project?.id,
      projectName: project?.name,
      subcommand: "config",
      repairs: [res],
      completed: res.status === "OK" ? 1 : 0,
      failed: res.status === "FAILED" ? 1 : 0
    }, project?.id);

    if (isJson) {
      outputSuccess(res);
      return res.status === "FAILED" ? 1 : 0;
    }

    console.log("Package Guard Repair\n");
    const tag = res.status === "OK" ? "[PASS]" : "[FAIL]";
    console.log(`${tag} ${res.description}`);
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

  if (isJson) {
    outputSuccess(report);
    return report.failed === 0 ? 0 : 1;
  }

  console.log("Package Guard Repair\n");
  for (const r of report.repairs) {
    const tag = r.status === "OK" ? "[PASS]" : r.status === "SKIPPED" ? "[WARN]" : "[FAIL]";
    console.log(`${tag} ${r.description}`);
  }

  console.log(`\nRepairs completed: ${report.completed} (failed: ${report.failed})`);
  return report.failed === 0 ? 0 : 1;
}
