import type BetterSqlite3 from "better-sqlite3";
import { listConfig } from "@package-guard/shared/repository";
import { outputSuccess } from "../output";

export async function executeSettings(
  db: BetterSqlite3.Database,
  _targetDir: string,
  _args: string[],
  isJson: boolean = false
): Promise<number> {
  const all = listConfig(db);

  if (isJson) {
    outputSuccess({
      automationAndSafety: {
        autoScan: all.autoScan === "true",
        safeMode: all.safeMode === "true",
        cacheDurationHours: Number(all.cacheDurationHours || "6")
      },
      ipcAndDesktopIntegration: {
        notifyElectron: all.notifyElectron === "true",
        concurrencyLimit: Number(all.concurrencyLimit || "5")
      },
      diagnosticsAndTelemetry: {
        logLevel: all.logLevel || "info",
        telemetry: all.telemetry === "true"
      },
      allSettings: all
    });
    return 0;
  }

  console.log("Package Guard Settings Summary\n");

  console.log("1. Automation & Safety:");
  console.log(`   Automatic Background Scans:  ${all.autoScan === "true" ? "[ENABLED]" : "[DISABLED]"}`);
  console.log(`   Safe Update Enforcements:    ${all.safeMode === "true" ? "[ENABLED]" : "[DISABLED]"}`);
  console.log(`   Scan Cache Lifetime:         ${all.cacheDurationHours || "6"} hours`);

  console.log("\n2. IPC & Desktop Integration:");
  console.log(`   Electron Notifications:      ${all.notifyElectron === "true" ? "[ENABLED]" : "[DISABLED]"}`);
  console.log(`   Worker Concurrency Limit:    ${all.concurrencyLimit || "5"}`);

  console.log("\n3. Diagnostics & Telemetry:");
  console.log(`   Log Severity Threshold:      ${all.logLevel || "info"}`);
  console.log(`   Anonymous Telemetry:         ${all.telemetry === "true" ? "[ENABLED]" : "[DISABLED]"}`);

  const standardKeys = new Set([
    "autoScan",
    "safeMode",
    "cacheDurationHours",
    "notifyElectron",
    "concurrencyLimit",
    "logLevel",
    "telemetry"
  ]);

  const customKeys = Object.keys(all).filter((k) => !standardKeys.has(k));
  if (customKeys.length > 0) {
    console.log("\n4. Custom / Extension Settings:");
    for (const ck of customKeys) {
      console.log(`   ${ck}: ${all[ck]}`);
    }
  }

  console.log("\nUse 'pg config set <key> <value>' to modify settings.");
  return 0;
}
