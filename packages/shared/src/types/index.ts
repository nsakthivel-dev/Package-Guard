export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface Project {
  id: string;
  name: string;
  path: string;
  packageManager?: PackageManager;
  packageJson?: any;
  createdAt?: number;
  updatedAt?: number;
  created_at?: string;
  last_scan_at?: string | null;
  status?: "ACTIVE" | "ARCHIVED";
}

export interface SnapshotPackage {
  name: string;
  version: string;
  type: 'dependency' | 'devDependency' | 'optional' | 'peerDependency' | 'transitive' | 'python';
}

export interface PgSnapshot {
  id: string;
  projectId: string;
  message?: string;
  name?: string;
  packages: SnapshotPackage[];
  packageCount: number;
  parentId?: string | null;
  createdAt: number | string;
  treeHash?: string;
}

export interface DiffEntry {
  name: string;
  fromVersion: string | null;
  toVersion: string | null;
  changeType: 'added' | 'removed' | 'changed' | 'upgraded' | 'downgraded';
}

export interface LockfileData {
  packageManager: string;
  packages: SnapshotPackage[];
}

export interface DbMeta {
  version: number;
}

export interface DatabaseShape {
  projects: Project[];
  snapshots: PgSnapshot[];
  meta: DbMeta;
  [key: string]: unknown;
}

export interface AppConfig {
  version: number;
  telemetry: boolean;
  autoScan: boolean;
  notifyElectron: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DatabaseSchema = {
  safeParse: (raw: any) => ({ success: true, data: raw })
};
