import { RefreshCw, Package, Server, TrendingUp, AlertTriangle } from "lucide-react";
import { useGetDashboardSummary, useGetRecentActivity, useGetStatusBreakdown } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { HistoryStatusBadge, StatusBadge } from "@/components/StatusBadge";
import { ecosystemIcon } from "@/lib/statusColors";
import { formatDistanceToNow } from "date-fns";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-card border border-card-border rounded-lg p-4" data-testid={`stat-card-${label.toLowerCase().replace(/\s/g, '-')}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={`p-1.5 rounded-md ${color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ limit: 8 });
  const { data: breakdown } = useGetStatusBreakdown();

  const chartData = breakdown?.map((env) => ({
    name: env.environmentName,
    "Up to date": env.upToDate,
    Patch: env.patch,
    Minor: env.minor,
    Major: env.major,
    Failed: env.failed,
    Unknown: env.unknown,
  })) ?? [];

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          {summary?.lastScanAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Last scan {formatDistanceToNow(new Date(summary.lastScanAt), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 bg-card border border-card-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Packages" value={summary?.totalPackages ?? 0} icon={Package} color="bg-primary/10 text-primary" />
          <StatCard label="Environments" value={summary?.totalEnvironments ?? 0} icon={Server} color="bg-chart-5/10 text-chart-5" />
          <StatCard label="Up to Date" value={summary?.upToDate ?? 0} icon={TrendingUp} color="bg-emerald-500/10 text-emerald-400" />
          <StatCard label="Needs Update" value={summary?.needsUpdate ?? 0} icon={RefreshCw} color="bg-amber-500/10 text-amber-400" />
          <StatCard label="Patch Updates" value={summary?.patchUpdates ?? 0} icon={Package} color="bg-blue-500/10 text-blue-400" />
          <StatCard label="Minor Updates" value={summary?.minorUpdates ?? 0} icon={Package} color="bg-amber-500/10 text-amber-400" />
          <StatCard label="Major Updates" value={summary?.majorUpdates ?? 0} icon={AlertTriangle} color="bg-red-500/10 text-red-400" />
          <StatCard label="Failed" value={summary?.failedPackages ?? 0} icon={AlertTriangle} color="bg-red-600/10 text-red-400" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown Chart */}
        <div className="bg-card border border-card-border rounded-lg p-4" data-testid="status-breakdown-chart">
          <h2 className="text-sm font-semibold text-foreground mb-4">Status by Environment</h2>
          {chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No environments found. Add an environment to get started.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 12,
                    color: "hsl(var(--foreground))",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Up to date" stackId="a" fill="#10b981" />
                <Bar dataKey="Patch" stackId="a" fill="#3b82f6" />
                <Bar dataKey="Minor" stackId="a" fill="#f59e0b" />
                <Bar dataKey="Major" stackId="a" fill="#ef4444" />
                <Bar dataKey="Failed" stackId="a" fill="#dc2626" />
                <Bar dataKey="Unknown" stackId="a" fill="#6b7280" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Recent Activity */}
        <div className="bg-card border border-card-border rounded-lg p-4" data-testid="recent-activity">
          <h2 className="text-sm font-semibold text-foreground mb-4">Recent Activity</h2>
          {activityLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : !activity?.length ? (
            <div className="text-sm text-muted-foreground text-center py-8">No update history yet.</div>
          ) : (
            <div className="space-y-2">
              {activity.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`activity-entry-${entry.id}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base flex-shrink-0">{ecosystemIcon[entry.ecosystem] ?? "📦"}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{entry.packageName}</p>
                      <p className="text-xs text-muted-foreground">{entry.fromVersion} → {entry.toVersion}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <HistoryStatusBadge status={entry.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
