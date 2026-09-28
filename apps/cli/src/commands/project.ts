import type BetterSqlite3 from "better-sqlite3";
import {
  findProject,
  isInitialized,
  getAllProjects,
  renameCurrentProject,
  deleteProjectTrackingOnly
} from "../services/project-service";
import { setConfig, getConfig } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

export async function executeProject(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const sub = args[0]?.toLowerCase();
  const subArg = args[1];

  if (!sub || sub === "current") {
    const { project, projectDir } = findProject(db, targetDir);
    if (!project || !isInitialized(projectDir, project)) {
      console.log("No active Package Guard project in the current directory.");
      console.log("Run 'pg init' to initialize, or 'pg projects' to list tracked projects.\n");
      return 0;
    }

    console.log("Current Project\n");
    console.log(`ID:              ${project.id}`);
    console.log(`Name:            ${project.name}`);
    console.log(`Path:            ${project.path}`);
    console.log(`Package Manager: ${project.package_manager || project.packageManager || "npm"}`);
    console.log(`Status:          ${project.status}`);
    console.log(`Last Scan:       ${project.last_scan_at || "Never"}\n`);
    return 0;
  }

  if (sub === "switch") {
    if (!subArg) {
      console.error("Error: Project name or ID required. Example: pg project switch my-app\n");
      return 2;
    }

    const projects = getAllProjects(db);
    const target = projects.find(
      (p) => p.id.toLowerCase() === subArg.toLowerCase() || p.name.toLowerCase() === subArg.toLowerCase()
    );

    if (!target) {
      console.error(`Error: Project '${subArg}' not found. Run 'pg projects' to see available projects.\n`);
      return 3;
    }

    setConfig(db, "activeProjectId", target.id);

    await sendCliEvent("project:switch", {
      projectId: target.id,
      projectName: target.name,
      projectPath: target.path
    }, target.id);

    console.log(`Switched active project context to '${target.name}' (${target.id})`);
    console.log(`Path: ${target.path}\n`);
    return 0;
  }

  if (sub === "rename") {
    if (!subArg) {
      console.error("Error: New project name required. Example: pg project rename my-new-name\n");
      return 2;
    }

    const { project, projectDir } = findProject(db, targetDir);
    if (!project || !isInitialized(projectDir, project)) {
      console.error("Error: No active project in current directory to rename.\n");
      return 3;
    }

    const oldName = project.name;
    const success = renameCurrentProject(db, project, subArg);

    if (success) {
      await sendCliEvent("project:rename", {
        projectId: project.id,
        oldName,
        newName: subArg
      }, project.id);

      console.log(`Project successfully renamed from '${oldName}' to '${subArg}'.\n`);
      return 0;
    } else {
      console.error("Error: Failed to rename project in database.\n");
      return 1;
    }
  }

  if (sub === "delete") {
    if (!subArg) {
      console.error("Error: Project name or ID required to delete tracking. Example: pg project delete my-app\n");
      return 2;
    }

    const projects = getAllProjects(db);
    const target = projects.find(
      (p) => p.id.toLowerCase() === subArg.toLowerCase() || p.name.toLowerCase() === subArg.toLowerCase()
    );

    if (!target) {
      console.error(`Error: Project '${subArg}' not found.\n`);
      return 3;
    }

    // Safety: deletes tracking records from PackageGuard SQLite only; never deletes disk directory!
    deleteProjectTrackingOnly(db, target.id);

    await sendCliEvent("project:delete", {
      projectId: target.id,
      projectName: target.name,
      projectPath: target.path
    }, target.id);

    console.log(`Tracking information for project '${target.name}' deleted.`);
    console.log(`Path: ${target.path}`);
    console.log("Note: Actual project directory on disk has NOT been deleted.\n");
    return 0;
  }

  console.error(`Unknown project subcommand: '${sub}'\n`);
  console.error("Available subcommands:\n  pg project current\n  pg project switch <name>\n  pg project rename <name>\n  pg project delete <name>\n");
  return 2;
}
