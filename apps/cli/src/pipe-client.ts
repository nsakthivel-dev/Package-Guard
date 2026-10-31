import * as net from "node:net";
import {
  encodeMessage,
  isPackageGuardianResponse,
  PIPE_NAME,
  LEGACY_PIPE_NAME,
  type PackageGuardianRequest,
  type PackageGuardRequest,
  type PackageGuardianResponse,
  type PongResponse,
  type AckResponse
} from "@package-guard/shared";

const CONNECTION_TIMEOUT_MS = 5000;

export class PipeClientError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PipeClientError";
  }
}

export interface PipeResult {
  pong: PongResponse;
  ack: AckResponse;
}

/**
 * Send a request through the Named Pipe.
 * Resolves when both the PONG and the ACK have been received.
 * Rejects with PipeClientError for any connection/protocol failure.
 */
export async function sendRequest(
  request: PackageGuardianRequest,
  silent = false
): Promise<PipeResult> {
  return new Promise((resolve, reject) => {
    let socket: net.Socket;
    let triedLegacy = false;
    let buffer = "";
    let settled = false;
    let pong: PongResponse | undefined;
    let ack: AckResponse | undefined;

    const finish = (error?: Error, result?: PipeResult): void => {
      if (settled) return;
      settled = true;
      if (socket) {
        socket.setTimeout(0);
        socket.removeAllListeners();
      }

      if (error) {
        if (socket) socket.destroy();
        reject(error);
        return;
      }

      if (socket) {
        socket.end(() => {
          if (!silent) console.log("[CLI] Connection closed");
          resolve(result as PipeResult);
        });
      } else {
        resolve(result as PipeResult);
      }
    };

    function connectToPipe(pipePath: string) {
      socket = net.createConnection(pipePath);
      socket.setEncoding("utf8");
      socket.setTimeout(CONNECTION_TIMEOUT_MS, () => {
        finish(new PipeClientError("Connection timed out. Is Package Guardian running?"));
      });

      socket.on("connect", () => {
        if (!silent) console.log("[CLI] Connected to " + pipePath);
        socket.write(encodeMessage(request), () => {
          if (!silent) console.log("[CLI] Request sent");
        });
      });

      socket.on("data", (chunk: string) => {
        buffer += chunk;

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");

          if (!line) continue;

          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch {
            finish(new PipeClientError("Received malformed JSON from Electron."));
            return;
          }

          if (!isPackageGuardianResponse(parsed) || parsed.id !== request.id) {
            finish(new PipeClientError("Received an invalid response from Electron."));
            return;
          }

          if (parsed.type === "PONG") {
            pong = parsed as PongResponse;
            if (!silent) console.log("[CLI] PONG received");
          } else if (parsed.type === "ACK") {
            ack = parsed as AckResponse;
            if (!silent) console.log("[CLI] ACK received (synced=" + String(ack.payload.synced) + ")");
          }

          // Resolve only once we have both
          if (pong && ack) {
            finish(undefined, { pong, ack });
            return;
          }
        }
      });

      socket.on("error", (error: NodeJS.ErrnoException) => {
        if ((error.code === "ENOENT" || error.code === "ECONNREFUSED") && !triedLegacy) {
          triedLegacy = true;
          socket.destroy();
          connectToPipe(LEGACY_PIPE_NAME);
          return;
        }

        if (error.code === "ENOENT" || error.code === "ECONNREFUSED") {
          finish(new PipeClientError("Package Guardian is not running. Start the Electron app first."));
          return;
        }
        finish(new PipeClientError(`Connection failed: ${error.message}`));
      });

      socket.on("close", () => {
        if (!settled) finish(new PipeClientError("Connection closed before a response was received."));
      });
    }

    connectToPipe(PIPE_NAME);
  });
}

/**
 * Standard helper to record an event in SQLite (PENDING) and try sending to Electron via pipe.
 * Marks SYNCED if Electron ACKs.
 */
export async function sendCliEvent(
  command: string,
  payload: unknown,
  projectId?: string,
  silent = true
): Promise<{ eventId: string; synced: boolean }> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { randomUUID } = require("node:crypto");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { openDatabase } = require("@package-guard/shared/db");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { insertEvent, markSynced } = require("@package-guard/shared/repository");

  const eventId = randomUUID();
  const request: PackageGuardianRequest = {
    id: eventId,
    type: "CLI_EVENT",
    command,
    projectId,
    timestamp: new Date().toISOString(),
    payload
  } as any;

  const db = openDatabase();
  try {
    insertEvent(db, request.id, request.type, {
      command,
      projectId,
      timestamp: (request as any).timestamp,
      payload
    });
  } catch (err) {
    console.error("[CLI] DB error recording event:", err);
  }

  let synced = false;
  try {
    const result = await sendRequest(request, silent);
    if (result.ack.payload.synced) {
      markSynced(db, request.id, "LIVE");
      synced = true;
    }
  } catch {
    // Pipe offline -> remains PENDING
    synced = false;
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }

  return { eventId, synced };
}
