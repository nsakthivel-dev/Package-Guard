const path = require('path');
const fs = require('fs');
// ─── Runtime path manager (portable data directory) ───────────────────────────
// NEVER use process.cwd() or app.getPath('userData') directly for storage.
// All runtime file paths come exclusively from runtimePaths.
const rp = require('../runtimePaths');
const installationState = require('../installationState');
const { guardedReadJson, guardedWriteJson, backupCorruptedFile, assertSafeWritePath } = require('../pathGuard');
const storagePath = rp.paths.dbFile;

// JSON-based persistent store
const store = {
  environments: [],
  packages: [],
  settings: {
    id: 1,
    safeMode: true,
    cacheDurationHours: 6,
    concurrencyLimit: 5,
    autoSnapshotBeforeUpdate: true,
    theme: 'dark',
    customScanPaths: [],
    backgroundPermission: null, // null = not asked, true = allowed, false = denied
    dontAskAgain: false,
    defaultVenvScanDir: '',
    autoScanVenvsOnStartup: false,
    includeVenvsInDashboard: true,
    securityLevel: 'Standard',
    ignoredPackages: []
  },
  history: [],
  snapshots: [],
  venvs: []
};

// Centralized name normalization for consistency across lookups
function normalizePackageName(name, ecosystem) {
  if (!name) return '';
  if (ecosystem === 'npm') return name; // NPM is case-sensitive
  return name.toLowerCase().replace(/[._]/g, '-'); // Pip is case-insensitive and normalizes . and _ to -
}

/**
 * Resolve a package's environmentId to the canonical global-* id.
 * Handles pip, npm, pnpm, and yarn so packages are always bucketed
 * into the correct global environment record.
 */
function resolveEnvId(rawEnvId, ecosystem) {
  const envId = rawEnvId || 'global';
  if (envId === 'global') {
    if (ecosystem === 'pip')  return 'global-pip';
    if (ecosystem === 'npm')  return 'global-npm';
    if (ecosystem === 'pnpm') return 'global-pnpm';
    if (ecosystem === 'yarn') return 'global-yarn';
  }
  return envId;
}

function loadStorage() {
  try {
    const result = guardedReadJson(storagePath);
    if (result.ok && result.data) {
      const data = result.data;
      
      // Migrate legacy snake_case settings if they exist
      if (data.settings) {
        const legacy = data.settings;
        const migrated = {
          ...legacy, // Preserve all existing settings, including backgroundPermission and dontAskAgain
          id: 1,
          safeMode: legacy.safe_mode !== undefined ? Boolean(legacy.safe_mode) : (legacy.safeMode ?? true),
          cacheDurationHours: legacy.cache_duration_hours ?? (legacy.cacheDurationHours ?? 6),
          concurrencyLimit: legacy.concurrency_limit ?? (legacy.concurrencyLimit ?? 5),
          autoSnapshotBeforeUpdate: legacy.auto_snapshot_before_update !== undefined ? Boolean(legacy.auto_snapshot_before_update) : (legacy.autoSnapshotBeforeUpdate ?? true),
          theme: legacy.theme ?? 'dark',
          customScanPaths: typeof legacy.custom_scan_paths === 'string' ? JSON.parse(legacy.custom_scan_paths) : (legacy.customScanPaths ?? []),
          securityLevel: legacy.securityLevel ?? 'Standard',
          ignoredPackages: Array.isArray(legacy.ignoredPackages) ? legacy.ignoredPackages : []
        };
        
        // Remove legacy keys and separated permission keys
        delete migrated.safe_mode;
        delete migrated.cache_duration_hours;
        delete migrated.concurrency_limit;
        delete migrated.auto_snapshot_before_update;
        delete migrated.custom_scan_paths;
        delete migrated.backgroundPermission;
        delete migrated.dontAskAgain;
        
        data.settings = migrated;
      }

      // Cleanup duplicate environments on load
      if (data.environments && Array.isArray(data.environments)) {
        const seenEnv = new Set();
        data.environments = data.environments.filter(e => {
          const key = e.id || `${e.path}|${e.type}`;
          if (seenEnv.has(key)) return false;
          seenEnv.add(key);
          return true;
        });

        // Fix invalid global-pip path (if it points to a missing file like C:\Python314\python.exe)
        const globalPipEnv = data.environments.find(e => e.id === 'global-pip');
        if (globalPipEnv && globalPipEnv.path && !fs.existsSync(globalPipEnv.path)) {
          console.log('[STORAGE] Detected invalid global pip path, will reset on next scan:', globalPipEnv.path);
        }
      }

      // Cleanup duplicate packages on load and normalize names
      if (data.packages && Array.isArray(data.packages)) {
        const seen = new Set();
        data.packages = data.packages.filter(p => {
          const envId = resolveEnvId(p.environmentId || p.envId || p.env_id, p.ecosystem);
          const normName = normalizePackageName(p.name, p.ecosystem);
          const key = `${envId}|${normName}|${p.ecosystem}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        
        // Ensure all loaded packages use standardized fields
        data.packages.forEach(p => {
          p.environmentId = resolveEnvId(p.environmentId || p.envId || p.env_id, p.ecosystem);
        });
      }

      Object.assign(store, data);

      // Normalize all existing data to camelCase
      if (Array.isArray(store.environments)) {
        store.environments.forEach(e => {
          if (e.created_at) { e.createdAt = e.created_at; delete e.created_at; }
          if (e.package_count !== undefined) { e.packageCount = e.package_count; delete e.package_count; }
          if (e.is_active !== undefined) { e.isActive = e.is_active; delete e.is_active; }
          if (e.last_scanned) { e.lastScanned = e.last_scanned; delete e.last_scanned; }
        });
      }

      if (Array.isArray(store.snapshots)) {
        store.snapshots.forEach(s => {
          if (s.created_at) { s.createdAt = s.created_at; delete s.created_at; }
          if (s.package_count !== undefined) { s.packageCount = s.package_count; delete s.package_count; }
          if (s.package_name) { s.packageName = s.package_name; delete s.package_name; }
          if (s.package_version) { s.packageVersion = s.package_version; delete s.package_version; }
        });
      }

      console.log('[STORAGE] Data loaded, migrated, and deduplicated from', storagePath);
    } else if (result.error === 'FILE_NOT_FOUND') {
      console.log('[STORAGE] No existing data found, starting fresh');
      saveStorage(); // Create the file
    } else {
      // Corruption detected
      console.warn(`[STORAGE] Storage file corrupted (${result.error}), creating backup and resetting to defaults.`);
      backupCorruptedFile(storagePath);
      saveStorage();
    }
  } catch (err) {
    console.error('[STORAGE] Failed to load data:', err.message);
  }
}

function saveStorage() {
  try {
    const res = guardedWriteJson(storagePath, store);
    if (!res.ok) {
      console.error('[STORAGE] Failed to save data via pathGuard:', res.error);
    }
  } catch (err) {
    console.error('[STORAGE] Failed to save data:', err.message);
  }
}

// Initialize storage
loadStorage();

module.exports = {
  saveStorage,
  // Environments
  getEnvironments: () => store.environments,
  getEnvironment: (id) => store.environments.find(e => e.id === id),
  insertEnvironment: (env) => {
    const existingIndex = store.environments.findIndex(e => e.id === env.id || (e.path === env.path && e.type === env.type));
    const newEnv = { 
      ...env, 
      createdAt: existingIndex >= 0 ? (store.environments[existingIndex].createdAt || store.environments[existingIndex].created_at) : Date.now(), 
      packageCount: existingIndex >= 0 ? (store.environments[existingIndex].packageCount || store.environments[existingIndex].package_count) : 0, 
      isActive: 1,
      lastScanned: existingIndex >= 0 ? (store.environments[existingIndex].lastScanned || store.environments[existingIndex].last_scanned) : null,
      // Always update these fields even if existing
      path: env.path,
      environmentPath: env.environmentPath,
      name: env.name,
      type: env.type
    };

    if (existingIndex >= 0) {
      store.environments[existingIndex] = { ...store.environments[existingIndex], ...newEnv };
    } else {
      store.environments.push(newEnv);
    }
    
    // Also update all packages associated with this environment to use the new path
    if (env.path && env.id) {
      store.packages.forEach(pkg => {
        if (pkg.environmentId === env.id || pkg.envId === env.id || pkg.env_id === env.id) {
          pkg.environmentPath = env.path;
          pkg.lastChecked = Date.now();
        }
      });
    }
    
    saveStorage();
    return newEnv.id;
  },
  deleteEnvironment: (id) => {
    store.packages = store.packages.filter(p => p.environmentId !== id && p.envId !== id && p.env_id !== id);
    store.environments = store.environments.filter(e => e.id !== id);
    saveStorage();
  },
  updateEnvironmentScan: (id, count) => {
    const lastScanned = Date.now();
    const env = store.environments.find(e => e.id === id);
    if (env) {
      env.packageCount = count;
      env.lastScanned = lastScanned;
      saveStorage();
    }
  },

  // Packages
  getPackages: (envId) => {
    if (!envId || envId === 'all') return store.packages;
    return store.packages.filter(p => p.environmentId === envId || p.envId === envId || p.env_id === envId);
  },
  upsertPackage: (pkg, skipSave = false) => {
    const lastChecked = Date.now();
    const envId = resolveEnvId(pkg.environmentId || pkg.envId || pkg.env_id, pkg.ecosystem);
    const normName = normalizePackageName(pkg.name, pkg.ecosystem);

    const index = store.packages.findIndex(p => 
      (p.environmentId === envId || p.envId === envId || p.env_id === envId) && 
      normalizePackageName(p.name, p.ecosystem) === normName && 
      p.ecosystem === pkg.ecosystem
    );
    
    const updatedPkg = { 
      ...pkg, 
      environmentId: envId, 
      lastChecked, 
      id: index >= 0 ? store.packages[index].id : Date.now() + Math.random() 
    };
    
    if (index >= 0) {
      // Merge: preserve fields that are missing in the new object (like environmentName)
      store.packages[index] = { ...store.packages[index], ...updatedPkg };
    } else {
      store.packages.push(updatedPkg);
    }
    if (!skipSave) saveStorage();
  },
  deletePackage: (envId, packageName) => {
    store.packages = store.packages.filter(p => {
      const pEnvId = p.environmentId || p.envId || p.env_id;
      return !(pEnvId === envId && p.name === packageName);
    });
    saveStorage();
  },
  updatePackageStatus: (id, status, version) => {
    const pkg = store.packages.find(p => p.id === id);
    if (pkg) {
      pkg.status = status;
      pkg.installedVersion = version;
      saveStorage();
    }
  },

  // Settings
  getSettings: () => {
    const perm = installationState.getPermissionState();
    return {
      ...store.settings,
      backgroundPermission: perm.backgroundPermission,
      dontAskAgain: perm.dontAskAgain,
    };
  },
  updateSettings: (newSettings) => {
    // Some API clients wrap the update in a 'data' property
    const actualSettings = newSettings && newSettings.data ? newSettings.data : newSettings;

    // Delegate installation/permission state to installationState
    if (actualSettings.backgroundPermission !== undefined || actualSettings.dontAskAgain !== undefined) {
      installationState.setPermissionState({
        backgroundPermission: actualSettings.backgroundPermission,
        dontAskAgain: actualSettings.dontAskAgain,
      });
    }

    const { backgroundPermission, dontAskAgain, ...persistableSettings } = actualSettings;
    store.settings = { ...store.settings, ...persistableSettings };
    saveStorage();
    return module.exports.getSettings();
  },

  // Venvs
  getVenvs: () => store.venvs || [],
  registerVenv: (venv) => {
    const existing = store.venvs.find(v => v.path === venv.path);
    if (!existing) {
      store.venvs.push({
        ...venv,
        id: `venv-${Date.now()}`,
        registeredAt: Date.now()
      });
      saveStorage();
    }
    return store.venvs;
  },
  removeVenv: (path) => {
    store.venvs = store.venvs.filter(v => v.path !== path);
    saveStorage();
    return store.venvs;
  },

  // History
  getHistory: (limit = 50) => {
    // Return only actual version updates, failed updates, restores, and project/package install/remove
    return (store.history || []).filter((item) => {
      if (!item) return false;
      if (item.ecosystem === 'cli') return false;
      if (typeof item.packageName === 'string') {
        const lower = item.packageName.toLowerCase();
        if (lower.startsWith('pg ') || lower.includes('scanner') || lower === 'cli') {
          return false;
        }
      }
      return true;
    }).slice(0, limit);
  },
  insertHistory: (entry) => {
    if (!entry) return;
    // Safety check: never record generic pg cmd history or scanner tasks
    if (entry.ecosystem === 'cli') return;
    if (typeof entry.packageName === 'string') {
      const lower = entry.packageName.toLowerCase();
      if (lower.startsWith('pg ') || lower.includes('scanner') || lower === 'cli') {
        return;
      }
    }
    const updatedAt = Date.now();
    // Use high-resolution timestamp or random suffix for IDs to avoid collisions in batches
    const id = Date.now() + Math.floor(Math.random() * 1000);
    store.history.unshift({ ...entry, updatedAt, id });
    saveStorage();
  },

  // Snapshots
  getSnapshots: () => store.snapshots,
  insertSnapshot: (snapshot) => {
    const createdAt = Date.now();
    const env = store.environments.find(e => e.id === snapshot.environmentId);
    store.snapshots.unshift({ 
      ...snapshot, 
      createdAt, 
      id: Date.now(),
      environmentName: env?.name || snapshot.environmentName || 'Unknown',
      packageCount: snapshot.packages?.length || 0,
      packageName: snapshot.packageName,
      packageVersion: snapshot.packageVersion
    });
    saveStorage();
  },
  deleteSnapshot: (id) => {
    store.snapshots = store.snapshots.filter(s => s.id !== id);
    saveStorage();
  },

  // Cache
  saveScanCache: (packages) => {
    const lastChecked = Date.now();
    for (const p of packages) {
      const envId = resolveEnvId(p.environmentId || p.envId || p.env_id, p.ecosystem);

      const index = store.packages.findIndex(existing => 
        (existing.name === p.name && existing.ecosystem === p.ecosystem) && 
        (existing.environmentId === envId || existing.envId === envId || existing.env_id === envId)
      );
      
      const updatedPkg = {
        name: p.name,
        ecosystem: p.ecosystem,
        environmentId: envId,
        installedVersion: p.installedVersion,
        latestVersion: p.latestVersion,
        status: p.status,
        groupName: p.groupName,
        lastChecked,
        id: index >= 0 ? store.packages[index].id : Date.now() + Math.random()
      };

      if (index >= 0) {
        store.packages[index] = updatedPkg;
      } else {
        store.packages.push(updatedPkg);
      }
    }
    saveStorage();
    return { success: true };
  },

  getCachedPackages: (cacheDurationHours = 6) => {
    const cutoff = Date.now() - cacheDurationHours * 60 * 60 * 1000;
    return store.packages.filter((p) => p.lastChecked > cutoff);
  }
};
