/**
 * Dependency scanner.
 *
 * Reads resolved versions from pnpm-lock.yaml (v6 / v9 formats) when present,
 * falling back to the version range in package.json.
 *
 * No third-party YAML parser — we only need the narrow subset of the lockfile
 * that maps package names to their pinned versions, so a line-oriented parser
 * is sufficient and keeps the binary free of extra dependencies.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface PackageEntry {
  name: string;
  version: string;
  type: 'dependency' | 'devDependency';
}

// ── Public ────────────────────────────────────────────────────────────────────

/**
 * Return all direct dependencies (prod + dev) for the project at `dir`.
 * Versions are resolved from the lockfile when available; otherwise the range
 * from package.json is used verbatim.
 */
export function scanDependencies(dir: string): PackageEntry[] {
  const { deps, devDeps } = readPackageJsonDeps(dir);
  const resolved          = readPnpmLockResolved(dir);

  const entries: PackageEntry[] = [];

  for (const [name, range] of Object.entries(deps)) {
    entries.push({ name, version: resolved[name] ?? range, type: 'dependency' });
  }
  for (const [name, range] of Object.entries(devDeps)) {
    entries.push({ name, version: resolved[name] ?? range, type: 'devDependency' });
  }

  return entries;
}

// ── package.json ──────────────────────────────────────────────────────────────

function readPackageJsonDeps(dir: string): {
  deps: Record<string, string>;
  devDeps: Record<string, string>;
} {
  const pkgPath = path.join(dir, 'package.json');
  try {
    if (!fs.existsSync(pkgPath)) return { deps: {}, devDeps: {} };
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return {
      deps:    isStringRecord(pkg.dependencies)    ? pkg.dependencies    : {},
      devDeps: isStringRecord(pkg.devDependencies) ? pkg.devDependencies : {},
    };
  } catch {
    return { deps: {}, devDeps: {} };
  }
}

function isStringRecord(v: unknown): v is Record<string, string> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ── pnpm-lock.yaml (v6 and v9) ────────────────────────────────────────────────
//
// Both lockfile formats share a common structure for the top-level dependency
// blocks that we care about:
//
//   (v6 / v9 shared)
//   importers:
//     .:
//       dependencies:
//         commander:
//           specifier: ^12.1.0
//           version: 12.1.0
//       devDependencies:
//         typescript:
//           specifier: ~5.9.2
//           version: 5.9.3
//
// We walk line by line, track indentation depth, and extract the name→version
// mapping from the root importer (".") only, so workspace sub-packages don't
// bleed into each other.

function readPnpmLockResolved(dir: string): Record<string, string> {
  const lockPath = path.join(dir, 'pnpm-lock.yaml');
  if (!fs.existsSync(lockPath)) return {};

  try {
    const lines = fs.readFileSync(lockPath, 'utf-8').split('\n');
    return parsePnpmLock(lines);
  } catch {
    return {};
  }
}

function parsePnpmLock(lines: string[]): Record<string, string> {
  const resolved: Record<string, string> = {};

  // State machine
  let inImporters     = false; // inside the "importers:" block
  let inRootImporter  = false; // inside the "  .:" sub-block
  let inDepSection    = false; // inside a dependencies/devDependencies sub-block
  let currentPkg: string | null = null;

  for (const raw of lines) {
    const line    = raw.replace(/\r$/, '');   // strip CR
    const trimmed = line.trimStart();
    const indent  = line.length - trimmed.length;

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    // ── Top-level section detection ─────────────────────────────────────────
    if (indent === 0) {
      inImporters    = trimmed === 'importers:';
      inRootImporter = false;
      inDepSection   = false;
      currentPkg     = null;
      continue;
    }

    if (!inImporters) continue;

    // ── importer key "  .:" ──────────────────────────────────────────────────
    if (indent === 2) {
      inRootImporter = (trimmed === '.:');
      inDepSection   = false;
      currentPkg     = null;
      continue;
    }

    if (!inRootImporter) continue;

    // ── dependencies / devDependencies header at indent 4 ───────────────────
    if (indent === 4) {
      inDepSection = trimmed === 'dependencies:' || trimmed === 'devDependencies:';
      currentPkg   = null;
      continue;
    }

    if (!inDepSection) continue;

    // ── package name at indent 6, e.g. "      commander:" ───────────────────
    if (indent === 6) {
      const m = trimmed.match(/^'?([^':]+)'?:\s*$/);
      currentPkg = m ? m[1].trim() : null;
      continue;
    }

    // ── version line at indent 8, e.g. "        version: 12.1.0" ────────────
    if (indent === 8 && currentPkg !== null) {
      const m = trimmed.match(/^version:\s*(.+)$/);
      if (m) {
        // Strip trailing parenthetical e.g. "12.1.0(typescript@5.9.3)"
        const raw_ver = m[1].trim().replace(/\(.*$/, '').trim();
        if (raw_ver) resolved[currentPkg] = raw_ver;
        currentPkg = null; // consumed
      }
      continue;
    }
  }

  return resolved;
}
