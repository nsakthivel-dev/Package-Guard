import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { searchPackages } from "../services/package-service";

export async function executeSearch(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    return 3;
  }

  const query = args[0];
  if (!query) {
    console.error("Error: Search query required. Example: pg search react\n");
    return 2;
  }

  const matches = searchPackages(projectDir, query);

  console.log(`Search results for '${query}' (${matches.length} matches):\n`);
  if (matches.length === 0) {
    console.log("No matching packages found.\n");
    return 0;
  }

  console.log("Package".padEnd(30, " ") + "Version".padEnd(16, " ") + "Type".padEnd(18, " ") + "Status");
  console.log("─".repeat(70));
  for (const m of matches) {
    console.log(m.name.padEnd(30, " ") + m.version.padEnd(16, " ") + m.type.padEnd(18, " ") + m.status);
  }
  console.log();

  return 0;
}
