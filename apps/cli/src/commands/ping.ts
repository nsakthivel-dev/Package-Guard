import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import { sendRequest, PipeClientError } from "../pipe-client";
import { insertEvent, markSynced } from "@package-guard/shared/repository";
import type { PackageGuardRequest } from "@package-guard/shared";
import { outputSuccess, outputError } from "../output";

export async function executePing(db: BetterSqlite3.Database, isJson: boolean = false): Promise<number> {
  const request: PackageGuardRequest = {
    id: randomUUID(),
    type: "PING",
    payload: { message: "Hello from CLI" }
  };

  try {
    insertEvent(db, request.id, request.type, request.payload);
    if (!isJson) {
      console.log("[CLI] Event saved to database (PENDING)");
    }
  } catch (dbError) {
    if (isJson) {
      outputError(dbError instanceof Error ? dbError.message : String(dbError), "DATABASE_ERROR");
    } else {
      console.error("[CLI] Failed to write to database:", dbError instanceof Error ? dbError.message : dbError);
    }
    return 1;
  }

  if (!isJson) {
    console.log("[CLI] Connecting to Package Guard");
  }
  try {
    const result = await sendRequest(request, false);

    if (result.ack.payload.synced) {
      markSynced(db, request.id, "LIVE");
    }

    if (isJson) {
      outputSuccess({
        connected: true,
        response: result.pong.payload.message,
        eventStatus: result.ack.payload.synced ? "SYNCED" : "PENDING"
      });
      return 0;
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
    if (isJson) {
      outputSuccess({
        connected: false,
        message: "Electron is not running. The event has been saved and will be synchronized when Package Guard starts.",
        eventStatus: "PENDING"
      });
      return 0;
    }

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
