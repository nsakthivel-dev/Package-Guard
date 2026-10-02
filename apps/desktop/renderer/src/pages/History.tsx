import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Search, FilterX, Calendar as CalendarIcon } from "lucide-react";
import { useListHistory, HistoryEntry } from "@packageguard/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { HistoryStatusBadge } from "@/components/StatusBadge";
import { ecosystemIcon } from "@/lib/statusColors";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function History() {
  const [ecosystem, setEcosystem] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<any>>(new Set());
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: history, isLoading } = useListHistory({ limit: 100 });

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [ecosystem, status, search, dateFrom, dateTo]);

  const filteredHistory = history?.filter((entry: HistoryEntry) => {
    if (ecosystem !== "all" && entry.ecosystem !== ecosystem) return false;
    if (status !== "all" && entry.status?.toLowerCase() !== status.toLowerCase()) return false;
    if (search && !entry.packageName.toLowerCase().includes(search.toLowerCase())) return false;
    
    if (dateFrom || dateTo) {
      const entryDate = new Date(entry.updatedAt);
      if (dateFrom && entryDate < new Date(dateFrom)) return false;
      if (dateTo) {
        const endOfToDate = new Date(dateTo);
        endOfToDate.setHours(23, 59, 59, 999);
        if (entryDate > endOfToDate) return false;
      }
    }
    
    return true;
  });

  const paginatedHistory = filteredHistory?.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  ) || [];

  const totalPages = Math.ceil((filteredHistory?.length ?? 0) / itemsPerPage);

  const toggleExpand = (id: any) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-stack-lg animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-gutter mb-stack-lg">
        <div className="flex-1 max-w-xl relative">
          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant/40">search</span>
          <input 
            type="text"
            placeholder="Search update logs..."
            className="w-full h-12 bg-surface-container-low border border-outline-variant rounded-xl pl-12 pr-4 font-body-sm text-on-surface focus:ring-2 focus:ring-primary/20 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-xl border border-outline-variant">
            <button 
              onClick={() => setEcosystem("all")}
              className={cn("px-4 py-2 rounded-lg font-label-caps text-label-caps transition-all", ecosystem === "all" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container")}
            >
              All
            </button>
            <button 
              onClick={() => setEcosystem("pip")}
              className={cn("px-4 py-2 rounded-lg font-label-caps text-label-caps transition-all", ecosystem === "pip" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container")}
            >
              Python
            </button>
            <button 
              onClick={() => setEcosystem("npm")}
              className={cn("px-4 py-2 rounded-lg font-label-caps text-label-caps transition-all", ecosystem === "npm" ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container")}
            >
              Node
            </button>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-40 h-12 rounded-xl border-outline-variant bg-surface-container-low focus:ring-primary/20 font-label-caps text-label-caps">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-outline-variant bg-surface-container-lowest">
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-container-low/50 border-b border-outline-variant">
                <th className="px-6 py-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">Package / Project</th>
                <th className="px-6 py-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">Environment</th>
                <th className="px-6 py-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">From</th>
                <th className="px-6 py-4 text-center font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">To</th>
                <th className="px-6 py-4 text-left font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-right font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-6 h-16 bg-surface-container-low/20"></td>
                  </tr>
                ))
              ) : paginatedHistory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center opacity-30">
                      <span className="material-symbols-outlined text-[64px] mb-4">history</span>
                      <p className="font-title-md text-title-md">No update history found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedHistory.map((entry: HistoryEntry) => {
                  const isFailed = entry.status?.toLowerCase() === 'failed';
                  const isSuccess = entry.status?.toLowerCase() === 'success' || entry.status === 'LIVE' || entry.status === 'SYNCED';
                  const isRemoved = entry.toVersion === 'removed';
                  const isInstalled = entry.toVersion === 'installed';

                  return (
                    <React.Fragment key={entry.id}>
                      <tr 
                        className={cn(
                          "hover:bg-surface-container-low/30 transition-colors group",
                          entry.errorMessage ? "cursor-pointer" : ""
                        )}
                        onClick={() => entry.errorMessage && toggleExpand(entry.id)}
                      >
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant/60 group-hover:scale-105 transition-transform">
                              <span className="text-xl">{ecosystemIcon[entry.ecosystem] ?? "📦"}</span>
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[14px] font-bold text-on-surface group-hover:text-primary transition-colors">{entry.packageName}</span>
                              {entry.errorMessage && (
                                <span className="text-[11px] text-destructive/80 flex items-center gap-1 font-medium mt-0.5">
                                  <span className="material-symbols-outlined text-[13px]">warning</span>
                                  {expanded.has(entry.id) ? "Hide error details" : "Click to view diagnostics"}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="px-2.5 py-1 bg-surface-container text-on-surface-variant rounded-md text-[11px] font-bold border border-outline-variant/30 uppercase tracking-tight">
                            {entry.environmentName}
                          </span>
                        </td>
                        <td className="px-6 py-5">
                          <code className="bg-surface-container-low px-2 py-0.5 rounded text-[13px] text-on-surface-variant/60 font-code-sm">{entry.fromVersion}</code>
                        </td>
                        <td className="px-6 py-5 text-center">
                          <code className={cn(
                            "px-2 py-0.5 rounded text-[13px] font-bold font-code-sm",
                            isRemoved ? "bg-destructive/10 text-destructive border border-destructive/20" :
                            isInstalled ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20" :
                            "bg-primary/5 text-primary"
                          )}>
                            {entry.toVersion}
                          </code>
                        </td>
                        <td className="px-6 py-5">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border",
                            isSuccess
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-destructive/10 text-destructive border-destructive/20"
                          )}>
                            <span className={cn("w-1.5 h-1.5 rounded-full", isSuccess ? "bg-emerald-500" : "bg-destructive")}></span>
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right">
                          <div className="text-[13px] font-bold text-on-surface">{format(new Date(entry.updatedAt), "MMM d, yyyy")}</div>
                          <div className="text-[11px] font-label-caps text-on-surface-variant/50">{format(new Date(entry.updatedAt), "HH:mm")}</div>
                        </td>
                      </tr>
                      {expanded.has(entry.id) && entry.errorMessage && (
                        <tr className="bg-destructive/5">
                          <td colSpan={6} className="px-8 py-4">
                            <div className="bg-surface-container-lowest border border-destructive/20 rounded-xl p-4 shadow-sm">
                              <p className="text-[10px] font-bold text-destructive uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">error</span>
                                Error Diagnostics
                              </p>
                              <pre className="text-[12px] text-destructive/90 font-code-sm leading-relaxed whitespace-pre-wrap">{entry.errorMessage}</pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-surface-container-low/30 border-t border-outline-variant flex items-center justify-between">
            <p className="text-[12px] font-label-caps text-on-surface-variant/60 uppercase tracking-widest">
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredHistory?.length ?? 0)} of {filteredHistory?.length ?? 0} logs
            </p>
            <div className="flex items-center gap-1">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-2 text-on-surface-variant hover:bg-surface-container rounded-lg disabled:opacity-20 transition-all"
              >
                <span className="material-symbols-outlined">chevron_left</span>
              </button>
              <div className="flex items-center gap-1 px-4">
                {Array.from({ length: totalPages }).map((_, i) => (
                  <button 
                    key={i}
                    onClick={() => setCurrentPage(i + 1)}
                    className={cn(
                      "w-8 h-8 rounded-lg text-[12px] font-bold transition-all",
                      currentPage === i + 1 ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:bg-surface-container"
                    )}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-2 text-on-surface-variant hover:bg-surface-container rounded-lg disabled:opacity-20 transition-all"
              >
                <span className="material-symbols-outlined">chevron_right</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
