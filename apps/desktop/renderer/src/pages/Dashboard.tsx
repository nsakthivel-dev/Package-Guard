import React, { useState } from "react";
import { Link } from "wouter";
import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useGetStatusBreakdown,
  getGetDashboardSummaryQueryKey,
  StatusBreakdown,
  HistoryEntry,
} from "@packageguard/api-client-react";
import { ecosystemIcon } from "@/lib/statusColors";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip as RechartsTooltip,
  Cell, PieChart, Pie,
} from "recharts";

// ─── Palette ─────────────────────────────────────────────────────────────────
// Cool blue-teal-indigo palette (matching the reference image)
const PALETTE = {
  healthy:  "#5EEAD4", // teal/mint    (top)
  patch:    "#67E8F9", // light cyan
  minor:    "#818CF8", // periwinkle/lavender
  major:    "#6366F1", // indigo
  failed:   "#312E81", // deep navy    (bottom)
  unknown:  "#A5B4FC", // soft purple
};

const STATUS_ORDER: BarGroupKey[] = ["failed", "major", "minor", "patch", "healthy"];

type DateRange = "7d" | "30d" | "90d";

// ─── Custom stacked-pill chart with flow connectors ───────────────────────

interface BarGroup {
  name: string;
  healthy: number;
  patch: number;
  minor: number;
  major: number;
  failed: number;
}

type BarGroupKey = Exclude<keyof BarGroup, "name">;

interface SegmentRect {
  x: number; y: number; w: number; h: number; color: string; value: number; key: string;
}

const GAP = 6;          // px gap between pill segments
const CORNER = 7;       // pill corner radius
const BAR_W = 52;       // bar width
const CHART_H = 220;    // svg height
const LABEL_H = 28;     // room for label above bar
const CONNECTOR_OPACITY = 0.13;

function computeSegments(groups: BarGroup[], svgWidth: number): SegmentRect[][] {
  const maxTotal = Math.max(...groups.map(g =>
    STATUS_ORDER.reduce((s, k) => s + (g[k] ?? 0), 0)
  ), 1);
  const usableH = CHART_H - LABEL_H - 24; // leave bottom padding
  const slotW = svgWidth / groups.length;

  return groups.map((g, i) => {
    const total = STATUS_ORDER.reduce((s, k) => s + (g[k] ?? 0), 0);
    const cx = slotW * i + slotW / 2;
    const x = cx - BAR_W / 2;
    const segCount = STATUS_ORDER.filter(k => (g[k] ?? 0) > 0).length;
    const totalGaps = Math.max(segCount - 1, 0) * GAP;
    const availH = usableH - totalGaps;

    let yOffset = LABEL_H + usableH; // start from bottom
    const rects: SegmentRect[] = [];

    STATUS_ORDER.forEach((key) => {
      const val = g[key] ?? 0;
      if (val === 0) return;
      const h = total > 0 ? Math.max(Math.round((val / maxTotal) * availH), 6) : 0;
      yOffset -= h;
      rects.push({ x, y: yOffset, w: BAR_W, h, color: PALETTE[key as keyof typeof PALETTE], value: val, key });
      yOffset -= GAP;
    });

    return rects;
  });
}

function FlowConnectors({ groups, segmentSets, svgWidth }: {
  groups: BarGroup[];
  segmentSets: SegmentRect[][];
  svgWidth: number;
}) {
  const paths: React.ReactNode[] = [];

  for (let i = 0; i < segmentSets.length - 1; i++) {
    const leftSegs = segmentSets[i];
    const rightSegs = segmentSets[i + 1];

    STATUS_ORDER.forEach((key) => {
      const ls = leftSegs.find(s => s.key === key);
      const rs = rightSegs.find(s => s.key === key);
      if (!ls || !rs) return;

      const x1 = ls.x + ls.w;
      const y1top = ls.y;
      const y1bot = ls.y + ls.h;
      const x2 = rs.x;
      const y2top = rs.y;
      const y2bot = rs.y + rs.h;
      const mx = (x1 + x2) / 2;

      const d = [
        `M ${x1} ${y1top}`,
        `C ${mx} ${y1top}, ${mx} ${y2top}, ${x2} ${y2top}`,
        `L ${x2} ${y2bot}`,
        `C ${mx} ${y2bot}, ${mx} ${y1bot}, ${x1} ${y1bot}`,
        "Z",
      ].join(" ");

      paths.push(
        <path key={`${key}-${i}`} d={d} fill={ls.color} opacity={CONNECTOR_OPACITY} />
      );
    });
  }

  return <>{paths}</>;
}

function PillBar({ rects, total }: { rects: SegmentRect[]; total: number }) {
  if (!rects.length) return null;
  const topSeg = rects[rects.length - 1];
  const labelY = topSeg.y - 6;
  const cx = topSeg.x + topSeg.w / 2;

  return (
    <g>
      {/* Total label */}
      <text x={cx} y={labelY} textAnchor="middle" fontSize={11} fontWeight={600} fill="currentColor" className="text-on-surface" opacity={0.7}>
        {total}
      </text>
      {rects.map((seg) => (
        <rect
          key={seg.key}
          x={seg.x} y={seg.y}
          width={seg.w} height={seg.h}
          rx={CORNER} ry={CORNER}
          fill={seg.color}
        />
      ))}
    </g>
  );
}

function HealthOverviewChart({ groups }: { groups: BarGroup[] }) {
  const [svgWidth, setSvgWidth] = useState(600);
  const ref = React.useRef<SVGSVGElement>(null);

  React.useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSvgWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!groups.length) {
    return (
      <div className="h-full flex flex-col items-center justify-center opacity-40">
        <span className="material-symbols-outlined text-[40px] text-muted-foreground mb-2">bar_chart</span>
        <p className="text-[12px] text-muted-foreground">No environment data yet</p>
      </div>
    );
  }

  const segmentSets = computeSegments(groups, svgWidth);
  const slotW = svgWidth / groups.length;

  return (
    <svg ref={ref} width="100%" height={CHART_H} className="overflow-visible">
      {/* Flow connectors (behind bars) */}
      <FlowConnectors groups={groups} segmentSets={segmentSets} svgWidth={svgWidth} />

      {/* Bars */}
      {segmentSets.map((rects, i) => {
        const g = groups[i];
        const total = STATUS_ORDER.reduce((s, k) => s + (g[k] ?? 0), 0);
        return <PillBar key={g.name} rects={rects} total={total} />;
      })}

      {/* X-axis labels */}
      {groups.map((g, i) => {
        const cx = slotW * i + slotW / 2;
        return (
          <text
            key={g.name} x={cx} y={CHART_H - 2}
            textAnchor="middle" fontSize={11} fontWeight={500}
            fill="hsl(var(--muted-foreground))"
          >
            {g.name}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildBarGroups(breakdown: StatusBreakdown[] | undefined): BarGroup[] {
  if (!breakdown?.length) return [];
  return breakdown.map((env) => ({
    name: env.environmentName.length > 9 ? env.environmentName.slice(0, 9) + "…" : env.environmentName,
    healthy: env.upToDate,
    patch: env.patch,
    minor: env.minor,
    major: env.major,
    failed: env.failed,
  }));
}

function buildBarData(breakdown: StatusBreakdown[] | undefined) {
  if (!breakdown?.length) return [];
  return breakdown.map((env) => ({
    name: env.environmentName.length > 6 ? env.environmentName.slice(0, 6) : env.environmentName,
    total: env.upToDate + env.patch + env.minor + env.major + env.failed + env.unknown,
    healthy: env.upToDate,
  }));
}

function buildDonutData(summary: any) {
  return [
    { name: "Healthy", value: summary?.upToDate ?? 0,      color: PALETTE.healthy },
    { name: "Patch",   value: summary?.patchUpdates ?? 0,  color: PALETTE.patch },
    { name: "Minor",   value: summary?.minorUpdates ?? 0,  color: PALETTE.minor },
    { name: "Major",   value: summary?.majorUpdates ?? 0,  color: PALETTE.major },
    { name: "Failed",  value: summary?.failedUpdates ?? 0, color: PALETTE.failed },
  ].filter((d) => d.value > 0);
}

// ─── Custom recharts tooltip ──────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-container-lowest border border-card-border rounded-lg p-3 shadow-xl text-[12px]">
      <p className="font-semibold text-on-surface mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 justify-between">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-on-surface ml-4">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number | string;
  icon: string;
  delta?: { value: string; positive: boolean };
  accent?: string;
  isCritical?: boolean;
}

function StatCard({ label, value, icon, delta, accent, isCritical }: StatCardProps) {
  return (
    <div className="bg-surface-container-lowest border border-card-border rounded-xl p-4 shadow-[var(--shadow-premium)] hover:shadow-[var(--shadow-premium-hover)] transition-all cursor-pointer group flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground leading-none">{label}</span>
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
            isCritical ? "bg-destructive/10 text-destructive" : accent ? "" : "bg-muted text-muted-foreground"
          )}
          style={accent ? { backgroundColor: `${accent}1a`, color: accent } : undefined}
        >
          <span className="material-symbols-outlined text-[17px]">{icon}</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className={cn("text-[26px] font-bold leading-none tracking-tight", isCritical ? "text-destructive" : "text-on-surface")}>
          {value}
        </span>
        {delta && (
          <span className={cn(
            "inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-md mb-0.5",
            delta.positive ? "bg-[#5EEAD4]/15 text-[#0f766e]" : "bg-destructive/10 text-destructive"
          )}>
            <span className="material-symbols-outlined text-[12px]">{delta.positive ? "trending_up" : "trending_down"}</span>
            {delta.value}
          </span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
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

// ─── Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [dateRange, setDateRange] = useState<DateRange>("30d");

  const { data: summary } = useGetDashboardSummary({
    query: { queryKey: getGetDashboardSummaryQueryKey(), refetchInterval: 10000 },
  });
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ limit: 8 });
  const { data: breakdown } = useGetStatusBreakdown();

  const barGroups  = buildBarGroups(breakdown);
  const barData    = buildBarData(breakdown);
  const donutData  = buildDonutData(summary);
  const totalPkgs  = summary?.totalPackages ?? 0;
  const healthyPct = totalPkgs > 0 ? Math.round(((summary?.upToDate ?? 0) / totalPkgs) * 100) : 0;

  const DATE_RANGES: { label: string; value: DateRange }[] = [
    { label: "7 Days", value: "7d" },
    { label: "30 Days", value: "30d" },
    { label: "90 Days", value: "90d" },
  ];

  return (
    <div className="space-y-5 max-w-full">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] text-muted-foreground">Package security overview across all environments</p>
        <div className="flex items-center gap-1 bg-surface-container border border-card-border rounded-lg p-0.5">
          {DATE_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => setDateRange(r.value)}
              className={cn(
                "px-3 py-1.5 text-[12px] font-medium rounded-md transition-all",
                dateRange === r.value
                  ? "bg-surface-container-lowest text-on-surface shadow-[var(--shadow-premium)]"
                  : "text-muted-foreground hover:text-on-surface"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stat cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
        <StatCard label="Total Packages"  value={(summary?.totalPackages ?? 0).toLocaleString()} icon="inventory_2"   accent={PALETTE.major}   delta={{ value: "Synced", positive: true }} />
        <StatCard label="Environments"    value={summary?.totalEnvironments ?? 0}                icon="layers"        accent={PALETTE.minor}   delta={{ value: "Active", positive: true }} />
        <StatCard label="Virtual Envs"    value={summary?.totalVenvs ?? 0}                       icon="terminal"      accent={PALETTE.patch} />
        <StatCard label="Up to Date"      value={summary?.upToDate ?? 0}                         icon="check_circle"  accent={PALETTE.healthy} delta={{ value: `${healthyPct}%`, positive: true }} />
        <StatCard label="Critical"        value={summary?.majorUpdates ?? 0}                     icon="warning"       isCritical
          delta={(summary?.majorUpdates ?? 0) > 0 ? { value: "Attention", positive: false } : undefined}
        />
      </div>

      {/* ── Middle row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Package Health Overview — custom stacked-pill + flow chart */}
        <div className="xl:col-span-8 bg-surface-container-lowest border border-card-border rounded-xl p-5 shadow-[var(--shadow-premium)]">
          <SectionHeader
            title="Package Health Overview"
            subtitle="Status distribution across environments"
            action={
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#5EEAD4] animate-pulse" />
                <span className="text-[11px] font-medium text-muted-foreground">Live</span>
              </div>
            }
          />

          {/* Legend */}
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mb-4">
            {([ 
              { key: "healthy", label: "Healthy" },
              { key: "patch",   label: "Patch" },
              { key: "minor",   label: "Minor" },
              { key: "major",   label: "Major" },
              { key: "failed",  label: "Failed" },
            ] as { key: keyof typeof PALETTE; label: string }[]).map((item) => (
              <div key={item.key} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PALETTE[item.key] }} />
                <span className="text-[11px] font-medium text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="h-[240px]">
            <HealthOverviewChart groups={barGroups} />
          </div>
        </div>

        {/* Packages per Env bar chart */}
        <div className="xl:col-span-4 bg-surface-container-lowest border border-card-border rounded-xl p-5 shadow-[var(--shadow-premium)]">
          <SectionHeader title="Packages per Env" subtitle="Total vs. healthy count" />
          <div className="mb-4 flex items-center gap-2">
            <span className="text-[28px] font-bold text-on-surface leading-none">{summary?.totalEnvironments ?? 0}</span>
            <div className="flex flex-col">
              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md leading-none mb-1" style={{ background: `${PALETTE.healthy}20`, color: "#0f766e" }}>
                +{healthyPct}% healthy
              </span>
              <span className="text-[11px] text-muted-foreground">environments</span>
            </div>
          </div>
          <div className="h-[180px]">
            {barData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-40">
                <span className="material-symbols-outlined text-[40px] text-muted-foreground mb-2">analytics</span>
                <p className="text-[12px] text-muted-foreground">No data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <RechartsTooltip content={<ChartTooltip />} />
                  <Bar dataKey="total"   name="Total"   radius={[4,4,0,0]} fill={PALETTE.minor}   maxBarSize={32} fillOpacity={0.4} />
                  <Bar dataKey="healthy" name="Healthy" radius={[4,4,0,0]} fill={PALETTE.healthy} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-3 flex items-center gap-4 pt-3 border-t border-card-border">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: `${PALETTE.minor}66` }} />
              <span className="text-[11px] text-muted-foreground">Total</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PALETTE.healthy }} />
              <span className="text-[11px] text-muted-foreground">Healthy</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">

        {/* Donut */}
        <div className="xl:col-span-4 bg-surface-container-lowest border border-card-border rounded-xl p-5 shadow-[var(--shadow-premium)]">
          <SectionHeader title="Status Distribution" subtitle="By package count" />
          <div className="flex items-center gap-4">
            <div className="relative w-[120px] h-[120px] shrink-0">
              {donutData.length === 0 ? (
                <div className="w-full h-full rounded-full bg-muted flex items-center justify-center">
                  <span className="material-symbols-outlined text-[28px] text-muted-foreground">donut_large</span>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={36} outerRadius={56} dataKey="value" strokeWidth={0} paddingAngle={2}>
                        {donutData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-[20px] font-bold text-on-surface leading-none">{healthyPct}%</span>
                    <span className="text-[10px] text-muted-foreground mt-0.5">healthy</span>
                  </div>
                </>
              )}
            </div>
            <div className="flex-1 space-y-2">
              {[
                { label: "Healthy", value: summary?.upToDate ?? 0,               color: PALETTE.healthy },
                { label: "Patch",   value: (summary as any)?.patchUpdates ?? 0,  color: PALETTE.patch },
                { label: "Minor",   value: (summary as any)?.minorUpdates ?? 0,  color: PALETTE.minor },
                { label: "Major",   value: summary?.majorUpdates ?? 0,            color: PALETTE.major },
                { label: "Failed",  value: (summary as any)?.failedUpdates ?? 0, color: PALETTE.failed },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-[12px] text-muted-foreground flex-1">{item.label}</span>
                  <span className="text-[12px] font-semibold text-on-surface">{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Activity table */}
        <div className="xl:col-span-8 bg-surface-container-lowest border border-card-border rounded-xl shadow-[var(--shadow-premium)] flex flex-col">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h3 className="text-[14px] font-semibold text-on-surface leading-none">Recent Activity</h3>
              <p className="text-[12px] text-muted-foreground mt-1">Latest package updates</p>
            </div>
            <Link href="/history">
              <button className="text-[12px] font-medium text-primary hover:underline underline-offset-2 transition-all flex items-center gap-1">
                See All <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </Link>
          </div>
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_80px_80px] gap-3 px-5 py-2 border-y border-card-border bg-surface-container/40">
            {["Package","Ecosystem","Version","Status","Time"].map((h) => (
              <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{h}</span>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-card-border">
            {activityLoading ? (
              <div className="p-4 space-y-2">
                {[1,2,3,4,5].map((i) => <div key={i} className="h-10 bg-surface-container animate-pulse rounded-lg" />)}
              </div>
            ) : !activity?.length ? (
              <div className="flex flex-col items-center justify-center py-12 opacity-50">
                <span className="material-symbols-outlined text-[40px] text-muted-foreground mb-2">history</span>
                <p className="text-[13px] font-medium text-muted-foreground">No activity yet</p>
              </div>
            ) : (
              activity.map((entry: HistoryEntry) => (
                <div key={entry.id} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_80px_80px] gap-3 px-5 py-3 hover:bg-surface-container/50 transition-colors cursor-pointer group items-center">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-[15px]">
                      {ecosystemIcon[entry.ecosystem] ?? "📦"}
                    </div>
                    <span className="text-[13px] font-semibold text-on-surface truncate group-hover:text-primary transition-colors">{entry.packageName}</span>
                  </div>
                  <span className="text-[12px] text-muted-foreground capitalize truncate">{entry.ecosystem}</span>
                  <span className="text-[11px] font-mono text-muted-foreground truncate">
                    {entry.fromVersion}<span className="text-muted-foreground/40 mx-1">→</span>{entry.toVersion}
                  </span>
                  <span className={cn(
                    "inline-flex items-center justify-center text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full w-fit",
                    entry.status === "LIVE"
                      ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                      : entry.status === "SYNCED"
                      ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                      : entry.status === "success"
                      ? "text-[#0f766e]"
                      : "bg-destructive/10 text-destructive"
                  )}
                  style={entry.status === "success" ? { background: `${PALETTE.healthy}20` } : undefined}
                  >
                    {entry.status}
                  </span>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(new Date(entry.updatedAt).getTime())}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
