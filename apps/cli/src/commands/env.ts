import type BetterSqlite3 from "better-sqlite3";
import { getEnvironmentDetails } from "../services/system-service";

export async function executeEnv(
  _db: BetterSqlite3.Database,
  _targetDir: string,
  _args: string[]
): Promise<number> {
  const env = getEnvironmentDetails();

  console.log("Package Guard Environment\n");
  console.log(`OS:                 ${env.os}`);
  console.log(`Architecture:       ${env.arch}`);
  console.log(`Node.js Runtime:    ${env.nodeVersion}`);
  console.log(`AppData Root:       ${env.appDataRoot}`);
  console.log("\nDetected Package Managers:");

  for (const [tool, ver] of Object.entries(env.packageManagers)) {
    const status = ver ? `v${ver}` : "[NOT INSTALLED]";
    console.log(`  ${tool.padEnd(16)} ${status}`);
  }

  return 0;
}
