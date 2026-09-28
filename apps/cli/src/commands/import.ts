import type BetterSqlite3 from "better-sqlite3";
import { findProject } from "../services/project-service";
import { importFile } from "../services/export-service";
import { sendCliEvent } from "../pipe-client";

export async function executeImport(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const filePath = args[0];
  if (!filePath) {
    console.error("Error: File path required. Usage: pg import <file>");
    return 2;
  }

  const { project } = findProject(db, targetDir);
  if (!project) {
    console.error("Error: 'pg import' requires an initialized project context.");
    return 3;
  }

  try {
    const res = importFile(db, project, filePath);
    console.log(res.message);

    await sendCliEvent("import", {
      projectId: project.id,
      filePath,
      type: res.type
    }, project.id);

    return 0;
  } catch (err) {
    console.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
