/**
 * ─────────────────────────────────────────────────────────────────────────────
 * Project Guardian — electron-builder Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * INSTALLATION ARCHITECTURE
 * ─────────────────────────
 * Application binary (read-only):
 *   C:\Program Files\Project Guardian\
 *
 * Runtime user data (read-write, survives upgrades and uninstalls):
 *   C:\Users\<Username>\AppData\Roaming\Project Guardian\
 *     ├── config\
 *     ├── database\
 *     ├── snapshots\
 *     ├── logs\
 *     ├── cache\
 *     ├── temp\
 *     └── venv\
 *
 * The AppData directory tree is created automatically on first launch by
 * runtimePaths.js — no manual setup is required.
 *
 * ASAR CONTENTS (read-only app code only):
 *   electron/**          — main process, handlers, server, logger, runtimePaths
 *   artifacts/…/dist/**  — compiled React frontend
 *   node_modules/**      — production dependencies
 *
 * NOT included in asar (writable runtime data never lives in Program Files):
 *   database/**          — dev seed data
 *   data/**              — legacy portable data dir (obsolete)
 *   build/installer/**   — NSIS helper scripts (used at build time only)
 *
 * @type {import('electron-builder').Configuration}
 */
module.exports = {
  // ── Identity ───────────────────────────────────────────────────────────────
  appId:       'com.lupusventure.projectguardian',
  productName: 'Project Guardian',
  copyright:   `Copyright © ${new Date().getFullYear()} Lupus Venture`,

  // ── Output ─────────────────────────────────────────────────────────────────
  directories: {
    output:    'release',
    buildResources: 'config',
  },

  // ── Node Module / Native Addon Behaviour ───────────────────────────────────
  // Use hoisted node_modules directly (matches .npmrc node-linker=hoisted)
  // instead of probing pnpm's internal SQLite store which can throw
  // ERR_SQLITE_ERROR when the collector runs in an isolated temp context.
  npmRebuild: false,
  nodeGypRebuild: false,

  // ── Files packed into the asar (application code only) ────────────────────
  files: [
    // Main process, handlers, server, logger, runtimePaths
    'backend/electron/**/*',

    // Compiled React frontend
    'frontend/dist/**/*',

    // ── Explicit exclusions ──────────────────────────────────────────────────
    '!database/**',            // dev-only seed database
    '!database',
    '!data/**',                // legacy portable data directory
    '!data',
    '!release/**',             // build output — never pack into itself
    '!release-v1/**',          // old output folder name
    '!packages/**',            // TypeScript source packages (compiled separately)
    '!tools/scripts/**',       // build/utility scripts
    '!infra/installer/**',     // NSIS scripts — consumed by builder, not bundled
    '!**/node_modules/.cache/**',
    '!**/*.map',               // source maps
    '!**/*.ts',                // TypeScript source (not needed in packaged app)
    '!**/.git/**',
  ],

  // ── asar settings ─────────────────────────────────────────────────────────
  asar: true,
  asarUnpack: [
    // Native Node addons must remain outside the asar to be loadable
    '**/*.node',
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
    // Canonical executable filename — must be PackageGuard.exe.
    // electron-builder defaults to productName ('Project Guardian.exe') when
    // this is not set, which conflicts with CLI process detection and launching.
    // Setting executableName here decouples the file identity from the display name.
    executableName: 'PackageGuard',

    // Application icon — place a .ico file at build/icon.ico
    // electron-builder will fall back to its own default if the file is absent.
    icon: 'config/icon.ico',

    // Do not require a code-signing certificate for local / CI builds.
    // Set CSC_LINK + CSC_KEY_PASSWORD env vars to enable signing.
    forceCodeSigning: false,
    signAndEditExecutable: false,
    verifyUpdateCodeSignature: false,

    // Registers the application with Windows so it appears in:
    //   Settings → Apps → Installed Apps
    //   Control Panel → Programs and Features
    requestedExecutionLevel: 'asInvoker',
  },

  // ── NSIS Installer ─────────────────────────────────────────────────────────
  nsis: {
    // ── Install mode ────────────────────────────────────────────────────────
    // oneClick: false  → show a full installer wizard (standard for professional apps)
    oneClick: false,

    // perMachine: true → install into C:\Program Files\Project Guardian\
    //                    and register under HKLM (visible to all users / admins)
    // perMachine: false → install into %LOCALAPPDATA%\Programs\Project Guardian\
    //                     registered under HKCU (no UAC prompt)
    //
    // We default to per-machine (Program Files) so the app appears as a
    // system-level installation.  Set to false for a no-UAC build.
    perMachine: true,

    // Allow the user to change the installation directory in the wizard.
    allowToChangeInstallationDirectory: true,

    // Default install directory — Program Files\Project Guardian
    // When perMachine:true this expands to the correct %ProgramFiles% path.
    // electron-builder substitutes $INSTDIR with this value.
    //
    // Note: electron-builder automatically prepends $PROGRAMFILES64 when
    // perMachine:true and arch:x64, so the effective default is already
    // C:\Program Files\Project Guardian.  The setting below makes it explicit.
    installerSidebar: null,           // use default sidebar image
    installerHeader:  null,           // use default header image

    // ── Shortcuts ────────────────────────────────────────────────────────────
    createDesktopShortcut:    true,
    createStartMenuShortcut:  true,
    menuCategory:             'Project Guardian',    // Start Menu folder name

    // ── Uninstall behaviour ──────────────────────────────────────────────────
    // deleteAppDataOnUninstall: false — AppData is handled by our custom
    // NSIS script which gives the user the choice.  Never blindly delete.
    deleteAppDataOnUninstall: false,

    // ── Custom NSIS include ──────────────────────────────────────────────────
    // Adds the two-option uninstall page (keep data vs full wipe) and writes
    // the extra registry values for proper Windows "Installed Apps" display.
    include: 'infra/installer/uninstall-helper.nsh',

    // ── Installer display strings ────────────────────────────────────────────
    license: null,                    // set to a .txt path to show EULA page
  },

  // ══════════════════════════════════════════════════════════════════════════
  // macOS
  // ══════════════════════════════════════════════════════════════════════════
  mac: {
    target:   [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    category: 'public.app-category.developer-tools',
    icon:     'build/icon.icns',
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
    icon:     'build/icon.png',
  },
};
