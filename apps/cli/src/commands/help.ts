export function executeHelp(args: string[] = []): number {
  const subCommand = args[0]?.toLowerCase();

  if (subCommand) {
    switch (subCommand) {
      case "init":
        console.log("Usage: pg init [name]\n\nInitialize Package Guard for the current directory.");
        return 0;
      case "scan":
        console.log("Usage: pg scan\n\nScan the initialized project for files, packages, and changes.");
        return 0;
      case "status":
        console.log("Usage: pg status\n\nShow the current Package Guard project state.");
        return 0;
      case "changes":
        console.log("Usage: pg changes\n\nShow changes detected since latest snapshot or baseline.");
        return 0;
      case "diff":
        console.log("Usage: pg diff [snapshot-id]\n\nShow detailed file differences.");
        return 0;
      case "snapshot":
        console.log("Usage:\n  pg snapshot [name]\n  pg snapshot list\n  pg snapshot show <id>\n  pg snapshot restore <id> [-y]\n  pg snapshot delete <id> [-y]");
        return 0;
      case "packages":
        console.log("Usage: pg packages\n\nShow detected project packages and dependencies.");
        return 0;
      case "package":
        console.log("Usage: pg package <name>\n\nShow detailed information about a specific package.");
        return 0;
      case "outdated":
        console.log("Usage: pg outdated\n\nDetect outdated dependencies.");
        return 0;
      case "verify":
        console.log("Usage: pg verify\n\nVerify project integrity against recorded state/snapshot.");
        return 0;
      case "doctor":
        console.log("Usage: pg doctor\n\nPerform a comprehensive health check.");
        return 0;
      case "repair":
        console.log("Usage: pg repair\n\nSafely repair internal Package Guard problems.");
        return 0;
      case "config":
        console.log("Usage: pg config\n\nDisplay Package Guard configuration.");
        return 0;
      case "version":
        console.log("Usage: pg version\n\nDisplay the Package Guard CLI version.");
        return 0;
      default:
        break;
    }
  }

  console.log(`Package Guard CLI

Usage:
  pg <command> [options]

Core:
  init                     Initialize Package Guard for the current project
  scan                     Scan project files, packages, and changes
  status                   Show project state and metrics
  changes                  Show added, modified, or deleted files
  diff [snapshot-id]       Show detailed differences

Snapshots:
  snapshot [name]          Create a reproducible snapshot
  snapshot list            List all snapshots
  snapshot show <id>       Show details of a snapshot
  snapshot restore <id>    Restore project to snapshot state
  snapshot delete <id>     Delete a snapshot safely

Packages:
  packages                 List project packages and dependencies
  package <name>           Show details for a specific package
  outdated                 Check for outdated dependencies
  verify                   Verify project integrity against snapshot

Diagnostics:
  doctor                   Run comprehensive system health check
  repair                   Safely repair internal metadata and storage

Information:
  config                   Display Package Guard configuration
  version                  Show version information
  help [command]           Show help for all commands or a specific command

Options:
  --project, -p <path>     Target specific project directory
  --yes, -y                Skip confirmation prompts for destructive operations
`);

  return 0;
}
