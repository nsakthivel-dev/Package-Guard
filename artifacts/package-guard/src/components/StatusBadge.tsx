import { cn } from "@/lib/utils";
import { type PackageStatus, statusConfig, historyStatusConfig } from "@/lib/statusColors";

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status as PackageStatus] ?? statusConfig.unknown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        config.badgeClass
      )}
      data-testid={`status-badge-${status}`}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dotClass)} />
      {config.label}
    </span>
  );
}

export function HistoryStatusBadge({ status }: { status: string }) {
  const config = historyStatusConfig[status] ?? historyStatusConfig.skipped;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        config.badgeClass
      )}
      data-testid={`history-status-${status}`}
    >
      {config.label}
    </span>
  );
}
