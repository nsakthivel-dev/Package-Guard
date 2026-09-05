export type PackageStatus = "up-to-date" | "patch" | "minor" | "major" | "failed" | "unknown";

export const statusConfig: Record<PackageStatus, { label: string; badgeClass: string; dotClass: string }> = {
  "up-to-date": {
    label: "Up to date",
    badgeClass: "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0] rounded-[20px] font-semibold",
    dotClass: "bg-[#10B981]",
  },
  patch: {
    label: "Patch",
    badgeClass: "bg-[#EEF2FF] text-[#5B5EF4] border-[#C7D2FE] rounded-[20px] font-semibold",
    dotClass: "bg-[#5B5EF4]",
  },
  minor: {
    label: "Minor",
    badgeClass: "bg-[#FFFBEB] text-[#D97706] border-[#FDE68A] rounded-[20px] font-semibold",
    dotClass: "bg-[#F59E0B]",
  },
  major: {
    label: "Major",
    badgeClass: "bg-[#FFF7ED] text-[#EA580C] border-[#FFEDD5] rounded-[20px] font-semibold",
    dotClass: "bg-[#F97316]",
  },
  failed: {
    label: "Failed",
    badgeClass: "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA] rounded-[20px] font-semibold",
    dotClass: "bg-[#EF4444]",
  },
  unknown: {
    label: "Unknown",
    badgeClass: "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0] rounded-[20px] font-semibold",
    dotClass: "bg-[#CBD5E1]",
  },
};

export const historyStatusConfig: Record<string, { label: string; badgeClass: string }> = {
  success: { 
    label: "Success", 
    badgeClass: "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0] rounded-[20px] font-semibold text-[0.75rem]" 
  },
  failed: { 
    label: "Failed", 
    badgeClass: "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA] rounded-[20px] font-semibold text-[0.75rem]" 
  },
  skipped: { 
    label: "Skipped", 
    badgeClass: "bg-[#F8FAFC] text-[#64748B] border-[#E2E8F0] rounded-[20px] font-semibold text-[0.75rem]" 
  },
  LIVE: {
    label: "LIVE",
    badgeClass: "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0] rounded-[20px] font-semibold text-[0.75rem]"
  },
  SYNCED: {
    label: "SYNCED",
    badgeClass: "bg-[#EEF2FF] text-[#5B5EF4] border-[#C7D2FE] rounded-[20px] font-semibold text-[0.75rem]"
  },
};

export const ecosystemIcon: Record<string, string> = {
  pip: "🐍",
  venv: "🐍",
  conda: "🐍",
  npm: "🟢",
  nvm: "🟢",
};
