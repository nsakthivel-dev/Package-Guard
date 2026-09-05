import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { sendRequest, PipeClientError } from "../pipe-client";
import { insertEvent, markSynced } from "@package-guard/shared/repository";
import type { PackageGuardRequest } from "@package-guard/shared";

export async function executePing(db: BetterSqlite3.Database): Promise<number> {
  const request: PackageGuardRequest = {
    id: randomUUID(),
    type: "PING",
    payload: { message: "Hello from CLI" }
  };

  try {
    insertEvent(db, request.id, request.type, request.payload);
    console.log("[CLI] Event saved to database (PENDING)");
  } catch (dbError) {
    console.error("[CLI] Failed to write to database:", dbError instanceof Error ? dbError.message : dbError);
    return 1;
  }

  console.log("[CLI] Connecting to Package Guard");
  try {
    const result = await sendRequest(request, false);

    if (result.ack.payload.synced) {
      markSynced(db, request.id, "LIVE");
    }

    console.log("");
    console.log("Connected to Package Guard.");
    console.log("");
    console.log("Message sent successfully.");
    console.log("");
    console.log(`Response: ${result.pong.payload.message}`);
    console.log("");
    console.log("Communication successful.");
    console.log(`Event status: ${result.ack.payload.synced ? "SYNCED" : "PENDING"}`);
    return 0;
  } catch (error) {
    if (error instanceof PipeClientError) {
      console.log("");
      console.log("Electron is not running.");
      console.log("The event has been saved and will be synchronized when Package Guard starts.");
    } else {
      console.error("");
      console.error(error instanceof Error ? error.message : "Communication failed.");
    }
    console.log("Event status: PENDING");
    return 0;
  }
}
