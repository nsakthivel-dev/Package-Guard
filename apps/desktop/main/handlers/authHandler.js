'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { shell, dialog, safeStorage } = require('electron');
const {
  upsertUserProfile,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
  createAuthSession,
  getActiveAuthSession,
  deactivateAllAuthSessions,
  getAllUserProfiles,
  switchActiveAuthSession,
} = require('@package-guard/shared/repository');

// ── Token encryption & migration (Electron safeStorage) ─────────────────────
const TOKEN_ENC_PREFIX = 'enc:v1:';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encryptToken(plainText) {
  if (!plainText || typeof plainText !== 'string') return plainText;
  if (plainText.startsWith(TOKEN_ENC_PREFIX)) return plainText;
  try {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(plainText);
      return `${TOKEN_ENC_PREFIX}${encrypted.toString('base64')}`;
    }
  } catch (err) {
    console.warn('[AUTH] safeStorage encryption fallback:', err.message);
  }
  return plainText;
}

function decryptToken(storedToken) {
  if (!storedToken || typeof storedToken !== 'string') return storedToken;
  if (!storedToken.startsWith(TOKEN_ENC_PREFIX)) {
    return storedToken;
  }
  try {
    if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
      const base64Data = storedToken.slice(TOKEN_ENC_PREFIX.length);
      const buffer = Buffer.from(base64Data, 'base64');
      return safeStorage.decryptString(buffer);
    }
  } catch (err) {
    console.error('[AUTH] Failed to decrypt token via safeStorage:', err.message);
  }
  return storedToken;
}

function migrateStoredTokens(db) {
  if (!db) return;
  try {
    const rows = db.prepare(`
      SELECT id, access_token, refresh_token, id_token 
      FROM auth_sessions 
      WHERE (access_token IS NOT NULL AND access_token NOT LIKE 'enc:v1:%') 
         OR (refresh_token IS NOT NULL AND refresh_token NOT LIKE 'enc:v1:%') 
         OR (id_token IS NOT NULL AND id_token NOT LIKE 'enc:v1:%')
    `).all();

    if (rows && rows.length > 0) {
      console.log(`[AUTH] Migrating ${rows.length} session tokens to safeStorage encryption...`);
      const updateStmt = db.prepare(`
        UPDATE auth_sessions 
        SET access_token = ?, refresh_token = ?, id_token = ? 
        WHERE id = ?
      `);
      for (const row of rows) {
        const encAccess = row.access_token ? encryptToken(row.access_token) : null;
        const encRefresh = row.refresh_token ? encryptToken(row.refresh_token) : null;
        const encId = row.id_token ? encryptToken(row.id_token) : null;
        updateStmt.run(encAccess, encRefresh, encId, row.id);
      }
      console.log('[AUTH] Stored token migration completed.');
    }
  } catch (err) {
    console.warn('[AUTH] Token migration note:', err.message);
  }
}

// Google OAuth credentials must be configured via environment variables or desktop settings.
// Do not hardcode credentials in source code.
const DEFAULT_GOOGLE_CLIENT_ID = null;
const DEFAULT_GOOGLE_CLIENT_SECRET = null;

function isPlaceholderValue(val) {
  if (!val || typeof val !== 'string') return true;
  const lower = val.trim().toLowerCase();
  return (
    lower.includes('your-google-client') ||
    lower.includes('your-client-id') ||
    lower.includes('your-client-secret') ||
    lower === 'null' ||
    lower === 'undefined'
  );
}

function loadEnvFile() {
  const os = require('os');
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env'),
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(__dirname, '../../.env'),
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'PackageGuard', '.env'),
    path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Package Guard', '.env'),
    path.join(os.homedir(), '.packageguard', '.env'),
  ];
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      candidatePaths.push(path.join(app.getPath('userData'), '.env'));
    }
  } catch {}

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const k = trimmed.slice(0, eqIdx).trim();
            let v = trimmed.slice(eqIdx + 1).trim();
            if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
              v = v.slice(1, -1);
            }
            if (v && !isPlaceholderValue(v)) {
              if (!process.env[k] || isPlaceholderValue(process.env[k])) {
                process.env[k] = v;
              }
            }
          }
        }
      }
    } catch {}
  }
}
loadEnvFile();

let getDbInstance = null;
let mainWindowRef = null;

function setDb(fn) {
  getDbInstance = fn;
}

function setMainWindow(win) {
  mainWindowRef = win;
}

function getDb() {
  if (typeof getDbInstance === 'function') {
    return getDbInstance();
  }
  return null;
}

/**
 * Return effective profile storage directory
 */
function getProfileStorageRoot(dbHandler) {
  let storageRoot = null;
  if (dbHandler && typeof dbHandler.getSettings === 'function') {
    const s = dbHandler.getSettings();
    storageRoot = s.profileStoragePath;
  }
  if (!storageRoot) {
    storageRoot = path.join(process.env.APPDATA || process.env.USERPROFILE || '', 'PackageGuard', 'profiles');
  }
  return storageRoot;
}

/**
 * Sync user profile metadata to account JSON file in the profile storage directory
 */
function syncProfileJson(userRecord, dbHandler, extra = {}) {
  try {
    if (!userRecord || !userRecord.id) return;
    const storageRoot = getProfileStorageRoot(dbHandler);
    const accountDir = path.join(storageRoot, 'accounts', userRecord.id);
    fs.mkdirSync(accountDir, { recursive: true });

    const profileJsonPath = path.join(accountDir, 'profile.json');
    let existing = {};
    if (fs.existsSync(profileJsonPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(profileJsonPath, 'utf8'));
      } catch (_) {}
    }

    const merged = {
      ...existing,
      id: userRecord.id,
      email: userRecord.email,
      displayName: userRecord.displayName,
      avatarUrl: userRecord.avatarUrl,
      provider: userRecord.provider || 'google',
      emailVerified: Boolean(userRecord.emailVerified),
      createdAt: userRecord.createdAt || existing.createdAt || new Date().toISOString(),
      updatedAt: userRecord.updatedAt || new Date().toISOString(),
      ...extra,
    };

    fs.writeFileSync(profileJsonPath, JSON.stringify(merged, null, 2), 'utf8');
  } catch (err) {
    console.warn('[AUTH] Could not sync profile JSON file:', err.message);
  }
}

/**
 * Focus the main Electron window (after OAuth finishes in external browser)
 */
function focusMainWindow() {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    try {
      if (mainWindowRef.isMinimized()) {
        mainWindowRef.restore();
      }
      mainWindowRef.show();
      mainWindowRef.focus();
    } catch (err) {
      console.warn('[AUTH] Could not refocus main window:', err.message);
    }
  }
}

/**
 * Base64url encoding without padding
 */
function base64UrlEncode(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate PKCE code_verifier and code_challenge (S256)
 */
function generatePkce() {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

/**
 * Get current Google OAuth configuration
 */
function getAuthConfig(dbHandler) {
  loadEnvFile();
  let envClientId = isPlaceholderValue(process.env.GOOGLE_CLIENT_ID) ? null : process.env.GOOGLE_CLIENT_ID.trim();
  let envClientSecret = isPlaceholderValue(process.env.GOOGLE_CLIENT_SECRET) ? null : process.env.GOOGLE_CLIENT_SECRET.trim();

  let settingsClientId = null;
  let settingsClientSecret = null;
  if (dbHandler && typeof dbHandler.getSettings === 'function') {
    const s = dbHandler.getSettings();
    if (!isPlaceholderValue(s.googleClientId)) {
      settingsClientId = s.googleClientId.trim();
    }
    if (!isPlaceholderValue(s.googleClientSecret)) {
      settingsClientSecret = s.googleClientSecret.trim();
    }
  }

  const clientId = envClientId || settingsClientId || DEFAULT_GOOGLE_CLIENT_ID;
  const clientSecret = envClientSecret || settingsClientSecret || DEFAULT_GOOGLE_CLIENT_SECRET;

  return {
    hasGoogleClientId: Boolean(clientId),
    clientId: clientId ? `${clientId.slice(0, 12)}...` : null,
    isConfigured: Boolean(clientId),
    envConfigured: Boolean(envClientId),
  };
}

/**
 * Save Google OAuth configuration to settings
 */
function saveAuthConfig(dbHandler, config) {
  if (!dbHandler || typeof dbHandler.updateSettings !== 'function') {
    return { ok: false, error: 'Settings handler unavailable' };
  }
  const updates = {};
  if (typeof config.googleClientId === 'string') {
    updates.googleClientId = config.googleClientId.trim();
  }
  if (typeof config.googleClientSecret === 'string') {
    updates.googleClientSecret = config.googleClientSecret.trim();
  }
  dbHandler.updateSettings(updates);
  return { ok: true, hasGoogleClientId: Boolean(updates.googleClientId) };
}

/**
 * Get current active session and user profile
 */
async function getSession() {
  const db = getDb();
  if (!db) return null;
  try {
    // Transparently migrate any unencrypted legacy tokens to safeStorage
    migrateStoredTokens(db);

    const active = getActiveAuthSession(db);
    if (!active) return null;
    return {
      session: {
        id: active.id,
        userId: active.userId,
        isActive: active.isActive,
        createdAt: active.createdAt,
        expiresAt: active.expiresAt,
      },
      user: active.user,
    };
  } catch (err) {
    console.error('[AUTH] Failed to get active session:', err.message);
    return null;
  }
}

/**
 * Get all authenticated accounts with active status indicator
 */
async function getAllAccounts() {
  const db = getDb();
  if (!db) return [];
  try {
    return getAllUserProfiles(db);
  } catch (err) {
    console.error('[AUTH] Failed to get all accounts:', err.message);
    return [];
  }
}

/**
 * Switch the active account to the specified userId
 */
async function switchAccount(userId) {
  const db = getDb();
  if (!db) return { success: false, error: 'Database unavailable' };
  try {
    const success = switchActiveAuthSession(db, userId);
    if (!success) {
      return { success: false, error: 'Target account profile not found' };
    }
    const sessionData = await getSession();
    return { success: true, ...sessionData };
  } catch (err) {
    console.error('[AUTH] Failed to switch account:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * HTML response served to the user's browser after OAuth completes
 */
function getCallbackHtml(success, title, message) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const icon = success
    ? `<svg class="w-16 h-16 text-emerald-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
    : `<svg class="w-16 h-16 text-rose-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} — PackageGuard</title>
  <style>
    body {
      background: #09090b;
      color: #fafafa;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
    }
    .card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 40px 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      color: #a1a1aa;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 22px;
      font-weight: 600;
      margin: 16px 0 8px;
      color: #ffffff;
    }
    p {
      font-size: 14px;
      line-height: 1.5;
      color: #a1a1aa;
      margin: 0 0 24px;
    }
    .btn {
      display: inline-block;
      background: #2563eb;
      color: #ffffff;
      padding: 10px 24px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      text-decoration: none;
      transition: background 0.15s;
    }
    .btn:hover {
      background: #1d4ed8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">PackageGuard Desktop</div>
    ${icon}
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
    <button type="button" onclick="window.close()" class="btn">Close Window</button>
  </div>
</body>
</html>`;
}

/**
 * Handle Google OAuth login
 */
async function loginWithGoogle(options = {}, dbHandler = null) {
  const db = getDb();
  if (!db) {
    throw new Error('Database is not initialized. Please restart PackageGuard.');
  }

  loadEnvFile();
  // Resolve Client ID and Secret
  let clientId = isPlaceholderValue(process.env.GOOGLE_CLIENT_ID) ? null : process.env.GOOGLE_CLIENT_ID.trim();
  let clientSecret = isPlaceholderValue(process.env.GOOGLE_CLIENT_SECRET) ? null : process.env.GOOGLE_CLIENT_SECRET.trim();
  if (!clientId && dbHandler && typeof dbHandler.getSettings === 'function') {
    const s = dbHandler.getSettings();
    if (!isPlaceholderValue(s.googleClientId)) {
      clientId = s.googleClientId.trim();
    }
    if (!isPlaceholderValue(s.googleClientSecret)) {
      clientSecret = s.googleClientSecret.trim();
    }
  }
  if (!clientId) {
    clientId = DEFAULT_GOOGLE_CLIENT_ID;
  }
  if (!clientSecret) {
    clientSecret = DEFAULT_GOOGLE_CLIENT_SECRET;
  }

  const useSandbox = Boolean(options.useSandbox);

  console.log(`[AUTH] loginWithGoogle: clientId configured=${Boolean(clientId)}, clientSecret configured=${Boolean(clientSecret)}`);
  if (!clientId && !useSandbox) {
    return {
      requiresConfig: true,
      message: 'Google OAuth Client ID is not configured. Please supply your Client ID via GOOGLE_CLIENT_ID or desktop settings.',
    };
  }

  if (useSandbox) {
    console.log('[AUTH] Running Google Sign-In with Developer Sandbox Mode');
    const mockProfile = {
      id: options.customId || 'google-dev-109482938475920384726',
      email: options.customEmail || 'developer.user@gmail.com',
      displayName: options.customName || 'Developer Account',
      avatarUrl: options.customAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop&crop=face',
      phoneNumber: '+1 (555) 019-2834',
      emailVerified: true,
      provider: 'google',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const savedUser = upsertUserProfile(db, mockProfile);
    const session = createAuthSession(db, {
      id: crypto.randomUUID(),
      userId: savedUser.id,
      accessToken: encryptToken('demo_access_token_' + crypto.randomUUID()),
      refreshToken: encryptToken('demo_refresh_token_' + crypto.randomUUID()),
      idToken: encryptToken('demo_id_token_' + crypto.randomUUID()),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    syncProfileJson(savedUser, dbHandler, {
      googleAvatarUrl: mockProfile.avatarUrl,
      lastSignIn: new Date().toISOString(),
    });

    focusMainWindow();

    return {
      success: true,
      user: savedUser,
      session: {
        id: session.id,
        userId: session.userId,
        isActive: session.isActive,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
    };
  }

  // ── Real Google OAuth 2.0 PKCE Flow ───────────────────────────────────────
  const { verifier, challenge } = generatePkce();
  const state = crypto.randomBytes(24).toString('hex');

  return new Promise((resolve, reject) => {
    let server = null;
    let timeoutId = null;
    let port = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (server) {
        try {
          server.close();
        } catch (_) {}
        server = null;
      }
    };

    server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://${req.headers.host}`);
        if (!reqUrl.pathname.startsWith('/oauth2callback')) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }

        const returnedState = reqUrl.searchParams.get('state');
        const code = reqUrl.searchParams.get('code');
        const error = reqUrl.searchParams.get('error');

        const securityHeaders = {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';",
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        };

        if (error) {
          res.writeHead(200, securityHeaders);
          res.end(getCallbackHtml(false, 'Sign-In Cancelled', `Google returned an error: ${error}. You may close this window.`));
          cleanup();
          focusMainWindow();
          resolve({ cancelled: true, error: `Authentication was cancelled (${error}).` });
          return;
        }

        if (!returnedState || returnedState !== state) {
          res.writeHead(400, securityHeaders);
          res.end(getCallbackHtml(false, 'Security Verification Failed', 'Invalid OAuth state parameter detected. Request aborted for your safety.'));
          cleanup();
          focusMainWindow();
          reject(new Error('OAuth state mismatch. The authentication request may have been spoofed.'));
          return;
        }

        if (!code) {
          res.writeHead(400, securityHeaders);
          res.end(getCallbackHtml(false, 'Authorization Failed', 'No authorization code received from Google.'));
          cleanup();
          focusMainWindow();
          reject(new Error('No authorization code received from Google.'));
          return;
        }

        // Send success page immediately to browser
        res.writeHead(200, securityHeaders);
        res.end(getCallbackHtml(true, 'Authentication Successful', 'You are now signed in to PackageGuard. You can safely close this window and return to the application.'));
        cleanup();
        focusMainWindow();

        // Exchange code for tokens
        const tokenParams = new URLSearchParams({
          code,
          client_id: clientId,
          redirect_uri: `http://127.0.0.1:${port}/oauth2callback`,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        });

        if (clientSecret) {
          tokenParams.append('client_secret', clientSecret);
        }

        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: tokenParams.toString(),
        });

        if (!tokenResp.ok) {
          const errBody = await tokenResp.text();
          throw new Error(`Google token exchange failed (${tokenResp.status}): ${errBody}`);
        }

        const tokens = await tokenResp.json();
        const accessToken = tokens.access_token;
        const refreshToken = tokens.refresh_token || null;
        const idToken = tokens.id_token || null;
        const expiresIn = tokens.expires_in || 3600;

        // Fetch user profile from Google UserInfo endpoint
        const userResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!userResp.ok) {
          throw new Error(`Failed to fetch Google user profile (${userResp.status})`);
        }

        const googleUser = await userResp.json();
        const existingProfile = getUserProfile(db, googleUser.sub);

        const profileRecord = {
          id: googleUser.sub, // Google unique user ID
          email: googleUser.email,
          displayName: existingProfile?.displayName || googleUser.name || googleUser.given_name || googleUser.email.split('@')[0],
          // Preserve existing avatar if customized, otherwise use Google picture
          avatarUrl: existingProfile?.avatarUrl || googleUser.picture || null,
          phoneNumber: existingProfile?.phoneNumber || null,
          emailVerified: Boolean(googleUser.email_verified),
          provider: 'google',
          createdAt: existingProfile?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const savedUser = upsertUserProfile(db, profileRecord);
        const session = createAuthSession(db, {
          id: crypto.randomUUID(),
          userId: savedUser.id,
          accessToken: encryptToken(accessToken),
          refreshToken: encryptToken(refreshToken),
          idToken: encryptToken(idToken),
          expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        syncProfileJson(savedUser, dbHandler, {
          googleAvatarUrl: googleUser.picture || null,
          lastSignIn: new Date().toISOString(),
        });

        resolve({
          success: true,
          user: savedUser,
          session: {
            id: session.id,
            userId: session.userId,
            isActive: session.isActive,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
          },
        });
      } catch (err) {
        cleanup();
        focusMainWindow();
        reject(err);
      }
    });

    // Listen on loopback interface with ephemeral free port
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      port = address.port;
      const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'openid profile email');
      authUrl.searchParams.set('code_challenge', challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'select_account');

      console.log(`[AUTH] Opening Google OAuth in browser (port ${port})...`);
      shell.openExternal(authUrl.toString());

      // Set timeout of 3 minutes
      timeoutId = setTimeout(() => {
        cleanup();
        focusMainWindow();
        resolve({
          cancelled: true,
          error: 'Sign in timed out. Please try again when ready.',
        });
      }, 180000);
    });

    server.on('error', (err) => {
      cleanup();
      focusMainWindow();
      reject(new Error(`Failed to start loopback OAuth server: ${err.message}`));
    });
  });
}

/**
 * Open native file picker for selecting a profile photo
 */
async function selectProfilePhoto(win) {
  const targetWin = win || mainWindowRef;
  const result = await dialog.showOpenDialog(targetWin, {
    title: 'Select Profile Photo',
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
    ]
  });

  if (result.canceled || !result.filePaths || !result.filePaths.length) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const stats = fs.statSync(filePath);
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
  if (stats.size > MAX_SIZE) {
    return { canceled: true, error: 'Image size exceeds 5MB limit. Please choose a smaller photo.' };
  }

  const ext = path.extname(filePath).slice(1).toLowerCase();
  const validExts = ['png', 'jpg', 'jpeg', 'webp'];
  if (!validExts.includes(ext)) {
    return { canceled: true, error: 'Invalid image format. Supported formats: PNG, JPG, JPEG, WebP.' };
  }

  const mime = ext === 'png' ? 'image/png' : (ext === 'webp' ? 'image/webp' : 'image/jpeg');
  const buffer = fs.readFileSync(filePath);
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;

  return {
    canceled: false,
    filePath,
    dataUrl,
    ext,
    size: stats.size
  };
}

/**
 * Persist selected profile photo to the configured profile storage location
 */
async function saveProfilePhoto(userId, data, dbHandler) {
  const db = getDb();
  if (!db) throw new Error('Database is not initialized');
  if (!userId) throw new Error('User ID is required');

  const { filePath, dataUrl, ext = 'png' } = data || {};
  if (!dataUrl && !filePath) {
    throw new Error('No photo data provided');
  }

  const storageRoot = getProfileStorageRoot(dbHandler);
  const avatarsDir = path.join(storageRoot, 'avatars');
  const accountsDir = path.join(storageRoot, 'accounts', userId);
  fs.mkdirSync(avatarsDir, { recursive: true });
  fs.mkdirSync(accountsDir, { recursive: true });

  const safeExt = ['png', 'jpg', 'jpeg', 'webp'].includes(ext) ? ext : 'png';
  const avatarFileName = `${userId}.${safeExt}`;
  const avatarDestPath = path.join(avatarsDir, avatarFileName);

  if (filePath && fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, avatarDestPath);
  } else if (dataUrl) {
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(avatarDestPath, Buffer.from(base64Data, 'base64'));
  }

  // Update profile with dataUrl for seamless instant rendering across desktop
  const updatedUser = updateUserProfile(db, userId, { avatarUrl: dataUrl });
  if (!updatedUser) {
    throw new Error('Failed to update user profile in database');
  }

  syncProfileJson(updatedUser, dbHandler, {
    localAvatarFile: avatarDestPath,
    customPhotoSavedAt: new Date().toISOString()
  });

  return {
    success: true,
    user: updatedUser,
    localAvatarPath: avatarDestPath
  };
}

/**
 * Remove custom profile photo and restore Google avatar or initials
 */
async function removeProfilePhoto(userId, dbHandler) {
  const db = getDb();
  if (!db) throw new Error('Database is not initialized');
  if (!userId) throw new Error('User ID is required');

  const storageRoot = getProfileStorageRoot(dbHandler);
  const profileJsonPath = path.join(storageRoot, 'accounts', userId, 'profile.json');
  let restoredAvatar = null;

  if (fs.existsSync(profileJsonPath)) {
    try {
      const json = JSON.parse(fs.readFileSync(profileJsonPath, 'utf8'));
      restoredAvatar = json.googleAvatarUrl || null;
    } catch (_) {}
  }

  const updatedUser = updateUserProfile(db, userId, { avatarUrl: restoredAvatar });
  if (!updatedUser) {
    throw new Error('Failed to update user profile in database');
  }

  syncProfileJson(updatedUser, dbHandler, {
    localAvatarFile: null,
    avatarUrl: restoredAvatar,
  });

  return { success: true, user: updatedUser };
}

/**
 * Update editable profile details
 */
async function updateProfile(data, dbHandler) {
  const db = getDb();
  if (!db) throw new Error('Database is not initialized');

  if (!data || !data.id) {
    throw new Error('User ID is required for updating profile');
  }

  // Validate inputs
  const updates = {};
  if (data.displayName !== undefined) {
    const name = String(data.displayName).trim();
    if (!name) throw new Error('Display name cannot be empty');
    if (name.length > 60) throw new Error('Display name is too long (maximum 60 characters)');
    updates.displayName = name;
  }

  if (data.phoneNumber !== undefined) {
    const phone = data.phoneNumber ? String(data.phoneNumber).trim() : null;
    if (phone && phone.length > 30) throw new Error('Phone number is too long');
    updates.phoneNumber = phone;
  }

  if (data.avatarUrl !== undefined) {
    const avatar = data.avatarUrl ? String(data.avatarUrl).trim() : null;
    if (avatar && avatar.length > 5000000) throw new Error('Avatar image data is too large');
    updates.avatarUrl = avatar;
  }

  const updated = updateUserProfile(db, data.id, updates);
  if (!updated) {
    throw new Error('User profile record not found');
  }

  syncProfileJson(updated, dbHandler);

  return { success: true, user: updated };
}

/**
 * Logout: deactivate session, purge sensitive tokens
 */
async function logout() {
  const db = getDb();
  if (!db) return { ok: true };

  try {
    deactivateAllAuthSessions(db);
    console.log('[AUTH] User signed out successfully. Session cleared.');
    return { ok: true };
  } catch (err) {
    console.error('[AUTH] Error during logout:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Delete account with confirmation
 */
async function deleteAccount(userId, confirmation) {
  const db = getDb();
  if (!db) throw new Error('Database is not initialized');

  if (confirmation !== 'DELETE') {
    throw new Error('Confirmation string must match "DELETE" to permanently remove account.');
  }

  const existing = getUserProfile(db, userId);
  if (!existing) {
    throw new Error('Account not found.');
  }

  deleteUserProfile(db, userId);
  deactivateAllAuthSessions(db);

  console.log(`[AUTH] Account deleted for user: ${userId}`);
  return { ok: true, message: 'Account successfully deleted.' };
}

/**
 * Completely wipe all authentication tokens and sessions from SQLite
 */
async function clearAuthTokens() {
  const db = getDb();
  if (!db) return { ok: true };

  try {
    db.prepare('DELETE FROM auth_sessions').run();
    console.log('[AUTH] All auth sessions and tokens purged from database.');
    return { ok: true };
  } catch (err) {
    try {
      deactivateAllAuthSessions(db);
      return { ok: true };
    } catch (innerErr) {
      console.error('[AUTH] Error during clearAuthTokens:', innerErr.message);
      return { ok: false, error: innerErr.message };
    }
  }
}

module.exports = {
  setDb,
  setMainWindow,
  getAuthConfig,
  saveAuthConfig,
  getSession,
  getAllAccounts,
  switchAccount,
  loginWithGoogle,
  selectProfilePhoto,
  saveProfilePhoto,
  removeProfilePhoto,
  updateProfile,
  logout,
  deleteAccount,
  clearAuthTokens,
};
