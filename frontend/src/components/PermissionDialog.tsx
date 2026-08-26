import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// Palette token pulled from the Dashboard palette
const INDIGO = "#6366F1";
const TEAL   = "#5EEAD4";

export function PermissionDialog() {
  const [show,    setShow]    = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermission = async () => {
      const api = (window as any).electronAPI;
      if (!api) { setLoading(false); return; }
      const prefs = await api.getSettings();
      if (prefs.backgroundPermission === null || !prefs.dontAskAgain) setShow(true);
      setLoading(false);
    };
    checkPermission();
  }, []);

  const handleResponse = async (allowed: boolean) => {
    const api = (window as any).electronAPI;
    if (api) await api.updateSettings({ backgroundPermission: allowed, dontAskAgain: dontAsk });
    setShow(false);
  };

  if (loading || !show) return null;

  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent className="max-w-md p-0 border-none bg-transparent shadow-none focus:outline-none overflow-visible">
        {/*
          Modal card — matches Dashboard card system:
          bg-surface-container-lowest, border-card-border, rounded-2xl (16px),
          shadow-premium pattern
        */}
        <div
          className="w-full rounded-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300"
          style={{
            background: "hsl(var(--surface-container-lowest))",
            border: "1px solid hsl(var(--card-border))",
            boxShadow: "0 20px 48px -8px rgba(0,0,0,0.12), 0 4px 12px -2px rgba(0,0,0,0.06)",
          }}
        >
          <div className="p-7">
            {/* ── Icon tile ──────────────────────────────────────────────── */}
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-5">
                {/* Soft glow halo */}
                <div
                  className="absolute -inset-3 rounded-2xl blur-xl opacity-25"
                  style={{ background: INDIGO }}
                />
                {/* Icon tile — same tinted-bg pattern as Dashboard stat cards */}
                <div
                  className="relative w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: `${INDIGO}1a` }}
                >
                  <span
                    className="material-symbols-outlined text-[36px]"
                    style={{
                      color: INDIGO,
                      fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48",
                    }}
                  >
                    shield_with_heart
                  </span>
                </div>
                {/* Lightning badge — solid indigo circle, reads clearly on the tile */}
                <div
                  className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center shadow-md"
                  style={{ background: INDIGO, border: "2px solid hsl(var(--surface-container-lowest))" }}
                >
                  <span
                    className="material-symbols-outlined text-white text-[13px]"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    bolt
                  </span>
                </div>
              </div>

              {/* ── Typography ─────────────────────────────────────────────── */}
              {/* Title — matches Dashboard card title weight */}
              <h2
                className="text-[18px] font-bold leading-tight mb-1.5"
                style={{ color: "hsl(var(--on-surface))" }}
              >
                Background Scanning
              </h2>
              {/* Subtitle — matches Dashboard muted section subtitle */}
              <p
                className="text-[13px] leading-relaxed max-w-[300px] mb-6"
                style={{ color: "hsl(var(--muted-foreground))" }}
              >
                Allow PackageGuard to stay active in the system tray and scan
                your environments even when this window is closed.
              </p>

              {/* ── Feature blocks ─────────────────────────────────────────── */}
              {/*
                Matches Dashboard's stat card icon-tile language:
                small tinted rounded-square icon + bold label + muted description.
                Separated from the rest of the modal with a light border card.
              */}
              <div
                className="w-full rounded-xl p-4 mb-5 grid grid-cols-2 gap-4"
                style={{
                  background: "hsl(var(--surface-container))",
                  border: "1px solid hsl(var(--card-border))",
                }}
              >
                {/* Notifications */}
                <div className="flex flex-col items-start gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${INDIGO}1a`, color: INDIGO }}
                  >
                    <span
                      className="material-symbols-outlined text-[17px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      notifications_active
                    </span>
                  </div>
                  <div>
                    <p
                      className="text-[12px] font-semibold leading-none mb-1"
                      style={{ color: "hsl(var(--on-surface))" }}
                    >
                      Notifications
                    </p>
                    <p
                      className="text-[11px] leading-snug"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      Real-time alerts for newly discovered vulnerabilities.
                    </p>
                  </div>
                </div>

                {/* Scheduled Audits */}
                <div className="flex flex-col items-start gap-2">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${TEAL}20`, color: "#0f766e" }}
                  >
                    <span
                      className="material-symbols-outlined text-[17px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      update
                    </span>
                  </div>
                  <div>
                    <p
                      className="text-[12px] font-semibold leading-none mb-1"
                      style={{ color: "hsl(var(--on-surface))" }}
                    >
                      Scheduled Audits
                    </p>
                    <p
                      className="text-[11px] leading-snug"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                    >
                      Automated analysis tailored to your security rules.
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Checkbox ───────────────────────────────────────────────── */}
              {/*
                BUG FIX 2: accent-primary sets the checked color to --primary (indigo).
                The default unchecked border is neutral gray via border-[hsl(var(--border))].
                No orange/yellow color remains.
              */}
              <div
                className="flex items-center gap-2.5 mb-6 cursor-pointer select-none"
                onClick={() => setDontAsk(!dontAsk)}
              >
                <input
                  id="dont-ask"
                  type="checkbox"
                  checked={dontAsk}
                  onChange={() => setDontAsk(!dontAsk)}
                  className="w-4 h-4 rounded cursor-pointer accent-primary"
                  style={{
                    // Neutral gray border in default state; browser replaces with accent on check
                    outline: "none",
                    accentColor: INDIGO,
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                <label
                  htmlFor="dont-ask"
                  className="text-[13px] font-medium cursor-pointer"
                  style={{ color: "hsl(var(--muted-foreground))" }}
                >
                  Don't ask me again
                </label>
              </div>

              {/* ── Buttons ────────────────────────────────────────────────── */}
              <div className="flex items-center justify-center w-full gap-3">
                {/*
                  "No, thanks" — ghost/outlined: transparent bg, gray border,
                  same height as Allow & Start.
                */}
                <button
                  onClick={() => handleResponse(false)}
                  className="flex-1 h-10 px-5 rounded-lg text-[13px] font-semibold transition-all hover:bg-surface-container active:scale-95"
                  style={{
                    color: "hsl(var(--on-surface))",
                    border: "1px solid hsl(var(--card-border))",
                    background: "transparent",
                  }}
                >
                  No, thanks
                </button>

                {/*
                  BUG FIX 1: "Allow & Start" — solid indigo, white bold text.
                  Uses the same inline style pattern as Dashboard's Create Snapshot
                  and Scan Now buttons (primary-btn-solid equivalent).
                  Previously rendered as invisible due to missing/undefined
                  `primary-btn-gradient` class.
                */}
                <button
                  onClick={() => handleResponse(true)}
                  className="flex-1 h-10 px-5 rounded-lg text-[13px] font-bold text-white transition-all active:scale-95"
                  style={{
                    background: INDIGO,
                    boxShadow: `0 1px 2px ${INDIGO}40, 0 0 0 1px ${INDIGO}20`,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.08)")}
                  onMouseLeave={(e) => (e.currentTarget.style.filter = "")}
                >
                  Allow &amp; Start
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
