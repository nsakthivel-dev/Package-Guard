import { Command } from 'commander';
import { getDbJsonPath } from '@workspace/shared-paths';
import { buildProject } from '../project';
import { readDb, upsertProject } from '../store';
import { scanDependencies } from '../lockfile';

export const scanCmd = new Command('scan')
  .description('Scan project dependencies and update the Project Guardian store')
  .option('--show-packages', 'Print each resolved package to stdout')
  .action((opts: { showPackages?: boolean }) => {
    try {
      const dir      = process.cwd();
      const db       = readDb();
      const packages = scanDependencies(dir);

      // Build a fresh project descriptor, preserving createdAt if it exists.
      const existing  = db.projects.find(p => p.path === dir.replace(/\\/g, '/'));
      const proj      = buildProject(dir, existing?.createdAt);

      upsertProject(proj);

      const otherCount = db.projects.filter(
        p => p.id !== proj.id && p.path !== proj.path.replace(/\\/g, '/')
      ).length;

      console.log(`Scanned: "${proj.name}"  (${proj.id})`);
      console.log(`Package manager: ${proj.packageManager}`);
      console.log(`Packages found: ${packages.length}  (${packages.filter(p => p.type === 'dependency').length} prod, ${packages.filter(p => p.type === 'devDependency').length} dev)`);
      console.log(`Store: ${getDbJsonPath()}`);
      if (otherCount > 0) console.log(`Other projects in store left untouched: ${otherCount}`);

      if (opts.showPackages) {
        console.log('\n--- packages ---');
        packages.forEach(p => console.log(`  ${p.type.padEnd(14)} ${p.name}@${p.version}`));
      }
    } catch (err: unknown) {
      console.error('pg scan failed:', (err as Error).message);
      process.exit(1);
    }
  });
