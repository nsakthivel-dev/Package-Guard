import type BetterSqlite3 from "better-sqlite3";
import { executeUpdate } from "./update";

export async function executeUpgrade(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  // pg upgrade updates all outdated packages
  return executeUpdate(db, targetDir, ["--all", ...args]);
}
