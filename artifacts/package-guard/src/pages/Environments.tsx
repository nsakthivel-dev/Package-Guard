import React, { useState, useMemo } from "react";
import { Plus, RefreshCw, Trash2, Server, Search, FolderOpen, CheckCircle2, ChevronRight } from "lucide-react";
import {
  useListEnvironments,
  useCreateEnvironment,
  useDeleteEnvironment,
  useScanEnvironment,
  getListEnvironmentsQueryKey,
  Environment,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ecosystemIcon } from "@/lib/statusColors";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePackageStore } from "@/store/usePackageStore";
import { useLocation } from "wouter";

export default function Environments() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: envs, isLoading } = useListEnvironments();
  const createEnv = useCreateEnvironment();
  const deleteEnv = useDeleteEnvironment();
  const scanEnv = useScanEnvironment();
  const [, setLocation] = useLocation();
  const { setActiveVenvPath } = usePackageStore();

  // Venv specific queries/mutations
  const { data: registeredVenvs } = useQuery({
    queryKey: ['venvs', 'registered'],
    queryFn: () => window.electronAPI.getRegisteredVenvs()
  });

  const [selectedVenvForView, setSelectedVenvForView] = useState<any | null>(null);
  const [selectedGlobalEnvForView, setSelectedGlobalEnvForView] = useState<Environment | null>(null);

  const { data: venvPackagesResult, isLoading: loadingVenvPackages } = useQuery<any>({
    queryKey: ['venvs', 'packages', selectedVenvForView?.path],
    queryFn: async () => {
      const res = await window.electronAPI.getVenvPackages(selectedVenvForView.path);
      return res;
    },
    enabled: !!selectedVenvForView
  });

  const { data: globalPackagesResult, isLoading: loadingGlobalPackages } = useQuery<any>({
    queryKey: ['packages', 'list', selectedGlobalEnvForView?.id],
    queryFn: async () => {
      const res = await window.electronAPI.getPackages({ environmentId: selectedGlobalEnvForView?.id });
      return res;
    },
    enabled: !!selectedGlobalEnvForView
  });

  const activePackages = useMemo(() => {
    if (selectedVenvForView) {
      return venvPackagesResult?.packages || [];
    }
    if (selectedGlobalEnvForView) {
      return globalPackagesResult || [];
    }
    return [];
  }, [selectedVenvForView, venvPackagesResult, selectedGlobalEnvForView, globalPackagesResult]);

  const isLoadingPackages = loadingVenvPackages || loadingGlobalPackages;

  const [venvSearch, setVenvSearch] = useState("");
  const filteredActivePackages = activePackages.filter((p: any) => 
    p.name.toLowerCase().includes(venvSearch.toLowerCase())
  );

  const handleViewInPackages = (path: string) => {
    setActiveVenvPath(path);
    setLocation("/packages");
  };

  const scanVenvsMutation = useMutation({
    mutationFn: (rootDir: string) => window.electronAPI.scanVenvs(rootDir),
    onSuccess: (data: any[]) => {
      setFoundVenvs(data);
      if (data.length === 0) {
        toast({ title: "No virtual environments found", variant: "destructive" });
      } else {
        toast({ title: `Found ${data.length} virtual environments` });
      }
    }
  });

  const registerVenvMutation = useMutation({
    mutationFn: (venv: any) => window.electronAPI.registerVenv(venv),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venvs', 'registered'] });
      toast({ title: "Venv registered successfully" });
    }
  });

  const removeVenvMutation = useMutation({
    mutationFn: (path: string) => window.electronAPI.removeVenv(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['venvs', 'registered'] });
      toast({ title: "Venv removed" });
    }
  });

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("pip");
  const [path, setPath] = useState("");
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [foundVenvs, setFoundVenvs] = useState<any[]>([]);
  const [isScanningVenvs, setIsScanningVenvs] = useState(false);

  const handleScanForVenvs = async () => {
    const dir = await window.electronAPI.openDirectory();
    if (dir) {
      setIsScanningVenvs(true);
      scanVenvsMutation.mutate(dir, {
        onSettled: () => setIsScanningVenvs(false)
      });
    }
  };

  const handleCreate = () => {
    if (!name.trim() || !path.trim()) return;
    createEnv.mutate(
      { data: { name, type: type as "pip" | "venv" | "conda" | "npm" | "nvm", path } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
          setShowCreate(false);
          setName(""); setType("pip"); setPath("");
          toast({ title: "Environment created" });
        },
      }
    );
  };

  const handleDelete = (id: string, envName: string) => {
    deleteEnv.mutate({ id: id as any }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
        toast({ title: `Deleted "${envName}"` });
      },
    });
  };

  const handleScan = (id: string) => {
    setScanningId(id);
    scanEnv.mutate({ id: id as any }, {
      onSuccess: (result: any) => {
        qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
        setScanningId(null);
        toast({ title: `Scan complete — ${result.length} packages found` });
      },
      onError: () => setScanningId(null),
    });
  };

  return (
    <div className="flex gap-gutter items-start animate-in fade-in duration-500">
      {/* Main Content Column */}
      <div className="flex-1 space-y-stack-lg">
        <div className="flex items-center justify-between mb-stack-lg">
          <h3 className="font-title-md text-title-md text-on-surface-variant">Environment Management</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 py-2 px-4 bg-primary text-on-primary hover:brightness-110 rounded-lg font-label-caps text-label-caps transition-all shadow-md shadow-primary/10 active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              New Environment
            </button>
          </div>
        </div>

        <Tabs defaultValue="global" className="w-full">
          <TabsList className="bg-surface-container border border-outline-variant p-1 rounded-xl mb-stack-lg">
            <TabsTrigger value="global" className="rounded-lg px-6 font-label-caps text-label-caps data-[state=active]:bg-primary data-[state=active]:text-on-primary transition-all">
              Global Systems
            </TabsTrigger>
            <TabsTrigger value="venvs" className="rounded-lg px-6 font-label-caps text-label-caps data-[state=active]:bg-primary data-[state=active]:text-on-primary transition-all">
              Virtual Envs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="global" className="space-y-gutter">
            {isLoading ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-gutter">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="h-56 bg-surface-container-low border border-outline-variant rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-gutter">
                {envs?.map((env: Environment) => (
                  <div 
                    key={env.id} 
                    onClick={() => {
                      setSelectedVenvForView(null);
                      setSelectedGlobalEnvForView(env);
                    }}
                    className={cn(
                      "bg-surface-container-lowest border p-6 rounded-xl hover:shadow-xl hover:shadow-primary/5 transition-all group cursor-pointer",
                      selectedGlobalEnvForView?.id === env.id ? "border-primary ring-1 ring-primary/20 shadow-lg" : "border-outline-variant"
                    )}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-secondary-container rounded-lg flex items-center justify-center text-on-secondary-container group-hover:scale-110 transition-transform">
                          <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                            {env.type === 'npm' ? 'javascript' : 'terminal'}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-title-md text-title-md text-primary">{env.name}</h4>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <p className="font-body-sm text-body-sm text-on-surface-variant uppercase tracking-wider">{env.type} node</p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(env.id as any, env.name); }}
                        className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-lg transition-colors"
                      >
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </div>
                    <div className="space-y-3 pt-4 border-t border-outline-variant/30">
                      <div className="flex justify-between items-center">
                        <span className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase">File Path</span>
                        <span className="font-code-sm text-code-sm bg-surface-container px-2 py-0.5 rounded text-secondary truncate ml-4 max-w-[200px]">{env.path}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase">Packages Found</span>
                        <span className="font-code-sm text-code-sm font-bold text-primary">{env.packageCount ?? (env as any).package_count ?? 0}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase">Last Integrity Check</span>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">
                          {env.lastScanned ? formatDistanceToNow(new Date(env.lastScanned), { addSuffix: true }) : 'Never scanned'}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleScan(env.id as any); }}
                      disabled={scanningId === (env.id as any)}
                      className="w-full mt-6 bg-surface-container hover:bg-surface-container-high text-primary py-3 rounded-lg font-label-caps text-label-caps transition-all flex items-center justify-center gap-2"
                    >
                      <span className={cn("material-symbols-outlined text-[18px]", scanningId === (env.id as any) && "animate-spin")}>refresh</span>
                      {scanningId === (env.id as any) ? "Auditing..." : "Start Scan"}
                    </button>
                  </div>
                ))}
                
                {/* Add Another Environment Area */}
                <div 
                  onClick={() => setShowCreate(true)}
                  className="border-2 border-dashed border-outline-variant rounded-xl p-6 flex flex-col items-center justify-center gap-4 hover:bg-surface-container-low transition-colors cursor-pointer group min-h-[220px]"
                >
                  <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-outline transition-all group-hover:bg-primary-fixed group-hover:text-on-primary-fixed">
                    <span className="material-symbols-outlined text-[32px]">add</span>
                  </div>
                  <div className="text-center">
                    <p className="font-title-md text-title-md text-on-surface-variant">Add global environment</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant/60">Register a new system path for auditing</p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="venvs" className="space-y-gutter">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-gutter">
              {registeredVenvs?.map((venv: any) => (
                <div 
                  key={venv.path} 
                  onClick={() => {
                    setSelectedGlobalEnvForView(null);
                    setSelectedVenvForView(venv);
                  }}
                  className={cn(
                    "bg-surface-container-lowest border p-6 rounded-xl hover:shadow-xl hover:shadow-primary/5 transition-all group cursor-pointer",
                    selectedVenvForView?.path === venv.path ? "border-primary ring-1 ring-primary/20 shadow-lg" : "border-outline-variant"
                  )}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-secondary-container rounded-lg flex items-center justify-center text-on-secondary-container group-hover:scale-110 transition-transform">
                        <span className="material-symbols-outlined text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>terminal</span>
                      </div>
                      <div>
                        <h4 className="font-title-md text-title-md text-primary">{venv.name}</h4>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                          <p className="font-body-sm text-body-sm text-on-surface-variant">Active Instance</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeVenvMutation.mutate(venv.path); }}
                      className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-lg transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                  </div>
                  <div className="space-y-3 pt-4 border-t border-outline-variant/30">
                    <div className="flex justify-between items-center">
                      <span className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase">File Path</span>
                      <span className="font-code-sm text-code-sm bg-surface-container px-2 py-0.5 rounded text-secondary truncate ml-4 max-w-[200px]">{venv.path}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase">Python Version</span>
                      <span className="font-code-sm text-code-sm font-bold text-primary">{venv.pythonVersion}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add Another Environment Area */}
              <div 
                onClick={handleScanForVenvs}
                className="border-2 border-dashed border-outline-variant rounded-xl p-6 flex flex-col items-center justify-center gap-4 hover:bg-surface-container-low transition-colors cursor-pointer group min-h-[220px]"
              >
                <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-outline transition-all group-hover:bg-primary-fixed group-hover:text-on-primary-fixed">
                  <span className="material-symbols-outlined text-[32px]">{isScanningVenvs ? 'refresh' : 'search'}</span>
                </div>
                <div className="text-center">
                  <p className="font-title-md text-title-md text-on-surface-variant">{isScanningVenvs ? 'Scanning...' : 'Discover venvs'}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant/60">Scan directory for virtual environments</p>
                </div>
              </div>
            </div>

            {foundVenvs.length > 0 && (
              <div className="mt-8 bg-surface-container-low border border-outline-variant rounded-2xl p-6 animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-title-md text-title-md text-primary">Discovery Results</h3>
                  <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[12px] font-bold font-label-caps">{foundVenvs.length} found</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {foundVenvs.map((venv: any) => {
                    const isRegistered = registeredVenvs?.some((v: any) => v.path === venv.path);
                    return (
                      <div key={venv.path} className="flex items-center justify-between p-4 bg-surface-container-lowest border border-outline-variant rounded-xl group">
                        <div className="min-w-0">
                          <p className="font-bold text-on-surface truncate">{venv.name}</p>
                          <p className="text-[11px] text-on-surface-variant truncate font-code-sm">{venv.path}</p>
                        </div>
                        <button 
                          disabled={isRegistered || registerVenvMutation.isPending}
                          onClick={() => registerVenvMutation.mutate(venv)}
                          className={cn(
                            "px-4 py-2 rounded-lg font-label-caps text-label-caps transition-all",
                            isRegistered 
                              ? "bg-emerald-500/10 text-emerald-500 cursor-default" 
                              : "bg-primary text-on-primary hover:brightness-110 active:scale-95 shadow-sm"
                          )}
                        >
                          {isRegistered ? "Tracked" : "Track"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Packages Sidebar (Right Column) */}
      <aside className="w-80 bg-surface-container dark:bg-inverse-surface border border-outline-variant shadow-sm flex flex-col p-6 sticky top-48 h-[calc(100vh-16rem)] rounded-2xl overflow-hidden transition-colors duration-300">
        <div className="mb-6">
          <h3 className="font-title-md text-title-md font-bold text-on-surface">Packages</h3>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {selectedVenvForView || selectedGlobalEnvForView ? `${activePackages.length} dependencies` : 'Select an environment'}
          </p>
        </div>

        {selectedVenvForView || selectedGlobalEnvForView ? (
          <>
            <div className="flex border-b border-outline-variant mb-4">
              <button className="flex-1 pb-2 font-label-caps text-label-caps text-primary border-b-2 border-primary">Installed</button>
              <button className="flex-1 pb-2 font-label-caps text-label-caps text-on-surface-variant hover:text-primary transition-colors">Risk Analysis</button>
            </div>
            
            <div className="relative mb-6">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">filter_alt</span>
              <input 
                className="w-full bg-surface-container-highest border-none rounded-lg pl-10 pr-4 py-2 text-body-sm focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/40" 
                placeholder="Filter packages..." 
                type="text"
                value={venvSearch}
                onChange={(e) => setVenvSearch(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1 -mx-2 px-2 scroll-smooth scrollbar-thin">
              {isLoadingPackages ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-10 bg-surface-container-high animate-pulse rounded-lg" />
                  ))}
                </div>
              ) : filteredActivePackages.length > 0 ? (
                filteredActivePackages.map((pkg: any) => (
                  <div key={pkg.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-surface-container-high cursor-pointer group transition-all duration-200">
                    <span className="font-code-sm text-code-sm text-on-surface-variant group-hover:text-primary transition-colors truncate flex-1">{pkg.name}</span>
                    <span className="font-code-sm text-code-sm text-on-surface-variant/50 ml-2">{pkg.version || pkg.installedVersion}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 opacity-40">
                  <span className="material-symbols-outlined text-[32px] mb-2">inventory_2</span>
                  <p className="text-[12px] font-label-caps">No matches</p>
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-outline-variant">
              <button 
                onClick={() => handleViewInPackages(selectedVenvForView?.path || selectedGlobalEnvForView?.id?.toString() || "")}
                className="w-full bg-primary text-on-primary py-3 rounded-lg font-label-caps text-label-caps hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/10"
              >
                Manage in Packages Page
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center opacity-30">
            <span className="material-symbols-outlined text-[48px] mb-4">analytics</span>
            <p className="text-sm font-label-caps">Select an environment<br/>to view dependencies</p>
          </div>
        )}
      </aside>

      {/* Keep Dialogs and Modals */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="rounded-2xl border-outline-variant bg-surface-container-lowest shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-title-md text-title-md text-primary">Register Environment</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="env-name" className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">Environment Name</Label>
              <Input
                id="env-name"
                placeholder="e.g. Production API, Local Dev"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                className="h-12 rounded-xl border-outline-variant bg-surface-container-low focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-12 rounded-xl border-outline-variant bg-surface-container-low focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest">
                  <SelectItem value="pip">pip</SelectItem>
                  <SelectItem value="venv">venv</SelectItem>
                  <SelectItem value="conda">conda</SelectItem>
                  <SelectItem value="npm">npm</SelectItem>
                  <SelectItem value="nvm">nvm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="env-path" className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">File System Path</Label>
              <Input
                id="env-path"
                placeholder="e.g. /Users/name/projects/my-app"
                value={path}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPath(e.target.value)}
                className="h-12 rounded-xl border-outline-variant bg-surface-container-low focus:ring-primary"
              />
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button 
              variant="ghost" 
              onClick={() => setShowCreate(false)}
              className="rounded-xl font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreate} 
              disabled={createEnv.isPending} 
              className="bg-primary hover:brightness-110 text-on-primary rounded-xl px-8 font-label-caps text-label-caps h-12"
            >
              {createEnv.isPending ? "Creating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
