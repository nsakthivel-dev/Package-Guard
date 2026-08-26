import { Command } from 'commander';
import * as fs from 'fs';
import { getDbJsonPath, getUserDataDir, getAppDataBase } from '@workspace/shared-paths';

export const pathCmd = new Command('path')
  .description('Print the resolved store.json path for path-mismatch verification')
  .option('--all', 'Print all resolved paths, not just store.json')
  .action((opts: { all?: boolean }) => {
    const storePath = getDbJsonPath();

    // The one line that matters for Step-6 verification:
    console.log(storePath);

    if (opts.all) {
      console.log('');
      console.log('--- full path breakdown ---');
      console.log(`appDataBase  : ${getAppDataBase()}`);
      console.log(`userDataDir  : ${getUserDataDir()}`);
      console.log(`db.json      : ${storePath}`);
      console.log(`db.json exists: ${fs.existsSync(storePath)}`);
      console.log('');
      console.log('--- Electron cross-check ---');
      console.log('In Electron main.js, app.getPath("userData") should equal:');
      console.log(`  ${getUserDataDir()}`);
      console.log('(add /dev/ if you are running a dev Electron instance — CLI never does)');
    }
  });
