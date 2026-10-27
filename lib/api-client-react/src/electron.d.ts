export interface ElectronAPI {
  // Dashboard
  getDashboardSummary: () => Promise<any>;
  getStatusBreakdown: () => Promise<any[]>;

  // Environments
  scanEnvironments: () => Promise<any[]>;
  getEnvironments: () => Promise<any[]>;
  createEnvironment: (env: any) => Promise<any>;
  deleteEnvironment: (id: string) => Promise<void>;
  scanEnvironment: (id: string) => Promise<any[]>;
  
  // Packages
  getPackages: (params: any) => Promise<any[]>;
  checkVersions: (packages: any[]) => Promise<any[]>;
  updatePackage: (data: any) => Promise<any>;
  updateBatch: (data: any) => Promise<any[]>;
  deletePackage: (data: { packageName: string; ecosystem: string; envPath?: string }) => Promise<any>;
  onUpdateProgress: (callback: (data: any) => void) => () => void;
  
  // Settings
  getSettings: () => Promise<any>;
  updateSettings: (settings: any) => Promise<void>;
  getSystemInfo?: () => Promise<{ logicalCores: number; defaultConcurrency: number; maxConcurrency: number }>;
  
  // Snapshots
  getSnapshots: () => Promise<any[]>;
  createSnapshot: (data: any) => Promise<any>;
  deleteSnapshot: (id: number) => Promise<void>;
  restoreSnapshot: (id: number) => Promise<any>;
  
  // History
  getHistory: (limit?: number) => Promise<any[]>;

  // Venv Handlers
  scanVenvs: (rootDir: string) => Promise<any[]>;
  getVenvPackages: (venvPath: string) => Promise<{ success: boolean; packages: any[]; error?: string }>;
  updateVenvPackage: (data: { venvPath: string; packageName: string }) => Promise<any>;
  getVenvMeta: (venvPath: string) => Promise<any>;
  getRegisteredVenvs: () => Promise<any[]>;
  registerVenv: (venv: any) => Promise<any[]>;
  removeVenv: (path: string) => Promise<any[]>;

  // Cache / fast startup
  getBootstrap: () => Promise<{
    environments: any[];
    packages: any[];
    cacheFresh: boolean;
    cacheDurationHours: number;
  }>;
  getCachedPackages: () => Promise<any[]>;
  saveScanCache: (packages: any[]) => Promise<void>;
  
  // Auto-scan trigger
  // Project Environments
  getProjects: () => Promise<any[]>;
  renameProject: (projectId: string, newName: string) => Promise<{ success: boolean; unchanged?: boolean; project?: any; oldName?: string; newName?: string; message?: string }>;
  removeProject: (projectId: string) => Promise<{ success: boolean; projectId: string; projectName?: string; alreadyRemoved?: boolean }>;
  getProjectPackages: (projectId: string) => Promise<any[]>;
  getProjectSnapshots: (projectId: string, limit?: number) => Promise<any[]>;
  scanProject: (projectId: string) => Promise<any>;
  onProjectsUpdated: (cb: (data?: any) => void) => () => void;
  onDataChanged: (cb: (data?: any) => void) => () => void;

  // Window Controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  openDirectory: (defaultPath?: string) => Promise<string | null>;
  focusWindow?: () => Promise<void>;

  // OS / CLI / App helpers
  cliInstall?: () => Promise<any>;
  cliUninstall?: () => Promise<any>;
  cliStatus?: () => Promise<any>;
  openInFolder?: (target: string) => Promise<any>;
  getAppVersion?: () => Promise<string>;
  getDataRoot?: () => Promise<any>;
  uninstallApp?: (mode: string) => Promise<any>;

  // Event Listeners
  onAutoScanTrigger?: (cb: () => void) => () => void;
  onSnapshotCreated?: (cb: (data?: any) => void) => () => void;
  onOpenProject?: (cb: (data?: any) => void) => void;
  onOpenCheckout?: (cb: (data?: any) => void) => void;
  onProjectScanUpdate?: (cb: (data?: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
