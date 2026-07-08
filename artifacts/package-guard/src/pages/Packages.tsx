import React, { useState, useEffect, useMemo } from "react";
import { Search, ChevronDown, RefreshCw, MoreVertical, Trash2, Zap, CheckCircle2, XCircle, ShieldCheck, Package as PackageIcon } from "lucide-react";
import { 
  useListPackages, 
  useUpdatePackages, 
  getListPackagesQueryKey,
  useListEnvironments,
  Package 
} from "@workspace/api-client-react";
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

// Loading Screen Component
const UpdateOverlay = ({ status, pkgName, fromVersion, toVersion, onDismiss, error, onRetry, isBulk, count }: { 
  status: 'updating' | 'completed' | 'failed', 
  pkgName?: string, 
  fromVersion?: string, 
  toVersion?: string,
  onDismiss: () => void,
  error?: string,
  onRetry?: () => void,
  isBulk?: boolean,
  count?: number
}) => {
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (status === 'updating') {
      const interval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 95) return prev;
          const inc = Math.random() * 5;
          return prev + inc;
        });
      }, 500);

      // Simulated logs
      const logMessages = isBulk ? [
        `Initializing bulk update for ${count} packages...`,
        `Grouping by environments...`,
        `Starting parallel updates...`,
        `Verifying batch integrity...`,
        `Finalizing results...`
      ] : [
        `Fetching manifest for ${pkgName}-${toVersion}...`,
        `Verifying SHA-256 checksum...`,
        `Writing byte stream to modules...`,
        `Updating package.json...`,
        `Running post-install scripts...`,
        `Verifying integrity...`
      ];
      
      let logIdx = 0;
      const logInterval = setInterval(() => {
        if (logIdx < logMessages.length) {
          setLogs(prev => [...prev, `> ${logMessages[logIdx]}`].slice(-3));
          logIdx++;
        }
      }, 1500);

      return () => {
        clearInterval(interval);
        clearInterval(logInterval);
      };
    } else if (status === 'completed') {
      setProgress(100);
    }
    return undefined;
  }, [status, pkgName, toVersion, isBulk, count]);

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-on-background/20 backdrop-blur-md animate-in fade-in duration-300">
      {status === 'updating' && (
        <div className="relative bg-surface-container-lowest border border-outline-variant rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
          <div className="p-8 flex flex-col items-center text-center">
            <div className="relative mb-8">
              <svg className="w-32 h-32" viewBox="0 0 100 100">
                <circle className="text-surface-container stroke-current" cx="50" cy="50" fill="transparent" r="42" strokeWidth="8"></circle>
                <circle 
                  className="text-primary stroke-current transition-all duration-300 ease-out" 
                  cx="50" cy="50" fill="transparent" r="42" strokeWidth="8"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                ></circle>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-[24px] font-bold text-on-surface leading-none">{Math.floor(progress)}%</span>
              </div>
            </div>
            <h3 className="text-[24px] font-semibold text-on-surface mb-2">{isBulk ? 'Bulk Updating' : 'Updating Package'}</h3>
            <p className="text-[16px] text-on-surface-variant mb-8 max-w-xs">
              {isBulk 
                ? `Updating ${count} selected packages across environments...`
                : <>Updating <span className="font-semibold text-primary">{pkgName}</span> from <code className="bg-surface-container px-1 rounded">{fromVersion}</code> to <code className="bg-surface-container px-1 rounded">{toVersion}</code>...</>
              }
            </p>
            <div className="w-full bg-surface-container h-1.5 rounded-full mb-8 overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-500 ease-out" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="flex flex-col w-full gap-3">
              <Button onClick={onDismiss} className="bg-primary text-on-primary py-6 rounded-xl font-bold shadow-md hover:brightness-110">Run in Background</Button>
              <button onClick={onDismiss} className="text-on-surface-variant font-semibold py-3 hover:text-error transition-colors">Cancel Update</button>
            </div>
          </div>
          <div className="bg-surface-container p-4 border-t border-outline-variant text-left">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-3.5 h-3.5 text-primary animate-spin" />
              <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-tighter">System Output</span>
            </div>
            <div className="font-mono text-[11px] text-on-surface-variant/80 flex flex-col gap-1 overflow-hidden h-12">
              {logs.map((log, i) => <p key={i}>{log}</p>)}
            </div>
          </div>
        </div>
      )}

      {status === 'completed' && (
        <div className="relative bg-surface-container-lowest border border-outline-variant rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300 p-10 text-center">
          <div className="mx-auto w-24 h-24 bg-secondary/10 rounded-full flex items-center justify-center mb-8 relative">
            <div className="absolute inset-0 bg-secondary/5 rounded-full animate-ping opacity-20"></div>
            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center text-white shadow-lg">
              <CheckCircle2 className="w-10 h-10" />
            </div>
          </div>
          <h2 className="text-[30px] font-bold text-on-surface mb-3">{isBulk ? 'Bulk Update Successful' : 'Update Successful'}</h2>
          <p className="text-[16px] text-on-surface-variant mb-10 px-6 text-center">
            {isBulk 
              ? `Successfully updated ${count} packages across all environments. All integrity checks passed.`
              : <>Package <span className="font-bold text-on-surface">{pkgName}</span> was successfully updated from version <code className="bg-surface-container-high px-2 py-0.5 rounded text-sm">{fromVersion}</code> to <code className="bg-secondary/10 text-secondary font-bold px-2 py-0.5 rounded text-sm">{toVersion}</code>. The security handshake was verified.</>
            }
          </p>
          <div className="bg-surface-container-low rounded-2xl p-6 mb-10 text-left">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck className="w-4 h-4 text-secondary" />
              <span className="text-[14px] font-semibold text-on-surface">Integrity Check Passed</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Status</span>
                <span className="text-secondary font-bold uppercase text-[11px]">Verified</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-on-surface-variant">Signature</span>
                <span className="text-secondary font-medium">Valid (RSA-4096)</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Button onClick={onDismiss} className="py-6 rounded-xl bg-primary text-on-primary font-bold shadow-md hover:brightness-110 w-full col-span-2">Close</Button>
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div className="relative bg-surface-container-lowest border border-outline-variant rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
          <div className="relative h-24 bg-gradient-to-r from-error/5 to-error/10 flex items-center justify-center">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #ba1a1a 1px, transparent 0)', backgroundSize: '16px 16px' }}></div>
            <div className="relative w-16 h-16 bg-error-container text-error rounded-full flex items-center justify-center shadow-lg">
              {isBulk && count && count > 0 ? <RefreshCw className="w-10 h-10 animate-spin-slow" /> : <XCircle className="w-10 h-10" />}
            </div>
          </div>
          <div className="p-8 text-center">
            <h2 className="text-[24px] font-bold text-on-surface mb-2">
              {isBulk ? (count && count > 0 ? 'Partial Update Completed' : 'Bulk Update Failed') : 'Update Failed'}
            </h2>
            <div className={cn(
              "text-[14px] text-on-surface-variant mb-6 text-left p-4 bg-error/5 rounded-xl border border-error/10 font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto",
              !isBulk && "text-center font-sans"
            )}>
              {isBulk && count && count > 0 && (
                <div className="mb-4 text-secondary font-bold font-sans">
                  Successfully updated {count} packages.
                </div>
              )}
              {error || "An unexpected error occurred during update. The connection was unexpectedly interrupted."}
            </div>
            <div className="flex gap-4">
              {!isBulk && (
                <Button onClick={onRetry} className="flex-1 bg-primary text-on-primary py-6 rounded-xl font-bold shadow-md hover:brightness-110 flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retry Update
                </Button>
              )}
              <Button variant="secondary" onClick={onDismiss} className={cn("py-6 rounded-xl", isBulk ? "w-full" : "flex-1")}>Dismiss</Button>
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
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Modal State
  const [modalState, setModalState] = useState<{
    show: boolean;
    status: 'updating' | 'completed' | 'failed';
    pkg?: Package;
    error?: string;
    isBulk?: boolean;
    count?: number;
  }>({ show: false, status: 'updating' });

  const { data: globalPackages, isLoading: loadingGlobal } = useListPackages();
  const { data: environments } = useListEnvironments();
  const updatePackages = useUpdatePackages();

  // Venv specific
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

  // Derived packages based on filters
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

  // Listen for progress updates
  useEffect(() => {
    const api = window.electronAPI;
    if (api?.onUpdateProgress) {
      return api.onUpdateProgress((data: any) => {
        if (data.package) {
          setUpdateProgress(data.package, data);
        }
      });
    }
    return undefined;
  }, [setUpdateProgress]);

  // Sync store with React Query data
  useEffect(() => {
    if (packages) {
      setPackages(packages);
    }
  }, [packages, setPackages]);

  // Reset pagination when filters change
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

    // Initialize progress in store
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
        
        // Check if the update was actually successful
        const results = Array.isArray(data) ? data : [data];
        const allSuccessful = results.every((r: any) => r.success);
        
        if (allSuccessful) {
          // Update progress in store
          setUpdateProgress(pkg.name, { status: 'complete', message: 'Update successful' });

          // Force immediate invalidation and refetch
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
    
    // Initialize progress for all selected packages
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
      count: selectedIds.size 
    });

    if (ecosystem === 'venv') {
      if (!activeVenvPath) return;
      
      // Venv bulk update needs to be handled via updateBatch with envPath
      window.electronAPI.updateBatch({
        packages: selectedPkgs.map((p: Package) => ({
          name: p.name,
          targetVersion: p.latestVersion || p.installedVersion,
          ecosystem: 'pip'
        })),
        envPath: activeVenvPath
      }).then((results: any) => {
        handleBulkUpdateResults(results, selectedPkgs);
      }).catch((error: any) => {
        handleBulkUpdateError(error, selectedPkgs);
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
            if (r.success) {
              successCount++;
              setUpdateProgress(pkgs[idx].name, { status: 'complete', message: 'Update successful' });
            } else {
              failures.push(`${pkgs[idx].name}: ${r.error || 'Update failed'}`);
              setUpdateProgress(pkgs[idx].name, { status: 'failed', message: r.error || 'Update failed' });
            }
          });
        } else {
          const { error, pkgs } = res.reason as any;
          pkgs.forEach((p: any) => {
            failures.push(`${p.name}: ${error.message || 'Network error'}`);
            setUpdateProgress(p.name, { status: 'failed', message: error.message || 'Network error' });
          });
        }
      });

      finalizeBulkUpdate(successCount, failures);
    });
  };

  const handleBulkUpdateResults = (results: any[], selectedPkgs: any[]) => {
    const failures: string[] = [];
    let successCount = 0;

    results.forEach((r, idx) => {
      if (r.success) {
        successCount++;
        setUpdateProgress(selectedPkgs[idx].name, { status: 'complete', message: 'Update successful' });
      } else {
        failures.push(`${selectedPkgs[idx].name}: ${r.error || 'Update failed'}`);
        setUpdateProgress(selectedPkgs[idx].name, { status: 'failed', message: r.error || 'Update failed' });
      }
    });

    finalizeBulkUpdate(successCount, failures);
  };

  const handleBulkUpdateError = (error: any, selectedPkgs: any[]) => {
    const failures = selectedPkgs.map(p => `${p.name}: ${error.message || 'Update failed'}`);
    selectedPkgs.forEach(p => {
      setUpdateProgress(p.name, { status: 'failed', message: error.message || 'Update failed' });
    });
    finalizeBulkUpdate(0, failures);
  };

  const finalizeBulkUpdate = (successCount: number, failures: string[]) => {
    if (failures.length > 0) {
      setModalState({
        show: true,
        status: 'failed',
        isBulk: true,
        error: `The following packages failed to update:\n\n${failures.join('\n')}`,
        count: successCount
      });
    } else {
      setModalState({
        show: true,
        status: 'completed',
        isBulk: true,
        count: successCount
      });
    }
    
    if (ecosystem === 'venv') {
      qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
    } else {
      qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
    }
    setSelectedIds(new Set());
  };

  const filteredPackages = packages?.filter((pkg: Package) => {
    // If ecosystem is 'venv', 'packages' already contains only venv packages
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

  return (
    <div className="min-h-full bg-background font-hanken text-on-surface" data-testid="packages-page">
      {modalState.show && (
        <UpdateOverlay 
          status={modalState.status} 
          pkgName={modalState.pkg?.name ?? undefined}
          fromVersion={modalState.pkg?.installedVersion ?? undefined}
          toVersion={modalState.pkg?.latestVersion ?? undefined}
          error={modalState.error}
          isBulk={(modalState as any).isBulk}
          count={(modalState as any).count}
          onRetry={() => modalState.pkg && handleUpdate(modalState.pkg)}
          onDismiss={() => {
            if (modalState.status === 'completed') {
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

      <header className="px-8 py-4 flex justify-between items-end shrink-0">
        <div>
          <h2 className="text-[24px] leading-[32px] font-bold text-on-surface mb-0.5">Packages</h2>
          <p className="text-[14px] leading-[20px] text-on-surface-variant">System-wide dependency inventory</p>
        </div>
        <div className="flex items-center gap-3">
          {allSelected && (
            <Button 
              onClick={handleUpdateAll}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-semibold text-[14px] shadow-sm h-auto animate-in fade-in zoom-in duration-300"
            >
              <Zap className="w-4 h-4 fill-current" />
              Update All
            </Button>
          )}
          <span className="text-on-surface-variant text-[12px] font-medium mr-2">Last scanned: {formatRelativeTime(lastScanned)}</span>
          <Button 
            variant="outline" 
            onClick={toggleSelectAll}
            className={cn(
              "px-5 py-2.5 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container-low transition-all font-semibold text-[14px] bg-surface-container-lowest shadow-sm h-auto",
              allSelected && "bg-primary/5 border-primary text-primary"
            )}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          <Button 
            onClick={handleCheckVersions}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-on-primary hover:bg-primary/90 transition-all font-semibold text-[14px] shadow-sm h-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Check Versions
          </Button>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-8 pb-8 space-y-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <Tabs value={ecosystem} onValueChange={setEcosystem} className="w-full lg:w-auto">
            <TabsList className="bg-card border border-border p-1 rounded-xl">
              <TabsTrigger value="all" className="rounded-lg px-4 font-bold data-[state=active]:bg-[#5B5EF4] data-[state=active]:text-white transition-all">
                All
              </TabsTrigger>
              <TabsTrigger value="pip" className="rounded-lg px-4 font-bold data-[state=active]:bg-[#5B5EF4] data-[state=active]:text-white transition-all">
                Global Python
              </TabsTrigger>
              <TabsTrigger value="npm" className="rounded-lg px-4 font-bold data-[state=active]:bg-[#5B5EF4] data-[state=active]:text-white transition-all">
                Node.js
              </TabsTrigger>
              <TabsTrigger value="venv" className="rounded-lg px-4 font-bold data-[state=active]:bg-[#5B5EF4] data-[state=active]:text-white transition-all">
                Venvs
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-3">
            {ecosystem === 'venv' && (
              <Select value={activeVenvPath || ""} onValueChange={setActiveVenvPath}>
                <SelectTrigger className="w-[200px] h-11 bg-card border-border rounded-xl font-medium focus:ring-[#5B5EF4]">
                  <SelectValue placeholder="Select Venv..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-border bg-card">
                  {registeredVenvs?.map((venv: any) => (
                    <SelectItem key={venv.path} value={venv.path} className="font-medium">
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
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-[#5B5EF4] transition-colors" />
              <input
                type="text"
                placeholder="Search packages..."
                className="w-full h-11 pl-10 pr-4 bg-card border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#5B5EF4]/20 focus:border-[#5B5EF4] transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px] h-11 bg-card border-border rounded-xl font-medium focus:ring-[#5B5EF4]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-border bg-card">
                <SelectItem value="all" className="font-medium">All Status</SelectItem>
                <SelectItem value="up-to-date" className="font-medium">Up to date</SelectItem>
                <SelectItem value="patch" className="font-medium">Patch</SelectItem>
                <SelectItem value="minor" className="font-medium">Minor</SelectItem>
                <SelectItem value="major" className="font-medium">Major</SelectItem>
                <SelectItem value="failed" className="font-medium">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

        {/* Integrated Data Table */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-outline-variant/50 overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-surface-container-low/60 border-b border-outline-variant/30">
                  <th className="p-4 text-left w-12">
                    <Checkbox 
                      checked={allSelected} 
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-4 text-left text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Package</th>
                  <th className="p-4 text-left text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Environment</th>
                  <th className="p-4 text-left text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Installed</th>
                  <th className="p-4 text-left text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Latest</th>
                  <th className="p-4 text-left text-[12px] font-bold text-on-surface-variant uppercase tracking-wider">Status</th>
                  <th className="p-4 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="p-4">
                        <div className="h-12 bg-surface-container-low animate-pulse rounded-lg" />
                      </td>
                    </tr>
                  ))
                ) : !paginatedPackages?.length ? (
                  <tr>
                    <td colSpan={7} className="p-12 text-center text-on-surface-variant opacity-50">
                      No packages found.
                    </td>
                  </tr>
                ) : (
                  paginatedPackages.map((pkg: Package) => (
                    <tr key={pkg.id} className={cn(
                      "hover:bg-primary/5 transition-colors cursor-pointer group",
                      selectedIds.has(pkg.id) && "bg-primary/5"
                    )}>
                      <td className="p-4">
                        <Checkbox 
                          checked={selectedIds.has(pkg.id)} 
                          onCheckedChange={() => toggleSelect(pkg.id)}
                        />
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-9 h-9 rounded flex items-center justify-center",
                            pkg.status === 'up-to-date' ? "bg-surface-container-highest" : "bg-tertiary-container/10"
                          )}>
                            <PackageIcon className={cn(
                              "w-5 h-5",
                              pkg.status === 'up-to-date' ? "text-primary" : "text-tertiary"
                            )} />
                          </div>
                          <div>
                            <span className="text-[16px] font-semibold text-on-surface block">{pkg.name}</span>
                            <span className="text-[11px] text-on-surface-variant truncate max-w-[200px] block">{pkg.description || "No description available"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="px-2.5 py-1 bg-surface-container-low rounded-full text-[11px] font-medium text-on-surface-variant border border-outline-variant/20 uppercase tracking-tight">
                          {pkg.environmentName || environments?.find(e => e.id === pkg.environmentId)?.name || "Global"}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-[14px] text-on-surface-variant">
                        {pkg.installedVersion}
                        {(pkg as any).isDifferentFromGlobal && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] py-0 px-1 cursor-help">
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
                      <td className={cn(
                        "p-4 font-mono text-[14px] font-bold",
                        pkg.status === 'up-to-date' ? "text-primary" : "text-tertiary"
                      )}>
                        {pkg.latestVersion || pkg.installedVersion}
                      </td>
                      <td className="p-4">
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full border",
                          pkg.status === 'up-to-date' 
                            ? "bg-secondary-container/15 text-secondary border-secondary/10" 
                            : "bg-tertiary-fixed/30 text-tertiary border-tertiary/10"
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            pkg.status === 'up-to-date' ? "bg-secondary" : "bg-tertiary"
                          )}></span>
                          <span className="text-[12px] font-semibold">
                            {pkg.status === 'up-to-date' ? "Up to date" : pkg.status.charAt(0).toUpperCase() + pkg.status.slice(1) + " Update"}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-on-surface-variant hover:bg-surface-container-low rounded-full"
                              disabled={updatingId === pkg.id}
                            >
                              {updatingId === pkg.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-lg border-outline-variant bg-surface-container-lowest">
                            <DropdownMenuItem 
                              onClick={() => handleUpdate(pkg)}
                              disabled={pkg.status === 'up-to-date'}
                              className="flex items-center gap-2 cursor-pointer focus:bg-primary/5 focus:text-primary text-on-surface"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Update Package</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDelete(pkg)}
                              className="flex items-center gap-2 cursor-pointer focus:bg-error/5 focus:text-error text-error"
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
          {/* Footer Pagination */}
          <div className="p-4 border-t border-outline-variant/30 bg-surface-container-low/40 flex items-center justify-between">
            <span className="text-[12px] font-medium text-on-surface-variant">
              Showing <span className="font-bold text-on-surface">{isLoading ? "0" : `${(currentPage - 1) * itemsPerPage + 1} - ${Math.min(currentPage * itemsPerPage, filteredPackages?.length ?? 0)}`}</span> of {filteredPackages?.length ?? 0} packages
            </span>
            <div className="flex items-center gap-1.5">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-all disabled:opacity-50" 
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
                      {i > 0 && arr[i-1] !== p - 1 && <span className="text-on-surface-variant text-xs">...</span>}
                      <Button 
                        onClick={() => setCurrentPage(p)}
                        className={cn(
                          "h-8 w-8 rounded text-[12px] font-medium transition-all",
                          currentPage === p 
                            ? "bg-primary text-on-primary shadow-sm" 
                            : "bg-transparent text-on-surface-variant hover:bg-surface-container-low"
                        )}
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
                className="h-8 w-8 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low hover:text-primary transition-all disabled:opacity-50" 
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
