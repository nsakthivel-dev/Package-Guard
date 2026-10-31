import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";
import {
  getAppDataDir,
  getDbPath,
  getSnapshotStorageDir,
  getLogsDir,
  getConfigDir
} from "@package-guard/shared/paths";

export function getTargetShimPaths(): { preferredDir: string; shimPath: string; isWin: boolean } {
  const isWin = process.platform === "win32";
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const winAppsDir = path.join(localAppData, "Microsoft", "WindowsApps");

  let preferredDir: string;
  if (isWin && fs.existsSync(winAppsDir)) {
    preferredDir = winAppsDir;
  } else {
    preferredDir = path.join(getAppDataDir(), "bin");
  }

  fs.mkdirSync(preferredDir, { recursive: true });
  const shimPath = path.join(preferredDir, isWin ? "pg.cmd" : "pg");

  return { preferredDir, shimPath, isWin };
}

export function getCliScriptPath(): string {
  // apps/cli/dist/cli.js
  const devPath = path.resolve(__dirname, "..", "cli.js");
  if (fs.existsSync(devPath)) return devPath;

  const rootCandidate = path.resolve(__dirname, "..", "..", "dist", "cli.js");
  if (fs.existsSync(rootCandidate)) return rootCandidate;

  return devPath;
}

export function installCliShim(): { success: boolean; installedAt: string; message: string } {
  const { preferredDir, shimPath, isWin } = getTargetShimPaths();
  const cliScript = getCliScriptPath();
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const programCliShim = path.join(localAppData, "Programs", "PackageGuardian", "cli", isWin ? "pg.cmd" : "pg");

  try {
    if (isWin) {
      const content = `@echo off\r\nnode "${cliScript}" %*\r\n`;
      fs.writeFileSync(shimPath, content, "utf8");
      if (fs.existsSync(path.dirname(programCliShim))) {
        try { fs.writeFileSync(programCliShim, content, "utf8"); } catch {}
      }
    } else {
      const content = `#!/usr/bin/env bash\nexec node "${cliScript}" "$@"\n`;
      fs.writeFileSync(shimPath, content, { encoding: "utf8", mode: 0o755 });
      if (fs.existsSync(path.dirname(programCliShim))) {
        try { fs.writeFileSync(programCliShim, content, { encoding: "utf8", mode: 0o755 }); } catch {}
      }
    }

    return {
      success: true,
      installedAt: shimPath,
      message: `CLI shim installed successfully to ${shimPath}`
    };
  } catch (err) {
    throw new Error(`Failed to install CLI shim: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function uninstallCliShim(): { success: boolean; uninstalledPaths: string[]; userStoragePreserved: boolean } {
  const uninstalledPaths: string[] = [];
  const isWin = process.platform === "win32";
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = [
    path.join(localAppData, "Microsoft", "WindowsApps", "pg.cmd"),
    path.join(localAppData, "Microsoft", "WindowsApps", "pg.bat"),
    path.join(localAppData, "Programs", "PackageGuardian", "cli", "pg.cmd"),
    path.join(localAppData, "Programs", "PackageGuardian", "cli", "pg.bat"),
    path.join(localAppData, "Programs", "PackageGuard", "cli", "pg.cmd"),
    path.join(localAppData, "Programs", "PackageGuard", "cli", "pg.bat"),
    path.join(getAppDataDir(), "bin", isWin ? "pg.cmd" : "pg"),
    path.join(os.homedir(), ".local", "bin", "pg")
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        fs.unlinkSync(c);
        uninstalledPaths.push(c);
      } catch {
        // ignore
      }
    }
  }

  return {
    success: true,
    uninstalledPaths,
    userStoragePreserved: true // User SQLite data, snapshots, and configuration are always preserved
  };
}

export function getSystemPaths(projectDir?: string): Record<string, string> {
  const appData = getAppDataDir();
  return {
    cliScript: getCliScriptPath(),
    appDataDirectory: appData,
    database: getDbPath(),
    snapshots: getSnapshotStorageDir(),
    logs: getLogsDir(),
    config: getConfigDir(),
    projectDirectory: projectDir || process.cwd()
  };
}

const ALLOWED_TOOLS = new Set(["npm", "pnpm", "yarn", "bun", "pip", "python", "node"]);

function checkToolVersion(cmd: string): string | null {
  if (!ALLOWED_TOOLS.has(cmd)) {
    return null;
  }
  try {
    const isWin = process.platform === "win32";
    const executable = isWin && (cmd === "npm" || cmd === "pnpm" || cmd === "yarn") ? `${cmd}.cmd` : cmd;
    const out = execFileSync(executable, ["--version"], {
      encoding: "utf8",
      timeout: 2000,
      shell: isWin,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out.split("\n")[0] || null;
  } catch {
    return null;
  }
}

export function getEnvironmentDetails(): {
  os: string;
  arch: string;
  nodeVersion: string;
  packageManagers: Record<string, string | null>;
  appDataRoot: string;
} {
  return {
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    nodeVersion: process.version,
    packageManagers: {
      npm: checkToolVersion("npm"),
      pnpm: checkToolVersion("pnpm"),
      yarn: checkToolVersion("yarn"),
      bun: checkToolVersion("bun"),
      python: checkToolVersion("python"),
      pip: checkToolVersion("pip")
    },
    appDataRoot: getAppDataDir()
  };
}
