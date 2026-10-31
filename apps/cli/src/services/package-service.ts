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
        headers: { "User-Agent": "Package-Guardian-CLI/1.0.0" },
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

export function classifyUpdate(current: string, latest: string): "major" | "minor" | "patch" {
  const lParts = cleanVersion(latest).split(".").map((n) => parseInt(n, 10) || 0);
  const cParts = cleanVersion(current).split(".").map((n) => parseInt(n, 10) || 0);

  if ((lParts[0] ?? 0) > (cParts[0] ?? 0)) return "major";
  if ((lParts[1] ?? 0) > (cParts[1] ?? 0)) return "minor";
  return "patch";
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

export interface DetailedPackageInfo extends PackageInfo {
  declaredVersion?: string;
  latestVersion?: string | null;
  location?: string;
  updateType?: "major" | "minor" | "patch" | null;
  advisories?: string[];
  description?: string;
  license?: string;
}

export async function getPackageDetails(projectDir: string, packageName: string): Promise<DetailedPackageInfo | null> {
  const base = getSinglePackage(projectDir, packageName);
  if (!base) return null;

  const pkgJsonPath = path.join(projectDir, "package.json");
  let declared = base.version;
  let description = "";
  let license = "";

  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pj = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      const allDeps = {
        ...pj.dependencies,
        ...pj.devDependencies,
        ...pj.peerDependencies,
        ...pj.optionalDependencies
      };
      if (allDeps[packageName]) {
        declared = allDeps[packageName];
      }
    } catch {
      // ignore
    }
  }

  const nodeModPkg = path.join(projectDir, "node_modules", packageName, "package.json");
  const location = fs.existsSync(nodeModPkg)
    ? path.dirname(nodeModPkg)
    : path.join(projectDir, "node_modules", packageName);

  if (fs.existsSync(nodeModPkg)) {
    try {
      const data = JSON.parse(fs.readFileSync(nodeModPkg, "utf8"));
      description = data.description || "";
      license = data.license || "";
    } catch {
      // ignore
    }
  }

  let latestVersion: string | null = null;
  let updateType: "major" | "minor" | "patch" | null = null;

  try {
    latestVersion = await fetchLatestNpmVersion(packageName);
    if (latestVersion && isNewer(latestVersion, base.version)) {
      updateType = classifyUpdate(base.version, latestVersion);
    }
  } catch {
    // ignore
  }

  return {
    ...base,
    declaredVersion: declared,
    latestVersion,
    location,
    updateType,
    advisories: [],
    description,
    license
  };
}

export function searchPackages(projectDir: string, query: string): PackageInfo[] {
  const all = getProjectPackages(projectDir);
  const q = query.toLowerCase().trim();
  return all.filter((p) => p.name.toLowerCase().includes(q) || p.version.includes(q));
}

export interface DependencyTreeNode {
  name: string;
  version: string;
  type: string;
  status: string;
  dependencies?: DependencyTreeNode[];
}

export function getDependencyTree(projectDir: string): DependencyTreeNode[] {
  const pkgs = detectPackages(projectDir);
  const tree: DependencyTreeNode[] = [];

  for (const p of pkgs) {
    const node: DependencyTreeNode = {
      name: p.name,
      version: p.version,
      type: p.type,
      status: p.status
    };

    // Check if sub-dependencies exist in node_modules/<pkg>/package.json
    const subPkgJson = path.join(projectDir, "node_modules", p.name, "package.json");
    if (fs.existsSync(subPkgJson)) {
      try {
        const subData = JSON.parse(fs.readFileSync(subPkgJson, "utf8"));
        if (subData.dependencies && typeof subData.dependencies === "object") {
          node.dependencies = Object.entries(subData.dependencies).slice(0, 10).map(([depName, depVer]) => ({
            name: depName,
            version: String(depVer),
            type: "transitive",
            status: fs.existsSync(path.join(projectDir, "node_modules", depName)) ? "installed" : "missing"
          }));
        }
      } catch {
        // ignore
      }
    }

    tree.push(node);
  }

  return tree;
}

export interface PackageStats {
  total: number;
  direct: number;
  dev: number;
  optional: number;
  peer: number;
  transitive: number;
  python: number;
  installed: number;
  missing: number;
  outdatedCount: number;
  majorUpdates: number;
}

export async function getPackageStats(projectDir: string): Promise<PackageStats> {
  const pkgs = detectPackages(projectDir);
  let direct = 0;
  let dev = 0;
  let optional = 0;
  let peer = 0;
  let transitive = 0;
  let python = 0;
  let installed = 0;
  let missing = 0;

  for (const p of pkgs) {
    if (p.type === "dependency") direct++;
    else if (p.type === "devDependency") dev++;
    else if (p.type === "optionalDependency" || p.type === "optional") optional++;
    else if (p.type === "peerDependency") peer++;
    else if (p.type === "transitive") transitive++;
    else if (p.type === "python") python++;

    if (p.status === "installed") installed++;
    else missing++;
  }

  const outdated = await getOutdatedPackages(projectDir);
  const majorUpdates = outdated.filter((o) => classifyUpdate(o.current, o.latest) === "major").length;

  return {
    total: pkgs.length,
    direct,
    dev,
    optional,
    peer,
    transitive,
    python,
    installed,
    missing,
    outdatedCount: outdated.length,
    majorUpdates
  };
}

export async function getOutdatedPackages(projectDir: string): Promise<Array<OutdatedPackage & { bump?: "major" | "minor" | "patch" }>> {
  const pkgs = detectPackages(projectDir);
  const npmPkgs = pkgs.filter((p) => p.source === "npm");

  const results: Array<OutdatedPackage & { bump?: "major" | "minor" | "patch" }> = [];
  const chunk = npmPkgs.slice(0, 30); // Check top dependencies

  await Promise.all(
    chunk.map(async (pkg) => {
      try {
        const latest = await fetchLatestNpmVersion(pkg.name);
        if (latest && isNewer(latest, pkg.version)) {
          results.push({
            name: pkg.name,
            current: pkg.version,
            latest,
            type: pkg.type,
            bump: classifyUpdate(pkg.version, latest)
          });
        }
      } catch {
        // network or offline, skip
      }
    })
  );

  return results;
}

