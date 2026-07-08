import { usePackageStore, UpdateProgress } from "@/store/usePackageStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, Loader2, Download, Package } from "lucide-react";
import { cn } from "@/lib/utils";

export function UpdateProgressModal() {
  const { updateProgress, clearUpdateProgress } = usePackageStore();
  const activeUpdates = Object.values(updateProgress);
  
  if (activeUpdates.length === 0) return null;

  const isAllComplete = activeUpdates.every(u => u.status === 'complete' || u.status === 'failed' || u.status === 'done');
  const total = activeUpdates.length;
  const completed = activeUpdates.filter(u => u.status === 'complete' || u.status === 'done').length;
  const failed = activeUpdates.filter(u => u.status === 'failed').length;
  const progressPercent = (completed + failed) / total * 100;

  return (
    <Dialog open={activeUpdates.length > 0} onOpenChange={(open) => !open && isAllComplete && clearUpdateProgress()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle className="flex items-center justify-between gap-4">
            <span className="truncate">Updating Packages</span>
            <span className="text-xs font-semibold bg-secondary px-2 py-1 rounded-md whitespace-nowrap">
              {completed + failed} / {total} complete
            </span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Overall Progress</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <Progress 
              value={progressPercent} 
              className="h-2" 
              indicatorClassName={cn(
                "transition-all duration-500",
                progressPercent < 30 ? "bg-red-500" :
                progressPercent < 70 ? "bg-amber-500" :
                "bg-emerald-500"
              )}
            />
          </div>
          
          <div className="max-h-[350px] overflow-y-auto space-y-3 pr-1 custom-scrollbar">
            {activeUpdates.map((update) => (
              <div key={update.packageName} className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={cn(
                      "p-1.5 rounded-full",
                      (update.status === 'complete' || update.status === 'done') ? "bg-emerald-500/10 text-emerald-500" :
                      update.status === 'failed' ? "bg-red-500/10 text-red-500" :
                      update.status === 'downloading' ? "bg-blue-500/10 text-blue-500" :
                      "bg-primary/10 text-primary"
                    )}>
                      {(update.status === 'complete' || update.status === 'done') ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : update.status === 'failed' ? (
                        <XCircle className="w-3.5 h-3.5" />
                      ) : update.status === 'downloading' ? (
                        <Download className="w-3.5 h-3.5 animate-bounce" />
                      ) : (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      )}
                    </div>
                    <span className="text-sm font-bold truncate">{update.packageName}</span>
                  </div>
                  <span className={cn(
                    "text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter whitespace-nowrap",
                    (update.status === 'complete' || update.status === 'done') ? "bg-emerald-500 text-emerald-950" :
                    update.status === 'failed' ? "bg-red-500 text-white" :
                    "bg-blue-500 text-blue-950"
                  )}>
                    {update.status === 'done' ? 'complete' : update.status}
                  </span>
                </div>
                
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-medium">
                    <p className={cn(
                      "truncate max-w-[220px]",
                      update.status === 'failed' ? "text-red-400" : "text-foreground"
                    )}>
                      {update.message || "Initializing..."}
                    </p>
                    {update.size && (
                      <span className="flex items-center gap-1 font-mono bg-muted px-1.5 py-0.5 rounded">
                        <Download className="w-2.5 h-2.5" />
                        {update.size}
                      </span>
                    )}
                  </div>
                  {update.percent !== undefined && update.status !== 'complete' && (
                    <Progress value={update.percent} className="h-1" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {isAllComplete && (
          <div className="flex justify-end">
            <button 
              onClick={() => clearUpdateProgress()}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
