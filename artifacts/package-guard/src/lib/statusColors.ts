export type PackageStatus = "up-to-date" | "patch" | "minor" | "major" | "failed" | "unknown";

export const statusConfig: Record<PackageStatus, { label: string; badgeClass: string; dotClass: string }> = {
  "up-to-date": {
    label: "Up to date",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    dotClass: "bg-emerald-400",
  },
  patch: {
    label: "Patch",
    badgeClass: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    dotClass: "bg-blue-400",
  },
  minor: {
    label: "Minor",
    badgeClass: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    dotClass: "bg-amber-400",
  },
  major: {
    label: "Major",
    badgeClass: "bg-red-500/15 text-red-400 border-red-500/20",
    dotClass: "bg-red-400",
  },
  failed: {
    label: "Failed",
    badgeClass: "bg-red-600/25 text-red-300 border-red-600/30",
    dotClass: "bg-red-500",
  },
  unknown: {
    label: "Unknown",
    badgeClass: "bg-muted text-muted-foreground border-border",
    dotClass: "bg-muted-foreground",
  },
};

export const historyStatusConfig: Record<string, { label: string; badgeClass: string }> = {
  success: { label: "Success", badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  failed: { label: "Failed", badgeClass: "bg-red-500/15 text-red-400 border-red-500/20" },
  skipped: { label: "Skipped", badgeClass: "bg-muted text-muted-foreground border-border" },
};

export const ecosystemIcon: Record<string, string> = {
  pip: "🐍",
  venv: "🐍",
  conda: "🐍",
  npm: "🟢",
  nvm: "🟢",
};
