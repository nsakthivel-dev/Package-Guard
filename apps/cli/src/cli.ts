#!/usr/bin/env node
import { openDatabase } from "@package-guard/shared/db";
import { executeInit } from "./commands/init";
import { executeRemove } from "./commands/remove";
import { executeProjects } from "./commands/projects";
import { executeProject } from "./commands/project";
import { executeScan } from "./commands/scan";
import { executeRescan } from "./commands/rescan";
import { executeStatus } from "./commands/status";
import { executePackages } from "./commands/packages";
import { executePackage } from "./commands/package";
import { executeSearch } from "./commands/search";
import { executeInfo } from "./commands/info";
import { executeTree } from "./commands/tree";
import { executeStats } from "./commands/stats";
import { executeChanges } from "./commands/changes";
import { executeDiff } from "./commands/diff";
import { executeCompare } from "./commands/compare";
import { executeOutdated } from "./commands/outdated";
import { executeUpdate } from "./commands/update";
import { executeUpgrade } from "./commands/upgrade";
import { executeRollback } from "./commands/rollback";
import { executeSnapshot } from "./commands/snapshot";
import { executeSnapshotList } from "./commands/snapshot-list";
import { executeSnapshotShow } from "./commands/snapshot-show";
import { executeSnapshotRestore } from "./commands/snapshot-restore";
import { executeSnapshotDelete } from "./commands/snapshot-delete";
import { executeSnapshotExport } from "./commands/snapshot-export";
import { executeSnapshotImport } from "./commands/snapshot-import";
import { executeHistory } from "./commands/history";
import { executeAudit } from "./commands/audit";
import { executeSecurity } from "./commands/security";
import { executeVulnerabilities } from "./commands/vulnerabilities";
import { executeFixSecurity } from "./commands/fix-security";
import { executeVerify } from "./commands/verify";
import { executeCheck } from "./commands/check";
import { executeIntegrity } from "./commands/integrity";
import { executeClean } from "./commands/clean";
import { executeDoctor } from "./commands/doctor";
import { executeRepair } from "./commands/repair";
import { executeConfig } from "./commands/config";
import { executeSettings } from "./commands/settings";
import { executeExport } from "./commands/export";
import { executeImport } from "./commands/import";
import { executeLogs } from "./commands/logs";
import { executePing } from "./commands/ping";
import { executeService } from "./commands/service";
import { executeSync } from "./commands/sync";
import { executeQueue } from "./commands/queue";
import { executeBackup } from "./commands/backup";
import { executeInstall } from "./commands/install";
import { executeUninstall } from "./commands/uninstall";
import { executeUpdateCli } from "./commands/update-cli";
import { executePath } from "./commands/path";
import { executeEnv } from "./commands/env";
import { executeVersion } from "./commands/version";
import { executeHelp } from "./commands/help";
import { executeAbout } from "./commands/about";
import { executeDocs } from "./commands/docs";
import { executeLicense } from "./commands/license";

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

  // Command-specific help flag, e.g. "pg scan --help"
  if (filteredArgs.includes("--help") || filteredArgs.includes("-h")) {
    process.exitCode = executeHelp([firstArg]);
    return;
  }

  // Information & documentation commands that don't need DB
  if (firstArg === "about") {
    process.exitCode = executeAbout();
    return;
  }
  if (firstArg === "docs") {
    process.exitCode = executeDocs();
    return;
  }
  if (firstArg === "license") {
    process.exitCode = executeLicense();
    return;
  }

  const subArgs = filteredArgs.slice(1);
  const db = openDatabase();

  try {
    switch (firstArg) {
      // --- Project Management ---
      case "init":
        process.exitCode = await executeInit(db, targetDir, subArgs);
        break;

      case "remove":
        process.exitCode = await executeRemove(db, targetDir, subArgs);
        break;

      case "projects":
        process.exitCode = await executeProjects(db, targetDir, subArgs);
        break;

      case "project":
        process.exitCode = await executeProject(db, targetDir, subArgs);
        break;

      // --- Scanning ---
      case "scan":
        process.exitCode = await executeScan(db, targetDir, subArgs);
        break;

      case "rescan":
        process.exitCode = await executeRescan(db, targetDir, subArgs);
        break;

      case "status":
        process.exitCode = await executeStatus(db, targetDir, subArgs);
        break;

      // --- Package Information ---
      case "packages":
        process.exitCode = await executePackages(db, targetDir, subArgs);
        break;

      case "package":
        process.exitCode = await executePackage(db, targetDir, subArgs);
        break;

      case "search":
        process.exitCode = await executeSearch(db, targetDir, subArgs);
        break;

      case "info":
        process.exitCode = await executeInfo(db, targetDir, subArgs);
        break;

      case "tree":
        process.exitCode = await executeTree(db, targetDir, subArgs);
        break;

      case "stats":
        process.exitCode = await executeStats(db, targetDir, subArgs);
        break;

      // --- Changes & Diffs ---
      case "changes":
        process.exitCode = await executeChanges(db, targetDir, subArgs);
        break;

      case "diff":
        process.exitCode = await executeDiff(db, targetDir, subArgs);
        break;

      case "compare":
        process.exitCode = await executeCompare(db, targetDir, subArgs);
        break;

      // --- Updates & Rollback ---
      case "outdated":
        process.exitCode = await executeOutdated(db, targetDir, subArgs);
        break;

      case "update":
        process.exitCode = await executeUpdate(db, targetDir, subArgs);
        break;

      case "upgrade":
        process.exitCode = await executeUpgrade(db, targetDir, subArgs);
        break;

      case "rollback":
        process.exitCode = await executeRollback(db, targetDir, subArgs);
        break;

      // --- Snapshots ---
      case "snapshot": {
        const sub = subArgs[0]?.toLowerCase();
        if (sub === "create") {
          process.exitCode = await executeSnapshot(db, targetDir, subArgs.slice(1));
        } else if (sub === "list") {
          process.exitCode = await executeSnapshotList(db, targetDir, subArgs.slice(1));
        } else if (sub === "show") {
          process.exitCode = await executeSnapshotShow(db, targetDir, subArgs.slice(1));
        } else if (sub === "restore") {
          process.exitCode = await executeSnapshotRestore(db, targetDir, subArgs.slice(1));
        } else if (sub === "delete") {
          process.exitCode = await executeSnapshotDelete(db, targetDir, subArgs.slice(1));
        } else if (sub === "export") {
          process.exitCode = await executeSnapshotExport(db, targetDir, subArgs.slice(1));
        } else if (sub === "import") {
          process.exitCode = await executeSnapshotImport(db, targetDir, subArgs.slice(1));
        } else {
          process.exitCode = await executeSnapshot(db, targetDir, subArgs);
        }
        break;
      }

      // --- History ---
      case "history":
        process.exitCode = await executeHistory(db, targetDir, subArgs);
        break;

      // --- Security ---
      case "audit":
        process.exitCode = await executeAudit(db, targetDir, subArgs);
        break;

      case "security":
        process.exitCode = await executeSecurity(db, targetDir, subArgs);
        break;

      case "vulnerabilities":
        process.exitCode = await executeVulnerabilities(db, targetDir, subArgs);
        break;

      case "fix-security":
        process.exitCode = await executeFixSecurity(db, targetDir, subArgs);
        break;

      // --- Verification ---
      case "verify":
        process.exitCode = await executeVerify(db, targetDir, subArgs);
        break;

      case "check":
        process.exitCode = await executeCheck(db, targetDir, subArgs);
        break;

      case "integrity":
        process.exitCode = await executeIntegrity(db, targetDir, subArgs);
        break;

      // --- Cleaning ---
      case "clean":
        process.exitCode = await executeClean(db, targetDir, subArgs);
        break;

      // --- Diagnostics & Repair ---
      case "doctor":
        process.exitCode = await executeDoctor(db, targetDir, subArgs);
        break;

      case "repair":
        process.exitCode = await executeRepair(db, targetDir, subArgs);
        break;

      // --- Configuration ---
      case "config":
        process.exitCode = await executeConfig(db, targetDir, subArgs);
        break;

      case "settings":
        process.exitCode = await executeSettings(db, targetDir, subArgs);
        break;

      // --- Export & Import ---
      case "export":
        process.exitCode = await executeExport(db, targetDir, subArgs);
        break;

      case "import":
        process.exitCode = await executeImport(db, targetDir, subArgs);
        break;

      // --- Logs ---
      case "logs":
        process.exitCode = await executeLogs(db, targetDir, subArgs);
        break;

      // --- Service & IPC ---
      case "ping":
        process.exitCode = await executePing(db);
        break;

      case "service":
        process.exitCode = await executeService(db, targetDir, subArgs);
        break;

      case "sync":
        process.exitCode = await executeSync(db, targetDir, subArgs);
        break;

      case "queue":
        process.exitCode = await executeQueue(db, targetDir, subArgs);
        break;

      // --- Backup & Restore ---
      case "backup":
        process.exitCode = await executeBackup(db, targetDir, subArgs);
        break;

      // --- System & Installation ---
      case "install":
        process.exitCode = await executeInstall(db, targetDir, subArgs);
        break;

      case "uninstall":
        process.exitCode = await executeUninstall(db, targetDir, subArgs);
        break;

      case "update-cli":
        process.exitCode = await executeUpdateCli(db, targetDir, subArgs);
        break;

      case "path":
        process.exitCode = await executePath(db, targetDir, subArgs);
        break;

      case "env":
        process.exitCode = await executeEnv(db, targetDir, subArgs);
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
