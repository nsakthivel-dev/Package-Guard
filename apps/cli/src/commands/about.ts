import { PACKAGE_GUARDIAN_VERSION } from "@package-guard/shared/version";

export function executeAbout(): number {
  console.log(`Package Guardian v${PACKAGE_GUARDIAN_VERSION}
A resilient, snapshot-backed dependency & project integrity manager.

Architecture:
  - CLI:                TypeScript command-line interface with structured output
  - Desktop:            Electron desktop application (contextIsolation: true)
  - IPC:                Windows Named Pipe (\\\\.\\pipe\\PackageGuardian) with JSON framing
  - Storage:            SQLite persistence (WAL mode) with offline event queuing
  - Safety Engine:      Automated pre-update snapshots & non-destructive rollbacks
  - Package Managers:   npm, pnpm, yarn, bun, pip

Data Directory:
  %APPDATA%\\PackageGuardian\\

Author & License:
  Package Guardian Engineering Team — Lupus Venture — MIT License
`);
  return 0;
}
