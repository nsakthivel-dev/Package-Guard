import type BetterSqlite3 from "better-sqlite3";
import { findProject } from "../services/project-service";
import { getSystemPaths } from "../services/system-service";

export async function executePath(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { projectDir } = findProject(db, targetDir);
  const paths = getSystemPaths(projectDir);

  console.log("Package Guard System Paths\n");
  console.log(`CLI Script:         ${paths.cliScript}`);
  console.log(`AppData Directory:  ${paths.appDataDirectory}`);
  console.log(`Database (SQLite):  ${paths.database}`);
  console.log(`Snapshot Storage:   ${paths.snapshots}`);
  console.log(`Logs Directory:     ${paths.logs}`);
  console.log(`Config Directory:   ${paths.config}`);
  console.log(`Project Directory:  ${paths.projectDirectory}`);

  return 0;
}
