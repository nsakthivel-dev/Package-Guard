import React, { useState, useMemo, useEffect } from "react";
import {
  Plus, RefreshCw, Trash2, Server, Search, FolderOpen,
  CheckCircle2, ChevronRight, Box, AlertTriangle, Globe, Layers,
} from "lucide-react";
import {
  useListEnvironments,
  useCreateEnvironment,
  useDeleteEnvironment,
  useScanEnvironment,
  getListEnvironmentsQueryKey,
  Environment,
} from "@packageguard/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePackageStore } from "@/store/usePackageStore";
import { useLocation } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProjectEnvironment {
  id: string;
  projectId: string;
  name: string;
  path: string;
  environmentType: "project" | "virtual" | "global" | "none" | "unknown";
  packageManager: string | null;
  runtime: string | null;
  venvPath: string | null;
  packageCount: number;
  warning: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  lastScanAt: number | null;
  _coreProjectId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function envTypeLabel(t: string): string {
  const map: Record<string, string> = {
    project: "Project Environment",
    virtual: "Virtual Environment",
    global:  "Global Environment",
    none:    "No Dependencies",
    unknown: "Unknown",
  };
  return map[t] ?? t;
}

function pmBadgeColor(pm: string | null): string {
  switch (pm) {
    case "npm":   return "bg-red-500/10 text-red-400";
    case "pnpm":  return "bg-amber-500/10 text-amber-400";
    case "yarn":  return "bg-blue-500/10 text-blue-400";
    case "bun":   return "bg-yellow-500/10 text-yellow-400";
    case "pip":   return "bg-sky-500/10 text-sky-400";
    default:      return "bg-muted text-muted-foreground";
  }
}

function envTypeColor(t: string): string {
  switch (t) {
    case "project": return "bg-violet-500/10 text-violet-400";
    case "virtual": return "bg-emerald-500/10 text-emerald-400";
    case "global":  return "bg-amber-500/10 text-amber-400";
    case "none":    return "bg-muted text-muted-foreground";
    default:        return "bg-muted text-muted-foreground";
  }
}

function ProjectIcon({ envType }: { envType: string }) {
  const base = "w-5 h-5";
  if (envType === "virtual") return <Layers className={base} />;
  if (envType === "global")  return <Globe className={base} />;
  if (envType === "none")    return <Box className={base} />;
  return <Box className={base} />;
}

// ─── Package sidebar ──────────────────────────────────────────────────────────

interface PackageSidebarProps {
  title: string;
  subtitle: string;
  packages: any[];
  isLoading: boolean;
  onViewInPackages?: () => void;
  hasSelection: boolean;
}

function PackageSidebar({
  title, subtitle, packages, isLoading, onViewInPackages, hasSelection,
}: PackageSidebarProps) {
  const [search, setSearch] = useState("");
  const filtered = packages.filter((p: any) =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className="w-80 bg-surface-container-lowest border border-card-border shadow-[var(--shadow-premium)] flex flex-col p-5 sticky top-48 h-[calc(100vh-16rem)] rounded-lg overflow-hidden">
      <div className="mb-5">
        <h3 className="text-[15px] font-semibold text-on-surface">{title}</h3>
        <p className="text-[12px] text-muted-foreground mt-1">{subtitle}</p>
      </div>

      {hasSelection ? (
        <>
          <div className="flex border-b border-card-border mb-4">
            <button className="flex-1 pb-2 text-[12px] font-semibold text-primary border-b-2 border-primary">Installed</button>
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <input
              className="w-full bg-surface-container-low border border-card-border rounded-md pl-9 pr-3 py-2 text-[13px] text-on-surface focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder:text-muted-foreground/50"
              placeholder="Filter packages..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-0.5 -mx-2 px-2">
            {isLoading ? (
              <div className="space-y-2">
                {[1,2,3,4,5,6].map(i => (
                  <div key={i} className="h-9 bg-surface-container animate-pulse rounded-md" />
                ))}
              </div>
            ) : filtered.length > 0 ? (
              filtered.map((pkg: any) => (
                <div key={pkg.name} className="flex items-center justify-between p-2 rounded-md hover:bg-surface-container-low transition-colors">
                  <span className="text-[12px] font-mono text-muted-foreground truncate flex-1">{pkg.name}</span>
                  <span className="text-[12px] font-mono text-muted-foreground/60 ml-2 shrink-0">{pkg.version || pkg.installedVersion}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-8 opacity-40">
                <FolderOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">No packages</p>
              </div>
            )}
          </div>
          {onViewInPackages && (
            <div className="mt-4 pt-4 border-t border-card-border">
              <button
                onClick={onViewInPackages}
                className="w-full primary-btn-solid h-9 rounded-md text-[13px] font-medium flex items-center justify-center gap-1.5"
              >
                Manage in Packages
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center mb-3 opacity-50">
            <Server className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-[12px] font-medium text-muted-foreground leading-relaxed">
            Select an environment<br />to view dependencies
          </p>
        </div>
      )}
    </aside>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Environments() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { setActiveVenvPath } = usePackageStore();

  // ── Global Systems (existing dbHandler envs) ────────────────────────────
  const { data: envs, isLoading: isLoadingEnvs } = useListEnvironments();
  const createEnv = useCreateEnvironment();
  const deleteEnv = useDeleteEnvironment();
  const scanEnv = useScanEnvironment();

  // ── Projects (core db.json) ─────────────────────────────────────────────
  const { data: projects, isLoading: isLoadingProjects, refetch: refetchProjects } = useQuery<ProjectEnvironment[]>({
    queryKey: ["projects"],
    queryFn: () => (window as any).electronAPI.getProjects(),
    refetchOnWindowFocus: true,
  });

  // ── Virtual Envs (registered venvs) ────────────────────────────────────
  const { data: registeredVenvs } = useQuery({
    queryKey: ["venvs", "registered"],
    queryFn: () => (window as any).electronAPI.getRegisteredVenvs(),
  });

  // ── Selection state ─────────────────────────────────────────────────────
  const [selectedProject, setSelectedProject]   = useState<ProjectEnvironment | null>(null);
  const [selectedGlobalEnv, setSelectedGlobalEnv] = useState<Environment | null>(null);
  const [selectedVenv, setSelectedVenv]          = useState<any | null>(null);

  // ── Sidebar package data ────────────────────────────────────────────────
  const { data: projectPackages, isLoading: loadingProjPkgs } = useQuery<any[]>({
    queryKey: ["projects", "packages", selectedProject?._coreProjectId],
    queryFn: () => (window as any).electronAPI.getProjectPackages(selectedProject!._coreProjectId),
    enabled: !!selectedProject,
  });

  const { data: venvPackagesResult, isLoading: loadingVenvPkgs } = useQuery<any>({
    queryKey: ["venvs", "packages", selectedVenv?.path],
    queryFn: () => (window as any).electronAPI.getVenvPackages(selectedVenv!.path),
    enabled: !!selectedVenv,
  });

  const { data: globalPackagesResult, isLoading: loadingGlobalPkgs } = useQuery<any>({
    queryKey: ["packages", "list", selectedGlobalEnv?.id],
    queryFn: () => (window as any).electronAPI.getPackages({ environmentId: selectedGlobalEnv?.id }),
    enabled: !!selectedGlobalEnv,
  });

  // ── Sidebar computed values ─────────────────────────────────────────────
  const sidebarPackages = useMemo(() => {
    if (selectedProject) return projectPackages ?? [];
    if (selectedVenv)    return venvPackagesResult?.packages ?? [];
    if (selectedGlobalEnv) return globalPackagesResult ?? [];
    return [];
  }, [selectedProject, projectPackages, selectedVenv, venvPackagesResult, selectedGlobalEnv, globalPackagesResult]);

  const sidebarLoading = loadingProjPkgs || loadingVenvPkgs || loadingGlobalPkgs;
  const sidebarTitle   = selectedProject?.name ?? selectedVenv?.name ?? selectedGlobalEnv?.name ?? "Packages";
  const sidebarSubtitle = (selectedProject || selectedVenv || selectedGlobalEnv)
    ? `${sidebarPackages.length} packages`
    : "Select an environment";
  const hasSelection = !!(selectedProject || selectedVenv || selectedGlobalEnv);

  // ── Listen for projects:updated and onDataChanged from main process ────
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;
    const unlisten1 = api.onProjectsUpdated?.(() => {
      refetchProjects();
      qc.invalidateQueries({ queryKey: ["projects"] });
    });
    const unlisten2 = api.onDataChanged?.(() => {
      refetchProjects();
      qc.invalidateQueries({ queryKey: ["projects"] });
    });
    return () => {
      if (typeof unlisten1 === "function") unlisten1();
      if (typeof unlisten2 === "function") unlisten2();
    };
  }, [refetchProjects, qc]);

  // ── Scan state ──────────────────────────────────────────────────────────
  const [scanningId,        setScanningId]        = useState<string | null>(null);
  const [scanningProjId,    setScanningProjId]    = useState<string | null>(null);
  const [isRescanningGlobal, setIsRescanningGlobal] = useState(false);

  const handleRescanGlobalSystems = async () => {
    setIsRescanningGlobal(true);
    try {
      await (window as any).electronAPI.scanEnvironments();
      qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
      toast({ title: "Global systems refreshed" });
    } catch (e: any) {
      toast({ title: "Refresh failed", description: e?.message, variant: "destructive" });
    } finally {
      setIsRescanningGlobal(false);
    }
  };

  // ── Venv discovery ──────────────────────────────────────────────────────
  const [foundVenvs,     setFoundVenvs]     = useState<any[]>([]);
  const [isScanningVenvs, setIsScanningVenvs] = useState(false);

  const scanVenvsMutation = useMutation({
    mutationFn: (rootDir: string) => (window as any).electronAPI.scanVenvs(rootDir),
    onSuccess: (data: any[]) => {
      setFoundVenvs(data);
      if (data.length === 0) toast({ title: "No virtual environments found", variant: "destructive" });
      else toast({ title: `Found ${data.length} virtual environments` });
    },
  });

  const registerVenvMutation = useMutation({
    mutationFn: (venv: any) => (window as any).electronAPI.registerVenv(venv),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venvs", "registered"] });
      toast({ title: "Venv registered successfully" });
    },
  });

  const removeVenvMutation = useMutation({
    mutationFn: (path: string) => (window as any).electronAPI.removeVenv(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["venvs", "registered"] });
      toast({ title: "Venv removed" });
    },
  });

  // ── Add global env dialog ───────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [name,  setName]  = useState("");
  const [type,  setType]  = useState<string>("pip");
  const [envPath, setEnvPath] = useState("");

  const handleCreate = () => {
    if (!name.trim() || !envPath.trim()) return;
    createEnv.mutate(
      { data: { name, type: type as any, path: envPath } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
          setShowCreate(false); setName(""); setType("pip"); setEnvPath("");
          toast({ title: "Environment created" });
        },
      }
    );
  };

  // ── Global env handlers ─────────────────────────────────────────────────
  const handleDelete = (id: string, envName: string) => {
    deleteEnv.mutate({ id: id as any }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEnvironmentsQueryKey() });
        if (selectedGlobalEnv?.id === (id as any)) setSelectedGlobalEnv(null);
        toast({ title: `Deleted "${envName}"` });
      },
    });
  };

  const handleScanGlobal = (id: string) => {
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

  // ── Project scan handler ────────────────────────────────────────────────
  const handleScanProject = async (projectId: string, coreId: string) => {
    setScanningProjId(projectId);
    try {
      const result = await (window as any).electronAPI.scanProject(coreId);
      await refetchProjects();
      qc.invalidateQueries({ queryKey: ["projects", "packages", coreId] });
      toast({ title: `Scan complete — ${result?.env?.packageCount ?? 0} packages` });
    } catch (e: any) {
      toast({ title: "Scan failed", description: e?.message, variant: "destructive" });
    } finally {
      setScanningProjId(null);
    }
  };

  // ── Venv scan ───────────────────────────────────────────────────────────
  const handleScanForVenvs = async () => {
    const dir = await (window as any).electronAPI.openDirectory();
    if (!dir) return;
    setIsScanningVenvs(true);
    scanVenvsMutation.mutate(dir, { onSettled: () => setIsScanningVenvs(false) });
  };

  // ── Navigate to packages page ───────────────────────────────────────────
  const handleViewInPackages = () => {
    const p = selectedVenv?.path || selectedGlobalEnv?.id?.toString() || "";
    setActiveVenvPath(p);
    setLocation("/packages");
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-5 items-start">
      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-[18px] font-semibold text-on-surface leading-tight">Environment Management</h2>
            <p className="text-[13px] text-muted-foreground mt-1">Monitor Global Systems, Projects, and Virtual Environments</p>
          </div>
          <Button
            onClick={() => setShowCreate(true)}
            className="primary-btn-solid h-9 px-4 rounded-lg text-[13px] font-medium"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Environment
          </Button>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <Tabs defaultValue="global" className="w-full">
          <TabsList className="bg-surface-container-lowest border border-card-border p-1 rounded-lg mb-6 h-10">
            <TabsTrigger value="global" className="rounded-md px-5 h-8 text-[13px] font-medium data-[state=active]:shadow-none">
              Global Systems
            </TabsTrigger>
            <TabsTrigger value="projects" className="rounded-md px-5 h-8 text-[13px] font-medium data-[state=active]:shadow-none">
              Projects
              {projects && projects.length > 0 && (
                <span className="ml-2 bg-primary/15 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {projects.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="venvs" className="rounded-md px-5 h-8 text-[13px] font-medium data-[state=active]:shadow-none">
              Virtual Envs
            </TabsTrigger>
          </TabsList>

          {/* ── GLOBAL SYSTEMS ─────────────────────────────────────────── */}
          <TabsContent value="global" className="space-y-5 mt-2">
            {/* Rescan button */}
            <div className="flex justify-end">
              <button
                onClick={handleRescanGlobalSystems}
                disabled={isRescanningGlobal}
                className="h-8 px-3 ghost-btn rounded-md text-[12px] font-medium flex items-center gap-1.5"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isRescanningGlobal && "animate-spin")} />
                {isRescanningGlobal ? "Detecting..." : "Detect Package Managers"}
              </button>
            </div>
            {isLoadingEnvs ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {[1,2,3,4].map(i => (
                  <div key={i} className="h-56 bg-surface-container-lowest border border-card-border rounded-lg animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {(!envs || envs.length === 0) && (
                  <div className="col-span-2 text-center py-14 opacity-50">
                    <Server className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-[14px] font-semibold text-on-surface">No global runtimes detected</p>
                    <p className="text-[12px] text-muted-foreground mt-1">Add a global environment to start monitoring</p>
                  </div>
                )}
                {envs?.map((env: Environment) => (
                  <div
                    key={env.id}
                    onClick={() => { setSelectedProject(null); setSelectedVenv(null); setSelectedGlobalEnv(env); }}
                    className={cn(
                      "bg-surface-container-lowest border p-5 rounded-lg transition-all group cursor-pointer",
                      selectedGlobalEnv?.id === env.id
                        ? "border-primary ring-1 ring-primary/20 shadow-[var(--shadow-premium-hover)]"
                        : "border-card-border shadow-[var(--shadow-premium)] hover:shadow-[var(--shadow-premium-hover)]"
                    )}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                          <Server className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-semibold text-on-surface truncate">{env.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            <p className="text-[12px] text-muted-foreground uppercase tracking-wider">{env.type}</p>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(env.id as any, env.name); }}
                        className="p-2 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-2.5 pt-4 border-t border-card-border">
                      {(env as any).version && (
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Version</span>
                          <span className="text-[12px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">{(env as any).version}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Path</span>
                        <span className="text-[12px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground truncate max-w-[200px]">{env.path}</span>
                      </div>
                      <div className="flex justify-between items-center gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Packages</span>
                        <span className="text-[13px] font-semibold text-on-surface">{env.packageCount ?? (env as any).package_count ?? 0}</span>
                      </div>
                      <div className="flex justify-between items-center gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Last Scan</span>
                        <span className="text-[12px] text-muted-foreground">
                          {env.lastScanned ? formatDistanceToNow(new Date(env.lastScanned), { addSuffix: true }) : "Never"}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleScanGlobal(env.id as any); }}
                      disabled={scanningId === (env.id as any)}
                      className="w-full mt-5 h-9 ghost-btn rounded-md text-[13px] font-medium flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={cn("w-4 h-4", scanningId === (env.id as any) && "animate-spin")} />
                      {scanningId === (env.id as any) ? "Scanning..." : "Start Scan"}
                    </button>
                  </div>
                ))}

                {/* Add global env card */}
                <div
                  onClick={() => setShowCreate(true)}
                  className="border-2 border-dashed border-card-border rounded-lg p-5 flex flex-col items-center justify-center gap-3 hover:bg-surface-container-low transition-colors cursor-pointer group min-h-[220px]"
                >
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div className="text-center">
                    <p className="text-[14px] font-semibold text-on-surface">Add global environment</p>
                    <p className="text-[12px] text-muted-foreground mt-1">Register a new system path for auditing</p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── PROJECTS ───────────────────────────────────────────────── */}
          <TabsContent value="projects" className="space-y-5 mt-2">
            {isLoadingProjects ? (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {[1,2,3].map(i => (
                  <div key={i} className="h-56 bg-surface-container-lowest border border-card-border rounded-lg animate-pulse" />
                ))}
              </div>
            ) : !projects || projects.length === 0 ? (
              <div className="text-center py-16 opacity-60">
                <Box className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-[15px] font-semibold text-on-surface">No projects initialized</p>
                <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed max-w-xs mx-auto">
                  Run <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-primary">pg init</code> inside a project directory to register it with PackageGuard.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {projects.map((proj: ProjectEnvironment) => (
                  <div
                    key={proj.id}
                    onClick={() => { setSelectedGlobalEnv(null); setSelectedVenv(null); setSelectedProject(proj); }}
                    className={cn(
                      "bg-surface-container-lowest border p-5 rounded-lg transition-all group cursor-pointer",
                      selectedProject?.id === proj.id
                        ? "border-primary ring-1 ring-primary/20 shadow-[var(--shadow-premium-hover)]"
                        : "border-card-border shadow-[var(--shadow-premium)] hover:shadow-[var(--shadow-premium-hover)]"
                    )}
                  >
                    {/* Card header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                          <ProjectIcon envType={proj.environmentType} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-semibold text-on-surface truncate">{proj.name}</h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", envTypeColor(proj.environmentType))}>
                              {envTypeLabel(proj.environmentType)}
                            </span>
                            {proj.packageManager && (
                              <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", pmBadgeColor(proj.packageManager))}>
                                {proj.packageManager}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card body */}
                    <div className="space-y-2.5 pt-4 border-t border-card-border">
                      <div className="flex justify-between items-center gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Path</span>
                        <span className="text-[12px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground truncate max-w-[200px]" title={proj.path}>
                          {proj.path}
                        </span>
                      </div>
                      {proj.venvPath && (
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Venv</span>
                          <span className="text-[12px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground truncate max-w-[200px]">
                            {proj.venvPath.split(/[/\\]/).pop()}
                          </span>
                        </div>
                      )}
                      {proj.runtime && (
                        <div className="flex justify-between items-center gap-3">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Runtime</span>
                          <span className="text-[12px] text-on-surface">{proj.runtime}</span>
                        </div>
                      )}
                      <div className="flex justify-between items-center gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Packages</span>
                        <span className="text-[13px] font-semibold text-on-surface">{proj.packageCount}</span>
                      </div>
                      <div className="flex justify-between items-center gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Last Scan</span>
                        <span className="text-[12px] text-muted-foreground">
                          {proj.lastScanAt
                            ? formatDistanceToNow(new Date(proj.lastScanAt), { addSuffix: true })
                            : "Never"}
                        </span>
                      </div>
                    </div>

                    {/* Warning */}
                    {proj.warning && (
                      <div className="mt-3 flex items-center gap-2 text-amber-400 bg-amber-400/8 border border-amber-400/20 rounded-md px-3 py-2">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-[11px] font-medium leading-tight">{proj.warning}</span>
                      </div>
                    )}

                    {/* Scan button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleScanProject(proj.id, proj._coreProjectId); }}
                      disabled={scanningProjId === proj.id}
                      className="w-full mt-5 h-9 ghost-btn rounded-md text-[13px] font-medium flex items-center justify-center gap-2"
                    >
                      <RefreshCw className={cn("w-4 h-4", scanningProjId === proj.id && "animate-spin")} />
                      {scanningProjId === proj.id ? "Scanning..." : "Scan Now"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── VIRTUAL ENVS ───────────────────────────────────────────── */}
          <TabsContent value="venvs" className="space-y-5 mt-2">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {(!registeredVenvs || registeredVenvs.length === 0) && (
                <div className="col-span-2 text-center py-10 opacity-50">
                  <FolderOpen className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-[14px] font-semibold text-on-surface">No virtual environments discovered</p>
                  <p className="text-[12px] text-muted-foreground mt-1">Use "Discover venvs" below to scan a directory</p>
                </div>
              )}
              {registeredVenvs?.map((venv: any) => (
                <div
                  key={venv.path}
                  onClick={() => { setSelectedGlobalEnv(null); setSelectedProject(null); setSelectedVenv(venv); }}
                  className={cn(
                    "bg-surface-container-lowest border p-5 rounded-lg transition-all group cursor-pointer",
                    selectedVenv?.path === venv.path
                      ? "border-primary ring-1 ring-primary/20 shadow-[var(--shadow-premium-hover)]"
                      : "border-card-border shadow-[var(--shadow-premium)] hover:shadow-[var(--shadow-premium-hover)]"
                  )}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                        <FolderOpen className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[15px] font-semibold text-on-surface truncate">{venv.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <p className="text-[12px] text-muted-foreground">Python venv</p>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeVenvMutation.mutate(venv.path); }}
                      className="p-2 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-2.5 pt-4 border-t border-card-border">
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Path</span>
                      <span className="text-[12px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground truncate max-w-[200px]">{venv.path}</span>
                    </div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Python Version</span>
                      <span className="text-[13px] font-semibold text-on-surface">{venv.pythonVersion ?? "Unknown"}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Discover venvs card */}
              <div
                onClick={handleScanForVenvs}
                className="border-2 border-dashed border-card-border rounded-lg p-5 flex flex-col items-center justify-center gap-3 hover:bg-surface-container-low transition-colors cursor-pointer group min-h-[220px]"
              >
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground">
                  {isScanningVenvs ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-semibold text-on-surface">{isScanningVenvs ? "Scanning..." : "Discover venvs"}</p>
                  <p className="text-[12px] text-muted-foreground mt-1">Scan directory for virtual environments</p>
                </div>
              </div>
            </div>

            {/* Discovery results */}
            {foundVenvs.length > 0 && (
              <div className="mt-8 bg-surface-container-lowest border border-card-border rounded-lg p-5">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-[15px] font-semibold text-on-surface">Discovery Results</h3>
                  <span className="bg-primary/10 text-primary px-2.5 py-1 rounded-full text-[11px] font-semibold">{foundVenvs.length} found</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {foundVenvs.map((venv: any) => {
                    const isRegistered = registeredVenvs?.some((v: any) => v.path === venv.path);
                    return (
                      <div key={venv.path} className="flex items-center justify-between p-3.5 bg-surface-container-low border border-card-border rounded-lg">
                        <div className="min-w-0 flex-1 mr-3">
                          <p className="text-[13px] font-semibold text-on-surface truncate">{venv.name}</p>
                          <p className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">{venv.path}</p>
                        </div>
                        <button
                          disabled={isRegistered || registerVenvMutation.isPending}
                          onClick={() => registerVenvMutation.mutate(venv)}
                          className={cn(
                            "h-8 px-4 rounded-md text-[12px] font-medium transition-all shrink-0",
                            isRegistered
                              ? "bg-emerald-500/10 text-emerald-600 flex items-center gap-1.5 cursor-default"
                              : "ghost-btn"
                          )}
                        >
                          {isRegistered ? (
                            <><CheckCircle2 className="w-3.5 h-3.5" />Tracked</>
                          ) : "Track"}
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

      {/* ── Package sidebar ─────────────────────────────────────────────── */}
      <PackageSidebar
        title="Packages"
        subtitle={sidebarSubtitle}
        packages={sidebarPackages}
        isLoading={sidebarLoading}
        hasSelection={hasSelection}
        onViewInPackages={selectedVenv || selectedGlobalEnv ? handleViewInPackages : undefined}
      />

      {/* ── Add Global Env Dialog ────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="rounded-lg border-card-border bg-surface-container-lowest shadow-[0_20px_60px_rgba(0,0,0,0.15)]">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-semibold text-on-surface">Register Environment</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            <div className="space-y-2">
              <Label htmlFor="env-name" className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Name</Label>
              <Input
                id="env-name"
                placeholder="e.g. Production API, Local Dev"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                className="h-11 rounded-md border-card-border bg-surface-container-low focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-11 rounded-md border-card-border bg-surface-container-low focus:ring-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-md border-card-border bg-surface-container-lowest">
                  <SelectItem value="pip">pip</SelectItem>
                  <SelectItem value="venv">venv</SelectItem>
                  <SelectItem value="conda">conda</SelectItem>
                  <SelectItem value="npm">npm</SelectItem>
                  <SelectItem value="nvm">nvm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="env-path" className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">File System Path</Label>
              <Input
                id="env-path"
                placeholder="e.g. C:\Users\name\projects\my-app"
                value={envPath}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEnvPath(e.target.value)}
                className="h-11 rounded-md border-card-border bg-surface-container-low focus:ring-primary"
              />
            </div>
          </div>
          <DialogFooter className="gap-3">
            <Button variant="outline" onClick={() => setShowCreate(false)} className="h-11 rounded-md px-5 text-[13px] font-medium">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createEnv.isPending} className="primary-btn-solid h-11 px-6 rounded-md text-[13px] font-medium">
              {createEnv.isPending ? "Creating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
