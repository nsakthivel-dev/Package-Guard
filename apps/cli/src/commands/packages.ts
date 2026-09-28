import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getProjectPackages, getOutdatedPackages } from "../services/package-service";
import { sendCliEvent } from "../pipe-client";

export async function executePackages(
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

  const packages = getProjectPackages(projectDir);
  const outdated = await getOutdatedPackages(projectDir);
  const outdatedMap = new Map(outdated.map((o) => [o.name.toLowerCase(), o.latest]));

  await sendCliEvent("packages", {
    projectId: project.id,
    projectName: project.name,
    count: packages.length,
    packages
  }, project.id);

  console.log(`Packages for ${project.name} (${packages.length} detected):\n`);

  if (packages.length === 0) {
    console.log("No packages found.");
    return 0;
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

  return 0;
}
