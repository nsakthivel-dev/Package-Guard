const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Dashboard
  getDashboardSummary: () => ipcRenderer.invoke('dashboard:summary'),
  getStatusBreakdown: () => ipcRenderer.invoke('dashboard:status-breakdown'),

  // Environments
  scanEnvironments: () => ipcRenderer.invoke('scan:environments'),
  getEnvironments: () => ipcRenderer.invoke('environments:get'),
  createEnvironment: (env) => ipcRenderer.invoke('environments:create', env),
  deleteEnvironment: (id) => ipcRenderer.invoke('environments:delete', id),
  scanEnvironment: (id) => ipcRenderer.invoke('environments:scan', id),

  // Packages
  getPackages: (params) => ipcRenderer.invoke('packages:get', params),
  checkVersions: (packages) => ipcRenderer.invoke('versions:check', packages),
  updatePackage: (data) => ipcRenderer.invoke('update:package', data),
  updateBatch: (data) => ipcRenderer.invoke('update:batch', data),
  deletePackage: (data) => ipcRenderer.invoke('packages:delete', data),
  onUpdateProgress: (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  getSystemInfo: () => ipcRenderer.invoke('system:info'),

  // Authentication & Profile
  getAuthSession: () => ipcRenderer.invoke('auth:get-session'),
  getAccounts: () => ipcRenderer.invoke('auth:get-accounts'),
  switchAccount: (userId) => ipcRenderer.invoke('auth:switch-account', userId),
  loginWithGoogle: (options) => ipcRenderer.invoke('auth:login-google', options),
  updateProfile: (data) => ipcRenderer.invoke('auth:update-profile', data),
  selectProfilePhoto: () => ipcRenderer.invoke('profile:select-photo'),
  saveProfilePhoto: (userId, data) => ipcRenderer.invoke('profile:save-photo', { userId, ...data }),
  removeProfilePhoto: (userId) => ipcRenderer.invoke('profile:remove-photo', userId),
  logout: () => ipcRenderer.invoke('auth:logout'),
  signout: () => ipcRenderer.invoke('auth:signout'),
  clearAllSessionData: () => ipcRenderer.invoke('session:clear-all'),
  deleteAccount: (userId, confirmation) => ipcRenderer.invoke('auth:delete-account', { userId, confirmation }),
  getAuthConfig: () => ipcRenderer.invoke('auth:get-config'),
  saveAuthConfig: (config) => ipcRenderer.invoke('auth:set-config', config),

  // Profile Storage Location
  getProfileStoragePath: () => ipcRenderer.invoke('profile:get-storage-path'),
  selectProfileStorageDir: () => ipcRenderer.invoke('profile:select-storage-dir'),
  setProfileStoragePath: (dirPath) => ipcRenderer.invoke('profile:set-storage-path', dirPath),

  // Snapshots
  getSnapshots: () => ipcRenderer.invoke('snapshots:get'),
  createSnapshot: (data) => ipcRenderer.invoke('snapshots:create', data),
  deleteSnapshot: (id) => ipcRenderer.invoke('snapshots:delete', id),
  restoreSnapshot: (id) => ipcRenderer.invoke('snapshots:restore', id),

  // History
  getHistory: (limit) => ipcRenderer.invoke('history:get', limit),

  // ── Project Environments (new architecture) ──────────────────────────────
  // Reads from the core db.json (projects + snapshots).
  // These are REAL persisted projects registered via the GUI.
  getProjects: () => ipcRenderer.invoke('projects:get'),
  renameProject: (projectId, newName) => ipcRenderer.invoke('projects:rename', { projectId, newName }),
  getProjectPackages: (projectId) => ipcRenderer.invoke('projects:getPackages', projectId),
  getProjectSnapshots: (projectId, limit) => ipcRenderer.invoke('projects:getSnapshots', { projectId, limit }),
  scanProject: (projectId) => ipcRenderer.invoke('projects:scan', projectId),
  getGlobalSystems: () => ipcRenderer.invoke('globalSystems:get'),

  // Fired by main process when a project scan completes (IPC scan)
  onProjectsUpdated: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('projects:updated', listener);
    return () => ipcRenderer.removeListener('projects:updated', listener);
  },

  // Venv Handlers
  scanVenvs: (rootDir) => ipcRenderer.invoke('venv:scan', rootDir),
  getVenvPackages: (venvPath) => ipcRenderer.invoke('venv:get-packages', venvPath),
  updateVenvPackage: (data) => ipcRenderer.invoke('venv:update-package', data),
  getVenvMeta: (venvPath) => ipcRenderer.invoke('venv:get-meta', venvPath),
  getRegisteredVenvs: () => ipcRenderer.invoke('venvs:get-registered'),
  registerVenv: (venv) => ipcRenderer.invoke('venvs:register', venv),
  removeVenv: (path) => ipcRenderer.invoke('venvs:remove', path),

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  openDirectory: (defaultPath) => ipcRenderer.invoke('dialog:open-directory', defaultPath),

  // Cache / fast startup
  getBootstrap: () => ipcRenderer.invoke('bootstrap:get'),
  getCachedPackages: () => ipcRenderer.invoke('cache:get'),
  saveScanCache: (packages) => ipcRenderer.invoke('cache:save', packages),

  // Auto-scan trigger
  onAutoScanTrigger: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('trigger:auto-scan', listener);
    // Return cleanup function so callers can remove the listener
    return () => ipcRenderer.removeListener('trigger:auto-scan', listener);
  },
  onSnapshotCreated: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('server:snapshot-created', listener);
    return () => ipcRenderer.removeListener('server:snapshot-created', listener);
  },
  onOpenProject: (cb) => ipcRenderer.on('server:open-project', (_e, d) => cb(d)),
  onOpenCheckout: (cb) => ipcRenderer.on('server:open-checkout', (_e, d) => cb(d)),

  // Receive full project scan snapshot
  // Snapshots page and Venv page should call this to refresh on-demand
  onProjectScanUpdate: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('snapshot:project:update', listener);
    return () => ipcRenderer.removeListener('snapshot:project:update', listener);
  },

  // ── Layer 2: live data-changed push from IPC bridge ─────────────────────
  // Fired by the main process whenever the CLI writes to db.json and the
  // socket/pipe notification is received (or the file-watcher fires as
  // fallback).  The renderer should call queryClient.invalidateQueries()
  // in response so all project/snapshot data refreshes immediately.
  onDataChanged: (cb) => {
    const listener = (_e, d) => cb(d);
    ipcRenderer.on('core:data-changed', listener);
    return () => ipcRenderer.removeListener('core:data-changed', listener);
  },

  // Focus window (from CLI or external trigger)
  focusWindow: () => ipcRenderer.invoke('window:focus'),

  // CLI installer
  cliInstall: () => ipcRenderer.invoke('cli:install'),
  cliUninstall: () => ipcRenderer.invoke('cli:uninstall'),
  cliStatus: () => ipcRenderer.invoke('cli:status'),

  // OS helper: show file in folder
  openInFolder: (target) => ipcRenderer.invoke('pg:open-path', target),

  // Application info
  // Returns the semver string from package.json, e.g. "1.0.0"
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Returns { dataRoot, isPortable, paths: { database, logs, cache, snapshots, config } }
  // Used by the Settings page to show the user where their data lives.
  getDataRoot: () => ipcRenderer.invoke('app:data-root'),

  // Uninstall helper
  // mode: 'app-only' — quit app, NSIS removes binary; AppData is kept
  // mode: 'full'     — delete all AppData then quit; NSIS removes binary
  // Returns { ok: true } before the process exits.
  uninstallApp: (mode) => ipcRenderer.invoke('app:uninstall', { mode }),
});
