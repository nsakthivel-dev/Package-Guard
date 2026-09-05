import { create, StateCreator } from 'zustand';
import { Package, Environment } from "@packageguard/api-client-react";

export type ScanStatus = 'idle' | 'scanning-envs' | 'scanning-packages' | 'checking-versions';

export interface UpdateProgress {
  packageName: string;
  status: 'idle' | 'installing' | 'downloading' | 'auditing' | 'complete' | 'failed' | 'done';
  message: string;
  size?: string;
  percent?: number;
}

interface PackageStore {
  environments: Environment[];
  packages: Package[];
  scanStatus: ScanStatus;
  lastScanned: number | null;
  updateProgress: Record<string, UpdateProgress>;
  activeVenvPath: string | null;
  
  setEnvironments: (envs: Environment[]) => void;
  setPackages: (pkgs: Package[]) => void;
  updatePackageVersions: (results: any[]) => void;
  setScanStatus: (status: ScanStatus) => void;
  setLastScanned: (ts: number | null) => void;
  setUpdateProgress: (packageName: string, progress: Partial<UpdateProgress>) => void;
  clearUpdateProgress: (packageName?: string) => void;
  setActiveVenvPath: (path: string | null) => void;
}

export const usePackageStore = create<PackageStore>()((set) => ({
  environments: [],
  packages: [],
  scanStatus: 'idle',
  lastScanned: null,
  updateProgress: {},
  activeVenvPath: null,

  setEnvironments: (envs: Environment[]) => set({ environments: envs }),
  setPackages: (pkgs: Package[]) => set({ packages: pkgs }),
  setActiveVenvPath: (path) => set({ activeVenvPath: path }),
  updatePackageVersions: (results: any[]) => set((state: PackageStore) => ({
    packages: state.packages.map((pkg: Package) => {
      const update = results.find((r: any) => {
        if (r.ecosystem !== pkg.ecosystem) return false;
        
        // Robust matching for Pip (case-insensitive, normalized) vs NPM (case-sensitive)
        if (pkg.ecosystem === 'npm') {
          return r.name === pkg.name;
        } else {
          const n1 = r.name.toLowerCase().replace(/[._]/g, '-');
          const n2 = pkg.name.toLowerCase().replace(/[._]/g, '-');
          return n1 === n2;
        }
      });
      return update
        ? {
            ...pkg,
            latestVersion: update.latestVersion ?? update.latest ?? pkg.latestVersion,
            status: update.status ?? pkg.status,
          }
        : pkg;
    })
  })),
  setScanStatus: (status: ScanStatus) => set({ scanStatus: status }),
  setLastScanned: (ts: number | null) => set({ lastScanned: ts }),
  setUpdateProgress: (packageName, progress) => set((state) => ({
    updateProgress: {
      ...state.updateProgress,
      [packageName]: {
        ...(state.updateProgress[packageName] || { packageName, status: 'idle', message: '' }),
        ...progress
      }
    }
  })),
  clearUpdateProgress: (packageName) => set((state) => {
    if (packageName) {
      const next = { ...state.updateProgress };
      delete next[packageName];
      return { updateProgress: next };
    }
    return { updateProgress: {} };
  }),
}));
