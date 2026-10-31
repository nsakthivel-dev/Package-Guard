/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Package Guardian — Uninstall Helper
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Handles runtime cleanup when the user chooses "Full removal" from within the
 * application's Settings page before triggering the NSIS uninstaller.
 *
 * This module is responsible for the Node-side of the two-option uninstall:
 *
 *   Option 1 (app-only):  The Electron process quits. NSIS removes the binary
 *                         from Program Files and registry entries. AppData is
 *                         left intact so data survives a reinstall.
 *
 *   Option 2 (full wipe): This module deletes the runtime data tree from
 *                         AppData\Roaming\PackageGuardian\ first, then the
 *                         Electron process quits. NSIS finalises the removal.
 *
 * The NSIS script (build/installer/uninstall-helper.nsh) also performs its own
 * cleanup (shortcuts, registry) based on the user's choice — the two sides
 * are complementary and both run during an uninstall.
 *
 * USAGE (called from main.js app:uninstall IPC handler):
 *   const uninstallHelper = require('./handlers/uninstallHelper');
 *   const result = await uninstallHelper.removeAllUserData(dataRoot, paths);
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively removes a directory tree.
 * Returns { success: true } on success, { success: false, error: string } on failure.
 * Never throws.
 *
 * @param {string} targetPath
 * @returns {{ success: boolean, error?: string }}
 */
function removeDir(targetPath) {
  try {
    if (!fs.existsSync(targetPath)) return { success: true };  // already gone
    fs.rmSync(targetPath, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Removes a single file.  Never throws.
 *
 * @param {string} filePath
 * @returns {{ success: boolean, error?: string }}
 */
function removeFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return { success: true };
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Removes all user data stored under the application's AppData directory.
 *
 * This is called from the `app:uninstall` IPC handler in main.js when the
 * user selects "Full removal — also delete all my data and settings".
 *
 * The function:
 *   1. Removes every runtime sub-directory (database, logs, cache, etc.)
 *   2. Removes loose files at the data root (server.json, install.ini)
 *   3. Attempts to remove the root directory itself once it is empty
 *
 * All operations are non-fatal — partial failures are collected and returned
 * so the caller can log them, but the uninstall process continues regardless.
 *
 * @param {string} dataRoot  - Full path to AppData\Roaming\PackageGuardian
 * @param {object} paths     - The rp.paths object from runtimePaths.js
 * @returns {Promise<{ success: boolean, removed: string[], failed: Array<{path:string, error:string}> }>}
 */
async function removeAllUserData(dataRoot, paths) {
  const removed = [];
  const failed  = [];

  function track(res, label) {
    if (res.success) {
      removed.push(label);
    } else {
      failed.push({ path: label, error: res.error });
    }
  }

  // ── Sub-directories ──────────────────────────────────────────────────────
  const subDirs = [
    { label: paths.database,  p: paths.database  },
    { label: paths.config,    p: paths.config    },
    { label: paths.snapshots, p: paths.snapshots },
    { label: paths.logs,      p: paths.logs      },
    { label: paths.cache,     p: paths.cache     },
    { label: paths.temp,      p: paths.temp      },
    { label: paths.venv,      p: paths.venv      },
  ];

  for (const { label, p } of subDirs) {
    track(removeDir(p), label);
  }

  // ── Loose root-level files ───────────────────────────────────────────────
  const rootFiles = [
    paths.serverJson,
    path.join(dataRoot, 'install.ini'),
  ];

  for (const f of rootFiles) {
    track(removeFile(f), f);
  }

  // ── Remove the root directory itself (only succeeds if now empty) ────────
  try {
    if (fs.existsSync(dataRoot)) {
      // Use rmSync with recursive:true so even if something was missed above
      // (e.g. a sub-dir we don't know about) the whole tree is gone.
      fs.rmSync(dataRoot, { recursive: true, force: true });
      removed.push(dataRoot);
    }
  } catch (err) {
    failed.push({ path: dataRoot, error: err.message });
  }

  const success = failed.length === 0;
  return { success, removed, failed };
}

/**
 * Returns a human-readable summary of what will be deleted, so the Settings
 * UI can display it in a confirmation dialog before calling removeAllUserData.
 *
 * @param {string} dataRoot
 * @param {object} paths
 * @returns {{ exists: boolean, sizeLabel: string, itemList: string[] }}
 */
function describeUserData(dataRoot, paths) {
  if (!fs.existsSync(dataRoot)) {
    return { exists: false, sizeLabel: '0 B', itemList: [] };
  }

  const itemList = [];
  let totalBytes = 0;

  const candidates = [
    paths.database, paths.config, paths.snapshots,
    paths.logs,     paths.cache,  paths.temp, paths.venv,
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      const bytes = _dirSize(dir);
      totalBytes += bytes;
      itemList.push(`${path.basename(dir)}  (${_humanSize(bytes)})`);
    }
  }

  return {
    exists:    true,
    sizeLabel: _humanSize(totalBytes),
    itemList,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _dirSize(dirPath) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(dirPath)) {
      const full = path.join(dirPath, entry);
      try {
        const stat = fs.lstatSync(full);
        if (stat.isDirectory()) {
          total += _dirSize(full);
        } else {
          total += stat.size;
        }
      } catch (_) { /* skip inaccessible */ }
    }
  } catch (_) { /* skip unreadable dir */ }
  return total;
}

function _humanSize(bytes) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  removeAllUserData,
  describeUserData,
};
