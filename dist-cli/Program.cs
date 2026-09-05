using System;
using System.Diagnostics;
using System.IO;

namespace PackageGuard
{
    class Program
    {
        static int Main(string[] args)
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory;

            // Resolve Electron executable
            string[] electronCandidates = new string[]
            {
                Path.Combine(exeDir, "..", "PackageGuard.exe"),
                Path.Combine(exeDir, "..", "Package Guard.exe"),
                Path.Combine(exeDir, "..", "package-guard.exe"),
                Path.Combine(exeDir, "..", "node_modules", "electron", "dist", "electron.exe"),
                Path.Combine(exeDir, "..", "..", "node_modules", "electron", "dist", "electron.exe"),
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
                Console.Error.WriteLine("[pg] Error: Could not locate Package Guard runtime executable.");
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
                Console.Error.WriteLine("[pg] Error: Could not locate Package Guard CLI script.");
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
            string devModules = Path.GetFullPath(Path.Combine(exeDir, "..", "node_modules"));
            string parentDevModules = Path.GetFullPath(Path.Combine(exeDir, "..", "..", "node_modules"));
            string existingNodePath = Environment.GetEnvironmentVariable("NODE_PATH") ?? "";
            
            string combinedNodePath = unpackedModules + Path.PathSeparator + devModules + Path.PathSeparator + parentDevModules;
            if (!string.IsNullOrEmpty(existingNodePath))
            {
                combinedNodePath = combinedNodePath + Path.PathSeparator + existingNodePath;
            }
            psi.EnvironmentVariables["NODE_PATH"] = combinedNodePath;

            // Quote arguments
            string commandArgs = "\"" + cliJs + "\"";
            for (int i = 0; i < args.Length; i++)
            {
                string arg = args[i];
                if (arg.Contains(" ") || arg.Contains("\""))
                {
                    commandArgs += " \"" + arg.Replace("\"", "\\\"") + "\"";
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