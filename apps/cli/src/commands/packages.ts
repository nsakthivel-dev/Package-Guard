import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getProjectPackages } from "../services/package-service";
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
    "Version".padEnd(16, " ") +
    "Type".padEnd(18, " ") +
    "Source".padEnd(10, " ") +
    "Status"
  );
  console.log("--------------------------------------------------------------------------------");

  for (const p of packages) {
    const nameStr = p.name.slice(0, 26).padEnd(28, " ");
    const verStr = p.version.slice(0, 14).padEnd(16, " ");
    const typeStr = p.type.slice(0, 16).padEnd(18, " ");
    const srcStr = p.source.slice(0, 8).padEnd(10, " ");
    const statusStr = p.status;
    console.log(`${nameStr}${verStr}${typeStr}${srcStr}${statusStr}`);
  }

  return 0;
}
