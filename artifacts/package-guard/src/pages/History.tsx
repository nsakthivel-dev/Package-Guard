import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useListHistory } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { HistoryStatusBadge } from "@/components/StatusBadge";
import { ecosystemIcon } from "@/lib/statusColors";
import { format } from "date-fns";

export default function History() {
  const [ecosystem, setEcosystem] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data: history, isLoading } = useListHistory({
    ecosystem: ecosystem !== "all" ? (ecosystem as "pip" | "npm" | "conda" | "venv" | "nvm") : undefined,
    status: status !== "all" ? (status as "success" | "failed" | "skipped") : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    limit: 100,
  });

  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 space-y-5" data-testid="history-page">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">Update History</h1>
        <span className="text-xs text-muted-foreground">{history?.length ?? 0} records</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={ecosystem} onValueChange={setEcosystem}>
          <SelectTrigger className="h-8 w-36 text-sm" data-testid="select-history-ecosystem">
            <SelectValue placeholder="All ecosystems" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ecosystems</SelectItem>
            <SelectItem value="pip">pip</SelectItem>
            <SelectItem value="npm">npm</SelectItem>
            <SelectItem value="conda">conda</SelectItem>
            <SelectItem value="venv">venv</SelectItem>
            <SelectItem value="nvm">nvm</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-32 text-sm" data-testid="select-history-status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="From"
          data-testid="input-date-from"
        />
        <Input
          type="date"
          className="h-8 w-36 text-sm"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="To"
          data-testid="input-date-to"
        />
      </div>

      {/* Table */}
      <div className="bg-card border border-card-border rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse bg-muted/30" />
            ))}
          </div>
        ) : !history?.length ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            No update history yet. Update a package to see it here.
          </div>
        ) : (
          <table className="w-full text-sm" data-testid="history-table">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-8 px-4 py-2.5"></th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Package</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Environment</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">From</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">To</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {history.map((entry) => (
                <>
                  <tr
                    key={entry.id}
                    className="hover:bg-muted/20 transition-colors cursor-pointer"
                    onClick={() => entry.errorMessage && toggleExpand(entry.id)}
                    data-testid={`history-row-${entry.id}`}
                  >
                    <td className="px-4 py-2.5">
                      {entry.errorMessage ? (
                        expanded.has(entry.id) ? (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        )
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{ecosystemIcon[entry.ecosystem] ?? "📦"}</span>
                        <span className="font-medium text-foreground">{entry.packageName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{entry.environmentName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">{entry.fromVersion}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">{entry.toVersion}</td>
                    <td className="px-4 py-2.5"><HistoryStatusBadge status={entry.status} /></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.updatedAt), "MMM d, yyyy HH:mm")}
                    </td>
                  </tr>
                  {expanded.has(entry.id) && entry.errorMessage && (
                    <tr key={`${entry.id}-err`} className="bg-red-500/5">
                      <td colSpan={7} className="px-8 py-3">
                        <div className="bg-red-500/10 border border-red-500/20 rounded p-3">
                          <p className="text-xs font-semibold text-red-400 mb-1">Error Details</p>
                          <p className="text-xs text-red-300 font-mono">{entry.errorMessage}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
