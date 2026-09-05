import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import type { PackageInfo, OutdatedPackage } from "@package-guard/shared/types";
import { detectPackages } from "./scanner-service";

export function getProjectPackages(projectDir: string): PackageInfo[] {
  return detectPackages(projectDir);
}

export function getSinglePackage(projectDir: string, packageName: string): PackageInfo | null {
  const pkgs = detectPackages(projectDir);
  const found = pkgs.find(
    (p) => p.name.toLowerCase() === packageName.toLowerCase()
  );
  if (found) return found;

  // Check node_modules directly
  const nodeModPkg = path.join(projectDir, "node_modules", packageName, "package.json");
  if (fs.existsSync(nodeModPkg)) {
    try {
      const data = JSON.parse(fs.readFileSync(nodeModPkg, "utf8"));
      return {
        name: packageName,
        version: String(data.version || "unknown"),
        type: "transitive",
        source: "npm",
        status: "installed"
      };
    } catch {
      // ignore
    }
  }

  return null;
}

function fetchLatestNpmVersion(packageName: string): Promise<string | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 1800);

    const req = https.get(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`,
      {
        headers: { "User-Agent": "Package-Guard-CLI/0.1.0" },
        timeout: 1800
      },
      (res) => {
        if (res.statusCode !== 200) {
          clearTimeout(timer);
          resolve(null);
          return;
        }

        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          clearTimeout(timer);
          try {
            const data = JSON.parse(body);
            resolve(typeof data.version === "string" ? data.version : null);
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });

    req.on("timeout", () => {
      req.destroy();
      clearTimeout(timer);
      resolve(null);
    });
  });
}

function cleanVersion(v: string): string {
  return v.replace(/^[^0-9]*/, "");
}

function isNewer(latest: string, current: string): boolean {
  const lParts = cleanVersion(latest).split(".").map((n) => parseInt(n, 10) || 0);
  const cParts = cleanVersion(current).split(".").map((n) => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
    const l = lParts[i] ?? 0;
    const c = cParts[i] ?? 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

export async function getOutdatedPackages(projectDir: string): Promise<OutdatedPackage[]> {
  const pkgs = detectPackages(projectDir);
  const npmPkgs = pkgs.filter((p) => p.source === "npm");

  // Limit concurrency to 5
  const results: OutdatedPackage[] = [];
  const chunk = npmPkgs.slice(0, 15); // Check top dependencies

  await Promise.all(
    chunk.map(async (pkg) => {
      try {
        const latest = await fetchLatestNpmVersion(pkg.name);
        if (latest && isNewer(latest, pkg.version)) {
          results.push({
            name: pkg.name,
            current: pkg.version,
            latest,
            type: pkg.type
          });
        }
      } catch {
        // network or offline, skip
      }
    })
  );

  return results;
}
