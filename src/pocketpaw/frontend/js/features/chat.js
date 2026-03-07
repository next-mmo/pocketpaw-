/**
 * PocketPaw - Chat Feature Module
 *
 * Created: 2026-02-05
 * Extracted from app.js as part of componentization refactor.
 *
 * Contains chat/messaging functionality:
 * - Message handling
 * - Streaming support
 * - Chat scroll management
 */

window.PocketPaw = window.PocketPaw || {};

window.PocketPaw.Chat = {
    name: 'Chat',
    /**
     * Get initial state for Chat
     */
    getState() {
        return {
            // Agent state
            agentActive: true,
            isStreaming: false,
            isThinking: false,
            streamingContent: '',
            streamingMessageId: null,
            hasShownWelcome: false,

            // Messages
            messages: [],
            inputText: '',

            // Guided composer state (used by extensions like Todo)
            composerAssist: {
                active: false,
                source: '',
                icon: 'sparkles',
                title: '',
                subtitle: '',
                summary: '',
                promptPrefix: '',
                actions: [],
                context: null,
            }
        };
    },

    /**
     * Get methods for Chat
     */
    getMethods() {
        return {
            /**
             * Handle notification
             */
            handleNotification(data) {
                const content = data.content || '';

                // Skip duplicate connection messages
                if (content.includes('Connected to PocketPaw') && this.hasShownWelcome) {
                    return;
                }
                if (content.includes('Connected to PocketPaw')) {
                    this.hasShownWelcome = true;
                }

                this.showToast(content, 'info');
                this.log(content, 'info');
            },

            /**
             * Handle incoming message
             */
            handleMessage(data) {
                const content = data.content || '';

                // Check if it's a status update (don't show in chat)
                if (content.includes('System Status') || content.includes('🧠 CPU:')) {
                    this.status = Tools.parseStatus(content);
                    return;
                }

                // Server-side stream flag — auto-enter streaming if we missed stream_start
                if (data.is_stream_chunk && !this.isStreaming) {
                    this.startStreaming();
                }

                // Clear thinking state on first text content
                if (this.isThinking && content) {
                    this.isThinking = false;
                }

                // Handle streaming vs complete messages
                if (this.isStreaming) {
                    this.streamingContent += content;
                    // Scroll during streaming to follow new content
                    this.$nextTick(() => this.scrollToBottom());
                    // Don't log streaming chunks - they flood the terminal
                } else {
                    this.addMessage('assistant', content);
                    // Only log complete messages (not streaming chunks)
                    if (content.trim()) {
                        this.log(content.substring(0, 100) + (content.length > 100 ? '...' : ''), 'info');
                    }
                }
            },

            /**
             * Handle code blocks
             */
            handleCode(data) {
                const content = data.content || '';
                if (this.isStreaming) {
                    this.streamingContent += '\n```\n' + content + '\n```\n';
                } else {
                    this.addMessage('assistant', '```\n' + content + '\n```');
                }
            },

            /**
             * Start streaming mode
             */
            startStreaming() {
                this.isStreaming = true;
                this.isThinking = true;
                this.streamingContent = '';
            },

            /**
             * End streaming mode
             */
            endStreaming() {
                if (this.isStreaming && this.streamingContent) {
                    this.addMessage('assistant', this.streamingContent);
                }
                this.isStreaming = false;
                this.isThinking = false;
                this.streamingContent = '';

                // Refresh sidebar sessions and auto-title
                if (this.loadSessions) this.loadSessions();
                if (this.autoTitleCurrentSession) this.autoTitleCurrentSession();
            },

            /**
             * Add a message to the chat
             */
            addMessage(role, content) {
                this.messages.push({
                    role,
                    content: content || '',
                    time: Tools.formatTime(),
                    isNew: true
                });

                // Auto scroll to bottom with slight delay for DOM update
                this.$nextTick(() => {
                    this.scrollToBottom();
                });
            },

            /**
             * Scroll chat to bottom
             */
            scrollToBottom() {
                if (this._scrollRAF) return;
                this._scrollRAF = requestAnimationFrame(() => {
                    const el = this.$refs.messages;
                    if (el) el.scrollTop = el.scrollHeight;
                    this._scrollRAF = null;
                });
            },

            openComposerAssist(payload = {}) {
                const actions = Array.isArray(payload.actions)
                    ? payload.actions
                        .map((action, index) => ({
                            key: action.key || `action-${index + 1}`,
                            label: String(action.label || action.title || '').trim(),
                            description: String(action.description || '').trim(),
                            command: String(action.command || action.text || '').trim(),
                        }))
                        .filter((action) => action.label && action.command)
                    : [];

                this.composerAssist = {
                    active: true,
                    source: String(payload.source || payload.kind || 'extension').trim(),
                    icon: String(payload.icon || 'sparkles').trim() || 'sparkles',
                    title: String(payload.title || 'Ready in chat').trim() || 'Ready in chat',
                    subtitle: String(
                        payload.subtitle || 'Pick a quick action or type in the composer.'
                    ).trim(),
                    summary: String(payload.summary || '').trim(),
                    promptPrefix: String(payload.prompt_prefix || payload.promptPrefix || '').trim(),
                    actions,
                    context: payload.context || null,
                };

                this.$nextTick(() => {
                    if (window.refreshIcons) window.refreshIcons();
                });
            },

            dismissComposerAssist() {
                this.composerAssist = {
                    active: false,
                    source: '',
                    icon: 'sparkles',
                    title: '',
                    subtitle: '',
                    summary: '',
                    promptPrefix: '',
                    actions: [],
                    context: null,
                };
            },

            getChatInputPlaceholder() {
                if (!this.composerAssist.active) {
                    return 'Type a message...';
                }

                const prefix = this.composerAssist.promptPrefix || '';
                if (prefix) {
                    return `Continue with ${prefix.trim()} or choose a quick action...`;
                }

                return 'Continue with the guided prompt or type your own request...';
            },

            buildChatMetadata(text, options = {}) {
                const assist = this.composerAssist;
                if (!assist.active || !assist.context) {
                    return {};
                }

                const normalized = String(text || '').trim().toLowerCase();
                const prefix = (assist.promptPrefix || '').trim().toLowerCase();
                const shouldAttachAssist = options.forceAssist === true || (
                    normalized &&
                    (
                        !normalized.startsWith('/') ||
                        !prefix ||
                        normalized.startsWith(prefix)
                    )
                );

                if (!shouldAttachAssist) {
                    return {};
                }

                return {
                    extension_chat_source: assist.source || 'extension',
                    extension_chat_action: String(options.assistAction || '').trim() || null,
                    extension_chat_context: assist.context,
                };
            },

            runComposerAssistAction(action) {
                const command = String(action?.command || '').trim();
                if (!command) return;
                this.sendMessage({
                    text: command,
                    forceAssist: true,
                    assistAction: action.key || action.label || 'quick-action',
                });
            },

            /**
             * Send a chat message
             */
            sendMessage(options = {}) {
                const rawText = typeof options.text === 'string' ? options.text : this.inputText;
                const text = String(rawText || '').trim();
                if (!text) return;

                const outboundMeta = this.buildChatMetadata(text, options);

                // Check for skill command (starts with /)
                // Only intercept if the name matches a registered skill;
                // otherwise fall through to chat so CommandHandler picks it up
                // (e.g. /backend, /backends, /model, /tools, /help, etc.)
                if (text.startsWith('/') && !outboundMeta.extension_chat_context) {
                    const parts = text.slice(1).split(' ');
                    const skillName = parts[0];
                    const isSkill = (this.skills || []).some(
                        s => s.name.toLowerCase() === skillName.toLowerCase()
                    );

                    if (isSkill) {
                        const args = parts.slice(1).join(' ');
                        this.addMessage('user', text);
                        this.inputText = '';
                        socket.send('run_skill', { name: skillName, args });
                        this.log(`Running skill: /${skillName} ${args}`, 'info');
                        return;
                    }
                    // Not a skill — fall through to send as normal message
                }

                // Add user message
                this.addMessage('user', text);
                this.inputText = '';
                if (this.composerAssist.active) {
                    this.dismissComposerAssist();
                }

                // Start streaming indicator
                this.startStreaming();

                // Send to server
                socket.chat(text, outboundMeta);

                this.log(`You: ${text}`, 'info');
            },

            /**
             * Toggle agent mode
             */
            /**
             * Stop in-flight response
             */
            stopResponse() {
                if (!this.isStreaming) return;
                socket.stopResponse();
                this.log('Stop requested', 'info');
            },

            toggleAgent() {
                socket.toggleAgent(this.agentActive);
                this.log(`Switched Agent Mode: ${this.agentActive ? 'ON' : 'OFF'}`, 'info');
            }
        };
    }
};

window.PocketPaw.Loader.register('Chat', window.PocketPaw.Chat);
