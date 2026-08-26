import { Command } from 'commander';
import { getDbJsonPath } from '@workspace/shared-paths';
import { readDb, writeDb } from '../store';

export const removeCmd = new Command('remove')
  .alias('rm')
  .description('Remove a project from the PackageGuard store')
  .argument('<project-id>', 'Project ID (use "pg list" to find IDs)')
  .option('-f, --force', 'Skip confirmation prompt')
  .action((projectId: string, opts: { force?: boolean }) => {
    try {
      const db = readDb();
      const entry = db.projects.find(p => p.id === projectId);

      if (!entry) {
        console.error(`Error: no project with id "${projectId}" found in store.`);
        console.error(`Store: ${getDbJsonPath()}`);
        console.error(`Run "pg list" to see all tracked project IDs.`);
        process.exit(1);
      }

      if (!opts.force) {
        console.log(`About to remove project: ${entry.name} (${entry.id})`);
        console.log(`Path: ${entry.path}`);
        console.error('WARNING: To skip confirmation, use --force flag.');
        console.error('Aborted: Interactive prompts not supported in CLI.');
        console.error('To confirm removal, run: pg remove ' + projectId + ' --force');
        return;
      }

      // Also remove any snapshots belonging to this project
      const newSnapshots = db.snapshots.filter((s: any) => s.projectId !== projectId);
      const removedSnapshots = db.snapshots.length - newSnapshots.length;

      db.projects = db.projects.filter(p => p.id !== projectId);
      db.snapshots = newSnapshots;

      writeDb(db);

      console.log(`Removed: ${entry.name} (${entry.id})`);
      console.log(`Also removed ${removedSnapshots} snapshot(s) belonging to this project.`);
      console.log(`${db.projects.length} project(s) remain in store.`);
      console.log(`Store: ${getDbJsonPath()}`);
    } catch (err: unknown) {
      console.error('pg remove failed:', (err as Error).message);
      process.exit(1);
    }
  });
