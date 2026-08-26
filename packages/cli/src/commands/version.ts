import { Command } from 'commander';

export const versionCmd = new Command('version')
  .description('Print the PackageGuard CLI version')
  .action(() => {
    try {
      // This is handled by commander's built-in version command
      // We'll just show a message and let the user use --version
      console.log('Use "pg --version" to see the CLI version');
      console.log('Or use "pg -v"');
    } catch (err: unknown) {
      console.error('pg version failed:', (err as Error).message);
      process.exit(1);
    }
  });
