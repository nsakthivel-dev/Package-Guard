import { outputSuccess } from "../output";

export function executeHelp(args: string[] = [], isJson: boolean = false): number {
  const subCommand = args[0]?.toLowerCase();

  if (subCommand) {
    switch (subCommand) {
      case "init":
        if (isJson) {
          outputSuccess({
            command: "init",
            syntax: "pg init [name] [--project <path>]",
            description: "Initializes Package Guard for the current directory. Automatically detects project type, package manager, manifests, lockfiles, creates .packageguard/PACKAGEGUARD.md, and maintains AGENTS.md for AI coding agents.",
            options: [
              { flag: "--project, -p <path>", description: "Target specific project directory instead of cwd" },
              { flag: "--json, -j", description: "Output machine-readable JSON format" }
            ],
            examples: ["pg init", "pg init my-web-app", "pg init --json"],
            safety: "Safe operation. Does not modify or overwrite your existing project files or lockfiles."
          });
          return 0;
        }
        console.log(`Package Guard Help: init

Syntax:
  pg init [name]

Description:
  Initializes Package Guard for the current directory. Automatically detects project type,
  package manager (npm, pnpm, yarn, bun, pip), manifests, lockfiles, and registers tracking
  metadata in SQLite. Performs an initial baseline scan, creates .packageguard/PACKAGEGUARD.md,
  and maintains AGENTS.md for AI coding agents.

Options:
  --project, -p <path>     Target specific project directory instead of cwd
  --json, -j               Output machine-readable JSON format

Examples:
  pg init
  pg init my-web-app
  pg init --json

Safety:
  Safe operation. Does not modify or overwrite your existing project files or lockfiles.
`);
        return 0;

      case "scan":
        console.log(`Package Guard Help: scan

Syntax:
  pg scan [options]

Description:
  Scans project files, manifests, lockfiles, and installed packages. Reconciles package states,
  calculates file checksums, and detects updates and dependency changes.

Options:
  --deep                   Analyze complete indirect dependency tree and metadata
  --force                  Ignore scan cache and perform full fresh inspection
  --watch                  Continuously monitor dependency files and trigger auto-scans

Examples:
  pg scan
  pg scan --deep
  pg scan --force
  pg scan --watch

Safety:
  Read-only operation. Does not mutate project dependency files.
`);
        return 0;

      case "update":
        console.log(`Package Guard Help: update

Syntax:
  pg update <package> [options]
  pg update --all [options]

Description:
  Safely updates packages using the detected package manager. Before making changes,
  Package Guard automatically generates an isolated safety snapshot. After the update,
  it runs a scan and verification check to validate dependency integrity.

Options:
  --all                    Update all outdated packages with real progress tracking
  --safe                   Only apply non-breaking patch and minor version bumps
  --major                  Explicitly permit major version updates

Workflow:
  Current State -> Create Safety Snapshot -> Run PM Update -> Scan -> Verify -> Notify Electron

Examples:
  pg update lodash
  pg update --all --safe
  pg update express --major

Safety:
  In case of update failure, the safety snapshot is preserved and rollback can be executed
  via 'pg rollback'.
`);
        return 0;

      case "snapshot":
        console.log(`Package Guard Help: snapshot

Syntax:
  pg snapshot [create] [name]
  pg snapshot list
  pg snapshot show <id>
  pg snapshot restore <id> [-y]
  pg snapshot delete <id> [-y]
  pg snapshot export <id> [--out <file>]
  pg snapshot import <file>

Description:
  Manages reproducible project snapshots including manifests, lockfiles, file hashes,
  and dependency metadata.

Restore Workflow:
  Validate Snapshot -> Create Pre-Restore Safety Snapshot -> Restore Files -> Scan -> Verify

Examples:
  pg snapshot create "Before React 19 upgrade"
  pg snapshot list
  pg snapshot restore snap-12345678 -y
  pg snapshot export snap-12345678 --out backup.json

Safety:
  Restoring a snapshot always creates a pre-restore safety snapshot so work is never lost.
`);
        return 0;

      case "doctor":
        console.log(`Package Guard Help: doctor

Syntax:
  pg doctor

Description:
  Executes a comprehensive health check inspecting all 11 system components:
  1. CLI environment
  2. Electron desktop connection
  3. Named Pipe IPC (\\\\.\\pipe\\PackageGuard)
  4. SQLite engine
  5. Database integrity & schema
  6. Project registration
  7. Storage permissions
  8. Configuration integrity
  9. Dependency directories
  10. CLI executable installation
  11. PATH environment variable

Output:
  Clear [PASS], [WARN], or [FAIL] indicators for each subsystem.

Safety:
  Diagnostic only. Completely non-destructive.
`);
        return 0;

      case "repair":
        console.log(`Package Guard Help: repair

Syntax:
  pg repair [packages|database|config]

Description:
  Performs safe, conservative repairs on internal Package Guard components:
  - packages: Reinstalls and reconciles node_modules via detected package manager
  - database: Runs integrity checks, index optimization, and vacuuming
  - config:   Restores default configurations and project markers

Examples:
  pg repair
  pg repair packages
  pg repair database

Safety:
  Conservative. Never deletes SQLite database or destroys project source code.
`);
        return 0;

      case "security":
      case "audit":
        console.log(`Package Guard Help: security / audit

Syntax:
  pg audit
  pg security
  pg vulnerabilities
  pg fix-security

Description:
  Performs dependency vulnerability analysis grouped by severity (Critical, High,
  Medium, Low). 'fix-security' automatically creates a safety snapshot and installs
  available non-breaking vulnerability remediation.
`);
        return 0;

      case "clean":
        console.log(`Package Guard Help: clean

Syntax:
  pg clean <cache|snapshots|logs|all>

Description:
  Safely purges temporary caches, orphaned snapshot data, or log files.
  Never deletes the primary SQLite database or project files.
`);
        return 0;

      case "service":
        console.log(`Package Guard Help: service

Syntax:
  pg service <status|restart>
  pg ping
  pg sync
  pg queue

Description:
  Manages communication between the CLI and the Electron desktop application.
  - ping:    Verify live Named Pipe connectivity
  - status:  Check IPC service state
  - restart: Reinitialize communication listener
  - sync:    Flush offline queued PENDING events to Electron
  - queue:   Display technical IPC queue state
`);
        return 0;

      default:
        break;
    }
  }

  if (isJson) {
    outputSuccess({
      name: "PackageGuard CLI",
      version: "1.0.0",
      description: "PackageGuard authoritative command hierarchy for developers and AI coding agents",
      globalOptions: [
        { flag: "--json, -j", description: "Output machine-readable JSON format" },
        { flag: "--project, -p <path>", description: "Target specific project directory instead of cwd" },
        { flag: "--yes, -y, --force", description: "Bypass interactive confirmation prompts" }
      ],
      categories: [
        {
          name: "Project Management",
          commands: [
            { name: "init", syntax: "pg init [name]", description: "Initialize Package Guard for the current directory" },
            { name: "remove", syntax: "pg remove", description: "Untrack project from Package Guard (preserves project files)" },
            { name: "projects", syntax: "pg projects", description: "List all tracked projects" },
            { name: "project current", syntax: "pg project current", description: "Display active project info" },
            { name: "project switch", syntax: "pg project switch <name>", description: "Switch active project context" },
            { name: "project rename", syntax: "pg project rename <name>", description: "Rename current project" },
            { name: "project delete", syntax: "pg project delete <name>", description: "Delete project tracking data (preserves project files)" }
          ]
        },
        {
          name: "Scanning",
          commands: [
            { name: "scan", syntax: "pg scan [--deep|--force|--watch]", description: "Scan files, manifests, and packages" },
            { name: "rescan", syntax: "pg rescan", description: "Force fresh scan" },
            { name: "status", syntax: "pg status", description: "Show project state, counts, outdated, and security status" }
          ]
        },
        {
          name: "Package Information",
          commands: [
            { name: "packages", syntax: "pg packages", description: "List installed packages with versions, type, and status" },
            { name: "package", syntax: "pg package <name>", description: "Inspect a package (versions, advisories, location)" },
            { name: "info", syntax: "pg info <name>", description: "Alias for package inspection" },
            { name: "search", syntax: "pg search <query>", description: "Search packages by partial name" },
            { name: "tree", syntax: "pg tree", description: "Display dependency tree" },
            { name: "stats", syntax: "pg stats", description: "Display metrics and update counts" }
          ]
        },
        {
          name: "Changes & Diffs",
          commands: [
            { name: "changes", syntax: "pg changes", description: "Show added (+), removed (-), modified (~) files" },
            { name: "diff", syntax: "pg diff [<snap1> <snap2>]", description: "Show file differences against snapshot" },
            { name: "compare", syntax: "pg compare <p1> <p2>", description: "Compare dependency sets of two projects" }
          ]
        },
        {
          name: "Updates & Rollback",
          commands: [
            { name: "outdated", syntax: "pg outdated", description: "Check for available package updates" },
            { name: "update", syntax: "pg update <pkg> [--major]", description: "Update single package with automatic safety snapshot" },
            { name: "update --all", syntax: "pg update --all [--safe]", description: "Update all packages with accurate progress tracking" },
            { name: "upgrade", syntax: "pg upgrade", description: "Alias for batch package upgrade" },
            { name: "rollback", syntax: "pg rollback", description: "Rollback to latest safety snapshot" }
          ]
        },
        {
          name: "Snapshots",
          commands: [
            { name: "snapshot create", syntax: "pg snapshot [create] [name]", description: "Create a project snapshot" },
            { name: "snapshot list", syntax: "pg snapshot list", description: "List all recorded snapshots" },
            { name: "snapshot show", syntax: "pg snapshot show <id>", description: "Show details of a snapshot" },
            { name: "snapshot restore", syntax: "pg snapshot restore <id> [-y]", description: "Restore project state from snapshot" },
            { name: "snapshot delete", syntax: "pg snapshot delete <id> [-y]", description: "Delete snapshot safely" },
            { name: "snapshot export", syntax: "pg snapshot export <id> [--out <file>]", description: "Export snapshot to standalone file" },
            { name: "snapshot import", syntax: "pg snapshot import <file>", description: "Import snapshot from file" }
          ]
        },
        {
          name: "Security",
          commands: [
            { name: "audit", syntax: "pg audit", description: "Run dependency vulnerability inspection" },
            { name: "security", syntax: "pg security", description: "Overview of detected security risks" },
            { name: "vulnerabilities", syntax: "pg vulnerabilities", description: "List detected vulnerabilities by severity" },
            { name: "fix-security", syntax: "pg fix-security", description: "Automatically remediate security vulnerabilities" }
          ]
        },
        {
          name: "Verification",
          commands: [
            { name: "verify", syntax: "pg verify [--deep]", description: "Verify on-disk files vs recorded state" },
            { name: "check", syntax: "pg check", description: "Fast project health check" },
            { name: "integrity", syntax: "pg integrity", description: "Verify lockfile hashes and node_modules integrity" }
          ]
        },
        {
          name: "Cleaning & Diagnostics",
          commands: [
            { name: "clean", syntax: "pg clean <cache|snapshots|logs|all>", description: "Clean temporary files safely" },
            { name: "doctor", syntax: "pg doctor", description: "Run 11-subsystem health diagnostics (PASS/WARN/FAIL)" },
            { name: "repair", syntax: "pg repair [packages|database|config]", description: "Conservative self-repair" }
          ]
        },
        {
          name: "Configuration",
          commands: [
            { name: "config", syntax: "pg config [get|set|reset]", description: "List or modify configuration entries" },
            { name: "settings", syntax: "pg settings", description: "Categorized configuration summary" }
          ]
        },
        {
          name: "Service & IPC",
          commands: [
            { name: "ping", syntax: "pg ping", description: "Test Named Pipe connectivity to Electron" },
            { name: "service", syntax: "pg service <status|restart>", description: "Check or restart IPC communication" },
            { name: "sync", syntax: "pg sync", description: "Flush offline PENDING events to Electron" },
            { name: "queue", syntax: "pg queue", description: "Inspect technical event queue" }
          ]
        }
      ]
    });
    return 0;
  }

  console.log(`Package Guard CLI — Authoritative Command Hierarchy

Usage:
  pg <command> [subcommand] [options]

Global Options:
  --json, -j               Output machine-readable JSON format
  --project, -p <path>     Target specific project directory instead of cwd
  --yes, -y, --force       Bypass interactive confirmation prompts

Project Management:
  init                     Initialize Package Guard for the current directory
  remove                   Untrack project from Package Guard (preserves project files)
  projects                 List all tracked projects
  project current          Display active project info
  project switch <name>    Switch active project context
  project rename <name>    Rename current project
  project delete <name>    Delete project tracking data (preserves project files)

Scanning:
  scan [--deep|--force|--watch]  Scan files, manifests, and packages
  rescan                         Force fresh scan
  status                         Show project state, counts, outdated, and security status

Package Information:
  packages                 List installed packages with versions, type, and status
  package <name>           Inspect a package (versions, advisories, location)
  info <name>              Alias for package inspection
  search <query>           Search packages by partial name
  tree                     Display dependency tree
  stats                    Display metrics and update counts

Changes & Diffs:
  changes                  Show added (+), removed (-), modified (~) files
  diff [<snap1> <snap2>]   Show file differences against snapshot
  compare <p1> <p2>        Compare dependency sets of two projects

Updates & Rollback:
  outdated                 Check for available package updates
  update <pkg> [--major]   Update single package with automatic safety snapshot
  update --all [--safe]    Update all packages with accurate progress tracking
  upgrade                  Alias for batch package upgrade
  rollback                 Rollback to latest safety snapshot

Snapshots:
  snapshot [create] [name] Create a project snapshot
  snapshot list            List all recorded snapshots
  snapshot show <id>       Show details of a snapshot
  snapshot restore <id>    Restore project state from snapshot
  snapshot delete <id>     Delete snapshot safely
  snapshot export <id>     Export snapshot to standalone file
  snapshot import <file>   Import snapshot from file

History:
  history [--today|--project] Display user-facing event history
  history clear            Clear history records safely

Security:
  audit / security         Run dependency vulnerability inspection
  vulnerabilities          List detected vulnerabilities by severity
  fix-security             Automatically remediate security vulnerabilities

Verification:
  verify [--deep]          Verify on-disk files vs recorded state
  check                    Fast project health check
  integrity                Verify lockfile hashes and node_modules integrity

Cleaning & Diagnostics:
  clean <cache|snapshots|logs|all>  Clean temporary files safely
  doctor                   Run 11-subsystem health diagnostics (PASS/WARN/FAIL)
  repair [packages|database|config] Conservative self-repair

Configuration:
  config                   List configuration entries
  config get <key>         Get value of configuration key
  config set <key> <val>   Set configuration value
  config reset             Reset configuration to defaults
  settings                 Categorized configuration summary

Import & Export:
  export report            Export complete project audit report (JSON)
  export packages          Export package list (JSON, CSV, or TXT)
  export history           Export historical events
  import <file>            Import snapshot or configuration safely

Logs:
  logs                     Display recent structured logs
  logs error               Filter error entries only
  logs live                Stream live logs
  logs clear               Safely clear log files

Service & IPC:
  ping                     Test Named Pipe connectivity to Electron
  service status           Check Electron IPC service reachability
  service restart          Refresh IPC communication channel
  sync                     Flush offline PENDING events to Electron
  queue                    Inspect technical event queue

Backup & Restore:
  backup                   Create database and metadata backup
  backup list              List recorded backups
  backup restore [<id>]    Safely restore database from backup
  backup purge             Purge old backups beyond retention policy

System & Utility:
  install                  Install CLI binary shim
  uninstall                Uninstall CLI shim (preserves user data & DB)
  update-cli               Update CLI shim links
  path                     Display system paths and database location
  env                      Display OS, Node, and detected package managers
  version                  Display version info
  help [command]           Contextual help for commands
  about                    Application overview and architecture
  docs                     Documentation resources
  license                  License details
`);

  return 0;
}
