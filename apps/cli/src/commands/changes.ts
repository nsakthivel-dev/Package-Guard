import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { scanProject } from "../services/scanner-service";
import { sendCliEvent } from "../pipe-client";

export async function executeChanges(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    console.error("Run:\n\n  pg init\n");
    return 3;
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

  console.log(`Changes for ${project.name}:\n`);

  if (changes.length === 0) {
    console.log("No changes detected since last baseline/snapshot.");
    return 0;
  }

  if (modified.length > 0) {
    console.log("Modified:");
    for (const m of modified) {
      console.log(`  ${m.path}`);
    }
    console.log("");
  }

  if (added.length > 0) {
    console.log("Added:");
    for (const a of added) {
      console.log(`  ${a.path}`);
    }
    console.log("");
  }

  if (deleted.length > 0) {
    console.log("Deleted:");
    for (const d of deleted) {
      console.log(`  ${d.path}`);
    }
    console.log("");
  }

  return 0;
}
