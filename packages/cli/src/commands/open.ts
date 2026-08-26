import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { getServerJsonPath } from '@workspace/shared-paths';

export const openCmd = new Command('open')
  .description('Launch the PackageGuard Electron app if not already running')
  .option('--verbose', 'Print detailed debug information')
  .action(async (opts: { verbose?: boolean }) => {
    try {
      const serverPath = getServerJsonPath();
      
      // Check if Electron is already running via server.json
      if (fs.existsSync(serverPath)) {
        try {
          const serverInfo = JSON.parse(fs.readFileSync(serverPath, 'utf-8'));
          const pid = serverInfo.pid;
          
          // Check if process is still alive
          try {
            process.kill(pid, 0); // Signal 0 just checks if process exists
            if (opts.verbose) {
              console.log(`PackageGuard already running (PID: ${pid})`);
              console.log(`HTTP API: http://127.0.0.1:${serverInfo.port || 'unknown'}/api/v1/health`);
            } else {
              console.log('PackageGuard is already running.');
            }
            return;
          } catch {
            // Process is dead, server.json is stale
            if (opts.verbose) console.log('Stale server.json found, process not running.');
          }
        } catch {
          // Invalid server.json
          if (opts.verbose) console.log('Invalid server.json found.');
        }
      }

      // Determine executable path based on platform
      let exePath = '';
      if (process.platform === 'win32') {
        // Look for PackageGuard.exe in standard install locations
        const possiblePaths = [
          path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'PackageGuard', 'PackageGuard.exe'),
          path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'PackageGuard', 'PackageGuard.exe'),
          path.join(process.env['LOCALAPPDATA'] || process.env['USERPROFILE'] + '\\AppData\\Local', 'Programs', 'PackageGuard', 'PackageGuard.exe')
        ];
        
        for (const p of possiblePaths) {
          if (fs.existsSync(p)) {
            exePath = p;
            break;
          }
        }
        
        if (!exePath) {
          console.error('PackageGuard not found. Is it installed?');
          console.error('Looked in:', possiblePaths.join(', '));
          process.exit(1);
        }
      } else if (process.platform === 'darwin') {
        exePath = '/Applications/PackageGuard.app/Contents/MacOS/PackageGuard';
      } else {
        // Linux
        exePath = '/usr/bin/PackageGuard';
      }

      if (opts.verbose) {
        console.log(`Launching: ${exePath}`);
      }

      // Spawn with argument array to avoid EINVAL from string concatenation
      const child = spawn(`"${exePath}"`, [], {
        shell: true,
        detached: true,
        stdio: 'ignore'
      });

      child.unref();
      
      console.log('PackageGuard launched.');
      if (opts.verbose) {
        console.log(`PID: ${child.pid}`);
      }
    } catch (err: unknown) {
      console.error('pg open failed:', (err as Error).message);
      process.exit(1);
    }
  });
