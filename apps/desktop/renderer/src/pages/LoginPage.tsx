import React from "react";
import { useLocation } from "wouter";
import { Loader2, AlertCircle, ArrowLeft, UserPlus, CheckCircle2 } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { user, isActionLoading, error, clearError, loginWithGoogle } = useAuthStore();

  const handleGoogleSignIn = async () => {
    clearError();
    const res = await loginWithGoogle();
    if (res?.success) {
      setLocation("/profile");
    }
  };

  return (
    <div className="min-h-[calc(100vh-6rem)] flex items-center justify-center p-4">
      <div className="w-full max-w-[420px] animate-in fade-in-50 zoom-in-95 duration-200">
        {/* Back to Dashboard link with left-arrow icon */}
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setLocation("/")}
            className="inline-flex items-center gap-1.5 text-[13px] text-slate-600 hover:text-slate-900 transition-colors cursor-pointer group select-none"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            <span>Back to Dashboard</span>
          </button>
          {user && (
            <button
              onClick={() => setLocation("/profile")}
              className="text-[13px] text-primary hover:underline cursor-pointer"
            >
              View Active Profile
            </button>
          )}
        </div>

        {/* Compact, polished Login Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-7 shadow-lg shadow-slate-200/60 relative">
          {/* Logo Area */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-50 border border-slate-200/80 p-2 mb-3 shadow-xs">
              <img
                src="./logo.png"
                alt="PackageGuard"
                className="w-full h-full object-contain"
              />
            </div>

            {/* Heading & Subtitle */}
            <h1 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight">
              {user ? "Add Google Account" : "Welcome back"}
            </h1>

            <p className="text-[14px] text-slate-600 mt-1.5 leading-snug">
              {user
                ? "Connect an additional Google account with an isolated profile."
                : "Sign in to continue to your PackageGuard workspace."}
            </p>
          </div>

          {/* Active Account Banner (if already logged in) */}
          {user && (
            <div className="mb-5 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2.5 text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0 text-[12.5px] leading-tight">
                <p className="font-medium text-slate-900 truncate">
                  Active: {user.displayName || "Google Account"}
                </p>
                <p className="text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
          )}

          {/* Clean Error Notification */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200/80 flex items-start gap-2.5 text-rose-700 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 text-[13px] leading-tight">
                <p className="font-medium">{error}</p>
              </div>
            </div>
          )}

          {/* Primary "Continue with Google" / "Add Google Account" Button */}
          <Button
            type="button"
            disabled={isActionLoading}
            onClick={handleGoogleSignIn}
            className="w-full h-11 rounded-xl bg-white hover:bg-slate-100/90 text-slate-800 hover:text-slate-950 font-medium text-[14px] shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-3 border border-slate-300 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed group relative"
          >
            {isActionLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                <span className="text-slate-700">Connecting to Google...</span>
              </>
            ) : (
              <>
                {/* Official Google SVG Logo */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                <span className="font-semibold text-slate-800 group-hover:text-slate-950">
                  {user ? "Sign In with Another Google Account" : "Continue with Google"}
                </span>
              </>
            )}
          </Button>

          {/* Context Note */}
          <p className="text-[12px] text-slate-500 text-center mt-4 leading-normal">
            {user
              ? "Each Google account maintains an isolated profile while preserving local workspace history."
              : "New to PackageGuard? Sign in with Google to create your developer profile."}
          </p>

          {/* Continue as Guest */}
          <div className="mt-5 pt-4 border-t border-slate-100 text-center">
            <button
              onClick={() => setLocation("/")}
              className="text-[13px] text-slate-500 hover:text-slate-800 transition-colors cursor-pointer inline-flex items-center gap-1.5"
            >
              <span className="font-medium">Continue as Guest</span>
              <span className="text-slate-400 text-[12px]">(Access local workspace)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
