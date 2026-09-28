import type BetterSqlite3 from "better-sqlite3";
import { findProject } from "../services/project-service";
import { exportReport, exportPackages, exportHistoryRecords } from "../services/export-service";
import { sendCliEvent } from "../pipe-client";

export async function executeExport(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);
  const sub = (args[0] || "").toLowerCase();

  if (sub === "report") {
    if (!project) {
      console.error("Error: 'export report' requires an initialized project.");
      return 3;
    }
    const outIdx = args.indexOf("--out");
    const outPath = outIdx !== -1 ? args[outIdx + 1] : undefined;

    console.log("Generating full project audit report...");
    const savedPath = await exportReport(db, project, outPath);
    console.log(`Report successfully exported to: ${savedPath}`);

    await sendCliEvent("export", {
      type: "report",
      projectId: project.id,
      filePath: savedPath
    }, project.id);

    return 0;
  }

  if (sub === "packages") {
    if (!projectDir) {
      console.error("Error: 'export packages' requires an active project directory.");
      return 3;
    }

    let format: "json" | "csv" | "txt" = "json";
    if (args.includes("--csv") || args.includes("csv")) format = "csv";
    else if (args.includes("--txt") || args.includes("txt")) format = "txt";

    const outIdx = args.indexOf("--out");
    const outPath = outIdx !== -1 ? args[outIdx + 1] : undefined;

    const savedPath = exportPackages(projectDir, format, outPath);
    console.log(`Packages successfully exported (${format}) to: ${savedPath}`);

    await sendCliEvent("export", {
      type: "packages",
      format,
      projectId: project?.id,
      filePath: savedPath
    }, project?.id);

    return 0;
  }

  if (sub === "history") {
    const outIdx = args.indexOf("--out");
    const outPath = outIdx !== -1 ? args[outIdx + 1] : undefined;

    const savedPath = exportHistoryRecords(db, project?.id, outPath);
    console.log(`History successfully exported to: ${savedPath}`);

    await sendCliEvent("export", {
      type: "history",
      projectId: project?.id,
      filePath: savedPath
    }, project?.id);

    return 0;
  }

  console.log("Usage: pg export <report|packages|history> [--csv|--txt] [--out <path>]");
  return 2;
}
