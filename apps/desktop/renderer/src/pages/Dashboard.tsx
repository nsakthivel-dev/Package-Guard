import React, { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useGetStatusBreakdown,
  useGetSettings,
  getGetDashboardSummaryQueryKey,
  getGetStatusBreakdownQueryKey,
  HistoryEntry,
} from "@packageguard/api-client-react";
import { usePackageStore } from "@/store/usePackageStore";
import { ecosystemIcon } from "@/lib/statusColors";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";

// ─── Chart Color Palette ───────────────────────────────────────────────────────
// Distinct colors for each severity level:
// Healthy: green/teal, Patch: cyan, Minor: light purple, Major: indigo, Failed: red
const CHART_COLORS = {
  healthy: "#10B981", // green/teal (emerald)
  patch:   "#06B6D4", // cyan
  minor:   "#A855F7", // light purple
  major:   "#6366F1", // indigo
  failed:  "#EF4444", // red
  unknown: "#94A3B8", // slate
} as const;

// ─── Circular Progress Component ──────────────────────────────────────────────
interface CircularProgressProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  className?: string;
  children?: React.ReactNode;
}

function CircularProgress({
  percentage,
  size = 120,
  strokeWidth = 10,
  color = CHART_COLORS.healthy,
  trackColor = "hsl(var(--muted))",
  className,
  children,
}: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const safePercentage = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (safePercentage / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  delta?: { value: string; positive: boolean };
  accent?: string;
  isCritical?: boolean;
}

function StatCard({ label, value, icon, delta, accent = CHART_COLORS.major, isCritical }: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-surface-container-lowest border border-card-border rounded-xl p-4 shadow-[var(--shadow-premium)]",
        "hover:shadow-[var(--shadow-premium-hover)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group flex flex-col justify-between gap-3"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">
          {label}
        </span>
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
            isCritical ? "bg-destructive/10 text-destructive" : ""
          )}
          style={!isCritical && accent ? { backgroundColor: `${accent}18`, color: accent } : undefined}
        >
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </div>
      </div>
      <div className="flex items-baseline justify-between gap-2 mt-1">
        <span
          className={cn(
            "text-[26px] font-bold leading-none tracking-tight",
            isCritical && Number(value) > 0 ? "text-destructive" : "text-on-surface"
          )}
        >
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-full leading-none",
              delta.positive
                ? "bg-[#10B981]/15 text-[#047857] border border-[#10B981]/25"
                : "bg-destructive/10 text-destructive border border-destructive/25"
            )}
          >
            <span className="material-symbols-outlined text-[13px]">
              {delta.positive ? "trending_up" : "warning"}
            </span>
            {delta.value}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h3 className="text-[14px] font-semibold text-on-surface leading-tight tracking-tight">{title}</h3>
        {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Donut Tooltip ────────────────────────────────────────────────────────────
function DonutTooltip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;

  return (
    <div className="bg-surface-container-lowest border border-card-border rounded-lg p-2.5 shadow-xl text-[12px] z-50">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.payload.color }} />
        <span className="font-semibold text-on-surface">{item.name}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-muted-foreground">
        <span>Packages:</span>
        <span className="font-semibold text-on-surface">{item.value.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-muted-foreground">
        <span>Share:</span>
        <span className="font-semibold text-on-surface">{pct}%</span>
      </div>
    </div>
  );
}

// ─── Environment Health Item Type ─────────────────────────────────────────────
interface EnvironmentHealthItem {
  id: string;
  name: string;
  total: number;
  upToDate: number;
  patch: number;
  minor: number;
  major: number;
  failed: number;
  healthPct: number | null; // null if 0 packages
  pending: number;
  hasCritical: boolean;
}

// ─── Dashboard Component ──────────────────────────────────────────────────────
export default function Dashboard() {
  const { data: summary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 3000 },
  });
  const { data: rawActivity, isLoading: activityLoading } = useGetRecentActivity({ limit: 8 });
  const { data: breakdown } = useGetStatusBreakdown({
    query: { queryKey: getGetStatusBreakdownQueryKey(), refetchInterval: 3000 },
  });
  const { data: settings } = useGetSettings();

  const ignoredSet = useMemo(() => {
    const list = Array.isArray((settings as any)?.ignoredPackages) ? (settings as any).ignoredPackages : [];
    return new Set(list.map((p: any) => typeof p === 'string' ? p.trim().toLowerCase() : '').filter(Boolean));
  }, [(settings as any)?.ignoredPackages]);

  const storePackages = usePackageStore((s) => s.packages);
  const storeEnvironments = usePackageStore((s) => s.environments);

  // Discover virtual environments and unclassified projects from core Electron backend
  const { data: registeredVenvs } = useQuery<any[]>({
    queryKey: ["venvs", "registered"],
    queryFn: () => (window as any).electronAPI?.getRegisteredVenvs?.() ?? [],
  });

  const { data: projectList } = useQuery<any[]>({
    queryKey: ["projects"],
    queryFn: () => (window as any).electronAPI?.getProjects?.() ?? [],
  });

  // ── 1. Deduplicate & Map Environment Health (each actual environment appears once) ──
  const environmentHealthList = useMemo<EnvironmentHealthItem[]>(() => {
    const rawList =
      breakdown && breakdown.length > 0
        ? breakdown
        : storeEnvironments && storeEnvironments.length > 0
        ? storeEnvironments.map((env) => {
            const pkgs = storePackages.filter(
              (p) => {
                if (p.environmentId !== env.id && (p as any).envId !== env.id && (p as any).env_id !== env.id) return false;
                if (p.status === 'ignored') return false;
                const name = p.name ? p.name.trim().toLowerCase() : '';
                return !ignoredSet.has(name) && !ignoredSet.has(name.replace(/[._]/g, '-'));
              }
            );
            return {
              environmentId: env.id,
              environmentName: env.name,
              upToDate: pkgs.filter((p) => p.status === "up-to-date").length,
              patch: pkgs.filter((p) => p.status === "patch").length,
              minor: pkgs.filter((p) => p.status === "minor").length,
              major: pkgs.filter((p) => p.status === "major").length,
              failed: pkgs.filter((p) => p.status === "failed").length,
              unknown: pkgs.filter((p) => !p.status || p.status === "unknown").length,
            };
          })
        : [];

    const seen = new Set<string>();
    const items: EnvironmentHealthItem[] = [];

    for (const env of rawList) {
      const id = String(env.environmentId || env.environmentName || "");
      const name = String(env.environmentName || env.environmentId || "Environment");
      const key = `${id.toLowerCase()}|${name.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const upToDate = Number(env.upToDate || 0);
      const patch = Number(env.patch || 0);
      const minor = Number(env.minor || 0);
      const major = Number(env.major || 0);
      const failed = Number(env.failed || 0);
      const unknown = Number((env as any).unknown || 0);
      const total = upToDate + patch + minor + major + failed + unknown;
      const pending = patch + minor + major + failed;
      const healthPct = total > 0 ? Math.round((upToDate / total) * 100) : null;

      items.push({
        id,
        name,
        total,
        upToDate,
        patch,
        minor,
        major,
        failed,
        healthPct,
        pending,
        hasCritical: major + failed > 0,
      });
    }

    return items;
  }, [breakdown, storeEnvironments, storePackages]);

  // ── 2. Calculate Global Package Totals from Environments or Summary ────────
  const totalsFromEnvironments = useMemo(() => {
    return environmentHealthList.reduce(
      (acc, env) => {
        acc.upToDate += env.upToDate;
        acc.patch += env.patch;
        acc.minor += env.minor;
        acc.major += env.major;
        acc.failed += env.failed;
        acc.total += env.total;
        return acc;
      },
      { upToDate: 0, patch: 0, minor: 0, major: 0, failed: 0, total: 0 }
    );
  }, [environmentHealthList]);

  const resolvedUpToDate = (summary?.upToDate ?? 0) || totalsFromEnvironments.upToDate;
  const resolvedPatch = ((summary as any)?.patchUpdates ?? 0) || totalsFromEnvironments.patch;
  const resolvedMinor = ((summary as any)?.minorUpdates ?? 0) || totalsFromEnvironments.minor;
  const resolvedMajor = (summary?.majorUpdates ?? 0) || totalsFromEnvironments.major;
  const resolvedFailed = ((summary as any)?.failedUpdates ?? 0) || totalsFromEnvironments.failed;
  const resolvedTotalPkgs = ((summary as any)?.activePackages ?? summary?.totalPackages ?? 0) || totalsFromEnvironments.total;

  const healthyPct = resolvedTotalPkgs > 0 ? Math.round((resolvedUpToDate / resolvedTotalPkgs) * 100) : 0;
  const criticalCount = resolvedMajor + resolvedFailed;

  // ── 3. Dropdown Options Generation (Exact Logical Structure) ───────────────
  // Logical Structure:
  // - Global View
  // - Ecosystems: PIP, NPM, PNPM (no virtual envs, no duplicate Global Pip/NPM/PNPM env entries)
  // - Virtual Environments: only actual discovered private/local virtual environments
  // - Not Found: only when a genuine unclassified / path-not-found state exists
  const [selectedFilterKey, setSelectedFilterKey] = useState<string>("global");

  // Dynamically discover actual virtual environments
  const discoveredVirtualEnvs = useMemo(() => {
    const map = new Map<string, { id: string; name: string; path?: string }>();

    // From registered venvs
    if (Array.isArray(registeredVenvs)) {
      for (const v of registeredVenvs) {
        if (!v) continue;
        const id = String(v.id || v.path || "");
        const name = String(v.name || (v.path ? v.path.split(/[\\/]/).pop() : id));
        if (id && name) {
          map.set(id, { id, name, path: v.path });
        }
      }
    }

    // From project environments with virtual classification
    if (Array.isArray(projectList)) {
      for (const p of projectList) {
        if (p && (p.environmentType === "virtual" || p.venvPath)) {
          const id = String(p.id || p.projectId || "");
          const name = String(p.venvPath ? p.venvPath.split(/[\\/]/).pop() : p.name || id);
          if (id && name && !map.has(id)) {
            map.set(id, { id, name, path: p.venvPath || p.path });
          }
        }
      }
    }

    // From storeEnvironments or breakdown if marked as venv
    for (const env of environmentHealthList) {
      if (
        env.id.startsWith("venv-") ||
        (env as any).type === "venv" ||
        (env as any).environmentType === "virtual"
      ) {
        if (!map.has(env.id)) {
          map.set(env.id, { id: env.id, name: env.name });
        }
      }
    }

    return Array.from(map.values());
  }, [registeredVenvs, projectList, environmentHealthList]);

  // Check if a genuine "Not Found" / unclassified category exists in data model
  const notFoundProjects = useMemo(() => {
    if (!Array.isArray(projectList)) return [];
    return projectList.filter(
      (p) =>
        p &&
        (p.environmentType === "unknown" ||
          (typeof p.warning === "string" && p.warning.toLowerCase().includes("not found")))
    );
  }, [projectList]);

  const hasNotFoundState = notFoundProjects.length > 0;

  // ── 4. Dynamic Health Metrics Calculation for Selected Scope ───────────────
  const selectedScopeMetrics = useMemo(() => {
    // A. Global View
    if (selectedFilterKey === "global") {
      return {
        hasPackages: resolvedTotalPkgs > 0,
        total: resolvedTotalPkgs,
        upToDate: resolvedUpToDate,
        pending: resolvedTotalPkgs - resolvedUpToDate,
        healthPct: healthyPct,
        statusLabel:
          healthyPct >= 90
            ? "Optimal State"
            : healthyPct >= 70
            ? "Updates Recommended"
            : "Action Required",
        badgeVariant: healthyPct >= 90 ? "optimal" : healthyPct >= 70 ? "warning" : "critical",
        scopeLabel: "Overall package compliance",
      };
    }

    // B. Package Ecosystems (PIP, NPM, PNPM)
    if (selectedFilterKey.startsWith("eco:")) {
      const eco = selectedFilterKey.slice(4).toLowerCase();
      const ecoPackages = storePackages.filter(
        (p) => {
          if (p.ecosystem?.toLowerCase() !== eco) return false;
          if (p.status === 'ignored') return false;
          const name = p.name ? p.name.trim().toLowerCase() : '';
          return !ignoredSet.has(name) && !ignoredSet.has(name.replace(/[._]/g, '-'));
        }
      );

      // Check store packages directly
      if (ecoPackages.length > 0) {
        const total = ecoPackages.length;
        const upToDate = ecoPackages.filter((p) => p.status === "up-to-date").length;
        const pending = ecoPackages.filter(
          (p) => p.status === "patch" || p.status === "minor" || p.status === "major" || p.status === "failed"
        ).length;
        const pct = total > 0 ? Math.round((upToDate / total) * 100) : null;

        return {
          hasPackages: true,
          total,
          upToDate,
          pending,
          healthPct: pct,
          statusLabel:
            pct === null
              ? "No packages available"
              : pct >= 90
              ? "Optimal State"
              : pct >= 70
              ? "Updates Recommended"
              : "Action Required",
          badgeVariant:
            pct === null ? "empty" : pct >= 90 ? "optimal" : pct >= 70 ? "warning" : "critical",
          scopeLabel: `${eco.toUpperCase()} package compliance`,
        };
      }

      // Check matching environment totals if storePackages hasn't populated yet
      const matchingEnvs = environmentHealthList.filter(
        (e) => e.id.toLowerCase().includes(eco) || e.name.toLowerCase().includes(eco)
      );
      const totalFromEnvs = matchingEnvs.reduce((sum, e) => sum + e.total, 0);
      const upToDateFromEnvs = matchingEnvs.reduce((sum, e) => sum + e.upToDate, 0);
      const pendingFromEnvs = matchingEnvs.reduce((sum, e) => sum + e.pending, 0);

      if (totalFromEnvs === 0) {
        return {
          hasPackages: false,
          total: 0,
          upToDate: 0,
          pending: 0,
          healthPct: null,
          statusLabel: "No packages available",
          badgeVariant: "empty",
          scopeLabel: `${eco.toUpperCase()} package compliance`,
        };
      }

      const pct = Math.round((upToDateFromEnvs / totalFromEnvs) * 100);
      return {
        hasPackages: true,
        total: totalFromEnvs,
        upToDate: upToDateFromEnvs,
        pending: pendingFromEnvs,
        healthPct: pct,
        statusLabel:
          pct >= 90
            ? "Optimal State"
            : pct >= 70
            ? "Updates Recommended"
            : "Action Required",
        badgeVariant: pct >= 90 ? "optimal" : pct >= 70 ? "warning" : "critical",
        scopeLabel: `${eco.toUpperCase()} package compliance`,
      };
    }

    // C. Individual Discovered Virtual Environment
    if (selectedFilterKey.startsWith("venv:")) {
      const venvId = selectedFilterKey.slice(5);
      const targetVenv = discoveredVirtualEnvs.find((v) => v.id === venvId);
      const venvName = targetVenv?.name || "Virtual Environment";

      // 1. Check if an environment record exists in environmentHealthList
      const envEntry = environmentHealthList.find((e) => e.id === venvId);
      if (envEntry && envEntry.total > 0) {
        const pct = envEntry.healthPct;
        return {
          hasPackages: true,
          total: envEntry.total,
          upToDate: envEntry.upToDate,
          pending: envEntry.pending,
          healthPct: pct,
          statusLabel:
            pct === null
              ? "No packages available"
              : pct >= 90
              ? "Optimal State"
              : pct >= 70
              ? "Updates Recommended"
              : "Action Required",
          badgeVariant:
            pct === null ? "empty" : pct >= 90 ? "optimal" : pct >= 70 ? "warning" : "critical",
          scopeLabel: `${venvName} compliance`,
        };
      }

      // 2. Check storePackages filtered by this specific virtual environment
      const venvPackages = storePackages.filter(
        (p) =>
          String(p.environmentId) === venvId ||
          (p as any).envId === venvId ||
          (targetVenv?.path && (p as any).environmentPath === targetVenv.path)
      );

      if (venvPackages.length > 0) {
        const total = venvPackages.length;
        const upToDate = venvPackages.filter((p) => p.status === "up-to-date").length;
        const pending = venvPackages.filter(
          (p) => p.status === "patch" || p.status === "minor" || p.status === "major" || p.status === "failed"
        ).length;
        const pct = Math.round((upToDate / total) * 100);

        return {
          hasPackages: true,
          total,
          upToDate,
          pending,
          healthPct: pct,
          statusLabel:
            pct >= 90
              ? "Optimal State"
              : pct >= 70
              ? "Updates Recommended"
              : "Action Required",
          badgeVariant: pct >= 90 ? "optimal" : pct >= 70 ? "warning" : "critical",
          scopeLabel: `${venvName} compliance`,
        };
      }

      // Empty virtual environment
      return {
        hasPackages: false,
        total: 0,
        upToDate: 0,
        pending: 0,
        healthPct: null,
        statusLabel: "No packages available",
        badgeVariant: "empty",
        scopeLabel: `${venvName} compliance`,
      };
    }

    // D. Not Found Category (genuine unclassified / missing project path state)
    if (selectedFilterKey === "not-found") {
      const total = notFoundProjects.reduce((sum, p) => sum + (p.packageCount || 0), 0);
      return {
        hasPackages: false,
        total,
        upToDate: 0,
        pending: 0,
        healthPct: null,
        statusLabel: "Project path not found",
        badgeVariant: "empty",
        scopeLabel: "Unclassified project paths",
      };
    }

    // Fallback: Global
    return {
      hasPackages: resolvedTotalPkgs > 0,
      total: resolvedTotalPkgs,
      upToDate: resolvedUpToDate,
      pending: resolvedTotalPkgs - resolvedUpToDate,
      healthPct: healthyPct,
      statusLabel:
        healthyPct >= 90
          ? "Optimal State"
          : healthyPct >= 70
          ? "Updates Recommended"
          : "Action Required",
      badgeVariant: healthyPct >= 90 ? "optimal" : healthyPct >= 70 ? "warning" : "critical",
      scopeLabel: "Overall package compliance",
    };
  }, [
    selectedFilterKey,
    resolvedTotalPkgs,
    resolvedUpToDate,
    healthyPct,
    storePackages,
    environmentHealthList,
    discoveredVirtualEnvs,
    notFoundProjects,
  ]);

  // ── 5. Donut Segments for Package Health Overview ───────────────────────────
  const healthDonutData = useMemo(() => {
    return [
      { name: "Healthy", value: resolvedUpToDate, color: CHART_COLORS.healthy, key: "healthy" },
      { name: "Patch",   value: resolvedPatch,    color: CHART_COLORS.patch,   key: "patch" },
      { name: "Minor",   value: resolvedMinor,    color: CHART_COLORS.minor,   key: "minor" },
      { name: "Major",   value: resolvedMajor,    color: CHART_COLORS.major,   key: "major" },
      { name: "Failed",  value: resolvedFailed,   color: CHART_COLORS.failed,  key: "failed" },
    ];
  }, [resolvedUpToDate, resolvedPatch, resolvedMinor, resolvedMajor, resolvedFailed]);

  const activeDonutData = useMemo(() => {
    return healthDonutData.filter((d) => d.value > 0);
  }, [healthDonutData]);

  // ── 6. Deduplicate Recent Activity by Unique Record ID ─────────────────────
  const uniqueActivity = useMemo<HistoryEntry[]>(() => {
    if (!rawActivity || !Array.isArray(rawActivity)) return [];
    const seenIds = new Set<string | number>();
    const result: HistoryEntry[] = [];
    for (const entry of rawActivity) {
      const idKey = entry.id != null ? entry.id : `${entry.packageName}-${entry.updatedAt}-${entry.toVersion}`;
      if (!seenIds.has(idKey)) {
        seenIds.add(idKey);
        result.push(entry);
      }
    }
    return result;
  }, [rawActivity]);

  return (
    <div className="space-y-5 max-w-full">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-bold text-on-surface tracking-tight">Overview</h2>
          <p className="text-[12px] text-muted-foreground">Package security and health overview across all environments</p>
        </div>
      </div>

      {/* ── Top Section: Summary Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard
          label="Total Packages"
          value={resolvedTotalPkgs.toLocaleString()}
          icon="inventory_2"
          accent={CHART_COLORS.major}
          delta={{ value: "Synced", positive: true }}
        />
        <StatCard
          label="Environments"
          value={summary?.totalEnvironments ?? environmentHealthList.length}
          icon="layers"
          accent={CHART_COLORS.minor}
          delta={{ value: "Active", positive: true }}
        />
        <StatCard
          label="Virtual Envs"
          value={summary?.totalVenvs ?? 0}
          icon="terminal"
          accent={CHART_COLORS.patch}
        />
        <StatCard
          label="Up to Date"
          value={resolvedUpToDate.toLocaleString()}
          icon="check_circle"
          accent={CHART_COLORS.healthy}
          delta={{ value: `${healthyPct}%`, positive: true }}
        />
        <StatCard
          label="Critical Packages"
          value={criticalCount}
          icon="warning"
          isCritical={criticalCount > 0}
          delta={criticalCount > 0 ? { value: "Attention", positive: false } : undefined}
        />
      </div>

      {/* ── Middle Section: Circular Charts ───────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-4">

        {/* 1. Package Health Overview — Main Donut Chart */}
        <div className="md:col-span-2 xl:col-span-5 bg-surface-container-lowest border border-card-border rounded-xl p-5 shadow-[var(--shadow-premium)] flex flex-col justify-between">
          <div>
            <SectionHeader
              title="Package Health Overview"
              subtitle="Distribution across all tracked packages"
            />

            {/* Donut Chart with Centered Total Package Count */}
            <div className="relative h-[210px] w-full flex items-center justify-center my-1">
              {activeDonutData.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center opacity-40">
                  <span className="material-symbols-outlined text-[42px] text-muted-foreground mb-1">donut_large</span>
                  <p className="text-[12px] text-muted-foreground">No package data available</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={activeDonutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={66}
                        outerRadius={92}
                        dataKey="value"
                        paddingAngle={activeDonutData.length > 1 ? 3 : 0}
                        stroke="none"
                      >
                        {activeDonutData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<DonutTooltip total={resolvedTotalPkgs} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Content: Total Package Count */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[28px] font-extrabold text-on-surface leading-none tracking-tight">
                      {resolvedTotalPkgs.toLocaleString()}
                    </span>
                    <span className="text-[11px] font-medium text-muted-foreground mt-1">
                      Total Packages
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Clean Legend with Category Counts */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-3 border-t border-card-border mt-2">
            {healthDonutData.map((item) => (
              <div key={item.key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                <span className="text-[11px] text-muted-foreground font-medium">{item.name}</span>
                <span className="text-[11px] font-semibold text-on-surface">{item.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 2. Health Percentage — Standalone Circular Progress Indicator with Scoped Dropdown */}
        <div className="md:col-span-1 xl:col-span-3 bg-surface-container-lowest border border-card-border rounded-xl p-5 shadow-[var(--shadow-premium)] flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold text-on-surface leading-tight tracking-tight">
                  Health Percentage
                </h3>
                <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
                  {selectedScopeMetrics.scopeLabel}
                </p>
              </div>

              {/* Scope Selector Dropdown: Global, Ecosystems (PIP, NPM, PNPM), Virtual Envs, Not Found */}
              <div className="relative shrink-0">
                <select
                  id="health-percentage-scope"
                  aria-label="Filter Health Percentage by Scope"
                  value={selectedFilterKey}
                  onChange={(e) => setSelectedFilterKey(e.target.value)}
                  className="h-7 text-[11px] font-semibold bg-surface-container/50 hover:bg-surface-container border border-card-border rounded-md pl-2 pr-6 py-0 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors appearance-none max-w-[130px] sm:max-w-[155px] truncate"
                >
                  <option value="global">Global View</option>

                  <optgroup label="Ecosystems">
                    <option value="eco:pip">PIP</option>
                    <option value="eco:npm">NPM</option>
                    <option value="eco:pnpm">PNPM</option>
                  </optgroup>

                  {discoveredVirtualEnvs.length > 0 && (
                    <optgroup label="Virtual Environments">
                      {discoveredVirtualEnvs.map((venv) => (
                        <option key={venv.id} value={`venv:${venv.id}`}>
                          {venv.name}
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {hasNotFoundState && (
                    <optgroup label="Unclassified">
                      <option value="not-found">Not Found</option>
                    </optgroup>
                  )}
                </select>
                <span className="material-symbols-outlined text-[14px] text-muted-foreground absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  expand_more
                </span>
              </div>
            </div>

            {/* Circular Progress Indicator with Centered Percentage or Empty State */}
            <div className="flex flex-col items-center justify-center py-2">
              {selectedScopeMetrics.hasPackages && selectedScopeMetrics.healthPct !== null ? (
                <CircularProgress
                  percentage={selectedScopeMetrics.healthPct}
                  size={146}
                  strokeWidth={12}
                  color={
                    selectedScopeMetrics.healthPct >= 80
                      ? CHART_COLORS.healthy
                      : selectedScopeMetrics.healthPct >= 60
                      ? "#F59E0B"
                      : CHART_COLORS.failed
                  }
                >
                  <span className="text-[32px] font-extrabold text-on-surface leading-none tracking-tight">
                    {selectedScopeMetrics.healthPct}%
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                    Healthy
                  </span>
                </CircularProgress>
              ) : (
                <div className="w-[146px] h-[146px] rounded-full border-2 border-dashed border-card-border flex flex-col items-center justify-center bg-surface-container/30">
                  <span className="text-[26px] font-bold text-muted-foreground leading-none">
                    N/A
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">
                    No Data
                  </span>
                </div>
              )}

              {/* Concise Health Status Rating */}
              <div className="mt-4">
                <span
                  className={cn(
                    "text-[11px] font-semibold px-3 py-1 rounded-full border",
                    selectedScopeMetrics.badgeVariant === "optimal"
                      ? "bg-[#10B981]/15 text-[#047857] border-[#10B981]/30"
                      : selectedScopeMetrics.badgeVariant === "warning"
                      ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
                      : selectedScopeMetrics.badgeVariant === "critical"
                      ? "bg-destructive/15 text-destructive border-destructive/30"
                      : "bg-muted text-muted-foreground border-card-border"
                  )}
                >
                  {selectedScopeMetrics.statusLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Up to Date vs Pending Updates Summary for Selected Scope */}
          <div className="grid grid-cols-2 gap-2 pt-3 border-t border-card-border text-center">
            <div className="p-2 rounded-lg bg-surface-container/30">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                Up to Date
              </span>
              <span className="text-[16px] font-bold text-[#047857]">
                {selectedScopeMetrics.upToDate.toLocaleString()}
              </span>
            </div>
            <div className="p-2 rounded-lg bg-surface-container/30">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                Pending Updates
              </span>
              <span className="text-[16px] font-bold text-on-surface">
                {selectedScopeMetrics.pending.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Environment Health — Distinct Environment Comparison */}
        <div className="md:col-span-1 xl:col-span-4 bg-surface-container-lowest border border-card-border rounded-xl p-5 shadow-[var(--shadow-premium)] flex flex-col justify-between">
          <div>
            <SectionHeader
              title="Environment Health"
              subtitle="Package health per environment"
              action={
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-surface-container text-muted-foreground border border-card-border">
                  {environmentHealthList.length} {environmentHealthList.length === 1 ? "Env" : "Envs"}
                </span>
              }
            />

            {/* List of Environments (each actual environment rendered once) */}
            {environmentHealthList.length === 0 ? (
              <div className="h-[210px] flex flex-col items-center justify-center opacity-40">
                <span className="material-symbols-outlined text-[40px] text-muted-foreground mb-1">layers</span>
                <p className="text-[12px] text-muted-foreground">No environment data found</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                {environmentHealthList.map((env) => {
                  const hasPackages = env.total > 0;

                  return (
                    <div
                      key={env.id}
                      className="p-3 rounded-lg border border-card-border bg-surface-container/20 hover:bg-surface-container/50 transition-colors flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Circular Indicator for Environment Health */}
                        {hasPackages && env.healthPct !== null ? (
                          <CircularProgress
                            percentage={env.healthPct}
                            size={44}
                            strokeWidth={4.5}
                            color={
                              env.healthPct >= 90
                                ? CHART_COLORS.healthy
                                : env.healthPct >= 70
                                ? "#F59E0B"
                                : CHART_COLORS.failed
                            }
                          >
                            <span className="text-[10px] font-bold text-on-surface leading-none">
                              {env.healthPct}%
                            </span>
                          </CircularProgress>
                        ) : (
                          <div className="w-[44px] h-[44px] rounded-full border-2 border-dashed border-card-border flex items-center justify-center shrink-0 bg-surface-container/40 text-muted-foreground">
                            <span className="text-[12px] font-mono leading-none">—</span>
                          </div>
                        )}

                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-on-surface truncate capitalize">
                            {env.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {hasPackages
                              ? `${env.total} ${env.total === 1 ? "package" : "packages"} • ${env.upToDate} healthy`
                              : "0 packages"}
                          </p>
                        </div>
                      </div>

                      {/* Status / Update Badge */}
                      <div className="shrink-0 text-right">
                        {!hasPackages ? (
                          <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-card-border">
                            No packages
                          </span>
                        ) : env.pending === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#047857] border border-[#10B981]/20">
                            <span className="material-symbols-outlined text-[11px]">check</span>
                            Optimal
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                              env.hasCritical
                                ? "bg-destructive/15 text-destructive border-destructive/20"
                                : "bg-amber-500/15 text-amber-700 border-amber-500/20"
                            )}
                          >
                            {env.pending} {env.pending === 1 ? "update" : "updates"}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Environments Summary */}
          <div className="pt-3 border-t border-card-border mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Active environments</span>
            <span className="font-semibold text-on-surface">
              {environmentHealthList.filter((e) => e.total > 0 && e.pending === 0).length} of{" "}
              {environmentHealthList.filter((e) => e.total > 0).length} fully up to date
            </span>
          </div>
        </div>
      </div>

      {/* ── Bottom Section: Detailed Information ──────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">

        {/* 4. Status Distribution — Focused Detailed Breakdown by Status */}
        <div className="xl:col-span-4 bg-surface-container-lowest border border-card-border rounded-xl p-5 shadow-[var(--shadow-premium)]">
          <SectionHeader
            title="Status Distribution"
            subtitle="Detailed breakdown by status & percentage share"
          />

          <div className="flex flex-col sm:flex-row xl:flex-col gap-4 items-center">
            {/* Compact Category Distribution Ring */}
            <div className="relative w-[120px] h-[120px] shrink-0">
              {activeDonutData.length === 0 ? (
                <div className="w-full h-full rounded-full bg-muted flex items-center justify-center">
                  <span className="material-symbols-outlined text-[28px] text-muted-foreground">donut_large</span>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={activeDonutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={54}
                        dataKey="value"
                        strokeWidth={0}
                        paddingAngle={activeDonutData.length > 1 ? 2 : 0}
                      >
                        {activeDonutData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<DonutTooltip total={resolvedTotalPkgs} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Distinct Center Label */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface leading-none">
                      Status
                    </span>
                    <span className="text-[9px] text-muted-foreground mt-0.5">
                      Share
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Granular Status Proportions with Package Counts and Progress Bars */}
            <div className="w-full space-y-2.5">
              {[
                { label: "Healthy", value: resolvedUpToDate, color: CHART_COLORS.healthy },
                { label: "Patch",   value: resolvedPatch,    color: CHART_COLORS.patch },
                { label: "Minor",   value: resolvedMinor,    color: CHART_COLORS.minor },
                { label: "Major",   value: resolvedMajor,    color: CHART_COLORS.major },
                { label: "Failed",  value: resolvedFailed,   color: CHART_COLORS.failed },
              ].map((item) => {
                const pct = resolvedTotalPkgs > 0 ? Math.round((item.value / resolvedTotalPkgs) * 100) : 0;
                return (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between text-[12px]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="font-medium text-muted-foreground">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-on-surface">{item.value.toLocaleString()}</span>
                        <span className="text-[11px] text-muted-foreground/75 w-8 text-right font-mono">{pct}%</span>
                      </div>
                    </div>
                    {/* Visual Progress Bar */}
                    <div className="w-full h-1.5 rounded-full bg-surface-container overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* 5. Recent Activity Table — Real Deduplicated Records */}
        <div className="xl:col-span-8 bg-surface-container-lowest border border-card-border rounded-xl shadow-[var(--shadow-premium)] flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h3 className="text-[14px] font-semibold text-on-surface leading-tight tracking-tight">Recent Activity</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5">Latest package updates across environments</p>
            </div>
            <Link href="/history">
              <button className="text-[12px] font-semibold text-primary hover:underline underline-offset-2 transition-all flex items-center gap-1 cursor-pointer">
                See All <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </Link>
          </div>

          {/* Table Header */}
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_80px_80px] gap-3 px-5 py-2.5 border-y border-card-border bg-surface-container/30">
            {["Package / Project", "Ecosystem", "Version", "Status", "Time"].map((h) => (
              <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {h}
              </span>
            ))}
          </div>

          {/* Table Body */}
          <div className="flex-1 overflow-y-auto divide-y divide-card-border max-h-[380px]">
            {activityLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 bg-surface-container animate-pulse rounded-lg" />
                ))}
              </div>
            ) : !uniqueActivity.length ? (
              <div className="flex flex-col items-center justify-center py-12 opacity-50">
                <span className="material-symbols-outlined text-[40px] text-muted-foreground mb-2">history</span>
                <p className="text-[13px] font-medium text-muted-foreground">No recent activity</p>
              </div>
            ) : (
              uniqueActivity.map((entry: HistoryEntry) => {
                const isSuccess =
                  entry.status?.toLowerCase() === "success" ||
                  entry.status === "LIVE" ||
                  entry.status === "SYNCED";
                const isRemoved = entry.toVersion === "removed";
                const isInstalled = entry.toVersion === "installed";
                const recordKey = entry.id ?? `${entry.packageName}-${entry.updatedAt}-${entry.toVersion}`;

                return (
                  <div
                    key={recordKey}
                    className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_80px_80px] gap-3 px-5 py-3 hover:bg-surface-container/40 transition-colors cursor-pointer group items-center"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-[15px]">
                        {ecosystemIcon[entry.ecosystem] ?? "📦"}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-semibold text-on-surface truncate group-hover:text-primary transition-colors">
                          {entry.packageName}
                        </span>
                        {entry.errorMessage && (
                          <span className="text-[10px] text-destructive truncate font-medium">
                            {entry.errorMessage}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[12px] text-muted-foreground capitalize truncate">
                      {entry.ecosystem}
                    </span>
                    <span className="text-[11px] font-mono text-muted-foreground truncate">
                      {entry.fromVersion}
                      <span className="text-muted-foreground/40 mx-1">→</span>
                      <span
                        className={cn(
                          isRemoved
                            ? "text-destructive font-semibold"
                            : isInstalled
                            ? "text-[#047857] font-semibold"
                            : "text-on-surface font-medium"
                        )}
                      >
                        {entry.toVersion}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full w-fit",
                        isSuccess
                          ? "text-[#047857] bg-[#10B981]/15 border border-[#10B981]/30"
                          : "bg-destructive/10 text-destructive border border-destructive/20"
                      )}
                    >
                      {entry.status}
                    </span>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(new Date(entry.updatedAt).getTime())}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
