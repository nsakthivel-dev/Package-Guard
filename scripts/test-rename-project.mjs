import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const cliScript = path.join(rootDir, "apps", "cli", "dist", "cli.js");

console.log("==================================================================");
console.log("PackageGuard Rename Project Comprehensive Verification Test Suite");
console.log("==================================================================");

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`);
    totalPassed++;
  } else {
    console.error(`[FAIL] ${message}`);
    totalFailed++;
  }
}

// 1. Test validateProjectName logic
const { validateProjectName } = await import(pathToFileURL(path.join(rootDir, "packages", "shared", "dist", "utils", "index.js")).href);

const existingProjects = [
  { id: "proj-1", name: "AlphaProject" },
  { id: "proj-2", name: "BetaService" }
];

console.log("\n--- Testing Name Validation ---");

// Test: Empty
assert(validateProjectName("", "AlphaProject", existingProjects).valid === false, "Rejects empty string");
assert(validateProjectName("   ", "AlphaProject", existingProjects).valid === false, "Rejects whitespace-only string");

// Test: Invalid characters
assert(validateProjectName("Alpha/Project", "AlphaProject", existingProjects).valid === false, "Rejects forward slash '/'");
assert(validateProjectName("Alpha\\Project", "AlphaProject", existingProjects).valid === false, "Rejects backslash '\\'");
assert(validateProjectName("Alpha:Project", "AlphaProject", existingProjects).valid === false, "Rejects colon ':'");
assert(validateProjectName("Alpha*Project", "AlphaProject", existingProjects).valid === false, "Rejects asterisk '*'");
assert(validateProjectName("Alpha?Project", "AlphaProject", existingProjects).valid === false, "Rejects question mark '?'");
assert(validateProjectName("Alpha\"Project", "AlphaProject", existingProjects).valid === false, "Rejects quote '\"'");
assert(validateProjectName("Alpha<Project", "AlphaProject", existingProjects).valid === false, "Rejects '<'");
assert(validateProjectName("Alpha>Project", "AlphaProject", existingProjects).valid === false, "Rejects '>'");
assert(validateProjectName("Alpha|Project", "AlphaProject", existingProjects).valid === false, "Rejects '|'");

// Test: Identical name
const identicalResult = validateProjectName("AlphaProject", "AlphaProject", existingProjects);
assert(identicalResult.valid === false && identicalResult.isIdentical === true, "Flags identical name as isIdentical");

const trimmedIdenticalResult = validateProjectName("  AlphaProject  ", "AlphaProject", existingProjects);
assert(trimmedIdenticalResult.valid === false && trimmedIdenticalResult.isIdentical === true, "Flags trimmed identical name as isIdentical");

// Test: Duplicate name (case-insensitive)
const dupResult1 = validateProjectName("BetaService", "AlphaProject", existingProjects);
assert(dupResult1.valid === false && dupResult1.error.includes("already exists"), "Rejects duplicate name with other project");

const dupResult2 = validateProjectName("betaservice", "AlphaProject", existingProjects);
assert(dupResult2.valid === false && dupResult2.error.includes("already exists"), "Rejects duplicate name case-insensitively");

// Test: Valid new name
const validResult = validateProjectName("  GammaApp-v2  ", "AlphaProject", existingProjects);
assert(validResult.valid === true && validResult.name === "GammaApp-v2", "Accepts and trims valid new name");

// 2. Test database layer renameProject
console.log("\n--- Testing Database Layer Rename ---");
const { openDatabase } = await import(pathToFileURL(path.join(rootDir, "packages", "shared", "dist", "db.js")).href);
const {
  upsertProject,
  getProjectById,
  renameProject,
  listProjects,
  insertSnapshot,
  listSnapshotsForProject,
  insertHistory,
  listHistory
} = await import(pathToFileURL(path.join(rootDir, "packages", "shared", "dist", "repository.js")).href);

// Use an isolated in-memory or temp SQLite DB
const tempDbPath = path.join(os.tmpdir(), `pg-test-rename-db-${Date.now()}.db`);
const db = openDatabase(tempDbPath);

const originalProject = {
  id: "test-proj-uuid-1234",
  name: "InitialProjectName",
  path: path.join(os.tmpdir(), "initial-project"),
  packageManager: "npm",
  isDefault: 0,
  createdAt: Date.now(),
  lastScanAt: Date.now()
};
upsertProject(db, originalProject);

// Insert a snapshot and history event for this project
const snapshotId = "snap-test-uuid";
insertSnapshot(db, {
  id: snapshotId,
  projectId: originalProject.id,
  name: "pre-rename snapshot",
  fileCount: 1,
  packageCount: 15,
  manifestJson: JSON.stringify({ packages: {} })
});

insertHistory(db, {
  id: "hist-test-uuid",
  projectId: originalProject.id,
  eventType: "SCAN",
  description: "Initial scan of project",
  detailsJson: JSON.stringify({ summary: "Initial scan" })
});

// Verify records exist
let fetchedProj = getProjectById(db, originalProject.id);
assert(fetchedProj.name === "InitialProjectName", "Initial project inserted correctly");

// Perform database rename
const renameSuccess = renameProject(db, originalProject.id, "RenamedProjectName");
assert(renameSuccess === true, "renameProject returns true");

// Verify project record after rename
fetchedProj = getProjectById(db, originalProject.id);
assert(fetchedProj.id === "test-proj-uuid-1234", "Project ID remains identical (not regenerated)");
assert(fetchedProj.name === "RenamedProjectName", "Project name updated to RenamedProjectName");
assert(fetchedProj.path === originalProject.path, "Project filesystem path is unchanged");

// Verify snapshots association after rename
const snaps = listSnapshotsForProject(db, originalProject.id);
assert(snaps.length === 1 && snaps[0].id === snapshotId, "Existing snapshots remain associated with project ID");

// Verify history association after rename
const hist = listHistory(db, { projectId: originalProject.id });
assert(hist.length === 1 && hist[0].project_id === originalProject.id, "Existing scan history remains associated with project ID");

db.close();
try { fs.unlinkSync(tempDbPath); } catch {}

// 3. Test CLI Rename command on fixture project
console.log("\n--- Testing CLI Rename Command ---");
const testFixtureDir = path.join(os.tmpdir(), `pg-cli-rename-fixture-${Date.now()}`);
fs.mkdirSync(testFixtureDir, { recursive: true });
fs.writeFileSync(path.join(testFixtureDir, "package.json"), JSON.stringify({
  name: "cli-rename-test",
  version: "1.0.0",
  dependencies: { "lodash": "^4.17.21" }
}, null, 2), "utf8");

// Init project
const initRes = spawnSync(process.execPath, [cliScript, "init", "--yes"], {
  cwd: testFixtureDir,
  encoding: "utf8",
  env: { ...process.env, NODE_ENV: "test" }
});
assert(initRes.status === 0, "CLI init succeeds");

// Read initial config
const configPath = path.join(testFixtureDir, ".packageguard", "config.json");
assert(fs.existsSync(configPath), ".packageguard/config.json exists");
const initialConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const initialId = initialConfig.id;

// Attempt invalid rename via CLI (empty name)
const emptyRename = spawnSync(process.execPath, [cliScript, "project", "rename", ""], {
  cwd: testFixtureDir,
  encoding: "utf8",
  env: { ...process.env, NODE_ENV: "test" }
});
assert(emptyRename.status !== 0, "CLI rejects empty rename argument");

// Attempt invalid characters rename via CLI
const invalidRename = spawnSync(process.execPath, [cliScript, "project", "rename", "invalid/name"], {
  cwd: testFixtureDir,
  encoding: "utf8",
  env: { ...process.env, NODE_ENV: "test" }
});
assert(invalidRename.status !== 0, "CLI rejects invalid characters in rename");

// Perform valid rename via CLI
const brandNewName = "BrandNewProjectName_" + Date.now();
const validRename = spawnSync(process.execPath, [cliScript, "project", "rename", brandNewName], {
  cwd: testFixtureDir,
  encoding: "utf8",
  env: { ...process.env, NODE_ENV: "test" }
});
assert(validRename.status === 0, `CLI rename succeeds: ${validRename.stdout.trim()}`);

// Verify config.json after rename
const updatedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
assert(updatedConfig.id === initialId, "Project ID in config.json is preserved");
assert(updatedConfig.name === brandNewName, `Project name in config.json is updated to ${brandNewName}`);

// Test CLI project rename with target identifier
const anotherName = "AnotherProjectName_" + (Date.now() + 1);
const targetRename = spawnSync(process.execPath, [cliScript, "project", "rename", initialId, anotherName], {
  cwd: testFixtureDir,
  encoding: "utf8",
  env: { ...process.env, NODE_ENV: "test" }
});
assert(targetRename.status === 0, `CLI rename with target ID succeeds: ${targetRename.stdout.trim()}`);

const finalConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
assert(finalConfig.id === initialId, "Project ID preserved after target rename");
assert(finalConfig.name === anotherName, `Project name updated to ${anotherName}`);

// Clean up fixture tracking and files
try {
  spawnSync(process.execPath, [cliScript, "project", "delete", initialId], {
    cwd: testFixtureDir,
    encoding: "utf8",
    env: { ...process.env, NODE_ENV: "test" }
  });
} catch {}
try { fs.rmSync(testFixtureDir, { recursive: true, force: true }); } catch {}

console.log("\n==================================================================");
console.log(`Summary: Passed: ${totalPassed}, Failed: ${totalFailed}`);
console.log("==================================================================");

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
