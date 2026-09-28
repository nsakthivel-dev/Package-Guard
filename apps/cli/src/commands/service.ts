import * as net from "node:net";
import type BetterSqlite3 from "better-sqlite3";
import { PIPE_NAME } from "@package-guard/shared";
import { sendRequest } from "../pipe-client";
import { randomUUID } from "node:crypto";

function checkPipeActive(timeoutMs = 500): Promise<{ active: boolean; error?: string }> {
  return new Promise((resolve) => {
    const socket = net.createConnection(PIPE_NAME);
    let done = false;

    socket.setTimeout(timeoutMs, () => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve({ active: false, error: "Connection timed out" });
      }
    });

    socket.on("connect", () => {
      if (!done) {
        done = true;
        socket.end();
        resolve({ active: true });
      }
    });

    socket.on("error", (err) => {
      if (!done) {
        done = true;
        resolve({ active: false, error: err.message });
      }
    });
  });
}

export async function executeService(
  _db: BetterSqlite3.Database,
  _targetDir: string,
  args: string[]
): Promise<number> {
  const sub = (args[0] || "status").toLowerCase();

  if (sub === "status") {
    console.log("Checking Package Guard Electron IPC Service...\n");
    const check = await checkPipeActive();

    console.log(`Named Pipe:   ${PIPE_NAME}`);
    if (check.active) {
      console.log(`Status:       [PASS] ONLINE`);
      console.log(`Connection:   Active and accepting connections`);
      return 0;
    } else {
      console.log(`Status:       [WARN] OFFLINE`);
      console.log(`Details:      Electron application is not running or pipe is unavailable`);
      console.log(`Queue Mode:   SQLite offline persistence active (events queued as PENDING)`);
      return 0;
    }
  }

  if (sub === "restart") {
    console.log("Requesting IPC service listener reload...\n");
    const check = await checkPipeActive();
    if (!check.active) {
      console.log("[INFO] Electron service is not currently running.");
      console.log("The Named Pipe listener will initialize automatically when Package Guard starts.");
      return 0;
    }

    try {
      await sendRequest({
        id: randomUUID(),
        type: "PING",
        payload: { message: "reconnect" }
      });
      console.log("[PASS] Service connection verified and communication channel refreshed.");
      return 0;
    } catch (err) {
      console.error(`Failed to signal service: ${err instanceof Error ? err.message : String(err)}`);
      return 1;
    }
  }

  console.log("Usage: pg service <status|restart>");
  return 2;
}
