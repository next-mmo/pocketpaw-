(function () {
    const state = {
        context: null,
        readyResolve: null,
        readyPromise: null,
    };

    function ensureReadyPromise() {
        if (!state.readyPromise) {
            state.readyPromise = new Promise((resolve) => {
                state.readyResolve = resolve;
            });
        }
        return state.readyPromise;
    }

    function post(type, payload = {}) {
        window.parent.postMessage({ type, payload }, window.location.origin);
    }

    async function refreshContext() {
        state.readyPromise = new Promise((resolve) => {
            state.readyResolve = resolve;
        });
        post('pocketpaw-extension:refresh-token');
        return state.readyPromise;
    }

    async function request(path, options = {}, retry = true) {
        const context = await api.ready();
        const headers = new Headers(options.headers || {});
        headers.set('Authorization', `Bearer ${context.token}`);
        if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
            headers.set('Content-Type', 'application/json');
        }

        const resp = await fetch(`${context.apiBase}${path}`, { ...options, headers });
        if (resp.status === 401 && retry) {
            await refreshContext();
            return request(path, options, false);
        }
        if (!resp.ok) {
            throw new Error(`PocketPaw extension request failed: ${resp.status}`);
        }
        return resp;
    }

    async function streamChat(body, handlers = {}) {
        const resp = await request('/chat/stream', {
            method: 'POST',
            body: JSON.stringify(body),
        });

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        function emit(eventName, dataText) {
            let parsed = {};
            try {
                parsed = JSON.parse(dataText || '{}');
            } catch (_error) {
                parsed = {};
            }
            if (handlers.onEvent) handlers.onEvent(eventName, parsed);
            if (eventName === 'chunk' && handlers.onChunk) handlers.onChunk(parsed);
            if (eventName === 'stream_end' && handlers.onEnd) handlers.onEnd(parsed);
            if (eventName === 'error' && handlers.onError) handlers.onError(parsed);
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let boundary = buffer.indexOf('\n\n');
            while (boundary !== -1) {
                const block = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);

                const lines = block.split('\n');
                const eventLine = lines.find((line) => line.startsWith('event:'));
                const dataLine = lines.find((line) => line.startsWith('data:'));
                if (eventLine && dataLine) {
                    emit(
                        eventLine.slice('event:'.length).trim(),
                        dataLine.slice('data:'.length).trim()
                    );
                }

                boundary = buffer.indexOf('\n\n');
            }
        }
    }

    /**
     * Subscribe to SSE events from a given endpoint.
     * Returns an object with an `abort()` method.
     */
    function subscribeSSE(path, handlers = {}) {
        const controller = new AbortController();

        (async () => {
            try {
                const resp = await request(path, { signal: controller.signal });
                const reader = resp.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });

                    let boundary = buffer.indexOf('\n\n');
                    while (boundary !== -1) {
                        const block = buffer.slice(0, boundary);
                        buffer = buffer.slice(boundary + 2);

                        if (block.startsWith(':')) continue; // keepalive comment

                        const lines = block.split('\n');
                        const eventLine = lines.find((l) => l.startsWith('event:'));
                        const dataLine = lines.find((l) => l.startsWith('data:'));
                        if (eventLine && dataLine) {
                            const eventName = eventLine.slice('event:'.length).trim();
                            let parsed = {};
                            try {
                                parsed = JSON.parse(dataLine.slice('data:'.length).trim());
                            } catch (_) {}
                            if (handlers.onEvent) handlers.onEvent(eventName, parsed);
                        }

                        boundary = buffer.indexOf('\n\n');
                    }
                }
            } catch (err) {
                if (err.name !== 'AbortError' && handlers.onError) {
                    handlers.onError(err);
                }
            }
        })();

        return { abort: () => controller.abort() };
    }

    const api = {
        async ready() {
            const promise = ensureReadyPromise();
            if (!state.context) {
                post('pocketpaw-extension:ready');
            }
            return promise;
        },

        async getContext() {
            return api.ready();
        },

        // ── Storage ────────────────────────────────────────────────
        // Scopes: storage.read, storage.write

        storage: {
            async list() {
                const resp = await request('/storage');
                return resp.json();
            },

            async get(key) {
                const resp = await request(`/storage/${encodeURIComponent(key)}`);
                const data = await resp.json();
                return data.exists ? data.value : null;
            },

            async set(key, value) {
                const resp = await request(`/storage/${encodeURIComponent(key)}`, {
                    method: 'PUT',
                    body: JSON.stringify({ value }),
                });
                return resp.json();
            },

            async delete(key) {
                const resp = await request(`/storage/${encodeURIComponent(key)}`, {
                    method: 'DELETE',
                });
                return resp.json();
            },
        },

        // ── Chat ───────────────────────────────────────────────────
        // Scopes: chat.send, chat.stream

        chat: {
            async send(content, options = {}) {
                const resp = await request('/chat', {
                    method: 'POST',
                    body: JSON.stringify({
                        content,
                        session_id: options.sessionId || null,
                        media: options.media || null,
                    }),
                });
                return resp.json();
            },

            async stream(content, options = {}, handlers = {}) {
                return streamChat(
                    {
                        content,
                        session_id: options.sessionId || null,
                        media: options.media || null,
                    },
                    handlers
                );
            },
        },

        // ── Sessions ───────────────────────────────────────────────
        // Scopes: sessions.read

        sessions: {
            async list(limit = 50) {
                const resp = await request(`/sessions?limit=${encodeURIComponent(limit)}`);
                return resp.json();
            }
        },

        // ── Reminders ──────────────────────────────────────────────
        // Scopes: reminders.read, reminders.write
        //
        // Examples:
        //   const list = await sdk.reminders.list();
        //   const r = await sdk.reminders.create('in 30 minutes to buy milk');
        //   await sdk.reminders.delete(r.id);

        reminders: {
            async list() {
                const resp = await request('/reminders');
                return resp.json();
            },

            async create(message) {
                const resp = await request('/reminders', {
                    method: 'POST',
                    body: JSON.stringify({ message }),
                });
                return resp.json();
            },

            async delete(id) {
                const resp = await request(`/reminders/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                });
                return resp.json();
            },
        },

        // ── Intentions (Scheduled AI Tasks) ────────────────────────
        // Scopes: intentions.read, intentions.write
        //
        // Examples:
        //   const list = await sdk.intentions.list();
        //   const intent = await sdk.intentions.create({
        //     name: 'Daily standup summary',
        //     prompt: 'Summarize my tasks for today',
        //     trigger: { schedule: 'cron', cron: '0 9 * * *' },
        //   });
        //   await sdk.intentions.toggle(intent.id);
        //   await sdk.intentions.run(intent.id);
        //   await sdk.intentions.delete(intent.id);

        intentions: {
            async list() {
                const resp = await request('/intentions');
                return resp.json();
            },

            async create(data) {
                const resp = await request('/intentions', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                return resp.json();
            },

            async update(id, data) {
                const resp = await request(`/intentions/${encodeURIComponent(id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify(data),
                });
                return resp.json();
            },

            async delete(id) {
                const resp = await request(`/intentions/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                });
                return resp.json();
            },

            async toggle(id) {
                const resp = await request(`/intentions/${encodeURIComponent(id)}/toggle`, {
                    method: 'POST',
                });
                return resp.json();
            },

            async run(id) {
                const resp = await request(`/intentions/${encodeURIComponent(id)}/run`, {
                    method: 'POST',
                });
                return resp.json();
            },
        },

        // ── Long-term Memory ───────────────────────────────────────
        // Scopes: memory.read, memory.write
        //
        // Examples:
        //   const memories = await sdk.memory.list();
        //   await sdk.memory.delete(memories[0].id);

        memory: {
            async list(limit = 50) {
                const resp = await request(`/memory?limit=${encodeURIComponent(limit)}`);
                return resp.json();
            },

            async delete(id) {
                const resp = await request(`/memory/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                });
                return resp.json();
            },
        },

        // ── Skills ─────────────────────────────────────────────────
        // Scopes: skills.read
        //
        // Examples:
        //   const skills = await sdk.skills.list();
        //   console.log(skills.map(s => s.name));

        skills: {
            async list() {
                const resp = await request('/skills');
                return resp.json();
            },
        },

        // ── Health & Version ───────────────────────────────────────
        // Scopes: health.read
        //
        // Examples:
        //   const h = await sdk.health.status();
        //   const v = await sdk.health.version();

        health: {
            async status() {
                const resp = await request('/health');
                return resp.json();
            },

            async version() {
                const resp = await request('/version');
                return resp.json();
            },
        },

        // ── Events (real-time SSE) ─────────────────────────────────
        // Scopes: events.read
        //
        // Examples:
        //   const sub = sdk.events.subscribe({
        //     onEvent(type, data) {
        //       console.log('Event:', type, data);
        //     },
        //     onError(err) {
        //       console.error('SSE error:', err);
        //     },
        //   });
        //   // Later: sub.abort();

        events: {
            subscribe(handlers = {}) {
                return subscribeSSE('/events/stream', handlers);
            },
        },

        // ── Notifications (push toasts to dashboard) ──────────────
        // Scopes: notifications.write
        //
        // Inspired by OpenClaw: surface information in the dashboard
        // without requiring the user to be inside the extension's iframe.
        //
        // Examples:
        //   await sdk.notifications.send('Build Complete', 'Your model finished training', 'success');
        //   await sdk.notifications.broadcast('model_ready', { modelId: '...' });

        notifications: {
            async send(title, message = '', level = 'info', duration = 5000) {
                const resp = await request('/notifications', {
                    method: 'POST',
                    body: JSON.stringify({ title, message, level, duration }),
                });
                return resp.json();
            },

            async broadcast(event, data = {}) {
                const resp = await request('/broadcast', {
                    method: 'POST',
                    body: JSON.stringify({ event, data }),
                });
                return resp.json();
            },
        },

        // ── Commands (register slash commands from extensions) ─────
        // Scopes: commands.read, commands.write
        //
        // Inspired by OpenClaw's api.registerCommand(): register
        // auto-reply slash commands that run without invoking the AI.
        //
        // Examples:
        //   await sdk.commands.register({
        //     name: 'mycommand',
        //     description: 'Do something cool',
        //     response_text: 'Hello from my extension!',
        //   });
        //   const cmds = await sdk.commands.list();
        //   await sdk.commands.unregister('mycommand');

        commands: {
            async register(data) {
                const resp = await request('/commands', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                return resp.json();
            },

            async list() {
                const resp = await request('/commands');
                return resp.json();
            },

            async unregister(name) {
                const resp = await request(`/commands/${encodeURIComponent(name)}`, {
                    method: 'DELETE',
                });
                return resp.json();
            },
        },

        // ── Agent Tools (register tools for AI to use) ────────────
        // Scopes: tools.read, tools.write
        //
        // Inspired by OpenClaw's agent tool registration: extensions
        // can register tools that the AI agent can call.
        //
        // Examples:
        //   await sdk.tools.register({
        //     name: 'search_codebase',
        //     description: 'Search the project codebase for a pattern',
        //     parameters: [
        //       { name: 'query', type: 'string', description: 'Search query', required: true },
        //     ],
        //     webhook_url: 'http://localhost:8888/api/search',
        //   });
        //   const tools = await sdk.tools.list();
        //   await sdk.tools.unregister('search_codebase');

        tools: {
            async register(data) {
                const resp = await request('/tools', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                return resp.json();
            },

            async list() {
                const resp = await request('/tools');
                return resp.json();
            },

            async unregister(name) {
                const resp = await request(`/tools/${encodeURIComponent(name)}`, {
                    method: 'DELETE',
                });
                return resp.json();
            },
        },

        // ── Settings (read/write server configuration) ────────────
        // Scopes: settings.read, settings.write
        //
        // Examples:
        //   const settings = await sdk.settings.get();
        //   await sdk.settings.update({ plan_mode: true });

        settings: {
            async get() {
                const resp = await request('/settings');
                return resp.json();
            },

            async update(data) {
                const resp = await request('/settings', {
                    method: 'PATCH',
                    body: JSON.stringify(data),
                });
                return resp.json();
            },
        },

        // ── Config (per-extension configuration store) ────────────
        // Scopes: storage.read, storage.write (reuses storage scopes)
        //
        // Inspired by OpenClaw's configSchema: separate from
        // key-value storage, this is the extension's own config.json.
        //
        // Examples:
        //   const cfg = await sdk.config.get();
        //   await sdk.config.set({ theme: 'dark', interval: 30 });

        config: {
            async get() {
                const resp = await request('/config');
                return resp.json();
            },

            async set(config) {
                const resp = await request('/config', {
                    method: 'PUT',
                    body: JSON.stringify({ config }),
                });
                return resp.json();
            },
        },

        // ── Downloads (global download center) ─────────────────────
        // Scopes: downloads.read, downloads.write
        //
        // Extensions can register downloads they create, query existing
        // downloads, and update their status. All records show up in the
        // dashboard's global Download Center.
        //
        // Examples:
        //   const dl = await sdk.downloads.create({
        //     filename: 'model.gguf',
        //     url: 'https://example.com/model.gguf',
        //     size: 4_000_000_000,
        //     source: 'extension',
        //     source_label: 'Llama.cpp',
        //     status: 'downloading',
        //     progress: 0,
        //   });
        //   await sdk.downloads.update(dl.id, { progress: 50 });
        //   await sdk.downloads.update(dl.id, { status: 'completed', progress: 100 });
        //   const list = await sdk.downloads.list();
        //   await sdk.downloads.delete(dl.id);

        downloads: {
            async list(params = {}) {
                const qs = new URLSearchParams(params).toString();
                const resp = await request(`/downloads${qs ? '?' + qs : ''}`);
                return resp.json();
            },

            async get(id) {
                const resp = await request(`/downloads/${encodeURIComponent(id)}`);
                return resp.json();
            },

            async create(data) {
                const resp = await request('/downloads', {
                    method: 'POST',
                    body: JSON.stringify(data),
                });
                return resp.json();
            },

            async update(id, data) {
                const resp = await request(`/downloads/${encodeURIComponent(id)}`, {
                    method: 'PATCH',
                    body: JSON.stringify(data),
                });
                return resp.json();
            },

            async delete(id) {
                const resp = await request(`/downloads/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                });
                return resp.json();
            },

            async stats() {
                const resp = await request('/downloads/stats');
                return resp.json();
            },

            async clear(status) {
                const resp = await request('/downloads/clear', {
                    method: 'POST',
                    body: JSON.stringify(status ? { status } : {}),
                });
                return resp.json();
            },
        },

        // ── Host Actions ───────────────────────────────────────────
        // Scopes: host.navigate, host.open_chat

        host: {
            navigate(payload) {
                if (typeof payload === 'string') {
                    post('pocketpaw-extension:host:navigate', { route: payload });
                    return;
                }
                post('pocketpaw-extension:host:navigate', payload || {});
            },

            openChat(payload) {
                if (typeof payload === 'string') {
                    post('pocketpaw-extension:host:open-chat', { text: payload });
                    return;
                }
                post('pocketpaw-extension:host:open-chat', payload || {});
            }
        },

        // ── Plugins (DRY helpers for extension backends) ──────────
        //
        // Common patterns extracted so extensions don't re-implement:
        //   - API base detection (iframe-safe)
        //   - Plugin status polling
        //   - Plugin lifecycle (start / stop)
        //   - OpenAI-compatible streaming
        //
        // Examples:
        //   const base = sdk.plugins.getApiBase();
        //   const st   = await sdk.plugins.status('llama-cpp');
        //   await sdk.plugins.start('llama-cpp');
        //   await sdk.plugins.stop('llama-cpp');
        //   await sdk.plugins.pollUntilRunning('llama-cpp', 30000);
        //   await sdk.plugins.streamCompletion(url, headers, body, {
        //     onDelta(text) { console.log(text); },
        //     onDone() { console.log('done'); },
        //     onError(err) { console.error(err); },
        //   });

        plugins: {
            /**
             * Resolve the PocketPaw API base URL.
             * Works inside iframes and top-level windows.
             */
            getApiBase() {
                try {
                    if (window.parent !== window) {
                        return window.parent.location.origin;
                    }
                } catch (_e) { /* cross-origin */ }
                return window.location.origin;
            },

            /**
             * Get the status of a plugin by its ID.
             */
            async status(pluginId) {
                const base = api.plugins.getApiBase();
                const res = await fetch(`${base}/api/v1/plugins/${encodeURIComponent(pluginId)}/status`);
                if (!res.ok) throw new Error(`Plugin status error: ${res.status}`);
                return res.json();
            },

            /**
             * Start a plugin.
             */
            async start(pluginId) {
                const base = api.plugins.getApiBase();
                const res = await fetch(`${base}/api/v1/plugins/${encodeURIComponent(pluginId)}/start`, {
                    method: 'POST',
                });
                if (!res.ok) throw new Error(`Plugin start error: ${res.status}`);
                return res.json();
            },

            /**
             * Stop a plugin.
             */
            async stop(pluginId) {
                const base = api.plugins.getApiBase();
                const res = await fetch(`${base}/api/v1/plugins/${encodeURIComponent(pluginId)}/stop`, {
                    method: 'POST',
                });
                if (!res.ok) throw new Error(`Plugin stop error: ${res.status}`);
                return res.json();
            },

            /**
             * Poll until a plugin reaches "running" status.
             * Resolves with the status object or rejects on timeout.
             */
            async pollUntilRunning(pluginId, timeoutMs = 30000, intervalMs = 1000) {
                const start = Date.now();
                while (Date.now() - start < timeoutMs) {
                    const st = await api.plugins.status(pluginId);
                    if (st.status === 'running') return st;
                    if (st.status === 'error') throw new Error(st.error || 'Plugin errored');
                    await new Promise((r) => setTimeout(r, intervalMs));
                }
                throw new Error(`Plugin ${pluginId} did not start within ${timeoutMs}ms`);
            },

            /**
             * Stream an OpenAI-compatible chat completion response.
             * Works with local llama.cpp, OpenRouter, Codex, or any
             * OpenAI-compatible endpoint.
             *
             * @param {string} url - Full endpoint URL
             * @param {Record<string,string>} headers - Request headers
             * @param {object} body - Request body (will be JSON-stringified)
             * @param {object} handlers - { onDelta, onDone, onError, signal }
             * @returns {Promise<string>} Full accumulated response text
             */
            async streamCompletion(url, headers, body, handlers = {}) {
                const controller = handlers.signal ? undefined : new AbortController();
                const signal = handlers.signal || controller?.signal;

                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...headers },
                        body: JSON.stringify(body),
                        signal,
                    });

                    if (!res.ok) {
                        const errBody = await res.text().catch(() => '');
                        throw new Error(`Completion error (${res.status}): ${errBody.slice(0, 200)}`);
                    }

                    const reader = res.body?.getReader();
                    if (!reader) throw new Error('No response body');

                    const decoder = new TextDecoder();
                    let accumulated = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        const chunk = decoder.decode(value, { stream: true });
                        const lines = chunk.split('\n');

                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;
                            const data = line.slice(6).trim();
                            if (data === '[DONE]') continue;

                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices?.[0]?.delta?.content;
                                if (delta) {
                                    accumulated += delta;
                                    if (handlers.onDelta) handlers.onDelta(delta, accumulated);
                                }
                            } catch (_e) {
                                // skip parse errors
                            }
                        }
                    }

                    if (handlers.onDone) handlers.onDone(accumulated);
                    return accumulated;
                } catch (err) {
                    if (err.name === 'AbortError') {
                        if (handlers.onDone) handlers.onDone('');
                        return '';
                    }
                    if (handlers.onError) handlers.onError(err);
                    throw err;
                }
            },

            /**
             * Get the abort controller for use with streamCompletion.
             * Pass controller.signal as handlers.signal.
             */
            createAbortController() {
                return new AbortController();
            },
        }
    };

    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        const message = event.data || {};
        if (message.type !== 'pocketpaw-extension:context') return;

        state.context = message.payload;
        if (state.readyResolve) {
            state.readyResolve(message.payload);
            state.readyResolve = null;
        }
        state.readyPromise = Promise.resolve(message.payload);
        document.dispatchEvent(new CustomEvent('pocketpaw-extension:ready', { detail: message.payload }));
    });

    window.PocketPawExtensionSDK = api;
})();

