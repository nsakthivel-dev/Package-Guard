import React from "react";
import { Minus, Square, X, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export function TitleBar() {
  const api = (window as any).electronAPI;

  return (
    <div 
      className="bg-surface-container-low/50 backdrop-blur-md border-b border-outline-variant/20 flex items-center justify-between z-[100] relative select-none"
      style={{ WebkitAppRegion: 'drag', height: '32px' } as any}
    >
      <div className="flex items-center h-full">
        <div className="electron-drag-region" />
      </div>

      <div className="flex items-center h-full electron-no-drag" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button 
          onClick={() => api.minimizeWindow()}
          className="w-8 h-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
          title="Minimize"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>remove</span>
        </button>
        <button 
          onClick={() => api.maximizeWindow()}
          className="w-8 h-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
          title="Multiscreen"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>filter_none</span>
        </button>
        <button 
          onClick={() => api.closeWindow()}
          className="w-8 h-full flex items-center justify-center text-on-surface-variant hover:bg-error hover:text-on-error transition-colors"
          title="Close"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
        </button>
      </div>
    </div>
  );
}