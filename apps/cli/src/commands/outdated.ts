import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getOutdatedPackages } from "../services/package-service";
import { sendCliEvent } from "../pipe-client";

export async function executeOutdated(
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

  console.log("Checking for outdated packages...");
  const outdated = await getOutdatedPackages(projectDir);

  await sendCliEvent("outdated", {
    projectId: project.id,
    projectName: project.name,
    count: outdated.length,
    outdated
  }, project.id);

  console.log("");
  if (outdated.length === 0) {
    console.log("All checked packages are up to date.");
    return 0;
  }

  console.log(
    "Package".padEnd(25, " ") +
    "Current".padEnd(16, " ") +
    "Latest"
  );
  console.log("-------------------------------------------------------");

  for (const o of outdated) {
    const pkgStr = o.name.slice(0, 23).padEnd(25, " ");
    const curStr = o.current.slice(0, 14).padEnd(16, " ");
    console.log(`${pkgStr}${curStr}${o.latest}`);
  }

  return 0;
}
