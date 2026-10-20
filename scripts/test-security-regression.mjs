import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { openDatabase } from "../packages/shared/dist/db.js";
import {
  importSnapshot,
  restoreSnapshot,
  deleteSnapshot,
  createSnapshot,
  exportSnapshot
} from "../apps/cli/dist/services/snapshot-service.js";
import { getSnapshotById } from "../packages/shared/dist/repository.js";
import {
  assertSafeSnapshotId,
  assertSafeRelativePath,
  assertSafeWritePath,
} from "../packages/shared/dist/paths/path-validator.js";
import {
  escapeHtml,
  assertSafePackageName,
  assertSafePackageVersion,
  assertSafePackageManager,
  assertNoShellMetachars,
} from "../packages/shared/dist/utils/security.js";

console.log("==================================================================");
console.log("PackageGuard Security Regression Test Suite (Phases 1 - 6)");
console.log("==================================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    failed++;
  }
}

// -----------------------------------------------------------------------------
// 1. Secret Exposure Regression Tests (Phase 1)
// -----------------------------------------------------------------------------
console.log("--- 1. Secret Exposure Regression Tests (Phase 1) ---");

test("authHandler.js has no hardcoded DEFAULT_GOOGLE_CLIENT_SECRET", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "apps/desktop/main/handlers/authHandler.js"), "utf8");
  assert.ok(!content.includes("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"), "Hardcoded Google client secret still found in authHandler.js");
  assert.ok(content.includes("const DEFAULT_GOOGLE_CLIENT_SECRET = null;"), "Expected DEFAULT_GOOGLE_CLIENT_SECRET to be null");
});

test(".env has client secret configuration or template", () => {
  const envPath = path.join(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    assert.ok(content.includes("GOOGLE_CLIENT_SECRET="), "Expected GOOGLE_CLIENT_SECRET in .env");
  }
});

test(".env.example template exists", () => {
  const examplePath = path.join(process.cwd(), ".env.example");
  assert.ok(fs.existsSync(examplePath), ".env.example must exist");
  const content = fs.readFileSync(examplePath, "utf8");
  assert.ok(content.includes("GOOGLE_CLIENT_ID="), ".env.example must show GOOGLE_CLIENT_ID");
});

// -----------------------------------------------------------------------------
// 2. Snapshot Path-Traversal & ID Safety Tests (Phase 2)
// -----------------------------------------------------------------------------
console.log("\n--- 2. Path & Snapshot ID Validator Tests (Phase 2) ---");

test("assertSafeSnapshotId rejects traversal patterns", () => {
  const maliciousIds = ["../snap", "..\\snap", "snap/1", "snap\\1", "snap:1", "snap\0", "   ", ""];
  for (const id of maliciousIds) {
    let thrown = false;
    try {
      assertSafeSnapshotId(id);
    } catch {
      thrown = true;
    }
    assert.ok(thrown, `Expected assertSafeSnapshotId to throw for: "${id}"`);
  }
});

test("assertSafeSnapshotId accepts valid snapshot IDs", () => {
  const validIds = ["001", "snap-123", "snapshot_prod", "snap-abc-456"];
  for (const id of validIds) {
    assert.doesNotThrow(() => assertSafeSnapshotId(id), `Expected valid ID: "${id}"`);
  }
});

test("assertSafeRelativePath rejects path traversals", () => {
  const maliciousPaths = [
    "../../evil.txt",
    "..\\..\\evil.txt",
    "/etc/passwd",
    "C:\\Windows\\System32\\calc.exe",
    "sub/../../evil.txt",
    "sub\\..\\..\\evil.txt",
    "evil\0.txt"
  ];
  for (const p of maliciousPaths) {
    let thrown = false;
    try {
      assertSafeRelativePath(p);
    } catch {
      thrown = true;
    }
    assert.ok(thrown, `Expected assertSafeRelativePath to throw for: "${p}"`);
  }
});

test("assertSafeRelativePath accepts safe project relative paths", () => {
  const safePaths = [
    "package.json",
    "src/index.ts",
    "src\\utils\\helper.ts",
    "nested/folder/file.json"
  ];
  for (const p of safePaths) {
    assert.doesNotThrow(() => assertSafeRelativePath(p), `Expected safe path: "${p}"`);
  }
});

// -----------------------------------------------------------------------------
// 3. OAuth Callback HTML Injection & Command Hardening Tests (Phase 3)
// -----------------------------------------------------------------------------
console.log("\n--- 3. OAuth Callback Escaping & Command Execution Tests (Phase 3) ---");

test("escapeHtml sanitizes HTML tags and JavaScript injection vectors", () => {
  const payloads = [
    { input: '<script>alert(1)</script>', expected: '&lt;script&gt;alert(1)&lt;/script&gt;' },
    { input: '"><img src=x onerror=alert(1)>', expected: '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;' },
    { input: "test ' & < > \"", expected: 'test &#39; &amp; &lt; &gt; &quot;' },
  ];
  for (const { input, expected } of payloads) {
    assert.strictEqual(escapeHtml(input), expected);
  }
});

test("authHandler.js contains safe getCallbackHtml escaping and security headers", () => {
  const content = fs.readFileSync(path.join(process.cwd(), "apps/desktop/main/handlers/authHandler.js"), "utf8");
  assert.ok(content.includes("escapeHtml(title)"), "authHandler must escape title in getCallbackHtml");
  assert.ok(content.includes("escapeHtml(message)"), "authHandler must escape message in getCallbackHtml");
  assert.ok(content.includes("Content-Security-Policy"), "authHandler must include CSP header in OAuth response");
  assert.ok(!content.includes("href=\"javascript:window.close()\""), "Inline javascript: link should be replaced");
});

test("assertSafePackageManager allowlists approved package managers", () => {
  const validPms = ["npm", "pnpm", "yarn", "bun", "pip"];
  for (const pm of validPms) {
    assert.doesNotThrow(() => assertSafePackageManager(pm));
  }

  const invalidPms = ["cmd.exe", "powershell", "bash", "calc", "../npm", "npm & calc"];
  for (const pm of invalidPms) {
    assert.throws(() => assertSafePackageManager(pm), /Invalid package manager/);
  }
});

test("assertSafePackageName rejects shell injection payloads", () => {
  const injectionPayloads = [
    "lodash; calc.exe",
    "requests & calc",
    "pkg | whoami",
    "pkg`id`",
    "pkg$(calc)",
    "pkg\nevil",
    "pkg\revil",
    "pkg>out.txt",
    "pkg^cmd",
  ];
  for (const payload of injectionPayloads) {
    assert.throws(() => assertSafePackageName(payload, "npm"), /SECURITY/);
    assert.throws(() => assertSafePackageName(payload, "pip"), /SECURITY/);
  }
});

test("assertSafePackageName accepts valid npm and pip package names", () => {
  const validNpm = ["express", "@types/node", "better-sqlite3", "react-dom", "a.b-c_d"];
  for (const name of validNpm) {
    assert.doesNotThrow(() => assertSafePackageName(name, "npm"));
  }

  const validPip = ["requests", "numpy", "torch", "urllib3[socks]", "flake8-docstrings"];
  for (const name of validPip) {
    assert.doesNotThrow(() => assertSafePackageName(name, "pip"));
  }
});

test("assertSafePackageVersion rejects injection characters in version string", () => {
  const badVersions = [
    "1.0.0; calc",
    "^1.0.0 & calc",
    "~2.0.0 | rm",
    "`whoami`",
    "1.0.0\n2.0.0",
    ">=1.0.0 <2.0.0",
    "1.0.0 > out.txt",
  ];
  for (const v of badVersions) {
    assert.throws(() => assertSafePackageVersion(v), /SECURITY/);
  }

  const goodVersions = ["1.0.0", "^2.1.0", "~0.5.2", "1.0.0-beta.1", "latest", "v3.0.0", "2.0.0-alpha.2+build123"];
  for (const v of goodVersions) {
    assert.doesNotThrow(() => assertSafePackageVersion(v));
  }
});

// -----------------------------------------------------------------------------
// 4. Content Security Policy & Navigation Restriction Tests (Phase 4)
// -----------------------------------------------------------------------------
console.log("\n--- 4. Content Security Policy & Navigation Restrictions (Phase 4) ---");

test("renderer/index.html includes Content-Security-Policy meta header", () => {
  const html = fs.readFileSync(path.join(process.cwd(), "apps/desktop/renderer/index.html"), "utf8");
  assert.ok(html.includes("http-equiv=\"Content-Security-Policy\""), "Missing CSP meta tag in index.html");
  assert.ok(html.includes("default-src 'self'"), "CSP must restrict default-src");
  assert.ok(html.includes("object-src 'none'"), "CSP must restrict object-src");
});

test("main.js enforces setWindowOpenHandler and will-navigate restrictions", () => {
  const mainCode = fs.readFileSync(path.join(process.cwd(), "apps/desktop/main/main.js"), "utf8");
  assert.ok(mainCode.includes("setWindowOpenHandler"), "main.js must define setWindowOpenHandler");
  assert.ok(mainCode.includes("action: 'deny'"), "setWindowOpenHandler must deny unmanaged window creation");
  assert.ok(mainCode.includes("will-navigate"), "main.js must listen for will-navigate");
});

// -----------------------------------------------------------------------------
// 5. OAuth Token Encryption & Migration Tests (Phase 5)
// -----------------------------------------------------------------------------
console.log("\n--- 5. Token Encryption & Migration Tests (Phase 5) ---");

test("authHandler.js uses safeStorage and token encryption prefix", () => {
  const authCode = fs.readFileSync(path.join(process.cwd(), "apps/desktop/main/handlers/authHandler.js"), "utf8");
  assert.ok(authCode.includes("safeStorage"), "authHandler.js must import safeStorage");
  assert.ok(authCode.includes("TOKEN_ENC_PREFIX = 'enc:v1:'"), "authHandler.js must use enc:v1: prefix");
  assert.ok(authCode.includes("encryptToken"), "authHandler.js must define encryptToken");
  assert.ok(authCode.includes("migrateStoredTokens"), "authHandler.js must define migrateStoredTokens");
});

// -----------------------------------------------------------------------------
// 6. Profile Storage Path & Version Check Hardening Tests (Phase 6)
// -----------------------------------------------------------------------------
console.log("\n--- 6. Profile Storage Path & Version Check Tests (Phase 6) ---");

test("assertSafeWritePath blocks drive roots and Windows system directories", () => {
  const forbidden = [
    "C:\\",
    "C:\\Windows",
    "C:\\Windows\\System32",
    "C:\\Program Files",
    "C:\\Program Files (x86)"
  ];
  for (const p of forbidden) {
    assert.throws(() => assertSafeWritePath(p), /Path validation failed|refusing to write to/i);
  }
});

test("main.js guards profile:set-storage-path with assertSafeWritePath", () => {
  const mainCode = fs.readFileSync(path.join(process.cwd(), "apps/desktop/main/main.js"), "utf8");
  assert.ok(mainCode.includes("pathGuard.assertSafeWritePath(targetDir)"), "profile:set-storage-path must validate path");
});

test("system-service.ts uses allowlisted tools without raw shell execSync", () => {
  const sysCode = fs.readFileSync(path.join(process.cwd(), "apps/cli/src/services/system-service.ts"), "utf8");
  assert.ok(!sysCode.includes("execSync("), "system-service.ts must not call execSync");
  assert.ok(sysCode.includes("ALLOWED_TOOLS"), "system-service.ts must validate tool name against allowlist");
});

// -----------------------------------------------------------------------------
// 7. Snapshot Import & Restoration Flow Tests
// -----------------------------------------------------------------------------
console.log("\n--- 7. Snapshot Import & Operational Integrity Tests ---");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pg-sec-test-"));
const testProjectDir = path.join(tempDir, "project");
fs.mkdirSync(testProjectDir, { recursive: true });
fs.writeFileSync(path.join(testProjectDir, "package.json"), JSON.stringify({ name: "sec-test", version: "1.0.0" }));

const db = openDatabase();
const projectId = "proj-sec-test-full";
db.prepare("INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)").run(
  projectId,
  "SecurityFullProject",
  testProjectDir,
  new Date().toISOString()
);

test("importSnapshot rejects snapshot with ../ traversal in relativePath", () => {
  const maliciousExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    snapshot: {
      id: "snap-malicious-1",
      name: "Malicious Snapshot",
      file_count: 1,
      package_count: 0
    },
    files: [
      {
        relativePath: "../../../malicious_dropped_file.txt",
        fileHash: "fakehash",
        sizeBytes: 13,
        contentBase64: Buffer.from("malicious payload").toString("base64")
      }
    ]
  };

  const maliciousExportPath = path.join(tempDir, "malicious-import.json");
  fs.writeFileSync(maliciousExportPath, JSON.stringify(maliciousExport, null, 2));

  let thrown = false;
  try {
    importSnapshot(db, projectId, maliciousExportPath);
  } catch (err) {
    thrown = true;
    assert.ok(err.message.includes("Relative path validation failed") || err.message.includes("Path validation failed") || err.message.includes("path-traversal"), `Unexpected error: ${err.message}`);
  }
  assert.ok(thrown, "importSnapshot should have thrown on path-traversal relativePath");
});

await asyncTest("Create, Export, Import, Restore, Delete cycle succeeds safely", async () => {
  fs.writeFileSync(path.join(testProjectDir, "test-file.txt"), "hello security");
  const snap = await createSnapshot(db, projectId, testProjectDir, "Normal Snapshot", "Safe testing");
  assert.ok(snap && snap.id, "Snapshot creation should succeed");

  const exportPath = exportSnapshot(db, snap.id, path.join(tempDir, "safe-export.json"));
  assert.ok(fs.existsSync(exportPath), "Snapshot export should create export file");

  const imported = importSnapshot(db, projectId, exportPath);
  assert.ok(imported && imported.id, "Snapshot import should succeed for valid files");
  assert.strictEqual(imported.file_count, snap.file_count);

  const restored = await restoreSnapshot(db, imported.id, testProjectDir);
  assert.ok(restored.restoredFiles > 0, "Should restore snapshot files");
  assert.strictEqual(fs.readFileSync(path.join(testProjectDir, "test-file.txt"), "utf8"), "hello security");

  const deleted = deleteSnapshot(db, imported.id);
  assert.ok(deleted, "Should successfully delete snapshot");
  assert.strictEqual(getSnapshotById(db, imported.id), undefined, "Snapshot should no longer exist in DB");
});

// Clean up DB entry and tempDir
try {
  db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  fs.rmSync(tempDir, { recursive: true, force: true });
} catch {}

console.log("\n==================================================================");
console.log(`Summary: Passed: ${passed}, Failed: ${failed}`);
console.log("==================================================================");

if (failed > 0) {
  process.exit(1);
}
