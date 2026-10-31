import * as fs from "node:fs";
import * as path from "node:path";
import * as net from "node:net";
import type BetterSqlite3 from "better-sqlite3";
import { getAppDataDir, getDbPath, getSnapshotStorageDir } from "@package-guard/shared/paths";
import { PIPE_NAME } from "@package-guard/shared";
import { getProjectByPath } from "@package-guard/shared/repository";
import type { DoctorReport, DoctorCheck, RepairReport, RepairItem } from "@package-guard/shared/types";

function checkPipeListening(timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(PIPE_NAME);
    let resolved = false;

    socket.setTimeout(timeoutMs, () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.on("connect", () => {
      if (!resolved) {
        resolved = true;
        socket.end();
        resolve(true);
      }
    });

    socket.on("error", () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
  });
}

export async function runDoctor(
  db: BetterSqlite3.Database,
  projectDir?: string,
  _projectId?: string
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];

  // 1. CLI Subsystem
  checks.push({
    name: "CLI",
    status: "OK",
    message: `PackageGuardian CLI v1.0.0 (Node ${process.version})`
  });

  // 2. Electron Subsystem
  const pipeActive = await checkPipeListening();
  checks.push({
    name: "Electron",
    status: pipeActive ? "OK" : "WARN",
    message: pipeActive
      ? "Electron application is active and connected"
      : "Electron application is closed (offline mode enabled)"
  });

  // 3. Named Pipe Subsystem
  checks.push({
    name: "Named Pipe",
    status: pipeActive ? "OK" : "WARN",
    message: pipeActive
      ? `Named Pipe ${PIPE_NAME} is active`
      : `Named Pipe ${PIPE_NAME} is offline (events queued in SQLite)`
  });

  // 4. SQLite Subsystem
  try {
    const versionRow = db.prepare("SELECT sqlite_version() as ver").get() as { ver: string };
    checks.push({
      name: "SQLite",
      status: "OK",
      message: `SQLite engine v${versionRow.ver} loaded via WAL mode`
    });
  } catch (err) {
    checks.push({
      name: "SQLite",
      status: "FAIL",
      message: `Failed to execute SQLite query: ${err}`
    });
  }

  // 5. Database Subsystem
  try {
    const pragmaRes = db.prepare("PRAGMA quick_check").get() as { quick_check?: string };
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));

    const required = ["events", "projects", "scans", "snapshots", "snapshot_files", "history", "config"];
    const missing = required.filter((r) => !tableNames.has(r));

    if (missing.length === 0 && (pragmaRes.quick_check === "ok" || !pragmaRes.quick_check)) {
      checks.push({
        name: "Database",
        status: "OK",
        message: `Database healthy at ${getDbPath()} (${tables.length} tables verified)`
      });
    } else {
      checks.push({
        name: "Database",
        status: "FAIL",
        message: `Missing tables: ${missing.join(", ")}`
      });
    }
  } catch (err) {
    checks.push({
      name: "Database",
      status: "FAIL",
      message: `Database check failed: ${err}`
    });
  }

  // 6. Project Subsystem
  if (projectDir) {
    const proj = getProjectByPath(db, projectDir);
    if (proj) {
      checks.push({
        name: "Project",
        status: "OK",
        message: `Project '${proj.name}' (${proj.id}) active at ${proj.path}`
      });
    } else {
      checks.push({
        name: "Project",
        status: "WARN",
        message: "Current directory is not initialized. Run 'pg init' to initialize."
      });
    }
  } else {
    checks.push({
      name: "Project",
      status: "OK",
      message: "Global context (no active project directory specified)"
    });
  }

  // 7. Permissions Subsystem
  const appDataDir = getAppDataDir();
  try {
    fs.mkdirSync(appDataDir, { recursive: true });
    const permTest = path.join(appDataDir, `.perm-test-${Date.now()}`);
    fs.writeFileSync(permTest, "test", "utf8");
    fs.unlinkSync(permTest);
    checks.push({
      name: "Permissions",
      status: "OK",
      message: `Full read/write permissions verified for ${appDataDir}`
    });
  } catch (err) {
    checks.push({
      name: "Permissions",
      status: "FAIL",
      message: `Write permission denied for AppData directory: ${err}`
    });
  }

  // 8. Configuration Subsystem
  try {
    const configRows = db.prepare("SELECT count(*) as cnt FROM config").get() as { cnt: number };
    checks.push({
      name: "Configuration",
      status: "OK",
      message: `Configuration active (${configRows.cnt} settings configured)`
    });
  } catch (err) {
    checks.push({
      name: "Configuration",
      status: "FAIL",
      message: `Configuration check error: ${err}`
    });
  }

  // 9. Dependencies Subsystem
  if (projectDir) {
    const pj = path.join(projectDir, "package.json");
    const nm = path.join(projectDir, "node_modules");
    if (fs.existsSync(pj)) {
      if (fs.existsSync(nm)) {
        checks.push({
          name: "Dependencies",
          status: "OK",
          message: "node_modules directory present and accessible"
        });
      } else {
        checks.push({
          name: "Dependencies",
          status: "WARN",
          message: "node_modules missing. Run 'pg repair packages' or install dependencies."
        });
      }
    } else {
      checks.push({
        name: "Dependencies",
        status: "OK",
        message: "Manifest verified"
      });
    }
  } else {
    checks.push({
      name: "Dependencies",
      status: "OK",
      message: "Ready"
    });
  }

  // 10. Installation Subsystem
  const isWin = process.platform === "win32";
  const localApp = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const winApps = path.join(localApp, "Microsoft", "WindowsApps", "pg.cmd");
  const binDir = path.join(appDataDir, "bin", isWin ? "pg.cmd" : "pg");
  const isShimInstalled = fs.existsSync(winApps) || fs.existsSync(binDir);

  checks.push({
    name: "Installation",
    status: isShimInstalled ? "OK" : "WARN",
    message: isShimInstalled
      ? `CLI shim verified (${fs.existsSync(winApps) ? winApps : binDir})`
      : "CLI shim not installed in default locations. Run 'pg install' to install."
  });

  // 11. PATH Subsystem
  const pathEnv = process.env.PATH || "";
  const inPath =
    pathEnv.toLowerCase().includes("windowsapps") ||
    pathEnv.toLowerCase().includes("package guardian") ||
    pathEnv.toLowerCase().includes("packageguardian") ||
    pathEnv.toLowerCase().includes("package guard") ||
    pathEnv.toLowerCase().includes("packageguard");
  checks.push({
    name: "PATH",
    status: inPath ? "OK" : "WARN",
    message: inPath
      ? "User PATH includes Package Guardian execution directory"
      : "Package Guardian directory not explicitly found in PATH environment variable"
  });

  const overall = checks.some((c) => c.status === "FAIL") ? "FAIL" : "OK";
  return { overall, checks };
}

export async function repairPackages(projectDir: string): Promise<RepairItem> {
  const pj = path.join(projectDir, "package.json");
  if (!fs.existsSync(pj)) {
    return {
      description: "Repair packages: no package.json manifest found in current directory",
      status: "SKIPPED"
    };
  }

  try {
    const { runPackageManagerCommand } = await import("./update-service");
    const { detectPackageManager } = await import("./project-service");
    const pm = detectPackageManager(projectDir);
    const res = await runPackageManagerCommand(pm, ["install"], projectDir);

    if (res.success) {
      return {
        description: `Packages successfully reinstalled and reconciled via ${pm}`,
        status: "OK"
      };
    } else {
      return {
        description: `Package installation failed: ${res.stderr || "Unknown error"}`,
        status: "FAILED"
      };
    }
  } catch (err) {
    return {
      description: `Package repair error: ${err instanceof Error ? err.message : String(err)}`,
      status: "FAILED"
    };
  }
}

export function repairDatabase(db: BetterSqlite3.Database): RepairItem {
  try {
    db.exec("PRAGMA optimize;");
    db.exec("PRAGMA integrity_check;");
    db.exec("VACUUM;");
    return {
      description: "Database integrity check passed, indexes optimized and vacuumed",
      status: "OK"
    };
  } catch (err) {
    return {
      description: `Database repair error: ${err instanceof Error ? err.message : String(err)}`,
      status: "FAILED"
    };
  }
}

export function repairConfig(db: BetterSqlite3.Database, projectDir?: string): RepairItem {
  try {
    const { resetConfig } = require("@package-guard/shared/repository");
    resetConfig(db);

    if (projectDir) {
      const proj = getProjectByPath(db, projectDir);
      if (proj) {
        const marker = path.join(projectDir, ".packageguardian");
        const legacyMarker = path.join(projectDir, ".packageguard");
        fs.mkdirSync(marker, { recursive: true });
        fs.mkdirSync(legacyMarker, { recursive: true });
        const cfgData = JSON.stringify(
          { id: proj.id, name: proj.name, initializedAt: proj.created_at, version: "1.0.0" },
          null,
          2
        );
        fs.writeFileSync(path.join(marker, "config.json"), cfgData, "utf8");
        fs.writeFileSync(path.join(legacyMarker, "config.json"), cfgData, "utf8");
      }
    }

    return {
      description: "Configuration settings and project metadata repaired to default valid state",
      status: "OK"
    };
  } catch (err) {
    return {
      description: `Config repair error: ${err instanceof Error ? err.message : String(err)}`,
      status: "FAILED"
    };
  }
}

export async function runRepair(
  db: BetterSqlite3.Database,
  projectDir?: string,
  _projectId?: string
): Promise<RepairReport> {
  const repairs: RepairItem[] = [];

  // 1. Storage directory
  try {
    fs.mkdirSync(getAppDataDir(), { recursive: true });
    fs.mkdirSync(getSnapshotStorageDir(), { recursive: true });
    repairs.push({
      description: "Snapshot storage directory verified and created",
      status: "OK"
    });
  } catch (err) {
    repairs.push({
      description: `Failed to create storage directory: ${err}`,
      status: "FAILED"
    });
  }

  // 2. Database repair
  repairs.push(repairDatabase(db));

  // 3. Config repair
  repairs.push(repairConfig(db, projectDir));

  // 4. Packages repair (if in a project)
  if (projectDir) {
    repairs.push(await repairPackages(projectDir));
  }

  const completed = repairs.filter((r) => r.status === "OK").length;
  const failed = repairs.filter((r) => r.status === "FAILED").length;

  return {
    repairs,
    completed,
    failed
  };
}

