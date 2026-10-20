import type BetterSqlite3 from "better-sqlite3";
import {
  findProject,
  isInitialized,
  getAllProjects,
  renameCurrentProject,
  deleteProjectTrackingOnly
} from "../services/project-service";
import { setConfig, getConfig } from "@package-guard/shared/repository";
import { validateProjectName } from "@package-guard/shared/utils";
import { sendCliEvent } from "../pipe-client";
import { outputSuccess, outputError } from "../output";

export async function executeProject(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson: boolean = false
): Promise<number> {
  const sub = args[0]?.toLowerCase();
  const subArg = args[1];

  if (!sub || sub === "current") {
    const { project, projectDir } = findProject(db, targetDir);
    if (!project || !isInitialized(projectDir, project)) {
      if (isJson) {
        outputSuccess(null);
      } else {
        console.log("No active Package Guard project in the current directory.");
        console.log("Run 'pg init' to initialize, or 'pg projects' to list tracked projects.\n");
      }
      return 0;
    }

    if (isJson) {
      outputSuccess({
        id: project.id,
        name: project.name,
        path: project.path,
        packageManager: project.package_manager || project.packageManager || "npm",
        status: project.status,
        lastScanAt: project.last_scan_at || null
      });
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
      if (isJson) {
        outputError("Project name or ID required. Example: pg project switch my-app", "INVALID_ARGUMENT");
      } else {
        console.error("Error: Project name or ID required. Example: pg project switch my-app\n");
      }
      return 2;
    }

    const projects = getAllProjects(db);
    const target = projects.find(
      (p) => p.id.toLowerCase() === subArg.toLowerCase() || p.name.toLowerCase() === subArg.toLowerCase()
    );

    if (!target) {
      if (isJson) {
        outputError(`Project '${subArg}' not found. Run 'pg projects' to see available projects.`, "NOT_FOUND");
      } else {
        console.error(`Error: Project '${subArg}' not found. Run 'pg projects' to see available projects.\n`);
      }
      return 3;
    }

    setConfig(db, "activeProjectId", target.id);

    await sendCliEvent("project:switch", {
      projectId: target.id,
      projectName: target.name,
      projectPath: target.path
    }, target.id);

    if (isJson) {
      outputSuccess({
        switchedTo: {
          id: target.id,
          name: target.name,
          path: target.path
        }
      });
      return 0;
    }

    console.log(`Switched active project context to '${target.name}' (${target.id})`);
    console.log(`Path: ${target.path}\n`);
    return 0;
  }

  if (sub === "rename") {
    let targetProject: any = null;
    let newNameInput = "";

    const allProjects = getAllProjects(db);

    if (args.length >= 3) {
      // Syntax: pg project rename <targetIdOrName> <newName>
      const targetArg = args[1];
      newNameInput = args[2];
      targetProject = allProjects.find(
        (p) => p.id.toLowerCase() === targetArg.toLowerCase() || p.name.toLowerCase() === targetArg.toLowerCase()
      );
      if (!targetProject) {
        if (isJson) {
          outputError(`Project '${targetArg}' not found. Run 'pg projects' to list available projects.`, "NOT_FOUND");
        } else {
          console.error(`Error: Project '${targetArg}' not found. Run 'pg projects' to list available projects.\n`);
        }
        return 3;
      }
    } else if (subArg) {
      // Syntax: pg project rename <newName> (targeting current directory project)
      newNameInput = subArg;
      const { project, projectDir } = findProject(db, targetDir);
      if (!project || !isInitialized(projectDir, project)) {
        if (isJson) {
          outputError("No active project in current directory to rename. Specify project: pg project rename <idOrName> <newName>", "NOT_INITIALIZED");
        } else {
          console.error("Error: No active project in current directory to rename. Specify project: pg project rename <idOrName> <newName>\n");
        }
        return 3;
      }
      targetProject = project;
    } else {
      if (isJson) {
        outputError("New project name required. Example: pg project rename my-new-name", "INVALID_ARGUMENT");
      } else {
        console.error("Error: New project name required. Example: pg project rename my-new-name\n");
      }
      return 2;
    }

    const validation = validateProjectName(newNameInput, targetProject.name, allProjects, targetProject.id);

    if (!validation.valid) {
      if (validation.isIdentical) {
        if (isJson) {
          outputSuccess({
            id: targetProject.id,
            oldName: targetProject.name,
            newName: targetProject.name,
            unchanged: true,
            message: "Project name is unchanged."
          });
        } else {
          console.log(`Project name is already '${targetProject.name}'. No changes made.\n`);
        }
        return 0;
      }

      if (isJson) {
        outputError(validation.error || "Invalid project name.", validation.isDuplicate ? "DUPLICATE_NAME" : "INVALID_ARGUMENT");
      } else {
        console.error(`Error: ${validation.error}\n`);
      }
      return 2;
    }

    const trimmedNewName = validation.name!;
    const oldName = targetProject.name;
    const success = renameCurrentProject(db, targetProject, trimmedNewName);

    if (success) {
      await sendCliEvent("project:rename", {
        projectId: targetProject.id,
        oldName,
        newName: trimmedNewName
      }, targetProject.id);

      if (isJson) {
        outputSuccess({ id: targetProject.id, oldName, newName: trimmedNewName });
        return 0;
      }

      console.log(`Project successfully renamed from '${oldName}' to '${trimmedNewName}'.\n`);
      return 0;
    } else {
      if (isJson) {
        outputError("Failed to rename project in database.", "DATABASE_ERROR");
      } else {
        console.error("Error: Failed to rename project in database.\n");
      }
      return 1;
    }
  }

  if (sub === "delete") {
    if (!subArg) {
      if (isJson) {
        outputError("Project name or ID required to delete tracking. Example: pg project delete my-app", "INVALID_ARGUMENT");
      } else {
        console.error("Error: Project name or ID required to delete tracking. Example: pg project delete my-app\n");
      }
      return 2;
    }

    const projects = getAllProjects(db);
    const target = projects.find(
      (p) => p.id.toLowerCase() === subArg.toLowerCase() || p.name.toLowerCase() === subArg.toLowerCase()
    );

    if (!target) {
      if (isJson) {
        outputError(`Project '${subArg}' not found.`, "NOT_FOUND");
      } else {
        console.error(`Error: Project '${subArg}' not found.\n`);
      }
      return 3;
    }

    deleteProjectTrackingOnly(db, target.id);

    await sendCliEvent("project:delete", {
      projectId: target.id,
      projectName: target.name,
      projectPath: target.path
    }, target.id);

    if (isJson) {
      outputSuccess({ deletedTracking: true, projectId: target.id, projectName: target.name, projectPath: target.path });
      return 0;
    }

    console.log(`Tracking information for project '${target.name}' deleted.`);
    console.log(`Path: ${target.path}`);
    console.log("Note: Actual project directory on disk has NOT been deleted.\n");
    return 0;
  }

  if (isJson) {
    outputError(`Unknown project subcommand: '${sub}'`, "INVALID_ARGUMENT");
  } else {
    console.error(`Unknown project subcommand: '${sub}'\n`);
    console.error("Available subcommands:\n  pg project current\n  pg project switch <name>\n  pg project rename <name>\n  pg project delete <name>\n");
  }
  return 2;
}
