export const PIPE_NAME = "\\\\.\\pipe\\PackageGuardian";
export const LEGACY_PIPE_NAME = "\\\\.\\pipe\\PackageGuard";
export const PROTOCOL_VERSION = 1;

export type RequestId = string;
export type MessageType = "PING" | "CLI_EVENT";
export type ResponseType = "PONG" | "ACK";

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface PingRequest {
  id: RequestId;
  type: "PING";
  payload: {
    message: string;
  };
}

export interface CliEventRequest {
  id: RequestId;
  type: "CLI_EVENT";
  command: string;
  projectId?: string;
  timestamp: string;
  status?: "PENDING" | "SYNCED" | "FAILED";
  payload: unknown;
}

export type PackageGuardianRequest = PingRequest | CliEventRequest;
export type PackageGuardRequest = PackageGuardianRequest;

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface PongResponse {
  id: RequestId;
  type: "PONG";
  payload: {
    message: string;
  };
}

/**
 * ACK is sent by Electron after it has persisted the event as SYNCED.
 * The CLI waits for this before marking its own DB record SYNCED.
 */
export interface AckResponse {
  id: RequestId;
  type: "ACK";
  payload: {
    synced: boolean;
  };
}

export type PackageGuardianResponse = PongResponse | AckResponse;
export type PackageGuardResponse = PackageGuardianResponse;

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

export function isPackageGuardianRequest(value: unknown): value is PackageGuardianRequest {
  if (!isRecord(value)) return false;
  if (typeof value["id"] !== "string" || (value["id"] as string).length === 0) return false;

  if (value["type"] === "PING") {
    return (
      isRecord(value["payload"]) &&
      typeof (value["payload"] as Record<string, unknown>)["message"] === "string"
    );
  }

  if (value["type"] === "CLI_EVENT") {
    return (
      typeof value["command"] === "string" &&
      typeof value["timestamp"] === "string" &&
      value["payload"] !== undefined
    );
  }

  return false;
}

export const isPackageGuardRequest = isPackageGuardianRequest;

export function isPackageGuardianResponse(value: unknown): value is PackageGuardianResponse {
  if (!isRecord(value)) return false;
  if (typeof value["id"] !== "string" || (value["id"] as string).length === 0) return false;

  if (value["type"] === "PONG") {
    return (
      isRecord(value["payload"]) &&
      typeof (value["payload"] as Record<string, unknown>)["message"] === "string"
    );
  }

  if (value["type"] === "ACK") {
    return (
      isRecord(value["payload"]) &&
      typeof (value["payload"] as Record<string, unknown>)["synced"] === "boolean"
    );
  }

  return false;
}

export const isPackageGuardResponse = isPackageGuardianResponse;

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

export function encodeMessage(
  message: PackageGuardianRequest | PackageGuardianResponse
): string {
  return `${JSON.stringify(message)}\n`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
