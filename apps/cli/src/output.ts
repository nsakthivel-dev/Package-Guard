import type { CliCommandResult } from "@package-guard/shared/types";

export function outputSuccess<T>(data: T, meta?: CliCommandResult["meta"]): number;
export function outputSuccess<T>(
  command: string,
  data: T,
  isJson: boolean,
  humanPrinter?: () => void,
  meta?: CliCommandResult["meta"]
): number;
export function outputSuccess<T>(
  arg1: any,
  arg2?: any,
  arg3?: any,
  arg4?: any,
  arg5?: any
): number {
  // Check if called as: outputSuccess(command, data, isJson, humanPrinter?, meta?)
  if (typeof arg1 === "string" && typeof arg3 === "boolean") {
    const command = arg1;
    const data = arg2 as T;
    const isJson = arg3;
    const humanPrinter = arg4 as (() => void) | undefined;
    const meta = arg5 as CliCommandResult["meta"] | undefined;

    if (isJson) {
      const result: CliCommandResult<T> = {
        success: true,
        command,
        data,
        meta: {
          timestamp: new Date().toISOString(),
          ...meta
        }
      };
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else if (humanPrinter) {
      humanPrinter();
    }
    return 0;
  }

  // Otherwise called as: outputSuccess(data, meta?)
  const data = arg1 as T;
  const meta = arg2 as CliCommandResult["meta"] | undefined;
  const result: CliCommandResult<T> = {
    success: true,
    command: process.argv[2] || "pg",
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta
    }
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return 0;
}

export function outputError(
  message: string,
  code?: string,
  exitCode?: number,
  details?: unknown
): number;
export function outputError(
  command: string,
  code: string,
  message: string,
  exitCode: number,
  isJson: boolean,
  details?: unknown
): number;
export function outputError(
  arg1: any,
  arg2?: any,
  arg3?: any,
  arg4?: any,
  arg5?: any,
  arg6?: any
): number {
  // Check if called as: outputError(command, code, message, exitCode, isJson, details?)
  if (typeof arg4 === "number" && typeof arg5 === "boolean") {
    const command = arg1 as string;
    const code = arg2 as string;
    const message = arg3 as string;
    const exitCode = arg4;
    const isJson = arg5;
    const details = arg6;

    if (isJson) {
      const result: CliCommandResult = {
        success: false,
        command,
        error: {
          code,
          message,
          details
        },
        meta: {
          timestamp: new Date().toISOString()
        }
      };
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      process.stderr.write(`Error: ${message}\n`);
      if (details && typeof details === "string") {
        process.stderr.write(`${details}\n`);
      }
    }
    return exitCode;
  }

  // Otherwise called as: outputError(message, code?, exitCode?, details?)
  const message = arg1 as string;
  const code = (arg2 as string) || "ERROR";
  const exitCode = typeof arg3 === "number" ? arg3 : 1;
  const details = arg4;

  const result: CliCommandResult = {
    success: false,
    command: process.argv[2] || "pg",
    error: {
      code,
      message,
      details
    },
    meta: {
      timestamp: new Date().toISOString()
    }
  };
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return exitCode;
}
