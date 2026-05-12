import { useState } from "react";
import { Search, Lock, RefreshCw, Shield } from "lucide-react";
import {
  useListPackages,
  useListEnvironments,
  useUpdatePackages,
  useCheckVersions,
  useGetSettings,
  getListPackagesQueryKey,
  getGetSettingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/StatusBadge";
import { ecosystemIcon } from "@/lib/statusColors";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

const ALL_GROUPS = ["ML / AI", "Data", "Web", "Dev Tools", "Others"];
const STATUSES = ["up-to-date", "patch", "minor", "major", "failed", "unknown"] as const;

export default function Packages() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: settings } = useGetSettings();
  const safeMode = settings?.safeMode ?? true;

  const [envId, setEnvId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [group, setGroup] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [safeModeWarning, setSafeModeWarning] = useState<string | null>(null);

  const { data: envs } = useListEnvironments();
  const { data: packages, isLoading } = useListPackages({
    environmentId: envId !== "all" ? Number(envId) : undefined,
    status: status !== "all" ? (status as "up-to-date" | "patch" | "minor" | "major" | "failed" | "unknown") : undefined,
    groupName: group !== "all" ? group : undefined,
    search: search || undefined,
  });

  const updatePackages = useUpdatePackages();
  const checkVersions = useCheckVersions();

  const toggleSelect = (id: number, pkgStatus: string) => {
    if (safeMode && (pkgStatus === "major" || pkgStatus === "minor")) {
      setSafeModeWarning(`Safe Mode is ON. This is a ${pkgStatus.toUpperCase()} update. Disable Safe Mode in Settings or the sidebar to update this package.`);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleUpdate = () => {
    if (!selected.size || !packages) return;
    const selectedPkgs = packages
      .filter((p) => selected.has(p.id) && p.latestVersion)
      .map((p) => ({ name: p.name, targetVersion: p.latestVersion! }));
    if (!selectedPkgs.length) return;

    const envIdNum = selectedPkgs.length > 0 && packages.find((p) => selected.has(p.id))?.environmentId;
    if (!envIdNum) return;

    updatePackages.mutate(
      { data: { environmentId: envIdNum, packages: selectedPkgs } },
      {
        onSuccess: (result) => {
          qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
          setSelected(new Set());
          toast({ title: `Updated ${result.totalPackages} packages successfully` });
        },
      }
    );
  };

  const handleCheckVersions = () => {
    const effectiveEnvId = envId !== "all" ? Number(envId) : envs?.[0]?.id;
    if (!effectiveEnvId) return;
    checkVersions.mutate(
      { data: { environmentId: effectiveEnvId } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
          toast({ title: "Version check complete" });
        },
      }
    );
  };

  const isLocked = (pkgStatus: string) => safeMode && (pkgStatus === "major" || pkgStatus === "minor");

  return (
    <div className="p-6 space-y-5" data-testid="packages-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-foreground">Packages</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button size="sm" onClick={handleUpdate} disabled={updatePackages.isPending} data-testid="button-update-selected">
              {updatePackages.isPending ? "Updating..." : `Update ${selected.size} selected`}
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={handleCheckVersions} disabled={checkVersions.isPending} data-testid="button-check-versions">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${checkVersions.isPending ? "animate-spin" : ""}`} />
            Check Versions
          </Button>
        </div>
      </div>

      {safeModeWarning && (
        <Alert className="border-amber-500/30 bg-amber-500/10">
          <Shield className="w-4 h-4 text-amber-400" />
          <AlertDescription className="text-amber-300 text-sm ml-2">{safeModeWarning}</AlertDescription>
          <button className="ml-auto text-amber-400 hover:text-amber-300 text-xs" onClick={() => setSafeModeWarning(null)}>Dismiss</button>
        </Alert>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search packages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-packages"
          />
        </div>
        <Select value={envId} onValueChange={setEnvId}>
          <SelectTrigger className="h-8 w-40 text-sm" data-testid="select-filter-env">
            <SelectValue placeholder="All environments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All environments</SelectItem>
            {envs?.map((e) => (
              <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-filter-status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-filter-group">
            <SelectValue placeholder="All groups" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All groups</SelectItem>
            {ALL_GROUPS.map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 px-4 animate-pulse bg-muted/30" />
            ))}
          </div>
        ) : !packages?.length ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No packages found. Scan an environment to discover packages.
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="packages-table">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-8 px-4 py-2.5"></th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Package</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Environment</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Installed</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Latest</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Group</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {packages.map((pkg) => (
                <tr
                  key={pkg.id}
                  className="hover:bg-muted/20 transition-colors cursor-pointer"
                  onClick={() => toggleSelect(pkg.id, pkg.status)}
                  data-testid={`package-row-${pkg.id}`}
                >
                  <td className="px-4 py-2.5">
                    {isLocked(pkg.status) ? (
                      <Lock className="w-3.5 h-3.5 text-amber-400" data-testid={`lock-icon-${pkg.id}`} />
                    ) : (
                      <input
                        type="checkbox"
                        checked={selected.has(pkg.id)}
                        onChange={() => toggleSelect(pkg.id, pkg.status)}
                        className="rounded"
                        data-testid={`checkbox-pkg-${pkg.id}`}
                      />
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{ecosystemIcon[pkg.ecosystem] ?? "📦"}</span>
                      <div>
                        <p className="font-medium text-foreground">{pkg.name}</p>
                        {pkg.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-48">{pkg.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{pkg.environmentName ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">{pkg.installedVersion}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">{pkg.latestVersion ?? "—"}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={pkg.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{pkg.groupName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
