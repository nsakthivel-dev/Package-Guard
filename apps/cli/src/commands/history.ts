import type BetterSqlite3 from "better-sqlite3";
import { findProject } from "../services/project-service";
import { listHistory, clearHistory } from "@package-guard/shared/repository";

const ALLOWED_EVENTS = new Set(["UPDATE", "INIT", "REMOVE", "INSTALL", "UNINSTALL", "RESTORE"]);

export async function executeHistory(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[]
): Promise<number> {
  const isClear = args.includes("clear");
  const isToday = args.includes("--today");
  const isProjectOnly = args.includes("--project");

  const { project } = findProject(db, targetDir);

  if (isClear) {
    const cleared = clearHistory(db, isProjectOnly ? project?.id : undefined);
    console.log(`History cleared (${cleared} records removed).\n`);
    return 0;
  }

  const projectId = isProjectOnly && project ? project.id : undefined;
  const rawHistory = listHistory(db, {
    projectId,
    todayOnly: isToday,
    limit: 100
  });

  // Only show version updates, failed updates, project install/remove, and package install/remove
  const history = rawHistory.filter((h) => ALLOWED_EVENTS.has(h.event_type));

  if (history.length === 0) {
    console.log("No update or install/remove history records found.\n");
    return 0;
  }

  console.log(`Activity History (${history.length} records)${isToday ? " [Today]" : ""}${isProjectOnly && project ? ` [${project.name}]` : ""}:\n`);
  console.log("Timestamp".padEnd(26, " ") + "Event".padEnd(14, " ") + "Description");
  console.log("─".repeat(80));

  for (const h of history) {
    const timeStr = new Date(h.created_at).toLocaleString().padEnd(26, " ");
    const typeStr = h.event_type.padEnd(14, " ");
    console.log(`${timeStr}${typeStr}${h.description}`);
  }
  console.log();

  return 0;
}
