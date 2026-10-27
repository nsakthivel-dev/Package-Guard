import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { 
  Shield, 
  Clock,
  Settings2,
  AlertTriangle,
  Zap,
  ShieldCheck,
  Plus,
  X,
  Box,
  FolderOpen,
  FileText
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@packageguard/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const [newIgnore, setNewIgnore] = useState("");

  const [systemInfo, setSystemInfo] = useState<{
    logicalCores: number;
    defaultConcurrency: number;
    maxConcurrency: number;
  }>({
    logicalCores: 4,
    defaultConcurrency: 4,
    maxConcurrency: 10,
  });

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (api?.getSystemInfo) {
      api.getSystemInfo().then((info: any) => {
        if (info && typeof info.logicalCores === "number") {
          setSystemInfo(info);
        }
      }).catch(() => {});
    }
  }, []);

  const currentConcurrency = Number((settings as any)?.concurrencyLimit) || systemInfo.defaultConcurrency || 4;
  const maxConcurrency = systemInfo.maxConcurrency || 10;

  const handleUpdate = (key: string, value: any) => {
    if (!settings) return;
    // Optimistically update React Query cache for instant visual responsiveness
    qc.setQueryData(getGetSettingsQueryKey(), (old: any) => {
      if (!old) return old;
      return { ...old, [key]: value };
    });

    updateSettings.mutate({ 
      data: { [key]: value } 
    }, {
      onSuccess: (updated) => {
        if (updated) {
          qc.setQueryData(getGetSettingsQueryKey(), updated);
        }
        qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: () => {
        qc.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      }
    });
  };

  const handleSelectDir = async () => {
    try {
      const dir = await (window as any).electronAPI.openDirectory();
      if (dir) {
        handleUpdate('defaultVenvScanDir', dir);
      }
    } catch (e) {
      console.error('Failed to open directory dialog:', e);
    }
  };

  const addIgnore = () => {
    const trimmed = newIgnore.trim().toLowerCase();
    if (!trimmed || !settings) return;
    const current = (settings as any).ignoredPackages || [];
    if (!current.includes(trimmed)) {
      handleUpdate('ignoredPackages', [...current, trimmed]);
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

      <main className="max-w-[1000px] mx-auto px-8 py-10 flex flex-col gap-10">
        {/* Scan Scheduling */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="text-[19px] font-bold text-on-surface leading-snug">Scan Scheduling</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Background Scan Frequency</p>
                <p className="text-[13px] text-on-surface-variant max-w-[500px]">How often PackageGuard checks for updates in the background.</p>
              </div>
              <Select 
                value={String(settings.cacheDurationHours || 6)} 
                onValueChange={(val) => handleUpdate('cacheDurationHours', parseInt(val, 10))}
              >
                <SelectTrigger className="w-[180px] rounded-xl border-outline-variant bg-surface-container-low shrink-0">
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
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 shrink-0">
              <Settings2 className="w-5 h-5" />
            </div>
            <h3 className="text-[19px] font-bold text-on-surface leading-snug">Version Control</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Auto-snapshot before updates</p>
                <p className="text-[13px] text-on-surface-variant max-w-[540px]">Automatically create a snapshot of your environment before updating any packages.</p>
              </div>
              <Switch 
                checked={Boolean(settings.autoSnapshotBeforeUpdate)} 
                onCheckedChange={(val) => handleUpdate('autoSnapshotBeforeUpdate', val)} 
              />
            </div>
          </div>
        </section>

        {/* Security Policy Level */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="text-[19px] font-bold text-on-surface leading-snug">Security Policy</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl divide-y divide-outline-variant shadow-sm overflow-hidden">
            <div className="p-6 flex items-center justify-between gap-4 bg-surface-container-low/20">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-[15px] font-bold text-on-surface">Deep Dependency Analysis</p>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    Coming Soon
                  </span>
                </div>
                <p className="text-[13px] text-on-surface-variant max-w-[540px]">
                  Analyze nested dependencies for security vulnerabilities (Higher resource usage). Transitive lockfile resolution will arrive in a future update.
                </p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-block cursor-not-allowed">
                      <Switch 
                        checked={false} 
                        disabled={true}
                        aria-label="Deep Dependency Analysis (Coming Soon)"
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[260px] text-center">
                    Transitive lockfile dependency scanning is planned for an upcoming release and currently disabled.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            
            <div className="p-6 flex items-center justify-between gap-4 hover:bg-surface-container-low/30 transition-colors">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Audit Strictness</p>
                <p className="text-[13px] text-on-surface-variant max-w-[540px]">Controls how aggressively vulnerabilities are flagged.</p>
              </div>
              <div className="flex bg-surface-container-low p-1 rounded-xl border border-outline-variant/30 shrink-0">
                {['Relaxed', 'Standard', 'Strict'].map((level) => {
                  const isSelected = ((settings as any).securityLevel || 'Standard') === level;
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => handleUpdate('securityLevel', level)}
                      className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                        isSelected
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {level}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Ignore List */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-[19px] font-bold text-on-surface leading-snug">Audit Exemptions</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col gap-5">
            <div className="space-y-1">
              <p className="text-[15px] font-bold text-on-surface">Global Ignore List</p>
              <p className="text-[13px] text-on-surface-variant">Packages in this list will be ignored during security audits.</p>
            </div>
            
            <div className="flex gap-2">
              <Input 
                placeholder="Package name (e.g. lodash, requests)" 
                value={newIgnore}
                onChange={(e) => setNewIgnore(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addIgnore();
                  }
                }}
                className="rounded-xl border-outline-variant bg-surface-container-low max-w-[400px]"
              />
              <Button 
                type="button"
                onClick={addIgnore} 
                disabled={!newIgnore.trim()}
                className="rounded-xl bg-primary text-on-primary font-bold px-5 hover:bg-[#4338CA] transition-colors"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {((settings as any).ignoredPackages || []).map((pkg: string) => (
                <div key={pkg} className="inline-flex items-center gap-2 bg-surface-container-low border border-outline-variant/60 px-3 py-1.5 rounded-lg group transition-all hover:border-primary/40">
                  <span className="text-[13px] font-mono font-medium text-on-surface">{pkg}</span>
                  <button 
                    type="button"
                    onClick={() => removeIgnore(pkg)}
                    className="text-on-surface-variant hover:text-error transition-colors p-0.5"
                    title={`Remove ${pkg}`}
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
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-[19px] font-bold text-on-surface leading-snug">Audit Performance</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Concurrent Network Requests</p>
                <p className="text-[13px] text-on-surface-variant max-w-[540px]">
                  Controls how many package manifests are fetched simultaneously from npm and PyPI registries. Higher values speed up audits on high-speed connections, while lower values conserve memory and avoid registry rate limits.
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <span className="text-[14px] font-mono font-bold text-primary min-w-[90px] text-right">
                  {currentConcurrency} {currentConcurrency === 1 ? "Request" : "Requests"}
                </span>
                <input 
                  type="range" 
                  min="1" 
                  max={maxConcurrency} 
                  value={currentConcurrency}
                  onChange={(e) => handleUpdate('concurrencyLimit', parseInt(e.target.value, 10))}
                  className="w-32 accent-primary cursor-pointer"
                />
              </div>
            </div>

            {/* Real-time Recommendation and Warning Badges */}
            <div className="mt-4 pt-3.5 border-t border-outline-variant/40 flex items-center gap-2">
              {currentConcurrency <= 2 ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  <span className="material-symbols-outlined text-[14px]">eco</span>
                  <span>Gentle Mode: Best for battery saving or low-bandwidth networks.</span>
                </div>
              ) : currentConcurrency >= 7 ? (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  <span>⚠ High: May trigger registry rate-limits (HTTP 429) or timeouts on slower connections.</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  <span>Recommended for your system ({systemInfo.logicalCores} CPU cores detected)</span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Venv Settings */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5B5EF4]/10 flex items-center justify-center text-[#5B5EF4] shrink-0">
              <Box className="w-5 h-5" />
            </div>
            <h3 className="text-[19px] font-bold text-on-surface leading-snug">Virtual Environments</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl divide-y divide-outline-variant shadow-sm overflow-hidden">
            <div className="p-6 flex flex-col gap-3">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Default Scan Directory</p>
                <p className="text-[13px] text-on-surface-variant">The root folder used for automatic and manual virtual environment discovery.</p>
              </div>
              <div className="flex items-center gap-2 max-w-[700px]">
                <Input 
                  readOnly
                  placeholder="No directory selected" 
                  value={(settings as any).defaultVenvScanDir || ""}
                  className="rounded-xl border-outline-variant bg-surface-container-low flex-1 font-mono text-[13px] text-on-surface"
                />
                <Button 
                  type="button"
                  onClick={handleSelectDir} 
                  variant="outline" 
                  className="rounded-xl font-bold border-outline-variant shrink-0"
                >
                  <FolderOpen className="w-4 h-4 mr-2" /> Browse
                </Button>
                {Boolean((settings as any).defaultVenvScanDir) && (
                  <Button 
                    type="button"
                    onClick={() => handleUpdate('defaultVenvScanDir', '')} 
                    variant="outline" 
                    title="Clear directory"
                    className="rounded-xl border-outline-variant text-on-surface-variant hover:text-error hover:border-error/40 px-3 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="p-6 flex items-center justify-between gap-4 hover:bg-surface-container-low/30 transition-colors">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Auto-scan for venvs on startup</p>
                <p className="text-[13px] text-on-surface-variant max-w-[540px]">Automatically discover and register virtual environments when the application launches.</p>
              </div>
              <Switch 
                checked={Boolean((settings as any).autoScanVenvsOnStartup)} 
                onCheckedChange={(val) => handleUpdate('autoScanVenvsOnStartup', val)} 
              />
            </div>

            <div className="p-6 flex items-center justify-between gap-4 hover:bg-surface-container-low/30 transition-colors">
              <div className="space-y-1">
                <p className="text-[15px] font-bold text-on-surface">Include venvs in dashboard stats</p>
                <p className="text-[13px] text-on-surface-variant max-w-[540px]">Show virtual environment package counts and breakdown in the main dashboard.</p>
              </div>
              <Switch 
                checked={(settings as any).includeVenvsInDashboard !== false} 
                onCheckedChange={(val) => handleUpdate('includeVenvsInDashboard', val)} 
              />
            </div>
          </div>
        </section>


        {/* Privacy & Legal */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-[19px] font-bold text-on-surface leading-snug">Privacy & Legal</h3>
          </div>

          <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-[15px] font-bold text-on-surface">Privacy Policy</p>
              <p className="text-[13px] text-on-surface-variant max-w-[540px]">
                Read Package Guard's local-first privacy policy and data handling principles.
              </p>
            </div>
            <Button 
              type="button"
              variant="outline"
              onClick={() => setLocation("/privacy")}
              className="rounded-xl border-outline-variant font-bold text-primary hover:bg-primary/10 hover:border-primary/40 shrink-0 cursor-pointer"
            >
              <FileText className="w-4 h-4 mr-2" /> View Privacy Policy
            </Button>
          </div>
        </section>

        {/* About Footer */}
        <footer className="pt-8 flex flex-col items-center text-center space-y-3 border-t border-outline-variant">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[18px] font-bold">PackageGuard Audit Engine</span>
          </div>
          <p className="text-[12px] text-outline leading-relaxed">
            Configuration Profile: Default V1.0<br/>
            Powered by Lupus Venture
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setLocation("/privacy")}
              className="text-[12px] text-primary hover:underline font-medium cursor-pointer"
            >
              Privacy Policy
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
