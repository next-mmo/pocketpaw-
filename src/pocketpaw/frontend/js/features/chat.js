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
            slashPicker: {
                open: false,
                selectedIndex: 0,
            },

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

            focusChatComposer() {
                this.$nextTick(() => {
                    requestAnimationFrame(() => {
                        const input = this.$refs.chatInput
                            || document.querySelector('[aria-label="Chat message input"]');
                        if (input && typeof input.focus === 'function') {
                            input.focus({ preventScroll: true });
                            if (typeof input.setSelectionRange === 'function') {
                                const end = input.value.length;
                                input.setSelectionRange(end, end);
                            }
                        }
                    });
                });
            },

            getTodoSlashAssist() {
                return {
                    source: 'todo',
                    icon: 'list-todo',
                    title: 'Todo Copilot',
                    subtitle: (
                        'Pick a quick action or type after /todo. '
                        + 'Open the Todo app first if you want the current list attached automatically.'
                    ),
                    summary: 'Direct chat mode',
                    prompt_prefix: '/todo ',
                    actions: [
                        {
                            key: 'next',
                            label: 'What should I do next?',
                            description: 'Ask for prioritization without opening the app.',
                            command: '/todo what should I do next?',
                        },
                        {
                            key: 'plan',
                            label: 'Plan my day',
                            description: 'Turn your rough plan into a practical day plan.',
                            command: '/todo help me plan my day.',
                        },
                        {
                            key: 'workflow',
                            label: 'How should I use Todo?',
                            description: 'Get a quick workflow explanation.',
                            command: '/todo teach me how to use Todo well in chat.',
                        },
                        {
                            key: 'capture',
                            label: 'Turn ideas into tasks',
                            description: 'Convert rough notes into an actionable list.',
                            command: '/todo help me turn rough ideas into actionable tasks.',
                        },
                    ],
                    context: null,
                };
            },

            getSlashCommandCatalog() {
                const commands = [
                    {
                        key: 'todo',
                        command: '/todo',
                        description: 'Open Todo Copilot prompts. Use the Todo app for live task context.',
                        kind: 'App',
                        insertText: '/todo ',
                        priority: 0,
                        assist: this.getTodoSlashAssist(),
                    },
                    {
                        key: 'new',
                        command: '/new',
                        description: 'Start a fresh conversation session.',
                        kind: 'Command',
                        insertText: '/new',
                        priority: 1,
                    },
                    {
                        key: 'sessions',
                        command: '/sessions',
                        description: 'List your conversation sessions.',
                        kind: 'Command',
                        insertText: '/sessions',
                        priority: 2,
                    },
                    {
                        key: 'resume',
                        command: '/resume',
                        description: 'Resume a session by number or search text.',
                        kind: 'Command',
                        insertText: '/resume ',
                        priority: 3,
                    },
                    {
                        key: 'help',
                        command: '/help',
                        description: 'Show the built-in command reference.',
                        kind: 'Command',
                        insertText: '/help',
                        priority: 4,
                    },
                    {
                        key: 'clear',
                        command: '/clear',
                        description: 'Clear the current chat history.',
                        kind: 'Command',
                        insertText: '/clear',
                        priority: 5,
                    },
                    {
                        key: 'rename',
                        command: '/rename',
                        description: 'Rename the current session.',
                        kind: 'Command',
                        insertText: '/rename ',
                        priority: 6,
                    },
                    {
                        key: 'status',
                        command: '/status',
                        description: 'Show backend and session status.',
                        kind: 'Command',
                        insertText: '/status',
                        priority: 7,
                    },
                    {
                        key: 'delete',
                        command: '/delete',
                        description: 'Delete the current session.',
                        kind: 'Command',
                        insertText: '/delete',
                        priority: 8,
                    },
                    {
                        key: 'backend',
                        command: '/backend',
                        description: 'Show or switch the active backend.',
                        kind: 'Command',
                        insertText: '/backend ',
                        priority: 9,
                    },
                    {
                        key: 'backends',
                        command: '/backends',
                        description: 'List all available backends.',
                        kind: 'Command',
                        insertText: '/backends',
                        priority: 10,
                    },
                    {
                        key: 'model',
                        command: '/model',
                        description: 'Show or switch the active model.',
                        kind: 'Command',
                        insertText: '/model ',
                        priority: 11,
                    },
                    {
                        key: 'tools',
                        command: '/tools',
                        description: 'Show or switch the tool profile.',
                        kind: 'Command',
                        insertText: '/tools ',
                        priority: 12,
                    },
                ];

                const skillCommands = (this.skills || []).map((skill) => ({
                    key: `skill-${skill.name}`,
                    command: `/${skill.name}`,
                    description: skill.description || 'Run this installed skill.',
                    kind: 'Skill',
                    insertText: `/${skill.name} `,
                    priority: 50,
                }));

                return [...commands, ...skillCommands];
            },

            getSlashSuggestions(limit = 8) {
                const text = String(this.inputText || '').trimStart();
                if (!text.startsWith('/')) {
                    return [];
                }

                const slashToken = text.split(/\s+/, 1)[0];
                if (text.length > slashToken.length && /\s/.test(text.charAt(slashToken.length))) {
                    return [];
                }

                const query = slashToken.slice(1).toLowerCase();
                const searchNeedle = `/${query}`;
                return this.getSlashCommandCatalog()
                    .filter((item) => {
                        if (!query) return true;
                        return item.command.toLowerCase().includes(searchNeedle);
                    })
                    .sort((left, right) => {
                        const leftExact = left.command.toLowerCase() === searchNeedle ? 0 : 1;
                        const rightExact = right.command.toLowerCase() === searchNeedle ? 0 : 1;
                        if (leftExact !== rightExact) return leftExact - rightExact;

                        const leftPrefix = left.command.toLowerCase().startsWith(searchNeedle) ? 0 : 1;
                        const rightPrefix = right.command.toLowerCase().startsWith(searchNeedle) ? 0 : 1;
                        if (leftPrefix !== rightPrefix) return leftPrefix - rightPrefix;

                        if (left.priority !== right.priority) {
                            return left.priority - right.priority;
                        }
                        return left.command.localeCompare(right.command);
                    })
                    .slice(0, limit);
            },

            updateSlashPicker() {
                const suggestions = this.getSlashSuggestions();
                this.slashPicker.open = suggestions.length > 0;
                if (!this.slashPicker.open) {
                    this.slashPicker.selectedIndex = 0;
                    return;
                }

                if (this.slashPicker.selectedIndex >= suggestions.length) {
                    this.slashPicker.selectedIndex = 0;
                }
            },

            hideSlashPicker() {
                this.slashPicker.open = false;
                this.slashPicker.selectedIndex = 0;
            },

            handleChatInputChange() {
                this.updateSlashPicker();
            },

            handleChatInputKeydown(event) {
                if (!this.slashPicker.open) {
                    return;
                }

                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    this.moveSlashPicker(1);
                    return;
                }

                if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    this.moveSlashPicker(-1);
                    return;
                }

                if (event.key === 'Enter' || event.key === 'Tab') {
                    event.preventDefault();
                    this.applySlashSuggestion();
                    return;
                }

                if (event.key === 'Escape') {
                    event.preventDefault();
                    this.hideSlashPicker();
                }
            },

            moveSlashPicker(direction) {
                const suggestions = this.getSlashSuggestions();
                if (suggestions.length === 0) {
                    this.hideSlashPicker();
                    return;
                }

                const total = suggestions.length;
                this.slashPicker.selectedIndex = (
                    (this.slashPicker.selectedIndex + direction) % total + total
                ) % total;
            },

            applySlashSuggestion(item = null) {
                const suggestions = this.getSlashSuggestions();
                const selected = item || suggestions[this.slashPicker.selectedIndex] || null;
                if (!selected) {
                    this.hideSlashPicker();
                    return false;
                }

                this.inputText = selected.insertText || selected.command;
                this.hideSlashPicker();

                if (selected.assist) {
                    this.openComposerAssist(selected.assist);
                } else if (this.composerAssist.active && !this.composerAssist.context) {
                    this.dismissComposerAssist();
                }

                this.focusChatComposer();
                return true;
            },

            handleComposerSubmit() {
                if (this.slashPicker.open && this.getSlashSuggestions().length > 0) {
                    this.applySlashSuggestion();
                    return;
                }
                this.sendMessage();
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
                this.hideSlashPicker();

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

                this.hideSlashPicker();
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
