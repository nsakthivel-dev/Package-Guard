import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized, untrackProject } from "../services/project-service";
import { sendCliEvent } from "../pipe-client";

export async function executeRemove(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Current directory is not tracked by Package Guard.\n");
    return 3;
  }

  const projectName = project.name;
  const projectId = project.id;

  // Untrack from SQLite tracking without touching the actual project files on disk
  untrackProject(db, project);

  await sendCliEvent("remove", {
    projectId,
    projectName,
    projectPath: project.path,
    status: "UNTRACKED"
  }, projectId);

  console.log(`Successfully untracked project '${projectName}'.`);
  console.log(`Path: ${project.path}`);
  console.log("Note: Project files on disk remain untouched.\n");

  return 0;
}
