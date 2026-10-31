import type BetterSqlite3 from "better-sqlite3";
import { initializeProject } from "../services/project-service";
import { scanProject } from "../services/scanner-service";
import { insertScan, insertHistory } from "@package-guard/shared/repository";
import { sendCliEvent } from "../pipe-client";

import { outputSuccess } from "../output";

export async function executeInit(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const cleanArgs = args.filter((a) => !a.startsWith("-"));
  const customName = cleanArgs[0];

  const result = initializeProject(db, targetDir, customName);

  if (result.alreadyInitialized) {
    return outputSuccess(
      "init",
      {
        project: {
          id: result.project.id,
          name: result.project.name,
          path: result.project.path,
          packageManager: result.packageManager || "npm"
        },
        alreadyInitialized: true,
        packageManager: result.packageManager || "npm",
        instructions: {
          packageGuardMd: true,
          agentsMd: true
        },
        status: "READY"
      },
      jsonMode,
      () => {
        console.log("Package Guardian is already initialized for this project.\n");
        console.log(`Project: ${result.project.name}`);
        console.log(`Path: ${result.project.path}`);
        console.log(`Package Manager: ${result.packageManager || "npm"}`);
        console.log(`Status: READY`);
        console.log(`AI Instructions: .packageguard/PACKAGEGUARD.md, AGENTS.md verified`);
      }
    );
  }

  // Perform initial scan
  let scanRes = null;
  try {
    scanRes = await scanProject(db, result.project.id, result.project.path, result.project.name);
    insertScan(db, {
      id: scanRes.id,
      projectId: result.project.id,
      filesScanned: scanRes.filesScanned,
      packagesDetected: scanRes.packagesDetected,
      changesDetected: scanRes.changesDetected,
      durationMs: scanRes.durationMs,
      status: scanRes.status,
      resultJson: JSON.stringify(scanRes)
    });
  } catch {
    // initial scan fallback
  }

  insertHistory(db, {
    projectId: result.project.id,
    eventType: "INIT",
    description: `Project initialized: ${result.project.name} (${result.packageManager})`,
    detailsJson: JSON.stringify({
      path: result.project.path,
      packageManager: result.packageManager,
      initialPackages: scanRes?.packagesDetected ?? 0
    })
  });

  await sendCliEvent("init", {
    projectId: result.project.id,
    projectName: result.project.name,
    projectPath: result.project.path,
    packageManager: result.packageManager,
    initialScan: scanRes ? {
      filesScanned: scanRes.filesScanned,
      packagesDetected: scanRes.packagesDetected
    } : null,
    status: "READY"
  }, result.project.id);

  return outputSuccess(
    "init",
    {
      project: {
        id: result.project.id,
        name: result.project.name,
        path: result.project.path,
        packageManager: result.packageManager
      },
      alreadyInitialized: false,
      packageManager: result.packageManager,
      packagesDetected: scanRes?.packagesDetected ?? 0,
      instructions: {
        packageGuardMd: true,
        agentsMd: true
      },
      status: "READY"
    },
    jsonMode,
    () => {
      console.log("Package Guardian initialized\n");
      console.log(`Project: ${result.project.name}`);
      console.log(`Path: ${result.project.path}`);
      console.log(`Package Manager: ${result.packageManager}`);
      if (scanRes) {
        console.log(`Packages Detected: ${scanRes.packagesDetected}`);
      }
      console.log(`Status: READY`);
      console.log(`AI Instructions: Created .packageguard/PACKAGEGUARD.md, AGENTS.md`);
    }
  );
}

