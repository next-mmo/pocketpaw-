import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { app, BrowserWindow, ipcMain, shell } from 'electron';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendStatus: 'starting' | 'running' | 'stopped' | 'error' = 'stopped';

const BACKEND_PORT = 8888;
const BACKEND_BASE_URL = `http://127.0.0.1:${BACKEND_PORT}`;
const OAUTH_CLIENT_ID = 'pocketpaw-desktop';
const OAUTH_SCOPES = 'admin';
const OAUTH_FLOW_TIMEOUT_MS = 5 * 60 * 1000;

type OAuthTokens = {
  access_token: string;
  refresh_token: string | null;
  expires_at: number;
  scopes: string[];
};

type OAuthCallbackResult = {
  code?: string;
  state?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// Backend lifecycle
// ---------------------------------------------------------------------------

function findProjectRoot(): string {
  // In dev: nde-claw lives inside the repo root
  // In production: the app is packaged with the wheel
  return path.resolve(__dirname, '../../..');
}

async function waitForBackend(timeoutMs = 15_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/version`);
      if (response.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function startBackend() {
  if (backendProcess) return;

  backendStatus = 'starting';
  const projectRoot = findProjectRoot();

  // Try uv first (dev), fallback to python -m
  backendProcess = spawn(
    'uv',
    ['run', 'pocketpaw', 'serve', '--port', String(BACKEND_PORT)],
    {
      cwd: projectRoot,
      stdio: 'pipe',
      shell: true,
    },
  );

  backendProcess.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.log('[pocketpaw]', msg);
    // Detect startup completion
    if (msg.includes('API') || msg.includes('Uvicorn running')) {
      backendStatus = 'running';
    }
  });

  backendProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) console.error('[pocketpaw]', msg);
    // Uvicorn logs startup to stderr
    if (msg.includes('Uvicorn running') || msg.includes('Application startup complete')) {
      backendStatus = 'running';
    }
  });

  backendProcess.on('error', (err) => {
    console.error('[pocketpaw] spawn error:', err.message);
    backendStatus = 'error';
    backendProcess = null;
  });

  backendProcess.on('exit', (code) => {
    console.log('[pocketpaw] exited with code', code);
    backendStatus = 'stopped';
    backendProcess = null;
  });

  // Also poll for readiness, then notify the renderer
  void waitForBackend().then((ready) => {
    if (ready) {
      backendStatus = 'running';
      console.log('[pocketpaw] backend is ready');
      mainWindow?.webContents.send('pocketpaw:backend-status-changed', 'running');
    } else if (backendStatus === 'starting') {
      backendStatus = 'error';
      console.error('[pocketpaw] backend did not become ready in time');
      mainWindow?.webContents.send('pocketpaw:backend-status-changed', 'error');
    }
  });
}

function stopBackend() {
  if (backendProcess) {
    backendProcess.kill('SIGTERM');
    backendProcess = null;
    backendStatus = 'stopped';
  }
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function generateCodeVerifier(length = 64): string {
  return base64UrlEncode(randomBytes(length));
}

function generateCodeChallenge(verifier: string): string {
  return base64UrlEncode(createHash('sha256').update(verifier).digest());
}

function generateState(): string {
  return base64UrlEncode(randomBytes(32));
}

function getOAuthTokensPath(): string {
  return path.join(app.getPath('userData'), 'oauth-tokens.json');
}

async function readStoredOAuthTokens(): Promise<OAuthTokens | null> {
  try {
    const raw = await fs.readFile(getOAuthTokensPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<OAuthTokens>;

    if (!parsed.access_token || typeof parsed.expires_at !== 'number') {
      return null;
    }

    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token ?? null,
      expires_at: parsed.expires_at,
      scopes: Array.isArray(parsed.scopes) ? parsed.scopes.filter(Boolean) : [],
    };
  } catch {
    return null;
  }
}

async function saveStoredOAuthTokens(tokens: OAuthTokens): Promise<void> {
  const filePath = getOAuthTokensPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(tokens, null, 2)}\n`, 'utf-8');
}

async function clearStoredOAuthTokens(): Promise<void> {
  try {
    await fs.rm(getOAuthTokensPath(), { force: true });
  } catch {
    // Ignore missing token store.
  }
}

async function exchangeOAuthGrant(body: Record<string, unknown>): Promise<OAuthTokens> {
  const response = await fetch(`${BACKEND_BASE_URL}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `OAuth token exchange failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token?: string | null;
    expires_in?: number;
    scope?: string;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? null,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in ?? 3600),
    scopes: data.scope ? data.scope.split(' ') : [],
  };
}

async function createOAuthCallbackSession(timeoutMs = OAUTH_FLOW_TIMEOUT_MS): Promise<{
  redirectUri: string;
  callbackPromise: Promise<OAuthCallbackResult>;
  dispose: () => void;
}> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isClosed = false;
    let resolveCallback!: (result: OAuthCallbackResult) => void;
    let rejectCallback!: (error: Error) => void;
    const callbackPromise = new Promise<OAuthCallbackResult>((innerResolve, innerReject) => {
      resolveCallback = innerResolve;
      rejectCallback = (error) => innerReject(error);
    });

    const closeServer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!isClosed) {
        isClosed = true;
        server.close();
      }
    };

    const server = createServer((request, response) => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      const code = requestUrl.searchParams.get('code') ?? undefined;
      const state = requestUrl.searchParams.get('state') ?? undefined;
      const error = requestUrl.searchParams.get('error') ?? undefined;

      const success = Boolean(code && !error);
      response.writeHead(success ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${success ? 'PocketPaw Signed In' : 'PocketPaw Sign In Failed'}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0b1020;
        color: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
      }
      main {
        width: min(28rem, calc(100vw - 2rem));
        border-radius: 28px;
        padding: 28px;
        background: rgba(15, 23, 42, 0.76);
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.32);
        backdrop-filter: blur(24px);
      }
      h1 { margin: 0 0 10px; font-size: 28px; }
      p { margin: 0; line-height: 1.6; color: rgba(248, 250, 252, 0.8); }
    </style>
  </head>
  <body>
    <main>
      <h1>${success ? 'You can return to PocketPaw.' : 'PocketPaw could not finish signing in.'}</h1>
      <p>${success ? 'The desktop app is completing setup now.' : 'Close this tab and try the login flow again from the app.'}</p>
    </main>
  </body>
</html>`);

      closeServer();
      resolveCallback({ code, state, error });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        closeServer();
        reject(new Error('Failed to start OAuth callback server.'));
        return;
      }

      const redirectUri = `http://127.0.0.1:${address.port}/`;
      timeoutId = setTimeout(() => {
        closeServer();
        rejectCallback(new Error('Sign-in timed out. Please try again.'));
      }, timeoutMs);

      resolve({
        redirectUri,
        callbackPromise,
        dispose: closeServer,
      });
    });

    server.on('error', (error) => {
      closeServer();
      rejectCallback(error instanceof Error ? error : new Error(String(error)));
    });
  });
}

async function startOAuthFlow(): Promise<OAuthTokens> {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();
  const session = await createOAuthCallbackSession();
  const { redirectUri, callbackPromise, dispose } = session;

  const authorizeUrl = new URL(`${BACKEND_BASE_URL}/api/v1/oauth/authorize`);
  authorizeUrl.searchParams.set('client_id', OAUTH_CLIENT_ID);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('scope', OAUTH_SCOPES);
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  authorizeUrl.searchParams.set('state', state);

  try {
    await shell.openExternal(authorizeUrl.toString());
  } catch (error) {
    dispose();
    throw error;
  }

  const result = await callbackPromise;

  if (result.error) {
    throw new Error(result.error);
  }

  if (!result.code || result.state !== state) {
    throw new Error('State mismatch while completing sign-in.');
  }

  const tokens = await exchangeOAuthGrant({
    grant_type: 'authorization_code',
    code: result.code,
    code_verifier: verifier,
    client_id: OAUTH_CLIENT_ID,
    redirect_uri: redirectUri,
  });

  await saveStoredOAuthTokens(tokens);
  return tokens;
}

async function refreshStoredOAuthTokens(): Promise<OAuthTokens> {
  const existingTokens = await readStoredOAuthTokens();

  if (!existingTokens?.refresh_token) {
    throw new Error('No refresh token available.');
  }

  const tokens = await exchangeOAuthGrant({
    grant_type: 'refresh_token',
    refresh_token: existingTokens.refresh_token,
    client_id: OAUTH_CLIENT_ID,
  });

  await saveStoredOAuthTokens(tokens);
  return tokens;
}

// ---------------------------------------------------------------------------
// Access token — read from ~/.pocketpaw/config.toml or env
// ---------------------------------------------------------------------------

function getAccessToken(): string {
  // Prefer env variable for dev ergonomics
  if (process.env.POCKETPAW_ACCESS_TOKEN) {
    return process.env.POCKETPAW_ACCESS_TOKEN;
  }

  // Read from config file
  try {
    const os = require('node:os');
    const fs = require('node:fs');
    const configPath = path.join(os.homedir(), '.pocketpaw', 'config.toml');
    const content = fs.readFileSync(configPath, 'utf-8');
    const match = content.match(/access_token\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  } catch {
    // config not found — that's fine in dev
  }

  return '';
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------

function getRendererEntry() {
  return path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`);
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      spellcheck: false,
    },
  });

  // Allow iframes from the PocketPaw backend by relaxing CSP frame-ancestors.
  // The backend sends `frame-ancestors 'self'` which blocks embedding from
  // the Electron renderer's dev-server origin.  This is safe because we
  // control both the renderer and the backend.
  mainWindow.webContents.session.webRequest.onHeadersReceived(
    { urls: [`${BACKEND_BASE_URL}/*`] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      // Remove CSP headers that block framing
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'content-security-policy' ||
            key.toLowerCase() === 'x-frame-options') {
          delete headers[key];
        }
      }
      callback({ responseHeaders: headers });
    },
  );

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(getRendererEntry());
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

function setupDesktopIpc() {
  ipcMain.handle('desktop:get-platform', () => process.platform);
  ipcMain.handle('desktop:get-version', () => app.getVersion());
  ipcMain.handle('desktop:open-external', async (_event, url: string) => {
    await shell.openExternal(url);
  });
  ipcMain.handle('desktop:window-minimize', () => {
    mainWindow?.minimize();
  });
  ipcMain.handle('desktop:window-maximize-toggle', () => {
    if (!mainWindow) {
      return false;
    }

    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return false;
    }

    mainWindow.maximize();
    return true;
  });
  ipcMain.handle('desktop:window-close', () => {
    mainWindow?.close();
  });

  // PocketPaw backend IPC
  ipcMain.handle('pocketpaw:get-api-base-url', () => BACKEND_BASE_URL);
  ipcMain.handle('pocketpaw:get-access-token', () => getAccessToken());
  ipcMain.handle('pocketpaw:get-backend-status', () => backendStatus);
  ipcMain.handle('pocketpaw:get-ws-url', () => BACKEND_BASE_URL.replace(/^http/, 'ws') + '/api/v1/ws');
  ipcMain.handle('pocketpaw:read-oauth-tokens', () => readStoredOAuthTokens());
  ipcMain.handle('pocketpaw:start-oauth-flow', () => startOAuthFlow());
  ipcMain.handle('pocketpaw:refresh-oauth-tokens', () => refreshStoredOAuthTokens());
  ipcMain.handle('pocketpaw:clear-oauth-tokens', () => clearStoredOAuthTokens());

  // Exchange access token for session cookie (for WebSocket cookie auth).
  // Done from main process to avoid CORS issues in production builds.
  ipcMain.handle('pocketpaw:login-for-session', async (_event, submittedToken?: string) => {
    const token = submittedToken || getAccessToken();
    if (!token) return { ok: false, error: 'No access token' };
    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (response.ok) {
        // Forward the Set-Cookie header to the renderer's session
        const setCookie = response.headers.get('set-cookie');
        if (setCookie && mainWindow) {
          // Parse cookie value and set it on the renderer session
          const match = setCookie.match(/pocketpaw_session=([^;]+)/);
          if (match) {
            const url = BACKEND_BASE_URL;
            await mainWindow.webContents.session.cookies.set({
              url,
              name: 'pocketpaw_session',
              value: match[1],
              httpOnly: true,
              path: '/',
            });
          }
        }
        return { ok: true };
      }
      return { ok: false, error: `HTTP ${response.status}` };
    } catch (err: unknown) {
      return { ok: false, error: (err as Error).message };
    }
  });

  // Open an extension in a child BrowserWindow
  ipcMain.handle(
    'pocketpaw:open-extension',
    (_event, payload: { url: string; title: string }) => {
      const extWindow = new BrowserWindow({
        width: 1024,
        height: 720,
        title: payload.title,
        autoHideMenuBar: true,
        backgroundColor: '#1a1a1a',
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });

      extWindow.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url);
        return { action: 'deny' };
      });

      void extWindow.loadURL(payload.url);
      return true;
    },
  );
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  setupDesktopIpc();
  startBackend();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  stopBackend();
});
