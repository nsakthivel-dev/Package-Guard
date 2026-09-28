import type BetterSqlite3 from "better-sqlite3";
import { listQueue } from "@package-guard/shared/repository";

export async function executeQueue(
  db: BetterSqlite3.Database,
  _targetDir: string,
  _args: string[]
): Promise<number> {
  const events = listQueue(db);

  const pending = events.filter((e) => e.status === "PENDING").length;
  const synced = events.filter((e) => e.status === "SYNCED").length;
  const failed = events.filter((e) => e.status === "FAILED").length;

  console.log("Package Guard IPC Event Queue\n");
  console.log(`Total events recorded: ${events.length}`);
  console.log(`  Pending delivery:   ${pending}`);
  console.log(`  Synced / Delivered: ${synced}`);
  console.log(`  Failed:             ${failed}`);
  console.log("");

  if (events.length === 0) {
    console.log("Queue is empty.");
    return 0;
  }

  console.log("RECENT QUEUE ENTRIES:");
  console.log("ID       TYPE            STATUS    CREATED AT           DELIVERY");
  console.log("------------------------------------------------------------------");

  // Show latest 20 events
  const slice = events.slice(-20).reverse();
  for (const ev of slice) {
    const id = ev.id.slice(0, 7);
    const type = (ev.type || "").padEnd(15).slice(0, 15);
    const status = (ev.status || "").padEnd(9);
    const created = (ev.created_at || "").slice(0, 19).padEnd(20);
    const delivery = ev.delivery_type || "N/A";
    console.log(`${id}  ${type} ${status} ${created} ${delivery}`);
  }

  if (pending > 0) {
    console.log(`\nNote: ${pending} events pending. Run 'pg sync' to flush queue once Electron starts.`);
  }

  return 0;
}
