import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getPackageDetails } from "../services/package-service";
import { listSecurityAdvisories } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

import { outputSuccess, outputError } from "../output";

export async function executePackage(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const cleanArgs = args.filter((a) => a !== "--json" && a !== "-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "package",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const packageName = cleanArgs[0];
  if (!packageName) {
    return outputError(
      "package",
      "ARGUMENT_REQUIRED",
      "Package name is required. Usage: pg package <name>",
      2,
      jsonMode
    );
  }

  const details = await getPackageDetails(projectDir, packageName);

  if (!details) {
    return outputError(
      "package",
      "PACKAGE_NOT_FOUND",
      `Package not found: '${packageName}'`,
      4,
      jsonMode
    );
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

  return outputSuccess(
    "package",
    {
      package: details,
      isDirect,
      advisories,
      updateAvailable: Boolean(details.latestVersion && details.latestVersion !== details.version)
    },
    jsonMode,
    () => {
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
    }
  );
}
