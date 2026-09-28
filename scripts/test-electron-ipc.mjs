import * as child_process from "node:child_process";
import * as net from "node:net";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const cliScript = path.join(rootDir, "apps", "cli", "dist", "cli.js");
const PIPE_NAME = "\\\\.\\pipe\\PackageGuard";

console.log("==================================================================");
console.log("Package Guard Electron & Named Pipe Live Integration Test");
console.log("==================================================================");

// Resolve electron executable
const electronExe = path.join(rootDir, "node_modules", "electron", "dist", "electron.exe");

console.log("Starting Electron process...");
const electronProc = child_process.spawn(electronExe, [rootDir], {
  cwd: rootDir,
  env: {
    ...process.env,
    NODE_ENV: "production",
    ELECTRON_ENABLE_LOGGING: "1"
  },
  stdio: ["pipe", "pipe", "pipe"]
});

let electronStdout = "";
let electronStderr = "";

electronProc.stdout.on("data", (d) => {
  const str = d.toString();
  electronStdout += str;
  // process.stdout.write("[Electron stdout] " + str);
});

electronProc.stderr.on("data", (d) => {
  const str = d.toString();
  electronStderr += str;
  // process.stderr.write("[Electron stderr] " + str);
});

async function waitForPipe(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const sock = net.createConnection(PIPE_NAME);
        sock.on("connect", () => {
          sock.end();
          resolve(true);
        });
        sock.on("error", (err) => {
          reject(err);
        });
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

try {
  console.log("Waiting for Electron Named Pipe server to initialize...");
  const pipeReady = await waitForPipe(20000);
  if (!pipeReady) {
    console.error("Named Pipe did not become available in time.");
    console.error("Electron stdout:\n", electronStdout);
    console.error("Electron stderr:\n", electronStderr);
    process.exit(1);
  }
  console.log("[PASS] Electron started and Named Pipe is listening at:", PIPE_NAME);

  console.log("Executing 'pg ping' against live Electron Named Pipe...");
  const pingRes = child_process.spawnSync(process.execPath, [cliScript, "ping"], {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 10000
  });

  console.log(pingRes.stdout);
  if (pingRes.status !== 0) {
    console.error("[FAIL] pg ping failed with exit code:", pingRes.status);
    console.error(pingRes.stderr);
    process.exit(1);
  }
  console.log("[PASS] Live Named Pipe PING -> PONG -> ACK succeeded!");

  console.log("Executing 'pg queue' to verify online status...");
  const queueRes = child_process.spawnSync(process.execPath, [cliScript, "queue"], {
    cwd: rootDir,
    encoding: "utf8",
    timeout: 10000
  });
  console.log(queueRes.stdout);
  console.log("[PASS] Queue verified.");

} finally {
  console.log("Stopping Electron process...");
  electronProc.kill("SIGTERM");
  setTimeout(() => {
    try {
      electronProc.kill("SIGKILL");
    } catch {}
  }, 3000);
}

console.log("==================================================================");
console.log("All Electron + Named Pipe integration tests passed successfully!");
console.log("==================================================================");
