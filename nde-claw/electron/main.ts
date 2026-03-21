import * as path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { app, BrowserWindow, ipcMain, shell } from 'electron';

let mainWindow: BrowserWindow | null = null;
let backendProcess: ChildProcess | null = null;
let backendStatus: 'starting' | 'running' | 'stopped' | 'error' = 'stopped';

const BACKEND_PORT = 8888;
const BACKEND_BASE_URL = `http://127.0.0.1:${BACKEND_PORT}`;

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

  // Exchange access token for session cookie (for WebSocket cookie auth).
  // Done from main process to avoid CORS issues in production builds.
  ipcMain.handle('pocketpaw:login-for-session', async () => {
    const token = getAccessToken();
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
