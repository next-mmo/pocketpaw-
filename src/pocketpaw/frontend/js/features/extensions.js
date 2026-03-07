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
        openTabs: [],
        activeTabId: "",
        sessions: {},
        frameSrcs: {},
        initialized: false,
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
          this.$nextTick(() => {
            if (window.refreshIcons) window.refreshIcons();
          });
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
          this.$nextTick(() => {
            if (window.refreshIcons) window.refreshIcons();
          });
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
          });
        }

        // Prepare iframe src
        if (!this.extensionsHost.frameSrcs[extension.id]) {
          this.extensionsHost.frameSrcs[extension.id] =
            `${extension.asset_base}?host=dashboard`;
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
          if (window.refreshIcons) window.refreshIcons();
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

        this.$nextTick(() => {
          if (window.refreshIcons) window.refreshIcons();
        });
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
          this.postExtensionContext(false);
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

        // Find which iframe sent the message
        const activeExt = this.getActiveExtension();
        if (!activeExt) return;

        const frameId = `extensionFrame_${activeExt.id}`;
        const frame = document.getElementById(frameId);
        if (!frame || event.source !== frame.contentWindow) return;

        const message = event.data || {};
        if (!message.type || typeof message.type !== "string") return;

        if (message.type === "pocketpaw-extension:ready") {
          await this.postExtensionContext(true);
          return;
        }

        if (message.type === "pocketpaw-extension:refresh-token") {
          await this.postExtensionContext(true);
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

      async postExtensionContext(forceRefresh = false) {
        const extension = this.getActiveExtension();
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
    };
  },
};

window.PocketPaw.Loader.register("Extensions", window.PocketPaw.Extensions);
