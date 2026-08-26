import { Command } from 'commander';
import { getDbJsonPath } from '@workspace/shared-paths';
import { buildProject } from '../project';
import { readDb, upsertProject } from '../store';

export const initCmd = new Command('init')
  .description('Register the current project in Project Guardian')
  .action(() => {
    try {
      const proj  = buildProject();
      const db    = readDb();

      const existing = db.projects.find(p => p.id === proj.id);
      if (existing) {
        console.log(`Already registered: "${existing.name}"  (${existing.id})`);
        console.log(`Path  : ${existing.path}`);
        console.log(`Store : ${getDbJsonPath()}`);
        return;
      }

      upsertProject(proj);

      console.log(`Registered: "${proj.name}"  (${proj.id})`);
      console.log(`Package manager: ${proj.packageManager}`);
      console.log(`Path  : ${proj.path}`);
      console.log(`Store : ${getDbJsonPath()}`);
    } catch (err: unknown) {
      console.error('pg init failed:', (err as Error).message);
      process.exit(1);
    }
  });
