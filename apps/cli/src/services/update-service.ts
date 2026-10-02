import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import type BetterSqlite3 from "better-sqlite3";
import type { Project, Snapshot, ScanResult } from "@package-guard/shared/types";
import { insertHistory } from "@package-guard/shared/repository";
import { createSnapshot, restoreSnapshot, getLatestSafetySnapshot } from "./snapshot-service";
import { scanProject } from "./scanner-service";
import { verifyProject } from "./verify-service";
import { sendCliEvent } from "../pipe-client";
import { getOutdatedPackages, classifyUpdate, getPackageDetails } from "./package-service";
import { detectPackageManager } from "./project-service";

export interface UpdateOptions {
  safe?: boolean;
  major?: boolean;
  version?: string;
  onProgress?: (progress: {
    total: number;
    completed: number;
    successful: number;
    failed: number;
    currentPackage: string;
    percentage: number;
  }) => void;
}

export interface UpdateResult {
  success: boolean;
  package: string;
  targetVersion?: string;
  safetySnapshotId?: string;
  error?: string;
}

export async function runPackageManagerCommand(
  pm: string,
  args: string[],
  cwd: string
): Promise<{ success: boolean; stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    let cmd = pm;
    if (isWin && (pm === "npm" || pm === "pnpm" || pm === "yarn")) {
      cmd = `${pm}.cmd`;
    }

    const child = spawn(cmd, args, {
      cwd,
      shell: isWin,
      env: { ...process.env }
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stderr += d.toString(); });

    child.on("error", (err) => {
      resolve({ success: false, stdout, stderr: err.message, code: 1 });
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code: code ?? 1
      });
    });
  });
}

export async function updateSinglePackage(
  db: BetterSqlite3.Database,
  project: Project,
  packageName: string,
  options: UpdateOptions = {}
): Promise<UpdateResult> {
  // Step 1: Create Safety Snapshot
  const safetySnapName = `Safety Snapshot - Before updating ${packageName}`;
  let safetySnapshot: Snapshot;
  try {
    safetySnapshot = await createSnapshot(db, project.id, project.path, safetySnapName, "Automatic safety snapshot");
  } catch (err) {
    return {
      success: false,
      package: packageName,
      error: `Failed to create safety snapshot: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  // Step 2: Determine package manager, current version, and install argument
  const pm = project.packageManager || detectPackageManager(project.path);
  const currentDetails = await getPackageDetails(project.path, packageName);
  const fromVersion = currentDetails?.version || "current";
  const pkgArg = options.version ? `${packageName}@${options.version}` : packageName;
  let installArgs: string[];

  if (pm === "pnpm") {
    installArgs = ["add", pkgArg];
  } else if (pm === "yarn") {
    installArgs = ["add", pkgArg];
  } else if (pm === "bun") {
    installArgs = ["add", pkgArg];
  } else if (pm === "pip") {
    installArgs = ["install", "--upgrade", pkgArg];
  } else {
    // Default npm
    installArgs = ["install", pkgArg];
  }

  // Step 3: Run package update command
  const execResult = await runPackageManagerCommand(pm, installArgs, project.path);

  if (!execResult.success) {
    // Failure handling: preserve safety snapshot, record failure, notify electron
    insertHistory(db, {
      projectId: project.id,
      eventType: "UPDATE",
      description: `Failed to update ${packageName} (${fromVersion} → ${options.version || "latest"}): ${execResult.stderr.slice(0, 150)}`,
      detailsJson: JSON.stringify({
        package: packageName,
        projectName: project.name,
        ecosystem: pm === "pip" ? "pip" : "npm",
        fromVersion,
        toVersion: options.version || "latest",
        status: "FAILED",
        error: execResult.stderr,
        safetySnapshotId: safetySnapshot.id
      })
    });

    await sendCliEvent("update", {
      projectId: project.id,
      projectName: project.name,
      package: packageName,
      ecosystem: pm === "pip" ? "pip" : "npm",
      fromVersion,
      toVersion: options.version || "latest",
      status: "FAILED",
      error: execResult.stderr,
      safetySnapshotId: safetySnapshot.id
    }, project.id);

    return {
      success: false,
      package: packageName,
      safetySnapshotId: safetySnapshot.id,
      error: execResult.stderr || "Package manager command failed"
    };
  }

  // Step 4: Run scan
  let scanRes: ScanResult | undefined;
  try {
    scanRes = await scanProject(db, project.id, project.path, project.name);
  } catch {
    // non-fatal
  }

  // Step 5: Verify
  const verifyRes = await verifyProject(db, project.id, project.path);

  const newDetails = await getPackageDetails(project.path, packageName);
  const toVersion = newDetails?.version || options.version || "updated";

  // Step 6: Record history in SQLite
  insertHistory(db, {
    projectId: project.id,
    eventType: "UPDATE",
    description: `Updated package ${packageName} (${fromVersion} → ${toVersion})`,
    detailsJson: JSON.stringify({
      package: packageName,
      projectName: project.name,
      ecosystem: pm === "pip" ? "pip" : "npm",
      fromVersion,
      toVersion,
      status: "SUCCESS",
      safetySnapshotId: safetySnapshot.id,
      verification: verifyRes.status,
      scanId: scanRes?.id
    })
  });

  // Step 7: Notify Electron via Pipe
  await sendCliEvent("update", {
    projectId: project.id,
    projectName: project.name,
    package: packageName,
    ecosystem: pm === "pip" ? "pip" : "npm",
    fromVersion,
    toVersion,
    status: "SUCCESS",
    safetySnapshotId: safetySnapshot.id,
    verification: verifyRes.status
  }, project.id);

  return {
    success: true,
    package: packageName,
    safetySnapshotId: safetySnapshot.id
  };
}

export async function updateAllPackages(
  db: BetterSqlite3.Database,
  project: Project,
  options: UpdateOptions = {}
): Promise<{
  total: number;
  completed: number;
  successful: number;
  failed: number;
  results: UpdateResult[];
}> {
  const outdated = await getOutdatedPackages(project.path);
  let targets = outdated;

  if (options.safe) {
    targets = targets.filter((p) => p.bump === "patch" || p.bump === "minor");
  } else if (!options.major) {
    // By default, if major is not specified, update non-breaking
    targets = targets.filter((p) => p.bump !== "major");
  }

  const total = targets.length;
  if (total === 0) {
    return { total: 0, completed: 0, successful: 0, failed: 0, results: [] };
  }

  // Create single safety snapshot before batch update
  const safetySnapName = `Safety Snapshot - Before batch update of ${total} packages`;
  let safetySnap: Snapshot | undefined;
  try {
    safetySnap = await createSnapshot(db, project.id, project.path, safetySnapName, "Batch update safety snapshot");
  } catch {
    // continue
  }

  let completed = 0;
  let successful = 0;
  let failed = 0;
  const results: UpdateResult[] = [];

  for (const pkg of targets) {
    const res = await updateSinglePackage(db, project, pkg.name, {
      ...options,
      version: pkg.latest
    });

    completed++;
    if (res.success) successful++;
    else failed++;

    results.push(res);

    const percentage = Math.round((completed / total) * 100);

    if (options.onProgress) {
      options.onProgress({
        total,
        completed,
        successful,
        failed,
        currentPackage: pkg.name,
        percentage
      });
    }

    // Emit real progress event to Electron
    await sendCliEvent("update:progress", {
      projectId: project.id,
      total,
      completed,
      successful,
      failed,
      currentPackage: pkg.name,
      percentage
    }, project.id);
  }

  insertHistory(db, {
    projectId: project.id,
    eventType: "UPDATE",
    description: `Batch update completed: ${successful}/${total} successful`,
    detailsJson: JSON.stringify({ total, successful, failed, safetySnapshotId: safetySnap?.id })
  });

  return {
    total,
    completed,
    successful,
    failed,
    results
  };
}

export async function rollbackProject(
  db: BetterSqlite3.Database,
  project: Project,
  targetSnapshotId?: string
): Promise<{ success: boolean; snapshotId?: string; restoredFiles: number; error?: string }> {
  let targetId = targetSnapshotId;
  if (!targetId) {
    const safety = getLatestSafetySnapshot(db, project.id);
    if (!safety) {
      return { success: false, restoredFiles: 0, error: "No safety snapshot found to roll back to." };
    }
    targetId = safety.id;
  }

  // Pre-rollback Safety Snapshot
  await createSnapshot(db, project.id, project.path, `Safety Snapshot - Pre-rollback`, "Automatic pre-rollback backup");

  try {
    const res = await restoreSnapshot(db, targetId, project.path);

    // Scan & verify restored state
    await scanProject(db, project.id, project.path, project.name);
    await verifyProject(db, project.id, project.path);

    // Record history
    insertHistory(db, {
      projectId: project.id,
      eventType: "ROLLBACK",
      description: `Rolled back to snapshot ${targetId} (${res.restoredFiles} files restored)`,
      detailsJson: JSON.stringify({ snapshotId: targetId, restoredFiles: res.restoredFiles })
    });

    // Notify Electron
    await sendCliEvent("rollback", {
      projectId: project.id,
      snapshotId: targetId,
      restoredFiles: res.restoredFiles,
      status: "SUCCESS"
    }, project.id);

    return {
      success: true,
      snapshotId: targetId,
      restoredFiles: res.restoredFiles
    };
  } catch (err) {
    return {
      success: false,
      restoredFiles: 0,
      error: `Rollback failed: ${err instanceof Error ? err.message : String(err)}`
    };
  }
}
