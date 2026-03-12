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

            // Slash command picker
            slashPicker: {
                open: false,
                selectedIndex: 0
            },

            // Composer assist (guided chat)
            composerAssist: {
                active: false,
                title: '',
                subtitle: '',
                summary: '',
                icon: 'sparkles',
                actions: [],
                examples: []
            },

            // Delete confirmation
            deleteConfirm: {
                active: false,
                displayText: '',
                sessionId: null
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
                    let content = this.streamingContent;
                    // Append AskUserQuestion option buttons if pending
                    if (this._pendingAskOptions && this._pendingAskOptions.length) {
                        const btns = this._pendingAskOptions.map(label => {
                            const escaped = label.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
                            return `<button class="ask-user-option" onclick="window._answerAskUser('${escaped.replace(/'/g, "\\'")}')">${escaped}</button>`;
                        }).join('');
                        content += `\n\n<div class="ask-user-options">${btns}</div>`;
                        this._pendingAskOptions = null;
                    }
                    this.addMessage('assistant', content);
                }
                this.isStreaming = false;
                this.isThinking = false;
                this.streamingContent = '';
                this._pendingAskOptions = null;

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
             * Store AskUserQuestion options — they get appended to the
             * final message in endStreaming() so nothing gets split.
             */
            showAskUserQuestion(question, options) {
                this._pendingAskOptions = (options || []).map((opt, i) => {
                    return typeof opt === 'string' ? opt : (opt.label || opt.text || `Option ${i + 1}`);
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

            /**
             * Send a chat message
             */
            sendMessage() {
                const text = this.inputText.trim();
                if (!text) return;

                // Check for skill command (starts with /)
                // Only intercept if the name matches a registered skill;
                // otherwise fall through to chat so CommandHandler picks it up
                // (e.g. /backend, /backends, /model, /tools, /help, etc.)
                if (text.startsWith('/')) {
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

                // Start streaming indicator
                this.startStreaming();

                // Send to server
                socket.chat(text);

                this.log(`You: ${text}`, 'info');
            },

            // ==================== Composer / Input Handling ====================

            /**
             * Handle form submit from the composer form.
             * Closes slash picker if open, otherwise sends the message.
             */
            handleComposerSubmit() {
                if (this.slashPicker.open) {
                    const suggestions = this.getSlashSuggestions();
                    if (suggestions.length > 0) {
                        this.applySlashSuggestion(suggestions[this.slashPicker.selectedIndex] || suggestions[0]);
                    }
                    return;
                }
                this.sendMessage();
            },

            /**
             * Handle keydown events on the chat input (slash picker navigation, etc.)
             */
            handleChatInputKeydown(e) {
                if (this.slashPicker.open) {
                    const suggestions = this.getSlashSuggestions();
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        this.slashPicker.selectedIndex = Math.min(
                            this.slashPicker.selectedIndex + 1,
                            suggestions.length - 1
                        );
                        return;
                    }
                    if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        this.slashPicker.selectedIndex = Math.max(
                            this.slashPicker.selectedIndex - 1,
                            0
                        );
                        return;
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        this.slashPicker.open = false;
                        return;
                    }
                    if (e.key === 'Tab') {
                        e.preventDefault();
                        if (suggestions.length > 0) {
                            this.applySlashSuggestion(suggestions[this.slashPicker.selectedIndex] || suggestions[0]);
                        }
                        return;
                    }
                }
            },

            /**
             * Handle input change on the chat input (detect slash commands).
             */
            handleChatInputChange() {
                const text = this.inputText;
                // Open slash picker when user types "/" at the start
                if (text === '/' || (text.startsWith('/') && !text.includes(' '))) {
                    this.slashPicker.open = true;
                    this.slashPicker.selectedIndex = 0;
                } else {
                    this.slashPicker.open = false;
                }
                // Sync composer assist state if active
                this.syncComposerAssistWithInput();
            },

            /**
             * Get placeholder text for the chat input.
             */
            getChatInputPlaceholder() {
                if (this.composerAssist.active) {
                    return 'Type your message or pick an action…';
                }
                return this.agentActive
                    ? 'Message PocketPaw (Agent Mode)'
                    : 'Message PocketPaw…';
            },

            /**
             * Get slash command suggestions based on current input.
             * Combines built-in commands with registered skills.
             */
            getSlashSuggestions() {
                const text = this.inputText.toLowerCase();
                const query = text.startsWith('/') ? text.slice(1) : text;

                // Built-in commands
                const builtins = [
                    { key: '/help', command: '/help', description: 'Show available commands', kind: 'builtin' },
                    { key: '/backend', command: '/backend', description: 'Switch or show current AI backend', kind: 'builtin' },
                    { key: '/backends', command: '/backends', description: 'List all available backends', kind: 'builtin' },
                    { key: '/model', command: '/model', description: 'Show or set the active model', kind: 'builtin' },
                    { key: '/tools', command: '/tools', description: 'List enabled tools', kind: 'builtin' },
                    { key: '/status', command: '/status', description: 'Show system status', kind: 'builtin' },
                    { key: '/clear', command: '/clear', description: 'Clear chat history', kind: 'builtin' },
                    { key: '/panic', command: '/panic', description: 'Emergency stop all operations', kind: 'builtin' },
                ];

                // Skills as slash commands
                const skillCommands = (this.skills || []).map(s => ({
                    key: '/' + s.name,
                    command: '/' + s.name,
                    description: s.description || 'Run skill',
                    kind: 'skill'
                }));

                const all = [...builtins, ...skillCommands];

                if (!query) return all;
                return all.filter(item =>
                    item.command.toLowerCase().includes(query) ||
                    item.description.toLowerCase().includes(query)
                );
            },

            /**
             * Apply a selected slash suggestion to the input.
             */
            applySlashSuggestion(item) {
                if (!item) return;
                this.inputText = item.command + ' ';
                this.slashPicker.open = false;
                this.focusChatComposer();
            },

            // ==================== Composer Assist ====================

            /**
             * Open the composer assist panel with guided chat data.
             */
            openComposerAssist(data) {
                this.composerAssist = {
                    active: true,
                    title: data.title || 'Guided Chat',
                    subtitle: data.subtitle || '',
                    summary: data.summary || '',
                    icon: data.icon || 'sparkles',
                    actions: data.actions || [],
                    examples: data.examples || []
                };
                this.$nextTick(() => {
                    if (window.refreshIcons) window.refreshIcons();
                });
            },

            /**
             * Dismiss the composer assist panel.
             */
            dismissComposerAssist() {
                this.composerAssist = {
                    active: false,
                    title: '',
                    subtitle: '',
                    summary: '',
                    icon: 'sparkles',
                    actions: [],
                    examples: []
                };
            },

            /**
             * Sync composer assist state based on current input text.
             * (e.g. dismiss assist if user clears the input)
             */
            syncComposerAssistWithInput() {
                // No-op for now — future: auto-dismiss or update based on input
            },

            /**
             * Run a composer assist action (insert text or execute command).
             */
            runComposerAssistAction(action) {
                if (!action) return;
                if (action.behavior === 'insert') {
                    this.inputText = action.value || action.label || '';
                    this.focusChatComposer();
                } else {
                    // 'run' behavior — send as chat message
                    const text = action.value || action.label || '';
                    if (text) {
                        this.inputText = text;
                        this.sendMessage();
                    }
                }
            },

            /**
             * Focus the chat input field.
             */
            focusChatComposer() {
                this.$nextTick(() => {
                    if (this.$refs.chatInput) {
                        this.$refs.chatInput.focus();
                    }
                });
            },

            // ==================== Delete Confirmation ====================

            /**
             * Show delete confirmation for a session.
             */
            confirmDeleteSession(sessionId, displayText) {
                this.deleteConfirm = {
                    active: true,
                    displayText: displayText || 'Delete this chat?',
                    sessionId: sessionId
                };
            },

            /**
             * Cancel delete confirmation.
             */
            cancelDelete() {
                this.deleteConfirm = {
                    active: false,
                    displayText: '',
                    sessionId: null
                };
            },

            /**
             * Confirm and execute the delete.
             */
            confirmDelete() {
                const sessionId = this.deleteConfirm.sessionId;
                this.cancelDelete();
                if (sessionId && typeof this.deleteSessionById === 'function') {
                    this.deleteSessionById(sessionId);
                }
            },

            // ==================== Agent & Streaming ====================

            /**
             * Stop in-flight response
             */
            stopResponse() {
                if (!this.isStreaming) return;
                socket.stopResponse();
                this.log('Stop requested', 'info');
            },

            /**
             * Toggle agent mode
             */
            toggleAgent() {
                socket.toggleAgent(this.agentActive);
                this.log(`Switched Agent Mode: ${this.agentActive ? 'ON' : 'OFF'}`, 'info');
            }
        };
    }
};

window.PocketPaw.Loader.register('Chat', window.PocketPaw.Chat);

// Global callback for AskUserQuestion option buttons.
// Sends the selected option as a normal chat message.
window._answerAskUser = function (answer) {
    // Remove all option buttons once one is picked
    document.querySelectorAll('.ask-user-options').forEach(el => {
        el.innerHTML = '<span style="opacity:0.5">Answered: ' + answer + '</span>';
    });
    const socket = window.socket;
    if (socket) {
        socket.chat(answer);
    }
};
