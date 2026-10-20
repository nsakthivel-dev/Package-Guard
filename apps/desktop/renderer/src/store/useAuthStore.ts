import { create } from 'zustand';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string | null;
  phoneNumber?: string | null;
  emailVerified: boolean;
  provider: string;
  createdAt: string;
  updatedAt: string;
  hasActiveSession?: boolean;
}

export interface AuthSession {
  id: string;
  userId: string;
  isActive: boolean;
  createdAt: string;
  expiresAt?: string | null;
}

export interface AuthConfig {
  hasGoogleClientId: boolean;
  clientId: string | null;
  isConfigured: boolean;
  envConfigured: boolean;
}

export interface ProfileStorageInfo {
  currentPath: string;
  defaultPath: string;
  isDefault: boolean;
  isWritable: boolean;
  error?: string | null;
  systemPaths?: {
    dataRoot: string;
    database: string;
    snapshots: string;
    config: string;
    logs: string;
  };
}

export interface SelectedPhotoResult {
  canceled?: boolean;
  filePath?: string;
  dataUrl?: string;
  ext?: string;
  size?: number;
  error?: string;
}

interface AuthStore {
  user: UserProfile | null;
  session: AuthSession | null;
  accounts: UserProfile[];
  isLoading: boolean;
  isActionLoading: boolean;
  error: string | null;
  authConfig: AuthConfig | null;
  profileStorageInfo: ProfileStorageInfo | null;

  checkSession: () => Promise<void>;
  fetchAccounts: () => Promise<UserProfile[]>;
  switchAccount: (userId: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: (options?: { useSandbox?: boolean }) => Promise<{ success?: boolean; cancelled?: boolean; requiresConfig?: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (data: { id: string; displayName?: string; avatarUrl?: string; phoneNumber?: string }) => Promise<{ success: boolean; user?: UserProfile; error?: string }>;
  selectProfilePhoto: () => Promise<SelectedPhotoResult | null>;
  saveProfilePhoto: (data: { filePath?: string; dataUrl: string; ext?: string }) => Promise<{ success: boolean; user?: UserProfile; error?: string }>;
  removeProfilePhoto: () => Promise<{ success: boolean; user?: UserProfile; error?: string }>;
  deleteAccount: (userId: string, confirmation: string) => Promise<{ ok: boolean; error?: string }>;
  fetchAuthConfig: () => Promise<AuthConfig | null>;
  saveAuthConfig: (config: { googleClientId: string; googleClientSecret?: string }) => Promise<{ ok: boolean; error?: string }>;
  fetchProfileStoragePath: () => Promise<ProfileStorageInfo | null>;
  selectProfileStorageDir: () => Promise<{ path: string; isWritable: boolean; error?: string | null } | null>;
  setProfileStoragePath: (path: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
  clearError: () => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  accounts: [],
  isLoading: true,
  isActionLoading: false,
  error: null,
  authConfig: null,
  profileStorageInfo: null,

  clearError: () => set({ error: null }),

  checkSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const api = (window as any).electronAPI;
      if (api?.getAuthSession) {
        const data = await api.getAuthSession();
        if (data?.session && data?.user) {
          set({ session: data.session, user: data.user, isLoading: false });
          get().fetchAccounts().catch(() => {});
          return;
        }
      }
      set({ session: null, user: null, isLoading: false });
      get().fetchAccounts().catch(() => {});
    } catch (err: any) {
      console.warn('[AUTH] Error checking session:', err);
      set({ session: null, user: null, isLoading: false, error: err?.message || 'Failed to check session' });
    }
  },

  fetchAccounts: async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.getAccounts) {
        const list = await api.getAccounts();
        if (Array.isArray(list)) {
          set({ accounts: list });
          return list;
        }
      }
    } catch (err) {
      console.warn('[AUTH] Error fetching accounts list:', err);
    }
    return [];
  },

  switchAccount: async (userId: string) => {
    set({ isActionLoading: true, error: null });
    try {
      const api = (window as any).electronAPI;
      if (!api?.switchAccount) {
        throw new Error('Electron API switchAccount is unavailable');
      }
      const res = await api.switchAccount(userId);
      if (res?.success && res?.user && res?.session) {
        set({
          user: res.user,
          session: res.session,
          isActionLoading: false,
          error: null,
        });
        await get().fetchAccounts();
        return { success: true };
      }
      throw new Error(res?.error || 'Failed to switch account');
    } catch (err: any) {
      const msg = err?.message || 'Failed to switch account';
      set({ isActionLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  fetchAuthConfig: async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.getAuthConfig) {
        const config = await api.getAuthConfig();
        set({ authConfig: config });
        return config;
      }
    } catch (err) {
      console.warn('[AUTH] Error fetching auth config:', err);
    }
    return null;
  },

  saveAuthConfig: async (config) => {
    try {
      const api = (window as any).electronAPI;
      if (api?.saveAuthConfig) {
        const res = await api.saveAuthConfig(config);
        await get().fetchAuthConfig();
        return res;
      }
      return { ok: false, error: 'Electron API unavailable' };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Failed to save config' };
    }
  },

  loginWithGoogle: async (options = {}) => {
    set({ isActionLoading: true, error: null });
    try {
      const api = (window as any).electronAPI;
      if (!api?.loginWithGoogle) {
        throw new Error('Electron API is not available.');
      }

      const res = await api.loginWithGoogle(options);
      if (res?.requiresConfig) {
        set({ isActionLoading: false, error: res.message });
        return res;
      }

      if (res?.cancelled) {
        set({ isActionLoading: false, error: res.error || 'Sign in was cancelled.' });
        return res;
      }

      if (res?.success && res?.user && res?.session) {
        set({
          user: res.user,
          session: res.session,
          isActionLoading: false,
          error: null,
        });
        await get().fetchAccounts();
        return { success: true };
      }

      set({ isActionLoading: false, error: res?.error || 'Authentication failed' });
      return { success: false, error: res?.error || 'Authentication failed' };
    } catch (err: any) {
      const msg = err?.message || 'Failed to authenticate with Google';
      set({ isActionLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  logout: async () => {
    set({ isActionLoading: true, error: null });
    try {
      const api = (window as any).electronAPI;
      if (api?.logout) {
        await api.logout();
      }
      set({ user: null, session: null, isActionLoading: false, error: null });
      await get().fetchAccounts();
    } catch (err: any) {
      console.error('[AUTH] Logout error:', err);
      set({ user: null, session: null, isActionLoading: false, error: err?.message });
      await get().fetchAccounts();
    }
  },

  updateProfile: async (data) => {
    set({ isActionLoading: true, error: null });
    try {
      const api = (window as any).electronAPI;
      if (!api?.updateProfile) {
        throw new Error('Electron API is not available.');
      }

      const res = await api.updateProfile(data);
      if (res?.success && res?.user) {
        set({ user: res.user, isActionLoading: false, error: null });
        await get().fetchAccounts();
        return { success: true, user: res.user };
      }
      throw new Error(res?.error || 'Failed to update profile');
    } catch (err: any) {
      const msg = err?.message || 'Failed to update profile';
      set({ isActionLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  selectProfilePhoto: async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.selectProfilePhoto) {
        const res = await api.selectProfilePhoto();
        return res;
      }
      return null;
    } catch (err: any) {
      console.warn('[AUTH] Error opening photo dialog:', err);
      return { canceled: true, error: err?.message || 'Failed to select photo' };
    }
  },

  saveProfilePhoto: async (data) => {
    const currentUser = get().user;
    if (!currentUser) return { success: false, error: 'No active user session' };

    set({ isActionLoading: true, error: null });
    try {
      const api = (window as any).electronAPI;
      if (!api?.saveProfilePhoto) {
        throw new Error('Electron API saveProfilePhoto is not available.');
      }

      const res = await api.saveProfilePhoto(currentUser.id, data);
      if (res?.success && res?.user) {
        set({ user: res.user, isActionLoading: false, error: null });
        await get().fetchAccounts();
        return { success: true, user: res.user };
      }
      throw new Error(res?.error || 'Failed to save profile photo');
    } catch (err: any) {
      const msg = err?.message || 'Failed to save profile photo';
      set({ isActionLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  removeProfilePhoto: async () => {
    const currentUser = get().user;
    if (!currentUser) return { success: false, error: 'No active user session' };

    set({ isActionLoading: true, error: null });
    try {
      const api = (window as any).electronAPI;
      if (!api?.removeProfilePhoto) {
        throw new Error('Electron API removeProfilePhoto is not available.');
      }

      const res = await api.removeProfilePhoto(currentUser.id);
      if (res?.success && res?.user) {
        set({ user: res.user, isActionLoading: false, error: null });
        await get().fetchAccounts();
        return { success: true, user: res.user };
      }
      throw new Error(res?.error || 'Failed to remove profile photo');
    } catch (err: any) {
      const msg = err?.message || 'Failed to remove profile photo';
      set({ isActionLoading: false, error: msg });
      return { success: false, error: msg };
    }
  },

  deleteAccount: async (userId, confirmation) => {
    set({ isActionLoading: true, error: null });
    try {
      const api = (window as any).electronAPI;
      if (!api?.deleteAccount) {
        throw new Error('Electron API is not available.');
      }

      const res = await api.deleteAccount(userId, confirmation);
      if (res?.ok) {
        set({ user: null, session: null, isActionLoading: false, error: null });
        await get().fetchAccounts();
        return { ok: true };
      }
      throw new Error(res?.error || 'Failed to delete account');
    } catch (err: any) {
      const msg = err?.message || 'Failed to delete account';
      set({ isActionLoading: false, error: msg });
      return { ok: false, error: msg };
    }
  },

  fetchProfileStoragePath: async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.getProfileStoragePath) {
        const info = await api.getProfileStoragePath();
        set({ profileStorageInfo: info });
        return info;
      }
    } catch (err) {
      console.warn('[AUTH] Error fetching profile storage path:', err);
    }
    return null;
  },

  selectProfileStorageDir: async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.selectProfileStorageDir) {
        return await api.selectProfileStorageDir();
      }
      return null;
    } catch (err: any) {
      console.warn('[AUTH] Error selecting profile storage directory:', err);
      return null;
    }
  },

  setProfileStoragePath: async (dirPath: string) => {
    set({ isActionLoading: true, error: null });
    try {
      const api = (window as any).electronAPI;
      if (!api?.setProfileStoragePath) {
        throw new Error('Electron API is not available.');
      }
      const res = await api.setProfileStoragePath(dirPath);
      if (res?.ok) {
        await get().fetchProfileStoragePath();
        set({ isActionLoading: false });
        return { ok: true, path: res.path };
      }
      throw new Error(res?.error || 'Failed to update storage path');
    } catch (err: any) {
      const msg = err?.message || 'Failed to update storage path';
      set({ isActionLoading: false, error: msg });
      return { ok: false, error: msg };
    }
  },
}));
