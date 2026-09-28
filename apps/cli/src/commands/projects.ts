import type BetterSqlite3 from "better-sqlite3";
import { getAllProjects } from "../services/project-service";

export async function executeProjects(
  db: BetterSqlite3.Database,
  _targetDir: string,
  _args: string[]
): Promise<number> {
  const projects = getAllProjects(db);

  if (projects.length === 0) {
    console.log("No projects currently tracked by Package Guard.\n");
    console.log("Run 'pg init' inside a project directory to register it.\n");
    return 0;
  }

  console.log(`Tracked Projects (${projects.length})\n`);
  console.log("ID".padEnd(16) + "Name".padEnd(24) + "Status".padEnd(10) + "Package Manager".padEnd(18) + "Path");
  console.log("─".repeat(80));

  for (const p of projects) {
    const pm = p.package_manager || p.packageManager || "npm";
    console.log(
      p.id.padEnd(16) +
      p.name.slice(0, 22).padEnd(24) +
      (p.status || "ACTIVE").padEnd(10) +
      pm.padEnd(18) +
      p.path
    );
  }
  console.log();

  return 0;
}
