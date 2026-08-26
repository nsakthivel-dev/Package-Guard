import fs from 'node:fs/promises';
import path from 'node:path';
import type { PackageManager } from './types.js';

const LOCKFILE_CANDIDATES: Array<[string, PackageManager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

interface PkgJsonPMField {
  packageManager?: string;
}

export interface PMDetectionResult {
  packageManager: PackageManager;
  source: 'packageManager-field' | 'lockfile' | 'default';
  warnings: string[];
}

export async function detectPackageManager(projectPath: string): Promise<PackageManager> {
  const r = await detectPackageManagerVerbose(projectPath);
  for (const w of r.warnings) {
    console.warn(`[package-guard] ${w}`);
  }
  return r.packageManager;
}

export async function detectPackageManagerVerbose(projectPath: string): Promise<PMDetectionResult> {
  const warnings: string[] = [];

  const existingLockfiles: Array<[string, PackageManager]> = [];
  for (const [file, pm] of LOCKFILE_CANDIDATES) {
    try {
      await fs.access(path.join(projectPath, file));
      existingLockfiles.push([file, pm]);
    } catch {
      // not present
    }
  }

  if (existingLockfiles.length > 1) {
    const list = existingLockfiles.map(([f]) => f).join(', ');
    warnings.push(
      `Multiple lockfiles found at ${projectPath} (${list}). Priority order: pnpm-lock.yaml > yarn.lock > bun.lockb > package-lock.json`
    );
  }

  const pjPath = path.join(projectPath, 'package.json');
  try {
    const raw = await fs.readFile(pjPath, 'utf8');
    const pj = JSON.parse(raw) as PkgJsonPMField;
    if (typeof pj.packageManager === 'string' && pj.packageManager.length > 0) {
      const rawValue = pj.packageManager.trim();
      const at = rawValue.indexOf('@');
      const coreName = at > 0 ? rawValue.slice(0, at) : rawValue;
      if (coreName === 'npm' || coreName === 'pnpm' || coreName === 'yarn' || coreName === 'bun') {
        const chosen = coreName as PackageManager;
        const expectedFile = LOCKFILE_CANDIDATES.find(([, p]) => p === chosen)?.[0];
        const lockfilePresent = existingLockfiles.some(([, p]) => p === chosen);
        if (expectedFile && !lockfilePresent) {
          warnings.push(
            `package.json declares "packageManager": "${rawValue}" but no ${expectedFile} was found in ${projectPath}.`
          );
        }
        return { packageManager: chosen, source: 'packageManager-field', warnings };
      }
      warnings.push(
        `Unknown packageManager field "${rawValue}" in package.json; falling back to lockfile detection.`
      );
    }
  } catch {
    // unreadable / missing package.json — caller validation catches this for init flow
  }

  for (const [, pm] of existingLockfiles) {
    return { packageManager: pm, source: 'lockfile', warnings };
  }

  warnings.push(
    `No lockfile found at ${projectPath}; defaulting to npm. Run the project's install command first to produce a lockfile.`
  );
  return { packageManager: 'npm', source: 'default', warnings };
}
