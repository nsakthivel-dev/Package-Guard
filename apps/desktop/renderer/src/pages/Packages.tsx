import React, { useState, useEffect, useMemo } from "react";
import { Search, ChevronDown, RefreshCw, MoreVertical, Trash2, Zap, CheckCircle2, XCircle, ShieldCheck, Package as PackageIcon } from "lucide-react";
import { 
  useListPackages, 
  useUpdatePackages, 
  getListPackagesQueryKey,
  useListEnvironments,
  Package 
} from "@packageguard/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { usePackageStore } from "@/store/usePackageStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ACCENT  = "#6366F1";   // indigo — matches Dashboard primary
const BORDER  = "#E5E7EB";
const BG      = "#F7F8FA";
const HEADING = "#111827";
const MUTED   = "#6B7280";

// ── Shared mini-helpers (mirrored from Dashboard) ─────────────────────────────

function VersionTag({ version, highlight }: { version?: string; highlight?: boolean }) {
  if (!version) return null;
  return (
    <code
      className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold"
      style={
        highlight
          ? { background: `${ACCENT}15`, color: ACCENT }
          : { background: "#F3F4F6", color: MUTED }
      }
    >
      {version}
    </code>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "positive" | "neutral" | "info" }) {
  const styles = {
    positive: { background: "#5EEAD420", color: "#0f766e" },
    neutral:  { background: "#F3F4F6",   color: MUTED    },
    info:     { background: `${ACCENT}15`, color: ACCENT },
  };
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={styles[tone]}
    >
      {label}
    </span>
  );
}

const UpdateOverlay = ({
  status,
  pkgName,
  fromVersion,
  toVersion,
  onDismiss,
  error,
  onRetry,
  isBulk,
  count,
  total,
  completed,
  successful,
  failed,
  currentPackage,
  startTime,
  logs: externalLogs
}: {
  status: "updating" | "completed" | "failed";
  pkgName?: string;
  fromVersion?: string;
  toVersion?: string;
  onDismiss: () => void;
  error?: string;
  onRetry?: () => void;
  isBulk?: boolean;
  count?: number;
  total?: number;
  completed?: number;
  successful?: number;
  failed?: number;
  currentPackage?: string;
  startTime?: number;
  logs?: string[];
}) => {
  const [currentTime, setCurrentTime] = useState(() => performance.now());

  useEffect(() => {
    if (status === "updating") {
      const timer = setInterval(() => {
        setCurrentTime(performance.now());
      }, 500);
      return () => clearInterval(timer);
    }
    return undefined;
  }, [status]);

  const effectiveTotal = isBulk ? (total || count || 0) : 1;
  const effectiveCompleted = isBulk ? (completed ?? 0) : (status === "completed" ? 1 : 0);
  const effectiveSuccessful = isBulk ? (successful ?? 0) : (status === "completed" ? 1 : 0);
  const effectiveFailed = isBulk ? (failed ?? 0) : (status === "failed" ? 1 : 0);

  let progress = 0;
  if (status === "completed") {
    progress = 100;
  } else if (effectiveTotal > 0) {
    progress = Math.floor((effectiveCompleted / effectiveTotal) * 100);
    // Never show 100% in updating state before all items are actually processed
    if (progress > 99 && status === "updating" && effectiveCompleted < effectiveTotal) {
      progress = 99;
    }
  }

  const effectiveStartTime = startTime || currentTime;
  const elapsedSeconds = Math.max(0, Math.floor((currentTime - effectiveStartTime) / 1000));

  function formatElapsed(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  let etaText = "Calculating...";
  if (effectiveCompleted > 0 && effectiveTotal > effectiveCompleted && elapsedSeconds > 0) {
    const avgSeconds = elapsedSeconds / effectiveCompleted;
    const remainingPackages = effectiveTotal - effectiveCompleted;
    const remainingSec = Math.round(remainingPackages * avgSeconds);
    if (remainingSec < 60) {
      etaText = `~${remainingSec}s`;
    } else {
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      etaText = `~${mins}m ${secs}s`;
    }
  } else if (effectiveCompleted >= effectiveTotal && effectiveTotal > 0) {
    etaText = "Done";
  }

  const logs = externalLogs && externalLogs.length > 0 ? externalLogs : [
    isBulk
      ? `Processing ${effectiveTotal} packages...`
      : `Updating ${pkgName || 'package'} to ${toVersion || 'latest'}...`
  ];

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // ── Shared card styles ──────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: "hsl(var(--surface-container-lowest))",
    border: "1px solid hsl(var(--card-border))",
    borderRadius: 16,
    boxShadow: "0 20px 48px -8px rgba(0,0,0,0.12), 0 4px 12px -2px rgba(0,0,0,0.06)",
  };
  const infoCardStyle: React.CSSProperties = {
    background: "hsl(var(--surface-container))",
    border: "1px solid hsl(var(--card-border))",
    borderRadius: 12,
  };
  const consoleStyle: React.CSSProperties = {
    background: "hsl(var(--surface-container-high))",
    border: "1px solid hsl(var(--card-border))",
    borderRadius: 12,
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">

      {/* ── Updating state ─────────────────────────────────────────────────── */}
      {status === "updating" && (
        <div className="w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden" style={cardStyle}>
          <div className="p-6 flex flex-col items-center text-center">

            {/* Progress ring — indigo active stroke */}
            <div className="relative mb-5">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={radius} fill="transparent" strokeWidth="6" stroke="hsl(var(--surface-container-high))" />
                <circle
                  cx="50" cy="50" r={radius} fill="transparent" strokeWidth="6"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{ stroke: ACCENT, transition: "stroke-dashoffset 300ms ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {/* Bold stat-number typography matching Dashboard large values */}
                <span className="text-[22px] font-bold leading-none" style={{ color: HEADING }}>
                  {Math.floor(progress)}%
                </span>
              </div>
            </div>

            {/* Title — matches PermissionDialog "Background Scanning" weight */}
            <h3 className="text-[18px] font-bold mb-1.5" style={{ color: HEADING }}>
              {isBulk ? "Bulk Updating" : "Updating Package"}
            </h3>
            {/* Subtitle — muted gray, same as Dashboard section subtitles */}
            <p className="text-[13px] mb-2 max-w-xs leading-relaxed" style={{ color: MUTED }}>
              {isBulk
                ? `${effectiveCompleted} / ${effectiveTotal} packages (${Math.floor(progress)}%)`
                : <>Updating <span className="font-semibold" style={{ color: HEADING }}>{pkgName}</span> from <VersionTag version={fromVersion} /> to <VersionTag version={toVersion} highlight /></>
              }
            </p>

            {isBulk && currentPackage && (
              <p className="text-[12px] font-medium mb-3" style={{ color: HEADING }}>
                Updating: <span className="font-semibold" style={{ color: ACCENT }}>{currentPackage}</span>
              </p>
            )}

            {isBulk && (
              <div className="w-full grid grid-cols-2 gap-2 mb-4 p-3 rounded-xl text-left text-[12px]" style={infoCardStyle}>
                <div>
                  <span style={{ color: MUTED }}>Successful: </span>
                  <span className="font-semibold" style={{ color: "#10B981" }}>{effectiveSuccessful}</span>
                </div>
                <div>
                  <span style={{ color: MUTED }}>Failed: </span>
                  <span className="font-semibold" style={{ color: effectiveFailed > 0 ? "#EF4444" : MUTED }}>{effectiveFailed}</span>
                </div>
                <div>
                  <span style={{ color: MUTED }}>Elapsed: </span>
                  <span className="font-mono font-medium" style={{ color: HEADING }}>{formatElapsed(elapsedSeconds)}</span>
                </div>
                <div>
                  <span style={{ color: MUTED }}>Remaining: </span>
                  <span className="font-medium" style={{ color: HEADING }}>{etaText}</span>
                </div>
              </div>
            )}

            {/* Thin linear progress bar */}
            <div className="w-full h-1 rounded-full mb-5 overflow-hidden" style={{ background: "hsl(var(--surface-container-high))" }}>
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%`, backgroundColor: ACCENT }}
              />
            </div>

            {/* Buttons — solid indigo primary, plain text secondary */}
            <div className="flex flex-col w-full gap-2">
              <button
                onClick={onDismiss}
                className="w-full h-10 rounded-lg text-[13px] font-bold text-white transition-all active:scale-95"
                style={{ background: ACCENT, boxShadow: `0 1px 2px ${ACCENT}40` }}
                onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
              >
                Run in Background
              </button>
              <button
                onClick={onDismiss}
                className="text-[13px] font-medium py-2 hover:text-destructive transition-colors"
                style={{ color: MUTED }}
              >
                Cancel Update
              </button>
            </div>
          </div>

          {/* Console / system output panel */}
          <div className="mx-6 mb-6 p-3 text-left" style={consoleStyle}>
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-3 h-3 animate-spin" style={{ color: ACCENT }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                System Output
              </span>
            </div>
            <div className="font-mono text-[11px] flex flex-col gap-0.5 overflow-hidden" style={{ color: MUTED, minHeight: 40 }}>
              {logs.map((log, i) => <p key={i}>{log}</p>)}
            </div>
          </div>
        </div>
      )}

      {/* ── Success state ──────────────────────────────────────────────────── */}
      {status === "completed" && (
        <div className="w-full max-w-md animate-in zoom-in-95 duration-200 p-7 text-center" style={cardStyle}>

          {/* Icon tile — soft teal/green tint, darker green icon (matches Dashboard "Up to Date" stat) */}
          <div
            className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: "#5EEAD420" }}
          >
            <CheckCircle2 className="w-8 h-8" style={{ color: "#0f766e" }} strokeWidth={2} />
          </div>

          {/* Title */}
          <h2 className="text-[18px] font-bold mb-1.5" style={{ color: HEADING }}>
            {isBulk ? "Bulk Update Successful" : "Update Successful"}
          </h2>
          {/* Subtitle */}
          <p className="text-[13px] mb-5 leading-relaxed" style={{ color: MUTED }}>
            {isBulk
              ? `Successfully updated all ${effectiveTotal} packages across all environments.`
              : <>Package <span className="font-semibold" style={{ color: HEADING }}>{pkgName}</span> updated from <VersionTag version={fromVersion} /> to <VersionTag version={toVersion} highlight />.</>
            }
          </p>

          {/* Integrity check card */}
          <div className="p-4 mb-5 text-left" style={infoCardStyle}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4" style={{ color: "#0f766e" }} />
              <span className="text-[13px] font-semibold" style={{ color: HEADING }}>
                Integrity Check Passed
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: MUTED }}>Status</span>
                {/* Status pill — soft green, matches Dashboard "Synced"/"Active" badges */}
                <StatusPill label="Verified" tone="positive" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: MUTED }}>Signature</span>
                <StatusPill label="Valid · RSA-4096" tone="neutral" />
              </div>
            </div>
          </div>

          {/* Close button — solid indigo, matches Scan Now / Allow & Start */}
          <button
            onClick={onDismiss}
            className="w-full h-10 rounded-lg text-[13px] font-bold text-white transition-all active:scale-95"
            style={{ background: ACCENT, boxShadow: `0 1px 2px ${ACCENT}40` }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
          >
            Close
          </button>
        </div>
      )}

      {/* ── Failed state ───────────────────────────────────────────────────── */}
      {status === "failed" && (
        <div className="w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden" style={cardStyle}>
          {/* Red header strip */}
          <div
            className="relative h-20 flex items-center justify-center"
            style={{ background: "#FEF2F2", borderBottom: "1px solid hsl(var(--card-border))" }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-red-600"
              style={{ background: "#fee2e2" }}
            >
              {isBulk && effectiveSuccessful > 0
                ? <RefreshCw className="w-6 h-6 animate-spin" />
                : <XCircle className="w-6 h-6" />
              }
            </div>
          </div>

          <div className="p-6 text-center">
            <h2 className="text-[18px] font-bold mb-2" style={{ color: HEADING }}>
              {isBulk
                ? (effectiveSuccessful > 0 ? "Completed with errors" : "Bulk Update Failed")
                : "Update Failed"}
            </h2>

            {/* Error log / console */}
            <div
              className={`text-[12px] mb-5 text-left p-3 font-mono whitespace-pre-wrap max-h-[180px] overflow-y-auto ${!isBulk ? "text-center font-sans" : ""}`}
              style={{ color: MUTED, ...consoleStyle }}
            >
              {isBulk && effectiveTotal > 0 && (
                <div className="mb-3 font-bold font-sans text-[13px]" style={{ color: effectiveSuccessful > 0 ? "#0f766e" : "#ef4444" }}>
                  {effectiveSuccessful} / {effectiveTotal} packages successful · {effectiveFailed} failed
                </div>
              )}
              {error || "An unexpected error occurred during update."}
            </div>

            <div className="flex gap-3">
              {!isBulk && (
                <button
                  onClick={onRetry}
                  className="flex-1 h-10 rounded-lg text-[13px] font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ background: ACCENT, boxShadow: `0 1px 2px ${ACCENT}40` }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry Update
                </button>
              )}
              <button
                onClick={onDismiss}
                className={`${isBulk ? "w-full" : "flex-1"} h-10 rounded-lg text-[13px] font-semibold transition-all active:scale-95`}
                style={{
                  color: HEADING,
                  border: "1px solid hsl(var(--card-border))",
                  background: "transparent",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "hsl(var(--surface-container))")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default function Packages() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lastScanned, setPackages, setUpdateProgress, activeVenvPath, setActiveVenvPath } = usePackageStore();
  const [ecosystem, setEcosystem] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<any>>(new Set());
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const [modalState, setModalState] = useState<{
    show: boolean;
    status: 'updating' | 'completed' | 'failed';
    pkg?: Package;
    error?: string;
    isBulk?: boolean;
    count?: number;
    total?: number;
    completed?: number;
    successful?: number;
    failed?: number;
    currentPackage?: string;
    startTime?: number;
    logs?: string[];
  }>({ show: false, status: 'updating' });

  const { data: globalPackages, isLoading: loadingGlobal } = useListPackages();
  const { data: environments } = useListEnvironments();
  const updatePackages = useUpdatePackages();

  const { data: registeredVenvs } = useQuery({
    queryKey: ['venvs', 'registered'],
    queryFn: () => window.electronAPI.getRegisteredVenvs()
  });

  const { data: venvPackages, isLoading: loadingVenv } = useQuery<any>({
    queryKey: ['venvs', 'packages', activeVenvPath],
    queryFn: () => window.electronAPI.getVenvPackages(activeVenvPath!),
    enabled: !!activeVenvPath && ecosystem === 'venv'
  });

  const updateVenvPackageMutation = useMutation({
    mutationFn: (data: { venvPath: string, packageName: string }) => window.electronAPI.updateVenvPackage(data),
    onSuccess: () => {
      setUpdatingId(null);
      qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
      setModalState({ show: true, status: 'completed' });
    },
    onError: (err: any) => {
      setUpdatingId(null);
      setModalState({ show: true, status: 'failed', error: err.message });
    }
  });

  const packages = useMemo(() => {
    if (ecosystem === 'venv') {
      const venvPkgs = venvPackages?.packages || [];
      return venvPkgs.map((p: any) => {
        const globalPkg = globalPackages?.find(gp => gp.ecosystem === 'pip' && gp.name.toLowerCase() === p.name.toLowerCase());
        const isDifferent = globalPkg && globalPkg.installedVersion !== p.version;
        
        return {
          ...p,
          id: `venv-${p.name}`,
          ecosystem: 'pip',
          installedVersion: p.version,
          environmentPath: activeVenvPath,
          status: p.status === "up-to-date" ? "up-to-date" : (p.status || 'unknown'),
          isDifferentFromGlobal: isDifferent,
          globalVersion: globalPkg?.installedVersion
        };
      });
    }
    
    let filtered = globalPackages || [];
    if (ecosystem !== 'all') {
      filtered = filtered.filter(p => p.ecosystem === ecosystem);
    }
    return filtered;
  }, [ecosystem, globalPackages, venvPackages, activeVenvPath]);

  const isLoading = ecosystem === 'venv' ? loadingVenv : loadingGlobal;

  useEffect(() => {
    const api = window.electronAPI;
    if (api?.onUpdateProgress) {
      return api.onUpdateProgress((data: any) => {
        if (data.package) {
          setUpdateProgress(data.package, data);
        }
        setModalState((prev) => {
          if (!prev.show || !prev.isBulk || prev.status !== 'updating') return prev;
          
          const newLogs = data.message ? [...(prev.logs || []), `> ${data.message}`].slice(-8) : prev.logs;
          
          if (data.batch) {
            return {
              ...prev,
              total: data.batch.total ?? prev.total,
              completed: data.batch.completed ?? prev.completed,
              successful: data.batch.successful ?? prev.successful,
              failed: data.batch.failed ?? prev.failed,
              currentPackage: data.batch.currentPackage || data.package || prev.currentPackage,
              logs: newLogs,
            };
          }

          return {
            ...prev,
            currentPackage: data.package || prev.currentPackage,
            logs: newLogs,
          };
        });
      });
    }
    return undefined;
  }, [setUpdateProgress]);

  useEffect(() => {
    if (packages) {
      setPackages(packages);
    }
  }, [packages, setPackages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [ecosystem, status, search]);

  const handleUpdate = (pkg: Package) => {
    if (ecosystem === 'venv') {
      if (!activeVenvPath) {
        toast({ title: "No venv selected", description: "Please select a virtual environment first.", variant: "destructive" });
        return;
      }
      setUpdatingId(pkg.id);
      setModalState({ show: true, status: 'updating', pkg });
      updateVenvPackageMutation.mutate({ venvPath: activeVenvPath, packageName: pkg.name });
      return;
    }

    setUpdatingId(pkg.id);
    setModalState({ show: true, status: 'updating', pkg });

    setUpdateProgress(pkg.name, { 
      packageName: pkg.name, 
      status: 'installing', 
      message: `Starting update for ${pkg.name}...` 
    });

    updatePackages.mutate({ 
      data: { 
        environmentId: pkg.environmentId as any, 
        packages: [{ name: pkg.name, targetVersion: pkg.latestVersion || pkg.installedVersion }] 
      } 
    }, {
      onSuccess: (data) => {
        setUpdatingId(null);
        
        const results = Array.isArray(data) ? data : [data];
        const allSuccessful = results.every((r: any) => r.success);
        
        if (allSuccessful) {
          setUpdateProgress(pkg.name, { status: 'complete', message: 'Update successful' });

          qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
          qc.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
          qc.invalidateQueries({ queryKey: ['/api/dashboard/status-breakdown'] });
          qc.invalidateQueries({ queryKey: ['/api/history'] });
          
          setModalState(prev => ({ 
            ...prev, 
            status: 'completed' 
          }));
        } else {
          const failedPkg = results.find((r: any) => !r.success);
          setUpdateProgress(pkg.name, { status: 'failed', message: failedPkg?.error || 'Update failed' });
          setModalState(prev => ({ 
            ...prev, 
            status: 'failed',
            error: failedPkg?.error || `Failed to update ${pkg.name}`
          }));
          toast({
            title: "Update Failed",
            description: failedPkg?.error || `Failed to update ${pkg.name}`,
            variant: "destructive"
          });
        }
      },
      onError: (error: any) => {
        setUpdatingId(null);
        setUpdateProgress(pkg.name, { status: 'failed', message: error.message || 'Update failed' });
        setModalState(prev => ({ 
          ...prev, 
          status: 'failed',
          error: error.message || "An unexpected error occurred during update"
        }));
        toast({
          title: "Update Error",
          description: error.message || "An unexpected error occurred during update",
          variant: "destructive"
        });
      },
    });
  };

  const handleDelete = async (pkg: Package) => {
     if (!confirm(`Are you sure you want to delete ${pkg.name}?`)) return;
 
     try {
       const api = window.electronAPI;
       let envPath = (pkg as any).environmentPath;

       if (!envPath && pkg.environmentId) {
         const envs = await api.getEnvironments();
         const env = envs.find((e: any) => e.id === pkg.environmentId);
         envPath = env?.path;
       }

       const result = await api.deletePackage({
         packageName: pkg.name,
         ecosystem: pkg.ecosystem,
         envPath: envPath
       });
 
       if (result.success) {
        toast({ 
          title: "Package Deleted", 
          description: `${pkg.name} has been removed from ${pkg.environmentName}.` 
        });
        qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
        qc.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
        qc.invalidateQueries({ queryKey: ['/api/dashboard/status-breakdown'] });
        qc.invalidateQueries({ queryKey: ['/api/history'] });
      } else {
        throw new Error(result.error || "Failed to delete package");
      }
    } catch (error: any) {
      toast({ 
        title: "Delete Failed", 
        description: error.message || `Could not delete ${pkg.name}`,
        variant: "destructive"
      });
    }
  };

  const handleCheckVersions = () => {
    if (!packages?.length) return;
    
    toast({ title: "Checking versions...", description: `Scanning ${packages.length} packages for updates.` });
    
    const checkMutation = (window.electronAPI as any).checkVersions;
    if (checkMutation) {
      checkMutation(packages.map((p: Package) => ({
        name: p.name,
        installedVersion: p.installedVersion,
        ecosystem: p.ecosystem,
        environmentId: p.environmentId
      }))).then((results: any) => {
        qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
        if (ecosystem === 'venv') {
          qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
        }
        toast({ title: "Check complete", description: `Updated version info for ${results.length} packages.` });
      }).catch((err: any) => {
        toast({ title: "Check failed", description: err.message, variant: "destructive" });
      });
    }
  };

  const handleUpdateAll = () => {
    if (selectedIds.size === 0) return;
    
    const selectedPkgs = (packages as Package[])?.filter((p: Package) => selectedIds.has(p.id)) || [];
    const total = selectedPkgs.length;
    const now = performance.now();

    selectedPkgs.forEach((p: Package) => {
      setUpdateProgress(p.name, { 
        packageName: p.name, 
        status: 'installing', 
        message: `Queued for bulk update...` 
      });
    });

    setModalState({ 
      show: true, 
      status: 'updating', 
      isBulk: true, 
      count: total,
      total: total,
      completed: 0,
      successful: 0,
      failed: 0,
      currentPackage: selectedPkgs[0]?.name || '',
      startTime: now,
      logs: [`Initializing bulk update for ${total} packages...`],
    });

    if (ecosystem === 'venv') {
      if (!activeVenvPath) return;
      
      window.electronAPI.updateBatch({
        packages: selectedPkgs.map((p: Package) => ({
          name: p.name,
          targetVersion: p.latestVersion || p.installedVersion,
          ecosystem: 'pip'
        })),
        envPath: activeVenvPath
      }).then((results: any[]) => {
        handleBulkUpdateResults(results, selectedPkgs, total);
      }).catch((error: any) => {
        handleBulkUpdateError(error, selectedPkgs, total);
      });
      return;
    }

    const envGroups = selectedPkgs.reduce((acc: Record<string, any[]>, p: Package) => {
      const envId = String(p.environmentId);
      if (!acc[envId]) acc[envId] = [];
      acc[envId].push({ name: p.name, targetVersion: p.latestVersion || p.installedVersion, pkg: p });
      return acc;
    }, {});

    const promises = Object.entries(envGroups).map(([envId, pkgs]) => {
      return new Promise((resolve, reject) => {
        const pkgsList = pkgs as any[];
        updatePackages.mutate({ 
          data: { environmentId: envId as any, packages: pkgsList.map((p: any) => ({ name: p.name, targetVersion: p.targetVersion })) } 
        }, {
          onSuccess: (data) => resolve({ data, pkgs: pkgsList }),
          onError: (error) => reject({ error, pkgs: pkgsList })
        });
      });
    });

    Promise.allSettled(promises).then((results) => {
      const failures: string[] = [];
      let successCount = 0;

      results.forEach(res => {
        if (res.status === 'fulfilled') {
          const { data, pkgs } = res.value as any;
          const resArray = Array.isArray(data) ? data : [data];
          resArray.forEach((r: any, idx: number) => {
            const pkgName = pkgs[idx]?.name || (r && r.package);
            if (r && r.success) {
              successCount++;
              if (pkgName) setUpdateProgress(pkgName, { status: 'complete', message: 'Update successful' });
            } else {
              const err = (r && r.error) || 'Update failed';
              if (pkgName) {
                failures.push(`${pkgName}: ${err}`);
                setUpdateProgress(pkgName, { status: 'failed', message: err });
              } else {
                failures.push(`Package: ${err}`);
              }
            }
          });
        } else {
          const { error, pkgs } = res.reason as any;
          if (Array.isArray(pkgs)) {
            pkgs.forEach((p: any) => {
              failures.push(`${p.name}: ${error?.message || 'Network error'}`);
              setUpdateProgress(p.name, { status: 'failed', message: error?.message || 'Network error' });
            });
          } else {
            failures.push(error?.message || 'Network error');
          }
        }
      });

      finalizeBulkUpdate(successCount, failures, total);
    });
  };

  const handleBulkUpdateResults = (results: any[], selectedPkgs: any[], totalCount: number) => {
    const failures: string[] = [];
    let successCount = 0;

    results.forEach((r, idx) => {
      const pkgName = selectedPkgs[idx]?.name || r?.package;
      if (r && r.success) {
        successCount++;
        if (pkgName) setUpdateProgress(pkgName, { status: 'complete', message: 'Update successful' });
      } else {
        const err = r?.error || 'Update failed';
        if (pkgName) {
          failures.push(`${pkgName}: ${err}`);
          setUpdateProgress(pkgName, { status: 'failed', message: err });
        } else {
          failures.push(err);
        }
      }
    });

    finalizeBulkUpdate(successCount, failures, totalCount);
  };

  const handleBulkUpdateError = (error: any, selectedPkgs: any[], totalCount: number) => {
    const failures = selectedPkgs.map(p => `${p.name}: ${error?.message || 'Update failed'}`);
    selectedPkgs.forEach(p => {
      setUpdateProgress(p.name, { status: 'failed', message: error?.message || 'Update failed' });
    });
    finalizeBulkUpdate(0, failures, totalCount);
  };

  const finalizeBulkUpdate = (successCount: number, failures: string[], totalCount?: number) => {
    const total = totalCount ?? (modalState.total || selectedIds.size);
    const failedCount = failures.length;
    
    if (failedCount > 0) {
      setModalState(prev => ({
        ...prev,
        show: true,
        status: 'failed',
        isBulk: true,
        error: `The following packages failed to update:\n\n${failures.join('\n')}`,
        count: successCount,
        total: total,
        completed: total,
        successful: successCount,
        failed: failedCount
      }));
    } else {
      setModalState(prev => ({
        ...prev,
        show: true,
        status: 'completed',
        isBulk: true,
        count: successCount,
        total: total,
        completed: total,
        successful: successCount,
        failed: 0
      }));
    }
    
    if (ecosystem === 'venv') {
      qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
    } else {
      qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
    }
    setSelectedIds(new Set());
  };

  const filteredPackages = packages?.filter((pkg: Package) => {
    if (ecosystem !== "all" && ecosystem !== "venv" && pkg.ecosystem !== ecosystem) return false;
    
    if (status !== "all") {
      if (pkg.status !== status) return false;
    }
    if (search && !pkg.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const paginatedPackages = filteredPackages?.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalPages = Math.ceil((filteredPackages?.length ?? 0) / itemsPerPage);

  const toggleSelect = (id: any) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (!filteredPackages) return;
    if (selectedIds.size === filteredPackages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredPackages.map((p: Package) => p.id)));
    }
  };

  const allSelected = (filteredPackages?.length ?? 0) > 0 && selectedIds.size === (filteredPackages?.length ?? 0);

  const getStatusBadge = (pkgStatus: string) => {
    let dotColor = MUTED;
    let label = "Unknown";
    
    switch (pkgStatus) {
      case 'up-to-date':
        dotColor = '#10B981';
        label = "Up to date";
        break;
      case 'patch':
        dotColor = ACCENT;
        label = "Patch";
        break;
      case 'minor':
        dotColor = '#F59E0B';
        label = "Minor";
        break;
      case 'major':
        dotColor = '#EF4444';
        label = "Major";
        break;
      case 'failed':
        dotColor = '#EF4444';
        label = "Failed";
        break;
      default:
        if (pkgStatus && pkgStatus !== 'unknown') {
          label = pkgStatus.charAt(0).toUpperCase() + pkgStatus.slice(1);
        }
    }

    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border" style={{ borderColor: BORDER, backgroundColor: 'white' }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }}></span>
        <span className="text-[11px] font-medium" style={{ color: HEADING }}>{label}</span>
      </div>
    );
  };

  return (
    <div className="min-h-full" style={{ backgroundColor: BG }} data-testid="packages-page">
      {modalState.show && (
        <UpdateOverlay 
          status={modalState.status} 
          pkgName={modalState.pkg?.name ?? undefined}
          fromVersion={modalState.pkg?.installedVersion ?? undefined}
          toVersion={modalState.pkg?.latestVersion ?? undefined}
          error={modalState.error}
          isBulk={modalState.isBulk}
          count={modalState.count}
          total={modalState.total}
          completed={modalState.completed}
          successful={modalState.successful}
          failed={modalState.failed}
          currentPackage={modalState.currentPackage}
          startTime={modalState.startTime}
          logs={modalState.logs}
          onRetry={() => modalState.pkg && handleUpdate(modalState.pkg)}
          onDismiss={() => {
            if (modalState.status === 'completed' || modalState.status === 'failed') {
              if (ecosystem === 'venv') {
                qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
              } else {
                qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
              }
            }
            setModalState({ ...modalState, show: false });
          }}
        />
      )}

      <header className="px-6 py-4 flex justify-between items-end shrink-0 bg-white border-b" style={{ borderColor: BORDER }}>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: MUTED }}>Dependency Management</p>
          <p className="text-sm" style={{ color: MUTED }}>System-wide dependency inventory · Last scanned: {formatRelativeTime(lastScanned)}</p>
        </div>
        <div className="flex items-center gap-2">
          {allSelected && (
            <Button 
              onClick={handleUpdateAll}
              variant="outline"
              className="flex items-center gap-2 h-9 px-4 rounded-md font-medium text-sm"
              style={{ borderColor: ACCENT, color: ACCENT, backgroundColor: 'white' }}
            >
              <Zap className="w-4 h-4" />
              Update All ({selectedIds.size})
            </Button>
          )}
          <Button 
            variant="outline" 
            onClick={toggleSelectAll}
            className="h-9 px-4 rounded-md font-medium text-sm"
            style={{ 
              borderColor: allSelected ? ACCENT : BORDER, 
              color: allSelected ? ACCENT : HEADING,
              backgroundColor: allSelected ? `${ACCENT}08` : 'white'
            }}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          <Button 
            onClick={handleCheckVersions}
            className="flex items-center gap-2 h-9 px-4 rounded-md font-medium text-sm text-white"
            style={{ backgroundColor: ACCENT }}
          >
            <RefreshCw className="w-4 h-4" />
            Check Versions
          </Button>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <Tabs value={ecosystem} onValueChange={setEcosystem} className="w-full lg:w-auto">
              <TabsList className="bg-white border p-1 rounded-lg h-9" style={{ borderColor: BORDER }}>
                <TabsTrigger 
                  value="all" 
                  className="rounded-md px-4 h-7 text-sm font-medium data-[state=active]:text-white transition-all"
                  style={{ color: HEADING }}
                >
                  All
                </TabsTrigger>
                <TabsTrigger 
                  value="pip" 
                  className="rounded-md px-4 h-7 text-sm font-medium data-[state=active]:text-white transition-all"
                  style={{ color: HEADING }}
                >
                  Global Python
                </TabsTrigger>
                <TabsTrigger 
                  value="npm" 
                  className="rounded-md px-4 h-7 text-sm font-medium data-[state=active]:text-white transition-all"
                  style={{ color: HEADING }}
                >
                  Node.js
                </TabsTrigger>
                <TabsTrigger 
                  value="venv" 
                  className="rounded-md px-4 h-7 text-sm font-medium data-[state=active]:text-white transition-all"
                  style={{ color: HEADING }}
                >
                  Venvs
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-3">
              {ecosystem === 'venv' && (
                <Select value={activeVenvPath || ""} onValueChange={setActiveVenvPath}>
                  <SelectTrigger className="w-[200px] h-9 bg-white rounded-md text-sm font-medium" style={{ borderColor: BORDER, color: HEADING }}>
                    <SelectValue placeholder="Select Venv..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-md bg-white" style={{ borderColor: BORDER }}>
                    {registeredVenvs?.map((venv: any) => (
                      <SelectItem key={venv.path} value={venv.path} className="text-sm font-medium">
                        {venv.name}
                      </SelectItem>
                    ))}
                    {!registeredVenvs?.length && (
                      <SelectItem value="none" disabled>No venvs tracked</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}

              <div className="relative group flex-1 min-w-[240px] lg:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MUTED }} />
                <input
                  type="text"
                  placeholder="Search packages..."
                  className="w-full h-9 pl-9 pr-4 bg-white border rounded-md text-sm font-medium focus:outline-none focus:ring-2 transition-all"
                  style={{ borderColor: BORDER, color: HEADING }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[140px] h-9 bg-white rounded-md text-sm font-medium" style={{ borderColor: BORDER, color: HEADING }}>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="rounded-md bg-white" style={{ borderColor: BORDER }}>
                  <SelectItem value="all" className="text-sm font-medium">All Status</SelectItem>
                  <SelectItem value="up-to-date" className="text-sm font-medium">Up to date</SelectItem>
                  <SelectItem value="patch" className="text-sm font-medium">Patch</SelectItem>
                  <SelectItem value="minor" className="text-sm font-medium">Minor</SelectItem>
                  <SelectItem value="major" className="text-sm font-medium">Major</SelectItem>
                  <SelectItem value="failed" className="text-sm font-medium">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden flex flex-col" style={{ borderColor: BORDER, borderRadius: '8px' }}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b" style={{ backgroundColor: '#F9FAFB', borderColor: BORDER }}>
                  <th className="px-4 py-3 text-left w-12">
                    <Checkbox 
                      checked={allSelected} 
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Package</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Environment</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Installed</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Latest</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Status</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORDER}66` }}>
                      <td colSpan={7} className="px-4 py-4">
                        <div className="h-10 rounded-md animate-pulse" style={{ backgroundColor: '#F3F4F6' }} />
                      </td>
                    </tr>
                  ))
                ) : !paginatedPackages?.length ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-sm" style={{ color: MUTED }}>
                      No packages found.
                    </td>
                  </tr>
                ) : (
                  paginatedPackages.map((pkg: Package) => (
                    <tr 
                      key={pkg.id} 
                      className="transition-colors"
                      style={{ 
                        borderBottom: `1px solid ${BORDER}66`,
                        backgroundColor: selectedIds.has(pkg.id) ? '#F9FAFB' : 'transparent'
                      }}
                      onMouseEnter={(e) => { if (!selectedIds.has(pkg.id)) e.currentTarget.style.backgroundColor = '#F9FAFB'; }}
                      onMouseLeave={(e) => { if (!selectedIds.has(pkg.id)) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                      <td className="px-4 py-3">
                        <Checkbox 
                          checked={selectedIds.has(pkg.id)} 
                          onCheckedChange={() => toggleSelect(pkg.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: '#F3F4F6' }}>
                            <PackageIcon className="w-4 h-4" style={{ color: MUTED }} />
                          </div>
                          <div>
                            <span className="text-sm font-medium block" style={{ color: HEADING }}>{pkg.name}</span>
                            <span className="text-xs truncate max-w-[200px] block" style={{ color: MUTED }}>{pkg.description || "No description available"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-gray-50 rounded-full text-[11px] font-medium border" style={{ color: MUTED, borderColor: BORDER }}>
                          {pkg.environmentName || environments?.find(e => e.id === pkg.environmentId)?.name || "Global"}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px]" style={{ color: MUTED }}>
                        {pkg.installedVersion}
                        {(pkg as any).isDifferentFromGlobal && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1 cursor-help" style={{ backgroundColor: '#FEF3C7', color: '#D97706', borderColor: '#FDE68A' }}>
                                  diff
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Differs from global version: {(pkg as any).globalVersion}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] font-medium" style={{ color: HEADING }}>
                        {pkg.latestVersion || pkg.installedVersion}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(pkg.status)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 rounded-md"
                              style={{ color: MUTED }}
                              disabled={updatingId === pkg.id}
                            >
                              {updatingId === pkg.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-md bg-white" style={{ borderColor: BORDER }}>
                            <DropdownMenuItem 
                              onClick={() => handleUpdate(pkg)}
                              disabled={pkg.status === 'up-to-date'}
                              className="flex items-center gap-2 cursor-pointer text-sm"
                              style={{ color: HEADING }}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Update Package</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(pkg)}
                              className="flex items-center gap-2 cursor-pointer text-sm text-red-600"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Package</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t flex items-center justify-between bg-transparent" style={{ borderColor: BORDER }}>
            <span className="text-xs font-medium" style={{ color: MUTED }}>
              Showing <span className="font-bold" style={{ color: HEADING }}>{isLoading ? "0" : `${(currentPage - 1) * itemsPerPage + 1} - ${Math.min(currentPage * itemsPerPage, filteredPackages?.length ?? 0)}`}</span> of {filteredPackages?.length ?? 0} packages
            </span>
            <div className="flex items-center gap-1.5">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 rounded-md"
                style={{ borderColor: BORDER, color: MUTED }}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                <ChevronDown className="w-4 h-4 rotate-90" />
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1))
                  .map((p, i, arr) => (
                    <React.Fragment key={p}>
                      {i > 0 && arr[i-1] !== p - 1 && <span className="text-xs px-1" style={{ color: MUTED }}>...</span>}
                      <Button 
                        onClick={() => setCurrentPage(p)}
                        className={cn(
                          "h-8 w-8 rounded-md text-xs font-medium transition-all"
                        )}
                        style={{
                          backgroundColor: currentPage === p ? ACCENT : 'transparent',
                          color: currentPage === p ? 'white' : MUTED
                        }}
                      >
                        {p}
                      </Button>
                    </React.Fragment>
                  ))
                }
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 rounded-md"
                style={{ borderColor: BORDER, color: MUTED }}
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                <ChevronDown className="w-4 h-4 -rotate-90" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
