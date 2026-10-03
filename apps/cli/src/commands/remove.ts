import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized, untrackProject } from "../services/project-service";
import { sendCliEvent } from "../pipe-client";
import { insertHistory } from "@package-guard/shared/repository";
import { outputSuccess, outputError } from "../output";

export async function executeRemove(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[],
  isJson: boolean = false
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    if (isJson) {
      outputError("Current directory is not tracked by Package Guard.", "NOT_INITIALIZED");
    } else {
      console.error("Error: Current directory is not tracked by Package Guard.\n");
    }
    return 3;
  }

  const projectName = project.name;
  const projectId = project.id;
  const pm = project.packageManager || "npm";

  // Untrack from SQLite tracking without touching the actual project files on disk
  untrackProject(db, project);

  // Record removal in history (with projectId: null so it survives project deletion)
  insertHistory(db, {
    projectId: null,
    eventType: "REMOVE",
    description: `Project removed: ${projectName}`,
    detailsJson: JSON.stringify({
      projectName,
      projectPath: project.path,
      packageManager: pm,
      status: "UNTRACKED"
    })
  });

  await sendCliEvent("remove", {
    projectId,
    projectName,
    projectPath: project.path,
    packageManager: pm,
    status: "UNTRACKED"
  }, projectId);

  if (isJson) {
    outputSuccess({
      untracked: true,
      projectId,
      projectName,
      projectPath: project.path
    });
    return 0;
  }

  console.log(`Successfully untracked project '${projectName}'.`);
  console.log(`Path: ${project.path}`);
  console.log("Note: Project files on disk remain untouched.\n");

  return 0;
}
