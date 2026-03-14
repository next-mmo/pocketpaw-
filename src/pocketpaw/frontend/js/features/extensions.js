/**
 * PocketPaw - Extensions Feature Module (Browser-Tab Architecture)
 *
 * Provides a browser-like tabbed interface for extensions/apps.
 * - Dial-pad launcher at #/apps (grid of installed extensions)
 * - Each opened extension gets a closable browser tab
 * - Tabs can be reordered, closed, and deep-linked via hash
 *
 * State:
 *   extensionsHost.items        — all discovered extensions
 *   extensionsHost.errors       — load/parse errors
 *   extensionsHost.loading      — initial load spinner
 *   extensionsHost.reloading    — reload spinner
 *   extensionsHost.openTabs     — array of { id, route, name, icon } (open tabs)
 *   extensionsHost.activeTabId  — currently visible tab id ('' = launcher)
 *   extensionsHost.sessions     — Map-like object of extensionId → session
 *   extensionsHost.frameSrcs    — Map-like object of extensionId → frameSrc
 *   extensionsHost.initialized  — postMessage listener registered
 */
window.PocketPaw = window.PocketPaw || {};

window.PocketPaw.Extensions = {
  name: "Extensions",

  getState() {
    return {
      extensionsHost: {
        items: [],
        errors: [],
        loading: false,
        reloading: false,
        uploadingExtension: false,
        openTabs: [],
        activeTabId: "",
        sessions: {},
        frameSrcs: {},
        initialized: false,
        // Unified iframe lifecycle state per extension (all types)
        frameStates: {},
        // frameStates[id] = {
        //   status: 'loading'|'loaded'|'error',
        //   error: null|string,
        //   timeout: null  (timer ID)
        // }

        // Plugin install/start state per plugin_id
        pluginStates: {},
        // pluginStates[id] = {
        //   status: 'idle'|'installing'|'installed'|'starting'|'running'|'error'|'stopped'|'uninstalling',
        //   progress: 0.0-1.0,
        //   error: null|string,
        //   logs: [],
        //   pollTimer: null
        // }
      },
    };
  },

  getMethods() {
    return {
      // ── Lifecycle ────────────────────────────────────────

      initExtensionHost() {
        if (this.extensionsHost.initialized) return;
        this.extensionsHost.initialized = true;

        window.addEventListener("message", (event) => {
          this.handleExtensionMessage(event);
        });
      },

      // ── Data Loading ─────────────────────────────────────

      async loadExtensions(force = false) {
        if (this.extensionsHost.loading) return;
        if (!force && this.extensionsHost.items.length > 0) return;

        this.extensionsHost.loading = true;
        try {
          const resp = await fetch("/api/v1/extensions");
          if (!resp.ok) throw new Error("Failed to load extensions");
          const data = await resp.json();
          this.extensionsHost.items = data.extensions || [];
          this.extensionsHost.errors = data.errors || [];
          this._refreshIcons();
        } catch (error) {
          console.error("Failed to load extensions:", error);
          this.extensionsHost.errors = [
            {
              source: "dashboard",
              message: error.message || "Failed to load extensions",
            },
          ];
        } finally {
          this.extensionsHost.loading = false;
        }
      },

      async reloadExtensions() {
        this.extensionsHost.reloading = true;
        try {
          const resp = await fetch("/api/v1/extensions/reload", {
            method: "POST",
          });
          if (!resp.ok) throw new Error("Failed to reload extensions");
          const data = await resp.json();
          this.extensionsHost.items = data.extensions || [];
          this.extensionsHost.errors = data.errors || [];
          this._refreshIcons();
        } catch (error) {
          console.error("Failed to reload extensions:", error);
          this.showToast("Failed to reload extensions", "error");
        } finally {
          this.extensionsHost.reloading = false;
        }
      },

      async setExtensionEnabled(extension, enabled, event) {
        if (event) event.stopPropagation();
        try {
          const resp = await fetch(
            `/api/v1/extensions/${extension.id}/enabled`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ enabled }),
            },
          );
          if (!resp.ok) throw new Error("Failed to update extension state");

          await this.loadExtensions(true);
          if (!enabled) {
            this.closeAppTab(extension.id);
          }
        } catch (error) {
          console.error("Failed to update extension state:", error);
          this.showToast("Failed to update extension state", "error");
        }
      },

      // ── Tab Management ───────────────────────────────────

      /**
       * Open an extension as a tab. If already open, just switch to it.
       */
      async openAppTab(extensionOrRoute) {
        const route =
          typeof extensionOrRoute === "string"
            ? extensionOrRoute
            : extensionOrRoute?.route || "";

        if (!route) {
          this.switchToLauncher();
          return;
        }

        // Ensure extensions are loaded
        if (this.extensionsHost.items.length === 0) {
          await this.loadExtensions(false);
        }

        const extension = this.extensionsHost.items.find(
          (item) => item.route === route,
        );
        if (!extension) {
          console.warn(`Extension not found for route: ${route}`);
          this.switchToLauncher();
          return;
        }

        if (!extension.enabled) {
          this.showToast(
            `${extension.name} is disabled. Enable it first.`,
            "info",
          );
          this.switchToLauncher();
          return;
        }

        // Add tab if not already open
        const existingTab = this.extensionsHost.openTabs.find(
          (t) => t.id === extension.id,
        );
        if (!existingTab) {
          this.extensionsHost.openTabs.push({
            id: extension.id,
            route: extension.route,
            name: extension.name,
            icon: extension.icon || "app-window",
            isPlugin: extension.is_plugin || false,
            isUrlWrapper: extension.is_url_wrapper || false,
          });
        }

        // For plugin-type extensions, sync real server status then decide
        if (extension.is_plugin) {
          const ps = this._getPluginState(extension.id);

          // On fresh load (idle), fetch real status from server
          if (ps.status === 'idle') {
            await this._syncPluginStatus(extension.id);
          }

          if (!extension.is_installed && ps.status === 'idle') {
            // Not installed — show the install screen (no iframe yet)
            this.extensionsHost.activeTabId = extension.id;
            this.updateHash(`#/apps/${route}`);
            this._refreshIcons();
            return;
          }
          if (ps.status === 'installing' || ps.status === 'starting' || ps.status === 'uninstalling') {
            // Still in progress — show the install screen
            this.extensionsHost.activeTabId = extension.id;
            this.updateHash(`#/apps/${route}`);
            this._refreshIcons();
            return;
          }
        }

        // Prepare iframe src and start loading state.
        // For URL-type extensions, point iframe directly at the target URL
        // (no need for the webview.html passthrough — parent container handles lifecycle).
        if (!this.extensionsHost.frameSrcs[extension.id]) {
          const frameSrc = extension.is_url_wrapper && extension.url
            ? extension.url
            : `${extension.asset_base}?host=dashboard`;
          this.extensionsHost.frameSrcs[extension.id] = frameSrc;
          this._initFrameState(extension.id);
        }

        // Create session
        try {
          await this.ensureExtensionSession(extension.id, false);
        } catch (error) {
          console.error("Failed to create extension session:", error);
          this.showToast("Failed to open extension", "error");
        }

        // Switch to tab
        this.extensionsHost.activeTabId = extension.id;
        this.updateHash(`#/apps/${route}`);

        this.$nextTick(() => {
          this._refreshIcons();
          // Proactively push SDK context once the iframe is mounted.
          // Alpine renders the iframe async so we poll until it appears.
          this._pushContextWhenReady(extension.id);
        });
      },

      /**
       * Close a tab. If it's the active tab, switch to the next/previous tab or launcher.
       */
      closeAppTab(tabId, event) {
        if (event) {
          event.stopPropagation();
          event.preventDefault();
        }

        const tabs = this.extensionsHost.openTabs;
        const idx = tabs.findIndex((t) => t.id === tabId);
        if (idx === -1) return;

        const wasActive = this.extensionsHost.activeTabId === tabId;

        // Remove the tab
        tabs.splice(idx, 1);

        // Clean up session and frame
        delete this.extensionsHost.sessions[tabId];
        delete this.extensionsHost.frameSrcs[tabId];

        if (wasActive) {
          if (tabs.length > 0) {
            // Switch to adjacent tab
            const nextIdx = Math.min(idx, tabs.length - 1);
            this.extensionsHost.activeTabId = tabs[nextIdx].id;
            this.updateHash(`#/apps/${tabs[nextIdx].route}`);
          } else {
            this.switchToLauncher();
          }
        }

        this._refreshIcons();
      },

      /**
       * Switch to a specific tab by ID.
       */
      switchAppTab(tabId) {
        const tab = this.extensionsHost.openTabs.find((t) => t.id === tabId);
        if (!tab) return;
        this.extensionsHost.activeTabId = tabId;
        this.updateHash(`#/apps/${tab.route}`);

        // Post context to the newly active frame
        this.$nextTick(() => {
          this.postExtensionContext(false, tabId);
        });
      },


      /**
       * Switch back to the dial-pad launcher.
       */
      switchToLauncher() {
        this.extensionsHost.activeTabId = "";
        this.updateHash("#/apps");
      },

      /**
       * Check if the launcher/dial-pad is currently shown.
       */
      isLauncherActive() {
        return !this.extensionsHost.activeTabId;
      },

      /**
       * Navigate into the Apps view and open a specific extension.
       * Called from outside (e.g. sidebar, slash commands).
       */
      async navigateToExtension(extensionOrRoute) {
        this.view = "extensions";
        await this.loadExtensions(false);
        await this.openAppTab(extensionOrRoute);
      },

      // ── Helpers ──────────────────────────────────────────

      getActiveExtension() {
        if (!this.extensionsHost.activeTabId) return null;
        return (
          this.extensionsHost.items.find(
            (item) => item.id === this.extensionsHost.activeTabId,
          ) || null
        );
      },

      getActiveFrameSrc() {
        if (!this.extensionsHost.activeTabId) return "";
        return (
          this.extensionsHost.frameSrcs[this.extensionsHost.activeTabId] || ""
        );
      },

      getEnabledExtensions() {
        return this.extensionsHost.items.filter((item) => item.enabled);
      },

      getDisabledExtensions() {
        return this.extensionsHost.items.filter((item) => !item.enabled);
      },

      getBuiltinExtensions() {
        return this.extensionsHost.items.filter(
          (item) => item.source === "builtin",
        );
      },

      getUploadedExtensions() {
        return this.extensionsHost.items.filter(
          (item) => item.source === "external",
        );
      },

      // ── Iframe Lifecycle (unified for all extension types) ──

      /**
       * Initialize frame loading state for an extension.
       */
      _initFrameState(extId) {
        const existing = this.extensionsHost.frameStates[extId];
        if (existing?.timeout) clearTimeout(existing.timeout);
        this.extensionsHost.frameStates[extId] = {
          status: 'loading',
          error: null,
          timeout: null,
        };
        this._startFrameTimeout(extId);
      },

      /**
       * Get the frame state for an extension, initializing if needed.
       */
      getFrameState(extId) {
        return this.extensionsHost.frameStates[extId] || { status: 'loading', error: null };
      },

      /**
       * Called when an extension iframe fires its 'load' event.
       */
      onFrameLoad(extId) {
        const fs = this.extensionsHost.frameStates[extId];
        if (!fs) return;
        if (fs.timeout) clearTimeout(fs.timeout);
        fs.status = 'loaded';
        fs.timeout = null;
      },

      /**
       * Called when an extension iframe fails to load.
       */
      onFrameError(extId, errorMsg) {
        const fs = this.extensionsHost.frameStates[extId];
        if (!fs) return;
        if (fs.timeout) clearTimeout(fs.timeout);
        fs.status = 'error';
        fs.error = errorMsg || 'Failed to load extension';
        fs.timeout = null;
      },

      /**
       * Retry loading an extension iframe.
       */
      retryFrame(extId) {
        const frame = document.getElementById(`extensionFrame_${extId}`);
        const currentSrc = this.extensionsHost.frameSrcs[extId];
        if (frame && currentSrc) {
          this._initFrameState(extId);
          // Force reload by clearing and re-setting src
          frame.src = '';
          this.$nextTick(() => { frame.src = currentSrc; });
        }
      },

      /**
       * Start a timeout that marks the frame as loaded after 15s.
       * Optimistic: if iframe never fires load or error (e.g. cross-origin),
       * we reveal it anyway.
       */
      _startFrameTimeout(extId) {
        const fs = this.extensionsHost.frameStates[extId];
        if (!fs) return;
        fs.timeout = setTimeout(() => {
          if (fs.status === 'loading') {
            fs.status = 'loaded';
          }
        }, 15000);
      },

      /**
       * Activate a plugin's iframe — unified Mini Program Container activation.
       * Finds the extension, sets iframe src, inits frame state, creates session.
       */
      async _activatePluginFrame(pluginId) {
        const ext = this.extensionsHost.items.find(i => i.id === pluginId);
        if (!ext) return;
        this.extensionsHost.frameSrcs[pluginId] = `${ext.asset_base}?host=dashboard`;
        this._initFrameState(pluginId);
        try { await this.ensureExtensionSession(pluginId, false); } catch(e) {}
        this._refreshIcons();
      },

      /**
       * Schedule a Lucide icon refresh on the next Alpine tick.
       */
      _refreshIcons() {
        this.$nextTick(() => { if (window.refreshIcons) window.refreshIcons(); });
      },

      // ── Upload / Delete ───────────────────────────────────

      /**
       * Shared 409-conflict handler for extension uploads.
       * Returns true if the user confirmed the overwrite, false otherwise.
       */
      _handleUploadConflict(detail) {
        let extName = "";
        let promptMsg = "";

        if (detail.startsWith("overwrite_builtin_required:")) {
          extName = detail.replace("overwrite_builtin_required:", "");
          promptMsg =
            `"${extName}" is a built-in extension.\n\n` +
            `Uploading will override the built-in version with your custom one. ` +
            `You can restore the original by deleting the uploaded version later.\n\n` +
            `Continue?`;
        } else if (detail.startsWith("overwrite_required:")) {
          extName = detail.replace("overwrite_required:", "");
          promptMsg =
            `"${extName}" is already installed.\n\n` +
            `Do you want to replace it with the uploaded version?`;
        } else {
          throw new Error(detail || "Upload conflict");
        }

        return confirm(promptMsg);
      },

      /**
       * Shared post-upload handler — updates list and shows toast.
       */
      _handleUploadSuccess(data) {
        this.extensionsHost.items = data.extensions || [];
        this.extensionsHost.errors = data.errors || [];
        this.showToast("Extension installed successfully!", "success");
        this._refreshIcons();
      },

      triggerExtensionUpload() {
        const input = document.getElementById("extensionUploadInput");
        if (input) input.click();
      },

      async uploadExtension(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        // Reset input so the same file can be re-uploaded
        event.target.value = "";

        if (!file.name.toLowerCase().endsWith(".zip")) {
          this.showToast("Only .zip files are accepted", "error");
          return;
        }

        this.extensionsHost.uploadingExtension = true;
        try {
          await this._doUploadExtension(file, false);
        } catch (error) {
          console.error("Extension upload failed:", error);
          this.showToast(error.message || "Upload failed", "error");
        } finally {
          this.extensionsHost.uploadingExtension = false;
        }
      },

      async _doUploadExtension(file, force) {
        const formData = new FormData();
        formData.append("file", file);

        const url = force
          ? "/api/v1/extensions/upload?force=true"
          : "/api/v1/extensions/upload";

        const resp = await fetch(url, {
          method: "POST",
          body: formData,
        });

        if (resp.status === 409) {
          const err = await resp.json().catch(() => ({}));
          if (!this._handleUploadConflict(err.detail || "")) return;
          await this._doUploadExtension(file, true);
          return;
        }

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || "Upload failed");
        }

        this._handleUploadSuccess(await resp.json());
      },

      triggerFolderUpload() {
        const input = document.getElementById("extensionFolderInput");
        if (input) input.click();
      },

      async uploadExtensionFolder(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        // Reset input so the same folder can be re-selected
        event.target.value = "";

        // Collect files and strip the top-level folder prefix from paths
        // webkitRelativePath gives e.g. "counter-sample/extension.json"
        // We strip "counter-sample/" to get "extension.json"
        const fileList = Array.from(files);
        const firstPath = fileList[0]?.webkitRelativePath || "";
        const topFolder = firstPath.split("/")[0];

        // Verify extension.json exists in the selected folder
        const hasManifest = fileList.some((f) => {
          const rel = f.webkitRelativePath.replace(topFolder + "/", "");
          return rel === "extension.json";
        });

        if (!hasManifest) {
          this.showToast(
            "Selected folder does not contain an extension.json manifest",
            "error",
          );
          return;
        }

        this.extensionsHost.uploadingExtension = true;
        try {
          await this._doUploadFolder(fileList, topFolder, false);
        } catch (error) {
          console.error("Extension folder upload failed:", error);
          this.showToast(error.message || "Upload failed", "error");
        } finally {
          this.extensionsHost.uploadingExtension = false;
        }
      },

      async _doUploadFolder(fileList, topFolder, force) {
        const formData = new FormData();

        for (const file of fileList) {
          // Strip top-level folder name so "counter-sample/extension.json"
          // becomes "extension.json"
          const rel = file.webkitRelativePath.replace(topFolder + "/", "");
          formData.append("files", file, rel);
        }

        const url = force
          ? "/api/v1/extensions/upload-folder?force=true"
          : "/api/v1/extensions/upload-folder";

        const resp = await fetch(url, {
          method: "POST",
          body: formData,
        });

        if (resp.status === 409) {
          const err = await resp.json().catch(() => ({}));
          if (!this._handleUploadConflict(err.detail || "")) return;
          await this._doUploadFolder(fileList, topFolder, true);
          return;
        }

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || "Upload failed");
        }

        this._handleUploadSuccess(await resp.json());
      },

      async deleteExtension(extension, event) {
        if (event) event.stopPropagation();

        if (
          !confirm(
            `Remove "${extension.name}"? This will delete all extension files.`,
          )
        ) {
          return;
        }

        try {
          const resp = await fetch(`/api/v1/extensions/${extension.id}`, {
            method: "DELETE",
          });

          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || "Delete failed");
          }

          // Close tab if open
          this.closeAppTab(extension.id);

          // Reload list
          await this.loadExtensions(true);
          this.showToast(`"${extension.name}" removed`, "success");
        } catch (error) {
          console.error("Extension delete failed:", error);
          this.showToast(error.message || "Delete failed", "error");
        }
      },

      // ── Sessions ─────────────────────────────────────────

      async ensureExtensionSession(extensionId, forceRefresh = false) {
        const current = this.extensionsHost.sessions[extensionId];
        if (
          !forceRefresh &&
          current &&
          current.extension?.id === extensionId &&
          current.expiresAt > Date.now() + 60_000
        ) {
          return current;
        }

        const resp = await fetch(`/api/v1/extensions/${extensionId}/session`, {
          method: "POST",
        });
        if (!resp.ok) {
          throw new Error("Failed to issue extension session");
        }
        const data = await resp.json();
        const session = {
          extension: data.extension,
          token: data.token,
          apiBase: data.api_base,
          expiresAt: (data.expires_at || 0) * 1000,
          expiresInSeconds: data.expires_in_seconds || 0,
        };
        this.extensionsHost.sessions[extensionId] = session;
        return session;
      },

      // ── PostMessage Handling ─────────────────────────────

      async handleExtensionMessage(event) {
        if (event.origin !== window.location.origin) return;

        // Find which open extension tab sent this message by checking
        // all open frame windows (not just the active one).
        let sourceExtId = null;
        for (const tab of this.extensionsHost.openTabs) {
          const frame = document.getElementById(`extensionFrame_${tab.id}`);
          if (frame && event.source === frame.contentWindow) {
            sourceExtId = tab.id;
            break;
          }
        }
        if (!sourceExtId) return;

        const message = event.data || {};
        if (!message.type || typeof message.type !== "string") return;

        if (message.type === "pocketpaw-extension:ready") {
          await this.postExtensionContext(true, sourceExtId);
          return;
        }

        if (message.type === "pocketpaw-extension:refresh-token") {
          await this.postExtensionContext(true, sourceExtId);
          return;
        }

        if (message.type === "pocketpaw-extension:host:navigate") {
          this._handleExtensionNavigate(message.payload || {});
          return;
        }

        if (message.type === "pocketpaw-extension:host:open-chat") {
          this._handleExtensionOpenChat(message.payload || {});
        }
      },

      async postExtensionContext(forceRefresh = false, extensionId = null) {
        // Use the provided extensionId, or fall back to the active extension.
        const extension = extensionId
          ? this.extensionsHost.items.find((i) => i.id === extensionId)
          : this.getActiveExtension();
        if (!extension) return;

        const frameId = `extensionFrame_${extension.id}`;
        const frame = document.getElementById(frameId);
        if (!frame?.contentWindow) return;

        const session = await this.ensureExtensionSession(
          extension.id,
          forceRefresh,
        );
        const contextPayload = JSON.parse(
          JSON.stringify({
            extension: session.extension,
            token: session.token,
            apiBase: session.apiBase,
            tokenExpiresAt: session.expiresAt,
            host: {
              origin: window.location.origin,
              appVersion: this.appVersion || "",
              theme: "dashboard-dark",
              view: this.view,
            },
          }),
        );
        frame.contentWindow.postMessage(
          {
            type: "pocketpaw-extension:context",
            payload: contextPayload,
          },
          window.location.origin,
        );
      },

      /**
       * After openAppTab(), poll until the iframe element is in the DOM
       * then push the SDK context. This handles the race where the SDK
       * fires pocketpaw-extension:ready before Alpine has rendered the
       * <iframe> element, causing postExtensionContext to silently bail.
       */
      _pushContextWhenReady(extensionId, attempts = 0) {
        const maxAttempts = 40; // up to 4 seconds at 100ms intervals
        const frame = document.getElementById(`extensionFrame_${extensionId}`);
        if (frame?.contentWindow) {
          this.postExtensionContext(false, extensionId);
          return;
        }
        if (attempts < maxAttempts) {
          setTimeout(() => this._pushContextWhenReady(extensionId, attempts + 1), 100);
        }
      },

      _handleExtensionNavigate(payload) {
        if (typeof payload.hash === "string" && payload.hash.startsWith("#")) {
          this.updateHash(payload.hash);
          return;
        }

        if (typeof payload.view === "string") {
          this.navigateToView(payload.view);
          return;
        }

        if (typeof payload.route === "string") {
          if (payload.route.startsWith("#")) {
            this.updateHash(payload.route);
          } else if (payload.route.startsWith("/")) {
            this.updateHash(`#${payload.route}`);
          } else {
            this.openAppTab(payload.route);
          }
        }
      },

      _handleExtensionOpenChat(payload) {
        this.navigateToView("chat");
        const assist = payload.composer_assist || payload.assist || null;
        if (assist && typeof this.openComposerAssist === "function") {
          this.openComposerAssist(JSON.parse(JSON.stringify(assist)));
        }

        const fallbackText =
          assist?.prompt_prefix || assist?.promptPrefix || "";
        let text = String(
          payload.text || payload.message || fallbackText || "",
        );
        const preserveTrailingSpace = /\s$/.test(text);
        text = text
          .replace(/\r?\n+/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim();
        if (preserveTrailingSpace && text && !text.endsWith(" ")) {
          text += " ";
        }
        if (text) {
          this.inputText = text;
        }
        this.$nextTick(() => {
          let attempts = 0;
          const focusComposer = () => {
            attempts += 1;
            const activeElement = document.activeElement;
            if (activeElement && typeof activeElement.blur === "function") {
              activeElement.blur();
            }
            if (typeof window.focus === "function") {
              window.focus();
            }
            const input =
              this.$refs.chatInput ||
              document.querySelector('[aria-label="Chat message input"]');
            if (input && typeof input.focus === "function") {
              input.focus({ preventScroll: true });
              if (typeof input.setSelectionRange === "function") {
                const end = input.value.length;
                input.setSelectionRange(end, end);
              }
            }
            if (input && document.activeElement === input) {
              return;
            }
            if (attempts < 8) {
              setTimeout(focusComposer, 40);
            }
          };
          setTimeout(focusComposer, 40);
        });
      },

      /**
       * Legacy compat: _selectExtensionByRoute
       * Used by hash router to open an extension by route string.
       */
      async _selectExtensionByRoute(route) {
        if (!route) {
          this.switchToLauncher();
          return;
        }
        await this.openAppTab(route);
      },

      // ── Plugin Install / Start Flow ──────────────────────

      /**
       * Get or initialize the plugin state tracker for a given ID.
       */
      _getPluginState(pluginId) {
        if (!this.extensionsHost.pluginStates[pluginId]) {
          this.extensionsHost.pluginStates[pluginId] = {
            status: 'idle',
            progress: 0,
            error: null,
            logs: [],
            pollTimer: null,
          };
        }
        return this.extensionsHost.pluginStates[pluginId];
      },

      /**
       * Fetch the real plugin status from the server and sync local state.
       * Called on fresh page load to recover state for already-running plugins.
       */
      async _syncPluginStatus(pluginId) {
        try {
          const resp = await fetch(`/api/v1/plugins/${pluginId}/status`);
          if (!resp.ok) return;
          const data = await resp.json();
          const ps = this._getPluginState(pluginId);

          if (data.status === 'running' && data.port) {
            ps.status = 'running';
            ps.progress = 1;
            // Also set up the iframe src
            if (!this.extensionsHost.frameSrcs[pluginId]) {
              await this._activatePluginFrame(pluginId);
            }
          } else if (data.status === 'installing') {
            ps.status = 'installing';
            ps.progress = data.install_progress || 0;
            this._pollPluginStatus(pluginId);
          } else if (data.status === 'starting') {
            ps.status = 'starting';
            this._pollPluginStatus(pluginId);
          } else if (data.status === 'error') {
            ps.status = 'error';
            ps.error = data.error || 'Unknown error';
          } else if (data.status === 'stopped' && data.is_installed) {
            // Auto-start the daemon so the iframe doesn't hit 503 errors
            const ext = this.extensionsHost.items.find(i => i.id === pluginId);
            if (ext && ext.has_start) {
              ps.status = 'starting';
              ps.progress = 1;
              // Fire-and-forget start, then poll
              this.startPlugin(pluginId);
            } else {
              ps.status = 'installed';
              ps.progress = 1;
            }
          }
          // else leave as 'idle' (not installed)
        } catch (e) {
          console.warn('Failed to sync plugin status:', e);
        }
      },

      /**
       * Check if current active tab is a plugin that needs install.
       */
      activeTabNeedsInstall() {
        const tabId = this.extensionsHost.activeTabId;
        if (!tabId) return false;
        const ext = this.extensionsHost.items.find(i => i.id === tabId);
        if (!ext || !ext.is_plugin) return false;
        const ps = this._getPluginState(tabId);
        // If plugin is running, never show install screen
        if (ps.status === 'running') return false;
        // Show install screen for not-installed, installing, uninstalling, etc.
        return !ext.is_installed || ['idle', 'installing', 'uninstalling', 'installed', 'starting', 'stopped', 'error'].includes(ps.status);
      },

      /**
       * Get the plugin state for the currently active tab.
       */
      activePluginState() {
        const tabId = this.extensionsHost.activeTabId;
        if (!tabId) return null;
        return this._getPluginState(tabId);
      },

      /**
       * Get the extension data for the currently active tab.
       */
      activePluginExt() {
        const tabId = this.extensionsHost.activeTabId;
        if (!tabId) return null;
        return this.extensionsHost.items.find(i => i.id === tabId) || null;
      },

      /**
       * Install a plugin extension (calls /api/v1/plugins/{id}/install).
       */
      async installPlugin(pluginId) {
        const ps = this._getPluginState(pluginId);
        ps.status = 'installing';
        ps.progress = 0;
        ps.error = null;
        ps.logs = [];

        try {
          const resp = await fetch(`/api/v1/plugins/${pluginId}/install`, {
            method: 'POST',
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || 'Install request failed');
          }
          // Start polling for progress
          this._pollPluginStatus(pluginId);
        } catch (error) {
          console.error('Plugin install failed:', error);
          ps.status = 'error';
          ps.error = error.message;
        }
      },

      /**
       * Poll plugin status and logs during install/start.
       */
      _pollPluginStatus(pluginId) {
        const ps = this._getPluginState(pluginId);
        if (ps.pollTimer) clearInterval(ps.pollTimer);

        const poll = async () => {
          try {
            const [statusResp, logsResp] = await Promise.all([
              fetch(`/api/v1/plugins/${pluginId}/status`),
              fetch(`/api/v1/plugins/${pluginId}/logs?tail=50`),
            ]);

            if (statusResp.ok) {
              const data = await statusResp.json();
              ps.progress = data.install_progress || 0;

              if (data.status === 'installing' || data.status === 'starting') {
                ps.status = data.status;
              } else if (data.status === 'running') {
                ps.status = 'running';
                clearInterval(ps.pollTimer);
                ps.pollTimer = null;
                // Reload extensions list (is_installed may have changed)
                await this.loadExtensions(true);
                // Now load the iframe
                await this._activatePluginFrame(pluginId);
              } else if (data.status === 'stopped') {
                // Install finished (stopped = completed install, not yet started)
                ps.progress = 1;
                clearInterval(ps.pollTimer);
                ps.pollTimer = null;
                // Reload the extension list to get updated is_installed
                await this.loadExtensions(true);
                // Check if this plugin has a daemon to start
                const ext = this.extensionsHost.items.find(i => i.id === pluginId);
                if (ext && !ext.has_start) {
                  // No daemon needed — skip straight to iframe
                  ps.status = 'running';
                  await this._activatePluginFrame(pluginId);
                } else {
                  ps.status = 'installed';
                  this._refreshIcons();
                }
              } else if (data.status === 'error') {
                ps.status = 'error';
                ps.error = data.error || 'Unknown error';
                clearInterval(ps.pollTimer);
                ps.pollTimer = null;
              }
            }

            if (logsResp.ok) {
              const logData = await logsResp.json();
              ps.logs = logData.lines || [];
            }
          } catch (error) {
            console.error('Poll error:', error);
          }
        };

        // Immediate first poll, then every 2s
        poll();
        ps.pollTimer = setInterval(poll, 2000);
      },

      /**
       * Start a plugin daemon (calls /api/v1/plugins/{id}/start).
       */
      async startPlugin(pluginId) {
        const ps = this._getPluginState(pluginId);
        ps.status = 'starting';
        ps.error = null;

        try {
          const resp = await fetch(`/api/v1/plugins/${pluginId}/start`, {
            method: 'POST',
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || 'Start request failed');
          }
          // Poll until running
          this._pollPluginStatus(pluginId);
        } catch (error) {
          console.error('Plugin start failed:', error);
          ps.status = 'error';
          ps.error = error.message;
        }
      },

      /**
       * Skip the plugin install screen and load iframe directly.
       * Used for SPA-only plugins that don't need a backend daemon.
       */
      async skipPluginInstall(pluginId) {
        const ps = this._getPluginState(pluginId);
        ps.status = 'running';
        await this._activatePluginFrame(pluginId);

      },

      /**
       * Uninstall a plugin (stop daemon, delete venv, upstream, built assets).
       * Resets the plugin to pre-install state so it can be re-installed.
       */
      async uninstallPlugin(pluginId) {
        if (!confirm('Uninstall this plugin? This will delete its environment, cached data, and built assets. You can re-install later.')) return;

        const ps = this._getPluginState(pluginId);
        ps.status = 'uninstalling';
        ps.progress = 0;
        ps.error = null;

        try {
          const resp = await fetch(`/api/v1/plugins/${pluginId}/uninstall`, {
            method: 'POST',
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || 'Uninstall failed');
          }
          const data = await resp.json();

          // Reset plugin state to idle
          ps.status = 'idle';
          ps.progress = 0;
          ps.logs = [];

          // Clear iframe src
          delete this.extensionsHost.frameSrcs[pluginId];

          // Reload extensions list to update is_installed flag
          await this.loadExtensions(true);

          const removed = data.removed || [];
          this.showToast(`Uninstalled: ${removed.join(', ') || 'done'}`, 'success');
          this._refreshIcons();
        } catch (error) {
          console.error('Plugin uninstall failed:', error);
          ps.status = 'error';
          ps.error = error.message;
          this.showToast(error.message || 'Uninstall failed', 'error');
        }
      },

      /**
       * Reinstall a plugin (clean upstream + assets, re-run install steps).
       * Keeps venv to avoid re-downloading Python; refreshes source + frontend.
       */
      async reinstallPlugin(pluginId) {
        if (!confirm('Reinstall this plugin? This will re-download source and rebuild. Your models and venv will be preserved.')) return;

        const ps = this._getPluginState(pluginId);
        ps.status = 'installing';
        ps.progress = 0;
        ps.error = null;
        ps.logs = [];

        // Clear iframe src so the install screen shows
        delete this.extensionsHost.frameSrcs[pluginId];

        try {
          const resp = await fetch(`/api/v1/plugins/${pluginId}/update`, {
            method: 'POST',
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || 'Reinstall request failed');
          }
          // Start polling for progress (same as install)
          this._pollPluginStatus(pluginId);
        } catch (error) {
          console.error('Plugin reinstall failed:', error);
          ps.status = 'error';
          ps.error = error.message;
        }
      },
    };
  },
};

window.PocketPaw.Loader.register("Extensions", window.PocketPaw.Extensions);
