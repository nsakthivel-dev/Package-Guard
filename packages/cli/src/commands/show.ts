import { Command } from 'commander';
import { getDbJsonPath } from '@workspace/shared-paths';
import { readDb } from '../store';

export const showCmd = new Command('show')
  .description('Print full metadata and package list for a project ID')
  .argument('<project-id>', 'Project ID (use "pg list" to find IDs)')
  .option('--json', 'Output raw JSON instead of formatted text')
  .action((projectId: string, opts: { json?: boolean }) => {
    try {
      const db    = readDb();
      const entry = db.projects.find(p => p.id === projectId);

      if (!entry) {
        console.error(`Error: no project with id "${projectId}" found in store.`);
        console.error(`Store: ${getDbJsonPath()}`);
        console.error(`Run "pg list" to see all tracked project IDs.`);
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(entry, null, 2));
        return;
      }

      const pkgJson  = entry.packageJson as Record<string, unknown>;
      const deps     = pkgJson['dependencies']    as Record<string, string> | undefined;
      const devDeps  = pkgJson['devDependencies'] as Record<string, string> | undefined;

      console.log(`Project  : ${entry.name}`);
      console.log(`ID       : ${entry.id}`);
      console.log(`Path     : ${entry.path}`);
      console.log(`PM       : ${entry.packageManager}`);
      console.log(`Created  : ${new Date(entry.createdAt).toISOString()}`);
      console.log(`Updated  : ${new Date(entry.updatedAt).toISOString()}`);

      if (deps && Object.keys(deps).length > 0) {
        console.log(`\nDependencies (${Object.keys(deps).length}):`);
        for (const [name, ver] of Object.entries(deps)) {
          console.log(`  ${name}@${ver}`);
        }
      }

      if (devDeps && Object.keys(devDeps).length > 0) {
        console.log(`\nDevDependencies (${Object.keys(devDeps).length}):`);
        for (const [name, ver] of Object.entries(devDeps)) {
          console.log(`  ${name}@${ver}`);
        }
      }

      console.log(`\nStore: ${getDbJsonPath()}`);
    } catch (err: unknown) {
      console.error('pg show failed:', (err as Error).message);
      process.exit(1);
    }
  });
