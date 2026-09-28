import type BetterSqlite3 from "better-sqlite3";
import { getPendingEvents, markSynced } from "@package-guard/shared/repository";
import { sendRequest } from "../pipe-client";

export async function executeSync(
  db: BetterSqlite3.Database,
  _targetDir: string,
  _args: string[]
): Promise<number> {
  console.log("Synchronizing offline queued events with Electron...\n");

  const pending = getPendingEvents(db);
  if (pending.length === 0) {
    console.log("No pending events to synchronize. Queue is clean.");
    return 0;
  }

  console.log(`Found ${pending.length} pending events. Dispatching...`);

  let syncedCount = 0;
  let failCount = 0;

  for (const ev of pending) {
    try {
      let parsedPayload: unknown = {};
      try {
        parsedPayload = ev.payload ? JSON.parse(ev.payload) : {};
      } catch {
        parsedPayload = { raw: ev.payload };
      }

      await sendRequest({
        id: ev.id,
        type: "CLI_EVENT",
        command: ev.type,
        timestamp: ev.created_at,
        payload: parsedPayload
      });

      markSynced(db, ev.id, "LIVE");
      syncedCount++;
    } catch {
      failCount++;
      // If one fails because Electron is offline, break early
      break;
    }
  }

  if (syncedCount > 0) {
    console.log(`Successfully synchronized ${syncedCount} events to Package Guard.`);
  }

  if (failCount > 0) {
    console.log(`[WARN] Electron became unreachable. ${pending.length - syncedCount} events remain in PENDING state.`);
    return 1;
  }

  console.log("All events successfully synchronized.");
  return 0;
}
