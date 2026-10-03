import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { scanProject } from "../services/scanner-service";
import { sendCliEvent } from "../pipe-client";

import { outputSuccess, outputError } from "../output";

export async function executeChanges(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "changes",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const scan = await scanProject(db, project.id, projectDir, project.name);
  const changes = scan.changes;

  const added = changes.filter((c) => c.type === "ADDED");
  const modified = changes.filter((c) => c.type === "MODIFIED");
  const deleted = changes.filter((c) => c.type === "DELETED");

  await sendCliEvent("changes", {
    projectId: project.id,
    projectName: project.name,
    totalChanges: changes.length,
    added: added.map((c) => c.path),
    modified: modified.map((c) => c.path),
    deleted: deleted.map((c) => c.path)
  }, project.id);

  return outputSuccess(
    "changes",
    {
      projectId: project.id,
      projectName: project.name,
      totalChanges: changes.length,
      added: added.map((c) => ({ path: c.path, size: c.newSize, hash: c.newHash })),
      modified: modified.map((c) => ({ path: c.path, oldSize: c.oldSize, newSize: c.newSize, oldHash: c.oldHash, newHash: c.newHash })),
      deleted: deleted.map((c) => ({ path: c.path, size: c.oldSize, hash: c.oldHash })),
      raw: changes
    },
    jsonMode,
    () => {
      console.log(`Changes for ${project.name}:\n`);

      if (changes.length === 0) {
        console.log("No changes detected since last baseline/snapshot.\n");
        return;
      }

      for (const a of added) {
        console.log(`+ ${a.path} (added)`);
      }
      for (const m of modified) {
        console.log(`~ ${m.path} (modified)`);
      }
      for (const d of deleted) {
        console.log(`- ${d.path} (removed)`);
      }
      console.log();
    }
  );
}
