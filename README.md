# 🛡️ PackageGuard

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](package.json)
[![Platform](https://img.shields.io/badge/platform-Windows%20x64-0078D6.svg?logo=windows)](https://microsoft.com)
[![Electron](https://img.shields.io/badge/electron-33.2.1-47848F.svg?logo=electron)](https://electronjs.org)
[![React](https://img.shields.io/badge/react-19.1.0-61DAFB.svg?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/typescript-5.9.2-3178C6.svg?logo=typescript)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**PackageGuard** is an institutional-grade security auditing and dependency management platform for Windows. It provides a synchronized desktop interface (Electron + React) alongside an autonomous command-line tool (`pg`), unified by a shared SQLite engine and high-throughput Windows Named Pipe inter-process communication.

---

## 🏛️ System Architecture

PackageGuard implements a dual-interface architecture where both the Desktop GUI and CLI command runner operate concurrently over a single source of truth.

```
┌─────────────────────────────────────────────────────────────┐
│                    PackageGuard Platform                    │
└─────────────────────────────────────────────────────────────┘
          │                                         │
    ┌─────▼──────┐                           ┌──────▼─────┐
    │  pg.exe    │                           │ Electron   │
    │  (CLI Tool)│                           │ Main Proc  │
    └─────┬──────┘                           └──────┬─────┘
          │                                         │
          │ ─── Windows Named Pipe (\\.\pipe\...) ──│
          │     (LIVE JSON Protocol: PING/ACK)      │
          │                                         │
          │                                  ┌──────▼──────┐
          │                                  │   Preload   │
          │                                  │ (ContextIso)│
          │                                  └──────┬──────┘
          │                                         │
          │                                  ┌──────▼──────┐
          │                                  │ React UI    │
          │                                  │ (Renderer)  │
          │                                  └─────────────┘
          │                                         │
          ▼                                         ▼
   ┌───────────────────────────────────────────────────────┐
   │         Unified SQLite Engine (WAL Mode)              │
   │  %APPDATA%\PackageGuard\packageguard.db               │
   │  - projects, scans, snapshots, snapshot_files,        │
   │    history, config, backups, events, security         │
   └───────────────────────────────────────────────────────┘
```

### Key Pillars

1. **Dual Execution Engine**:
   - **Electron Desktop**: Full-featured React 19 interface with real-time analytics, risk indicators, environment autodiscovery, and visual snapshot inspection.
   - **CLI (`pg`)**: Native Windows standalone executable (`pg.exe`) capable of running completely headless in CI/CD pipelines or automated developer scripts.

2. **Windows Named Pipe IPC**:
   - Pipe Address: `\\.\pipe\PackageGuard`
   - Protocol: Newline-delimited JSON with handshake contracts (`PING` $\rightarrow$ `PONG` $\rightarrow$ `ACK`).
   - Push notifications notify the Electron UI immediately when CLI actions occur.

3. **Offline-Resilient Event Queue**:
   - When the Electron GUI is closed, `pg` logs operations to SQLite with status `PENDING`.
   - Upon Electron startup, `recoverPendingEvents()` processes all queued actions, elevates their status to `SYNCED`, and pushes live state updates to the UI.

4. **Zero-Destruction Safety Guarantees**:
   - Automated safety snapshots are created before executing any package update or upgrade.
   - Deterministic progress tracking (`completed / total * 100`).
   - One-command rollback (`pg rollback`) restores working trees if an update breaks builds.

---

## 📥 Download Official Release

Download the official Windows installer (`.exe`) directly from the GitHub Releases page:

* **Official Releases**: [Package-Guard Releases](https://github.com/nsakthivel-dev/Package-Guard/releases)
* **Latest Windows Installer**: [PackageGuard-Setup.exe (v1.0.0)](https://github.com/nsakthivel-dev/Package-Guard/releases/download/v1.0.0/PackageGuard-Setup.exe)

---

## ⚡ Quick Start

### Prerequisites
* Windows 10/11 64-bit
* Node.js $\ge$ 20.0.0
* [pnpm](https://pnpm.io) $\ge$ 9.0.0
* .NET Framework 4.5+ (`csc.exe` for compiling the CLI wrapper)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/nsakthivel-dev/Package-Guard.git
cd Package-Guard

# Install workspace dependencies
pnpm install

# Run full repository typecheck
pnpm run typecheck

# Launch Desktop application in development mode
pnpm run dev
```

---

## 💻 CLI Manual (`pg`)

The `pg` CLI provides 50+ enterprise commands for dependency auditing, snapshotting, and system repairs.

### 1. Project Management
```bash
pg init [path]               # Track a new project environment
pg projects                  # List all tracked projects and package managers
pg project current           # Display the project matching current working directory
pg project switch <name|id>  # Switch active target project
pg project rename <new-name> # Rename current tracked project
pg project delete <name|id>  # Unregister project from PackageGuard
pg remove                    # Alias for project unregister
```

### 2. Scanning & Health Inspection
```bash
pg scan                      # Fast scan of current project manifest & lockfiles
pg scan --deep               # Deep scan analyzing nested node_modules / venv packages
pg scan --force              # Force complete rescan ignoring cached states
pg scan --watch              # Watch project manifests and scan automatically on change
pg rescan                    # Trigger immediate re-evaluation of dependencies
pg status                    # Project health status, drift metrics, and snapshot state
```

### 3. Package Inspection
```bash
pg packages                  # Output detailed table of all detected dependencies
pg package <name>            # Inspect detailed metadata for a specific package
pg search <query>            # Filter and search packages by name or pattern
pg info <name>               # Retrieve registry information and security profile
pg tree                      # Visual dependency hierarchy tree
pg stats                     # Numerical breakdown (direct, transitive, dev, prod)
```

### 4. Changes & Diffs
```bash
pg changes                   # List modified, added, or removed packages since last scan
pg diff                      # Detailed comparison against baseline snapshot
pg compare <snapA> <snapB>   # Compare two arbitrary snapshot states
```

### 5. Updates & Rollback Safety
```bash
pg outdated                  # Check for upstream version drift (SemVer)
pg update <name>             # Update a specific package with automatic safety snapshot
pg update --safe             # Update only non-breaking patch and minor versions
pg update --major            # Update including major version bumps
pg update --all              # Update all outdated dependencies with progress reporting
pg upgrade                   # Interactive dependency upgrade wizard
pg rollback                  # Instantly revert working tree to pre-update snapshot
```

### 6. Snapshots
```bash
pg snapshot                  # Overview of project snapshots
pg snapshot create [name]    # Create an immutable snapshot of package states
pg snapshot list             # Tabulate all stored snapshots with timestamps & counts
pg snapshot show <id>        # View detailed manifest of a snapshot
pg snapshot restore <id> -y  # Revert package manifest to exact snapshot state
pg snapshot delete <id>      # Safely prune snapshot record and file blobs
pg snapshot export <id>      # Export snapshot archive to portable JSON file
pg snapshot import <file>    # Import external snapshot archive into database
```

### 7. Security Audits & Vulnerabilities
```bash
pg audit                     # Execute institutional security audit against advisories
pg security                  # View security summary and CVE threat index
pg vulnerabilities           # List identified vulnerabilities and severities
pg fix-security              # Automatically patch vulnerabilities where fixes exist
```

### 8. Verification & Integrity
```bash
pg verify                    # Verify integrity of lockfiles against installed packages
pg verify --deep             # Check SHA hashes of package artifacts on disk
pg check                     # Fast health validation of project structure
pg integrity                 # Cryptographic verification of snapshot store
```

### 9. Diagnostics & Self-Repair
```bash
pg doctor                    # Diagnostic scan of CLI, Electron, Pipes, SQLite, & PATH
pg repair database           # Verify and heal SQLite tables, indexes, and WAL journal
pg repair config             # Restore configuration values to healthy defaults
pg repair packages           # Reinstall missing or corrupted modules
```

### 10. Service, Queue & IPC
```bash
pg ping                      # Send test ping over Named Pipe to running Electron
pg service status            # Inspect state of Electron process and Pipe server
pg service restart           # Restart PackageGuard background service
pg queue                     # Inspect pending/synced event queue in SQLite
pg sync                      # Flush offline pending events to active Electron session
```

### 11. Maintenance, Clean & Backup
```bash
pg clean cache               # Purge package calculation cache
pg clean snapshots           # Prune old snapshot archives
pg clean logs                # Truncate diagnostic log files
pg clean all                 # Complete cache and temp file cleanup
pg backup                    # Create instant snapshot backup of packageguard.db
pg backup list               # List all database backups
pg backup restore <id>       # Restore database from specified backup
```

### 12. Utilities & System Integration
```bash
pg install                   # Register 'pg' shim in system PATH
pg uninstall                 # Remove 'pg' shim from system PATH
pg path                      # Display resolved runtime storage directories
pg env                       # Show environment variables and runtime architecture
pg version                   # Print PackageGuard CLI version
pg help [command]            # Contextual manual and option descriptions
```

---

## 🖥️ Desktop GUI Highlights

* **Institutional Dashboard**: Real-time KPI cards displaying Total Packages, Up to Date, Minor Drifts, Major Drifts, and Security Alerts.
* **Live IPC Indicator**: Visual connection beacon reflecting `LIVE` (Named Pipe connected), `SYNCED` (queued events reconciled), or `OFFLINE` (independent database mode).
* **Multi-Ecosystem Discovery**: Automatic detection of Python Virtual Environments (`venv`, `.venv`, Conda) alongside Node.js (`npm`, `pnpm`, `yarn`).
* **Interactive Snapshots**: Visual diff inspector showing added, removed, and upgraded packages across historical checkpoints.

---

## 🛠️ Build & Packaging

PackageGuard uses an automated production build pipeline:

```bash
# 1. Clean previous build artifacts
pnpm run clean

# 2. Build all libraries (shared, database, core, cli)
pnpm run build:libs

# 3. Build React / Vite frontend bundle
pnpm run build:frontend

# 4. Compile native C# CLI wrapper (dist-cli/pg.exe)
pnpm run build:cli-exe

# 5. Stage production node_modules (better-sqlite3-electron, etc.)
pnpm run build:modules

# 6. Package Electron executable and NSIS Installer
pnpm run build:electron
```

### Production Artifacts

* **Windows NSIS Installer**: `release/PackageGuard-Setup.exe`
* **Packaged Electron Executable**: `release/win-unpacked/PackageGuard.exe`
* **Packaged CLI Executable**: `release/win-unpacked/cli/pg.exe`
* **Standalone CLI Executable**: `dist-cli/pg.exe`

---

## 📂 Storage Architecture

PackageGuard stores runtime state cleanly under the user's roaming directory:

| Resource | Path |
| :--- | :--- |
| **User Data Root** | `%APPDATA%\PackageGuard\` |
| **Unified SQLite DB** | `%APPDATA%\PackageGuard\data\packageguard.db` |
| **Snapshot Store** | `%APPDATA%\PackageGuard\snapshots\` |
| **Runtime Logs** | `%APPDATA%\PackageGuard\logs\` |
| **Configuration** | `%APPDATA%\PackageGuard\config\settings.json` |

---

## 🧪 Quality & Validation

The repository enforces strict TypeScript static verification across all monorepo packages:

```bash
# Run comprehensive TypeScript typecheck across all workspaces
pnpm run typecheck
```

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

© 2026 Lupus Venture / PackageGuard Institutional Security.
