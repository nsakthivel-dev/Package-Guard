import React, { useState, useEffect } from "react";
import { 
  Shield, 
  Clock,
  Settings2,
  AlertTriangle,
  Zap,
  Info,
  ShieldCheck,
  ChevronRight,
  Plus,
  X,
  Box,
  FolderOpen,
  Terminal as TerminalIcon,
  Download,
  Power,
  RefreshCw,
  ExternalLink,
  Trash2
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type CliStatus = {
  installedAt: string | null;
  server: { port: number | null; token: string | null };
  serverJsonPath: string | null;
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const [newIgnore, setNewIgnore] = useState("");
  const [cliStatus, setCliStatus] = useState<CliStatus | null>(null);
  const [cliBusy, setCliBusy] = useState<string | null>(null);
  const [cliMsg, setCliMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const refreshCli = async () => {
    try {
      const api = (window as any).electronAPI;
      if (api && typeof api.cliStatus === 'function') {
        setCliStatus(await api.cliStatus());
      }
    } catch (_) { /* ignore */ }
  };

  useEffect(() => {
    refreshCli();
  }, []);

  const runInstall = async () => {
    const api = (window as any).electronAPI;
    if (!api) return;
    setCliBusy('install');
    setCliMsg(null);
    try {
      const r = await api.cliInstall();
      if (r?.ok) {
        setCliMsg({ tone: 'ok', text: `Installed CLI at ${r.installedAt}. Open a new terminal and run: pg --help` });
      } else {
        setCliMsg({ tone: 'err', text: r?.error || 'Installation failed.' });
      }
    } catch (e: any) {
      setCliMsg({ tone: 'err', text: e?.message || String(e) });
    } finally {
      setCliBusy(null);
      refreshCli();
    }
  };

  const runUninstall = async () => {
    const api = (window as any).electronAPI;
    if (!api) return;
    setCliBusy('uninstall');
    setCliMsg(null);
    try {
      const r = await api.cliUninstall();
      if (r?.ok) {
        setCliMsg({ tone: 'ok', text: r.already ? 'CLI was not installed.' : `Removed CLI at ${r.removed}.` });
      } else {
        setCliMsg({ tone: 'err', text: r?.error || 'Uninstall failed.' });
      }
    } catch (e: any) {
      setCliMsg({ tone: 'err', text: e?.message || String(e) });
    } finally {
      setCliBusy(null);
      refreshCli();
    }
  };

  const openInFolder = (target: string) => {
    const api = (window as any).electronAPI;
    if (api?.openInFolder) api.openInFolder(target);
  };

  const handleUpdate = (key: string, value: any) => {
    if (!settings) return;
    updateSettings.mutate({ 
      data: { [key]: value } 
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      }
    });
  };

  const handleSelectDir = async () => {
    const dir = await (window as any).electronAPI.openDirectory();
    if (dir) {
      handleUpdate('defaultVenvScanDir', dir);
    }
  };

  const addIgnore = () => {
    if (!newIgnore || !settings) return;
    const current = (settings as any).ignoredPackages || [];
    if (!current.includes(newIgnore)) {
      handleUpdate('ignoredPackages', [...current, newIgnore]);
    }
    setNewIgnore("");
  };

  const removeIgnore = (pkg: string) => {
    if (!settings) return;
    const current = (settings as any).ignoredPackages || [];
    handleUpdate('ignoredPackages', current.filter((p: string) => p !== pkg));
  };

  if (!settings) return null;

  return (
    <div className="min-h-full bg-background font-hanken text-on-surface" data-testid="settings-page">
      <header className="px-8 py-6 border-b border-outline-variant">
        <h2 className="text-[32px] font-bold text-on-surface leading-tight mb-1">Audit Configuration</h2>
        <p className="text-body-lg text-on-surface-variant">Configure how PackageGuard analyzes your environments</p>
      </header>

      <main className="max-w-[1000px] mx-auto px-8 py-10 space-y-12">
        {/* New Feature: Advanced Scan Scheduling */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-[20px] font-bold text-on-surface">Scan Scheduling</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[16px] font-bold text-on-surface">Background Scan Frequency</p>
                <p className="text-[13px] text-on-surface-variant max-w-[500px]">How often PackageGuard checks for updates in the background.</p>
              </div>
              <Select 
                value={String(settings.cacheDurationHours || 6)} 
                onValueChange={(val) => handleUpdate('cacheDurationHours', parseInt(val))}
              >
                <SelectTrigger className="w-[180px] rounded-xl border-outline-variant bg-surface-container-low">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest">
                  <SelectItem value="1">Every Hour</SelectItem>
                  <SelectItem value="6">Every 6 Hours</SelectItem>
                  <SelectItem value="12">Every 12 Hours</SelectItem>
                  <SelectItem value="24">Once Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Version Control (Snapshots) */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
              <Settings2 className="w-5 h-5" />
            </div>
            <h3 className="text-[20px] font-bold text-on-surface">Version Control</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Auto-snapshot before updates</p>
                <p className="text-[12px] text-on-surface-variant">Automatically create a snapshot of your environment before updating any packages.</p>
              </div>
              <Switch 
                checked={settings.autoSnapshotBeforeUpdate} 
                onCheckedChange={(val) => handleUpdate('autoSnapshotBeforeUpdate', val)} 
              />
            </div>
          </div>
        </section>

        {/* New Feature: Security Policy Level */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-[20px] font-bold text-on-surface">Security Policy</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl divide-y divide-outline-variant shadow-sm overflow-hidden">
            <div className="p-6 flex items-center justify-between hover:bg-surface-container-low/30 transition-colors">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Deep Dependency Analysis</p>
                <p className="text-[12px] text-on-surface-variant">Analyze nested dependencies for security vulnerabilities (Higher resource usage).</p>
              </div>
              <Switch 
                checked={settings.safeMode} 
                onCheckedChange={() => handleUpdate('safeMode', !settings.safeMode)} 
              />
            </div>
            
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[15px] font-bold text-on-surface">Audit Strictness</p>
                  <p className="text-[12px] text-on-surface-variant">Controls how aggressively vulnerabilities are flagged.</p>
                </div>
                <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/30">
                  {['Relaxed', 'Standard', 'Strict'].map((level) => (
                    <button
                      key={level}
                      onClick={() => handleUpdate('securityLevel', level)}
                      className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                        (settings as any).securityLevel === level || (!(settings as any).securityLevel && level === 'Standard')
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* New Feature: Ignore List */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-[20px] font-bold text-on-surface">Audit Exemptions</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-6">
            <div className="space-y-1">
              <p className="text-[16px] font-bold text-on-surface">Global Ignore List</p>
              <p className="text-[13px] text-on-surface-variant">Packages in this list will be ignored during security audits.</p>
            </div>
            
            <div className="flex gap-2">
              <Input 
                placeholder="Package name (e.g. lodash)" 
                value={newIgnore}
                onChange={(e) => setNewIgnore(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addIgnore()}
                className="rounded-xl border-outline-variant bg-surface-container-low"
              />
              <Button onClick={addIgnore} className="rounded-xl bg-primary text-on-primary font-bold px-6">
                <Plus className="w-4 h-4 mr-2" /> Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {((settings as any).ignoredPackages || []).map((pkg: string) => (
                <div key={pkg} className="flex items-center gap-2 bg-surface-container-low border border-outline-variant/50 px-3 py-1.5 rounded-lg group transition-all hover:border-primary/30">
                  <span className="text-[13px] font-bold text-on-surface">{pkg}</span>
                  <button 
                    onClick={() => removeIgnore(pkg)}
                    className="text-on-surface-variant hover:text-error transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {(!(settings as any).ignoredPackages || (settings as any).ignoredPackages.length === 0) && (
                <p className="text-[12px] text-on-surface-variant italic">No packages currently ignored.</p>
              )}
            </div>
          </div>
        </section>

        {/* Performance & Resource Management */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-[20px] font-bold text-on-surface">Audit Performance</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Parallel Analysis Threads</p>
                <p className="text-[12px] text-on-surface-variant">Optimize scanning speed based on your CPU cores.</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[14px] font-mono font-bold text-primary">{(settings as any).concurrencyLimit || 5} Threads</span>
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  value={(settings as any).concurrencyLimit || 5}
                  onChange={(e) => handleUpdate('concurrencyLimit', parseInt(e.target.value))}
                  className="w-32 accent-primary cursor-pointer"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Venv Settings */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#5B5EF4]/10 flex items-center justify-center text-[#5B5EF4]">
              <Box className="w-5 h-5" />
            </div>
            <h3 className="text-[20px] font-bold text-on-surface">Virtual Environments</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl divide-y divide-outline-variant shadow-sm overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex flex-col gap-2">
                <p className="text-[15px] font-bold text-on-surface">Default Scan Directory</p>
                <p className="text-[12px] text-on-surface-variant">The root folder used for venv discovery.</p>
                <div className="flex gap-2 mt-2">
                  <Input 
                    readOnly
                    placeholder="No directory selected" 
                    value={(settings as any).defaultVenvScanDir || ""}
                    className="rounded-xl border-outline-variant bg-surface-container-low flex-1"
                  />
                  <Button onClick={handleSelectDir} variant="outline" className="rounded-xl font-bold border-outline-variant">
                    <FolderOpen className="w-4 h-4 mr-2" /> Browse
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-6 flex items-center justify-between hover:bg-surface-container-low/30 transition-colors">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Auto-scan for venvs on startup</p>
                <p className="text-[12px] text-on-surface-variant">Automatically discovery new venvs when the app launches.</p>
              </div>
              <Switch 
                checked={(settings as any).autoScanVenvsOnStartup} 
                onCheckedChange={(val) => handleUpdate('autoScanVenvsOnStartup', val)} 
              />
            </div>

            <div className="p-6 flex items-center justify-between hover:bg-surface-container-low/30 transition-colors">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Include venvs in dashboard stats</p>
                <p className="text-[12px] text-on-surface-variant">Show virtual environment package counts in the main dashboard.</p>
              </div>
              <Switch 
                checked={(settings as any).includeVenvsInDashboard} 
                onCheckedChange={(val) => handleUpdate('includeVenvsInDashboard', val)} 
              />
            </div>
          </div>
        </section>

        {/* CLI Integration */}
        <section className="space-y-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <TerminalIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-[20px] font-bold text-on-surface">CLI Integration</h3>
                <p className="text-[13px] text-on-surface-variant">Install the <code className="px-1.5 py-0.5 bg-surface-container rounded text-[12px] font-mono text-primary">pg</code> command into your system PATH.</p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={refreshCli}
              className="rounded-lg border border-outline-variant"
              title="Refresh status"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${cliBusy ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[13px] font-bold text-on-surface-variant uppercase tracking-wide">CLI Status</p>
                {cliStatus?.installedAt ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-400 px-2.5 py-1 text-[12px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Installed
                    </span>
                    <code className="text-[12px] text-on-surface font-mono break-all">{cliStatus.installedAt}</code>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-outline-variant/40 text-on-surface-variant px-2.5 py-1 text-[12px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-on-surface-variant" /> Not installed
                    </span>
                    <span className="text-[12px] text-on-surface-variant">Run install once to enable <span className="font-mono">pg</span> commands globally.</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[13px] font-bold text-on-surface-variant uppercase tracking-wide">Local HTTP Server</p>
                {cliStatus?.server?.port ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-[12px] font-bold">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Running
                      </span>
                      <code className="text-[12px] font-mono text-on-surface">127.0.0.1:{cliStatus.server.port}</code>
                    </div>
                    {cliStatus.serverJsonPath && (
                      <button
                        type="button"
                        onClick={() => openInFolder(cliStatus.serverJsonPath as string)}
                        className="text-left text-[12px] text-on-surface-variant hover:text-primary underline underline-offset-2 truncate max-w-[360px]"
                      >
                        <ExternalLink className="w-3 h-3 inline mr-1 -mt-0.5" />
                        {String(cliStatus.serverJsonPath)}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive px-2.5 py-1 text-[12px] font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> Stopped
                    </span>
                    <span className="text-[12px] text-on-surface-variant">Restart the app to start the server.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={runInstall}
                disabled={!!cliBusy}
                className="rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Download className="w-4 h-4 mr-2" />
                Install `pg` command
              </Button>
              <Button
                onClick={runUninstall}
                disabled={!!cliBusy || !cliStatus?.installedAt}
                variant="outline"
                className="rounded-xl font-bold border-outline-variant hover:border-destructive/50 hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Uninstall
              </Button>
              <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-on-surface-variant">
                <Power className="w-3.5 h-3.5" />
                Protocol handler: <span className="font-mono text-primary">pg://</span>
              </span>
            </div>

            {cliMsg && (
              <div className={`rounded-xl border p-4 text-[13px] ${cliMsg.tone === 'ok' ? 'bg-emerald-500/5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'bg-destructive/5 border-destructive/30 text-destructive'}`}>
                {cliMsg.text}
              </div>
            )}

            <div className="rounded-xl bg-surface-container border border-outline-variant/70 p-4">
              <p className="text-[12px] font-bold text-on-surface-variant mb-2 uppercase tracking-wide">Quick reference</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] font-mono text-on-surface">
                <div><span className="text-primary">pg install</span> <span className="text-on-surface-variant font-sans">Track project at cwd</span></div>
                <div><span className="text-primary">pg commit -m "msg"</span> <span className="text-on-surface-variant font-sans">Snapshot dependencies</span></div>
                <div><span className="text-primary">pg status</span> <span className="text-on-surface-variant font-sans">Uncommitted package changes</span></div>
                <div><span className="text-primary">pg log --oneline</span> <span className="text-on-surface-variant font-sans">Snapshot history</span></div>
                <div><span className="text-primary">pg checkout &lt;id&gt;</span> <span className="text-on-surface-variant font-sans">Restore snapshot</span></div>
                <div><span className="text-primary">pg diff</span> <span className="text-on-surface-variant font-sans">Current vs last snapshot</span></div>
                <div><span className="text-primary">pg open</span> <span className="text-on-surface-variant font-sans">Focus GUI for this project</span></div>
                <div><span className="text-primary">pg gui</span> <span className="text-on-surface-variant font-sans">Launch Electron app</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* About Footer */}
        <footer className="pt-10 flex flex-col items-center text-center space-y-4 border-t border-outline-variant">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="w-6 h-6" />
            <span className="text-[20px] font-bold">PackageGuard Audit Engine</span>
          </div>
          <p className="text-[12px] text-outline">Configuration Profile: Default v2.4.1<br/>Engineered for Security Compliance<br/>Powered by Lupus Venture</p>
        </footer>
      </main>
    </div>
  );
}
