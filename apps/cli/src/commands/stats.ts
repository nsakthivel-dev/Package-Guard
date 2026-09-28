import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { getPackageStats } from "../services/package-service";
import { sendCliEvent } from "../pipe-client";

export async function executeStats(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    return 3;
  }

  const stats = await getPackageStats(projectDir);

  await sendCliEvent("stats", {
    projectId: project.id,
    projectName: project.name,
    stats
  }, project.id);

  console.log(`Package Statistics — ${project.name}\n`);
  console.log(`Total Packages:       ${stats.total}`);
  console.log(`Direct Dependencies:  ${stats.direct}`);
  console.log(`Dev Dependencies:     ${stats.dev}`);
  if (stats.optional > 0) {
    console.log(`Optional Dependencies:${stats.optional}`);
  }
  if (stats.peer > 0) {
    console.log(`Peer Dependencies:    ${stats.peer}`);
  }
  if (stats.transitive > 0) {
    console.log(`Transitive Packages:  ${stats.transitive}`);
  }
  if (stats.python > 0) {
    console.log(`Python Packages:      ${stats.python}`);
  }
  console.log(`Installed:            ${stats.installed}`);
  console.log(`Missing from disk:    ${stats.missing}`);
  console.log(`Outdated Packages:    ${stats.outdatedCount}`);
  console.log(`Major Updates:        ${stats.majorUpdates}\n`);

  return 0;
}
