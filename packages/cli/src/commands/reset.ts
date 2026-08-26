import { Command } from 'commander';
import { getDbJsonPath } from '@workspace/shared-paths';
import { writeDb } from '../store';

export const resetCmd = new Command('reset')
  .description('Reset the entire PackageGuard store to empty state')
  .option('-f, --force', 'Skip confirmation prompt')
  .action((opts: { force?: boolean }) => {
    try {
      if (!opts.force) {
        console.log('WARNING: This will delete ALL projects and snapshots from the PackageGuard store.');
        console.log(`Store location: ${getDbJsonPath()}`);
        console.error('WARNING: To skip confirmation, use --force flag.');
        console.error('Aborted: Interactive prompts not supported in CLI.');
        console.error('To confirm reset, run: pg reset --force');
        return;
      }

      writeDb({
        projects: [],
        snapshots: [],
        meta: { version: 1 }
      });

      console.log('Store reset to empty state.');
      console.log(`Store: ${getDbJsonPath()}`);
    } catch (err: unknown) {
      console.error('pg reset failed:', (err as Error).message);
      process.exit(1);
    }
  });
