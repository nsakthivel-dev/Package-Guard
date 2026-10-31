/**
 * @packageguard/shared — Path Validator & Safe I/O Utilities
 *
 * Centralised validation logic imported by BOTH the CLI and the Electron
 * main process.  Every file-system write in PackageGuard MUST pass through
 * one of these guards before touching disk.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

export class PathValidationError extends Error {
  public readonly resolvedPath: string;
  public readonly forbiddenZone: string;

  constructor(message: string, resolvedPath: string, forbiddenZone: string) {
    super(message);
    this.name = 'PathValidationError';
    this.resolvedPath = resolvedPath;
    this.forbiddenZone = forbiddenZone;
  }
}

export interface SafeReadResult<T = unknown> {
  ok: boolean;
  data: T | null;
  error: string | null;
}

export interface SafeWriteResult {
  ok: boolean;
  error: string | null;
}

const WINDOWS_FORBIDDEN_ZONES: ReadonlyArray<{ label: string; pattern: string }> = [
  { label: 'Program Files', pattern: 'program files' },
  { label: 'Program Files (x86)', pattern: 'program files (x86)' },
  { label: 'Windows', pattern: 'windows' },
  { label: 'System32', pattern: 'system32' },
  { label: 'SysWOW64', pattern: 'syswow64' },
];

export function assertSafeWritePath(targetPath: string): void {
  if (!targetPath || typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new PathValidationError(
      'Path validation failed: path is empty or not a string.',
      String(targetPath),
      'empty-path',
    );
  }

  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    throw new PathValidationError(
      `Path validation failed: refusing to write to the drive root "${resolved}".`,
      resolved,
      'drive-root',
    );
  }

  if (process.platform === 'win32') {
    const resolvedLower = resolved.toLowerCase().replace(/\\/g, '/');

    for (const zone of WINDOWS_FORBIDDEN_ZONES) {
      const zonePattern = `/${zone.pattern}`;
      if (
        resolvedLower.includes(zonePattern + '/') ||
        resolvedLower.endsWith(zonePattern)
      ) {
        throw new PathValidationError(
          `Path validation failed: "${resolved}" is inside the restricted "${zone.label}" directory. ` +
          `Package Guardian must never write to system-protected locations.`,
          resolved,
          zone.label,
        );
      }
    }
  }
}

export function assertInsideDirectory(targetPath: string, allowedRoot: string): void {
  if (!targetPath || typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new PathValidationError(
      'Path validation failed: targetPath is empty or not a string.',
      String(targetPath),
      'empty-path',
    );
  }
  if (!allowedRoot || typeof allowedRoot !== 'string' || allowedRoot.trim().length === 0) {
    throw new PathValidationError(
      'Path validation failed: allowedRoot is empty or not a string.',
      String(allowedRoot),
      'empty-path',
    );
  }
  if (targetPath.includes('\0') || allowedRoot.includes('\0')) {
    throw new PathValidationError(
      'Path validation failed: path contains null bytes.',
      targetPath,
      'null-byte',
    );
  }

  const cleanTarget = path.normalize(targetPath);
  const cleanRoot = path.normalize(allowedRoot);

  const resolvedTarget = path.resolve(cleanTarget);
  const resolvedRoot = path.resolve(cleanRoot);

  const normTarget = process.platform === 'win32' ? resolvedTarget.toLowerCase() : resolvedTarget;
  const normRoot = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot;

  if (normTarget !== normRoot && !normTarget.startsWith(normRoot + path.sep)) {
    throw new PathValidationError(
      `Path validation failed: "${resolvedTarget}" is not inside "${resolvedRoot}". ` +
      `Possible path-traversal attempt.`,
      resolvedTarget,
      'path-traversal',
    );
  }
}

export function assertSafeSnapshotId(snapshotId: string): void {
  if (!snapshotId || typeof snapshotId !== 'string' || snapshotId.trim().length === 0) {
    throw new PathValidationError(
      'Snapshot ID validation failed: ID is empty or not a string.',
      String(snapshotId),
      'invalid-snapshot-id',
    );
  }
  const trimmed = snapshotId.trim();
  if (/[/\\:\x00]|\.\./.test(trimmed)) {
    throw new PathValidationError(
      `Snapshot ID validation failed: "${trimmed}" contains illegal path separators or traversal characters.`,
      trimmed,
      'invalid-snapshot-id',
    );
  }
}

export function assertSafeRelativePath(relPath: string): void {
  if (!relPath || typeof relPath !== 'string' || relPath.trim().length === 0) {
    throw new PathValidationError(
      'Relative path validation failed: path is empty or not a string.',
      String(relPath),
      'empty-path',
    );
  }
  const trimmed = relPath.trim();
  if (
    path.isAbsolute(trimmed) ||
    /^[a-zA-Z]:/.test(trimmed) ||
    trimmed.includes('\0') ||
    trimmed.split(/[/\\]/).some((segment) => segment === '..')
  ) {
    throw new PathValidationError(
      `Relative path validation failed: "${trimmed}" contains path-traversal sequences or is absolute.`,
      trimmed,
      'path-traversal',
    );
  }
}

export function validateProjectRoot(dir: string): { valid: boolean; reason?: string } {
  const absDir = path.resolve(dir);

  try {
    const stat = fs.statSync(absDir);
    if (!stat.isDirectory()) {
      return { valid: false, reason: `"${absDir}" exists but is not a directory.` };
    }
  } catch {
    return { valid: false, reason: `"${absDir}" does not exist or is not accessible.` };
  }

  const pkgJsonPath = path.join(absDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    return { valid: false, reason: `No package.json found in "${absDir}". Run "npm init" first.` };
  }

  try {
    fs.accessSync(absDir, fs.constants.W_OK);
  } catch {
    return { valid: false, reason: `"${absDir}" is not writable. Check file permissions.` };
  }

  return { valid: true };
}

export const LOCAL_PG_DIR_NAME = '.packageguardian' as const;
export const LEGACY_LOCAL_PG_DIR_NAME = '.packageguard' as const;

export function getLocalPgDir(projectRoot: string): string {
  if (!projectRoot || typeof projectRoot !== 'string' || projectRoot.trim().length === 0) {
    throw new PathValidationError(
      'Path validation failed: projectRoot is empty or not a string.',
      String(projectRoot),
      'empty-path',
    );
  }

  if (projectRoot.includes('\0')) {
    throw new PathValidationError(
      'Path validation failed: projectRoot contains null bytes.',
      projectRoot,
      'null-byte',
    );
  }

  const sanitizedRoot = projectRoot.replace(/\0/g, '').trim();
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const resolved = path.resolve(sanitizedRoot);
  assertSafeWritePath(resolved);

  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const primary = path.join(resolved, LOCAL_PG_DIR_NAME);
  assertInsideDirectory(primary, resolved);
  if (fs.existsSync(primary)) return primary;

  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal
  const legacy = path.join(resolved, LEGACY_LOCAL_PG_DIR_NAME);
  assertInsideDirectory(legacy, resolved);
  if (fs.existsSync(legacy)) return legacy;

  return primary;
}

export function ensureLocalPgDir(
  projectRoot: string,
): { ok: boolean; path: string; error: string | null } {
  const pgDir = getLocalPgDir(projectRoot);

  try {
    assertSafeWritePath(pgDir);
    assertInsideDirectory(pgDir, projectRoot);

    if (!fs.existsSync(pgDir)) {
      fs.mkdirSync(pgDir, { recursive: true, mode: 0o755 });
      console.log(`[PATH-VALIDATOR] Created local project directory: ${pgDir}`);
    }

    return { ok: true, path: pgDir, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PATH-VALIDATOR] Failed to create "${pgDir}": ${message}`);
    return { ok: false, path: pgDir, error: message };
  }
}

export function safeReadJson<T = unknown>(filePath: string): SafeReadResult<T> {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    return { ok: false, data: null, error: 'FILE_NOT_FOUND' };
  }

  try {
    const raw = fs.readFileSync(resolved, 'utf-8');

    if (raw.trim().length === 0) {
      return { ok: false, data: null, error: 'FILE_EMPTY' };
    }

    const data = JSON.parse(raw) as T;
    return { ok: true, data, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PATH-VALIDATOR] Failed to read/parse "${resolved}": ${message}`);
    return { ok: false, data: null, error: message };
  }
}

export function safeWriteJson(filePath: string, data: unknown): SafeWriteResult {
  const resolved = path.resolve(filePath);

  try {
    assertSafeWritePath(resolved);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PATH-VALIDATOR] Write blocked by path validation: ${message}`);
    return { ok: false, error: message };
  }

  const parentDir = path.dirname(resolved);
  try {
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PATH-VALIDATOR] Failed to create parent directory "${parentDir}": ${message}`);
    return { ok: false, error: `Cannot create directory: ${message}` };
  }

  const tmpSuffix = crypto.randomBytes(4).toString('hex');
  const tmpPath = `${resolved}.${tmpSuffix}.tmp`;

  try {
    const content = JSON.stringify(data, null, 2) + '\n';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, resolved);
    return { ok: true, error: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PATH-VALIDATOR] Failed to write "${resolved}": ${message}`);

    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch { /* ignore cleanup error */ }

    return { ok: false, error: message };
  }
}

export function backupCorruptedFile(filePath: string): string | null {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${resolved}.corrupt.${timestamp}`;

  try {
    fs.copyFileSync(resolved, backupPath);
    console.warn(`[PATH-VALIDATOR] Backed up corrupted file: "${resolved}" → "${backupPath}"`);
    return backupPath;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[PATH-VALIDATOR] Failed to back up corrupted file: ${message}`);
    return null;
  }
}
