#!/usr/bin/env node
import { openDatabase } from "@package-guard/shared/db";
import { executeInit } from "./commands/init";
import { executeScan } from "./commands/scan";
import { executeStatus } from "./commands/status";
import { executeChanges } from "./commands/changes";
import { executeDiff } from "./commands/diff";
import { executeSnapshot } from "./commands/snapshot";
import { executeSnapshotList } from "./commands/snapshot-list";
import { executeSnapshotShow } from "./commands/snapshot-show";
import { executeSnapshotRestore } from "./commands/snapshot-restore";
import { executeSnapshotDelete } from "./commands/snapshot-delete";
import { executePackages } from "./commands/packages";
import { executePackage } from "./commands/package";
import { executeOutdated } from "./commands/outdated";
import { executeVerify } from "./commands/verify";
import { executeDoctor } from "./commands/doctor";
import { executeRepair } from "./commands/repair";
import { executeConfig } from "./commands/config";
import { executeVersion } from "./commands/version";
import { executeHelp } from "./commands/help";
import { executePing } from "./commands/ping";

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  // Extract flags like --project, -p
  let targetDir = process.cwd();
  const filteredArgs: string[] = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === "--project" || arg === "-p") {
      if (i + 1 < rawArgs.length) {
        targetDir = rawArgs[i + 1];
        i++; // skip next arg
      }
    } else if (arg.startsWith("--project=")) {
      targetDir = arg.split("=")[1];
    } else {
      filteredArgs.push(arg);
    }
  }

  const firstArg = filteredArgs[0]?.toLowerCase();

  // Version check
  if (firstArg === "--version" || firstArg === "-v" || firstArg === "version") {
    process.exitCode = executeVersion();
    return;
  }

  // Help check
  if (!firstArg || firstArg === "--help" || firstArg === "-h" || firstArg === "help") {
    process.exitCode = executeHelp(filteredArgs.slice(1));
    return;
  }

  // Command-specific help, e.g. "pg scan --help"
  if (filteredArgs.includes("--help") || filteredArgs.includes("-h")) {
    process.exitCode = executeHelp([firstArg]);
    return;
  }

  const subArgs = filteredArgs.slice(1);
  const db = openDatabase();

  try {
    switch (firstArg) {
      case "init":
        process.exitCode = await executeInit(db, targetDir, subArgs);
        break;

      case "scan":
        process.exitCode = await executeScan(db, targetDir, subArgs);
        break;

      case "status":
        process.exitCode = await executeStatus(db, targetDir, subArgs);
        break;

      case "changes":
        process.exitCode = await executeChanges(db, targetDir, subArgs);
        break;

      case "diff":
        process.exitCode = await executeDiff(db, targetDir, subArgs);
        break;

      case "snapshot": {
        const sub = subArgs[0]?.toLowerCase();
        if (sub === "list") {
          process.exitCode = await executeSnapshotList(db, targetDir, subArgs.slice(1));
        } else if (sub === "show") {
          process.exitCode = await executeSnapshotShow(db, targetDir, subArgs.slice(1));
        } else if (sub === "restore") {
          process.exitCode = await executeSnapshotRestore(db, targetDir, subArgs.slice(1));
        } else if (sub === "delete") {
          process.exitCode = await executeSnapshotDelete(db, targetDir, subArgs.slice(1));
        } else {
          process.exitCode = await executeSnapshot(db, targetDir, subArgs);
        }
        break;
      }

      case "packages":
        process.exitCode = await executePackages(db, targetDir, subArgs);
        break;

      case "package":
        process.exitCode = await executePackage(db, targetDir, subArgs);
        break;

      case "outdated":
        process.exitCode = await executeOutdated(db, targetDir, subArgs);
        break;

      case "verify":
        process.exitCode = await executeVerify(db, targetDir, subArgs);
        break;

      case "doctor":
        process.exitCode = await executeDoctor(db, targetDir, subArgs);
        break;

      case "repair":
        process.exitCode = await executeRepair(db, targetDir, subArgs);
        break;

      case "config":
        process.exitCode = await executeConfig(db, targetDir, subArgs);
        break;

      case "ping":
        process.exitCode = await executePing(db);
        break;

      default:
        console.error(`Unknown command: '${firstArg}'\n`);
        console.error("Run 'pg help' to see available commands.\n");
        process.exitCode = 2;
        break;
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

void main();
