import { Command } from 'commander';
import { getDbJsonPath } from '@workspace/shared-paths';
import { buildProject } from '../project';
import { readDb } from '../store';

export const statusCmd = new Command('status')
  .description('Show PackageGuard status for the current project (read-only, no rescan)')
  .action(() => {
    try {
      const proj = buildProject();
      const db   = readDb();
      const entry = db.projects.find(
        p => p.id === proj.id || p.path === proj.path
      );

      if (!entry) {
        console.log(`Not registered: "${proj.name}"  (${proj.id})`);
        console.log(`Run "pg init" or "pg scan" to register this project.`);
        console.log(`Store: ${getDbJsonPath()}`);
        return;
      }

      const pkgJson       = entry.packageJson as Record<string, unknown>;
      const deps          = pkgJson['dependencies']    as Record<string, unknown> | undefined;
      const devDeps       = pkgJson['devDependencies'] as Record<string, unknown> | undefined;
      const prodCount     = deps    ? Object.keys(deps).length    : 0;
      const devCount      = devDeps ? Object.keys(devDeps).length : 0;
      const totalPackages = prodCount + devCount;

      const updatedAt = new Date(entry.updatedAt).toISOString();

      console.log(`Project    : ${entry.name}  (${entry.id})`);
      console.log(`Path       : ${entry.path}`);
      console.log(`PM         : ${entry.packageManager}`);
      console.log(`Packages   : ${totalPackages}  (${prodCount} prod, ${devCount} dev)`);
      console.log(`Last scan  : ${updatedAt}`);
      console.log(`Store      : ${getDbJsonPath()}`);
    } catch (err: unknown) {
      console.error('pg status failed:', (err as Error).message);
      process.exit(1);
    }
  });
