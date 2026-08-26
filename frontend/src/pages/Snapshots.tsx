import React, { useState, useMemo } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ─── Palette (mirrors Dashboard) ─────────────────────────────────────────────
const PALETTE = {
  healthy:  "#5EEAD4",
  patch:    "#67E8F9",
  minor:    "#818CF8",
  major:    "#6366F1",
  failed:   "#312E81",
};

// ─── Filter options ───────────────────────────────────────────────────────────
type EnvFilter = "all" | string;

// ─── Icon tile (matches Dashboard stat-card icons) ────────────────────────────
function IconTile({
  icon, color, size = "md",
}: { icon: string; color: string; size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? "w-7 h-7 text-[15px]" : size === "lg" ? "w-12 h-12 text-[22px]" : "w-9 h-9 text-[18px]";
  return (
    <div
      className={cn("rounded-xl flex items-center justify-center shrink-0", dims)}
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: "inherit" }}>{icon}</span>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function SnapBadge({ status }: { status: "verified" | "restoring" | "failed" | string }) {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    verified:  { label: "Verified",  bg: `${PALETTE.healthy}20`, text: "#0f766e" },
    restoring: { label: "Restoring", bg: `${PALETTE.minor}20`,   text: PALETTE.major },
    failed:    { label: "Failed",    bg: "#ef444420",             text: "#dc2626" },
  };
  const s = map[status] ?? { label: status, bg: `${PALETTE.minor}20`, text: PALETTE.major };
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

// ─── Section header (matches Dashboard SectionHeader) ────────────────────────
function SectionHeader({
  title, subtitle, action,
}: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h3 className="text-[14px] font-semibold text-on-surface leading-none">{title}</h3>
        {subtitle && <p className="text-[12px] text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Snapshots() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: snapshots, isLoading } = useListSnapshots();
  const { data: envs } = useListEnvironments();
  const { data: registeredVenvs } = useQuery({
    queryKey: ["venvs", "registered"],
    queryFn: () => (window as any).electronAPI.getRegisteredVenvs(),
  });

  const allEnvs = useMemo(() => {
    const globalEnvs = envs?.map((e: any) => ({ id: e.id, name: e.name, type: e.type })) || [];
    const venvs = registeredVenvs?.map((v: any) => ({ id: v.id, name: v.name, type: "venv" })) || [];
    return [...globalEnvs, ...venvs];
  }, [envs, registeredVenvs]);

  const createSnapshot  = useCreateSnapshot();
  const deleteSnapshot  = useDeleteSnapshot();
  const restoreSnapshot = useRestoreSnapshot();

  const [showCreate, setShowCreate]         = useState(false);
  const [envId, setEnvId]                   = useState<string>("");
  const [name, setName]                     = useState("");
  const [packageName, setPackageName]       = useState("");
  const [packageVersion, setPackageVersion] = useState("");
  const [notes, setNotes]                   = useState("");
  const [restoringId, setRestoringId]       = useState<any | null>(null);
  const [envFilter, setEnvFilter]           = useState<EnvFilter>("all");
  const [open, setOpen]                     = useState(false);

  const { data: allPackages } = useListPackages();

  const envPackages = useMemo(() => {
    if (!envId) return [];
    return allPackages?.filter((p: Package) => String(p.environmentId) === envId) || [];
  }, [allPackages, envId]);

  const handlePackageSelect = (pkg: Package) => {
    setPackageName(pkg.name);
    setPackageVersion(pkg.installedVersion);
    setOpen(false);
  };

  const handleCreate = () => {
    if (!envId || !name.trim()) return;
    createSnapshot.mutate(
      { data: { environmentId: envId as any, name, packageName: packageName || undefined, packageVersion: packageVersion || undefined, notes: notes || undefined } },
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
          qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
          qc.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
          qc.invalidateQueries({ queryKey: ["/api/dashboard/status-breakdown"] });
          qc.invalidateQueries({ queryKey: ["/api/history"] });
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

  // ── Derived data ────────────────────────────────────────────────────────────
  const grouped = snapshots?.reduce((acc: Record<string, Snapshot[]>, s: Snapshot) => {
    const key = s.environmentName ?? "Unknown";
    (acc[key] ??= []).push(s);
    return acc;
  }, {} as Record<string, Snapshot[]>) ?? {};

  const envNames = Object.keys(grouped);

  const filteredGrouped = envFilter === "all"
    ? grouped
    : Object.fromEntries(Object.entries(grouped).filter(([k]) => k === envFilter));

  const totalSnaps = snapshots?.length ?? 0;

  return (
    <div className="space-y-5 max-w-full animate-in fade-in duration-500">

      {/* ── Header row (mirrors Dashboard header) ────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] text-muted-foreground">
          Restore points for your environments
        </p>

        {/* Environment filter pill group */}
        {envNames.length > 0 && (
          <div className="flex items-center gap-1 bg-surface-container border border-card-border rounded-lg p-0.5">
            <button
              onClick={() => setEnvFilter("all")}
              className={cn(
                "px-3 py-1.5 text-[12px] font-medium rounded-md transition-all",
                envFilter === "all"
                  ? "bg-surface-container-lowest text-on-surface shadow-[var(--shadow-premium)]"
                  : "text-muted-foreground hover:text-on-surface"
              )}
            >
              All
            </button>
            {envNames.map((n) => (
              <button
                key={n}
                onClick={() => setEnvFilter(n)}
                className={cn(
                  "px-3 py-1.5 text-[12px] font-medium rounded-md transition-all max-w-[120px] truncate",
                  envFilter === n
                    ? "bg-surface-container-lowest text-on-surface shadow-[var(--shadow-premium)]"
                    : "text-muted-foreground hover:text-on-surface"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Restore Points section header + Create button ────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-on-surface leading-none">Restore Points</h3>
          <p className="text-[12px] text-muted-foreground mt-1">
            {totalSnaps > 0 ? `${totalSnaps} snapshot${totalSnaps !== 1 ? "s" : ""} across ${envNames.length} environment${envNames.length !== 1 ? "s" : ""}` : "No snapshots captured yet"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all active:scale-95"
          style={{
            background: PALETTE.major,
            color: "#fff",
            boxShadow: `0 1px 2px ${PALETTE.major}40, 0 0 0 1px ${PALETTE.major}20`,
          }}
        >
          <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
          Create Snapshot
        </button>
      </div>

      {/* ── How it Works info banner ──────────────────────────────────────── */}
      <div className="bg-surface-container-lowest border border-card-border rounded-xl p-4 shadow-[var(--shadow-premium)] flex items-start gap-4">
        <IconTile icon="info" color={PALETTE.minor} size="md" />
        <div>
          <p className="text-[13px] font-semibold text-on-surface leading-none mb-1">How it works</p>
          <p className="text-[12px] text-muted-foreground leading-relaxed max-w-2xl">
            Snapshots capture the exact configuration of your environment at a specific moment. If an update causes issues, you can{" "}
            <span className="font-semibold" style={{ color: PALETTE.major }}>instantly revert</span>{" "}
            to any previous state.
          </p>
        </div>
      </div>

      {/* ── Loading skeletons ─────────────────────────────────────────────── */}
      {isLoading && (
        <div className="bg-surface-container-lowest border border-card-border rounded-xl shadow-[var(--shadow-premium)] overflow-hidden">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_100px_80px] gap-3 px-5 py-2 border-b border-card-border bg-surface-container/40">
            {["Snapshot","Environment","Packages","Date","Status",""].map((h) => (
              <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-card-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_100px_100px_80px] gap-3 px-5 py-3 items-center">
                {[160, 90, 60, 80, 60, 60].map((w, j) => (
                  <div key={j} className="h-4 bg-surface-container animate-pulse rounded" style={{ maxWidth: w }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ───────────────────────────────────────────────────── */}
      {!isLoading && !snapshots?.length && (
        <div className="bg-surface-container-lowest border border-card-border rounded-xl shadow-[var(--shadow-premium)] flex flex-col items-center justify-center py-20 text-center">
          <IconTile icon="camera" color={PALETTE.major} size="lg" />
          <h4 className="text-[15px] font-semibold text-on-surface mt-4 leading-none">Safe and Sound</h4>
          <p className="text-[12px] text-muted-foreground mt-2 max-w-xs leading-relaxed">
            No restore points found. Create your first snapshot to secure your current environment state.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-6 flex items-center gap-2 px-5 py-2 rounded-lg text-[12px] font-semibold transition-all active:scale-95"
            style={{
              background: PALETTE.major,
              color: "#fff",
              boxShadow: `0 1px 2px ${PALETTE.major}40`,
            }}
          >
            <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
            Take First Snapshot
          </button>
        </div>
      )}

      {/* ── Populated state — table per environment group ─────────────────── */}
      {!isLoading && !!snapshots?.length && (
        <div className="space-y-5">
          {Object.entries(filteredGrouped).map(([envName, envSnapshots]: [string, Snapshot[]]) => {
            const isVenv = envSnapshots[0]?.environmentId != null && String(envSnapshots[0].environmentId).startsWith("venv-");
            return (
              <div key={envName} className="bg-surface-container-lowest border border-card-border rounded-xl shadow-[var(--shadow-premium)] overflow-hidden">

                {/* Group header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-card-border bg-surface-container/30">
                  <IconTile icon={isVenv ? "terminal" : "layers"} color={isVenv ? PALETTE.patch : PALETTE.minor} size="sm" />
                  <div>
                    <p className="text-[13px] font-semibold text-on-surface leading-none">{envName}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {envSnapshots.length} snapshot{envSnapshots.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {isVenv && (
                    <span
                      className="ml-2 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{ background: `${PALETTE.patch}20`, color: PALETTE.major }}
                    >
                      venv
                    </span>
                  )}
                </div>

                {/* Table header */}
                <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_80px_minmax(0,1.3fr)_90px_96px] gap-3 px-5 py-2 border-b border-card-border bg-surface-container/20">
                  {["Snapshot Name","Package","Packages","Date Created","Status",""].map((h) => (
                    <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</span>
                  ))}
                </div>

                {/* Table rows */}
                <div className="divide-y divide-card-border">
                  {envSnapshots.map((snap: Snapshot) => {
                    const createdAt = new Date(snap.createdAt || (snap as any).created_at);
                    const isRestoring = restoringId === snap.id;
                    return (
                      <div
                        key={snap.id}
                        className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_80px_minmax(0,1.3fr)_90px_96px] gap-3 px-5 py-3 items-center hover:bg-surface-container/50 transition-colors group"
                      >
                        {/* Name */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <IconTile icon="bookmark" color={PALETTE.major} size="sm" />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
                              {snap.name}
                            </p>
                            {snap.notes && (
                              <p className="text-[11px] text-muted-foreground truncate italic">"{snap.notes}"</p>
                            )}
                          </div>
                        </div>

                        {/* Package */}
                        <span className="text-[12px] font-mono text-muted-foreground truncate">
                          {(snap as any).packageName
                            ? <>{(snap as any).packageName} <span className="opacity-50">@{(snap as any).packageVersion}</span></>
                            : <span className="opacity-40">—</span>
                          }
                        </span>

                        {/* Package count */}
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px] text-muted-foreground">inventory_2</span>
                          <span className="text-[12px] font-semibold text-on-surface">
                            {snap.packageCount ?? (snap as any).package_count ?? 0}
                          </span>
                        </div>

                        {/* Date */}
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {format(createdAt, "MMM d, yyyy · HH:mm")}
                        </span>

                        {/* Status */}
                        <SnapBadge status="verified" />

                        {/* Actions */}
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            disabled={isRestoring}
                            onClick={() => handleRestore(snap.id)}
                            className={cn(
                              "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                              isRestoring
                                ? "opacity-60 cursor-not-allowed"
                                : "hover:opacity-90 active:scale-95"
                            )}
                            style={{ background: `${PALETTE.major}15`, color: PALETTE.major }}
                            title="Restore this snapshot"
                          >
                            <span className={cn("material-symbols-outlined text-[14px]", isRestoring && "animate-spin")}>
                              {isRestoring ? "refresh" : "history"}
                            </span>
                            {isRestoring ? "…" : "Restore"}
                          </button>
                          <button
                            onClick={() => handleDelete(snap.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                            title="Delete snapshot"
                          >
                            <span className="material-symbols-outlined text-[15px]">delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create Snapshot dialog ────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="rounded-2xl border-card-border bg-surface-container-lowest shadow-2xl p-6 max-w-md">
          <DialogHeader className="mb-5">
            <div className="flex items-center gap-3 mb-1">
              <IconTile icon="add_a_photo" color={PALETTE.major} size="md" />
              <DialogTitle className="text-[15px] font-semibold text-on-surface">Capture State</DialogTitle>
            </div>
            <p className="text-[12px] text-muted-foreground pl-12">Save the current environment configuration as a restore point.</p>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Environment</Label>
              <Select value={envId} onValueChange={setEnvId}>
                <SelectTrigger className="h-10 rounded-lg border-card-border bg-surface-container text-[13px] focus:ring-primary/20">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-card-border bg-surface-container-lowest">
                  {allEnvs.map((env) => (
                    <SelectItem key={env.id} value={String(env.id)}>
                      {env.name} ({env.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="snap-name" className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Snapshot Label</Label>
              <Input
                id="snap-name"
                placeholder="e.g. Pre-Deployment Sync"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                className="h-10 rounded-lg border-card-border bg-surface-container text-[13px] focus:ring-primary/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Package</Label>
                <Popover open={open} onOpenChange={setOpen}>
                  <PopoverTrigger asChild>
                    <button
                      disabled={!envId}
                      className="w-full h-10 rounded-lg border border-card-border bg-surface-container flex items-center justify-between px-3 text-[13px] text-muted-foreground disabled:opacity-50"
                    >
                      <span className="truncate">{packageName || "Optional"}</span>
                      <span className="material-symbols-outlined text-[16px] opacity-50 shrink-0">search</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] p-0 rounded-xl border-card-border bg-surface-container-lowest shadow-xl" align="start">
                    <Command className="bg-transparent">
                      <CommandInput placeholder="Search packages…" className="h-9 border-none focus:ring-0 text-[13px]" />
                      <CommandList className="max-h-[180px]">
                        <CommandEmpty className="py-5 text-center text-[12px] text-muted-foreground">No packages found.</CommandEmpty>
                        <CommandGroup>
                          {envPackages.map((pkg: Package) => (
                            <CommandItem
                              key={pkg.id}
                              value={pkg.name}
                              onSelect={() => handlePackageSelect(pkg)}
                              className="flex items-center justify-between px-3 py-2 cursor-pointer rounded-lg mx-1 my-0.5"
                            >
                              <div>
                                <p className="text-[13px] font-semibold text-on-surface">{pkg.name}</p>
                                <p className="text-[10px] text-muted-foreground">{pkg.installedVersion}</p>
                              </div>
                              {packageName === pkg.name && (
                                <span className="material-symbols-outlined text-[16px]" style={{ color: PALETTE.major }}>check</span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Version</Label>
                <Input
                  placeholder="Auto-filled"
                  value={packageVersion}
                  readOnly
                  className="h-10 rounded-lg border-card-border bg-surface-container text-[13px] font-mono cursor-default opacity-80"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</Label>
              <Textarea
                placeholder="Briefly describe this restore point…"
                value={notes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
                className="rounded-lg border-card-border bg-surface-container text-[13px] min-h-[80px] resize-none focus:ring-primary/20"
              />
            </div>
          </div>

          <DialogFooter className="mt-6 gap-2 flex-row justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 rounded-lg text-[12px] font-medium text-muted-foreground hover:bg-surface-container transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={createSnapshot.isPending || !envId || !name.trim()}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-[12px] font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: PALETTE.major,
                color: "#fff",
                boxShadow: `0 1px 2px ${PALETTE.major}40`,
              }}
            >
              <span className="material-symbols-outlined text-[15px]">
                {createSnapshot.isPending ? "refresh" : "add_a_photo"}
              </span>
              {createSnapshot.isPending ? "Capturing…" : "Confirm Snapshot"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
