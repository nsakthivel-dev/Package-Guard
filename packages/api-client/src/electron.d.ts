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
  onAutoScanTrigger: (cb: () => void) => void;

  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  openDirectory: () => Promise<string | null>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
