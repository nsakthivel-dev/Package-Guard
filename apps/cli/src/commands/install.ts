import type BetterSqlite3 from "better-sqlite3";
import { installCliShim } from "../services/system-service";

export async function executeInstall(
  _db: BetterSqlite3.Database,
  _targetDir: string,
  _args: string[]
): Promise<number> {
  console.log("Installing Package Guard CLI shim...\n");

  try {
    const res = installCliShim();
    console.log(`[PASS] ${res.message}`);
    console.log("You can now run 'pg' directly from any terminal or command prompt.");
    return 0;
  } catch (err) {
    console.error(`[FAIL] Installation failed: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
}
