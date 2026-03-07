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

        sessions: {
            async list(limit = 50) {
                const resp = await request(`/sessions?limit=${encodeURIComponent(limit)}`);
                return resp.json();
            }
        },

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
