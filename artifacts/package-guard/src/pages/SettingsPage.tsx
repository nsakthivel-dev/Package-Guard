import React, { useState } from "react";
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
  FolderOpen
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const [newIgnore, setNewIgnore] = useState("");

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
