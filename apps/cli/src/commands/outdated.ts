import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getOutdatedPackages } from "../services/package-service";
import { sendCliEvent } from "../pipe-client";

import { outputSuccess, outputError } from "../output";

export async function executeOutdated(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "outdated",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const outdated = await getOutdatedPackages(projectDir);

  await sendCliEvent("outdated", {
    projectId: project.id,
    projectName: project.name,
    count: outdated.length,
    outdated
  }, project.id);

  return outputSuccess(
    "outdated",
    {
      projectId: project.id,
      projectName: project.name,
      count: outdated.length,
      outdated
    },
    jsonMode,
    () => {
      console.log("Checking for outdated packages...\n");

      if (outdated.length === 0) {
        console.log("All checked packages are up to date.\n");
        return;
      }

      console.log(
        "Package".padEnd(28, " ") +
        "Current".padEnd(16, " ") +
        "Latest".padEnd(16, " ") +
        "Update Type"
      );
      console.log("─".repeat(70));

      for (const o of outdated) {
        const pkgStr = o.name.slice(0, 26).padEnd(28, " ");
        const curStr = o.current.slice(0, 14).padEnd(16, " ");
        const latStr = o.latest.slice(0, 14).padEnd(16, " ");
        const bumpStr = (o.bump || "update").toUpperCase();
        console.log(`${pkgStr}${curStr}${latStr}${bumpStr}`);
      }
      console.log();
    }
  );
}
