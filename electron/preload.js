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

  // Snapshots
  getSnapshots: () => ipcRenderer.invoke('snapshots:get'),
  createSnapshot: (data) => ipcRenderer.invoke('snapshots:create', data),
  deleteSnapshot: (id) => ipcRenderer.invoke('snapshots:delete', id),
  restoreSnapshot: (id) => ipcRenderer.invoke('snapshots:restore', id),

  // History
  getHistory: (limit) => ipcRenderer.invoke('history:get', limit),

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
  openDirectory: () => ipcRenderer.invoke('dialog:open-directory'),

  // Cache / fast startup
  getBootstrap: () => ipcRenderer.invoke('bootstrap:get'),
  getCachedPackages: () => ipcRenderer.invoke('cache:get'),
  saveScanCache: (packages) => ipcRenderer.invoke('cache:save', packages),

  // Auto-scan trigger
  onAutoScanTrigger: (cb) => ipcRenderer.on('trigger:auto-scan', () => cb())
});
