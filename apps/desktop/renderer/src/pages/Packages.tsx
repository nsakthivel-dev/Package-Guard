import React, { useState, useEffect, useMemo } from "react";
import { 
  Search, ChevronDown, RefreshCw, MoreVertical, Trash2, Zap, CheckCircle2, 
  XCircle, ShieldCheck, Package as PackageIcon, Copy, Check, ExternalLink, 
  Info, AlertTriangle, ArrowUpRight, Globe
} from "lucide-react";
import { 
  useListPackages, 
  useUpdatePackages, 
  getListPackagesQueryKey,
  useListEnvironments,
  useGetSettings,
  Package 
} from "@packageguard/api-client-react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { usePackageStore } from "@/store/usePackageStore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface PackageMetadata {
  summary: string | null;
  description: string | null;
  homepage: string | null;
  timestamp: number;
  status?: 'loaded' | 'missing' | 'error' | 'not_found';
  notFound?: boolean;
  error?: boolean;
}

const METADATA_CACHE_KEY = "pg_package_metadata_cache_v3";
const METADATA_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const memoryCache = new Map<string, PackageMetadata>();
const inFlightKeys = new Set<string>();

function initMetadataCache() {
  try {
    const raw = localStorage.getItem(METADATA_CACHE_KEY) || localStorage.getItem("pg_package_metadata_cache_v2");
    if (raw) {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      for (const [key, val] of Object.entries(parsed)) {
        if (val && typeof val === "object" && (now - (val as any).timestamp < METADATA_CACHE_TTL)) {
          memoryCache.set(key, val as PackageMetadata);
        }
      }
    }
  } catch {
    // Ignore storage parse issues
  }
}
initMetadataCache();

function saveMetadataCache() {
  try {
    const obj: Record<string, PackageMetadata> = {};
    for (const [key, val] of memoryCache.entries()) {
      if (val && !val.error) {
        obj[key] = val;
      }
    }
    localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify(obj));
  } catch {
    // Ignore storage quota issues
  }
}

async function fetchPackageMetadata(name: string, ecosystem: string): Promise<PackageMetadata> {
  const normEco = (ecosystem === 'venv' || ecosystem === 'conda' || ecosystem === 'python') ? 'pip' : ecosystem;
  const pypiNormalizedName = normEco === 'pip' ? name.toLowerCase().replace(/[._]/g, '-') : name.toLowerCase();
  const cacheKey = `${normEco}:${pypiNormalizedName}`;
  const now = Date.now();

  if (memoryCache.has(cacheKey)) {
    const cached = memoryCache.get(cacheKey)!;
    if (cached.status === 'loaded' && (now - cached.timestamp < METADATA_CACHE_TTL)) {
      return cached;
    }
    if (cached.status === 'not_found' && (now - cached.timestamp < 24 * 60 * 60 * 1000)) {
      return cached;
    }
    if (cached.status === 'error' && (now - cached.timestamp < 60 * 1000)) {
      return cached;
    }
  }

  // 1. Primary path: Use Electron IPC in main process (no CSP, no CORS, non-blocking)
  const api = (window as any).electronAPI;
  if (api?.getPackageMetadata) {
    try {
      const res = await api.getPackageMetadata(name, normEco);
      if (res) {
        const meta: PackageMetadata = {
          summary: res.summary || null,
          description: res.description || res.summary || null,
          homepage: res.homepage || null,
          status: res.status || ((res.summary || res.description) ? 'loaded' : 'missing'),
          timestamp: Date.now(),
          error: res.error,
          notFound: res.notFound,
        };
        memoryCache.set(cacheKey, meta);
        saveMetadataCache();
        return meta;
      }
    } catch {
      // IPC failure fallback
    }
  }

  // 2. Fallback path: Direct browser fetch (for web preview or when IPC is not connected)
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const offlineMeta: PackageMetadata = { summary: null, description: null, homepage: null, timestamp: now, error: true, status: 'error' };
    memoryCache.set(cacheKey, offlineMeta);
    return offlineMeta;
  }

  if (name.startsWith('@internal/') || name.startsWith('@local/') || name.startsWith('@workspace/')) {
    const unavailable: PackageMetadata = { summary: null, description: null, homepage: null, timestamp: now, notFound: true, status: 'not_found' };
    memoryCache.set(cacheKey, unavailable);
    return unavailable;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    if (normEco === 'npm' || normEco === 'pnpm' || normEco === 'yarn') {
      const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        if (res.status === 404) {
          const notFound: PackageMetadata = { summary: null, description: null, homepage: null, notFound: true, status: 'not_found', timestamp: Date.now() };
          memoryCache.set(cacheKey, notFound);
          return notFound;
        }
        const errMeta: PackageMetadata = { summary: null, description: null, homepage: null, timestamp: Date.now(), error: true, status: 'error' };
        memoryCache.set(cacheKey, errMeta);
        return errMeta;
      }
      const data = await res.json();
      const summary = typeof data.description === 'string' && data.description.trim() ? data.description.trim() : null;
      const description = typeof data.readme === 'string' && data.readme.trim() ? data.readme.trim() : summary;
      const homepage = typeof data.homepage === 'string' ? data.homepage : null;
      const meta: PackageMetadata = { summary, description, homepage, status: (summary || description) ? 'loaded' : 'missing', timestamp: Date.now() };
      memoryCache.set(cacheKey, meta);
      saveMetadataCache();
      return meta;
    } else if (normEco === 'pip') {
      const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pypiNormalizedName)}/json`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        if (res.status === 404) {
          const notFound: PackageMetadata = { summary: null, description: null, homepage: null, notFound: true, status: 'not_found', timestamp: Date.now() };
          memoryCache.set(cacheKey, notFound);
          return notFound;
        }
        const errMeta: PackageMetadata = { summary: null, description: null, homepage: null, timestamp: Date.now(), error: true, status: 'error' };
        memoryCache.set(cacheKey, errMeta);
        return errMeta;
      }
      const data = await res.json();
      let summary = typeof data.info?.summary === 'string' ? data.info.summary.trim() : '';
      if (!summary || summary.toUpperCase() === 'UNKNOWN') summary = '';
      let description = typeof data.info?.description === 'string' ? data.info.description.trim() : '';
      if (!description || description.toUpperCase() === 'UNKNOWN') description = '';
      if (!summary && description) {
        summary = description.split(/\r?\n/).find((l: string) => l.trim() && !l.startsWith('#'))?.slice(0, 160) || '';
      }
      const homepage = data.info?.home_page || data.info?.project_urls?.Homepage || data.info?.project_urls?.Documentation || null;
      const meta: PackageMetadata = { 
        summary: summary || null, 
        description: description || summary || null, 
        homepage, 
        status: (summary || description) ? 'loaded' : 'missing', 
        timestamp: Date.now() 
      };
      memoryCache.set(cacheKey, meta);
      saveMetadataCache();
      return meta;
    }
  } catch {
    clearTimeout(timeoutId);
    const errMeta: PackageMetadata = { summary: null, description: null, homepage: null, timestamp: Date.now(), error: true, status: 'error' };
    memoryCache.set(cacheKey, errMeta);
    return errMeta;
  }

  return { summary: null, description: null, homepage: null, timestamp: Date.now(), status: 'missing' };
}

const ACCENT  = "#6366F1";   // indigo — matches Dashboard primary
const BORDER  = "#E5E7EB";
const BG      = "#F7F8FA";
const HEADING = "#111827";
const MUTED   = "#6B7280";

// ── Shared mini-helpers (mirrored from Dashboard) ─────────────────────────────

function VersionTag({ version, highlight }: { version?: string; highlight?: boolean }) {
  if (!version) return null;
  return (
    <code
      className="px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold"
      style={
        highlight
          ? { background: `${ACCENT}15`, color: ACCENT }
          : { background: "#F3F4F6", color: MUTED }
      }
    >
      {version}
    </code>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "positive" | "neutral" | "info" }) {
  const styles = {
    positive: { background: "#5EEAD420", color: "#0f766e" },
    neutral:  { background: "#F3F4F6",   color: MUTED    },
    info:     { background: `${ACCENT}15`, color: ACCENT },
  };
  return (
    <span
      className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full"
      style={styles[tone]}
    >
      {label}
    </span>
  );
}

const UpdateOverlay = ({
  status,
  pkgName,
  fromVersion,
  toVersion,
  onDismiss,
  error,
  onRetry,
  isBulk,
  count,
  total,
  completed,
  successful,
  failed,
  currentPackage,
  startTime,
  logs: externalLogs
}: {
  status: "updating" | "completed" | "failed";
  pkgName?: string;
  fromVersion?: string;
  toVersion?: string;
  onDismiss: () => void;
  error?: string;
  onRetry?: () => void;
  isBulk?: boolean;
  count?: number;
  total?: number;
  completed?: number;
  successful?: number;
  failed?: number;
  currentPackage?: string;
  startTime?: number;
  logs?: string[];
}) => {
  const [currentTime, setCurrentTime] = useState(() => performance.now());

  useEffect(() => {
    if (status === "updating") {
      const timer = setInterval(() => {
        setCurrentTime(performance.now());
      }, 500);
      return () => clearInterval(timer);
    }
    return undefined;
  }, [status]);

  const effectiveTotal = isBulk ? (total || count || 0) : 1;
  const effectiveCompleted = isBulk ? (completed ?? 0) : (status === "completed" ? 1 : 0);
  const effectiveSuccessful = isBulk ? (successful ?? 0) : (status === "completed" ? 1 : 0);
  const effectiveFailed = isBulk ? (failed ?? 0) : (status === "failed" ? 1 : 0);

  let progress = 0;
  if (status === "completed") {
    progress = 100;
  } else if (effectiveTotal > 0) {
    progress = Math.floor((effectiveCompleted / effectiveTotal) * 100);
    // Never show 100% in updating state before all items are actually processed
    if (progress > 99 && status === "updating" && effectiveCompleted < effectiveTotal) {
      progress = 99;
    }
  }

  const effectiveStartTime = startTime || currentTime;
  const elapsedSeconds = Math.max(0, Math.floor((currentTime - effectiveStartTime) / 1000));

  function formatElapsed(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  let etaText = "Calculating...";
  if (effectiveCompleted > 0 && effectiveTotal > effectiveCompleted && elapsedSeconds > 0) {
    const avgSeconds = elapsedSeconds / effectiveCompleted;
    const remainingPackages = effectiveTotal - effectiveCompleted;
    const remainingSec = Math.round(remainingPackages * avgSeconds);
    if (remainingSec < 60) {
      etaText = `~${remainingSec}s`;
    } else {
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      etaText = `~${mins}m ${secs}s`;
    }
  } else if (effectiveCompleted >= effectiveTotal && effectiveTotal > 0) {
    etaText = "Done";
  }

  const logs = externalLogs && externalLogs.length > 0 ? externalLogs : [
    isBulk
      ? `Processing ${effectiveTotal} packages...`
      : `Updating ${pkgName || 'package'} to ${toVersion || 'latest'}...`
  ];

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  // ── Shared card styles ──────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: "hsl(var(--surface-container-lowest))",
    border: "1px solid hsl(var(--card-border))",
    borderRadius: 16,
    boxShadow: "0 20px 48px -8px rgba(0,0,0,0.12), 0 4px 12px -2px rgba(0,0,0,0.06)",
  };
  const infoCardStyle: React.CSSProperties = {
    background: "hsl(var(--surface-container))",
    border: "1px solid hsl(var(--card-border))",
    borderRadius: 12,
  };
  const consoleStyle: React.CSSProperties = {
    background: "hsl(var(--surface-container-high))",
    border: "1px solid hsl(var(--card-border))",
    borderRadius: 12,
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-in fade-in duration-200">

      {/* ── Updating state ─────────────────────────────────────────────────── */}
      {status === "updating" && (
        <div className="w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden" style={cardStyle}>
          <div className="p-6 flex flex-col items-center text-center">

            {/* Progress ring — indigo active stroke */}
            <div className="relative mb-5">
              <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={radius} fill="transparent" strokeWidth="6" stroke="hsl(var(--surface-container-high))" />
                <circle
                  cx="50" cy="50" r={radius} fill="transparent" strokeWidth="6"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  style={{ stroke: ACCENT, transition: "stroke-dashoffset 300ms ease-out" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {/* Bold stat-number typography matching Dashboard large values */}
                <span className="text-[22px] font-bold leading-none" style={{ color: HEADING }}>
                  {Math.floor(progress)}%
                </span>
              </div>
            </div>

            {/* Title — matches PermissionDialog "Background Scanning" weight */}
            <h3 className="text-[18px] font-bold mb-1.5" style={{ color: HEADING }}>
              {isBulk ? "Bulk Updating" : "Updating Package"}
            </h3>
            {/* Subtitle — muted gray, same as Dashboard section subtitles */}
            <p className="text-[13px] mb-2 max-w-xs leading-relaxed" style={{ color: MUTED }}>
              {isBulk
                ? `${effectiveCompleted} / ${effectiveTotal} packages (${Math.floor(progress)}%)`
                : <>Updating <span className="font-semibold" style={{ color: HEADING }}>{pkgName}</span> from <VersionTag version={fromVersion} /> to <VersionTag version={toVersion} highlight /></>
              }
            </p>

            {isBulk && currentPackage && (
              <p className="text-[12px] font-medium mb-3" style={{ color: HEADING }}>
                Updating: <span className="font-semibold" style={{ color: ACCENT }}>{currentPackage}</span>
              </p>
            )}

            {isBulk && (
              <div className="w-full grid grid-cols-2 gap-2 mb-4 p-3 rounded-xl text-left text-[12px]" style={infoCardStyle}>
                <div>
                  <span style={{ color: MUTED }}>Successful: </span>
                  <span className="font-semibold" style={{ color: "#10B981" }}>{effectiveSuccessful}</span>
                </div>
                <div>
                  <span style={{ color: MUTED }}>Failed: </span>
                  <span className="font-semibold" style={{ color: effectiveFailed > 0 ? "#EF4444" : MUTED }}>{effectiveFailed}</span>
                </div>
                <div>
                  <span style={{ color: MUTED }}>Elapsed: </span>
                  <span className="font-mono font-medium" style={{ color: HEADING }}>{formatElapsed(elapsedSeconds)}</span>
                </div>
                <div>
                  <span style={{ color: MUTED }}>Remaining: </span>
                  <span className="font-medium" style={{ color: HEADING }}>{etaText}</span>
                </div>
              </div>
            )}

            {/* Thin linear progress bar */}
            <div className="w-full h-1 rounded-full mb-5 overflow-hidden" style={{ background: "hsl(var(--surface-container-high))" }}>
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${progress}%`, backgroundColor: ACCENT }}
              />
            </div>

            {/* Buttons — solid indigo primary, plain text secondary */}
            <div className="flex flex-col w-full gap-2">
              <button
                onClick={onDismiss}
                className="w-full h-10 rounded-lg text-[13px] font-bold text-white transition-all active:scale-95"
                style={{ background: ACCENT, boxShadow: `0 1px 2px ${ACCENT}40` }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#4338CA")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
              >
                Run in Background
              </button>
              <button
                onClick={onDismiss}
                className="text-[13px] font-medium py-2 hover:text-destructive transition-colors"
                style={{ color: MUTED }}
              >
                Cancel Update
              </button>
            </div>
          </div>

          {/* Console / system output panel */}
          <div className="mx-6 mb-6 p-3 text-left" style={consoleStyle}>
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-3 h-3 animate-spin" style={{ color: ACCENT }} />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                System Output
              </span>
            </div>
            <div className="font-mono text-[11px] flex flex-col gap-0.5 overflow-hidden" style={{ color: MUTED, minHeight: 40 }}>
              {logs.map((log, i) => <p key={i}>{log}</p>)}
            </div>
          </div>
        </div>
      )}

      {/* ── Success state ──────────────────────────────────────────────────── */}
      {status === "completed" && (
        <div className="w-full max-w-md animate-in zoom-in-95 duration-200 p-7 text-center" style={cardStyle}>

          {/* Icon tile — soft teal/green tint, darker green icon (matches Dashboard "Up to Date" stat) */}
          <div
            className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: "#5EEAD420" }}
          >
            <CheckCircle2 className="w-8 h-8" style={{ color: "#0f766e" }} strokeWidth={2} />
          </div>

          {/* Title */}
          <h2 className="text-[18px] font-bold mb-1.5" style={{ color: HEADING }}>
            {isBulk ? "Bulk Update Successful" : "Update Successful"}
          </h2>
          {/* Subtitle */}
          <p className="text-[13px] mb-5 leading-relaxed" style={{ color: MUTED }}>
            {isBulk
              ? `Successfully updated all ${effectiveTotal} packages across all environments.`
              : <>Package <span className="font-semibold" style={{ color: HEADING }}>{pkgName}</span> updated from <VersionTag version={fromVersion} /> to <VersionTag version={toVersion} highlight />.</>
            }
          </p>

          {/* Integrity check card */}
          <div className="p-4 mb-5 text-left" style={infoCardStyle}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4" style={{ color: "#0f766e" }} />
              <span className="text-[13px] font-semibold" style={{ color: HEADING }}>
                Integrity Check Passed
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: MUTED }}>Status</span>
                {/* Status pill — soft green, matches Dashboard "Synced"/"Active" badges */}
                <StatusPill label="Verified" tone="positive" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: MUTED }}>Signature</span>
                <StatusPill label="Valid · RSA-4096" tone="neutral" />
              </div>
            </div>
          </div>

          {/* Close button — solid indigo, matches Scan Now / Allow & Start */}
          <button
            onClick={onDismiss}
            className="w-full h-10 rounded-lg text-[13px] font-bold text-white transition-all active:scale-95"
            style={{ background: ACCENT, boxShadow: `0 1px 2px ${ACCENT}40` }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#4338CA")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
          >
            Close
          </button>
        </div>
      )}

      {/* ── Failed state ───────────────────────────────────────────────────── */}
      {status === "failed" && (
        <div className="w-full max-w-md animate-in zoom-in-95 duration-200 overflow-hidden" style={cardStyle}>
          {/* Red header strip */}
          <div
            className="relative h-20 flex items-center justify-center"
            style={{ background: "#FEF2F2", borderBottom: "1px solid hsl(var(--card-border))" }}
          >
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-red-600"
              style={{ background: "#fee2e2" }}
            >
              {isBulk && effectiveSuccessful > 0
                ? <RefreshCw className="w-6 h-6 animate-spin" />
                : <XCircle className="w-6 h-6" />
              }
            </div>
          </div>

          <div className="p-6 text-center">
            <h2 className="text-[18px] font-bold mb-2" style={{ color: HEADING }}>
              {isBulk
                ? (effectiveSuccessful > 0 ? "Completed with errors" : "Bulk Update Failed")
                : "Update Failed"}
            </h2>

            {/* Error log / console */}
            <div
              className={`text-[12px] mb-5 text-left p-3 font-mono whitespace-pre-wrap max-h-[180px] overflow-y-auto ${!isBulk ? "text-center font-sans" : ""}`}
              style={{ color: MUTED, ...consoleStyle }}
            >
              {isBulk && effectiveTotal > 0 && (
                <div className="mb-3 font-bold font-sans text-[13px]" style={{ color: effectiveSuccessful > 0 ? "#0f766e" : "#ef4444" }}>
                  {effectiveSuccessful} / {effectiveTotal} packages successful · {effectiveFailed} failed
                </div>
              )}
              {error || "An unexpected error occurred during update."}
            </div>

            <div className="flex gap-3">
              {!isBulk && (
                <button
                  onClick={onRetry}
                  className="flex-1 h-10 rounded-lg text-[13px] font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
                  style={{ background: ACCENT, boxShadow: `0 1px 2px ${ACCENT}40` }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#4338CA")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ACCENT)}
                >
                  <RefreshCw className="w-4 h-4" />
                  Retry Update
                </button>
              )}
              <button
                onClick={onDismiss}
                className={`${isBulk ? "w-full" : "flex-1"} h-10 rounded-lg text-[13px] font-semibold transition-all active:scale-95`}
                style={{
                  color: HEADING,
                  border: "1px solid hsl(var(--card-border))",
                  background: "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#E8E9FF";
                  e.currentTarget.style.color = "#4338CA";
                  e.currentTarget.style.borderColor = "#6366F1";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = HEADING;
                  e.currentTarget.style.borderColor = "hsl(var(--card-border))";
                }}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default function Packages() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { lastScanned, setPackages, setUpdateProgress, activeVenvPath, setActiveVenvPath } = usePackageStore();
  const [ecosystem, setEcosystem] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<any | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<any>>(new Set());
  const MAX_SELECTION = 10;
  
  const [selectedPackageForDetails, setSelectedPackageForDetails] = useState<Package | null>(null);
  const [detailsConfirmAction, setDetailsConfirmAction] = useState<'update' | 'uninstall' | null>(null);
  const [detailsMetaLoading, setDetailsMetaLoading] = useState(false);
  const [isCheckingSingle, setIsCheckingSingle] = useState(false);
  const [checkSingleStatus, setCheckSingleStatus] = useState<{ status: 'idle' | 'checking' | 'success' | 'error'; message: string }>({
    status: 'idle',
    message: ''
  });
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [metadataMap, setMetadataMap] = useState<Record<string, PackageMetadata>>(() => {
    const initial: Record<string, PackageMetadata> = {};
    for (const [k, v] of memoryCache.entries()) {
      initial[k] = v;
    }
    return initial;
  });
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const [modalState, setModalState] = useState<{
    show: boolean;
    status: 'updating' | 'completed' | 'failed';
    pkg?: Package;
    error?: string;
    isBulk?: boolean;
    count?: number;
    total?: number;
    completed?: number;
    successful?: number;
    failed?: number;
    currentPackage?: string;
    startTime?: number;
    logs?: string[];
  }>({ show: false, status: 'updating' });

  const { data: globalPackages, isLoading: loadingGlobal } = useListPackages();
  const { data: environments } = useListEnvironments();
  const { data: settings } = useGetSettings();
  const updatePackages = useUpdatePackages();

  const ignoredSet = useMemo(() => {
    const list = Array.isArray((settings as any)?.ignoredPackages) ? (settings as any).ignoredPackages : [];
    return new Set(list.map((p: any) => typeof p === 'string' ? p.trim().toLowerCase() : '').filter(Boolean));
  }, [(settings as any)?.ignoredPackages]);

  const { data: registeredVenvs } = useQuery({
    queryKey: ['venvs', 'registered'],
    queryFn: () => window.electronAPI.getRegisteredVenvs()
  });

  const { data: venvPackages, isLoading: loadingVenv } = useQuery<any>({
    queryKey: ['venvs', 'packages', activeVenvPath],
    queryFn: () => window.electronAPI.getVenvPackages(activeVenvPath!),
    enabled: !!activeVenvPath && ecosystem === 'venv'
  });

  const updateVenvPackageMutation = useMutation({
    mutationFn: (data: { venvPath: string, packageName: string }) => window.electronAPI.updateVenvPackage(data),
    onSuccess: () => {
      setUpdatingId(null);
      qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
      setModalState({ show: true, status: 'completed' });
    },
    onError: (err: any) => {
      setUpdatingId(null);
      setModalState({ show: true, status: 'failed', error: err.message });
    }
  });

  const packages = useMemo(() => {
    if (ecosystem === 'venv') {
      const venvPkgs = venvPackages?.packages || [];
      return venvPkgs.map((p: any) => {
        const globalPkg = globalPackages?.find(gp => gp.ecosystem === 'pip' && gp.name.toLowerCase() === p.name.toLowerCase());
        const isDifferent = globalPkg && globalPkg.installedVersion !== p.version;
        
        return {
          ...p,
          id: `venv-${p.name}`,
          ecosystem: 'pip',
          installedVersion: p.version,
          environmentPath: activeVenvPath,
          status: p.status === "up-to-date" ? "up-to-date" : (p.status || 'unknown'),
          isDifferentFromGlobal: isDifferent,
          globalVersion: globalPkg?.installedVersion
        };
      });
    }
    
    let filtered = globalPackages || [];
    if (ecosystem !== 'all') {
      filtered = filtered.filter(p => p.ecosystem === ecosystem);
    }
    return filtered;
  }, [ecosystem, globalPackages, venvPackages, activeVenvPath]);

  const isLoading = ecosystem === 'venv' ? loadingVenv : loadingGlobal;

  useEffect(() => {
    const api = window.electronAPI;
    if (api?.onUpdateProgress) {
      return api.onUpdateProgress((data: any) => {
        if (data.package) {
          setUpdateProgress(data.package, data);
        }
        setModalState((prev) => {
          if (!prev.show || !prev.isBulk || prev.status !== 'updating') return prev;
          
          const newLogs = data.message ? [...(prev.logs || []), `> ${data.message}`].slice(-8) : prev.logs;
          
          if (data.batch) {
            return {
              ...prev,
              total: data.batch.total ?? prev.total,
              completed: data.batch.completed ?? prev.completed,
              successful: data.batch.successful ?? prev.successful,
              failed: data.batch.failed ?? prev.failed,
              currentPackage: data.batch.currentPackage || data.package || prev.currentPackage,
              logs: newLogs,
            };
          }

          return {
            ...prev,
            currentPackage: data.package || prev.currentPackage,
            logs: newLogs,
          };
        });
      });
    }
    return undefined;
  }, [setUpdateProgress]);

  useEffect(() => {
    if (packages) {
      setPackages(packages);
    }
  }, [packages, setPackages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [ecosystem, status, search]);

  const handleUpdate = (pkg: Package) => {
    if (ecosystem === 'venv') {
      if (!activeVenvPath) {
        toast({ title: "No venv selected", description: "Please select a virtual environment first.", variant: "destructive" });
        return;
      }
      setUpdatingId(pkg.id);
      setModalState({ show: true, status: 'updating', pkg });
      updateVenvPackageMutation.mutate({ venvPath: activeVenvPath, packageName: pkg.name });
      return;
    }

    setUpdatingId(pkg.id);
    setModalState({ show: true, status: 'updating', pkg });

    setUpdateProgress(pkg.name, { 
      packageName: pkg.name, 
      status: 'installing', 
      message: `Starting update for ${pkg.name}...` 
    });

    updatePackages.mutate({ 
      data: { 
        environmentId: pkg.environmentId as any, 
        packages: [{ name: pkg.name, targetVersion: pkg.latestVersion || pkg.installedVersion }] 
      } 
    }, {
      onSuccess: (data) => {
        setUpdatingId(null);
        
        const results = Array.isArray(data) ? data : [data];
        const allSuccessful = results.every((r: any) => r.success);
        
        if (allSuccessful) {
          setUpdateProgress(pkg.name, { status: 'complete', message: 'Update successful' });

          qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
          qc.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
          qc.invalidateQueries({ queryKey: ['/api/dashboard/status-breakdown'] });
          qc.invalidateQueries({ queryKey: ['/api/history'] });
          
          setModalState(prev => ({ 
            ...prev, 
            status: 'completed' 
          }));
        } else {
          const failedPkg = results.find((r: any) => !r.success);
          setUpdateProgress(pkg.name, { status: 'failed', message: failedPkg?.error || 'Update failed' });
          setModalState(prev => ({ 
            ...prev, 
            status: 'failed',
            error: failedPkg?.error || `Failed to update ${pkg.name}`
          }));
          toast({
            title: "Update Failed",
            description: failedPkg?.error || `Failed to update ${pkg.name}`,
            variant: "destructive"
          });
        }
      },
      onError: (error: any) => {
        setUpdatingId(null);
        setUpdateProgress(pkg.name, { status: 'failed', message: error.message || 'Update failed' });
        setModalState(prev => ({ 
          ...prev, 
          status: 'failed',
          error: error.message || "An unexpected error occurred during update"
        }));
        toast({
          title: "Update Error",
          description: error.message || "An unexpected error occurred during update",
          variant: "destructive"
        });
      },
    });
  };
  const handleDelete = async (pkg: Package, skipConfirm = false) => {
    if (!skipConfirm && !confirm(`Are you sure you want to delete ${pkg.name}?`)) return;

    try {
      const api = window.electronAPI;
      let envPath = (pkg as any).environmentPath;

      if (!envPath && pkg.environmentId) {
        const envs = await api.getEnvironments();
        const env = envs.find((e: any) => e.id === pkg.environmentId);
        envPath = env?.path;
      }

      const result = await api.deletePackage({
        packageName: pkg.name,
        ecosystem: pkg.ecosystem,
        envPath: envPath
      });

      if (result.success) {
        toast({ 
          title: "Package Deleted", 
          description: `${pkg.name} has been removed from ${pkg.environmentName || 'the environment'}.` 
        });
        qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
        if (ecosystem === 'venv') {
          qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
        }
        qc.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
        qc.invalidateQueries({ queryKey: ['/api/dashboard/status-breakdown'] });
        qc.invalidateQueries({ queryKey: ['/api/history'] });
        setSelectedPackageForDetails(null);
        setDetailsConfirmAction(null);
      } else {
        throw new Error(result.error || "Failed to delete package");
      }
    } catch (error: any) {
      toast({ 
        title: "Delete Failed", 
        description: error.message || `Could not delete ${pkg.name}`,
        variant: "destructive"
      });
    }
  };

  const handleCheckSingleVersion = async (pkg: Package) => {
    setIsCheckingSingle(true);
    setCheckSingleStatus({ status: 'checking', message: 'Checking registry for latest version...' });
    try {
      const checkFn = (window.electronAPI as any)?.checkVersions;
      if (!checkFn) throw new Error("Version checking service is not available.");
      
      const results = await checkFn([{
        name: pkg.name,
        installedVersion: pkg.installedVersion,
        ecosystem: pkg.ecosystem,
        environmentId: pkg.environmentId
      }]);

      qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
      if (ecosystem === 'venv') {
        qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
      }

      const res = results?.[0];
      if (res && res.latest) {
        const isUpToDate = res.status === 'up-to-date';
        setCheckSingleStatus({
          status: 'success',
          message: isUpToDate 
            ? `Up to date (version ${res.latest})` 
            : `Update available: ${res.latest} (${res.status || 'recommended'})`
        });
        setSelectedPackageForDetails(prev => {
          if (prev && prev.id === pkg.id) {
            return {
              ...prev,
              latestVersion: res.latest,
              status: res.status || prev.status,
              description: res.description || prev.description
            };
          }
          return prev;
        });
        if (res.description || res.summary) {
          const ecoStr = String(pkg.ecosystem);
          const normEco = (ecoStr === 'venv' || ecoStr === 'conda' || ecoStr === 'python') ? 'pip' : pkg.ecosystem;
          const pypiNormalizedName = normEco === 'pip' ? pkg.name.toLowerCase().replace(/[._]/g, '-') : pkg.name.toLowerCase();
          const key = `${normEco}:${pypiNormalizedName}`;
          const newMeta: PackageMetadata = { 
            summary: res.summary || res.description || null,
            description: res.description || res.summary || null, 
            homepage: res.homepage || null, 
            timestamp: Date.now(),
            status: 'loaded'
          };
          memoryCache.set(key, newMeta);
          setMetadataMap(prev => ({ ...prev, [key]: newMeta }));
          saveMetadataCache();
        }
      } else {
        setCheckSingleStatus({
          status: 'success',
          message: 'Version check completed'
        });
      }
    } catch (err: any) {
      setCheckSingleStatus({
        status: 'error',
        message: err.message || 'Failed to check version'
      });
    } finally {
      setIsCheckingSingle(false);
    }
  };

  const copyToClipboard = (text?: string | null, label?: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(label || text);
      toast({
        title: "Copied to clipboard",
        description: `${label || 'Text'}: ${text}`
      });
      setTimeout(() => setCopiedField(null), 2000);
    }).catch(() => {
      toast({
        title: "Copy failed",
        description: `Could not copy ${label || 'text'}`,
        variant: "destructive"
      });
    });
  };

  const getRegistryUrl = (pkg: Package): string | null => {
    const eco = String(pkg.ecosystem);
    if (eco === 'npm' || eco === 'pnpm' || eco === 'yarn') {
      return `https://www.npmjs.com/package/${encodeURIComponent(pkg.name)}`;
    }
    if (eco === 'pip' || eco === 'venv' || eco === 'conda' || eco === 'python') {
      return `https://pypi.org/project/${encodeURIComponent(pkg.name)}/`;
    }
    return null;
  };

  const cleanDescriptionText = (raw?: string | null): string => {
    if (!raw || typeof raw !== 'string') return '';
    let text = raw.trim();
    // Remove markdown badges like [![...](...)](...) or [![...](...)]
    text = text.replace(/\[!\[[\s\S]*?\]\([\s\S]*?\)\]\([\s\S]*?\)/g, '');
    text = text.replace(/!\[[\s\S]*?\]\([\s\S]*?\)/g, '');
    text = text.replace(/\[![\s\S]*?\]/g, '');
    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, '');
    // Remove headers
    text = text.replace(/^#+\s+/gm, '');
    // Clean markdown links [text](url) -> text
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');

    // Split into paragraphs and filter out noise/license sections
    const paragraphs = text.split(/\r?\n\s*\r?\n/)
      .map(p => p.trim())
      .filter(p => {
        if (!p) return false;
        const lower = p.toLowerCase();
        if (lower.startsWith('license') || lower.startsWith('table of contents')) return false;
        if (lower.startsWith('---') || lower.startsWith('===')) return false;
        if (lower.startsWith('contributing') || lower.startsWith('authors')) return false;
        return true;
      });

    if (paragraphs.length > 0) {
      const combined = paragraphs.slice(0, 2).join('\n\n').trim();
      if (combined.length > 450) {
        const sentenceEnd = combined.indexOf('.', 300);
        if (sentenceEnd !== -1 && sentenceEnd < 500) {
          return combined.slice(0, sentenceEnd + 1).trim();
        }
        return combined.slice(0, 450).trim() + '…';
      }
      return combined;
    }
    return text.trim();
  };

  const getPackageSummary = (pkg: Package): string => {
    // 1. Explicit summary from package
    if ((pkg as any).summary && (pkg as any).summary.trim() && (pkg as any).summary !== "No description available") {
      const cleaned = cleanDescriptionText((pkg as any).summary);
      if (cleaned) return cleaned;
    }
    // 2. Existing valid description if short or genuine
    if (pkg.description && pkg.description !== "No description available" && pkg.description.trim()) {
      const cleaned = cleanDescriptionText(pkg.description);
      if (cleaned) return cleaned;
    }
    // 3. Cached metadata from registry
    const ecoStr = String(pkg.ecosystem);
    const normEco = (ecoStr === 'venv' || ecoStr === 'conda' || ecoStr === 'python') ? 'pip' : ecoStr;
    const pypiNormalizedName = normEco === 'pip' ? pkg.name.toLowerCase().replace(/[._]/g, '-') : pkg.name.toLowerCase();
    const key = `${normEco}:${pypiNormalizedName}`;
    const cached = metadataMap[key] || memoryCache.get(key);
    if (cached) {
      if (cached.summary && cached.summary.trim()) {
        const cleaned = cleanDescriptionText(cached.summary);
        if (cleaned) return cleaned;
      }
      if (cached.description && cached.description.trim()) {
        const cleaned = cleanDescriptionText(cached.description);
        if (cleaned) return cleaned;
      }
      if (cached.error) {
        return "Description temporarily unavailable. Retry when connected.";
      }
      return "No description provided by the package publisher.";
    }
    return "Loading package information…";
  };

  const getPackageDescription = (pkg: Package): string => {
    const ecoStr = String(pkg.ecosystem);
    const normEco = (ecoStr === 'venv' || ecoStr === 'conda' || ecoStr === 'python') ? 'pip' : ecoStr;
    const pypiNormalizedName = normEco === 'pip' ? pkg.name.toLowerCase().replace(/[._]/g, '-') : pkg.name.toLowerCase();
    const key = `${normEco}:${pypiNormalizedName}`;
    const cached = metadataMap[key] || memoryCache.get(key);

    if (cached) {
      // Prioritize concise content/summary
      if (cached.summary && cached.summary.trim()) {
        const cleaned = cleanDescriptionText(cached.summary);
        if (cleaned) return cleaned;
      }
      if (cached.description && cached.description.trim()) {
        const cleaned = cleanDescriptionText(cached.description);
        if (cleaned) return cleaned;
      }
      if (cached.error) {
        return "Description temporarily unavailable. Retry when connected.";
      }
      return "No description provided by the package publisher.";
    }

    if ((pkg as any).summary && (pkg as any).summary.trim()) {
      const cleaned = cleanDescriptionText((pkg as any).summary);
      if (cleaned) return cleaned;
    }
    if (pkg.description && pkg.description !== "No description available" && pkg.description.trim()) {
      const cleaned = cleanDescriptionText(pkg.description);
      if (cleaned) return cleaned;
    }

    return "Loading package information…";
  };

  const handleRowClick = (pkg: Package) => {
    setSelectedPackageForDetails(pkg);
    setDetailsConfirmAction(null);
    setCheckSingleStatus({ status: 'idle', message: '' });
  };

  const handleCheckVersions = () => {
    if (!packages || packages.length === 0) {
      toast({ title: "No packages available", description: "There are no packages in the current inventory." });
      return;
    }

    // Deduplicate and filter selected packages from shared selection state
    const selectedPkgsMap = new Map<any, Package>();
    for (const p of packages) {
      if (selectedIds.has(p.id) && !selectedPkgsMap.has(p.id)) {
        selectedPkgsMap.set(p.id, p);
      }
    }

    const selectedPkgs = Array.from(selectedPkgsMap.values());
    
    if (selectedPkgs.length === 0) {
      toast({
        title: "No packages selected",
        description: "Please select up to 10 packages to check versions, or click Select All.",
      });
      return;
    }

    // Never send more than 10 selected packages to checkVersions
    const pkgsToCheck = selectedPkgs.slice(0, MAX_SELECTION);
    
    toast({ 
      title: "Checking versions...", 
      description: `Scanning ${pkgsToCheck.length} selected package${pkgsToCheck.length > 1 ? 's' : ''} for updates.` 
    });
    
    const checkMutation = (window.electronAPI as any).checkVersions;
    if (checkMutation) {
      checkMutation(pkgsToCheck.map((p: Package) => ({
        name: p.name,
        installedVersion: p.installedVersion,
        ecosystem: p.ecosystem,
        environmentId: p.environmentId
      }))).then((results: any) => {
        qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
        if (ecosystem === 'venv') {
          qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
        }
        toast({ 
          title: "Check complete", 
          description: `Updated version info for ${results.length} package${results.length > 1 ? 's' : ''}.` 
        });
      }).catch((err: any) => {
        toast({ title: "Check failed", description: err.message, variant: "destructive" });
      });
    }
  };

  const handleUpdateAll = () => {
    if (selectedIds.size === 0) return;
    
    const selectedPkgs = (packages as Package[])?.filter((p: Package) => selectedIds.has(p.id)) || [];
    const total = selectedPkgs.length;
    const now = performance.now();

    selectedPkgs.forEach((p: Package) => {
      setUpdateProgress(p.name, { 
        packageName: p.name, 
        status: 'installing', 
        message: `Queued for bulk update...` 
      });
    });

    setModalState({ 
      show: true, 
      status: 'updating', 
      isBulk: true, 
      count: total,
      total: total,
      completed: 0,
      successful: 0,
      failed: 0,
      currentPackage: selectedPkgs[0]?.name || '',
      startTime: now,
      logs: [`Initializing bulk update for ${total} packages...`],
    });

    if (ecosystem === 'venv') {
      if (!activeVenvPath) return;
      
      window.electronAPI.updateBatch({
        packages: selectedPkgs.map((p: Package) => ({
          name: p.name,
          targetVersion: p.latestVersion || p.installedVersion,
          ecosystem: 'pip'
        })),
        envPath: activeVenvPath
      }).then((results: any[]) => {
        handleBulkUpdateResults(results, selectedPkgs, total);
      }).catch((error: any) => {
        handleBulkUpdateError(error, selectedPkgs, total);
      });
      return;
    }

    const envGroups = selectedPkgs.reduce((acc: Record<string, any[]>, p: Package) => {
      const envId = String(p.environmentId);
      if (!acc[envId]) acc[envId] = [];
      acc[envId].push({ name: p.name, targetVersion: p.latestVersion || p.installedVersion, pkg: p });
      return acc;
    }, {});

    const promises = Object.entries(envGroups).map(([envId, pkgs]) => {
      return new Promise((resolve, reject) => {
        const pkgsList = pkgs as any[];
        updatePackages.mutate({ 
          data: { environmentId: envId as any, packages: pkgsList.map((p: any) => ({ name: p.name, targetVersion: p.targetVersion })) } 
        }, {
          onSuccess: (data) => resolve({ data, pkgs: pkgsList }),
          onError: (error) => reject({ error, pkgs: pkgsList })
        });
      });
    });

    Promise.allSettled(promises).then((results) => {
      const failures: string[] = [];
      let successCount = 0;

      results.forEach(res => {
        if (res.status === 'fulfilled') {
          const { data, pkgs } = res.value as any;
          const resArray = Array.isArray(data) ? data : [data];
          resArray.forEach((r: any, idx: number) => {
            const pkgName = pkgs[idx]?.name || (r && r.package);
            if (r && r.success) {
              successCount++;
              if (pkgName) setUpdateProgress(pkgName, { status: 'complete', message: 'Update successful' });
            } else {
              const err = (r && r.error) || 'Update failed';
              if (pkgName) {
                failures.push(`${pkgName}: ${err}`);
                setUpdateProgress(pkgName, { status: 'failed', message: err });
              } else {
                failures.push(`Package: ${err}`);
              }
            }
          });
        } else {
          const { error, pkgs } = res.reason as any;
          if (Array.isArray(pkgs)) {
            pkgs.forEach((p: any) => {
              failures.push(`${p.name}: ${error?.message || 'Network error'}`);
              setUpdateProgress(p.name, { status: 'failed', message: error?.message || 'Network error' });
            });
          } else {
            failures.push(error?.message || 'Network error');
          }
        }
      });

      finalizeBulkUpdate(successCount, failures, total);
    });
  };

  const handleBulkUpdateResults = (results: any[], selectedPkgs: any[], totalCount: number) => {
    const failures: string[] = [];
    let successCount = 0;

    results.forEach((r, idx) => {
      const pkgName = selectedPkgs[idx]?.name || r?.package;
      if (r && r.success) {
        successCount++;
        if (pkgName) setUpdateProgress(pkgName, { status: 'complete', message: 'Update successful' });
      } else {
        const err = r?.error || 'Update failed';
        if (pkgName) {
          failures.push(`${pkgName}: ${err}`);
          setUpdateProgress(pkgName, { status: 'failed', message: err });
        } else {
          failures.push(err);
        }
      }
    });

    finalizeBulkUpdate(successCount, failures, totalCount);
  };

  const handleBulkUpdateError = (error: any, selectedPkgs: any[], totalCount: number) => {
    const failures = selectedPkgs.map(p => `${p.name}: ${error?.message || 'Update failed'}`);
    selectedPkgs.forEach(p => {
      setUpdateProgress(p.name, { status: 'failed', message: error?.message || 'Update failed' });
    });
    finalizeBulkUpdate(0, failures, totalCount);
  };

  const finalizeBulkUpdate = (successCount: number, failures: string[], totalCount?: number) => {
    const total = totalCount ?? (modalState.total || selectedIds.size);
    const failedCount = failures.length;
    
    if (failedCount > 0) {
      setModalState(prev => ({
        ...prev,
        show: true,
        status: 'failed',
        isBulk: true,
        error: `The following packages failed to update:\n\n${failures.join('\n')}`,
        count: successCount,
        total: total,
        completed: total,
        successful: successCount,
        failed: failedCount
      }));
    } else {
      setModalState(prev => ({
        ...prev,
        show: true,
        status: 'completed',
        isBulk: true,
        count: successCount,
        total: total,
        completed: total,
        successful: successCount,
        failed: 0
      }));
    }
    
    if (ecosystem === 'venv') {
      qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
    } else {
      qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
    }
    setSelectedIds(new Set());
  };

  const filteredPackages = useMemo(() => {
    if (!packages) return [];
    return packages.filter((pkg: Package) => {
      if (ecosystem !== "all" && ecosystem !== "venv" && pkg.ecosystem !== ecosystem) return false;
      
      const rawName = pkg.name ? pkg.name.trim().toLowerCase() : '';
      const isPkgIgnored = pkg.status === 'ignored' || ignoredSet.has(rawName) || ignoredSet.has(rawName.replace(/[._]/g, '-'));

      if (status !== "all") {
        if (status === 'ignored') {
          if (!isPkgIgnored) return false;
        } else {
          if (isPkgIgnored) return false;
          if (pkg.status !== status) return false;
        }
      }
      if (search && !pkg.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [packages, ecosystem, status, search, ignoredSet]);

  const totalPages = Math.ceil((filteredPackages?.length ?? 0) / itemsPerPage);

  const displayedPackages = useMemo(() => {
    return filteredPackages.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredPackages, currentPage, itemsPerPage]);

  const paginatedPackages = displayedPackages;

  // Synchronize active package in details panel with latest package data
  const activeDetailPackage = useMemo(() => {
    if (!selectedPackageForDetails) return null;
    const found = packages?.find((p: Package) => p.id === selectedPackageForDetails.id);
    return found ? { ...selectedPackageForDetails, ...found } : selectedPackageForDetails;
  }, [selectedPackageForDetails, packages]);

  // Fetch metadata specifically for activeDetailPackage when opened in the details dialog
  useEffect(() => {
    if (!activeDetailPackage) {
      setDetailsMetaLoading(false);
      return;
    }

    const pkg = activeDetailPackage;
    if (pkg.description && pkg.description !== "No description available" && pkg.description.trim()) {
      setDetailsMetaLoading(false);
      return;
    }

    const ecoStr = String(pkg.ecosystem);
    const normEco = (ecoStr === 'venv' || ecoStr === 'conda' || ecoStr === 'python') ? 'pip' : ecoStr;
    const pypiNormalizedName = normEco === 'pip' ? pkg.name.toLowerCase().replace(/[._]/g, '-') : pkg.name.toLowerCase();
    const metaKey = `${normEco}:${pypiNormalizedName}`;
    const cached = metadataMap[metaKey] || memoryCache.get(metaKey);
    if (cached && !cached.error) {
      setDetailsMetaLoading(false);
      return;
    }

    let isMounted = true;
    setDetailsMetaLoading(true);

    fetchPackageMetadata(pkg.name, normEco)
      .then((meta) => {
        if (!isMounted) return;
        setMetadataMap((prev) => ({ ...prev, [metaKey]: meta }));
      })
      .finally(() => {
        if (isMounted) {
          setDetailsMetaLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [activeDetailPackage?.id, activeDetailPackage?.name, activeDetailPackage?.ecosystem]);

  // Asynchronously fetch descriptions for packages currently displayed on screen (bounded, deduplicated)
  useEffect(() => {
    if (!displayedPackages || displayedPackages.length === 0) return;

    let isMounted = true;
    const packagesToFetch = displayedPackages.filter((p: Package) => {
      if ((p as any).summary && (p as any).summary.trim() && (p as any).summary !== "No description available") {
        return false;
      }
      if (p.description && p.description !== "No description available" && p.description.trim()) {
        return false;
      }
      const ecoStr = String(p.ecosystem);
      const normEco = (ecoStr === 'venv' || ecoStr === 'conda' || ecoStr === 'python') ? 'pip' : ecoStr;
      const pypiNormalizedName = normEco === 'pip' ? p.name.toLowerCase().replace(/[._]/g, '-') : p.name.toLowerCase();
      const key = `${normEco}:${pypiNormalizedName}`;
      if (memoryCache.has(key)) return false;
      if (inFlightKeys.has(key)) return false;
      return true;
    });

    if (packagesToFetch.length === 0) return;

    packagesToFetch.forEach((p: Package) => {
      const ecoStr = String(p.ecosystem);
      const normEco = (ecoStr === 'venv' || ecoStr === 'conda' || ecoStr === 'python') ? 'pip' : ecoStr;
      const pypiNormalizedName = normEco === 'pip' ? p.name.toLowerCase().replace(/[._]/g, '-') : p.name.toLowerCase();
      inFlightKeys.add(`${normEco}:${pypiNormalizedName}`);
    });

    const fetchQueue = async () => {
      try {
        const api = (window as any).electronAPI;
        if (api?.getBatchMetadata) {
          const items = packagesToFetch.map((p: Package) => ({ name: p.name, ecosystem: p.ecosystem }));
          const batchResults = await api.getBatchMetadata(items);
          if (!isMounted) return;
          for (const [key, meta] of Object.entries(batchResults as Record<string, PackageMetadata>)) {
            memoryCache.set(key, meta);
            inFlightKeys.delete(key);
          }
          saveMetadataCache();
          setMetadataMap(prev => ({ ...prev, ...batchResults }));
          return;
        }

        const BATCH_SIZE = 4;
        for (let i = 0; i < packagesToFetch.length; i += BATCH_SIZE) {
          if (!isMounted) break;
          const chunk = packagesToFetch.slice(i, i + BATCH_SIZE);
          const results = await Promise.all(
            chunk.map(async (pkg: Package) => {
              const pkgEcoStr = String(pkg.ecosystem);
              const normEco = (pkgEcoStr === 'venv' || pkgEcoStr === 'conda' || pkgEcoStr === 'python') ? 'pip' : pkgEcoStr;
              const pypiNormalizedName = normEco === 'pip' ? pkg.name.toLowerCase().replace(/[._]/g, '-') : pkg.name.toLowerCase();
              const key = `${normEco}:${pypiNormalizedName}`;
              const meta = await fetchPackageMetadata(pkg.name, normEco);
              inFlightKeys.delete(key);
              return { key, meta };
            })
          );

          if (isMounted) {
            setMetadataMap(prev => {
              const next = { ...prev };
              for (const r of results) {
                next[r.key] = r.meta;
              }
              return next;
            });
          }
        }
      } finally {
        packagesToFetch.forEach((p: Package) => {
          const ecoStr = String(p.ecosystem);
          const normEco = (ecoStr === 'venv' || ecoStr === 'conda' || ecoStr === 'python') ? 'pip' : ecoStr;
          const pypiNormalizedName = normEco === 'pip' ? p.name.toLowerCase().replace(/[._]/g, '-') : p.name.toLowerCase();
          inFlightKeys.delete(`${normEco}:${pypiNormalizedName}`);
        });
      }
    };

    fetchQueue();

    return () => {
      isMounted = false;
    };
  }, [displayedPackages]);

  // Count of currently displayed packages that are selected
  const selectedDisplayedCount = useMemo(() => {
    if (displayedPackages.length === 0) return 0;
    return displayedPackages.reduce((acc: number, p: Package) => acc + (selectedIds.has(p.id) ? 1 : 0), 0);
  }, [displayedPackages, selectedIds]);

  // Are all currently displayed packages selected?
  const isAllDisplayedSelected = useMemo(() => {
    return displayedPackages.length > 0 && selectedDisplayedCount === displayedPackages.length;
  }, [displayedPackages.length, selectedDisplayedCount]);

  // Header checkbox state: false (unchecked), true (checked), or "indeterminate"
  const headerCheckboxState = useMemo<boolean | "indeterminate">(() => {
    if (displayedPackages.length === 0) return false;
    if (selectedDisplayedCount === 0) return false;
    if (selectedDisplayedCount === displayedPackages.length) return true;
    return "indeterminate";
  }, [displayedPackages.length, selectedDisplayedCount]);

  // Manual selection toggle for single package
  const toggleSelect = (id: any) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= MAX_SELECTION) {
        toast({
          title: "Selection limit reached",
          description: "You can select a maximum of 10 packages at a time. Deselect one or more packages before selecting additional ones.",
        });
        return prev;
      }
      next.add(id);
      return next;
    });
  };

  // Bulk select displayed packages up to limit
  const selectDisplayed = () => {
    if (displayedPackages.length === 0) return;

    setSelectedIds((prev) => {
      const remainingCapacity = MAX_SELECTION - prev.size;
      if (remainingCapacity <= 0) {
        toast({
          title: "Selection limit reached",
          description: "You already have 10 packages selected. Deselect one or more packages before selecting additional ones.",
        });
        return prev;
      }

      const unselectedInView = displayedPackages.filter((p: Package) => !prev.has(p.id));
      if (unselectedInView.length === 0) {
        return prev;
      }

      const toAdd = unselectedInView.slice(0, remainingCapacity);
      const next = new Set(prev);
      toAdd.forEach((p: Package) => next.add(p.id));

      if (unselectedInView.length > remainingCapacity) {
        toast({
          title: "Selection limit reached",
          description: `Selected ${toAdd.length} additional package${toAdd.length > 1 ? 's' : ''} to reach the 10-package limit.`,
        });
      }

      return next;
    });
  };

  // Bulk deselect displayed packages only (preserves outside selections)
  const deselectDisplayed = () => {
    if (displayedPackages.length === 0) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      displayedPackages.forEach((p: Package) => next.delete(p.id));
      return next;
    });
  };

  // Header button click
  const handleSelectAllButtonClick = () => {
    if (isAllDisplayedSelected) {
      deselectDisplayed();
    } else {
      selectDisplayed();
    }
  };

  // Header checkbox click
  const handleHeaderCheckboxChange = () => {
    if (headerCheckboxState === true) {
      deselectDisplayed();
    } else {
      selectDisplayed();
    }
  };

  const getStatusBadge = (pkgStatus: string, isIgnored?: boolean) => {
    if (isIgnored || pkgStatus === 'ignored') {
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border border-gray-200 bg-gray-50/90 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
          <span className="text-[11px] font-semibold text-gray-500">Ignored</span>
        </div>
      );
    }

    let dotColor = MUTED;
    let label = "Unknown";
    
    switch (pkgStatus) {
      case 'up-to-date':
        dotColor = '#10B981';
        label = "Up to date";
        break;
      case 'patch':
        dotColor = ACCENT;
        label = "Patch";
        break;
      case 'minor':
        dotColor = '#F59E0B';
        label = "Minor";
        break;
      case 'major':
        dotColor = '#EF4444';
        label = "Major";
        break;
      case 'failed':
        dotColor = '#EF4444';
        label = "Failed";
        break;
      default:
        if (pkgStatus && pkgStatus !== 'unknown') {
          label = pkgStatus.charAt(0).toUpperCase() + pkgStatus.slice(1);
        }
    }

    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full border" style={{ borderColor: BORDER, backgroundColor: 'white' }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColor }}></span>
        <span className="text-[11px] font-medium" style={{ color: HEADING }}>{label}</span>
      </div>
    );
  };

  return (
    <div className="min-h-full" style={{ backgroundColor: BG }} data-testid="packages-page">
      {modalState.show && (
        <UpdateOverlay 
          status={modalState.status} 
          pkgName={modalState.pkg?.name ?? undefined}
          fromVersion={modalState.pkg?.installedVersion ?? undefined}
          toVersion={modalState.pkg?.latestVersion ?? undefined}
          error={modalState.error}
          isBulk={modalState.isBulk}
          count={modalState.count}
          total={modalState.total}
          completed={modalState.completed}
          successful={modalState.successful}
          failed={modalState.failed}
          currentPackage={modalState.currentPackage}
          startTime={modalState.startTime}
          logs={modalState.logs}
          onRetry={() => modalState.pkg && handleUpdate(modalState.pkg)}
          onDismiss={() => {
            if (modalState.status === 'completed' || modalState.status === 'failed') {
              if (ecosystem === 'venv') {
                qc.invalidateQueries({ queryKey: ['venvs', 'packages', activeVenvPath] });
              } else {
                qc.invalidateQueries({ queryKey: getListPackagesQueryKey() });
              }
            }
            setModalState({ ...modalState, show: false });
          }}
        />
      )}

      {/* Package Details Dialog */}
      <Dialog 
        open={!!activeDetailPackage} 
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPackageForDetails(null);
            setDetailsConfirmAction(null);
            setCheckSingleStatus({ status: 'idle', message: '' });
          }
        }}
      >
        <DialogContent 
          className="w-[min(720px,calc(100vw-32px))] max-w-[720px] p-0 gap-0 overflow-hidden bg-white rounded-xl shadow-2xl border box-border max-h-[min(90vh,calc(100vh-32px))] flex flex-col"
          style={{ width: "min(720px, calc(100vw - 32px))", maxWidth: "720px", maxHeight: "min(90vh, calc(100vh - 32px))", borderColor: BORDER }}
        >
          {activeDetailPackage && (() => {
            const pkg = activeDetailPackage;
            const ecoStr = String(pkg.ecosystem);
            const normEco = (ecoStr === 'venv' || ecoStr === 'conda' || ecoStr === 'python') ? 'pip' : ecoStr;
            const pypiNormalizedName = normEco === 'pip' ? pkg.name.toLowerCase().replace(/[._]/g, '-') : pkg.name.toLowerCase();
            const metaKey = `${normEco}:${pypiNormalizedName}`;
            const cachedMeta = metadataMap[metaKey] || memoryCache.get(metaKey);
            const hasExistingDesc = !!(pkg.description && pkg.description !== "No description available" && pkg.description.trim());
            const isDescPending = detailsMetaLoading || (!hasExistingDesc && !cachedMeta);
            const fullDesc = getPackageDescription(pkg);
            const isFallback = fullDesc === "No description provided by the package publisher.";
            const isErrorDesc = fullDesc === "Description temporarily unavailable. Retry when connected.";
            const hasUpdate = pkg.status !== 'up-to-date' && !!pkg.latestVersion && pkg.latestVersion !== pkg.installedVersion;
            const registryUrl = getRegistryUrl(pkg);
            const homepageUrl = cachedMeta?.homepage || (pkg as any).homepageUrl;
            const isOperating = updatingId === pkg.id;
            const matchedEnv = environments?.find(e => e.id === pkg.environmentId || e.name === pkg.environmentName);
            const envName = pkg.environmentName || matchedEnv?.name || "Global";
            const envLocation = pkg.environmentPath || matchedEnv?.path || null;
            const isIgnored = pkg.status === 'ignored' || ignoredSet.has(pkg.name?.trim().toLowerCase()) || ignoredSet.has(pkg.name?.trim().toLowerCase().replace(/[._]/g, '-'));

            return (
              <div className="flex flex-col h-full max-h-[min(90vh,calc(100vh-32px))] w-full box-border overflow-hidden">
                <DialogHeader className="sr-only">
                  <DialogTitle>{pkg.name} Package Details</DialogTitle>
                  <DialogDescription>Details and management for {pkg.name}</DialogDescription>
                </DialogHeader>

                {/* Header */}
                <div className="p-5 sm:p-6 pb-4 pr-12 border-b bg-gray-50/50 shrink-0 box-border" style={{ borderColor: BORDER }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${ACCENT}15` }}>
                        <PackageIcon className="w-6 h-6 shrink-0" style={{ color: ACCENT }} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-xl font-bold tracking-tight truncate max-w-full" style={{ color: HEADING }} title={pkg.name}>{pkg.name}</h2>
                          <Badge variant="outline" className="uppercase font-mono text-[10px] tracking-wider px-2 py-0.5 bg-white shrink-0" style={{ borderColor: BORDER, color: MUTED }}>
                            {pkg.ecosystem}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                          <p className="text-xs truncate" style={{ color: MUTED }}>
                            Installed in <span className="font-semibold text-gray-700">{envName}</span>
                          </p>
                          {envLocation && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5 rounded hover:bg-gray-200/70 shrink-0 text-gray-400 hover:text-gray-700"
                              title={`Copy location: ${envLocation}`}
                              onClick={() => copyToClipboard(envLocation, "Environment location")}
                            >
                              {copiedField === "Environment location" ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Scrollable Content */}
                <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 box-border min-h-0">
                  {/* Description Card */}
                  <div className="rounded-lg p-3.5 border bg-gray-50/70 box-border" style={{ borderColor: `${BORDER}99` }}>
                    <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Package Description</span>
                      {homepageUrl && (
                        <a 
                          href={homepageUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline shrink-0"
                          style={{ color: ACCENT }}
                        >
                          <Globe className="w-3 h-3" />
                          <span>Homepage</span>
                        </a>
                      )}
                    </div>
                    {isDescPending ? (
                      <div className="flex items-center gap-2 py-1 text-sm text-gray-500">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: ACCENT }} />
                        <span>Loading package information…</span>
                      </div>
                    ) : isErrorDesc ? (
                      <p className="text-sm leading-relaxed text-amber-700">
                        Description temporarily unavailable. Retry when connected.
                      </p>
                    ) : (
                      <div className="max-h-48 overflow-y-auto pr-1">
                        <p className={cn("text-sm leading-relaxed break-words whitespace-pre-wrap", isFallback ? "text-gray-400 italic" : "text-gray-900")}>
                          {fullDesc}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Metadata Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 box-border">
                    {/* Installed Version */}
                    <div className="p-3 rounded-lg border bg-white box-border flex flex-col justify-between" style={{ borderColor: BORDER }}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block mb-1">Installed Version</span>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <code className="text-sm font-mono font-bold truncate" style={{ color: HEADING }} title={pkg.installedVersion || "Unknown"}>
                          {pkg.installedVersion || "Unknown"}
                        </code>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 rounded-md shrink-0"
                          title="Copy installed version"
                          onClick={() => copyToClipboard(pkg.installedVersion, "Installed version")}
                        >
                          {copiedField === "Installed version" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" style={{ color: MUTED }} />}
                        </Button>
                      </div>
                    </div>

                    {/* Latest Version */}
                    <div className="p-3 rounded-lg border bg-white box-border flex flex-col justify-between" style={{ borderColor: BORDER }}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block mb-1">Latest Available</span>
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <code className="text-sm font-mono font-bold truncate" style={{ color: hasUpdate ? ACCENT : HEADING }} title={pkg.latestVersion || pkg.installedVersion || "Unknown"}>
                          {pkg.latestVersion || pkg.installedVersion || "Unknown"}
                        </code>
                        {hasUpdate ? (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: `${ACCENT}15`, color: ACCENT }}>
                            Update available
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
                            Up to date
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Package Status */}
                    <div className="p-3 rounded-lg border bg-white box-border flex flex-col justify-between" style={{ borderColor: BORDER }}>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block mb-1">Status</span>
                      <div className="mt-0.5">
                        {getStatusBadge(pkg.status, isIgnored)}
                      </div>
                    </div>

                    {/* Environment Details */}
                    <div className="p-3 rounded-lg border bg-white box-border flex flex-col justify-between min-w-0" style={{ borderColor: BORDER }}>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 block">Environment</span>
                        {envLocation && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 rounded hover:bg-gray-100 shrink-0 text-gray-400 hover:text-gray-700"
                            title={`Copy location: ${envLocation}`}
                            onClick={() => copyToClipboard(envLocation, "Environment location")}
                          >
                            {copiedField === "Environment location" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" style={{ color: MUTED }} />}
                          </Button>
                        )}
                      </div>
                      <div className="mt-0.5 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: HEADING }} title={envName}>{envName}</p>
                        {envLocation && (
                          <p className="text-[10px] font-mono truncate text-gray-400 mt-0.5" title={envLocation}>
                            {envLocation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* External Registry Link */}
                  {registryUrl && (
                    <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-dashed bg-gray-50/50 box-border flex-wrap sm:flex-nowrap min-w-0" style={{ borderColor: BORDER }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <ExternalLink className="w-4 h-4 shrink-0" style={{ color: ACCENT }} />
                        <span className="text-xs font-medium text-gray-700 truncate">Official Package Registry</span>
                      </div>
                      <a 
                        href={registryUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline shrink-0 whitespace-nowrap"
                        style={{ color: ACCENT }}
                      >
                        <span>View on {String(pkg.ecosystem) === 'npm' || String(pkg.ecosystem) === 'pnpm' || String(pkg.ecosystem) === 'yarn' ? 'npm' : 'PyPI'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    </div>
                  )}

                  {/* Version Check Feedback */}
                  {checkSingleStatus.status !== 'idle' && (
                    <div className={cn(
                      "p-3 rounded-lg text-xs flex items-center gap-2 border box-border",
                      checkSingleStatus.status === 'checking' && "bg-blue-50/70 border-blue-200 text-blue-700",
                      checkSingleStatus.status === 'success' && "bg-emerald-50/70 border-emerald-200 text-emerald-800",
                      checkSingleStatus.status === 'error' && "bg-red-50/70 border-red-200 text-red-700"
                    )}>
                      {checkSingleStatus.status === 'checking' && <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />}
                      {checkSingleStatus.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                      {checkSingleStatus.status === 'error' && <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                      <span className="break-words">{checkSingleStatus.message}</span>
                    </div>
                  )}

                  {/* Inline Confirmation: Update */}
                  {detailsConfirmAction === 'update' && (
                    <div className="bg-indigo-50/90 border border-indigo-200 rounded-lg p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150 box-border">
                      <div className="flex items-start gap-2.5">
                        <RefreshCw className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Confirm Package Update</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Update <span className="font-semibold text-gray-900">{pkg.name}</span> from version <code className="font-mono text-gray-800 font-bold">{pkg.installedVersion}</code> to <code className="font-mono text-indigo-700 font-bold">{pkg.latestVersion}</code> in <span className="font-semibold">{envName}</span>?
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setDetailsConfirmAction(null)}
                          className="h-8 text-xs bg-white"
                          style={{ borderColor: BORDER }}
                        >
                          Cancel
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={() => {
                            setDetailsConfirmAction(null);
                            setSelectedPackageForDetails(null);
                            handleUpdate(pkg);
                          }}
                          className="h-8 text-xs text-white"
                          style={{ backgroundColor: ACCENT }}
                          disabled={isOperating}
                        >
                          {isOperating ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                          Confirm Update
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Inline Confirmation: Uninstall */}
                  {detailsConfirmAction === 'uninstall' && (
                    <div className="bg-red-50/90 border border-red-200 rounded-lg p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150 box-border">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-semibold text-red-900">Confirm Package Removal</p>
                          <p className="text-xs text-red-700 mt-0.5">
                            Are you sure you want to uninstall <span className="font-bold text-red-950">{pkg.name}</span> from <span className="font-bold text-red-950">{envName}</span>? This will remove the package from this environment.
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setDetailsConfirmAction(null)}
                          className="h-8 text-xs bg-white"
                          style={{ borderColor: BORDER }}
                        >
                          Cancel
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          onClick={() => {
                            setDetailsConfirmAction(null);
                            handleDelete(pkg, true);
                          }}
                          className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
                          disabled={isOperating}
                        >
                          {isOperating ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                          Yes, Uninstall
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="p-3 sm:p-4 px-4 sm:px-6 border-t bg-gray-50 flex items-center justify-between gap-2.5 flex-wrap shrink-0 box-border" style={{ borderColor: BORDER }}>
                  {/* Left: Copy utility actions */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => copyToClipboard(pkg.name, "Package name")}
                      className="h-8 px-2.5 text-xs flex items-center gap-1.5 bg-white shrink-0"
                      style={{ borderColor: BORDER, color: MUTED }}
                    >
                      {copiedField === "Package name" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copy Name</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => copyToClipboard(pkg.installedVersion, "Installed version")}
                      className="h-8 px-2.5 text-xs flex items-center gap-1.5 bg-white shrink-0"
                      style={{ borderColor: BORDER, color: MUTED }}
                    >
                      {copiedField === "Installed version" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copy Version</span>
                    </Button>
                    {envLocation && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => copyToClipboard(envLocation, "Environment location")}
                        className="h-8 px-2.5 text-xs flex items-center gap-1.5 bg-white shrink-0"
                        style={{ borderColor: BORDER, color: MUTED }}
                      >
                        {copiedField === "Environment location" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>Copy Location</span>
                      </Button>
                    )}
                  </div>

                  {/* Right: Management actions */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleCheckSingleVersion(pkg)}
                      disabled={isCheckingSingle || isOperating}
                      className="h-8 px-3 text-xs flex items-center gap-1.5 bg-white shrink-0"
                      style={{ borderColor: BORDER, color: HEADING }}
                    >
                      <RefreshCw className={cn("w-3.5 h-3.5", isCheckingSingle && "animate-spin")} />
                      <span>{isCheckingSingle ? "Checking..." : "Check Latest Version"}</span>
                    </Button>

                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setDetailsConfirmAction(detailsConfirmAction === 'uninstall' ? null : 'uninstall')}
                      disabled={isOperating}
                      className="h-8 px-3 text-xs flex items-center gap-1.5 text-red-600 border-red-200 hover:bg-red-50 bg-white shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Uninstall</span>
                    </Button>

                    {/* Only show Update button when an update is actually needed */}
                    {hasUpdate && (
                      <Button 
                        size="sm" 
                        onClick={() => setDetailsConfirmAction(detailsConfirmAction === 'update' ? null : 'update')}
                        disabled={isOperating}
                        className="h-8 px-3.5 text-xs flex items-center gap-1.5 text-white font-medium shadow-sm shrink-0"
                        style={{ backgroundColor: ACCENT }}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        <span>Update to {pkg.latestVersion}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <header className="px-6 py-4 flex justify-between items-end shrink-0 bg-white border-b" style={{ borderColor: BORDER }}>
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: MUTED }}>Dependency Management</p>
          <p className="text-sm" style={{ color: MUTED }}>System-wide dependency inventory · Last scanned: {formatRelativeTime(lastScanned)}</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button 
              onClick={handleUpdateAll}
              variant="outline"
              className="flex items-center gap-2 h-9 px-4 rounded-md font-medium text-sm"
              style={{ borderColor: ACCENT, color: ACCENT, backgroundColor: 'white' }}
            >
              <Zap className="w-4 h-4" />
              Update All ({selectedIds.size})
            </Button>
          )}
          <Button 
            variant="outline" 
            onClick={handleSelectAllButtonClick}
            disabled={displayedPackages.length === 0}
            className="h-9 px-4 rounded-md font-medium text-sm"
            style={{ 
              borderColor: isAllDisplayedSelected ? ACCENT : BORDER, 
              color: isAllDisplayedSelected ? ACCENT : HEADING,
              backgroundColor: isAllDisplayedSelected ? `${ACCENT}08` : 'white'
            }}
          >
            {isAllDisplayedSelected ? "Deselect All" : "Select All"}
          </Button>
          <Button 
            onClick={handleCheckVersions}
            className="flex items-center gap-2 h-9 px-4 rounded-md font-medium text-sm text-white"
            style={{ backgroundColor: ACCENT }}
          >
            <RefreshCw className="w-4 h-4" />
            Check Versions
          </Button>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <Tabs value={ecosystem} onValueChange={setEcosystem} className="w-full lg:w-auto">
              <TabsList className="bg-surface-container-low border border-card-border p-1 rounded-lg h-9">
                <TabsTrigger 
                  value="all" 
                  className="rounded-md px-4 h-7 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-white transition-all"
                >
                  All
                </TabsTrigger>
                <TabsTrigger 
                  value="pip" 
                  className="rounded-md px-4 h-7 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-white transition-all"
                >
                  Global Python
                </TabsTrigger>
                <TabsTrigger 
                  value="npm" 
                  className="rounded-md px-4 h-7 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-white transition-all"
                >
                  Node.js
                </TabsTrigger>
                <TabsTrigger 
                  value="venv" 
                  className="rounded-md px-4 h-7 text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-white transition-all"
                >
                  Venvs
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-3">
              {ecosystem === 'venv' && (
                <Select value={activeVenvPath || ""} onValueChange={setActiveVenvPath}>
                  <SelectTrigger className="w-[200px] h-9 bg-white rounded-md text-sm font-medium" style={{ borderColor: BORDER, color: HEADING }}>
                    <SelectValue placeholder="Select Venv..." />
                  </SelectTrigger>
                  <SelectContent className="rounded-md bg-white" style={{ borderColor: BORDER }}>
                    {registeredVenvs?.map((venv: any) => (
                      <SelectItem key={venv.path} value={venv.path} className="text-sm font-medium">
                        {venv.name}
                      </SelectItem>
                    ))}
                    {!registeredVenvs?.length && (
                      <SelectItem value="none" disabled>No venvs tracked</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}

              <div className="relative group flex-1 min-w-[240px] lg:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: MUTED }} />
                <input
                  type="text"
                  placeholder="Search packages..."
                  className="w-full h-9 pl-9 pr-4 bg-white border rounded-md text-sm font-medium focus:outline-none focus:ring-2 transition-all"
                  style={{ borderColor: BORDER, color: HEADING }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[140px] h-9 bg-white rounded-md text-sm font-medium" style={{ borderColor: BORDER, color: HEADING }}>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent className="rounded-md bg-white" style={{ borderColor: BORDER }}>
                  <SelectItem value="all" className="text-sm font-medium">All Status</SelectItem>
                  <SelectItem value="up-to-date" className="text-sm font-medium">Up to date</SelectItem>
                  <SelectItem value="patch" className="text-sm font-medium">Patch</SelectItem>
                  <SelectItem value="minor" className="text-sm font-medium">Minor</SelectItem>
                  <SelectItem value="major" className="text-sm font-medium">Major</SelectItem>
                  <SelectItem value="failed" className="text-sm font-medium">Failed</SelectItem>
                  <SelectItem value="ignored" className="text-sm font-medium">Ignored</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden flex flex-col" style={{ borderColor: BORDER, borderRadius: '8px' }}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b" style={{ backgroundColor: '#F9FAFB', borderColor: BORDER }}>
                  <th className="px-4 py-3 text-left w-12">
                    <Checkbox 
                      checked={headerCheckboxState} 
                      onCheckedChange={handleHeaderCheckboxChange}
                      disabled={displayedPackages.length === 0}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Package</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Environment</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Installed</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Latest</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>Status</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${BORDER}66` }}>
                      <td colSpan={7} className="px-4 py-4">
                        <div className="h-10 rounded-md animate-pulse" style={{ backgroundColor: '#F3F4F6' }} />
                      </td>
                    </tr>
                  ))
                ) : !paginatedPackages?.length ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-sm" style={{ color: MUTED }}>
                      No packages found.
                    </td>
                  </tr>
                ) : (
                  paginatedPackages.map((pkg: Package) => {
                    const ecoStr = String(pkg.ecosystem);
                    const normEco = (ecoStr === 'venv' || ecoStr === 'conda' || ecoStr === 'python') ? 'pip' : ecoStr;
                    const pypiNormalizedName = normEco === 'pip' ? pkg.name.toLowerCase().replace(/[._]/g, '-') : pkg.name.toLowerCase();
                    const summary = getPackageSummary(pkg);
                    const isPkgIgnored = pkg.status === 'ignored' || ignoredSet.has(pkg.name?.trim().toLowerCase()) || ignoredSet.has(pkg.name?.trim().toLowerCase().replace(/[._]/g, '-'));
                    const isDescPending = summary === "Loading package information…";

                    return (
                      <tr 
                        key={pkg.id} 
                        onClick={() => handleRowClick(pkg)}
                        className="transition-colors cursor-pointer"
                        style={{ 
                          borderBottom: `1px solid ${BORDER}66`,
                          backgroundColor: selectedIds.has(pkg.id) ? 'rgba(79, 70, 229, 0.05)' : 'transparent'
                        }}
                        onMouseEnter={(e) => { if (!selectedIds.has(pkg.id)) e.currentTarget.style.backgroundColor = '#F0F0FF'; }}
                        onMouseLeave={(e) => { if (!selectedIds.has(pkg.id)) e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox 
                            checked={selectedIds.has(pkg.id)} 
                            onCheckedChange={() => toggleSelect(pkg.id)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: '#F3F4F6' }}>
                              <PackageIcon className="w-4 h-4" style={{ color: MUTED }} />
                            </div>
                            <div className="min-w-0">
                              <span className="text-sm font-medium block truncate" style={{ color: HEADING }}>{pkg.name}</span>
                              <span 
                                className="text-xs truncate max-w-[340px] block" 
                                title={summary} 
                                style={{ color: isDescPending ? '#9CA3AF' : MUTED }}
                              >
                                {summary}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-gray-50 rounded-full text-[11px] font-medium border" style={{ color: MUTED, borderColor: BORDER }}>
                            {pkg.environmentName || environments?.find(e => e.id === pkg.environmentId)?.name || "Global"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-[13px]" style={{ color: MUTED }}>
                          {pkg.installedVersion}
                          {(pkg as any).isDifferentFromGlobal && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1 cursor-help" style={{ backgroundColor: '#FEF3C7', color: '#D97706', borderColor: '#FDE68A' }}>
                                    diff
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Differs from global version: {(pkg as any).globalVersion}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-[13px] font-medium" style={{ color: HEADING }}>
                          {pkg.latestVersion || pkg.installedVersion}
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(pkg.status, isPkgIgnored)}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 rounded-md"
                                style={{ color: MUTED }}
                                disabled={updatingId === pkg.id}
                              >
                                {updatingId === pkg.id ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MoreVertical className="w-4 h-4" />}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="rounded-md bg-white shadow-lg" style={{ borderColor: BORDER }}>
                              <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); handleRowClick(pkg); }}
                                className="flex items-center gap-2 cursor-pointer text-sm"
                                style={{ color: HEADING }}
                              >
                                <Info className="w-3.5 h-3.5" />
                                <span>View Details</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); handleUpdate(pkg); }}
                                disabled={pkg.status === 'up-to-date' || updatingId === pkg.id}
                                className="flex items-center gap-2 cursor-pointer text-sm"
                                style={{ color: HEADING }}
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                                <span>Update Package</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); handleCheckSingleVersion(pkg); }}
                                className="flex items-center gap-2 cursor-pointer text-sm"
                                style={{ color: HEADING }}
                              >
                                <Zap className="w-3.5 h-3.5" />
                                <span>Check Latest Version</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(pkg.name, 'Package name'); }}
                                className="flex items-center gap-2 cursor-pointer text-sm"
                                style={{ color: HEADING }}
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy Name</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={(e) => { e.stopPropagation(); handleDelete(pkg); }}
                                className="flex items-center gap-2 cursor-pointer text-sm text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete Package</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t flex items-center justify-between bg-transparent" style={{ borderColor: BORDER }}>
            <span className="text-xs font-medium" style={{ color: MUTED }}>
              Showing <span className="font-bold" style={{ color: HEADING }}>{isLoading ? "0" : `${(currentPage - 1) * itemsPerPage + 1} - ${Math.min(currentPage * itemsPerPage, filteredPackages?.length ?? 0)}`}</span> of {filteredPackages?.length ?? 0} packages
            </span>
            <div className="flex items-center gap-1.5">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 rounded-md"
                style={{ borderColor: BORDER, color: MUTED }}
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                <ChevronDown className="w-4 h-4 rotate-90" />
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1))
                  .map((p, i, arr) => (
                    <React.Fragment key={p}>
                      {i > 0 && arr[i-1] !== p - 1 && <span className="text-xs px-1" style={{ color: MUTED }}>...</span>}
                      <Button 
                        onClick={() => setCurrentPage(p)}
                        className={cn(
                          "h-8 w-8 rounded-md text-xs font-medium transition-all"
                        )}
                        style={{
                          backgroundColor: currentPage === p ? ACCENT : 'transparent',
                          color: currentPage === p ? 'white' : MUTED
                        }}
                      >
                        {p}
                      </Button>
                    </React.Fragment>
                  ))
                }
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-8 w-8 rounded-md"
                style={{ borderColor: BORDER, color: MUTED }}
                disabled={currentPage === totalPages || totalPages === 0}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                <ChevronDown className="w-4 h-4 -rotate-90" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
