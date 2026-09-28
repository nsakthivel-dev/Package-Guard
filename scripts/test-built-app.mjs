import * as child_process from "node:child_process";
import * as net from "node:net";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const builtElectronExe = path.join(rootDir, "release", "win-unpacked", "PackageGuard.exe");
const builtCliExe = path.join(rootDir, "release", "win-unpacked", "cli", "pg.exe");
const PIPE_NAME = "\\\\.\\pipe\\PackageGuard";

console.log("==================================================================");
console.log("Testing Production Built Electron & Built CLI End-to-End");
console.log("==================================================================");
console.log("Built Electron Exe:", builtElectronExe);
console.log("Built CLI Exe:     ", builtCliExe);

const electronProc = child_process.spawn(builtElectronExe, [], {
  cwd: path.dirname(builtElectronExe),
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: "1"
  },
  stdio: ["pipe", "pipe", "pipe"]
});

async function waitForPipe(timeoutMs = 20000) {
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
  console.log("Waiting for built Electron Named Pipe server to initialize...");
  const pipeReady = await waitForPipe(25000);
  if (!pipeReady) {
    console.error("[FAIL] Named pipe did not become available.");
    process.exit(1);
  }
  console.log("[PASS] Built Electron started and Named Pipe is listening!");

  console.log("Executing built 'pg.exe ping'...");
  const pingRes = child_process.spawnSync(builtCliExe, ["ping"], {
    encoding: "utf8",
    timeout: 10000
  });
  console.log(pingRes.stdout);
  if (pingRes.status !== 0) {
    console.error("[FAIL] Built pg.exe ping returned status:", pingRes.status);
    console.error(pingRes.stderr);
    process.exit(1);
  }
  console.log("[PASS] Built CLI ping to Built Electron SUCCEEDED!");

  console.log("Executing built 'pg.exe doctor' with Electron online...");
  const docRes = child_process.spawnSync(builtCliExe, ["doctor"], {
    encoding: "utf8",
    timeout: 10000
  });
  console.log(docRes.stdout);
  console.log("[PASS] Built doctor verified.");

} finally {
  console.log("Stopping built Electron process...");
  electronProc.kill("SIGTERM");
  setTimeout(() => {
    try {
      electronProc.kill("SIGKILL");
    } catch {}
  }, 3000);
}

console.log("==================================================================");
console.log("BUILT APPLICATION END-TO-END TEST COMPLETED SUCCESSFULLY!");
console.log("==================================================================");
