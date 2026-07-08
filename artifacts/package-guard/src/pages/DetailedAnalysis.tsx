import React, { useMemo, useState, useEffect } from "react";
import { 
  useListPackages, 
  useListEnvironments, 
  useGetStatusBreakdown,
  Package
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell 
} from "recharts";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCw, Layers, Package as PackageIcon, Activity } from "lucide-react";

const STATUS_COLORS = {
  healthy: "#6C63FF",
  patch: "#4A90D9",
  minor: "#F5A623",
  major: "#E8603A",
  failed: "#D0021B",
  unknown: "#B0B0B0",
};

const LEGEND_LABELS = [
  { key: "healthy", label: "HEALTHY" },
  { key: "patch", label: "PATCH" },
  { key: "minor", label: "MINOR" },
  { key: "major", label: "MAJOR" },
  { key: "failed", label: "FAILED" },
  { key: "unknown", label: "UNKNOWN" },
];

export default function DetailedAnalysis() {
  const { data: packages } = useListPackages();
  const { data: envs } = useListEnvironments();
  const { data: breakdown } = useGetStatusBreakdown();
  
  // Venv specific queries/mutations (same as Environments page)
  const { data: registeredVenvs } = useQuery({
    queryKey: ['venvs', 'registered'],
    queryFn: () => window.electronAPI.getRegisteredVenvs()
  });

  const [selectedEnvId, setSelectedEnvId] = useState<string>("");

  // Section B Table State
  const [sectionBTableFilter, setSectionBTableFilter] = useState<string>("all");
  const [sectionBTableSort, setSectionBTableSort] = useState<{ col: string, dir: 'asc' | 'desc' }>({ col: 'name', dir: 'asc' });

  // Combined local environments list (filtering out globals)
  const localEnvironments = useMemo(() => {
    const localEnvs = envs?.filter(e => !e.name.toLowerCase().includes("global")).map(e => ({ ...e, isVenv: false })) || [];
    const venvs = registeredVenvs?.map((v: any) => ({
      id: v.path, 
      name: v.name, 
      type: 'venv',
      isVenv: true,
      path: v.path,
      packageCount: v.packageCount || 0
    })) || [];
    return [...localEnvs, ...venvs];
  }, [envs, registeredVenvs]);

  // Default selection = the first environment in the list
  useEffect(() => {
    if (localEnvironments.length > 0 && (!selectedEnvId || !localEnvironments.find(e => e.id.toString() === selectedEnvId))) {
      setSelectedEnvId(localEnvironments[0].id.toString());
    }
  }, [localEnvironments, selectedEnvId]);

  // Fetch venv packages if a venv is selected (Matching Environments.tsx logic)
  const isVenvSelected = useMemo(() => {
    return registeredVenvs?.some((v: any) => v.path === selectedEnvId);
  }, [selectedEnvId, registeredVenvs]);

  const { data: venvPackagesResult } = useQuery<any>({
    queryKey: ['venvs', 'packages', selectedEnvId],
    queryFn: async () => {
      const res = await window.electronAPI.getVenvPackages(selectedEnvId);
      return res;
    },
    enabled: isVenvSelected
  });

  const isNew = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    return (now.getTime() - date.getTime()) < 24 * 60 * 60 * 1000;
  };

  // Section A: Global Packages Data
  const globalData = useMemo(() => {
    if (!breakdown) return [];
    return breakdown
      .filter(b => b.environmentName.toLowerCase().includes("global"))
      .map(b => ({
        name: b.environmentName,
        healthy: b.upToDate,
        patch: b.patch,
        minor: b.minor,
        major: b.major,
        failed: b.failed,
        unknown: b.unknown,
        total: b.upToDate + b.patch + b.minor + b.major + b.failed + b.unknown
      }));
  }, [breakdown]);

  // Combined environments list for other uses (globals included)
  const allEnvironments = useMemo(() => {
    const globalEnvs = envs?.map(e => ({ ...e, isVenv: false })) || [];
    const venvs = registeredVenvs?.map((v: any) => ({ 
      id: v.path, 
      name: v.name, 
      type: 'venv',
      isVenv: true,
      path: v.path,
      packageCount: v.packageCount || 0
    })) || [];
    return [...globalEnvs, ...venvs];
  }, [envs, registeredVenvs]);

  // Section B: Redesigned Data Logic
  const currentEnvPackages = useMemo(() => {
    if (!selectedEnvId) return [];
    const selectedEnv = allEnvironments.find(e => e.id.toString() === selectedEnvId);
    
    if (selectedEnv?.isVenv) {
      return venvPackagesResult?.packages?.map((p: any) => ({
        ...p,
        id: `venv-${p.name}`,
        installedVersion: p.version,
        status: p.status === "up-to-date" ? "healthy" : (p.status || 'healthy'),
        lastChecked: venvPackagesResult?.lastScanned || new Date().toISOString()
      })) || [];
    } else {
      return packages?.filter(p => p.environmentId.toString() === selectedEnvId).map(p => ({
        ...p,
        status: p.status === "up-to-date" ? "healthy" : p.status
      })) || [];
    }
  }, [selectedEnvId, allEnvironments, venvPackagesResult, packages]);

  const sectionBDonutData = useMemo(() => {
    const counts = { healthy: 0, patch: 0, minor: 0, major: 0, failed: 0, unknown: 0 };
    currentEnvPackages.forEach((pkg: any) => {
      const s = pkg.status;
      if (counts[s as keyof typeof counts] !== undefined) counts[s as keyof typeof counts]++;
    });
    return Object.entries(counts)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({ name, value }));
  }, [currentEnvPackages]);

  const sectionBStats = useMemo(() => {
    const total = currentEnvPackages.length;
    const healthy = currentEnvPackages.filter((p: any) => p.status === 'healthy').length;
    const needAttention = currentEnvPackages.filter((p: any) => ['patch', 'minor', 'major'].includes(p.status)).length;
    const critical = currentEnvPackages.filter((p: any) => p.status === 'failed').length;
    return { total, healthy, needAttention, critical };
  }, [currentEnvPackages]);

  const sectionBFilteredPackages = useMemo(() => {
    let result = [...currentEnvPackages];
    if (sectionBTableFilter !== "all") {
      result = result.filter(p => p.status === sectionBTableFilter);
    }
    
    result.sort((a: any, b: any) => {
      const valA = a[sectionBTableSort.col] || "";
      const valB = b[sectionBTableSort.col] || "";
      if (valA < valB) return sectionBTableSort.dir === 'asc' ? -1 : 1;
      if (valA > valB) return sectionBTableSort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [currentEnvPackages, sectionBTableFilter, sectionBTableSort]);

  const getRiskLevel = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'healthy' || s === 'unknown') return { label: 'Low', color: 'text-emerald-500' };
    if (s === 'patch' || s === 'minor') return { label: 'Medium', color: 'text-amber-500' };
    if (s === 'major' || s === 'failed') return { label: 'High', color: 'text-error' };
    return { label: 'Low', color: 'text-on-surface-variant' };
  };

  const activeStatuses = useMemo(() => {
    const set = new Set<string>();
    currentEnvPackages.forEach((p: any) => set.add(p.status));
    return set;
  }, [currentEnvPackages]);

  const selectedEnvName = useMemo(() => {
    return allEnvironments.find(e => e.id.toString() === selectedEnvId)?.name || "Environment";
  }, [selectedEnvId, allEnvironments]);

  const sectionBSubtitle = useMemo(() => {
    return `Showing ${currentEnvPackages.length} packages in ${selectedEnvName}`;
  }, [currentEnvPackages, selectedEnvName]);

  // Section C: All Packages Data
  const overallDistribution = useMemo(() => {
    if (!packages) return [];
    const counts = {
      healthy: 0,
      patch: 0,
      minor: 0,
      major: 0,
      failed: 0,
      unknown: 0
    };
    packages.forEach(pkg => {
      const status = pkg.status === "up-to-date" ? "healthy" : pkg.status;
      if (counts[status as keyof typeof counts] !== undefined) {
        counts[status as keyof typeof counts]++;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [packages]);

  const SectionBTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percent = ((data.value / currentEnvPackages.length) * 100).toFixed(1);
      return (
        <div className="bg-surface-container-highest border border-outline-variant p-4 rounded-xl shadow-2xl min-w-[180px]">
          <p className="font-bold text-xs uppercase tracking-widest text-on-surface-variant mb-2">{data.name}</p>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-bold text-on-surface">{data.value} Packages</p>
            <p className="text-[11px] text-primary font-bold">{percent}% of Environment</p>
          </div>
        </div>
      );
    }
    return null;
  };

  const handleExport = (type: string) => {
    console.log(`Exporting ${type}...`);
    // Implementation for CSV/PNG export
  };

  return (
    <div className="animate-in fade-in duration-500 h-[calc(100vh-240px)] overflow-hidden flex flex-col gap-3 pb-2">
      {/* Section 1: Global Packages Analysis — Recreated & Compact */}
      <Card className="p-3 bg-surface-container-lowest border-outline-variant shadow-sm shrink-0 overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 rounded-lg">
              <Layers className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="font-title-sm text-[13px] text-primary leading-tight">Global Registries Analysis</h3>
              <p className="text-[10px] text-on-surface-variant">Cross-environment health audit</p>
            </div>
          </div>
          <div className="flex gap-2">
            {globalData.map(data => (
              <div key={data.name} className="px-3 py-1 bg-surface-container-low rounded-lg border border-outline-variant/30 flex items-center gap-3">
                <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-widest">{data.name.split(' ')[0]}</span>
                <span className="text-sm font-bold text-primary">{data.total}</span>
                <Badge className="bg-secondary/10 text-secondary border-secondary/20 text-[9px] px-1 h-3.5 leading-none">
                  {Math.round((data.healthy / data.total) * 100)}%
                </Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="h-[60px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={globalData} layout="vertical" margin={{ top: 0, right: 10, left: 40, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis 
                dataKey="name" 
                type="category" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'hsl(var(--on-surface-variant))', fontSize: 9, fontWeight: 700 }}
                width={40}
              />
              <RechartsTooltip 
                cursor={{ fill: 'transparent' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="bg-surface-container-highest border border-outline-variant p-2 rounded-lg shadow-xl text-[10px]">
                        {payload.map((p: any) => (
                          <div key={p.name} className="flex justify-between gap-4">
                            <span className="capitalize">{p.name}:</span>
                            <span className="font-bold">{p.value}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="healthy" stackId="a" fill={STATUS_COLORS.healthy} barSize={12} radius={[2, 0, 0, 2]} />
              <Bar dataKey="patch" stackId="a" fill={STATUS_COLORS.patch} />
              <Bar dataKey="minor" stackId="a" fill={STATUS_COLORS.minor} />
              <Bar dataKey="major" stackId="a" fill={STATUS_COLORS.major} />
              <Bar dataKey="failed" stackId="a" fill={STATUS_COLORS.failed} radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Section 2: Redesigned Compact View — The "Beautiful" One */}
      <Card className="p-4 bg-white border-outline-variant shadow-sm overflow-hidden rounded-[12px] flex-1 flex flex-col min-h-0">
        <div className="flex justify-between items-center mb-4 shrink-0">
          <div>
            <h3 className="font-title-sm text-title-sm text-primary leading-tight">
              {selectedEnvId ? `${selectedEnvName} — Health Breakdown` : "Local Environment Status"}
            </h3>
            <p className="text-[11px] text-on-surface-variant">
              {sectionBSubtitle}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={selectedEnvId} onValueChange={setSelectedEnvId}>
              <SelectTrigger className="w-[180px] h-9 bg-surface-container border-outline-variant rounded-lg font-label-caps text-[10px] focus:ring-primary/20 transition-all">
                <SelectValue placeholder={localEnvironments.length > 0 ? "Select Environment" : "No environments found"} />
              </SelectTrigger>
              <SelectContent className="bg-surface-container-lowest border-outline-variant rounded-xl shadow-2xl">
                {localEnvironments.length > 0 ? (
                  localEnvironments.map(env => (
                    <SelectItem key={env.id} value={env.id.toString()} className="text-[11px]">{env.name}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="none" disabled>No environments found</SelectItem>
                )}
              </SelectContent>
            </Select>
            <button 
              onClick={() => handleExport('trend-png')}
              disabled={!selectedEnvId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container hover:bg-surface-container-high rounded-lg font-label-caps text-[10px] transition-all active:scale-95 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              PNG
            </button>
          </div>
        </div>

        {currentEnvPackages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-surface-container/10 rounded-xl border border-dashed border-outline-variant">
            <span className="material-symbols-outlined text-[48px] text-on-surface-variant/30 mb-4">analytics</span>
            <p className="font-title-md text-on-surface-variant/60">No packages found</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 space-y-4 animate-in fade-in duration-500">
            {/* Top Row — Stat Chips */}
            <div className="grid grid-cols-4 gap-3 shrink-0">
              {[
                { label: 'Total', value: sectionBStats.total, color: STATUS_COLORS.unknown },
                { label: 'Healthy', value: sectionBStats.healthy, color: STATUS_COLORS.healthy },
                { label: 'Attention', value: sectionBStats.needAttention, color: STATUS_COLORS.minor },
                { label: 'Critical', value: sectionBStats.critical, color: STATUS_COLORS.failed },
              ].map(stat => (
                <div key={stat.label} className="bg-surface-container-low px-3 py-2 h-[60px] rounded-lg border-l-[3px] shadow-sm flex flex-col justify-center" style={{ borderLeftColor: stat.color }}>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-0.5">{stat.label}</p>
                  <p className="text-xl font-bold text-on-surface leading-none">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Middle Row — Split layout (donut + table) */}
            <div className="flex-1 flex gap-6 min-h-0">
              {/* Left Column (40%) — Donut */}
              <div className="w-[40%] flex flex-col items-center justify-center relative bg-surface-container-low/20 rounded-xl border border-outline-variant/10 p-4">
                <div className="h-[200px] w-[200px] relative shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={sectionBDonutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={65}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                        animationDuration={800}
                      >
                        {sectionBDonutData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS]} 
                            className="hover:brightness-110 transition-all cursor-pointer outline-none"
                          />
                        ))}
                      </Pie>
                      <RechartsTooltip content={<SectionBTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-3xl font-bold text-primary leading-none">{sectionBStats.total}</p>
                    <p className="text-[8px] font-bold text-on-surface-variant uppercase tracking-widest mt-1">Total</p>
                  </div>
                </div>
                
                {/* Compact Legend at the bottom of donut column */}
                <div className="mt-auto pt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
                  {LEGEND_LABELS.map(l => {
                    const isActive = activeStatuses.has(l.key);
                    return (
                      <div key={l.key} className="flex items-center gap-1.5 transition-opacity" style={{ opacity: isActive ? 1 : 0.3 }}>
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isActive ? STATUS_COLORS[l.key as keyof typeof STATUS_COLORS] : "#CCCCCC" }}></div>
                        <span className="text-[9px] font-bold tracking-tight" style={{ color: isActive ? 'hsl(var(--on-surface))' : '#999999' }}>{l.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column (60%) — Table */}
              <div className="w-[60%] flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['all', 'healthy', 'patch', 'minor', 'major', 'failed'].map(s => (
                      <button
                        key={s}
                        onClick={() => setSectionBTableFilter(s)}
                        className={cn(
                          "px-2.5 py-1 h-[28px] rounded-full text-[9px] font-bold uppercase tracking-wider transition-all border",
                          sectionBTableFilter === s 
                            ? "bg-primary text-white border-primary shadow-sm" 
                            : "bg-surface-container hover:bg-surface-container-high text-on-surface-variant border-outline-variant/30"
                        )}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 border border-outline-variant/30 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-0">
                  <div className="overflow-y-auto scrollbar-thin flex-1">
                    <Table>
                      <TableHeader className="bg-surface-container-low/50 sticky top-0 z-10">
                        <TableRow className="border-outline-variant/30 hover:bg-transparent h-9">
                          <TableHead 
                            className="font-label-caps text-[10px] text-on-surface-variant uppercase cursor-pointer hover:text-primary py-0"
                            onClick={() => setSectionBTableSort({ col: 'name', dir: sectionBTableSort.dir === 'asc' ? 'desc' : 'asc' })}
                          >
                            Package
                          </TableHead>
                          <TableHead className="font-label-caps text-[10px] text-on-surface-variant uppercase py-0">Version</TableHead>
                          <TableHead className="font-label-caps text-[10px] text-on-surface-variant uppercase py-0">Status</TableHead>
                          <TableHead className="font-label-caps text-[10px] text-on-surface-variant uppercase py-0">Risk</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sectionBFilteredPackages.map((pkg: any, idx) => (
                          <TableRow key={pkg.id} className={cn("border-outline-variant/30 group h-9", idx % 2 === 0 ? "bg-white" : "bg-surface-container-low/10")}>
                            <TableCell className="font-bold text-on-surface py-0 text-[13px]">
                              <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                                {pkg.name}
                                {isNew(pkg.lastChecked) && (
                                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[8px] h-3.5 px-1 leading-none">NEW</Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-[11px] opacity-60 py-0">{pkg.installedVersion}</TableCell>
                            <TableCell className="py-0">
                              <div className="flex items-center gap-1.5">
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[pkg.status as keyof typeof STATUS_COLORS] }}></div>
                                <span className="text-[11px] font-bold uppercase tracking-tight" style={{ color: STATUS_COLORS[pkg.status as keyof typeof STATUS_COLORS] }}>
                                  {pkg.status}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="py-0">
                              <span className={cn("text-[11px] font-bold", getRiskLevel(pkg.status).color)}>
                                {getRiskLevel(pkg.status).label}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Section 3: Overall Inventory — Recreated & Compact Footer */}
      <Card className="p-3 bg-surface-container-low border-outline-variant shadow-sm shrink-0 overflow-hidden">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 shrink-0">
            <div className="p-1.5 bg-secondary/10 rounded-lg">
              <PackageIcon className="w-4 h-4 text-secondary" />
            </div>
            <div>
              <h3 className="font-title-sm text-[13px] text-secondary leading-tight">Inventory Summary</h3>
              <p className="text-[10px] text-on-surface-variant">Live system-wide auditing</p>
            </div>
          </div>

          <div className="flex-1 h-6 flex rounded-full overflow-hidden border border-outline-variant/30">
            {overallDistribution.map((item, index) => {
              const percentage = (item.value / (packages?.length || 1)) * 100;
              if (percentage === 0) return null;
              return (
                <div 
                  key={item.name} 
                  style={{ 
                    width: `${percentage}%`, 
                    backgroundColor: STATUS_COLORS[item.name as keyof typeof STATUS_COLORS] 
                  }}
                  className="h-full transition-all hover:brightness-110 relative group"
                >
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-surface-container-highest text-white text-[9px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                    {item.name}: {item.value}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-4 shrink-0">
            {overallDistribution.slice(0, 4).map(item => (
              <div key={item.name} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[item.name as keyof typeof STATUS_COLORS] }}></div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-tighter leading-none">{item.name}</span>
                  <span className="text-[11px] font-bold text-on-surface">{item.value}</span>
                </div>
              </div>
            ))}
            <div className="h-8 w-[1px] bg-outline-variant/30 mx-1"></div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-[8px] font-bold text-on-surface-variant uppercase tracking-tighter leading-none">Total</span>
                <span className="text-[11px] font-bold text-primary">{packages?.length || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
