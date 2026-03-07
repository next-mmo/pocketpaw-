window.PocketPaw = window.PocketPaw || {};

window.PocketPaw.Extensions = {
    name: 'Extensions',

    getState() {
        return {
            extensionsHost: {
                items: [],
                errors: [],
                loading: false,
                reloading: false,
                activeRoute: '',
                activeId: '',
                session: null,
                frameSrc: '',
                initialized: false,
            }
        };
    },

    getMethods() {
        return {
            initExtensionHost() {
                if (this.extensionsHost.initialized) return;
                this.extensionsHost.initialized = true;

                window.addEventListener('message', (event) => {
                    this.handleExtensionMessage(event);
                });
            },

            async loadExtensions(force = false) {
                if (this.extensionsHost.loading) return;
                if (!force && this.extensionsHost.items.length > 0) {
                    if (this.extensionsHost.activeRoute) {
                        await this._selectExtensionByRoute(this.extensionsHost.activeRoute);
                    }
                    return;
                }

                this.extensionsHost.loading = true;
                try {
                    const resp = await fetch('/api/v1/extensions');
                    if (!resp.ok) throw new Error('Failed to load extensions');
                    const data = await resp.json();
                    this.extensionsHost.items = data.extensions || [];
                    this.extensionsHost.errors = data.errors || [];
                    this.$nextTick(() => {
                        if (window.refreshIcons) window.refreshIcons();
                    });

                    if (this.extensionsHost.activeRoute) {
                        await this._selectExtensionByRoute(this.extensionsHost.activeRoute);
                    } else {
                        const firstEnabled = this.extensionsHost.items.find(item => item.enabled);
                        if (firstEnabled) {
                            await this.navigateToExtension(firstEnabled);
                        }
                    }
                } catch (error) {
                    console.error('Failed to load extensions:', error);
                    this.extensionsHost.errors = [
                        { source: 'dashboard', message: error.message || 'Failed to load extensions' }
                    ];
                } finally {
                    this.extensionsHost.loading = false;
                }
            },

            async reloadExtensions() {
                this.extensionsHost.reloading = true;
                try {
                    const resp = await fetch('/api/v1/extensions/reload', { method: 'POST' });
                    if (!resp.ok) throw new Error('Failed to reload extensions');
                    const data = await resp.json();
                    this.extensionsHost.items = data.extensions || [];
                    this.extensionsHost.errors = data.errors || [];
                    this.$nextTick(() => {
                        if (window.refreshIcons) window.refreshIcons();
                    });
                    if (this.extensionsHost.activeRoute) {
                        await this._selectExtensionByRoute(this.extensionsHost.activeRoute);
                    }
                } catch (error) {
                    console.error('Failed to reload extensions:', error);
                    this.showToast('Failed to reload extensions', 'error');
                } finally {
                    this.extensionsHost.reloading = false;
                }
            },

            async setExtensionEnabled(extension, enabled, event) {
                if (event) event.stopPropagation();
                try {
                    const resp = await fetch(`/api/v1/extensions/${extension.id}/enabled`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enabled })
                    });
                    if (!resp.ok) throw new Error('Failed to update extension state');

                    await this.loadExtensions(true);
                    if (!enabled && this.extensionsHost.activeId === extension.id) {
                        this.extensionsHost.activeId = '';
                        this.extensionsHost.activeRoute = '';
                        this.extensionsHost.frameSrc = '';
                        this.extensionsHost.session = null;
                        this.updateHash('#/apps');
                    }
                } catch (error) {
                    console.error('Failed to update extension state:', error);
                    this.showToast('Failed to update extension state', 'error');
                }
            },

            async navigateToExtension(extensionOrRoute) {
                const route = typeof extensionOrRoute === 'string'
                    ? extensionOrRoute
                    : (extensionOrRoute?.route || '');

                this.view = 'extensions';
                this.extensionsHost.activeRoute = route;
                this.updateHash(route ? `#/apps/${route}` : '#/apps');
                await this.loadExtensions(false);
                await this._selectExtensionByRoute(route);
            },

            getActiveExtension() {
                return this.extensionsHost.items.find(item => item.id === this.extensionsHost.activeId) || null;
            },

            async ensureExtensionSession(extensionId, forceRefresh = false) {
                const current = this.extensionsHost.session;
                if (
                    !forceRefresh &&
                    current &&
                    current.extension?.id === extensionId &&
                    current.expiresAt > (Date.now() + 60_000)
                ) {
                    return current;
                }

                const resp = await fetch(`/api/v1/extensions/${extensionId}/session`, { method: 'POST' });
                if (!resp.ok) {
                    throw new Error('Failed to issue extension session');
                }
                const data = await resp.json();
                this.extensionsHost.session = {
                    extension: data.extension,
                    token: data.token,
                    apiBase: data.api_base,
                    expiresAt: (data.expires_at || 0) * 1000,
                    expiresInSeconds: data.expires_in_seconds || 0,
                };
                return this.extensionsHost.session;
            },

            async handleExtensionMessage(event) {
                if (event.origin !== window.location.origin) return;
                const frame = this.$refs.extensionFrame;
                if (!frame || event.source !== frame.contentWindow) return;

                const message = event.data || {};
                if (!message.type || typeof message.type !== 'string') return;

                if (message.type === 'pocketpaw-extension:ready') {
                    await this.postExtensionContext(true);
                    return;
                }

                if (message.type === 'pocketpaw-extension:refresh-token') {
                    await this.postExtensionContext(true);
                    return;
                }

                if (message.type === 'pocketpaw-extension:host:navigate') {
                    this._handleExtensionNavigate(message.payload || {});
                    return;
                }

                if (message.type === 'pocketpaw-extension:host:open-chat') {
                    this._handleExtensionOpenChat(message.payload || {});
                }
            },

            async postExtensionContext(forceRefresh = false) {
                const extension = this.getActiveExtension();
                const frame = this.$refs.extensionFrame;
                if (!extension || !frame?.contentWindow) return;

                const session = await this.ensureExtensionSession(extension.id, forceRefresh);
                const contextPayload = JSON.parse(JSON.stringify({
                    extension: session.extension,
                    token: session.token,
                    apiBase: session.apiBase,
                    tokenExpiresAt: session.expiresAt,
                    host: {
                        origin: window.location.origin,
                        appVersion: this.appVersion || '',
                        theme: 'dashboard-dark',
                        view: this.view,
                    }
                }));
                frame.contentWindow.postMessage(
                    {
                        type: 'pocketpaw-extension:context',
                        payload: contextPayload
                    },
                    window.location.origin
                );
            },

            _handleExtensionNavigate(payload) {
                if (typeof payload.hash === 'string' && payload.hash.startsWith('#')) {
                    this.updateHash(payload.hash);
                    return;
                }

                if (typeof payload.view === 'string') {
                    this.navigateToView(payload.view);
                    return;
                }

                if (typeof payload.route === 'string') {
                    if (payload.route.startsWith('#')) {
                        this.updateHash(payload.route);
                    } else if (payload.route.startsWith('/')) {
                        this.updateHash(`#${payload.route}`);
                    } else {
                        this.updateHash(`#/apps/${payload.route}`);
                    }
                }
            },

            _handleExtensionOpenChat(payload) {
                this.navigateToView('chat');
                const assist = payload.composer_assist || payload.assist || null;
                if (assist && typeof this.openComposerAssist === 'function') {
                    this.openComposerAssist(JSON.parse(JSON.stringify(assist)));
                }

                const fallbackText = assist?.prompt_prefix || assist?.promptPrefix || '';
                let text = String(payload.text || payload.message || fallbackText || '');
                const preserveTrailingSpace = /\s$/.test(text);
                text = text
                    .replace(/\r?\n+/g, ' ')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
                if (preserveTrailingSpace && text && !text.endsWith(' ')) {
                    text += ' ';
                }
                if (text) {
                    this.inputText = text;
                }
                this.$nextTick(() => {
                    let attempts = 0;
                    const focusComposer = () => {
                        attempts += 1;
                        const activeElement = document.activeElement;
                        if (activeElement && typeof activeElement.blur === 'function') {
                            activeElement.blur();
                        }
                        if (typeof window.focus === 'function') {
                            window.focus();
                        }
                        const input = this.$refs.chatInput
                            || document.querySelector('[aria-label="Chat message input"]');
                        if (input && typeof input.focus === 'function') {
                            input.focus({ preventScroll: true });
                            if (typeof input.setSelectionRange === 'function') {
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

            async _selectExtensionByRoute(route) {
                if (!route) return;
                if (this.extensionsHost.items.length === 0) return;

                const extension = this.extensionsHost.items.find(item => item.route === route);
                if (!extension) {
                    this.extensionsHost.activeId = '';
                    this.extensionsHost.frameSrc = '';
                    this.extensionsHost.session = null;
                    return;
                }

                this.extensionsHost.activeRoute = route;
                this.extensionsHost.activeId = extension.id;

                if (!extension.enabled) {
                    this.extensionsHost.frameSrc = '';
                    this.extensionsHost.session = null;
                    return;
                }

                const nextFrameSrc = `${extension.asset_base}?host=dashboard`;
                const frameWasAlreadyMounted = this.extensionsHost.frameSrc === nextFrameSrc;
                this.extensionsHost.frameSrc = nextFrameSrc;
                try {
                    await this.ensureExtensionSession(extension.id, false);
                    if (frameWasAlreadyMounted) {
                        await this.postExtensionContext(false);
                    }
                } catch (error) {
                    console.error('Failed to create extension session:', error);
                    this.showToast('Failed to open extension', 'error');
                }
            }
        };
    }
};

window.PocketPaw.Loader.register('Extensions', window.PocketPaw.Extensions);
