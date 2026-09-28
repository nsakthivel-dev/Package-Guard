export type ProjectStatus = "ACTIVE" | "ARCHIVED";

export interface Project {
  id: string;
  name: string;
  path: string;
  created_at?: string;
  last_scan_at?: string | null;
  status?: ProjectStatus;
  // Optional compatibility fields
  packageManager?: string;
  package_manager?: string;
  active_snapshot_id?: string | null;
  createdAt?: number;
  updatedAt?: number;
  packageJson?: any;
}


export type ChangeType = "ADDED" | "MODIFIED" | "DELETED";

export interface FileChange {
  path: string;
  type: ChangeType;
  oldHash?: string;
  newHash?: string;
  oldSize?: number;
  newSize?: number;
}

export interface ScanResult {
  id: string;
  projectId: string;
  projectName: string;
  projectPath: string;
  filesScanned: number;
  packagesDetected: number;
  changesDetected: number;
  durationMs: number;
  status: "SUCCESS" | "WARNING" | "FAILED";
  changes: FileChange[];
  files: Array<{ relativePath: string; hash: string; size: number }>;
  packages: PackageInfo[];
  createdAt: string;
}

export interface Snapshot {
  id: string;
  project_id: string;
  name: string;
  description?: string | null;
  file_count: number;
  package_count: number;
  manifest_json: string; // JSON of files & packages
  status: "ACTIVE" | "RESTORED" | "DELETED";
  created_at: string;
}

export interface SnapshotManifest {
  snapshotId: string;
  projectId: string;
  createdAt: string;
  files: Array<{ relativePath: string; hash: string; size: number; storagePath: string }>;
  packages: PackageInfo[];
}

export interface SnapshotFile {
  id: string;
  snapshot_id: string;
  relative_path: string;
  file_hash: string;
  size_bytes: number;
  storage_path: string;
}

export interface PackageInfo {
  name: string;
  version: string;
  type: "dependency" | "devDependency" | "peerDependency" | "optionalDependency" | "transitive" | "python" | "optional";
  source: "npm" | "pnpm" | "yarn" | "pip" | "unknown";
  status: "installed" | "missing";
}

export interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  type: string;
}

export interface VerificationResult {
  filesChecked: number;
  valid: number;
  changed: number;
  missing: number;
  unexpected: number;
  status: "OK" | "CHANGES DETECTED" | "CORRUPTED" | "FAILED";
  details: Array<{ file: string; issue: string }>;
}

export interface DoctorCheck {
  name: string;
  status: "OK" | "FAIL" | "WARN";
  message: string;
}

export interface DoctorReport {
  overall: "OK" | "FAIL";
  checks: DoctorCheck[];
}

export interface RepairItem {
  description: string;
  status: "OK" | "FAILED" | "SKIPPED";
}

export interface RepairReport {
  repairs: RepairItem[];
  completed: number;
  failed: number;
}

export interface PackageGuardConfig {
  projectName: string;
  projectPath: string;
  databasePath: string;
  snapshotStoragePath: string;
  communication: string;
  autoSync: boolean;
}

export interface HistoryItem {
  id: string;
  project_id?: string | null;
  event_type: "SCAN" | "UPDATE" | "SNAPSHOT" | "RESTORE" | "VERIFY" | "ROLLBACK" | "INIT" | "CLEAN" | "CONFIG" | "SECURITY";
  description: string;
  details_json?: string | null;
  created_at: string;
}

export interface BackupMetadata {
  id: string;
  backup_path: string;
  size_bytes: number;
  description?: string | null;
  created_at: string;
}

export interface SecurityAdvisory {
  id: string;
  package_name: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  title?: string;
  vulnerable_versions?: string;
  fixed_in?: string;
  url?: string;
  created_at: string;
}

export interface CliCommandResult<T = unknown> {
  success: boolean;
  command: string;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    durationMs?: number;
    projectId?: string;
    timestamp?: string;
  };
}

export const EXIT_SUCCESS = 0;
export const EXIT_GENERAL_ERROR = 1;
export const EXIT_INVALID_ARGUMENTS = 2;
export const EXIT_PROJECT_ERROR = 3;
export const EXIT_VERIFICATION_ERROR = 4;
export const EXIT_SERVICE_ERROR = 5;

// Re-export compatibility types from types/index.js if needed
export * from "./types/index.js";

