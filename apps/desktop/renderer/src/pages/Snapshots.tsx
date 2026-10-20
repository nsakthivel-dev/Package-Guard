import React, { useState, useMemo, useEffect } from "react";
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
} from "@packageguard/api-client-react";
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
  const map: Record<string, { label: string; bg: string; text: string; border: string }> = {
    verified:  { label: "Verified",  bg: `${PALETTE.healthy}18`, text: "#0f766e", border: `${PALETTE.healthy}40` },
    restoring: { label: "Restoring", bg: `${PALETTE.minor}18`,   text: PALETTE.major, border: `${PALETTE.minor}40` },
    failed:    { label: "Failed",    bg: "#ef444418",             text: "#dc2626", border: "#ef444440" },
  };
  const s = map[status] ?? { label: status, bg: `${PALETTE.minor}18`, text: PALETTE.major, border: `${PALETTE.minor}40` };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border select-none shrink-0"
      style={{ background: s.bg, color: s.text, borderColor: s.border }}
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
  const [viewingSnapshot, setViewingSnapshot] = useState<any | null>(null);
  const [snapshotSearchQuery, setSnapshotSearchQuery] = useState("");
  const [filterType, setFilterType]         = useState<string>("all");
  const [envId, setEnvId]                   = useState<string>("");
  const [name, setName]                     = useState("");
  const [packageName, setPackageName]       = useState("");
  const [packageVersion, setPackageVersion] = useState("");
  const [notes, setNotes]                   = useState("");
  const [restoringId, setRestoringId]       = useState<any | null>(null);
  const [envFilter, setEnvFilter]           = useState<EnvFilter>("all");
  const [open, setOpen]                     = useState(false);
  const [expandedPkgKey, setExpandedPkgKey] = useState<string | null>(null);
  const [pkgMetaMap, setPkgMetaMap]         = useState<Record<string, any>>({});
  const [loadingMetaKey, setLoadingMetaKey] = useState<string | null>(null);

  useEffect(() => {
    setSnapshotSearchQuery("");
    setFilterType("all");
    setExpandedPkgKey(null);
  }, [viewingSnapshot?.id]);

  const handleToggleExpand = async (pkgKey: string, pkg: any, ecosystem: string) => {
    if (expandedPkgKey === pkgKey) {
      setExpandedPkgKey(null);
      return;
    }
    setExpandedPkgKey(pkgKey);

    if (pkgMetaMap[pkgKey] || (pkg.description && pkg.description !== "No description available")) {
      return;
    }

    const normEco = (ecosystem === "venv" || ecosystem === "conda") ? "pip" : ecosystem;
    const cacheKey = `pg_meta_${normEco}_${pkg.name.toLowerCase()}`;

    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setPkgMetaMap((prev) => ({ ...prev, [pkgKey]: parsed }));
        return;
      }
    } catch {}

    setLoadingMetaKey(pkgKey);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      let fetched: any = {
        description: pkg.description || null,
        license: pkg.license || null,
        author: pkg.author || null,
        homepage: pkg.homepage || null,
        dependencies: pkg.dependencies ? Object.keys(pkg.dependencies) : undefined,
      };

      if (normEco === "pip") {
        const pypiName = pkg.name.toLowerCase().replace(/[._]/g, "-");
        const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pypiName)}/json`, {
          signal: controller.signal,
          headers: { "Accept": "application/json" },
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          fetched = {
            description: data.info?.summary || data.info?.description || null,
            license: data.info?.license || null,
            author: data.info?.author || data.info?.maintainer || null,
            homepage: data.info?.home_page || data.info?.project_urls?.Homepage || null,
            dependencies: Array.isArray(data.info?.requires_dist)
              ? data.info.requires_dist.map((d: string) => d.split(";")[0].trim().split(" ")[0]).filter(Boolean)
              : undefined,
          };
        }
      } else {
        const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/latest`, {
          signal: controller.signal,
          headers: { "Accept": "application/json" },
        });
        clearTimeout(timeoutId);
        if (res.ok) {
          const data = await res.json();
          fetched = {
            description: data.description || null,
            license: typeof data.license === "string" ? data.license : data.license?.type || null,
            author: typeof data.author === "string" ? data.author : data.author?.name || null,
            homepage: data.homepage || null,
            dependencies: data.dependencies ? Object.keys(data.dependencies) : undefined,
          };
        }
      }

      setPkgMetaMap((prev) => ({ ...prev, [pkgKey]: fetched }));
      try {
        localStorage.setItem(cacheKey, JSON.stringify(fetched));
      } catch {}
    } catch {
      const fallback = {
        description: pkg.description || null,
        license: pkg.license || null,
        author: pkg.author || null,
        homepage: pkg.homepage || null,
      };
      setPkgMetaMap((prev) => ({ ...prev, [pkgKey]: fallback }));
    } finally {
      setLoadingMetaKey(null);
    }
  };

  const { data: allPackages } = useListPackages();

  const envPackages = useMemo(() => {
    if (!envId) return [];
    return allPackages?.filter((p: Package) => String(p.environmentId) === envId) || [];
  }, [allPackages, envId]);

  const snapshotPackages = useMemo(() => {
    if (!viewingSnapshot) return [];
    const list: any[] = Array.isArray(viewingSnapshot.packages) ? viewingSnapshot.packages : [];
    if (list.length === 0 && viewingSnapshot.packageName) {
      return [{
        name: viewingSnapshot.packageName,
        version: viewingSnapshot.packageVersion || "recorded",
        ecosystem: viewingSnapshot.environmentName?.toLowerCase().includes("venv") ? "pip" : "npm",
        type: "dependency",
        status: "installed",
      }];
    }
    return list;
  }, [viewingSnapshot]);

  const filteredSnapshotPackages = useMemo(() => {
    return snapshotPackages.filter((pkg: any) => {
      const q = snapshotSearchQuery.trim().toLowerCase();
      const matchesQuery = !q || (
        (pkg.name && String(pkg.name).toLowerCase().includes(q)) ||
        (pkg.version && String(pkg.version).toLowerCase().includes(q)) ||
        (pkg.ecosystem && String(pkg.ecosystem).toLowerCase().includes(q)) ||
        (pkg.source && String(pkg.source).toLowerCase().includes(q)) ||
        (pkg.type && String(pkg.type).toLowerCase().includes(q))
      );

      if (!matchesQuery) return false;

      if (filterType === "all") return true;
      if (filterType === "dependency") return pkg.type !== "devDependency";
      if (filterType === "devDependency") return pkg.type === "devDependency";
      return true;
    });
  }, [snapshotPackages, snapshotSearchQuery, filterType]);

  const packageTypeCounts = useMemo(() => {
    let dev = 0;
    let prod = 0;
    for (const p of snapshotPackages) {
      if (p.type === "devDependency") dev++;
      else prod++;
    }
    return { all: snapshotPackages.length, dev, prod };
  }, [snapshotPackages]);

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

  // ── Auto-refresh on live events from CLI/Named Pipe ────────────────────────
  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api) return;
    const unlisten1 = api.onDataChanged?.(() => {
      qc.invalidateQueries({ queryKey: getListSnapshotsQueryKey() });
    });
    const unlisten2 = api.onProjectsUpdated?.(() => {
      qc.invalidateQueries({ queryKey: getListSnapshotsQueryKey() });
    });
    const unlisten3 = api.onSnapshotCreated?.(() => {
      qc.invalidateQueries({ queryKey: getListSnapshotsQueryKey() });
    });
    return () => {
      if (typeof unlisten1 === "function") unlisten1();
      if (typeof unlisten2 === "function") unlisten2();
      if (typeof unlisten3 === "function") unlisten3();
    };
  }, [qc]);

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
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-all active:scale-95 hover:bg-[#4338CA] text-white cursor-pointer"
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
          <div className="grid grid-cols-[minmax(0,2.5fr)_90px_minmax(0,1.2fr)_80px_210px] gap-3 px-5 py-2 border-b border-card-border bg-surface-container/40">
            {["Snapshot Name", "Packages", "Date Created", "Status", ""].map((h) => (
              <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</span>
            ))}
          </div>
          <div className="divide-y divide-card-border">
            {[1, 2, 3].map((i) => (
              <div key={i} className="grid grid-cols-[minmax(0,2.5fr)_90px_minmax(0,1.2fr)_80px_210px] gap-3 px-5 py-3 items-center">
                {[200, 60, 90, 60, 140].map((w, j) => (
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
            className="mt-6 flex items-center gap-2 px-5 py-2 rounded-lg text-[12px] font-semibold transition-all active:scale-95 hover:bg-[#4338CA] text-white cursor-pointer"
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
                <div className="grid grid-cols-[minmax(0,2.5fr)_90px_minmax(0,1.2fr)_80px_210px] gap-3 px-5 py-2 border-b border-card-border bg-surface-container/20">
                  {["Snapshot Name", "Packages", "Date Created", "Status", ""].map((h) => (
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
                        className="grid grid-cols-[minmax(0,2.5fr)_90px_minmax(0,1.2fr)_80px_210px] gap-3 px-5 py-3 items-center hover:bg-[#F0F0FF] transition-colors group"
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
                        <div className="flex items-center justify-start min-w-0">
                          <SnapBadge status="verified" />
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2 shrink-0">
                          <button
                            onClick={() => setViewingSnapshot(snap)}
                            className="relative inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150 shrink-0 select-none border border-card-border bg-surface-container/70 hover:bg-[#E8E9FF] hover:text-[#4338CA] hover:border-[#6366F1] text-on-surface active:scale-[0.98] shadow-xs cursor-pointer"
                            title="View snapshot details and packages"
                          >
                            <span className="material-symbols-outlined text-[14px] shrink-0 text-muted-foreground">visibility</span>
                            <span>View</span>
                          </button>
                          <button
                            disabled={isRestoring}
                            onClick={() => handleRestore(snap.id)}
                            className={cn(
                              "relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-150 shrink-0 select-none cursor-pointer",
                              isRestoring
                                ? "opacity-60 cursor-not-allowed"
                                : "hover:shadow-sm hover:bg-[#E8E9FF] hover:text-[#4338CA] hover:border-[#6366F1] active:scale-[0.98]"
                            )}
                            style={{
                              background: `${PALETTE.major}18`,
                              color: PALETTE.major,
                              border: `1px solid ${PALETTE.major}30`,
                            }}
                            title="Restore this snapshot"
                          >
                            <span className={cn("material-symbols-outlined text-[14px] shrink-0", isRestoring && "animate-spin")}>
                              {isRestoring ? "refresh" : "history"}
                            </span>
                            <span>{isRestoring ? "Restoring…" : "Restore"}</span>
                          </button>
                          <button
                            onClick={() => handleDelete(snap.id)}
                            className="relative w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-transparent hover:border-destructive/20 transition-all duration-150 shrink-0 select-none cursor-pointer"
                            title="Delete snapshot"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
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

      {/* ── View Snapshot Details Dialog ───────────────────────────────────── */}
      <Dialog
        open={Boolean(viewingSnapshot)}
        onOpenChange={(open) => {
          if (!open) {
            setViewingSnapshot(null);
            setExpandedPkgKey(null);
          }
        }}
      >
        <DialogContent className="rounded-2xl border-card-border bg-surface-container-lowest shadow-2xl p-6 max-w-2xl max-h-[88vh] flex flex-col overflow-hidden">
          {viewingSnapshot && (
            <>
              {/* Header */}
              <DialogHeader className="mb-3 shrink-0">
                <div className="flex items-center justify-between gap-3 pr-6">
                  <div className="flex items-center gap-3">
                    <IconTile icon="bookmark" color={PALETTE.major} size="md" />
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <DialogTitle className="text-[16px] font-bold text-on-surface">
                          {viewingSnapshot.name}
                        </DialogTitle>
                        <SnapBadge status={viewingSnapshot.status || "verified"} />
                      </div>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        Captured packages for <span className="font-semibold text-on-surface">{viewingSnapshot.environmentName}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Snapshot Meta Info Box */}
              <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-surface-container/50 border border-card-border shrink-0 text-left mb-3">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Created</span>
                  <span className="text-[12px] font-medium text-on-surface">
                    {format(new Date(viewingSnapshot.createdAt || (viewingSnapshot as any).created_at || Date.now()), "MMM d, yyyy · HH:mm")}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Total Packages</span>
                  <span className="text-[12px] font-semibold text-primary">
                    {snapshotPackages.length} captured
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Environment</span>
                  <span className="text-[12px] font-medium text-on-surface truncate block" title={viewingSnapshot.environmentName}>
                    {viewingSnapshot.environmentName}
                  </span>
                </div>
                {viewingSnapshot.notes && (
                  <div className="col-span-3 pt-2 mt-1 border-t border-card-border/60">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Notes</span>
                    <p className="text-[12px] text-on-surface italic mt-0.5">"{viewingSnapshot.notes}"</p>
                  </div>
                )}
              </div>

              {/* Search & Filter Toolbar */}
              <div className="flex items-center justify-between gap-3 shrink-0 mb-3">
                <div className="relative flex-1">
                  <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-muted-foreground">search</span>
                  <Input
                    placeholder="Search packages by name, version, or type…"
                    value={snapshotSearchQuery}
                    onChange={(e) => setSnapshotSearchQuery(e.target.value)}
                    className="h-9 pl-8 pr-7 rounded-lg border-card-border bg-surface-container text-[12px] focus:ring-primary/20"
                  />
                  {snapshotSearchQuery && (
                    <button
                      onClick={() => setSnapshotSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-on-surface"
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  )}
                </div>

                {packageTypeCounts.dev > 0 && (
                  <div className="flex items-center gap-1 bg-surface-container border border-card-border rounded-lg p-0.5 shrink-0">
                    <button
                      onClick={() => setFilterType("all")}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer",
                        filterType === "all"
                          ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-on-surface"
                      )}
                    >
                      All ({packageTypeCounts.all})
                    </button>
                    <button
                      onClick={() => setFilterType("dependency")}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer",
                        filterType === "dependency"
                          ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-on-surface"
                      )}
                    >
                      Prod ({packageTypeCounts.prod})
                    </button>
                    <button
                      onClick={() => setFilterType("devDependency")}
                      className={cn(
                        "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all cursor-pointer",
                        filterType === "devDependency"
                          ? "bg-surface-container-lowest text-on-surface shadow-xs font-semibold"
                          : "text-muted-foreground hover:text-on-surface"
                      )}
                    >
                      Dev ({packageTypeCounts.dev})
                    </button>
                  </div>
                )}
              </div>

              {/* Packages List / Table */}
              <div className="border border-card-border rounded-xl overflow-hidden flex-1 flex flex-col min-h-0 bg-surface-container/20">
                {/* Table Header */}
                <div className="grid grid-cols-[24px_minmax(0,2fr)_minmax(0,1.2fr)_90px_100px] gap-2 px-4 py-2 bg-surface-container/50 border-b border-card-border text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0 text-left items-center">
                  <span></span>
                  <span>Package Name</span>
                  <span>Saved Version</span>
                  <span>Ecosystem</span>
                  <span className="text-right pr-1">Type</span>
                </div>

                {/* Table Body (Scrollable) */}
                <div className="overflow-y-auto divide-y divide-card-border/60 flex-1">
                  {filteredSnapshotPackages.length > 0 ? (
                    filteredSnapshotPackages.map((pkg: any, idx: number) => {
                      const ecosystem = (pkg.ecosystem || pkg.source || (viewingSnapshot.environmentName?.toLowerCase().includes("venv") ? "pip" : "npm")).toLowerCase();
                      const version = pkg.version || pkg.installedVersion || "—";
                      const isDev = pkg.type === "devDependency";
                      const pkgKey = `${pkg.name}-${pkg.version || idx}`;
                      const isExpanded = expandedPkgKey === pkgKey;
                      const meta = pkgMetaMap[pkgKey];
                      const isLoadingMeta = loadingMetaKey === pkgKey;

                      const description = meta?.description ?? pkg.description;
                      const license = meta?.license ?? pkg.license;
                      const author = meta?.author ?? pkg.author;
                      const dependencies: string[] | undefined = meta?.dependencies ?? (Array.isArray(pkg.dependencies) ? pkg.dependencies : undefined);
                      const registryUrl = ecosystem === "pip"
                        ? `https://pypi.org/project/${encodeURIComponent(pkg.name.toLowerCase().replace(/[._]/g, "-"))}/`
                        : `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`;

                      return (
                        <div key={pkgKey} className="transition-colors">
                          <div
                            onClick={() => handleToggleExpand(pkgKey, pkg, ecosystem)}
                            className={cn(
                              "grid grid-cols-[24px_minmax(0,2fr)_minmax(0,1.2fr)_90px_100px] gap-2 px-4 py-2.5 items-center cursor-pointer select-none transition-colors text-left",
                              isExpanded
                                ? "bg-primary/5 dark:bg-primary/10"
                                : "hover:bg-surface-container/50"
                            )}
                            title="Click to view package details and description"
                          >
                            {/* Expandable Chevron Affordance */}
                            <div className="flex items-center justify-center">
                              <span
                                className={cn(
                                  "material-symbols-outlined text-[16px] text-muted-foreground transition-transform duration-200",
                                  isExpanded ? "rotate-90 text-primary" : "hover:text-on-surface"
                                )}
                              >
                                chevron_right
                              </span>
                            </div>

                            {/* Name */}
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="material-symbols-outlined text-[15px] text-muted-foreground shrink-0">
                                {ecosystem === "pip" ? "terminal" : "inventory_2"}
                              </span>
                              <span className="text-[13px] font-medium text-on-surface truncate" title={pkg.name}>
                                {pkg.name}
                              </span>
                              {pkg.status === "missing" && (
                                <span className="text-[10px] text-amber-500 font-medium shrink-0" title="Missing from environment">
                                  (missing)
                                </span>
                              )}
                            </div>

                            {/* Version */}
                            <div className="min-w-0">
                              <span className="inline-block font-mono text-[11px] px-2 py-0.5 rounded bg-surface-container border border-card-border/80 text-on-surface truncate max-w-full">
                                {version}
                              </span>
                            </div>

                            {/* Ecosystem */}
                            <div>
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border",
                                  ecosystem === "pip"
                                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20"
                                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                )}
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                {ecosystem}
                              </span>
                            </div>

                            {/* Type / Metadata */}
                            <div className="flex items-center justify-end pr-1">
                              {isDev ? (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-surface-container text-muted-foreground border border-card-border/60">
                                  devDependency
                                </span>
                              ) : pkg.type === "python" ? (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                                  package
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                                  {pkg.type || "dependency"}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Accordion Details Panel */}
                          {isExpanded && (
                            <div className="px-5 py-3.5 bg-surface-container/30 dark:bg-surface-container-lowest/70 border-t border-card-border/50 text-left space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
                              {/* Description Section */}
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                                  Description
                                </span>
                                {isLoadingMeta ? (
                                  <div className="flex items-center gap-2 py-1 text-[12px] text-muted-foreground">
                                    <span className="material-symbols-outlined text-[15px] animate-spin text-primary">
                                      progress_activity
                                    </span>
                                    <span>Fetching package metadata…</span>
                                  </div>
                                ) : (
                                  <p className="text-[12px] text-on-surface leading-relaxed">
                                    {description ? (
                                      description
                                    ) : (
                                      <span className="text-muted-foreground italic">
                                        No description available for this package
                                      </span>
                                    )}
                                  </p>
                                )}
                              </div>

                              {/* Metadata Badges & Registry Link */}
                              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-card-border/40">
                                {license && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-surface-container border border-card-border/80 text-muted-foreground">
                                    <span className="material-symbols-outlined text-[13px]">policy</span>
                                    <span>License: {license}</span>
                                  </span>
                                )}

                                {author && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-surface-container border border-card-border/80 text-muted-foreground">
                                    <span className="material-symbols-outlined text-[13px]">person</span>
                                    <span>Author: {author}</span>
                                  </span>
                                )}

                                <a
                                  href={registryUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const api = (window as any).electronAPI;
                                    if (api?.openExternal) {
                                      e.preventDefault();
                                      api.openExternal(registryUrl);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-medium text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/15 border border-primary/20 ml-auto transition-colors cursor-pointer"
                                  title={`Open ${pkg.name} on ${ecosystem === "pip" ? "PyPI" : "npm"}`}
                                >
                                  <span>View on {ecosystem === "pip" ? "PyPI" : "npm"}</span>
                                  <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                                </a>
                              </div>

                              {/* Dependencies (if present) */}
                              {dependencies && dependencies.length > 0 && (
                                <div className="pt-2 border-t border-card-border/40">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                      Resolved Dependencies ({dependencies.length})
                                    </span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                                    {dependencies.slice(0, 16).map((dep, dIdx) => (
                                      <span
                                        key={dIdx}
                                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container border border-card-border/70 text-on-surface"
                                      >
                                        {dep}
                                      </span>
                                    ))}
                                    {dependencies.length > 16 && (
                                      <span className="text-[10px] text-muted-foreground self-center px-1">
                                        +{dependencies.length - 16} more
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center text-center px-4">
                      <span className="material-symbols-outlined text-[32px] text-muted-foreground opacity-40 mb-2">
                        {snapshotSearchQuery ? "search_off" : "inventory_2"}
                      </span>
                      <p className="text-[13px] font-medium text-on-surface">
                        {snapshotSearchQuery ? "No matching packages" : "No packages captured"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xs">
                        {snapshotSearchQuery
                          ? `No packages matched "${snapshotSearchQuery}". Try a different search.`
                          : "This snapshot does not contain any package entries."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <DialogFooter className="mt-4 pt-3 border-t border-card-border flex-row items-center justify-between sm:justify-between shrink-0">
                <span className="text-[11px] font-mono text-muted-foreground">
                  Snapshot ID: <span className="text-on-surface font-semibold">{viewingSnapshot.id}</span>
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const idToRestore = viewingSnapshot.id;
                      setViewingSnapshot(null);
                      handleRestore(idToRestore);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all active:scale-95 cursor-pointer"
                    style={{
                      background: `${PALETTE.major}18`,
                      color: PALETTE.major,
                      border: `1px solid ${PALETTE.major}30`,
                    }}
                  >
                    <span className="material-symbols-outlined text-[14px]">history</span>
                    Restore Snapshot
                  </button>
                  <button
                    onClick={() => setViewingSnapshot(null)}
                    className="px-4 py-1.5 rounded-lg text-[12px] font-medium text-muted-foreground hover:bg-surface-container transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
