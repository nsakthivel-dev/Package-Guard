import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const distCliDir = path.join(rootDir, "dist-cli");
fs.mkdirSync(distCliDir, { recursive: true });

const csharpSource = `
using System;
using System.Diagnostics;
using System.IO;

namespace PackageGuardian
{
    class Program
    {
        static int Main(string[] args)
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;

            // Resolve Electron executable
            string[] electronCandidates = new string[]
            {
                Path.Combine(exeDir, "..", "PackageGuardian.exe"),
                Path.Combine(exeDir, "..", "Package Guardian.exe"),
                Path.Combine(exeDir, "..", "package-guardian.exe"),
                Path.Combine(exeDir, "..", "PackageGuard.exe"),
                Path.Combine(exeDir, "..", "Package Guard.exe"),
                Path.Combine(exeDir, "..", "package-guard.exe"),
                Path.Combine(exeDir, "..", "node_modules", "electron", "dist", "electron.exe"),
                Path.Combine(exeDir, "..", "..", "node_modules", "electron", "dist", "electron.exe"),
                Path.Combine(exeDir, "PackageGuardian.exe"),
                Path.Combine(exeDir, "Package Guardian.exe"),
                Path.Combine(exeDir, "PackageGuard.exe"),
                Path.Combine(exeDir, "Package Guard.exe")
            };

            string electronExe = null;
            foreach (var candidate in electronCandidates)
            {
                string fullPath = Path.GetFullPath(candidate);
                if (File.Exists(fullPath))
                {
                    electronExe = fullPath;
                    break;
                }
            }

            if (electronExe == null)
            {
                Console.Error.WriteLine("[pg] Error: Could not locate Package Guardian runtime executable.");
                return 1;
            }

            // Resolve CLI script
            string[] cliCandidates = new string[]
            {
                Path.Combine(exeDir, "..", "resources", "app.asar.unpacked", "apps", "cli", "dist", "cli.js"),
                Path.Combine(exeDir, "..", "resources", "app", "apps", "cli", "dist", "cli.js"),
                Path.Combine(exeDir, "..", "apps", "cli", "dist", "cli.js")
            };

            string cliJs = null;
            foreach (var candidate in cliCandidates)
            {
                string fullPath = Path.GetFullPath(candidate);
                if (File.Exists(fullPath))
                {
                    cliJs = fullPath;
                    break;
                }
            }

            if (cliJs == null)
            {
                Console.Error.WriteLine("[pg] Error: Could not locate Package Guardian CLI script.");
                return 1;
            }

            // Build arguments string safely
            var psi = new ProcessStartInfo();
            psi.FileName = electronExe;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = false;

            // Set environment variable to run Electron as Node.js
            psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";
            psi.EnvironmentVariables["ELECTRON_NO_ATTACH_CONSOLE"] = "1";

            // Add unpacked node_modules to NODE_PATH
            string unpackedModules = Path.GetFullPath(Path.Combine(exeDir, "..", "resources", "app.asar.unpacked", "node_modules"));
            string prodModules = Path.GetFullPath(Path.Combine(exeDir, "..", "prod-modules"));
            string devModules = Path.GetFullPath(Path.Combine(exeDir, "..", "node_modules"));
            string parentDevModules = Path.GetFullPath(Path.Combine(exeDir, "..", "..", "node_modules"));
            string existingNodePath = Environment.GetEnvironmentVariable("NODE_PATH") ?? "";
            
            string combinedNodePath = unpackedModules + Path.PathSeparator + prodModules + Path.PathSeparator + devModules + Path.PathSeparator + parentDevModules;
            if (!string.IsNullOrEmpty(existingNodePath))
            {
                combinedNodePath = combinedNodePath + Path.PathSeparator + existingNodePath;
            }
            psi.EnvironmentVariables["NODE_PATH"] = combinedNodePath;

            // Quote arguments
            string commandArgs = "\\"" + cliJs + "\\"";
            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];
                if (arg.Contains(" ") || arg.Contains("\\""))
                {
                    commandArgs += " \\"" + arg.Replace("\\"", "\\\\\\"") + "\\"";
                }
                else
                {
                    commandArgs += " " + arg;
                }
            }

            psi.Arguments = commandArgs;

            try
            {
                using (var process = Process.Start(psi))
                {
                    process.WaitForExit();
                    return process.ExitCode;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("[pg] Error executing CLI: " + ex.Message);
                return 1;
            }
        }
    }
}
`;

const csFile = path.join(distCliDir, "Program.cs");
const targetExe = path.join(distCliDir, "pg.exe");

fs.writeFileSync(csFile, csharpSource.trim(), "utf-8");

// Find csc.exe
const cscPaths = [
  "C:\\\\Windows\\\\Microsoft.NET\\\\Framework64\\\\v4.0.30319\\\\csc.exe",
  "C:\\\\Windows\\\\Microsoft.NET\\\\Framework\\\\v4.0.30319\\\\csc.exe"
];

let cscExe = null;
for (const p of cscPaths) {
  if (fs.existsSync(p)) {
    cscExe = p;
    break;
  }
}

if (!cscExe) {
  try {
    const whereOut = execFileSync("where.exe", ["csc.exe"], { encoding: "utf-8" }).trim();
    if (whereOut) {
      cscExe = whereOut.split("\\r\\n")[0].split("\\n")[0];
    }
  } catch {
    // not in PATH
  }
}

if (!cscExe) {
  console.error("Could not find csc.exe to build pg.exe.");
  process.exit(1);
}

console.log(`Compiling pg.exe using ${cscExe}...`);
execFileSync(cscExe, [
  "/target:exe",
  "/platform:anycpu",
  "/optimize+",
  `/out:${targetExe}`,
  csFile
], { stdio: "inherit" });

try {
  fs.unlinkSync(csFile);
} catch {
  // ignore
}

console.log(`Successfully built: ${targetExe}`);
