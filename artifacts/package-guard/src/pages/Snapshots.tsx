import React, { useState, useEffect, useMemo } from "react";
import { Camera, Plus, RotateCcw, Trash2, Info, Calendar, Package as PackageIcon, Bookmark, Search } from "lucide-react";
import {
  useListSnapshots,
  useCreateSnapshot,
  useDeleteSnapshot,
  useRestoreSnapshot,
  useListEnvironments,
  useListPackages,
  getListSnapshotsQueryKey,
  getListPackagesQueryKey,
  Snapshot,
  Package,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { runAutoScan } from "@/lib/autoScan";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export default function Snapshots() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: snapshots, isLoading } = useListSnapshots();
  const { data: envs } = useListEnvironments();
  const { data: registeredVenvs } = useQuery({
    queryKey: ['venvs', 'registered'],
    queryFn: () => (window as any).electronAPI.getRegisteredVenvs()
  });

  const allEnvs = useMemo(() => {
    const globalEnvs = envs?.map(e => ({ id: e.id, name: e.name, type: e.type })) || [];
    const venvs = registeredVenvs?.map((v: any) => ({ id: v.id, name: v.name, type: 'venv' })) || [];
    return [...globalEnvs, ...venvs];
  }, [envs, registeredVenvs]);
  const createSnapshot = useCreateSnapshot();
  const deleteSnapshot = useDeleteSnapshot();
  const restoreSnapshot = useRestoreSnapshot();

  const [showCreate, setShowCreate] = useState(false);
  const [envId, setEnvId] = useState<string>("");
  const [name, setName] = useState("");
  const [packageName, setPackageName] = useState("");
  const [packageVersion, setPackageVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [restoringId, setRestoringId] = useState<any | null>(null);

  // Package Autocomplete State
  const [open, setOpen] = useState(false);
  const { data: allPackages } = useListPackages();

  const envPackages = useMemo(() => {
    if (!envId) return [];
    return allPackages?.filter(p => String(p.environmentId) === envId) || [];
  }, [allPackages, envId]);

  // Update version automatically when package is chosen
  const handlePackageSelect = (pkg: Package) => {
    setPackageName(pkg.name);
    setPackageVersion(pkg.installedVersion);
    setOpen(false);
  };

  const handleCreate = () => {
    if (!envId || !name.trim()) return;
    createSnapshot.mutate(
      { 
        data: { 
          // Ensure we don't send NaN which becomes null in JSON
          environmentId: envId as any, 
          name, 
          packageName: packageName || undefined,
          packageVersion: packageVersion || undefined,
          notes: notes || undefined 
        } 
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListSnapshotsQueryKey() });
          setShowCreate(false);
          setEnvId(""); setName(""); setPackageName(""); setPackageVersion(""); setNotes("");
          toast({ title: "Snapshot created" });
        },
      }
    );
  };

  const handleDelete = (id: any) => {
    deleteSnapshot.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListSnapshotsQueryKey() });
        toast({ title: "Snapshot deleted" });
      },
    });
  };

  const handleRestore = (id: any) => {
    setRestoringId(id);
    restoreSnapshot.mutate({ id }, {
      onSuccess: (result: any) => {
        setRestoringId(null);
        if (result.success) {
          // Invalidate both packages and dashboard queries to reflect changes
          qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
          qc.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
          qc.invalidateQueries({ queryKey: ['/api/dashboard/status-breakdown'] });
          qc.invalidateQueries({ queryKey: ['/api/history'] });
          
          // Force a background scan to update the Zustand store and verify the restore
          runAutoScan({ force: true });
          
          toast({ title: "Restore Successful", description: result.message });
        } else {
          toast({ title: "Restore Failed", description: result.error, variant: "destructive" });
        }
      },
      onError: (error: any) => {
        setRestoringId(null);
        toast({ title: "Restore Error", description: error.message, variant: "destructive" });
      },
    });
  };

  const grouped = snapshots?.reduce((acc: Record<string, Snapshot[]>, s: Snapshot) => {
    const key = s.environmentName ?? "Unknown";
    (acc[key] ??= []).push(s);
    return acc;
  }, {} as Record<string, Snapshot[]>) ?? {};

  return (
    <div className="space-y-stack-lg animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-stack-lg">
        <h3 className="font-title-md text-title-md text-on-surface-variant">Restore Points</h3>
        <button 
          onClick={() => setShowCreate(true)} 
          className="flex items-center gap-2 py-2 px-6 bg-primary text-on-primary hover:brightness-110 rounded-lg font-label-caps text-label-caps transition-all shadow-md shadow-primary/10 active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
          Create Snapshot
        </button>
      </div>

      {/* Help Banner */}
      <section className="bg-primary/5 border border-primary/20 rounded-2xl p-6 flex gap-6 shadow-sm">
        <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0 text-primary">
          <span className="material-symbols-outlined text-[24px]">info</span>
        </div>
        <div className="space-y-2">
          <h3 className="font-label-caps text-label-caps text-primary uppercase tracking-wider">How it works</h3>
          <p className="font-body-sm text-body-sm text-on-surface leading-relaxed max-w-2xl">
            Snapshots capture the exact configuration of your environment at a specific moment. If an update causes issues, you can <span className="font-bold text-primary">instantly revert</span> to any previous state.
          </p>
        </div>
      </section>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-64 bg-surface-container-low animate-pulse rounded-2xl border border-outline-variant" />
          ))}
        </div>
      ) : !snapshots?.length ? (
        <div className="flex flex-col items-center justify-center py-32 text-center bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant">
          <div className="w-20 h-20 rounded-full bg-surface-container-low flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-[40px] text-outline opacity-30">camera</span>
          </div>
          <h4 className="font-title-md text-title-md text-on-surface">Safe and Sound</h4>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 max-w-sm">No restore points found. Create your first snapshot to secure your current environment state.</p>
          <button 
            onClick={() => setShowCreate(true)}
            className="mt-8 px-6 py-2.5 rounded-xl bg-primary-container text-on-primary-container hover:brightness-95 font-label-caps text-label-caps"
          >
            Take First Snapshot
          </button>
        </div>
      ) : (
        <div className="space-y-stack-lg">
          {Object.entries(grouped).map(([envName, envSnapshots]: [string, Snapshot[]]) => (
            <div key={envName} className="space-y-6">
              <div className="flex items-center gap-4">
                <span className="font-label-caps text-label-caps text-on-surface-variant/50 uppercase tracking-[0.2em]">{envName}</span>
                {envSnapshots[0]?.environmentId && String(envSnapshots[0].environmentId).startsWith('venv-') && (
                  <span className="bg-primary/10 text-primary border border-primary/20 font-bold text-[10px] px-2 py-0.5 rounded uppercase">Venv</span>
                )}
                <div className="h-[1px] flex-1 bg-outline-variant/30" />
                <span className="font-label-caps text-label-caps text-primary bg-primary/10 px-3 py-1 rounded-full">{envSnapshots.length} Snapshots</span>
              </div>
            
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-gutter">
                {envSnapshots?.map((snap: Snapshot) => (
                  <div 
                    key={snap.id} 
                    className="bg-surface-container-lowest border border-outline-variant rounded-2xl p-6 flex flex-col shadow-sm hover:shadow-xl hover:shadow-primary/5 transition-all group relative overflow-hidden" 
                  >
                    <div className="absolute -right-4 -top-4 w-20 h-20 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all" />
                    
                    <div className="flex items-start justify-between mb-4 relative">
                      <div className="space-y-1">
                        <h4 className="font-title-md text-title-md text-on-surface group-hover:text-primary transition-colors">{snap.name}</h4>
                        <div className="flex items-center gap-2 font-label-caps text-label-caps text-on-surface-variant/50">
                          <span className="material-symbols-outlined text-[16px]">calendar_today</span>
                          {(() => {
                            const date = new Date(snap.createdAt || (snap as any).created_at);
                            return format(date, "MMM d, yyyy · HH:mm");
                          })()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(snap.id)}
                        className="text-on-surface-variant/30 hover:text-error transition-colors p-2 hover:bg-error/5 rounded-xl"
                      >
                        <span className="material-symbols-outlined text-[20px]">delete</span>
                      </button>
                    </div>

                    <div className="bg-surface-container-low/50 rounded-xl p-4 mb-6 border border-outline-variant/20 flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-container-lowest border border-outline-variant/30 flex items-center justify-center text-primary shadow-sm">
                          <span className="material-symbols-outlined text-[18px]">bookmark</span>
                        </div>
                        <span className="font-label-caps text-label-caps text-on-surface font-bold">{snap.packageCount ?? (snap as any).package_count ?? 0} Packages Locked</span>
                      </div>

                      {(snap as any).packageName && (
                        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-outline-variant/20">
                          <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-primary">
                            <span className="material-symbols-outlined text-[14px]">package_2</span>
                          </div>
                          <p className="font-body-sm text-body-sm text-on-surface truncate font-bold">
                            {(snap as any).packageName} <span className="text-primary opacity-70">@ {(snap as any).packageVersion}</span>
                          </p>
                        </div>
                      )}
                      
                      {snap.notes && (
                        <p className="font-body-sm text-body-sm text-on-surface-variant italic mt-3 line-clamp-2 leading-relaxed">"{snap.notes}"</p>
                      )}
                    </div>

                    <button
                      disabled={restoringId === snap.id}
                      onClick={() => handleRestore(snap.id)}
                      className="w-full bg-surface-container hover:bg-primary hover:text-on-primary border border-outline-variant hover:border-primary py-3 rounded-xl font-label-caps text-label-caps transition-all flex items-center justify-center gap-2 group/btn active:scale-95 shadow-sm"
                    >
                      <span className={cn("material-symbols-outlined text-[18px]", restoringId === snap.id ? "animate-spin" : "group-hover/btn:rotate-[-45deg] transition-transform")}>
                        {restoringId === snap.id ? "refresh" : "history"}
                      </span>
                      {restoringId === snap.id ? "Reverting State..." : "Restore Snapshot"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="rounded-3xl border-outline-variant bg-surface-container-lowest shadow-2xl p-8 max-w-md">
          <DialogHeader className="mb-6">
            <DialogTitle className="font-title-md text-title-md text-on-surface">Capture State</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider ml-1">Environment</Label>
              <Select value={envId} onValueChange={setEnvId}>
                <SelectTrigger className="h-12 rounded-xl border-outline-variant bg-surface-container-low focus:ring-primary/20">
                  <SelectValue placeholder="Target environment" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest">
                  {allEnvs.map((env) => (
                    <SelectItem key={env.id} value={String(env.id)}>
                      {env.name} ({env.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="snap-name" className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider ml-1">Snapshot Label</Label>
              <Input
                id="snap-name"
                placeholder="e.g. Pre-Deployment Sync"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                className="h-12 rounded-xl border-outline-variant bg-surface-container-low focus:ring-primary/20 font-body-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="pkg-name" className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider ml-1">Package</Label>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={!envId}
                      className="w-full h-12 rounded-xl border border-outline-variant bg-surface-container-low flex items-center justify-between px-3 font-body-sm text-on-surface-variant"
                    >
                      {packageName || "Optional"}
                      <span className="material-symbols-outlined text-[18px] opacity-50">search</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-0 rounded-xl border-outline-variant bg-surface-container-lowest shadow-xl" align="start">
                    <Command className="bg-transparent">
                      <CommandInput placeholder="Search packages on PC..." className="h-10 border-none focus:ring-0" />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty className="py-6 text-center text-[12px] text-on-surface-variant">
                          Package not found on PC.
                        </CommandEmpty>
                        <CommandGroup>
                          {envPackages.map((pkg) => (
                            <CommandItem
                              key={pkg.id}
                              value={pkg.name}
                              onSelect={() => handlePackageSelect(pkg)}
                              className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-surface-container transition-colors rounded-lg mx-1 my-0.5"
                            >
                              <div className="flex flex-col">
                                <span className="font-bold text-on-surface text-[13px]">{pkg.name}</span>
                                <span className="text-[10px] text-on-surface-variant opacity-70">{pkg.installedVersion}</span>
                              </div>
                              {packageName === pkg.name && <span className="material-symbols-outlined text-primary text-[18px]">check</span>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pkg-version" className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider ml-1">Version</Label>
                <Input
                  id="pkg-version"
                  placeholder="Optional"
                  value={packageVersion}
                  readOnly
                  className="h-12 rounded-xl border-outline-variant bg-surface-container-low focus:ring-primary/20 cursor-default opacity-80 font-code-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="snap-notes" className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-wider ml-1">Description</Label>
              <Textarea
                id="snap-notes"
                placeholder="Briefly describe this restore point..."
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                className="rounded-xl border-outline-variant bg-surface-container-low focus:ring-primary/20 min-h-[100px] resize-none font-body-sm"
              />
            </div>
          </div>
          <DialogFooter className="mt-8 gap-3 flex-row justify-end">
            <button 
              onClick={() => setShowCreate(false)}
              className="px-6 py-2 rounded-xl font-label-caps text-label-caps text-on-surface-variant hover:bg-surface-container-low transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleCreate} 
              disabled={createSnapshot.isPending} 
              className="bg-primary hover:brightness-110 text-on-primary rounded-xl px-8 py-2 font-label-caps text-label-caps shadow-sm transition-all"
            >
              {createSnapshot.isPending ? "Capturing..." : "Confirm Snapshot"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
