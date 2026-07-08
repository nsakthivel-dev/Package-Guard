import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function PermissionDialog() {
  const [show, setShow] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermission = async () => {
      const api = (window as any).electronAPI;
      if (!api) {
        setLoading(false);
        return;
      }
      const prefs = await api.getSettings();
      
      if (prefs.backgroundPermission === null || !prefs.dontAskAgain) {
        setShow(true);
      }
      setLoading(false);
    };
    checkPermission();
  }, []);

  const handleResponse = async (allowed: boolean) => {
    const api = (window as any).electronAPI;
    if (api) {
      await api.updateSettings({ 
        backgroundPermission: allowed, 
        dontAskAgain: dontAsk 
      });
    }
    setShow(false);
  };

  if (loading || !show) return null;

  return (
    <Dialog open={show} onOpenChange={setShow}>
      <DialogContent className="max-w-lg p-0 border-none bg-transparent shadow-none focus:outline-none overflow-visible">
        <div className="glass-modal w-full rounded-3xl shadow-[0_24px_48px_-12px_rgba(0,0,0,0.2)] overflow-hidden relative p-1 animate-in fade-in zoom-in duration-500">
          <div className="glass-inner rounded-[calc(1.5rem-1px)] p-5 md:p-8 relative overflow-hidden">
            {/* Modal Content */}
            <div className="flex flex-col items-center text-center">
              {/* Branding Icon & Illustration Wrapper */}
              <div className="relative mb-4">
                <div className="absolute -inset-4 bg-primary/10 rounded-full blur-2xl"></div>
                <div className="relative w-16 h-20 flex items-center justify-center bg-surface-container-lowest rounded-2xl shadow-lg border border-outline-variant/30 icon-dual-tone">
                  <span className="material-symbols-outlined text-4xl text-primary font-light" style={{ fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 48" }}>shield_with_heart</span>
                </div>
                {/* Tiny floating element indicating 'background' */}
                <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-secondary-container text-on-secondary-container rounded-lg shadow-md border border-background flex items-center justify-center">
                  <span className="material-symbols-outlined text-base">bolt</span>
                </div>
              </div>

              <h2 className="text-[24px] font-bold text-on-surface mb-1.5 tracking-tight">Background Scanning</h2>
              <p className="text-on-surface-variant leading-relaxed max-w-sm mb-6 text-[14px]">
                Allow PackageGuard to stay active in the system tray and scan your environments even when this window is closed.
              </p>

              {/* Integrated System Status Layout */}
              <div className="w-full bg-surface-container-low/50 rounded-2xl border border-outline-variant/30 p-4 mb-6 feature-glow">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Notifications Feature */}
                  <div className="flex flex-col items-center md:items-start text-center md:text-left group">
                    <div className="mb-2 w-9 h-9 flex items-center justify-center bg-primary-fixed rounded-xl text-on-primary-fixed-variant group-hover:scale-110 transition-transform duration-300">
                      <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>notifications_active</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-on-surface text-sm mb-0.5">Notifications</h3>
                      <p className="text-[11px] text-on-surface-variant leading-snug">Real-time alerts for newly discovered vulnerabilities.</p>
                    </div>
                  </div>

                  {/* Scheduled Audits Feature */}
                  <div className="flex flex-col items-center md:items-start text-center md:text-left group">
                    <div className="mb-2 w-9 h-9 flex items-center justify-center bg-tertiary-fixed rounded-xl text-on-tertiary-fixed-variant group-hover:scale-110 transition-transform duration-300">
                      <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>update</span>
                    </div>
                    <div>
                      <h3 className="font-bold text-on-surface text-sm mb-0.5">Scheduled Audits</h3>
                      <p className="text-[11px] text-on-surface-variant leading-snug">Automated analysis tailored to your security rules.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Don't ask again checkbox */}
              <div 
                className="flex items-center gap-2.5 mb-6 hover:opacity-80 transition-opacity cursor-pointer"
                onClick={() => setDontAsk(!dontAsk)}
              >
                <input 
                  className="w-4 h-4 rounded border-outline-variant text-primary focus:ring-primary focus:ring-offset-2 transition-all cursor-pointer bg-white" 
                  id="dont-ask" 
                  type="checkbox"
                  checked={dontAsk}
                  readOnly
                />
                <label className="text-on-surface-variant text-[13px] font-medium cursor-pointer select-none" htmlFor="dont-ask">
                  Don't ask me again
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center w-full gap-3">
                <button 
                  onClick={() => handleResponse(false)}
                  className="w-full sm:w-auto px-7 py-2.5 text-on-surface-variant font-semibold hover:text-on-surface hover:bg-surface-variant/20 rounded-xl transition-all text-sm"
                >
                  No, thanks
                </button>
                <button 
                  onClick={() => handleResponse(true)}
                  className="w-full sm:w-auto px-9 py-3.5 text-on-primary font-bold rounded-xl transition-all primary-btn-gradient active:scale-95 shadow-md text-sm"
                >
                  Allow & Start
                </button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
