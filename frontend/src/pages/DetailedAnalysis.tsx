import React, { useMemo, useState, useEffect } from "react";
import {
  useListPackages,
  useListEnvironments,
  useGetStatusBreakdown,
  Package,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  PieChart, Pie, Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download } from "lucide-react";

// ─── Palette (identical to Dashboard) ────────────────────────────────────────
const PALETTE = {
  healthy: "#5EEAD4",
  patch:   "#67E8F9",
  minor:   "#818CF8",
  major:   "#6366F1",
  failed:  "#312E81",
  unknown: "#A5B4FC",
};

const STATUS_KEYS = ["healthy", "patch", "minor", "major", "failed"] as const;
type StatusKey = typeof STATUS_KEYS[number];

const LEGEND = [
  { key: "healthy" as StatusKey, label: "Healthy" },
  { key: "patch"   as StatusKey, label: "Patch"   },
  { key: "minor"   as StatusKey, label: "Minor"   },
  { key: "major"   as StatusKey, label: "Major"   },
  { key: "failed"  as StatusKey, label: "Failed"  },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function IconTile({ icon, color, size = "md" }: { icon: string; color: string; size?: "sm" | "md" }) {
  const dims = size === "sm" ? "w-7 h-7 text-[15px]" : "w-9 h-9 text-[18px]";
  return (
    <div
      className={cn("rounded-xl flex items-center justify-center shrink-0", dims)}
      style={{ backgroundColor: `${color}1a`, color }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: "inherit" }}>{icon}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    healthy: { label: "Healthy", bg: `${PALETTE.healthy}20`, color: "#0f766e" },
    patch:   { label: "Patch",   bg: `${PALETTE.patch}20`,   color: "#0e7490" },
    minor:   { label: "Minor",   bg: `${PALETTE.minor}20`,   color: "#4338ca" },
    major:   { label: "Major",   bg: `${PALETTE.major}20`,   color: PALETTE.major },
    failed:  { label: "Failed",  bg: `${PALETTE.failed}20`,  color: "#1e1b4b" },
    unknown: { label: "Unknown", bg: `${PALETTE.unknown}20`, color: "#6366f1" },
  };
  const s = map[status] ?? map["unknown"];
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ─── Horizontal stacked bar ───────────────────────────────────────────────────
interface StackedBarProps {
  healthy: number; patch: number; minor: number; major: number; failed: number; unknown: number;
}
function HorizontalStackedBar({ healthy, patch, minor, major, failed, unknown }: StackedBarProps) {
  const total = healthy + patch + minor + major + failed + unknown;
  if (total === 0) {
    return <div className="h-4 rounded-full bg-surface-container w-full opacity-40" />;
  }
  const pct = (v: number) => (v / total) * 100;
  const segments: { key: StatusKey; value: number }[] = ([
    { key: "healthy" as StatusKey, value: healthy },
    { key: "patch"   as StatusKey, value: patch   },
    { key: "minor"   as StatusKey, value: minor   },
    { key: "major"   as StatusKey, value: major   },
    { key: "failed"  as StatusKey, value: failed  },
  ]).filter(s => s.value > 0);

  return (
    <div className="flex h-4 rounded-full overflow-hidden w-full gap-px">
      {segments.map(({ key, value }, i) => (
        <div
          key={key}
          title={`${LEGEND.find(l => l.key === key)?.label}: ${value}`}
          style={{
            width: `${pct(value)}%`,
            backgroundColor: PALETTE[key],
            borderRadius: i === 0 ? "9999px 0 0 9999px" : i === segments.length - 1 ? "0 9999px 9999px 0" : "0",
          }}
        />
      ))}
    </div>
  );
}

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

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DetailedAnalysis() {
  const { data: packages } = useListPackages();
  const { data: envs }     = useListEnvironments();
  const { data: breakdown } = useGetStatusBreakdown();

  const { data: registeredVenvs } = useQuery({
    queryKey: ["venvs", "registered"],
    queryFn: () => (window as any).electronAPI.getRegisteredVenvs(),
  });

  const [selectedEnvId,       setSelectedEnvId]       = useState<string>("");
  const [sectionBTableFilter, setSectionBTableFilter] = useState<string>("all");
  const [sectionBTableSort,   setSectionBTableSort]   = useState<{ col: string; dir: "asc" | "desc" }>({ col: "name", dir: "asc" });
  const [selectedRows,        setSelectedRows]        = useState<Set<string>>(new Set());

  // ── Derived collections ─────────────────────────────────────────────────────
  const localEnvironments = useMemo(() => {
    const localEnvs = envs?.filter((e: any) => !e.name.toLowerCase().includes("global")).map((e: any) => ({ ...e, isVenv: false })) || [];
    const venvs = registeredVenvs?.map((v: any) => ({
      id: v.path, name: v.name, type: "venv", isVenv: true, path: v.path, packageCount: v.packageCount || 0,
    })) || [];
    return [...localEnvs, ...venvs];
  }, [envs, registeredVenvs]);

  useEffect(() => {
    if (localEnvironments.length > 0 && (!selectedEnvId || !localEnvironments.find((e: any) => e.id.toString() === selectedEnvId))) {
      setSelectedEnvId(localEnvironments[0].id.toString());
    }
  }, [localEnvironments, selectedEnvId]);

  const isVenvSelected = useMemo(
    () => registeredVenvs?.some((v: any) => v.path === selectedEnvId),
    [selectedEnvId, registeredVenvs]
  );

  const { data: venvPackagesResult } = useQuery<any>({
    queryKey: ["venvs", "packages", selectedEnvId],
    queryFn: async () => (window as any).electronAPI.getVenvPackages(selectedEnvId),
    enabled: isVenvSelected,
  });

  const allEnvironments = useMemo(() => {
    const globalEnvs = envs?.map((e: any) => ({ ...e, isVenv: false })) || [];
    const venvs = registeredVenvs?.map((v: any) => ({
      id: v.path, name: v.name, type: "venv", isVenv: true, path: v.path, packageCount: v.packageCount || 0,
    })) || [];
    return [...globalEnvs, ...venvs];
  }, [envs, registeredVenvs]);

  // Global rows (for section 1 bars)
  const globalData = useMemo(() => {
    if (!breakdown) return [];
    return breakdown
      .filter((b: any) => b.environmentName.toLowerCase().includes("global"))
      .map((b: any) => ({
        name:    b.environmentName,
        healthy: b.upToDate,
        patch:   b.patch,
        minor:   b.minor,
        major:   b.major,
        failed:  b.failed,
        unknown: b.unknown,
        total:   b.upToDate + b.patch + b.minor + b.major + b.failed + b.unknown,
      }));
  }, [breakdown]);

  // Inventory totals (quick-glance strip)
  const inventoryTotals = useMemo(() => {
    if (!packages) return { total: 0, healthy: 0, patch: 0, minor: 0, major: 0, failed: 0 };
    const c: Record<string, number> = { total: 0, healthy: 0, patch: 0, minor: 0, major: 0, failed: 0 };
    packages.forEach((p: Package) => {
      c["total"]++;
      const s = p.status === "up-to-date" ? "healthy" : p.status;
      if (s in c) c[s]++;
    });
    return c;
  }, [packages]);

  // Local env packages
  const currentEnvPackages = useMemo(() => {
    if (!selectedEnvId) return [];
    const selectedEnv = allEnvironments.find((e: any) => e.id.toString() === selectedEnvId);
    if (selectedEnv?.isVenv) {
      return venvPackagesResult?.packages?.map((p: any) => ({
        ...p,
        id: `venv-${p.name}`,
        installedVersion: p.version,
        status: p.status === "up-to-date" ? "healthy" : (p.status || "healthy"),
        lastChecked: venvPackagesResult?.lastScanned || new Date().toISOString(),
      })) || [];
    }
    return packages?.filter((p: Package) => p.environmentId.toString() === selectedEnvId).map((p: Package) => ({
      ...p, status: p.status === "up-to-date" ? "healthy" : p.status,
    })) || [];
  }, [selectedEnvId, allEnvironments, venvPackagesResult, packages]);

  const sectionBDonutData = useMemo(() => {
    const counts: Record<string, number> = { healthy: 0, patch: 0, minor: 0, major: 0, failed: 0, unknown: 0 };
    currentEnvPackages.forEach((p: any) => { if (p.status in counts) counts[p.status]++; });
    return Object.entries(counts).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [currentEnvPackages]);

  const sectionBStats = useMemo(() => {
    const total        = currentEnvPackages.length;
    const healthy      = currentEnvPackages.filter((p: any) => p.status === "healthy").length;
    const needAttention = currentEnvPackages.filter((p: any) => ["patch", "minor", "major"].includes(p.status)).length;
    const critical     = currentEnvPackages.filter((p: any) => p.status === "failed").length;
    return { total, healthy, needAttention, critical };
  }, [currentEnvPackages]);

  const sectionBFilteredPackages = useMemo(() => {
    let result = [...currentEnvPackages];
    if (sectionBTableFilter !== "all") result = result.filter((p: any) => p.status === sectionBTableFilter);
    result.sort((a: any, b: any) => {
      const vA = a[sectionBTableSort.col] || "";
      const vB = b[sectionBTableSort.col] || "";
      if (vA < vB) return sectionBTableSort.dir === "asc" ? -1 : 1;
      if (vA > vB) return sectionBTableSort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return result;
  }, [currentEnvPackages, sectionBTableFilter, sectionBTableSort]);

  const activeStatuses = useMemo(() => {
    const s = new Set<string>();
    currentEnvPackages.forEach((p: any) => s.add(p.status));
    return s;
  }, [currentEnvPackages]);

  const selectedEnvName = useMemo(
    () => allEnvironments.find((e: any) => e.id.toString() === selectedEnvId)?.name || "Environment",
    [selectedEnvId, allEnvironments]
  );

  const isNew = (dateStr: string) => (Date.now() - new Date(dateStr).getTime()) < 86_400_000;

  const toggleRow = (id: string) => {
    const next = new Set(selectedRows);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedRows(next);
  };
  const toggleAllRows = () => {
    setSelectedRows(
      selectedRows.size === sectionBFilteredPackages.length
        ? new Set()
        : new Set(sectionBFilteredPackages.map((p: any) => p.id))
    );
  };

  const getRisk = (status: string) => {
    if (status === "healthy" || status === "unknown") return { label: "Low",    color: PALETTE.healthy };
    if (status === "patch"   || status === "minor")   return { label: "Medium", color: PALETTE.minor   };
    return                                                    { label: "High",   color: PALETTE.failed  };
  };

  const SectionBTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const pct = currentEnvPackages.length > 0 ? ((d.value / currentEnvPackages.length) * 100).toFixed(1) : "0.0";
    return (
      <div className="bg-surface-container-lowest border border-card-border p-3 rounded-lg shadow-xl text-[12px]">
        <p className="font-semibold text-on-surface mb-1">{d.name}</p>
        <p className="text-muted-foreground">{d.value} packages — {pct}%</p>
      </div>
    );
  };

  const healthyPct = inventoryTotals.total > 0
    ? Math.round((inventoryTotals.healthy / inventoryTotals.total) * 100)
    : 0;

  return (
    <div className="space-y-5 max-w-full animate-in fade-in duration-500">

      {/* ── Quick-glance inventory strip (replaces Inventory Summary card) ── */}
      <div className="bg-surface-container-lowest border border-card-border rounded-xl px-5 py-3 shadow-[var(--shadow-premium)] flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2 shrink-0">
          <IconTile icon="inventory_2" color={PALETTE.major} size="sm" />
          <div>

            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">Total Packages</p>
            <p className="text-[18px] font-bold text-on-surface leading-tight">{inventoryTotals.total.toLocaleString()}</p>
          </div>
        </div>
        <div className="h-8 w-px bg-card-border shrink-0" />
        {/* Inline stacked bar */}
        <div className="flex-1 min-w-[160px]">
          <HorizontalStackedBar
            healthy={inventoryTotals.healthy}
            patch={inventoryTotals.patch}
            minor={inventoryTotals.minor}
            major={inventoryTotals.major}
            failed={inventoryTotals.failed}
            unknown={0}
          />
        </div>
        <div className="h-8 w-px bg-card-border shrink-0" />
        {/* Counts */}
        <div className="flex items-center gap-5 shrink-0">
          {LEGEND.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PALETTE[key] }} />
              <span className="text-[11px] text-muted-foreground">{label}</span>
              <span className="text-[12px] font-semibold text-on-surface">{(inventoryTotals as any)[key] ?? 0}</span>
            </div>
          ))}
        </div>
        <span
          className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
          style={{ background: `${PALETTE.healthy}20`, color: "#0f766e" }}
        >
          {healthyPct}% healthy
        </span>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 1 — Registry / Environment Breakdown                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-surface-container-lowest border border-card-border rounded-xl p-5 shadow-[var(--shadow-premium)]">
        <SectionHeader
          title="Registry & Environment Breakdown"
          subtitle="Per-registry health distribution — all global package sources"
        />

        {globalData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 opacity-40">
            <span className="material-symbols-outlined text-[40px] text-muted-foreground mb-2">layers</span>
            <p className="text-[12px] text-muted-foreground">No global registry data yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {globalData.map((row: any) => {
              const healthyRowPct = row.total > 0 ? Math.round((row.healthy / row.total) * 100) : 0;
              return (
                <div key={row.name} className="space-y-1.5">
                  {/* Row label + stats */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <IconTile icon="dns" color={PALETTE.minor} size="sm" />
                      <div>
                        <p className="text-[13px] font-semibold text-on-surface leading-none">{row.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {row.total.toLocaleString()} packages &middot; {healthyRowPct}% healthy
                        </p>
                      </div>
                    </div>
                    {/* Per-status counts */}
                    <div className="flex items-center gap-3 shrink-0">
                      {LEGEND.filter(l => row[l.key] > 0).map(({ key, label }) => (
                        <span
                          key={key}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: `${PALETTE[key]}20`, color: PALETTE[key] === PALETTE.failed ? "#1e1b4b" : PALETTE[key] }}
                        >
                          {label} {row[key]}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Bar */}
                  <div className="pl-9">
                    <HorizontalStackedBar
                      healthy={row.healthy} patch={row.patch}
                      minor={row.minor}     major={row.major}
                      failed={row.failed}   unknown={row.unknown}
                    />
                  </div>
                </div>
              );
            })}

            {/* Shared legend */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 pt-3 mt-1 border-t border-card-border pl-9">
              {LEGEND.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: PALETTE[key] }} />
                  <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* SECTION 2 — Local Environment Status                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <div className="bg-surface-container-lowest border border-card-border rounded-xl p-5 shadow-[var(--shadow-premium)]">
        <SectionHeader
          title={selectedEnvId ? `${selectedEnvName} — Health Breakdown` : "Local Environment Status"}
          subtitle={`Showing ${currentEnvPackages.length} packages in ${selectedEnvName}`}
          action={
            <div className="flex items-center gap-2">
              <Select value={selectedEnvId} onValueChange={setSelectedEnvId}>
                <SelectTrigger className="w-[190px] h-9 bg-surface-container border border-card-border rounded-lg text-[13px] text-on-surface focus:ring-primary/20 focus:ring-offset-0">
                  <SelectValue placeholder={localEnvironments.length > 0 ? "Select Environment" : "No environments"} />
                </SelectTrigger>
                <SelectContent className="bg-surface-container-lowest border-card-border rounded-xl shadow-xl">
                  {localEnvironments.length > 0
                    ? localEnvironments.map((env: any) => (
                        <SelectItem key={env.id} value={env.id.toString()} className="text-[13px]">{env.name}</SelectItem>
                      ))
                    : <SelectItem value="none" disabled>No environments found</SelectItem>
                  }
                </SelectContent>
              </Select>
              <button
                onClick={() => console.log("Export PNG")}
                disabled={!selectedEnvId}
                className="flex items-center gap-1.5 px-3 py-2 h-9 bg-surface-container border border-card-border rounded-lg text-[12px] font-medium text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5 text-muted-foreground" />
                Export PNG
              </button>
            </div>
          }
        />

        {/* Empty state */}
        {currentEnvPackages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 opacity-50">
            <IconTile icon="inventory_2" color={PALETTE.major} size="md" />
            <p className="text-[14px] font-semibold text-on-surface mt-4 leading-none">No packages found</p>
            <p className="text-[12px] text-muted-foreground mt-1.5">Select an environment or run a scan to populate data.</p>
          </div>
        ) : (
          <div className="space-y-5">

            {/* Stat chips */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Total Packages",  value: sectionBStats.total,         icon: "inventory_2",   color: PALETTE.major   },
                { label: "Healthy",         value: sectionBStats.healthy,        icon: "check_circle",  color: PALETTE.healthy },
                { label: "Needs Attention", value: sectionBStats.needAttention,  icon: "sync_problem",  color: PALETTE.minor   },
                { label: "Critical",        value: sectionBStats.critical,       icon: "warning",       color: PALETTE.failed  },
              ].map(stat => (
                <div key={stat.label} className="bg-surface-container border border-card-border rounded-xl px-4 py-3 flex items-center gap-3">
                  <IconTile icon={stat.icon} color={stat.color} size="sm" />
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">{stat.label}</p>
                    <p className="text-[20px] font-bold text-on-surface leading-tight mt-0.5">{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Donut + Table */}
            <div className="flex gap-5 min-h-[320px]">

              {/* Donut */}
              <div className="w-[240px] shrink-0 bg-surface-container border border-card-border rounded-xl p-4 flex flex-col items-center justify-center">
                <div className="relative w-[180px] h-[180px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sectionBDonutData}
                        cx="50%" cy="50%"
                        innerRadius={58} outerRadius={82}
                        paddingAngle={3} dataKey="value"
                        animationDuration={600} strokeWidth={0}
                      >
                        {sectionBDonutData.map((entry: any, i: number) => (
                          <Cell key={i} fill={PALETTE[entry.name as StatusKey] ?? PALETTE.unknown} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<SectionBTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-[28px] font-bold text-on-surface leading-none">{sectionBStats.total}</p>
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mt-1">Total</p>
                  </div>
                </div>
                {/* Donut legend */}
                <div className="mt-4 pt-3 border-t border-card-border w-full space-y-1.5">
                  {LEGEND.map(({ key, label }) => {
                    const val = sectionBDonutData.find((d: any) => d.name === key)?.value ?? 0;
                    return (
                      <div key={key} className="flex items-center gap-2" style={{ opacity: activeStatuses.has(key) ? 1 : 0.3 }}>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PALETTE[key] }} />
                        <span className="text-[11px] text-muted-foreground flex-1">{label}</span>
                        <span className="text-[11px] font-semibold text-on-surface">{val}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Table */}
              <div className="flex-1 flex flex-col min-h-0">
                {/* Filter chips */}
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <div className="flex items-center gap-1 bg-surface-container border border-card-border rounded-lg p-0.5">
                    {["all", "healthy", "patch", "minor", "major", "failed"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSectionBTableFilter(s)}
                        className={cn(
                          "px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide rounded-md transition-all",
                          sectionBTableFilter === s
                            ? "bg-surface-container-lowest text-on-surface shadow-[var(--shadow-premium)]"
                            : "text-muted-foreground hover:text-on-surface"
                        )}
                      >
                        {s === "failed" ? "Critical" : s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                  {selectedRows.size > 0 && (
                    <span
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: `${PALETTE.major}15`, color: PALETTE.major }}
                    >
                      {selectedRows.size} selected
                    </span>
                  )}
                </div>

                {/* Table */}
                <div className="flex-1 border border-card-border rounded-xl overflow-hidden bg-surface-container-lowest flex flex-col">
                  <div className="overflow-y-auto flex-1">
                    <Table>
                      <TableHeader className="bg-surface-container/40 sticky top-0 z-10">
                        <TableRow className="border-b border-card-border hover:bg-transparent h-9">
                          <TableHead className="w-10 h-9 px-3 py-0">
                            <input
                              type="checkbox"
                              checked={sectionBFilteredPackages.length > 0 && selectedRows.size === sectionBFilteredPackages.length}
                              onChange={toggleAllRows}
                              className="w-3.5 h-3.5 rounded cursor-pointer accent-primary"
                            />
                          </TableHead>
                          {[
                            { label: "Package", col: "name",             sortable: true  },
                            { label: "Version",  col: "installedVersion", sortable: false },
                            { label: "Status",   col: "status",           sortable: false },
                            { label: "Risk",     col: "",                 sortable: false },
                          ].map(({ label, col, sortable }) => (
                            <TableHead
                              key={label}
                              className={cn(
                                "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 py-0 h-9",
                                sortable && "cursor-pointer hover:text-on-surface"
                              )}
                              onClick={sortable ? () => setSectionBTableSort({ col, dir: sectionBTableSort.dir === "asc" ? "desc" : "asc" }) : undefined}
                            >
                              <span className="flex items-center gap-1">
                                {label}
                                {sortable && sectionBTableSort.col === col && (
                                  <span className="material-symbols-outlined text-[12px]">
                                    {sectionBTableSort.dir === "asc" ? "arrow_upward" : "arrow_downward"}
                                  </span>
                                )}
                              </span>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sectionBFilteredPackages.map((pkg: any) => {
                          const risk = getRisk(pkg.status);
                          return (
                            <TableRow
                              key={pkg.id}
                              className={cn(
                                "border-b border-card-border h-11 transition-colors",
                                selectedRows.has(pkg.id) ? "bg-primary/[0.03]" : "hover:bg-surface-container/50"
                              )}
                            >
                              <TableCell className="w-10 h-11 px-3 py-0">
                                <input
                                  type="checkbox"
                                  checked={selectedRows.has(pkg.id)}
                                  onChange={() => toggleRow(pkg.id)}
                                  className="w-3.5 h-3.5 rounded cursor-pointer accent-primary"
                                />
                              </TableCell>
                              <TableCell className="px-3 py-0 text-[13px]">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-on-surface truncate max-w-[200px]">{pkg.name}</span>
                                  {isNew(pkg.lastChecked) && (
                                    <span
                                      className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
                                      style={{ background: `${PALETTE.major}15`, color: PALETTE.major }}
                                    >
                                      New
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="px-3 py-0 font-mono text-[12px] text-muted-foreground">
                                {pkg.installedVersion}
                              </TableCell>
                              <TableCell className="px-3 py-0">
                                <StatusBadge status={pkg.status} />
                              </TableCell>
                              <TableCell className="px-3 py-0">
                                <span
                                  className="text-[11px] font-semibold"
                                  style={{ color: risk.color }}
                                >
                                  {risk.label}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
