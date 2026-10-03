import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import {
  getLatestScanForProject,
  listSnapshotsForProject
} from "@package-guard/shared/repository";
import { runDoctor } from "../services/doctor-service";
import { getOutdatedPackages, getProjectPackages } from "../services/package-service";
import { verifyProject } from "../services/verify-service";
import { runSecurityAudit } from "../services/security-service";
import { sendCliEvent } from "../pipe-client";

function timeAgo(isoString: string | null | undefined): string {
  if (!isoString) return "Never";
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

import { outputSuccess, outputError } from "../output";

export async function executeStatus(
  db: BetterSqlite3.Database,
  targetDir: string,
  args: string[],
  isJson = false
): Promise<number> {
  const jsonMode = isJson || args.includes("--json") || args.includes("-j");
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    return outputError(
      "status",
      "PROJECT_NOT_INITIALIZED",
      "Package Guard has not been initialized in this directory. Run 'pg init'.",
      3,
      jsonMode
    );
  }

  const latestScan = getLatestScanForProject(db, project.id);
  const snapshots = listSnapshotsForProject(db, project.id);
  const latestSnapshot = snapshots[0];
  const pkgs = getProjectPackages(projectDir);
  const outdated = await getOutdatedPackages(projectDir);
  const verification = await verifyProject(db, project.id, projectDir);
  const security = await runSecurityAudit(db, project);
  const doctor = await runDoctor(db, projectDir, project.id);
  const health = doctor.overall === "OK" ? "GOOD" : "ATTENTION NEEDED";

  const changesCount = latestScan ? latestScan.changes_detected : 0;
  const pm = project.package_manager || project.packageManager || "npm";

  await sendCliEvent("status", {
    projectId: project.id,
    projectName: project.name,
    environment: pm,
    packageCount: pkgs.length,
    outdatedCount: outdated.length,
    changesCount,
    lastScan: latestScan ? latestScan.created_at : null,
    activeSnapshot: latestSnapshot ? latestSnapshot.id : null,
    securityStatus: security.status,
    verificationStatus: verification.status,
    health
  }, project.id);

  return outputSuccess(
    "status",
    {
      project: {
        id: project.id,
        name: project.name,
        path: project.path,
        packageManager: pm
      },
      packages: {
        total: pkgs.length,
        outdated: outdated.length
      },
      recentChanges: changesCount,
      lastScan: latestScan ? latestScan.created_at : null,
      activeSnapshot: latestSnapshot ? {
        id: latestSnapshot.id,
        name: latestSnapshot.name,
        createdAt: latestSnapshot.created_at
      } : null,
      security: {
        status: security.status,
        vulnerabilitiesCount: security.summary.total
      },
      verification: {
        status: verification.status
      },
      health
    },
    jsonMode,
    () => {
      console.log("Package Guard Status\n");
      console.log(`Project:             ${project.name}`);
      console.log(`Path:                ${project.path}`);
      console.log(`Environment:         ${pm}`);
      console.log(`Packages:            ${pkgs.length} (${outdated.length} outdated)`);
      console.log(`Recent Changes:      ${changesCount}`);
      console.log(`Last Scan:           ${timeAgo(latestScan?.created_at)}`);
      console.log(`Active Snapshot:     ${latestSnapshot ? `${latestSnapshot.name} (${latestSnapshot.id})` : "None"}`);
      console.log(`Security Status:     ${security.status === "OK" ? "SAFE (0 vulnerabilities)" : `${security.summary.total} vulnerabilities detected`}`);
      console.log(`Verification Status: ${verification.status}`);
      console.log(`Health:              ${health}\n`);
    }
  );
}
