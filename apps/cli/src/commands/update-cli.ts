import type BetterSqlite3 from "better-sqlite3";
import { installCliShim } from "../services/system-service";

export async function executeUpdateCli(
  _db: BetterSqlite3.Database,
  _targetDir: string,
  _args: string[]
): Promise<number> {
  console.log("Updating Package Guard CLI shim and environment paths...\n");

  try {
    const res = installCliShim();
    console.log(`[PASS] CLI link updated: ${res.installedAt}`);
    console.log("Package Guard CLI is running the latest build.");
    return 0;
  } catch (err) {
    console.error(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
