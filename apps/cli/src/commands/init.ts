import type BetterSqlite3 from "better-sqlite3";
import { initializeProject, isInitialized } from "../services/project-service";
import { sendCliEvent } from "../pipe-client";

export async function executeInit(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const customName = args[0];

  const result = initializeProject(db, targetDir, customName);

  if (result.alreadyInitialized) {
    console.log("Package Guard is already initialized for this project.\n");
    console.log(`Project: ${result.project.name}`);
    console.log(`Path: ${result.project.path}`);
    console.log(`Status: READY`);
    return 0;
  }

  await sendCliEvent("init", {
    projectId: result.project.id,
    projectName: result.project.name,
    projectPath: result.project.path,
    status: "READY"
  }, result.project.id);

  console.log("Package Guard initialized\n");
  console.log(`Project: ${result.project.name}`);
  console.log(`Path: ${result.project.path}`);
  console.log(`Status: READY`);

  return 0;
}
