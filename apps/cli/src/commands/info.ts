import type BetterSqlite3 from "better-sqlite3";
import { executePackage } from "./package";

export async function executeInfo(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  return executePackage(db, targetDir, args);
}
