import { Command } from 'commander';
import { getDbJsonPath } from '@workspace/shared-paths';
import { readDb } from '../store';

export const listCmd = new Command('list')
  .alias('ls')
  .description('List every tracked project in the PackageGuard store')
  .action(() => {
    try {
      const db = readDb();

      if (db.projects.length === 0) {
        console.log('No projects tracked yet.');
        console.log(`Store: ${getDbJsonPath()}`);
        return;
      }

      console.log(`${db.projects.length} project(s) in store: ${getDbJsonPath()}\n`);

      for (const p of db.projects) {
        const pkgJson   = p.packageJson as Record<string, unknown>;
        const deps      = pkgJson['dependencies']    as Record<string, unknown> | undefined;
        const devDeps   = pkgJson['devDependencies'] as Record<string, unknown> | undefined;
        const pkgCount  = (deps ? Object.keys(deps).length : 0) +
                          (devDeps ? Object.keys(devDeps).length : 0);
        const updated   = new Date(p.updatedAt).toISOString();

        console.log(`  ${p.id}`);
        console.log(`    name     : ${p.name}`);
        console.log(`    path     : ${p.path}`);
        console.log(`    pm       : ${p.packageManager}`);
        console.log(`    packages : ${pkgCount}`);
        console.log(`    updated  : ${updated}`);
        console.log('');
      }
    } catch (err: unknown) {
      console.error('pg list failed:', (err as Error).message);
      process.exit(1);
    }
  });
