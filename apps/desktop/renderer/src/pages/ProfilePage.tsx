import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  User,
  LogOut,
  Edit3,
  Save,
  X,
  Loader2,
  Mail,
  Camera,
  Trash2,
  CheckCircle2,
  Calendar
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const [, setLocation] = useLocation();
  const {
    user,
    isActionLoading,
    updateProfile,
    selectProfilePhoto,
    saveProfilePhoto,
    removeProfilePhoto,
    logout,
  } = useAuthStore();
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  // Photo preview modal state
  const [pendingPhoto, setPendingPhoto] = useState<{
    filePath?: string;
    dataUrl: string;
    ext?: string;
    size?: number;
  } | null>(null);


  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName?.trim() || "My Profile");
    }
  }, [user]);

  const effectiveName = user?.displayName?.trim() || "My Profile";
  const userInitials = effectiveName.charAt(0).toUpperCase() || "P";

  const handleCancelEdit = () => {
    if (user) {
      setDisplayName(user.displayName?.trim() || "My Profile");
    }
    setIsEditing(false);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const trimmed = displayName.trim();
    if (!trimmed) {
      toast({
        title: "Validation Error",
        description: "Display name cannot be empty.",
        variant: "destructive",
      });
      return;
    }

    const res = await updateProfile({
      id: user.id,
      displayName: trimmed,
    });

    if (res.success) {
      setIsEditing(false);
      toast({
        title: "Profile Updated",
        description: "Your display name has been saved.",
      });
    } else {
      toast({
        title: "Update Failed",
        description: res.error || "Could not save profile changes.",
        variant: "destructive",
      });
    }
  };

  // Photo selection flow
  const handlePickPhoto = async () => {
    const res = await selectProfilePhoto();
    if (res?.error) {
      toast({
        title: "Photo Selection Error",
        description: res.error,
        variant: "destructive",
      });
      return;
    }
    if (res && !res.canceled && res.dataUrl) {
      setPendingPhoto({
        filePath: res.filePath,
        dataUrl: res.dataUrl,
        ext: res.ext,
        size: res.size,
      });
    }
  };

  const handleSavePhoto = async () => {
    if (!pendingPhoto) return;
    const res = await saveProfilePhoto({
      filePath: pendingPhoto.filePath,
      dataUrl: pendingPhoto.dataUrl,
      ext: pendingPhoto.ext,
    });
    setPendingPhoto(null);
    if (res.success) {
      toast({
        title: "Photo Saved",
        description: "Profile photo updated successfully.",
      });
    } else {
      toast({
        title: "Photo Save Failed",
        description: res.error || "Could not save profile photo.",
        variant: "destructive",
      });
    }
  };

  const handleRemovePhoto = async () => {
    const res = await removeProfilePhoto();
    if (res.success) {
      toast({
        title: "Photo Removed",
        description: "Restored original Google profile photo.",
      });
    } else {
      toast({
        title: "Photo Removal Failed",
        description: res.error || "Could not remove profile photo.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    await logout();
    setShowLogoutDialog(false);
    toast({
      title: "Signed Out",
      description: "Signed out safely. Local workspace data remains intact.",
    });
    setLocation("/login");
  };

  // Helper for real created date
  const formattedCreationDate = (() => {
    if (!user?.createdAt) return null;
    try {
      const d = new Date(user.createdAt);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return null;
    }
  })();

  // State when not signed in
  if (!user) {
    return (
      <div className="max-w-md mx-auto my-16 text-center p-8 bg-white border border-slate-200/90 rounded-2xl shadow-sm text-slate-900 animate-in fade-in duration-200">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4 text-slate-400">
          <User className="w-7 h-7" />
        </div>
        <h2 className="text-[19px] font-bold text-slate-900 mb-1.5">No Active Account Session</h2>
        <p className="text-[13px] text-slate-500 mb-6 max-w-sm mx-auto leading-relaxed">
          Sign in with Google to view your profile and manage connected accounts.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button
            onClick={() => setLocation("/login")}
            className="rounded-xl px-5 h-9 font-medium text-[13px] bg-primary hover:bg-[#4338CA] text-white cursor-pointer"
          >
            Sign In with Google
          </Button>
          <Button
            variant="outline"
            onClick={() => setLocation("/")}
            className="rounded-xl px-4 h-9 font-medium text-[13px] border-slate-200 text-slate-700 cursor-pointer hover:bg-[#E8E9FF] hover:text-[#4338CA] hover:border-[#6366F1]"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-2 space-y-5 animate-in fade-in duration-200 pb-12">
      {/* 1. Page Header */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight">
            My Profile
          </h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            Manage your personal profile and connected Google accounts.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLocation("/")}
          className="rounded-xl text-[12px] border-slate-200 text-slate-700 hover:bg-[#E8E9FF] hover:text-[#4338CA] hover:border-[#6366F1] h-8 px-3"
        >
          Back to Dashboard
        </Button>
      </div>

      {/* 2. Compact, Premium Profile Header Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs text-slate-900">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5 text-center sm:text-left">
          {/* Avatar with Camera Overlay */}
          <div className="relative group shrink-0">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={effectiveName}
                className="w-20 h-20 rounded-2xl object-cover border-2 border-slate-200 shadow-2xs"
              />
            ) : (
              <div className="w-20 h-20 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-primary text-[26px] font-bold shadow-2xs">
                {userInitials}
              </div>
            )}
            <button
              type="button"
              onClick={handlePickPhoto}
              title="Change Photo"
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-md hover:bg-slate-800 transition-transform active:scale-95 cursor-pointer border-2 border-white"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Details & Actions */}
          <div className="flex-1 min-w-0 w-full space-y-2">
            {!isEditing ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                    <h2 className="text-[18px] font-bold text-slate-900 tracking-tight leading-tight truncate">
                      {effectiveName}
                    </h2>
                    {/* Small Google Account Indicator */}
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                      <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Google Account</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-center sm:justify-start gap-1.5 text-slate-500 text-[13px]">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                </div>

                <div className="flex items-center justify-center sm:justify-end gap-2 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    className="rounded-xl border-slate-200 hover:bg-[#E8E9FF] hover:text-[#4338CA] hover:border-[#6366F1] text-[12.5px] font-medium h-8 px-3 gap-1.5 cursor-pointer text-slate-700"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit Profile</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePickPhoto}
                    className="rounded-xl border-slate-200 hover:bg-[#E8E9FF] hover:text-[#4338CA] hover:border-[#6366F1] text-[12.5px] font-medium h-8 px-3 gap-1.5 cursor-pointer text-slate-700"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Change Photo</span>
                  </Button>
                  {user.avatarUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={handleRemovePhoto}
                      title="Restore Google photo"
                      className="rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 text-[12px] h-8 px-2 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleSaveProfile} className="space-y-3 pt-1">
                <div>
                  <Label htmlFor="displayName" className="text-[11.5px] font-semibold text-slate-600 uppercase tracking-wider">
                    Display Name
                  </Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your name"
                    autoFocus
                    className="mt-1 h-9 text-[13px] bg-slate-50 border-slate-200 text-slate-900 rounded-xl"
                  />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleCancelEdit}
                    className="h-8 px-3 text-[12.5px] rounded-xl text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={isActionLoading || !displayName.trim()}
                    className="h-8 px-3.5 text-[12.5px] rounded-xl bg-primary hover:bg-[#4338CA] text-white font-medium cursor-pointer"
                  >
                    {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* 3. Personal Information Section */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs text-slate-900 space-y-3.5">
        <div>
          <h2 className="text-[14.5px] font-semibold text-slate-900">
            Personal Information
          </h2>
          <p className="text-[12px] text-slate-500">
            Relevant identity details for your PackageGuard profile.
          </p>
        </div>

        <div className="divide-y divide-slate-100 border border-slate-200/70 rounded-xl overflow-hidden bg-slate-50/50">
          {/* Display Name Row */}
          <div className="p-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-[11.5px] font-medium text-slate-500 uppercase tracking-wider block">
                Display Name
              </span>
              <span className="text-[13.5px] font-semibold text-slate-900 truncate block mt-0.5">
                {effectiveName}
              </span>
            </div>
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="text-[12px] text-primary hover:underline font-medium cursor-pointer shrink-0"
              >
                Edit
              </button>
            )}
          </div>

          {/* Email Address Row (Read-Only) */}
          <div className="p-3.5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <span className="text-[11.5px] font-medium text-slate-500 uppercase tracking-wider block">
                Email Address
              </span>
              <span className="text-[13.5px] font-semibold text-slate-900 truncate block mt-0.5">
                {user.email}
              </span>
            </div>
            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-md shrink-0">
              Read-only (Google)
            </span>
          </div>

          {/* Profile Photo Row */}
          <div className="p-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={effectiveName}
                  className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary font-bold text-[11px] flex items-center justify-center shrink-0">
                  {userInitials}
                </div>
              )}
              <div className="min-w-0">
                <span className="text-[11.5px] font-medium text-slate-500 uppercase tracking-wider block">
                  Profile Photo
                </span>
                <span className="text-[13px] text-slate-700 truncate block mt-0.5">
                  {user.avatarUrl ? "Custom profile picture saved" : "Default initials avatar"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handlePickPhoto}
              className="text-[12px] text-primary hover:underline font-medium cursor-pointer shrink-0"
            >
              Change
            </button>
          </div>

          {/* Connection Status Row */}
          <div className="p-3.5 flex items-center justify-between gap-4">
            <div>
              <span className="text-[11.5px] font-medium text-slate-500 uppercase tracking-wider block">
                Connection Status
              </span>
              <span className="text-[13px] font-medium text-slate-800 flex items-center gap-1.5 mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Connected via Google OAuth</span>
              </span>
            </div>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md shrink-0">
              Active
            </span>
          </div>

          {/* Account Creation Date (Only if real date available) */}
          {formattedCreationDate && (
            <div className="p-3.5 flex items-center justify-between gap-4">
              <div>
                <span className="text-[11.5px] font-medium text-slate-500 uppercase tracking-wider block">
                  Account Created
                </span>
                <span className="text-[13px] font-medium text-slate-800 flex items-center gap-1.5 mt-0.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{formattedCreationDate}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Account Actions (Sign Out) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs text-slate-900 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[14.5px] font-semibold text-slate-900">
            Sign Out
          </h2>
          <p className="text-[12px] text-slate-500 mt-0.5">
            Disconnect your current session. Local workspace data, CLI history, and snapshots remain preserved.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => setShowLogoutDialog(true)}
          className="rounded-xl border-slate-200 text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-[12.5px] h-8 px-3.5 cursor-pointer shrink-0"
        >
          <LogOut className="w-3.5 h-3.5 mr-1.5" />
          Sign Out
        </Button>
      </div>

      {/* Photo Preview & Save Modal */}
      <Dialog open={Boolean(pendingPhoto)} onOpenChange={(open) => { if (!open) setPendingPhoto(null); }}>
        <DialogContent className="max-w-sm bg-white border border-slate-200 rounded-2xl p-5 shadow-xl text-slate-900">
          <DialogHeader className="space-y-1 text-left">
            <DialogTitle className="text-[16px] font-bold text-slate-900">
              Preview Profile Photo
            </DialogTitle>
            <DialogDescription className="text-[12.5px] text-slate-500">
              Save this photo to your PackageGuard profile.
            </DialogDescription>
          </DialogHeader>

          {pendingPhoto && (
            <div className="py-3 flex flex-col items-center justify-center">
              <img
                src={pendingPhoto.dataUrl}
                alt="Selected preview"
                className="w-28 h-28 rounded-2xl object-cover border-2 border-slate-200 shadow-xs"
              />
              {pendingPhoto.size && (
                <p className="text-[11px] text-slate-400 mt-2 font-mono">
                  {(pendingPhoto.size / 1024).toFixed(1)} KB · {pendingPhoto.ext?.toUpperCase()}
                </p>
              )}
            </div>
          )}

          <DialogFooter className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingPhoto(null)}
              className="rounded-xl text-[12.5px] h-8 px-3 text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isActionLoading}
              onClick={handleSavePhoto}
              className="rounded-xl bg-primary hover:bg-[#4338CA] text-white text-[12.5px] h-8 px-3.5 font-medium cursor-pointer"
            >
              {isActionLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
              Save Photo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign Out Confirmation Dialog */}
      <Dialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <DialogContent className="max-w-sm bg-white border border-slate-200 rounded-2xl p-5 shadow-xl text-slate-900">
          <DialogHeader className="space-y-1.5 text-left">
            <DialogTitle className="text-[16px] font-bold text-slate-900">
              Sign out of PackageGuard?
            </DialogTitle>
            <DialogDescription className="text-[12.5px] text-slate-500 leading-normal">
              You will be signed out of your Google account session. Your local CLI history, projects, and snapshots will remain completely intact.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2.5 border-t border-slate-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowLogoutDialog(false)}
              className="rounded-xl text-[12.5px] h-8 px-3 text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleLogout}
              className="rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[12.5px] h-8 px-3.5 font-medium cursor-pointer"
            >
              Sign Out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
