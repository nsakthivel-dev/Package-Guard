import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getSinglePackage } from "../services/package-service";
import { sendCliEvent } from "../pipe-client";

export async function executePackage(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    console.error("Run:\n\n  pg init\n");
    return 3;
  }

  const packageName = args[0];
  if (!packageName) {
    console.error("Error: Package name is required.");
    console.error("Usage: pg package <name>");
    return 2;
  }

  const pkg = getSinglePackage(projectDir, packageName);

  if (!pkg) {
    console.error(`Package not found: '${packageName}'`);
    return 4;
  }

  await sendCliEvent("package_info", {
    projectId: project.id,
    projectName: project.name,
    package: pkg
  }, project.id);

  console.log(`Package: ${pkg.name}`);
  console.log(`Version: ${pkg.version}`);
  console.log(`Type: ${pkg.type}`);
  console.log(`Source: ${pkg.source}`);
  console.log(`Status: ${pkg.status}`);

  return 0;
}
