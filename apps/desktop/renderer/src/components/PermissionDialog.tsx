import React, { useState, useEffect } from "react";
import { ShieldCheck, Bell, Clock } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { runAutoScan, loadBootstrapData } from "@/lib/autoScan";
import { usePackageStore } from "@/store/usePackageStore";

export function PermissionDialog() {
  const [show, setShow] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const checkPermission = async () => {
      const api = (window as any).electronAPI;
      if (!api) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        const prefs = await api.getSettings();
        if (isMounted) {
          // If permission is undecided (null) or denied without "don't ask again", show modal
          if (prefs.backgroundPermission === null || (!prefs.dontAskAgain && prefs.backgroundPermission === false)) {
            setShow(true);
          }
        }
      } catch (err) {
        console.error("[PERMISSION] Error checking permission settings:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    checkPermission();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleResponse = async (allowed: boolean) => {
    const api = (window as any).electronAPI;
    if (api) {
      await api.updateSettings({
        backgroundPermission: allowed,
        dontAskAgain: Boolean(dontAsk || allowed),
      });
    }
    setShow(false);

    if (allowed) {
      console.log("[PERMISSION] User granted permission. Loading data and starting scanner.");
      // Explicit user consent: load bootstrap data and start the scan now
      await loadBootstrapData();
      runAutoScan({ force: true });
    } else {
      console.log("[PERMISSION] User declined permission. No scan started.");
      // Ensure scan status remains completely idle
      usePackageStore.getState().setScanStatus("idle");
    }
  };

  const handleDismiss = async () => {
    // Closing via 'X', ESC, or clicking outside behaves safely as declining without starting scan
    await handleResponse(false);
  };

  if (loading || !show) return null;

  return (
    <Dialog open={show} onOpenChange={(open) => { if (!open) handleDismiss(); }}>
      <DialogContent
        overlayClassName="backdrop-blur-sm bg-black/40"
        className="max-w-md p-0 border-none bg-transparent shadow-none focus:outline-none overflow-visible"
      >
        <div className="w-full rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-7 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
          {/* ── Modern crisp icon badge (no blurred halo) ──────────────── */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-b from-indigo-50 to-indigo-100/60 dark:from-indigo-950/50 dark:to-indigo-900/30 border border-indigo-200/80 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm mb-4">
            <ShieldCheck className="w-7 h-7" strokeWidth={2.2} />
          </div>

          {/* ── Typography ─────────────────────────────────────────────── */}
          <h2 className="text-[18px] font-bold tracking-tight text-slate-800 dark:text-slate-100 mb-1.5 leading-tight">
            Background Scanning
          </h2>
          <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 max-w-[320px] mb-6">
            Allow PackageGuard to stay active in the system tray and scan your environments even when this window is closed.
          </p>

          {/* ── Feature highlights ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 w-full mb-6">
            {/* Notifications */}
            <div className="flex flex-col items-start p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/60 text-left">
              <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-2.5">
                <Bell className="w-4 h-4" strokeWidth={2} />
              </div>
              <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 mb-1 leading-none">
                Notifications
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Real-time alerts for newly discovered vulnerabilities.
              </p>
            </div>

            {/* Scheduled Audits */}
            <div className="flex flex-col items-start p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-900/60 text-left">
              <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-950/60 border border-teal-100 dark:border-teal-800/60 flex items-center justify-center text-teal-600 dark:text-teal-400 mb-2.5">
                <Clock className="w-4 h-4" strokeWidth={2} />
              </div>
              <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 mb-1 leading-none">
                Scheduled Audits
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                Automated analysis tailored to your security rules.
              </p>
            </div>
          </div>

          {/* ── Checkbox ───────────────────────────────────────────────── */}
          <div
            className="flex items-center gap-2 mb-6 cursor-pointer select-none text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            onClick={() => setDontAsk(!dontAsk)}
          >
            <input
              id="dont-ask"
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer accent-indigo-600"
              onClick={(e) => e.stopPropagation()}
            />
            <label htmlFor="dont-ask" className="cursor-pointer">
              Don't ask me again
            </label>
          </div>

          {/* ── Button actions ─────────────────────────────────────────── */}
          <div className="flex items-center justify-center w-full gap-3">
            <button
              type="button"
              onClick={handleDismiss}
              className="flex-1 h-10 px-4 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 transition-all active:scale-[0.98] cursor-pointer"
            >
              Maybe Later
            </button>
            <button
              type="button"
              onClick={() => handleResponse(true)}
              className="flex-1 h-10 px-4 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:shadow-md hover:shadow-indigo-500/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              Allow &amp; Start
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
