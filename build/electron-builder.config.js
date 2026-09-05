'use strict';

const fs = require('fs');
const path = require('path');

const iconIco = path.resolve(__dirname, 'icon.ico');
const iconIcns = path.resolve(__dirname, 'icon.icns');
const iconPng = path.resolve(__dirname, 'icon.png');

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Package Guard — electron-builder Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * INSTALLATION ARCHITECTURE (Step 3 Standard)
 * ───────────────────────────────────────────
 * Application binary (read-only):
 *   C:\Program Files\Package Guard\
 *     ├── PackageGuard.exe
 *     ├── resources\app.asar
 *     └── cli\
 *         ├── index.js
 *         ├── pg.cmd
 *         └── pg.ps1
 *
 * Runtime user data (read-write, survives upgrades and normal uninstalls):
 *   %APPDATA%\PackageGuard\
 *     ├── data\
 *     │   └── packageguard.db      (Unified DB for Electron & CLI)
 *     ├── snapshots\               (Snapshot archives)
 *     ├── logs\                    (Runtime logs)
 *     ├── config\                  (Settings)
 *     │   └── settings.json
 *     └── temp\                    (Atomic write temporaries)
 *
 * ASAR CONTENTS (read-only application code only):
 *   apps/desktop/main/**         — Electron main process & IPC handlers
 *   apps/desktop/preload/**      — Preload scripts
 *   apps/desktop/renderer/dist/**— Compiled React/Vite frontend bundle
 *   packages/<name>/dist/**      — Compiled shared libraries
 *   apps/cli/dist/**             — Compiled CLI engine
 *   node_modules/**              — Production dependencies
 *
 * EXTRA FILES (copied directly outside asar into installation root):
 *   cli/**                       — CLI bundle + Windows batch & PowerShell shims
 *
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  // ── Identity ───────────────────────────────────────────────────────────────
  appId:       'com.lupusventure.packageguard',
  productName: 'Package Guard',
  copyright:   `Copyright © ${new Date().getFullYear()} Lupus Venture`,

  // ── Output ─────────────────────────────────────────────────────────────────
  directories: {
    output:         'release',
    buildResources: 'build',
  },

  // ── Node Module / Native Addon Behaviour ───────────────────────────────────
  // Use hoisted node_modules directly (matches .npmrc node-linker=hoisted)
  npmRebuild:     false,
  nodeGypRebuild: false,

  // ── Files packed into the asar (application code only) ────────────────────
  files: [
    // Main process, handlers, server, logger, runtimePaths
    'apps/desktop/main/**/*',
    'apps/desktop/preload/**/*',

    // Compiled React frontend
    'apps/desktop/renderer/dist/**/*',

    // Shared compiled packages (core, database, shared)
    'packages/core/dist/**/*',
    'packages/database/dist/**/*',
    'packages/shared/dist/**/*',
    'packages/core/package.json',
    'packages/database/package.json',
    'packages/shared/package.json',

    // CLI package
    'apps/cli/dist/**/*',
    'apps/cli/bin/**/*',
    'apps/cli/package.json',

    // Root package.json needed for require('../package.json') version lookups
    'package.json',

    // Bundled production modules (better-sqlite3-electron, shared)
    {
      from: 'prod-modules',
      to: 'node_modules'
    },

    // ── Explicit exclusions ──────────────────────────────────────────────────
    '!database/**',            // dev-only seed database
    '!database',
    '!data/**',                // legacy portable data directory
    '!data',
    '!release/**',             // build output — never pack into itself
    '!release-v1/**',          // old output folder name
    '!backend/**',
    '!frontend/**',
    '!config/**',
    '!electron/**',
    '!lib/**',
    '!artifacts/**',
    '!tools/**',
    '!infra/**',
    '!scripts/**',
    '!apps/desktop/renderer/src/**',
    '!apps/cli/src/**',
    '!packages/*/src/**',
    '!**/node_modules/.cache/**',
    '!**/*.map',               // source maps
    '!**/*.ts',                // TypeScript source (not needed in packaged app)
    '!**/.git/**',
  ],

  // ── Extra resources unpacked next to app.asar ──────────────────────────────
  extraResources: [
    {
      from: 'prod-modules',
      to: 'app.asar.unpacked/node_modules'
    }
  ],

  // ── Extra files copied directly into install directory (outside asar) ──────
  extraFiles: [
    {
      from: 'dist-cli/pg.exe',
      to: 'cli/pg.exe',
    },
    {
      from: 'build/path-manager.ps1',
      to: 'cli/path-manager.ps1',
    },
  ],

  // ── asar settings ─────────────────────────────────────────────────────────
  asar: true,
  asarUnpack: [
    // Native Node addons and CLI dist must remain outside the asar to be loadable
    '**/*.node',
    'apps/cli/dist/**/*'
  ],

  // ── Extra build-time metadata ──────────────────────────────────────────────
  extraMetadata: {
    buildDate: new Date().toISOString(),
  },

  // ══════════════════════════════════════════════════════════════════════════
  // WINDOWS
  // ══════════════════════════════════════════════════════════════════════════
  win: {
    target: [
      {
        target: 'nsis',
        arch:   ['x64'],
      },
    ],
    // Canonical executable filename — must be PackageGuard.exe
    executableName: 'PackageGuard',
    artifactName:   'PackageGuard-Setup.${ext}',

    // Application icon (uses build/icon.ico if present, else fallback)
    icon: fs.existsSync(iconIco) ? 'build/icon.ico' : undefined,

    // Code signing configuration for local / CI builds
    forceCodeSigning:          false,
    signAndEditExecutable:     false,
    verifyUpdateCodeSignature: false,

    // Execution level for installer and application
    requestedExecutionLevel:   'asInvoker',
  },

  // ── NSIS Installer ─────────────────────────────────────────────────────────
  nsis: {
    // Show standard wizard
    oneClick:                           false,
    perMachine:                         false,
    allowToChangeInstallationDirectory: true,
    artifactName:                       'PackageGuard-Setup.${ext}',
    uninstallDisplayName:               'Package Guard',

    // Shortcuts
    createDesktopShortcut:              true,
    createStartMenuShortcut:            true,
    shortcutName:                       'Package Guard',
    menuCategory:                       'Package Guard',

    // User data is managed cleanly
    deleteAppDataOnUninstall:           false,

    // Custom helper macro for PATH CLI shim registration
    include:                            'build/installer.nsh',
    license:                            null,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // macOS
  // ══════════════════════════════════════════════════════════════════════════
  mac: {
    target:           [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    category:         'public.app-category.developer-tools',
    icon:             fs.existsSync(iconIcns) ? 'build/icon.icns' : undefined,
    forceCodeSigning: false,
  },

  dmg: {
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: 'link', path: '/Applications' },
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // Linux
  // ══════════════════════════════════════════════════════════════════════════
  linux: {
    target:   [{ target: 'AppImage', arch: ['x64'] }],
    category: 'Development',
    icon:     fs.existsSync(iconPng) ? 'build/icon.png' : undefined,
  },
};
