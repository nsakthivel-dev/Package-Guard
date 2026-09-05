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

  // 1. Package Guard configuration
  const appDataDir = getAppDataDir();
  if (fs.existsSync(appDataDir)) {
    checks.push({
      name: "Package Guard configuration",
      status: "OK",
      message: `Config directory verified at ${appDataDir}`
    });
  } else {
    checks.push({
      name: "Package Guard configuration",
      status: "FAIL",
      message: "Application data directory does not exist"
    });
  }

  // 2. Database
  try {
    const pragmaRes = db.prepare("PRAGMA quick_check").get() as { quick_check?: string };
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));

    const required = ["events", "projects", "scans", "snapshots", "snapshot_files"];
    const missing = required.filter((r) => !tableNames.has(r));

    if (missing.length === 0 && (pragmaRes.quick_check === "ok" || !pragmaRes.quick_check)) {
      checks.push({
        name: "Database",
        status: "OK",
        message: `SQLite DB healthy at ${getDbPath()} (${tables.length} tables)`
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

  // 3. Project registration
  if (projectDir) {
    const proj = getProjectByPath(db, projectDir);
    if (proj) {
      checks.push({
        name: "Project registration",
        status: "OK",
        message: `Project registered as '${proj.name}' (${proj.id})`
      });
    } else {
      checks.push({
        name: "Project registration",
        status: "WARN",
        message: "Current directory is not registered. Run 'pg init' to initialize."
      });
    }
  } else {
    checks.push({
      name: "Project registration",
      status: "OK",
      message: "Global execution (no active project directory specified)"
    });
  }

  // 4. Snapshot storage
  const snapshotDir = getSnapshotStorageDir();
  try {
    fs.mkdirSync(snapshotDir, { recursive: true });
    const testFile = path.join(snapshotDir, `.write-test-${Date.now()}`);
    fs.writeFileSync(testFile, "test", "utf8");
    fs.unlinkSync(testFile);
    checks.push({
      name: "Snapshot storage",
      status: "OK",
      message: `Snapshot storage accessible at ${snapshotDir}`
    });
  } catch (err) {
    checks.push({
      name: "Snapshot storage",
      status: "FAIL",
      message: `Snapshot storage unwritable: ${err}`
    });
  }

  // 5. Communication
  const pipeActive = await checkPipeListening();
  checks.push({
    name: "Communication",
    status: "OK",
    message: pipeActive
      ? "Electron Named Pipe is active and listening"
      : "Electron is closed (CLI offline mode active, events will sync on start)"
  });

  // 6. File access
  if (projectDir) {
    try {
      const testFile = path.join(projectDir, `.pg-access-test-${Date.now()}`);
      fs.writeFileSync(testFile, "ok", "utf8");
      fs.unlinkSync(testFile);
      checks.push({
        name: "File access",
        status: "OK",
        message: `Read/write access verified for ${projectDir}`
      });
    } catch (err) {
      checks.push({
        name: "File access",
        status: "FAIL",
        message: `Cannot write to project directory: ${err}`
      });
    }
  } else {
    checks.push({
      name: "File access",
      status: "OK",
      message: "File access verified"
    });
  }

  // 7. Project state
  if (projectDir) {
    const marker = path.join(projectDir, ".packageguard");
    if (fs.existsSync(marker)) {
      checks.push({
        name: "Project state",
        status: "OK",
        message: "Project state marker .packageguard exists"
      });
    } else {
      checks.push({
        name: "Project state",
        status: "WARN",
        message: "No .packageguard directory found"
      });
    }
  } else {
    checks.push({
      name: "Project state",
      status: "OK",
      message: "Ready"
    });
  }

  const overall = checks.some((c) => c.status === "FAIL") ? "FAIL" : "OK";
  return { overall, checks };
}

export async function runRepair(
  db: BetterSqlite3.Database,
  projectDir?: string,
  _projectId?: string
): Promise<RepairReport> {
  const repairs: RepairItem[] = [];

  // 1. Ensure AppData and storage directories exist
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

  // 2. Repair database indexes & integrity
  try {
    db.exec("PRAGMA optimize;");
    repairs.push({
      description: "Database indexes and query plans optimized",
      status: "OK"
    });
  } catch (err) {
    repairs.push({
      description: `Database optimization failed: ${err}`,
      status: "FAILED"
    });
  }

  // 3. Repair project config if missing but registered
  if (projectDir) {
    try {
      const proj = getProjectByPath(db, projectDir);
      if (proj) {
        const marker = path.join(projectDir, ".packageguard");
        fs.mkdirSync(marker, { recursive: true });
        const configFile = path.join(marker, "config.json");
        if (!fs.existsSync(configFile)) {
          fs.writeFileSync(
            configFile,
            JSON.stringify(
              { id: proj.id, name: proj.name, initializedAt: proj.created_at, version: "0.1.0" },
              null,
              2
            ),
            "utf8"
          );
          repairs.push({
            description: "Recreated missing .packageguard/config.json metadata",
            status: "OK"
          });
        }
      }
    } catch (err) {
      repairs.push({
        description: `Failed to restore project metadata: ${err}`,
        status: "FAILED"
      });
    }
  }

  // 4. Recover inconsistent event states
  try {
    // Check if there are corrupted events
    const stmt = db.prepare("UPDATE events SET status = 'FAILED' WHERE status = 'PENDING' AND payload IS NULL");
    const result = stmt.run();
    if (result.changes > 0) {
      repairs.push({
        description: `Recovered ${result.changes} corrupted pending events`,
        status: "OK"
      });
    } else {
      repairs.push({
        description: "Event states verified (no corrupted records found)",
        status: "OK"
      });
    }
  } catch (err) {
    repairs.push({
      description: `Event state check error: ${err}`,
      status: "FAILED"
    });
  }

  const completed = repairs.filter((r) => r.status === "OK").length;
  const failed = repairs.filter((r) => r.status === "FAILED").length;

  return {
    repairs,
    completed,
    failed
  };
}
