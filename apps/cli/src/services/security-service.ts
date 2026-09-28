import * as fs from "node:fs";
import * as path from "node:path";
import { execFile } from "node:child_process";
import type BetterSqlite3 from "better-sqlite3";
import type { Project, SecurityAdvisory } from "@package-guard/shared/types";
import {
  insertSecurityAdvisory,
  listSecurityAdvisories,
  insertHistory
} from "@package-guard/shared/repository";
import { updateSinglePackage } from "./update-service";
import { detectPackageManager } from "./project-service";

export interface VulnerabilityItem {
  id: string;
  name: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title: string;
  vulnerableVersions: string;
  fixedIn?: string;
  url?: string;
}

export interface SecurityReport {
  status: "OK" | "VULNERABILITIES_FOUND" | "UNAVAILABLE";
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  vulnerabilities: VulnerabilityItem[];
  message?: string;
}

function runAuditCommand(pm: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    let cmd = pm;
    if (isWin && (pm === "npm" || pm === "pnpm" || pm === "yarn")) {
      cmd = `${pm}.cmd`;
    }

    const args = ["audit", "--json"];

    execFile(cmd, args, { cwd, shell: isWin, timeout: 15000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout ? stdout.toString() : "",
        stderr: stderr ? stderr.toString() : "",
        exitCode: error?.code ? Number(error.code) : 0
      });
    });
  });
}

export async function runSecurityAudit(
  db: BetterSqlite3.Database,
  project: Project
): Promise<SecurityReport> {
  const pm = project.packageManager || detectPackageManager(project.path);
  const pkgJson = path.join(project.path, "package.json");

  if (!fs.existsSync(pkgJson)) {
    return {
      status: "UNAVAILABLE",
      summary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      vulnerabilities: [],
      message: "No package.json manifest found in current project"
    };
  }

  const result = await runAuditCommand(pm, project.path);
  const vulnerabilities: VulnerabilityItem[] = [];

  if (result.stdout) {
    try {
      const data = JSON.parse(result.stdout);
      // npm audit v7+ format
      if (data.vulnerabilities && typeof data.vulnerabilities === "object") {
        for (const [pkgName, val] of Object.entries<any>(data.vulnerabilities)) {
          const sevRaw = String(val.severity || "LOW").toUpperCase();
          const sev: VulnerabilityItem["severity"] =
            sevRaw === "CRITICAL" ? "CRITICAL" : sevRaw === "HIGH" ? "HIGH" : sevRaw === "MODERATE" || sevRaw === "MEDIUM" ? "MEDIUM" : "LOW";

          const fixInfo = typeof val.fixAvailable === "object" ? val.fixAvailable.version : undefined;

          const item: VulnerabilityItem = {
            id: `vuln-${pkgName}-${Date.now()}`,
            name: pkgName,
            severity: sev,
            title: val.name || `Advisory in ${pkgName}`,
            vulnerableVersions: val.range || "*",
            fixedIn: fixInfo,
            url: val.via && Array.isArray(val.via) && typeof val.via[0] === "object" ? val.via[0].url : undefined
          };

          vulnerabilities.push(item);

          insertSecurityAdvisory(db, {
            id: item.id,
            packageName: item.name,
            severity: item.severity,
            title: item.title,
            vulnerableVersions: item.vulnerableVersions,
            fixedIn: item.fixedIn,
            url: item.url
          });
        }
      }
    } catch {
      // JSON parse error or offline
    }
  }

  // If audit command was unavailable or offline, check existing cached advisories in SQLite
  if (vulnerabilities.length === 0 && result.exitCode !== 0 && !result.stdout) {
    const cached = listSecurityAdvisories(db);
    if (cached.length > 0) {
      for (const c of cached) {
        vulnerabilities.push({
          id: c.id,
          name: c.package_name,
          severity: c.severity as any,
          title: c.title || "Cached Advisory",
          vulnerableVersions: c.vulnerable_versions || "*",
          fixedIn: c.fixed_in || undefined,
          url: c.url || undefined
        });
      }
    } else {
      return {
        status: "UNAVAILABLE",
        summary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
        vulnerabilities: [],
        message: "Vulnerability scan unavailable (offline or package manager audit tool returned no data)"
      };
    }
  }

  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const v of vulnerabilities) {
    if (v.severity === "CRITICAL") critical++;
    else if (v.severity === "HIGH") high++;
    else if (v.severity === "MEDIUM") medium++;
    else low++;
  }

  const total = vulnerabilities.length;
  const status = total > 0 ? "VULNERABILITIES_FOUND" : "OK";

  return {
    status,
    summary: { critical, high, medium, low, total },
    vulnerabilities
  };
}

export async function fixSecurityVulnerabilities(
  db: BetterSqlite3.Database,
  project: Project
): Promise<{ fixed: number; failed: number; items: Array<{ package: string; fixedIn?: string; success: boolean }> }> {
  const audit = await runSecurityAudit(db, project);
  if (audit.vulnerabilities.length === 0) {
    return { fixed: 0, failed: 0, items: [] };
  }

  const items: Array<{ package: string; fixedIn?: string; success: boolean }> = [];
  let fixed = 0;
  let failed = 0;

  for (const v of audit.vulnerabilities) {
    if (v.fixedIn) {
      const res = await updateSinglePackage(db, project, v.name, {
        version: v.fixedIn
      });

      if (res.success) {
        fixed++;
        items.push({ package: v.name, fixedIn: v.fixedIn, success: true });
      } else {
        failed++;
        items.push({ package: v.name, fixedIn: v.fixedIn, success: false });
      }
    }
  }

  insertHistory(db, {
    projectId: project.id,
    eventType: "SECURITY",
    description: `Security fix performed: ${fixed} remediated, ${failed} failed`,
    detailsJson: JSON.stringify({ fixed, failed, items })
  });

  return { fixed, failed, items };
}
