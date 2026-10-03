import type BetterSqlite3 from "better-sqlite3";
import { executeScan } from "./scan";

export async function executeRescan(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  // Pass --force to execute fresh scan
  return executeScan(db, targetDir, ["--force", ...args], isJson);
}
