import * as fs from "node:fs";
import * as path from "node:path";
import type BetterSqlite3 from "better-sqlite3";
import type { Project } from "@package-guard/shared/types";
import {
  listSnapshotsForProject,
  getLatestScanForProject,
  listHistory
} from "@package-guard/shared/repository";
import { getProjectPackages, getOutdatedPackages } from "./package-service";
import { runSecurityAudit } from "./security-service";
import { verifyProject } from "./verify-service";
import { importSnapshot } from "./snapshot-service";

export async function exportReport(
  db: BetterSqlite3.Database,
  project: Project,
  outputPath?: string
): Promise<string> {
  const pkgs = getProjectPackages(project.path);
  const outdated = await getOutdatedPackages(project.path);
  const latestScan = getLatestScanForProject(db, project.id);
  const snapshots = listSnapshotsForProject(db, project.id);
  const security = await runSecurityAudit(db, project);
  const verify = await verifyProject(db, project.id, project.path);
  const history = listHistory(db, { projectId: project.id, limit: 50 });

  const report = {
    title: `PackageGuard Report — ${project.name}`,
    generatedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      path: project.path,
      packageManager: project.package_manager || "unknown",
      status: project.status
    },
    packages: {
      total: pkgs.length,
      outdated: outdated.length,
      items: pkgs
    },
    outdated: outdated.map((o) => ({
      name: o.name,
      current: o.current,
      latest: o.latest,
      bump: o.bump
    })),
    lastScan: latestScan ? {
      id: latestScan.id,
      filesScanned: latestScan.files_scanned,
      packagesDetected: latestScan.packages_detected,
      changesDetected: latestScan.changes_detected,
      createdAt: latestScan.created_at
    } : null,
    snapshots: snapshots.map((s) => ({
      id: s.id,
      name: s.name,
      packageCount: s.package_count,
      createdAt: s.created_at
    })),
    security: {
      status: security.status,
      summary: security.summary,
      vulnerabilitiesCount: security.vulnerabilities.length
    },
    verification: {
      status: verify.status,
      filesChecked: verify.filesChecked,
      valid: verify.valid,
      changed: verify.changed,
      missing: verify.missing
    },
    history: history.map((h) => ({
      eventType: h.event_type,
      description: h.description,
      createdAt: h.created_at
    }))
  };

  const finalPath = outputPath || path.join(process.cwd(), `packageguard-report-${project.id}.json`);
  fs.writeFileSync(finalPath, JSON.stringify(report, null, 2), "utf8");
  return finalPath;
}

export function exportPackages(
  projectDir: string,
  format: "json" | "csv" | "txt",
  outputPath?: string
): string {
  const pkgs = getProjectPackages(projectDir);
  let content = "";
  const ext = format === "csv" ? "csv" : format === "txt" ? "txt" : "json";
  const finalPath = outputPath || path.join(process.cwd(), `packages-export.${ext}`);

  if (format === "json") {
    content = JSON.stringify(pkgs, null, 2);
  } else if (format === "csv") {
    content = "Name,Version,Type,Source,Status\n" +
      pkgs.map((p) => `"${p.name}","${p.version}","${p.type}","${p.source}","${p.status}"`).join("\n");
  } else {
    // txt: requirements/dependencies list format
    content = pkgs.map((p) => `${p.name}@${p.version}`).join("\n");
  }

  fs.writeFileSync(finalPath, content, "utf8");
  return finalPath;
}

export function exportHistoryRecords(
  db: BetterSqlite3.Database,
  projectId?: string,
  outputPath?: string
): string {
  const history = listHistory(db, { projectId, limit: 1000 });
  const finalPath = outputPath || path.join(process.cwd(), `history-export.json`);
  fs.writeFileSync(finalPath, JSON.stringify(history, null, 2), "utf8");
  return finalPath;
}

export function importFile(
  db: BetterSqlite3.Database,
  project: Project,
  filePath: string
): { success: boolean; type: "snapshot" | "config"; message: string } {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  let parsed: any;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`File is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Check if snapshot export
  if (parsed.snapshot && Array.isArray(parsed.files)) {
    const importedSnap = importSnapshot(db, project.id, filePath);
    return {
      success: true,
      type: "snapshot",
      message: `Snapshot successfully imported as '${importedSnap.id}' (${importedSnap.name})`
    };
  }

  // Check if configuration export/file
  if (typeof parsed === "object" && !Array.isArray(parsed)) {
    const { setConfig } = require("@package-guard/shared/repository");
    let count = 0;
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        setConfig(db, k, String(v));
        count++;
      }
    }
    return {
      success: true,
      type: "config",
      message: `Successfully imported ${count} configuration settings`
    };
  }

  throw new Error("Unrecognized file format for PackageGuard import.");
}
