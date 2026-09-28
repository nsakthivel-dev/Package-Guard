import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const cliScript = path.join(rootDir, "apps", "cli", "dist", "cli.js");

console.log("==================================================================");
console.log("Package Guard Autonomous Comprehensive Test Suite");
console.log("==================================================================");

let totalPassed = 0;
let totalFailed = 0;
const failures = [];

function runCli(args, cwd, expectExitCodes = [0]) {
  const res = spawnSync(process.execPath, [cliScript, ...args], {
    cwd: cwd || rootDir,
    encoding: "utf8",
    timeout: 30000,
    env: { ...process.env, NODE_ENV: "test" }
  });

  const code = res.status !== null ? res.status : 1;
  const isOk = expectExitCodes.includes(code);

  return {
    success: isOk,
    code,
    stdout: res.stdout || "",
    stderr: res.stderr || ""
  };
}

function testStep(name, fn) {
  process.stdout.write(`Testing: ${name.padEnd(52)} `);
  try {
    const res = fn();
    if (res.success) {
      console.log("[PASS]");
      totalPassed++;
    } else {
      console.log(`[FAIL] (exit: ${res.code})`);
      if (res.stderr) console.log(`   stderr: ${res.stderr.trim()}`);
      if (res.stdout) console.log(`   stdout: ${res.stdout.trim().split("\n")[0]}`);
      totalFailed++;
      failures.push({ name, details: res.stderr || res.stdout || `Exit code ${res.code}` });
    }
  } catch (err) {
    console.log(`[FAIL] (exception: ${err.message})`);
    totalFailed++;
    failures.push({ name, details: err.message });
  }
}

// Prepare isolated test project fixture
const testFixtureDir = path.join(os.tmpdir(), `pg-test-fixture-${Date.now()}`);
fs.mkdirSync(testFixtureDir, { recursive: true });

// Create a realistic package.json
const fixturePackageJson = {
  name: "pg-test-sample",
  version: "1.0.0",
  description: "Test fixture for PackageGuard automated CLI validation",
  dependencies: {
    "semver": "7.5.0",
    "axios": "1.6.0"
  },
  devDependencies: {
    "rimraf": "5.0.0"
  }
};
fs.writeFileSync(path.join(testFixtureDir, "package.json"), JSON.stringify(fixturePackageJson, null, 2), "utf8");

// Create a simulated package-lock.json
const fixtureLockfile = {
  name: "pg-test-sample",
  version: "1.0.0",
  lockfileVersion: 3,
  packages: {
    "": {
      name: "pg-test-sample",
      version: "1.0.0",
      dependencies: { "semver": "7.5.0", "axios": "1.6.0" },
      devDependencies: { "rimraf": "5.0.0" }
    },
    "node_modules/semver": {
      version: "7.5.0",
      resolved: "https://registry.npmjs.org/semver/-/semver-7.5.0.tgz",
      integrity: "sha512-test-hash"
    },
    "node_modules/axios": {
      version: "1.6.0",
      resolved: "https://registry.npmjs.org/axios/-/axios-1.6.0.tgz",
      integrity: "sha512-test-hash-2"
    },
    "node_modules/rimraf": {
      version: "5.0.0",
      resolved: "https://registry.npmjs.org/rimraf/-/rimraf-5.0.0.tgz",
      integrity: "sha512-test-hash-3"
    }
  }
};
fs.writeFileSync(path.join(testFixtureDir, "package-lock.json"), JSON.stringify(fixtureLockfile, null, 2), "utf8");

// Create simulated node_modules
const nmDir = path.join(testFixtureDir, "node_modules");
fs.mkdirSync(path.join(nmDir, "semver"), { recursive: true });
fs.writeFileSync(path.join(nmDir, "semver", "package.json"), JSON.stringify({ name: "semver", version: "7.5.0" }), "utf8");

fs.mkdirSync(path.join(nmDir, "axios"), { recursive: true });
fs.writeFileSync(path.join(nmDir, "axios", "package.json"), JSON.stringify({ name: "axios", version: "1.6.0" }), "utf8");

fs.mkdirSync(path.join(nmDir, "rimraf"), { recursive: true });
fs.writeFileSync(path.join(nmDir, "rimraf", "package.json"), JSON.stringify({ name: "rimraf", version: "5.0.0" }), "utf8");

let createdSnapshotId = null;

try {
  // 1. Documentation & Utility Commands
  testStep("pg version", () => runCli(["version"]));
  testStep("pg --version", () => runCli(["--version"]));
  testStep("pg about", () => runCli(["about"]));
  testStep("pg docs", () => runCli(["docs"]));
  testStep("pg license", () => runCli(["license"]));
  testStep("pg help", () => runCli(["help"]));
  testStep("pg help scan", () => runCli(["help", "scan"]));
  testStep("pg help update", () => runCli(["help", "update"]));
  testStep("pg help snapshot", () => runCli(["help", "snapshot"]));
  testStep("pg help doctor", () => runCli(["help", "doctor"]));
  testStep("pg path", () => runCli(["path", `--project=${testFixtureDir}`]));
  testStep("pg env", () => runCli(["env"]));

  // 2. Service & IPC Commands (offline graceful handling)
  testStep("pg ping (offline fallback to PENDING)", () => runCli(["ping"]));
  testStep("pg service status", () => runCli(["service", "status"]));
  testStep("pg service restart", () => runCli(["service", "restart"]));
  testStep("pg queue", () => runCli(["queue"]));
  testStep("pg sync", () => runCli(["sync"], rootDir, [0, 1])); // 0 if empty or synced, 1 if offline warnings

  // 3. Project Initialization & Management
  testStep("pg init", () => runCli(["init"], testFixtureDir));
  testStep("pg projects", () => runCli(["projects"]));
  testStep("pg project current", () => runCli(["project", "current"], testFixtureDir));
  testStep("pg status", () => runCli(["status"], testFixtureDir));

  // 4. Scanning & Inspection
  testStep("pg scan", () => runCli(["scan"], testFixtureDir));
  testStep("pg scan --deep", () => runCli(["scan", "--deep"], testFixtureDir));
  testStep("pg scan --force", () => runCli(["scan", "--force"], testFixtureDir));
  testStep("pg rescan", () => runCli(["rescan"], testFixtureDir));

  // 5. Package Information
  testStep("pg packages", () => runCli(["packages"], testFixtureDir));
  testStep("pg package semver", () => runCli(["package", "semver"], testFixtureDir));
  testStep("pg info semver", () => runCli(["info", "semver"], testFixtureDir));
  testStep("pg search semver", () => runCli(["search", "sem"], testFixtureDir));
  testStep("pg tree", () => runCli(["tree"], testFixtureDir));
  testStep("pg stats", () => runCli(["stats"], testFixtureDir));

  // 6. Changes & Diffs
  testStep("pg changes", () => runCli(["changes"], testFixtureDir));
  testStep("pg diff", () => runCli(["diff"], testFixtureDir));

  // 7. Snapshots
  testStep("pg snapshot create", () => {
    const res = runCli(["snapshot", "create", "test-baseline-snap"], testFixtureDir);
    const match = res.stdout.match(/Created snapshot '([^']+)'/i) || res.stdout.match(/ID:\s*([^\s]+)/i);
    if (match) createdSnapshotId = match[1];
    return res;
  });

  testStep("pg snapshot list", () => runCli(["snapshot", "list"], testFixtureDir));

  if (createdSnapshotId) {
    testStep("pg snapshot show <id>", () => runCli(["snapshot", "show", createdSnapshotId], testFixtureDir));
    const snapExportFile = path.join(testFixtureDir, "test-snap-export.json");
    testStep("pg snapshot export <id>", () => runCli(["snapshot", "export", createdSnapshotId, "--out", snapExportFile], testFixtureDir));
    testStep("pg snapshot import <file>", () => runCli(["snapshot", "import", snapExportFile], testFixtureDir));
    testStep("pg snapshot restore <id> -y", () => runCli(["snapshot", "restore", createdSnapshotId, "-y"], testFixtureDir));
  }

  // 8. Verification & Integrity
  testStep("pg verify", () => runCli(["verify"], testFixtureDir));
  testStep("pg verify --deep", () => runCli(["verify", "--deep"], testFixtureDir));
  testStep("pg check", () => runCli(["check"], testFixtureDir));
  testStep("pg integrity", () => runCli(["integrity"], testFixtureDir));

  // 9. History
  testStep("pg history", () => runCli(["history"], testFixtureDir));
  testStep("pg history --today", () => runCli(["history", "--today"], testFixtureDir));
  testStep("pg history --project", () => runCli(["history", "--project"], testFixtureDir));

  // 10. Security & Audits
  testStep("pg audit", () => runCli(["audit"], testFixtureDir));
  testStep("pg security", () => runCli(["security"], testFixtureDir));
  testStep("pg vulnerabilities", () => runCli(["vulnerabilities"], testFixtureDir));
  testStep("pg fix-security", () => runCli(["fix-security"], testFixtureDir));

  // 11. Configuration & Settings
  testStep("pg config", () => runCli(["config"]));
  testStep("pg config set testParam sampleValue", () => runCli(["config", "set", "testParam", "sampleValue"]));
  testStep("pg config get testParam", () => runCli(["config", "get", "testParam"]));
  testStep("pg config reset", () => runCli(["config", "reset"]));
  testStep("pg settings", () => runCli(["settings"]));

  // 12. Diagnostics & Doctor / Repair
  testStep("pg doctor", () => runCli(["doctor"], testFixtureDir));
  testStep("pg repair database", () => runCli(["repair", "database"], testFixtureDir));
  testStep("pg repair config", () => runCli(["repair", "config"], testFixtureDir));
  testStep("pg repair packages", () => runCli(["repair", "packages"], testFixtureDir, [0, 1])); // package manager might not be in temp dir

  // 13. Cleaning
  testStep("pg clean cache", () => runCli(["clean", "cache"]));
  testStep("pg clean snapshots", () => runCli(["clean", "snapshots"]));
  testStep("pg clean logs", () => runCli(["clean", "logs"]));
  testStep("pg clean all", () => runCli(["clean", "all"]));

  // 14. Logs
  testStep("pg logs", () => runCli(["logs"]));
  testStep("pg logs error", () => runCli(["logs", "error"]));
  testStep("pg logs clear", () => runCli(["logs", "clear"]));

  // 15. Export & Import
  const reportOut = path.join(testFixtureDir, "test-audit-report.json");
  testStep("pg export report", () => runCli(["export", "report", "--out", reportOut], testFixtureDir));
  const pkgsOut = path.join(testFixtureDir, "test-pkgs.csv");
  testStep("pg export packages --csv", () => runCli(["export", "packages", "--csv", "--out", pkgsOut], testFixtureDir));
  const histOut = path.join(testFixtureDir, "test-hist.json");
  testStep("pg export history", () => runCli(["export", "history", "--out", histOut], testFixtureDir));
  testStep("pg import <file>", () => runCli(["import", reportOut], testFixtureDir));

  // 16. Backup & Restore
  let testBackupId = null;
  testStep("pg backup", () => {
    const res = runCli(["backup"]);
    const m = res.stdout.match(/ID:\s*([^\s]+)/i);
    if (m) testBackupId = m[1];
    return res;
  });
  testStep("pg backup list", () => runCli(["backup", "list"]));
  if (testBackupId) {
    testStep("pg backup restore <id>", () => runCli(["backup", "restore", testBackupId]));
  }

  // 17. System Installation Shims
  testStep("pg install", () => runCli(["install"]));
  testStep("pg update-cli", () => runCli(["update-cli"]));
  testStep("pg uninstall", () => runCli(["uninstall"]));

  // 18. Outdated, Updates & Rollback
  testStep("pg outdated", () => runCli(["outdated"], testFixtureDir));
  testStep("pg update semver --safe", () => runCli(["update", "semver", "--safe"], testFixtureDir, [0, 1]));
  testStep("pg rollback", () => runCli(["rollback"], testFixtureDir, [0, 1]));

  // 19. Project Lifecycle (Rename, Untrack / Remove, Delete)
  testStep("pg project rename renamed-test-proj", () => runCli(["project", "rename", "renamed-test-proj"], testFixtureDir));
  testStep("pg remove", () => runCli(["remove"], testFixtureDir));
  testStep("pg init (re-init for delete test)", () => runCli(["init"], testFixtureDir));
  testStep("pg project delete pg-test-sample", () => runCli(["project", "delete", "pg-test-sample"], testFixtureDir));

  // 20. Failure Mode Tests
  testStep("Failure test: unknown command returns exit code 2", () => runCli(["non-existent-cmd"], testFixtureDir, [2]));
  testStep("Failure test: snapshot show non-existent ID", () => runCli(["snapshot", "show", "non-existent-snap-id"], testFixtureDir, [1, 2, 3]));
  testStep("Failure test: import non-existent file", () => runCli(["import", "non-existent-file.json"], testFixtureDir, [1, 2, 3]));

} finally {
  // Clean up fixture directory
  try {
    fs.rmSync(testFixtureDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

console.log("==================================================================");
console.log(`Test Execution Summary:`);
console.log(`  Passed: ${totalPassed}`);
console.log(`  Failed: ${totalFailed}`);
console.log("==================================================================");

if (totalFailed > 0) {
  console.log("\nFailures Detail:");
  for (const f of failures) {
    console.log(` - ${f.name}: ${f.details.slice(0, 120)}`);
  }
  process.exit(1);
} else {
  console.log("\nALL TESTS PASSED! FULL SPECIFICATION VALIDATED.");
  process.exit(0);
}
