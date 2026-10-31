/**
 * Package Guardian shared constants.
 */

export const LOCKFILE_CANDIDATES: ReadonlyArray<[string, 'npm' | 'pnpm' | 'yarn' | 'bun']> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['package-lock.json', 'npm'],
];

export const DEFAULT_DB_META = { version: 1 } as const;

export const DEFAULT_NOTIFY_SOCKET_WIN = '\\\\.\\pipe\\package-guardian-notify';
export const LEGACY_NOTIFY_SOCKET_WIN = '\\\\.\\pipe\\package-guard-notify';

export const VENV_DIRS_CHECK = ['.venv', 'venv', 'env', '.env', '__venv__'] as const;

export const PYTHON_PROJECT_MARKERS = [
  'requirements.txt', 'requirements-dev.txt', 'requirements-base.txt',
  'pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile',
] as const;

export const ALL_LOCKFILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
] as const;

export const DEFAULT_APP_CONFIG = {
  version: 1,
  telemetry: false,
  autoScan: true,
  notifyElectron: true,
  logLevel: 'info' as const,
} as const;
