# Electron Hardening Guide

Security measures specific to Electron-based desktop apps.

## 1. ASAR Encryption

Default Electron packages code in readable `.asar` files. Encrypt them.

```bash
# Install asar encryption tool
npm install --save-dev @electron/asar
npm install --save-dev asar-encrypt

# Encrypt asar during build
npx asar-encrypt app.asar app.asar YOUR_ENCRYPTION_KEY
```

Better approach — use electron-builder with asar options:

```yaml
# electron-builder.yml
asar: true
asarUnpack:
  - "node_modules/native-addon/**"  # only unpack what must be native
```

## 2. Compile JS to V8 Bytecode

```bash
npm install bytenode

# Compile main process
npx bytenode -c src/main.js -o dist/main.jsc

# Compile preload scripts
npx bytenode -c src/preload.js -o dist/preload.jsc
```

Load bytecode in Electron:

```javascript
// loader.js (this small file remains readable — keep it minimal)
require('bytenode');
require('./main.jsc');
```

## 3. Disable DevTools in Production

```javascript
// main.js
const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    webPreferences: {
      devTools: !app.isPackaged,  // only in development
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Extra protection: catch keyboard shortcut
  if (app.isPackaged) {
    win.webContents.on('before-input-event', (event, input) => {
      // Block F12, Ctrl+Shift+I, Cmd+Option+I
      if (
        input.key === 'F12' ||
        (input.control && input.shift && input.key === 'I') ||
        (input.meta && input.alt && input.key === 'I')
      ) {
        event.preventDefault();
      }
    });
  }
}
```

## 4. Content Security Policy

```javascript
// main.js — set CSP headers
const { session } = require('electron');

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "connect-src 'self' https://your-api.com; " +
          "img-src 'self' data:;"
        ],
      },
    });
  });
});
```

## 5. Secure IPC Communication

```javascript
// preload.js — expose only what's needed
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Whitelist specific channels
  processData: (data) => ipcRenderer.invoke('process-data', data),
  getExportToken: () => ipcRenderer.invoke('get-export-token'),
  checkLicense: () => ipcRenderer.invoke('check-license'),

  // Never expose raw ipcRenderer
  // WRONG: send: (channel, data) => ipcRenderer.send(channel, data)
});
```

```javascript
// main.js — validate IPC inputs
const { ipcMain } = require('electron');

ipcMain.handle('process-data', async (event, data) => {
  // Validate sender
  if (event.senderFrame.url !== expectedUrl) {
    throw new Error('Unauthorized IPC call');
  }

  // Validate input
  if (typeof data !== 'object' || !data.type) {
    throw new Error('Invalid input');
  }

  return doProcessing(data);
});
```

## 6. Prevent Code Injection

```javascript
// main.js
const win = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,        // never enable in production
    contextIsolation: true,        // always enable
    sandbox: true,                 // enable sandboxing
    webSecurity: true,             // enforce same-origin
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
  },
});

// Block navigation to external sites
win.webContents.on('will-navigate', (event, url) => {
  const allowed = ['https://your-app.com', 'file://'];
  if (!allowed.some(a => url.startsWith(a))) {
    event.preventDefault();
  }
});

// Block new window creation
win.webContents.setWindowOpenHandler(({ url }) => {
  // Open external links in system browser, not Electron
  require('electron').shell.openExternal(url);
  return { action: 'deny' };
});
```

## 7. Auto-Update Security

```javascript
// Use signed updates only
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
autoUpdater.allowPrerelease = false;

// Verify update signature
autoUpdater.on('update-downloaded', (info) => {
  // electron-updater verifies code signing automatically
  // Make sure your builds are properly signed:
  // - Windows: code signing certificate
  // - macOS: Developer ID + notarization
  autoUpdater.quitAndInstall();
});
```

## 8. electron-builder Security Config

```yaml
# electron-builder.yml
appId: com.yourcompany.yourapp
productName: Your App

asar: true

mac:
  category: public.app-category.developer-tools
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  notarize: true

win:
  target: nsis
  signDllsAndExe: true
  certificateSubjectName: "Your Company"

linux:
  target: [AppImage, deb]

# Prevent including unnecessary files
files:
  - "dist/**/*"
  - "!src/**/*"       # don't ship source
  - "!**/*.map"       # don't ship sourcemaps
  - "!**/*.ts"        # don't ship TypeScript
  - "!node_modules/.cache/**/*"
```

## Checklist

Before shipping your Electron app:

- [ ] JS compiled to bytecode (bytenode)
- [ ] ASAR encrypted
- [ ] DevTools disabled in production
- [ ] CSP headers configured
- [ ] Context isolation enabled
- [ ] Node integration disabled
- [ ] Sandbox enabled
- [ ] IPC channels whitelisted
- [ ] Navigation restricted
- [ ] New window creation blocked
- [ ] Code signing configured (Windows + macOS)
- [ ] macOS notarization enabled
- [ ] Auto-updater uses signed updates
- [ ] Source maps excluded from build
- [ ] Source code excluded from build
