import type BetterSqlite3 from "better-sqlite3";
import { findProject, isInitialized } from "../services/project-service";
import {
  getLatestScanForProject,
  listSnapshotsForProject
} from "@package-guard/shared/repository";
import { runDoctor } from "../services/doctor-service";
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

export async function executeStatus(
  db: BetterSqlite3.Database,
  targetDir: string,
  _args: string[]
): Promise<number> {
  const { project, projectDir } = findProject(db, targetDir);

  if (!project || !isInitialized(projectDir, project)) {
    console.error("Error: Package Guard has not been initialized in this directory.\n");
    console.error("Run:\n\n  pg init\n");
    return 3;
  }

  const latestScan = getLatestScanForProject(db, project.id);
  const snapshots = listSnapshotsForProject(db, project.id);
  const latestSnapshot = snapshots[0];
  const doctor = await runDoctor(db, projectDir, project.id);
  const health = doctor.overall === "OK" ? "GOOD" : "ATTENTION NEEDED";

  const changesCount = latestScan ? latestScan.changes_detected : 0;

  await sendCliEvent("status", {
    projectId: project.id,
    projectName: project.name,
    initialized: true,
    lastScan: latestScan ? latestScan.created_at : null,
    lastSnapshot: latestSnapshot ? latestSnapshot.created_at : null,
    changes: changesCount,
    snapshots: snapshots.length,
    health
  }, project.id);

  console.log("Package Guard Status\n");
  console.log(`Project: ${project.name}`);
  console.log(`Path: ${project.path}`);
  console.log(`Initialized: YES`);
  console.log(`Last Scan: ${timeAgo(latestScan?.created_at)}`);
  console.log(`Last Snapshot: ${timeAgo(latestSnapshot?.created_at)}`);
  console.log(`Changes: ${changesCount}`);
  console.log(`Snapshots: ${snapshots.length}`);
  console.log(`Health: ${health}`);

  return 0;
}
