import * as fs from "node:fs";
import * as path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import { scanProject } from "../services/scanner-service";
import { insertScan, insertHistory } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

import { outputSuccess, outputError } from "../output";

export async function executeScan(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "scan",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const isDeep = args.includes("--deep");
  const isForce = args.includes("--force");
  const isWatch = args.includes("--watch");

  const runSingleScan = async (): Promise<number> => {
    const result = await scanProject(db, project.id, projectDir, project.name, {
      deep: isDeep,
      force: isForce
    });

    // Persist scan result to SQLite
    insertScan(db, {
      id: result.id,
      projectId: project.id,
      filesScanned: result.filesScanned,
      packagesDetected: result.packagesDetected,
      changesDetected: result.changesDetected,
      durationMs: result.durationMs,
      status: result.status,
      resultJson: JSON.stringify(result)
    });

    insertHistory(db, {
      projectId: project.id,
      eventType: "SCAN",
      description: `Scan (${isDeep ? "deep" : "standard"}): ${result.packagesDetected} packages, ${result.changesDetected} changes`,
      detailsJson: JSON.stringify({
        scanId: result.id,
        filesScanned: result.filesScanned,
        packagesDetected: result.packagesDetected,
        changesDetected: result.changesDetected,
        deep: isDeep,
        force: isForce
      })
    });

    // Emit event to Electron (LIVE or PENDING in SQLite)
    await sendCliEvent("scan", {
      scanId: result.id,
      projectId: project.id,
      projectName: project.name,
      projectPath: projectDir,
      filesScanned: result.filesScanned,
      packagesDetected: result.packagesDetected,
      changesDetected: result.changesDetected,
      durationMs: result.durationMs,
      status: result.status,
      changes: result.changes,
      packages: result.packages,
      deep: isDeep,
      force: isForce
    }, project.id);

    return outputSuccess(
      "scan",
      result,
      jsonMode,
      () => {
        console.log(`Scan completed${isDeep ? " (deep mode)" : ""}\n`);
        console.log(`Project:          ${project.name}`);
        console.log(`Files scanned:    ${result.filesScanned.toLocaleString()}`);
        console.log(`Packages detected:${result.packagesDetected.toLocaleString()}`);
        console.log(`Changes detected: ${result.changesDetected.toLocaleString()}`);
        console.log(`Duration:         ${(result.durationMs / 1000).toFixed(2)}s`);
        console.log(`Status:           ${result.status}\n`);
      }
    );
  };

  const code = await runSingleScan();

  if (isWatch) {
    console.log("[watch] Watching project dependency files for changes (Ctrl+C to exit)...");
    const watchCandidates = [
      path.join(projectDir, "package.json"),
      path.join(projectDir, "package-lock.json"),
      path.join(projectDir, "pnpm-lock.yaml"),
      path.join(projectDir, "yarn.lock"),
      path.join(projectDir, "requirements.txt")
    ].filter((f) => fs.existsSync(f));

    let timer: NodeJS.Timeout | null = null;
    const triggerDebouncedScan = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        console.log(`\n[watch] Detected change in project dependency files. Rescanning...`);
        try {
          await runSingleScan();
        } catch (err) {
          console.error("[watch] Scan failed:", err);
        }
      }, 600);
    };

    for (const f of watchCandidates) {
      try {
        fs.watch(f, triggerDebouncedScan);
      } catch {
        // ignore
      }
    }

    // Keep process alive for watch mode
    await new Promise<void>(() => {});
  }

  return code;
}
