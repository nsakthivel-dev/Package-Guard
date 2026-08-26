#!/usr/bin/env node
'use strict';

/**
 * PackageGuard CLI  —  `pg`
 *
 * Entry point.  All commands live in ./commands/ and export a `Command`
 * instance (not a factory function) so they can be passed directly to
 * program.addCommand().
 */

import { Command } from 'commander';
import { initCmd } from './commands/init';
import { scanCmd } from './commands/scan';
import { pathCmd } from './commands/path';
import { statusCmd } from './commands/status';
import { listCmd } from './commands/list';
import { showCmd } from './commands/show';
import { removeCmd } from './commands/remove';
import { resetCmd } from './commands/reset';
import { versionCmd } from './commands/version';
import { watchCmd } from './commands/watch';
import { openCmd } from './commands/open';

// Read version without a TypeScript import so we don't need isolatedModules
// tricks or a JSON import assertion.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('pg')
  .description('PackageGuard — package dependency auditing and management')
  .version(version, '-v, --version');

program.addCommand(initCmd);
program.addCommand(scanCmd);
program.addCommand(pathCmd);
program.addCommand(statusCmd);
program.addCommand(listCmd);
program.addCommand(showCmd);
program.addCommand(removeCmd);
program.addCommand(resetCmd);
program.addCommand(versionCmd);
program.addCommand(watchCmd);
program.addCommand(openCmd);

program.parse(process.argv);
