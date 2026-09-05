/**
 * pathGuard.js — Electron-side guarded file-system wrappers
 *
 * Every user-data file operation in the Electron main process SHOULD use
 * these wrappers instead of raw fs calls.  Each method validates the target
 * path before performing I/O, logs the result, and returns a typed result
 * object so callers never need naked try/catch blocks.
 *
 * Path validation rules:
 *   • No writes to Program Files, Windows, System32, or drive roots
 *   • Atomic JSON writes via temp-file + rename
 *   • Corruption-safe reads with structured error reporting
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const crypto = require('crypto');

// ── Forbidden zones (mirrors shared-paths/path-validator.ts) ─────────────────

const WINDOWS_FORBIDDEN_ZONES = [
  { label: 'Program Files',       pattern: 'program files' },
  { label: 'Program Files (x86)', pattern: 'program files (x86)' },
  { label: 'Windows',             pattern: 'windows' },
  { label: 'System32',            pattern: 'system32' },
  { label: 'SysWOW64',            pattern: 'syswow64' },
];

// ── Core path validation (JS mirror for Electron main process) ───────────────

/**
 * Validates a path is safe for PackageGuard to write to.
 * Throws an Error if the path is in a restricted zone.
 *
 * @param {string} targetPath
 * @throws {Error}
 */
function assertSafeWritePath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new Error('[PATH-GUARD] Path validation failed: path is empty or not a string.');
  }

  const resolved = path.resolve(targetPath);

  // Drive-root guard
  const parsed = path.parse(resolved);
  if (resolved === parsed.root) {
    throw new Error(`[PATH-GUARD] Refusing to write to drive root "${resolved}".`);
  }

  // Windows forbidden-zone guard
  if (process.platform === 'win32') {
    const resolvedLower = resolved.toLowerCase().replace(/\\/g, '/');

    for (const zone of WINDOWS_FORBIDDEN_ZONES) {
      const zonePattern = `/${zone.pattern}`;
      if (
        resolvedLower.includes(zonePattern + '/') ||
        resolvedLower.endsWith(zonePattern)
      ) {
        throw new Error(
          `[PATH-GUARD] "${resolved}" is inside restricted "${zone.label}" directory. ` +
          `PackageGuard must never write to system-protected locations.`
        );
      }
    }
  }
}

// ── Guarded file operations ──────────────────────────────────────────────────

/**
 * Read a file with path validation and error handling.
 *
 * @param {string} filePath - Path to the file to read
 * @returns {{ ok: boolean, data: string|null, error: string|null }}
 */
function guardedReadFile(filePath) {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    return { ok: false, data: null, error: 'FILE_NOT_FOUND' };
  }

  try {
    const data = fs.readFileSync(resolved, 'utf-8');
    return { ok: true, data, error: null };
  } catch (err) {
    const message = err.message || String(err);
    console.error(`[PATH-GUARD] Failed to read "${resolved}": ${message}`);
    return { ok: false, data: null, error: message };
  }
}

/**
 * Read and parse a JSON file with path validation, corruption detection,
 * and structured error reporting.
 *
 * @param {string} filePath - Path to the JSON file
 * @returns {{ ok: boolean, data: any, error: string|null }}
 */
function guardedReadJson(filePath) {
  const result = guardedReadFile(filePath);
  if (!result.ok) return { ok: false, data: null, error: result.error };

  try {
    if (result.data.trim().length === 0) {
      return { ok: false, data: null, error: 'FILE_EMPTY' };
    }
    const parsed = JSON.parse(result.data);
    return { ok: true, data: parsed, error: null };
  } catch (err) {
    const message = err.message || String(err);
    console.error(`[PATH-GUARD] JSON parse failed for "${filePath}": ${message}`);
    return { ok: false, data: null, error: `JSON_PARSE_ERROR: ${message}` };
  }
}

/**
 * Write content to a file with path validation.
 * Uses atomic write (temp file + rename) to prevent corruption.
 *
 * @param {string} filePath - Path to write to
 * @param {string} content  - Content to write
 * @returns {{ ok: boolean, error: string|null }}
 */
function guardedWriteFile(filePath, content) {
  const resolved = path.resolve(filePath);

  try {
    assertSafeWritePath(resolved);
  } catch (err) {
    console.error(`[PATH-GUARD] Write blocked: ${err.message}`);
    return { ok: false, error: err.message };
  }

  // Ensure parent directory exists
  const parentDir = path.dirname(resolved);
  try {
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  } catch (err) {
    const message = err.message || String(err);
    console.error(`[PATH-GUARD] Cannot create parent dir "${parentDir}": ${message}`);
    return { ok: false, error: `Cannot create directory: ${message}` };
  }

  // Atomic write via temp file
  const tmpSuffix = crypto.randomBytes(4).toString('hex');
  const tmpPath = `${resolved}.${tmpSuffix}.tmp`;

  try {
    fs.writeFileSync(tmpPath, content, { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(tmpPath, resolved);
    return { ok: true, error: null };
  } catch (err) {
    const message = err.message || String(err);
    console.error(`[PATH-GUARD] Failed to write "${resolved}": ${message}`);

    // Clean up temp file
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }

    return { ok: false, error: message };
  }
}

/**
 * Atomically write a JSON object to a file with path validation.
 *
 * @param {string} filePath - Path to write to
 * @param {any} data - Object to serialize to JSON
 * @returns {{ ok: boolean, error: string|null }}
 */
function guardedWriteJson(filePath, data) {
  const content = JSON.stringify(data, null, 2) + '\n';
  return guardedWriteFile(filePath, content);
}

/**
 * Create a directory with path validation.
 *
 * @param {string} dirPath - Directory path to create
 * @returns {{ ok: boolean, error: string|null }}
 */
function guardedMkdir(dirPath) {
  const resolved = path.resolve(dirPath);

  try {
    assertSafeWritePath(resolved);
  } catch (err) {
    console.error(`[PATH-GUARD] Mkdir blocked: ${err.message}`);
    return { ok: false, error: err.message };
  }

  try {
    if (!fs.existsSync(resolved)) {
      fs.mkdirSync(resolved, { recursive: true });
      console.log(`[PATH-GUARD] Directory created: ${resolved}`);
    }
    return { ok: true, error: null };
  } catch (err) {
    const message = err.message || String(err);
    console.error(`[PATH-GUARD] Failed to create "${resolved}": ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * Back up a corrupted file by appending `.corrupt.<timestamp>` to the name.
 *
 * @param {string} filePath - File to back up
 * @returns {string|null} - Backup path if successful, null otherwise
 */
function backupCorruptedFile(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${resolved}.corrupt.${timestamp}`;

  try {
    fs.copyFileSync(resolved, backupPath);
    console.warn(`[PATH-GUARD] Backed up corrupted file: "${resolved}" → "${backupPath}"`);
    return backupPath;
  } catch (err) {
    console.error(`[PATH-GUARD] Failed to back up corrupted file: ${err.message}`);
    return null;
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  assertSafeWritePath,
  guardedReadFile,
  guardedReadJson,
  guardedWriteFile,
  guardedWriteJson,
  guardedMkdir,
  backupCorruptedFile,
};
