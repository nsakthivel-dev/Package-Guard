import { Command } from 'commander';
import * as chokidar from 'chokidar';
import { getDbJsonPath } from '@workspace/shared-paths';
import { buildProject } from '../project';
import { readDb, upsertProject } from '../store';
import { scanDependencies } from '../lockfile';

export const watchCmd = new Command('watch')
  .description('Watch package.json and lockfile for changes, auto-update PackageGuard store')
  .option('--verbose', 'Print each change detected')
  .action((opts: { verbose?: boolean }) => {
    try {
      const dir = process.cwd();
      const storePath = getDbJsonPath();
      const watcher = chokidar.watch(['package.json', 'pnpm-lock.yaml'], {
        cwd: dir,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        }
      });

      console.log(`Watching ${dir} for changes to package.json/pnpm-lock.yaml...`);
      console.log(`Store: ${storePath}`);
      console.log('Press Ctrl+C to stop.');

      const debouncedScan = debounce(async (file: string) => {
        try {
          if (opts.verbose) {
            console.log(`Detected change in ${file}, scanning...`);
          }

          const db = readDb();
          const packages = scanDependencies(dir);
          const existing = db.projects.find(p => p.path === dir.replace(/\\/g, '/'));
          const proj = buildProject(dir, existing?.createdAt);

          upsertProject(proj);

          if (opts.verbose) {
            console.log(`Updated: "${proj.name}" (${proj.id}) with ${packages.length} packages`);
          }
        } catch (err: any) {
          console.error('Auto-scan failed:', err.message);
        }
      }, 1000);

      watcher
        .on('add', path => debouncedScan(path))
        .on('change', path => debouncedScan(path))
        .on('unlink', path => {
          if (opts.verbose) console.log(`${path} removed, store unchanged.`);
        })
        .on('error', error => console.error('Watcher error:', error));

      // Keep process alive
      process.on('SIGINT', () => {
        console.log('\nStopping watch...');
        watcher.close().then(() => process.exit(0));
      });
    } catch (err: unknown) {
      console.error('pg watch failed:', (err as Error).message);
      process.exit(1);
    }
  });

function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout | null = null;
  return function executedFunction(...args: any[]) {
    const later = () => {
      timeout = null;
      func(...args);
    };
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
