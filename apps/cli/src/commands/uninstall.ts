import type BetterSqlite3 from "better-sqlite3";
import { uninstallCliShim, getSystemPaths } from "../services/system-service";

export async function executeUninstall(
  _db: BetterSqlite3.Database,
  _targetDir: string,
  _args: string[]
): Promise<number> {
  console.log("Uninstalling Package Guard CLI executable shim...\n");

  const paths = getSystemPaths();
  const res = uninstallCliShim();

  if (res.uninstalledPaths.length > 0) {
    console.log("[PASS] Removed application executable shims:");
    for (const p of res.uninstalledPaths) {
      console.log(`  - ${p}`);
    }
  } else {
    console.log("[INFO] No active CLI shims found in Microsoft\\WindowsApps or bin.");
  }

  console.log("\n[SAFETY NOTICE]");
  console.log("User data, SQLite database, snapshots, and configurations were PRESERVED:");
  console.log(`  - Database:  ${paths.database}`);
  console.log(`  - Snapshots: ${paths.snapshots}`);
  console.log(`  - Config:    ${paths.config}`);
  console.log("\nCLI binary uninstallation complete.");

  return 0;
}
