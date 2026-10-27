import React, { useState, useMemo, useEffect } from "react";
import {
  Plus, RefreshCw, Trash2, Server, Search, FolderOpen,
  CheckCircle2, ChevronRight, Box, AlertTriangle, Globe, Layers,
  MoreVertical, Pencil, AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useListEnvironments,
  useCreateEnvironment,
  useDeleteEnvironment,
  useScanEnvironment,
  useGetSettings,
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

  useEffect(() => {
    if (!hasSelection) setSearch("");
  }, [hasSelection]);

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

  // ── Settings ────────────────────────────────────────────────────────────
  const { data: settings } = useGetSettings();

  // ── Active tab & Selection state ─────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>("global");
  const [selectedProject, setSelectedProject]     = useState<ProjectEnvironment | null>(null);
  const [selectedGlobalEnv, setSelectedGlobalEnv] = useState<Environment | null>(null);
  const [selectedVenv, setSelectedVenv]           = useState<any | null>(null);

  const clearSelection = () => {
    setSelectedProject(null);
    setSelectedGlobalEnv(null);
    setSelectedVenv(null);
  };

  const handleTabChange = (newTab: string) => {
    setActiveTab(newTab);
    clearSelection();
  };

  const handleToggleGlobalEnv = (env: Environment) => {
    setSelectedProject(null);
    setSelectedVenv(null);
    setSelectedGlobalEnv((prev: Environment | null) => (prev?.id === env.id ? null : env));
  };

  const handleToggleProject = (proj: ProjectEnvironment) => {
    setSelectedGlobalEnv(null);
    setSelectedVenv(null);
    setSelectedProject((prev: ProjectEnvironment | null) => (prev?.id === proj.id ? null : proj));
  };

  const handleToggleVenv = (venv: any) => {
    setSelectedGlobalEnv(null);
    setSelectedProject(null);
    setSelectedVenv((prev: any) => (prev?.path === venv.path ? null : venv));
  };

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
  const hasSelection = !!(
    (activeTab === "global" && selectedGlobalEnv) ||
    (activeTab === "projects" && selectedProject) ||
    (activeTab === "venvs" && selectedVenv)
  );

  const sidebarPackages = useMemo(() => {
    if (activeTab === "global" && selectedGlobalEnv) return globalPackagesResult ?? [];
    if (activeTab === "projects" && selectedProject) return projectPackages ?? [];
    if (activeTab === "venvs" && selectedVenv) return venvPackagesResult?.packages ?? [];
    return [];
  }, [activeTab, selectedGlobalEnv, globalPackagesResult, selectedProject, projectPackages, selectedVenv, venvPackagesResult]);

  const sidebarLoading =
    (activeTab === "global" && !!selectedGlobalEnv && loadingGlobalPkgs) ||
    (activeTab === "projects" && !!selectedProject && loadingProjPkgs) ||
    (activeTab === "venvs" && !!selectedVenv && loadingVenvPkgs);

  const sidebarTitle = hasSelection
    ? (selectedProject?.name ?? selectedVenv?.name ?? selectedGlobalEnv?.name ?? "Packages")
    : "Packages";

  const sidebarSubtitle = hasSelection
    ? `${sidebarPackages.length} packages`
    : "Select an environment to view dependencies";

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

  // ── Rename Project State & Handlers ─────────────────────────────────────
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameTarget, setRenameTarget]       = useState<ProjectEnvironment | null>(null);
  const [renameInput, setRenameInput]         = useState("");
  const [renameError, setRenameError]         = useState<string | null>(null);
  const [isConfirmStep, setIsConfirmStep]     = useState(false);
  const [isRenaming, setIsRenaming]           = useState(false);

  const handleOpenRename = (proj: ProjectEnvironment) => {
    setRenameTarget(proj);
    setRenameInput(proj.name);
    setRenameError(null);
    setIsConfirmStep(false);
    setShowRenameModal(true);
  };

  const validateRename = (input: string, currentProj: ProjectEnvironment) => {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: "Project name cannot be empty or contain only whitespace." };
    }
    if (trimmed.length > 214) {
      return { valid: false, error: "Project name cannot exceed 214 characters." };
    }
    if (/[<>:"/\\|?*\x00-\x1f]/.test(trimmed)) {
      return {
        valid: false,
        error: 'Project name cannot contain invalid characters (/ \\ : * ? " < > |).',
      };
    }
    if (/^\.+$/.test(trimmed) || trimmed.endsWith(".")) {
      return {
        valid: false,
        error: "Project name cannot consist only of dots or end with a dot.",
      };
    }
    if (trimmed === currentProj.name.trim()) {
      return {
        valid: false,
        isIdentical: true,
        error: "New name is identical to the current name.",
      };
    }
    const isDuplicate = (projects || []).some(
      (p) =>
        p.id !== currentProj.id &&
        p._coreProjectId !== currentProj._coreProjectId &&
        p.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      return {
        valid: false,
        isDuplicate: true,
        error: `A project named "${trimmed}" already exists. Please choose a different name.`,
      };
    }
    return { valid: true, name: trimmed };
  };

  const handleProceedToConfirm = () => {
    if (!renameTarget) return;
    const res = validateRename(renameInput, renameTarget);
    if (!res.valid) {
      setRenameError(res.error || "Invalid project name.");
      return;
    }
    setRenameError(null);
    setIsConfirmStep(true);
  };

  const handleConfirmRename = async () => {
    if (!renameTarget) return;
    const res = validateRename(renameInput, renameTarget);
    if (!res.valid) {
      setRenameError(res.error || "Invalid project name.");
      setIsConfirmStep(false);
      return;
    }

    const trimmedName = res.name!;
    setIsRenaming(true);
    try {
      const api = (window as any).electronAPI;
      if (!api || !api.renameProject) {
        throw new Error("Rename functionality is not available in current environment");
      }

      const result = await api.renameProject(renameTarget._coreProjectId || renameTarget.projectId, trimmedName);
      if (result && result.unchanged) {
        setShowRenameModal(false);
        return;
      }

      // Update selected project immediately if it was renamed
      if (selectedProject && (selectedProject.id === renameTarget.id || selectedProject._coreProjectId === renameTarget._coreProjectId)) {
        setSelectedProject((prev) => (prev ? { ...prev, name: trimmedName } : prev));
      }

      // Invalidate all related queries
      await refetchProjects();
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", "packages"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["/api/history"] });
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/status-breakdown"] });
      qc.invalidateQueries({ queryKey: ["packages"] });

      toast({
        title: "Project Renamed",
        description: `Successfully renamed "${renameTarget.name}" to "${trimmedName}".`,
      });

      setShowRenameModal(false);
      setRenameTarget(null);
      setRenameInput("");
      setRenameError(null);
      setIsConfirmStep(false);
    } catch (err: any) {
      toast({
        title: "Rename Failed",
        description: err?.message || "Failed to rename project.",
        variant: "destructive",
      });
    } finally {
      setIsRenaming(false);
    }
  };

  // ── Remove Project State & Handlers ─────────────────────────────────────
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [removeTarget, setRemoveTarget]       = useState<ProjectEnvironment | null>(null);
  const [isRemoving, setIsRemoving]           = useState(false);

  const handleOpenRemove = (proj: ProjectEnvironment) => {
    setRemoveTarget(proj);
    setShowRemoveModal(true);
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget || isRemoving) return;

    setIsRemoving(true);
    try {
      const api = (window as any).electronAPI;
      if (!api || !api.removeProject) {
        throw new Error("Remove project functionality is not available in current environment");
      }

      const targetId = removeTarget._coreProjectId || removeTarget.projectId || removeTarget.id;
      await api.removeProject(targetId);

      // If removed project was selected, clear selection and reset Packages panel
      if (
        selectedProject &&
        (selectedProject.id === removeTarget.id ||
         selectedProject._coreProjectId === removeTarget._coreProjectId ||
         selectedProject.name === removeTarget.name)
      ) {
        setSelectedProject(null);
      }

      // Invalidate queries so Environments page and summary counts update immediately
      await refetchProjects();
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", "packages"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["/api/history"] });
      qc.invalidateQueries({ queryKey: ["snapshots"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/dashboard/status-breakdown"] });
      qc.invalidateQueries({ queryKey: ["packages"] });

      toast({
        title: "Project Removed",
        description: `Project "${removeTarget.name}" was removed from tracked environments. No files on disk were deleted.`,
      });

      setShowRemoveModal(false);
      setRemoveTarget(null);
    } catch (err: any) {
      toast({
        title: "Removal Failed",
        description: err?.message || "Failed to remove project.",
        variant: "destructive",
      });
    } finally {
      setIsRemoving(false);
    }
  };

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
    onSuccess: (_, path) => {
      qc.invalidateQueries({ queryKey: ["venvs", "registered"] });
      if (selectedVenv?.path === path) setSelectedVenv(null);
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
    const defaultPath = (settings as any)?.defaultVenvScanDir || undefined;
    const dir = await (window as any).electronAPI.openDirectory(defaultPath);
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
        <div className="mb-6 space-y-1">
          <h2 className="text-[18px] font-semibold text-on-surface leading-tight">Environment Management</h2>
          <p className="text-[13px] text-muted-foreground">Monitor Global Systems, Projects, and Virtual Environments</p>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
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
                {(!envs || envs.length === 0) ? (
                  <div
                    onClick={() => setShowCreate(true)}
                    className="col-span-1 xl:col-span-2 border-2 border-dashed border-card-border rounded-lg p-10 flex flex-col items-center justify-center gap-3 hover:bg-[#E8E9FF] hover:border-[#6366F1] transition-all cursor-pointer group min-h-[240px] text-center"
                  >
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground transition-all group-hover:bg-[#4338CA] group-hover:text-white">
                      <Plus className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-[15px] font-semibold text-on-surface group-hover:text-[#4338CA] transition-colors">No global environments detected</p>
                      <p className="text-[13px] text-muted-foreground mt-1 group-hover:text-[#4338CA]/80 transition-colors max-w-sm">
                        Click here to register a new system path or global runtime for auditing
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary mt-1 group-hover:text-[#4338CA]">
                      <Plus className="w-3.5 h-3.5" />
                      Add Global Environment
                    </span>
                  </div>
                ) : (
                  <>
                    {envs.map((env: Environment) => (
                      <div
                        key={env.id}
                        onClick={() => handleToggleGlobalEnv(env)}
                        className={cn(
                          "bg-surface-container-lowest border p-5 rounded-lg transition-all group cursor-pointer",
                          selectedGlobalEnv?.id === env.id
                            ? "border-primary ring-1 ring-primary/20 shadow-[var(--shadow-premium-hover)] bg-surface-container-low/50"
                            : "border-card-border shadow-[var(--shadow-premium)] hover:shadow-[var(--shadow-premium-hover)] hover:bg-[#F0F0FF] hover:border-[#6366F1]"
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
                      className="border-2 border-dashed border-card-border rounded-lg p-5 flex flex-col items-center justify-center gap-3 hover:bg-[#E8E9FF] hover:border-[#6366F1] transition-all cursor-pointer group min-h-[220px]"
                    >
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground transition-all group-hover:bg-[#4338CA] group-hover:text-white">
                        <Plus className="w-5 h-5" />
                      </div>
                      <div className="text-center">
                        <p className="text-[14px] font-semibold text-on-surface group-hover:text-[#4338CA] transition-colors">Add global environment</p>
                        <p className="text-[12px] text-muted-foreground mt-1 group-hover:text-[#4338CA]/80 transition-colors">Register a new system path for auditing</p>
                      </div>
                    </div>
                  </>
                )}
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
              <div
                onClick={() => {
                  navigator.clipboard?.writeText("pg init");
                  toast({ title: "Copied to clipboard", description: "Run 'pg init' in any project directory to register it." });
                }}
                className="border-2 border-dashed border-card-border rounded-lg p-10 flex flex-col items-center justify-center gap-3 hover:bg-[#E8E9FF] hover:border-[#6366F1] transition-all cursor-pointer group min-h-[240px] text-center"
              >
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground transition-all group-hover:bg-[#4338CA] group-hover:text-white">
                  <Box className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-on-surface group-hover:text-[#4338CA] transition-colors">No projects initialized</p>
                  <p className="text-[13px] text-muted-foreground mt-1 max-w-sm leading-relaxed group-hover:text-[#4338CA]/80 transition-colors">
                    Run <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-primary font-medium">pg init</code> inside a project directory to register it with PackageGuard.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary mt-1 group-hover:text-[#4338CA]">
                  Click to copy <code className="font-mono bg-muted px-1 py-0.5 rounded text-primary">pg init</code>
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                {projects.map((proj: ProjectEnvironment) => (
                  <div
                    key={proj.id}
                    onClick={() => handleToggleProject(proj)}
                    className={cn(
                      "bg-surface-container-lowest border p-5 rounded-lg transition-all group cursor-pointer",
                      selectedProject?.id === proj.id
                        ? "border-primary ring-1 ring-primary/20 shadow-[var(--shadow-premium-hover)] bg-surface-container-low/50"
                        : "border-card-border shadow-[var(--shadow-premium)] hover:shadow-[var(--shadow-premium-hover)] hover:bg-[#F0F0FF] hover:border-[#6366F1]"
                    )}
                  >
                    {/* Card header */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3 min-w-0">
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

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-surface-container-high hover:text-on-surface transition-colors shrink-0"
                            title="Project actions"
                            aria-label="Project actions"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="rounded-md border-card-border bg-surface-container-lowest shadow-lg">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenRename(proj);
                            }}
                            className="cursor-pointer flex items-center gap-2 text-[13px]"
                          >
                            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>Rename Project</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenRemove(proj);
                            }}
                            className="cursor-pointer flex items-center gap-2 text-[13px] text-destructive focus:text-destructive focus:bg-destructive/10"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            <span>Remove Project</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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

                {/* Add project placeholder card */}
                <div
                  onClick={() => {
                    navigator.clipboard?.writeText("pg init");
                    toast({ title: "Copied to clipboard", description: "Run 'pg init' in any project directory to register it." });
                  }}
                  className="border-2 border-dashed border-card-border rounded-lg p-5 flex flex-col items-center justify-center gap-3 hover:bg-[#E8E9FF] hover:border-[#6366F1] transition-all cursor-pointer group min-h-[220px] text-center"
                >
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground transition-all group-hover:bg-[#4338CA] group-hover:text-white">
                    <Box className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[14px] font-semibold text-on-surface group-hover:text-[#4338CA] transition-colors">Add another project</p>
                    <p className="text-[12px] text-muted-foreground mt-1 group-hover:text-[#4338CA]/80 transition-colors">
                      Run <code className="font-mono bg-muted px-1.5 py-0.5 rounded text-primary font-medium">pg init</code> in project folder (click to copy)
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── VIRTUAL ENVS ───────────────────────────────────────────── */}
          <TabsContent value="venvs" className="space-y-5 mt-2">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              {(!registeredVenvs || registeredVenvs.length === 0) ? (
                <div
                  onClick={handleScanForVenvs}
                  className="col-span-1 xl:col-span-2 border-2 border-dashed border-card-border rounded-lg p-10 flex flex-col items-center justify-center gap-3 hover:bg-[#E8E9FF] hover:border-[#6366F1] transition-all cursor-pointer group min-h-[240px] text-center"
                >
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground transition-all group-hover:bg-[#4338CA] group-hover:text-white">
                    {isScanningVenvs ? <RefreshCw className="w-5 h-5 animate-spin" /> : <FolderOpen className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-[15px] font-semibold text-on-surface group-hover:text-[#4338CA] transition-colors">
                      {isScanningVenvs ? "Scanning directory for virtual environments..." : "No virtual environments discovered"}
                    </p>
                    <p className="text-[13px] text-muted-foreground mt-1 group-hover:text-[#4338CA]/80 transition-colors max-w-sm">
                      {isScanningVenvs
                        ? "Please wait while we search for Python virtual environments."
                        : "Click to select a directory and automatically discover Python virtual environments"}
                    </p>
                  </div>
                  {!isScanningVenvs && (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-primary mt-1 group-hover:text-[#4338CA]">
                      <Search className="w-3.5 h-3.5" />
                      Discover virtual environments
                    </span>
                  )}
                </div>
              ) : (
                <>
                  {registeredVenvs.map((venv: any) => (
                    <div
                      key={venv.path}
                      onClick={() => handleToggleVenv(venv)}
                      className={cn(
                        "bg-surface-container-lowest border p-5 rounded-lg transition-all group cursor-pointer",
                        selectedVenv?.path === venv.path
                          ? "border-primary ring-1 ring-primary/20 shadow-[var(--shadow-premium-hover)] bg-surface-container-low/50"
                          : "border-card-border shadow-[var(--shadow-premium)] hover:shadow-[var(--shadow-premium-hover)] hover:bg-[#F0F0FF] hover:border-[#6366F1]"
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
                    className="border-2 border-dashed border-card-border rounded-lg p-5 flex flex-col items-center justify-center gap-3 hover:bg-[#E8E9FF] hover:border-[#6366F1] transition-all cursor-pointer group min-h-[220px]"
                  >
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-muted-foreground transition-all group-hover:bg-[#4338CA] group-hover:text-white">
                      {isScanningVenvs ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    </div>
                    <div className="text-center">
                      <p className="text-[14px] font-semibold text-on-surface group-hover:text-[#4338CA] transition-colors">{isScanningVenvs ? "Scanning..." : "Discover venvs"}</p>
                      <p className="text-[12px] text-muted-foreground mt-1 group-hover:text-[#4338CA]/80 transition-colors">Scan directory for virtual environments</p>
                    </div>
                  </div>
                </>
              )}
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
        title={sidebarTitle}
        subtitle={sidebarSubtitle}
        packages={sidebarPackages}
        isLoading={sidebarLoading}
        hasSelection={hasSelection}
        onViewInPackages={hasSelection && (selectedVenv || selectedGlobalEnv) ? handleViewInPackages : undefined}
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

      {/* ── Rename Project Dialog ────────────────────────────────────────── */}
      <Dialog
        open={showRenameModal}
        onOpenChange={(open) => {
          if (!isRenaming) {
            setShowRenameModal(open);
            if (!open) {
              setRenameTarget(null);
              setRenameInput("");
              setRenameError(null);
              setIsConfirmStep(false);
            }
          }
        }}
      >
        <DialogContent className="rounded-lg border-card-border bg-surface-container-lowest shadow-[0_20px_60px_rgba(0,0,0,0.15)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-semibold text-on-surface">Rename Project</DialogTitle>
          </DialogHeader>

          {!isConfirmStep ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg bg-surface-container-low p-3.5 border border-card-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Current Name</span>
                  <span className="text-[13px] font-semibold text-on-surface truncate max-w-[220px]" title={renameTarget?.name}>
                    {renameTarget?.name}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Path</span>
                  <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[240px]" title={renameTarget?.path}>
                    {renameTarget?.path}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="rename-project-input" className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                  New Project Name
                </Label>
                <Input
                  id="rename-project-input"
                  value={renameInput}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setRenameInput(e.target.value);
                    if (renameError) setRenameError(null);
                  }}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleProceedToConfirm();
                    }
                  }}
                  placeholder="e.g. My Renamed Project"
                  className={cn(
                    "h-11 rounded-md border-card-border bg-surface-container-low focus:ring-primary text-[14px]",
                    renameError && "border-destructive focus-visible:ring-destructive"
                  )}
                  autoFocus
                />
                {renameError && (
                  <p className="text-[12px] text-destructive flex items-center gap-1.5 mt-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{renameError}</span>
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-3">
              <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
                <p className="text-[13px] text-on-surface leading-relaxed">
                  Rename &ldquo;<span className="font-semibold text-primary">{renameTarget?.name}</span>&rdquo; to &ldquo;<span className="font-semibold text-primary">{renameInput.trim()}</span>&rdquo;? This change will be reflected throughout PackageGuard. Existing scan history, snapshots, and package records will be preserved.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-3">
            {!isConfirmStep ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowRenameModal(false)}
                  className="h-10 rounded-md px-4 text-[13px] font-medium"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleProceedToConfirm}
                  className="primary-btn-solid h-10 px-5 rounded-md text-[13px] font-medium"
                >
                  Save Changes
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={isRenaming}
                  onClick={() => setIsConfirmStep(false)}
                  className="h-10 rounded-md px-4 text-[13px] font-medium"
                >
                  Back
                </Button>
                <Button
                  disabled={isRenaming}
                  onClick={handleConfirmRename}
                  className="primary-btn-solid h-10 px-5 rounded-md text-[13px] font-medium flex items-center gap-2"
                >
                  {isRenaming ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Renaming...</span>
                    </>
                  ) : (
                    <span>Confirm Rename</span>
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remove Project Confirmation Dialog ────────────────────────────── */}
      <Dialog
        open={showRemoveModal}
        onOpenChange={(open: boolean) => {
          if (!isRemoving) {
            setShowRemoveModal(open);
            if (!open) setRemoveTarget(null);
          }
        }}
      >
        <DialogContent className="rounded-lg border-card-border bg-surface-container-lowest shadow-[0_20px_60px_rgba(0,0,0,0.15)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[16px] font-semibold text-on-surface">Remove Project</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="rounded-lg bg-surface-container-low p-3.5 border border-card-border space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Project Name</span>
                <span className="text-[13px] font-semibold text-on-surface truncate max-w-[220px]" title={removeTarget?.name}>
                  {removeTarget?.name}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Path</span>
                <span className="text-[11px] font-mono text-muted-foreground truncate max-w-[240px]" title={removeTarget?.path}>
                  {removeTarget?.path}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2">
              <p className="text-[13px] text-on-surface leading-relaxed">
                Are you sure you want to remove &ldquo;<span className="font-semibold text-destructive">{removeTarget?.name}</span>&rdquo; from Package Guard?
              </p>
              <p className="text-[12px] text-muted-foreground leading-relaxed">
                This will remove the project from Package Guard&rsquo;s tracked environments. <span className="font-semibold text-on-surface">Your actual project directory, source code, and local files will NOT be deleted or modified.</span>
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-3">
            <Button
              variant="outline"
              disabled={isRemoving}
              onClick={() => {
                setShowRemoveModal(false);
                setRemoveTarget(null);
              }}
              className="h-10 rounded-md px-4 text-[13px] font-medium"
            >
              Cancel
            </Button>
            <Button
              disabled={isRemoving}
              onClick={handleConfirmRemove}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground h-10 px-5 rounded-md text-[13px] font-medium flex items-center gap-2 cursor-pointer"
            >
              {isRemoving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Removing...</span>
                </>
              ) : (
                <span>Remove Project</span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
