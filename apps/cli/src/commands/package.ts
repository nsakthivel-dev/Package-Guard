import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getPackageDetails } from "../services/package-service";
import { listSecurityAdvisories } from "@package-guard/shared/repository";
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
    console.error("Usage: pg package <name>\n");
    return 2;
  }

  const details = await getPackageDetails(projectDir, packageName);

  if (!details) {
    console.error(`Package not found: '${packageName}'\n`);
    return 4;
  }

  // Security advisories
  const advisories = listSecurityAdvisories(db, packageName);

  const isDirect = details.type === "dependency" || details.type === "devDependency" || details.type === "optionalDependency";
  const updateAvailable = details.latestVersion && details.latestVersion !== details.version
    ? `YES (${details.latestVersion} - ${details.updateType || "update"})`
    : "No (up to date)";

  await sendCliEvent("package_info", {
    projectId: project.id,
    projectName: project.name,
    package: details,
    advisories
  }, project.id);

  console.log(`Package Details: ${details.name}\n`);
  console.log(`Current Version:     ${details.version}`);
  console.log(`Declared Version:    ${details.declaredVersion || details.version}`);
  console.log(`Latest Version:      ${details.latestVersion || details.version}`);
  console.log(`Dependency Type:     ${isDirect ? `Direct (${details.type})` : `Indirect (${details.type})`}`);
  console.log(`Package Location:    ${details.location || "N/A"}`);
  console.log(`Update Available:    ${updateAvailable}`);
  console.log(`Security Advisories: ${advisories.length === 0 ? "None detected" : `${advisories.length} advisory found`}`);

  if (advisories.length > 0) {
    for (const a of advisories) {
      console.log(`  - [${a.severity}] ${a.title || "Vulnerability"} (fixed in: ${a.fixed_in || "N/A"})`);
    }
  }
  console.log();

  return 0;
}
