import { PACKAGE_GUARD_VERSION } from "@package-guard/shared/version";

export function executeAbout(): number {
  console.log(`Package Guard v${PACKAGE_GUARD_VERSION}
A resilient, snapshot-backed dependency & project integrity manager.

Architecture:
  - CLI:                TypeScript command-line interface with structured output
  - Desktop:            Electron desktop application (contextIsolation: true)
  - IPC:                Windows Named Pipe (\\\\.\\pipe\\PackageGuard) with JSON framing
  - Storage:            SQLite persistence (WAL mode) with offline event queuing
  - Safety Engine:      Automated pre-update snapshots & non-destructive rollbacks
  - Package Managers:   npm, pnpm, yarn, bun, pip

Data Directory:
  %LOCALAPPDATA%\\Package Guard\\

Author & License:
  PackageGuard Engineering Team — MIT License
`);
  return 0;
}
