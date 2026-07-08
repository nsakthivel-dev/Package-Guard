import React from "react";
import { Link } from "wouter";
import {
  useGetDashboardSummary,
  useGetRecentActivity,
  useGetStatusBreakdown,
  getGetDashboardSummaryQueryKey,
  StatusBreakdown,
  HistoryEntry,
} from "@workspace/api-client-react";
import { ecosystemIcon } from "@/lib/statusColors";
import { runAutoScan } from "@/lib/autoScan";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function StatCard({ label, value, icon, iconColor, bgColor }: { label: string; value: number | string; icon: string; iconColor: string; bgColor: string }) {
  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant hover:shadow-xl hover:shadow-primary/5 transition-all group cursor-pointer">
      <div className="flex items-center justify-between mb-4">
        <span className="font-label-caps text-label-caps text-on-surface-variant/70 uppercase tracking-widest">{label}</span>
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110", bgColor, iconColor)}>
          <span className="material-symbols-outlined text-[24px]">{icon}</span>
        </div>
      </div>
      <div className="font-display-lg text-display-lg font-bold text-primary leading-tight">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { data: summary } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      refetchInterval: 10000
    }
  });
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ 
    limit: 6 
  });
  const { data: breakdown } = useGetStatusBreakdown();

  return (
    <div className="space-y-spacing-stack-lg animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-spacing-stack-lg">
        <h3 className="font-title-md text-title-md text-on-surface-variant">Security Overview</h3>
        <div className="flex gap-2">
          <button className="p-2 hover:bg-surface-container rounded-lg transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">filter_list</span>
          </button>
          <button className="p-2 hover:bg-surface-container rounded-lg transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">grid_view</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-spacing-gutter">
        <StatCard label="Total Packages" value={summary?.totalPackages ?? 0} icon="package_2" iconColor="text-primary" bgColor="bg-primary/10" />
        <StatCard label="Environments" value={summary?.totalEnvironments ?? 0} icon="terminal" iconColor="text-primary" bgColor="bg-primary/10" />
        <StatCard label="Virtual Envs" value={summary?.totalVenvs ?? 0} icon="box" iconColor="text-secondary" bgColor="bg-secondary/10" />
        <StatCard label="Healthy" value={summary?.upToDate ?? 0} icon="check_circle" iconColor="text-secondary" bgColor="bg-secondary/10" />
        <StatCard label="Critical Updates" value={summary?.majorUpdates ?? 0} icon="warning" iconColor="text-error" bgColor="bg-error/10" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-spacing-gutter items-stretch pt-spacing-stack-lg">
        {/* Status by Environment */}
        <div className="xl:col-span-7 bg-surface-container-lowest border border-outline-variant p-8 rounded-xl shadow-sm h-full">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-title-md text-title-md text-primary">Status by Environment</h3>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[12px] font-label-caps text-on-surface-variant">Live Analysis</span>
            </div>
          </div>
          <div className="flex items-end justify-around h-[280px] border-b border-outline-variant/30 pb-8 relative">
            {/* Y Axis Labels Mock */}
            <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-[11px] text-on-surface-variant/30 font-label-caps">
              <span>100%</span>
              <span>75%</span>
              <span>50%</span>
              <span>25%</span>
              <span>0%</span>
            </div>
            
            <TooltipProvider delayDuration={0}>
              {breakdown?.map((env: StatusBreakdown) => {
                const total = env.upToDate + env.patch + env.minor + env.major + env.failed + env.unknown;
                const getPercent = (total > 0 ? (val: number) => (val / total) * 100 : () => 0);
                
                return (
                  <div key={env.environmentName} className="flex flex-col items-center gap-4 h-full justify-end group">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="chart-bar h-[220px] w-12 cursor-pointer transition-transform group-hover:scale-105">
                          <div className="bg-error/80" style={{ height: `${getPercent(env.failed)}%` }}></div>
                          <div className="bg-error" style={{ height: `${getPercent(env.major)}%` }}></div>
                          <div className="bg-tertiary" style={{ height: `${getPercent(env.minor)}%` }}></div>
                          <div className="bg-primary" style={{ height: `${getPercent(env.patch)}%` }}></div>
                          <div className="bg-secondary" style={{ height: `${getPercent(env.upToDate)}%` }}></div>
                          <div className="bg-outline-variant" style={{ height: `${getPercent(env.unknown)}%` }}></div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent className="bg-surface-container-highest border-outline-variant text-on-surface p-4 shadow-2xl rounded-xl">
                        <div className="space-y-2 min-w-[140px]">
                          <p className="font-bold text-sm border-b border-outline-variant pb-2 mb-2">{env.environmentName}</p>
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-[11px] flex items-center gap-2 font-label-caps"><div className="w-2 h-2 rounded-full bg-secondary"></div> Healthy</span>
                            <span className="text-[11px] font-bold">{env.upToDate}</span>
                          </div>
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-[11px] flex items-center gap-2 font-label-caps"><div className="w-2 h-2 rounded-full bg-primary"></div> Patch</span>
                            <span className="text-[11px] font-bold">{env.patch}</span>
                          </div>
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-[11px] flex items-center gap-2 font-label-caps"><div className="w-2 h-2 rounded-full bg-tertiary"></div> Minor</span>
                            <span className="text-[11px] font-bold">{env.minor}</span>
                          </div>
                          <div className="flex justify-between items-center gap-4">
                            <span className="text-[11px] flex items-center gap-2 font-label-caps"><div className="w-2 h-2 rounded-full bg-error"></div> Major</span>
                            <span className="text-[11px] font-bold">{env.major}</span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    <span className="text-[13px] font-bold text-on-surface group-hover:text-primary transition-colors">{env.environmentName}</span>
                  </div>
                );
              })}
            </TooltipProvider>
          </div>
          
          {/* Legend */}
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {[
              { color: 'bg-secondary', label: 'Healthy' },
              { color: 'bg-primary', label: 'Patch' },
              { color: 'bg-tertiary', label: 'Minor' },
              { color: 'bg-error', label: 'Major' },
              { color: 'bg-error/80', label: 'Failed' },
              { color: 'bg-outline-variant', label: 'Unknown' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={cn("w-2.5 h-2.5 rounded-full", item.color)}></div>
                <span className="text-[11px] font-label-caps text-on-surface-variant uppercase tracking-wider">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="xl:col-span-5 bg-surface-container-lowest border border-outline-variant p-8 rounded-xl shadow-sm relative overflow-hidden h-full flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-title-md text-title-md text-primary">Recent Activity</h3>
            <Link href="/history">
              <button className="text-primary font-label-caps text-label-caps hover:underline underline-offset-4 transition-all flex items-center gap-1">
                View All <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </Link>
          </div>
          <div className="space-y-3 relative flex-1">
            {activityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-14 bg-surface-container-low animate-pulse rounded-lg"></div>
                ))}
              </div>
            ) : activity?.map((entry: HistoryEntry) => (
              <div key={entry.id} className="flex items-center gap-4 p-3 rounded-lg border border-transparent hover:border-outline-variant/30 hover:bg-surface-container-low transition-all group cursor-pointer">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <span className="text-xl">{ecosystemIcon[entry.ecosystem] ?? "📦"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <h4 className="text-[13px] font-bold text-on-surface truncate group-hover:text-primary transition-colors">{entry.packageName}</h4>
                    <span className="text-[10px] font-label-caps text-on-surface-variant/50">{formatRelativeTime(new Date(entry.updatedAt).getTime())}</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-[11px] font-code-sm text-on-surface-variant/70">
                      {entry.fromVersion} <span className="text-primary opacity-50">→</span> {entry.toVersion}
                    </p>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                      entry.status === 'success' ? "text-emerald-500 bg-emerald-500/10" : "text-error bg-error/10"
                    )}>
                      {entry.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Infrastructure Banner (Decorative) */}
      <div className="mt-spacing-stack-lg relative rounded-2xl overflow-hidden h-56 border border-outline-variant bg-primary-container group">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-on-tertiary-container via-transparent to-transparent group-hover:opacity-30 transition-opacity"></div>
        <img alt="Datacenter nodes" className="w-full h-full object-cover mix-blend-overlay grayscale group-hover:scale-105 transition-transform duration-700" src="https://lh3.googleusercontent.com/aida/AP1WRLuECGVwvhQYfLOsoel4WMjiKWfykjm2CTkU6r4kvx5v9Gcp2yyKhtWxAjMfOcRTAaPRpGMSccBB89yddciuYwoq80rsTiS1JGv0EPadDRrkS5L42D6-0LNQ0AOO3p1YubDYM5Ufbcc_aPc-pzEIcesXuqIkzKYG-fJFMPQxGMOuyKNaoliAItjZBT5RUR9tGaopejKYrF5VlLvshkC9ZboJ1x6lxgdJuyczeOC-oG5dH_aEBnr1cY4vdLce"/>
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
        <div className="absolute bottom-8 left-8 right-8 flex items-end justify-between">
          <div className="text-white">
            <p className="font-label-caps text-label-caps opacity-70 mb-1 uppercase tracking-widest">Infrastructure Integrity</p>
            <h4 className="font-headline-lg text-headline-lg font-bold">Scanning {summary?.totalPackages?.toLocaleString() || '1,402'} dependencies</h4>
            <p className="text-sm opacity-60 max-w-md mt-2 font-body-sm">Continuous audit engine monitoring across {summary?.totalEnvironments || 0} environments.</p>
          </div>
          <button className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white border border-white/20 px-8 py-3 rounded-lg font-label-caps text-label-caps transition-all active:scale-95">
            View Audit Log
          </button>
        </div>
      </div>
    </div>
  );
}
