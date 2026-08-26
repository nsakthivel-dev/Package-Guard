/**
 * Project detection helpers.
 *
 * Produces a Project-shaped descriptor for the current directory.
 * All fields match the Zod schema in backend/core/src/types.ts.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { PackageManager, Project } from './store';

// ── Package manager detection (sync mirror of pm-detector.ts) ─────────────────

const LOCKFILE_PM: Array<[string, PackageManager]> = [
  ['pnpm-lock.yaml',    'pnpm'],
  ['yarn.lock',         'yarn'],
  ['bun.lockb',         'bun'],
  ['package-lock.json', 'npm'],
];

export function detectPackageManager(dir: string): PackageManager {
  // 1. Check packageManager field in package.json
  try {
    const pkg = readPackageJson(dir);
    if (typeof pkg['packageManager'] === 'string') {
      const raw = (pkg['packageManager'] as string).trim();
      const name = raw.includes('@') ? raw.slice(0, raw.indexOf('@')) : raw;
      if (['npm', 'pnpm', 'yarn', 'bun'].includes(name)) return name as PackageManager;
    }
  } catch { /* fall through */ }

  // 2. First matching lockfile wins (priority order matches core)
  for (const [file, pm] of LOCKFILE_PM) {
    if (fs.existsSync(path.join(dir, file))) return pm;
  }

  return 'npm';  // default — same as core
}

// ── Package.json reader ────────────────────────────────────────────────────────

export function readPackageJson(dir: string): Record<string, unknown> {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ── Stable project ID ─────────────────────────────────────────────────────────

/**
 * Produces a stable "proj-<16hex>" id from the absolute project path.
 * Uses forward-slash normalisation so Windows and POSIX produce the same hash.
 * The id starts with "proj-" as required by the Zod schema.
 */
export function stableProjectId(absPath: string): string {
  const normalised = absPath.replace(/\\/g, '/');
  const hex = crypto.createHash('sha256').update(normalised).digest('hex').slice(0, 16);
  return `proj-${hex}`;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Build a fully Zod-compatible Project descriptor for `dir` (defaults to cwd).
 * The caller may override createdAt/updatedAt when merging with an existing entry.
 */
export function buildProject(dir: string = process.cwd(), existingCreatedAt?: number): Project {
  const absPath = path.resolve(dir);
  const pkg     = readPackageJson(absPath);
  const name    = typeof pkg['name'] === 'string' && pkg['name'].trim()
    ? pkg['name'].trim()
    : path.basename(absPath);

  const now = Date.now();

  return {
    id:             stableProjectId(absPath),
    name,
    path:           absPath.replace(/\\/g, '/'),
    packageManager: detectPackageManager(absPath),
    packageJson:    pkg,
    createdAt:      existingCreatedAt ?? now,
    updatedAt:      now,
  };
}
