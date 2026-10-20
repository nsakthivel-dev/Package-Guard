import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  HardDrive,
  Info,
  ShieldCheck,
  ArrowRight,
  FolderSync
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";

interface ProfileStorageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileStorageDialog({ open, onOpenChange }: ProfileStorageDialogProps) {
  const {
    profileStorageInfo,
    fetchProfileStoragePath,
    selectProfileStorageDir,
    setProfileStoragePath,
    isActionLoading
  } = useAuthStore();
  const { toast } = useToast();

  const [candidatePath, setCandidatePath] = useState<string | null>(null);
  const [candidateWritable, setCandidateWritable] = useState<boolean>(true);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (open) {
      fetchProfileStoragePath();
      setCandidatePath(null);
      setCandidateError(null);
      setShowConfirm(false);
    }
  }, [open, fetchProfileStoragePath]);

  const handleSelectFolder = async () => {
    setCandidateError(null);
    const result = await selectProfileStorageDir();
    if (!result || !result.path) return;

    if (result.path === profileStorageInfo?.currentPath) {
      toast({
        title: "Same Directory Selected",
        description: "The selected directory is already your active profile storage location.",
      });
      return;
    }

    setCandidatePath(result.path);
    setCandidateWritable(result.isWritable);
    setCandidateError(result.error || null);
  };

  const handleCancelCandidate = () => {
    setCandidatePath(null);
    setCandidateError(null);
    setShowConfirm(false);
  };

  const handleInitiateSave = () => {
    if (!candidatePath || !candidateWritable) return;
    setShowConfirm(true);
  };

  const handleConfirmSave = async () => {
    if (!candidatePath) return;

    const res = await setProfileStoragePath(candidatePath);
    if (res.ok) {
      toast({
        title: "Storage Location Updated",
        description: `Profile storage path changed to ${res.path}.`,
      });
      setShowConfirm(false);
      setCandidatePath(null);
      onOpenChange(false);
    } else {
      toast({
        title: "Update Failed",
        description: res.error || "Could not save new storage location.",
        variant: "destructive",
      });
      setShowConfirm(false);
    }
  };

  const currentPath = profileStorageInfo?.currentPath || "Loading configured path...";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xl text-slate-900">
          <DialogHeader className="space-y-1.5 text-left">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                <FolderOpen className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-[18px] font-bold text-slate-900">
                  Profile Storage Location
                </DialogTitle>
                <DialogDescription className="text-[13px] text-slate-500">
                  Choose where profile-specific data is saved on your computer.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Clear Explanation of What Data is Stored Here */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-[12.5px] leading-relaxed text-slate-600">
              <div className="flex items-start gap-2 text-slate-800 font-semibold text-[13px]">
                <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>Scope of Profile Storage</span>
              </div>
              <p>
                This directory stores <strong className="text-slate-800">profile-specific preferences</strong>, cached user identity configurations, and personal export files.
              </p>
              <div className="flex items-start gap-1.5 pt-1 text-[12px] text-slate-500 border-t border-slate-200/60">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  Existing CLI databases (<code className="text-slate-700 font-mono">packageguard.db</code>), snapshots, and history will remain safely in system storage and will <strong className="text-slate-700">not</strong> be moved or overwritten.
                </span>
              </div>
            </div>

            {/* Currently Configured Path */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-semibold text-slate-700 uppercase tracking-wider">
                  Active Storage Directory
                </label>
                {profileStorageInfo && (
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-medium border ${
                      profileStorageInfo.isWritable
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {profileStorageInfo.isWritable ? "Accessible & Writable" : "Write Protected"}
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    readOnly
                    value={currentPath}
                    title={currentPath}
                    className="h-10 text-[13px] font-mono bg-slate-50 border-slate-200 text-slate-800 rounded-xl pr-3 select-all cursor-default"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleSelectFolder}
                  variant="outline"
                  className="h-10 px-4 rounded-xl border-slate-300 text-slate-700 hover:bg-[#E8E9FF] hover:text-[#4338CA] hover:border-[#6366F1] font-medium text-[13px] shrink-0 cursor-pointer"
                >
                  <FolderSync className="w-4 h-4 mr-1.5 text-primary" />
                  Browse...
                </Button>
              </div>
            </div>

            {/* Candidate Directory (if chosen) */}
            {candidatePath && (
              <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-primary uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowRight className="w-3.5 h-3.5" />
                    New Location Selected
                  </span>
                  {candidateWritable ? (
                    <Badge className="bg-emerald-600 text-white text-[11px] font-medium hover:bg-emerald-600">
                      Validated Writable
                    </Badge>
                  ) : (
                    <Badge className="bg-rose-600 text-white text-[11px] font-medium hover:bg-rose-600">
                      Access Denied
                    </Badge>
                  )}
                </div>

                <p className="font-mono text-[13px] text-slate-900 break-all bg-white p-2.5 rounded-lg border border-slate-200/90 shadow-2xs">
                  {candidatePath}
                </p>

                {candidateError && (
                  <div className="flex items-center gap-2 text-rose-600 text-[12px]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{candidateError}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleCancelCandidate}
                    className="h-9 px-3.5 text-[12.5px] rounded-xl text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={!candidateWritable || isActionLoading}
                    onClick={handleInitiateSave}
                    className="h-9 px-4 text-[12.5px] rounded-xl bg-primary hover:bg-[#4338CA] text-white font-medium cursor-pointer"
                  >
                    {isActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
                    Save New Location
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t border-slate-100 flex items-center justify-between sm:justify-between">
            <span className="text-[11.5px] text-slate-400">
              Safe storage configuration with zero data loss.
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-xl border-slate-200 text-slate-700 hover:bg-[#E8E9FF] hover:text-[#4338CA] hover:border-[#6366F1] text-[13px] h-9 px-4 cursor-pointer"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog before applying changes */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl text-slate-900">
          <DialogHeader className="space-y-2 text-left">
            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-1">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <DialogTitle className="text-[17px] font-bold text-slate-900">
              Confirm Storage Location Change
            </DialogTitle>
            <DialogDescription className="text-[13px] text-slate-600 leading-normal">
              Are you sure you want to update your profile storage directory to:
            </DialogDescription>
          </DialogHeader>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[12px] font-mono text-slate-800 break-all select-all">
            {candidatePath}
          </div>

          <div className="text-[12px] text-slate-500 space-y-1">
            <p>• Future profile-specific data and exports will be saved here.</p>
            <p>• Existing system data, databases, and snapshots will remain intact.</p>
          </div>

          <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowConfirm(false)}
              className="rounded-xl text-[13px] h-9 px-4 text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isActionLoading}
              onClick={handleConfirmSave}
              className="rounded-xl bg-primary hover:bg-primary/90 text-white text-[13px] h-9 px-4 font-medium cursor-pointer"
            >
              {isActionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              Confirm and Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
