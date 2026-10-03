import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getProjectPackages, getOutdatedPackages } from "../services/package-service";
import { sendCliEvent } from "../pipe-client";

import { outputSuccess, outputError } from "../output";

export async function executePackages(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "packages",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const packages = getProjectPackages(projectDir);
  const outdated = await getOutdatedPackages(projectDir);
  const outdatedMap = new Map(outdated.map((o) => [o.name.toLowerCase(), o.latest]));

  await sendCliEvent("packages", {
    projectId: project.id,
    projectName: project.name,
    count: packages.length,
    packages
  }, project.id);

  const enrichedPackages = packages.map((p) => ({
    ...p,
    latest: outdatedMap.get(p.name.toLowerCase()) || p.version,
    isOutdated: outdatedMap.has(p.name.toLowerCase()) && outdatedMap.get(p.name.toLowerCase()) !== p.version
  }));

  return outputSuccess(
    "packages",
    {
      projectId: project.id,
      projectName: project.name,
      count: packages.length,
      packages: enrichedPackages
    },
    jsonMode,
    () => {
      console.log(`Packages for ${project.name} (${packages.length} detected):\n`);

      if (packages.length === 0) {
        console.log("No packages found.");
        return;
      }

      console.log(
        "Package".padEnd(28, " ") +
        "Installed".padEnd(14, " ") +
        "Latest".padEnd(14, " ") +
        "Type".padEnd(16, " ") +
        "Status"
      );
      console.log("─".repeat(80));

      for (const p of packages) {
        const nameStr = p.name.slice(0, 26).padEnd(28, " ");
        const verStr = p.version.slice(0, 12).padEnd(14, " ");
        const latestStr = (outdatedMap.get(p.name.toLowerCase()) || p.version).slice(0, 12).padEnd(14, " ");
        const typeStr = p.type.slice(0, 14).padEnd(16, " ");
        const statusStr = p.status;
        console.log(`${nameStr}${verStr}${latestStr}${typeStr}${statusStr}`);
      }
      console.log();
    }
  );
}
